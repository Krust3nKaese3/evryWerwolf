/* DOM-Prüfung im Browser. Aufruf: node test/ui.test.js */
const assert = require('assert');
const http = require('http');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const types = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json'
};

function startServer() {
  const server = http.createServer(function (req, res) {
    const url = new URL(req.url, 'http://127.0.0.1');
    const file = path.join(root, decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname));
    if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404);
      res.end('no');
      return;
    }
    res.writeHead(200, { 'content-type': types[path.extname(file)] || 'text/plain' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise(function (resolve) {
    server.listen(0, '127.0.0.1', function () {
      resolve({ server: server, port: server.address().port });
    });
  });
}

function legacyState() {
  return {
    v: 1,
    screen: 'night',
    step: 'show',
    players: [
      { id: 1, name: 'Anna', role: 'dorfbewohner', alive: true, loverIds: [] },
      { id: 2, name: 'Bea', role: 'dorfbewohner', alive: true, loverIds: [] },
      { id: 3, name: 'xhdh', role: 'werwolf', alive: true, loverIds: [] },
      { id: 4, name: 'Chris', role: 'dorfbewohner', alive: true, loverIds: [] }
    ],
    order: [1, 2, 3, 4],
    cursor: 2,
    pass: 1,
    promptIndex: 0,
    prompts: [{ kind: 'wolf', target: 'house' }],
    selection: [],
    wolfVotes: {},
    nightNumber: 1,
    day: 1,
    mayorId: 1,
    log: [],
    counts: { werwolf: 1, dorfbewohner: 3 },
    nachUses: 1,
    config: { nachUses: 1 }
  };
}

async function main() {
  const pkg = require('/tmp/node_modules/playwright-core');
  const { chromium } = pkg;
  const started = await startServer();
  const browser = await chromium.launch({
    executablePath: '/usr/local/bin/google-chrome',
    args: ['--no-sandbox', '--disable-dev-shm-usage']
  });
  const base = 'http://127.0.0.1:' + started.port + '/index.html';
  try {
    await checkLegacy(browser, base);
    await checkFreshWolves(browser, base);
    await checkSetupPersists(browser, base);
    await checkUndoReveal(browser, base);
    await checkScores(browser, base);
  } finally {
    await browser.close();
    await new Promise(function (resolve) { started.server.close(resolve); });
  }
  console.log('ui ok');
}

async function open(browser, base, saved) {
  const page = await browser.newPage({ viewport: { width: 412, height: 915 } });
  const errors = [];
  page.on('pageerror', function (error) { errors.push(String(error)); });
  await page.addInitScript(function (payload) {
    window.EveryAppBridge = {
      storage: {
        get: async function (key) {
          if (key === 'werwolf.game.v1' && payload) return payload;
          return null;
        },
        set: async function () {},
        remove: async function () {}
      }
    };
  }, saved || null);
  await page.goto(base);
  await page.waitForSelector('#app h1');
  return { page: page, errors: errors };
}

async function checkLegacy(browser, base) {
  const opened = await open(browser, base, legacyState());
  const text = await opened.page.locator('#app').innerText();
  const buttons = await opened.page.locator('#app button').allInnerTexts();
  assert.ok(text.indexOf('Das Rudel wählt') >= 0, text);
  assert.ok(buttons.some(function (label) { return label.indexOf('Haus von Anna') >= 0; }), buttons.join('|'));
  assert.ok(buttons.some(function (label) { return label.indexOf('Fertig') >= 0; }), buttons.join('|'));
  assert.ok(buttons.length >= 4, 'keine leere Werwolf-Seite');
  assert.deepStrictEqual(opened.errors, []);
  await opened.page.locator('.choice', { hasText: 'Haus von Anna' }).click();
  await opened.page.getByRole('button', { name: 'Fertig' }).click();
  const after = await opened.page.locator('#app').innerText();
  assert.ok(after.indexOf('Wer ist wach') >= 0, after);
  await opened.page.close();
}

async function setCount(page, label, target) {
  const row = page.locator('.stepper', { hasText: label }).first();
  for (let i = 0; i < 8; i++) {
    const current = Number((await row.locator('strong').innerText()).trim());
    if (current === target) return;
    const dir = current > target ? 'weniger' : 'mehr';
    await row.locator('button[aria-label="' + label + ' ' + dir + '"]').click();
  }
  throw new Error('count ' + label);
}

async function checkFreshWolves(browser, base) {
  const opened = await open(browser, base, null);
  const page = opened.page;
  for (const name of ['Anna', 'Bea', 'Chris', 'Dora']) {
    await page.fill('#name-input', name);
    await page.locator('#name-form button').click();
  }
  await page.getByRole('button', { name: 'Weiter zu den Rollen' }).click();
  const pool = page.getByRole('button', { name: /Mehr Rollen als Spieler/ });
  if ((await pool.innerText()).includes('an')) await pool.click();
  await setCount(page, 'Werwolf', 1);
  await setCount(page, 'Dorfbewohner', 3);
  await setCount(page, 'Seherin', 0);
  await setCount(page, 'Hexe', 0);
  await page.getByRole('button', { name: 'Rollen verteilen' }).click();
  await revealEveryone(page);
  await page.getByRole('button', { name: 'Spiel starten' }).click();
  const wolfText = await reachWolf(page);
  assert.ok(wolfText.indexOf('Haus von') >= 0, wolfText);
  assert.ok((await page.locator('#app button').allInnerTexts()).some(function (label) { return label.indexOf('Fertig') >= 0; }));
  await page.close();

  const many = await open(browser, base, null);
  const pack = many.page;
  for (const name of ['Anna', 'Bea', 'Chris', 'Dora', 'Erik']) {
    await pack.fill('#name-input', name);
    await pack.locator('#name-form button').click();
  }
  await pack.getByRole('button', { name: 'Weiter zu den Rollen' }).click();
  const poolMany = pack.getByRole('button', { name: /Mehr Rollen als Spieler/ });
  if ((await poolMany.innerText()).includes('an')) await poolMany.click();
  await setCount(pack, 'Werwolf', 2);
  await setCount(pack, 'Dorfbewohner', 3);
  await setCount(pack, 'Seherin', 0);
  await setCount(pack, 'Hexe', 0);
  await pack.getByRole('button', { name: 'Rollen verteilen' }).click();
  await revealEveryone(pack);
  await pack.getByRole('button', { name: 'Spiel starten' }).click();
  await reachWolf(pack);
  const choices = pack.locator('#app .choice');
  await choices.nth(1).click();
  await pack.getByRole('button', { name: 'Fertig' }).click();
  const second = await reachWolf(pack);
  assert.ok(second.indexOf('Haus von') >= 0, second);
  assert.ok(second.indexOf('noch offen') >= 0, second);
  assert.ok(/Haus von /.test(second.replace('Das Rudel wählt ein Haus', '')), second);
  assert.deepStrictEqual(many.errors, []);
  await pack.close();
}

async function revealEveryone(page) {
  const start = page.getByRole('button', { name: 'Spiel starten' });
  for (let i = 0; i < 12 && await start.isDisabled(); i++) {
    const unseen = page.locator('button[data-act="reveal-pick"]:not(.seen)');
    if (!(await unseen.count())) break;
    await unseen.first().click();
    await page.getByRole('button', { name: 'Verstanden, verdecken' }).click();
  }
}

async function reachWolf(page) {
  for (let i = 0; i < 20; i++) {
    const text = await page.locator('#app').innerText();
    if (text.indexOf('Das Rudel wählt') >= 0) return text;
    if (text.indexOf('Wer ist wach') >= 0) {
      await page.locator('button[data-act="night-pick"]:not([disabled])').first().click();
      await page.getByRole('button', { name: 'Go' }).click();
      continue;
    }
    if (text.indexOf('Ich will gar nichts machen') >= 0) {
      await page.getByRole('button', { name: 'Ich will gar nichts machen' }).click();
      continue;
    }
    if (text.indexOf('Keinen Heiltrank') >= 0 || text.indexOf('Kein Gift') >= 0) {
      await page.locator('#app .btn.secondary').first().click();
      continue;
    }
    throw new Error('unerwarteter Screen\n' + text.slice(0, 300));
  }
  throw new Error('Werwolf nicht erreicht');
}

async function checkSetupPersists(browser, base) {
  const page = await browser.newPage({ viewport: { width: 412, height: 915 }, locale: 'de-DE' });
  await page.goto(base);
  for (const name of ['Anna', 'Bea', 'Chris', 'Dora']) {
    await page.fill('#name-input', name);
    await page.locator('#name-form button').click();
  }
  await page.getByRole('button', { name: 'Weiter zu den Rollen' }).click();
  const roles = await page.locator('#app').innerText();
  assert.ok(roles.indexOf('Gastgeberin') >= 0, roles);
  assert.strictEqual(roles.indexOf('Nutte'), -1);
  await setCount(page, 'Gastgeberin', 1);
  const pool = page.getByRole('button', { name: /Mehr Rollen als Spieler/ });
  if ((await pool.innerText()).includes('an')) await pool.click();
  await setCount(page, 'Werwolf', 2);
  const seer = page.getByRole('button', { name: /Seherin sieht genaue Rolle/ });
  if ((await seer.innerText()).includes('aus')) await seer.click();
  assert.ok((await seer.innerText()).includes('an'));
  await page.getByRole('button', { name: 'Zurück zu den Namen' }).click();
  await page.reload();
  await page.getByRole('button', { name: 'Weiter zu den Rollen' }).click();
  const again = page.getByRole('button', { name: /Seherin sieht genaue Rolle/ });
  assert.ok((await again.innerText()).includes('an'));
  assert.ok((await page.getByRole('button', { name: /Mehr Rollen als Spieler/ }).innerText()).includes('aus'));
  const wolves = Number((await page.locator('.stepper', { hasText: 'Werwolf' }).first().locator('strong').innerText()).trim());
  assert.strictEqual(wolves, 2);
  const stored = await page.evaluate(function () { return localStorage.getItem('werwolf.setup.v1'); });
  assert.ok(stored && stored.indexOf('"seerExact":true') >= 0, stored);
  assert.ok(stored.indexOf('"nutte":1') >= 0, stored);
  await page.close();
}

async function finishCard(page) {
  if (await page.getByText('Du bist Amor').count()) {
    const choices = page.locator('button[data-act="select"]');
    await choices.nth(0).click();
    await choices.nth(1).click();
    await page.getByRole('button', { name: 'Fertig' }).click();
    const cover = page.getByRole('button', { name: 'Verdecken' });
    if (await cover.count()) await cover.click();
    return;
  }
  await page.getByRole('button', { name: 'Verstanden, verdecken' }).click();
}

async function checkUndoReveal(browser, base) {
  const opened = await open(browser, base, null);
  const page = opened.page;
  for (const name of ['Anna', 'Bea', 'Chris', 'Dora']) {
    await page.fill('#name-input', name);
    await page.locator('#name-form button').click();
  }
  await page.getByRole('button', { name: 'Weiter zu den Rollen' }).click();
  const pool = page.getByRole('button', { name: /Mehr Rollen als Spieler/ });
  if ((await pool.innerText()).includes('an')) await pool.click();
  await setCount(page, 'Amor', 1);
  await setCount(page, 'Dorfbewohner', 2);
  await page.getByRole('button', { name: 'Rollen verteilen' }).click();
  await page.getByRole('button', { name: 'Zurück', exact: true }).click();
  await page.getByRole('button', { name: 'Rollen verteilen' }).waitFor();

  await page.getByRole('button', { name: 'Rollen verteilen' }).click();
  await page.locator('button[data-act="reveal-pick"]').first().click();
  await finishCard(page);
  await page.getByRole('button', { name: 'Zurück', exact: true }).click();
  await page.getByRole('button', { name: 'Rollen verteilen' }).waitFor();

  await page.getByRole('button', { name: 'Rollen verteilen' }).click();
  await page.locator('button[data-act="reveal-pick"]').nth(0).click();
  await finishCard(page);
  await page.locator('button[data-act="reveal-pick"]').nth(1).click();
  await finishCard(page);
  await page.getByRole('button', { name: 'Zurück', exact: true }).click();
  const ask = await page.locator('#app').innerText();
  assert.ok(ask.indexOf('Mehr als eine Person hat die Rolle schon gesehen') >= 0, ask);
  await page.getByRole('button', { name: 'Abbrechen' }).click();
  assert.ok((await page.locator('#app').innerText()).indexOf('Spiel starten') >= 0);
  await page.getByRole('button', { name: 'Zurück', exact: true }).click();
  await page.getByRole('button', { name: 'Ja, Rollen verwerfen' }).click();
  await page.getByRole('button', { name: 'Rollen verteilen' }).waitFor();
  const wolves = Number((await page.locator('.stepper', { hasText: 'Werwolf' }).first().locator('strong').innerText()).trim());
  assert.strictEqual(wolves, 1);
  const amor = Number((await page.locator('.stepper', { hasText: 'Amor' }).first().locator('strong').innerText()).trim());
  assert.strictEqual(amor, 1);
  assert.deepStrictEqual(opened.errors, []);
  await page.close();
}

async function checkScores(browser, base) {
  const page = await browser.newPage({ viewport: { width: 412, height: 915 }, locale: 'de-DE' });
  await page.addInitScript(function () {
    var ended = {
      v: 1,
      screen: 'end',
      winner: 'dorf',
      winReason: 'Test',
      scoresApplied: false,
      players: [
        { id: 1, name: 'Anna', role: 'dorfbewohner', alive: true, loverIds: [] },
        { id: 2, name: 'Bert', role: 'werwolf', alive: false, loverIds: [] }
      ],
      log: [],
      bonds: [],
      obit: [],
      mayorId: 1,
      selection: []
    };
    localStorage.setItem('werwolf.game.v1', JSON.stringify(ended));
    localStorage.setItem('werwolf.scores.v1', JSON.stringify({ Zara: 2 }));
  });
  await page.goto(base);
  await page.getByText('+1').waitFor();
  const text = await page.locator('#app').innerText();
  assert.ok(text.indexOf('Zara') >= 0 && text.indexOf('Anna') >= 0, text);
  assert.strictEqual(await page.locator('.rank.scored', { hasText: 'Anna' }).count(), 1);
  await page.getByRole('button', { name: 'Punkte zurücksetzen' }).click();
  await page.getByRole('button', { name: 'Abbrechen' }).click();
  assert.ok((await page.locator('#app').innerText()).indexOf('Zara') >= 0);
  await page.getByRole('button', { name: 'Punkte zurücksetzen' }).click();
  await page.getByRole('button', { name: 'Ja, Punkte zurücksetzen' }).click();
  await page.waitForFunction(function () { return document.body.innerText.indexOf('Zara') < 0; });
  const stored = await page.evaluate(function () { return localStorage.getItem('werwolf.scores.v1'); });
  assert.strictEqual(stored, '{}');
  await page.getByRole('button', { name: 'Home' }).click();
  const lobby = await page.locator('#app').innerText();
  assert.ok(lobby.indexOf('Punkte') >= 0);
  assert.ok(lobby.indexOf('Zara') < 0);
  await page.close();
}

main().catch(function (error) {
  console.error(error);
  process.exit(1);
});

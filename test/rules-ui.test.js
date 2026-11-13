/* Oberfläche für Startsperre, Namensliste, Amor und Punktespeicher. Aufruf: node test/rules-ui.test.js */
const assert = require('assert');
const http = require('http');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };

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

async function main() {
  const { chromium } = require('/tmp/node_modules/playwright-core');
  const started = await startServer();
  const browser = await chromium.launch({
    executablePath: '/usr/local/bin/google-chrome',
    args: ['--no-sandbox', '--disable-dev-shm-usage']
  });
  const base = 'http://127.0.0.1:' + started.port + '/index.html';
  try {
    await gateAndOrder(browser, base);
    await loveScreen(browser, base);
    await pointsStay(browser, base);
  } finally {
    await browser.close();
    await new Promise(function (resolve) { started.server.close(resolve); });
  }
  console.log('ui regeln ok');
}

function loveState() {
  return {
    v: 1,
    screen: 'night',
    step: 'show',
    nightNumber: 1,
    day: 0,
    mayorId: 1,
    activeId: 2,
    nightDone: [1],
    players: [
      { id: 1, name: 'Anna', role: 'amor', alive: true, loverIds: [], healsLeft: 0, poisonLeft: false, nachLeft: 0 },
      { id: 2, name: 'Bea', role: 'dorfbewohner', alive: true, loverIds: [3], healsLeft: 0, poisonLeft: false, nachLeft: 0 },
      { id: 3, name: 'Chris', role: 'werwolf', alive: true, loverIds: [2], healsLeft: 0, poisonLeft: false, nachLeft: 0 },
      { id: 4, name: 'Dora', role: 'dorfbewohner', alive: true, loverIds: [], healsLeft: 0, poisonLeft: false, nachLeft: 0 }
    ],
    prompts: [{ kind: 'love' }],
    promptIndex: 0,
    selection: [],
    seenLove: {},
    log: [],
    bonds: [[2, 3]],
    heals: [],
    hosts: {},
    wolfVotes: {},
    healPotions: 2,
    nachUses: 1
  };
}

async function gateAndOrder(browser, base) {
  const page = await browser.newPage({ viewport: { width: 412, height: 915 }, locale: 'de-DE' });
  const errors = [];
  page.on('pageerror', function (error) { errors.push(String(error)); });
  await page.goto(base);
  for (const name of ['Anna', 'Bea', 'Chris', 'Dora']) {
    await page.fill('#name-input', name);
    await page.locator('#name-form button').click();
  }
  await page.getByRole('button', { name: 'Weiter zu den Rollen' }).click();
  const pool = page.getByRole('button', { name: /Mehr Rollen als Spieler/ });
  if ((await pool.innerText()).includes('an')) await pool.click();
  await setCount(page, 'Werwolf', 1);
  await setCount(page, 'Amor', 1);
  await setCount(page, 'Dorfbewohner', 2);
  await setCount(page, 'Seherin', 0);
  await setCount(page, 'Hexe', 0);
  await page.getByRole('button', { name: 'Rollen verteilen' }).click();
  const start = page.getByRole('button', { name: 'Spiel starten' });
  assert.strictEqual(await start.isDisabled(), true);
  await page.locator('button[data-act="reveal-pick"]').first().click();
  await page.getByRole('button', { name: 'Verstanden, verdecken' }).click();
  await page.locator('button[data-act="reveal-pick"]').first().click();
  await page.getByRole('button', { name: 'Verstanden, verdecken' }).click();
  assert.strictEqual(await start.isDisabled(), true);
  for (let i = 0; i < 8 && await start.isDisabled(); i++) {
    const unseen = page.locator('button[data-act="reveal-pick"]:not(.seen)');
    if (!(await unseen.count())) break;
    await unseen.first().click();
    await page.getByRole('button', { name: 'Verstanden, verdecken' }).click();
  }
  assert.strictEqual(await start.isDisabled(), false);
  await start.click();
  await page.getByText('Wer ist wach').waitFor();
  const names = page.locator('button[data-act="night-pick"]:not([disabled])');
  const last = (await names.last().locator('.who').innerText()).trim();
  await names.last().click();
  await page.getByRole('button', { name: 'Zurück zur Liste' }).click();
  await names.first().click();
  await page.getByRole('button', { name: 'Go' }).click();
  const turn = await page.locator('#app').innerText();
  assert.ok(turn.indexOf('Wer ist wach') < 0, turn);
  assert.ok(last.length > 0);
  assert.ok(await page.locator('#app button').count() > 0);
  assert.deepStrictEqual(errors, []);
  await page.close();
}

async function loveScreen(browser, base) {
  const page = await browser.newPage({ viewport: { width: 412, height: 915 }, locale: 'de-DE' });
  await page.addInitScript(function (payload) {
    window.EveryAppBridge = {
      storage: {
        get: async function (key) { return key === 'werwolf.game.v1' ? payload : null; },
        set: async function () {},
        remove: async function () {}
      }
    };
  }, loveState());
  await page.goto(base);
  const text = await page.locator('#app').innerText();
  assert.ok(text.indexOf('Du bist verliebt') >= 0, text);
  assert.ok(text.indexOf('Chris') >= 0 && text.indexOf('Werwolf') >= 0, text);
  await page.close();
}

async function pointsStay(browser, base) {
  const page = await browser.newPage({ viewport: { width: 412, height: 915 }, locale: 'de-DE' });
  await page.goto(base);
  await page.evaluate(function () {
    localStorage.setItem('werwolf.scores.v1', JSON.stringify({ Zara: 3 }));
  });
  await page.reload();
  await page.getByRole('heading', { name: 'Punkte' }).waitFor();
  const text = await page.locator('#app').innerText();
  assert.ok(text.indexOf('Zara') >= 0, text);
  assert.ok(text.indexOf('3') >= 0, text);
  await page.close();
}

main().catch(function (error) {
  console.error(error);
  process.exit(1);
});

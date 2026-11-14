const assert = require('assert');
const fs = require('fs');
const path = require('path');

eval(fs.readFileSync(path.join(__dirname, '..', 'game.js'), 'utf8'));
const W = globalThis.Werwolf;

let passed = 0;
function test(name, fn) {
  fn();
  passed += 1;
  console.log('ok', name);
}

function rngZero() { return 0; }

function game(names, counts, nachUses, healPotions) {
  const state = W.createGame(names, counts || W.defaultCounts(names.length), {
    rng: rngZero,
    nachUses: nachUses || 1,
    healPotions: healPotions == null ? 2 : healPotions
  });
  state._rng = rngZero;
  return state;
}

function setRoles(state, roles) {
  roles.forEach(function (role, i) {
    const p = state.players[i];
    p.role = role;
    p.healsLeft = role === 'hexe' ? (state.healPotions || 2) : 0;
    p.poisonLeft = role === 'hexe';
    p.nachLeft = role === 'nachahmerin' ? state.nachUses : 0;
    p.stealUsed = false;
    p.schaufelUsed = false;
    p.russeUsed = false;
    p.hunterShot = false;
    p.loverIds = [];
    p.alive = true;
    p.notice = null;
  });
}

function ackWhile(state, pred) {
  let guard = 0;
  while (pred(state)) {
    const view = W.view(state);
    if (view.screen === 'reveal' || view.step === 'handoff' || (view.prompt && ['sleep', 'love', 'notice', 'info', 'seer-result'].indexOf(view.prompt.kind) >= 0)) {
      W.send(state, { type: 'ack' });
    } else break;
    if (++guard > 400) throw new Error('ack loop ' + JSON.stringify(W.view(state)));
  }
}

function startNight(state, pairs) {
  if (state.screen === 'reveal') {
    state.players.forEach(function (p) {
      W.send(state, { type: 'reveal-pick', id: p.id });
      if (state.step === 'link') {
        const others = state.players.filter(function (one) { return one.id !== p.id; });
        const pair = (pairs && pairs[p.id]) || [p.id, others[0].id];
        W.send(state, { type: 'select', id: pair[0] });
        W.send(state, { type: 'select', id: pair[1] });
        W.send(state, { type: 'confirm', ids: pair });
        if (state.step === 'love') W.send(state, { type: 'ack' });
      } else W.send(state, { type: 'ack' });
    });
    W.send(state, { type: 'start-game' });
  }
  assert.strictEqual(state.screen, 'night');
  assert.strictEqual(state.nightNumber, 1);
}

function toDiscuss(state) {
  startNight(state);
  playNight(state, function (view, s) {
    if (view.prompt && view.prompt.kind === 'nutte') {
      const host = W.living(s).filter(function (p) { return p.id !== view.playerId; })[0];
      return { type: 'confirm', id: host.id };
    }
    if (view.prompt && view.prompt.kind === 'amor') {
      const me = view.playerId;
      const shovel = W.living(s).filter(function (p) { return p.role === 'schaufel' && p.id !== me; })[0];
      const other = shovel || W.living(s).filter(function (p) { return p.id !== me; })[0];
      return { type: 'confirm', ids: [me, other.id] };
    }
    return null;
  });
  if (state.screen === 'announce') W.send(state, { type: 'ack' });
  assert.strictEqual(state.screen, 'discuss');
  assert.strictEqual(state.day, 1);
  assert.strictEqual(state.mayorId, state.players[0].id);
}

function voteAll(state, choiceFor) {
  W.send(state, { type: 'to-vote' });
  let guard = 0;
  while (state.screen === 'vote') {
    const view = W.view(state);
    if (view.step === 'list') {
      const next = W.living(state).filter(function (p) { return (state.voteDone || []).indexOf(p.id) < 0; })[0];
      W.send(state, { type: 'vote-pick', id: next.id });
    } else if (view.step === 'ready') W.send(state, { type: 'go' });
    else if (view.step === 'handoff') W.send(state, { type: 'ack' });
    else W.send(state, { type: 'confirm', id: choiceFor(W.playerById(state, view.playerId), state) });
    if (++guard > 80) throw new Error('vote loop ' + JSON.stringify(W.view(state)));
  }
}

function skipToNight(state) {
  if (state.screen === 'discuss') voteAll(state, function () { return 0; });
  if (state.screen === 'announce') W.send(state, { type: 'ack' });
  assert.strictEqual(state.screen, 'night');
}

test('Vorschlag summiert sich und ist spielbar', function () {
  [4, 5, 6, 7, 8, 10, 12, 14].forEach(function (n) {
    const counts = W.defaultCounts(n);
    assert.strictEqual(W.validateSetup(counts, n, 1), '', 'n=' + n + ' ' + JSON.stringify(counts));
    assert.ok(counts.werwolf >= 1);
  });
  const c8 = W.defaultCounts(8);
  assert.strictEqual(c8.werwolf, 2);
  assert.strictEqual(c8.seherin, 1);
  assert.ok(c8.dorfbewohner >= 1);
});

test('Liebespaare bleiben getrennt, Ketten verbinden sich', function () {
  const state = game(['A', 'B', 'C', 'D']);
  W.addLink(state, 1, 2);
  W.addLink(state, 3, 4);
  assert.deepStrictEqual(W.loverComponent(state, 1).sort(), [1, 2]);
  assert.deepStrictEqual(W.loverComponent(state, 3).sort(), [3, 4]);
  W.addLink(state, 2, 3);
  assert.deepStrictEqual(W.loverComponent(state, 1).sort(), [1, 2, 3, 4]);
});

test('Ketten-Tod und getrennte Paare', function () {
  const state = game(['A', 'B', 'C', 'D', 'E']);
  setRoles(state, ['dorfbewohner', 'dorfbewohner', 'dorfbewohner', 'werwolf', 'hexe']);
  W.addLink(state, 1, 2);
  W.addLink(state, 2, 3);
  W.addLink(state, 4, 5);
  state.obit = [];
  state.hunters = [];
  W.applyDeath(state, 2, 'woelfe');
  assert.strictEqual(W.playerById(state, 1).alive, false);
  assert.strictEqual(W.playerById(state, 3).alive, false);
  assert.strictEqual(W.playerById(state, 4).alive, true);
  assert.strictEqual(W.playerById(state, 5).alive, true);
  assert.deepStrictEqual(W.playerById(state, 4).loverIds, [5]);
});

test('Liebesgruppe gewinnt vor der Wolfsparität', function () {
  const state = game(['A', 'B', 'C', 'D']);
  setRoles(state, ['werwolf', 'dorfbewohner', 'dorfbewohner', 'dorfbewohner']);
  state.players[2].alive = false;
  state.players[3].alive = false;
  W.addLink(state, 1, 2);
  assert.strictEqual(W.checkWin(state), 'liebespaar');
});

test('Politiker zählt bei der Wolfsmehrheit als Nicht-Wolf mit und gewinnt nur durch die Wahl', function () {
  const state = game(['Wolf', 'Dorf', 'Pol', 'Hexe']);
  setRoles(state, ['werwolf', 'dorfbewohner', 'politiker', 'hexe']);
  state.players[1].alive = false;
  state.players[3].alive = false;
  assert.strictEqual(W.checkWin(state), 'woelfe');
  const alone = game(['Pol', 'D', 'W', 'H']);
  setRoles(alone, ['politiker', 'dorfbewohner', 'werwolf', 'hexe']);
  alone.players.forEach(function (p) { if (p.role !== 'politiker') p.alive = false; });
  alone.winner = null;
  assert.strictEqual(W.checkWin(alone), 'niemand');
  const vote = game(['Pol', 'D', 'W', 'H']);
  setRoles(vote, ['politiker', 'dorfbewohner', 'werwolf', 'hexe']);
  vote.obit = [];
  vote.hunters = [];
  W.applyDeath(vote, 1, 'abstimmung');
  assert.strictEqual(vote.winner, 'politiker');
  assert.strictEqual(W.playerById(vote, 2).alive, true);
  const shot = game(['Pol', 'D', 'W', 'H']);
  setRoles(shot, ['politiker', 'dorfbewohner', 'werwolf', 'hexe']);
  shot.obit = [];
  shot.hunters = [];
  shot.winner = null;
  W.applyDeath(shot, 1, 'jaeger');
  assert.strictEqual(shot.winner, null);
  assert.strictEqual(W.playerById(shot, 1).alive, false);
});

test('Wolfs-Gleichstand nimmt das Haus im Uhrzeigersinn ab dem Bürgermeister', function () {
  const players = [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }];
  assert.strictEqual(W.closestClockwise(players, 1, [3, 4]), 3);
  assert.strictEqual(W.closestClockwise(players, 1, [1, 4]), 1);
  const state = game(['A', 'B', 'C', 'D']);
  state.mayorId = 1;
  state.wolfVotes = { 2: 4, 3: 3 };
  assert.strictEqual(W.resolveWolfHouse(state), 3);
});

test('Stimme 1,5 und Gleichstand ohne Lynch', function () {
  const state = game(['A', 'B', 'C', 'D']);
  state.mayorId = 99;
  state.votes = { 1: 2, 2: 2, 3: 3, 4: 3 };
  const result = W.resolveBallot(state);
  assert.strictEqual(result.type, 'tie');
  state.mayorId = 1;
  state.votes = { 1: 2, 2: 2, 3: 3, 4: 0 };
  const mayorWins = W.resolveBallot(state);
  assert.strictEqual(mayorWins.type, 'player');
  assert.strictEqual(mayorWins.id, 2);
  state.votes = { 1: 0, 2: 0, 3: 0, 4: 0 };
  assert.strictEqual(W.resolveBallot(state).type, 'none');
});

test('Nutte ist nachts nie daheim, Gäste sterben mit', function () {
  const state = game(['Nutte', 'Wirt', 'Wolf', 'Hexe']);
  setRoles(state, ['nutte', 'dorfbewohner', 'werwolf', 'hexe']);
  state.hosts = { 1: 2 };
  assert.strictEqual(W.isAway(state, 1), true);
  assert.deepStrictEqual(W.occupants(state, 1), []);
  assert.deepStrictEqual(W.occupants(state, 2).sort(), [1, 2]);
  assert.strictEqual(W.ownerHome(state, 1), false);
  assert.deepStrictEqual(W.occupants(state, 1), []);
  assert.deepStrictEqual(W.occupants(state, 2).sort(), [1, 2]);
});

function nightCounts() {
  return {
    werwolf: 1, dorfbewohner: 1, hexe: 1, seherin: 0, amor: 0, jaeger: 0,
    waschbaer: 0, nachahmerin: 0, nutte: 1, russe: 0, politiker: 0, schaufel: 0
  };
}

test('Heiltrank rettet das Wolfsopfer im Haus, Gift nicht', function () {
  const healed = game(['Nutte', 'Wirt', 'Wolf', 'Hexe'], nightCounts(), 1);
  setRoles(healed, ['nutte', 'dorfbewohner', 'werwolf', 'hexe']);
  startNight(healed);
  let sawAttacks = false;
  playNight(healed, function (view, s) {
    const kind = view.prompt && view.prompt.kind;
    if (kind === 'nutte') return { type: 'confirm', id: 2 };
    if (kind === 'wolf') return { type: 'confirm', id: 2 };
    if (kind === 'heal') {
      if (view.prompt.attacks) sawAttacks = true;
      if (s.heals.indexOf(2) >= 0) return { type: 'skip' };
      return { type: 'confirm', id: 2 };
    }
    if (kind === 'poison') return { type: 'skip' };
    return null;
  });
  assert.strictEqual(sawAttacks, false);
  assert.strictEqual(W.playerById(healed, 1).alive, true);
  assert.strictEqual(W.playerById(healed, 2).alive, true);
  assert.strictEqual(W.playerById(healed, 4).healsLeft, 1);

  const poisoned = game(['Nutte', 'Wirt', 'Wolf', 'Hexe'], nightCounts(), 1);
  setRoles(poisoned, ['nutte', 'dorfbewohner', 'werwolf', 'hexe']);
  startNight(poisoned);
  playNight(poisoned, function (view) {
    const kind = view.prompt && view.prompt.kind;
    if (kind === 'nutte') return { type: 'confirm', id: 2 };
    if (kind === 'wolf') return { type: 'confirm', id: 1 };
    if (kind === 'heal') return { type: 'skip' };
    if (kind === 'poison') return { type: 'confirm', id: 2 };
    return null;
  });
  assert.strictEqual(W.playerById(poisoned, 1).alive, false);
  assert.strictEqual(W.playerById(poisoned, 2).alive, false);
  assert.strictEqual(W.playerById(poisoned, 3).alive, true);
});

test('Waschbär-Diebstahl wirkt erst in der nächsten Nacht, Liebe bleibt', function () {
  const state = game(['Wasch', 'Hexe', 'Wolf', 'Dorf']);
  setRoles(state, ['waschbaer', 'hexe', 'werwolf', 'dorfbewohner']);
  W.playerById(state, 2).healsLeft = 0;
  W.playerById(state, 2).poisonLeft = false;
  W.addLink(state, 2, 4);
  state.nightNumber = 1;
  state.pass = 1;
  state.order = [1, 2, 3, 4];
  state.cursor = 0;
  state.hosts = {};
  state.pendingThefts = [];
  assert.strictEqual(W.ownerHome(state, 2), true);
  state.players[1].notice = { night: 1 };
  state.pendingThefts.push({ thiefId: 1, victimId: 2, role: 'hexe', applyNight: 2 });
  W.playerById(state, 1).stealUsed = true;
  assert.strictEqual(W.playerById(state, 2).role, 'hexe');
  assert.deepStrictEqual(W.playerById(state, 2).loverIds, [4]);
  state.nightNumber = 1;
  W.beginNight(state);
  assert.strictEqual(state.nightNumber, 2);
  assert.strictEqual(W.playerById(state, 1).role, 'hexe');
  assert.strictEqual(W.playerById(state, 1).healsLeft, 2);
  assert.strictEqual(W.playerById(state, 1).poisonLeft, true);
  assert.strictEqual(W.playerById(state, 2).role, 'dorfbewohner');
  assert.deepStrictEqual(W.playerById(state, 2).loverIds, [4]);
});

test('Nachtablauf: Diebstahl, Nutte, Hexe, Jäger, Schaufel, Bürgermeister', function () {
  const names = ['Anna', 'Bea', 'Chris', 'Dora', 'Erik', 'Fina'];
  const counts = W.blank ? null : {
    werwolf: 1, dorfbewohner: 1, hexe: 1, seherin: 0, amor: 0, jaeger: 1,
    waschbaer: 1, nachahmerin: 0, nutte: 1, russe: 0, politiker: 0, schaufel: 1
  };
  /* 1+1+1+1+1+1+1 = 7, too many. Use 6 roles. */
  const counts6 = {
    werwolf: 1, dorfbewohner: 1, hexe: 1, seherin: 0, amor: 0, jaeger: 1,
    waschbaer: 1, nachahmerin: 0, nutte: 1, russe: 0, politiker: 0, schaufel: 0
  };
  assert.strictEqual(W.validateSetup(counts6, 6, 1), '');
  const state = game(names, counts6, 1);
  setRoles(state, ['waschbaer', 'nutte', 'werwolf', 'hexe', 'jaeger', 'dorfbewohner']);
  /* Anna stiehlt in Nacht 1 die Hexe. Bea schläft bei Fina. Chris frisst Finas Haus. Dora heilt nicht, vergiftet nicht. */
  startNight(state);
  assert.strictEqual(state.mayorId, 1);
  assert.strictEqual(state.day, 0);
  assert.strictEqual(state.nightNumber, 1);
  playNight(state, function (view, s) {
    const p = W.playerById(s, view.playerId);
    const kind = view.prompt && view.prompt.kind;
    if (kind === 'steal' && p.role === 'waschbaer') return { type: 'confirm', id: 4 };
    if (kind === 'nutte') return { type: 'confirm', id: 6 };
    if (kind === 'wolf') return { type: 'confirm', id: 6 };
    if (kind === 'heal') return { type: 'skip' };
    if (kind === 'poison') return { type: 'skip' };
    return null;
  });
  assert.strictEqual(W.playerById(state, 2).alive, false, 'Nutte stirbt im Haus');
  assert.strictEqual(W.playerById(state, 6).alive, false, 'Wirt stirbt');
  assert.strictEqual(W.playerById(state, 5).role, 'jaeger');
  /* Jäger lebt noch. Kein Schuss. */
  assert.notStrictEqual(state.screen, 'hunter');
  assert.strictEqual(W.playerById(state, 1).role, 'hexe');
  assert.strictEqual(W.playerById(state, 4).role, 'dorfbewohner');
  assert.strictEqual(state.pendingThefts.length, 0);
  assert.strictEqual(state.winner, null);
  W.send(state, { type: 'ack' }); /* Morgen -> Diskussion Tag 1, Amt bleibt */
  assert.strictEqual(state.screen, 'discuss');
  assert.strictEqual(state.day, 1);
  assert.strictEqual(state.mayorId, 1, 'Nach Nacht 1 dreht das Amt nicht');
  /* Bea ist tot, nächster lebender Sitz nach Anna: Chris (Bea tot). Tod von Bea war nicht der Bürgermeister. */
  skipToNight(state);
  assert.strictEqual(state.nightNumber, 2);
  assert.strictEqual(W.playerById(state, 1).role, 'hexe');
  assert.strictEqual(W.playerById(state, 1).healsLeft, 2);
  assert.strictEqual(W.playerById(state, 1).poisonLeft, true);
  assert.strictEqual(W.playerById(state, 4).role, 'dorfbewohner');
  assert.strictEqual(W.playerById(state, 4).healsLeft, 0);
  playNight(state, function () { return null; });
  W.send(state, { type: 'ack' });
  assert.strictEqual(state.day, 2);
  assert.notStrictEqual(state.mayorId, 1, 'Ab Nacht 2 dreht das Amt');
});

function playNight(state, decide) {
  let guard = 0;
  while (state.screen === 'night' || state.screen === 'hunter') {
    const view = W.view(state);
    if (state.screen === 'hunter') {
      if (view.step === 'list' || view.step === 'handoff') W.send(state, { type: 'hunter-pick', id: state.hunters[0] });
      else if (view.step === 'ready') W.send(state, { type: 'go' });
      else {
        const target = W.living(state)[0];
        W.send(state, { type: 'confirm', id: target.id });
      }
    } else if (view.step === 'list') {
      const next = W.living(state).filter(function (p) { return state.nightDone.indexOf(p.id) < 0; })[0];
      if (!next) throw new Error('night list empty');
      W.send(state, { type: 'night-pick', id: next.id });
    } else if (view.step === 'ready') {
      W.send(state, { type: 'go' });
    } else if (view.step === 'handoff') {
      W.send(state, { type: 'ack' });
    } else {
      const choice = decide(view, state);
      if (choice) W.send(state, choice);
      else if (view.prompt && ['sleep', 'love', 'notice', 'info', 'seer-result'].indexOf(view.prompt.kind) >= 0) {
        W.send(state, { type: 'ack' });
      } else if (view.prompt && view.prompt.kind === 'amor') {
        const pair = W.living(state);
        W.send(state, { type: 'confirm', ids: [pair[0].id, pair[1].id] });
      } else W.send(state, { type: 'skip' });
    }
    if (++guard > 300) throw new Error('night loop ' + JSON.stringify(W.view(state)));
  }
}

test('Nachahmerin kopiert den Werwolf und tötet ein zweites Haus', function () {
  const counts = {
    werwolf: 1, dorfbewohner: 2, hexe: 0, seherin: 0, amor: 0, jaeger: 0,
    waschbaer: 0, nachahmerin: 1, nutte: 0, russe: 0, politiker: 0, schaufel: 0
  };
  const state = game(['Nana', 'Wolf', 'Dorf', 'Ziel'], counts, 1);
  setRoles(state, ['nachahmerin', 'werwolf', 'dorfbewohner', 'dorfbewohner']);
  startNight(state);
  playNight(state, function (view, s) {
    const kind = view.prompt && view.prompt.kind;
    if (kind === 'copy') return { type: 'confirm', id: 2 };
    if (kind === 'kill') return { type: 'confirm', id: 4 };
    if (kind === 'wolf') return { type: 'confirm', id: 3 };
    return null;
  });
  assert.strictEqual(W.playerById(state, 3).alive, false);
  assert.strictEqual(W.playerById(state, 4).alive, false);
  assert.strictEqual(W.playerById(state, 1).nachLeft, 0);
});

test('Seherin sieht das Lager der Nutte, Amor verbindet sie, Waschbär stiehlt die Person', function () {
  const counts = {
    werwolf: 1, dorfbewohner: 0, hexe: 0, seherin: 1, amor: 1, jaeger: 0,
    waschbaer: 0, nachahmerin: 0, nutte: 1, russe: 0, politiker: 0, schaufel: 0
  };
  const state = game(['See', 'Amor', 'Wasch', 'Nutte'], counts, 1);
  setRoles(state, ['seherin', 'amor', 'waschbaer', 'nutte']);
  startNight(state, { 2: [4, 1] });
  let seenRole = null;
  playNight(state, function (view, s) {
    const kind = view.prompt && view.prompt.kind;
    if (kind === 'seer') return { type: 'confirm', id: 4 };
    if (kind === 'seer-result') {
      seenRole = view.prompt.label;
      return { type: 'ack' };
    }
    if (kind === 'amor') return { type: 'confirm', ids: [4, 1] };
    if (kind === 'steal') return { type: 'confirm', id: 4 };
    if (kind === 'nutte') return { type: 'confirm', id: 1 };
    if (kind === 'wolf') return { type: 'confirm', id: 1 };
    return null;
  });
  assert.strictEqual(seenRole, 'Team Dorfbewohner');
  assert.ok(W.playerById(state, 4).loverIds.indexOf(1) >= 0);
  assert.strictEqual(W.playerById(state, 3).role, 'nutte');
  assert.strictEqual(W.playerById(state, 4).role, 'dorfbewohner');
  assert.strictEqual(state.pendingThefts.length, 0);
});

test('Schaufel holt mit verbrauchten Tränken zurück, ohne Liebe', function () {
  const counts = {
    werwolf: 1, dorfbewohner: 1, hexe: 1, seherin: 0, amor: 1, jaeger: 0,
    waschbaer: 0, nachahmerin: 0, nutte: 0, russe: 0, politiker: 0, schaufel: 1
  };
  const state = game(['Wolf', 'Hexe', 'Amor', 'Schaufel', 'Dorf'], counts, 1);
  setRoles(state, ['werwolf', 'hexe', 'amor', 'schaufel', 'dorfbewohner']);
  toDiscuss(state);
  /* Tag 1: Hexe wird gewählt, Tränke waren schon leer, Amor hat sie verbunden — der Tod löst die Liebe. */
  W.playerById(state, 2).healsLeft = 0;
  W.playerById(state, 2).poisonLeft = false;
  W.addLink(state, 2, 5);
  voteAll(state, function (p) { return p.role === 'hexe' ? 5 : 2; });
  /* mayor Anna ist Wolf id 1, Stimme 1,5 auf 5 plus jemand? 
     voters: all 5 alive. choice: hexe votes 5, others vote 2.
     Target 2 weight: 4 voters * 2 or mayor if mayor votes 2.
     Mayor is id 1 wolf, choiceFor wolf is not hexe so votes 2. weight 3.
     Hexe votes 5 weight 2.
     Others vote 2 weight 2 each. 2 wins. */
  if (state.screen === 'announce') W.send(state, { type: 'ack' });
  while (state.screen === 'announce' || state.screen === 'hunter') {
    if (state.screen === 'hunter') {
      const step = W.view(state).step;
      if (step === 'list' || step === 'handoff') W.send(state, { type: 'hunter-pick', id: state.hunters[0] });
      else if (step === 'ready') W.send(state, { type: 'go' });
      else W.send(state, { type: 'confirm', id: W.living(state)[0].id });
    } else W.send(state, { type: 'ack' });
  }
  assert.strictEqual(W.playerById(state, 2).alive, false);
  assert.deepStrictEqual(W.playerById(state, 5).loverIds, []);
  assert.strictEqual(state.screen, 'night');
  playNight(state, function (view) {
    const kind = view.prompt && view.prompt.kind;
    if (kind === 'schaufel') return { type: 'confirm', id: 2 };
    if (kind === 'wolf') return { type: 'confirm', id: 3 };
    if (kind === 'amor') return { type: 'confirm', ids: [3, 4] };
    return null;
  });
  assert.strictEqual(W.playerById(state, 2).alive, true);
  assert.strictEqual(W.playerById(state, 2).role, 'hexe');
  assert.strictEqual(W.playerById(state, 2).healsLeft, 0);
  assert.strictEqual(W.playerById(state, 2).poisonLeft, false);
  assert.deepStrictEqual(W.playerById(state, 2).loverIds, []);
});

test('Russe-Duell: falscher Name tut nichts, Kugel trifft den ersten Zug', function () {
  const counts = {
    werwolf: 1, dorfbewohner: 2, hexe: 0, seherin: 0, amor: 0, jaeger: 0,
    waschbaer: 0, nachahmerin: 0, nutte: 0, russe: 1, politiker: 0, schaufel: 0
  };
  const state = game(['Russe', 'A', 'B', 'Wolf'], counts, 1);
  setRoles(state, ['russe', 'dorfbewohner', 'dorfbewohner', 'werwolf']);
  toDiscuss(state);
  W.send(state, { type: 'to-duel' });
  W.send(state, { type: 'confirm', id: 2 });
  assert.strictEqual(state.duel.stage, 'noop');
  W.send(state, { type: 'ack' });
  assert.strictEqual(state.screen, 'discuss');
  assert.strictEqual(W.playerById(state, 1).russeUsed, false);
  W.send(state, { type: 'to-duel' });
  W.send(state, { type: 'confirm', id: 1 });
  assert.strictEqual(state.duel.stage, 'pick');
  W.send(state, { type: 'confirm', ids: [2] });
  assert.strictEqual(W.playerById(state, 1).russeUsed, true);
  assert.strictEqual(state.duel.bulletAt, 0);
  assert.strictEqual(state.duel.order[0], 1);
  assert.strictEqual(state.duel.stage, 'pull-ready');
  W.send(state, { type: 'ack' });
  assert.strictEqual(state.duel.hit, true);
  W.send(state, { type: 'ack' });
  while (state.screen === 'hunter') {
    const step = W.view(state).step;
    if (step === 'list' || step === 'handoff') W.send(state, { type: 'hunter-pick', id: state.hunters[0] });
    else if (step === 'ready') W.send(state, { type: 'go' });
    else W.send(state, { type: 'confirm', id: W.living(state)[0].id });
  }
  if (state.screen === 'announce') W.send(state, { type: 'ack' });
  assert.strictEqual(W.playerById(state, 1).alive, false);
  assert.strictEqual(state.screen, 'discuss');
});

test('Jäger stirbt nachts und erschießt morgens eine Person', function () {
  const counts = {
    werwolf: 1, dorfbewohner: 2, hexe: 0, seherin: 0, amor: 0, jaeger: 1,
    waschbaer: 0, nachahmerin: 0, nutte: 0, russe: 0, politiker: 0, schaufel: 0
  };
  const state = game(['Wolf', 'Jäger', 'A', 'B'], counts, 1);
  setRoles(state, ['werwolf', 'jaeger', 'dorfbewohner', 'dorfbewohner']);
  startNight(state);
  playNight(state, function (view) {
    if (view.prompt && view.prompt.kind === 'wolf') return { type: 'confirm', id: 2 };
    return null;
  });
  assert.strictEqual(W.playerById(state, 2).alive, false);
  const shot = state.obit.filter(function (row) { return row.cause === 'jaeger'; });
  assert.ok(shot.length === 1);
});

test('Fehlerbericht enthält Rolle, Log und Version', function () {
  const state = game(['A', 'B', 'C', 'D']);
  setRoles(state, ['werwolf', 'hexe', 'seherin', 'dorfbewohner']);
  W.note(state, 'Testaktion');
  const text = W.report(state, 'Der Wolf hat zweimal gefressen');
  assert.ok(text.indexOf('Der Wolf hat zweimal gefressen') >= 0);
  assert.ok(text.indexOf(W.APP_VERSION) >= 0);
  assert.ok(text.indexOf('werwolf') >= 0);
  assert.ok(text.indexOf('Testaktion') >= 0);
  assert.ok(text.indexOf('geheime Rollen') >= 0);
});

test('Home behält die Namen und löscht die Rollen', function () {
  const state = game(['A', 'B', 'C', 'D']);
  toDiscuss(state);
  W.send(state, { type: 'home' });
  assert.strictEqual(state.screen, 'lobby');
  assert.strictEqual(state.players.length, 4);
  assert.strictEqual(state.players[0].name, 'A');
  assert.strictEqual(state.players[0].role, undefined);
});

test('Heiltränke sind 1 bis 8, Standard 2, mehrere Häuser in einer Nacht', function () {
  const counts = W.defaultCounts(4);
  assert.strictEqual(W.validateSetup(counts, 4, 1, 2), '');
  assert.strictEqual(W.validateSetup(counts, 4, 1, 1), '');
  assert.strictEqual(W.validateSetup(counts, 4, 1, 8), '');
  assert.ok(W.validateSetup(counts, 4, 1, 0));
  assert.ok(W.validateSetup(counts, 4, 1, 9));
  const roles = {
    werwolf: 1, dorfbewohner: 2, hexe: 1, seherin: 0, amor: 0, jaeger: 0,
    waschbaer: 0, nachahmerin: 0, nutte: 0, russe: 0, politiker: 0, schaufel: 0
  };
  const state = game(['Wolf', 'A', 'B', 'Hexe'], roles, 1, 2);
  setRoles(state, ['werwolf', 'dorfbewohner', 'dorfbewohner', 'hexe']);
  assert.strictEqual(W.playerById(state, 4).healsLeft, 2);
  startNight(state);
  playNight(state, function (view, s) {
    const kind = view.prompt && view.prompt.kind;
    if (kind === 'wolf') return { type: 'confirm', id: 2 };
    if (kind === 'heal') {
      assert.strictEqual(view.prompt.attacks, undefined);
      const house = s.heals.indexOf(2) < 0 ? 2 : 3;
      return { type: 'confirm', id: house };
    }
    if (kind === 'poison') return { type: 'confirm', id: 3 };
    return null;
  });
  assert.strictEqual(W.playerById(state, 2).alive, true, 'Wolf auf Haus 2 geheilt');
  assert.strictEqual(W.playerById(state, 3).alive, true, 'Gift auf Haus 3 geheilt');
  assert.strictEqual(W.playerById(state, 4).healsLeft, 0);
  assert.strictEqual(W.playerById(state, 4).poisonLeft, false);

  const once = game(['Wolf', 'A', 'B', 'Hexe'], roles, 1, 1);
  setRoles(once, ['werwolf', 'dorfbewohner', 'dorfbewohner', 'hexe']);
  assert.strictEqual(W.playerById(once, 4).healsLeft, 1);
  startNight(once);
  W.send(once, { type: 'night-pick', id: 4 });
  W.send(once, { type: 'go' });
  assert.strictEqual(W.view(once).prompt.kind, 'heal');
  W.send(once, { type: 'confirm', id: 2 });
  assert.strictEqual(W.view(once).prompt.kind, 'poison');
  assert.strictEqual(W.playerById(once, 4).healsLeft, 0);
});

test('Heiltrank gilt nur diese Nacht und ein Haus nur einmal', function () {
  const roles = {
    werwolf: 1, dorfbewohner: 2, hexe: 1, seherin: 0, amor: 0, jaeger: 0,
    waschbaer: 0, nachahmerin: 0, nutte: 0, russe: 0, politiker: 0, schaufel: 0
  };
  const state = game(['Wolf', 'A', 'B', 'Hexe'], roles, 1, 2);
  setRoles(state, ['werwolf', 'dorfbewohner', 'dorfbewohner', 'hexe']);
  startNight(state);
  W.send(state, { type: 'night-pick', id: 4 });
  W.send(state, { type: 'go' });
  W.send(state, { type: 'confirm', id: 2 });
  assert.strictEqual(W.view(state).prompt.kind, 'heal');
  W.send(state, { type: 'confirm', id: 2 });
  assert.ok(state.error);
  assert.strictEqual(W.playerById(state, 4).healsLeft, 1);
  W.send(state, { type: 'skip' });
  W.send(state, { type: 'skip' });
  W.send(state, { type: 'night-pick', id: 1 });
  W.send(state, { type: 'go' });
  W.send(state, { type: 'confirm', id: 2 });
  const rest = W.living(state).filter(function (p) { return state.nightDone.indexOf(p.id) < 0; });
  rest.forEach(function (p) {
    if (state.screen !== 'night') return;
    if (W.view(state).step === 'list') W.send(state, { type: 'night-pick', id: p.id });
    if (W.view(state).step === 'ready') W.send(state, { type: 'go' });
    while (state.screen === 'night' && W.view(state).playerId === p.id) {
      const kind = W.view(state).prompt && W.view(state).prompt.kind;
      W.send(state, { type: kind === 'sleep' || kind === 'info' ? 'ack' : 'skip' });
    }
  });
  assert.strictEqual(W.playerById(state, 2).alive, true);
  W.send(state, { type: 'ack' });
  skipToNight(state);
  playNight(state, function (view) {
    if (view.prompt && view.prompt.kind === 'wolf') return { type: 'confirm', id: 2 };
    if (view.prompt && view.prompt.kind === 'heal') return { type: 'skip' };
    return null;
  });
  assert.strictEqual(W.playerById(state, 2).alive, false);
});

test('Namenliste: Rolle bleibt antippbar, Nachtname nicht', function () {
  const state = game(['A', 'B', 'C', 'D']);
  setRoles(state, ['dorfbewohner', 'dorfbewohner', 'dorfbewohner', 'werwolf']);
  W.send(state, { type: 'reveal-pick', id: 1 });
  assert.strictEqual(state.step, 'show');
  W.send(state, { type: 'ack' });
  assert.strictEqual(state.revealed[1], true);
  W.send(state, { type: 'reveal-pick', id: 1 });
  assert.strictEqual(state.step, 'show');
  assert.strictEqual(W.view(state).playerId, 1);
  W.send(state, { type: 'ack' });
  W.send(state, { type: 'start-game' });
  assert.strictEqual(state.screen, 'reveal');
  assert.ok(state.error);
  state.players.forEach(function (p) {
    if (!state.revealed[p.id]) {
      W.send(state, { type: 'reveal-pick', id: p.id });
      W.send(state, { type: 'ack' });
    }
  });
  W.send(state, { type: 'start-game' });
  assert.strictEqual(state.screen, 'night');
  assert.strictEqual(state.day, 0);
  W.send(state, { type: 'night-pick', id: 2 });
  assert.strictEqual(state.step, 'ready');
  W.send(state, { type: 'back' });
  assert.strictEqual(state.step, 'list');
  W.send(state, { type: 'night-pick', id: 1 });
  W.send(state, { type: 'go' });
  W.send(state, { type: 'ack' });
  assert.ok(state.nightDone.indexOf(1) >= 0);
  W.send(state, { type: 'night-pick', id: 1 });
  assert.ok(state.error);
  assert.strictEqual(state.step, 'list');
});

function blankCounts() {
  const counts = {};
  W.ROLE_ORDER.forEach(function (role) { counts[role] = 0; });
  return counts;
}

function openUntil(state, kind) {
  let guard = 0;
  while (guard++ < 50) {
    const view = W.view(state);
    if (view.prompt && view.prompt.kind === kind) return view;
    if (view.step === 'list') {
      const next = W.living(state).filter(function (p) { return state.nightDone.indexOf(p.id) < 0; })[0];
      W.send(state, { type: 'night-pick', id: next.id });
    } else if (view.step === 'ready') {
      W.send(state, { type: 'go' });
    } else if (view.prompt && view.prompt.kind === 'sleep') {
      W.send(state, { type: 'ack' });
    } else {
      W.send(state, { type: 'skip' });
    }
  }
  throw new Error('kein Prompt ' + kind + ' ' + JSON.stringify(W.view(state)));
}

test('Ein einzelner Werwolf sieht jedes Haus und kann wählen', function () {
  const counts = blankCounts();
  counts.werwolf = 1;
  counts.dorfbewohner = 3;
  const state = game(['Anna', 'Bea', 'Chris', 'xhdh'], counts, 1);
  setRoles(state, ['dorfbewohner', 'dorfbewohner', 'dorfbewohner', 'werwolf']);
  startNight(state);
  const view = openUntil(state, 'wolf');
  const targets = W.targetsFor(state, view.prompt, view.playerId);
  assert.strictEqual(targets.length, 4);
  assert.strictEqual(view.playerId, 4);
  W.send(state, { type: 'confirm', id: 1 });
  assert.strictEqual(state.error || '', '');
  assert.strictEqual(state.wolfVotes[4], 1);
  assert.notStrictEqual(state.screen, 'end');
});

test('Mehrere Werwölfe sehen Häuser und die bisherige Rudelwahl', function () {
  const counts = blankCounts();
  counts.werwolf = 2;
  counts.dorfbewohner = 3;
  const state = game(['Anna', 'Bea', 'Chris', 'Dora', 'Erik'], counts, 1);
  setRoles(state, ['werwolf', 'werwolf', 'dorfbewohner', 'dorfbewohner', 'dorfbewohner']);
  startNight(state);
  const first = openUntil(state, 'wolf');
  assert.strictEqual(W.targetsFor(state, first.prompt, first.playerId).length, 5);
  assert.strictEqual(W.wolfBoard(state, first.playerId).length, 2);
  W.send(state, { type: 'confirm', id: 3 });
  const second = openUntil(state, 'wolf');
  assert.strictEqual(W.targetsFor(state, second.prompt, second.playerId).length, 5);
  const board = W.wolfBoard(state, second.playerId);
  assert.ok(board.some(function (wolf) { return wolf.choice.indexOf('Haus von Chris') >= 0; }));
  W.send(state, { type: 'confirm', id: 4 });
  assert.strictEqual(state.error || '', '');
  assert.strictEqual(state.wolfVotes[1], 3);
  assert.strictEqual(state.wolfVotes[2], 4);
});

function legacyWolfNight() {
  return {
    v: 1,
    screen: 'night',
    step: 'show',
    players: [
      { id: 1, name: 'Anna', role: 'dorfbewohner', alive: true, loverIds: [], healLeft: false },
      { id: 2, name: 'Bea', role: 'dorfbewohner', alive: true, loverIds: [], healLeft: false },
      { id: 3, name: 'xhdh', role: 'werwolf', alive: true, loverIds: [], healLeft: false },
      { id: 4, name: 'Chris', role: 'dorfbewohner', alive: true, loverIds: [], healLeft: false }
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
    heals: [],
    poisons: [],
    extraAttacks: [],
    hosts: {},
    seenLove: {},
    bonds: []
  };
}

test('Alter Nachtstand mit cursor wird fortgesetzt und nicht gesperrt', function () {
  const state = legacyWolfNight();
  W.adoptSaved(state);
  assert.strictEqual(state.activeId, 3);
  assert.strictEqual(state.step, 'show');
  assert.deepStrictEqual(state.nightDone, [1, 2]);
  const view = W.view(state);
  assert.strictEqual(view.prompt.kind, 'wolf');
  assert.strictEqual(W.targetsFor(state, view.prompt, view.playerId).length, 4);
  W.send(state, { type: 'confirm', id: 1 });
  assert.notStrictEqual(state.error, 'Interner Fehler.');
  assert.strictEqual(state.wolfVotes[3], 1);
  assert.ok(state.nightDone.indexOf(3) >= 0);
  assert.strictEqual(state.step, 'list');
  W.send(state, { type: 'night-pick', id: 4 });
  assert.strictEqual(state.step, 'ready');
  const secondRound = legacyWolfNight();
  secondRound.pass = 2;
  W.adoptSaved(secondRound);
  assert.strictEqual(secondRound.screen, 'lobby');
  assert.strictEqual(secondRound.players.length, 4);
  assert.strictEqual(secondRound.players[2].name, 'xhdh');
  assert.strictEqual(secondRound.players[2].role, undefined);
});

test('Punkte nur für lebende Sieger, Politiker und überlebende Liebende', function () {
  const village = {
    winner: 'dorf',
    players: [
      { id: 1, name: 'Anna', role: 'dorfbewohner', alive: true },
      { id: 2, name: 'Bert', role: 'werwolf', alive: false },
      { id: 3, name: 'Cleo', role: 'dorfbewohner', alive: false },
      { id: 4, name: 'Dora', role: 'politiker', alive: true }
    ]
  };
  assert.deepStrictEqual(W.scoreRecipients(village), ['Anna']);
  const wolves = {
    winner: 'woelfe',
    players: [
      { id: 1, name: 'Anna', role: 'werwolf', alive: true },
      { id: 2, name: 'Bert', role: 'werwolf', alive: false },
      { id: 3, name: 'Cleo', role: 'dorfbewohner', alive: false }
    ]
  };
  assert.deepStrictEqual(W.scoreRecipients(wolves), ['Anna']);
  const pol = {
    winner: 'politiker',
    obit: [{ id: 4, name: 'Dora', cause: 'abstimmung' }],
    players: [
      { id: 4, name: 'Dora', role: 'politiker', alive: false },
      { id: 1, name: 'Anna', role: 'dorfbewohner', alive: true }
    ]
  };
  assert.deepStrictEqual(W.scoreRecipients(pol), ['Dora']);
  const love = {
    winner: 'liebespaar',
    players: [
      { id: 1, name: 'Anna', role: 'dorfbewohner', alive: true, loverIds: [2] },
      { id: 2, name: 'Bert', role: 'werwolf', alive: true, loverIds: [1] },
      { id: 3, name: 'Cleo', role: 'dorfbewohner', alive: false, loverIds: [] }
    ]
  };
  assert.deepStrictEqual(W.scoreRecipients(love).sort(), ['Anna', 'Bert']);
  const kept = W.grantPoints({ Cleo: 2, Egon: 1 }, ['Anna']);
  assert.deepStrictEqual(kept, { Cleo: 2, Egon: 1, Anna: 1 });
  const again = W.grantPoints(kept, ['Anna']);
  assert.strictEqual(again.Anna, 2);
  assert.strictEqual(again.Egon, 1);
  const once = W.awardOnce({ Egon: 4 }, village);
  assert.strictEqual(once.applied, true);
  assert.strictEqual(once.scores.Anna, 1);
  assert.strictEqual(once.scores.Egon, 4);
  assert.strictEqual(village.scoresApplied, true);
  const twice = W.awardOnce(once.scores, village);
  assert.strictEqual(twice.applied, false);
  assert.strictEqual(twice.scores.Anna, 1);
});

function lcg(seed) {
  let s = seed >>> 0;
  return function () {
    s = (Math.imul(1664525, s) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

test('Werwolf-Minimum und Maximum ziehen sich gegenseitig nach', function () {
  const state = W.newLobby();
  ['A', 'B', 'C', 'D'].forEach(function (name) { W.send(state, { type: 'add-name', name: name }); });
  W.send(state, { type: 'to-setup' });
  assert.ok(state.wolfMin <= state.wolfMax);
  W.send(state, { type: 'set-wolf-max', value: 3 });
  W.send(state, { type: 'set-wolf-min', value: 5 });
  assert.strictEqual(state.wolfMin, 5);
  assert.strictEqual(state.wolfMax, 5);
  assert.strictEqual(state.error, '');
  W.send(state, { type: 'set-wolf-max', value: 2 });
  assert.strictEqual(state.wolfMax, 2);
  assert.strictEqual(state.wolfMin, 2);
  const setup = {
    werwolf: 0,
    dorfbewohner: state.counts.dorfbewohner,
    wolfMin: state.wolfMin,
    wolfMax: state.wolfMax
  };
  W.ROLE_ORDER.forEach(function (role) { if (setup[role] == null) setup[role] = state.counts[role] || 0; });
  const problem = W.validateSetup(setup, 4, 1, 2, true);
  assert.ok(problem.indexOf('Maximum muss mindestens das Minimum') < 0);
  const saved = { players: [{ id: 1, name: 'A' }], screen: 'setup', wolfMin: 4, wolfMax: 1 };
  W.adoptSaved(saved);
  assert.strictEqual(saved.wolfMin, 4);
  assert.strictEqual(saved.wolfMax, 4);
});

test('Rollenpool achtet auf Min und Max und lässt Karten liegen', function () {
  const counts = blankCounts();
  counts.dorfbewohner = 8;
  counts.seherin = 3;
  const names = ['A', 'B', 'C', 'D', 'E', 'F'];
  const seen = { 1: 0, 2: 0 };
  let sawFewerSeers = false;
  for (let seed = 1; seed <= 40; seed++) {
    const state = W.createGame(names, counts, {
      rng: lcg(seed),
      nachUses: 1,
      rolePool: true,
      wolfMin: 1,
      wolfMax: 2
    });
    const wolves = state.players.filter(function (p) { return p.role === 'werwolf'; }).length;
    const seers = state.players.filter(function (p) { return p.role === 'seherin'; }).length;
    assert.ok(wolves >= 1 && wolves <= 2, 'Wölfe ' + wolves);
    assert.ok(seers <= 3);
    assert.strictEqual(state.players.length, 6);
    seen[wolves] += 1;
    if (seers < 3) sawFewerSeers = true;
  }
  assert.ok(seen[1] > 0 && seen[2] > 0, JSON.stringify(seen));
  assert.strictEqual(sawFewerSeers, true);
  const bad = blankCounts();
  bad.dorfbewohner = 1;
  bad.wolfMin = 0;
  bad.wolfMax = 1;
  assert.ok(W.validateSetup(bad, 4, 1, 2, true));
  bad.wolfMin = 3;
  bad.wolfMax = 2;
  bad.dorfbewohner = 6;
  assert.ok(W.validateSetup(bad, 4, 1, 2, true));
  bad.wolfMin = 4;
  bad.wolfMax = 4;
  assert.ok(W.validateSetup(bad, 4, 1, 2, true));
  bad.wolfMin = 1;
  bad.wolfMax = 1;
  bad.dorfbewohner = 1;
  assert.ok(W.validateSetup(bad, 4, 1, 2, true));
  const exact = blankCounts();
  exact.werwolf = 1;
  exact.dorfbewohner = 3;
  assert.strictEqual(W.validateSetup(exact, 4, 1, 2), '');
  assert.ok(W.validateSetup(exact, 4, 1, 2) === '' && W.validateSetup(Object.assign({ wolfMin: 1, wolfMax: 1 }, exact), 5, 1, 2, true));
});

console.log(passed + ' tests');

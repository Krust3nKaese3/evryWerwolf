/* Durchspielte Partien und gezielte Rollenfälle. Aufruf: node test/rules.test.js */
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

function rngConst(n) {
  return function () { return n; };
}

function blank() {
  const counts = {};
  W.ROLE_ORDER.forEach(function (role) { counts[role] = 0; });
  return counts;
}

function make(roles, opts) {
  opts = opts || {};
  const names = roles.map(function (_, i) { return 'P' + (i + 1); });
  const counts = blank();
  counts.werwolf = 1;
  counts.dorfbewohner = roles.length - 1;
  const state = W.createGame(names, counts, {
    rng: opts.rng || rngConst(0),
    nachUses: opts.nachUses == null ? 1 : opts.nachUses,
    healPotions: opts.healPotions == null ? 2 : opts.healPotions
  });
  state._rng = opts.rng || rngConst(0);
  roles.forEach(function (role, i) {
    const p = state.players[i];
    p.role = role;
    p.alive = true;
    p.healsLeft = role === 'hexe' ? state.healPotions : 0;
    p.poisonLeft = role === 'hexe';
    p.nachLeft = role === 'nachahmerin' ? state.nachUses : 0;
    p.stealUsed = false;
    p.schaufelUsed = false;
    p.russeUsed = false;
    p.hunterShot = false;
    p.loverIds = [];
    p.notice = null;
  });
  return state;
}

function p(state, id) { return W.playerById(state, id); }

function amorPair(state, amorId, pair) {
  const others = state.players.filter(function (person) { return person.id !== amorId; });
  const chosen = pair || [others[others.length - 1].id, others[Math.max(0, others.length - 2)].id];
  W.send(state, { type: 'select', id: chosen[0] });
  W.send(state, { type: 'select', id: chosen[1] });
  W.send(state, { type: 'confirm', ids: chosen });
  if (state.step === 'love') W.send(state, { type: 'ack' });
}

function ackReveal(state, id, pairs) {
  W.send(state, { type: 'reveal-pick', id: id });
  if (state.step === 'link') amorPair(state, id, pairs && pairs[id]);
  else if (state.step === 'love') W.send(state, { type: 'ack' });
  else W.send(state, { type: 'ack' });
}

function revealAndStart(state, pairs) {
  assert.strictEqual(state.screen, 'reveal');
  assert.strictEqual(state.nightNumber, 0);
  W.send(state, { type: 'start-game' });
  assert.strictEqual(state.screen, 'reveal');
  assert.ok(state.error);
  state.players.forEach(function (person) {
    ackReveal(state, person.id, pairs);
    ackReveal(state, person.id, pairs);
  });
  W.send(state, { type: 'start-game' });
  assert.strictEqual(state.screen, 'night');
  assert.strictEqual(state.nightNumber, 1);
  assert.strictEqual(state.day, 0);
  assert.strictEqual(state.mayorId, state.players[0].id);
}

function livingNotDone(state, key) {
  return W.living(state).filter(function (person) {
    return (state[key] || []).indexOf(person.id) < 0;
  });
}

function others(state, id) {
  return W.living(state).filter(function (person) { return person.id !== id; });
}

function ownerHome(state, id) {
  const person = p(state, id);
  return !!(person && person.alive && person.role !== 'nutte' && !(state.hosts && state.hosts[person.id]));
}

function decide(state, prompt, actorId) {
  const actor = p(state, actorId);
  if (prompt.kind === 'sleep' || prompt.kind === 'love' || prompt.kind === 'notice' || prompt.kind === 'info' || prompt.kind === 'seer-result') {
    return { type: 'ack' };
  }
  if (prompt.kind === 'nutte') {
    const host = others(state, actorId)[0];
    return { type: 'confirm', id: host.id };
  }
  if (prompt.kind === 'wolf' || prompt.kind === 'kill') {
    const house = W.living(state).filter(function (person) { return person.id !== actorId; })[0] || W.living(state)[0];
    return { type: 'confirm', id: house.id };
  }
  if (prompt.kind === 'seer' || prompt.kind === 'copy' || prompt.kind === 'steal') {
    let target = others(state, actorId)[0];
    if (!target) return prompt.kind === 'steal' && !prompt.forced ? { type: 'skip' } : { type: 'ack' };
    if (prompt.kind === 'copy') {
      const useful = others(state, actorId).filter(function (person) {
        return person.role === 'amor' || person.role === 'hexe' || person.role === 'seherin' || person.role === 'nutte' || person.role === 'waschbaer' || person.role === 'werwolf';
      })[0];
      if (useful) target = useful;
    }
    return { type: 'confirm', id: target.id };
  }
  if (prompt.kind === 'amor') {
    const pool = W.living(state);
    const a = pool[0].id === actorId && pool.length > 2 ? pool[1] : pool[0];
    const b = pool.filter(function (person) { return person.id !== a.id; })[0];
    return { type: 'confirm', ids: [a.id, b.id] };
  }
  if (prompt.kind === 'heal') {
    const house = W.living(state).filter(function (person) {
      return !(state.heals || []).some(function (id) { return Number(id) === person.id; });
    })[0];
    if (!house) return { type: 'skip' };
    return { type: 'confirm', id: house.id };
  }
  if (prompt.kind === 'poison') {
    const house = others(state, actorId)[0];
    return { type: 'confirm', id: house.id };
  }
  if (prompt.kind === 'schaufel') {
    const dead = W.deadPlayers(state)[0];
    if (!dead) return { type: 'skip' };
    return { type: 'confirm', id: dead.id };
  }
  if (prompt.kind === 'vote') {
    const politiker = W.living(state).filter(function (person) { return person.role === 'politiker'; })[0];
    const choice = W.living(state).filter(function (person) {
      return person.id !== actorId && (!politiker || person.id !== politiker.id);
    })[0];
    return { type: 'confirm', id: choice ? choice.id : 0 };
  }
  return { type: 'ack' };
}

function linksOk(state) {
  state.players.forEach(function (person) {
    (person.loverIds || []).forEach(function (id) {
      const other = p(state, id);
      assert.ok(other, 'Liebesziel fehlt');
      assert.ok((other.loverIds || []).indexOf(person.id) >= 0, 'Liebesband ist nicht gegenseitig');
      assert.ok(other.alive && person.alive, 'Liebe zeigt auf eine tote Person');
    });
  });
}

function step(state) {
  const view = W.view(state);
  if (view.screen === 'end') return false;
  if (view.screen === 'reveal') {
    if (state.step === 'love') {
      W.send(state, { type: 'ack' });
      return true;
    }
    if (state.step === 'link') {
      const others = state.players.filter(function (person) { return person.id !== state.activeId; });
      W.send(state, { type: 'select', id: state.activeId });
      W.send(state, { type: 'select', id: others[0].id });
      W.send(state, { type: 'confirm', ids: [state.activeId, others[0].id] });
      return true;
    }
    const unseen = state.players.filter(function (person) { return !W.revealDone(state, person); })[0];
    if (state.step === 'show') W.send(state, { type: 'ack' });
    else if (unseen) W.send(state, { type: 'reveal-pick', id: unseen.id });
    else W.send(state, { type: 'start-game' });
    return true;
  }
  if (view.screen === 'night' && view.step === 'list') {
    const next = livingNotDone(state, 'nightDone')[0];
    W.send(state, { type: 'night-pick', id: next.id });
    return true;
  }
  if (view.screen === 'vote' && view.step === 'list') {
    const next = livingNotDone(state, 'voteDone')[0];
    W.send(state, { type: 'vote-pick', id: next.id });
    return true;
  }
  if (view.screen === 'hunter' && (view.step === 'list' || view.step === 'handoff')) {
    W.send(state, { type: 'hunter-pick', id: state.hunters[0] });
    return true;
  }
  if (view.step === 'ready') {
    W.send(state, { type: 'go' });
    return true;
  }
  if (view.screen === 'announce' || view.step === 'handoff') {
    W.send(state, { type: 'ack' });
    return true;
  }
  if (view.screen === 'discuss') {
    const russe = W.living(state).filter(function (person) { return person.role === 'russe' && !person.russeUsed; })[0];
    if (russe) {
      W.send(state, { type: 'to-duel' });
      W.send(state, { type: 'confirm', id: russe.id });
      const foes = others(state, russe.id).slice(0, 2).map(function (person) { return person.id; });
      W.send(state, { type: 'confirm', ids: foes });
      return true;
    }
    W.send(state, { type: 'to-vote' });
    return true;
  }
  if (view.screen === 'duel') {
    const duel = state.duel || {};
    if (duel.stage === 'pull-ready' || duel.stage === 'pull-result' || duel.stage === 'noop' || duel.stage === 'pull-handoff') {
      W.send(state, { type: 'ack' });
      return true;
    }
    if (duel.stage === 'who') {
      const russe = W.living(state).filter(function (person) { return person.role === 'russe' && !person.russeUsed; })[0];
      W.send(state, { type: 'confirm', id: russe ? russe.id : W.living(state)[0].id });
      return true;
    }
    if (duel.stage === 'pick') {
      const foes = others(state, duel.russeId).slice(0, 2).map(function (person) { return person.id; });
      W.send(state, { type: 'confirm', ids: foes });
      return true;
    }
  }
  if (view.screen === 'hunter' && view.step === 'show') {
    const target = W.living(state)[0];
    W.send(state, { type: 'confirm', id: target.id });
    return true;
  }
  if (view.prompt) {
    const action = decide(state, view.prompt, view.playerId);
    if (view.prompt.kind === 'amor') W.send(state, { type: 'select', id: action.ids[0] }), W.send(state, { type: 'select', id: action.ids[1] });
    W.send(state, action);
    if (state.error && state.error !== 'Interner Fehler.') state.error = '';
    return true;
  }
  throw new Error('kein Zug ' + JSON.stringify(view));
}

function play(state, limit) {
  let guard = 0;
  let last = '';
  let stuck = 0;
  while (state.screen !== 'end') {
    step(state);
    assert.notStrictEqual(state.error, 'Interner Fehler.');
    linksOk(state);
    if (state.winner) {
      const alive = W.living(state);
      if (state.winner === 'liebespaar') {
        assert.ok(alive.length >= 2);
        const comp = W.loverComponent(state, alive[0].id).filter(function (id) { return p(state, id).alive; });
        assert.strictEqual(comp.length, alive.length);
      }
      if (state.winner === 'dorf') assert.ok(!alive.some(function (person) { return person.role === 'werwolf'; }));
      if (state.winner === 'woelfe') {
        const wolves = alive.filter(function (person) { return person.role === 'werwolf'; }).length;
        assert.ok(wolves >= alive.length - wolves);
      }
    }
    const mark = state.screen + ':' + state.step + ':' + state.nightNumber + ':' + (state.nightDone || []).length + ':' + (state.promptIndex || 0);
    if (mark === last) stuck += 1;
    else stuck = 0;
    last = mark;
    if (stuck > 8) throw new Error('festgefahren ' + mark + ' ' + state.error);
    if (++guard > (limit || 800)) throw new Error('zu lang ' + state.screen);
  }
  const scored = W.scoreRecipients(state);
  if (state.winner === 'politiker') assert.ok(scored.indexOf(p(state, state.players.find(function (person) { return person.role === 'politiker'; }).id).name) >= 0);
  else scored.forEach(function (name) {
    const person = state.players.filter(function (one) { return one.name === name; })[0];
    assert.ok(person.alive);
  });
}

function openNight(state, id) {
  if (state.screen === 'reveal') revealAndStart(state);
  W.send(state, { type: 'night-pick', id: id });
  W.send(state, { type: 'go' });
}

function ackInfo(state) {
  const view = W.view(state);
  if (view.prompt && (view.prompt.kind === 'sleep' || view.prompt.kind === 'love' || view.prompt.kind === 'notice' || view.prompt.kind === 'info' || view.prompt.kind === 'seer-result')) {
    W.send(state, { type: 'ack' });
  }
}

function finishCurrent(state) {
  let guard = 0;
  while (state.screen === 'night' && state.activeId != null) {
    const view = W.view(state);
    if (!view.prompt) break;
    const action = decide(state, view.prompt, view.playerId);
    if (view.prompt.kind === 'amor') {
      W.send(state, { type: 'select', id: action.ids[0] });
      W.send(state, { type: 'select', id: action.ids[1] });
    }
    W.send(state, action);
    if (++guard > 20) throw new Error('Zug haengt ' + JSON.stringify(W.view(state)));
  }
}

function everyoneSleepsExcept(state, acts) {
  if (state.screen === 'reveal') revealAndStart(state);
  const order = W.living(state).map(function (person) { return person.id; });
  order.forEach(function (id) {
    if ((state.nightDone || []).indexOf(id) >= 0) return;
    openNight(state, id);
    const custom = acts && acts[id];
    if (custom) custom();
    else finishCurrent(state);
  });
}

test('Start, Namensliste und Rollen bleiben bis zum Start sichtbar', function () {
  const state = make(['werwolf', 'dorfbewohner', 'dorfbewohner', 'dorfbewohner']);
  revealAndStart(state);
  const late = livingNotDone(state, 'nightDone').map(function (person) { return person.id; });
  W.send(state, { type: 'night-pick', id: late[late.length - 1] });
  assert.strictEqual(state.step, 'ready');
  W.send(state, { type: 'back' });
  W.send(state, { type: 'night-pick', id: late[0] });
  W.send(state, { type: 'go' });
  assert.strictEqual(W.view(state).prompt.kind, 'wolf');
  assert.strictEqual(W.view(state).prompt.target, 'house');
});

test('Amor verbindet Wolf und Dorf, das Paar gewinnt allein und bekommt Punkte', function () {
  const state = make(['werwolf', 'dorfbewohner', 'dorfbewohner', 'amor']);
  revealAndStart(state, { 4: [1, 2] });
  assert.deepStrictEqual(p(state, 1).loverIds, [2]);
  assert.deepStrictEqual(p(state, 2).loverIds, [1]);
  openNight(state, 4);
  assert.notStrictEqual(W.view(state).prompt.kind, 'amor');
  W.send(state, { type: 'ack' });
  openNight(state, 2);
  const love = W.view(state).prompt;
  assert.strictEqual(love.kind, 'love');
  W.send(state, { type: 'ack' });
  assert.ok(state.nightDone.indexOf(2) >= 0);
  openNight(state, 1);
  assert.strictEqual(W.view(state).prompt.kind, 'love');
  W.send(state, { type: 'ack' });
  W.send(state, { type: 'confirm', id: 3 });
  openNight(state, 3);
  W.send(state, { type: 'ack' });
  assert.strictEqual(state.screen, 'announce');
  assert.strictEqual(p(state, 3).alive, false);
  assert.strictEqual(p(state, 1).alive, true);
  assert.strictEqual(p(state, 2).alive, true);
  W.send(state, { type: 'ack' });
  assert.strictEqual(state.day, 1);
  assert.strictEqual(state.mayorId, 1);
  W.send(state, { type: 'to-vote' });
  [2, 4, 1].forEach(function (id) {
    W.send(state, { type: 'vote-pick', id: id });
    W.send(state, { type: 'go' });
    W.send(state, { type: 'confirm', id: 4 });
  });
  W.send(state, { type: 'ack' });
  W.send(state, { type: 'ack' });
  assert.strictEqual(state.winner, 'liebespaar');
  assert.deepStrictEqual(W.scoreRecipients(state).sort(), ['P1', 'P2']);
  const again = W.awardOnce({ P9: 4 }, state);
  assert.strictEqual(again.scores.P1, 1);
  assert.strictEqual(again.scores.P9, 4);
  linksOk(state);
});

test('Liebestod durch Wolf, Gift, Wahl, Duell und Jäger', function () {
  function pairDies(state, killer) {
    W.addLink(state, 2, 3);
    killer(state);
    assert.strictEqual(p(state, 2).alive, false);
    assert.strictEqual(p(state, 3).alive, false);
    assert.deepStrictEqual(p(state, 2).loverIds, []);
    assert.deepStrictEqual(p(state, 3).loverIds, []);
  }
  const wolf = make(['werwolf', 'dorfbewohner', 'dorfbewohner', 'dorfbewohner']);
  revealAndStart(wolf);
  pairDies(wolf, function () {
    openNight(wolf, 1);
    W.send(wolf, { type: 'confirm', id: 2 });
    [2, 3, 4].forEach(function (id) { openNight(wolf, id); W.send(wolf, { type: 'ack' }); });
  });
  assert.ok(wolf.obit.some(function (row) { return row.id === 3 && row.cause === 'liebe'; }));

  const poison = make(['hexe', 'dorfbewohner', 'dorfbewohner', 'werwolf']);
  revealAndStart(poison);
  pairDies(poison, function () {
    openNight(poison, 1);
    assert.strictEqual(W.view(poison).prompt.kind, 'heal');
    assert.ok(!W.view(poison).prompt.victim && !W.view(poison).prompt.seenId);
    W.send(poison, { type: 'skip' });
    assert.strictEqual(W.view(poison).prompt.kind, 'poison');
    W.send(poison, { type: 'confirm', id: 2 });
    openNight(poison, 4);
    W.send(poison, { type: 'skip' });
    [2, 3].forEach(function (id) { openNight(poison, id); W.send(poison, { type: 'ack' }); });
  });

  const vote = make(['dorfbewohner', 'dorfbewohner', 'dorfbewohner', 'werwolf']);
  revealAndStart(vote);
  [1, 2, 3, 4].forEach(function (id) { openNight(vote, id); if (id === 4) W.send(vote, { type: 'skip' }); else W.send(vote, { type: 'ack' }); });
  W.send(vote, { type: 'ack' });
  W.addLink(vote, 2, 3);
  W.send(vote, { type: 'to-vote' });
  [1, 2, 3, 4].forEach(function (id) {
    W.send(vote, { type: 'vote-pick', id: id });
    W.send(vote, { type: 'go' });
    W.send(vote, { type: 'confirm', id: 2 });
  });
  W.send(vote, { type: 'ack' });
  W.send(vote, { type: 'ack' });
  assert.strictEqual(p(vote, 2).alive, false);
  assert.strictEqual(p(vote, 3).alive, false);
  assert.strictEqual(vote.winner, 'woelfe');
  assert.strictEqual(vote.screen, 'end');

  const duel = make(['russe', 'dorfbewohner', 'dorfbewohner', 'werwolf'], { rng: rngConst(0.2) });
  revealAndStart(duel);
  [1, 2, 3].forEach(function (id) { openNight(duel, id); W.send(duel, { type: 'ack' }); });
  openNight(duel, 4);
  W.send(duel, { type: 'skip' });
  W.send(duel, { type: 'ack' });
  W.addLink(duel, 1, 2);
  W.send(duel, { type: 'to-duel' });
  W.send(duel, { type: 'confirm', id: 1 });
  W.send(duel, { type: 'confirm', ids: [2] });
  assert.strictEqual(duel.duel.order[0], 1);
  assert.strictEqual(duel.duel.bulletAt, 1);
  W.send(duel, { type: 'ack' });
  W.send(duel, { type: 'ack' });
  W.send(duel, { type: 'ack' });
  W.send(duel, { type: 'ack' });
  assert.strictEqual(p(duel, 2).alive, false);
  assert.strictEqual(p(duel, 1).alive, false);
  if (duel.screen === 'announce') W.send(duel, { type: 'ack' });
  assert.strictEqual(duel.winner, 'woelfe');
  assert.strictEqual(duel.screen, 'end');

  const hunter = make(['jaeger', 'dorfbewohner', 'werwolf', 'dorfbewohner']);
  revealAndStart(hunter);
  W.addLink(hunter, 1, 2);
  openNight(hunter, 3);
  W.send(hunter, { type: 'confirm', id: 1 });
  [1, 2, 4].forEach(function (id) { openNight(hunter, id); W.send(hunter, { type: 'ack' }); });
  assert.strictEqual(hunter.screen, 'hunter');
  assert.strictEqual(p(hunter, 1).alive, false);
  assert.strictEqual(p(hunter, 2).alive, false);
  W.send(hunter, { type: 'hunter-pick', id: 1 });
  W.send(hunter, { type: 'go' });
  W.send(hunter, { type: 'confirm', id: 3 });
  assert.strictEqual(p(hunter, 3).alive, false);
  assert.strictEqual(hunter.winner, 'dorf');
});

test('Getrennte Paare bleiben getrennt, eine zweite Liebe verkettet', function () {
  const state = make(['amor', 'dorfbewohner', 'dorfbewohner', 'dorfbewohner', 'nachahmerin', 'werwolf'], { nachUses: 2 });
  revealAndStart(state, { 1: [2, 3] });
  openNight(state, 1);
  assert.notStrictEqual(W.view(state).prompt.kind, 'amor');
  W.send(state, { type: 'ack' });
  openNight(state, 5);
  W.send(state, { type: 'confirm', id: 1 });
  W.send(state, { type: 'select', id: 4 });
  W.send(state, { type: 'select', id: 5 });
  W.send(state, { type: 'confirm', ids: [4, 5] });
  assert.strictEqual(W.view(state).prompt.kind, 'love');
  W.send(state, { type: 'ack' });
  assert.deepStrictEqual(p(state, 2).loverIds, [3]);
  assert.deepStrictEqual(p(state, 4).loverIds, [5]);
  assert.ok(W.loverComponent(state, 2).indexOf(5) < 0);
  [2, 3, 4].forEach(function (id) { openNight(state, id); W.send(state, { type: 'ack' }); });
  openNight(state, 6);
  W.send(state, { type: 'skip' });
  W.send(state, { type: 'ack' });
  W.send(state, { type: 'to-vote' });
  W.living(state).forEach(function (person) {
    W.send(state, { type: 'vote-pick', id: person.id });
    W.send(state, { type: 'go' });
    W.send(state, { type: 'confirm', id: 0 });
  });
  W.send(state, { type: 'ack' });
  openNight(state, 5);
  if (W.view(state).prompt.kind === 'love') W.send(state, { type: 'ack' });
  assert.strictEqual(W.view(state).prompt.kind, 'copy');
  W.send(state, { type: 'confirm', id: 1 });
  W.send(state, { type: 'select', id: 3 });
  W.send(state, { type: 'select', id: 4 });
  W.send(state, { type: 'confirm', ids: [3, 4] });
  assert.ok(p(state, 2).loverIds.indexOf(3) >= 0);
  assert.ok(p(state, 3).loverIds.indexOf(4) >= 0);
  assert.ok(W.loverComponent(state, 2).indexOf(5) >= 0);
  assert.strictEqual(p(state, 5).nachLeft, 0);
});

test('Waschbär stiehlt Personen, sofort oder in der nächsten Nacht, und beendet das Spiel nicht', function () {
  const away = make(['waschbaer', 'nutte', 'dorfbewohner', 'werwolf']);
  revealAndStart(away);
  openNight(away, 2);
  W.send(away, { type: 'confirm', id: 3 });
  openNight(away, 1);
  assert.strictEqual(W.view(away).prompt.target, 'person');
  W.send(away, { type: 'confirm', id: 2 });
  assert.strictEqual(away.error, '');
  assert.strictEqual(p(away, 1).stealUsed, true);
  assert.strictEqual(p(away, 1).role, 'waschbaer');
  assert.strictEqual(away.pendingThefts[0].role, 'nutte');

  const amor = make(['waschbaer', 'amor', 'dorfbewohner', 'werwolf']);
  revealAndStart(amor, { 2: [2, 3] });
  assert.deepStrictEqual(p(amor, 2).loverIds, [3]);
  openNight(amor, 2);
  assert.notStrictEqual(W.view(amor).prompt.kind, 'amor');
  W.send(amor, { type: 'ack' });
  openNight(amor, 1);
  W.send(amor, { type: 'confirm', id: 2 });
  assert.strictEqual(p(amor, 1).stealUsed, true);
  assert.deepStrictEqual(p(amor, 2).loverIds, [3]);
  assert.deepStrictEqual(p(amor, 1).loverIds, []);
  [3, 4].forEach(function (id) { openNight(amor, id); const kind = W.view(amor).prompt.kind; if (kind === 'wolf') W.send(amor, { type: 'skip' }); else W.send(amor, { type: 'ack' }); });
  W.send(amor, { type: 'ack' });
  W.send(amor, { type: 'to-vote' });
  W.living(amor).forEach(function (person) {
    W.send(amor, { type: 'vote-pick', id: person.id });
    W.send(amor, { type: 'go' });
    W.send(amor, { type: 'confirm', id: 0 });
  });
  W.send(amor, { type: 'ack' });
  assert.strictEqual(amor.nightNumber, 2);
  assert.strictEqual(p(amor, 1).role, 'amor');
  assert.strictEqual(p(amor, 2).role, 'dorfbewohner');
  openNight(amor, 1);
  assert.notStrictEqual(W.view(amor).prompt.kind, 'amor');
  assert.deepStrictEqual(p(amor, 2).loverIds, [3]);

  const wolf = make(['waschbaer', 'werwolf', 'dorfbewohner', 'dorfbewohner']);
  revealAndStart(wolf);
  openNight(wolf, 1);
  W.send(wolf, { type: 'confirm', id: 2 });
  assert.strictEqual(wolf.winner, null);
  assert.strictEqual(wolf.screen, 'night');
  assert.strictEqual(p(wolf, 1).role, 'werwolf');
  assert.strictEqual(p(wolf, 2).role, 'dorfbewohner');
  assert.strictEqual(W.view(wolf).prompt.kind, 'wolf');
  W.send(wolf, { type: 'skip' });
  openNight(wolf, 2);
  assert.strictEqual(W.view(wolf).prompt.kind, 'notice');
  W.send(wolf, { type: 'ack' });
  [3, 4].forEach(function (id) { openNight(wolf, id); W.send(wolf, { type: 'ack' }); });
  W.send(wolf, { type: 'ack' });
  W.send(wolf, { type: 'to-vote' });
  W.living(wolf).forEach(function (person) {
    W.send(wolf, { type: 'vote-pick', id: person.id });
    W.send(wolf, { type: 'go' });
    W.send(wolf, { type: 'confirm', id: 0 });
  });
  W.send(wolf, { type: 'ack' });
  assert.strictEqual(p(wolf, 1).role, 'werwolf');
  assert.strictEqual(W.teamOfRole(p(wolf, 1).role), 'wolf');
  assert.strictEqual(p(wolf, 2).role, 'dorfbewohner');
  openNight(wolf, 1);
  assert.strictEqual(W.view(wolf).prompt.kind, 'wolf');
});

test('Nachahmerin verbraucht einen Einsatz ohne Fähigkeit und muss beim Waschbären stehlen', function () {
  const state = make(['nachahmerin', 'dorfbewohner', 'waschbaer', 'werwolf']);
  revealAndStart(state);
  openNight(state, 1);
  W.send(state, { type: 'confirm', id: 2 });
  assert.strictEqual(p(state, 1).nachLeft, 0);
  assert.strictEqual(W.view(state).prompt.kind, 'info');
  W.send(state, { type: 'ack' });
  const again = make(['nachahmerin', 'waschbaer', 'dorfbewohner', 'werwolf'], { nachUses: 1 });
  revealAndStart(again);
  openNight(again, 1);
  W.send(again, { type: 'confirm', id: 2 });
  assert.strictEqual(W.view(again).prompt.kind, 'steal');
  assert.strictEqual(W.view(again).prompt.forced, true);
  W.send(again, { type: 'skip' });
  assert.ok(again.error);
  W.send(again, { type: 'confirm', id: 3 });
  assert.strictEqual(p(again, 1).role, 'dorfbewohner');
  assert.strictEqual(p(again, 3).role, 'dorfbewohner');
  assert.strictEqual(again.pendingThefts.length, 0);
  assert.strictEqual(p(again, 2).stealUsed, false);
});

test('Nutte: leeres Haus, Gastgeber, Heiltrank und Tagestreffer nur auf sie', function () {
  const state = make(['nutte', 'dorfbewohner', 'werwolf', 'hexe'], { healPotions: 2 });
  revealAndStart(state);
  openNight(state, 1);
  W.send(state, { type: 'confirm', id: 2 });
  openNight(state, 3);
  W.send(state, { type: 'confirm', id: 1 });
  openNight(state, 4);
  W.send(state, { type: 'skip' });
  W.send(state, { type: 'skip' });
  openNight(state, 2);
  W.send(state, { type: 'ack' });
  assert.strictEqual(p(state, 1).alive, true);
  assert.strictEqual(p(state, 2).alive, true);
  W.send(state, { type: 'ack' });
  W.send(state, { type: 'to-vote' });
  W.living(state).forEach(function (person) {
    W.send(state, { type: 'vote-pick', id: person.id });
    W.send(state, { type: 'go' });
    W.send(state, { type: 'confirm', id: 0 });
  });
  W.send(state, { type: 'ack' });
  openNight(state, 1);
  W.send(state, { type: 'confirm', id: 2 });
  openNight(state, 3);
  W.send(state, { type: 'confirm', id: 2 });
  openNight(state, 4);
  assert.strictEqual(W.view(state).prompt.kind, 'heal');
  W.send(state, { type: 'confirm', id: 2 });
  assert.strictEqual(W.view(state).prompt.kind, 'heal');
  W.send(state, { type: 'confirm', id: 1 });
  W.send(state, { type: 'confirm', id: 2 });
  openNight(state, 2);
  W.send(state, { type: 'ack' });
  assert.strictEqual(p(state, 1).alive, true, 'Heiltrank rettet Nutte und Gastgeber');
  assert.strictEqual(p(state, 2).alive, true);
  assert.strictEqual(p(state, 4).healsLeft, 0);
  assert.strictEqual(p(state, 4).poisonLeft, false);
});

function sleepNight(state, acts) {
  W.living(state).forEach(function (person) {
    if ((state.nightDone || []).indexOf(person.id) >= 0) return;
    openNight(state, person.id);
    if (acts && acts[person.id]) acts[person.id]();
    else {
      const kind = W.view(state).prompt && W.view(state).prompt.kind;
      if (kind === 'wolf' || kind === 'heal' || kind === 'poison' || kind === 'schaufel') W.send(state, { type: 'skip' });
      else W.send(state, { type: 'ack' });
    }
  });
}

function voteNiemand(state) {
  if (state.screen === 'announce') W.send(state, { type: 'ack' });
  W.send(state, { type: 'to-vote' });
  W.living(state).forEach(function (person) {
    W.send(state, { type: 'vote-pick', id: person.id });
    W.send(state, { type: 'go' });
    W.send(state, { type: 'confirm', id: 0 });
  });
  W.send(state, { type: 'ack' });
}

test('Schaufel holt einen Liebenden ohne Liebe und eine leere Hexe zurück, der Jäger schießt erneut', function () {
  const hexe = make(['schaufel', 'hexe', 'werwolf', 'dorfbewohner', 'dorfbewohner']);
  revealAndStart(hexe);
  W.addLink(hexe, 2, 4);
  p(hexe, 2).healsLeft = 0;
  p(hexe, 2).poisonLeft = false;
  sleepNight(hexe, { 3: function () { W.send(hexe, { type: 'confirm', id: 2 }); } });
  assert.strictEqual(p(hexe, 2).alive, false);
  assert.strictEqual(p(hexe, 4).alive, false);
  voteNiemand(hexe);
  openNight(hexe, 1);
  assert.strictEqual(W.view(hexe).prompt.kind, 'schaufel');
  assert.strictEqual(W.view(hexe).prompt.target, 'person');
  W.send(hexe, { type: 'confirm', id: 2 });
  sleepNight(hexe, { 3: function () { W.send(hexe, { type: 'skip' }); } });
  assert.strictEqual(p(hexe, 2).alive, true);
  assert.deepStrictEqual(p(hexe, 2).loverIds, []);
  assert.strictEqual(p(hexe, 2).role, 'hexe');
  assert.strictEqual(p(hexe, 2).healsLeft, 0);
  assert.strictEqual(p(hexe, 2).poisonLeft, false);
  assert.strictEqual(p(hexe, 4).alive, false);

  const bow = make(['schaufel', 'jaeger', 'werwolf', 'dorfbewohner', 'dorfbewohner']);
  revealAndStart(bow);
  sleepNight(bow, { 3: function () { W.send(bow, { type: 'confirm', id: 2 }); } });
  assert.strictEqual(bow.screen, 'hunter');
  W.send(bow, { type: 'hunter-pick', id: 2 });
  W.send(bow, { type: 'go' });
  W.send(bow, { type: 'confirm', id: 4 });
  assert.strictEqual(p(bow, 2).hunterShot, true);
  assert.strictEqual(bow.winner, null);
  voteNiemand(bow);
  openNight(bow, 1);
  W.send(bow, { type: 'confirm', id: 2 });
  sleepNight(bow, { 3: function () { W.send(bow, { type: 'skip' }); } });
  assert.strictEqual(p(bow, 2).alive, true);
  assert.strictEqual(p(bow, 2).hunterShot, false);
  voteNiemand(bow);
  openNight(bow, 3);
  W.send(bow, { type: 'confirm', id: 2 });
  sleepNight(bow);
  assert.strictEqual(bow.screen, 'hunter');
  assert.ok(bow.hunters.indexOf(2) >= 0);
});

test('Russe tötet Bürgermeister, Jäger und einen Liebenden, der Tag geht weiter', function () {
  const state = make(['russe', 'jaeger', 'dorfbewohner', 'dorfbewohner', 'dorfbewohner', 'werwolf'], { rng: rngConst(0) });
  revealAndStart(state);
  sleepNight(state, { 6: function () { W.send(state, { type: 'skip' }); } });
  if (state.screen === 'announce') W.send(state, { type: 'ack' });
  assert.strictEqual(state.mayorId, 1);
  assert.strictEqual(state.screen, 'discuss');
  W.addLink(state, 1, 2);
  W.send(state, { type: 'to-duel' });
  W.send(state, { type: 'confirm', id: 1 });
  W.send(state, { type: 'confirm', ids: [3] });
  W.send(state, { type: 'ack' });
  assert.strictEqual(state.duel.hit, true);
  W.send(state, { type: 'ack' });
  assert.strictEqual(p(state, 1).alive, false);
  assert.strictEqual(p(state, 2).alive, false);
  assert.notStrictEqual(state.mayorId, 1);
  assert.strictEqual(state.screen, 'hunter');
  W.send(state, { type: 'hunter-pick', id: 2 });
  W.send(state, { type: 'go' });
  W.send(state, { type: 'confirm', id: 3 });
  if (state.screen === 'announce') W.send(state, { type: 'ack' });
  assert.strictEqual(state.screen, 'discuss');
  assert.strictEqual(p(state, 1).russeUsed, true);
  assert.strictEqual(state.winner, null);
});

test('Politiker gewinnt nur durch die Wahl und bekommt den Punkt', function () {
  const state = make(['politiker', 'dorfbewohner', 'werwolf', 'dorfbewohner']);
  revealAndStart(state);
  [1, 2, 4].forEach(function (id) { openNight(state, id); W.send(state, { type: 'ack' }); });
  openNight(state, 3);
  W.send(state, { type: 'skip' });
  W.send(state, { type: 'ack' });
  W.send(state, { type: 'to-vote' });
  [1, 2, 3, 4].forEach(function (id) {
    W.send(state, { type: 'vote-pick', id: id });
    W.send(state, { type: 'go' });
    W.send(state, { type: 'confirm', id: 1 });
  });
  W.send(state, { type: 'ack' });
  assert.strictEqual(state.winner, 'politiker');
  assert.strictEqual(p(state, 1).alive, false);
  assert.deepStrictEqual(W.scoreRecipients(state), ['P1']);
  const shot = make(['politiker', 'jaeger', 'werwolf', 'dorfbewohner']);
  shot.obit = [];
  shot.hunters = [];
  W.applyDeath(shot, 1, 'jaeger');
  assert.strictEqual(shot.winner, null);
});

test('Bürgermeister: Tag 1, Drehung ab Nacht 2, Stimme 1,5 und Gleichstand', function () {
  const state = make(['dorfbewohner', 'dorfbewohner', 'dorfbewohner', 'werwolf']);
  revealAndStart(state);
  [1, 2, 3].forEach(function (id) { openNight(state, id); W.send(state, { type: 'ack' }); });
  openNight(state, 4);
  W.send(state, { type: 'skip' });
  W.send(state, { type: 'ack' });
  assert.strictEqual(state.day, 1);
  assert.strictEqual(state.mayorId, 1);
  W.send(state, { type: 'to-vote' });
  W.living(state).forEach(function (person) {
    W.send(state, { type: 'vote-pick', id: person.id });
    W.send(state, { type: 'go' });
    W.send(state, { type: 'confirm', id: 0 });
  });
  W.send(state, { type: 'ack' });
  [1, 2, 3].forEach(function (id) { openNight(state, id); W.send(state, { type: 'ack' }); });
  openNight(state, 4);
  W.send(state, { type: 'skip' });
  W.send(state, { type: 'ack' });
  assert.strictEqual(state.nightNumber, 2);
  assert.strictEqual(state.mayorId, 2);

  const tie = make(['dorfbewohner', 'dorfbewohner', 'dorfbewohner', 'dorfbewohner', 'werwolf']);
  revealAndStart(tie);
  [1, 2, 3, 4].forEach(function (id) { openNight(tie, id); W.send(tie, { type: 'ack' }); });
  openNight(tie, 5);
  W.send(tie, { type: 'skip' });
  W.send(tie, { type: 'ack' });
  W.send(tie, { type: 'to-vote' });
  const choice = { 1: 5, 2: 2, 3: 2, 4: 3, 5: 3 };
  [1, 2, 3, 4, 5].forEach(function (id) {
    W.send(tie, { type: 'vote-pick', id: id });
    W.send(tie, { type: 'go' });
    W.send(tie, { type: 'confirm', id: choice[id] });
  });
  assert.strictEqual(tie.screen, 'announce');
  assert.ok(tie.announce.lines.some(function (line) { return line.indexOf('Gleichstand') >= 0; }));
  [1, 2, 3, 4, 5].forEach(function (id) { assert.strictEqual(p(tie, id).alive, true); });
  const weights = tie.lastTally;
  assert.strictEqual(weights['2'], 4);
  assert.strictEqual(weights['3'], 4);
  assert.strictEqual(weights['5'], 3);
});

test('Hexe legt mehrere Heiltränke in einer Nacht, der Pool hält Min und Max', function () {
  const state = make(['hexe', 'dorfbewohner', 'werwolf', 'dorfbewohner'], { healPotions: 3 });
  revealAndStart(state);
  openNight(state, 1);
  assert.strictEqual(W.view(state).prompt.kind, 'heal');
  W.send(state, { type: 'confirm', id: 2 });
  W.send(state, { type: 'confirm', id: 3 });
  W.send(state, { type: 'confirm', id: 4 });
  assert.strictEqual(p(state, 1).healsLeft, 0);
  assert.deepStrictEqual(state.heals.map(Number).sort(), [2, 3, 4]);
  const counts = blank();
  counts.dorfbewohner = 8;
  counts.seherin = 2;
  const seen = { 1: 0, 2: 0 };
  for (let seed = 1; seed <= 30; seed++) {
    let s = seed;
    const rng = function () {
      s = (Math.imul(1664525, s) + 1013904223) >>> 0;
      return s / 4294967296;
    };
    const dealt = W.createGame(['A', 'B', 'C', 'D', 'E', 'F'], counts, {
      rng: rng, rolePool: true, wolfMin: 1, wolfMax: 2, nachUses: 1
    });
    const wolves = dealt.players.filter(function (person) { return person.role === 'werwolf'; }).length;
    assert.ok(wolves >= 1 && wolves <= 2);
    seen[wolves] += 1;
  }
  assert.ok(seen[1] > 0 && seen[2] > 0);
});

test('Viele volle Partien bleiben in den Siegregeln', function () {
  const decks = [
    ['werwolf', 'dorfbewohner', 'dorfbewohner', 'dorfbewohner'],
    ['werwolf', 'amor', 'dorfbewohner', 'dorfbewohner'],
    ['werwolf', 'hexe', 'nutte', 'dorfbewohner'],
    ['werwolf', 'waschbaer', 'amor', 'jaeger'],
    ['werwolf', 'nachahmerin', 'seherin', 'dorfbewohner'],
    ['werwolf', 'russe', 'jaeger', 'dorfbewohner'],
    ['werwolf', 'politiker', 'hexe', 'dorfbewohner'],
    ['werwolf', 'schaufel', 'jaeger', 'hexe'],
    ['werwolf', 'werwolf', 'dorfbewohner', 'dorfbewohner', 'seherin', 'amor'],
    ['nutte', 'hexe', 'jaeger', 'amor', 'werwolf', 'dorfbewohner']
  ];
  decks.forEach(function (roles, index) {
    const state = make(roles, { rng: rngConst(index % 5 === 0 ? 0 : 0.34), healPotions: 2, nachUses: 1 });
    play(state);
    assert.ok(state.winner);
    assert.strictEqual(state.screen, 'end');
  });
});

test('Nutte stirbt mit dem Gastgeber, die Wahl trifft nur sie, die Seherin sieht sie', function () {
  const state = make(['nutte', 'dorfbewohner', 'werwolf', 'seherin']);
  revealAndStart(state);
  openNight(state, 1);
  assert.strictEqual(W.view(state).prompt.target, 'house');
  W.send(state, { type: 'confirm', id: 2 });
  openNight(state, 3);
  W.send(state, { type: 'confirm', id: 2 });
  openNight(state, 4);
  assert.strictEqual(W.view(state).prompt.kind, 'seer');
  assert.strictEqual(W.view(state).prompt.target, 'person');
  W.send(state, { type: 'confirm', id: 1 });
  assert.strictEqual(W.view(state).prompt.label, 'Team Dorfbewohner');
  assert.strictEqual(W.view(state).prompt.exact, false);
  W.send(state, { type: 'ack' });
  openNight(state, 2);
  W.send(state, { type: 'ack' });
  assert.strictEqual(p(state, 1).alive, false);
  assert.strictEqual(p(state, 2).alive, false);
  const day = make(['nutte', 'dorfbewohner', 'werwolf', 'dorfbewohner']);
  revealAndStart(day);
  openNight(day, 1);
  W.send(day, { type: 'confirm', id: 2 });
  openNight(day, 3);
  W.send(day, { type: 'skip' });
  [2, 4].forEach(function (id) { openNight(day, id); W.send(day, { type: 'ack' }); });
  W.send(day, { type: 'ack' });
  W.send(day, { type: 'to-vote' });
  W.living(day).forEach(function (person) {
    W.send(day, { type: 'vote-pick', id: person.id });
    W.send(day, { type: 'go' });
    W.send(day, { type: 'confirm', id: 1 });
  });
  W.send(day, { type: 'ack' });
  W.send(day, { type: 'ack' });
  assert.strictEqual(p(day, 1).alive, false);
  assert.strictEqual(p(day, 2).alive, true);
});

test('Politiker: die eigene Wahl beendet sofort, die Wahl des Partners nicht', function () {
  const own = make(['politiker', 'jaeger', 'werwolf', 'dorfbewohner', 'dorfbewohner']);
  revealAndStart(own);
  sleepNight(own, { 3: function () { W.send(own, { type: 'skip' }); } });
  if (own.screen === 'announce') W.send(own, { type: 'ack' });
  W.addLink(own, 1, 2);
  W.send(own, { type: 'to-vote' });
  W.living(own).forEach(function (person) {
    W.send(own, { type: 'vote-pick', id: person.id });
    W.send(own, { type: 'go' });
    W.send(own, { type: 'confirm', id: 1 });
  });
  W.send(own, { type: 'ack' });
  assert.strictEqual(own.screen, 'end');
  assert.strictEqual(own.winner, 'politiker');
  assert.strictEqual(p(own, 1).alive, false);
  assert.strictEqual(p(own, 2).alive, true);
  assert.strictEqual((own.hunters || []).length, 0);

  const partner = make(['politiker', 'jaeger', 'werwolf', 'dorfbewohner', 'dorfbewohner', 'dorfbewohner']);
  revealAndStart(partner);
  sleepNight(partner, { 3: function () { W.send(partner, { type: 'skip' }); } });
  if (partner.screen === 'announce') W.send(partner, { type: 'ack' });
  W.addLink(partner, 1, 2);
  W.send(partner, { type: 'to-vote' });
  W.living(partner).forEach(function (person) {
    W.send(partner, { type: 'vote-pick', id: person.id });
    W.send(partner, { type: 'go' });
    W.send(partner, { type: 'confirm', id: 2 });
  });
  W.send(partner, { type: 'ack' });
  assert.strictEqual(p(partner, 1).alive, false);
  assert.strictEqual(p(partner, 2).alive, false);
  assert.notStrictEqual(partner.winner, 'politiker');
  assert.strictEqual(partner.screen, 'hunter');
});

test('Amor verbindet beim Aufdecken und bleibt offen, bis das Paar steht', function () {
  const state = make(['amor', 'dorfbewohner', 'dorfbewohner', 'werwolf']);
  W.send(state, { type: 'start-game' });
  assert.strictEqual(state.screen, 'reveal');
  W.send(state, { type: 'reveal-pick', id: 1 });
  assert.strictEqual(state.step, 'link');
  W.send(state, { type: 'back' });
  assert.strictEqual(state.step, 'list');
  assert.ok(!W.revealDone(state, p(state, 1)));
  assert.ok(!p(state, 1).amorLinked);
  assert.deepStrictEqual(p(state, 1).loverIds, []);
  assert.ok(W.pendingNames(state).indexOf('P1') >= 0);
  W.send(state, { type: 'reveal-pick', id: 1 });
  W.send(state, { type: 'skip' });
  assert.ok(state.error);
  assert.strictEqual(state.step, 'link');
  W.send(state, { type: 'select', id: 1 });
  W.send(state, { type: 'select', id: 2 });
  W.send(state, { type: 'confirm', ids: [1, 2] });
  assert.strictEqual(state.step, 'love');
  assert.deepStrictEqual(p(state, 1).loverIds, [2]);
  assert.strictEqual(p(state, 1).amorLinked, true);
  assert.ok(!W.revealDone(state, p(state, 1)));
  W.send(state, { type: 'ack' });
  assert.strictEqual(state.step, 'list');
  assert.ok(W.revealDone(state, p(state, 1)));
  W.send(state, { type: 'reveal-pick', id: 1 });
  assert.strictEqual(state.step, 'show');
  assert.deepStrictEqual(p(state, 1).amorPair, [1, 2]);
  W.send(state, { type: 'ack' });
  [2, 3, 4].forEach(function (id) { ackReveal(state, id); });
  W.send(state, { type: 'start-game' });
  assert.strictEqual(state.screen, 'night');
  openNight(state, 1);
  assert.notStrictEqual(W.view(state).prompt.kind, 'amor');
  assert.notStrictEqual(W.view(state).prompt.kind, 'love');
  W.send(state, { type: 'ack' });
  openNight(state, 2);
  assert.strictEqual(W.view(state).prompt.kind, 'love');
  assert.strictEqual(p(state, 2).role, 'dorfbewohner');
  W.send(state, { type: 'ack' });
  openNight(state, 3);
  assert.notStrictEqual(W.view(state).prompt.kind, 'love');
});

test('Zurück vom Aufdecken verwirft die Rollen, ab zwei Gesehenen erst nach Frage', function () {
  const roles = ['amor', 'dorfbewohner', 'dorfbewohner', 'werwolf'];
  function paint(state) {
    roles.forEach(function (role, index) {
      const person = state.players[index];
      person.role = role;
      person.alive = true;
      person.loverIds = [];
      person.amorLinked = false;
      person.amorPair = null;
      person.healsLeft = 0;
      person.poisonLeft = false;
    });
  }
  const state = make(roles);
  const wolves = state.counts.werwolf;
  W.send(state, { type: 'undo-deal' });
  assert.strictEqual(state.screen, 'setup');
  assert.strictEqual(state.players[0].role, undefined);
  assert.strictEqual(state.counts.werwolf, wolves);
  W.send(state, { type: 'deal' });
  paint(state);
  assert.strictEqual(state.screen, 'reveal');
  W.send(state, { type: 'reveal-pick', id: 2 });
  W.send(state, { type: 'ack' });
  W.send(state, { type: 'undo-deal' });
  assert.strictEqual(state.screen, 'setup');
  assert.strictEqual(state.players[1].role, undefined);
  W.send(state, { type: 'deal' });
  paint(state);
  ackReveal(state, 2);
  ackReveal(state, 3);
  assert.ok(W.revealDone(state, p(state, 2)));
  W.send(state, { type: 'undo-deal' });
  assert.strictEqual(state.confirmUndoDeal, true);
  assert.strictEqual(state.screen, 'reveal');
  assert.ok(p(state, 2).role);
  W.send(state, { type: 'undo-deal-no' });
  assert.ok(!state.confirmUndoDeal);
  W.send(state, { type: 'reveal-pick', id: 1 });
  W.send(state, { type: 'select', id: 1 });
  W.send(state, { type: 'select', id: 4 });
  W.send(state, { type: 'confirm', ids: [1, 4] });
  if (state.step === 'love') W.send(state, { type: 'ack' });
  assert.ok(p(state, 1).amorLinked);
  W.send(state, { type: 'undo-deal', confirm: true });
  assert.strictEqual(state.screen, 'setup');
  assert.strictEqual(state.players[0].role, undefined);
  assert.ok(!state.players[0].amorLinked);
  assert.strictEqual(state.counts.werwolf, wolves);
});

test('Nachahmerin: Amor ohne zwei Lebende entfällt, der Russe erzwingt am nächsten Tag das Duell', function () {
  const thin = make(['nachahmerin', 'amor', 'dorfbewohner', 'werwolf']);
  revealAndStart(thin);
  openNight(thin, 1);
  W.send(thin, { type: 'confirm', id: 2 });
  assert.strictEqual(W.view(thin).prompt.kind, 'amor');
  thin.players.forEach(function (person) { if (person.id !== 1) person.alive = false; });
  W.send(thin, { type: 'confirm', ids: [1, 2] });
  assert.strictEqual(W.view(thin).prompt.kind, 'info');
  assert.strictEqual((p(thin, 1).loverIds || []).length, 0);

  const state = make(['nachahmerin', 'russe', 'dorfbewohner', 'werwolf', 'dorfbewohner'], { rng: rngConst(0) });
  revealAndStart(state);
  openNight(state, 1);
  W.send(state, { type: 'confirm', id: 2 });
  assert.strictEqual(W.view(state).prompt.kind, 'info');
  W.send(state, { type: 'ack' });
  openNight(state, 4);
  W.send(state, { type: 'skip' });
  [2, 3, 5].forEach(function (id) { openNight(state, id); W.send(state, { type: 'ack' }); });
  if (state.screen === 'announce') W.send(state, { type: 'ack' });
  assert.strictEqual(state.screen, 'duel');
  assert.strictEqual(state.duel.forced, true);
  assert.strictEqual(state.duel.russeId, 1);
  assert.strictEqual(state.day, 1);
  W.send(state, { type: 'cancel' });
  assert.ok(state.error);
  assert.strictEqual(state.screen, 'duel');
  W.send(state, { type: 'select', id: 2 });
  W.send(state, { type: 'confirm', ids: [2] });
  assert.strictEqual(state.duel.order[0], 1);
  W.send(state, { type: 'ack' });
  W.send(state, { type: 'ack' });
  assert.strictEqual(p(state, 1).alive, false);
  if (state.screen === 'announce') W.send(state, { type: 'ack' });
  assert.strictEqual(state.screen, 'discuss');
  assert.notStrictEqual(state.screen, 'duel');
});

test('Schaufel sieht nur Tote vom Vortag, ein toter Dieb macht das Opfer trotzdem zum Dorf', function () {
  const shovel = make(['schaufel', 'dorfbewohner', 'werwolf', 'dorfbewohner']);
  revealAndStart(shovel);
  openNight(shovel, 3);
  W.send(shovel, { type: 'confirm', id: 2 });
  openNight(shovel, 1);
  assert.notStrictEqual(W.view(shovel).prompt.kind, 'schaufel');
  W.send(shovel, { type: 'ack' });
  [2, 4].forEach(function (id) { openNight(shovel, id); W.send(shovel, { type: 'ack' }); });
  if (shovel.screen === 'announce') W.send(shovel, { type: 'ack' });
  voteNiemand(shovel);
  openNight(shovel, 1);
  assert.strictEqual(W.view(shovel).prompt.kind, 'schaufel');
  const targets = W.targetsFor(shovel, W.view(shovel).prompt, 1).map(function (person) { return person.id; });
  assert.deepStrictEqual(targets, [2]);
  W.send(shovel, { type: 'confirm', id: 3 });
  assert.ok(shovel.error);

  const theft = make(['waschbaer', 'seherin', 'werwolf', 'dorfbewohner']);
  revealAndStart(theft);
  openNight(theft, 2);
  W.send(theft, { type: 'confirm', id: 4 });
  W.send(theft, { type: 'ack' });
  openNight(theft, 1);
  W.send(theft, { type: 'confirm', id: 2 });
  assert.strictEqual(theft.pendingThefts[0].applyNight, 2);
  openNight(theft, 3);
  W.send(theft, { type: 'confirm', id: 1 });
  openNight(theft, 4);
  W.send(theft, { type: 'ack' });
  if (theft.screen === 'announce') W.send(theft, { type: 'ack' });
  assert.strictEqual(p(theft, 1).alive, false);
  assert.strictEqual(p(theft, 2).role, 'seherin');
  voteNiemand(theft);
  assert.strictEqual(theft.screen, 'night');
  assert.strictEqual(theft.winner, null);
  assert.strictEqual(p(theft, 2).role, 'dorfbewohner');
  assert.strictEqual(p(theft, 1).role, 'waschbaer');
});

test('Seherin sieht standardmäßig das Lager und mit Schalter die genaue Rolle', function () {
  function look(roles, target, exact) {
    const state = make(roles);
    state.seerExact = !!exact;
    revealAndStart(state);
    openNight(state, 1);
    W.send(state, { type: 'confirm', id: target });
    return W.view(state).prompt;
  }
  const roles = ['seherin', 'werwolf', 'politiker', 'waschbaer', 'dorfbewohner', 'hexe'];
  assert.strictEqual(look(roles, 2, false).label, 'Böse');
  assert.strictEqual(look(roles, 3, false).label, 'Böse');
  assert.strictEqual(look(roles, 4, false).label, 'Böse');
  assert.strictEqual(look(roles, 5, false).label, 'Team Dorfbewohner');
  assert.strictEqual(look(roles, 6, false).label, 'Team Dorfbewohner');
  assert.strictEqual(look(roles, 2, true).exact, true);
  assert.strictEqual(look(roles, 2, true).label, 'Werwolf');
  assert.strictEqual(look(roles, 4, true).label, 'Waschbär');

  const stolen = make(['seherin', 'waschbaer', 'werwolf', 'dorfbewohner', 'politiker']);
  revealAndStart(stolen);
  openNight(stolen, 2);
  W.send(stolen, { type: 'confirm', id: 4 });
  assert.strictEqual(p(stolen, 2).role, 'dorfbewohner');
  W.send(stolen, { type: 'ack' });
  openNight(stolen, 1);
  W.send(stolen, { type: 'confirm', id: 2 });
  assert.strictEqual(W.view(stolen).prompt.label, 'Team Dorfbewohner');
  const wolfish = make(['seherin', 'waschbaer', 'werwolf', 'dorfbewohner']);
  revealAndStart(wolfish);
  openNight(wolfish, 2);
  W.send(wolfish, { type: 'confirm', id: 3 });
  assert.strictEqual(p(wolfish, 2).role, 'werwolf');
  if (W.view(wolfish).prompt.kind === 'wolf') W.send(wolfish, { type: 'skip' });
  openNight(wolfish, 1);
  W.send(wolfish, { type: 'confirm', id: 2 });
  assert.strictEqual(W.view(wolfish).prompt.label, 'Böse');
  const pending = make(['waschbaer', 'seherin', 'dorfbewohner', 'werwolf']);
  revealAndStart(pending);
  openNight(pending, 3);
  W.send(pending, { type: 'ack' });
  openNight(pending, 1);
  W.send(pending, { type: 'confirm', id: 3 });
  assert.strictEqual(p(pending, 1).role, 'waschbaer');
  openNight(pending, 2);
  W.send(pending, { type: 'confirm', id: 1 });
  assert.strictEqual(W.view(pending).prompt.label, 'Böse');
});

test('Zurück nach dem Namen verbraucht nichts und macht den Namen nicht grau', function () {
  const reveal = make(['werwolf', 'dorfbewohner', 'dorfbewohner', 'dorfbewohner']);
  W.send(reveal, { type: 'reveal-pick', id: 2 });
  assert.strictEqual(reveal.step, 'show');
  W.send(reveal, { type: 'back' });
  assert.strictEqual(reveal.step, 'list');
  assert.ok(!reveal.revealed[2]);
  W.send(reveal, { type: 'reveal-pick', id: 2 });
  W.send(reveal, { type: 'ack' });
  assert.strictEqual(reveal.revealed[2], true);

  const state = make(['werwolf', 'dorfbewohner', 'dorfbewohner', 'dorfbewohner']);
  revealAndStart(state);
  W.send(state, { type: 'night-pick', id: 1 });
  W.send(state, { type: 'back' });
  assert.strictEqual(state.step, 'list');
  assert.strictEqual((state.nightDone || []).indexOf(1), -1);
  W.send(state, { type: 'night-pick', id: 1 });
  W.send(state, { type: 'go' });
  W.send(state, { type: 'select', id: 2 });
  W.send(state, { type: 'back' });
  assert.deepStrictEqual(state.wolfVotes, {});
  assert.strictEqual((state.nightDone || []).indexOf(1), -1);
  assert.strictEqual(state.step, 'list');
  [2, 3].forEach(function (id) { openNight(state, id); W.send(state, { type: 'ack' }); });
  openNight(state, 4);
  W.send(state, { type: 'ack' });
  openNight(state, 1);
  W.send(state, { type: 'skip' });
  if (state.screen === 'announce') W.send(state, { type: 'ack' });
  W.send(state, { type: 'to-vote' });
  W.send(state, { type: 'vote-pick', id: 1 });
  W.send(state, { type: 'go' });
  W.send(state, { type: 'select', id: 2 });
  W.send(state, { type: 'back' });
  assert.strictEqual(state.step, 'list');
  assert.strictEqual((state.voteDone || []).indexOf(1), -1);
  assert.ok(!state.votes[1]);

  const hunt = make(['jaeger', 'werwolf', 'dorfbewohner', 'dorfbewohner']);
  revealAndStart(hunt);
  openNight(hunt, 1);
  W.send(hunt, { type: 'ack' });
  openNight(hunt, 2);
  W.send(hunt, { type: 'confirm', id: 1 });
  [3, 4].forEach(function (id) { openNight(hunt, id); W.send(hunt, { type: 'ack' }); });
  assert.strictEqual(hunt.screen, 'hunter');
  W.send(hunt, { type: 'hunter-pick', id: 1 });
  W.send(hunt, { type: 'back' });
  assert.strictEqual(hunt.step, 'list');
  assert.ok(hunt.hunters.indexOf(1) >= 0);
  W.send(hunt, { type: 'hunter-pick', id: 1 });
  W.send(hunt, { type: 'go' });
  W.send(hunt, { type: 'select', id: 3 });
  W.send(hunt, { type: 'back' });
  assert.strictEqual(hunt.step, 'list');
  assert.ok(hunt.hunters.indexOf(1) >= 0);
  assert.strictEqual(p(hunt, 3).alive, true);

  const duel = make(['russe', 'dorfbewohner', 'dorfbewohner', 'werwolf']);
  revealAndStart(duel);
  [1, 2, 3].forEach(function (id) { openNight(duel, id); W.send(duel, { type: 'ack' }); });
  openNight(duel, 4);
  W.send(duel, { type: 'skip' });
  if (duel.screen === 'announce') W.send(duel, { type: 'ack' });
  W.send(duel, { type: 'to-duel' });
  W.send(duel, { type: 'duel-pick', id: 2 });
  assert.strictEqual(duel.duel.stage, 'claim');
  W.send(duel, { type: 'back' });
  assert.strictEqual(duel.duel.stage, 'who');
  assert.strictEqual(p(duel, 1).russeUsed, false);
  assert.strictEqual(duel.screen, 'duel');
});

test('Wolfsopfer öffnet nicht den eigenen Nachtbildschirm', function () {
  const state = make(['A', 'B', 'C', 'D', 'Felix', 'Max'].map(function (name, index) {
    return index === 4 ? 'amor' : index === 5 ? 'werwolf' : 'dorfbewohner';
  }));
  revealAndStart(state, { 5: [1, 2] });
  W.send(state, { type: 'night-pick', id: 6 });
  assert.strictEqual(state.step, 'ready');
  assert.strictEqual(state.activeId, 6);
  W.send(state, { type: 'go' });
  assert.strictEqual(W.view(state).prompt.kind, 'wolf');
  W.send(state, { type: 'select', id: 5 });
  assert.strictEqual(state.activeId, 6);
  assert.strictEqual(state.step, 'show');
  W.send(state, { type: 'confirm', id: 5, ids: [5] });
  assert.strictEqual(state.screen, 'night');
  assert.strictEqual(state.step, 'list');
  assert.strictEqual(state.activeId, null);
  assert.deepStrictEqual(state.prompts, []);
  assert.deepStrictEqual(state.nightDone, [6]);
  assert.strictEqual(state.wolfVotes[6], 5);
  assert.strictEqual(W.view(state).prompt, null);
  assert.notStrictEqual(W.view(state).playerId, 5);
  W.send(state, { type: 'night-pick', id: 5 });
  W.send(state, { type: 'go' });
  assert.strictEqual(state.activeId, 5);
  assert.notStrictEqual(W.view(state).prompt.kind, 'amor');
});

test('Ein lebender Politiker zählt gegen den Wolfsieg, das Dorf gewinnt ohne Wölfe trotzdem', function () {
  const even = make(['werwolf', 'werwolf', 'dorfbewohner', 'dorfbewohner', 'politiker']);
  assert.strictEqual(W.checkWin(even), null);
  assert.strictEqual(even.winner, null);
  const tight = make(['werwolf', 'schaufel', 'politiker', 'dorfbewohner']);
  p(tight, 4).alive = false;
  tight.winner = null;
  assert.strictEqual(W.checkWin(tight), null);
  assert.strictEqual(p(tight, 1).role, 'werwolf');
  assert.strictEqual(p(tight, 2).role, 'schaufel');
  assert.strictEqual(p(tight, 3).role, 'politiker');
  const village = make(['dorfbewohner', 'politiker', 'werwolf', 'dorfbewohner']);
  p(village, 3).alive = false;
  village.winner = null;
  assert.strictEqual(W.checkWin(village), 'dorf');
  assert.strictEqual(village.winReason, 'Kein Werwolf lebt mehr.');
});

console.log(passed + ' Regeltests');

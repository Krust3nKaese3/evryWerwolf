/* Werwolf-Spiellogik. Anzeigenamen nur in ROLE_NAMES ändern. */
(function (root) {
  var APP_VERSION = '1.0.0';

  var ROLE_NAMES = {
    werwolf: 'Werwolf',
    dorfbewohner: 'Dorfbewohner',
    hexe: 'Hexe',
    seherin: 'Seherin',
    amor: 'Amor',
    jaeger: 'Jäger',
    waschbaer: 'Waschbär',
    nachahmerin: 'Nachahmerin',
    nutte: 'Nutte',
    russe: 'Russe',
    politiker: 'Politiker',
    schaufel: 'Schaufel'
  };

  var ROLE_ORDER = [
    'werwolf', 'dorfbewohner', 'hexe', 'seherin', 'amor', 'jaeger',
    'waschbaer', 'nachahmerin', 'nutte', 'russe', 'politiker', 'schaufel'
  ];

  var CAUSE_LABEL = {
    woelfe: 'von den Werwölfen',
    gift: 'durch Gift',
    schuss: 'durch einen nächtlichen Schuss',
    jaeger: 'vom Jäger erschossen',
    liebe: 'aus Liebeskummer',
    abstimmung: 'durch die Abstimmung',
    duell: 'im russischen Roulette'
  };

  var WIN_TEXT = {
    dorf: 'Das Dorf gewinnt.',
    woelfe: 'Die Werwölfe gewinnen.',
    liebespaar: 'Das Liebespaar gewinnt.',
    politiker: 'Der Politiker gewinnt.',
    niemand: 'Niemand gewinnt.'
  };

  function teamOfRole(role) {
    if (role === 'werwolf') return 'wolf';
    if (role === 'politiker') return 'politiker';
    return 'village';
  }

  function blankCounts() {
    var counts = {};
    ROLE_ORDER.forEach(function (role) { counts[role] = 0; });
    return counts;
  }

  function sumCounts(counts) {
    var n = 0;
    ROLE_ORDER.forEach(function (role) { n += counts[role] || 0; });
    return n;
  }

  function defaultCounts(playerCount) {
    var n = playerCount;
    var counts = blankCounts();
    counts.werwolf = n >= 16 ? 4 : n >= 11 ? 3 : n >= 7 ? 2 : 1;
    var order = [
      ['seherin', 5], ['hexe', 6], ['jaeger', 7], ['amor', 7], ['nutte', 7],
      ['waschbaer', 8], ['nachahmerin', 8], ['politiker', 9], ['schaufel', 9], ['russe', 10]
    ];
    order.forEach(function (pair) {
      if (n < pair[1]) return;
      counts[pair[0]] = 1;
      var village = n - counts.werwolf - (counts.politiker || 0);
      var dorf = n - sumCounts(counts);
      if (dorf < 1 || counts.werwolf >= village) counts[pair[0]] = 0;
    });
    counts.dorfbewohner = n - sumCounts(counts);
    return counts;
  }

  function validateSetup(counts, playerCount, nachUses) {
    if (!counts) return 'Keine Rollen.';
    var sum = 0;
    for (var i = 0; i < ROLE_ORDER.length; i++) {
      var c = counts[ROLE_ORDER[i]] || 0;
      if (!isInt(c) || c < 0) return 'Ungültige Rollenanzahl.';
      sum += c;
    }
    if (sum !== playerCount) return 'Die Rollen müssen genau der Spielerzahl entsprechen.';
    if ((counts.werwolf || 0) < 1) return 'Mindestens ein Werwolf.';
    var village = playerCount - (counts.werwolf || 0) - (counts.politiker || 0);
    if (village < 1) return 'Es braucht mindestens eine Person auf der Dorfseite.';
    if ((counts.werwolf || 0) >= village) return 'Zu viele Werwölfe: sie hätten sofort gewonnen.';
    if (!isInt(nachUses) || nachUses < 1 || nachUses > 5) return 'Nachahmungen: 1 bis 5 Einsätze.';
    return '';
  }

  function isInt(n) { return typeof n === 'number' && n === Math.floor(n); }

  function note(state, message) {
    if (!state.log) state.log = [];
    state.log.push({ t: Date.now(), m: String(message) });
    if (state.log.length > 80) state.log.splice(0, state.log.length - 80);
  }

  function playerById(state, id) {
    id = Number(id);
    for (var i = 0; i < state.players.length; i++) {
      if (state.players[i].id === id) return state.players[i];
    }
    return null;
  }

  function makePlayer(id, name, role, nachUses) {
    return {
      id: id,
      name: name,
      role: role || '',
      alive: true,
      healLeft: role === 'hexe',
      poisonLeft: role === 'hexe',
      stealUsed: false,
      nachLeft: role === 'nachahmerin' ? nachUses : 0,
      schaufelUsed: false,
      russeUsed: false,
      hunterShot: false,
      loverIds: [],
      notice: null
    };
  }

  function grantFresh(player, role, nachUses) {
    player.role = role;
    player.healLeft = role === 'hexe';
    player.poisonLeft = role === 'hexe';
    player.stealUsed = false;
    player.nachLeft = role === 'nachahmerin' ? nachUses : 0;
    player.schaufelUsed = false;
    player.russeUsed = false;
    player.hunterShot = false;
  }

  function makeVillager(player) {
    player.role = 'dorfbewohner';
    player.healLeft = false;
    player.poisonLeft = false;
    player.stealUsed = false;
    player.nachLeft = 0;
    player.schaufelUsed = false;
    player.russeUsed = false;
  }

  function shuffle(list, rng) {
    for (var i = list.length - 1; i > 0; i--) {
      var j = Math.floor(rng() * (i + 1));
      var tmp = list[i];
      list[i] = list[j];
      list[j] = tmp;
    }
    return list;
  }

  function newLobby() {
    return {
      v: 1,
      screen: 'lobby',
      players: [],
      nextId: 1,
      log: [],
      error: '',
      day: 0,
      nightNumber: 0,
      winner: null
    };
  }

  function lobbyAdd(state, raw) {
    var name = String(raw || '').trim().slice(0, 16);
    if (!name) {
      state.error = 'Bitte einen Namen eingeben.';
      return;
    }
    var lower = name.toLowerCase();
    for (var i = 0; i < state.players.length; i++) {
      if (state.players[i].name.toLowerCase() === lower) {
        state.error = 'Diesen Namen gibt es schon.';
        return;
      }
    }
    state.players.push({ id: state.nextId++, name: name });
    state.error = '';
    note(state, 'Name ' + name);
  }

  function lobbyRemove(state, id) {
    state.players = state.players.filter(function (p) { return p.id !== Number(id); });
    state.error = '';
    note(state, 'Name entfernt ' + id);
  }

  function beginSetup(state) {
    if (state.players.length < 4) {
      state.error = 'Mindestens 4 Mitspieler.';
      return;
    }
    state.counts = defaultCounts(state.players.length);
    state.nachUses = 1;
    state.error = '';
    setScreen(state, 'setup');
    note(state, 'Rollenwahl');
  }

  function createGame(names, counts, opts) {
    opts = opts || {};
    var rng = opts.rng || Math.random;
    var nachUses = opts.nachUses || 1;
    var err = validateSetup(counts, names.length, nachUses);
    if (err) throw new Error(err);
    var bag = [];
    ROLE_ORDER.forEach(function (role) {
      for (var i = 0; i < (counts[role] || 0); i++) bag.push(role);
    });
    shuffle(bag, rng);
    var players = names.map(function (name, i) {
      return makePlayer(i + 1, name, bag[i], nachUses);
    });
    var state = freshPlaying(players, counts, nachUses, opts.log || []);
    state._rng = rng;
    note(state, 'Spiel startet, Tag 1');
    return state;
  }

  function freshPlaying(players, counts, nachUses, log) {
    return {
      v: 1,
      screen: 'reveal',
      step: 'handoff',
      players: players,
      nextId: players.length + 1,
      counts: counts,
      nachUses: nachUses,
      config: { counts: counts, nachUses: nachUses },
      mayorId: players[0].id,
      day: 1,
      nightNumber: 0,
      pass: 1,
      order: players.map(function (p) { return p.id; }),
      cursor: 0,
      prompts: [],
      promptIndex: 0,
      selection: [],
      wolfVotes: {},
      victimHouse: null,
      extraAttacks: [],
      heals: [],
      poisons: [],
      hosts: {},
      copyHexes: [],
      pendingThefts: [],
      pendingRevives: [],
      votes: {},
      lastTally: null,
      duel: null,
      hunters: [],
      resolution: null,
      obit: [],
      revived: [],
      announce: null,
      seenLove: {},
      bonds: [],
      winner: null,
      winReason: '',
      error: '',
      log: log,
      confirmAbort: false
    };
  }

  function dealInto(state) {
    var names = state.players.map(function (p) { return p.name; });
    var rng = state._rng || Math.random;
    var fresh;
    try {
      fresh = createGame(names, state.counts, { rng: rng, nachUses: state.nachUses, log: state.log });
    } catch (error) {
      state.error = error.message;
      return;
    }
    replaceState(state, fresh);
  }

  function replaceState(state, fresh) {
    Object.keys(state).forEach(function (key) { delete state[key]; });
    Object.keys(fresh).forEach(function (key) { state[key] = fresh[key]; });
  }

  function setScreen(state, screen) {
    if (state.screen !== screen) {
      note(state, 'Bildschirm ' + screen);
      state.screen = screen;
    }
  }

  function rngOf(state) {
    return state._rng || Math.random;
  }

  function living(state) {
    return state.players.filter(function (p) { return p.alive; });
  }

  function livingIds(state) {
    return living(state).map(function (p) { return p.id; });
  }

  function nextLivingAfter(state, id) {
    var ids = state.players.map(function (p) { return p.id; });
    var start = ids.indexOf(Number(id));
    if (start < 0) start = 0;
    for (var step = 1; step <= ids.length; step++) {
      var p = playerById(state, ids[(start + step) % ids.length]);
      if (p && p.alive) return p.id;
    }
    return null;
  }

  function closestClockwise(players, originId, candidateIds) {
    var ids = players.map(function (p) { return p.id; });
    var start = ids.indexOf(Number(originId));
    if (start < 0) start = 0;
    var set = {};
    candidateIds.forEach(function (id) { set[Number(id)] = true; });
    for (var d = 0; d < ids.length; d++) {
      var id = ids[(start + d) % ids.length];
      if (set[id]) return id;
    }
    return Number(candidateIds[0]);
  }

  function loverComponent(state, id) {
    var seen = {};
    var stack = [Number(id)];
    var out = [];
    while (stack.length) {
      var cur = stack.pop();
      if (seen[cur]) continue;
      seen[cur] = true;
      out.push(cur);
      var p = playerById(state, cur);
      if (!p) continue;
      (p.loverIds || []).forEach(function (n) { stack.push(n); });
    }
    return out;
  }

  function addLink(state, a, b) {
    a = Number(a);
    b = Number(b);
    var A = playerById(state, a);
    var B = playerById(state, b);
    if (!A || !B || a === b || !A.alive || !B.alive) return false;
    if (A.loverIds.indexOf(b) < 0) A.loverIds.push(b);
    if (B.loverIds.indexOf(a) < 0) B.loverIds.push(a);
    state.bonds = state.bonds || [];
    state.bonds.push([a, b]);
    note(state, 'Liebesband ' + A.name + ' ' + B.name);
    return true;
  }

  function sever(state, deadIds) {
    var dead = {};
    deadIds.forEach(function (id) { dead[id] = true; });
    state.players.forEach(function (p) {
      if (dead[p.id]) p.loverIds = [];
      else p.loverIds = (p.loverIds || []).filter(function (id) { return !dead[id]; });
    });
  }

  function loveSignature(state, id) {
    var mine = playerById(state, id);
    if (!mine || !(mine.loverIds || []).length) return '';
    var linked = loverComponent(state, id).filter(function (other) {
      var q = playerById(state, other);
      return other !== Number(id) && q && q.alive;
    });
    if (!linked.length) return '';
    linked.sort(function (a, b) { return a - b; });
    return linked.map(function (other) {
      return other + '=' + playerById(state, other).role;
    }).join(',');
  }

  function isAway(state, id) {
    var p = playerById(state, id);
    if (!p) return false;
    if (p.role === 'nutte') return true;
    if (state.hosts && state.hosts[id]) return true;
    return false;
  }

  function occupants(state, houseId) {
    houseId = Number(houseId);
    var ids = [];
    var owner = playerById(state, houseId);
    if (owner && owner.alive && !isAway(state, owner.id)) ids.push(owner.id);
    state.players.forEach(function (p) {
      if (!p.alive || p.id === houseId) return;
      if (state.hosts && Number(state.hosts[p.id]) === houseId) ids.push(p.id);
    });
    return ids;
  }

  function ownerHome(state, houseId) {
    var owner = playerById(state, houseId);
    return !!(owner && owner.alive && !isAway(state, owner.id));
  }

  function applyDeath(state, id, cause) {
    var p = playerById(state, id);
    if (!p || !p.alive) return false;
    if (cause === 'abstimmung' && p.role === 'politiker') {
      p.alive = false;
      p.notice = null;
      if (state.mayorId === p.id) state.mayorId = nextLivingAfter(state, p.id);
      state.winner = 'politiker';
      state.winReason = 'Der Politiker wurde am Tag gewählt und gewinnt allein. Liebeskummer und Jägerschüsse werden nicht mehr ausgespielt.';
      state.obit.push({ id: p.id, name: p.name, cause: cause });
      note(state, 'Politiker gewinnt durch Abstimmung');
      return true;
    }
    var group = loverComponent(state, id).filter(function (gid) {
      var g = playerById(state, gid);
      return g && g.alive;
    });
    group.forEach(function (gid) { playerById(state, gid).alive = false; });
    if (group.indexOf(state.mayorId) >= 0) {
      state.mayorId = nextLivingAfter(state, state.mayorId);
    }
    var hunters = group.filter(function (gid) {
      var g = playerById(state, gid);
      return g.role === 'jaeger' && !g.hunterShot;
    });
    hunters.sort(function (a, b) {
      if (a === Number(id)) return -1;
      if (b === Number(id)) return 1;
      return seatIndex(state, a) - seatIndex(state, b);
    });
    hunters.forEach(function (gid) {
      var g = playerById(state, gid);
      g.hunterShot = true;
      state.hunters.push(gid);
    });
    group.forEach(function (gid) {
      var g = playerById(state, gid);
      g.notice = null;
      var c = gid === Number(id) ? cause : 'liebe';
      state.obit.push({ id: gid, name: g.name, cause: c });
      note(state, 'Tot ' + g.name + ' ' + c);
    });
    sever(state, group);
    return true;
  }

  function seatIndex(state, id) {
    for (var i = 0; i < state.players.length; i++) {
      if (state.players[i].id === Number(id)) return i;
    }
    return 0;
  }

  function checkWin(state) {
    if (state.winner) return state.winner;
    var alive = living(state);
    if (!alive.length) {
      state.winner = 'niemand';
      state.winReason = 'Niemand lebt mehr.';
      return state.winner;
    }
    var visited = {};
    for (var i = 0; i < alive.length; i++) {
      var p = alive[i];
      if (visited[p.id]) continue;
      var comp = loverComponent(state, p.id).filter(function (id) {
        var q = playerById(state, id);
        return q && q.alive;
      });
      comp.forEach(function (id) { visited[id] = true; });
      if (comp.length >= 2 && comp.length === alive.length) {
        state.winner = 'liebespaar';
        state.winReason = 'Eine zusammenhängende Liebesgruppe ist allein übrig.';
        return state.winner;
      }
    }
    var wolves = alive.filter(function (p) { return p.role === 'werwolf'; }).length;
    var village = alive.filter(function (p) { return teamOfRole(p.role) === 'village'; }).length;
    if (wolves === 0 && village > 0) {
      state.winner = 'dorf';
      state.winReason = 'Kein Werwolf lebt mehr.';
      return state.winner;
    }
    if (wolves === 0 && village === 0) {
      state.winner = 'niemand';
      state.winReason = 'Nur der Politiker ist noch da. Niemand gewinnt.';
      return state.winner;
    }
    if (wolves >= village) {
      state.winner = 'woelfe';
      state.winReason = 'Die Werwölfe sind mindestens so viele wie die Dorfseite. Der Politiker zählt dabei nicht mit.';
      return state.winner;
    }
    return null;
  }

  function wolfAttackHouses(state) {
    var list = [];
    if (state.victimHouse) list.push(Number(state.victimHouse));
    (state.extraAttacks || []).forEach(function (a) {
      if (a.kind === 'wolf') list.push(Number(a.houseId));
    });
    var seen = {};
    return list.filter(function (id) {
      if (seen[id]) return false;
      seen[id] = true;
      return true;
    });
  }

  function resolveWolfHouse(state) {
    var tally = {};
    Object.keys(state.wolfVotes || {}).forEach(function (wolfId) {
      var house = Number(state.wolfVotes[wolfId]);
      tally[house] = (tally[house] || 0) + 1;
    });
    var houses = Object.keys(tally);
    if (!houses.length) {
      state.victimHouse = null;
      return null;
    }
    var max = 0;
    houses.forEach(function (h) { if (tally[h] > max) max = tally[h]; });
    var tied = houses.filter(function (h) { return tally[h] === max; }).map(Number);
    var house = tied.length === 1 ? tied[0] : closestClockwise(state.players, state.mayorId, tied);
    state.victimHouse = house;
    note(state, 'Wolfsopfer Haus ' + house);
    return house;
  }

  function resolveBallot(state) {
    var scores = {};
    Object.keys(state.votes || {}).forEach(function (voter) {
      var target = state.votes[voter];
      var key = target == null ? '0' : String(target);
      var weight = Number(voter) === Number(state.mayorId) ? 3 : 2;
      scores[key] = (scores[key] || 0) + weight;
    });
    var keys = Object.keys(scores);
    var max = 0;
    keys.forEach(function (k) { if (scores[k] > max) max = scores[k]; });
    var top = keys.filter(function (k) { return scores[k] === max; });
    state.lastTally = scores;
    if (top.length !== 1) return { type: 'tie', scores: scores };
    if (top[0] === '0') return { type: 'none', scores: scores };
    return { type: 'player', id: Number(top[0]), scores: scores };
  }

  function applyThefts(state) {
    var due = (state.pendingThefts || []).filter(function (t) { return t.applyNight === state.nightNumber; });
    state.pendingThefts = (state.pendingThefts || []).filter(function (t) { return t.applyNight !== state.nightNumber; });
    due.forEach(function (t) {
      var thief = playerById(state, t.thiefId);
      var victim = playerById(state, t.victimId);
      if (thief && thief.alive) grantFresh(thief, t.role, state.nachUses);
      if (victim) makeVillager(victim);
      note(state, 'Diebstahl wirkt ' + (thief ? thief.name : t.thiefId) + ' wird ' + t.role);
    });
  }

  function clearNightScratch(state) {
    state.pass = 1;
    state.wolfVotes = {};
    state.victimHouse = null;
    state.extraAttacks = [];
    state.heals = [];
    state.poisons = [];
    state.hosts = {};
    state.copyHexes = [];
    state.votes = {};
    state.selection = [];
    state.prompts = [];
    state.promptIndex = 0;
    state.obit = [];
    state.revived = [];
    state.hunters = [];
    state.error = '';
  }

  function beginNight(state) {
    state.nightNumber += 1;
    applyThefts(state);
    clearNightScratch(state);
    state.order = livingIds(state);
    state.cursor = 0;
    state.resolution = null;
    state.step = 'handoff';
    setScreen(state, 'night');
    note(state, 'Nacht ' + state.nightNumber);
    if (!state.order.length) {
      checkWin(state);
      setScreen(state, 'end');
    }
  }

  function currentId(state) {
    if (state.screen === 'hunter') return state.hunterId;
    return state.order[state.cursor];
  }

  function abilityOf(role) {
    if (role === 'werwolf') return 'wolf';
    if (role === 'jaeger') return 'jaeger';
    if (role === 'seherin') return 'seherin';
    if (role === 'hexe') return 'hexe';
    if (role === 'amor') return 'amor';
    if (role === 'waschbaer') return 'waschbaer';
    if (role === 'nutte') return 'nutte';
    if (role === 'schaufel') return 'schaufel';
    if (role === 'nachahmerin') return 'nachahmerin';
    return null;
  }

  function buildNightPrompts(state, player) {
    var prompts = [];
    if (state.pass === 1 && player.notice && player.notice.night === state.nightNumber) {
      prompts.push({ kind: 'notice' });
    }
    var sig = loveSignature(state, player.id);
    if (sig && state.seenLove[player.id] !== sig) prompts.push({ kind: 'love' });
    if (state.pass === 2) {
      prompts = prompts.concat(hexePrompts(state, player));
      if (!prompts.length) prompts.push({ kind: 'sleep' });
      return prompts;
    }
    var action = passOneAction(state, player);
    if (action) prompts.push(action);
    else if (!prompts.length) prompts.push({ kind: 'sleep' });
    else if (prompts[prompts.length - 1].kind !== 'sleep' && !action) {
      /* notice or love only, still need a beat if no action — love/notice are enough */
    }
    if (!prompts.length) prompts.push({ kind: 'sleep' });
    return prompts;
  }

  function passOneAction(state, player) {
    if (player.role === 'nutte') return { kind: 'nutte', target: 'house' };
    if (player.role === 'nachahmerin' && player.nachLeft > 0) return { kind: 'copy', target: 'person', depth: 0 };
    if (player.role === 'waschbaer' && !player.stealUsed) return { kind: 'steal', target: 'house', forced: false };
    if (player.role === 'seherin') return { kind: 'seer', target: 'person' };
    if (player.role === 'amor' && state.nightNumber === 1) return { kind: 'amor', target: 'person' };
    if (player.role === 'werwolf') return { kind: 'wolf', target: 'house' };
    if (player.role === 'schaufel' && !player.schaufelUsed && deadPlayers(state).length) {
      return { kind: 'schaufel', target: 'person', forced: false };
    }
    return null;
  }

  function hexePrompts(state, player) {
    var list = [];
    var attacks = wolfAttackHouses(state);
    if (player.role === 'hexe' && player.healLeft && attacks.length) {
      list.push({ kind: 'heal', source: 'role', target: 'house', attacks: attacks });
    }
    var copy = (state.copyHexes || []).filter(function (c) { return c.actorId === player.id && c.heal; })[0];
    if (copy && attacks.length) list.push({ kind: 'heal', source: 'copy', target: 'house', attacks: attacks });
    if (player.role === 'hexe' && player.poisonLeft) list.push({ kind: 'poison', source: 'role', target: 'house' });
    var copyPoison = (state.copyHexes || []).filter(function (c) { return c.actorId === player.id && c.poison; })[0];
    if (copyPoison) list.push({ kind: 'poison', source: 'copy', target: 'house' });
    return list;
  }

  function deadPlayers(state) {
    return state.players.filter(function (p) { return !p.alive; });
  }

  function goHandoff(state) {
    state.step = 'handoff';
    state.prompts = [];
    state.promptIndex = 0;
    state.selection = [];
    state.error = '';
  }

  function openTurn(state) {
    var id = currentId(state);
    var player = playerById(state, id);
    state.step = 'show';
    state.selection = [];
    state.error = '';
    if (state.screen === 'vote') state.prompts = [{ kind: 'vote', target: 'person' }];
    else state.prompts = buildNightPrompts(state, player);
    state.promptIndex = 0;
  }

  function nextPlayer(state) {
    state.cursor += 1;
    if (state.cursor >= state.order.length) {
      endPass(state);
      return;
    }
    goHandoff(state);
  }

  function endPass(state) {
    if (state.screen === 'vote') {
      finishVote(state);
      return;
    }
    if (state.pass === 1) {
      resolveWolfHouse(state);
      state.pass = 2;
      state.order = livingIds(state);
      state.cursor = 0;
      goHandoff(state);
      note(state, 'Nachtrunde 2');
      return;
    }
    resolveNight(state);
  }

  function resolveNight(state) {
    var healed = {};
    (state.heals || []).forEach(function (id) { healed[Number(id)] = true; });
    var events = [];
    if (state.victimHouse) events.push({ houseId: Number(state.victimHouse), cause: 'woelfe', kind: 'wolf' });
    (state.extraAttacks || []).forEach(function (a) { events.push(a); });
    (state.poisons || []).forEach(function (id) {
      events.push({ houseId: Number(id), cause: 'gift', kind: 'other' });
    });
    state.hunters = [];
    state.obit = [];
    events.forEach(function (ev) {
      if (ev.kind === 'wolf' && healed[Number(ev.houseId)]) {
        note(state, 'Heilung Haus ' + ev.houseId);
        return;
      }
      occupants(state, ev.houseId).forEach(function (pid) {
        applyDeath(state, pid, ev.cause);
      });
    });
    state.resolution = 'morning';
    continueResolution(state);
  }

  function continueResolution(state) {
    if (state.winner === 'politiker') {
      setScreen(state, 'end');
      return;
    }
    while (state.hunters.length && !living(state).length) state.hunters.shift();
    if (state.hunters.length) {
      state.hunterId = state.hunters[0];
      state.step = 'handoff';
      setScreen(state, 'hunter');
      return;
    }
    if (state.resolution === 'morning') finishMorning(state);
    else if (state.resolution === 'vote') finishVoteAftermath(state);
    else if (state.resolution === 'duel') finishDuelAftermath(state);
  }

  function finishMorning(state) {
    state.revived = [];
    (state.pendingRevives || []).forEach(function (id) {
      var p = playerById(state, id);
      if (!p || p.alive) return;
      p.alive = true;
      p.loverIds = [];
      state.revived.push({ id: p.id, name: p.name });
      note(state, 'Wiederbelebt ' + p.name);
    });
    state.pendingRevives = [];
    var mayor = playerById(state, state.mayorId);
    if (!mayor || !mayor.alive) {
      var seed = state.mayorId || state.players[0].id;
      state.mayorId = nextLivingAfter(state, seed);
    }
    if (state.mayorId) {
      var nextMayor = nextLivingAfter(state, state.mayorId);
      if (nextMayor) state.mayorId = nextMayor;
    }
    note(state, 'Bürgermeister jetzt ' + (playerById(state, state.mayorId) || {}).name);
    var win = checkWin(state);
    state.day += 1;
    var lines = [];
    if (!state.obit.length) lines.push('Niemand ist in der Nacht gestorben.');
    state.obit.forEach(function (row) {
      lines.push(row.name + ' ist gestorben (' + (CAUSE_LABEL[row.cause] || row.cause) + ').');
    });
    state.revived.forEach(function (row) {
      lines.push(row.name + ' ist wieder im Dorf.');
    });
    state.announce = {
      title: 'Morgen. Tag ' + state.day,
      lines: lines,
      button: win ? 'Ergebnis' : 'Diskussion',
      then: win ? 'end' : 'discuss'
    };
    setScreen(state, 'announce');
  }

  function finishVote(state) {
    var result = resolveBallot(state);
    var lines = ['Stimme des Bürgermeisters zählt 1,5.'].concat(tallyLines(state, result.scores));
    if (result.type === 'tie') {
      lines.push('Gleichstand. Niemand stirbt.');
      state.announce = { title: 'Abstimmung', lines: lines, button: 'Weiter', then: 'night' };
      setScreen(state, 'announce');
      note(state, 'Abstimmung Gleichstand');
      return;
    }
    if (result.type === 'none') {
      lines.push('Die Mehrheit wählt Niemand. Niemand stirbt.');
      state.announce = { title: 'Abstimmung', lines: lines, button: 'Weiter', then: 'night' };
      setScreen(state, 'announce');
      return;
    }
    var target = playerById(state, result.id);
    lines.push(target.name + ' ist gewählt.');
    state.pendingCondemn = target.id;
    state.announce = { title: 'Abstimmung', lines: lines, button: 'Weiter', then: 'apply-vote' };
    setScreen(state, 'announce');
    note(state, 'Verurteilt ' + target.name);
  }

  function tallyLines(state, scores) {
    var lines = [];
    Object.keys(scores).forEach(function (key) {
      var label = key === '0' ? 'Niemand' : playerById(state, key).name;
      lines.push(label + ': ' + formatWeight(scores[key]));
    });
    return lines;
  }

  function formatWeight(weight) {
    return (weight / 2).toFixed(1).replace('.', ',') + (weight === 3 || weight === 2 ? '' : '');
  }

  function applyCondemn(state) {
    var id = state.pendingCondemn;
    state.pendingCondemn = null;
    state.obit = [];
    state.hunters = [];
    if (!id) {
      beginNight(state);
      return;
    }
    applyDeath(state, id, 'abstimmung');
    if (state.winner === 'politiker') {
      setScreen(state, 'end');
      return;
    }
    state.resolution = 'vote';
    continueResolution(state);
  }

  function finishVoteAftermath(state) {
    var win = checkWin(state);
    var extra = state.obit.filter(function (row) { return row.cause !== 'abstimmung'; });
    if (extra.length || win) {
      var lines = state.obit.map(function (row) {
        return row.name + ' ist gestorben (' + (CAUSE_LABEL[row.cause] || row.cause) + ').';
      });
      state.announce = {
        title: 'Nach der Abstimmung',
        lines: lines,
        button: win ? 'Ergebnis' : 'Nacht beginnt',
        then: win ? 'end' : 'night'
      };
      setScreen(state, 'announce');
      return;
    }
    beginNight(state);
  }

  function finishDuelAftermath(state) {
    var win = checkWin(state);
    var lines = state.obit.map(function (row) {
      return row.name + ' ist gestorben (' + (CAUSE_LABEL[row.cause] || row.cause) + ').';
    });
    if (!lines.length) lines.push('Das Duell endet ohne Toten.');
    state.announce = {
      title: 'Duell vorbei',
      lines: lines,
      button: win ? 'Ergebnis' : 'Zurück zur Diskussion',
      then: win ? 'end' : 'discuss'
    };
    state.duel = null;
    setScreen(state, 'announce');
  }

  function rotateSelection(state, id) {
    id = Number(id);
    var prompt = currentPrompt(state);
    var max = 1;
    if (prompt && prompt.kind === 'amor') max = 2;
    if (state.screen === 'duel' && state.duel && state.duel.stage === 'pick') max = 5;
    var list = state.selection.slice();
    var at = list.indexOf(id);
    if (at >= 0) list.splice(at, 1);
    else if (max === 1) list = [id];
    else if (list.length < max) list.push(id);
    state.selection = list;
  }

  function currentPrompt(state) {
    if (!state.prompts || state.promptIndex == null) return null;
    return state.prompts[state.promptIndex] || null;
  }

  function advancePrompt(state, extra) {
    if (extra && extra.length) {
      var insertAt = state.promptIndex + 1;
      extra.forEach(function (prompt, i) { state.prompts.splice(insertAt + i, 0, prompt); });
    }
    state.promptIndex += 1;
    state.selection = [];
    state.error = '';
    if (state.promptIndex >= state.prompts.length) nextPlayer(state);
  }

  function chosenId(state, action) {
    if (action && action.id != null && action.id !== '') return Number(action.id);
    if (state.selection.length === 1) return state.selection[0];
    return null;
  }

  function chosenIds(state, action) {
    if (action && action.ids && action.ids.length) return action.ids.map(Number);
    return state.selection.slice();
  }

  function handleShowAction(state, action) {
    var prompt = currentPrompt(state);
    if (!prompt) return;
    var player = playerById(state, currentId(state));
    if (action.type === 'select') {
      rotateSelection(state, action.id);
      return;
    }
    if (action.type === 'ack') {
      if (prompt.kind === 'notice') player.notice = null;
      if (prompt.kind === 'love') state.seenLove[player.id] = loveSignature(state, player.id);
      if (prompt.kind === 'sleep' || prompt.kind === 'love' || prompt.kind === 'notice' || prompt.kind === 'info' || prompt.kind === 'seer-result') {
        note(state, 'Weiter ' + player.name + ' ' + prompt.kind);
        advancePrompt(state);
        return;
      }
      state.error = 'Bitte eine Wahl treffen.';
      return;
    }
    if (action.type === 'skip') {
      if (prompt.forced) {
        state.error = 'Diese Fähigkeit musst du einsetzen.';
        return;
      }
      if (prompt.kind === 'steal' || prompt.kind === 'copy' || prompt.kind === 'heal' || prompt.kind === 'poison' || prompt.kind === 'schaufel') {
        note(state, 'Übersprungen ' + player.name + ' ' + prompt.kind);
        if (prompt.kind === 'heal' || prompt.kind === 'poison') consumePotion(state, player, prompt, false);
        advancePrompt(state);
        return;
      }
      state.error = 'Hier gibt es nichts zu überspringen.';
      return;
    }
    if (action.type !== 'confirm') {
      state.error = 'Unbekannte Aktion.';
      return;
    }
    var follow = applyChoice(state, player, prompt, action);
    if (typeof follow === 'string') {
      state.error = follow;
      return;
    }
    note(state, 'Aktion ' + player.name + ' ' + prompt.kind + ' ' + JSON.stringify(action.id != null ? action.id : (action.ids || state.selection)));
    advancePrompt(state, follow || []);
  }

  function consumePotion(state, player, prompt, used) {
    if (!used) return;
    if (prompt.source === 'role') {
      if (prompt.kind === 'heal') player.healLeft = false;
      if (prompt.kind === 'poison') player.poisonLeft = false;
    } else {
      var copy = (state.copyHexes || []).filter(function (c) { return c.actorId === player.id; })[0];
      if (!copy) return;
      if (prompt.kind === 'heal') copy.heal = false;
      if (prompt.kind === 'poison') copy.poison = false;
    }
  }

  function applyChoice(state, player, prompt, action) {
    if (prompt.kind === 'vote') {
      var voteId = chosenId(state, action);
      if (voteId == null) return 'Wähle eine Person oder Niemand.';
      if (voteId !== 0 && !livingTarget(state, voteId)) return 'Diese Person stimmt nicht.';
      state.votes[player.id] = voteId === 0 ? 0 : voteId;
      return [];
    }
    if (prompt.kind === 'wolf' || prompt.kind === 'nutte' || prompt.kind === 'kill') {
      var house = chosenId(state, action);
      if (!livingTarget(state, house)) return 'Wähle ein Haus.';
      if (prompt.kind === 'nutte' && house === player.id) return 'Du schläfst in einem anderen Haus.';
      if (prompt.kind === 'nutte') {
        state.hosts[player.id] = house;
        return [];
      }
      if (prompt.kind === 'wolf') {
        state.wolfVotes[player.id] = house;
        return [];
      }
      if (house === player.id) return 'Wähle ein anderes Haus.';
      state.extraAttacks.push({
        houseId: house,
        cause: prompt.attack === 'wolf' ? 'woelfe' : 'schuss',
        kind: prompt.attack === 'wolf' ? 'wolf' : 'other'
      });
      return [];
    }
    if (prompt.kind === 'heal') {
      var healHouse = chosenId(state, action);
      if (healHouse == null) return 'Wähle ein Haus oder überspringe.';
      if (!livingTarget(state, healHouse)) return 'Dieses Haus gibt es nicht.';
      state.heals.push(healHouse);
      consumePotion(state, player, prompt, true);
      return [];
    }
    if (prompt.kind === 'poison') {
      var poisonHouse = chosenId(state, action);
      if (!livingTarget(state, poisonHouse)) return 'Wähle ein Haus.';
      if (poisonHouse === player.id) return 'Das eigene Haus kannst du nicht vergiften.';
      state.poisons.push(poisonHouse);
      consumePotion(state, player, prompt, true);
      return [];
    }
    if (prompt.kind === 'seer') {
      var seen = chosenId(state, action);
      if (!livingTarget(state, seen) || seen === player.id) return 'Wähle eine andere Person.';
      var target = playerById(state, seen);
      return [{ kind: 'seer-result', seenId: seen, role: target.role }];
    }
    if (prompt.kind === 'amor') {
      var pair = chosenIds(state, action);
      if (pair.length !== 2) return 'Wähle genau zwei Personen.';
      if (pair[0] === pair[1]) return 'Zwei verschiedene Personen.';
      if (!livingTarget(state, pair[0]) || !livingTarget(state, pair[1])) return 'Beide müssen leben.';
      addLink(state, pair[0], pair[1]);
      return [];
    }
    if (prompt.kind === 'steal') {
      var stealHouse = chosenId(state, action);
      if (!livingTarget(state, stealHouse) || stealHouse === player.id) return 'Wähle ein anderes Haus.';
      if (!ownerHome(state, stealHouse)) return 'In diesem Haus ist niemand. Der Diebstahl gelingt nicht.';
      var owner = playerById(state, stealHouse);
      var order = state.order;
      var pos = order.indexOf(owner.id);
      var sameNight = state.pass === 1 && pos > state.cursor;
      owner.notice = { night: state.nightNumber + (sameNight ? 0 : 1) };
      state.pendingThefts.push({
        thiefId: player.id,
        victimId: owner.id,
        role: owner.role,
        applyNight: state.nightNumber + 1
      });
      if (player.role === 'waschbaer') player.stealUsed = true;
      note(state, 'Diebstahl geplant von ' + player.name + ' an ' + owner.name);
      return [];
    }
    if (prompt.kind === 'schaufel') {
      var deadId = chosenId(state, action);
      var dead = playerById(state, deadId);
      if (!dead || dead.alive) return 'Wähle eine tote Person.';
      if (state.pendingRevives.indexOf(dead.id) < 0) state.pendingRevives.push(dead.id);
      if (!prompt.forced && player.role === 'schaufel') player.schaufelUsed = true;
      return [];
    }
    if (prompt.kind === 'copy') {
      var copyId = chosenId(state, action);
      if (!livingTarget(state, copyId) || copyId === player.id) return 'Wähle eine andere Person.';
      if (!prompt.depth) player.nachLeft -= 1;
      var copied = playerById(state, copyId);
      var ability = abilityOf(copied.role);
      if (!ability || (ability === 'nachahmerin' && prompt.depth)) {
        return [{ kind: 'info', text: ROLE_NAMES[copied.role] + ' hat gerade keine nutzbare Nachtfähigkeit. Der Einsatz verpufft.' }];
      }
      return followCopy(state, player, ability, prompt.depth || 0);
    }
    return 'Diese Wahl kenne ich nicht.';
  }

  function followCopy(state, player, ability, depth) {
    if (ability === 'wolf') return [{ kind: 'kill', attack: 'wolf', target: 'house', forced: true }];
    if (ability === 'jaeger') return [{ kind: 'kill', attack: 'jaeger', target: 'house', forced: true }];
    if (ability === 'seherin') return [{ kind: 'seer', target: 'person', forced: true }];
    if (ability === 'amor') return [{ kind: 'amor', target: 'person', forced: true }];
    if (ability === 'waschbaer') {
      var home = living(state).some(function (p) {
        return p.id !== player.id && ownerHome(state, p.id);
      });
      if (!home) return [{ kind: 'info', text: 'Kein bewohntes Haus. Der Diebstahl verpufft.' }];
      return [{ kind: 'steal', target: 'house', forced: true }];
    }
    if (ability === 'nutte') return [{ kind: 'nutte', target: 'house', forced: true }];
    if (ability === 'schaufel') {
      if (!deadPlayers(state).length) {
        return [{ kind: 'info', text: 'Es liegt niemand tot da. Der Einsatz verpufft.' }];
      }
      return [{ kind: 'schaufel', target: 'person', forced: true }];
    }
    if (ability === 'hexe') {
      state.copyHexes.push({ actorId: player.id, heal: true, poison: true });
      return [{ kind: 'info', text: 'Du hast die Hexe nachgeahmt. Heiltrank und Gift setzt du in der zweiten Runde ein, wenn das Opfer der Wölfe feststeht.' }];
    }
    if (ability === 'nachahmerin') {
      return [{ kind: 'copy', target: 'person', depth: depth + 1, forced: true }];
    }
    return [{ kind: 'info', text: 'Der Einsatz verpufft.' }];
  }

  function livingTarget(state, id) {
    var p = playerById(state, id);
    return !!(p && p.alive);
  }

  function send(state, action) {
    action = action || {};
    try {
      dispatch(state, action);
    } catch (error) {
      note(state, 'Fehler ' + error.message + '\n' + (error.stack || ''));
      state.error = 'Interner Fehler.';
    }
    return state;
  }

  function dispatch(state, action) {
    if (action.type === 'add-name') return lobbyAdd(state, action.name);
    if (action.type === 'remove-name') return lobbyRemove(state, action.id);
    if (action.type === 'to-setup') return beginSetup(state);
    if (action.type === 'back-lobby') {
      setScreen(state, 'lobby');
      state.error = '';
      return;
    }
    if (action.type === 'set-count') {
      var role = action.role;
      var value = Number(action.value);
      if (!ROLE_NAMES[role]) return;
      state.counts[role] = value < 0 ? 0 : value;
      state.error = '';
      return;
    }
    if (action.type === 'set-nach') {
      state.nachUses = Number(action.value);
      return;
    }
    if (action.type === 'suggest') {
      state.counts = defaultCounts(state.players.length);
      state.nachUses = 1;
      state.error = '';
      return;
    }
    if (action.type === 'deal') {
      var problem = validateSetup(state.counts, state.players.length, state.nachUses);
      state.error = problem;
      if (problem) return;
      dealInto(state);
      return;
    }
    if (action.type === 'abort-ask') {
      state.confirmAbort = true;
      return;
    }
    if (action.type === 'abort-no') {
      state.confirmAbort = false;
      return;
    }
    if (action.type === 'abort' || action.type === 'home') {
      var lobby = toLobby(state);
      replaceState(state, lobby);
      note(state, action.type === 'home' ? 'Home' : 'Abbruch');
      return;
    }
    if (state.screen === 'reveal') return revealSend(state, action);
    if (state.screen === 'discuss') return discussSend(state, action);
    if (state.screen === 'announce') return announceSend(state, action);
    if (state.screen === 'night' || state.screen === 'vote') return turnSend(state, action);
    if (state.screen === 'hunter') return hunterSend(state, action);
    if (state.screen === 'duel') return duelSend(state, action);
    if (state.screen === 'end') return;
    state.error = 'Hier geht das nicht.';
  }

  function toLobby(state) {
    var lobby = newLobby();
    lobby.players = (state.players || []).map(function (p) { return { id: p.id, name: p.name }; });
    lobby.nextId = state.nextId || (lobby.players.length + 1);
    lobby.log = state.log || [];
    return lobby;
  }

  function revealSend(state, action) {
    if (action.type !== 'ack') return;
    if (state.step === 'handoff') {
      state.step = 'show';
      state.error = '';
      note(state, 'Rolle zeigen ' + playerById(state, currentId(state)).name);
      return;
    }
    note(state, 'Rolle verdeckt ' + playerById(state, currentId(state)).name);
    state.cursor += 1;
    if (state.cursor >= state.order.length) {
      state.step = 'public';
      state.prompts = [];
      setScreen(state, 'discuss');
      note(state, 'Tag 1 Diskussion, Bürgermeister ' + playerById(state, state.mayorId).name);
      return;
    }
    goHandoff(state);
  }

  function discussSend(state, action) {
    if (action.type === 'to-vote') {
      state.order = livingIds(state);
      state.cursor = 0;
      state.votes = {};
      state.resolution = null;
      goHandoff(state);
      setScreen(state, 'vote');
      note(state, 'Abstimmung');
      return;
    }
    if (action.type === 'to-duel') {
      state.duel = { stage: 'who' };
      state.selection = [];
      state.error = '';
      setScreen(state, 'duel');
      return;
    }
  }

  function announceSend(state, action) {
    if (action.type !== 'ack') return;
    var then = state.announce && state.announce.then;
    state.announce = null;
    if (then === 'end') setScreen(state, 'end');
    else if (then === 'night') beginNight(state);
    else if (then === 'discuss') setScreen(state, 'discuss');
    else if (then === 'apply-vote') applyCondemn(state);
    else setScreen(state, 'discuss');
  }

  function turnSend(state, action) {
    if (state.step === 'handoff') {
      if (action.type !== 'ack') return;
      openTurn(state);
      note(state, 'Dran ' + playerById(state, currentId(state)).name + ' ' + state.screen + ' R' + state.pass);
      return;
    }
    handleShowAction(state, action);
  }

  function hunterSend(state, action) {
    var hunter = playerById(state, state.hunterId);
    if (state.step === 'handoff') {
      if (action.type !== 'ack') return;
      state.step = 'show';
      state.selection = [];
      note(state, 'Jäger schießt ' + (hunter ? hunter.name : ''));
      return;
    }
    if (action.type === 'select') {
      rotateSelection(state, action.id);
      return;
    }
    if (action.type !== 'confirm') return;
    var target = chosenId(state, action);
    var others = living(state);
    if (!others.length) {
      state.hunters.shift();
      state.step = 'handoff';
      continueResolution(state);
      return;
    }
    if (!livingTarget(state, target)) {
      state.error = 'Wähle eine lebende Person.';
      return;
    }
    note(state, 'Schuss auf ' + playerById(state, target).name);
    state.hunters.shift();
    applyDeath(state, target, 'jaeger');
    if (state.winner === 'politiker') {
      setScreen(state, 'end');
      return;
    }
    continueResolution(state);
  }

  function duelSend(state, action) {
    var duel = state.duel;
    if (!duel) return;
    if (action.type === 'cancel' && (duel.stage === 'who' || duel.stage === 'pick')) {
      state.duel = null;
      state.selection = [];
      state.error = '';
      setScreen(state, 'discuss');
      return;
    }
    if (duel.stage === 'who') {
      if (action.type !== 'confirm' && action.type !== 'ack') {
        if (action.type === 'select') rotateSelection(state, action.id);
        return;
      }
      var id = chosenId(state, action);
      var claim = playerById(state, id);
      var ok = claim && claim.alive && claim.role === 'russe' && !claim.russeUsed;
      if (!ok) {
        duel.stage = 'noop';
        state.selection = [];
        note(state, 'Duell abgelehnt');
        return;
      }
      duel.russeId = claim.id;
      duel.stage = 'pick';
      state.selection = [];
      state.error = '';
      note(state, 'Duell von ' + claim.name);
      return;
    }
    if (duel.stage === 'noop') {
      if (action.type === 'ack') {
        state.duel = null;
        setScreen(state, 'discuss');
      }
      return;
    }
    if (duel.stage === 'pick') {
      if (action.type === 'select') {
        var pick = Number(action.id);
        if (pick === duel.russeId) return;
        if (!livingTarget(state, pick)) return;
        rotateSelection(state, pick);
        if (state.selection.length > 5) state.selection = state.selection.slice(0, 5);
        return;
      }
      if (action.type === 'cancel') {
        state.duel = null;
        setScreen(state, 'discuss');
        return;
      }
      if (action.type !== 'confirm') return;
      var ids = chosenIds(state, action).filter(function (pid) {
        return pid !== duel.russeId && livingTarget(state, pid);
      });
      if (ids.length < 1 || ids.length > 5) {
        state.error = 'Fordere 1 bis 5 lebende Personen heraus.';
        return;
      }
      var russe = playerById(state, duel.russeId);
      russe.russeUsed = true;
      duel.targets = ids;
      duel.order = [duel.russeId].concat(ids);
      duel.bulletAt = Math.floor(rngOf(state)() * 6);
      duel.pull = 0;
      duel.stage = 'pull-handoff';
      state.error = '';
      note(state, 'Duell Start Kugel ' + duel.bulletAt);
      return;
    }
    if (duel.stage === 'pull-handoff') {
      if (action.type !== 'ack') return;
      duel.stage = 'pull-ready';
      return;
    }
    if (duel.stage === 'pull-ready') {
      if (action.type !== 'ack' && action.type !== 'confirm') return;
      duel.hit = duel.pull === duel.bulletAt;
      duel.stage = 'pull-result';
      note(state, 'Abzug ' + duel.pull + (duel.hit ? ' Knall' : ' leer'));
      return;
    }
    if (duel.stage === 'pull-result') {
      if (action.type !== 'ack') return;
      if (duel.hit) {
        var shooter = duel.order[duel.pull % duel.order.length];
        state.obit = [];
        state.hunters = [];
        applyDeath(state, shooter, 'duell');
        state.resolution = 'duel';
        if (state.winner === 'politiker') {
          setScreen(state, 'end');
          return;
        }
        continueResolution(state);
        return;
      }
      duel.pull += 1;
      if (duel.pull > 5) {
        state.obit = [];
        state.resolution = 'duel';
        finishDuelAftermath(state);
        return;
      }
      duel.stage = 'pull-handoff';
    }
  }

  function view(state) {
    var prompt = null;
    if (state.step === 'show') prompt = currentPrompt(state);
    var playerId = null;
    if (state.screen === 'night' || state.screen === 'vote' || state.screen === 'reveal' || state.screen === 'hunter') {
      playerId = currentId(state);
    }
    var puller = null;
    if (state.screen === 'duel' && state.duel && state.duel.order) {
      puller = state.duel.order[state.duel.pull % state.duel.order.length];
    }
    return {
      screen: state.screen,
      step: state.step,
      prompt: prompt,
      playerId: playerId,
      pullerId: puller,
      error: state.error || '',
      winner: state.winner,
      announce: state.announce,
      mayorId: state.mayorId,
      day: state.day,
      nightNumber: state.nightNumber,
      pass: state.pass
    };
  }

  function wolfBoard(state, selfId) {
    return living(state).filter(function (p) { return p.role === 'werwolf'; }).map(function (p) {
      var vote = state.wolfVotes[p.id];
      return {
        id: p.id,
        name: p.name,
        self: p.id === selfId,
        choice: vote ? 'Haus von ' + playerById(state, vote).name : 'noch offen'
      };
    });
  }

  function report(state, description) {
    var copy = {};
    Object.keys(state).forEach(function (key) {
      if (key === '_rng') return;
      copy[key] = state[key];
    });
    var lines = [
      '# Fehlerbericht Werwolf',
      '',
      '## Beschreibung',
      description && String(description).trim() ? String(description).trim() : '(keine Beschreibung)',
      '',
      '## Version',
      APP_VERSION,
      '',
      '## Zeitpunkt',
      new Date().toISOString(),
      '',
      '## Hinweis',
      'Der Bericht enthält geheime Rollen, Stimmen und den Nachtverlauf.',
      '',
      '## Konfiguration',
      '```json',
      JSON.stringify(state.config || { counts: state.counts, nachUses: state.nachUses }, null, 2),
      '```',
      '',
      '## Spielstand',
      '```json',
      JSON.stringify(copy, null, 2),
      '```',
      '',
      '## Ablauf',
      (state.log || []).map(function (entry) {
        return '- ' + new Date(entry.t).toISOString() + ' ' + entry.m;
      }).join('\n')
    ];
    return lines.join('\n');
  }

  function roleName(role) {
    return ROLE_NAMES[role] || role;
  }

  function targetsFor(state, prompt, selfId) {
    if (!prompt) return [];
    if (prompt.kind === 'schaufel') return deadPlayers(state);
    if (prompt.kind === 'amor') return living(state);
    if (prompt.kind === 'seer' || prompt.kind === 'copy') {
      return living(state).filter(function (p) { return p.id !== selfId; });
    }
    if (prompt.kind === 'wolf' || prompt.kind === 'heal') return living(state);
    if (prompt.kind === 'nutte' || prompt.kind === 'steal' || prompt.kind === 'kill' || prompt.kind === 'poison') {
      return living(state).filter(function (p) { return p.id !== selfId; });
    }
    if (prompt.kind === 'vote' || prompt.kind === 'hunter') return living(state);
    return living(state);
  }

  root.Werwolf = {
    APP_VERSION: APP_VERSION,
    ROLE_NAMES: ROLE_NAMES,
    ROLE_ORDER: ROLE_ORDER,
    CAUSE_LABEL: CAUSE_LABEL,
    WIN_TEXT: WIN_TEXT,
    teamOfRole: teamOfRole,
    defaultCounts: defaultCounts,
    validateSetup: validateSetup,
    newLobby: newLobby,
    createGame: createGame,
    send: send,
    view: view,
    note: note,
    report: report,
    roleName: roleName,
    playerById: playerById,
    occupants: occupants,
    isAway: isAway,
    loverComponent: loverComponent,
    addLink: addLink,
    applyDeath: applyDeath,
    checkWin: checkWin,
    closestClockwise: closestClockwise,
    resolveBallot: resolveBallot,
    resolveWolfHouse: resolveWolfHouse,
    wolfBoard: wolfBoard,
    targetsFor: targetsFor,
    living: living,
    deadPlayers: deadPlayers,
    beginNight: beginNight,
    loveSignature: loveSignature,
    ownerHome: ownerHome
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);

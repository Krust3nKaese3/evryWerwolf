(function () {
  var W = window.Werwolf;
  var LOBBY_KEY = 'werwolf.lobby.v1';
  var GAME_KEY = 'werwolf.game.v1';
  var SCORE_KEY = 'werwolf.scores.v1';
  var STORAGE_TIMEOUT_MS = 4000;
  var app = document.getElementById('app');
  var state = W.newLobby();
  var scores = {};
  var confirmReset = false;
  var saveReady = false;
  var booting = true;

  var HOME = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" d="M4 10.5 12 4l8 6.5V20h-5.2v-6.2H9.2V20H4z"/></svg>';
  var HOUSE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" d="M4 11 12 4l8 7v9H4z"/><path fill="none" stroke="currentColor" stroke-width="2" d="M10 20v-6h4v6"/></svg>';
  var PERSON = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="3" fill="none" stroke="currentColor" stroke-width="2"/><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M6.5 19c1.1-2.8 3-4.2 5.5-4.2S16.4 16.2 17.5 19"/></svg>';

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  }

  function bridgeStorage() {
    var api = window.EveryAppBridge && window.EveryAppBridge.storage;
    if (!api || typeof api.get !== 'function' || typeof api.set !== 'function' || typeof api.remove !== 'function') return null;
    return api;
  }

  function withTimeout(promise, ms) {
    return new Promise(function (resolve, reject) {
      var timer = setTimeout(function () { reject(new Error('timeout')); }, ms);
      Promise.resolve(promise).then(function (value) {
        clearTimeout(timer);
        resolve(value);
      }, function (error) {
        clearTimeout(timer);
        reject(error);
      });
    });
  }

  function parseSaved(raw) {
    if (raw == null || raw === '') return null;
    if (typeof raw === 'string') {
      try { return JSON.parse(raw); } catch (error) { return null; }
    }
    return typeof raw === 'object' ? raw : null;
  }

  async function readKey(key) {
    var storage = bridgeStorage();
    if (storage) {
      try {
        var value = await withTimeout(storage.get(key), STORAGE_TIMEOUT_MS);
        if (value != null && value !== '') return parseSaved(value);
      } catch (error) { /* Bridge fehlt oder verweigert. */ }
    }
    try { return parseSaved(localStorage.getItem(key)); } catch (error) { return null; }
  }

  async function writeKey(key, value) {
    var raw = value == null ? null : JSON.stringify(value);
    var storage = bridgeStorage();
    if (storage) {
      try {
        if (raw == null) await withTimeout(storage.remove(key), STORAGE_TIMEOUT_MS);
        else await withTimeout(storage.set(key, raw), STORAGE_TIMEOUT_MS);
      } catch (error) { /* bleibt im localStorage, falls vorhanden */ }
    }
    try {
      if (raw == null) localStorage.removeItem(key);
      else localStorage.setItem(key, raw);
    } catch (error) { /* voll oder gesperrt */ }
  }

  function lobbySnapshot() {
    return {
      v: 1,
      screen: 'lobby',
      players: (state.players || []).map(function (p) { return { id: p.id, name: p.name }; }),
      nextId: state.nextId || 1,
      log: state.log || []
    };
  }

  var saveQueue = Promise.resolve();

  function persist() {
    if (!saveReady) return;
    var lobby = lobbySnapshot();
    var game = state.screen === 'lobby' ? null : JSON.parse(JSON.stringify(state));
    var points = scores;
    saveQueue = saveQueue.then(function () {
      return writeKey(LOBBY_KEY, lobby).then(function () {
        return writeKey(GAME_KEY, game);
      }).then(function () {
        return writeKey(SCORE_KEY, points);
      });
    }).then(function () {}, function () {});
  }

  function applyScores() {
    if (!state || state.screen !== 'end') return;
    var result = W.awardOnce(scores, state);
    scores = result.scores;
  }

  var rendering = false;

  function act(action) {
    if (rendering) return;
    if (action.type === 'reset-ask') { confirmReset = true; render(); return; }
    if (action.type === 'reset-cancel') { confirmReset = false; render(); return; }
    if (action.type === 'reset-scores') {
      scores = {};
      if (state) state.scoredNames = [];
      confirmReset = false;
      persist();
      render();
      return;
    }
    confirmReset = false;
    rendering = true;
    try {
      W.send(state, action);
      applyScores();
      persist();
      render();
    } finally {
      rendering = false;
    }
  }

  var ROLE_ICON = {
    werwolf: '🐺',
    dorfbewohner: '🧑‍🌾',
    hexe: '🧙‍♀️',
    seherin: '🔮',
    amor: '💘',
    jaeger: '🏹',
    waschbaer: '🦝',
    nachahmerin: '🎭',
    nutte: '💋',
    russe: '🎲',
    politiker: '🎤',
    schaufel: '⛏️'
  };

  function roleIcon(role) {
    return ROLE_ICON[role] || '❓';
  }

  function hero(glyph, label) {
    return '<p class="hero" role="img" aria-label="' + esc(label) + '">' + glyph + '</p>';
  }

  function flask(kind) {
    var heal = kind !== 'poison';
    var fill = heal ? '#d23b3b' : '#2f9e4f';
    var label = heal ? 'Heiltrank' : 'Gifttrank';
    return '<svg class="flask" viewBox="0 0 64 80" role="img" aria-label="' + label + '">' +
      '<title>' + label + '</title>' +
      '<rect x="26" y="2" width="12" height="10" rx="2" fill="#f4efe4"/>' +
      '<path fill="' + fill + '" d="M28 12h8l8 12c7 9 10 16 10 24a16 16 0 0 1-16 16H26A16 16 0 0 1 10 48c0-8 3-15 10-24l8-12z"/>' +
      '<path fill="#ffffff" opacity="0.35" d="M22 46c2-8 6-12 10-12 2 6 2 14 0 22-6 1-12-2-10-10z"/>' +
      '</svg>';
  }

  function icon(kind) {
    var house = kind === 'house';
    return '<span class="mark" role="img" aria-label="' + (house ? 'Haus' : 'Person') + '">' + (house ? '🏠' : '👤') + '</span>';
  }

  function header(eyebrow, title, home) {
    return '<header><div><p class="eyebrow">' + esc(eyebrow) + '</p><h1>' + esc(title) + '</h1></div>' +
      (home ? '<button type="button" class="icon-btn" data-act="home" aria-label="Home">' + HOME + '</button>' : '') +
      '</header>';
  }

  function errorHtml() {
    return state.error ? '<div class="banner error">' + esc(state.error) + '</div>' : '';
  }

  function mayorHtml() {
    var mayor = W.playerById(state, state.mayorId);
    if (!mayor) return '';
    return '<div class="banner info">Bürgermeister: ' + esc(mayor.name) + ' · Stimme zählt 1,5</div>';
  }

  function player(id) {
    return W.playerById(state, id);
  }

  function selected(id) {
    return (state.selection || []).indexOf(Number(id)) >= 0;
  }

  function choiceButton(id, label, meta, targetKind, extra) {
    var order = (state.selection || []).indexOf(Number(id));
    return '<button type="button" class="choice' + (selected(id) ? ' selected' : '') + '" data-act="select" data-id="' + id + '">' +
      icon(targetKind) + '<span><span class="who">' + esc(label) + '</span>' +
      (meta ? '<span class="meta">' + esc(meta) + '</span>' : '') +
      (order >= 0 && (state.selection || []).length > 1 ? '<span class="meta">Platz ' + (order + 1) + '</span>' : '') +
      (extra || '') + '</span></button>';
  }

  function blurb(role, person) {
    var uses = state.nachUses || (person && person.nachLeft) || 1;
    var text = {
      werwolf: 'Nachts wählt das Rudel gemeinsam ein Haus.',
      dorfbewohner: 'Du hast keine Sonderfähigkeit. Nachts schläfst du.',
      hexe: 'Du hast ' + (state.healPotions || (person && person.healsLeft) || 2) +
        ' Heiltränke für das ganze Spiel, in einer Nacht auch mehrere, jedes Haus nur einmal. Dazu einen Gifttrank. Du siehst nicht, wer angegriffen wird.',
      seherin: state.seerExact
        ? 'Nachts siehst du die genaue Rolle einer Person.'
        : 'Nachts siehst du nur Team Dorfbewohner oder Böse.',
      amor: 'Nur in der ersten Nacht verbindest du zwei Personen, dich selbst eingeschlossen. Aussetzen geht nicht.',
      jaeger: 'Wenn du stirbst, schießt du auf eine Person.',
      waschbaer: 'Einmal darfst du die Rolle einer lebenden Person stehlen. Hat sie heute noch nicht gehandelt, gilt die Rolle sofort, sonst ab der nächsten Nacht.',
      nachahmerin: 'Du kannst ' + uses + ' Mal die Fähigkeit einer anderen Person nachahmen und musst sie sofort einsetzen.',
      nutte: 'Jede Nacht schläfst du in einem anderen Haus. Dein eigenes Haus ist leer.',
      russe: 'Einmal am Tag darfst du ein Duell anfangen.',
      politiker: 'Du gewinnst nur, wenn die Abstimmung dich wählt. Sonst hast du keine Fähigkeit.',
      schaufel: 'Einmal darfst du eine tote Person zurückholen. Liebe und verbrauchte Kräfte bleiben, wie sie waren.'
    };
    return text[role] || '';
  }

  function handoff(name, extra, eyebrow) {
    return header(eyebrow || phaseEyebrow(), 'Weitergeben') +
      hero('📱', 'Weitergeben') +
      '<section class="stage"><p class="eyebrow">Als Nächstes</p><h2>' + esc(name) + '</h2>' +
      '<p class="lead">Gib das Handy weiter. Tippe erst, wenn ' + esc(name) + ' allein auf den Bildschirm schaut.</p>' +
      (extra ? '<p class="hint">' + esc(extra) + '</p>' : '') +
      '<button type="button" class="btn" data-act="ack">' + esc(name) + ' ist bereit</button>' +
      abortLink() + '</section>';
  }

  function phaseEyebrow() {
    if (state.screen === 'night') return 'Nacht ' + state.nightNumber;
    if (state.screen === 'vote') return 'Tag ' + state.day + ' · Abstimmung';
    if (state.screen === 'reveal') return 'Rollen';
    if (state.screen === 'hunter') return 'Schuss';
    if (state.screen === 'duel') return 'Duell';
    if (state.screen === 'discuss' || state.screen === 'announce') return 'Tag ' + state.day;
    return 'Werwolf';
  }

  function abortLink() {
    if (state.confirmAbort) {
      return '<div class="card stack"><p>Spiel abbrechen? Die Namen bleiben erhalten.</p>' +
        '<button type="button" class="btn bad" data-act="abort">Ja, abbrechen</button>' +
        '<button type="button" class="btn secondary" data-act="abort-no">Weiter spielen</button></div>';
    }
    return '<button type="button" class="btn secondary" data-act="abort-ask">Spiel abbrechen</button>';
  }

  function renderLobby() {
    var names = state.players.map(function (p, index) {
      return '<div class="player"><span class="player-name">' + (index + 1) + '. ' + esc(p.name) +
        '</span><button type="button" class="icon-btn" data-act="remove-name" data-id="' + p.id + '" aria-label="' +
        esc(p.name) + ' entfernen">✕</button></div>';
    }).join('');
    return header('Ein Handy für die Runde', 'Werwolf') +
      hero('🌙', 'Nacht') +
      '<div class="stack">' +
      '<p class="lead">Namen nacheinander eingeben, im Uhrzeigersinn. Diese Reihenfolge ist die Sitzordnung.</p>' +
      (bridgeStorage() ? '<p class="hint">Namen und ein laufendes Spiel bleiben in EveryApp gespeichert, auch nach dem Schließen.</p>'
        : '<p class="hint">Im Browser bleibt der Stand in diesem Tab. In EveryApp übersteht er das Schließen der App.</p>') +
      errorHtml() +
      '<form id="name-form" class="stack"><input id="name-input" type="text" maxlength="16" autocomplete="off" placeholder="Name" aria-label="Name">' +
      '<button class="btn" type="submit">Name hinzufügen</button></form>' +
      names +
      '<button type="button" class="btn" data-act="to-setup"' + (state.players.length < 4 ? ' disabled' : '') + '>Weiter zu den Rollen</button>' +
      '<p class="hint">Mindestens 4 Mitspieler. Aktuell ' + state.players.length + '.</p>' +
      '<h2>Punkte</h2>' + scoreboardHtml(false) + resetControl() +
      rulesHtml() +
      '</div>';
  }

  function rulesHtml() {
    return '<details class="card"><summary>Kurze Regeln</summary>' +
      '<ul><li>Nachtfähigkeiten zielen auf Häuser, außer Seherin, Amor, Waschbär und die Schaufel (Personen). Tagsüber gilt immer die Person.</li>' +
      '<li>Die Nutte ist nachts nie daheim. Ein Treffer auf ihr Haus verpufft, ein Treffer auf das Haus, in dem sie schläft, trifft sie und den Gastgeber.</li>' +
      '<li>Werwölfe: Mehrheit, bei Gleichstand das Haus im Uhrzeigersinn ab dem Bürgermeister.</li>' +
      '<li>Abstimmung: Bürgermeister zählt 1,5. Gleichstand heißt, niemand stirbt.</li>' +
      '<li>Nach dem Aufdecken beginnt Nacht 1. Tag 1 folgt am Morgen. Das Amt dreht ab dem Ende von Nacht 2 jeden Morgen einen lebenden Sitz weiter und zusätzlich, wenn der Bürgermeister stirbt.</li>' +
      '<li>Die Hexe hat ' + (state.healPotions || 2) + ' Heiltränke für das Spiel. Sie schützt Häuser, ohne das Opfer zu kennen. Ein Trank hält in dieser Nacht jeden Tod in dem Haus auf.</li>' +
      '</ul></details>';
  }

  function wolfBounds() {
    return '<div class="stepper"><span class="role-name">Werwolf mindestens</span><span class="row" style="flex:0 0 auto;align-items:center">' +
      '<button type="button" class="icon-btn" data-act="wolf-min" data-dir="-1" aria-label="weniger minimale Werwölfe">−</button>' +
      '<strong>' + (state.wolfMin || 0) + '</strong>' +
      '<button type="button" class="icon-btn" data-act="wolf-min" data-dir="1" aria-label="mehr minimale Werwölfe">+</button></span></div>' +
      '<div class="stepper"><span class="role-name">Werwolf höchstens</span><span class="row" style="flex:0 0 auto;align-items:center">' +
      '<button type="button" class="icon-btn" data-act="wolf-max" data-dir="-1" aria-label="weniger maximale Werwölfe">−</button>' +
      '<strong>' + (state.wolfMax || 0) + '</strong>' +
      '<button type="button" class="icon-btn" data-act="wolf-max" data-dir="1" aria-label="mehr maximale Werwölfe">+</button></span></div>';
  }

  function renderSetup() {
    var poolOn = !!state.rolePool;
    var sum = 0;
    var rows = W.ROLE_ORDER.map(function (role) {
      var count = state.counts[role] || 0;
if (!(poolOn && role === 'werwolf')) sum += count;
      if (poolOn && role === 'werwolf') return wolfBounds();
      return '<div class="stepper"><span class="role-name" role="img" aria-label="' + esc(W.roleName(role)) + '">' + roleIcon(role) + '</span><span class="role-name">' + esc(W.roleName(role)) + '</span><span class="row" style="flex:0 0 auto;align-items:center">' +
        '<button type="button" class="icon-btn" data-act="bump" data-role="' + role + '" data-dir="-1" aria-label="' + esc(W.roleName(role)) + ' weniger">−</button>' +
        '<strong>' + count + '</strong>' +
        '<button type="button" class="icon-btn" data-act="bump" data-role="' + role + '" data-dir="1" aria-label="' + esc(W.roleName(role)) + ' mehr">+</button>' +
        '</span></div>';
    }).join('');
    var setupCounts = state.counts;
    if (poolOn) {
      setupCounts = {};
      W.ROLE_ORDER.forEach(function (role) { setupCounts[role] = state.counts[role] || 0; });
      setupCounts.wolfMin = state.wolfMin;
      setupCounts.wolfMax = state.wolfMax;
      sum += state.wolfMax || 0;
    }
    var problem = W.validateSetup(setupCounts, state.players.length, state.nachUses, state.healPotions == null ? 2 : state.healPotions, poolOn);
    var lead = poolOn
      ? 'Mehr Rollen als Spieler ist an. Der Pool hat ' + sum + ' Karten, verteilt werden ' + state.players.length + '. Übrige Karten bleiben draußen. Werwölfe liegen zwischen Minimum und Maximum.'
      : 'Vorschlag anpassen. Die Summe muss ' + state.players.length + ' sein. Belegt: ' + sum + '.';
    return header('Rollen', state.players.length + ' Mitspieler') +
      hero('🎴', 'Rollenwahl') +
      '<div class="stack"><p class="lead">' + lead + '</p>' +
      '<button type="button" class="btn secondary" data-act="toggle-pool" aria-pressed="' + (poolOn ? 'true' : 'false') + '">Mehr Rollen als Spieler: ' + (poolOn ? 'an' : 'aus') + '</button>' +
      '<button type="button" class="btn secondary" data-act="toggle-seer" aria-pressed="' + (state.seerExact ? 'true' : 'false') + '">Seherin sieht genaue Rolle: ' + (state.seerExact ? 'an' : 'aus') + '</button>' +
      (problem ? '<div class="banner error">' + esc(problem) + '</div>' : '') +
      '<div class="card stack">' + rows +
      '<div class="stepper"><span class="role-name">Einsätze ' + esc(W.roleName('nachahmerin')) + '</span><span class="row" style="flex:0 0 auto;align-items:center">' +
      '<button type="button" class="icon-btn" data-act="nach" data-dir="-1" aria-label="weniger Einsätze">−</button><strong>' + state.nachUses + '</strong>' +
      '<button type="button" class="icon-btn" data-act="nach" data-dir="1" aria-label="mehr Einsätze">+</button></span></div>' +
      '<div class="stepper"><span class="role-name">Heiltränke ' + esc(W.roleName('hexe')) + '</span><span class="row" style="flex:0 0 auto;align-items:center">' +
      '<button type="button" class="icon-btn" data-act="heals" data-dir="-1" aria-label="weniger Heiltränke">−</button><strong>' + (state.healPotions || 2) + '</strong>' +
      '<button type="button" class="icon-btn" data-act="heals" data-dir="1" aria-label="mehr Heiltränke">+</button></span></div></div>' +
      '<button type="button" class="btn secondary" data-act="suggest">Vorschlag</button>' +
      '<button type="button" class="btn" data-act="deal"' + (problem ? ' disabled' : '') + '>Rollen verteilen</button>' +
      '<button type="button" class="btn secondary" data-act="back-lobby">Zurück zu den Namen</button></div>';
  }

  function renderReveal() {
    if (state.step === 'show') {
      var person = player(state.activeId);
      if (!person) return header('Rollen', 'Werwolf');
      return header('Deine Rolle', person.name) +
        '<section class="stage card">' + hero(roleIcon(person.role), W.roleName(person.role)) +
        '<p class="eyebrow">Nur für ' + esc(person.name) + '</p>' +
        '<p class="big-role">' + esc(W.roleName(person.role)) + '</p>' +
        '<p class="lead">' + esc(blurb(person.role, person)) + '</p>' +
        '<button type="button" class="btn" data-act="ack">Verstanden, verdecken</button>' +
        '<button type="button" class="btn secondary" data-act="back">Zurück</button></section>';
    }
    var names = state.players.map(function (p) {
      var seen = state.revealed && state.revealed[p.id];
      return '<button type="button" class="choice' + (seen ? ' seen' : '') + '" data-act="reveal-pick" data-id="' + p.id + '">' +
        '<span><span class="who">' + esc(p.name) + '</span>' +
        (seen ? '<span class="meta">Rolle schon gesehen, noch mal möglich</span>' : '<span class="meta">Rolle ansehen</span>') +
        '</span></button>';
    }).join('');
    var startReady = W.everyoneRevealed(state);
    return header('Rollen', 'Wer ist dran?') +
      hero('🎭', 'Rollen aufdecken') +
      '<div class="stack">' + errorHtml() +
      '<p class="lead">Jede Person tippt den eigenen Namen und sieht nur die eigene Rolle. Danach ist der Name grau, bleibt aber antippbar. Spiel starten geht erst, wenn jede Person die Rolle mindestens einmal gesehen hat.</p>' +
      '<div class="stack">' + names + '</div>' +
      '<button type="button" class="btn" data-act="start-game"' + (startReady ? '' : ' disabled') + '>Spiel starten</button></div>';
  }

  function renderDiscuss() {
    var list = state.players.map(function (p, index) {
      var badges = [];
      if (p.id === state.mayorId && p.alive) badges.push('Bürgermeister');
      if (!p.alive) badges.push('tot');
      return '<div class="player' + (p.alive ? '' : ' dead') + '"><span class="life" role="img" aria-label="' + (p.alive ? 'lebt' : 'tot') + '">' + (p.alive ? '❤️' : '💀') + '</span><span><span class="player-name">' + (index + 1) + '. ' + esc(p.name) +
        '</span>' + (badges.length ? '<span class="sub">' + esc(badges.join(' · ')) + '</span>' : '') + '</span></div>';
    }).join('');
    return header(phaseEyebrow(), 'Diskussion') +
      hero('☀️', 'Tag') +
      '<div class="stack">' + mayorHtml() +
      '<p class="lead">Redet offen. Das Duell geht vor der Abstimmung, einmal pro Russe. Die Abstimmung ist geheim.</p>' +
      '<div class="stack">' + list + '</div>' +
      '<button type="button" class="btn secondary" data-act="to-duel">Duell</button>' +
      '<button type="button" class="btn" data-act="to-vote">Zur Abstimmung</button>' +
      abortLink() + '</div>';
  }

  function renderAnnounce() {
    var box = state.announce || { title: 'Weiter', lines: [], button: 'Weiter' };
    return header(phaseEyebrow(), box.title) +
      hero('📢', 'Ansage') +
      '<div class="stack">' + mayorHtml() +
      '<div class="card stack">' + box.lines.map(function (line) { return '<p>' + esc(line) + '</p>'; }).join('') + '</div>' +
      '<button type="button" class="btn" data-act="ack">' + esc(box.button || 'Weiter') + '</button></div>';
  }

  function renderTurn() {
    if (state.screen === 'night' && state.step === 'list') return renderNightList();
    if (state.screen === 'vote' && state.step === 'list') return renderVoteList();
    if ((state.screen === 'night' || state.screen === 'vote') && state.step === 'ready') return renderNightReady();
    var person = (state.screen === 'night' || state.screen === 'vote') ? player(state.activeId) : player((state.order || [])[state.cursor]);
    if (!person) {
      if (state.screen === 'night') {
        if (!Array.isArray(state.nightDone)) state.nightDone = [];
        state.step = 'list';
        state.activeId = null;
        return renderNightList();
      }
      return header('Werwolf', 'Weiter') +
        '<div class="stack"><button type="button" class="btn secondary" data-act="abort-ask">Spiel abbrechen</button></div>';
    }
    if (state.step !== 'show') return handoff(person.name);
    var prompt = W.view(state).prompt;
    if (!prompt) return handoff(person.name);
    var back = (state.promptIndex || 0) === 0
      ? '<button type="button" class="btn secondary" data-act="back">Zurück</button>'
      : '';
    return header(phaseEyebrow(), person.name) + '<div class="stack">' + errorHtml() + promptHtml(person, prompt) + back + '</div>';
  }

  function renderNightList() {
    var done = state.nightDone || [];
    var names = W.living(state).map(function (p) {
      var finished = done.indexOf(p.id) >= 0;
      return '<button type="button" class="choice' + (finished ? ' done' : '') + '" data-act="night-pick" data-id="' + p.id + '"' +
        (finished ? ' disabled' : '') + '><span><span class="who">' + esc(p.name) + '</span>' +
        '<span class="meta">' + (finished ? 'schon dran' : 'tippen, wenn du dran bist') + '</span></span></button>';
    }).join('');
    return header(phaseEyebrow(), 'Wer ist wach?') +
      hero('🌙', 'Nacht') +
      '<div class="stack">' + errorHtml() +
      '<p class="lead">Jede lebende Person tippt den eigenen Namen. Die Reihenfolge ist egal. Wer fertig ist, wird grau und kann diese Nacht nicht noch einmal.</p>' +
      '<div class="stack">' + names + '</div>' + abortLink() + '</div>';
  }

  function renderVoteList() {
    var done = state.voteDone || [];
    var names = W.living(state).map(function (p) {
      var finished = done.indexOf(p.id) >= 0;
      return '<button type="button" class="choice' + (finished ? ' done' : '') + '" data-act="vote-pick" data-id="' + p.id + '"' +
        (finished ? ' disabled' : '') + '><span><span class="who">' + esc(p.name) + '</span>' +
        '<span class="meta">' + (finished ? 'Stimme abgegeben' : (p.id === state.mayorId ? 'Bürgermeister, Stimme 1,5' : 'Stimme abgeben')) + '</span></span></button>';
    }).join('');
    return header(phaseEyebrow(), 'Wer stimmt ab?') +
      hero('🗳️', 'Abstimmung') +
      '<div class="stack">' + errorHtml() +
      '<p class="lead">Jede lebende Person tippt den eigenen Namen und stimmt geheim ab. Danach ist der Name grau. Gezählt wird, wenn alle abgestimmt haben. Der Bürgermeister zählt 1,5.</p>' +
      '<div class="stack">' + names + '</div>' + abortLink() + '</div>';
  }

  function renderNightReady() {
    var person = player(state.activeId);
    var name = person ? person.name : '';
    return header(phaseEyebrow(), name) +
      (state.screen === 'vote' ? hero('🗳️', 'Abstimmung') : hero('🌙', 'Nacht')) +
      '<section class="stage"><p class="lead">Nur ' + esc(name) + ' schaut jetzt hin.</p>' +
      '<button type="button" class="btn" data-act="go">Go</button>' +
      '<button type="button" class="btn secondary" data-act="back">Zurück</button></section>';
  }

  function promptHtml(person, prompt) {
    if (prompt.kind === 'sleep') {
      return hero('😴', 'Schlafen') + '<section class="stage"><p class="lead">Du schläfst. Für dich gibt es nichts zu tun.</p>' +
        '<button type="button" class="btn" data-act="ack">🚫 Ich will gar nichts machen</button></section>';
    }
    if (prompt.kind === 'notice') {
      var text = person.role === 'dorfbewohner'
        ? 'Jemand hat deine Rolle gestohlen. Du bist jetzt Dorfbewohner.'
        : 'Jemand hat deine Rolle gestohlen. In dieser Nacht gilt deine bisherige Rolle noch. Ab der nächsten Nacht bist du Dorfbewohner.';
      return hero('🦝', 'Diebstahl') + '<div class="banner love">' + esc(text) + '</div><button type="button" class="btn" data-act="ack">Weiter</button>';
    }
    if (prompt.kind === 'love') {
      var partners = W.loverComponent(state, person.id).filter(function (id) {
        var other = player(id);
        return id !== person.id && other && other.alive;
      });
      var lines = partners.map(function (id) {
        var other = player(id);
        return '<p><strong>' + esc(other.name) + '</strong> ist ' + esc(W.roleName(other.role)) + '.</p>';
      }).join('');
      return hero('💞', 'Liebe') + '<div class="banner love">Du bist verliebt. Stirbt eine Person aus dieser Gruppe, sterben alle verbundenen Personen mit.</div>' +
        '<div class="card stack">' + lines + '</div><button type="button" class="btn" data-act="ack">Verdecken</button>';
    }
    if (prompt.kind === 'info') {
      return hero('📢', 'Hinweis') + '<div class="card"><p class="lead">' + esc(prompt.text) + '</p></div><button type="button" class="btn" data-act="ack">Weiter</button>';
    }
    if (prompt.kind === 'seer-result') {
      var seen = player(prompt.seenId);
      var exact = !!prompt.exact;
      var headline = exact
        ? roleIcon(prompt.role) + ' ' + esc(seen ? seen.name : '')
        : esc(seen ? seen.name : '');
      var detail = exact ? W.roleName(prompt.role) : (prompt.label || 'Team Dorfbewohner');
      return hero('👁️', 'Seherin') + '<section class="stage card"><p class="eyebrow">Seherin</p><p class="big-role">' + headline + '</p>' +
        '<p class="lead">ist ' + esc(detail) + '.</p>' +
        '<button type="button" class="btn" data-act="ack">Verdecken</button></section>';
    }
    return choiceBlock(person, prompt);
  }

  function choiceBlock(person, prompt) {
    var kind = prompt.target === 'house' ? 'house' : 'person';
    var intro = intros(person, prompt);
    var list = '';
    if (prompt.kind === 'vote') {
      list = W.targetsFor(state, prompt, person.id).map(function (p) {
        return choiceButton(p.id, p.name, p.id === state.mayorId ? 'Bürgermeister' : '', 'person');
      }).join('') + choiceButton(0, 'Niemand', 'niemand lynchen', 'person');
    } else if (prompt.kind === 'schaufel') {
      list = W.targetsFor(state, prompt, person.id).map(function (p) {
        return choiceButton(p.id, p.name, 'tot', 'person');
      }).join('');
    } else {
      var targets = W.targetsFor(state, prompt, person.id);
      list = targets.map(function (p) {
        var label = kind === 'house' ? 'Haus von ' + p.name : p.name;
        var meta = '';
        if (prompt.kind === 'wolf' && p.role === 'werwolf') meta = 'Werwolf';
        return choiceButton(p.id, label, meta, kind);
      }).join('');
    }
    var wolves = prompt.kind === 'wolf' ? '<div class="card stack"><p class="hint">Rudel</p>' +
      W.wolfBoard(state, person.id).map(function (wolf) {
        return '<p><strong>' + esc(wolf.name) + '</strong> · ' + esc(wolf.choice) + '</p>';
      }).join('') + '</div>' : '';
    var skipLabel = '🚫 Ich will gar nichts machen';
    if (prompt.kind === 'heal') skipLabel = (state.heals || []).length ? 'Keine weiteren Heiltränke' : 'Keinen Heiltrank';
    if (prompt.kind === 'poison') skipLabel = 'Kein Gift';
    var canSkip = !prompt.forced && (prompt.kind === 'steal' || prompt.kind === 'copy' || prompt.kind === 'heal' ||
      prompt.kind === 'poison' || prompt.kind === 'schaufel' || prompt.kind === 'wolf' || prompt.kind === 'seer');
    var skip = canSkip ? '<button type="button" class="btn secondary" data-act="skip">' + skipLabel + '</button>' : '';
    var confirmLabel = prompt.kind === 'vote' ? 'Stimme abgeben' : (prompt.kind === 'nutte' ? 'Hier schlafen' : 'Fertig');
    return intro + wolves + '<div class="stack">' + list + '</div>' +
      '<button type="button" class="btn" data-act="confirm">' + confirmLabel + '</button>' + skip;
  }

  function intros(person, prompt) {
    var text = {
      vote: 'Wen wählst du? Der Bürgermeister zählt 1,5. Bei Gleichstand stirbt niemand.',
      wolf: 'Das Rudel wählt ein Haus. Du siehst, was die anderen Werwölfe schon gewählt haben.',
      nutte: 'In wessen Haus schläfst du diese Nacht? Dein eigenes Haus bleibt leer.',
      steal: 'Wessen Rolle stiehlst du? Hat die Person heute noch nicht gehandelt, gilt der Diebstahl sofort und du spielst die neue Fähigkeit noch in dieser Nacht. Sonst ab der nächsten Nacht. Das Haus der Nutte spielt keine Rolle.',
      seer: 'Wessen Rolle willst du sehen?',
      amor: 'Wähle zwei Personen. Du selbst darfst dabei sein. Aussetzen geht nicht. Wer heute schon dran war, erfährt die Liebe erst in der nächsten Nacht.',
      copy: 'Wen ahmst du nach? Die Fähigkeit ist frisch und muss in dieser Nacht eingesetzt werden.',
      heal: 'Du darfst ein Haus schützen, ohne zu wissen, wer angegriffen wird. Der Trank gilt nur diese Nacht und hält jeden Tod in diesem Haus auf: Wölfe, Gift und nächtliche Schüsse. Jedes Haus nur einmal. Noch ' +
        (prompt.healsLeft || 0) + ' Heiltrank' + ((prompt.healsLeft || 0) === 1 ? '' : 'e') + '.',
      poison: 'Welches andere Haus vergiftest du? Alle, die darin sind, sterben, außer ein Heiltrank schützt das Haus in dieser Nacht.',
      kill: prompt.attack === 'wolf'
        ? 'Zusätzlicher Werwolf-Angriff: wähle ein Haus.'
        : 'Nächtlicher Schuss: wähle ein Haus. Alle darin sterben.',
      schaufel: 'Wen holst du am Morgen zurück? Die Person behält Rolle und verbrauchte Kräfte und ist nicht mehr verliebt.'
    };
    var marks = {
      vote: hero('🗳️', 'Abstimmung'),
      wolf: hero('🩸', 'Wolfsangriff'),
      nutte: hero('💋', 'Nutte'),
      steal: hero('🦝', 'Diebstahl'),
      seer: hero('👁️', 'Seherin'),
      amor: hero('💘', 'Amor'),
      copy: hero('🎭', 'Nachahmen'),
      heal: '<p class="hero">' + flask('heal') + '</p>',
      poison: '<p class="hero">' + flask('poison') + '</p>',
      kill: hero('🩸', 'Angriff'),
      schaufel: hero('⛏️', 'Schaufel')
    };
    return (marks[prompt.kind] || '') + '<p class="lead">' + esc(text[prompt.kind] || 'Wähle.') + '</p>';
  }

  function renderHunter() {
    if (state.step === 'list' || state.step === 'handoff') {
      var cast = state.hunterCast && state.hunterCast.length ? state.hunterCast : (state.hunters || []);
      var pending = state.hunters || [];
      var names = cast.map(function (id) {
        var p = player(id);
        if (!p) return '';
        var finished = pending.indexOf(id) < 0;
        return '<button type="button" class="choice' + (finished ? ' done' : '') + '" data-act="hunter-pick" data-id="' + id + '"' +
          (finished ? ' disabled' : '') + '><span><span class="who">' + esc(p.name) + '</span>' +
          '<span class="meta">' + (finished ? 'hat geschossen' : 'Schuss abgeben') + '</span></span></button>';
      }).join('');
      return header('Jäger', 'Wer schießt?') +
        hero('🏹', 'Jäger') +
        '<div class="stack">' + errorHtml() +
        '<p class="lead">Jeder Jäger, der schießen muss, tippt den eigenen Namen. Die Reihenfolge ist egal. Danach ist der Name grau.</p>' +
        '<div class="stack">' + names + '</div></div>';
    }
    if (state.step === 'ready') {
      var ready = player(state.hunterId);
      var readyName = ready ? ready.name : '';
      return header('Jäger', readyName) +
        hero('🏹', 'Jäger') +
        '<section class="stage"><p class="lead">Nur ' + esc(readyName) + ' schaut jetzt hin.</p>' +
        '<button type="button" class="btn" data-act="go">Go</button>' +
        '<button type="button" class="btn secondary" data-act="back">Zurück</button></section>';
    }
    var hunter = player(state.hunterId);
    if (!hunter) return header('Schuss', 'Weiter');
    var list = W.living(state).map(function (p) {
      return choiceButton(p.id, p.name, '', 'person');
    }).join('');
    var when = state.resolution === 'morning'
      ? 'Du bist in der Nacht gestorben. Der Schuss gilt am Morgen und trifft eine Person, kein Haus.'
      : 'Du stirbst und schießt noch auf eine Person.';
    return header('Jäger', hunter.name) + hero('🏹', 'Jäger') + '<div class="stack">' + errorHtml() +
      '<p class="lead">' + esc(when) + '</p><div class="stack">' + list + '</div>' +
      '<button type="button" class="btn bad" data-act="confirm">Schießen</button>' +
      '<button type="button" class="btn secondary" data-act="back">Zurück</button></div>';
  }

  function renderDuel() {
    var duel = state.duel || { stage: 'who' };
    if (duel.stage === 'who') {
      var people = W.living(state).map(function (p) {
        return '<button type="button" class="choice" data-act="duel-pick" data-id="' + p.id + '"><span><span class="who">' + esc(p.name) + '</span>' +
          '<span class="meta">Das bin ich</span></span></button>';
      }).join('');
      return header('Duell', 'Wer bist du?') + hero('🎲', 'Duell') + '<div class="stack">' + errorHtml() +
        '<p class="lead">Tippe deinen Namen.</p>' +
        '<div class="stack">' + people + '</div>' +
        '<button type="button" class="btn secondary" data-act="cancel">Zurück</button></div>';
    }
    if (duel.stage === 'claim') {
      var claim = player(duel.claimId);
      var claimName = claim ? claim.name : '';
      return header('Duell', claimName) + hero('🎲', 'Duell') + '<div class="stack">' + errorHtml() +
        '<p class="lead">Nur ' + esc(claimName) + ' schaut jetzt hin.</p>' +
        '<button type="button" class="btn" data-act="confirm">Das bin ich</button>' +
        '<button type="button" class="btn secondary" data-act="back">Zurück</button></div>';
    }
    if (duel.stage === 'noop') {
      return header('Duell', 'Nichts passiert') + hero('🚫', 'Nichts') +
        '<section class="stage"><p class="lead">Nichts passiert.</p><button type="button" class="btn" data-act="ack">Zurück</button></section>';
    }
    if (duel.stage === 'pick') {
      var russe = player(duel.russeId);
      var foes = W.living(state).filter(function (p) { return p.id !== duel.russeId; }).map(function (p) {
        return choiceButton(p.id, p.name, '', 'person');
      }).join('');
      return header('Duell', russe ? russe.name : 'Russe') + hero('🎲', 'Duell') + '<div class="stack">' + errorHtml() +
        '<div class="banner love">' + esc(duel.forced ? 'Du musst jetzt ein Duell anfangen. Nur heute.' : ((russe ? russe.name : '') + ' ist der Russe.')) + '</div>' +
        '<p class="lead">Fordere 1 bis 5 Personen heraus. Du schießt zuerst, dann in der gewählten Reihenfolge, immer im Kreis. Eine Kugel, sechs Kammern, keine neue Drehung.</p>' +
        '<div class="stack">' + foes + '</div>' +
        '<button type="button" class="btn" data-act="confirm">Duell starten</button>' +
        (duel.forced ? '' : '<button type="button" class="btn secondary" data-act="cancel">Abbrechen</button>') + '</div>';
    }
    var puller = player(duel.order[duel.pull % duel.order.length]);
    var name = puller ? puller.name : '';
if (duel.stage === 'pull-handoff' || duel.stage === 'pull-ready') {
      return header('Duell', name) + hero('🎲', 'Duell') + '<section class="stage"><p class="eyebrow">Zug ' + (duel.pull + 1) + ' von 6</p>' +
        '<p class="lead">Eine Kugel liegt in einer der sechs Kammern. Tippe für den Abzug.</p>' +
        '<button type="button" class="btn bad" data-act="ack">Abzug ziehen</button></section>';
    }
    return header('Duell', name) + hero(duel.hit ? '💥' : '🎲', duel.hit ? 'Treffer' : 'Leer') + '<section class="stage"><p class="big-role">' + (duel.hit ? 'Knall.' : 'Klick.') + '</p>' +
      '<p class="lead">' + (duel.hit ? 'Die Kugel trifft.' : 'Die Kammer ist leer.') + '</p>' +
      '<button type="button" class="btn" data-act="ack">Weiter</button></section>';
  }

  function renderEnd() {
    var rows = state.players.map(function (p) {
      var love = (p.loverIds || []).map(function (id) {
        var other = player(id);
        return other ? other.name : '';
      }).filter(Boolean);
      var old = [];
      (state.bonds || []).forEach(function (pair) {
        var otherId = pair[0] === p.id ? pair[1] : pair[1] === p.id ? pair[0] : null;
        if (!otherId || love.indexOf(player(otherId).name) >= 0) return;
        var other = player(otherId);
        if (other && old.indexOf(other.name) < 0) old.push(other.name);
      });
      var meta = [p.alive ? 'lebt' : 'tot'];
      if (p.id === state.mayorId) meta.push('Bürgermeister');
      if (love.length) meta.push('verliebt in ' + love.join(', '));
      else if (old.length) meta.push('Liebesband gelöst, war mit ' + old.join(', '));
      return '<div class="rank"><span class="life" role="img" aria-label="' + (p.alive ? 'lebt' : 'tot') + '">' + (p.alive ? '❤️' : '💀') + '</span><span>' + esc(p.name) + '<span class="sub">' + esc(meta.join(' · ')) + '</span></span><strong>' +
        roleIcon(p.role) + ' ' + esc(W.roleName(p.role)) + '</strong></div>';
    }).join('');
    return header('Ende', 'Werwolf', true) +
      hero('🏆', 'Sieg') +
      '<div class="stack"><div class="banner win">' + esc(W.WIN_TEXT[state.winner] || 'Spiel zu Ende') + '</div>' +
      (state.winReason ? '<p class="lead">' + esc(state.winReason) + '</p>' : '') +
      '<div class="card">' + rows + '</div>' +
      '<h2>Punkte</h2>' + scoreboardHtml(true) + resetControl() +
      '<p class="hint">Das Home-Symbol oben behält die Namen und öffnet die Lobby. Punkte bleiben gespeichert.</p></div>';
  }

  function scoreboardHtml(highlight) {
    var names = {};
    Object.keys(scores).forEach(function (name) { names[name] = true; });
    (state.players || []).forEach(function (p) { if (p.name) names[p.name] = true; });
    var rows = Object.keys(names).map(function (name) {
      return {
        name: name,
        points: scores[name] || 0,
        plus: !!(highlight && (state.scoredNames || []).indexOf(name) >= 0)
      };
    });
    rows.sort(function (a, b) {
      if (b.points !== a.points) return b.points - a.points;
      return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
    });
    if (!rows.length) return '<p class="hint">Noch keine Punkte. Wer am Ende lebt und im Siegerteam ist, bekommt einen Punkt.</p>';
    return '<div class="card">' + rows.map(function (row) {
      return '<div class="rank' + (row.plus ? ' scored' : '') + '"><span>' + esc(row.name) +
        (row.plus ? ' <strong class="plus">+1</strong>' : '') + '</span><strong>' + row.points + '</strong></div>';
    }).join('') + '</div>';
  }

  function resetControl() {
    if (!confirmReset) return '<button type="button" class="btn secondary" data-act="reset-ask">Punkte zurücksetzen</button>';
    return '<div class="banner error">Alle gespeicherten Punkte löschen? Namen in alten Runden bleiben in der Liste, bis du bestätigst.</div>' +
      '<button type="button" class="btn bad" data-act="reset-scores">Ja, Punkte zurücksetzen</button>' +
      '<button type="button" class="btn secondary" data-act="reset-cancel">Abbrechen</button>';
  }

  function render() {
    if (booting) {
      app.innerHTML = '<p class="lead">Laden …</p>';
      return;
    }
    var html = '';
    if (state.screen === 'lobby') html = renderLobby();
    else if (state.screen === 'setup') html = renderSetup();
    else if (state.screen === 'reveal') html = renderReveal();
    else if (state.screen === 'discuss') html = renderDiscuss();
    else if (state.screen === 'announce') html = renderAnnounce();
    else if (state.screen === 'night' || state.screen === 'vote') html = renderTurn();
    else if (state.screen === 'hunter') html = renderHunter();
    else if (state.screen === 'duel') html = renderDuel();
    else if (state.screen === 'end') html = renderEnd();
    else html = renderLobby();
    app.innerHTML = html;
  }

  app.addEventListener('click', function (event) {
    if (rendering) return;
    var el = event.target.closest('[data-act]');
    if (!el || el.disabled) return;
    var type = el.getAttribute('data-act');
    if (type === 'bump') {
      var role = el.getAttribute('data-role');
      act({ type: 'set-count', role: role, value: (state.counts[role] || 0) + Number(el.getAttribute('data-dir')) });
      return;
    }
    if (type === 'nach') {
      var next = (state.nachUses || 1) + Number(el.getAttribute('data-dir'));
      if (next < 1) next = 1;
      if (next > 5) next = 5;
      act({ type: 'set-nach', value: next });
      return;
    }
    if (type === 'toggle-pool') {
      act({ type: 'toggle-pool' });
      return;
    }
    if (type === 'toggle-seer') {
      act({ type: 'toggle-seer' });
      return;
    }
    if (type === 'wolf-min' || type === 'wolf-max') {
      var key = type === 'wolf-min' ? 'wolfMin' : 'wolfMax';
      var value = (state[key] || 0) + Number(el.getAttribute('data-dir'));
      if (value < 0) value = 0;
      act({ type: type === 'wolf-min' ? 'set-wolf-min' : 'set-wolf-max', value: value });
      return;
    }
    if (type === 'heals') {
      var heals = (state.healPotions == null ? 2 : state.healPotions) + Number(el.getAttribute('data-dir'));
      if (heals < 1) heals = 1;
      if (heals > 8) heals = 8;
      act({ type: 'set-heals', value: heals });
      return;
    }
    if (type === 'confirm') {
      var ids = (state.selection || []).slice();
      act({ type: 'confirm', id: ids.length ? ids[0] : undefined, ids: ids });
      return;
    }
    if (type === 'select' || type === 'remove-name' || type === 'night-pick' || type === 'reveal-pick' || type === 'vote-pick' || type === 'hunter-pick' || type === 'duel-pick') {
      var actType = type === 'select' ? 'select' : type;
      act({ type: actType, id: Number(el.getAttribute('data-id')) });
      return;
    }
    act({ type: type });
  });

  app.addEventListener('submit', function (event) {
    var form = event.target;
    if (!form || form.id !== 'name-form') return;
    event.preventDefault();
    var input = document.getElementById('name-input');
    act({ type: 'add-name', name: input ? input.value : '' });
  });

  var bugBtn = document.getElementById('bug-btn');
  var bugPanel = document.getElementById('bug-panel');
  var bugText = document.getElementById('bug-text');
  var bugStatus = document.getElementById('bug-status');
  bugBtn.addEventListener('click', function () {
    bugPanel.hidden = false;
    bugStatus.textContent = '';
    W.note(state, 'Fehlerbericht geöffnet');
    persist();
  });
  document.getElementById('bug-close').addEventListener('click', function () {
    bugPanel.hidden = true;
    W.note(state, 'Fehlerbericht geschlossen');
    persist();
  });
  document.getElementById('bug-copy').addEventListener('click', function () {
    var text = W.report(state, bugText.value);
    W.note(state, 'Fehlerbericht kopiert');
    persist();
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () {
        bugStatus.textContent = 'Kopiert. Du kannst den Text einfügen.';
      }, function () { fallbackCopy(text); });
    } else fallbackCopy(text);
  });

  function fallbackCopy(text) {
    bugText.value = text;
    bugText.focus();
    bugText.select();
    bugStatus.textContent = 'Markiert. Bitte manuell kopieren.';
  }

  window.addEventListener('error', function (event) {
    if (!state || !saveReady) return;
    W.note(state, 'Fehler ' + event.message + '\n' + (event.error && event.error.stack ? event.error.stack : ''));
    persist();
  });
  window.addEventListener('unhandledrejection', function (event) {
    if (!state || !saveReady) return;
    var reason = event.reason;
    W.note(state, 'Fehler ' + (reason && reason.message ? reason.message : reason) + '\n' + (reason && reason.stack ? reason.stack : ''));
    persist();
  });

  async function boot() {
    scores = W.grantPoints(await readKey(SCORE_KEY), []);
    var savedGame = await readKey(GAME_KEY);
    var savedLobby = await readKey(LOBBY_KEY);
    if (savedGame && savedGame.screen && savedGame.screen !== 'lobby' && savedGame.players) {
      state = savedGame;
      if (!state.log) state.log = [];
      if (!state.selection) state.selection = [];
      if (!state.bonds) state.bonds = [];
      W.adoptSaved(state);
    } else if (savedLobby && savedLobby.players) {
      state = W.newLobby();
      state.players = savedLobby.players;
      state.nextId = savedLobby.nextId || (state.players.length + 1);
      state.log = savedLobby.log || [];
    }
    booting = false;
    saveReady = true;
    applyScores();
    persist();
    render();
  }

  boot();
})();

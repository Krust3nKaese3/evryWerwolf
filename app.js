(function () {
  var W = window.Werwolf;
  var LOBBY_KEY = 'werwolf.lobby.v1';
  var GAME_KEY = 'werwolf.game.v1';
  var STORAGE_TIMEOUT_MS = 4000;
  var app = document.getElementById('app');
  var state = W.newLobby();
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
    saveQueue = saveQueue.then(function () {
      return writeKey(LOBBY_KEY, lobby).then(function () { return writeKey(GAME_KEY, game); });
    }).then(function () {}, function () {});
  }

  function act(action) {
    W.send(state, action);
    persist();
    render();
  }

  function icon(kind) {
    return '<span class="mark">' + (kind === 'house' ? HOUSE : PERSON) + '</span>';
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
      hexe: 'Du hast einen Heiltrank und einen Gifttrank für das ganze Spiel.',
      seherin: 'Nachts siehst du die Rolle einer Person.',
      amor: 'Nur in der ersten Nacht verbindest du zwei Personen.',
      jaeger: 'Wenn du stirbst, schießt du auf eine Person.',
      waschbaer: 'Einmal darfst du die Rolle aus einem bewohnten Haus stehlen. Sie gilt ab der nächsten Nacht.',
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
      rulesHtml() +
      '</div>';
  }

  function rulesHtml() {
    return '<details class="card"><summary>Kurze Regeln</summary>' +
      '<ul><li>Nachtfähigkeiten zielen auf Häuser, außer Seherin, Amor und die Schaufel (Personen). Tagsüber gilt immer die Person.</li>' +
      '<li>Die Nutte ist nachts nie daheim. Ein Treffer auf ihr Haus verpufft, ein Treffer auf das Haus, in dem sie schläft, trifft sie und den Gastgeber.</li>' +
      '<li>Werwölfe: Mehrheit, bei Gleichstand das Haus im Uhrzeigersinn ab dem Bürgermeister.</li>' +
      '<li>Abstimmung: Bürgermeister zählt 1,5. Gleichstand heißt, niemand stirbt.</li>' +
      '<li>Tag 1 startet vor der ersten Nacht. Danach wandert das Amt jede Nacht einen lebenden Sitz weiter und zusätzlich, wenn der Bürgermeister stirbt.</li>' +
      '</ul></details>';
  }

  function renderSetup() {
    var sum = 0;
    var rows = W.ROLE_ORDER.map(function (role) {
      var count = state.counts[role] || 0;
      sum += count;
      return '<div class="stepper"><span class="role-name">' + esc(W.roleName(role)) + '</span><span class="row" style="flex:0 0 auto;align-items:center">' +
        '<button type="button" class="icon-btn" data-act="bump" data-role="' + role + '" data-dir="-1" aria-label="' + esc(W.roleName(role)) + ' weniger">−</button>' +
        '<strong>' + count + '</strong>' +
        '<button type="button" class="icon-btn" data-act="bump" data-role="' + role + '" data-dir="1" aria-label="' + esc(W.roleName(role)) + ' mehr">+</button>' +
        '</span></div>';
    }).join('');
    var problem = W.validateSetup(state.counts, state.players.length, state.nachUses);
    return header('Rollen', state.players.length + ' Mitspieler') +
      '<div class="stack"><p class="lead">Vorschlag anpassen. Die Summe muss ' + state.players.length + ' sein. Belegt: ' + sum + '.</p>' +
      (problem ? '<div class="banner error">' + esc(problem) + '</div>' : '') +
      '<div class="card stack">' + rows +
      '<div class="stepper"><span class="role-name">Einsätze ' + esc(W.roleName('nachahmerin')) + '</span><span class="row" style="flex:0 0 auto;align-items:center">' +
      '<button type="button" class="icon-btn" data-act="nach" data-dir="-1" aria-label="weniger Einsätze">−</button><strong>' + state.nachUses + '</strong>' +
      '<button type="button" class="icon-btn" data-act="nach" data-dir="1" aria-label="mehr Einsätze">+</button></span></div></div>' +
      '<button type="button" class="btn secondary" data-act="suggest">Vorschlag</button>' +
      '<button type="button" class="btn" data-act="deal"' + (problem ? ' disabled' : '') + '>Rollen verteilen</button>' +
      '<button type="button" class="btn secondary" data-act="back-lobby">Zurück zu den Namen</button></div>';
  }

  function renderReveal() {
    var person = player(state.order[state.cursor]);
    if (!person) return header('Rollen', 'Werwolf');
    if (state.step !== 'show') return handoff(person.name, 'Rolle noch verdeckt.');
    return header('Deine Rolle', person.name) +
      '<section class="stage card"><p class="eyebrow">Nur für ' + esc(person.name) + '</p>' +
      '<p class="big-role">' + esc(W.roleName(person.role)) + '</p>' +
      '<p class="lead">' + esc(blurb(person.role, person)) + '</p>' +
      '<button type="button" class="btn" data-act="ack">Verstanden, verdecken</button></section>';
  }

  function renderDiscuss() {
    var list = state.players.map(function (p, index) {
      var badges = [];
      if (p.id === state.mayorId && p.alive) badges.push('Bürgermeister');
      if (!p.alive) badges.push('tot');
      return '<div class="player' + (p.alive ? '' : ' dead') + '"><span><span class="player-name">' + (index + 1) + '. ' + esc(p.name) +
        '</span>' + (badges.length ? '<span class="sub">' + esc(badges.join(' · ')) + '</span>' : '') + '</span></div>';
    }).join('');
    return header(phaseEyebrow(), 'Diskussion') +
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
      '<div class="stack">' + mayorHtml() +
      '<div class="card stack">' + box.lines.map(function (line) { return '<p>' + esc(line) + '</p>'; }).join('') + '</div>' +
      '<button type="button" class="btn" data-act="ack">' + esc(box.button || 'Weiter') + '</button></div>';
  }

  function renderTurn() {
    var person = player(state.order[state.cursor]);
    if (!person) return header('Werwolf', 'Weiter');
    if (state.step !== 'show') return handoff(person.name);
    var prompt = W.view(state).prompt;
    if (!prompt) return handoff(person.name);
    return header(phaseEyebrow(), person.name) + '<div class="stack">' + errorHtml() + promptHtml(person, prompt) + '</div>';
  }

  function promptHtml(person, prompt) {
    if (prompt.kind === 'sleep') {
      return '<section class="stage"><p class="lead">Du schläfst. Für dich gibt es nichts zu tun.</p>' +
        '<button type="button" class="btn" data-act="ack">Weiter</button></section>';
    }
    if (prompt.kind === 'notice') {
      var text = person.role === 'dorfbewohner'
        ? 'Jemand hat deine Rolle gestohlen. Du bist jetzt Dorfbewohner.'
        : 'Jemand hat deine Rolle gestohlen. In dieser Nacht gilt deine bisherige Rolle noch. Ab der nächsten Nacht bist du Dorfbewohner.';
      return '<div class="banner love">' + esc(text) + '</div><button type="button" class="btn" data-act="ack">Weiter</button>';
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
      return '<div class="banner love">Du bist verliebt. Stirbt eine Person aus dieser Gruppe, sterben alle verbundenen Personen mit.</div>' +
        '<div class="card stack">' + lines + '</div><button type="button" class="btn" data-act="ack">Verdecken</button>';
    }
    if (prompt.kind === 'info') {
      return '<div class="card"><p class="lead">' + esc(prompt.text) + '</p></div><button type="button" class="btn" data-act="ack">Weiter</button>';
    }
    if (prompt.kind === 'seer-result') {
      var seen = player(prompt.seenId);
      return '<section class="stage card"><p class="eyebrow">Seherin</p><p class="big-role">' + esc(seen ? seen.name : '') + '</p>' +
        '<p class="lead">ist ' + esc(W.roleName(prompt.role)) + '.</p>' +
        '<button type="button" class="btn" data-act="ack">Verdecken</button></section>';
    }
    return choiceBlock(person, prompt);
  }

  function choiceBlock(person, prompt) {
    var kind = prompt.target === 'house' ? 'house' : 'person';
    var intro = intros(person, prompt);
    var list = '';
    if (prompt.kind === 'heal') {
      list = (prompt.attacks || []).map(function (id) {
        var owner = player(id);
        return choiceButton(id, 'Haus von ' + (owner ? owner.name : id), 'Werwolf-Angriff', 'house');
      }).join('');
    } else if (prompt.kind === 'vote') {
      list = W.targetsFor(state, prompt, person.id).map(function (p) {
        return choiceButton(p.id, p.name, p.id === state.mayorId ? 'Bürgermeister' : '', 'person');
      }).join('') + choiceButton(0, 'Niemand', 'niemand lynchen', 'person');
    } else if (prompt.kind === 'schaufel') {
      list = W.deadPlayers(state).map(function (p) {
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
    var skip = prompt.forced ? '' : (prompt.kind === 'steal' || prompt.kind === 'copy' || prompt.kind === 'heal' || prompt.kind === 'poison' || prompt.kind === 'schaufel'
      ? '<button type="button" class="btn secondary" data-act="skip">Überspringen</button>' : '');
    var confirmLabel = prompt.kind === 'vote' ? 'Stimme abgeben' : (prompt.kind === 'nutte' ? 'Hier schlafen' : 'Fertig');
    return intro + wolves + '<div class="stack">' + list + '</div>' +
      '<button type="button" class="btn" data-act="confirm">' + confirmLabel + '</button>' + skip;
  }

  function intros(person, prompt) {
    var text = {
      vote: 'Wen wählst du? Der Bürgermeister zählt 1,5. Bei Gleichstand stirbt niemand.',
      wolf: 'Das Rudel wählt ein Haus. Du siehst, was die anderen Werwölfe schon gewählt haben.',
      nutte: 'In wessen Haus schläfst du diese Nacht? Dein eigenes Haus bleibt leer.',
      steal: 'Du kannst die Rolle aus einem bewohnten Haus stehlen. Sie gilt ab der nächsten Nacht. Ist niemand zu Hause, passiert nichts.',
      seer: 'Wessen Rolle willst du sehen?',
      amor: 'Wähle zwei Personen. Sie erfahren Partner und Rollen.',
      copy: 'Wen ahmst du nach? Die Fähigkeit ist frisch und muss in dieser Nacht eingesetzt werden.',
      heal: 'Die Werwölfe haben diese Häuser gewählt. Der Heiltrank rettet alle Werwolf-Angriffe auf ein Haus, nicht Gift und nicht einen Schuss.',
      poison: 'Welches andere Haus vergiftest du? Alle, die darin sind, sterben.',
      kill: prompt.attack === 'wolf'
        ? 'Zusätzlicher Werwolf-Angriff: wähle ein Haus.'
        : 'Nächtlicher Schuss: wähle ein Haus. Alle darin sterben.',
      schaufel: 'Wen holst du am Morgen zurück? Die Person behält Rolle und verbrauchte Kräfte und ist nicht mehr verliebt.'
    };
    return '<p class="lead">' + esc(text[prompt.kind] || 'Wähle.') + '</p>';
  }

  function renderHunter() {
    var hunter = player(state.hunterId);
    if (!hunter) return header('Schuss', 'Weiter');
    if (state.step !== 'show') return handoff(hunter.name, '', 'Weiter');
    var list = W.living(state).map(function (p) {
      return choiceButton(p.id, p.name, '', 'person');
    }).join('');
    var when = state.resolution === 'morning'
      ? 'Du bist in der Nacht gestorben. Der Schuss gilt am Morgen und trifft eine Person, kein Haus.'
      : 'Du stirbst und schießt noch auf eine Person.';
    return header('Jäger', hunter.name) + '<div class="stack">' + errorHtml() +
      '<p class="lead">' + esc(when) + '</p><div class="stack">' + list + '</div>' +
      '<button type="button" class="btn bad" data-act="confirm">Schießen</button></div>';
  }

  function renderDuel() {
    var duel = state.duel || { stage: 'who' };
    if (duel.stage === 'who') {
      var people = W.living(state).map(function (p) {
        return choiceButton(p.id, p.name, '', 'person');
      }).join('');
      return header('Duell', 'Wer bist du?') + '<div class="stack">' + errorHtml() +
        '<p class="lead">Tippe deinen Namen.</p>' +
        '<div class="stack">' + people + '</div>' +
        '<button type="button" class="btn" data-act="confirm">Das bin ich</button>' +
        '<button type="button" class="btn secondary" data-act="cancel">Zurück</button></div>';
    }
    if (duel.stage === 'noop') {
      return header('Duell', 'Nichts passiert') +
        '<section class="stage"><p class="lead">Nichts passiert.</p><button type="button" class="btn" data-act="ack">Zurück</button></section>';
    }
    if (duel.stage === 'pick') {
      var russe = player(duel.russeId);
      var foes = W.living(state).filter(function (p) { return p.id !== duel.russeId; }).map(function (p) {
        return choiceButton(p.id, p.name, '', 'person');
      }).join('');
      return header('Duell', russe ? russe.name : 'Russe') + '<div class="stack">' + errorHtml() +
        '<div class="banner love">' + esc(russe ? russe.name : '') + ' ist der Russe.</div>' +
        '<p class="lead">Fordere 1 bis 5 Personen heraus. Du schießt zuerst, dann in der gewählten Reihenfolge, immer im Kreis. Eine Kugel, sechs Kammern, keine neue Drehung.</p>' +
        '<div class="stack">' + foes + '</div>' +
        '<button type="button" class="btn" data-act="confirm">Duell starten</button>' +
        '<button type="button" class="btn secondary" data-act="cancel">Abbrechen</button></div>';
    }
    var puller = player(duel.order[duel.pull % duel.order.length]);
    var name = puller ? puller.name : '';
    if (duel.stage === 'pull-handoff') {
      var challenged = duel.targets.map(function (id) { return player(id).name; }).join(', ');
      return handoff(name, (player(duel.russeId).name) + ' fordert ' + challenged + '. Zug ' + (duel.pull + 1) + ' von 6.');
    }
    if (duel.stage === 'pull-ready') {
      return header('Duell', name) + '<section class="stage"><p class="eyebrow">Zug ' + (duel.pull + 1) + ' von 6</p>' +
        '<p class="lead">Eine Kugel liegt in einer der sechs Kammern. Tippe für den Abzug.</p>' +
        '<button type="button" class="btn bad" data-act="ack">Abzug ziehen</button></section>';
    }
    return header('Duell', name) + '<section class="stage"><p class="big-role">' + (duel.hit ? 'Knall.' : 'Klick.') + '</p>' +
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
      return '<div class="rank"><span>' + esc(p.name) + '<span class="sub">' + esc(meta.join(' · ')) + '</span></span><strong>' +
        esc(W.roleName(p.role)) + '</strong></div>';
    }).join('');
    return header('Ende', 'Werwolf', true) +
      '<div class="stack"><div class="banner win">' + esc(W.WIN_TEXT[state.winner] || 'Spiel zu Ende') + '</div>' +
      (state.winReason ? '<p class="lead">' + esc(state.winReason) + '</p>' : '') +
      '<div class="card">' + rows + '</div>' +
      '<p class="hint">Das Home-Symbol oben behält die Namen und öffnet die Lobby.</p></div>';
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
    if (type === 'confirm') {
      var ids = (state.selection || []).slice();
      act({ type: 'confirm', id: ids.length ? ids[0] : undefined, ids: ids });
      return;
    }
    if (type === 'select' || type === 'remove-name') {
      act({ type: type === 'select' ? 'select' : 'remove-name', id: Number(el.getAttribute('data-id')) });
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
    var savedGame = await readKey(GAME_KEY);
    var savedLobby = await readKey(LOBBY_KEY);
    if (savedGame && savedGame.screen && savedGame.screen !== 'lobby' && savedGame.players) {
      state = savedGame;
      if (!state.log) state.log = [];
      if (!state.selection) state.selection = [];
      if (!state.bonds) state.bonds = [];
    } else if (savedLobby && savedLobby.players) {
      state = W.newLobby();
      state.players = savedLobby.players;
      state.nextId = savedLobby.nextId || (state.players.length + 1);
      state.log = savedLobby.log || [];
    }
    booting = false;
    saveReady = true;
    render();
  }

  boot();
})();

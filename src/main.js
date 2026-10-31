/* Browser shell: keys, loop, modes, recording and replay controls. Holds no game rules. */
var SF = (typeof SF === 'undefined') ? {} : SF;
(function () {
  'use strict';
  if (typeof document === 'undefined') return;
  const C = SF.CFG;
  const cv = document.getElementById('c'), ctx = cv.getContext('2d');
  const keys = {};
  const styleSel = [0, 1];
  let modes = ['human', 'ai'], levels = [1, 1];
  let speed = SF.DEFAULT_SPEED, help = false, match = null, acc = 0, lastNow = 0, koTimer = 0, helpTimer = 0;
  const SETUPS = { '1v1': [0, 1], '1v2': [0, 1, 1], '1v3': [0, 1, 1, 1], '2v2': [0, 0, 1, 1] };   /* team of each fighter */
  let setup = '1v1', obLevel = 0;
  let settings = SF.settingsLoad(localStorage), hitStopLeft = 0;     /* the player's settings (layout, palette, feedback) */
  SF.uiSettings = settings;
  let tutOn = false, tut = null;   /* the tutorial: a fixed dummy, targets and steps */
  let trainOn = false, train = null, dummyKind = 'auto';   /* trainer mode: a practice dummy and a list of drills */
  let recorder = null, lastRec = null, player = null, note = { text: '', t: 0, bad: false };
  let exporter = null, exportHold = 0;
  const liveAnim = SF.makeAnimator();      /* the displayed poses: joint-limited and smoothed (the simulation never reads them) */
  let replayAnim = null;

  function P1() {
    if (SF.touch && SF.touch.on) return SF.touch.input(match);
    return { left: keys.KeyA, right: keys.KeyD, jump: keys.KeyW, crouch: keys.KeyS, aimUp: keys.KeyQ, aimDown: keys.KeyE,
             punch: keys.KeyF, kick: keys.KeyG, block: keys.KeyH, grab: keys.KeyZ, dash: keys.KeyC, boost: keys.KeyX, turn: keys.KeyU };
  }
  function P2() {
    return { left: keys.ArrowLeft, right: keys.ArrowRight, jump: keys.ArrowUp, crouch: keys.ArrowDown,
             aimUp: keys.Numpad8 || keys.KeyI, aimDown: keys.Numpad2 || keys.KeyO,
             punch: keys.Numpad4 || keys.KeyK, kick: keys.Numpad6 || keys.KeyL,
             block: keys.Numpad5 || keys.KeyJ, grab: keys.Numpad1 || keys.KeyM, dash: keys.Numpad3 || keys.KeyN,
             boost: keys.Numpad0 || keys.Slash, turn: keys.NumpadDecimal || keys.Period };
  }
  function say(text, bad) { note = { text: text, t: 5, bad: !!bad }; }

  /* ---------- recording ---------- */
  function stopRecording() {
    if (!recorder) return;
    if (!recorder.done) SF.finishRecording(recorder, match);
    lastRec = recorder; recorder = null;
    say('Recorded ' + (lastRec.frames.length / 60).toFixed(1) + ' s. B replays it, Save keeps it.');
  }
  function startRecording() {
    if (player) return;
    if (trainOn || tutOn) { say('Recording is off in training and in the tutorial.', true); return; }
    if (recorder) { stopRecording(); return; }
    reset();
    recorder = SF.newRecording(match);
    say('Recording a new round. V stops.');
  }
  function reset() {
    if (recorder) stopRecording();
    const seed = (Date.now() % 100000) + 1;
    if (trainOn || tutOn) modes = ['human', 'dummy'];
    const teams = (trainOn || tutOn) ? SETUPS['1v1'] : SETUPS[setup], n = teams.length;
    /* more than two fighters: you against AIs, or all AIs; two keyboard players only make sense one against one */
    if (n > 2) modes = modes[0] === 'ai' ? teams.map(function () { return 'ai'; }) : teams.map(function (t, i) { return i === 0 ? 'human' : 'ai'; });
    else if (modes.length !== 2) modes = modes[0] === 'ai' ? ['ai', 'ai'] : ['human', 'ai'];
    const seen = [0, 0], styles = teams.map(function (t) { return (styleSel[t] + seen[t]++) % C.STYLES.length; });
    if (tutOn) styles[1] = 0;
    levels = teams.map(function () { return aiLevel; });
    match = SF.createMatch({ seed: seed, styles: styles, ai: modes.map(function (md) { return md === 'ai'; }), levels: levels.slice(), teams: teams, obstacles: tutOn ? 0 : obLevel, training: trainOn ? 1 : 0, tutorial: tutOn ? 1 : 0 });
    if (tutOn) { match.f[1].x = 860; SF.setDummy(match, 'fixed'); match.dummyKind = 'fixed'; tut = SF.tutorialNew(seed); } else tut = null;
    if (trainOn) { train = SF.trainingNew(styles[0]); SF.setDummy(match, dummyKind === 'auto' ? SF.trainingCurrent(train).dummy : dummyKind); } else train = null;
    SF.fxClear(); acc = 0; koTimer = 0;
    if (SF.menu && SF.menu.setTraining) SF.menu.setTraining(train);
    if (SF.menu && SF.menu.setTutorial) SF.menu.setTutorial(tut, match);
  }
  function setMode(name) {
    trainOn = false; tutOn = false;
    if (name === 'human') modes = ['human', 'human'];
    else if (name === 'ai') modes = ['human', 'ai'];
    else modes = ['ai', 'ai'];
    reset();
  }
  const MODE_ORDER = ['human', 'ai', 'cpu'];
  function modeName() { return tutOn ? 'tutorial' : trainOn ? 'train' : modes[0] === 'ai' ? 'cpu' : modes[1] === 'ai' ? 'ai' : 'human'; }

  /* ---------- replay ---------- */
  function startReplay() {
    if (recorder) stopRecording();
    if (!lastRec) { say('Nothing recorded yet: press V, play, then B.', true); return; }
    player = SF.makePlayer(lastRec); replayAnim = SF.makeAnimator();
    SF.fxClear();
    say('Replay at normal speed. [ ] change the speed, B leaves.');
  }
  function endReplay() {
    if (exporter) stopExport();
    player = null; SF.fxClear();
  }

  /* ---------- files ---------- */
  function download(name, blob) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name; a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
  }
  function saveText() {
    if (recorder) stopRecording();
    return lastRec ? SF.serializeRec(lastRec) : null;
  }
  function saveRecording() {
    const text = saveText();
    if (!text) { say('Nothing to save yet: press V, play, then V again.', true); return; }
    download('slowfist-v2-recording.json', new Blob([text], { type: 'application/json' }));
    say('Saved slowfist-v2-recording.json');
  }
  function loadText(text) {
    try {
      const rec = SF.loadRecording(text);
      if (recorder) stopRecording();
      lastRec = rec; player = null;
      say('Loaded ' + (rec.frames.length / 60).toFixed(1) + ' s, verified. B replays it.');
      return true;
    } catch (e) { say(e.message, true); return false; }
  }
  function exportVideo() {
    if (typeof MediaRecorder === 'undefined' || !cv.captureStream) { say('This browser cannot record video.', true); return; }
    if (!lastRec && !recorder) { say('Nothing recorded yet.', true); return; }
    if (player) endReplay();
    startReplay();
    if (!player) return;
    const mime = MediaRecorder.isTypeSupported('video/webm;codecs=vp9') ? 'video/webm;codecs=vp9' : 'video/webm';
    const chunks = [], mr = new MediaRecorder(cv.captureStream(60), { mimeType: mime });
    mr.ondataavailable = function (e) { if (e.data && e.data.size) chunks.push(e.data); };
    mr.onstop = function () { download('slowfist-v2-replay.webm', new Blob(chunks, { type: 'video/webm' })); say('Saved slowfist-v2-replay.webm'); };
    exporter = mr; exportHold = 0; mr.start();
    say('Exporting the replay as video...');
  }
  function stopExport() { const mr = exporter; exporter = null; if (mr && mr.state !== 'inactive') mr.stop(); }

  function toggle3d() {
    if (!SF.view3d) return;
    say('Loading the 3D view...');
    SF.view3d.toggle(function (ok, on) { say(ok ? (on ? '3D view on: drag the arena to turn the camera (3 to leave)' : '2D view') : 'The 3D view could not load (it needs an internet connection for three.js).', !ok); });
  }

  /* ---------- keys ---------- */
  addEventListener('keydown', function (e) {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].indexOf(e.code) >= 0) e.preventDefault();
    if (e.code === 'F1') { e.preventDefault(); if (SF.menu) SF.menu.openHelp(); return; }
    if (SF.audio) SF.audio.unlock();
    if (e.code === 'F2') { e.preventDefault(); if (SF.audio) SF.audio.enabled = !SF.audio.enabled; return; }
    if (!keys[e.code]) {
      if (e.code === 'Digit3') toggle3d();
      if ((e.code === 'KeyP' || e.code === 'Escape') && SF.menu) SF.menu.toggle();
      if (e.code === 'KeyV') startRecording();
      if (e.code === 'KeyB') { if (player) endReplay(); else startReplay(); }
      const frozen = !!player;                                   /* no resets while replaying */
      if (e.code === 'KeyR' && !frozen) reset();
      if (e.code === 'KeyT' && !frozen) setMode(MODE_ORDER[(MODE_ORDER.indexOf(modeName()) + 1) % 3]);
      if (e.code === 'Digit1' && !frozen) { styleSel[0] = (styleSel[0] + 1) % C.STYLES.length; reset(); }
      if (e.code === 'Digit2' && !frozen) { styleSel[1] = (styleSel[1] + 1) % C.STYLES.length; reset(); }
      if (e.code === 'BracketLeft') { if (player) SF.setPlayerSpeed(player, +(player.speed - 0.1).toFixed(1)); else speed = Math.max(0.1, +(speed - 0.1).toFixed(1)); }
      if (e.code === 'BracketRight') { if (player) SF.setPlayerSpeed(player, +(player.speed + 0.1).toFixed(1)); else speed = Math.min(1, +(speed + 0.1).toFixed(1)); }
    }
    keys[e.code] = true;
    if (help && ['KeyF', 'KeyG', 'Numpad4', 'Numpad6'].indexOf(e.code) >= 0) help = false;
  });
  addEventListener('keyup', function (e) { keys[e.code] = false; });
  addEventListener('blur', function () { for (const k in keys) keys[k] = false; });

  function bind(id, fn) { const el = document.getElementById(id); if (el) el.addEventListener('click', fn); }
  bind('bRec', function () { startRecording(); });
  bind('bPlay', function () { if (player) endReplay(); else startReplay(); });
  bind('b3d', toggle3d);
  bind('bMenu', function () { if (SF.menu) SF.menu.toggle(); });
  bind('bSave', saveRecording);
  bind('bLoad', function () { const f = document.getElementById('fLoad'); if (f) f.click(); });
  bind('bVid', exportVideo);
  const fileInput = document.getElementById('fLoad');
  if (fileInput) fileInput.addEventListener('change', function (e) {
    const f = e.target.files && e.target.files[0];
    if (f) f.text().then(loadText).catch(function () { say('Could not read the file.', true); });
    e.target.value = '';
  });

  /* ---------- loop ---------- */
  function frame(now) {
    const real = Math.min(0.1, Math.max(0, (now - lastNow) / 1000)); lastNow = now;
    if (helpTimer > 0) { helpTimer -= real; if (helpTimer <= 0 && modeName() !== 'cpu') help = false; }
    if (note.t > 0) note.t -= real;
    const tg = tut && !tut.finished ? SF.tutorialTarget(tut) : null;
    const status = { settings: settings, tutorial: tut ? { on: !tut.finished, target: tg, aim: match.f[0].aim, steps: match.steps, spawn: tut.spawn, live: SF.touch && SF.touch.on ? SF.touch.live : null, lastLive: SF.touch && SF.touch.on ? SF.touch.lastLive : null, last: tut.lastSwing, result: tut.result && match.steps - tut.result.at < 30 ? tut.result.ok : null, resultAt: tut.result } : null, speed: speed, help: help, modes: modes, sound: !!(SF.audio && SF.audio.enabled), note: note.t > 0 ? note : null, rec: null, replay: null };
    let view = match;
    if (player) {
      const n = SF.playerTake(player, real);
      for (let i = 0; i < n; i++) {
        SF.playerStep(player);
        replayAnim.step(player.match);
        SF.fxEvents(player.match);
        if (SF.audio) SF.audio.playAll(SF.soundPlan(player.match.ev));
      }
      SF.fxStep(real);
      view = player.match; status.anim = replayAnim;
      status.replay = { pos: player.pos, len: player.rec.frames.length, speed: player.speed, done: player.done };
      if (exporter && player.done) { exportHold += real; if (exportHold > 1) stopExport(); }
    } else {
      const slow = speed;                                 /* real time by default; no slow motion at the K.O. */
      if (hitStopLeft > 0) hitStopLeft -= real * 1000;              /* a brief pause of the picture on a hit (presentation only: the simulation is not touched) */
      acc += (SF.menu && SF.menu.isOpen) || hitStopLeft > 0 ? 0 : real * slow;
      let guard = 0;
      while (acc >= C.DT && guard++ < 8) {
        acc -= C.DT;
        const human = match.f.map(function (q, i) { return modes[i] === 'human' ? (i === 0 ? P1() : P2()) : modes[i] === 'dummy' ? SF.dummyInput(match.aiFlags[i] ? 'ai' : (match.dummyKind || 'still')) : null; });
        if (recorder && !recorder.done) SF.recordStep(recorder, match, human); else SF.stepAI(match, human);
        liveAnim.step(match);
        SF.fxEvents(match);
        if (modes[0] === 'human' && !tut) { const fb = SF.feedbackFor(match.ev, 0); if (settings.hitStop && fb.stopMs) hitStopLeft = Math.max(hitStopLeft, fb.stopMs); if (settings.haptics && fb.vibrate.length && navigator.vibrate) { try { navigator.vibrate(fb.vibrate); } catch (e) { /* not allowed */ } } }
        if (train) trainStep();
        if (tut) tutStep();
        if (SF.audio) SF.audio.playAll(SF.soundPlan(match.ev));
        if (recorder && recorder.done) stopRecording();
      }
      SF.fxStep(real);
      if (match.winner !== null) { koTimer += real; if (koTimer > 4.5 && modeName() === 'cpu') reset(); }
      if (recorder) status.rec = { steps: recorder.frames.length };
      status.anim = liveAnim;
    }
    if (SF.view3d && SF.view3d.on) { SF.view3d.render(view, status.anim); status.view3d = SF.view3d; }
    SF.draw(ctx, view, status);
    requestAnimationFrame(frame);
  }
  /* created once and never reassigned (QA guide 20.12) */
  window.SF_DEBUG = {
    reset: reset, setMode: setMode,
    startRecording: startRecording, stopRecording: stopRecording, startReplay: startReplay, endReplay: endReplay,
    saveText: saveText, loadText: loadText,
    get match() { return match; }, get modes() { return modes; }, get styleSel() { return styleSel; },
    get help() { return help; }, get speed() { return speed; },
    get recording() { return !!recorder; }, get replaying() { return !!player; },
    get lastRec() { return lastRec; }, get player() { return player; }, get note() { return note; }
  };
  /* ---------- the tutorial ---------- */
  function tutStep() {
    const r = SF.tutorialFeed(tut, match);
    if (r.done.length) say('Step done!');
    if (SF.menu && SF.menu.setTutorial) SF.menu.setTutorial(tut, match);
  }
  SF.tutorialActions = {
    skip: function () { if (tut) { SF.tutorialSkip(tut); if (SF.menu) SF.menu.setTutorial(tut, match); } },
    restart: function () { reset(); },
    exit: function () { applyCfg({ mode: 'ai' }, false); }
  };

  /* ---------- trainer mode ---------- */
  function trainStep() {
    const done = SF.trainingFeed(train, match);
    if (done.length) { say('Drill done! ' + SF.trainingDrills(train.style).filter(function (d) { return done.indexOf(d.id) >= 0; }).map(function (d) { return d.title; }).join(', ')); }
    /* the dummy follows the drill unless the player chose a behaviour */
    const want = dummyKind === 'auto' ? SF.trainingCurrent(train).dummy : dummyKind;
    if (match.dummyKind !== want) { match.dummyKind = want; SF.setDummy(match, want); }
    if (SF.menu && SF.menu.setTraining) SF.menu.setTraining(train);
  }
  SF.trainingActions = {
    skip: function () { if (train) { SF.trainingSkip(train); if (SF.menu) SF.menu.setTraining(train); } },
    restart: function () { if (train) { SF.trainingReset(train); if (SF.menu) SF.menu.setTraining(train); } },
    exit: function () { applyCfg({ mode: 'ai' }, false); }
  };

  /* ---------- start menu ---------- */
  let aiLevel = 1;
  function saveCfg() { try { localStorage.setItem('sf.cfg', JSON.stringify({ mode: modeName(), you: styleSel[0], opp: styleSel[1], level: aiLevel, setup: setup, speed: speed, obstacles: obLevel, dummy: dummyKind })); } catch (e) { /* private mode */ } }
  function applyCfg(c, keepRound) {
    const ok = function (v, hi) { return Number.isInteger(v) && v >= 0 && v <= hi; };
    if (ok(c.you, C.STYLES.length - 1)) styleSel[0] = c.you;
    if (ok(c.opp, C.STYLES.length - 1)) styleSel[1] = c.opp;
    if (ok(c.level, 2)) { aiLevel = c.level; levels = [aiLevel, aiLevel]; }
    if (typeof c.setup === 'string' && SETUPS[c.setup]) setup = c.setup;
    if (ok(c.obstacles, 2)) obLevel = c.obstacles;
    if (typeof c.speed === 'number' && SF.SPEEDS.indexOf(c.speed) >= 0) speed = c.speed;
    if (typeof c.dummy === 'string' && ['auto', 'still', 'block', 'attack', 'ai'].indexOf(c.dummy) >= 0) dummyKind = c.dummy;
    trainOn = c.mode === 'train'; tutOn = c.mode === 'tutorial';
    if (MODE_ORDER.indexOf(c.mode) >= 0) { if (c.mode === 'human') modes = ['human', 'human']; else if (c.mode === 'ai') modes = ['human', 'ai']; else modes = ['ai', 'ai']; }
    if (!keepRound) reset();
    saveCfg();
  }
  try { const saved = JSON.parse(localStorage.getItem('sf.cfg') || 'null'); if (saved) applyCfg(saved, true); } catch (e) { /* no saved choice */ }
  /* ---------- settings and the first-run offer ---------- */
  function applySettings(s, keep) {
    settings = SF.settingsClean(s); SF.uiSettings = settings; if (!keep) SF.settingsSave(localStorage, settings);
    if (SF.touch) SF.touch.applySettings(settings);
  }
  SF.touchSettingsApply = applySettings;
  if (SF.menu) {
    SF.menu.hooks.settings = function () { return settings; };
    SF.menu.hooks.setSettings = function (s) { applySettings(s); };
    SF.menu.hooks.quick = function () { if (player) endReplay(); reset(); };
    SF.menu.hooks.startTutorial = function () { if (player) endReplay(); applyCfg({ mode: 'tutorial' }, false); };
    SF.menu.hooks.state = function () { return { mode: modeName(), you: styleSel[0], opp: styleSel[1], level: aiLevel, setup: setup, speed: speed, obstacles: obLevel, dummy: dummyKind }; };
    SF.menu.hooks.apply = function (c) { if (player) endReplay(); applyCfg(c, false); };
  }
  reset();
  if (SF.touch) {
    SF.touch.applySettings(settings);
    SF.touch.hooks.menu = function () { if (SF.menu) SF.menu.toggle(); };
    SF.touch.match = function () { return player ? player.match : match; };
    SF.touch.hooks.restart = function () { if (!player) reset(); };
    if ('ontouchstart' in window || /[?&]touch=1/.test(location.search)) { SF.touch.enable(); help = false; helpTimer = 0; }
  }
  requestAnimationFrame(function (t) { lastNow = t; frame(t); });
  if (SF.shouldOnboard(settings) && SF.menu && SF.menu.onboard && !/[?&]noonboard=1/.test(location.search)) setTimeout(function () { SF.menu.onboard(); }, 600);
})();

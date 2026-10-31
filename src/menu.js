/* Start menu: mode, your fighter, the opponent and the AI difficulty. Browser only; it holds no rules, it hands a choice to main.js. */
var SF = (typeof SF === 'undefined') ? {} : SF;
(function () {
  'use strict';
  if (typeof document === 'undefined') return;
  const M = SF.menu = { hooks: {}, isOpen: false };
  const CHOICES = [
    { key: 'setup', title: 'Players', opts: [['1v1', '1 vs 1'], ['1v2', '1 vs 2'], ['1v3', '1 vs 3'], ['2v2', '2 vs 2 (AI ally)']] },
    { key: 'mode', title: 'Mode', opts: [['ai', 'Player vs AI'], ['cpu', 'Watch AI vs AI'], ['human', 'Two players (keyboard)'], ['train', 'Training: practice dummy and drills'], ['tutorial', 'Tutorial: punch (new)']] },
    { key: 'dummy', title: 'Training dummy', opts: [['auto', 'Follows the drill'], ['still', 'Stands still'], ['block', 'Blocks'], ['attack', 'Attacks slowly'], ['ai', 'Fights back']] },
    { key: 'you', title: 'Your fighter', opts: [[0, 'Boxer'], [1, 'Kicker'], [2, 'Grappler']] },
    { key: 'opp', title: 'Opponent', opts: [[0, 'Boxer'], [1, 'Kicker'], [2, 'Grappler']] },
    { key: 'level', title: 'AI difficulty', opts: [[0, 'Easy'], [1, 'Normal'], [2, 'Hard']] },
    { key: 'obstacles', title: 'Obstacles', opts: [[0, 'Off'], [1, 'A few boxes'], [2, 'Many boxes']] },
    { key: 'speed', title: 'Speed', opts: SF.SPEEDS.map(function (v) { return [v, v === 1 ? '1x real time' : v + 'x']; }) }
  ];
  let box = null, cfg = null;
  function build() {
    box = document.createElement('div'); box.id = 'menu';
    box.style.cssText = 'position:fixed;inset:0;z-index:20;display:none;align-items:center;justify-content:center;background:rgba(8,10,14,0.82);font-family:system-ui,sans-serif;color:#e8ecf4';
    const card = document.createElement('div');
    card.style.cssText = 'background:#151922;border:1px solid #343b50;border-radius:10px;padding:14px 18px;max-width:92vw;max-height:94vh;overflow:auto';
    const h = document.createElement('div'); h.textContent = 'Slow Fist'; h.style.cssText = 'font-weight:700;font-size:16px;margin-bottom:8px;color:#ffd24d'; card.appendChild(h);
    /* one tap to play again with the last choices */
    const qp = document.createElement('button'); qp.textContent = 'Quick play'; qp.style.cssText = 'width:100%;padding:11px;margin:2px 0 6px;border-radius:8px;border:1px solid #ffd24d;background:#ffd24d;color:#10131a;font-size:15px;font-weight:700;min-height:44px';
    qp.addEventListener('click', function () { if (M.hooks.quick) M.hooks.quick(); M.close(); }); card.appendChild(qp);
    for (const c of CHOICES) {
      const row = document.createElement('div'); row.style.cssText = 'display:flex;align-items:center;gap:8px;margin:7px 0;flex-wrap:wrap';
      const t = document.createElement('div'); t.textContent = c.title; t.style.cssText = 'width:112px;font-size:13px;color:#9aa1b3'; row.appendChild(t);
      for (const o of c.opts) {
        const b = document.createElement('button'); b.textContent = o[1]; b.dataset.key = c.key; b.dataset.val = o[0];
        b.style.cssText = 'padding:8px 12px;border-radius:6px;border:1px solid #343b50;background:#1b2030;color:#e8ecf4;font-size:13px;min-height:38px';
        b.addEventListener('click', function () { cfg[c.key] = typeof o[0] === 'number' ? o[0] : o[0]; paint(); });
        row.appendChild(b);
      }
      card.appendChild(row);
    }
    const go = document.createElement('div'); go.style.cssText = 'display:flex;gap:8px;margin-top:12px;justify-content:flex-end';
    for (const [label, fn, strong] of [['Settings', function () { M.openSettings(); }], ['Help', function () { M.openHelp(); }], ['Action pictures', function () { M.openActions(); }], ['Resume', function () { M.close(); }], ['Start new round', function () { M.hooks.apply && M.hooks.apply(Object.assign({}, cfg)); M.close(); }, true]]) {
      const b = document.createElement('button'); b.textContent = label; b.addEventListener('click', fn);
      b.style.cssText = 'padding:9px 16px;border-radius:6px;border:1px solid ' + (strong ? '#ffd24d' : '#343b50') + ';background:' + (strong ? '#ffd24d' : '#1b2030') + ';color:' + (strong ? '#10131a' : '#e8ecf4') + ';font-size:14px;font-weight:600;min-height:40px';
      go.appendChild(b);
    }
    card.appendChild(go); box.appendChild(card); document.body.appendChild(box);
  }
  function paint() {
    for (const b of box.querySelectorAll('button[data-key]')) {
      const on = String(cfg[b.dataset.key]) === b.dataset.val;
      b.style.background = on ? '#ffd24d' : '#1b2030'; b.style.color = on ? '#10131a' : '#e8ecf4'; b.style.borderColor = on ? '#ffd24d' : '#343b50';
    }
    /* the difficulty only matters when an AI plays */
    const lv = box.querySelectorAll('button[data-key="level"]'); for (const b of lv) b.style.opacity = cfg.mode === 'human' ? 0.35 : 1;
    for (const b of box.querySelectorAll('button[data-key="dummy"]')) b.style.opacity = cfg.mode === 'train' ? 1 : 0.35;
    for (const b of box.querySelectorAll('button[data-key="setup"]')) b.style.opacity = cfg.mode === 'train' ? 0.35 : 1;
  }
  M.open = function () { if (!box) build(); cfg = Object.assign({ mode: 'ai', you: 0, opp: 1, level: 1, setup: '1v1', speed: SF.DEFAULT_SPEED, obstacles: 0, dummy: 'auto' }, M.hooks.state ? M.hooks.state() : {}); paint(); box.style.display = 'flex'; M.isOpen = true; };
  M.close = function () { if (box) box.style.display = 'none'; M.isOpen = false; };
  M.toggle = function () { if (M.isOpen) M.close(); else M.open(); };

  /* ---------- training panel: the current drill, its progress and the hints ---------- */
  let tbox = null, tsig = '';
  M.setTraining = function (t) {
    if (!t) { if (tbox) tbox.style.display = 'none'; tsig = ''; return; }
    const drills = SF.trainingDrills(t.style), cur = drills[t.idx], touch = !!(SF.touch && SF.touch.on);
    const sig = [t.idx, t.counts[cur.id] || 0, Object.keys(t.done).length, Object.keys(t.skipped).length, touch].join('|');
    if (sig === tsig) return; tsig = sig;
    if (!tbox) {
      tbox = document.createElement('div'); tbox.id = 'train';
      tbox.style.cssText = 'position:fixed;top:40px;left:50%;transform:translateX(-50%);z-index:8;width:min(330px,60vw);padding:4px 8px;border-radius:8px;background:rgba(15,18,24,0.78);border:1px solid #343b50;color:#e8ecf4;font-family:system-ui,sans-serif;font-size:11px;pointer-events:none;text-align:center';
      document.body.appendChild(tbox);
    }
    tbox.style.display = 'block'; tbox.textContent = '';
    const row = function (text, css) { const d = document.createElement('div'); d.textContent = text; d.style.cssText = css || ''; tbox.appendChild(d); return d; };
    row('TRAINING  ' + (t.finished ? 'all drills finished' : 'drill ' + (t.idx + 1) + ' of ' + drills.length), 'color:#ffd24d;font-weight:700;letter-spacing:.04em');
    row(cur.title + (t.done[cur.id] ? '  \u2713' : '  ' + (t.counts[cur.id] || 0) + ' / ' + cur.target), 'font-size:13px;font-weight:700;margin:2px 0');
    row((touch ? cur.hint.touch : cur.hint.keyboard) || '', 'color:#9aa1b3');
    const bar = document.createElement('div'); bar.style.cssText = 'display:flex;gap:6px;justify-content:center;pointer-events:auto;margin-top:2px';
    [['Skip', 'skip'], ['Restart', 'restart'], ['Exit', 'exit']].forEach(function (b) {
      const x = document.createElement('button'); x.textContent = b[0]; x.style.cssText = 'padding:4px 10px;border-radius:5px;border:1px solid #343b50;background:#1b2030;color:#e8ecf4;font-size:11px;min-height:28px';
      x.addEventListener('click', function () { if (SF.trainingActions) SF.trainingActions[b[1]](); }); bar.appendChild(x);
    });
    tbox.appendChild(bar);
  };

  /* ---------- tutorial panel: the current step, how to do it on this device, the aim angle and the last hit ---------- */
  let ubox = null, usig = '';
  M.setTutorial = function (t, m) {
    if (!t) { if (ubox) ubox.style.display = 'none'; usig = ''; return; }
    const steps = SF.tutorialSteps(), cur = steps[t.idx], touch = !!(SF.touch && SF.touch.on), aim = Math.round(m.f[0].aim);
    const tg = t.finished ? null : SF.tutorialTarget(t), sgn = function (v) { return (v > 0 ? '+' : '') + Math.round(v) + '\u00B0'; };
    const last = t.lastSwing ? 'last punch ' + sgn(t.lastSwing.ang) + (Math.abs(t.lastSwing.diff) <= (tg ? tg.tol : 10) ? ' - hit' : ' - off by ' + Math.round(Math.abs(t.lastSwing.diff)) + '\u00B0') : 'no punch yet';
    const sig = [t.idx, t.counts[cur.id] || 0, Object.keys(t.done).length, Object.keys(t.skipped).length, touch, aim, t.hint, tg ? tg.ang : '', t.lastSwing ? Math.round(t.lastSwing.ang) : '', t.finished].join('|');
    if (sig === usig) return; usig = sig;
    if (!ubox) {
      ubox = document.createElement('div'); ubox.id = 'tutor';
      ubox.style.cssText = 'position:fixed;top:36px;left:50%;transform:translateX(-50%);z-index:8;width:min(400px,68vw);padding:3px 8px;border-radius:8px;background:rgba(15,18,24,0.80);border:1px solid #343b50;color:#e8ecf4;font-family:system-ui,sans-serif;font-size:10.5px;pointer-events:none;line-height:1.3';
      document.body.appendChild(ubox);
    }
    ubox.style.display = 'block'; ubox.textContent = '';
    const row = function (text, css) { const d = document.createElement('div'); d.textContent = text; d.style.cssText = css || ''; ubox.appendChild(d); return d; };
    /* three short rows and three small buttons in the corner, so the panel leaves the targets visible */
    row(t.finished ? 'PUNCH LESSON COMPLETE' : 'STEP ' + (t.idx + 1) + '/' + steps.length + '   ' + cur.title + '   ' + (t.counts[cur.id] || 0) + '/' + cur.target, 'color:#ffd24d;font-weight:700;font-size:11.5px;padding-right:62px;text-align:left');
    row(t.finished ? 'Well done. Exit to play, or restart the lesson.' : (touch ? cur.how.touch : cur.how.keyboard), 'color:#7fe0ff;text-align:left');
    if (t.hint) row(t.hint, 'color:#ffb15a;font-weight:700;text-align:left');
    else if (tg) row('Target ' + sgn(tg.ang) + (tg.need ? ' (' + tg.need + ')' : '') + '  |  you aim ' + sgn(aim) + '  |  ' + last, 'color:#9aa1b3;text-align:left');
    const bar = document.createElement('div'); bar.style.cssText = 'position:absolute;top:3px;right:4px;display:flex;gap:3px;pointer-events:auto';
    [['\u23ED', 'skip', 'Skip this step'], ['\u21BB', 'restart', 'Restart'], ['\u2715', 'exit', 'Exit the tutorial']].forEach(function (b) {
      const x = document.createElement('button'); x.textContent = b[0]; x.title = b[2]; x.style.cssText = 'width:28px;height:26px;padding:0;border-radius:5px;border:1px solid #343b50;background:#1b2030;color:#e8ecf4;font-size:13px';
      x.addEventListener('click', function () { if (SF.tutorialActions) SF.tutorialActions[b[1]](); }); bar.appendChild(x);
    });
    ubox.appendChild(bar);
  };

  /* ---------- help: every action, from the same tables the game uses (SF.helpModel) ---------- */
  let helpBox = null;
  function table(head, rows) {
    const t = document.createElement('table'); t.style.cssText = 'border-collapse:collapse;width:100%;font-size:12px;margin:4px 0 10px';
    const hr = document.createElement('tr');
    head.forEach(function (h) { const th = document.createElement('th'); th.textContent = h; th.style.cssText = 'text-align:left;padding:3px 8px;background:#1b2030;color:#ffd24d;border:1px solid #2a3042'; hr.appendChild(th); });
    t.appendChild(hr);
    rows.forEach(function (r) { const tr = document.createElement('tr'); r.forEach(function (c) { const td = document.createElement('td'); td.textContent = c; td.style.cssText = 'padding:3px 8px;border:1px solid #2a3042;vertical-align:top'; tr.appendChild(td); }); t.appendChild(tr); });
    return t;
  }
  function heading(text) { const h = document.createElement('div'); h.textContent = text; h.style.cssText = 'font-weight:700;font-size:13px;margin:10px 0 2px;color:#7fb0ff'; return h; }
  M.openHelp = function () {
    const style = (M.hooks.state ? M.hooks.state().you : 0) || 0, h = SF.helpModel(style);
    if (helpBox) helpBox.remove();
    helpBox = document.createElement('div');
    helpBox.style.cssText = 'position:fixed;inset:0;z-index:30;background:rgba(8,10,14,0.94);color:#e8ecf4;font-family:system-ui,sans-serif;overflow:auto;-webkit-overflow-scrolling:touch';
    const card = document.createElement('div'); card.style.cssText = 'max-width:860px;margin:0 auto;padding:12px 16px 40px';
    const top = document.createElement('div'); top.style.cssText = 'display:flex;justify-content:space-between;align-items:center;position:sticky;top:0;background:#0b0d12;padding:6px 0';
    const title = document.createElement('div'); title.textContent = 'Everything you can do (' + h.style + ')'; title.style.cssText = 'font-weight:700;font-size:16px;color:#ffd24d';
    const x = document.createElement('button'); x.textContent = 'Close'; x.style.cssText = 'padding:8px 16px;border-radius:6px;border:1px solid #ffd24d;background:#ffd24d;color:#10131a;font-weight:600;min-height:38px';
    x.addEventListener('click', function () { helpBox.remove(); helpBox = null; });
    top.appendChild(title); top.appendChild(x); card.appendChild(top);
    card.appendChild(heading('Controls'));
    card.appendChild(table(['Action', 'Keyboard (player 1)', 'Touch'], h.keys.map(function (k) { return [k.label, k.keyboard, k.touch]; })));
    card.appendChild(heading('Touch strokes (forward is the way you face)'));
    card.appendChild(table(['Draw', 'Hand circle', 'Leg circle'], h.gestures.map(function (g) { return [g.gesture, g.hand, g.leg]; })));
    card.appendChild(heading('Moves (frames: startup / active / recovery, 60 per second)'));
    card.appendChild(table(['Move', 'Frames', 'Keyboard', 'Touch'], h.moves.map(function (m) { return [m.name + (m.air ? ' (air)' : ''), m.frames, m.keyboard, m.touch]; })));
    card.appendChild(heading('Sequences for ' + h.style + ': press punch or kick again at the end of a move'));
    card.appendChild(table(['After', 'Punch', 'Kick'], h.sequences.map(function (s) { return [s.from, s.punch, s.kick]; })));
    card.appendChild(heading('Good to know'));
    h.notes.forEach(function (n) { const p = document.createElement('div'); p.textContent = n; p.style.cssText = 'font-size:12px;margin:3px 0;color:#c4cada'; card.appendChild(p); });
    helpBox.appendChild(card); document.body.appendChild(helpBox);
    M.isOpen = true;
    x.addEventListener('click', function () { M.isOpen = !!(box && box.style.display === 'flex'); });
  };

  /* ---------- settings ---------- */
  const OPTS = [
    ['hand', 'Handedness', [['right', 'Right-handed'], ['left', 'Left-handed']]],
    ['size', 'Control size', [[0.7, 'Small'], [0.85, 'Medium'], [1, 'Normal'], [1.2, 'Large'], [1.4, 'Huge']]],
    ['opacity', 'Control opacity', [[0.4, '40%'], [0.6, '60%'], [0.8, '80%'], [1, '100%']]],
    ['floating', 'Move circle', [[false, 'Fixed'], [true, 'Floats under the thumb']]],
    ['backBlock', 'Hold back to block', [[false, 'Off'], [true, 'On']]],
    ['tapJab', 'Tap = jab', [[true, 'On (tap the attack side)'], [false, 'Off']]],
    ['turnButton', 'TURN button', [[true, 'Show'], [false, 'Hide']]],
    ['palette', 'Colours', [['normal', 'Normal'], ['safe', 'Colour-blind safe']]],
    ['hudScale', 'Bars', [[1, 'Normal'], [1.3, 'Large'], [1.6, 'Extra large']]],
    ['haptics', 'Vibration on hits', [[true, 'On'], [false, 'Off']]],
    ['hitStop', 'Pause on hits', [[true, 'On'], [false, 'Off']]]
  ];
  let setBox = null;
  function overlay(z) { const o = document.createElement('div'); o.style.cssText = 'position:fixed;inset:0;z-index:' + z + ';background:rgba(8,10,14,0.92);color:#e8ecf4;font-family:system-ui,sans-serif;overflow:auto;-webkit-overflow-scrolling:touch'; return o; }
  function closeBtn(fn) { const x = document.createElement('button'); x.textContent = 'Close'; x.style.cssText = 'padding:8px 16px;border-radius:6px;border:1px solid #ffd24d;background:#ffd24d;color:#10131a;font-weight:600;min-height:38px'; x.addEventListener('click', fn); return x; }
  M.openSettings = function () {
    if (setBox) setBox.remove();
    setBox = overlay(40); const card = document.createElement('div'); card.style.cssText = 'max-width:560px;margin:0 auto;padding:12px 16px 40px';
    const top = document.createElement('div'); top.style.cssText = 'display:flex;justify-content:space-between;align-items:center;position:sticky;top:0;background:#0b0d12;padding:6px 0';
    const t = document.createElement('div'); t.textContent = 'Settings'; t.style.cssText = 'font-weight:700;font-size:16px;color:#ffd24d'; top.appendChild(t);
    top.appendChild(closeBtn(function () { setBox.remove(); setBox = null; })); card.appendChild(top);
    const cur = function () { return M.hooks.settings ? M.hooks.settings() : {}; };
    const paint = function () { for (const b of card.querySelectorAll('button[data-k]')) { const on = String(cur()[b.dataset.k]) === b.dataset.v; b.style.background = on ? '#ffd24d' : '#1b2030'; b.style.color = on ? '#10131a' : '#e8ecf4'; b.style.borderColor = on ? '#ffd24d' : '#343b50'; } };
    for (const [key, title, opts] of OPTS) {
      const row = document.createElement('div'); row.style.cssText = 'display:flex;align-items:center;gap:6px;margin:8px 0;flex-wrap:wrap';
      const l = document.createElement('div'); l.textContent = title; l.style.cssText = 'width:150px;font-size:13px;color:#9aa1b3'; row.appendChild(l);
      for (const [val, label] of opts) {
        const b = document.createElement('button'); b.textContent = label; b.dataset.k = key; b.dataset.v = String(val);
        b.style.cssText = 'padding:8px 11px;border-radius:6px;border:1px solid #343b50;background:#1b2030;color:#e8ecf4;font-size:13px;min-height:38px';
        b.addEventListener('click', function () { const s = Object.assign({}, cur()); s[key] = val; if (M.hooks.setSettings) M.hooks.setSettings(s); paint(); });
        row.appendChild(b);
      }
      card.appendChild(row);
    }
    const note = document.createElement('div'); note.textContent = 'Changes apply at once and are remembered on this device.'; note.style.cssText = 'font-size:11px;color:#6d7383;margin-top:10px'; card.appendChild(note);
    setBox.appendChild(card); document.body.appendChild(setBox); paint();
  };

  /* ---------- pictures of every action ---------- */
  let actBox = null;
  M.openActions = function () {
    if (actBox) actBox.remove();
    actBox = overlay(45); const top = document.createElement('div'); top.style.cssText = 'display:flex;justify-content:space-between;align-items:center;padding:6px 12px;background:#0b0d12;position:sticky;top:0';
    const t = document.createElement('div'); t.textContent = 'Every action, in pictures'; t.style.cssText = 'font-weight:700;font-size:15px;color:#ffd24d'; top.appendChild(t);
    top.appendChild(closeBtn(function () { actBox.remove(); actBox = null; })); actBox.appendChild(top);
    const fr = document.createElement('iframe'); fr.src = 'docs/ACTIONS.html'; fr.style.cssText = 'width:100%;height:calc(100% - 52px);border:0;background:#0b0d12'; actBox.appendChild(fr); document.body.appendChild(actBox);
  };

  /* ---------- the first-run offer ---------- */
  M.onboard = function () {
    const done = function (tutorial) { const s = Object.assign({}, M.hooks.settings ? M.hooks.settings() : {}, { seenIntro: true }); if (M.hooks.setSettings) M.hooks.setSettings(s); o.remove(); if (tutorial && M.hooks.startTutorial) M.hooks.startTutorial(); };
    const o = overlay(50); o.style.display = 'flex'; o.style.alignItems = 'center'; o.style.justifyContent = 'center';
    const card = document.createElement('div'); card.style.cssText = 'background:#151922;border:1px solid #343b50;border-radius:10px;padding:16px 20px;max-width:360px;text-align:center';
    const h = document.createElement('div'); h.textContent = 'New here?'; h.style.cssText = 'font-size:18px;font-weight:700;color:#ffd24d;margin-bottom:6px'; card.appendChild(h);
    const p = document.createElement('div'); p.textContent = 'Try the one-minute punch tutorial: draw a line, and the angle of the line is the angle of your punch.'; p.style.cssText = 'font-size:13px;color:#c4cada;margin-bottom:12px'; card.appendChild(p);
    const row = document.createElement('div'); row.style.cssText = 'display:flex;gap:8px;justify-content:center';
    for (const [label, tut] of [['Start the tutorial', true], ['Skip', false]]) { const b = document.createElement('button'); b.textContent = label; b.style.cssText = 'padding:10px 16px;border-radius:6px;border:1px solid ' + (tut ? '#ffd24d' : '#343b50') + ';background:' + (tut ? '#ffd24d' : '#1b2030') + ';color:' + (tut ? '#10131a' : '#e8ecf4') + ';font-weight:600;min-height:42px'; b.addEventListener('click', function () { done(tut); }); row.appendChild(b); }
    card.appendChild(row); o.appendChild(card); document.body.appendChild(o);
  };
})();

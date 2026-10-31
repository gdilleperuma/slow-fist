// Browser smoke test for the overlays and menus (QA guide 20.13, 20.34). Run it in the page opened with ?touch=1, for example:
//   fetch('/v2/tests/browser-smoke-ui.js').then(r => r.text()).then(t => (0, eval)(t)).then(console.log)
// It returns a list of failures, or ['PASS: browser UI smoke test'].
(async () => {
  const fails = [], wait = ms => new Promise(r => setTimeout(r, ms));
  const errors = []; addEventListener('error', e => errors.push(e.message));
  const D = () => window.SF_DEBUG, S = window.SF;
  await wait(1000);
  [...document.querySelectorAll('button')].filter(b => b.textContent === 'Skip').forEach(b => b.click());   /* the first-run offer (ONB-01) must not get in the way */
  await wait(100);
  const apply = async (cfg) => { S.menu.hooks.apply(Object.assign({ mode: 'ai', you: 0, opp: 1, level: 1, setup: '1v1', speed: 1, obstacles: 0, dummy: 'auto' }, cfg)); await wait(250); };

  /* BR-04 (DEF-024): the touch overlay is transparent, so the arena shows through it */
  const ctl = document.getElementById('ctl');
  if (!ctl) fails.push('BR-04 the touch overlay (#ctl) is missing: open the page with ?touch=1');
  else {
    const bg = getComputedStyle(ctl).backgroundColor;
    if (!/rgba\(0, 0, 0, 0\)|transparent/.test(bg)) fails.push('BR-04 the touch overlay is opaque: ' + bg);
    const g = ctl.getContext('2d'), mid = g.getImageData(Math.floor(ctl.width / 2), Math.floor(ctl.height / 2), 1, 1).data;
    if (mid[3] !== 0) fails.push('BR-04 the middle of the overlay (over the arena) is drawn on: alpha ' + mid[3]);
    const arena = document.getElementById('c'), a = arena.getContext('2d').getImageData(20, 20, 1, 1).data;
    if (a[0] + a[1] + a[2] === 0 && a[3] === 0) fails.push('BR-04 the arena canvas is empty');
  }

  /* BR-05: every menu choice applies */
  for (const [setup, n] of [['1v1', 2], ['1v2', 3], ['1v3', 4], ['2v2', 4]]) { await apply({ setup }); if (D().match.f.length !== n) fails.push('BR-05 setup ' + setup + ' gives ' + D().match.f.length + ' fighters, expected ' + n); }
  await apply({ obstacles: 2 }); if (D().match.obstacles.length < 2) fails.push('BR-05 obstacles did not appear');
  await apply({ level: 2, speed: 0.5 }); if (D().match.levels[1] !== 2 || D().speed !== 0.5) fails.push('BR-05 level or speed not applied: ' + D().match.levels + ' ' + D().speed);
  await apply({ mode: 'train' }); if (!D().match.training || !document.getElementById('train')) fails.push('BR-05 training mode or its panel is missing');
  await apply({ mode: 'tutorial' }); if (!D().match.tutorial || !document.getElementById('tutor')) fails.push('BR-05 tutorial mode or its panel is missing');
  const steps0 = D().match.steps; await wait(600); if (D().match.steps <= steps0) fails.push('BR-05 the tutorial match is not advancing (a drawing error stops the loop)');
  await apply({}); if (document.getElementById('tutor') && document.getElementById('tutor').style.display !== 'none') fails.push('BR-05 the tutorial panel stays after leaving the tutorial');

  /* BR-06: help lists all actions */
  S.menu.openHelp(); await wait(100);
  const panel = [...document.querySelectorAll('div')].find(d => /Everything you can do/.test(d.textContent) && d.style.position === 'fixed');
  const tables = panel ? [...panel.querySelectorAll('table')].map(t => t.rows.length) : [];   /* the help panel's own tables, not the page's guide */
  if (tables.length < 4 || tables[0] < S.INPUT_KEYS.length + 1) fails.push('BR-06 help tables missing or short: ' + tables);
  [...document.querySelectorAll('button')].filter(b => b.textContent === 'Close').forEach(b => b.click());

  /* BR-07: the touch buttons drive the simulation (boost, turn, block) */
  if (ctl) {
    ctl.setPointerCapture = () => {}; let T = performance.now(); const ev = (t, id, x, y) => { T += 8; ctl.dispatchEvent(new PointerEvent(t, { pointerId: id, bubbles: true, clientX: x, clientY: y, timeStamp: T })); };
    const H = innerHeight, pad = Math.min(72, H * 0.19), home = { x: pad + 24, y: H - 14 - pad }, br = Math.min(24, H * 0.07), ring = pad + br + 8;
    const at = d => ({ x: home.x + Math.cos(d * Math.PI / 180) * ring, y: home.y + Math.sin(d * Math.PI / 180) * ring });
    await apply({ setup: '1v1' }); const f = D().match.f[0], face0 = f.face;
    const bb = at(30); ev('pointerdown', 1, bb.x, bb.y); await wait(120); ev('pointerup', 1, bb.x, bb.y); if (!(f.boostT > 0)) fails.push('BR-07 the BOOST button did not boost');
    const tb = at(0); ev('pointerdown', 2, tb.x, tb.y); await wait(120); ev('pointerup', 2, tb.x, tb.y); if (f.face === face0) fails.push('BR-07 the TURN button did not turn');
    const kb = at(-30); ev('pointerdown', 3, kb.x, kb.y); await wait(100); const blocking = f.state === 'guard'; ev('pointerup', 3, kb.x, kb.y); if (!blocking) fails.push('BR-07 the BLOCK button did not guard (state ' + f.state + ')');
  }
  /* BR-09: random menu choices keep the page consistent (found while looking for an unexplained all-AI state): one field changes at a time, as in the menu */
  {
    let seed = 7; const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff, pick = a => a[Math.floor(rnd() * a.length)];
    const vals = { mode: ['ai', 'cpu', 'human', 'train', 'tutorial'], setup: ['1v1', '1v2', '1v3', '2v2'], you: [0, 1, 2], opp: [0, 1, 2], level: [0, 1, 2], speed: [0.25, 0.5, 0.75, 1], obstacles: [0, 1, 2], dummy: ['auto', 'still', 'block', 'attack', 'ai'] };
    for (let i = 0; i < 200 && fails.length < 5; i++) {
      const cfg = Object.assign({}, S.menu.hooks.state()), field = pick(Object.keys(vals)); cfg[field] = pick(vals[field]);
      S.menu.hooks.apply(cfg); const m = D().match, modes = D().modes, st = S.menu.hooks.state(), coerced = cfg.mode === 'human' && cfg.setup !== '1v1';
      if (modes.length !== m.f.length) fails.push('BR-09 modes ' + modes + ' for ' + m.f.length + ' fighters after ' + field + '=' + cfg[field]);
      if (st.mode !== cfg.mode && !coerced) fails.push('BR-09 mode ' + cfg.mode + ' became ' + st.mode + ' after ' + field + '=' + cfg[field]);
      if (m.f.length > 2 && modes[0] !== 'human' && cfg.mode !== 'cpu') fails.push('BR-09 the player was lost: ' + modes);
    }
    await apply({});
  }
  /* BR-10: the labelled HUD and the palette setting draw without errors */
  { const keep = Object.assign({}, S.menu.hooks.settings()); await apply({ setup: '1v1' }); S.menu.hooks.setSettings(Object.assign({}, keep, { palette: 'safe', hudScale: 1.6 })); const s0 = D().match.steps; await wait(500);
    if (D().match.steps <= s0) fails.push('BR-10 the match stopped after the palette or HUD size changed (a drawing error)'); if (S.uiSettings.palette !== 'safe') fails.push('BR-10 the palette setting did not apply');
    await apply({ setup: '1v3' }); await wait(300); S.menu.hooks.setSettings(keep); }
  /* BR-11: Quick play starts a new round with the same choices */
  { await apply({ mode: 'cpu', setup: '1v2' }); const seed0 = D().match.seed; S.menu.hooks.quick(); await wait(150); if (D().match.seed === seed0 || D().match.f.length !== 3 || D().modes[0] !== 'ai') fails.push('BR-11 quick play did not restart with the same choices'); await apply({}); }
  /* BR-12: the pause menu opens on Escape, stops the match, and Escape again resumes it */
  { await apply({}); const key = c => { dispatchEvent(new KeyboardEvent('keydown', { code: c, key: c })); dispatchEvent(new KeyboardEvent('keyup', { code: c, key: c })); };
    key('Escape'); await wait(150); if (!S.menu.isOpen) fails.push('BR-12 Escape did not open the menu'); const p0 = D().match.steps; await wait(400); if (D().match.steps - p0 > 2) fails.push('BR-12 the match kept running behind the open menu: ' + (D().match.steps - p0) + ' steps');
    key('Escape'); await wait(150); if (S.menu.isOpen) fails.push('BR-12 the second Escape did not close the menu'); const r0 = D().match.steps; await wait(400); if (D().match.steps <= r0 + 5) fails.push('BR-12 the match did not resume'); }
  /* BR-13: the first-run offer appears and is remembered */
  { S.menu.hooks.setSettings(Object.assign({}, S.menu.hooks.settings(), { seenIntro: false })); S.menu.onboard(); await wait(100); const offer = [...document.querySelectorAll('div')].find(d => d.style.position === 'fixed' && /New here\?/.test(d.textContent)), skipBtn = offer && [...offer.querySelectorAll('button')].find(b => b.textContent === 'Skip');   /* not the Skip of the training panel */ if (!skipBtn) fails.push('BR-13 the first-run offer did not appear'); else { skipBtn.click(); await wait(100); if (!S.menu.hooks.settings().seenIntro) fails.push('BR-13 skipping did not remember that the offer was seen'); } }
  /* BR-14: a tap on the jab zone punches; mirroring the layout moves the stage */
  if (ctl) {
    await apply({ setup: '1v1' }); const f = D().match.f[0], W = innerWidth, H = innerHeight; let T2 = performance.now(); const ev2 = (t, id, x, y) => { T2 += 8; ctl.dispatchEvent(new PointerEvent(t, { pointerId: id, bubbles: true, clientX: x, clientY: y, timeStamp: T2 })); };
    S.menu.hooks.setSettings(Object.assign({}, S.menu.hooks.settings(), { tapJab: true, hand: 'right' })); await wait(100);
    const names = new Set(); const poll = setInterval(() => { if (f.str) names.add(f.str.name); }, 8);
    ev2('pointerdown', 7, W * 0.62, H * 0.5); await wait(40); ev2('pointerup', 7, W * 0.62, H * 0.5); await wait(700); clearInterval(poll); if (!names.has('JAB')) fails.push('BR-14 a tap on the attack half did not jab: ' + [...names]);
    const c = document.getElementById('c'), m0 = c.style.marginLeft; S.menu.hooks.setSettings(Object.assign({}, S.menu.hooks.settings(), { hand: 'left' })); await wait(100); if (c.style.marginLeft === m0) fails.push('BR-14 mirroring did not move the stage');
    S.menu.hooks.setSettings(Object.assign({}, S.menu.hooks.settings(), { hand: 'right' })); await wait(100);
  }
  /* BR-15: while down, W chooses the kip-up (the wheel is drawn without errors), and the match goes on */
  { await apply({ mode: 'ai', setup: '1v1' }); const key = (c, d) => dispatchEvent(new KeyboardEvent(d ? 'keydown' : 'keyup', { code: c, key: c })); const f = D().match.f[0]; D().match.f[1].x = 860;
    f.state = 'down'; f.t = 0.5; f.stagDur = 2.5; f.protect = 99; f.sta = 100; f.recov = null; f.techDone = true; await wait(100);
    key('KeyW', true); await wait(150); key('KeyW', false); if (f.state !== 'getup' || f.recov !== 'kip') fails.push('BR-15 W while down did not start the kip-up: ' + f.state + ' ' + f.recov);
    const s0 = D().match.steps; await wait(600); if (D().match.steps <= s0 + 10) fails.push('BR-15 the match stopped after the recovery'); }
  if (errors.length) fails.push('BR-08 page errors: ' + errors.slice(0, 3).join(' | '));
  const bad = JSON.stringify(D().match.f.map(f => [f.x, f.h, f.hp, f.sta])).match(/null|NaN/); if (bad) fails.push('BR-03 non-numeric state');
  return fails.length ? fails : ['PASS: browser UI smoke test'];
})()

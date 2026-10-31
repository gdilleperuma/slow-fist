'use strict';
// SET, LAY, BKB, TAP, FBK, ONB, PWA, ACT: settings, layout, back-block, tap-to-jab, feedback, onboarding, offline app, and the action catalogue.
const fs = require('fs'), path = require('path');
module.exports = function (X) {
  const { test, ok, eq, near, SF, C, NONE } = X;
  const L = require('../mobile/layout.js'), P = require('../mobile/plan.js');
  const root = path.join(__dirname, '..');
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

  /* ---------- settings ---------- */
  test('SET-01', 'settings: defaults, validation and clamping; unknown keys are dropped; wrong types fall back to the default', () => {
    const D = SF.SETTINGS_DEFAULT; ok(D && D.hand === 'right' && D.size === 1 && D.tapJab === true && D.turnButton === true && D.palette === 'normal', 'defaults');
    eq(JSON.stringify(SF.settingsClean({})), JSON.stringify(D), 'an empty object gives the defaults');
    const s = SF.settingsClean({ hand: 'left', size: 9, opacity: -3, floating: 'yes', palette: 'neon', evil: 1, hudScale: 99, backBlock: true });
    eq(s.hand, 'left'); eq(s.size, 1.4, 'size clamped'); eq(s.opacity, 0.3, 'opacity clamped'); eq(s.floating, D.floating, 'a string is not a boolean'); eq(s.palette, 'normal', 'unknown palette'); eq(s.hudScale, 1.6); eq(s.backBlock, true); ok(!('evil' in s), 'unknown key dropped');
    eq(SF.settingsClean(null).hand, 'right'); eq(SF.settingsClean('x').size, 1); eq(SF.settingsClean({ size: NaN }).size, 1);
  });
  test('SET-02', 'settings are saved and loaded through a storage; a broken or missing value gives the defaults and never throws', () => {
    const store = {}; const ls = { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } };
    SF.settingsSave(ls, { hand: 'left', size: 1.2, backBlock: true }); const back = SF.settingsLoad(ls); eq(back.hand, 'left'); near(back.size, 1.2, 1e-9); eq(back.backBlock, true);
    store['sf.settings'] = '{not json'; eq(SF.settingsLoad(ls).hand, 'right', 'broken JSON'); delete store['sf.settings']; eq(SF.settingsLoad(ls).size, 1, 'missing');
    eq(SF.settingsLoad({ getItem() { throw new Error('private mode'); } }).hand, 'right', 'a storage that throws'); SF.settingsSave({ setItem() { throw new Error('full'); } }, {});   /* must not throw */
  });
  test('SET-03', 'the colour-blind palette has distinct team colours and distinct bar colours', () => {
    const a = SF.palette('normal'), b = SF.palette('safe'); ok(JSON.stringify(a) !== JSON.stringify(b), 'differs from normal');
    const rgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)), d = (x, y) => Math.hypot(...rgb(x).map((v, i) => v - rgb(y)[i]));
    const cols = [].concat(b.team[0], b.team[1], [b.hp, b.sta, b.guard]); for (let i = 0; i < cols.length; i++) for (let j = i + 1; j < cols.length; j++) ok(d(cols[i], cols[j]) > 70, 'colours ' + cols[i] + ' and ' + cols[j] + ' are too close (' + d(cols[i], cols[j]).toFixed(0) + ')');
    ok(b.team[0].length >= 2 && b.team[1].length >= 3, 'enough colours for four fighters');
  });
  test('ONB-01', 'onboarding: offered on the first run only, and not again once seen', () => {
    eq(SF.shouldOnboard(SF.settingsClean({})), true); eq(SF.shouldOnboard(SF.settingsClean({ seenIntro: true })), false);
  });

  /* ---------- layout ---------- */
  const S0 = SF.settingsClean({});
  test('LAY-01', 'the default (right-handed) layout is exactly the old one: attack circles stacked at the right, the move circle at the left, three buttons on an arc to its right', () => {
    const g = L.compute(850, 393, 6, S0, false), R = Math.min(9.5 * 6, 393 * 0.15), pad = Math.min(12 * 6, 393 * 0.19), floor = 393 - 14;
    near(g.R, R, 1e-9); near(g.pad, pad, 1e-9); near(g.leg.x, 850 - R - 18, 1e-9); near(g.leg.y, floor - R, 1e-9); near(g.hand.y, floor - 3 * R - 6, 1e-9); near(g.home.x, pad + 24, 1e-9); near(g.home.y, floor - pad, 1e-9);
    ok(g.block.y < g.turn.y && g.turn.y < g.boost.y, 'BLOCK above TURN above BOOST'); ok(g.block.x > g.home.x && g.boost.x > g.home.x, 'the buttons are on the stage side of the move circle');
    ok(g.stageLeft > g.home.x + g.pad && g.stageRight >= 2 * g.R, 'the columns reserve room for the controls');
  });
  test('LAY-02', 'left-handed mode mirrors everything: x becomes W - x, the stage columns swap, the buttons face the stage', () => {
    const a = L.compute(850, 393, 6, S0, false), b = L.compute(850, 393, 6, SF.settingsClean({ hand: 'left' }), false);
    for (const k of ['hand', 'leg', 'home', 'block', 'turn', 'boost']) { near(b[k].x, 850 - a[k].x, 1e-9, k + ' x'); near(b[k].y, a[k].y, 1e-9, k + ' y'); near(b[k].r, a[k].r, 1e-9); }
    near(b.stageLeft, a.stageRight, 1e-9); near(b.stageRight, a.stageLeft, 1e-9); ok(b.block.x < b.home.x, 'the buttons are now on its left, toward the stage');
  });
  test('LAY-03', 'size and fit: at every size and on small screens nothing leaves the screen or overlaps, and the buttons stay big enough to hit', () => {
    for (const [W, H] of [[850, 393], [640, 360], [960, 450]]) for (const size of [0.7, 1, 1.4]) for (const hand of ['right', 'left']) {
      const g = L.compute(W, H, 6, SF.settingsClean({ size: size, hand: hand }), false), tag = W + 'x' + H + ' size ' + size + ' ' + hand;
      for (const k of ['hand', 'leg', 'home', 'block', 'turn', 'boost']) { const c = g[k]; ok(c.x - c.r >= 0 && c.x + c.r <= W && c.y - c.r >= 0 && c.y + c.r <= H, tag + ': ' + k + ' is on the screen'); }
      ok(dist(g.hand, g.leg) >= g.hand.r + g.leg.r - 0.5, tag + ': the attack circles do not overlap');
      for (const k of ['block', 'turn', 'boost']) { ok(dist(g[k], g.home) >= g.home.r + g[k].r - 1, tag + ': ' + k + ' is clear of the move circle'); if (size >= 1) ok(g[k].r >= 17, tag + ': ' + k + ' is at least 17 px'); }
      ok(dist(g.block, g.turn) >= g.block.r + g.turn.r - 0.5 && dist(g.turn, g.boost) >= g.turn.r + g.boost.r - 0.5, tag + ': the buttons do not overlap each other');
    }
    const s = L.compute(850, 393, 6, SF.settingsClean({ size: 0.7 }), false), m = L.compute(850, 393, 6, S0, false), b = L.compute(850, 393, 6, SF.settingsClean({ size: 1.4 }), false);
    ok(s.R < m.R && m.R < b.R && s.pad < m.pad && m.pad < b.pad, 'the size setting scales the circles');
  });
  test('LAY-04', 'what a touch means: the circles, the buttons, the stick half, and (when allowed) the rest of the attack half is a jab zone; the TURN button can be hidden', () => {
    const g = L.compute(850, 393, 6, S0, false), at = (p, s) => L.zoneAt(g, 850, 393, p, s || S0);
    eq(at(g.hand), 'hand'); eq(at(g.leg), 'leg'); eq(at(g.block), 'block'); eq(at(g.boost), 'boost'); eq(at(g.turn), 'turn'); eq(at({ x: g.home.x - 50, y: g.home.y + 10 }), 'stick'); eq(at(g.menu), 'menu'); eq(at(g.restart), 'restart'); eq(at(g.size), 'size');
    eq(at({ x: 700, y: 200 }), g.hand.x - 700 < g.hand.r * 1.25 ? 'hand' : 'tap', 'the empty right half is the tap zone'); eq(at({ x: 560, y: 250 }), 'tap');
    eq(at({ x: 560, y: 250 }, SF.settingsClean({ tapJab: false })), null, 'no tap zone when it is off'); eq(at({ x: 560, y: 20 }), null, 'the top strip is not a zone');
    eq(L.zoneAt(g, 850, 393, g.turn, SF.settingsClean({ turnButton: false })), 'stick', 'a hidden TURN button leaves its place to the move circle area');
    const m = L.compute(850, 393, 6, SF.settingsClean({ hand: 'left' }), false); eq(L.zoneAt(m, 850, 393, m.hand, SF.settingsClean({ hand: 'left' })), 'hand'); eq(L.zoneAt(m, 850, 393, { x: 850 - 560, y: 250 }, SF.settingsClean({ hand: 'left' })), 'tap');
  });

  /* ---------- the stick, back-block ---------- */
  test('BKB-01', 'holding the stick away from the opponent blocks (when switched on), and walks backward at the same time; never forward, up or down', () => {
    const on = { backBlock: true }, off = { backBlock: false };
    ok(P.stickInputs('left', 1, on).block && P.stickInputs('left', 1, on).left, 'facing right, left blocks and walks back');
    ok(P.stickInputs('right', -1, on).block && P.stickInputs('right', -1, on).right, 'facing left, right blocks');
    for (const [seg, face] of [['right', 1], ['left', -1], ['up', 1], ['down', 1], [null, 1]]) ok(!P.stickInputs(seg, face, on).block, 'no block for ' + seg + ' facing ' + face);
    for (const seg of ['left', 'right', 'up', 'down']) for (const face of [1, -1]) ok(!P.stickInputs(seg, face, off).block, 'switched off: no block');
    ok(P.stickInputs('up', 1, off).jump && P.stickInputs('down', 1, off).crouch && P.stickInputs('right', 1, off).right, 'the plain mapping is unchanged');
  });

  /* ---------- feedback ---------- */
  test('FBK-01', 'feedback: a hit you land pauses the picture briefly, a hit you take buzzes, a block or parry buzzes lightly, nothing for other fighters or misses; always bounded', () => {
    ok(typeof SF.feedbackFor === 'function', 'SF.feedbackFor exists');
    const f = evs => SF.feedbackFor(evs, 0), hit = (a, d, tag, dmg) => ({ k: 'hit', a: a, d: d, tag: tag || 'HIT', dmg: dmg === undefined ? 12 : dmg });
    const mine = f([hit(0, 1)]); ok(mine.stopMs > 0 && mine.stopMs <= 250, 'a landed hit stops the picture: ' + mine.stopMs); eq(mine.vibrate.length > 0, true, 'and gives a tap');
    const big = f([hit(0, 1, 'HIT', 40)]); ok(big.stopMs > mine.stopMs, 'a bigger hit stops it longer'); ok(f([hit(0, 1, 'HIT', 9999)]).stopMs <= 250, 'capped');
    const taken = f([hit(1, 0)]); ok(taken.vibrate.length > 0 && taken.stopMs > 0, 'a hit taken buzzes'); ok(taken.vibrate.reduce((s, v) => s + v, 0) > f([hit(1, 0, 'BLOCK')]).vibrate.reduce((s, v) => s + v, 0), 'a block buzzes less than a hit');
    ok(f([hit(1, 0, 'PARRY')]).vibrate.length >= 2, 'a parry has its own pattern');
    const none = f([hit(1, 2), { k: 'whiff', a: 0 }, { k: 'dodge', a: 0, d: 1 }]); eq(none.stopMs, 0, 'nothing for other fighters or a miss'); eq(none.vibrate.length, 0);
    ok(f([{ k: 'ko', winner: 0, d: 1, over: true }]).stopMs >= 150, 'the K.O. pauses the picture'); ok(f([{ k: 'knockdown', a: 1, d: 0 }]).vibrate.length > 0, 'a knockdown buzzes');
    ok(f([hit(0, 1), hit(0, 1), hit(0, 1)]).stopMs <= 250, 'several hits in one step stay bounded'); eq(f([]).stopMs, 0); eq(f(undefined).stopMs, 0, 'no events');
  });

  /* ---------- the offline app ---------- */
  test('PWA-01', 'the app can be installed and works offline: manifest, icons, service worker, and the 3D library is kept locally', () => {
    const man = JSON.parse(fs.readFileSync(path.join(root, 'manifest.webmanifest'), 'utf8'));
    ok(man.name && man.short_name && man.start_url && /fullscreen|standalone/.test(man.display) && man.orientation === 'landscape', 'manifest fields');
    const sizes = []; for (const ic of man.icons) { const p = path.join(root, ic.src); ok(fs.existsSync(p), 'icon ' + ic.src); const b = fs.readFileSync(p); eq(b.slice(1, 4).toString(), 'PNG'); sizes.push(b.readUInt32BE(16) + 'x' + b.readUInt32BE(20)); }
    ok(sizes.indexOf('192x192') >= 0 && sizes.indexOf('512x512') >= 0, 'icons of 192 and 512: ' + sizes.join(','));
    const sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8'); ok(/CACHE\s*=/.test(sw) && /addEventListener\('fetch'/.test(sw) && /addEventListener\('install'/.test(sw), 'service worker caches on install and answers fetches');
    ok(fs.existsSync(path.join(root, 'vendor', 'three.min.js')) && fs.statSync(path.join(root, 'vendor', 'three.min.js')).size > 400000, 'three.js is vendored');
    const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8'); ok(/rel="manifest"/.test(html) && /serviceWorker\.register\('sw\.js'/.test(html), 'the page links the manifest and registers the worker');
    ok(/vendor\/three\.min\.js/.test(fs.readFileSync(path.join(root, 'src', 'render3d.js'), 'utf8')), 'the 3D view loads the local copy first');
  });
  test('PWA-02', 'the worker caches every file the page needs', () => {
    const sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8'), m = /const ASSETS = (\[[\s\S]*?\]);/.exec(sw); ok(m, 'an ASSETS list'); const list = JSON.parse(m[1].replace(/'/g, '"'));
    for (const must of ['./', 'index.html', 'manifest.webmanifest', 'vendor/three.min.js', 'docs/ACTIONS.html']) ok(list.indexOf(must) >= 0, 'cached: ' + must);
    for (const f of list) if (f !== './') ok(fs.existsSync(path.join(root, f)), 'the cached file exists: ' + f);
    ok(/CACHE = 'slowfist-v/.test(sw), 'the cache name is versioned so an update replaces it');
  });

  test('PWA-03', 'the service worker behaves: installs the cache, serves assets from it, takes the page from the network but falls back to the cache offline (run in a fake worker environment)', () => {
    const vm = require('vm'), code = fs.readFileSync(path.join(root, 'sw.js'), 'utf8'); new vm.Script(code);          /* it parses */
    const handlers = {}, store = {}, calls = { opened: [], added: [], deleted: [] }; let online = true;
    const makeCache = name => ({ addAll: list => { calls.added.push(...list); store[name] = store[name] || {}; list.forEach(u => { store[name][u] = 'cached:' + u; }); return Promise.resolve(); }, put: (req, res) => { store[name] = store[name] || {}; store[name][req.url] = res; return Promise.resolve(); } });
    const caches = { open: n => { calls.opened.push(n); store[n] = store[n] || {}; return Promise.resolve(makeCache(n)); }, keys: () => Promise.resolve(['old-cache', 'slowfist-v-keep'].concat(Object.keys(store))), delete: n => { calls.deleted.push(n); return Promise.resolve(true); },
      match: req => { const url = typeof req === 'string' ? req : req.url; for (const n in store) for (const k in store[n]) if (url.endsWith((k.indexOf('./') === 0 ? k.slice(2) : k)) || k === url) return Promise.resolve(store[n][k]); return Promise.resolve(undefined); } };
    const ctx = vm.createContext({ self: { addEventListener: (t, f) => { handlers[t] = f; }, skipWaiting: () => Promise.resolve(), clients: { claim: () => Promise.resolve() } }, caches: caches, URL: URL, Promise: Promise, fetch: () => online ? Promise.resolve({ clone() { return this; }, tag: 'network' }) : Promise.reject(new Error('offline')) });
    vm.runInContext(code, ctx);
    ok(handlers.install && handlers.activate && handlers.fetch, 'install, activate and fetch handlers');
    let waited; handlers.install({ waitUntil: p => { waited = p; } }); return waited.then(() => {
      ok(calls.added.indexOf('index.html') >= 0 && calls.added.indexOf('vendor/three.min.js') >= 0, 'the install cached the assets: ' + calls.added.length);
      let w2; handlers.activate({ waitUntil: p => { w2 = p; } }); return w2;
    }).then(() => {
      ok(calls.deleted.indexOf('old-cache') >= 0, 'old caches are deleted on activate');
      const respond = (url, mode) => { let r; handlers.fetch({ request: { method: 'GET', url: 'http:' + '/' + '/x/v2/' + url, mode: mode || 'cors' }, respondWith: p => { r = p; } }); return r; };
      return respond('index.html', 'navigate').then(r => { eq(r.tag, 'network', 'online: the page comes from the network'); online = false; return respond('index.html', 'navigate'); })
        .then(r => { ok(r !== undefined, 'offline: the page comes from the cache'); return respond('vendor/three.min.js'); })
        .then(r => { eq(r, 'cached:vendor/three.min.js', 'an asset comes from the cache'); });
    });
  });

  /* ---------- the action catalogue ---------- */
  test('ACT-01', 'every action has three preview poses; every move of the frame table, every input key and the special states are listed', () => {
    const list = SF.actionList(0), ids = list.map(a => a.id);
    for (const name in C.MOVES) ok(ids.indexOf('move:' + name) >= 0, 'move ' + name + ' is listed');
    for (const id of ['stand', 'block', 'parry', 'crouch', 'jump', 'dash', 'sprint', 'grab', 'throw', 'knockdown', 'getup', 'boost', 'turn']) ok(ids.indexOf(id) >= 0, 'action ' + id + ' is listed');
    for (const k of SF.INPUT_KEYS) ok(list.some(a => a.keys && a.keys.indexOf(k) >= 0), 'input key ' + k + ' belongs to an action');
    for (const a of list) { const poses = SF.actionPoses(a.id); eq(poses.length, 3, a.id + ' has three poses'); for (const p of poses) { ok(p.label, a.id + ' pose label'); for (const k in p.sk) { const pts = Array.isArray(p.sk[k][0]) ? p.sk[k] : [p.sk[k]]; for (const q of pts) ok(isFinite(q[0]) && isFinite(q[1]) && q[1] <= C.GY + 1, a.id + ' ' + k + ' is a finite point above the floor'); } } }
  });
  test('ACT-02', 'the previews are meaningful: in a move the pose changes between the start, the contact and the recovery; a stand does not', () => {
    const moved = (a, b) => { let w = 0; for (const k of ['hand', 'foot', 'knee', 'elbow']) for (let i = 0; i < 2; i++) w = Math.max(w, Math.hypot(a[k][i][0] - b[k][i][0], a[k][i][1] - b[k][i][1])); w = Math.max(w, Math.hypot(a.head[0] - b.head[0], a.head[1] - b.head[1])); return w; };
    for (const name in C.MOVES) { const p = SF.actionPoses('move:' + name); ok(moved(p[0].sk, p[1].sk) > 6, name + ': the start and the contact differ (' + moved(p[0].sk, p[1].sk).toFixed(1) + ')'); ok(moved(p[1].sk, p[2].sk) > 4, name + ': the contact and the recovery differ'); }
    const st = SF.actionPoses('stand'); ok(moved(st[0].sk, st[2].sk) < 3, 'standing is the same in all three');
  });
  test('ACT-04', 'moves look different: the contact poses of any two moves differ by at least 4 px (RMS over all joints, hip-relative), except the pairs listed with a reason', () => {
    const vec = sk => { const h = sk.hip, out = []; for (const k of ['head', 'neck', 'chest', 'shoulder', 'shoulderB']) out.push(sk[k][0] - h[0], sk[k][1] - h[1]); for (const k of ['elbow', 'hand', 'knee', 'foot']) for (let i = 0; i < 2; i++) out.push(sk[k][i][0] - h[0], sk[k][i][1] - h[1]); return out; };
    const rms = (a, b) => Math.sqrt(a.reduce((s, v, i) => s + (v - b[i]) * (v - b[i]), 0) / a.length);
    /* pairs allowed to look alike, with the reason the page then shows another way */
    const ALIKE = {};
    const ids = SF.actionList(0).filter(a => a.id.indexOf('move:') === 0).map(a => a.id), pose = {}; for (const id of ids) { const p = SF.actionPoses(id); pose[id] = { v: vec(p[1].sk), sx: p[1].sx === undefined ? 1 : p[1].sx }; }
    const tooClose = [];
    for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
      const d = rms(pose[ids[i]].v, pose[ids[j]].v) + 40 * Math.abs(pose[ids[i]].sx - pose[ids[j]].sx);          /* a figure squeezed by a spin is a different picture */
      if (d < 4 && !ALIKE[ids[i] + '|' + ids[j]]) tooClose.push(ids[i].slice(5) + ' / ' + ids[j].slice(5) + ' (' + d.toFixed(1) + ')');
    }
    eq(tooClose.length, 0, 'moves that look the same: ' + tooClose.join(', '));
  });
  test('ACT-03', 'the catalogue page docs/ACTIONS.html is up to date with the game (regenerate with: node tools/make-actions.js)', () => {
    const gen = require('../tools/make-actions.js'); const html = gen.build(), file = fs.readFileSync(path.join(root, 'docs', 'ACTIONS.html'), 'utf8');
    ok(html === file, 'ACTIONS.html is stale: run node tools/make-actions.js'); ok((html.match(/<svg/g) || []).length >= 3 * SF.actionList(0).length / 1, 'an image for every pose'); for (const name in C.MOVES) ok(html.indexOf(name) >= 0, name + ' is in the page');
  });
};

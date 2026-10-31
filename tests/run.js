'use strict';
// Slow Fist v2 test suite. Every requirement id in docs/REQUIREMENTS.md appears here.
// Run: node tests/run.js        (exit code 1 if anything fails)
const { loadSF } = require('./load.js');
const SF = loadSF();
const C = SF.CFG;
const results = [];
function test(id, title, fn) {
  try { fn(); results.push({ id, title, ok: true }); }
  catch (e) { results.push({ id, title, ok: false, err: e && e.message ? e.message : String(e) }); }
}
function eq(a, b, msg) { if (a !== b) throw new Error((msg || 'expected equal') + ': ' + JSON.stringify(a) + ' vs ' + JSON.stringify(b)); }
function near(a, b, tol, msg) { if (!(Math.abs(a - b) <= tol)) throw new Error((msg || 'expected near') + ': ' + a + ' vs ' + b + ' (tol ' + tol + ')'); }
function ok(c, msg) { if (!c) throw new Error(msg || 'assertion failed'); }

const NONE = {};
// two fighters facing each other, 60 px apart, standing
// fixture distance is derived from the config (DEF-002): inside every style's grab range
const FIX_DIST = Math.min.apply(null, C.STYLES.map(s => s.grab)) - 5;
function pair(a, b, seed) {
  const m = SF.createMatch({ seed: seed || 1, styles: [a || 0, b || 1] });
  m.f[0].x = 300; m.f[1].x = 300 + FIX_DIST;
  return m;
}
function run(m, n, i0, i1) { for (let i = 0; i < n; i++) SF.step(m, [i0 || NONE, i1 || NONE]); }
function evs(m, k) { return m.ev.filter(e => !k || e.k === k); }
// launch a strike directly (used to set up combat situations without depending on input timing)
function strike(m, a, limb, kind, ang, s, counter) {
  const f = m.f[a];
  f.state = 'strike'; f.t = 0; f.limb = limb;
  f.str = { limb, kind, a: ang, s: s || 1, dur: C.STRIKE_T / (s || 1), counter: !!counter, hit: false, name: kind };
  return f;
}
function allNumbers(o, path, out) {
  out = out || [];
  if (typeof o === 'number') { if (!isFinite(o)) out.push(path); }
  else if (o && typeof o === 'object') for (const k in o) allNumbers(o[k], path + '.' + k, out);
  return out;
}

// ---------- fixtures and static scans (QA guide 20.1, 20.7, 20.8, 20.9) ----------
test('FIX-01', 'fixture distance sits inside every range the tests rely on', () => {
  const m = pair();
  const dx = Math.abs(m.f[1].x - m.f[0].x);
  for (const s of C.STYLES) {
    ok(dx <= s.grab, s.name + ' grab range ' + s.grab + ' < fixture ' + dx);
    ok(dx <= s.pr + 18 && dx <= s.kr + 18, s.name + ' strike reach');
  }
  ok(dx >= 44, 'fixture is farther apart than the collision separation');
});
test('SYNTAX-01', 'every source and test file parses (DEF-006)', () => {
  const r = require('./lint.js').syntax();
  if (r.length) throw new Error(r.join(' | '));
});
test('LINT-01', 'static scans of src/ and tests/ find nothing (20.1, 20.2, 20.7, 20.9)', () => {
  const lint = require('./lint.js').scan();
  if (lint.length) throw new Error(lint.slice(0, 5).join(' | '));
});
test('STA-03', 'a jump with too little stamina is refused and stamina never goes negative', () => {
  const m = pair(); const f = m.f[0]; f.sta = 5.5;
  run(m, 2, { jump: true }); run(m, 4, NONE);
  ok(!f.air, 'cannot jump with 5.5 stamina');
  ok(f.sta >= 0, 'stamina ' + f.sta);
});

// ---------- SIM ----------
test('SIM-01', 'same seed + same inputs give the same state hash', () => {
  const a = SF.createMatch({ seed: 7, styles: [0, 1], ai: [true, true] }), b = SF.createMatch({ seed: 7, styles: [0, 1], ai: [true, true] });
  for (let i = 0; i < 900; i++) { SF.stepAI(a); SF.stepAI(b); }
  eq(SF.stateHash(a), SF.stateHash(b), 'hash');
  const c = SF.createMatch({ seed: 8, styles: [0, 1], ai: [true, true] });
  for (let i = 0; i < 900; i++) SF.stepAI(c);
  ok(SF.stateHash(c) !== SF.stateHash(a), 'different seed should differ');
});
test('SIM-02', 'time step is clamped into [0, 1/20]', () => {
  const m = pair();
  const t0 = m.t; SF.step(m, [NONE, NONE], -1); eq(m.t, t0, 'negative dt adds no time');
  SF.step(m, [NONE, NONE], 5); near(m.t - t0, C.DT_MAX, 1e-9, 'huge dt clamps');
  SF.step(m, [NONE, NONE], NaN); ok(isFinite(m.t), 'NaN dt must not poison time');
});
test('SIM-03', 'no NaN or infinity in state over 30 AI fights', () => {
  for (let s = 1; s <= 30; s++) {
    const m = SF.createMatch({ seed: s, styles: [s % 3, (s + 1) % 3], ai: [true, true] });
    for (let i = 0; i < 1800 && !m.winner; i++) {
      SF.stepAI(m);
      if (i % 5 === 0) { const bad = allNumbers(m.f, 'f'); if (bad.length) throw new Error('seed ' + s + ' step ' + i + ': ' + bad.slice(0, 3).join(',')); }
    }
  }
});
test('SIM-04', 'config is deeply frozen and not changed by fights', () => {
  const before = JSON.stringify(C);
  let threw = false;
  try { C.STYLES[0].hpMax = 1; } catch (e) { threw = true; }
  ok(threw, 'writing to CFG must throw in strict mode');
  const m = SF.createMatch({ seed: 3, styles: [0, 1], ai: [true, true] });
  for (let i = 0; i < 600; i++) SF.stepAI(m);
  m.f[0].style.hpMax; // style objects are shared references; mutation must be impossible
  eq(JSON.stringify(C), before, 'CFG unchanged');
});

// ---------- FLR ----------
test('FLR-01', 'h never negative outside flipped (30 AI fights)', () => {
  for (let s = 1; s <= 30; s++) {
    const m = SF.createMatch({ seed: 100 + s, styles: [s % 3, (s + 2) % 3], ai: [true, true] });
    for (let i = 0; i < 1800 && !m.winner; i++) {
      SF.stepAI(m);
      for (const f of m.f) if (f.h < -1e-9 && f.state !== 'flipped') throw new Error('seed ' + (100 + s) + ' step ' + i + ' h=' + f.h + ' state=' + f.state);
    }
  }
});
function checkSkeleton(f, tag) {
  const k = SF.skeleton(f), L = C.LIMB, d = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  for (const name in k) { const p = k[name]; if (p[1] > C.GY + 1) throw new Error(tag + ' ' + name + ' under the floor by ' + (p[1] - C.GY).toFixed(2) + ' state=' + f.state); }
  for (const s of [0, 1]) {
    near(d([k.shoulder, k.shoulderB][s], k.elbow[s]), L.upperArm, 1, tag + ' upper arm');
    near(d(k.elbow[s], k.hand[s]), L.foreArm, 1, tag + ' forearm');
    near(d(k.hip, k.knee[s]), L.thigh, 1, tag + ' thigh');
    near(d(k.knee[s], k.foot[s]), L.shin, 1, tag + ' shin');
  }
  return k;
}
test('FLR-02/03', 'skeleton above floor with constant limb lengths in every state', () => {
  for (const st of C.STATES) for (const style of [0, 1, 2]) for (const cr of [0, 1]) for (const air of [false, true]) {
    const m = SF.createMatch({ seed: 5, styles: [style, 1] }), f = m.f[0];
    f.state = st; f.t = 0.2; f.cr = cr; f.drop = 30 * cr; f.aim = 20; f.limb = 'kick';
    if (air) { f.air = true; f.h = 60; }
    if (st === 'strike') f.str = { limb: 'kick', kind: 'straight', a: 20, s: 1, dur: 0.4, hit: false };
    if (st === 'flipped') f.h = 10;
    checkSkeleton(f, st + '/' + style + '/cr' + cr + '/air' + air);
  }
});
test('FLR-02b', 'skeleton above floor throughout 20 AI fights (sampled)', () => {
  for (let s = 1; s <= 20; s++) {
    const m = SF.createMatch({ seed: 200 + s, styles: [s % 3, (s + 1) % 3], ai: [true, true] });
    for (let i = 0; i < 1800 && !m.winner; i++) { SF.stepAI(m); if (i % 3 === 0) for (const f of m.f) checkSkeleton(f, 'seed ' + (200 + s) + ' step ' + i); }
  }
});
test('FLR-05', 'drawn extents (head radius) stay above the floor in every state', () => {
  for (const st of C.STATES) for (const cr of [0, 1]) for (const air of [false, true]) for (let r = 0; r <= (st === 'flipped' ? 63 : 0); r += 3) {
    const m = SF.createMatch({ seed: 5, styles: [1, 1] }), f = m.f[0];
    f.state = st; f.t = 0.3; f.cr = cr; f.drop = 32 * cr; f.limb = 'punch';
    if (air) { f.air = true; f.h = 40; }
    if (st === 'strike') f.str = { limb: 'punch', kind: 'straight', a: 0, s: 1, dur: 0.4, hit: false };
    if (st === 'flipped') { f.h = 5; f.rot = -r / 10; }      // sweep every rotation: at some angle the head is the lowest point
    const k = SF.skeleton(f);
    ok(k.head[1] + C.LIMB.head <= C.GY + 1, 'head bottom ' + (k.head[1] + C.LIMB.head - C.GY).toFixed(1) + ' px under the floor in ' + st + ' cr' + cr + ' air' + air + ' rot ' + (-r / 10));
  }
});
test('FLR-06', 'a lying figure rests on the floor (neither sunk nor floating)', () => {
  for (const st of ['down', 'getup']) for (const t of st === 'down' ? [0.3, 0.6] : [0.0]) {
    const m = SF.createMatch({ seed: 5, styles: [0, 1] }), f = m.f[0]; f.state = st; f.t = t;
    const k = SF.skeleton(f); let low = -1e9;
    for (const n in k) (Array.isArray(k[n][0]) ? k[n] : [k[n]]).forEach(q => { low = Math.max(low, q[1] + (n === 'head' ? C.LIMB.head : 0)); });
    const headGap = C.GY - (k.head[1] + C.LIMB.head);
    ok(C.GY - low <= 2 && C.GY - low >= -1, st + ' t=' + t + ' lowest extent is ' + (C.GY - low).toFixed(1) + ' px from the floor');
    if (st === 'down') ok(headGap >= -1 && headGap <= 3, 'head floats ' + headGap.toFixed(1) + ' px above the floor');
    if (st === 'down') ok(Math.min(C.GY - k.foot[0][1], C.GY - k.foot[1][1]) <= 8, 'neither foot touches the floor in down');
  }
});
test('MUT-01', 'every deliberate mutation is detected (the tests can fail)', () => {
  const r = require('./mutate.js').runAll();
  if (r.length) throw new Error(r.join(' | '));
});
test('FLR-04','knees point toward the facing direction in upright poses', () => {
  for (const st of ['idle', 'guard', 'charge', 'recover', 'stagger']) for (const face of [1, -1]) for (const cr of [0, 1]) {
    const m = SF.createMatch({ seed: 5, styles: [0, 1] }), f = m.f[0];
    f.state = st; f.face = face; f.cr = cr; f.drop = 30 * cr;
    const k = SF.skeleton(f);
    for (const s of [0, 1]) {
      const mid = (k.hip[0] + k.foot[s][0]) / 2;
      ok((k.knee[s][0] - mid) * face >= -0.5, 'knee behind the hip-foot line in ' + st + ' face ' + face + ' cr ' + cr);
    }
  }
});

// ---------- MOV ----------
function fighter(style, props) { const m = SF.createMatch({ seed: 2, styles: [style, 1] }); Object.assign(m.f[0], props || {}); return m.f[0]; }
test('MOV-01', 'move selection table (punches and kicks)', () => {
  const P = (p, st) => SF.pickMove(fighter(st || 0, Object.assign({ limb: 'punch' }, p))).name;
  const K = (p, st) => SF.pickMove(fighter(st || 0, Object.assign({ limb: 'kick' }, p))).name;
  eq(P({ charge: 0 }), 'JAB'); eq(P({ charge: 0.1 }), 'CROSS'); eq(P({ charge: 0.25 }), 'HOOK'); eq(P({ charge: 0.6 }), 'SPINNING BACKFIST');
  eq(P({ aim: 40 }), 'UPPERCUT'); eq(P({ aim: -30 }), 'OVERHAND'); eq(P({ cr: 1 }), 'UPPERCUT');
  eq(P({ air: true, vx: 0 }), 'SUPERMAN PUNCH');
  eq(K({ charge: 0 }), 'FRONT KICK'); eq(K({ charge: 0.25 }), 'ROUNDHOUSE'); eq(K({ charge: 0.6 }, 0), 'AXE KICK');
  eq(K({ charge: 0.6 }, 1), 'SPINNING KICK', 'only the Kicker spins');
  eq(K({ aim: 40, charge: 0 }, 1), 'RISING KICK'); eq(K({ aim: -20 }), 'LOW KICK'); eq(K({ cr: 1 }), 'LOW SWEEP');
  eq(K({ air: true }), 'FLYING SIDE KICK');
});
test('MOV-02', 'strike angle is clamped to anatomical limits', () => {
  const lim = (st, limb, p) => SF.angLimits(fighter(st, p), limb);
  eq(lim(0, 'kick')[1], 35); eq(lim(1, 'kick')[1], 60); eq(lim(2, 'kick')[1], 28); eq(lim(0, 'punch')[1], 55);
  eq(lim(0, 'punch')[0], -45); eq(lim(0, 'kick')[0], -25);
  eq(lim(1, 'kick', { cr: 1 })[1], 35, 'crouching costs 25 degrees');
  eq(lim(1, 'kick', { legHurt: 2 })[1], 50, 'injured leg costs 10');
  eq(lim(1, 'kick', { off: true })[1], 52, 'off balance costs 8');
  eq(lim(1, 'kick', { air: true })[1], 68, 'air adds 8');
  eq(SF.clampAim(fighter(0), 'kick', 90), 35); eq(SF.clampAim(fighter(0), 'punch', -90), -45);
});
test('MOV-03', 'tap boost: +0.7*tap, cap 3, cost 12 stamina, 0.08 s gap', () => {
  const m = pair(0, 1); const f = m.f[0];
  strike(m, 0, 'punch', 'straight', 10, 1);
  const s0 = f.str.s, sta0 = f.sta;
  run(m, 1, { punch: true }); // first tap (rising edge)
  near(f.str.s, s0 + C.TAP_BOOST * C.STYLES[0].tap, 1e-6, 'one tap');
  near(f.sta, sta0 - C.TAP_COST, 1e-6, 'tap cost');
  run(m, 1, NONE); run(m, 1, { punch: true });          // second tap right away: inside the gap
  near(f.str.s, s0 + C.TAP_BOOST * C.STYLES[0].tap, 1e-6, 'gap blocks a tap');
  for (let i = 0; i < 40; i++) { f.str && (f.t = 0); f.tapCD = 0; run(m, 1, NONE); run(m, 1, { punch: true }); }
  ok(f.str.s <= C.STRIKE_MAX + 1e-9, 'cap');
  eq(f.str.s, C.STRIKE_MAX);
});
test('MOV-04', 'jump needs the ground and no crouch; leg injury lowers it', () => {
  let m = pair(); run(m, 2, { jump: true }); run(m, 6, NONE); ok(m.f[0].air, 'jumped');
  m = pair(); m.f[0].cr = 1; run(m, 1, { jump: true, crouch: true }); run(m, 6, { crouch: true }); ok(!m.f[0].air, 'no jump while crouched');
  const healthy = pair(); run(healthy, 2, { jump: true }); run(healthy, 6, NONE);
  m = pair(); m.f[0].legHurt = 3; run(m, 2, { jump: true }); run(m, 6, NONE);
  ok(healthy.f[0].vy - m.f[0].vy > 80, 'injured jump is weaker: ' + m.f[0].vy + ' vs ' + healthy.f[0].vy);
  m = pair(); run(m, 2, { jump: true }); run(m, 10, NONE); const vy = m.f[0].vy; run(m, 3, { jump: true }); ok(m.f[0].vy <= vy, 'no double jump');
});

// ---------- CMB ----------
// the attacker is always fighter 0 (DEF-001: no positional index; argument types are checked)
function hit(m, kind, ang, s, limb, counter) {
  if (!m || !m.f || typeof kind !== 'string' || typeof ang !== 'number' || typeof s !== 'number' || (limb !== 'punch' && limb !== 'kick')) throw new TypeError('hit(m, kind:string, ang:number, s:number, limb:punch|kick) got ' + JSON.stringify([typeof m, kind, ang, s, limb]));
  strike(m, 0, limb, kind, ang, s, counter);
  m.ev.length = 0; SF.impact(m, m.f[0], m.f[1]);
  return evs(m, 'hit')[0] || null;
}
test('CMB-01', 'guard outcomes: parry, block, partial, hit', () => {
  // strike angle 0 hits the body, so the zone factor is 1 and ratios are exact
  const setup = (age, aimDiff) => { const m = pair(0, 0); const d = m.f[1]; d.state = 'guard'; d.guardAge = age; d.aim = aimDiff; return m; };
  const tol = 28 - 10 * ((1 - 0.4) / 1.2) + C.STYLES[0].tolB;      // speed 1: speedNorm 0.5
  eq(hit(setup(0.1, 0), 'straight', 0, 1, 'punch').tag, 'PARRY');
  eq(hit(setup(0.5, 0), 'straight', 0, 1, 'punch').tag, 'BLOCK');
  eq(hit(setup(0.5, tol * 1.5), 'straight', 0, 1, 'punch').tag, 'PARTIAL');
  eq(hit(setup(0.5, tol * 2.5), 'straight', 0, 1, 'punch').tag, 'HIT');
  const base = hit(pair(0, 0), 'straight', 0, 1, 'punch'), h = hit(setup(0.5, 0), 'straight', 0, 1, 'punch');
  near(h.dmg / base.dmg, 0.1, 0.001, 'block = 10 percent');
  const hp = hit(setup(0.5, tol * 1.5), 'straight', 0, 1, 'punch');
  near(hp.dmg / base.dmg, 0.5, 0.001, 'partial = 50 percent');
});
test('CMB-02', 'hit zone follows contact height', () => {
  eq(hit(pair(), 'straight', 10, 1, 'punch').zone, 'HEAD');
  eq(hit(pair(), 'straight', 0, 1, 'punch').zone, 'BODY');
  eq(hit(pair(), 'low', -20, 1, 'kick').zone, 'LEGS');
});
test('CMB-03', 'damage multipliers by zone, charging target, off balance', () => {
  const body = hit(pair(), 'straight', 0, 1, 'punch').dmg, head = hit(pair(), 'straight', 10, 1, 'punch').dmg;
  near(head / body, 1.3, 0.01, 'head x1.3');
  const legs = hit(pair(), 'low', -20, 1, 'kick').dmg;
  const kickBody = hit(pair(), 'low', 5, 1, 'kick').dmg;
  near(legs / kickBody, 0.8, 0.01, 'legs x0.8');
  const m1 = pair(); m1.f[1].state = 'charge';
  near(hit(m1, 'straight', 0, 1, 'punch').dmg / body, 1.3, 0.01, 'counter x1.3');
  const m2 = pair(); m2.f[1].off = true; m2.f[1].bal = 0.8;
  near(hit(m2, 'straight', 0, 1, 'punch').dmg / body, 1.25, 0.01, 'off balance x1.25');
});
test('CMB-04', 'knockdown threshold: tip > 52 (40 if off balance), grounded only', () => {
  let m = pair(1, 0); strike(m, 0, 'kick', 'spin', 0, 3); m.ev.length = 0; SF.impact(m, m.f[0], m.f[1]);
  ok(evs(m, 'knockdown').length === 1, 'big spin kick knocks down');
  m = pair(0, 0); strike(m, 0, 'punch', 'straight', 0, 1); m.ev.length = 0; SF.impact(m, m.f[0], m.f[1]);
  ok(evs(m, 'knockdown').length === 0, 'jab does not');
  m = pair(1, 0); m.f[1].air = true; m.f[1].h = 40; strike(m, 0, 'kick', 'spin', 0, 3); m.ev.length = 0; SF.impact(m, m.f[0], m.f[1]);
  ok(evs(m, 'knockdown').length === 0, 'airborne cannot be floored');
});
test('CMB-05', 'whiffs: target down, flipped, early get-up, dashing (dodge)', () => {
  for (const st of ['down', 'flipped']) { const m = pair(); m.f[1].state = st; strike(m, 0, 'punch', 'straight', 10, 1); m.ev.length = 0; SF.impact(m, m.f[0], m.f[1]); ok(evs(m, 'whiff').length === 1 && m.f[1].hp === m.f[1].style.hpMax, st); }
  let m = pair(); m.f[1].state = 'getup'; m.f[1].t = 0.1; strike(m, 0, 'punch', 'straight', 10, 1); m.ev.length = 0; SF.impact(m, m.f[0], m.f[1]); ok(evs(m, 'whiff').length === 1, 'early get-up');
  m = pair(); m.f[1].inv = 0.1; strike(m, 0, 'punch', 'straight', 10, 1); m.ev.length = 0; SF.impact(m, m.f[0], m.f[1]);
  ok(evs(m, 'dodge').length === 1 && m.f[1].counter >= 0.7 && m.f[1].hp === m.f[1].style.hpMax, 'dodge');
  m = pair(); m.f[1].x = 600; strike(m, 0, 'punch', 'straight', 10, 1); m.ev.length = 0; SF.impact(m, m.f[0], m.f[1]); ok(evs(m, 'whiff').length === 1, 'out of range');
});
test('CMB-06', 'combo: hit inside the reaction within 1.2 s adds 10 percent', () => {
  const m = pair(); const first = hit(m, 'straight', 0, 1, 'punch'); eq(m.f[1].state, 'stagger'); eq(first.combo, 1);
  m.f[0].bal = 0;                                   // DEF-004: the first hit changed the attacker's balance; reset it so only the combo bonus differs
  const second = hit(m, 'straight', 0, 1, 'punch'); eq(second.combo, 2); near(second.dmg / first.dmg, 1.1, 0.01, 'x1.1');
  const m2 = pair(); const a = hit(m2, 'straight', 0, 1, 'punch'); m2.f[1].state = 'idle'; m2.f[1].comboT = 0; eq(hit(m2, 'straight', 0, 1, 'punch').combo, 1, 'chain broken');
});
test('CMB-07', 'guard break at gHP 0: 1.0 s stagger, gHP back to 60 percent', () => {
  const m = pair(0, 0); const d = m.f[1]; d.state = 'guard'; d.guardAge = 1; d.aim = 10; d.gHP = 1;
  m.ev.length = 0; strike(m, 0, 'punch', 'straight', 10, 1); SF.impact(m, m.f[0], d);
  ok(evs(m, 'guardBreak').length === 1); eq(d.state, 'stagger'); near(d.stagDur, 1.0, 1e-9); near(d.gHP, d.style.gmax * 0.6, 1e-9);
});

// ---------- GRP ----------
function grabTest(setup) { const m = pair(0, 0); setup(m, m.f[0], m.f[1]); m.ev.length = 0; SF.doThrow(m, m.f[0], m.f[1]); return { m, e: evs(m, 'grappleFail')[0] || null, started: m.f[0].state === 'grapple' }; }
test('GRP-01', 'grapple fails: crouched, dashing, retreating, out of range, airborne, down', () => {
  ok(grabTest((m, a, d) => { d.cr = 1; }).e.reason === 'ducked');
  ok(grabTest((m, a, d) => { d.inv = 0.1; }).e.reason === 'evaded');
  ok(grabTest((m, a, d) => { d.vx = 200; }).e.reason === 'evaded');
  ok(grabTest((m, a, d) => { d.x = 500; }).e.reason === 'whiff');
  ok(grabTest((m, a, d) => { d.air = true; d.h = 30; }).e.reason === 'whiff');
  ok(grabTest((m, a, d) => { a.air = true; a.h = 30; }).e.reason === 'whiff');
  ok(grabTest((m, a, d) => { d.state = 'down'; }).e.reason === 'whiff');
  ok(grabTest(() => {}).started, 'a clean grab starts');
});
test('GRP-02', 'throw ends with the victim down at h=0; damage 14*thr; stamina -20', () => {
  for (const st of [0, 2]) {
    const m = pair(st, 0), a = m.f[0], d = m.f[1]; const hp0 = d.hp, sta0 = d.sta;
    SF.doThrow(m, a, d);
    let min = 0; for (let i = 0; i < 120 && d.state !== 'down'; i++) { SF.step(m, [NONE, NONE]); min = Math.min(min, d.h); }
    eq(d.state, 'down'); eq(d.h, 0, 'lands on the floor'); eq(d.rot, 0, 'rotation reset');
    near(hp0 - d.hp, 14 * C.STYLES[st].thr, 0.01, 'throw damage'); near(sta0 - d.sta, 20, 0.3, 'stamina loss (one tick of ground regen, STA-01, may be included)');
    ok(min > -80, 'flip arc stays bounded');
  }
});

// ---------- KO / STA / STY ----------
test('KO-01', 'after K.O. the match is frozen', () => {
  const m = pair(0, 0); m.f[1].hp = 1; hit(m, 'straight', 10, 2, 'punch');
  ok(m.winner === 0, 'winner set');
  const h0 = SF.stateHash(m);
  for (let i = 0; i < 180; i++) SF.step(m, [{ punch: true, left: true }, { kick: true, right: true }]);
  eq(SF.stateHash(m), h0, 'nothing changes');
  ok(m.f[0].state === 'idle' && m.f[1].state === 'down', 'winner stands, loser is down (DEF-010)');
});
test('STA-01', 'exhaustion at 0 blocks strikes and jumps until stamina is 30', () => {
  const m = pair(); const f = m.f[0]; f.sta = 0;
  run(m, 2, { punch: true }); ok(f.exh, 'exhausted'); ok(f.state !== 'charge', 'cannot start a strike');
  run(m, 2, { jump: true }); run(m, 6, NONE); ok(!f.air, 'cannot jump');
  f.sta = 29; run(m, 1); ok(f.exh, 'still exhausted below 30');
  f.sta = 31; run(m, 1); ok(!f.exh, 'recovered at 30+');
  f.state = 'idle'; run(m, 1, { punch: true }); ok(m.f[0].state === 'charge', 'can strike again');
});
test('STA-02', 'stamina and hp stay within bounds (30 AI fights)', () => {
  for (let s = 1; s <= 30; s++) {
    const m = SF.createMatch({ seed: 300 + s, styles: [s % 3, (s + 1) % 3], ai: [true, true] });
    for (let i = 0; i < 1800 && !m.winner; i++) { SF.stepAI(m); for (const f of m.f) { ok(f.sta >= -1e-9 && f.sta <= 100 + 1e-9, 'sta ' + f.sta); ok(f.hp >= 0 && f.hp <= f.style.hpMax + 1e-9, 'hp ' + f.hp); ok(C.STATES.indexOf(f.state) >= 0, 'state ' + f.state); } }
  }
});
test('STY-01', 'style numbers match the spec', () => {
  const S = C.STYLES, want = [
    /* health raised by 50 percent at the user's request (was 100 / 112 / 125) */
    ['Boxer', 72, 80, 1.3, 0.8, 150, 55, 1.0], ['Kicker', 66, 98, 0.9, 1.35, 168, 55, 1.0], ['Grappler', 62, 80, 1.1, 1.0, 188, 80, 1.45]];
  want.forEach((w, i) => { eq(S[i].name, w[0]); eq(S[i].pr, w[1]); eq(S[i].kr, w[2]); eq(S[i].pm, w[3]); eq(S[i].km, w[4]); eq(S[i].hpMax, w[5]); eq(S[i].grab, w[6]); eq(S[i].thr, w[7]); });
  eq(S[0].gmax, 120); eq(S[1].gmax, 108); eq(S[2].gmax, 100);
});

// ---------- AI ----------
const ATTACK_KEYS = ['punch', 'kick', 'grab', 'dash', 'jump'];
test('AI-01', 'AI issues no attack input while its fighter cannot act', () => {
  for (const st of ['down', 'flipped', 'stagger', 'getup', 'grapple']) {
    const m = SF.createMatch({ seed: 9, styles: [0, 1], ai: [true, true] }); m.f[0].state = st; m.f[0].t = 0.1;
    for (let i = 0; i < 60; i++) { const inp = SF.aiInput(m, 0); for (const k of ATTACK_KEYS) ok(!inp[k], st + ' issued ' + k); }
  }
  const m = SF.createMatch({ seed: 9, styles: [0, 1], ai: [true, true] }); m.winner = 0;
  const inp = SF.aiInput(m, 1); for (const k of ATTACK_KEYS) ok(!inp[k], 'issued ' + k + ' after K.O.');
});
function soak(seeds, from) {
  const out = { fights: 0, timeouts: 0, wins: [0, 0, 0], kinds: {}, seconds: [] };
  for (let s = 0; s < seeds; s++) {
    const a = (s + 1) % 3, b = (s * 2 + (s >> 1)) % 3;
    const m = SF.createMatch({ seed: from + s, styles: [a, b], ai: [true, true] });
    for (let i = 0; i < 2400 && m.winner === null; i++) SF.stepAI(m);
    out.fights++;
    if (m.winner === null) out.timeouts++; else out.wins[m.f[m.winner].styleIndex]++;
    for (const k in m.stats.moves) out.kinds[k] = (out.kinds[k] || 0) + m.stats.moves[k];
    out.seconds.push(m.t);
  }
  return out;
}
test('AI-02', 'at least 95 percent of 60 AI fights finish within 40 s', () => {
  const r = soak(60, 1000); ok(r.timeouts / r.fights <= 0.05, r.timeouts + ' of ' + r.fights + ' fights timed out');
});
test('AI-03', 'AI uses at least 10 distinct move names across 40 fights', () => {
  const r = soak(40, 2000); const n = Object.keys(r.kinds).length; ok(n >= 10, 'only ' + n + ': ' + Object.keys(r.kinds).join(','));
});
test('AI-04', 'no style wins under 25 or over 75 percent of decided fights', () => {
  const r = soak(90, 3000); const total = r.wins[0] + r.wins[1] + r.wins[2];
  for (let i = 0; i < 3; i++) { const share = r.wins[i] / total; ok(share >= 0.25 && share <= 0.75, C.STYLES[i].name + ' wins ' + Math.round(share * 100) + ' percent (' + r.wins.join('/') + ')'); }
});

// ---------- iteration 2 (tests/iter2.js) ----------
require('./iter2.js')({ test, eq, near, ok, pair, run, evs, hit, fighter, checkSkeleton, SF, C, NONE });

// ---------- iteration 3: recording and replay (tests/rec.js) ----------
require('./rec.js')({ test, eq, near, ok, SF, C, NONE });

// ---------- iteration 5: human motion envelope (tests/motion.js) ----------
require('./motion.js')({ test, eq, near, ok, SF, C, NONE, fighter });

// ---------- iteration 5b: fancy movement (tests/fancy.js) ----------
require('./fancy.js')({ test, eq, near, ok, SF, C, NONE, fighter, checkSkeleton });

// ---------- figure structure (tests/figure.js) ----------
require('./figure.js')({ test, eq, near, ok, SF, C, NONE, fighter });

// ---------- iteration 6: punch and chain protection (tests/punch.js, tests/chain.js) ----------
require('./punch.js')({ test, eq, near, ok, SF, C, NONE, fighter });
require('./chain.js')({ test, eq, near, ok, SF, C, NONE });

// ---------- iteration 7: choreography (tests/sequence.js) ----------
require('./sequence.js')({ test, eq, near, ok, SF, C, NONE });
require('./stamina.js')({ test, eq, near, ok, SF, C, NONE });
require('./controller.js')({ test, eq, near, ok, SF, C, NONE });
require('./touchplan.js')({ test, eq, near, ok, SF, C, NONE });
require('./difficulty.js')({ test, eq, near, ok, SF, C, NONE });
require('./multi.js')({ test, eq, near, ok, SF, C, NONE });
require('./obstacles.js')({ test, eq, near, ok, SF, C, NONE });
require('./training.js')({ test, eq, near, ok, SF, C, NONE });
require('./tutorial.js')({ test, eq, near, ok, SF, C, NONE });
require('./gui.js')({ test, eq, near, ok, SF, C, NONE });
require('./flash.js')({ test, eq, near, ok, SF, C, NONE });
require('./recovery.js')({ test, eq, near, ok, SF, C, NONE });

// ---------- report ----------
let failed = 0;
for (const r of results) {
  if (r.ok) console.log('PASS ' + r.id + '  ' + r.title);
  else { failed++; console.log('FAIL ' + r.id + '  ' + r.title + '\n      ' + r.err); }
}
console.log('\n' + (results.length - failed) + ' passed, ' + failed + ' failed, ' + results.length + ' total');
process.exit(failed ? 1 : 0);

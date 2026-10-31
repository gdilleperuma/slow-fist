'use strict';
// TUT-01 to TUT-07: the strike angle follows the hand control (also when crouched), the fixed dummy, and the tutorial (punch only: lines at an angle).
module.exports = function (X) {
  const { test, ok, eq, near, SF, C, NONE } = X;
  const D = require('../mobile/decode.js'), P = require('../mobile/plan.js');
  const duel = () => { const m = SF.createMatch({ seed: 5, styles: [0, 0], ai: [false, false], training: 1 }); m.f[0].x = 300; m.f[1].x = 355; return m; };
  const fighter = (crouch, aim, limb) => { const m = duel(), f = m.f[0]; f.cr = crouch ? 1 : 0; f.aim = aim; f.limb = limb || 'punch'; f.charge = 0; f.air = false; return f; };

  test('TUT-01', 'the angle of a punch matches the hand control, standing or crouched; crouching alone (no aim) is still the uppercut', () => {
    const o = (f) => SF.pickMove(f);
    let r = o(fighter(true, -30)); eq(r.name, 'OVERHAND', 'crouched with the aim down is an overhand'); near(r.a, -30, 0.6, 'at the control angle, not pointing up: ' + r.a);
    r = o(fighter(true, -42)); eq(r.name, 'OVERHAND'); ok(r.a < 0, 'still pointing down: ' + r.a);
    r = o(fighter(true, 0)); eq(r.name, 'UPPERCUT', 'crouching with a level aim is the uppercut (keyboard: crouch + F)'); ok(r.a > 0, 'angled up: ' + r.a);
    r = o(fighter(true, 20)); eq(r.name, 'UPPERCUT'); ok(r.a >= 20, 'the control angle is not lowered: ' + r.a);
    r = o(fighter(false, -30)); eq(r.name, 'OVERHAND', 'standing: as before'); near(r.a, -30, 0.6);
    r = o(fighter(false, 40)); eq(r.name, 'UPPERCUT'); near(r.a, 40, 0.6);
    r = o(fighter(false, 0)); ok(['JAB', 'CROSS'].indexOf(r.name) >= 0, 'standing, level: a straight punch, ' + r.name);
  });

  test('TUT-02', 'through the real simulation: crouched with the aim down, the punch lands low (not high like an uppercut)', () => {
    function zoneOf(crouch, aimDown) {
      const m = duel(), a = m.f[0], d = m.f[1]; a.x = 300; d.x = 358; let zone = null;
      for (let i = 0; i < 120 && !zone; i++) {
        const inp = { punch: i < 22, crouch: crouch, aimDown: aimDown && i < 22 };   /* the keyboard player holds E while he punches */
        SF.step(m, [inp, NONE]); for (const e of m.ev) if (e.k === 'hit' && e.a === 0) zone = e.zone + ':' + e.name;
      }
      return zone;
    }
    const low = zoneOf(true, true), high = zoneOf(true, false);
    ok(low && /OVERHAND/.test(low), 'crouch + aim down: ' + low); ok(high && /UPPERCUT/.test(high), 'crouch alone: ' + high);
    ok(!/HEAD/.test(low), 'the low one does not hit the head: ' + low);
  });

  /* the touch plan: the stroke angle is the aim */
  function play(pts, limb) {
    const m = duel(), a = m.f[0]; let plan = P.pending(limb), last = null, down = true; const names = []; const end = pts[pts.length - 1].t; let zone = null;
    for (let i = 0; i < 150; i++) {
      const t = i * 1000 / 60; if (t > end && down) down = false;
      const cur = pts.filter(p => p.t <= t); if (!cur.length) cur.push(pts[0]);
      const r = D.classify(cur, limb, 1, !down);
      if (r) { P.observe(plan, r); const key = r.type + '|' + r.move; if (key !== last) { const first = last === null; last = key; if (first || (plan && !plan.released)) plan = P.planFor(r, limb, plan ? plan.steps : 0); } }
      const s = P.step(plan, a, down); plan = s.plan; SF.step(m, [s.inp, NONE]);
      if (a.state === 'strike' && a.str && names.indexOf(a.str.name) < 0) names.push(a.str.name);
      for (const e of m.ev) if (e.k === 'hit' && e.a === 0 && !zone) zone = e.zone;
    }
    return { names: names, zone: zone };
  }
  const line = (a, b, ms, hz) => { const pts = [], n = Math.round(ms * hz / 1000); for (let i = 0; i <= n; i++) { const u = i / n; pts.push({ x: a[0] + (b[0] - a[0]) * u, y: a[1] + (b[1] - a[1]) * u, t: i * 1000 / hz }); } return pts; };

  test('TUT-03', 'a stroke at an angle aims the punch at that angle: level hits the body, up and forward hits the head, steeply down hits low', () => {
    const lvl = play(line([0, 0], [20, 0], 160, 120), 'hand'), up = play(line([0, 0], [17, -9], 160, 120), 'hand'), dn = play(line([0, 0], [8, 15], 160, 120), 'hand');
    eq(lvl.zone, 'BODY', 'level stroke: ' + lvl.names.join(',')); eq(up.zone, 'HEAD', 'stroke up and forward: ' + up.names.join(','));
    ok(dn.zone === 'BODY' || dn.zone === 'LEGS', 'stroke down: ' + dn.zone + ' ' + dn.names.join(','));
    ok(dn.names.indexOf('OVERHAND') >= 0, 'a steep downward stroke is the overhand: ' + dn.names.join(','));
  });

  test('TUT-04', 'a fixed dummy neither moves nor reacts, however hard it is hit, and still takes the damage', () => {
    const m = duel(), a = m.f[0], d = m.f[1]; SF.setDummy(m, 'fixed'); const x0 = d.x;
    for (let k = 0; k < 8; k++) { a.state = 'idle'; a.t = 0; a.x = 300; SF.beginMove(m, a, k % 2 ? 'SPINNING BACKFIST' : 'UPPERCUT', 1); for (let i = 0; i < 70; i++) { SF.step(m, [NONE, NONE]); eq(d.x, x0, 'x'); eq(d.state, 'idle', 'state ' + d.state); eq(d.vx, 0); } }
    let hits = 0; for (let k = 0; k < 3; k++) { a.state = 'idle'; a.t = 0; SF.beginMove(m, a, 'JAB', 1); for (let i = 0; i < 40; i++) { SF.step(m, [NONE, NONE]); hits += m.ev.filter(e => e.k === 'hit').length; } }
    ok(hits >= 3, 'hits still register on the dummy: ' + hits);
    SF.setDummy(m, 'still'); ok(!d.fixed, 'it can be released');
  });

  const tut = () => { const m = SF.createMatch({ seed: 5, styles: [0, 0], ai: [false, false], tutorial: 1 }); m.f[1].x = 860; SF.setDummy(m, 'fixed'); return m; };
  const swings = (m) => m.ev.filter(e => e.k === 'swing' && e.a === 0);

  test('TUT-05', 'tutorial rules: the trainee stays planted (no walking, jumping, lunge or step), the aim moves fast, and every punch reports its angle and strength', () => {
    const m = tut(), a = m.f[0], x0 = a.x; eq(m.training, 1, 'training rules apply too');
    for (let i = 0; i < 90; i++) SF.step(m, [{ right: true, jump: i === 5, crouch: i === 40 }, NONE]);
    eq(a.x, x0, 'walking is ignored'); eq(a.h, 0, 'so is jumping');
    const b = tut(); for (let i = 0; i < 8; i++) SF.step(b, [{ aimUp: true }, NONE]); ok(b.f[0].aim >= 45, 'aim after 8 steps: ' + b.f[0].aim.toFixed(1));
    const c = tut(), f = c.f[0]; f.aim = 30; const ev = [];
    for (let i = 0; i < 80; i++) { SF.step(c, [{ punch: i < 3 }, NONE]); ev.push(...swings(c)); }
    eq(ev.length, 1, 'one swing event per punch'); near(ev[0].ang, 30, 0.01, 'the angle of the strike'); ok(ev[0].s > 0.6 && ev[0].s < 1.7, 'its strength ' + ev[0].s);
    eq(f.x, x0, 'no lunge');
    const idle = SF.skeleton(tut().f[0], 0), d = tut(); d.f[0].aim = 0; let worst = 0;
    for (let i = 0; i < 40; i++) { SF.step(d, [{ punch: i < 3 }, NONE]); const k = SF.skeleton(d.f[0], d.t); for (let j = 0; j < 2; j++) worst = Math.max(worst, Math.abs(k.foot[j][0] - idle.foot[j][0]), Math.abs(k.foot[j][1] - idle.foot[j][1])); }
    ok(worst < 1.5, 'the feet do not move during a punch: ' + worst.toFixed(1) + ' px');
    const n = SF.createMatch({ seed: 5, styles: [0, 0], ai: [false, false] }); n.f[1].x = 700; SF.step(n, [{ punch: true }, NONE]); eq(n.ev.filter(e => e.k === 'swing').length, 0, 'a normal match reports no swings');
  });

  test('TUT-06', 'the punch lesson: targets at set angles, a swing within the circle counts, a miss says how far off, speed targets expire, strength targets need the right power', () => {
    ok(typeof SF.tutorialSteps === 'function' && typeof SF.tutorialNew === 'function' && typeof SF.tutorialFeed === 'function' && typeof SF.tutorialTarget === 'function', 'the model exists');
    const steps = SF.tutorialSteps(), ids = steps.map(s => s.id);
    for (const id of ['level', 'up', 'down', 'steep', 'any', 'speed', 'strength']) ok(ids.indexOf(id) >= 0, 'a step ' + id);
    const t = SF.tutorialNew(1); let now = 0; const swing = (ang, s, a) => ({ k: 'swing', a: a === undefined ? 0 : a, ang: ang, s: s === undefined ? 1 : s });
    const feed = (evs, dt) => { now += (dt === undefined ? 30 : dt); return SF.tutorialFeed(t, { ev: evs, steps: now }); };
    feed([]); const tg = SF.tutorialTarget(t); eq(tg.ang, 0, 'the first target is straight ahead'); ok(tg.d > 0 && tg.r > 0, 'with a size and a distance');
    const tol = Math.asin(tg.r / tg.d) * 180 / Math.PI; ok(tol > 6 && tol < 14, 'tolerance in degrees: ' + tol.toFixed(1));
    let r = feed([swing(25)]); ok((t.counts.level || 0) === 0, 'a swing 25 degrees off is a miss'); ok(/25/.test(r.hint) && /(high|up)/i.test(r.hint), 'and the hint says how far and which way: ' + r.hint);
    r = feed([swing(-20)]); ok(/(low|down)/i.test(r.hint), 'low miss: ' + r.hint);
    feed([swing(0, 1, 1)]); eq(t.counts.level || 0, 0, 'the other fighter swinging does not count');
    feed([swing(tol - 1)]); eq(t.counts.level, 1, 'inside the circle counts'); feed([swing(-(tol - 1))]); feed([swing(0)]); ok(t.done.level, 'level done'); eq(SF.tutorialCurrent(t).id, 'up');
    feed([swing(SF.tutorialTarget(t).ang + tol + 2)]); eq(t.counts.up || 0, 0, 'just outside the circle is a miss');
    for (const id of ['up', 'down', 'steep']) { let guard = 0; while (!t.done[id] && guard++ < 20) feed([swing(SF.tutorialTarget(t).ang)]); ok(t.done[id], id + ' done by aiming at each target'); }
    let guard = 0; while (!t.done.any && guard++ < 30) feed([swing(SF.tutorialTarget(t).ang)]); ok(t.done.any, 'the random angles are done');
    eq(SF.tutorialCurrent(t).id, 'speed'); const g1 = SF.tutorialTarget(t); ok(g1.limit > 0, 'speed targets have a time limit'); feed([], g1.limit + 10);
    ok(t.missed >= 1, 'an expired target is counted as missed'); let k = 0; while (!t.done.speed && k++ < 30) feed([swing(SF.tutorialTarget(t).ang)], 20); ok(t.done.speed, 'speed done by hitting in time');
    eq(SF.tutorialCurrent(t).id, 'strength'); let sawLight = false, sawHeavy = false;
    for (let i = 0; i < 12 && !t.done.strength; i++) {
      const g = SF.tutorialTarget(t); if (g.need === 'light') sawLight = true; if (g.need === 'heavy') sawHeavy = true;
      feed([swing(g.ang, g.need === 'heavy' ? 0.7 : 1.5)]); ok((t.hint || '').length > 0, 'a hit with the wrong strength says so: ' + t.hint);
      feed([swing(g.ang, g.need === 'heavy' ? 1.5 : 0.7)]);
    }
    ok(sawLight && sawHeavy, 'both kinds of strength target appear'); ok(t.done.strength, 'strength done'); ok(t.finished, 'the lesson is finished');
  });

  /* touch, punch only: every stroke, whatever its direction, is a punch at the angle of the line (backward strokes are ignored) */
  test('TUT-07', 'touch in the tutorial: the angle of the line is the angle of the punch over the whole range', () => {
    const lineAt = (deg, len, ms) => line([0, 0], [len * Math.cos(deg * Math.PI / 180), -len * Math.sin(deg * Math.PI / 180)], ms, 120);   /* deg: up is positive */
    const run = (pts) => {
      const m = tut(), a = m.f[0]; let plan = P.pending('hand'), last = null, down = true; const out = []; const end = pts[pts.length - 1].t;
      for (let i = 0; i < 120; i++) {
        const t = i * 1000 / 60; if (t > end && down) down = false;
        const cur = pts.filter(p => p.t <= t); if (!cur.length) cur.push(pts[0]);
        const r = D.classify(cur, 'hand', 1, !down);
        if (r && r.type !== 'GRAPPLE') { P.observe(plan, r); const key = r.type + '|' + r.move; if (key !== last) { const first = last === null; last = key; if (first || (plan && !plan.released)) plan = P.planFor(r, 'hand', plan ? plan.steps : 0, true); } }
        const s = P.step(plan, a, down); plan = s.plan; SF.step(m, [s.inp, NONE]); out.push(...swings(m));
      }
      return out;
    };
    for (const deg of [-40, -25, -10, 0, 10, 25, 40, 50]) {
      const sw = run(lineAt(deg, 16, 150));
      eq(sw.length, 1, 'one punch for a line at ' + deg + ' degrees'); ok(Math.abs(sw[0].ang - deg) <= 4, 'line at ' + deg + ' gives a punch at ' + sw[0].ang.toFixed(1));
    }
    const steepUp = run(lineAt(88, 16, 150)); ok(steepUp.length === 1 && steepUp[0].ang >= 50, 'a vertical line is the steepest punch up: ' + (steepUp[0] && steepUp[0].ang));
    const steepDn = run(lineAt(-88, 16, 150)); ok(steepDn.length === 1 && steepDn[0].ang <= -40, 'a vertical line down is the steepest punch down: ' + (steepDn[0] && steepDn[0].ang));
    const a1 = run(lineAt(0, 12, 70)), a2 = run(lineAt(0, 26, 520)); ok(a1.length === 1 && a2.length === 1 && a2[0].s > a1[0].s + 0.4, 'a long slow line is stronger than a short fast one');
  });
};

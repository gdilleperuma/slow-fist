'use strict';
// TCH-01 to TCH-04: from a drawn stroke, through the touch plan, to the move the simulation actually performs.
module.exports = function (X) {
  const { test, ok, eq, SF, C, NONE } = X;
  const D = require('../mobile/decode.js'), P = require('../mobile/plan.js');
  function line(a, b, ms, hz) { const pts = [], n = Math.max(2, Math.round(ms * hz / 1000)); for (let i = 0; i <= n; i++) { const u = i / n; pts.push({ x: a[0] + (b[0] - a[0]) * u, y: a[1] + (b[1] - a[1]) * u, t: i * 1000 / hz }); } return pts; }
  function arc(c, r, a0, deg, ms, hz) { const pts = [], n = Math.max(3, Math.round(ms * hz / 1000)); for (let i = 0; i <= n; i++) { const a = (a0 + deg * i / n) * Math.PI / 180; pts.push({ x: c[0] + Math.cos(a) * r, y: c[1] + Math.sin(a) * r, t: i * 1000 / hz }); } return pts; }

  /* play one finger: down at step 0, decisions as the touch layer takes them, lift at the end of the stroke. Returns what the fighter did. */
  function play(pts, limb, style) {
    const m = SF.createMatch({ seed: 5, styles: [style || 0, 0], ai: [false, false] });
    const a = m.f[0], d = m.f[1]; a.x = 300; d.x = 350;
    let plan = P.pending(limb), last = null, down = true; const seen = [], states = new Set(); const end = pts[pts.length - 1].t;
    for (let i = 0; i < 150; i++) {
      const t = i * 1000 / 60;
      if (t > end && down) down = false;
      const cur = pts.filter(p => p.t <= t); if (!cur.length) cur.push(pts[0]);
      const r = D.classify(cur, limb, 1, !down);
      if (r) {
        P.observe(plan, r);
        const key = r.type + '|' + r.move, first = last === null;
        if (key !== last) { last = key; if (first || (plan && !plan.released)) plan = P.planFor(r, limb, plan && plan.pending ? plan.steps : 0); }
      }
      const s = P.step(plan, a, down); plan = s.plan;
      SF.step(m, [s.inp, NONE]);
      states.add(a.state);
      if (a.state === 'strike' && a.str && seen.indexOf(a.str.name) < 0) seen.push(a.str.name);
      d.state = 'idle'; d.hp = d.style.hpMax; d.protect = 0;
    }
    return { moves: seen, states: states };
  }

  const CASES = [
    ['hand', line([0, 0], [12, 0], 70, 120), 'JAB'],
    ['hand', line([0, 0], [20, 0], 160, 120), 'CROSS'],
    ['hand', line([0, 0], [26, 0], 520, 120), 'SPINNING BACKFIST'],
    ['hand', arc([0, -12], 12, 90, -150, 220, 120), 'HOOK'],
    ['hand', line([0, 0], [0, -18], 150, 120), 'UPPERCUT'],
    ['hand', line([0, 0], [0, 18], 150, 120), 'OVERHAND'],
    ['leg', line([0, 0], [14, 0], 100, 120), 'FRONT KICK'],
    ['leg', line([0, 0], [26, 0], 520, 120), 'AXE KICK'],
    ['leg', arc([0, -12], 12, 90, -150, 220, 120), 'ROUNDHOUSE'],
    ['leg', line([0, 0], [0, -18], 150, 120), 'RISING KICK'],
    ['leg', line([0, 0], [0, 18], 150, 120), 'LOW KICK'],
    ['leg', arc([0, 12], 12, -90, 150, 220, 120), 'LOW SWEEP']
  ];
  test('TCH-01', 'every stroke ends in the move it names, through the plan and the simulation (wind-up from touch-down)', () => {
    for (const [limb, pts, want] of CASES) {
      const r = play(pts, limb);
      ok(r.moves.indexOf(want) >= 0, limb + ' stroke should give ' + want + ', the fighter did: ' + (r.moves.join(', ') || 'nothing'));
    }
  });

  test('TCH-02', 'a back-draw gives a grapple with the hand and with the leg (the wind-up started at touch-down must not block it)', () => {
    for (const limb of ['hand', 'leg']) {
      for (const ms of [120, 200, 320]) {
        const r = play(line([0, 0], [-16, 0], ms, 120), limb);
        ok(r.states.has('grab'), limb + ' back-draw over ' + ms + ' ms: the fighter should grab, states seen: ' + [...r.states].join(','));
      }
    }
  });

  test('TCH-03', 'a tap is a quick poke and no stray strike follows', () => {
    const r = play(line([0, 0], [0.5, 0.3], 50, 120), 'hand');
    eq(r.moves.join(','), 'JAB');
  });

  test('TCH-04', 'a finger that vanishes without a lift event does not leave the wind-up held forever', () => {
    const m = SF.createMatch({ seed: 5, styles: [0, 0], ai: [false, false] }), a = m.f[0];
    let plan = P.pending('hand'), held = 0;
    for (let i = 0; i < 30; i++) { const s = P.step(plan, a, false); plan = s.plan; if (s.inp.punch) held++; SF.step(m, [s.inp, NONE]); }
    eq(held, 0, 'steps with the key held after the finger was gone'); ok(plan === null, 'plan dropped');
  });
  test('TCH-05', 'rule: a grab cancels a wind-up under 0.3 s, but not one that is already further on', () => {
    for (const [wait, expect] of [[6, 'grab'], [24, 'charge']]) {
      const m = SF.createMatch({ seed: 5, styles: [0, 0], ai: [false, false] }), a = m.f[0]; a.x = 300; m.f[1].x = 350;
      for (let i = 0; i < wait; i++) SF.step(m, [{ punch: true }, NONE]);
      eq(a.state, 'charge', 'winding up');
      SF.step(m, [{ punch: true, grab: true }, NONE]);
      eq(a.state, expect, 'after a grab pressed ' + (wait / 60).toFixed(2) + ' s into the wind-up');
    }
  });
};

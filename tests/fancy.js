'use strict';
// Fancy movement tests (FANCY-01 to FANCY-04). Registered into tests/run.js.
module.exports = function (X) {
  const { test, ok, eq, SF, C, fighter, checkSkeleton } = X;
  const I = SF.poseInternals, deg = r => r * 180 / Math.PI;
  const HIP_STAND = C.HIP_H;

  function flightAngles(flair, e) {
    const f = fighter(0, { face: 1, state: 'flipped', flair: flair, h: 100 });
    f.rot = -e * 1.5 * Math.PI;
    return I.jointAngles(SF.poseParams(f, 0));
  }
  function sweep(flair, fn) { for (let i = 0; i <= 20; i++) fn(flightAngles(flair, i / 20), i / 20); }

  test('FANCY-01', 'flight styles: tuck, pike with windmill arms, and scissor legs, all different', () => {
    // flair 0: tuck
    let bestTuck = 0; sweep(0, q => { bestTuck = Math.max(bestTuck, Math.min(deg(q.leg[0][0]), deg(q.leg[1][0]), deg(q.leg[0][1]), deg(q.leg[1][1]))); });
    ok(bestTuck >= 100, 'flair 0 should tuck: the least bent hip or knee reaches only ' + bestTuck.toFixed(0) + ' degrees');
    // flair 1: windmill arms
    let lo = 1e9, hi = -1e9; sweep(1, q => { for (const a of q.arm) { lo = Math.min(lo, deg(a[0])); hi = Math.max(hi, deg(a[0])); } });
    ok(hi - lo >= 100, 'flair 1 arms should swing through 100 degrees of shoulder range, got ' + (hi - lo).toFixed(0));
    // flair 2: scissor legs
    let best = 0; sweep(2, q => { best = Math.max(best, Math.abs(deg(q.leg[0][0]) - deg(q.leg[1][0]))); });
    ok(best >= 60, 'flair 2 legs should scissor by 60 degrees, got ' + best.toFixed(0));
    // the three are different
    const flat = flair => { const v = []; sweep(flair, q => { v.push(q.leg[0][0], q.leg[0][1], q.leg[1][0], q.leg[1][1], q.arm[0][0], q.arm[0][1], q.arm[1][0], q.arm[1][1]); }); return v; };
    const a = flat(0), b = flat(1), c = flat(2), mean = (x, y) => x.reduce((s, v, i) => s + Math.abs(deg(v - y[i])), 0) / x.length;
    ok(mean(a, b) >= 15 && mean(b, c) >= 15 && mean(a, c) >= 15, 'flights differ: ' + mean(a, b).toFixed(0) + ' / ' + mean(b, c).toFixed(0) + ' / ' + mean(a, c).toFixed(0));
  });

  function getupAt(flair, p) { const f = fighter(0, { face: 1, state: 'getup', flair: flair }); f.t = Math.min(C.GETUP_T - 1e-6, p * C.GETUP_T); return f; }

  test('FANCY-02', 'stand-ups: kip-up springs above standing height with the legs overhead, tornado spins a full circle, all end standing', () => {
    for (const flair of [0, 1, 2]) {
      const k = SF.skeleton(getupAt(flair, 0.999), 0);
      ok(C.GY - k.hip[1] >= HIP_STAND - 6, 'flair ' + flair + ' ends standing: hip height ' + (C.GY - k.hip[1]).toFixed(1));
    }
    let maxHip = 0, maxFlex = 0;
    for (let i = 0; i <= 40; i++) {
      const f = getupAt(1, i / 40), k = SF.skeleton(f, 0), q = I.jointAngles(SF.poseParams(f, 0));
      maxHip = Math.max(maxHip, C.GY - k.hip[1]); maxFlex = Math.max(maxFlex, deg(q.leg[0][0]), deg(q.leg[1][0]));
    }
    ok(maxHip >= HIP_STAND + 10, 'kip-up hips spring above standing height: highest ' + maxHip.toFixed(0) + ' (standing ' + HIP_STAND + ')');
    ok(maxFlex >= 120, 'kip-up legs swing overhead: hip flexion reaches only ' + maxFlex.toFixed(0));
    let minScale = 1; for (let i = 0; i <= 40; i++) minScale = Math.min(minScale, SF.spinScale(getupAt(2, i / 40)));
    ok(minScale <= -0.9, 'tornado turns a full circle: horizontal scale reaches only ' + minScale.toFixed(2));
    eq(SF.spinScale(getupAt(2, 0.999)), 1, 'the tornado ends facing forward');
    eq(SF.spinScale(getupAt(0, 0.5)), 1, 'the standard stand-up does not spin');
  });

  test('FANCY-03', 'the flair comes from the match RNG, is reported in the events, takes all three values, and recordings still verify', () => {
    const seen = new Set(); let events = 0;
    for (let s = 0; s < 40; s++) {
      const m = SF.createMatch({ seed: 1200 + s, styles: [s % 3, (s + 1) % 3], ai: [true, true] });
      for (let i = 0; i < 2400 && m.winner === null; i++) {
        SF.stepAI(m);
        for (const e of m.ev) if (e.k === 'knockdown' || e.k === 'throw') { events++; ok(e.flair === 0 || e.flair === 1 || e.flair === 2, e.k + ' event has no flair: ' + JSON.stringify(e)); seen.add(e.flair); }
      }
    }
    ok(events > 20, 'knockdowns and throws occurred: ' + events);
    eq(seen.size, 3, 'all three flair values occur: ' + [...seen].join(','));
    const m1 = SF.createMatch({ seed: 77, styles: [0, 1], ai: [true, true] }), rec = SF.newRecording(m1);
    for (let i = 0; i < 4000 && !rec.done; i++) SF.recordStep(rec, m1, [null, null]);
    ok(SF.verifyRecording(rec).ok, 'a recording of a fight with flairs verifies');
  });

  test('FANCY-04', 'every flair keeps the floor, limb length, bend direction, range and continuity checks (flight and stand-up)', () => {
    const flex = (a, b, c) => { const t = [b[0] - a[0], b[1] - a[1]], s = [c[0] - b[0], c[1] - b[1]]; return (t[0] * s[1] - t[1] * s[0]) / (Math.hypot(t[0], t[1]) * Math.hypot(s[0], s[1])); };
    for (const face of [1, -1]) for (const flair of [0, 1, 2]) {
      for (let i = 0; i <= 40; i++) {
        const f = fighter(0, { face: face, state: 'flipped', flair: flair, h: 100 }); f.rot = -face * (i / 40) * 1.5 * Math.PI;
        checkSkeleton(f, 'flight flair ' + flair + ' e ' + i / 40);
        const g = getupAt(flair, i / 40); g.face = face; checkSkeleton(g, 'getup flair ' + flair + ' p ' + i / 40);
        for (const fx of [f, g]) { const k = SF.skeleton(fx, 0); for (let leg = 0; leg < 2; leg++) ok(flex(k.hip, k.knee[leg], k.foot[leg]) * face >= -0.05 || fx === f, 'knee bends the right way'); }
      }
      let prev = null, worst = 0;
      for (let i = 0; i <= 68; i++) {
        const g = getupAt(flair, i / 68); g.face = face; const k = SF.skeleton(g, 0), pts = [k.hand[0], k.hand[1], k.foot[0], k.foot[1], k.head];
        if (prev) pts.forEach((p, j) => { worst = Math.max(worst, Math.hypot(p[0] - prev[j][0], p[1] - prev[j][1])); });
        prev = pts;
      }
      ok(worst <= 45, 'stand-up flair ' + flair + ' has a jump of ' + worst.toFixed(0) + ' px between samples 0.0125 s apart');
    }
  });
};

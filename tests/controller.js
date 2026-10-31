'use strict';
// CTL-01 to CTL-10: the touch-gesture decoder (mobile/decode.js). Pure function, millimetres and milliseconds.
module.exports = function (X) {
  const { test, ok, eq, SF } = X;
  const D = require('../mobile/decode.js');
  const rng = SF.makeRng(7);
  /* a stroke: points from a to b over `ms`, sampled at `hz`, with `noise` mm of jitter; ease = 0 linear */
  function line(a, b, ms, hz, noise) {
    const pts = [], n = Math.max(2, Math.round(ms * hz / 1000));
    for (let i = 0; i <= n; i++) { const u = i / n; pts.push({ x: a[0] + (b[0] - a[0]) * u + (rng.next() - 0.5) * 2 * (noise || 0), y: a[1] + (b[1] - a[1]) * u + (rng.next() - 0.5) * 2 * (noise || 0), t: i * 1000 / hz }); }
    return pts;
  }
  /* an arc of `deg` degrees about a centre, radius r, starting at angle a0 */
  function arc(c, r, a0, deg, ms, hz) {
    const pts = [], n = Math.max(3, Math.round(ms * hz / 1000));
    for (let i = 0; i <= n; i++) { const a = (a0 + deg * i / n) * Math.PI / 180; pts.push({ x: c[0] + Math.cos(a) * r, y: c[1] + Math.sin(a) * r, t: i * 1000 / hz }); }
    return pts;
  }
  const fin = (pts, limb, f) => D.classify(pts, limb || 'hand', f || 1, true);
  const live = (pts, limb, f) => D.classify(pts, limb || 'hand', f || 1, false);

  test('CTL-01', 'a forward stroke commits to a straight move early, before the finger lifts', () => {
    const s = line([0, 0], [20, 0], 160, 120, 0);
    let at = -1;
    for (let i = 2; i <= s.length; i++) { const r = live(s.slice(0, i)); if (r && at < 0) { at = s[i - 1].t; eq(r.type, 'STRAIGHT'); } }
    ok(at >= 0 && at <= 60, 'committed after ' + at + ' ms (limit 60)');
    eq(fin(s).move, 'CROSS', 'the finished stroke is a normal cross');
  });

  test('CTL-02', 'forward follows the facing direction', () => {
    const s = line([0, 0], [-20, 0], 160, 120, 0);
    eq(fin(s, 'hand', -1).type, 'STRAIGHT', 'facing left, a stroke to the left is forward');
    eq(fin(s, 'hand', 1).type, 'GRAPPLE', 'facing right, the same stroke is drawn back');
  });

  test('CTL-03', 'up and down strokes: uppercut / rising kick and body shot / low kick', () => {
    eq(fin(line([0, 0], [0, -18], 150, 120, 0), 'hand').move, 'UPPERCUT');
    eq(fin(line([0, 0], [0, -18], 150, 120, 0), 'leg').move, 'RISING KICK');
    eq(fin(line([0, 0], [0, 18], 150, 120, 0), 'hand').move, 'OVERHAND');
    eq(fin(line([0, 0], [0, 18], 150, 120, 0), 'leg').move, 'LOW KICK');
  });

  test('CTL-04', 'a curved stroke is a hook / roundhouse, and the early commit is only a provisional straight', () => {
    const s = arc([0, -12], 12, 90, -150, 220, 120);
    const early = live(s.slice(0, 6));
    ok(!early || early.type === 'STRAIGHT' || early.type === 'RISING', 'early guess is a straight move: ' + (early && early.type));
    eq(fin(s, 'hand').type, 'ARC'); ok(/HOOK/.test(fin(s, 'hand').move), 'hand: ' + fin(s, 'hand').move);
    eq(fin(s, 'leg').move, 'ROUNDHOUSE');
    ok(fin(arc([0, -12], 12, 90, -150, 220, 120), 'hand').arc === 'anticlockwise', 'direction reported');
  });

  test('CTL-05', 'a punch that returns to the start is a punch, not a grapple (the stroke is cut at its farthest point)', () => {
    const out = line([0, 0], [18, 0], 100, 120, 0), back = line([18, 0], [1, 0], 100, 120, 0).map(p => ({ x: p.x, y: p.y, t: p.t + 100 }));
    const r = fin(out.concat(back.slice(1)));
    eq(r.type, 'STRAIGHT', 'out and back is a straight punch');
  });

  test('CTL-06', 'a grapple needs a deliberate back-draw: long enough, straight, and it does not commit early', () => {
    eq(fin(line([0, 0], [-16, 0], 200, 120, 0)).type, 'GRAPPLE');
    eq(fin(line([0, 0], [-16, 0], 200, 120, 0), 'leg').move, 'LEG HOOK (trip)');
    ok(fin(line([0, 0], [-6, 0], 100, 120, 0)).type !== 'GRAPPLE', 'a 6 mm flick back is not a grapple');
    ok(live(line([0, 0], [-5, 0], 60, 120, 0)) === null, 'a short back movement does not commit');
    ok(fin(arc([0, 0], 14, 180, 200, 300, 120)).type !== 'GRAPPLE', 'a loop that ends behind is not a grapple');
  });

  test('CTL-07', 'jitter and the sampling rate do not change the result (60 Hz, 120 Hz, 0.4 mm noise, 200 random strokes)', () => {
    let diff = 0;
    for (let i = 0; i < 200; i++) {
      const ang = rng.next() * 2 * Math.PI, len = 10 + rng.next() * 15, ms = 90 + rng.next() * 200, b = [Math.cos(ang) * len, Math.sin(ang) * len];
      const ref = fin(line([0, 0], b, ms, 240, 0)), a = fin(line([0, 0], b, ms, 60, 0.4)), c = fin(line([0, 0], b, ms, 120, 0.4));
      /* strokes near a 45 degree boundary may legitimately flip, so skip those */
      const dg = ang * 180 / Math.PI, aa = Math.abs(dg > 180 ? dg - 360 : dg);   /* 0..180 from forward */
      const edge = Math.abs(aa - 50) < 7 || Math.abs(aa - 130) < 7 || aa > 172;
      if (!edge && (ref.type !== a.type || ref.type !== c.type)) diff++;
    }
    eq(diff, 0, 'strokes whose type changed with the sampling rate or noise');
  });

  test('CTL-08', 'quick is short and fast, heavy is long and slow; power grows with the length', () => {
    eq(fin(line([0, 0], [12, 0], 70, 120, 0)).move, 'JAB');
    eq(fin(line([0, 0], [26, 0], 520, 120, 0)).move, 'HEAVY CROSS');
    ok(fin(line([0, 0], [26, 0], 520, 120, 0)).power > fin(line([0, 0], [12, 0], 70, 120, 0)).power, 'longer stroke, more power');
    ok(fin(line([0, 0], [14, 0], 60, 120, 0)).speed > fin(line([0, 0], [14, 0], 400, 120, 0)).speed, 'faster stroke, more speed');
  });

  test('CTL-09', 'a tap is a quick poke and does not commit while the finger is still down', () => {
    const t = line([0, 0], [1, 0.5], 60, 120, 0);
    ok(live(t) === null, 'no commit for 1 mm of travel'); eq(fin(t, 'hand').type, 'TAP'); eq(fin(t, 'leg').move, 'FRONT KICK');
  });

  test('CTL-10', 'the decoder is pure: the same stroke gives the same answer and the input is not changed', () => {
    const s = line([0, 0], [15, 6], 140, 120, 0.2), copy = JSON.stringify(s);
    eq(JSON.stringify(fin(s)), JSON.stringify(fin(s))); eq(JSON.stringify(s), copy, 'input unchanged');
    ok(fin([{ x: 0, y: 0, t: 0 }]).type === 'TAP', 'a single point is a tap'); ok(live([]) === null, 'no points, no result');
  });
  test('CTL-11', 'noise at a high sampling rate does not inflate the speed; a bent back-draw is not a grapple', () => {
    const noisy = fin(line([0, 0], [26, 0], 520, 240, 0.4));
    eq(noisy.move, 'HEAVY CROSS', 'a slow long stroke stays heavy with 0.4 mm noise at 240 Hz (speed ' + noisy.speed.toFixed(2) + ')');
    const bent = line([0, 0], [-8, 0], 100, 120, 0).concat(line([-8, 0], [-16, -8], 100, 120, 0).slice(1).map(p => ({ x: p.x, y: p.y, t: p.t + 100 })));
    ok(fin(bent).type !== 'GRAPPLE', 'a back-draw that bends by 45 degrees is not a deliberate grapple: ' + fin(bent).type);
  });
  test('CTL-12', 'reaction: a fast stroke commits within 20 ms of leaving the touch-down point, a tap-sized wobble does not commit', () => {
    const s = line([0, 0], [20, 0], 100, 120, 0);
    let at = -1; for (let i = 2; i <= s.length; i++) { const r = live(s.slice(0, i)); if (r) { at = s[i - 1].t; break; } }
    ok(at >= 0 && at <= 20, 'committed after ' + at.toFixed(1) + ' ms (limit 20)');
    ok(live(line([0, 0], [1.6, 0.6], 40, 120, 0)) === null, 'a 1.7 mm wobble does not commit');
  });
  test('CTL-13', 'early tier: a slow stroke is tentatively heavy, a fast one is not, and the final decision corrects a slow short one', () => {
    const slow = line([0, 0], [26, 0], 520, 120, 0);
    eq(live(slow.slice(0, 9)).tier, 'heavy', 'a slow start is tentatively heavy');
    eq(live(line([0, 0], [20, 0], 100, 120, 0).slice(0, 4)).tier !== 'heavy', true, 'a fast start is not heavy');
    eq(fin(line([0, 0], [10, 0], 400, 120, 0)).tier, 'normal', 'a slow but short stroke ends normal, not heavy');
  });
};

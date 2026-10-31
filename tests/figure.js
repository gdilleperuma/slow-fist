'use strict';
// Figure structure tests: the shoulder girdle (FIG-01). Registered into tests/run.js.
module.exports = function (X) {
  const { test, ok, near, SF, C, fighter } = X;
  const L = C.LIMB, dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

  test('FIG-01', 'each figure has a shoulder girdle: two shoulder joints across the torso, arms attached to them', () => {
    const W = 2 * L.shoulder;
    let checked = 0;
    for (const face of [1, -1]) for (const style of [0, 1, 2]) for (const st of C.STATES) for (const cr of [0, 1]) {
      const f = fighter(style, { face: face, state: st, cr: cr, drop: 32 * cr, t: 0.3 }); f.stagDur = 0.5; f.rec = 0.5;
      const tag = st + ' cr ' + cr + ' face ' + face, k = SF.skeleton(f, 0);
      ok(k.chest && k.shoulder && k.shoulderB, 'the skeleton has chest, shoulder and shoulderB in ' + tag);
      near(dist(k.shoulder, k.shoulderB), W, 0.5, 'shoulder width in ' + tag);
      near((k.shoulder[0] + k.shoulderB[0]) / 2, k.chest[0], 0.5, 'the girdle is centred on the chest (x) in ' + tag);
      near((k.shoulder[1] + k.shoulderB[1]) / 2, k.chest[1], 0.5, 'the girdle is centred on the chest (y) in ' + tag);
      const ax = [k.chest[0] - k.hip[0], k.chest[1] - k.hip[1]], gx = [k.shoulder[0] - k.shoulderB[0], k.shoulder[1] - k.shoulderB[1]];
      ok(Math.abs(ax[0] * gx[0] + ax[1] * gx[1]) / (Math.hypot(ax[0], ax[1]) * Math.hypot(gx[0], gx[1])) < 0.02, 'the girdle is perpendicular to the torso in ' + tag);
      near(dist(k.chest, k.neck), L.neck, 0.5, 'the neck starts at the chest in ' + tag);
      near(dist(k.shoulder, k.elbow[0]), L.upperArm, 1, 'front upper arm in ' + tag);
      near(dist(k.shoulderB, k.elbow[1]), L.upperArm, 1, 'back upper arm in ' + tag);
      checked++;
    }
    for (const face of [1, -1]) {
      const k = SF.skeleton(fighter(0, { face: face, state: 'idle' }), 0);
      ok((k.shoulder[0] - k.chest[0]) * face > 3, 'the front shoulder is on the facing side (face ' + face + ')');
      ok((k.shoulderB[0] - k.chest[0]) * face < -3, 'the back shoulder is on the far side (face ' + face + ')');
    }
    ok(checked > 100, 'covered ' + checked + ' poses');
  });
};

'use strict';
// PUNCH-01: a punch has to look like a punch. Features are measured on the pose at the key moments. Registered into tests/run.js.
module.exports = function (X) {
  const { test, ok, SF, C, fighter } = X;
  const deg = r => r * 180 / Math.PI, vec = (p, q) => [q[0] - p[0], q[1] - p[1]], dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  const angle = (a, b) => Math.abs(deg(Math.atan2(a[0] * b[1] - a[1] * b[0], a[0] * b[0] + a[1] * b[1])));
  const DUR = 0.4;

  function strikeAt(style, face, kind, aim, u, phase) {
    const f = fighter(style, { face: face, limb: 'punch' });
    f.str = { limb: 'punch', kind: kind, a: aim, s: 1, dur: DUR, hit: false };
    if (phase === 'recover') { f.state = 'recover'; f.rec = 0.32; f.t = (1 - u) * 0.32; } else { f.state = 'strike'; f.t = u * 0.55 * DUR; }
    return SF.skeleton(f, 0);
  }
  const elbowBend = k => 180 - angle(vec(k.elbow[0], k.shoulder), vec(k.elbow[0], k.hand[0]));

  test('PUNCH-01', 'a punch has a chamber at the chin, an extended arm at contact, a straight fist path, a shoulder drive, a guard hand and an accelerating fist', () => {
    const cases = [['straight', 0], ['straight', 10], ['straight', 25], ['up', 45], ['chop', -30], ['chop', -15]];
    let checked = 0;
    for (const face of [1, -1]) for (const style of [0, 1, 2]) for (const [kind, aim] of cases) {
      const tag = kind + ' aim ' + aim + ' face ' + face + ' style ' + style;
      const k0 = strikeAt(style, face, kind, aim, 0), k1 = strikeAt(style, face, kind, aim, 1);
      ok(elbowBend(k1) <= 25, 'elbow still bent ' + elbowBend(k1).toFixed(0) + ' degrees at contact: ' + tag);
      const d = vec(k1.shoulder, k1.hand[0]), dirDeg = deg(Math.atan2(-d[1], d[0] * face));
      ok(Math.abs(dirDeg - aim) <= 8, 'the arm points ' + dirDeg.toFixed(0) + ' degrees, aim ' + aim + ': ' + tag);
      ok(dist(k0.hand[0], k0.head) <= 30, 'the fist starts ' + dist(k0.hand[0], k0.head).toFixed(0) + ' px from the head (chamber at the chin): ' + tag);
      ok(elbowBend(k0) >= 90, 'the chamber elbow is bent only ' + elbowBend(k0).toFixed(0) + ' degrees: ' + tag);
      let worstGuard = 0, maxDev = 0, peak = 0, peakAt = 0, prev = null;
      const a = k0.hand[0], b = k1.hand[0], line = [b[0] - a[0], b[1] - a[1]], len = Math.hypot(line[0], line[1]) || 1;
      for (let i = 0; i <= 20; i++) {
        const k = strikeAt(style, face, kind, aim, i / 20);
        worstGuard = Math.max(worstGuard, dist(k.hand[1], k.head));
        const w = [k.hand[0][0] - a[0], k.hand[0][1] - a[1]]; maxDev = Math.max(maxDev, Math.abs(line[0] * w[1] - line[1] * w[0]) / len);
        if (prev) { const sp = dist(k.hand[0], prev); if (sp > peak) { peak = sp; peakAt = i / 20; } }
        prev = k.hand[0];
      }
      ok(worstGuard <= 30, 'the rear hand leaves the guard (' + worstGuard.toFixed(0) + ' px from the head): ' + tag);
      /* an overhand drops from the chin to a lower target, so it loops by nature: 16 px; straight punches and uppercuts: 10 px */
      const pathLimit = kind === 'chop' ? 16 : 10;
      ok(maxDev <= pathLimit, 'the fist path bends ' + maxDev.toFixed(1) + ' px away from a straight line (limit ' + pathLimit + '): ' + tag);
      ok(peakAt >= 0.5, 'the fist speed peaks early, at ' + peakAt + ' of the extension: ' + tag);
      const fwd = k => (k.shoulder[0] - k.chest[0]) * face;
      ok(fwd(k1) - fwd(k0) >= 5, 'the shoulder drives forward only ' + (fwd(k1) - fwd(k0)).toFixed(1) + ' px: ' + tag);
      checked++;
    }
    ok(checked === 36, 'covered ' + checked + ' cases');
  });

  test('PUNCH-02', 'the wind-up keeps the fist in front of the chest and near the chin, and the recovery returns to the guard', () => {
    for (const face of [1, -1]) for (const style of [0, 1, 2]) {
      for (let c = 0; c <= 1.0001; c += 0.25) {
        const f = fighter(style, { face: face, state: 'charge', limb: 'punch', charge: c * C.CHARGE_MAX }), k = SF.skeleton(f, 0);
        ok((k.hand[0][0] - k.chest[0]) * face >= 0, 'the fist is behind the chest at charge ' + c + ' face ' + face);
        ok(dist(k.hand[0], k.head) <= 35, 'the fist is ' + dist(k.hand[0], k.head).toFixed(0) + ' px from the head at charge ' + c);
      }
      const end = strikeAt(style, face, 'straight', 10, 0, 'recover'), start = strikeAt(style, face, 'straight', 10, 0);
      ok(dist(end.hand[0], start.hand[0]) <= 12, 'the recovery ends away from the chamber (' + dist(end.hand[0], start.hand[0]).toFixed(0) + ' px)');
    }
  });
};

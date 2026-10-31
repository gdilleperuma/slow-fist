/* Touch-gesture decoder for the mobile controller. Pure: millimetres and milliseconds in, a move out; no DOM, no clock.
   A stroke is the list of points {x, y, t} of one finger in one attack circle, y down, x in screen direction.
   classify(pts, limb, facing, final) is called on every new point (final = false) to commit early, and once more at lift (final = true). */
(function (root) {
  'use strict';
  const K = {
    TAP_MM: 2,          /* less travel than this is a tap */
    COMMIT_MM: 2.5,      /* a straight, rising or low move commits after this much travel */
    FWD_ANG: 50, BACK_ANG: 130,   /* the four segments are not equal: forward and back 100 degrees, up and down 80 */
    BACK_MM: 9,         /* a grapple needs this much deliberate travel backward */
    ARC_DEG: 70, ARC_MM: 8,
    POWER_MM: 24,       /* path length that gives full power */
    SPEED_MMS: 250,     /* peak finger speed that gives full speed */
    QUICK: 0.55, HEAVY_SPEED: 0.35, HEAVY_POWER: 0.7,
    WINDOW_MS: 60       /* speed is measured over at least this long, so the sampling rate and jitter do not matter */
  };
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const dist = (p, q) => Math.hypot(p.x - q.x, p.y - q.y);

  function classify(pts, limb, facing, final) {
    if (!pts || pts.length === 0) return null;
    const f = facing < 0 ? -1 : 1, hand = limb === 'hand', start = pts[0];
    /* the stroke ends at its farthest point: the finger coming back afterwards is not part of the move */
    let peak = 0, far = 0;
    for (let i = 1; i < pts.length; i++) { const d = dist(start, pts[i]); if (d > far) { far = d; peak = i; } }
    const s = pts.slice(0, peak + 1), end = s[s.length - 1];
    const extent = far;
    if (extent < K.TAP_MM) {
      if (!final) return null;
      return { phase: 'final', type: 'TAP', move: hand ? 'JAB' : 'FRONT KICK', tier: 'quick', power: 0.1, speed: 0.5, extent: extent, why: 'a tap: the quick poke' };
    }
    let path = 0;
    for (let i = 1; i < s.length; i++) path += dist(s[i - 1], s[i]);
    const total = s[s.length - 1].t - s[0].t;
    let fastest = 0;
    for (let i = 0, j = 1; i < s.length - 1; i++) {
      if (j <= i) j = i + 1;
      while (j < s.length - 1 && s[j].t - s[i].t < K.WINDOW_MS) j++;
      const dt = s[j].t - s[i].t; if (dt > 0 && dt >= Math.min(K.WINDOW_MS, total)) fastest = Math.max(fastest, dist(s[i], s[j]) / dt * 1000);   /* never a window shorter than the rule: the end of the stroke would measure noise */
    }
    const power = clamp(path / K.POWER_MM, 0, 1), speed = clamp(fastest / K.SPEED_MMS, 0, 1);
    /* the length is only known at the end, so while the finger is down a slow stroke is tentatively heavy (the speed is the proxy) */
    const tier = speed >= K.QUICK && power < K.HEAVY_POWER ? 'quick' : (speed < K.HEAVY_SPEED && (power >= K.HEAVY_POWER || !final) ? 'heavy' : 'normal');
    /* how much the path turns, in the frame where forward is +x */
    let turn = 0, last = s[0], prev = null;
    for (let i = 1; i < s.length; i++) {
      if (dist(s[i], last) < 3 && i < s.length - 1) continue;
      const h = Math.atan2(s[i].y - last.y, (s[i].x - last.x) * f);
      if (prev !== null) { let t = h - prev; while (t > Math.PI) t -= 2 * Math.PI; while (t < -Math.PI) t += 2 * Math.PI; turn += t; }
      prev = h; last = s[i];
    }
    const turnDeg = turn * 180 / Math.PI, ang = Math.atan2(end.y - start.y, (end.x - start.x) * f) * 180 / Math.PI;   /* 0 forward, -90 up, 90 down, 180 back */
    const out = { phase: final ? 'final' : 'commit', tier: tier, power: power, speed: speed, extent: extent, turn: turnDeg, ang: ang };

    if (Math.abs(turnDeg) >= K.ARC_DEG && extent >= K.ARC_MM) {
      out.type = 'ARC'; out.arc = turnDeg > 0 ? 'clockwise' : 'anticlockwise';
      out.move = hand ? (end.y < start.y ? 'HEAD' : 'BODY') + ' HOOK' : (ang > 60 && ang < 135 ? 'LOW SWEEP' : 'ROUNDHOUSE');
      out.why = 'a curved path (' + out.arc + ', ' + Math.round(Math.abs(turnDeg)) + ' deg)';
      return out;
    }
    if (Math.abs(ang) >= K.BACK_ANG) {                                           /* drawn back */
      if (extent >= K.BACK_MM && Math.abs(turnDeg) < 40) { out.type = 'GRAPPLE'; out.move = hand ? 'GRAB' : 'LEG HOOK (trip)'; out.why = 'drawn straight back, ' + extent.toFixed(0) + ' mm'; return out; }
      if (!final) return null;                                            /* not committed: wait */
      return { phase: 'final', type: 'TAP', move: hand ? 'JAB' : 'FRONT KICK', tier: 'quick', power: 0.1, speed: speed, extent: extent, why: 'a short flick back is not a grapple' };
    }
    if (!final && extent < K.COMMIT_MM) return null;
    if (Math.abs(ang) <= K.FWD_ANG) { out.type = 'STRAIGHT'; out.move = hand ? (tier === 'quick' ? 'JAB' : tier === 'heavy' ? 'HEAVY CROSS' : 'CROSS') : (tier === 'heavy' ? 'HEAVY KICK' : 'FRONT KICK'); out.why = 'straight through the forward segment'; }
    else if (ang < -K.FWD_ANG) { out.type = 'RISING'; out.move = hand ? 'UPPERCUT' : 'RISING KICK'; out.why = 'upward through the top segment'; }
    else { out.type = 'LOW'; out.move = hand ? 'OVERHAND' : 'LOW KICK'; out.why = 'downward through the bottom segment'; }
    return out;
  }

  const api = { classify: classify, K: K };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.SFC = api;
})(typeof window !== 'undefined' ? window : this);

'use strict';
// Iteration 5 tests: motions must be humanly possible (ANI-06, ANI-07, ANI-08). Registered into tests/run.js.
module.exports = function (X) {
  const { test, ok, eq, SF, C, fighter } = X;
  const deg = r => r * 180 / Math.PI;
  const vec = (p, q) => [q[0] - p[0], q[1] - p[1]];
  const angle = (a, b) => Math.abs(deg(Math.atan2(a[0] * b[1] - a[1] * b[0], a[0] * b[0] + a[1] * b[1])));
  const LIM = { knee: 145, elbow: 150, hipMax: 145, hipMin: -35, speed: 2500 };   /* hip flexion up to 140 for a flexible martial artist; the Kicker's 60 degree kicks need it */

  /* joint angles of one skeleton, for fighter facing `face` */
  function joints(k, face) {
    const out = { knee: [], elbow: [], hip: [] };
    for (let i = 0; i < 2; i++) {
      out.knee.push(180 - angle(vec(k.knee[i], k.hip), vec(k.knee[i], k.foot[i])));
      out.elbow.push(180 - angle(vec(k.elbow[i], [k.shoulder, k.shoulderB][i]), vec(k.elbow[i], k.hand[i])));
      /* hip flexion, signed: 0 = thigh straight down the torso axis, positive = thigh swung toward the facing side */
      const down = vec(k.chest, k.hip), t = vec(k.hip, k.knee[i]);
      const a = Math.atan2(down[0] * t[1] - down[1] * t[0], down[0] * t[0] + down[1] * t[1]);
      out.hip.push(-deg(a) * face);
    }
    return out;
  }
  function rangeProblem(k, face, tag) {
    const j = joints(k, face);
    for (let i = 0; i < 2; i++) {
      if (j.knee[i] > LIM.knee) return 'knee ' + i + ' bent ' + j.knee[i].toFixed(0) + ' degrees in ' + tag;
      if (j.elbow[i] > LIM.elbow) return 'elbow ' + i + ' bent ' + j.elbow[i].toFixed(0) + ' degrees in ' + tag;
      if (j.hip[i] > LIM.hipMax) return 'hip ' + i + ' flexed ' + j.hip[i].toFixed(0) + ' degrees in ' + tag;
      if (j.hip[i] < LIM.hipMin) return 'hip ' + i + ' extended ' + (-j.hip[i]).toFixed(0) + ' degrees behind the torso in ' + tag;
    }
    return null;
  }
  /* an animator when the build has one; otherwise the raw pose function (so the speed test fails for the right reason) */
  function makeAnim() {
    if (SF.makeAnimator) return SF.makeAnimator();
    return { step: function () {}, skeleton: function (m, i) { return SF.skeleton(m.f[i], m.t); }, facing: function (m, i) { return m.f[i].face; } };
  }

  test('ANI-06', 'joint ranges: no pose bends a knee, elbow or hip beyond human limits (pose function, every state and angle)', () => {
    let checked = 0;
    const check = (f, tag) => { const p = rangeProblem(SF.skeleton(f, 0.3), f.face, tag); checked++; if (p) throw new Error(p); };
    for (const face of [1, -1]) for (const style of [0, 1, 2]) {
      for (const limb of ['kick', 'punch']) for (const ang of [-25, -15, 0, 10, 20, 35, 45, 60]) for (const phase of ['strike', 'recover']) for (let u = 0; u <= 10; u++) {
        const f = fighter(style, { face: face, limb: limb });
        f.str = { limb: limb, kind: 'straight', a: ang, s: 1, dur: 0.4, hit: false };
        if (phase === 'strike') { f.state = 'strike'; f.t = (u / 10) * 0.55 * 0.4; } else { f.state = 'recover'; f.rec = 0.5; f.t = (u / 10) * 0.5; }
        check(f, limb + ' ' + phase + ' angle ' + ang + ' u ' + u + ' face ' + face);
      }
      for (const st of C.STATES) for (const cr of [0, 1]) { const f = fighter(style, { face: face, state: st, cr: cr, drop: 32 * cr, t: 0.3 }); f.stagDur = 0.5; f.rec = 0.5; check(f, st + ' cr ' + cr); }
      for (const zone of ['BODY', 'HEAD', 'LEGS']) for (let u = 0; u <= 10; u++) { const f = fighter(style, { face: face, state: 'stagger', zone: zone }); f.stagDur = 0.5; f.t = u * 0.05; check(f, 'stagger ' + zone + ' u ' + u); }
      for (let i = 0; i <= 34; i++) { const f = fighter(style, { face: face, state: 'getup' }); f.t = Math.min(C.GETUP_T - 1e-6, i * 0.025); check(f, 'getup t ' + f.t.toFixed(3)); }
      for (let i = 0; i <= 10; i++) { const f = fighter(style, { face: face, state: 'down' }); f.t = i * 0.05; check(f, 'down t ' + f.t.toFixed(2)); }
      for (const w of [true]) { const f = fighter(style, { face: face, state: 'idle', win: w }); check(f, 'victory'); }
      for (const jp of [0.02, 0.07]) { const f = fighter(style, { face: face, state: 'idle', jumpPre: jp }); check(f, 'jump spring'); }
      { const f = fighter(style, { face: face, state: 'idle', air: true, h: 60 }); check(f, 'air'); }
      for (let r = 0; r <= 63; r += 3) { const f = fighter(style, { face: face, state: 'flipped', h: 50 }); f.rot = -r / 10; check(f, 'flipped rot ' + (-r / 10)); }
      for (let u = 0; u <= 10; u++) { const f = fighter(style, { face: face, state: 'grapple' }); f.t = C.GRAB_LOCK + u * 0.07; check(f, 'grapple u ' + u); }
      for (let u = 0; u <= 10; u++) { const f = fighter(style, { face: face, state: 'grab' }); f.t = u * 0.02; check(f, 'grab u ' + u); }
      for (let u = 0; u <= 10; u++) { const f = fighter(style, { face: face, state: 'charge', limb: u % 2 ? 'kick' : 'punch', charge: u * 0.06 }); check(f, 'charge u ' + u); }
      for (let a = -60; a <= 60; a += 15) { const f = fighter(style, { face: face, state: 'guard', aim: a }); check(f, 'guard aim ' + a); }
    }
    ok(checked > 3000, 'the sweep covered ' + checked + ' poses');
  });

  /* run fights with an animator and measure every frame */
  function fightsMeasure(n, from, limitSpeed) {
    const res = { frames: 0, rangeProblems: [], speedOver: 0, worstSpeed: 0, worstTag: '', nan: 0, underFloor: 0 };
    for (let s = 0; s < n; s++) {
      const m = SF.createMatch({ seed: from + s, styles: [s % 3, (s + 1) % 3], ai: [true, true] }), anim = makeAnim();
      const prev = [null, null];
      for (let i = 0; i < 2400 && (m.winner === null || i < 500); i++) {
        SF.stepAI(m); anim.step(m);
        for (let fi = 0; fi < 2; fi++) {
          const f = m.f[fi], k = anim.skeleton(m, fi), tag = f.state + (f.str ? '/' + f.str.kind : '');
          res.frames++;
          /* judged against the facing that is displayed, which turns over a quarter of a second */
          const rp = rangeProblem(k, anim.facing(m, fi) >= 0 ? 1 : -1, tag + ' (seed ' + (from + s) + ' step ' + i + ')');
          if (rp && res.rangeProblems.length < 5) res.rangeProblems.push(rp);
          for (const key in k) (Array.isArray(k[key][0]) ? k[key] : [k[key]]).forEach(p => { if (!isFinite(p[0]) || !isFinite(p[1])) res.nan++; else if (p[1] > C.GY + 1) res.underFloor++; });
          if (prev[fi]) {
            const pairs = [['hand', k.hand[0], prev[fi].k.hand[0]], ['hand', k.hand[1], prev[fi].k.hand[1]], ['foot', k.foot[0], prev[fi].k.foot[0]], ['foot', k.foot[1], prev[fi].k.foot[1]], ['head', k.head, prev[fi].k.head]];
            for (const [name, a, b] of pairs) {
              const sp = Math.hypot(a[0] - b[0], a[1] - b[1]) * 60;
              if (sp > limitSpeed) { res.speedOver++; }
              if (sp > res.worstSpeed) { res.worstSpeed = sp; res.worstTag = name + ' in ' + tag + ' after ' + prev[fi].tag + ' (seed ' + (from + s) + ' step ' + i + ')'; }
            }
          }
          prev[fi] = { k: k, tag: tag };
        }
      }
    }
    return res;
  }

  test('ANI-06b', 'joint ranges hold in the animated skeleton over 40 AI fights', () => {
    const r = fightsMeasure(40, 900, LIM.speed);
    ok(r.rangeProblems.length === 0, r.rangeProblems.join(' | '));
  });

  test('ANI-07', 'no hand, foot or head moves faster than 2,500 px/s in 40 AI fights (including pose changes)', () => {
    const r = fightsMeasure(40, 900, LIM.speed);
    ok(r.speedOver === 0, r.speedOver + ' samples over the limit in ' + r.frames + ' frames; worst ' + r.worstSpeed.toFixed(0) + ' px/s: ' + r.worstTag);
  });

  test('MOT-09', 'the solved limb moves continuously as its target sweeps every direction the joints can reach (DEF-016, DEF-017)', () => {
    /* a limb target cannot pass through the torso, so the sweep covers the reachable arc of hip flexion (-60 to 160 degrees,
       beyond the limits on both sides) and expects the solved foot to move continuously; the full circle would need a jump */
    let worst = 0, where = '';
    for (const face of [1, -1]) for (const phi of [-0.9, -0.3, 0, 0.35, 0.9, 1.4]) for (const radius of [30, 45, 60, 74]) {
      let prev = null;
      for (let flex = -60; flex <= 160; flex += 2) {
        const f = fighter(0, { face: face }), P = SF.poseParams(f, 0);
        const hip = [P.hipX, P.hipY], sh = [hip[0] - face * Math.sin(phi) * 55, hip[1] - Math.cos(phi) * 55];
        const delta = Math.atan2(hip[1] - sh[1], hip[0] - sh[0]), a = delta - flex * Math.PI / 180 * face;
        P.phi = phi; P.foot = [[hip[0] + Math.cos(a) * radius, hip[1] + Math.sin(a) * radius], P.foot[1]];
        const foot = SF.solvePose(P).foot[0];
        if (prev) { const d = Math.hypot(foot[0] - prev[0], foot[1] - prev[1]); if (d > worst) { worst = d; where = 'face ' + face + ' phi ' + phi + ' radius ' + radius + ' at hip flexion ' + flex; } }
        prev = foot;
      }
    }
    ok(worst < 12, 'the foot jumped ' + worst.toFixed(1) + ' px for a 2 degree change of the target direction: ' + where);
  });

  test('ANI-08', 'the animator is presentation only, converges to the target pose, has no lag at the start, and keeps the floor and number checks', () => {
    ok(!!SF.makeAnimator, 'SF.makeAnimator exists');
    const a = SF.createMatch({ seed: 71, styles: [0, 1], ai: [true, true] }), b = SF.createMatch({ seed: 71, styles: [0, 1], ai: [true, true] }), anim = SF.makeAnimator();
    for (let i = 0; i < 700; i++) { SF.stepAI(a); SF.stepAI(b); anim.step(a); }
    eq(SF.stateHash(a), SF.stateHash(b), 'the animator must not change the simulation');
    const m = SF.createMatch({ seed: 5, styles: [1, 0], ai: [false, false] }), an2 = SF.makeAnimator();
    m.f[0].state = 'guard'; m.f[0].aim = 25; an2.step(m);
    const first = an2.skeleton(m, 0), pure = SF.skeleton(m.f[0], m.t);
    for (const key in pure) (Array.isArray(pure[key][0]) ? pure[key] : [pure[key]]).forEach((p, i) => {
      const q = Array.isArray(pure[key][0]) ? first[key][i] : first[key];
      ok(Math.hypot(p[0] - q[0], p[1] - q[1]) < 1e-6, 'no lag on the first frame: ' + key);
    });
    m.f[0].state = 'charge'; m.f[0].limb = 'kick'; m.f[0].charge = 0.4;
    for (let i = 0; i < 120; i++) an2.step(m);
    const target = SF.skeleton(m.f[0], m.t), now = an2.skeleton(m, 0);
    for (const key in target) (Array.isArray(target[key][0]) ? target[key] : [target[key]]).forEach((p, i) => {
      const q = Array.isArray(target[key][0]) ? now[key][i] : now[key];
      ok(Math.hypot(p[0] - q[0], p[1] - q[1]) < 1, 'converged to the target within 1 px: ' + key + ' off by ' + Math.hypot(p[0] - q[0], p[1] - q[1]).toFixed(2));
    });
    const r = fightsMeasure(10, 950, LIM.speed);
    eq(r.nan, 0, 'no non-numbers in the animated skeleton'); eq(r.underFloor, 0, 'nothing under the floor in the animated skeleton');
  });
};

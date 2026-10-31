// Pose and skeleton. Pure functions: they read a fighter, never change it.
// Layer 1 (poseParams): the target pose of a fighter as a few numbers (hip, torso angle, foot and hand targets).
// Layer 2 (jointAngles, forward): inverse kinematics once gives the joint angles; each angle is clamped to its human
//   range (DEF-014) and the limbs are rebuilt with forward kinematics, so limb lengths are constant, the bend side
//   follows the joint's anatomy (DEF-013) and the ranges hold by construction. The figure is then lifted so no joint
//   or head extent is under the floor (ADR-005).
// Layer 3 (SF.makeAnimator): the displayed pose moves toward the target in joint space with a rate and a speed cap, so a
//   change of state never teleports a limb (DEF-015, DEF-017). The simulation never reads it.
var SF = (typeof SF === 'undefined') ? {} : SF;
(function () {
  'use strict';
  const C = SF.CFG, L = C.LIMB;
  const clamp = SF.clamp, ease = SF.ease;
  const lerp = function (a, b, u) { return a + (b - a) * u; };
  const RAD = Math.PI / 180;

  /* human joint ranges (degrees); the tests allow a few degrees more. Hip flexion is that of a flexible martial artist. */
  const RANGE = { hip: [-30, 140], knee: [0, 140], shoulder: [-60, 180], elbow: [0, 145] };

  // two-bone IK: root -> joint -> end. Returns [joint, end]; the end is pulled back onto the reach circle if too far.
  // flexSign picks which of the two solutions is used, by the anatomical rule of the joint (DEF-013):
  // cross(upper, lower) x flexSign must be the larger one. Knee: flexSign = facing (the shin folds backward).
  // Elbow: flexSign = -facing (the forearm folds forward). When the limb is straight the two solutions coincide.
  function ik2(root, target, l1, l2, flexSign) {
    let dx = target[0] - root[0], dy = target[1] - root[1], d = Math.hypot(dx, dy);
    if (d < 1e-6) { dx = 0; dy = 1; d = 1e-6; }
    const maxD = l1 + l2 - 1e-6, minD = Math.abs(l1 - l2) + 1e-6;
    const dd = clamp(d, minD, maxD), ux = dx / d, uy = dy / d;
    const end = [root[0] + ux * dd, root[1] + uy * dd];
    const a = (l1 * l1 - l2 * l2 + dd * dd) / (2 * dd), h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
    const mx = root[0] + ux * a, my = root[1] + uy * a;
    const j1 = [mx - uy * h, my + ux * h], j2 = [mx + uy * h, my - ux * h];
    const cross = function (j) { return (j[0] - root[0]) * (end[1] - j[1]) - (j[1] - root[1]) * (end[0] - j[0]); };
    return [cross(j1) * flexSign >= cross(j2) * flexSign ? j1 : j2, end];
  }
  const wrap = function (a) { return Math.atan2(Math.sin(a), Math.cos(a)); };
  const angOf = function (v) { return Math.atan2(v[1], v[0]); };
  /* clamp an angle (degrees) to [lo, hi]: unwrap first so the nearest limit is chosen (DEF-016) */
  function clampAngle(deg, lo, hi) {
    const wrapAt = (hi + 360 + lo) / 2 - 360;
    if (deg < wrapAt) deg += 360;
    return clamp(deg, lo, hi);
  }

  /* stand-up phase boundaries, tuned with tests/tune-getup.js so no joint pops */
  const GU_SWEEP_A = 0.1, GU_SWEEP_B = 0.28, GU_KNEEL_B = 0.7, GU_LIFT = 10;
  /* piecewise-linear value over keyframes [[p, value], ...] */
  function keyed(p, kf) {
    for (let i = 1; i < kf.length; i++) {
      if (p <= kf[i][0]) { const a = kf[i - 1], b = kf[i]; return lerp(a[1], b[1], (p - a[0]) / (b[0] - a[0])); }
    }
    return kf[kf.length - 1][1];
  }
  /* forward kinematics of a limb from joint angles in degrees, in the torso's frame (delta: torso axis direction, sgn: facing).
     Used to author fancy poses as angles, so every target is reachable and inside the ranges. */
  function fkFoot(hx, hy, delta, h, k, sgn) {
    const ta = delta - h * RAD * sgn, sa = ta + k * RAD * sgn, kx = hx + L.thigh * Math.cos(ta), ky = hy + L.thigh * Math.sin(ta);
    return [kx + L.shin * Math.cos(sa), ky + L.shin * Math.sin(sa)];
  }
  function fkHand(delta, s, e, sgn) {
    const ua = delta - s * RAD * sgn, fa = ua - e * RAD * sgn;
    return [L.upperArm * Math.cos(ua) + L.foreArm * Math.cos(fa), L.upperArm * Math.sin(ua) + L.foreArm * Math.sin(fa)];
  }
  const mixPt = function (a, b, u) { return [lerp(a[0], b[0], u), lerp(a[1], b[1], u)]; };

  /* horizontal scale for the spinning kick and the tornado stand-up: a full turn about the vertical axis (drawing only) */
  const SPIN_LOOKS = { spinfist: 1, tornado: 1, butterfly: 1 };      /* moves that turn the body about the vertical axis (drawn as a squeeze) */
  SF.spinScale = function (f) {
    if (f.state === 'strike' && f.str && (f.str.kind === 'spin' || SPIN_LOOKS[f.str.look])) {
      const v = Math.cos(2 * Math.PI * clamp(f.t / f.str.dur, 0, 1));
      /* the aerial and the backfist turns are never drawn edge-on: the figure stays at least 40 percent wide so it can be read */
      return (SPIN_LOOKS[f.str.look] && Math.abs(v) < 0.4) ? (v < 0 ? -0.4 : 0.4) : v;
    }
    if (f.state === 'getup' && f.flair === 2) return Math.cos(2 * Math.PI * clamp((f.t / (f.getDur || C.GETUP_T) - 0.3) / 0.55, 0, 1));
    return 1;
  };

  /* ---------- layer 1: target pose parameters ---------- */
  SF.poseParams = function (f, tm) {
    tm = tm || 0;
    const face = f.face || 1, x = f.x, gy = C.GY - f.h, st = f.state, gd = f.getDur || C.GETUP_T;
    const LEG = L.thigh + L.shin;
    const dir = function (deg) { const r = deg * RAD; return [face * Math.cos(r), -Math.sin(r)]; };

    // ---- stand-up pose parameters ----
    let hipY = gy - C.HIP_H + f.drop, phi = -0.08;                 // phi: torso lean, positive = backwards
    const wide = 1 + 0.5 * f.cr, mv = clamp(Math.abs(f.vx) / 100, 0, 1), ph = f.x * 0.09;
    let foot = [[x + face * 20 * wide + Math.sin(ph) * 16 * mv * face, gy - Math.max(0, Math.cos(ph)) * 7 * mv],
                [x - face * 18 * wide - Math.sin(ph) * 16 * mv * face, gy - Math.max(0, -Math.cos(ph)) * 7 * mv]];
    if (f.air) { foot[0][1] = gy - 14; foot[1][1] = gy - 22; foot[0][0] = x + face * 16; foot[1][0] = x - face * 10; }
    const stance = [foot[0].slice(), foot[1].slice()];
    const sgnP = face >= 0 ? 1 : -1;
    let hipX = x;
    // hand targets are relative to the shoulder
    let handRel = [[face * 24, -4], [face * 12, 14]];
    let headTilt = 0, getupHands = null, getupP = null, twist = 0, rotLook = 0;     /* rotLook: the figure leans or lies as a whole (flying moves) */

    /* A punch is built from its parts (DEF-018): a chamber with the fist at the chin and the elbow folded; an arm that
       straightens along the aim; a shoulder girdle that drives forward as the torso rotates; a rear hand that stays at the
       chin; and a fist that accelerates into the contact. ex: 0 chamber .. 1 contact; wind: 0..1 loading before the strike. */
    const bez = function (p0, p1, p2, u) { const k = 1 - u; return [k * k * p0[0] + 2 * k * u * p1[0] + u * u * p2[0], k * k * p0[1] + 2 * k * u * p1[1] + u * u * p2[1]]; };
    const punchPose = function (ex, aim, wind, hand, kind, look) {
      const lead = !hand, spinf = look === 'spinfist' && wind <= 0;       /* the backfist turns the whole body and swings the arm wide */
      if (look === 'superman' && wind <= 0) { rotLook = face * 75 * ex * RAD; aim = aim + 75 * ex; }     /* the body lies forward in the air; the arm points along the lie */
      if (spinf) kind = 'hook';                                 /* hand 0 = the lead hand, 1 = the rear hand (CHOREOGRAPHY.md) */
      phi = wind > 0 ? 0.1 + 0.25 * wind : -0.1 - (lead ? 0.12 : 0.16) * ex - (spinf ? 0.22 * ex : 0);
      twist = wind > 0 ? -4 * wind : (lead ? 8 : 12) * ex * (spinf ? 2.2 : 1);   /* the rear hand drives the torso and the girdle further */
      const d0 = Math.atan2(Math.cos(phi), face * Math.sin(phi));
      const ua = Math.atan2(-Math.sin(aim * RAD), face * Math.cos(aim * RAD));
      const s1 = -wrap(ua - d0) * sgnP / RAD;
      const tx = -face * Math.sin(phi), ty = -Math.cos(phi), px = -ty * sgnP, py = tx * sgnP;      /* torso up, and the way the girdle points */
      const fr = fkHand(d0, lerp(50 - 15 * wind, s1, ex), lerp(140 + 10 * wind, kind === 'hook' ? 85 : 5, ex), sgnP);   /* a hook keeps the elbow bent */
      const gr = fkHand(d0, lead ? 55 : 80, lead ? 135 : 150, sgnP);                                 /* the other hand guards the chin */
      const ro = [[px * (L.shoulder + twist), py * (L.shoulder + twist)], [-px * (L.shoulder - twist), -py * (L.shoulder - twist)]];
      const h = lead ? 0 : 1, o = 1 - h;
      handRel[h] = [ro[h][0] + fr[0], ro[h][1] + fr[1]];
      handRel[o] = [ro[o][0] + gr[0], ro[o][1] + gr[1]];
      if (look === 'superman' && wind <= 0) handRel[o] = [lerp(handRel[o][0], -face * 22, ex), lerp(handRel[o][1], 6, ex)];     /* the other arm trails back */
    };

    /* the look of a kick (DEF-032): the chamber, the lean, the turn of the hips and the arms differ from move to move, not only the angle */
    const kickLook = function (str, ext, hip, t, s0) {
      const look = str.look; if (!look) return;
      const sw = function (deg, k) { const q = dir(deg); return [hip[0] + q[0] * LEG * k, hip[1] + q[1] * LEG * k]; };
      const arms = function (a, b) { handRel = [[lerp(handRel[0][0], a[0], ext), lerp(handRel[0][1], a[1], ext)], [lerp(handRel[1][0], b[0], ext), lerp(handRel[1][1], b[1], ext)]]; };
      if (look === 'round') {            /* roundhouse: the knee comes up and across, the leg swings in an arc, the hips turn and the torso leans away */
        foot[0] = bez(s0, sw(str.a + 80, 0.8), t, ext); phi = 0.55 * ext; twist = 9 * ext; arms([-face * 20, -8], [-face * 8, -34]);
      } else if (look === 'axe') {       /* axe kick: the leg goes straight up overhead, then the heel chops down in front; the torso leans back, arms out */
        foot[0] = bez(s0, sw(95, 1.0), t, ext); phi = 0.35 * ext; arms([face * 18, -18], [-face * 16, -14]);
      } else if (look === 'flying') {    /* flying kick: the body lies back in the air, one leg driven out straight, the other tucked, arms back */
        const R = 66 * ext; rotLook = -face * R * RAD; foot[0] = [lerp(s0[0], sw(str.a - R, 1)[0], ext), lerp(s0[1], sw(str.a - R, 1)[1], ext)]; foot[1] = [lerp(foot[1][0], sw(-100, 0.6)[0], ext), lerp(foot[1][1], sw(-100, 0.6)[1], ext)]; arms([-face * 18, -14], [-face * 10, -26]);
      } else if (look === 'butterfly') { /* butterfly kick: the body lies flat and turns, the legs open like scissors, the arms spread */
        const R = 80 * ext; rotLook = -face * R * RAD; foot[0] = [lerp(s0[0], sw(str.a + 25 - R, 1)[0], ext), lerp(s0[1], sw(str.a + 25 - R, 1)[1], ext)]; foot[1] = [lerp(foot[1][0], sw(195 - R, 1)[0], ext), lerp(foot[1][1], sw(195 - R, 1)[1], ext)]; arms([face * 24, -6], [-face * 22, -6]);
      } else if (look === 'tornado') {   /* tornado kick: a full turn in the air ending in a high roundhouse */
        rotLook = -face * 25 * ext * RAD; foot[0] = bez(s0, sw(str.a + 80, 0.85), sw(str.a + 20 - 25 * ext, 1), ext); phi = 0.25 * ext; twist = 9 * ext; arms([-face * 20, -8], [-face * 8, -34]);
      } else if (look === 'spin') {      /* spinning kick: the body turns away (the drawing squeezes it), leaning forward over the support leg, arms tucked */
        foot[0] = bez(s0, sw(str.a - 100, 0.9), t, ext); phi = -0.3 * ext; twist = -9 * ext; headTilt = 0.35 * ext; arms([face * 6, -20], [-face * 8, -24]);
      } else if (look === 'sweep') {     /* low sweep: a low, forward lean, the foot sliding along the floor, a hand down for support */
        foot[0] = bez(s0, [hip[0] + face * LEG * 0.35, gy - 6], t, ext); phi = -0.34 * ext; arms([face * 34, 8], [-face * 14, -24]);
      }
    };

    const str = f.str;
    if (st === 'guard') { phi = -0.12; const d = dir(clamp(f.aim, -30, 60)); handRel = [[d[0] * 34, d[1] * 34 - 6], [face * 16, 8]]; }
    else if (st === 'charge') {
      const c = clamp(f.charge / C.CHARGE_MAX, 0, 1); phi = 0.1 + 0.25 * c;
      if (f.limb === 'punch') punchPose(0, 0, c, 0, 'straight'); else foot[0] = [x - face * (16 + 14 * c), gy - 18 - 14 * c];
    } else if (st === 'strike' && str) {
      const su = str.startT !== undefined ? str.startT : str.dur * 0.55, prog = clamp(f.t / su, 0, 1), ext = ease(f.t / su), d = dir(str.a);
      if (str.limb === 'punch') {
        punchPose(Math.pow(prog, 1.7), str.a, 0, str.hand | 0, str.kind, str.look);
        if (str.lunge) foot[0] = [foot[0][0] + face * str.lunge * 0.5 * Math.sin(Math.PI * prog), foot[0][1]];                 /* the front foot steps out ahead of the body */
        if (str.hand === 1 && str.lunge) foot[1] = [foot[1][0] + face * 3 * prog, foot[1][1] - 5 * prog];                                  /* the rear heel lifts on the pivot */
      }
      else {
        if (str.lunge) foot[1] = [foot[1][0] + face * str.lunge * 0.5 * Math.sin(Math.PI * prog), foot[1][1]];                /* the support foot steps in */ phi = 0.05 + 0.35 * ext * (str.a > 20 ? 1 : 0.5); const hip = [x, hipY]; const t = [hip[0] + d[0] * LEG, hip[1] + d[1] * LEG]; foot[0] = [lerp(x - face * 16, t[0], ext), lerp(gy - 22, t[1], ext)]; kickLook(str, ext, hip, t, [x - face * 16, gy - 22]); }
    } else if (st === 'recover' && str && f.rec > 0) {
      const ext = 1 - clamp(f.t / f.rec, 0, 1), d = dir(str.a);
      if (str.limb === 'punch') punchPose(Math.pow(ext, 1.7), str.a, 0, str.hand | 0, str.kind, str.look);
      else { phi = 0.05 + 0.35 * ext; const t = [x + d[0] * LEG, hipY + d[1] * LEG], s0 = [foot[0][0], foot[0][1]]; foot[0] = [lerp(foot[0][0], t[0], ext), lerp(foot[0][1], t[1], ext)]; kickLook(str, ext, [x, hipY], t, s0); }
    } else if (st === 'stagger') {
      const u = clamp(f.t / Math.max(0.01, f.stagDur), 0, 1), k0 = 1 - u;
      phi = 0.55 * k0 + 0.1; handRel = [[-face * 10, -22 * k0], [face * 6, -14 * k0]];
      if (f.zone === 'BODY') { phi = -0.9 * (1 - 0.4 * u); handRel = [[face * 14, 16], [face * 8, 22]]; }
      else if (f.zone === 'HEAD') { phi = 0.5 * k0 + 0.2; headTilt = 0.6 * k0; }
      else if (f.zone === 'LEGS') { hipY += 22 * (1 - u * u); phi = -0.25 * k0; }
    } else if (st === 'grab') {
      const p = ease(f.t / C.GRAB_START); phi = -0.15 * p; handRel = [[face * 44 * p + face * 10, -12], [face * 38 * p + face * 8, 2]];
    } else if (st === 'grapple') {
      const p = ease(clamp((f.t - C.GRAB_LOCK) / C.GRAB_FLIP, 0, 1)); phi = lerp(-0.45, 0.35, p); handRel = [[lerp(face * 36, face * 6, p), lerp(-8, -52, p)], [lerp(face * 30, face * 14, p), lerp(0, -46, p)]];
    } else if (st === 'flipped') { handRel = [[face * 30, -40], [-face * 30, -40]]; foot[0] = [x + face * 14, gy - 10]; foot[1] = [x - face * 14, gy - 6]; }

    if (f.jumpPre > 0) { hipY += 20; phi = -0.25; }          // spring: sink before the launch
    if (f.win && st === 'idle') {
      const pump = Math.sin(tm * 6);
      if (f.styleIndex === 0) { phi = -0.05; handRel = [[face * 16, -38 - 5 * pump], [face * 4, -34 + 5 * pump]]; }
      else if (f.styleIndex === 1) { phi = 0.35; const d = dir(50); foot[0] = [x + d[0] * LEG * 0.95, hipY + d[1] * LEG * 0.95]; handRel = [[face * 30, -4], [-face * 30, -10]]; }
      else { phi = -0.1; hipY += 8; handRel = [[face * 20, -38 + 3 * pump], [face * 12, -34 + 3 * pump]]; }   /* double biceps in profile: elbows forward, fists up */
    }

    // ---- lying and rising ----
    let lie = 0;
    const tt = (st === 'down' && f.ko) ? f.koT : f.t;
    if (st === 'down') lie = ease(tt / 0.25);
    else if (st === 'getup') lie = 1 - ease(f.t / gd);
    if (lie > 0) {
      const lieHipY = C.GY - L.head - 1;                  // lies on the floor: the head circle just touches it
      hipY = lerp(hipY, lieHipY, lie); phi = lerp(phi, Math.PI / 2, lie);
      hipX = x - face * 20 * lie;
      foot = [[lerp(foot[0][0], hipX + face * 66, lie), lerp(foot[0][1], C.GY - 3, lie)], [lerp(foot[1][0], hipX + face * 58, lie), lerp(foot[1][1], C.GY - 12, lie)]];
      const rd = 6 * (1 - ease(tt / 0.25)) * Math.sin(tt * 14), handY = (C.GY - 3) - lieHipY;   // hands rest on the floor (DEF-005)
      handRel = [[lerp(handRel[0][0], -face * 26, lie), lerp(handRel[0][1], handY + rd, lie)], [lerp(handRel[1][0], -face * 40, lie), lerp(handRel[1][1], handY - 3 - rd, lie)]];
    }
    if (st === 'getup') {
      /* hands and knees, one knee up, rise: keyframed hip height and torso angle */
      const p = clamp(f.t / gd, 0, 1);
      hipY = C.GY - keyed(p, [[0, L.head + 1], [0.3, 26], [0.55, 38], [0.8, 55], [1, C.HIP_H]]);
      phi = keyed(p, [[0, Math.PI / 2], [0.3, 0.7], [0.55, 0.25], [0.8, 0.05], [1, -0.08]]);
      getupHands = 1 - clamp((p - 0.35) / 0.3, 0, 1);
      getupP = p;
      /* back leg (DEF-008): lying -> swept straight -> folded under with the knee on the floor -> standing.
         The bend direction flips while the leg is straight, where both solutions coincide, so nothing pops. */
      const hh = Math.max(0, C.GY - hipY - 3);
      const kx = Math.sqrt(Math.max(0, L.thigh * L.thigh - hh * hh)), sx = Math.sqrt(Math.max(0, Math.pow(LEG - 1, 2) - hh * hh));
      const straight = [hipX + face * sx, C.GY - 3], kneel = [hipX - face * (kx + L.shin), C.GY - 3], stand = [x - face * 18, C.GY];
      const mix2 = function (a, b, u) { return [lerp(a[0], b[0], u), lerp(a[1], b[1], u)]; };
      if (p < GU_SWEEP_A) foot[1] = foot[1];
      else if (p < GU_SWEEP_B) foot[1] = mix2(foot[1], straight, ease((p - GU_SWEEP_A) / (GU_SWEEP_B - GU_SWEEP_A)));
      else if (p < GU_KNEEL_B) {
        /* the leg swings through the air (lifted) so the knee never dips under the floor on the way */
        const u = (p - GU_SWEEP_B) / (GU_KNEEL_B - GU_SWEEP_B);
        foot[1] = mix2(straight, kneel, ease(u));
        foot[1][1] -= GU_LIFT * Math.sin(Math.PI * u);
      }
      else foot[1] = mix2(kneel, stand, ease((p - GU_KNEEL_B) / (1 - GU_KNEEL_B)));
    }
    if (getupHands !== null) {
      /* the hands are authored as shoulder angles in the torso's own frame (overhead on the floor while lying, then forward to
         guard), so they are always inside the shoulder's range; positions under a tilted torso were not (DEF-014, DEF-017) */
      const sgn = face >= 0 ? 1 : -1, fl = getupHands;
      const delta = Math.atan2(Math.cos(phi), face * Math.sin(phi));          /* direction of the torso axis, shoulder to hip */
      const postAng = [175, 172], guardAng = [99, 41], postLen = [28, 42], guardLen = [24.3, 18.4];
      handRel = [0, 1].map(function (i) {
        const ang = lerp(guardAng[i], postAng[i], fl) * RAD, len = lerp(guardLen[i], postLen[i], fl), ua = delta - ang * sgn;
        return [len * Math.cos(ua), len * Math.sin(ua)];
      });
    }
    // ---- fancy movement (FANCY-01, FANCY-02): authored as joint angles, so ranges and reach hold by construction ----
    const fsg = face >= 0 ? 1 : -1, flair = f.flair | 0;
    if (st === 'flipped') {
      const e = clamp(Math.abs(f.rot || 0) / (1.5 * Math.PI), 0, 1), d0 = Math.atan2(Math.cos(phi), face * Math.sin(phi));
      let lh, lk, as, ae;
      if (flair === 0) {                                  /* tuck: knees to the chest at the top of the flight, then open out */
        const tk = Math.sin(Math.PI * clamp((e - 0.1) / 0.8, 0, 1));
        lh = [lerp(10, 125, tk), lerp(2, 117, tk)]; lk = [lerp(12, 135, tk), lerp(10, 127, tk)];
        as = [lerp(165, 70, tk), lerp(150, 60, tk)]; ae = [lerp(15, 125, tk), lerp(15, 120, tk)];
      } else if (flair === 1) {                           /* pike with windmilling arms */
        lh = [75, 70]; lk = [6, 6];
        as = [95 + 85 * Math.sin(4 * Math.PI * e), 95 + 85 * Math.cos(4 * Math.PI * e)]; ae = [12, 12];
      } else {                                            /* scissor kick with the arms spread */
        const w = Math.sin(4 * Math.PI * e), c = Math.cos(4 * Math.PI * e);
        lh = [65 + 58 * w, 65 - 58 * w]; lk = [25 + 20 * (1 + c), 25 + 20 * (1 - c)];
        as = [150, 40]; ae = [20, 20];
      }
      foot = [0, 1].map(function (i) { return fkFoot(hipX, hipY, d0, lh[i], lk[i], fsg); });
      handRel = [0, 1].map(function (i) { return fkHand(d0, as[i], ae[i], fsg); });
    }
    if (st === 'getup' && flair === 1) {                  /* kip-up: legs swing overhead, the hips spring up, land and stand */
      const p = clamp(f.t / gd, 0, 1), b = ease(clamp((p - 0.85) / 0.15, 0, 1));
      hipX = lerp(x - face * 20, x, ease(clamp(p / 0.6, 0, 1)));
      hipY = C.GY - keyed(p, [[0, 12], [0.25, 34], [0.4, 52], [0.55, 88], [0.72, 50], [0.88, 62], [1, C.HIP_H]]);
      phi = keyed(p, [[0, Math.PI / 2], [0.3, Math.PI / 2], [0.55, 0.3], [0.72, 0.15], [1, -0.08]]);
      const d0 = Math.atan2(Math.cos(phi), face * Math.sin(phi));
      const lh = keyed(p, [[0, 45], [0.3, 145], [0.55, 70], [0.72, 30], [0.88, 18], [1, 10]]), lk = keyed(p, [[0, 50], [0.3, 8], [0.55, 15], [0.72, 80], [0.88, 45], [1, 18]]);
      const as = keyed(p, [[0, 175], [0.3, 150], [0.55, 60], [0.72, 70], [1, 41]]), ae = keyed(p, [[0, 30], [0.3, 20], [0.55, 20], [1, 30]]);
      foot = [mixPt(fkFoot(hipX, hipY, d0, lh, lk, fsg), stance[0], b), mixPt(fkFoot(hipX, hipY, d0, lh - 6, lk + 4, fsg), stance[1], b)];
      handRel = [mixPt(fkHand(d0, as, ae, fsg), [face * 24, -4], b), mixPt(fkHand(d0, as - 8, ae + 8, fsg), [face * 12, 14], b)];
    }
    if (st === 'getup' && flair === 2) {                  /* tornado: rise from the kneel with a hop, turning a full circle (see spinScale) */
      const p = clamp(f.t / gd, 0, 1);
      hipY -= 14 * Math.sin(Math.PI * clamp((p - 0.5) / 0.35, 0, 1));
    }
    if (st === 'getup' && (f.recov === 'fwd' || f.recov === 'back')) {   /* a roll: tucked into a ball, one full turn over the shoulder (forward or back), then up */
      const p = clamp(f.t / gd, 0, 1), roll = clamp(p / 0.75, 0, 1), up = ease(clamp((p - 0.7) / 0.3, 0, 1)), sgnR = f.recov === 'fwd' ? 1 : -1;
      hipX = x; hipY = lerp(C.GY - 38, C.GY - C.HIP_H, up); phi = lerp(-0.6, -0.08, up);
      rotLook = sgnR * face * 2 * Math.PI * roll;       /* linear, so the animator (12 rad/s) can follow it */
      const d0 = Math.atan2(Math.cos(phi), face * Math.sin(phi));
      foot = [mixPt(fkFoot(hipX, hipY, d0, 125, 135, fsg), stance[0], up), mixPt(fkFoot(hipX, hipY, d0, 117, 127, fsg), stance[1], up)];
      handRel = [mixPt(fkHand(d0, 70, 125, fsg), [face * 24, -4], up), mixPt(fkHand(d0, 60, 120, fsg), [face * 12, 14], up)];
    }
    return { fs: face, twist: twist, hipX: hipX, hipY: hipY, phi: phi, headTilt: headTilt, rot: (st === 'flipped' && f.rot) ? f.rot : rotLook, foot: foot, hand: handRel };
  };

  /* ---------- layer 2: joint angles and forward kinematics ---------- */
  /* torso geometry from the parameters (the facing may be a fraction while turning) */
  function torso(P) {
    const hip = [P.hipX, P.hipY], tdir = [-P.fs * Math.sin(P.phi), -Math.cos(P.phi)];
    const chest = [hip[0] + tdir[0] * L.torso, hip[1] + tdir[1] * L.torso];
    /* the shoulder girdle: two joints a constant width apart, perpendicular to the torso; the front one is on the facing
       side (the side turns over smoothly while the figure turns round) */
    const sg = clamp(P.fs * 4, -1, 1), perp = [-tdir[1] * sg, tdir[0] * sg];
    const tw = P.twist || 0;       /* the whole girdle slides forward when the torso rotates into a punch */
    const roots = [[chest[0] + perp[0] * (L.shoulder + tw), chest[1] + perp[1] * (L.shoulder + tw)], [chest[0] - perp[0] * (L.shoulder - tw), chest[1] - perp[1] * (L.shoulder - tw)]];
    return { hip: hip, tdir: tdir, chest: chest, roots: roots, delta: angOf([hip[0] - chest[0], hip[1] - chest[1]]) };
  }
  /* inverse kinematics once: the target pose becomes joint angles (radians), each inside its human range */
  function jointAngles(P) {
    const T = torso(P), sign = P.fs >= 0 ? 1 : -1;
    const leg = [], arm = [];
    for (let i = 0; i < 2; i++) {
      const lg = ik2(T.hip, P.foot[i], L.thigh, L.shin, sign);
      const ta = angOf([lg[0][0] - T.hip[0], lg[0][1] - T.hip[1]]), sa = angOf([lg[1][0] - lg[0][0], lg[1][1] - lg[0][1]]);
      leg.push([clampAngle(-wrap(ta - T.delta) * sign / RAD, RANGE.hip[0], RANGE.hip[1]) * RAD,
                clampAngle(wrap(sa - ta) * sign / RAD, RANGE.knee[0], RANGE.knee[1]) * RAD]);
      const hand = [T.chest[0] + P.hand[i][0], T.chest[1] + P.hand[i][1]], R = T.roots[i];
      const am = ik2(R, hand, L.upperArm, L.foreArm, -sign);
      const ua = angOf([am[0][0] - R[0], am[0][1] - R[1]]), fa = angOf([am[1][0] - am[0][0], am[1][1] - am[0][1]]);
      arm.push([clampAngle(-wrap(ua - T.delta) * sign / RAD, RANGE.shoulder[0], RANGE.shoulder[1]) * RAD,
                clampAngle(-wrap(fa - ua) * sign / RAD, RANGE.elbow[0], RANGE.elbow[1]) * RAD]);
    }
    return { fs: P.fs, hipX: P.hipX, hipY: P.hipY, phi: P.phi, headTilt: P.headTilt, rot: P.rot, twist: P.twist || 0, leg: leg, arm: arm };
  }
  /* forward kinematics: limb lengths are constant by construction */
  function forward(Q) {
    const T = torso(Q), sg = clamp(Q.fs * 4, -1, 1);       /* the bend side turns over smoothly while the figure turns round */
    const hip = T.hip, chest = T.chest;
    const neck = [chest[0] + T.tdir[0] * L.neck, chest[1] + T.tdir[1] * L.neck];
    const hdir = [-Q.fs * Math.sin(Q.phi + Q.headTilt), -Math.cos(Q.phi + Q.headTilt)];
    const head = [neck[0] + hdir[0] * L.head, neck[1] + hdir[1] * L.head];
    const knee = [], foot = [], elbow = [], hand = [];
    for (let i = 0; i < 2; i++) {
      const ta = T.delta - Q.leg[i][0] * sg, sa = ta + Q.leg[i][1] * sg;
      const kn = [hip[0] + L.thigh * Math.cos(ta), hip[1] + L.thigh * Math.sin(ta)];
      knee.push(kn); foot.push([kn[0] + L.shin * Math.cos(sa), kn[1] + L.shin * Math.sin(sa)]);
      const ua = T.delta - Q.arm[i][0] * sg, fa = ua - Q.arm[i][1] * sg;
      const el = [T.roots[i][0] + L.upperArm * Math.cos(ua), T.roots[i][1] + L.upperArm * Math.sin(ua)];
      elbow.push(el); hand.push([el[0] + L.foreArm * Math.cos(fa), el[1] + L.foreArm * Math.sin(fa)]);
    }
    const k = { head: head, neck: neck, chest: chest, shoulder: T.roots[0], shoulderB: T.roots[1], hip: hip, elbow: elbow, hand: hand, knee: knee, foot: foot };

    // ---- rotate the whole figure rigidly about the hip (the flip) ----
    if (Q.rot) {
      const cs = Math.cos(Q.rot), sn = Math.sin(Q.rot);
      const rot = function (p) { const dx = p[0] - hip[0], dy = p[1] - hip[1]; return [hip[0] + dx * cs - dy * sn, hip[1] + dx * sn + dy * cs]; };
      for (const key in k) k[key] = Array.isArray(k[key][0]) ? k[key].map(rot) : rot(k[key]);
    }

    // ---- ground clamp: never under the floor ----
    let maxY = -Infinity;
    for (const key in k) { if (Array.isArray(k[key][0])) k[key].forEach(function (p) { maxY = Math.max(maxY, p[1]); }); else maxY = Math.max(maxY, k[key][1] + (key === 'head' ? L.head : 0)); }   /* extents, not just centres (DEF-005) */
    const over = maxY - C.GY;
    if (over > 0) for (const key in k) { if (Array.isArray(k[key][0])) k[key].forEach(function (p) { p[1] -= over; }); else k[key][1] -= over; }
    return k;
  }
  /* solve target parameters into a skeleton (range-limited) */
  SF.solvePose = function (P) { return forward(jointAngles(P)); };
  /* the pure skeleton of a fighter right now (no smoothing): the target pose, solved */
  SF.skeleton = function (f, tm) { return forward(jointAngles(SF.poseParams(f, tm))); };

  /* ---------- layer 3: the animator (joint space) ---------- */
  const RATE = 40;                                        /* exponential smoothing, 1 / s */
  /* speed caps per parameter, in the order of toArr: fs (1/s), hipX, hipY (px/s), phi, headTilt, rot (rad/s), then
     per leg hip and knee, per arm shoulder and elbow (rad/s) */
  const CAPS = [8, 1200, 1200, 12, 12, 12, 400, 14, 20, 14, 20, 16, 22, 16, 22];
  const SPEED_LIMIT = 2300;                               /* end points (hands, feet, head) never move faster than this, px/s */
  function toArr(Q) { return [Q.fs, Q.hipX, Q.hipY, Q.phi, Q.headTilt, Q.rot, Q.twist, Q.leg[0][0], Q.leg[0][1], Q.leg[1][0], Q.leg[1][1], Q.arm[0][0], Q.arm[0][1], Q.arm[1][0], Q.arm[1][1]]; }
  function fromArr(a) { return { fs: a[0], hipX: a[1], hipY: a[2], phi: a[3], headTilt: a[4], rot: a[5], twist: a[6], leg: [[a[7], a[8]], [a[9], a[10]]], arm: [[a[11], a[12]], [a[13], a[14]]] }; }
  function smoothArr(cur, tgt, dt) {
    const k = 1 - Math.exp(-RATE * dt);
    return cur.map(function (c, i) { const m = CAPS[i] * dt; return c + clamp((tgt[i] - c) * k, -m, m); });
  }
  function mixArr(cur, next, u) { return cur.map(function (c, i) { return c + (next[i] - c) * u; }); }
  function endPoints(k) { return [k.hand[0], k.hand[1], k.foot[0], k.foot[1], k.head]; }
  function maxSpeed(a, b) {
    const pa = endPoints(a), pb = endPoints(b);
    let worst = 0;
    for (let i = 0; i < pa.length; i++) worst = Math.max(worst, Math.hypot(pa[i][0] - pb[i][0], pa[i][1] - pb[i][1]) * 60);
    return worst;
  }
  /* exposed for tests and tuning scripts only */
  SF.poseInternals = { jointAngles: jointAngles, forward: forward, toArr: toArr, fromArr: fromArr, smoothArr: smoothArr, maxSpeed: maxSpeed, SPEED_LIMIT: SPEED_LIMIT, RANGE: RANGE };

  SF.makeAnimator = function () {
    const s = { match: null, steps: -1, q: [], k: [], state: [] };
    return {
      /* call once after every simulation step */
      step: function (m) {
        if (s.match !== m || m.steps < s.steps) { s.match = m; s.q = m.f.map(function () { return null; }); s.k = m.f.map(function () { return null; }); s.state = m.f.map(function () { return ''; }); }
        s.steps = m.steps;
        for (let i = 0; i < m.f.length; i++) {
          const f = m.f[i], target = toArr(jointAngles(SF.poseParams(f, m.t)));
          if (!s.q[i]) { s.q[i] = target; s.k[i] = forward(fromArr(target)); s.state[i] = f.state; continue; }
          let cur = s.q[i];
          /* the end of a flip: the rotated upright body and the lying body are the same orientation, so hand over without a roll */
          if (s.state[i] === 'flipped' && f.state !== 'flipped') { cur = cur.slice(); cur[5] = 0; cur[3] = Math.PI / 2; }
          if (s.state[i] === 'getup' && f.state !== 'getup' && Math.abs(cur[5]) > 1e-6) { cur = cur.slice(); cur[5] = 0; }      /* after a roll: a whole turn is the upright body */
          let next = smoothArr(cur, target, C.DT), k = forward(fromArr(next));
          /* safety net on the end-point speed: bisect the size of the step (the joint-space caps already keep it low) */
          if (s.k[i] && maxSpeed(k, s.k[i]) > SPEED_LIMIT) {
            let lo = 0, hi = 1;
            for (let it = 0; it < 10; it++) {
              const mid = (lo + hi) / 2;
              if (maxSpeed(forward(fromArr(mixArr(cur, next, mid))), s.k[i]) <= SPEED_LIMIT) lo = mid; else hi = mid;
            }
            next = mixArr(cur, next, Math.max(lo, 0.03)); k = forward(fromArr(next));
          }
          s.q[i] = next; s.k[i] = k; s.state[i] = f.state;
        }
      },
      skeleton: function (m, i) { return (s.match === m && s.k[i]) ? s.k[i] : SF.skeleton(m.f[i], m.t); },
      /* the facing actually displayed (it turns over a quarter of a second, not instantly) */
      facing: function (m, i) { return (s.match === m && s.q[i]) ? s.q[i][0] : (m.f[i].face || 1); }
    };
  };
})();

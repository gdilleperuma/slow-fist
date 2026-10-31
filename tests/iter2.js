'use strict';
// Iteration 2 tests: gaps found while comparing with v1. Registered into the main runner (tests/run.js).
module.exports = function (X) {
  const { test, eq, near, ok, pair, run, evs, hit, fighter, checkSkeleton, SF, C, NONE } = X;

  test('MOV-05', 'sprint: two taps of a direction within 0.25 s start a 0.5 s burst, top speed x1.45, costs 6', () => {
    const far = () => { const m = pair(0, 1); m.f[0].x = 150; m.f[1].x = 800; return m; };
    let m = far(); const f = m.f[0], sta0 = f.sta;
    run(m, 1, { right: true }); run(m, 2, NONE); run(m, 1, { right: true });
    ok(f.sprintT > 0.4 && f.sprintT <= 0.5 + 1e-9, 'sprint started: ' + f.sprintT);
    ok(sta0 - f.sta >= 5.9, 'cost 6 stamina, got ' + (sta0 - f.sta));
    run(m, 28, { right: true });
    ok(f.vx > C.MAXV * f.style.mv + 10, 'faster than walking: ' + f.vx);
    ok(f.vx <= C.MAXV * f.style.mv * 1.45 + 1e-6, 'capped at x1.45: ' + f.vx);
    m = far(); run(m, 1, { right: true }); run(m, 25, NONE); run(m, 1, { right: true });
    eq(m.f[0].sprintT, 0, 'taps more than 0.25 s apart do not sprint');
    m = far(); m.f[0].sta = 5; run(m, 1, { right: true }); run(m, 2, NONE); run(m, 1, { right: true });
    eq(m.f[0].sprintT, 0, 'refused at low stamina');
    m = far(); run(m, 1, { left: true }); run(m, 2, NONE); run(m, 1, { right: true });
    eq(m.f[0].sprintT, 0, 'different directions do not sprint');
  });

  test('MOV-06', 'a held jump goes higher than a tapped one (variable jump)', () => {
    const peak = held => {
      const m = pair(); let max = 0;
      for (let i = 0; i < 90; i++) { SF.step(m, [{ jump: held ? true : i < 1 }, NONE]); max = Math.max(max, m.f[0].h); }
      return max;
    };
    const tapped = peak(false), held = peak(true);
    ok(held > tapped + 10, 'held ' + held.toFixed(1) + ' vs tapped ' + tapped.toFixed(1));
  });

  test('MOV-07', 'jump springs: crouch for 0.07 s, then launch; stamina is spent on the press', () => {
    const m = pair(); const f = m.f[0], sta0 = f.sta;
    run(m, 1, { jump: true });
    ok(f.jumpPre > 0 && !f.air, 'crouching first');
    ok(sta0 - f.sta >= 7.9, 'spent 8 stamina on press');
    const sk = SF.skeleton(f);
    ok(sk.hip[1] > C.GY - C.HIP_H + 6, 'the pose sinks during the spring');
    run(m, 6, NONE);
    ok(f.air || f.h > 0, 'launched after the spring');
  });

  test('CMB-08', 'a leg hit on a fast-moving grounded target is a TRIP (stagger 0.9 s)', () => {
    const m = pair(); m.f[1].vx = 150;
    const h = hit(m, 'low', -20, 1, 'kick');
    eq(h.zone, 'LEGS');
    ok(evs(m, 'trip').length === 1, 'trip event');
    near(m.f[1].stagDur, 0.9, 1e-9, 'stagger 0.9');
    const m2 = pair(); m2.f[1].vx = 50; hit(m2, 'low', -20, 1, 'kick');
    ok(evs(m2, 'trip').length === 0, 'slow target does not trip');
  });

  test('BAL-01', 'balance shifts forward when advancing, back when retreating or loading; stays in [-1, 1]', () => {
    let m = pair(0, 1); m.f[0].x = 150; m.f[1].x = 800; run(m, 25, { right: true });
    ok(m.f[0].bal > 0.04, 'forward ' + m.f[0].bal);
    m = pair(0, 1); m.f[0].x = 400; m.f[1].x = 800; run(m, 25, { left: true });
    ok(m.f[0].bal < -0.04, 'back ' + m.f[0].bal);
    m = pair(0, 1); run(m, 30, { punch: true });
    ok(m.f[0].state === 'charge' && m.f[0].bal < -0.04, 'loading sits back ' + m.f[0].bal);
    for (let s = 1; s <= 20; s++) {
      const mm = SF.createMatch({ seed: 700 + s, styles: [s % 3, (s + 1) % 3], ai: [true, true] });
      for (let i = 0; i < 1500 && mm.winner === null; i++) {
        SF.stepAI(mm);
        for (const f of mm.f) ok(f.bal >= -1 && f.bal <= 1, 'bal ' + f.bal);
      }
    }
  });

  test('ANI-01', 'spin kick turns the body through 360 degrees (horizontal scale 1, 0, -1, 0, 1)', () => {
    const f = fighter(1, { state: 'strike', limb: 'kick', face: 1 });
    f.str = { limb: 'kick', kind: 'spin', a: 0, s: 1, dur: 0.4, hit: false };
    const at = u => { f.t = u * 0.4; return SF.spinScale(f); };
    near(at(0), 1, 1e-6); near(at(0.25), 0, 1e-6); near(at(0.5), -1, 1e-6); near(at(0.75), 0, 1e-6); near(at(1), 1, 1e-6);
    f.str.kind = 'straight'; eq(SF.spinScale(f), 1);
    f.state = 'idle'; f.str.kind = 'spin'; eq(SF.spinScale(f), 1);
  });

  test('ANI-02', 'victory poses differ by style and obey the invariants', () => {
    const sigs = [];
    for (const st of [0, 1, 2]) {
      const f = fighter(st, { state: 'idle', win: true });
      const k = checkSkeleton(f, 'victory ' + C.STYLES[st].name);
      sigs.push(JSON.stringify([k.hand, k.foot, k.elbow].map(a => a.map(p => p.map(Math.round)))));
      if (st === 0) ok(k.hand[0][1] < k.chest[1] - 20, 'Boxer fists above the shoulder');
      if (st === 1) ok(k.foot[0][1] < k.hip[1] + 5, 'Kicker holds the kick high');
      if (st === 2) ok(Math.abs(k.elbow[0][0] - k.chest[0]) > 20 && Math.abs(k.elbow[1][0] - k.chest[0]) > 20, 'Grappler elbows out');
    }
    ok(sigs[0] !== sigs[1] && sigs[1] !== sigs[2] && sigs[0] !== sigs[2], 'three different poses');
    const m = pair(0, 0); m.f[1].hp = 1; hit(m, 'straight', 10, 2, 'punch');
    ok(m.f[0].win === true && m.f[1].win === false, 'win flag set for the winner only');
  });

  test('ANI-03', 'hit reactions depend on the zone: body doubles over, head snaps back, legs buckle', () => {
    const pose = zone => {
      const f = fighter(0, { state: 'stagger', zone: zone, face: 1 }); f.t = 0.1; f.stagDur = 0.5;
      return checkSkeleton(f, 'stagger ' + zone);
    };
    const body = pose('BODY'), head = pose('HEAD'), legs = pose('LEGS'), none = pose(null);
    ok(body.chest[0] - body.hip[0] > 20, 'body hit: torso bent forward ' + (body.chest[0] - body.hip[0]));
    ok(head.chest[0] - head.hip[0] < -8, 'head hit: leans back ' + (head.chest[0] - head.hip[0]));
    ok(legs.hip[1] > none.hip[1] + 10, 'leg hit: hips drop ' + (legs.hip[1] - none.hip[1]));
    const m = pair(); hit(m, 'straight', 0, 1, 'punch');
    eq(m.f[1].zone, 'BODY', 'impact records the zone');
  });

  test('ANI-04', 'stand-up is a smooth sequence and keeps every invariant', () => {
    let prev = -1e9, midOk = false;
    for (let i = 0; i <= 17; i++) {
      const f = fighter(0, { state: 'getup' }); f.t = Math.min(C.GETUP_T - 1e-6, i * 0.05);
      const k = checkSkeleton(f, 'getup t=' + f.t.toFixed(2));
      const rise = C.GY - k.hip[1];
      ok(rise >= prev - 0.5, 'hip height must not drop during the stand-up: ' + prev.toFixed(1) + ' -> ' + rise.toFixed(1));
      prev = rise;
      if (f.t > 0.3 && f.t < 0.55 && rise > 20 && rise < 55 && Math.max(k.knee[0][1], k.knee[1][1]) > C.GY - 30) midOk = true;
    }
    ok(midOk, 'a kneeling stage exists (low hips, a knee near the floor)');
    ok(prev >= C.HIP_H - 6, 'ends standing: hip height ' + prev.toFixed(1));
  });

  test('KO-02', 'after a K.O. the loser falls and lies on the floor; the winner holds the victory pose (DEF-010)', () => {
    const m = pair(0, 1); m.f[1].hp = 1; hit(m, 'straight', 10, 2, 'punch');
    const loser = m.f[1], winner = m.f[0], h0 = SF.stateHash(m);
    eq(loser.state, 'down'); ok(loser.ko, 'loser flagged'); ok(winner.win, 'winner flagged');
    eq(loser.flash, 0, 'no hit flash is left frozen on the loser (DEF-010, second instance)');
    eq(winner.flash, 0, 'no flash on the winner');
    const k0 = SF.skeleton(loser);
    for (let s = 0; s < 40; s++) SF.step(m, [NONE, NONE]);
    eq(SF.stateHash(m), h0, 'the match stays frozen while the loser falls');
    const k = checkSkeleton(loser, 'KO loser');
    const gap = C.GY - (k.head[1] + C.LIMB.head);
    ok(gap >= -1 && gap <= 3, 'loser head rests on the floor after the fall: ' + gap.toFixed(1));
    ok(k.head[1] > k0.head[1] + 40, 'the loser actually fell: head moved from y ' + k0.head[1].toFixed(0) + ' to ' + k.head[1].toFixed(0));
    checkSkeleton(winner, 'KO winner');
  });

  test('FLR-07', 'knees and elbows bend only the anatomical way in every state, kick angle and facing (DEF-013)', () => {
    /* flexion sign: cross(upper, lower) x facing. Knee: must be >= 0 (the shin folds backward). Elbow: must be <= 0. */
    const flex = (a, b, c) => {
      const t = [b[0] - a[0], b[1] - a[1]], s = [c[0] - b[0], c[1] - b[1]];
      return (t[0] * s[1] - t[1] * s[0]) / (Math.hypot(t[0], t[1]) * Math.hypot(s[0], s[1]));
    };
    let checked = 0;
    const check = (f, tag) => {
      const k = SF.skeleton(f, 0.3);
      for (const leg of [0, 1]) {
        const v = flex(k.hip, k.knee[leg], k.foot[leg]) * f.face; checked++;
        ok(v >= -0.05, 'knee ' + leg + ' hyperextended (' + v.toFixed(2) + ') in ' + tag);
      }
      for (const arm of [0, 1]) {
        const v = flex([k.shoulder, k.shoulderB][arm], k.elbow[arm], k.hand[arm]) * f.face; checked++;
        ok(v <= 0.05, 'elbow ' + arm + ' hyperextended (' + v.toFixed(2) + ') in ' + tag);
      }
    };
    for (const face of [1, -1]) for (const style of [0, 1, 2]) {
      for (const limb of ['kick', 'punch']) for (const ang of [-25, -15, 0, 10, 20, 35, 45, 60]) for (const phase of ['strike', 'recover']) for (let u = 0; u <= 10; u++) {
        const f = fighter(style, { face: face, limb: limb });
        f.str = { limb: limb, kind: 'straight', a: ang, s: 1, dur: 0.4, hit: false };
        if (phase === 'strike') { f.state = 'strike'; f.t = (u / 10) * 0.55 * 0.4; } else { f.state = 'recover'; f.rec = 0.5; f.t = (u / 10) * 0.5; }
        check(f, limb + ' ' + phase + ' angle ' + ang + ' u ' + u + ' face ' + face);
      }
      for (const st of C.STATES) for (const cr of [0, 1]) {
        const f = fighter(style, { face: face, state: st, cr: cr, drop: 32 * cr, t: 0.3 });
        f.stagDur = 0.5; f.rec = 0.5;
        check(f, st + ' cr ' + cr + ' face ' + face);
      }
      for (const zone of ['BODY', 'HEAD', 'LEGS']) { const f = fighter(style, { face: face, state: 'stagger', zone: zone }); f.t = 0.1; f.stagDur = 0.5; check(f, 'stagger ' + zone); }
      for (let i = 0; i <= 34; i++) { const f = fighter(style, { face: face, state: 'getup' }); f.t = Math.min(C.GETUP_T - 1e-6, i * 0.025); check(f, 'getup t ' + f.t.toFixed(3)); }
      { const f = fighter(style, { face: face, state: 'idle', win: true }); check(f, 'victory'); }
      { const f = fighter(style, { face: face, state: 'idle', jumpPre: 0.05 }); check(f, 'jump spring'); }
      { const f = fighter(style, { face: face, state: 'idle', air: true, h: 60 }); check(f, 'air'); }
      for (let r = 0; r <= 63; r += 3) { const f = fighter(style, { face: face, state: 'flipped', h: 50 }); f.rot = -r / 10; check(f, 'flipped rot ' + (-r / 10)); }
    }
    ok(checked > 3000, 'the sweep covered ' + checked + ' limb checks');
  });

  test('LINT-04', 'the lint scanner flags what it should and ignores comments and strings (DEF-009)', () => {
    const r = require('./lint.js').selfTest();
    if (r.length) throw new Error(r.join(' | '));
  });

  test('ANI-05', 'no joint jumps between samples during the stand-up (continuity)', () => {
    let prev = null, worst = 0, where = '';
    for (let i = 0; i <= 34; i++) {
      const f = fighter(0, { state: 'getup' }); f.t = Math.min(C.GETUP_T - 1e-6, i * 0.025);
      const k = SF.skeleton(f), pts = [];
      for (const n in k) (Array.isArray(k[n][0]) ? k[n] : [k[n]]).forEach((p, j) => pts.push([n + j, p]));
      if (prev) pts.forEach((q, idx) => { const d = Math.hypot(q[1][0] - prev[idx][1][0], q[1][1] - prev[idx][1][1]); if (d > worst) { worst = d; where = q[0] + ' at t=' + f.t.toFixed(3); } });
      prev = pts;
    }
    ok(worst <= 22, 'a joint moved ' + worst.toFixed(1) + ' px in 0.025 s (' + where + ')');
  });

  test('SND-01', 'events map to named sounds', () => {
    const plan = ev => SF.soundPlan(ev);
    const cases = [
      [{ k: 'hit', tag: 'HIT' }, 'hit'], [{ k: 'hit', tag: 'BLOCK' }, 'block'], [{ k: 'hit', tag: 'PARTIAL' }, 'block'], [{ k: 'hit', tag: 'PARRY' }, 'parry'],
      [{ k: 'knockdown' }, 'thud'], [{ k: 'trip' }, 'thud'], [{ k: 'throw' }, 'slam'], [{ k: 'grapple' }, 'grab'],
      [{ k: 'whiff' }, 'swoosh'], [{ k: 'dodge' }, 'swoosh'], [{ k: 'guardBreak' }, 'break'], [{ k: 'ko' }, 'ko']
    ];
    for (const c of cases) {
      const r = plan([c[0]]);
      eq(r.length, 1, JSON.stringify(c[0])); eq(r[0], c[1], JSON.stringify(c[0]));
      ok(SF.SOUND_NAMES.indexOf(r[0]) >= 0, 'known sound');
    }
    eq(plan([{ k: 'unknown' }]).length, 0, 'unknown events are silent');
    eq(plan([]).length, 0);
  });

  test('HELP-01', 'the built page carries a written guide', () => {
    const html = require('fs').readFileSync(require('path').join(__dirname, '..', 'index.html'), 'utf8');
    for (const needle of ['id="guide"', 'Player 1', 'Player 2', 'Numpad', 'Sprint', 'Parry', 'Balance']) ok(html.indexOf(needle) >= 0, 'guide lacks: ' + needle);
  });
};

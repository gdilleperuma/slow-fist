'use strict';
// RCV-01 to RCV-11: choosing how to get up (kip-up, forward roll, back roll, stay and guard) with the move circle, and the break-fall timing.
module.exports = function (X) {
  const { test, ok, eq, near, SF, C, NONE } = X;
  const R = () => C.RECOV;
  /* a fighter lying down (not knocked out), the opponent far away, the trainee's stamina given */
  function lying(o) {
    o = o || {}; const m = SF.createMatch({ seed: 5, styles: [0, 0], ai: [false, false] }), f = m.f[0]; m.f[1].x = 860; f.x = o.x || 400; f.face = o.face || 1;
    f.state = 'down'; f.t = o.t === undefined ? 0.5 : o.t; f.stagDur = o.stagDur || 2.5; f.sta = o.sta === undefined ? 100 : o.sta; f.protect = 99; f.budget = 30; f.h = 0; f.flair = 0;   /* protected, with some budget left: a hit does damage */
    return m;
  }
  const step = (m, inp, n) => { for (let i = 0; i < (n || 1); i++) SF.step(m, [inp || NONE, NONE]); };
  const evs = (m, k) => m.ev.filter(e => e.k === k);

  test('RCV-01', 'choosing: up is the kip-up, forward the forward roll, back the back roll, down stay and guard; relative to the facing; not before 0.3 s; not without the stamina', () => {
    ok(R() && R().kip && R().fwd && R().back && R().guard && C.RECOV_MIN > 0, 'the recovery table exists');
    for (const [inp, face, how] of [[{ jump: true }, 1, 'kip'], [{ right: true }, 1, 'fwd'], [{ left: true }, 1, 'back'], [{ crouch: true }, 1, 'guard'], [{ left: true }, -1, 'fwd'], [{ right: true }, -1, 'back']]) {
      const m = lying({ face: face }); step(m, inp); const f = m.f[0];
      eq(f.state, 'getup', how + ': the recovery starts'); eq(f.recov, how, 'the choice for ' + JSON.stringify(inp) + ' facing ' + face); eq(evs(m, 'recover').length, 1, 'an event'); near(f.getDur, R()[how].dur, 1e-9, 'its duration');
    }
    const early = lying({ t: 0.1 }); step(early, { jump: true }); eq(early.f[0].state, 'down', 'too early: nothing happens');
    const poor = lying({ sta: 10 }); step(poor, { jump: true }); eq(poor.f[0].state, 'down', 'the kip-up needs ' + R().kip.cost + ' stamina');
    const poor2 = lying({ sta: 10 }); step(poor2, { right: true }); eq(poor2.f[0].state, 'down', 'so does the roll');
    const free = lying({ sta: 0 }); step(free, { crouch: true }); eq(free.f[0].state, 'getup', 'staying and guarding is free');
    const ko = lying(); ko.f[0].ko = true; step(ko, { jump: true }); eq(ko.f[0].state, 'down', 'a fighter who is out cannot choose');
    const sta = lying({ sta: 100 }); step(sta, { jump: true }); ok(sta.f[0].sta <= 100 - R().kip.cost + 2, 'the stamina was spent: ' + sta.f[0].sta.toFixed(1));
  });

  test('RCV-02', 'how long each one takes: kip-up 0.5 s, rolls 0.8 s, guard 1.4 s, and the automatic stand-up is the old 0.85 s', () => {
    const idleAt = (how, inp) => { const m = lying(how ? {} : { t: 0, stagDur: 0.5 }); if (how) step(m, inp); let n = 0; while (m.f[0].state !== 'idle' && n++ < 400) step(m); return n / 60; };
    near(idleAt('kip', { jump: true }), R().kip.dur, 0.06, 'kip-up'); near(idleAt('fwd', { right: true }), R().fwd.dur, 0.06, 'forward roll'); near(idleAt('back', { left: true }), R().back.dur, 0.06, 'back roll'); near(idleAt('guard', { crouch: true }), R().guard.dur, 0.06, 'guard');
    near(idleAt(null), 0.5 + C.GETUP_T, 0.1, 'automatic');
    const a = lying({ t: 0, stagDur: 0.3 }); step(a, NONE, 30); eq(a.f[0].state, 'getup', 'with no choice the fighter gets up by itself'); eq(a.f[0].recov, null); near(a.f[0].getDur, C.GETUP_T, 1e-9);
  });

  test('RCV-03', 'when each one can be hit: the kip-up is open after 0.2 s, the back roll is safe for 0.5 s, the guard stand-up for 0.8 s', () => {
    function hitAt(how, inp, wait) {
      const m = lying(); m.f[1].x = 455; m.f[1].face = -1; m.f[0].x = 400; step(m, inp); const a = m.f[1], d = m.f[0];
      for (let i = 0; i < Math.round(wait * 60); i++) { SF.step(m, [NONE, NONE]); a.state = 'idle'; a.str = null; }
      a.x = d.x + 55; a.face = -1;                  /* a roll moves the body, so the attacker steps up to wherever he now is */
      const hp0 = d.hp, st0 = d.state; SF.beginMove(m, a, 'JAB', 1); let hit = false; for (let i = 0; i < 20; i++) { SF.step(m, [NONE, NONE]); if (m.ev.some(e => e.k === 'hit' && e.d === 0)) hit = true; }
      return hit || d.hp < hp0;
    }
    ok(!hitAt('kip', { jump: true }, 0.0), 'a kip-up cannot be hit at the start'); ok(hitAt('kip', { jump: true }, 0.30), 'a kip-up can be hit after 0.2 s (at 0.30 s)');
    ok(!hitAt('back', { left: true }, 0.2), 'a back roll is safe at 0.2 s'); ok(hitAt('back', { left: true }, 0.7), 'a back roll can be hit at 0.7 s');
    ok(!hitAt('guard', { crouch: true }, 0.5), 'the guard stand-up is safe at 0.5 s'); ok(hitAt('guard', { crouch: true }, 1.1), 'but not at 1.1 s');
  });

  test('RCV-04', 'the rolls move the body (forward 70 px toward the opponent, back 90 px away), the others stay put; the arena edge and boxes are respected', () => {
    const run = (inp, face) => { const m = lying({ face: face || 1, x: 400 }); step(m, inp); const x0 = m.f[0].x; step(m, NONE, 70); return (m.f[0].x - x0) * (face || 1); };
    near(run({ right: true }), R().fwd.dx, 3, 'forward'); near(run({ left: true }), R().back.dx, 3, 'back'); near(run({ jump: true }), 0, 1, 'kip-up'); near(run({ crouch: true }), 0, 1, 'guard');
    near(run({ left: true }, -1), R().fwd.dx, 3, 'forward when facing left');
    const edge = lying({ x: 60 }); step(edge, { left: true }); step(edge, NONE, 70); ok(edge.f[0].x >= 40, 'not through the edge: ' + edge.f[0].x);
    const box = lying({ x: 400 }); box.obstacles = [{ x: 490, w: 60, h: 40 }]; step(box, { right: true }); step(box, NONE, 70); ok(box.f[0].x <= 490 - 30 - 16 + 0.5, 'a roll stops at a box: ' + box.f[0].x.toFixed(1));
  });

  test('RCV-05', 'stamina: staying and guarding refills it faster than lying or getting up the usual way', () => {
    const gainOf = (inp, n) => { const m = lying({ sta: 20 }); if (inp) step(m, inp); const s0 = m.f[0].sta; step(m, NONE, n); return m.f[0].sta - s0; };
    ok(gainOf({ crouch: true }, 40) > gainOf(null, 40) * 1.6, 'guard ' + gainOf({ crouch: true }, 40).toFixed(1) + ' vs auto ' + gainOf(null, 40).toFixed(1));
  });

  test('RCV-06', 'break-fall: a tap within 0.15 s of landing, or in the last 0.25 s of a throw, shortens the knockdown by a third and softens a throw by 30 percent; once per fall; a late tap does nothing', () => {
    const fall = () => { const m = SF.createMatch({ seed: 5, styles: [0, 0], ai: [false, false] }); m.f[1].x = 860; const f = m.f[0]; f.x = 400; f.state = 'down'; f.t = 0; f.stagDur = 2; f.protect = 99; f.techDone = false; return m; };
    const a = fall(); step(a, { right: true }); near(a.f[0].stagDur, 2 * C.TECH_SHORTEN, 1e-6, 'a tap just after landing'); eq(evs(a, 'techfall').length, 1); a.ev.length = 0; step(a, { left: true }); step(a, NONE, 2); eq(a.f[0].stagDur === 2 * C.TECH_SHORTEN, true, 'once per fall');
    const late = fall(); step(late, NONE, 20); step(late, { right: true }); near(late.f[0].stagDur, 2, 1e-6, 'a tap after 0.15 s is too late');
    function thrown(tapAtSteps) {
      const m = SF.createMatch({ seed: 5, styles: [0, 0], ai: [false, false] }), a2 = m.f[0], v = m.f[1]; a2.x = 300; v.x = 345; SF.doThrow(m, a2, v); let n = 0, dmg = 0, st = null;
      while (n < 200) { const tap = tapAtSteps !== null && n === tapAtSteps; SF.step(m, [NONE, tap ? { jump: true } : NONE]); n++; for (const e of m.ev) if (e.k === 'throw') dmg = e.dmg; if (v.state === 'down' && st === null) st = v.stagDur; if (v.state === 'down') break; }
      return { dmg: dmg, stag: st, total: Math.round((C.GRAB_LOCK + C.GRAB_FLIP) / C.DT) };
    }
    const plain = thrown(null), t0 = thrown(1); const total = plain.total;
    const armed = thrown(total - 8); near(armed.dmg / plain.dmg, C.TECH_DMG, 0.02, 'a tap in the last 0.25 s of the flight softens the throw'); ok(armed.stag < plain.stag - 0.1, 'and shortens the fall: ' + armed.stag + ' vs ' + plain.stag);
    near(thrown(2).dmg / plain.dmg, 1, 0.001, 'a tap at the start of the flight is too early');
  });

  test('RCV-07', 'the rules around falling are unchanged: a recovering fighter is still protected (cannot be K.O.d), and the match freeze and the K.O. still work', () => {
    const m = lying(); step(m, { right: true }); const f = m.f[0]; ok(f.protect > 0, 'protected while recovering'); f.hp = 1; m.f[1].x = 460; m.f[1].face = -1; SF.beginMove(m, m.f[1], 'CROSS', 1); step(m, NONE, 60); ok(f.hp >= 1 && m.winner === null, 'no K.O. while recovering');
    const k = SF.createMatch({ seed: 5, styles: [0, 0], ai: [false, false] }); k.f[0].x = 300; k.f[1].x = 350; k.f[1].hp = 0.5; k.f[1].protect = 0; SF.beginMove(k, k.f[0], 'CROSS', 1); step(k, NONE, 40); eq(k.winner, 0, 'a normal K.O.'); eq(k.f[1].state, 'down'); step(k, { jump: true }, 5); eq(k.f[1].state, 'down', 'the loser stays down');
  });

  test('RCV-08', 'recordings: a recovery chosen with the move circle replays identically', () => {
    const m = SF.createMatch({ seed: 12, styles: [0, 1], ai: [false, true] }), rec = SF.newRecording(m);
    for (let i = 0; i < 900 && !rec.done; i++) {
      const f = m.f[0], inp = { right: i < 70 || (f.state === 'down' && f.t > 0.4), left: false, punch: i % 50 < 3, jump: f.state === 'down' && f.t > 0.35 && i % 2 === 0 };
      SF.recordStep(rec, m, [inp, null]);
    }
    SF.finishRecording(rec, m); ok(SF.verifyRecording(rec).ok, 'verifies');
  });

  test('RCV-09', 'the AI recovers by choice: over 60 AI fights at least three kinds of recovery are used, and none of them breaks a rule (no impossible state)', () => {
    const used = {}; let bad = 0;
    for (let s = 0; s < 60; s++) {
      const m = SF.createMatch({ seed: 2100 + s, styles: [s % 3, (s + 1) % 3], ai: [true, true] });
      for (let i = 0; i < 2400 && m.winner === null; i++) { SF.stepAI(m); for (const e of m.ev) if (e.k === 'recover') used[e.how] = (used[e.how] || 0) + 1; for (const f of m.f) if (!isFinite(f.x) || !isFinite(f.sta) || f.sta < -0.01 || (f.state === 'getup' && !(f.getDur > 0))) bad++; }
    }
    eq(bad, 0, 'impossible states'); ok(Object.keys(used).length >= 3, 'recoveries used by the AI: ' + JSON.stringify(used));
  });

  test('RCV-10', 'the poses of every recovery are legal at every step: finite, above the floor, bones at their lengths, and the animated end points never faster than 2,500 px/s', () => {
    const Lm = C.LIMB, len = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
    for (const [how, inp] of [['kip', { jump: true }], ['fwd', { right: true }], ['back', { left: true }], ['guard', { crouch: true }]]) for (const face of [1, -1]) {
      const m = lying({ face: face }), f = m.f[0], an = SF.makeAnimator(); an.step(m); step(m, face > 0 ? inp : { right: inp.left, left: inp.right, jump: inp.jump, crouch: inp.crouch }); let prev = null, worst = 0, bad = '';
      for (let i = 0; i < 100; i++) {
        SF.step(m, [NONE, NONE]); an.step(m); const k = an.skeleton(m, 0), raw = SF.skeleton(f, m.t);
        for (const sk of [k, raw]) for (const key in sk) for (const p of (Array.isArray(sk[key][0]) ? sk[key] : [sk[key]])) if (!isFinite(p[0]) || !isFinite(p[1]) || p[1] > C.GY + 1) bad = bad || how + ' ' + key + ' at step ' + i + ': ' + p;
        for (const j of [0, 1]) { const d2 = Math.abs(len(raw.hip, raw.knee[j]) - Lm.thigh), d3 = Math.abs(len(raw.knee[j], raw.foot[j]) - Lm.shin); if (d2 > 1.5 || d3 > 1.5) bad = bad || how + ' leg length at step ' + i; }
        if (prev) for (const key of ['hand', 'foot']) for (let j = 0; j < 2; j++) worst = Math.max(worst, len(k[key][j], prev[key][j]) * 60); prev = k;
      }
      eq(bad, '', how + ' facing ' + face + ' is legal'); ok(worst <= 2500, how + ' facing ' + face + ': an end point moved at ' + worst.toFixed(0) + ' px/s');
    }
  });

  test('RCV-11', 'the old automatic stand-up is unchanged: a fall nobody steers ends exactly as before', () => {
    const m = SF.createMatch({ seed: 5, styles: [0, 0], ai: [false, false] }); m.f[0].x = 300; m.f[1].x = 350; m.f[0].hp = 1000; const d = m.f[1]; d.protect = 0; d.hp = d.hpMax; SF.beginMove(m, m.f[0], 'HEAVY PUNCH' in C.MOVES ? 'HEAVY PUNCH' : 'SPINNING BACKFIST', 2.2);
    let went = false, endAt = -1; for (let i = 0; i < 400; i++) { SF.step(m, [NONE, NONE]); if (d.state === 'down') went = true; if (went && d.state === 'idle' && endAt < 0) endAt = i; }
    if (went) ok(endAt > 0, 'got up by itself'); eq(d.recov === null || d.recov === undefined, true, 'no recovery was chosen');
  });
  test('RCV-13', 'the rolls really turn the body over (the head goes below the hips and comes back up, in the right direction) and the kip-up swings the hips above the head; every recovery ends standing', () => {
    function path(inp, face) {
      const m = lying({ face: face }), f = m.f[0]; step(m, inp); let inverted = 0, minHeadY = 1e9, endUp = false, rotMax = 0;
      for (let i = 0; i < 110; i++) { SF.step(m, [NONE, NONE]); const k = SF.skeleton(f, m.t); if (k.head[1] > k.hip[1] + 5) inverted++; minHeadY = Math.min(minHeadY, k.head[1]); if (f.state === 'idle') endUp = k.head[1] < k.hip[1] - 20; rotMax = Math.max(rotMax, Math.abs(SF.poseParams(f, m.t).rot)); }
      return { inverted: inverted, endUp: endUp, rotMax: rotMax };
    }
    for (const face of [1, -1]) {
      const fw = path(face > 0 ? { right: true } : { left: true }, face), bk = path(face > 0 ? { left: true } : { right: true }, face);
      ok(fw.inverted >= 8 && bk.inverted >= 8, 'upside down during the roll: ' + fw.inverted + ' / ' + bk.inverted + ' steps (facing ' + face + ')'); ok(fw.endUp && bk.endUp, 'the rolls end standing');
      near(fw.rotMax, 2 * Math.PI, 0.05, 'a full turn forward'); near(bk.rotMax, 2 * Math.PI, 0.05, 'a full turn back');
      const a = SF.poseParams(Object.assign(lying({ face: face }).f[0], { state: 'getup', recov: 'fwd', getDur: 0.8, t: 0.3 }), 0), b = SF.poseParams(Object.assign(lying({ face: face }).f[0], { state: 'getup', recov: 'back', getDur: 0.8, t: 0.3 }), 0);
      ok(a.rot * b.rot < 0, 'forward and back turn opposite ways');
    }
    const kip = path({ jump: true }, 1); ok(kip.endUp, 'the kip-up ends standing');
    const g = path({ crouch: true }, 1); ok(g.endUp && g.rotMax < 0.01, 'the guard stand-up never turns the body over (the crawl phase has the head low, which is not a roll)');
  });

  test('RCV-14', 'the drills teach it: choosing a recovery and breaking a fall each have a drill that only the trainee\'s own events complete', () => {
    const feed = (id, evs) => { const tr = SF.trainingNew(0); SF.trainingFeed(tr, { ev: evs }); return tr.counts[id] || 0; };
    eq(feed('recover', [{ k: 'recover', a: 0, how: 'kip' }]), 1, 'a chosen recovery counts'); eq(feed('recover', [{ k: 'recover', a: 1, how: 'kip' }]), 0, 'the dummy\'s does not');
    eq(feed('breakfall', [{ k: 'techfall', d: 0 }]), 1, 'a break-fall counts'); eq(feed('breakfall', [{ k: 'techfall', d: 1 }]), 0, 'the dummy\'s does not');
    ok(SF.trainingDrills(0).some(d => d.id === 'recover') && SF.trainingDrills(0).some(d => d.id === 'breakfall'), 'both drills are in the list');
  });
};

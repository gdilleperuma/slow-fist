'use strict';
// FLASH-01 to FLASH-05: flashy new moves (superman punch, butterfly kick, tornado kick, axe kick, spinning backfist) and a flashier flying kick.
module.exports = function (X) {
  const { test, ok, eq, SF, C, NONE } = X;
  const NEW = ['SUPERMAN PUNCH', 'BUTTERFLY KICK', 'TORNADO KICK', 'AXE KICK', 'SPINNING BACKFIST', 'FLYING SIDE KICK'];
  const fighter = (o) => { const m = SF.createMatch({ seed: 5, styles: [o.style || 0, 0], ai: [false, false] }), f = m.f[0]; f.limb = o.limb; f.charge = o.charge || 0; f.aim = o.aim || 0; f.air = !!o.air; f.cr = 0; f.vx = 0; return f; };

  test('FLASH-01', 'the move table has the new moves with the right limb and air flag, a look of their own, and the old duplicates are gone', () => {
    const M = C.MOVES;
    for (const [n, limb, air] of [['SUPERMAN PUNCH', 'punch', true], ['BUTTERFLY KICK', 'kick', true], ['TORNADO KICK', 'kick', true], ['AXE KICK', 'kick', false], ['SPINNING BACKFIST', 'punch', false], ['FLYING SIDE KICK', 'kick', true]]) { ok(M[n], n + ' exists'); eq(M[n].limb, limb, n + ' limb'); eq(!!M[n].air, air, n + ' air'); ok(M[n].look, n + ' has a look'); ok(M[n].fr && M[n].fr[0] > 0, n + ' has frame data'); }
    for (const gone of ['HEAVY KICK', 'HEAVY PUNCH', 'JUMP PUNCH']) ok(!M[gone], gone + ' was replaced');
    const looks = Object.keys(M).map(k => M[k].look).filter(Boolean); eq(new Set(looks).size, looks.length, 'every look is used by one move only: ' + looks.join(','));
  });

  test('FLASH-02', 'how each move is chosen: a long hold gives the backfist or the axe kick (the spinning kick for the Kicker); in the air a tap is the flying kick, aim up the butterfly kick, a long hold the tornado kick, a punch the superman punch', () => {
    const P = (o) => SF.pickMove(fighter(Object.assign({ limb: 'punch' }, o))).name, K = (o, style) => SF.pickMove(fighter(Object.assign({ limb: 'kick', style: style || 0 }, o))).name;
    eq(P({ charge: 0.6 }), 'SPINNING BACKFIST'); eq(P({ charge: 0 }), 'JAB'); eq(P({ charge: 0.1 }), 'CROSS'); eq(P({ charge: 0.25 }), 'HOOK');
    eq(K({ charge: 0.6 }, 0), 'AXE KICK'); eq(K({ charge: 0.6 }, 2), 'AXE KICK'); eq(K({ charge: 0.6 }, 1), 'SPINNING KICK', 'the Kicker keeps the spinning kick'); eq(K({ charge: 0.25 }), 'ROUNDHOUSE'); eq(K({ charge: 0 }), 'FRONT KICK');
    eq(P({ air: true }), 'SUPERMAN PUNCH'); eq(P({ air: true, aim: 40 }), 'LEAPING UPPERCUT');
    eq(K({ air: true }), 'FLYING SIDE KICK'); eq(K({ air: true, aim: 30 }), 'BUTTERFLY KICK'); eq(K({ air: true, charge: 0.4 }), 'TORNADO KICK'); eq(K({ air: true, charge: 0.4, aim: 30 }), 'TORNADO KICK', 'the hold wins over the aim');
  });

  test('FLASH-03', 'the poses of the new moves are legal at every step: finite, above the floor, bones at their lengths, and the animated end points never faster than 2,500 px/s', () => {
    const L = C.LIMB, len = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
    for (const name of NEW) {
      const mv = C.MOVES[name];
      for (const style of [0, 1]) {
        const m = SF.createMatch({ seed: 5, styles: [style, 0], ai: [false, false] }), f = m.f[0]; m.f[1].x = 860; f.x = 300; const an = SF.makeAnimator(); let prev = null, worst = 0, bad = '';
        if (mv.air) { f.air = true; f.h = 70; } SF.beginMove(m, f, name, 1);
        for (let i = 0; i < 90; i++) {
          SF.step(m, [NONE, NONE]); if (mv.air && i < mv.fr[0] + mv.fr[1] + 6) { f.h = 70; f.vy = 0; f.air = true; }
          an.step(m); const k = an.skeleton(m, 0), raw = SF.skeleton(f, m.t);
          for (const sk of [k, raw]) for (const key in sk) for (const p of (Array.isArray(sk[key][0]) ? sk[key] : [sk[key]])) if (!isFinite(p[0]) || !isFinite(p[1]) || p[1] > C.GY + 1) bad = name + ' ' + key + ' at step ' + i + ': ' + p;
          for (const sk of [raw]) { for (const j of [0, 1]) { const d1 = Math.abs(len(sk.shoulderB && j ? sk.shoulderB : sk.shoulder, sk.elbow[j]) - L.upperArm); if (d1 > 1.5) bad = bad || name + ' upper arm ' + d1.toFixed(1) + ' at step ' + i; const d2 = Math.abs(len(sk.hip, sk.knee[j]) - L.thigh); if (d2 > 1.5) bad = bad || name + ' thigh ' + d2.toFixed(1) + ' at step ' + i; const d3 = Math.abs(len(sk.knee[j], sk.foot[j]) - L.shin); if (d3 > 1.5) bad = bad || name + ' shin ' + d3.toFixed(1) + ' at step ' + i; } }
          if (prev) for (const key of ['hand', 'foot']) for (let j = 0; j < 2; j++) worst = Math.max(worst, len(k[key][j], prev[key][j]) * 60);
          prev = k;
        }
        eq(bad, '', 'legal poses for ' + name + ' (style ' + style + ')'); ok(worst <= 2500, name + ': an end point moved at ' + worst.toFixed(0) + ' px/s');
      }
    }
  });

  test('FLASH-04', 'in the real game each new move can be thrown with the inputs a player has: hold punch or kick for the heavy ones, jump and then tap, aim up, or hold for the aerial ones', () => {
    function seen(inputs, setup) {
      const m = SF.createMatch({ seed: 5, styles: [0, 0], ai: [false, false] }), a = m.f[0], d = m.f[1]; a.x = 300; d.x = 345; const names = new Set(); if (setup) setup(m);
      for (let i = 0; i < 160; i++) { SF.step(m, [inputs(i, a), NONE]); if (a.str && a.state === 'strike') names.add(a.str.name); d.hp = d.hpMax; d.state = d.state === 'down' ? 'idle' : d.state; d.protect = 0; if (a.sta < 60) a.sta = 100; }
      return names;
    }
    ok(seen(i => ({ punch: i < 40 })).has('SPINNING BACKFIST'), 'a long punch hold gives the spinning backfist');
    ok(seen(i => ({ kick: i < 40 })).has('AXE KICK'), 'a long kick hold gives the axe kick');
    const air = (extra, hold) => (i, a) => (i === 1 ? { jump: true } : (i >= 14 && i < 14 + hold) ? Object.assign({ kick: true }, extra) : {});
    ok(seen(air({}, 3)).has('FLYING SIDE KICK'), 'jump then tap kick: the flying kick');
    ok(seen(air({ aimUp: true }, 14)).has('BUTTERFLY KICK') || seen((i, a) => (i === 1 ? { jump: true } : (i < 14 ? {} : { kick: true, aimUp: i < 24 }))).has('BUTTERFLY KICK'), 'jump, aim up, kick: the butterfly kick');
    ok(seen(air({}, 30)).has('TORNADO KICK'), 'jump then hold kick: the tornado kick');
    ok(seen((i) => (i === 1 ? { jump: true } : (i >= 14 && i < 17) ? { punch: true } : {})).has('SUPERMAN PUNCH'), 'jump then punch: the superman punch');
  });

  test('FLASH-05', 'the AI throws the new moves too: over 100 AI fights at least five of the six are used', () => {
    const used = {};
    for (let s = 0; s < 100; s++) { const m = SF.createMatch({ seed: 1700 + s, styles: [s % 3, (s + 1) % 3], ai: [true, true] }); for (let i = 0; i < 2400 && m.winner === null; i++) SF.stepAI(m); for (const n of NEW) if (m.stats.moves[n]) used[n] = (used[n] || 0) + m.stats.moves[n]; }
    ok(Object.keys(used).length >= 5, 'new moves used by the AI: ' + JSON.stringify(used));
  });
};

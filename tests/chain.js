'use strict';
// CHAIN-01 to CHAIN-04: a throw or knockdown cannot be chained into a K.O. Registered into tests/run.js.
module.exports = function (X) {
  const { test, ok, eq, SF, C, NONE } = X;
  const evs = (m, k) => m.ev.filter(e => !k || e.k === k);

  /* a fighter that is thrown at full control of the test: returns the match once the victim has landed */
  function thrown(victimHp, styles) {
    const m = SF.createMatch({ seed: 4, styles: styles || [1, 2], ai: [false, false] }), a = m.f[0], d = m.f[1];
    a.x = 300; d.x = 345;
    SF.doThrow(m, a, d);
    for (let i = 0; i < 300 && d.state !== 'down'; i++) SF.step(m, [NONE, NONE]);
    if (victimHp) d.hp = victimHp;       /* set after the landing: the throw itself is not part of the chain */
    return m;
  }
  /* the worst attacker: a spinning kick at full speed every 0.25 s, straight into the victim */
  function slam(m) {
    const a = m.f[0], d = m.f[1]; a.x = d.x - 50; a.face = 1; a.state = 'strike'; a.t = 0; a.limb = 'kick';
    a.str = { limb: 'kick', kind: 'spin', a: 0, s: 3, dur: 0.133, counter: false, hit: false, name: 'x' };
    m.ev.length = 0; SF.impact(m, a, d);
  }

  /* a light jab: it staggers but does not knock down */
  function jab(m) {
    const a = m.f[0], d = m.f[1]; a.x = d.x - 50; a.face = 1; a.state = 'strike'; a.t = 0; a.limb = 'punch';
    a.str = { limb: 'punch', kind: 'straight', a: 0, s: 1, dur: 0.4, counter: false, hit: false, name: 'x' };
    m.ev.length = 0; SF.impact(m, a, d);
  }

  test('CHAIN-01', 'a protected fighter cannot be K.O.\'d: it keeps at least 1 hit point while protected', () => {
    for (const hp of [188, 60, 25, 5]) {
      const m = thrown(hp), d = m.f[1];
      ok(d.protect > 0, 'the thrown fighter is protected from the landing (hp ' + hp + ')');
      let protectedSeen = false;
      for (let i = 0; i < 1500 && d.protect > 0; i++) {
        SF.step(m, [NONE, NONE]);
        if (i % 15 === 0 && d.protect > 0) { slam(m); if (evs(m, 'protected').length) protectedSeen = true; }
        ok(m.winner === null, 'K.O. while protected (hp ' + hp + ', after ' + (i / 60).toFixed(1) + ' s)');
        ok(d.hp >= 1 - 1e-9, 'hp fell to ' + d.hp.toFixed(2) + ' while protected (start ' + hp + ')');
      }
      ok(d.protect <= 0 && m.winner === null, 'the window ends (hp ' + hp + ')');
      if (hp <= 60) ok(protectedSeen, 'the cap was reported as PROTECTED (hp ' + hp + ')');
    }
  });

  test('CHAIN-02', 'the damage taken while protected is at most 20 percent of the maximum health, and the budget is not refilled by a new knockdown', () => {
    const m = thrown(0), a = m.f[0], d = m.f[1], start = d.hp, budget = C.BUDGET_FRAC * d.style.hpMax;
    let knockdowns = 0;
    for (let i = 0; i < 1500 && d.protect > 0; i++) {
      SF.step(m, [NONE, NONE]);
      if (i % 15 === 0 && d.protect > 0) { slam(m); knockdowns += evs(m, 'knockdown').length; }
      ok(start - d.hp <= budget + 1e-6, 'took ' + (start - d.hp).toFixed(1) + ' damage while protected, budget ' + budget.toFixed(1));
    }
    ok(start - d.hp <= budget + 1e-6, 'total damage over the whole window ' + (start - d.hp).toFixed(1));
    ok(start - d.hp >= budget * 0.5, 'the budget is actually usable (took ' + (start - d.hp).toFixed(1) + ')');
    ok(a.state !== undefined && knockdowns >= 0, 'sanity');
    /* once the window is over a fresh attack works normally */
    const before = d.hp; slam(m);
    ok(before - d.hp > 5, 'after the window the fighter takes full damage again (' + (before - d.hp).toFixed(1) + ')');
  });

  test('CHAIN-03', 'a protected fighter cannot be grappled again', () => {
    const m = thrown(0), a = m.f[0], d = m.f[1];
    for (let i = 0; i < 600 && d.state !== 'idle'; i++) SF.step(m, [NONE, NONE]);
    ok(d.state === 'idle' && d.protect > 0, 'standing again but still protected: state ' + d.state + ' protect ' + d.protect.toFixed(2));
    a.x = d.x - 45; a.air = false; a.h = 0; a.state = 'idle'; a.grabCD = 0; d.cr = 0; d.vx = 0; d.inv = 0;
    m.ev.length = 0; SF.doThrow(m, a, d);
    const fail = evs(m, 'grappleFail')[0];
    ok(fail && fail.reason === 'protected', 'the second grapple must fail with reason protected: ' + JSON.stringify(m.ev));
    ok(d.state === 'idle', 'the victim was not thrown');
  });

  test('CHAIN-05', 'protection always ends: an interrupted stand-up still gives only the 1.5 s grace, and no protection lasts more than 6.5 s (DEF-020)', () => {
    const m = thrown(0), d = m.f[1];
    for (let i = 0; i < 600 && !(d.state === 'getup' && d.t > 0.5); i++) SF.step(m, [NONE, NONE]);
    ok(d.state === 'getup' && d.t > 0.5, 'reached the hittable part of the stand-up');
    jab(m);
    ok(d.state === 'stagger', 'the hit interrupts the stand-up: state ' + d.state);
    SF.step(m, [NONE, NONE]);
    ok(d.protect <= C.PROTECT_AFTER + 1e-6, 'after the interruption the protection is only the grace period, not a placeholder: ' + d.protect.toFixed(1));
    for (let i = 0; i < 150; i++) SF.step(m, [NONE, NONE]);
    eq(d.protect, 0, 'the protection has ended 2.5 s after the interruption');
    let longest = 0;
    for (let s = 0; s < 100; s++) {
      const mm = SF.createMatch({ seed: 9000 + s, styles: [s % 3, (s + 1) % 3], ai: [true, true] }), run = [0, 0];
      for (let i = 0; i < 2400 && mm.winner === null; i++) {
        SF.stepAI(mm);
        for (let q = 0; q < 2; q++) { run[q] = mm.f[q].protect > 0 ? run[q] + 1 / 60 : 0; longest = Math.max(longest, run[q]); }
        ok(longest <= 6.5, 'a fighter stayed protected for ' + longest.toFixed(1) + ' s (seed ' + (9000 + s) + ' step ' + i + ')');
      }
    }
  });

  test('CHAIN-04', 'over 100 AI fights no K.O. happens while the loser is protected', () => {
    let kos = 0, chainish = 0;
    for (let s = 0; s < 100; s++) {
      const m = SF.createMatch({ seed: 9000 + s, styles: [s % 3, (s + 1) % 3], ai: [true, true] });
      const last = [-99, -99];
      for (let i = 0; i < 2400 && m.winner === null; i++) {
        const before = [m.f[0].protect, m.f[1].protect];
        SF.stepAI(m);
        for (const e of m.ev) if (e.k === 'throw' || e.k === 'knockdown') last[e.d] = m.t;
        if (m.winner !== null) {
          kos++; const L = 1 - m.winner;
          ok(before[L] <= 0, 'K.O. while protected: seed ' + (9000 + s) + ' step ' + i + ' protect ' + before[L].toFixed(2));
          /* a chain is a K.O. some time after the fall; the hit that causes the fall and kills at once (same step) is not a chain */
          if (m.t - last[L] > 1e-9 && m.t - last[L] < 4) chainish++;
        }
      }
    }
    ok(kos > 80, 'fights ended in K.O.: ' + kos);
    ok(chainish <= kos * 0.1, 'K.O.s within 4 s after a throw or knockdown (excluding the hit that caused it): ' + chainish + ' of ' + kos);
  });
};

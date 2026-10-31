'use strict';
// BOOST-01..04, TURN-01..02, MP-01..05, HELP-01 (iteration 9).
module.exports = function (X) {
  const { test, ok, eq, near, SF, C, NONE } = X;
  const duel = (a, b) => { const m = SF.createMatch({ seed: 5, styles: [a || 0, b || 0], ai: [false, false] }); m.f[0].x = 300; m.f[1].x = 350; return m; };

  test('BOOST-01', 'boost: needs 30 stamina and no cooldown; spends 30; 4 s of boost and a 12 s cooldown; otherwise nothing', () => {
    const m = duel(), a = m.f[0];
    a.sta = 20; SF.step(m, [{ boost: true }, NONE]); SF.step(m, [NONE, NONE]);
    eq(a.boostT, 0, 'not enough stamina: no boost'); ok(a.sta >= 20, 'and no stamina spent');
    a.sta = 100; SF.step(m, [{ boost: true }, NONE]);
    near(a.boostT, C.BOOST_T, 0.05, 'boost time'); near(a.boostCD, C.BOOST_CD, 0.05, 'cooldown'); ok(a.sta <= 100 - C.BOOST_COST + 1, 'stamina spent: ' + a.sta.toFixed(1));
    SF.step(m, [NONE, NONE]); const sta = a.sta; SF.step(m, [{ boost: true }, NONE]); SF.step(m, [NONE, NONE]); ok(a.sta >= sta - 0.1, 'a second press during the cooldown spends nothing');
    for (let i = 0; i < 60 * 13; i++) { a.sta = 100; SF.step(m, [NONE, NONE]); m.f[1].hp = m.f[1].style.hpMax; }
    eq(a.boostT, 0, 'boost over'); eq(a.boostCD, 0, 'cooldown over and never negative');
    a.sta = 100; SF.step(m, [{ boost: true }, NONE]); ok(a.boostT > 0, 'boost again after the cooldown');
    const e = duel(); e.f[0].sta = 29; SF.step(e, [{ boost: true }, NONE]); eq(e.f[0].boostT, 0, 'with 29 stamina there is no boost');
  });

  test('BOOST-02', 'a boosted hit deals 1.5 times the damage of the same hit', () => {
    function hit(boost) {
      const m = duel(), a = m.f[0], d = m.f[1]; a.boostT = boost ? 3 : 0; d.hp = d.style.hpMax; const hp0 = d.hp;
      SF.beginMove(m, a, 'CROSS', 1);
      for (let i = 0; i < 60; i++) { SF.step(m, [NONE, NONE]); if (m.ev.some(e => e.k === 'hit')) break; }
      return hp0 - d.hp;
    }
    const plain = hit(false), boosted = hit(true);
    ok(plain > 0, 'the plain hit does damage'); near(boosted / plain, C.BOOST_DMG, 0.02, 'ratio ' + (boosted / plain).toFixed(3));
  });

  test('BOOST-03', 'boost is a recorded input and replays identically; older recordings still verify', () => {
    ok(SF.INPUT_KEYS.indexOf('boost') >= 11 && SF.INPUT_KEYS.indexOf('turn') >= 11, 'the keys exist and are appended after the old ones, so old masks keep their meaning');
    const m = SF.createMatch({ seed: 12, styles: [0, 1], ai: [false, true] }), rec = SF.newRecording(m);
    for (let i = 0; i < 400; i++) SF.recordStep(rec, m, [{ boost: i === 10, right: i < 80, punch: i % 50 < 4, turn: i === 200 }, null]);
    SF.finishRecording(rec, m);
    ok(SF.verifyRecording(rec).ok, 'verifies'); ok(rec.frames.some(f => f[0] & (1 << SF.INPUT_KEYS.indexOf('boost'))), 'the boost press is in the frames');
  });

  test('BOOST-04', 'the AI boosts only on Hard', () => {
    function boosts(level) {
      let n = 0;
      for (let s = 0; s < 12; s++) {
        const m = SF.createMatch({ seed: 900 + s, styles: [s % 3, (s + 1) % 3], ai: [true, true], levels: [level, level] });
        for (let i = 0; i < 2400 && m.winner === null; i++) { SF.stepAI(m); for (const f of m.f) if (f.boostT > C.BOOST_T - 0.02) n++; }
      }
      return n;
    }
    eq(boosts(1), 0, 'normal never boosts'); eq(boosts(0), 0, 'easy never boosts'); ok(boosts(2) >= 5, 'hard boosts: ' + boosts(2));
  });

  test('TURN-01', 'turn flips the facing and holds it for 3 s; then the fighter faces the opponent again', () => {
    const m = duel(), a = m.f[0];
    eq(a.face, 1); SF.step(m, [{ turn: true }, NONE]); SF.step(m, [NONE, NONE]);
    eq(a.face, -1, 'flipped');
    for (let i = 0; i < 60 * 2.5; i++) SF.step(m, [NONE, NONE]);
    eq(a.face, -1, 'still held after 2.5 s');
    for (let i = 0; i < 60 * 1; i++) SF.step(m, [NONE, NONE]);
    eq(a.face, 1, 'faces the opponent again after the lock');
    const b = duel(); b.f[0].state = 'stagger'; b.f[0].stagDur = 5; SF.step(b, [{ turn: true }, NONE]); eq(b.f[0].face, 1, 'no turning while staggered');
  });

  test('TURN-02', 'while the facing is locked a strike does not hit an opponent behind', () => {
    const m = duel(), a = m.f[0], d = m.f[1];
    SF.step(m, [{ turn: true }, NONE]); SF.step(m, [NONE, NONE]); eq(a.face, -1);
    SF.beginMove(m, a, 'JAB', 1); const hp0 = d.hp; let hit = false;
    for (let i = 0; i < 40; i++) { SF.step(m, [NONE, NONE]); if (m.ev.some(e => e.k === 'hit')) hit = true; }
    ok(!hit && d.hp === hp0, 'the opponent behind is not hit');
    const n = duel(), b = n.f[0]; SF.beginMove(n, b, 'JAB', 1); let h2 = false; for (let i = 0; i < 40; i++) { SF.step(n, [NONE, NONE]); if (n.ev.some(e => e.k === 'hit')) h2 = true; }
    ok(h2, 'without a lock the same jab hits');
  });

  const setup = (teams, styles, ai, seed) => SF.createMatch({ seed: seed || 3, styles: styles, ai: ai, teams: teams });
  test('MP-01', 'teams and targets: nearest living enemy; allies never hit each other', () => {
    const m = setup([0, 0, 1], [0, 1, 2], [false, false, false]);
    eq(m.f.length, 3); eq(m.f[0].team, 0); eq(m.f[2].team, 1);
    m.f[0].x = 300; m.f[1].x = 360; m.f[2].x = 700;
    eq(SF.target(m, m.f[0]).idx, 2, 'the target of fighter 0 is the enemy, not the near ally');
    m.f[2].x = 100; m.f[0].x = 300; eq(SF.target(m, m.f[1]).idx, 2, 'nearest enemy of the ally');
    m.f[0].x = 300; m.f[1].x = 340; m.f[2].x = 800; const hp = m.f[1].hp;
    SF.beginMove(m, m.f[0], 'CROSS', 1); for (let i = 0; i < 60; i++) SF.step(m, [NONE, NONE, NONE]);
    eq(m.f[1].hp, hp, 'no friendly fire');
  });

  test('MP-02', 'a K.O. stays down; the match ends when a whole team is down', () => {
    const m = setup([0, 1, 1], [0, 0, 0], [false, false, false]);
    m.f[0].x = 300; m.f[1].x = 350; m.f[2].x = 700;
    m.f[1].hp = 0.5; m.f[1].protect = 0; SF.beginMove(m, m.f[0], 'CROSS', 1);
    for (let i = 0; i < 40 && !m.f[1].ko; i++) SF.step(m, [NONE, NONE, NONE]);
    ok(m.f[1].ko, 'the first enemy is K.O.d'); eq(m.winner, null, 'the match goes on, one enemy is left');
    ok(m.f[1].state === 'down', 'and stays down');
    m.f[2].hp = 0.5; m.f[2].x = 380; m.f[0].x = 330; m.f[2].protect = 0; SF.beginMove(m, m.f[0], 'CROSS', 1);
    for (let i = 0; i < 80 && m.winner === null; i++) SF.step(m, [NONE, NONE, NONE]);
    eq(m.winner, 0, 'team 0 wins'); ok(m.f[0].win, 'the winner is marked');
  });

  test('MP-03', 'two fighters play exactly as before: the hash of an AI fight is unchanged by the generalisation', () => {
    const a = SF.createMatch({ seed: 7, styles: [0, 1], ai: [true, true] }), b = SF.createMatch({ seed: 7, styles: [0, 1], ai: [true, true], teams: [0, 1] });
    for (let i = 0; i < 1500; i++) { SF.stepAI(a); SF.stepAI(b); }
    eq(SF.stateHash(a), SF.stateHash(b)); eq(a.f.length, 2);
  });

  test('MP-04', 'three and four fighters: deterministic, finite, and fights end', () => {
    for (const teams of [[0, 1, 1], [0, 1, 1, 1], [0, 0, 1, 1]]) {
      const styles = teams.map((t, i) => i % 3); let done = 0, bad = 0;
      const run = () => { const m = setup(teams, styles, teams.map(() => true), 41); for (let i = 0; i < 900; i++) SF.stepAI(m); return SF.stateHash(m); };
      eq(run(), run(), 'deterministic ' + teams.join(''));
      for (let s = 0; s < 30; s++) {
        const m = setup(teams, styles, teams.map(() => true), 700 + s);
        for (let i = 0; i < 7200 && m.winner === null; i++) { SF.stepAI(m); for (const f of m.f) if (!isFinite(f.x) || !isFinite(f.hp) || !isFinite(f.sta) || f.h < -1) bad++; }
        if (m.winner !== null) done++;
      }
      eq(bad, 0, 'non-finite values in ' + teams.join('')); ok(done >= 27, 'finished fights for ' + teams.join('') + ': ' + done + ' of 30');
    }
  });

  test('MP-05', 'recordings carry the teams and replay identically for 3 and 4 fighters; bad team lists are rejected', () => {
    for (const teams of [[0, 1, 1], [0, 0, 1, 1]]) {
      const m = setup(teams, teams.map((t, i) => i % 3), [false].concat(teams.slice(1).map(() => true)), 77), rec = SF.newRecording(m);
      for (let i = 0; i < 1200 && !rec.done; i++) SF.recordStep(rec, m, [{ right: i < 100, punch: i % 45 < 5 }]);
      SF.finishRecording(rec, m);
      eq(JSON.stringify(rec.tm), JSON.stringify(teams)); ok(SF.verifyRecording(rec).ok, 'verifies ' + teams.join(''));
      const back = SF.loadRecording(SF.serializeRec(rec)); eq(back.frames.length, rec.frames.length); eq(JSON.stringify(back.tm), JSON.stringify(teams));
      const bad = JSON.parse(SF.serializeRec(rec)); bad.tm = [0, 0, 0, 0, 0];
      let threw = false; try { SF.parseRec(JSON.stringify(bad)); } catch (e) { threw = true; } ok(threw, 'a team list of the wrong length is rejected');
      const bad2 = JSON.parse(SF.serializeRec(rec)); bad2.tm = teams.map(() => 0);
      threw = false; try { SF.parseRec(JSON.stringify(bad2)); } catch (e) { threw = true; } ok(threw, 'a match with one team only is rejected');
    }
  });

  test('HELP-01', 'the help model lists every input key, every move, the sequences of the style and the touch gestures', () => {
    ok(typeof SF.helpModel === 'function', 'SF.helpModel exists');
    for (let s = 0; s < 3; s++) {
      const h = SF.helpModel(s), text = JSON.stringify(h);
      for (const k of SF.INPUT_KEYS) ok(h.keys.some(r => r.key === k && r.keyboard && r.touch), 'input key ' + k + ' has a keyboard and a touch description');
      for (const name in C.MOVES) ok(h.moves.some(r => r.name === name && r.frames), 'move ' + name + ' is listed with its frames');
      const graph = C.CHAIN[C.STYLES[s].name]; for (const from in graph) ok(h.sequences.some(r => r.from === from), 'sequence from ' + from + ' is listed');
      ok(h.gestures.length >= 8, 'touch gestures listed: ' + h.gestures.length); ok(text.indexOf('BOOST') >= 0 && text.indexOf('TURN') >= 0, 'boost and turn are described');
    }
  });

  test('SPD-01', 'the default speed is real time (1.0), and the speed menu offers 0.25 to 1', () => {
    ok(typeof SF.SPEEDS !== 'undefined' && SF.SPEEDS.indexOf(1) >= 0 && SF.SPEEDS[SF.SPEEDS.length - 1] === 1, 'speed list ends with 1: ' + JSON.stringify(SF.SPEEDS));
    eq(SF.DEFAULT_SPEED, 1, 'default speed');
  });
  test('MP-06', 'a throw is never orphaned: a fighter in a grapple cannot be hit by a third fighter, and no thrown fighter is left without a holder', () => {
    const m = setup([0, 1, 1], [0, 0, 0], [false, false, false]);
    m.f[0].x = 300; m.f[1].x = 340; m.f[2].x = 380;
    SF.doThrow(m, m.f[0], m.f[1]);
    eq(m.f[0].state, 'grapple'); eq(m.f[1].state, 'flipped');
    m.f[2].x = 330; SF.beginMove(m, m.f[2], 'CROSS', 1);
    for (let i = 0; i < 20; i++) SF.step(m, [NONE, NONE, NONE]);
    ok(m.f[0].state === 'grapple' || m.f[0].state === 'recover' || m.f[0].state === 'idle', 'the holder was not knocked out of the throw: ' + m.f[0].state);
    for (let i = 0; i < 240; i++) SF.step(m, [NONE, NONE, NONE]);
    ok(m.f[1].state !== 'flipped', 'the thrown fighter landed: ' + m.f[1].state);
    let orphans = 0;
    for (const teams of [[0, 1, 1], [0, 0, 1, 1], [0, 1, 1, 1]]) for (let s = 0; s < 25; s++) {
      const q = setup(teams, teams.map((t, i) => (i + s) % 3), teams.map(() => true), 1300 + s);
      for (let i = 0; i < 5400 && q.winner === null; i++) { SF.stepAI(q); for (const f of q.f) if (f.state === 'flipped' && !q.f.some(h => h.state === 'grapple' && h.grap === f.idx)) orphans++; }
    }
    eq(orphans, 0, 'steps with a thrown fighter that has no holder');
  });
  test('MP-07', 'the outnumbered side gets a health bonus and takes less damage: 1 v 2 gives x2.5 health and x0.4 damage, 1 v 3 x4 and x0.25; equal teams get none', () => {
    const hp = (teams) => { const m = setup(teams, teams.map((t, i) => i % 3), teams.map(() => false)); return m.f.map(f => ({ hp: f.hp, max: f.hpMax, base: f.style.hpMax })); };
    for (const [teams, factor] of [[[0, 1], 1], [[0, 0, 1, 1], 1], [[0, 1, 1], 2.5], [[0, 1, 1, 1], 4]]) {
      const r = hp(teams);
      r.forEach((f, i) => {
        const lone = teams.filter(t => t === teams[i]).length < teams.length - teams.filter(t => t === teams[i]).length;
        near(f.max, f.base * (lone ? factor : 1), 0.001, 'fighter ' + i + ' in ' + teams.join('') + ': max health');
        eq(f.hp, f.max, 'starts at full health');
      });
    }
    /* the bonus is a real maximum: health is clamped to it, not to the style value */
    const m = setup([0, 1, 1], [0, 0, 0], [false, false, false]); m.f[0].hp = m.f[0].hpMax; SF.step(m, [NONE, NONE, NONE]);
    eq(m.f[0].hp, m.f[0].style.hpMax * 2.5, 'not clamped back to the style maximum');
    /* the protection budget after a throw is a fraction of the real maximum */
    near(SF.CFG.BUDGET_FRAC * m.f[0].hpMax, SF.CFG.BUDGET_FRAC * m.f[0].style.hpMax * 2.5, 0.001);
    /* damage taken: the same cross, once on a lone fighter and once on a fighter of an equal team */
    function taken(teams, victim) {
      const q = setup(teams, teams.map(() => 0), teams.map(() => false)), a = q.f[victim === 0 ? 1 : 0], d = q.f[victim];
      q.f.forEach(f => { f.x = 900; f.protect = 0; }); a.x = 300; d.x = 350; a.face = 1; d.face = -1; if (victim === 0) { a.x = 350; d.x = 300; a.face = -1; d.face = 1; }
      const hp0 = d.hp; SF.beginMove(q, a, 'CROSS', 1); for (let i = 0; i < 60; i++) { SF.step(q, teams.map(() => NONE)); if (q.ev.some(e => e.k === 'hit')) break; }
      return hp0 - d.hp;
    }
    const base = taken([0, 1], 0), lone = taken([0, 1, 1], 0);
    ok(base > 0, 'a hit lands'); near(lone / base, 0.4, 0.02, 'damage taken by the lone fighter ratio ' + (lone / base).toFixed(3));
    near(taken([0, 1, 1, 1], 0) / base, 0.25, 0.02, '1 v 3 ratio');
  });
  test('MP-08', 'the AI survives a change of target: many multi-fighter AI fights run without an error', () => {
    let fights = 0;
    for (const teams of [[0, 1, 1], [0, 0, 1, 1], [0, 1, 1, 1]]) for (let s = 0; s < 40; s++) {
      const m = setup(teams, teams.map((t, i) => (i + s) % 3), teams.map(() => true), 4000 + s);
      for (let i = 0; i < 9000 && m.winner === null; i++) SF.stepAI(m);
      fights++;
    }
    eq(fights, 120);
  });
};

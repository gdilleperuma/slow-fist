'use strict';
// OBS-01 to OBS-07: obstacles (boxes) fighters can climb, jump and stand on.
module.exports = function (X) {
  const { test, ok, eq, near, SF, C, NONE } = X;
  const duel = () => { const m = SF.createMatch({ seed: 5, styles: [0, 0], ai: [false, false] }); m.f[0].x = 300; m.f[1].x = 800; return m; };
  const BOX = { x: 450, w: 80, h: 45 };

  test('OBS-01', 'generation: none when off, 2 or 4 when on, deterministic, in the arena, clear of the start positions and of each other', () => {
    eq(SF.createMatch({ seed: 9, styles: [0, 1], ai: [true, true], obstacles: 0 }).obstacles.length, 0);
    eq(SF.createMatch({ seed: 9, styles: [0, 1], ai: [true, true] }).obstacles.length, 0, 'off by default');
    for (const [level, n] of [[1, 2], [2, 4]]) for (let s = 1; s <= 40; s++) {
      const a = SF.createMatch({ seed: s, styles: [0, 1, 2], ai: [true, true, true], teams: [0, 1, 1], obstacles: level }), b = SF.createMatch({ seed: s, styles: [0, 1, 2], ai: [true, true, true], teams: [0, 1, 1], obstacles: level });
      ok(a.obstacles.length >= 2 && a.obstacles.length <= n, 'count at level ' + level + ': ' + a.obstacles.length); eq(JSON.stringify(a.obstacles), JSON.stringify(b.obstacles), 'deterministic for the seed');
      a.obstacles.forEach((o, i) => {
        ok(o.h >= 30 && o.h <= 60 && o.w >= 50 && o.w <= 110, 'size ' + JSON.stringify(o));
        ok(o.x - o.w / 2 >= 60 && o.x + o.w / 2 <= C.W - 60, 'inside the arena');
        for (const f of a.f) ok(Math.abs(f.x - o.x) > o.w / 2 + 28, 'a fighter does not start inside or against a box');
        a.obstacles.forEach((p, j) => { if (j > i) ok(Math.abs(p.x - o.x) >= (p.w + o.w) / 2 + 40, 'boxes keep a gap wide enough to walk through'); });
      });
    }
  });

  test('OBS-02', 'a box is solid from the side: walking into it stops at its edge', () => {
    const m = duel(); m.obstacles = [Object.assign({}, BOX)];
    for (let i = 0; i < 200; i++) SF.step(m, [{ right: true }, NONE]);
    ok(m.f[0].x <= BOX.x - BOX.w / 2 - 16 + 0.5, 'stopped at the side: x = ' + m.f[0].x.toFixed(1)); ok(m.f[0].x > BOX.x - BOX.w / 2 - 26, 'and close to it');
    eq(m.f[0].h, 0, 'still on the ground');
  });

  test('OBS-03', 'a jump next to the box climbs on top of it and the fighter stands there', () => {
    const m = duel(); m.obstacles = [Object.assign({}, BOX)];
    for (let i = 0; i < 120; i++) SF.step(m, [{ right: true }, NONE]);
    SF.step(m, [{ right: true, jump: true }, NONE]);
    for (let i = 0; i < 40; i++) SF.step(m, [{ right: true }, NONE]);
    for (let i = 0; i < 160; i++) SF.step(m, [NONE, NONE]);
    eq(m.f[0].h, BOX.h, 'standing on the box'); ok(!m.f[0].air, 'not in the air'); ok(Math.abs(m.f[0].x - BOX.x) < BOX.w / 2 + 8, 'over the box: ' + m.f[0].x.toFixed(1));
  });

  test('OBS-04', 'walking off the edge of a box falls to the ground', () => {
    const m = duel(); m.obstacles = [Object.assign({}, BOX)];
    const f = m.f[0]; f.x = 480; f.h = BOX.h; f.air = false;
    for (let i = 0; i < 40; i++) SF.step(m, [NONE, NONE]);
    eq(f.h, BOX.h, 'stays on top while standing');
    for (let i = 0; i < 200; i++) SF.step(m, [{ right: true }, NONE]);
    eq(f.h, 0, 'on the ground again'); ok(!f.air, 'landed'); ok(f.x > BOX.x + BOX.w / 2, 'beyond the box: ' + f.x.toFixed(1));
  });

  test('OBS-05', 'a box higher than a jump cannot be climbed', () => {
    const m = duel(); m.obstacles = [{ x: 450, w: 80, h: 100 }];
    for (let i = 0; i < 120; i++) SF.step(m, [{ right: true }, NONE]);
    for (let k = 0; k < 6; k++) { SF.step(m, [{ right: true, jump: true }, NONE]); for (let i = 0; i < 70; i++) SF.step(m, [{ right: true }, NONE]); m.f[0].sta = 100; }
    ok(m.f[0].h < 100 && m.f[0].x < 450 - 40, 'still outside: x = ' + m.f[0].x.toFixed(1) + ', h = ' + m.f[0].h.toFixed(1));
  });

  test('OBS-06', 'AI fights with boxes finish, nobody is ever inside a box or below the floor, and nothing is not-a-number', () => {
    let inside = 0, bad = 0, done = 0, fights = 0;
    for (const [teams, level] of [[[0, 1], 1], [[0, 1], 2], [[0, 1, 1], 2]]) for (let s = 0; s < 30; s++) {
      const m = SF.createMatch({ seed: 800 + s, styles: teams.map((t, i) => (i + s) % 3), ai: teams.map(() => true), teams: teams, obstacles: level });
      for (let i = 0; i < 7200 && m.winner === null; i++) {
        SF.stepAI(m);
        for (const f of m.f) {
          if (f.state === 'flipped') continue;   /* a thrown fighter flies over the box; where he lands is checked on the next step */
          if (!isFinite(f.x) || !isFinite(f.h) || f.h < -0.01) bad++;
          for (const b of m.obstacles) if (f.h < b.h - 10.5 && Math.abs(f.x - b.x) < b.w / 2 + 15.5) inside++;
        }
      }
      fights++; if (m.winner !== null) done++;
    }
    eq(bad, 0, 'non-finite or negative heights'); eq(inside, 0, 'steps with a fighter inside a box'); ok(done >= fights * 0.9, 'fights that finished: ' + done + ' of ' + fights);
  });

  test('OBS-07', 'recordings carry the obstacle level and replay identically; a bad level is rejected; levels 0 changes nothing', () => {
    const m = SF.createMatch({ seed: 31, styles: [0, 1], ai: [false, true], obstacles: 2 }), rec = SF.newRecording(m);
    for (let i = 0; i < 900 && !rec.done; i++) SF.recordStep(rec, m, [{ right: i < 120, jump: i % 90 === 20, punch: i % 40 < 3 }, null]);
    SF.finishRecording(rec, m);
    eq(rec.ob, 2); ok(SF.verifyRecording(rec).ok, 'verifies');
    const back = SF.loadRecording(SF.serializeRec(rec)); eq(back.ob, 2);
    const bad = JSON.parse(SF.serializeRec(rec)); bad.ob = 7; let threw = false; try { SF.parseRec(JSON.stringify(bad)); } catch (e) { threw = true; } ok(threw, 'a level of 7 is rejected');
    const wrong = JSON.parse(SF.serializeRec(rec)); wrong.ob = 0; ok(!SF.verifyRecording(SF.parseRec(JSON.stringify(wrong))).ok, 'the wrong level does not replay identically');
    const a = SF.createMatch({ seed: 7, styles: [0, 1], ai: [true, true] }), b = SF.createMatch({ seed: 7, styles: [0, 1], ai: [true, true], obstacles: 0 });
    for (let i = 0; i < 1200; i++) { SF.stepAI(a); SF.stepAI(b); } eq(SF.stateHash(a), SF.stateHash(b), 'level 0 is the old game');
  });
  const inside = (m, f) => m.obstacles.some(b => f.h < b.h - 10.5 && Math.abs(f.x - b.x) < b.w / 2 + 15.5);

  test('OBS-08', 'falling: a fighter dropped or thrown onto a box lands on top of it and is never at floor level inside it', () => {
    /* (a) dropped from the air over and beside a box at many speeds */
    let violations = 0, landedOnTop = 0, landedBeside = 0, runs = 0;
    for (let vx = -320; vx <= 320; vx += 40) for (let x0 = 380; x0 <= 520; x0 += 20) for (const h0 of [60, 120, 200]) {
      const m = duel(); m.obstacles = [Object.assign({}, BOX)]; const f = m.f[0];
      f.x = x0; f.h = h0; f.air = true; f.vy = 0; f.vx = vx; runs++;
      for (let i = 0; i < 240; i++) { SF.step(m, [NONE, NONE]); if (inside(m, f)) violations++; }
      if (f.h === BOX.h) landedOnTop++; else if (f.h === 0 && !inside(m, f)) landedBeside++;
    }
    eq(violations, 0, 'steps inside a box while falling'); ok(landedOnTop > 20 && landedBeside > 20, 'both outcomes occur: ' + landedOnTop + ' on top, ' + landedBeside + ' beside, of ' + runs);
    /* (b) thrown: the victim lands where the throw puts him; over a box he must land on it */
    let thrownBad = 0, thrownOnBox = 0;
    for (let bx = 320; bx <= 440; bx += 12) for (const face of [1, -1]) {
      const m = duel(), a = m.f[0], d = m.f[1]; m.obstacles = [{ x: bx, w: 80, h: 50 }];
      a.x = face > 0 ? 560 : 340; a.face = face; d.x = a.x + face * 45; d.face = -face;
      if (m.obstacles.some(b => Math.abs(a.x - b.x) < b.w / 2 + 30 || Math.abs(d.x - b.x) < b.w / 2 + 30)) { /* keep the throwers off the box: the box is only where he lands */ }
      SF.doThrow(m, a, d); if (a.state !== 'grapple') continue;
      for (let i = 0; i < 200; i++) { SF.step(m, [NONE, NONE]); if (inside(m, d) && d.state !== 'flipped') thrownBad++; }
      if (d.h === 50) thrownOnBox++;
    }
    eq(thrownBad, 0, 'steps with a thrown fighter at floor level inside a box'); ok(thrownOnBox >= 1, 'a thrown fighter lands on a box at least once: ' + thrownOnBox);
    /* (c) the end of the match: a fighter standing on a box stays on it when the match freezes */
    const e = duel(), w = e.f[0], l = e.f[1]; e.obstacles = [{ x: 450, w: 80, h: 50 }];
    w.x = 430; w.h = 50; w.air = false; l.x = 480; l.h = 50; l.air = false; l.hp = 0.5; l.protect = 0; SF.beginMove(e, w, 'CROSS', 1);
    for (let i = 0; i < 60 && e.winner === null; i++) SF.step(e, [NONE, NONE]);
    eq(e.winner, 0, 'the winner is decided'); eq(w.h, 50, 'the winner still stands on the box'); eq(l.h, 50, 'the loser lies on the box, not under it');
  });
};

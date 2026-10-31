'use strict';
// TRN-01 to TRN-05: trainer mode (practice dummy, drills, no K.O., endless stamina).
module.exports = function (X) {
  const { test, ok, eq, SF, C, NONE } = X;
  const mk = (a, b) => { const m = SF.createMatch({ seed: 5, styles: [a || 0, b || 0], ai: [false, false], training: 1 }); m.f[0].x = 300; m.f[1].x = 350; return m; };

  test('TRN-01', 'training rules: nobody is K.O.d (the dummy is refilled), the trainee never runs out of stamina, a normal match is unchanged', () => {
    const m = mk(), d = m.f[1], a = m.f[0];
    d.hp = 0.5; d.protect = 0; SF.beginMove(m, a, 'CROSS', 1);
    for (let i = 0; i < 40; i++) SF.step(m, [NONE, NONE]);
    eq(m.winner, null, 'no winner'); ok(!d.ko, 'not K.O.d'); ok(d.hp > d.hpMax * 0.9, 'the dummy is refilled: ' + d.hp.toFixed(0));
    a.sta = 5; SF.step(m, [NONE, NONE]); eq(a.sta, 100, 'endless stamina for the trainee');
    a.hp = 0.5; a.protect = 0; d.x = 300; a.x = 350; SF.beginMove(m, d, 'CROSS', 1);
    for (let i = 0; i < 40; i++) SF.step(m, [NONE, NONE]);
    eq(m.winner, null, 'the trainee is not K.O.d either');
    const n = SF.createMatch({ seed: 5, styles: [0, 0], ai: [false, false] }); n.f[0].sta = 5; SF.step(n, [NONE, NONE]); ok(n.f[0].sta < 100, 'a normal match keeps its stamina rules');
  });

  test('TRN-02', 'every drill can be completed through the real simulation or its events, and only by the right thing', () => {
    ok(typeof SF.trainingDrills === 'function' && typeof SF.trainingFeed === 'function' && typeof SF.trainingNew === 'function', 'the model exists');
    const drills = SF.trainingDrills(0);
    ok(drills.length >= 14, 'drills: ' + drills.length);
    /* offence drills through the simulation */
    for (const dr of drills.filter(x => x.hitMove)) {
      const m = mk(), t = SF.trainingNew(0), a = m.f[0], d = m.f[1];
      const before = t.counts[dr.id] || 0;
      for (let k = 0; k < dr.target + 1; k++) {
        d.hp = d.hpMax; d.state = 'idle'; d.protect = 0; d.t = 0; a.state = 'idle'; a.t = 0; a.x = 300; d.x = 350; a.sta = 100;
        SF.beginMove(m, a, dr.hitMove, 1);
        for (let i = 0; i < 70; i++) { SF.step(m, [NONE, NONE]); SF.trainingFeed(t, m); }
      }
      ok((t.counts[dr.id] || 0) > before, dr.title + ': progress after landing ' + dr.hitMove + ' (' + (t.counts[dr.id] || 0) + ')');
      eq(!!t.done[dr.id], true, dr.title + ' is done after ' + (dr.target + 1) + ' hits');
    }
    /* other drills by their events; wrong events do nothing */
    const feed = (id, evs) => { const t = SF.trainingNew(0); SF.trainingFeed(t, { ev: evs }); return t.counts[id] || 0; };
    eq(feed('block', [{ k: 'hit', a: 1, d: 0, tag: 'BLOCK' }]), 1, 'a block counts');
    eq(feed('block', [{ k: 'hit', a: 0, d: 1, tag: 'BLOCK' }]), 0, 'the trainee blocking his own punch does not count');
    eq(feed('parry', [{ k: 'hit', a: 1, d: 0, tag: 'PARRY' }]), 1, 'a parry counts'); eq(feed('parry', [{ k: 'hit', a: 1, d: 0, tag: 'BLOCK' }]), 0, 'a block is not a parry');
    eq(feed('grapple', [{ k: 'throw', a: 0, d: 1 }]), 1, 'a throw counts'); eq(feed('grapple', [{ k: 'throw', a: 1, d: 0 }]), 0, 'being thrown does not');
    eq(feed('boost', [{ k: 'boost', a: 0 }]), 1, 'boost'); eq(feed('turn', [{ k: 'turn', a: 0 }]), 1, 'turn'); eq(feed('dodge', [{ k: 'dodge', a: 1, d: 0 }]), 1, 'dodge');
  });

  test('TRN-03', 'the sequence drill is built from the style\'s own sequence graph and completes on that chain', () => {
    for (let s = 0; s < 3; s++) {
      const dr = SF.trainingDrills(s).find(x => x.chain);
      ok(dr && dr.chain.length >= 3, 'a sequence of 3 or more for ' + C.STYLES[s].name + ': ' + (dr && dr.chain.join(' > ')));
      const graph = C.CHAIN[C.STYLES[s].name];
      for (let i = 0; i + 1 < dr.chain.length; i++) { const e = graph[dr.chain[i]]; ok(e && (e.punch === dr.chain[i + 1] || e.kick === dr.chain[i + 1]), 'the graph allows ' + dr.chain[i] + ' > ' + dr.chain[i + 1]); }
      const t = SF.trainingNew(s);
      SF.trainingFeed(t, { ev: [{ k: 'chain', a: 0, names: dr.chain.slice(0, 2) }] }); ok(!t.done[dr.id], 'two moves are not enough');
      SF.trainingFeed(t, { ev: [{ k: 'chain', a: 1, names: dr.chain.slice() }] }); ok(!t.done[dr.id], 'the dummy doing it does not count');
      SF.trainingFeed(t, { ev: [{ k: 'chain', a: 0, names: dr.chain.slice() }] }); ok((t.counts[dr.id] || 0) >= 1, 'the full chain counts');
    }
  });

  test('TRN-04', 'the dummy: still, blocks, attacks slowly, or full AI', () => {
    const m = mk();
    eq(JSON.stringify(SF.dummyInput('still')), '{}'); eq(SF.dummyInput('block').block, true); eq(SF.dummyInput('attack'), null, 'an attacking dummy is driven by the AI');
    SF.setDummy(m, 'still'); eq(m.aiFlags[1], false); SF.setDummy(m, 'attack'); eq(m.aiFlags[1], true); eq(m.levels[1], 0, 'slow attacks: easy AI');
    SF.setDummy(m, 'ai'); eq(m.aiFlags[1], true); eq(m.levels[1], 1);
    SF.setDummy(m, 'block'); eq(m.aiFlags[1], false);
    for (let i = 0; i < 90; i++) SF.stepAI(m, [null, SF.dummyInput('block')]); eq(m.f[1].state, 'guard', 'the blocking dummy holds its guard');
  });

  test('TRN-05', 'progress: the drills are taken in order, a drill needs its target count, skipping and reset work', () => {
    const t = SF.trainingNew(0), drills = SF.trainingDrills(0);
    eq(t.idx, 0, 'starts at the first drill'); eq(SF.trainingCurrent(t).id, drills[0].id);
    const first = drills[0], ev = first.hitMove ? { k: 'hit', a: 0, d: 1, tag: 'HIT', name: first.hitMove } : null;
    if (ev) { for (let i = 0; i < first.target - 1; i++) SF.trainingFeed(t, { ev: [ev] }); ok(!t.done[first.id], 'one hit short'); SF.trainingFeed(t, { ev: [ev] }); ok(t.done[first.id], 'done at the target'); }
    SF.trainingSkip(t); ok(t.idx >= 1, 'skip moves on'); SF.trainingNew(0); const u = SF.trainingNew(0); eq(u.idx, 0, 'a new session starts again');
    for (let i = 0; i < drills.length + 3; i++) SF.trainingSkip(u); ok(u.idx >= drills.length - 1 && u.idx < drills.length, 'skipping stops at the last drill: ' + u.idx);
  });
};

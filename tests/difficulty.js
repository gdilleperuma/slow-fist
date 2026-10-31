'use strict';
// DIFF-01 to DIFF-04: AI difficulty levels (0 easy, 1 normal, 2 hard). Level 1 is the behaviour of every earlier version.
module.exports = function (X) {
  const { test, ok, eq, SF } = X;
  function fight(seed, styles, levels) {
    const m = SF.createMatch({ seed: seed, styles: styles, ai: [true, true], levels: levels });
    for (let i = 0; i < 3600 && m.winner === null; i++) SF.stepAI(m);
    return m;
  }
  test('DIFF-01', 'normal level changes nothing: levels [1,1] play exactly like no levels', () => {
    for (let s = 1; s <= 4; s++) eq(SF.stateHash(fight(s, [s % 3, (s + 1) % 3], [1, 1])), SF.stateHash(fight(s, [s % 3, (s + 1) % 3], undefined)), 'seed ' + s);
  });
  test('DIFF-02', 'a hard AI beats an easy one most of the time, on either side of the arena', () => {
    let hard = 0, decided = 0;
    for (let s = 0; s < 60; s++) {
      const hardOnLeft = s % 2 === 0, m = fight(500 + s, [s % 3, s % 3], hardOnLeft ? [2, 0] : [0, 2]);
      if (m.winner !== null) { decided++; if ((m.winner === 0) === hardOnLeft) hard++; }
    }
    ok(decided >= 45, 'decided fights: ' + decided);
    ok(hard / decided >= 0.65, 'hard won ' + hard + ' of ' + decided);
  });
  test('DIFF-03', 'the level is part of the recording: it is saved, restored and replays identically', () => {
    const m = SF.createMatch({ seed: 21, styles: [0, 1], ai: [true, true], levels: [0, 2] }), rec = SF.newRecording(m);
    for (let i = 0; i < 1500 && !rec.done; i++) SF.recordStep(rec, m, [null, null]);
    SF.finishRecording(rec, m);
    eq(JSON.stringify(rec.lv), '[0,2]'); ok(SF.verifyRecording(rec).ok, 'verifies');
    const back = SF.loadRecording(SF.serializeRec(rec)); eq(JSON.stringify(back.lv), '[0,2]', 'the level survives a save and load');
    const bad = JSON.parse(SF.serializeRec(rec)); bad.lv = [1, 1];
    ok(!SF.verifyRecording(SF.parseRec(JSON.stringify(bad))).ok, 'the wrong level does not replay identically');
  });
  test('DIFF-04', 'levels outside 0..2 are refused or clamped, never crash', () => {
    const m = SF.createMatch({ seed: 3, styles: [0, 1], ai: [true, true], levels: [9, -4] });
    ok(m.levels[0] === 2 && m.levels[1] === 0, 'clamped: ' + m.levels.join(','));
    for (let i = 0; i < 300; i++) SF.stepAI(m);
  });
};

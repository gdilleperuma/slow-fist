'use strict';
// Iteration 3 tests: recording and replay (REC-01 to REC-07). Registered into tests/run.js.
module.exports = function (X) {
  const { test, eq, ok, SF, C, NONE } = X;

  /* a deterministic, varied "human": every 20 steps a new pattern of keys, derived from the step number */
  function script(i) {
    const h = (Math.floor(i / 20) * 2654435761) >>> 0;
    const inp = {};
    if ((h >> 3) & 1) inp.left = true;
    if ((h >> 4) & 1) inp.right = true;
    if (((h >> 5) & 3) === 0) inp.punch = true;
    if (((h >> 7) & 3) === 0) inp.kick = true;
    if (((h >> 9) & 3) === 0) inp.block = true;
    if (((h >> 11) & 7) === 0) inp.jump = true;
    if (((h >> 13) & 7) === 0) inp.crouch = true;
    if (((h >> 15) & 3) === 0) inp.aimUp = true;
    if (((h >> 17) & 7) === 0) inp.grab = true;
    if (((h >> 19) & 7) === 0) inp.dash = true;
    return inp;
  }
  function record(seed, ai, steps, styles) {
    const m = SF.createMatch({ seed: seed, styles: styles || [0, 1], ai: ai });
    const rec = SF.newRecording(m);
    for (let i = 0; i < steps && !rec.done; i++) SF.recordStep(rec, m, [ai[0] ? null : script(i), ai[1] ? null : script(i + 7)]);
    if (!rec.done) SF.finishRecording(rec, m);
    return { m: m, rec: rec };
  }
  const clone = o => JSON.parse(JSON.stringify(o));

  test('REC-01', 'a recording replays to the same hashes; any tampering is detected', () => {
    const a = record(11, [false, true], 900);
    ok(Object.keys(a.m.stats.moves).length >= 3, 'the scripted human actually did things: ' + JSON.stringify(a.m.stats.moves));
    ok(a.rec.frames.length >= 300, 'recorded ' + a.rec.frames.length + ' steps');
    const v = SF.verifyRecording(a.rec); ok(v.ok, 'human vs AI should verify: ' + v.reason);
    const b = record(23, [true, true], 600, [1, 2]); ok(SF.verifyRecording(b.rec).ok, 'AI vs AI should verify');
    const c = record(5, [false, false], 400, [2, 0]); ok(SF.verifyRecording(c.rec).ok, 'human vs human should verify');
    const t1 = clone(a.rec); t1.frames[200][0] ^= 1 << 6;
    ok(!SF.verifyRecording(t1).ok, 'a changed input must be detected');
    const t2 = clone(a.rec); t2.checks[1][1] += 1;
    ok(!SF.verifyRecording(t2).ok, 'a changed checkpoint must be detected');
    const t3 = clone(a.rec); t3.final.hash = (t3.final.hash + 1) >>> 0;
    ok(!SF.verifyRecording(t3).ok, 'a changed final hash must be detected');
    const t4 = clone(a.rec); t4.seed += 1;
    ok(!SF.verifyRecording(t4).ok, 'a changed seed must be detected');
  });

  test('REC-02', 'serialisation round trip, and the file is small', () => {
    const m = SF.createMatch({ seed: 3, styles: [0, 1], ai: [false, false] });
    const rec = SF.newRecording(m);
    for (let i = 0; i < 1800; i++) SF.recordStep(rec, m, [script(i), script(i + 3)]);
    SF.finishRecording(rec, m);
    const text = SF.serializeRec(rec);
    eq(JSON.stringify(SF.parseRec(text)), JSON.stringify(rec), 'round trip');
    ok(text.length < 40000, 'size ' + text.length + ' bytes for 1,800 steps');
    eq(SF.decodeInput(SF.encodeInput({ left: true, punch: true, dash: true })).punch, true);
    for (const k of SF.INPUT_KEYS) { const o = {}; o[k] = true; eq(SF.decodeInput(SF.encodeInput(o))[k], true, k); }
    eq(Object.keys(SF.decodeInput(SF.encodeInput({}))).length, 0);
  });

  test('REC-03', 'loading rejects malformed files', () => {
    const good = record(9, [false, true], 200).rec, text = SF.serializeRec(good);
    SF.parseRec(text);
    const bad = (mut, why) => { const r = clone(good); mut(r); let threw = false; try { SF.parseRec(JSON.stringify(r)); } catch (e) { threw = true; } ok(threw, 'accepted: ' + why); };
    let threw = false; try { SF.parseRec('{not json'); } catch (e) { threw = true; } ok(threw, 'accepted invalid JSON');
    threw = false; try { SF.parseRec('null'); } catch (e) { threw = true; } ok(threw, 'accepted null');
    bad(r => { r.v = 2; }, 'wrong version');
    bad(r => { delete r.seed; }, 'missing seed');
    bad(r => { r.seed = 1.5; }, 'non-integer seed');
    bad(r => { r.styles = [0, 3]; }, 'style out of range');
    bad(r => { r.styles = [0]; }, 'one style');
    bad(r => { r.frames = 'x'; }, 'frames not an array');
    bad(r => { r.frames[3] = [1]; }, 'frame with one entry');
    bad(r => { r.frames[3] = [1, 2.5]; }, 'non-integer mask');
    bad(r => { r.frames[3] = [1, 1 << SF.INPUT_KEYS.length]; }, 'mask out of range');
    bad(r => { r.frames[3] = [-1, 0]; }, 'negative mask');
    bad(r => { r.checks = [[1]]; }, 'malformed checkpoint');
    bad(r => { r.ai = [true]; }, 'ai flags malformed');
    bad(r => { r.final = null; }, 'missing final');
    bad(r => { r.frames = new Array(36001).fill([0, 0]); }, 'too many frames');
  });

  test('REC-04', 'replay runs at 1.0 by default, speed 0.1 to 2.0, advances speed x 60 steps per second', () => {
    const m = SF.createMatch({ seed: 3, styles: [0, 1], ai: [false, false] }), rec = SF.newRecording(m);
    for (let i = 0; i < 900; i++) SF.recordStep(rec, m, [NONE, NONE]);
    SF.finishRecording(rec, m);
    let p = SF.makePlayer(rec); eq(p.speed, 1, 'normal speed by default');
    eq(SF.playerTake(p, 1.0), 60, 'one second at x1');
    p = SF.makePlayer(rec); SF.setPlayerSpeed(p, 0.5); eq(SF.playerTake(p, 1.0), 30, 'x0.5');
    p = SF.makePlayer(rec); SF.setPlayerSpeed(p, 2); eq(SF.playerTake(p, 1.0), 120, 'x2');
    SF.setPlayerSpeed(p, 9); eq(p.speed, 2, 'clamped to 2'); SF.setPlayerSpeed(p, 0); eq(p.speed, 0.1, 'clamped to 0.1');
    p = SF.makePlayer(rec); let n = 0; for (let i = 0; i < 120; i++) n += SF.playerTake(p, 1 / 120);
    ok(Math.abs(n - 60) <= 1, 'small real-time slices accumulate: ' + n);
    p = SF.makePlayer(rec); let got = 0, safety = 0;
    while (!p.done && safety++ < 5000) { const k = SF.playerTake(p, 0.5); for (let i = 0; i < k; i++) SF.playerStep(p); got += k; }
    eq(got, 900, 'replay stops at the end, no more than recorded'); ok(p.done, 'done flag');
    eq(SF.playerTake(p, 1.0), 0, 'nothing more after the end');
  });

  test('REC-05', 'recording stops 132 steps after the K.O., and at the maximum length', () => {
    /* a natural K.O. (AI vs AI, no hand-edited state: DEF-011) */
    const m = SF.createMatch({ seed: 6, styles: [0, 1], ai: [true, true] });
    const rec = SF.newRecording(m);
    for (let i = 0; i < 4000 && !rec.done; i++) SF.recordStep(rec, m, [null, null]);
    ok(m.winner !== null, 'the fight ended in a K.O.'); ok(rec.done, 'recording finished by itself');
    eq(rec.frames.length - rec.koAt, 132, 'steps recorded after the K.O.'); eq(rec.final.winner, m.winner);
    ok(SF.verifyRecording(rec).ok, 'a recording that includes the K.O. verifies');
    const m2 = SF.createMatch({ seed: 4, styles: [0, 1], ai: [false, false] }), r2 = SF.newRecording(m2, { maxFrames: 100 });
    for (let i = 0; i < 300; i++) SF.recordStep(r2, m2, [NONE, NONE]);
    eq(r2.frames.length, 100, 'capped at the maximum'); ok(r2.done);
    const before = r2.frames.length; SF.recordStep(r2, m2, [NONE, NONE]); eq(r2.frames.length, before, 'nothing appended after done');
  });

  test('REC-06', 'replay is read-only, uses its own match and ends at the recorded final hash', () => {
    const a = record(31, [false, true], 700), before = JSON.stringify(a.rec);
    const p = SF.makePlayer(a.rec);
    ok(p.match !== a.m, 'a separate match object');
    let guard = 0; while (!p.done && guard++ < 5000) { const k = SF.playerTake(p, 1 / 30); for (let i = 0; i < k; i++) SF.playerStep(p); }
    eq(SF.stateHash(p.match), a.rec.final.hash, 'same final hash');
    eq(p.match.winner, a.rec.final.winner, 'same winner');
    eq(JSON.stringify(a.rec), before, 'the recording is unchanged by replaying it');
    eq(SF.stateHash(a.m), a.rec.final.hash, 'the live match was not touched');
  });

  test('REC-07', 'a file that does not replay identically is rejected on load', () => {
    const a = record(41, [false, true], 600), text = SF.serializeRec(a.rec);
    ok(SF.loadRecording(text).frames.length === a.rec.frames.length, 'a good file loads');
    const t = clone(a.rec); t.frames[150][0] ^= 1 << 6;
    let msg = ''; try { SF.loadRecording(JSON.stringify(t)); } catch (e) { msg = e.message; }
    ok(msg.indexOf('does not replay identically') >= 0, 'message: ' + msg);
    msg = ''; try { SF.loadRecording('{}'); } catch (e) { msg = e.message; }
    ok(msg.length > 0, 'malformed file rejected');
  });
};

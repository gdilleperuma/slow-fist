/* Recording and replay. Pure data and functions (no DOM); the browser shell in main.js only wires keys and buttons.
   A recording is the seed, the styles, which fighters are AI, and each human fighter's input for every step, with a
   state-hash checkpoint every 60 steps and a final hash. Replaying re-runs the deterministic simulation. */
var SF = (typeof SF === 'undefined') ? {} : SF;
(function () {
  'use strict';
  const C = SF.CFG, clamp = SF.clamp;
  SF.INPUT_KEYS = ['left', 'right', 'jump', 'crouch', 'aimUp', 'aimDown', 'punch', 'kick', 'block', 'grab', 'dash', 'boost', 'turn'];   /* new keys are only ever appended: old masks keep their meaning */
  SF.REC_VERSION = 1;
  SF.REC_MAX_FRAMES = 36000;
  SF.POST_KO_FRAMES = 132;
  SF.CHECK_EVERY = 60;
  const MASK_MAX = (1 << SF.INPUT_KEYS.length) - 1;

  SF.encodeInput = function (inp) {
    let n = 0;
    if (!inp) return 0;
    for (let i = 0; i < SF.INPUT_KEYS.length; i++) if (inp[SF.INPUT_KEYS[i]]) n |= 1 << i;
    return n;
  };
  SF.decodeInput = function (n) {
    const o = {};
    for (let i = 0; i < SF.INPUT_KEYS.length; i++) if (n & (1 << i)) o[SF.INPUT_KEYS[i]] = true;
    return o;
  };

  /* ---------- recording ---------- */
  SF.newRecording = function (match, opts) {
    const rec = {
      v: SF.REC_VERSION, seed: match.seed, styles: match.f.map(function (q) { return q.styleIndex; }),
      ai: match.aiFlags.slice(), lv: match.levels.slice(), tm: match.teams.slice(), ob: match.obLevel, frames: [], checks: [], koAt: null, final: null
    };
    /* runtime state is kept out of the serialised data */
    const run = { done: false, max: (opts && opts.maxFrames) || SF.REC_MAX_FRAMES };
    Object.defineProperty(rec, 'done', { get: function () { return run.done; }, enumerable: false });
    Object.defineProperty(rec, '_run', { value: run, enumerable: false });
    return rec;
  };
  SF.finishRecording = function (rec, match) {
    rec.final = { hash: SF.stateHash(match), winner: match.winner, steps: match.steps };
    rec._run.done = true;
    return rec;
  };
  /* one simulation step, recorded. Human inputs are recorded; AI inputs are regenerated on replay. */
  SF.recordStep = function (rec, match, human) {
    if (rec._run.done) return;
    SF.stepAI(match, human);
    rec.frames.push(match.f.map(function (q, i) { return match.aiFlags[i] ? 0 : SF.encodeInput(human && human[i]); }));
    const n = rec.frames.length;
    if (n % SF.CHECK_EVERY === 0) rec.checks.push([n, SF.stateHash(match)]);
    if (match.winner !== null && rec.koAt === null) rec.koAt = n;
    if ((rec.koAt !== null && n - rec.koAt >= SF.POST_KO_FRAMES) || n >= rec._run.max) SF.finishRecording(rec, match);
  };

  /* ---------- files ---------- */
  SF.serializeRec = function (rec) { return JSON.stringify(rec); };

  function isInt(v, lo, hi) { return typeof v === 'number' && Number.isInteger(v) && v >= lo && v <= hi; }
  SF.parseRec = function (text) {
    let r;
    try { r = JSON.parse(text); } catch (e) { throw new Error('Not a recording: the file is not valid JSON.'); }
    const bad = function (why) { throw new Error('Not a valid recording: ' + why + '.'); };
    if (!r || typeof r !== 'object' || Array.isArray(r)) bad('wrong structure');
    if (r.v !== SF.REC_VERSION) bad('unsupported version ' + r.v);
    if (!isInt(r.seed, 1, 4294967295)) bad('bad seed');
    if (!Array.isArray(r.styles) || r.styles.length < 2 || r.styles.length > 4 || !r.styles.every(function (s) { return isInt(s, 0, C.STYLES.length - 1); })) bad('bad styles');
    const N = r.styles.length;
    if (!Array.isArray(r.ai) || r.ai.length !== N || !r.ai.every(function (b) { return typeof b === 'boolean'; })) bad('bad AI flags');
    if (r.tm !== undefined && (!Array.isArray(r.tm) || r.tm.length !== N || !r.tm.every(function (t) { return isInt(t, 0, 1); }) || r.tm.indexOf(0) < 0 || r.tm.indexOf(1) < 0)) bad('bad teams');
    if (r.ob !== undefined && !isInt(r.ob, 0, 2)) bad('bad obstacle level');
    if (r.lv !== undefined && (!Array.isArray(r.lv) || r.lv.length !== N || !r.lv.every(function (n) { return isInt(n, 0, 2); }))) bad('bad AI levels');
    if (!Array.isArray(r.frames) || r.frames.length > SF.REC_MAX_FRAMES) bad('frame list missing or too long');
    for (const f of r.frames) if (!Array.isArray(f) || f.length !== N || !f.every(function (v) { return isInt(v, 0, MASK_MAX); })) bad('a frame does not hold one input mask per fighter');
    if (!Array.isArray(r.checks) || r.checks.length > r.frames.length) bad('bad checkpoints');
    for (const c of r.checks) if (!Array.isArray(c) || c.length !== 2 || !isInt(c[0], 1, SF.REC_MAX_FRAMES) || !isInt(c[1], 0, 4294967295)) bad('a checkpoint is malformed');
    if (r.koAt !== null && !isInt(r.koAt, 1, SF.REC_MAX_FRAMES)) bad('bad K.O. marker');
    if (!r.final || !isInt(r.final.hash, 0, 4294967295) || !(r.final.winner === null || isInt(r.final.winner, 0, 3)) || !isInt(r.final.steps, 0, SF.REC_MAX_FRAMES)) bad('missing or bad final state');
    return { v: r.v, seed: r.seed, styles: r.styles, ai: r.ai, lv: r.lv || r.styles.map(function () { return 1; }), tm: r.tm || SF.defaultTeams(N), ob: r.ob || 0, frames: r.frames, checks: r.checks, koAt: r.koAt, final: { hash: r.final.hash, winner: r.final.winner, steps: r.final.steps } };
  };

  /* replay the whole recording and compare every checkpoint and the final state */
  SF.verifyRecording = function (rec) {
    const m = SF.createMatch({ seed: rec.seed, styles: rec.styles, ai: rec.ai, levels: rec.lv, teams: rec.tm, obstacles: rec.ob });
    let ci = 0;
    for (let i = 0; i < rec.frames.length; i++) {
      SF.stepAI(m, rec.frames[i].map(SF.decodeInput));
      if ((i + 1) % SF.CHECK_EVERY === 0) {
        const c = rec.checks[ci++];
        if (!c || c[0] !== i + 1 || c[1] !== SF.stateHash(m)) return { ok: false, reason: 'the state differs at step ' + (i + 1), step: i + 1 };
      }
    }
    if (ci !== rec.checks.length) return { ok: false, reason: 'checkpoint count differs', step: rec.frames.length };
    if (SF.stateHash(m) !== rec.final.hash || m.winner !== rec.final.winner) return { ok: false, reason: 'the final state differs', step: rec.frames.length };
    return { ok: true, reason: '', step: rec.frames.length };
  };
  SF.loadRecording = function (text) {
    const rec = SF.parseRec(text), v = SF.verifyRecording(rec);
    if (!v.ok) throw new Error('This recording does not replay identically (' + v.reason + '). It may come from another browser or version.');
    return rec;
  };

  /* ---------- playback ---------- */
  SF.makePlayer = function (rec) {
    return { rec: rec, match: SF.createMatch({ seed: rec.seed, styles: rec.styles, ai: rec.ai, levels: rec.lv, teams: rec.tm, obstacles: rec.ob }), pos: 0, acc: 0, speed: 1, done: rec.frames.length === 0 };
  };
  SF.setPlayerSpeed = function (p, s) {
    if (typeof s === 'number' && isFinite(s)) p.speed = clamp(s, 0.1, 2);
    return p.speed;
  };
  /* how many simulation steps to run for this much real time (the caller then calls playerStep that many times) */
  SF.playerTake = function (p, real) {
    if (p.done) return 0;
    p.acc += Math.max(0, real) * p.speed;
    let n = Math.floor(p.acc / C.DT + 1e-9);
    p.acc -= n * C.DT;
    if (p.acc < 0) p.acc = 0;
    return Math.min(n, p.rec.frames.length - p.pos);
  };
  SF.playerStep = function (p) {
    if (p.done) return;
    const f = p.rec.frames[p.pos];
    SF.stepAI(p.match, [SF.decodeInput(f[0]), SF.decodeInput(f[1])]);
    p.pos++;
    if (p.pos >= p.rec.frames.length) p.done = true;
  };
})();

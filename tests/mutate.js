'use strict';
// Mutation checks (QA guide 20.11): break the code on purpose and confirm the matching test notices.
// Each mutation edits a copy of one source file in memory, runs the named checks, and expects at least one to fail.
const fs = require('fs'), path = require('path'), vm = require('vm');
const ORDER = ['rng', 'data', 'sim', 'pose', 'ai', 'sound', 'replay'];
function load(patch) {
  const ctx = vm.createContext({ console: console, Math: Math, Object: Object, JSON: JSON });
  const code = ORDER.map(n => { let t = fs.readFileSync(path.join(__dirname, '..', 'src', n + '.js'), 'utf8'); if (patch && patch.file === n) {
      for (const p of [{ from: patch.from, to: patch.to }].concat(patch.extra || [])) {
        if (t.indexOf(p.from) < 0) throw new Error('mutation target not found in ' + n + ': ' + p.from);
        t = t.replace(p.from, p.to);
      }
    } return t; }).join('\n;\n');
  vm.runInContext(code + '\n;this.SF = SF;', ctx);
  return ctx.SF;
}
// the checks mirror the invariant tests in run.js
const checks = {
  extentsAboveFloor: SF => { for (const st of SF.CFG.STATES) for (let r = 0; r <= 63; r++) { const m = SF.createMatch({ seed: 5, styles: [1, 1] }), f = m.f[0]; f.state = st; f.t = 0.3; if (st === 'flipped') { f.h = 5; f.rot = -r / 10; } else if (r > 0) break; const k = SF.skeleton(f); if (k.head[1] + SF.CFG.LIMB.head > SF.CFG.GY + 1) return 'head under floor in ' + st + ' rot ' + (-r / 10); } return null; },
  restsOnFloor: SF => {
    const C0 = SF.CFG, m = SF.createMatch({ seed: 5, styles: [1, 1] }), f = m.f[0];
    f.state = 'down'; f.t = 0.3;
    const k = SF.skeleton(f);
    const gap = C0.GY - (k.head[1] + C0.LIMB.head);
    /* at least one foot must touch the floor */
    const feetGap = Math.min(C0.GY - k.foot[0][1], C0.GY - k.foot[1][1]);
    if (gap > 3) return 'head floats ' + gap.toFixed(1) + ' px';
    if (gap < -1) return 'head sunk ' + (-gap).toFixed(1) + ' px';
    if (feetGap > 8) return 'feet float ' + feetGap.toFixed(1) + ' px';
    return null;
  },
  staNeverNegative: SF => { const m = SF.createMatch({ seed: 1, styles: [0, 1] }); m.f[0].x = 300; m.f[1].x = 350; m.f[0].sta = 5.5; for (let i = 0; i < 2; i++) SF.step(m, [{ jump: true }, {}]); for (let i = 0; i < 4; i++) SF.step(m, [{}, {}]); return (m.f[0].sta < 0 || m.f[0].air) ? 'jumped with too little stamina (or negative stamina)' : null; },
  sprintWorks: SF => {
    const m = SF.createMatch({ seed: 1, styles: [0, 1] }); m.f[0].x = 150; m.f[1].x = 800;
    const st = (inp) => SF.step(m, [inp, {}]);
    st({ right: true }); st({}); st({}); st({ right: true });
    return m.f[0].sprintT > 0.4 ? null : 'sprint did not start';
  },
  heldJumpHigher: SF => {
    const peak = (held) => { const m = SF.createMatch({ seed: 1, styles: [0, 1] }); m.f[0].x = 300; m.f[1].x = 350; let mx = 0; for (let i = 0; i < 90; i++) { SF.step(m, [{ jump: held ? true : i < 1 }, {}]); mx = Math.max(mx, m.f[0].h); } return mx; };
    return peak(true) > peak(false) + 10 ? null : 'held jump is not higher than a tapped one';
  },
  kneelExists: SF => {
    const C0 = SF.CFG; let best = 1e9;
    for (let i = 12; i <= 22; i++) {
      const m = SF.createMatch({ seed: 5, styles: [0, 1] }), f = m.f[0]; f.state = 'getup'; f.t = i * 0.025;
      const k = SF.skeleton(f); best = Math.min(best, C0.GY - k.knee[0][1], C0.GY - k.knee[1][1]);
    }
    return best <= 12 ? null : 'no knee comes near the floor during the stand-up (' + best.toFixed(1) + ' px)';
  },
  recTamperDetected: SF => {
    const m = SF.createMatch({ seed: 11, styles: [0, 1], ai: [false, true] }), rec = SF.newRecording(m);
    for (let i = 0; i < 200; i++) SF.recordStep(rec, m, [{ right: i < 60, punch: i % 40 < 6 }, null]);
    SF.finishRecording(rec, m);
    if (!SF.verifyRecording(rec).ok) return 'a good recording does not verify';
    const t = JSON.parse(JSON.stringify(rec)); t.final.hash = (t.final.hash + 1) >>> 0;
    return SF.verifyRecording(t).ok ? 'a tampered final hash was accepted' : null;
  },
  replaySpeedWorks: SF => {
    const m = SF.createMatch({ seed: 3, styles: [0, 1], ai: [false, false] }), rec = SF.newRecording(m);
    for (let i = 0; i < 300; i++) SF.recordStep(rec, m, [{}, {}]);
    SF.finishRecording(rec, m);
    const p = SF.makePlayer(rec); SF.setPlayerSpeed(p, 2);
    return SF.playerTake(p, 1.0) === 120 ? null : 'replay speed is ignored';
  },
  versionChecked: SF => {
    const m = SF.createMatch({ seed: 3, styles: [0, 1], ai: [false, false] }), rec = SF.newRecording(m);
    for (let i = 0; i < 60; i++) SF.recordStep(rec, m, [{}, {}]);
    SF.finishRecording(rec, m);
    const t = JSON.parse(JSON.stringify(rec)); t.v = 99;
    try { SF.parseRec(JSON.stringify(t)); return 'a wrong version was accepted'; } catch (e) { return null; }
  },
  kneesAnatomical: SF => {
    for (const ang of [10, 20, 35, 45, 60]) for (let u = 0; u <= 10; u++) {
      const m = SF.createMatch({ seed: 5, styles: [1, 1] }), f = m.f[0];
      f.face = 1; f.limb = 'kick'; f.state = 'strike'; f.t = (u / 10) * 0.55 * 0.4;
      f.str = { limb: 'kick', kind: 'straight', a: ang, s: 1, dur: 0.4, hit: false };
      const k = SF.skeleton(f);
      const t = [k.knee[0][0] - k.hip[0], k.knee[0][1] - k.hip[1]], s = [k.foot[0][0] - k.knee[0][0], k.foot[0][1] - k.knee[0][1]];
      const v = (t[0] * s[1] - t[1] * s[0]) / (Math.hypot(t[0], t[1]) * Math.hypot(s[0], s[1]));
      if (v < -0.05) return 'knee hyperextended at kick angle ' + ang + ' (' + v.toFixed(2) + ')';
    }
    /* the knee must also bend when the pose needs it: a reversed solver would give straight legs, which are legal but wrong */
    const m2 = SF.createMatch({ seed: 5, styles: [1, 1] }), g = m2.f[0]; g.face = 1; g.cr = 1; g.drop = 32;
    const kc = SF.skeleton(g), tc = [kc.knee[0][0] - kc.hip[0], kc.knee[0][1] - kc.hip[1]], sc = [kc.foot[0][0] - kc.knee[0][0], kc.foot[0][1] - kc.knee[0][1]];
    const flexC = Math.abs(Math.atan2(tc[0] * sc[1] - tc[1] * sc[0], tc[0] * sc[0] + tc[1] * sc[1])) * 180 / Math.PI;
    if (flexC < 30) return 'the knee does not bend in a crouch (' + flexC.toFixed(0) + ' degrees)';
    return null;
  },
  rangesHold: SF => {
    const deg = r => r * 180 / Math.PI, v = (p, q) => [q[0] - p[0], q[1] - p[1]];
    const ang = (a, b) => Math.abs(deg(Math.atan2(a[0] * b[1] - a[1] * b[0], a[0] * b[0] + a[1] * b[1])));
    for (const zone of ['BODY', 'HEAD', 'LEGS']) for (let u = 0; u <= 10; u++) {
      const m = SF.createMatch({ seed: 5, styles: [0, 1] }), f = m.f[0]; f.face = 1; f.state = 'stagger'; f.zone = zone; f.stagDur = 0.5; f.t = u * 0.05;
      const k = SF.skeleton(f);
      for (let i = 0; i < 2; i++) {
        if (180 - ang(v(k.elbow[i], [k.shoulder, k.shoulderB][i]), v(k.elbow[i], k.hand[i])) > 150) return 'elbow beyond range in stagger ' + zone;
        if (180 - ang(v(k.knee[i], k.hip), v(k.knee[i], k.foot[i])) > 145) return 'knee beyond range in stagger ' + zone;
      }
    }
    for (const ang0 of [-25, 0, 20, 45, 60]) {
      const m = SF.createMatch({ seed: 5, styles: [1, 0] }), f = m.f[0]; f.face = 1; f.limb = 'punch'; f.state = 'strike'; f.str = { limb: 'punch', kind: 'straight', a: ang0, s: 1, dur: 0.4, hit: false }; f.t = 0.2;
      const k = SF.skeleton(f); if (180 - ang(v(k.elbow[0], k.shoulder), v(k.elbow[0], k.hand[0])) > 150) return 'elbow beyond range in a punch at ' + ang0;
    }
    return null;
  },
  animatorSmooths: SF => {
    const m = SF.createMatch({ seed: 5, styles: [1, 0] }), anim = SF.makeAnimator(), f = m.f[0];
    anim.step(m);
    const before = anim.skeleton(m, 0), keep = JSON.stringify([before.foot, before.hand, before.head]);
    f.state = 'down'; f.t = 0.3; m.steps++; anim.step(m);
    const after = anim.skeleton(m, 0), b = JSON.parse(keep);
    const pts = [[after.hand[0], b[1][0]], [after.hand[1], b[1][1]], [after.foot[0], b[0][0]], [after.foot[1], b[0][1]], [after.head, b[2]]];
    let worst = 0; for (const [p, q] of pts) worst = Math.max(worst, Math.hypot(p[0] - q[0], p[1] - q[1]) * 60);
    return worst > 2500 ? 'a change of state moved an end point at ' + worst.toFixed(0) + ' px/s' : null;
  },
  flairWorks: SF => {
    let lo = 1e9, hi = -1e9, maxKnee = 0;
    for (let i = 0; i <= 20; i++) {
      const m = SF.createMatch({ seed: 5, styles: [0, 1] }), f = m.f[0]; f.face = 1; f.state = 'flipped'; f.flair = 1; f.h = 100; f.rot = -(i / 20) * 1.5 * Math.PI;
      const q = SF.poseInternals.jointAngles(SF.poseParams(f, 0));
      for (const a of q.arm) { lo = Math.min(lo, a[0] * 180 / Math.PI); hi = Math.max(hi, a[0] * 180 / Math.PI); }
      for (const l of q.leg) maxKnee = Math.max(maxKnee, l[1] * 180 / Math.PI);
    }
    if (maxKnee > 20) return 'flair 1 flight is not a pike: the knees bend up to ' + maxKnee.toFixed(0) + ' degrees';
    return hi - lo >= 100 ? null : 'flair 1 flight does not windmill the arms (range ' + (hi - lo).toFixed(0) + ')';
  },
  shoulderGirdle: SF => {
    const m = SF.createMatch({ seed: 5, styles: [0, 1] }), k = SF.skeleton(m.f[0], 0);
    const w = Math.hypot(k.shoulder[0] - k.shoulderB[0], k.shoulder[1] - k.shoulderB[1]);
    return Math.abs(w - 2 * SF.CFG.LIMB.shoulder) < 0.5 && w > 10 ? null : 'the shoulders are ' + w.toFixed(1) + ' px apart';
  },
  punchExtends: SF => {
    const m = SF.createMatch({ seed: 5, styles: [0, 1] }), f = m.f[0]; f.face = 1; f.limb = 'punch'; f.state = 'strike'; f.str = { limb: 'punch', kind: 'straight', a: 10, s: 1, dur: 0.4, hit: false }; f.t = 0.55 * 0.4;
    const k = SF.skeleton(f, 0), v = (p, q) => [q[0] - p[0], q[1] - p[1]], a = v(k.elbow[0], k.shoulder), b = v(k.elbow[0], k.hand[0]);
    const bend = 180 - Math.abs(Math.atan2(a[0] * b[1] - a[1] * b[0], a[0] * b[0] + a[1] * b[1])) * 180 / Math.PI;
    return bend <= 25 ? null : 'the arm is still bent ' + bend.toFixed(0) + ' degrees at the contact of a punch';
  },
  chainCapped: SF => {
    const m = SF.createMatch({ seed: 4, styles: [1, 2], ai: [false, false] }), a = m.f[0], d = m.f[1]; a.x = 300; d.x = 345;
    SF.doThrow(m, a, d);
    for (let i = 0; i < 300 && d.state !== 'down'; i++) SF.step(m, [{}, {}]);
    if (!(d.protect > 0)) return 'a thrown fighter is not protected';
    const start = d.hp, budget = SF.CFG.BUDGET_FRAC * d.style.hpMax;
    for (let i = 0; i < 1500 && d.protect > 0; i++) {
      SF.step(m, [{}, {}]);
      if (i % 15 === 0 && d.protect > 0) { a.x = d.x - 50; a.face = 1; a.state = 'strike'; a.t = 0; a.limb = 'kick'; a.str = { limb: 'kick', kind: 'spin', a: 0, s: 3, dur: 0.133, counter: false, hit: false, name: 'x' }; SF.impact(m, a, d); }
      if (start - d.hp > budget + 1e-6) return 'a protected fighter lost ' + (start - d.hp).toFixed(0) + ' hit points (budget ' + budget.toFixed(0) + ')';
      if (m.winner !== null) return 'a protected fighter was knocked out';
    }
    return null;
  },
  protectionEnds: SF => {
    const m = SF.createMatch({ seed: 4, styles: [1, 2], ai: [false, false] }), a = m.f[0], d = m.f[1]; a.x = 300; d.x = 345;
    SF.doThrow(m, a, d);
    for (let i = 0; i < 300 && d.state !== 'down'; i++) SF.step(m, [{}, {}]);
    for (let i = 0; i < 600 && !(d.state === 'getup' && d.t > 0.5); i++) SF.step(m, [{}, {}]);
    a.x = d.x - 50; a.face = 1; a.state = 'strike'; a.t = 0; a.limb = 'punch'; a.str = { limb: 'punch', kind: 'straight', a: 0, s: 1, dur: 0.4, counter: false, hit: false, name: 'x' }; SF.impact(m, a, d);
    for (let i = 0; i < 300; i++) SF.step(m, [{}, {}]);
    return d.protect > 0 ? 'the protection is still on 5 s after the stand-up was interrupted (' + d.protect.toFixed(0) + ')' : null;
  },
  frozenConfig: SF => { try { SF.CFG.STYLES[0].hpMax = 1; return 'config writable'; } catch (e) { return null; } },
  koFreezes: SF => { const m = SF.createMatch({ seed: 1, styles: [0, 0] }); m.winner = 0; const h = SF.stateHash(m); for (let i = 0; i < 30; i++) SF.step(m, [{ punch: true }, { kick: true }]); return SF.stateHash(m) !== h ? 'moved after KO' : null; }
};
const mutations = [
  // note: 'clamp ignores head radius' is an equivalent mutant (no reachable pose has the head as its lowest point), see QA-LOG DEF-005
  { name: 'lying hip height too low (head would sink)', file: 'pose', from: 'const lieHipY = C.GY - L.head - 1;', to: 'const lieHipY = C.GY - 3;', expect: 'restsOnFloor' },
  { name: 'lying hands sink below the floor again', file: 'pose', from: 'lerp(handRel[0][1], handY + rd, lie)', to: 'lerp(handRel[0][1], handY + 30 + rd, lie)', expect: 'restsOnFloor' },
  { name: 'jump spends stamina without checking', file: 'sim', from: '&& spend(f, 8)) {', to: ') { f.sta -= 8;', expect: 'staNeverNegative' },
  { name: 'sprint never starts', file: 'sim', from: 'f.sprintT = C.SPRINT_T;', to: 'f.sprintT = 0;', expect: 'sprintWorks' },
  { name: 'held jump uses normal gravity', file: 'sim', from: '(inp.jump && f.vy > 0) ? C.G_HOLD : C.G', to: 'C.G', expect: 'heldJumpHigher' },
  { name: 'stand-up never kneels', file: 'pose', from: 'kneel = [hipX - face * (kx + L.shin), C.GY - 3]', to: 'kneel = [hipX + face * 40, C.GY - 40]', expect: 'kneelExists' },
  { name: 'verification ignores the final hash', file: 'replay', from: 'if (SF.stateHash(m) !== rec.final.hash || m.winner !== rec.final.winner)', to: 'if (false)', expect: 'recTamperDetected' },
  { name: 'replay ignores the speed', file: 'replay', from: 'p.acc += Math.max(0, real) * p.speed;', to: 'p.acc += Math.max(0, real);', expect: 'replaySpeedWorks' },
  { name: 'loading accepts any version', file: 'replay', from: 'if (r.v !== SF.REC_VERSION) bad(', to: 'if (false) bad(', expect: 'versionChecked' },
  { name: 'knee bend side reversed (like the old preference bug)', file: 'pose', from: 'const lg = ik2(T.hip, P.foot[i], L.thigh, L.shin, sign);', to: 'const lg = ik2(T.hip, P.foot[i], L.thigh, L.shin, -sign);', expect: 'kneesAnatomical' },
  { name: 'joint ranges removed', file: 'pose', from: 'const RANGE = { hip: [-30, 140], knee: [0, 140], shoulder: [-60, 180], elbow: [0, 145] };', to: 'const RANGE = { hip: [-179, 179], knee: [0, 179], shoulder: [-179, 179], elbow: [0, 179] };', expect: 'rangesHold' },
  { name: 'animator does not smooth', file: 'pose', from: 'return cur.map(function (c, i) { const m = CAPS[i] * dt; return c + clamp((tgt[i] - c) * k, -m, m); });', to: 'return tgt.slice();', extra: [{ from: 'const SPEED_LIMIT = 2300;', to: 'const SPEED_LIMIT = 1e9;' }], expect: 'animatorSmooths' },   /* both layers off: the speed safety net would otherwise hide it */
  { name: 'flair ignored in the flight', file: 'pose', from: 'const fsg = face >= 0 ? 1 : -1, flair = f.flair | 0;', to: 'const fsg = face >= 0 ? 1 : -1, flair = 0;', expect: 'flairWorks' },
  { name: 'no shoulder width', file: 'data', from: 'head: 11, shoulder: 7 }', to: 'head: 11, shoulder: 0 }', expect: 'shoulderGirdle' },
  { name: 'punch does not extend', file: 'pose', from: "kind === 'hook' ? 85 : 5, ex)", to: "kind === 'hook' ? 85 : 100, ex)", expect: 'punchExtends' },
  { name: 'protection never starts', file: 'sim', from: 'd.protect = 99; }', to: 'd.protect = 0; }', expect: 'chainCapped' },
  { name: 'protection placeholder never converted', file: 'sim', from: 'if (f.protect > C.PROTECT_AFTER) f.protect = C.PROTECT_AFTER;', to: '', extra: [{ from: 'if (f.protect > 0) f.protect = C.PROTECT_AFTER;', to: '' }], expect: 'protectionEnds' },
  { name: 'no damage cap while protected', file: 'sim', from: 'const allowed = Math.max(0, Math.min(d.budget, d.hp - 1));', to: 'const allowed = d.hp + 1000;', expect: 'chainCapped' },
  { name: 'config no longer frozen', file: 'data', from: 'SF.CFG = SF.deepFreeze({', to: 'SF.CFG = ({', expect: 'frozenConfig' },
  { name: 'K.O. no longer freezes the match', file: 'sim', from: 'if (m.winner !== null) {', to: 'if (false) {', expect: 'koFreezes' }
];
function runAll() {
  const base = load(null), report = [];
  for (const c in checks) { const r = checks[c](base); if (r) report.push('BASELINE FAILS ' + c + ': ' + r); }
  for (const mu of mutations) {
    let SF; try { SF = load(mu); } catch (e) { report.push('MUTATION ERROR ' + mu.name + ': ' + e.message); continue; }
    const r = checks[mu.expect](SF);
    if (!r) report.push('SURVIVED (the test cannot see this defect): ' + mu.name);
  }
  return report;
}
module.exports = { runAll: runAll, mutations: mutations };
if (require.main === module) {
  const r = runAll(); r.forEach(x => console.log(x));
  console.log(r.length ? r.length + ' problem(s)' : 'all ' + mutations.length + ' mutations were detected; baseline clean');
  process.exit(r.length ? 1 : 0);
}

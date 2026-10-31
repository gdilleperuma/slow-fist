'use strict';
// Mutation checks for the code added after iteration 7 (QA guide 20.11): touch decoder and plan, boost, turn, teams, lone-side balance, boxes,
// training and the tutorial. Each mutation breaks one line on purpose and a small check must notice. Run: node tests/mutate2.js
const fs = require('fs'), path = require('path'), vm = require('vm');
const FILES = ['src/rng', 'src/data', 'src/sim', 'src/pose', 'src/ai', 'src/sound', 'src/replay', 'src/help', 'src/settings', 'src/feedback', 'src/actions', 'src/training', 'src/tutorial', 'mobile/decode', 'mobile/plan', 'mobile/layout'];
function load(patch) {
  const ctx = vm.createContext({ console: console, Math: Math, Object: Object, JSON: JSON, Set: Set, Array: Array });
  ctx.window = ctx;      /* decode.js and plan.js attach themselves to the window */
  const code = FILES.map(n => {
    let t = fs.readFileSync(path.join(__dirname, '..', n + '.js'), 'utf8');
    for (const pt of [].concat(patch || [])) if (pt.file === n) { if (t.indexOf(pt.from) < 0) throw new Error('mutation target not found in ' + n + ': ' + pt.from); t = t.replace(pt.from, pt.to); }
    return t;
  }).join('\n;\n');
  vm.runInContext(code + '\n;this.SF = SF;', ctx);
  return { SF: ctx.SF, SFC: ctx.SFC, SFP: ctx.SFP, SFL: ctx.SFL };
}
const NONE = {};
const duel = SF => { const m = SF.createMatch({ seed: 5, styles: [0, 0], ai: [false, false] }); m.f[0].x = 300; m.f[1].x = 350; return m; };
const line = (a, b, ms, hz) => { const pts = [], n = Math.round(ms * hz / 1000); for (let i = 0; i <= n; i++) { const u = i / n; pts.push({ x: a[0] + (b[0] - a[0]) * u, y: a[1] + (b[1] - a[1]) * u, t: i * 1000 / hz }); } return pts; };
function playTouch(L, pts, limb, tutorial) {
  const { SF, SFC, SFP } = L; const m = tutorial ? SF.createMatch({ seed: 5, styles: [0, 0], ai: [false, false], tutorial: 1 }) : duel(SF), a = m.f[0];
  if (tutorial) { m.f[1].x = 860; SF.setDummy(m, 'fixed'); }
  let plan = SFP.pending(limb), last = null, down = true; const out = { states: new Set(), names: [], swings: [] }; const end = pts[pts.length - 1].t;
  for (let i = 0; i < 150; i++) {
    const t = i * 1000 / 60; if (t > end && down) down = false;
    const cur = pts.filter(p => p.t <= t); if (!cur.length) cur.push(pts[0]);
    const r = SFC.classify(cur, limb, 1, !down);
    if (r && !(tutorial && r.type === 'GRAPPLE')) { SFP.observe(plan, r); const key = r.type + '|' + r.move; if (key !== last) { const first = last === null; last = key; if (first || (plan && !plan.released)) plan = SFP.planFor(r, limb, plan ? plan.steps : 0, !!tutorial); } }
    const s = SFP.step(plan, a, down); plan = s.plan; SF.step(m, [s.inp, NONE]); out.states.add(a.state);
    if (a.state === 'strike' && a.str && out.names.indexOf(a.str.name) < 0) out.names.push(a.str.name);
    for (const e of m.ev) if (e.k === 'swing') out.swings.push(e);
  }
  return out;
}

const checks = {
  decoderBackFlick: L => { const r = L.SFC.classify(line([0, 0], [-6, 0], 100, 120), 'hand', 1, true); return r.type !== 'GRAPPLE' ? null : 'a 6 mm flick back is a grapple'; },
  decoderOutAndBack: L => { const out = line([0, 0], [18, 0], 100, 120), back = line([18, 0], [1, 0], 100, 120).map(p => ({ x: p.x, y: p.y, t: p.t + 100 })); const r = L.SFC.classify(out.concat(back.slice(1)), 'hand', 1, true); return r.type === 'STRAIGHT' ? null : 'out and back is ' + r.type; },
  decoderEarlyCommit: L => { const s = line([0, 0], [20, 0], 160, 120); let at = -1; for (let i = 2; i <= s.length; i++) { if (L.SFC.classify(s.slice(0, i), 'hand', 1, false)) { at = s[i - 1].t; break; } } return at >= 0 && at <= 60 ? null : 'commit after ' + at + ' ms'; },
  decoderNoise: L => { let seed = 9; const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff; const pts = line([0, 0], [26, 0], 520, 240).map(p => ({ x: p.x + (rnd() - 0.5) * 0.8, y: p.y + (rnd() - 0.5) * 0.8, t: p.t })); const r = L.SFC.classify(pts, 'hand', 1, true); return r.move === 'HEAVY CROSS' ? null : 'noisy slow stroke is ' + r.move; },
  decoderFacing: L => { const r = L.SFC.classify(line([0, 0], [-20, 0], 160, 120), 'hand', -1, true); return r.type === 'STRAIGHT' ? null : 'facing left, a stroke to the left is ' + r.type; },
  planHook: L => { const pts = []; for (let i = 0; i <= 26; i++) { const a = (90 - 150 * i / 26) * Math.PI / 180; pts.push({ x: Math.cos(a) * 12, y: -12 + Math.sin(a) * 12 + 0, t: i * 1000 / 120 }); } const o = playTouch(L, pts.map(p => ({ x: p.x, y: p.y, t: p.t })), 'hand', false); return o.names.indexOf('HOOK') >= 0 ? null : 'the curve gave ' + o.names.join(','); },
  planSure: ({ SFP }) => { const f = { aim: 0, state: 'charge' }; let plan = SFP.planFor({ type: 'STRAIGHT', tier: 'quick', ang: 0, phase: 'commit', move: 'JAB' }, 'hand', 0); let held = 0; for (let i = 0; i < 8; i++) { const s = SFP.step(plan, f, true); plan = s.plan; if (s.inp.punch) held++; } if (held < 8) return 'a quick straight move was released before the path was clear (held ' + held + ' of 8 steps)'; SFP.observe(plan, { extent: 10, turn: 3, phase: 'commit', ang: 0 }); const s2 = SFP.step(plan, f, true); return s2.inp.punch ? 'not released after the path was clear' : null; },
  planGrapple: L => { const o = playTouch(L, line([0, 0], [-16, 0], 120, 120), 'hand', false); return o.states.has('grab') ? null : 'a back-draw did not grab: ' + [...o.states].join(','); },
  planHeavy: L => { const o = playTouch(L, line([0, 0], [26, 0], 520, 120), 'hand', false); return o.names.indexOf('SPINNING BACKFIST') >= 0 ? null : 'a long slow line gave ' + o.names.join(','); },
  planAngle: L => { const o = playTouch(L, line([0, 0], [17, -9], 160, 120), 'hand', true); const sw = o.swings[0]; return sw && Math.abs(sw.ang - 28) <= 6 ? null : 'a line at 28 degrees punched at ' + (sw && sw.ang); },
  boostDamage: ({ SF }) => { const hit = b => { const m = duel(SF), a = m.f[0], d = m.f[1]; a.boostT = b ? 3 : 0; const hp0 = d.hp; SF.beginMove(m, a, 'CROSS', 1); for (let i = 0; i < 60; i++) { SF.step(m, [NONE, NONE]); if (m.ev.some(e => e.k === 'hit')) break; } return hp0 - d.hp; }; const r = hit(true) / hit(false); return Math.abs(r - 1.5) < 0.02 ? null : 'boost ratio ' + r.toFixed(2); },
  boostCost: ({ SF }) => { const m = duel(SF); m.f[0].sta = 29; SF.step(m, [{ boost: true }, NONE]); const poor = m.f[0].boostT > 0; const n = duel(SF); n.f[0].sta = 100; SF.step(n, [{ boost: true }, NONE]); return !poor && n.f[0].boostT > 0 && n.f[0].sta < 75 ? null : 'boost cost wrong: ' + poor + ' ' + n.f[0].sta; },
  turnLock: ({ SF }) => { const m = duel(SF); SF.step(m, [{ turn: true }, NONE]); for (let i = 0; i < 90; i++) SF.step(m, [NONE, NONE]); return m.f[0].face === -1 ? null : 'the turn did not hold for 1.5 s'; },
  noHitBehind: ({ SF }) => { const m = duel(SF); SF.step(m, [{ turn: true }, NONE]); SF.step(m, [NONE, NONE]); SF.beginMove(m, m.f[0], 'JAB', 1); const hp = m.f[1].hp; for (let i = 0; i < 40; i++) SF.step(m, [NONE, NONE]); return m.f[1].hp === hp ? null : 'hit an opponent behind'; },
  friendlyFire: ({ SF }) => { const m = SF.createMatch({ seed: 3, styles: [0, 1, 2], ai: [false, false, false], teams: [0, 0, 1] }); m.f[0].x = 300; m.f[1].x = 340; m.f[2].x = 800; const hp = m.f[1].hp; SF.beginMove(m, m.f[0], 'CROSS', 1); for (let i = 0; i < 60; i++) SF.step(m, [NONE, NONE, NONE]); return m.f[1].hp === hp ? null : 'hit an ally'; },
  loneArmor: ({ SF }) => { const taken = teams => { const q = SF.createMatch({ seed: 3, styles: teams.map(() => 0), ai: teams.map(() => false), teams: teams }); q.f.forEach(f => { f.x = 900; f.protect = 0; }); const a = q.f[1], d = q.f[0]; a.x = 350; d.x = 300; a.face = -1; d.face = 1; const hp0 = d.hp; SF.beginMove(q, a, 'CROSS', 1); for (let i = 0; i < 60; i++) { SF.step(q, teams.map(() => NONE)); if (q.ev.some(e => e.k === 'hit')) break; } return hp0 - d.hp; }; const r = taken([0, 1, 1]) / taken([0, 1]); return Math.abs(r - 0.4) < 0.03 ? null : 'lone damage ratio ' + r.toFixed(2); },
  loneHealth: ({ SF }) => { const m = SF.createMatch({ seed: 3, styles: [0, 0, 0], ai: [false, false, false], teams: [0, 1, 1] }); return Math.abs(m.f[0].hpMax - 150 * 2.5) < 0.1 ? null : 'lone health ' + m.f[0].hpMax; },
  grabCancel: ({ SF }) => { const m = duel(SF); for (let i = 0; i < 6; i++) SF.step(m, [{ punch: true }, NONE]); SF.step(m, [{ punch: true, grab: true }, NONE]); return m.f[0].state === 'grab' ? null : 'a young wind-up could not be cancelled into a grab: ' + m.f[0].state; },
  boxSolid: ({ SF }) => { const m = duel(SF); m.f[1].x = 800; m.obstacles = [{ x: 450, w: 80, h: 45 }]; for (let i = 0; i < 200; i++) SF.step(m, [{ right: true }, NONE]); return m.f[0].x <= 450 - 40 - 16 + 0.5 ? null : 'walked into a box: ' + m.f[0].x.toFixed(1); },
  boxClimb: ({ SF }) => { const m = duel(SF); m.f[1].x = 800; m.obstacles = [{ x: 450, w: 80, h: 45 }]; for (let i = 0; i < 120; i++) SF.step(m, [{ right: true }, NONE]); SF.step(m, [{ right: true, jump: true }, NONE]); for (let i = 0; i < 40; i++) SF.step(m, [{ right: true }, NONE]); for (let i = 0; i < 160; i++) SF.step(m, [NONE, NONE]); return m.f[0].h === 45 ? null : 'did not land on the box: h = ' + m.f[0].h; },
  boxThrow: ({ SF }) => { let landed = 0, inside = 0; for (let bx = 600; bx <= 800; bx += 20) { const m = duel(SF); const a = m.f[0], d = m.f[1]; m.obstacles = [{ x: bx, w: 80, h: 50 }]; a.x = 500; a.face = -1; d.x = 455; d.face = 1; SF.doThrow(m, a, d); if (a.state !== 'grapple') continue; for (let i = 0; i < 200; i++) { SF.step(m, [NONE, NONE]); if (d.state !== 'flipped' && m.obstacles.some(b => d.h < b.h - 10.5 && Math.abs(d.x - b.x) < b.w / 2 + 15.5)) inside++; } if (d.h === 50) landed++; } return landed >= 1 && inside === 0 ? null : 'thrown fighters landed on a box ' + landed + ' times, inside a box ' + inside + ' steps'; },
  trainingNoKO: ({ SF }) => { const m = SF.createMatch({ seed: 5, styles: [0, 0], ai: [false, false], training: 1 }); m.f[0].x = 300; m.f[1].x = 350; m.f[1].hp = 0.5; m.f[1].protect = 0; SF.beginMove(m, m.f[0], 'CROSS', 1); for (let i = 0; i < 40; i++) SF.step(m, [NONE, NONE]); return m.winner === null ? null : 'K.O. in training'; },
  trainingStamina: ({ SF }) => { const m = SF.createMatch({ seed: 5, styles: [0, 0], ai: [false, false], training: 1 }); m.f[0].sta = 5; SF.step(m, [NONE, NONE]); return m.f[0].sta === 100 ? null : 'the trainee tires'; },
  tutorialPlanted: ({ SF }) => { const m = SF.createMatch({ seed: 5, styles: [0, 0], ai: [false, false], tutorial: 1 }); m.f[1].x = 860; const x0 = m.f[0].x; for (let i = 0; i < 60; i++) SF.step(m, [{ right: true }, NONE]); return m.f[0].x === x0 ? null : 'the trainee walked'; },
  tutorialNoLunge: ({ SF }) => { const m = SF.createMatch({ seed: 5, styles: [0, 0], ai: [false, false], tutorial: 1 }); m.f[1].x = 860; const x0 = m.f[0].x; for (let i = 0; i < 60; i++) SF.step(m, [{ punch: i < 3 }, NONE]); return m.f[0].x === x0 ? null : 'the punch lunged'; },
  tutorialSwing: ({ SF }) => { const m = SF.createMatch({ seed: 5, styles: [0, 0], ai: [false, false], tutorial: 1 }); m.f[1].x = 860; let n = 0; for (let i = 0; i < 60; i++) { SF.step(m, [{ punch: i < 3 }, NONE]); n += m.ev.filter(e => e.k === 'swing').length; } return n === 1 ? null : 'swing events: ' + n; },
  fixedDummy: ({ SF }) => { const m = duel(SF); SF.setDummy(m, 'fixed'); const x0 = m.f[1].x; SF.beginMove(m, m.f[0], 'SPINNING BACKFIST', 1); for (let i = 0; i < 60; i++) SF.step(m, [NONE, NONE]); return m.f[1].x === x0 && m.f[1].state === 'idle' ? null : 'the fixed dummy moved or reacted'; },
  tutorialTolerance: ({ SF }) => { const t = SF.tutorialNew(1); SF.tutorialFeed(t, { ev: [{ k: 'swing', a: 0, ang: 35, s: 1 }], steps: 10 }); return (t.counts.level || 0) === 0 ? null : 'a 35 degree miss counted'; },
  tutorialStrength: ({ SF }) => { const t = SF.tutorialNew(1); t.idx = 6; t.k = 0; const need = SF.tutorialTarget(t); SF.tutorialFeed(t, { ev: [{ k: 'swing', a: 0, ang: need.ang, s: need.need === 'heavy' ? 0.7 : 1.5 }], steps: 10 }); return (t.counts.strength || 0) === 0 ? null : 'the wrong strength counted'; },
  trainingOwnHits: ({ SF }) => { const t = SF.trainingNew(0); SF.trainingFeed(t, { ev: [{ k: 'hit', a: 1, d: 0, tag: 'HIT', name: 'JAB' }] }); return (t.counts.jab || 0) === 0 ? null : 'the dummy\'s jab counted for the trainee'; },
  settingsClamp: ({ SF }) => { const a = SF.settingsClean({ size: 9, opacity: -2, hudScale: 99 }); return a.size === 1.4 && a.opacity === 0.3 && a.hudScale === 1.6 ? null : 'not clamped: ' + JSON.stringify(a); },
  settingsTypes: ({ SF }) => { const a = SF.settingsClean({ floating: 'yes', hand: 'up', palette: 'neon' }); return a.floating === false && a.hand === 'right' && a.palette === 'normal' ? null : 'wrong types accepted'; },
  paletteDistinct: ({ SF }) => { const b = SF.palette('safe'), rgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)), d = (x, y) => Math.hypot(...rgb(x).map((v, i) => v - rgb(y)[i])); const cols = [].concat(b.team[0], b.team[1], [b.hp, b.sta, b.guard]); for (let i = 0; i < cols.length; i++) for (let j = i + 1; j < cols.length; j++) if (d(cols[i], cols[j]) <= 70) return cols[i] + ' and ' + cols[j] + ' are too close'; return null; },
  onboardOnce: ({ SF }) => SF.shouldOnboard({ seenIntro: false }) && !SF.shouldOnboard({ seenIntro: true }) ? null : 'the first-run rule is wrong',
  layoutMirror: ({ SF, SFL }) => { const a = SFL.compute(850, 393, 6, SF.settingsClean({}), false), b = SFL.compute(850, 393, 6, SF.settingsClean({ hand: 'left' }), false); return Math.abs(b.hand.x - (850 - a.hand.x)) < 1e-6 && Math.abs(b.block.x - (850 - a.block.x)) < 1e-6 ? null : 'not mirrored'; },
  layoutClear: ({ SF, SFL }) => { for (const size of [0.7, 1, 1.4]) { const g = SFL.compute(850, 393, 6, SF.settingsClean({ size: size }), false); for (const k of ['block', 'turn', 'boost']) if (Math.hypot(g[k].x - g.home.x, g[k].y - g.home.y) < g.home.r + g[k].r - 1) return k + ' overlaps the move circle at size ' + size; } return null; },
  layoutSize: ({ SF, SFL }) => { const a = SFL.compute(850, 393, 6, SF.settingsClean({ size: 0.7 }), false), b = SFL.compute(850, 393, 6, SF.settingsClean({ size: 1.4 }), false); return a.R < b.R && a.pad < b.pad ? null : 'size has no effect'; },
  zoneTap: ({ SF, SFL }) => { const s = SF.settingsClean({}), g = SFL.compute(850, 393, 6, s, false); return SFL.zoneAt(g, 850, 393, { x: 560, y: 250 }, s) === 'tap' && SFL.zoneAt(g, 850, 393, { x: 560, y: 250 }, SF.settingsClean({ tapJab: false })) === null ? null : 'the tap zone is wrong'; },
  zoneTurnHidden: ({ SF, SFL }) => { const s = SF.settingsClean({ turnButton: false }), g = SFL.compute(850, 393, 6, s, false); return SFL.zoneAt(g, 850, 393, g.turn, s) !== 'turn' ? null : 'a hidden TURN button still answers'; },
  backBlock: ({ SFP }) => { const on = { backBlock: true }; return SFP.stickInputs('left', 1, on).block && SFP.stickInputs('right', -1, on).block && !SFP.stickInputs('right', 1, on).block && !SFP.stickInputs('left', 1, { backBlock: false }).block ? null : 'back-block is wrong'; },
  feedbackScope: ({ SF }) => { const e = [{ k: 'hit', a: 1, d: 2, tag: 'HIT', dmg: 20 }]; const r = SF.feedbackFor(e, 0); return r.stopMs === 0 && r.vibrate.length === 0 ? null : 'feedback for a fight we are not in'; },
  feedbackCap: ({ SF }) => { const r = SF.feedbackFor([{ k: 'hit', a: 0, d: 1, tag: 'HIT', dmg: 99999 }], 0); return r.stopMs > 0 && r.stopMs <= 250 ? null : 'the pause is ' + r.stopMs; },
  feedbackBlock: ({ SF }) => { const sum = v => v.reduce((t, x) => t + x, 0); const hit = SF.feedbackFor([{ k: 'hit', a: 1, d: 0, tag: 'HIT', dmg: 10 }], 0), blk = SF.feedbackFor([{ k: 'hit', a: 1, d: 0, tag: 'BLOCK', dmg: 1 }], 0); return sum(hit.vibrate) > sum(blk.vibrate) && blk.vibrate.length > 0 ? null : 'a block does not buzz less than a hit'; },
  actionPoses: ({ SF }) => { const p = SF.actionPoses('move:JAB'); const d = (a, b) => Math.max(Math.hypot(a.hand[0][0] - b.hand[0][0], a.hand[0][1] - b.hand[0][1]), Math.hypot(a.hand[1][0] - b.hand[1][0], a.hand[1][1] - b.hand[1][1])); return p.length === 3 && d(p[0].sk, p[1].sk) > 6 ? null : 'the wind-up and the contact look the same'; },
  actionList: ({ SF }) => { const ids = SF.actionList(0).map(a => a.id); for (const n in SF.CFG.MOVES) if (ids.indexOf('move:' + n) < 0) return n + ' missing'; return SF.INPUT_KEYS.every(k => SF.actionList(0).some(a => a.keys.indexOf(k) >= 0)) ? null : 'an input key has no action'; },
  actionDistinct: ({ SF }) => { const vec = sk => { const h = sk.hip, out = []; for (const k of ['head', 'neck', 'chest', 'shoulder', 'shoulderB']) out.push(sk[k][0] - h[0], sk[k][1] - h[1]); for (const k of ['elbow', 'hand', 'knee', 'foot']) for (let i = 0; i < 2; i++) out.push(sk[k][i][0] - h[0], sk[k][i][1] - h[1]); return out; }; const rms = (a, b) => Math.sqrt(a.reduce((t, v, i) => t + (v - b[i]) * (v - b[i]), 0) / a.length); const ids = SF.actionList(0).filter(a => a.id.indexOf('move:') === 0).map(a => a.id), P = {}; for (const id of ids) { const p = SF.actionPoses(id)[1]; P[id] = { v: vec(p.sk), sx: p.sx }; } for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) { const d = rms(P[ids[i]].v, P[ids[j]].v) + 40 * Math.abs(P[ids[i]].sx - P[ids[j]].sx); if (d < 4) return ids[i] + ' and ' + ids[j] + ' look the same (' + d.toFixed(1) + ')'; } return null; },
  flashPick: ({ SF }) => { const K = (o) => { const m = SF.createMatch({ seed: 5, styles: [0, 0], ai: [false, false] }), f = m.f[0]; f.limb = 'kick'; f.charge = o.charge || 0; f.aim = o.aim || 0; f.air = true; f.cr = 0; return SF.pickMove(f).name; }; return K({}) === 'FLYING SIDE KICK' && K({ aim: 30 }) === 'BUTTERFLY KICK' && K({ charge: 0.4 }) === 'TORNADO KICK' ? null : 'the aerial kicks are chosen wrongly: ' + K({}) + ', ' + K({ aim: 30 }) + ', ' + K({ charge: 0.4 }); },
  axeFromHold: ({ SF }) => { const m = SF.createMatch({ seed: 5, styles: [0, 0], ai: [false, false] }), f = m.f[0]; f.limb = 'kick'; f.charge = 0.6; f.aim = 0; f.air = false; f.cr = 0; const r = SF.pickMove(f); return r.name === 'AXE KICK' && r.a >= 30 ? null : 'a long kick hold is ' + r.name + ' at ' + r.a; },
  recovChoice: ({ SF }) => { const lying = (face, sta) => { const m = SF.createMatch({ seed: 5, styles: [0, 0], ai: [false, false] }), f = m.f[0]; m.f[1].x = 860; f.x = 400; f.face = face; f.state = 'down'; f.t = 0.5; f.stagDur = 2.5; f.sta = sta; f.protect = 99; f.budget = 30; return m; }; const pick = (inp, face, sta) => { const m = lying(face, sta === undefined ? 100 : sta); SF.step(m, [inp, {}]); return m.f[0].recov; }; return pick({ jump: true }, 1) === 'kip' && pick({ right: true }, 1) === 'fwd' && pick({ left: true }, 1) === 'back' && pick({ crouch: true }, 1) === 'guard' && pick({ left: true }, -1) === 'fwd' && pick({ jump: true }, 1, 10) === null && pick({ crouch: true }, 1, 0) === 'guard' ? null : 'the recovery choice is wrong'; },
  recovEarly: ({ SF }) => { const m = SF.createMatch({ seed: 5, styles: [0, 0], ai: [false, false] }), f = m.f[0]; m.f[1].x = 860; f.x = 400; f.state = 'down'; f.t = 0.1; f.stagDur = 2.5; f.sta = 100; f.protect = 99; SF.step(m, [{ jump: true }, {}]); return f.state === 'down' ? null : 'a recovery started too early'; },
  recovSafe: ({ SF }) => { const m = SF.createMatch({ seed: 5, styles: [0, 0], ai: [false, false] }), f = m.f[0], a = m.f[1]; f.x = 400; a.x = 455; a.face = -1; f.state = 'down'; f.t = 0.5; f.stagDur = 2.5; f.sta = 100; f.protect = 99; f.budget = 30; SF.step(m, [{ crouch: true }, {}]); const hp0 = f.hp; SF.beginMove(m, a, 'JAB', 1); for (let i = 0; i < 20; i++) SF.step(m, [{}, {}]); return f.hp === hp0 ? null : 'the guard stand-up was hit while it should be safe'; },
  recovRoll: ({ SF }) => { const run = (inp) => { const m = SF.createMatch({ seed: 5, styles: [0, 0], ai: [false, false] }), f = m.f[0]; m.f[1].x = 860; f.x = 400; f.face = 1; f.state = 'down'; f.t = 0.5; f.stagDur = 2.5; f.sta = 100; f.protect = 99; SF.step(m, [inp, {}]); const x0 = f.x; for (let i = 0; i < 70; i++) SF.step(m, [{}, {}]); return f.x - x0; }; return Math.abs(run({ right: true }) - 70) < 3 && Math.abs(run({ left: true }) + 90) < 3 ? null : 'the rolls do not carry the body'; },
  breakFall: ({ SF }) => { const m = SF.createMatch({ seed: 5, styles: [0, 0], ai: [false, false] }), f = m.f[0]; m.f[1].x = 860; f.x = 400; f.state = 'down'; f.t = 0; f.stagDur = 2; f.protect = 99; f.techDone = false; SF.step(m, [{ right: true }, {}]); const early = f.stagDur; const l = SF.createMatch({ seed: 5, styles: [0, 0], ai: [false, false] }), g = l.f[0]; l.f[1].x = 860; g.x = 400; g.state = 'down'; g.t = 0; g.stagDur = 2; g.protect = 99; g.techDone = false; for (let i = 0; i < 20; i++) SF.step(l, [{}, {}]); SF.step(l, [{ right: true }, {}]); return Math.abs(early - 2 * SF.CFG.TECH_SHORTEN) < 1e-6 && g.stagDur === 2 ? null : 'the break-fall window is wrong'; },
  recovPose: ({ SF }) => { const f = SF.createMatch({ seed: 5, styles: [0, 0], ai: [false, false] }).f[0]; Object.assign(f, { state: 'getup', recov: 'fwd', getDur: 0.8, t: 0.3, face: 1 }); const a = SF.poseParams(f, 0).rot; f.recov = 'back'; const b = SF.poseParams(f, 0).rot; return a > 0.5 && b < -0.5 ? null : 'the rolls do not turn the body over, in opposite directions'; },
  speedDefault: ({ SF }) => SF.DEFAULT_SPEED === 1 ? null : 'the default speed is ' + SF.DEFAULT_SPEED
};

const M = [
  ['decoder: back-draw needs no minimum length', 'mobile/decode', 'BACK_MM: 9,', 'BACK_MM: 1,', 'decoderBackFlick'],
  ['decoder: the stroke is not cut at its farthest point', 'mobile/decode', 'const s = pts.slice(0, peak + 1)', 'const s = pts.slice(0)', 'decoderOutAndBack'],
  ['decoder: commits only after 15 mm', 'mobile/decode', 'COMMIT_MM: 2.5,', 'COMMIT_MM: 15,', 'decoderEarlyCommit'],
  ['decoder: speed window of 1 ms', 'mobile/decode', 'WINDOW_MS: 60 ', 'WINDOW_MS: 1 ', 'decoderNoise'],
  ['decoder: facing ignored', 'mobile/decode', 'const f = facing < 0 ? -1 : 1', 'const f = 1', 'decoderFacing'],
  ['plan: a straight move is released before the path is clear (hook becomes a jab)', 'mobile/plan', '(!plan.needSure || plan.sure)', 'true', 'planSure'],
  ['plan: the grab key is pressed after the wait', 'mobile/plan', 'if (r.type === \'GRAPPLE\') { p.grab = true; p.steps = 0; return p; }', 'if (r.type === \'GRAPPLE\') { p.grab = true; return p; }', 'planGrapple'],
  ['plan: heavy stroke released early', 'mobile/plan', "p.waitAim = Math.abs(p.aim) > 8; p.hold = r.tier === 'heavy' ? HOLD.heavy", "p.waitAim = Math.abs(p.aim) > 8; p.hold = r.tier === 'heavy' ? HOLD.quick", 'planHeavy'],
  ['plan: the stroke angle is not the aim', 'mobile/plan', 'p.aimFromStroke = true; p.aim = aimOf(r.ang || 0); p.waitAim = Math.abs(p.aim) > 4;', 'p.aimFromStroke = true; p.aim = 0; p.waitAim = false;', 'planAngle', [{ file: 'mobile/plan', from: 'plan.aim = aimOf(r.ang); plan.waitAim = Math.abs(plan.aim) > 4;', to: 'plan.aim = 0;' }]],
  ['boost does not raise the damage', 'src/sim', '* (a.boostT > 0 ? C.BOOST_DMG : 1);\n    const tol', '* 1;\n    const tol', 'boostDamage'],
  ['boost costs nothing', 'src/sim', 'f.sta >= C.BOOST_COST && spend(f, C.BOOST_COST)', 'f.sta >= 0', 'boostCost'],
  ['turn is overridden by the automatic facing', 'src/sim', 'if (f.faceLock <= 0 && (f.state', 'if ((f.state', 'turnLock'],
  ['a strike can hit behind a locked facing', 'src/sim', 'inRange: dx <= reach + 18 && !behind,', 'inRange: dx <= reach + 18,', 'noHitBehind'],
  ['allies are targets', 'src/sim', 'if (q.team === f.team || q.ko) continue;', 'if (q.idx === f.idx || q.ko) continue;', 'friendlyFire'],
  ['the lone side takes full damage', 'src/sim', '    dmg *= d.armor;   /* the outnumbered side takes less damage */', '', 'loneArmor'],
  ['the lone side gets no health bonus', 'src/sim', '1 + C.LONE_BONUS * extra));', '1));', 'loneHealth'],
  ['a grab cannot cancel a young wind-up', 'src/sim', 'f.charge < C.GRAB_CANCEL;', 'false;', 'grabCancel'],
  ['boxes are not solid from the side', 'src/sim', 'if (f.h < b.h - 10 && Math.abs(f.x - b.x) < b.w / 2 + 16) { f.x = f.x < b.x ? b.x - b.w / 2 - 16 : b.x + b.w / 2 + 16; f.vx = 0; }\n\n', '\n\n', 'boxSolid'],
  ['nobody lands on a box', 'src/sim', 'f.h >= b.h - 10 && b.h > g) g = b.h;', 'false) g = b.h;', 'boxClimb'],
  ['a thrown fighter lands at floor level', 'src/sim', 'd.h = SF.floorUnder(m, d.x);   /* he lands', 'd.h = 0;   /* he lands', 'boxThrow'],
  ['training: K.O. still happens', 'src/sim', 'if (m.training && d.hp <= 0) {', 'if (false) {', 'trainingNoKO'],
  ['training: stamina not refilled', 'src/sim', 'if (m.training) { m.f[0].sta = 100;', 'if (false) { m.f[0].sta = 100;', 'trainingStamina'],
  ['tutorial: the trainee can walk', 'src/sim', 'if (m.tutorial && f.idx === 0) inp = {', 'if (false) inp = {', 'tutorialPlanted'],
  ['tutorial: the punch lunges', 'src/sim', 'lunge: m.tutorial ? 0 : mv.lunge,', 'lunge: mv.lunge,', 'tutorialNoLunge'],
  ['tutorial: no swing event', 'src/sim', 'if (m.tutorial && !str.swung', 'if (false && !str.swung', 'tutorialSwing'],
  ['the fixed dummy can be moved', 'src/sim', 'for (const q of m.f) if (q.fixed) { q.x = q.fx;', 'for (const q of m.f) if (q.fixed) { q.fx = q.fx;', 'fixedDummy'],
  ['tutorial: every swing is a hit', 'src/tutorial', 'if (Math.abs(diff) > g.tol) {', 'if (false) {', 'tutorialTolerance'],
  ['tutorial: strength is not checked', 'src/tutorial', "} else if (g.need === 'heavy' && e.s < HEAVY_S) {", '} else if (false) {', 'tutorialStrength'],
  ['training: the dummy\'s hits count', 'src/training', "if (e.k === 'hit' && e.a === 0 && e.tag === 'HIT' && e.name === d.hitMove)", "if (e.k === 'hit' && e.tag === 'HIT' && e.name === d.hitMove)", 'trainingOwnHits'],
  ['settings: no clamping', 'src/settings', 'return typeof v === \'number\' && isFinite(v) ? Math.max(lo, Math.min(hi, v)) : dflt;', 'return typeof v === \'number\' && isFinite(v) ? v : dflt;', 'settingsClamp'],
  ['settings: a string is a boolean', 'src/settings', "const bool = function (v, dflt) { return typeof v === 'boolean' ? v : dflt; };", "const bool = function (v, dflt) { return v ? true : dflt; };", 'settingsTypes'],
  ['palette: two colours the same', 'src/settings', "sta: '#FFFFFF'", "sta: '#F0E442'", 'paletteDistinct'],
  ['onboarding offered every time', 'src/settings', 'SF.shouldOnboard = function (s) { return !s.seenIntro; };', 'SF.shouldOnboard = function (s) { return true; };', 'onboardOnce'],
  ['layout: left-handed is not mirrored', 'mobile/layout', 'const mx = function (x) { return mir ? W - x : x; };', 'const mx = function (x) { return x; };', 'layoutMirror'],
  ['layout: the buttons sit on the move circle', 'mobile/layout', 'ring = pad + br + 8;', 'ring = pad - 10;', 'layoutClear'],
  ['layout: the size setting does nothing', 'mobile/layout', 'const size = s.size, mir', 'const size = 1, mir', 'layoutSize'],
  ['touch: no tap zone', 'mobile/layout', 'if (s.tapJab && (mir', 'if (false && (mir', 'zoneTap'],
  ['touch: a hidden TURN button still answers', 'mobile/layout', 'for (const b of s.turnButton ? [\'block\', \'boost\', \'turn\'] : [\'block\', \'boost\'])', 'for (const b of [\'block\', \'boost\', \'turn\'])', 'zoneTurnHidden'],
  ['back-block blocks forward', 'mobile/plan', "seg === (face >= 0 ? 'left' : 'right')", "seg === (face >= 0 ? 'right' : 'right')", 'backBlock'],
  ['feedback: other fighters\' hits count', 'src/feedback', 'else if (e.d === me) {', 'else if (e.d !== undefined) {', 'feedbackScope'],
  ['feedback: the pause is not capped', 'src/feedback', 'stopMs: Math.min(MAX_STOP, Math.round(stop))', 'stopMs: Math.round(stop)', 'feedbackCap'],
  ['feedback: a block buzzes like a hit', 'src/feedback', 'else vib.push(10);', 'else vib.push(40);', 'feedbackBlock'],
  ['actions: the contact pose is the wind-up', 'src/actions', 'mv.fr[0] + 1, mv.fr[0] + mv.fr[1]', 'Math.max(1, Math.round(mv.fr[0] / 2)), mv.fr[0] + mv.fr[1]', 'actionPoses'],
  ['actions: the moves are not listed', 'src/actions', 'for (const m of help.moves) out.push', 'for (const m of []) out.push', 'actionList'],
  ['pose: the look of a kick is ignored', 'src/pose', 'const look = str.look; if (!look) return;', 'const look = str.look; return;', 'actionDistinct'],
  ['pose: the heavy punch is drawn like a cross', 'src/pose', "heavy = look === 'heavy' && wind <= 0;", "heavy = false;", 'actionDistinct'],
  ['the butterfly kick can never be chosen', 'src/sim', "a >= 25 ? 'BUTTERFLY KICK' : 'FLYING SIDE KICK'", "false ? 'BUTTERFLY KICK' : 'FLYING SIDE KICK'", 'flashPick'],
  ['the axe kick does not come from above', 'src/sim', "ang = SF.clampAim(f, 'kick', 40); }", "ang = a; }", 'axeFromHold'],
  ['recovery: no choice is read', 'src/sim', "const how = inp.jump ? 'kip' : fwd ? 'fwd' : back ? 'back' : inp.crouch ? 'guard' : null;", "const how = null;", 'recovChoice'],
  ['recovery: it can start at once', 'src/sim', 'if (f.t >= C.RECOV_MIN && f.t < f.stagDur - 0.05) {', 'if (f.t >= 0 && f.t < f.stagDur - 0.05) {', 'recovEarly'],
  ['recovery: nobody is ever safe', 'src/sim', 'function getupSafe(d) { return d.state === \'getup\' && d.t < (d.getInv === undefined ? C.GETUP_T * 0.55 : d.getInv); }', 'function getupSafe(d) { return false; }', 'recovSafe'],
  ['recovery: the rolls do not move', 'src/sim', 'if (f.recov === \'fwd\' || f.recov === \'back\') f.x = clamp(', 'if (false) f.x = clamp(', 'recovRoll'],
  ['recovery: the break-fall window is open forever', 'src/sim', 'if (!f.techDone && f.t <= C.TECH_AFTER && anyDir) techFall(m, f);', 'if (!f.techDone && anyDir) techFall(m, f);', 'breakFall'],
  ['recovery: the rolls are not drawn turning', 'src/pose', 'rotLook = sgnR * face * 2 * Math.PI * roll;', 'rotLook = 0;', 'recovPose'],
  ['the default speed is slow motion again', 'src/help', 'SF.DEFAULT_SPEED = 1;', 'SF.DEFAULT_SPEED = 0.7;', 'speedDefault']
];

/* the baseline must be clean, then every mutation must be caught */
const base = load(null); let bad = 0;
for (const k in checks) { let r; try { r = checks[k](base); } catch (e) { r = 'threw ' + e.message; } if (r) { console.log('BASELINE FAIL ' + k + ': ' + r); bad++; } }
if (bad) process.exit(1);
let missed = 0;
for (const [name, file, from, to, check, extra] of M) {
  let r;
  try { r = checks[check](load([{ file: file, from: from, to: to }].concat(extra || []))); } catch (e) { r = 'threw ' + e.message; }
  if (!r) { console.log('SURVIVED: ' + name + ' (check ' + check + ')'); missed++; }
}
console.log(missed ? missed + ' of ' + M.length + ' mutations were NOT detected' : 'all ' + M.length + ' mutations were detected; baseline clean');
process.exit(missed ? 1 : 0);

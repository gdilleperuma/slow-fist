/* The catalogue of everything a fighter can do, with preview poses taken from the game's own pose engine (so the pictures can never be out of date).
   Pure: no DOM. actionList() says what exists, actionPoses(id) gives three poses of each (start, contact, end), actionSvgs(id) draws them as images.
   tools/make-actions.js writes them to docs/ACTIONS.html; the Help panel and a test use the same functions. */
var SF = (typeof SF === 'undefined') ? {} : SF;
(function () {
  'use strict';
  const C = SF.CFG, clone = function (o) { return JSON.parse(JSON.stringify(o)); };
  const STAND = { id: 'stand', title: 'Stand and walk', group: 'Movement', keys: ['left', 'right'], note: 'The stance. Walk toward or away from the opponent.', keyboard: 'A / D', touch: 'move circle: left / right' };
  const OTHERS = [
    STAND,
    { id: 'jump', title: 'Jump', group: 'Movement', keys: ['jump'], note: 'A short hop (tap) or a higher jump (hold). It costs stamina.', keyboard: 'W', touch: 'move circle: up' },
    { id: 'crouch', title: 'Crouch', group: 'Movement', keys: ['crouch'], note: 'Ducks under high strikes and slips grabs.', keyboard: 'S', touch: 'move circle: down' },
    { id: 'sprint', title: 'Sprint', group: 'Movement', keys: ['left', 'right'], note: 'Press a direction twice quickly. Faster, but it costs stamina.', keyboard: 'tap D twice', touch: 'flick the move circle twice' },
    { id: 'dash', title: 'Dash', group: 'Movement', keys: ['dash'], note: 'A quick burst that cannot be hit for a moment: dash through a strike to dodge it.', keyboard: 'C', touch: 'flick the move circle sideways and let go' },
    { id: 'block', title: 'Block', group: 'Defence', keys: ['block'], note: 'Aim the guard at the incoming strike. It wears down the guard bar.', keyboard: 'H', touch: 'BLOCK button (or hold the stick away, if switched on)' },
    { id: 'parry', title: 'Parry', group: 'Defence', keys: ['block'], note: 'Raise the guard just before the hit lands, aimed at it: no damage and a counter chance.', keyboard: 'H, just before the hit', touch: 'tap BLOCK just before the hit' },
    { id: 'grab', title: 'Grapple', group: 'Grappling', keys: ['grab'], note: 'Close in and grab. It beats a guard, but a crouching or retreating opponent slips out.', keyboard: 'Z', touch: 'draw straight back in a circle' },
    { id: 'throw', title: 'Throw', group: 'Grappling', keys: ['grab'], note: 'A successful grab becomes a flip over the shoulder. The victim lands protected.', keyboard: 'Z, close up', touch: 'draw straight back, close up' },
    { id: 'knockdown', title: 'Knockdown', group: 'After a fall', keys: [], note: 'A heavy hit or a throw puts a fighter on the floor.', keyboard: '', touch: '' },
    { id: 'getup', title: 'Stand up by itself', group: 'After a fall', keys: [], note: 'With no choice, the fighter gets up by itself after the fall (standard, kip-up or tornado).', keyboard: '', touch: '' },
    { id: 'recover-kip', title: 'Kip-up', group: 'After a fall', keys: [], note: 'The fastest way up (0.5 s) but it costs 25 stamina and leaves you open for the last 0.3 s.', keyboard: 'W while down', touch: 'move circle up while down' },
    { id: 'recover-fwd', title: 'Forward roll to stand', group: 'After a fall', keys: [], note: 'Rolls over your shoulder toward the opponent and comes up facing him (0.8 s, 15 stamina, 70 px).', keyboard: 'D while down (facing right)', touch: 'move circle toward the opponent while down' },
    { id: 'recover-back', title: 'Back roll away', group: 'After a fall', keys: [], note: 'Rolls backward and away (0.8 s, 15 stamina, 90 px); safe for the first half second.', keyboard: 'A while down (facing right)', touch: 'move circle away from the opponent while down' },
    { id: 'recover-guard', title: 'Stay down and guard', group: 'After a fall', keys: [], note: 'The slow, safe stand-up (1.4 s, free): protected most of the way, and it rests stamina at the full rate.', keyboard: 'S while down', touch: 'move circle down while down' },
    { id: 'breakfall', title: 'Break-fall', group: 'After a fall', keys: [], note: 'A tap just as you land (or in the last quarter second of a throw) shortens the fall by a third and softens a throw by 30 percent.', keyboard: 'tap any direction as you land', touch: 'tap the move circle as you land' },
    { id: 'boost', title: 'Boost', group: 'Special', keys: ['boost'], note: 'For 4 seconds your hits deal 1.5 times the damage. It costs 30 stamina; cooldown 12 seconds.', keyboard: 'X', touch: 'BOOST button' },
    { id: 'turn', title: 'Turn around', group: 'Special', keys: ['turn'], note: 'Flips the way you face and keeps it for 3 seconds; you cannot hit what is behind you.', keyboard: 'U', touch: 'TURN button' }
  ];
  const AIMKEYS = { 'UPPERCUT': ['aimUp'], 'RISING KICK': ['aimUp'], 'OVERHAND': ['aimDown'], 'LOW KICK': ['aimDown'], 'LOW SWEEP': ['crouch'], 'LEAPING UPPERCUT': ['aimUp', 'jump'], 'SUPERMAN PUNCH': ['jump'], 'FLYING SIDE KICK': ['jump'], 'BUTTERFLY KICK': ['jump', 'aimUp'], 'TORNADO KICK': ['jump'] };

  SF.actionList = function (styleIndex) {
    const help = SF.helpModel(styleIndex || 0), out = [];
    for (const m of help.moves) out.push({ id: 'move:' + m.name, title: m.name, group: m.air ? 'In the air' : (m.limb === 'punch' ? 'Punches' : 'Kicks'), keys: [m.limb].concat(AIMKEYS[m.name] || []), frames: m.frames, note: '', keyboard: m.keyboard, touch: m.touch });
    for (const o of OTHERS) out.push(o);
    return out;
  };

  /* ---------- poses ---------- */
  function world(style) { const m = SF.createMatch({ seed: 1, styles: [style || 0, 0], ai: [false, false] }); m.f[0].x = 300; m.f[1].x = 860; return m; }
  function snap(f, m, label, extra) { const p = { label: label, x0: f.x, face: f.face, sx: SF.spinScale(f), sk: clone(SF.skeleton(f, m.t)) }; for (const k in (extra || {})) p[k] = extra[k]; return p; }
  /* run the simulation and take a snapshot at the given steps; `inp(i)` is the input of the trainee at step i, `after(i)` can hold the body in place */
  function run(m, marks, labels, inp, after, extra) {
    const f = m.f[0], out = [], last = Math.max.apply(null, marks);
    for (let i = 1; i <= last; i++) { SF.step(m, [inp ? inp(i) : {}, {}]); if (after) after(i, f); const k = marks.indexOf(i); if (k >= 0) out.push(snap(f, m, labels[k], extra)); }
    return out;
  }
  function posed(style, props, labels, times, extra) {
    return times.map(function (t, i) { const m = world(style), f = m.f[0]; Object.assign(f, props, { t: t }); return snap(f, { t: t }, labels[i], extra); });
  }
  const FX = { block: ['shield'], parry: ['shield', 'spark'], dash: ['speed'], sprint: ['speed'], jump: ['path'], turn: ['turn'] };
  SF.actionPoses = function (id, styleIndex) {
    const out = poses0(id, styleIndex); if (FX[id]) out.forEach(function (p) { p.fx = FX[id]; }); return out;
  };
  function poses0(id, styleIndex) {
    const style = styleIndex || 0, m = world(style), f = m.f[0];
    if (id.indexOf('move:') === 0) {
      const name = id.slice(5), mv = C.MOVES[name];
      const crouched = name === 'LOW SWEEP';          /* the sweep is thrown from a crouch (keyboard: crouch + G) */
      if (mv.air) { f.air = true; f.h = 70; }
      if (crouched) f.cr = 1;
      SF.beginMove(m, f, name, 1);
      const trail = [], tipKey = mv.limb === 'punch' ? 'hand' : 'foot', last = mv.fr[0] + mv.fr[1] + Math.round(mv.fr[2] / 2), contact = mv.fr[0] + 1;
      const poses = run(m, [Math.max(1, Math.round(mv.fr[0] / 2)), contact, last], ['wind-up', 'contact', 'recovery'], null, function (i, q) {
        if (mv.air) { q.h = 70; q.vy = 0; q.air = true; } if (crouched) q.cr = 1;
        const sk = SF.skeleton(q, m.t); trail.push([sk[tipKey][0][0], sk[tipKey][0][1], i]);        /* the path of the fist or foot, step by step */
      });
      poses.forEach(function (p) { p.trail = trail; p.contactAt = contact; p.tip = tipKey; p.aim = mv.aim; p.origin = mv.limb === 'punch' ? 'shoulder' : 'hip'; });
      return poses;
    }
    switch (id) {
      case 'stand': return run(m, [1, 2, 3], ['ready', 'ready', 'ready']);
      case 'block': return run(m, [2, 12, 30], ['raising', 'guard up', 'holding'], function () { return { block: true }; });
      case 'parry': f.aim = 15; return run(m, [3, 8, 20], ['raising: parry window', 'guard', 'counter ready'], function () { return { block: true }; }, function (i, q) { if (i === 12) q.counter = 1.2; });
      case 'crouch': return run(m, [3, 8, 16], ['going down', 'lower', 'crouched'], function () { return { crouch: true }; });
      case 'jump': return run(m, [3, 12, 26], ['spring', 'rising', 'top'], function (i) { return i === 1 ? { jump: true } : {}; });
      case 'dash': return run(m, [2, 8, 16], ['burst', 'sliding', 'slowing'], function (i) { return i === 1 ? { dash: true, right: true } : {}; });
      case 'sprint': return run(m, [24, 28, 32], ['stride', 'stride', 'stride'], function (i) { return (i === 1 || i === 4 || i > 5) ? { right: true } : {}; });
      case 'grab': return run(m, [3, 8, 14], ['reach', 'grab', 'hold'], function (i) { return i === 1 ? { grab: true } : {}; });
      case 'throw': {
        const d = m.f[1]; d.x = 350; SF.doThrow(m, f, d); const total = Math.round((C.GRAB_LOCK + C.GRAB_FLIP) / C.DT), out = [], marks = [Math.round(total * 0.2), Math.round(total * 0.6), total - 2], labels = ['lift', 'over the shoulder', 'landing'];
        for (let i = 1; i <= marks[2]; i++) { SF.step(m, [{}, {}]); const k = marks.indexOf(i); if (k >= 0) { const p = snap(f, m, labels[k]); p.sk2 = clone(SF.skeleton(d, m.t)); p.x2 = d.x; out.push(p); } }
        return out;
      }
      case 'knockdown': return posed(style, { state: 'down', h: 0, ko: false, flair: 0 }, ['hit', 'falling', 'down'], [0.05, 0.3, 0.9]);
      case 'recover-kip': return posed(style, { state: 'getup', recov: 'kip', getDur: C.RECOV.kip.dur, getInv: C.RECOV.kip.inv, flair: 1, h: 0 }, ['legs swing overhead', 'hips spring up', 'landing'], [0.35 * C.RECOV.kip.dur, 0.62 * C.RECOV.kip.dur, 0.92 * C.RECOV.kip.dur]);
      case 'recover-fwd': return posed(style, { state: 'getup', recov: 'fwd', getDur: C.RECOV.fwd.dur, getInv: C.RECOV.fwd.inv, flair: 0, h: 0 }, ['rolling over', 'upside down', 'coming up'], [0.12 * C.RECOV.fwd.dur, 0.38 * C.RECOV.fwd.dur, 0.85 * C.RECOV.fwd.dur]);
      case 'recover-back': return posed(style, { state: 'getup', recov: 'back', getDur: C.RECOV.back.dur, getInv: C.RECOV.back.inv, flair: 0, h: 0 }, ['rolling back', 'upside down', 'coming up'], [0.12 * C.RECOV.back.dur, 0.38 * C.RECOV.back.dur, 0.85 * C.RECOV.back.dur]);
      case 'recover-guard': return posed(style, { state: 'getup', recov: 'guard', getDur: C.RECOV.guard.dur, getInv: C.RECOV.guard.inv, flair: 0, h: 0 }, ['hands and knees', 'rising, guard up', 'standing'], [0.3 * C.RECOV.guard.dur, 0.62 * C.RECOV.guard.dur, 0.95 * C.RECOV.guard.dur]);
      case 'breakfall': { const out = []; for (const [t, label] of [[0.0, 'tap as you land'], [0.2, 'rolling with the fall'], [0.45, 'up sooner']]) { const mm = world(style), ff = mm.f[0]; Object.assign(ff, { state: 'down', t: t, h: 0, flair: 0 }); out.push(snap(ff, { t: t }, label)); } return out; }
      case 'getup': return posed(style, { state: 'getup', h: 0, flair: 1 }, ['rolling up', 'kip-up', 'standing'], [0.25 * C.GETUP_T, 0.55 * C.GETUP_T, 0.92 * C.GETUP_T]);
      case 'boost': return run(m, [1, 2, 3], ['pressed', 'boosting', 'boosting'], function (i) { return i === 1 ? { boost: true } : {}; }, null, { aura: true });
      case 'turn': { const a = snap(f, m, 'facing right'); f.face = -1; const b = snap(f, m, 'turned'), c = snap(f, m, 'locked for 3 s'); return [a, b, c]; }
    }
    throw new Error('unknown action ' + id);
  }

  /* ---------- images ---------- */
  function points(sk) { const out = []; for (const k in sk) { const v = sk[k]; if (Array.isArray(v[0])) for (const q of v) out.push(q); else out.push(v); } return out; }
  /* one scale and one centre for the three poses of an action, so they can be compared side by side */
  function fit(poses) {
    let x0 = 1e9, x1 = -1e9, y0 = 1e9;
    for (const p of poses) for (const [sk, ox] of [[p.sk, p.x0]].concat(p.sk2 ? [[p.sk2, p.x0]] : [])) for (const q of points(sk)) { const x = q[0] - ox; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, C.GY - q[1]); }
    y0 = 0; let h = 0; for (const p of poses) for (const q of points(p.sk).concat(p.sk2 ? points(p.sk2) : [])) h = Math.max(h, C.GY - q[1]);
    const s = Math.min(0.8, 128 / Math.max(h + C.LIMB.head, 1), 140 / Math.max(x1 - x0 + 24, 1));
    return { cx: (x0 + x1) / 2, s: s };
  }
  const f1 = function (v) { return Math.round(v * 10) / 10; };
  function figure(sk, ox, fitv, col, back) {
    const X = function (q) { return f1(80 + (q[0] - ox - fitv.cx) * fitv.s); }, Y = function (q) { return f1(140 - (C.GY - q[1]) * fitv.s); };
    const line = function (a, b, c, w) { return '<line x1="' + X(a) + '" y1="' + Y(a) + '" x2="' + X(b) + '" y2="' + Y(b) + '" stroke="' + c + '" stroke-width="' + w + '"/>'; };
    let s = '';
    s += line(sk.shoulderB, sk.elbow[1], back, 3.4) + line(sk.elbow[1], sk.hand[1], back, 3.4) + line(sk.hip, sk.knee[1], back, 3.4) + line(sk.knee[1], sk.foot[1], back, 3.4);
    s += line(sk.hip, sk.chest, col, 3.6) + line(sk.chest, sk.neck, col, 3.6) + line(sk.shoulderB, sk.shoulder, col, 3) + line(sk.hip, sk.knee[0], col, 3.4) + line(sk.knee[0], sk.foot[0], col, 3.4) + line(sk.shoulder, sk.elbow[0], col, 3.4) + line(sk.elbow[0], sk.hand[0], col, 3.4);
    s += '<circle cx="' + X(sk.head) + '" cy="' + Y(sk.head) + '" r="' + f1(C.LIMB.head * fitv.s) + '" fill="' + col + '"/>';
    return s;
  }
  SF.actionSvgs = function (id, styleIndex) {
    const poses = SF.actionPoses(id, styleIndex), fitv = fit(poses);
    return poses.map(function (p) {
      const X = function (q) { return f1(80 + (q[0] - p.x0 - fitv.cx) * fitv.s); }, Y = function (q) { return f1(140 - (C.GY - q[1]) * fitv.s); };
      let s = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 150" width="160" height="150" role="img" aria-label="' + id + ': ' + p.label + '">';
      s += '<line x1="6" y1="141" x2="154" y2="141" stroke="#3a3f4c" stroke-width="2"/>';
      if (p.aura) s += '<circle cx="80" cy="' + f1(140 - 100 * fitv.s) + '" r="' + f1(46 * fitv.s) + '" fill="#ffb15a" opacity="0.28"/>';
      /* the path of the striking limb: a dotted line, the contact point ringed (the fist or foot is highlighted on the figure) */
      if (p.trail) {
        s += '<polyline fill="none" stroke="#ffd24d" stroke-width="1.4" stroke-dasharray="2 3" opacity="0.85" points="' + p.trail.map(function (q) { return X(q) + ',' + Y(q); }).join(' ') + '"/>';
        const c = p.trail.filter(function (q) { return q[2] === p.contactAt; })[0]; if (c) s += '<circle cx="' + X(c) + '" cy="' + Y(c) + '" r="5" fill="none" stroke="#ff6a4d" stroke-width="1.6"/>';
      }
      /* the aim: a dashed line at the angle of the strike, from the shoulder or the hip */
      if (p.aim !== undefined) {
        const o = p.sk[p.origin], a = p.aim * Math.PI / 180, L = 44 / fitv.s * 0.9, e = [o[0] + p.face * Math.cos(a) * L, o[1] - Math.sin(a) * L];
        s += '<line x1="' + X(o) + '" y1="' + Y(o) + '" x2="' + X(e) + '" y2="' + Y(e) + '" stroke="#9aa1b3" stroke-width="1" stroke-dasharray="4 3" opacity="0.8"/>';
      }
      const g = (p.sx !== undefined && Math.abs(p.sx - 1) > 0.01) ? '<g transform="translate(' + f1(80 - fitv.cx * fitv.s) + ' 0) scale(' + f1(p.sx) + ' 1) translate(' + f1(-(80 - fitv.cx * fitv.s)) + ' 0)">' : '<g>';
      s += g;
      if (p.sk2) s += figure(p.sk2, p.x0, fitv, '#ff8a5a', '#a65a38');
      s += figure(p.sk, p.x0, fitv, '#5ab0ff', '#38709f');
      if (p.tip) { const t = p.sk[p.tip][0]; s += '<circle cx="' + X(t) + '" cy="' + Y(t) + '" r="3.2" fill="#ffd24d"/>'; }
      s += '</g>';
      /* marks that a still pose cannot carry */
      const fx = p.fx || [], hx = X(p.sk.chest), hy = Y(p.sk.chest), face = p.face;
      if (fx.indexOf('shield') >= 0) s += '<path d="M ' + f1(hx + face * 26) + ' ' + f1(hy - 22) + ' Q ' + f1(hx + face * 38) + ' ' + hy + ' ' + f1(hx + face * 26) + ' ' + f1(hy + 22) + '" fill="none" stroke="' + (fx.indexOf('spark') >= 0 ? '#ffd24d' : '#7fe0ff') + '" stroke-width="3" opacity="0.9"/>';
      if (fx.indexOf('spark') >= 0 && p.label !== 'guard') s += '<g stroke="#ffd24d" stroke-width="1.5"><line x1="' + f1(hx + face * 40) + '" y1="' + f1(hy - 8) + '" x2="' + f1(hx + face * 48) + '" y2="' + f1(hy - 14) + '"/><line x1="' + f1(hx + face * 42) + '" y1="' + hy + '" x2="' + f1(hx + face * 52) + '" y2="' + hy + '"/><line x1="' + f1(hx + face * 40) + '" y1="' + f1(hy + 8) + '" x2="' + f1(hx + face * 48) + '" y2="' + f1(hy + 14) + '"/></g>';
      if (fx.indexOf('speed') >= 0) s += '<g stroke="#9aa1b3" stroke-width="1.4" opacity="0.8"><line x1="' + f1(hx - face * 30) + '" y1="' + f1(hy - 16) + '" x2="' + f1(hx - face * 54) + '" y2="' + f1(hy - 16) + '"/><line x1="' + f1(hx - face * 34) + '" y1="' + hy + '" x2="' + f1(hx - face * 62) + '" y2="' + hy + '"/><line x1="' + f1(hx - face * 30) + '" y1="' + f1(hy + 16) + '" x2="' + f1(hx - face * 54) + '" y2="' + f1(hy + 16) + '"/></g>';
      if (fx.indexOf('path') >= 0) s += '<line x1="80" y1="141" x2="80" y2="8" stroke="#9aa1b3" stroke-width="1" stroke-dasharray="3 4" opacity="0.6"/>';
      if (fx.indexOf('turn') >= 0) s += '<path d="M 40 40 Q 80 14 120 40" fill="none" stroke="#c7cde0" stroke-width="2"/><polygon points="120,40 112,32 114,44" fill="#c7cde0"/><polygon points="40,40 48,32 46,44" fill="#c7cde0"/>';
      return s + '</svg>';
    });
  };
})();

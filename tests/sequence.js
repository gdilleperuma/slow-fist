'use strict';
// SEQ-01 to SEQ-10: choreography. Registered into tests/run.js.
module.exports = function (X) {
  const { test, ok, eq, near, SF, C, NONE } = X;
  const DT = C.DT;
  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  const vec = (p, q) => [q[0] - p[0], q[1] - p[1]];
  const angleBetween = (a, b) => Math.abs(Math.atan2(a[0] * b[1] - a[1] * b[0], a[0] * b[0] + a[1] * b[1])) * 180 / Math.PI;

  /* attacker (fighter 0, given style) and a standing target 50 px away */
  function duel(style, targetStyle) {
    const m = SF.createMatch({ seed: 1, styles: [style, targetStyle === undefined ? 0 : targetStyle], ai: [false, false] });
    m.f[0].x = 300; m.f[1].x = 350;
    return m;
  }
  const evs = (m, k) => m.ev.filter(e => e.k === k);
  function press(m, key, hold) { const i = {}; i[key] = true; for (let n = 0; n < (hold || 1); n++) SF.step(m, [i, NONE]); SF.step(m, [NONE, NONE]); }

  test('SEQ-01', 'frame data: every move has the startup, active and recovery frames of the table', () => {
    ok(SF.CFG.MOVES && SF.beginMove, 'CFG.MOVES and SF.beginMove exist');
    let checked = 0;
    for (const name in SF.CFG.MOVES) {
      const mv = SF.CFG.MOVES[name];
      if (mv.air) continue;
      const m = duel(0), a = m.f[0], d = m.f[1];
      SF.beginMove(m, a, name, 1);
      let hitAt = -1, strikeEnd = -1, idleAt = -1;
      for (let i = 1; i <= 120; i++) {
        SF.step(m, [NONE, NONE]);
        if (hitAt < 0 && evs(m, 'hit').length) hitAt = i;
        if (strikeEnd < 0 && a.state === 'recover') strikeEnd = i;
        if (strikeEnd > 0 && a.state === 'idle') { idleAt = i; break; }
        if (d.state === 'down' || d.state === 'stagger') { d.state = 'idle'; d.hp = d.style.hpMax; }
      }
      const [su, ac, rc] = mv.fr;
      ok(Math.abs(hitAt - (su + 1)) <= 1 || Math.abs(hitAt - su) <= 1, name + ': the hit lands on frame ' + hitAt + ', table startup ' + su);
      ok(Math.abs(strikeEnd - (su + ac)) <= 1, name + ': the strike state ends on frame ' + strikeEnd + ', table ' + (su + ac));
      ok(Math.abs((idleAt - strikeEnd) - rc) <= 1, name + ': the recovery lasts ' + (idleAt - strikeEnd) + ' frames, table ' + rc);
      checked++;
    }
    ok(checked >= 13, 'covered ' + checked + ' moves');
    /* strike speed divides startup */
    const m = duel(0), a = m.f[0]; SF.beginMove(m, a, 'JAB', 2);
    let hit = -1; for (let i = 1; i <= 30; i++) { SF.step(m, [NONE, NONE]); if (evs(m, 'hit').length) { hit = i; break; } }
    ok(Math.abs(hit - 3) <= 1, 'at speed 2 the jab lands after about 3 frames: ' + hit);
  });

  function inWindow(m, a) { for (let i = 0; i < 90 && !(a.state === 'recover' && a.cancelOpen); i++) SF.step(m, [NONE, NONE]); return a.state === 'recover' && a.cancelOpen; }

  test('SEQ-02', 'every entry of every style\'s sequence graph continues with the next move in the cancel window', () => {
    let checked = 0;
    for (let style = 0; style < 3; style++) {
      const graph = SF.CFG.CHAIN[SF.CFG.STYLES[style].name];
      ok(graph, 'a graph for ' + SF.CFG.STYLES[style].name);
      for (const after in graph) for (const key of ['punch', 'kick']) {
        const want = graph[after][key]; if (!want) continue;
        const m = duel(style), a = m.f[0], d = m.f[1];
        SF.beginMove(m, a, after, 1);
        ok(inWindow(m, a), 'the cancel window opens after ' + after + ' (' + SF.CFG.STYLES[style].name + ')');
        d.state = 'idle'; d.hp = d.style.hpMax; d.protect = 0;
        const i = {}; i[key] = true; SF.step(m, [i, NONE]);
        eq(a.state, 'strike', after + ' + ' + key + ' starts a strike at once');
        eq(a.str.name, want, SF.CFG.STYLES[style].name + ': ' + after + ' + ' + key + ' continues with ' + want);
        ok(a.chain && a.chain.names.length === 2 && a.chain.names[0] === after, 'the chain remembers the moves');
        checked++;
      }
    }
    ok(checked >= 25, 'covered ' + checked + ' sequence entries');
  });

  test('SEQ-03', 'cancel window and input buffer', () => {
    const fresh = () => { const m = duel(0), a = m.f[0]; SF.beginMove(m, a, 'JAB', 1); return { m, a }; };
    let { m, a } = fresh();
    for (let i = 0; i < 2; i++) SF.step(m, [NONE, NONE]);                      /* frame 2 of the strike */
    const early = {}; early.punch = true; SF.step(m, [early, NONE]); SF.step(m, [NONE, NONE]);
    for (let i = 0; i < 40 && a.state !== 'idle'; i++) SF.step(m, [NONE, NONE]);
    ok(!(a.chain && a.chain.names.length > 1), 'a press during the strike does not continue the sequence');
    /* a press in the 5 frames before the window opens is buffered */
    ({ m, a } = fresh());
    for (let i = 0; i < 200 && a.state !== 'recover'; i++) SF.step(m, [NONE, NONE]);
    const jabRecover = SF.CFG.MOVES.JAB.fr[2], cancel = SF.CFG.MOVES.JAB.cancel;
    const gap = jabRecover - cancel;                                          /* frames of recovery before the window */
    ok(gap >= 2, 'the table leaves a gap before the window (' + gap + ')');
    SF.step(m, [{ punch: true }, NONE]);                                      /* pressed in the first recovery frames */
    let chained = false; for (let i = 0; i < 20; i++) { SF.step(m, [NONE, NONE]); if (a.state === 'strike' && a.str.name === 'CROSS') { chained = true; break; } }
    ok(chained, 'a press just before the window is buffered and starts the cross when it opens');
    /* after the recovery has ended the press starts a normal strike (charge), not a continuation */
    ({ m, a } = fresh());
    for (let i = 0; i < 200 && a.state !== 'idle'; i++) SF.step(m, [NONE, NONE]);
    SF.step(m, [{ punch: true }, NONE]);
    eq(a.state, 'charge', 'after the recovery a press winds up as usual');
    ok(!a.chain || a.chain.names.length <= 1, 'and does not continue the old sequence');
  });

  test('SEQ-04', 'footwork: the lunge advances the body, sequences advance cumulatively, fighters never overlap', () => {
    const m = duel(0), a = m.f[0], d = m.f[1]; d.x = 700;
    const x0 = a.x; SF.beginMove(m, a, 'JAB', 1);
    for (let i = 0; i < 12; i++) SF.step(m, [NONE, NONE]);
    near(a.x - x0, SF.CFG.MOVES.JAB.lunge, 3, 'the jab lunge');
    /* a three move sequence */
    const m2 = duel(0), b = m2.f[0], t = m2.f[1]; t.x = 800; const y0 = b.x; SF.beginMove(m2, b, 'JAB', 1);
    for (const key of ['punch', 'punch']) { inWindow(m2, b); SF.step(m2, [{ [key]: true }, NONE]); }
    for (let i = 0; i < 60; i++) SF.step(m2, [NONE, NONE]);
    ok(b.x - y0 >= 28, 'a jab-cross-hook advances at least 28 px, advanced ' + (b.x - y0).toFixed(1));
    /* with the target next to the attacker nobody passes through the other */
    const m3 = duel(0), c = m3.f[0], e = m3.f[1]; e.x = 340; SF.beginMove(m3, c, 'JAB', 1);
    for (let i = 0; i < 60; i++) { SF.step(m3, [NONE, NONE]); ok(Math.abs(c.x - e.x) >= 43.9, 'fighters overlap: ' + Math.abs(c.x - e.x).toFixed(1)); }
  });

  function contact(name, style, setup) {
    const m = duel(style === undefined ? 0 : style), a = m.f[0], d = m.f[1]; d.protect = 0;
    SF.beginMove(m, a, name, 1);
    const su = SF.CFG.MOVES[name].fr[0];
    for (let i = 0; i < su; i++) SF.step(m, [NONE, NONE]);
    return { m, a, d, k: SF.skeleton(a, 0) };
  }
  const bend = (k, arm) => 180 - angleBetween(vec(k.elbow[arm], [k.shoulder, k.shoulderB][arm]), vec(k.elbow[arm], k.hand[arm]));

  test('SEQ-05', 'hands: jab lead, cross rear, hook with a bent elbow, uppercut rear and upward', () => {
    let r = contact('JAB'); ok(bend(r.k, 0) <= 25, 'jab: lead arm extended (' + bend(r.k, 0).toFixed(0) + ')'); ok(dist(r.k.hand[1], r.k.head) <= 30, 'jab: the rear hand guards');
    r = contact('CROSS'); ok(bend(r.k, 1) <= 25, 'cross: rear arm extended (' + bend(r.k, 1).toFixed(0) + ')'); ok(dist(r.k.hand[0], r.k.head) <= 30, 'cross: the lead hand guards (' + dist(r.k.hand[0], r.k.head).toFixed(0) + ')');
    r = contact('HOOK'); ok(bend(r.k, 0) >= 60 && bend(r.k, 0) <= 110, 'hook: the elbow stays bent (' + bend(r.k, 0).toFixed(0) + ')');
    r = contact('UPPERCUT'); ok(bend(r.k, 1) <= 40, 'uppercut: rear arm nearly extended (' + bend(r.k, 1).toFixed(0) + ')'); ok(r.k.hand[1][1] < r.k.chest[1] - 5, 'uppercut: the fist is above the chest');
  });

  test('SEQ-06', 'active frames: a target that steps into reach during the active frames is hit; a move that never reaches whiffs exactly once', () => {
    const name = 'CROSS', [su, ac] = SF.CFG.MOVES[name].fr;
    let m = duel(0), a = m.f[0], d = m.f[1]; d.x = 440;                    /* out of reach */
    SF.beginMove(m, a, name, 1);
    let hit = -1;
    for (let i = 1; i <= su + ac + 2; i++) {
      if (i === su + 1) d.x = 350;                                          /* steps in on the second active frame */
      SF.step(m, [NONE, NONE]);
      if (hit < 0 && evs(m, 'hit').length) hit = i;
    }
    ok(hit > su && hit <= su + ac + 1, 'the cross hits a target that steps in during the active frames: frame ' + hit);
    m = duel(0); a = m.f[0]; d = m.f[1]; d.x = 600; SF.beginMove(m, a, name, 1);
    let whiffs = 0, at = -1;
    for (let i = 1; i <= 60; i++) { SF.step(m, [NONE, NONE]); const w = evs(m, 'whiff').length; if (w && at < 0) at = i; whiffs += w; }
    eq(whiffs, 1, 'exactly one whiff');
    ok(Math.abs(at - (su + ac)) <= 1, 'the whiff is reported at the end of the active frames: frame ' + at + ' (table ' + (su + ac) + ')');
  });

  test('SEQ-07', 'grapple cancel only from the second move of a sequence', () => {
    let m = duel(0), a = m.f[0], d = m.f[1]; d.protect = 0; SF.beginMove(m, a, 'JAB', 1);
    inWindow(m, a); SF.step(m, [{ grab: true }, NONE]);
    ok(a.state !== 'grab', 'no grapple cancel after the first move: ' + a.state);
    m = duel(0); a = m.f[0]; d = m.f[1]; SF.beginMove(m, a, 'JAB', 1);
    inWindow(m, a); SF.step(m, [{ punch: true }, NONE]); d.state = 'idle'; d.protect = 0; d.x = 345;
    inWindow(m, a); a.grabCD = 0; a.sta = 100; SF.step(m, [{ grab: true }, NONE]);
    eq(a.state, 'grab', 'grapple cancel after the second move');
  });

  test('SEQ-08', 'the AI uses sequences', () => {
    let chains = 0, longest = 0; const sigs = new Set();
    for (let s = 0; s < 40; s++) {
      const m = SF.createMatch({ seed: 4000 + s, styles: [s % 3, (s + 1) % 3], ai: [true, true] });
      for (let i = 0; i < 2400 && m.winner === null; i++) { SF.stepAI(m); for (const e of m.ev) if (e.k === 'chain') { if (e.names.length >= 3) { chains++; sigs.add(e.names.join('>')); } longest = Math.max(longest, e.names.length); } }
    }
    ok(chains >= 20, 'sequences of 3 or more moves: ' + chains);
    ok(sigs.size >= 6, 'different sequences: ' + sigs.size + ' (' + [...sigs].slice(0, 6).join(', ') + ')');
    ok(longest >= 4, 'longest sequence: ' + longest);
  });

  test('SEQ-09', 'sequences keep the motion limits (speed, floor, numbers)', () => {
    const scripts = [[0, 'JAB', ['punch', 'punch', 'punch']], [1, 'FRONT KICK', ['kick', 'kick']], [2, 'JAB', ['punch', 'punch', 'kick']], [0, 'JAB', ['punch', 'kick', 'kick']]];
    let worst = 0, bad = 0;
    for (const [style, first, keys] of scripts) {
      const m = duel(style), a = m.f[0], d = m.f[1]; d.x = 380; const anim = SF.makeAnimator(); let prev = null;
      SF.beginMove(m, a, first, 1); anim.step(m);
      let steps = 0, samples = 0;
      const sample = () => { anim.step(m); const k = anim.skeleton(m, 0); samples++; if (prev) { for (const key of ['hand', 'foot']) for (let j = 0; j < 2; j++) worst = Math.max(worst, dist(k[key][j], prev[key][j]) * 60); worst = Math.max(worst, dist(k.head, prev.head) * 60); } for (const kk in k) (Array.isArray(k[kk][0]) ? k[kk] : [k[kk]]).forEach(p => { if (!isFinite(p[0]) || !isFinite(p[1]) || p[1] > C.GY + 1) bad++; }); prev = k; };
      const run = (inp) => { SF.step(m, [inp || NONE, NONE]); steps++; sample(); };
      for (const key of keys) { for (let i = 0; i < 80 && !(a.state === 'recover' && a.cancelOpen); i++) run(); d.state = 'idle'; d.protect = 0; const inp = {}; inp[key] = true; run(inp); }
      for (let i = 0; i < 60; i++) run();
      eq(samples, steps, 'one sample per step');
    }
    ok(worst <= 2500, 'an end point moved at ' + worst.toFixed(0) + ' px/s'); eq(bad, 0, 'points under the floor or not numbers');
  });

  test('SEQ-10', 'each continued move is reported in a chain event with the names so far', () => {
    const m = duel(0), a = m.f[0], d = m.f[1]; d.x = 800;
    SF.beginMove(m, a, 'JAB', 1);
    const seen = [];
    for (const key of ['punch', 'punch']) { inWindow(m, a); m.ev.length = 0; SF.step(m, [{ [key]: true }, NONE]); const e = evs(m, 'chain')[0]; ok(e, 'a chain event after the press'); seen.push(e.names.slice()); }
    eq(seen[0].join(','), 'JAB,CROSS'); eq(seen[1].join(','), 'JAB,CROSS,HOOK');
    ok(typeof SF.chainLabel === 'function' && SF.chainLabel(['JAB', 'CROSS', 'HOOK']) === '1-2-3', 'the named sequence 1-2-3: ' + (SF.chainLabel && SF.chainLabel(['JAB', 'CROSS', 'HOOK'])));
  });
};

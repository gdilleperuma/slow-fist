/* The tutorial, as data and rules. Lesson 1: the punch. One line drawn across the hand circle; the angle of the line is the angle of the punch.
   Targets are semi-transparent circles at set angles; a punch that passes through the circle counts. Then speed (targets that expire) and strength (light and heavy targets).
   Pure: no DOM. menu.js shows the panel, render.js draws the target and its dashed angle line, main.js feeds it the match events (`swing`, one per punch).
   The trainee is fighter 0; there is no opponent to see, only the targets. */
var SF = (typeof SF === 'undefined') ? {} : SF;
(function () {
  'use strict';
  const D = 68, R = 12;                         /* distance of the target circle from the shoulder, and its radius, in pixels: a tolerance of asin(12/68) = 10 degrees */
  const LIGHT_S = 0.9, HEAVY_S = 1.3;           /* strike strength: a tap is 0.7, a full charge about 1.5 */

  SF.tutorialSteps = function () {
    return [
      { id: 'level', angles: [0, 0, 0], target: 3, title: 'Straight ahead (0°)', text: 'Draw one straight line. Its ANGLE is the angle of the punch; its LENGTH and SPEED decide the strength. Hit the circle.', how: { keyboard: 'tap F (Q / E tilt the aim)', touch: 'draw a short line straight forward in the hand circle' } },
      { id: 'up', angles: [20, 30, 25], target: 3, title: 'Angled UP', text: 'Tilt the line up. Follow the dashed line.', how: { keyboard: 'hold Q, tap F', touch: 'draw the line up and forward' } },
      { id: 'down', angles: [-20, -30, -25], target: 3, title: 'Angled DOWN', text: 'Tilt the line down.', how: { keyboard: 'hold E, tap F', touch: 'draw the line down and forward' } },
      { id: 'steep', angles: [45, -40, 48, -38], target: 4, title: 'Steep angles', text: 'Nearly vertical lines: the steepest punches up and down.', how: { keyboard: 'hold Q or E longer', touch: 'draw an almost vertical line' } },
      { id: 'any', random: 6, target: 6, title: 'Any angle', text: 'The target changes every time. Read the dashed line, then draw it.', how: { keyboard: 'Q / E, then F', touch: 'draw a line at the angle of the dashed line' } },
      { id: 'speed', random: 6, target: 4, limit: 90, title: 'SPEED', text: 'Each target disappears after 1.5 seconds. Short, fast lines.', how: { keyboard: 'tap F quickly', touch: 'short fast lines' } },
      { id: 'strength', needs: ['heavy', 'light', 'heavy', 'light', 'heavy', 'light'], angles: [0, 15, -15, 25, 0, -20], target: 5, title: 'STRENGTH', text: 'Orange targets need a heavy punch, green ones a light one. Short and fast is light; long and slow is heavy.', how: { keyboard: 'heavy: hold F longer; light: tap F', touch: 'heavy: a long slow line; light: a short fast line' } }
    ];
  };

  SF.tutorialNew = function (seed) {
    const rng = SF.makeRng(seed || 1), t = { idx: 0, k: 0, counts: {}, done: {}, skipped: {}, finished: false, missed: 0, hint: '', result: null, lastSwing: null, spawn: null, lists: {} };
    for (const s of SF.tutorialSteps()) {
      if (s.random) { const a = []; let prev = 999; while (a.length < s.random + 2) { const v = Math.round(-40 + rng.next() * 90); if (Math.abs(v - prev) >= 15) { a.push(v); prev = v; } } t.lists[s.id] = a; }
      else t.lists[s.id] = s.angles.slice();
    }
    return t;
  };
  function refresh(t, steps) {
    const i = steps.findIndex(function (s) { return !t.done[s.id] && !t.skipped[s.id]; });
    const was = t.idx; t.finished = i < 0; t.idx = i < 0 ? steps.length - 1 : i; if (t.idx !== was) { t.k = 0; t.spawn = null; }
  }
  SF.tutorialCurrent = function (t) { return SF.tutorialSteps()[t.idx]; };
  SF.tutorialSkip = function (t) { const s = SF.tutorialSteps(); if (!t.finished) t.skipped[s[t.idx].id] = true; refresh(t, s); };
  /* the target now on show */
  SF.tutorialTarget = function (t) {
    const s = SF.tutorialSteps()[t.idx], list = t.lists[s.id];
    return { ang: list[t.k % list.length], d: D, r: R, need: s.needs ? s.needs[t.k % s.needs.length] : null, limit: s.limit || 0, spawn: t.spawn, tol: Math.asin(R / D) * 180 / Math.PI };
  };

  /* the events of one step (m.ev) and the step number (m.steps); returns what the panel should say */
  SF.tutorialFeed = function (t, m) {
    const steps = SF.tutorialSteps(), out = { done: [], hint: '' }, now = m.steps || 0;
    if (t.finished) return out;
    if (t.spawn === null) t.spawn = now;
    const next = function () { t.k++; t.spawn = now; };
    const cur = function () { return steps[t.idx]; };
    /* a timed target that is not hit in time is gone */
    if (cur().limit && now - t.spawn > cur().limit) { t.missed++; t.hint = 'Too slow: draw faster.'; out.hint = t.hint; t.result = { ok: false, at: now }; next(); }
    for (const e of m.ev || []) {
      if (e.k !== 'swing' || e.a !== 0) continue;
      const s = cur(), g = SF.tutorialTarget(t), diff = e.ang - g.ang;
      t.lastSwing = { ang: e.ang, s: e.s, diff: diff };
      if (Math.abs(diff) > g.tol) {
        out.hint = Math.round(Math.abs(diff)) + '° too ' + (diff > 0 ? 'high' : 'low') + ': aim ' + (diff > 0 ? 'lower' : 'higher') + '.';
        t.result = { ok: false, at: now };
      } else if (g.need === 'heavy' && e.s < HEAVY_S) { out.hint = 'Right angle, but too light: charge it for a heavy punch.'; t.result = { ok: false, at: now }; }
      else if (g.need === 'light' && e.s > LIGHT_S) { out.hint = 'Right angle, but too heavy: a quick tap is enough here.'; t.result = { ok: false, at: now }; }
      else {
        t.counts[s.id] = (t.counts[s.id] || 0) + 1; t.result = { ok: true, at: now }; out.hint = '';
        if (t.counts[s.id] >= s.target) { t.done[s.id] = true; out.done.push(s.id); refresh(t, steps); t.spawn = now; break; }
        next();
      }
    }
    t.hint = out.hint;
    return out;
  };
})();

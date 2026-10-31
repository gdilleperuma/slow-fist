/* From a decoded stroke to simulation inputs. Pure: no DOM, no clock. The touch layer calls pending() when a finger lands in an attack circle,
   planFor() when the stroke is decided, and step() once per simulation step to get the keys to press. */
(function (root) {
  'use strict';
  const SURE_MM = 8, SURE_DEG = 25;
  /* the angle of the stroke (0 forward, up negative, y down) is the aim of the strike (up positive); the simulation clamps it to the limb's range */
  const aimOf = function (ang) { return Math.max(-45, Math.min(55, Math.round(-ang))); };
  const HOLD = { quick: 2, cross: 9, heavy: 34, hook: 18, round: 14, crouch: 6, aim: 3 };   /* simulation steps of 1/60 s */

  /* the wind-up starts at touch-down: the key goes down now and the stroke decides which move it becomes */
  function pending(limb) {
    return { key: limb === 'hand' ? 'punch' : 'kick', hold: HOLD.quick, aim: 0, crouch: false, grab: false, waitAim: false, steps: 0, released: false, pending: true, name: '...' };
  }

  function planFor(r, limb, waited, punchOnly) {
    const hand = limb === 'hand';
    const p = { key: hand ? 'punch' : 'kick', hold: HOLD.quick, aim: 0, crouch: false, grab: false, waitAim: false, steps: waited || 0, released: false, pending: false, name: r.move };
    /* the tutorial: every line is a punch at the angle of the line; its length and speed give the strength */
    if (punchOnly) { p.aimFromStroke = true; p.aim = aimOf(r.ang || 0); p.waitAim = Math.abs(p.aim) > 4; p.hold = r.tier === 'heavy' ? HOLD.heavy : (r.tier === 'quick' || r.type === 'TAP' ? HOLD.quick : HOLD.cross); p.needSure = r.tier !== 'heavy' && r.type !== 'TAP'; p.sure = r.phase === 'final'; return p; }
    if (r.type === 'GRAPPLE') { p.grab = true; p.steps = 0; return p; }                 /* the grab key must be pressed now, not after the wait */
    if (r.type === 'TAP') return p;
    if (r.type === 'STRAIGHT') { p.aimFromStroke = true; p.aim = aimOf(r.ang || 0); p.waitAim = Math.abs(p.aim) > 8; p.hold = r.tier === 'heavy' ? HOLD.heavy : (r.tier === 'quick' || !hand ? HOLD.quick : HOLD.cross); p.needSure = r.tier !== 'heavy'; p.sure = r.phase === 'final'; return p; }
    if (r.type === 'RISING') { if (hand) { p.crouch = true; p.hold = HOLD.crouch; } else { p.aim = 45; p.waitAim = true; p.hold = HOLD.aim; } return p; }
    if (r.type === 'LOW') { p.aim = hand ? Math.min(-30, aimOf(r.ang || 90)) : -22; p.waitAim = true; p.hold = HOLD.aim; return p; }
    if (r.type === 'ARC') { if (!hand && r.move === 'LOW SWEEP') { p.crouch = true; p.hold = HOLD.crouch; } else p.hold = hand ? HOLD.hook : HOLD.round; return p; }
    return p;
  }

  /* every new reading of the stroke: a straight move is released only when the path is clearly straight (a hook starts straight too) or the finger has lifted */
  function observe(plan, r) {
    if (!plan || plan.pending || !r) return;
    if (plan.aimFromStroke && !plan.released && typeof r.ang === 'number') { plan.aim = aimOf(r.ang); plan.waitAim = Math.abs(plan.aim) > 4; }
    if (r.phase === 'final' || (r.extent >= SURE_MM && Math.abs(r.turn || 0) < SURE_DEG)) plan.sure = true;
  }

  /* one simulation step: the keys this plan presses and the plan afterwards (null when it is finished); f is the fighter, read only */
  function step(plan, f, fingerDown) {
    const inp = {};
    let target = 0;
    if (plan && plan.pending && !fingerDown) plan = null;                               /* the finger went away without a lift event */
    if (plan && plan.pending) { plan.steps++; inp[plan.key] = true; }
    else if (plan) {
      plan.steps++; target = plan.aim;
      if (plan.crouch) inp.crouch = true;
      if (plan.grab) { inp.grab = plan.steps <= 2; if (plan.steps > 2) plan = null; }
      else {
        const ready = plan.steps >= plan.hold && (!plan.needSure || plan.sure) && (!plan.waitAim || Math.abs(f.aim - plan.aim) < (plan.aimFromStroke ? 3.5 : 8) || plan.steps > 50);
        if (!ready && !plan.released) inp[plan.key] = true; else plan.released = true;
        if (plan.released && plan.steps > plan.hold + 3 && f.state !== 'charge') plan = null;
      }
    }
    /* aim: a servo that drives the fighter's aim to the target (the keyboard does this by holding Q or E) */
    if (f.aim < target - 3) inp.aimUp = true; else if (f.aim > target + 3) inp.aimDown = true;
    return { inp: inp, plan: plan };
  }

  /* the move circle as inputs. With back-block on, holding it away from the opponent blocks (and still walks back); seg is the screen direction */
  function stickInputs(seg, face, s) {
    const inp = { right: seg === 'right', left: seg === 'left', jump: seg === 'up', crouch: seg === 'down', block: false };
    if (s && s.backBlock && seg === (face >= 0 ? 'left' : 'right')) inp.block = true;
    return inp;
  }

  const api = { pending: pending, planFor: planFor, observe: observe, step: step, stickInputs: stickInputs, HOLD: HOLD };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.SFP = api;
})(typeof window !== 'undefined' ? window : this);

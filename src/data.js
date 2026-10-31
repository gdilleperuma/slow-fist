// All tunable numbers live here, deeply frozen. No logic in this file.
var SF = (typeof SF === 'undefined') ? {} : SF;
SF.deepFreeze = function (o) {
  Object.getOwnPropertyNames(o).forEach(function (k) {
    const v = o[k];
    if (v && typeof v === 'object' && !Object.isFrozen(v)) SF.deepFreeze(v);
  });
  return Object.freeze(o);
};
SF.CFG = SF.deepFreeze({
  W: 900, GY: 380, DT: 1 / 60, DT_MAX: 1 / 20,
  MAXV: 190, ACC: 260, FRIC: 500, AIR_ACC: 90, JUMP_V: 380, G: 900,
  STRIKE_T: 0.4, CHARGE_MAX: 0.6, GRAB_CANCEL: 0.3, LONE_BONUS: 1.5, LONE_ARMOR: 1.5, BOOST_COST: 30, BOOST_T: 4, BOOST_CD: 12, BOOST_DMG: 1.5, FLIP_LOCK: 3, TAP_BOOST: 0.7, STRIKE_MAX: 3, TAP_GAP: 0.08, TAP_COST: 12,
  GRAB_LOCK: 0.25, GRAB_FLIP: 0.7, GRAB_START: 0.2, GRAB_CD: 2.5, GETUP_T: 0.85,
  /* getting up on purpose (iteration 13): how long it takes, how long you cannot be hit, what it costs in stamina, and how far a roll carries you */
  RECOV: { kip: { dur: 0.5, inv: 0.2, cost: 25, dx: 0 }, fwd: { dur: 0.8, inv: 0.35, cost: 15, dx: 70 }, back: { dur: 0.8, inv: 0.5, cost: 15, dx: -90 }, guard: { dur: 1.4, inv: 0.8, cost: 0, dx: 0 } },
  RECOV_MIN: 0.3, TECH_WINDOW: 0.25, TECH_AFTER: 0.15, TECH_SHORTEN: 0.67, TECH_DMG: 0.7,
  DASH_T: 0.22, DASH_INV: 0.16, DASH_CD: 0.7, DASH_COST: 15, DASH_V: 420,
  PARRY_AGE: 0.25, EXH_RECOVER: 30,
  PROTECT_AFTER: 1.5, BUDGET_FRAC: 0.2,
  G_HOLD: 330, SPRINT_T: 0.5, SPRINT_MULT: 1.45, SPRINT_COST: 6, SPRINT_GAP: 0.25, JUMP_PRE: 0.07, TRIP_V: 110,
  BODY_H: 165, SHOULDER_H: 125, HIP_H: 70,
  LIMB: { upperArm: 30, foreArm: 30, thigh: 38, shin: 38, torso: 55, neck: 12, head: 11, shoulder: 7 },
  STYLES: [
    { name: 'Boxer',    pr: 72, kr: 80,  pm: 1.3, km: 0.8,  tolB: 4, gmax: 120, mv: 1.0,  hpMax: 150, tap: 1.2, thr: 1.0,  grab: 55, krec: 0.9,  sreg: 1.0, khi: 35 },
    { name: 'Kicker',   pr: 66, kr: 98,  pm: 0.9, km: 1.35, tolB: 0, gmax: 108, mv: 1.15, hpMax: 168, tap: 1.0, thr: 1.0,  grab: 55, krec: 0.65, sreg: 1.0, khi: 60 },
    { name: 'Grappler', pr: 62, kr: 80,  pm: 1.1, km: 1.0,  tolB: 0, gmax: 100, mv: 0.85, hpMax: 188, tap: 0.8, thr: 1.45, grab: 80, krec: 0.9,  sreg: 1.3, khi: 28 }
  ],
  // dm: damage, tip: knockdown factor, tol: guard tolerance multiplier, bal: balance cost to the attacker
  KIND: {
    straight: { dm: 1,    tip: 1,   tol: 1,    bal: 0 },
    up:       { dm: 1.15, tip: 1.3, tol: 1,    bal: 0.1 },
    hook:     { dm: 1.05, tip: 1,   tol: 0.75, bal: 0 },
    chop:     { dm: 1.1,  tip: 1.2, tol: 1,    bal: 0 },
    low:      { dm: 0.95, tip: 1.5, tol: 1,    bal: 0 },
    spin:     { dm: 1.3,  tip: 1.3, tol: 0.7,  bal: 0.35 },
    flying:   { dm: 1.1,  tip: 1,   tol: 1,    bal: 0.2 }
  },
  SMB: { Boxer: { up: 1.15, hook: 1.15 }, Kicker: { spin: 1.1, up: 1.1, low: 1.15, flying: 1.1 }, Grappler: { chop: 1.2 } },
  /* Frame data at 60 fps and strike speed 1: fr = [startup, active, recovery]; cancel = the last frames of the recovery in
     which the next move of a sequence may start; lunge = px advanced during the startup; hand 0 = lead, 1 = rear. */
  BUFFER_F: 5,
  MOVES: {
    'JAB':              { limb: 'punch', kind: 'straight', aim: 10,  hand: 0, fr: [6, 3, 11],  cancel: 8, lunge: 16 },
    'CROSS':            { limb: 'punch', kind: 'straight', aim: 0,   hand: 1, fr: [9, 3, 14],  cancel: 9, lunge: 10 },
    'HOOK':             { limb: 'punch', kind: 'hook',     aim: 5,   hand: 0, fr: [11, 3, 16], cancel: 9, lunge: 8 },
    'UPPERCUT':         { limb: 'punch', kind: 'up',       aim: 45,  hand: 1, fr: [11, 3, 17], cancel: 9, lunge: 6 },
    'OVERHAND':         { limb: 'punch', kind: 'chop',     aim: -30, hand: 1, fr: [14, 4, 20], cancel: 8, lunge: 12 },
    'SPINNING BACKFIST': { limb: 'punch', kind: 'straight', look: 'spinfist', aim: 10,  hand: 1, fr: [16, 4, 22], cancel: 6, lunge: 12 },
    'SUPERMAN PUNCH':   { limb: 'punch', kind: 'straight', look: 'superman', aim: 0,   hand: 0, fr: [8, 4, 14],  cancel: 0, lunge: 0, air: true },
    'LEAPING UPPERCUT': { limb: 'punch', kind: 'up',       aim: 45,  hand: 1, fr: [8, 4, 14],  cancel: 0, lunge: 0, air: true },
    'FRONT KICK':       { limb: 'kick',  kind: 'straight', aim: 0,   hand: 0, fr: [9, 3, 16],  cancel: 8, lunge: 10 },
    'ROUNDHOUSE':       { limb: 'kick',  kind: 'hook',     look: 'round', aim: 5,   hand: 0, fr: [13, 4, 22], cancel: 9, lunge: 8 },
    'LOW KICK':         { limb: 'kick',  kind: 'low',      aim: -20, hand: 0, fr: [11, 3, 17], cancel: 8, lunge: 10 },
    'LOW SWEEP':        { limb: 'kick',  kind: 'low',      look: 'sweep', aim: -20, hand: 0, fr: [13, 4, 20], cancel: 6, lunge: 14 },
    'RISING KICK':      { limb: 'kick',  kind: 'up',       aim: 45,  hand: 0, fr: [12, 3, 20], cancel: 6, lunge: 8 },
    'AXE KICK':         { limb: 'kick',  kind: 'chop',     look: 'axe', aim: 45,  hand: 0, fr: [16, 4, 24], cancel: 6, lunge: 6 },
    'SPINNING KICK':    { limb: 'kick',  kind: 'spin',     look: 'spin', aim: 0,   hand: 0, fr: [20, 4, 28], cancel: 8, lunge: 22 },
    'FLYING SIDE KICK': { limb: 'kick',  kind: 'flying',   look: 'flying', aim: 0,   hand: 0, fr: [12, 5, 16], cancel: 0, lunge: 0, air: true },
    'BUTTERFLY KICK':   { limb: 'kick',  kind: 'flying',   look: 'butterfly', aim: 15,  hand: 0, fr: [14, 5, 18], cancel: 0, lunge: 0, air: true },
    'TORNADO KICK':     { limb: 'kick',  kind: 'flying',   look: 'tornado', aim: 10,  hand: 0, fr: [18, 5, 22], cancel: 0, lunge: 0, air: true }
  },
  /* sequences: after the move on the left, pressing punch or kick in the cancel window continues with the move listed */
  CHAIN: {
    Boxer: {
      'JAB': { punch: 'CROSS', kick: 'LOW KICK' }, 'CROSS': { punch: 'HOOK', kick: 'FRONT KICK' },
      'HOOK': { punch: 'UPPERCUT', kick: 'LOW KICK' }, 'UPPERCUT': { punch: 'CROSS', kick: 'FRONT KICK' }
    },
    Kicker: {
      'FRONT KICK': { punch: 'CROSS', kick: 'ROUNDHOUSE' }, 'ROUNDHOUSE': { punch: 'JAB', kick: 'SPINNING KICK' },
      'SPINNING KICK': { punch: 'JAB', kick: 'FRONT KICK' }, 'JAB': { punch: 'CROSS', kick: 'ROUNDHOUSE' }, 'CROSS': { punch: 'JAB', kick: 'ROUNDHOUSE' }
    },
    Grappler: {
      'JAB': { punch: 'HOOK', kick: 'LOW KICK' }, 'HOOK': { punch: 'OVERHAND', kick: 'LOW KICK' }, 'OVERHAND': { punch: 'JAB', kick: 'LOW SWEEP' },
      'LOW KICK': { punch: 'JAB', kick: 'FRONT KICK' }, 'FRONT KICK': { punch: 'HOOK', kick: 'LOW SWEEP' }
    }
  },
  STATES: ['idle', 'charge', 'strike', 'recover', 'guard', 'stagger', 'down', 'getup', 'grab', 'grapple', 'flipped']
});

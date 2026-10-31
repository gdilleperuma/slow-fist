/* The help, as data. Built from the same tables the simulation uses (CFG.MOVES, CFG.CHAIN, SF.INPUT_KEYS), so a new move or key cannot be missing:
   test HELP-01 compares the lists. Pure: no DOM. menu.js draws it. Also the speed choices. */
var SF = (typeof SF === 'undefined') ? {} : SF;
(function () {
  'use strict';
  const C = SF.CFG;
  SF.SPEEDS = [0.25, 0.5, 0.75, 1];
  SF.DEFAULT_SPEED = 1;

  /* what each input key is called, its keyboard binding for player 1 (and 2), and the touch control that gives it */
  const KEYS = {
    left:    { label: 'Move left',  keyboard: 'A  (P2: Left)',           touch: 'Move circle: left' },
    right:   { label: 'Move right', keyboard: 'D  (P2: Right)',          touch: 'Move circle: right. Flick twice to sprint' },
    jump:    { label: 'Jump',       keyboard: 'W  (P2: Up)',             touch: 'Move circle: up' },
    crouch:  { label: 'Crouch',     keyboard: 'S  (P2: Down)',           touch: 'Move circle: down (DUCK)' },
    aimUp:   { label: 'Aim higher', keyboard: 'Q  (P2: Num8 or I)',      touch: 'Automatic: the direction of the stroke sets the aim' },
    aimDown: { label: 'Aim lower',  keyboard: 'E  (P2: Num2 or O)',      touch: 'Automatic: the direction of the stroke sets the aim' },
    punch:   { label: 'Punch',      keyboard: 'F  (P2: Num4 or K)',      touch: 'Hand circle: draw a stroke' },
    kick:    { label: 'Kick',       keyboard: 'G  (P2: Num6 or L)',      touch: 'Leg circle: draw a stroke' },
    block:   { label: 'Block',      keyboard: 'H  (P2: Num5 or J)',      touch: 'BLOCK button (hold)' },
    grab:    { label: 'Grapple',    keyboard: 'Z  (P2: Num1 or M)',      touch: 'Draw back in the hand or leg circle' },
    dash:    { label: 'Dash',       keyboard: 'C  (P2: Num3 or N)',      touch: 'Flick the move circle sideways and let go' },
    boost:   { label: 'BOOST',      keyboard: 'X  (P2: Num0 or /)',      touch: 'BOOST button' },
    turn:    { label: 'TURN',       keyboard: 'U  (P2: Num. or .)',      touch: 'TURN button' }
  };
  /* how to throw each move: keyboard, then touch */
  const HOW = {
    'JAB': ['tap F', 'short fast stroke forward, or a tap'], 'CROSS': ['hold F a little, release', 'stroke forward'],
    'HOOK': ['hold F longer, release', 'curved stroke in the hand circle'], 'UPPERCUT': ['crouch + F, or aim up + F', 'stroke up in the hand circle'],
    'OVERHAND': ['aim down + F', 'stroke down in the hand circle'], 'SPINNING BACKFIST': ['hold F to the end, release', 'long slow stroke forward'],
    'SUPERMAN PUNCH': ['in the air: F', 'in the air: stroke forward'], 'LEAPING UPPERCUT': ['in the air: aim up + F', 'in the air: stroke up'],
    'FRONT KICK': ['tap G', 'stroke or tap in the leg circle'], 'ROUNDHOUSE': ['hold G a little, release', 'curved stroke in the leg circle'],
    'LOW KICK': ['aim down + G', 'stroke down in the leg circle'], 'LOW SWEEP': ['crouch + G', 'low curved stroke in the leg circle'],
    'RISING KICK': ['aim up + G', 'stroke up in the leg circle'], 'AXE KICK': ['hold G to the end (Boxer, Grappler)', 'long slow stroke forward in the leg circle'],
    'SPINNING KICK': ['hold G to the end (Kicker)', 'long slow stroke forward in the leg circle (Kicker)'], 'FLYING SIDE KICK': ['in the air: tap G', 'in the air: tap or stroke forward in the leg circle'],
    'BUTTERFLY KICK': ['in the air: aim up + G', 'in the air: stroke up in the leg circle'], 'TORNADO KICK': ['in the air: hold G, release', 'in the air: a long slow stroke in the leg circle']
  };
  const GESTURES = [
    { gesture: 'Forward, short and fast', hand: 'JAB', leg: 'FRONT KICK' },
    { gesture: 'Forward, normal', hand: 'CROSS', leg: 'FRONT KICK' },
    { gesture: 'Forward, long and slow', hand: 'SPINNING BACKFIST', leg: 'AXE KICK / SPINNING KICK' },
    { gesture: 'Up', hand: 'UPPERCUT', leg: 'RISING KICK' },
    { gesture: 'Down', hand: 'OVERHAND', leg: 'LOW KICK' },
    { gesture: 'Curve, up and over', hand: 'HEAD HOOK', leg: 'ROUNDHOUSE' },
    { gesture: 'Curve, low', hand: 'BODY HOOK', leg: 'LOW SWEEP' },
    { gesture: 'Draw straight back', hand: 'GRAB, then throw', leg: 'TRIP (the same grapple)' },
    { gesture: 'Tap', hand: 'JAB', leg: 'FRONT KICK' },
    { gesture: 'Press again in the cancel window', hand: 'next move of the sequence', leg: 'next move of the sequence' }
  ];

  SF.helpModel = function (styleIndex) {
    const style = C.STYLES[styleIndex === undefined ? 0 : styleIndex], graph = C.CHAIN[style.name] || {};
    return {
      style: style.name,
      keys: SF.INPUT_KEYS.map(function (k) { const e = KEYS[k] || {}; return { key: k, label: e.label || k, keyboard: e.keyboard || '', touch: e.touch || '' }; }),
      moves: Object.keys(C.MOVES).map(function (n) {
        const mv = C.MOVES[n], h = HOW[n] || ['', ''];
        return { name: n, limb: mv.limb, air: !!mv.air, frames: mv.fr[0] + ' / ' + mv.fr[1] + ' / ' + mv.fr[2], keyboard: h[0], touch: h[1] };
      }),
      sequences: Object.keys(graph).map(function (from) { return { from: from, punch: graph[from].punch || '', kick: graph[from].kick || '' }; }),
      gestures: GESTURES.slice(),
      notes: [
        'BOOST: your hits deal ' + C.BOOST_DMG + ' times the damage for ' + C.BOOST_T + ' s. It costs ' + C.BOOST_COST + ' stamina and has a ' + C.BOOST_CD + ' s cooldown.',
        'TURN: flips the way you face and keeps it for ' + C.FLIP_LOCK + ' s (useful when enemies are on both sides). You cannot hit what is behind you while turned.',
        'When you are down, steer the move circle (keyboard W A S D) after a short wait: up is a kip-up (fast, costs ' + C.RECOV.kip.cost + ' stamina), forward a roll to your feet toward the opponent (' + C.RECOV.fwd.cost + '), back a roll away (' + C.RECOV.back.cost + '), down stay and guard (free, rests fastest). A tap just as you land, or at the end of a throw, breaks the fall: shorter, and a softer landing.',
        'Block just before a hit lands (and aim at it) for a PARRY. A grapple beats a guard but a crouching or retreating opponent slips out.',
        'Stamina: yellow. Guard: light blue. Balance: the marker under the bars. At zero stamina you are exhausted until it refills to ' + C.EXH_RECOVER + '.'
      ]
    };
  };
})();

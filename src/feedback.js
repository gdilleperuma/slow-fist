/* Feedback from the match events: how long to pause the picture and what to vibrate. Presentation only: the simulation never sees any of it,
   so recordings and replays are unaffected. Pure. `me` is the index of the fighter the player controls. */
var SF = (typeof SF === 'undefined') ? {} : SF;
(function () {
  'use strict';
  const MAX_STOP = 250;                    /* milliseconds */
  SF.feedbackFor = function (events, me) {
    let stop = 0; const vib = [];
    for (const e of events || []) {
      if (e.k === 'hit') {
        const dmg = isFinite(e.dmg) ? e.dmg : 0;
        if (e.a === me && e.tag === 'HIT') { stop = Math.max(stop, 30 + 4 * dmg); vib.push(15); }
        else if (e.d === me) {
          if (e.tag === 'HIT') { stop = Math.max(stop, 20 + 3 * dmg); vib.push(40); }
          else if (e.tag === 'PARRY') { vib.push(10, 30, 10); }
          else vib.push(10);                       /* BLOCK or PARTIAL */
        }
      } else if (e.k === 'knockdown' && e.d === me) { vib.push(60); }
      else if (e.k === 'throw' && e.d === me) { vib.push(30, 30, 60); }
      else if (e.k === 'ko') { stop = Math.max(stop, 200); vib.push(80); }
    }
    return { stopMs: Math.min(MAX_STOP, Math.round(stop)), vibrate: vib };
  };
})();

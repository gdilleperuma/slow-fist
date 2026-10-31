/* Player settings, the colour palettes and the first-run rule. Pure: the storage is passed in, so a test can use a fake one.
   The settings change how the game is shown and how the touch controls sit; they never change the rules or the recordings. */
var SF = (typeof SF === 'undefined') ? {} : SF;
(function () {
  'use strict';
  SF.SETTINGS_DEFAULT = Object.freeze({
    hand: 'right',          /* which hand holds the attack side: 'right' puts the attack circles on the right */
    size: 1,                /* size of the touch controls, 0.7 to 1.4 */
    opacity: 0.9,           /* how solid the controls are, 0.3 to 1 */
    floating: false,        /* the move circle follows the first touch instead of staying put */
    backBlock: false,       /* holding the stick away from the opponent blocks */
    tapJab: true,           /* a tap on the attack half is a jab */
    turnButton: true,       /* show the TURN button */
    palette: 'normal',      /* 'normal' or 'safe' (colour-blind safe) */
    haptics: true,          /* vibration on hits (Android) */
    hitStop: true,          /* a brief pause of the picture on a hit */
    hudScale: 1,            /* size of the bars, 1 to 1.6 */
    seenIntro: false        /* the first-run offer of the tutorial has been shown */
  });
  const num = function (v, lo, hi, dflt) { return typeof v === 'number' && isFinite(v) ? Math.max(lo, Math.min(hi, v)) : dflt; };
  const bool = function (v, dflt) { return typeof v === 'boolean' ? v : dflt; };
  SF.settingsClean = function (o) {
    const D = SF.SETTINGS_DEFAULT; o = (o && typeof o === 'object') ? o : {};
    return {
      hand: o.hand === 'left' ? 'left' : 'right', size: num(o.size, 0.7, 1.4, D.size), opacity: num(o.opacity, 0.3, 1, D.opacity),
      floating: bool(o.floating, D.floating), backBlock: bool(o.backBlock, D.backBlock), tapJab: bool(o.tapJab, D.tapJab), turnButton: bool(o.turnButton, D.turnButton),
      palette: o.palette === 'safe' ? 'safe' : 'normal', haptics: bool(o.haptics, D.haptics), hitStop: bool(o.hitStop, D.hitStop),
      hudScale: num(o.hudScale, 1, 1.6, D.hudScale), seenIntro: bool(o.seenIntro, D.seenIntro)
    };
  };
  const KEY = 'sf.settings';
  SF.settingsLoad = function (storage) {
    try { return SF.settingsClean(JSON.parse(storage.getItem(KEY) || 'null')); } catch (e) { return SF.settingsClean({}); }
  };
  SF.settingsSave = function (storage, s) { try { storage.setItem(KEY, JSON.stringify(SF.settingsClean(s))); } catch (e) { /* private mode or full: the settings simply do not persist */ } };
  SF.shouldOnboard = function (s) { return !s.seenIntro; };

  /* team colours (a list per team), and the colours of the bars; 'safe' uses the Okabe-Ito colour-blind safe set */
  const PALETTES = {
    normal: { team: [['#5ab0ff', '#6fdc9a'], ['#ff8a5a', '#ffd05a', '#e07ad8']], hp: null, sta: '#ffd24d', guard: '#7fe0ff' },
    safe:   { team: [['#0072B2', '#56B4E9'], ['#E69F00', '#CC79A7', '#F0E442']], hp: '#009E73', sta: '#FFFFFF', guard: '#9a8cff' }
  };
  SF.palette = function (name) { return PALETTES[name === 'safe' ? 'safe' : 'normal']; };
})();

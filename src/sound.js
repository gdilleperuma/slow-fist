/* Sound: a pure plan (events to sound names, tested in Node) and a small synthesiser used only in the browser. */
var SF = (typeof SF === 'undefined') ? {} : SF;
(function () {
  'use strict';
  SF.SOUND_NAMES = ['hit', 'block', 'parry', 'thud', 'slam', 'grab', 'swoosh', 'break', 'ko'];

  SF.soundPlan = function (events) {
    const out = [];
    for (const e of events) {
      if (e.k === 'hit') out.push(e.tag === 'HIT' ? 'hit' : e.tag === 'PARRY' ? 'parry' : 'block');
      else if (e.k === 'knockdown' || e.k === 'trip') out.push('thud');
      else if (e.k === 'throw') out.push('slam');
      else if (e.k === 'grapple') out.push('grab');
      else if (e.k === 'whiff' || e.k === 'dodge') out.push('swoosh');
      else if (e.k === 'guardBreak') out.push('break');
      else if (e.k === 'ko') out.push('ko');
    }
    return out;
  };

  if (typeof window === 'undefined') return;
  let ac = null, noise = null;
  const audio = SF.audio = { enabled: true };

  /* deterministic noise buffer (no Math.random: QA guide, determinism rule) */
  function makeNoise(ctx) {
    const len = ctx.sampleRate * 0.5, buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
    let s = 12345;
    for (let i = 0; i < len; i++) { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; d[i] = (s / 4294967296) * 2 - 1; }
    return buf;
  }
  function tone(freq, endFreq, dur, type, vol) {
    const t = ac.currentTime, o = ac.createOscillator(), g = ac.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(ac.destination); o.start(t); o.stop(t + dur + 0.02);
  }
  function burst(dur, vol, filterType, f0, f1) {
    const t = ac.currentTime, src = ac.createBufferSource(), fl = ac.createBiquadFilter(), g = ac.createGain();
    src.buffer = noise; fl.type = filterType; fl.frequency.setValueAtTime(f0, t); fl.frequency.exponentialRampToValueAtTime(Math.max(40, f1), t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(fl); fl.connect(g); g.connect(ac.destination); src.start(t); src.stop(t + dur + 0.02);
  }
  const VOICES = {
    hit: function () { burst(0.09, 0.5, 'lowpass', 1800, 300); tone(140, 60, 0.12, 'sine', 0.5); },
    block: function () { tone(320, 200, 0.07, 'square', 0.18); burst(0.04, 0.2, 'bandpass', 2400, 1200); },
    parry: function () { tone(880, 880, 0.18, 'sine', 0.25); tone(1320, 1320, 0.14, 'sine', 0.18); },
    thud: function () { tone(90, 40, 0.25, 'sine', 0.6); burst(0.08, 0.25, 'lowpass', 600, 200); },
    slam: function () { tone(70, 30, 0.35, 'sine', 0.7); burst(0.18, 0.5, 'lowpass', 900, 150); },
    grab: function () { burst(0.06, 0.25, 'bandpass', 900, 500); },
    swoosh: function () { burst(0.14, 0.18, 'highpass', 500, 3000); },
    break: function () { burst(0.2, 0.4, 'bandpass', 2000, 600); tone(220, 90, 0.25, 'square', 0.2); },
    ko: function () { tone(420, 70, 0.7, 'sawtooth', 0.3); burst(0.3, 0.4, 'lowpass', 1200, 150); }
  };
  audio.unlock = function () {
    if (ac) { if (ac.state === 'suspended') ac.resume(); return; }
    const A = window.AudioContext || window.webkitAudioContext;
    if (!A) return;
    ac = new A(); noise = makeNoise(ac);
  };
  audio.playAll = function (names) {
    if (!audio.enabled || !ac) return;
    for (const n of names) if (VOICES[n]) VOICES[n]();
  };
})();

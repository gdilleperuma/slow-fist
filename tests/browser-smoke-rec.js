// Browser smoke test for recording and replay (REC-08, BR-04). Run in the page; returns the list of failures or a PASS line.
(async () => {
  const fails = [], wait = ms => new Promise(r => setTimeout(r, ms));
  const down = c => dispatchEvent(new KeyboardEvent('keydown', { code: c, key: c }));
  const up = c => dispatchEvent(new KeyboardEvent('keyup', { code: c, key: c }));
  const key = c => { down(c); up(c); };
  [...document.querySelectorAll('button')].filter(b => b.textContent === 'Skip').forEach(b => b.click());   /* the first-run offer (ONB-01) must not get in the way */
  const D = () => window.SF_DEBUG;
  const speed0 = D().speed;   /* whatever the live speed is (it was 0.7, the default is now 1.0): replay must not change it */
  const need = (cond, msg) => { if (!cond) fails.push(msg); };

  for (const id of ['bRec', 'bPlay', 'bSave', 'bLoad', 'bVid', 'fLoad']) need(document.getElementById(id), 'REC-08 missing element #' + id);
  if (D().help) key('F1');
  D().setMode('ai');
  await wait(200);

  // record a human-vs-AI round with real key presses
  key('KeyV'); await wait(150);
  need(D().recording, 'REC-08 V should start recording');
  down('KeyD'); down('KeyF'); await wait(700); up('KeyF'); up('KeyD'); await wait(1800);
  key('KeyV'); await wait(100);
  need(!D().recording, 'REC-08 V again should stop recording');
  const rec = D().lastRec;
  need(rec && rec.frames.length >= 60, 'REC-08 the recording has steps: ' + (rec ? rec.frames.length : 'none'));
  if (rec) {
    need(rec.frames.some(f => f[0] !== 0), 'REC-08 human input was recorded');
    need(rec.frames.every(f => f[1] === 0), 'REC-08 the AI fighter records no input');
    const v = SF.verifyRecording(rec); need(v.ok, 'REC-01 the live recording verifies: ' + v.reason);
  }

  // replay
  const live = D().match;
  key('KeyB'); await wait(150);
  need(D().replaying, 'REC-08 B should start the replay');
  need(D().player && D().player.speed === 1, 'REC-04 replay starts at normal speed');
  await wait(500); need(D().player && D().player.pos > 10, 'REC-04 the replay advances: ' + (D().player ? D().player.pos : 'none'));
  key('KeyR'); key('KeyT'); key('Digit1'); key('Digit2');
  need(D().match === live, 'REC-08 R, T, 1, 2 must be ignored during replay');
  need(D().modes[0] === 'human' && D().modes[1] === 'ai', 'REC-08 the mode must not change during replay');
  key('BracketRight'); need(Math.abs(D().player.speed - 1.1) < 1e-9, 'REC-04 ] raises the replay speed: ' + D().player.speed);
  key('BracketLeft'); key('BracketLeft'); key('BracketLeft'); need(Math.abs(D().player.speed - 0.8) < 1e-9, 'REC-04 [ lowers it: ' + D().player.speed);
  need(D().speed === speed0, 'REC-04 the live speed setting is untouched: ' + D().speed + ' vs ' + speed0);
  key('KeyB'); await wait(100);
  need(!D().replaying, 'REC-08 B should leave the replay');

  // save and load
  const text = D().saveText(); need(typeof text === 'string' && text.length > 20, 'REC-07 saveText returns the file');
  need(D().loadText(text) === true, 'REC-07 a good file loads');
  const t = JSON.parse(text); t.frames[10][0] ^= 64;
  need(D().loadText(JSON.stringify(t)) === false, 'REC-07 a tampered file is rejected');
  need(D().note && D().note.bad && /does not replay identically/.test(D().note.text), 'REC-07 the rejection is explained: ' + (D().note ? D().note.text : ''));
  need(D().loadText('{bad') === false, 'REC-03 invalid JSON is rejected');
  need(typeof MediaRecorder !== 'undefined' && !!HTMLCanvasElement.prototype.captureStream, 'REC-08 this browser can export video (information only)');

  return JSON.stringify(fails.length ? fails : ['PASS: browser recording and replay smoke test']);
})()

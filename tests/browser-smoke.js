// Browser smoke test (QA guide 20.13). Paste into the page console or run through the browser tool; returns a list of failures.
(async () => {
  const fails = [], wait = ms => new Promise(r => setTimeout(r, ms));
  const key = c => { dispatchEvent(new KeyboardEvent('keydown', { code: c, key: c })); dispatchEvent(new KeyboardEvent('keyup', { code: c, key: c })); };
  const D = () => window.SF_DEBUG;
  const members = ['reset', 'setMode', 'match', 'modes', 'styleSel', 'help', 'speed'];
  const check = (label) => { for (const m of members) if (!(m in D()) || D()[m] === undefined) fails.push(label + ': SF_DEBUG.' + m + ' missing'); };
  await wait(1000);
  [...document.querySelectorAll('button')].filter(b => b.textContent === 'Skip').forEach(b => b.click());   /* the first-run offer (ONB-01) must not get in the way */
  await wait(300);
  check('load');
  key('F1'); await wait(150); const hp = [...document.querySelectorAll('div')].find(d => /Everything you can do/.test(d.textContent) && d.style.position === 'fixed');
  if (!hp) fails.push('BR-02 F1 should open the help panel'); else [...hp.querySelectorAll('button')].forEach(b => b.click());
  await wait(100);
  for (const c of ['KeyR', 'KeyT', 'KeyT', 'KeyT', 'Digit1', 'Digit2', 'BracketLeft', 'BracketRight']) { key(c); await wait(50); check('after ' + c); }
  D().setMode('cpu'); await wait(1500);
  if (D().match.steps < 30) fails.push('BR-01 simulation not advancing: ' + D().match.steps + ' steps');
  const m0 = D().match.steps; D().reset(); check('after reset()'); await wait(500);
  if (D().match.steps >= m0 && D().match.steps > 200) fails.push('BR-01 reset did not create a new match');
  const bad = JSON.stringify(D().match.f.map(f => [f.x, f.h, f.hp, f.sta])).match(/null|NaN/);
  if (bad) fails.push('BR-03 non-numeric state in the live match');
  return fails.length ? fails : ['PASS: browser smoke test'];
})()

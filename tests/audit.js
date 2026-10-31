'use strict';
// QA audit: the documents must agree with the tests. Run: node tests/audit.js
//  1. every requirement ID in docs/REQUIREMENTS.md has a test with that ID (or is on the list of requirements checked by hand, with a reason)
//  2. every test ID is a requirement (or a regression test of a logged defect)
//  3. every defect in docs/QA-LOG.md names a class of the guide that exists, and its regression tests exist
//  4. every guide section 20.n that a defect cites exists in the master guide
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..'), read = p => fs.readFileSync(path.join(root, p), 'utf8');
const req = read('docs/REQUIREMENTS.md'), log = read('docs/QA-LOG.md'), guide = fs.readFileSync(path.join(root, '..', 'HOW-TO-BUILD-QUALITY-SOFTWARE.md'), 'utf8');

/* requirements that are checked by eye or by the browser, not by a node test (each with the reason) */
const BY_HAND = { 'TAP-01': 'tap-to-jab: browser smoke BR-14', 'HUD-01': 'labelled HUD and palette: browser smoke BR-10', 'MNU-01': 'quick play and pause: browser smoke BR-11, BR-12', 'TURN-03': 'touch controller labels follow the facing: browser only (BR-07 checks the button)', 'UI-01': 'help: browser smoke BR-02 and BR-06', 'REC-08': 'recording buttons: tests/browser-smoke-rec.js', 'RCV-12': 'recovery wheel and key W while down: browser smoke BR-15' };

const reqIds = new Set(); for (const m of req.matchAll(/^\| ([A-Z][A-Za-z]*-\d+[a-z]?) \|/gm)) reqIds.add(m[1]);
const testIds = new Set();
for (const f of fs.readdirSync(path.join(root, 'tests'))) if (f.endsWith('.js')) {
  const text = read('tests/' + f);
  for (const m of text.matchAll(/test\('([A-Z][A-Za-z]*-\d+[a-z]?(?:\/\d+)?)'/g)) { testIds.add(m[1]); const sl = /^([A-Z][A-Za-z]*-)(\d+)\/(\d+)$/.exec(m[1]); if (sl) { testIds.add(sl[1] + sl[2]); testIds.add(sl[1] + sl[3]); } }
  if (/^browser-smoke/.test(f)) for (const m of text.matchAll(/\b(BR-\d+)\b/g)) testIds.add(m[1]);
}
const problems = [];

for (const id of reqIds) if (!testIds.has(id) && !BY_HAND[id]) problems.push('requirement ' + id + ' has no test');
/* a requirement checked in the browser must name browser tests that exist */
for (const id in BY_HAND) for (const t of BY_HAND[id].matchAll(/BR-\d+/g)) if (!testIds.has(t[0])) problems.push(id + ': the browser test ' + t[0] + ' named in the by-hand list does not exist');
/* tests whose ID is not a requirement: allowed when a defect names them as its regression test */
const regression = new Set(); for (const m of log.matchAll(/Regression test:\s*([^\n]+)/g)) for (const t of m[1].matchAll(/[A-Z][A-Za-z]*-\d+[a-z]?/g)) regression.add(t[0]);
for (const id of testIds) if (!reqIds.has(id) && !regression.has(id) && id.indexOf('/') < 0) problems.push('test ' + id + ' is neither a requirement nor the regression test of a logged defect');

/* defects */
const defs = [...log.matchAll(/^## (DEF-\d+)\b[^\n]*\n([\s\S]*?)(?=^## |^# |\Z)/gm)];
const seen = new Set();
for (const m of defs) {
  const id = m[1], body = m[2]; if (seen.has(id)) continue; seen.add(id);
  const cls = /Class:\s*([^\n]+)/.exec(body);
  if (!cls) { problems.push(id + ': no Class line'); }
  else {
    const num = /20\.(\d+)/.exec(cls[1]);
    if (!num) problems.push(id + ': the class does not cite a guide section (20.n): ' + cls[1].slice(0, 60));
    else if (!new RegExp('^### 20\\.' + num[1] + ' ', 'm').test(guide)) problems.push(id + ': guide section 20.' + num[1] + ' does not exist');
  }
  if (!/Root cause:/.test(body)) problems.push(id + ': no root cause');
  if (!/Fix pattern:/.test(body)) problems.push(id + ': no fix pattern');
  const rt = /Regression test:\s*([^\n]+)/.exec(body);
  if (!rt) problems.push(id + ': no regression test named');
  else for (const t of rt[1].matchAll(/\b([A-Z][A-Za-z]*-\d+[a-z]?)\b/g)) if (!testIds.has(t[1]) && !/^BR-/.test(t[1]) && !/DEF-/.test(t[1])) problems.push(id + ': regression test ' + t[1] + ' does not exist');
}
console.log('requirements ' + reqIds.size + ', tests ' + testIds.size + ', defects ' + seen.size + ', by hand ' + Object.keys(BY_HAND).length);
if (problems.length) { console.log(problems.length + ' problem(s):'); for (const p of problems) console.log('  ' + p); process.exit(1); }
console.log('audit clean');

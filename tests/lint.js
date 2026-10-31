'use strict';
// Static scans that detect defect classes from the QA guide (section 20). Returns a list of findings.
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'src'), TESTS = __dirname;
function files(dir) { return fs.readdirSync(dir).filter(f => f.endsWith('.js')).map(f => path.join(dir, f)); }

/* Replace comments and the contents of strings with spaces, keeping line numbers and columns (DEF-009).
   Used for the rules that look for code patterns; src files contain no regex literals with quotes. */
function strip(text) {
  let out = '', i = 0, q = null;
  while (i < text.length) {
    const c = text[i], n = text[i + 1];
    if (q) {
      if (c === '\\') { out += '  '; i += 2; continue; }
      if (c === q) { q = null; out += c; i++; continue; }
      out += c === '\n' ? '\n' : ' '; i++; continue;
    }
    if (c === '/' && n === '/') { while (i < text.length && text[i] !== '\n') { out += ' '; i++; } continue; }
    if (c === '/' && n === '*') {
      out += '  '; i += 2;
      while (i < text.length && !(text[i] === '*' && text[i + 1] === '/')) { out += text[i] === '\n' ? '\n' : ' '; i++; }
      out += '  '; i += 2; continue;
    }
    if (c === "'" || c === '"' || c === '`') { q = c; out += c; i++; continue; }
    out += c; i++;
  }
  return out;
}

/* the code-pattern rules, applied to one source file's text (LINT-01, tested by LINT-04) */
function codeRules(text, file) {
  const out = [], raw = text.split(/\r?\n/), code = strip(text).split(/\r?\n/);
  code.forEach((ln, i) => {
    const where = file + ':' + (i + 1), marked = raw[i].indexOf('@bounded') >= 0;
    if (/\.(sta|hp|gHP)\s*(-=|\+=|=[^=])/.test(ln) && !marked) out.push(where + ' unreviewed write to a bounded value (20.9)');
    if (/\bC\.[A-Za-z_][\w.\[\]]*\s*(-=|\+=|=[^=])/.test(ln)) out.push(where + ' assignment to CFG (20.2)');
    if (/Math\.random/.test(ln)) out.push(where + ' Math.random in src (SIM-01)');
    if (/Date\.now|performance\.now/.test(ln) && !/main\.js|render\.js/.test(file)) out.push(where + ' wall clock in simulation code (20.3)');
  });
  return out;
}

/* 20.17: an assignment to a fighter field of a match inside a recording test (DEF-011) */
function handEdit(line) { return /\bm\d*\.f\[\d\]\.[A-Za-z]+\s*(\+|-)?=[^=]/.test(line); }

// SYNTAX-01: every source and test file must parse (QA guide 20.1, DEF-006)
function syntax() {
  const out = [];
  for (const f of files(SRC).concat(files(TESTS))) {
    const text = fs.readFileSync(f, 'utf8').replace(/^#!.*\n/, '');
    try { new vm.Script(text.indexOf('require(') >= 0 ? '(function(require,module,process,__dirname){' + text + '\n})' : text, { filename: f }); }
    catch (e) { out.push(path.relative(ROOT, f) + ' does not parse: ' + e.message); }
  }
  return out;
}

// LINT-01 and LINT-02
function scan() {
  const out = [];
  for (const f of files(SRC).concat(files(TESTS))) {
    const file = path.relative(ROOT, f), text = fs.readFileSync(f, 'utf8');
    text.split(/\r?\n/).forEach((ln, i) => {
      const where = file + ':' + (i + 1), ci = ln.indexOf('//');
      const inString = ci > 0 && ['\'', '"', '`'].some(qc => (ln.slice(0, ci).split(qc).length - 1) % 2 === 1);
      if (ci >= 0 && !inString && !/^\s*\/\//.test(ln)) {
        const codePart = ln.slice(0, ci), com = ln.slice(ci);
        // 20.1: a trailing comment on a long or multi-statement line can swallow code that was meant to follow it
        if (codePart.trim().length > 120) out.push(where + ' "//" comment on a line whose code is ' + codePart.trim().length + ' characters long: use /* */ or split the line (20.1)');
        else if ((codePart.match(/;/g) || []).length > 2) out.push(where + ' "//" comment on a line with more than two statements (20.1)');
        if (/;\s*[\w.\[\]]+\s*(\+|-|\*|\/)?=[^=]/.test(com)) out.push(where + ' comment contains "; x = ..." (20.1)');
      }
    });
    if (f.startsWith(SRC)) {
      out.push.apply(out, codeRules(text, file));
      // 20.12 a window.* handle must be assigned once per file (LINT-03)
      const seen = {};
      for (const mm of strip(text).matchAll(/window\.(\w+)\s*=[^=]/g)) seen[mm[1]] = (seen[mm[1]] || 0) + 1;
      for (const n in seen) if (seen[n] > 1) out.push(file + ' assigns window.' + n + ' ' + seen[n] + ' times (20.12)');
    }
  }
  // 20.17 recording tests must not edit match state by hand before recording (DEF-011)
  fs.readFileSync(path.join(TESTS, 'rec.js'), 'utf8').split(/\r?\n/).forEach((ln, i) => {
    if (handEdit(ln)) out.push('tests/rec.js:' + (i + 1) + ' edits fighter state by hand in a recording test (20.17)');
  });
  // 20.7 old helper signature in the tests: hit(m, <number>, ...) means the attacker index crept back
  const t = fs.readFileSync(path.join(TESTS, 'run.js'), 'utf8').split(/\r?\n/);
  t.forEach((ln, i) => { if (/[^\w.]hit\([^,()]+,\s*\d/.test(ln) && !/^function hit/.test(ln.trim())) out.push('tests/run.js:' + (i + 1) + ' hit() called with a number as its second argument (20.7)'); });
  return out;
}

/* LINT-04: the scanner's own samples. Positive samples must be flagged, negative samples must not. */
function selfTest() {
  const problems = [];
  const flagged = (code, file) => codeRules(code, file || 'src/sim.js').length > 0;
  const positive = [
    'f.sta -= 5;', 'f.hp = 10;', 'x = Math.random();', 'C.G = 3;', 'const t = Date.now();',
    'f.sta -= 5; // no marker here, only a comment'
  ];
  const negative = [
    '// Math.random is not allowed here', '/* f.sta -= 5 is forbidden */', "const s = 'f.sta -= 5';", 'const s = "Math.random";',
    'f.sta -= 5; /* @bounded */', '/* multi\n line Math.random\n comment */\nconst ok = 1;', 'const r = f.sta >= 5;', 'const w = f.hp == 3;'
  ];
  positive.forEach(c => { if (!flagged(c)) problems.push('scanner missed: ' + JSON.stringify(c)); });
  negative.forEach(c => { if (flagged(c)) problems.push('scanner false positive: ' + JSON.stringify(c)); });
  if (flagged('const t = Date.now();', 'src/main.js')) problems.push('scanner flags Date.now in main.js, which is allowed');
  ['m.f[1].hp = 1;', 'm2.f[0].x = 300;', 'm.f[0].sta -= 5;'].forEach(c => { if (!handEdit(c)) problems.push('hand-edit rule missed: ' + c); });
  ['const k = m.f[0].styleIndex;', 'if (m.f[1].hp === 3) {}', 'eq(m.f[0].state, "idle");'].forEach(c => { if (handEdit(c)) problems.push('hand-edit rule false positive: ' + c); });
  return problems;
}
module.exports = { scan: scan, syntax: syntax, selfTest: selfTest, strip: strip };
if (require.main === module) {
  const r = syntax().concat(scan(), selfTest());
  r.forEach(x => console.log(x));
  console.log(r.length + ' finding(s)');
  process.exit(r.length ? 1 : 0);
}

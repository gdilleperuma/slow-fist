'use strict';
// Loads the same source files the browser build uses, in the same order, into an isolated context.
const fs = require('fs'), path = require('path'), vm = require('vm');
const ORDER = ['rng', 'data', 'sim', 'pose', 'ai', 'sound', 'replay', 'help', 'settings', 'feedback', 'actions', 'training', 'tutorial'];
function loadSF() {
  const ctx = vm.createContext({ console: console, Math: Math, Object: Object, JSON: JSON });
  const code = ORDER.map(n => fs.readFileSync(path.join(__dirname, '..', 'src', n + '.js'), 'utf8')).join('\n;\n');
  vm.runInContext(code + '\n;this.SF = SF;', ctx, { filename: 'sf-bundle.js' });
  return ctx.SF;
}
module.exports = { loadSF: loadSF, ORDER: ORDER };

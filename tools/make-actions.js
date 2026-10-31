'use strict';
// Writes docs/ACTIONS.html: every action with three preview images drawn by the game's own pose engine. Run: node tools/make-actions.js
// build() returns the page as a string; the test ACT-03 regenerates it and compares, so the page cannot go stale.
const fs = require('fs'), path = require('path');
const { loadSF } = require('../tests/load.js');

function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

/* a bar with the three phases in proportion: startup, active, recovery (frames at 60 per second) */
function timeline(fr) {
  const tot = fr[0] + fr[1] + fr[2], W = 200, w = fr.map(v => Math.max(2, v / tot * W)), c = ['#5ab0ff', '#ff6a4d', '#6d7383'], t = ['startup', 'active', 'recovery'];
  let x = 0, s = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + (W + 4) + ' 34" width="' + (W + 4) + '" height="34" role="img" aria-label="timing">';
  fr.forEach((v, i) => { s += '<rect x="' + x.toFixed(1) + '" y="2" width="' + w[i].toFixed(1) + '" height="12" fill="' + c[i] + '"/><text x="' + (x + w[i] / 2).toFixed(1) + '" y="26" font-size="8" fill="#9aa1b3" text-anchor="middle">' + v + '</text>'; x += w[i]; });
  s += '<text x="0" y="33" font-size="0"> </text></svg>';
  return s;
}

function build() {
  const SF = loadSF(), C = SF.CFG, help = SF.helpModel(0);
  const list = SF.actionList(0), groups = ['Punches', 'Kicks', 'In the air', 'Movement', 'Defence', 'Grappling', 'Special', 'After a fall'];
  let h = '<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Slow Fist: all actions</title>\n<style>\n';
  h += 'body{margin:0;background:#0b0d12;color:#e8ecf4;font-family:system-ui,sans-serif;line-height:1.4}\nmain{max-width:980px;margin:0 auto;padding:14px 16px 40px}\n';
  h += 'h1{font-size:20px;color:#ffd24d;margin:6px 0}\nh2{font-size:15px;color:#7fb0ff;margin:22px 0 6px;border-bottom:1px solid #262b38;padding-bottom:3px}\n';
  h += '.card{background:#151922;border:1px solid #262b38;border-radius:8px;padding:8px 10px;margin:8px 0}\n.card h3{margin:0 0 2px;font-size:14px}\n.imgs{display:flex;flex-wrap:wrap;gap:6px;margin:4px 0}\n';
  h += '.imgs figure{margin:0;text-align:center;font-size:11px;color:#9aa1b3}\n.imgs svg{background:#10131a;border-radius:6px;max-width:100%;height:auto}\n.how{font-size:12px;color:#c4cada}\n.how b{color:#7fe0ff}\n';
  h += '.fr{font-size:11px;color:#9aa1b3;display:flex;align-items:center;gap:8px;flex-wrap:wrap}\n.fr svg{background:none}\ntable{border-collapse:collapse;font-size:12px}td,th{border:1px solid #262b38;padding:3px 8px;text-align:left}th{background:#1b2030;color:#ffd24d}\n</style></head><body><main>\n';
  h += '<h1>Slow Fist: everything a fighter can do</h1>\n<p class="how">Each action is shown in three poses taken from the game itself (start, contact, end). Frames are startup / active / recovery at 60 per second. Keyboard keys are for player 1. In the pictures: the <b style="color:#ffd24d">yellow dotted line</b> is the path of the fist or foot, the <b style="color:#ff6a4d">red ring</b> is where it makes contact, the <b style="color:#9aa1b3">grey dashed line</b> is the angle of the strike, and a squeezed figure is a spin.</p>\n';
  for (const g of groups) {
    const items = list.filter(a => a.group === g); if (!items.length) continue;
    h += '<h2>' + esc(g) + '</h2>\n';
    for (const a of items) {
      const svgs = SF.actionSvgs(a.id, 0), poses = SF.actionPoses(a.id, 0);
      h += '<div class="card" id="' + esc(a.id.replace(/[^a-z0-9]+/gi, '-')) + '"><h3>' + esc(a.title) + '</h3>\n<div class="imgs">';
      svgs.forEach((s, i) => { h += '<figure>' + s + '<figcaption>' + esc(poses[i].label) + '</figcaption></figure>'; });
      h += '</div>\n';
      if (a.frames) {
        const name = a.id.slice(5), mv = C.MOVES[name], K = C.KIND[mv.kind] || C.KIND.straight, st = C.STYLES[0];
        h += '<div class="fr">' + timeline(mv.fr) + ' <span>startup / active / recovery frames (' + (a.frames) + ')</span></div>\n';
        h += '<div class="how"><b>Angle</b> ' + (mv.aim > 0 ? '+' : '') + mv.aim + '\u00B0 &middot; <b>Hand</b> ' + (mv.limb === 'punch' ? (mv.hand ? 'rear' : 'lead') : 'leg') + ' &middot; <b>Reach</b> ' + (mv.limb === 'kick' ? st.kr : st.pr) + ' px &middot; <b>Damage</b> x' + K.dm + ' &middot; <b>Knockdown</b> x' + K.tip + ' &middot; <b>Step</b> ' + mv.lunge + ' px &middot; <b>Chain window</b> ' + mv.cancel + ' frames' + (mv.air ? ' &middot; <b>In the air</b>' : '') + '</div>\n';
      }
      if (a.note) h += '<div class="how">' + esc(a.note) + '</div>\n';
      if (a.keyboard || a.touch) h += '<div class="how"><b>Keyboard:</b> ' + esc(a.keyboard) + ' &nbsp; <b>Touch:</b> ' + esc(a.touch) + '</div>\n';
      h += '</div>\n';
    }
  }
  h += '<h2>Sequences (press again at the end of a move)</h2>\n';
  for (let s = 0; s < C.STYLES.length; s++) {
    const m = SF.helpModel(s); h += '<table><tr><th colspan="3">' + esc(C.STYLES[s].name) + '</th></tr><tr><th>After</th><th>Punch</th><th>Kick</th></tr>';
    for (const r of m.sequences) h += '<tr><td>' + esc(r.from) + '</td><td>' + esc(r.punch) + '</td><td>' + esc(r.kick) + '</td></tr>';
    h += '</table><br>\n';
  }
  h += '<h2>Controls</h2>\n<table><tr><th>Action</th><th>Keyboard (player 1)</th><th>Touch</th></tr>';
  for (const k of help.keys) h += '<tr><td>' + esc(k.label) + '</td><td>' + esc(k.keyboard) + '</td><td>' + esc(k.touch) + '</td></tr>';
  h += '</table>\n</main></body></html>\n';
  return h;
}

module.exports = { build: build };
if (require.main === module) {
  const out = path.join(__dirname, '..', 'docs', 'ACTIONS.html'), html = build();
  fs.writeFileSync(out, html); console.log('wrote ' + out + ' (' + html.length + ' bytes)');
}

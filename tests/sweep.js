'use strict';
// Soak report: many AI-vs-AI fights, reported as numbers (QA guide section 7 and 14). Usage: node tests/sweep.js [fights] [firstSeed]
const { loadSF } = require('./load.js');
const SF = loadSF(), C = SF.CFG;
const N = +process.argv[2] || 150, FROM = +process.argv[3] || 5000;
const r = { fights: 0, timeouts: 0, wins: [0, 0, 0], played: [0, 0, 0], secs: [], kinds: {}, events: {}, matchups: {} };
for (let s = 0; s < N; s++) {
  const a = s % 3, b = Math.floor(s / 3) % 3;
  const m = SF.createMatch({ seed: FROM + s, styles: [a, b], ai: [true, true] });
  for (let i = 0; i < 2400 && m.winner === null; i++) SF.stepAI(m);
  r.fights++; r.played[a]++; r.played[b]++;
  const key = C.STYLES[a].name + ' v ' + C.STYLES[b].name;
  r.matchups[key] = r.matchups[key] || { n: 0, p1: 0, p2: 0, to: 0 };
  r.matchups[key].n++;
  if (m.winner === null) { r.timeouts++; r.matchups[key].to++; } else { r.wins[m.f[m.winner].styleIndex]++; r.matchups[key][m.winner === 0 ? 'p1' : 'p2']++; }
  r.secs.push(m.t);
  for (const k in m.stats.moves) r.kinds[k] = (r.kinds[k] || 0) + m.stats.moves[k];
  for (const k in m.stats.events) r.events[k] = (r.events[k] || 0) + m.stats.events[k];
}
const decided = r.wins[0] + r.wins[1] + r.wins[2];
r.secs.sort((x, y) => x - y);
console.log('fights', r.fights, ' timeouts', r.timeouts, ' median length', r.secs[r.secs.length >> 1].toFixed(1) + 's', ' longest', r.secs[r.secs.length - 1].toFixed(1) + 's');
console.log('wins by style (share of decided fights):', C.STYLES.map((s, i) => s.name + ' ' + Math.round(100 * r.wins[i] / decided) + '%').join(', '));
console.log('win rate when fielded:', C.STYLES.map((s, i) => s.name + ' ' + Math.round(100 * r.wins[i] / Math.max(1, r.played[i] * 1)) + '%').join(', '));
console.log('P1 side wins', Object.values(r.matchups).reduce((t, x) => t + x.p1, 0), ' P2 side wins', Object.values(r.matchups).reduce((t, x) => t + x.p2, 0));
console.log('moves used:', Object.keys(r.kinds).sort((x, y) => r.kinds[y] - r.kinds[x]).map(k => k + ' ' + r.kinds[k]).join(', '));
console.log('events:', Object.keys(r.events).sort().map(k => k + ' ' + r.events[k]).join(', '));

'use strict';
// Reports the worst joint jump and the kneeling check for the stand-up (used to choose the phase boundaries in pose.js).
const { loadSF } = require('./load.js');
const SF = loadSF(), C = SF.CFG;
let prev = null, worst = 0, where = '', kneel = 0;
for (let i = 0; i <= 34; i++) {
  const m = SF.createMatch({ seed: 5, styles: [0, 1] }), f = m.f[0]; f.state = 'getup'; f.t = Math.min(C.GETUP_T - 1e-6, i * 0.025);
  const k = SF.skeleton(f), pts = [];
  for (const n in k) (Array.isArray(k[n][0]) ? k[n] : [k[n]]).forEach((p, j) => pts.push([n + j, p]));
  if (prev) pts.forEach((q, idx) => { const d = Math.hypot(q[1][0] - prev[idx][1][0], q[1][1] - prev[idx][1][1]); if (d > worst) { worst = d; where = q[0] + ' t=' + f.t.toFixed(3); } });
  prev = pts;
  const lowKnee = Math.min(C.GY - k.knee[0][1], C.GY - k.knee[1][1]);
  if (f.t > 0.3 && f.t < 0.55) kneel = Math.max(kneel, 30 - lowKnee);
  if (process.argv[2]) console.log('t', f.t.toFixed(2), 'hip', (C.GY - k.hip[1]).toFixed(0), 'knees', k.knee.map(p => (C.GY - p[1]).toFixed(0)).join('/'), 'feet', k.foot.map(p => (C.GY - p[1]).toFixed(0)).join('/'));
}
console.log('worst joint jump per 0.025 s:', worst.toFixed(1), where, '| lowest knee in 0.3-0.55 s is within', (30 - kneel).toFixed(1), 'px of the floor');

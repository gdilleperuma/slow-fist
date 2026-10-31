/* Where the touch controls sit, and what a touch means. Pure: sizes in, geometry out, so it can be tested without a screen.
   Right-handed is the layout of iteration 9; left-handed mirrors it. The stage columns tell the page how much room the controls take. */
(function (root) {
  'use strict';
  function compute(W, H, pxmm, s, full) {
    const size = s.size, mir = s.hand === 'left';
    const R = Math.min(Math.min(9.5 * pxmm, H * 0.15) * size, H * 0.2), pad = Math.min(Math.min(12 * pxmm, H * 0.19) * size, H * 0.25), gap = 6, floor = H - 14;
    const br = Math.min(24, H * 0.07) * size, ring = pad + br + 8;
    const mx = function (x) { return mir ? W - x : x; };
    const home = { x: mx(pad + 24), y: floor - pad, r: pad };
    const at = function (deg) { const a = deg * Math.PI / 180; return { x: mx(pad + 24 + Math.cos(a) * ring), y: home.y + Math.sin(a) * ring, r: br }; };
    const g = {
      W: W, H: H, R: R, pad: pad, mirrored: mir,
      leg: { x: mx(W - R - 18), y: floor - R, r: R, limb: 'leg', col: '#ffb15a' },
      hand: { x: mx(W - R - 18), y: floor - 3 * R - gap, r: R, limb: 'hand', col: '#5ab0ff' },
      home: home, block: at(-30), turn: at(0), boost: at(30),
      menu: { x: W / 2 - 44, y: 16, r: 14 }, restart: { x: W / 2, y: 16, r: 14 }, size: { x: W / 2 + 44, y: 16, r: 14 }
    };
    /* the room the controls take at each side of the stage (a full-screen stage takes none: the controls are drawn over it) */
    const stick = mir ? W - Math.min(g.home.x - pad, g.boost.x - g.boost.r) + 12 : Math.max(g.home.x + pad, g.boost.x + g.boost.r) + 12, attack = 2 * R + 36;
    g.stageLeft = full ? 0 : (mir ? attack : stick); g.stageRight = full ? 0 : (mir ? stick : attack);
    return g;
  }
  const dist = function (a, b) { return Math.hypot(a.x - b.x, a.y - b.y); };
  /* what a touch at p means: a name, or null */
  function zoneAt(g, W, H, p, s) {
    const mir = s.hand === 'left';
    for (const b of ['menu', 'restart', 'size']) if (dist(p, g[b]) < g[b].r + 10) return b;
    for (const b of s.turnButton ? ['block', 'boost', 'turn'] : ['block', 'boost']) if (dist(p, g[b]) < g[b].r * 1.3) return b;
    for (const c of ['hand', 'leg']) if (dist(p, g[c]) < g[c].r * 1.25) return c;
    if ((mir ? p.x > W * 0.6 : p.x < W * 0.4) && p.y > H * 0.3) return 'stick';
    if (s.tapJab && (mir ? p.x <= W * 0.5 : p.x >= W * 0.5) && p.y > H * 0.3) return 'tap';
    return null;
  }
  const api = { compute: compute, zoneAt: zoneAt };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.SFL = api;
})(typeof window !== 'undefined' ? window : this);

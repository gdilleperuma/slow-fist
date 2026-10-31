/* Touch controller for phones: a move circle on the left with BLOCK above it, a hand circle over a leg circle on the right.
   It only turns fingers into the same inputs the keyboard gives (SF.touch.input is called once per simulation step), so the rules,
   the recordings and the AI are untouched. The gesture rules are in mobile/decode.js (SFC.classify) and the plan from a gesture to keys
   is in mobile/plan.js (SFP); both are tested on their own and together with the simulation (tests/controller.js, tests/touchplan.js). */
var SF = (typeof SF === 'undefined') ? {} : SF;
(function () {
  'use strict';
  if (typeof document === 'undefined') return;
  const T = SF.touch = { on: false, hooks: {}, full: false, live: null, lastLive: null };
  const q = /[?&]pxmm=([0-9.]+)/.exec(location.search);
  const PXMM = q ? +q[1] : 6;                 /* CSS pixels per millimetre; phones are about 6 (a browser cannot know the real size) */
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  try { T.full = localStorage.getItem('sf.fullstage') === '1'; } catch (e) { /* private mode */ }
  let cv = null, ctx = null, W = 0, H = 0;
  const fingers = {};                          /* pointerId -> { kind, ... } */
  const knob = { x: 0, y: 0, seg: null };
  const held = { block: false, boost: false, turn: false };
  let plan = null, dashP = null, shown = { hand: null, leg: null };
  const trails = [];
  const geom = {};

  /* the four segments are not the same size: forward and back are wide, up and down narrower. Degrees in the fighter's frame (0 forward, y down). */
  const SEG = { fwd: [-50, 50], down: [50, 130], back: [130, 230], up: [230, 310] };
  function segOf(ang) { const a = ((ang + 180) % 360 + 360) % 360 - 180; return Math.abs(a) <= 50 ? 'fwd' : Math.abs(a) >= 130 ? 'back' : a > 0 ? 'down' : 'up'; }
  const screenAng = (a, face) => face >= 0 ? a : 180 - a;

  /* the settings (mirror, size, opacity, floating stick, ...) come from main.js through T.applySettings */
  T.settings = SF.settingsClean ? SF.settingsClean({}) : { hand: 'right', size: 1, opacity: 0.9, floating: false, backBlock: false, tapJab: true, turnButton: true };
  let sh = null;                               /* where the move circle is now: its place, or under the first touch when it floats */
  function layout() {
    W = innerWidth; H = innerHeight;
    cv.width = W * (devicePixelRatio || 1); cv.height = H * (devicePixelRatio || 1);
    Object.assign(geom, window.SFL.compute(W, H, PXMM, T.settings, T.full));
    /* the stage: between the two control columns, or the whole screen (the controls are then drawn over it) */
    const left = geom.stageLeft, avail = W - geom.stageLeft - geom.stageRight, sw = Math.max(200, Math.min(avail, 2 * H));
    const c = document.getElementById('c');
    if (c) { c.style.width = sw + 'px'; c.style.height = sw / 2 + 'px'; c.style.margin = Math.max(0, (H - sw / 2) / 2) + 'px 0 0 ' + (left + (avail - sw) / 2) + 'px'; }
    if (!fingers.__stickDown) { sh = geom.home; knob.x = geom.home.x; knob.y = geom.home.y; }
  }
  T.applySettings = function (st) { T.settings = st; if (cv) layout(); };
  T.toggleFull = function () {
    T.full = !T.full; try { localStorage.setItem('sf.fullstage', T.full ? '1' : '0'); } catch (e) { /* private mode */ }
    if (cv) layout();
  };

  /* ---------- from fingers to simulation inputs ---------- */
  const atkDown = () => Object.keys(fingers).some(function (id) { return fingers[id] && fingers[id].kind === 'atk'; });
  T.input = function (m) {
    const f = m.f[0], inp = {};
    Object.assign(inp, window.SFP.stickInputs(knob.seg, f.face, T.settings));
    inp.block = held.block || inp.block; inp.boost = held.boost; inp.turn = held.turn && T.settings.turnButton;
    if (dashP) { inp.dash = true; inp.right = dashP.dir > 0; inp.left = dashP.dir < 0; if (--dashP.steps <= 0) dashP = null; }   /* a flick of the move circle: a dash */
    const s = window.SFP.step(plan, f, atkDown()); plan = s.plan;
    for (const k in s.inp) inp[k] = s.inp[k] || inp[k];
    return inp;
  };
  T.state = function () { return { stick: knob.seg, block: held.block, boost: held.boost, turn: held.turn, plan: plan ? plan.name : null, shown: shown }; };

  /* ---------- fingers ---------- */
  function begin(e) {
    e.preventDefault();
    try { cv.setPointerCapture(e.pointerId); } catch (x) { /* synthetic events */ }
    if (SF.audio) SF.audio.unlock();
    if (!document.fullscreenElement && document.documentElement.requestFullscreen && e.pointerType === 'touch') { try { document.documentElement.requestFullscreen().catch(function () {}); if (screen.orientation && screen.orientation.lock) screen.orientation.lock('landscape').catch(function () {}); } catch (x) { /* optional */ } }
    const p = { x: e.clientX, y: e.clientY, t: e.timeStamp };
    const z = window.SFL.zoneAt(geom, W, H, p, T.settings);
    if (z === 'menu' || z === 'restart' || z === 'size') { if (z === 'menu' && T.hooks.menu) T.hooks.menu(); else if (z === 'restart' && T.hooks.restart) T.hooks.restart(); else if (z === 'size') T.toggleFull(); return; }
    if (z === 'block' || z === 'boost' || z === 'turn') { fingers[e.pointerId] = { kind: 'btn', name: z }; held[z] = true; return; }
    if (z === 'hand' || z === 'leg' || z === 'tap') {
      /* a tap anywhere on the attack half is the hand circle: a tap is a jab and a line is a punch at its angle */
      fingers[e.pointerId] = { kind: 'atk', zone: z === 'leg' ? geom.leg : geom.hand, pts: [p], last: null, tap: z === 'tap' };
      plan = window.SFP.pending(z === 'leg' ? 'leg' : 'hand');                    /* the wind-up starts the moment the finger lands */
      return;
    }
    /* the move circle stays where it is (or, when it floats, appears under the first touch) */
    if (z === 'stick' && !fingers.__stickDown) {
      fingers[e.pointerId] = { kind: 'stick', t0: e.timeStamp, maxd: 0, mvx: 0, mvy: 0 }; fingers.__stickDown = e.pointerId;
      sh = T.settings.floating ? { x: Math.max(geom.home.r + 4, Math.min(W - geom.home.r - 4, p.x)), y: Math.max(geom.home.r + 4, Math.min(H - geom.home.r - 4, p.y)), r: geom.home.r } : geom.home;
      steer(p, fingers[e.pointerId]);
    }
  }
  function steer(p, s) {
    const R = sh.r, vx = p.x - sh.x, vy = p.y - sh.y, d = Math.hypot(vx, vy);
    if (s && d > s.maxd) { s.maxd = d; s.mvx = vx; s.mvy = vy; }
    const seg = d < 0.2 * R ? null : segOf(Math.atan2(vy, vx) * 180 / Math.PI);
    knob.seg = seg === 'fwd' ? 'right' : seg === 'back' ? 'left' : seg;
    const k = d > R ? R / d : 1; knob.x = sh.x + vx * k; knob.y = sh.y + vy * k;
  }
  function move(e) {
    const s = fingers[e.pointerId]; if (!s) return; e.preventDefault();
    const p = { x: e.clientX, y: e.clientY, t: e.timeStamp };
    if (s.kind === 'stick') steer(p, s); else if (s.kind === 'atk') { s.pts.push(p); decide(s, false); }
  }
  function end(e) {
    const s = fingers[e.pointerId]; if (!s) return; delete fingers[e.pointerId];
    if (s.kind === 'stick') {
      delete fingers.__stickDown; knob.seg = null; sh = geom.home; knob.x = geom.home.x; knob.y = geom.home.y;
      /* a quick flick sideways and let go is a dash (the keyboard's C) */
      if (e.timeStamp - s.t0 < 220 && s.maxd >= 0.6 * sh.r && Math.abs(s.mvx) > 1.5 * Math.abs(s.mvy)) dashP = { dir: s.mvx > 0 ? 1 : -1, steps: 4 };
    }
    else if (s.kind === 'btn') held[s.name] = false;
    else if (s.kind === 'atk') { decide(s, true); s.fade = e.timeStamp; trails.push(s); }
  }
  function decide(s, final) {
    const m = T.match && T.match(); if (!m) return;
    const mm = s.pts.map(function (p) { return { x: p.x / PXMM, y: p.y / PXMM, t: p.t }; });
    if (m.tutorial && s.zone.limb !== 'hand') return;      /* the tutorial is punches only */
    const r = window.SFC.classify(mm, s.zone.limb, m.f[0].face, final);
    if (!r) return;
    if (m.tutorial && r.type === 'GRAPPLE') return;
    T.live = { ang: r.ang, power: r.power, speed: r.speed, tier: r.tier, ref: window.SFC.K.SPEED_MMS, word: (r.speed >= window.SFC.K.QUICK && r.power < window.SFC.K.HEAVY_POWER) ? 'LIGHT' : (r.power >= window.SFC.K.HEAVY_POWER && r.speed < window.SFC.K.HEAVY_SPEED) ? 'HEAVY' : 'NORMAL', at: s.pts[s.pts.length - 1].t };
    if (final) T.lastLive = T.live;       /* the arrow keeps the last line's power and speed after the finger lifts */
    window.SFP.observe(plan, r);
    const key = r.type + '|' + r.move;
    if (s.last === key) return;
    const first = s.last === null; s.last = key;
    r.at = s.pts[s.pts.length - 1].t - s.pts[0].t;
    shown[s.zone.limb] = { move: r.move, type: r.type, tier: r.tier, at: s.pts[s.pts.length - 1].t, latency: Math.round(r.at), final: final };
    /* the first decision starts the move; a later one replaces the plan only while the strike has not been released yet */
    if (first || (plan && !plan.released)) { const waited = plan ? plan.steps : 0; plan = window.SFP.planFor(r, s.zone.limb, waited, !!m.tutorial); if (navigator.vibrate) navigator.vibrate(r.type === 'GRAPPLE' ? 30 : 10); }
  }
  T.enable = function () {
    if (T.on) return;
    document.body.classList.add('touch');
    cv = document.createElement('canvas'); cv.id = 'ctl'; cv.style.cssText = 'position:fixed;left:0;top:0;width:100%;height:100%;z-index:5;touch-action:none;background:transparent;border:0;border-radius:0';
    document.body.appendChild(cv); ctx = cv.getContext('2d');
    layout(); addEventListener('resize', layout);
    /* nothing may scroll, pan or pull to refresh under a thumb */
    document.documentElement.style.cssText += ';position:fixed;inset:0;overflow:hidden;overscroll-behavior:none;touch-action:none';
    document.body.style.cssText += ';position:fixed;inset:0;overflow:hidden;overscroll-behavior:none;touch-action:none';
    cv.addEventListener('pointerdown', begin); cv.addEventListener('pointermove', move);
    cv.addEventListener('pointerup', end); cv.addEventListener('pointercancel', end);
    cv.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    T.on = true; requestAnimationFrame(draw);
  };

  /* ---------- drawing ---------- */
  const ARC = Math.PI / 180;
  function ring(C, col, labels, lit, face) {
    for (const k in SEG) {
      const a0 = screenAng(SEG[k][0], face), a1 = screenAng(SEG[k][1], face), lo = Math.min(a0, a1), hi = Math.max(a0, a1);
      ctx.beginPath(); ctx.moveTo(C.x, C.y); ctx.arc(C.x, C.y, C.r, lo * ARC, hi * ARC); ctx.closePath(); ctx.fillStyle = lit && lit[k] ? col + '77' : col + '1c'; ctx.fill();
    }
    ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(C.x, C.y, C.r, 0, 7); ctx.stroke();
    ctx.lineWidth = 1;
    for (const b of [50, 130, 230, 310]) { const a = screenAng(b, face) * ARC; ctx.beginPath(); ctx.moveTo(C.x + Math.cos(a) * C.r * 0.2, C.y + Math.sin(a) * C.r * 0.2); ctx.lineTo(C.x + Math.cos(a) * C.r, C.y + Math.sin(a) * C.r); ctx.stroke(); }
    ctx.fillStyle = '#e8ecf4'; ctx.font = '600 ' + Math.round(C.r * 0.15) + 'px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const mid = { fwd: 0, down: 90, back: 180, up: 270 };
    for (const k in mid) { const a = screenAng(mid[k], face) * ARC, o = C.r * (k === 'fwd' || k === 'back' ? 0.62 : 0.6); ctx.fillText(labels[k], C.x + Math.cos(a) * o, C.y + Math.sin(a) * o); }
  }
  function button(b, text, on) {
    ctx.strokeStyle = on ? '#ffd24d' : '#8a90a0'; ctx.fillStyle = on ? '#ffd24d33' : '#00000044'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, 7); ctx.fill(); ctx.stroke();
    ctx.fillStyle = on ? '#ffd24d' : '#c7cde0'; ctx.font = '700 13px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, b.x, b.y + 1);
  }
  function draw(now) {
    if (T.live && !atkDown() && now - T.live.at > 900) T.live = null;      /* the readouts of the last line fade a moment after the finger lifts */
    const dpr = devicePixelRatio || 1; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
    const m = T.match && T.match(), face = m ? m.f[0].face : 1;
    const base = (T.full ? 0.6 : 1) * T.settings.opacity;      /* over the stage the controls are see-through */
    ctx.globalAlpha = base;
    /* move circle: fixed; the knob moves inside it */
    const lit = {}; if (knob.seg) lit[knob.seg === 'right' ? 'fwd' : knob.seg === 'left' ? 'back' : knob.seg] = true;
    const hot = sh || geom.home; if (T.settings.backBlock && m && knob.seg === (m.f[0].face >= 0 ? 'left' : 'right')) lit[knob.seg === 'right' ? 'fwd' : 'back'] = true;
    const downNow = !!(m && m.f[0].state === 'down' && !m.f[0].ko), fcs = m ? m.f[0].face : 1;
    ring(hot, '#7fe0ff', downNow ? { fwd: fcs > 0 ? 'ROLL FWD' : 'ROLL BACK', back: fcs > 0 ? 'ROLL BACK' : 'ROLL FWD', up: 'KIP-UP', down: 'GUARD' } : { fwd: '', back: '', up: 'JUMP', down: 'DUCK' }, lit, 1);
    ctx.fillStyle = '#7fe0ff'; ctx.beginPath(); ctx.arc(knob.x, knob.y, hot.r * 0.28, 0, 7); ctx.fill();
    /* dash: a ring around the move circle that empties while the dash recharges */
    if (m && m.f[0].dashCD > 0) { ctx.strokeStyle = '#ffffffaa'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(hot.x, hot.y, hot.r + 5, -Math.PI / 2, -Math.PI / 2 + 2 * Math.PI * (m.f[0].dashCD / SF.CFG.DASH_CD)); ctx.stroke(); }
    /* attack circles: segments and labels follow the way the fighter faces */
    const hl = { fwd: 'STRAIGHT', up: 'UPPERCUT', down: 'OVERHAND', back: 'GRAB' }, ll = { fwd: 'FRONT', up: 'RISING', down: 'LOW', back: 'TRIP' };
    const live = { hand: {}, leg: {} };
    for (const id in fingers) { const s = fingers[id]; if (s && s.kind === 'atk' && s.pts.length > 1) { const a = s.pts[0], b = s.pts[s.pts.length - 1]; if (dist(a, b) > 6) live[s.zone.limb][segOf(Math.atan2(b.y - a.y, (b.x - a.x) * face) * 180 / Math.PI)] = true; } }
    const tutOn = !!(m && m.tutorial);
    if (tutOn) { hl.fwd = 'DRAW A LINE'; hl.up = ''; hl.down = ''; hl.back = ''; }
    ring(geom.hand, geom.hand.col, hl, live.hand, face);
    ctx.globalAlpha = tutOn ? 0.12 : base;
    ring(geom.leg, geom.leg.col, ll, live.leg, face);
    ctx.globalAlpha = base;
    ctx.font = '700 8px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = geom.hand.col; ctx.fillText('HAND', geom.hand.x, geom.hand.y); ctx.fillStyle = geom.leg.col; ctx.fillText('LEG', geom.leg.x, geom.leg.y);
    /* block */
    ctx.globalAlpha = tutOn ? 0.12 : base;
    ctx.fillStyle = held.block ? '#7fe0ff99' : '#7fe0ff22'; ctx.strokeStyle = '#7fe0ff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(geom.block.x, geom.block.y, geom.block.r, 0, 7); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#e8ecf4'; ctx.font = '700 11px system-ui'; ctx.fillText('BLOCK', geom.block.x, geom.block.y);
    /* BOOST: lit while it lasts, a ring that empties while it cools down, dim when there is not enough stamina */
    const me = m ? m.f[0] : null, B = geom.boost, CF = SF.CFG;
    const cd = me ? me.boostCD / CF.BOOST_CD : 0, on = !!(me && me.boostT > 0), poor = !!(me && me.boostCD <= 0 && me.sta < CF.BOOST_COST);
    ctx.fillStyle = on ? '#ffb15acc' : held.boost ? '#ffb15a66' : '#ffb15a22'; ctx.strokeStyle = poor ? '#7a6a58' : '#ffb15a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(B.x, B.y, B.r, 0, 7); ctx.fill(); ctx.stroke();
    if (cd > 0 && !on) { ctx.strokeStyle = '#ffffff99'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(B.x, B.y, B.r - 4, -Math.PI / 2, -Math.PI / 2 + 2 * Math.PI * cd); ctx.stroke(); }
    ctx.fillStyle = poor ? '#8a8070' : '#fff'; ctx.font = '700 11px system-ui'; ctx.fillText('BOOST', B.x, B.y);
    /* TURN (it can be hidden in the settings) */
    if (T.settings.turnButton) {
    const U = geom.turn; ctx.fillStyle = held.turn ? '#c7cde088' : '#c7cde022'; ctx.strokeStyle = '#c7cde0'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(U.x, U.y, U.r, 0, 7); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#e8ecf4'; ctx.font = '700 11px system-ui'; ctx.fillText('TURN', U.x, U.y);
    }
    ctx.globalAlpha = 0.9; button(geom.menu, '☰', false); button(geom.restart, 'R', false); button(geom.size, '⛶', T.full);
    /* trails and the decoded move */
    for (let i = trails.length - 1; i >= 0; i--) { const t = trails[i], age = (now - t.fade) / 700; if (age >= 1) { trails.splice(i, 1); continue; } path(t.pts, t.zone.col, 1 - age); }
    for (const id in fingers) { const s = fingers[id]; if (s && s.kind === 'atk') path(s.pts, s.zone.col, 1); }
    for (const k of ['hand', 'leg']) {
      const s = shown[k], C = geom[k]; if (!s) continue; const age = (now - s.at) / 1400; if (age >= 1) { shown[k] = null; continue; }
      ctx.globalAlpha = 1 - age; ctx.fillStyle = '#fff'; ctx.font = '700 14px system-ui'; const lx = geom.mirrored ? C.x + C.r + 10 : C.x - C.r - 10; ctx.textAlign = geom.mirrored ? 'left' : 'right'; ctx.fillText(s.move, lx, C.y - 4); ctx.font = '10px system-ui'; ctx.fillStyle = '#9aa1b3'; ctx.fillText(s.tier + ' - ' + s.latency + ' ms', lx, C.y + 11);
    }
    ctx.globalAlpha = 1; ctx.textAlign = 'center';
    requestAnimationFrame(draw);
  }
  function path(pts, col, a) {
    if (pts.length < 2) return; ctx.save(); ctx.globalAlpha = a; ctx.strokeStyle = col; ctx.lineWidth = 5; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y); for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y); ctx.stroke(); ctx.restore();
  }
})();

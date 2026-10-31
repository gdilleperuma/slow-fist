/* Drawing only. Reads the match, never changes it. */
var SF = (typeof SF === 'undefined') ? {} : SF;
(function () {
  'use strict';
  const C = SF.CFG, clamp = SF.clamp;
  const palette = function () { return SF.palette((SF.uiSettings || {}).palette); };
  let COLORS = ['#5ab0ff', '#ff8a5a'];   /* per fighter, set from the teams of the match being drawn */
  function setColors(m) { const TC = palette().team, seen = [0, 0]; COLORS = m.f.map(function (q) { const t = q.team === 1 ? 1 : 0, k = seen[t]++; return TC[t][k % TC[t].length]; }); }
  const fx = [];
  let shake = 0;
  const flash = [0, 0, 0, 0];   /* shield glow after a block, per defender */

  function addText(text, x, y, color, size) { fx.push({ k: 'text', text: text, x: x, y: y, color: color, size: size || 16, t: 0, life: 1.1 }); }
  function addSpark(x, y, color, n) {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + i, sp = 60 + (i * 37) % 90;
      fx.push({ k: 'spark', x: x, y: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, color: color, t: 0, life: 0.3 });
    }
  }
  /* turn this step's simulation events into visual effects */
  SF.fxEvents = function (m) {
    setColors(m);
    for (const e of m.ev) {
      if (e.k === 'hit') {
        const d = m.f[e.d], y = C.GY - d.h - (e.zone === 'HEAD' ? 140 : e.zone === 'BODY' ? 100 : 40);
        const col = e.tag === 'PARRY' ? '#ffd24d' : e.tag === 'BLOCK' ? '#7fe0ff' : e.tag === 'PARTIAL' ? '#ffffff' : '#ff6a4d';
        if (e.tag !== 'HIT') flash[e.d] = e.tag === 'PARRY' ? 1.4 : 1;
        addSpark(d.x, y, col, e.tag === 'HIT' ? 10 : 6);
        addText(e.tag === 'HIT' ? Math.round(e.dmg) + ' ' + e.zone : e.tag, d.x, y - 24, col, e.tag === 'HIT' ? 15 : 17);
        if (e.combo > 1) addText('COMBO x' + e.combo, d.x, y - 44, COLORS[e.a], 16);
        shake = Math.max(shake, e.tag === 'HIT' ? Math.min(8, e.dmg * 0.4) : 2);
      } else if (e.k === 'knockdown') { addText('KNOCKDOWN', m.f[e.d].x, C.GY - 170, COLORS[e.a], 22); shake = Math.max(shake, 9); }
      else if (e.k === 'throw') { addText('FLIP', m.f[e.d].x, C.GY - 170, COLORS[e.a], 22); shake = Math.max(shake, 11); }
      else if (e.k === 'grapple') addText('GRAPPLE', m.f[e.a].x, C.GY - 190, COLORS[e.a], 16);
      else if (e.k === 'guardBreak') addText('GUARD BREAK', m.f[e.d].x, C.GY - 190, '#ff5a5a', 18);
      else if (e.k === 'dodge') addText('DODGE', m.f[e.d].x, C.GY - 180, '#bfe8ff', 17);
      else if (e.k === 'chain' && e.names.length >= 2) addText(SF.chainLabel(e.names), m.f[e.a].x, C.GY - 205, COLORS[e.a], 17);
      else if (e.k === 'protected') addText('PROTECTED', m.f[e.d].x, C.GY - 190, '#9fe3a8', 15);
      else if (e.k === 'ko' && e.over === false) { addText('K.O.', m.f[e.d].x, C.GY - 170, '#ffffff', 26); shake = Math.max(shake, 8); }
      else if (e.k === 'ko') { addText('K.O.', C.W / 2, 140, '#ffffff', 54); shake = 14; }
      else if (e.k === 'boost') addText('BOOST', m.f[e.a].x, C.GY - 200, '#ffb15a', 18);
      else if (e.k === 'turn') addText('TURN', m.f[e.a].x, C.GY - 200, '#c7cde0', 14);
    }
  };
  SF.fxStep = function (dt) {
    shake = Math.max(0, shake - 30 * dt);
    for (let i = 0; i < 4; i++) flash[i] = Math.max(0, flash[i] - 4 * dt);
    for (let i = fx.length - 1; i >= 0; i--) {
      const e = fx[i]; e.t += dt;
      if (e.k === 'spark') { e.x += e.vx * dt; e.y += e.vy * dt; }
      else e.y -= 22 * dt;
      if (e.t >= e.life) fx.splice(i, 1);
    }
  };
  SF.shieldFlash = function (i) { return flash[i]; };
  SF.fxClear = function () { fx.length = 0; shake = 0; flash[0] = 0; flash[1] = 0; };

  function line(ctx, a, b) { ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); }
  function drawFighter(ctx, f, color, isWinner, k) {
    let sc = SF.spinScale(f);
    if (sc !== 1) {
      /* spinning kick: a full turn, drawn as a horizontal squeeze through zero and back */
      if (Math.abs(sc) < 0.06) sc = sc < 0 ? -0.06 : 0.06;
      ctx.save(); ctx.translate(f.x, 0); ctx.scale(sc, 1); ctx.translate(-f.x, 0);
    }
    const body = f.flash > 0 ? '#ffffff' : color, back = f.flash > 0 ? '#dddddd' : shade(color);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.lineWidth = 5;
    ctx.strokeStyle = back;
    line(ctx, k.shoulderB, k.elbow[1]); line(ctx, k.elbow[1], k.hand[1]);
    line(ctx, k.hip, k.knee[1]); line(ctx, k.knee[1], k.foot[1]);
    ctx.strokeStyle = body;
    line(ctx, k.hip, k.chest); line(ctx, k.chest, k.neck);
    ctx.lineWidth = 4; line(ctx, k.shoulderB, k.shoulder); ctx.lineWidth = 5;
    line(ctx, k.hip, k.knee[0]); line(ctx, k.knee[0], k.foot[0]);
    line(ctx, k.shoulder, k.elbow[0]); line(ctx, k.elbow[0], k.hand[0]);
    ctx.fillStyle = body;
    ctx.beginPath(); ctx.arc(k.shoulder[0], k.shoulder[1], 3.2, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(k.head[0], k.head[1], C.LIMB.head, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#10131a';
    ctx.beginPath(); ctx.arc(k.head[0] + f.face * 4, k.head[1] - 2, 1.8, 0, Math.PI * 2); ctx.fill();
    if (f.state === 'strike' && f.str) {
      ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 2; ctx.setLineDash([4, 4]);
      const tip = f.str.limb === 'kick' ? k.foot[0] : k.hand[0];
      line(ctx, [tip[0] - f.face * 30, tip[1] + 6], tip);
      ctx.setLineDash([]);
    }
    if (sc !== 1) ctx.restore();
    if (isWinner) { ctx.fillStyle = '#ffd24d'; ctx.font = 'bold 14px system-ui'; ctx.textAlign = 'center'; ctx.fillText('WINNER', k.head[0], k.head[1] - 22); }
    return k;
  }
  function shade(hex) {
    const n = parseInt(hex.slice(1), 16), r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    return 'rgb(' + Math.round(r * 0.62) + ',' + Math.round(g * 0.62) + ',' + Math.round(b * 0.62) + ')';
  }
  function bar(ctx, x, y, w, h, frac, color, right) {
    ctx.fillStyle = '#1b1f29'; ctx.fillRect(x, y, w, h);
    ctx.fillStyle = color; const fw = w * clamp(frac, 0, 1); ctx.fillRect(right ? x + w - fw : x, y, fw, h);
    ctx.strokeStyle = '#3a4050'; ctx.lineWidth = 1; ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  }
  /* balance: the marker shows where the weight sits (toward the opponent = committed, away = on the back foot) */
  function balanceGauge(ctx, x, y, w, f) {
    ctx.fillStyle = '#1b1f29'; ctx.fillRect(x, y, w, 5);
    ctx.fillStyle = '#3a4050'; ctx.fillRect(x + w / 2 - 0.5, y - 1, 1, 7);
    const toward = f.bal * f.face, px = x + w / 2 + clamp(toward, -1, 1) * (w / 2 - 3) * (f.face > 0 ? 1 : -1);
    ctx.fillStyle = f.off ? '#ff5a5a' : '#c7cde0'; ctx.fillRect(px - 2, y - 1, 4, 7);
  }
  function hud(ctx, m, opts) {
    ctx.textBaseline = 'alphabetic';
    const slot = [0, 0];
    for (let i = 0; i < m.f.length; i++) {
      if (opts.tutorial && i === 1) continue;
      const f = m.f[i], right = f.team === 1, k = slot[right ? 1 : 0]++;
      /* two fighters: the full bars at the top corners; more: a compact block per fighter, stacked down each side */
      const big = m.f.length === 2, w = big ? 300 : 210, x = right ? C.W - 20 - w : 20, y0 = big ? 0 : k * 50, hs = (SF.uiSettings || {}).hudScale || 1, pal = palette();
      let tagY = 78;
      if (big) {
        /* the bars, each with its colour and its name underneath (the HUD size setting scales their height) */
        const hh = 14 * hs, sh = 6 * hs, gh = 4 * hs, y1 = 18, y2 = y1 + hh + 4, y3 = y2 + sh + 4, y4 = y3 + gh + 4;
        bar(ctx, x, y1, w, hh, f.hp / f.hpMax, pal.hp || COLORS[i], right);
        bar(ctx, x, y2, w, sh, f.sta / 100, f.exh ? '#ff5a5a' : pal.sta, right);
        bar(ctx, x, y3, w, gh, f.gHP / f.style.gmax, pal.guard, right);
        balanceGauge(ctx, x, y4, w, f);
        const words = [['HEALTH', pal.hp || COLORS[i]], ['STAMINA', pal.sta], ['GUARD', pal.guard], ['BALANCE', '#c7cde0']];
        ctx.font = '8px system-ui'; ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
        let wx = right ? x + w - words.reduce(function (t, q) { return t + ctx.measureText(q[0]).width + 8; }, 0) + 8 : x;
        for (const q of words) { ctx.fillStyle = q[1]; ctx.fillText(q[0], wx, y4 + 17); wx += ctx.measureText(q[0]).width + 8; }
        tagY = y4 + 31;
      } else {
        bar(ctx, x, 18 + y0, w, 9, f.hp / f.hpMax, pal.hp || COLORS[i], right);
        bar(ctx, x, 29 + y0, w, 4, f.sta / 100, f.exh ? '#ff5a5a' : pal.sta, right);
        bar(ctx, x, 35 + y0, w, 3, f.gHP / f.style.gmax, pal.guard, right);
      }
      ctx.fillStyle = f.ko ? '#6d7383' : '#e8ecf4'; ctx.font = (big ? 'bold 13px' : 'bold 11px') + ' system-ui'; ctx.textAlign = right ? 'right' : 'left';
      const tag = (opts.modes[i] === 'dummy' ? 'DUMMY' : opts.modes[i] === 'ai' ? 'AI' + (m.levels && m.levels[i] !== 1 ? ' ' + ['Easy', '', 'Hard'][m.levels[i]] : '') : 'P' + (i + 1)) + ' ' + f.style.name + (f.exh ? '  EXHAUSTED' : '') + (f.off ? '  OFF BALANCE' : '') + (f.protect > 0 && f.state !== 'flipped' ? '  PROTECTED' : '');
      ctx.fillText(tag + (f.boostT > 0 ? '  BOOST' : '') + (f.ko ? '  K.O.' : ''), right ? x + w : x, big ? tagY : 49 + y0);
    }
    ctx.fillStyle = '#6d7383'; ctx.font = '11px system-ui'; ctx.textAlign = 'center';
    ctx.fillText('speed x' + opts.speed.toFixed(1) + '   seed ' + m.seed + '   T mode   R reset   1/2 style   [ ] speed   3 3D   V record   B replay   F1 help   F2 sound ' + (opts.sound ? 'on' : 'off'), C.W / 2, 438);
    status(ctx, opts);
  }
  /* recording and replay indicators, and a short message line */
  function status(ctx, opts) {
    ctx.textAlign = 'center';
    if (opts.rec) {
      const s = opts.rec.steps / 60;
      ctx.fillStyle = '#ff4d4d'; ctx.beginPath(); ctx.arc(C.W / 2 - 38, 26, 5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ffd0d0'; ctx.font = 'bold 13px system-ui'; ctx.textAlign = 'left';
      ctx.fillText('REC ' + Math.floor(s / 60) + ':' + ('0' + Math.floor(s % 60)).slice(-2), C.W / 2 - 28, 31);
    }
    if (opts.replay) {
      const r = opts.replay;
      ctx.fillStyle = '#7fb0ff'; ctx.font = 'bold 13px system-ui'; ctx.textAlign = 'center';
      ctx.fillText((r.done ? 'REPLAY FINISHED (B to leave)' : 'REPLAY x' + r.speed.toFixed(1)) + '   ' + (r.pos / 60).toFixed(1) + ' / ' + (r.len / 60).toFixed(1) + ' s', C.W / 2, 31);
      ctx.fillStyle = '#1b1f29'; ctx.fillRect(C.W / 2 - 100, 38, 200, 4);
      ctx.fillStyle = '#7fb0ff'; ctx.fillRect(C.W / 2 - 100, 38, 200 * (r.len ? r.pos / r.len : 1), 4);
    }
    if (opts.note) {
      ctx.fillStyle = opts.note.bad ? '#ff8a8a' : '#ffd24d'; ctx.font = '12px system-ui'; ctx.textAlign = 'center';
      ctx.fillText(opts.note.text, C.W / 2, 424);
    }
  }
  /* while you are down: the four ways up around the fighter (relative to the facing), with their stamina cost; a ring while a break-fall tap would work (RCV-12) */
  function drawRecoveryWheel(ctx, m) {
    const f = m.f[0], R = C.RECOV; if (f.ko || m.winner !== null) return;
    const holder = f.state === 'flipped' ? m.f.find(function (h) { return h.state === 'grapple' && h.grap === f.idx; }) : null;
    const tapNow = (f.state === 'down' && !f.techDone && f.t <= C.TECH_AFTER) || (holder && (C.GRAB_LOCK + C.GRAB_FLIP - holder.t) <= C.TECH_WINDOW);
    ctx.save(); ctx.textAlign = 'center'; ctx.font = 'bold 10px system-ui';
    if (tapNow) { const px = f.x, py = C.GY - 120, pulse = 0.6 + 0.4 * Math.sin(m.steps * 0.5); ctx.globalAlpha = pulse; ctx.strokeStyle = '#ffd24d'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(px, py, 22, 0, 7); ctx.stroke(); ctx.globalAlpha = 1; ctx.fillStyle = '#ffd24d'; ctx.fillText('TAP!', px, py + 4); }
    if (f.state === 'down' && f.t < f.stagDur - 0.05) {
      const ready = f.t >= C.RECOV_MIN, cx = f.x, cy = C.GY - 96, face = f.face >= 0 ? 1 : -1, items = [
        ['KIP-UP ' + R.kip.cost, 0, -26, R.kip.cost], ['ROLL FWD ' + R.fwd.cost, face * 52, 0, R.fwd.cost], ['ROLL BACK ' + R.back.cost, -face * 52, 0, R.back.cost], ['GUARD', 0, 28, 0]];
      ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.beginPath(); ctx.arc(cx, cy, 14, 0, 7); ctx.fill();
      for (const it of items) { const ok = ready && f.sta >= it[3]; ctx.globalAlpha = ok ? 1 : 0.4; ctx.fillStyle = ok ? '#e8ecf4' : '#9aa1b3'; ctx.fillText(it[0], cx + it[1], cy + it[2] + 3); }
      ctx.globalAlpha = 1; ctx.fillStyle = '#ffd24d'; ctx.fillRect(cx - 14, cy + 38, 28 * Math.min(1, f.t / C.RECOV_MIN), 3);
    }
    ctx.restore();
  }
  /* the tutorial: a dashed line at the angle to punch, a circle to hit, the aim now in white, and three readouts: angle, power and speed */
  function drawTutorial(ctx, m, tu) {
    const f = m.f[0], ox = f.x, oy = C.GY - C.SHOULDER_H, g = tu.target, TWO = Math.PI * 2;
    ctx.save(); ctx.lineCap = 'round';
    let col = '#ffd24d';
    if (g && tu.on) {
      col = g.need === 'heavy' ? '#ff8a3a' : g.need === 'light' ? '#6fe08a' : '#ffd24d';        /* never the blue of the fighter */
      const a = g.ang * Math.PI / 180, ex = ox + Math.cos(a) * 330, ey = oy - Math.sin(a) * 330, cx = ox + Math.cos(a) * g.d, cy = oy - Math.sin(a) * g.d;
      ctx.setLineDash([12, 8]); ctx.strokeStyle = '#000000'; ctx.lineWidth = 6; ctx.globalAlpha = 0.5; ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(ex, ey); ctx.stroke();
      ctx.strokeStyle = col; ctx.lineWidth = 3; ctx.globalAlpha = 1; ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(ex, ey); ctx.stroke(); ctx.setLineDash([]);
      const res = tu.result, fill = res === true ? 'rgba(80,220,120,0.55)' : res === false ? 'rgba(255,90,90,0.5)' : col === '#ffd24d' ? 'rgba(255,210,77,0.25)' : col === '#ff8a3a' ? 'rgba(255,138,58,0.28)' : 'rgba(111,224,138,0.28)';
      ctx.fillStyle = fill; ctx.beginPath(); ctx.arc(cx, cy, g.r, 0, TWO); ctx.fill(); ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(cx, cy, g.r, 0, TWO); ctx.stroke();
      if (g.limit && tu.spawn !== null) { const left = Math.max(0, 1 - (tu.steps - tu.spawn) / g.limit); ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(cx, cy, g.r + 5, -Math.PI / 2, -Math.PI / 2 + TWO * left); ctx.stroke(); }
      ctx.fillStyle = col; ctx.font = 'bold 13px system-ui'; ctx.textAlign = 'center'; ctx.fillText((g.ang > 0 ? '+' : '') + g.ang + '\u00B0' + (g.need ? ' ' + g.need.toUpperCase() : ''), cx, cy - g.r - 9);
    }
    /* where the aim is now: white with a dark edge and an arrow head, so it never blends with the fighter */
    /* one arrow shows all three: its DIRECTION is the angle, its LENGTH the power, its WIDTH the speed of your line */
    const lvA = tu.live, lastA = tu.lastLive, charging0 = f.state === 'charge';
    const pw = lvA ? lvA.power : charging0 ? Math.min(1, f.charge / C.CHARGE_MAX) : tu.last ? (tu.last.s - 0.7) / 0.9 : 0.2;
    const sp = lvA ? lvA.speed : lastA ? lastA.speed : 0.3;
    const b = f.aim * Math.PI / 180, L = 36 + 120 * Math.max(0, Math.min(1, pw)), wd = 3 + 11 * Math.max(0, Math.min(1, sp)), tx = ox + Math.cos(b) * L, ty = oy - Math.sin(b) * L, hd = 10 + wd * 1.1;
    const shaft = function (width, color) {
      ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = width; ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(tx - Math.cos(b) * hd * 0.6, ty + Math.sin(b) * hd * 0.6); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(tx + Math.cos(b) * 3, ty - Math.sin(b) * 3); ctx.lineTo(tx - Math.cos(b) * hd + Math.sin(b) * hd * 0.55, ty + Math.sin(b) * hd + Math.cos(b) * hd * 0.55); ctx.lineTo(tx - Math.cos(b) * hd - Math.sin(b) * hd * 0.55, ty + Math.sin(b) * hd - Math.cos(b) * hd * 0.55); ctx.closePath(); ctx.fill();
    };
    shaft(wd + 4, 'rgba(0,0,0,0.6)'); shaft(wd, '#ffffff');
    /* the last punch stays on show for a second as a faint arrow, so it can be compared with the dashed line */
    if (tu.last && tu.resultAt && tu.steps - tu.resultAt.at < 60 && f.state !== 'charge') {
      const lb = tu.last.ang * Math.PI / 180, lL = 36 + 120 * Math.max(0, Math.min(1, (tu.last.s - 0.7) / 0.9)), lx = ox + Math.cos(lb) * lL, ly = oy - Math.sin(lb) * lL;
      ctx.save(); ctx.globalAlpha = 0.55 * (1 - (tu.steps - tu.resultAt.at) / 60); ctx.strokeStyle = tu.resultAt.ok ? '#6fe08a' : '#ff7a7a'; ctx.lineWidth = wd; ctx.setLineDash([3, 5]);
      ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(lx, ly); ctx.stroke(); ctx.restore();
    }
    ctx.fillStyle = '#ffffff'; ctx.font = 'bold 12px system-ui'; ctx.textAlign = 'center'; ctx.fillText('you ' + (f.aim > 0 ? '+' : '') + Math.round(f.aim) + '\u00B0', tx + Math.cos(b) * 26, ty - Math.sin(b) * 14 - 2);
    /* the three readouts, on the left of the stage */
    const x0 = 14, y0 = 96, W3 = 118;
    ctx.fillStyle = 'rgba(255,255,255,0.75)'; ctx.font = '9px system-ui'; ctx.textAlign = 'left'; ctx.fillText('ARROW: direction = angle, length = power, width = speed', x0, y0 + 126);
    const bar = function (y, frac, color, label, value) {
      ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillRect(x0 - 6, y - 12, W3 + 14, 33);
      ctx.fillStyle = '#c4cada'; ctx.font = 'bold 10px system-ui'; ctx.textAlign = 'left'; ctx.fillText(label, x0, y);
      ctx.fillStyle = color; ctx.font = 'bold 10px system-ui'; ctx.textAlign = 'right'; ctx.fillText(value, x0 + W3, y);
      ctx.fillStyle = '#1b1f29'; ctx.fillRect(x0, y + 5, W3, 8); ctx.fillStyle = color; ctx.fillRect(x0, y + 5, W3 * Math.max(0, Math.min(1, frac)), 8);
    };
    const sgn = function (v) { return (v > 0 ? '+' : '') + Math.round(v) + '\u00B0'; };
    /* ANGLE: the target, where you aim, and how far apart */
    ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillRect(x0 - 6, y0 - 14, W3 + 14, 33);
    ctx.fillStyle = '#c4cada'; ctx.font = 'bold 10px system-ui'; ctx.textAlign = 'left'; ctx.fillText('ANGLE', x0, y0 - 2);
    const diff = g ? f.aim - g.ang : 0;
    ctx.font = 'bold 13px system-ui'; ctx.fillStyle = g ? (Math.abs(diff) <= g.tol ? '#6fe08a' : '#ffb15a') : '#ffffff'; ctx.fillText(g ? 'target ' + sgn(g.ang) + '   you ' + sgn(f.aim) : 'you ' + sgn(f.aim), x0, y0 + 14);
    /* POWER: how long you draw the line (or hold the key); STRENGTH of the punch that results */
    const lv = tu.live, charging = f.state === 'charge', sNow = charging ? 0.7 + 0.9 * Math.min(1, f.charge / C.CHARGE_MAX) : null;
    const word = function (s) { return s >= 1.3 ? 'HEAVY' : s <= 0.9 ? 'LIGHT' : 'NORMAL'; };
    if (lv) bar(y0 + 48, lv.power, '#ff8a3a', 'POWER  (length)', lv.word);
    else if (sNow !== null) bar(y0 + 48, (sNow - 0.7) / 0.9, '#ff8a3a', 'POWER  (charge)', word(sNow));
    else if (tu.last) bar(y0 + 48, (tu.last.s - 0.7) / 0.9, '#ff8a3a', 'LAST PUNCH  (strength)', word(tu.last.s) + ' ' + tu.last.s.toFixed(2));
    else bar(y0 + 48, 0, '#ff8a3a', 'POWER  (length / charge)', '-');
    /* SPEED: how fast you draw the line */
    if (lv) bar(y0 + 86, lv.speed, '#6fc8ff', 'SPEED  (finger)', Math.round(lv.speed * lv.ref) + ' mm/s');
    else bar(y0 + 86, 0, '#6fc8ff', 'SPEED  (finger)', '-');
    ctx.restore();
  }
  SF.draw = function (ctx, m, opts) {
    setColors(m);
    ctx.save();
    const v3 = opts.view3d || null;                                 /* in the 3D view only the HUD and the texts are drawn here */
    if (v3) ctx.clearRect(0, 0, C.W, 450); else { ctx.fillStyle = '#0f1218'; ctx.fillRect(0, 0, C.W, 450); }
    const sx = Math.sin(m.steps * 2.3) * shake * 0.5, sy = Math.cos(m.steps * 1.7) * shake * 0.5;
    if (!v3) ctx.translate(sx, sy);
    if (!v3) {
    ctx.fillStyle = '#171a21'; ctx.fillRect(0, C.GY, C.W, 450 - C.GY);
    ctx.strokeStyle = '#3a3f4c'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, C.GY); ctx.lineTo(C.W, C.GY); ctx.stroke();
    for (const b of m.obstacles) {      /* boxes: a crate with a cross */
      ctx.fillStyle = '#4b3f33'; ctx.fillRect(b.x - b.w / 2, C.GY - b.h, b.w, b.h);
      ctx.strokeStyle = '#8a7358'; ctx.lineWidth = 2; ctx.strokeRect(b.x - b.w / 2 + 1, C.GY - b.h + 1, b.w - 2, b.h - 2);
      ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(b.x - b.w / 2, C.GY - b.h); ctx.lineTo(b.x + b.w / 2, C.GY); ctx.moveTo(b.x + b.w / 2, C.GY - b.h); ctx.lineTo(b.x - b.w / 2, C.GY); ctx.stroke();
    }
    for (let i = 0; i < m.f.length; i++) {
      if (opts.tutorial && i === 1) continue;     /* the tutorial has no opponent to see, only targets */
      const f = m.f[i], gl = SF.groundLevel(m, f);
      ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(f.x, C.GY - gl + 3, 26 - Math.min(14, (f.h - gl) * 0.2), 4, 0, 0, Math.PI * 2); ctx.fill();
    }
    for (let i = 0; i < m.f.length; i++) {
      if (opts.tutorial && i === 1) continue;
      const f = m.f[i];
      /* the displayed pose comes from the animator (joint-limited and smoothed); the pure pose is the fallback */
      const sk = opts.anim ? opts.anim.skeleton(m, i) : SF.skeleton(f, m.t);
      if (f.boostT > 0) { ctx.save(); ctx.globalAlpha = 0.25 + 0.15 * Math.sin(m.steps * 0.3); ctx.fillStyle = '#ffb15a'; ctx.beginPath(); ctx.arc(sk.chest[0], sk.chest[1], 46, 0, 7); ctx.fill(); ctx.restore(); }   /* boost aura */
      drawFighter(ctx, f, COLORS[i], !!f.win, sk);
      if (f.state === 'guard' || flash[i] > 0) {
        /* shield: an arc in front of the guard at the aimed height; thinner as guard health drops, bright for a moment after a block */
        const sc = sk.chest, ar = f.aim * Math.PI / 180;
        const hp = clamp(f.gHP / f.style.gmax, 0, 1), a0 = f.face > 0 ? -ar : Math.PI + ar;
        ctx.save(); ctx.lineCap = 'round';
        ctx.globalAlpha = (f.state === 'guard' ? 0.35 + 0.35 * hp : 0) + 0.5 * Math.min(1, flash[i]);
        ctx.strokeStyle = flash[i] > 1 ? '#ffd24d' : '#7fe0ff'; ctx.lineWidth = 3 + 4 * hp + 3 * Math.min(1, flash[i]);
        ctx.beginPath(); ctx.arc(sc[0], sc[1], 40, a0 - 0.75, a0 + 0.75); ctx.stroke();
        ctx.restore();
      }
      if ((f.state === 'charge' || f.state === 'guard') && m.winner === null) {
        const sh = sk.chest, r = f.aim * Math.PI / 180, len = f.state === 'guard' ? 50 : 70;
        ctx.strokeStyle = f.state === 'guard' ? 'rgba(127,224,255,0.7)' : 'rgba(255,255,255,0.35)'; ctx.lineWidth = 1.5; ctx.setLineDash([3, 5]);
        ctx.beginPath(); ctx.moveTo(sh[0], sh[1]); ctx.lineTo(sh[0] + f.face * Math.cos(r) * len, sh[1] - Math.sin(r) * len); ctx.stroke(); ctx.setLineDash([]);
        if (f.state === 'charge') { ctx.fillStyle = COLORS[i]; ctx.fillRect(f.x - 20, C.GY + 10, 40 * (f.charge / C.CHARGE_MAX), 4); }
      }
    }
    }
    if (!v3 && opts.modes && opts.modes[0] === 'human' && !opts.tutorial) drawRecoveryWheel(ctx, m);
    if (opts.tutorial && !v3) drawTutorial(ctx, m, opts.tutorial);
    for (const e of fx) {
      const u = e.t / e.life;
      const pp = v3 ? v3.project(e.x, e.y) : [e.x, e.y];
      ctx.globalAlpha = 1 - u;
      if (e.k === 'spark') { ctx.fillStyle = e.color; ctx.fillRect(pp[0], pp[1], 3, 3); }
      else { ctx.fillStyle = e.color; ctx.font = 'bold ' + e.size + 'px system-ui'; ctx.textAlign = 'center'; ctx.fillText(e.text, pp[0], pp[1]); }
      ctx.globalAlpha = 1;
    }
    ctx.restore();
    hud(ctx, m, opts);
    if (opts.help) helpOverlay(ctx);
  };
  function helpOverlay(ctx) {
    ctx.fillStyle = 'rgba(10,12,18,0.93)'; ctx.fillRect(40, 62, C.W - 80, 350);
    ctx.strokeStyle = '#3a4050'; ctx.strokeRect(40.5, 62.5, C.W - 81, 349);
    ctx.textAlign = 'left'; ctx.fillStyle = '#ffd24d'; ctx.font = 'bold 15px system-ui'; ctx.fillText('SLOW FIST v2   (F1 closes this)', 60, 98);
    const rows = [
      ['P1 (blue)', 'A D move   W jump   S crouch   Q E aim up/down   F punch   G kick   H block   Z grapple   C dash'],
      ['P2 (orange)', 'Left Right move   Up jump   Down crouch   Num8 Num2 aim   Num4 punch   Num6 kick   Num5 block   Num1 grapple   Num3 dash'],
      ['', '(I O aim, K punch, L kick, J block, M grapple, N dash also work for P2)'],
      ['Keys', 'T mode: human / AI / AI vs AI     1 2 style (Boxer, Kicker, Grappler)     R reset     [ ] slower / faster     F1 help     F2 sound'],
      ['Recording', 'V starts a new round and records it (V again stops).  B replays at normal speed ([ ] change it, B leaves).  Buttons: save, load, export video.'],
      ['Strike', 'Hold punch or kick to wind up, release to throw. Tap the same key mid-strike to speed it up (up to x3, costs stamina).'],
      ['Aim', 'Aim angle sets where the strike lands: high = head, level = body, low = legs. Crouch + punch = uppercut, crouch + kick = sweep.'],
      ['Guard', 'Hold block and aim at the incoming strike. Raise it just before impact for a PARRY and a counter window.'],
      ['Grapple', 'Close in and grab: it beats a guard, but a crouching or retreating opponent slips out. Dash through a strike to dodge it.'],
      ['Move names', 'tap = jab / front kick;  short hold = cross;  hold = hook / roundhouse;  long hold = heavy / spinning kick (Kicker)'],
      ['Meters', 'Red/orange/blue bar: health.  Yellow: stamina.  Light blue: guard.  At zero stamina you are exhausted until it refills to 30.']
    ];
    ctx.font = '12px system-ui'; let y = 124;
    for (const r of rows) {
      ctx.fillStyle = '#7fb0ff'; ctx.fillText(r[0], 60, y); ctx.fillStyle = '#dfe4ee'; ctx.fillText(r[1], 150, y); y += 26;
    }
  }
})();

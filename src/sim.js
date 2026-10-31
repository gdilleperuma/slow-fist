// Slow Fist v2 simulation. Pure rules: no DOM, no canvas, no Math.random. Time advances only through SF.step.
var SF = (typeof SF === 'undefined') ? {} : SF;
(function () {
  'use strict';
  const C = SF.CFG;
  const clamp = function (v, a, b) { return v < a ? a : v > b ? b : v; };
  const ease = function (u) { u = clamp(u, 0, 1); return u * u * (3 - 2 * u); };
  const NOINPUT = Object.freeze({});
  SF.clamp = clamp; SF.ease = ease;

  // ---------------- creation ----------------
  function makeFighter(idx, styleIndex, x, face, team, hpFactor) {
    const st = C.STYLES[styleIndex];
    return {
      idx: idx, team: team || 0, styleIndex: styleIndex, style: st, name: 'P' + (idx + 1), boostT: 0, boostCD: 0, faceLock: 0, armor: 1, recov: null, getDur: C.GETUP_T, getInv: C.GETUP_T * 0.55, techArm: 0, techDone: false,
      x: x, h: 0, vx: 0, vy: 0, face: face, rot: 0,
      hp: st.hpMax * (hpFactor || 1), hpMax: st.hpMax * (hpFactor || 1), sta: 100, bal: 0, off: false, exh: false, gHP: st.gmax,
      state: 'idle', t: 0, stagDur: 0, rec: 0,
      aim: 0, charge: 0, limb: null, str: null,
      cr: 0, drop: 0, air: false, jumpLock: false,
      legHurt: 0, dizzy: 0, counter: 0, inv: 0, flash: 0,
      dashT: 0, dashDir: 0, dashCD: 0, grabCD: 0, tapCD: 0,
      guardAge: 0, combo: 0, comboT: 0, push: 0, grap: -1, gx0: 0,
      jumpPre: 0, sprintT: 0, tapDir: 0, tapT: 0, zone: null, win: false, ko: false, koT: 0, flair: 0, protect: 0, budget: 0, chain: null, cancelOpen: false, buf: null,
      prev: {}, ai: null
    };
  }
  SF.createMatch = function (opts) {
    opts = opts || {};
    const styles = opts.styles || [0, 1];
    const ai = opts.ai || [false, false];
    const lv = opts.levels || [];       /* AI difficulty per fighter: 0 easy, 1 normal (the behaviour of every earlier version), 2 hard */
    const n = clamp(styles.length, 2, 4), teams = (opts.teams && opts.teams.length === n) ? opts.teams.slice() : SF.defaultTeams(n);
    const fighters = [], seen = [0, 0];
    for (let i = 0; i < n; i++) {
      /* team 0 stands on the left, team 1 on the right; members of a team stand 110 px apart */
      const k = seen[teams[i]]++, x = teams[i] === 0 ? 300 - 110 * k : 600 + 110 * k;
      /* the outnumbered side gets more health and takes less damage per extra opponent (1 v 2: x2.5 health, x0.4 damage; 1 v 3: x4 and x0.25) */
      const mine = teams.filter(function (t) { return t === teams[i]; }).length, theirs = n - mine, extra = mine < theirs ? theirs / mine - 1 : 0;
      fighters.push(makeFighter(i, styles[i], clamp(x, 70, 830), teams[i] === 0 ? 1 : -1, teams[i], 1 + C.LONE_BONUS * extra));
      fighters[i].armor = 1 / (1 + C.LONE_ARMOR * extra);
    }
    return {
      t: 0, steps: 0, rng: SF.makeRng(opts.seed || 1), seed: opts.seed || 1,
      f: fighters, teams: teams, training: (opts.training || opts.tutorial) ? 1 : 0, tutorial: opts.tutorial ? 1 : 0, obLevel: clamp(Math.round(+opts.obstacles) || 0, 0, 2), obstacles: SF.makeObstacles(opts.seed || 1, clamp(Math.round(+opts.obstacles) || 0, 0, 2), fighters.map(function (q) { return q.x; })),
      aiFlags: fighters.map(function (q, i) { return !!ai[i]; }),
      levels: fighters.map(function (q, i) { return lv[i] === undefined ? 1 : clamp(Math.round(+lv[i]) || 0, 0, 2); }), winner: null, ev: [], stats: { moves: {}, events: {} }
    };
  };
  /* Obstacles: boxes on the floor, a few (2) or many (4), made from the seed with a random stream of their own so the fight itself is unchanged.
     A box is solid from the side below its top, can be climbed with a jump and stood on, and a fighter walking off its edge falls. */
  SF.makeObstacles = function (seed, level, starts) {
    const out = [], want = level === 1 ? 2 : level === 2 ? 4 : 0;
    if (!want) return out;
    const rng = SF.makeRng(((seed >>> 0) * 2654435761 + 12345) >>> 0 || 1);
    for (let tries = 0; out.length < want && tries < 1000; tries++) {
      const w = 50 + Math.floor(rng.next() * 61), h = 30 + 5 * Math.floor(rng.next() * 7), x = 70 + w / 2 + Math.floor(rng.next() * (C.W - 140 - w));
      if (starts.some(function (sx) { return Math.abs(sx - x) <= w / 2 + 28; })) continue;
      if (out.some(function (o) { return Math.abs(o.x - x) < (o.w + w) / 2 + 40; })) continue;
      out.push({ x: x, w: w, h: h });
    }
    return out;
  };
  /* the floor at a position, whatever the height of the body (a thrown fighter lands on a box if one is under the landing point) */
  SF.floorUnder = function (m, x) {
    let g = 0;
    for (const b of m.obstacles) if (Math.abs(x - b.x) < b.w / 2 + 16 && b.h > g) g = b.h;
    return g;
  };
  /* the height of the floor under a fighter: the top of a box he is above, else 0 */
  SF.groundLevel = function (m, f) {
    let g = 0;
    for (const b of m.obstacles) if (Math.abs(f.x - b.x) < b.w / 2 + 16 && f.h >= b.h - 10 && b.h > g) g = b.h;   /* feet within 10 px of the top: on it (a fall of one step is at most about 6 px) */
    return g;
  };
  /* is a box in the way of a fighter who walks in this direction (he would be stopped within a few pixels)? */
  SF.blockedAhead = function (m, f, dir) {
    for (const b of m.obstacles) { const gap = (b.x - f.x) * dir - (b.w / 2 + 16); if ((b.x - f.x) * dir > 0 && gap <= 14 && f.h < b.h - 10) return true; }
    return false;
  };
  /* 1 v 1, 1 v 2, 1 v 3 (team 0 is the player's side) */
  SF.defaultTeams = function (n) { return n <= 2 ? [0, 1] : n === 3 ? [0, 1, 1] : [0, 1, 1, 1]; };
  /* the nearest living enemy; with the facing locked, the nearest one in front if there is one */
  SF.target = function (m, f) {
    let best = null, bd = 1e9, front = null, fd = 1e9;
    for (const q of m.f) {
      if (q.team === f.team || q.ko) continue;
      const dx = q.x - f.x, d = Math.abs(dx);
      if (d < bd) { bd = d; best = q; }
      if (dx * f.face > 0 && d < fd) { fd = d; front = q; }
    }
    return (f.faceLock > 0 && front) ? front : (best || m.f[0]);
  };
  SF.stateHash = function (m) {
    let s = (m.winner === null ? 'n' : m.winner) + '|' + m.steps;
    for (const f of m.f) s += '|' + [f.x, f.h, f.vx, f.vy, f.hp, f.sta, f.bal, f.t, f.cr, f.aim].map(function (v) { return Math.round(v * 1000) / 1000; }).join(',') + f.state;
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    return h >>> 0;
  };

  // ---------------- geometry and move choice ----------------
  SF.angLimits = function (f, limb) {
    let hi = limb === 'kick' ? f.style.khi : 55;
    const lo = limb === 'kick' ? -25 : -45;
    hi -= 25 * f.cr + (limb === 'kick' && f.legHurt > 0 ? 10 : 0) + (f.off ? 8 : 0);
    if (f.air) hi += 8;
    return [lo, Math.max(lo + 10, hi)];
  };
  SF.clampAim = function (f, limb, aim) { const l = SF.angLimits(f, limb); return clamp(aim, l[0], l[1]); };

  SF.pickMove = function (f) {
    const S = f.style.name, a = SF.clampAim(f, f.limb, f.aim), c = f.charge, crouch = f.cr > 0.5, run = f.vx * f.face > 130;
    let kind = 'straight', name, ang = a;
    if (f.limb === 'punch') {
      if (f.air && a >= 35) { kind = 'up'; name = 'LEAPING UPPERCUT'; }
      else if (f.air) name = 'SUPERMAN PUNCH';
      else if (a >= 35) { kind = 'up'; name = 'UPPERCUT'; }          /* the aim decides first (DEF-031) ... */
      else if (a <= -25) { kind = 'chop'; name = 'OVERHAND'; }
      else if (crouch) { kind = 'up'; ang = 45; name = 'UPPERCUT'; }   /* ... crouching only gives the default when the aim is level */
      else if (c >= 0.5) name = 'SPINNING BACKFIST';
      else if (c >= 0.22) { kind = 'hook'; name = 'HOOK'; }
      else if (c >= 0.1) name = 'CROSS';
      else name = 'JAB';
    } else {
      if (f.air) { kind = 'flying'; name = c >= 0.3 ? 'TORNADO KICK' : a >= 25 ? 'BUTTERFLY KICK' : 'FLYING SIDE KICK'; }
      else if (crouch) { kind = 'low'; ang = -20; name = 'LOW SWEEP'; }
      else if (a >= 35) { kind = 'up'; name = 'RISING KICK'; }
      else if (a <= -15) { kind = 'low'; name = 'LOW KICK'; }
      else if (c >= 0.5) { if (S === 'Kicker') { kind = 'spin'; name = 'SPINNING KICK'; } else { kind = 'chop'; name = 'AXE KICK'; ang = SF.clampAim(f, 'kick', 40); } }   /* the axe kick comes down from above */
      else if (c >= 0.2) { kind = 'hook'; name = 'ROUNDHOUSE'; }
      else name = 'FRONT KICK';
    }
    void run;
    return { kind: kind, name: name, a: ang };
  };

  function reachOf(f, limb) { return limb === 'kick' ? f.style.kr : f.style.pr; }
  function strikeGeom(a, d, ang, limb) {
    const reach = reachOf(a, limb);
    const dx = Math.abs(d.x - a.x);
    const oy = (C.GY - a.h) + a.drop - (limb === 'kick' ? C.HIP_H : C.SHOULDER_H);
    const yAt = oy - dx * Math.tan(ang * Math.PI / 180);
    const top = (C.GY - d.h) + d.drop - C.BODY_H, bottom = C.GY - d.h;
    const behind = a.faceLock > 0 && (d.x - a.x) * a.face < -2;       /* TURN-02: a locked facing cannot hit what is behind */
    return { dx: dx, reach: reach, inRange: dx <= reach + 18 && !behind, inSpan: yAt >= top - 10 && yAt <= bottom + 5, yAt: yAt };
  }
  SF.strikeGeom = strikeGeom;

  // ---------------- state helpers ----------------
  function push(m, e) { m.ev.push(e); m.stats.events[e.k] = (m.stats.events[e.k] || 0) + 1; }
  function shove(f, dv) { f.push += dv; }
  // All stamina spending goes through these two (QA guide 20.9). spend is all-or-nothing, drain is partial and clamped.
  function spend(f, cost) { if (f.sta < cost) return false; f.sta -= cost; return true; }   /* @bounded */
  function drain(f, amount) { f.sta = Math.max(0, f.sta - amount); }   /* @bounded */
  function gain(f, amount) { f.sta = Math.min(100, f.sta + amount); }   /* @bounded */
  // One place that clamps every bounded value and derives the flags that depend on them.
  function normalise(f) {
    f.sta = clamp(f.sta, 0, 100);   /* @bounded */
    f.hp = clamp(f.hp, 0, f.hpMax);   /* @bounded */
    f.gHP = clamp(f.gHP, 0, f.style.gmax);   /* @bounded */
    f.bal = clamp(f.bal, -1, 1);
    if (f.sta <= 0) f.exh = true;
    else if (f.exh && f.sta >= C.EXH_RECOVER) f.exh = false;
  }
  /* a fighter who is getting up cannot be hit for the first part of it (shorter for the fast recoveries) */
  function getupSafe(d) { return d.state === 'getup' && d.t < (d.getInv === undefined ? C.GETUP_T * 0.55 : d.getInv); }
  /* the break-fall (judo ukemi): a tap at the right moment shortens the fall (RCV-06) */
  function techFall(m, d) { d.techDone = true; d.techArm = 0; d.stagDur *= C.TECH_SHORTEN; push(m, { k: 'techfall', d: d.idx }); }
  /* start a chosen recovery (RCV-01) */
  function startRecov(m, f, how) {
    const R = C.RECOV[how];
    f.state = 'getup'; f.t = 0; f.recov = how; f.getDur = R.dur; f.getInv = R.inv; if (how === 'kip') f.flair = 1; else if (how === 'guard') f.flair = 0;
    push(m, { k: 'recover', a: f.idx, how: how });
  }
  function stagger(f, dur) {
    f.state = 'stagger'; f.t = 0; f.stagDur = dur; f.charge = 0; f.str = null; f.limb = null; f.dashT = 0;
    f.jumpPre = 0; f.zone = null; f.chain = null; f.cancelOpen = false; f.buf = null;
  }
  function knockdown(m, d, a, tip) {
    d.recov = null; d.getDur = C.GETUP_T; d.getInv = C.GETUP_T * 0.55; d.techDone = false;
    d.state = 'down'; d.t = 0; d.stagDur = Math.min(3, 0.9 + 0.04 * tip); d.charge = 0; d.str = null; d.limb = null; d.bal = 0;
    startProtect(d);
    d.vx *= 0.3; shove(d, a.face * (120 + 8 * tip));
    d.flair = Math.floor(m.rng.next() * 3);   /* the style of the stand-up: 0 standard, 1 kip-up, 2 tornado */
    push(m, { k: 'knockdown', d: d.idx, a: a.idx, tip: tip, flair: d.flair });
  }
  /* A fighter that is thrown or knocked down is protected from the landing until it has stood up plus a grace period:
     it cannot be K.O.'d, takes at most BUDGET_FRAC of its maximum health in total, and the budget is not refilled by a new
     knockdown inside the window (CHAIN-01 to CHAIN-04). */
  function startProtect(d) { if (d.protect <= 0) d.budget = C.BUDGET_FRAC * d.hpMax; d.protect = 99; }
  function overreach(a, st, whiff) {
    const sn = clamp((st.s - 0.4) / 1.2, 0, 1);
    a.bal = clamp(0.2 + 0.55 * sn + (whiff ? 0.3 : 0) + ((C.KIND[st.kind] || {}).bal || 0), 0, 1);
  }
  function finish(m, a, d) {
    /* trainer mode: nobody is K.O.'d; the fighter at zero health is refilled and the practice goes on */
    if (m.training && d.hp <= 0) { d.hp = d.hpMax; return; }   /* @bounded */
    if (d.hp <= 0 && m.winner === null && !d.ko && !m.f.every(function (q) { return q.team !== d.team || q === d || q.ko; })) {
      /* one fighter is down but his team still has someone standing: he stays where he fell and the match goes on (MP-02) */
      d.ko = true; d.state = 'down'; d.t = 0; d.stagDur = 1e9; d.str = null; d.limb = null; d.charge = 0; d.chain = null; d.protect = 0;
      push(m, { k: 'ko', winner: a.idx, d: d.idx, over: false });
      return;
    }
    if (d.hp <= 0 && m.winner === null) {
      m.winner = a.idx; a.win = true;
      for (const q of m.f) if (q.team === a.team && !q.ko) q.win = true;
      for (const q of m.f) { q.state = 'idle'; q.str = null; q.limb = null; q.charge = 0; q.vx = 0; q.vy = 0; q.push = 0; q.grap = -1; q.dashT = 0; q.inv = 0; q.rot = 0; q.air = false; q.h = SF.groundLevel(m, q); q.cr = 0; q.drop = 0; }
      /* the loser falls and stays down (DEF-010); the winner holds the victory pose */
      d.state = 'down'; d.t = 0; d.stagDur = 1e9; d.ko = true;
      for (const q of m.f) q.flash = 0;   /* transient visual timers are cleared: the match is frozen */
      push(m, { k: 'ko', winner: a.idx, d: d.idx, over: true });
    }
  }

  // ---------------- combat ----------------
  /* can the strike land (or be dodged) right now? Used on every active frame; the whiff is reported only at the end. */
  SF.canHit = function (a, d) {
    const st = a.str, g = strikeGeom(a, d, st.a, st.limb);
    if (d.state === 'down' || d.state === 'flipped' || d.state === 'grapple' || getupSafe(d)) return false;
    if (d.inv > 0) return g.inRange;
    return g.inRange && g.inSpan;
  };
  /* the names of a sequence as a fighter would call them */
  SF.chainLabel = function (names) {
    const key = names.join(',');
    if (key === 'JAB,CROSS') return '1-2';
    if (key === 'JAB,CROSS,HOOK') return '1-2-3';
    if (key === 'JAB,CROSS,HOOK,UPPERCUT') return '1-2-3-4';
    if (key === 'FRONT KICK,ROUNDHOUSE,SPINNING KICK') return 'FRONT-ROUND-SPIN';
    return names.join(' > ');
  };
  SF.impact = function (m, a, d) {
    const st = a.str, S = a.style, K = C.KIND[st.kind] || C.KIND.straight;
    const g = strikeGeom(a, d, st.a, st.limb);
    if (d.state === 'down' || d.state === 'flipped' || d.state === 'grapple' || getupSafe(d)) { push(m, { k: 'whiff', a: a.idx, why: 'down' }); overreach(a, st, true); return; }
    if (d.inv > 0) { push(m, { k: 'dodge', a: a.idx, d: d.idx }); overreach(a, st, true); d.counter = Math.max(d.counter, 0.7); gain(d, 8); return; }
    if (!g.inRange) { push(m, { k: 'whiff', a: a.idx, why: 'range' }); overreach(a, st, true); return; }
    if (!g.inSpan) { push(m, { k: 'whiff', a: a.idx, why: 'span' }); overreach(a, st, true); return; }
    /* a protected fighter whose budget is used up (or who is down to 1 hit point) takes nothing and is not even staggered */
    const wasProtected = d.protect > 0;
    if (wasProtected && (d.budget <= 1e-6 || d.hp <= 1)) { push(m, { k: 'protected', a: a.idx, d: d.idx }); overreach(a, st, true); return; }
    const dY = C.GY - d.h;
    const zone = g.yAt < dY + d.drop - C.SHOULDER_H - 5 ? 'HEAD' : g.yAt < dY + d.drop - C.HIP_H ? 'BODY' : 'LEGS';
    const sn = clamp((st.s - 0.4) / 1.2, 0, 1);
    const toward = clamp(a.vx * a.face / C.MAXV, 0, 1);
    const speedF = 0.5 + (st.s <= 2 ? st.s : 2 + (st.s - 2) * 0.35);
    const spec = ((C.SMB[S.name] || {})[st.kind]) || 1;
    const base = (st.limb === 'punch' ? 6 * S.pm : 10 * S.km) * speedF * (1 + 0.3 * toward) * (1 + 0.3 * clamp(a.bal, 0, 1)) * (K.dm || 1) * spec * (st.counter ? 1.5 : 1) * (a.boostT > 0 ? C.BOOST_DMG : 1);
    const tol = (28 - 10 * sn + d.style.tolB - (d.off ? 8 : 0)) * (K.tol || 1) * (st.counter ? 0.6 : 1);
    const kbv = a.face * (90 + 160 * sn);
    let dmg = base, tag = 'HIT', full = false, combo = 1;

    if (d.state === 'guard') {
      const diff = Math.abs(st.a - d.aim);
      if (diff <= tol && d.guardAge < C.PARRY_AGE) {
        dmg = 0; tag = 'PARRY'; stagger(a, 0.8); shove(a, -a.face * 150); d.counter = 1.2;
      } else if (diff <= tol) { dmg = base * 0.1; tag = 'BLOCK'; shove(d, kbv * 0.4); d.gHP -= base * 1.2; }   /* @bounded: normalised at the end of the step */
      else if (diff <= tol * 2) { dmg = base * 0.5; tag = 'PARTIAL'; shove(d, kbv * 0.7); d.gHP -= base * 0.6; }   /* @bounded: normalised at the end of the step */
      else full = true;
      if (!full && d.gHP <= 0 && tag !== 'PARRY') {
        stagger(d, 1.0); d.gHP = d.style.gmax * 0.6; d.counter = 0;   /* @bounded */
        push(m, { k: 'guardBreak', d: d.idx });
      }
    } else full = true;

    if (full) {
      if (d.state === 'charge') dmg *= 1.3;
      dmg *= (zone === 'HEAD' ? 1.3 : zone === 'LEGS' ? 0.8 : 1) * (d.off ? 1.25 : 1);
      const chained = d.state === 'stagger' && d.comboT > 0;
      d.combo = chained ? d.combo + 1 : 1; d.comboT = 1.2; combo = d.combo;
      if (d.combo > 1) dmg *= 1 + 0.1 * Math.min(d.combo - 1, 4);
      let stag = 0.3 + 0.3 * sn;
      if (d.combo >= 4) stag *= 0.55;
      if (zone === 'HEAD') { stag *= 1.6; d.dizzy = 2.2; }
      if (zone === 'BODY') drain(d, 15);
      if (zone === 'LEGS') {
        d.legHurt = 4;
        if (Math.abs(d.vx) > C.TRIP_V && !d.air) { stag = 0.9; d.vx *= 0.3; push(m, { k: 'trip', d: d.idx }); }
      }
      stagger(d, stag); shove(d, kbv); d.flash = 0.6; d.zone = zone;
      const tip = dmg * (1 - 0.7 * d.bal) * (zone === 'LEGS' ? 1.3 : 1) * (d.cr > 0.5 ? 0.6 : 1) * (d.air ? 1.5 : 1) * (K.tip || 1);
      /* a protected fighter is staggered but not floored again, so one chain has one fall (CHAIN-02, DEF-020) */
      if (tip > (d.off ? 40 : 52) && !d.air && !wasProtected) knockdown(m, d, a, tip);
    }
    dmg *= d.armor;   /* the outnumbered side takes less damage */
    if (wasProtected && dmg > 0) {
      const allowed = Math.max(0, Math.min(d.budget, d.hp - 1));
      if (dmg > allowed) { dmg = allowed; push(m, { k: 'protected', a: a.idx, d: d.idx }); }
      d.budget -= dmg;
    }
    d.hp = Math.max(0, d.hp - dmg);   /* @bounded */
    push(m, { k: 'hit', a: a.idx, d: d.idx, zone: zone, dmg: dmg, tag: tag, kind: st.kind, combo: combo, name: st.name });
    if (a.state !== 'stagger') overreach(a, st, false);
    finish(m, a, d);
  };

  // ---------------- grapple ----------------
  SF.doThrow = function (m, a, d) {
    const dx = Math.abs(a.x - d.x), fail = function (why) { push(m, { k: 'grappleFail', a: a.idx, reason: why }); if (a.state === 'grab') { a.state = 'recover'; a.rec = 0.4; a.t = 0; } };
    if (d.fixed) return fail('fixed');
    if (d.protect > 0) return fail('protected');
    if (dx <= a.style.grab && !d.air && (d.cr > 0.5 || d.vx * a.face > 150 || d.inv > 0)) return fail(d.cr > 0.5 ? 'ducked' : 'evaded');
    if (dx > a.style.grab || d.air || a.air || d.state === 'down' || d.state === 'flipped' || d.state === 'grapple' || getupSafe(d)) return fail('whiff');
    a.state = 'grapple'; a.t = 0; a.vx = 0; a.grap = d.idx; a.gx0 = d.x; a.str = null; a.limb = null; a.charge = 0;
    d.state = 'flipped'; d.t = 0; d.vx = 0; d.vy = 0; d.air = false; d.charge = 0; d.str = null; d.limb = null; d.counter = 0; d.push = 0;
    d.flair = Math.floor(m.rng.next() * 3);   /* the style of the flight and of the stand-up: 0 tuck / standard, 1 pike and windmill / kip-up, 2 scissor / tornado */
    push(m, { k: 'grapple', a: a.idx, d: d.idx });
  };
  function driveFlip(m, a, d) {
    const u = clamp((a.t - C.GRAB_LOCK) / C.GRAB_FLIP, 0, 1), e = ease(u), f = a.face;
    a.cr = Math.sin(Math.PI * clamp((a.t - 0.05) / (C.GRAB_LOCK + C.GRAB_FLIP), 0, 1)) * 0.8; a.drop = 32 * a.cr;
    const xf = a.x + f * 34, x0 = a.gx0 + (xf - a.gx0) * ease(clamp(a.t / C.GRAB_LOCK, 0, 1)), x2 = clamp(a.x - f * 115, 60, C.W - 60);
    const mix = function (p0, p1, p2) { return (1 - e) * (1 - e) * p0 + 2 * (1 - e) * e * p1 + e * e * p2; };
    d.x = mix(x0, a.x, x2); d.h = Math.max(SF.floorUnder(m, d.x), mix(10 * clamp(a.t / C.GRAB_LOCK, 0, 1), 340, 0));   /* never below the floor under him (DEF-030) */
    d.rot = -f * e * 1.5 * Math.PI; d.face = -f;
  }
  function finishFlip(m, a, d) {
    const tech = d.techArm > 0;                                  /* a tap in the last 0.25 s of the flight softens the landing */
    const dmg = 14 * a.style.thr * (a.boostT > 0 ? C.BOOST_DMG : 1) * d.armor * (tech ? C.TECH_DMG : 1);
    d.state = 'down'; d.t = 0; d.stagDur = 1.1; d.vx = -a.face * 150; d.rot = 0; d.bal = 0; d.flash = 0.6;
    startProtect(d);
    d.x = clamp(d.x - a.face * 70, 40, C.W - 40);
    d.h = SF.floorUnder(m, d.x);
    d.recov = null; d.getDur = C.GETUP_T; d.getInv = C.GETUP_T * 0.55; d.techDone = false; if (tech) techFall(m, d);   /* he lands on a box if there is one under the landing point */
    d.hp = Math.max(0, d.hp - dmg); drain(d, 20);   /* @bounded */
    a.state = 'recover'; a.rec = 0.6; a.t = 0; a.cr = 0; a.drop = 0; a.grap = -1;
    push(m, { k: 'throw', a: a.idx, d: d.idx, dmg: dmg, flair: d.flair });
    finish(m, a, d);
  }

  // ---------------- per-fighter update ----------------
  function rise(f, inp, key) { return !!inp[key] && !f.prev[key]; }
  /* Start a move from the frame table (docs/CHOREOGRAPHY.md). opts: aim and kind override the table (a wound-up strike uses the
     player's aim), counter marks a counter strike, chain continues a sequence. */
  SF.beginMove = function (m, f, name, s, opts) {
    opts = opts || {};
    const mv = C.MOVES[name], sp = s || 1;
    const startT = mv.fr[0] * C.DT / sp, activeT = Math.max(C.DT, mv.fr[1] * C.DT / sp);
    const recT = mv.fr[2] * C.DT * (mv.limb === 'kick' ? f.style.krec / 0.9 : 1);
    f.limb = mv.limb;
    f.str = { limb: mv.limb, kind: opts.kind || mv.kind, a: opts.aim !== undefined ? opts.aim : SF.clampAim(f, mv.limb, mv.aim), s: sp,
              dur: startT + activeT, startT: startT, activeT: activeT, recT: recT, cancel: mv.cancel * C.DT, lunge: m.tutorial ? 0 : mv.lunge, hand: mv.hand,
              counter: !!opts.counter, hit: false, name: name, look: mv.look || '' };
    f.state = 'strike'; f.t = 0; f.cancelOpen = false; f.buf = null; drain(f, 6);
    f.chain = opts.chain || { names: [name] };
    m.stats.moves[name] = (m.stats.moves[name] || 0) + 1;
  };
  function startStrike(m, f) {
    const mv = SF.pickMove(f);
    let s = 0.7 + 0.9 * clamp(f.charge / C.CHARGE_MAX, 0, 1), counter = false;
    if (f.counter > 0) { s = Math.min(C.STRIKE_MAX, s + 0.6); counter = true; f.counter = 0; }
    SF.beginMove(m, f, mv.name, s, { aim: mv.a, kind: mv.kind, counter: counter });
  }
  /* the next move of a sequence, or null */
  function nextInChain(f, limb) {
    const graph = C.CHAIN[f.style.name], node = graph && f.str ? graph[f.str.name] : null;
    return node && node[limb] ? node[limb] : null;
  }
  function canAct(f) { return f.state === 'idle' || f.state === 'guard' || f.state === 'charge'; }

  function updateFighter(m, f, o, inp, dt) {
    const S = f.style;
    /* the tutorial: the trainee stands still and only punches and aims (no walking, jumping, kicking, blocking or footwork) */
    if (m.tutorial && f.idx === 0) inp = { punch: inp.punch, aimUp: inp.aimUp, aimDown: inp.aimDown };
    f.flash = Math.max(0, f.flash - dt); f.counter = Math.max(0, f.counter - dt); f.inv = Math.max(0, f.inv - dt);
    f.dashT = Math.max(0, f.dashT - dt); f.dashCD = Math.max(0, f.dashCD - dt); f.grabCD = Math.max(0, f.grabCD - dt);
    f.tapCD = Math.max(0, f.tapCD - dt); f.comboT = Math.max(0, f.comboT - dt); f.legHurt = Math.max(0, f.legHurt - dt);
    f.dizzy = Math.max(0, f.dizzy - dt);
    f.boostT = Math.max(0, f.boostT - dt); f.boostCD = Math.max(0, f.boostCD - dt); f.faceLock = Math.max(0, f.faceLock - dt);
    f.sprintT = Math.max(0, f.sprintT - dt); f.tapT = Math.max(0, f.tapT - dt);
    if (f.state !== 'down' && f.state !== 'getup' && f.state !== 'flipped') {
      /* any way out of the fall (the stand-up finishing, or a hit during it) turns the placeholder into the grace period (DEF-020) */
      if (f.protect > C.PROTECT_AFTER) f.protect = C.PROTECT_AFTER;
      f.protect = Math.max(0, f.protect - dt);
    }
    if (f.state !== 'strike') {
      /* weight shifts forward when advancing, back when retreating, and back while loading a strike */
      const fwd = clamp(f.vx * f.face / C.MAXV, -1, 1);
      const load = f.state === 'charge' ? clamp(f.charge / C.CHARGE_MAX, 0, 1) : 0;
      const target = 0.3 * fwd - 0.4 * load;
      f.bal += clamp(target - f.bal, -0.35 * dt, 0.35 * dt);
    }
    f.off = Math.abs(f.bal) > 0.55;
    normalise(f);
    if (f.state === 'idle' || f.state === 'guard' || f.state === 'recover') gain(f, 14 * S.sreg * dt * (f.exh ? 0.7 : 1));
    else if (f.state === 'down' || f.state === 'getup') gain(f, (f.recov === 'guard' ? 14 : 7) * S.sreg * dt * (f.exh ? 0.7 : 1));   /* staying and guarding rests at the full rate */   /* STA-01: half rate on the ground */
    if (f.state !== 'guard' && f.gHP < S.gmax) f.gHP = Math.min(S.gmax, f.gHP + 10 * dt);   /* @bounded */
    // pushes ramp in over ~0.09 s
    if (f.push) { const take = f.push * Math.min(1, dt / 0.09); f.vx += take; f.push -= take; if (Math.abs(f.push) < 1) f.push = 0; }

    /* on the floor: the break-fall tap, and the choice of how to get up (RCV-01, RCV-06) */
    const anyDir = rise(f, inp, 'left') || rise(f, inp, 'right') || rise(f, inp, 'jump') || rise(f, inp, 'crouch');
    f.techArm = Math.max(0, f.techArm - dt);
    if (f.state === 'flipped' && anyDir) f.techArm = C.TECH_WINDOW;
    if (f.state === 'down' && !f.ko) {
      if (!f.techDone && f.t <= C.TECH_AFTER && anyDir) techFall(m, f);
      if (f.t >= C.RECOV_MIN && f.t < f.stagDur - 0.05) {
        const fwd = (inp.right && f.face > 0) || (inp.left && f.face < 0), back = (inp.left && f.face > 0) || (inp.right && f.face < 0);
        const how = inp.jump ? 'kip' : fwd ? 'fwd' : back ? 'back' : inp.crouch ? 'guard' : null;
        if (how && spend(f, C.RECOV[how].cost)) startRecov(m, f, how);
      }
    }
    const st = f.state;
    if (st === 'flipped') return;                       // carried by the attacker
    if (st === 'grapple') {
      f.t += dt; const d = m.f[f.grap];
      if (d && d.state === 'flipped') {
        driveFlip(m, f, d);
        if (f.t >= C.GRAB_LOCK + C.GRAB_FLIP) finishFlip(m, f, d);
      } else { f.state = 'recover'; f.rec = 0.3; f.t = 0; f.cr = 0; f.drop = 0; }
      return;
    }
    if (st === 'grab') { f.t += dt; f.vx *= 0.8; if (f.t >= C.GRAB_START) SF.doThrow(m, f, o); }
    else if (st === 'stagger') { f.t += dt; if (f.t >= f.stagDur) { f.state = 'idle'; f.t = 0; } }
    else if (st === 'down') { f.t += dt; if (f.t >= f.stagDur) { f.state = 'getup'; f.t = 0; f.recov = null; f.getDur = C.GETUP_T; f.getInv = C.GETUP_T * 0.55; } }
    else if (st === 'getup') {
      f.t += dt;
      if (f.recov === 'fwd' || f.recov === 'back') f.x = clamp(f.x + f.face * C.RECOV[f.recov].dx * dt / f.getDur, 40, C.W - 40);    /* a roll carries the body */
      if (f.t >= f.getDur) { f.state = 'idle'; f.t = 0; f.bal = -0.2; if (f.protect > 0) f.protect = C.PROTECT_AFTER; } }
    else if (st === 'recover') {
      f.t += dt;
      const cw = f.str && f.str.cancel ? f.str.cancel : 0, open = f.rec - cw;
      f.cancelOpen = !!f.chain && cw > 0 && f.t >= open - 1e-9;
      if (f.chain && cw > 0 && !f.exh) {
        const pressed = rise(f, inp, 'punch') ? 'punch' : rise(f, inp, 'kick') ? 'kick' : null;
        /* a press up to BUFFER_F frames before the window opens is remembered until it opens */
        if (pressed && (f.cancelOpen || open - f.t <= C.BUFFER_F * C.DT + 1e-9)) f.buf = pressed;
        if (f.cancelOpen && f.buf) {
          const next = nextInChain(f, f.buf);
          f.buf = null;
          if (next) {
            const names = f.chain.names.concat([next]);
            SF.beginMove(m, f, next, 1, { chain: { names: names } });
            push(m, { k: 'chain', a: f.idx, names: names.slice(), n: names.length });
          }
        } else if (f.cancelOpen && rise(f, inp, 'grab') && f.chain.names.length >= 2 && !f.air && f.sta >= 20 && f.grabCD <= 0) {
          /* grapple cancel from the second move of a sequence on */
          f.state = 'grab'; f.t = 0; spend(f, 20); f.grabCD = C.GRAB_CD; f.chain = null; f.cancelOpen = false; f.buf = null; f.str = null; f.limb = null;
        }
      }
      if (f.state === 'recover' && f.t >= f.rec - 1e-9) { f.state = 'idle'; f.t = 0; f.chain = null; f.cancelOpen = false; f.buf = null; }
    }
    else if (st === 'strike') {
      const str = f.str, prevT = f.t, framed = str.startT !== undefined;
      f.t += dt;
      if (rise(f, inp, f.limb) && f.tapCD <= 0 && f.sta >= C.TAP_COST && str.s < C.STRIKE_MAX) {
        const prog = f.t / str.dur, old = str.s;
        str.s = Math.min(C.STRIKE_MAX, str.s + C.TAP_BOOST * S.tap);
        if (framed) { str.startT *= old / str.s; str.activeT *= old / str.s; str.dur = str.startT + str.activeT; } else str.dur = C.STRIKE_T / str.s;
        f.t = prog * str.dur;
        spend(f, C.TAP_COST); f.tapCD = C.TAP_GAP;
      }
      const su = framed ? str.startT : str.dur * 0.55;
      /* footwork: the lunge carries the body forward during the startup */
      if (framed && str.lunge) {
        const e0 = ease(clamp(prevT / su, 0, 1)), e1 = ease(clamp(f.t / su, 0, 1));
        f.x = clamp(f.x + f.face * str.lunge * (e1 - e0), 40, C.W - 40);
      }
      /* the tutorial hears about every punch: its angle and its strength */
      if (m.tutorial && !str.swung && f.t >= su - 1e-9) { str.swung = true; push(m, { k: 'swing', a: f.idx, ang: str.a, s: str.s, limb: str.limb, name: str.name }); }
      /* the hit can land on any active frame; a legacy strike without frame data resolves once, at the contact moment */
      if (!str.hit && f.t >= su - 1e-9) {
        if (!framed) { str.hit = true; SF.impact(m, f, o); }
        else if (SF.canHit(f, o)) { str.hit = true; SF.impact(m, f, o); }
      }
      if (f.state === 'strike' && f.t >= str.dur - 1e-9) {
        if (framed && !str.hit) { str.hit = true; SF.impact(m, f, o); }   /* the whiff is reported once, at the end of the active frames */
        if (f.state === 'strike') {
          f.state = 'recover'; f.t = 0;
          f.rec = framed ? str.recT : (f.limb === 'kick' ? 0.5 * S.krec : 0.32) + (str.kind === 'spin' ? 0.2 : 0);
        }
      }
    }

    // ---- inputs that need a fighter who can act ----
    if (canAct(f)) {
      const onGround = !f.air;
      if (f.state !== 'charge') f.aim = clamp(f.aim, -60, 60);
      const aimRate = m.tutorial ? 360 : 120;   /* the tutorial turns the aim fast so a line drawn at an angle punches at that angle at once */
      if (inp.aimUp) f.aim += aimRate * dt; if (inp.aimDown) f.aim -= aimRate * dt;
      f.aim = clamp(f.aim, -60, 60);
      for (const key of ['left', 'right']) {
        if (!rise(f, inp, key)) continue;
        const dd = key === 'right' ? 1 : -1;
        if (f.tapT > 0 && f.tapDir === dd) {
          if (onGround && spend(f, C.SPRINT_COST)) f.sprintT = C.SPRINT_T;
          f.tapT = 0;
        } else { f.tapDir = dd; f.tapT = C.SPRINT_GAP; }
      }
      f.cr += clamp((inp.crouch && onGround ? 1 : 0) - f.cr, -8 * dt, 8 * dt); f.drop = 32 * f.cr;
      if (rise(f, inp, 'dash') && onGround && f.dashCD <= 0 && f.sta >= C.DASH_COST && !f.exh) {
        const dir = (inp.right ? 1 : 0) - (inp.left ? 1 : 0);
        f.dashDir = dir || -f.face; f.dashT = C.DASH_T; f.inv = C.DASH_INV; f.dashCD = C.DASH_CD; spend(f, C.DASH_COST); f.vx = f.dashDir * C.DASH_V;
        f.state = 'idle'; f.charge = 0; f.limb = null;
      }
      /* boost: stronger hits for a few seconds, paid in stamina, then a cooldown (BOOST-01) */
      if (rise(f, inp, 'boost') && f.boostCD <= 0 && !f.exh && f.sta >= C.BOOST_COST && spend(f, C.BOOST_COST)) { f.boostT = C.BOOST_T; f.boostCD = C.BOOST_CD; push(m, { k: 'boost', a: f.idx }); }
      /* turn around: flip the facing and keep it for a while (TURN-01) */
      if (rise(f, inp, 'turn') && onGround && (f.state === 'idle' || f.state === 'guard')) { f.face = -f.face; f.faceLock = C.FLIP_LOCK; push(m, { k: 'turn', a: f.idx }); }
      /* a wind-up that has not been released and is still young can be cancelled into a grab (DEF-025) */
      const youngWind = f.state === 'charge' && f.charge < C.GRAB_CANCEL;
      if (rise(f, inp, 'grab') && onGround && !f.exh && f.sta >= 20 && f.grabCD <= 0 && (f.state === 'idle' || f.state === 'guard' || youngWind)) {
        f.state = 'grab'; f.t = 0; f.charge = 0; f.limb = null; spend(f, 20); f.grabCD = C.GRAB_CD;
      } else if (f.state === 'charge') {
        const key = f.limb;
        if (inp[key] && !f.exh) { f.charge = Math.min(C.CHARGE_MAX, f.charge + dt); drain(f, 8 * dt); }
        else startStrike(m, f);
      } else if ((f.state === 'idle' || f.state === 'guard') && (inp.punch || inp.kick) && !f.exh) {
        f.limb = inp.punch ? 'punch' : 'kick'; f.state = 'charge'; f.charge = 0; f.t = 0;
      } else if (inp.block && onGround && (f.state === 'idle' || f.state === 'guard')) {
        if (f.state !== 'guard') { f.state = 'guard'; f.guardAge = 0; }
        f.guardAge += dt;
      } else if (f.state === 'guard') { f.state = 'idle'; }
      if (inp.jump && onGround && f.cr < 0.5 && !f.exh && !f.jumpLock && f.jumpPre <= 0 && (f.state === 'idle' || f.state === 'guard') && spend(f, 8)) {
        f.jumpPre = C.JUMP_PRE; f.jumpLock = true;
      }
      if (!inp.jump) f.jumpLock = false;
    }

    // ---- jump spring: crouch first, then launch ----
    if (f.jumpPre > 0) {
      f.jumpPre -= dt;
      if (f.jumpPre <= 0) { f.jumpPre = 0; f.air = true; f.vy = C.JUMP_V * (f.legHurt > 0 ? 0.75 : 1); }
    }

    // ---- face the opponent while free ----
    if (f.faceLock <= 0 && (f.state === 'idle' || f.state === 'guard' || f.state === 'charge' || f.state === 'recover')) { const dx = o.x - f.x; if (Math.abs(dx) > 2) f.face = dx > 0 ? 1 : -1; }

    // ---- horizontal movement ----
    const free = f.state === 'idle' || f.state === 'guard' || f.state === 'charge' || f.state === 'recover' || f.state === 'strike';
    const dir = (inp.right ? 1 : 0) - (inp.left ? 1 : 0);
    if (f.dashT > 0) { f.vx = f.dashDir * C.DASH_V * (0.4 + 0.6 * f.dashT / C.DASH_T); }
    else if (free && dir && f.state !== 'strike') {
      const sprint = f.sprintT > 0 ? C.SPRINT_MULT : 1;
      const cap = C.MAXV * S.mv * sprint * (f.cr > 0.5 ? 0.4 : 1) * (f.off ? 0.6 : 1) * (f.state === 'guard' || f.state === 'charge' ? 0.6 : 1) * (f.exh ? 0.5 : 1);
      const acc = (f.air ? C.AIR_ACC : C.ACC) * (f.sprintT > 0 ? 1.5 : 1);
      const was = Math.abs(f.vx);
      f.vx += dir * acc * dt * 2;
      if (Math.abs(f.vx) > cap) {
        /* over the cap (a dash or a push): bleed toward it, never speed up further */
        f.vx = Math.sign(f.vx) * (was > cap ? Math.max(cap, was - C.FRIC * dt) : cap);
      }
    } else if (!f.air) { const fr = C.FRIC * dt; f.vx = Math.abs(f.vx) <= fr ? 0 : f.vx - Math.sign(f.vx) * fr; }
    f.x = clamp(f.x + f.vx * dt, 40, C.W - 40);
    if (f.x === 40 || f.x === C.W - 40) f.vx = 0;
    /* a box is solid from the side for anyone whose feet are below its top (OBS-02) */
    for (const b of m.obstacles) if (f.h < b.h - 10 && Math.abs(f.x - b.x) < b.w / 2 + 16) { f.x = f.x < b.x ? b.x - b.w / 2 - 16 : b.x + b.w / 2 + 16; f.vx = 0; }

    // ---- vertical ----
    const gl = SF.groundLevel(m, f);
    if (f.air) {
      const g = (inp.jump && f.vy > 0) ? C.G_HOLD : C.G;   /* a held jump rises with lower gravity */
      f.vy -= g * dt; f.h += f.vy * dt;
      if (f.h <= gl && f.vy <= 0) { f.h = gl; f.vy = 0; f.air = false; f.vx *= 0.5; }
    } else if (f.h > gl + 0.5 && f.state !== 'flipped' && f.state !== 'grapple') { f.air = true; f.vy = 0; }   /* walked off an edge (OBS-04) */
    if (f.h < 0) f.h = 0;
  }

  SF.step = function (m, inputs, dt) {
    m.ev.length = 0;
    dt = (typeof dt === 'number' && isFinite(dt)) ? dt : C.DT;
    dt = clamp(dt, 0, C.DT_MAX);
    if (m.winner !== null) {
      /* the match is frozen; only the cosmetic fall timer of the loser runs (not part of the state hash) */
      for (const q of m.f) if (q.ko) q.koT += dt;
      return;
    }
    m.t += dt; m.steps++;
    inputs = inputs || [];
    for (let i = 0; i < m.f.length; i++) {
      const f = m.f[i];
      updateFighter(m, f, SF.target(m, f), inputs[i] || NOINPUT, dt);
      f.prev = inputs[i] || NOINPUT;
      if (m.winner !== null) break;
    }
    for (const q of m.f) { normalise(q); if (q.ko) q.koT += dt; }
    if (m.training) { m.f[0].sta = 100; m.f[0].exh = false; }   /* @bounded: the trainee never tires */
    /* safety net (DEF-027): a thrown fighter whose holder is gone is put on the floor instead of hanging in the air */
    for (const q of m.f) if (q.state === 'flipped' && !m.f.some(function (h) { return h.state === 'grapple' && h.grap === q.idx; })) {
      q.state = 'down'; q.t = 0; q.stagDur = 1; q.h = SF.floorUnder(m, q.x); q.rot = 0; q.vx = 0; q.vy = 0; q.air = false; startProtect(q);
    }
    // boxes: whatever moved a fighter this step (a shove, a throw landing, the separation below) cannot leave him inside one
    const outOfBoxes = function () {
      for (const q of m.f) if (q.state !== 'flipped') for (const b of m.obstacles) if (q.h < b.h - 10 && Math.abs(q.x - b.x) < b.w / 2 + 16) { q.x = q.x < b.x ? b.x - b.w / 2 - 16 : b.x + b.w / 2 + 16; q.vx = 0; }
    };
    // keep bodies from overlapping
    for (let i = 0; i < m.f.length; i++) for (let j = i + 1; j < m.f.length; j++) {
      const a = m.f[i], b = m.f[j];
      if (a.team !== b.team && !a.ko && !b.ko && a.state !== 'grapple' && b.state !== 'grapple' && a.state !== 'flipped' && b.state !== 'flipped' && Math.abs(a.h - b.h) < 110) {
        const d = b.x - a.x, ad = Math.abs(d);
        if (ad < 44) {
          const dir = d === 0 ? a.face : Math.sign(d), p = (44 - ad) / 2, pa = b.fixed ? 2 * p : a.fixed ? 0 : p, pb = a.fixed ? 2 * p : b.fixed ? 0 : p;   /* a fixed dummy is not pushed */
          a.x = clamp(a.x - dir * pa, 40, C.W - 40); b.x = clamp(b.x + dir * pb, 40, C.W - 40);
          if (a.vx * dir > 0) a.vx *= 0.5; if (b.vx * dir < 0) b.vx *= 0.5;
        }
      }
    }
    if (m.obstacles.length) outOfBoxes();
    /* a fixed dummy (tutorial) neither moves nor reacts; it still takes the damage */
    for (const q of m.f) if (q.fixed) { q.x = q.fx; q.vx = 0; q.push = 0; q.vy = 0; q.h = 0; q.air = false; q.rot = 0; q.flash = 0; if (q.state !== 'idle') { q.state = 'idle'; q.t = 0; q.str = null; q.limb = null; q.charge = 0; q.chain = null; q.cancelOpen = false; q.buf = null; q.cr = 0; q.drop = 0; } }
  };
  // convenience: one step with AI-controlled fighters filled in (human inputs may be passed for the others)
  SF.stepAI = function (m, human, dt) {
    const inp = m.f.map(function (q, i) { return m.aiFlags[i] ? SF.aiInput(m, i) : ((human && human[i]) || NOINPUT); });
    SF.step(m, inp, dt);
  };
})();

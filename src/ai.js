// AI: reads the match, returns an input record like a human would produce. Uses only the match RNG.
var SF = (typeof SF === 'undefined') ? {} : SF;
(function () {
  'use strict';
  const C = SF.CFG, clamp = SF.clamp;
  const APPETITE = [
    { lo: 50, hi: 74,  kick: 0.15, grab: 0.22, jump: 0.14, press: 0.8 },   // Boxer
    { lo: 78, hi: 100, kick: 0.60, grab: 0.16, jump: 0.24, press: 0.5 },   // Kicker
    { lo: 38, hi: 66,  kick: 0.30, grab: 0.18, jump: 0.14, press: 0.7 }    // Grappler
  ];
  const ARCH = {
    brawler:   { press: 1.6, zone: 0.5, bait: 0.4, grab: 1.0, air: 0.8, defend: 0.3, heavy: 1.4, back: 0.5, rt: 0.38, vary: 0.55 },
    counter:   { press: 0.6, zone: 1.0, bait: 2.2, grab: 0.8, air: 0.6, defend: 0.8, heavy: 1.0, back: 1.1, rt: 0.22, vary: 0.40 },
    kiter:     { press: 0.6, zone: 2.4, bait: 1.0, grab: 0.5, air: 1.0, defend: 0.8, heavy: 0.8, back: 1.6, rt: 0.28, vary: 0.40 },
    trickster: { press: 0.9, zone: 1.0, bait: 1.0, grab: 1.6, air: 2.2, defend: 0.6, heavy: 1.0, back: 1.0, rt: 0.30, vary: 0.25 },
    rusher:    { press: 2.2, zone: 0.3, bait: 0.3, grab: 1.2, air: 1.0, defend: 0.2, heavy: 0.7, back: 0.4, rt: 0.34, vary: 0.45 },
    turtle:    { press: 0.4, zone: 0.8, bait: 1.6, grab: 0.9, air: 0.4, defend: 2.0, heavy: 1.1, back: 1.2, rt: 0.25, vary: 0.40 }
  };
  const ARCH_NAMES = Object.keys(ARCH);
  /* difficulty: reaction time, aim error, chance of being caught asleep, aggression, and how often a sequence is thrown. Level 1 is the original behaviour. */
  const LEVELS = [
    { rt: 1.9, err: 1.8,  sleep: 0.3,  press: 0.75, seq: 0.6 },
    { rt: 1,   err: 1,    sleep: 0.12, press: 1,    seq: 1 },
    { rt: 0.6, err: 0.45, sleep: 0.03, press: 1.25, seq: 1.3 }
  ];
  const NO_ACT = ['down', 'flipped', 'stagger', 'getup', 'grapple', 'grab'];

  function pickW(rng, items) {
    let t = 0; for (const it of items) t += Math.max(0, it.w);
    if (t <= 0) return items[items.length - 1];
    let r = rng.next() * t;
    for (const it of items) { r -= Math.max(0, it.w); if (r <= 0) return it; }
    return items[items.length - 1];
  }
  function aimAt(m, f, o, limb, zone) {
    const oy = limb === 'kick' ? C.HIP_H : C.SHOULDER_H;
    const ty = zone === 'head' ? 150 : zone === 'body' ? 100 : 40;
    const dx = Math.max(Math.abs(o.x - f.x), 25);
    const deg = Math.atan2(ty - oy, dx) * 180 / Math.PI + (m.rng.next() - 0.5) * 8;
    return Math.round(SF.clampAim(f, limb, deg) / 5) * 5;
  }
  function init(m, f) {
    return { cool: 0.5, plan: null, tactic: 'pressure', tacticT: 0, mood: 0.7 + m.rng.next() * 0.6, hist: [], reply: '', threat: false, react: 0, err: 0, pre: false, asleep: false,
             arch: ARCH_NAMES[Math.floor(m.rng.next() * ARCH_NAMES.length)], archT: 10 + m.rng.next() * 8, moveDir: 0, moveT: 0, tapPh: 0, sprintT: 0, jumpT: 0, duckT: 0, dashed: false, jumped: false, quiet: 0, hp0: -1, ohp0: -1, airT: 0 };
  }
  function moves(m, f, o, ai, ctx) {
    const T = APPETITE[f.styleIndex], A = ARCH[ai.arch], k = T.kick, list = [];
    const oRun = Math.abs(o.vx) > 110, oCrouch = o.cr > 0.5, zoning = ctx.tactic === 'zone', pressing = ctx.tactic === 'pressure';
    const add = function (name, limb, zone, hold, taps, w, extra) {
      const aim = aimAt(m, f, o, limb, zone), g = SF.strikeGeom(f, o, aim, limb);
      if (!(g.inRange && g.inSpan)) w *= 0.03;
      if (o.state === 'guard') w *= clamp(Math.abs(aim - o.aim) / 30, 0.3, 2.2);
      w *= Math.pow(A.vary, ai.hist.filter(function (h) { return h === name; }).length);
      list.push({ w: w, name: name, plan: Object.assign({ key: limb, phase: 'charge', el: 0, hold: hold * (0.8 + m.rng.next() * 0.4), taps: taps + (m.rng.next() < 0.4 ? 1 : 0), aim: aim, name: name }, extra || {}) });
    };
    add('jab', 'punch', 'head', 0.04, 1, 1.0 * (pressing ? 1.3 : 1) * (1 - k * 0.5));
    add('cross', 'punch', 'body', 0.15, 2, 0.9 * (1 - k * 0.5));
    add('body shot', 'punch', 'body', 0.30, 1, 0.6 * (o.sta < 50 ? 1.5 : 1) * (1 - k * 0.5));
    add('heavy punch', 'punch', 'head', 0.50, 0, 0.35 * (ctx.punish ? 3 : 1) * (zoning ? 0.4 : 1) * A.heavy);
    add('front kick', 'kick', 'body', 0.10, 1, 1.2 * k * (zoning ? 1.6 : 1));
    if (ctx.dist < f.style.pr * 0.85) add('uppercut', 'punch', 'head', 0.12, 1, 0.6, { aim: SF.clampAim(f, 'punch', 45) });
    add('sweep', 'kick', 'legs', 0.22, 1, 0.45 * k * (oRun ? 2 : 1), { crouch: true });
    add('low kick', 'kick', 'legs', 0.20, 1, 1.0 * k * (oRun ? 2.2 : 1) * (oCrouch ? 1.2 : 1));
    add('high kick', 'kick', 'head', 0.30, 2, 0.9 * k);
    add('heavy kick', 'kick', 'body', 0.55, 0, 0.5 * k * (ctx.punish ? 3 : 1) * (zoning ? 0.4 : 1) * A.heavy);
    return list;
  }

  SF.aiInput = function (m, i) {
    const f = m.f[i], o = SF.target(m, f), inp = {};
    if (m.winner !== null) return inp;
    const ai = f.ai || (f.ai = init(m, f));
    /* a reaction was chosen against one enemy: when the nearest enemy changes, forget it so a new one is chosen (DEF-028) */
    if (ai.tgt !== o.idx) { ai.tgt = o.idx; ai.threat = false; ai.reply = ''; ai.plan = null; }
    const st = f.state, dt = C.DT, T = APPETITE[f.styleIndex], S = f.style, A = ARCH[ai.arch], L = LEVELS[m.levels ? m.levels[i] : 1], RT = A.rt * L.rt;
    /* on the floor: choose how to get up, once per fall (RCV-09): far from the opponent the kip-up or the forward roll, close to him the back roll, tired the guard */
    if (st !== 'down') ai.rp = null;
    if (st === 'down' && !f.ko) {
      ai.plan = null; ai.threat = false;
      if (f.t >= C.RECOV_MIN && f.t < f.stagDur - 0.05) {
        const gap = Math.abs(o.x - f.x), edge = f.x < 75 || f.x > C.W - 75;
        if (!ai.rp) ai.rp = pickW(m.rng, [
          { n: 'kip', w: f.sta >= C.RECOV.kip.cost ? (gap > 120 ? 1.2 : 0.5) : 0 },
          { n: 'fwd', w: f.sta >= C.RECOV.fwd.cost ? (gap > 150 ? 1.0 : 0.3) : 0 },
          { n: 'back', w: f.sta >= C.RECOV.back.cost && !edge ? (gap < 140 ? 1.2 : 0.3) : 0 },
          { n: 'guard', w: 0.7 + (f.sta < 30 ? 1.5 : 0) }]).n;
        if (ai.rp === 'kip') inp.jump = true; else if (ai.rp === 'guard') inp.crouch = true;
        else if ((ai.rp === 'fwd') === (f.face > 0)) inp.right = true; else inp.left = true;
      }
      return inp;
    }
    if (NO_ACT.indexOf(st) >= 0) { ai.plan = null; ai.threat = false; return inp; }
    ai.tapPh += dt; ai.sprintT -= dt;
    ai.cool -= dt; ai.moveT -= dt; ai.jumpT -= dt; ai.duckT -= dt; ai.tacticT -= dt; ai.archT -= dt;

    const dx = o.x - f.x, dist = Math.abs(dx), dirTo = Math.sign(dx) || f.face;
    const free = st === 'idle' || st === 'guard';
    const maxReach = Math.max(S.pr, S.kr);
    const cornered = (f.x < 75 && dirTo > 0) || (f.x > C.W - 75 && dirTo < 0);
    if (ai.archT <= 0) { ai.archT = 10 + m.rng.next() * 8; if (m.rng.next() < 0.5) ai.arch = ARCH_NAMES[Math.floor(m.rng.next() * ARCH_NAMES.length)]; }
    if (f.hp !== ai.hp0 || o.hp !== ai.ohp0) { ai.hp0 = f.hp; ai.ohp0 = o.hp; ai.quiet = 0; } else ai.quiet += dt;
    if (ai.quiet > 4) { ai.quiet = 0; ai.tactic = 'pressure'; ai.tacticT = 2.5; ai.mood = Math.min(1.5, ai.mood + 0.15); }

    // tactic
    if (ai.tacticT <= 0) {
      ai.tacticT = 1.0 + m.rng.next() * 1.4;
      const weak = o.exh || o.sta < 25;
      ai.tactic = pickW(m.rng, [
        { n: 'pressure', w: (0.5 + T.press * 0.5) * ai.mood * (weak ? 1.8 : 1) * A.press * L.press },
        { n: 'zone', w: (S.name === 'Kicker' ? 0.9 : S.name === 'Boxer' ? 0.25 : 0.15) * A.zone },
        { n: 'bait', w: 0.3 * A.bait },
        { n: 'grapple', w: (T.grab * 3 + 0.1) * (f.grabCD > 0 ? 0 : 1) * (o.state === 'guard' ? 1.8 : 1) * A.grab },
        { n: 'air', w: T.jump * 3 * A.air },
        { n: 'defend', w: ((f.hp < 30 || f.sta < 18) ? 1.0 : 0.04) * A.defend }]).n;
    }

    // defence: read an incoming strike or grab and pick a reply
    const threat = (o.state === 'charge' || o.state === 'strike') && o.limb && dist < (o.limb === 'kick' ? o.style.kr : o.style.pr) + 60;
    const grabThreat = o.state === 'grab' && dist < o.style.grab + 25;
    if ((threat || grabThreat) && !ai.threat) {
      ai.err = (m.rng.next() - 0.5) * 50 * L.err; ai.pre = m.rng.next() < 0.4; ai.react = 0; ai.asleep = m.rng.next() < L.sleep; ai.jumped = false; ai.dashed = false;
      let pool;
      if (grabThreat && !threat) pool = [{ n: 'duck', w: 0.45 }, { n: 'back', w: cornered ? 0 : 0.2 }];
      else {
        const oa = o.state === 'charge' ? SF.clampAim(o, o.limb, o.aim) : o.str.a, g0 = SF.strikeGeom(o, f, oa, o.limb);
        pool = [{ n: 'block', w: 0.45 },
                { n: 'duck', w: (g0.yAt < C.GY - f.h - 123 && !f.air) ? 0.3 : 0 },
                { n: 'back', w: (o.state === 'strike' && !cornered) ? 0.15 * A.back : 0 },
                { n: 'jump', w: (g0.yAt > C.GY - f.h - 45 && !f.air) ? 0.3 : 0 },
                { n: 'poke', w: (o.state === 'charge' && dist <= maxReach && f.sta > 25) ? 0.3 * ai.mood : 0 },
                { n: 'dash', w: (o.state === 'strike' && f.dashCD <= 0 && f.sta >= 25 && !f.air) ? 0.28 * A.back : 0 }];
      }
      ai.reply = pickW(m.rng, pool).n;
    }
    ai.threat = !!(threat || grabThreat);
    if (ai.threat && !ai.asleep) {
      ai.react += dt;
      if (ai.reply === 'block' && !ai.plan) {
        const oa = o.state === 'charge' ? SF.clampAim(o, o.limb, o.aim) : (o.str ? o.str.a : o.aim);
        ai.guardAim = clamp(oa + ai.err, -60, 60);
        const prog = o.state === 'strike' ? o.t / o.str.dur : 0;
        if (ai.react > RT && (o.state === 'strike' ? (prog > 0.4 || ai.pre) : ai.pre)) inp.block = true;
      }
      if (ai.reply === 'duck' && ai.react > RT * 0.67) ai.duckT = grabThreat && !threat ? 0.5 : 0.3;
      if (ai.reply === 'back' && ai.react > 0.12 && !ai.plan) { ai.moveDir = -dirTo; ai.moveT = 0.25; }
      if (ai.reply === 'jump' && ai.react > 0.1 && !ai.jumped && !ai.plan) { ai.jumpT = 0.25; ai.jumped = true; }
      if (ai.reply === 'dash' && !ai.dashed && o.state === 'strike' && o.str) { const left = o.str.dur - o.t; if (left <= 0.2 && left > 0) { inp.dash = true; ai.dashed = true; } }
      if (ai.reply === 'poke' && !ai.plan && free && ai.react > 0.12) {
        const pm = moves(m, f, o, ai, { tactic: 'pressure', punish: true, dist: dist }).filter(function (x) { return x.plan.hold <= 0.2; });
        if (pm.length) { const c = pickW(m.rng, pm); ai.plan = c.plan; ai.plan.taps = Math.max(ai.plan.taps, 2); ai.hist.unshift(c.name); ai.hist.length = Math.min(3, ai.hist.length); }
        ai.reply = 'done';
      }
    }
    if (ai.duckT > 0 && !f.air) inp.crouch = true;

    // jump-in kick
    if (ai.airT > 0) {
      ai.airT -= dt;
      if (f.air && !ai.plan && (st === 'idle')) {
        /* a jump is followed by one of the flashy aerial moves: the flying kick, the butterfly kick (aim up), the tornado kick (a hold), or the superman punch */
        const r = m.rng.next();
        ai.plan = r < 0.2 ? { key: 'punch', phase: 'charge', el: 0, hold: 0.04, taps: 1, aim: aimAt(m, f, o, 'punch', 'body'), name: 'jump punch' }
          : r < 0.45 ? { key: 'kick', phase: 'charge', el: 0, hold: 0.04, taps: 2, aim: Math.max(30, aimAt(m, f, o, 'kick', 'body')), name: 'jump kick' }
          : r < 0.7 ? { key: 'kick', phase: 'charge', el: 0, hold: 0.36, taps: 1, aim: aimAt(m, f, o, 'kick', 'body'), name: 'jump kick' }
          : { key: 'kick', phase: 'charge', el: 0, hold: 0.04, taps: 2, aim: aimAt(m, f, o, 'kick', 'body'), name: 'jump kick' };
        ai.airT = 0;
      }
    }

    // run the current attack plan
    const p = ai.plan;
    if (p) {
      if (p.phase === 'charge') {
        if (st !== 'charge' && st !== 'idle' && st !== 'guard') ai.plan = null;
        else {
          p.el += dt; ai.guardAim = p.aim; if (p.crouch) inp.crouch = true;
          const aimed = Math.abs(f.aim - p.aim) < 6;
          if (p.el < p.hold || (!aimed && p.el < p.hold + 1)) inp[p.key] = true; else p.phase = 'tap';
        }
      }
      if (p.phase === 'tap') {
        if (st === 'strike') {
          p.pulse = (p.pulse || 0) + dt;
          const down = (p.pulse % 0.15) < 0.06;
          inp[p.key] = down && p.taps > 0;
          if (down && !p.wasDown && p.taps > 0) p.taps--;
          p.wasDown = down;
        } else if (st !== 'charge') ai.plan = null;
      }
    } else if (free && ai.cool <= 0 && !ai.threat) {
      ai.cool = 0.18 + m.rng.next() * 0.4 / ai.mood + (m.rng.next() < 0.15 ? 0.3 + m.rng.next() * 0.4 : 0);
      const oStun = o.state === 'recover' || o.state === 'stagger';
      const oFloor = o.state === 'down' || o.state === 'flipped' || (o.state === 'getup' && o.t < C.GETUP_T * 0.4);
      const punish = oStun || o.state === 'grab' || (o.state === 'getup' && o.t >= C.GETUP_T * 0.45);
      const spent = f.exh || f.sta < 18;
      const want = ai.tactic === 'zone' ? T.hi + 8 : ai.tactic === 'bait' ? Math.max(o.style.pr, o.style.kr) + 18 : ai.tactic === 'grapple' ? S.grab - 14 : ai.tactic === 'defend' ? 170 : (T.lo + T.hi) / 2;
      const grabOK = f.grabCD <= 0 && f.sta >= 20 && dist < S.grab - 8 && !o.air && o.cr <= 0.5 && !(o.vx * dirTo > 120) && (o.state === 'idle' || o.state === 'guard' || oStun);
      let acted = false;
      if (spent) { ai.moveT = 0.6; ai.moveDir = -dirTo; acted = true; }
      else if (oFloor) {
        if (dist > T.hi + 10) { ai.moveDir = dirTo; ai.moveT = 0.4; } else if (dist < T.lo - 10 && !cornered) { ai.moveDir = -dirTo; ai.moveT = 0.3; }
        acted = true;
      } else if (o.state === 'getup' && o.t >= C.GETUP_T * 0.4 && dist >= T.lo - 10 && dist <= maxReach + 5) {
        const limb = dist > S.pr + 8 ? 'kick' : 'punch';
        ai.plan = { key: limb, phase: 'charge', el: 0, hold: 0.1, taps: 1, aim: aimAt(m, f, o, limb, 'body'), name: 'wake-up' }; ai.hist.unshift('wake-up'); ai.hist.length = Math.min(3, ai.hist.length); acted = true;
      } else if (grabOK && m.rng.next() < Math.min(0.9, T.grab * ai.mood * (o.state === 'guard' ? 4 : 1) * (ai.tactic === 'grapple' ? 3 : 1))) {
        inp.grab = true; acted = true;
      } else if (ai.tactic === 'air' && !f.air && f.sta > 35 && dist > 100 && dist < 190) {
        ai.jumpT = 0.3; ai.airT = 0.9; acted = true;
      } else if (ai.tactic !== 'defend' && (ai.tactic !== 'bait' || punish) && (punish || m.rng.next() < (ai.tactic === 'zone' ? 0.5 : 0.85))) {
        const ml = moves(m, f, o, ai, { tactic: ai.tactic, punish: punish, dist: dist });
        const c = pickW(m.rng, ml);
        if (c.w > 0.05 * T.press) { ai.plan = c.plan; ai.hist.unshift(c.name); ai.hist.length = Math.min(3, ai.hist.length); if (punish) ai.cool = 0.05; acted = true; }
      }
      if (!ai.plan && !inp.grab && !acted) {
        if (dist > want + 14) { ai.moveDir = dirTo; ai.moveT = 0.45; if (dist > want + 90 && f.sta > 45) ai.sprintT = 0.45; }
        else if (dist < want - 14 && !cornered && ai.tactic !== 'grapple') { ai.moveDir = -dirTo; ai.moveT = 0.35; }
        else if (m.rng.next() < 0.3) { ai.moveDir = m.rng.next() < 0.5 ? dirTo : -dirTo; ai.moveT = 0.12 + m.rng.next() * 0.12; }
      }
    }
    /* sequences: decide once per sequence how many more moves to throw, then press the key in the cancel window */
    if (st === 'strike' && f.chain && f.chain.names.length === 1 && ai.lastStr !== f.str) {
      ai.lastStr = f.str;
      let n = 0;
      if (m.rng.next() < Math.min(0.8, (0.3 + 0.3 * A.press) * L.seq)) n = 1 + (m.rng.next() < 0.5 ? 1 : 0) + (m.rng.next() < 0.25 ? 1 : 0);
      const main = S.name === 'Kicker' ? 'kick' : 'punch', other = main === 'kick' ? 'punch' : 'kick';
      ai.seq = { left: n, i: 0, keys: [0, 1, 2].map(function (j) { return (j === 2 && m.rng.next() < 0.35) ? other : main; }) };
    }
    if (st === 'recover' && f.cancelOpen && ai.seq && ai.seq.left > 0 && dist <= maxReach + 25 && o.state !== 'down' && o.state !== 'flipped' && !(o.protect > 0 && o.budget <= 1)) {
      inp[ai.seq.keys[ai.seq.i]] = true; ai.seq.i++; ai.seq.left--;
    }
    if (st === 'idle') ai.seq = null;
    if (ai.tactic === 'defend' && !ai.plan && dist < 220) inp.block = true;
    if (ai.moveT > 0 && !ai.plan && ai.moveDir) {
      /* tap the direction key to sprint when far away */
      const on = ai.sprintT > 0 ? (ai.tapPh % 0.2) < 0.1 : true;
      if (ai.moveDir > 0) inp.right = on; else inp.left = on;
    }
    if (ai.jumpT > 0) inp.jump = true;
    // guard/attack aim: steer the shared aim value toward the wanted angle
    const wantAim = (ai.plan || inp.block) ? (ai.guardAim === undefined ? 0 : ai.guardAim) : 0;
    if (f.aim < wantAim - 3) inp.aimUp = true; else if (f.aim > wantAim + 3) inp.aimDown = true;
    /* a box in the way: jump and keep walking, which climbs on it (OBS-06) */
    const walk = (inp.right ? 1 : 0) - (inp.left ? 1 : 0);
    if (walk && m.obstacles.length && !f.air && SF.blockedAhead(m, f, walk)) inp.jump = true;
    /* hard AIs boost when they are about to attack with stamina to spare (BOOST-04); no random numbers, so the other levels are untouched */
    if (m.levels && m.levels[i] === 2 && f.boostCD <= 0 && f.sta >= 60 && ai.plan && dist <= maxReach + 40) inp.boost = true;
    return inp;
  };
})();

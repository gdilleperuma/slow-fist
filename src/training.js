/* Trainer mode, as data and rules: the practice dummy and the drills. Pure: no DOM. menu.js shows it, main.js feeds it the match events.
   Drills are built from the same tables as the simulation (CFG.MOVES, CFG.CHAIN), so a style always practises its own moves and sequences. */
var SF = (typeof SF === 'undefined') ? {} : SF;
(function () {
  'use strict';
  const C = SF.CFG;

  /* ---------- the dummy ---------- */
  /* still and block are scripted inputs; attack and ai are the normal AI (attack: the easiest level) */
  SF.dummyInput = function (kind) {
    if (kind === 'still' || kind === 'fixed') return {};
    if (kind === 'block') return { block: true };
    return null;
  };
  SF.setDummy = function (m, kind) {
    const ai = kind === 'attack' || kind === 'ai';
    m.aiFlags[1] = ai;
    m.levels[1] = kind === 'attack' ? 0 : 1;
    m.f[1].fixed = kind === 'fixed'; m.f[1].fx = m.f[1].x;   /* the tutorial dummy: it stays where it is and does not react */
  };

  /* ---------- drills ---------- */
  function hit(id, title, move, how) { return { id: id, title: title, hitMove: move, target: 3, dummy: 'still', how: how || move }; }
  SF.trainingDrills = function (styleIndex) {
    const style = C.STYLES[styleIndex || 0], graph = C.CHAIN[style.name] || {}, help = SF.helpModel(styleIndex || 0);
    const hint = function (move) { const r = help.moves.find(function (x) { return x.name === move; }); return r ? { keyboard: r.keyboard, touch: r.touch } : { keyboard: '', touch: '' }; };
    const heavyKick = style.name === 'Kicker' ? 'SPINNING KICK' : 'AXE KICK';
    const list = [
      ['jab', 'Land a JAB', 'JAB'], ['cross', 'Land a CROSS', 'CROSS'], ['hook', 'Land a HOOK', 'HOOK'], ['uppercut', 'Land an UPPERCUT', 'UPPERCUT'],
      ['overhand', 'Land an OVERHAND', 'OVERHAND'], ['heavypunch', 'Land a SPINNING BACKFIST', 'SPINNING BACKFIST'],
      ['frontkick', 'Land a FRONT KICK', 'FRONT KICK'], ['roundhouse', 'Land a ROUNDHOUSE', 'ROUNDHOUSE'], ['lowkick', 'Land a LOW KICK', 'LOW KICK'],
      ['lowsweep', 'Land a LOW SWEEP', 'LOW SWEEP'], ['risingkick', 'Land a RISING KICK', 'RISING KICK'], ['heavykick', 'Land ' + (heavyKick === 'AXE KICK' ? 'an ' : 'a ') + heavyKick, heavyKick],
      ['superman', 'Land a SUPERMAN PUNCH (jump first)', 'SUPERMAN PUNCH'], ['flyingkick', 'Land a FLYING SIDE KICK (jump first)', 'FLYING SIDE KICK'],
      ['butterfly', 'Land a BUTTERFLY KICK (jump, aim up)', 'BUTTERFLY KICK'], ['tornado', 'Land a TORNADO KICK (jump, hold the kick)', 'TORNADO KICK']
    ].map(function (r) { const d = hit(r[0], r[1], r[2]); const h = hint(r[2]); d.hint = h; return d; });
    /* a sequence of three moves from this style's graph, following punches where it can */
    const start = Object.keys(graph)[0], chain = [start];
    while (chain.length < 3) { const e = graph[chain[chain.length - 1]]; if (!e) break; chain.push(e.punch || e.kick); }
    list.push({ id: 'sequence', title: 'Throw a sequence: ' + chain.join(' > '), chain: chain, target: 1, dummy: 'still', hint: { keyboard: 'press punch or kick again at the end of each move', touch: 'draw the next stroke at the end of each move' } });
    list.push({ id: 'block', title: 'BLOCK three attacks', target: 3, dummy: 'attack', hint: { keyboard: 'hold H (aim with Q / E) as the strike arrives', touch: 'hold BLOCK as the strike arrives' } });
    list.push({ id: 'parry', title: 'PARRY an attack (block just before it lands)', target: 1, dummy: 'attack', hint: { keyboard: 'press H a moment before the hit, aimed at it', touch: 'tap BLOCK a moment before the hit' } });
    list.push({ id: 'dodge', title: 'DODGE an attack with a dash', target: 1, dummy: 'attack', hint: { keyboard: 'press C as the strike comes', touch: 'flick the move circle sideways as the strike comes' } });
    list.push({ id: 'grapple', title: 'GRAPPLE and throw the dummy twice', target: 2, dummy: 'still', hint: { keyboard: 'get close, press Z', touch: 'draw straight back in a circle, close up' } });
    list.push({ id: 'boost', title: 'Use BOOST', target: 1, dummy: 'still', hint: { keyboard: 'press X', touch: 'tap BOOST' } });
    list.push({ id: 'recover', title: 'GET UP on purpose twice (move circle while down)', target: 2, dummy: 'attack', hint: { keyboard: 'when you are down: W kip-up, D roll forward, A roll back, S stay and guard', touch: 'when you are down: move circle up / right / left / down' } });
    list.push({ id: 'breakfall', title: 'BREAK a fall (tap just as you land)', target: 1, dummy: 'attack', hint: { keyboard: 'tap a direction just as you land, or at the end of a throw', touch: 'tap the move circle just as you land' } });
    list.push({ id: 'turn', title: 'TURN around', target: 1, dummy: 'still', hint: { keyboard: 'press U', touch: 'tap TURN' } });
    return list;
  };

  SF.trainingNew = function (styleIndex) { return { style: styleIndex || 0, idx: 0, counts: {}, done: {}, skipped: {}, finished: false }; };
  function refresh(t, drills) {
    let i = drills.findIndex(function (d) { return !t.done[d.id] && !t.skipped[d.id]; });
    t.finished = i < 0; t.idx = i < 0 ? drills.length - 1 : i;
  }
  SF.trainingCurrent = function (t) { return SF.trainingDrills(t.style)[t.idx]; };
  SF.trainingSkip = function (t) { const d = SF.trainingDrills(t.style); if (!t.finished) t.skipped[d[t.idx].id] = true; refresh(t, d); };
  SF.trainingReset = function (t) { t.counts = {}; t.done = {}; t.skipped = {}; refresh(t, SF.trainingDrills(t.style)); };

  /* count what happened in this step (m.ev) toward every drill; the trainee is fighter 0 */
  SF.trainingFeed = function (t, m) {
    const drills = SF.trainingDrills(t.style), newly = [];
    const add = function (d) { if (t.done[d.id]) return; t.counts[d.id] = (t.counts[d.id] || 0) + 1; if (t.counts[d.id] >= d.target) { t.done[d.id] = true; newly.push(d.id); } };
    for (const e of m.ev || []) for (const d of drills) {
      if (d.hitMove) { if (e.k === 'hit' && e.a === 0 && e.tag === 'HIT' && e.name === d.hitMove) add(d); }
      else if (d.chain) { if (e.k === 'chain' && e.a === 0 && e.names && e.names.length >= d.chain.length && d.chain.every(function (n, i) { return e.names[i] === n; })) add(d); }
      else if (d.id === 'block') { if (e.k === 'hit' && e.d === 0 && e.a !== 0 && (e.tag === 'BLOCK' || e.tag === 'PARTIAL' || e.tag === 'PARRY')) add(d); }
      else if (d.id === 'parry') { if (e.k === 'hit' && e.d === 0 && e.a !== 0 && e.tag === 'PARRY') add(d); }
      else if (d.id === 'dodge') { if (e.k === 'dodge' && e.d === 0) add(d); }
      else if (d.id === 'grapple') { if (e.k === 'throw' && e.a === 0) add(d); }
      else if (d.id === 'boost') { if (e.k === 'boost' && e.a === 0) add(d); }
      else if (d.id === 'turn') { if (e.k === 'turn' && e.a === 0) add(d); }
      else if (d.id === 'recover') { if (e.k === 'recover' && e.a === 0) add(d); }
      else if (d.id === 'breakfall') { if (e.k === 'techfall' && e.d === 0) add(d); }
    }
    refresh(t, drills);
    return newly;
  };
})();

'use strict';
// STA-01: a fighter who is down or getting up recovers stamina at half rate. Registered into tests/run.js.
module.exports = function (X) {
  const { test, ok, near, SF, C, NONE } = X;
  function gainOver(state, steps) {
    const m = SF.createMatch({ seed: 1, styles: [0, 0], ai: [false, false] });
    const f = m.f[0];
    f.x = 200; m.f[1].x = 700;
    f.state = state; f.t = 0; f.stagDur = 99; f.sta = 20;
    for (let i = 0; i < steps; i++) { f.state = state; f.t = 0; SF.step(m, [NONE, NONE]); }
    return f.sta - 20;
  }
  test('STA-01', 'stamina recovers at half rate while down or getting up, and not while being carried', () => {
    const idle = gainOver('idle', 60), down = gainOver('down', 60), getup = gainOver('getup', 60);
    ok(idle > 5, 'idle recovers: ' + idle.toFixed(2));
    ok(down > 0, 'down recovers: ' + down.toFixed(2));
    near(down, idle * 0.5, 0.05 * idle, 'down recovers at half the idle rate');
    near(getup, idle * 0.5, 0.05 * idle, 'getting up recovers at half the idle rate');
    ok(gainOver('flipped', 60) === 0, 'no recovery while carried in a throw');
    ok(gainOver('stagger', 60) === 0, 'no recovery while staggering');
  });
};

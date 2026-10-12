// A player who tries settings each morning and keeps the one with the best "if you keep these" forecast.
const E = require('./engine.js');
function run(seed, mode) {
  const S = E.makeSeason(seed), you = { P: E.newPlant(), T: E.newTwin() }, bot = { P: E.newPlant(), T: E.newTwin(), plan: null };
  let ctrl = { led: 0, shade: false, n: 60, pk: 50 };
  for (let d = E.DAY0; d < E.DAY1; d++) {
    const sun = S.sun[d], price = S.price[d];
    if (mode === 'greedy') {
      let best = -1e9;
      for (const led of [0, 50, 100, 150, 200]) for (const n of [0, 20, 40, 60, 80]) for (const pk of [40, 70, 100]) for (const shade of [false, true]) {
        const c = { led, shade, n, pk }, v = E.forecast(you.T, S, () => c, d).value;
        if (v > best) { best = v; ctrl = c; }
      }
    }
    E.twinPredict(you.T, ctrl, sun, price); E.step(you.P, ctrl, sun, price, S.vigor, S.noise[d]);
    if (E.isSenseDay(you.P.d)) E.twinUpdate(you.T, you.P.bio * (1 + 0.05 * S.mnoise[d]));
    bot.plan = E.autopilotPlan(bot.T.nom, S, d, bot.plan).plan; const bc = E.planCtrl(bot.plan, d, sun);
    E.twinPredict(bot.T, bc, sun, price); E.step(bot.P, bc, sun, price, S.vigor, S.noise[d]);
    if (E.isSenseDay(bot.P.d)) E.twinUpdate(bot.T, bot.P.bio * (1 + 0.05 * S.mnoise[d]));
  }
  return [E.valueOf(you.P), E.valueOf(bot.P)];
}
const rs = [1, 2, 3, 4, 5, 6, 7, 8].map(s => run(20261000 + s, 'greedy'));
console.log(rs.map(([a, b]) => `${a.toFixed(0)}/${b.toFixed(0)}=${(a / b).toFixed(2)}`).join('  '));

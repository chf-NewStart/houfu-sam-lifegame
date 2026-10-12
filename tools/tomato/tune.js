// Plays many seasons with different strategies and prints the score spread.
const E = require('./engine.js');

function play(seed, policy) {
  const S = E.makeSeason(seed), P = E.newPlant(), T = E.newTwin();
  let plan = null, log = [];
  for (let d = E.DAY0; d < E.DAY1; d++) {
    const sun = S.sun[d], price = S.price[d];
    let ctrl;
    if (policy === 'auto') { const r = E.autopilotPlan(T.nom, S, d, plan); plan = r.plan; ctrl = E.planCtrl(plan, d, sun); }
    else ctrl = policy(d, sun, price, P);
    E.twinPredict(T, ctrl, sun, price);
    const f = E.step(P, ctrl, sun, price, S.vigor, S.noise[d]);
    if (E.isSenseDay(P.d)) E.twinUpdate(T, P.bio * (1 + 0.05 * S.mnoise[d]));
    log.push({ d, ctrl, g: P.g, lim: f.limit });
  }
  return { grams: E.gramsOf(P.bio), brix: E.brixOf(P), cost: P.cost, kwh: P.kwh, value: E.valueOf(P), twin: E.gramsOf(T.s), sd: E.gramsOf(E.twinSigma(T)), vigor: S.vigor, vest: T.v, plan, log, P };
}

const policies = {
  idle: () => ({ led: 0, n: 50, pk: 50 }),
  oldDefault: () => ({ led: 60, n: 50, pk: 50 }),
  maxAll: () => ({ led: 300, n: 100, pk: 100 }),
  ledMax: () => ({ led: 300, n: 50, pk: 50 }),
  noLedSmart: (d) => d <= 15 ? { led: 0, n: 70, pk: 40 } : d <= 35 ? { led: 0, n: 45, pk: 55 } : { led: 0, n: 10, pk: 80 },
  salty: (d) => d <= 15 ? { led: 100, n: 70, pk: 40 } : d <= 35 ? { led: 120, n: 50, pk: 60 } : { led: 0, n: 40, pk: 100 },
  topUpSmart: (d, sun) => { const T = d <= 15 ? 300 : d <= 35 ? 330 : 320; const led = Math.max(0, Math.min(300, T - sun)); return d <= 15 ? { led, n: 70, pk: 40 } : d <= 35 ? { led, n: 45, pk: 55 } : { led, n: 10, pk: 80 }; },
  fixedLedSmart: (d) => d <= 15 ? { led: 150, n: 70, pk: 40 } : d <= 35 ? { led: 150, n: 45, pk: 55 } : { led: 150, n: 10, pk: 80 },
  reactive: (d, sun, price) => d <= 15 ? { led: 0, n: 80, pk: 50 } : d <= 35 ? { led: price > 1 ? 0 : sun < 140 ? 160 : sun < 200 ? 80 : 0, n: 50, pk: 75 } : { led: 0, n: 0, pk: 100, shade: sun > 380 },
  reactive2: (d, sun, price) => d <= 15 ? { led: 0, n: 80, pk: 50 } : d <= 35 ? { led: price > 1 ? 0 : Math.max(0, 300 - sun), n: 50, pk: 75 } : { led: 0, n: 0, pk: 100, shade: sun > 380 },
  expert: (d, sun, price) => d <= 15 ? { led: price > 1 ? 0 : sun < 130 ? 120 : 0, n: 75, pk: 55 } : d <= 35 ? { led: price > 1 ? 0 : Math.max(0, Math.min(200, 220 - sun)), n: 45, pk: 85 } : { led: 0, n: 0, pk: 100, shade: sun > 380 },
  random: () => ({ led: Math.round(Math.random() * 60) * 5, n: Math.round(Math.random() * 100), pk: Math.round(Math.random() * 100) }),
};
const seeds = [20261012, 20261013, 20261014, 20261015, 20261016, 20261017, 7, 99, 12345, 4242];
const fmt = r => `${r.grams.toFixed(0)}g ${r.brix.toFixed(1)}Bx cost ${r.cost.toFixed(0)} (${r.kwh.toFixed(0)}kWh) value ${r.value.toFixed(0)}`;
const autoV = seeds.map(s => play(s, 'auto').value);
for (const [name, pol] of [...Object.entries(policies), ['auto', 'auto']]) {
  const t0 = Date.now();
  const rs = seeds.map(s => play(s, pol));
  const vals = rs.map(r => r.value);
  const ratio = rs.map((r, i) => r.value / autoV[i]);
  console.log(name.padEnd(13), 'vsAuto', (ratio.reduce((a, b) => a + b) / ratio.length).toFixed(2), Math.min(...ratio).toFixed(2), Math.max(...ratio).toFixed(2), 'mean', (vals.reduce((a, b) => a + b) / vals.length).toFixed(0), 'min', Math.min(...vals).toFixed(0), 'max', Math.max(...vals).toFixed(0), '|', fmt(rs[0]), `${Date.now() - t0}ms`);
}
const a = play(20261012, 'auto');
console.log('auto plan', JSON.stringify(a.plan), 'vigor', a.vigor.toFixed(3), 'est', a.vest.toFixed(3), 'twin', a.twin.toFixed(1), '±', a.sd.toFixed(1), 'true', a.grams.toFixed(1));
console.log(a.log.map(l => `${l.d}:${l.ctrl.led}/${l.ctrl.n}/${l.ctrl.pk}${l.lim[0]}`).join(' '));
// growth trace for one decent strategy
{ const S = E.makeSeason(20261012), P = E.newPlant(); let line = [];
  for (let d = E.DAY0; d < E.DAY1; d++) { const c = policies.topUpSmart(d, S.sun[d]); const f = E.step(P, c, S.sun[d], S.price[d], 1, 0);
    line.push(`${d}:${P.bio.toFixed(0)}g ${f.limit[0]} C${f.C.toFixed(1)} N${f.N.toFixed(2)} dem${(f.demand||0).toFixed(1)} s${f.suc.toFixed(1)} n${f.n.toFixed(1)} fr${P.frame.toFixed(2)}`); }
  console.log(line.join('\n')); console.log('brix', E.brixOf(P).toFixed(2), 'sugar', P.sugar.toFixed(2), 'starch', P.starch.toFixed(2), 'lyc', P.lyc.toFixed(2)); }

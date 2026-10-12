/* ════════════════════════════════════════════════════════════
   Grow a Tomato — engine (pure, seeded, no DOM)
   A toy crop model built from textbook plant physiology:
   · leaves are the SOURCE: light → sugar (saturating, photoinhibited when too bright)
   · roots take up nitrogen (Michaelis–Menten); P·K helps unloading; too much feed → salty root zone
   · the fruit is the SINK: sink strength = size × activity (Gompertz), and the scarcer of
     carbon or nitrogen sets growth (the binding constraint)
   · stages: build a frame → bank starch → turn starch into sugar
   A "twin" runs the same model without seeing the real plant; a camera measures the fruit
   every few days and a Kalman filter corrects the twin (size + this plant's vigour).
   ════════════════════════════════════════════════════════════ */
const DAY0 = 8, DAY1 = 53, NDAYS = DAY1 - DAY0;   // days after flowering; harvest on DAY1
const SUN_CLIM = 160;                              // average sunlight the twin assumes beyond the forecast
const FORECAST_DAYS = 5;                           // the weather forecast reaches this far ahead
const LED_MAX = 300, LED_KWH = 0.00533;            // kWh per m² per day, per µmol/m²/s of LED (16 h at ~3 µmol/J)
const KWH_PRICE = 1.0;                             // points per kWh at normal price
const GRAMS = 1;                                   // the model works in fresh grams
const SENSE_EVERY = 4, SENSE_FROM = 12;            // camera reading every 4 days from day 12

const stageOf = d => d <= 15 ? 0 : d <= 35 ? 1 : 2;   // 0 frame · 1 fill (starch) · 2 ripen (sugar)
const isSenseDay = d => d >= SENSE_FROM && (d - SENSE_FROM) % SENSE_EVERY === 0;

function mulberry(seed) { return function () { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

// One season of weather, prices and hidden plant traits, all from one seed: the
// player and the autopilot face exactly the same season.
function makeSeason(seed) {
  const r = mulberry(seed), gauss = () => { let u = 0, v = 0; while (!u) u = r(); while (!v) v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
  const sun = [], price = [], noise = [], mnoise = [], events = [];
  let x = 0;
  for (let d = 0; d <= DAY1 + 1; d++) { x = 0.55 * x + gauss() * 48; sun[d] = Math.round(Math.max(70, Math.min(330, SUN_CLIM + x))); price[d] = 1; noise[d] = gauss(); mnoise[d] = gauss(); }
  const spell = (from, to, len, lo, hi, type) => {
    const s = from + Math.floor(r() * (to - from));
    for (let d = s; d < s + len; d++) sun[d] = Math.round(lo + r() * (hi - lo));
    events.push({ type, day: s, len });
  };
  spell(17, 26, 4 + Math.floor(r() * 2), 45, 85, 'cloud');        // a dull week while the fruit fills
  spell(37, 46, 3, 350, 420, 'bright');                           // a scorcher while it ripens
  if (r() < 0.6) spell(9, 14, 2 + Math.floor(r() * 2), 50, 90, 'cloud');
  const ps = 20 + Math.floor(r() * 18);                           // an electricity price spike
  for (let d = ps; d < ps + 3; d++) price[d] = 3;
  events.push({ type: 'price', day: ps, len: 3 });
  events.sort((a, b) => a.day - b.day);
  return { seed, sun, price, noise, mnoise, events, vigor: 0.86 + 0.28 * r() };
}

function newPlant() {
  return { d: DAY0, suc: 2, n: 0.6, bio: 1, frame: 0, starch: 0, sugar: 0, lyc: 0, saltSum: 0, ripeDays: 0,
    kwh: 0, cost: 0, wasteKwh: 0, spikeKwh: 0, ripeN: 0, saltDays: 0, inhibDays: 0, sinkDays: 0, nDays: 0, cDays: 0, ripeBio: null, g: 0, lastFlux: null };
}
const clonePlant = P => Object.assign({}, P, { lastFlux: null });

const CFG = {
  Cmax: 18, upkeep: 3.5, Lhalf: 250, Lopt: 380, LinhibScale: 450, inhibMax: 0.5,   // leaves: light → sugar
  Nmax: 1.5, Nhalf: 40,                                                // roots: feed → nitrogen
  sucCap: 6, nCap: 3,                                                  // what the stem and leaves can hold
  Gmax: 10,                                                            // fruit: peak growth g/day at full size
  frameRate: 0.14, frameC: 20, frameN: 6,                              // early cell division (sets fruit size)
  ecThresh: 1.3, saltRate: 0.6, saltMax: 0.45,                         // root-zone salinity
  shade: 0.55,                                                         // a closed shade screen lets this much sun through
};
const COST = [null, { c: 1.0, n: 0.10 }, { c: 1.0, n: 0.04 }];        // sugar and nitrogen per gram of fruit
function sinkActivity(d) { const wmax = 100, k = 0.15, tm = 25; const W = wmax * Math.exp(-Math.exp(-k * (d - tm)));
  const dem = (W > 0 && W < wmax) ? k * W * Math.log(wmax / W) : 0; return Math.min(1, dem / ((wmax * k) / Math.E)); }
const sinkSize = P => 0.2 + 0.85 * P.frame;                           // more cells → a bigger fruit can fill
const lightOf = (ctrl, sun) => sun * (ctrl.shade ? CFG.shade : 1) + ctrl.led;

// One day of the plant: pure, so the UI can preview "what is holding it back" live.
// ctrl = {led (µmol/m²/s), shade (bool), n (%), pk (%)}; sun = natural light this day.
function flux(P, ctrl, sun, vigor = 1) {
  const st = stageOf(P.d), light = lightOf(ctrl, sun);
  const nFeed = ctrl.n / 100, pk = ctrl.pk / 100;
  const ec = nFeed + pk;
  const saltStress = Math.min(CFG.saltMax, Math.max(0, ec - CFG.ecThresh) * CFG.saltRate);
  const fbSuc = 1 - 0.6 * Math.max(0, P.suc / CFG.sucCap - 0.5) * 2;  // full sugar store → leaves slow down
  const satL = light / (light + CFG.Lhalf);
  const photoinhib = Math.min(CFG.inhibMax, Math.max(0, light - CFG.Lopt) / CFG.LinhibScale);
  const made = CFG.Cmax * satL * (1 - photoinhib) * Math.max(0.4, fbSuc) * (1 - 0.5 * saltStress) * vigor;
  const C = made - CFG.upkeep;                                           // leaves, roots and the other fruit eat first
  const N = CFG.Nmax * ctrl.n / (ctrl.n + CFG.Nhalf) * vigor;
  const mineralF = 0.6 + 0.4 * pk;
  const suc = Math.max(0, Math.min(P.suc + C, CFG.sucCap)), n = Math.min(P.n + N, CFG.nCap);
  const out = { st, light, satL, photoinhib, made, C, N, pk, nFeed, ec, saltStress, mineralF, suc, n, frameG: 0 };
  // early on, the fruit is dividing cells: nitrogen- and sugar-hungry, and it sets how big the fruit can get
  if (st === 0) {
    const want = CFG.frameRate, byC = suc / CFG.frameC, byN = n / CFG.frameN;
    out.frameG = Math.max(0, Math.min(want, byC, byN)) * mineralF * (1 - saltStress);
    out.limit = want <= Math.min(byC, byN) ? 'sink' : byC <= byN ? 'carbon' : 'nitrogen';
    out.demand = 0.6 * CFG.Gmax * vigor * sinkSize(P) * sinkActivity(P.d);
    out.growth = Math.min(out.demand, Math.max(0, suc - out.frameG * CFG.frameC)) * mineralF * (1 - saltStress);
    return out;
  }
  const k = COST[st], demand = CFG.Gmax * vigor * sinkSize(P) * sinkActivity(P.d);
  const byC = suc / k.c, byN = n / k.n;
  out.demand = demand;
  out.growth = Math.max(0, Math.min(demand, byC, byN)) * mineralF * (1 - saltStress);
  out.limit = demand <= Math.min(byC, byN) ? 'sink' : byC <= byN ? 'carbon' : 'nitrogen';
  out.cCost = k.c; out.nCost = k.n;
  return out;
}

function step(P, ctrl, sun, price, vigor = 1, noise = 0) {
  const f = flux(P, ctrl, sun, vigor), st = f.st;
  const g = f.growth * Math.max(0.5, 1 + 0.10 * noise);
  if (st === 2 && P.ripeBio == null) P.ripeBio = P.bio;
  if (st === 0) {
    P.frame += f.frameG;
    P.suc = Math.max(0, f.suc - f.frameG * CFG.frameC - g);
    P.n = Math.max(0, f.n - f.frameG * CFG.frameN);
  } else {
    P.suc = Math.max(0, f.suc - g * f.cCost);
    P.n = Math.max(0, f.n - g * f.nCost);
  }
  if (st === 1) P.starch += g * 0.08;
  if (st === 2) {
    P.sugar += g * 0.06 * (1 - 0.6 * f.nFeed);                    // extra nitrogen while ripening = watery fruit
    P.lyc += g * 0.02 * (1 - 0.4 * f.nFeed) + 0.04 * f.satL;
    P.saltSum += f.saltStress; P.ripeDays++; P.ripeN += f.nFeed;
    if (P.starch > 1e-6) {
      const conv = P.starch * 0.13 * (0.35 + 0.65 * f.satL) * (0.6 + 0.4 * f.pk);   // light and potassium drive starch → sugar
      P.starch -= conv; P.sugar += conv;
    }
  }
  if (f.saltStress > 0.05) P.saltDays++;
  if (f.photoinhib > 0.05) P.inhibDays++;
  if (st > 0) { if (f.limit === 'sink') P.sinkDays++; else if (f.limit === 'nitrogen') P.nDays++; else P.cDays++; }
  const kwh = ctrl.led * LED_KWH;
  P.kwh += kwh; P.cost += kwh * price * KWH_PRICE;
  if (f.limit === 'sink') P.wasteKwh += kwh;
  if (price > 1) P.spikeKwh += kwh;
  P.bio += g; P.g = g; P.d++; P.lastFlux = f;
  return f;
}

const sugarFrac = P => P.sugar / (P.sugar + P.starch + 1e-9);
// Soluble solids: converted sugar per gram of fruit, plus a little from salt stress (salty water → small, sweet fruit)
const brixOf = P => { const conc = (P.sugar + P.starch * 0.25) / Math.max(1, P.bio) * 100; const salt = P.ripeDays ? P.saltSum / P.ripeDays : 0;
  return Math.min(12, 2.5 + conc * 0.9 * (0.3 + 0.7 * sugarFrac(P)) + 6 * salt); };
const gramsOf = bio => bio * GRAMS;
const quality = brix => 0.35 + 0.13 * brix;                  // 5 °Brix ≈ 1.0×, 9 °Brix ≈ 1.5×
// Harvest value: heavy AND sweet, minus the electricity the grow lights burned.
function valueOf(P, bio = P.bio) { return gramsOf(bio) * quality(brixOf(P)) - P.cost; }

// ── the twin: model + Kalman filter on [fruit size, plant vigour] ──
function newTwin() { const nom = newPlant(); return { nom, s: nom.bio, v: 1, P: [[1e-4, 0], [0, 0.0081]], obs: null }; }
const Q_REL = 0.10;
function twinPredict(T, ctrl, sun, price) {
  const f = step(T.nom, ctrl, sun, price, 1, 0), g = T.nom.g;
  const [[a, b], [c, d]] = T.P, q = (Q_REL * g * T.v) ** 2;
  // F = [[1, g], [0, 1]]: size grows by vigour × the model's growth
  T.s += T.v * g;
  T.P = [[a + g * (b + c) + g * g * d + q, b + g * d], [c + g * d, d + 1e-6]];
  T.obs = null;
  return f;
}
function twinUpdate(T, z) {
  const R = (0.05 * z) ** 2 + 0.01, [[a, b], [c, d]] = T.P, S = a + R;
  const k0 = a / S, k1 = c / S, y = z - T.s;
  T.s += k0 * y; T.v = Math.max(0.6, Math.min(1.4, T.v + k1 * y));
  T.P = [[(1 - k0) * a, (1 - k0) * b], [c - k1 * a, d - k1 * b]];
  T.obs = z;
}
const twinSigma = T => Math.sqrt(Math.max(0, T.P[0][0]));

// What the twin expects if these settings are kept to harvest: per-day size, spread and sweetness.
function forecast(T, season, ctrlFn, fromDay) {
  const P = clonePlant(T.nom), out = [];
  let s = T.s, G = 0, qsum = 0;
  for (let d = fromDay; d < DAY1; d++) {
    const known = d < fromDay + FORECAST_DAYS;
    const sun = known ? season.sun[d] : SUN_CLIM, price = known ? season.price[d] : 1;
    step(P, ctrlFn(d, sun), sun, price, 1, 0);
    G += P.g; qsum += (Q_REL * P.g * T.v) ** 2;
    const [[a, b], [, dd]] = T.P;
    out.push({ d: d + 1, s: s + T.v * G, sd: Math.sqrt(Math.max(0, a + 2 * G * b + G * G * dd + qsum)), brix: brixOf(P), cost: P.cost });
  }
  const last = out[out.length - 1] || { s, brix: brixOf(T.nom), cost: T.nom.cost };
  return { path: out, s: last.s, brix: last.brix, cost: last.cost, value: gramsOf(last.s) * quality(last.brix) - last.cost };
}

// ── the autopilot: receding-horizon planning with its own twin ──
// Plan = per remaining stage {target total light, N %, P·K %}; lamps top up the sun to the target.
const planCtrl = (plan, d, sun) => { const p = plan[stageOf(d)], shade = sun > p.T && Math.abs(sun * CFG.shade - p.T) < sun - p.T;
  return { led: shade ? 0 : Math.max(0, Math.min(LED_MAX, Math.round((p.T - sun) / 5) * 5)), shade, n: p.n, pk: p.pk }; };
function evalPlan(nom, plan, season, fromDay) {
  const P = clonePlant(nom);
  for (let d = fromDay; d < DAY1; d++) {
    const known = d < fromDay + FORECAST_DAYS;
    const sun = known ? season.sun[d] : SUN_CLIM, price = known ? season.price[d] : 1;
    step(P, planCtrl(plan, d, sun), sun, price, 1, 0);
  }
  return valueOf(P);
}
const PLAN0 = [{ T: 300, n: 70, pk: 40 }, { T: 330, n: 45, pk: 55 }, { T: 320, n: 10, pk: 80 }];
const PSTEP = { T: 20, n: 5, pk: 5 }, PMAX = { T: 600, n: 100, pk: 100 }, PMIN = { T: 60, n: 0, pk: 0 };
function autopilotPlan(nom, season, fromDay, prev) {
  const plan = (prev || PLAN0).map(p => Object.assign({}, p));
  let best = evalPlan(nom, plan, season, fromDay);
  for (let sweep = 0; sweep < 4; sweep++) {
    let moved = false;
    for (let s = stageOf(fromDay); s < 3; s++) for (const k of ['T', 'n', 'pk']) for (const dir of [1, -1]) {
      for (let mult = 2; mult >= 1; mult--) {
        const old = plan[s][k], nv = Math.max(PMIN[k], Math.min(PMAX[k], old + dir * PSTEP[k] * mult));
        if (nv === old) continue;
        plan[s][k] = nv;
        const v = evalPlan(nom, plan, season, fromDay);
        if (v > best + 1e-6) { best = v; moved = true; break; } else plan[s][k] = old;
      }
    }
    if (!moved) break;
  }
  return { plan, value: best };
}

if (typeof module !== 'undefined') module.exports = { DAY0, DAY1, NDAYS, SUN_CLIM, FORECAST_DAYS, LED_MAX, makeSeason, newPlant, clonePlant, flux, step, brixOf, gramsOf, quality, valueOf, newTwin, twinPredict, twinUpdate, twinSigma, forecast, planCtrl, evalPlan, autopilotPlan, stageOf, isSenseDay, sugarFrac };

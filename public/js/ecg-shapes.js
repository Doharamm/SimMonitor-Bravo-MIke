// Perfis originais inspirados visualmente nos comparativos fornecidos.
// Segundos e unidades relativas (não declarar mV sem calibrar o renderer).
// Interpolação Hermite monotônica: sem overshoot entre pontos de controle.
export function shape(points, fiducial = .020) {
  const p = points.map(([x, y]) => [x, y]);
  for (let i = 0; i < p.length; i++) {
    if (!p[i].every(Number.isFinite) || (i && p[i][0] <= p[i - 1][0])) throw new Error('Perfil ECG inválido');
  }
  if (p.length < 2) throw new Error('Perfil ECG incompleto');
  const slopes = p.slice(1).map((v, i) => (v[1] - p[i][1]) / (v[0] - p[i][0]));
  const tangent = p.map((_, i) => {
    if (!i || i === p.length - 1) return 0;
    const a = slopes[i - 1], b = slopes[i];
    if (a * b <= 0) return 0;
    const h0 = p[i][0] - p[i - 1][0], h1 = p[i + 1][0] - p[i][0];
    const w1 = 2 * h1 + h0, w2 = h1 + 2 * h0;
    return (w1 + w2) / (w1 / a + w2 / b);
  });
  return {
    start: p[0][0], end: p.at(-1)[0], points: p, fiducial,
    sample(t) {
      if (t < p[0][0] || t > p.at(-1)[0]) return 0;
      let lo = 0, hi = p.length - 1;
      while (hi - lo > 1) { const m = (lo + hi) >> 1; if (p[m][0] <= t) lo = m; else hi = m; }
      const h = p[hi][0] - p[lo][0], u = (t - p[lo][0]) / h;
      return (2*u*u*u - 3*u*u + 1)*p[lo][1] + (u*u*u - 2*u*u + u)*h*tangent[lo]
        + (-2*u*u*u + 3*u*u)*p[hi][1] + (u*u*u - u*u)*h*tangent[hi];
    },
  };
}

const cache = new Map();
const memo = (key, build) => {
  if (!cache.has(key)) { if (cache.size >= 256) cache.delete(cache.keys().next().value); cache.set(key, build()); }
  return cache.get(key);
};

export const ATRIAL = shape([[-.055,0],[-.028,.03],[0,.10],[.018,.085],[.048,0]]);

export function narrow(rr, st = 0, tAmp = .25) {
  // Adapta repolarização à FC; não estica o QRS com o ciclo inteiro.
  const cycle = Math.round(Math.max(.2, Math.min(2, rr))*1000)/1000;
  return memo(`n:${cycle}:${st}:${tAmp}`, () => {
    const peak = Math.max(.135, Math.min(.30, .10 + .20*Math.sqrt(cycle)));
    const end = Math.min(peak + .11, Math.max(.195, cycle*.84));
    const qrs = [[0,0],[.008,-.065],[.020,.82],[.030,-.16],[.045,-.08],[.068,st]];
    return shape([...qrs, [.092,st], [peak-.045,st*.8 + tAmp*.28],
      [peak,st*.65 + tAmp], [peak+.035,st*.25 + tAmp*.7], [Math.max(end,peak+.06),0]]);
  });
}

// Escape ventricular predominantemente negativo, com repolarização distinta.
export const WIDE = shape([[0,0],[.018,.08],[.037,-.28],[.060,-.70],[.083,-.60],
  [.115,-.12],[.150,0],[.205,.13],[.265,.34],[.315,.23],[.405,0]], .060);
export const PVC = shape([[0,0],[.018,.06],[.042,-.60],[.069,-.90],[.094,-.54],
  [.130,.04],[.172,.17],[.245,.39],[.310,.20],[.420,0]], .069);
export const BBB = shape([[0,0],[.016,.07],[.040,-.58],[.069,-.35],[.096,-.48],
  [.137,-.06],[.158,.025],[.223,.23],[.285,.34],[.355,.15],[.425,0]], .040);
export const PACED = shape([[0,0],[.022,-.18],[.060,-.45],[.090,.64],[.121,.80],
  [.160,.05],[.218,-.13],[.295,-.29],[.360,-.15],[.445,0]], .121);
export const AGONAL = shape([[0,0],[.05,.02],[.105,.24],[.165,.13],[.22,-.16],[.31,-.12],[.47,0]], .105);

export function preexcited(rr) {
  return memo(`w:${Math.round(rr*1000)}`, () => {
    const normal = narrow(rr);
    return shape([[-.030,0],[-.005,.11],[.012,.24],[.030,.78],[.052,-.10],[.085,0],
      ...normal.points.filter(p => p[0] > .092)], .030);
  });
}

export function ventricular(rr, quadrature = false) {
  const duration = Math.max(.18, Math.min(.43, rr*.98));
  return memo(`v:${duration.toFixed(4)}:${quadrature}`, () => shape((quadrature ? [
    [0,0],[.08,.26],[.18,.62],[.29,.25],[.41,-.38],[.53,-.59],[.68,-.34],[.85,-.12],[1,0],
  ] : [
    [0,0],[.035,-.18],[.10,-.68],[.17,-.78],[.22,-.63],[.32,.57],[.40,.79],
    [.49,.68],[.56,.75],[.67,.55],[.78,.28],[.90,.07],[1,0],
  ]).map(([x,y]) => [x*duration,y]), duration*.17));
}

// Aleatoriedade independente do número de pixels/amostras desenhados.
export function seededRandom(seed) {
  let state = seed >>> 0;
  return () => { state = (state + 0x6D2B79F5) >>> 0; let t = state; t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
export function texture(t, seed, amplitude = 1) {
  // Soma determinística de frequências não harmônicas; média zero.
  const phase = (seed >>> 0) / 4294967296 * Math.PI * 2;
  return amplitude * (.48*Math.sin(t*73.19+phase) + .32*Math.sin(t*113.71+phase*1.7) + .20*Math.sin(t*157.37+phase*.6));
}

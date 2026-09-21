import { RHYTHM_BY_ID } from './rhythm-catalog.js';
import { SCENARIO_BY_ID } from './scenario-catalog.js';
import { ENERGIES, VITAL_DEFS, DEFAULT_VITALS, PACER_LIMITS, NIBP_INTERVALS } from './simulation-config.js';

export function defaultState() {
  return {
    exam: null,
    rhythm: 'nsr',
    pulse: 'auto',            // auto | on | off (AESP)
    vfAmp: 'grossa',
    vit: { ...DEFAULT_VITALS },
    cur: null,                // valores atuais (durante transições)
    spo2Signal: 'normal',
    audioMuted: false,
    capno: 'normal',
    show: { ecg: true, spo2: true, nibp: true, capno: true, resp: true, temp: true },
    nibp: { sys: null, dia: null, map: null, at: 0, measuring: false, interval: 0 },
    defib: { energy: 150, status: 'idle', sync: false, shocks: 0 },
    pacer: { on: false, rate: 70, ma: 0, threshold: 60 },
    cpr: false,
    alarms: { enabled: true, beep: true, silencedUntil: 0 },
    timer: { running: false, startedAt: 0, acc: 0 },
    scn: { id: null, step: 0 },
    shockTo: null,            // ritmo após o choque (opcional)
    studentPanel: true,
  };
}

export function hasPulse(s) {
  if (s.pulse === 'on') return true;
  if (s.pulse === 'off') return false;
  return RHYTHM_BY_ID[s.rhythm]?.pulse ?? true;
}

export function mapOf(sys, dia) { return Math.round((sys + 2 * dia) / 3); }
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export function timerSeconds(t, now = Date.now()) {
  return Math.floor((t.acc + (t.running ? now - t.startedAt : 0)) / 1000);
}
export function fmtTime(sec) {
  const m = Math.floor(sec / 60), s = sec % 60;
  return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
}

export function scenarioStepSet(scenario, index) {
  const base=defaultState();
  const result={rhythm:base.rhythm,pulse:base.pulse,vfAmp:base.vfAmp,cpr:base.cpr,capno:base.capno,spo2Signal:base.spo2Signal,vit:{...base.vit}};
  for(const step of scenario.etapas.slice(0,index+1)) {
    for(const key of ['rhythm','pulse','vfAmp','cpr','capno','spo2Signal']) if(key in step.set)result[key]=step.set[key];
    Object.assign(result.vit,step.set.vit);
  }
  if(result.vit.rr===0){result.capno='none';result.vit.etco2=0;}
  return {...scenario.etapas[index].set,...result,show:{...scenario.etapas[index].set.show,capno:true}};
}

const bool = v => v === true || v === false;
const num = (v, a, b) => (typeof v === 'number' && Number.isFinite(v) ? clamp(v, a, b) : undefined);
const oneOf = (v, list) => (list.includes(v) ? v : undefined);

export function sanitizeSet(d) {
  const o = {};
  if (!d || typeof d !== 'object') return o;
  if (d.vit && typeof d.vit === 'object') {
    o.vit = {};
    for (const [k, def] of Object.entries(VITAL_DEFS)) { const v = num(d.vit[k], def.min, def.max); if (v !== undefined) o.vit[k] = v; }
  }
  if (typeof d.rhythm==='string' && Object.hasOwn(RHYTHM_BY_ID,d.rhythm)) o.rhythm = d.rhythm;
  if (bool(d.typicalHr)) o.typicalHr = d.typicalHr;
  if (oneOf(d.pulse, ['auto', 'on', 'off'])) o.pulse = d.pulse;
  if (oneOf(d.vfAmp, ['grossa', 'fina'])) o.vfAmp = d.vfAmp;
  if (oneOf(d.capno, ['normal', 'bronco', 'rcp', 'none'])) o.capno = d.capno;
  if (oneOf(d.spo2Signal, ['normal', 'low', 'absent'])) o.spo2Signal = d.spo2Signal;
  if (bool(d.cpr)) o.cpr = d.cpr;
  if (bool(d.studentPanel)) o.studentPanel = d.studentPanel;
  if (d.shockTo === null || (typeof d.shockTo==='string' && Object.hasOwn(RHYTHM_BY_ID,d.shockTo))) o.shockTo = d.shockTo;
  if (d.show && typeof d.show === 'object') {
    o.show = {};
    for (const k of ['ecg', 'spo2', 'nibp', 'capno', 'resp', 'temp']) if (bool(d.show[k])) o.show[k] = d.show[k];
  }
  if (d.alarms && typeof d.alarms === 'object') {
    o.alarms = {};
    for (const k of ['enabled', 'beep']) if (bool(d.alarms[k])) o.alarms[k] = d.alarms[k];
  }
  if (d.pacer && typeof d.pacer === 'object') {
    o.pacer = {};
    if (bool(d.pacer.on)) o.pacer.on = d.pacer.on;
    const lim = PACER_LIMITS;
    for (const [k, [a, b]] of Object.entries(lim)) { const v = num(d.pacer[k], a, b); if (v !== undefined) o.pacer[k] = Math.round(v); }
  }
  if (d.defib && typeof d.defib === 'object') {
    o.defib = {};
    if (ENERGIES.includes(d.defib.energy)) o.defib.energy = d.defib.energy;
    if (bool(d.defib.sync)) o.defib.sync = d.defib.sync;
  }
  if (d.nibp && typeof d.nibp === 'object' && NIBP_INTERVALS.includes(d.nibp.interval)) o.nibp = { interval: d.nibp.interval };
  return o;
}

// Estado salvo no navegador: valida contra o formato padrão antes de usar.
// Sem isto, um estado antigo ou corrompido (faltando `show.temp`, `timer.acc`
// ou com `vit: null`) fazia o controle recusar todos os estados ou o monitor travar.
export function restoreState(saved) {
  const base = defaultState();
  const ok = (model, v) => {
    if (model === null) return v === null || typeof v === 'string' || Number.isFinite(v);
    if (typeof model === 'number') return Number.isFinite(v);
    if (typeof model === 'boolean') return typeof v === 'boolean';
    if (typeof model === 'string') return typeof v === 'string';
    return false;
  };
  const merge = (target, src) => {
    if (!src || typeof src !== 'object' || Array.isArray(src)) return;
    for (const k of Object.keys(target)) {
      if (!Object.hasOwn(src, k)) continue;
      const model = target[k], v = src[k];
      if (model !== null && typeof model === 'object' && !Array.isArray(model)) merge(model, v);
      else if (ok(model, v)) target[k] = v;
    }
  };
  merge(base, saved);
  // Enumerações e limites
  if (!RHYTHM_BY_ID[base.rhythm]) base.rhythm = 'nsr';
  if (!['auto', 'on', 'off'].includes(base.pulse)) base.pulse = 'auto';
  if (!['grossa', 'fina'].includes(base.vfAmp)) base.vfAmp = 'grossa';
  if (!['normal', 'bronco', 'rcp', 'none'].includes(base.capno)) base.capno = 'normal';
  if (!['normal','low','absent'].includes(base.spo2Signal)) base.spo2Signal='normal';
  if (base.shockTo !== null && !RHYTHM_BY_ID[base.shockTo]) base.shockTo = null;
  if (base.scn.id !== null && !SCENARIO_BY_ID[base.scn.id]) base.scn = { id: null, step: 0 };
  base.scn.step = clamp(Math.round(base.scn.step) || 0,0,Math.max(0,(SCENARIO_BY_ID[base.scn.id]?.etapas?.length||1)-1));
  for (const [k, def] of Object.entries(VITAL_DEFS)) base.vit[k] = clamp(base.vit[k], def.min, def.max);
  if (!ENERGIES.includes(base.defib.energy)) base.defib.energy = 150;
  base.defib.shocks = clamp(Math.round(base.defib.shocks) || 0, 0, 999);
  base.pacer.rate = clamp(Math.round(base.pacer.rate) || 70, ...PACER_LIMITS.rate);
  base.pacer.ma = clamp(Math.round(base.pacer.ma) || 0, ...PACER_LIMITS.ma);
  base.pacer.threshold = clamp(Math.round(base.pacer.threshold) || 60, ...PACER_LIMITS.threshold);
  if (!NIBP_INTERVALS.includes(base.nibp.interval)) base.nibp.interval = 0;
  for (const k of ['sys', 'dia', 'map']) if (base.nibp[k] !== null) base.nibp[k] = clamp(Math.round(base.nibp[k]) || 0, 0, 400);
  // Cronômetro: acumulado negativo ou início inválido/no futuro zeravam o relógio do controle.
  base.timer.acc = Math.max(0, base.timer.acc);
  if (base.timer.running && !(base.timer.startedAt > 0 && base.timer.startedAt <= Date.now())) { base.timer.running = false; base.timer.startedAt = 0; }
  base.alarms.silencedUntil = Math.max(0, Math.min(base.alarms.silencedUntil, Date.now() + 600000));
  base.nibp.at = Math.max(0, Math.min(base.nibp.at, Date.now()));
  // Campos que não sobrevivem à recarga
  base.defib.status = 'idle';
  base.nibp.measuring = false;
  base.cur = { ...base.vit };
  return base;
}

// Mesma lista para o aviso do controle e o registro do monitor.
// O chamador informa as transições locais ou as recebidas pelo protocolo.
export function interruptedActivities(state, transitions = {}) {
  if (!state) return [];
  const items = [];
  if (state.defib.status !== 'idle') items.push('carga do desfibrilador');
  if (state.pacer.on) items.push('marcapasso');
  if (state.cpr) items.push('RCP');
  if (Object.keys(transitions).length) items.push('transição de sinais');
  if (state.nibp.measuring || state.nibp.interval) items.push('PNI');
  if (state.exam) items.push('exame aberto');
  return items;
}

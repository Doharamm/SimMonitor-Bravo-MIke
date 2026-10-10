import { RHYTHM_BY_ID } from './rhythm-catalog.js';
import { SCENARIO_BY_ID } from './scenario-catalog.js';
import { ENERGIES, VITAL_DEFS, DEFAULT_VITALS, PACER_LIMITS, NIBP_INTERVALS, PULSE_MODES, VF_AMPLITUDES, CAPNO_MODES, SPO2_SIGNALS, CHANNELS } from './simulation-config.js';

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
    // Sensores começam desligados: o aluno pede a monitorização e o instrutor
    // liga cada um (eletrodos, oxímetro, capnógrafo, manguito, termômetro).
    show: Object.fromEntries(CHANNELS.map(k => [k, false])),
    nibp: { sys: null, dia: null, map: null, at: 0, measuring: false, interval: 0 },
    defib: { energy: 150, status: 'idle', sync: false, shocks: 0 },
    pacer: { on: false, rate: 70, ma: 0, threshold: 15 },
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

// Roteiro de uma medida de PNI, em segundos. O monitor desenha a pressão do
// manguito com cuffAt() e o áudio toca os mesmos tempos (monitor-audio.js).
// Curta de propósito (~7–8 s): medir de novo no meio do caso não pode travar a aula.
//   enche até PAS + 30 em `inflate`, pausa até `pause`, desce em `steps` degraus
//   de `step` segundos até PAD − 10, esvazia, e o resultado sai em `total`.
export function nibpPlan(sys, dia) {
  const alvo = Math.round(Math.max(sys, 60) + 30), fim = Math.max(20, dia - 10);
  const steps = clamp(Math.ceil((alvo - fim) / 12), 5, 9);
  const inflate = 3, pause = inflate + .35, step = .45, dump = .8;
  const ultimoDegrau = pause + step * steps;
  const queda = (alvo - fim) / steps;
  return {
    alvo, fim, steps, inflate, pause, step, dump, total: ultimoDegrau + 1,
    cuffAt(el) {
      if (el < inflate) return alvo * Math.max(0, el) / inflate;
      if (el < pause) return alvo;
      if (el >= ultimoDegrau + .45) return 0;
      return alvo - queda * Math.min(steps, Math.floor((el - pause) / step) + 1);
    },
  };
}
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export function timerSeconds(t, now = Date.now()) {
  return Math.floor((t.acc + (t.running ? now - t.startedAt : 0)) / 1000);
}
export function fmtTime(sec) {
  const m = Math.floor(sec / 60), s = sec % 60;
  return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
}

export function scenarioStepSet(scenario, index, atual = null) {
  const decl=scenario.etapas[index].set;
  const base=defaultState();
  const result={rhythm:base.rhythm,pulse:base.pulse,vfAmp:base.vfAmp,cpr:base.cpr,capno:base.capno,spo2Signal:base.spo2Signal,vit:{...base.vit}};
  for(const step of scenario.etapas.slice(0,index+1)) {
    for(const key of ['rhythm','pulse','vfAmp','cpr','capno','spo2Signal']) if(key in step.set)result[key]=step.set[key];
    Object.assign(result.vit,step.set.vit);
  }
  if(result.vit.rr===0){result.capno='none';result.vit.etco2=0;}
  // Iniciar a RCP é decisão do aluno. Etapa que não declara `cpr` mantém as
  // compressões como estão; a capnografia de RCP (ventilação e EtCO₂ da etapa)
  // só vale com elas em andamento. Antes, o 1º choque ligava a RCP sozinho.
  if(!('cpr' in decl)){
    delete result.cpr;
    if(result.capno==='rcp'&&!atual?.cpr){result.capno='none';result.vit.rr=0;result.vit.etco2=0;}
  }
  // Os sensores ligados são decisão do instrutor durante o caso. Uma etapa só
  // mexe neles se declarar `show` explicitamente; antes, toda etapa forçava a
  // capnografia visível.
  return {...decl,...result};
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
  if (oneOf(d.pulse, PULSE_MODES)) o.pulse = d.pulse;
  if (oneOf(d.vfAmp, VF_AMPLITUDES)) o.vfAmp = d.vfAmp;
  if (oneOf(d.capno, CAPNO_MODES)) o.capno = d.capno;
  if (oneOf(d.spo2Signal, SPO2_SIGNALS)) o.spo2Signal = d.spo2Signal;
  if (bool(d.cpr)) o.cpr = d.cpr;
  if (bool(d.studentPanel)) o.studentPanel = d.studentPanel;
  if (d.shockTo === null || (typeof d.shockTo==='string' && Object.hasOwn(RHYTHM_BY_ID,d.shockTo))) o.shockTo = d.shockTo;
  if (d.show && typeof d.show === 'object') {
    o.show = {};
    for (const k of CHANNELS) if (bool(d.show[k])) o.show[k] = d.show[k];
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
  if (!PULSE_MODES.includes(base.pulse)) base.pulse = PULSE_MODES[0];
  if (!VF_AMPLITUDES.includes(base.vfAmp)) base.vfAmp = VF_AMPLITUDES[0];
  if (!CAPNO_MODES.includes(base.capno)) base.capno = CAPNO_MODES[0];
  if (!SPO2_SIGNALS.includes(base.spo2Signal)) base.spo2Signal = SPO2_SIGNALS[0];
  if (base.shockTo !== null && !RHYTHM_BY_ID[base.shockTo]) base.shockTo = null;
  if (base.scn.id !== null && !SCENARIO_BY_ID[base.scn.id]) base.scn = { id: null, step: 0 };
  base.scn.step = clamp(Math.round(base.scn.step) || 0,0,Math.max(0,(SCENARIO_BY_ID[base.scn.id]?.etapas?.length||1)-1));
  for (const [k, def] of Object.entries(VITAL_DEFS)) base.vit[k] = clamp(base.vit[k], def.min, def.max);
  if (!ENERGIES.includes(base.defib.energy)) base.defib.energy = 150;
  base.defib.shocks = clamp(Math.round(base.defib.shocks) || 0, 0, 999);
  base.pacer.rate = clamp(Math.round(base.pacer.rate) || 70, ...PACER_LIMITS.rate);
  base.pacer.ma = clamp(Math.round(base.pacer.ma) || 0, ...PACER_LIMITS.ma);
  // 60 mA era o limiar padrão até outubro de 2026; sessões guardadas com ele
  // passam ao padrão novo (15 mA) em vez de manter a captura difícil.
  if (base.pacer.threshold === 60) base.pacer.threshold = 15;
  base.pacer.threshold = clamp(Math.round(base.pacer.threshold) || 15, ...PACER_LIMITS.threshold);
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

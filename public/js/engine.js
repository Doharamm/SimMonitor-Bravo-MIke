// Motor de formas de onda: ECG, pletismografia, capnografia e respiração.
// Tempo em segundos (relógio do simulador).

import { narrow, WIDE, PVC, BBB, PACED, AGONAL, ATRIAL, preexcited, ventricular, seededRandom, texture } from './ecg-shapes.js';
import { DART, DartPlayer, DART_ATRIAL, DART_BAV_ATRIAL, DART_NORMAL, DART_ESCAPE, DART_PVC } from './dart-player.js';

// Linha reta curta logo após o choque: tempo para os alunos retomarem as compressões.
export const POST_SHOCK_FLAT_S = 3;
const G = (t, c, a, s) => { const d = t - c; return a * Math.exp(-(d * d) / (2 * s * s)); };

export class Engine {
  constructor({ seed = Math.floor(Math.random() * 4294967296) } = {}) {
    this.seed = seed >>> 0;
    this.random = seededRandom(this.seed);
    this.dart = null; this.dartResumeAt = 0; this.dartWasCaptured = false; this.pacerWasOn = false;
    this.ecgW = []; // perfis interpolados, independentes dos eventos de pulso
    this.ecgC = [];   // componentes gaussianos {c, a, s}
    this.plethC = [];
    this.beats = [];  // {t, pulse}
    this.spikes = []; // espículas de marcapasso (tempo)
    this.rhythm = 'nsr';
    this.nextV = 0; this.nextA = 0; this.nextPace = 0;
    this.cycle = 0; this.lastNormal = 0;
    this.shockAt = -99; this.flatUntil = -99;
    this.vfPh = [0, 1, 2, 3].map(() => this.random() * 6.28);
    this.lastBeatTimes = [];
    this.params = { hr: 78, sys: 120, pulse: true, cpr: false, vfAmp: 'grossa', noise: true, pacer: { on: false, rate: 70, ma: 0, threshold: 60 }, rr: 16, etco2: 36, capno: 'normal', spo2: 98 };
  }

  setParams(p) { Object.assign(this.params, p); }

  setRhythm(id, now) {
    if (id === this.rhythm) return;
    this.rhythm = id;
    this.dart = null; this.dartResumeAt = Math.max(now + .27, this.flatUntil + .2);
    // descarta componentes futuros e reprograma
    const cut = now + 0.12;
    this.ecgC = this.ecgC.filter(c => c.c < cut);
    this.ecgW = this.ecgW.filter(w => w.t + w.tpl.start < cut).map(w => ({ ...w, cut: Math.min(w.cut, cut) }));
    this.plethC = this.plethC.filter(c => c.c < cut);
    this.beats = this.beats.filter(b => b.t < cut);
    // Se a troca acontece durante a linha reta pós-choque, o novo ritmo só aparece quando ela termina.
    this.nextV = Math.max(cut + 0.15, this.flatUntil + 0.2); this.nextA = Math.max(cut + 0.05, this.flatUntil + 0.05); this.cycle = 0; this.lastNormal = -99;
  }

  shock(now) {
    this.shockAt = now;
    this.flatUntil = now + POST_SHOCK_FLAT_S;
    this.dart = null; this.dartResumeAt = this.flatUntil + 0.2;
    const cut = now;
    this.ecgC = this.ecgC.filter(c => c.c < cut);
    this.ecgW = this.ecgW.filter(w => w.t + w.tpl.start < cut).map(w => ({ ...w, cut: Math.min(w.cut, cut) }));
    this.plethC = this.plethC.filter(c => c.c < cut);
    this.beats = this.beats.filter(b => b.t < cut);
    this.nextV = this.flatUntil + 0.2; this.nextA = this.flatUntil + 0.05;
    this.nextPace = Math.max(this.nextPace, this.flatUntil + 0.2);
    // Sem isto, o bigeminismo voltava com o ciclo antigo e desenhava batimentos dentro da linha reta.
    this.cycle = 0; this.lastNormal = -99;
    this.spikes = this.spikes.filter(t => t <= now);
  }

  captured() {
    const p = this.params.pacer;
    return p.on && p.ma >= p.threshold && !['vf', 'tdp'].includes(this.rhythm);
  }

  addBeat(t0, tpl, amp = 1, pulseAmp = 1) {
    if (tpl.sample) this.ecgW.push({ t: t0, tpl, amp, cut: Infinity });
    else for (const k of tpl) this.ecgC.push({ c: t0 + k.m, a: k.a * amp, s: k.s });
    // Correção concorrente preservada: captura elétrica não implica pulso.
    const pulse = !!this.params.pulse;
    if (pulse && pulseAmp > 0) {
      const perf = Math.max(0.12, Math.min(1, (this.params.sys - 35) / 70)) * pulseAmp;
      this.plethC.push({ c: t0 + 0.2, a: perf, s: 0.065 }, { c: t0 + 0.42, a: perf * 0.33, s: 0.06 });
    }
    // Evento usado pelo bip, FC e SINC acompanha o ponto de referência do QRS.
    this.beats.push({ t: t0 + (tpl.fiducial ?? 0.02), pulse });
  }
  addP(t, a = 0.10) { this.ecgW.push({ t, tpl: this.rhythm === 'bav3' ? DART_BAV_ATRIAL : DART_ATRIAL, amp: a / .10, cut: Infinity }); }

  // Programa batimentos até "horizon"
  schedule(now) {
    const horizon = now + 0.7;
    const r = this.rhythm, p = this.params;
    const hr = Math.max(p.hr || 0, 1);
    const rr = 60 / hr;
    const cap = this.captured();
    if (cap !== this.dartWasCaptured) {
      this.dart = null;
      // A linha reta pós-choque não pode ser cancelada por ganho ou perda de captura.
      this.dartResumeAt = Math.max(now + .03, this.flatUntil + .2);
      this.beats = this.beats.filter(b => b.t < now);
      this.ecgW = this.ecgW.filter(w => w.t < now);
      this.ecgC = this.ecgC.filter(c => c.c < now);
      this.plethC = this.plethC.filter(c => c.c < now);
      this.nextV = Math.max(this.nextV, this.flatUntil + 0.2);
      this.nextA = Math.max(this.nextA, this.flatUntil + 0.05);
      this.dartWasCaptured = cap;
    }
    // Marcapasso desligado: espículas e batimentos já programados à frente são descartados.
    if (!p.pacer.on && this.pacerWasOn) {
      this.spikes = this.spikes.filter(t => t <= now);
      this.beats = this.beats.filter(b => b.t <= now);
      this.ecgW = this.ecgW.filter(w => w.t <= now);
      this.ecgC = this.ecgC.filter(c => c.c <= now);
      this.plethC = this.plethC.filter(c => c.c <= now);
      this.nextV = Math.max(this.nextV, now + 0.1);
      this.nextA = Math.max(this.nextA, now + 0.05);
    }
    this.pacerWasOn = !!p.pacer.on;

    // Marcapasso
    if (p.pacer.on) {
      if (this.nextPace < now - 1) this.nextPace = now + 0.2;
      this.nextPace = Math.max(this.nextPace, this.flatUntil + 0.2);
      while (this.nextPace < horizon) {
        const t = this.nextPace;
        this.spikes.push(t);
        if (cap) this.addBeat(t + 0.005, PACED, 1, 1);
        this.nextPace += 60 / Math.max(30, p.pacer.rate);
      }
      if (cap) { this.nextV = Math.max(this.nextV, horizon); this.nextA = Math.max(this.nextA, horizon); return; }
    }

    if (DART[r] && !DART[r].special) {
      // FC saneada: valores ausentes ou negativos congelavam a tira num degrau contínuo.
      const hrRef = Math.max(0, +p.hr || 0);
      if (!this.dart || this.dart.id !== r) this.dart = new DartPlayer(r, Math.max(now, this.dartResumeAt), hrRef);
      for (const event of this.dart.advance(now, hrRef)) this.addBeat(event - .02, [], 1, r === 'tdp' || r === 'agonal' ? 0 : r === 'vt' ? .45 : 1);
      return;
    }

    if (this.nextV < now - 2) this.nextV = now + 0.1;
    if (this.nextA < now - 2) this.nextA = now + 0.1;

    switch (r) {
      case 'vf': case 'asys': return;
      case 'bav3': {
        while (this.nextA < horizon) { this.addP(this.nextA); this.nextA += 60 / 82; }
        while (this.nextV < horizon) { this.addBeat(this.nextV, DART_ESCAPE); this.nextV += rr; }
        return;
      }
      case 'bav2m1': {
        // 4:3 — PR crescente e bloqueio
        const ra = rr * 3 / 4;
        const prs = [0.16, 0.26, 0.36, null];
        while (this.nextA < horizon) {
          const pr = prs[this.cycle % 4];
          this.addP(this.nextA);
          if (pr !== null) this.addBeat(this.nextA + pr, narrow(ra));
          this.cycle++; this.nextA += ra;
        }
        return;
      }
      case 'bav2m2': {
        const ra = rr * 2 / 3;
        while (this.nextA < horizon) {
          this.addP(this.nextA);
          if (this.cycle % 3 !== 2) this.addBeat(this.nextA + 0.18, BBB);
          this.cycle++; this.nextA += ra;
        }
        return;
      }
    }

    while (this.nextV < horizon) {
      const t = this.nextV;
      switch (r) {
        case 'nsr': case 'sb': case 'st': case 'ste': case 'ste_st': {
          const st = r === 'ste' || r === 'ste_st' ? 0.32 : 0;
          this.addP(t - 0.15); this.addBeat(t, narrow(rr, st)); this.nextV += rr; break;
        }
        case 'sa': {
          const k = 1 + 0.2 * Math.sin(2 * Math.PI * t / 5);
          this.addP(t - 0.15); this.addBeat(t, narrow(rr)); this.nextV += rr * k; break;
        }
        case 'bav1': this.addP(t - 0.32); this.addBeat(t, narrow(rr)); this.nextV += rr; break;
        case 'wpw': {
          this.addP(t - 0.1); this.addBeat(t, preexcited(rr)); this.nextV += rr; break;
        }
        case 'bbb': this.addP(t - 0.16); this.addBeat(t, BBB); this.nextV += rr; break;
        case 'svt': case 'psvt': this.addBeat(t, narrow(rr, 0, 0.18)); this.nextV += rr; break;
        case 'junc': this.addBeat(t, narrow(rr)); this.ecgC.push({ c: t + 0.1, a: -0.08, s: 0.02 }); this.nextV += rr; break;
        case 'afib': this.addBeat(t, narrow(rr, 0, 0.2)); this.nextV += rr * (0.55 + this.random() * 0.90); break;
        case 'afl': {
          const n = Math.max(2, Math.round(rr / 0.2));
          this.addBeat(t, narrow(rr, 0, 0.15)); this.nextV += n * 0.2; break;
        }
        case 'ivr': this.addBeat(t, WIDE); this.nextV += rr; break;
        case 'agonal': this.addBeat(t, AGONAL, 1, 0); this.nextV += rr * (0.8 + this.random() * 0.6); break;
        case 'vt': {
          this.addBeat(t, ventricular(rr), 1, 0.45);
          this.nextV += rr; break;
        }
        case 'tdp': {
          // Duas projeções misturadas continuamente, sem inversão discreta de sinal.
          this.addBeat(t, ventricular(rr), 1, 0);
          const w = this.ecgW.at(-1);
          w.quadrature = ventricular(rr, true); w.rotation = true;
          this.nextV += rr; break;
        }
        case 'bige': {
          if (this.cycle % 2 === 0) { this.addP(t - 0.15); this.addBeat(t, DART_NORMAL); this.lastNormal = t; this.nextV = t + rr * 0.58; }
          else { this.addBeat(t, DART_PVC, 1, 0.35); this.nextV = Math.max(t + rr * 0.5, this.lastNormal + rr * 2); }
          this.cycle++; break;
        }
        case 'pvc': {
          if (this.cycle > 0 && this.random() < 0.16) {
            this.addBeat(t - rr * 0.4, PVC, 1, 0.35); this.nextV += rr; this.cycle = 0;
          } else { this.addP(t - 0.15); this.addBeat(t, narrow(rr)); this.nextV += rr; this.cycle++; }
          break;
        }
        case 'pac': {
          if (this.cycle > 0 && this.random() < 0.16) {
            const te = t - rr * 0.3; this.addP(te - 0.13, -0.09); this.addBeat(te, narrow(rr)); this.nextV = te + rr; this.cycle = 0;
          } else { this.addP(t - 0.15); this.addBeat(t, narrow(rr)); this.nextV += rr; this.cycle++; }
          break;
        }
        default: this.addP(t - 0.15); this.addBeat(t, narrow(rr)); this.nextV += rr;
      }
    }
  }

  // Limpeza e retorno de eventos de batimento até "now"
  popBeats(now) {
    const out = [];
    this.beats.sort((a, b) => a.t - b.t); // extrassístoles entram fora de ordem
    while (this.beats.length && this.beats[0].t <= now) out.push(this.beats.shift());
    for (const b of out) { this.lastBeatTimes.push(b.t); }
    this.lastBeatTimes = this.lastBeatTimes.filter(t => t > now - 20); // 20 s: bradicardias extremas precisam de 2 batimentos na janela
    this.ecgC = this.ecgC.filter(c => c.c > now - 1.5);
    this.ecgW = this.ecgW.filter(w => Math.min(w.t + w.tpl.end, w.cut) > now - 1.5);
    this.plethC = this.plethC.filter(c => c.c > now - 1.5);
    this.spikes = this.spikes.filter(t => t > now - 1);
    return out;
  }

  measuredHr(now) {
    const b = this.lastBeatTimes;
    const expected = 60 / Math.max(1, this.params.hr || 0);
    const limit = Math.min(15, Math.max(3.2, expected * 2.6));
    if (b.length < 2 || now - b[b.length - 1] > limit) return null;
    const n = Math.min(5, b.length);
    const span = b[b.length - 1] - b[b.length - n];
    return span > 0 ? Math.round(60 * (n - 1) / span) : null;
  }

  ecg(t) {
    const p = this.params;
    let v = 0;
    for (const c of this.ecgC) { const d = t - c.c; if (d > -0.4 && d < 0.4) v += G(t, c.c, c.a, c.s); }
    for (const w of this.ecgW) {
      const d = t - w.t;
      if (t >= w.cut || d < w.tpl.start || d > w.tpl.end) continue;
      let sample = w.tpl.sample(d);
      if (w.rotation) {
        const angle = 2 * Math.PI * t / 3.4;
        sample = Math.cos(angle) * sample + .28 * Math.sin(angle) * w.quadrature.sample(d);
      }
      v += w.amp * sample;
    }
    const referenceActive = this.dart && this.dart.id === this.rhythm && this.dart.rate > 0 && !this.captured();
    if (referenceActive) v = this.dart.sample(t) * (this.rhythm === 'vf' && p.vfAmp === 'fina' ? .3 : 1);
    for (const s of this.spikes) { const d = t - s; if (d >= 0 && d < 0.004) v += 1.6; else if (d >= 0.004 && d < 0.012) v -= 0.25; }
    const r = this.rhythm;
    // Atividade contínua sintética (FV, ondas f/F) some durante a linha reta pós-choque e volta em 0,6 s.
    const cont = t < this.flatUntil ? 0 : Math.min(1, (t - this.flatUntil) / 0.6);
    if (!referenceActive && r === 'vf' && cont > 0) {
      const A = p.vfAmp === 'fina' ? 0.13 : 0.40;
      const f = [3.6, 4.9, 6.1, 7.4];
      for (let i = 0; i < 4; i++) v += cont * A * (0.55 + 0.45 * Math.sin(t * (0.3 + i * 0.17) + i)) * Math.sin(2 * Math.PI * f[i] * t + this.vfPh[i] + .65*Math.sin(t*(.71+i*.19))) / 2.2;
    }
    if (!referenceActive && r === 'afib') v += cont * (0.045 * Math.sin(2 * Math.PI * 6.3 * t) + 0.03 * Math.sin(2 * Math.PI * 8.7 * t + 1) + 0.02 * Math.sin(2 * Math.PI * 4.1 * t + 2));
    if (!referenceActive && r === 'afl') { const ph = (t / 0.2) % 1; v += cont * (-0.3 * (ph < 0.8 ? ph / 0.8 : (1 - ph) / 0.2) + 0.15); }
    // Artefato de RCP: menor que o QRS para o ritmo de base (ex.: FV fina × grossa) continuar visível durante as compressões.
    if (p.cpr) { const ph = (t * 110 / 60) % 1; v += 0.42 * (0.85 + 0.15 * Math.sin(t * 0.9)) * (ph < 0.45 ? Math.sin(Math.PI * ph / 0.45) : 0); }
    // Artefato de choque: espícula e retorno rápido à linha de base (sem oscilação), seguido da linha reta.
    const ds = t - this.shockAt;
    if (ds >= 0 && ds < 1) {
      v += (ds < 0.04 ? 6 : 0) + 2.2 * Math.exp(-ds / 0.08) * (ds < 0.25 ? 1 : 0);
    }
    // ruído e oscilação de linha de base
    if (!referenceActive && p.noise !== false) v += 0.008 * Math.sin(2 * Math.PI * 0.21 * t) + texture(t, this.seed, .003);
    return v;
  }

  pleth(t) {
    const p = this.params;
    let v = 0;
    for (const c of this.plethC) { const d = t - c.c; if (d > -0.4 && d < 0.5) v += G(t, c.c, c.a, c.s); }
    if (p.cpr) { const ph = (t * 110 / 60) % 1; v += 0.3 * (ph < 0.5 ? Math.sin(Math.PI * ph / 0.5) : 0); }
    return v + (Math.random() - 0.5) * 0.01;
  }

  // capnografia: retorna mmHg
  // fase respiratória acumulada (evita saltos quando a FR muda)
  phase(key, t, rate) {
    const k = '_ph' + key, kt = '_pt' + key;
    const dt = this[kt] == null ? 0 : Math.max(0, Math.min(0.5, t - this[kt]));
    this[kt] = t; this[k] = ((this[k] || 0) + dt * rate / 60) % 1;
    return this[k];
  }

  capno(t) {
    const p = this.params;
    const ph = this.phase('c', t, p.rr);
    if (p.capno === 'none' || p.rr <= 0) return (Math.random() - 0.5) * 0.3;
    const per = 60 / Math.max(1, p.rr);
    const E = p.etco2;
    const ex = Math.min(0.62, 0.45 + 1.2 / per * 0.05); // fração expiratória
    let v = 0;
    if (p.capno === 'bronco') {
      if (ph < ex) v = E * (1 - Math.exp(-ph / (ex * 0.35))) / (1 - Math.exp(-1 / 0.35));
      else if (ph < ex + 0.06) v = E * (1 - (ph - ex) / 0.06);
    } else {
      const rise = 0.06;
      if (ph < rise) v = E * 0.9 * (0.5 - 0.5 * Math.cos(Math.PI * ph / rise));
      else if (ph < ex) v = E * (0.9 + 0.1 * (ph - rise) / (ex - rise));
      else if (ph < ex + 0.05) v = E * (1 - (ph - ex) / 0.05);
    }
    return Math.max(0, v) + (Math.random() - 0.5) * 0.3;
  }

  resp(t) {
    const p = this.params;
    let v = 0;
    const ph = this.phase('r', t, p.rr);
    if (p.rr > 0) v = Math.sin(2 * Math.PI * ph);
    if (p.cpr) { const ph2 = (t * 110 / 60) % 1; v += 0.4 * (ph2 < 0.45 ? Math.sin(Math.PI * ph2 / 0.45) : 0); }
    return v + (Math.random() - 0.5) * 0.02;
  }
}

// Síntese de áudio. O monitor controla abertura, pausa e retomada do AudioContext.
export function createMonitorAudio({getContext, isMuted}) {
  let masterAudio = null;
  function audioOutput(){
    const ac = getContext();
    if(!masterAudio||masterAudio.context!==ac){masterAudio=ac.createGain();masterAudio.connect(ac.destination);}
    masterAudio.gain.setValueAtTime(isMuted()?0:1,ac.currentTime);
    return masterAudio;
  }
  function tone(freq, dur = 0.08, vol = 0.15, type = 'sine', when = 0) {
    const ac = getContext();
    if (!ac || isMuted()) return;
    const t = ac.currentTime + when;
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.005); g.gain.setValueAtTime(vol, t + dur - 0.01); g.gain.linearRampToValueAtTime(0, t + dur);
    o.connect(g).connect(audioOutput()); o.start(t); o.stop(t + dur + 0.02);
    return o;
  }
  function alarmSound(level) {
    if (level === 'high') { [0, .18, .36, .9, 1.08].forEach(w => tone(960, .14, .22, 'square', w)); }
    else { [0, .3].forEach(w => tone(620, .22, .16, 'triangle', w)); }
  }
  let chargeOsc = null;
  function chargeSound() {
    const ac = getContext();
    if (!ac || isMuted()) return;
    const t = ac.currentTime, o = ac.createOscillator(), g = ac.createGain();
    o.type = 'sawtooth'; o.frequency.setValueAtTime(300, t); o.frequency.exponentialRampToValueAtTime(1700, t + 3);
    g.gain.setValueAtTime(0.05, t); o.connect(g).connect(audioOutput()); o.start(t); o.stop(t + 3); chargeOsc = o;
  }
  function shockSound() {
    const ac = getContext();
    if (!ac || isMuted()) return;
    const len = ac.sampleRate * 0.35, buf = ac.createBuffer(1, len, ac.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (len * 0.18));
    const src = ac.createBufferSource(), g = ac.createGain(); g.gain.value = 0.5; src.buffer = buf; src.connect(g).connect(audioOutput()); src.start();
  }

  function stopCharge() { try { chargeOsc?.stop(); } catch (e) {} }

  // ---- Manguito da PNI ----
  // Motor de diafragma enchendo (grave, perdendo rotação conforme a pressão
  // sobe), desinflação em degraus com o estalo da válvula, esvaziamento final.
  // Os tempos vêm de nibpPlan() (simulation-state.js), os mesmos que desenham a
  // pressão do manguito na tela, para som e número andarem juntos.
  let noiseBuf = null;
  function noise(ac) {
    if (!noiseBuf || noiseBuf.sampleRate !== ac.sampleRate) {
      noiseBuf = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    return noiseBuf;
  }
  function hiss(ac, out, t, dur, { f = 3000, f2 = null, q = 1, g = .06, type = 'bandpass' } = {}) {
    const src = ac.createBufferSource(); src.buffer = noise(ac); src.loop = true;
    const bp = ac.createBiquadFilter(); bp.type = type; bp.frequency.setValueAtTime(f, t);
    if (f2) bp.frequency.exponentialRampToValueAtTime(f2, t + dur);
    bp.Q.value = q;
    const gn = ac.createGain(); gn.gain.setValueAtTime(.0001, t);
    gn.gain.exponentialRampToValueAtTime(g, t + .012); gn.gain.exponentialRampToValueAtTime(.0001, t + dur);
    src.connect(bp); bp.connect(gn); gn.connect(out); src.start(t); src.stop(t + dur + .05);
  }
  let cuffOut = null;
  function cuffSound(plan) {
    stopCuff();
    const ac = getContext();
    if (!ac || isMuted()) return;
    const { inflate, steps, step } = plan;
    const t0 = ac.currentTime + .05, out = ac.createGain(); out.gain.value = .9; out.connect(audioOutput());
    cuffOut = out;
    const m1 = ac.createOscillator(), m2 = ac.createOscillator(), m2g = ac.createGain();
    m1.type = 'sawtooth'; m2.type = 'square'; m2g.gain.value = .25;
    m1.frequency.setValueAtTime(118, t0); m1.frequency.linearRampToValueAtTime(94, t0 + inflate);
    m2.frequency.setValueAtTime(236, t0); m2.frequency.linearRampToValueAtTime(188, t0 + inflate);
    const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 650; lp.Q.value = .8;
    // Batidas do diafragma: o volume pulsa cerca de 30 vezes por segundo.
    const am = ac.createGain(); am.gain.value = .6;
    const lfo = ac.createOscillator(), lg = ac.createGain();
    lfo.frequency.setValueAtTime(32, t0); lfo.frequency.linearRampToValueAtTime(27, t0 + inflate); lg.gain.value = .4;
    lfo.connect(lg); lg.connect(am.gain);
    const mg = ac.createGain(); mg.gain.setValueAtTime(.0001, t0); mg.gain.exponentialRampToValueAtTime(.09, t0 + .18);
    mg.gain.linearRampToValueAtTime(.13, t0 + inflate); mg.gain.exponentialRampToValueAtTime(.0001, t0 + inflate + .1);
    m1.connect(lp); m2.connect(m2g); m2g.connect(lp); lp.connect(am); am.connect(mg); mg.connect(out);
    for (const o of [m1, m2, lfo]) { o.start(t0); o.stop(t0 + inflate + .15); }
    hiss(ac, out, t0, inflate, { f: 1300, q: .7, g: .018 });                      // ar entrando
    let t = t0 + plan.pause;
    for (let i = 0; i < steps; i++) {                                              // válvula
      hiss(ac, out, t, .025, { f: 2200, type: 'highpass', q: .5, g: .22 });
      hiss(ac, out, t + .01, .22, { f: 3400, q: 1.2, g: .045 });
      t += step;
    }
    hiss(ac, out, t, plan.dump, { f: 2600, f2: 600, q: .9, g: .12 });             // esvaziamento
  }
  // Parar no meio (medição cancelada, caso trocado): corta o som e solta o ar.
  function stopCuff(release = false) {
    const ac = getContext();
    if (cuffOut && ac) {
      const n = ac.currentTime, out = cuffOut;
      out.gain.cancelScheduledValues(n); out.gain.setTargetAtTime(0, n, .03);
      setTimeout(() => { try { out.disconnect(); } catch (e) {} }, 400);
      if (release && !isMuted()) { const o = ac.createGain(); o.connect(audioOutput()); hiss(ac, o, n + .02, .7, { f: 2400, f2: 700, q: .9, g: .1 }); }
    }
    cuffOut = null;
  }

  return { audioOutput, tone, alarmSound, chargeSound, shockSound, stopCharge, cuffSound, stopCuff };
}

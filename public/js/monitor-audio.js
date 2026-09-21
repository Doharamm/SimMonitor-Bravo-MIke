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

  return { audioOutput, tone, alarmSound, chargeSound, shockSound, stopCharge };
}

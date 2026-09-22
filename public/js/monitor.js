import { Trace } from './trace-renderer.js';
import { createMonitorAudio } from './monitor-audio.js';
import { evaluateReadings } from './monitor-readings.js';
import { SimulationClock } from './simulation-clock.js';
import { VERSION, registerScenario } from './classroom.js';
import { initMonitorExams } from './monitor-exams.js';
import { ExamViewer } from './exam-viewer.js';
import { EventHistory } from './history.js';
import { CommandGate, REFUSAL_TEXT } from './session.js';
import { EXAM_BY_ID } from './exams.js';
import { RHYTHM_BY_ID } from './rhythm-catalog.js';
import { ENERGIES, PACER_LIMITS } from './simulation-config.js';
import { SCENARIO_BY_ID } from './scenario-catalog.js';
import { scenarioStepSet, defaultState, interruptedActivities, hasPulse, mapOf, clamp, timerSeconds, fmtTime, sanitizeSet, restoreState } from './simulation-state.js';
import { describeSet, describeAction, setMergeKey } from './descriptions.js';
import { Engine } from './engine.js';
import { Transport } from './transport.js';
import { SalaOnline } from './online-room.js';
import { CONFIG } from './config.js';

const $ = id => document.getElementById(id);
const LS_STATE = 'bmsim-monitor-state', LS_ROOM = 'bmsim-room', LS_HIST = 'bmsim-monitor-history';
const simClock = new SimulationClock(()=>performance.now(),(f,n)=>setTimeout(f,n),id=>clearTimeout(id));
const epoch = Date.now()-performance.now();
const simNow = () => epoch+simClock.now();
const nowS = () => simClock.now()/1000;
const simTimeout=(f,n)=>simClock.later(f,n), simInterval=(f,n)=>simClock.later(f,n,true), simClear=id=>simClock.clear(id);
let timedAdvance=false, stageTimer=null, stageDeadline=0, stageWaitOverride=null, stageToken=0;
let automatic=true, assessment=true, actor='sistema', caseStart=simClock.now(), caseName='Livre';
const approved=new Set(), pairRequests=new Map();
// dispositivo → id do participante no banco (só é preenchido no modo online)
const autorizadosOnline=new Map();
let salaOnline=null;
let debriefSnapshot=[];
let peerLastSeen=0,caseRun=Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,8),syncActor='sistema';
function pauseSimulation(){
  if(document.visibilityState==='hidden'&&simClock.paused)return;
  if(simClock.paused){simClock.resume();timerAction('start');ac?.resume?.();logEvent('Simulação retomada');}
  else {timerAction('pause');simClock.pause();ac?.suspend?.();logEvent('Simulação pausada');}
  renderScenarioControls();document.documentElement?.classList?.toggle('simulation-paused',simClock.paused);gate.rotate();$('pauseState').hidden=!simClock.paused;dirty=true;if(Number.isFinite(displayed.temp))render(simNow()<S.alarms.silencedUntil);broadcast(true);
}
function startCaseContext(name){caseName=name;caseStart=simClock.now();caseRun=Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,8);}
// Assinatura do que está desenhado. Redesenhar a caixa a cada consulta à sala
// trocaria o botão "Autorizar" embaixo do dedo do instrutor a cada três
// segundos; só redesenha quando a lista muda de verdade.
let pairRequestsDesenhado='';
function pairRequestsChave(){
  return [...pairRequests.keys()].sort().join(',')+'|'+[...autorizadosOnline.keys()].sort().join(',');
}
function renderPairRequests(forcar){
  const chave=pairRequestsChave();
  if(!forcar&&chave===pairRequestsDesenhado)return;
  pairRequestsDesenhado=chave;
  const box=$('pairRequests');box.replaceChildren();
  for(const [id,v] of pairRequests){
    const row=document.createElement('div'),b=document.createElement('button');
    row.textContent='Controle '+id.slice(-6)+' • '+(typeof v==='string'?v:v?.version||VERSION)+' ';
    b.textContent='Autorizar';b.className='btn';
    b.onclick=()=>{autorizarControle(id,typeof v==='object'?v?.participanteId:null);};
    row.append(b);box.append(row);
  }
  // No modo online a lista de autorizados vem da sala; o botão de revogar
  // devolve o aparelho à condição de pendente no banco, não só nesta aba.
  for(const [id,part] of autorizadosOnline){
    const row=document.createElement('div'),b=document.createElement('button');
    row.textContent='Controle '+id.slice(-6)+' • autorizado ';
    b.textContent='Revogar';b.className='btn';
    b.onclick=()=>{revogarControle(id,part);};
    row.append(b);box.append(row);
  }
}
function autorizarControle(id,participanteId){
  approved.clear();approved.add(id);pairRequests.delete(id);gate.rotate();
  logEvent('Instrutor autorizou controle '+id.slice(-6));
  if(salaOnline&&participanteId){
    // Autorização exclusiva: os demais voltam a pendente, como no modo local.
    for(const [outro,pid] of autorizadosOnline) if(outro!==id&&pid) salaOnline.definirSituacao(pid,'pendente').catch(()=>{});
    salaOnline.autorizar(participanteId).then(()=>sincronizarSala()).catch(e=>toast('Não foi possível autorizar: '+(e?.message||'erro')));
  }
  renderPairRequests(true);broadcast(true);
}
function revogarControle(id,participanteId){
  approved.delete(id);gate.rotate();
  logEvent('Autorização do controle '+id.slice(-6)+' revogada');
  if(salaOnline&&participanteId) salaOnline.revogar(participanteId).then(()=>sincronizarSala()).catch(e=>toast('Não foi possível revogar: '+(e?.message||'erro')));
  renderPairRequests(true);broadcast(true);
}
// Espelha a sala do banco nas estruturas que o monitor já usava. O estado
// publicado continua sendo a única fonte que o controle enxerga.
function sincronizarSala(){
  if(!salaOnline||!salaOnline.salaId)return;
  const antes=[...approved].sort().join(',');
  approved.clear();autorizadosOnline.clear();
  for(const c of salaOnline.autorizados()){approved.add(c.dispositivo);autorizadosOnline.set(c.dispositivo,c.id);}
  pairRequests.clear();
  for(const p of salaOnline.pendentes())pairRequests.set(p.dispositivo,{version:VERSION,participanteId:p.id});
  renderPairRequests();
  if([...approved].sort().join(',')!==antes){gate.rotate();dirty=true;broadcast(true);}
}

const history = new EventHistory(() => Date.now(),5000);
const examViewer = new ExamViewer(document.getElementById('examOverlay'));
function logEvent(text, key = '') { history.add(text, key,{elapsedMs:Math.max(0,simClock.now()-caseStart),actor,origin:text.startsWith('Informado:')?'informado':'detectado',caseName,caseRun}); dirty = true; }

// ---------------- Estado ----------------
let S = defaultState(), monitorExams;
try { const saved=JSON.parse(localStorage.getItem(LS_STATE));if(saved?.classroom?.customScenario)registerScenario(saved.classroom.customScenario);S=restoreState(saved);const c=saved?.classroom;if(c){automatic=c.automatic!==false;assessment=c.assessmentPreference!==false;caseRun=typeof c.caseRun==='string'?c.caseRun.slice(0,80):caseRun;caseName=String(c.caseName||'Livre').slice(0,100);if(Number.isFinite(c.caseElapsed))caseStart=simClock.now()-Math.max(0,c.caseElapsed);if(c.paused===true){simClock.pause();S.timer.running=c.timerWasRunning===true;S.timer.startedAt=simNow();}} } catch (e) { S = defaultState(); }
try { history.restore(JSON.parse(localStorage.getItem(LS_HIST))); } catch (e) {}
S.cur = { ...S.vit };
let trans = {}; // chave → {from, to, t0, dur}

let room = new URLSearchParams(location.search).get('sala');
if (!room) { try { room = localStorage.getItem(LS_ROOM); } catch (e) {} }
if (!room) room = String(Math.floor(1000 + Math.random() * 9000));
try { localStorage.setItem(LS_ROOM, room); } catch (e) {}

let eng = new Engine();
eng.rhythm = S.rhythm;

// Identidade do monitor: id estável nesta aba (sobrevive à recarga) + boot novo a cada abertura.
// O controle usa isso para distinguir "monitor recarregado" de "dois monitores na mesma sala".
const randomId = () => Array.from(crypto.getRandomValues(new Uint8Array(12)), n => n.toString(16).padStart(2, '0')).join('');
const MONITOR_ID = (() => { try { let v = sessionStorage.getItem('bmsim-monitor-id'); if (!v) { v = 'm' + randomId(); sessionStorage.setItem('bmsim-monitor-id', v); } return v; } catch (e) { return 'm' + randomId(); } })();
const BOOT = randomId();
let unloading = false;

// ---------------- Áudio ----------------
let ac = null;
const { audioOutput, tone, alarmSound, chargeSound, shockSound, stopCharge } = createMonitorAudio({getContext: () => ac, isMuted: () => S.audioMuted});

// ---------------- Canais ----------------
// A escala só troca quando a varredura reinicia: senão a mesma tela mistura duas escalas.
let co2ScaleMax = S.cur.etco2 > 52 ? 100 : 60;
const co2Max = () => co2ScaleMax;
const tr = {
  ecg: new Trace($('cvEcg'), '#4ade80', 6, 400, t => eng.ecg(t), [-1.1, 1.9]),
  spo2: new Trace($('cvPleth'), '#22d3ee', 6, 120, t => S.spo2Signal==='absent'?0:eng.pleth(t)*(S.spo2Signal==='low'?.15:1), [-0.05, 1.25]),
  capno: new Trace($('cvCapno'), '#facc15', 12, 60, t => eng.capno(t), () => [0, co2Max()]),
  resp: new Trace($('cvResp'), '#c4b5fd', 12, 50, t => eng.resp(t), [-1.3, 1.3]),
};

// ---------------- Lógica ----------------
let dirty = true;
const changed = () => { dirty = true; };

function applyVit(patch, dur = 0) {
  const t = nowS();
  for (const k of Object.keys(patch)) {
    const to = Number(patch[k]);
    if (Number.isNaN(to)) continue;
    S.vit[k] = to;
    if (dur > 0) trans[k] = { from: S.cur[k], to, t0: t, dur };
    else { delete trans[k]; S.cur[k] = to; }
  }
  changed();
}

function setRhythm(id, useTypical = false) {
  if (!RHYTHM_BY_ID[id]) return;
  if (id !== S.rhythm) cancelSync('ritmo alterado');
  S.rhythm = id;
  if (useTypical && RHYTHM_BY_ID[id].hr > 0) applyVit({ hr: RHYTHM_BY_ID[id].hr });
  changed();
}

function applySet(d, dur = 0) {
  if (d.vit) applyVit(d.vit, dur);
  if (d.rhythm) setRhythm(d.rhythm, d.typicalHr);
  for (const k of ['spo2Signal', 'pulse', 'vfAmp', 'capno', 'cpr', 'shockTo', 'studentPanel']) if (k in d) S[k] = d[k];
  for (const k of ['show', 'alarms', 'pacer', 'defib', 'nibp']) if (d[k]) {
    const allowed = k === 'defib' ? ['energy', 'sync'] : k === 'nibp' ? ['interval'] : null;
    for (const [kk, vv] of Object.entries(d[k])) if (!allowed || allowed.includes(kk)) {
      if (k === 'defib' && kk === 'energy' && vv !== S.defib.energy && S.defib.status !== 'idle') { disarm(); toast('Energia alterada — carregue novamente'); }
      if (k === 'defib' && kk === 'sync' && !vv) cancelSync('SINC desligado');
      S[k][kk] = vv;
    }
  }
  if (d.nibp && 'interval' in d.nibp) nextAutoNibp = S.nibp.interval ? simNow() + S.nibp.interval * 60000 : 0;
  changed();
}

let toastT;
function toast(txt, ms = 2500) { const el = $('toast'); el.textContent = txt; el.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove('show'), ms); }

// Desfibrilador
let chargeTimer, disarmTimer, effectTimer, captureTimer, syncWaitUntil = 0, syncRequestedAt = 0;
let generation = 0;
function cancelSync(reason) {
  if (S.defib.status !== 'sync') return;
  S.defib.status = 'ready'; syncWaitUntil = 0; syncRequestedAt = 0;
  const text = 'Choque sincronizado não aplicado: ' + reason;
  toast(text); logEvent(text); changed();
}
function charge() {
  if (S.defib.status === 'charging') return { done: false, note: 'já está carregando' };
  if (S.defib.status === 'ready' || S.defib.status === 'sync') return { done: false, note: 'já está carregado' };
  S.defib.status = 'charging'; logEvent('Carregamento iniciado: '+S.defib.energy+' J'); chargeSound(); changed();
  simClear(chargeTimer); simClear(disarmTimer);
  chargeTimer = simTimeout(() => {
    S.defib.status = 'ready'; tone(1500, .25, .15); changed();
    disarmTimer = simTimeout(() => { if (S.defib.status === 'ready' || S.defib.status === 'sync') { disarm(); toast('Desfibrilador desarmado (tempo esgotado)'); } }, 45000);
  }, 3000);
}
function disarm() {
  const was = S.defib.status; S.defib.status = 'idle';
  simClear(chargeTimer); simClear(disarmTimer);
  stopCharge();
  syncWaitUntil = 0; syncRequestedAt = 0; changed();
  if (was === 'idle') return { done: false, note: 'já estava desarmado' };
  logEvent('Desfibrilador desarmado');
}
function shock() {
  if (S.defib.status === 'sync') return { done: false, note: 'SINC já está aguardando onda R' };
  if (S.defib.status !== 'ready' && S.defib.status !== 'sync') {
    const note = S.defib.status === 'charging' ? 'ainda carregando' : 'desfibrilador não carregado';
    logEvent('Choque não aplicado: ' + note);
    return { done: false, note };
  }
  if (S.defib.sync) {
    syncActor=actor;S.defib.status = 'sync'; syncRequestedAt = nowS(); syncWaitUntil = syncRequestedAt + 5; changed();
    toast('SINC: aguardando onda R…', 1500);
    return { done: true, note: 'SINC: aguardando onda R' };
  }
  deliverShock(nowS());
}
function deliverShock(t) {
  const priorActor=actor;if(S.defib.status==='sync')actor=syncActor;
  simClear(disarmTimer);
  eng.shock(t); shockSound(); logEvent('Choque aplicado: '+S.defib.energy+' J'+(S.defib.sync?' — SINC':''));actor=priorActor;
  S.defib.shocks++; S.defib.status = 'idle';
  const wasSync = S.defib.sync;
  S.defib.sync = false; syncWaitUntil = 0; syncRequestedAt = 0;
  toast(`Choque ${wasSync ? 'sincronizado ' : ''}aplicado: ${S.defib.energy} J`);
  const step = currentStep(), scnId = S.scn.id, stepIdx = S.scn.step, gen = generation;
  simClear(effectTimer);
  effectTimer = simTimeout(() => {
    if (gen !== generation || simClock.paused) return;
    // só avança se o instrutor não tiver mudado de etapa nesse intervalo
    if (automatic && step && step.onShock === 'next' && (!step.requireSync || wasSync)) { if (S.scn.id === scnId && S.scn.step === stepIdx) goStep(stepIdx + 1); }
    else if (S.shockTo) { setRhythm(S.shockTo, true); S.shockTo = null; }
    changed();
  }, 1300);
  changed();
}

// PNI
let nibpTimer, nextAutoNibp = S.nibp.interval ? simNow() + S.nibp.interval * 60000 : 0, cuff = 0;
function startNibp() {
  if (S.nibp.measuring) return { done: false, note: 'medição já em andamento' };
  S.nibp.measuring = true; cuff = 170; logEvent('Medição de PNI iniciada'); changed();
  const t0 = simNow();
  simClear(nibpTimer);
  nibpTimer = simInterval(() => {
    const el = (simNow() - t0) / 1000;
    cuff = el < 3 ? 40 + el * 45 : Math.max(0, 175 - (el - 3) * 17);
    if (el >= 11) {
      simClear(nibpTimer);
      S.nibp.measuring = false;
      const ok = hasPulse(S) && S.cur.sys >= 30 && !S.cpr;
      if (ok) {
        const j = () => Math.round((Math.random() - 0.5) * 4);
        S.nibp.sys = Math.round(S.cur.sys) + j(); S.nibp.dia = Math.round(S.cur.dia) + j(); S.nibp.map = mapOf(S.nibp.sys, S.nibp.dia);
      } else { S.nibp.sys = S.nibp.dia = S.nibp.map = null; toast('PNI: não foi possível medir'); }
      S.nibp.at = simNow(); tone(880, .12, .12);
      if (S.nibp.interval) nextAutoNibp = simNow() + S.nibp.interval * 60000;
      changed();
    }
  }, 200);
}

// Cenários
function cancelStageTimer() {
  stageToken++;simClear(stageTimer);stageTimer=null;stageDeadline=0;
}
function stageWait() { return stageWaitOverride??currentStep()?.wait??120; }
function scheduleStage() {
  cancelStageTimer();
  const scenario=SCENARIO_BY_ID[S.scn.id];
  if(!timedAdvance||!scenario||S.scn.step>=scenario.etapas.length-1||stageWait()===0)return;
  const token=stageToken, id=S.scn.id, index=S.scn.step;
  stageDeadline=simClock.now()+stageWait()*1000;
  stageTimer=simTimeout(()=>{
    if(token!==stageToken||!timedAdvance||S.scn.id!==id||S.scn.step!==index)return;
    logEvent('Avanço pelo tempo da etapa');goStep(index+1);
  },stageWait()*1000);
}
function currentStep() { const sc = SCENARIO_BY_ID[S.scn.id]; return sc ? sc.etapas[S.scn.step] : null; }
function goStep(i) {
  const sc = SCENARIO_BY_ID[S.scn.id]; if (!sc) return { done: false, note: 'nenhum cenário em andamento' };
  i = clamp(i, 0, sc.etapas.length - 1);
  // Uma etapa nova também invalida comandos preparados com o estado anterior.
  gate.rotate(); cancelSync('etapa alterada');
  generation++; simClear(effectTimer); simClear(captureTimer);
  cancelStageTimer();stageWaitOverride=null;
  S.scn.step = i; S.exam=null; renderExam();
  wasCaptured = false;
  logEvent(sc.titulo+" — etapa "+(i+1)+": "+sc.etapas[i].titulo);
  const e = sc.etapas[i];
  applySet(scenarioStepSet(sc,i), e.dur || 0);
  scheduleStage();
  changed();
}

// Cronômetro
function timerAction(a) {
  const t = S.timer, n = simNow();
  if (a === 'start' && !t.running) { t.running = true; t.startedAt = n; }
  else if (a === 'pause' && t.running) { t.acc = Math.max(0, t.acc + Math.max(0, n - t.startedAt)); t.running = false; }
  else if (a === 'toggle') return timerAction(t.running ? 'pause' : 'start');
  else if (a === 'reset') { t.running = false; t.acc = 0; t.startedAt = 0; }
  setTxt('timer',fmtTime(timerSeconds(t,n)));
  changed();
}

// O que será interrompido ao trocar de caso ou reiniciar (informado ao instrutor e ao histórico).
function pendingSummary() { return interruptedActivities(S, trans); }
function resetSimulation() {
  timedAdvance=false;stageWaitOverride=null;cancelStageTimer();
  gate.rotate();
  generation++; simClear(effectTimer); simClear(captureTimer); simClear(nibpTimer); disarm();
  // Preferências do instrutor sobrevivem à troca de caso: parâmetros visíveis, botões dos alunos, alarmes e bipe.
  const audioMuted=S.audioMuted, show = S.show, studentPanel = S.studentPanel, alarmsOn = S.alarms.enabled, beep = S.alarms.beep;
  S = defaultState(); S.audioMuted=audioMuted; S.show = show; S.studentPanel = studentPanel; S.alarms.enabled = alarmsOn; S.alarms.beep = beep; S.cur = { ...S.vit };
  trans = {}; nextAutoNibp = 0; cuff = 0; wasCaptured = false; eng = new Engine(); acquisitionUntil = nowS() + 4;
  changed();
}
function action(name, arg) {
  if(name==='audio-mute'){
    if(typeof arg!=='boolean')return {done:false,note:'dado inválido'};
    S.audioMuted=arg;if(ac)audioOutput();renderScenarioControls();
    logEvent(arg?'Todos os sons silenciados':'Sons restaurados');changed();return;
  }
  if(name==='timer'&&arg==='reset'){timerAction('reset');if(!simClock.paused)timerAction('start');return;}
  if(name==='exam'){if(arg!==null&&(typeof arg!=='string'||!Object.hasOwn(EXAM_BY_ID,arg)))return {done:false,note:'exame inválido'};S.exam=arg;renderExam();logEvent(arg?'Exame: '+EXAM_BY_ID[arg].label:'Exame fechado');changed();return;}
  if(name==='pause-simulation'){pauseSimulation();return;}
  if(name==='debrief'){const page=Number(arg);if(!Number.isInteger(page)||page<0||page>250)return {done:false,note:'página inválida'};if(page===0)debriefSnapshot=history.events.map(e=>({...e}));return {done:true,events:debriefSnapshot.slice(page*20,page*20+20),total:debriefSnapshot.length};}
  if(name==='audio-test'){if(simClock.paused)return {done:false,note:'Retome a simulação antes do teste de áudio'};tone(700,.2,.12);return {done:!!ac,note:ac?'Som solicitado no monitor':'Inicie o monitor para habilitar áudio'};}
  if(simClock.paused&&!['scn-load','custom-load','timed-advance','stage-wait'].includes(name))return {done:false,note:'simulação pausada; retome antes de alterar'};
  if(name==='timed-advance'&&typeof arg==='boolean'){timedAdvance=arg;scheduleStage();logEvent('Avanço por tempo '+(arg?'ativado':'desativado'));changed();return;}
  if(name==='stage-wait'&&Number.isInteger(arg)&&(arg===0||(arg>=15&&arg<=600))){stageWaitOverride=arg;scheduleStage();logEvent('Tempo da etapa: '+arg+' s');changed();return;}
  if(name==='advance-mode' && ['auto','manual'].includes(arg)){automatic=arg==='auto';generation++;simClear(effectTimer);simClear(captureTimer);wasCaptured=false;logEvent('Avanço '+(automatic?'automático':'manual'));changed();return;}
  if(name==='assessment' && typeof arg==='boolean'){assessment=arg;logEvent(arg?'Modo avaliação':'Modo ensino');evaluate();changed();return;}
  if(name==='annotation' && typeof arg==='string' && arg.trim() && arg.length<=180){logEvent('Informado: '+arg.trim());changed();return;}
  if(name==='custom-load'){const sc=registerScenario(arg);if(!sc)return {done:false,note:'cenário inválido'};return action('scn-load',sc.id);}

  const invalid = { done: false, note: 'dado inválido' };
  switch (name) {
    case 'scn-go': if (!Number.isInteger(arg)) return invalid; break;
    case 'scn-load': if (!Object.hasOwn(SCENARIO_BY_ID,arg)) return invalid; break;
    case 'timer': if (!['start', 'pause', 'toggle', 'reset'].includes(arg)) return invalid; break;
  }
  const noScn = { done: false, note: 'nenhum cenário em andamento' };
  switch (name) {
    case 'charge': return charge();
    case 'shock': return shock();
    case 'disarm': return disarm();
    case 'nibp': return startNibp();
        case 'silence': {
      const on = simNow() < S.alarms.silencedUntil;
      S.alarms.silencedUntil = on ? 0 : simNow() + 120000;
      logEvent(on ? 'Alarmes reativados' : 'Alarmes silenciados por 2 min'); changed();
      return on ? { done: true, note: 'alarmes reativados' } : undefined;
    }
    case 'timer': timerAction(arg); return;
    case 'scn-load': {
      const cancelled = pendingSummary();
      resetSimulation(); S.scn = { id: arg, step: 0 }; startCaseContext(SCENARIO_BY_ID[arg].titulo);
      logEvent('Novo caso: ' + SCENARIO_BY_ID[arg].titulo + (cancelled.length ? ' — interrompido: ' + cancelled.join(', ') : ''));
      goStep(0); timerAction('reset'); if(!simClock.paused)pauseSimulation();evaluate();changed();
      return cancelled.length ? { done: true, note: 'interrompido: ' + cancelled.join(', ') } : undefined;
    }
    case 'scn-go': if (!S.scn.id) return noScn; return goStep(arg);
    case 'scn-next': {
      const sc = SCENARIO_BY_ID[S.scn.id]; if (!sc) return noScn;
      if (S.scn.step >= sc.etapas.length - 1) return { done: false, note: 'já está na última etapa' };
      return goStep(S.scn.step + 1);
    }
    case 'scn-prev':
      if (!S.scn.id) return noScn;
      if (S.scn.step <= 0) return { done: false, note: 'já está na primeira etapa' };
      return goStep(S.scn.step - 1);
    case 'scn-stop':
      if (!S.scn.id) return noScn;
      timedAdvance=false;cancelStageTimer();gate.rotate(); logEvent('Cenário encerrado'); generation++; simClear(effectTimer); simClear(captureTimer); S.scn = { id: null, step: 0 };startCaseContext('Livre');changed(); return;
    case 'reset': {
      const cancelled = pendingSummary();
      resetSimulation(); startCaseContext('Livre');logEvent('Monitor reiniciado' + (cancelled.length ? ' — interrompido: ' + cancelled.join(', ') : ''));
      return cancelled.length ? { done: true, note: 'interrompido: ' + cancelled.join(', ') } : undefined;
    }
  }
  return { done: false, note: 'comando desconhecido' };
}

// ---------------- Comunicação ----------------
// Short-lived leases expire on this monitor, not on the controller's clock.
const gate = new CommandGate(() => performance.now());
// Resposta ao controle: ok=false → recusado (motivo); ok=true e done=false → recebido mas não executado (motivo).
const transport = new Transport(room, msg => {
  if(msg.type==='pair-request' && typeof msg.from==='string' && /^c[a-f0-9]{32}$/.test(msg.from)){
    if(msg.version!==VERSION)return;
    peerLastSeen=Date.now();
    // No modo online a fila de autorização vem da sala, nunca da rede: só o
    // banco sabe o id do participante, que é o que `autorizarControle` precisa
    // para gravar a autorização. Criar aqui uma entrada sem esse id produziria
    // um botão que aprova só nesta aba e é revertido na sincronização seguinte.
    if(salaOnline){ salaOnline.atualizarParticipantes().then(sincronizarSala).catch(()=>{}); dirty=true; return; }
    if(!approved.has(msg.from)&&!pairRequests.has(msg.from)&&pairRequests.size<16){pairRequests.set(msg.from,{version:VERSION,participanteId:null});renderPairRequests();}
    dirty=true;return;
  }
  if(msg.type==='peer-left'){approved.delete(msg.peer);pairRequests.delete(msg.peer);renderPairRequests();gate.invalidate();dirty=true;return;}
  if(msg.type==='ping'&&approved.has(msg.from))peerLastSeen=Date.now();

  if (msg.type === 'hello') { dirty = true; }
  else if (msg.type === 'cmd') {
    const reply = o => transport.send({ type: 'ack', to: msg.from, seq: msg.seq, ...o });
    if(transport.mode==='local'&&transport.info?.security!=='socket-identity-v1')return reply({ok:false,reason:'Atualize o executável local para esta revisão'});
    // No modo online a identidade já foi conferida pela assinatura em
    // transport.receberAssinada(): uma mensagem só chega aqui se a assinatura
    // fechou com a chave que aquele aparelho registrou nesta sala, e se o
    // papel cadastrado permite enviar comandos. `approved` continua valendo
    // como a autorização explícita do instrutor.
    if(!approved.has(msg.from))return reply({ok:false,reason:'controle não autorizado no monitor'});
    if(msg.version!==VERSION)return reply({ok:false,reason:'versões diferentes'});
    if (document.visibilityState === 'hidden') return reply({ ok: false, reason: REFUSAL_TEXT.hidden });
    if (!gate.accept(msg)) return reply({ ok: false, reason: REFUSAL_TEXT[gate.reason] || 'comando recusado' });
    let r; const previousActor=actor;actor='instrutor';
    if(simClock.paused&&msg.cmd==='set'){actor=previousActor;return reply({ok:false,reason:'simulação pausada'});}
    if (msg.cmd === 'set') {
      const patch = sanitizeSet(msg.data), dur = clamp(Number(msg.dur) || 0, 0, 600);
      if (!Object.keys(patch).length) r = { done: false, note: 'ajuste inválido' };
      else { applySet(patch, dur); logEvent(describeSet(patch, patch.vit ? dur : 0), 'set:' + msg.from + ':' + setMergeKey(patch)); }
    } else if (msg.cmd === 'action' && typeof msg.name === 'string') {
      r = action(msg.name, msg.arg);
      if (r && r.done === false && msg.name !== 'shock') logEvent(describeAction(msg.name, msg.arg) + ' não executado: ' + r.note);
    } else r = { done: false, note: 'comando desconhecido' };
    actor=previousActor;
    reply({ ok: true, done: r?.done !== false, note: r?.note || '', ...(r?.events?{events:r.events,total:r.total}: {}) });
  }
}, (st, mode) => {
  $('connDot').className = 'dot ' + st;
  gate.invalidate();approved.clear();pairRequests.clear();autorizadosOnline.clear();
  if (st === 'on') {
    dirty = true; offlineSince = 0;
    // A sala do banco é a fonte da autorização online; recupera na hora para
    // que uma reconexão não obrigue o instrutor a autorizar tudo de novo.
    if (mode === 'online' && salaOnline) salaOnline.atualizarParticipantes(true).then(sincronizarSala).catch(()=>{});
  }
  else if (!offlineSince) offlineSince = Date.now();
}, MONITOR_ID, {
  criarSeguranca: async () => {
    // Uma tentativa anterior pode ter deixado temporizadores rodando.
    clearInterval(salaOnlineTimer); salaOnline?.pararTarefas?.();
    salaOnline = new SalaOnline({
      url: CONFIG.supabaseUrl, chave: CONFIG.supabaseKey, codigo: room,
      dispositivo: MONITOR_ID, papel: 'monitor', armazenamento: localStorage,
      aoMudar: () => { sincronizarSala(); dirty = true; },
    });
    await salaOnline.conectar();
    // Mesmo antes de qualquer mensagem, a fila de autorização já reflete a sala.
    salaOnlineTimer = setInterval(sincronizarSala, 3000);
    return salaOnline;
  },
  aoRecusar: (motivo) => { logEvent('Mensagem online recusada: ' + motivo, 'online-recusa'); },
});
let salaOnlineTimer = null;
let offlineSince = Date.now();

let displayed = {}, alarmsNow = [];
function transLeft() { const t = nowS(), o = {}; for (const [k, tr_] of Object.entries(trans)) o[k] = Math.max(0, Math.round((tr_.t0 + tr_.dur - t) * 1000)); return o; }
function publicState() {
  return { ...S, timedAdvance,stageWait:stageWait(),stageRemaining:stageDeadline?Math.max(0,Math.ceil((stageDeadline-simClock.now())/1000)):0, version:VERSION, paused:simClock.paused, automatic, assessment, authorized:[...approved], customScenario:S.scn.id?.startsWith('custom-')?SCENARIO_BY_ID[S.scn.id]:null, peerRecent:Date.now()-peerLastSeen<5000, protocol: 2, history: history.snapshot(), ...gate.issue(), timer: {...S.timer, running:S.timer.running&&!simClock.paused, elapsedMs: Math.max(0, S.timer.acc + (S.timer.running ? simNow() - S.timer.startedAt : 0))}, displayed, alarmsNow, captured: eng.captured(), perfusing: hasPulse(S), transLeft: transLeft(), room, mode: transport.mode, hidden: document.visibilityState === 'hidden', nibp: { ...S.nibp, cuff: S.nibp.measuring ? Math.round(cuff) : null } };
}
let lastBroadcast = 0;
function broadcast(force) {
  const n = Date.now();
  if (!force && n - lastBroadcast < 900) return;
  lastBroadcast = n; dirty = false;
  transport.send({ type: 'state', boot: BOOT, state: publicState() });
  try { const { cur, ...save } = S; localStorage.setItem(LS_STATE, JSON.stringify({...save,timer:{...S.timer,acc:publicState().timer.elapsedMs,startedAt:Date.now(),running:S.timer.running&&!simClock.paused},classroom:{timerWasRunning:S.timer.running,caseElapsed:simClock.now()-caseStart,caseName,caseRun,automatic,assessment,assessmentPreference:assessment,paused:simClock.paused,customScenario:publicState().customScenario}})); localStorage.setItem(LS_HIST, JSON.stringify(history.events)); } catch (e) {}
}

// ---------------- Alarmes e números ----------------
const bootT = nowS();
let acquisitionUntil = bootT + 4;
let lastAlarmSound = 0, bannerIdx = 0, wasCaptured = false, lastCapLogged = false;
function evaluate() {
  const t = nowS();
  ({ displayed, alarmsNow } = evaluateReadings(S, eng, {t, epochNow: simNow(), bootT, acquisitionUntil}));

  // som
  const silenced = simNow() < S.alarms.silencedUntil;
  if (!simClock.paused && alarmsNow.length && !silenced && ac) {
    const lvl = alarmsNow[0].level, every = lvl === 'high' ? 6000 : 20000;
    if (Date.now() - lastAlarmSound > every) { alarmSound(lvl); lastAlarmSound = Date.now(); }
  }
  // captura → cenário
  const cap = eng.captured();
  if (!simClock.paused && cap && !wasCaptured) {
    const st = currentStep(), scnId = S.scn.id, stepIdx = S.scn.step;
    if (automatic && st && st.onCapture === 'next') { const gen = generation; simClear(captureTimer); captureTimer = simTimeout(() => { if (automatic && gen === generation && eng.captured() && S.scn.id === scnId && S.scn.step === stepIdx) goStep(stepIdx + 1); }, 4000); }
  }
  wasCaptured = cap;
  if (!simClock.paused && S.pacer.on && cap !== lastCapLogged) logEvent(cap ? 'Captura do marcapasso obtida' + (hasPulse(S) ? '' : ' — elétrica, sem pulso') : 'Captura do marcapasso perdida');
  lastCapLogged = S.pacer.on ? cap : false;
  // PNI automática
  if (!simClock.paused && S.nibp.interval && nextAutoNibp && simNow() > nextAutoNibp && !S.nibp.measuring) startNibp();
  render(silenced);
}

function setTxt(id, v) { const el = $(id); const s = String(v); if (el.textContent !== s) el.textContent = s; }
function renderExam() {
  examViewer.show(EXAM_BY_ID[S.exam] || null);
  setTxt('examSimulationStatus',simClock.paused?'Simulação pausada.':S.audioMuted?'Simulação em andamento · todos os sons silenciados.':'Simulação em andamento.');
  monitorExams?.refresh();
}
function renderScenarioControls() {
  const scenario=SCENARIO_BY_ID[S.scn.id];
  const label=simClock.paused?'Retomar simulação':'Pausar simulação';
  $('bMonitorPause').setAttribute('data-paused',String(simClock.paused));
  $('bMonitorMute').setAttribute('aria-pressed',String(S.audioMuted));
  $('bMonitorMute').setAttribute('aria-label',S.audioMuted?'Reativar todos os sons':'Silenciar todos os sons');
  $('bMonitorPause').setAttribute('aria-label',label);
  $('bMonitorPause').title=label;
  $('bMonitorPrev').disabled=simClock.paused||!scenario||S.scn.step<=0;
  $('bMonitorNext').disabled=simClock.paused||!scenario||S.scn.step>=scenario.etapas.length-1;
}
function render(silenced) {
  renderScenarioControls();
  renderExam();
  const d = displayed;
  setTxt('nHr', d.hr ?? '--');
  setTxt('nSpo2', d.spo2 ?? '--');
  setTxt('nEtco2', S.capno === 'none' || S.cur.rr === 0 ? '--' : d.etco2);
  setTxt('nRr', d.rr);
  setTxt('nTemp', d.temp.toFixed(1).replace('.', ','));
  if (S.nibp.measuring) { setTxt('nSys', Math.round(cuff)); setTxt('nDia', '--'); setTxt('nMap', '--'); setTxt('nibpInfo', 'medindo…'); }
  else {
    setTxt('nSys', S.nibp.sys ?? '--'); setTxt('nDia', S.nibp.dia ?? '--'); setTxt('nMap', S.nibp.map ?? '--');
    setTxt('nibpInfo', S.nibp.at ? new Date(S.nibp.at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) + (S.nibp.interval ? ` · ${S.nibp.interval} min` : '') : 'mmHg');
  }
  $('perfBar').style.width = (d.spo2 ? clamp((S.cur.sys - 35) / 70, 0.1, 1) * 100 : 0) + '%';
  // visibilidade
  document.querySelectorAll('[data-ch]').forEach(el => el.classList.toggle('hiddenCh', !S.show[el.dataset.ch]));
  // alarmes
  const alarmChs = new Set(alarmsNow.map(a => a.ch));
  document.querySelectorAll('.num[data-ch], .num.split > div[data-ch]').forEach(el => el.classList.toggle('alarm', alarmChs.has(el.dataset.ch)));
  const b = $('banner');
  if (alarmsNow.length) {
    const top = alarmsNow.filter(x => x.level === alarmsNow[0].level);
    bannerIdx = (bannerIdx + 1) % (top.length * 3);
    const a = top[Math.floor(bannerIdx / 3) % top.length];
    b.className = 'banner ' + a.level; setTxt('banner', (silenced ? '🔕 ' : '') + (assessment&&a.ch==='ecg'?'Verifique o paciente e o ECG':a.txt));
  } else { b.className = 'banner'; setTxt('banner', ''); }
  // painel
  $('app').classList.toggle('no-controls', !S.studentPanel);
  setTxt('energy', S.defib.energy);
  setTxt('shockCount', `Choques: ${S.defib.shocks}`);
  $('bSync').classList.toggle('on', S.defib.sync);
  $('bCharge').classList.toggle('charging', S.defib.status === 'charging');
  $('bCharge').classList.toggle('ready', S.defib.status === 'ready' || S.defib.status === 'sync');
  setTxt('chargeTxt', S.defib.status === 'charging' ? 'Carregando…' : S.defib.status === 'ready' || S.defib.status === 'sync' ? 'Carregado' : 'Carregar');
  $('bShock').disabled = !(S.defib.status === 'ready');
  $('bDisarm').disabled = S.defib.status === 'idle';
  $('bPacer').classList.toggle('on', S.pacer.on); setTxt('pacerTxt', S.pacer.on ? 'Marcapasso ligado' : 'Ligar marcapasso');
  $('bCpr').classList.toggle('on', S.cpr); $('bCpr').setAttribute('aria-pressed', String(S.cpr)); setTxt('cprTxt', S.cpr ? 'RCP em andamento' : 'Iniciar RCP');
  setTxt('pRate', S.pacer.rate); setTxt('pMa', S.pacer.ma);
  setTxt('paceLbl', S.pacer.on ? `MARCAPASSO ${S.pacer.rate} ppm · ${S.pacer.ma} mA` : S.defib.sync ? 'SINC' : '');
  $('bSilence').classList.toggle('on', silenced);
  setTxt('co2Scale', `0–${co2Max()}`);
  const off = offlineSince && Date.now() - offlineSince > 8000;
  setTxt('connTxt', off ? (transport.mode === 'online' ? (transport.motivo || 'Sem conexão') : 'Desconectado') : '');
  $('roomChip').classList.toggle('bad', !!off);
}

// ---------------- Loop ----------------
let lastEval = 0, heartOff = 0;
function frame() {
  if(simClock.paused){if(!Number.isFinite(displayed.temp))evaluate();if(dirty||Date.now()-lastBroadcast>1000)broadcast(true);requestAnimationFrame(frame);return;}
  const t = nowS();
  // Conferir prazo antes de consumir eventos acumulados após suspensão da página.
  if (S.defib.status === 'sync' && t >= syncWaitUntil) cancelSync('sem onda R em 5 s');
  // transições
  for (const [k, tr_] of Object.entries(trans)) {
    const f = clamp((t - tr_.t0) / tr_.dur, 0, 1);
    S.cur[k] = tr_.from + (tr_.to - tr_.from) * f;
    if (f >= 1) delete trans[k];
  }
  const pulse = hasPulse(S);
  eng.setParams({ hr: S.cur.hr, sys: S.cur.sys, pulse, cpr: S.cpr, vfAmp: S.vfAmp, pacer: S.pacer, rr: S.cur.rr, etco2: S.cur.etco2, capno: S.capno, spo2: S.cur.spo2 });
  eng.setRhythm(S.rhythm, t);
  eng.schedule(t);
  for (const k in tr) tr[k].draw(t, !S.show[k]);
  const beats = eng.popBeats(t);
  if (beats.length) {
    if (S.show.ecg) { $('heart').classList.add('beat'); heartOff = t + 0.12; }
    if (S.alarms.beep && ac && S.show.ecg && !S.cpr) {
      const sp = displayed.spo2; tone(sp ? 440 + (sp - 70) * 16 : 700, 0.06, 0.08);
    }
    if (S.defib.sync) for (const b of beats) tr.ecg.mark(b.t);
    // Nunca sincronizar com um QRS anterior ao pedido ou acumulado durante um travamento.
    const syncBeat = beats.find(b => b.t >= syncRequestedAt && t - b.t <= .1);
    if (S.defib.status === 'sync' && S.defib.sync && syncBeat) deliverShock(Math.max(t, syncBeat.t + 0.01));
  }
  if (tr.capno.wrapped) { tr.capno.wrapped = false; co2ScaleMax = S.cur.etco2 > 52 ? 100 : 60; }
  if (t > heartOff) $('heart').classList.remove('beat');
  if (t - lastEval > 0.5) { lastEval = t; evaluate(); setTxt('timer', fmtTime(Math.floor(publicState().timer.elapsedMs/1000))); setTxt('clock', new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })); }
  if (dirty) broadcast(true); else if (Object.keys(trans).length || S.nibp.measuring) broadcast(false); else if (Date.now() - lastBroadcast > 1000) broadcast(true);
  requestAnimationFrame(frame);
}

// ---------------- Controles do monitor ----------------
const on = (id, fn) => $(id).addEventListener('click', e=>{if(simClock.paused&&!['roomChip','bCloseQr','bNewRoom','bStart'].includes(id))return toast('Simulação pausada');const prev=actor;actor='aluno';try{return fn(e);}finally{actor=prev;}});
$('bCloseExam').addEventListener('click',()=>action('exam',null));
monitorExams=initMonitorExams({getState:()=>S,show:id=>{const previousActor=actor;actor='instrutor';try{action('exam',id);}finally{actor=previousActor;}}});
on('bNibp', () => startNibp());
const energyLog = () => logEvent(`Monitor: energia ${S.defib.energy} J`, 'mon:energy');
const energyStep = d => {
  const i = ENERGIES.indexOf(S.defib.energy);
  const from = i < 0 ? (d < 0 ? ENERGIES.findIndex(e => e >= S.defib.energy) : 0) : i;
  S.defib.energy = ENERGIES[clamp(from + d, 0, ENERGIES.length - 1)];
  if (S.defib.status !== 'idle') { disarm(); toast('Energia alterada — carregue novamente'); }
  energyLog(); changed();
};
on('bEnDown', () => energyStep(-1));
on('bEnUp', () => energyStep(1));
on('bSync', () => { applySet({defib:{sync:!S.defib.sync}}); logEvent('Monitor: SINC ' + (S.defib.sync ? 'ligado' : 'desligado'), 'mon:sync'); changed(); });
on('bCharge', () => charge());
on('bShock', () => shock());
on('bDisarm', () => disarm());
// Alunos: RCP, marcapasso e energia direto no monitor (registrados no histórico com o prefixo "Monitor:").
on('bCpr', () => { S.cpr = !S.cpr; if (S.cpr) S.capno = 'rcp'; logEvent('Monitor: RCP ' + (S.cpr ? 'iniciada' : 'pausada')); changed(); });
on('bPacer', () => { S.pacer.on = !S.pacer.on; logEvent('Monitor: marcapasso ' + (S.pacer.on ? 'ligado' : 'desligado')); changed(); });
const pacerStep = (k, d, lim) => { S.pacer[k] = clamp(S.pacer[k] + d, ...lim); logEvent(k === 'ma' ? `Monitor: marcapasso ${S.pacer.ma} mA` : `Monitor: marcapasso ${S.pacer.rate} ppm`, 'mon:pacer:' + k); changed(); };
on('bRateDown', () => pacerStep('rate', -5, PACER_LIMITS.rate));
on('bRateUp', () => pacerStep('rate', 5, PACER_LIMITS.rate));
on('bMaDown', () => pacerStep('ma', -5, PACER_LIMITS.ma));
on('bMaUp', () => pacerStep('ma', 5, PACER_LIMITS.ma));
on('bSilence', () => action('silence'));
$('bMonitorMute').addEventListener('click',()=>action('audio-mute',!S.audioMuted));

// QR / sala
let ipIdx = 0;
function controlUrl() {
  const info = transport.info;
  let base;
  if (transport.mode === 'local' && info?.ips?.length) base = `http://${info.ips[Math.min(ipIdx, info.ips.length - 1)]}:${info.port}`;
  else base = location.origin + location.pathname.replace(/[^/]*$/, '');
  return base.replace(/\/$/, '') + '/controle.html?sala=' + room + (transport.mode === 'demo' ? '&modo=demo' : '');
}
let qrcode = null;
async function renderQr(el) {
  try {
    if (!qrcode) qrcode = (await import('./vendor/qrcode.mjs')).default;
    const q = qrcode(0, 'M'); q.addData(controlUrl()); q.make();
    el.innerHTML = q.createImgTag(6, 8, 'QR code do controle');
  } catch (e) { el.innerHTML = '<div style="padding:20px;color:#111;line-height:1.3;font-weight:700">QR indisponível<br>use o código</div>'; }
}
function refreshRoomUi() {
  ['roomCode', 'roomCodeBig', 'roomCodeModal'].forEach(id => setTxt(id, room));
  const url = controlUrl();
  setTxt('ctrlUrl', url.replace(/^https?:\/\//, '')); setTxt('ctrlUrl2', url.replace(/^https?:\/\//, ''));
  renderQr($('qrStart')); renderQr($('qrModalBox'));
  setTxt('modeLbl', { local: 'Modo local (Wi-Fi, sem internet)', online: 'Modo online', demo: 'Modo demonstração (mesmo aparelho)' }[transport.mode] || '');
  // mais de uma rede (ex.: Wi-Fi e cabo): deixa escolher qual endereço vai no QR
  const ips = transport.mode === 'local' ? (transport.info?.ips || []) : [];
  ['ipPick', 'ipPick2'].forEach(id => {
    const box = $(id);
    box.hidden = ips.length < 2;
    box.innerHTML = ips.length < 2 ? '' : '<span class="muted small">Rede do celular:</span>' + ips.map((ip, i) => `<button class="btn ghost small ${i === ipIdx ? 'on' : ''}" data-ip="${i}">${ip}</button>`).join('');
  });
}
document.addEventListener('click', e => {
  const b = e.target.closest('[data-ip]'); if (!b) return;
  ipIdx = Number(b.dataset.ip); refreshRoomUi();
});
on('roomChip', () => { refreshRoomUi(); $('qrModal').hidden = false; });
on('bCloseQr', () => { $('qrModal').hidden = true; });
// Trocar de sala derruba o controle que já está pareado: exige confirmação em dois toques.
let newRoomArmed = 0;
on('bNewRoom', () => {
  const b = $('bNewRoom');
  if (Date.now() > newRoomArmed) {
    newRoomArmed = Date.now() + 6000; b.textContent = 'Confirmar nova sala';
    toast('O controle atual será desconectado. Toque de novo para confirmar.', 6000);
    setTimeout(() => { if (Date.now() > newRoomArmed) b.textContent = 'Nova sala'; }, 6200);
    return;
  }
  const n = String(Math.floor(1000 + Math.random() * 9000));
  try { localStorage.setItem(LS_ROOM, n); } catch (e) {}
  location.search = '?sala=' + n;
});

async function keepAwake() { try { await navigator.wakeLock?.request('screen'); } catch (e) {} }
document.addEventListener('visibilitychange', () => {
  gate.invalidate();
  if (document.visibilityState === 'visible') { keepAwake(); broadcast(true); return; }
  cancelSync('monitor em segundo plano');
  if(!simClock.paused)pauseSimulation();
  // Espera um instante: numa recarga/fechamento o aviso certo é "monitor reiniciando", não "saiu da tela".
  setTimeout(() => { if (!unloading) broadcast(true); }, 400);
});
window.addEventListener?.('pagehide', () => { unloading = true; transport.send({ type: 'bye', boot: BOOT }); });
// sem HTTPS (ex.: tablet no modo local) o navegador não deixa impedir que a tela apague
if (!('wakeLock' in navigator) || !window.isSecureContext) $('awakeTip').hidden = false;
on('bStart', async () => {
  try { ac = new (window.AudioContext || window.webkitAudioContext)(); await ac.resume();if(simClock.paused)await ac.suspend(); } catch (e) {}
  try { await document.documentElement.requestFullscreen?.(); } catch (e) {}
  keepAwake();
  $('startOverlay').hidden = true;
});

(async () => {
  await transport.start();
  refreshRoomUi();
  if(document.visibilityState==='hidden'&&!simClock.paused)pauseSimulation();
  requestAnimationFrame(frame);
})();

$('bRevokeControl').addEventListener('click',()=>{
  // No modo online a revogação precisa valer no banco: só limpar esta aba
  // deixaria o controle ainda dentro do canal da sala.
  if(salaOnline)for(const [,pid] of autorizadosOnline)if(pid)salaOnline.revogar(pid).catch(()=>{});
  approved.clear();autorizadosOnline.clear();gate.rotate();logEvent('Autorização do controle revogada');renderPairRequests();broadcast(true);
});
for(const [id,name] of [['bMonitorPrev','scn-prev'],['bMonitorPause','pause-simulation'],['bMonitorNext','scn-next']]) {
  $(id).addEventListener('click',()=>{
    if(document.visibilityState==='hidden')return;
    const previousActor=actor;actor='instrutor';
    try { action(name);renderScenarioControls(); }
    finally { actor=previousActor; }
  });
}
renderScenarioControls();
$('bTestAudioLocal').addEventListener('click',()=>{if(simClock.paused)return toast('Retome a simulação antes do teste de áudio');if(!ac){try{ac=new (window.AudioContext||window.webkitAudioContext)();}catch{}}ac?.resume?.();tone(700,.2,.12);});
$('releaseVersion').textContent=VERSION;$('pauseState').hidden=!simClock.paused;document.documentElement?.classList?.toggle('simulation-paused',simClock.paused);

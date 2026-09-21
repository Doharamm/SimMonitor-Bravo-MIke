import { createControllerCases } from './controller-cases.js';
import { VERSION, registerScenario } from './classroom.js';
import { initClassroom } from './classroom-ui.js';
import { validPublicState } from './state-validation.js';
import { filterExams } from './exam-search.js';
import { examsForState } from './case-exams.js';
import { historyText, historyLine } from './history.js';
import { remoteTimerSeconds, MonitorPresence, STATE_MAX_AGE_MS } from './session.js';
import { EXAM_BY_ID } from './exams.js';
import { RHYTHMS, RHYTHM_BY_ID, RHYTHM_GROUPS } from './rhythm-catalog.js';
import { ENERGIES, VITAL_DEFS, PACER_LIMITS, VITAL_PRESETS } from './simulation-config.js';
import { SCENARIO_BY_ID } from './scenario-catalog.js';
import { clamp, fmtTime, interruptedActivities } from './simulation-state.js';
import { describeSet, describeAction, fmtDur, fmtVital } from './descriptions.js';
import { Transport } from './transport.js';
import { SalaOnline } from './online-room.js';
import { CONFIG } from './config.js';

const $ = id => document.getElementById(id);
const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];
const LS_ROOM = 'bmsim-ctrl-room';
const LS_ID = 'bmsim-ctrl-id';
let myId = null;
// O identificador do aparelho é guardado: sem isso, cada recarga da página
// viraria um controle novo e o instrutor teria de autorizar outra vez. Quem foi
// revogado continua revogado — a situação vive na sala, não aqui.
try { const guardado = localStorage.getItem(LS_ID); if (/^c[a-f0-9]{32}$/.test(guardado || '')) myId = guardado; } catch (e) {}
if (!myId) {
  myId = 'c' + Array.from(crypto.getRandomValues(new Uint8Array(16)), n => n.toString(16).padStart(2,'0')).join('');
  try { localStorage.setItem(LS_ID, myId); } catch (e) {}
}

let classroomUI=null;
let salaOnline=null;
let S = null, lastStateAt = 0, transport, dur = 0;
const pending = {}; let pendingTimer;
let receivedAt = 0, seq = 0, monitorId = null, monitorBoot = null, roomConflict = false, pendingAt = 0, pendingSession = null;
let monitorRestartingSince = 0;
const awaiting = new Map();
const presence = new MonitorPresence(() => performance.now());
let latestSeq = 0, editVersion = 0;
function clearAwaiting(txt) {
  const had = awaiting.size;
  for (const entry of awaiting.values()) clearTimeout(entry.timer);
  awaiting.clear();
  // Sem isto, um comando sem confirmação ficava para sempre em "enviando…".
  if (had && txt) commandStatus(txt, 'err');
}
function latestStatus(id,txt,state) { if(id === latestSeq)commandStatus(txt,state); else if(state === 'err')toast(txt); }
function discardPending() { editVersion++; clearTimeout(pendingTimer); for (const k in pending) delete pending[k]; }
function canSend() { return unavailableReason() === ''; }
function unavailableReason() {
  if (!transport?.connected) return 'Sem conexão — ' + (transport?.motivo || 'comando não enviado');
  if (roomConflict) return 'Mais de um monitor aberto nesta sala. Feche o duplicado e aguarde a recuperação.';
  if (monitorRestartingSince) return 'Monitor reiniciando — comando não enviado';
  if (!S) return 'Aguardando o monitor — confira a sala '+room;
  if (receivedAt<=0 || performance.now()-receivedAt>=STATE_MAX_AGE_MS) return 'Monitor sem resposta recente — comando não enviado';
  // O modo online passou a valer: a identidade de cada mensagem é conferida
  // por assinatura e a sala isola quem pode ler e escrever. Não há mais
  // exigência de servidor local aqui.
  if(S.version!==VERSION)return 'Versões diferentes; atualize controle e monitor';
  if(!S.authorized?.includes(myId))return 'Aguardando autorização deste controle no monitor';
  if (S.hidden) return 'Monitor em segundo plano. Volte à tela do monitor e clique em Retomar simulação.';
  if (!S.lease) return 'Aguardando autorização de comandos pelo monitor';
  return '';
}
function commandStatus(txt, state = '') { const el = $('commandStatus'); el.textContent = txt; if (el.dataset) el.dataset.state = state; }
const shortText = v => String(v ?? '').slice(0, 140);

// ---------- Entrada na sala ----------
const params = new URLSearchParams(location.search);
let room = params.get('sala');
function init() {
if (!room) {
  $('join').hidden = false;
  try { $('joinCode').value = localStorage.getItem(LS_ROOM) || ''; } catch (e) {}
  $('bJoin').onclick = () => {
    const c = $('joinCode').value.trim();
    if (!/^\d{3,6}$/.test(c)) return toast('Código inválido');
    params.set('sala', c); location.search = params.toString();
  };
} else start();
}

function start() {
  try { localStorage.setItem(LS_ROOM, room); } catch (e) {}
  $('app').hidden = false;
  $('room').textContent = room;
  classroomUI=initClassroom({getState:()=>S,act,pair:()=>transport?.send({type:'pair-request',version:VERSION}),id:myId,toast});
  buildRhythms(); buildVitals(); buildScenarios(); buildShockTo(); buildExams();
  transport = new Transport(room, onMsg, (st, mode) => {
    $('dot').className = 'dot ' + st;
    $('modeTag').textContent = { local: 'Wi-Fi local (sem internet)', online: 'Online', demo: 'Demonstração (mesmo aparelho)' }[mode] || '';
    discardPending(); clearAwaiting('Conexão reiniciada — o último comando pode não ter sido aplicado. Confira o monitor.'); presence.clear(); roomConflict=false; S = null; monitorId = null; monitorBoot = null; monitorRestartingSince = 0;
    if (st === 'on') {transport.send({type:'hello'});transport.send({type:'pair-request',version:VERSION});}
    updateWarning();
  }, myId, {
    criarSeguranca: async () => {
      salaOnline?.pararTarefas?.();
      const sala = salaOnline = new SalaOnline({
        url: CONFIG.supabaseUrl, chave: CONFIG.supabaseKey, codigo: room,
        dispositivo: myId, papel: 'controle', armazenamento: localStorage,
        aoMudar: () => updateWarning(),
      });
      await sala.conectar();
      return sala;
    },
    // Uma mensagem que não passa na conferência de assinatura é descartada sem
    // chegar à tela: ela não pode fingir ser o monitor nem outro controle.
    aoRecusar: (motivo) => { commandStatus('Mensagem ignorada: ' + motivo, 'err'); },
  });
  transport.start();
  let tick = 0;
  setInterval(() => {
    const stale = Date.now() - lastStateAt > 7000;
    updateWarning();
    if (stale && transport.connected) transport.send({ type: 'hello' });
    else if (++tick % 4 === 0) transport.send({ type: 'ping' }); // mantém a medição de atraso do monitor atualizada
    if(transport.connected && !S?.authorized?.includes(myId))transport.send({type:'pair-request',version:VERSION});
    if (S) $('timer').textContent = fmtTime(remoteTimerSeconds(S.timer, receivedAt));
  }, 1000);
}

function onMsg(msg) {
  if (msg.type === 'state') {
    if (!validPublicState(msg.state) || typeof msg.from !== 'string') return;
    const boot = typeof msg.boot === 'string' ? msg.boot : '';
    const sole = presence.observe(msg.from, boot);
    if (!sole) { roomConflict=true; commandStatus('Mais de um monitor aberto nesta sala. Feche o duplicado; os comandos voltam sozinhos.', 'err'); discardPending(); clearAwaiting(); updateWarning(); return; }
    const recovering = roomConflict; roomConflict=false;
    const restarted = (monitorRestartingSince && msg.from === monitorId) || (monitorId === msg.from && monitorBoot !== null && boot !== monitorBoot);
    if (monitorId !== msg.from || S?.session !== msg.state.session) { discardPending(); clearAwaiting('Comando anterior descartado: o monitor trocou de caso.'); historyKey=''; }
    if(msg.state.customScenario)registerScenario(msg.state.customScenario);
    monitorId=msg.from; monitorBoot=boot; S=msg.state; receivedAt=performance.now(); lastStateAt=Date.now(); monitorRestartingSince = 0;
    if (restarted) commandStatus('Monitor reiniciado. Confira o caso antes de continuar.', 'ok');
    else if (recovering) commandStatus('Só um monitor na sala novamente. Confira o caso antes de continuar.', 'ok');
    updateWarning(); render();
  } else if (msg.type === 'bye' && typeof msg.from === 'string') {
    presence.forget(msg.from, typeof msg.boot === 'string' ? msg.boot : '');
    if (msg.from === monitorId) { monitorRestartingSince = Date.now(); discardPending(); clearAwaiting(); commandStatus('Monitor fechado ou recarregando. Aguarde…', 'wait'); updateWarning(); }
  } else if (msg.type === 'ack' && msg.from === monitorId && msg.to === transport.id && awaiting.has(msg.seq)) {
    classroomUI?.ack(msg);
    const entry = awaiting.get(msg.seq);clearTimeout(entry.timer);awaiting.delete(msg.seq);
    let txt, state;
    if (!msg.ok) { txt = `${entry.label} — recusado: ${shortText(msg.reason) || 'confira a conexão'}`; state = 'err'; }
    else if (msg.done === false) { txt = `${entry.label} — não executado: ${shortText(msg.note) || 'sem motivo informado'}`; state = 'err'; }
    else { txt = `${entry.label} — executado${msg.note ? ' (' + shortText(msg.note) + ')' : ''}`; state = 'ok'; }
    latestStatus(msg.seq, txt, state);
  } else if(msg.type === 'notice' && msg.to === transport.id)toast(msg.txt);
}

function renderScenarioToolbar() {
  const available=canSend();
  const scenario=SCENARIO_BY_ID[S?.scn?.id];
  const label=S?.paused?'Retomar simulação':'Pausar simulação';
  $('bPauseAll').setAttribute('data-paused',String(!!S?.paused));
  $('bMuteAll').disabled=!available;
  $('bMuteAll').setAttribute('aria-pressed',String(!!S?.audioMuted));
  $('bMuteAll').setAttribute('aria-label',S?.audioMuted?'Reativar todos os sons':'Silenciar todos os sons');
  $('bPauseAll').setAttribute('aria-label',label);
  $('bPauseAll').title=label;
  $('bPauseAll').disabled=!available;
  $('bCasePrev').disabled=!available||S?.paused||!scenario||S.scn.step<=0;
  $('bCaseNext').disabled=!available||S?.paused||!scenario||S.scn.step>=scenario.etapas.length-1;
}
function updateWarning() {
  renderScenarioToolbar();
  const txt=unavailableReason();
  $('waiting').textContent=txt;$('waiting').hidden=!txt;
  $('connectionStatus').textContent=txt || (S?.paused?'Conectado e autorizado • Simulação pausada. Clique em Retomar simulação.':'Conectado e autorizado • Pronto para controlar');
}

const send = (cmd, extra, label) => {
  if (!canSend()) { discardPending(); toast(unavailableReason()); return false; }
  const commandSeq = ++seq;
  label = label || (cmd === 'set' ? describeSet(extra?.data, extra?.data?.vit ? extra?.dur : 0) : describeAction(extra?.name, extra?.arg));
  const ok = transport.send({ type: 'cmd', version:VERSION, cmd, ...extra, session: S.session, lease: S.lease, seq: commandSeq });
  if (ok) {
    latestSeq = commandSeq;
    commandStatus(label+' — enviando…', 'wait');
    awaiting.set(commandSeq, {label,timer:setTimeout(() => { awaiting.delete(commandSeq); latestStatus(commandSeq,label+' — sem confirmação. Confira o monitor antes de repetir.', 'err'); }, 4000)});
  }
  if (!ok) toast('Sem conexão — comando não enviado');
  return ok;
};
const set = (data, d = 0, label) => send('set', { data, dur: d }, label);
// Edição manual de EtCO₂ deve funcionar mesmo após um atalho de PCR desligar a curva.
function setVitals(vit, d = 0, label) {
  const data = {vit:{...vit}};
  if (vit.etco2 > 0 && S) {
    data.show = {capno:true};
    if (S.capno === 'none') data.capno = S.cpr ? 'rcp' : 'normal';
    if ((vit.rr ?? S.vit.rr) <= 0) data.vit.rr = 10;
  }
  return set(data, d, label ? label + ' · ' + describeSet(data) : undefined);
}
const act = (name, arg) => { if (['pause-simulation','custom-load','scn-load','scn-go','scn-next','scn-prev','scn-stop','reset'].includes(name)) discardPending(); return send('action', { name, arg }); };

let toastT;
function toast(t) {
  const el = $('toast');
  // Um z-index alto não supera a camada nativa de um diálogo modal.
  const host = document.querySelector('dialog[open]') || $('app');
  if (el.parentElement !== host) host.append(el);
  el.textContent = t; el.classList.add('show'); clearTimeout(toastT);
  toastT = setTimeout(() => el.classList.remove('show'), 2600);
}
const vibrate = () => { try { navigator.vibrate?.(10); } catch (e) {} };

// Confirmação sem bloquear a página (estados continuam chegando enquanto o diálogo está aberto).
function confirmAction(title, text, okLabel, onOk) {
  const d = $('confirmDialog');
  if (typeof d.showModal !== 'function') { if (window.confirm?.(title + '\n\n' + text)) onOk(); return; }
  $('confirmTitle').textContent = title; $('confirmText').textContent = text; $('confirmOk').textContent = okLabel;
  $('confirmOk').onclick = () => { d.close(); onOk(); };
  $('confirmCancel').onclick = () => d.close();
  d.showModal();
}
// O que o monitor vai interromper se o caso for trocado ou reiniciado.
function interruptList() { return interruptedActivities(S, S?.transLeft); }
const openDialog = id => { const d = $(id); if (typeof d.showModal === 'function') d.showModal(); };

// ---------- Abas ----------
$$('.tabs button').forEach(b => b.addEventListener('click', () => {
  $$('.tabs button').forEach(x => x.classList.toggle('active', x === b));
  $$('.tab').forEach(t => t.hidden = t.dataset.tab !== b.dataset.go);
  window.scrollTo(0, 0);
}));

// ---------- Ritmos ----------
function buildRhythms() {
  const box = $('rhythmGroups');
  box.innerHTML = RHYTHM_GROUPS.map(g => `
    <div class="rgroup"><h3>${g}</h3><div class="rgrid">
      ${RHYTHMS.filter(r => r.grupo === g).map(r => `<button class="btn rbtn" data-rhythm="${r.id}">${r.curto}<small>${r.hr ? r.hr + ' bpm' : '—'}</small></button>`).join('')}
    </div></div>`).join('');
  box.addEventListener('click', e => {
    const b = e.target.closest('[data-rhythm]'); if (!b) return;
    vibrate();
    // Trocar de ritmo aplica a FC típica e devolve o pulso ao padrão do ritmo.
    set({ rhythm: b.dataset.rhythm, typicalHr: true, pulse: 'auto' });
  });
}
$$('[data-quick]').forEach(b => b.addEventListener('click', () => {
  vibrate();
  const q = b.dataset.quick;
  // sem RCP em andamento: sem ventilação → EtCO₂ 0; com RCP: valores típicos de compressão
  const arrest = S?.cpr ? { capno: 'rcp', vit: { rr: 10, etco2: 15 } } : { capno: 'none', vit: { rr: 0, etco2: 0 } };
  const label = 'PCR rápida: ' + b.textContent;
  if (q === 'vf') set({ rhythm: 'vf', pulse: 'auto', ...arrest }, 0, label);
  if (q === 'tvsp') set({ rhythm: 'vt', pulse: 'off', ...arrest, vit: { ...arrest.vit, hr: 180 } }, 0, label);
  if (q === 'asys') set({ rhythm: 'asys', pulse: 'auto', ...arrest }, 0, label);
  if (q === 'aesp') {
    const org = S && !['vf', 'asys', 'tdp', 'agonal'].includes(S.rhythm);
    set(org ? { pulse: 'off', ...arrest } : { rhythm: 'nsr', pulse: 'off', ...arrest, vit: { ...arrest.vit, hr: 70 } }, 0, label);
  }
  if (q === 'rce') set({ rhythm: 'st', pulse: 'auto', cpr: false, capno: 'normal', vit: { hr: 104, spo2: 94, sys: 102, dia: 64, rr: 12, etco2: 40 } }, 0, label);
}));

// ---------- Segmentos ----------
$$('.seg').forEach(seg => seg.addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  vibrate();
  const k = seg.dataset.seg, v = b.dataset.v;
  if (k === 'dur') { dur = Number(v); markSeg(seg, v); renderBadges(); return; }
  if (k === 'nibpInt') return set({ nibp: { interval: Number(v) } });
  if (k === 'pulse') {
    // Presente/Ausente: quando coincide com o padrão do ritmo, volta a "seguir o ritmo".
    const natural = RHYTHM_BY_ID[S?.rhythm]?.pulse ?? true;
    return set({ pulse: (v === 'on') === natural ? 'auto' : v }, 0, 'Pulso ' + (v === 'on' ? 'presente' : 'ausente'));
  }
  set({ [k]: v });
}));
function markSeg(seg, v) { if (!seg) return; $$('button', seg).forEach(b => b.classList.toggle('sel', b.dataset.v === String(v))); }
markSeg(document.querySelector('[data-seg="dur"]'), 0);

// ---------- Sinais vitais ----------
const VITAL_ROWS = [['hr'], ['spo2'], ['sys', 'dia'], ['rr'], ['etco2'], ['temp']];
const COLORS = { hr: 'var(--ecg)', spo2: 'var(--spo2)', sys: 'var(--nibp)', dia: 'var(--nibp)', rr: 'var(--resp)', etco2: 'var(--co2)', temp: 'var(--temp)' };
function buildVitals() {
  $('vitals').innerHTML = VITAL_ROWS.map(keys => `
    <div class="card vital" data-vital="${keys.join(',')}" style="--c:${COLORS[keys[0]]}">
      <div class="vn">${keys.length > 1 ? 'Pressão arterial' : VITAL_DEFS[keys[0]].nome}<small>${VITAL_DEFS[keys[0]].un}</small></div>
      <div class="nowbox"><span class="now" id="now-${keys[0]}"></span><button class="btn mini" id="nowBtn-${keys[0]}" data-now="${keys.join(',')}" hidden>Aplicar já</button></div>
      ${keys.map(k => `
        <div class="stepper" data-k="${k}">
          <button class="btn sq" data-d="-1" aria-label="Diminuir ${VITAL_DEFS[k].nome}">−</button>
          <div class="sv">${keys.length > 1 ? `<small>${VITAL_DEFS[k].nome}</small> ` : ''}<b id="v-${k}" class="tnum">--</b></div>
          <button class="btn sq" data-d="1" aria-label="Aumentar ${VITAL_DEFS[k].nome}">+</button>
        </div>`).join('')}
      ${keys[0] === 'spo2' ? '<div class="spo2-modes" role="group" aria-label="Sinal do oxímetro"><button class="btn" data-spo2-signal="normal">Normal</button><button class="btn" data-spo2-signal="low">Hipoperfusão</button><button class="btn" data-spo2-signal="absent">Ausente</button></div>' : ''}
      ${keys[0] === 'etco2' ? `<div class="etco2-shortcuts">
        
        <div class="lbl">Aplicar EtCO₂ agora</div>
        <div class="grid2">
          <button class="btn" data-etco2="8">RCP ineficaz<small>8 mmHg</small></button>
          <button class="btn" data-etco2="17">RCP Alta Qualidade<small>17 mmHg</small></button>
          <button class="btn" data-etco2="35">RCE<small>35 mmHg</small></button>
          <button class="btn" data-etco2="45">Fisiológico<small>45 mmHg</small></button>
        </div>
        <details class="capno-help"><summary>Sobre os atalhos</summary><p class="muted small">Ao aumentar EtCO₂, a curva é ativada. Se FR = 0, será simulada ventilação a 10/min. Ajuste a frequência em FR.</p>
        <p class="muted small">Predefinições de simulação. Os atalhos alteram só a capnografia e, se necessário, a ventilação; não mudam o ritmo nem criam pulso. Os rótulos não confirmam, isoladamente, a qualidade da RCP ou o RCE.</p></details>
      </div>` : ''}
    </div>`).join('');

  $('vitals').querySelector('[data-vital="temp"]').before($('capnoOptions'));
  $$('#vitals .stepper').forEach(st => {
    const k = st.dataset.k, def = VITAL_DEFS[k];
    const bump = d => {
      if (!canSend()) { discardPending(); toast(unavailableReason()); return; }
      const base = pending[k] ?? S?.vit?.[k] ?? 0;
      pending[k] = clamp(Math.round((base + d * def.step) * 10) / 10, def.min, def.max);
      renderVitals(); schedulePending();
    };
    $$('.btn', st).forEach(b => {
      const d = Number(b.dataset.d);
      // Toque simples age no "click" (não dispara ao começar a rolar a tela).
      // Segurar 450 ms sem mover repete; mover o dedo ou rolar cancela.
      let holdT, repT, x0 = 0, y0 = 0, down = false, repeated = false;
      const stop = () => { clearTimeout(holdT); clearInterval(repT); down = false; };
      b.addEventListener('pointerdown', e => { down = true; repeated = false; x0 = e.clientX; y0 = e.clientY; holdT = setTimeout(() => { if (!down) return; repeated = true; vibrate(); bump(d); repT = setInterval(() => bump(d), 90); }, 450); });
      b.addEventListener('pointermove', e => { if (down && Math.hypot(e.clientX - x0, e.clientY - y0) > 10) stop(); });
      ['pointerup', 'pointerleave', 'pointercancel'].forEach(ev => b.addEventListener(ev, stop));
      b.addEventListener('click', () => { if (repeated) { repeated = false; return; } vibrate(); bump(d); });
      b.addEventListener('contextmenu', e => e.preventDefault());
    });

  });
  $('vitals').addEventListener('click', e => {
    const signal=e.target.closest('[data-spo2-signal]');
    if(signal){discardPending();set({spo2Signal:signal.dataset.spo2Signal},0);return;}
    const preset = e.target.closest('[data-etco2]');
    if (preset) { vibrate(); discardPending(); setVitals({etco2:Number(preset.dataset.etco2)}, 0, 'Atalho EtCO₂'); return; }
    const b = e.target.closest('[data-now]'); if (!b || !S) return;
    vibrate();
    const keys = b.dataset.now.split(','), vit = Object.fromEntries(keys.map(k => [k, S.vit[k]]));
    discardPending(); setVitals(vit, 0, 'Aplicar já');
  });
}
function schedulePending(now) {
  clearTimeout(pendingTimer);
  editVersion++; pendingAt = performance.now(); pendingSession = S?.session;
  pendingTimer = setTimeout(flushPending, now ? 0 : 500);
}
function flushPending() {
  // Aparelho que dormiu ou travou: o ajuste é descartado, mas o instrutor fica sabendo.
  if (!canSend()) { discardPending(); renderVitals(); toast(unavailableReason()); return; }
  if (pendingSession !== S?.session) { discardPending(); renderVitals(); toast('Ajuste descartado: o monitor trocou de caso'); return; }
  if (performance.now() - pendingAt > 2000) { discardPending(); renderVitals(); toast('Ajuste descartado: o controle ficou parado. Refaça.'); return; }
  const vit = { ...pending };
  if (!Object.keys(vit).length) return;
  if (!setVitals(vit, dur)) { discardPending(); renderVitals(); return; }
  const version = editVersion;
  setTimeout(() => { if(version !== editVersion)return; for (const k in vit) if (pending[k] === vit[k]) delete pending[k]; renderVitals(); }, 1500);
}
function renderVitals() {
  if (!S) return;
  $$('[data-spo2-signal]').forEach(b=>{const active=b.dataset.spo2Signal===S.spo2Signal;b.classList.toggle('on',active);b.setAttribute('aria-pressed',String(active));});
  for (const k of Object.keys(VITAL_DEFS)) {
    const el = $('v-' + k); if (!el) continue;
    const v = pending[k] ?? S.vit[k];
    el.textContent = fmtVital(k, v);
    el.closest('.stepper').parentElement.classList.toggle('pending', k in pending);
  }
  for (const keys of VITAL_ROWS) {
    const k = keys[0], el = $('now-' + k);
    const moving = keys.filter(kk => Math.abs((S.cur?.[kk] ?? 0) - S.vit[kk]) > (kk === 'temp' ? 0.05 : 0.5));
    let txt = '';
    if (moving.length) {
      const left = Math.max(0, ...moving.map(kk => S.transLeft?.[kk] ?? 0));
      txt = 'atual ' + keys.map(kk => fmtVital(kk, S.cur[kk])).join('/') + (left ? ' · faltam ' + fmtTime(Math.ceil(left / 1000)) : '');
    }
    if (k === 'hr' && S.displayed?.hr != null && Math.abs(S.displayed.hr - S.cur.hr) >= 5) txt += (txt ? ' · ' : '') + 'no monitor ' + S.displayed.hr;
    if (el.textContent !== txt) el.textContent = txt;
    const nb = $('nowBtn-' + k); if (nb) nb.hidden = !moving.length;
  }
}
$$('[data-preset]').forEach(b => b.addEventListener('click', () => {
  const P = VITAL_PRESETS[b.dataset.preset];
  vibrate(); discardPending(); set({ vit: P }, dur, 'Predefinição: ' + b.textContent + (dur ? ` (transição de ${fmtDur(dur)})` : ''));
}));

// ---------- Cenários ----------
const { buildScenarios, renderScenario } = createControllerCases({document, getState: () => S, act, vibrate, confirmAction, interruptList});

// ---------- Terapia ----------
function buildShockTo() {
  $('shockTo').innerHTML = '<option value="">Não mudar (instrutor decide)</option>' + RHYTHMS.map(r => `<option value="${r.id}">${r.nome}</option>`).join('');
  $('shockTo').addEventListener('change', e => set({ shockTo: e.target.value || null }));
}
const click = (id, fn) => $(id).addEventListener('click', () => { vibrate(); fn(); });
click('bCpr', () => set({ cpr: !S?.cpr, ...(!S?.cpr ? { capno: 'rcp' } : {}) }));
click('bSync', () => set({ defib: { sync: !S?.defib.sync } }));
click('bCharge', () => act('charge'));
click('bShock', () => act('shock'));
click('bDisarm', () => act('disarm'));
$$('[data-energy]').forEach(b => b.addEventListener('click', () => {
  if (!S) return; vibrate();
  const i = ENERGIES.indexOf(S.defib.energy), n = ENERGIES[clamp((i < 0 ? 14 : i) + Number(b.dataset.energy), 0, ENERGIES.length - 1)];
  set({ defib: { energy: n } });
}));
click('bPacer', () => set({ pacer: { on: !S?.pacer.on } }));
$$('[data-pacer]').forEach(b => b.addEventListener('click', () => {
  if (!S) return; vibrate();
  const [k, d] = b.dataset.pacer.split(':');
  const lim = PACER_LIMITS[k];
  set({ pacer: { [k]: clamp(S.pacer[k] + Number(d), ...lim) } });
}));
click('bNibp', () => act('nibp'));
click('bMuteAll', () => act('audio-mute', !S?.audioMuted));
click('bPauseAll', () => act('pause-simulation'));
click('bCasePrev', () => act('scn-prev'));
click('bCaseNext', () => act('scn-next'));
click('bTimerReset', () => act('timer', 'reset'));
click('bSilence', () => act('silence'));

// ---------- Ajustes ----------
click('bMenu', () => openDialog('settingsDialog'));
click('bCloseSettings', () => $('settingsDialog').close());
$('swAlarms').addEventListener('change', e => set({ alarms: { enabled: e.target.checked } }));
$('swBeep').addEventListener('change', e => set({ alarms: { beep: e.target.checked } }));
$('swStudent').addEventListener('change', e => set({ studentPanel: e.target.checked }));
$$('[data-show]').forEach(b => b.addEventListener('click', () => { if (!S) return; vibrate(); set({ show: { [b.dataset.show]: !S.show[b.dataset.show] } }); }));
click('bReset', () => {
  const c = interruptList();
  $('settingsDialog').close?.();
  confirmAction('Reiniciar monitor?', 'Volta ao ritmo sinusal e aos valores iniciais e encerra o caso.' + (c.length ? ` Será interrompido: ${c.join(', ')}.` : '') + ' Alarmes, bipe e parâmetros visíveis são mantidos.', 'Reiniciar', () => act('reset'));
});
click('bLeave', () => { location.search = ''; });

// ---------- Exames e histórico ----------
let refreshExamOptions=()=>{};
function buildExams() {
  function options() {
    const selected=$('examSelect').value;
    const needle=$('examSearch').value;
    const kind=$('examKind').value;
    const items=filterExams(examsForState(S),needle,kind);
    $('examSelect').replaceChildren(new Option(items.length?'Selecione um exame':'Sem exame associado',''));
    for(const exam of items)$('examSelect').append(new Option(exam.label,exam.id));
    $('examSelect').value=items.some(e=>e.id===selected)?selected:'';
    $('examCount').textContent=items.length?items.length+' exames disponíveis':'Sem exame associado';preview();
  }
  function preview(){
    const exam=EXAM_BY_ID[$('examSelect').value];$('examPreview').hidden=!exam;$('bShowExam').disabled=!exam;
    if(exam)$('examPreview').src=exam.src;else $('examPreview').removeAttribute('src');
  }
  $('examSearch').addEventListener('input',options);$('examKind').addEventListener('change',options);
  $('examSelect').addEventListener('change',preview);
  let examContext='';
  refreshExamOptions=()=>{const key=JSON.stringify([S?.scn,S?.rhythm]);if(key!==examContext){examContext=key;options();}};
  click('bOpenExams', () => {options();openDialog('examDialog');});
  click('bCloseExams', () => $('examDialog').close());
  $('bShowExam').addEventListener('click',()=>{const id=$('examSelect').value;if(examsForState(S).some(e=>e.id===id) && act('exam',id))$('examDialog').close();});
  $('bHideExam').addEventListener('click',()=>act('exam',null));options();
  click('bHistoryAll', () => openDialog('historyDialog'));
  click('bCloseHistory', () => $('historyDialog').close());
  $('bExportHistory').addEventListener('click',()=>{
    const text=historyText(S?.history || []);const url=URL.createObjectURL(new Blob([text],{type:'text/plain;charset=utf-8'}));
    const a=document.createElement('a');a.href=url;a.download='historico-simulacao.txt';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  });

}
let historyKey='';
function historyItem(event){const item=document.createElement('li');item.textContent=historyLine(event);return item;}
function renderHistory(){
  const events=S.history;const last=events.at(-1);const key=(last?.id??0)+':'+(last?.at??0)+':'+events.length;
  if(key===historyKey)return;historyKey=key;
  const newest=[...events].reverse();
  $('historyRecent').replaceChildren(...newest.slice(0,5).map(historyItem));
  $('historyList').replaceChildren(...newest.map(historyItem));
  $('historyEmpty').hidden=events.length>0;
}

// ---------- Render ----------
function effectivePulse() {
  if (typeof S.perfusing === 'boolean') return S.perfusing;
  return S.pulse === 'on' || (S.pulse === 'auto' && (RHYTHM_BY_ID[S.rhythm]?.pulse ?? true));
}
function renderBadges() {
  if (!S) return;
  const pulseOff = !effectivePulse();
  $('lBadges').innerHTML = [
    pulseOff ? '<span class="badge red">SEM PULSO</span>' : '',
    S.cpr ? '<span class="badge red">RCP</span>' : '',
    S.pacer.on ? `<span class="badge blue">MP ${S.captured ? 'captura' : 'sem captura'}</span>` : '',
    S.defib.status === 'ready' ? '<span class="badge amber">CARREGADO</span>' : S.defib.status === 'charging' ? '<span class="badge amber">CARREGANDO</span>' : '',
    dur ? `<span class="badge amber">⟳ ${fmtDur(dur)}</span>` : '',
  ].filter(Boolean).join('');
}
function render() {
  refreshExamOptions();
  $('timer').textContent=fmtTime(remoteTimerSeconds(S.timer,receivedAt));
  if(S)classroomUI?.render(S);
  renderHistory();
  $('examActive').textContent=S.exam ? 'No monitor: '+EXAM_BY_ID[S.exam].label : 'Nenhum exame aberto no monitor';
  $('bHideExam').disabled = !S.exam;
  const d = S.displayed || {};
  $('lHr').textContent = d.hr ?? '--';
  $('lSpo2').textContent = d.spo2 ?? '--';
  $('lBp').textContent = S.nibp.measuring ? `${S.nibp.cuff ?? ''}…` : `${S.nibp.sys ?? '--'}/${S.nibp.dia ?? '--'}`;
  $('lRr').textContent = d.rr ?? '--';
  $('lEtco2').textContent = d.etco2 ?? '--';
  $('lTemp').textContent = d.temp != null ? Number(d.temp).toFixed(1).replace('.', ',') : '--';
  const r = RHYTHM_BY_ID[S.rhythm];
  $('lRhythm').textContent = r ? r.nome : '';
  renderBadges();
  const a = S.alarmsNow?.[0];
  $('lAlarm').textContent = a && a.txt !== r?.nome ? a.txt : ''; $('lAlarm').className = 'al ' + (a?.level || '');

  $$('.rbtn').forEach(b => b.classList.toggle('active', b.dataset.rhythm === S.rhythm));
  markSeg(document.querySelector('[data-seg="pulse"]'), effectivePulse() ? 'on' : 'off');
  markSeg(document.querySelector('[data-seg="vfAmp"]'), S.vfAmp);
  markSeg(document.querySelector('[data-seg="capno"]'), S.capno);
  markSeg(document.querySelector('[data-seg="nibpInt"]'), S.nibp.interval || 0);
  $('vfAmpBox').style.opacity = S.rhythm === 'vf' ? 1 : .45;
  renderVitals();
  renderScenario();

  $('bCpr').classList.toggle('on', S.cpr); $('bCpr').textContent = S.cpr ? 'Parar compressões' : 'Iniciar compressões';
  $('energy').textContent = S.defib.energy;
  $('bSync').classList.toggle('on', S.defib.sync); $('bSync').textContent = S.defib.sync ? 'SINC ligado' : 'SINC';
  const ds = S.defib.status;
  $('defStatus').textContent = ({ idle: '', charging: '· carregando…', ready: '· pronto', sync: '· aguardando R' }[ds] || '') + (S.defib.shocks ? ` · ${S.defib.shocks} choque(s)` : '');
  $('bCharge').textContent = ds === 'charging' ? 'Carregando…' : ds === 'ready' ? 'Carregado' : 'Carregar';
  $('bShock').disabled = ds !== 'ready';
  $('bDisarm').hidden = ds === 'idle';
  if (document.activeElement !== $('shockTo')) $('shockTo').value = S.shockTo || '';
  $('bPacer').classList.toggle('on', S.pacer.on); $('bPacer').textContent = S.pacer.on ? 'Desligar marcapasso' : 'Ligar marcapasso';
  $('pRate').textContent = S.pacer.rate; $('pMa').textContent = S.pacer.ma; $('pThr').textContent = S.pacer.threshold;
  $('capStatus').textContent = !S.pacer.on ? '' : !S.captured ? `Sem captura — o limiar está em ${S.pacer.threshold} mA.`
    : S.perfusing === false ? 'Captura elétrica, sem pulso (ritmo de PCR): sem pleth, SpO₂ nem PNI.' : 'Com captura elétrica e pulso.';

  $('swAlarms').checked = S.alarms.enabled; $('swBeep').checked = S.alarms.beep; $('swStudent').checked = S.studentPanel;
  $$('[data-show]').forEach(b => b.classList.toggle('on', !!S.show[b.dataset.show]));
}

init();

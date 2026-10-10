import { createControllerCases } from './controller-cases.js';
import { VERSION, registerScenario } from './classroom.js';
import { initClassroom } from './classroom-ui.js';
import { validPublicState } from './state-validation.js';
import { criarGaleriaExames } from './exam-gallery.js';
import { historyText, historyLine } from './history.js';
import { remoteTimerSeconds, MonitorPresence, STATE_MAX_AGE_MS } from './session.js';
import { EXAM_BY_ID } from './exams.js';
import { RHYTHMS, RHYTHM_BY_ID, RHYTHM_GROUPS } from './rhythm-catalog.js';
import { ENERGIES, VITAL_DEFS, PACER_LIMITS, VITAL_PRESETS, CHANNELS } from './simulation-config.js';
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
// O identificador do aparelho sobrevive à recarga: sem isso, cada recarga
// viraria um controle novo e o instrutor teria de autorizar outra vez.
//
// Fica em sessionStorage, e não em localStorage, porque localStorage é
// compartilhado entre as abas: duas abas de controle no mesmo navegador
// passariam a ser o mesmo aparelho para o monitor, enquanto cada uma mantém seu
// próprio contador `seq`. A segunda aba levaria "comando repetido" em tudo, já
// que o CommandGate recusa sequência não crescente por remetente. É a mesma
// escolha feita para o identificador do monitor.
//
// Quem foi revogado continua revogado — a situação vive na sala, não aqui.
try { const guardado = sessionStorage.getItem(LS_ID); if (/^c[a-f0-9]{32}$/.test(guardado || '')) myId = guardado; } catch (e) {}
if (!myId) {
  myId = 'c' + Array.from(crypto.getRandomValues(new Uint8Array(16)), n => n.toString(16).padStart(2,'0')).join('');
  try { sessionStorage.setItem(LS_ID, myId); } catch (e) {}
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
  buildRhythms(); buildVitals(); buildScenarios(); buildShockTo(); buildExams(); organizar();
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
    if (S) { $('timer').textContent = fmtTime(remoteTimerSeconds(S.timer, receivedAt)); renderRcp(); }
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
// Edição manual de EtCO₂ deve funcionar mesmo após um atalho de PCR desligar a
// curva: religa a curva e uma ventilação mínima, sem as quais não há EtCO₂.
// Ligar o capnógrafo (o sensor) continua sendo decisão do instrutor, na chave
// da coluna: o valor fica pronto e aparece quando o aluno pedir a capnografia.
function setVitals(vit, d = 0, label) {
  const data = {vit:{...vit}};
  if (vit.etco2 > 0 && S) {
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

// ===================================================================
// Tela. Daqui para baixo é só apresentação: tudo o que muda o monitor
// passa por set(), setVitals() ou act(), acima.
// Tablet deitado: painel único com rodapé. Celular: abas com doca fixa.
// O layout é do CSS; o JS só move o painel do caso para a janela "Caso e
// aula" quando a tela é larga.
// ===================================================================
const click = (id, fn) => $(id).addEventListener('click', () => { vibrate(); fn(); });

// ---------- Tema (claro por padrão: salas de aula são bem iluminadas) ----------
const LS_TEMA = 'bmsim-ctrl-tema';
function aplicarTema(t) {
  t = t === 'escuro' ? 'escuro' : 'claro';
  const raiz = document.documentElement;
  if (raiz?.dataset) raiz.dataset.theme = t;
  try { localStorage.setItem(LS_TEMA, t); } catch (e) {}
  markSeg(document.querySelector('[data-seg="tema"]'), t);
  document.querySelector('meta[name="theme-color"]')?.setAttribute?.('content', t === 'escuro' ? '#0a0e13' : '#e8ecf0');
}
click('bTheme', () => aplicarTema(document.documentElement?.dataset?.theme === 'escuro' ? 'claro' : 'escuro'));

// ---------- Layout ----------
const telaLarga = globalThis.matchMedia?.('(min-width: 960px)');
function organizar() {
  const painel = $('painelCaso'), destino = telaLarga?.matches ? $('casoDialogCorpo') : $('secCaso');
  if (painel && destino && painel.parentElement !== destino) destino.append(painel);
  if (!telaLarga?.matches) $('casoDialog').close?.();
}
telaLarga?.addEventListener?.('change', organizar);
click('bCasoAula', () => openDialog('casoDialog'));
$$('dialog [data-close]').forEach(b => b.addEventListener('click', () => b.closest('dialog')?.close()));

// ---------- Abas (celular) ----------
function mostrarAba(nome) {
  $$('.tabs [data-go]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.go === nome)));
  $$('.sec.tab').forEach(s => s.classList.toggle('ativa', s.dataset.tab === nome));
  const m = $('main'); if (m) m.scrollTop = 0;
}
$$('.tabs [data-go]').forEach(b => b.addEventListener('click', () => mostrarAba(b.dataset.go)));

// ---------- Ritmos ----------
// "Usados há pouco": o ritmo atual entra na frente. Fica neste aparelho.
const LS_RECENTES = 'bmsim-ctrl-recentes';
let recentes = ['nsr', 'vf', 'vt', 'afib', 'bav3'];
try { const r = JSON.parse(localStorage.getItem(LS_RECENTES)); if (Array.isArray(r) && r.length) recentes = r.filter(id => RHYTHM_BY_ID[id]).slice(0, 6); } catch (e) {}
function lembrarRitmo(id) {
  if (!RHYTHM_BY_ID[id] || recentes[0] === id) return;
  recentes = [id, ...recentes.filter(x => x !== id)].slice(0, 6);
  try { localStorage.setItem(LS_RECENTES, JSON.stringify(recentes)); } catch (e) {}
}
const botaoRitmo = r => `<button class="btn rbtn" data-rhythm="${r.id}">${r.curto}<small>${r.hr ? r.hr + ' bpm' : '—'}</small></button>`;
function renderRecentes() {
  const box = $('recentes'), chave = recentes.join(',');
  if (box.dataset.chave !== chave) { box.dataset.chave = chave; box.innerHTML = recentes.map(id => botaoRitmo(RHYTHM_BY_ID[id])).join(''); }
}
function trocarRitmo(e) {
  const b = e.target.closest('[data-rhythm]'); if (!b) return;
  vibrate();
  // Trocar de ritmo aplica a FC típica e devolve o pulso ao padrão do ritmo.
  set({ rhythm: b.dataset.rhythm, typicalHr: true, pulse: 'auto' });
  $('rhythmDialog').close?.();
}
function buildRhythms() {
  $('rhythmGroups').innerHTML = RHYTHM_GROUPS.map(g => `
    <div class="rgroup"><h3>${g}</h3><div class="rgrid">${RHYTHMS.filter(r => r.grupo === g).map(botaoRitmo).join('')}</div></div>`).join('');
  $('rhythmGroups').addEventListener('click', trocarRitmo);
  $('recentes').addEventListener('click', trocarRitmo);
  $('bAllRhythms').textContent = 'Todos os ritmos (' + RHYTHMS.length + ')';
}
click('bAllRhythms', () => openDialog('rhythmDialog'));
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
  const k = seg.dataset.seg, v = b.dataset.v;
  if (!k) return;              // segmentos com tratamento próprio (oxímetro)
  vibrate();
  if (k === 'tema') return aplicarTema(v);
  if (k === 'dur') { dur = Number(v); markSeg(seg, v); renderBadges(); renderTransicao(); return; }
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
let temaSalvo = null;
try { temaSalvo = localStorage.getItem(LS_TEMA); } catch (e) {}
aplicarTema(temaSalvo || 'claro');
function renderTransicao() { $('transHint').textContent = dur ? 'próximos ajustes em ' + fmtDur(dur) : 'ajustes imediatos'; }

// ---------- Sinais vitais ----------
// Cada coluna é um sensor. Desligado: o monitor mostra "--" e não desenha a
// curva, mas o valor pode ser ajustado antes, para entrar certo quando o aluno
// pedir a monitorização. A FR acompanha o oxímetro.
const COLUNAS = [
  { k: 'hr', canal: 'ecg', cor: 'var(--ecg)' },
  { k: 'spo2', canal: 'spo2', cor: 'var(--spo2)' },
  { k: 'etco2', canal: 'capno', cor: 'var(--co2)' },
  { k: 'rr', canal: 'resp', cor: 'var(--resp)', segue: 'SpO₂' },
  { k: 'temp', canal: 'temp', cor: 'var(--temp)' },
];
const SENSOR = { ecg: 'eletrodos do ECG', spo2: 'oxímetro', capno: 'capnógrafo', resp: 'respiração', temp: 'termômetro', nibp: 'manguito da PNI' };
const arred = (k, v) => k === 'temp' ? Math.round(v * 10) / 10 : Math.round(v);

function botoesMais(k, d, nome) { return `<button class="pm" data-k="${k}" data-d="${d}" aria-label="${d > 0 ? 'Aumentar' : 'Diminuir'} ${nome}">${d > 0 ? '+' : '−'}</button>`; }
function trilho(k) {
  const def = VITAL_DEFS[k];
  return `<div class="trk" role="slider" tabindex="0" data-trk="${k}" aria-label="${def.nome}" aria-valuemin="${def.min}" aria-valuemax="${def.max}"><div class="fil"></div><div class="thm"></div></div>`;
}
function buildVitals() {
  const coluna = c => {
    const def = VITAL_DEFS[c.k];
    return `<div class="vc" data-col="${c.k}" style="--c:${c.cor}">
      ${c.segue ? `<span class="swnote">com o ${c.segue}</span>` : `<button class="sw" data-canal="${c.canal}" aria-pressed="false" aria-label="Ligar ${SENSOR[c.canal]}"></button>`}
      <div class="vv" id="v-${c.k}">--</div>
      <div class="vn">${def.nome}<small>${def.un}</small></div>
      <div class="now" id="now-${c.k}"></div>
      ${botoesMais(c.k, 1, def.nome)}${trilho(c.k)}${botoesMais(c.k, -1, def.nome)}
    </div>`;
  };
  $('vitals').innerHTML = COLUNAS.map(coluna).join('') + `
    <div class="vc pa" data-col="pa" style="--c:var(--nibp)">
      <button class="sw" data-canal="nibp" aria-pressed="false" aria-label="Ligar ${SENSOR.nibp}"></button>
      <div class="vv"><span id="v-sys">--</span>/<span id="v-dia">--</span></div>
      <div class="vn">PA<small>mmHg</small></div>
      <div class="now" id="now-pa"></div>
      <div class="pms">${botoesMais('sys', 1, 'PAS')}${botoesMais('dia', 1, 'PAD')}</div>
      <div class="trks">${trilho('sys')}${trilho('dia')}</div>
      <div class="pms">${botoesMais('sys', -1, 'PAS')}${botoesMais('dia', -1, 'PAD')}</div>
      <button class="btn medir" id="bNibp">Medir</button>
    </div>`;

  const ajustar = (k, v, agora) => {
    if (!canSend()) { discardPending(); toast(unavailableReason()); return false; }
    const def = VITAL_DEFS[k];
    pending[k] = clamp(arred(k, v), def.min, def.max);
    renderVitals(); schedulePending(agora);
    return true;
  };
  const atual = k => pending[k] ?? S?.vit?.[k] ?? VITAL_DEFS[k].min;

  // Botões + e −: toque simples age no "click" (não dispara ao começar a rolar a
  // tela). Segurar 450 ms sem mover repete; mover o dedo ou rolar cancela.
  $$('#vitals .pm').forEach(b => {
    const k = b.dataset.k, d = Number(b.dataset.d), passo = () => ajustar(k, atual(k) + d * VITAL_DEFS[k].step);
    let holdT, repT, x0 = 0, y0 = 0, down = false, repeated = false;
    const stop = () => { clearTimeout(holdT); clearInterval(repT); down = false; };
    b.addEventListener('pointerdown', e => { down = true; repeated = false; x0 = e.clientX; y0 = e.clientY; holdT = setTimeout(() => { if (!down) return; repeated = true; vibrate(); passo(); repT = setInterval(passo, 90); }, 450); });
    b.addEventListener('pointermove', e => { if (down && Math.hypot(e.clientX - x0, e.clientY - y0) > 10) stop(); });
    ['pointerup', 'pointerleave', 'pointercancel'].forEach(ev => b.addEventListener(ev, stop));
    b.addEventListener('click', () => { if (repeated) { repeated = false; return; } vibrate(); passo(); });
    b.addEventListener('contextmenu', e => e.preventDefault());
  });

  // Sliders: arrastar ajusta na hora na tela; o envio sai ao soltar (ou meio
  // segundo parado), pelo mesmo caminho dos botões.
  $$('#vitals [data-trk]').forEach(trk => {
    const k = trk.dataset.trk, def = VITAL_DEFS[k], thm = trk.querySelector('.thm');
    const doY = y => { const r = trk.getBoundingClientRect(), t = thm.offsetHeight || 30; return def.min + clamp(1 - (y - r.top - t / 2) / (r.height - t), 0, 1) * (def.max - def.min); };
    let arrastando = false;
    trk.addEventListener('pointerdown', e => { if (!ajustar(k, doY(e.clientY))) return; arrastando = true; trk.setPointerCapture?.(e.pointerId); });
    trk.addEventListener('pointermove', e => { if (arrastando) ajustar(k, doY(e.clientY)); });
    const fim = () => { if (arrastando) { arrastando = false; schedulePending(true); } };
    trk.addEventListener('pointerup', fim); trk.addEventListener('pointercancel', fim);
    trk.addEventListener('keydown', e => {
      const m = { ArrowUp: 1, ArrowRight: 1, ArrowDown: -1, ArrowLeft: -1, PageUp: 10, PageDown: -10 }[e.key];
      if (!m) return; e.preventDefault(); ajustar(k, atual(k) + m * def.step);
    });
  });

  $('vitals').addEventListener('click', e => {
    const sw = e.target.closest('[data-canal]');
    if (sw) {
      if (!S) return; vibrate();
      const c = sw.dataset.canal, liga = !S.show[c], show = { [c]: liga };
      if (c === 'spo2') show.resp = liga;                 // a FR vem do oxímetro
      return set({ show }, 0, (liga ? 'Ligado: ' : 'Desligado: ') + SENSOR[c] + (c === 'spo2' ? ' e FR' : ''));
    }
    if (e.target.closest('#bNibp')) {
      if (!S) return; vibrate();
      if (!S.show.nibp) return toast('Ligue o manguito da PA antes de medir');
      return act(S.nibp.measuring ? 'nibp-stop' : 'nibp');
    }
    const ja = e.target.closest('[data-now]'); if (!ja || !S) return;
    vibrate();
    const keys = ja.dataset.now.split(','), vit = Object.fromEntries(keys.map(k => [k, S.vit[k]]));
    discardPending(); setVitals(vit, 0, 'Aplicar já');
  });
}
click('bAllOn', () => {
  if (!S) return;
  const todos = CHANNELS.every(c => S.show[c]);
  set({ show: Object.fromEntries(CHANNELS.map(c => [c, !todos])) }, 0, todos ? 'Todos os sensores desligados' : 'Todos os sensores ligados');
});
$$('[data-spo2-signal]').forEach(b => b.addEventListener('click', () => { vibrate(); discardPending(); set({ spo2Signal: b.dataset.spo2Signal }, 0); }));
$$('[data-etco2]').forEach(b => b.addEventListener('click', () => {
  vibrate(); discardPending();
  if (setVitals({ etco2: Number(b.dataset.etco2) }, 0, 'Atalho EtCO₂ ' + b.dataset.l) && !S?.show?.capno) toast('Valor pronto: aparece quando o capnógrafo for ligado');
}));
$$('[data-preset]').forEach(b => b.addEventListener('click', () => {
  const P = VITAL_PRESETS[b.dataset.preset];
  vibrate(); discardPending(); set({ vit: P }, dur, 'Predefinição: ' + b.textContent + (dur ? ` (transição de ${fmtDur(dur)})` : ''));
}));

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

// Posição do slider: alvo (o que vai ou já foi pedido), não o valor no meio da transição.
function pintarSlider(trk, k) {
  const def = VITAL_DEFS[k], v = pending[k] ?? S.vit[k], f = clamp((v - def.min) / (def.max - def.min), 0, 1);
  const thm = trk.querySelector('.thm'), fil = trk.querySelector('.fil'), t = thm?.offsetHeight || 30;
  if (thm?.style) thm.style.bottom = `calc((100% - ${t}px) * ${f})`;
  if (fil?.style) fil.style.height = `calc((100% - ${t}px) * ${f} + ${t / 2}px)`;
  trk.setAttribute('aria-valuenow', String(fmtVital(k, v)));
}
const emTransicao = k => Math.abs((S.cur?.[k] ?? 0) - S.vit[k]) > (k === 'temp' ? 0.05 : 0.5);
function linhaTransicao(keys) {
  const left = Math.max(0, ...keys.map(kk => S.transLeft?.[kk] ?? 0));
  return 'atual <b>' + keys.map(kk => fmtVital(kk, S.cur[kk])).join('/') + '</b>' + (left ? ' · ' + fmtTime(Math.ceil(left / 1000)) : '') +
    `<button class="ja" data-now="${keys.join(',')}">aplicar já</button>`;
}
function renderVitals() {
  if (!S) return;
  const d = S.displayed || {};
  const noMonitor = { hr: d.hr, spo2: d.spo2, etco2: d.etco2, rr: d.rr, temp: d.temp != null ? fmtVital('temp', d.temp) : null };
  const html = (id, h) => { const el = $(id); if (el && el.innerHTML !== h) el.innerHTML = h; };
  for (const c of COLUNAS) {
    const ligado = !!S.show[c.canal];
    $('v-' + c.k).textContent = fmtVital(c.k, pending[c.k] ?? S.vit[c.k]);
    html('now-' + c.k, !ligado ? 'desligado' : emTransicao(c.k) ? linhaTransicao([c.k]) : 'monitor <b>' + (noMonitor[c.k] ?? '--') + '</b>');
    const col = document.querySelector(`[data-col="${c.k}"]`);
    col?.classList.toggle('off', !ligado); col?.classList.toggle('pending', c.k in pending);
  }
  $('v-sys').textContent = fmtVital('sys', pending.sys ?? S.vit.sys);
  $('v-dia').textContent = fmtVital('dia', pending.dia ?? S.vit.dia);
  const pa = document.querySelector('[data-col="pa"]');
  pa?.classList.toggle('off', !S.show.nibp); pa?.classList.toggle('pending', 'sys' in pending || 'dia' in pending);
  html('now-pa', !S.show.nibp ? 'desligado'
    : S.nibp.measuring ? 'manguito <b>' + (S.nibp.cuff ?? '…') + '</b>'
    : emTransicao('sys') || emTransicao('dia') ? linhaTransicao(['sys', 'dia'])
    : S.nibp.sys != null ? 'última <b>' + S.nibp.sys + '/' + S.nibp.dia + '</b>' : 'sem medida');
  const medir = $('bNibp');
  if (medir) { medir.textContent = S.nibp.measuring ? 'Parar' : 'Medir'; medir.classList?.toggle('on', !!S.nibp.measuring); }
  $$('#vitals [data-canal]').forEach(sw => {
    const on = !!S.show[sw.dataset.canal];
    sw.setAttribute('aria-pressed', String(on));
    sw.setAttribute('aria-label', (on ? 'Desligar ' : 'Ligar ') + SENSOR[sw.dataset.canal]);
  });
  $$('#vitals [data-trk]').forEach(trk => pintarSlider(trk, trk.dataset.trk));
  $('bAllOn').textContent = CHANNELS.every(c => S.show[c]) ? 'Desligar todos' : 'Ligar todos';
  $$('[data-spo2-signal]').forEach(b => { const on = b.dataset.spo2Signal === S.spo2Signal; b.classList.toggle('sel', on); b.setAttribute('aria-pressed', String(on)); });
}

// ---------- Cenários ----------
const { buildScenarios, renderScenario } = createControllerCases({document, getState: () => S, act, vibrate, confirmAction, interruptList});

// ---------- Terapia ----------
function buildShockTo() {
  $('shockTo').innerHTML = '<option value="">Não mudar (instrutor decide)</option>' + RHYTHMS.map(r => `<option value="${r.id}">${r.nome}</option>`).join('');
  $('shockTo').addEventListener('change', e => set({ shockTo: e.target.value || null }));
}
const alternarRcp = () => { vibrate(); set({ cpr: !S?.cpr, ...(!S?.cpr ? { capno: 'rcp' } : {}) }); };
$$('[data-cpr]').forEach(b => b.addEventListener('click', alternarRcp));
click('bSync', () => set({ defib: { sync: !S?.defib.sync } }));
click('bCharge', () => act('charge'));
click('bShock', () => act('shock'));
click('bDisarm', () => act('disarm'));
// Doca do celular: um botão que segue os passos do desfibrilador. A energia é
// escolhida na aba Terapia; aqui é Carregar e depois Chocar.
click('dockShock', () => {
  if (!S) return;
  const st = S.defib.status;
  if (st === 'idle') act('charge');
  else if (st === 'ready') act('shock');
  else toast(st === 'charging' ? 'Carregando o desfibrilador…' : 'SINC: aguardando onda R');
});
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
click('bMuteAll', () => act('audio-mute', !S?.audioMuted));
click('bPauseAll', () => act('pause-simulation'));
click('bCasePrev', () => act('scn-prev'));
click('bCaseNext', () => act('scn-next'));

// ---------- Menu ----------
click('bMenu', () => openDialog('settingsDialog'));
click('bCloseSettings', () => $('settingsDialog').close());
click('bTimerReset', () => act('timer', 'reset'));
click('bSilence', () => act('silence'));
$('swAlarms').addEventListener('change', e => set({ alarms: { enabled: e.target.checked } }));
$('swBeep').addEventListener('change', e => set({ alarms: { beep: e.target.checked } }));
$('swStudent').addEventListener('change', e => set({ studentPanel: e.target.checked }));
click('bReset', () => {
  const c = interruptList();
  $('settingsDialog').close?.();
  confirmAction('Reiniciar monitor?', 'Volta ao ritmo sinusal e aos valores iniciais, encerra o caso e desliga os sensores.' + (c.length ? ` Será interrompido: ${c.join(', ')}.` : '') + ' Alarmes, bipe e botões dos alunos são mantidos.', 'Reiniciar', () => act('reset'));
});
click('bLeave', () => { location.search = ''; });

// Tela cheia. iPad usa o nome com prefixo; o iPhone não tem, e lá o caminho é
// abrir pelo ícone da Tela de Início (manifesto em modo standalone).
const raizTela = document.documentElement;
const pedirTelaCheia = raizTela?.requestFullscreen || raizTela?.webkitRequestFullscreen;
const emTelaCheia = () => !!(document.fullscreenElement || document.webkitFullscreenElement);
const rotuloTelaCheia = () => { $('bFullscreen').textContent = emTelaCheia() ? 'Sair da tela cheia' : 'Tela cheia'; };
click('bFullscreen', async () => {
  if (!pedirTelaCheia) { $('fullscreenNote').hidden = false; return; }
  try {
    if (emTelaCheia()) await (document.exitFullscreen || document.webkitExitFullscreen).call(document);
    else { await pedirTelaCheia.call(raizTela, { navigationUI: 'hide' }); $('settingsDialog').close?.(); }
  } catch { $('fullscreenNote').hidden = false; }
  rotuloTelaCheia();
});
for (const ev of ['fullscreenchange', 'webkitfullscreenchange']) document.addEventListener?.(ev, rotuloTelaCheia);

// ---------- Exames e histórico ----------
let refreshExamOptions = () => {}, abrirExames = () => {};
function buildExams() {
  const galeria=criarGaleriaExames({root:$('examGallery'),getState:()=>S,
    onShow:id=>{if(act('exam',id))$('examDialog').close();},onHide:()=>act('exam',null)});
  let examContext='';
  refreshExamOptions=()=>{const key=JSON.stringify([S?.scn,S?.rhythm,S?.exam]);if(key!==examContext){examContext=key;galeria.atualizar();}};
  abrirExames=kind=>{galeria.abrir(kind);openDialog('examDialog');};
  click('bCloseExams', () => $('examDialog').close());
  click('bHistoryAll', () => openDialog('historyDialog'));
  click('bHistoryMenu', () => { $('settingsDialog').close?.(); openDialog('historyDialog'); });
  click('bCloseHistory', () => $('historyDialog').close());
  $('bExportHistory').addEventListener('click',()=>{
    const text=historyText(S?.history || []);const url=URL.createObjectURL(new Blob([text],{type:'text/plain;charset=utf-8'}));
    const a=document.createElement('a');a.href=url;a.download='historico-simulacao.txt';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  });
}
$$('[data-exame]').forEach(b => b.addEventListener('click', () => { vibrate(); abrirExames(b.dataset.exame); }));
$$('[data-hide-exam]').forEach(b => b.addEventListener('click', () => { vibrate(); act('exam', null); }));
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
// RCP: conta o tempo desde que este controle viu as compressões começarem.
let rcpDesde = 0;
function renderRcp() {
  if (!S) return;
  if (S.cpr && !rcpDesde) rcpDesde = Date.now();
  if (!S.cpr) rcpDesde = 0;
  const tempo = S.cpr ? fmtTime(Math.floor((Date.now() - rcpDesde) / 1000)) : '';
  $$('[data-cpr]').forEach(b => {
    b.setAttribute('aria-pressed', String(!!S.cpr));
    const l = b.querySelector('.cprl'), curto = !!b.closest('.doca');
    if (l) l.innerHTML = S.cpr ? (curto ? 'Parar' : 'Parar RCP') + ' <span class="tnum">' + tempo + '</span>' : (curto ? 'RCP' : 'Iniciar RCP');
  });
}
function renderTerapia() {
  const ds = S.defib.status, en = S.defib.energy;
  $('energy').textContent = en;
  $('bSync').setAttribute('aria-pressed', String(!!S.defib.sync)); $('bSync').textContent = S.defib.sync ? 'SINC ligado' : 'SINC';
  $('defStatus').textContent = ({ idle: 'escolha a energia e carregue', charging: 'carregando…', ready: 'pronto para chocar', sync: 'aguardando onda R' }[ds] || '') + (S.defib.shocks ? ` · ${S.defib.shocks} choque(s)` : '');
  $('bCharge').textContent = ds === 'charging' ? 'Carregando…' : ds === 'ready' || ds === 'sync' ? 'Carregado' : 'Carregar';
  $('bCharge').disabled = ds !== 'idle';
  $('bShock').disabled = ds !== 'ready';
  $('bShock').textContent = ds === 'ready' ? `Choque ${en} J${S.defib.sync ? ' · SINC' : ''}` : 'Choque';
  $('bDisarm').hidden = ds === 'idle';
  if (document.activeElement !== $('shockTo')) $('shockTo').value = S.shockTo || '';
  const dock = $('dockShock'); dock.dataset.st = ds;
  // Duas linhas: o rótulo e a energia, para "150 J" não quebrar no meio.
  $('dockShockL').innerHTML = (ds === 'charging' ? 'Carregando' : ds === 'ready' ? 'Chocar' : ds === 'sync' ? 'Aguardando R' : 'Carregar') + `<small>${en} J</small>`;
  $('bPacer').setAttribute('aria-pressed', String(!!S.pacer.on)); $('bPacer').textContent = S.pacer.on ? 'Desligar marcapasso' : 'Ligar marcapasso';
  $('pRate').textContent = S.pacer.rate; $('pMa').textContent = S.pacer.ma; $('pThr').textContent = S.pacer.threshold;
  $('capTag').textContent = !S.pacer.on ? 'desligado' : S.captured ? 'com captura' : 'sem captura';
  $('capTag').classList.toggle('on', !!(S.pacer.on && S.captured));
  $('capStatus').textContent = !S.pacer.on ? '' : !S.captured ? `Sem captura — o limiar está em ${S.pacer.threshold} mA.`
    : S.perfusing === false ? 'Captura elétrica, sem pulso (ritmo de PCR): sem pleth, SpO₂ nem PNI.' : 'Com captura elétrica e pulso.';
  renderRcp();
}
function renderCasoResumo() {
  const sc = SCENARIO_BY_ID[S.scn?.id];
  const etapa = sc?.etapas[S.scn.step];
  $('fCasoTitulo').textContent = sc ? sc.titulo : 'Nenhum caso em andamento';
  $('fCasoEtapa').textContent = sc ? `Etapa ${S.scn.step + 1} de ${sc.etapas.length}` : 'Caso';
  $('fCasoNota').textContent = etapa ? etapa.titulo : 'Escolha um cenário em "Caso e aula" ou conduza livremente.';
  $('lStage').textContent = sc ? `${S.scn.step + 1}/${sc.etapas.length} · ${etapa.titulo}` : '';
  // Exame aberto no monitor.
  const exame = EXAM_BY_ID[S.exam];
  $$('[data-exame]').forEach(b => b.setAttribute('aria-pressed', String(exame?.kind === b.dataset.exame)));
  const agora = $('exameAgora'); agora.hidden = !exame;
  const txt = agora.querySelector('span'); if (txt) txt.textContent = exame ? 'No monitor: ' + (exame.kind === 'ecg' ? 'ECG ' : 'Raio-X ') + (+exame.id.split('-')[1] + 1) : '';
}
function render() {
  refreshExamOptions();
  $('timer').textContent=fmtTime(remoteTimerSeconds(S.timer,receivedAt));
  if(S)classroomUI?.render(S);
  renderHistory();
  // Faixa do celular: o que a turma vê. Sensor desligado aparece como "--",
  // igual ao monitor, mesmo que o valor já esteja ajustado.
  const d = S.displayed || {}, ver = (canal, v) => S.show?.[canal] ? (v ?? '--') : '--';
  $('lHr').textContent = ver('ecg', d.hr);
  $('lSpo2').textContent = ver('spo2', d.spo2);
  $('lBp').textContent = !S.show?.nibp ? '--/--' : S.nibp.measuring ? `${S.nibp.cuff ?? ''}…` : `${S.nibp.sys ?? '--'}/${S.nibp.dia ?? '--'}`;
  $('lRr').textContent = ver('resp', d.rr);
  $('lEtco2').textContent = ver('capno', d.etco2);
  $('lTemp').textContent = ver('temp', d.temp != null ? Number(d.temp).toFixed(1).replace('.', ',') : null);
  const r = RHYTHM_BY_ID[S.rhythm], pulso = effectivePulse();
  $('lRhythm').textContent = r ? r.nome : '';
  $('lPulse').textContent = pulso ? 'com pulso' : 'sem pulso';
  $('rchip').classList.toggle('crit', !pulso);
  renderBadges();
  const a = S.alarmsNow?.[0];
  $('lAlarm').textContent = a && a.txt !== r?.nome ? a.txt : ''; $('lAlarm').className = 'al ' + (a?.level || '');

  lembrarRitmo(S.rhythm); renderRecentes();
  $$('.rbtn').forEach(b => b.classList.toggle('active', b.dataset.rhythm === S.rhythm));
  const pcr = { vf: S.rhythm === 'vf', tvsp: S.rhythm === 'vt' && !pulso, asys: S.rhythm === 'asys', aesp: !pulso && !['vf', 'vt', 'asys', 'tdp', 'agonal'].includes(S.rhythm) };
  $$('[data-quick]').forEach(b => b.classList.toggle('active', !!pcr[b.dataset.quick]));
  markSeg(document.querySelector('[data-seg="pulse"]'), pulso ? 'on' : 'off');
  markSeg(document.querySelector('[data-seg="vfAmp"]'), S.vfAmp);
  markSeg(document.querySelector('[data-seg="capno"]'), S.capno);
  markSeg(document.querySelector('[data-seg="nibpInt"]'), S.nibp.interval || 0);
  $('vfAmpBox').classList.toggle('inativo', S.rhythm !== 'vf');
  renderTransicao();
  renderVitals();
  renderScenario();
  renderCasoResumo();
  renderTerapia();

  $('swAlarms').checked = S.alarms.enabled; $('swBeep').checked = S.alarms.beep; $('swStudent').checked = S.studentPanel;
}

init();

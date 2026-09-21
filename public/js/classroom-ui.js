import { CLINICAL_REVIEW } from './clinical-review.js';
import { VERSION, escapeHTML as esc, SCENARIOS, SCENARIO_BY_ID, scenarioReviewText } from './classroom.js';
import { describeSet } from './descriptions.js';
import { createDebriefExport } from './debrief-export.js';
import { initScenarioEditor } from './scenario-editor.js';
const $ = id => document.getElementById(id);
export function initClassroom({ getState, act, pair, id, toast }) {

 $('classroom').innerHTML=`<details class="card more-options" id="caseTiming"><summary>Avanço por tempo</summary><label class="switch"><input type="checkbox" id="timedAdvance"> Avançar automaticamente</label><label for="stageWait">Tempo nesta etapa</label><select class="sel" id="stageWait"><option value="300">Após 5 min</option><option value="180">Após 3 min</option><option value="120">Após 2 min</option><option value="60">Após 1 min</option><option value="30">Após 30 s</option><option value="15">Após 15 s</option></select><p id="stageCountdown" role="status" class="muted small"></p><p class="muted small">Desligado ao abrir ou trocar de caso. Pausar congela a contagem. Tempos didáticos, ajustáveis pelo instrutor.</p></details><details class="card more-options" id="classroomOptions"><summary>Mais opções da aula</summary><p id="physiology" role="status"></p><button class="btn" id="bAudioCheck">Testar som no monitor</button>
 <label for="advanceMode">Avanço por choque ou captura</label><select id="advanceMode" class="sel"><option value="auto">Automático: responde a choque/captura</option><option value="manual">Manual: instrutor decide</option></select>
 <label for="teachingMode">Modo de ensino</label><select id="teachingMode" class="sel"><option value="assessment">Avaliação: ECG sem diagnóstico escrito</option><option value="teaching">Ensino: alarmes identificam ritmos</option></select>
 <p id="nextPreview" class="muted small"></p><p id="caseReview" class="muted small"></p><a id="caseSourceLink" target="_blank" rel="noopener noreferrer" hidden>Consultar fonte do caso</a>
 <details class="card"><summary>Checagem antes da aula</summary><p id="preflight" role="status"></p><button id="bPair" class="btn full">Solicitar autorização no monitor</button><label class="switch"><input type="checkbox" id="audioHeard"> Ouvi o som do monitor</label><p class="muted small">A autorização aparece no monitor. Compare o identificador. Confirme volume e comunicação antes de iniciar o caso.</p></details>
 <details class="card" id="debriefPanel"><summary>Registro e debrief</summary><label for="manualEvent">Ação informada pelo instrutor</label><input id="manualEvent" class="sel" maxlength="180" placeholder="Ex.: medicação, dose e horário"><div class="grid2"><button class="btn" id="bIntubation">Intubação informada</button><button class="btn" id="bMedication">Medicação informada</button></div><button class="btn full" id="bAnnotation">Registrar texto</button><button class="btn full" id="bDebrief">Exportar debrief completo</button><p id="exportStatus" class="muted small" role="status"></p><p class="muted small">Relatos não alteram sinais nem representam ações detectadas. Até 5000 eventos ficam neste navegador do monitor.</p></details>
 <details class="card"><summary>Meus cenários</summary><label for="caseTemplate">Original para duplicar</label><select id="caseTemplate" class="sel">${SCENARIOS.map(s=>'<'+'option value="'+s.id+'">'+esc(s.titulo)+'</option>').join('')}</select><button id="bDuplicate" class="btn full">Duplicar e editar</button><div id="customCases"></div></details></details>`;
 const debrief=createDebriefExport({
   getState, act,
   setStatus: text => { $('exportStatus').textContent=text; },
 });
 $('bDebrief').onclick=debrief.start;

  $('timedAdvance').onchange=e=>act('timed-advance',e.target.checked);
  $('stageWait').onchange=e=>act('stage-wait',Number(e.target.value));
  $('bPair').onclick = pair;
  $('bAudioCheck').onclick = () => act('audio-test');
  $('advanceMode').onchange = event => act('advance-mode', event.target.value);
  $('teachingMode').onchange = event => act('assessment', event.target.value === 'assessment');
  $('bIntubation').onclick = () => act('annotation', 'Intubação orotraqueal informada');
  $('bMedication').onclick = () => {
    if (!$('manualEvent').value.trim()) {
      $('manualEvent').focus();
      return toast('Informe medicação e dose no campo de texto.');
    }
    if (act('annotation', 'Medicação: ' + $('manualEvent').value.slice(0,165))) $('manualEvent').value = '';
  };
  $('bAnnotation').onclick = () => {
    const text = $('manualEvent').value.trim();
    if (text && act('annotation', text)) $('manualEvent').value = '';
  };
  initScenarioEditor({ getState, act, toast });

  let lastCase = null;
  function render(state) {
    $('timedAdvance').checked=state.timedAdvance===true;
    const wait=String(state.stageWait??120);
    if(![...$('stageWait').options].some(option=>option.value===wait))$('stageWait').add(new Option(wait+' s',wait));
    $('stageWait').value=wait;
    const hasNext=!!SCENARIO_BY_ID[state.scn.id]?.etapas[state.scn.step+1];
    $('timedAdvance').disabled=!hasNext;
    $('stageWait').disabled=!hasNext;
    $('stageCountdown').textContent=!hasNext?'Sem próxima etapa.':state.stageWait===0?'Etapa sem avanço por tempo · use a seta.':state.timedAdvance?'Próxima etapa em '+state.stageRemaining+' s'+(state.paused?' · pausado':''):'Desligado · use as setas para avançar.';

    $('advanceMode').value = state.automatic === false ? 'manual' : 'auto';
    $('teachingMode').value = state.assessment ? 'assessment' : 'teaching';
    const capnoActive = state.show.capno && state.capno !== 'none' && state.cur.rr > 0;
    $('physiology').textContent = 'Pulso ' + (state.perfusing ? 'presente' : 'ausente') +
      ' • Ventilação simulada ' + Math.round(state.cur.rr) + '/min • Capnografia ' +
      (capnoActive ? 'ativa' : 'inativa') + (state.paused ? ' • PAUSADA' : '');

    const scenario = SCENARIO_BY_ID[state.scn.id];
    const next = scenario?.etapas[state.scn.step + 1];
    $('nextPreview').textContent = next
      ? 'Próxima etapa: ' + next.titulo + ' — ' + describeSet(next.set, next.dur)
      : scenario ? 'Última etapa do caso.' : 'Selecione um caso ou conduza livremente.';
    const review = CLINICAL_REVIEW[scenario?.id];
    $('caseSourceLink').hidden = !review;
    if (review) $('caseSourceLink').href = review.url;
    $('caseReview').textContent = scenarioReviewText(scenario);

    const authorization = state.version !== VERSION ? 'VERSÕES DIFERENTES'
      : state.authorized?.includes(id) ? 'Autorizado • estado recebido' : 'Aguardando autorização no monitor';
    $('preflight').textContent = 'Seu controle: ' + id.slice(-6) + ' • Controle ' + VERSION +
      ' • Monitor ' + (state.version || 'antigo') + ' • ' + authorization + ' • ' +
      (state.peerRecent ? 'Comunicação de ida e volta recente' : 'Confirme a comunicação');

    if (lastCase && !state.scn.id) {
      $('exportStatus').textContent = 'Caso encerrado. Exporte o debrief para guardar os registros.';
      $('classroomOptions').open = true;
      $('debriefPanel').open = true;
      debrief.start();
    }
    lastCase = state.scn.id;
  }

  return { ack: debrief.ack, render };
}

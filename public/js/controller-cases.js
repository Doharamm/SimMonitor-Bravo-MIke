import { SCENARIOS, SCENARIO_BY_ID } from './scenario-catalog.js';
import { escapeHTML } from './classroom.js';

// Apresenta casos e confirma trocas; as ações continuam passando pelo envio autorizado.
export function createControllerCases({document, getState, act, vibrate, confirmAction, interruptList}) {
  const $ = id => document.getElementById(id);
  function buildScenarios() {
    $('scnList').innerHTML = SCENARIOS.map(s => `
      <div class="card scn">
        <span class="tagx ${s.tag === 'APH' ? 'aph' : ''}">${s.tag}</span>
        <div class="tt">${s.titulo}</div>
        <p>${s.resumo} · ${s.etapas.length} etapas</p>
        <button class="btn" data-scn="${s.id}">Iniciar este caso</button>
      </div>`).join('');
    $('scnList').addEventListener('click', e => {
      const b = e.target.closest('[data-scn]'); if (!b) return;
      vibrate();
      const S = getState();
      const id = b.dataset.scn, sc = SCENARIO_BY_ID[id], cur = S?.scn?.id && SCENARIO_BY_ID[S.scn.id], c = interruptList();
      if (!cur && !c.length) return act('scn-load', id);
      const text = (cur ? `Encerrar “${cur.titulo}” e iniciar “${escapeHTML(sc.titulo)}”?` : `Iniciar “${escapeHTML(sc.titulo)}”?`) +
        (c.length ? ` Será interrompido: ${c.join(', ')}.` : '') + ' Alarmes, bipe e parâmetros visíveis são mantidos.';
      confirmAction(cur ? 'Trocar de caso?' : 'Iniciar caso?', text, cur ? 'Trocar caso' : 'Iniciar', () => act('scn-load', id));
    });
    $('scnActive').addEventListener('click', e => {
      const b = e.target.closest('[data-scnact]'); if (!b) return;
      vibrate();
      const a = b.dataset.scnact;
      if (a === 'go') act('scn-go', Number(b.dataset.i));
      else if (a === 'scn-stop') confirmAction('Encerrar cenário?', 'O caso deixa de avançar sozinho. Os sinais atuais continuam no monitor.', 'Encerrar', () => act('scn-stop'));
      else act(a);
    });
  }
  let pickerKey = null;
  function renderScenario() {
    const S = getState();
    const box = $('scnActive');
    const sc = S.scn?.id && SCENARIO_BY_ID[S.scn.id];
    const key = sc ? sc.id : '';
    if (pickerKey !== key) { pickerKey = key; $('scnPicker').open = !sc; $('scnPickerSummary').textContent = sc ? 'Trocar de caso…' : 'Cenários'; }
    if (!sc) { box.innerHTML = ''; box.dataset.key = ''; return; }
    const i = S.scn.step, e = sc.etapas[i];
    const auto = S.automatic===false ? 'Avanço manual: o instrutor decide quando prosseguir.' : e.onShock ? 'Avança sozinho quando o choque for aplicado.' : e.onCapture ? 'Avança sozinho quando houver captura do marcapasso.' : '';
    const html = `
      <div class="card scn active-scn">
        <div class="lbl">Caso em andamento</div>
        <span class="tagx ${sc.tag === 'APH' ? 'aph' : ''}">${escapeHTML(sc.tag)}</span>
        <div class="tt">${escapeHTML(sc.titulo)}</div>
        <p>Etapa ${i + 1} de ${sc.etapas.length}: <b style="color:var(--text)">${escapeHTML(e.titulo)}</b></p>
        <details class="case-guidance"><summary>Orientações da etapa</summary><div class="nota">${escapeHTML(e.nota)}${auto ? `<span class="auto">${auto}</span>` : ''}</div></details>
        <details class="case-options"><summary>Mais opções do caso</summary><div class="steps">${sc.etapas.map((st, j) => `<button class="btn step ${j === i ? 'cur' : ''}" data-scnact="go" data-i="${j}"><span class="n">${j + 1}</span>${escapeHTML(st.titulo)}</button>`).join('')}</div>
        <button class="btn ghost danger" data-scnact="scn-stop">Encerrar cenário</button></details>
      </div>`;
    if (box.dataset.key !== sc.id + i + ':' + S.automatic + ':' + (sc.revision||0)) { box.innerHTML = html; box.dataset.key = sc.id + i + ':' + S.automatic + ':' + (sc.revision||0); }
  }


  return { buildScenarios, renderScenario };
}

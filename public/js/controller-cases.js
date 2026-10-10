import { SCENARIOS, SCENARIO_BY_ID } from './scenario-catalog.js';
import { RHYTHM_BY_ID } from './rhythm-catalog.js';
import { scenarioStepSet } from './simulation-state.js';
import { escapeHTML } from './classroom.js';

// Seletor visual de casos: filtros, busca e um cartão por caso com o ritmo de
// chegada desenhado pelo próprio motor do monitor. Iniciar continua passando
// pela confirmação e pelo envio autorizado.
const FILTROS = [['todos', 'Todos'], ['ACLS', 'ACLS'], ['APH', 'APH']];
const semAcento = t => String(t).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// Resumo do caso para o cartão: chegada (etapa 1) e o que ele vai exigir.
function resumoCaso(sc) {
  const chegada = scenarioStepSet(sc, 0);
  const ritmo = RHYTHM_BY_ID[chegada.rhythm];
  const semPulso = chegada.pulse === 'off' || (chegada.pulse !== 'on' && ritmo && !ritmo.pulse);
  const v = chegada.vit;
  const sinais = semPulso ? 'Sem pulso' : `FC ${v.hr} · PA ${v.sys}/${v.dia} · SpO₂ ${v.spo2}%`;
  const exige = [];
  if (sc.etapas.some(e => e.onShock && e.requireSync)) exige.push('Cardioversão sincronizada');
  if (sc.etapas.some(e => e.onShock && !e.requireSync)) exige.push('Desfibrilação');
  if (sc.etapas.some(e => e.onCapture)) exige.push('Marcapasso');
  if (sc.etapas.some((e, i) => { const s = scenarioStepSet(sc, i); const r = RHYTHM_BY_ID[s.rhythm]; return s.pulse === 'off' || (s.pulse !== 'on' && r && !r.pulse); })) exige.push('PCR');
  return { ritmo: chegada.rhythm, nomeRitmo: ritmo?.nome || chegada.rhythm, hr: semPulso && !(v.hr > 0) ? 0 : v.hr, pulso: !semPulso, sinais, exige };
}

// A busca acha o caso por qualquer ritmo que ele atravessa, não só o de chegada.
const textoBusca = sc => [sc.titulo, sc.resumo, sc.tag, ...sc.etapas.map((e, i) => `${e.titulo} ${RHYTHM_BY_ID[scenarioStepSet(sc, i).rhythm]?.nome || ''}`)].join(' ');

function cartao(sc, ativo) {
  const r = resumoCaso(sc), aph = sc.tag === 'APH';
  const etapas = sc.etapas.map(e => `<li>${escapeHTML(e.titulo)}${e.onShock ? ` <small>avança no choque${e.requireSync ? ' sincronizado' : ''}</small>` : e.onCapture ? ' <small>avança na captura</small>' : ''}</li>`).join('');
  return `<article class="cx-card${aph ? ' aph' : ''}${ativo ? ' ativo' : ''}">
    <div class="cx-traco" data-ritmo="${escapeHTML(r.ritmo)}" data-hr="${Number(r.hr) || 0}" data-pulso="${r.pulso ? 1 : 0}"><span>${escapeHTML(r.nomeRitmo)}</span></div>
    <div class="cx-corpo">
      <div class="cx-l1"><span class="tagx${aph ? ' aph' : ''}">${escapeHTML(sc.tag)}</span>${ativo ? '<span class="cx-andamento">Em andamento</span>' : ''}<span class="cx-n">${sc.etapas.length} etapas</span></div>
      <div class="tt">${escapeHTML(sc.titulo)}</div>
      <p>${escapeHTML(sc.resumo)}</p>
      <div class="cx-sinais">${escapeHTML(r.sinais)}</div>
      ${r.exige.length ? `<div class="cx-exige">${r.exige.map(x => `<span>${x}</span>`).join('')}</div>` : ''}
      <details class="cx-etapas"><summary>Ver etapas</summary><ol>${etapas}</ol></details>
      <button class="btn cx-iniciar" data-scn="${escapeHTML(sc.id)}">${ativo ? 'Reiniciar este caso' : 'Iniciar caso'}</button>
    </div>
  </article>`;
}

// Miniatura do ritmo: 4 s do motor, amostrados a 200 Hz. A faixa vertical
// (−0,9 a 1,4) é mais justa que a do monitor para os complexos aparecerem no
// cartão baixo. Só roda num navegador de verdade.
const cacheTracado = new Map();
function tracadoSvg(Engine, ritmo, hr, pulso) {
  const chave = ritmo + ':' + hr + ':' + pulso;
  if (cacheTracado.has(chave)) return cacheTracado.get(chave);
  const e = new Engine({ seed: 3 });
  e.setRhythm(ritmo, 0);
  e.setParams({ hr, sys: 100, pulse: pulso, noise: false, pacer: { on: false, rate: 70, ma: 0, threshold: 15 } });
  const T0 = 2, T1 = 6, sr = 200, pts = [];
  let prox = 0;
  for (let t = 0; t < T1; t += 1 / sr) {
    if (t >= prox) { e.schedule(t); e.popBeats(t); prox = t + 0.05; }
    if (t >= T0) pts.push(e.ecg(t));
  }
  const y = v => (60 - 3 - (Math.max(-0.9, Math.min(1.4, v)) + 0.9) / 2.3 * 50).toFixed(1);
  const d = pts.map((v, i) => (i ? 'L' : 'M') + (i * 400 / (pts.length - 1)).toFixed(1) + ',' + y(v)).join('');
  const svg = `<svg viewBox="0 0 400 60" preserveAspectRatio="none" aria-hidden="true"><path d="${d}"/></svg>`;
  cacheTracado.set(chave, svg);
  return svg;
}
async function desenharTracados(raiz) {
  if (!raiz?.querySelectorAll) return;
  try {
    const { Engine } = await import('./engine.js');
    for (const el of raiz.querySelectorAll('.cx-traco[data-ritmo]:not([data-feito])')) {
      el.insertAdjacentHTML('afterbegin', tracadoSvg(Engine, el.dataset.ritmo, Number(el.dataset.hr), el.dataset.pulso === '1'));
      el.dataset.feito = '1';
    }
  } catch { /* sem miniatura: o cartão continua funcionando */ }
}

export function createControllerCases({document, getState, act, vibrate, confirmAction, interruptList}) {
  const $ = id => document.getElementById(id);
  let filtro = 'todos', busca = '';
  const visiveis = () => SCENARIOS.filter(s => (filtro === 'todos' || s.tag === filtro) &&
    (!busca || semAcento(textoBusca(s)).includes(semAcento(busca))));
  const grade = () => {
    const ativo = getState()?.scn?.id, lista = visiveis();
    return lista.length ? lista.map(s => cartao(s, s.id === ativo)).join('') : '<p class="muted">Nenhum caso encontrado.</p>';
  };
  function atualizarGrade() {
    const g = $('scnList').querySelector?.('.cx-grade'); if (!g) return;
    g.innerHTML = grade(); desenharTracados(g);
    $('scnList').querySelectorAll('[data-scnfiltro]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.scnfiltro === filtro)));
  }
  function iniciar(id) {
    vibrate();
    const S = getState();
    const sc = SCENARIO_BY_ID[id], cur = S?.scn?.id && SCENARIO_BY_ID[S.scn.id], c = interruptList();
    if (!sc) return;
    if (!cur && !c.length) return act('scn-load', id);
    // Texto puro: confirmAction() o coloca com textContent. Escapar aqui faria
    // um título com aspas ou & aparecer como &#39; e &amp; na confirmação.
    const text = (cur ? `Encerrar “${cur.titulo}” e iniciar “${sc.titulo}”?` : `Iniciar “${sc.titulo}”?`) +
      (c.length ? ` Será interrompido: ${c.join(', ')}.` : '') + ' Os sensores começam desligados no caso novo; alarmes e bipe são mantidos.';
    confirmAction(cur ? 'Trocar de caso?' : 'Iniciar caso?', text, cur ? 'Trocar caso' : 'Iniciar', () => act('scn-load', id));
  }
  function buildScenarios() {
    const contagem = k => k === 'todos' ? SCENARIOS.length : SCENARIOS.filter(s => s.tag === k).length;
    $('scnList').innerHTML = `
      <div class="cx-topo">
        <div class="cx-filtros">${FILTROS.map(([k, n]) => `<button type="button" class="btn" data-scnfiltro="${k}" aria-pressed="${k === filtro}">${n} <small>${contagem(k)}</small></button>`).join('')}</div>
        <input type="search" class="sel cx-busca" placeholder="Buscar caso, ritmo ou tema" aria-label="Buscar caso">
      </div>
      <div class="cx-grade">${grade()}</div>`;
    desenharTracados($('scnList'));
    $('scnList').addEventListener('click', e => {
      const b = e.target.closest('[data-scn],[data-scnfiltro]'); if (!b) return;
      if (b.dataset.scnfiltro !== undefined && b.dataset.scn === undefined) { filtro = b.dataset.scnfiltro; atualizarGrade(); return; }
      iniciar(b.dataset.scn);
    });
    $('scnList').addEventListener('input', e => {
      if (!e.target.classList?.contains('cx-busca')) return;
      busca = e.target.value; atualizarGrade();
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
    if (pickerKey !== key) { pickerKey = key; $('scnPicker').open = !sc; $('scnPickerSummary').textContent = sc ? 'Trocar de caso…' : 'Cenários'; atualizarGrade(); }
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

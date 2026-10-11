import { EXAMS, EXAM_BY_ID } from './exams.js';
import { EXAM_INFO } from './exam-info.js';
import { examsForState, ecgsDoRitmo } from './case-exams.js';
import { RHYTHM_BY_ID } from './rhythm-catalog.js';
import { filterExams } from './exam-search.js';

// Galeria de exames usada no controle e no monitor: abas ECG / Raio-X, busca,
// os sugeridos para a etapa do caso e todas as imagens em miniatura. Escolher
// é só marcar; o exame vai para o monitor apenas pelo botão "Mostrar".
const NOMES = { ecg: 'ECG', xray: 'Raio-X' };
const numero = exam => +exam.id.split('-')[1] + 1;
export const examInfo = exam => EXAM_INFO[exam.id] || '';
// O que a galeria marca e já deixa escolhido. No caso: o exame da etapa. Fora
// de caso, na aba ECG: o ECG do ritmo atual; sem nenhum compatível, um aviso e
// nada escolhido. `comNome` falso esconde o nome do ritmo (tela projetada).
export function sugestaoExames(estado, kind, comNome = true) {
  if (estado?.scn?.id) return { lista: examsForState(estado, kind), titulo: `Exame deste caso · etapa ${estado.scn.step + 1}`, selo: 'Deste caso', aviso: '' };
  if (kind !== 'ecg' || !estado?.rhythm) return { lista: [], titulo: '', selo: '', aviso: '' };
  const nome = RHYTHM_BY_ID[estado.rhythm]?.nome || estado.rhythm;
  const lista = ecgsDoRitmo(estado.rhythm);
  return {
    lista, selo: 'Compatível',
    titulo: 'Compatível com o ritmo atual' + (comNome ? ` · ${nome}` : ''),
    aviso: lista.length ? '' : `Nenhum ECG do acervo é compatível com ${comNome ? `“${nome}”` : 'o ritmo atual'}. Nada foi escolhido; se quiser, escolha um abaixo.`,
  };
}
const busca = exam => ({ ...exam, label: `${exam.label} ${NOMES[exam.kind]} ${numero(exam)} ${examInfo(exam)}` });

export function criarGaleriaExames({ root, getState, onShow, onHide, descricoes = true }) {
  let kind = 'ecg', escolhido = '', verDescricoes = descricoes, marcados = new Set(), selo = '';
  root.classList.add('galeria');
  root.innerHTML = `
    <div class="gal-topo">
      <div class="gal-abas" role="tablist">${Object.entries(NOMES).map(([k, n]) =>
        `<button type="button" role="tab" data-gal-kind="${k}">${n} <small>${EXAMS.filter(e => e.kind === k).length}</small></button>`).join('')}</div>
      <input type="search" class="gal-busca" placeholder="Buscar: número ou achado (ex.: 14, BAV, pneumotórax)" aria-label="Buscar exame">
      ${descricoes ? '' : '<button type="button" class="gal-desc" aria-pressed="false">Mostrar descrições</button>'}
    </div>
    <div class="gal-lista" tabindex="-1"></div>
    <div class="gal-rodape">
      <span class="gal-sel" role="status"></span>
      <button type="button" class="btn gal-ocultar">Ocultar exame</button>
      <button type="button" class="btn gal-mostrar" disabled>Mostrar no monitor</button>
    </div>`;
  const q = sel => root.querySelector(sel);
  const lista = q('.gal-lista'), campo = q('.gal-busca');

  const cartao = exam => {
    const info = verDescricoes ? examInfo(exam) : '';
    return `<button type="button" class="gal-item${exam.id === escolhido ? ' sel' : ''}" data-gal-id="${exam.id}" aria-pressed="${exam.id === escolhido}">
      <img src="${exam.src}" alt="" loading="lazy" decoding="async">
      <span class="gal-n">${NOMES[exam.kind]} ${numero(exam)}${marcados.has(exam.id) ? ` <em class="gal-caso">${selo}</em>` : ''}</span>${info ? `<span class="gal-t">${info}</span>` : ''}</button>`;
  };
  const sugestao = () => sugestaoExames(getState(), kind, verDescricoes);
  function render() {
    root.querySelectorAll('[data-gal-kind]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.galKind === kind)));
    const texto = campo.value;
    const achados = new Set(filterExams(EXAMS.map(busca), texto, kind).map(e => e.id));
    const todos = EXAMS.filter(e => achados.has(e.id));
    const sug = sugestao();
    marcados = new Set(sug.lista.map(e => e.id)); selo = sug.selo;
    let html = '';
    if (sug.lista.length && !texto) html += `<h3>${sug.titulo}</h3><div class="gal-grade">${sug.lista.map(cartao).join('')}</div><h3>Todos — o instrutor pode escolher outro</h3>`;
    else if (sug.aviso && !texto) html += `<p class="gal-aviso" role="status">${sug.aviso}</p>`;
    html += todos.length ? `<div class="gal-grade">${todos.map(cartao).join('')}</div>` : '<p class="gal-vazio">Nenhum exame encontrado.</p>';
    lista.innerHTML = html;
    const exam = EXAM_BY_ID[escolhido];
    q('.gal-sel').textContent = exam ? `${NOMES[exam.kind]} ${numero(exam)} selecionado` : 'Toque numa imagem para escolher';
    q('.gal-mostrar').disabled = !exam;
    q('.gal-ocultar').disabled = !getState()?.exam;
  }

  root.addEventListener('click', e => {
    const aba = e.target.closest('[data-gal-kind]');
    if (aba) { kind = aba.dataset.galKind; render(); lista.scrollTop = 0; return; }
    const item = e.target.closest('[data-gal-id]');
    if (item) { escolhido = item.dataset.galId; render(); return; }
    if (e.target.closest('.gal-desc')) {
      verDescricoes = !verDescricoes;
      const b = q('.gal-desc'); b.setAttribute('aria-pressed', String(verDescricoes)); b.textContent = verDescricoes ? 'Ocultar descrições' : 'Mostrar descrições';
      render();
    }
  });
  campo.addEventListener('input', render);
  q('.gal-mostrar').addEventListener('click', () => { if (EXAM_BY_ID[escolhido]) onShow(escolhido); });
  q('.gal-ocultar').addEventListener('click', () => onHide());

  return {
    abrir(tipo) {
      kind = NOMES[tipo] ? tipo : kind; campo.value = '';
      const atual = EXAM_BY_ID[getState()?.exam];
      // Já abre com o exame do caso marcado; um toque em outro troca a escolha.
      escolhido = atual?.kind === kind ? atual.id : sugestao().lista[0]?.id || '';
      render(); lista.scrollTop = 0;
    },
    atualizar: render,
  };
}

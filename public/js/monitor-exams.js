import { criarGaleriaExames } from './exam-gallery.js';
import { RHYTHMS, RHYTHM_GROUPS } from './rhythm-catalog.js';

// Atalhos do próprio monitor (Ritmo, ECG, Raio-X): o instrutor conduz a aula
// pelo computador, sem controle remoto. A galeria esconde as descrições por
// padrão porque esta tela costuma estar projetada para os alunos.
export function initMonitorExams({ show, hide, setRhythm, getState }) {
  const $ = id => document.getElementById(id);
  const exames = $('monitorExamPicker'), ritmos = $('monitorRhythmPicker'), grupos = $('monitorRhythmGroups');
  const galeria = criarGaleriaExames({ root: $('monitorExamGallery'), getState, descricoes: false,
    onShow: id => { exames.close(); show(id); }, onHide: () => hide() });
  let contexto = '';
  const chave = () => JSON.stringify([getState()?.scn, getState()?.rhythm, getState()?.exam]);

  function montarRitmos() {
    const atual = getState()?.rhythm;
    grupos.innerHTML = RHYTHM_GROUPS.map(g => `<div class="mr-grupo"><h3>${g}</h3><div class="mr-grade">${RHYTHMS.filter(r => r.grupo === g)
      .map(r => `<button type="button" class="mr-item" data-rhythm="${r.id}" aria-pressed="${r.id === atual}">${r.nome}</button>`).join('')}</div></div>`).join('');
  }
  grupos.addEventListener('click', e => {
    const b = e.target.closest('[data-rhythm]'); if (!b) return;
    ritmos.close(); setRhythm(b.dataset.rhythm);
  });
  $('monitorExamCancel').addEventListener('click', () => exames.close());
  $('monitorRhythmCancel').addEventListener('click', () => ritmos.close());
  $('bMonitorXray').addEventListener('click', () => { contexto = chave(); galeria.abrir('xray'); exames.showModal(); });
  $('bMonitorECG').addEventListener('click', () => { contexto = chave(); galeria.abrir('ecg'); exames.showModal(); });
  $('bMonitorRhythm').addEventListener('click', () => { contexto = chave(); montarRitmos(); ritmos.showModal(); });
  // Chamado a cada quadro: só redesenha quando o caso, o ritmo ou o exame mudam.
  return { refresh() {
    if (!exames.open && !ritmos.open) return;
    const k = chave(); if (k === contexto) return; contexto = k;
    if (exames.open) galeria.atualizar();
    if (ritmos.open) montarRitmos();
  } };
}

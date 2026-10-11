import { EXAMS, EXAM_BY_ID } from './exams.js';
import { SCENARIO_BY_ID } from './scenario-catalog.js';
import { scenarioStepSet } from './simulation-state.js';

// Exame de cada etapa: o que aparece marcado "Deste caso" na galeria e já vem
// escolhido quando o instrutor abre ECG ou Raio-X. Associação didática, sem
// revisão clínica formal; imagens de acervo, não geradas pelo monitor.
// Critério (revisado olhando as imagens em outubro de 2026):
// - o exame do tema do caso quando existe (BAVT, TSV, supra, trauma);
// - fora do tema, um compatível: sinusal normal, taquicardia sinusal ou o
//   raio-X de tórax normal (xray-9), para o aluno que pedir ter o que ver;
// - etapas sem pulso ficam vazias: não se faz ECG de 12 derivações nem raio-X
//   durante a RCP (e examsForState já esconde o ECG sem pulso).
// - O mesmo paciente usa o mesmo traçado em todas as etapas (IAM: supra
//   inferior nítido, coerente com o V4R da nota; TCE: bradicardia sinusal).
// - Não há ECG de ritmo de marcapasso confirmado no acervo; a etapa de captura
//   da bradicardia fica sem ECG.
const entry=(ecg=null,xray=null)=>({ecg,xray});
const RX_NORMAL='xray-9';
export const CASE_EXAMS = {
  bradi: [entry('ecg-13',RX_NORMAL),entry('ecg-13',RX_NORMAL),entry(null,RX_NORMAL)],
  tsv: [entry('ecg-6',RX_NORMAL),entry('ecg-0',RX_NORMAL)],
  fv: [entry(),entry(),entry(),entry(),entry('ecg-2',RX_NORMAL)],
  aesp: [entry('ecg-2','xray-18'),entry('ecg-2','xray-18'),entry(),entry('ecg-2','xray-18')],
  assis: [entry(),entry(),entry('ecg-0',RX_NORMAL)],
  iam: [entry('ecg-21',RX_NORMAL),entry(),entry('ecg-21',RX_NORMAL)],
  asma: [entry('ecg-2',RX_NORMAL),entry('ecg-2',RX_NORMAL),entry('ecg-2',RX_NORMAL)],
  tce: [entry('ecg-11',RX_NORMAL),entry('ecg-11',RX_NORMAL)],
};

// ECG do acervo para cada ritmo, usado fora de caso (no caso vale CASE_EXAMS).
// Do mais para o menos compatível; o primeiro já vem escolhido na galeria.
// Lista vazia: nenhum ECG compatível; a galeria avisa e não escolhe nada.
// Escolhas feitas olhando as imagens em outubro de 2026, sem revisão clínica
// formal (mesmas leituras de exam-info.js). Ritmos de PCR têm o traçado, mas
// dentro de caso a regra de não mostrar ECG sem pulso continua valendo.
export const ECG_POR_RITMO = {
  nsr: ['ecg-0', 'ecg-9'],
  sb: ['ecg-11', 'ecg-1'],
  st: ['ecg-2', 'ecg-32'],
  sa: [],
  svt: ['ecg-6', 'ecg-5'],
  psvt: ['ecg-5'],
  afib: ['ecg-3'],
  afl: ['ecg-8', 'ecg-7'],
  junc: [], pac: [], wpw: [],
  bav1: [], bav2m1: [], bav2m2: [],
  bav3: ['ecg-13', 'ecg-12'],
  bbb: ['ecg-27', 'ecg-22'],
  pvc: ['ecg-23'],
  bige: [],
  ivr: ['ecg-14'],
  vt: ['ecg-19'],
  tdp: [],
  vf: ['ecg-15', 'ecg-36', 'ecg-16'],
  asys: ['ecg-17', 'ecg-18'],
  agonal: [],
  ste: ['ecg-21', 'ecg-35'],
  ste_st: ['ecg-21', 'ecg-35'],
  wellens: [],
};
export const ecgsDoRitmo = ritmo => (ECG_POR_RITMO[ritmo] || []).map(id => EXAM_BY_ID[id]).filter(Boolean);

export function examsForState(state,kind='') {
  if(!state?.scn?.id)return EXAMS.filter(e=>!kind||e.kind===kind);
  const sc=SCENARIO_BY_ID[state.scn.id], row=CASE_EXAMS[state.scn.id]?.[state.scn.step];
  if(!row||!sc)return [];
  const prescribed=scenarioStepSet(sc,state.scn.step);
  return Object.entries(row).filter(([category,id])=>id&&(!kind||category===kind)&&
    (category!=='ecg'||state.rhythm===prescribed.rhythm))
    .map(([,id])=>EXAM_BY_ID[id]).filter(Boolean);
}

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
// - IAM usa o mesmo traçado antes e depois da FV: é o mesmo paciente.
// - Não há ECG de ritmo de marcapasso confirmado no acervo; a etapa de captura
//   da bradicardia fica sem ECG.
const entry=(ecg=null,xray=null)=>({ecg,xray});
const RX_NORMAL='xray-9';
export const CASE_EXAMS = {
  bradi: [entry('ecg-13',RX_NORMAL),entry('ecg-13',RX_NORMAL),entry(null,RX_NORMAL)],
  tsv: [entry('ecg-6',RX_NORMAL),entry('ecg-0',RX_NORMAL)],
  fv: [entry(),entry(),entry(),entry('ecg-2',RX_NORMAL)],
  aesp: [entry('ecg-2','xray-18'),entry('ecg-2','xray-18'),entry(),entry('ecg-2','xray-18')],
  assis: [entry(),entry(),entry('ecg-0',RX_NORMAL)],
  iam: [entry('ecg-35',RX_NORMAL),entry(),entry('ecg-35',RX_NORMAL)],
  asma: [entry('ecg-2',RX_NORMAL),entry('ecg-2',RX_NORMAL),entry('ecg-2',RX_NORMAL)],
  tce: [entry('ecg-1',RX_NORMAL),entry('ecg-1',RX_NORMAL)],
};

export function examsForState(state,kind='') {
  if(!state?.scn?.id)return EXAMS.filter(e=>!kind||e.kind===kind);
  const sc=SCENARIO_BY_ID[state.scn.id], row=CASE_EXAMS[state.scn.id]?.[state.scn.step];
  if(!row||!sc)return [];
  const prescribed=scenarioStepSet(sc,state.scn.step);
  return Object.entries(row).filter(([category,id])=>id&&(!kind||category===kind)&&
    (category!=='ecg'||state.rhythm===prescribed.rhythm))
    .map(([,id])=>EXAM_BY_ID[id]).filter(Boolean);
}

import { EXAMS, EXAM_BY_ID } from './exams.js';
import { SCENARIO_BY_ID } from './scenario-catalog.js';
import { scenarioStepSet } from './simulation-state.js';

// Educational image associations, pending human clinical review. These are static
// examples, not tracings generated from current monitor settings or proof of pulse.
const entry=(ecg=null,xray=null)=>({ecg,xray});
export const CASE_EXAMS = {
  bradi: [entry('ecg-13'),entry('ecg-13'),entry()],
  tsv: [entry('ecg-6'),entry('ecg-0')],
  fv: [entry(),entry(),entry(),entry('ecg-2')],
  aesp: [entry('ecg-2'),entry('ecg-2'),entry(),entry('ecg-2')],
  assis: [entry(),entry(),entry('ecg-0')],
  iam: [entry('ecg-20'),entry(),entry('ecg-20')],
  asma: [entry('ecg-2','xray-9'),entry('ecg-2'),entry('ecg-2')],
  tce: [entry('ecg-1'),entry()],
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

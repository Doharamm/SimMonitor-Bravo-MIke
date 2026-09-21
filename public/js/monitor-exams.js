import { examsForState } from './case-exams.js';

// Local catalog chooser; only an explicit selection is sent to the existing viewer.
export function initMonitorExams({ show, getState }) {
  const $=id=>document.getElementById(id);
  const dialog=$('monitorExamPicker'), select=$('monitorExamSelect');
  let kind=null, context='';
  const contextKey=()=>JSON.stringify([getState()?.scn,getState()?.rhythm,kind]);
  function populate() {
    context=contextKey();
    $('monitorExamHeading').textContent=kind==='ecg'?'Escolher ECG':'Escolher raio-X';
    const items=examsForState(getState(),kind);
    select.replaceChildren(new Option(items.length?'Selecione um exame':'Sem exame associado',''));
    for(const exam of items)select.add(new Option(exam.label,exam.id));
    $('monitorExamShow').disabled=true;
  }
  function open(category) {
    kind=category;populate();dialog.showModal();select.focus();
  }
  select.addEventListener('change',()=>{$('monitorExamShow').disabled=!select.value;});
  $('monitorExamShow').addEventListener('click',()=>{
    const exam=examsForState(getState(),kind).find(item=>item.id===select.value);
    if(!exam){populate();return;}
    dialog.close();show(exam.id);
  });
  $('monitorExamCancel').addEventListener('click',()=>dialog.close());
  $('bMonitorXray').addEventListener('click',()=>open('xray'));
  $('bMonitorECG').addEventListener('click',()=>open('ecg'));
  return {refresh(){if(dialog.open&&context!==contextKey())populate();}};
}

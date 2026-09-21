import { SCENARIOS, SCENARIO_BY_ID } from './scenario-catalog.js';
import { sanitizeSet } from './simulation-state.js';
import { CLINICAL_REVIEW, REVIEW_DATE } from './clinical-review.js';
const savedDate=v=>typeof v==='string'&&Number.isFinite(Date.parse(v))?new Date(v).toISOString():null;
const canonical=v=>JSON.stringify(v,(_,x)=>x&&typeof x==='object'&&!Array.isArray(x)?Object.fromEntries(Object.entries(x).sort(([a],[b])=>a.localeCompare(b))):x);
export const VERSION='2.3.3-online.20260921';
export const escapeHTML=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
// Custom cases never overwrite the shipped catalog. All edits lose clinical approval.
export function validateScenario(raw){
  if(!raw||typeof raw!=='object'||new TextEncoder().encode(JSON.stringify(raw)).length>24000||!/^custom-[a-z0-9-]{1,60}$/.test(raw.id)||!Array.isArray(raw.etapas)||raw.etapas.length<1||raw.etapas.length>20)return null;
  const text=(v,n)=>typeof v==='string'&&v.trim()&&v.length<=n?v.trim():null;
  const titulo=text(raw.titulo,100),resumo=text(raw.resumo,240);if(!titulo||!resumo)return null;
  const etapas=[];
  for(const e of raw.etapas){
    if(!e||!text(e.titulo,100)||!text(e.nota,1200)||!Number.isFinite(e.dur)||e.dur<0||e.dur>600||!e.set)return null;
    const set=sanitizeSet(e.set);if(!Object.keys(set).length||canonical(set)!==canonical(e.set))return null;
    if(e.wait!==undefined&&(!Number.isInteger(e.wait)||e.wait<0||e.wait>600))return null;
    etapas.push({titulo:e.titulo,nota:e.nota,dur:e.dur,wait:e.wait??120,set,...(e.onShock==='next'?{onShock:'next',requireSync:e.requireSync===true}:{}),...(e.onCapture==='next'?{onCapture:'next'}:{})});
  }
  return {id:raw.id,titulo,resumo,tag:'Personalizado',etapas,revision:Math.max(1,Math.min(999,Math.trunc(raw.revision)||1)),source:typeof raw.source==='string'?raw.source.slice(0,500):'',originId:typeof raw.originId==='string'?raw.originId.slice(0,80):null,createdAt:savedDate(raw.createdAt),updatedAt:savedDate(raw.updatedAt),reviewedAt:null,approval:'Revisão clínica humana pendente'};
}
export function registerScenario(raw){const sc=validateScenario(raw);if(!sc)return null;SCENARIO_BY_ID[sc.id]=sc;return sc;}
export function readLibrary(storage){try{return JSON.parse(storage.getItem('bmsim-custom-cases')||'[]').map(validateScenario).filter(Boolean).slice(0,30);}catch{return [];}}
export function saveLibrary(storage,list){storage.setItem('bmsim-custom-cases',JSON.stringify(list.slice(0,30)));}
export function duplicateScenario(sc){const now=new Date().toISOString();return {...structuredClone(sc),source:caseSources(sc),originId:sc.originId||sc.id,createdAt:now,updatedAt:now,reviewedAt:null,approval:'Revisão clínica humana pendente',id:'custom-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,8),titulo:sc.titulo+' — cópia',revision:1};}
export function caseSources(sc){return sc.source || CLINICAL_REVIEW[sc.id]?.source || 'Fonte não registrada';}
export function scenarioReviewText(sc){
  if(!sc)return '';
  if(CLINICAL_REVIEW[sc.id])return caseSources(sc)+' • revisão documental: '+REVIEW_DATE.split('-').reverse().join('/')+' • aprovação clínica humana pendente.';
  const date=v=>savedDate(v)?new Date(v).toLocaleString('pt-BR'):'não registrada';
  return caseSources(sc)+' • criação: '+date(sc.createdAt)+' • edição: '+date(sc.updatedAt)+' • revisão clínica humana pendente.';
}
export { SCENARIOS, SCENARIO_BY_ID };

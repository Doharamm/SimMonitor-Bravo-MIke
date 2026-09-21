import test from 'node:test';
import assert from 'node:assert/strict';
import * as shared from '../public/js/shared.js';
import { SCENARIOS, SCENARIO_BY_ID } from '../public/js/scenario-catalog.js';
import { DEFAULT_VITALS, VITAL_PRESETS } from '../public/js/simulation-config.js';
import { defaultState, interruptedActivities } from '../public/js/simulation-state.js';
import { evaluateReadings } from '../public/js/monitor-readings.js';
import { createControllerCases } from '../public/js/controller-cases.js';

test('module boundaries preserve the one scenario registry used by old and new consumers',()=>{
  assert.equal(shared.SCENARIOS,SCENARIOS);
  assert.equal(shared.SCENARIO_BY_ID,SCENARIO_BY_ID);
  assert.equal(shared.defaultState,defaultState);
});

test('changing a running simulation cannot change defaults, presets or another simulation',()=>{
  const first=defaultState(),second=defaultState();
  first.vit.hr=200;first.pacer.ma=180;first.show.ecg=false;
  assert.equal(second.vit.hr,78);assert.equal(DEFAULT_VITALS.hr,78);
  assert.equal(VITAL_PRESETS.normal.hr,78);assert.equal(second.pacer.ma,0);assert.equal(second.show.ecg,true);
});

test('interruption warning accounts for transitions from either local or remote state',()=>{
  const state=defaultState();
  assert.deepEqual(interruptedActivities(null),[]);
  assert.deepEqual(interruptedActivities(state),[]);
  state.defib.status='sync';state.pacer.on=true;state.cpr=true;state.nibp.interval=3;state.exam='ecg-0';
  const expected=['carga do desfibrilador','marcapasso','RCP','transição de sinais','PNI','exame aberto'];
  assert.deepEqual(interruptedActivities(state,{hr:{from:78,to:100}}),expected);
  assert.deepEqual(interruptedActivities(state,{hr:1000}),expected);
});

test('readings preserve startup suppression, alarm priority and hidden channels without mutating state',()=>{
  const state=defaultState();state.rhythm='vf';state.cur={...state.vit,spo2:80};
  const engine={measuredHr:()=>null,captured:()=>false};
  const before=structuredClone(state),clock={t:1,epochNow:10000,bootT:0,acquisitionUntil:4};
  assert.deepEqual(evaluateReadings(state,engine,clock).alarmsNow,[]);
  clock.t=5;
  const result=evaluateReadings(state,engine,clock);
  assert.equal(result.alarmsNow[0].txt,'Fibrilação ventricular');
  assert.equal(result.displayed.spo2,null);assert.deepEqual(state,before);
  state.show.ecg=false;
  assert.ok(evaluateReadings(state,engine,clock).alarmsNow.every(a=>a.ch!=='ecg'));
});

test('capnography requires a curve and ventilation; electrical capture does not create oxygen saturation',()=>{
  const state=defaultState();state.cur={...state.vit,rr:0};state.pulse='off';state.pacer.on=true;
  const engine={measuredHr:()=>70,captured:()=>true},clock={t:5,epochNow:10000,bootT:0,acquisitionUntil:4};
  let result=evaluateReadings(state,engine,clock);
  assert.equal(result.displayed.spo2,null);assert.equal(result.displayed.etco2,null);
  state.cur.rr=10;state.capno='none';
  assert.equal(evaluateReadings(state,engine,clock).displayed.etco2,null);
  state.capno='rcp';state.cpr=true;state.cur.etco2=8;
  result=evaluateReadings(state,engine,clock);
  assert.equal(result.displayed.etco2,8);assert.ok(result.alarmsNow.some(a=>a.txt==='EtCO₂ baixo 8'));
});

test('case controls read replacement state at click time and preserve confirmation before switching',()=>{
  const elements=new Map(),sent=[],confirmations=[];
  const document={getElementById(id){if(!elements.has(id))elements.set(id,{dataset:{},addEventListener(type,fn){this[type]=fn;}});return elements.get(id);}};
  let state=defaultState();
  const ui=createControllerCases({document,getState:()=>state,act:(...args)=>sent.push(args),vibrate(){},interruptList:()=>[],confirmAction:(...args)=>confirmations.push(args)});
  ui.buildScenarios();
  const click=id=>elements.get('scnList').click({target:{closest:()=>({dataset:{scn:id}})}});
  click('tsv');assert.deepEqual(sent,[['scn-load','tsv']]);
  state={...defaultState(),scn:{id:'fv',step:1},automatic:false};
  ui.renderScenario();assert.match(elements.get('scnActive').innerHTML,/Avanço manual/);
  click('tsv');assert.equal(sent.length,1);assert.equal(confirmations.length,1);
  confirmations[0][3]();assert.deepEqual(sent[1],['scn-load','tsv']);
});

import { createControllerCases } from '../public/js/controller-cases.js';
import { PACER_LIMITS, VITAL_PRESETS } from '../public/js/simulation-config.js';
import { interruptedActivities } from '../public/js/simulation-state.js';
import { fmtVital } from '../public/js/descriptions.js';
import { Trace as CanvasTrace } from '../public/js/trace-renderer.js';
import { createMonitorAudio } from '../public/js/monitor-audio.js';
import { evaluateReadings } from '../public/js/monitor-readings.js';
import {SimulationClock} from '../public/js/simulation-clock.js';
import {VERSION,registerScenario,escapeHTML} from '../public/js/classroom.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as shared from '../public/js/shared.js';
import {Engine,POST_SHOCK_FLAT_S} from '../public/js/engine.js';
import {CommandGate,remoteTimerSeconds,MonitorPresence,REFUSAL_TEXT,STATE_MAX_AGE_MS,LEASE_MS} from '../public/js/session.js';
import {ExamViewer} from '../public/js/exam-viewer.js';
import {EventHistory,historyText,historyLine} from '../public/js/history.js';
import {validPublicState} from '../public/js/state-validation.js';
import {filterExams} from '../public/js/exam-search.js';
import {EXAMS,EXAM_BY_ID} from '../public/js/exams.js';
import {CASE_EXAMS,examsForState} from '../public/js/case-exams.js';

test('commands require a current monitor lease, reject expired, replayed and wrong-session messages',()=>{
 let now=1000,id=0; const gate=new CommandGate(()=>now,()=>String(++id));
 assert.equal(gate.accept({from:'a',seq:1,sentAt:0}),false);
 const lease=gate.issue(), msg={...lease,from:'a',seq:1};
 assert.equal(gate.accept({...msg,session:'old'}),false);
 assert.equal(gate.accept(msg),true); assert.equal(gate.accept(msg),false);
 now+=LEASE_MS+1;assert.equal(gate.accept({...msg,seq:2}),false);assert.equal(gate.reason,'lease');
 const current=gate.issue();gate.invalidate();assert.equal(gate.accept({...current,from:'a',seq:3}),false);
});
test('controller timer uses elapsed time and monotonic arrival time',()=>{
 assert.equal(remoteTimerSeconds({elapsedMs:5000,running:true,startedAt:999999999},100,2100),7);
 assert.equal(remoteTimerSeconds({elapsedMs:5000,running:false},100,2100),5);
});
test('57 catalog images exist; no external image URLs',()=>{
 assert.equal(EXAMS.length,57);assert.equal(new Set(EXAMS.map(e=>e.id)).size,57);
 for(const exam of EXAMS){assert.match(exam.src,/^exams\/(ecg|xray)\/[^/]+\.jpg$/);assert.ok(fs.existsSync(new URL('../public/'+exam.src,import.meta.url)));}
});

function fakeDOM(){
 const elements=new Map();const ctx=new Proxy({}, {get:()=>()=>{}});
 const doc={activeElement:null,visibilityState:'visible',listeners:{},addEventListener(type,fn){this.listeners[type]=fn;},querySelectorAll:()=>[],querySelector:()=>get('segment'),getElementById:id=>get(id),createElement:tag=>get('created-'+elements.size)};
 function get(id){
  if(elements.has(id))return elements.get(id);
  const el={id,ownerDocument:doc,dataset:{},textContent:'',hidden:false,value:'',style:{},children:[],listeners:{},classList:{add(){},remove(){},toggle(){}},
   getContext:()=>ctx,getBoundingClientRect:()=>({width:800,height:160}),removeAttribute(k){delete this[k];},setAttribute(k,v){this[k]=v;},
   addEventListener(type,fn){this.listeners[type]=fn;},click(){this.listeners.click?.({});},focus(){doc.activeElement=this;},
   replaceChildren(...nodes){this.children=nodes;},append(n){this.children.push(n);},closest(){return {parentElement:this};},querySelectorAll:()=>[],
   querySelector(sel){return get(({img:'examImage',h2:'examTitle','[data-exam-close]':'bCloseExam'})[sel]||sel);}
  };elements.set(id,el);return el;
 }
 return {doc,get,elements};
}
function monitor(saved=null){
 let now=100000,next=0;const timers=new Map(),elements=new Map(),sent=[];
 const dom=fakeDOM(); const element=dom.get;
 class Transport{constructor(room,receive,status){this.receive=receive;this.onStatus=status;this.mode='demo';this.info=null;this.id='monitor';this.connected=true;}async start(){return 'demo';}send(m){sent.push(m);return true;}}
 const Trace = class extends CanvasTrace { constructor(...args) { super(...args, {devicePixelRatio:1,ResizeObserver:class{observe(){}}}); } };
 const sandbox={createControllerCases,PACER_LIMITS,VITAL_PRESETS,interruptedActivities,fmtVital,Trace,createMonitorAudio,evaluateReadings,...shared,SimulationClock,VERSION,registerScenario,escapeHTML,historyLine,initMonitorExams:()=>{},initClassroom:()=>({render(){},ack(){}}),Engine,CommandGate,REFUSAL_TEXT,EXAM_BY_ID,Transport,ExamViewer,EventHistory,console,URLSearchParams,performance:{now:()=>now},crypto:globalThis.crypto,Date:class extends Date{static now(){return now;}},
  localStorage:{getItem:k=>k==='bmsim-monitor-state'&&saved?JSON.stringify(saved):null,setItem(){}},location:{search:'?modo=demo&sala=4321',origin:'http://localhost',pathname:'/monitor.html'},
  window:{devicePixelRatio:1,isSecureContext:true},navigator:{},ResizeObserver:class{observe(){}},document:dom.doc,
  setTimeout:(fn,ms)=>{const id=++next;timers.set(id,{fn:()=>{timers.delete(id);fn();},ms});return id;},clearTimeout:id=>timers.delete(id),setInterval:(fn,ms)=>{timers.set(++next,{fn,ms});return next;},clearInterval:id=>timers.delete(id),requestAnimationFrame(){}
 };
 const code=fs.readFileSync(new URL('../public/js/monitor.js',import.meta.url),'utf8').replace(/^import .*$/gm,'');
 vm.runInNewContext(code+'\napproved.add("ctrl");\nglobalThis.api = {action,applySet,publicState,simClock,approved,renderExam,transport,gate,getState:()=>S,getNext:()=>nextAutoNibp,deliverShock,evaluate,frame,getAlarms:()=>alarmsNow,engine:()=>eng,pleth:t=>tr.spo2.fn(t),setAudio:v=>ac=v,tone,chargeSound,shockSound,pairRequests,renderPairRequests};',sandbox);
 return {api:sandbox.api,timers,elements:dom.elements,sent,document:dom.doc,advance:ms=>now+=ms};
}
test('loading a new scenario clears pacer, charge, NIBP and pending shock effect',()=>{
 const {api,timers}=monitor();api.applySet({pacer:{on:true,ma:80},nibp:{interval:3}});api.action('charge');api.action('nibp');
 loadAndPlay(api,'tsv');const s=api.getState();assert.equal(s.pacer.on,false);assert.equal(s.defib.status,'idle');assert.equal(s.nibp.measuring,false);assert.equal(s.nibp.interval,0);assert.equal(s.rhythm,'svt');
 assert.equal([...timers.values()].some(t=>t.ms===3000||t.ms===200),false);
});
test('TSV advances only after synchronized shock; old callback cannot advance new scenario',()=>{
 const {api,timers}=monitor();loadAndPlay(api,'tsv');api.getState().defib.sync=false;api.deliverShock(100);
 [...timers.values()].find(t=>t.ms===1300).fn();assert.equal(api.getState().scn.step,0);
 api.getState().defib.sync=true;api.deliverShock(100);const cb=[...timers.values()].find(t=>t.ms===1300).fn;cb();assert.equal(api.getState().scn.step,1);
 loadAndPlay(api,'fv');cb();assert.equal(api.getState().scn.id,'fv');assert.equal(api.getState().scn.step,0);
});
test('restored automatic NIBP is scheduled without manual interaction',()=>{
 const saved=shared.defaultState();saved.nibp.interval=3;const {api}=monitor(saved);assert.equal(api.getNext(),280000);
});
test('exam action accepts only catalog IDs, hides diagnostic title, and reset clears it',()=>{
 const {api,elements}=monitor();api.action('exam','xray-0');api.renderExam();assert.equal(elements.get('examOverlay').hidden,false);assert.equal(elements.get('examTitle').textContent,'Radiografia');
 api.action('exam','https://evil.invalid/x');assert.equal(api.getState().exam,'xray-0');
 loadAndPlay(api,'fv');api.renderExam();assert.equal(elements.get('examOverlay').hidden,true);
});
test('monitor rejects first unleased command and acknowledges current command exactly once',()=>{
 const {api,sent}=monitor();const command={type:'cmd',cmd:'action',name:'charge',from:'ctrl',version:VERSION,seq:1};api.transport.receive(command);assert.equal(api.getState().defib.status,'idle');assert.equal(sent.at(-1).ok,false);
 const {session,lease}=api.publicState();api.transport.receive({...command,session,lease});assert.equal(api.getState().defib.status,'charging');assert.equal(sent.at(-1).ok,true);
 api.transport.receive({...command,session,lease});assert.equal(sent.at(-1).ok,false);
});

function loadAndPlay(api,id){api.action('scn-load',id);if(api.simClock.paused)api.action('pause-simulation');}

function controller(){
 let now=10000,next=0;const timers=new Map(),sent=[];const dom=fakeDOM();
 const sandbox={createControllerCases,PACER_LIMITS,VITAL_PRESETS,interruptedActivities,fmtVital,...shared,SimulationClock,VERSION,registerScenario,escapeHTML,historyLine,initMonitorExams:()=>{},initClassroom:()=>({render(){},ack(){}}),remoteTimerSeconds,MonitorPresence,STATE_MAX_AGE_MS,validPublicState,historyText,EXAMS,EXAM_BY_ID,console,crypto:globalThis.crypto,URLSearchParams,performance:{now:()=>now},location:{search:''},localStorage:{getItem:()=>null},navigator:{},window:{scrollTo(){}},
 document:dom.doc,setTimeout:(fn,ms)=>{const id=++next;timers.set(id,{fn:()=>{timers.delete(id);fn();},ms});return id;},clearTimeout:id=>timers.delete(id),clearInterval(){},setInterval(){}};
 const code=fs.readFileSync(new URL('../public/js/controle.js',import.meta.url),'utf8').replace(/^import .*$/gm,'');
 vm.runInNewContext(code+`\ntransport={connected:true,id:'ctrl',send:msg=>{output(msg);return true;}};
 globalThis.api={unavailableReason,updateWarning,patchState:patch=>{S=patch===null?null:{...S,...patch};},set,setVitals,act,onMsg:msg=>{if(msg.state){msg.state.version=VERSION;msg.state.authorized=[myId];msg.state.paused??=false;msg.state.automatic??=true;msg.state.assessment??=false;msg.state.peerRecent??=true;}return onMsg(msg);},canSend,getStatus:()=>document.getElementById('commandStatus').textContent,schedulePending,flushPending,pending,offline:()=>transport.connected=false,online:()=>transport.connected=true,setState:()=>{monitorId='m1';presence.observe('m1');S={...defaultState(),version:VERSION,authorized:[myId],protocol:2,history:[],displayed:{},alarmsNow:[],hidden:false,captured:false,cur:{...defaultState().vit},session:'one',lease:'lease',timer:{elapsedMs:0,running:false}};receivedAt=performance.now();},pendingCount:()=>Object.keys(pending).length,timerText:()=>fmtTime(remoteTimerSeconds(S.timer,receivedAt)),setTransportMode:m=>{transport.mode=m;}};`,Object.assign(sandbox,{output:msg=>sent.push(msg)}));
 sandbox.api.setState();return {api:sandbox.api,sent,timers,elements:dom.elements,advance:ms=>now+=ms};
}
test('controller drops pending edits when offline or delayed by page suspension',()=>{
 const {api,sent,advance}=controller();api.pending.hr=100;api.schedulePending();api.offline();assert.equal(api.set({vit:{hr:90}}),false);assert.equal(api.pendingCount(),0);
 api.online();api.setState();api.pending.hr=120;api.schedulePending();advance(2600);api.flushPending();assert.equal(sent.length,0);assert.equal(api.pendingCount(),0);
});
test('controller commands carry session/lease/sequence; conflicting monitors block further commands',()=>{
 const {api,sent}=controller();assert.equal(api.set({vit:{hr:90}}),true);assert.equal(sent[0].session,'one');assert.equal(sent[0].lease,'lease');assert.equal(sent[0].seq,1);
 api.onMsg({type:'state',from:'m2',state:{...shared.defaultState(),protocol:2,history:[],displayed:{},alarmsNow:[],hidden:false,captured:false,cur:{...shared.defaultState().vit},session:'other',lease:'other',timer:{running:false,elapsedMs:0}} });assert.equal(api.canSend(),false);
 assert.equal(api.set({vit:{hr:120}}),false);assert.equal(sent.length,1);
});


// New regression requirements: expected failures expose gaps in the delivered copy.
test('REVIEW: loading a scenario must invalidate commands prepared in the previous case',()=>{
 const {api,sent}=monitor();const old=api.publicState();loadAndPlay(api,'fv');
 api.transport.receive({type:'cmd',cmd:'set',data:{vit:{hr:222}},session:old.session,lease:old.lease,seq:1,from:'ctrl',version:VERSION});
 assert.equal(api.getState().vit.hr,78,'An old-case command changed the new case to 222 bpm');
});
test('REVIEW: corrupted state message must not crash the controller renderer',()=>{
 const {api}=controller();assert.doesNotThrow(()=>api.onMsg({type:'state',from:'m1',state:{session:'one',timer:{}}}));
});
test('REVIEW: delayed ACK for older command must not replace latest confirmation',()=>{
 const {api,elements}=controller();api.set({vit:{hr:90}});api.set({vit:{hr:95}});
 api.onMsg({type:'ack',from:'m1',to:'ctrl',seq:2,ok:true});
 api.onMsg({type:'ack',from:'m1',to:'ctrl',seq:1,ok:false});
 assert.equal(elements.get('commandStatus').textContent,'FC 95 — executado');
});
test('REVIEW: pending edits must not be sent after requesting a new scenario',()=>{
 const {api,sent}=controller();api.pending.hr=120;api.schedulePending();
 api.act('scn-load','fv');api.flushPending();
 assert.equal(sent.length,1,'The pending vital edit was sent after the scenario load command');
});
test('REVIEW: restarting a perfusing rhythm must not announce asystole while collecting beats',()=>{
 const {api,advance}=monitor();advance(10000);loadAndPlay(api,'tsv');api.evaluate();
 assert.equal(api.getAlarms().some(a=>a.txt==='Assistolia'),false);
});
test('REVIEW: monitor refresh recovers after the prior sender expires; live collisions stay blocked',()=>{
 const {api,advance}=controller();
 const state={...shared.defaultState(),protocol:2,history:[],displayed:{},alarmsNow:[],hidden:false,captured:false,cur:{...shared.defaultState().vit},session:'new',lease:'new',timer:{elapsedMs:0,running:false}};
 api.onMsg({type:'state',from:'new-monitor',state});assert.equal(api.canSend(),false);
 advance(5100);api.onMsg({type:'state',from:'new-monitor',state});assert.equal(api.canSend(),true);
});

test('public state validator rejects bad scenarios, non-finite values and prototype keys',()=>{
 const {api}=monitor();const good=api.publicState();assert.equal(validPublicState(good),true);
 assert.equal(validPublicState({...good,scn:{id:'tsv',step:99}}),false);
 assert.equal(validPublicState({...good,rhythm:'constructor'}),false);
 assert.equal(validPublicState({...good,cur:{...good.cur,hr:Infinity}}),false);
});
test('history is bounded, independent snapshots and plain-text export',()=>{
 const h=new EventHistory(()=>1000);for(let i=0;i<105;i++)h.add('evento '+i);
 assert.equal(h.snapshot().length,100);assert.equal(h.snapshot()[0].id,6);
 const snapshot=h.snapshot();snapshot[0].text='changed';assert.notEqual(h.snapshot()[0].text,'changed');assert.match(historyText(h.snapshot()),/evento 104/);
});
test('exam viewer handles load failure, retry, zoom, focus and close without stale callbacks',()=>{
 const dom=fakeDOM();const root=dom.get('examOverlay');const button=dom.get('previous');button.focus();
 const viewer=new ExamViewer(root);viewer.show(EXAMS[0]);assert.equal(root.hidden,false);assert.equal(dom.get('app').inert,true);
 const img=dom.get('examImage');const stale=img.onload;img.onerror();assert.equal(dom.get('[data-exam-retry]').hidden,false);
 dom.get('[data-exam-retry]').click();img.naturalWidth=1000;img.onload();assert.equal(img.hidden,false);
 viewer.setZoom(2);assert.equal(img.style.width,'2000px');viewer.setZoom(99);assert.equal(viewer.zoom,4);
 viewer.show(null);stale();assert.equal(root.hidden,true);assert.equal(img.hidden,true);assert.equal(dom.doc.activeElement,button);assert.equal(dom.get('app').inert,false);
});
test('exam search filters category, accents and empty results without changing catalog',()=>{
 assert.equal(filterExams(EXAMS,'','ecg').length,37);assert.equal(filterExams(EXAMS,'','xray').length,20);
 assert.equal(filterExams(EXAMS,'derivacoes','ecg').length,37);
 assert.equal(filterExams(EXAMS,'nonexistent-exam').length,0);assert.equal(EXAMS.length,57);
});
test('monitor history records scenario and applied shock in sequence',()=>{
 const {api}=monitor();loadAndPlay(api,'tsv');api.getState().defib.sync=true;api.deliverShock(100);
 const events=api.publicState().history;assert.match(events[0].text,/TSV/);assert.match(events.at(-1).text,/Choque aplicado/);
 assert.ok(events.at(-1).id>events[0].id);
});
test('preview mode cannot accidentally use the configured online service',async()=>{
 const code=fs.readFileSync(new URL('../public/js/transport.js',import.meta.url),'utf8').replace(/^import .*$/gm,'').replace(/export /g,'');
 const mode=await vm.runInNewContext(code+'; detectMode();',{URLSearchParams,AbortController,setTimeout,clearTimeout,location:{search:'?modo=online'},CONFIG:{supabaseUrl:'https://example.invalid',supabaseKey:'public'},fetch:async()=>({ok:true,json:async()=>({preview:true})})});
 assert.equal(mode.mode,'demo');
});


// ---------------- Correções da revisão de 17/09 ----------------
const baseState=(over={})=>({...shared.defaultState(),protocol:2,history:[],displayed:{},alarmsNow:[],hidden:false,captured:false,cur:{...shared.defaultState().vit},session:'s',lease:'l',timer:{elapsedMs:0,running:false},...over});
test('presence: reload of the same monitor (new boot) is not a conflict; a live duplicate tab is',()=>{
 let t=0;const p=new MonitorPresence(()=>t);
 assert.equal(p.observe('m1','boot1'),true);t=900;assert.equal(p.observe('m1','boot2'),true,'reload must recover immediately');
 t=1500;assert.equal(p.observe('m1','boot1'),false,'old tab still publishing = duplicate');
 p.forget('m1','boot1');t=1600;assert.equal(p.observe('m1','boot2'),true);
 assert.equal(p.observe('m2','x'),false,'different monitor within 5 s = conflict');
});
test('controller: monitor reload shows restart (not duplicate) and accepts commands on the first new state',()=>{
 const {api}=controller();
 api.onMsg({type:'state',from:'m1',boot:'b1',state:baseState({session:'one'})});
 api.onMsg({type:'bye',from:'m1',boot:'b1'});assert.equal(api.canSend(),false);assert.match(api.getStatus(),/recarregando/);
 api.onMsg({type:'state',from:'m1',boot:'b2',state:baseState({session:'two'})});
 assert.equal(api.canSend(),true);assert.match(api.getStatus(),/Monitor reiniciado/);assert.doesNotMatch(api.getStatus(),/Mais de um monitor/);
});
test('controller: acknowledgement shows executed, not executed with reason, and refusal reason',()=>{
 const {api}=controller();
 api.set({rhythm:'vf'});api.onMsg({type:'ack',from:'m1',to:'ctrl',seq:1,ok:true,done:true});assert.equal(api.getStatus(),'Ritmo: Fibrilação ventricular — executado');
 api.act('shock');api.onMsg({type:'ack',from:'m1',to:'ctrl',seq:2,ok:true,done:false,note:'desfibrilador não carregado'});assert.equal(api.getStatus(),'Choque — não executado: desfibrilador não carregado');
 api.act('charge');api.onMsg({type:'ack',from:'m1',to:'ctrl',seq:3,ok:false,reason:'o caso foi trocado ou o monitor reiniciado'});assert.match(api.getStatus(),/Carregar desfibrilador — recusado: o caso foi trocado/);
});
test('monitor: shock without charge is acknowledged as NOT executed and recorded',()=>{
 const {api,sent}=monitor();const {session,lease}=api.publicState();
 api.transport.receive({type:'cmd',cmd:'action',name:'shock',from:'ctrl',version:VERSION,seq:1,session,lease});
 assert.equal(sent.at(-1).ok,true);assert.equal(sent.at(-1).done,false);assert.equal(sent.at(-1).note,'desfibrilador não carregado');
 assert.equal(api.getState().defib.shocks,0);assert.match(api.publicState().history.at(-1).text,/Choque não aplicado/);
 const s2=api.publicState();api.transport.receive({type:'cmd',cmd:'action',name:'charge',from:'ctrl',version:VERSION,seq:2,session:s2.session,lease:s2.lease});
 assert.equal(sent.at(-1).done,true);
});
test('monitor: refused command carries a readable reason',()=>{
 const {api,sent}=monitor();const old=api.publicState();api.action('reset');
 api.transport.receive({type:'cmd',cmd:'action',name:'charge',from:'ctrl',version:VERSION,seq:1,session:old.session,lease:old.lease});
 assert.equal(sent.at(-1).ok,false);assert.equal(sent.at(-1).reason,REFUSAL_TEXT.session);
});
test('monitor: new case keeps instructor preferences and reports what was interrupted',()=>{
 const {api,sent}=monitor();api.applySet({alarms:{beep:false},show:{temp:false},studentPanel:false,pacer:{on:true}});api.action('charge');
 const {session,lease}=api.publicState();
 api.transport.receive({type:'cmd',cmd:'action',name:'scn-load',arg:'bradi',from:'ctrl',version:VERSION,seq:1,session,lease});
 const s=api.getState();assert.equal(s.alarms.beep,false);assert.equal(s.show.temp,false);assert.equal(s.studentPanel,false);
 assert.equal(s.pacer.on,false);assert.equal(s.defib.status,'idle');
 assert.match(sent.at(-1).note,/carga do desfibrilador/);assert.match(sent.at(-1).note,/marcapasso/);
});
test('monitor: pacing in asystole gives electrical capture without pulse, SpO2 or NIBP',()=>{
 const {api,advance}=monitor();api.applySet({rhythm:'asys',pacer:{on:true,ma:80,threshold:60}});
 const e=api.engine();e.setParams({pulse:shared.hasPulse(api.getState()),pacer:api.getState().pacer,hr:78,sys:120});e.setRhythm('asys',100);
 for(let t=100;t<106;t+=0.05){e.schedule(t);e.popBeats(t);}
 assert.equal(e.captured(),true);assert.equal(e.plethC.length,0,'no pleth pulses from electrical capture alone');
 advance(10000);api.evaluate();const st=api.publicState();
 assert.equal(st.perfusing,false);assert.equal(st.displayed.spo2,null);
 const {api:b}=monitor();b.applySet({rhythm:'bav3',pacer:{on:true,ma:80,threshold:60}});assert.equal(b.publicState().perfusing,true);
});
test('engine: slow agonal rhythm does not flicker to "--" (false asystole)',()=>{
 const e=new Engine();e.setParams({hr:20,pulse:false,pacer:{on:false,rate:70,ma:0,threshold:60}});e.rhythm='agonal';e.nextV=0.3;
 let nulls=0,n=0;for(let i=0;i<120*50;i++){const t=i/50;e.schedule(t);e.popBeats(t);if(t>15&&i%25===0){n++;if(e.measuredHr(t)===null)nulls++;}}
 assert.equal(nulls,0,`${nulls}/${n} readings were "--"`);
 const a=new Engine();a.setParams({hr:78});a.rhythm='asys';for(let i=0;i<10*50;i++){const t=i/50;a.schedule(t);a.popBeats(t);}assert.equal(a.measuredHr(10),null);
});
test('history merges repeated adjustments of the same control into one readable event',()=>{
 const {api}=monitor();let s=api.publicState();let seq=0;
 for(const ma of [40,45,50,55,60,65]){s=api.publicState();api.transport.receive({type:'cmd',cmd:'set',data:{pacer:{ma}},from:'ctrl',version:VERSION,seq:++seq,session:s.session,lease:s.lease});}
 const h=api.publicState().history;assert.equal(h.length,1);assert.equal(h[0].text,'Marcapasso 65 mA');
 s=api.publicState();api.transport.receive({type:'cmd',cmd:'set',data:{rhythm:'vf'},from:'ctrl',version:VERSION,seq:++seq,session:s.session,lease:s.lease});
 assert.equal(api.publicState().history.at(-1).text,'Ritmo: Fibrilação ventricular');
});
test('describeSet produces readable labels',()=>{
 assert.equal(shared.describeSet({vit:{hr:140,sys:90,dia:60}},30),'FC 140, PA 90/60 (transição de 30 s)');
 assert.equal(shared.describeSet({defib:{sync:true}}),'SINC ligado');
 assert.equal(shared.describeAction('scn-load','tsv'),'Iniciar cenário: Taquicardia instável — TSV');
});

// ---------------- Pedido de 17/09: pós-choque, FV fina com RCP, pulso ----------------
test('after a shock the ECG stays flat for a short time, then the rhythm returns',()=>{
 const e=new Engine();e.setParams({hr:0,pulse:false,vfAmp:'grossa',cpr:false,pacer:{on:false,rate:70,ma:0,threshold:60}});e.rhythm='vf';
 const amp=(a,b)=>{let m=0;for(let t=a;t<b;t+=0.005)m=Math.max(m,Math.abs(e.ecg(t)-0.035*Math.sin(2*Math.PI*0.21*t)));return m;};
 assert.ok(amp(5,7)>0.2,'coarse VF before shock');
 e.shock(10);
 assert.ok(amp(10.35,10+POST_SHOCK_FLAT_S)<0.05,'flat line right after the shock');
 assert.ok(amp(10+POST_SHOCK_FLAT_S+1,10+POST_SHOCK_FLAT_S+3)>0.2,'VF returns after the flat period');
 // troca de ritmo durante a linha reta não antecipa batimentos
 const g=new Engine();g.setParams({hr:80,pulse:true,pacer:{on:false,rate:70,ma:0,threshold:60}});g.rhythm='vf';g.shock(20);g.setRhythm('nsr',21.3);
 const beats=[];for(let t=21.3;t<26;t+=0.02){g.schedule(t);beats.push(...g.popBeats(t));}
 assert.ok(beats.length>0 && beats[0].t>=20+POST_SHOCK_FLAT_S,'first beat after flat period');
});
test('fine and coarse VF stay distinguishable during CPR',()=>{
 const sd=vfAmp=>{const e=new Engine();e.setParams({vfAmp,cpr:true,pulse:false,pacer:{on:false,rate:70,ma:0,threshold:60}});e.rhythm='vf';
  // remove o artefato de RCP (periódico) comparando com RCP sem FV
  const a=new Engine();a.setParams({vfAmp,cpr:true,pulse:false,pacer:{on:false,rate:70,ma:0,threshold:60}});a.rhythm='asys';
  let s=0,n=0;for(let t=0;t<8;t+=0.005){const d=e.ecg(t)-a.ecg(t);s+=d*d;n++;}return Math.sqrt(s/n);};
 assert.ok(sd('grossa')>2.5*sd('fina'));
 const e=new Engine();e.setParams({cpr:true});e.rhythm='asys';let m=0;for(let t=0;t<3;t+=0.005)m=Math.max(m,e.ecg(t));
 assert.ok(m<0.5,'CPR artifact smaller than a QRS so the underlying rhythm remains visible');
});
test('rhythm change label does not repeat the automatic pulse',()=>{
 assert.equal(shared.describeSet({rhythm:'vf',typicalHr:true,pulse:'auto'}),'Ritmo: Fibrilação ventricular');
 assert.equal(shared.describeSet({pulse:'off'}),'Pulso: ausente');
});


// ---------------------------------------------------------------------------
// Rastreamento de bugs (18/09/2026) — um teste por defeito corrigido.
// ---------------------------------------------------------------------------

test('BUG: bigeminy never schedules a beat in the past after pacing capture',()=>{
 const e=new Engine({seed:7});e.rhythm='bige';
 e.setParams({hr:72,pacer:{on:true,rate:70,ma:80,threshold:60}});
 for(let t=0;t<6;t+=0.05)e.schedule(t);
 e.setParams({pacer:{on:false,rate:70,ma:0,threshold:60}});
 let beats=0;
 for(let t=6;t<20;t+=0.05){e.schedule(t);beats+=e.popBeats(t).length;}
 assert.ok(beats<40,'Bigeminy produced a burst of '+beats+' beats in 14 s');
 assert.ok(beats>10,'Bigeminy stopped producing beats');
});

test('BUG: gaining or losing capture does not cancel the post-shock flat line',()=>{
 const e=new Engine({seed:3});e.rhythm='vt';
 e.setParams({hr:170,pacer:{on:false,rate:70,ma:0,threshold:60}});
 for(let t=0;t<3;t+=0.05)e.schedule(t);
 e.shock(3);
 e.setParams({pacer:{on:true,rate:70,ma:80,threshold:60}});
 e.setParams({pacer:{on:false,rate:70,ma:0,threshold:60}});
 e.schedule(3.5);
 // a partir de 3,35 s o artefato do próprio choque já acabou
 let peak=0;for(let t=3.35;t<3+POST_SHOCK_FLAT_S;t+=0.004)peak=Math.max(peak,Math.abs(e.ecg(t)));
 assert.ok(peak<0.12,'ECG drew '+peak.toFixed(3)+' mV during the post-shock flat line');
});

test('BUG: heart rate 0 leaves a flat line, not a frozen DC step',()=>{
 for(const r of ['nsr','vt','afib']){
  const e=new Engine({seed:11});e.rhythm=r;
  e.setParams({hr:0,pacer:{on:false,rate:70,ma:0,threshold:60},noise:false});
  for(let t=0;t<4;t+=0.05){e.schedule(t);e.popBeats(t);}
  let peak=0;for(let t=2;t<4;t+=0.004)peak=Math.max(peak,Math.abs(e.ecg(t)));
  assert.ok(peak<0.12,r+' froze the ECG at '+peak.toFixed(3)+' mV with HR 0');
  assert.equal(e.measuredHr(4),null);
 }
});

test('BUG: extreme bradycardia keeps showing a rate instead of "--"',()=>{
 const e=new Engine({seed:5});e.rhythm='sb';
 e.setParams({hr:5,pacer:{on:false,rate:70,ma:0,threshold:60}});
 let measured=null;
 for(let t=0;t<40;t+=0.05){e.schedule(t);e.popBeats(t);if(t>26)measured=e.measuredHr(t)??measured;}
 assert.ok(measured!==null,'HR 5 bpm never produced a measurement');
 assert.ok(Math.abs(measured-5)<=2,'HR 5 bpm measured as '+measured);
 // Assistolia continua sendo detectada rápido quando a FC programada é normal.
 const a=new Engine({seed:5});a.rhythm='nsr';a.setParams({hr:80,pacer:{on:false,rate:70,ma:0,threshold:60}});
 for(let t=0;t<6;t+=0.05){a.schedule(t);a.popBeats(t);}
 a.setRhythm('asys',6);for(let t=6;t<10;t+=0.05){a.schedule(t);a.popBeats(t);}
 assert.equal(a.measuredHr(10),null,'asystole must show "--" within a few seconds');
});

test('BUG: turning the pacer off stops the spikes already scheduled ahead',()=>{
 const e=new Engine({seed:9});e.rhythm='asys';
 e.setParams({hr:0,pacer:{on:true,rate:70,ma:80,threshold:60},noise:false});
 for(let t=0;t<4;t+=0.05){e.schedule(t);e.popBeats(t);}
 e.setParams({pacer:{on:false,rate:70,ma:0,threshold:60}});
 e.schedule(4);e.popBeats(4);
 let peak=0;for(let t=4;t<4.8;t+=0.002)peak=Math.max(peak,Math.abs(e.ecg(t)));
 assert.ok(peak<0.2,'pacer spikes kept firing after the pacer was switched off ('+peak.toFixed(2)+')');
});

test('BUG: a corrupt or outdated saved state cannot poison the monitor',()=>{
 const s=shared.restoreState({show:{ecg:false},vit:null,timer:{running:true,startedAt:0},rhythm:'inexistente',defib:{energy:9999,status:'ready'},nibp:{measuring:true},scn:{id:'nao-existe',step:9}});
 assert.equal(typeof s.show.temp,'boolean','missing show.temp made the controller reject every state');
 assert.equal(s.timer.acc,0);assert.equal(s.timer.running,false);
 assert.equal(s.vit.hr,78);assert.equal(s.rhythm,'nsr');
 assert.equal(s.defib.energy,150);assert.equal(s.defib.status,'idle');
 assert.equal(s.nibp.measuring,false);assert.deepEqual(s.scn,{id:null,step:0});
 assert.equal(validPublicState({...s,protocol:2,history:[],displayed:{},alarmsNow:[],hidden:false,captured:false,session:'x',lease:'y',timer:{...s.timer,elapsedMs:0}}),true);
});

test('BUG: the event history survives a monitor reload',()=>{
 let now=1000;const h=new EventHistory(()=>now);
 h.add('Primeiro evento');now+=5000;h.add('Segundo evento');
 const saved=h.snapshot();
 const h2=new EventHistory(()=>now);h2.restore(saved);
 assert.deepEqual(h2.snapshot().map(e=>e.text),['Primeiro evento','Segundo evento']);
 h2.add('Terceiro');assert.equal(h2.snapshot().at(-1).id,3,'ids must continue, not restart');
 const h3=new EventHistory(()=>now);h3.restore([{at:'x',text:'lixo'},{at:now+999999,text:'futuro'},null,{at:now,text:'ok'}]);
 assert.deepEqual(h3.snapshot().map(e=>e.text),['ok']);
});

test('BUG: EtCO2 shows "--" whenever there is no waveform',()=>{
 const {api,elements}=monitor();
 api.applySet({capno:'none'});api.evaluate();
 assert.equal(elements.get('nEtco2').textContent,'--','EtCO2 showed a number with capnography off');
 api.applySet({capno:'normal',vit:{rr:0}});api.evaluate();
 assert.equal(elements.get('nEtco2').textContent,'--','EtCO2 showed a number with no respiration');
 api.applySet({vit:{rr:16}});api.evaluate();
 assert.notEqual(elements.get('nEtco2').textContent,'--');
});

test('BUG: charging an already charged defibrillator is refused, and disarming is logged',()=>{
 const {api,timers}=monitor();
 assert.equal(api.action('charge'),undefined);
 [...timers.values()].find(t=>t.ms===3000).fn();
 assert.equal(api.getState().defib.status,'ready');
 const again=api.action('charge');assert.equal(again.done,false);assert.match(again.note,/já está carregado/);
 api.action('disarm');
 assert.ok(api.publicState().history.some(e=>/desarmado/i.test(e.text)),'disarm was never logged');
});

test('BUG: "Silenciar alarmes" can be undone',()=>{
 const {api}=monitor();
 api.action('silence');assert.ok(api.getState().alarms.silencedUntil>0);
 const r=api.action('silence');
 assert.equal(api.getState().alarms.silencedUntil,0,'silence could not be undone');
 assert.equal(r.note,'alarmes reativados');
});

test('BUG: elapsed time is never negative, even if the system clock steps back',()=>{
 const {api}=monitor();
 api.action('timer','start');
 const s=api.getState();s.timer.startedAt=Date.now()+600000; // relógio andou para trás
 assert.ok(api.publicState().timer.elapsedMs>=0,'negative elapsedMs makes the controller reject every state');
});

test('BUG: the controller does not stay stuck on "enviando…"',()=>{
 const {api}=controller();
 api.set({vit:{hr:90}});
 assert.match(api.getStatus(),/enviando/);
 api.onMsg({type:'bye',from:'m1',boot:''});
 assert.doesNotMatch(api.getStatus(),/enviando/,'status stayed on "enviando…" after the monitor left');
});

test('BUG: a closing monitor does not make the controller timer jump',()=>{
 const {api,advance}=controller();
 advance(90000); // página aberta há 90 s
 api.onMsg({type:'bye',from:'m1',boot:''});
 assert.equal(api.canSend(),false,'commands must be blocked while the monitor is restarting');
 assert.equal(api.timerText(),'00:00','the timer jumped by the page age');
});

// Auditoria Codex: mesmos cenários antes e depois da correção.
test('AUDIT: desligar SINC cancela espera sem choque no próximo QRS',()=>{
 for(const local of [false,true]) {
  const {api,elements,advance}=monitor();
  api.applySet({defib:{sync:true}});api.getState().defib.status='ready';api.action('shock');
  if(local)elements.get('bSync').click();else api.applySet({defib:{sync:false}});
  assert.equal(api.getState().defib.status,'ready');
  advance(20);api.engine().beats.push({t:100.01,pulse:true});api.frame();
  assert.equal(api.getState().defib.shocks,0);
 }
});
test('AUDIT: QRS anterior ao pedido e retomada após prazo não aplicam choque',()=>{
 for(const expired of [false,true]){
  const {api,advance}=monitor();api.applySet({defib:{sync:true}});
  api.getState().defib.status='ready';api.action('shock');
  advance(expired?6000:20);
  api.engine().beats.push({t:expired?105.9:99.99,pulse:true});api.frame();
  assert.equal(api.getState().defib.shocks,0);
  assert.equal(api.getState().defib.status,expired?'ready':'sync');
 }
});
test('AUDIT: choque SINC usa QRS recente posterior ao pedido uma única vez',()=>{
 const {api,advance}=monitor();api.applySet({defib:{sync:true}});
 api.getState().defib.status='ready';api.action('shock');advance(20);
 api.engine().beats.push({t:100.01,pulse:true});api.frame();
 assert.equal(api.getState().defib.shocks,1);assert.equal(api.getState().defib.sync,false);
 advance(20);api.frame();assert.equal(api.getState().defib.shocks,1);
});
test('AUDIT: nova tentativa não prolonga SINC; auto desarme vale durante espera',()=>{
 const {api,timers}=monitor();api.applySet({defib:{sync:true}});api.action('charge');
 [...timers.values()].find(t=>t.ms===3000).fn();api.action('shock');
 assert.equal(api.action('shock').done,false);
 [...timers.values()].find(t=>t.ms===45000).fn();assert.equal(api.getState().defib.status,'idle');
});
test('AUDIT: captura contínua respeita três segundos pós-choque em cada amostra',()=>{
 const e=new Engine({seed:1});e.setParams({noise:false,pacer:{on:true,rate:70,ma:80,threshold:60}});
 for(let t=0;t<2;t+=.01){e.schedule(t);e.popBeats(t);}
 e.shock(2);
 for(let t=2.3;t<5;t+=.0025){e.schedule(t);assert.equal(e.popBeats(t).length,0);assert.equal(e.ecg(t),0,`atividade em ${t}`);}
 let beats=0;for(let t=5;t<7;t+=.01){e.schedule(t);beats+=e.popBeats(t).length;}
 assert.ok(beats>0);
});
test('AUDIT: trocar etapa invalida ajuste em trânsito e aceita comando novo',()=>{
 const {api,sent}=monitor();loadAndPlay(api,'fv');const old=api.publicState();api.action('scn-next');
 const command={type:'cmd',cmd:'set',data:{vit:{hr:222}},seq:1,from:'ctrl',version:VERSION};
 api.transport.receive({...command,session:old.session,lease:old.lease});
 assert.equal(sent.at(-1).ok,false);assert.notEqual(api.getState().vit.hr,222);
 const current=api.publicState();api.transport.receive({...command,session:current.session,lease:current.lease,seq:2});
 assert.equal(sent.at(-1).ok,true);assert.equal(api.getState().vit.hr,222);
});

test('AUDIT: seta EtCO₂ após TVSP reativa curva e ventilação, sem criar pulso',()=>{
 const m=monitor(),c=controller();m.api.applySet({rhythm:'vt',pulse:'off',capno:'none',vit:{hr:180,rr:0,etco2:0}});
 c.api.onMsg({type:'state',from:'m1',state:m.api.publicState()});
 c.api.pending.etco2=2;c.api.schedulePending();c.api.flushPending();
 m.api.transport.receive({...c.sent.at(-1),from:"ctrl",version:VERSION});m.api.evaluate();
 assert.equal(m.elements.get('nEtco2').textContent,'2');assert.equal(m.api.getState().cur.rr,10);
 assert.equal(m.api.getState().rhythm,'vt');assert.equal(shared.hasPulse(m.api.getState()),false);
});
test('AUDIT: valores diretos EtCO₂ preservam ventilação existente, pulso e ritmo',()=>{
 const m=monitor(),c=controller();m.api.applySet({rhythm:'vt',pulse:'off',capno:'bronco',vit:{hr:180,rr:12}});
 c.api.onMsg({type:'state',from:'m1',state:m.api.publicState()});
 for(const value of [8,20,40,38,27]){c.api.setVitals({etco2:value});m.api.transport.receive({...c.sent.at(-1),from:"ctrl",version:VERSION});m.api.evaluate();assert.equal(m.elements.get('nEtco2').textContent,String(value));}
 assert.equal(m.api.getState().cur.rr,12);assert.equal(m.api.getState().capno,'bronco');assert.equal(shared.hasPulse(m.api.getState()),false);assert.equal(m.api.getState().rhythm,'vt');
});
test('AUDIT: EtCO₂ ausente é igual no estado remoto e no monitor',()=>{
 const {api,elements}=monitor();for(const set of [{capno:'none'},{capno:'normal',vit:{rr:0}}]){
  api.applySet(set);api.evaluate();assert.equal(api.publicState().displayed.etco2,null);assert.equal(elements.get('nEtco2').textContent,'--');
 }
});
test('AUDIT: falha de detecção local nunca muda a sala para online; demonstração não consulta rede',async()=>{
 const code=fs.readFileSync(new URL('../public/js/transport.js',import.meta.url),'utf8').replace(/^import .*$/gm,'').replaceAll('export ','');
 for(const hostname of ['localhost','127.0.0.1','192.168.1.10','10.0.0.1','172.20.10.2']){
  const result=await vm.runInNewContext(code+'; detectMode();',{URLSearchParams,AbortController,setTimeout,clearTimeout,location:{search:'',hostname},CONFIG:{supabaseUrl:'https://example.invalid',supabaseKey:'public'},fetch:async()=>{throw Error('offline')}});
  assert.equal(result.mode,'local');
 }
 const demo=await vm.runInNewContext(code+'; detectMode();',{URLSearchParams,location:{search:'?modo=demo'},fetch:()=>{throw Error('não deveria consultar rede')}});assert.equal(demo.mode,'demo');
});
test('AUDIT: detecção limita espera por API sem resposta',async()=>{
 const code=fs.readFileSync(new URL('../public/js/transport.js',import.meta.url),'utf8').replace(/^import .*$/gm,'').replaceAll('export ','');
 let expire,delay;
 const result=vm.runInNewContext(code+'; detectMode();',{URLSearchParams,AbortController,setTimeout:(fn,ms)=>{expire=fn;delay=ms;},clearTimeout(){},location:{search:'',hostname:'localhost'},CONFIG:{},fetch:(_,{signal})=>new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(Error('timeout'))))});
 expire();assert.equal((await result).mode,'local');assert.equal(delay,2000);
});

test('AUDIT: trocar ritmo ou ocultar monitor cancela SINC pendente',()=>{
 for(const reason of ['ritmo','oculto']){
  const {api,document,advance}=monitor();api.applySet({defib:{sync:true}});api.getState().defib.status='ready';api.action('shock');
  if(reason==='ritmo')api.applySet({rhythm:'asys'});else{document.visibilityState='hidden';document.listeners.visibilitychange();}
  assert.equal(api.getState().defib.status,'ready');advance(20);api.engine().beats.push({t:100.01,pulse:false});api.frame();assert.equal(api.getState().defib.shocks,0);
 }
});


test('CLASSROOM: pause preserves charging remainder and rejects paused therapy',()=>{
 const {api,advance,timers}=monitor();api.action('charge');advance(1000);api.action('pause-simulation');
 const before=api.publicState().timer.elapsedMs;advance(60000);api.frame();assert.equal(api.getState().defib.status,'charging');assert.equal(api.publicState().timer.elapsedMs,before);
 assert.equal(api.action('shock').done,false);assert.equal([...timers.values()].some(t=>t.ms===3000),false);
 api.action('pause-simulation');const remaining=[...timers.values()].find(t=>t.ms===2000);assert.ok(remaining);advance(2000);remaining.fn();assert.equal(api.getState().defib.status,'ready');
});
test('CLASSROOM: pause freezes transitions, engine time and scenario clock',()=>{
 const {api,advance}=monitor();loadAndPlay(api,'bradi');api.applySet({vit:{hr:100}},30);advance(10000);api.frame();const hr=api.getState().cur.hr,t=api.simClock.now();
 api.action('pause-simulation');advance(120000);api.frame();assert.equal(api.getState().cur.hr,hr);assert.equal(api.simClock.now(),t);assert.equal(api.publicState().timer.running,false);
 api.action('pause-simulation');advance(5000);api.frame();assert.ok(api.getState().cur.hr>hr);assert.equal(api.publicState().timer.elapsedMs,15000);
});
test('CLASSROOM: PNI measurement excludes paused time',()=>{
 const {api,advance,timers}=monitor();api.action('nibp');advance(2000);[...timers.values()].find(t=>t.ms===200).fn();api.action('pause-simulation');advance(60000);api.action('pause-simulation');
 [...timers.values()].find(t=>t.ms===200).fn();assert.equal(api.getState().nibp.measuring,true);
 advance(9000);[...timers.values()].find(t=>t.ms===200).fn();assert.equal(api.getState().nibp.measuring,false);assert.ok(api.getState().nibp.sys>0);
});
test('CLASSROOM: SYNC deadline remains five simulation seconds across pause',()=>{
 const {api,advance}=monitor();api.getState().defib.status='ready';api.applySet({defib:{sync:true}});api.action('shock');advance(2000);api.action('pause-simulation');advance(100000);api.frame();assert.equal(api.getState().defib.status,'sync');
 api.action('pause-simulation');advance(3001);api.frame();assert.equal(api.getState().defib.status,'ready');assert.equal(api.getState().defib.shocks,0);
});
test('CLASSROOM: manual mode does not advance after shock; switch cancels pending automatic effects',()=>{
 const {api,timers}=monitor();loadAndPlay(api,'fv');api.action('advance-mode','manual');api.deliverShock(100);[...timers.values()].find(t=>t.ms===1300).fn();assert.equal(api.getState().scn.step,0);
 api.action('advance-mode','auto');api.deliverShock(101);api.action('advance-mode','manual');assert.equal([...timers.values()].some(t=>t.ms===1300),false);assert.equal(api.getState().scn.step,0);
 api.action('scn-next');assert.equal(api.getState().scn.step,1);
});
test('CLASSROOM: assessment hides ECG diagnosis only from monitor banner',()=>{
 const {api,advance,elements}=monitor();api.applySet({rhythm:'vf'});advance(5000);api.evaluate();assert.match(elements.get('banner').textContent,/Verifique/);api.action('assessment',false);assert.match(elements.get('banner').textContent,/Fibrilação/);api.action('assessment',true);
 assert.match(elements.get('banner').textContent,/Verifique/);assert.ok(api.publicState().alarmsNow.some(a=>a.txt==='Fibrilação ventricular'));assert.equal(api.getState().rhythm,'vf');
});
test('CLASSROOM: unapproved, wrong-version and disconnected controls cannot mutate monitor',()=>{
 const {api,sent}=monitor();api.approved.clear();let state=api.publicState();const msg={type:'cmd',cmd:'action',name:'charge',from:'ctrl',version:VERSION,seq:1,session:state.session,lease:state.lease};
 api.transport.receive(msg);assert.equal(sent.at(-1).ok,false);assert.equal(api.getState().defib.status,'idle');
 api.approved.add('ctrl');api.transport.receive({...msg,version:'old'});assert.equal(sent.at(-1).ok,false);
 api.transport.receive({type:'peer-left',peer:'ctrl'});assert.equal(api.approved.has('ctrl'),false);api.transport.receive(msg);assert.equal(api.getState().defib.status,'idle');
});
test('CLASSROOM: manual annotations are distinguished from detected actions and retain case time',()=>{
 const {api,advance}=monitor();loadAndPlay(api,'bradi');advance(5000);api.action('pause-simulation');advance(60000);api.action('pause-simulation');
 const state=api.publicState();api.transport.receive({type:'cmd',cmd:'action',name:'annotation',arg:'Intubação informada',from:'ctrl',version:VERSION,seq:1,session:state.session,lease:state.lease});
 const e=api.publicState().history.at(-1);assert.equal(e.elapsedMs,5000);assert.equal(e.actor,'instrutor');assert.equal(e.origin,'informado');assert.equal(api.getState().vit.rr,22);
});
test('CLASSROOM: debrief pages are a stable snapshot, retain older than 100 events on restore',()=>{
 const h=new EventHistory(()=>10000,5000);for(let i=0;i<250;i++)h.add('evento '+i,'',{actor:'aluno',elapsedMs:i,origin:'detectado'});
 const restored=new EventHistory(()=>10000,5000);restored.restore(h.events);assert.equal(restored.events.length,250);assert.equal(restored.snapshot().length,100);assert.match(historyText(restored.events),/evento 0/);
 const {api}=monitor();for(let i=0;i<120;i++)api.action('annotation','relato '+i);const page0=api.action('debrief',0);assert.equal(page0.events.length,20);api.action('annotation','novo');assert.equal(api.action('debrief',5).events.length,20);
});

test('CLASSROOM: paused charging label reflects frozen state and reload shows numbers',()=>{const {api,elements}=monitor();api.evaluate();api.action('charge');api.action('pause-simulation');assert.equal(elements.get('chargeTxt').textContent,'Carregando…');const saved={...shared.defaultState(),classroom:{paused:true,timerWasRunning:true}};const reloaded=monitor(saved);assert.doesNotThrow(()=>reloaded.api.frame());assert.equal(reloaded.elements.get('nTemp').textContent,'36,6');});
test('CLASSROOM: restored scenario step is bounded by its current edition',()=>{assert.equal(shared.restoreState({scn:{id:'bradi',step:999}}).scn.step,2);});

test('FIX: hiding pauses charging, transitions and case time until explicit resume',()=>{
 const {api,advance,timers,document}=monitor();loadAndPlay(api,'bradi');api.action('charge');api.applySet({vit:{hr:100}},10);
 const oldCharge=[...timers.values()].find(t=>t.ms===3000);advance(1000);api.frame();const hr=api.getState().cur.hr,t=api.simClock.now();
 document.visibilityState='hidden';document.listeners.visibilitychange();document.listeners.visibilitychange();advance(60000);oldCharge.fn();api.frame();
 assert.equal(api.simClock.paused,true);assert.equal(api.getState().defib.status,'charging');assert.equal(api.simClock.now(),t);assert.equal(api.getState().cur.hr,hr);
 document.visibilityState='visible';document.listeners.visibilitychange();assert.equal(api.simClock.paused,true);
 api.action('pause-simulation');const remaining=[...timers.values()].find(t=>t.ms===2000);assert.ok(remaining);advance(2000);remaining.fn();assert.equal(api.getState().defib.status,'ready');
});
test('FIX: hiding an already paused monitor never resumes it',()=>{const {api,document}=monitor();api.action('pause-simulation');document.visibilityState='hidden';document.listeners.visibilitychange();api.action('pause-simulation');assert.equal(api.simClock.paused,true);document.visibilityState='visible';document.listeners.visibilitychange();assert.equal(api.simClock.paused,true);});
test('FIX: reset starts a separate free execution and preserves old event context',()=>{
 const {api,advance}=monitor();loadAndPlay(api,'bradi');api.action('annotation','Antes');const old=api.publicState().history.at(-1);advance(15000);api.action('reset');api.action('annotation','Depois');
 const events=api.publicState().history,last=events.at(-1);assert.equal(last.caseName,'Livre');assert.equal(last.elapsedMs,0);assert.notEqual(last.caseRun,old.caseRun);assert.equal(events.find(e=>e.text===old.text).caseRun,old.caseRun);
 api.action('reset');assert.notEqual(api.publicState().history.at(-1).caseRun,last.caseRun);
});
test('FIX: connection messages distinguish missing state, authorization, versions and pause',()=>{
 const {api,elements,advance}=controller();api.patchState(null);assert.match(api.unavailableReason(),/Aguardando o monitor/);api.offline();assert.match(api.unavailableReason(),/Sem conexão/);api.online();api.setState();api.patchState({version:'old'});assert.match(api.unavailableReason(),/Versões diferentes/);
 api.setState();api.patchState({authorized:[]});api.updateWarning();assert.match(elements.get('waiting').textContent,/Aguardando autorização/);assert.equal(elements.get('waiting').hidden,false);
 api.setState();api.updateWarning();assert.match(elements.get('connectionStatus').textContent,/Pronto para controlar/);api.patchState({paused:true});api.updateWarning();assert.match(elements.get('connectionStatus').textContent,/Simulação pausada/);assert.equal(api.canSend(),true);
 advance(STATE_MAX_AGE_MS);assert.match(api.unavailableReason(),/sem resposta recente/);assert.equal(api.canSend(),false);
});

test('FIX: paused state immediately refreshes the controller timer',()=>{
 const {api,elements}=controller();api.onMsg({type:'state',from:'m1',state:{...shared.defaultState(),protocol:2,history:[],displayed:{},alarmsNow:[],hidden:false,captured:false,cur:{...shared.defaultState().vit},session:'one',lease:'one',paused:true,timer:{running:false,elapsedMs:3999}}});assert.equal(elements.get('timer').textContent,'00:03');
});

test('Toolbar disables unavailable steps and keeps resume available while paused',()=>{
 const {api,elements,sent}=controller();api.updateWarning();assert.equal(elements.get('bCaseNext').disabled,true);assert.equal(elements.get('bPauseAll').disabled,false);
 api.patchState({scn:{id:'fv',step:0}});api.updateWarning();assert.equal(elements.get('bCasePrev').disabled,true);assert.equal(elements.get('bCaseNext').disabled,false);
 elements.get('bCaseNext').click();assert.equal(sent.at(-1).name,'scn-next');
 api.patchState({paused:true});api.updateWarning();assert.equal(elements.get('bCaseNext').disabled,true);assert.equal(elements.get('bPauseAll')['aria-label'],'Retomar simulação');assert.equal(elements.get('bPauseAll').disabled,false);
 api.patchState({paused:false,scn:{id:'fv',step:shared.SCENARIO_BY_ID.fv.etapas.length-1}});api.updateWarning();assert.equal(elements.get('bCaseNext').disabled,true);assert.equal(elements.get('bCasePrev').disabled,false);
 api.offline();api.updateWarning();assert.equal(elements.get('bPauseAll').disabled,true);assert.equal(elements.get('bCasePrev').disabled,true);
});

test('Monitor scenario buttons navigate, pause and resume with student controls hidden',()=>{
 const {api,elements,advance}=monitor();assert.equal(elements.get('bMonitorNext').disabled,true);
 loadAndPlay(api,'fv');api.applySet({studentPanel:false});api.evaluate();
 assert.equal(elements.get('bMonitorPrev').disabled,true);assert.equal(elements.get('bMonitorNext').disabled,false);
 elements.get('bMonitorNext').click();assert.equal(api.getState().scn.step,1);
 elements.get('bMonitorPrev').click();assert.equal(api.getState().scn.step,0);
 elements.get('bMonitorPause').click();const time=api.simClock.now();advance(5000);assert.equal(api.simClock.now(),time);
 assert.equal(elements.get('bMonitorNext').disabled,true);assert.equal(elements.get('bMonitorPause')['aria-label'],'Retomar simulação');
 elements.get('bMonitorPause').click();assert.equal(api.simClock.paused,false);assert.equal(elements.get('bMonitorNext').disabled,false);
 assert.equal(api.publicState().history.at(-1).actor,'instrutor');
 api.action('scn-go',shared.SCENARIO_BY_ID.fv.etapas.length-1);api.evaluate();assert.equal(elements.get('bMonitorNext').disabled,true);
});

test('Timed advance starts off, uses stage duration and pauses with the simulation',()=>{
 const {api,timers,advance}=monitor();loadAndPlay(api,'fv');assert.equal(api.publicState().timedAdvance,false);
 assert.equal([...timers.values()].some(t=>t.ms===120000),false);
 api.action('stage-wait',15);api.action('timed-advance',true);advance(5000);api.action('pause-simulation');
 const remaining=api.publicState().stageRemaining;advance(60000);assert.equal(api.publicState().stageRemaining,remaining);
 api.action('pause-simulation');const task=[...timers.values()].find(t=>t.ms===10000);assert.ok(task);advance(10000);task.fn();assert.equal(api.getState().scn.step,1);assert.equal(api.publicState().stageWait,120);
});
test('Timed advance cancels old callbacks when disabled, stepping manually or changing case',()=>{
 const {api,timers}=monitor();loadAndPlay(api,'fv');api.action('timed-advance',true);
 const callback=[...timers.values()].find(t=>t.ms===120000).fn;
 api.action('timed-advance',false);callback();assert.equal(api.getState().scn.step,0);
 api.action('timed-advance',true);const older=[...timers.values()].find(t=>t.ms===120000).fn;
 api.action('scn-next');older();assert.equal(api.getState().scn.step,1);
 loadAndPlay(api,'asma');older();assert.equal(api.getState().scn.id,'asma');assert.equal(api.publicState().timedAdvance,false);
});
test('Timed last stage, zero wait, stopped case and reload never auto advance',()=>{
 const {api,timers}=monitor();loadAndPlay(api,'fv');api.action('stage-wait',0);api.action('timed-advance',true);assert.equal(api.publicState().stageRemaining,0);
 api.action('scn-go',3);assert.equal(api.publicState().stageRemaining,0);
 api.action('scn-stop');assert.equal(api.publicState().timedAdvance,false);
 const saved={...shared.defaultState(),classroom:{timedAdvance:true}};assert.equal(monitor(saved).api.publicState().timedAdvance,false);
});
test('Each stage restores prescribed capnography after manual edits and backwards navigation',()=>{
 const {api}=monitor();loadAndPlay(api,'asma');api.applySet({capno:'none',show:{capno:false},vit:{rr:0,etco2:0}});api.action('scn-next');assert.equal(api.getState().capno,'bronco');assert.equal(api.getState().vit.rr,10);assert.equal(api.getState().vit.etco2,66);assert.equal(api.getState().show.capno,true);
 loadAndPlay(api,'fv');api.action('scn-go',3);api.action('scn-go',0);assert.equal(api.getState().capno,'none');assert.equal(api.getState().show.capno,true);assert.equal(api.getState().vit.rr,0);assert.equal(api.getState().vit.etco2,0);
 api.action('scn-next');assert.equal(api.getState().capno,'rcp');assert.equal(api.getState().vit.rr,10);
 loadAndPlay(api,'bradi');api.applySet({capno:'bronco'});api.action('scn-next');assert.equal(api.getState().capno,'normal');
});
test('Exam presentation works while paused without admitting unknown exam IDs',()=>{
 const {api,elements}=monitor();api.action('pause-simulation');api.action('exam','xray-0');assert.equal(api.getState().exam,'xray-0');assert.equal(elements.get('examOverlay').hidden,false);
 assert.equal(api.action('exam','__proto__').done,false);assert.equal(api.getState().exam,'xray-0');api.action('exam',null);assert.equal(elements.get('examOverlay').hidden,true);assert.equal(api.simClock.paused,true);
});


test('UI: case load waits for play, pause preserves elapsed time and stage navigation does not reset it',()=>{
 const {api,advance,elements}=monitor();api.action('scn-load','fv');
 assert.equal(api.publicState().paused,true);assert.equal(api.publicState().timer.elapsedMs,0);
 assert.equal(elements.get('timer').textContent,'00:00');advance(90000);
 assert.equal(api.publicState().timer.elapsedMs,0);
 api.action('stage-wait',15);api.action('timed-advance',true);
 assert.equal(api.publicState().timedAdvance,true);assert.equal(api.publicState().stageRemaining,15);
 api.action('pause-simulation');advance(5000);api.action('scn-next');
 assert.equal(api.publicState().timer.elapsedMs,5000);
 api.action('pause-simulation');advance(60000);assert.equal(api.publicState().timer.elapsedMs,5000);
 api.action('timer','reset');assert.equal(api.publicState().timer.elapsedMs,0);assert.equal(api.simClock.paused,true);
 api.action('scn-load','asma');assert.equal(api.simClock.paused,true);assert.equal(api.publicState().timedAdvance,false);
 api.action('pause-simulation');advance(2000);assert.equal(api.publicState().timer.elapsedMs,2000);
});

test('UI: oximeter quality changes reading and pleth without changing prescribed saturation',()=>{
 const {api,advance}=monitor();advance(5000);api.frame();
 api.engine().pleth=()=>.8;api.applySet({vit:{spo2:96},spo2Signal:'low'});api.evaluate();
 assert.equal(api.publicState().displayed.spo2,null);assert.equal(api.pleth(0),.12);assert.equal(api.getState().vit.spo2,96);
 assert.ok(api.getAlarms().some(a=>a.txt.includes('baixa perfusão')));
 api.applySet({spo2Signal:'absent'});api.evaluate();assert.equal(api.pleth(0),0);assert.equal(api.publicState().displayed.spo2,null);
 assert.ok(api.getAlarms().some(a=>a.txt.includes('sensor desconectado')));
 api.applySet({spo2Signal:'normal'});api.evaluate();assert.equal(api.pleth(0),.8);assert.equal(api.publicState().displayed.spo2,96);
});

test('UI: severe low perfusion is limited to two stages and reversing stages restores it',()=>{
 const low=shared.SCENARIOS.flatMap(sc=>sc.etapas.map((_,i)=>shared.scenarioStepSet(sc,i))).filter(s=>s.spo2Signal==='low');
 assert.equal(low.length,2);
 const {api}=monitor();loadAndPlay(api,'aesp');api.action('scn-next');assert.equal(api.getState().spo2Signal,'low');
 api.action('scn-go',3);assert.equal(api.getState().spo2Signal,'normal');api.action('scn-go',1);assert.equal(api.getState().spo2Signal,'low');
 api.applySet({spo2Signal:'absent'});api.action('scn-go',0);assert.equal(api.getState().spo2Signal,'normal');
});

test('UI: invalid signal modes and mute state cannot enter restored or public state',()=>{
 assert.equal(shared.sanitizeSet({spo2Signal:'invalid'}).spo2Signal,undefined);
 assert.equal(shared.sanitizeSet({spo2Signal:'low'}).spo2Signal,'low');
 const restored=shared.restoreState({...shared.defaultState(),spo2Signal:'invalid',audioMuted:'yes'});
 assert.equal(restored.spo2Signal,'normal');assert.equal(restored.audioMuted,false);
 const {api}=monitor(),s=api.publicState();assert.equal(validPublicState({...s,spo2Signal:'bogus'}),false);assert.equal(validPublicState({...s,audioMuted:1}),false);
});

test('UI: global mute gates existing and future audio from all three generators and preserves preferences',()=>{
 const {api}=monitor(),nodes=[];
 const ac={currentTime:1,sampleRate:100,destination:{},resume(){},suspend(){},
  createBuffer:()=>({getChannelData:()=>new Float32Array(35)})};
 const node=()=>{const n={context:ac,gain:{setValueAtTime(v){this.value=v;},linearRampToValueAtTime(){}},frequency:{setValueAtTime(){},exponentialRampToValueAtTime(){}},connect(dest){this.dest=dest;return dest;},start(){},stop(){}};nodes.push(n);return n;};
 ac.createGain=node;ac.createOscillator=node;ac.createBufferSource=node;api.setAudio(ac);
 api.tone(700);api.chargeSound();api.shockSound();
 const master=nodes.find(n=>n.dest===ac.destination);assert.ok(master);assert.equal(nodes.filter(n=>n.dest===master).length,3);
 api.getState().alarms.beep=false;const prefs=JSON.stringify(api.getState().alarms);
 api.action('audio-mute',true);assert.equal(master.gain.value,0);const count=nodes.length;
 api.tone(700);api.chargeSound();api.shockSound();assert.equal(nodes.length,count);
 api.action('scn-load','bradi');assert.equal(api.getState().audioMuted,true);assert.equal(api.simClock.paused,true);
 api.action('audio-mute',false);assert.equal(master.gain.value,1);assert.equal(JSON.stringify(api.getState().alarms),prefs);
 assert.equal(api.action('audio-mute','yes').done,false);
});

test('UI: changing stage closes the previous exam',()=>{
 const {api}=monitor();loadAndPlay(api,'tsv');api.action('exam','ecg-6');assert.equal(api.getState().exam,'ecg-6');api.action('scn-next');assert.equal(api.getState().exam,null);
});


test('UI: every built-in case has an explicit exam decision for every stage; invalid associations are absent',()=>{
 for(const sc of shared.SCENARIOS){assert.equal(CASE_EXAMS[sc.id].length,sc.etapas.length);
  for(const [i,row] of CASE_EXAMS[sc.id].entries()){
   for(const [kind,id] of Object.entries(row))if(id)assert.equal(EXAM_BY_ID[id]?.kind,kind);
   const state={...shared.scenarioStepSet(sc,i),scn:{id:sc.id,step:i}};
   assert.equal(examsForState(state).length,Object.values(row).filter(Boolean).length);
   if(['vf','asys'].includes(state.rhythm)||state.pulse==='off')assert.equal(examsForState(state,'ecg').length,0);
  }
 }
 assert.equal(examsForState({scn:{id:'custom-unreviewed',step:0}}).length,0);
 assert.equal(examsForState({...shared.defaultState(),rhythm:'vf',scn:{id:'tsv',step:0}},'ecg').length,0);
 assert.equal(examsForState(shared.defaultState()).length,57);
});


test('DEFAULTS: rhythm names are hidden in new and legacy sessions; explicit new preference survives reload',()=>{
 assert.equal(monitor().api.publicState().assessment,true);
 assert.equal(monitor({...shared.defaultState(),classroom:{assessment:false}}).api.publicState().assessment,true);
 assert.equal(monitor({...shared.defaultState(),classroom:{assessmentPreference:false}}).api.publicState().assessment,false);
});


// ---------------- Modo online autorizado (entrega 2.3.3) ----------------
// Os dois bloqueios da revisão anterior recusavam qualquer comando online.
// Agora a identidade é conferida por assinatura no transporte; estas provas
// usam os mesmos ambientes de monitor e controle dos testes acima.

test('ONLINE: o controle não é mais obrigado a usar o servidor local',()=>{
 const {api}=controller();
 api.setTransportMode('online');
 assert.doesNotMatch(api.unavailableReason(),/servidor local/);
 assert.equal(api.canSend(),true);
 assert.equal(api.set({vit:{hr:90}}),true);
});

test('ONLINE: o monitor aplica comando de controle autorizado em vez de recusar por modo',()=>{
 const {api,sent}=monitor();
 api.transport.mode='online';api.transport.info=null;
 const {session,lease}=api.publicState();
 api.transport.receive({type:'cmd',cmd:'action',name:'charge',from:'ctrl',version:VERSION,seq:1,session,lease});
 assert.equal(api.getState().defib.status,'charging');
 assert.equal(sent.at(-1).ok,true);
});

test('ONLINE: no modo online o monitor continua recusando controle não autorizado',()=>{
 const {api,sent}=monitor();
 api.transport.mode='online';api.approved.clear();
 const {session,lease}=api.publicState();
 api.transport.receive({type:'cmd',cmd:'action',name:'charge',from:'ctrl',version:VERSION,seq:1,session,lease});
 assert.equal(api.getState().defib.status,'idle');
 assert.equal(sent.at(-1).ok,false);
 assert.match(sent.at(-1).reason,/não autorizado/);
});

// --- transporte online: assinatura na saída, conferência na entrada ---
function transporteOnline({verificar,assinar,pronto=true,situacao='autorizado'}={}){
 const enviados=[],recusas=[],entregues=[],sockets=[];
 let proximo=0;const timers=new Map();
 class FakeSocket{
  constructor(url){this.url=url;this.readyState=1;sockets.push(this);this.enviados=[];}
  send(txt){this.enviados.push(JSON.parse(txt));}
  close(){this.readyState=3;this.onclose?.();}
 }
 const seguranca={
  salaId:'sala-1',topico:'sala-abc',pronto,situacao,
  assinar:assinar||(async m=>({...m,auth:{sala:'sala-1',disp:m.from,papel:'controle',ts:1,nonce:'n',alg:'ES256',sig:'ok'}})),
  verificar:verificar||(async m=>({ok:true,msg:m})),
  tokenAtual:async()=>'token-1',
  atualizarParticipantes:async()=>{},
  conectar:async()=>{},
 };
 const code=fs.readFileSync(new URL('../public/js/transport.js',import.meta.url),'utf8').replace(/^import .*$/gm,'').replaceAll('export ','');
 const sandbox={URLSearchParams,AbortController,console,Promise,JSON,Math,Date,
  CONFIG:{supabaseUrl:'https://exemplo.invalid',supabaseKey:'pub'},
  WebSocket:Object.assign(FakeSocket,{OPEN:1}),
  location:{search:'?modo=online',hostname:'exemplo.com',pathname:'/controle.html',protocol:'https:',host:'exemplo.com'},
  setTimeout:(fn,ms)=>{const id=++proximo;timers.set(id,{fn,ms});return id;},clearTimeout:id=>timers.delete(id),
  setInterval:(fn,ms)=>{const id=++proximo;timers.set(id,{fn,ms});return id;},clearInterval:id=>timers.delete(id),
 };
 vm.runInNewContext(code+`
  globalThis.feito=new Transport('4321',m=>entregues.push(m),()=>{},'c1',{
   criarSeguranca:async()=>seguranca,aoRecusar:(motivo)=>recusas.push(motivo)});
 `,Object.assign(sandbox,{entregues,recusas,seguranca,enviados}));
 return {t:sandbox.feito,sockets,entregues,recusas,seguranca,timers};
}

// Abre o canal e responde à entrada como o Supabase responderia.
async function conectarCanal(t,sockets,status='ok'){
 t.mode='online';await t.startOnline();
 const ws=sockets.at(-1);ws.onopen();
 const join=ws.enviados.find(m=>m.event==='phx_join');
 ws.onmessage({data:JSON.stringify({event:'phx_reply',ref:join.ref,payload:{status}})});
 return {ws,join};
}

test('ONLINE: o canal é privado e entra com o token do usuário',async()=>{
 const {t,sockets}=transporteOnline();
 const {ws,join}=await conectarCanal(t,sockets);
 assert.ok(join,'precisa entrar no canal');
 assert.equal(join.payload.config.private,true,'canal público não isolaria as salas');
 assert.equal(join.payload.access_token,'token-1');
 assert.equal(ws.url.includes('/realtime/v1/websocket'),true);
 assert.equal(t.topic,'realtime:sala-abc','o tópico vem da sala criada, não do código de quatro dígitos');
 assert.equal(t.connected,true);
});

test('ONLINE: canal recusado pela política não conecta e explica o motivo',async()=>{
 const {t,sockets}=transporteOnline();
 await conectarCanal(t,sockets,'error');
 assert.equal(t.connected,false);
 assert.match(t.motivo,/recusou este aparelho/);
});

test('ONLINE: um controle pendente não entra no canal',async()=>{
 const {t,sockets}=transporteOnline({pronto:false,situacao:'pendente'});
 t.mode='online';await t.startOnline();
 assert.equal(sockets.length,0,'nenhuma conexão enquanto o monitor não autoriza');
 assert.match(t.motivo,/aguardando autorização/);
 assert.equal(t.connected,false);
});

test('ONLINE: um controle revogado é informado e não entra no canal',async()=>{
 const {t,sockets}=transporteOnline({pronto:false,situacao:'revogado'});
 t.mode='online';await t.startOnline();
 assert.equal(sockets.length,0);
 assert.match(t.motivo,/revogado/);
});

test('ONLINE: mensagem que não passa na conferência não chega à aplicação',async()=>{
 const {t,entregues,recusas}=transporteOnline({verificar:async m=>m.from==='m1'?{ok:true,msg:m}:{ok:false,motivo:'assinatura inválida'}});
 t.mode='online';await t.startOnline();
 t.receberAssinada({type:'state',from:'m1',state:{}});
 t.receberAssinada({type:'state',from:'impostor',state:{}});
 t.receberAssinada({type:'cmd',from:'c1'}); // eco do próprio aparelho
 await t.fila;
 assert.deepEqual(entregues.map(m=>m.from),['m1']);
 assert.deepEqual(recusas,['assinatura inválida']);
});

test('ONLINE: comando assinado depois da queda da conexão não é enviado ao voltar',async()=>{
 let liberar;const espera=new Promise(r=>{liberar=r;});
 const {t,sockets}=transporteOnline({assinar:async m=>{await espera;return {...m,auth:{sig:'ok'}};}});
 const {ws}=await conectarCanal(t,sockets);
 const antes=ws.enviados.length;
 assert.equal(t.send({type:'cmd',cmd:'action',name:'shock',seq:1}),true);
 ws.readyState=3;                 // a rede caiu enquanto a mensagem era assinada
 liberar();await new Promise(r=>setTimeout(r,0));await new Promise(r=>setTimeout(r,0));
 assert.equal(ws.enviados.length,antes,'nada pode ser aplicado ao voltar');
});

test('ONLINE: comando enviado com o canal aberto é assinado antes de sair',async()=>{
 const {t,sockets}=transporteOnline();
 const {ws}=await conectarCanal(t,sockets);
 const antes=ws.enviados.length;
 assert.equal(t.send({type:'cmd',cmd:'action',name:'charge',seq:1}),true);
 await new Promise(r=>setTimeout(r,0));await new Promise(r=>setTimeout(r,0));
 const saida=ws.enviados.slice(antes).find(m=>m.event==='broadcast');
 assert.ok(saida,'o comando precisa sair pelo canal');
 assert.equal(saida.payload.payload.auth.sig,'ok','nada sai do canal sem assinatura');
 assert.equal(saida.payload.payload.from,'c1');
 assert.equal(saida.payload.payload.role,'controller');
});

test('ONLINE: a caixa de autorização só é redesenhada quando a lista muda',()=>{
 const {api,document}=monitor();
 const caixa=document.getElementById('pairRequests');
 let redesenhos=0;const original=caixa.replaceChildren.bind(caixa);
 caixa.replaceChildren=(...n)=>{redesenhos++;return original(...n);};

 api.pairRequests.set('c'+'a'.repeat(32),{version:VERSION,participanteId:'p1'});
 api.renderPairRequests();assert.equal(redesenhos,1,'lista nova precisa desenhar');
 api.renderPairRequests();api.renderPairRequests();
 assert.equal(redesenhos,1,'sem mudança, o botão não pode sumir embaixo do dedo');

 api.pairRequests.set('c'+'b'.repeat(32),{version:VERSION,participanteId:'p2'});
 api.renderPairRequests();assert.equal(redesenhos,2,'controle novo precisa aparecer');

 api.pairRequests.clear();
 api.renderPairRequests();assert.equal(redesenhos,3,'fila vazia precisa limpar a caixa');
});

test('EMPACOTAMENTO: todo JSON do projeto é válido e sem BOM',()=>{
 // Um BOM em package.json quebra a build da Vercel: o passo de instalação lê o
 // arquivo e falha antes de chegar ao build. Já aconteceu uma vez, por gravar
 // com PowerShell. Barato conferir aqui.
 const raiz=new URL('../',import.meta.url);
 const alvos=['package.json','vercel.json','ENTREGA_SHA256.json','ENTREGA_2.3.3_SHA256.json','ferramentas/ecg-leitura-inicial.json'];
 for(const nome of alvos){
  const caminho=new URL(nome,raiz);
  if(!fs.existsSync(caminho))continue;
  const bytes=fs.readFileSync(caminho);
  assert.ok(!(bytes[0]===0xEF&&bytes[1]===0xBB&&bytes[2]===0xBF),nome+' começa com BOM');
  assert.doesNotThrow(()=>JSON.parse(bytes.toString('utf8')),nome+' não é JSON válido');
 }
 // E o que a Vercel precisa encontrar para construir.
 const pkg=JSON.parse(fs.readFileSync(new URL('package.json',raiz),'utf8'));
 assert.equal(typeof pkg.scripts['build:web'],'string','a Vercel chama npm run build:web');
 const vercel=JSON.parse(fs.readFileSync(new URL('vercel.json',raiz),'utf8'));
 assert.equal(vercel.buildCommand,'npm run build:web');
 assert.equal(vercel.outputDirectory,'web/dist');
 assert.equal(vercel.cleanUrls,false,'cleanUrls true quebraria /monitor.html e /controle.html');
});

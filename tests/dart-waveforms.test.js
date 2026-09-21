import test from 'node:test';
import assert from 'node:assert/strict';
import { Engine } from '../public/js/engine.js';
import { DartPlayer, DART, sampleReference } from '../public/js/dart-player.js';
import { RHYTHM_BY_ID } from '../public/js/shared.js';

function simulate(id,seconds=30,step=1/400,options={}) {
  const e=new Engine({seed:23});e.rhythm=id;e.setParams({hr:DART[id].nominalHr,pulse:RHYTHM_BY_ID[id].pulse,noise:false,...options});
  const values=[],beats=[];
  for(let i=0;i<seconds/step;i++){const t=i*step;e.schedule(t);values.push(e.ecg(t));beats.push(...e.popBeats(t));}
  return {e,values,beats};
}

for(const [id,p] of Object.entries(DART)) test(`${id}: sinal digitalizado finito, eventos ordenados e buffers limitados`,()=>{
  const {e,values,beats}=simulate(id);
  assert.ok(values.every(Number.isFinite));assert.ok(Math.max(...values)<2);assert.ok(Math.min(...values)>-1.6);
  assert.ok(beats.every((b,i)=>!i||b.t>beats[i-1].t));
  if(['vf','asys'].includes(id))assert.equal(beats.length,0);else assert.ok(beats.length>1);
  assert.ok(e.ecgW.length<150);assert.ok(e.beats.length<20);
  if(!p.special) {
    const expected=p.nominalHr*30/60;
    assert.ok(Math.abs(beats.length-expected)<=2,`${id}: ${beats.length} vs ${expected}`);
  }
});

test('o motor usa os contornos digitalizados, sem substituir por aproximações gaussianas',()=>{
  for(const [id,p]of Object.entries(DART))if(!p.special){
    const e=new Engine({seed:1});e.rhythm=id;e.setParams({hr:p.nominalHr,noise:false});
    const n=p.values.length-1;
    for(let x=0;x<n-6;x++){
      const t=x/n*p.duration;e.schedule(t);
      assert.ok(Math.abs(e.ecg(t)-p.values[x])<1e-7,`${id}: pixel ${x}`);e.popBeats(t);
    }
  }
});

test('a emenda é contínua, altera só os seis pixels finais e não cria pico extra',()=>{
  for(const p of Object.values(DART)){
    const L=p.values.length-1;
    assert.ok(Math.abs(sampleReference(p,L-1e-7)-sampleReference(p,0))<1e-6);
    for(let x=0;x<L-6;x+=13)assert.equal(sampleReference(p,x),p.values[x]);
    for(let x=L-6;x<L;x+=.2)assert.ok(Number.isFinite(sampleReference(p,x)));
  }
});

test('mudar FC mantém a fase e histórico de desenho; não salta para início do print',()=>{
  const p=new DartPlayer('nsr',0,70);p.advance(1,70);const before=p.sample(1),past=p.sample(.8);
  p.advance(1,140);assert.equal(p.sample(1),before);assert.equal(p.sample(.8),past);
  const position=p.position;p.advance(1.5,140);
  assert.ok(Math.abs(p.position-position-p.pixelsPerSecond(140)*.5)<1e-10);
});

test('agendamento independe da taxa de desenho e não duplica eventos na fronteira do loop',()=>{
  for(const id of ['nsr','afib','bav2m1','tdp']){
    const a=simulate(id,20,1/400),b=simulate(id,20,1/800);
    assert.equal(a.beats.length,b.beats.length);
    assert.ok(a.beats.every((v,i)=>Math.abs(v.t-b.beats[i].t)<1e-8));
  }
});

test('BAVT mantém P independente e bigeminismo alterna complexo normal/ventricular',()=>{
  const bav=simulate('bav3',10).e;
  // Componentes atriais usam o template separado; o BAVT não usa replay de uma tira AV fixa.
  assert.equal(bav.dart,null);assert.ok(bav.ecgW.length>0);
  const b=new Engine({seed:1});b.rhythm='bige';b.setParams({hr:72,noise:false});b.schedule(0);
  const ventricular=b.ecgW.filter(w=>w.tpl.fiducial===.02&&w.tpl.points.length>100);
  assert.equal(ventricular.length,2);assert.notDeepEqual(ventricular[0].tpl.points,ventricular[1].tpl.points);
});

test('troca, choque e liberação de captura não deixam eventos futuros da referência antiga',()=>{
  const e=new Engine({seed:1});e.schedule(0);e.schedule(.5);e.popBeats(.5);
  e.setRhythm('asys',.5);e.schedule(.8);assert.equal(e.ecg(.8),0);
  e.setRhythm('nsr',1);e.schedule(1.3);e.shock(1.4);e.schedule(1.5);
  assert.equal(e.dart.sample(2),0);assert.ok(e.beats.every(b=>b.t<1.4));
  e.setParams({pacer:{on:true,rate:70,ma:80,threshold:60}});e.schedule(4);assert.equal(e.dart,null);
  e.setParams({pacer:{on:false,rate:70,ma:80,threshold:60}});e.schedule(4.1);assert.ok(e.dart);
});

test('FV fina reduz amplitude sem mudar o contorno; assistolia não contém ruído adicionado',()=>{
  const a=simulate('vf',5),b=simulate('vf',5,1/400,{vfAmp:'fina'});
  assert.ok(a.values.every((v,i)=>Math.abs(v*.3-b.values[i])<1e-12));
  assert.ok(simulate('asys',5).values.every(v=>v===0));
});

test('suspensão longa não gera rajada de eventos antigos; fase continua coerente',()=>{
  const p=new DartPlayer('nsr',0,70);const events=p.advance(100,70);
  assert.ok(events.length<=2);assert.ok(events.every(t=>t>=98.8));assert.ok(Number.isFinite(p.sample(100)));
});

test('RCP modifica o ECG e captura sem pulso não cria pletismografia',()=>{
  const a=simulate('nsr',5),b=simulate('nsr',5,1/400,{cpr:true});assert.notDeepEqual(a.values,b.values);
  const {e,beats}=simulate('asys',8,1/400,{pacer:{on:true,rate:70,ma:80,threshold:60},pulse:false});
  assert.ok(beats.length>5);assert.ok(beats.every(b=>!b.pulse));assert.equal(e.plethC.length,0);
});

test('digitalização de quedas quase verticais em torsades não inventa espículas de ida e volta',()=>{
  for(const [start,end] of [[622,630],[686,696]]) {
    const values=DART.tdp.fullValues.slice(start,end);
    assert.ok(values.every((v,i)=>!i||v<=values[i-1]));
  }
  // A descida arredondada de uma onda não pode ser comprimida em um degrau.
  const slope=DART.tdp.fullValues.slice(180,202);
  assert.ok(slope.every((v,i)=>!i||Math.abs(v-slope[i-1])<.2));
});

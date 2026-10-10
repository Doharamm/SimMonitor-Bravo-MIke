import test from 'node:test';
import assert from 'node:assert/strict';
import { Engine, SINTETIZADOS } from '../public/js/engine.js';
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
  // Os sintetizados têm tira no arquivo, mas não a tocam: a FA sorteia o RR e
  // o flutter conduz em razão fixa, então nenhum dos dois bate a FC nominal da
  // tira. As demais verificações acima continuam valendo para eles.
  if(!p.special && !SINTETIZADOS.has(id)) {
    const expected=p.nominalHr*30/60;
    assert.ok(Math.abs(beats.length-expected)<=2,`${id}: ${beats.length} vs ${expected}`);
  }
});

test('o motor usa os contornos digitalizados, sem substituir por aproximações gaussianas',()=>{
  for(const [id,p]of Object.entries(DART))if(!p.special&&!SINTETIZADOS.has(id)){
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

// --------------------------------------------------------------------------
// Ritmos sintetizados: FA caótica, flutter em razão fixa, T plus-minus.
// --------------------------------------------------------------------------

function intervalos(id, hr, segundos = 30) {
  const e = new Engine({ seed: 7 });
  e.rhythm = id;
  e.setParams({ hr, noise: false, pulse: true });
  const beats = [];
  for (let t = 0; t < segundos; t += 1 / 400) { e.schedule(t); beats.push(...e.popBeats(t)); }
  const rr = [];
  for (let i = 1; i < beats.length; i++) rr.push(beats[i].t - beats[i - 1].t);
  return { e, beats, rr };
}

test('FA: o intervalo entre batimentos é irregular de verdade, não uma régua', () => {
  const { rr } = intervalos('afib', 110);
  assert.ok(rr.length > 30, 'poucos batimentos para avaliar');
  const media = rr.reduce((a, b) => a + b, 0) / rr.length;
  const desvio = Math.sqrt(rr.reduce((a, b) => a + (b - media) ** 2, 0) / rr.length);
  // Num ritmo regular o coeficiente de variação fica perto de zero. A FA tem
  // que ficar bem acima disso para o aluno enxergar a irregularidade.
  assert.ok(desvio / media > 0.15, 'variação do RR de apenas ' + (desvio / media).toFixed(3));
  // E nenhum par de intervalos consecutivos pode ser idêntico: isso seria tira
  // repetindo em vez de sorteio.
  assert.ok(rr.some((v, i) => i && Math.abs(v - rr[i - 1]) > 0.05));
});

test('FA: o sinal não se repete em nenhum deslocamento — não é tira em loop', () => {
  // Uma tira em loop se iguala a si mesma quando deslocada de um período
  // inteiro. Em vez de comparar duas janelas escolhidas a dedo (que podem
  // diferir por acaso), procuramos o MELHOR deslocamento possível: se existir
  // algum em que o sinal praticamente coincide consigo, é loop.
  const sr = 400, { v } = varrer('afib', 110, 14, sr);
  const base = Math.round(2 * sr), janela = sr;          // 1 s de referência
  let melhor = Infinity, ondeS = 0;
  for (let lag = Math.round(.5 * sr); lag < Math.round(9 * sr); lag++) {
    let soma = 0;
    for (let i = 0; i < janela; i++) soma += Math.abs(v[base + i] - v[base + lag + i]);
    const m = soma / janela;
    if (m < melhor) { melhor = m; ondeS = lag / sr; }
  }
  assert.ok(melhor > 0.02,
    'sinal se repete com deslocamento de ' + ondeS.toFixed(3) + ' s (diferença média ' + melhor.toExponential(2) + ')');
});

test('flutter: conduz em razão simétrica 2:1 ou 3:1, com RR constante', () => {
  for (const [hr, razao] of [[150, 2], [100, 3], [140, 2], [75, 3]]) {
    const { rr } = intervalos('afl', hr);
    assert.ok(rr.length > 20, `poucos batimentos com FC ${hr}`);
    const esperado = razao * 0.2;
    // Todos os intervalos iguais ao passo da razão: é isso que o deixa simétrico.
    for (const v of rr) {
      assert.ok(Math.abs(v - esperado) < 1e-9, `FC ${hr}: RR ${v.toFixed(4)} em vez de ${esperado}`);
    }
  }
});

test('flutter: as ondas F mantêm o passo de 0,2 s qualquer que seja a razão', () => {
  const e = new Engine({ seed: 1 });
  e.rhythm = 'afl';
  e.setParams({ hr: 150, noise: false });
  for (let t = 0; t < 5; t += 1 / 400) { e.schedule(t); e.popBeats(t); }
  // O dente de serra tem período 0,2 s: pontos separados por 0,2 s longe de um
  // QRS têm que cair na mesma fase.
  for (const t of [3.03, 3.07, 3.11]) {
    assert.ok(Math.abs(e.ecg(t) - e.ecg(t + 0.2)) < 0.26, 'onda F fora de passo em ' + t);
  }
});


// O sinal precisa ser colhido DURANTE a varredura: popBeats descarta os
// perfis já desenhados, então chamar ecg() num instante antigo devolve zero.
function varrer(id, hr, segundos = 6, sr = 400) {
  const e = new Engine({ seed: 1 });
  e.rhythm = id;
  e.setParams({ hr, noise: false });
  const v = [], beats = [];
  for (let i = 0; i < segundos * sr; i++) {
    const t = i / sr;
    e.schedule(t); v.push(e.ecg(t)); beats.push(...e.popBeats(t));
  }
  return { v, beats, sr };
}

test('plus-minus: onda T sobe e depois mergulha, com QRS estreito e R preservada', () => {
  const { v, beats, sr } = varrer('wellens', 76);
  assert.ok(beats.length > 4, 'nenhum batimento gerado');
  const i0 = Math.round((beats[2].t - 0.02) * sr);   // começo do complexo
  const faixa = (a, b) => v.slice(i0 + Math.round(a * sr), i0 + Math.round(b * sr));

  // R preservada: o padrão de Wellens não come a onda R.
  assert.ok(Math.max(...faixa(0, .06)) > .6, 'onda R baixa demais');
  // QRS estreito: já voltou à linha de base antes de 0,10 s.
  assert.ok(Math.abs(v[i0 + Math.round(.10 * sr)]) < .2, 'QRS largo demais');

  const subida = faixa(.10, .30), mergulho = faixa(.30, .55);
  const pos = Math.max(...subida), neg = Math.min(...mergulho);
  assert.ok(pos > .12, 'não houve componente positiva da T: ' + pos.toFixed(3));
  assert.ok(neg < -.15, 'não houve mergulho da T: ' + neg.toFixed(3));

  // A ordem importa: é plus-MINUS, não minus-plus.
  const iPos = i0 + Math.round(.10 * sr) + subida.indexOf(pos);
  const iNeg = i0 + Math.round(.30 * sr) + mergulho.indexOf(neg);
  assert.ok(iPos < iNeg, 'a parte negativa veio antes da positiva');
  // E volta à linha de base antes do próximo complexo.
  assert.ok(Math.abs(v[i0 + Math.round(.60 * sr)]) < .1, 'não voltou à linha de base');
});

test('plus-minus: não é apenas um supra de ST com outro nome', () => {
  const pm = varrer('wellens', 76), st = varrer('ste', 76);
  const fundo = o => Math.min(...o.v.slice(Math.round(2 * o.sr), Math.round(5 * o.sr)));
  // O supra de ST levanta a linha; o plus-minus afunda depois da T.
  assert.ok(fundo(pm) < fundo(st) - 0.1,
    `plus-minus ${fundo(pm).toFixed(2)} vs supra ${fundo(st).toFixed(2)}`);
});

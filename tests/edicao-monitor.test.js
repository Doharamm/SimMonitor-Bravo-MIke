// Edição direta no monitor (sem controle remoto): o texto digitado vira um
// ajuste que liga o sensor daquele número.
import test from 'node:test';
import assert from 'node:assert/strict';
import { lerDigitado } from '../public/js/monitor-edicao.js';
import { defaultState } from '../public/js/simulation-state.js';

test('número digitado liga o sensor e aplica o valor', () => {
  const S = defaultState();
  assert.deepEqual(lerDigitado('ecg', '134', S).patch, { vit: { hr: 134 }, show: { ecg: true } });
  assert.deepEqual(lerDigitado('temp', '38,4', S).patch, { vit: { temp: 38.4 }, show: { temp: true } });
  // FR vem do oxímetro, como no controle.
  assert.deepEqual(lerDigitado('spo2', '88', S).patch.show, { spo2: true, resp: true });
  assert.deepEqual(lerDigitado('resp', '28', S).patch.show, { resp: true, spo2: true });
});

test('PNI digitada aparece como leitura, sem o manguito', () => {
  const r = lerDigitado('nibp', '90/60', defaultState());
  assert.deepEqual(r.patch, { vit: { sys: 90, dia: 60 }, show: { nibp: true } });
  assert.deepEqual(r.leituraPni, { sys: 90, dia: 60 });
  assert.ok(lerDigitado('nibp', '60/90', defaultState()).erro, 'PAD maior que PAS passou');
  assert.ok(lerDigitado('nibp', '120', defaultState()).erro);
});

test('EtCO₂ digitado liga a curva e precisa de ventilação para aparecer', () => {
  const S = defaultState(); S.capno = 'none'; S.vit.rr = 0;
  assert.deepEqual(lerDigitado('capno', '35', S).patch, { vit: { etco2: 35, rr: 12 }, show: { capno: true }, capno: 'normal' });
  S.cpr = true;
  assert.deepEqual(lerDigitado('capno', '15', S).patch, { vit: { etco2: 15, rr: 10 }, show: { capno: true }, capno: 'rcp' });
  const ventilando = defaultState(); ventilando.capno = 'bronco';
  assert.deepEqual(lerDigitado('capno', '50', ventilando).patch, { vit: { etco2: 50 }, show: { capno: true } });
});

test('valor inválido ou fora da faixa não passa', () => {
  const S = defaultState();
  for (const [canal, texto] of [['ecg', 'abc'], ['ecg', '400'], ['spo2', '101'], ['temp', '50'], ['ecg', '']]) assert.ok(lerDigitado(canal, texto, S).erro, canal + ' ' + texto);
});

// Conteúdo dos casos do ponto de vista do professor: cada etapa precisa ter a
// situação para narrar e a lista do que se espera da equipe.
import test from 'node:test';
import assert from 'node:assert/strict';
import { SCENARIOS } from '../public/js/scenario-catalog.js';
import { formatarNota } from '../public/js/controller-cases.js';
import { CASE_EXAMS } from '../public/js/case-exams.js';

test('a nota vira situação, lista do esperado e dica, com o texto escapado', () => {
  const html = formatarNota('Paciente <grave>. Esperado: monitorizar; acesso IV; atropina 1 mg. Instrutor: avance depois da dose.');
  assert.match(html, /<p class="nota-sit">Paciente &lt;grave&gt;\.<\/p>/);
  assert.equal((html.match(/<li>/g) || []).length, 3);
  assert.match(html, /<li>atropina 1 mg<\/li>/);
  assert.match(html, /<p class="nota-dica"><b>Instrutor:<\/b> avance depois da dose\.<\/p>/);
  // Nota antiga, sem marcadores, continua um parágrafo só.
  assert.equal(formatarNota('Texto livre de um caso antigo.'), '<p class="nota-sit">Texto livre de um caso antigo.</p>');
});

test('toda etapa dos casos tem situação e ao menos duas ações esperadas', () => {
  for (const sc of SCENARIOS) sc.etapas.forEach((e, i) => {
    const html = formatarNota(e.nota);
    assert.match(html, /nota-sit/, `${sc.id} etapa ${i + 1} sem situação`);
    assert.ok((html.match(/<li>/g) || []).length >= 2, `${sc.id} etapa ${i + 1} sem lista do esperado`);
  });
});

test('FV: a amiodarona tem uma etapa antes do RCE, e os exames acompanham as etapas', () => {
  const fv = SCENARIOS.find(s => s.id === 'fv');
  const iAmio = fv.etapas.findIndex(e => /amiodarona 300 mg/i.test(e.nota) && e.set.rhythm === 'vf');
  const iRce = fv.etapas.findIndex(e => e.titulo === 'RCE');
  assert.ok(iAmio >= 0 && iAmio < iRce, 'amiodarona só aparece depois do RCE');
  assert.ok(fv.etapas[iAmio].onShock, 'a etapa da amiodarona precisa de um choque para seguir');
  for (const sc of SCENARIOS) assert.equal(CASE_EXAMS[sc.id].length, sc.etapas.length, sc.id);
});

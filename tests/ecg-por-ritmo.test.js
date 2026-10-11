// Fora de caso, a galeria sugere o ECG mais compatível com o ritmo atual; sem
// nenhum compatível, avisa e não escolhe nada.
import test from 'node:test';
import assert from 'node:assert/strict';
import { ECG_POR_RITMO, ecgsDoRitmo } from '../public/js/case-exams.js';
import { EXAM_BY_ID } from '../public/js/exams.js';
import { RHYTHMS } from '../public/js/rhythm-catalog.js';
import { sugestaoExames } from '../public/js/exam-gallery.js';
import { defaultState } from '../public/js/simulation-state.js';

test('todo ritmo do catálogo tem uma decisão de ECG, e só aponta para ECGs que existem', () => {
  for (const r of RHYTHMS) assert.ok(Array.isArray(ECG_POR_RITMO[r.id]), 'sem decisão: ' + r.id);
  for (const [ritmo, ids] of Object.entries(ECG_POR_RITMO)) for (const id of ids) assert.equal(EXAM_BY_ID[id]?.kind, 'ecg', ritmo + ' → ' + id);
});

test('fora de caso: ECG do ritmo já vem primeiro; sem compatível, aviso e nada escolhido', () => {
  const S = { ...defaultState(), rhythm: 'afl' };
  const s = sugestaoExames(S, 'ecg');
  assert.equal(s.lista[0].id, ecgsDoRitmo('afl')[0].id);
  assert.equal(s.selo, 'Compatível');
  assert.match(s.titulo, /Flutter atrial/);
  assert.equal(s.aviso, '');
  const semNome = sugestaoExames(S, 'ecg', false);
  assert.doesNotMatch(semNome.titulo + semNome.aviso, /Flutter/, 'nome do ritmo aparece na tela projetada');
  const wpw = sugestaoExames({ ...S, rhythm: 'wpw' }, 'ecg');
  assert.equal(wpw.lista.length, 0);
  assert.match(wpw.aviso, /Nenhum ECG.*Wolff-Parkinson-White/);
  assert.doesNotMatch(sugestaoExames({ ...S, rhythm: 'wpw' }, 'ecg', false).aviso, /Wolff/);
  assert.deepEqual(sugestaoExames(S, 'xray'), { lista: [], titulo: '', selo: '', aviso: '' });
});

test('dentro de caso continua valendo o exame da etapa', () => {
  const S = { ...defaultState(), rhythm: 'svt', scn: { id: 'tsv', step: 0 } };
  const s = sugestaoExames(S, 'ecg');
  assert.equal(s.lista[0].id, 'ecg-6'); assert.equal(s.selo, 'Deste caso');
});

// Guardar e restaurar a aula no navegador (monitor-persistence.js). Antes desta
// separação, o salvamento não tinha teste: o localStorage dos testes do monitor
// descarta o que recebe.
import test from 'node:test';
import assert from 'node:assert/strict';
import { estadoParaGuardar, lerGuardado } from '../public/js/monitor-persistence.js';
import { defaultState, restoreState } from '../public/js/simulation-state.js';
import { SCENARIO_BY_ID } from '../public/js/scenario-catalog.js';

const aula = (extra = {}) => ({
  elapsedMs: 95000, agora: 1_800_000_000_000, paused: false,
  caseElapsed: 120000, caseName: 'PCR em FV', caseRun: 'abc123', automatic: false, assessment: true,
  customScenario: null, ...extra,
});

// Ida e volta passando por JSON, como no localStorage.
const idaEVolta = (S, a) => lerGuardado(JSON.parse(JSON.stringify(estadoParaGuardar(S, a))));

test('ida e volta: ritmo, sinais, caso e terapias voltam como estavam', () => {
  const S = defaultState();
  S.rhythm = 'vf'; S.pulse = 'off'; S.vit.hr = 0; S.vit.spo2 = 85; S.capno = 'rcp';
  S.scn = { id: 'fv', step: 2 }; S.defib.energy = 200; S.defib.shocks = 2; S.pacer.rate = 80;
  S.cur = { ...S.vit, hr: 40 };   // no meio de uma transição
  const { S: volta, aula: a } = idaEVolta(S, aula());
  assert.equal(volta.rhythm, 'vf');
  assert.equal(volta.pulse, 'off');
  assert.equal(volta.vit.spo2, 85);
  assert.equal(volta.capno, 'rcp');
  assert.deepEqual(volta.scn, { id: 'fv', step: 2 });
  assert.equal(volta.defib.energy, 200);
  assert.equal(volta.defib.shocks, 2);
  assert.equal(volta.pacer.rate, 80);
  // A transição em andamento não é guardada: volta já no valor de destino.
  assert.equal(volta.cur.hr, 0);
  assert.deepEqual(a, {
    automatic: false, assessment: true, caseRun: 'abc123', caseName: 'PCR em FV',
    caseElapsed: 120000, paused: false, timerWasRunning: false,
  });
});

test('cronômetro vira tempo acumulado, "religado" no instante da gravação', () => {
  const S = defaultState();
  S.timer = { running: true, startedAt: 5, acc: 0 };
  const guardado = estadoParaGuardar(S, aula({ elapsedMs: 95000, agora: 1000 }));
  assert.deepEqual(guardado.timer, { running: true, startedAt: 1000, acc: 95000 });
  assert.equal(guardado.classroom.timerWasRunning, true);
  // Pausado: guarda como parado, mas lembra que estava rodando.
  const pausado = estadoParaGuardar(S, aula({ paused: true }));
  assert.equal(pausado.timer.running, false);
  assert.equal(pausado.classroom.timerWasRunning, true);
});

test('o que é guardado não leva os valores de transição nem altera o estado vivo', () => {
  const S = defaultState(); S.cur = { ...S.vit };
  const antes = JSON.stringify(S);
  const guardado = estadoParaGuardar(S, aula());
  assert.equal('cur' in guardado, false);
  assert.equal(JSON.stringify(S), antes);
});

test('sem nada guardado: estado padrão e nenhuma preferência de aula', () => {
  for (const vazio of [null, undefined, {}]) {
    const { S, aula: a } = lerGuardado(vazio);
    assert.equal(S.rhythm, defaultState().rhythm);
    assert.equal(a, null);
  }
});

test('preferências de aula corrompidas são ignoradas, não derrubam a restauração', () => {
  const { S, aula: a } = lerGuardado({ ...defaultState(), classroom: 'lixo' });
  assert.equal(a, null);
  assert.equal(S.rhythm, 'nsr');
  const longa = lerGuardado({ ...defaultState(), classroom: { caseName: 'x'.repeat(500), caseRun: 'y'.repeat(500), caseElapsed: -50 } }).aula;
  assert.equal(longa.caseName.length, 100);
  assert.equal(longa.caseRun.length, 80);
  assert.equal(longa.caseElapsed, 0);
});

test('cenário personalizado em andamento é registrado antes de restaurar a etapa', () => {
  // Sem o registro antes, restoreState() não reconhece o cenário e descarta o
  // caso em andamento: a aula voltaria em "Livre".
  const custom = {
    id: 'custom-persistencia-teste', titulo: 'Caso do instrutor', resumo: 'teste',
    etapas: [{ titulo: 'Um', nota: 'n', dur: 0, set: { rhythm: 'nsr' } }, { titulo: 'Dois', nota: 'n', dur: 0, set: { rhythm: 'sb' } }],
  };
  delete SCENARIO_BY_ID[custom.id];
  const S = defaultState(); S.scn = { id: custom.id, step: 1 };
  const { S: volta } = idaEVolta(S, aula({ customScenario: custom }));
  assert.ok(SCENARIO_BY_ID[custom.id], 'cenário personalizado não foi registrado');
  assert.deepEqual(volta.scn, { id: custom.id, step: 1 });
});

test('limiar do marcapasso: sessão guardada com o padrão antigo (60 mA) passa a 15 mA', () => {
  const antigo = defaultState(); antigo.pacer.threshold = 60;
  assert.equal(restoreState(antigo).pacer.threshold, 15);
  // Um limiar escolhido pelo instrutor (diferente do padrão antigo) é mantido.
  const escolhido = defaultState(); escolhido.pacer.threshold = 40;
  assert.equal(restoreState(escolhido).pacer.threshold, 40);
  assert.equal(defaultState().pacer.threshold, 15);
});

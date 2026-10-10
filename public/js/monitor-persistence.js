// Guarda e restaura o estado do monitor no navegador, para uma recarga da página
// (ou o tablet que apagou a tela) não perder a aula em andamento.
//
// Funções puras: recebem e devolvem dados. Quem lê e grava o localStorage é o
// monitor.js. Assim dá para testar a ida e a volta sem navegador.
import { restoreState } from './simulation-state.js';
import { registerScenario } from './classroom.js';

// O que vai para o armazenamento. `aula` traz o que mora fora de `S`:
//   elapsedMs      cronômetro acumulado no instante da gravação
//   agora          Date.now() da gravação
//   paused         simulação pausada
//   caseElapsed    tempo do caso, em ms do relógio da simulação
//   caseName, caseRun, automatic, assessment, customScenario
//
// `S.cur` (valores no meio de uma transição) não é guardado: na volta os sinais
// já começam nos valores de destino.
export function estadoParaGuardar(S, aula) {
  const { cur, ...resto } = S;
  return {
    ...resto,
    // O cronômetro vira tempo acumulado, "religado" no instante da gravação:
    // assim a volta não depende de os dois relógios baterem.
    timer: { ...S.timer, acc: aula.elapsedMs, startedAt: aula.agora, running: S.timer.running && !aula.paused },
    classroom: {
      timerWasRunning: S.timer.running,
      caseElapsed: aula.caseElapsed,
      caseName: aula.caseName,
      caseRun: aula.caseRun,
      automatic: aula.automatic,
      assessment: aula.assessment,
      assessmentPreference: aula.assessment,
      paused: aula.paused,
      customScenario: aula.customScenario,
    },
  };
}

// Lê o que foi guardado. Devolve o estado já saneado por restoreState() e as
// preferências da aula normalizadas, ou `aula: null` se não havia nenhuma.
// Um campo `undefined` em `aula` quer dizer "mantenha o valor atual".
//
// Efeito colateral de propósito: um cenário personalizado em andamento é
// registrado ANTES de restoreState(), que descarta etapa de cenário desconhecido.
export function lerGuardado(saved) {
  if (saved?.classroom?.customScenario) registerScenario(saved.classroom.customScenario);
  const S = restoreState(saved);
  const c = saved?.classroom;
  if (!c || typeof c !== 'object') return { S, aula: null };
  return {
    S,
    aula: {
      automatic: c.automatic !== false,
      assessment: c.assessmentPreference !== false,
      caseRun: typeof c.caseRun === 'string' ? c.caseRun.slice(0, 80) : undefined,
      caseName: String(c.caseName || 'Livre').slice(0, 100),
      caseElapsed: Number.isFinite(c.caseElapsed) ? Math.max(0, c.caseElapsed) : undefined,
      paused: c.paused === true,
      timerWasRunning: c.timerWasRunning === true,
    },
  };
}

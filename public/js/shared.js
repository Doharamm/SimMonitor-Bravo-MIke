// Compatibilidade com testes e integrações antigas. Edite os módulos de origem.
export { RHYTHMS, RHYTHM_BY_ID, RHYTHM_GROUPS } from './rhythm-catalog.js';
export { ENERGIES, VITAL_DEFS } from './simulation-config.js';
export { SCENARIOS, SCENARIO_BY_ID } from './scenario-catalog.js';
export { defaultState, hasPulse, mapOf, clamp, timerSeconds, fmtTime, scenarioStepSet, sanitizeSet, restoreState } from './simulation-state.js';
export { fmtDur, describeSet, setMergeKey, describeAction } from './descriptions.js';

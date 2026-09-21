// Valores compartilhados pela simulação e pelo controle. Não contém configuração de rede.
export const ENERGIES = [1, 2, 3, 4, 5, 7, 10, 15, 20, 30, 50, 70, 100, 120, 150, 170, 200, 230, 300, 360];

export const VITAL_DEFS = {
  hr:    { nome: 'FC',    un: 'bpm',  min: 0,  max: 300, step: 5 },
  spo2:  { nome: 'SpO₂',  un: '%',    min: 0,  max: 100, step: 1 },
  sys:   { nome: 'PAS',   un: 'mmHg', min: 0,  max: 300, step: 5 },
  dia:   { nome: 'PAD',   un: 'mmHg', min: 0,  max: 200, step: 5 },
  rr:    { nome: 'FR',    un: 'irpm', min: 0,  max: 80,  step: 2 },
  etco2: { nome: 'EtCO₂', un: 'mmHg', min: 0,  max: 120, step: 2 },
  temp:  { nome: 'Temp',  un: '°C',   min: 25, max: 43,  step: 0.1 },
};


export const DEFAULT_VITALS = { hr: 78, spo2: 98, sys: 122, dia: 78, rr: 16, etco2: 36, temp: 36.6 };
export const PACER_LIMITS = { rate: [30, 180], ma: [0, 200], threshold: [0, 200] };
export const NIBP_INTERVALS = [0, 3, 5, 10];
export const VITAL_PRESETS = {
  normal: DEFAULT_VITALS,
  choque: { hr: 134, spo2: 93, sys: 78, dia: 48, rr: 28, etco2: 26 },
  hipoxia: { hr: 118, spo2: 82, rr: 32, etco2: 30 },
  hipert: { hr: 96, sys: 210, dia: 124 },
};

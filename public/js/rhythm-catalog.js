// Nomes, grupos, frequências típicas e pulso dos ritmos. Traçados: dart-data.js.
export const RHYTHMS = [
  { id: 'nsr',    nome: 'Ritmo sinusal',                 curto: 'Sinusal',     grupo: 'Sinusais',            hr: 78,  pulse: true },
  { id: 'sb',     nome: 'Bradicardia sinusal',           curto: 'Bradi sinusal', grupo: 'Sinusais',          hr: 44,  pulse: true },
  { id: 'st',     nome: 'Taquicardia sinusal',           curto: 'Taqui sinusal', grupo: 'Sinusais',          hr: 125, pulse: true },
  { id: 'sa',     nome: 'Arritmia sinusal',              curto: 'Arritmia sinusal', grupo: 'Sinusais',       hr: 72,  pulse: true },
  { id: 'svt',    nome: 'Taquicardia supraventricular',  curto: 'TSV',         grupo: 'Supraventriculares',  hr: 180, pulse: true },
  { id: 'psvt',   nome: 'TSV pediátrica',                curto: 'TSV pediátrica', grupo: 'Supraventriculares', hr: 230, pulse: true },
  { id: 'afib',   nome: 'Fibrilação atrial',             curto: 'FA',          grupo: 'Supraventriculares',  hr: 110, pulse: true },
  { id: 'afl',    nome: 'Flutter atrial',                curto: 'Flutter',     grupo: 'Supraventriculares',  hr: 75, pulse: true },
  { id: 'junc',   nome: 'Ritmo juncional',               curto: 'Juncional',   grupo: 'Supraventriculares',  hr: 50,  pulse: true },
  { id: 'pac',    nome: 'Sinusal com extrassístoles atriais', curto: 'ESA',    grupo: 'Supraventriculares',  hr: 80,  pulse: true },
  { id: 'wpw',    nome: 'Wolff-Parkinson-White',         curto: 'WPW',         grupo: 'Supraventriculares',  hr: 80,  pulse: true },
  { id: 'bav1',   nome: 'BAV de 1º grau',                curto: 'BAV 1º',      grupo: 'Bloqueios',           hr: 68,  pulse: true },
  { id: 'bav2m1', nome: 'BAV 2º grau Mobitz I',          curto: 'Mobitz I',    grupo: 'Bloqueios',           hr: 58,  pulse: true },
  { id: 'bav2m2', nome: 'BAV 2º grau Mobitz II',         curto: 'Mobitz II',   grupo: 'Bloqueios',           hr: 48,  pulse: true },
  { id: 'bav3',   nome: 'BAV total (3º grau)',           curto: 'BAVT',        grupo: 'Bloqueios',           hr: 36,  pulse: true },
  { id: 'bbb',    nome: 'Bloqueio de ramo',              curto: 'Bloq. ramo',  grupo: 'Bloqueios',           hr: 80,  pulse: true },
  { id: 'pvc',    nome: 'Sinusal com extrassístoles ventriculares', curto: 'ESV', grupo: 'Ventriculares',    hr: 80,  pulse: true },
  { id: 'bige',   nome: 'Bigeminismo ventricular',       curto: 'Bigeminismo', grupo: 'Ventriculares',       hr: 72,  pulse: true },
  { id: 'ivr',    nome: 'Ritmo idioventricular',         curto: 'Idioventricular', grupo: 'Ventriculares',   hr: 38,  pulse: true },
  { id: 'vt',     nome: 'Taquicardia ventricular',       curto: 'TV',          grupo: 'Ventriculares',       hr: 170, pulse: true },
  { id: 'tdp',    nome: 'Torsades de pointes',           curto: 'Torsades',    grupo: 'Ventriculares',       hr: 220, pulse: false },
  { id: 'vf',     nome: 'Fibrilação ventricular',        curto: 'FV',          grupo: 'PCR',                 hr: 0,   pulse: false },
  { id: 'asys',   nome: 'Assistolia',                    curto: 'Assistolia',  grupo: 'PCR',                 hr: 0,   pulse: false },
  { id: 'agonal', nome: 'Ritmo agônico',                 curto: 'Agônico',     grupo: 'PCR',                 hr: 20,  pulse: false },
  { id: 'ste',    nome: 'Sinusal com supra de ST',       curto: 'Supra ST',    grupo: 'SCA',                 hr: 88,  pulse: true },
  { id: 'ste_st', nome: 'Taqui sinusal com supra de ST', curto: 'Taqui + supra ST', grupo: 'SCA',            hr: 120, pulse: true },
];
export const RHYTHM_BY_ID = Object.fromEntries(RHYTHMS.map(r => [r.id, r]));
export const RHYTHM_GROUPS = ['Sinusais', 'Supraventriculares', 'Bloqueios', 'Ventriculares', 'PCR', 'SCA'];


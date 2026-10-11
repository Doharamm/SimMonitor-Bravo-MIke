// Casos entregues: textos, valores por etapa, transições e gatilhos.
// dur: transição em segundos; wait: permanência didática; onShock/onCapture: avanço.
//
// Formato da nota (lido por formatarNota, em controller-cases.js): primeiro a
// situação, que o professor narra; depois "Esperado:" com as ações separadas por
// ponto e vírgula, que viram uma lista de conferência; por fim, opcional,
// "Instrutor:" com a dica de condução. Revisão de conteúdo em 11/10/2026, feita
// usando o app como professor; aprovação clínica humana segue pendente.
export const SCENARIOS = [
  {
    id: 'bradi', titulo: 'Bradicardia instável — BAV total', tag: 'ACLS',
    resumo: 'Idoso com tontura, sudorese e confusão. BAVT com hipotensão.',
    etapas: [
      { titulo: 'Chegada', dur: 0,
        set: { rhythm: 'bav3', pulse: 'auto', cpr: false, capno: 'normal', vit: { hr: 36, spo2: 91, sys: 78, dia: 44, rr: 22, etco2: 32, temp: 36.2 } },
        nota: 'Homem de 72 anos, tontura, sudorese e confusão há 1 hora. Pele fria, pulso radial fraco. Esperado: monitorizar (ECG, SpO₂, PA) e pedir ECG de 12 derivações; O₂ se SpO₂ < 94%; acesso venoso; reconhecer bradicardia instável (hipotensão, confusão, sinais de choque); atropina 1 mg IV, repetindo a cada 3–5 min até 3 mg; preparar marcapasso transcutâneo e infusão sem esperar a atropina falhar. Instrutor: no BAV total a atropina costuma não funcionar (bloqueio abaixo do nó). Avance quando a dose for feita.' },
      { titulo: 'Sem resposta à atropina', dur: 30,
        set: { spo2Signal:'low', vit: { hr: 34, sys: 72, dia: 40, spo2: 90 } },
        nota: 'Sem resposta à atropina. Mais sonolento, PA caindo. Esperado: marcapasso transcutâneo com pás anteroposteriores; FC 60–80 ppm; subir a corrente até a captura elétrica (espícula seguida de QRS largo) e deixar um pouco acima do limiar; confirmar captura mecânica pelo pulso femoral; analgesia e sedação; ponte ou alternativa: adrenalina 2–10 mcg/min ou dopamina 5–20 mcg/kg/min. Instrutor: o limiar de captura está em 15 mA (ajustável no controle). A captura elétrica avança a etapa no modo automático.',
        onCapture: 'next' },
      { titulo: 'Captura com marcapasso', dur: 45,
        set: { spo2Signal:'normal', vit: { sys: 104, dia: 64, spo2: 95, rr: 18, etco2: 36 } },
        nota: 'Captura elétrica com pulso; PA melhorando. Esperado: confirmar captura mecânica no pulso femoral (o carotídeo engana por causa dos tremores da estimulação); manter a corrente um pouco acima do limiar; analgesia e sedação; buscar a causa (isquemia, hipercalemia, medicamentos); acionar o especialista para marcapasso transvenoso.' },
    ],
  },
  {
    id: 'tsv', titulo: 'Taquicardia instável — TSV', tag: 'ACLS',
    resumo: 'Dor torácica e hipotensão com taquicardia de QRS estreito.',
    etapas: [
      { titulo: 'Avaliação', dur: 0,
        set: { rhythm: 'svt', pulse: 'auto', cpr: false, capno: 'normal', vit: { hr: 188, spo2: 94, sys: 82, dia: 50, rr: 24, etco2: 32, temp: 36.7 } },
        nota: 'Mulher de 45 anos, palpitação e dor no peito há 30 min, sudorese, PA 82/50. Esperado: monitorizar e reconhecer taquicardia regular de QRS estreito com instabilidade; cardioversão elétrica sincronizada imediata: ligar o SINC, 50–100 J bifásico (conforme o fabricante); sedar se possível, sem atrasar o choque; adenosina 6 mg IV em bolus rápido pode ser tentada enquanto o choque é preparado, se não atrasar. Instrutor: só o choque com SINC ligado avança a etapa. Repare se a equipe confere a marca de sincronismo no QRS.',
        onShock: 'next', requireSync: true },
      { titulo: 'Pós-cardioversão', dur: 20,
        set: { rhythm: 'nsr', vit: { hr: 96, sys: 114, dia: 72, spo2: 97, rr: 18, etco2: 36 } },
        nota: 'Reverteu para ritmo sinusal; PA melhorando, sem dor. Esperado: reavaliar ABC e sintomas; ECG de 12 derivações depois da reversão (procurar pré-excitação ou isquemia); manter monitorização; investigar a causa e orientar seguimento com especialista.' },
    ],
  },
  {
    id: 'fv', titulo: 'PCR em FV — ritmo chocável', tag: 'ACLS',
    resumo: 'Colapso presenciado. FV refratária → choques e drogas → RCE.',
    etapas: [
      { titulo: 'Colapso presenciado', dur: 0,
        set: { rhythm: 'vf', vfAmp: 'grossa', pulse: 'auto', cpr: false, capno: 'none', vit: { spo2: 0, sys: 0, dia: 0, rr: 0, etco2: 0 } },
        nota: 'Homem de 60 anos cai na recepção. Não responde, não respira normalmente, sem pulso. Esperado: chamar ajuda e pedir o desfibrilador; RCP de alta qualidade imediata (100–120/min, 5–6 cm, retorno total do tórax, pausas mínimas); colocar as pás e analisar o ritmo; chocar a FV: bifásico 120–200 J conforme o fabricante (se desconhecido, a carga máxima), monofásico 360 J; retomar as compressões logo após o choque, sem checar pulso. Instrutor: no modo automático, cada choque avança uma etapa; a qualidade da RCP fica com você.',
        onShock: 'next' },
      { titulo: 'FV após o 1º choque', dur: 0,
        set: { rhythm: 'vf', capno: 'rcp', vit: { etco2: 14, rr: 10 } },
        nota: 'Checagem de ritmo após 2 min de RCP: FV persiste. Esperado: chocar de novo e retomar a RCP na hora; acesso IV ou IO; adrenalina 1 mg IV/IO depois do 2º choque, repetindo a cada 3–5 min; considerar via aérea avançada e capnografia (EtCO₂ < 10 mmHg indica RCP pouco eficaz).',
        onShock: 'next' },
      { titulo: 'FV após o 2º choque', dur: 0,
        set: { rhythm: 'vf', vfAmp: 'fina', capno: 'rcp', vit: { etco2: 12 } },
        nota: 'FV persiste, agora fina. Esperado: chocar e retomar a RCP; adrenalina 1 mg se ainda não foi feita (e a cada 3–5 min); preparar amiodarona para depois do próximo choque; buscar causas reversíveis (5H e 5T).',
        onShock: 'next' },
      { titulo: 'FV refratária (após o 3º choque)', dur: 0,
        set: { rhythm: 'vf', vfAmp: 'fina', capno: 'rcp', vit: { etco2: 12 } },
        nota: 'FV refratária depois de três choques. Esperado: amiodarona 300 mg IV/IO em bolus (ou lidocaína 1–1,5 mg/kg); manter ciclos de 2 min de RCP com choque a cada checagem; adrenalina a cada 3–5 min; considerar mudar a posição das pás (anteroposterior); rever causas reversíveis. Instrutor: o próximo choque leva ao RCE no modo automático.',
        onShock: 'next' },
      { titulo: 'RCE', dur: 0,
        set: { rhythm: 'st', pulse: 'auto', cpr: false, capno: 'normal', vit: { hr: 108, sys: 92, dia: 56, spo2: 92, rr: 12, etco2: 42 } },
        nota: 'Pulso presente na checagem; o EtCO₂ subiu de repente. Paciente não obedece comandos. Esperado: confirmar pulso e medir a PA; SpO₂ 92–98%, sem excesso de O₂; ventilar para PaCO₂ 35–45 mmHg, sem hiperventilar (o EtCO₂ sozinho não basta); PAM ≥ 65 mmHg e PAS ≥ 90 mmHg, com volume e vasopressor se preciso; ECG de 12 derivações (com supra, cateterismo de emergência); controle de temperatura (32–37,5 °C) e evitar febre; glicemia; investigar a causa.' },
    ],
  },
  {
    id: 'aesp', titulo: 'Trauma — choque hemorrágico e AESP', tag: 'APH',
    resumo: 'Motociclista com sangramento que evolui para AESP.',
    etapas: [
      { titulo: 'Cena / avaliação primária', dur: 0,
        set: { rhythm: 'st', pulse: 'auto', cpr: false, capno: 'normal', vit: { hr: 132, spo2: 94, sys: 86, dia: 58, rr: 28, etco2: 28, temp: 35.6 } },
        nota: 'Motociclista, colisão com carro em velocidade. Dor no quadril e na coxa direita, fêmur deformado, pele fria e pálida. Esperado: segurança da cena e XABCDE; controlar hemorragia externa (pressão direta, torniquete se for membro); cinta pélvica e imobilização do fêmur; O₂ se SpO₂ < 94%; dois acessos calibrosos; prevenir hipotermia; ácido tranexâmico 1 g IV em até 3 h do trauma, conforme o protocolo; transporte rápido para centro de trauma.' },
      { titulo: 'Deterioração', dur: 60,
        set: { spo2Signal:'low', vit: { hr: 148, sys: 66, dia: 40, spo2: 90, rr: 32, etco2: 22, temp: 35.2 } },
        nota: 'PA caindo, FC subindo, mais confuso: choque classe III/IV. Esperado: rever o controle da hemorragia; hipotensão permissiva (PAS 80–90 mmHg) só sem suspeita de TCE; sangue ou hemoderivados quando houver, evitando grandes volumes de cristaloide; aquecer; não atrasar o transporte.' },
      { titulo: 'AESP', dur: 0,
        set: { spo2Signal:'normal', rhythm: 'st', pulse: 'off', cpr: false, capno: 'normal', vit: { hr: 124, spo2: 0, sys: 0, dia: 0, rr: 0, etco2: 10 } },
        nota: 'Perde o pulso; o monitor mostra taquicardia organizada sem pulso. Esperado: reconhecer AESP; na PCR traumática, corrigir as causas reversíveis vem primeiro e acontece junto com a RCP; controle da hemorragia; via aérea e oxigenação; descompressão torácica bilateral se houver suspeita de pneumotórax hipertensivo; reposição com sangue; não chocar. Instrutor: a adrenalina tem papel menor que corrigir a hipovolemia. Avance para o RCE quando hemorragia e volemia forem abordadas.' },
      { titulo: 'RCE', dur: 20,
        set: { pulse: 'auto', cpr: false, capno: 'normal', vit: { hr: 118, sys: 84, dia: 52, spo2: 93, rr: 14, etco2: 34 } },
        nota: 'Pulso volta depois da reposição. Esperado: reavaliar XABCDE; manter controle da hemorragia e hipotensão permissiva; aquecer; transporte imediato para centro de trauma, com aviso prévio.' },
    ],
  },
  {
    id: 'assis', titulo: 'Assistolia → FV', tag: 'ACLS',
    resumo: 'Ritmo não chocável que evolui para FV.',
    etapas: [
      { titulo: 'Assistolia', dur: 0,
        set: { rhythm: 'asys', pulse: 'auto', cpr: false, capno: 'none', vit: { spo2: 0, sys: 0, dia: 0, rr: 0, etco2: 0 } },
        nota: 'Mulher de 68 anos encontrada sem resposta, sem pulso. Monitor em linha reta. Esperado: RCP de alta qualidade imediata; confirmar a assistolia (cabos conectados, ganho, outra derivação); não chocar; adrenalina 1 mg IV/IO o quanto antes, repetindo a cada 3–5 min; via aérea e capnografia; buscar causas reversíveis (5H e 5T). Instrutor: na checagem de ritmo depois de 2 min, avance para a FV.' },
      { titulo: 'Evolui para FV', dur: 0,
        set: { rhythm: 'vf', vfAmp: 'grossa', capno: 'rcp', vit: { etco2: 16, rr: 10 } },
        nota: 'Checagem de ritmo mostra FV. Esperado: reconhecer que o ritmo virou chocável; carregar e chocar (bifásico 120–200 J, conforme o fabricante); RCP imediata depois do choque; manter adrenalina a cada 3–5 min. Instrutor: no modo automático, o choque leva ao RCE.',
        onShock: 'next' },
      { titulo: 'RCE', dur: 0,
        set: { rhythm: 'nsr', pulse: 'auto', cpr: false, capno: 'normal', vit: { hr: 94, sys: 98, dia: 60, spo2: 93, rr: 12, etco2: 40 } },
        nota: 'Pulso presente depois do choque. Esperado: confirmar pulso e medir a PA; SpO₂ 92–98%; ventilar sem hiperventilar (PaCO₂ 35–45 mmHg); PAM ≥ 65 mmHg; ECG de 12 derivações; controle de temperatura e evitar febre; investigar a causa e organizar o destino.' },
    ],
  },
  {
    id: 'iam', titulo: 'SCA com supra de ST → FV', tag: 'ACLS',
    resumo: 'Dor torácica típica, supra de ST inferior, evolui com FV.',
    etapas: [
      { titulo: 'Dor torácica', dur: 0,
        set: { rhythm: 'ste', pulse: 'auto', cpr: false, capno: 'normal', vit: { hr: 92, spo2: 95, sys: 148, dia: 92, rr: 20, etco2: 34, temp: 36.5 } },
        nota: 'Homem de 58 anos, dor em aperto no peito há 40 min, irradiando para o braço esquerdo, com sudorese. Esperado: monitorizar e deixar o desfibrilador por perto; ECG de 12 derivações em até 10 min (supra de ST inferior); AAS 160–325 mg mastigado, se não houver contraindicação; O₂ só se SpO₂ < 90%; no infarto inferior, pedir V4R antes de nitrato; nitrato só sem hipotensão, sem infarto de VD e sem inibidor de PDE5 recente; acionar a rede de reperfusão (angioplastia primária). Instrutor: a próxima etapa é a FV; avance quando quiser testar a resposta da equipe.' },
      { titulo: 'FV súbita', dur: 0,
        set: { rhythm: 'vf', vfAmp: 'grossa', capno: 'none', vit: { spo2: 0, sys: 0, dia: 0, rr: 0, etco2: 0 } },
        nota: 'Colapso durante o atendimento; FV no monitor. Esperado: choque imediato com o desfibrilador já conectado (bifásico 120–200 J, conforme o fabricante); RCP logo depois do choque; seguir o algoritmo de FV. Instrutor: no modo automático, o choque leva ao RCE.',
        onShock: 'next' },
      { titulo: 'RCE com supra', dur: 10,
        set: { rhythm: 'ste_st', pulse: 'auto', cpr: false, capno: 'normal', vit: { hr: 112, sys: 96, dia: 60, spo2: 93, rr: 14, etco2: 38 } },
        nota: 'RCE após um choque; o supra de ST continua. Esperado: cuidados pós-PCR (SpO₂ 92–98%, PAM ≥ 65 mmHg, sem hiperventilar); repetir o ECG de 12 derivações; cateterismo de emergência (supra depois da PCR); antiagregação conforme o protocolo; transporte direto para a hemodinâmica.' },
    ],
  },
  {
    id: 'asma', titulo: 'Crise asmática grave', tag: 'APH',
    resumo: 'Broncoespasmo grave que evolui para fadiga e hipercapnia (curva em barbatana).',
    etapas: [
      { titulo: 'Crise', dur: 0,
        set: { rhythm: 'st', pulse: 'auto', cpr: false, capno: 'bronco', vit: { hr: 126, spo2: 88, sys: 138, dia: 86, rr: 32, etco2: 32, temp: 36.9 } },
        nota: 'Mulher de 24 anos, asmática, falta de ar há 6 h, sem melhora com a bombinha. Fala só palavras soltas, usa a musculatura acessória, sibilos difusos. Esperado: deixar sentada; O₂ para SpO₂ 93–95%; beta-2 inalatório repetido com ipratrópio; corticoide sistêmico; magnésio 2 g IV em 20 min na crise grave sem resposta ao tratamento inicial (não de rotina); reconhecer a curva de capnografia em barbatana. Instrutor: com FR alta o EtCO₂ costuma ficar baixo; EtCO₂ normal ou subindo é sinal de cansaço, não de melhora.' },
      { titulo: 'Fadiga respiratória', dur: 60,
        set: { vit: { hr: 104, spo2: 82, rr: 10, etco2: 66 } },
        nota: 'Ficando sonolenta, respiração lenta e superficial, quase sem sibilos (tórax silencioso); EtCO₂ subindo. Esperado: reconhecer insuficiência respiratória iminente; ventilar com bolsa-válvula-máscara em FR baixa; intubação em sequência rápida (cetamina é boa escolha pelo efeito broncodilatador); adrenalina IM 0,5 mg se houver risco de vida sem resposta, conforme o protocolo. Instrutor: avance depois da via aérea.' },
      { titulo: 'Após IOT e ventilação', dur: 60,
        set: { capno: 'bronco', vit: { hr: 110, spo2: 93, rr: 10, etco2: 48 } },
        nota: 'Intubada e ventilada. Esperado: FR baixa (8–10/min) e volume corrente de 6–8 mL/kg; tempo expiratório longo para evitar auto-PEEP; aceitar hipercapnia moderada; manter broncodilatador; se piorar de repente, pensar em pneumotórax, tubo deslocado ou auto-PEEP (desconectar o ventilador e comprimir o tórax).' },
    ],
  },
  {
    id: 'tce', titulo: 'TCE grave — tríade de Cushing', tag: 'APH',
    resumo: 'Hipertensão, bradicardia e bradipneia após queda.',
    etapas: [
      { titulo: 'Avaliação', dur: 0,
        set: { rhythm: 'sb', pulse: 'auto', cpr: false, capno: 'normal', vit: { hr: 48, spo2: 92, sys: 186, dia: 98, rr: 8, etco2: 52, temp: 36.1 } },
        nota: 'Homem de 35 anos, queda de 4 metros. Glasgow 6, pupila direita dilatada (anisocoria), respiração irregular. Esperado: XABCDE com proteção da coluna cervical; via aérea definitiva (Glasgow ≤ 8); evitar hipóxia (SpO₂ ≥ 94%) e hipotensão (PAS ≥ 110 mmHg nesta idade); reconhecer a tríade de Cushing como sinal de herniação; não baixar a PA, que está sustentando a perfusão cerebral; cabeceira a 30° se não houver choque; hiperventilação leve (EtCO₂ 30–35) só enquanto houver sinais de herniação; considerar salina hipertônica ou manitol conforme o protocolo; transporte para centro com neurocirurgia.' },
      { titulo: 'Após IOT e ventilação', dur: 60,
        set: { vit: { hr: 60, spo2: 97, sys: 164, dia: 90, rr: 14, etco2: 38 } },
        nota: 'Intubado e ventilado; pupilas reavaliadas. Esperado: normocapnia (EtCO₂ 35–45) quando os sinais de herniação melhorarem; SpO₂ ≥ 94%; PAS ≥ 110 mmHg; reavaliar Glasgow e pupilas; transporte para centro de trauma com neurocirurgia.' },
    ],
  },
];
// Teaching dwell times, not clinical deadlines. The last stage never auto-advances.
for (const scenario of SCENARIOS) scenario.etapas.forEach((step, i) => {
  step.wait = i === scenario.etapas.length - 1 ? 0 : 120;
});
export const SCENARIO_BY_ID = Object.fromEntries(SCENARIOS.map(s => [s.id, s]));

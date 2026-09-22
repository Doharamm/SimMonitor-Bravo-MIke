# Catálogo — tudo que existe para montar um caso

Lista de consulta: os 26 ritmos, todos os sinais e alterações possíveis, e as 57
imagens de exame. Use junto com `CASOS.md`, que explica como os campos funcionam.

Nada aqui é escolha clínica — é só o que o aparelho sabe fazer.

---

## 1. Ritmos — 26 disponíveis

`rhythm: 'id'`. Cada um tem um traçado próprio em `dart-data.js`.
A coluna **FC típica** é a frequência sugerida do ritmo; ela **não** define a FC
do caso — quem manda é `vit.hr`. **Pulso** é o pulso padrão quando `pulse: 'auto'`.

### Sinusais
| id | Nome | FC típica | Pulso |
| --- | --- | --- | --- |
| `nsr` | Ritmo sinusal | 78 | sim |
| `sb` | Bradicardia sinusal | 44 | sim |
| `st` | Taquicardia sinusal | 125 | sim |
| `sa` | Arritmia sinusal | 72 | sim |

### Supraventriculares
| id | Nome | FC típica | Pulso |
| --- | --- | --- | --- |
| `svt` | Taquicardia supraventricular | 180 | sim |
| `psvt` | TSV pediátrica | 230 | sim |
| `afib` | Fibrilação atrial | 110 | sim |
| `afl` | Flutter atrial | 75 | sim |
| `junc` | Ritmo juncional | 50 | sim |
| `pac` | Sinusal com extrassístoles atriais | 80 | sim |
| `wpw` | Wolff-Parkinson-White | 80 | sim |

### Bloqueios
| id | Nome | FC típica | Pulso |
| --- | --- | --- | --- |
| `bav1` | BAV de 1º grau | 68 | sim |
| `bav2m1` | BAV 2º grau Mobitz I | 58 | sim |
| `bav2m2` | BAV 2º grau Mobitz II | 48 | sim |
| `bav3` | BAV total (3º grau) | 36 | sim |
| `bbb` | Bloqueio de ramo | 80 | sim |

### Ventriculares
| id | Nome | FC típica | Pulso |
| --- | --- | --- | --- |
| `pvc` | Sinusal com extrassístoles ventriculares | 80 | sim |
| `bige` | Bigeminismo ventricular | 72 | sim |
| `ivr` | Ritmo idioventricular | 38 | sim |
| `vt` | Taquicardia ventricular | 170 | sim |
| `tdp` | Torsades de pointes | 220 | **não** |

### PCR
| id | Nome | FC típica | Pulso |
| --- | --- | --- | --- |
| `vf` | Fibrilação ventricular | 0 | **não** |
| `asys` | Assistolia | 0 | **não** |
| `agonal` | Ritmo agônico | 20 | **não** |

### SCA
| id | Nome | FC típica | Pulso |
| --- | --- | --- | --- |
| `ste` | Sinusal com supra de ST | 88 | sim |
| `ste_st` | Taqui sinusal com supra de ST | 120 | sim |

> **AESP se monta com `pulse: 'off'`**, não com um ritmo próprio. Veja o caso
> `aesp`: ritmo `st` organizado na tela, `pulse: 'off'`, PA zerada.

---

## 2. Sinais vitais

`vit: { … }`. Valor fora da faixa é **cortado para o limite**, sem aviso.

| Campo | Nome na tela | Unidade | Faixa | Passo das setas | Valor padrão |
| --- | --- | --- | --- | --- | --- |
| `hr` | FC | bpm | 0 – 300 | 5 | 78 |
| `spo2` | SpO₂ | % | 0 – 100 | 1 | 98 |
| `sys` | PAS | mmHg | 0 – 300 | 5 | 122 |
| `dia` | PAD | mmHg | 0 – 200 | 5 | 78 |
| `rr` | FR | irpm | 0 – 80 | 2 | 16 |
| `etco2` | EtCO₂ | mmHg | 0 – 120 | 2 | 36 |
| `temp` | Temp | °C | 25 – 43 | 0,1 | 36,6 |

**Regra automática:** `rr: 0` força `capno: 'none'` e `etco2: 0`. Não dá para ter
capnografia sem ventilação.

### Predefinições prontas (`VITAL_PRESETS`)
Botões do controle; servem de referência ao escrever um caso.

| Nome | hr | spo2 | sys | dia | rr | etco2 |
| --- | --- | --- | --- | --- | --- | --- |
| normal | 78 | 98 | 122 | 78 | 16 | 36 |
| choque | 134 | 93 | 78 | 48 | 28 | 26 |
| hipóxia | 118 | 82 | — | — | 32 | 30 |
| hipertensão | 96 | — | 210 | 124 | — | — |

---

## 3. Todas as outras alterações possíveis

| Campo | Valores | O que muda |
| --- | --- | --- |
| `pulse` | `'auto'` \| `'on'` \| `'off'` | `auto` segue o ritmo. `off` = ritmo na tela sem pulso (AESP) |
| `vfAmp` | `'grossa'` \| `'fina'` | Amplitude da FV |
| `capno` | `'normal'` \| `'bronco'` \| `'rcp'` \| `'none'` | Forma da curva: normal, barbatana (broncoespasmo), compressões, ausente |
| `spo2Signal` | `'normal'` \| `'low'` \| `'absent'` | Qualidade do sinal do oxímetro (má perfusão) |
| `cpr` | `true` \| `false` | RCP em andamento |
| `typicalHr` | `true` \| `false` | Usa a FC típica do ritmo em vez de `vit.hr` |
| `shockTo` | um id de ritmo, ou `null` | Para qual ritmo o choque converte |
| `studentPanel` | `true` \| `false` | Mostra o painel de controles do aluno |
| `show` | `{ecg, spo2, nibp, capno, resp, temp}` — cada um booleano | Quais canais aparecem. `capno` é forçado a `true` em toda etapa |
| `alarms` | `{enabled, beep}` | Liga/desliga alarmes e bipe |
| `pacer` | `{on, rate: 30–180, ma: 0–200, threshold: 0–200}` | Marcapasso. `threshold` é o mA em que captura |
| `defib` | `{energy, sync}` | `energy` tem de ser um dos valores da lista abaixo |
| `nibp` | `{interval: 0 \| 3 \| 5 \| 10}` | PNI automática, em minutos. `0` desliga |

**Energias aceitas:** 1, 2, 3, 4, 5, 7, 10, 15, 20, 30, 50, 70, 100, 120, 150,
170, 200, 230, 300, 360 J. Qualquer outro número é ignorado.

### Gatilhos de avanço (fora do `set`, direto na etapa)
| Campo | Efeito |
| --- | --- |
| `onShock: 'next'` | Um choque avança a etapa |
| `requireSync: true` | Só junto de `onShock`: exige SINC ligado (cardioversão) |
| `onCapture: 'next'` | Captura do marcapasso avança a etapa, 4 s depois |

Só valem no modo automático. No manual, o instrutor usa as setas.

---

## 4. Exames — 57 imagens, 50 sem uso

Hoje só **7 das 57** estão associadas a algum caso:

| Imagem | Usada em |
| --- | --- |
| `ecg-0` | tsv · Pós-cardioversão · assis · RCE |
| `ecg-1` | tce · Avaliação |
| `ecg-2` | fv · RCE · aesp (3 etapas) · asma (3 etapas) |
| `ecg-6` | tsv · Avaliação |
| `ecg-13` | bradi · Chegada e Sem resposta à atropina |
| `ecg-20` | iam · Dor torácica e RCE com supra |
| `xray-9` | asma · Crise |

### Os 37 ECGs: `ecg-0` a `ecg-36`

**Aqui está o problema.** Eles não têm nome clínico. O catálogo guarda só o nome
do arquivo:

```
ecg-0  → 01_Lead.jpg     ecg-13 → 14_Lead.jpg     ecg-26 → 27_Lead.jpg
ecg-1  → 02_Lead.jpg     ecg-14 → 15_Lead.jpg     ecg-27 → 28_Lead.jpg
ecg-2  → 03_Lead.jpg     ecg-15 → 16_Lead.jpg     ecg-28 → 29_Lead.jpg
ecg-3  → 04_Lead.jpg     ecg-16 → 17_Lead.jpg     ecg-29 → 30_Lead.jpg
ecg-4  → 05_Lead.jpg     ecg-17 → 18_Lead.jpg     ecg-30 → 31_Lead.jpg
ecg-5  → 06_Lead.jpg     ecg-18 → 19_Lead.jpg     ecg-31 → 32_Lead.jpg
ecg-6  → 07_Lead.jpg     ecg-19 → 20_Lead.jpg     ecg-32 → 33_Lead.jpg
ecg-7  → 08_Lead.jpg     ecg-20 → 21_Lead.jpg     ecg-33 → 34_Lead.jpg
ecg-8  → 09_Lead.jpg     ecg-21 → 22_Lead.jpg     ecg-34 → 35_Lead.jpg
ecg-9  → 10_Lead.jpg     ecg-22 → 23_Lead.jpg     ecg-35 → 36_Lead.jpg
ecg-10 → 11_Lead.jpg     ecg-23 → 24_Lead.jpg     ecg-36 → 37_Lead.jpg
ecg-11 → 12_Lead.jpg     ecg-24 → 25_Lead.jpg
ecg-12 → 13_Lead.jpg     ecg-25 → 26_Lead.jpg
```

Não há como escolher "o ECG do BAV total" sem abrir as imagens. Use a folha de
contato (seção 5) para ver todas de uma vez e batizá-las.

### As 20 radiografias: `xray-0` a `xray-19`

Estas já vêm com nome descritivo, em inglês.

| id | Nome no catálogo | Em português |
| --- | --- | --- |
| `xray-0` | 11yo severe bilateral infiltrates | Infiltrados bilaterais graves, 11 anos |
| `xray-1` | 2month old right mainstem intubation | Intubação seletiva à direita, 2 meses |
| `xray-2` | Adult Cardiac Tamponade | Tamponamento cardíaco, adulto |
| `xray-3` | Collapse of left upper, right middle and right lower lobe | Colapso de lobo superior esquerdo, médio e inferior direitos |
| `xray-4` | COPD | DPOC |
| `xray-5` | Croup | Laringotraqueíte (crupe) |
| `xray-6` | Diffuse bilateral pulmonary infiltrates | Infiltrados pulmonares difusos bilaterais |
| `xray-7` | Infant Cardiac Tamponade | Tamponamento cardíaco, lactente |
| `xray-8` | Mediastinal emphysema, bilateral pleural effusions | Enfisema de mediastino com derrame pleural bilateral |
| `xray-9` | normal chest Xray | Radiografia de tórax normal |
| `xray-10` | Pneumonia | Pneumonia |
| `xray-11` | Pneumonia left lower lobe | Pneumonia de lobo inferior esquerdo |
| `xray-12` | Pulmonary Edema | Edema pulmonar |
| `xray-13` | Pulmonary tuberculosis | Tuberculose pulmonar |
| `xray-14` | right mainstem intubation | Intubação seletiva à direita |
| `xray-15` | Right upper lobe collapse | Colapso de lobo superior direito |
| `xray-16` | Tension Hemopneumothorax | Hemopneumotórax hipertensivo |
| `xray-17` | Tension pneumothorax | Pneumotórax hipertensivo |
| `xray-18` | Trauma rib fractures | Fraturas de arcos costais |
| `xray-19` | White out on right lung | Opacificação total do pulmão direito |

> Os nomes acima são tradução do rótulo do arquivo, **não** laudo. A associação
> de uma imagem a um caso continua sendo decisão sua.

---

## 5. Leitura inicial dos 37 ECGs

Feita por **observação das imagens**, para dar um ponto de partida na hora de
escolher qual associar a uma etapa. **Não é laudo** — a confiança de cada linha
está marcada, e a palavra final é de quem dá a aula.

### Confiança alta — categorias inequívocas

| id | Leitura |
| --- | --- |
| `ecg-0` | Ritmo sinusal, ~75 bpm, sem alteração evidente |
| `ecg-2` | Taquicardia sinusal, QRS estreito, ~120-130 bpm |
| `ecg-5` | Taquicardia regular de QRS estreito, ~200+ bpm — TSV (ou flutter 2:1) |
| `ecg-6` | Taquicardia regular de QRS estreito, ~180-200 bpm — TSV |
| `ecg-13` | Bradicardia grave, ~30-35 bpm — compatível com BAV total |
| `ecg-15` | FV grossa / flutter ventricular — ritmo chocável |
| `ecg-16` | FV fina — ritmo chocável, baixa amplitude |
| `ecg-17` | Assistolia — linha isoelétrica em todas as derivações |
| `ecg-18` | Assistolia — praticamente igual ao `ecg-17` |
| `ecg-19` | Ritmo organizado degenerando em TV/FV — bom para ensinar deterioração |
| `ecg-36` | FV grossa — ritmo chocável |

### Confiança média — provável, confirme antes de usar

| id | Leitura |
| --- | --- |
| `ecg-1` | Ritmo sinusal, ~65 bpm |
| `ecg-3` | Ritmo sinusal, ~85-95 bpm |
| `ecg-4` | Supradesnivelamento de ST — padrão de SCA com supra |
| `ecg-7` | Taquicardia de QRS estreito, ~150 bpm — taqui sinusal ou flutter |
| `ecg-8` | Taquicardia de QRS estreito, ~150 bpm |
| `ecg-9` | Ritmo sinusal, ~70 bpm |
| `ecg-11` | Ritmo sinusal, ~80 bpm |
| `ecg-12` | Bradicardia acentuada, ~40-45 bpm — tipo de bloqueio a confirmar |
| `ecg-20` | Taquicardia ~130-150 bpm com alteração de ST precordial |
| `ecg-22` | QRS alargado com supra de ST extenso — IAM extenso ou BRE |
| `ecg-25` | Taquicardia regular, ~130-150 bpm |
| `ecg-26` | Ritmo sinusal, ~85-95 bpm |
| `ecg-28` | Taquicardia de QRS estreito, ~130-150 bpm, baixa voltagem |
| `ecg-29` | Taquicardia de QRS estreito, ~130-150 bpm, baixa voltagem |
| `ecg-31` | Taquicardia de QRS estreito, ~130-150 bpm |
| `ecg-32` | Ritmo regular, ~100-110 bpm |
| `ecg-33` | Taquicardia ~140-160 bpm com infradesnivelamento de ST |

### Confiança baixa — distinções que a imagem não sustenta

| id | Leitura |
| --- | --- |
| `ecg-10` | Traçado clínico com marcações; ondas T amplas / alteração de ST |
| `ecg-14` | Ritmo lento com QRS alargado e supra de ST — hipercalemia? IAM? |
| `ecg-21` | ~90-110 bpm com alteração de ST/T de parede inferior |
| `ecg-23` | Taquicardia ~120 bpm com complexos largos intercalados — ESV? |
| `ecg-24` | Traçado didático com marcações 1 e 2 — duas morfologias alternadas |
| `ecg-27` | ~80-90 bpm, complexos amplos com alteração de ST — HVE? bloqueio de ramo? |
| `ecg-30` | ~75-90 bpm, R proeminente em V2-V3 com alteração de ST |
| `ecg-34` | **Parece visualmente idêntico ao `ecg-31`** — conferir se é repetição |
| `ecg-35` | ~70-80 bpm com supra de ST |

> Para ver as imagens lado a lado existe um pacote à parte,
> `exames-ecg-raiox.zip`, que fica fora deste projeto: ele é hospedado no site
> da Bravo Mike, não no SimMonitor.

---

## 6. Onde alterar cada coisa

| Quero mudar | Arquivo |
| --- | --- |
| Valores e textos de uma etapa | `public/js/scenario-catalog.js` |
| Qual exame aparece na etapa | `public/js/case-exams.js` |
| Nome ou FC típica de um ritmo | `public/js/rhythm-catalog.js` |
| Nome de uma imagem de exame | `public/js/exams.js` |
| Acrescentar imagem nova | arquivo em `public/exams/` + entrada em `exams.js` |
| Faixa de um sinal vital, energias, limites do marcapasso | `public/js/simulation-config.js` |
| Fonte e data da revisão de um caso | `public/js/clinical-review.js` |

Acrescentar um **ritmo** novo é o único que exige mexer em `dart-data.js` — ele
precisa de um traçado. Os outros não encostam nos dados de onda.

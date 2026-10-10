# Anatomia dos casos clínicos

Onde os casos moram, o que cada campo faz, o que é validado e o que quebra se
mexer errado. Leia antes de refinar caso algum.

> **Os casos não ficam no Supabase.** Eles são código, dentro de
> `public/js/scenario-catalog.js`. O Supabase cuida apenas da conversa entre
> monitor e controle (salas e autorização). Refinar um caso é editar um arquivo,
> rodar os testes e dar `git push` — a Vercel publica sozinha. As cópias que o
> instrutor cria pelo editor ficam no `localStorage` do navegador dele, também
> fora do banco.

---

## 1. Os seis arquivos que formam um caso

| Arquivo | O que guarda | Mexer quando |
| --- | --- | --- |
| **`scenario-catalog.js`** | **O caso em si**: título, resumo, etapas, valores, textos e gatilhos | Sempre. É o arquivo principal |
| `clinical-review.js` | Fonte documental e o que mudou na última revisão, **por caso** | Toda vez que o conteúdo clínico de um caso mudar |
| `case-exams.js` | Qual ECG e qual raio-X aparecem **em cada etapa** | Ao criar caso, ao adicionar/remover etapa, ao trocar o ritmo de uma etapa |
| `rhythm-catalog.js` | Os 26 ritmos disponíveis: `id`, nome, FC típica, se tem pulso | Só para acrescentar um ritmo novo (exige traçado em `dart-data.js`) |
| `simulation-config.js` | Limites de cada sinal vital, energias, limites do marcapasso | Só se um caso precisar de valor fora da faixa atual |
| `classroom.js` | Validação das cópias criadas pelo instrutor | Só se mudar a forma de um caso (campo novo) |

Os oito casos entregues: `bradi`, `tsv`, `fv`, `aesp`, `assis`, `iam`, `asma`, `tce`.

---

## 2. A forma de um caso

```js
{
  id: 'bradi',                       // chave única. Liga o caso a case-exams.js e clinical-review.js
  titulo: 'Bradicardia instável — BAV total',   // até 100 caracteres
  tag: 'ACLS',                       // só muda a cor do selo no controle: 'ACLS' ou 'APH'
  resumo: 'Idoso com tontura...',    // até 240 caracteres, aparece no cartão do caso
  etapas: [ /* ... */ ],             // 1 a 20 etapas
}
```

### A forma de uma etapa

```js
{
  titulo: 'Chegada',                 // até 100 caracteres
  dur: 0,                            // 0 a 600 s: quanto tempo os sinais levam para chegar ao novo valor
  set: { /* o quadro clínico */ },   // ver seção 3
  nota: 'Paciente 72 anos...',       // até 1200 caracteres: a orientação que o instrutor lê
  onShock: 'next',                   // opcional: um choque avança a etapa
  requireSync: true,                 // opcional, só junto de onShock: exige SINC ligado
  onCapture: 'next',                 // opcional: captura do marcapasso avança a etapa (após 4 s)
}
```

**`dur` é transição, não permanência.** `dur: 30` significa que a FC vai deslizar
até o novo valor ao longo de 30 segundos. `dur: 0` muda na hora.

**Os gatilhos só valem no modo automático.** Se o instrutor escolher avanço
manual, `onShock` e `onCapture` são ignorados e ele usa as setas.

---

## 3. O que pode entrar em `set`

Tudo aqui passa por `sanitizeSet()`. **Campo desconhecido é descartado em
silêncio** — se você inventar um nome, o caso carrega sem aquele efeito.

| Campo | Valores aceitos | O que faz |
| --- | --- | --- |
| `vit.hr` | 0–300 | FC prescrita |
| `vit.spo2` | 0–100 | Saturação |
| `vit.sys` / `vit.dia` | 0–300 / 0–200 | PA sistólica e diastólica |
| `vit.rr` | 0–80 | FR. **`rr: 0` força `capno: 'none'` e `etco2: 0`** |
| `vit.etco2` | 0–120 | EtCO₂ |
| `vit.temp` | 25–43 | Temperatura |
| `rhythm` | um `id` de `rhythm-catalog.js` | O traçado do ECG |
| `pulse` | `'auto'` \| `'on'` \| `'off'` | `auto` segue o ritmo; `off` é o que cria AESP |
| `vfAmp` | `'grossa'` \| `'fina'` | Amplitude da FV |
| `capno` | `'normal'` \| `'bronco'` \| `'rcp'` \| `'none'` | Forma da curva de capnografia |
| `spo2Signal` | `'normal'` \| `'low'` \| `'absent'` | Qualidade do sinal do oxímetro |
| `cpr` | `true` \| `false` | RCP em andamento |
| `shockTo` | `id` de ritmo, ou `null` | Para qual ritmo o choque converte |
| `show` | `{ecg, spo2, nibp, capno, resp, temp}` | Quais canais aparecem na tela |
| `pacer` | `{on, rate: 30–180, ma: 0–200, threshold: 0–200}` | Marcapasso |
| `defib` | `{energy: uma das ENERGIES, sync}` | Desfibrilador |
| `nibp` | `{interval: 0, 3, 5 ou 10}` | PNI automática |
| `alarms` | `{enabled, beep}` | Alarmes |
| `typicalHr`, `studentPanel` | booleano | Usar FC típica do ritmo; mostrar painel do aluno |

### A pegadinha mais importante: `set` é cumulativo

`scenarioStepSet()` monta cada etapa **empilhando todas as etapas anteriores**.
Uma etapa só precisa declarar o que **muda**.

```js
etapas: [
  { set: { rhythm: 'bav3', vit: { hr: 36, sys: 78, spo2: 91 } } },   // etapa 0
  { set: { vit: { hr: 34, sys: 72 } } },                              // etapa 1: spo2 segue 91, ritmo segue bav3
]
```

Consequências práticas:

- **Voltar uma etapa reconstrói o quadro certo** — o instrutor pode ir e voltar.
- **Para desfazer algo, declare o contrário explicitamente.** Se a etapa 1 ligou
  `cpr: true`, a etapa 2 precisa de `cpr: false`; não basta omitir.
- **O mesmo vale para `spo2Signal`.** Veja `bradi`: a etapa 1 põe `'low'` e a
  etapa 2 devolve `'normal'`. Omitir manteria o sinal ruim.
- `capno: true` em `show` é forçado em toda etapa, de propósito.

---

## 4. O `wait` do catálogo é sobrescrito — leia isto antes de tentar ajustar

No fim de `scenario-catalog.js` existe este laço:

```js
for (const scenario of SCENARIOS) scenario.etapas.forEach((step, i) => {
  step.wait = i === scenario.etapas.length - 1 ? 0 : 120;
});
```

Ele **apaga qualquer `wait` que você escreva na etapa** e impõe 120 s em todas,
e 0 na última. O monitor lê `step.wait`, então tempos por etapa funcionam no
código — mas o laço não deixa chegar lá.

Para ter permanência diferente por etapa, o laço precisa passar a respeitar o
valor declarado (`step.wait = step.wait ?? (última ? 0 : 120)`). Isso é uma
alteração de comportamento e merece teste próprio.

Lembre que `wait` é **tempo didático, não prazo clínico**, e o instrutor pode
sobrepor pelo controle (15 s a 600 s, ou desligar).

---

## 5. Exames: uma decisão explícita por etapa

`case-exams.js` precisa ter **exatamente uma entrada por etapa** de cada caso.
Ausência é declarada com `entry()`, não omitida.

```js
bradi: [entry('ecg-13'), entry('ecg-13'), entry()],   // 3 etapas, 3 entradas
```

Duas regras que os testes cobram:

1. **A contagem tem de bater.** `CASE_EXAMS[id].length === etapas.length`.
   Acrescentar uma etapa sem acrescentar a entrada **quebra o teste**.
2. **ECG associado só aparece se o ritmo da tela for o prescrito da etapa.** Se
   o instrutor mudou o ritmo à mão, o ECG associado desaparece — para não
   mostrar um traçado que não corresponde ao monitor.

O catálogo de imagens é `exams.js` (57 imagens: `ecg-0`…`ecg-36`, `xray-0`…).
Para usar uma imagem nova, o arquivo entra em `public/exams/` e a entrada em
`exams.js` antes de poder ser associada.

---

## 6. Revisão clínica: o que o app afirma e o que não afirma

`clinical-review.js` tem, para cada caso, a fonte consultada e o que mudou na
revisão de 19/09/2026. O texto que o app mostra diz **"revisão documental" e
"aprovação clínica humana pendente"** — de propósito.

**Ao mudar conteúdo clínico de um caso, atualize a entrada correspondente em
`CLINICAL_REVIEW`** (`source`, `url`, `change`). Um teste garante que cópias
preservam a fonte do original e nunca herdam "revisão feita".

Cópias criadas pelo instrutor recebem sempre
`approval: 'Revisão clínica humana pendente'` e `reviewedAt: null`. Não existe
caminho no código para uma cópia se declarar revisada.

---

## 7. Os testes que guardam os casos

Rode `npm test` antes e depois. Os que falham primeiro quando um caso muda:

| Teste | O que cobra |
| --- | --- |
| `UI: every built-in case has an explicit exam decision for every stage` | Uma entrada em `CASE_EXAMS` por etapa, e tipo de imagem correto |
| `Every builtin case can be duplicated without editing its source` | Todo caso passa por `validateScenario` sem perder valores |
| `Custom cases reject builtin IDs, out of range values...` | Limites e campos desconhecidos |
| `FIX: copies preserve each original source and origin` | `CLINICAL_REVIEW` tem entrada para cada caso |
| `Each stage restores prescribed capnography after manual edits` | A composição cumulativa devolve o quadro ao voltar de etapa |
| `CLASSROOM: restored scenario step is bounded by its current edition` | Um passo salvo maior que o número de etapas é limitado. **Esperar `bradi` com 3 etapas — mudar isso exige atualizar o teste** |
| `TSV advances only after synchronized shock` | `onShock` + `requireSync` |
| `loading a new scenario clears pacer, charge, NIBP...` | Trocar de caso cancela terapia pendente |

---

## 8. O que **não** fazer ao refinar casos

- **Não editar `dart-data.js`, `dart-player.js`, `ecg-shapes.js` nem `engine.js`.**
  Mudar a FC típica de um ritmo não deve encostar na amostra do traçado.
- **Não mover casos para o Supabase.** O guia de publicação proíbe explicitamente,
  e nada no app lê casos de banco.
- **Não redesenhar telas** junto com a mudança de caso.
- **Não inventar conduta clínica.** Se um refinamento depende de diretriz, a fonte
  precisa ser dita e registrada em `clinical-review.js` — ou a mudança fica
  marcada como pendente de revisão.
- **Não editar `server-go/public/` nem `web/dist/`**: são cópias geradas.

---

## 9. Fluxo de uma alteração

```sh
npm test                 # ponto de partida limpo: 178 passando
# editar scenario-catalog.js (+ case-exams.js e clinical-review.js se preciso)
npm test                 # tem de voltar a 178, ou mais se acrescentou teste
npm run preview          # conferir na tela, em modo demonstração
git add -A && git commit && git push    # a Vercel publica sozinha
```

Para conferir um caso na tela: abra monitor e controle em
`http://127.0.0.1:8799/…?modo=demo&sala=4321`, autorize o controle, escolha o
caso na aba **Caso** e percorra as etapas com as setas.

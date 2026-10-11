# Mapa do código — SimMonitor

Onde mexer em cada coisa e o que pode quebrar sem avisar. Leia a seção 4,
**Armadilhas**, antes da primeira alteração.

## 1. Estrutura e responsabilidades

`public/` é a fonte do aplicativo. Edite ali. `server-go/public/` e `web/dist/` são cópias geradas; editar essas pastas perde a alteração no próximo preparo.

| Arquivo ou grupo | Responsabilidade |
| --- | --- |
| `public/index.html`, `monitor.html`, `controle.html` | Entrada, estrutura das páginas, botões e diálogos estáticos. |
| `public/js/monitor.js` | Coordenação da simulação: estado vivo, comandos, transições, terapias, cancelamentos, etapas, autorização dos controles, atualização do monitor. |
| `public/js/monitor-persistence.js` | Guardar e restaurar a aula no navegador (recarga da página). Funções puras; o `localStorage` fica no `monitor.js`. |
| `public/js/monitor-room-ui.js` | Tela da sala no monitor: código, QR code, endereço do controle, escolha da rede e "Nova sala". |
| `public/js/controle.js` | Conexão do instrutor, envio e confirmação dos comandos, ajustes pendentes (primeira metade do arquivo, coberta pelos testes) e a tela do controle (segunda metade): colunas de sensor com slider, ritmo, terapia, atalhos e menu. Tablet deitado = painel único com rodapé; celular = abas com doca. O layout é do `controle.css`. |
| `public/js/engine.js` | Geração dos sinais, eventos de batimento, captura elétrica, artefatos de choque/RCP, pleth, capnografia e respiração. A maioria dos ritmos toca a tira digitalizada; alguns são sintetizados — ver seção 4. |
| `public/js/dart-data.js` | Amostras e metadados dos traçados aprovados. Preservado integralmente. |
| `public/js/dart-player.js`, `ecg-shapes.js` | Reprodução das amostras e componentes sintéticos usados pelo motor. |
| `public/js/trace-renderer.js` | Desenho no canvas: varredura, limpeza, redimensionamento e marcadores de sincronismo. Recebe a função que fornece o sinal. |
| `public/js/simulation-state.js` | Estado inicial, saneamento de comandos, restauração, composição cumulativa de etapas, pulso, tempo e lista de atividades interrompidas. |
| `public/js/simulation-clock.js` | Relógio monotônico e temporizadores que congelam na pausa. |
| `public/js/simulation-config.js` | Limites/nomes/unidades dos sinais, energias, limites do marcapasso, intervalos de PNI, sinais iniciais, predefinições e as listas de valores permitidos (pulso, amplitude da FV, capnografia, oxímetro, canais). |
| `public/js/rhythm-catalog.js` | Nomes e grupos de ritmos, frequência típica e pulso padrão. Não contém curvas. |
| `public/js/scenario-catalog.js` | Textos dos casos, valores prescritos, etapas, transições e gatilhos de avanço. Registro compartilhado de casos. |
| `public/js/controller-cases.js` | Seletor visual de casos (filtros ACLS/APH, busca por qualquer ritmo do caso, cartões com a miniatura do ritmo de chegada desenhada pelo `engine.js`, carregado só quando a lista é montada), confirmação de troca e etapas do caso em andamento. Usado no controle e também no monitor (botão "Casos", com confirmação própria em `monitor.js`); estilos em `css/case-picker.css`. Recebe `getState()` para sempre consultar o estado atual. |
| `public/js/classroom.js` | Versão, validação e registro de cenários personalizados, biblioteca local, metadados e escape de texto. |
| `public/js/classroom-ui.js`, `scenario-editor.js` | Condução da aula e editor de cópias locais, respectivamente. |
| `public/js/descriptions.js` | Descrições de comandos para o instrutor e histórico; formatação compartilhada dos valores. |
| `public/js/monitor-readings.js` | Cálculo dos números e alarmes, sem tocar na tela nem disparar ações. |
| `public/js/monitor-audio.js` | Geração dos sons de batimento, alarmes, carga e choque; saída comum para silenciar todos. |
| `public/js/transport.js` | Detecção local/demo/online, envio imediato e reconexão. Não guarda comandos para reenviar depois. No modo online assina a saída e confere a entrada. |
| `public/js/session.js` | Concessões temporárias para comandos, rejeição de repetição, presença de monitores e relógio remoto. |
| `public/js/crypto-identity.js` | Modo online: par de chaves do aparelho, forma canônica, assinatura e verificação de cada mensagem. Define qual papel pode enviar qual tipo, igual ao servidor Go. Não toca em tela nem em armazenamento. |
| `public/js/online-room.js` | Modo online: ciclo da sala (abrir, entrar, fila de pendentes, autorizar, revogar, batimento) e cache das chaves públicas lidas do banco. |
| `public/js/supabase-rest.js` | Modo online: sessão anônima guardada e renovada, chamadas REST e RPC. Sem biblioteca externa. |
| `public/js/state-validation.js` | Validação estrita do estado recebido pelo controle. Não equivale ao saneamento de comandos. |
| `public/js/exams.js`, `case-exams.js` | Catálogo das 57 imagens; o exame de cada etapa (`CASE_EXAMS`, marcado "Deste caso") e, fora de caso, o ECG mais compatível com cada ritmo (`ECG_POR_RITMO`, marcado "Compatível"; lista vazia = a galeria avisa e não escolhe nada). |
| `public/sw.js`, `public/js/pwa.js`, `public/manifest.webmanifest` | App instalável: service worker (rede primeiro, cópia só para falha de rede; não guarda Supabase, `/ws` nem `/api`), registro e manifesto com ícones e atalhos. Ver `docs/OPERACAO.md`. |
| `public/js/monitor-edicao.js` | Edição direta no monitor, sem controle remoto: clique no número (FC, SpO₂, EtCO₂, FR, Temp, PA), digite, Enter. O valor entra na hora e liga o sensor; na PA a leitura aparece sem o manguito. O mesmo campo tem "Desligar sensor". `lerDigitado()` e `desligarSensor()` são a parte testável. |
| `public/js/exam-info.js` | Descrição de cada exame, só para o instrutor achar o que procura (leituras de ECG não validadas). Nunca vai para a tela do aluno. |
| `public/js/exam-gallery.js`, `css/exam-gallery.css` | Galeria de exames com miniaturas, abas ECG/Raio-X e busca; a mesma no controle e no monitor (no monitor, descrições ocultas por padrão). |
| `public/js/exam-search.js`, `exam-viewer.js`, `monitor-exams.js` | Busca, apresentação/zoom/foco do exame, e os atalhos do próprio monitor (Ritmo, ECG, Raio-X) para conduzir sem controle remoto. |
| `public/js/history.js`, `debrief-export.js` | Histórico e exportação paginada, vinculada à sessão. |
| `public/js/clinical-review.js` | Fontes e histórico da revisão documental dos casos. Não representa aprovação clínica humana. |
| `public/js/config.js` | Projeto Supabase do modo online. A chave é publicável e não autentica o instrutor. |
| `supabase/migrations/` | Salas, participantes, chaves públicas, RPCs de autorização e políticas do canal privado. |
| `public/js/shared.js` | Reexporta os mesmos 20 nomes anteriores para compatibilidade. Não adicione lógica aqui; edite os módulos de origem. |
| `public/css/base.css` | Fontes, cores e estilos compartilhados. |
| `public/css/monitor.css`, `monitor-scenario-controls.css`, `controle.css` | Layout específico das telas. Todos preservados nesta reorganização. |
| `server-go/main.go` | Servidor local, salas, identidades vinculadas às conexões, limites e distribuição das mensagens. |
| `web/build.mjs`, `scripts/prepare-go.mjs` | Geram `web/dist` e `server-go/public`. Os dois usam `scripts/copiar-publico.mjs`, que apaga o destino antes e define o que fica fora da publicação. |
| `scripts/preview*.mjs`, `scripts/audit-*` | Prévia local e auditorias de navegador/online. |
| `tests/`, `server-go/main_test.go` | Testes automatizados. `tests/manutencao.test.js` guarda versão, listas de valores e cópia de `public/`. |
| `.github/workflows/` | Agendamento que mantém o Supabase acordado (ver `docs/OPERACAO.md`). |
| `reference/dart-originals/`, `public/tracados.html` | Referências visuais e galeria de conferência; a galeria não entra no executável/site gerado. |
| `docs/` | Operação, casos e catálogo. `docs/historico/` guarda documentos de entregas anteriores. |
| `evidencias/` | Relatórios de origem, proveniência e imagens do layout aprovado. |
| `auditoria/` | Criada ao executar testes de navegador. Fora do repositório. |

## 2. Dependências principais

O monitor é a autoridade sobre o estado. O controle solicita uma alteração e aguarda confirmação. As interfaces não devem modificar os catálogos para representar o estado corrente.

```text
controle.js → transport.js → servidor Go / BroadcastChannel → monitor.js
     ↓                                                       ↓
state-validation.js                               simulation-clock.js
     ↓                                            simulation-state.js
catálogos + simulation-config.js                   engine.js → dart-player.js
                                                        ↓          ↓
                                                  trace-renderer.js dart-data.js
                                                        ↓
                                               monitor-readings.js / monitor-audio.js
```

1. `Transport` cuida da conexão; `CommandGate` valida sessão, prazo e sequência. A autorização explícita do instrutor permanece em `monitor.js`. O Go vincula identidade e papel à conexão.
2. `sanitizeSet()` limita o pedido recebido. `validPublicState()` rejeita um estado incompleto/inválido. `restoreState()` recupera somente campos compatíveis do armazenamento local. As três funções têm contratos distintos e continuam separadas.
3. `SCENARIO_BY_ID` é um único objeto compartilhado. `registerScenario()` registra cópias validadas nele. Os dados publicados em `SCENARIOS` permanecem preservados.
4. O tempo da simulação controla sinais, pausa, transições e terapias. O tempo real continua controlando rede, presença e expiração das autorizações. Não substitua um pelo outro.
5. Não há framework nem dependência nova. Produção usa módulos JavaScript nativos e APIs do navegador; o servidor mantém a dependência Go existente em `gorilla/websocket`. Playwright/Edge são usados apenas nos testes de navegador. QR usa o módulo local já existente em `public/js/vendor/`.

O grafo exato dos imports está em `evidencias/refatoracao-preservacao.json`, campo `dependencies`.

## 3. Onde editar cada coisa

| Alteração desejada | Local e exemplo |
| --- | --- |
| Texto de botão fixo | `monitor.html` ou `controle.html`: procure pelo `id` do botão. Confira se a função `render()` também atualiza seu texto. |
| Texto de histórico/confirmacão de comando | `descriptions.js`: `describeSet()` e `describeAction()`. Avisos de conexão ficam junto das condições em `controle.js`/`session.js`. |
| Nome/frequência típica de ritmo | `rhythm-catalog.js`: entrada pelo `id`. Mudar a frequência típica não deve editar a amostra em `dart-data.js`. |
| Ritmo novo | Entrada em `rhythm-catalog.js` e um `case` no `switch` de `schedule()` em `engine.js` (forma em `ecg-shapes.js`, se precisar). Ritmo sem tira cai sempre no `switch`. Acrescente-o ao teste de FC 0 em `regression.test.js` e confira a curva no navegador. |
| Valor inicial de sinal | `simulation-config.js`: `DEFAULT_VITALS`. Ex.: `hr`. `defaultState()` faz cópia para não alterar os valores iniciais durante a aula. |
| Predefinição normal/choque/hipóxia/hipertensão | `simulation-config.js`: `VITAL_PRESETS`. A predefinição normal compartilha os mesmos valores iniciais. |
| Passo das setas, limites e unidade de sinal | `simulation-config.js`: `VITAL_DEFS`. Ex.: `etco2.step`. O controle e as validações usam essa definição. |
| Atalhos de EtCO₂ e seus rótulos | `controle.html`: botões `data-etco2` (valor aplicado) e `data-l` (limiar mostrado: <10, ≥10, 35–45). A reativação da curva/ventilação fica em `setVitals()`, no `controle.js`; ela não liga o capnógrafo. |
| Sensores (ligar e desligar canais) | Estado `show` do monitor. Começam desligados (`defaultState()`), voltam a desligar em caso novo (`resetSimulation()`) e só mudam pela chave de cada coluna (`COLUNAS` no `controle.js`). Ligar o oxímetro liga a FR junto. Alarme de canal desligado não toca (`monitor-readings.js`). |
| Medida da PNI: duração, curva do manguito e som | `nibpPlan()` em `simulation-state.js` define os tempos; o monitor desenha com `cuffAt()` e toca com `cuffSound()` (`monitor-audio.js`). Sem manguito ligado, a medida é recusada. `nibp-stop` cancela. |
| Energias, limites de marcapasso e PNI | `simulation-config.js`: `ENERGIES`, `PACER_LIMITS`, `NIBP_INTERVALS`. Se adicionar uma opção visível de PNI, atualize também os botões `data-seg="nibpInt"` em `controle.html`. |
| Cores dos canais e tema | `base.css`: variáveis `--ecg`, `--spo2`, `--co2` etc. As cores do canvas são argumentos de `new Trace()` em `monitor.js`; ajuste ambas se quiser mudar também a curva. |
| Velocidade/amostragem da curva | `monitor.js`: tabela `tr`, argumentos `secs` e `sr`. `trace-renderer.js` apenas aplica esses valores. Mudanças aqui precisam de comparação visual. |
| Novo caso ou texto de etapa | `scenario-catalog.js`: entrada de `SCENARIOS`, com `id`, `titulo`, `resumo`, `etapas`. Cada etapa tem `set`, `dur`, `nota` e gatilhos opcionais. |
| Transição versus permanência | `dur` é o tempo de mudança dos sinais. `wait` é a permanência didática antes de avançar. A atribuição padrão ao fim de `scenario-catalog.js` usa 120 s e 0 na última etapa. |
| Opções de tempo da aula | `classroom-ui.js`: seletor `stageWait`. A execução/cancelamento está em `monitor.js`: `scheduleStage()`, `cancelStageTimer()`, `goStep()`. |
| Cópias de casos criadas pelo instrutor | `scenario-editor.js` para campos/tela; `classroom.js` para validação, limites e gravação local. |
| Associar ECG ou raio-X à etapa | `case-exams.js`: `CASE_EXAMS[id]`, uma entrada por etapa. Ausência é explícita. Exames de ECG associados exigem o ritmo prescrito. |
| Adicionar imagem ao catálogo | Arquivo em `public/exams/` e entrada em `exams.js`. Depois associe no caso, se necessário. |
| Limites, textos e prioridade dos alarmes | `monitor-readings.js`: `evaluateReadings()`. Intervalos de repetição sonora e avaliação ficam em `monitor.js`: `evaluate()`. |
| O que sobrevive a uma recarga do monitor | `monitor-persistence.js`: `estadoParaGuardar()` e `lerGuardado()`. Testes em `tests/persistencia.test.js`. |
| QR code, endereço do controle, "Nova sala" | `monitor-room-ui.js`. Os botões são ligados no `monitor.js`, que controla quem age e a pausa. |
| Sons e volumes | `monitor-audio.js`. Abertura por gesto do usuário, pausa/retomada do contexto e preferência de silêncio permanecem no monitor. |
| Carga, choque e sincronismo | `monitor.js`: `charge()`, `disarm()`, `shock()`, `deliverShock()`, `cancelSync()` e conferência dos eventos em `frame()`. Efeito sobre o sinal: `engine.js`. |
| Marcapasso e RCP | `engine.js` para sinais/captura; `monitor.js` para aplicação, registro e avanço do caso. Captura elétrica não deve ser confundida com pulso. |
| Pausa e cronômetro | `simulation-clock.js` e `monitor.js`: `pauseSimulation()`, `timerAction()`. O controle recebe tempo acumulado, não calcula diferença entre relógios dos aparelhos. |
| Reconexão e autorização | `transport.js`, `session.js`, recepção em `monitor.js`/`controle.js`, identidade do socket em `server-go/main.go`. No modo online: `online-room.js` e a migração em `supabase/migrations/`. Não altere campos do protocolo em apenas uma ponta — o envelope `auth` cobre a mensagem inteira. |
| Quem autoriza ou revoga um controle | `monitor.js`: `autoAprovar()` (o controle do QR entra sozinho, uma vez por aparelho em cada conexão), `autorizarControle()`, `revogarControle()`, `sincronizarSala()`. No banco, a RPC `sim_definir_situacao`. No modo online a fila de pendentes vem da sala, não da rede. |

Exemplos de fluxo de edição:

1. **Trocar a orientação escrita de uma etapa:** edite só `nota` em `scenario-catalog.js`; rode `npm test`; confira a etapa no controle. Uma correção clínica exige revisão própria.
2. **Mudar o tamanho de um botão:** localize seu `id`/classe no HTML e ajuste o CSS da tela correspondente; confira desktop e as três larguras móveis. Não mova regras de terapia para o evento de clique.
3. **Ajustar uma predefinição:** edite `VITAL_PRESETS`; confirme o comando recebido e se a duração de transição escolhida foi respeitada. Não altere o estado inicial sem intenção explícita.
4. **Mudar regra de choque:** comece pelos testes de SINC, troca de etapa, pausa e callbacks antigos em `regression.test.js`. Preserve o cancelamento ao mudar de etapa/ritmo, desligar SINC, ocultar a tela e reiniciar.

## 4. Armadilhas

Coisas que funcionam no navegador e quebram em outro lugar, ou o contrário.

**Os testes carregam três arquivos sem os `import`.** `tests/regression.test.js`
lê `monitor.js`, `controle.js` e `transport.js` como texto, apaga as linhas de
`import` e executa o resto numa caixa isolada (`vm`), entregando à mão cada nome
que o arquivo importaria — veja as funções `monitor()` e `controller()` no teste.
Consequências:

- Acrescentou um `import` num desses arquivos e usou o nome? O app funciona, mas
  os testes falham. Acrescente o nome ao objeto `sandbox` correspondente no
  teste. O teste "MANUTENÇÃO: a caixa isolada…" aponta exatamente qual nome
  falta. Se o nome só é usado depois de conectar (os testes não conectam),
  ponha-o em `AUSENTES_DE_PROPOSITO`, no mesmo arquivo.
- Cuidado redobrado com código dentro de `try/catch`: lá o `ReferenceError` é
  engolido e o recurso falha calado. A restauração da aula no `monitor.js` é
  assim.
- Nunca use um nome importado no nível de cima de `transport.js`: vários testes
  executam `detectMode()` sozinho, com apenas `CONFIG` disponível.
- Prefira pôr lógica nova num módulo próprio, que os testes importam normalmente,
  e chamar de lá. É mais fácil de testar e não depende do `sandbox`.

**Valores permitidos têm uma fonte só.** Pulso, amplitude da FV, capnografia,
sinal do oxímetro e canais ficam em `simulation-config.js`. O controle recusa
qualquer estado com um valor fora da lista (`state-validation.js`); acrescentar
um valor em outro lugar, sem passar por ali, faz o controle parar de aceitar o
monitor.

**Dois caminhos de geração de ritmo.** No `schedule()` do motor, um ritmo com
tira em `dart-data.js` toca a tira e retorna antes do `switch`. Só chegam ao
`switch`:

- os marcados `special` na tira (`bav3`, `bige`), que montam P e QRS de pedaços
  da tira;
- os de `SINTETIZADOS` (`afib`, `afl`), que têm tira mas são sintetizados — a
  tira em loop repetia o desenho entre os QRS da FA;
- os sem tira (`wellens`).

Os demais `case` do `switch` não são executados enquanto o ritmo tiver tira.
Mudar o `case 'nsr'`, por exemplo, não muda nada na tela.

**A versão está em três lugares**: `package.json`, `classroom.js` (`VERSION`) e
`server-go/main.go` (`/api/info`). O monitor recusa comando de controle com versão
diferente. `tests/manutencao.test.js` exige as três iguais.

**O motor tem cópias fora deste repositório**: `../site-treino-acls/tracados/` e
`../tracados-ecg.zip`. Elas não se atualizam sozinhas.

**Sensores desligados por padrão.** Um teste que confira alarme ou leitura
precisa ligar o sensor antes (`applySet({show:{ecg:true}})` no monitor, ou o
`monitorizado()` de `organization.test.js`). Sem isso, o alarme não toca, e o
teste falha por um motivo que não é o que ele testa.

**A tela do controle não tem teste automático.** Os testes cobrem o envio, a
confirmação e a conexão (`set`, `act`, `onMsg`…), não a montagem da tela.
Mudou a tela? Confira no navegador, em tablet deitado e em celular. Dica: o
monitor pausa quando sai da tela; para testar os dois juntos num navegador só,
abra o controle num `<iframe>` por cima da página do monitor.

## 5. Executar e publicar

Comandos em `README.md`. Publicação, Supabase, limitações e como voltar atrás em
`docs/OPERACAO.md`. O histórico da reorganização de 2.3.2 está em
`evidencias/REORGANIZACAO_ORIGEM.md`.

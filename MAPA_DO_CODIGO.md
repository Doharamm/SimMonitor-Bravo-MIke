# Mapa do código — SimMonitor 2.3.2 reorganizado

Esta é a versão `2.3.2-codex.20260920`, extraída da revisão `revisao-codex-2026-09-19`. Esta pasta é autônoma para os testes da aplicação e a build; não depende da pasta anterior.

A reorganização mantém o protocolo, os dados, o layout e as regras da 2.3.2. Não altera decisões clínicas, Vercel ou Supabase. O executável local pode ser recriado como `BravoMike-SimMonitor-2.3.2.exe`; não está incluído no ZIP.

## 1. Estrutura e responsabilidades

`public/` é a fonte do aplicativo. Edite ali. `server-go/public/` e `web/dist/` são cópias geradas; editar essas pastas perde a alteração no próximo preparo.

| Arquivo ou grupo | Responsabilidade |
| --- | --- |
| `public/index.html`, `monitor.html`, `controle.html` | Entrada, estrutura das páginas, botões e diálogos estáticos. |
| `public/js/monitor.js` | Coordenação da simulação: estado vivo, comandos, transições, terapias, cancelamentos, etapas, persistência, atualização do monitor. |
| `public/js/controle.js` | Conexão do instrutor, envio e confirmação dos comandos, ajustes pendentes, abas, sinais, terapia e exames do controle. |
| `public/js/engine.js` | Geração dos sinais, eventos de batimento, captura elétrica, artefatos de choque/RCP, pleth, capnografia e respiração. |
| `public/js/dart-data.js` | Amostras e metadados dos traçados aprovados. Preservado integralmente. |
| `public/js/dart-player.js`, `ecg-shapes.js` | Reprodução das amostras e componentes sintéticos usados pelo motor. |
| `public/js/trace-renderer.js` | Desenho no canvas: varredura, limpeza, redimensionamento e marcadores de sincronismo. Recebe a função que fornece o sinal. |
| `public/js/simulation-state.js` | Estado inicial, saneamento de comandos, restauração, composição cumulativa de etapas, pulso, tempo e lista de atividades interrompidas. |
| `public/js/simulation-clock.js` | Relógio monotônico e temporizadores que congelam na pausa. |
| `public/js/simulation-config.js` | Limites/nomes/unidades dos sinais, energias, limites do marcapasso, intervalos de PNI, sinais iniciais e predefinições. |
| `public/js/rhythm-catalog.js` | Nomes e grupos de ritmos, frequência típica e pulso padrão. Não contém curvas. |
| `public/js/scenario-catalog.js` | Textos dos casos, valores prescritos, etapas, transições e gatilhos de avanço. Registro compartilhado de casos. |
| `public/js/controller-cases.js` | Lista de casos, confirmação de troca e apresentação das etapas no controle. Recebe `getState()` para sempre consultar o estado atual. |
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
| `public/js/exams.js`, `case-exams.js` | Catálogo das 57 imagens e associações específicas a cada etapa. |
| `public/js/exam-search.js`, `exam-viewer.js`, `monitor-exams.js` | Busca, apresentação/zoom/foco e seletor de exames do monitor. O seletor do controle permanece em `controle.js`. |
| `public/js/history.js`, `debrief-export.js` | Histórico e exportação paginada, vinculada à sessão. |
| `public/js/clinical-review.js` | Fontes e histórico da revisão documental dos casos. Não representa aprovação clínica humana. |
| `public/js/config.js` | Configuração do transporte remoto. Não foi alterado. A chave é publicável e não autentica o instrutor. |
| `supabase/migrations/` | Salas, participantes, chaves públicas, RPCs de autorização e políticas do canal privado. |
| `public/js/shared.js` | Reexporta os mesmos 20 nomes anteriores para compatibilidade. Não adicione lógica aqui; edite os módulos de origem. |
| `public/css/base.css` | Fontes, cores e estilos compartilhados. |
| `public/css/monitor.css`, `monitor-scenario-controls.css`, `controle.css` | Layout específico das telas. Todos preservados nesta reorganização. |
| `server-go/main.go` | Servidor local, salas, identidades vinculadas às conexões, limites e distribuição das mensagens. |
| `scripts/`, `web/build.mjs` | Prévia, geração local e auditorias. |
| `tests/`, `server-go/main_test.go` | Testes automatizados. |
| `reference/dart-originals/`, `public/tracados.html` | Referências visuais e galeria de conferência; a galeria não entra no executável/site gerado. |
| `evidencias/` | Relatórios de origem, proveniência e imagens do layout aprovado. |
| `auditoria/` | Criada ao executar testes de navegador. Os backups antigos não estão no ZIP. |

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
| Valor inicial de sinal | `simulation-config.js`: `DEFAULT_VITALS`. Ex.: `hr`. `defaultState()` faz cópia para não alterar os valores iniciais durante a aula. |
| Predefinição normal/choque/hipóxia/hipertensão | `simulation-config.js`: `VITAL_PRESETS`. A predefinição normal compartilha os mesmos valores iniciais. |
| Passo das setas, limites e unidade de sinal | `simulation-config.js`: `VITAL_DEFS`. Ex.: `etco2.step`. O controle e as validações usam essa definição. |
| Atalhos de EtCO₂ e seus rótulos | `controle.js`: `buildVitals()`, botões `data-etco2`. A reativação da curva/ventilação permanece em `setVitals()`. |
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
| Sons e volumes | `monitor-audio.js`. Abertura por gesto do usuário, pausa/retomada do contexto e preferência de silêncio permanecem no monitor. |
| Carga, choque e sincronismo | `monitor.js`: `charge()`, `disarm()`, `shock()`, `deliverShock()`, `cancelSync()` e conferência dos eventos em `frame()`. Efeito sobre o sinal: `engine.js`. |
| Marcapasso e RCP | `engine.js` para sinais/captura; `monitor.js` para aplicação, registro e avanço do caso. Captura elétrica não deve ser confundida com pulso. |
| Pausa e cronômetro | `simulation-clock.js` e `monitor.js`: `pauseSimulation()`, `timerAction()`. O controle recebe tempo acumulado, não calcula diferença entre relógios dos aparelhos. |
| Reconexão e autorização | `transport.js`, `session.js`, recepção em `monitor.js`/`controle.js`, identidade do socket em `server-go/main.go`. No modo online: `online-room.js` e a migração em `supabase/migrations/`. Não altere campos do protocolo em apenas uma ponta — o envelope `auth` cobre a mensagem inteira. |
| Quem autoriza ou revoga um controle | `monitor.js`: `autorizarControle()`, `revogarControle()`, `sincronizarSala()`. No banco, a RPC `sim_definir_situacao`. No modo online a fila de pendentes vem da sala, não da rede. |

Exemplos de fluxo de edição:

1. **Trocar a orientação escrita de uma etapa:** edite só `nota` em `scenario-catalog.js`; rode `npm test`; confira a etapa no controle. Uma correção clínica exige revisão própria.
2. **Mudar o tamanho de um botão:** localize seu `id`/classe no HTML e ajuste o CSS da tela correspondente; confira desktop e as três larguras móveis. Não mova regras de terapia para o evento de clique.
3. **Ajustar uma predefinição:** edite `VITAL_PRESETS`; confirme o comando recebido e se a duração de transição escolhida foi respeitada. Não altere o estado inicial sem intenção explícita.
4. **Mudar regra de choque:** comece pelos testes de SINC, troca de etapa, pausa e callbacks antigos em `regression.test.js`. Preserve o cancelamento ao mudar de etapa/ritmo, desligar SINC, ocultar a tela e reiniciar.

## 4. Execução, publicação e restauração neste pacote

Use `LEIA-ME.md` para os comandos portáteis. O modo online foi concluído nesta entrega: o roteiro de publicação, os limites conhecidos e o procedimento de retorno estão em `ENTREGA_PARA_REVISAO.md`. `PUBLICACAO_VERCEL_SUPABASE.md` continua como a especificação que originou o trabalho.

Guarde o ZIP e seu SHA-256. `npm run verify:delivery` confere os arquivos recebidos; para restaurar, descompacte o ZIP original em uma pasta nova. O histórico completo da reorganização e suas limitações está em `evidencias/REORGANIZACAO_ORIGEM.md`. As referências a backups/caminhos nesse relatório pertencem à máquina de origem.

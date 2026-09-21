# Mapa do código — SimMonitor 2.3.2 reorganizado

Esta é a versão ativa deste checkout: `revisao-codex-2026-09-19`, versão `2.3.2-codex.20260920`. A pasta acima contém uma entrega anterior. As datas e contagens dos documentos históricos não identificam a versão atual.

A reorganização mantém o protocolo, os dados, o layout e as regras da 2.3.2. Não altera decisões clínicas, Vercel ou Supabase. O executável atual continua sendo `BravoMike-SimMonitor-2.3.2.exe`.

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
| `public/js/transport.js` | Detecção local/demo/online, envio imediato e reconexão. Não guarda comandos para reenviar depois. |
| `public/js/session.js` | Concessões temporárias para comandos, rejeição de repetição, presença de monitores e relógio remoto. |
| `public/js/state-validation.js` | Validação estrita do estado recebido pelo controle. Não equivale ao saneamento de comandos. |
| `public/js/exams.js`, `case-exams.js` | Catálogo das 57 imagens e associações específicas a cada etapa. |
| `public/js/exam-search.js`, `exam-viewer.js`, `monitor-exams.js` | Busca, apresentação/zoom/foco e seletor de exames do monitor. O seletor do controle permanece em `controle.js`. |
| `public/js/history.js`, `debrief-export.js` | Histórico e exportação paginada, vinculada à sessão. |
| `public/js/clinical-review.js` | Fontes e histórico da revisão documental dos casos. Não representa aprovação clínica humana. |
| `public/js/config.js` | Configuração do transporte remoto. Não foi alterado. |
| `public/js/shared.js` | Reexporta os mesmos 20 nomes anteriores para compatibilidade. Não adicione lógica aqui; edite os módulos de origem. |
| `public/css/base.css` | Fontes, cores e estilos compartilhados. |
| `public/css/monitor.css`, `monitor-scenario-controls.css`, `controle.css` | Layout específico das telas. Todos preservados nesta reorganização. |
| `server-go/main.go` | Servidor local, salas, identidades vinculadas às conexões, limites e distribuição das mensagens. |
| `scripts/`, `web/build.mjs` | Prévia, geração local e auditorias. |
| `tests/`, `server-go/main_test.go` | Testes automatizados. |
| `reference/`, `public/tracados.html` | Referências visuais e galeria de conferência; a galeria não entra no executável/site gerado. |
| `auditoria/` | Cópias históricas, relatórios e evidências. Não é código servido ao usuário. |

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

O grafo exato dos imports está em `auditoria/refatoracao-preservacao.json`, campo `dependencies`.

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
| Reconexão e autorização | `transport.js`, `session.js`, recepção em `monitor.js`/`controle.js`, identidade do socket em `server-go/main.go`. Não altere campos do protocolo em apenas uma ponta. |

Exemplos de fluxo de edição:

1. **Trocar a orientação escrita de uma etapa:** edite só `nota` em `scenario-catalog.js`; rode `npm test`; confira a etapa no controle. Uma correção clínica exige revisão própria.
2. **Mudar o tamanho de um botão:** localize seu `id`/classe no HTML e ajuste o CSS da tela correspondente; confira desktop e as três larguras móveis. Não mova regras de terapia para o evento de clique.
3. **Ajustar uma predefinição:** edite `VITAL_PRESETS`; confirme o comando recebido e se a duração de transição escolhida foi respeitada. Não altere o estado inicial sem intenção explícita.
4. **Mudar regra de choque:** comece pelos testes de SINC, troca de etapa, pausa e callbacks antigos em `regression.test.js`. Preserve o cancelamento ao mudar de etapa/ritmo, desligar SINC, ocultar a tela e reiniciar.

## 4. Executar e testar

Execute a partir da pasta deste documento:

```powershell
npm run preview                 # 127.0.0.1:8799; demo em abas do mesmo navegador
npm test                        # testes JavaScript
npm run test:browser             # fluxos locais em modo demonstração
npm run test:local               # executável local, autorização e reconexão
npm run audit:refactor           # compara com a cópia 2.3.2 anterior à reorganização
go -C server-go test ./...       # servidor Go
```

Se `npm` não estiver no PATH, os equivalentes são `node scripts/preview.mjs`, `node --test tests/*.test.js`, `node scripts/audit-browser.cjs`, `node scripts/audit-browser.cjs --local` e `node scripts/audit-refactor.mjs`.

URLs da prévia: `http://127.0.0.1:8799/monitor.html?modo=demo&sala=4321` e `http://127.0.0.1:8799/controle.html?modo=demo&sala=4321`. Autorize o controle no monitor. A prévia não equivale à conexão de um celular na rede.

Para gerar os arquivos locais e recompilar o executável:

```powershell
node scripts/prepare-go.mjs
node web/build.mjs
go -C server-go build -buildvcs=false -o ../BravoMike-SimMonitor-2.3.2.exe .
node scripts/audit-integrity.mjs
```

Esses comandos não publicam. `audit-integrity` também atualiza o manifesto da entrega; não é apenas uma consulta.

Nesta máquina, os testes usaram o Go em `.tools/go/bin/go.exe`, com `GOCACHE` e `GOMODCACHE` apontando para `.tools/gocache` e `.tools/gomod`. O teste de navegador usa Playwright já disponível no ambiente, selecionado por `PLAYWRIGHT_MODULE`, e Edge instalado. Não foi adicionada dependência ao projeto. Configure essa variável com o caminho do módulo Playwright existente ao repetir em um ambiente sem resolução padrão.

### Verificação proporcional

| Mudança | Verificação mínima sugerida |
| --- | --- |
| Catálogos/estado/limites | `node --test tests/classroom.test.js tests/regression.test.js tests/organization.test.js` |
| Motor/traçados | `node --test tests/dart-waveforms.test.js tests/regression.test.js`; comparação `node scripts/audit-engine.mjs`; galeria visual |
| Exportação | `node --test tests/debrief-export.test.js` |
| Interface, gesto móvel ou import novo | Testes pertinentes + `node scripts/audit-browser.cjs` |
| Rede, autorização, reconexão ou assets do executável | Preparar, recompilar, testar Go e executar `node scripts/audit-browser.cjs --local` |

`audit-refactor` é uma comparação histórica: uma mudança futura intencional em layout, catálogo ou regra pode fazê-lo falhar legitimamente. Não atualize a cópia antiga para fazê-lo passar; registre a nova mudança e seu próprio ponto de restauração.

## 5. Restauração verificável

A cópia anterior está em `auditoria/antes-refatoracao-2.3.2/`. Inclui fontes, testes, assets gerados e o executável anterior. São 358 arquivos, com hashes em `RESTAURACAO_SHA256.json`. Não inclui ferramentas `.tools`, evidências históricas nem executáveis de versões mais antigas; esses itens permanecem nos locais originais.

Para conferir somente a cópia, sem depender do código reorganizado:

```powershell
$backupPath = Join-Path (Get-Location) 'auditoria/antes-refatoracao-2.3.2'
$manifest = Get-Content -LiteralPath (Join-Path $backupPath 'RESTAURACAO_SHA256.json') -Raw | ConvertFrom-Json
foreach ($entry in $manifest.files) {
  $actual = (Get-FileHash -Algorithm SHA256 -LiteralPath (Join-Path $backupPath $entry.file)).Hash
  if ($actual -ne $entry.sha256) { throw "Cópia divergente: $($entry.file)" }
}
```

Para voltar à versão anterior sem sobrescrever o trabalho atual:

1. Faça a conferência acima.
2. Copie `auditoria/antes-refatoracao-2.3.2` para uma nova pasta vazia fora de `public/`.
3. Abra o `BravoMike-SimMonitor-2.3.2.exe` dessa cópia, ou execute a prévia a partir dela. Os arquivos já estão prontos; não precisa recompilar para usar o executável preservado.

## 6. Decisões da reorganização e limites

Foram criados nove módulos com responsabilidade explícita. `shared.js` virou uma fachada de compatibilidade. Os consumidores da aplicação importam os módulos de origem. Limites de marcapasso/PNI, predefinição normal, formatação de sinais e lista de interrupções passaram a ter uma definição compartilhada.

Não se unificaram regras apenas por semelhança: saneamento, restauração e validação de estado têm finalidades distintas; passo de energia do monitor e do controle mantém suas regras anteriores; captura elétrica e perfusão continuam separadas. Foram removidos somente imports/funções locais substituídos por suas definições compartilhadas, após conferir referências.

`monitor.js` ainda coordena terapias, transições e etapas. Esses blocos compartilham gerações de cancelamento, autoria do histórico, timers e estado. Separá-los agora exigiria uma interface ampla sem benefício proporcional. O motor sintético e seus ramos de alternativa também foram mantidos: não se tratou o uso predominante de DartSim como prova suficiente para apagar caminhos existentes.

Relatório desta rodada: `REORGANIZACAO_DO_CODIGO.md`. Evidências: `auditoria/refatoracao-*`, `auditoria/browser-depois/` e `auditoria/browser-local/`.

As verificações locais não demonstram validação clínica, áudio ouvido por uma pessoa, celulares físicos, Safari/iOS ou Wi-Fi real entre aparelhos. A reprodução proporcional dos traçados e as limitações de procedência documentadas anteriormente permanecem. Nada foi alterado nos serviços Vercel/Supabase.

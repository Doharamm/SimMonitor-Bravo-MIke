# Reorganização do SimMonitor 2.3.2

O código foi separado por responsabilidade, com preservação do comportamento verificada por testes e comparação com uma cópia anterior. A versão ativa é esta subpasta `revisao-codex-2026-09-19`, identificada por `package.json`, `classroom.js`, servidor Go e `LEIA-ME.md`.

## Inspeção e plano executado

Antes de editar, foram examinados os documentos de entrega e das revisões, fontes das duas telas, motor, comunicação, relógio, casos/exames, servidor, scripts de geração e testes. As instruções históricas que mencionam 84 ou 122 testes descrevem entregas anteriores. A base desta rodada tinha 138 testes JavaScript.

| Constatação | Tratamento |
| --- | --- |
| `shared.js` misturava catálogo clínico, valores iniciais, validação e descrição de comandos | Separados em módulos com nomes que indicam onde editar. Mantidos os 20 exports antigos por compatibilidade. |
| `monitor.js` reunia geração sonora, desenho no canvas, cálculo de alarmes e coordenação da aula | Extraídos áudio, desenhista e leitura/alarmes. A coordenação continua explícita no monitor. |
| Limites de marcapasso e intervalos de PNI repetidos nas interfaces e validações | Uma definição compartilhada em `simulation-config.js`, mantendo a diferença entre limitar um comando e rejeitar um estado inválido. |
| Valores normais, formatação numérica e lista de interrupções repetidos | Centralizados. O estado vivo recebe cópia dos valores iniciais. |
| Apresentação de casos misturada com envio/autorização no controle | `controller-cases.js` apresenta e confirma; os comandos continuam usando o mesmo envio autorizado. |
| Partes já estavam separadas adequadamente | Relógio, transporte, concessões de comando, catálogo/visualizador de exames, editor e debrief mantidos. |
| Terapias e avanço de etapa têm cancelamentos compartilhados | Mantidos juntos. Uma separação ampla exigiria transportar muitas referências mutáveis entre módulos. |
| Documentação antiga sugeria apagar ramos sintéticos do motor | Não removidos: preservação do motor aprovado teve prioridade; não houve prova suficiente para eliminar todos os caminhos de alternativa. |
| Estilo compacto e nomes curtos em alguns blocos | Registrado como dificuldade residual. Não se fez reescrita geral por preferência de estilo. |

Etapas realizadas: (1) cópia e testes de referência; (2) separação dos dados/estado/descrições; (3) extração de desenho, áudio e alarmes; (4) centralização de duplicações e interface de casos; (5) comparação de preservação, geração local, testes completos e documentação.

Os 138 testes passaram após a primeira etapa. Os 91 testes de regressão passaram após extrair os blocos do monitor. Os 98 testes de regressão/casos passaram após a centralização. A validação completa foi executada depois dessas etapas.

## Entrega

- Nove módulos novos em `public/js/`, sem framework nem biblioteca nova.
- Módulos existentes atualizados para importar a responsabilidade correta.
- `tests/organization.test.js` com seis testes adicionais para os limites entre módulos.
- `tests/regression.test.js` adaptado para usar os módulos extraídos reais, preservando suas verificações anteriores.
- `scripts/audit-refactor.mjs` e comando `npm run audit:refactor` para comparação reproduzível com a base desta rodada.
- `MAPA_DO_CODIGO.md` com estrutura, dependências, exemplos de edição, comandos e restauração.
- `server-go/public/`, `web/dist/` e `BravoMike-SimMonitor-2.3.2.exe` regenerados localmente. O executável anterior está na cópia de restauração.

| Arquivo de coordenação | Linhas antes | Linhas depois |
| --- | ---: | ---: |
| `monitor.js` | 754 | 643 |
| `controle.js` | 568 | 511 |
| `shared.js` | 406 | 7 |

As linhas foram redistribuídas para tornar as responsabilidades localizáveis. Reduzir a quantidade total de linhas não foi o objetivo. Os módulos novos e as alterações estão listados em `auditoria/refatoracao-alteracoes.json`.

## Preservação e restauração

Antes de editar, foram copiados e conferidos por SHA-256 **358 arquivos**, totalizando **55.433.532 bytes**, para `auditoria/antes-refatoracao-2.3.2/`. O manifesto `RESTAURACAO_SHA256.json` permite conferir cada arquivo, inclusive o executável anterior. A conferência foi repetida ao final.

O layout, todos os HTML/CSS, imagens, referências, motor, amostras de ECG, reprodução DartSim, formas sintéticas, transporte, relógio e sessão não foram alterados nesta rodada. O catálogo de exames e a configuração remota também foram preservados. O script de comparação verifica **119 arquivos protegidos** por hash e os catálogos extraídos por igualdade dos dados.

A entrega anterior da pasta acima continua preservada. `audit-integrity` verifica também essa entrega e a igualdade das cópias geradas. Nenhuma publicação ou alteração de Vercel/Supabase foi feita. A versão e o protocolo foram mantidos porque esta entrega reorganiza a implementação sem mudar o contrato entre as telas.

As instruções de restauração, incluindo a conferência independente dos hashes, estão no mapa. Recomenda-se executar a versão anterior a partir de uma cópia em nova pasta, sem sobrescrever esta entrega.

## Resultados verificados

| Verificação | Resultado e evidência |
| --- | --- |
| Testes JavaScript antes | 138/138; `auditoria/refatoracao-testes-antes.txt`. |
| Testes JavaScript finais | **144/144**; `auditoria/refatoracao-testes-final.txt`. |
| Go | **4/4**: admissão concorrente, sala/isolamento, identidade/resposta privada, preferência de LAN; `auditoria/refatoracao-go-final.txt`. |
| Navegador antes | 21 verificações em demonstração; `auditoria/refatoracao-browser-antes/resultado.json`. |
| Navegador depois | **21 em demonstração + 22 no executável local**; `auditoria/browser-depois/resultado.json` e `auditoria/browser-local/resultado.json`. Nenhum erro JavaScript ou requisição externa nesses fluxos. |
| Telas | Monitor em 1024/1366 px e controle em 320/360/390 px, sem transbordamento horizontal. Screenshots registrados; inspeção visual adicional de monitor e controle. |
| Casos e API | 24 etapas com resultados idênticos e os mesmos 20 exports de `shared.js`. |
| Validação/restauração | 57 conjuntos de entradas válidas/inválidas comparados com a base, sem diferenças. |
| Leituras/alarmes | **3.120 combinações** comparadas com o corpo original, sem diferenças. |
| Desenho | Quatro configurações de canais com comandos de canvas idênticos, incluindo ocultação, retorno da varredura, marcador e redimensionamento. |
| Motor | **156 comparações**, diferença máxima zero no ECG e eventos iguais. Execução simulada de 720 s, sem crescimento indevido dos buffers; `auditoria/refatoracao-motor-final.txt`. Este script também mantém a comparação histórica com a entrega anterior. |
| Arquivos e imports | Hashes do backup e protegidos conferidos; todos os imports locais resolvidos. `auditoria/refatoracao-preservacao.json`. |

Cobertura relevante: comandos expirados/repetidos, sincronização, recargas, controle duplicado, autorização, reconexão, descarte offline, ritmo/FC, pausa, avanço manual/automático, choque/SINC, captura do marcapasso, RCP, capnografia, áudio/mute, exames, cópias de casos e debrief. A reconexão do servidor foi exercitada encerrando e reiniciando o executável Windows. Os testes de áudio verificam geração/controle; não representam audição humana.

## Limitações restantes e decisões separadas

1. Não houve validação em aparelhos físicos, Wi-Fi entre aparelhos, Safari/iOS ou audição humana. A execução local no Edge e a simulação de toque não substituem essas verificações.
2. Não se reavaliou conteúdo clínico nem se alteraram casos, limiares ou rótulos. As ressalvas clínicas e de procedência já documentadas continuam válidas.
3. O motor aprovado mantém a reprodução proporcional à frequência; não há nova alegação de calibração fisiológica.
4. O transporte online permanece com a restrição já existente para comandos. Nenhum serviço remoto foi acessado.
5. `monitor.js` e `controle.js` ainda são os pontos de coordenação das telas. Uma extração futura de terapias deve começar por uma interface pequena de cancelamento/estado e repetir os testes de pausa, sincronismo e callbacks antigos. Não foi criada essa camada apenas para reduzir o tamanho de arquivos.

Não há mudança de comportamento ou decisão clínica proposta como parte desta refatoração. Qualquer alteração desse tipo deve ter escopo e revisão próprios.

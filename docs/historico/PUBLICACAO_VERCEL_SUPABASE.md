# Preparação para Vercel e Supabase

> **Atualização de 21/09/2026.** Este guia foi cumprido. Os dois bloqueios da
> seção 1 foram substituídos por uma autorização com identidade verificável, e
> os critérios da seção 4 viraram testes. **O que você precisa ler agora é
> `ENTREGA_PARA_REVISAO.md`**: ele traz o que mudou, a migração, os resultados
> locais, os testes online que faltam executar, o passo a passo de publicação, as
> limitações e como voltar atrás. O texto abaixo permanece como a especificação
> original do trabalho, sem edições.

**Situação: base local testada; integração online ainda não liberada.** Este guia é uma tarefa de implementação para o Claude, não uma declaração de prontidão para produção.

## 1. Impedimento confirmado no código

| Local | Evidência |
| --- | --- |
| `public/js/monitor.js`, recepção de `cmd` | `transport.mode==='online'` devolve recusa: esta revisão exige servidor local para autorizar controles. |
| `public/js/controle.js`, `unavailableReason()` | Modo online impede o envio e orienta usar o servidor local. |
| `public/js/transport.js`, `startOnline()` | Protocolo Phoenix direto, tópico `realtime:bmsim-<sala>`, `private: false`, sem autenticação individual de usuário implementada. |
| `server-go/main.go` | No modo local, a identidade e o papel ficam vinculados ao socket. Esse servidor não participa do site estático gerado para a Vercel. |

O botão de autorizar no monitor e as concessões temporárias de `session.js` são necessários, mas não substituem uma identidade remota confiável. Um participante autorizado também não pode conseguir fingir ser outro controle ou o monitor alterando campos da mensagem.

## 2. Trabalho de Supabase

1. Verifique o projeto de destino e o modelo atual de autenticação. O `config.js` aponta para o projeto recebido na origem; URL, chave e permissões não foram validadas remotamente nesta entrega. Não há migrações de backend na base recebida.
2. Defina o ciclo de vida da sala, quem pode criar/autorizar/revogar e como cada dispositivo recebe uma identidade verificável. Mantenha a experiência simples de monitor e controle já aprovada. Caso uma decisão dependa da forma de acesso dos alunos/instrutores, peça somente essa informação.
3. Implemente uma autorização que restrinja leitura e envio por sala e papel. Se usar canais privados, prepare políticas específicas e autenticação compatível. A autorização de um canal não demonstra, por si só, que o conteúdo `from`/`role` de cada payload é verdadeiro; comprove essa ligação por desenho e testes.
4. Teste revogação, expiração e reconexão. Permissões de Realtime são mantidas em cache da conexão e reavaliadas na entrada/atualização de token; considere esse comportamento no mecanismo de revogação. [Documentação de Realtime Authorization](https://supabase.com/docs/guides/realtime/authorization).
5. Entregue as migrações e a configuração reproduzível. Preserve recursos existentes que não pertençam ao SimMonitor. O schema gerenciado `realtime` tem restrições; as políticas em `realtime.messages` continuam sendo o mecanismo documentado. [Mudança de 14/07/2026](https://supabase.com/changelog/realtime-schema-locked-down-against-modification).

O site atual não usa banco para armazenar casos: cópias e histórico ficam no navegador. Não migre esse armazenamento como efeito colateral da integração. Qualquer tabela necessária para autorização deverá ter acesso restrito conforme a associação à sala.

`public/js/config.js` já é entregue ao navegador. Variáveis configuradas no painel da Vercel **não são injetadas automaticamente** pelo `web/build.mjs` atual: ele apenas copia `public/`. Se decidir usar variáveis de build, implemente essa leitura e a validação, mantendo apenas valores publicáveis no arquivo resultante.

## 3. Configuração da Vercel incluída

O `vercel.json` define o projeto como estático, executa `npm run build:web` e usa `web/dist` como saída. A raiz do projeto deve ser esta pasta, onde estão `package.json` e `vercel.json`. [Referência de configuração da Vercel](https://vercel.com/docs/project-configuration/vercel-json).

`cleanUrls` fica `false` para preservar `/monitor.html` e `/controle.html`. O transporte identifica o papel a partir do nome da página. URLs sem extensão precisam ser tratadas explicitamente no código antes de mudar essa opção. A Vercel pode redirecionar extensões quando `cleanUrls` é ativado. [Comportamento documentado](https://vercel.com/docs/project-configuration/vercel-json#cleanurls).

A `.vercelignore` exclui evidências, referências, testes e servidor Go do upload da build estática. Nenhum desses diretórios entra em `web/dist`, que recebe somente os arquivos públicos e exclui a galeria de traçados.

Antes da primeira publicação, confirme no projeto existente: diretório raiz, build/saída, regras de URL e cache, domínio e eventuais configurações que sobreponham o esperado. Não inclua reescrita geral de todas as rotas para `index.html`: as duas páginas são arquivos reais e módulos inexistentes precisam retornar erro, não HTML.

O `/api/info` é um recurso do servidor local/prévia. Ele não é gerado na build estática. Seu 404 na Vercel é compatível com a detecção atual; não crie uma rota que finja a presença do servidor Go. `?modo=demo` continua sendo somente demonstração no mesmo navegador.

## 4. Critérios de aceite online

| Teste | Resultado obrigatório |
| --- | --- |
| Monitor e controle em navegadores/dispositivos distintos | Mesma sala com estado atual, autorização explícita e confirmação de comando. |
| Controle sem autorização | Não consegue alterar estado nem executar terapia. |
| Outra sala | Não recebe estado nem consegue enviar comandos à sala alvo. |
| Identidade/papel falsificado | Campos `from`, `role`, `to` e identidade de monitor não permitem assumir outro participante. |
| Revogação, token vencido, recarga e reconexão | Acesso segue o ciclo de autorização definido; controles antigos não recuperam poderes indevidamente. |
| Comando repetido, atrasado ou de caso anterior | Recusado, sem executar efeito tardio. |
| Falha de rede durante ajuste/choque | Nenhum comando é enfileirado e aplicado ao voltar. |
| Duas abas de monitor | Conflito detectado; comandos bloqueados até resolver. |
| Estado e terapias | Ritmo/FC, pausa/retomada, etapas, choque/SINC, marcapasso, RCP e capnografia preservados. |
| Áudio e exames | Mute sincronizado, início por gesto válido, exames corretos e sem perda da simulação. |
| Móvel e aba oculta | Comandos acessíveis, rolagem não altera valores, ocultação pausa e exige retomada conforme a regra atual. |
| Falha de integração | Modo local Go e demonstração continuam passando nos testes. |

O teste de navegador atual (`scripts/audit-browser.cjs`) bloqueia requisições externas por desenho. Não é uma suíte online. Para validar Supabase, adicione uma suíte própria com destinos controlados e contextos separados, mantendo as verificações locais.

## 5. Saída esperada do Claude

Um pacote atualizado com código, migrações, configurações, testes e `ENTREGA_PARA_REVISAO.md`. Informe quais testes foram executados de fato em Supabase/Vercel e quais só localmente. Para a publicação pelo usuário, descreva a ordem de aplicação, como validar as duas telas e como retornar à versão anterior se falhar.

As referências oficiais acima foram consultadas para preparar este roteiro em 21/09/2026. Confira atualizações antes de implementar. Nesta rodada, nenhum projeto remoto foi inspecionado ou modificado; a consulta foi somente à documentação pública.

# SimMonitor 2.3.2 — entrega para o Claude

> **Documento histórico (20/09/2026).** Descreve o pedido que originou a versão
> `2.3.3-online.20260921`. O modo online foi concluído; leia
> `ENTREGA_PARA_REVISAO.md` para o estado atual e o roteiro de publicação.

**Pronto para continuar o desenvolvimento e preparar a publicação. O controle online ainda precisa ser concluído.**

Esta é a versão final da reorganização: `2.3.2-codex.20260920`. Os arquivos da aplicação e os 144 testes JavaScript foram copiados sem alteração da versão revisada. Nada foi publicado nesta entrega.

## Para enviar

1. Anexe o ZIP `SimMonitor-2.3.2-para-Claude.zip` ao Claude.
2. Cole o conteúdo de `PROMPT_PARA_CLAUDE.txt` na conversa.
3. Peça a entrega das alterações e dos resultados de teste antes de você publicar.

## Por onde começar

| Arquivo | Quando ler |
| --- | --- |
| `CLAUDE.md` | Primeiro: escopo, ordem de trabalho e critérios de conclusão. |
| `PUBLICACAO_VERCEL_SUPABASE.md` | Antes de mexer no modo online ou configurar a publicação. Contém o impedimento atual e os testes necessários. |
| `MAPA_DO_CODIGO.md` | Para localizar código, casos, textos, botões, sons e regras. |
| `LEIA-ME.md` | Para executar e testar esta pasta após descompactar. |
| `evidencias/` | Resultados da revisão anterior, comparações e imagens do layout aprovado. São evidências locais, não testes da nuvem. |
| `ENTREGA_SHA256.json` | Manifesto dos arquivos deste pacote. Execute `npm run verify:delivery` antes de editar. |

## O que está preservado

Layout, casos, traçados, velocidades, áudio, terapias e proteções existentes. Os testes da reorganização registram 144 aprovações JavaScript, 4 Go e 43 verificações de navegador. O relatório `VALIDACAO_DO_PACOTE.md` distingue esses resultados dos testes executados nesta pasta portátil.

## O que falta para a nuvem

`monitor.js` e `controle.js` recusam comandos online. O transporte remoto existente usa um canal público. O Claude deverá concluir a autorização remota e testar o isolamento entre salas e a autenticidade das mensagens. Publicar somente os arquivos estáticos não resolve essa pendência.

O Supabase será usado pela comunicação/autorização; os arquivos do site serão servidos pela Vercel. Esta entrega contém `vercel.json` para a build estática, mas não contém uma migração de Supabase pronta nem afirma que o projeto remoto foi verificado.

## Organização do pacote

As fontes estão em `public/`; testes em `tests/`; servidor local em `server-go/`; geração do site em `web/`. O executável, `web/dist/` e `server-go/public/` são recriados pelos comandos documentados. Backups antigos, ferramentas `.tools` e arquivos temporários ficaram fora do ZIP.

Guarde o ZIP e seu SHA-256 antes de editar: eles são o ponto de restauração desta entrega. A cópia anterior à reorganização continua na máquina de origem, em `revisao-codex-2026-09-19/auditoria/antes-refatoracao-2.3.2/`.

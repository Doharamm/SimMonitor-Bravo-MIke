# SimMonitor 2.3.3 — pacote portátil

Comece por `ENTREGA_PARA_REVISAO.md`: é o que descreve a versão atual, o modo
online concluído e o passo a passo para publicar. `COMECE_AQUI.md`, `CLAUDE.md` e
`PUBLICACAO_VERCEL_SUPABASE.md` são os documentos da entrega anterior e
descrevem o pedido, não o resultado.

## Executar

Na pasta onde está este arquivo, com Node.js moderno instalado (esta entrega foi conferida com Node 24.19.0):

```sh
node scripts/verify-delivery.mjs
node --test tests/*.test.js
node scripts/preview.mjs
```

Monitor: `http://127.0.0.1:8799/monitor.html?modo=demo&sala=4321`

Controle: `http://127.0.0.1:8799/controle.html?modo=demo&sala=4321`

Abra as duas páginas no mesmo navegador e autorize o controle no monitor. Para parar a prévia, use Ctrl+C no terminal.

## Gerar o site

```sh
npm run build:web
```

Sem npm: `node web/build.mjs`. A saída é `web/dist/`. Esta build gera arquivos locais e não publica nada.

## Modo online

O modo online exige a migração em `supabase/migrations/` aplicada e duas
configurações no painel do Supabase (login anônimo ligado, acesso público do
Realtime desligado). O roteiro completo está em `ENTREGA_PARA_REVISAO.md`.

Para conferir a autorização online contra o projeto de verdade — **este comando
escreve no Supabase**:

```sh
node scripts/audit-online.mjs --confirmo
```

## Servidor local opcional

Com Go instalado:

```sh
node scripts/prepare-go.mjs
go -C server-go test ./...
go -C server-go build -buildvcs=false -o ../BravoMike-SimMonitor-2.3.2.exe .
```

O último comando gera um executável Windows quando executado com Go para Windows. Em outros sistemas, use o formato/nome apropriado; o teste `--local` desta base espera o `.exe` Windows. O modo local serve o monitor/controle na rede e conserva a autorização do instrutor.

## Testes de navegador

`npm run test:browser` usa Playwright e Edge instalados no ambiente. Se o módulo Playwright não estiver na resolução padrão do Node, defina `PLAYWRIGHT_MODULE` com o caminho completo do módulo existente. Não há dependência de produção adicionada.

`npm run test:local` exige primeiro preparar e compilar o executável Windows acima. Os testes geram relatórios em `auditoria/`. O parâmetro histórico `--baseline` depende da entrega anterior fora desta pasta e não é suportado pelo pacote portátil; use os relatórios preservados em `evidencias/` para comparação anterior.

## Integridade e histórico

`npm run verify:delivery` verifica todos os arquivos do manifesto inicial. Após alterações intencionais, ele deve apontar os arquivos modificados; mantenha o manifesto/ZIP como referência recebida e produza um novo manifesto para a próxima entrega.

Os comandos históricos `audit:refactor` e `audit:integrity` da máquina de origem dependem de backups externos ao pacote. Seus scripts e resultados foram arquivados em `evidencias/`; não foram expostos como comandos portáteis que falhariam por arquivos ausentes. Os cinco arquivos de testes JavaScript e suas verificações foram preservados integralmente.

O código da aplicação, imagens e referências vieram da versão reorganizada. Os ajustes de empacotamento estão em `VALIDACAO_DO_PACOTE.md`. O mapa tem a estrutura e exemplos de onde editar.

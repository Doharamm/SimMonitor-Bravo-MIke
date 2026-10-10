# SimMonitor — Bravo Mike

Monitor multiparamétrico para simulação de urgência e emergência. Duas telas que
conversam entre si: o **monitor**, projetado para a turma, e o **controle**, no
celular ou tablet do instrutor.

No ar em https://bravomike-simmonitor.vercel.app

## Três modos de uso

| Modo | Quando | Como conversam |
| --- | --- | --- |
| **Online** | turma com internet | Supabase Realtime, canal privado por sala |
| **Local** | sala sem internet | servidor Go no notebook, pelo Wi-Fi |
| **Demonstração** | conferir sozinho | duas abas do mesmo navegador |

## Documentação

| Arquivo | Para quê |
| --- | --- |
| [MAPA_DO_CODIGO.md](MAPA_DO_CODIGO.md) | Onde mexer em cada coisa, e as armadilhas do projeto |
| [docs/OPERACAO.md](docs/OPERACAO.md) | Publicação, Supabase, limitações conhecidas e como voltar atrás |
| [docs/CASOS.md](docs/CASOS.md) | Como um caso clínico é montado |
| [docs/CATALOGO.md](docs/CATALOGO.md) | Ritmos, sinais e exames disponíveis para os casos |
| [CLAUDE.md](CLAUDE.md) | Regras de trabalho para o Claude neste projeto |
| `docs/historico/` | Documentos de entregas anteriores, guardados como registro |

## Rodar e testar

Requer Node.js moderno (conferido com o 24). Não há dependências para instalar.

```sh
npm test                 # testes automatizados
npm run preview          # prévia local em modo demonstração
npm run build:web        # gera web/dist, que é o que a Vercel publica
```

Na prévia, abra no mesmo navegador:

- Monitor: `http://127.0.0.1:8799/monitor.html?modo=demo&sala=4321`
- Controle: `http://127.0.0.1:8799/controle.html?modo=demo&sala=4321`

Autorize o controle no monitor. Ctrl+C no terminal encerra.

### Modo online

```sh
npm run preview:online             # prévia contra o Supabase de verdade
npm run test:online -- --confirmo  # suíte de aceite online — ESCREVE no Supabase
```

### Servidor local (Go)

```sh
npm run prepare:go
go -C server-go test ./...
go -C server-go build -o ../BravoMike-SimMonitor.exe .
```

### Testes de navegador

`npm run test:browser` e `npm run test:local` usam Playwright com Edge. Se o
Playwright não estiver na resolução padrão do Node, defina `PLAYWRIGHT_MODULE`
com o caminho do módulo. O `test:local` exige o executável Go já compilado. Os
relatórios saem em `auditoria/`.

## Princípios

- `public/` é a fonte. `web/dist/` e `server-go/public/` são cópias geradas e
  ficam fora do repositório.
- Sem framework e sem dependência de produção: JavaScript nativo e APIs do
  navegador. O servidor local usa Go com `gorilla/websocket`.
- O monitor é a autoridade sobre o estado. O controle pede; o monitor decide e
  confirma.

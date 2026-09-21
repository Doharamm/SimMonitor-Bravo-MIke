# SimMonitor — Bravo Mike

Monitor multiparamétrico para simulação de urgência e emergência. Duas telas que
conversam entre si: o **monitor**, projetado para a turma, e o **controle**, no
celular do instrutor.

Versão `2.3.3-online.20260921`.

## Três modos de uso

| Modo | Quando | Como conversam |
| --- | --- | --- |
| **Online** | turma com internet | Supabase Realtime, canal privado por sala |
| **Local** | sala sem internet | servidor Go no notebook, pelo Wi-Fi |
| **Demonstração** | conferir sozinho | duas abas do mesmo navegador |

## Comece por aqui

- **[ENTREGA_PARA_REVISAO.md](ENTREGA_PARA_REVISAO.md)** — o que existe hoje,
  resultados de teste, publicação, limitações e como voltar atrás.
- [MAPA_DO_CODIGO.md](MAPA_DO_CODIGO.md) — onde mexer em cada coisa.
- [LEIA-ME.md](LEIA-ME.md) — comandos para rodar e testar.

## Comandos

```sh
npm test                 # 178 testes locais
npm run preview          # prévia em modo demonstração
npm run preview:online   # prévia em modo online (exige o Supabase preparado)
npm run build:web        # gera web/dist, que é o que a Vercel publica
npm run verify:delivery  # confere os arquivos por SHA-256
```

Não há dependências de produção: JavaScript nativo e APIs do navegador. O
servidor local usa Go com `gorilla/websocket`.

## Publicação

A Vercel constrói com `npm run build:web` e publica `web/dist`. A configuração
está em `vercel.json`. O modo online exige a migração de `supabase/migrations/`
aplicada e duas configurações no painel do Supabase — tudo descrito em
`ENTREGA_PARA_REVISAO.md`, seção 5.

## Preservação

`public/` é a fonte. `web/dist/` e `server-go/public/` são cópias geradas pelos
scripts e não entram no repositório. Traçados, casos, terapias e layout são
verificados por testes automatizados antes de qualquer alteração.

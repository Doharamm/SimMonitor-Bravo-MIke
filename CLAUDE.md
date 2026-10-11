# Como trabalhar neste projeto

SimMonitor: monitor multiparamétrico para aulas de urgência e emergência da
Bravo Mike. Comece por `MAPA_DO_CODIGO.md` (onde mexer e armadilhas) e
`docs/OPERACAO.md` (o que está no ar e como voltar atrás).

## Estado atual

- Modo online concluído e publicado em https://bravomike-simmonitor.vercel.app.
- **Controle novo implementado** (outubro de 2026) a partir do protótipo
  aprovado com o usuário: https://claude.ai/artifact/4YnRLGxkjPVdrcYQJkfue1 .
  Mudanças de tela do controle: proponha no protótipo primeiro se forem grandes.
- Decisões do controle novo: painel único no tablet deitado, abas no celular
  (sinais → ritmo → terapia → caso), sliders verticais com ±, tema claro por
  padrão, sensores começam desligados e voltam a desligar a cada caso novo, FR
  acompanha o oxímetro, PNI na coluna da PA (recusada sem manguito, ~7,5 s, com
  som de manguito no monitor), atalhos de EtCO₂ mostram o limiar do protocolo.
- Decisões de outubro de 2026: etapas do caso **não ligam a RCP** (é o aluno
  quem pede; a etapa só mantém a que estiver em andamento); limiar de captura
  do marcapasso padrão em 15 mA (pedido do usuário); controle entra pelo QR sem
  "Autorizar"; monitor tem atalhos próprios (Ritmo, ECG, Raio-X); galeria de
  exames com o exame do caso marcado e um compatível (normal) para o aluno que
  pedir fora do tema.
- Tudo deve poder ser conduzido só pelo monitor, sem celular: clique no número
  para digitar o valor (liga o sensor), Ritmo escolhido no monitor liga o ECG e
  vale com a simulação pausada; o mesmo campo desliga o sensor; o botão Casos
  do monitor escolhe o caso (carrega pausado, play começa).
- "Zerar tudo" no topo do monitor e do controle (vale pausado). Fora de caso, a
  galeria de ECG já escolhe o ECG compatível com o ritmo (`ECG_POR_RITMO`); sem
  compatível, só avisa. Na tela projetada o aviso não diz o nome do ritmo.

## Conversando com o usuário

- Português simples, sem jargão técnico. Quando ele responde "não entendi",
  reexplique com exemplo concreto ou mostre um desenho, não repita a pergunta.
- **Decisões clínicas são dele.** Valores de caso, limiares, frequências e
  rótulos clínicos: proponha, explique o porquê e peça confirmação. Ao mudar um
  valor clínico por consistência, avise em destaque.
- Ele não se preocupa com alunos sabotando a sala; não insista em endurecer
  segurança além do que já existe.

## Serviços remotos

- **Não faça `git push` na `main` sem pedido explícito**: a Vercel publica
  sozinha a cada push.
- Não altere o Supabase (migração, configuração, dados) sem pedido explícito.
  Confirme o projeto pelo `ref` (`vonehbabrbjbjfxnsmpj`), nunca pelo nome.
- Abrir o monitor publicado para testar cria uma sala de verdade no banco; diga
  isso ao usuário quando fizer.

## Código

- `public/` é a fonte. `web/dist/` e `server-go/public/` são geradas por
  `npm run build:web` e `npm run prepare:go`.
- Antes de entregar: `npm test`, `npm run build:web` e, se mexeu no Go,
  `go -C server-go test ./...`.
- Para um bug corrigido, escreva o teste e **confirme que ele falha com o bug de
  volta**. Mais de um teste desta base já passava com e sem a correção.
- **Armadilha dos testes:** `monitor.js`, `controle.js` e `transport.js` são
  carregados nos testes sem as linhas de `import`. Um nome importado novo e usado
  nesses arquivos precisa ser acrescentado ao `sandbox` em
  `tests/regression.test.js`. Detalhes em `MAPA_DO_CODIGO.md`.
- Valores permitidos de campos do estado (capnografia, oxímetro, pulso, canais)
  ficam só em `simulation-config.js`.
- A versão está em `package.json`, `public/js/classroom.js` e
  `server-go/main.go`; um teste exige que as três sejam iguais.

## Traçados

- Velocidades aprovadas não mudam sem pedido: ECG 6 s de tela a 400 Hz, faixa
  −1,1 a 1,9 (`monitor.js`, tabela `tr`).
- Mudança de forma de onda exige conferência visual no navegador, além dos
  testes. Um sinal pode passar nos testes e sair invisível na tela.
- O motor tem cópias fora deste repositório: `../site-treino-acls/tracados/` e o
  pacote `../tracados-ecg.zip`. Ao mudar `engine.js`, `ecg-shapes.js`,
  `dart-player.js`, `dart-data.js` ou `rhythm-catalog.js`, avise e propague.

## Ferramentas no Windows

- Não grave JSON com `Set-Content` do PowerShell: ele põe BOM, e um BOM no
  `package.json` já derrubou uma publicação da Vercel.
- Edições de várias linhas: use a ferramenta de edição, não `node -e` ou `sed`
  com crases dentro de aspas no shell; o shell interpreta as crases.

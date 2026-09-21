# Entrega para revisão — SimMonitor 2.3.3-online

**21/09/2026. Nada foi publicado na Vercel — essa parte é sua.**

O Supabase está pronto e conferido: as duas migrações aplicadas (a seu pedido),
os dois ajustes do painel feitos por você, e a suíte de aceite online **19 / 19
aprovadas**. Localmente, **177 testes** passam, mais os 4 do servidor Go.

Falta só publicar (seção 5, passo 5) e conferir as duas telas (passo 6).

---

## 1. O que estava travado e o que mudou

A base recebida recusava qualquer comando no modo online em dois pontos, porque
o transporte não tinha como provar quem tinha escrito cada mensagem:

| Antes | Agora |
| --- | --- |
| `monitor.js` recusava `cmd` quando `transport.mode==='online'` | O comando é aceito depois de conferida a assinatura e a autorização do instrutor |
| `controle.js` respondia "use o servidor local" | O modo online envia normalmente |
| `transport.js` entrava em `realtime:bmsim-<sala>` com `private:false` | Canal **privado**, tópico `sala-<uuid>` vindo do banco, com token do usuário |

**Apagar os dois bloqueios não resolveria.** Num canal de broadcast, os campos
`from`, `role`, `to`, `session` e `lease` viajam dentro do payload: qualquer
participante autorizado da sala pode escrevê-los à mão e se passar por outro
controle ou pelo monitor. Autorizar o canal prova que alguém *pode escrever
ali*; não prova *quem é*.

### Como a identidade passou a ser verificável

Cada aparelho gera um par de chaves **ECDSA P-256** no próprio navegador. A chave
pública é registrada na sala junto com o papel; a privada nunca sai do aparelho.
Toda mensagem leva uma assinatura sobre o conteúdo inteiro. Quem recebe confere:

1. a assinatura fecha com a chave que **aquele aparelho** registrou **nesta sala**;
2. o aparelho assinado é o mesmo do campo `from`;
3. o papel vem do **cadastro da sala**, não do campo `role` da mensagem;
4. a sala assinada é esta sala — mensagem de outra sala não serve aqui;
5. o carimbo de tempo está na janela de 30 s e o nonce não se repetiu.

São três camadas independentes, e nenhuma depende de boa-fé do remetente:

- **Banco (RLS):** quem não está `autorizado` naquela sala não lê nem escreve no canal.
- **Assinatura:** quem está autorizado não consegue assumir a identidade de outro.
- **`CommandGate` (já existia):** sessão, concessão temporária, sequência e repetição.

As regras de "qual papel pode mandar qual tipo de mensagem" repetem exatamente as
do `server-go/main.go`, e há um teste que compara as duas tabelas.

---

## 2. Arquivos alterados e criados

São 12 arquivos alterados: 4 de aplicação/servidor, 1 de teste, 2 de
empacotamento e 5 de documentação. `npm run verify:delivery` lista exatamente
esses 12 e mais nenhum.

### Alterados

| Arquivo | Mudança |
| --- | --- |
| `public/js/transport.js` | Modo online reescrito: canal privado, `access_token` na entrada e renovado a cada 45 s, assinatura na saída, conferência na entrada, geração de conexão para não reenviar nada depois de uma queda. `detectMode()` preservado byte a byte. |
| `public/js/monitor.js` | Removido o bloqueio online; fila de autorização e lista de autorizados passam a vir da sala; revogação vale no banco; motivo da desconexão aparece no chip da sala. |
| `public/js/controle.js` | Removido o bloqueio online; identificador do aparelho passa a ser guardado (recarga não exige nova autorização); motivo da desconexão no aviso. |
| `public/js/classroom.js` | `VERSION` → `2.3.3-online.20260921`. O protocolo ganhou o envelope de assinatura; uma página antiga em cache agora avisa "versões diferentes" em vez de falhar em silêncio. |
| `server-go/main.go` | Mesma versão relatada em `/api/info`. `security` continua `socket-identity-v1`. |
| `tests/regression.test.js` | Só acréscimos: 10 testes de modo online e um `setTransportMode` no ambiente do controle. Os 144 testes originais estão intactos. |
| `package.json`, `.vercelignore` | Versão, `test:online`, `manifesto`; `supabase/` fora do upload. |
| `LEIA-ME.md`, `MAPA_DO_CODIGO.md` | Módulos novos no mapa, onde editar autorização e revogação, comandos do modo online. |
| `COMECE_AQUI.md`, `PUBLICACAO_VERCEL_SUPABASE.md` | Marcados como documentos da etapa anterior, apontando para este arquivo. O texto original foi preservado. |

**Não foram tocados:** `dart-data.js`, `dart-player.js`, `ecg-shapes.js`, `engine.js`,
`trace-renderer.js`, `simulation-*.js`, `rhythm-catalog.js`, `scenario-catalog.js`,
`case-exams.js`, `exams.js`, todo o HTML e todo o CSS. Layout, traçados, velocidades,
casos, terapias, áudio e exames seguem idênticos — conferido por SHA-256 contra a
base recebida (seção 5).

### Criados

| Arquivo | Papel |
| --- | --- |
| `supabase/migrations/20260921120000_simmonitor_salas_online.sql` | Tabelas, RPCs, RLS e políticas do canal privado |
| `public/js/crypto-identity.js` | Canonicalização, assinatura, verificação, janela de repetição |
| `public/js/supabase-rest.js` | Sessão anônima persistente, renovação, REST e RPC sem biblioteca externa |
| `public/js/online-room.js` | Ciclo da sala: abrir, entrar, pendentes, autorizar, revogar, batimento, cache de chaves |
| `tests/online-auth.test.js` | 22 testes de identidade, papéis, isolamento, revogação e sessão |
| `scripts/audit-online.mjs` | Suíte de aceite contra o Supabase de verdade (você roda) |
| `scripts/gerar-manifesto.mjs` | Manifesto SHA-256 desta entrega |

---

## 3. Banco de dados

Projeto de destino confirmado: **`vonehbabrbjbjfxnsmpj`** (`Doharamm's Project`),
o mesmo de `public/js/config.js`. Ele já contém `public.inscricoes` e
`public.progresso`, do jogo ACLS, com políticas para o papel `anon`.
**A migração é aditiva e não lê, altera ou remove nada dessas duas tabelas.**
Tudo que é novo usa o prefixo `sim_` e o papel `authenticated`, que não casa com
as políticas `to anon` já existentes.

### Estrutura

- **`sim_salas`** — código curto, tópico `sala-<uuid>` (não adivinhável), dono,
  validade e encerramento. Índice único garante um código ativo por vez.
- **`sim_participantes`** — aparelho, papel, **chave pública** e situação
  (`pendente`/`autorizado`/`revogado`). Índice único garante **um único monitor
  por sala**: nenhum outro aparelho consegue assinar como monitor.

Escrita **só por RPC `security definer`**. Não existe política de INSERT, UPDATE
ou DELETE nessas tabelas de propósito: nem cadastrar chave, nem trocar de papel,
nem se autorizar sozinho é possível por acesso direto à tabela.

| RPC | Quem pode | O que faz |
| --- | --- | --- |
| `sim_abrir_sala` | qualquer autenticado | Abre/reassume a sala e registra o monitor já autorizado |
| `sim_entrar_sala` | qualquer autenticado | Entra pelo código curto como `pendente`. Trocar de chave re-inicia a autorização |
| `sim_definir_situacao` | só o monitor da sala | Autoriza, revoga ou devolve a pendente |
| `sim_ping` | o próprio participante | Batimento; responde se o aparelho ainda vale |
| `sim_encerrar_sala` | só o monitor da sala | Encerra ao fim da aula |

As políticas em `realtime.messages` liberam `select` e `insert` de broadcast
apenas para participante `autorizado` de sala não encerrada e não vencida cujo
`topico` seja o tópico daquele canal.

---

## 4. Testes

### Executados aqui, nesta máquina — **local**

| Comando | Resultado |
| --- | --- |
| `node scripts/verify-delivery.mjs` (antes de editar) | **178 arquivos íntegros**, base recebida conferida |
| `node --test tests/*.test.js` (base recebida) | **144 / 144**, 0 falhas |
| `node --test tests/*.test.js` (esta entrega) | **176 / 176**, 0 falhas — os 144 originais + 32 novos |
| `go -C server-go test ./...` | **ok** `bravomike/simmonitor` |
| `node web/build.mjs` | `web/dist` gerada |
| `node scripts/prepare-go.mjs` | assets do servidor local preparados |

Os 32 testes novos cobrem: assinatura sobre o conteúdo inteiro; adulteração de
`data`, `cmd`, `seq`, `session`, `lease` e carimbo; controle tentando assumir
outro controle; controle tentando assumir o monitor e publicar estado; `role` em
desacordo com o cadastro; tipo por papel igual ao do Go; mensagem de outra sala;
aparelho desconhecido; aparelho revogado; revogação durante a aula; repetição;
atraso e adiantamento; sessão anônima reaproveitada; renovação e queda de
renovação; entrada pendente; fila do monitor; autorizar e revogar; batimento que
derruba o aparelho; canal privado com token; canal recusado pela política;
pendente e revogado fora do canal; mensagem não verificada que não chega à tela;
e comando assinado durante uma queda que **não** é enviado ao voltar.

### Executados contra o Supabase de verdade — **online**

`node scripts/audit-online.mjs --confirmo`, em 21/09/2026, no projeto
`vonehbabrbjbjfxnsmpj`, depois da migração aplicada e dos dois ajustes do painel:
**19 / 19 aprovadas.**

| Verificação | Resultado |
| --- | --- |
| Login anônimo disponível | OK |
| Monitor abre a sala e fica autorizado | OK — tópico `sala-<uuid>`, sem o código curto |
| Controle entra e fica pendente | OK |
| Controle pendente não entra no canal | OK — recusado pela política |
| Controle pendente não se autoriza sozinho | OK |
| Monitor vê o controle na fila | OK |
| Após autorizar, ambos entram no canal privado | OK |
| Segundo controle autorizado entra | OK |
| Estado assinado pelo monitor é aceito | OK |
| Comando assinado pelo controle é aceito | OK |
| Controle tenta se passar pelo monitor para outro controle | **Recusado** — assinatura inválida, nos dois receptores |
| Controle tenta enviar comando no lugar de outro controle | **Recusado** — assinatura inválida |
| Outra sala não lê nem escreve na sala alvo | OK |
| Quem não é da sala não lê a lista de participantes | OK |
| Canal público com o mesmo tópico | **Recusado** — confirma "Allow public access" desligado |
| Revogação tira o acesso ao canal | OK |
| Controle revogado não volta sozinho pelo código | OK |
| Chave de um aparelho não é trocada por outra conta | OK |
| Somente o monitor autoriza | OK |

As salas de teste foram encerradas ao final. Os usuários anônimos criados nos
testes continuam no projeto (a limpeza está na seção 7).

### **Não executados**

- **Vercel: nada foi publicado.** A publicação é sua (passo 5).
### Telas de verdade no modo online — **executado no navegador, contra o Supabase real**

Em 21/09/2026, com `npm run preview:online`, monitor e controle abertos em abas
separadas, modo online ligado. Cada etapa foi conferida na tela **e** no banco:

| Etapa | Na tela | No banco |
| --- | --- | --- |
| Monitor abre a sala | conecta em modo online | linha em `sim_salas`, código 4321, tópico `sala-6634b396…`, monitor `autorizado` |
| Controle entra | "Sem conexão — aguardando autorização do monitor" | linha em `sim_participantes`, `controle`, `pendente` |
| Fila no monitor | botão **Autorizar** aparece sozinho | — |
| Instrutor autoriza | — | `situacao` vira `autorizado`, com `autorizado_em` |
| Controle conecta | **"Conectado e autorizado"** | — |

O único erro de console é o `404` de `/api/info`, que é justamente como o app
detecta que não existe servidor local. A sala de teste foi encerrada depois.

**Achado corrigido durante este teste:** a caixa de autorização do monitor era
redesenhada a cada consulta à sala (3 s), o que trocava o botão **Autorizar**
embaixo do dedo do instrutor num celular. Passou a redesenhar só quando a lista
muda de verdade, com teste próprio que trava o comportamento.
- `npm run test:browser` e `npm run test:local`: dependem de Playwright/Edge e do
  executável Windows, que não estão neste ambiente.

---

## 5. Passo a passo para publicar

> Faça os passos 1 a 4 antes de publicar. O passo 3 é o que realmente liga o
> isolamento entre salas — sem ele, qualquer pessoa escuta a sala por um canal
> público mesmo com a migração aplicada.

### 1. Guardar o ponto de retorno

Guarde o ZIP `SimMonitor-2.3.2-para-Claude.zip` e o seu SHA-256. É o estado
anterior completo. Veja a seção 7 para o procedimento de volta.

### 2. Aplicar a migração — ✅ **JÁ FEITO em 21/09/2026, a seu pedido**

As duas migrações foram aplicadas no projeto `vonehbabrbjbjfxnsmpj`:

| Migração | O que fez |
| --- | --- |
| `20260921120000_simmonitor_salas_online.sql` | Criou `sim_salas`, `sim_participantes`, as 5 RPCs do fluxo e as políticas do canal privado |
| `20260921130000_simmonitor_auxiliares_schema_privado.sql` | Tirou as duas funções auxiliares da API pública (ver abaixo) |

Conferido depois de aplicar: `sim_salas` e `sim_participantes` criadas com RLS
ligada, 5 RPCs em `public`, 2 políticas nas tabelas e 2 em `realtime.messages`.
**`inscricoes` e `progresso` continuam exatamente como estavam**, com as suas
políticas `anon` intactas.

**Por que houve uma segunda migração.** Este projeto tem um privilégio padrão
que concede `EXECUTE` a `authenticated` em toda função nova criada em `public`.
Por causa disso, duas funções auxiliares (`sim_e_participante` e
`sim_fechar_expiradas`) ficaram chamáveis por `/rest/v1/rpc/…` mesmo com o
`revoke` que a primeira migração fazia. Elas foram movidas para o schema
`sim_interno`, que o PostgREST não expõe. Simplesmente revogar não serviria para
a primeira: ela é usada dentro das políticas de RLS, avaliadas com os
privilégios de quem consulta, e sem `EXECUTE` a leitura da própria sala passaria
a falhar.

**Avisos de segurança que sobram, e por quê.** O verificador do Supabase ainda
lista as 5 RPCs (`sim_abrir_sala`, `sim_entrar_sala`, `sim_definir_situacao`,
`sim_ping`, `sim_encerrar_sala`) como executáveis por usuário autenticado. **Isso
é proposital**: elas *são* a interface do aplicativo, e cada uma confere
`auth.uid()` e aplica suas próprias regras antes de qualquer escrita. Há também
um aviso sobre `public.rls_auto_enable()`, executável até sem login — essa
função **não é desta entrega**, já existia no seu projeto, e eu não a alterei.
Vale você olhar o que ela faz.

Se algum dia precisar reaplicar do zero, os dois arquivos estão em
`supabase/migrations/`, na ordem do nome. Com a CLI:

```bash
supabase link --project-ref vonehbabrbjbjfxnsmpj
supabase db push
```

### 3. Duas configurações no painel — ✅ **JÁ FEITAS por você em 21/09/2026**

Confirmadas pela suíte online: o login anônimo respondeu, e a tentativa de entrar
no mesmo tópico por um canal público foi recusada.

- **Authentication → Providers → Anonymous sign-ins: ligar.**
  Cada aparelho recebe um usuário anônimo próprio; é o que dá a identidade usada
  pelas políticas. As políticas do jogo ACLS são `to anon` e não são afetadas.
- **Realtime → Settings → "Allow public access": desligar.**
  Sem isso, os canais privados não são exigidos e alguém pode entrar no mesmo
  tópico por um canal público e escutar a sala. A suíte online tem uma
  verificação específica para isto.

### 4. Rodar a suíte de aceite online — ✅ **JÁ FEITO, 19/19 aprovadas**

```bash
node scripts/audit-online.mjs --confirmo
```

Resultados na seção 4. Rode de novo sempre que mexer na migração ou nas
configurações do painel — leva poucos segundos e encerra as salas de teste
sozinha.

### 5. Publicar na Vercel — **pendente, e só você consegue fazer**

Já existe o projeto **`bravomike-simmonitor`** na sua conta, na equipe
`bravo-mike-treinamentos`. Eu **não consegui publicar**: a conexão de Vercel
desta sessão lista os projetos mas devolve `403 forbidden` no escopo dessa
equipe ("You must re-authenticate to this scope"). Nesta máquina também não há
CLI da Vercel autenticada (`~/.vercel` não existe) nem `VERCEL_TOKEN`, e esta
pasta ainda não está vinculada ao projeto.

Duas saídas:

**a) Publicar você mesmo pela linha de comando** (mais direto):

```bash
npx vercel login
```

```bash
npx vercel
```

O primeiro comando abre o navegador para você entrar. O segundo pergunta se quer
vincular a um projeto existente — escolha **`bravomike-simmonitor`** — e publica
num endereço de teste com HTTPS. Para produção depois: `npx vercel --prod`.

**b) Reautorizar a conexão da Vercel** para a equipe `bravo-mike-treinamentos`
nas configurações de conectores da sua conta Claude. Feito isso, eu consigo
publicar e acompanhar o build.

**Confira no projeto existente antes da primeira publicação**, porque ele foi
criado antes desta entrega e eu não pude ler as configurações dele:

| Campo | Valor esperado |
| --- | --- |
| Root Directory | a pasta que contém `package.json` e `vercel.json` |
| Build Command | `npm run build:web` (vem do `vercel.json`) |
| Output Directory | `web/dist` (vem do `vercel.json`) |
| Framework Preset | Other / None |

Diretório raiz: **esta pasta** (onde estão `package.json` e `vercel.json`).
O `vercel.json` já define `buildCommand: npm run build:web`, saída `web/dist` e
`cleanUrls: false` (que preserva `/monitor.html` e `/controle.html` — o papel é
identificado pelo nome da página).

```bash
npx vercel --prod
```

Antes da primeira publicação, confira no projeto existente: diretório raiz,
build e saída, regras de URL e cache, e domínio. **Não** adicione reescrita geral
de rotas para `index.html`: as duas páginas são arquivos reais e um módulo
inexistente precisa devolver erro, não HTML. O 404 de `/api/info` na Vercel é o
esperado e é assim que o transporte sabe que não há servidor local.

### 6. Validar as duas telas

Em **aparelhos ou navegadores diferentes** (não duas abas do mesmo):

1. Abra `https://SEU-DOMINIO/monitor.html` — anote o código da sala.
2. Abra `https://SEU-DOMINIO/controle.html?sala=CODIGO` no celular.
3. No monitor, o controle aparece na caixa de autorização — clique **Autorizar**.
4. No controle, confirme "Conectado e autorizado". Mude ritmo e FC, carregue e
   aplique um choque, use SINC, marcapasso, RCP e capnografia.
5. Abra um controle numa **sala diferente** e confirme que ele não recebe nada.
6. No monitor, use **Revogar** e confirme que o controle perde o acesso.
7. Recarregue o controle e confirme que ele volta autorizado (o aparelho é o mesmo).
8. Recarregue o monitor e confirme que o controle se recupera sozinho.

---

## 5b. Como acessar para testar o modo online

Nada do modo online funciona antes dos passos 2 e 3 acima (migração aplicada e as
duas configurações do painel). Feito isso, há três formas, da mais rápida à mais
completa:

### a) Sem navegador e sem publicar — a mais rápida

```bash
node scripts/audit-online.mjs --confirmo
```

Roda todos os critérios de aceite contra o Supabase de verdade em poucos
segundos: pendente fora do canal, autorização, assinatura, identidade forjada,
outra sala, revogação, reconexão. É aqui que você descobre se a migração e as
configurações ficaram certas. **Faça esta antes das outras.**

### b) Telas de verdade, na sua máquina

`npm run preview` **não serve** para isso: ele responde `{preview:true}` em
`/api/info` e o transporte trata prévia como demonstração de propósito, para que
uma prévia nunca converse com o serviço online por engano. Use a prévia própria:

```bash
npm run preview:online
```

Depois abra, em **duas janelas separadas** (não duas abas — uma aba em segundo
plano pausa o monitor, que é o comportamento de segurança já existente):

- `http://127.0.0.1:8800/monitor.html?modo=online&sala=4321`
- `http://127.0.0.1:8800/controle.html?modo=online&sala=4321`

O monitor mostra o controle na caixa de autorização; clique em **Autorizar**.

### c) Dois aparelhos de verdade — só depois de publicar

**Precisa ser HTTPS.** O navegador só oferece `crypto.subtle` em contexto seguro,
e `http://192.168.x.x` não é contexto seguro: sem ele não há como assinar
mensagem alguma. `127.0.0.1` conta como seguro, por isso a opção (b) funciona,
mas a rede local por HTTP não. Se tentar, a tela diz exatamente isso em vez de
um erro genérico.

Publique (passo 5) e use o endereço da Vercel no computador e no celular. Uma
publicação de *preview* da Vercel já serve — não precisa ir para produção:

```bash
npx vercel        # publica em preview, com URL própria e HTTPS
```

> O **modo local** (servidor Go) continua funcionando por HTTP na rede, como
> sempre: ele não passa por este código e não precisa de WebCrypto.

---

## 6. Limitações — leia antes de usar em aula

1. **Nada foi testado em serviço remoto.** Todos os resultados da seção 4 são
   locais. A suíte online existe mas quem a executa é você.
2. **`Allow public access` é uma configuração de painel, não de código.** Se ficar
   ligada, a migração sozinha não isola as salas. A suíte online detecta isso.
3. **Revogação tem duas velocidades.** No aplicativo é imediata (o monitor recusa
   na hora). No canal do Realtime as permissões ficam em cache da conexão e só são
   recalculadas quando chega um token novo: com a renovação de 45 s, um controle
   revogado pode continuar *ouvindo* o canal por até cerca de um minuto antes de
   ser derrubado. Ele não consegue *executar* nada nesse intervalo.
4. **Login anônimo tem limite de 30 por hora por IP.** A sessão é guardada e
   reaproveitada, então cada aparelho consome uma vez só, para sempre. Ainda
   assim, uma turma grande estreando tudo ao mesmo tempo no mesmo Wi-Fi pode
   bater o limite. Se acontecer, os últimos aparelhos veem "login anônimo
   indisponível" e entram alguns minutos depois. O limite é ajustável no painel
   (Authentication → Rate Limits), e vale considerar CAPTCHA se o site for público.
5. **Usuários anônimos não são limpos sozinhos.** Para apagar os antigos:
   `delete from auth.users where is_anonymous is true and created_at < now() - interval '30 days';`
6. **A chave privada fica no `localStorage` do aparelho.** Protege contra outro
   participante da sala, não contra quem já tem o aparelho desbloqueado. Limpar os
   dados do navegador gera outra identidade, que precisa ser autorizada de novo.
7. **O código de 4 dígitos continua adivinhável.** Quem acertar consegue entrar
   como *pendente* e nada mais: não lê estado nem envia comando sem autorização.
   O tópico do canal, esse sim, não é adivinhável.
8. **Um estranho pode ocupar um código de sala livre.** Se isso incomodar, a
   `sim_abrir_sala` já recusa assumir uma sala cujo monitor foi visto nos últimos
   30 s; basta abrir o monitor antes de divulgar o código.
9. **`npm run test:browser` e `npm run test:local` não foram executados** aqui
   (faltam Playwright/Edge e o executável Windows). Eles continuam válidos e não
   foram alterados.
10. **Sem revisão clínica nesta etapa.** Nenhuma regra clínica, caso, etapa ou
    traçado foi tocado. As limitações de `evidencias/REVISAO_CLINICA_ORIGEM.md`
    seguem valendo.
11. **Ordem das mensagens online.** A conferência de assinatura é assíncrona; as
    mensagens passam por uma fila para chegar na ordem em que foram recebidas.
    O estado mais recente sempre vence, como antes.
12. **O modo online exige HTTPS.** `crypto.subtle` só existe em contexto seguro.
    Vale `https://…` e `http://127.0.0.1`/`localhost`; **não** vale
    `http://192.168.x.x`. A tela avisa com essa frase quando falta. O modo local
    (servidor Go) não é afetado e segue por HTTP na rede.
13. **Instalei Node 24.19.0 e Go 1.27 nesta máquina** (via `winget`) para
    conseguir rodar os testes da base. Não havia runtime instalado.

---

## 7. Como voltar à versão anterior

**Só o site, sem mexer no banco:** na Vercel, em *Deployments*, use
**Instant Rollback** para o deploy anterior. A migração pode ficar onde está: as
tabelas `sim_` não são lidas pela versão antiga, que recusava o modo online de
qualquer forma.

**A pasta inteira:** descompacte `SimMonitor-2.3.2-para-Claude.zip` numa pasta
nova e publique a partir dela. `node scripts/verify-delivery.mjs` deve responder
"178 arquivos conferidos". A cópia anterior à reorganização continua na máquina
de origem, em `revisao-codex-2026-09-19/auditoria/antes-refatoracao-2.3.2/`.

**Desfazer a migração** (só se quiser mesmo limpar o banco — isto **não** toca em
`inscricoes` nem em `progresso`):

```sql
drop policy if exists "sim: recebe broadcast da sala" on realtime.messages;
drop policy if exists "sim: envia broadcast da sala" on realtime.messages;
drop function if exists public.sim_abrir_sala(text, text, jsonb, integer);
drop function if exists public.sim_entrar_sala(text, text, jsonb);
drop function if exists public.sim_definir_situacao(uuid, text);
drop function if exists public.sim_ping(uuid, text);
drop function if exists public.sim_encerrar_sala(uuid);
drop table if exists public.sim_participantes;
drop table if exists public.sim_salas;
drop schema if exists sim_interno cascade;
```

E, se quiser apagar os usuários anônimos criados nos testes:

```sql
delete from auth.users where is_anonymous is true;
```

E, se quiser, desligue de novo *Anonymous sign-ins* e religue *Allow public access*.

---

## 8. Configuração final

| Item | Valor |
| --- | --- |
| Versão | `2.3.3-online.20260921` (protocolo e `package.json`) |
| Projeto Supabase | `vonehbabrbjbjfxnsmpj` — `https://vonehbabrbjbjfxnsmpj.supabase.co` |
| Chave no `config.js` | publicável (`sb_publishable_…`), preservada da origem. Não autentica o instrutor |
| Segredos | nenhum no repositório. `service_role` e chaves secretas não são usadas |
| Tópico do canal | `sala-<uuid>` vindo de `sim_salas.topico` |
| Validade da sala | 12 h (ajustável em `sim_abrir_sala`, teto de 24 h) |
| Renovação de token | 45 s no canal; sessão renovada 60 s antes de vencer |
| Janela de assinatura | 30 s |
| Vercel | raiz nesta pasta, `npm run build:web`, saída `web/dist`, `cleanUrls: false` |
| Manifesto desta entrega | `ENTREGA_2.3.3_SHA256.json`, 186 arquivos (`npm run manifesto`) |
| Manifesto da base recebida | `ENTREGA_SHA256.json` — `npm run verify:delivery` aponta os 12 arquivos alterados de propósito e sai com código 1, como esperado |

### Comandos

```bash
npm test                 # 176 testes locais
npm run build:web        # gera web/dist
npm run test:online -- --confirmo   # aceite contra o Supabase (escreve no projeto)
npm run verify:delivery  # o que mudou em relação à base recebida
npm run manifesto        # regenera o manifesto desta entrega
```

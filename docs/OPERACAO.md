# Operação — publicação, serviços e como voltar atrás

O que está no ar hoje e como mantê-lo. Para *onde mexer no código*, veja
`MAPA_DO_CODIGO.md`. O relatório da entrega que ligou o modo online, com os
testes da época, está em `docs/historico/ENTREGA_PARA_REVISAO.md`.

## Onde está cada coisa

| O quê | Onde |
| --- | --- |
| Site publicado | https://bravomike-simmonitor.vercel.app |
| Código | https://github.com/Doharamm/SimMonitor-Bravo-MIke (ramo `main`) |
| Publicação | Vercel, ligada ao GitHub: **todo `push` na `main` publica sozinho** |
| Banco e canal online | Supabase, projeto `vonehbabrbjbjfxnsmpj` ("SimMonitor Bravo Mike") |
| Despertador do Supabase | `.github/workflows/manter-supabase-acordado.yml` |

**Cuidado com o nome dos projetos Supabase.** A conta tem dois. O do SimMonitor
é o `vonehbabrbjbjfxnsmpj`. O outro, `lhzueisadnmsbljcqprq` ("Site ACLS
BravoMike"), não é usado por este app. Confira sempre pelo código (`ref`), não
pelo nome.

## Publicar

1. `npm test` — tudo precisa passar.
2. `git push` na `main`. A Vercel roda `npm run build:web` e publica `web/dist`.
3. Se a build falhar, **o site anterior continua no ar**; nada quebra para os
   alunos. O motivo aparece no painel da Vercel, em *Deployments*.

Não há variável de ambiente nem segredo para configurar: a chave em
`public/js/config.js` é a publicável, feita para ficar no navegador.

## Supabase

### O que precisa estar assim

- **Migrações aplicadas** (as duas de `supabase/migrations/`, em ordem). Estão
  aplicadas desde 21/09/2026.
- **Authentication → Anonymous sign-ins: ligado.** Cada aparelho entra como
  usuário anônimo.
- **Realtime → Allow public access: desligado.** Se ficar ligado, as migrações
  sozinhas não isolam as salas. A suíte `npm run test:online -- --confirmo`
  detecta isso.

### Hibernação

No plano gratuito o projeto hiberna depois de cerca de uma semana sem uso. O app
mostra então: *"o serviço online não respondeu. Se o app ficou dias sem uso…"*.

O agendamento do GitHub faz uma consulta leve ao banco nos dias 1, 4, 7, 10…
de cada mês, às 06h17 de Brasília, para isso não acontecer. Se a consulta falhar,
o GitHub manda e-mail: aí o projeto já hibernou, e é preciso religar no painel
do Supabase (*Restore project*, leva uns 4 minutos). A consulta sozinha não
acorda um projeto já pausado.

Em repositório público, o GitHub desliga agendamentos depois de 60 dias sem
nenhum commit. Ele avisa por e-mail; basta reativar em *Actions*.

### Manutenção ocasional

Usuários anônimos não são apagados sozinhos. Para limpar os antigos:

```sql
delete from auth.users where is_anonymous is true and created_at < now() - interval '30 days';
```

## App instalável (ícone na tela)

O site publicado pode ser instalado como app, com o ícone do SimMonitor:

- Android: Chrome → menu → "Instalar app" (ou "Adicionar à tela inicial").
- iPhone e iPad: Safari → Compartilhar → "Adicionar à Tela de Início".
- PC: Chrome ou Edge → ícone de instalar na barra de endereço.

Abre sem as barras do navegador. Tocar e segurar o ícone (Android) mostra os
atalhos "Monitor" e "Controle". Peças: `manifest.webmanifest`, ícones em
`img/`, `sw.js` (service worker) e `js/pwa.js` (registro).

- **Só no endereço https (Vercel) ou no próprio PC (localhost).** O navegador
  não permite instalar nem registrar o service worker numa página aberta por IP
  no Wi-Fi local (http://192.168.…). No modo local, o celular usa o controle
  pelo navegador, como antes.
- **O service worker busca na rede primeiro.** Com internet, sempre carrega a
  versão publicada mais nova; só usa a cópia guardada se a rede falhar ou
  demorar mais de 4 s. Nunca guarda o Supabase, o canal ao vivo (`/ws`) nem a
  detecção do modo local (`/api`). Ao mudar a lista de arquivos essenciais em
  `sw.js`, troque o nome do cache (`simmonitor-v1` → `v2`).
- O navegador embutido do Claude não aceita service worker; para testar, use o
  Chrome.

## Limitações conhecidas — leia antes de usar em aula

**Modo online**

1. **Só funciona em HTTPS** (ou `localhost`). Em `http://192.168.x.x` o navegador
   não oferece a criptografia necessária, e a tela avisa.
2. **Login anônimo: 30 por hora por IP.** Cada aparelho gasta uma vez só e
   reaproveita a sessão. Uma turma grande estreando tudo junto no mesmo Wi-Fi
   pode bater o limite; os últimos entram minutos depois. Ajustável em
   *Authentication → Rate Limits*.
3. **Revogação tem duas velocidades.** No app é imediata: o monitor recusa na
   hora. No canal, as permissões ficam em cache por até cerca de um minuto, e o
   controle revogado ainda *ouve* o canal nesse intervalo, mas não *executa* nada.
4. **A chave do aparelho fica no navegador.** Limpar os dados do navegador gera
   outra identidade; ela entra de novo pelo QR como um aparelho novo.
5. **Quem abre pelo QR já comanda (desde outubro de 2026).** O monitor autoriza
   sozinho o controle que entra, sem o botão "Autorizar": um controle por vez, e
   o último que entra assume. Um aparelho que perdeu a vez não toma de volta
   sozinho (senão dois controles se derrubariam sem parar); ele volta pelo botão
   "Autorizar" do monitor. Consequência: quem acertar o código de 4 dígitos
   também comanda. Foi decisão do usuário, que não se preocupa com alunos
   mexendo na sala. Abra o monitor antes de divulgar o código — a sala recusa
   ser assumida por outro enquanto o monitor estiver ativo.

**Modo local (servidor Go)**

6. **Reconexão depois de queda de Wi-Fi leva até ~8 s.** O servidor recusa uma
   segunda conexão com a mesma identidade enquanto a primeira está ativa, para
   ninguém se passar por um aparelho em uso. Se a primeira está calada há mais
   de 8 s (Wi-Fi caiu sem fechar a conexão), a nova assume e o aparelho continua
   autorizado. Antes, isso levava até 70 s e o controle perdia a autorização.
   Como o controle fala a cada 4 s, um aparelho ativo nunca fica 8 s calado.

**Conteúdo**

7. **Sem revisão clínica humana.** Casos, leituras de ECG e textos de raio-X têm
   revisão documental, não aprovação clínica. Veja `docs/CASOS.md` e
   `evidencias/REVISAO_CLINICA_ORIGEM.md`.

## Voltar atrás

**Só o site:** no painel da Vercel, em *Deployments*, escolha o deploy anterior e
use **Instant Rollback**. Leva segundos e não mexe no banco.

**O código:** `git revert <commit>` e `git push`. A Vercel publica a reversão.

**Desfazer as migrações** (só se quiser mesmo limpar o banco; não toca em
nenhuma outra tabela do projeto):

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

## Valores de configuração

| Item | Valor |
| --- | --- |
| Versão | ver `package.json`. Precisa ser igual em `public/js/classroom.js` e `server-go/main.go`; um teste confere |
| Tópico do canal | `sala-<uuid>`, de `sim_salas.topico` |
| Validade da sala | 12 h (ajustável em `sim_abrir_sala`, teto de 24 h) |
| Renovação de token | 45 s no canal; sessão renovada 60 s antes de vencer |
| Janela de assinatura das mensagens | 30 s |
| Vercel | `npm run build:web`, saída `web/dist`, `cleanUrls: false` |

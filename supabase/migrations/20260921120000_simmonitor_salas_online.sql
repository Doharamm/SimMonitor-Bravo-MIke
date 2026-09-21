-- SimMonitor — autorização online de salas (monitor/controle) sobre Supabase Realtime.
--
-- Esta migração é aditiva. Ela não lê, não altera e não remove nada de
-- public.inscricoes nem de public.progresso (jogo ACLS), que continuam com as
-- suas próprias políticas para o papel "anon".
--
-- Modelo: o canal Realtime é privado e as políticas em realtime.messages
-- restringem leitura e envio aos participantes AUTORIZADOS da sala. A
-- autorização do canal, porém, não prova quem escreveu cada payload: por isso
-- cada participante registra aqui a sua chave pública ECDSA P-256 e assina
-- todas as mensagens. O receptor confere a assinatura contra a chave
-- registrada para aquele aparelho naquela sala, e o papel vem do cadastro,
-- nunca do campo "role" da mensagem.

-- ---------------------------------------------------------------- tabelas ---

create table if not exists public.sim_salas (
  id               uuid primary key default gen_random_uuid(),
  codigo           text not null check (codigo ~ '^[0-9]{3,6}$'),
  topico           text not null unique,
  monitor_uid      uuid not null references auth.users (id) on delete cascade,
  monitor_disp     text not null,
  criada_em        timestamptz not null default now(),
  expira_em        timestamptz not null default now() + interval '12 hours',
  encerrada        boolean not null default false
);

comment on table public.sim_salas is
  'SimMonitor: uma sala de aula online. O topico e o nome do canal Realtime privado.';

-- Um codigo de 4 digitos so pode pertencer a uma sala aberta por vez.
create unique index if not exists sim_salas_codigo_aberto
  on public.sim_salas (codigo) where not encerrada;

create index if not exists sim_salas_expira on public.sim_salas (expira_em);

create table if not exists public.sim_participantes (
  id               uuid primary key default gen_random_uuid(),
  sala_id          uuid not null references public.sim_salas (id) on delete cascade,
  uid              uuid not null references auth.users (id) on delete cascade,
  dispositivo      text not null check (char_length(dispositivo) between 3 and 128),
  papel            text not null check (papel in ('monitor','controle')),
  chave            jsonb not null,
  situacao         text not null default 'pendente'
                     check (situacao in ('pendente','autorizado','revogado')),
  criado_em        timestamptz not null default now(),
  visto_em         timestamptz not null default now(),
  autorizado_em    timestamptz,
  unique (sala_id, dispositivo)
);

comment on table public.sim_participantes is
  'SimMonitor: aparelhos de uma sala, com a chave publica que assina as mensagens.';

-- Apenas um monitor por sala: nenhum outro aparelho pode assinar como monitor.
create unique index if not exists sim_participantes_monitor_unico
  on public.sim_participantes (sala_id) where papel = 'monitor';

create index if not exists sim_participantes_sala on public.sim_participantes (sala_id);
create index if not exists sim_participantes_uid  on public.sim_participantes (uid);

alter table public.sim_salas         enable row level security;
alter table public.sim_participantes enable row level security;

revoke all on public.sim_salas         from anon, authenticated;
revoke all on public.sim_participantes from anon, authenticated;
grant select on public.sim_salas         to authenticated;
grant select on public.sim_participantes to authenticated;

-- --------------------------------------------------------------- auxiliar ---

-- Usada pelas políticas e pelas RPCs. SECURITY DEFINER para não recursar na
-- própria RLS de sim_participantes.
create or replace function public.sim_e_participante(p_sala uuid, p_uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  select exists (
    select 1 from public.sim_participantes p
    where p.sala_id = p_sala and p.uid = p_uid
  );
$fn$;

create or replace function public.sim_fechar_expiradas()
returns void
language sql
security definer
set search_path = public, pg_temp
as $fn$
  update public.sim_salas
     set encerrada = true
   where not encerrada and expira_em <= now();
$fn$;

-- --------------------------------------------------------------- políticas ---

drop policy if exists "sim: participante le a propria sala" on public.sim_salas;
create policy "sim: participante le a propria sala"
  on public.sim_salas for select to authenticated
  using (public.sim_e_participante(id, (select auth.uid())));

drop policy if exists "sim: participante le a lista da sala" on public.sim_participantes;
create policy "sim: participante le a lista da sala"
  on public.sim_participantes for select to authenticated
  using (
    uid = (select auth.uid())
    or public.sim_e_participante(sala_id, (select auth.uid()))
  );

-- Escrita somente pelas RPCs abaixo. Nenhuma política de INSERT/UPDATE/DELETE
-- é criada de propósito: um cliente não pode cadastrar chave, mudar papel nem
-- se autorizar sozinho por acesso direto à tabela.

-- -------------------------------------------------------------------- RPCs ---

-- O monitor abre (ou reassume) uma sala e fica autorizado de imediato.
create or replace function public.sim_abrir_sala(
  p_codigo text,
  p_dispositivo text,
  p_chave jsonb,
  p_horas integer default 12
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_uid   uuid := auth.uid();
  v_sala  public.sim_salas;
  v_part  public.sim_participantes;
  v_visto timestamptz;
  v_horas integer := least(greatest(coalesce(p_horas, 12), 1), 24);
begin
  if v_uid is null then
    raise exception 'sem sessao' using errcode = '28000';
  end if;
  if p_codigo !~ '^[0-9]{3,6}$' then
    raise exception 'codigo invalido' using errcode = '22023';
  end if;
  if p_dispositivo is null or char_length(p_dispositivo) not between 3 and 128 then
    raise exception 'dispositivo invalido' using errcode = '22023';
  end if;
  if jsonb_typeof(p_chave) <> 'object' or p_chave->>'x' is null or p_chave->>'y' is null then
    raise exception 'chave invalida' using errcode = '22023';
  end if;

  perform public.sim_fechar_expiradas();

  select * into v_sala from public.sim_salas
   where codigo = p_codigo and not encerrada
   for update;

  if found then
    -- Só o dono da sala, ou qualquer um se o monitor sumiu há mais de 30 s.
    if v_sala.monitor_uid <> v_uid then
      select max(visto_em) into v_visto from public.sim_participantes
       where sala_id = v_sala.id and papel = 'monitor';
      if v_visto is not null and v_visto > now() - interval '30 seconds' then
        raise exception 'sala ocupada' using errcode = '55006';
      end if;
      delete from public.sim_participantes where sala_id = v_sala.id and papel = 'monitor';
      update public.sim_salas set monitor_uid = v_uid, monitor_disp = p_dispositivo
        where id = v_sala.id returning * into v_sala;
    elsif v_sala.monitor_disp <> p_dispositivo then
      -- Mesmo instrutor abrindo outra aba: a aba nova assume e a antiga perde.
      delete from public.sim_participantes where sala_id = v_sala.id and papel = 'monitor';
      update public.sim_salas set monitor_disp = p_dispositivo
        where id = v_sala.id returning * into v_sala;
    end if;
    update public.sim_salas
       set expira_em = now() + make_interval(hours => v_horas)
     where id = v_sala.id returning * into v_sala;
  else
    insert into public.sim_salas (codigo, topico, monitor_uid, monitor_disp, expira_em)
    values (p_codigo, 'sala-' || gen_random_uuid()::text, v_uid, p_dispositivo,
            now() + make_interval(hours => v_horas))
    returning * into v_sala;
  end if;

  insert into public.sim_participantes
    (sala_id, uid, dispositivo, papel, chave, situacao, autorizado_em, visto_em)
  values (v_sala.id, v_uid, p_dispositivo, 'monitor', p_chave, 'autorizado', now(), now())
  on conflict (sala_id, dispositivo) do update
    set chave = excluded.chave, uid = excluded.uid, papel = 'monitor',
        situacao = 'autorizado', autorizado_em = now(), visto_em = now()
  returning * into v_part;

  return jsonb_build_object(
    'sala_id', v_sala.id, 'codigo', v_sala.codigo, 'topico', v_sala.topico,
    'expira_em', v_sala.expira_em, 'participante_id', v_part.id, 'papel', 'monitor');
end;
$fn$;

-- Um controle entra pela sala pelo código curto e fica PENDENTE.
create or replace function public.sim_entrar_sala(
  p_codigo text,
  p_dispositivo text,
  p_chave jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_uid  uuid := auth.uid();
  v_sala public.sim_salas;
  v_part public.sim_participantes;
  v_mon  public.sim_participantes;
begin
  if v_uid is null then
    raise exception 'sem sessao' using errcode = '28000';
  end if;
  if p_codigo !~ '^[0-9]{3,6}$' then
    raise exception 'codigo invalido' using errcode = '22023';
  end if;
  if p_dispositivo is null or char_length(p_dispositivo) not between 3 and 128 then
    raise exception 'dispositivo invalido' using errcode = '22023';
  end if;
  if jsonb_typeof(p_chave) <> 'object' or p_chave->>'x' is null or p_chave->>'y' is null then
    raise exception 'chave invalida' using errcode = '22023';
  end if;

  perform public.sim_fechar_expiradas();

  select * into v_sala from public.sim_salas
   where codigo = p_codigo and not encerrada and expira_em > now();
  if not found then
    raise exception 'sala inexistente' using errcode = 'P0002';
  end if;

  select * into v_part from public.sim_participantes
   where sala_id = v_sala.id and dispositivo = p_dispositivo;

  -- Um aparelho já cadastrado por outra conta não pode ser assumido.
  if found and v_part.uid <> v_uid then
    raise exception 'dispositivo em uso' using errcode = '55006';
  end if;
  if found and v_part.papel = 'monitor' then
    raise exception 'dispositivo e o monitor' using errcode = '55006';
  end if;
  if found and v_part.situacao = 'revogado' then
    raise exception 'acesso revogado' using errcode = '42501';
  end if;

  -- Trocar de chave re-inicia a autorização: uma chave nova é outro segredo.
  insert into public.sim_participantes
    (sala_id, uid, dispositivo, papel, chave, situacao, visto_em)
  values (v_sala.id, v_uid, p_dispositivo, 'controle', p_chave, 'pendente', now())
  on conflict (sala_id, dispositivo) do update
    set visto_em = now(),
        chave    = excluded.chave,
        situacao = case when public.sim_participantes.chave = excluded.chave
                        then public.sim_participantes.situacao else 'pendente' end,
        autorizado_em = case when public.sim_participantes.chave = excluded.chave
                        then public.sim_participantes.autorizado_em else null end
  returning * into v_part;

  select * into v_mon from public.sim_participantes
   where sala_id = v_sala.id and papel = 'monitor';

  return jsonb_build_object(
    'sala_id', v_sala.id, 'codigo', v_sala.codigo, 'topico', v_sala.topico,
    'expira_em', v_sala.expira_em, 'participante_id', v_part.id,
    'papel', v_part.papel, 'situacao', v_part.situacao,
    'monitor', case when v_mon.id is null then null else jsonb_build_object(
      'dispositivo', v_mon.dispositivo, 'chave', v_mon.chave) end);
end;
$fn$;

-- Só o monitor da sala autoriza ou revoga.
create or replace function public.sim_definir_situacao(
  p_participante uuid,
  p_situacao text
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_uid  uuid := auth.uid();
  v_part public.sim_participantes;
  v_sala public.sim_salas;
begin
  if v_uid is null then
    raise exception 'sem sessao' using errcode = '28000';
  end if;
  if p_situacao not in ('autorizado','revogado','pendente') then
    raise exception 'situacao invalida' using errcode = '22023';
  end if;

  select * into v_part from public.sim_participantes where id = p_participante;
  if not found then
    raise exception 'participante inexistente' using errcode = 'P0002';
  end if;
  select * into v_sala from public.sim_salas where id = v_part.sala_id;
  if v_sala.monitor_uid <> v_uid then
    raise exception 'somente o monitor autoriza' using errcode = '42501';
  end if;
  if v_part.papel = 'monitor' then
    raise exception 'o monitor nao muda a propria situacao' using errcode = '42501';
  end if;

  update public.sim_participantes
     set situacao = p_situacao,
         autorizado_em = case when p_situacao = 'autorizado' then now() else null end
   where id = p_participante
  returning * into v_part;

  return jsonb_build_object('id', v_part.id, 'situacao', v_part.situacao);
end;
$fn$;

-- Batimento: mantém visto_em em dia e devolve se o aparelho ainda vale.
create or replace function public.sim_ping(
  p_sala uuid,
  p_dispositivo text
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_uid  uuid := auth.uid();
  v_part public.sim_participantes;
  v_sala public.sim_salas;
begin
  if v_uid is null then
    raise exception 'sem sessao' using errcode = '28000';
  end if;
  select * into v_sala from public.sim_salas where id = p_sala;
  if not found then
    return jsonb_build_object('valido', false, 'motivo', 'sala inexistente');
  end if;

  update public.sim_participantes
     set visto_em = now()
   where sala_id = p_sala and dispositivo = p_dispositivo and uid = v_uid
  returning * into v_part;

  if not found then
    return jsonb_build_object('valido', false, 'motivo', 'participante inexistente');
  end if;
  if v_sala.encerrada or v_sala.expira_em <= now() then
    return jsonb_build_object('valido', false, 'motivo', 'sala encerrada');
  end if;
  -- Outro aparelho assumiu o papel de monitor desta sala.
  if v_part.papel = 'monitor' and v_sala.monitor_disp <> p_dispositivo then
    return jsonb_build_object('valido', false, 'motivo', 'outro monitor assumiu');
  end if;

  return jsonb_build_object('valido', v_part.situacao = 'autorizado',
                            'situacao', v_part.situacao, 'motivo', null);
end;
$fn$;

-- O monitor encerra a sala ao terminar a aula.
create or replace function public.sim_encerrar_sala(p_sala uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'sem sessao' using errcode = '28000';
  end if;
  update public.sim_salas set encerrada = true
   where id = p_sala and monitor_uid = v_uid;
  if not found then
    raise exception 'somente o monitor encerra' using errcode = '42501';
  end if;
  return jsonb_build_object('encerrada', true);
end;
$fn$;

revoke all on function public.sim_abrir_sala(text, text, jsonb, integer) from public, anon;
revoke all on function public.sim_entrar_sala(text, text, jsonb)          from public, anon;
revoke all on function public.sim_definir_situacao(uuid, text)            from public, anon;
revoke all on function public.sim_ping(uuid, text)                        from public, anon;
revoke all on function public.sim_encerrar_sala(uuid)                     from public, anon;
revoke all on function public.sim_e_participante(uuid, uuid)              from public, anon;
revoke all on function public.sim_fechar_expiradas()                      from public, anon;

grant execute on function public.sim_abrir_sala(text, text, jsonb, integer) to authenticated;
grant execute on function public.sim_entrar_sala(text, text, jsonb)        to authenticated;
grant execute on function public.sim_definir_situacao(uuid, text)          to authenticated;
grant execute on function public.sim_ping(uuid, text)                      to authenticated;
grant execute on function public.sim_encerrar_sala(uuid)                   to authenticated;

-- ------------------------------------------------ canal privado (Realtime) ---
-- Recebe e envia somente quem está AUTORIZADO na sala daquele tópico.
-- Nomes com prefixo "sim:" para não colidir com outras políticas do projeto.

drop policy if exists "sim: recebe broadcast da sala" on realtime.messages;
create policy "sim: recebe broadcast da sala"
  on realtime.messages for select to authenticated
  using (
    realtime.messages.extension in ('broadcast','presence')
    and exists (
      select 1
        from public.sim_participantes p
        join public.sim_salas s on s.id = p.sala_id
       where p.uid = (select auth.uid())
         and p.situacao = 'autorizado'
         and not s.encerrada
         and s.expira_em > now()
         and s.topico = (select realtime.topic())
    )
  );

drop policy if exists "sim: envia broadcast da sala" on realtime.messages;
create policy "sim: envia broadcast da sala"
  on realtime.messages for insert to authenticated
  with check (
    realtime.messages.extension in ('broadcast','presence')
    and exists (
      select 1
        from public.sim_participantes p
        join public.sim_salas s on s.id = p.sala_id
       where p.uid = (select auth.uid())
         and p.situacao = 'autorizado'
         and not s.encerrada
         and s.expira_em > now()
         and s.topico = (select realtime.topic())
    )
  );

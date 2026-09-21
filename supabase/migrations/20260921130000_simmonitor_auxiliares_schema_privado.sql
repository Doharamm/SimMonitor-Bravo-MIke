-- SimMonitor — tira as funções auxiliares da API pública.
--
-- Por que esta migração existe: o projeto tem um privilégio padrão que concede
-- EXECUTE a `authenticated` em toda função nova criada no schema `public`. O
-- `revoke ... from public, anon` da migração anterior não desfaz essa concessão
-- explícita, então `sim_e_participante` e `sim_fechar_expiradas` ficaram
-- chamáveis por `/rest/v1/rpc/…`. Nenhuma das duas deveria ser chamada de fora:
--
--   • `sim_e_participante(sala, uid)` responderia se um usuário qualquer
--     pertence a uma sala qualquer — informação que ninguém precisa pedir.
--   • `sim_fechar_expiradas()` é faxina interna das RPCs.
--
-- Revogar de `authenticated` não basta para a primeira: ela é usada dentro das
-- políticas de RLS, que são avaliadas com os privilégios de quem consulta, e
-- sem EXECUTE a leitura da própria sala passaria a falhar. A saída é mudá-las
-- para um schema que o PostgREST não expõe: `authenticated` continua podendo
-- executá-las dentro da política, mas não existe rota REST que as alcance.
--
-- As cinco RPCs do fluxo (`sim_abrir_sala`, `sim_entrar_sala`,
-- `sim_definir_situacao`, `sim_ping`, `sim_encerrar_sala`) continuam em
-- `public` e chamáveis por usuário autenticado — é assim que devem ser. Cada
-- uma confere `auth.uid()` e aplica suas próprias regras.

create schema if not exists sim_interno;
revoke all on schema sim_interno from public, anon;
grant usage on schema sim_interno to authenticated;

-- ------------------------------------------------------------- auxiliares ---

create or replace function sim_interno.e_participante(p_sala uuid, p_uid uuid)
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

create or replace function sim_interno.fechar_expiradas()
returns void
language sql
security definer
set search_path = public, pg_temp
as $fn$
  update public.sim_salas
     set encerrada = true
   where not encerrada and expira_em <= now();
$fn$;

-- Avaliada dentro das políticas de RLS, com os privilégios de quem consulta.
revoke all on function sim_interno.e_participante(uuid, uuid) from public, anon;
grant execute on function sim_interno.e_participante(uuid, uuid) to authenticated;

-- Chamada só de dentro das RPCs, que rodam como dono. Ninguém mais precisa.
revoke all on function sim_interno.fechar_expiradas() from public, anon, authenticated;

-- --------------------------------------------------------------- políticas ---

drop policy if exists "sim: participante le a propria sala" on public.sim_salas;
create policy "sim: participante le a propria sala"
  on public.sim_salas for select to authenticated
  using (sim_interno.e_participante(id, (select auth.uid())));

drop policy if exists "sim: participante le a lista da sala" on public.sim_participantes;
create policy "sim: participante le a lista da sala"
  on public.sim_participantes for select to authenticated
  using (
    uid = (select auth.uid())
    or sim_interno.e_participante(sala_id, (select auth.uid()))
  );

-- ------------------------------------------- RPCs que usavam a faxina ---
-- Mesmos corpos da migração anterior; muda só a chamada da faxina interna.

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

  perform sim_interno.fechar_expiradas();

  select * into v_sala from public.sim_salas
   where codigo = p_codigo and not encerrada
   for update;

  if found then
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

  perform sim_interno.fechar_expiradas();

  select * into v_sala from public.sim_salas
   where codigo = p_codigo and not encerrada and expira_em > now();
  if not found then
    raise exception 'sala inexistente' using errcode = 'P0002';
  end if;

  select * into v_part from public.sim_participantes
   where sala_id = v_sala.id and dispositivo = p_dispositivo;

  if found and v_part.uid <> v_uid then
    raise exception 'dispositivo em uso' using errcode = '55006';
  end if;
  if found and v_part.papel = 'monitor' then
    raise exception 'dispositivo e o monitor' using errcode = '55006';
  end if;
  if found and v_part.situacao = 'revogado' then
    raise exception 'acesso revogado' using errcode = '42501';
  end if;

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

-- ------------------------------------------------ remove as versões antigas ---

drop function if exists public.sim_e_participante(uuid, uuid);
drop function if exists public.sim_fechar_expiradas();

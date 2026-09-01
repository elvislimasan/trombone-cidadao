-- 205_gamification_phase_zero.sql
--
-- Primeira fundacao do plano revisado de engajamento:
--
--   1. registra como a pessoa se deslocou na patrulha;
--   2. torna a conclusao de diaria autoritativa no servidor.
--
-- Nivel e XP nao ganham outra funcao SQL aqui. As telas atuais calculam ambos
-- a partir de `get_mission_counters` em src/lib/scoring.js; `get_user_level`
-- permanece apenas para compatibilidade com clientes antigos.

-- ── Modo de deslocamento ────────────────────────────────────────────────────
--
-- Nulo continua permitido porque as linhas historicas nao dizem se foram a pe
-- ou de carro, e inventar um backfill seria pior que declarar "desconhecido".
-- A versao nova do app grava o valor tanto online quanto na fila offline.

alter table public.patrols
  add column if not exists travel_mode text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'patrols_travel_mode_valido'
      and conrelid = 'public.patrols'::regclass
  ) then
    alter table public.patrols
      add constraint patrols_travel_mode_valido
      check (travel_mode is null or travel_mode in ('walking', 'driving'));
  end if;
end $$;

comment on column public.patrols.travel_mode is
  'walking ou driving. Nulo significa saida anterior a migracao 205 ou modo ainda nao coletado; nunca deve ser inferido pela velocidade.';

create index if not exists patrols_travel_mode_recentes_idx
  on public.patrols (travel_mode, ended_at desc)
  where travel_mode is not null;

-- ── Diarias autoritativas ───────────────────────────────────────────────────
--
-- A 200 deixava o cliente inserir qualquer daily_id. A chave primaria impedia
-- repetir o MESMO id, mas ainda aceitava ids inventados ou varias opcoes do
-- mesmo tipo — e tres linhas quaisquer viravam "dia perfeito".
--
-- Daqui em diante:
--
--   * nao ha INSERT direto para authenticated;
--   * a RPC aceita somente ids do catalogo;
--   * a meta e recalculada no servidor;
--   * cabe no maximo uma conclusao de campo, registro e comunidade por dia.
--
-- O CHECK e NOT VALID para preservar qualquer linha historica invalida sem
-- apagar dado. Mesmo assim ele vale para toda linha nova.

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'daily_completions_id_conhecido'
      and conrelid = 'public.daily_completions'::regclass
  ) then
    alter table public.daily_completions
      add constraint daily_completions_id_conhecido
      check (daily_id in (
        'confirmar_campo',
        'conferir_marcados',
        'registrar_bronca',
        'sinalizar_rapido',
        'apoiar_broncas',
        'comentar_broncas',
        'compartilhar_bronca'
      )) not valid;
  end if;
end $$;

drop policy if exists daily_completions_insert_own on public.daily_completions;
revoke insert on table public.daily_completions from anon, authenticated;

create or replace function public.complete_daily(p_daily_id text)
returns text
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $fn$
declare
  v_user       uuid := auth.uid();
  v_dia        date := (now() at time zone 'America/Sao_Paulo')::date;
  v_desde      timestamptz;
  v_tipo       text;
  v_existente  text;
  v_contadores record;
  v_cumprida   boolean := false;
begin
  if v_user is null then
    raise exception using
      errcode = '42501',
      message = 'Usuario nao autenticado';
  end if;

  v_tipo := case
    when p_daily_id in ('confirmar_campo', 'conferir_marcados')
      then 'campo'
    when p_daily_id in ('registrar_bronca', 'sinalizar_rapido')
      then 'registro'
    when p_daily_id in ('apoiar_broncas', 'comentar_broncas', 'compartilhar_bronca')
      then 'comunidade'
    else null
  end;

  if v_tipo is null then
    raise exception using
      errcode = '22023',
      message = 'Diaria desconhecida';
  end if;

  -- Serializa duas tentativas simultaneas do mesmo usuario/tipo/dia. Sem isto,
  -- duas abas poderiam passar juntas pelo NOT EXISTS e gravar duas opcoes.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_user::text || '|' || v_dia::text || '|' || v_tipo, 0)
  );

  select dc.daily_id
    into v_existente
  from public.daily_completions dc
  where dc.user_id = v_user
    and dc.dia = v_dia
    and (
      (v_tipo = 'campo'
        and dc.daily_id in ('confirmar_campo', 'conferir_marcados'))
      or (v_tipo = 'registro'
        and dc.daily_id in ('registrar_bronca', 'sinalizar_rapido'))
      or (v_tipo = 'comunidade'
        and dc.daily_id in ('apoiar_broncas', 'comentar_broncas', 'compartilhar_bronca'))
    )
  order by dc.created_at
  limit 1;

  -- Idempotencia tambem entre versoes do catalogo: se uma opcao daquele tipo
  -- ja pagou hoje, devolve qual foi e nao cria uma segunda linha.
  if v_existente is not null then
    return v_existente;
  end if;

  v_desde := v_dia::timestamp at time zone 'America/Sao_Paulo';
  select *
    into v_contadores
  from public.get_mission_counters(v_user, v_desde);

  v_cumprida := case p_daily_id
    when 'confirmar_campo'
      then coalesce(v_contadores.updates_count, 0) >= 3
    when 'conferir_marcados'
      then coalesce(v_contadores.missions_count, 0)
         + coalesce(v_contadores.empties_count, 0) >= 2
    when 'registrar_bronca'
      then coalesce(v_contadores.reports_count, 0) >= 1
    when 'sinalizar_rapido'
      then coalesce(v_contadores.signals_count, 0) >= 3
    when 'apoiar_broncas'
      then coalesce(v_contadores.upvotes_given, 0) >= 5
    when 'comentar_broncas'
      then coalesce(v_contadores.comments_count, 0) >= 2
    when 'compartilhar_bronca'
      then coalesce(v_contadores.shares_count, 0) >= 2
    else false
  end;

  if not v_cumprida then
    raise exception using
      errcode = 'P0001',
      message = 'Meta da diaria ainda nao cumprida';
  end if;

  insert into public.daily_completions (user_id, dia, daily_id)
  values (v_user, v_dia, p_daily_id)
  on conflict (user_id, dia, daily_id) do nothing;

  return p_daily_id;
end;
$fn$;

comment on function public.complete_daily(text) is
  'Confirma uma diaria com contadores recalculados no servidor e limita uma conclusao por tipo/dia. Retorna o id efetivamente creditado.';

revoke all on function public.complete_daily(text) from public;
grant execute on function public.complete_daily(text) to authenticated;

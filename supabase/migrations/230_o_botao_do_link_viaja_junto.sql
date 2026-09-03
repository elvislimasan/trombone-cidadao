-- 230 — O texto do botao entra nas RPCs, em vez de andar por fora
--
-- ═══════════════════════════════════════════════════════════════════════════
-- O QUE A 229 DEIXOU PELA METADE
-- ═══════════════════════════════════════════════════════════════════════════
--
-- A 229 criou `city_events.source_button_label` e o cliente passou a gravar a
-- coluna com um UPDATE direto, logo depois de chamar `create_city_event` ou
-- `update_city_event`. Funciona, e tem tres defeitos que so aparecem no dia
-- ruim:
--
--   • SAO DUAS ESCRITAS. A segunda pode falhar sozinha, e falha com o alerta ja
--     publicado. A mensagem que o app mostra hoje admite isso em voz alta — "O
--     alerta foi salvo, mas o texto do botao nao" —, o que e honesto e e um
--     estado que nao deveria existir.
--
--   • O UPDATE DIRETO DEPENDE DA POLICY, e nao da funcao. Todo o resto da
--     escrita de acontecimentos passa por SECURITY DEFINER com
--     `can_manage_city_events` no meio; este caminho passa por
--     `city_events_gestor_update`. Duas autoridades para a mesma tabela e uma a
--     mais para manter em dia.
--
--   • SAO DUAS LEITURAS. `get_city_event` nao devolvia a coluna, entao a tela
--     fazia uma consulta extra por acontecimento aberto — ao lado de uma RPC
--     cujo comentario promete resolver tudo "numa ida".
--
-- Esta migracao coloca o campo onde os outros ja estao. O UPDATE direto do
-- cliente sai junto (ver `useCityEvents.js`).
--
-- POR QUE DROP E NAO `CREATE OR REPLACE`
--
-- Acrescentar um parametro muda a assinatura: o Postgres criaria uma SEGUNDA
-- funcao em vez de substituir a primeira, e como todos os parametros novos tem
-- default, uma chamada com os argumentos antigos ficaria ambigua entre as duas.
-- E o mesmo motivo pelo qual a 209 e a 210 derrubaram as versoes anteriores.

-- ── 1. A leitura devolve a coluna ───────────────────────────────────────────
--
-- Devolve jsonb: acrescentar chave nao muda a assinatura, entao aqui
-- `create or replace` basta. Corpo identico ao da 210, mais uma linha.

create or replace function public.get_city_event(p_event_id bigint)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'id',                     e.id,
    'city_id',                e.city_id,
    'city_name',              c.name,
    'type',                   e.type,
    'title',                  e.title,
    'description',            e.description,
    'severity',               e.severity,
    'status',                 e.status,
    'started_at',             e.started_at,
    'estimated_end_at',       e.estimated_end_at,
    'estimated_end_day_only', e.estimated_end_day_only,
    'resolved_at',            e.resolved_at,
    'source_name',            e.source_name,
    'source_url',             e.source_url,
    'source_button_label',    e.source_button_label,
    'image_url',              e.image_url,
    'image_path',             e.image_path,
    'confirmation_cycle',     e.confirmation_cycle,
    'can_manage',             public.can_manage_city_events(auth.uid(), e.city_id),
    'areas',                  public.city_event_areas_json(e.id),
    'updates', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', u.id, 'type', u.type, 'message', u.message,
        'old_estimated_end_at', u.old_estimated_end_at,
        'new_estimated_end_at', u.new_estimated_end_at,
        'created_at', u.created_at,
        'created_by_role', u.created_by_role,
        'author_name', p.name
      ) order by u.created_at asc), '[]'::jsonb)
      from public.city_event_updates u
      left join public.profiles p on p.id = u.created_by
      where u.city_event_id = e.id
    ),
    'confirmations', (
      select jsonb_build_object(
        'resolved',     count(*) filter (where cf.status = 'resolved'),
        'not_resolved', count(*) filter (where cf.status = 'not_resolved'),
        'last_at',      max(cf.updated_at)
      )
      from public.city_event_confirmations cf
      where cf.city_event_id = e.id and cf.cycle = e.confirmation_cycle
    ),
    'my_confirmation', (
      select cf.status from public.city_event_confirmations cf
      where cf.city_event_id = e.id and cf.cycle = e.confirmation_cycle and cf.user_id = auth.uid()
    )
  )
  from public.city_events e
  join public.cities c on c.id = e.city_id
  where e.id = p_event_id
    and (e.status <> 'draft' or public.can_manage_city_events(auth.uid(), e.city_id));
$$;

-- ── 2. A criacao aceita o texto do botao ────────────────────────────────────

drop function if exists public.create_city_event(
  bigint, text, text, jsonb, text, text, timestamptz, timestamptz, text, text, boolean, text, text, text, boolean
);

create function public.create_city_event(
  p_city_id                bigint,
  p_type                   text,
  p_title                  text,
  p_areas                  jsonb,
  p_description            text default null,
  p_severity               text default 'warning',
  p_started_at             timestamptz default null,
  p_estimated_end_at       timestamptz default null,
  p_source_name            text default null,
  p_source_url             text default null,
  p_notify                 boolean default true,
  p_status                 text default 'active',
  p_image_url              text default null,
  p_image_path             text default null,
  p_estimated_end_day_only boolean default false,
  p_source_button_label    text default null
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user    uuid := auth.uid();
  v_role    text;
  v_id      bigint;
  v_inicio  timestamptz := coalesce(p_started_at, now());
  v_status  text := coalesce(p_status, 'active');
begin
  v_role := public.city_event_role(v_user, p_city_id);
  if v_role is null then
    raise exception 'Sem permissao para criar acontecimentos nesta cidade.' using errcode = '42501';
  end if;

  if jsonb_array_length(coalesce(p_areas, '[]'::jsonb)) = 0 then
    raise exception 'Escolha ao menos uma area atingida.' using errcode = '22023';
  end if;

  if not public.city_event_scope_ok(v_user, p_city_id, p_areas) then
    raise exception 'Alguma das areas escolhidas esta fora do seu escopo.' using errcode = '42501';
  end if;

  if v_status = 'active' and v_inicio > now() then
    v_status := 'scheduled';
  end if;

  if p_estimated_end_at is not null and p_estimated_end_at <= v_inicio then
    raise exception 'A previsao precisa ser depois do inicio.' using errcode = '22023';
  end if;

  insert into public.city_events (
    city_id, type, title, description, severity, status,
    started_at, estimated_end_at, estimated_end_day_only, source_name, source_url,
    source_button_label, image_url, image_path, created_by, created_by_role
  ) values (
    p_city_id, p_type, btrim(p_title), nullif(btrim(coalesce(p_description, '')), ''),
    coalesce(p_severity, 'warning'), v_status,
    v_inicio, p_estimated_end_at, coalesce(p_estimated_end_day_only, false),
    nullif(btrim(coalesce(p_source_name, '')), ''), nullif(btrim(coalesce(p_source_url, '')), ''),
    nullif(btrim(coalesce(p_source_button_label, '')), ''),
    nullif(btrim(coalesce(p_image_url, '')), ''), nullif(btrim(coalesce(p_image_path, '')), ''),
    v_user, v_role
  )
  returning id into v_id;

  perform public.set_city_event_areas(v_id, p_areas);

  insert into public.city_event_updates (city_event_id, type, message, new_estimated_end_at, created_by, created_by_role)
  values (v_id, 'created', nullif(btrim(coalesce(p_description, '')), ''), p_estimated_end_at, v_user, v_role);

  if p_notify and v_status = 'active' then
    perform public.notify_city_event_audience(
      v_id, 'city_event', btrim(p_title),
      coalesce(nullif(btrim(coalesce(p_description, '')), ''), 'Toque para ver a situacao.'),
      v_user
    );
  end if;

  return v_id;
end;
$$;

-- ── 3. A edicao tambem ──────────────────────────────────────────────────────
--
-- `p_limpar_botao` existe pelo mesmo motivo de `p_limpar_imagem`: `coalesce`
-- nao distingue "nao mexi" de "quero apagar". Sem a bandeira, trocar o texto do
-- botao seria possivel e TIRA-LO nao — e o botao voltaria a um rotulo que
-- ninguem escolheu.

drop function if exists public.update_city_event(
  bigint, text, text, text, text, timestamptz, timestamptz, text, text, jsonb, text, text, boolean, boolean
);

create function public.update_city_event(
  p_event_id               bigint,
  p_title                  text default null,
  p_description            text default null,
  p_type                   text default null,
  p_severity               text default null,
  p_started_at             timestamptz default null,
  p_estimated_end_at       timestamptz default null,
  p_source_name            text default null,
  p_source_url             text default null,
  p_areas                  jsonb default null,
  p_image_url              text default null,
  p_image_path             text default null,
  p_limpar_imagem          boolean default false,
  p_estimated_end_day_only boolean default null,
  p_source_button_label    text default null,
  p_limpar_botao           boolean default false
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user  uuid := auth.uid();
  v_event public.city_events;
begin
  select * into v_event from public.city_events where id = p_event_id;
  if not found then
    raise exception 'Acontecimento nao encontrado.' using errcode = 'P0002';
  end if;

  if not public.can_manage_city_events(v_user, v_event.city_id) then
    raise exception 'Sem permissao para editar este acontecimento.' using errcode = '42501';
  end if;

  if p_areas is not null then
    if not public.city_event_scope_ok(v_user, v_event.city_id, p_areas) then
      raise exception 'Alguma das areas escolhidas esta fora do seu escopo.' using errcode = '42501';
    end if;
    perform public.set_city_event_areas(p_event_id, p_areas);
  end if;

  update public.city_events set
    title                  = coalesce(nullif(btrim(coalesce(p_title, '')), ''), title),
    description            = coalesce(p_description, description),
    type                   = coalesce(p_type, type),
    severity               = coalesce(p_severity, severity),
    started_at             = coalesce(p_started_at, started_at),
    estimated_end_at       = coalesce(p_estimated_end_at, estimated_end_at),
    estimated_end_day_only = coalesce(p_estimated_end_day_only, estimated_end_day_only),
    source_name            = coalesce(p_source_name, source_name),
    source_url             = coalesce(p_source_url, source_url),
    source_button_label    = case
                               when p_limpar_botao then null
                               else coalesce(nullif(btrim(coalesce(p_source_button_label, '')), ''), source_button_label)
                             end,
    image_url              = case when p_limpar_imagem then null else coalesce(p_image_url, image_url) end,
    image_path             = case when p_limpar_imagem then null else coalesce(p_image_path, image_path) end
  where id = p_event_id;
end;
$$;

-- ── Grants (foram embora com os drops) ──────────────────────────────────────

grant execute on function public.get_city_event(bigint) to anon, authenticated;

grant execute on function public.create_city_event(
  bigint, text, text, jsonb, text, text, timestamptz, timestamptz, text, text, boolean, text, text, text, boolean, text
) to authenticated;

grant execute on function public.update_city_event(
  bigint, text, text, text, text, timestamptz, timestamptz, text, text, jsonb, text, text, boolean, boolean, text, boolean
) to authenticated;

notify pgrst, 'reload schema';

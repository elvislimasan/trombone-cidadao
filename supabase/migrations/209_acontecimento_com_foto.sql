-- 209_acontecimento_com_foto.sql
--
-- Uma foto opcional no acontecimento.
--
-- POR QUE UMA, E POR QUE OPCIONAL
--
-- Um alerta nao e uma bronca. A bronca PRECISA de foto: ela e a prova de que o
-- buraco existe, e sem ela o registro nao se sustenta. O alerta e o contrario —
-- quem publica e a prefeitura ou a concessionaria dizendo "vai faltar agua ate
-- as 18h", e essa frase vale sozinha. Exigir foto faria o embaixador segurar a
-- publicacao de um aviso urgente por falta de imagem, que e o pior desfecho
-- possivel para um modulo cujo valor inteiro e chegar rapido.
--
-- Uma so, e nao galeria, porque o papel dela e compor a tela: ela e o fundo do
-- cartao de destaque e o topo da tela do acontecimento. Uma segunda foto nao
-- teria onde aparecer, e uma galeria transformaria "aviso" em "reportagem".
--
-- POR QUE DUAS COLUNAS
--
-- `image_url` e o que a tela le. `image_path` e o caminho no Storage, e existe
-- para poder APAGAR o objeto quando a foto e trocada ou o acontecimento e
-- removido. Derivar o caminho da URL e possivel (pavementStreetMedia.js faz
-- isso), mas so funciona enquanto o formato da URL publica nao mudar — e
-- guardar o caminho custa uma coluna de texto.

alter table public.city_events
  add column if not exists image_url  text,
  add column if not exists image_path text;

comment on column public.city_events.image_url is
  'Foto opcional que compoe o cartao de destaque e o topo da tela do acontecimento.';
comment on column public.city_events.image_path is
  'Caminho da foto no bucket city-events. Guardado para poder remover o objeto ao trocar ou apagar.';

-- ── O bucket ────────────────────────────────────────────────────────────────
--
-- Leitura publica: a tela do acontecimento e publica (a 206 concede
-- `get_city_event` a `anon`), entao a foto tambem precisa ser.
--
-- Escrita escopada pela CIDADE no primeiro segmento do caminho —
-- `<city_id>/<uuid>-<arquivo>` — exatamente como o bucket de pavimentacao da
-- 201. O id do acontecimento nao entra no caminho de proposito: a foto e
-- enviada ANTES de o acontecimento existir, e um caminho que so pode ser
-- montado depois obrigaria a criar o evento sem foto e edita-lo em seguida.
--
-- 5 MB e menos que os 20 MB da pavimentacao porque aqui e uma foto de tela, nao
-- um documento historico — e o cliente ja comprime antes de enviar.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'city-events',
  'city-events',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/avif']::text[]
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists city_events_media_select_public on storage.objects;
create policy city_events_media_select_public
  on storage.objects for select
  using (bucket_id = 'city-events');

-- `can_manage_city_events` ja responde "admin, master ou embaixador ativo desta
-- cidade" (206). Reusar aqui e o que impede a permissao do Storage de divergir
-- da permissao da tabela — que e como um embaixador acabaria conseguindo subir
-- foto para uma cidade em que nao pode publicar.
drop policy if exists city_events_media_gestor_insert on storage.objects;
create policy city_events_media_gestor_insert
  on storage.objects for insert
  with check (
    bucket_id = 'city-events'
    and auth.role() = 'authenticated'
    and split_part(name, '/', 1) ~ '^[0-9]+$'
    and public.can_manage_city_events(auth.uid(), split_part(name, '/', 1)::bigint)
  );

drop policy if exists city_events_media_gestor_update on storage.objects;
create policy city_events_media_gestor_update
  on storage.objects for update
  using (
    bucket_id = 'city-events'
    and split_part(name, '/', 1) ~ '^[0-9]+$'
    and public.can_manage_city_events(auth.uid(), split_part(name, '/', 1)::bigint)
  )
  with check (
    bucket_id = 'city-events'
    and split_part(name, '/', 1) ~ '^[0-9]+$'
    and public.can_manage_city_events(auth.uid(), split_part(name, '/', 1)::bigint)
  );

drop policy if exists city_events_media_gestor_delete on storage.objects;
create policy city_events_media_gestor_delete
  on storage.objects for delete
  using (
    bucket_id = 'city-events'
    and split_part(name, '/', 1) ~ '^[0-9]+$'
    and public.can_manage_city_events(auth.uid(), split_part(name, '/', 1)::bigint)
  );

-- ── As RPCs passam a carregar a foto ────────────────────────────────────────
--
-- POR QUE `drop function` E NAO SO `create or replace`
--
-- Acrescentar parametro MUDA A ASSINATURA. `create or replace` nao substitui:
-- ele cria uma SEGUNDA funcao com o mesmo nome. Como as duas teriam valores
-- padrao, toda chamada do PostgREST viraria "function is not unique" — um erro
-- que so aparece em runtime, depois do deploy.
--
-- O mesmo vale para `get_city_events`: acrescentar coluna muda o tipo de
-- retorno, e `create or replace` recusa.

drop function if exists public.create_city_event(
  bigint, text, text, jsonb, text, text, timestamptz, timestamptz, text, text, boolean, text
);

create function public.create_city_event(
  p_city_id          bigint,
  p_type             text,
  p_title            text,
  p_areas            jsonb,
  p_description      text default null,
  p_severity         text default 'warning',
  p_started_at       timestamptz default null,
  p_estimated_end_at timestamptz default null,
  p_source_name      text default null,
  p_source_url       text default null,
  p_notify           boolean default true,
  p_status           text default 'active',
  p_image_url        text default null,
  p_image_path       text default null
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
    started_at, estimated_end_at, source_name, source_url,
    image_url, image_path, created_by, created_by_role
  ) values (
    p_city_id, p_type, btrim(p_title), nullif(btrim(coalesce(p_description, '')), ''),
    coalesce(p_severity, 'warning'), v_status,
    v_inicio, p_estimated_end_at,
    nullif(btrim(coalesce(p_source_name, '')), ''), nullif(btrim(coalesce(p_source_url, '')), ''),
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

drop function if exists public.update_city_event(
  bigint, text, text, text, text, timestamptz, timestamptz, text, text, jsonb
);

-- `p_limpar_imagem` existe porque `coalesce` nao distingue "nao mexi" de
-- "quero remover": nulo ja significa a primeira coisa em todos os outros
-- campos. Sem a bandeira, trocar a foto seria possivel e TIRAR a foto nao.
create function public.update_city_event(
  p_event_id         bigint,
  p_title            text default null,
  p_description      text default null,
  p_type             text default null,
  p_severity         text default null,
  p_started_at       timestamptz default null,
  p_estimated_end_at timestamptz default null,
  p_source_name      text default null,
  p_source_url       text default null,
  p_areas            jsonb default null,
  p_image_url        text default null,
  p_image_path       text default null,
  p_limpar_imagem    boolean default false
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
    title            = coalesce(nullif(btrim(coalesce(p_title, '')), ''), title),
    description      = coalesce(p_description, description),
    type             = coalesce(p_type, type),
    severity         = coalesce(p_severity, severity),
    started_at       = coalesce(p_started_at, started_at),
    estimated_end_at = coalesce(p_estimated_end_at, estimated_end_at),
    source_name      = coalesce(p_source_name, source_name),
    source_url       = coalesce(p_source_url, source_url),
    image_url        = case when p_limpar_imagem then null else coalesce(p_image_url, image_url) end,
    image_path       = case when p_limpar_imagem then null else coalesce(p_image_path, image_path) end
  where id = p_event_id;
end;
$$;

-- ── A leitura devolve a foto ────────────────────────────────────────────────

drop function if exists public.get_city_events(bigint, text[], text[], integer);

create function public.get_city_events(
  p_city_id  bigint,
  p_statuses text[] default array['active', 'awaiting_confirmation', 'scheduled'],
  p_types    text[] default null,
  p_limit    integer default 50
)
returns table (
  id                 bigint,
  city_id            bigint,
  type               text,
  title              text,
  description        text,
  severity           text,
  status             text,
  started_at         timestamptz,
  estimated_end_at   timestamptz,
  resolved_at        timestamptz,
  source_name        text,
  source_url         text,
  image_url          text,
  confirmation_cycle integer,
  areas              jsonb,
  updates_count      integer
)
language sql
stable
security definer
set search_path = public
as $$
  select
    e.id, e.city_id, e.type, e.title, e.description, e.severity, e.status,
    e.started_at, e.estimated_end_at, e.resolved_at, e.source_name, e.source_url,
    e.image_url, e.confirmation_cycle,
    public.city_event_areas_json(e.id),
    (select count(*)::integer from public.city_event_updates u where u.city_event_id = e.id)
  from public.city_events e
  where e.city_id = p_city_id
    and e.status = any (coalesce(p_statuses, array['active', 'awaiting_confirmation', 'scheduled']))
    and (p_types is null or e.type = any (p_types))
    and (e.status <> 'draft' or public.can_manage_city_events(auth.uid(), e.city_id))
  order by
    case e.status when 'active' then 0 when 'awaiting_confirmation' then 1
                  when 'scheduled' then 2 else 3 end,
    coalesce(e.resolved_at, e.started_at) desc
  limit greatest(1, least(coalesce(p_limit, 50), 200));
$$;

-- Esta devolve jsonb: acrescentar chave nao muda a assinatura, entao
-- `create or replace` basta.
create or replace function public.get_city_event(p_event_id bigint)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'id',                 e.id,
    'city_id',            e.city_id,
    'city_name',          c.name,
    'type',               e.type,
    'title',              e.title,
    'description',        e.description,
    'severity',           e.severity,
    'status',             e.status,
    'started_at',         e.started_at,
    'estimated_end_at',   e.estimated_end_at,
    'resolved_at',        e.resolved_at,
    'source_name',        e.source_name,
    'source_url',         e.source_url,
    'image_url',          e.image_url,
    'image_path',         e.image_path,
    'confirmation_cycle', e.confirmation_cycle,
    'can_manage',         public.can_manage_city_events(auth.uid(), e.city_id),
    'areas',              public.city_event_areas_json(e.id),
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

-- Os eventos que pegam numa rua tambem carregam a foto: o cartao de Minha Rua
-- usa a mesma imagem.
drop function if exists public.get_street_city_events(uuid);

create function public.get_street_city_events(p_street_id uuid)
returns table (
  id               bigint,
  type             text,
  title            text,
  description      text,
  severity         text,
  status           text,
  started_at       timestamptz,
  estimated_end_at timestamptz,
  resolved_at      timestamptz,
  image_url        text,
  areas            jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  with rua as (
    select s.id, s.bairro_id, s.city_id from public.pavement_streets s where s.id = p_street_id
  )
  select
    e.id, e.type, e.title, e.description, e.severity, e.status,
    e.started_at, e.estimated_end_at, e.resolved_at, e.image_url,
    public.city_event_areas_json(e.id)
  from public.city_events e
  join rua r on r.city_id = e.city_id
  where e.status in ('active', 'awaiting_confirmation')
    and exists (
      select 1 from public.city_event_areas a
      where a.city_event_id = e.id
        and (
          a.area_type = 'city'
          or (a.area_type = 'street' and a.area_id = r.id)
          or (a.area_type = 'neighborhood' and a.area_id = r.bairro_id)
        )
    )
  order by e.started_at desc;
$$;

-- ── Grants (as assinaturas mudaram, os grants antigos foram com o drop) ─────

grant execute on function public.get_city_events(bigint, text[], text[], integer) to anon, authenticated;
grant execute on function public.get_street_city_events(uuid)                     to anon, authenticated;
grant execute on function public.get_city_event(bigint)                           to anon, authenticated;

grant execute on function public.create_city_event(
  bigint, text, text, jsonb, text, text, timestamptz, timestamptz, text, text, boolean, text, text, text
) to authenticated;

grant execute on function public.update_city_event(
  bigint, text, text, text, text, timestamptz, timestamptz, text, text, jsonb, text, text, boolean
) to authenticated;

notify pgrst, 'reload schema';

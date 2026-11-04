begin;

alter table public.city_trees drop constraint city_trees_status_check;
alter table public.city_trees add constraint city_trees_status_check check (status in ('saudavel','atencao','risco','removida','planejada'));
alter table public.city_trees
  add column planting_year integer check (planting_year between 1900 and 9999),
  add column street_id uuid references public.pavement_streets(id) on delete set null,
  add column street_name text check (length(street_name) <= 300),
  add column dap_cm numeric check (dap_cm > 0),
  add column planting_site text check (planting_site in ('calcada','canteiro','praca','parque','lote_publico')),
  add column sidewalk_width text check (sidewalk_width in ('estreita','media','larga')),
  add column power_lines text check (power_lines in ('baixa','alta','nenhuma')),
  add column wire_conflict text check (wire_conflict in ('nenhum','toca','poda_v')),
  add column equipment_conflicts text[] not null default '{}' check (equipment_conflicts <@ array['agua_esgoto','sinalizacao','semaforo','fachada']::text[]),
  add column sidewalk_damage text check (sidewalk_damage in ('nenhum','leve','severo')),
  add column health text check (health in ('boa','regular','ruim','morta')),
  add column pests text[] not null default '{}' check (pests <@ array['cupins','fungos','erva','nenhuma']::text[]),
  add column trunk_lesions text check (trunk_lesions in ('sim','nao')),
  add column trunk_lean text check (trunk_lean in ('normal','acentuada')),
  add column immediate_intervention text check (immediate_intervention in ('nenhuma','formacao','limpeza','seguranca','supressao','substituicao')),
  add column execution_term text check (execution_term in ('curto','medio','longo')),
  add column scheduled_action text check (length(scheduled_action) <= 2000),
  add column replacement_species text check (length(replacement_species) <= 200),
  add constraint city_tree_planned_year check (status <> 'planejada' or (planting_year is not null and planted_at is null)),
  add constraint city_tree_pests_consistent check (not ('nenhuma' = any(pests) and cardinality(pests) > 1)),
  add constraint city_tree_wires_consistent check (power_lines is distinct from 'nenhuma' or wire_conflict is null or wire_conflict = 'nenhum');

create index city_trees_planning_idx on public.city_trees(city_id, planting_year, bairro_id, street_id) where planting_year is not null;
create index city_trees_street_idx on public.city_trees(city_id, street_id);

-- Mantém o nome canônico e impede vínculos com ruas de outra cidade.
create function public.canonical_tree_street() returns trigger
language plpgsql set search_path = public, pg_temp as $$
declare street public.pavement_streets;
begin
  if new.street_id is not null then
    select * into street from public.pavement_streets where id = new.street_id and city_id = new.city_id;
    if not found then raise exception 'Selecione uma rua cadastrada nesta cidade.'; end if;
    new.street_name := street.name;
  end if;
  if new.status = 'planejada' then
    new.height_m := null; new.crown_diameter_m := null; new.dap_cm := null;
    new.estimated_birth_year := null; new.health := null; new.pests := '{}';
    new.trunk_lesions := null; new.trunk_lean := null; new.immediate_intervention := null;
    new.wire_conflict := null; new.sidewalk_damage := null;
  end if;
  return new;
end $$;
create trigger canonical_tree_street before insert or update on public.city_trees
for each row execute function public.canonical_tree_street();

comment on column public.city_trees.planting_year is 'Ano previsto originalmente; preservado após a confirmação do plantio por status e planted_at.';
comment on column public.city_trees.status is 'Situação da árvore; planejada representa um local de plantio, sem árvore existente.';
-- Novos campos seguem a leitura pública e as policies de gestão por cidade já existentes.

alter table public.city_trees add constraint city_tree_plan_completed check
  (planting_year is null or status in ('planejada','removida') or planted_at is not null);

-- Plantios futuros não são candidatos a poda nem a vinculação de broncas.
create or replace function public.report_tree_registration() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare t public.city_trees; payload jsonb; lat double precision; lng double precision;
begin
  if tg_op='UPDATE' and (new.tree_registration is not null or new.tree_id is distinct from old.tree_id) then
    if not public.pode_gerenciar_arborizacao(new.city_id) then raise exception 'Apenas a equipe municipal pode alterar o vínculo de uma árvore.'; end if;
  end if;
  if new.tree_id is null and new.tree_registration is null then
    new.tree_service=null; return new;
  end if;
  if new.category_id is distinct from 'poda' or new.city_id is null then raise exception 'Vínculo de árvore exige uma solicitação de arborização e cidade.'; end if;
  if new.tree_registration is not null then
    if auth.uid() is null or new.author_id is distinct from auth.uid() then raise exception 'Autenticação necessária.'; end if;
    if new.tree_id is not null then raise exception 'Selecione uma árvore ou cadastre uma nova.'; end if;
    payload=new.tree_registration;
    lat=(payload->>'latitude')::double precision; lng=(payload->>'longitude')::double precision;
    if lat is null or lng is null or not(lat between -90 and 90 and lng between -180 and 180) then raise exception 'Localização inválida.'; end if;
    perform pg_advisory_xact_lock(hashtext('tree-registration'),hashtext(new.city_id::text));
    -- Evita duplicar o mesmo ponto inclusive em envios concorrentes.
    select * into t from public.city_trees where city_id=new.city_id and status not in ('removida','planejada')
      and public.tree_distance_m(latitude,longitude,lat,lng)<=3
      order by created_at limit 1;
    if t.id is null then
      insert into public.city_trees(city_id,common_name,species_id,bairro_id,latitude,longitude,address,photo_url)
      values(new.city_id,'Não identificada',nullif(payload->>'species_id','')::uuid,nullif(payload->>'bairro_id','')::uuid,
        lat,lng,left(payload->>'address',300),nullif(payload->>'photo_url','')) returning * into t;
    end if;
    new.tree_id=t.id; new.tree_registration=null;
  else select * into t from public.city_trees where id=new.tree_id;
  end if;
  if t.id is null or t.city_id<>new.city_id then raise exception 'Árvore não encontrada nesta cidade.'; end if;
  if t.status='planejada' then raise exception 'O plantio ainda não foi realizado.'; end if;
  if tg_op='INSERT' and t.status in ('removida','planejada') then raise exception 'Selecione uma árvore existente no inventário ativo.'; end if;
  if new.location is null or public.tree_distance_m(extensions.st_y(new.location::extensions.geometry),extensions.st_x(new.location::extensions.geometry),t.latitude,t.longitude)>80 then
    raise exception 'A árvore deve estar a até 80 metros do local da solicitação.';
  end if;
  new.tree_service=coalesce(new.tree_service,'poda');
  return new;
end $$;

create or replace function public.nearby_report_trees(p_lat double precision,p_lng double precision,p_city_id bigint default null)
returns setof public.city_trees language sql stable security invoker set search_path=public,pg_temp as $$
  select t.* from public.city_trees t where t.status not in ('removida','planejada') and (p_city_id is null or t.city_id=p_city_id)
    and public.tree_distance_m(t.latitude,t.longitude,p_lat,p_lng)<=80
  order by public.tree_distance_m(t.latitude,t.longitude,p_lat,p_lng),t.id
$$;

create or replace function public.schedule_city_tree_maintenance(
  p_city_id bigint,
  p_tree_ids uuid[],
  p_action text,
  p_due_at date default null
) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare
  v_ids uuid[];
  v_count integer;
begin
  if auth.uid() is null or p_city_id is null or not public.pode_gerenciar_arborizacao(p_city_id) then
    raise exception 'Sem permissão para programar manejo nesta cidade.' using errcode='42501';
  end if;
  if coalesce(cardinality(p_tree_ids),0)=0 or array_position(p_tree_ids,null) is not null then
    raise exception 'Selecione pelo menos uma árvore válida.' using errcode='22023';
  end if;
  if p_action is null or p_action not in ('vistoria','poda','tratamento','remocao','plantio') then
    raise exception 'Selecione um manejo válido.' using errcode='22023';
  end if;
  if p_due_at is not null and (not isfinite(p_due_at) or p_due_at<date '0001-01-01' or p_due_at>date '9999-12-31') then
    raise exception 'Informe um prazo válido.' using errcode='22023';
  end if;
  select array_agg(distinct id order by id) into v_ids from unnest(p_tree_ids) as input(id);
  -- A ordem dos locks evita conflitos entre lotes concorrentes. Uma árvore
  -- excluída, removida ou de outra cidade invalida o lote inteiro antes de alterar dados.
  perform t.id from public.city_trees t
    where t.city_id=p_city_id and t.id=any(v_ids) and t.status not in ('removida','planejada')
    order by t.id for update;
  get diagnostics v_count=row_count;
  if v_count<>cardinality(v_ids) then
    raise exception 'A seleção contém árvores indisponíveis. Atualize o mapa e selecione novamente.' using errcode='22023';
  end if;
  update public.city_trees t set maintenance_action=p_action,maintenance_due_at=p_due_at
    where t.city_id=p_city_id and t.id=any(v_ids) and t.status not in ('removida','planejada');
  get diagnostics v_count=row_count;
  if v_count<>cardinality(v_ids) then
    raise exception 'Não foi possível atualizar todas as árvores. Nenhuma alteração foi mantida.' using errcode='42501';
  end if;
  -- O resultado compacto não sofre truncamento pela paginação do PostgREST.
  return jsonb_build_object('updated_count',v_count,'updated_at',now());
end;
$$;

revoke all on function public.schedule_city_tree_maintenance(bigint,uuid[],text,date) from public,anon;
grant execute on function public.schedule_city_tree_maintenance(bigint,uuid[],text,date) to authenticated;


notify pgrst, 'reload schema';
commit;

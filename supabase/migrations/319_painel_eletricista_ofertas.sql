begin;

-- A oferta mostra apenas informações de trabalho. O detalhe completo da ordem
-- continua protegido pela RLS de demandas_municipais após a atribuição.
create or replace function public.listar_ofertas_eletricista(
  p_prefeitura uuid,
  p_limit integer default 60,
  p_offset integer default 0,
  p_tipo text default null,
  p_id uuid default null,
  p_latitude double precision default null,
  p_longitude double precision default null
)
returns table (
  tipo text, id uuid, protocolo text, titulo text, descricao text,
  endereco text, bairro text, issue_type text, prioridade text,
  prazo_em timestamptz, created_at timestamptz,
  latitude double precision, longitude double precision,
  pole_id bigint, canal_id uuid, distancia_m double precision
)
language plpgsql stable security definer set search_path = public, pg_temp
as $$
declare v_city bigint;
begin
  select p.city_id into v_city
  from public.prefeituras p
  where p.id = p_prefeitura and p.status = 'ativa'
    and 'iluminacao' = any(p.categorias_habilitadas)
    and public.pode_acessar_prefeitura(auth.uid(), p.city_id);
  if v_city is null then raise exception 'Sem acesso às ofertas desta prefeitura'; end if;
  if p_tipo is not null and p_tipo not in ('ordem', 'solicitacao') then
    raise exception 'Tipo de oferta inválido';
  end if;
  if (p_latitude is null) <> (p_longitude is null)
    or (p_latitude is not null and (p_latitude not between -90 and 90
      or p_longitude not between -180 and 180)) then
    raise exception 'Coordenadas inválidas';
  end if;

  return query
  with canais as (
    select distinct c.id
    from public.orgao_membros m
    join public.orgao_canais c on c.id = m.canal_id
    join public.orgao_categorias oc on oc.canal_id = c.id
      and oc.city_id = v_city and oc.category_id = 'iluminacao'
    where m.user_id = auth.uid() and m.ativo and m.papel = 'eletricista'
      and c.city_id = v_city and c.ativo and not c.canal_triagem
  ), ofertas as (
    select 'ordem'::text as tipo, d.id, d.protocolo, d.titulo,
      null::text as descricao, d.endereco, d.bairro, d.issue_type, d.prioridade,
      d.prazo_em, d.created_at, d.latitude, d.longitude, d.pole_id, d.canal_id
    from public.demandas_municipais d
    where d.prefeitura_id = p_prefeitura and d.category_id = 'iluminacao'
      and d.atribuido_a is null and d.status in ('aberta', 'triagem', 'programada')
      and exists(select 1 from canais c where c.id = d.canal_id)
    union all
    select 'solicitacao'::text, r.id, r.protocol, r.title,
      r.description, r.address, r.neighborhood, r.issue_type,
      coalesce(caso.prioridade, 'normal'), caso.prazo_em, r.created_at,
      extensions.st_y(r.location::extensions.geometry),
      extensions.st_x(r.location::extensions.geometry), r.pole_id, ch.id
    from public.reports r
    left join public.orgao_casos caso on caso.report_id = r.id
    left join public.orgao_canais canal_caso on canal_caso.id = caso.canal_id
    cross join lateral (select c.id from canais c
      where caso.canal_id is null or caso.canal_id = c.id or canal_caso.canal_triagem
      order by case when c.id = caso.canal_id then 0 else 1 end, c.id limit 1) ch
    where r.city_id = v_city and r.category_id = 'iluminacao'
      and r.status in ('pending', 'in-progress')
      and r.is_public and coalesce(r.moderation_status, 'approved') = 'approved'
      and not coalesce(r.is_petition, false)
      and caso.atribuido_a is null
      and (caso.status is null or caso.status in ('nova', 'recebida', 'triagem', 'programada'))
      and not exists(select 1 from public.demanda_broncas b where b.report_id = r.id)
      and not exists(select 1 from public.demandas_municipais d where d.report_id = r.id)
  )
  select o.tipo, o.id, o.protocolo, o.titulo, o.descricao, o.endereco,
    o.bairro, o.issue_type, o.prioridade, o.prazo_em, o.created_at,
    o.latitude, o.longitude, o.pole_id, o.canal_id,
    case when p_latitude is not null and o.latitude is not null and o.longitude is not null
      then extensions.st_distance(
        extensions.st_setsrid(extensions.st_makepoint(p_longitude, p_latitude), 4326)::extensions.geography,
        extensions.st_setsrid(extensions.st_makepoint(o.longitude, o.latitude), 4326)::extensions.geography)
    end
  from ofertas o
  where (p_tipo is null or o.tipo = p_tipo) and (p_id is null or o.id = p_id)
  order by case when o.prioridade = 'urgente' then 0
    when o.tipo = 'ordem' then 1 else 2 end,
    case when p_latitude is not null and o.latitude is not null and o.longitude is not null
      then extensions.st_distance(
        extensions.st_setsrid(extensions.st_makepoint(p_longitude, p_latitude), 4326)::extensions.geography,
        extensions.st_setsrid(extensions.st_makepoint(o.longitude, o.latitude), 4326)::extensions.geography)
    end asc nulls last,
    case o.prioridade when 'alta' then 0 when 'normal' then 1 else 2 end,
    o.prazo_em asc nulls last, o.created_at asc, o.id
  limit least(greatest(coalesce(p_limit, 60), 1), 100)
  offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

-- A mesma trava da RPC salvar_demanda_municipal serializa aceites, novas ordens
-- e vínculos da prefeitura. Repetir o aceite do mesmo profissional é seguro.
create or replace function public.aceitar_oferta_eletricista(
  p_prefeitura uuid, p_tipo text, p_id uuid
)
returns uuid language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_city bigint;
  v_canal uuid;
  v_demanda public.demandas_municipais%rowtype;
  v_report public.reports%rowtype;
  v_regra public.prefeitura_servico_regras%rowtype;
  v_caso public.orgao_casos%rowtype;
begin
  if auth.uid() is null or p_id is null or coalesce(p_tipo, '') not in ('ordem', 'solicitacao') then
    raise exception 'Oferta inválida';
  end if;
  select p.city_id into v_city from public.prefeituras p
  where p.id = p_prefeitura and p.status = 'ativa'
    and 'iluminacao' = any(p.categorias_habilitadas)
    and public.pode_acessar_prefeitura(auth.uid(), p.city_id);
  if v_city is null then raise exception 'Sem acesso a esta prefeitura'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_prefeitura::text, 0));

  if p_tipo = 'ordem' then
    select * into v_demanda from public.demandas_municipais d
    where d.id = p_id and d.prefeitura_id = p_prefeitura for update;
    if v_demanda.id is null then raise exception 'Serviço indisponível'; end if;
    if not exists (
      select 1 from public.orgao_membros m
      join public.orgao_canais c on c.id = m.canal_id
      join public.orgao_categorias oc on oc.canal_id = c.id
        and oc.city_id = v_city and oc.category_id = 'iluminacao'
      where m.user_id = auth.uid() and m.ativo and m.papel = 'eletricista'
        and m.canal_id = v_demanda.canal_id and c.city_id = v_city
        and c.ativo and not c.canal_triagem
    ) then raise exception 'Sem permissão para aceitar este serviço'; end if;
    if v_demanda.atribuido_a = auth.uid() then return v_demanda.id; end if;
    if v_demanda.category_id is distinct from 'iluminacao' or v_demanda.atribuido_a is not null
      or v_demanda.status not in ('aberta', 'triagem', 'programada') then
      raise exception 'Este serviço já foi assumido ou não está disponível' using errcode = '23505';
    end if;
    update public.demandas_municipais
      set atribuido_a = auth.uid(), updated_by = auth.uid()
      where id = v_demanda.id;
    return v_demanda.id;
  end if;

  select * into v_report from public.reports r
  where r.id = p_id and r.city_id = v_city for update;
  if v_report.id is null then raise exception 'Solicitação indisponível'; end if;
  select d.* into v_demanda from public.demandas_municipais d
  where d.prefeitura_id = p_prefeitura and
    (d.report_id = p_id or exists (
      select 1 from public.demanda_broncas b where b.demanda_id = d.id and b.report_id = p_id))
  limit 1;
  if v_demanda.id is not null then
    if v_demanda.atribuido_a = auth.uid() then return v_demanda.id; end if;
    raise exception 'Esta solicitação já tem uma ordem de serviço' using errcode = '23505';
  end if;
  if v_report.category_id is distinct from 'iluminacao'
    or v_report.status not in ('pending', 'in-progress')
    or not v_report.is_public
    or coalesce(v_report.moderation_status, 'approved') <> 'approved'
    or coalesce(v_report.is_petition, false) then
    raise exception 'Solicitação não disponível para aceite';
  end if;
  select * into v_caso from public.orgao_casos where report_id = p_id for update;
  if v_caso.report_id is not null and (v_caso.atribuido_a is not null
    or v_caso.status not in ('nova', 'recebida', 'triagem', 'programada')) then
    raise exception 'Solicitação já está em atendimento' using errcode = '23505';
  end if;
  select c.id into v_canal
  from public.orgao_membros m
  join public.orgao_canais c on c.id = m.canal_id
  join public.orgao_categorias oc on oc.canal_id = c.id
    and oc.city_id = v_city and oc.category_id = 'iluminacao'
  left join public.orgao_canais canal_caso on canal_caso.id = v_caso.canal_id
  where m.user_id = auth.uid() and m.ativo and m.papel = 'eletricista'
    and c.city_id = v_city and c.ativo and not c.canal_triagem
    and (v_caso.canal_id is null or v_caso.canal_id = c.id or canal_caso.canal_triagem)
  order by case when c.id = v_caso.canal_id then 0 else 1 end, c.id limit 1;
  if v_canal is null then raise exception 'Sem permissão para aceitar esta solicitação'; end if;
  select * into v_regra from public.prefeitura_servico_regras
    where prefeitura_id = p_prefeitura and category_id = 'iluminacao';

  insert into public.demandas_municipais (
    prefeitura_id, report_id, titulo, descricao, bairro, endereco,
    latitude, longitude, pole_id, category_id, issue_type, prioridade,
    status, canal_id, atribuido_a, origem, prazo_em, criado_por, updated_by
  ) values (
    p_prefeitura, p_id, left(case when length(btrim(coalesce(v_report.title, ''))) >= 3
      then btrim(v_report.title) else 'Manutenção de iluminação' end, 180),
    v_report.description, v_report.neighborhood, v_report.address,
    extensions.st_y(v_report.location::extensions.geometry),
    extensions.st_x(v_report.location::extensions.geometry), v_report.pole_id,
    'iluminacao', v_report.issue_type, coalesce(v_caso.prioridade, v_regra.prioridade, 'normal'),
    'aberta', v_canal, auth.uid(), 'bronca',
    coalesce(v_caso.prazo_em, case when v_regra.atendimento_horas > 0
      then now() + make_interval(hours => v_regra.atendimento_horas) end),
    auth.uid(), auth.uid()
  ) returning * into v_demanda;
  insert into public.demanda_broncas(demanda_id, report_id, vinculado_por)
    values(v_demanda.id, p_id, auth.uid());
  insert into public.demanda_eventos(demanda_id, tipo, detalhes, criado_por)
    values(v_demanda.id, 'bronca_vinculada', jsonb_build_object('report_id', p_id), auth.uid());
  update public.orgao_casos
    set canal_id = v_canal, atribuido_a = auth.uid(), status = 'atribuida',
      protocolo = v_demanda.protocolo, updated_at = now()
    where report_id = p_id;
  perform public.publicar_estado_demanda(v_demanda.id, p_id, null);
  return v_demanda.id;
end;
$$;

create index if not exists demandas_municipais_ofertas_eletricista_idx
  on public.demandas_municipais(prefeitura_id, canal_id, prioridade, created_at)
  where category_id = 'iluminacao' and atribuido_a is null
    and status in ('aberta', 'triagem', 'programada');

-- O aviso genérico da secretaria aponta para a caixa administrativa. Para
-- eletricistas, a oferta tem seu próprio aviso e abre a prévia do serviço.
create or replace function public.orgao_caso_criado()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  insert into public.orgao_caso_eventos (report_id, canal_id, tipo, para_status, detalhes)
  values (new.report_id, new.canal_id, 'encaminhada', new.status,
    jsonb_build_object('origem', 'roteamento_automatico'));
  if coalesce(current_setting('app.silenciar_notificacao_orgao', true), '') <> '1' then
    insert into public.notifications (user_id, type, title, message, link, report_id, is_read, created_at)
    select destinatarios.user_id, 'agency_case', 'Nova demanda para sua secretaria',
      coalesce(r.title, 'Uma nova bronca foi encaminhada ao orgao.'),
      '/prefeitura/broncas', new.report_id, false, now()
    from (
      select m.user_id from public.orgao_membros m
      where m.canal_id = new.canal_id and m.ativo and m.papel <> 'eletricista'
      union
      select pm.user_id from public.prefeitura_membros pm
      join public.prefeituras p on p.id = pm.prefeitura_id and p.status = 'ativa'
      join public.orgao_canais c on c.city_id = p.city_id
      where c.id = new.canal_id and pm.ativo and pm.papel = 'administrador'
    ) destinatarios
    join public.reports r on r.id = new.report_id;
  end if;
  return new;
end $$;

-- O pipeline de notifications já existente entrega push aos aparelhos inscritos.
-- O link sempre abre a prévia; a notificação nunca aceita o serviço sozinha.
create or replace function public.notificar_oferta_eletricista(
  p_city bigint, p_canal uuid, p_tipo text, p_id uuid,
  p_titulo text, p_prioridade text
)
returns void language sql security definer set search_path = public, pg_temp as $$
  insert into public.notifications(user_id, type, title, message, link, is_read, created_at)
  select distinct m.user_id, 'agency_case',
    case when p_prioridade = 'urgente' then 'Serviço urgente disponível'
      else 'Serviço de iluminação disponível' end,
    left(coalesce(p_titulo, 'Novo atendimento'), 180),
    '/prefeitura/eletricista?oferta=' || p_tipo || ':' || p_id::text,
    false, now()
  from public.orgao_membros m
  join public.orgao_canais c on c.id = m.canal_id
  join public.orgao_categorias oc on oc.canal_id = c.id
    and oc.city_id = p_city and oc.category_id = 'iluminacao'
  where m.ativo and m.papel = 'eletricista'
    and c.city_id = p_city and c.ativo and not c.canal_triagem
    and public.pode_acessar_prefeitura(m.user_id, p_city)
    and (p_canal is null or p_canal = c.id)
    and not exists (
      select 1 from public.notifications n
      where n.user_id = m.user_id
        and n.link = '/prefeitura/eletricista?oferta=' || p_tipo || ':' || p_id::text
        and n.created_at > now() - interval '1 day'
        and (p_prioridade <> 'urgente' or n.title = 'Serviço urgente disponível')
    );
$$;

create or replace function public.aviso_ordem_disponivel_eletricista()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare v_city bigint;
begin
  if new.category_id is distinct from 'iluminacao' or new.atribuido_a is not null
    or new.status not in ('aberta', 'triagem', 'programada') then return new; end if;
  if tg_op = 'UPDATE' and old.atribuido_a is null
    and old.status in ('aberta', 'triagem', 'programada')
    and old.canal_id is not distinct from new.canal_id
    and old.prioridade is not distinct from new.prioridade then return new; end if;
  select city_id into v_city from public.prefeituras
    where id = new.prefeitura_id and status = 'ativa'
      and 'iluminacao' = any(categorias_habilitadas);
  if v_city is not null and new.canal_id is not null then
    perform public.notificar_oferta_eletricista(
      v_city, new.canal_id, 'ordem', new.id, new.titulo, new.prioridade);
  end if;
  return new;
end $$;
create trigger aviso_ordem_disponivel_eletricista
after insert or update of atribuido_a, status, prioridade, canal_id
on public.demandas_municipais for each row
execute function public.aviso_ordem_disponivel_eletricista();

create or replace function public.aviso_solicitacao_disponivel_eletricista()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare v_prefeitura uuid; v_city bigint; v_canal uuid; v_prioridade text;
begin
  if new.category_id is distinct from 'iluminacao' or new.status not in ('pending', 'in-progress')
    or not new.is_public or coalesce(new.moderation_status, 'approved') <> 'approved'
    or coalesce(new.is_petition, false) then return new; end if;
  if tg_op = 'UPDATE' and old.status in ('pending', 'in-progress')
    and old.is_public and coalesce(old.moderation_status, 'approved') = 'approved'
    then return new; end if;
  if exists(select 1 from public.demanda_broncas where report_id = new.id)
    or exists(select 1 from public.demandas_municipais where report_id = new.id) then
    return new;
  end if;
  select caso.canal_id, caso.prioridade into v_canal, v_prioridade
  from public.orgao_casos caso where caso.report_id = new.id
    and caso.atribuido_a is null
    and caso.status in ('nova', 'recebida', 'triagem', 'programada');
  if found then
    if exists(select 1 from public.orgao_canais
      where id = v_canal and canal_triagem) then v_canal := null; end if;
  elsif exists(select 1 from public.orgao_casos where report_id = new.id) then
    return new;
  end if;
  select id, city_id into v_prefeitura, v_city from public.prefeituras
    where city_id = new.city_id and status = 'ativa'
      and 'iluminacao' = any(categorias_habilitadas) limit 1;
  if v_prefeitura is null then return new; end if;
  perform public.notificar_oferta_eletricista(
    v_city, v_canal, 'solicitacao', new.id, new.title, coalesce(v_prioridade, 'normal'));
  return new;
end $$;
create trigger aviso_solicitacao_disponivel_eletricista
after insert or update of status, moderation_status, is_public
on public.reports for each row
execute function public.aviso_solicitacao_disponivel_eletricista();

-- A triagem pode elevar uma solicitação a urgente depois do primeiro aviso.
create or replace function public.aviso_caso_disponivel_eletricista()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare v_report public.reports%rowtype; v_canal uuid;
begin
  if new.atribuido_a is not null or new.status not in ('nova', 'recebida', 'triagem', 'programada')
    or (old.atribuido_a is null and old.status in ('nova', 'recebida', 'triagem', 'programada')
      and old.canal_id is not distinct from new.canal_id
      and old.prioridade is not distinct from new.prioridade) then return new; end if;
  if exists(select 1 from public.demanda_broncas where report_id = new.report_id)
    or exists(select 1 from public.demandas_municipais where report_id = new.report_id) then
    return new;
  end if;
  select * into v_report from public.reports where id = new.report_id;
  if v_report.category_id is distinct from 'iluminacao' or v_report.status not in ('pending', 'in-progress')
    or not v_report.is_public or coalesce(v_report.moderation_status, 'approved') <> 'approved'
    or coalesce(v_report.is_petition, false) then return new; end if;
  v_canal := new.canal_id;
  if exists(select 1 from public.orgao_canais where id = v_canal and canal_triagem) then
    v_canal := null;
  end if;
  if exists(select 1 from public.prefeituras
    where city_id = v_report.city_id and status = 'ativa'
      and 'iluminacao' = any(categorias_habilitadas)) then
    perform public.notificar_oferta_eletricista(v_report.city_id, v_canal,
      'solicitacao', v_report.id, v_report.title, new.prioridade);
  end if;
  return new;
end $$;
create trigger aviso_caso_disponivel_eletricista
after update of prioridade, atribuido_a, status, canal_id
on public.orgao_casos for each row
execute function public.aviso_caso_disponivel_eletricista();

revoke all on function public.notificar_oferta_eletricista(bigint, uuid, text, uuid, text, text)
  from public, anon, authenticated;

revoke all on function public.listar_ofertas_eletricista(uuid, integer, integer, text, uuid, double precision, double precision) from public, anon;
revoke all on function public.aceitar_oferta_eletricista(uuid, text, uuid) from public, anon;
grant execute on function public.listar_ofertas_eletricista(uuid, integer, integer, text, uuid, double precision, double precision) to authenticated;
grant execute on function public.aceitar_oferta_eletricista(uuid, text, uuid) to authenticated;

notify pgrst, 'reload schema';
commit;

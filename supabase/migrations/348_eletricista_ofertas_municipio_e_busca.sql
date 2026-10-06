begin;

-- O vínculo ativo pertence ao município. A secretaria da ordem é preservada.
create or replace function public.eletricista_ativo_municipio(p_user uuid,p_city bigint)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select public.pode_acessar_prefeitura(p_user,p_city) and exists (
    select 1 from public.orgao_membros m
    join public.orgao_canais c on c.id=m.canal_id
    join public.orgao_categorias oc on oc.canal_id=c.id and oc.city_id=p_city and oc.category_id='iluminacao'
    where m.user_id=p_user and m.ativo and m.papel='eletricista'
      and c.city_id=p_city and c.ativo and not c.canal_triagem
  )
$$;
revoke all on function public.eletricista_ativo_municipio(uuid,bigint) from public,anon;
grant execute on function public.eletricista_ativo_municipio(uuid,bigint) to authenticated;

create or replace function public.pode_ver_demanda(p_user uuid,p_demanda uuid)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select exists(select 1 from public.demandas_municipais d join public.prefeituras p on p.id=d.prefeitura_id
    where d.id=p_demanda and public.pode_acessar_prefeitura(p_user,p.city_id)
      and (public.pode_administrar_prefeitura(p_user,p.city_id)
        or public.papel_no_orgao(p_user,d.canal_id) in ('gestor','operador','leitura')
        or (d.category_id='iluminacao' and d.atribuido_a=p_user
          and public.eletricista_ativo_municipio(p_user,p.city_id))))
$$;
create or replace function public.pode_operar_demanda(p_user uuid,p_demanda uuid)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select exists(select 1 from public.demandas_municipais d join public.prefeituras p on p.id=d.prefeitura_id
    where d.id=p_demanda and public.pode_acessar_prefeitura(p_user,p.city_id)
      and (public.pode_administrar_prefeitura(p_user,p.city_id)
        or public.papel_no_orgao(p_user,d.canal_id) in ('gestor','operador')
        or (d.category_id='iluminacao' and d.atribuido_a=p_user
          and public.eletricista_ativo_municipio(p_user,p.city_id))))
$$;

-- Atualiza os pontos de autorização, mantendo os controles de versão,
-- concorrência, anexos e execução das RPCs já instaladas.
create or replace function pg_temp.ajustar_eletricista(signature text,trecho text,substituto text)
returns void language plpgsql as $$
declare definition text;
begin
  definition=replace(pg_get_functiondef(signature::regprocedure),E'\r\n',E'\n');
  if position(trecho in definition)=0 then
    -- A antiga versão 346 pode ter sido confirmada antes da colisão de versões.
    -- Aceita a definição já atualizada, sem ocultar alterações inesperadas.
    if position(substituto in definition)>0 then return; end if;
    raise exception 'Definição inesperada: %',signature;
  end if;
  execute replace(definition,trecho,substituto);
end $$;

select pg_temp.ajustar_eletricista('public.listar_ofertas_eletricista(uuid,integer,integer,text,uuid,double precision,double precision)',
  'and exists(select 1 from canais c where c.id = d.canal_id)',
  'and exists(select 1 from canais)');
select pg_temp.ajustar_eletricista('public.aceitar_oferta_eletricista(uuid,text,uuid)',
  'and m.canal_id = v_demanda.canal_id and c.city_id = v_city',
  'and c.city_id = v_city');
select pg_temp.ajustar_eletricista('public.aceitar_oferta_eletricista(uuid,text,uuid)',
  $old$if v_demanda.id is null then raise exception 'Serviço indisponível'; end if;$old$,
  $new$if v_demanda.id is null or v_demanda.category_id is distinct from 'iluminacao' then
      raise exception 'Serviço indisponível'; end if;
    select c.id into v_canal from public.orgao_membros m
    join public.orgao_canais c on c.id=m.canal_id
    join public.orgao_categorias oc on oc.canal_id=c.id and oc.city_id=v_city and oc.category_id='iluminacao'
    where m.user_id=auth.uid() and m.ativo and m.papel='eletricista'
      and c.city_id=v_city and c.ativo and not c.canal_triagem order by c.id limit 1;$new$);
select pg_temp.ajustar_eletricista('public.aceitar_oferta_eletricista(uuid,text,uuid)',
  $old$set atribuido_a = auth.uid(), status='em_andamento', updated_by = auth.uid()$old$,
  $new$set canal_id=coalesce(canal_id,v_canal), atribuido_a = auth.uid(), status='em_andamento', updated_by = auth.uid()$new$);
select pg_temp.ajustar_eletricista('public.validar_demanda_municipal()',
  $old$if new.atribuido_a is not null and not exists(select 1 from public.orgao_membros m where m.user_id=new.atribuido_a and m.canal_id=new.canal_id and m.ativo and m.papel in ('gestor','operador','eletricista')) then$old$,
  $new$if new.atribuido_a is not null
    and not (new.category_id='iluminacao' and public.eletricista_ativo_municipio(new.atribuido_a,v_city))
    and not exists(select 1 from public.orgao_membros m where m.user_id=new.atribuido_a and m.canal_id=new.canal_id and m.ativo and m.papel in ('gestor','operador','eletricista')) then$new$);
select pg_temp.ajustar_eletricista('public.salvar_demanda_municipal(uuid,uuid,jsonb,integer,uuid[],text,text,text,jsonb)',
  $old$    if d.canal_id is null or (public.papel_no_orgao(auth.uid(),d.canal_id) not in ('gestor','operador') and not (not v_nova and public.papel_no_orgao(auth.uid(),d.canal_id)='eletricista' and anterior.atribuido_a=auth.uid()))
      or public.papel_no_orgao(auth.uid(),d.canal_id) is null then raise exception 'Selecione uma secretaria que você pode operar'; end if;$old$,
  $new$    if d.canal_id is null or not (
      coalesce(public.papel_no_orgao(auth.uid(),d.canal_id) in ('gestor','operador'),false)
      or (not v_nova and d.category_id='iluminacao' and anterior.atribuido_a=auth.uid()
        and public.eletricista_ativo_municipio(auth.uid(),v_city))
    ) then raise exception 'Selecione uma secretaria que você pode operar'; end if;$new$);
select pg_temp.ajustar_eletricista('public.salvar_demanda_municipal(uuid,uuid,jsonb,integer,uuid[],text,text,text,jsonb)',
  $old$public.papel_no_orgao(auth.uid(),d.canal_id)='eletricista'$old$,
  $new$(d.category_id='iluminacao' and public.eletricista_ativo_municipio(auth.uid(),v_city))$new$);
select pg_temp.ajustar_eletricista('public.notificar_oferta_eletricista(bigint,uuid,text,uuid,text,text)',
  'and (p_canal is null or p_canal = c.id)',
  $new$and (p_tipo='ordem' or p_canal is null or p_canal=c.id)$new$);

-- Busca por número/placa/endereço e por protocolo da ordem ou solicitação.
-- As ordens de outro responsável nunca participam dos resultados.
create or replace function public.buscar_mapa_eletricista(p_prefeitura uuid,p_busca text)
returns table(tipo text,poste jsonb,ordem_id uuid,protocolo text,titulo text,latitude double precision,longitude double precision)
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare v_city bigint; v_term text;
begin
  select p.city_id into v_city from public.prefeituras p
  where p.id=p_prefeitura and p.status='ativa' and 'iluminacao'=any(p.categorias_habilitadas)
    and public.eletricista_ativo_municipio(auth.uid(),p.city_id);
  if v_city is null then raise exception 'Sem acesso ao mapa desta prefeitura'; end if;
  v_term=btrim(coalesce(p_busca,''));
  if v_term='' then return; end if;
  -- % e _ digitados são literais, não coringas de pesquisa.
  v_term='%'||replace(replace(replace(v_term,E'\\',E'\\\\'),'%',E'\\%'),'_',E'\\_')||'%';
  return query
  with resultados as (
    select 1 as prioridade,'poste'::text as tipo,to_jsonb(p)-'raw_properties'-'geom' as poste,
      null::uuid as ordem_id,null::text as protocolo,p.identifier as titulo,p.latitude,p.longitude
    from public.poles p where p.city_id=v_city and p.lighting_status is distinct from 'removido'
      and (p.identifier ilike v_term or p.plate ilike v_term or p.address ilike v_term)
    union all
    select 0,case when d.atribuido_a=auth.uid() then 'minha_ordem' else 'ordem' end,case when p.id is not null then to_jsonb(p)-'raw_properties'-'geom' end,
      d.id,d.protocolo,d.titulo,coalesce(p.latitude,d.latitude),coalesce(p.longitude,d.longitude)
    from public.demandas_municipais d
    left join lateral (
      select br.* from public.reports br
      where br.city_id=v_city and (br.id=d.report_id or exists (
        select 1 from public.demanda_broncas b where b.demanda_id=d.id and b.report_id=br.id))
      order by case when br.protocol ilike v_term then 0 when br.id=d.report_id then 1 else 2 end,br.id limit 1
    ) r on true
    left join public.poles p on p.id=coalesce(case when r.protocol ilike v_term then r.pole_id end,d.pole_id,r.pole_id) and p.city_id=v_city
      and p.lighting_status is distinct from 'removido'
    where d.prefeitura_id=p_prefeitura and d.category_id='iluminacao'
      and (d.atribuido_a=auth.uid() or (d.atribuido_a is null and d.status in ('aberta','triagem','programada','em_andamento')))
      and (d.protocolo ilike v_term or r.protocol ilike v_term or exists (
        select 1 from public.demanda_broncas b join public.reports br on br.id=b.report_id
        where b.demanda_id=d.id and br.city_id=v_city and br.protocol ilike v_term))
    union all
    select 0,'solicitacao',to_jsonb(p)-'raw_properties'-'geom',null::uuid,r.protocol,r.title,p.latitude,p.longitude
    from public.reports r join public.poles p on p.id=r.pole_id and p.city_id=v_city
    where r.city_id=v_city and r.category_id='iluminacao' and r.protocol ilike v_term
      and r.is_public and coalesce(r.moderation_status,'approved')='approved'
      and not coalesce(r.is_petition,false) and r.status in ('pending','in-progress')
      and p.lighting_status is distinct from 'removido'
      and not exists(select 1 from public.demanda_broncas b where b.report_id=r.id)
      and not exists(select 1 from public.demandas_municipais d where d.report_id=r.id)
      and not exists(select 1 from public.orgao_casos c where c.report_id=r.id and c.atribuido_a is not null and c.atribuido_a<>auth.uid())
  ) select r.tipo,r.poste,r.ordem_id,r.protocolo,r.titulo,r.latitude,r.longitude
    from resultados r order by r.prioridade,r.protocolo,r.titulo limit 20;
end $$;
revoke all on function public.buscar_mapa_eletricista(uuid,text) from public,anon;
grant execute on function public.buscar_mapa_eletricista(uuid,text) to authenticated;

commit;

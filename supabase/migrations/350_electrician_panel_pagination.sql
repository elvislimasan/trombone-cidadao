begin;

-- Filtra e ordena antes de paginar. Nunca envia toda a fila ao navegador.
create or replace function public.listar_painel_eletricista(
  p_prefeitura uuid, p_aba text default 'minhas', p_etapa text default 'fazer',
  p_busca text default '', p_ordem text default 'priority',
  p_pagina integer default 1, p_tamanho integer default 20,
  p_adiadas text[] default '{}'
)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare
  v_city bigint;
  v_term text := lower(btrim(coalesce(p_busca,'')));
  v_size integer := least(greatest(coalesce(p_tamanho,20),1),50);
begin
  select p.city_id into v_city from public.prefeituras p
  where p.id=p_prefeitura and p.status='ativa'
    and 'iluminacao'=any(p.categorias_habilitadas)
    and public.eletricista_ativo_municipio(auth.uid(),p.city_id);
  if v_city is null then raise exception 'Sem acesso ao painel desta prefeitura'; end if;
  if p_aba is null or p_aba not in ('minhas','disponiveis')
    or p_etapa is null or p_etapa not in ('fazer','execucao','conferencia','historico')
    or p_ordem is null or p_ordem not in ('priority','recent','oldest') then
    raise exception 'Filtros inválidos';
  end if;

  return (
    with canais as (
      select distinct c.id from public.orgao_membros m
      join public.orgao_canais c on c.id=m.canal_id
      join public.orgao_categorias oc on oc.canal_id=c.id
        and oc.city_id=v_city and oc.category_id='iluminacao'
      where m.user_id=auth.uid() and m.ativo and m.papel='eletricista'
        and c.city_id=v_city and c.ativo and not c.canal_triagem
    ), minhas as (
      select 'ordem'::text tipo,d.id,d.protocolo,d.titulo,d.descricao,
        d.endereco,d.bairro,d.issue_type,d.prioridade,d.prazo_em,d.created_at,
        d.latitude,d.longitude,d.pole_id,d.canal_id,d.report_id,d.status,
        d.revisao_pendente,d.previsto_em,
        case when d.revisao_pendente or d.status in ('aguardando_confirmacao','aguardando_informacao','aguardando_recurso') then 'conferencia'
          when d.status='em_andamento' then 'execucao'
          when d.status in ('aberta','triagem','programada') then 'fazer'
          else 'historico' end etapa
      from public.demandas_municipais d
      where p_aba='minhas' and d.prefeitura_id=p_prefeitura
        and d.category_id='iluminacao' and d.atribuido_a=auth.uid()
    ), ofertas as (
      select 'ordem'::text tipo,d.id,d.protocolo,d.titulo,d.descricao,
        d.endereco,d.bairro,d.issue_type,d.prioridade,d.prazo_em,d.created_at,
        d.latitude,d.longitude,d.pole_id,d.canal_id,d.report_id,d.status,
        d.revisao_pendente,d.previsto_em,null::text etapa
      from public.demandas_municipais d
      where p_aba='disponiveis' and d.prefeitura_id=p_prefeitura
        and d.category_id='iluminacao' and d.atribuido_a is null
        and d.status in ('aberta','triagem','programada','em_andamento')
        and exists(select 1 from canais)
      union all
      select 'solicitacao',r.id,r.protocol,r.title,r.description,
        r.address,r.neighborhood,r.issue_type,coalesce(caso.prioridade,'normal'),caso.prazo_em,r.created_at,
        extensions.st_y(r.location::extensions.geometry),extensions.st_x(r.location::extensions.geometry),
        r.pole_id,ch.id,r.id,r.status,false,null::timestamptz,null::text
      from public.reports r
      left join public.orgao_casos caso on caso.report_id=r.id
      left join public.orgao_canais canal_caso on canal_caso.id=caso.canal_id
      cross join lateral (select c.id from canais c
        where caso.canal_id is null or caso.canal_id=c.id or canal_caso.canal_triagem
        order by case when c.id=caso.canal_id then 0 else 1 end,c.id limit 1) ch
      where p_aba='disponiveis' and r.city_id=v_city and r.category_id='iluminacao'
        and r.status in ('pending','in-progress') and r.is_public
        and coalesce(r.moderation_status,'approved')='approved' and not coalesce(r.is_petition,false)
        and caso.atribuido_a is null
        and (caso.status is null or caso.status in ('nova','recebida','triagem','programada'))
        and not exists(select 1 from public.demanda_broncas b where b.report_id=r.id)
        and not exists(select 1 from public.demandas_municipais d where d.report_id=r.id)
    ), todos as (
      select * from ofertas union all select * from minhas
    ), filtradas as (
      select o.* from todos o
      left join public.poles pole on pole.id=o.pole_id and pole.city_id=v_city
      where (p_aba='disponiveis' or o.etapa=p_etapa)
        and (p_aba='minhas' or not (o.tipo||':'||o.id::text)=any(coalesce(array_remove(p_adiadas,null),'{}')))
        and (v_term='' or position(v_term in lower(concat_ws(' ',o.titulo,o.protocolo,o.endereco,o.bairro,pole.identifier,pole.plate)))>0
          or exists(select 1 from public.reports r
            left join public.poles rp on rp.id=r.pole_id and rp.city_id=v_city
            where r.city_id=v_city and (r.id=o.report_id or exists(
              select 1 from public.demanda_broncas b where b.demanda_id=o.id and b.report_id=r.id and o.tipo='ordem'))
              and position(v_term in lower(concat_ws(' ',r.protocol,r.pole_number,r.reported_post_identifier,r.reported_plate,rp.identifier,rp.plate)))>0))
    ), ordenadas as (
      select f.*,row_number() over(order by
        case when p_aba='disponiveis' then case when f.prioridade='urgente' then 0 when f.tipo='ordem' then 1 else 2 end else 0 end,
        case when p_ordem='priority' then case f.prioridade when 'urgente' then 0 when 'alta' then 1 when 'baixa' then 3 else 2 end end,
        case when p_ordem='priority' then f.prazo_em end asc nulls last,
        case when p_ordem='recent' then f.created_at end desc nulls last,
        case when p_ordem in ('priority','oldest') then f.created_at end asc nulls last,
        f.id,f.tipo) pos from filtradas f
    ), totais as (
      select count(*) total from filtradas
    ), pagina as (
      select total,greatest(1,least(greatest(coalesce(p_pagina,1),1),ceil(total::numeric/v_size)::integer)) numero from totais
    )
    select jsonb_build_object(
      'total',p.total,'page',p.numero,'page_size',v_size,
      'items',coalesce((select jsonb_agg(to_jsonb(o)-'pos'-'etapa' order by o.pos) from ordenadas o
        where o.pos>(p.numero-1)::bigint*v_size and o.pos<=p.numero::bigint*v_size),'[]'::jsonb),
      'stage_counts',(select jsonb_build_object(
        'fazer',count(*) filter(where etapa='fazer'),
        'execucao',count(*) filter(where etapa='execucao'),
        'conferencia',count(*) filter(where etapa='conferencia'),
        'historico',count(*) filter(where etapa='historico')) from minhas)
    ) from pagina p
  );
end $$;

create index if not exists demandas_eletricista_atribuidas
  on public.demandas_municipais(prefeitura_id,atribuido_a,status,created_at,id)
  where category_id='iluminacao';
revoke all on function public.listar_painel_eletricista(uuid,text,text,text,text,integer,integer,text[]) from public,anon;
grant execute on function public.listar_painel_eletricista(uuid,text,text,text,text,integer,integer,text[]) to authenticated;
notify pgrst,'reload schema';
commit;

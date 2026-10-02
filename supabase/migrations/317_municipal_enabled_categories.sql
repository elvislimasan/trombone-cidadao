-- Cada prefeitura inicia com atendimento apenas de iluminacao.
-- A lista e independente das categorias usadas nas broncas publicas.
alter table public.prefeituras
  add column if not exists categorias_habilitadas text[] not null default array['iluminacao']::text[];

update public.prefeituras
set categorias_habilitadas = array['iluminacao']::text[]
where categorias_habilitadas is null;

alter table public.prefeituras
  add constraint prefeituras_categorias_habilitadas_validas
  check (array_position(categorias_habilitadas, null) is null);

create or replace function public.validar_categorias_habilitadas_prefeitura()
returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
  if exists (
    select 1 from unnest(new.categorias_habilitadas) as item(category_id)
    where not exists (select 1 from public.categories c where c.id=item.category_id)
  ) then
    raise exception 'Selecione apenas categorias cadastradas';
  end if;
  return new;
end $$;
create trigger validar_categorias_habilitadas_prefeitura
before insert or update of categorias_habilitadas on public.prefeituras
for each row execute function public.validar_categorias_habilitadas_prefeitura();

create or replace function public.validar_categoria_atendimento_municipal()
returns trigger language plpgsql set search_path=public,pg_temp as $$
declare v_prefeitura uuid;
begin
  if tg_table_name='reports' then
    if tg_op='UPDATE' then
      if new.category_id is not distinct from old.category_id
        and new.created_by_municipality is not distinct from old.created_by_municipality then return new; end if;
    end if;
    v_prefeitura := new.created_by_municipality;
  else
    if tg_op='UPDATE' then
      if new.category_id is not distinct from old.category_id then return new; end if;
    end if;
    v_prefeitura := new.prefeitura_id;
  end if;
  if v_prefeitura is null then return new; end if;
  if not exists (
    select 1 from public.prefeituras p
    where p.id=v_prefeitura and new.category_id=any(p.categorias_habilitadas)
  ) then
    raise exception 'Esta categoria não está habilitada para a prefeitura';
  end if;
  return new;
end $$;
create trigger validar_categoria_relato_municipal
before insert or update of category_id, created_by_municipality on public.reports
for each row execute function public.validar_categoria_atendimento_municipal();
create trigger validar_categoria_demanda_municipal
before insert or update of category_id on public.demandas_municipais
for each row execute function public.validar_categoria_atendimento_municipal();

create or replace function public.validar_categoria_vinculo_municipal()
returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
  if not exists (
    select 1 from public.demandas_municipais d
    join public.prefeituras p on p.id=d.prefeitura_id
    join public.reports r on r.id=new.report_id
    where d.id=new.demanda_id and r.category_id=any(p.categorias_habilitadas)
  ) then
    raise exception 'A categoria da solicitação não está habilitada para a prefeitura';
  end if;
  return new;
end $$;
create trigger validar_categoria_vinculo_municipal
before insert on public.demanda_broncas
for each row execute function public.validar_categoria_vinculo_municipal();

create or replace function public.resumo_demandas_municipais(p_prefeitura uuid)
returns table(total bigint,abertas bigint,em_andamento bigint,concluidas bigint,atrasadas bigint,vinculadas bigint,
  aguardando_confirmacao bigint,sem_responsavel bigint,revisao_pendente bigint,primeira_resposta_atrasada bigint)
language sql stable security invoker set search_path=public,pg_temp as $$
  select count(*), count(*) filter(where d.status='aberta'),
    count(*) filter(where d.status in ('triagem','programada','em_andamento','aguardando_informacao','aguardando_recurso')),
    count(*) filter(where d.status='concluida'),
    count(*) filter(where d.status not in ('concluida','cancelada','recusada') and d.prazo_em<now()),
    count(*) filter(where exists(select 1 from public.demanda_broncas b where b.demanda_id=d.id)),
    count(*) filter(where d.status='aguardando_confirmacao'),
    count(*) filter(where d.atribuido_a is null and d.status not in ('concluida','cancelada','recusada')),
    count(*) filter(where d.revisao_pendente),
    count(*) filter(where d.primeira_resposta_em is null and d.primeira_resposta_prazo_em<now() and d.status not in ('concluida','cancelada','recusada'))
  from public.demandas_municipais d
  join public.prefeituras p on p.id = d.prefeitura_id
  where d.prefeitura_id = p_prefeitura and d.category_id = any(p.categorias_habilitadas)
$$;

notify pgrst, 'reload schema';

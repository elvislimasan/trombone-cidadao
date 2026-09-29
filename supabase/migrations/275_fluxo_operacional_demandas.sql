-- Demandas são ordens de serviço internas, criadas explicitamente pela prefeitura.
-- Broncas são relatos públicos independentes; o vínculo comunica o atendimento.
-- Pode ser reaplicada após uma execução incompleta, preservando dados e histórico.
begin;

drop trigger if exists validar_demanda_municipal on public.demandas_municipais;
drop trigger if exists publicar_andamento_demanda on public.demandas_municipais;
drop trigger if exists auditar_demanda_municipal on public.demandas_municipais;
drop trigger if exists demanda_receber_verificacao on public.reports;
drop trigger if exists demanda_receber_contestacao on public.report_updates;
drop trigger if exists z_receber_bronca_como_demanda on public.reports;
alter table public.demandas_municipais drop constraint if exists demandas_municipais_status_check;
alter table public.demandas_municipais add constraint demandas_municipais_status_check check (status in (
  'aberta','triagem','programada','em_andamento','aguardando_informacao','aguardando_recurso',
  'aguardando_confirmacao','concluida','recusada','cancelada'
));
alter table public.demandas_municipais
  add column if not exists endereco text,
  add column if not exists latitude double precision,
  add column if not exists longitude double precision,
  add column if not exists pole_id bigint references public.poles(id),
  add column if not exists atribuido_a uuid references public.profiles(id),
  add column if not exists origem text not null default 'interno' check (origem in ('interno','bronca','telefone','presencial','vistoria')),
  add column if not exists protocolo_externo text,
  add column if not exists primeira_resposta_prazo_em timestamptz,
  add column if not exists primeira_resposta_em timestamptz,
  add column if not exists previsto_em timestamptz,
  add column if not exists proxima_acao text,
  add column if not exists proxima_acao_em timestamptz,
  add column if not exists motivo_pendencia text,
  add column if not exists resultado text,
  add column if not exists registro_execucao text,
  add column if not exists executada_em timestamptz,
  add column if not exists revisao_pendente boolean not null default false,
  add column if not exists ciclo_iniciado_em timestamptz not null default now(),
  add column if not exists versao integer not null default 1;
alter table public.demandas_municipais drop constraint if exists demanda_coordenadas_validas;
alter table public.demandas_municipais add constraint demanda_coordenadas_validas check (
    (latitude is null and longitude is null) or
    (latitude is not null and longitude is not null and latitude between -90 and 90 and longitude between -180 and 180)
  );

create table if not exists public.prefeitura_servico_regras (
  prefeitura_id uuid not null references public.prefeituras(id) on delete cascade,
  category_id text not null references public.categories(id),
  canal_id uuid references public.orgao_canais(id),
  primeira_resposta_horas integer check (primeira_resposta_horas between 1 and 8760),
  atendimento_horas integer check (atendimento_horas between 1 and 8760),
  prioridade text not null default 'normal' check (prioridade in ('baixa','normal','alta','urgente')),
  primary key (prefeitura_id, category_id)
);
create table if not exists public.demanda_broncas (
  demanda_id uuid not null references public.demandas_municipais(id) on delete cascade,
  report_id uuid not null unique references public.reports(id) on delete cascade,
  vinculado_por uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  primary key (demanda_id, report_id)
);
create table if not exists public.demanda_eventos (
  id bigint generated always as identity primary key,
  demanda_id uuid not null references public.demandas_municipais(id) on delete cascade,
  tipo text not null,
  visibilidade text not null default 'interna' check (visibilidade in ('interna','publica')),
  detalhes jsonb not null default '{}',
  criado_por uuid references public.profiles(id),
  origem_legado text unique,
  created_at timestamptz not null default now()
);
create index if not exists demanda_eventos_historico on public.demanda_eventos(demanda_id, created_at desc, id desc);
create table if not exists public.demanda_anexos (
  id uuid primary key default gen_random_uuid(),
  demanda_id uuid not null references public.demandas_municipais(id) on delete cascade,
  storage_path text not null unique,
  nome text not null,
  mime_type text not null check (mime_type in ('image/jpeg','image/png','image/webp','application/pdf')),
  tamanho bigint not null check (tamanho between 1 and 10485760),
  visibilidade text not null default 'interna' check (visibilidade in ('interna','publica')),
  criado_por uuid references public.profiles(id),
  created_at timestamptz not null default now()
);
create index if not exists demandas_municipais_responsavel on public.demandas_municipais(prefeitura_id, atribuido_a, status);
create index if not exists demandas_municipais_prazo on public.demandas_municipais(prefeitura_id, prazo_em) where status not in ('concluida','cancelada','recusada');
alter table public.orgao_respostas add column if not exists demanda_evento_id bigint;
-- A resposta pertence à bronca e permanece publicada quando uma ordem é excluída.
alter table public.orgao_respostas drop constraint if exists orgao_respostas_demanda_evento_id_fkey;
alter table public.orgao_respostas add constraint orgao_respostas_demanda_evento_id_fkey
  foreign key (demanda_evento_id) references public.demanda_eventos(id) on delete set null;
create unique index if not exists orgao_respostas_evento_bronca on public.orgao_respostas(demanda_evento_id,report_id) where demanda_evento_id is not null;

-- Só adapta registros ainda não migrados; reaplicar não altera o trabalho atual.
update public.demandas_municipais d set endereco=coalesce(d.endereco,r.address),pole_id=coalesce(d.pole_id,r.pole_id),
  origem='bronca',executada_em=coalesce(d.executada_em,d.concluida_em)
from public.reports r where r.id=d.report_id
  and not exists(select 1 from public.demanda_broncas b where b.report_id=d.report_id);
insert into public.demanda_broncas(demanda_id,report_id,vinculado_por,created_at)
select id,report_id,criado_por,created_at from public.demandas_municipais where report_id is not null
on conflict (report_id) do nothing;
insert into public.demanda_eventos(demanda_id,tipo,detalhes,criado_por,origem_legado,created_at)
select b.demanda_id,e.tipo,e.detalhes,e.criado_por,'evento:'||e.id::text,e.created_at
from public.orgao_caso_eventos e join public.demanda_broncas b on b.report_id=e.report_id
where e.tipo not in ('resposta_publica','nota_interna')
on conflict (origem_legado) do nothing;
insert into public.demanda_eventos(demanda_id,tipo,visibilidade,detalhes,criado_por,origem_legado,created_at)
select b.demanda_id,case when r.visibilidade='publica' then 'resposta_publica' else 'nota_interna' end,r.visibilidade,
  jsonb_build_object('mensagem',r.mensagem),r.autor_id,'resposta:'||r.id::text,r.created_at
from public.orgao_respostas r join public.demanda_broncas b on b.report_id=r.report_id
where r.demanda_evento_id is null
on conflict (origem_legado) do nothing;
update public.orgao_respostas r set demanda_evento_id=e.id from public.demanda_eventos e
where e.origem_legado='resposta:'||r.id::text and r.demanda_evento_id is null;

create or replace function public.pode_ver_demanda(p_user uuid,p_demanda uuid)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select exists(select 1 from public.demandas_municipais d join public.prefeituras p on p.id=d.prefeitura_id
    where d.id=p_demanda and public.pode_acessar_prefeitura(p_user,p.city_id)
      and (public.pode_administrar_prefeitura(p_user,p.city_id) or public.papel_no_orgao(p_user,d.canal_id) is not null))
$$;
create or replace function public.pode_operar_demanda(p_user uuid,p_demanda uuid)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select exists(select 1 from public.demandas_municipais d join public.prefeituras p on p.id=d.prefeitura_id
    where d.id=p_demanda and public.pode_acessar_prefeitura(p_user,p.city_id)
      and (public.pode_administrar_prefeitura(p_user,p.city_id) or public.papel_no_orgao(p_user,d.canal_id) in ('gestor','operador')))
$$;
create or replace function public.demanda_tem_bronca_publica(p_demanda uuid)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select exists(select 1 from public.demanda_broncas b join public.reports r on r.id=b.report_id
    where b.demanda_id=p_demanda and coalesce(r.moderation_status,'approved')='approved' and not coalesce(r.is_petition,false))
$$;
revoke all on function public.pode_ver_demanda(uuid,uuid),public.pode_operar_demanda(uuid,uuid),public.demanda_tem_bronca_publica(uuid) from public;
grant execute on function public.pode_ver_demanda(uuid,uuid),public.pode_operar_demanda(uuid,uuid) to authenticated;
grant execute on function public.demanda_tem_bronca_publica(uuid) to anon,authenticated;

drop policy if exists demandas_municipais_select on public.demandas_municipais;
drop policy if exists demandas_municipais_insert on public.demandas_municipais;
drop policy if exists demandas_municipais_update on public.demandas_municipais;
create policy demandas_municipais_select on public.demandas_municipais for select to authenticated using (public.pode_ver_demanda(auth.uid(),id));
-- Escritas são feitas por RPC: validação, auditoria e publicação numa transação.
revoke insert,update,delete on public.demandas_municipais from authenticated;
alter table public.demanda_broncas enable row level security;
alter table public.demanda_eventos enable row level security;
alter table public.demanda_anexos enable row level security;
alter table public.prefeitura_servico_regras enable row level security;
drop policy if exists demanda_broncas_select on public.demanda_broncas;
drop policy if exists demanda_eventos_select on public.demanda_eventos;
drop policy if exists demanda_anexos_select on public.demanda_anexos;
drop policy if exists demanda_anexos_publicos on public.demanda_anexos;
drop policy if exists regras_select on public.prefeitura_servico_regras;
create policy demanda_broncas_select on public.demanda_broncas for select to authenticated using (public.pode_ver_demanda(auth.uid(),demanda_id));
create policy demanda_eventos_select on public.demanda_eventos for select to authenticated using (public.pode_ver_demanda(auth.uid(),demanda_id));
create policy demanda_anexos_select on public.demanda_anexos for select to authenticated using (public.pode_ver_demanda(auth.uid(),demanda_id) or (visibilidade='publica' and public.demanda_tem_bronca_publica(demanda_id)));
create policy demanda_anexos_publicos on public.demanda_anexos for select to anon using (visibilidade='publica' and public.demanda_tem_bronca_publica(demanda_id));
create policy regras_select on public.prefeitura_servico_regras for select to authenticated using (
  exists(select 1 from public.prefeituras p where p.id=prefeitura_id and public.pode_acessar_prefeitura(auth.uid(),p.city_id)));
grant select on public.demanda_broncas,public.demanda_eventos,public.prefeitura_servico_regras to authenticated;
grant select on public.demanda_anexos to anon,authenticated;
drop policy if exists orgao_categorias_equipe_municipal on public.orgao_categorias;
create policy orgao_categorias_equipe_municipal on public.orgao_categorias for select to authenticated using (public.pode_acessar_prefeitura(auth.uid(),city_id));

create or replace function public.validar_demanda_municipal()
returns trigger language plpgsql set search_path=public,pg_temp as $$
declare v_city bigint;
begin
  select city_id into v_city from public.prefeituras where id=new.prefeitura_id;
  if tg_op='UPDATE' and (new.prefeitura_id<>old.prefeitura_id or new.protocolo<>old.protocolo) then
    raise exception 'Prefeitura e protocolo não podem ser alterados';
  end if;
  if new.canal_id is not null and not exists(select 1 from public.orgao_canais c where c.id=new.canal_id and c.city_id=v_city and not c.canal_triagem) then
    raise exception 'Secretaria inválida para esta prefeitura';
  end if;
  if new.atribuido_a is not null and not exists(select 1 from public.orgao_membros m where m.user_id=new.atribuido_a and m.canal_id=new.canal_id and m.ativo and m.papel in ('gestor','operador')) then
    -- Não bloqueia uma leitura/automação em registros de funcionários desativados.
    if tg_op='INSERT' then raise exception 'O responsável precisa ser membro ativo desta secretaria';
    elsif new.atribuido_a is distinct from old.atribuido_a or new.canal_id is distinct from old.canal_id then
      raise exception 'O responsável precisa ser membro ativo desta secretaria';
    end if;
  end if;
  if new.pole_id is not null and not exists(select 1 from public.poles where id=new.pole_id and city_id=v_city) then raise exception 'Poste inválido para esta prefeitura'; end if;
  new.titulo=btrim(new.titulo); new.updated_at=clock_timestamp();
  if tg_op='UPDATE' then new.versao=old.versao+1; end if;
  if new.status='concluida' then new.concluida_em=coalesce(new.concluida_em,now()); else new.concluida_em=null; end if;
  return new;
end $$;
create trigger validar_demanda_municipal before insert or update on public.demandas_municipais for each row execute function public.validar_demanda_municipal();

create or replace function public.auditar_demanda_municipal()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare v_changes jsonb; v_field text; v_before jsonb; v_after jsonb;
begin
  if tg_op='INSERT' then
    insert into public.demanda_eventos(demanda_id,tipo,criado_por,detalhes) values(new.id,'criada',new.criado_por,jsonb_build_object('status',new.status));
  else
    v_before=to_jsonb(old)-array['updated_at','updated_by','versao']; v_after=to_jsonb(new)-array['updated_at','updated_by','versao'];
    v_changes='{}';
    for v_field in select jsonb_object_keys(v_after) loop
      if v_before->v_field is distinct from v_after->v_field then
        v_changes=v_changes||jsonb_build_object(v_field,jsonb_build_object('antes',v_before->v_field,'depois',v_after->v_field));
      end if;
    end loop;
    if v_changes<>'{}' then
      insert into public.demanda_eventos(demanda_id,tipo,criado_por,detalhes)
      values(new.id,'atualizada',auth.uid(),jsonb_build_object('alteracoes',v_changes,'sistema',pg_trigger_depth()>1));
    end if;
  end if;
  if new.atribuido_a is not null and (tg_op='INSERT' or new.atribuido_a is distinct from old.atribuido_a) then
    insert into public.notifications(user_id,type,title,message,link,is_read,created_at)
    values(new.atribuido_a,'agency_case','Atendimento atribuído a você',new.protocolo||' · '||new.titulo,'/prefeitura/demandas/'||new.id,false,now());
  end if;
  return new;
end $$;
create trigger auditar_demanda_municipal after insert or update on public.demandas_municipais for each row execute function public.auditar_demanda_municipal();

create or replace function public.publicar_estado_demanda(p_demanda uuid,p_report uuid,p_motivo text default null)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare d public.demandas_municipais%rowtype; v_orgao text; v_canal uuid; v_etapa text;
begin
  select * into d from public.demandas_municipais where id=p_demanda;
  select coalesce(c.nome,p.nome),coalesce(d.canal_id,(select id from public.orgao_canais where city_id=p.city_id and canal_triagem limit 1))
    into v_orgao,v_canal from public.prefeituras p left join public.orgao_canais c on c.id=d.canal_id where p.id=d.prefeitura_id;
  -- A ficha de recebimento público permanece independente da ordem de serviço.
  if v_canal is not null then
    insert into public.orgao_casos(report_id,canal_id) values(p_report,v_canal) on conflict(report_id) do nothing;
  end if;
  v_etapa=case d.status when 'aberta' then 'recebida' when 'triagem' then 'recebida' when 'programada' then 'programada'
    when 'em_andamento' then 'recebida' when 'aguardando_confirmacao' then 'executada'
    when 'concluida' then 'executada' else null end;
  if v_etapa is not null then
    insert into public.report_official_steps(report_id,etapa,orgao,protocolo,observacao,registrado_por,registrado_por_papel)
    values(p_report,v_etapa,v_orgao,d.protocolo,
      case when d.status in ('recusada','cancelada') then coalesce(nullif(btrim(p_motivo),''),'Atendimento encerrado pela prefeitura.')
        when d.status in ('aguardando_confirmacao','concluida') then d.resultado
        when d.status='programada' then 'Previsão: '||to_char(d.previsto_em at time zone 'America/Fortaleza','DD/MM/YYYY HH24:MI')
        else 'Atendimento municipal '||d.protocolo end,auth.uid(),'orgao');
  end if;
  if d.status in ('aguardando_confirmacao','concluida') then
    update public.reports set status='pending_resolution' where id=p_report and status in ('pending','in-progress');
  elsif d.status in ('triagem','programada','em_andamento') then
    update public.reports set status='in-progress' where id=p_report and status='pending';
  end if;
end $$;
revoke all on function public.publicar_estado_demanda(uuid,uuid,text) from public,anon,authenticated;

create or replace function public.salvar_demanda_municipal(
  p_prefeitura uuid,p_id uuid,p_dados jsonb,p_versao integer default null,
  p_reports uuid[] default '{}',p_resposta_publica text default null,p_nota_interna text default null,
  p_motivo text default null,p_anexos jsonb default '[]'
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  d public.demandas_municipais%rowtype; anterior public.demandas_municipais%rowtype;
  regra public.prefeitura_servico_regras%rowtype; v_city bigint; v_report uuid; v_canal uuid; v_orgao text;
  v_nova boolean; v_execucao boolean; v_reabrindo boolean; v_link_novo boolean; v_evento bigint; v_file jsonb; v_path text;
  v_status_poste text;
  v_resposta text=nullif(btrim(coalesce(p_resposta_publica,'')),''); v_nota text=nullif(btrim(coalesce(p_nota_interna,'')),'');
  v_motivo text=nullif(btrim(coalesce(p_motivo,'')),''); v_dados jsonb; v_count integer;
begin
  if auth.uid() is null then raise exception 'Entre na sua conta institucional'; end if;
  select city_id into v_city from public.prefeituras where id=p_prefeitura and status='ativa';
  if v_city is null or not public.pode_acessar_prefeitura(auth.uid(),v_city) then raise exception 'Sem acesso a esta prefeitura'; end if;
  -- Serializa também os vínculos para impedir duas demandas para a mesma bronca.
  perform pg_advisory_xact_lock(hashtextextended(p_prefeitura::text,0));
  select * into anterior from public.demandas_municipais where id=p_id for update;
  v_nova=anterior.id is null;
  if not v_nova then
    if anterior.prefeitura_id<>p_prefeitura or not public.pode_operar_demanda(auth.uid(),p_id) then raise exception 'Sem permissão para alterar esta demanda'; end if;
    if p_versao is null or p_versao<>anterior.versao then raise exception 'Esta demanda foi alterada por outra pessoa. Recarregue para revisar as mudanças.' using errcode='40001'; end if;
    d=anterior;
  else
    d.id=coalesce(p_id,gen_random_uuid()); d.prefeitura_id=p_prefeitura; d.status='aberta'; d.prioridade='normal'; d.origem='interno';
    d.protocolo='DEM-'||upper(substr(gen_random_uuid()::text,1,8)); d.criado_por=auth.uid();
    d.created_at=now(); d.ciclo_iniciado_em=now(); d.versao=1; d.revisao_pendente=false;
  end if;
  select coalesce(jsonb_object_agg(key,value),'{}') into v_dados from jsonb_each(coalesce(p_dados,'{}'))
  where key=any(array['titulo','descricao','bairro','category_id','prioridade','status','canal_id','atribuido_a',
    'prazo_em','primeira_resposta_prazo_em','previsto_em','proxima_acao','proxima_acao_em','motivo_pendencia',
    'resultado','registro_execucao','executada_em','endereco','latitude','longitude','pole_id','origem','protocolo_externo']);
  d=jsonb_populate_record(d,v_dados); d.updated_by=auth.uid();
  if not public.pode_administrar_prefeitura(auth.uid(),v_city) then
    if d.canal_id is null or public.papel_no_orgao(auth.uid(),d.canal_id) not in ('gestor','operador')
      or public.papel_no_orgao(auth.uid(),d.canal_id) is null then raise exception 'Selecione uma secretaria que você pode operar'; end if;
    if not v_nova and anterior.canal_id is distinct from d.canal_id then raise exception 'Somente o administrador municipal pode encaminhar a outra secretaria'; end if;
  end if;
  if not v_nova and anterior.canal_id is distinct from d.canal_id and length(coalesce(v_motivo,''))<5 then raise exception 'Explique o motivo do encaminhamento'; end if;
  if d.titulo is null or length(btrim(d.titulo)) not between 3 and 180 then raise exception 'Informe um título de 3 a 180 caracteres'; end if;
  if length(coalesce(d.descricao,''))>10000 or length(coalesce(v_resposta,''))>4000 or length(coalesce(v_nota,''))>4000 then raise exception 'O texto excede o limite permitido'; end if;
  select * into regra from public.prefeitura_servico_regras where prefeitura_id=p_prefeitura and category_id=d.category_id;
  if v_nova then
    if d.prazo_em is null and regra.atendimento_horas is not null then d.prazo_em=now()+make_interval(hours=>regra.atendimento_horas); end if;
    if d.primeira_resposta_prazo_em is null and regra.primeira_resposta_horas is not null then d.primeira_resposta_prazo_em=now()+make_interval(hours=>regra.primeira_resposta_horas); end if;
  end if;
  if p_reports is null then p_reports='{}'; end if;
  -- Este comando só adiciona vínculos. Não remove relatos ou história ao salvar o formulário.
  p_reports=array(select distinct r from unnest(p_reports||array(select report_id from public.demanda_broncas where demanda_id=d.id)) r where r is not null);
  if exists(select 1 from unnest(p_reports) r where not exists(select 1 from public.reports q where q.id=r and q.city_id=v_city
    and coalesce(q.moderation_status,'approved')='approved' and not coalesce(q.is_petition,false) and q.status<>'duplicate')) then raise exception 'Selecione broncas publicadas desta cidade'; end if;
  if exists(select 1 from public.demanda_broncas where report_id=any(p_reports) and demanda_id<>d.id) then raise exception 'Uma das broncas já está vinculada a outro atendimento' using errcode='23505'; end if;
  if d.report_id is null and cardinality(p_reports)>0 then d.report_id=p_reports[1]; end if;
  if cardinality(p_reports)>0 then d.origem='bronca'; end if;
  v_reabrindo=not v_nova and anterior.status in ('concluida','cancelada','recusada','aguardando_confirmacao')
    and d.status not in ('concluida','cancelada','recusada','aguardando_confirmacao');
  if v_reabrindo then
    if length(coalesce(v_motivo,''))<5 then raise exception 'Explique o motivo da reabertura'; end if;
    d.executada_em=null; d.resultado=null; d.registro_execucao=null; d.revisao_pendente=false; d.ciclo_iniciado_em=now();
  end if;
  if d.status in ('cancelada','recusada') and (v_nova or anterior.status is distinct from d.status) and length(coalesce(v_motivo,''))<5 then raise exception 'Informe o motivo do encerramento'; end if;
  if d.status in ('programada','em_andamento','aguardando_confirmacao','concluida') and (v_nova or anterior.status is distinct from d.status) then
    if d.canal_id is null or d.atribuido_a is null then raise exception 'Defina secretaria e responsável pelo atendimento'; end if;
  end if;
  if d.status='programada' and d.previsto_em is null then raise exception 'Informe a previsão de execução'; end if;
  if d.status in ('aguardando_informacao','aguardando_recurso') and (length(btrim(coalesce(d.motivo_pendencia,'')))<5 or d.proxima_acao_em is null) then raise exception 'Informe a pendência e a data de revisão'; end if;
  if d.executada_em>now()+interval '5 minutes' then raise exception 'A execução não pode estar no futuro'; end if;
  p_anexos=coalesce(p_anexos,'[]'::jsonb);
  if jsonb_typeof(p_anexos)<>'array' or jsonb_array_length(p_anexos)>10 then raise exception 'Envie no máximo 10 arquivos por atualização'; end if;
  for v_file in select value from jsonb_array_elements(p_anexos) loop
    v_path=v_file->>'storage_path';
    if split_part(v_path,'/',1)<>p_prefeitura::text or split_part(v_path,'/',2)<>auth.uid()::text then raise exception 'Arquivo fora do seu atendimento'; end if;
    if not exists(select 1 from storage.objects where bucket_id='municipal-demand-files' and name=v_path
      and coalesce((metadata->>'size')::bigint,0) between 1 and 10485760
      and (metadata->>'size')::bigint=(v_file->>'tamanho')::bigint
      and metadata->>'mimetype'=v_file->>'mime_type') then raise exception 'Arquivo não encontrado ou inválido'; end if;
  end loop;
  v_execucao=d.status in ('aguardando_confirmacao','concluida') and (v_nova or anterior.status not in ('aguardando_confirmacao','concluida'));
  if v_execucao then
    select count(*) into v_count from public.demanda_anexos where demanda_id=d.id and created_at>=d.ciclo_iniciado_em;
    if length(btrim(coalesce(d.resultado,'')))<10 then raise exception 'Descreva o resultado do atendimento'; end if;
    if v_count+jsonb_array_length(p_anexos)=0 and length(btrim(coalesce(d.registro_execucao,'')))<20 then raise exception 'Anexe evidência ou descreva um registro técnico com pelo menos 20 caracteres'; end if;
    d.executada_em=coalesce(d.executada_em,now()); d.revisao_pendente=false;
  end if;
  if d.primeira_resposta_em is null and (v_resposta is not null or d.status not in ('aberta','triagem')) then d.primeira_resposta_em=now(); end if;
  if v_nova then insert into public.demandas_municipais select (d).* returning * into d;
  else
    update public.demandas_municipais set titulo=d.titulo,descricao=d.descricao,bairro=d.bairro,category_id=d.category_id,
      prioridade=d.prioridade,status=d.status,canal_id=d.canal_id,atribuido_a=d.atribuido_a,prazo_em=d.prazo_em,
      primeira_resposta_prazo_em=d.primeira_resposta_prazo_em,primeira_resposta_em=d.primeira_resposta_em,previsto_em=d.previsto_em,
      proxima_acao=d.proxima_acao,proxima_acao_em=d.proxima_acao_em,motivo_pendencia=d.motivo_pendencia,resultado=d.resultado,
      registro_execucao=d.registro_execucao,executada_em=d.executada_em,endereco=d.endereco,latitude=d.latitude,longitude=d.longitude,
      pole_id=d.pole_id,origem=d.origem,protocolo_externo=d.protocolo_externo,report_id=d.report_id,
      revisao_pendente=d.revisao_pendente,ciclo_iniciado_em=d.ciclo_iniciado_em,updated_by=auth.uid()
    where id=d.id returning * into d;
  end if;
  for v_file in select value from jsonb_array_elements(p_anexos) loop
    insert into public.demanda_anexos(demanda_id,storage_path,nome,mime_type,tamanho,visibilidade,criado_por)
    values(d.id,v_file->>'storage_path',left(v_file->>'nome',200),v_file->>'mime_type',(v_file->>'tamanho')::bigint,coalesce(v_file->>'visibilidade','interna'),auth.uid());
  end loop;
  if jsonb_array_length(p_anexos)>0 then insert into public.demanda_eventos(demanda_id,tipo,detalhes,criado_por)
    values(d.id,'anexos',jsonb_build_object('arquivos',p_anexos),auth.uid()); end if;
  if v_motivo is not null then insert into public.demanda_eventos(demanda_id,tipo,detalhes,criado_por)
    values(d.id,case when v_reabrindo then 'reaberta' when anterior.canal_id is distinct from d.canal_id and not v_nova then 'encaminhada' else 'justificativa' end,
      jsonb_build_object('mensagem',v_motivo),auth.uid()); end if;
  if v_nota is not null then insert into public.demanda_eventos(demanda_id,tipo,detalhes,criado_por) values(d.id,'nota_interna',jsonb_build_object('mensagem',v_nota),auth.uid()); end if;
  select coalesce(c.nome,p.nome),coalesce(d.canal_id,(select id from public.orgao_canais where city_id=v_city and canal_triagem limit 1))
    into v_orgao,v_canal from public.prefeituras p left join public.orgao_canais c on c.id=d.canal_id where p.id=p_prefeitura;
  foreach v_report in array p_reports loop
    v_link_novo=not exists(select 1 from public.demanda_broncas where report_id=v_report);
    if v_link_novo then
      insert into public.demanda_broncas(demanda_id,report_id,vinculado_por) values(d.id,v_report,auth.uid());
      insert into public.demanda_eventos(demanda_id,tipo,detalhes,criado_por) values(d.id,'bronca_vinculada',jsonb_build_object('report_id',v_report),auth.uid());
    end if;
    if v_link_novo or v_nova or anterior.status is distinct from d.status or anterior.previsto_em is distinct from d.previsto_em then
      perform public.publicar_estado_demanda(d.id,v_report,v_motivo);
    end if;
    if v_reabrindo then
      insert into public.report_official_steps(report_id,etapa,orgao,protocolo,observacao,registrado_por,registrado_por_papel)
      values(v_report,'recebida',v_orgao,d.protocolo,'Atendimento reaberto: '||v_motivo,auth.uid(),'orgao');
    end if;
    if v_link_novo and v_canal is not null then
      insert into public.orgao_respostas(report_id,canal_id,orgao_nome,autor_id,visibilidade,mensagem,created_at,demanda_evento_id)
      select v_report,v_canal,v_orgao,e.criado_por,'publica',e.detalhes->>'mensagem',e.created_at,e.id
      from public.demanda_eventos e where e.demanda_id=d.id and e.tipo='resposta_publica'
      on conflict(demanda_evento_id,report_id) where demanda_evento_id is not null do nothing;
    end if;
  end loop;
  if v_resposta is null and d.status in ('cancelada','recusada') and (v_nova or anterior.status is distinct from d.status) then v_resposta=v_motivo; end if;
  if v_resposta is null and v_reabrindo then v_resposta='Atendimento reaberto: '||v_motivo; end if;
  if v_resposta is not null then
    insert into public.demanda_eventos(demanda_id,tipo,visibilidade,detalhes,criado_por)
    values(d.id,'resposta_publica','publica',jsonb_build_object('mensagem',v_resposta),auth.uid()) returning id into v_evento;
    if v_canal is not null then
      insert into public.orgao_respostas(report_id,canal_id,orgao_nome,autor_id,visibilidade,mensagem,demanda_evento_id)
      select b.report_id,v_canal,v_orgao,auth.uid(),'publica',v_resposta,v_evento from public.demanda_broncas b where b.demanda_id=d.id;
    end if;
    insert into public.notifications(user_id,type,title,message,link,report_id,is_read,created_at)
    select distinct on (p.user_id) p.user_id,'agency_response','A prefeitura atualizou um atendimento',left(v_resposta,180),
      '/bronca/'||b.report_id,b.report_id,false,now()
    from public.demanda_broncas b cross join lateral public.report_participants(b.report_id) p
    where b.demanda_id=d.id and p.user_id<>auth.uid() order by p.user_id,b.report_id;
  end if;
  if d.pole_id is not null and d.category_id='iluminacao' and (v_nova or anterior.status is distinct from d.status) and d.status in ('em_andamento','aguardando_confirmacao','concluida') then
    select lighting_status into v_status_poste from public.poles where id=d.pole_id for update;
    if v_status_poste<>'removido' and v_status_poste is distinct from (case when d.status='em_andamento' then 'manutencao' else 'aceso' end) then
      update public.poles set lighting_status=case when d.status='em_andamento' then 'manutencao' else 'aceso' end where id=d.pole_id;
      insert into public.pole_lighting_changes(pole_id,city_id,pole_number,address,old_status,new_status,action,changed_by)
      select id,v_city,coalesce(identifier,plate,id::text),address,v_status_poste,lighting_status,'updated',auth.uid() from public.poles where id=d.pole_id;
    end if;
  end if;
  return jsonb_build_object('id',d.id,'versao',d.versao,'status',d.status);
end $$;
revoke all on function public.salvar_demanda_municipal(uuid,uuid,jsonb,integer,uuid[],text,text,text,jsonb) from public,anon;
grant execute on function public.salvar_demanda_municipal(uuid,uuid,jsonb,integer,uuid[],text,text,text,jsonb) to authenticated;

create or replace function public.atendimento_publico_bronca(p_report uuid)
returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
  select jsonb_build_object('protocolo',d.protocolo,'status',d.status,'orgao',coalesce(c.nome,p.nome),
    'previsto_em',d.previsto_em,'executada_em',d.executada_em,'resultado',d.resultado,'revisao_pendente',d.revisao_pendente,
    'anexos',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'nome',a.nome,'mime_type',a.mime_type,'storage_path',a.storage_path))
      from public.demanda_anexos a where a.demanda_id=d.id and a.visibilidade='publica'),'[]'))
  from public.demanda_broncas b join public.demandas_municipais d on d.id=b.demanda_id
  join public.reports r on r.id=b.report_id join public.prefeituras p on p.id=d.prefeitura_id
  left join public.orgao_canais c on c.id=d.canal_id
  where b.report_id=p_report and coalesce(r.moderation_status,'approved')='approved' and not coalesce(r.is_petition,false)
$$;
revoke all on function public.atendimento_publico_bronca(uuid) from public;
grant execute on function public.atendimento_publico_bronca(uuid) to anon,authenticated;

create or replace function public.buscar_broncas_para_demanda(p_prefeitura uuid,p_busca text)
returns table(id uuid,title text,address text,neighborhood text,status text,category_id text)
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare v_city bigint;
begin
  select city_id into v_city from public.prefeituras where prefeituras.id=p_prefeitura;
  if not public.pode_acessar_prefeitura(auth.uid(),v_city) then raise exception 'Sem acesso a esta prefeitura'; end if;
  return query select r.id,r.title,r.address,r.neighborhood,r.status,r.category_id from public.reports r
  where r.city_id=v_city and coalesce(r.moderation_status,'approved')='approved' and not coalesce(r.is_petition,false)
    and r.status not in ('duplicate','resolved') and not exists(select 1 from public.demanda_broncas b where b.report_id=r.id)
    and concat_ws(' ',r.title,r.address,r.neighborhood) ilike '%'||replace(replace(left(btrim(p_busca),120),'%','\%'),'_','\_')||'%'
  order by r.created_at desc,r.id limit 20;
end $$;
create or replace function public.vinculos_broncas_prefeitura(p_prefeitura uuid,p_reports uuid[])
returns table(report_id uuid,demanda_id uuid,protocolo text,status text)
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare v_city bigint;
begin
  select city_id into v_city from public.prefeituras where id=p_prefeitura;
  if not public.pode_acessar_prefeitura(auth.uid(),v_city) then raise exception 'Sem acesso a esta prefeitura'; end if;
  if cardinality(p_reports)>1000 then raise exception 'Consulte no máximo 1000 broncas por vez'; end if;
  return query select b.report_id,case when public.pode_ver_demanda(auth.uid(),d.id) then d.id end,d.protocolo,d.status
  from public.demanda_broncas b join public.demandas_municipais d on d.id=b.demanda_id join public.reports r on r.id=b.report_id
  where d.prefeitura_id=p_prefeitura and b.report_id=any(p_reports) and coalesce(r.moderation_status,'approved')='approved';
end $$;
revoke all on function public.buscar_broncas_para_demanda(uuid,text),public.vinculos_broncas_prefeitura(uuid,uuid[]) from public,anon;
grant execute on function public.buscar_broncas_para_demanda(uuid,text),public.vinculos_broncas_prefeitura(uuid,uuid[]) to authenticated;

create or replace function public.demanda_receber_verificacao()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare d public.demandas_municipais%rowtype;
begin
  if new.status is not distinct from old.status then return new; end if;
  select q.* into d from public.demanda_broncas b join public.demandas_municipais q on q.id=b.demanda_id where b.report_id=new.id for update of q;
  if d.id is null then return new; end if;
  if d.executada_em is not null and new.status='resolved' and not exists(
    select 1 from public.demanda_broncas b join public.reports r on r.id=b.report_id where b.demanda_id=d.id and r.status<>'resolved'
  ) then
    update public.demandas_municipais set revisao_pendente=false where id=d.id and revisao_pendente;
    insert into public.demanda_eventos(demanda_id,tipo,detalhes,criado_por)
    values(d.id,'resolucao_confirmada',jsonb_build_object('mensagem','Todas as broncas vinculadas tiveram a resolução verificada.'),auth.uid());
  elsif d.status='concluida' and new.status in ('pending','in-progress','pending_resolution') then
    update public.demandas_municipais set revisao_pendente=true where id=d.id;
  end if;
  return new;
end $$;
create trigger demanda_receber_verificacao after update of status on public.reports for each row execute function public.demanda_receber_verificacao();

create or replace function public.demanda_receber_contestacao()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare d public.demandas_municipais%rowtype;
begin
  if new.update_type not in ('still_here','being_solved') or coalesce(new.status,'pending') in ('rejected','pending_moderation') then return new; end if;
  if tg_op='UPDATE' and old.status is not distinct from new.status then return new; end if;
  select q.* into d from public.demanda_broncas b join public.demandas_municipais q on q.id=b.demanda_id where b.report_id=new.report_id for update of q;
  if d.id is null or d.executada_em is null or new.created_at<d.executada_em or d.status not in ('aguardando_confirmacao','concluida') then return new; end if;
  if not exists(select 1 from public.demanda_eventos where demanda_id=d.id and tipo='contestacao' and detalhes->>'update_id'=new.id::text) then
    update public.demandas_municipais set revisao_pendente=true where id=d.id;
    insert into public.demanda_eventos(demanda_id,tipo,detalhes,criado_por)
    values(d.id,'contestacao',jsonb_build_object('report_id',new.report_id,'update_id',new.id,'mensagem',coalesce(new.message,'A comunidade informou que o problema persiste.')),new.author_id);
    if d.atribuido_a is not null then insert into public.notifications(user_id,type,title,message,link,is_read,created_at)
      values(d.atribuido_a,'agency_case','Resultado do atendimento precisa de revisão',d.protocolo||' · A comunidade informou que o problema persiste.','/prefeitura/demandas/'||d.id,false,now()); end if;
  end if;
  return new;
end $$;
create trigger demanda_receber_contestacao after insert or update of status on public.report_updates for each row execute function public.demanda_receber_contestacao();

drop function if exists public.salvar_configuracao_atendimento(uuid,boolean,jsonb);
create or replace function public.salvar_configuracao_atendimento(p_prefeitura uuid,p_regras jsonb)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare v_city bigint; regra jsonb;
begin
  select city_id into v_city from public.prefeituras where id=p_prefeitura;
  if not public.pode_administrar_prefeitura(auth.uid(),v_city) then raise exception 'Somente o administrador municipal pode configurar o atendimento'; end if;
  if jsonb_typeof(p_regras)<>'array' then raise exception 'Regras inválidas'; end if;
  for regra in select value from jsonb_array_elements(p_regras) loop
    if nullif(regra->>'canal_id','') is not null and not exists(select 1 from public.orgao_canais where id=(regra->>'canal_id')::uuid and city_id=v_city and not canal_triagem) then raise exception 'Secretaria inválida'; end if;
  end loop;
  delete from public.prefeitura_servico_regras where prefeitura_id=p_prefeitura;
  insert into public.prefeitura_servico_regras(prefeitura_id,category_id,canal_id,primeira_resposta_horas,atendimento_horas,prioridade)
  select p_prefeitura,value->>'category_id',nullif(value->>'canal_id','')::uuid,nullif(value->>'primeira_resposta_horas','')::integer,
    nullif(value->>'atendimento_horas','')::integer,coalesce(nullif(value->>'prioridade',''),'normal') from jsonb_array_elements(p_regras);
end $$;
revoke all on function public.salvar_configuracao_atendimento(uuid,jsonb) from public,anon;
grant execute on function public.salvar_configuracao_atendimento(uuid,jsonb) to authenticated;

-- Inventário e relatório por e-mail não determinam a disponibilidade da secretaria.
create or replace function public.arquivo_demanda_legivel(p_path text)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select exists(select 1 from public.demanda_anexos a where storage_path=p_path and
    (public.pode_ver_demanda(auth.uid(),a.demanda_id) or (a.visibilidade='publica' and public.demanda_tem_bronca_publica(a.demanda_id))))
$$;
revoke all on function public.arquivo_demanda_legivel(text) from public;
grant execute on function public.arquivo_demanda_legivel(text) to anon,authenticated;
-- Consulta sem RLS para impedir que a perda de acesso permita apagar evidências.
create or replace function public.arquivo_demanda_referenciado(p_path text)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select exists(select 1 from public.demanda_anexos where storage_path=p_path)
$$;
revoke all on function public.arquivo_demanda_referenciado(text) from public;
grant execute on function public.arquivo_demanda_referenciado(text) to authenticated;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('municipal-demand-files','municipal-demand-files',false,10485760,array['image/jpeg','image/png','image/webp','application/pdf'])
on conflict (id) do update set public=excluded.public,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
drop policy if exists municipal_files_insert on storage.objects;
drop policy if exists municipal_files_select on storage.objects;
drop policy if exists municipal_files_cleanup on storage.objects;
create policy municipal_files_insert on storage.objects for insert to authenticated with check (
  bucket_id='municipal-demand-files' and split_part(name,'/',2)=auth.uid()::text and exists(
    select 1 from public.prefeituras p where p.id::text=split_part(name,'/',1) and public.pode_acessar_prefeitura(auth.uid(),p.city_id)
      and (public.pode_administrar_prefeitura(auth.uid(),p.city_id) or exists(select 1 from public.orgao_membros m join public.orgao_canais c on c.id=m.canal_id
        where m.user_id=auth.uid() and m.ativo and m.papel in ('gestor','operador') and c.city_id=p.city_id))));
create policy municipal_files_select on storage.objects for select to anon,authenticated using (
  bucket_id='municipal-demand-files' and public.arquivo_demanda_legivel(name));
drop policy if exists municipal_files_staging on storage.objects;
create policy municipal_files_staging on storage.objects for select to authenticated using (
  bucket_id='municipal-demand-files' and split_part(name,'/',2)=auth.uid()::text and not public.arquivo_demanda_referenciado(name));
create policy municipal_files_cleanup on storage.objects for delete to authenticated using (
  bucket_id='municipal-demand-files' and split_part(name,'/',2)=auth.uid()::text and not public.arquivo_demanda_referenciado(name));

drop function if exists public.resumo_demandas_municipais(uuid);
create function public.resumo_demandas_municipais(p_prefeitura uuid)
returns table(total bigint,abertas bigint,em_andamento bigint,concluidas bigint,atrasadas bigint,vinculadas bigint,
  aguardando_confirmacao bigint,sem_responsavel bigint,revisao_pendente bigint,primeira_resposta_atrasada bigint)
language sql stable security invoker set search_path=public,pg_temp as $$
  select count(*),count(*) filter(where status='aberta'),
    count(*) filter(where status in ('triagem','programada','em_andamento','aguardando_informacao','aguardando_recurso')),
    count(*) filter(where status='concluida'),count(*) filter(where status not in ('concluida','cancelada','recusada') and prazo_em<now()),
    count(*) filter(where exists(select 1 from public.demanda_broncas b where b.demanda_id=d.id)),
    count(*) filter(where status='aguardando_confirmacao'),count(*) filter(where atribuido_a is null and status not in ('concluida','cancelada','recusada')),
    count(*) filter(where revisao_pendente),count(*) filter(where primeira_resposta_em is null and primeira_resposta_prazo_em<now() and status not in ('concluida','cancelada','recusada'))
  from public.demandas_municipais d where prefeitura_id=p_prefeitura
$$;
revoke all on function public.resumo_demandas_municipais(uuid) from public,anon;
grant execute on function public.resumo_demandas_municipais(uuid) to authenticated;

create table if not exists public.demanda_alertas (
  demanda_id uuid not null references public.demandas_municipais(id) on delete cascade,
  tipo text not null,prazo_em timestamptz not null,criado_em timestamptz not null default now(),
  primary key(demanda_id,tipo,prazo_em)
);
alter table public.demanda_alertas enable row level security;
create or replace function public.notificar_prazos_demandas()
returns integer language plpgsql security definer set search_path=public,pg_temp as $$
declare aviso record; v_count integer=0;
begin
  for aviso in
    with vencimentos as (
      select id,protocolo,titulo,atribuido_a,canal_id,'atendimento'::text tipo,prazo_em prazo from public.demandas_municipais where status not in ('concluida','cancelada','recusada')
      union all select id,protocolo,titulo,atribuido_a,canal_id,'primeira_resposta',primeira_resposta_prazo_em from public.demandas_municipais where primeira_resposta_em is null and status not in ('concluida','cancelada','recusada')
      union all select id,protocolo,titulo,atribuido_a,canal_id,'proxima_acao',proxima_acao_em from public.demandas_municipais where status not in ('concluida','cancelada','recusada')
    ) select * from vencimentos v where prazo<=now()+interval '24 hours' and not exists(select 1 from public.demanda_alertas a where a.demanda_id=v.id and a.tipo=v.tipo and a.prazo_em=v.prazo)
  loop
    insert into public.demanda_alertas(demanda_id,tipo,prazo_em) values(aviso.id,aviso.tipo,aviso.prazo) on conflict do nothing;
    if found then
      insert into public.notifications(user_id,type,title,message,link,is_read,created_at)
      select distinct m.user_id,'agency_case',case when aviso.prazo<now() then 'Prazo municipal vencido' else 'Prazo municipal próximo' end,
        aviso.protocolo||' · '||replace(aviso.tipo,'_',' ')||' · '||aviso.titulo,'/prefeitura/demandas/'||aviso.id,false,now()
      from public.orgao_membros m where m.ativo and m.canal_id=aviso.canal_id and
        ((aviso.atribuido_a is not null and m.user_id=aviso.atribuido_a) or (aviso.atribuido_a is null and m.papel='gestor'));
      v_count=v_count+1;
    end if;
  end loop;
  return v_count;
end $$;
revoke all on function public.notificar_prazos_demandas() from public,anon,authenticated;
grant execute on function public.notificar_prazos_demandas() to service_role;
do $$ begin
  if exists(select 1 from pg_namespace where nspname='cron') then
    perform cron.schedule('municipal-demand-deadlines','15 * * * *','select public.notificar_prazos_demandas();');
  end if;
end $$;

revoke all on function public.validar_demanda_municipal(),public.auditar_demanda_municipal(),public.demanda_receber_verificacao(),
  public.demanda_receber_contestacao() from public,anon,authenticated;
-- Desliga a conversão automática de broncas de versões anteriores desta migration.
drop function if exists public.receber_bronca_como_demanda();
notify pgrst,'reload schema';
commit;

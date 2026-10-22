-- Incremental sobre 378: registro técnico, reabertura e encerramento coerentes.
begin;
alter table public.municipal_execution_results drop constraint municipal_execution_results_action_check;
alter table public.municipal_execution_results add constraint municipal_execution_results_action_check check(action in ('iniciar','impedimento','concluir','encerrar'));
create or replace function public.validate_field_execution_order() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare choices text[]; v_city bigint;
begin
  select city_id into v_city from public.prefeituras where id=new.prefeitura_id;
  if new.execution_specialty is null and new.category_id is not null and new.canal_id is not null then
    select array_agg(s) into choices from public.orgao_canais c cross join lateral unnest(c.execution_specialties) s
      where c.id=new.canal_id and new.category_id=any(public.department_execution_categories(c.id,s));
    if cardinality(choices)=1 then new.execution_specialty=choices[1]; end if;
  end if;
  if new.execution_specialty is not null and new.execution_specialty<>'eletricista' then
    if new.category_id is null or new.canal_id is null or not(new.category_id=any(public.department_execution_categories(new.canal_id,new.execution_specialty))) then raise exception 'Atividade ou categoria fora da secretaria.'; end if;
    if tg_op='INSERT' or new.atribuido_a is distinct from old.atribuido_a or new.canal_id is distinct from old.canal_id or new.execution_specialty is distinct from old.execution_specialty then
      if new.atribuido_a is not null and not public.field_executor_can_work(new.atribuido_a,new.canal_id,new.execution_specialty,new.category_id) then raise exception 'Escolha um executor ativo desta atividade e secretaria.'; end if;
    end if;
    if new.category_id='iluminacao' or new.pole_id is not null then raise exception 'Use o fluxo do eletricista para iluminação.'; end if;
  end if;
  if new.asset_tree_id is not null and (new.execution_specialty is distinct from 'arborizacao' or not exists(select 1 from public.city_trees t where t.id=new.asset_tree_id and t.city_id=v_city)) then raise exception 'Árvore fora da atividade ou do município.'; end if;
  if new.asset_street_id is not null and (new.execution_specialty is distinct from 'ruas' or not exists(select 1 from public.pavement_streets s where s.id::text=new.asset_street_id and s.city_id=v_city)) then raise exception 'Rua fora da atividade ou do município.'; end if;
  return new;
end $$;
create or replace function public.field_executor_report_channel(p_user uuid,p_report uuid,p_specialty text) returns uuid
language sql stable security definer set search_path=public,pg_temp as $$
  select c.id from public.reports r join public.orgao_categorias oc on oc.city_id=r.city_id and oc.category_id=r.category_id
    join public.orgao_canais c on c.id=oc.canal_id
    where r.id=p_report and p_specialty<>'eletricista' and r.status in ('pending','in-progress','pending_resolution','pending_approval')
      and (coalesce(r.moderation_status,'approved')='approved' or (not r.is_public and r.moderation_status='internal' and exists(select 1 from public.prefeituras p where p.id=r.created_by_municipality and p.city_id=r.city_id))) and not coalesce(r.is_petition,false)
      and public.field_executor_can_work(p_user,c.id,p_specialty,r.category_id)
      and not exists(select 1 from public.orgao_casos o where o.report_id=r.id and o.canal_id<>c.id)
      and not exists(select 1 from public.demanda_broncas b where b.report_id=r.id)
      and not exists(select 1 from public.demandas_municipais d where d.report_id=r.id)
    order by c.id limit 1
$$;
-- O vínculo com a execução não pode ser forjado por uma inserção avulsa.
create function public.validate_tree_execution_result() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if new.execution_result_id is not null and not exists(select 1 from public.municipal_execution_results r
    where r.id=new.execution_result_id and r.tree_id=new.tree_id and r.executor_id=new.recorded_by
      and r.action='concluir' and new.service_type=any(r.service_types) and r.xmin::text=pg_current_xact_id()::text) then
    raise exception 'O cuidado vinculado deve ser registrado pela execução correspondente.' using errcode='42501';
  end if;
  return new;
end $$;
revoke all on function public.validate_tree_execution_result() from public,anon,authenticated;
create trigger tree_execution_result before insert or update of execution_result_id,tree_id,recorded_by,service_type on public.city_tree_care for each row execute function public.validate_tree_execution_result();

create function public.enforce_field_execution_record() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if auth.uid() is null or new.execution_specialty is null or new.execution_specialty='eletricista' then return new; end if;
  if old.status in ('concluida','cancelada','recusada','aguardando_confirmacao') and new.status in ('aberta','triagem','programada')
    and (public.municipal_channel_action(auth.uid(),new.canal_id,'dispatch') or exists(select 1 from public.prefeituras p where p.id=new.prefeitura_id and public.pode_administrar_prefeitura(auth.uid(),p.city_id)))
    and (new.resultado is null or new.resultado is not distinct from old.resultado) and (new.registro_execucao is null or new.registro_execucao is not distinct from old.registro_execucao) and new.executada_em is null then return new; end if;
  if (new.status in ('em_andamento','concluida','aguardando_confirmacao') and new.status is distinct from old.status)
    or new.resultado is distinct from old.resultado or new.registro_execucao is distinct from old.registro_execucao or new.executada_em is distinct from old.executada_em then
    -- Aceite inicia a atribuição; conferência aprova resultado já registrado.
    if old.atribuido_a is null and new.atribuido_a=auth.uid() and new.status='em_andamento' and new.resultado is not distinct from old.resultado and new.registro_execucao is not distinct from old.registro_execucao and new.executada_em is not distinct from old.executada_em then return new; end if;
    if old.status='aguardando_confirmacao' and new.status='concluida' and old.executada_por is distinct from auth.uid() and new.resultado is not distinct from old.resultado and new.registro_execucao is not distinct from old.registro_execucao and new.executada_em is not distinct from old.executada_em then return new; end if;
    if not exists(select 1 from public.municipal_execution_results r where r.demanda_id=new.id and r.executor_id=auth.uid()
      and r.xmin::text=pg_current_xact_id()::text and r.specialty=new.execution_specialty and r.cycle_started_at=new.ciclo_iniciado_em) then
      raise exception 'Registre a execução pelo painel do executor, com resultado e evidência.' using errcode='42501';
    end if;
  end if;
  return new;
end $$;
revoke all on function public.enforce_field_execution_record() from public,anon,authenticated;
create trigger zzzy_field_execution_record before update on public.demandas_municipais for each row execute function public.enforce_field_execution_record();

create or replace function public.registrar_execucao_executor(p_prefeitura uuid,p_ordem uuid,p_especialidade text,p_versao integer,p_operacao uuid,p_acao text,p_report uuid default null,p_dados jsonb default '{}',p_anexos jsonb default '[]') returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare d public.demandas_municipais%rowtype; previous public.municipal_execution_results%rowtype;
  r public.reports%rowtype; file jsonb; v_city bigint; v_tree uuid; v_services text[]; v_pending integer; v_result text; v_note text;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_prefeitura::text,0));
  select * into d from public.demandas_municipais where id=p_ordem and prefeitura_id=p_prefeitura for update;
  if d.id is null or not public.field_executor_order_access(auth.uid(),d.id,p_especialidade) then raise exception 'Ordem não atribuída a você nesta atividade.' using errcode='42501'; end if;
  if p_operacao is null or p_acao is null or p_acao not in ('iniciar','impedimento','concluir','encerrar') then raise exception 'Operação inválida.'; end if;
  select * into previous from public.municipal_execution_results where id=p_operacao;
  if previous.id is not null then
    if previous.demanda_id<>d.id or previous.executor_id<>auth.uid() or previous.action<>p_acao or previous.report_id is distinct from p_report then raise exception 'Identificador de operação já utilizado.' using errcode='23505'; end if;
    return jsonb_build_object('id',d.id,'status',d.status,'versao',d.versao,'repeated',true);
  end if;
  if p_versao is distinct from d.versao then raise exception 'A ordem mudou. Atualize antes de registrar.' using errcode='40001'; end if;
  if d.status in ('rascunho','concluida','aguardando_confirmacao','cancelada','recusada') then raise exception 'Esta ordem não permite execução.'; end if;
  select city_id into v_city from public.prefeituras where id=p_prefeitura;
  if p_dados is null or jsonb_typeof(p_dados)<>'object' or octet_length(p_dados::text)>20000 then raise exception 'Dados de execução inválidos.'; end if;
  v_result=btrim(coalesce(p_dados->>'resultado','')); v_note=nullif(btrim(p_dados->>'registro_execucao'),'');
  if length(v_result)>4000 or length(coalesce(v_note,''))>5000 then raise exception 'Texto muito longo.'; end if;
  v_services=array(select jsonb_array_elements_text(coalesce(p_dados->'service_types','[]')));
  if p_acao='concluir' then
    if d.status<>'em_andamento' or length(v_result)<10 then raise exception 'Inicie o serviço e descreva o resultado com pelo menos 10 caracteres.'; end if;
    if cardinality(v_services)=0 or cardinality(v_services)>5 or not(v_services <@ case p_especialidade when 'arborizacao' then array['poda','remocao','vistoria','tratamento','plantio'] when 'ruas' then array['reparo','pavimentacao','vistoria','sinalizacao','outro'] else array['manutencao','limpeza','vistoria','outro'] end) then raise exception 'Selecione serviços válidos para sua atividade.'; end if;
    if p_report is not null then
      select r0.* into r from public.reports r0 join public.demanda_broncas b on b.report_id=r0.id where b.demanda_id=d.id and r0.id=p_report for update of r0;
      if r.id is null or r.city_id<>v_city or r.category_id<>d.category_id or r.status='resolved' then raise exception 'Solicitação inválida ou já atendida.'; end if;
      if p_especialidade='arborizacao' then v_tree=r.tree_id; end if;
    elsif exists(select 1 from public.demanda_broncas b where b.demanda_id=d.id) then raise exception 'Selecione uma solicitação vinculada para registrar a execução.';
    else v_tree=d.asset_tree_id; end if;
    if v_tree is not null and not exists(select 1 from public.city_trees t where t.id=v_tree and t.city_id=v_city) then raise exception 'Árvore fora do município.'; end if;
    if p_anexos is null or jsonb_typeof(p_anexos)<>'array' or jsonb_array_length(p_anexos)>5 then raise exception 'Use até cinco evidências.'; end if;
    if jsonb_array_length(p_anexos)=0 and length(coalesce(v_note,''))<20 then raise exception 'Anexe evidência ou registre uma nota técnica com pelo menos 20 caracteres.'; end if;
  elsif p_acao='encerrar' then
    if p_report is not null or not exists(select 1 from public.demanda_broncas b where b.demanda_id=d.id) or exists(select 1 from public.demanda_broncas b join public.reports r0 on r0.id=b.report_id where b.demanda_id=d.id and r0.status is distinct from 'resolved') then raise exception 'Todas as solicitações precisam estar atendidas antes de encerrar a ordem.'; end if;
    v_services='{}'; v_result='Ordem encerrada com solicitações já atendidas. Nenhum serviço técnico adicional registrado.';
  elsif p_acao='impedimento' and length(v_result)<5 then raise exception 'Descreva o impedimento.';
  elsif p_acao='iniciar' and d.status not in ('aberta','triagem','programada','em_andamento') then raise exception 'Serviço indisponível para início.'; end if;
  insert into public.municipal_execution_results(id,demanda_id,report_id,executor_id,specialty,action,cycle_started_at,service_types,result,technical_note,tree_id,street_id)
    values(p_operacao,d.id,p_report,auth.uid(),p_especialidade,p_acao,d.ciclo_iniciado_em,v_services,v_result,v_note,v_tree,d.asset_street_id);
  if p_acao='concluir' then
    for file in select value from jsonb_array_elements(p_anexos) loop
      if file->>'mime_type' not in ('image/jpeg','image/png','image/webp','application/pdf') or coalesce((file->>'tamanho')::bigint,0) not between 1 and 10485760
        or position(p_prefeitura::text||'/'||auth.uid()::text||'/'||p_operacao::text||'/' in coalesce(file->>'storage_path',''))<>1
        or not exists(select 1 from storage.objects o where o.bucket_id='municipal-demand-files' and o.name=file->>'storage_path') then raise exception 'Evidência inválida ou fora desta execução.'; end if;
      insert into public.demanda_anexos(demanda_id,report_id,storage_path,nome,mime_type,tamanho,visibilidade,tipo,criado_por)
        values(d.id,p_report,file->>'storage_path',left(coalesce(file->>'nome','Evidência'),180),file->>'mime_type',(file->>'tamanho')::bigint,'interna','conclusao',auth.uid());
    end loop;
    if v_tree is not null then
      insert into public.city_tree_care(tree_id,service_type,performed_on,notes,recorded_by,execution_result_id)
        select v_tree,s,current_date,'Manejo registrado em execução municipal vinculada.',auth.uid(),p_operacao from unnest(v_services) s on conflict do nothing;
    end if;
    if p_report is not null then
      update public.reports set status='resolved' where id=p_report;
      update public.demanda_broncas set atendida_em=now(),atendida_por=auth.uid(),service_types=v_services,resultado=v_result where demanda_id=d.id and report_id=p_report;
      update public.orgao_casos set status='encerrada',updated_at=now() where report_id=p_report;
    end if;
    select count(*) into v_pending from public.demanda_broncas b join public.reports r0 on r0.id=b.report_id where b.demanda_id=d.id and r0.status is distinct from 'resolved';
    update public.demandas_municipais set status=case when v_pending>0 then 'em_andamento' else 'concluida' end,resultado=v_result,registro_execucao=v_note,executada_em=now(),updated_by=auth.uid() where id=d.id returning * into d;
  elsif p_acao='encerrar' then
    update public.demandas_municipais set status='concluida',updated_by=auth.uid() where id=d.id returning * into d;
  elsif p_acao='iniciar' then
    update public.demandas_municipais set status='em_andamento',updated_by=auth.uid() where id=d.id returning * into d;
  else
    update public.demandas_municipais set registro_execucao=v_result,updated_by=auth.uid() where id=d.id returning * into d;
  end if;
  insert into public.demanda_eventos(demanda_id,tipo,criado_por,detalhes) values(d.id,case p_acao when 'encerrar' then 'ordem_encerrada' when 'concluir' then 'solicitacao_atendida' when 'impedimento' then 'impedimento' else 'execucao_iniciada' end,
    auth.uid(),jsonb_build_object('mensagem',v_result,'atividade',p_especialidade,'operacao',p_operacao,'report_id',p_report,'resultado',v_result));
  return jsonb_build_object('id',d.id,'status',d.status,'versao',d.versao);
end $$;
do $migration$
declare definition text;
begin
  definition=pg_get_functiondef('public.reabrir_solicitacoes_ordem()'::regprocedure);
  if position('new.category_id=''iluminacao''' in definition)=0 then raise exception 'Contrato de reabertura incompatível.'; end if;
  execute replace(definition,'new.category_id=''iluminacao''','(new.category_id=''iluminacao'' or new.execution_specialty is not null)');
end $migration$;
-- Ordens sem responsável ou já atribuídas a executor válido entram na fila.
-- Atribuições administrativas antigas exigem redistribuição explícita pelo gestor.
update public.demandas_municipais d set execution_specialty=s.specialty from (
  select d0.id,min(activity) specialty from public.demandas_municipais d0 join public.orgao_canais c on c.id=d0.canal_id
    cross join lateral unnest(c.execution_specialties) activity
  where d0.execution_specialty is null and d0.category_id<>'iluminacao'
    and d0.category_id=any(public.department_execution_categories(c.id,activity))
    and (d0.atribuido_a is null or public.field_executor_can_work(d0.atribuido_a,c.id,activity,d0.category_id))
  group by d0.id having count(*)=1
) s where d.id=s.id;
notify pgrst,'reload schema';
commit;

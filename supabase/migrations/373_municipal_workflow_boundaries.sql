begin;
alter table public.demandas_municipais drop constraint demandas_municipais_status_check;
alter table public.demandas_municipais add constraint demandas_municipais_status_check check(status in
 ('rascunho','aberta','triagem','programada','em_andamento','aguardando_informacao','aguardando_recurso','aguardando_confirmacao','concluida','recusada','cancelada'));

create or replace function public.pode_ver_demanda(p_user uuid,p_demanda uuid)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select exists(select 1 from public.demandas_municipais d join public.prefeituras p on p.id=d.prefeitura_id
    where d.id=p_demanda and p.status='ativa' and public.pode_acessar_prefeitura(p_user,p.city_id)
      and ((public.pode_administrar_prefeitura(p_user,p.city_id))
        or (public.municipal_channel_action(p_user,d.canal_id,'read')
          and (d.status<>'rascunho' or d.criado_por=p_user or public.municipal_channel_action(p_user,d.canal_id,'dispatch')))
        or (d.status<>'rascunho' and d.category_id='iluminacao' and d.atribuido_a=p_user and public.eletricista_ativo_municipio(p_user,p.city_id))))
$$;
create or replace function public.pode_operar_demanda(p_user uuid,p_demanda uuid)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select exists(select 1 from public.demandas_municipais d join public.prefeituras p on p.id=d.prefeitura_id
    where d.id=p_demanda and public.pode_ver_demanda(p_user,p_demanda)
      and (public.pode_administrar_prefeitura(p_user,p.city_id) or public.municipal_channel_action(p_user,d.canal_id,'dispatch')
        or (d.status='rascunho' and d.criado_por=p_user and public.municipal_channel_action(p_user,d.canal_id,'receive'))
        or (d.category_id='iluminacao' and d.atribuido_a=p_user and public.eletricista_ativo_municipio(p_user,p.city_id))))
$$;

create function public.municipal_report_access(p_user uuid,p_report uuid,p_action text default 'read')
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select exists(select 1 from public.reports r where r.id=p_report and (
    public.pode_administrar_prefeitura(p_user,r.city_id)
    or exists(select 1 from public.orgao_casos c where c.report_id=r.id and public.municipal_channel_action(p_user,c.canal_id,p_action))
    or (p_action='read' and exists(select 1 from public.demanda_broncas b where b.report_id=r.id and public.pode_ver_demanda(p_user,b.demanda_id)))
    or (not exists(select 1 from public.orgao_casos c where c.report_id=r.id)
      and exists(select 1 from public.orgao_categorias oc where oc.city_id=r.city_id and oc.category_id=r.category_id
        and public.municipal_channel_action(p_user,oc.canal_id,p_action)))))
$$;
revoke all on function public.municipal_report_access(uuid,uuid,text) from public,anon;
grant execute on function public.municipal_report_access(uuid,uuid,text) to authenticated;
create policy reports_responsibility_scope on public.reports as restrictive for select to authenticated
  using(is_public or public.is_admin(auth.uid()) or public.is_master(auth.uid()) or public.municipal_report_access(auth.uid(),id));
create or replace function public.can_view_municipal_report_media(p_report uuid)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select not exists(select 1 from public.reports r where r.id=p_report and not r.is_public
    and not public.is_admin(auth.uid()) and not public.is_master(auth.uid())
    and not public.municipal_report_access(auth.uid(),r.id))
$$;
create or replace function public.can_access_municipal_report_receipt(p_report_id text,p_write boolean default false)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select exists(select 1 from public.reports r where r.id::text=p_report_id
    and public.municipal_report_access(auth.uid(),r.id,case when p_write then 'receive' else 'read' end))
$$;

create function public.enforce_municipal_order_responsibility() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_city bigint; v_dispatch boolean; v_execute boolean;
begin
  if auth.uid() is null then return new; end if; -- Database jobs have no end-user JWT.
  select city_id into v_city from public.prefeituras where id=new.prefeitura_id and status='ativa';
  v_dispatch=public.pode_administrar_prefeitura(auth.uid(),v_city) or public.municipal_channel_action(auth.uid(),new.canal_id,'dispatch');
  v_execute=new.category_id='iluminacao' and new.atribuido_a=auth.uid() and public.eletricista_ativo_municipio(auth.uid(),v_city);
  if tg_op='UPDATE' and old.canal_id is distinct from new.canal_id
    and not(public.pode_administrar_prefeitura(auth.uid(),v_city)
      or public.municipal_channel_action(auth.uid(),old.canal_id,'dispatch')) then
    raise exception 'Sem permissão na secretaria de origem.' using errcode='42501'; end if;
  if new.status='rascunho' and not v_dispatch then
    if not public.municipal_channel_action(auth.uid(),new.canal_id,'receive')
      or new.criado_por is distinct from auth.uid() or new.atribuido_a is not null or new.previsto_em is not null
      or new.prioridade<>'normal' or new.executada_em is not null or new.resultado is not null then
      raise exception 'Atendente pode preparar somente um rascunho sem programação ou execução.' using errcode='42501'; end if;
    if tg_op='UPDATE' and old.status<>'rascunho' then raise exception 'Somente o gestor pode alterar esta ordem.' using errcode='42501'; end if;
  elsif not v_dispatch then
    if not coalesce(v_execute,false) then raise exception 'Somente o gestor pode programar ou distribuir serviços.' using errcode='42501'; end if;
    if tg_op='UPDATE' then
      if (to_jsonb(new)-array['status','resultado','registro_execucao','executada_em','concluida_em','updated_by','updated_at','versao','atribuido_a','executada_por'])
        is distinct from (to_jsonb(old)-array['status','resultado','registro_execucao','executada_em','concluida_em','updated_by','updated_at','versao','atribuido_a','executada_por'])
        or (old.atribuido_a is not null and old.atribuido_a<>auth.uid()) then
        raise exception 'Executor só pode registrar o serviço atribuído.' using errcode='42501'; end if;
      if new.status not in ('em_andamento','aguardando_confirmacao','concluida') and not
        (old.atribuido_a is null and new.atribuido_a=auth.uid() and new.status=old.status and old.status in ('aberta','triagem','programada')) then
        raise exception 'Informe um impedimento sem cancelar a ordem.' using errcode='42501'; end if;
    end if;
  end if;
  if new.status in ('em_andamento','aguardando_confirmacao','concluida') and (tg_op='INSERT' or old.status is distinct from new.status)
    and not coalesce(v_execute,false) then
    if not (v_dispatch and old.status='aguardando_confirmacao' and new.status='concluida' and old.executada_em is not null and old.atribuido_a is distinct from auth.uid()) then
      raise exception 'A execução deve ser registrada pelo executor; o gestor confere o resultado.' using errcode='42501'; end if;
  end if;
  return new;
end $$;
create trigger zzzz_municipal_order_responsibility before insert or update on public.demandas_municipais
  for each row execute function public.enforce_municipal_order_responsibility();

-- Mantém as validações e a transação existentes, acrescentando as barreiras
-- de ação nas RPCs SECURITY DEFINER que antes verificavam apenas o papel.
do $migration$
declare f record; definition text; guard text;
begin
  for f in select p.oid,p.proname,l.lanname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    join pg_language l on l.oid=p.prolang where n.nspname='public' and p.prokind='f' loop
    definition=pg_get_functiondef(f.oid); guard=null;
    if f.proname in ('gerir_iluminacao_municipal','atualizar_lampadas_postes_em_massa','atualizar_lampadas_postes_em_massa_por_ids') then
      guard='if not public.municipal_city_action(auth.uid(),p_city_id,''lighting'') then raise exception ''Sem concessão de cadastro de postes.'' using errcode=''42501''; end if;';
      -- A regra antiga de cargo deixaria de fora o responsável apenas pelo mapa.
      definition=regexp_replace(definition,'if (not public.pode_acessar_prefeitura|p_city_id is null)[\s\S]*?end if;',guard,'i');
      guard=null;
    elsif f.proname='atualizar_bronca_prefeitura' then
      guard='if not public.municipal_report_access(auth.uid(),p_report,''receive'') then raise exception ''Sem acesso a este atendimento.'' using errcode=''42501''; end if;
        if p_situacao<>''recebida'' then raise exception ''Use uma ordem de serviço para registrar execução.'' using errcode=''42501''; end if;';
    elsif f.proname='registrar_resolucao_solicitacao_municipal' then
      guard='if not exists(select 1 from public.demandas_municipais q join public.prefeituras p on p.id=q.prefeitura_id where q.id=p_ordem and q.prefeitura_id=p_prefeitura and q.atribuido_a=auth.uid() and public.eletricista_ativo_municipio(auth.uid(),p.city_id)) then raise exception ''A resolução exige o executor atribuído.'' using errcode=''42501''; end if;';
    elsif f.proname='atualizar_caso_do_orgao' then
      guard='if p_status in (''em_execucao'',''execucao_informada'',''aguardando_confirmacao'',''encerrada'') then raise exception ''Use a ordem de serviço ou o encerramento administrativo.'' using errcode=''42501''; end if;
        if exists(select 1 from public.orgao_casos q where q.report_id=p_report_id and not public.municipal_channel_action(auth.uid(),q.canal_id,''dispatch'') and (
        coalesce(p_status,q.status) not in (''nova'',''recebida'',''triagem'') or p_prioridade is distinct from q.prioridade or p_atribuido_a is distinct from q.atribuido_a or p_prazo_em is distinct from q.prazo_em)) then raise exception ''Atendente não pode programar, atribuir ou declarar execução.'' using errcode=''42501''; end if;';
    elsif f.proname='salvar_demanda_municipal' then
      -- Rascunhos não geram prazo nem alteram o andamento público.
      definition=regexp_replace(definition,'if v_nova then(\s+)if d\.prazo_em',
        'if v_nova and d.status<>''rascunho'' then\1if d.prazo_em');
      definition=replace(definition,'perform public.publicar_estado_demanda(d.id,v_report,v_motivo);','if d.status<>''rascunho'' then perform public.publicar_estado_demanda(d.id,v_report,v_motivo); end if;');
      guard='if p_dados->>''status''=''rascunho'' and (p_resposta_publica is not null or exists(select 1 from jsonb_array_elements(coalesce(p_anexos,''[]''::jsonb)) j where j->>''visibilidade''=''publica'')) then raise exception ''Rascunho não publica comunicação ou anexos.''; end if;';
    end if;
    -- RPCs de consulta privadas devem exigir atendimento, não mero vínculo.
    if f.proname in ('buscar_broncas_para_demanda','vinculos_broncas_prefeitura') then
      guard=coalesce(guard,'')||' if not exists(select 1 from public.prefeituras p where p.id=p_prefeitura and public.municipal_city_action(auth.uid(),p.city_id,''read'')) then raise exception ''Sem acesso ao atendimento.'' using errcode=''42501''; end if;';
      if f.proname='buscar_broncas_para_demanda' then
        definition=replace(definition,'where r.city_id=v_city','where public.municipal_report_access(auth.uid(),r.id) and r.city_id=v_city');
      else
        definition=replace(definition,'where d.prefeitura_id=p_prefeitura','where (r.is_public or public.municipal_report_access(auth.uid(),r.id)) and d.prefeitura_id=p_prefeitura');
        definition=replace(definition,'d.protocolo,d.status','case when public.pode_ver_demanda(auth.uid(),d.id) then d.protocolo end,case when public.pode_ver_demanda(auth.uid(),d.id) then d.status end');
      end if;
    end if;
    if f.proname in ('ranking_eletricistas_iluminacao','ordens_estatisticas_iluminacao','solicitacoes_estatisticas_iluminacao','atendimentos_eletricista_iluminacao') then
      definition=replace(definition,'where d.prefeitura_id=p_prefeitura','where public.pode_ver_demanda(auth.uid(),d.id) and d.prefeitura_id=p_prefeitura');
      definition=replace(definition,'where d.prefeitura_id = p_prefeitura','where public.pode_ver_demanda(auth.uid(),d.id) and d.prefeitura_id = p_prefeitura');
      definition=replace(definition,'where r.city_id=v_city','where public.municipal_report_access(auth.uid(),r.id) and r.city_id=v_city');
      definition=replace(definition,'where r.city_id = v_city','where public.municipal_report_access(auth.uid(),r.id) and r.city_id = v_city');
    end if;
    -- A execução acumulada não pode depender do papel de apresentação legado.
    definition=regexp_replace(definition,'m\.papel\s*=\s*''eletricista''','public.municipal_channel_action(m.user_id,m.canal_id,''execute'')','g');
    if guard is not null and f.lanname='plpgsql' then
      definition=regexp_replace(definition,'\mbegin\M','begin '||guard,'i');
    end if;
    if definition is distinct from pg_get_functiondef(f.oid) then execute definition; end if;
  end loop;
end $migration$;

-- A antiga concessão genérica de editar ruas para qualquer funcionário não
-- deve sobreviver à separação entre atendimento e inventário.
create or replace function public.pode_editar_ruas_municipais(p_city_id bigint)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select public.pode_gerenciar_mapa_ruas(p_city_id)
$$;
revoke all on function public.pode_editar_ruas_municipais(bigint) from public,anon;
grant execute on function public.pode_editar_ruas_municipais(bigint) to authenticated;

create function public.encerrar_atendimento_administrativo(p_prefeitura uuid,p_report uuid,p_motivo text,p_resposta text)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare r public.reports%rowtype; v_channel uuid; v_orgao text;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_prefeitura::text,0));
  select * into r from public.reports where id=p_report for update;
  if r.id is null or not exists(select 1 from public.prefeituras p where p.id=p_prefeitura and p.city_id=r.city_id and p.status='ativa')
    or not public.municipal_report_access(auth.uid(),r.id,'receive') then raise exception 'Sem acesso ao atendimento.' using errcode='42501'; end if;
  if p_motivo is null or p_motivo not in ('orientacao','duplicidade','fora_competencia') or length(btrim(coalesce(p_resposta,''))) not between 5 and 4000 then
    raise exception 'Escolha o motivo administrativo e registre a resposta ao cidadão.'; end if;
  if exists(select 1 from public.demanda_broncas b where b.report_id=r.id)
    or exists(select 1 from public.demandas_municipais d where d.report_id=r.id) then raise exception 'Este atendimento possui ordem de serviço. Use a ordem vinculada.'; end if;
  select c.id,c.nome into v_channel,v_orgao from public.orgao_canais c
    where c.city_id=r.city_id and c.ativo and not c.canal_triagem
      and public.municipal_channel_action(auth.uid(),c.id,'receive')
      and (exists(select 1 from public.orgao_casos q where q.report_id=r.id and q.canal_id=c.id)
        or (not exists(select 1 from public.orgao_casos q where q.report_id=r.id)
          and exists(select 1 from public.orgao_categorias oc where oc.canal_id=c.id and oc.category_id=r.category_id))) order by c.id limit 1;
  if v_channel is null then raise exception 'Encaminhe a solicitação para a secretaria antes de encerrar.'; end if;
  if r.status='resolved' then return; end if;
  if r.status not in ('pending','in-progress','pending_resolution') then raise exception 'Atendimento indisponível.'; end if;
  update public.reports set status='resolved' where id=r.id;
  update public.orgao_casos set status='encerrada',updated_at=now() where report_id=r.id;
  insert into public.orgao_caso_eventos(report_id,canal_id,tipo,detalhes,criado_por)
    values(r.id,v_channel,'atualizada',jsonb_build_object('acao','encerramento_administrativo','motivo',p_motivo,'resposta',btrim(p_resposta)),auth.uid());
  insert into public.orgao_respostas(report_id,canal_id,orgao_nome,autor_id,visibilidade,mensagem)
    values(r.id,v_channel,v_orgao,auth.uid(),'publica',btrim(p_resposta));
  insert into public.report_official_steps(report_id,etapa,orgao,observacao,registrado_por,registrado_por_papel)
    values(r.id,'recebida',v_orgao,'Encerramento administrativo ('||p_motivo||'): '||btrim(p_resposta),auth.uid(),'orgao');
  insert into public.notifications(user_id,type,title,message,link,report_id,is_read,created_at)
    select user_id,'agency_response','Resposta da prefeitura',left(btrim(p_resposta),180),'/bronca/'||r.id,r.id,false,now()
    from public.report_participants(r.id) where user_id<>auth.uid();
end $$;
revoke all on function public.encerrar_atendimento_administrativo(uuid,uuid,text,text) from public,anon;
grant execute on function public.encerrar_atendimento_administrativo(uuid,uuid,text,text) to authenticated;

-- Restrição adicional cobre SELECTs que políticas permissivas antigas concedem.
create policy demand_responsibility_read on public.demandas_municipais as restrictive for select to authenticated
  using(public.pode_ver_demanda(auth.uid(),id));
create policy case_responsibility_read on public.orgao_casos as restrictive for select to authenticated
  using(public.pode_ver_caso_do_orgao(auth.uid(),canal_id));
create policy case_event_responsibility_read on public.orgao_caso_eventos as restrictive for select to authenticated
  using(public.pode_ver_caso_do_orgao(auth.uid(),canal_id));
create policy case_response_responsibility_read on public.orgao_respostas as restrictive for select to authenticated
  using(visibilidade='publica' or public.pode_ver_caso_do_orgao(auth.uid(),canal_id));
notify pgrst,'reload schema';
commit;

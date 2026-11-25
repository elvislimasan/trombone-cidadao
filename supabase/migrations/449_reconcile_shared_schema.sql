-- Reconcilia diferenças de schema comuns verificadas em produção em 21/11/2026.
-- Não altera dados de usuários, configuração de webhooks ou o acervo legislativo.
begin;

CREATE OR REPLACE FUNCTION public.add_community_tree_comment(p_id uuid, p_tree uuid, p_body text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare t public.community_trees; c public.community_tree_comments;
begin
  if auth.uid() is null then raise exception 'Entre na sua conta para comentar.' using errcode='42501'; end if;
  if p_id is null or coalesce(length(btrim(p_body)),0) not between 1 and 1000 then raise exception 'Escreva um comentário de até 1.000 caracteres.'; end if;
  perform pg_advisory_xact_lock(hashtext('community-comment'),hashtext(auth.uid()::text));
  select * into t from public.community_trees where id=p_tree for share;
  if not found or t.status<>'approved' or not t.public_profile then raise exception 'Comentários disponíveis em perfis públicos aprovados.' using errcode='42501'; end if;
  select * into c from public.community_tree_comments where id=p_id;
  if found then
    if c.author_id<>auth.uid() or c.tree_id<>p_tree then raise exception 'Comentário indisponível.' using errcode='42501'; end if;
    return c.id;
  end if;
  if (select count(*) from public.community_tree_comments where author_id=auth.uid() and created_at>clock_timestamp()-interval '1 minute')>=5 then
    raise exception 'Aguarde um minuto antes de comentar novamente.' using errcode='P0001';
  end if;
  insert into public.community_tree_comments(id,tree_id,author_id,body) values(p_id,p_tree,auth.uid(),btrim(p_body));
  return p_id;
end $function$;
revoke all on function public.add_community_tree_comment(p_id uuid, p_tree uuid, p_body text) from public,anon,authenticated,service_role;
grant execute on function public.add_community_tree_comment(p_id uuid, p_tree uuid, p_body text) to service_role;
grant execute on function public.add_community_tree_comment(p_id uuid, p_tree uuid, p_body text) to authenticated;

CREATE OR REPLACE FUNCTION public.arquivo_demanda_referenciado(p_path text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select exists(select 1 from public.demanda_anexos where storage_path=p_path)
$function$;
revoke all on function public.arquivo_demanda_referenciado(p_path text) from public,anon,authenticated,service_role;
grant execute on function public.arquivo_demanda_referenciado(p_path text) to anon;
grant execute on function public.arquivo_demanda_referenciado(p_path text) to service_role;
grant execute on function public.arquivo_demanda_referenciado(p_path text) to authenticated;

CREATE OR REPLACE FUNCTION public.atualizar_caso_do_orgao(p_report_id uuid, p_status text DEFAULT NULL::text, p_prioridade text DEFAULT NULL::text, p_atribuido_a uuid DEFAULT NULL::uuid, p_protocolo text DEFAULT NULL::text, p_prazo_em timestamp with time zone DEFAULT NULL::timestamp with time zone, p_resposta_publica text DEFAULT NULL::text, p_nota_interna text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_caso public.orgao_casos%rowtype;
  v_novo public.orgao_casos%rowtype;
  v_orgao text;
  v_etapa text;
  v_resposta text := nullif(btrim(coalesce(p_resposta_publica, '')), '');
  v_nota text := nullif(btrim(coalesce(p_nota_interna, '')), '');
begin if p_status in ('em_execucao','execucao_informada','aguardando_confirmacao','encerrada') then raise exception 'Use a ordem de serviço ou o encerramento administrativo.' using errcode='42501'; end if;
        if exists(select 1 from public.orgao_casos q where q.report_id=p_report_id and not public.municipal_channel_action(auth.uid(),q.canal_id,'dispatch') and (
        coalesce(p_status,q.status) not in ('nova','recebida','triagem') or p_prioridade is distinct from q.prioridade or p_atribuido_a is distinct from q.atribuido_a or p_prazo_em is distinct from q.prazo_em)) then raise exception 'Atendente não pode programar, atribuir ou declarar execução.' using errcode='42501'; end if;
  select * into v_caso from public.orgao_casos where report_id = p_report_id for update;
  if v_caso.report_id is null then raise exception 'Demanda nao encontrada no painel do orgao'; end if;
  if not public.pode_operar_caso_do_orgao(auth.uid(), v_caso.canal_id) then
    raise exception 'Sem permissao para operar esta secretaria';
  end if;
  if p_status is not null and p_status not in (
    'nova', 'recebida', 'triagem', 'atribuida', 'programada', 'em_execucao',
    'execucao_informada', 'aguardando_confirmacao', 'encerrada', 'recusada'
  ) then raise exception 'Situacao invalida'; end if;
  if p_prioridade is not null and p_prioridade not in ('baixa', 'normal', 'alta', 'urgente') then
    raise exception 'Prioridade invalida';
  end if;
  if p_status = 'recusada' and v_resposta is null then
    raise exception 'Explique publicamente o motivo da recusa';
  end if;
  if p_atribuido_a is not null and not exists (
    select 1 from public.orgao_membros m
    where m.canal_id = v_caso.canal_id and m.user_id = p_atribuido_a and m.ativo
  ) then raise exception 'O responsavel precisa fazer parte desta secretaria'; end if;

  select nome into v_orgao from public.orgao_canais where id = v_caso.canal_id;

  update public.orgao_casos
  set status = coalesce(p_status, status),
      prioridade = coalesce(p_prioridade, prioridade),
      -- O formulario sempre envia o retrato completo destes campos; NULL
      -- significa limpar atribuicao, protocolo ou prazo.
      atribuido_a = p_atribuido_a,
      protocolo = nullif(btrim(coalesce(p_protocolo, '')), ''),
      prazo_em = p_prazo_em,
      recebido_em = case
        when recebido_em is null and coalesce(p_status, status) <> 'nova' then now()
        else recebido_em
      end,
      ultima_resposta_publica_em = case when v_resposta is not null then now() else ultima_resposta_publica_em end,
      updated_at = now()
  where report_id = p_report_id
  returning * into v_novo;

  if v_caso.status is distinct from v_novo.status
     or v_caso.prioridade is distinct from v_novo.prioridade
     or v_caso.atribuido_a is distinct from v_novo.atribuido_a
     or v_caso.protocolo is distinct from v_novo.protocolo
     or v_caso.prazo_em is distinct from v_novo.prazo_em then
    insert into public.orgao_caso_eventos (
      report_id, canal_id, tipo, de_status, para_status, detalhes, criado_por
    ) values (
      p_report_id, v_caso.canal_id,
      case when v_caso.atribuido_a is distinct from v_novo.atribuido_a then 'atribuida' else 'atualizada' end,
      v_caso.status, v_novo.status,
      jsonb_strip_nulls(jsonb_build_object(
        'prioridade', v_novo.prioridade,
        'atribuido_a', v_novo.atribuido_a,
        'protocolo', v_novo.protocolo,
        'prazo_em', v_novo.prazo_em
      )), auth.uid()
    );
  end if;

  if v_resposta is not null then
    insert into public.orgao_respostas (report_id, canal_id, orgao_nome, autor_id, visibilidade, mensagem)
    values (p_report_id, v_caso.canal_id, v_orgao, auth.uid(), 'publica', v_resposta);
    insert into public.orgao_caso_eventos (report_id, canal_id, tipo, detalhes, criado_por)
    values (p_report_id, v_caso.canal_id, 'resposta_publica', jsonb_build_object('mensagem', v_resposta), auth.uid());
  end if;

  if v_nota is not null then
    insert into public.orgao_respostas (report_id, canal_id, orgao_nome, autor_id, visibilidade, mensagem)
    values (p_report_id, v_caso.canal_id, v_orgao, auth.uid(), 'interna', v_nota);
    insert into public.orgao_caso_eventos (report_id, canal_id, tipo, detalhes, criado_por)
    values (p_report_id, v_caso.canal_id, 'nota_interna', jsonb_build_object('mensagem', v_nota), auth.uid());
  end if;

  if v_caso.status is distinct from v_novo.status then
    v_etapa := case v_novo.status
      when 'recebida' then 'recebida'
      when 'programada' then 'programada'
      when 'execucao_informada' then 'executada'
      when 'aguardando_confirmacao' then 'executada'
      when 'recusada' then 'recusada'
      else null
    end;
    if v_etapa is not null then
      insert into public.report_official_steps (
        report_id, etapa, orgao, protocolo, observacao, registrado_por, registrado_por_papel
      ) values (
        p_report_id, v_etapa, v_orgao, v_novo.protocolo,
        case when v_etapa = 'recusada' then v_resposta else null end,
        auth.uid(), 'orgao'
      );
    end if;
  end if;

  if v_novo.status in ('recebida', 'triagem', 'atribuida', 'programada', 'em_execucao') then
    update public.reports set status = 'in-progress'
    where id = p_report_id and status = 'pending';
  elsif v_novo.status in ('execucao_informada', 'aguardando_confirmacao') then
    update public.reports set status = 'pending_resolution'
    where id = p_report_id and status in ('pending', 'in-progress');
  end if;

  if v_resposta is not null then
    insert into public.notifications (user_id, type, title, message, link, report_id, is_read, created_at)
    select r.author_id, 'agency_response', 'A prefeitura respondeu sua bronca',
           left(v_resposta, 180), '/bronca/' || p_report_id::text, p_report_id, false, now()
    from public.reports r
    where r.id = p_report_id and r.author_id is not null and r.author_id <> auth.uid();
  end if;

  return jsonb_build_object('ok', true, 'report_id', p_report_id, 'status', v_novo.status);
end;
$function$;
revoke all on function public.atualizar_caso_do_orgao(p_report_id uuid, p_status text, p_prioridade text, p_atribuido_a uuid, p_protocolo text, p_prazo_em timestamp with time zone, p_resposta_publica text, p_nota_interna text) from public,anon,authenticated,service_role;
grant execute on function public.atualizar_caso_do_orgao(p_report_id uuid, p_status text, p_prioridade text, p_atribuido_a uuid, p_protocolo text, p_prazo_em timestamp with time zone, p_resposta_publica text, p_nota_interna text) to service_role;
grant execute on function public.atualizar_caso_do_orgao(p_report_id uuid, p_status text, p_prioridade text, p_atribuido_a uuid, p_protocolo text, p_prazo_em timestamp with time zone, p_resposta_publica text, p_nota_interna text) to authenticated;

CREATE OR REPLACE FUNCTION public.auditar_demanda_municipal()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
    values(new.atribuido_a,'agency_case','Atendimento atribuído a você',new.protocolo||' · '||new.titulo,case when new.execution_specialty in ('arborizacao','ruas','servicos_gerais') then '/prefeitura/executor/'||new.execution_specialty||'/ordem/'||new.id else '/prefeitura/demandas/'||new.id end,false,now());
  end if;
  return new;
end $function$;
revoke all on function public.auditar_demanda_municipal() from public,anon,authenticated,service_role;
grant execute on function public.auditar_demanda_municipal() to service_role;

CREATE OR REPLACE FUNCTION public.delete_community_tree_comment(p_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare c public.community_tree_comments; t public.community_trees;
begin
  if auth.uid() is null then raise exception 'Entre na sua conta.' using errcode='42501'; end if;
  select * into c from public.community_tree_comments where id=p_id for update;
  if not found then return; end if;
  select * into t from public.community_trees where id=c.tree_id;
  if c.author_id<>auth.uid() and t.author_id<>auth.uid() and not coalesce(public.can_manage_tree_adoption(t.city_id),false) then
    raise exception 'Sem permissão para excluir este comentário.' using errcode='42501';
  end if;
  delete from public.community_tree_comments where id=p_id;
end $function$;
revoke all on function public.delete_community_tree_comment(p_id uuid) from public,anon,authenticated,service_role;
grant execute on function public.delete_community_tree_comment(p_id uuid) to service_role;
grant execute on function public.delete_community_tree_comment(p_id uuid) to authenticated;

CREATE OR REPLACE FUNCTION public.encaminhar_caso_do_orgao(p_report_id uuid, p_canal uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_caso public.orgao_casos%rowtype;
  v_origem public.orgao_canais%rowtype;
  v_destino public.orgao_canais%rowtype;
begin
  select * into v_caso
  from public.orgao_casos
  where report_id = p_report_id
  for update;
  if not found then raise exception 'Demanda nao encontrada no painel municipal'; end if;

  select * into v_origem from public.orgao_canais where id = v_caso.canal_id;
  select * into v_destino from public.orgao_canais where id = p_canal;
  if not found or not v_destino.ativo or v_destino.canal_triagem then
    raise exception 'Selecione uma secretaria ativa';
  end if;
  if v_destino.city_id is distinct from v_origem.city_id then
    raise exception 'A secretaria precisa pertencer a mesma cidade da demanda';
  end if;
  if not public.pode_administrar_prefeitura(auth.uid(), v_destino.city_id) then
    raise exception 'Somente o administrador municipal pode encaminhar demandas';
  end if;

  if v_caso.canal_id = p_canal then
    return jsonb_build_object('ok', true, 'report_id', p_report_id, 'canal_id', p_canal);
  end if;

  update public.orgao_casos
  set canal_id = p_canal,
      atribuido_a = null,
      status = case when status in ('encerrada', 'recusada') then status else 'triagem' end,
      recebido_em = case
        when status not in ('encerrada', 'recusada') then coalesce(recebido_em, now())
        else recebido_em
      end,
      updated_at = now()
  where report_id = p_report_id;

  insert into public.orgao_caso_eventos (
    report_id, canal_id, tipo, de_status, para_status, detalhes, criado_por
  ) values (
    p_report_id, p_canal, 'encaminhada', v_caso.status,
    case when v_caso.status in ('encerrada', 'recusada') then v_caso.status else 'triagem' end,
    jsonb_build_object(
      'origem', 'distribuicao_manual',
      'canal_anterior', v_caso.canal_id,
      'canal_destino', p_canal
    ),
    auth.uid()
  );

  insert into public.notifications (user_id, type, title, message, link, report_id, is_read, created_at)
  select m.user_id, 'agency_case', 'Demanda encaminhada para sua secretaria',
         coalesce(r.title, 'Uma demanda municipal foi encaminhada para atendimento.'),
         '/prefeitura/broncas/' || p_report_id::text, p_report_id, false, now()
  from public.orgao_membros m
  join public.reports r on r.id = p_report_id
  where m.canal_id = p_canal and m.ativo;

  if v_caso.status not in ('encerrada', 'recusada') then
    update public.reports
    set status = 'in-progress'
    where id = p_report_id and status = 'pending';
  end if;

  return jsonb_build_object('ok', true, 'report_id', p_report_id, 'canal_id', p_canal);
end;
$function$;
revoke all on function public.encaminhar_caso_do_orgao(p_report_id uuid, p_canal uuid) from public,anon,authenticated,service_role;
grant execute on function public.encaminhar_caso_do_orgao(p_report_id uuid, p_canal uuid) to service_role;
grant execute on function public.encaminhar_caso_do_orgao(p_report_id uuid, p_canal uuid) to authenticated;

CREATE OR REPLACE FUNCTION public.encerrar_atendimento_administrativo(p_prefeitura uuid, p_report uuid, p_motivo text, p_resposta text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
end $function$;
revoke all on function public.encerrar_atendimento_administrativo(p_prefeitura uuid, p_report uuid, p_motivo text, p_resposta text) from public,anon,authenticated,service_role;
grant execute on function public.encerrar_atendimento_administrativo(p_prefeitura uuid, p_report uuid, p_motivo text, p_resposta text) to service_role;
grant execute on function public.encerrar_atendimento_administrativo(p_prefeitura uuid, p_report uuid, p_motivo text, p_resposta text) to authenticated;

CREATE OR REPLACE FUNCTION public.get_public_profile_follow_state(p_profile_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select case
    when exists (
      select 1 from public.profiles p
      where p.id = p_profile_id
        and p.public_profile_enabled = true
        and p.username_normalized is not null
    ) then jsonb_build_object(
      'followers_count', (
        select count(*) from public.profile_follows f where f.followed_id = p_profile_id
      ),
      'following_count', (
        select count(*) from public.profile_follows f where f.follower_id = p_profile_id
      ),
      'is_following', case
        when auth.uid() is null then false
        else exists (
          select 1 from public.profile_follows f
          where f.follower_id = auth.uid() and f.followed_id = p_profile_id
        )
      end
    )
    else jsonb_build_object(
      'followers_count', 0,
      'following_count', 0,
      'is_following', false
    )
  end;
$function$;
revoke all on function public.get_public_profile_follow_state(p_profile_id uuid) from public,anon,authenticated,service_role;
grant execute on function public.get_public_profile_follow_state(p_profile_id uuid) to anon;
grant execute on function public.get_public_profile_follow_state(p_profile_id uuid) to service_role;
grant execute on function public.get_public_profile_follow_state(p_profile_id uuid) to authenticated;

CREATE OR REPLACE FUNCTION public.link_duplicate_report(p_source_report_id uuid, p_target_report_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_source public.reports%rowtype;
  v_target public.reports%rowtype;
  v_global_manager boolean;
  v_city_manager boolean;
begin
  if auth.uid() is null then raise exception 'Faça login para vincular broncas'; end if;
  if p_source_report_id = p_target_report_id then raise exception 'A bronca não pode ser vinculada a ela mesma'; end if;

  select * into v_source from public.reports where id = p_source_report_id;
  select * into v_target from public.reports where id = p_target_report_id;
  if v_source.id is null or v_target.id is null then raise exception 'Bronca não encontrada'; end if;
  if v_source.city_id is distinct from v_target.city_id then raise exception 'As broncas precisam pertencer à mesma cidade'; end if;
  if v_target.status in ('duplicate', 'resolved', 'rejected') then raise exception 'Escolha uma bronca principal ativa'; end if;
  if v_target.moderation_status is distinct from 'approved' then raise exception 'A bronca principal ainda não foi aprovada'; end if;

  select coalesce(p.is_admin or p.is_master, false)
    into v_global_manager
    from public.profiles p where p.id = auth.uid();
  v_city_manager := public.is_ambassador_of(auth.uid(), v_source.city_id)
    and public.can_write(auth.uid(), 'moderation');
  if not coalesce(v_global_manager, false) and not coalesce(v_city_manager, false) then
    raise exception 'Você não tem permissão para vincular broncas nesta cidade';
  end if;

  update public.reports
  set status = 'duplicate', linked_to = p_target_report_id, updated_at = now()
  where id = p_source_report_id;
  return found;
end;
$function$;
revoke all on function public.link_duplicate_report(p_source_report_id uuid, p_target_report_id uuid) from public,anon,authenticated,service_role;
grant execute on function public.link_duplicate_report(p_source_report_id uuid, p_target_report_id uuid) to anon;
grant execute on function public.link_duplicate_report(p_source_report_id uuid, p_target_report_id uuid) to service_role;
grant execute on function public.link_duplicate_report(p_source_report_id uuid, p_target_report_id uuid) to authenticated;

CREATE OR REPLACE FUNCTION public.list_community_tree_comments(p_tree uuid, p_limit integer DEFAULT 20, p_offset integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select coalesce(jsonb_agg(q.entry order by q.created_at desc,q.id),'[]'::jsonb) from (
    select c.id,c.created_at,jsonb_build_object('id',c.id,'body',c.body,'created_at',c.created_at,
      'author_name',coalesce(nullif(btrim(p.name),''),'Cidadão'),
      'is_author',coalesce(c.author_id=auth.uid(),false),
      'can_delete',coalesce(c.author_id=auth.uid() or t.author_id=auth.uid() or public.can_manage_tree_adoption(t.city_id),false)) as entry
    from public.community_tree_comments c join public.community_trees t on t.id=c.tree_id
    join public.profiles p on p.id=c.author_id
    where c.tree_id=p_tree and t.status='approved' and t.public_profile
    order by c.created_at desc,c.id limit greatest(1,least(coalesce(p_limit,20),50)) offset greatest(0,coalesce(p_offset,0))
  ) q
$function$;
revoke all on function public.list_community_tree_comments(p_tree uuid, p_limit integer, p_offset integer) from public,anon,authenticated,service_role;
grant execute on function public.list_community_tree_comments(p_tree uuid, p_limit integer, p_offset integer) to anon;
grant execute on function public.list_community_tree_comments(p_tree uuid, p_limit integer, p_offset integer) to service_role;
grant execute on function public.list_community_tree_comments(p_tree uuid, p_limit integer, p_offset integer) to authenticated;

CREATE OR REPLACE FUNCTION public.listar_painel_eletricista(p_prefeitura uuid, p_aba text DEFAULT 'minhas'::text, p_etapa text DEFAULT 'fazer'::text, p_busca text DEFAULT ''::text, p_ordem text DEFAULT 'priority'::text, p_pagina integer DEFAULT 1, p_tamanho integer DEFAULT 20, p_adiadas text[] DEFAULT '{}'::text[])
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
      where m.user_id=auth.uid() and m.ativo and public.municipal_channel_action(m.user_id,m.canal_id,'execute')
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
        and r.status in ('pending','in-progress')
        and ((r.is_public and coalesce(r.moderation_status,'approved')='approved')
          or (not r.is_public and r.created_by_municipality=p_prefeitura and r.moderation_status='internal'))
        and not coalesce(r.is_petition,false)
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
end $function$;
revoke all on function public.listar_painel_eletricista(p_prefeitura uuid, p_aba text, p_etapa text, p_busca text, p_ordem text, p_pagina integer, p_tamanho integer, p_adiadas text[]) from public,anon,authenticated,service_role;
grant execute on function public.listar_painel_eletricista(p_prefeitura uuid, p_aba text, p_etapa text, p_busca text, p_ordem text, p_pagina integer, p_tamanho integer, p_adiadas text[]) to service_role;
grant execute on function public.listar_painel_eletricista(p_prefeitura uuid, p_aba text, p_etapa text, p_busca text, p_ordem text, p_pagina integer, p_tamanho integer, p_adiadas text[]) to authenticated;

CREATE OR REPLACE FUNCTION public.merge_councilor_profiles(p_source_id uuid, p_target_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_source public.councilors%rowtype;
  v_target public.councilors%rowtype;
  v_street record;
  v_document jsonb;
  v_author jsonb;
  v_authors jsonb;
  v_new_authors jsonb;
  v_new_documents jsonb;
  v_name text;
  v_name_key text;
  v_document_changed boolean;
  v_street_changed boolean;
  v_updated integer := 0;
  v_allowed boolean;
begin
  if auth.uid() is null then raise exception 'Faça login para unificar vereadores'; end if;
  if p_source_id = p_target_id then raise exception 'Escolha dois vereadores diferentes'; end if;

  select * into v_source from public.councilors where id = p_source_id for update;
  select * into v_target from public.councilors where id = p_target_id for update;
  if v_source.id is null or v_target.id is null then raise exception 'Vereador não encontrado'; end if;
  if v_source.city_id <> v_target.city_id then raise exception 'Os vereadores precisam pertencer à mesma cidade'; end if;

  v_allowed := coalesce((
    select p.is_admin or p.is_master from public.profiles p where p.id = auth.uid()
  ), false) or (
    public.is_ambassador_of(auth.uid(), v_source.city_id)
    and public.can_write(auth.uid(), 'pavement')
  );
  if not v_allowed then raise exception 'Você não tem permissão para unificar vereadores nesta cidade'; end if;

  update public.councilors
  set photo_url = coalesce(nullif(photo_url, ''), nullif(v_source.photo_url, '')),
      party = coalesce(nullif(party, ''), nullif(v_source.party, '')),
      biography = coalesce(nullif(biography, ''), nullif(v_source.biography, '')),
      phone = coalesce(nullif(phone, ''), nullif(v_source.phone, '')),
      email = coalesce(nullif(email, ''), nullif(v_source.email, '')),
      instagram_url = coalesce(nullif(instagram_url, ''), nullif(v_source.instagram_url, '')),
      user_id = coalesce(user_id, v_source.user_id),
      updated_at = now()
  where id = v_target.id;

  for v_street in
    select id, historical_documents
    from public.pavement_streets
    where city_id = v_source.city_id
    for update
  loop
    v_new_documents := '[]'::jsonb;
    v_street_changed := false;

    for v_document in
      select value from jsonb_array_elements(coalesce(v_street.historical_documents, '[]'::jsonb))
    loop
      v_document_changed := false;
      if v_document->>'kind' = 'projeto_lei' then
        v_authors := case
          when jsonb_typeof(v_document->'councilor_authors') = 'array'
            and jsonb_array_length(v_document->'councilor_authors') > 0
            then v_document->'councilor_authors'
          else jsonb_build_array(v_document->>'councilor_author')
        end;
        v_new_authors := '[]'::jsonb;

        for v_author in select value from jsonb_array_elements(v_authors) loop
          v_name := btrim(coalesce(v_author #>> '{}', ''));
          if public.normalized_councilor_name(v_name) = v_source.normalized_name then
            v_name := v_target.name;
            v_document_changed := true;
          end if;
          v_name_key := public.normalized_councilor_name(v_name);
          if v_name_key is not null and not exists (
            select 1
            from jsonb_array_elements_text(v_new_authors) existing(name)
            where public.normalized_councilor_name(existing.name) = v_name_key
          ) then
            v_new_authors := v_new_authors || jsonb_build_array(v_name);
          end if;
        end loop;

        if v_document_changed then
          v_document := jsonb_set(v_document - 'councilor_author', '{councilor_authors}', v_new_authors, true);
          v_street_changed := true;
        end if;
      end if;
      v_new_documents := v_new_documents || jsonb_build_array(v_document);
    end loop;

    if v_street_changed then
      update public.pavement_streets
      set historical_documents = v_new_documents
      where id = v_street.id;
      v_updated := v_updated + 1;
    end if;
  end loop;

  delete from public.councilors where id = v_source.id;
  return v_updated;
end;
$function$;
revoke all on function public.merge_councilor_profiles(p_source_id uuid, p_target_id uuid) from public,anon,authenticated,service_role;
grant execute on function public.merge_councilor_profiles(p_source_id uuid, p_target_id uuid) to anon;
grant execute on function public.merge_councilor_profiles(p_source_id uuid, p_target_id uuid) to service_role;
grant execute on function public.merge_councilor_profiles(p_source_id uuid, p_target_id uuid) to authenticated;

CREATE OR REPLACE FUNCTION public.opcoes_tecnicas_postes_municipais(p_city_id bigint)
 RETURNS TABLE(field text, value text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if not public.pode_acessar_prefeitura(auth.uid(), p_city_id) then
    raise exception 'Sem acesso à prefeitura';
  end if;

  return query
  with options as (
    select v.field, btrim(v.value) as value, count(*) as usage_count
    from public.poles p
    cross join lateral (values
      ('point_type'::text, coalesce(nullif(btrim(p.raw_properties->'municipal'->>'point_type'), ''), p.raw_properties->'kmz'->>'point_type')),
      ('network_type'::text, coalesce(nullif(btrim(p.raw_properties->'municipal'->>'network_type'), ''), p.raw_properties->'kmz'->>'network_type')),
      ('transformer_code'::text, coalesce(nullif(btrim(p.raw_properties->'municipal'->>'transformer_code'), ''), p.raw_properties->'kmz'->>'transformer_code')),
      ('switch_code'::text, coalesce(nullif(btrim(p.raw_properties->'municipal'->>'switch_code'), ''), p.raw_properties->'kmz'->>'switch_code'))
    ) as v(field, value)
    where p.city_id = p_city_id
      and nullif(btrim(v.value), '') is not null
      and (v.field not in ('transformer_code', 'switch_code')
        or btrim(v.value) ~ '^[[:alnum:]][[:alnum:]./_-]{0,39}$')
    group by v.field, btrim(v.value)
  ), ranked as (
    select options.field, options.value,
      row_number() over (partition by options.field order by options.usage_count desc, options.value) as position
    from options
  )
  select ranked.field, ranked.value
  from ranked
  where ranked.position <= 200
  order by ranked.field, ranked.value;
end $function$;
revoke all on function public.opcoes_tecnicas_postes_municipais(p_city_id bigint) from public,anon,authenticated,service_role;
grant execute on function public.opcoes_tecnicas_postes_municipais(p_city_id bigint) to service_role;
grant execute on function public.opcoes_tecnicas_postes_municipais(p_city_id bigint) to authenticated;

CREATE OR REPLACE FUNCTION public.salvar_demanda_municipal(p_prefeitura uuid, p_id uuid, p_dados jsonb, p_versao integer DEFAULT NULL::integer, p_reports uuid[] DEFAULT '{}'::uuid[], p_resposta_publica text DEFAULT NULL::text, p_nota_interna text DEFAULT NULL::text, p_motivo text DEFAULT NULL::text, p_anexos jsonb DEFAULT '[]'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  d public.demandas_municipais%rowtype; anterior public.demandas_municipais%rowtype;
  regra public.prefeitura_servico_regras%rowtype; v_city bigint; v_report uuid; v_canal uuid; v_orgao text;
  v_nova boolean; v_execucao boolean; v_reabrindo boolean; v_link_novo boolean; v_evento bigint; v_file jsonb; v_path text;
  v_status_poste text;
  v_resposta text=nullif(btrim(coalesce(p_resposta_publica,'')),''); v_nota text=nullif(btrim(coalesce(p_nota_interna,'')),'');
  v_motivo text=nullif(btrim(coalesce(p_motivo,'')),''); v_dados jsonb; v_count integer;
begin if p_dados->>'status'='rascunho' and (p_resposta_publica is not null or exists(select 1 from jsonb_array_elements(coalesce(p_anexos,'[]'::jsonb)) j where j->>'visibilidade'='publica')) then raise exception 'Rascunho não publica comunicação ou anexos.'; end if;
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
  where key=any(array['execution_specialty','asset_tree_id','asset_street_id','titulo','descricao','bairro','category_id','issue_type','service_type','service_types','prioridade','status','canal_id','atribuido_a',
    'prazo_em','primeira_resposta_prazo_em','previsto_em','proxima_acao','proxima_acao_em','motivo_pendencia',
    'resultado','registro_execucao','executada_em','endereco','latitude','longitude','pole_id','origem','protocolo_externo']);
  d=jsonb_populate_record(d,v_dados); if d.execution_specialty is null then select min(s) into d.execution_specialty from public.orgao_canais c cross join lateral unnest(c.execution_specialties) s where c.id=d.canal_id and d.category_id=any(public.department_execution_categories(c.id,s)) having count(*)=1; end if; d.updated_by=auth.uid();
  if not public.pode_administrar_prefeitura(auth.uid(),v_city) then
    if d.canal_id is null or not (
      coalesce(public.papel_no_orgao(auth.uid(),d.canal_id) in ('gestor','operador'),false)
      or (not v_nova and d.category_id='iluminacao' and anterior.atribuido_a=auth.uid()
        and public.eletricista_ativo_municipio(auth.uid(),v_city))
    ) then raise exception 'Selecione uma secretaria que você pode operar'; end if;
  end if;
  if not v_nova and not public.pode_administrar_prefeitura(auth.uid(),v_city)
    and (d.category_id='iluminacao' and public.eletricista_ativo_municipio(auth.uid(),v_city)) then
    if anterior.atribuido_a is distinct from auth.uid() then raise exception 'Ordem não atribuída a você'; end if;
    if (to_jsonb(d)-array['status','service_type','resultado','registro_execucao','executada_em','updated_by'])
       is distinct from (to_jsonb(anterior)-array['status','service_type','resultado','registro_execucao','executada_em','updated_by']) then
      raise exception 'Eletricista só pode registrar a execução da ordem';
    end if;
    if d.status not in ('em_andamento','aguardando_confirmacao','concluida') then
      raise exception 'Situação indisponível para o eletricista';
    end if;
    if v_resposta is not null or v_nota is not null or v_motivo is not null then
      raise exception 'Eletricista não pode publicar respostas ou alterar o encaminhamento';
    end if;
  end if;
  if d.atribuido_a is not null and coalesce(d.execution_specialty,'eletricista')='eletricista' and d.category_id is distinct from 'iluminacao'
    and exists(select 1 from public.orgao_membros m where m.user_id=d.atribuido_a
      and m.canal_id=d.canal_id and m.ativo and public.municipal_channel_action(m.user_id,m.canal_id,'execute')) then
    raise exception 'Eletricista só pode receber ordens de iluminação pública';
  end if;
  if not v_nova and anterior.canal_id is distinct from d.canal_id and length(coalesce(v_motivo,''))<5 then raise exception 'Explique o motivo do encaminhamento'; end if;
  if d.titulo is null or length(btrim(d.titulo)) not between 3 and 180 then raise exception 'Informe um título de 3 a 180 caracteres'; end if;
  if length(coalesce(d.descricao,''))>10000 or length(coalesce(v_resposta,''))>4000 or length(coalesce(v_nota,''))>4000 then raise exception 'O texto excede o limite permitido'; end if;
  select * into regra from public.prefeitura_servico_regras where prefeitura_id=p_prefeitura and category_id=d.category_id;
  if v_nova and d.status<>'rascunho' then
    if d.prazo_em is null and regra.atendimento_horas is not null then d.prazo_em=now()+make_interval(hours=>regra.atendimento_horas); end if;
    if d.primeira_resposta_prazo_em is null and regra.primeira_resposta_horas is not null then d.primeira_resposta_prazo_em=now()+make_interval(hours=>regra.primeira_resposta_horas); end if;
  end if;
  if p_reports is null then p_reports='{}'; end if;
  -- Este comando só adiciona vínculos. Não remove relatos ou história ao salvar o formulário.
  p_reports=array(select distinct r from unnest(p_reports||array(select report_id from public.demanda_broncas where demanda_id=d.id)) r where r is not null);
  if not v_nova and (d.category_id='iluminacao' and public.eletricista_ativo_municipio(auth.uid(),v_city))
    and not public.pode_administrar_prefeitura(auth.uid(),v_city)
    and exists(select 1 from unnest(p_reports) r where not exists
      (select 1 from public.demanda_broncas b where b.demanda_id=d.id and b.report_id=r)) then
    raise exception 'Eletricista não pode vincular broncas à ordem';
  end if;
  if exists(select 1 from unnest(p_reports) r where not exists(select 1 from public.reports q where q.id=r and q.city_id=v_city
    and ((coalesce(q.moderation_status,'approved')='approved' or (not q.is_public and q.moderation_status='internal' and q.created_by_municipality=p_prefeitura)) and public.municipal_report_access(auth.uid(),q.id) and (d.execution_specialty is null or d.category_id=q.category_id) or
      (q.created_by_municipality=p_prefeitura and q.moderation_status='internal')) and not coalesce(q.is_petition,false) and q.status<>'duplicate')) then raise exception 'Selecione broncas publicadas desta cidade'; end if;
  if exists(select 1 from public.demanda_broncas where report_id=any(p_reports) and demanda_id<>d.id) then raise exception 'Uma das broncas já está vinculada a outro atendimento' using errcode='23505'; end if;
  if d.category_id='iluminacao' and exists(select 1 from public.reports r
    where r.id=any(p_reports) and r.category_id is distinct from 'iluminacao') then
    raise exception 'Ordens de iluminação só podem receber solicitações de iluminação'; end if;
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
    if d.canal_id is null then raise exception 'Defina a secretaria responsável pelo atendimento'; end if;
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
  if not v_nova and d.status='concluida' and anterior.status is distinct from 'concluida'
    and not public.pode_administrar_prefeitura(auth.uid(),v_city)
    and (d.category_id='iluminacao' and public.eletricista_ativo_municipio(auth.uid(),v_city)) then
    if d.service_type not in ('lamp_replacement','arm_installation','relay_replacement','other') or d.service_type is null then
      raise exception 'Selecione o serviço executado';
    end if;
    if length(btrim(coalesce(d.resultado,''))) between 1 and 9 then
      raise exception 'Se informado, o resultado do serviço deve ter pelo menos 10 caracteres';
    end if;
  end if;
  d.service_types=coalesce(d.service_types,'{}'::text[]);
  if d.service_type is not null and cardinality(d.service_types)=0 then
    d.service_types=array[d.service_type];
  end if;
  if cardinality(d.service_types)>0 and d.service_type is distinct from d.service_types[1] then
    raise exception 'Confira os serviços executados'; end if;
  v_execucao=d.status in ('aguardando_confirmacao','concluida') and (v_nova or anterior.status not in ('aguardando_confirmacao','concluida'));
  if v_execucao then
    select count(*) into v_count from public.demanda_anexos where demanda_id=d.id and created_at>=d.ciclo_iniciado_em;
    
    
    d.executada_em=coalesce(d.executada_em,now()); d.revisao_pendente=false;
  end if;
  if d.primeira_resposta_em is null and (v_resposta is not null or d.status not in ('aberta','triagem')) then d.primeira_resposta_em=now(); end if;
  if v_nova then insert into public.demandas_municipais select (d).* returning * into d;
  else
    update public.demandas_municipais set titulo=d.titulo,descricao=d.descricao,bairro=d.bairro,category_id=d.category_id,execution_specialty=d.execution_specialty,asset_tree_id=d.asset_tree_id,asset_street_id=d.asset_street_id,
      issue_type=d.issue_type,service_type=d.service_type,service_types=d.service_types,prioridade=d.prioridade,status=d.status,canal_id=d.canal_id,atribuido_a=d.atribuido_a,prazo_em=d.prazo_em,
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
      if d.status<>'rascunho' then perform public.publicar_estado_demanda(d.id,v_report,v_motivo); end if;
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
  return jsonb_build_object('id',d.id,'protocolo',d.protocolo,'versao',d.versao,'status',d.status);
end $function$;
revoke all on function public.salvar_demanda_municipal(p_prefeitura uuid, p_id uuid, p_dados jsonb, p_versao integer, p_reports uuid[], p_resposta_publica text, p_nota_interna text, p_motivo text, p_anexos jsonb) from public,anon,authenticated,service_role;
grant execute on function public.salvar_demanda_municipal(p_prefeitura uuid, p_id uuid, p_dados jsonb, p_versao integer, p_reports uuid[], p_resposta_publica text, p_nota_interna text, p_motivo text, p_anexos jsonb) to service_role;
grant execute on function public.salvar_demanda_municipal(p_prefeitura uuid, p_id uuid, p_dados jsonb, p_versao integer, p_reports uuid[], p_resposta_publica text, p_nota_interna text, p_motivo text, p_anexos jsonb) to authenticated;

CREATE OR REPLACE FUNCTION public.solicitacoes_ordem_eletricista(p_prefeitura uuid, p_ordem uuid)
 RETURNS TABLE(report_id uuid, title text, address text, neighborhood text, status text, pole_id bigint, latitude double precision, longitude double precision, atendida_em timestamp with time zone, service_types text[], resultado text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_city bigint;
begin
  select p.city_id into v_city
  from public.demandas_municipais d join public.prefeituras p on p.id=d.prefeitura_id
  where d.id=p_ordem and d.prefeitura_id=p_prefeitura and d.category_id='iluminacao'
    and d.atribuido_a=auth.uid() and p.status='ativa'
    and public.pode_operar_demanda(auth.uid(),d.id);
  if v_city is null then raise exception 'Sem acesso a esta ordem'; end if;
  return query
  select r.id,r.title::text,r.address::text,r.neighborhood::text,r.status::text,
    coalesce(r.pole_id,nearest.id,d.pole_id),
    case when r.location is not null then extensions.st_y(r.location::extensions.geometry) end,
    case when r.location is not null then extensions.st_x(r.location::extensions.geometry) end,
    b.atendida_em,b.service_types,b.resultado
  from public.demanda_broncas b
  join public.demandas_municipais d on d.id=b.demanda_id
  join public.reports r on r.id=b.report_id and r.city_id=v_city
  left join lateral (
    select p.id from public.poles p
    where r.location is not null and p.city_id=v_city and p.geom is not null
      and p.lighting_status is distinct from 'removido'
    order by p.geom operator(extensions.<->) r.location::extensions.geography, p.id limit 1
  ) nearest on true
  where b.demanda_id=p_ordem
  order by b.created_at,r.id;
end $function$;
revoke all on function public.solicitacoes_ordem_eletricista(p_prefeitura uuid, p_ordem uuid) from public,anon,authenticated,service_role;
grant execute on function public.solicitacoes_ordem_eletricista(p_prefeitura uuid, p_ordem uuid) to service_role;
grant execute on function public.solicitacoes_ordem_eletricista(p_prefeitura uuid, p_ordem uuid) to authenticated;

CREATE OR REPLACE FUNCTION public.sync_councilors_from_street()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_document jsonb;
  v_author jsonb;
  v_authors jsonb;
  v_name text;
  v_normalized text;
  v_slug text;
begin
  if new.city_id is null then return new; end if;

  for v_document in select value from jsonb_array_elements(coalesce(new.historical_documents, '[]'::jsonb)) loop
    if v_document->>'kind' <> 'projeto_lei' then continue; end if;
    v_authors := case
      when jsonb_typeof(v_document->'councilor_authors') = 'array'
        and jsonb_array_length(v_document->'councilor_authors') > 0
        then v_document->'councilor_authors'
      else jsonb_build_array(v_document->>'councilor_author')
    end;

    for v_author in select value from jsonb_array_elements(v_authors) loop
      v_name := btrim(coalesce(v_author #>> '{}', ''));
      v_normalized := public.normalized_councilor_name(v_name);
      v_slug := public.councilor_slug(v_name);
      if v_normalized is null or v_slug is null then continue; end if;

      insert into public.councilors (city_id, name, normalized_name, slug)
      values (new.city_id, v_name, v_normalized, v_slug)
      on conflict (city_id, normalized_name) do update
        set name = excluded.name, updated_at = now();
    end loop;
  end loop;
  return new;
end;
$function$;
revoke all on function public.sync_councilors_from_street() from public,anon,authenticated,service_role;
grant execute on function public.sync_councilors_from_street() to anon;
grant execute on function public.sync_councilors_from_street() to service_role;
grant execute on function public.sync_councilors_from_street() to authenticated;

-- Recalcula o filtro paginado sobre a fun??o base reconciliada.
-- Mantém a RPC anterior para clientes já publicados. A consulta filtrada
-- deriva da definição instalada, preservando acesso, ofertas internas e busca.
do $migration$
declare
  definition text;
  old_args text := $old$p_adiadas text[] DEFAULT '{}'::text[])$old$;
  old_where text := $old$where (p_aba='disponiveis' or o.etapa=p_etapa)$old$;
begin
  definition=replace(pg_get_functiondef('public.listar_painel_eletricista(uuid,text,text,text,text,integer,integer,text[])'::regprocedure),E'\r\n',E'\n');
  if position(old_args in definition)=0 or position(old_where in definition)=0 then
    raise exception 'Consulta do painel do eletricista incompatível.'; end if;
  definition=replace(definition,'FUNCTION public.listar_painel_eletricista(', 'FUNCTION public.listar_painel_eletricista_por_servico(');
  definition=replace(definition,old_args,$new$p_adiadas text[] DEFAULT '{}'::text[], p_tipo_servico text DEFAULT '')$new$);
  definition=replace(definition,old_where,$new$where (p_aba='disponiveis' or o.etapa=p_etapa)
        and (coalesce(p_tipo_servico,'')=''
          or (p_tipo_servico like 'problema:%' and (
            o.issue_type=substring(p_tipo_servico from 10)
            or (o.tipo='ordem' and exists(select 1 from public.demanda_broncas b
              join public.reports r on r.id=b.report_id
              where b.demanda_id=o.id and r.city_id=v_city and r.category_id='iluminacao'
                and r.issue_type=substring(p_tipo_servico from 10)))))
          or (p_tipo_servico like 'servico:%' and o.tipo='ordem' and exists(
            select 1 from public.demandas_municipais d where d.id=o.id and d.prefeitura_id=p_prefeitura
              and (d.service_type=substring(p_tipo_servico from 9)
                or substring(p_tipo_servico from 9)=any(d.service_types)))))$new$);
  execute definition;
end $migration$;
revoke all on function public.listar_painel_eletricista_por_servico(uuid,text,text,text,text,integer,integer,text[],text) from public,anon;
grant execute on function public.listar_painel_eletricista_por_servico(uuid,text,text,text,text,integer,integer,text[],text) to authenticated;

notify pgrst,'reload schema';

drop policy if exists "councilors_managers_insert" on "public"."councilors";
create policy "councilors_managers_insert" on "public"."councilors" as PERMISSIVE for INSERT to "authenticated" with check ((COALESCE(( SELECT (p.is_admin OR p.is_master)
   FROM profiles p
  WHERE (p.id = auth.uid())), false) OR (is_ambassador_of(auth.uid(), city_id) AND can_write(auth.uid(), 'pavement'::text))));

drop policy if exists "councilors_managers_update" on "public"."councilors";
create policy "councilors_managers_update" on "public"."councilors" as PERMISSIVE for UPDATE to "authenticated" using ((COALESCE(( SELECT (p.is_admin OR p.is_master)
   FROM profiles p
  WHERE (p.id = auth.uid())), false) OR (is_ambassador_of(auth.uid(), city_id) AND can_write(auth.uid(), 'pavement'::text)))) with check ((COALESCE(( SELECT (p.is_admin OR p.is_master)
   FROM profiles p
  WHERE (p.id = auth.uid())), false) OR (is_ambassador_of(auth.uid(), city_id) AND can_write(auth.uid(), 'pavement'::text))));

drop policy if exists "Admin delete access for promo-images" on "storage"."objects";
create policy "Admin delete access for promo-images" on "storage"."objects" as PERMISSIVE for DELETE to "public" using (((bucket_id = 'promo-images'::text) AND (auth.role() = 'authenticated'::text) AND (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.is_admin = true))))));

drop policy if exists "Admin update access for promo-images" on "storage"."objects";
create policy "Admin update access for promo-images" on "storage"."objects" as PERMISSIVE for UPDATE to "public" using (((bucket_id = 'promo-images'::text) AND (auth.role() = 'authenticated'::text) AND (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.is_admin = true))))));

drop policy if exists "Admin upload access for promo-images" on "storage"."objects";
create policy "Admin upload access for promo-images" on "storage"."objects" as PERMISSIVE for INSERT to "public" with check (((bucket_id = 'promo-images'::text) AND (auth.role() = 'authenticated'::text) AND (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.is_admin = true))))));

drop policy if exists "Admins can manage pavement media" on "storage"."objects";
create policy "Admins can manage pavement media" on "storage"."objects" as PERMISSIVE for ALL to "public" using (((bucket_id = 'pavement-media'::text) AND is_admin(auth.uid())));

drop policy if exists "Admins can manage site media" on "storage"."objects";
create policy "Admins can manage site media" on "storage"."objects" as PERMISSIVE for ALL to "public" using (((bucket_id = 'site-media'::text) AND is_admin(auth.uid())));

drop policy if exists "Admins can manage work media" on "storage"."objects";
create policy "Admins can manage work media" on "storage"."objects" as PERMISSIVE for ALL to "public" using (is_admin(auth.uid())) with check ((bucket_id = 'work-media'::text));

drop policy if exists "municipal_files_cleanup" on "storage"."objects";
create policy "municipal_files_cleanup" on "storage"."objects" as PERMISSIVE for DELETE to "authenticated" using (((bucket_id = 'municipal-demand-files'::text) AND (split_part(name, '/'::text, 2) = (auth.uid())::text) AND (NOT arquivo_demanda_referenciado(name))));

drop policy if exists "municipal_files_staging" on "storage"."objects";
create policy "municipal_files_staging" on "storage"."objects" as PERMISSIVE for SELECT to "authenticated" using (((bucket_id = 'municipal-demand-files'::text) AND (split_part(name, '/'::text, 2) = (auth.uid())::text) AND (NOT arquivo_demanda_referenciado(name))));

drop policy if exists "Authenticated Delete" on storage.objects;
drop policy if exists "Authenticated Insert" on storage.objects;
drop policy if exists "Authenticated Update" on storage.objects;
drop policy if exists "Public Access" on storage.objects;

-- A prote??o antiga de administrador n?o faz parte do fluxo atual de funcion?rios.
drop trigger if exists a_proteger_administrador_do_orgao on public.orgao_membros;

do $$ begin
  if not exists(select 1 from pg_constraint where conrelid='public.reports'::regclass and conname='reports_internal_municipal_state_check') then
    alter table public.reports add constraint reports_internal_municipal_state_check CHECK ((is_public OR ((created_by_municipality IS NOT NULL) AND (moderation_status = 'internal'::text))));
  end if;
end $$;

notify pgrst,'reload schema';
commit;

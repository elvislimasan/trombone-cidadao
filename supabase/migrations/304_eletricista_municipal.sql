begin;
alter table public.orgao_membros drop constraint if exists orgao_membros_papel_valido;
alter table public.orgao_membros add constraint orgao_membros_papel_valido check (papel in ('gestor','operador','eletricista','leitura'));
alter table public.prefeitura_convites drop constraint if exists prefeitura_convites_orgao_papel_valido;
alter table public.prefeitura_convites add constraint prefeitura_convites_orgao_papel_valido check (papel_orgao is null or papel_orgao in ('gestor','operador','eletricista','leitura'));
drop policy if exists municipal_files_insert on storage.objects;
create policy municipal_files_insert on storage.objects for insert to authenticated with check (
  bucket_id='municipal-demand-files' and split_part(name,'/',2)=auth.uid()::text and exists(
    select 1 from public.prefeituras p where p.id::text=split_part(name,'/',1) and public.pode_acessar_prefeitura(auth.uid(),p.city_id)
      and (public.pode_administrar_prefeitura(auth.uid(),p.city_id) or exists(
        select 1 from public.orgao_membros m join public.orgao_canais c on c.id=m.canal_id
        where m.user_id=auth.uid() and m.ativo and m.papel in ('gestor','operador','eletricista') and c.city_id=p.city_id))));
create or replace function public.adicionar_funcionario_prefeitura(
  p_canal uuid,
  p_user uuid,
  p_papel text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_city_id bigint;
  v_prefeitura uuid;
begin
  select city_id into v_city_id from public.orgao_canais where id = p_canal;
  if v_city_id is null then raise exception 'Secretaria nao encontrada'; end if;
  if not public.pode_administrar_prefeitura(auth.uid(), v_city_id) then
    raise exception 'Somente o administrador da prefeitura pode cadastrar funcionarios';
  end if;
  if p_papel not in ('gestor', 'operador', 'eletricista', 'leitura') then raise exception 'Papel invalido'; end if;

  select id into v_prefeitura from public.prefeituras
  where city_id = v_city_id and status = 'ativa';

  insert into public.prefeitura_membros (prefeitura_id, user_id, papel, ativo, convidado_por)
  values (v_prefeitura, p_user, 'colaborador', true, auth.uid())
  on conflict (prefeitura_id, user_id) do update set ativo = true, updated_at = now();

  insert into public.orgao_membros (canal_id, user_id, papel, ativo, convidado_por)
  values (p_canal, p_user, p_papel, true, auth.uid())
  on conflict (canal_id, user_id) do update
    set papel = excluded.papel, ativo = true, updated_at = now();

  return jsonb_build_object('ok', true);
end;
$$;
create or replace function public.criar_convite_funcionario_prefeitura(
  p_canal uuid,
  p_email text,
  p_papel text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_city_id bigint;
  v_prefeitura uuid;
  v_token uuid := gen_random_uuid();
begin
  select city_id into v_city_id from public.orgao_canais where id = p_canal;
  if v_city_id is null then raise exception 'Secretaria nao encontrada'; end if;
  if not public.pode_administrar_prefeitura(auth.uid(), v_city_id) then
    raise exception 'Somente o administrador da prefeitura pode convidar funcionarios';
  end if;
  if p_papel not in ('gestor', 'operador', 'eletricista', 'leitura') then raise exception 'Papel invalido'; end if;
  if btrim(coalesce(p_email, '')) !~* '^[^@[:space:]]+@[^@[:space:]]+\.[a-z]{2,}$' then
    raise exception 'Informe um e-mail valido';
  end if;

  select id into v_prefeitura from public.prefeituras
  where city_id = v_city_id and status = 'ativa';

  update public.prefeitura_convites
  set status = 'revogado'
  where prefeitura_id = v_prefeitura and canal_id = p_canal
    and lower(email_convidado) = lower(btrim(p_email)) and status = 'pendente';

  insert into public.prefeitura_convites (
    prefeitura_id, canal_id, email_convidado, papel_prefeitura,
    papel_orgao, token, convidado_por
  ) values (
    v_prefeitura, p_canal, lower(btrim(p_email)), 'colaborador',
    p_papel, v_token, auth.uid()
  );

  return jsonb_build_object('ok', true, 'token', v_token, 'expires_at', now() + interval '7 days');
end;
$$;
create or replace function public.pode_ver_demanda(p_user uuid,p_demanda uuid)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select exists(select 1 from public.demandas_municipais d join public.prefeituras p on p.id=d.prefeitura_id
    where d.id=p_demanda and public.pode_acessar_prefeitura(p_user,p.city_id)
      and (public.pode_administrar_prefeitura(p_user,p.city_id) or (public.papel_no_orgao(p_user,d.canal_id) in ('gestor','operador','leitura') or (public.papel_no_orgao(p_user,d.canal_id)='eletricista' and d.atribuido_a=p_user))))
$$;
create or replace function public.pode_operar_demanda(p_user uuid,p_demanda uuid)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select exists(select 1 from public.demandas_municipais d join public.prefeituras p on p.id=d.prefeitura_id
    where d.id=p_demanda and public.pode_acessar_prefeitura(p_user,p.city_id)
      and (public.pode_administrar_prefeitura(p_user,p.city_id) or (public.papel_no_orgao(p_user,d.canal_id) in ('gestor','operador') or (public.papel_no_orgao(p_user,d.canal_id)='eletricista' and d.atribuido_a=p_user))))
$$;
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
  if new.atribuido_a is not null and not exists(select 1 from public.orgao_membros m where m.user_id=new.atribuido_a and m.canal_id=new.canal_id and m.ativo and m.papel in ('gestor','operador','eletricista')) then
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
  where key=any(array['titulo','descricao','bairro','category_id','issue_type','prioridade','status','canal_id','atribuido_a',
    'prazo_em','primeira_resposta_prazo_em','previsto_em','proxima_acao','proxima_acao_em','motivo_pendencia',
    'resultado','registro_execucao','executada_em','endereco','latitude','longitude','pole_id','origem','protocolo_externo']);
  d=jsonb_populate_record(d,v_dados); d.updated_by=auth.uid();
  if not public.pode_administrar_prefeitura(auth.uid(),v_city) then
    if d.canal_id is null or (public.papel_no_orgao(auth.uid(),d.canal_id) not in ('gestor','operador') and not (not v_nova and public.papel_no_orgao(auth.uid(),d.canal_id)='eletricista' and anterior.atribuido_a=auth.uid()))
      or public.papel_no_orgao(auth.uid(),d.canal_id) is null then raise exception 'Selecione uma secretaria que você pode operar'; end if;
  end if;
  if not v_nova and not public.pode_administrar_prefeitura(auth.uid(),v_city)
    and public.papel_no_orgao(auth.uid(),d.canal_id)='eletricista' then
    if anterior.atribuido_a is distinct from auth.uid() then raise exception 'Ordem não atribuída a você'; end if;
    if (to_jsonb(d)-array['status','resultado','registro_execucao','executada_em','updated_by'])
       is distinct from (to_jsonb(anterior)-array['status','resultado','registro_execucao','executada_em','updated_by']) then
      raise exception 'Eletricista só pode registrar a execução da ordem';
    end if;
    if d.status not in ('em_andamento','aguardando_confirmacao','concluida') then
      raise exception 'Situação indisponível para o eletricista';
    end if;
    if v_resposta is not null or v_nota is not null or v_motivo is not null then
      raise exception 'Eletricista não pode publicar respostas ou alterar o encaminhamento';
    end if;
  end if;
  if d.atribuido_a is not null and d.category_id is distinct from 'iluminacao'
    and exists(select 1 from public.orgao_membros m where m.user_id=d.atribuido_a
      and m.canal_id=d.canal_id and m.ativo and m.papel='eletricista') then
    raise exception 'Eletricista só pode receber ordens de iluminação pública';
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
  if not v_nova and public.papel_no_orgao(auth.uid(),d.canal_id)='eletricista'
    and not public.pode_administrar_prefeitura(auth.uid(),v_city)
    and exists(select 1 from unnest(p_reports) r where not exists
      (select 1 from public.demanda_broncas b where b.demanda_id=d.id and b.report_id=r)) then
    raise exception 'Eletricista não pode vincular broncas à ordem';
  end if;
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
      issue_type=d.issue_type,prioridade=d.prioridade,status=d.status,canal_id=d.canal_id,atribuido_a=d.atribuido_a,prazo_em=d.prazo_em,
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
  return jsonb_build_object('id',d.id,'protocolo',d.protocolo,'versao',d.versao,'status',d.status);
end $$;
revoke all on function public.salvar_demanda_municipal(uuid,uuid,jsonb,integer,uuid[],text,text,text,jsonb) from public,anon;
grant execute on function public.salvar_demanda_municipal(uuid,uuid,jsonb,integer,uuid[],text,text,text,jsonb) to authenticated;
notify pgrst,'reload schema';
commit;

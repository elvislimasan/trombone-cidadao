begin;

-- O atendimento vinculado é gravado antes de atualizar os dados técnicos da
-- ordem. Só esse comprovante, criado pela RPC na mesma transação, permite
-- atualizar poste e serviços; distribuição e programação seguem protegidas.
create or replace function public.enforce_municipal_order_responsibility() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare
  v_city bigint; v_dispatch boolean; v_execute boolean;
  v_fields text[] := array['status','resultado','registro_execucao','executada_em','concluida_em','updated_by','updated_at','versao','atribuido_a','executada_por'];
begin
  if auth.uid() is null then return new; end if;
  select city_id into v_city from public.prefeituras where id=new.prefeitura_id and status='ativa';
  v_dispatch=public.pode_administrar_prefeitura(auth.uid(),v_city) or public.municipal_channel_action(auth.uid(),new.canal_id,'dispatch');
  v_execute=new.atribuido_a=auth.uid() and ((new.category_id='iluminacao' and public.eletricista_ativo_municipio(auth.uid(),v_city))
    or public.field_executor_can_work(auth.uid(),new.canal_id,new.execution_specialty,new.category_id));
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
      if new.category_id='iluminacao' and exists(
        select 1 from public.demanda_atendimentos a
        where a.demanda_id=new.id and a.atendida_por=auth.uid()
          and a.xmin::text=pg_current_xact_id()::text
          and a.pole_id=new.pole_id and a.service_types=new.service_types
          and new.service_type=new.service_types[1]
          and cardinality(a.service_types)>0
      ) then v_fields=v_fields||array['pole_id','service_type','service_types']; end if;
      if (to_jsonb(new)-v_fields) is distinct from (to_jsonb(old)-v_fields)
        or (old.atribuido_a is not null and old.atribuido_a<>auth.uid()) then
        raise exception 'Executor só pode registrar o serviço atribuído.' using errcode='42501'; end if;
      if new.status not in ('em_andamento','aguardando_confirmacao','concluida') and not
        (old.atribuido_a is null and new.atribuido_a=auth.uid() and new.status=old.status and old.status in ('aberta','triagem','programada','em_andamento')) then
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
revoke all on function public.enforce_municipal_order_responsibility() from public,anon,authenticated;

-- Uma visita sem alteração é uma vistoria, não um reparo. Registra apenas
-- a observação, sem criar serviço concluído nem alterar a versão do poste.
do $migration$
declare
  definition text;
  old_check text := $old$  if cardinality(p_servicos)=0 and p_status is not distinct from v_pole.lighting_status
    and v_type is not distinct from v_pole.lamp_type
    and v_power is not distinct from v_pole.lamp_power_w then
    raise exception 'Altere a situação, o tipo ou a potência, ou registre um serviço'; end if;$old$;
begin
  definition=replace(pg_get_functiondef('public.registrar_visita_poste_eletricista(uuid,bigint,timestamptz,text,text,numeric,text[],text,uuid)'::regprocedure),E'\r\n',E'\n');
  if position(old_check in definition)=0 then raise exception 'Validação de visita incompatível.'; end if;
  execute replace(definition,old_check,$new$  if cardinality(p_servicos)=0 and p_status is not distinct from v_pole.lighting_status
    and v_type is not distinct from v_pole.lamp_type
    and v_power is not distinct from v_pole.lamp_power_w then
    insert into public.pole_lighting_changes(pole_id,city_id,pole_number,address,old_power_w,
      new_power_w,old_lamp_type,new_lamp_type,old_status,new_status,action,changed_by,descricao_servico)
    values(v_pole.id,v_city,coalesce(v_pole.identifier,v_pole.id::text),v_pole.address,
      v_pole.lamp_power_w,v_power,v_pole.lamp_type,v_type,v_pole.lighting_status,p_status,
      'updated',auth.uid(),coalesce(nullif(v_description,''),'Vistoria realizada. Dados do poste conferidos, sem alterações.'));
    return jsonb_build_object('id',v_pole.id,'ordem_id',null,'vistoria',true);
  end if;$new$);
end $migration$;

notify pgrst,'reload schema';
commit;

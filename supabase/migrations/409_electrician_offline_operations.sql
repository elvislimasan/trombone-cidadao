begin;

-- The receipt and the original operation commit together. A repeated request
-- returns the receipt, even if the first response was lost on a rural connection.
create table public.electrician_offline_operations (
  id uuid primary key,
  user_id uuid not null references auth.users(id),
  prefeitura_id uuid not null references public.prefeituras(id),
  rpc text not null,
  args jsonb not null,
  result jsonb not null,
  created_at timestamptz not null default now()
);
alter table public.electrician_offline_operations enable row level security;
revoke all on public.electrician_offline_operations from public, anon, authenticated;

create function public.electrician_offline_receipt(p_operation uuid) returns jsonb
language sql stable security definer set search_path=public,pg_temp as $$
  select result from public.electrician_offline_operations where id=p_operation and user_id=auth.uid()
$$;

create function public.sync_electrician_operation(p_operation uuid,p_rpc text,p_args jsonb,p_previous uuid default null)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  v_prior public.electrician_offline_operations%rowtype;
  v_existing public.electrician_offline_operations%rowtype;
  v_args jsonb:=p_args; v_result jsonb; v_city bigint; v_pole_version timestamptz;
  v_pref uuid:=(p_args->>'p_prefeitura')::uuid;
  v_order uuid:=coalesce(p_args->>'p_ordem',p_args->>'p_id')::uuid;
begin
  if auth.uid() is null or p_operation is null then raise exception 'Entre na conta do atendimento.' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_operation::text,0));
  select * into v_existing from public.electrician_offline_operations where id=p_operation;
  if found then
    if v_existing.user_id<>auth.uid() or v_existing.rpc<>p_rpc or v_existing.args<>p_args then
      raise exception 'Identificador de envio já utilizado.' using errcode='22023';
    end if;
    return v_existing.result;
  end if;
  select city_id into v_city from public.prefeituras where id=v_pref and status='ativa';
  if not coalesce(public.pode_acessar_prefeitura(auth.uid(),v_city),false) then
    raise exception 'Vínculo municipal inativo. O registro continua salvo no aparelho.' using errcode='42501';
  end if;
  if v_order is not null and not exists(select 1 from public.demandas_municipais
    where id=v_order and prefeitura_id=v_pref and atribuido_a=auth.uid() and category_id='iluminacao') then
    raise exception 'Ordem não atribuída a você.' using errcode='42501';
  end if;
  if p_previous is not null then
    select * into v_prior from public.electrician_offline_operations where id=p_previous
      and user_id=auth.uid() and prefeitura_id=v_pref;
    if not found then raise exception 'Envie primeiro o registro anterior.' using errcode='40001'; end if;
    -- Only advance versions produced by this user's previous queued operation.
    -- The original RPC still rejects any intervening change by another worker.
    if v_order is not null and v_order=coalesce(v_prior.args->>'p_ordem',v_prior.args->>'p_id')::uuid then
      v_args:=jsonb_set(v_args,'{p_versao}',v_prior.result->'order_version');
    elsif v_order is not null or v_prior.args->>'p_poste_id' is distinct from p_args->>'p_poste_id' then
      raise exception 'Registro anterior pertence a outro serviço.' using errcode='22023';
    end if;
    if p_args->>'p_poste_id' is not null and p_args->>'p_poste_id'=v_prior.args->>'p_poste_id' then
      v_args:=jsonb_set(v_args,'{p_poste_atualizado_em}',v_prior.result->'pole_version');
    end if;
  end if;
  case p_rpc
    when 'salvar_demanda_municipal' then
      if v_order is null or p_args->'p_dados' is distinct from '{"status":"em_andamento"}'::jsonb then
        raise exception 'Ação offline inválida.' using errcode='22023';
      end if;
      v_result:=public.salvar_demanda_municipal(v_pref,v_order,p_args->'p_dados',(v_args->>'p_versao')::integer);
    when 'resolver_ordem_eletricista' then
      v_result:=public.resolver_ordem_eletricista(v_pref,v_order,(v_args->>'p_versao')::integer,
        (p_args->>'p_poste_id')::bigint,(v_args->>'p_poste_atualizado_em')::timestamptz,p_args->'p_poste',coalesce(p_args->'p_anexos','[]'));
    when 'atender_solicitacao_ordem_eletricista' then
      v_result:=public.atender_solicitacao_ordem_eletricista(v_pref,v_order,(p_args->>'p_report')::uuid,(v_args->>'p_versao')::integer,
        (p_args->>'p_poste_id')::bigint,(v_args->>'p_poste_atualizado_em')::timestamptz,p_args->'p_poste',coalesce(p_args->'p_anexos','[]'));
    when 'concluir_ordem_eletricista' then
      v_result:=public.concluir_ordem_eletricista(v_pref,v_order,(v_args->>'p_versao')::integer);
    when 'registrar_visita_poste_eletricista_v2' then
      v_result:=public.registrar_visita_poste_eletricista_v2(v_pref,(p_args->>'p_poste_id')::bigint,
        (v_args->>'p_poste_atualizado_em')::timestamptz,p_args->>'p_status',p_args->>'p_lamp_type',
        (p_args->>'p_power_w')::numeric,array(select jsonb_array_elements_text(p_args->'p_servicos')),
        p_args->>'p_descricao',p_operation,(p_args->>'p_report')::uuid);
    else raise exception 'Ação offline inválida.' using errcode='22023';
  end case;
  select updated_at into v_pole_version from public.poles where id=(p_args->>'p_poste_id')::bigint;
  v_result:=jsonb_build_object('response',v_result,'pole_version',v_pole_version,
    'order_version',(select versao from public.demandas_municipais where id=v_order));
  insert into public.electrician_offline_operations(id,user_id,prefeitura_id,rpc,args,result)
    values(p_operation,auth.uid(),v_pref,p_rpc,p_args,v_result);
  return v_result;
end $$;
revoke all on function public.electrician_offline_receipt(uuid),public.sync_electrician_operation(uuid,text,jsonb,uuid) from public,anon;
grant execute on function public.electrician_offline_receipt(uuid),public.sync_electrician_operation(uuid,text,jsonb,uuid) to authenticated;
notify pgrst,'reload schema';
commit;

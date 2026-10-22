begin;
-- A visibilidade de uma resposta não torna pública uma solicitação interna.
create function public.municipal_report_visible(p_report uuid) returns boolean
language sql stable security definer set search_path=public,pg_temp as $$
  select exists(select 1 from public.reports r where r.id=p_report and
    (r.is_public or (auth.uid() is not null and (public.is_admin(auth.uid()) or public.is_master(auth.uid())
      or public.municipal_report_access(auth.uid(),r.id)))))
$$;
revoke all on function public.municipal_report_visible(uuid) from public;
grant execute on function public.municipal_report_visible(uuid) to anon,authenticated;
create policy department_response_privacy on public.orgao_respostas as restrictive for select
  using(public.municipal_report_visible(report_id));
create policy department_official_step_privacy on public.report_official_steps as restrictive for select
  using(public.municipal_report_visible(report_id));
create policy department_report_update_privacy on public.report_updates as restrictive for select
  using(public.municipal_report_visible(report_id));
create policy department_notification_privacy on public.notifications as restrictive for select to authenticated
  using(report_id is null or public.municipal_report_visible(report_id));

do $migration$
declare f record; definition text; guard text;
begin
  for f in select p.oid,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname in ('postes_iluminacao_sem_ordem','set_municipal_report_publicity','excluir_solicitacao_municipal') loop
    definition=pg_get_functiondef(f.oid);
    if f.proname='postes_iluminacao_sem_ordem' then
      guard='if not public.municipal_city_action(auth.uid(),p_city_id,''read'') then raise exception ''Sem acesso ao atendimento.'' using errcode=''42501''; end if;';
    else
      guard='if not public.municipal_report_access(auth.uid(),p_report,''receive'') then raise exception ''Sem acesso a esta solicitação.'' using errcode=''42501''; end if;';
    end if;
    execute regexp_replace(definition,'\mbegin\M','begin '||guard,'i');
  end loop;
end $migration$;

alter table public.prefeitura_servico_regras add column conferir_execucao boolean not null default false;
alter function public.salvar_configuracao_atendimento(uuid,jsonb) rename to salvar_configuracao_atendimento_before_review;
revoke all on function public.salvar_configuracao_atendimento_before_review(uuid,jsonb) from public,anon,authenticated;
create function public.salvar_configuracao_atendimento(p_prefeitura uuid,p_regras jsonb) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  perform public.salvar_configuracao_atendimento_before_review(p_prefeitura,p_regras);
  update public.prefeitura_servico_regras r set conferir_execucao=coalesce((j->>'conferir_execucao')::boolean,false)
    from jsonb_array_elements(p_regras) j where r.prefeitura_id=p_prefeitura and r.category_id=j->>'category_id';
end $$;
revoke all on function public.salvar_configuracao_atendimento(uuid,jsonb) from public,anon;
grant execute on function public.salvar_configuracao_atendimento(uuid,jsonb) to authenticated;

create function public.review_department_order() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if new.status='concluida' and old.status='aguardando_confirmacao' then
    if auth.uid() is not null and (old.atribuido_a=auth.uid() or not exists(select 1 from public.demanda_eventos e
      where e.demanda_id=old.id and e.tipo='conferida' and e.criado_por=auth.uid()
        and e.detalhes->>'transaction_id'=txid_current()::text and (e.detalhes->>'versao')::integer=old.versao)) then
      raise exception 'Use a ação de conferência com parecer de outro gestor.' using errcode='42501';
    end if;
    -- A conferência não transfere o crédito da execução para o gestor.
    new.executada_por=coalesce(old.executada_por,old.atribuido_a);
  elsif new.status='concluida' and old.status is distinct from 'concluida'
    and exists(select 1 from public.prefeitura_servico_regras r where r.prefeitura_id=new.prefeitura_id and r.category_id=new.category_id and r.conferir_execucao) then
    new.status='aguardando_confirmacao';
    new.concluida_em=null;
  end if;
  return new;
end $$;
create trigger zzzzz_review_department_order before update on public.demandas_municipais
  for each row execute function public.review_department_order();

create function public.conferir_ordem_municipal(p_prefeitura uuid,p_ordem uuid,p_versao integer,p_motivo text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare d public.demandas_municipais%rowtype; v_city bigint;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_prefeitura::text,0));
  select * into d from public.demandas_municipais where id=p_ordem and prefeitura_id=p_prefeitura for update;
  select city_id into v_city from public.prefeituras where id=p_prefeitura and status='ativa';
  if d.id is null or not (public.pode_administrar_prefeitura(auth.uid(),v_city) or public.municipal_channel_action(auth.uid(),d.canal_id,'dispatch'))
    or d.atribuido_a=auth.uid() then raise exception 'A conferência exige outro gestor autorizado.' using errcode='42501'; end if;
  if d.status='concluida' then return jsonb_build_object('id',d.id,'status',d.status,'versao',d.versao); end if;
  if p_versao is distinct from d.versao then raise exception 'A ordem mudou. Recarregue antes de conferir.' using errcode='40001'; end if;
  if d.status<>'aguardando_confirmacao' or d.executada_em is null
    or exists(select 1 from public.demanda_broncas b join public.reports r on r.id=b.report_id where b.demanda_id=d.id and r.status is distinct from 'resolved') then
    raise exception 'A execução precisa estar completa antes da conferência.'; end if;
  if length(btrim(coalesce(p_motivo,''))) not between 5 and 4000 then raise exception 'Registre o parecer da conferência.'; end if;
  insert into public.demanda_eventos(demanda_id,tipo,detalhes,criado_por)
    values(d.id,'conferida',jsonb_build_object('parecer',btrim(p_motivo),'executada_por',d.executada_por,'transaction_id',txid_current()::text,'versao',d.versao),auth.uid());
  update public.demandas_municipais set status='concluida',updated_by=auth.uid() where id=d.id returning * into d;
  return jsonb_build_object('id',d.id,'status',d.status,'versao',d.versao);
end $$;
revoke all on function public.conferir_ordem_municipal(uuid,uuid,integer,text) from public,anon;
grant execute on function public.conferir_ordem_municipal(uuid,uuid,integer,text) to authenticated;

-- Atualização de formulário antigo não pode escapar da etapa de conferência.
-- O gatilho de 373 já impede programação e execução por quem não tem o cargo.
create function public.validate_municipal_report_department() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if new.created_by_municipality is not null and auth.uid() is not null then
    if tg_op='INSERT' then
      if not public.pode_administrar_prefeitura(auth.uid(),new.city_id) and not exists(select 1 from public.orgao_categorias oc
        where oc.city_id=new.city_id and oc.category_id=new.category_id and public.municipal_channel_action(auth.uid(),oc.canal_id,'receive')) then
        raise exception 'Esta categoria não pertence ao atendimento da sua secretaria.' using errcode='42501'; end if;
    elsif new.is_public is distinct from old.is_public and not public.municipal_report_access(auth.uid(),old.id,'receive') then
      raise exception 'Sem acesso para alterar a visibilidade desta solicitação.' using errcode='42501';
    end if;
  end if;
  return new;
end $$;
create trigger zzzzz_municipal_report_department before insert or update of is_public on public.reports
  for each row execute function public.validate_municipal_report_department();
notify pgrst,'reload schema';
commit;

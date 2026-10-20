begin;

create or replace function public.atualizar_bronca_prefeitura(
  p_prefeitura uuid, p_report uuid, p_situacao text, p_mensagem text, p_canal uuid default null
) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare
  v_city bigint; v_canal uuid; v_nome text; v_etapa text;
  v_report public.reports%rowtype; v_internal boolean;
begin
  select city_id into v_city from public.prefeituras where id=p_prefeitura and status='ativa';
  if auth.uid() is null or v_city is null or not public.pode_acessar_prefeitura(auth.uid(),v_city) then
    raise exception 'Sem acesso a esta prefeitura';
  end if;
  select * into v_report from public.reports where id=p_report and city_id=v_city
    and not coalesce(is_petition,false)
    and ((is_public and coalesce(moderation_status,'approved')='approved')
      or (not is_public and created_by_municipality=p_prefeitura and moderation_status='internal'))
    for update;
  if not found then raise exception 'Solicitação indisponível nesta cidade'; end if;
  if exists(select 1 from public.demanda_broncas where report_id=p_report)
    or exists(select 1 from public.demandas_municipais where report_id=p_report) then
    raise exception 'Esta solicitação já possui ordem de serviço. Atualize a ordem vinculada.';
  end if;
  if v_report.status not in ('pending','in-progress','pending_resolution') then
    raise exception 'Esta solicitação não está aberta para atualização';
  end if;
  if p_situacao is null or p_situacao not in ('recebida','em_andamento','resolvida') then
    raise exception 'Situação inválida';
  end if;
  if length(btrim(coalesce(p_mensagem,''))) not between 5 and 4000 then
    raise exception 'Descreva a atualização em 5 a 4000 caracteres';
  end if;
  if public.pode_administrar_prefeitura(auth.uid(),v_city) then
    select id,nome into v_canal,v_nome from public.orgao_canais
    where city_id=v_city and ativo and (id=p_canal or (p_canal is null and canal_triagem))
    order by canal_triagem desc limit 1;
  else
    select c.id,c.nome into v_canal,v_nome from public.orgao_canais c
    join public.orgao_membros m on m.canal_id=c.id
    where c.city_id=v_city and c.ativo and m.user_id=auth.uid() and m.ativo
      and m.papel in ('gestor','operador') and (p_canal is null or c.id=p_canal)
    order by c.nome limit 1;
  end if;
  if v_canal is null then raise exception 'Sem permissão para atualizar esta solicitação'; end if;
  v_internal := not v_report.is_public;
  v_etapa := case p_situacao when 'recebida' then 'recebida' when 'em_andamento' then 'programada' else 'executada' end;
  insert into public.report_official_steps(report_id,etapa,orgao,observacao,registrado_por,registrado_por_papel)
  values(p_report,v_etapa,v_nome,btrim(p_mensagem),auth.uid(),'orgao');
  if p_situacao='em_andamento' then
    update public.reports set status='in-progress' where id=p_report
      and (status='pending' or (v_internal and status='pending_resolution'));
  elsif p_situacao='resolvida' then
    update public.reports set status=case when v_internal then 'resolved' else 'pending_resolution' end
    where id=p_report and status in ('pending','in-progress','pending_resolution');
  end if;
end $$;
revoke all on function public.atualizar_bronca_prefeitura(uuid,uuid,text,text,uuid) from public,anon;
grant execute on function public.atualizar_bronca_prefeitura(uuid,uuid,text,text,uuid) to authenticated;

-- The public official-history policies predate internal municipal reports.
-- Reuse the visibility check that already protects the same report's media.
drop policy if exists report_official_steps_municipal_visibility on public.report_official_steps;
create policy report_official_steps_municipal_visibility on public.report_official_steps
  as restrictive for select to anon,authenticated
  using (public.can_view_municipal_report_media(report_id));

-- Internal records must not generate public community notifications.
do $migration$
declare definition text;
begin
  definition := pg_get_functiondef('public.notificar_etapa_oficial()'::regprocedure);
  if position('where r.is_public is distinct from false' in definition)=0 then
    if position('cross join lateral public.report_participants(e.report_id) p' in definition)=0 then
      raise exception 'Definição inesperada de notificar_etapa_oficial';
    end if;
    definition := replace(definition,
      'cross join lateral public.report_participants(e.report_id) p',
      'cross join lateral public.report_participants(e.report_id) p
    where r.is_public is distinct from false');
    execute definition;
  end if;
end $migration$;

notify pgrst,'reload schema';
commit;

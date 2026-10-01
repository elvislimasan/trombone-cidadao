begin;

create or replace function public.atualizar_bronca_prefeitura(
  p_prefeitura uuid, p_report uuid, p_situacao text, p_mensagem text, p_canal uuid default null
) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare v_city bigint; v_canal uuid; v_nome text; v_etapa text;
begin
  select city_id into v_city from public.prefeituras where id=p_prefeitura and status='ativa';
  if auth.uid() is null or v_city is null or not public.pode_acessar_prefeitura(auth.uid(),v_city) then
    raise exception 'Sem acesso a esta prefeitura';
  end if;
  if not exists(select 1 from public.reports where id=p_report and city_id=v_city
    and coalesce(moderation_status,'approved')='approved' and not coalesce(is_petition,false)) then
    raise exception 'Bronca indisponível nesta cidade';
  end if;
  if exists(select 1 from public.demanda_broncas where report_id=p_report) then
    raise exception 'Esta bronca já possui ordem de serviço. Atualize a ordem vinculada.';
  end if;
  if p_situacao not in ('recebida','em_andamento','resolvida') then raise exception 'Situação inválida'; end if;
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
  if v_canal is null then raise exception 'Sem permissão para atualizar esta bronca'; end if;
  v_etapa := case p_situacao when 'recebida' then 'recebida' when 'em_andamento' then 'programada' else 'executada' end;
  insert into public.report_official_steps(report_id,etapa,orgao,observacao,registrado_por,registrado_por_papel)
  values(p_report,v_etapa,v_nome,btrim(p_mensagem),auth.uid(),'orgao');
  if p_situacao='em_andamento' then
    update public.reports set status='in-progress' where id=p_report and status='pending';
  elsif p_situacao='resolvida' then
    update public.reports set status='pending_resolution' where id=p_report and status in ('pending','in-progress');
  end if;
end $$;
revoke all on function public.atualizar_bronca_prefeitura(uuid,uuid,text,text,uuid) from public,anon;
grant execute on function public.atualizar_bronca_prefeitura(uuid,uuid,text,text,uuid) to authenticated;
notify pgrst,'reload schema';
commit;

begin;

-- A equipe pode emitir comprovantes das solicitações públicas de cidadãos que
-- aparecem no painel, além das solicitações criadas pela própria prefeitura.
create or replace function public.can_access_municipal_report_receipt(p_report_id text, p_write boolean default false)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select auth.uid() is not null and exists (
    select 1
    from public.reports r
    join public.prefeituras p on p.city_id = r.city_id and p.status = 'ativa'
    join public.prefeitura_membros m on m.prefeitura_id = p.id
      and m.user_id = auth.uid() and m.ativo
    where r.id::text = p_report_id
      and not coalesce(r.is_petition, false)
      and (r.created_by_municipality = p.id or (
        r.created_by_municipality is null
        and r.is_public
        and coalesce(r.moderation_status, 'approved') = 'approved'
      ))
      and public.pode_acessar_prefeitura(auth.uid(), r.city_id)
      and (not p_write or m.papel = 'administrador' or exists (
        select 1 from public.orgao_membros om
        join public.orgao_canais c on c.id = om.canal_id
        where om.user_id = auth.uid() and om.ativo
          and om.papel in ('gestor', 'operador') and c.city_id = r.city_id
      ))
  )
$$;
revoke all on function public.can_access_municipal_report_receipt(text, boolean) from public, anon;
grant execute on function public.can_access_municipal_report_receipt(text, boolean) to authenticated;

update storage.buckets set file_size_limit = 10485760,
  allowed_mime_types = array['image/png', 'application/pdf']
where id = 'municipal-report-receipts';
drop policy if exists municipal_report_receipts_select on storage.objects;
drop policy if exists municipal_report_receipts_insert on storage.objects;
drop policy if exists municipal_report_receipts_update on storage.objects;
create policy municipal_report_receipts_select on storage.objects for select to authenticated using (
  bucket_id = 'municipal-report-receipts'
  and name in (split_part(name, '/', 1) || '/comprovante.pdf', split_part(name, '/', 1) || '/comprovante.png')
  and public.can_access_municipal_report_receipt(split_part(name, '/', 1), false)
);
create policy municipal_report_receipts_insert on storage.objects for insert to authenticated with check (
  bucket_id = 'municipal-report-receipts'
  and name = split_part(name, '/', 1) || '/comprovante.pdf'
  and public.can_access_municipal_report_receipt(split_part(name, '/', 1), true)
);
create policy municipal_report_receipts_update on storage.objects for update to authenticated using (
  bucket_id = 'municipal-report-receipts'
  and name = split_part(name, '/', 1) || '/comprovante.pdf'
  and public.can_access_municipal_report_receipt(split_part(name, '/', 1), true)
) with check (
  bucket_id = 'municipal-report-receipts'
  and name = split_part(name, '/', 1) || '/comprovante.pdf'
  and public.can_access_municipal_report_receipt(split_part(name, '/', 1), true)
);

-- Uma solicitação de cidadão nunca é excluída pela prefeitura. A ordem
-- vinculada deve ser tratada antes de remover a solicitação municipal.
create or replace function public.excluir_solicitacao_municipal(p_prefeitura uuid, p_report uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_report public.reports%rowtype;
  v_city bigint;
  v_admin boolean;
begin
  select * into v_report from public.reports
    where id = p_report and created_by_municipality = p_prefeitura for update;
  if not found then raise exception 'Solicitação da prefeitura não encontrada'; end if;

  select city_id into v_city from public.prefeituras
    where id = p_prefeitura and status = 'ativa';
  if v_city is null or v_city is distinct from v_report.city_id or auth.uid() is null
    or not public.pode_acessar_prefeitura(auth.uid(), v_city) then
    raise exception 'Sem acesso a esta prefeitura';
  end if;
  if not exists(select 1 from public.prefeitura_membros m
    where m.prefeitura_id = p_prefeitura and m.user_id = auth.uid() and m.ativo) then
    raise exception 'Sem vínculo ativo com esta prefeitura';
  end if;

  select exists(select 1 from public.prefeitura_membros m
    where m.prefeitura_id = p_prefeitura and m.user_id = auth.uid()
      and m.ativo and m.papel = 'administrador') into v_admin;
  if not v_admin and (
    v_report.author_id is distinct from auth.uid()
    or not exists(select 1 from public.orgao_membros m
      join public.orgao_canais c on c.id = m.canal_id
      where m.user_id = auth.uid() and m.ativo
        and m.papel in ('gestor', 'operador') and c.city_id = v_city)
  ) then raise exception 'Somente o criador ou administrador pode excluir esta solicitação'; end if;

  if exists(select 1 from public.demanda_broncas b where b.report_id = p_report)
    or exists(select 1 from public.demandas_municipais d where d.report_id = p_report) then
    raise exception 'Remova a ordem de serviço vinculada antes de excluir a solicitação';
  end if;

  delete from public.reports where id = p_report;
end $$;
revoke all on function public.excluir_solicitacao_municipal(uuid, uuid) from public, anon;
grant execute on function public.excluir_solicitacao_municipal(uuid, uuid) to authenticated;

-- Ordens recém-criadas podem ser removidas diretamente; ordens em execução
-- precisam ser canceladas antes, preservando uma decisão explícita no histórico.
create or replace function public.excluir_demanda_municipal(p_prefeitura uuid, p_demanda uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_demanda public.demandas_municipais%rowtype;
  v_city bigint;
  v_admin boolean;
begin
  select * into v_demanda from public.demandas_municipais
    where id = p_demanda and prefeitura_id = p_prefeitura for update;
  if not found then raise exception 'Ordem de serviço não encontrada'; end if;

  select city_id into v_city from public.prefeituras
    where id = p_prefeitura and status = 'ativa';
  if v_city is null or auth.uid() is null
    or not public.pode_acessar_prefeitura(auth.uid(), v_city) then
    raise exception 'Sem acesso a esta prefeitura';
  end if;
  if not exists(select 1 from public.prefeitura_membros m
    where m.prefeitura_id = p_prefeitura and m.user_id = auth.uid() and m.ativo) then
    raise exception 'Sem vínculo ativo com esta prefeitura';
  end if;

  select exists(select 1 from public.prefeitura_membros m
    where m.prefeitura_id = p_prefeitura and m.user_id = auth.uid()
      and m.ativo and m.papel = 'administrador') into v_admin;
  if not v_admin and (v_demanda.criado_por is distinct from auth.uid()
    or not public.pode_operar_demanda(auth.uid(), p_demanda)) then
    raise exception 'Somente o criador ou administrador pode excluir esta ordem';
  end if;

  if v_demanda.status not in ('aberta', 'triagem', 'cancelada') then
    raise exception 'Cancele a ordem antes de excluí-la';
  end if;
  if v_demanda.status <> 'cancelada' and exists (
    select 1 from public.demanda_eventos e
    where e.demanda_id = p_demanda and e.visibilidade = 'publica'
  ) then raise exception 'Cancele a ordem antes de excluir um atendimento com resposta pública'; end if;

  delete from public.demandas_municipais where id = p_demanda;
end $$;
revoke all on function public.excluir_demanda_municipal(uuid, uuid) from public, anon;
grant execute on function public.excluir_demanda_municipal(uuid, uuid) to authenticated;

notify pgrst, 'reload schema';
commit;

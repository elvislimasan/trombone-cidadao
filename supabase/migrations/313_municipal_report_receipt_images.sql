begin;

-- Comprovantes de solicitações internas podem conter endereço e protocolo.
-- A imagem fica em um bucket privado, acessível apenas à equipe da prefeitura.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('municipal-report-receipts', 'municipal-report-receipts', false, 5242880, array['image/png'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.can_access_municipal_report_receipt(p_report_id text, p_write boolean default false)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select auth.uid() is not null and exists (
    select 1 from public.reports r
    where r.id::text = p_report_id
      and r.created_by_municipality is not null
      and public.pode_acessar_prefeitura(auth.uid(), r.city_id)
      and (not p_write or public.pode_administrar_prefeitura(auth.uid(), r.city_id) or exists (
        select 1 from public.orgao_membros m
        join public.orgao_canais c on c.id = m.canal_id
        where m.user_id = auth.uid() and m.ativo
          and m.papel in ('gestor', 'operador') and c.city_id = r.city_id
      ))
  )
$$;
revoke all on function public.can_access_municipal_report_receipt(text, boolean) from public, anon;
grant execute on function public.can_access_municipal_report_receipt(text, boolean) to authenticated;

drop policy if exists municipal_report_receipts_select on storage.objects;
drop policy if exists municipal_report_receipts_insert on storage.objects;
drop policy if exists municipal_report_receipts_update on storage.objects;

create policy municipal_report_receipts_select on storage.objects for select to authenticated using (
  bucket_id = 'municipal-report-receipts'
  and name = split_part(name, '/', 1) || '/comprovante.png'
  and public.can_access_municipal_report_receipt(split_part(name, '/', 1), false)
);
create policy municipal_report_receipts_insert on storage.objects for insert to authenticated with check (
  bucket_id = 'municipal-report-receipts'
  and name = split_part(name, '/', 1) || '/comprovante.png'
  and public.can_access_municipal_report_receipt(split_part(name, '/', 1), true)
);
create policy municipal_report_receipts_update on storage.objects for update to authenticated using (
  bucket_id = 'municipal-report-receipts'
  and name = split_part(name, '/', 1) || '/comprovante.png'
  and public.can_access_municipal_report_receipt(split_part(name, '/', 1), true)
) with check (
  bucket_id = 'municipal-report-receipts'
  and name = split_part(name, '/', 1) || '/comprovante.png'
  and public.can_access_municipal_report_receipt(split_part(name, '/', 1), true)
);

commit;

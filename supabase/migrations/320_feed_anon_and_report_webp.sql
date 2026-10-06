begin;

-- A consulta pública ao feed também passa pela política restritiva. CASE impede
-- que o papel anon tente executar funções reservadas a authenticated.
drop policy if exists reports_hide_internal_municipal on public.reports;
create policy reports_hide_internal_municipal on public.reports as restrictive for select
  using (case when auth.uid() is null then is_public else
    is_public or author_id = auth.uid()
    or public.is_admin(auth.uid()) or public.is_master(auth.uid())
    or (created_by_municipality is not null and public.pode_acessar_prefeitura(auth.uid(), city_id))
  end);

create or replace function public.can_view_municipal_report_media(p_report uuid)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select not exists (
    select 1 from public.reports r where r.id = p_report and not r.is_public
      and case when auth.uid() is null then true else
        r.author_id is distinct from auth.uid()
        and not (public.is_admin(auth.uid()) or public.is_master(auth.uid()))
        and not public.pode_acessar_prefeitura(auth.uid(), r.city_id)
      end
  )
$$;

-- Permite WebP no bucket de broncas sem remover tipos já aceitos.
update storage.buckets
set allowed_mime_types = array_append(allowed_mime_types, 'image/webp')
where id = 'reports-media' and allowed_mime_types is not null
  and not ('image/webp' = any(allowed_mime_types));

notify pgrst, 'reload schema';
commit;

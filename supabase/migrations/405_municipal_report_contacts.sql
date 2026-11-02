begin;

-- O contato do solicitante não integra reports, o feed ou os comprovantes
-- públicos. Segue as permissões da equipe responsável, inclusive quando a
-- solicitação é pública.
create table public.municipal_report_contacts (
  report_id uuid primary key references public.reports(id) on delete cascade,
  name text,
  phone text,
  created_at timestamptz not null default now(),
  constraint municipal_report_contact_present check (name is not null or phone is not null),
  constraint municipal_report_contact_name check (name is null or (name = btrim(name) and char_length(name) between 1 and 160)),
  constraint municipal_report_contact_phone check (phone is null or (phone = btrim(phone) and char_length(phone) <= 32
    and phone ~ '^[+0-9[:space:]().-]+$' and char_length(regexp_replace(phone, '[^0-9]', '', 'g')) between 10 and 15))
);
alter table public.municipal_report_contacts enable row level security;
revoke all on public.municipal_report_contacts from public, anon, authenticated;
grant select, insert on public.municipal_report_contacts to authenticated;

create policy municipal_report_contacts_read on public.municipal_report_contacts
  for select to authenticated using (
    exists (select 1 from public.reports r where r.id = report_id and r.created_by_municipality is not null
      and public.municipal_report_access(auth.uid(), r.id, 'read'))
  );
create policy municipal_report_contacts_create on public.municipal_report_contacts
  for insert to authenticated with check (
    exists (select 1 from public.reports r where r.id = report_id and r.created_by_municipality is not null
      and r.author_id = auth.uid() and public.municipal_report_access(auth.uid(), r.id, 'receive'))
  );

notify pgrst, 'reload schema';
commit;

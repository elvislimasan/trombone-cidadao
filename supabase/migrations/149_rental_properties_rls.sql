-- 149_rental_properties_rls.sql
-- RLS das 4 tabelas de imóveis alugados. SELECT sempre público (transparência,
-- incluindo documentos de contrato). INSERT/UPDATE/DELETE restritos a gestor:
-- admin OU master OU embaixador ativo da cidade do imóvel (via join até
-- rental_properties.city_id nas tabelas filhas).

alter table public.rental_properties enable row level security;
alter table public.rental_property_contracts enable row level security;
alter table public.rental_property_media enable row level security;
alter table public.rental_property_documents enable row level security;

-- rental_properties
create policy "rental_properties_select_public" on public.rental_properties for select using (true);

create policy "rental_properties_gestor_insert" on public.rental_properties for insert
  with check (
    coalesce((select is_admin or is_master from public.profiles where id = auth.uid()), false)
    or public.is_ambassador_of(auth.uid(), city_id)
  );

create policy "rental_properties_gestor_update" on public.rental_properties for update
  using (
    coalesce((select is_admin or is_master from public.profiles where id = auth.uid()), false)
    or public.is_ambassador_of(auth.uid(), city_id)
  );

create policy "rental_properties_gestor_delete" on public.rental_properties for delete
  using (
    coalesce((select is_admin or is_master from public.profiles where id = auth.uid()), false)
    or public.is_ambassador_of(auth.uid(), city_id)
  );

-- rental_property_contracts
create policy "rental_property_contracts_select_public" on public.rental_property_contracts for select using (true);

create policy "rental_property_contracts_gestor_insert" on public.rental_property_contracts for insert
  with check (
    exists (
      select 1 from public.rental_properties p
      where p.id = rental_property_contracts.property_id
        and (
          coalesce((select is_admin or is_master from public.profiles where id = auth.uid()), false)
          or public.is_ambassador_of(auth.uid(), p.city_id)
        )
    )
  );

create policy "rental_property_contracts_gestor_update" on public.rental_property_contracts for update
  using (
    exists (
      select 1 from public.rental_properties p
      where p.id = rental_property_contracts.property_id
        and (
          coalesce((select is_admin or is_master from public.profiles where id = auth.uid()), false)
          or public.is_ambassador_of(auth.uid(), p.city_id)
        )
    )
  );

create policy "rental_property_contracts_gestor_delete" on public.rental_property_contracts for delete
  using (
    exists (
      select 1 from public.rental_properties p
      where p.id = rental_property_contracts.property_id
        and (
          coalesce((select is_admin or is_master from public.profiles where id = auth.uid()), false)
          or public.is_ambassador_of(auth.uid(), p.city_id)
        )
    )
  );

-- rental_property_media
create policy "rental_property_media_select_public" on public.rental_property_media for select using (true);

create policy "rental_property_media_gestor_insert" on public.rental_property_media for insert
  with check (
    exists (
      select 1 from public.rental_properties p
      where p.id = rental_property_media.property_id
        and (
          coalesce((select is_admin or is_master from public.profiles where id = auth.uid()), false)
          or public.is_ambassador_of(auth.uid(), p.city_id)
        )
    )
  );

create policy "rental_property_media_gestor_delete" on public.rental_property_media for delete
  using (
    exists (
      select 1 from public.rental_properties p
      where p.id = rental_property_media.property_id
        and (
          coalesce((select is_admin or is_master from public.profiles where id = auth.uid()), false)
          or public.is_ambassador_of(auth.uid(), p.city_id)
        )
    )
  );

-- rental_property_documents
create policy "rental_property_documents_select_public" on public.rental_property_documents for select using (true);

create policy "rental_property_documents_gestor_insert" on public.rental_property_documents for insert
  with check (
    exists (
      select 1 from public.rental_properties p
      where p.id = rental_property_documents.property_id
        and (
          coalesce((select is_admin or is_master from public.profiles where id = auth.uid()), false)
          or public.is_ambassador_of(auth.uid(), p.city_id)
        )
    )
  );

create policy "rental_property_documents_gestor_delete" on public.rental_property_documents for delete
  using (
    exists (
      select 1 from public.rental_properties p
      where p.id = rental_property_documents.property_id
        and (
          coalesce((select is_admin or is_master from public.profiles where id = auth.uid()), false)
          or public.is_ambassador_of(auth.uid(), p.city_id)
        )
    )
  );

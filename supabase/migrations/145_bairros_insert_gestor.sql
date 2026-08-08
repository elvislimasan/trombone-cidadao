-- 145_bairros_insert_gestor.sql
-- Permite embaixador ativo da cidade (e admin/master) criar bairros da cidade,
-- para o cadastro de obra poder adicionar bairros novos.
-- Só adiciona a policy de INSERT escopada; não altera SELECT (leitura pública)
-- nem habilita/desabilita RLS.

drop policy if exists "bairros_gestor_insert" on public.bairros;
create policy "bairros_gestor_insert"
  on public.bairros for insert
  with check (
    coalesce((select is_admin or is_master from public.profiles where id = auth.uid()), false)
    or public.is_ambassador_of(auth.uid(), city_id)
  );

notify pgrst, 'reload schema';

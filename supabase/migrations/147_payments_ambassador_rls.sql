-- 147_payments_ambassador_rls.sql
-- public_work_payments (migration 077) só permitia is_admin gerir pagamentos.
-- Embaixador da cidade da obra ficava bloqueado ao cadastrar pagamento de fase.
--
-- Adiciona policies de gestor escopadas pela cidade da obra, subindo a cadeia:
-- payment.measurement_id → measurement.work_id → work.city_id.
-- Espelha 142/146. Não altera as policies de admin/SELECT existentes.

drop policy if exists "payments_gestor_insert" on public.public_work_payments;
create policy "payments_gestor_insert"
  on public.public_work_payments for insert
  with check (
    exists (
      select 1
      from public.public_work_measurements m
      join public.public_works w on w.id = m.work_id
      where m.id = public_work_payments.measurement_id
        and (
          coalesce((select is_admin or is_master from public.profiles where id = auth.uid()), false)
          or public.is_ambassador_of(auth.uid(), w.city_id)
        )
    )
  );

drop policy if exists "payments_gestor_update" on public.public_work_payments;
create policy "payments_gestor_update"
  on public.public_work_payments for update
  using (
    exists (
      select 1
      from public.public_work_measurements m
      join public.public_works w on w.id = m.work_id
      where m.id = public_work_payments.measurement_id
        and (
          coalesce((select is_admin or is_master from public.profiles where id = auth.uid()), false)
          or public.is_ambassador_of(auth.uid(), w.city_id)
        )
    )
  );

drop policy if exists "payments_gestor_delete" on public.public_work_payments;
create policy "payments_gestor_delete"
  on public.public_work_payments for delete
  using (
    exists (
      select 1
      from public.public_work_measurements m
      join public.public_works w on w.id = m.work_id
      where m.id = public_work_payments.measurement_id
        and (
          coalesce((select is_admin or is_master from public.profiles where id = auth.uid()), false)
          or public.is_ambassador_of(auth.uid(), w.city_id)
        )
    )
  );

notify pgrst, 'reload schema';

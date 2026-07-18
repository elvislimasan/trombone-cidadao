-- Fase 2: RLS de moderação por cidade para embaixadores
-- Adiciona policies que permitem embaixadores ativos atualizarem/deletarem
-- broncas e atualizações de bronca dentro da(s) cidade(s) deles.
-- Não toca nas policies existentes de SELECT (já públicas) nem nas de INSERT.

-- ── reports: UPDATE por embaixador ──────────────────────────────────────────
-- A policy existente "admins_can_update" (ou similar) cobre is_admin=true.
-- Esta policy adiciona o escopo do embaixador:
drop policy if exists "ambassadors_can_update_reports" on public.reports;
create policy "ambassadors_can_update_reports"
  on public.reports for update
  using (
    public.is_ambassador_of(auth.uid(), city_id)
  );

-- ── reports: DELETE por embaixador ──────────────────────────────────────────
drop policy if exists "ambassadors_can_delete_reports" on public.reports;
create policy "ambassadors_can_delete_reports"
  on public.reports for delete
  using (
    public.is_ambassador_of(auth.uid(), city_id)
  );

-- ── report_updates: moderação por embaixador ────────────────────────────────
-- Embaixador pode aprovar/rejeitar/deletar atualizações de broncas da cidade dele.

drop policy if exists "ambassadors_can_update_report_updates" on public.report_updates;
create policy "ambassadors_can_update_report_updates"
  on public.report_updates for update
  using (
    exists (
      select 1
      from public.reports r
      where r.id = report_updates.report_id
        and public.is_ambassador_of(auth.uid(), r.city_id)
    )
  );

drop policy if exists "ambassadors_can_delete_report_updates" on public.report_updates;
create policy "ambassadors_can_delete_report_updates"
  on public.report_updates for delete
  using (
    exists (
      select 1
      from public.reports r
      where r.id = report_updates.report_id
        and public.is_ambassador_of(auth.uid(), r.city_id)
    )
  );

-- ── Fim ──────────────────────────────────────────────────────────────────────

-- 130_ambassador_select_pending_reports.sql
--
-- Corrige o painel do embaixador que mostrava "Nenhuma bronca pendente" mesmo
-- havendo broncas pending_approval na cidade dele.
--
-- Causa: a migration 122 adicionou policies de UPDATE/DELETE para embaixadores,
-- mas deixou a policy de SELECT existente intacta. Essa SELECT só expõe broncas
-- já aprovadas (moderation_status = 'approved') para o público / não-admins.
-- Resultado: o embaixador pode APROVAR uma bronca (UPDATE), mas não consegue
-- ENXERGÁ-LA (SELECT) enquanto ela está pending_approval — então a query do
-- painel (.eq('moderation_status','pending_approval')) retorna vazio.
--
-- Fix: policy de SELECT que permite ao embaixador ativo ver broncas ainda não
-- aprovadas (pending_approval / rejected) dentro da(s) cidade(s) dele.
-- is_ambassador_of() é SECURITY DEFINER, então não recorre pela RLS.

drop policy if exists "ambassadors_can_select_pending_reports" on public.reports;
create policy "ambassadors_can_select_pending_reports"
  on public.reports for select
  using (
    public.is_ambassador_of(auth.uid(), city_id)
  );

-- ── Fim ──────────────────────────────────────────────────────────────────────

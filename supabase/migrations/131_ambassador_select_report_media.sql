-- 131_ambassador_select_report_media.sql
--
-- Complemento da migration 130. Ao abrir a bronca pendente na ReportPage, o
-- embaixador precisa ver as MÍDIAS (fotos/vídeos) da bronca — não só o texto.
--
-- A policy de SELECT de report_media provavelmente espelha a de reports
-- (só expõe mídia de broncas aprovadas ou do próprio autor), então mídias de
-- broncas pending_approval de outros usuários ficam invisíveis para o embaixador.
--
-- Fix: policy de SELECT permitindo ao embaixador ativo ver mídias das broncas
-- da(s) cidade(s) dele. is_ambassador_of() é SECURITY DEFINER (não recorre RLS).

drop policy if exists "ambassadors_can_select_report_media" on public.report_media;
create policy "ambassadors_can_select_report_media"
  on public.report_media for select
  using (
    exists (
      select 1
      from public.reports r
      where r.id = report_media.report_id
        and public.is_ambassador_of(auth.uid(), r.city_id)
    )
  );

-- ── Fim ──────────────────────────────────────────────────────────────────────

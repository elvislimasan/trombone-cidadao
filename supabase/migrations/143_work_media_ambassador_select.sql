-- 143_work_media_ambassador_select.sql
-- Complemento da migration 142. Sem uma policy de SELECT, o embaixador NÃO enxerga
-- as mídias de obra 'pending' (a SELECT existente só expõe approved / próprias /
-- is_admin). Resultado: a aba "Mídias de Obra" do painel do embaixador ficava
-- sempre vazia, mesmo com o UPDATE/DELETE liberados na 142.
-- Espelha exatamente o que a migration 131 fez para report_media.

drop policy if exists "work_media_gestor_select" on public.public_work_media;
create policy "work_media_gestor_select"
  on public.public_work_media for select
  using (
    exists (
      select 1 from public.public_works w
      where w.id = public_work_media.work_id
        and (
          coalesce((select is_admin or is_master from public.profiles where id = auth.uid()), false)
          or public.is_ambassador_of(auth.uid(), w.city_id)
        )
    )
  );

-- NOTA: a revisão final pediu para VERIFICAR se RLS está ativa em public_works.
-- NÃO habilitamos aqui de propósito — se a tabela não tiver uma policy de SELECT
-- pública e habilitarmos RLS, todas as obras sumiriam do público. A verificação
-- (`select relrowsecurity from pg_class where relname='public_works'`) e a eventual
-- correção ficam para uma ação manual consciente, não neste arquivo.

notify pgrst, 'reload schema';

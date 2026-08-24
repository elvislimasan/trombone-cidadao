-- 170_comments_rls.sql
-- "new row violates row-level security policy for table comments" ao comentar
-- numa bronca (folha de comentarios do feed e pagina de detalhe).
--
-- A tabela comments nunca teve policy versionada neste repo: foi criada e
-- ajustada direto pelo dashboard. Sem definicao em migration, qualquer edicao
-- manual quebra o insert sem deixar rastro no git — foi o que aconteceu aqui.
-- Esta migration passa a ser a fonte da verdade das policies de comments.
--
-- Regras:
--   INSERT — autor logado so insere em nome de si mesmo (author_id = auth.uid())
--            e sempre como 'pending_approval'. Nao pode auto-aprovar comentario.
--   SELECT — aprovados sao publicos; o autor enxerga tambem os proprios
--            pendentes (o hook useReportComments depende disso para o comentario
--            aparecer marcado como pendente logo apos o envio); admin ve tudo.
--   UPDATE/DELETE — autor mexe no proprio comentario sem trocar de dono nem
--            mudar o moderation_status; admin modera qualquer um.

alter table public.comments enable row level security;

-- INSERT ---------------------------------------------------------------------
-- Cobre comentario de bronca (report_id) e de noticia (news_id).
drop policy if exists "comments_author_insert" on public.comments;
create policy "comments_author_insert"
  on public.comments for insert
  to authenticated
  with check (
    author_id = auth.uid()
    and moderation_status = 'pending_approval'
  );

-- SELECT ---------------------------------------------------------------------
drop policy if exists "comments_select" on public.comments;
create policy "comments_select"
  on public.comments for select
  using (
    moderation_status = 'approved'
    or author_id = auth.uid()
    or coalesce(
         (select is_admin or is_master from public.profiles where id = auth.uid()),
         false
       )
  );

-- UPDATE ---------------------------------------------------------------------
-- Autor edita o proprio texto; a moderacao continua sendo do admin.
-- O "nao pode mudar o proprio moderation_status" fica num trigger, nao na
-- policy: dentro do WITH CHECK so existe a linha nova, entao comparar com o
-- valor antigo exigiria reler a tabela — o trigger ja recebe OLD e NEW.
drop policy if exists "comments_author_update" on public.comments;
create policy "comments_author_update"
  on public.comments for update
  to authenticated
  using (author_id = auth.uid())
  with check (author_id = auth.uid());

create or replace function public.comments_block_self_moderation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.moderation_status is distinct from old.moderation_status
     and not coalesce(
           (select is_admin or is_master from public.profiles where id = auth.uid()),
           false
         )
  then
    raise exception 'Apenas a moderacao pode alterar o status de um comentario.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_comments_block_self_moderation on public.comments;
create trigger trg_comments_block_self_moderation
  before update on public.comments
  for each row
  execute function public.comments_block_self_moderation();

drop policy if exists "comments_admin_update" on public.comments;
create policy "comments_admin_update"
  on public.comments for update
  using (
    coalesce(
      (select is_admin or is_master from public.profiles where id = auth.uid()),
      false
    )
  );

-- DELETE ---------------------------------------------------------------------
drop policy if exists "comments_author_delete" on public.comments;
create policy "comments_author_delete"
  on public.comments for delete
  to authenticated
  using (author_id = auth.uid());

drop policy if exists "comments_admin_delete" on public.comments;
create policy "comments_admin_delete"
  on public.comments for delete
  using (
    coalesce(
      (select is_admin or is_master from public.profiles where id = auth.uid()),
      false
    )
  );

notify pgrst, 'reload schema';

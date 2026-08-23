-- 193_comentarios_sem_moderacao_previa.sql
--
-- Comentário deixa de esperar aprovação e passa a publicar na hora.
--
-- Por quê: a moderação prévia da 170 era uma fila que ninguém percorria — o
-- painel do admin nunca teve link para ela. O resultado, medido no banco: todo
-- comentário desde sempre parado em 'pending_approval', visível só para o
-- próprio autor. Uma fila que não é percorrida não é moderação, é um ralo.
--
-- O que entra no lugar, em duas camadas:
--   1. Máscara de baixo calão no cliente (src/lib/profanity.js), na escrita.
--   2. Denúncia: 3 denúncias não resolvidas tiram o comentário do ar e o
--      mandam para a fila — que agora tem um volume que cabe numa vida.
--
-- A camada 1 não é tranca (roda no cliente, é contornável). A tranca é a 2.
--
-- Vale para comentário de bronca E de notícia: regra única na tabela.

-- A BANDEIRA DO AUTOMÁTICO ---------------------------------------------------
-- Vem primeiro porque o backfill logo abaixo depende dela.
--
-- O trigger da 170 impede não-admin de mexer em moderation_status, e ele não
-- distingue "não-admin" de "não tem ninguém logado": numa migração `auth.uid()`
-- é NULL, a checagem de admin dá falso e o UPDATE do backfill levantaria
-- exceção. A mesma bandeira serve depois ao rebaixamento automático, que é
-- disparado pelo denunciante — que também não é admin.
create or replace function public.comments_block_self_moderation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- `set_config(..., true)` é local à transação: não vaza para a conexão
  -- seguinte do pool.
  if coalesce(current_setting('app.auto_moderacao', true), '') = 'on' then
    return new;
  end if;

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

-- BACKFILL -------------------------------------------------------------------
-- Os presos até aqui. Não ficaram parados por serem ruins — ficaram porque não
-- havia quem aprovasse. Rejeitado continua rejeitado: aquilo foi decisão.
do $$
begin
  perform set_config('app.auto_moderacao', 'on', true);

  update public.comments
     set moderation_status = 'approved'
   where moderation_status = 'pending_approval';

  perform set_config('app.auto_moderacao', 'off', true);
end;
$$;

-- INSERT ---------------------------------------------------------------------
-- A 170 exigia 'pending_approval' aqui. É por isso que publicar na hora não era
-- resolvível no front: a policy recusava qualquer outro valor.
drop policy if exists "comments_author_insert" on public.comments;
create policy "comments_author_insert"
  on public.comments for insert
  to authenticated
  with check (
    author_id = auth.uid()
    and moderation_status = 'approved'
  );

-- DENÚNCIAS ------------------------------------------------------------------
-- `resolved_at` existe por um caso específico: o moderador que restaura um
-- comentário injustamente denunciado. Sem ele, as 3 denúncias antigas
-- continuariam valendo e a quarta derrubaria o comentário de novo, para sempre.
-- Restaurar zera o placar.
create table if not exists public.comment_reports (
  id uuid primary key default gen_random_uuid(),
  comment_id uuid not null references public.comments(id) on delete cascade,
  reporter_id uuid not null references auth.users(id) on delete cascade,
  reason text,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  -- Uma pessoa, um voto. Sem isto, uma pessoa sozinha derruba qualquer
  -- comentário clicando três vezes.
  --
  -- Vale para sempre, inclusive depois de resolvida: quem já denunciou um
  -- comentário que a moderação restaurou não denuncia de novo. Efeito
  -- desejado — derrubar o mesmo comentário outra vez exige três pessoas
  -- NOVAS, e não as mesmas três insistindo até o moderador desistir.
  unique (comment_id, reporter_id)
);

create index if not exists comment_reports_abertas_idx
  on public.comment_reports (comment_id)
  where resolved_at is null;

alter table public.comment_reports enable row level security;

drop policy if exists "comment_reports_insert" on public.comment_reports;
create policy "comment_reports_insert"
  on public.comment_reports for insert
  to authenticated
  with check (reporter_id = auth.uid());

-- Quem denuncia vê a própria denúncia (para a tela saber que já denunciou);
-- a moderação vê todas.
drop policy if exists "comment_reports_select" on public.comment_reports;
create policy "comment_reports_select"
  on public.comment_reports for select
  using (
    reporter_id = auth.uid()
    or coalesce(
         (select is_admin or is_master from public.profiles where id = auth.uid()),
         false
       )
  );

-- Desistir da denúncia. Não há UPDATE para ninguém além da moderação, que mexe
-- pela RPC abaixo — `resolved_at` não é campo de usuário.
drop policy if exists "comment_reports_delete_own" on public.comment_reports;
create policy "comment_reports_delete_own"
  on public.comment_reports for delete
  to authenticated
  using (reporter_id = auth.uid() and resolved_at is null);

-- O REBAIXAMENTO AUTOMÁTICO --------------------------------------------------
-- Quem dispara é o denunciante, que não é admin. Por isso levanta a bandeira
-- definida lá em cima antes de mexer no comentário — em vez de afrouxar a regra
-- do bloqueio para todo mundo.
create or replace function public.comments_apply_report_threshold()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  abertas integer;
begin
  select count(*) into abertas
    from public.comment_reports
   where comment_id = new.comment_id
     and resolved_at is null;

  if abertas >= 3 then
    perform set_config('app.auto_moderacao', 'on', true);
    update public.comments
       set moderation_status = 'pending_approval'
     where id = new.comment_id
       and moderation_status = 'approved';
    perform set_config('app.auto_moderacao', 'off', true);
  end if;

  return new;
end;
$$;

drop trigger if exists trg_comment_reports_threshold on public.comment_reports;
create trigger trg_comment_reports_threshold
  after insert on public.comment_reports
  for each row
  execute function public.comments_apply_report_threshold();

-- A DECISÃO DA MODERAÇÃO -----------------------------------------------------
-- Numa chamada só porque são dois passos que não podem se separar: restaurar o
-- comentário e zerar as denúncias. Deixar o segundo a cargo do cliente é deixar
-- um comentário restaurado esperando a próxima denúncia para cair de novo.
create or replace function public.moderar_comentario(
  p_comment_id uuid,
  p_status text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not coalesce(
       (select is_admin or is_master from public.profiles where id = auth.uid()),
       false
     )
  then
    raise exception 'Apenas a moderacao pode decidir sobre um comentario.';
  end if;

  if p_status not in ('approved', 'rejected') then
    raise exception 'Status invalido: %', p_status;
  end if;

  perform set_config('app.auto_moderacao', 'on', true);

  update public.comments
     set moderation_status = p_status
   where id = p_comment_id;

  -- Aprovar zera o placar. Rejeitar também fecha as denúncias: elas deram
  -- certo, e o comentário não volta para a fila.
  update public.comment_reports
     set resolved_at = now()
   where comment_id = p_comment_id
     and resolved_at is null;

  perform set_config('app.auto_moderacao', 'off', true);
end;
$$;

revoke all on function public.moderar_comentario(uuid, text) from public;
grant execute on function public.moderar_comentario(uuid, text) to authenticated;

notify pgrst, 'reload schema';

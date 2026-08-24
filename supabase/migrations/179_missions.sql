-- 179_missions.sql
--
-- Central de missoes: os numeros que alimentam as metas progressivas.
--
-- Segue a escolha da 169, da 172 e da 174: nada de tabela de missoes, nada de
-- progresso gravado, nada de job de desbloqueio. O catalogo de missoes vive em
-- src/lib/missions.js como dado puro, e o progresso e a contagem atual das
-- tabelas de origem. Mudar "investigue 3 buracos" para 4 passa a ser mudar um
-- numero num array — sem backfill e sem risco de o valor gravado divergir da
-- regra de hoje.
--
-- Duas coisas faltavam para as missoes que o produto pediu, e as duas estao
-- aqui: saber a CATEGORIA do que foi investigado, e saber que houve
-- compartilhamento.

-- ── Compartilhamento ─────────────────────────────────────────────────────────
--
-- O QUE ESTA TABELA MEDE, E O QUE ELA NAO MEDE
--
-- Ela grava que a pessoa TOCOU em compartilhar. Nao grava que o conteudo foi
-- publicado — e nenhum app consegue: a folha nativa do sistema e o Instagram
-- nao devolvem confirmacao, por design. Quem afirmar "3 broncas publicadas"
-- com base nisto estara afirmando mais do que sabe.
--
-- Por isso a missao correspondente diz "compartilhe", que e exatamente o ato
-- registrado aqui.
--
-- IMPOSSIVEL DE INFLAR
--
-- A chave unica por (usuario, tipo, conteudo) e o coracao da tabela. Tocar dez
-- vezes em compartilhar a mesma bronca grava UMA linha — o insert usa
-- `on conflict do nothing`. Sem isso, a missao de compartilhar seria a mais
-- facil do app: bastaria abrir a mesma bronca e tocar no botao ate a meta cair.
create table if not exists public.share_events (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles(id) on delete cascade,

  content_type text not null check (content_type in ('report', 'patrol')),
  content_id   uuid not null,

  -- Por onde saiu: 'story', 'download', 'link'. Informativo — a missao nao
  -- distingue canal, e distinguir criaria a tentacao de premiar um deles.
  channel      text,

  created_at   timestamptz not null default now(),

  constraint share_events_uma_por_conteudo unique (user_id, content_type, content_id)
);

create index if not exists share_events_user_idx
  on public.share_events (user_id, created_at desc);

alter table public.share_events enable row level security;

-- Cada um ve e grava so o proprio. Nao ha leitura de terceiros: quantas vezes
-- alguem compartilhou nao e informacao publica, e nenhuma tela precisa disso.
drop policy if exists share_events_select_own on public.share_events;
create policy share_events_select_own on public.share_events
  for select using (auth.uid() = user_id);

drop policy if exists share_events_insert_own on public.share_events;
create policy share_events_insert_own on public.share_events
  for insert with check (auth.uid() = user_id);

drop policy if exists share_events_delete_own on public.share_events;
create policy share_events_delete_own on public.share_events
  for delete using (auth.uid() = user_id);

grant select, insert, delete on public.share_events to authenticated;

-- ── Contadores das missoes ───────────────────────────────────────────────────
--
-- Uma consulta so, nao seis. A central mostra doze missoes de uma vez, e cada
-- uma pergunta por um numero diferente; buscar um por vez seriam doze idas ao
-- servidor para pintar uma tela.
--
-- As contagens POR CATEGORIA saem como jsonb em vez de coluna por categoria:
-- categoria e dado de tabela (`categories`), nao de esquema. Uma categoria nova
-- amanha aparece sozinha no objeto, sem alterar esta funcao.
--
-- Sem security definer: tudo aqui e do proprio usuario, e a RLS ja garante o
-- recorte. Chamar com outro id devolve o que aquele id tornou publico, nao os
-- numeros dele.
create or replace function public.get_mission_counters(target_user_id uuid)
returns table (
  reports_count            integer,
  comments_count           integer,
  upvotes_given            integer,
  signals_count            integer,
  missions_count           integer,
  patrols_count            integer,
  total_confirmed          integer,
  total_distance_meters    integer,
  shares_count             integer,
  -- { "buracos": 3, "iluminacao": 1 }
  confirmed_by_category    jsonb,
  reported_by_category     jsonb
)
language sql
stable
as $$
  with
  -- Broncas cadastradas do zero. `origin = 'full'` exclui as que nasceram de
  -- sinal: aquelas sao creditadas a quem cumpriu a missao, nao a quem apontou.
  minhas_broncas as (
    select r.category_id
    from public.reports r
    where r.author_id = target_user_id
      and r.origin = 'full'
      and r.moderation_status = 'approved'
  ),
  -- O que foi investigado: cada atualizacao enviada, com a categoria da bronca
  -- a que ela pertence. E o dado que faltava para "investigue 3 buracos".
  minhas_investigacoes as (
    select r.category_id
    from public.report_updates u
    join public.reports r on r.id = u.report_id
    where u.author_id = target_user_id
      and coalesce(u.status, '') <> 'rejected'
  ),
  totais as (
    select
      (select count(*) from minhas_broncas)::integer as reports_count,
      (select count(*) from public.comments c
        where c.author_id = target_user_id)::integer as comments_count,
      (select count(*) from public.signatures s
        where s.user_id = target_user_id)::integer as upvotes_given,
      (select count(*) from public.reports r
        where r.author_id = target_user_id
          and r.origin = 'signal'
          and r.signal_status in ('open', 'done'))::integer as signals_count,
      (select count(*) from public.reports r
        where r.completed_by = target_user_id
          and r.signal_status = 'done'
          and r.moderation_status = 'approved')::integer as missions_count,
      (select count(*) from public.patrols p
        where p.user_id = target_user_id)::integer as patrols_count,
      (select coalesce(sum(p.confirmed_count), 0) from public.patrols p
        where p.user_id = target_user_id)::integer as total_confirmed,
      (select coalesce(sum(p.distance_meters), 0) from public.patrols p
        where p.user_id = target_user_id)::integer as total_distance_meters,
      (select count(*) from public.share_events e
        where e.user_id = target_user_id)::integer as shares_count
  )
  select
    t.reports_count,
    t.comments_count,
    t.upvotes_given,
    t.signals_count,
    t.missions_count,
    t.patrols_count,
    t.total_confirmed,
    t.total_distance_meters,
    t.shares_count,
    coalesce(
      (select jsonb_object_agg(category_id, n)
       from (
         select category_id, count(*)::integer as n
         from minhas_investigacoes
         where category_id is not null
         group by category_id
       ) x),
      '{}'::jsonb
    ),
    coalesce(
      (select jsonb_object_agg(category_id, n)
       from (
         select category_id, count(*)::integer as n
         from minhas_broncas
         where category_id is not null
         group by category_id
       ) y),
      '{}'::jsonb
    )
  from totais t;
$$;

comment on function public.get_mission_counters(uuid) is
  'Numeros que alimentam a central de missoes. O catalogo e as metas vivem no cliente (src/lib/missions.js); aqui so as contagens.';

grant execute on function public.get_mission_counters(uuid) to authenticated;

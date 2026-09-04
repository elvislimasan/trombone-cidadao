-- 227 — O admin que o banco nao reconhecia, e a remocao silenciosa de um aviso
--
-- ═══════════════════════════════════════════════════════════════════════════
-- PARTE 1 — POR QUE TRES TELAS DIFERENTES RECUSARAM O MESMO ADMIN
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Tres falhas relatadas no mesmo dia, em lugares sem nenhuma relacao entre si:
--
--   • criar meta comunitaria  -> "new row violates RLS policy for community_goals"
--   • publicar campanha       -> "new row violates RLS policy for campaigns"
--   • editar acontecimento    -> "Sem permissao para editar este acontecimento."
--
-- O que as tres tem em comum e uma unica funcao. As policies da 213 e da 214
-- comecam por `public.is_admin(auth.uid())`, e `update_city_event` (206) chega
-- na mesma funcao por dentro de `can_manage_city_events` -> `city_event_role`.
-- Se ela devolve falso, as tres recusam — e o app continua mostrando os botoes,
-- porque a TELA le `profiles.is_admin` direto, sem passar por aqui.
--
-- `is_admin` nunca esteve no git: ela nasceu no painel do Supabase, como as
-- policies (ver a nota de RLS nao versionada). O que este bloco faz e traze-la
-- para ca com tres correcoes:
--
--   1. SET search_path = public. Uma SECURITY DEFINER sem search_path fixo
--      resolve nomes pelo caminho de quem chama. Hoje o corpo qualifica
--      `public.profiles` e isso a salva; e uma salvacao por acidente, nao por
--      projeto, e vale tanto para seguranca quanto para previsibilidade.
--
--   2. Qualificacao explicita da coluna. `select is_admin from profiles` num
--      corpo plpgsql depende de `is_admin` nao colidir com nenhum nome de
--      variavel ou parametro em escopo. `select pr.is_admin from profiles pr`
--      nao depende de nada.
--
--   3. Linguagem SQL em vez de plpgsql, o que a torna inlinavel dentro das
--      policies — a diferenca aparece numa listagem grande, onde a versao
--      plpgsql e uma chamada de funcao por linha avaliada.
--
-- O NOME DO PARAMETRO E PRESERVADO DE PROPOSITO
--
-- `create or replace function` recusa mudar o nome de um parametro existente.
-- Como a definicao viva nao esta no git, o bloco descobre o nome atual no
-- catalogo e reescreve o corpo com ELE. Assim a migracao roda tanto num banco
-- que ja tem a funcao quanto num que nunca a teve.

do $$
declare
  v_arg text;
begin
  select coalesce(p.proargnames[1], 'user_id')
    into v_arg
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname  = 'is_admin'
    and p.pronargs = 1
    and p.proargtypes[0] = 'uuid'::regtype
  limit 1;

  v_arg := coalesce(v_arg, 'user_id');

  execute format($f$
    create or replace function public.is_admin(%1$I uuid)
    returns boolean
    language sql
    stable
    security definer
    set search_path = public
    as $b$
      select coalesce(
        (select pr.is_admin from public.profiles pr where pr.id = %1$I limit 1),
        false
      );
    $b$;
  $f$, v_arg);
end $$;

comment on function public.is_admin(uuid) is
  'Le profiles.is_admin, que e a autoridade de admin do app. Usada nas policies da 213/214 e em city_event_role (206) — se ela mentir, tres telas recusam um admin de verdade sem dizer por que.';

-- ── 1.1 O diagnostico que faltava ───────────────────────────────────────────
--
-- Quando uma policy recusa, o PostgREST diz apenas "violates row-level security
-- policy". Ele nao diz QUAL das condicoes falhou, e do lado do app nao ha como
-- distinguir "voce nao e admin" de "a funcao que decide isso esta quebrada" —
-- que foi exatamente a duvida que custou este dia.
--
-- A funcao devolve as duas leituras lado a lado: o que a coluna diz e o que a
-- funcao responde. Divergencia entre elas e o defeito; concordancia em `false`
-- e um perfil que realmente nao e admin naquele banco (o caso comum depois de
-- um reset do ambiente de desenvolvimento, em que o perfil nasce do gatilho com
-- os defaults).
--
-- So fala sobre QUEM CHAMA. Nao aceita parametro de usuario de proposito: uma
-- funcao que responde "fulano e admin?" para qualquer um e um mapa da area
-- administrativa exposto a quem quiser ler.
create or replace function public.meus_papeis()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'uid',                auth.uid(),
    'perfil_existe',      exists (select 1 from public.profiles where id = auth.uid()),
    'coluna_is_admin',    (select pr.is_admin  from public.profiles pr where pr.id = auth.uid()),
    'coluna_is_master',   (select pr.is_master from public.profiles pr where pr.id = auth.uid()),
    'funcao_is_admin',    public.is_admin(auth.uid()),
    'funcao_is_master',   public.is_master(auth.uid()),
    'cidades_embaixador', coalesce(
      (select jsonb_agg(city_id order by city_id)
         from public.ambassador_cities
        where user_id = auth.uid() and status = 'active'),
      '[]'::jsonb
    )
  );
$$;

comment on function public.meus_papeis() is
  'Diagnostico: o que a coluna diz e o que a funcao responde, lado a lado. Divergencia entre as duas e defeito; concordancia em false e perfil que nao e admin neste banco.';

grant execute on function public.meus_papeis() to authenticated;

-- ── 1.2 As policies de escrita, reafirmadas ─────────────────────────────────
--
-- Sao as MESMAS da 213 e da 214, palavra por palavra. Reafirma-las custa nada
-- num banco que ja as tem, e cobre o outro caso possivel deste defeito: uma
-- tabela com RLS ligada e nenhuma policy permissiva de escrita recusa todo
-- INSERT com a mesma mensagem que uma policy que avaliou falso — a mensagem do
-- PostgREST nao distingue os dois.

drop policy if exists community_goals_gestor_write on public.community_goals;
create policy community_goals_gestor_write on public.community_goals
  for all to authenticated
  using (
    public.is_admin(auth.uid())
    or public.is_master(auth.uid())
    or public.is_ambassador_of(auth.uid(), city_id)
  )
  with check (
    public.is_admin(auth.uid())
    or public.is_master(auth.uid())
    or public.is_ambassador_of(auth.uid(), city_id)
  );

drop policy if exists campaigns_editor_write on public.campaigns;
create policy campaigns_editor_write on public.campaigns
  for all to authenticated
  using (
    public.is_admin(auth.uid())
    or public.is_master(auth.uid())
    or (city_id is not null and public.is_ambassador_of(auth.uid(), city_id))
  )
  with check (
    public.is_admin(auth.uid())
    or public.is_master(auth.uid())
    or (city_id is not null and public.is_ambassador_of(auth.uid(), city_id))
  );

-- A 213 concede select/insert/update em community_goals, e a 214 o mesmo em
-- campaigns — nenhuma das duas concede DELETE, e isto continua assim: meta e
-- campanha se ENCERRAM, e o historico e o que sustenta a proxima.
grant select, insert, update on public.community_goals to authenticated;
grant select, insert, update on public.campaigns to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- PARTE 2 — REMOVER UM ACONTECIMENTO, EM SILENCIO
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Ja existe `cancel_city_event`, e ela continua sendo o caminho normal: o aviso
-- some da lista, a historia fica, e quem foi avisado RECEBE o cancelamento —
-- porque um alerta de falta d'agua que desaparece calado deixa a cidade achando
-- que a falta continua.
--
-- Este e o outro caso, o que a 206 nao previu: o aviso que nunca deveria ter
-- existido. Teste em producao, duplicata do mesmo evento, cidade errada, foto
-- trocada. Cancelar um desses produz uma notificacao sobre uma coisa que a
-- pessoa nunca soube que existia — e uma linha permanente na timeline publica
-- de um evento que so documenta o proprio engano.
--
-- POR QUE O SILENCIO E A PARTE IMPORTANTE
--
-- E o que separa esta funcao de `cancel_city_event`. Ela nao insere em
-- `city_event_updates` e nao chama `notify_city_event_audience`. As linhas
-- filhas (areas, atualizacoes, confirmacoes e as notificacoes ja enviadas) saem
-- pelo `on delete cascade` que a 206 declarou.
--
-- POR QUE NAO E "SO UM DELETE PELA POLICY"
--
-- Porque a decisao de quem pode fazer isso e a mesma de quem gere o
-- acontecimento — `can_manage_city_events` —, e ela ja mora numa funcao. Uma
-- policy de DELETE seria uma quarta copia dessa regra, com a chance habitual de
-- as copias divergirem. E o retorno importa: sem ele, a foto do acontecimento
-- ficaria orfa no Storage para sempre.

create or replace function public.delete_city_event(p_event_id bigint)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user  uuid := auth.uid();
  v_event public.city_events;
begin
  select * into v_event from public.city_events where id = p_event_id;
  if not found then
    raise exception 'Acontecimento nao encontrado.' using errcode = 'P0002';
  end if;

  if not public.can_manage_city_events(v_user, v_event.city_id) then
    raise exception 'Sem permissao para remover este acontecimento.' using errcode = '42501';
  end if;

  delete from public.city_events where id = p_event_id;

  -- Quem chamou apaga o arquivo. O Storage nao tem gatilho de banco, e deixar a
  -- imagem para tras faria o bucket guardar a foto de um aviso que nao existe.
  return v_event.image_path;
end;
$$;

comment on function public.delete_city_event(bigint) is
  'Remocao SILENCIOSA de um acontecimento — sem linha na timeline e sem notificar. E para o aviso publicado por engano; para o que a cidade ja viu, o caminho e cancel_city_event, que avisa.';

grant execute on function public.delete_city_event(bigint) to authenticated;

notify pgrst, 'reload schema';

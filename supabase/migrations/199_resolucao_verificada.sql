-- 199_resolucao_verificada.sql
--
-- Uma bronca so fecha quando quem tem autoridade fecha, ou quando duas pessoas
-- sem interesse na historia foram ao local e disseram a mesma coisa.
--
-- O QUE MUDA, E O QUE NAO MUDA
--
-- A regra de admin fica EXATAMENTE como esta: admin e embaixador marcam
-- 'solved' e a bronca vai direto para 'resolved'. E o que o cliente ja faz
-- (`enviarAtualizacaoDeBronca`, quando `user.is_admin`), e e o que sustenta a
-- operacao — o embaixador da cidade e quem fala com a prefeitura e quem
-- responde pelo mapa. Nada aqui tira esse poder dele.
--
-- O caminho comunitario entra POR CIMA desse, nao no lugar. Ele existe para a
-- bronca que ninguem da moderacao foi conferir, que e a maioria numa cidade
-- grande — e ate hoje ficava aberta para sempre, mesmo depois de consertada.
--
-- REIVINDICACAO NAO E CONFIRMACAO
--
-- Quem registrou tem interesse no desfecho. A voz dele leva a bronca para
-- 'pending_resolution' (que o app ja grava desde a 104) e para por ai. Sem essa
-- distincao, a verificacao carimbaria exatamente o que ela existe para checar.
--
-- ESPELHA src/lib/resolution.js
--
-- O quorum, a exclusao da parte interessada e o tratamento da atualizacao
-- rejeitada estao nos dois lados. A tela precisa mostrar "falta 1 confirmacao"
-- ANTES de o servidor decidir, e mostrar um numero diferente do que o banco vai
-- fazer e pior que nao mostrar numero nenhum. Mudar um lado sem o outro e o
-- risco real desta migracao — os testes de resolution.test.mjs guardam o lado JS.

-- ── O quorum ─────────────────────────────────────────────────────────────────
--
-- Dois, nao tres: em bairro com pouca gente, tres confirmacoes significam uma
-- bronca que nunca fecha — e bronca que nunca fecha e pior que bronca fechada
-- cedo demais, porque o mapa para de refletir a rua.
create or replace function public.quorum_de_resolucao()
returns integer
language sql
immutable
as $fn$ select 2; $fn$;

comment on function public.quorum_de_resolucao() is
  'Quantas confirmacoes independentes fecham uma bronca sem moderacao. Espelha QUORUM_CONFIRMACOES em src/lib/resolution.js.';

-- ── Quantas confirmacoes independentes uma bronca ja tem ────────────────────
--
-- `distinct author_id`: a policy de 7 dias permite a mesma pessoa reenviar, e
-- sem o distinct o quorum cairia sozinho com duas linhas de um unico vizinho.
--
-- Fica de fora quem tem interesse (autor, completed_by) e quem tem autoridade
-- (admin) — o admin nao "conta 1 para o quorum", ele fecha sozinho logo abaixo.
create or replace function public.confirmacoes_independentes(p_report_id uuid)
returns integer
language sql
stable
security definer
set search_path = public, extensions
as $fn$
  select count(distinct u.author_id)::integer
  from public.report_updates u
  join public.reports r on r.id = u.report_id
  left join public.profiles p on p.id = u.author_id
  where u.report_id = p_report_id
    and u.update_type = 'solved'
    -- Pendente de moderacao CONTA, igual a 185: ignora-la faria a barra da tela
    -- andar para tras enquanto o moderador nao chegasse.
    and coalesce(u.status, '') <> 'rejected'
    and u.author_id is not null
    and u.author_id <> r.author_id
    and u.author_id is distinct from r.completed_by
    and coalesce(p.is_admin, false) = false;
$fn$;

comment on function public.confirmacoes_independentes(uuid) is
  'Pessoas distintas, sem interesse no desfecho e sem poder de moderacao, que disseram que a bronca foi resolvida.';

grant execute on function public.confirmacoes_independentes(uuid) to authenticated;

-- ── A promocao ───────────────────────────────────────────────────────────────
--
-- Roda depois de cada atualizacao de bronca. Duas saidas:
--
--   • quem enviou e admin  -> resolve na hora (a regra de sempre);
--   • quorum atingido      -> resolve tambem, e e o caminho novo.
--
-- Nunca REABRE nada: uma bronca que ja esta em 'resolved' nao e tocada, e
-- nenhuma confirmacao a menos volta o status. Reabrir por contagem faria uma
-- moderacao ser desfeita por dois toques, que e o oposto do que a 199 quer.
create or replace function public.promover_resolucao()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $fn$
declare
  v_report   public.reports%rowtype;
  v_is_admin boolean;
begin
  if new.update_type is distinct from 'solved' then
    return new;
  end if;
  if coalesce(new.status, '') = 'rejected' then
    return new;
  end if;

  select * into v_report from public.reports where id = new.report_id;
  if not found or v_report.status = 'resolved' then
    return new;
  end if;

  select coalesce(is_admin, false) into v_is_admin
  from public.profiles where id = new.author_id;

  if coalesce(v_is_admin, false)
     or public.confirmacoes_independentes(new.report_id) >= public.quorum_de_resolucao()
  then
    update public.reports set status = 'resolved' where id = new.report_id;
  else
    -- Sem quorum ainda: sai do limbo e passa a dizer o que de fato aconteceu —
    -- alguem afirmou que acabou e estamos conferindo.
    if v_report.status <> 'pending_resolution' then
      update public.reports
         set status = 'pending_resolution'
       where id = new.report_id;
    end if;
  end if;

  return new;
end;
$fn$;

drop trigger if exists on_report_update_promover_resolucao on public.report_updates;
create trigger on_report_update_promover_resolucao
after insert or update of status, update_type on public.report_updates
for each row execute function public.promover_resolucao();

-- ── A notificacao de resolucao ───────────────────────────────────────────────
--
-- E a unica notificacao que este app pode mandar sem inventar motivo, e a mais
-- importante que ele tem: o retorno que hoje nunca volta para quem registrou.
--
-- Vai para TODOS os participantes, nao so para o autor. Quem confirmou em campo
-- fez o trabalho que sustenta a verificacao; nao avisa-lo de que deu certo e
-- pedir de novo amanha sem nunca ter dito que funcionou.
--
-- O texto espelha `fraseDaResolucao` em src/lib/impact.js. A contagem de
-- participantes e o coracao dele: "voce e mais 11 pessoas" e literalmente
-- verdade, porque o credito de Impacto foi pago para as doze.
create or replace function public.notificar_resolucao()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $fn$
declare
  v_total integer;
  v_onde  text;
begin
  if new.status is not distinct from old.status or new.status <> 'resolved' then
    return new;
  end if;

  select count(*) into v_total from public.report_participants(new.id);
  v_onde := coalesce(nullif(trim(new.address), ''), nullif(trim(new.title), ''),
                     'Um problema que voce acompanhava');

  insert into public.notifications (user_id, type, title, message, link, is_read, created_at)
  select
    p.user_id,
    'status_update',
    left(v_onde, 80) || ' foi resolvido',
    case
      when v_total <= 1 then 'Voce fez isso acontecer.'
      when v_total = 2  then 'Voce e mais 1 pessoa fizeram isso.'
      else 'Voce e mais ' || (v_total - 1) || ' pessoas fizeram isso.'
    end,
    '/bronca/' || new.id,
    false,
    now()
  from public.report_participants(new.id) p;

  return new;
end;
$fn$;

drop trigger if exists on_report_resolved_notify on public.reports;
create trigger on_report_resolved_notify
after update of status on public.reports
for each row execute function public.notificar_resolucao();

comment on function public.notificar_resolucao() is
  'Avisa todos os participantes quando a bronca fecha. Espelha fraseDaResolucao em src/lib/impact.js.';

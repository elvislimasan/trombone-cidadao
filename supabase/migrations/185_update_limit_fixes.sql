-- 185_update_limit_fixes.sql
--
-- Duas correcoes na regra de "uma atualizacao por tipo a cada 7 dias".
--
-- O SINTOMA
--
-- A bronca foi resolvida, a pessoa abriu o modal, escolheu "O problema foi
-- resolvido" — a opcao estava disponivel, o botao estava ativo — e o envio
-- falhou com "Limite semanal atingido".
--
-- A tela nao estava mentindo por descuido: ela desabilita corretamente os tipos
-- ja enviados, com base na lista de atualizacoes que RECEBE. O problema e que a
-- lista que ela recebe e menor que a lista que a policy conta.
--
-- ── 1. O autor precisa enxergar a propria atualizacao pendente ───────────────
--
-- Uma atualizacao de usuario comum nasce em 'pending_moderation'. Se a policy
-- de leitura so mostra as ja aprovadas, o autor NAO VE a que ele mesmo acabou
-- de mandar. A tela entao acha o tipo livre e oferece; a policy de insert, que
-- conta tudo, recusa.
--
-- O resultado e o pior tipo de erro: o app convida para uma acao que ele mesmo
-- vai negar, e a mensagem culpa um "limite" que a pessoa nao tinha como saber
-- que atingiu.
--
-- A policy abaixo e permissiva (policies se somam com OR): quem escreveu sempre
-- le o que escreveu, em qualquer status. Nao abre nada de terceiros.
drop policy if exists report_updates_select_own on public.report_updates;
create policy report_updates_select_own on public.report_updates
  for select
  to authenticated
  using (auth.uid() = author_id);

-- ── 2. Atualizacao rejeitada nao pode custar uma semana ─────────────────────
--
-- A funcao da 106 conta QUALQUER linha dos ultimos 7 dias, inclusive as que a
-- moderacao rejeitou. Ou seja: um relato descartado — que nao vale nada para
-- ninguem, que nao aparece em lugar nenhum — bloqueia a pessoa por sete dias
-- de contar o que de fato viu.
--
-- E pior no caso que mais importa: se a rejeicao foi por foto ruim ou texto
-- confuso, a pessoa quer justamente reenviar, e e exatamente isso que fica
-- proibido.
--
-- Pendente CONTINUA contando. Ela existe, esta na fila e vai virar informacao
-- publica; deixar reenviar por cima criaria duas versoes do mesmo relato para o
-- moderador julgar.
create or replace function public.can_user_submit_update(
  p_user_id   uuid,
  p_report_id uuid,
  p_update_type text default null
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select not exists (
    select 1
    from public.report_updates
    where author_id   = p_user_id
      and report_id   = p_report_id
      and (p_update_type is null or update_type = p_update_type)
      and coalesce(status, '') <> 'rejected'
      and created_at  > now() - interval '7 days'
  )
$$;

notify pgrst, 'reload schema';

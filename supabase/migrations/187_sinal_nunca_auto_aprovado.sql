-- 187_sinal_nunca_auto_aprovado.sql
--
-- Sinalizar falhava para quem e admin.
--
-- O ERRO NA TELA
--
--   new row for relation "reports" violates check constraint
--   "reports_sinal_aberto_nao_publica"
--
-- QUEM ESTAVA MENTINDO
--
-- Nao era a create_patrol_signal. Ela grava 'pending_approval' sem excecao —
-- da para ler o insert dela na 184. O valor era reescrito DEPOIS, a caminho da
-- tabela, por um gatilho BEFORE INSERT que existe desde antes destas migracoes:
--
--   set_report_moderation_status()
--     autor e admin -> moderation_status := 'approved'
--     senao         -> moderation_status := 'pending_approval'
--
-- Ele nao sabe o que e um sinal — foi escrito quando toda linha de `reports`
-- era uma bronca de verdade, com foto e descricao, e adiantar a moderacao para
-- quem ja e admin fazia todo sentido.
--
-- Com a 175, passou a nao fazer: um sinal aberto e um alfinete no mapa que
-- alguem tocou de passagem. Sem foto, sem descricao, sem conferencia. A
-- constraint proibiu que isso chegasse ao feed, e o gatilho passou a insistir
-- em colocar justamente essa linha la. Os dois se encontraram no insert.
--
-- Por isso so quebrava para admin. Para o resto dos usuarios o gatilho escrevia
-- o mesmo 'pending_approval' que a RPC ja pedira, e ninguem via problema.
--
-- ONDE ELE ESTAVA ESCONDIDO
--
-- Em lugar nenhum deste repositorio: `set_report_moderation_status` nasceu no
-- dashboard e so aparece num dump de novembro de 2025 (backup_supabase_*/).
-- Ler as migracoes daqui e concluir que nada mexe em moderation_status no
-- insert era o passo mais natural do mundo — e estava errado.
--
-- POR QUE UM GATILHO NOVO E NAO UM `create or replace` NAQUELE
--
-- Porque nao da para saber o que ele e hoje. A unica copia que temos tem nove
-- meses e veio de um dump; qualquer edicao feita pelo dashboard desde entao e
-- invisivel daqui. Um `create or replace` escrito em cima dessa copia
-- apagaria silenciosamente o que tivesse sido acrescentado no meio do caminho.
--
-- Entao nao se toca nele. Acrescenta-se um segundo BEFORE INSERT que corrige a
-- linha depois — e a correcao vale seja qual for a versao que estiver rodando.
--
-- ⚠️ O NOME IMPORTA, E E POR ISSO QUE ELE E FEIO
--
-- Gatilhos BEFORE do mesmo evento disparam em ordem ALFABETICA do nome. Este
-- precisa ser o ultimo a falar: se rodasse antes de set_report_moderation_status
-- seria sobrescrito por ela e nao teria servido para nada. O prefixo `zzz_` e o
-- que garante isso. Renomear para algo mais bonito reintroduz o bug.

create or replace function public.forcar_sinal_aberto_pendente()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  -- So o sinal aberto e assunto aqui, e so quando alguem tentou APROVA-LO.
  --
  -- A condicao e estreita de proposito. 'rejected' precisa passar: um sinal
  -- falso, ou de um lugar que nao existe, tem que poder ser derrubado pelo
  -- moderador. Se este gatilho devolvesse toda linha para 'pending_approval',
  -- rejeitar um sinal seria impossivel — a rejeicao voltaria para a fila e o
  -- moderador rejeitaria de novo, para sempre.
  if new.origin = 'signal'
     and new.signal_status = 'open'
     and new.moderation_status = 'approved'
  then
    -- Exatamente o que a create_patrol_signal pediu no insert. Nao e uma regra
    -- nova: e a restauracao do que ela ja tinha escrito.
    new.moderation_status := 'pending_approval';
    new.status := 'pending';
  end if;

  return new;
end $$;

comment on function public.forcar_sinal_aberto_pendente() is
  'Sinal aberto nunca entra aprovado, nem de admin: nao tem foto nem conferencia. Sustenta a constraint reports_sinal_aberto_nao_publica contra gatilhos anteriores que aprovam por autor.';

drop trigger if exists zzz_reports_sinal_aberto_pendente on public.reports;

-- INSERT e UPDATE. No insert e onde o bug aparecia; no update e o que impede
-- que uma tela de moderacao aprove um sinal ainda aberto e leve um 23514 na
-- cara do moderador — agora a linha so se corrige e segue.
create trigger zzz_reports_sinal_aberto_pendente
  before insert or update on public.reports
  for each row
  execute function public.forcar_sinal_aberto_pendente();

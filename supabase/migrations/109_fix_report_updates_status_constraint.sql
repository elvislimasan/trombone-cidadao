-- Corrige a constraint de status em report_updates para incluir
-- os novos valores do fluxo de moderação: pending_moderation e rejected

-- Remove a constraint antiga (se existir com esse nome)
alter table public.report_updates
  drop constraint if exists report_updates_status_check;

-- Adiciona a constraint atualizada com todos os valores válidos
alter table public.report_updates
  add constraint report_updates_status_check
  check (status in ('pending', 'confirmed', 'pending_moderation', 'rejected'));

notify pgrst, 'reload schema';

-- Corrige bancos que já executaram a versão anterior da migração 275.
-- Nenhuma ordem ou bronca é excluída por esta migração.
begin;

-- As ordens de serviço são abertas explicitamente pela equipe municipal.
drop trigger if exists z_receber_bronca_como_demanda on public.reports;

-- Ao excluir uma ordem, seu histórico interno é removido por cascata.
-- As respostas oficiais continuam pertencendo às broncas; apenas o vínculo
-- com o evento interno deixa de existir.
alter table public.orgao_respostas
  drop constraint if exists orgao_respostas_demanda_evento_id_fkey;
alter table public.orgao_respostas
  add constraint orgao_respostas_demanda_evento_id_fkey
  foreign key (demanda_evento_id)
  references public.demanda_eventos(id) on delete set null;

notify pgrst, 'reload schema';
commit;

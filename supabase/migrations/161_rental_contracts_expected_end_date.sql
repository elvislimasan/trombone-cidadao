-- 161_rental_contracts_expected_end_date.sql
-- Campo separado de "previsão de encerramento" do contrato de aluguel.
-- end_date já existe e marca quando o contrato REALMENTE terminou (fecha o
-- is_current). expected_end_date é só um aviso/planejamento: muitos imóveis
-- continuam ocupados pela prefeitura após o fim formal do contrato, e o
-- portal da transparência demora a refletir a renovação/encerramento real —
-- por isso o imóvel deve continuar ativo até admin/embaixador marcar
-- manualmente como inativo, independente dessa data prevista.

alter table public.rental_property_contracts
  add column if not exists expected_end_date date;

notify pgrst, 'reload schema';

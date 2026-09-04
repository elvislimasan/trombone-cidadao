-- Os documentos oficiais da prefeitura que servem de referencia para conferir
-- o cadastro de pavimentacao.
--
-- O QUE ELES RESOLVEM
--
-- Quem mantem a base compara o que esta na plataforma com duas coisas: o mapa
-- de ruas mais recente da prefeitura e a lista de ruas com CEP. Hoje esses dois
-- enderecos vivem no navegador de quem confere, e ninguem mais os alcanca —
-- inclusive a proxima pessoa que assumir a cidade.
--
-- POR QUE COLUNAS EM `cities`, E NAO UMA TABELA
--
-- Mesma razao ja registrada na migracao 202: neste projeto as policies de RLS
-- vivem no painel do Supabase e nao no git. Cada tabela nova e mais um conjunto
-- de regras invisiveis ao codigo, que ninguem revisa e que falha calada. Duas
-- colunas na linha da cidade herdam exatamente a permissao que `cities` ja tem.
--
-- POR QUE POR CIDADE
--
-- O app esta indo nacional. Um par global apontaria para a prefeitura de
-- Floresta em qualquer cidade que entrar depois — e o embaixador da cidade
-- nova nao teria onde por os documentos dele.

alter table public.cities
  add column if not exists pavement_street_map_url text,
  add column if not exists pavement_cep_list_url text;

comment on column public.cities.pavement_street_map_url is
  'Endereco do mapa de ruas oficial da prefeitura, usado para conferir o cadastro de pavimentacao.';
comment on column public.cities.pavement_cep_list_url is
  'Endereco da lista de ruas com CEP publicada pela prefeitura ou pelos Correios.';

notify pgrst, 'reload schema';

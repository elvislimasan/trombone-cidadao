-- 181_rental_contracts_number_and_optional_fields.sql
--
-- Numero/ano do contrato + link para o portal, e fim da obrigatoriedade de
-- proprietario e data de inicio.
--
-- POR QUE O NUMERO DO CONTRATO
--
-- "Imovel alugado por R$ 4.000/mes" e uma denuncia; "contrato 042/2025,
-- link para o portal da transparencia" e uma denuncia que a pessoa consegue
-- conferir sozinha. O numero e o ano sao como a prefeitura indexa o contrato
-- — sem eles, quem quer o documento original tem que adivinhar o termo de
-- busca. O link e opcional porque nem toda prefeitura publica o PDF, e
-- guardar o numero ja vale mesmo sem ele.
--
-- Numero e text, nao inteiro: "042/2025", "SEMAD-12/2024" e "12-A" sao todos
-- formatos reais de numeracao municipal. Ano e int porque so tem um formato.
--
-- POR QUE SOLTAR O NOT NULL
--
-- owner_name e start_date eram obrigatorios desde a 148. Na pratica, o
-- embaixador descobre o imovel antes de descobrir o contrato: ve o predio
-- alugado, sabe o valor pelo portal, e nao faz ideia de quem e o dono nem de
-- quando comecou. O NOT NULL nao produzia dados melhores — produzia um
-- cadastro que nunca era feito, ou um "Nao informado" digitado a mao no lugar
-- do nome. NULL diz a verdade e a tela ja sabe exibir "Nao informado".
--
-- monthly_value continua obrigatorio: e o unico campo sem o qual o registro
-- nao serve para nada (o ponto inteiro da tela e somar quanto se gasta).

alter table public.rental_property_contracts
  add column if not exists contract_number text,
  add column if not exists contract_year   integer,
  add column if not exists contract_url    text;

alter table public.rental_property_contracts
  alter column owner_name drop not null,
  alter column start_date drop not null;

notify pgrst, 'reload schema';

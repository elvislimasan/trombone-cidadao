-- 162_rental_properties_title.sql
-- Campo Título: passa a ser o texto principal exibido na listagem, mapa,
-- página de detalhes e PDF no lugar do endereço/secretaria. department
-- continua existindo como informação complementar (Secretaria responsável).

alter table public.rental_properties add column if not exists title text;

-- Backfill dos registros existentes: usa a secretaria já cadastrada ou,
-- na falta dela, o endereço, para não deixar nenhuma linha sem título.
update public.rental_properties
set title = coalesce(department, address)
where title is null;

alter table public.rental_properties alter column title set not null;

notify pgrst, 'reload schema';

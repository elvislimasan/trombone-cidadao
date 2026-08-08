-- 163_bairros_unique_per_city.sql
-- bairros_name_key era UNIQUE (name) global -- resquício de quando só existia
-- Floresta. Com nacionalização, nomes comuns como "Centro" existem em toda
-- cidade, e criar um bairro repetido em outra cidade falhava com
-- "duplicate key value violates unique constraint bairros_name_key".
-- Troca para único por (lower(name), city_id): mesmo nome pode existir em
-- cidades diferentes, mas continua bloqueando duplicata dentro da mesma cidade.

alter table public.bairros drop constraint if exists bairros_name_key;

create unique index if not exists uq_bairros_name_city
  on public.bairros (lower(name), city_id);

notify pgrst, 'reload schema';

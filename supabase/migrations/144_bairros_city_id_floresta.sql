-- 144_bairros_city_id_floresta.sql
-- Nacionaliza a tabela bairros: adiciona city_id e popula os bairros já
-- existentes com o id de Floresta (PE), pois toda a base legada de bairros é
-- de Floresta (o app foi construído inicialmente só para essa cidade).
--
-- O id de Floresta é resolvido pelo nome + UF (sem hardcode), então funciona
-- igual em dev e prod. Novos bairros de outras cidades devem gravar o city_id
-- correspondente.

alter table public.bairros
  add column if not exists city_id bigint references public.cities(id);

create index if not exists idx_bairros_city_id on public.bairros (city_id);

-- Backfill: bairros sem city_id → Floresta (PE)
update public.bairros b
set city_id = fl.id
from (
  select c.id
  from public.cities c
  join public.states st on st.id = c.state_id
  where lower(c.name) = 'floresta' and upper(st.uf) = 'PE'
  limit 1
) fl
where b.city_id is null;

notify pgrst, 'reload schema';

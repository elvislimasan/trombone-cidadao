-- O endereço das broncas antigas usa "Bomba" como bairro de Floresta (PE).
-- DNER já está cadastrado como "São Francisco de Assis (DNER)".
insert into public.bairros (name, city_id)
select 'Bomba', c.id
from public.cities c
join public.states s on s.id = c.state_id
where lower(c.name) = 'floresta'
  and upper(s.uf) = 'PE'
  and not exists (
    select 1 from public.bairros b
    where b.city_id = c.id and lower(b.name) = 'bomba'
  );

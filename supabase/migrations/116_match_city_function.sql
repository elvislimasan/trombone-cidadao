-- 116: função match_city(nome, uf) -> city_id
-- Idempotente: CREATE OR REPLACE.
-- Validada no spike §0.1: 99,96% de cobertura (5571/5573 cidades).
-- Retorna NULL se nenhum match ou se ambíguo (>1 resultado com a mesma UF).
-- STABLE: resultado não muda dentro de uma query.
-- SECURITY INVOKER (padrão): só lê tabelas de referência públicas.

create or replace function public.match_city(p_name text, p_uf text)
returns bigint
language sql
stable
as $$
  select case
           when count(*) = 1 then min(c.id)
           else null
         end
  from public.cities c
  join public.states s on s.id = c.state_id
  where unaccent(lower(trim(c.name))) = unaccent(lower(trim(p_name)))
    and upper(trim(s.uf)) = upper(trim(p_uf));
$$;

grant execute on function public.match_city(text, text) to anon, authenticated, service_role;

notify pgrst, 'reload schema';

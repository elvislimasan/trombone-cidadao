-- 120: remove duplicata tipográfica de São Vicente Ferrer-PE
-- O seed da 115 inseriu 'São Vicente Férrer' (com acento) enquanto o dump PROD
-- já tinha 'São Vicente Ferrer' (sem acento). O unaccent os iguala, causando colisão
-- no UNIQUE index. Este fix remove o intruso (sem referências em reports/profiles).
-- Idempotente: DELETE WHERE NOT EXISTS + DO nada se já removido.

do $$
begin
  -- Remove a grafia com acento; mantém a sem acento (id canônico do IBGE)
  delete from public.cities
  where name = 'São Vicente Férrer'
    and state_id = (select id from public.states where uf = 'PE')
    and not exists (
      select 1 from public.reports   where city_id = cities.id union all
      select 1 from public.profiles  where city_id = cities.id
    );
end;
$$;

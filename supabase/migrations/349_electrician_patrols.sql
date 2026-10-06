-- Patrulha profissional usa a mesma sessão, percurso privado e fila offline
-- do cidadão. Poste (bigint) não é report (uuid), portanto guarda listas próprias.
alter table public.patrols
  add column if not exists lighting_patrol boolean not null default false,
  add column if not exists lighting_passed_pole_ids bigint[] not null default '{}',
  add column if not exists lighting_updated_pole_ids bigint[] not null default '{}';

alter table public.patrols drop constraint if exists patrols_lighting_poles;
alter table public.patrols add constraint patrols_lighting_poles check (
  lighting_updated_pole_ids <@ lighting_passed_pole_ids
  and array_position(lighting_passed_pole_ids, null) is null
  and array_position(lighting_updated_pole_ids, null) is null
  and (lighting_patrol or (cardinality(lighting_passed_pole_ids) = 0
    and cardinality(lighting_updated_pole_ids) = 0))
);

create index if not exists patrols_lighting_user_recent_idx
  on public.patrols (user_id, ended_at desc) where lighting_patrol;

-- As policies existentes restringem escrita e percurso ao próprio usuário.
-- As ordens/visitas continuam nas RPCs profissionais com suas autorizações.
notify pgrst, 'reload schema';

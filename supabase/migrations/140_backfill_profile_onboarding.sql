-- 140_backfill_profile_onboarding.sql
-- Evita que o novo gate de "perfil completo" (telefone + cidade + termos) tranque
-- usuários que JÁ existiam antes desta feature. Faz backfill a partir do metadata
-- de auth.users (onde o cadastro antigo gravava phone/city_id/state_id) e marca os
-- termos como aceitos na data de criação da conta.
--
-- Só toca em linhas onde a coluna está nula (não sobrescreve dados existentes).

-- phone / city_id / state_id a partir do raw_user_meta_data
update public.profiles p
set
  phone    = coalesce(p.phone,    nullif(u.raw_user_meta_data->>'phone', '')),
  city_id  = coalesce(p.city_id,  (nullif(u.raw_user_meta_data->>'city_id', ''))::bigint),
  state_id = coalesce(p.state_id, (nullif(u.raw_user_meta_data->>'state_id', ''))::bigint)
from auth.users u
where u.id = p.id
  and (p.phone is null or p.city_id is null or p.state_id is null);

-- Termos: quem já tinha conta é considerado como tendo aceitado (na criação).
update public.profiles p
set terms_accepted_at = coalesce(p.terms_accepted_at, u.created_at, now())
from auth.users u
where u.id = p.id
  and p.terms_accepted_at is null;

notify pgrst, 'reload schema';

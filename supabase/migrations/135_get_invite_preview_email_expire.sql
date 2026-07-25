-- 135_get_invite_preview_email_expire.sql
-- get_invite_preview: adiciona e-mail mascarado ao retorno e marca convites
-- vencidos como 'expired' ao serem lidos. Vira VOLATILE por causa do UPDATE.

drop function if exists public.get_invite_preview(text);

create or replace function public.get_invite_preview(p_token text)
returns table (
  city_name            text,
  city_uf              text,
  invited_by_name      text,
  invited_email_masked text,
  expires_at           timestamptz
)
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  -- Marca como expirado se venceu e ainda está pending
  update public.ambassador_invites
  set status = 'expired'
  where token = p_token and status = 'pending' and expires_at <= now();

  return query
  select
    c.name,
    coalesce(st.uf, ''),
    coalesce(p.name, 'um master'),
    case
      when ai.invited_email is null or position('@' in ai.invited_email) = 0 then null
      else
        left(split_part(ai.invited_email, '@', 1), 1) || '••@' ||
        left(split_part(ai.invited_email, '@', 2), 1) || '••.' ||
        reverse(split_part(reverse(ai.invited_email), '.', 1))
    end,
    ai.expires_at
  from public.ambassador_invites ai
  join public.cities c on c.id = ai.city_id
  left join public.states st on st.id = c.state_id
  left join public.profiles p on p.id = ai.invited_by
  where ai.token = p_token
    and ai.status = 'pending'
    and ai.expires_at > now()
  limit 1;
end;
$$;

grant execute on function public.get_invite_preview(text) to anon, authenticated;

notify pgrst, 'reload schema';

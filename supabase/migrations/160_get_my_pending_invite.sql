-- 160_get_my_pending_invite.sql
-- RPC para o usuário autenticado descobrir se tem um convite de embaixador
-- pendente para o próprio e-mail. Resolve o caso de o usuário perder o
-- sessionStorage do redirect pós-login (fechou a aba, confirmou e-mail em
-- outro dispositivo, logou pela tela normal em vez de voltar ao link) —
-- sem essa RPC não há como avisar na Home, já que a RLS de SELECT em
-- ambassador_invites só libera para master/admin ou quem sabe o token exato.

create or replace function public.get_my_pending_invite()
returns table (
  token      text,
  city_name  text,
  city_uf    text,
  expires_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  my_email text;
begin
  select email into my_email from auth.users where id = auth.uid();
  if my_email is null then
    return;
  end if;

  return query
  select
    ai.token,
    c.name::text,
    coalesce(st.uf, '')::text,
    ai.expires_at
  from public.ambassador_invites ai
  join public.cities c on c.id = ai.city_id
  left join public.states st on st.id = c.state_id
  where ai.status = 'pending'
    and ai.expires_at > now()
    and lower(ai.invited_email) = lower(my_email)
  order by ai.created_at desc
  limit 1;
end;
$$;

grant execute on function public.get_my_pending_invite() to authenticated;

notify pgrst, 'reload schema';

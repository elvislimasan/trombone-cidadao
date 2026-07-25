-- Função pública para preview de convite de embaixador.
-- Retorna dados mínimos (cidade + quem convidou) sem expor token ou dados sensíveis.
-- SECURITY DEFINER para poder ler ambassador_invites mesmo sem RLS de SELECT anônimo.

create or replace function public.get_invite_preview(p_token text)
returns table (
  city_name       text,
  city_uf         text,
  invited_by_name text,
  expires_at      timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    c.name                                    as city_name,
    coalesce(st.uf, '')                       as city_uf,
    coalesce(p.name, 'um master')             as invited_by_name,
    ai.expires_at
  from public.ambassador_invites ai
  join public.cities c on c.id = ai.city_id
  left join public.states st on st.id = c.state_id
  left join public.profiles p on p.id = ai.invited_by
  where ai.token = p_token
    and ai.status = 'pending'
    and ai.expires_at > now()
  limit 1;
$$;

-- Permitir chamada anônima (anon role)
grant execute on function public.get_invite_preview(text) to anon, authenticated;

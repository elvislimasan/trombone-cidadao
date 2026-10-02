-- O token valido identifica o destinatario e permite escolher login ou cadastro.
-- A atribuicao do papel continua exclusiva de aceitar_convite_prefeitura,
-- que confere o e-mail autenticado antes de criar o vinculo.
create or replace function public.preview_acesso_convite_prefeitura(p_token uuid)
returns table (
  prefeitura_nome text,
  cidade_nome text,
  cidade_uf text,
  email_convidado text,
  conta_existente boolean,
  expires_at timestamptz
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p.nome, c.name, s.uf, i.email_convidado,
    exists (
      select 1 from auth.users u
      where lower(u.email) = lower(i.email_convidado)
    ),
    i.expires_at
  from public.prefeitura_convites i
  join public.prefeituras p on p.id = i.prefeitura_id and p.status = 'ativa'
  join public.cities c on c.id = p.city_id
  left join public.states s on s.id = c.state_id
  where i.token = p_token and i.status = 'pendente' and i.expires_at > now()
  limit 1
$$;

revoke all on function public.preview_acesso_convite_prefeitura(uuid) from public;
grant execute on function public.preview_acesso_convite_prefeitura(uuid) to anon, authenticated;

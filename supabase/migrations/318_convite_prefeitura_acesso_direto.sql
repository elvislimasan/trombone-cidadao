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
  where i.token = p_token
    and (
      (i.status = 'pendente' and i.expires_at > now())
      or (i.status = 'aceito' and i.aceito_por = auth.uid())
    )
  limit 1
$$;

revoke all on function public.preview_acesso_convite_prefeitura(uuid) from public;
grant execute on function public.preview_acesso_convite_prefeitura(uuid) to anon, authenticated;

-- Reabrir o link ou repetir a chamada apos uma resposta de rede perdida
-- devolve sucesso para a mesma conta, sem criar outro vinculo.
create or replace function public.aceitar_convite_prefeitura(p_token uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_convite public.prefeitura_convites%rowtype;
  v_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
begin
  if auth.uid() is null then raise exception 'Entre na sua conta para ativar o acesso'; end if;
  if public.is_admin(auth.uid()) or public.is_master(auth.uid()) then
    raise exception 'Administradores da plataforma nao entram no painel operacional';
  end if;

  select * into v_convite
  from public.prefeitura_convites
  where token = p_token
  for update;
  if not found then raise exception 'Convite invalido ou expirado'; end if;
  if v_email <> lower(v_convite.email_convidado) then
    raise exception 'Este convite pertence a outro e-mail';
  end if;
  if v_convite.status = 'aceito' and v_convite.aceito_por = auth.uid() then
    return jsonb_build_object('ok', true, 'prefeitura_id', v_convite.prefeitura_id);
  end if;
  if v_convite.status <> 'pendente' or v_convite.expires_at <= now() then
    raise exception 'Convite invalido ou expirado';
  end if;

  insert into public.prefeitura_membros (
    prefeitura_id, user_id, papel, ativo, convidado_por
  ) values (
    v_convite.prefeitura_id, auth.uid(), v_convite.papel_prefeitura, true, v_convite.convidado_por
  )
  on conflict (prefeitura_id, user_id) do update
    set papel = excluded.papel, ativo = true, updated_at = now();

  if v_convite.canal_id is not null then
    insert into public.orgao_membros (canal_id, user_id, papel, ativo, convidado_por)
    values (v_convite.canal_id, auth.uid(), v_convite.papel_orgao, true, v_convite.convidado_por)
    on conflict (canal_id, user_id) do update
      set papel = excluded.papel, ativo = true, updated_at = now();
  end if;

  update public.prefeitura_convites
  set status = 'aceito', aceito_por = auth.uid(), aceito_em = now()
  where id = v_convite.id;

  return jsonb_build_object('ok', true, 'prefeitura_id', v_convite.prefeitura_id);
end;
$$;

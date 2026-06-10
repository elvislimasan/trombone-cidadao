-- Garante "1 device = 1 conta" para push notifications.
-- O token FCM é por dispositivo. Ao logar, a conta atual "reivindica" o token:
-- vincula o token a si mesma e remove esse mesmo token de qualquer OUTRA conta,
-- evitando que um device receba notificações de contas diferentes.
--
-- SECURITY DEFINER porque precisa deletar linhas de OUTROS user_id (a RLS normal
-- só permite o usuário mexer nas próprias linhas). A função é segura: usa
-- auth.uid() como dono e só toca em linhas com o token informado.

create or replace function public.claim_fcm_token(p_token text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Não autenticado';
  end if;

  if p_token is null or length(trim(p_token)) = 0 then
    raise exception 'Token vazio';
  end if;

  -- 1) Remover este token de QUALQUER OUTRA conta (uso anterior no mesmo device).
  delete from public.push_subscriptions
   where subscription_details->>'token' = p_token
     and user_id <> v_uid;

  -- 2) Vincular/atualizar o token para a conta atual.
  --    A tabela tem UNIQUE(user_id); upsert mantém uma linha por usuário.
  insert into public.push_subscriptions (user_id, subscription_details, updated_at)
  values (
    v_uid,
    jsonb_build_object('type', 'fcm', 'token', p_token),
    now()
  )
  on conflict (user_id)
  do update set
    subscription_details = jsonb_build_object('type', 'fcm', 'token', p_token),
    updated_at = now();
end;
$$;

-- Remover o token FCM do device da conta atual (usado no logout).
-- SECURITY DEFINER por consistência; só remove a própria linha.
create or replace function public.release_fcm_token(p_token text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    return; -- sem sessão, nada a fazer
  end if;

  if p_token is not null and length(trim(p_token)) > 0 then
    -- Remover só a linha desta conta com este token específico
    delete from public.push_subscriptions
     where user_id = v_uid
       and subscription_details->>'token' = p_token;
  else
    -- Sem token informado: remover a(s) linha(s) FCM desta conta
    delete from public.push_subscriptions
     where user_id = v_uid
       and subscription_details->>'type' = 'fcm';
  end if;
end;
$$;

grant execute on function public.claim_fcm_token(text) to authenticated;
grant execute on function public.release_fcm_token(text) to authenticated;

notify pgrst, 'reload schema';

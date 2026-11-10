begin;

-- Dados de autenticação ficam fora da lista operacional de pipeiros.
-- A consulta exige gestão da secretaria do vínculo, inclusive para pipeiros
-- desativados. Nunca retorna senha, hash, tokens ou metadados de autenticação.
create function public.pipa_driver_login_details(p_driver uuid) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare d public.pipa_drivers; result jsonb;
begin
  select * into d from public.pipa_drivers where id=p_driver;
  if not found or not public.pipa_can(d.channel_id,'manage') then
    raise exception 'Sem permissão para consultar o login deste pipeiro.' using errcode='42501';
  end if;
  if d.user_id is null then raise exception 'Este pipeiro ainda não possui login.'; end if;
  select jsonb_build_object('user_id',u.id,'email',nullif(u.email,''),
    'name',coalesce(nullif(p.name,''),nullif(u.raw_user_meta_data->>'name',''),nullif(u.raw_user_meta_data->>'full_name','')),
    'phone',coalesce(nullif(p.phone,''),nullif(u.phone,''))) into result
  from auth.users u left join public.profiles p on p.id=u.id where u.id=d.user_id;
  if result is null then raise exception 'O login vinculado não está disponível.'; end if;
  return result;
end $$;
revoke all on function public.pipa_driver_login_details(uuid) from public,anon;
grant execute on function public.pipa_driver_login_details(uuid) to authenticated;

notify pgrst,'reload schema';
commit;

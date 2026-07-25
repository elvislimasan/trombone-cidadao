-- 133_approve_ambassador_application.sql
-- Aprova uma candidatura: ativa o embaixador, marca approved e notifica o candidato.

create or replace function public.approve_ambassador_application(p_app_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_app   public.ambassador_applications%rowtype;
  v_city  text;
begin
  -- Só gestor (master/admin) pode aprovar
  if not (
    public.is_master(auth.uid())
    or coalesce((select is_admin from public.profiles where id = auth.uid() limit 1), false)
  ) then
    raise exception 'not_authorized';
  end if;

  select * into v_app from public.ambassador_applications
  where id = p_app_id and status = 'pending';
  if not found then
    raise exception 'application_not_found_or_not_pending';
  end if;

  -- Ativa o embaixador (idempotente por user_id+city_id)
  insert into public.ambassador_cities (user_id, city_id, status)
  values (v_app.user_id, v_app.city_id, 'active')
  on conflict (user_id, city_id) do update set status = 'active';

  update public.ambassador_applications
  set status = 'approved', reviewed_by = auth.uid(), reviewed_at = now()
  where id = p_app_id;

  select name into v_city from public.cities where id = v_app.city_id;
  insert into public.notifications (user_id, type, title, message, link, is_read, created_at)
  values (
    v_app.user_id,
    'ambassador_application',
    'Você é embaixador! 🎉',
    'Sua candidatura para embaixador de ' || coalesce(v_city, 'sua cidade') || ' foi aprovada.',
    '/embaixador',
    false,
    now()
  );
end;
$$;

grant execute on function public.approve_ambassador_application(bigint) to authenticated;

notify pgrst, 'reload schema';

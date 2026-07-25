-- 136_fix_application_notification_link.sql
-- Corrige o link da notificação de nova candidatura: a rota real da página de
-- gestão de embaixadores é /admin/embaixadores (a 132 usava /admin/masters, que
-- não existe → 404 ao clicar na notificação).

create or replace function public.notify_admins_new_application()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_city text;
begin
  select name into v_city from public.cities where id = new.city_id;
  insert into public.notifications (user_id, type, title, message, link, is_read, created_at)
  select
    p.id,
    'ambassador_application',
    'Nova candidatura a embaixador',
    'Nova candidatura a embaixador de ' || coalesce(v_city, 'cidade') ||
      ' (' || coalesce(new.applicant_name, 'candidato') || ') aguarda avaliação.',
    '/admin/embaixadores',
    false,
    now()
  from public.profiles p
  where p.is_master = true or p.is_admin = true;
  return new;
end;
$$;

notify pgrst, 'reload schema';

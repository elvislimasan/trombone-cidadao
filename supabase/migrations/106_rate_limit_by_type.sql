-- Rate limit por tipo: o usuário não pode enviar o MESMO tipo de atualização 2x em 7 dias
-- (pode enviar tipos diferentes na mesma semana)

create or replace function public.can_user_submit_update(
  p_user_id   uuid,
  p_report_id uuid,
  p_update_type text default null
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select not exists (
    select 1
    from public.report_updates
    where author_id   = p_user_id
      and report_id   = p_report_id
      and (p_update_type is null or update_type = p_update_type)
      and created_at  > now() - interval '7 days'
  )
$$;

-- Atualizar política para usar rate limit por tipo
drop policy if exists "Authenticated users can insert report updates" on public.report_updates;

create policy "Authenticated users can insert report updates"
  on public.report_updates for insert
  to authenticated
  with check (
    auth.uid() = author_id
    and public.can_user_submit_update(auth.uid(), report_id, update_type)
  );

notify pgrst, 'reload schema';

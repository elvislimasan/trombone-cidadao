-- Função que verifica se o usuário pode enviar uma atualização (1 por semana por bronca)
create or replace function public.can_user_submit_update(p_user_id uuid, p_report_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select not exists (
    select 1
    from public.report_updates
    where author_id = p_user_id
      and report_id = p_report_id
      and created_at > now() - interval '7 days'
  )
$$;

-- Atualizar política de INSERT para aplicar o rate limit
drop policy if exists "Authenticated users can insert report updates" on public.report_updates;

create policy "Authenticated users can insert report updates"
  on public.report_updates for insert
  to authenticated
  with check (
    auth.uid() = author_id
    and public.can_user_submit_update(auth.uid(), report_id)
  );

notify pgrst, 'reload schema';

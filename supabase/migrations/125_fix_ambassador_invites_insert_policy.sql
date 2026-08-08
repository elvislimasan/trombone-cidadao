-- Fix: policy de INSERT em ambassador_invites também permite admins
-- Antes só masters podiam criar convites; admins também devem poder.

drop policy if exists "ambassador_invites_insert" on public.ambassador_invites;
create policy "ambassador_invites_insert"
  on public.ambassador_invites for insert
  with check (
    public.is_master(auth.uid())
    or coalesce((select is_admin from public.profiles where id = auth.uid() limit 1), false)
  );

-- Mesma correção para SELECT e UPDATE, para consistência com ambassador_cities
drop policy if exists "ambassador_invites_select" on public.ambassador_invites;
create policy "ambassador_invites_select"
  on public.ambassador_invites for select
  using (
    public.is_master(auth.uid())
    or coalesce((select is_admin from public.profiles where id = auth.uid() limit 1), false)
    or token = current_setting('app.invite_token', true)
  );

drop policy if exists "ambassador_invites_update" on public.ambassador_invites;
create policy "ambassador_invites_update"
  on public.ambassador_invites for update
  using (
    public.is_master(auth.uid())
    or coalesce((select is_admin from public.profiles where id = auth.uid() limit 1), false)
  );

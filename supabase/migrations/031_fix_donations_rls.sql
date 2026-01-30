-- Fix RLS policy for donations to allow guest users (where user_id is null)
-- and ensure authenticated users can insert their own donations.

drop policy if exists "Users can insert their own donations" on donations;
drop policy if exists "Anyone can insert donations" on donations;

create policy "Anyone can insert donations" on donations 
for insert 
with check (
  (auth.uid() = user_id) OR (user_id IS NULL)
);

-- Ensure we can update our own donations (e.g. to mark as paid in some flows, though usually server-side)
-- But mostly we need to read them.
drop policy if exists "Users can update their own donations" on donations;
create policy "Users can update their own donations" on donations
for update
using (auth.uid() = user_id);

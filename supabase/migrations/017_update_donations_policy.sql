-- Allow users to update their own donations (required for client-side confirmation in Mock flow)
-- In a strict production environment with real payments, status updates should be handled via Webhooks (Edge Functions) with service_role key.
-- But for this phase, we allow the client to confirm the mock donation.

drop policy if exists "Users can update own donations" on donations;
create policy "Users can update own donations" on donations for update using (auth.uid() = user_id);

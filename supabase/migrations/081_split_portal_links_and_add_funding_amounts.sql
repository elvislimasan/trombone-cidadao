alter table public.public_work_measurements
add column if not exists contract_portal_link text,
add column if not exists bidding_process_portal_link text,
add column if not exists funding_amount_federal numeric,
add column if not exists funding_amount_state numeric,
add column if not exists funding_amount_municipal numeric;

update public.public_work_measurements
set contract_portal_link = portal_link
where contract_portal_link is null and portal_link is not null;

update public.public_work_measurements
set bidding_process_portal_link = portal_link
where bidding_process_portal_link is null and portal_link is not null;

alter table public.public_work_measurements
add column if not exists contract_number text,
add column if not exists bidding_process_number text,
add column if not exists portal_link text;


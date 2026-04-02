alter table public.public_work_payments
add column if not exists portal_auth_code text;

comment on column public.public_work_payments.portal_auth_code is 'Código de autenticidade do portal (usado para identificar importações/páginas distintas).';

create index if not exists public_work_payments_measurement_auth_code_idx
on public.public_work_payments (measurement_id, portal_auth_code);

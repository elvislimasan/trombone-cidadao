alter table public.public_work_payments
add column if not exists commitment_type text;

comment on column public.public_work_payments.commitment_type is 'Tipo de empenho (Estimativo, Extra Orçamentário, Global, Ordinário).';

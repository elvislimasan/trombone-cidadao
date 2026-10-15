begin;

alter table public.public_work_payments
  add column contractor_id uuid references public.contractors(id) on delete set null,
  add column measurement_pdf_url text,
  add column measurement_date date,
  add column execution_start_date date,
  add column execution_end_date date,
  add constraint payment_execution_period_order check (
    execution_start_date is null or execution_end_date is null or execution_end_date >= execution_start_date
  ),
  add constraint payment_measurement_pdf_http check (
    measurement_pdf_url is null or measurement_pdf_url ~* '^https?://'
  );

comment on column public.public_work_payments.installment is
  'Número do boletim de medição; coluna mantida para preservar dados e importações existentes';
comment on column public.public_work_payments.contractor_id is 'Construtora credora cadastrada';
comment on column public.public_work_payments.measurement_pdf_url is 'PDF público do boletim de medição';
comment on column public.public_work_payments.measurement_date is 'Data opcional do boletim de medição';

create index public_work_payments_contractor_idx on public.public_work_payments(contractor_id);

-- Nomes ambíguos continuam como estavam até a seleção manual da construtora.
with unique_contractors as (
  select lower(trim(name)) as name_key, (array_agg(id))[1] as id
  from public.contractors group by lower(trim(name)) having count(*) = 1
)
update public.public_work_payments p set contractor_id = c.id
from unique_contractors c where lower(trim(p.creditor_name)) = c.name_key;

create function public.sync_payment_creditor_name()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if new.contractor_id is not null then
    select c.name into new.creditor_name from public.contractors c where c.id = new.contractor_id;
  end if;
  return new;
end;
$$;

create trigger sync_payment_creditor_name
  before insert or update of contractor_id, creditor_name on public.public_work_payments
  for each row execute function public.sync_payment_creditor_name();

notify pgrst, 'reload schema';
commit;

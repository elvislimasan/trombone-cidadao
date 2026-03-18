begin;

with works_without_measurements as (
  select w.*
  from public.public_works w
  where not exists (
    select 1
    from public.public_work_measurements m
    where m.work_id = w.id
  )
),
inserted_measurements as (
  insert into public.public_work_measurements (
    work_id,
    contractor_id,
    title,
    status,
    execution_percentage,
    predicted_start_date,
    start_date,
    end_date,
    expected_end_date,
    service_order_date,
    contract_signature_date,
    inauguration_date,
    stalled_date,
    expected_value,
    amount_spent,
    execution_period_days,
    funding_source
  )
  select
    w.id,
    w.contractor_id,
    'Fase Atual',
    coalesce(w.status, 'planned'),
    w.execution_percentage,
    w.predicted_start_date,
    w.start_date,
    w.end_date,
    w.expected_end_date,
    w.service_order_date,
    w.contract_signature_date,
    w.inauguration_date,
    w.stalled_date,
    w.total_value,
    w.amount_spent,
    w.execution_period_days,
    coalesce(w.funding_source, '{}'::text[])
  from works_without_measurements w
  returning work_id, id
),
latest_measurement_per_work as (
  select distinct on (m.work_id)
    m.work_id,
    m.id as measurement_id
  from public.public_work_measurements m
  order by m.work_id, m.created_at desc
),
target_measurement_per_work as (
  select i.work_id, i.id as measurement_id
  from inserted_measurements i
  union all
  select l.work_id, l.measurement_id
  from latest_measurement_per_work l
  where not exists (
    select 1
    from inserted_measurements i
    where i.work_id = l.work_id
  )
)
update public.public_work_media wm
set
  measurement_id = tm.measurement_id,
  gallery_name = coalesce(nullif(trim(wm.gallery_name), ''), 'Galeria Geral')
from target_measurement_per_work tm
where
  wm.work_id = tm.work_id
  and wm.measurement_id is null;

commit;

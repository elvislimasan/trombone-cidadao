alter table public.poles
  add column if not exists source_key text;

create unique index if not exists poles_dataset_source_key_uniq
  on public.poles (dataset_id, source_key);

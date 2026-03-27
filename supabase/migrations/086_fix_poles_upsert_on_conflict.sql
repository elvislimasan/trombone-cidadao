drop index if exists public.poles_dataset_source_key_uniq;

create unique index if not exists poles_dataset_source_key_uniq
  on public.poles (dataset_id, source_key);

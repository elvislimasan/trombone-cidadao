alter table public.reports
add column if not exists is_anonymous boolean not null default false;

create index if not exists reports_is_anonymous_idx on public.reports (is_anonymous);

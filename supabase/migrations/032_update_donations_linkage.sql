-- Allow donations to be linked to either a report or a petition
-- 1) Make report_id nullable
-- 2) Add petition_id reference

alter table donations
  alter column report_id drop not null;

alter table donations
  add column if not exists petition_id uuid references petitions(id) on delete cascade;


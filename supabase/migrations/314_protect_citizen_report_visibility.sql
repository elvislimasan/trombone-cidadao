begin;

-- Vincular uma bronca a uma ordem de serviço não transfere sua origem.
-- Valida o estado final inclusive quando outros gatilhos alteram a linha.
create or replace function public.protect_citizen_report_visibility()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'UPDATE'
     and new.created_by_municipality is distinct from old.created_by_municipality then
    raise exception 'A origem municipal da bronca não pode ser alterada';
  end if;

  if new.created_by_municipality is null
     and (new.is_public is not true or new.moderation_status = 'internal') then
    raise exception 'Broncas de cidadãos não podem ser tornadas internas pela prefeitura';
  end if;

  return new;
end;
$$;

drop trigger if exists protect_citizen_report_visibility on public.reports;
create trigger protect_citizen_report_visibility
  after insert or update on public.reports
  for each row execute function public.protect_citizen_report_visibility();

notify pgrst, 'reload schema';
commit;

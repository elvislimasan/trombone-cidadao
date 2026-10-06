-- Execute após a migração 314. A tabela temporária isola os testes dos dados reais.
begin;
create temporary table report_visibility_fixture (
  id integer primary key,
  created_by_municipality uuid,
  is_public boolean default true,
  moderation_status text default 'approved'
);
create trigger protect_citizen_report_visibility
  after insert or update on report_visibility_fixture
  for each row execute function public.protect_citizen_report_visibility();

insert into report_visibility_fixture (id) values (1);
insert into report_visibility_fixture (id, created_by_municipality)
values (2, '00000000-0000-0000-0000-000000000001');

do $$
declare statement text;
begin
  foreach statement in array array[
    'update report_visibility_fixture set is_public=false where id=1',
    'update report_visibility_fixture set moderation_status=''internal'' where id=1',
    'update report_visibility_fixture set is_public=false, moderation_status=''internal'' where id=1',
    'insert into report_visibility_fixture (id, moderation_status) values (3, ''internal'')',
    'insert into report_visibility_fixture (id, is_public) values (3, false)',
    'update report_visibility_fixture set created_by_municipality=''00000000-0000-0000-0000-000000000001'', is_public=false, moderation_status=''internal'' where id=1',
    'update report_visibility_fixture set created_by_municipality=null where id=2'
  ] loop
    begin
      execute statement;
      raise exception 'Operação indevida foi aceita: %', statement using errcode='XX000';
    exception when raise_exception then
      if sqlerrm not in (
        'A origem municipal da bronca não pode ser alterada',
        'Broncas de cidadãos não podem ser tornadas internas pela prefeitura'
      ) then raise; end if;
    end;
  end loop;
end;
$$;

-- Moderação regular e publicação municipal continuam funcionando.
update report_visibility_fixture set moderation_status='pending_approval' where id=1;
update report_visibility_fixture set moderation_status='approved' where id=1;
update report_visibility_fixture set is_public=false, moderation_status='internal' where id=2;
update report_visibility_fixture set is_public=true, moderation_status='approved' where id=2;
rollback;

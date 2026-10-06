begin;

alter table public.reports add column if not exists created_by_municipality uuid references public.prefeituras(id) on delete set null;
create index if not exists reports_created_by_municipality_idx on public.reports(created_by_municipality)
where created_by_municipality is not null;

create or replace function public.validate_municipal_report_author()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare v_city bigint;
begin
  if tg_op='UPDATE' and new.created_by_municipality is distinct from old.created_by_municipality then
    raise exception 'A origem municipal da bronca não pode ser alterada';
  end if;
  if new.created_by_municipality is null then return new; end if;
  select city_id into v_city from public.prefeituras
  where id=new.created_by_municipality and status='ativa';
  if v_city is null or new.city_id is distinct from v_city or auth.uid() is null
    or new.author_id is distinct from auth.uid() or not public.pode_acessar_prefeitura(auth.uid(),v_city)
    or not (public.pode_administrar_prefeitura(auth.uid(),v_city) or exists (
      select 1 from public.orgao_membros m join public.orgao_canais c on c.id=m.canal_id
      where m.user_id=auth.uid() and m.ativo and m.papel in ('gestor','operador') and c.city_id=v_city
    )) then raise exception 'Sem permissão para registrar bronca em nome desta prefeitura'; end if;
  new.moderation_status='approved';
  new.is_anonymous=false;
  return new;
end $$;
drop trigger if exists zzzz_validate_municipal_report_author on public.reports;
create trigger zzzz_validate_municipal_report_author before insert or update of created_by_municipality
on public.reports for each row execute function public.validate_municipal_report_author();
notify pgrst,'reload schema';
commit;

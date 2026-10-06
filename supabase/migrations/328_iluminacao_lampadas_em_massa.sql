begin;

create or replace function public.atualizar_lampadas_postes_em_massa(
  p_city_id bigint, p_identifiers text[], p_lamp_type text, p_power_w numeric, p_apply boolean default false
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  v_codes text[]; v_missing text[]; v_count integer; v_locked integer := 0; v_pole public.poles%rowtype;
begin
  if not public.pode_acessar_prefeitura(auth.uid(),p_city_id) or not (
    public.pode_administrar_prefeitura(auth.uid(),p_city_id) or exists (
      select 1 from public.orgao_membros m
      join public.orgao_canais c on c.id=m.canal_id
      join public.orgao_categorias oc on oc.canal_id=c.id and oc.category_id='iluminacao'
      where m.user_id=auth.uid() and m.ativo and m.papel='gestor' and c.city_id=p_city_id
    )
  ) then raise exception 'Somente gestores de iluminação podem alterar postes'; end if;
  select array_agg(distinct btrim(code)) into v_codes
  from unnest(p_identifiers) code where nullif(btrim(code),'') is not null;
  if coalesce(cardinality(v_codes),0) not between 1 and 1000 then
    raise exception 'Informe de 1 a 1000 números de poste'; end if;
  if p_lamp_type not in ('LED','Vapor de sódio','Vapor de mercúrio','Iodetos metálicos',
    'Fluorescente','Fluorescente compacta','Incandescente','Mista') then
    raise exception 'Tipo de lâmpada inválido'; end if;
  if p_power_w is null or p_power_w <= 0 or p_power_w > 999999.99 then
    raise exception 'Potência inválida'; end if;
  select array_agg(code) into v_missing from unnest(v_codes) code
  where not exists (select 1 from public.poles p where p.city_id=p_city_id
    and p.identifier=code and p.lighting_status is distinct from 'removido');
  select count(*) into v_count from public.poles p where p.city_id=p_city_id
    and p.identifier=any(v_codes) and p.lighting_status is distinct from 'removido';
  if v_missing is not null or v_count<>cardinality(v_codes) then
    return jsonb_build_object('matched',v_count,'requested',cardinality(v_codes),
      'missing',coalesce(v_missing,'{}'::text[]),'duplicate_numbers',v_count<>cardinality(v_codes));
  end if;
  if p_apply then
    for v_pole in select * from public.poles p where p.city_id=p_city_id
      and p.identifier=any(v_codes) and p.lighting_status is distinct from 'removido'
      order by p.id for update loop
      v_locked := v_locked + 1;
      if v_pole.lamp_type is distinct from p_lamp_type or v_pole.lamp_power_w is distinct from p_power_w then
        update public.poles set lamp_type=p_lamp_type,lamp_power_w=p_power_w,
          updated_at=clock_timestamp() where id=v_pole.id;
        insert into public.pole_lighting_changes(pole_id,city_id,pole_number,address,
          old_power_w,new_power_w,old_lamp_type,new_lamp_type,old_status,new_status,action,changed_by)
        values(v_pole.id,p_city_id,v_pole.identifier,v_pole.address,v_pole.lamp_power_w,p_power_w,
          v_pole.lamp_type,p_lamp_type,v_pole.lighting_status,v_pole.lighting_status,'updated',auth.uid());
      end if;
    end loop;
    if v_locked <> v_count then raise exception 'A lista de postes mudou. Confira novamente antes de aplicar.'; end if;
  end if;
  return jsonb_build_object('matched',v_count,'requested',cardinality(v_codes),
    'missing','[]'::jsonb,'duplicate_numbers',false);
end $$;
revoke all on function public.atualizar_lampadas_postes_em_massa(bigint,text[],text,numeric,boolean) from public,anon;
grant execute on function public.atualizar_lampadas_postes_em_massa(bigint,text[],text,numeric,boolean) to authenticated;
notify pgrst,'reload schema';
commit;

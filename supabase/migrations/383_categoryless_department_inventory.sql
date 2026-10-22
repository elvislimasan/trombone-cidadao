begin;

-- Secretarias dedicadas a mapas e inventários podem existir sem categorias de
-- atendimento. Sem categorias, o convite aceita apenas o cargo de inventário.
create or replace function public.convidar_funcionario_secretaria(p_prefeitura uuid,p_canal uuid,p_email text,p_cargos text[])
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare result jsonb; v_role text;
begin
  perform public.validate_staff_roles(p_cargos,p_canal);
  if not exists(select 1 from public.orgao_categorias where canal_id=p_canal)
    and p_cargos is distinct from array['inventario']::text[] then
    raise exception 'Secretarias sem categorias permitem somente o cargo de responsável pelo inventário.';
  end if;
  v_role=case when 'gestor'=any(p_cargos) then 'gestor' when 'atendente'=any(p_cargos) then 'operador' when 'executor'=any(p_cargos) then 'eletricista' else 'leitura' end;
  result=public.convidar_funcionario_municipal(p_prefeitura,p_canal,p_email,v_role,'{}');
  update public.prefeitura_convites set staff_access=public.derive_department_staff_access(p_cargos,p_canal) where token=(result->>'token')::uuid;
  return result;
end $$;
revoke all on function public.convidar_funcionario_secretaria(uuid,uuid,text,text[]) from public,anon;
grant execute on function public.convidar_funcionario_secretaria(uuid,uuid,text,text[]) to authenticated;

notify pgrst,'reload schema';
commit;

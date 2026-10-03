begin;

alter table public.pole_lighting_changes
  add column if not exists descricao_servico text;

create or replace function public.atualizar_poste_eletricista(
  p_prefeitura uuid,
  p_poste_id bigint,
  p_poste_atualizado_em timestamptz,
  p_status text,
  p_descricao text
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_city bigint;
  v_pole public.poles%rowtype;
  v_updated public.poles%rowtype;
  v_description text := btrim(coalesce(p_descricao, ''));
begin
  select city_id into v_city from public.prefeituras
    where id = p_prefeitura and status = 'ativa';
  if auth.uid() is null or v_city is null
    or not public.pode_acessar_prefeitura(auth.uid(), v_city)
    or not exists (
      select 1 from public.orgao_membros m
      join public.orgao_canais c on c.id = m.canal_id
      join public.orgao_categorias oc on oc.canal_id = c.id and oc.category_id = 'iluminacao'
      where m.user_id = auth.uid() and m.ativo and m.papel = 'eletricista'
        and c.city_id = v_city
    ) then
    raise exception 'Acesso reservado aos eletricistas de iluminação desta prefeitura';
  end if;
  if p_status is null or p_status not in ('aceso', 'apagado', 'manutencao') then
    raise exception 'Situação inválida para o poste';
  end if;
  if length(v_description) < 5 or length(v_description) > 1000 then
    raise exception 'Descreva o que foi feito em 5 a 1000 caracteres';
  end if;

  select * into v_pole from public.poles
    where id = p_poste_id and city_id = v_city for update;
  if v_pole.id is null or v_pole.lighting_status = 'removido' then
    raise exception 'Poste ativo não encontrado nesta cidade';
  end if;
  if v_pole.updated_at is distinct from p_poste_atualizado_em then
    raise exception 'O poste mudou. Reabra o cadastro antes de salvar.' using errcode = '40001';
  end if;

  update public.poles set lighting_status = p_status, updated_at = clock_timestamp()
    where id = v_pole.id returning * into v_updated;
  insert into public.pole_lighting_changes (
    pole_id, city_id, pole_number, address, old_power_w, new_power_w,
    old_lamp_type, new_lamp_type, old_status, new_status, action, changed_by,
    descricao_servico
  ) values (
    v_pole.id, v_city, coalesce(v_pole.identifier, v_pole.plate, v_pole.id::text),
    v_pole.address, v_pole.lamp_power_w, v_updated.lamp_power_w,
    v_pole.lamp_type, v_updated.lamp_type, v_pole.lighting_status, p_status,
    'updated', auth.uid(), v_description
  );
  return jsonb_build_object('id', v_updated.id, 'lighting_status', v_updated.lighting_status,
    'updated_at', v_updated.updated_at);
end;
$$;

revoke all on function public.atualizar_poste_eletricista(uuid,bigint,timestamptz,text,text) from public, anon;
grant execute on function public.atualizar_poste_eletricista(uuid,bigint,timestamptz,text,text) to authenticated;

notify pgrst, 'reload schema';
commit;

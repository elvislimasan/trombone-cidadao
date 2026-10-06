begin;

-- A prévia usa a mesma referência da solicitação que a ordem após o aceite.
-- A consulta de ofertas autoriza o acesso sem atribuir ou alterar o serviço.
create function public.poste_oferta_eletricista(p_prefeitura uuid,p_tipo text,p_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare
  oferta record;
  relato public.reports%rowtype;
  poste public.poles%rowtype;
  cidade bigint;
  localizacao extensions.geography;
  poste_id bigint;
begin
  if p_tipo is null or p_id is null then raise exception 'Oferta inválida'; end if;
  select o.* into oferta from public.listar_ofertas_eletricista(
    p_prefeitura,1,0,p_tipo,p_id) o;
  if not found then return null; end if;
  select p.city_id into cidade from public.prefeituras p where p.id=p_prefeitura;

  if p_tipo='solicitacao' then
    select r.* into relato from public.reports r where r.id=p_id and r.city_id=cidade;
  else
    select r.* into relato from public.demanda_broncas b
      join public.reports r on r.id=b.report_id and r.city_id=cidade
      where b.demanda_id=p_id and r.status is distinct from 'resolved'
      order by b.created_at,r.id limit 1;
    if relato.id is null then
      select r.* into relato from public.demandas_municipais d
        join public.reports r on r.id=d.report_id and r.city_id=cidade where d.id=p_id;
    end if;
  end if;

  localizacao=relato.location::extensions.geography;
  if localizacao is null and oferta.latitude is not null and oferta.longitude is not null then
    localizacao=extensions.st_setsrid(extensions.st_makepoint(oferta.longitude,oferta.latitude),4326)::extensions.geography;
  end if;
  poste_id=relato.pole_id;
  if poste_id is null and relato.id is null then poste_id=oferta.pole_id; end if;
  if poste_id is null and localizacao is not null then
    select p.id into poste_id from public.poles p
      where p.city_id=cidade and p.geom is not null
        and p.lighting_status is distinct from 'removido'
      order by p.geom operator(extensions.<->) localizacao,p.id limit 1;
  end if;
  poste_id=coalesce(poste_id,oferta.pole_id);
  select p.* into poste from public.poles p where p.id=poste_id and p.city_id=cidade;
  return jsonb_build_object('pole_id',poste.id,'identifier',poste.identifier,'plate',poste.plate,
    'reported_post_identifier',relato.reported_post_identifier,
    'reported_plate',relato.reported_plate,'pole_number',relato.pole_number,
    'nearby',poste.id is not null and relato.pole_id is null
      and (relato.id is not null or oferta.pole_id is null));
end $$;
revoke all on function public.poste_oferta_eletricista(uuid,text,uuid) from public,anon;
grant execute on function public.poste_oferta_eletricista(uuid,text,uuid) to authenticated;

notify pgrst,'reload schema';
commit;

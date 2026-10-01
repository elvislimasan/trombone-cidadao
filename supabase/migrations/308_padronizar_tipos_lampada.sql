-- Mantém o texto original no registro de origem e padroniza somente valores reconhecidos.
with original as (
  select id, lamp_type,
    regexp_replace(
      translate(upper(btrim(lamp_type)), 'ÁÀÂÃÉÊÍÓÔÕÚÜÇ', 'AAAAEEIOOOUUC'),
      '[[:space:]]+', ' ', 'g'
    ) as nome
  from public.poles
  where lamp_type is not null and btrim(lamp_type) <> ''
), mapped as (
  select id, lamp_type,
    case
      when nome = 'TEST' then null
      when nome = 'LED' or nome like 'LAMPADA DE LED%' then 'LED'
      when nome like 'VAPOR DE SODIO%' or nome like 'LAMPADA DE VAPOR DE SODIO%' then 'Vapor de sódio'
      when nome like 'VAPOR DE MERCURIO%' or nome like 'LAMPADA DE VAPOR DE MERCURIO%' then 'Vapor de mercúrio'
      when nome like 'IODO% METALIC%' or nome like 'VAPOR METALIC%' then 'Iodetos metálicos'
      when nome like 'FLUORESCENTE COMPACTA%' then 'Fluorescente compacta'
      when nome like 'FLUORESCENTE%' then 'Fluorescente'
      when nome like 'INCANDESCENTE%' then 'Incandescente'
      when nome like 'MISTA%' then 'Mista'
      else lamp_type
    end as standard_type
  from original
)
update public.poles p
set lamp_type = m.standard_type,
    raw_properties = coalesce(p.raw_properties, '{}'::jsonb)
      || jsonb_build_object('lamp_type_original', p.lamp_type)
from mapped m
where p.id = m.id and p.lamp_type is distinct from m.standard_type;

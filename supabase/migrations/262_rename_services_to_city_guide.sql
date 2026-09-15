-- O menu passa a apresentar a seção unificada pelo nome que a página já usa.
-- Preserva rótulos personalizados pelo administrador.
update public.site_config
set menu_settings = jsonb_set(
  menu_settings,
  '{items}',
  (
    select jsonb_agg(
      case
        when item->>'path' = '/servicos' and item->>'name' = 'Serviços'
          then jsonb_set(item, '{name}', to_jsonb('Guia da Cidade'::text))
        else item
      end
      order by ordinality
    )
    from jsonb_array_elements(menu_settings->'items') with ordinality as entries(item, ordinality)
  )
)
where jsonb_typeof(menu_settings->'items') = 'array'
  and exists (
    select 1 from jsonb_array_elements(menu_settings->'items') as entries(item)
    where item->>'path' = '/servicos' and item->>'name' = 'Serviços'
  );

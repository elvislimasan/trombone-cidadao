-- Atualiza apenas o nome padrao antigo. Se o administrador ja escolheu outro
-- rotulo para /agora, a personalizacao permanece intacta.
UPDATE public.site_config
SET menu_settings = jsonb_set(
  menu_settings,
  '{items}',
  (
    SELECT jsonb_agg(
      CASE
        WHEN item->>'path' = '/agora' AND item->>'name' = 'Agora'
          THEN jsonb_set(item, '{name}', to_jsonb('Radar da cidade'::text))
        ELSE item
      END
      ORDER BY ordinality
    )
    FROM jsonb_array_elements(menu_settings->'items') WITH ORDINALITY AS entries(item, ordinality)
  )
)
WHERE jsonb_typeof(menu_settings->'items') = 'array'
  AND EXISTS (
    SELECT 1
    FROM jsonb_array_elements(menu_settings->'items') AS entries(item)
    WHERE item->>'path' = '/agora'
      AND item->>'name' = 'Agora'
  );

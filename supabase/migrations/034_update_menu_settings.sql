
UPDATE site_config
SET menu_settings = jsonb_set(
  menu_settings,
  '{items}',
  (
    SELECT jsonb_agg(
      CASE 
        WHEN existing_item IS NOT NULL THEN existing_item
        ELSE default_item
      END
    )
    FROM jsonb_array_elements('[
      {"name": "Início", "path": "/", "icon": "LayoutDashboard", "isVisible": true},
      {"name": "Sobre", "path": "/sobre", "icon": "Info", "isVisible": true},
      {"name": "Estatísticas", "path": "/estatisticas", "icon": "BarChart2", "isVisible": true},
      {"name": "Obras", "path": "/obras-publicas", "icon": "Construction", "isVisible": true},
      {"name": "Pavimentação", "path": "/mapa-pavimentacao", "icon": "Route", "isVisible": true},
      {"name": "Serviços", "path": "/servicos", "icon": "Briefcase", "isVisible": true},
      {"name": "Abaixo-Assinados", "path": "/abaixo-assinados", "icon": "FileSignature", "isVisible": true},
      {"name": "Notícias", "path": "/noticias", "icon": "Newspaper", "isVisible": true}
    ]'::jsonb) AS default_item
    LEFT JOIN LATERAL (
      SELECT value AS existing_item
      FROM jsonb_array_elements(site_config.menu_settings->'items')
      WHERE value->>'path' = default_item->>'path'
    ) ON true
  )
)
WHERE id = 1;

-- Categoria "Seguranca", vinda do guia de pins do mapa.
--
-- O id segue o padrao das demais (slug sem acento: buracos, iluminacao,
-- esgoto...), porque e ele que CATEGORY_ICON_MAP e CATEGORY_PIN_TOKEN usam para
-- resolver o icone e a cor do pin em src/design-system/icons/index.js.
--
-- A coluna `icon` guarda EMOJI, nao nome de icone: HomePage-improved.jsx
-- renderiza o valor direto como texto (<span>{r.categoryIcon}</span>), entao um
-- 'shield' apareceria como a palavra literal. O icone vetorial do pin vem do
-- design system, nao daqui.
--
-- ON CONFLICT DO NOTHING mantem a migracao idempotente: rodar de novo (ou em um
-- banco que ja recebeu a linha por outro caminho) nao falha nem sobrescreve.
insert into public.categories (id, name, icon)
values ('seguranca', 'Segurança', '🛡️')
on conflict (id) do nothing;

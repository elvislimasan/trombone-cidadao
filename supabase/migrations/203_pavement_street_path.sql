-- O traçado da rua, para o mapa deixar de marcá-la com um ponto.
--
-- POR QUE PONTO NÃO SERVIA
--
-- Cada rua tinha só `location`, um POINT, desenhado como um disco de 40 px
-- ancorado no centro. Numa cidade que cabe em 3 km, quatrocentos discos cobrem
-- o mapa inteiro no zoom de cidade — e o mapa de PAVIMENTAÇÃO é justamente o
-- que precisa mostrar corredores: onde o asfalto acaba, e por quantos
-- quarteirões.
--
-- POR QUE MULTILINESTRING E NÃO LINESTRING
--
-- Uma rua quase nunca é uma `way` só no OpenStreetMap: ela se parte a cada
-- mudança de atributo, e uma rua cortada por uma praça vira dois pedaços
-- separados de verdade. Emendar tudo numa linha só desenharia um trecho que não
-- existe, atravessando a praça.
--
-- POR QUE COLUNA E NÃO TABELA
--
-- A mesma razão da 202: neste projeto as policies de RLS vivem no painel do
-- Supabase e não no git, então cada tabela nova é mais uma regra invisível ao
-- código. Na própria linha, o traçado herda exatamente a permissão da rua — que
-- é a regra certa, e é a que já está escrita nas migrações 152 e 153.

alter table public.pavement_streets
  add column if not exists path extensions.geometry(multilinestring, 4326),
  add column if not exists path_source text;

comment on column public.pavement_streets.path is
  'Traçado da via em WGS84. Nulo quando não foi encontrado; o mapa cai no ponto de location.';
comment on column public.pavement_streets.path_source is
  'Origem do traçado: osm (importado do OpenStreetMap) ou manual (corrigido à mão). A importação em massa nunca sobrescreve manual.';

notify pgrst, 'reload schema';

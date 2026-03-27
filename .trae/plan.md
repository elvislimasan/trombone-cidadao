# Plano de integração KMZ (FLORESTA.kmz) → Postes → Broncas de iluminação

## Objetivo
Extrair dados do arquivo `FLORESTA.kmz`, persistir no Supabase (Postgres/PostGIS) e usar esses dados para:
- Vincular broncas de iluminação pública a um poste real (`pole_id`) em vez de depender só de texto (`pole_number`).
- Melhorar UX (sugestão automática do poste mais próximo + confirmação).
- Enriquecer o app com inteligência: deduplicação, histórico por poste, mapa/analytics de postes problemáticos.

## Premissas do app atual (o que já existe)
- O app usa Supabase no front e Edge Functions em `supabase/functions`.
- Existe fluxo de criação de bronca (ReportModal) que já coleta `location` e tem `pole_number` (texto livre).
- A aplicação usa mapas com React Leaflet e coordenadas em torno de Floresta-PE.
- Coordenadas são enviadas para o banco como WKT `POINT(lng lat)` em um campo chamado `location` (na tabela de reports).

## 1) Entender o conteúdo do KMZ (fase “descoberta de schema”)
Antes de modelar definitivo, precisamos “tipar” o que vem dentro do KMZ.

Checklist de descoberta:
- O KMZ é um ZIP: identificar quais arquivos existem dentro (geralmente 1+ `.kml` e possivelmente ícones).
- Dentro do KML, identificar:
  - Quais `Placemark` representam postes (pontos).
  - Como vem o identificador (nome do poste, plaqueta, “número do poste”, etc.).
  - Se existem `ExtendedData`/`SchemaData` com chaves úteis (ex.: bairro, logradouro, código).
  - Se o KML tem múltiplas camadas/`Folder` (p.ex. “Postes”, “Rede”, etc.).
- Padronizar coordenadas:
  - KML usa WGS84 (lon,lat). Validar se não há inversão e se o conjunto bate com Floresta-PE.

Saída desta fase:
- Um mapeamento de “campos relevantes” do KML → colunas normalizadas do banco.
- Definição de como identificar unicamente cada poste.

## 2) Modelo de dados no Supabase

### 2.1 Tabela `pole_datasets` (versão/linha do tempo de importação)
Finalidade: permitir reimportar o KMZ no futuro, manter rastreabilidade e apoiar auditoria.

Campos sugeridos:
- `id` (bigint identity)
- `name` (text) — ex.: “FLORESTA 2026-03”
- `source` (text) — ex.: “KMZ prefeitura”, “concessionária”
- `storage_path` (text) — caminho no Storage do Supabase para o KMZ/KML armazenado
- `content_hash` (text) — hash do arquivo (para detectar duplicidade)
- `created_at` (timestamptz)
- `created_by` (uuid, FK para `auth.users` via profile)

Regras:
- Leitura: admin (ou só backoffice).
- Escrita: somente admin/serviço.

### 2.2 Tabela `poles` (postes normalizados)
Finalidade: a “tabela de postes” de verdade, que o app consulta para sugerir e vincular.

Campos sugeridos:
- `id` (bigint identity)
- `dataset_id` (bigint, FK `pole_datasets.id`)
- `source_layer` (text) — nome de pasta/camada do KML, se existir
- `source_feature_id` (text) — algum ID do KML, se existir
- `identifier` (text) — identificador principal (número do poste / código / nome)
- `plate` (text) — plaqueta, se existir
- `address` (text) — se existir no KML (não obrigatório)
- `geom` (geography(Point, 4326)) — para busca espacial eficiente
- `latitude` (double precision) — opcional (pode ser redundante com `geom`, mas facilita debug)
- `longitude` (double precision)
- `raw_properties` (jsonb) — todos os campos do KML (ExtendedData etc.)
- `imported_at` (timestamptz)
- `updated_at` (timestamptz)

Índices/constraints:
- `gist (geom)` para busca por proximidade.
- Unique parcial conforme descobrirmos o “identificador real”:
  - se existir um identificador confiável: `unique(dataset_id, identifier)`
  - se não existir: `unique(dataset_id, longitude, latitude)` (com tolerância via arredondamento ou um “geohash”/grid)

RLS:
- Leitura: liberada para usuários autenticados (ou para público, se a UX exigir sugerir poste antes do login).
- Escrita: somente service role / função de importação.

### 2.3 Integração com broncas: estender `reports`
A tabela `reports` já existe no produto (mesmo que a migration de criação não esteja neste export). A integração deve ser “aditiva”, sem quebrar o app.

Campos novos sugeridos:
- `pole_id` (bigint, FK `poles.id`, nullable)
- `reported_post_identifier` (text, nullable) — quando usuário digitou um número/identificador
- `reported_plate` (text, nullable)
- `issue_type` (text, nullable) — subtipo específico de iluminação (lista controlada)
- `reported_pole_distance_m` (integer, nullable) — opcional, distância no momento da seleção

Compatibilidade:
- Manter `pole_number` (já usado hoje no formulário) como “campo legado”; gradualmente migrar UI para preencher `reported_post_identifier`.

Enum/validação para `issue_type` (sugestão inicial):
- `lamp_off`, `lamp_blinking`, `lamp_on_daytime`, `no_lighting`, `arm_damaged`, `exposed_wiring`, `pole_leaning`, `pole_broken`, `no_identifier`, `other`

## 3) Pipeline de importação do KMZ (duas abordagens)

### Abordagem A (rápida e robusta): script de importação “offline” (Node)
Ideal para a 1ª versão: importa uma vez e estabiliza o schema.

Fluxo:
- Criar um script em `scripts/` que:
  - Abre o KMZ (ZIP) e extrai o(s) KML.
  - Faz parse do KML (XML) e extrai pontos (`Placemark/Point`).
  - Normaliza campos (`identifier`, `plate`, `raw_properties`) com base no mapeamento descoberto.
  - Faz upsert no Supabase (via service role local) em lotes.

Prós:
- Simples de implementar, sem limitações de runtime do Edge.
- Melhor para iterar no “mapeamento” dos campos do KML.

Contras:
- Requer execução manual (workflow de admin/engenharia).

### Abordagem B (produto completo): upload + Edge Function de importação
Depois que a A estabilizar o formato, evoluir para uma rotina gerenciável pelo app.

Fluxo:
- Admin faz upload do `FLORESTA.kmz` para um bucket (ex.: `pole-datasets`).
- Edge Function `import-poles-from-kmz`:
  - Baixa o KMZ do Storage.
  - Extrai KML e parseia.
  - Cria/atualiza `pole_datasets`.
  - Upsert em `poles`.
  - Registra estatísticas e erros em uma tabela `pole_import_runs` (opcional).

Observação:
- Em Edge Functions (Deno), a escolha de libs para ZIP/XML precisa ser validada (ou implementar parse mínimo).

## 4) Consultas inteligentes (PostGIS) para “poste mais próximo”

### 4.1 RPC para buscar postes próximos
Criar uma função SQL no banco (RPC) para o front chamar:
- Entrada: `lat`, `lng`, `radius_m`, `limit`
- Saída: lista ordenada por distância com:
  - `pole_id`, `identifier`, `plate`, `distance_m`, `latitude`, `longitude`

Query base (conceito):
- `ST_DWithin(p.geom, user_point, radius_m)` + `ORDER BY ST_Distance(...) ASC`

### 4.2 Backfill automático (opcional)
Uma rotina SQL (ou Edge Function administrativa) para preencher `pole_id` em reports antigos:
- Para reports de categoria “iluminação” (ou com `pole_number` preenchido) e com `location` válido:
  - Seleciona poste mais próximo dentro de um raio (ex.: 30–60m).
  - Preenche `pole_id` e `reported_pole_distance_m`.
  - Não sobrescreve se `pole_id` já existir.

## 5) UX: fluxo ideal no app (sem fricção)

### 5.1 No wizard “Local” (ReportModal)
Quando o usuário marca a localização:
- Front chama RPC “postes próximos”.
- Mostra 1º candidato e 2–3 alternativas (lista curta).
- Usuário confirma:
  - “É este poste” → salva `pole_id` + `reported_pole_distance_m`
  - “Nenhum destes” → usuário digita identificador/plaqueta → salva em `reported_post_identifier`/`reported_plate`

Detalhes de UX que enriquecem:
- Mostrar marcador do poste no mapa (e um “link visual” para o ponto clicado).
- Exibir “distância aproximada” (ex.: 12m) para aumentar confiança.
- Se o usuário negar o poste sugerido repetidamente, aumentar raio ou mostrar lista maior.

### 5.2 Seleção por busca (quando o usuário sabe o número)
Adicionar uma busca por `identifier`/`plate`:
- Usuário digita → autocompleta postes (limitado por proximidade ou por bairro/área).
- Útil quando GPS está impreciso ou endereço é rural.

## 6) “Inteligência” que melhora o Trombone (além do vínculo)

### 6.1 Deduplicação e sugestões
Ao selecionar um poste:
- Buscar broncas abertas recentes nesse `pole_id` (mesmo `issue_type`).
- Se existir:
  - Sugerir apoiar/acompanhar em vez de criar outra bronca (ou anexar como atualização).

### 6.2 Histórico por poste
Em detalhes do report e/ou tela do poste:
- “Histórico deste poste” (últimas N broncas, status, datas).
- Ajuda usuário a ver padrão e aumenta pressão/visibilidade.

### 6.3 Mapa operacional (admin)
Um mapa com layer de postes:
- Postes com muitas ocorrências ficam “mais quentes”.
- Filtros: por `issue_type`, `status`, período, raio.
- Export de lista para equipe de campo (CSV/GeoJSON).

### 6.4 Qualidade de dados
Coletar métricas:
- % de broncas de iluminação com `pole_id` preenchido.
- % de confirmações vs preenchimento manual.
- Distribuição de distâncias na confirmação (indica qualidade do GPS/dados).

## 7) Segurança e políticas (RLS)
Recomendação prática:
- `poles`: leitura para usuários autenticados (ou público se o app permitir bronca sem login); escrita só por service role.
- `pole_datasets`: somente admin.
- RPC de “nearest poles”: pode ser exposta para leitura; limitar `radius_m` e `limit` para evitar scraping pesado.

## 8) Performance (mapa e banco)
- Índice espacial GiST em `poles.geom` é obrigatório.
- Front deve buscar postes só quando necessário:
  - Ao escolher local, buscar candidatos (lista pequena).
  - Para renderizar layer de postes, carregar por bounding box (viewport) e com “clusterização” (se for mostrar muitos).

## 9) Sequência de execução recomendada (implementação incremental)
1. Descobrir campos e formato real do KML dentro do KMZ e definir identificador único.
2. Criar migrations: `pole_datasets`, `poles`, colunas novas em `reports`, índices e RPC.
3. Implementar importador (começar pela Abordagem A) e popular `poles`.
4. Implementar RPC “postes próximos” e testar manualmente com coordenadas.
5. Atualizar UI do ReportModal (step Local) para sugerir e confirmar poste.
6. Implementar backfill opcional para reports antigos.
7. Adicionar inteligência (dedupe/histórico) e telas admin conforme prioridade.


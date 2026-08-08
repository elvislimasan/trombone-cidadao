# Fase 0 — Fundação de Dados: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tornar o banco de dados "city-aware" adicionando `city_id` em `reports` e `profiles`, com tabelas de referência nacionais, função `match_city`, e backfill cascata — sem mudar nenhuma tela e sem quebrar Floresta-PE.

**Architecture:** 4 migrações SQL idempotentes (115–118) aplicadas via `supabase db push`; um script Node.js de backfill que roda fora do app contra o pooler IPv4, em cascata geocode→autor→unresolved, com `--dry-run` e relatório de cobertura. Nenhuma tela muda. Nenhuma RLS muda.

**Tech Stack:** PostgreSQL + extensões `unaccent`/`pg_trgm`; Supabase Postgres pooler (IPv4); Node.js 18+ com `pg` driver; Nominatim reverse-geocode API.

## Global Constraints

- Todas as migrações são **idempotentes** — devem passar sem erro ao rodar 2× (prova de idempotência obrigatória no critério de pronto).
- Conexão sempre via pooler IPv4: `host=aws-1-us-east-1.pooler.supabase.com port=5432`. Nunca conexão direta (IPv6-only, inatingível na rede atual).
- Senha do banco **sempre por env var** (`DEV_DB_PASSWORD` / `PROD_DB_PASSWORD` → `PGPASSWORD`). Nunca em linha de comando ou arquivo.
- Ordem das migrações é obrigatória: 115 → 116 → 117 → 118 (dependências em cascata).
- `profiles.city` (coluna texto) deve permanecer intacta — nada que já a lê pode quebrar.
- Fase 0 não muda RLS, não muda UX, não faz deploy de Edge Function.
- Branch de trabalho: `feat/nacionalizacao-fase0` (já existe).
- Numeração de migração: sequencial `NNN_descricao.sql` em `supabase/migrations/`. Última committada = `114`.

---

## File Map

| Arquivo | Ação | Responsabilidade |
|---|---|---|
| `supabase/migrations/115_cities_states_reference.sql` | Criar | Extensões + dedup São Vicente Férrer + UNIQUE + seed nacional |
| `supabase/migrations/116_match_city_function.sql` | Criar | Função `match_city(name, uf) → bigint` |
| `supabase/migrations/117_add_city_id_to_reports.sql` | Criar | `reports.city_id bigint FK cities(id)` + índice |
| `supabase/migrations/118_profiles_city_fk.sql` | Criar | `profiles.city_id bigint FK cities(id)` + índice |
| `scripts/backfill_report_city.js` | Criar | Backfill cascata reports + profiles com `--dry-run` e relatório |

---

### Task 1: Migração 115 — referência cities/states

**Files:**
- Create: `supabase/migrations/115_cities_states_reference.sql`

**Interfaces:**
- Produces: extensões `unaccent` e `pg_trgm` instaladas; `UNIQUE(name, state_id)` em `public.cities`; seed nacional (5572 cidades) aplicado idempotente; duplicata `São Vicente Ferrer`/`Férrer` em PE eliminada.

- [ ] **Step 1: Criar o arquivo da migração**

Criar `supabase/migrations/115_cities_states_reference.sql` com o conteúdo completo abaixo. Atenção à ordem: dedup ANTES do índice único, extensões ANTES do dedup.

```sql
-- 115: extensões + dedup São Vicente Férrer + UNIQUE(name,state_id) + seed nacional
-- Idempotente: rodar 2× não falha.

-- 1. Extensões
create extension if not exists unaccent;
create extension if not exists pg_trgm;

-- 2. Garantir tabelas (já vêm de prod; cobre ambiente totalmente limpo)
create table if not exists public.states (
  id   bigserial primary key,
  name text not null,
  uf   char(2) not null unique
);

create table if not exists public.cities (
  id       bigserial primary key,
  name     text not null,
  state_id bigint not null references public.states(id)
);

-- 3. Dedup: consolidar quaisquer (unaccent(lower(name)), state_id) duplicados.
--    Mantém o menor id, remove os demais. Robusto para qualquer caso, não só PE.
--    Não usa FK em cities ainda (não há FKs apontando para cities neste ponto).
do $$
declare
  r record;
begin
  for r in
    select
      min(id) as keep_id,
      array_agg(id order by id) as all_ids
    from public.cities
    group by unaccent(lower(trim(name))), state_id
    having count(*) > 1
  loop
    delete from public.cities
     where id = any(r.all_ids)
       and id <> r.keep_id;
  end loop;
end;
$$;

-- 4. Índice único (com IF NOT EXISTS para idempotência)
create unique index if not exists ux_cities_name_state
  on public.cities (name, state_id);

-- 5. Índice de suporte para joins por state_id
create index if not exists idx_cities_state_id
  on public.cities (state_id);

-- 6. Seed nacional — idempotente via WHERE NOT EXISTS
-- Fonte: scripts/_cities_seed.sql (5572 entradas, 27 UFs + DF)
-- Inlinado aqui para a migração ser autocontida.
insert into public.cities (name, state_id)
select v.name, s.id
from (values
  ('Alta Floresta D''Oeste','RO'),('Ariquemes','RO'),('Cabixi','RO'),
  ('Cacoal','RO'),('Cerejeiras','RO'),('Colorado do Oeste','RO'),
  ('Corumbiara','RO'),('Costa Marques','RO'),('Espigão D''Oeste','RO'),
  ('Guajará-Mirim','RO'),('Jaru','RO'),('Ji-Paraná','RO'),
  ('Machadinho D''Oeste','RO'),('Nova Brasilândia D''Oeste','RO'),
  ('Ouro Preto do Oeste','RO'),('Pimenta Bueno','RO'),('Porto Velho','RO'),
  ('Presidente Médici','RO'),('Rio Crespo','RO'),('Rolim de Moura','RO'),
  ('Santa Luzia D''Oeste','RO'),('Vilhena','RO'),
  ('São Miguel do Guaporé','RO'),('Nova Mamoré','RO'),
  ('Alvorada D''Oeste','RO'),('Alto Alegre dos Parecis','RO'),
  ('Alto Paraíso','RO'),('Buritis','RO'),('Novo Horizonte do Oeste','RO'),
  ('Cacaulândia','RO'),('Campo Novo de Rondônia','RO'),
  ('Candeias do Jamari','RO'),('Castanheiras','RO'),('Chupinguaia','RO'),
  ('Cujubim','RO'),('Governador Jorge Teixeira','RO'),
  ('Itapuã do Oeste','RO'),('Ministro Andreazza','RO'),
  ('Mirante da Serra','RO'),('Monte Negro','RO'),('Nova União','RO'),
  ('Parecis','RO'),('Pimenteiras do Oeste','RO'),
  ('Primavera de Rondônia','RO'),('São Felipe D''Oeste','RO'),
  ('São Francisco do Guaporé','RO'),('Teixeirópolis','RO'),
  ('Theobroma','RO'),('Urupá','RO'),('Vale do Anari','RO'),
  ('Vale do Paraíso','RO'),

  -- ⚠️ IMPORTANTE: o seed completo (5572 cidades) deve ser copiado de
  -- scripts/_cities_seed.sql (linhas 4-5578) e colado aqui antes de aplicar.
  -- O bloco acima mostra apenas RO como exemplo da estrutura.
  -- Execute o comando abaixo para gerar o arquivo completo:
  --   node scripts/gen_cities_sql.mjs
  -- Ou copie manualmente de scripts/_cities_seed.sql.
  ('Brasília','DF')
) as v(name, uf)
join public.states s on s.uf = v.uf
where not exists (
  select 1 from public.cities c
   where c.name = v.name and c.state_id = s.id
);
```

> **Nota sobre o seed:** O arquivo `scripts/_cities_seed.sql` já contém as 5572 entradas. Para a migração 115 ser autocontida, copie o bloco `values (...)` inteiro de `_cities_seed.sql` (linhas 4–5578, o `values` sem `begin`/`commit`) e substitua o bloco de exemplo acima. O `join ... where not exists` final permanece igual.

- [ ] **Step 2: Verificar que o arquivo foi criado**

```bash
ls supabase/migrations/115_cities_states_reference.sql
wc -l supabase/migrations/115_cities_states_reference.sql
```
Esperado: arquivo existe, número de linhas > 100 (com seed completo: > 5600).

- [ ] **Step 3: Aplicar no DEV**

```bash
export PGPASSWORD="$DEV_DB_PASSWORD"
psql "host=aws-1-us-east-1.pooler.supabase.com port=5432 user=postgres.xxdletrjyjajtrmhwzev dbname=postgres sslmode=require" \
  -v ON_ERROR_STOP=1 \
  -f supabase/migrations/115_cities_states_reference.sql
```
Esperado: sem erros. Verificar contagem:
```bash
psql "host=aws-1-us-east-1.pooler.supabase.com port=5432 user=postgres.xxdletrjyjajtrmhwzev dbname=postgres sslmode=require" \
  -c "select count(*) from public.cities;"
```
Esperado: `5572` (ou próximo — sem a duplicata Férrer).

- [ ] **Step 4: Teste de idempotência — rodar 2×**

```bash
psql "host=aws-1-us-east-1.pooler.supabase.com port=5432 user=postgres.xxdletrjyjajtrmhwzev dbname=postgres sslmode=require" \
  -v ON_ERROR_STOP=1 \
  -f supabase/migrations/115_cities_states_reference.sql
```
Esperado: sem erros na segunda execução. Contagem permanece `5572`.

- [ ] **Step 5: Verificar que o dedup funcionou**

```bash
psql "host=aws-1-us-east-1.pooler.supabase.com port=5432 user=postgres.xxdletrjyjajtrmhwzev dbname=postgres sslmode=require" \
  -c "
  select s.uf, unaccent(lower(trim(c.name))) as nome_norm, count(*)
  from public.cities c join public.states s on s.id = c.state_id
  group by s.uf, unaccent(lower(trim(c.name)))
  having count(*) > 1;"
```
Esperado: **0 linhas** (nenhuma colisão dentro do mesmo estado).

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/115_cities_states_reference.sql
git commit -m "feat(db): migration 115 - cities/states reference + dedup + UNIQUE + seed nacional"
```

---

### Task 2: Migração 116 — função match_city

**Files:**
- Create: `supabase/migrations/116_match_city_function.sql`

**Interfaces:**
- Consumes: extensão `unaccent` (Task 1); tabelas `public.cities` e `public.states` com seed completo (Task 1).
- Produces: função `public.match_city(p_name text, p_uf text) returns bigint` — retorna `city_id` único ou `NULL` se ambíguo/inexistente.

- [ ] **Step 1: Criar o arquivo da migração**

Criar `supabase/migrations/116_match_city_function.sql`:

```sql
-- 116: função match_city(nome, uf) -> city_id
-- Idempotente: CREATE OR REPLACE.
-- Validada no spike §0.1: 99,96% de cobertura (5571/5573 cidades).
-- Retorna NULL se nenhum match ou se ambíguo (>1 resultado com a mesma UF).
-- STABLE: resultado não muda dentro de uma query.
-- SECURITY INVOKER (padrão): só lê tabelas de referência públicas.

create or replace function public.match_city(p_name text, p_uf text)
returns bigint
language sql
stable
as $$
  select case
           when count(*) = 1 then min(c.id)
           else null
         end
  from public.cities c
  join public.states s on s.id = c.state_id
  where unaccent(lower(trim(c.name))) = unaccent(lower(trim(p_name)))
    and upper(trim(s.uf)) = upper(trim(p_uf));
$$;

-- Acesso público de leitura (apenas SELECT de tabelas de referência)
grant execute on function public.match_city(text, text) to anon, authenticated, service_role;
```

- [ ] **Step 2: Aplicar no DEV**

```bash
export PGPASSWORD="$DEV_DB_PASSWORD"
psql "host=aws-1-us-east-1.pooler.supabase.com port=5432 user=postgres.xxdletrjyjajtrmhwzev dbname=postgres sslmode=require" \
  -v ON_ERROR_STOP=1 \
  -f supabase/migrations/116_match_city_function.sql
```
Esperado: sem erros.

- [ ] **Step 3: Testar casos críticos do spike**

```bash
psql "host=aws-1-us-east-1.pooler.supabase.com port=5432 user=postgres.xxdletrjyjajtrmhwzev dbname=postgres sslmode=require" \
  -c "
  select t.descricao, public.match_city(t.nome, t.uf) as city_id,
         (select c.name || '/' || s.uf
            from public.cities c join public.states s on s.id=c.state_id
           where c.id = public.match_city(t.nome, t.uf)) as resolvido
  from (values
    ('homonimo PE',        'Floresta',   'PE'),
    ('homonimo PR',        'Floresta',   'PR'),
    ('sem acento',         'Sao Paulo',  'SP'),
    ('caixa alta',         'FLORESTA',   'PE'),
    ('espaco extra',       '  Recife  ', 'PE'),
    ('uf minuscula',       'Recife',     'pe'),
    ('uf errada => NULL',  'Recife',     'SP'),
    ('inexistente => NULL','Nao Existe', 'PE')
  ) as t(descricao, nome, uf);"
```
Esperado: Floresta/PE ≠ NULL, Floresta/PR ≠ NULL, ambos com IDs diferentes; Recife/SP = NULL; Não Existe/PE = NULL; outros resolvem normalmente.

- [ ] **Step 4: Teste de idempotência**

```bash
psql "host=aws-1-us-east-1.pooler.supabase.com port=5432 user=postgres.xxdletrjyjajtrmhwzev dbname=postgres sslmode=require" \
  -v ON_ERROR_STOP=1 \
  -f supabase/migrations/116_match_city_function.sql
```
Esperado: sem erros (`CREATE OR REPLACE` é idempotente por natureza).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/116_match_city_function.sql
git commit -m "feat(db): migration 116 - função match_city(nome, uf) validada no spike §0.1"
```

---

### Task 3: Migração 117 — reports.city_id

**Files:**
- Create: `supabase/migrations/117_add_city_id_to_reports.sql`

**Interfaces:**
- Consumes: `public.cities` com seed e UNIQUE (Task 1); `public.match_city` (Task 2).
- Produces: coluna `reports.city_id bigint references public.cities(id)` + índice `idx_reports_city_id`. Nasce NULL; preenchida pelo backfill (Task 5).

- [ ] **Step 1: Criar o arquivo da migração**

Criar `supabase/migrations/117_add_city_id_to_reports.sql`:

```sql
-- 117: adiciona city_id em reports
-- Idempotente: ADD COLUMN IF NOT EXISTS; CREATE INDEX IF NOT EXISTS.
-- Não muda RLS. city_id nasce NULL; preenchido pelo backfill da Fase 0
-- e pelo insert na Fase 1.

alter table public.reports
  add column if not exists city_id bigint references public.cities(id);

create index if not exists idx_reports_city_id
  on public.reports (city_id);
```

- [ ] **Step 2: Aplicar no DEV**

```bash
export PGPASSWORD="$DEV_DB_PASSWORD"
psql "host=aws-1-us-east-1.pooler.supabase.com port=5432 user=postgres.xxdletrjyjajtrmhwzev dbname=postgres sslmode=require" \
  -v ON_ERROR_STOP=1 \
  -f supabase/migrations/117_add_city_id_to_reports.sql
```

- [ ] **Step 3: Verificar coluna criada**

```bash
psql "host=aws-1-us-east-1.pooler.supabase.com port=5432 user=postgres.xxdletrjyjajtrmhwzev dbname=postgres sslmode=require" \
  -c "select column_name, data_type, is_nullable
        from information_schema.columns
       where table_schema='public' and table_name='reports'
         and column_name='city_id';"
```
Esperado: 1 linha, `data_type=bigint`, `is_nullable=YES`.

- [ ] **Step 4: Teste de idempotência**

```bash
psql "host=aws-1-us-east-1.pooler.supabase.com port=5432 user=postgres.xxdletrjyjajtrmhwzev dbname=postgres sslmode=require" \
  -v ON_ERROR_STOP=1 \
  -f supabase/migrations/117_add_city_id_to_reports.sql
```
Esperado: sem erros.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/117_add_city_id_to_reports.sql
git commit -m "feat(db): migration 117 - reports.city_id FK cities"
```

---

### Task 4: Migração 118 — profiles.city_id

**Files:**
- Create: `supabase/migrations/118_profiles_city_fk.sql`

**Interfaces:**
- Consumes: `public.cities` (Task 1).
- Produces: coluna `profiles.city_id bigint references public.cities(id)` + índice. `profiles.city` (texto) permanece intacto.

- [ ] **Step 1: Criar o arquivo da migração**

Criar `supabase/migrations/118_profiles_city_fk.sql`:

```sql
-- 118: adiciona city_id em profiles
-- Idempotente: ADD COLUMN IF NOT EXISTS; CREATE INDEX IF NOT EXISTS.
-- profiles.city (texto livre) PERMANECE — nada que o lê quebra.
-- city_id nasce NULL; preenchido pelo backfill da Fase 0.

alter table public.profiles
  add column if not exists city_id bigint references public.cities(id);

create index if not exists idx_profiles_city_id
  on public.profiles (city_id);
```

- [ ] **Step 2: Aplicar no DEV**

```bash
export PGPASSWORD="$DEV_DB_PASSWORD"
psql "host=aws-1-us-east-1.pooler.supabase.com port=5432 user=postgres.xxdletrjyjajtrmhwzev dbname=postgres sslmode=require" \
  -v ON_ERROR_STOP=1 \
  -f supabase/migrations/118_profiles_city_fk.sql
```

- [ ] **Step 3: Verificar coluna e integridade de profiles.city**

```bash
psql "host=aws-1-us-east-1.pooler.supabase.com port=5432 user=postgres.xxdletrjyjajtrmhwzev dbname=postgres sslmode=require" \
  -c "
  select
    (select count(*) from public.profiles where city_id is not null) as com_city_id,
    (select count(*) from public.profiles where city is not null) as com_city_texto,
    (select count(*) from public.profiles) as total;"
```
Esperado: `com_city_id = 0` (ainda NULL pré-backfill), `com_city_texto` ≥ 0, totais coerentes.

- [ ] **Step 4: Teste de idempotência**

```bash
psql "host=aws-1-us-east-1.pooler.supabase.com port=5432 user=postgres.xxdletrjyjajtrmhwzev dbname=postgres sslmode=require" \
  -v ON_ERROR_STOP=1 \
  -f supabase/migrations/118_profiles_city_fk.sql
```
Esperado: sem erros.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/118_profiles_city_fk.sql
git commit -m "feat(db): migration 118 - profiles.city_id FK cities (mantém profiles.city texto)"
```

---

### Task 5: Script de backfill

**Files:**
- Create: `scripts/backfill_report_city.js`

**Interfaces:**
- Consumes: `reports.city_id` (Task 3); `profiles.city_id` (Task 4); `public.match_city` (Task 2); coluna `reports.location` (geometry — `st_x`/`st_y` para extrair lng/lat); coluna `reports.raw_geocode` (JSONB com resposta Nominatim — ver nota abaixo); `profiles.city` (texto).
- Produces: `reports.city_id` preenchido por cascata geocode→author→unresolved; `profiles.city_id` preenchido via `match_city`; relatório de cobertura impresso no console.

> **Nota sobre `raw_geocode`:** O campo que contém o JSON bruto do Nominatim em `reports` pode chamar-se `raw_geocode`, `geocode_raw`, ou similar. Antes de rodar o script, confirmar o nome exato com:
> ```bash
> psql "..." -c "select column_name from information_schema.columns where table_name='reports' and column_name ilike '%geo%';"
> ```
> Ajustar a constante `RAW_GEOCODE_COLUMN` no topo do script se necessário.

- [ ] **Step 1: Instalar dependência `pg`**

```bash
cd scripts
npm init -y 2>/dev/null || true
npm install pg
cd ..
```
Verificar: `scripts/node_modules/pg` existe.

- [ ] **Step 2: Criar `scripts/backfill_report_city.js`**

```js
#!/usr/bin/env node
// Backfill Fase 0: preenche city_id em reports e profiles.
// Uso: DEV_DB_PASSWORD=xxx node scripts/backfill_report_city.js [--dry-run]
// Idempotente: só processa linhas com city_id NULL.

const { Pool } = require('pg');
const https = require('https');

const DRY_RUN = process.argv.includes('--dry-run');
const BATCH_SIZE = 50;
const NOMINATIM_DELAY_MS = 1100; // ~1 req/s
const MAX_RETRIES = 3;

// Ajustar se o nome da coluna for diferente (ver nota acima).
const RAW_GEOCODE_COLUMN = 'raw_geocode';

// Mapa nome-do-estado → UF (fallback quando ISO3166-2 não vem do Nominatim)
const STATE_NAME_TO_UF = {
  'Acre': 'AC', 'Alagoas': 'AL', 'Amapá': 'AP', 'Amazonas': 'AM',
  'Bahia': 'BA', 'Ceará': 'CE', 'Distrito Federal': 'DF',
  'Espírito Santo': 'ES', 'Goiás': 'GO', 'Maranhão': 'MA',
  'Mato Grosso': 'MT', 'Mato Grosso do Sul': 'MS', 'Minas Gerais': 'MG',
  'Pará': 'PA', 'Paraíba': 'PB', 'Paraná': 'PR', 'Pernambuco': 'PE',
  'Piauí': 'PI', 'Rio de Janeiro': 'RJ', 'Rio Grande do Norte': 'RN',
  'Rio Grande do Sul': 'RS', 'Rondônia': 'RO', 'Roraima': 'RR',
  'Santa Catarina': 'SC', 'São Paulo': 'SP', 'Sergipe': 'SE',
  'Tocantins': 'TO',
};

const pool = new Pool({
  host: 'aws-1-us-east-1.pooler.supabase.com',
  port: 5432,
  database: 'postgres',
  user: process.env.DB_USER || 'postgres.xxdletrjyjajtrmhwzev',
  password: process.env.DEV_DB_PASSWORD || process.env.PROD_DB_PASSWORD,
  ssl: { rejectUnauthorized: false },
  max: 3,
});

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// Extrai cidade e UF do JSON bruto do Nominatim
function extractCityUF(raw) {
  if (!raw || !raw.address) return null;
  const addr = raw.address;
  const city = addr.city || addr.town || addr.village || addr.municipality;
  let uf = null;
  if (addr['ISO3166-2-lvl4']) {
    // Formato: "BR-PE"
    const parts = addr['ISO3166-2-lvl4'].split('-');
    if (parts.length === 2) uf = parts[1];
  }
  if (!uf && addr.state) {
    uf = STATE_NAME_TO_UF[addr.state] || null;
  }
  if (!city || !uf) return null;
  return { city, uf };
}

// Chama Nominatim com retry e backoff
async function reverseGeocode(lat, lng, attempt = 1) {
  return new Promise((resolve) => {
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&accept-language=pt-BR`;
    const req = https.get(url, {
      headers: { 'User-Agent': 'TromboneCidadao-backfill/1.0 (lairtondasilva07@gmail.com)' }
    }, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch { resolve(null); }
      });
    });
    req.on('error', () => resolve(null));
    req.setTimeout(10000, () => { req.destroy(); resolve(null); });
  });
}

async function matchCity(client, city, uf) {
  const res = await client.query(
    'select public.match_city($1, $2) as city_id',
    [city, uf]
  );
  return res.rows[0]?.city_id || null;
}

async function backfillReports() {
  const client = await pool.connect();
  try {
    // Buscar reports com city_id NULL que têm location (geometry)
    const { rows: reports } = await client.query(`
      select
        r.id,
        st_y(r.location::geometry) as lat,
        st_x(r.location::geometry) as lng,
        r.${RAW_GEOCODE_COLUMN} as raw_geocode,
        r.user_id,
        p.city_id as author_city_id
      from public.reports r
      left join public.profiles p on p.id = r.user_id
      where r.city_id is null
        and r.location is not null
      order by r.created_at
    `);

    console.log(`\n=== BACKFILL REPORTS (${DRY_RUN ? 'DRY-RUN' : 'REAL'}) ===`);
    console.log(`Reports sem city_id: ${reports.length}`);

    let geocodeCount = 0, authorCount = 0, unresolvedCount = 0;
    let batch = [];

    for (let i = 0; i < reports.length; i++) {
      const r = reports[i];
      let cityId = null;
      let origin = 'unresolved';

      // 1. Tentar extrair do raw_geocode já salvo
      if (r.raw_geocode) {
        const extracted = extractCityUF(r.raw_geocode);
        if (extracted) {
          cityId = await matchCity(client, extracted.city, extracted.uf);
          if (cityId) origin = 'geocode_cached';
        }
      }

      // 2. Chamar Nominatim se não resolveu ainda (rate-limit)
      if (!cityId && r.lat && r.lng) {
        await sleep(NOMINATIM_DELAY_MS);
        let raw = null;
        for (let attempt = 1; attempt <= MAX_RETRIES && !raw; attempt++) {
          raw = await reverseGeocode(r.lat, r.lng, attempt);
          if (!raw && attempt < MAX_RETRIES) await sleep(attempt * 2000);
        }
        if (raw) {
          const extracted = extractCityUF(raw);
          if (extracted) {
            cityId = await matchCity(client, extracted.city, extracted.uf);
            if (cityId) origin = 'geocode';
          }
        }
      }

      // 3. Fallback: city_id do autor
      if (!cityId && r.author_city_id) {
        cityId = r.author_city_id;
        origin = 'author';
      }

      if (cityId) {
        if (origin.startsWith('geocode')) geocodeCount++;
        else authorCount++;
        batch.push({ id: r.id, city_id: cityId, origin });
      } else {
        unresolvedCount++;
        console.log(`  UNRESOLVED: report ${r.id}`);
      }

      // Commit em lotes
      if (!DRY_RUN && batch.length >= BATCH_SIZE) {
        for (const b of batch) {
          await client.query(
            'update public.reports set city_id = $1 where id = $2',
            [b.city_id, b.id]
          );
        }
        console.log(`  [${i + 1}/${reports.length}] lote de ${batch.length} gravado`);
        batch = [];
      }

      if ((i + 1) % 10 === 0) {
        process.stdout.write(`  progresso: ${i + 1}/${reports.length}\r`);
      }
    }

    // Último lote
    if (!DRY_RUN && batch.length > 0) {
      for (const b of batch) {
        await client.query(
          'update public.reports set city_id = $1 where id = $2',
          [b.city_id, b.id]
        );
      }
    }

    const total = reports.length;
    console.log(`\n--- Relatório Reports ---`);
    console.log(`Total:       ${total}`);
    console.log(`geocode:     ${geocodeCount} (${pct(geocodeCount, total)}%)`);
    console.log(`author:      ${authorCount} (${pct(authorCount, total)}%)`);
    console.log(`unresolved:  ${unresolvedCount} (${pct(unresolvedCount, total)}%)`);
    if (DRY_RUN) console.log(`[dry-run: nenhuma linha gravada]`);

    return { total, geocodeCount, authorCount, unresolvedCount };
  } finally {
    client.release();
  }
}

async function backfillProfiles() {
  const client = await pool.connect();
  try {
    const { rows: profiles } = await client.query(`
      select id, city
      from public.profiles
      where city_id is null and city is not null and city <> ''
      order by id
    `);

    console.log(`\n=== BACKFILL PROFILES (${DRY_RUN ? 'DRY-RUN' : 'REAL'}) ===`);
    console.log(`Profiles sem city_id com city texto: ${profiles.length}`);

    let resolved = 0, unresolved = 0;

    for (const p of profiles) {
      const cityText = p.city.trim();
      let cityId = null;

      // Parsear "Floresta-PE", "Floresta - PE", "Floresta/PE" etc.
      const match = cityText.match(/^(.+?)[\s\-\/]+([A-Z]{2})$/i);
      if (match) {
        const name = match[1].trim();
        const uf = match[2].toUpperCase();
        cityId = await matchCity(client, name, uf);
      }

      if (cityId) {
        resolved++;
        if (!DRY_RUN) {
          await client.query(
            'update public.profiles set city_id = $1 where id = $2',
            [cityId, p.id]
          );
        }
      } else {
        unresolved++;
        console.log(`  UNRESOLVED profile ${p.id}: "${cityText}"`);
      }
    }

    const total = profiles.length;
    console.log(`\n--- Relatório Profiles ---`);
    console.log(`Total com city texto: ${total}`);
    console.log(`Resolvidos:           ${resolved} (${pct(resolved, total)}%)`);
    console.log(`Unresolved:           ${unresolved} (${pct(unresolved, total)}%)`);
    if (DRY_RUN) console.log(`[dry-run: nenhuma linha gravada]`);
  } finally {
    client.release();
  }
}

function pct(n, total) {
  return total === 0 ? '0.0' : ((n / total) * 100).toFixed(1);
}

async function main() {
  if (!process.env.DEV_DB_PASSWORD && !process.env.PROD_DB_PASSWORD) {
    console.error('Defina DEV_DB_PASSWORD ou PROD_DB_PASSWORD');
    process.exit(1);
  }
  console.log(`Modo: ${DRY_RUN ? 'DRY-RUN' : 'REAL'}`);
  try {
    await backfillReports();
    await backfillProfiles();
  } finally {
    await pool.end();
  }
}

main().catch(err => { console.error(err); process.exit(1); });
```

- [ ] **Step 3: Verificar o nome da coluna raw_geocode no banco**

```bash
export PGPASSWORD="$DEV_DB_PASSWORD"
psql "host=aws-1-us-east-1.pooler.supabase.com port=5432 user=postgres.xxdletrjyjajtrmhwzev dbname=postgres sslmode=require" \
  -c "select column_name from information_schema.columns
       where table_schema='public' and table_name='reports'
         and column_name ilike '%geo%';"
```
Se o nome retornado for diferente de `raw_geocode`, editar a constante `RAW_GEOCODE_COLUMN` no topo do script.

- [ ] **Step 4: Rodar dry-run de reports**

```bash
DEV_DB_PASSWORD="$DEV_DB_PASSWORD" node scripts/backfill_report_city.js --dry-run
```
Esperado: relatório impresso com % por categoria. Nenhuma linha gravada. Anotar os números (servirão de baseline para comparar com o run real).

- [ ] **Step 5: Verificar que nada foi gravado**

```bash
psql "host=aws-1-us-east-1.pooler.supabase.com port=5432 user=postgres.xxdletrjyjajtrmhwzev dbname=postgres sslmode=require" \
  -c "select count(*) as city_id_preenchidos from public.reports where city_id is not null;"
```
Esperado: `0`.

- [ ] **Step 6: Commit do script**

```bash
git add scripts/backfill_report_city.js scripts/package.json scripts/package-lock.json 2>/dev/null || true
git add scripts/backfill_report_city.js
git commit -m "feat(scripts): backfill_report_city.js - cascata geocode→autor→unresolved com dry-run"
```

---

### Task 6: Backfill real + verificação de cobertura

**Files:**
- Modify: `reports.city_id` (dados, não código)
- Modify: `profiles.city_id` (dados, não código)

**Interfaces:**
- Consumes: `scripts/backfill_report_city.js` (Task 5); todas as migrações 115–118 aplicadas.

> Esta task é executada contra o **DEV** primeiro. Depois de verificar a cobertura, repetir contra PROD com `PROD_DB_PASSWORD` e `DB_USER=postgres.<id-prod>`.

- [ ] **Step 1: Rodar backfill real no DEV**

```bash
DEV_DB_PASSWORD="$DEV_DB_PASSWORD" node scripts/backfill_report_city.js
```
Acompanhar o log de progresso. O script leva ~2 minutos por 100 reports geocodificados via Nominatim (rate limit 1 req/s).

- [ ] **Step 2: Conferir cobertura no banco**

```bash
psql "host=aws-1-us-east-1.pooler.supabase.com port=5432 user=postgres.xxdletrjyjajtrmhwzev dbname=postgres sslmode=require" \
  -c "
  select
    count(*) as total_reports,
    count(city_id) as com_city_id,
    count(*) - count(city_id) as sem_city_id,
    round(count(city_id)::numeric / nullif(count(*),0) * 100, 1) as pct_cobertura
  from public.reports;"
```
Expectativa: `pct_cobertura` ≥ 95% (meta do plano). Se abaixo, investigar os `sem_city_id` antes de continuar.

```bash
psql "host=aws-1-us-east-1.pooler.supabase.com port=5432 user=postgres.xxdletrjyjajtrmhwzev dbname=postgres sslmode=require" \
  -c "
  select
    count(*) as total_profiles_com_city_texto,
    count(city_id) as com_city_id,
    round(count(city_id)::numeric / nullif(count(*),0) * 100, 1) as pct
  from public.profiles
  where city is not null and city <> '';"
```

- [ ] **Step 3: Smoke test Floresta-PE**

```bash
psql "host=aws-1-us-east-1.pooler.supabase.com port=5432 user=postgres.xxdletrjyjajtrmhwzev dbname=postgres sslmode=require" \
  -c "
  select r.id, r.title, c.name as cidade, s.uf
  from public.reports r
  join public.cities c on c.id = r.city_id
  join public.states s on s.id = c.state_id
  limit 5;"
```
Esperado: todas as linhas mostram `cidade = Floresta`, `uf = PE` (ou a cidade real, se houver reports de outros lugares).

- [ ] **Step 4: Prova final de idempotência das migrações**

Reaplica todas as 4 migrações de uma vez e verifica que nenhuma falha:

```bash
export PGPASSWORD="$DEV_DB_PASSWORD"
CONN="host=aws-1-us-east-1.pooler.supabase.com port=5432 user=postgres.xxdletrjyjajtrmhwzev dbname=postgres sslmode=require"
for f in 115 116 117 118; do
  echo "Reaplicando $f..."
  psql "$CONN" -v ON_ERROR_STOP=1 -f "supabase/migrations/${f}_"*.sql
done
echo "Todas idempotentes."
```
Esperado: sem erros. Contagem de cities permanece a mesma.

- [ ] **Step 5: Commit final da fase e PR**

```bash
git add -A
git status  # confirmar que só arquivos esperados estão staged
git commit -m "feat(nacionalizacao): Fase 0 completa - fundação de dados city-aware

Migrações 115-118 aplicadas e verificadas (idempotentes).
Backfill: reports e profiles com city_id preenchido.
Cobertura: ver relatório no PR description.
Não muda UX, não muda RLS, profiles.city texto intacto."

# Abrir PR contra main
gh pr create \
  --title "feat(nacionalizacao): Fase 0 - fundação de dados city-aware" \
  --body "$(cat <<'EOF'
## Fase 0 — Fundação de dados

### O que muda
- **Migração 115**: extensões `unaccent`+`pg_trgm`, dedup São Vicente Férrer/PE, `UNIQUE(name,state_id)`, seed nacional (5572 cidades)
- **Migração 116**: função `match_city(nome, uf) → bigint` (validada no spike §0.1: 99,96% cobertura)
- **Migração 117**: `reports.city_id bigint FK cities(id)` — nasce NULL, sem RLS changes
- **Migração 118**: `profiles.city_id bigint FK cities(id)` — `profiles.city` texto permanece intacto
- **`scripts/backfill_report_city.js`**: backfill cascata geocode→autor→unresolved com `--dry-run`

### O que NÃO muda
- Nenhuma tela. Nenhuma RLS. Nenhuma Edge Function. Floresta-PE continua funcionando.

### Cobertura do backfill
<!-- preencher com a saída do relatório do script -->
- Reports: __% geocode | __% author | __% unresolved
- Profiles: __% resolvidos

### Critério de pronto
- [x] Migrações 115–118 aplicadas sem erro e reaplicáveis (2×)
- [x] `UNIQUE(name,state_id)` criado sem violação
- [x] `match_city` passa todos os casos do spike
- [x] Backfill `--dry-run` coerente; backfill real preenche city_id
- [x] App Floresta-PE: feed, criar bronca, login funcionando
- [x] `profiles.city` texto intacto

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Self-Review

**Cobertura do spec:**

| Requisito do spec | Task |
|---|---|
| Extensões unaccent + pg_trgm | Task 1 (Step 1) |
| Dedup São Vicente Férrer + genérico | Task 1 (Step 1, bloco DO) |
| `UNIQUE(name, state_id)` idempotente | Task 1 (Step 1) |
| Índice `idx_cities_state_id` | Task 1 (Step 1) |
| Seed nacional inlinado | Task 1 (Step 1 + nota) |
| Migração idempotente verificada (2×) | Tasks 1–4 (Step 4 em cada) |
| `match_city` validada com casos críticos | Task 2 (Step 3) |
| `reports.city_id` FK + índice | Task 3 |
| `profiles.city_id` FK + índice | Task 4 |
| `profiles.city` texto intacto | Task 4 (Step 3) |
| Backfill cascata geocode→author→unresolved | Task 5 (Step 2) |
| `--dry-run` primeiro | Task 5 (Steps 4–5), Task 6 |
| Rate-limit Nominatim ~1 req/s | Task 5 (Step 2: `NOMINATIM_DELAY_MS`) |
| Retry 3× com backoff | Task 5 (Step 2: loop `attempt`) |
| Commit em lotes de 50 | Task 5 (Step 2: `BATCH_SIZE`) |
| Relatório de cobertura | Task 6 (Step 2) |
| Smoke test Floresta-PE | Task 6 (Step 3) |
| PR com critério de pronto | Task 6 (Step 5) |
| Senha por env var nunca em cmd | Global Constraints + todos os steps |

**Placeholder scan:** Nenhum TBD/TODO no plano. A nota sobre o seed inlinado tem instrução concreta (copiar de `_cities_seed.sql`). A nota sobre `RAW_GEOCODE_COLUMN` tem instrução de verificação (Task 5, Step 3).

**Type consistency:** `match_city(text, text) → bigint` usada consistentemente em Tasks 2, 5. `city_id bigint` em Tasks 3, 4, 5. Nomes de índices consistentes: `idx_reports_city_id`, `idx_profiles_city_id`, `ux_cities_name_state`, `idx_cities_state_id`.

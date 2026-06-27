# Fase 0 — Fundação de dados (design)

> Spec de implementação da Fase 0 do [PLANO_NACIONALIZACAO.md](../../../PLANO_NACIONALIZACAO.md).
> Objetivo: tornar a base "city-aware" **sem mudar nenhuma tela** e **sem quebrar Floresta-PE**.
> Pré-requisito: spike §0.1 concluído — `match_city` validado (99,96% de cobertura). Geocodificação automática é viável.

## Contexto e premissas

- Stack: Supabase Postgres. Migrações numeradas sequencialmente `NNN_descricao.sql` em `supabase/migrations/`. Última committada: `114`. Esta fase ocupa **115–118**.
- DEV já alinhado com PROD (replicação feita nesta sessão). O spike alterou o DEV à mão (extensões, seed nacional, `match_city`); por isso **todas as migrações são idempotentes** — rodam limpo no DEV (que já tem parte) e em PROD (que não tem nada). Fonte de verdade = arquivos versionados.
- Regra de ouro: cada migração é deployável sozinha; o app continua funcionando para Floresta-PE em todas elas. `profiles.city` (texto) é **mantido** durante a transição.
- Fase 0 é **puramente de dados**: não muda UX, não faz deploy de Edge Function, não cria nenhuma restrição de acesso por cidade (isso é Fase 2).

## Arquivos

| Arquivo | Responsabilidade |
|---|---|
| `supabase/migrations/115_cities_states_reference.sql` | Extensões; índices; **dedup** São Vicente Ferrer/Férrer; `UNIQUE(name, state_id)`; seed nacional idempotente. |
| `supabase/migrations/116_match_city_function.sql` | `match_city(name, uf)` validada no spike. |
| `supabase/migrations/117_add_city_id_to_reports.sql` | `reports.city_id` + índice. |
| `supabase/migrations/118_profiles_city_fk.sql` | `profiles.city_id` (mantém `profiles.city` texto). |
| `scripts/backfill_report_city.js` | Backfill de `city_id` em reports + profiles, com relatório de cobertura e `--dry-run`. |

> Reordenação vs. plano original: `match_city` (116) vem **antes** das colunas (117/118) porque é a dependência conceitual delas.

## Migração 115 — referência cities/states

Conteúdo (idempotente):
1. `create extension if not exists unaccent;` / `create extension if not exists pg_trgm;`
2. Garantir `states` e `cities` existem (já vêm de prod; o `if not exists` cobre ambiente limpo).
3. **Dedup obrigatório antes do UNIQUE** — remover a linha duplicada `São Vicente Ferrer`/`São Vicente Férrer`/PE (mesma cidade, achado do spike). Estratégia: manter o menor `id`, repontar quaisquer FKs para ele, apagar o duplicado. Generalizar para qualquer `(unaccent(lower(name)), state_id)` repetido, não só esse caso, para a migração ser robusta em PROD.
4. `create unique index if not exists ux_cities_name_state on public.cities (name, state_id);` — usar índice único (não constraint) com `if not exists` para idempotência.
5. Índice `create index if not exists idx_cities_state_id on public.cities (state_id);`
6. Rodar o seed nacional. **Decisão:** inlinar o conteúdo de `scripts/_cities_seed.sql` dentro da `115` (já idempotente via `where not exists`), para a migração ser **autocontida** — um `supabase db push` aplica tudo numa transação, sem depender de rodar um arquivo solto à parte. O `scripts/_cities_seed.sql` permanece no repo como fonte legível, mas a verdade aplicada é a migração.

⚠️ Risco: o dedup precisa rodar **antes** do índice único, senão a criação do índice falha. Ordem fixa.

## Migração 116 — match_city

```sql
create or replace function public.match_city(p_name text, p_uf text)
returns bigint language sql stable as $$
  select case when count(*) = 1 then min(c.id) else null end
  from public.cities c join public.states s on s.id = c.state_id
  where unaccent(lower(trim(c.name))) = unaccent(lower(trim(p_name)))
    and upper(trim(s.uf)) = upper(trim(p_uf));
$$;
```
- `SECURITY INVOKER` (padrão) — só lê tabelas de referência públicas, não precisa de DEFINER.
- Retorna NULL quando ambíguo/sem match (de propósito → backfill trata como "revisão manual", não chuta).
- `STABLE` (resultado não muda dentro de uma query).

## Migração 117 — reports.city_id

```sql
alter table public.reports add column if not exists city_id bigint references public.cities(id);
create index if not exists idx_reports_city_id on public.reports (city_id);
```
- **Não** mexe em RLS. Adicionar coluna não muda quem lê/escreve `reports`. Nenhuma restrição por cidade nesta fase.
- `city_id` nasce NULL; preenchido pelo backfill (existentes) e, na Fase 1, no insert (novas).

## Migração 118 — profiles.city_id

```sql
alter table public.profiles add column if not exists city_id bigint references public.cities(id);
create index if not exists idx_profiles_city_id on public.profiles (city_id);
```
- `profiles.city` (texto livre) **permanece** — nada que lê o campo antigo quebra.
- Backfill resolve `city_id` a partir de `profiles.city` via `match_city` (precisa de UF; ver tratamento abaixo quando o texto não tiver UF).

## Backfill — `scripts/backfill_report_city.js`

Node script, roda **fora do app**, contra o DEV (depois PROD). Conexão via pooler IPv4, senha por env var (mesmo padrão dos scripts de sync).

### Reports (518) — cascata, registrando a origem
1. **geocode**: reverse-geocode da `location` → extrai cidade/UF do `raw` → `match_city`. Se casar único, usa. *(origem: `geocode`)*
2. **author**: se geocode falhar/ambíguo → `profiles.city_id` do autor. *(origem: `author`)*
3. **unresolved**: se nada resolver → `city_id` fica NULL, registrado no relatório. *(origem: `unresolved`)*

### Extração cidade/UF do `raw` (Nominatim) — sem mudar a Edge Function
- Cidade: `raw.address.city ?? town ?? village ?? municipality` (mesma cascata do `buildAddress`).
- UF: **primário** `raw.address["ISO3166-2-lvl4"]` (`"BR-PE"` → `PE`); **fallback** `raw.address.state` (nome "Pernambuco") convertido por mapa fixo nome→UF dos 27 estados.
- A Edge Function `reverse-geocode` **não muda na Fase 0** (só na Fase 1). O acoplamento ao formato Nominatim fica contido no script.

### Profiles (170)
- Resolver `city_id` a partir de `profiles.city` (texto) via `match_city`. Se o texto for "Floresta-PE" / "Floresta - PE", parsear nome+UF; se não tiver UF parseável, fica `unresolved` no relatório.

### Robustez
- **Idempotente**: só processa linhas com `city_id` NULL. Retomável.
- **Rate-limit**: ~1,1s entre chamadas ao Nominatim.
- **Retry com backoff** (3×) por bronca; após falhar, cai para `author` e segue — nunca trava o lote.
- **Commit em lotes** (a cada 50) + log de progresso.
- **`--dry-run`**: calcula e imprime o relatório **sem gravar**. Rodar dry-run primeiro, revisar, depois rodar real.

### Relatório de cobertura (saída obrigatória)
Ao final, imprimir: total, % via `geocode`, % via `author`, % `unresolved` — para **reports** e **profiles** separadamente. Esse número decide se a Fase 1 entra com auto-geocode confiável ou exige fallback manual obrigatório. Expectativa (broncas todas de Floresta-PE/região): cobertura altíssima — mas confirmada por dado, não suposição.

## Segurança

- Nenhuma policy nova nesta fase. Adicionar coluna não altera RLS existente. Restrição por cidade é Fase 2.
- `cities`/`states`: SELECT público (já são); escrita só por migração/admin.
- `match_city`: `SECURITY INVOKER`, só lê referência pública.
- Backfill roda com credencial de serviço fora do app; nenhum dado de PII exposto além do que já existe.

## Critério de pronto (verificação antes de fechar a fase)

1. Migrações 115–118 aplicadas no DEV sem erro, **e reaplicáveis** (rodar 2× não falha — prova de idempotência).
2. `UNIQUE(name, state_id)` criado sem violação (dedup funcionou).
3. `match_city` retorna os IDs esperados nos casos do spike (Floresta/PE ≠ Floresta/PR, etc.).
4. Backfill `--dry-run` produz relatório de cobertura coerente; backfill real preenche `city_id` e o relatório bate.
5. **App de Floresta-PE continua funcionando** (smoke test: feed, criar bronca, login) — nada de UX mudou.
6. `profiles.city` texto intacto.

## Fora de escopo (fases seguintes)

- Captura de `city_id` no fluxo de criação de bronca + extensão da Edge Function (Fase 1).
- Qualquer restrição/filtro por cidade, RLS por cidade, papéis (Fase 2+).
- Seletor de cidade / fim do hardcode Floresta-PE (Fase 3).

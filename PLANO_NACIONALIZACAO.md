# Plano de Nacionalização — Trombone Cidadão

> Documento estratégico: arquitetura de código + programa de embaixadores + marketing/gestão.
> Base: app hoje é single-city (fixo em **Floresta-PE**). Objetivo: app **nacional**, com conteúdo escopado por cidade e uma rede de **embaixadores** responsáveis por moderar e acompanhar broncas da própria cidade.

Decisões já tomadas (premissas deste plano):
- **Vínculo cidade↔bronca:** geocodificação automática (coordenada/endereço → `city_id`), com backfill das broncas antigas.
- **Poderes do embaixador:** moderar + acompanhar, restrito à(s) cidade(s) dele (mesmo poder do admin atual, com escopo geográfico).
- **Escopo de conteúdo:** detectar a cidade do usuário (GPS na 1ª vez ou cidade do perfil) e filtrar feed/mapa por ela, com opção de trocar de cidade.
- **Hierarquia:** existe um nível de **admin master** acima do admin comum. Só o master aprova/convida embaixadores; embaixadores e admins comuns **não** podem criar outros embaixadores.
- **Aprovação/recrutamento:** master pode aprovar candidaturas **e** gerar **links de convite** (uso único, com escopo de cidade) que promovem o convidado a embaixador automaticamente.
- **Monetização:** assinatura/plano premium vendido **fora do app** (portal web — Stripe/Pix, sem comissão de loja); o app apenas **libera features** de quem já assinou. Público pagante: **embaixadores** (upgrade opcional) **e órgãos/empresas (B2B)**.

---

## 1. Diagnóstico do estado atual

O que já existe e ajuda (não precisa ser criado):
- **Tabela de referência `cities` + `states`** com o Brasil inteiro já semeado em `scripts/_cities_seed.sql` (`cities(name, state_id)` → `states(uf)`).
- **`profiles.city`** (texto livre, vindo do metadata de cadastro) — base para detectar a cidade do usuário.
- **Edge Function `reverse-geocode`** já implantada — reaproveitável para descobrir a cidade a partir da coordenada da bronca.
- **`reports.location` (POINT) + `address`** — toda bronca já nasce com geolocalização.
- **Infra de moderação** madura: tabela `moderation_admins`, triggers de notificação (`notify_admins_new_report`, `notify_report_moderation_update`), página `ModerationPage.jsx`.

O que falta / precisa mudar (as lacunas que este plano resolve):
1. **`reports` não tem `city_id`** — broncas não são escopadas por cidade. *Bloqueador raiz.*
2. **`profiles.city` é texto livre** — não dá pra agrupar/filtrar com confiança. Precisa virar FK para `cities`.
3. **Moderação é global** — todo admin é notificado de toda bronca. Precisa de escopo geográfico.
4. **Papéis são binários** (`is_admin` + `user_type` citizen/public_official) — não existe "embaixador" nem "admin master" (todo admin tem o mesmo poder).
5. **App é hardcoded em Floresta-PE** (`'Floresta-PE'` em `PetitionPage.jsx:477` e afins) — feed/mapa não filtram por cidade.
6. **Não há cobrança/entitlements** — só existe doação (`create-payment-intent` + `donations`). Não há controle de "quem assinou premium" nem liberação de features pagas.

---

## 2. Estratégia de código (faseada)

A regra de ouro: **nada quebra para Floresta-PE durante a migração**. Cada fase é deployável sozinha e o app continua funcionando para a cidade atual em todas elas.

### Fase 0 — Fundação de dados (sem mudança de UX)
*Objetivo: tornar a base "city-aware" sem alterar nenhuma tela.*

- **Migração `115_cities_states_reference.sql`**: garantir `states` e `cities` criadas/indexadas (`UNIQUE(name, state_id)`, índice em `state_id`). Rodar o seed `_cities_seed.sql` se ainda não estiver em produção.
- **Migração `116_add_city_id_to_reports.sql`**:
  - `ALTER TABLE reports ADD COLUMN city_id BIGINT REFERENCES cities(id);`
  - Índice `idx_reports_city_id`.
- **Migração `117_profiles_city_fk.sql`**:
  - Adicionar `profiles.city_id BIGINT REFERENCES cities(id)` (manter `city` texto durante a transição para não quebrar o que lê o campo antigo).
  - Função `match_city(name TEXT, uf TEXT)` para resolver texto → `city_id`.
  - ⚠️ **`match_city` é a cola de todo o sistema de cidades e ainda NÃO está validada.** O risco real: nomes repetem entre estados (existem várias "Floresta", "Bonito", "Santa Maria" no Brasil), há acentuação e formas como `D'Oeste`/`d'Oeste`. Sem a UF, o match é ambíguo; com a UF, ainda depende de normalização (unaccent + lower + trim). **Antes de escrever qualquer migração que dependa disso, fazer o spike da §0.1.**
- **Backfill** (`scripts/backfill_report_city.sql`):
  - Para broncas com coordenada: script Node que chama a `reverse-geocode` em lote, lê `raw.address` (cidade **+ UF**) e resolve via `match_city`. Ver a ressalva da Fase 1 sobre o formato de retorno.
  - Fallback: derivar de `profiles.city_id` do autor quando não houver coordenada confiável.
  - Backfill de `profiles.city_id` a partir do `profiles.city` via `match_city`.
  - **Relatório de cobertura**: o script deve reportar quantas broncas/perfis casaram, quantos ficaram ambíguos e quantos sem match — para decidir se o auto-geocode é confiável ou se precisa de plano B (correção manual).

#### §0.1 — Spike obrigatório: validar `match_city` ✅ CONCLUÍDO (2026-06-26)
*Não é código de produção — foi um teste de viabilidade. Resultado: geocodificação automática é viável.*

- Extrair os nomes de cidade que a `reverse-geocode` retorna para uma amostra real de coordenadas (incl. Floresta-PE e cidades vizinhas) e tentar casar com a tabela `cities` usando nome **+ UF** normalizados.
- Medir: % de match exato, % ambíguo (mesmo nome em +1 estado), % sem match. Meta prática: **>95% de acerto com UF**; abaixo disso, o auto-geocode precisa de fallback manual obrigatório.
- Decidir aqui se `match_city` usa só igualdade normalizada (`unaccent(lower(trim))`) ou precisa de `pg_trgm`/similaridade.

**Veredito do spike (executado no DEV com o Brasil inteiro carregado — 5.573 cidades, 27 UFs):**
- ✅ **Cobertura: 5.571/5.573 = 99,96%** resolvem com `match_city(nome, uf)` usando só `unaccent(lower(trim))` + UF. **NÃO precisa de `pg_trgm`/similaridade** — igualdade normalizada basta. Meta de >95% superada com folga.
- ✅ Todos os casos críticos passaram: homônimo `Floresta`/PE (id 64) vs `Floresta`/PR (id 3255) desambiguam pela UF; `Sao Paulo`→`São Paulo` (unaccent); `FLORESTA`, `  Recife  `, `pe` minúsculo normalizam; `Alta Floresta D'Oeste` (apóstrofo) casa; `Bom Jesus`/PI (homônimo em 5 estados) resolve; `Recife`/SP (UF errada) e nome inexistente retornam **NULL** (erra para o lado seguro, não chuta).
- ✅ Confirmado que **a UF é obrigatória**: sem ela, "Floresta" casa com 2 cidades.
- ⚠️ **Único achado a corrigir (dado, não lógica):** 2 linhas colidem no mesmo estado — `São Vicente Ferrer` e `São Vicente Férrer` em PE são a **mesma cidade** (duplicata no seed, uma sem acento). **Tarefa Fase 0:** deduplicar antes de criar o `UNIQUE(name, state_id)`, senão a constraint falha. Não é homônimo real (IBGE não permite 2 municípios de nome igual no mesmo UF).
- **`match_city` candidata validada** (já criada no DEV durante o spike):
  ```sql
  create or replace function public.match_city(p_name text, p_uf text)
  returns bigint language sql stable as $$
    select case when count(*) = 1 then min(c.id) else null end
    from public.cities c join public.states s on s.id = c.state_id
    where unaccent(lower(trim(c.name))) = unaccent(lower(trim(p_name)))
      and upper(trim(s.uf)) = upper(trim(p_uf));
  $$;
  ```
  Retorna NULL quando ambíguo (de propósito → backfill marca para revisão manual em vez de chutar).
- Extensões `unaccent` + `pg_trgm` já instaladas no DEV; seed nacional (5.573 cidades) já carregado no DEV.

### Fase 1 — Captura automática da cidade na bronca
*Objetivo: toda bronca nova nasce com `city_id` correto, sem fricção pro usuário.*

- ⚠️ **A Edge Function `reverse-geocode` HOJE não devolve cidade/UF estruturados.** Ela monta `buildAddress` internamente ([reverse-geocode/index.ts:8-22](supabase/functions/reverse-geocode/index.ts#L8)) e retorna só uma **string** `address` (+ o objeto `raw`). Logo, "reaproveitar" não é plug-and-play. Duas opções:
  - **(Recomendado) Estender a função** para também retornar `{ city, state_uf }` extraídos do `raw.address` (`city ?? town ?? village ?? municipality` e o `state`/sigla). Mudança pequena e centralizada no servidor — todo consumidor passa a receber cidade/UF prontos.
  - Alternativa: ler `raw.address.city`/`raw.address.state` no cliente. Mais frágil (acopla o app ao formato do Nominatim) — evitar.
- No fluxo de criação (`ReportModal.jsx` → insert em `FeedPage.jsx:216`), após obter a coordenada:
  - Chamar `reverse-geocode` (já estendida), pegar `city` + `state_uf` e resolver `city_id` via `match_city`.
  - Gravar `city_id` no insert do `reports`.
  - Fallback silencioso para `profiles.city_id` do autor se o geocode falhar ou der match ambíguo (sem bloquear o envio).
- **Permitir correção manual**: se o geocode errar (divisa, zona rural), o autor/embaixador pode ajustar a cidade da bronca depois. Sem isso, todo erro de geocode é permanente.
- Edge case: bronca anônima (`create-anonymous-report`) — mesma lógica no servidor.

### Fase 2 — Hierarquia (master), Papel de Embaixador + RLS por cidade *(núcleo do programa)*
*Objetivo: criar o nível master, o papel de embaixador e restringir o poder de moderação à(s) cidade(s) do embaixador.*

- **Migração `118_create_master_and_ambassadors.sql`**:
  ```sql
  -- Nível master: acima do admin comum. Só o master aprova/convida embaixadores.
  alter table public.profiles add column if not exists is_master boolean not null default false;

  create table public.ambassador_cities (
    id bigint generated always as identity primary key,
    user_id uuid not null references auth.users(id) on delete cascade,
    city_id bigint not null references cities(id) on delete cascade,
    status text not null default 'active',      -- active | suspended | pending
    assigned_by uuid references auth.users(id), -- master que designou
    invite_id  bigint,                          -- convite usado (se veio por link)
    created_at timestamptz not null default now(),
    unique (user_id, city_id)
  );
  -- flag de papel no profile (para UI e checagens rápidas)
  alter table public.profiles add column if not exists is_ambassador boolean not null default false;
  ```
  - Função `is_master(p_user uuid)` e `is_ambassador_of(p_user uuid, p_city_id bigint)` `SECURITY DEFINER`.
  - Helper `current_user_can_moderate_report(report_id)` = `is_master`/`is_admin` global **OU** `is_ambassador_of(auth.uid(), reports.city_id)`.
  - **Seed do primeiro master** (passo manual de produção, documentar): não há "registrar primeiro master" pela UI — o ovo/galinha se resolve com um SQL pontual rodado direto no banco, ex.: `update public.profiles set is_master = true, is_admin = true where id = '<seu-uuid>';` (pegar o UUID em `auth.users`). A partir daí, todo master é criado pela UI por outro master. Anotar quem são os masters num lugar versionado.
- **RLS** nas tabelas que o embaixador modera (`reports`, `report_updates`, comentários, mídia):
  - `UPDATE`/moderação permitido se admin/master global **ou** embaixador ativo da cidade da bronca.
  - Embaixador **não** vê dados de moderação de outras cidades.
  - **`ambassador_cities`**: só o master pode `INSERT`/`UPDATE` (designar/suspender). Embaixador só lê as próprias linhas.
- **Notificações com escopo** — reescrever `notify_admins_new_report` (hoje em `098`/`099`):
  - Notificar admins globais **+** embaixadores ativos cujo `city_id` == `new.city_id`.
  - Mesma lógica em `notify_admins_new_work_media` e nas atualizações de bronca.

### Fase 2.5 — Links de convite (recrutamento por link)
*Objetivo: master gera link descartável que promove o convidado a embaixador da cidade, sem aprovação caso a caso.*

- **Migração `119_create_ambassador_invites.sql`**:
  ```sql
  create table public.ambassador_invites (
    id bigint generated always as identity primary key,
    token uuid not null default gen_random_uuid() unique,
    city_id bigint not null references cities(id) on delete cascade,
    created_by uuid not null references auth.users(id),  -- master
    expires_at timestamptz not null default (now() + interval '7 days'),
    used_by uuid references auth.users(id),
    used_at timestamptz,
    created_at timestamptz not null default now()
  );
  ```
  - **Edge Function `accept-ambassador-invite`** (`SECURITY DEFINER`): valida token (não expirado, não usado), promove `auth.uid()` a embaixador da `city_id` (insert em `ambassador_cities` + `is_ambassador=true`), marca o convite como usado. Tudo no servidor — o cliente nunca escreve direto nessas tabelas.
  - **Geração do link** restrita ao master (RLS no `INSERT` de `ambassador_invites`).
  - **Deep link mobile** (Capacitor): `trombone://convite/<token>` com fallback web `https://.../convite/<token>` (App Links / Universal Links). Página `AcceptInvitePage.jsx` que, após login/cadastro, chama a Edge Function.
  - **Segurança**: uso único + expiração + escopo travado em uma cidade (link vazado só vale para aquela cidade e some no primeiro uso).

### Fase 3 — App nacional (detecção e troca de cidade)
*Objetivo: feed/mapa locais por padrão, com troca de cidade — fim do hardcode Floresta-PE.*

- **`CityContext`** (novo, em `src/contexts/`): resolve a cidade ativa por ordem: (1) seleção manual salva → (2) `profiles.city_id` → (3) GPS na 1ª vez (com permissão) → (4) fallback nacional.
- **Seletor de cidade** no `Header.jsx` (combobox da tabela `cities`), persistido em `localStorage` + `profiles.city_id`.
- **Filtro por cidade** nas queries de `reports` em: `FeedPage`, `MapPage`, `HomePage`, `SearchPage`, `StatsPage` (todas já listadas no código). Default = cidade ativa; opção "Brasil inteiro".
- **Remover hardcodes** de `'Floresta-PE'` (`PetitionPage.jsx:477`, etc.), trocando pela cidade ativa do contexto.
- **Onboarding** de 1 toque: "Qual sua cidade?" na primeira abertura (pré-preenchido pelo GPS).

#### §3.1 — Petições e obras: escopo por cidade, **mas leitura e assinatura nacionais**
*Regra de negócio (decisão do produto): petições e obras são **organizadas/filtradas** por cidade, mas **qualquer pessoa do Brasil pode ver e assinar** — diferente de `reports`, cuja moderação é restrita à cidade.*

- **Modelo de dados**:
  - **Petições** (`petitions`) — hoje **sem** coluna de cidade ([018_create_petitions_table.sql](supabase/migrations/018_create_petitions_table.sql)). Migração `add city_id BIGINT REFERENCES cities(id)`. Quando a petição nasce de uma bronca (`report_id` preenchido), **herdar `city_id` da bronca**; senão, da cidade do autor / seleção manual.
  - **Obras** (`public_works`) — já têm `city` em **texto** (lido em [WorkDetailsPageProject.jsx:2717](src/pages/WorkDetailsPageProject.jsx#L2717)). Adicionar `city_id` e backfillar via `match_city` (mesma função do spike §0.1). Manter `city` texto durante a transição.
- **RLS — ponto-chave, é o que diferencia de `reports`**:
  - **SELECT permanece público** (`USING (true)`) — petições já são assim ([018:24](supabase/migrations/018_create_petitions_table.sql#L24)); **não restringir por cidade no banco**. O escopo por cidade é só **filtro de UI**, não barreira de acesso.
  - **Assinatura continua livre** para qualquer usuário/visitante — manter as policies atuais de `signatures` (`auth.uid() = user_id` + fluxo de convidado). Nada muda aqui.
  - **Moderação/edição** (criar/aprovar/editar petição, gerir obra) é que passa a respeitar o escopo: admin/master global **ou** embaixador da cidade da petição/obra. Hoje só admin pode ([018:29-52](supabase/migrations/018_create_petitions_table.sql#L29)); estender com `is_ambassador_of(auth.uid(), city_id)`.
- **UI**:
  - Default = petições/obras da cidade ativa; toggle **"Brasil inteiro"** sempre disponível (alcance nacional é intencional para petições — quanto mais assinaturas, melhor).
  - Páginas afetadas: `PetitionsOverviewPage`, `PublicWorksPage`, `HomePage` (seções de petições/obras), `SearchPage`.
- **Resumo da diferença de escopo** (deixar explícito para não confundir na implementação):

  | Conteúdo | Quem **vê** | Quem **assina/participa** | Quem **modera/edita** |
  |---|---|---|---|
  | Broncas (`reports`) | cidade ativa (filtro) | qualquer um cria | admin/master **ou** embaixador **da cidade** |
  | Petições (`petitions`) | **todos** (filtro opcional por cidade) | **qualquer um, nacional** | admin/master **ou** embaixador da cidade |
  | Obras (`public_works`) | **todos** (filtro opcional por cidade) | contribui mídia (já moderada) | admin/master **ou** embaixador da cidade |

### Fase 4 — Painel do Embaixador + gestão (master)
*Objetivo: dar ao embaixador uma home de trabalho e ao master as ferramentas de aprovar/convidar/gerir.*

- **`AmbassadorDashboard`** (nova rota, ex.: `/embaixador`): versão da `ModerationPage` **filtrada pela(s) cidade(s) do embaixador** — fila de broncas pendentes, métricas da cidade (broncas abertas/resolvidas, tempo médio, engajamento), atalho para responder/atualizar.
- **Painel do master** (nova aba em `ManageUsersPage.jsx`, visível só para `is_master`):
  - Aprovar candidaturas e promover usuário a embaixador, designando cidade(s) (escreve em `ambassador_cities`).
  - **Gerar/gerir links de convite** (cria `ambassador_invites`, copia link, vê quais foram usados).
  - Suspender/reativar embaixador (`status`), ver métricas por embaixador.

### Fase 5 — Monetização: premium web + entitlements + B2B
*Objetivo: receita sem violar as regras das lojas. Venda fora do app; o app só libera o que já foi pago.*

> **Por que fora do app:** Apple/Google exigem o billing nativo delas (15–30% de comissão) para venda de bens/serviços **digitais consumidos no app**. Stripe/Pix só é permitido para serviços contratados **fora** do app. Logo: checkout no portal web, e o app apenas **lê o entitlement** e libera a feature.

- **Migração `120_create_entitlements.sql`**:
  ```sql
  create table public.subscriptions (
    id bigint generated always as identity primary key,
    subject_type text not null,            -- 'ambassador' | 'org'
    user_id uuid references auth.users(id),-- assinante (embaixador) quando aplicável
    org_name text,                         -- prefeitura/câmara/empresa (B2B)
    plan text not null,                    -- free | premium | b2b
    status text not null default 'active', -- active | past_due | canceled
    city_id bigint references cities(id),  -- escopo, quando o plano é por cidade
    provider text,                         -- stripe | pix | manual
    provider_ref text,                     -- id da assinatura no provedor
    current_period_end timestamptz,
    created_at timestamptz not null default now()
  );
  -- view/função has_entitlement(user, feature_key) -> bool, usada pela RLS e pela UI
  ```
  - **Portal web de checkout** (fora do app): página/rota web com Stripe Checkout + Pix. Reaproveita a base de `create-payment-intent`, mas em **modo assinatura** (não doação).
  - **Webhook Stripe** (Edge Function `stripe-webhook`): no `checkout.session.completed`/`invoice.paid`, grava/atualiza `subscriptions`; no `canceled`/`past_due`, rebaixa para free. **Fonte da verdade do acesso.**
  - **Gate de features** no app: hook `useEntitlement(featureKey)` lê `subscriptions`/`has_entitlement` e libera os "módulos de fiscalização" (relatórios avançados, exportação, fiscalização de obras/empenhos — o app **já tem** dados de obras e pagamentos). Cadastro de embaixador continua **gratuito**; só os módulos extras são pagos.
- **Trilha B2B** (órgãos/empresas): mesmo modelo de `subscriptions` com `subject_type='org'`. Painel da cidade/relatórios para prefeituras, câmaras e empresas. Venda assistida (contrato/`provider='manual'`) no começo; automatizável depois.

> Nota mobile (Capacitor): a detecção por GPS deve seguir o `CLAUDE.md` — checar plataforma, pedir permissão e ter fallback (perfil/seleção manual) quando o GPS não estiver disponível. Nada de geolocalização obrigatória que trave o app.

---

## 3. Modelo do programa de embaixadores (gestão)

### Perfil do embaixador (quem)
Blogueiros, jornalistas, vereadores e usuários engajados — exatamente o público da ideia original. Critérios sugeridos:
- Vínculo real com a cidade; presença pública ou histórico de engajamento no app.
- Compromisso de SLA leve (ex.: revisar broncas pendentes ao menos a cada 48h).

### Hierarquia de papéis
- **Admin master** (`is_master`) — topo. Único que aprova/convida embaixadores e gera links de convite. Override total.
- **Admin comum** (`is_admin`) — modera globalmente, mas **não** cria embaixadores.
- **Embaixador** (`is_ambassador` + linha em `ambassador_cities`) — modera/acompanha **só a(s) cidade(s)** designada(s).
- **Cidadão / órgão público** (`user_type`) — usa o app; pode se candidatar a embaixador.

### Ciclo de vida (dois caminhos de entrada)
1. **Entrada** — (a) **candidatura** via formulário in-app (nome, cidade, vínculo, motivação) **ou** (b) **link de convite** gerado pelo master.
2. **Ativação** — master aprova a candidatura **ou** o convidado abre o link → Edge Function promove a embaixador da cidade (`status='active'`).
3. **Operação** — embaixador modera/acompanha broncas da cidade pelo painel.
4. **Acompanhamento** — métricas por embaixador; `status='suspended'` se inativo ou em caso de abuso (só o master altera).

### Governança (controle de risco)
- **Só o master cria embaixadores** — admins comuns e embaixadores não podem promover ninguém (fecha a porta de captura por dentro).
- **1 cidade pode ter +1 embaixador** (redundância); **master/admin global** sempre tem override.
- **Trilha de auditoria**: registrar quem aprovou/rejeitou cada bronca (estender `report_updates`/moderação com `moderated_by`) e quem designou cada embaixador (`assigned_by`/`invite_id`).
- **Limites**: embaixador modera, mas **não** apaga conta de usuário nem mexe em cidades que não são dele (garantido por RLS).
- **Código de conduta** + processo de remoção claros (evita captura política do papel, risco real com vereadores).

### Incentivos (cadastro gratuito, como na ideia)
- Selo "Embaixador verificado" no perfil; destaque no app.
- Acesso a **módulos premium de fiscalização** (pagos, opcionais — ver Fase 5); cadastro e moderação seguem grátis.
- Ranking/reconhecimento de cidades mais ativas.

---

## 4. Estratégia de marketing e lançamento

### Posicionamento
"O Trombone agora é nacional: a sua cidade fiscalizada por quem vive nela." Embaixador = liderança cívica local, não influencer genérico.

### Go-to-market faseado (casa com as fases de código)
1. **Piloto (cidades-semente):** começar por Floresta-PE + 3–5 cidades vizinhas onde já há usuários. Validar o fluxo de embaixador antes de escalar.
2. **Recrutamento de embaixadores:** abordar jornalistas/blogueiros/vereadores locais; o próprio papel é a isca de marketing (eles divulgam o app para a base deles → crescimento orgânico por cidade).
3. **Expansão por "manchas":** priorizar cidades onde um embaixador já topou — cada embaixador puxa a própria audiência. Crescimento cidade-a-cidade, não nacional de uma vez.
4. **Nacional aberto:** com o seletor de cidade no ar, qualquer cidade pode ser ativada sob demanda (quando surge bronca/embaixador lá).

### Canais
- **Embaixadores como canal primário** (cada um é um micro-influenciador local).
- Imprensa local/regional (pauta: "transparência e fiscalização da sua cidade").
- Conteúdo orgânico: rankings de cidades, broncas resolvidas (prova social), histórias de impacto.
- ASO nas lojas: keywords por cidade/estado.

### Métricas-chave (por cidade)
Embaixadores ativos · broncas criadas · taxa de resolução · tempo médio de moderação · DAU/MAU local · conversão candidato→embaixador.

---

## 5. Monetização (modelo de receita)

> Decisão: vender **fora do app** (portal web — Stripe/Pix), o app só **libera** o que já foi pago. Evita a comissão de 15–30% das lojas e o risco de o app ser removido por vender bem digital com gateway próprio.

### Três fontes de receita
1. **Premium do embaixador (B2C, upgrade opcional).** Cadastro e moderação grátis. Paga só quem quer **módulos de fiscalização** avançados: relatórios, exportação de dados, fiscalização aprofundada de obras/empenhos/pagamentos (o app **já coleta** esses dados). Assinatura mensal/anual no portal web.
2. **B2B — órgãos e empresas.** Prefeituras, câmaras e empresas assinam **painéis/relatórios da cidade**. Ticket maior e previsível; venda assistida no começo (contrato + ativação manual de `subscriptions`), automatizável depois. *Atenção ético-comercial:* vender painel para a prefeitura que está sendo fiscalizada exige transparência sobre o que é dado público vs. produto — definir isso na política antes de vender.
3. **Patrocínio/doação local (complementar).** Reaproveita o fluxo de doação que **já existe** (`donations`) como "apoie a fiscalização da sua cidade", e abre espaço para patrocinador local na página da cidade. Baixo atrito, ajuda a sustentar cidades pequenas.

### Como o acesso é controlado (resumo técnico — detalhe na Fase 5)
- Verdade do acesso = tabela `subscriptions` (atualizada por **webhook** do provedor de pagamento).
- App consulta `has_entitlement(user, feature_key)` e libera/bloqueia a feature.
- Nada de pagamento dentro do app nativo → conformidade com Apple/Google.

### Sequência sugerida de receita
Primeiro provar **uso** (Fases 0–3, app nacional funcionando) → depois ligar **premium do embaixador** (Fase 5, B2C, mais simples) → por último **B2B** (venda assistida, quando houver cidades com volume e prova de impacto).

---

## 6. Riscos & mitigações

| Risco | Mitigação |
|---|---|
| Geocode erra a cidade (divisas, zona rural) | Fallback para cidade do autor + permitir correção manual da cidade na bronca |
| Captura política do papel (vereador moderando contra adversário) | Auditoria, múltiplos embaixadores/cidade, override do admin, código de conduta |
| Cidade sem embaixador acumula broncas sem moderação | Admin global cobre o vazio; fila nacional de pendências para o time central |
| Feed nacional fica vazio/ruidoso em cidades pequenas | Default local + opção "Brasil"; agregação por estado quando a cidade tem pouco volume |
| Migração quebrar Floresta-PE | Fases independentes; `city` texto mantido durante a transição; backfill validado antes de cortar o legado |
| LGPD (dados de quem reporta expostos a embaixador local) | Embaixador vê só o necessário para moderar; broncas anônimas permanecem anônimas; RLS restringe PII |
| App removido da loja por venda digital com gateway próprio | Checkout **fora** do app (portal web); app só lê entitlement e libera feature; nada de pagamento dentro do app nativo |
| Link de convite vaza | Uso único + expiração + escopo travado numa cidade; promoção feita por Edge Function `SECURITY DEFINER` (cliente não escreve direto) |
| Conflito de interesse no B2B (vender painel à prefeitura fiscalizada) | Política clara de dado público vs. produto; transparência; manter independência editorial das broncas |
| Master vira ponto único de falha/poder | Permitir +1 master de confiança; auditar ações de master; ações sensíveis logadas |

---

## 6.5. Skills a usar durante a execução do plano

> Quais skills disponíveis aplicar em cada momento. **Regra:** antes de cada fase, invocar a(s) skill(s) de processo correspondente(s) — elas ditam *como* fazer, não só *o quê*. Skills de domínio (Supabase/React/Capacitor) entram na implementação.

### Skills de processo (sempre, na ordem)
| Momento | Skill | Por quê |
|---|---|---|
| Antes de desenhar qualquer fase | `superpowers:brainstorming` | Fecha decisões de arquitetura antes de codar (evita retrabalho em prod). |
| Spike §0.1 (`match_city`) | `gsd-spike` | É um teste de viabilidade, não código de produção — a skill de spike enquadra isso corretamente. |
| Após aprovar o design de uma fase | `superpowers:writing-plans` | Transforma o design em plano de implementação executável (PRs pequenos). |
| Durante a implementação | `superpowers:executing-plans` / `superpowers:test-driven-development` | Execução disciplinada com commits atômicos; TDD nas funções críticas (`match_city`, RLS helpers, `has_entitlement`). |
| Investigar bug/erro | `superpowers:systematic-debugging` | Método científico antes de "chutar" correção (já evitou erro no reset do DEV). |
| Antes de marcar fase como pronta | `superpowers:verification-before-completion` | Confirma que a fase realmente entrega o objetivo, não só que o código roda. |
| Fechar branch/PR | `superpowers:finishing-a-development-branch` + `gh-cli` | Padroniza merge/PR. |

### Skills de domínio (na implementação de cada fase)
| Onde | Skill | Aplicação no plano |
|---|---|---|
| Migrações, RLS, índices, `match_city`, `SECURITY DEFINER`, backfill | `postgres-pro` / `sql-pro` | Toda a Fase 0/2/2.5/5 é Postgres pesado — RLS por cidade e funções são o coração. |
| Edge Functions, `reverse-geocode`, `accept-ambassador-invite`, `stripe-webhook` | `api-designer` / `typescript-pro` | Contratos de API e Deno/TS das funções. |
| Telas (CityContext, seletor de cidade, painéis embaixador/master) | `react-expert` | Fase 3 e 4 são React 18 + contexto. |
| Câmera/GPS/deep link no app nativo | `react-native-expert` *(referência de padrões mobile)* + **`CLAUDE.md`** | Detecção GPS e deep link `trombone://` seguem o checklist Capacitor do `CLAUDE.md` (Android+iOS). |
| RLS de cidade, entitlements, links de convite | `security-reviewer` / `secure-code-guardian` | Revisar isolamento por cidade, uso único de convite, gate de pagamento. |
| Antes de subir cada fase | `code-reviewer` / `gsd-code-review` | Review estruturado dos PRs. |
| Escala (feed nacional, índices, queries por cidade) | `scalability` / `database-optimizer` | Quando o volume sair de 1 cidade para N. |

### Não aplicáveis a este projeto (ignorar)
Skills de blockchain/smart-contract, fuzzing, crypto-audit (zeroize, constant-time), e de outras linguagens (Rust/Go/Java/C++/PHP/etc.) **não** se aplicam ao stack (React/Capacitor/Supabase) — não invocar.

---

## 7. Ordem de execução recomendada

1. **Fase 0** (fundação de dados) — invisível, baixo risco, destrava tudo.
2. **Fase 1** (captura automática de cidade) — passa a popular `city_id` nas broncas novas.
3. **Fase 2** (hierarquia master + papel embaixador + RLS + notificações por cidade) — núcleo do programa.
4. **Fase 2.5** (links de convite) — recrutamento por link, sem aprovação caso a caso.
5. **Fase 3** (app nacional / seletor de cidade) — vira "app nacional" de fato.
6. **Fase 4** (painel do embaixador + painel do master) — operação e gestão.
7. **Fase 5** (monetização: premium web + entitlements + B2B) — receita, depois que houver uso.

Cada fase é um conjunto pequeno de PRs. Sugiro **começar pela Fase 0 + Fase 1** (destravam todo o resto e têm risco mínimo). A monetização (Fase 5) vem **depois** de provar uso — não adianta cobrar antes de ter cidades ativas. Posso detalhar e implementar fase a fase quando você quiser.

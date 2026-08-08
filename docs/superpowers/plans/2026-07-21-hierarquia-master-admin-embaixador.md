# Hierarquia Master → Admin → Embaixador — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Corrigir as inconsistências reais da hierarquia de papéis (Master inoperante para moderação, RLS de convites contradizendo a regra "só Master gerencia convites", `get_invite_preview` ausente do banco, `AmbassadorPage`/`Header` não contemplando Master/Admin) para que o sistema reflita a hierarquia Master → Admin → Embaixador definida com o usuário.

**Architecture:** Correções pontuais de RLS (adicionar `is_master` onde só `is_admin` cobre moderação global; reverter RLS de `ambassador_invites` para exigir só `is_master`; criar `get_invite_preview`), mais ajustes de guard/query em 3 componentes React (`ManageMastersPage.jsx`, `AmbassadorPage.jsx`, `Header.jsx`). Nenhuma mudança em `AdminRoute` nem nos ~25 arquivos que checam `is_admin` isoladamente, por conta da invariante operacional confirmada: todo `is_master = true` sempre virá acompanhado de `is_admin = true`, setados juntos manualmente no banco.

**Tech Stack:** Supabase Postgres (RLS, funções `SECURITY DEFINER`/`stable`), React, `supabase-js`.

## Global Constraints

- **Invariante operacional:** todo usuário `is_master = true` sempre também tem `is_admin = true`. Por isso, guards que hoje checam só `is_admin` para dar acesso amplo (ex: `AdminRoute` em `App.jsx:216-220`) **não precisam mudar** — um master sempre passa por já ser admin.
- **Exceção à invariante:** dentro da área de embaixadores (`/admin/embaixadores`, RLS de `ambassador_invites`), a regra é a oposta — Admin **não** deve gerenciar convites/embaixadores, só Master pode. Nesses pontos específicos, checar `is_master` **em vez de** (não em conjunto com) `is_admin`.
- **Embaixador não ganha nenhum acesso novo.** Continua restrito a `/embaixador`, moderando só a(s) cidade(s) onde tem `ambassador_cities.status = 'active'`.
- Seguir o padrão de migrations já usado no projeto: arquivos numerados sequencialmente em `supabase/migrations/`, aplicados via `supabase db push --include-all` (necessário por haver migrations locais fora de ordem cronológica — já verificado nas sessões anteriores deste projeto).
- Numeração de migration: a próxima livre é `129` (última existente é `128_reports_map_clusters_admin_boundaries.sql`).
- `reports.city_id`/`ambassador_cities.city_id`/`cities.state_id` são `bigint`; `ambassador_cities.user_id`/`ambassador_invites.invited_by`/`accepted_by` são `uuid` (FK para `auth.users`, não `public.profiles` — todo `SELECT` que precise de nome/e-mail do usuário precisa buscar `profiles` separadamente, já que não há FK direta entre essas tabelas para o PostgREST montar um embed).

---

## File Structure

- **Create:** `supabase/migrations/129_master_moderation_and_invite_preview.sql` — adiciona `is_master` à policy de moderação global de `reports`/`report_updates`; reverte a RLS de `ambassador_invites` (migration 125) para exigir só `is_master`; cria a função `get_invite_preview(p_token)`.
- **Modify:** `src/pages/admin/ManageMastersPage.jsx` — guard interno vira só `is_master` (remove `|| is_admin`); título/descrição já corrigidos em commit anterior, sem mudança adicional necessária aqui.
- **Modify:** `src/pages/AmbassadorPage.jsx` — quando `is_master` ou `is_admin`, busca reports/updates pendentes de todas as cidades (sem filtro de `ambassador_cities`); aba "Minhas Cidades" mostra um estado diferente para esse caso (não é "nenhuma cidade atribuída", é "acesso global").
- **Modify:** `src/components/Header.jsx` — inclui `is_admin` na condição que mostra "Painel Embaixador" no menu.
- **Modify:** `src/pages/admin/AdminPage.jsx` — remove qualquer menção residual a "promoções de masters" na descrição do card de embaixadores (verificar se ainda existe, já que parte foi corrigida no commit `8895cf9`).

---

### Task 1: RLS — Master modera globalmente + reverter RLS de convites + criar `get_invite_preview`

**Files:**
- Create: `supabase/migrations/129_master_moderation_and_invite_preview.sql`

**Interfaces:**
- Produces: policy `"Admins can perform any action on reports"` estendida para `is_admin(auth.uid()) OR is_master(auth.uid())`; nova policy equivalente em `report_updates` para o mesmo alcance; policies `ambassador_invites_select/insert/update` revertidas para exigir só `is_master(auth.uid())`; função `public.get_invite_preview(p_token text)` retornando `table(city_name text, city_uf text, invited_by_name text, expires_at timestamptz)`.

- [ ] **Step 1: Escrever a migration completa**

```sql
-- 129_master_moderation_and_invite_preview.sql

-- ── 1. Master modera qualquer cidade, igual Admin ──────────────────────────
-- Hoje só "Admins can perform any action on reports" (cmd = '*') dá alcance
-- global; is_master nunca é checado em nenhuma policy de reports/report_updates.
drop policy if exists "Admins can perform any action on reports" on public.reports;
create policy "Admins can perform any action on reports"
  on public.reports
  for all
  using (is_admin(auth.uid()) or is_master(auth.uid()))
  with check (is_admin(auth.uid()) or is_master(auth.uid()));

-- report_updates não tinha nenhuma policy "ALL" para admin/master — só a
-- policy de DELETE ("delete report_updates") checa is_admin via subquery.
-- Adiciona uma policy dedicada de UPDATE cobrindo admin+master globalmente,
-- para moderação (aprovar/rejeitar) funcionar sem depender de ambassador_cities.
drop policy if exists "admins_and_masters_can_update_report_updates" on public.report_updates;
create policy "admins_and_masters_can_update_report_updates"
  on public.report_updates
  for update
  using (is_admin(auth.uid()) or is_master(auth.uid()))
  with check (is_admin(auth.uid()) or is_master(auth.uid()));

-- ── 2. Reverter RLS de ambassador_invites: só Master gerencia convites ──────
-- A migration 125 passou a permitir admin também — contradiz a regra
-- definida com o usuário ("Admin não gerencia convites, só Master").
drop policy if exists "ambassador_invites_select" on public.ambassador_invites;
create policy "ambassador_invites_select"
  on public.ambassador_invites for select
  using (
    public.is_master(auth.uid())
    or token = current_setting('app.invite_token', true)
  );

drop policy if exists "ambassador_invites_insert" on public.ambassador_invites;
create policy "ambassador_invites_insert"
  on public.ambassador_invites for insert
  with check (public.is_master(auth.uid()));

drop policy if exists "ambassador_invites_update" on public.ambassador_invites;
create policy "ambassador_invites_update"
  on public.ambassador_invites for update
  using (public.is_master(auth.uid()));

-- ── 3. get_invite_preview: preview público do convite (sem autenticação) ────
-- Consumida por AcceptInvitePage.jsx antes do login — devolve só o essencial
-- para exibir o card de preview, sem expor a tabela ambassador_invites inteira.
create or replace function public.get_invite_preview(p_token text)
returns table (
  city_name text,
  city_uf text,
  invited_by_name text,
  expires_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    c.name as city_name,
    s.uf as city_uf,
    p.name as invited_by_name,
    ai.expires_at
  from public.ambassador_invites ai
  join public.cities c on c.id = ai.city_id
  left join public.states s on s.id = c.state_id
  left join public.profiles p on p.id = ai.invited_by
  where ai.token = p_token
    and ai.status = 'pending'
    and ai.expires_at > now()
  limit 1;
$$;

grant execute on function public.get_invite_preview(text) to anon, authenticated;
```

- [ ] **Step 2: Aplicar a migration no banco DEV**

Run: `supabase db push --include-all`
Expected: prompt de confirmação lista `129_master_moderation_and_invite_preview.sql`; após confirmar, saída `Finished supabase db push.` sem erros.

- [ ] **Step 3: Smoke test — `get_invite_preview` com um token real**

Buscar um token de convite pendente existente no banco (ou criar um de teste) e testar via migration descartável com `RAISE NOTICE`, seguindo o mesmo padrão usado nas sessões anteriores deste projeto (criar `supabase/migrations/999999_smoke_test.sql` com um bloco `do $$ ... $$`, aplicar com `supabase db push --include-all`, depois `rm` o arquivo e `supabase migration repair --status reverted 999999`):

```sql
do $$
declare
  r record;
  test_token text;
begin
  select token into test_token from public.ambassador_invites where status = 'pending' and expires_at > now() limit 1;
  if test_token is null then
    raise notice 'Nenhum convite pendente para testar — criar um manualmente antes de validar.';
  else
    for r in select * from public.get_invite_preview(test_token) loop
      raise notice 'city_name=%, city_uf=%, invited_by_name=%, expires_at=%', r.city_name, r.city_uf, r.invited_by_name, r.expires_at;
    end loop;
  end if;
end $$;
```
Expected: se houver convite pendente, uma linha com `city_name` preenchido; se não houver, a notice de aviso (não é falha, só indica que precisa de dado de teste).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/129_master_moderation_and_invite_preview.sql
git commit -m "fix(hierarquia): master modera globalmente, reverte RLS de convites para só-master, cria get_invite_preview"
```

---

### Task 2: `ManageMastersPage.jsx` — guard interno vira só `is_master`

**Files:**
- Modify: `src/pages/admin/ManageMastersPage.jsx:557-563`

**Interfaces:**
- Consumes: `useAuth()` (já importado).

- [ ] **Step 1: Restringir o guard interno**

Localizar:
```js
const ManageMastersPage = () => {
  const { user } = useAuth();

  const canAccess = user && (user.is_master || user.is_admin);
  if (!canAccess) {
    return <Navigate to="/" replace />;
  }
```

Substituir por:
```js
const ManageMastersPage = () => {
  const { user } = useAuth();

  const canAccess = user && user.is_master;
  if (!canAccess) {
    return <Navigate to="/" replace />;
  }
```

- [ ] **Step 2: Verificar build**

Run: `npm run build`
Expected: build finaliza sem erros.

- [ ] **Step 3: Commit**

```bash
git add src/pages/admin/ManageMastersPage.jsx
git commit -m "fix(hierarquia): gestão de embaixadores exige is_master, não mais is_admin"
```

---

### Task 3: `AmbassadorPage.jsx` — Master/Admin veem todas as cidades

**Files:**
- Modify: `src/pages/AmbassadorPage.jsx:40-117` (fetches), `src/pages/AmbassadorPage.jsx:246-292` (aba "Minhas Cidades")

**Interfaces:**
- Consumes: `user.is_master`, `user.is_admin` (já disponíveis via `useAuth()`, linha 15).
- Produces: novo estado derivado `hasGlobalAccess = user.is_master || user.is_admin`, usado para decidir se os fetches filtram por `ambassador_cities` ou buscam tudo.

- [ ] **Step 1: Adicionar a flag de acesso global e usá-la nos fetches de reports/updates**

Localizar (linhas 56-105):
```js
  const fetchPendingReports = useCallback(async (cityIds) => {
    if (!cityIds || cityIds.length === 0) {
      setPendingReports([]);
      setLoadingReports(false);
      return;
    }
    setLoadingReports(true);
    const { data, error } = await supabase
      .from('reports')
      .select('id, title, category_id, created_at, moderation_status, city_id, category:category_id(name)')
      .in('city_id', cityIds)
      .eq('moderation_status', 'pending_approval')
      .order('created_at', { ascending: true });

    if (error) {
      toast({ title: 'Erro ao buscar broncas', description: error.message, variant: 'destructive' });
    } else {
      setPendingReports(data || []);
    }
    setLoadingReports(false);
  }, [toast]);

  const fetchPendingUpdates = useCallback(async (cityIds) => {
    if (!cityIds || cityIds.length === 0) {
      setPendingUpdates([]);
      setLoadingUpdates(false);
      return;
    }
    setLoadingUpdates(true);
    // Get report_updates where the parent report is in my cities
    const { data, error } = await supabase
      .from('report_updates')
      .select(
        'id, report_id, update_type, message, status, created_at, ' +
        'author:profiles!report_updates_author_id_fkey(name), ' +
        'report:reports!report_updates_report_id_fkey(id, title, city_id)'
      )
      .eq('status', 'pending_moderation')
      .order('created_at', { ascending: true });

    if (error) {
      toast({ title: 'Erro ao buscar atualizações', description: error.message, variant: 'destructive' });
    } else {
      // Filter client-side by city
      const cityIdSet = new Set(cityIds);
      const filtered = (data || []).filter(u => u.report && cityIdSet.has(u.report.city_id));
      setPendingUpdates(filtered);
    }
    setLoadingUpdates(false);
  }, [toast]);
```

Substituir por:
```js
  const hasGlobalAccess = user.is_master || user.is_admin;

  const fetchPendingReports = useCallback(async (cityIds) => {
    if (!hasGlobalAccess && (!cityIds || cityIds.length === 0)) {
      setPendingReports([]);
      setLoadingReports(false);
      return;
    }
    setLoadingReports(true);
    let query = supabase
      .from('reports')
      .select('id, title, category_id, created_at, moderation_status, city_id, category:category_id(name)')
      .eq('moderation_status', 'pending_approval')
      .order('created_at', { ascending: true });

    if (!hasGlobalAccess) {
      query = query.in('city_id', cityIds);
    }

    const { data, error } = await query;

    if (error) {
      toast({ title: 'Erro ao buscar broncas', description: error.message, variant: 'destructive' });
    } else {
      setPendingReports(data || []);
    }
    setLoadingReports(false);
  }, [toast, hasGlobalAccess]);

  const fetchPendingUpdates = useCallback(async (cityIds) => {
    if (!hasGlobalAccess && (!cityIds || cityIds.length === 0)) {
      setPendingUpdates([]);
      setLoadingUpdates(false);
      return;
    }
    setLoadingUpdates(true);
    // Get report_updates where the parent report is in my cities
    const { data, error } = await supabase
      .from('report_updates')
      .select(
        'id, report_id, update_type, message, status, created_at, ' +
        'author:profiles!report_updates_author_id_fkey(name), ' +
        'report:reports!report_updates_report_id_fkey(id, title, city_id)'
      )
      .eq('status', 'pending_moderation')
      .order('created_at', { ascending: true });

    if (error) {
      toast({ title: 'Erro ao buscar atualizações', description: error.message, variant: 'destructive' });
    } else if (hasGlobalAccess) {
      setPendingUpdates((data || []).filter(u => u.report));
    } else {
      // Filter client-side by city
      const cityIdSet = new Set(cityIds);
      const filtered = (data || []).filter(u => u.report && cityIdSet.has(u.report.city_id));
      setPendingUpdates(filtered);
    }
    setLoadingUpdates(false);
  }, [toast, hasGlobalAccess]);
```

- [ ] **Step 2: Ajustar a aba "Minhas Cidades" para refletir acesso global**

Localizar (linhas 253-260):
```js
            ) : myCities.length === 0 ? (
              <Card className="border-dashed border-2 py-16 text-center bg-muted/20">
                <CardContent className="flex flex-col items-center gap-3">
                  <MapPin className="w-10 h-10 text-muted-foreground" />
                  <p className="text-lg font-semibold text-muted-foreground">Nenhuma cidade atribuída</p>
                  <p className="text-muted-foreground text-sm">Você ainda não é embaixador ativo de nenhuma cidade.</p>
                </CardContent>
              </Card>
            ) : (
```

Substituir por:
```js
            ) : myCities.length === 0 ? (
              <Card className="border-dashed border-2 py-16 text-center bg-muted/20">
                <CardContent className="flex flex-col items-center gap-3">
                  <MapPin className="w-10 h-10 text-muted-foreground" />
                  {hasGlobalAccess ? (
                    <>
                      <p className="text-lg font-semibold text-foreground">Acesso a todas as cidades</p>
                      <p className="text-muted-foreground text-sm">
                        Como {user.is_master ? 'master' : 'admin'}, você modera broncas e atualizações de qualquer cidade — não precisa estar atribuído a uma específica.
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="text-lg font-semibold text-muted-foreground">Nenhuma cidade atribuída</p>
                      <p className="text-muted-foreground text-sm">Você ainda não é embaixador ativo de nenhuma cidade.</p>
                    </>
                  )}
                </CardContent>
              </Card>
            ) : (
```

- [ ] **Step 3: Ajustar `getCityNameById` para não quebrar quando a cidade do report não está em `myCities` (caso de acesso global)**

Localizar (linhas 159-164):
```js
  const getCityNameById = (cityId) => {
    const found = myCities.find(c => c.city_id === cityId);
    if (!found) return '';
    const city = found.cities;
    return city ? `${city.name} - ${city.states?.uf || ''}` : '';
  };
```

Esse helper já retorna `''` com segurança quando não encontra (`myCities` vazio no caso global) — não precisa de mudança, mas confirmar visualmente no Step 5 que o card do report simplesmente omite a tag de cidade nesse caso (o JSX em `report.city_id && (...)` já trata isso, linha 331 do arquivo original).

- [ ] **Step 4: Verificar build**

Run: `npm run build`
Expected: build finaliza sem erros.

- [ ] **Step 5: Testar manualmente no navegador**

Pré-requisito: no banco DEV, rodar `UPDATE profiles SET is_master = true, is_admin = true WHERE id = '<seu-user-id>';` (fora do app, diretamente no Supabase Studio ou via psql — ação manual do usuário, não deste plano).

Run: `npm run dev`, logar com o usuário marcado como master, acessar `/embaixador`.
Expected:
- Aba "Minhas Cidades" mostra "Acesso a todas as cidades" (não mais "Nenhuma cidade atribuída").
- Aba "Broncas Pendentes" lista pendências de todas as cidades que tiverem reports com `moderation_status = 'pending_approval'`, não só de uma cidade específica.
- Aprovar/rejeitar uma bronca de qualquer cidade funciona sem erro de RLS.

- [ ] **Step 6: Commit**

```bash
git add src/pages/AmbassadorPage.jsx
git commit -m "feat(hierarquia): master/admin moderam todas as cidades no painel de embaixador"
```

---

### Task 4: `Header.jsx` — incluir Admin no link do Painel Embaixador

**Files:**
- Modify: `src/components/Header.jsx:221-225`

**Interfaces:**
- Consumes: `user.is_admin` (já disponível no escopo, usado na linha 226 logo abaixo).

- [ ] **Step 1: Ajustar a condição**

Localizar:
```js
                  {(user.is_ambassador || user.is_master) && (
                    <DropdownMenuItem asChild>
                      <Link to="/embaixador" className="flex items-center"><LucideIcons.ShieldCheck className="mr-2 h-4 w-4" /><span>Painel Embaixador</span></Link>
                    </DropdownMenuItem>
                  )}
```

Substituir por:
```js
                  {(user.is_ambassador || user.is_master || user.is_admin) && (
                    <DropdownMenuItem asChild>
                      <Link to="/embaixador" className="flex items-center"><LucideIcons.ShieldCheck className="mr-2 h-4 w-4" /><span>Painel Embaixador</span></Link>
                    </DropdownMenuItem>
                  )}
```

- [ ] **Step 2: Verificar build**

Run: `npm run build`
Expected: build finaliza sem erros.

- [ ] **Step 3: Commit**

```bash
git add src/components/Header.jsx
git commit -m "fix(hierarquia): admin também vê o link do Painel Embaixador no menu"
```

---

### Task 5: Limpar texto residual em `AdminPage.jsx`

**Files:**
- Modify: `src/pages/admin/AdminPage.jsx` (localizar a linha exata via grep, número pode ter mudado desde o mapeamento)

**Interfaces:**
- Nenhuma — mudança de texto estático apenas.

- [ ] **Step 1: Localizar e verificar o texto atual**

Run: `grep -n "promoç\|promocao\|Convites, embaixadores" src/pages/admin/AdminPage.jsx`
Expected: mostra a linha exata (ou nenhum resultado, se já foi corrigida em sessão anterior — nesse caso, pular para o Step 3 sem alterar nada).

- [ ] **Step 2: Se encontrado, corrigir o texto**

Se a busca do Step 1 retornar algo como:
```js
<p className="...">Convites, embaixadores ativos e promoções de masters.</p>
```
Substituir por:
```js
<p className="...">Convites e embaixadores ativos.</p>
```
(Ajustar a string exata encontrada — o texto pode variar ligeiramente da última vez que foi mapeado.)

- [ ] **Step 3: Verificar build**

Run: `npm run build`
Expected: build finaliza sem erros.

- [ ] **Step 4: Commit (só se houve mudança no Step 2)**

```bash
git add src/pages/admin/AdminPage.jsx
git commit -m "fix(hierarquia): remove menção residual a 'promoções de masters' no card de admin"
```

---

## Self-Review

**Spec coverage:**
- Master inoperante para moderação → Task 1 (policies de `reports`/`report_updates` com `is_master`).
- RLS de `ambassador_invites` permitindo Admin (contradição com a regra) → Task 1 (reversão para só `is_master`).
- `get_invite_preview` ausente → Task 1 (função criada + smoke test).
- Rota `/admin/embaixadores` vs. guard interno → Task 2 (guard interno vira só `is_master`; rota `AdminRoute` não muda, conforme invariante).
- `AmbassadorPage.jsx` só considera `ambassador_cities` do próprio usuário → Task 3.
- `Header.jsx` não mostra link para Admin → Task 4.
- Texto residual em `AdminPage.jsx` → Task 5.
- Embaixador não ganha acesso novo → nenhuma task altera guards de `/embaixador` ou `/admin/*` para o papel Embaixador; Task 3 só amplia o que Master/Admin veem *dentro* de uma rota que Embaixador já acessava.

**Placeholder scan:** nenhum "TBD"/"implementar depois" — todo código é completo e copiável. Task 5 tem uma ramificação condicional (Step 1 pode não achar nada), mas isso é uma verificação legítima de estado atual, não um placeholder.

**Type consistency:** `hasGlobalAccess` como nome consistente entre os steps da Task 3. `is_master`/`is_admin` sempre lidos de `user` (contexto `useAuth()`), nunca reinventados. Migration usa `is_master(auth.uid())`/`is_admin(auth.uid())` (funções já existentes, confirmadas via `121_create_master_and_ambassadors.sql`), não reimplementa a lógica.

**Gaps identificados e decisão:** a Task 3, Step 5 exige que o usuário manualmente marque seu próprio perfil como `is_master`/`is_admin` no banco antes do teste — isso é intencional (decisão do usuário: master é sempre manual, fora do app) e não uma lacuna do plano.

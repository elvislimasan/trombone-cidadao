# Métricas de Impacto no Painel do Embaixador Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mostrar no painel do embaixador quantas broncas foram resolvidas em cada cidade que ele modera e quantas ele próprio aprovou nos últimos 30 dias, dando senso de impacto além das filas de pendências.

**Architecture:** Migration adiciona colunas de auditoria de moderação em `reports` e `report_updates`. As duas funções de moderação já existentes em `AmbassadorPage.jsx` passam a gravar quem/quando moderou. Dois novos `useEffect`/fetch calculam os números e um novo bloco de cards os exibe no topo do painel.

**Tech Stack:** React, Supabase JS client, Postgres migration.

## Global Constraints

- `report_updates.status` **não** diferencia "aprovado" de "ainda pendente" (ao aprovar, o código grava `status = 'pending'`, não `'confirmed'` — ver `src/pages/AmbassadorPage.jsx:137` antes da mudança). Por isso a métrica de aprovação de atualizações usa a nova coluna `moderation_decision`, nunca `status`.
- `reports.moderation_status` já é inequívoco (`'approved'`/`'rejected'`/`'pending_approval'`) — não precisa de coluna de decisão extra, só `moderated_by`/`moderated_at`.
- Sem retroatividade: broncas/atualizações moderadas antes desta migration ficam com `moderated_by`/`moderated_at` nulos e não entram na contagem de 30 dias.
- Numeração de migration: usar `128` — `126_reports_map_clusters.sql` (plano de clustering do mapa) e `127_ambassador_onboarding_flag.sql` (plano de onboarding do embaixador) já estão reservados por outros planos ainda não executados. Confirmar no início da Task 1 qual é o maior número já presente no disco antes de fixar `128`.
- Card "Resolvidas por cidade" é quebrado por cidade (uma linha por cidade do embaixador), não somado — decisão já tomada no design.

---

## File Structure

- **Create:** `supabase/migrations/128_ambassador_moderation_audit.sql` — colunas `moderated_by`, `moderated_at` em `reports`; `moderated_by`, `moderated_at`, `moderation_decision` em `report_updates`.
- **Modify:** `src/pages/AmbassadorPage.jsx` — inclui os campos de auditoria nos dois `update()` de moderação existentes; adiciona estado/fetch para as métricas; adiciona o bloco de cards no render.

---

### Task 1: Migration — colunas de auditoria de moderação

**Files:**
- Create: `supabase/migrations/128_ambassador_moderation_audit.sql`

**Interfaces:**
- Produces: `public.reports.moderated_by uuid`, `public.reports.moderated_at timestamptz`, `public.report_updates.moderated_by uuid`, `public.report_updates.moderated_at timestamptz`, `public.report_updates.moderation_decision text` (`'approved'` | `'rejected'` | `null`). Consumidas pela Task 2 (grava) e Task 3 (lê).

- [ ] **Step 1: Confirmar a numeração correta antes de criar o arquivo**

Run: `ls supabase/migrations | sort -n | tail -5`
Expected: usar o próximo número livre acima de `125` (ou acima de `127` se os planos de clustering do mapa e onboarding do embaixador já tiverem sido aplicados nesse meio tempo) — nomear o arquivo com esse número, mantendo o restante do plano coerente mesmo que o número final não seja exatamente `128`.

- [ ] **Step 2: Escrever a migration**

```sql
-- 128_ambassador_moderation_audit.sql

alter table public.reports
  add column if not exists moderated_by uuid references auth.users(id),
  add column if not exists moderated_at timestamptz;

alter table public.report_updates
  add column if not exists moderated_by uuid references auth.users(id),
  add column if not exists moderated_at timestamptz,
  add column if not exists moderation_decision text
    check (moderation_decision in ('approved', 'rejected'));
```

- [ ] **Step 3: Aplicar a migration no banco DEV**

Run: `supabase db push`
Expected: saída confirma a migration aplicada sem erros.

- [ ] **Step 4: Verificar as colunas manualmente**

Run (via SQL editor do Supabase Studio, projeto DEV):
```sql
select moderated_by, moderated_at from public.reports limit 1;
select moderated_by, moderated_at, moderation_decision from public.report_updates limit 1;
```
Expected: ambas as queries rodam sem erro de coluna inexistente; valores existentes são `null`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/128_ambassador_moderation_audit.sql
git commit -m "feat(embaixador): colunas de auditoria de moderação (moderated_by/at/decision)"
```

---

### Task 2: Gravar quem/quando moderou nas ações existentes

**Files:**
- Modify: `src/pages/AmbassadorPage.jsx:116-148` (`handleReportAction`, `handleUpdateAction`)

**Interfaces:**
- Consumes: colunas da Task 1; `user.id` (já disponível via `useAuth()` no topo do componente, linha 15).
- Produces: nenhuma interface nova — efeito colateral (grava dados) consumido pela Task 3.

- [ ] **Step 1: Incluir `moderated_by`/`moderated_at` no update de `handleReportAction`**

Localizar (linhas 116-131):
```js
  const handleReportAction = async (reportId, newStatus) => {
    setActionLoadingId(`report-${reportId}-${newStatus}`);
    const { error } = await supabase
      .from('reports')
      .update({ moderation_status: newStatus, ...(newStatus === 'approved' ? { status: 'pending' } : {}) })
      .eq('id', reportId);

    if (error) {
      toast({ title: 'Erro ao processar bronca', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: newStatus === 'approved' ? 'Bronca aprovada!' : 'Bronca rejeitada!' });
      const cityIds = myCities.map(c => c.city_id);
      fetchPendingReports(cityIds);
    }
    setActionLoadingId(null);
  };
```

Substituir por:
```js
  const handleReportAction = async (reportId, newStatus) => {
    setActionLoadingId(`report-${reportId}-${newStatus}`);
    const { error } = await supabase
      .from('reports')
      .update({
        moderation_status: newStatus,
        moderated_by: user.id,
        moderated_at: new Date().toISOString(),
        ...(newStatus === 'approved' ? { status: 'pending' } : {}),
      })
      .eq('id', reportId);

    if (error) {
      toast({ title: 'Erro ao processar bronca', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: newStatus === 'approved' ? 'Bronca aprovada!' : 'Bronca rejeitada!' });
      const cityIds = myCities.map(c => c.city_id);
      fetchPendingReports(cityIds);
      fetchResolvedCounts(cityIds);
      fetchMyApprovalsCount();
    }
    setActionLoadingId(null);
  };
```

- [ ] **Step 2: Incluir `moderated_by`/`moderated_at`/`moderation_decision` no update de `handleUpdateAction`**

Localizar (linhas 133-148):
```js
  const handleUpdateAction = async (updateId, newStatus) => {
    setActionLoadingId(`update-${updateId}-${newStatus}`);
    const { error } = await supabase
      .from('report_updates')
      .update({ status: newStatus === 'approved' ? 'pending' : 'rejected' })
      .eq('id', updateId);

    if (error) {
      toast({ title: 'Erro ao processar atualização', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: newStatus === 'approved' ? 'Atualização aprovada!' : 'Atualização rejeitada!' });
      const cityIds = myCities.map(c => c.city_id);
      fetchPendingUpdates(cityIds);
    }
    setActionLoadingId(null);
  };
```

Substituir por:
```js
  const handleUpdateAction = async (updateId, newStatus) => {
    setActionLoadingId(`update-${updateId}-${newStatus}`);
    const { error } = await supabase
      .from('report_updates')
      .update({
        status: newStatus === 'approved' ? 'pending' : 'rejected',
        moderated_by: user.id,
        moderated_at: new Date().toISOString(),
        moderation_decision: newStatus,
      })
      .eq('id', updateId);

    if (error) {
      toast({ title: 'Erro ao processar atualização', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: newStatus === 'approved' ? 'Atualização aprovada!' : 'Atualização rejeitada!' });
      const cityIds = myCities.map(c => c.city_id);
      fetchPendingUpdates(cityIds);
      fetchMyApprovalsCount();
    }
    setActionLoadingId(null);
  };
```

(Note: `fetchResolvedCounts` e `fetchMyApprovalsCount` são definidas na Task 3 — este passo já referencia os nomes finais para não exigir retrabalho.)

- [ ] **Step 3: Rodar o build (vai falhar até a Task 3 definir as duas funções — esperado neste ponto)**

Run: `npm run build`
Expected: FAIL com erro `fetchResolvedCounts is not defined` (ou `fetchMyApprovalsCount is not defined`). Isso é esperado — a Task 3 define essas funções a seguir. Não commitar ainda um estado quebrado: prosseguir direto para a Task 3 antes de commitar esta mudança (ver Step 4).

- [ ] **Step 4: Commit conjunto com a Task 3**

Este arquivo (`AmbassadorPage.jsx`) recebe mudanças da Task 2 e da Task 3 no mesmo componente. Para não deixar o build quebrado entre commits, o commit desta task acontece junto com o Step final da Task 3 — não criar um commit isolado aqui.

---

### Task 3: Buscar e exibir as métricas no topo do painel

**Files:**
- Modify: `src/pages/AmbassadorPage.jsx:17-30` (novo estado), `src/pages/AmbassadorPage.jsx:37-51` (novo fetch ao lado de `fetchMyCities`), `src/pages/AmbassadorPage.jsx:104-114` (novo `useEffect`), `src/pages/AmbassadorPage.jsx:170-185` (render dos cards)

**Interfaces:**
- Consumes: `moderated_by`/`moderated_at`/`moderation_decision` (Task 1); `user.id`, `myCities` (já existentes no componente).
- Produces: nenhuma interface nova exposta a outros arquivos — última task, fecha a feature.

- [ ] **Step 1: Adicionar estado para as métricas**

Localizar (linhas 18-29, blocos de estado existentes):
```js
  // State for "Minhas Cidades"
  const [myCities, setMyCities] = useState([]);
  const [loadingCities, setLoadingCities] = useState(true);

  // State for "Broncas pendentes"
  const [pendingReports, setPendingReports] = useState([]);
  const [loadingReports, setLoadingReports] = useState(true);
  const [actionLoadingId, setActionLoadingId] = useState(null);

  // State for "Atualizações pendentes"
  const [pendingUpdates, setPendingUpdates] = useState([]);
  const [loadingUpdates, setLoadingUpdates] = useState(true);
```

Substituir por (adiciona os dois novos blocos ao final):
```js
  // State for "Minhas Cidades"
  const [myCities, setMyCities] = useState([]);
  const [loadingCities, setLoadingCities] = useState(true);

  // State for "Broncas pendentes"
  const [pendingReports, setPendingReports] = useState([]);
  const [loadingReports, setLoadingReports] = useState(true);
  const [actionLoadingId, setActionLoadingId] = useState(null);

  // State for "Atualizações pendentes"
  const [pendingUpdates, setPendingUpdates] = useState([]);
  const [loadingUpdates, setLoadingUpdates] = useState(true);

  // State for "Métricas de impacto"
  const [resolvedCounts, setResolvedCounts] = useState([]); // [{ city_id, city_name, count }]
  const [myApprovalsCount, setMyApprovalsCount] = useState(0);
  const [loadingMetrics, setLoadingMetrics] = useState(true);
```

- [ ] **Step 2: Adicionar `fetchResolvedCounts` e `fetchMyApprovalsCount`**

Localizar (logo após o fechamento de `fetchPendingUpdates`, linhas 75-102, antes do bloco de `useEffect` na linha 104):
```js
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

  useEffect(() => {
    fetchMyCities();
  }, [fetchMyCities]);
```

Substituir por (adiciona as duas novas funções entre `fetchPendingUpdates` e o `useEffect`):
```js
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

  const fetchResolvedCounts = useCallback(async (cityIds) => {
    if (!cityIds || cityIds.length === 0) {
      setResolvedCounts([]);
      setLoadingMetrics(false);
      return;
    }
    setLoadingMetrics(true);
    const { data, error } = await supabase
      .from('reports')
      .select('city_id')
      .eq('status', 'resolved')
      .in('city_id', cityIds);

    if (error) {
      toast({ title: 'Erro ao buscar métricas', description: error.message, variant: 'destructive' });
      setLoadingMetrics(false);
      return;
    }

    const countByCity = new Map();
    for (const r of data || []) {
      countByCity.set(r.city_id, (countByCity.get(r.city_id) || 0) + 1);
    }
    const counts = myCities.map(ac => ({
      city_id: ac.city_id,
      city_name: getCityNameById(ac.city_id),
      count: countByCity.get(ac.city_id) || 0,
    }));
    setResolvedCounts(counts);
    setLoadingMetrics(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toast, myCities]);

  const fetchMyApprovalsCount = useCallback(async () => {
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    const [reportsRes, updatesRes] = await Promise.all([
      supabase
        .from('reports')
        .select('id', { count: 'exact', head: true })
        .eq('moderated_by', user.id)
        .eq('moderation_status', 'approved')
        .gte('moderated_at', since),
      supabase
        .from('report_updates')
        .select('id', { count: 'exact', head: true })
        .eq('moderated_by', user.id)
        .eq('moderation_decision', 'approved')
        .gte('moderated_at', since),
    ]);

    const reportsCount = reportsRes.count || 0;
    const updatesCount = updatesRes.count || 0;
    setMyApprovalsCount(reportsCount + updatesCount);
  }, [user.id]);

  useEffect(() => {
    fetchMyCities();
  }, [fetchMyCities]);
```

- [ ] **Step 3: Disparar os novos fetches junto com os existentes**

Localizar (linhas 108-114):
```js
  useEffect(() => {
    if (!loadingCities) {
      const cityIds = myCities.map(c => c.city_id);
      fetchPendingReports(cityIds);
      fetchPendingUpdates(cityIds);
    }
  }, [myCities, loadingCities, fetchPendingReports, fetchPendingUpdates]);
```

Substituir por:
```js
  useEffect(() => {
    if (!loadingCities) {
      const cityIds = myCities.map(c => c.city_id);
      fetchPendingReports(cityIds);
      fetchPendingUpdates(cityIds);
      fetchResolvedCounts(cityIds);
      fetchMyApprovalsCount();
    }
  }, [myCities, loadingCities, fetchPendingReports, fetchPendingUpdates, fetchResolvedCounts, fetchMyApprovalsCount]);
```

- [ ] **Step 4: Renderizar os cards de métricas, entre o banner de onboarding e as `Tabs`**

Localizar (o ponto de inserção depende de a Task 3 do plano `2026-07-20-onboarding-embaixador.md` já ter sido executada; se sim, o banner condicional já está no lugar indicado abaixo — inserir os cards de métrica logo depois dele. Se a task de onboarding ainda não rodou, inserir no mesmo local, logo antes de `<Tabs defaultValue="cities"`):

```js
        <Tabs defaultValue="cities" className="w-full">
```

Inserir imediatamente antes dessa linha:
```js
        {!loadingMetrics && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Resolvidas por cidade
                </CardTitle>
              </CardHeader>
              <CardContent>
                {resolvedCounts.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Sem dados ainda.</p>
                ) : (
                  <ul className="space-y-1">
                    {resolvedCounts.map(rc => (
                      <li key={rc.city_id} className="flex items-center justify-between text-sm">
                        <span className="text-foreground">{rc.city_name}</span>
                        <span className="font-bold text-tc-red">{rc.count}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Suas aprovações (30 dias)
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold text-tc-red">{myApprovalsCount}</p>
              </CardContent>
            </Card>
          </div>
        )}

        <Tabs defaultValue="cities" className="w-full">
```

- [ ] **Step 5: Rodar o build**

Run: `npm run build`
Expected: build finaliza sem erros (as funções `fetchResolvedCounts`/`fetchMyApprovalsCount` da Task 2 agora estão definidas).

- [ ] **Step 6: Testar manualmente no navegador**

Run: `npm run dev`, logar como embaixador de ao menos uma cidade, acessar `/embaixador`.
Expected:
- Cards aparecem acima das abas: "Resolvidas por cidade" com uma linha por cidade e contagem; "Suas aprovações (30 dias)" com um número.
- Aprovar uma bronca ou atualização pendente na fila: após a ação, os cards atualizam (o número de aprovações incrementa; se a bronca aprovada virar `resolved` depois, o card de resolvidas refletirá na próxima carga).
- Com nenhuma bronca resolvida ainda: card mostra "Sem dados ainda." em vez de lista vazia quebrada.

- [ ] **Step 7: Commit (fecha também a Task 2)**

```bash
git add src/pages/AmbassadorPage.jsx
git commit -m "feat(embaixador): cards de métricas de impacto (resolvidas por cidade e aprovações em 30 dias)"
```

---

## Self-Review

**Spec coverage:**
- Migration com `moderated_by`/`moderated_at` em `reports`, e `moderated_by`/`moderated_at`/`moderation_decision` em `report_updates` → Task 1.
- Gravação nos updates existentes → Task 2.
- Card "Resolvidas por cidade" quebrado por cidade → Task 3, Step 2 (`fetchResolvedCounts`) + Step 4 (render).
- Card "Suas aprovações (30 dias)" somando reports + report_updates → Task 3, Step 2 (`fetchMyApprovalsCount`).
- Ambiguidade de `report_updates.status='pending'` ao aprovar, resolvida via `moderation_decision` → Task 1 (coluna) + Task 2 (gravação) + Task 3 (leitura usa `moderation_decision`, nunca `status`).
- Sem retroatividade → confirmado, nenhuma task faz backfill dos dados existentes.

**Placeholder scan:** nenhum "TBD"/"implementar depois" — todo código é completo e copiável.

**Type consistency:** `resolvedCounts` sempre `[{ city_id, city_name, count }]` entre Task 3 Step 2 (produz) e Step 4 (consome). `myApprovalsCount` sempre `number`. Nomes de função (`fetchResolvedCounts`, `fetchMyApprovalsCount`) idênticos entre a referência antecipada na Task 2 e a definição na Task 3 — consistente.

**Gaps identificados:** a Task 2 sozinha deixa o build quebrado (funções referenciadas antes de existir) — resolvido explicitamente ao instruir que o commit das Tasks 2 e 3 acontece junto (Task 2 Step 4 e Task 3 Step 7), evitando um estado intermediário quebrado no histórico do git.

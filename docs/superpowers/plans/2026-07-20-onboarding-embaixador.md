# Onboarding do Embaixador Recém-Aceito Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redirecionar o CTA de aceite de convite direto para o painel do embaixador, e mostrar um banner dismissable (persistido no banco) explicando as 3 abas do painel na primeira visita.

**Architecture:** Uma migration adiciona `profiles.has_seen_ambassador_onboarding`. `AcceptInvitePage.jsx` muda o destino de navegação. `AmbassadorPage.jsx` renderiza um banner condicional que, ao ser fechado, persiste o flag via update direto na tabela `profiles`.

**Tech Stack:** React, Supabase JS client, Postgres migration.

## Global Constraints

- Flag é por usuário (`profiles`), não por cidade (`ambassador_cities`) — o tour é sobre a UI do painel em si, não específico de uma cidade.
- `SupabaseAuthContext.jsx:60-64` já faz `supabase.from('profiles').select('*')` — a nova coluna chega automaticamente em `user.has_seen_ambassador_onboarding`, sem qualquer mudança nesse arquivo.
- Fechar o banner deve esconder visualmente de imediato (atualização otimista), sem esperar a resposta do `update` no banco.
- Numeração de migration: usar `127` — `126_reports_map_clusters.sql` já está reservado por outro plano (`docs/superpowers/plans/2026-07-20-mapa-clustering-nacional.md`) que ainda não foi executado; a última migration de fato aplicada no disco é `125_fix_ambassador_invites_insert_policy.sql`. Confirmar no início da Task 1 se `126` já existe no disco antes de criar `127` (caso o plano do mapa já tenha sido executado nesse meio tempo).

---

## File Structure

- **Create:** `supabase/migrations/127_ambassador_onboarding_flag.sql` — adiciona a coluna `has_seen_ambassador_onboarding` em `profiles`.
- **Modify:** `src/pages/AcceptInvitePage.jsx:99-104` — destino e texto do CTA de sucesso.
- **Modify:** `src/pages/AmbassadorPage.jsx` — novo banner dismissable renderizado condicionalmente.

---

### Task 1: Migration — coluna `has_seen_ambassador_onboarding`

**Files:**
- Create: `supabase/migrations/127_ambassador_onboarding_flag.sql`

**Interfaces:**
- Produces: coluna `public.profiles.has_seen_ambassador_onboarding boolean not null default false`, consumida por `user.has_seen_ambassador_onboarding` no frontend (Task 3) e atualizada via `supabase.from('profiles').update({ has_seen_ambassador_onboarding: true })` (Task 3).

- [ ] **Step 1: Confirmar a numeração correta antes de criar o arquivo**

Run: `ls supabase/migrations | sort -n | tail -5`
Expected: se `126_reports_map_clusters.sql` já existir no disco, usar `127` para esta migration (conforme já planejado); se não existir, também usar `127` mesmo assim, para preservar a ordem combinada entre os dois planos e evitar colisão futura quando ambos forem aplicados.

- [ ] **Step 2: Escrever a migration**

```sql
-- 127_ambassador_onboarding_flag.sql

alter table public.profiles
  add column if not exists has_seen_ambassador_onboarding boolean not null default false;
```

- [ ] **Step 3: Aplicar a migration no banco DEV**

Run: `supabase db push`
Expected: saída confirma `127_ambassador_onboarding_flag.sql` aplicada sem erros.

- [ ] **Step 4: Verificar a coluna manualmente**

Run (via SQL editor do Supabase Studio, projeto DEV):
```sql
select id, has_seen_ambassador_onboarding from public.profiles limit 5;
```
Expected: coluna existe, todos os valores retornados são `false` (default aplicado às linhas existentes).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/127_ambassador_onboarding_flag.sql
git commit -m "feat(embaixador): coluna profiles.has_seen_ambassador_onboarding"
```

---

### Task 2: `AcceptInvitePage.jsx` — CTA aponta para o painel do embaixador

**Files:**
- Modify: `src/pages/AcceptInvitePage.jsx:99-104`

**Interfaces:**
- Consumes: nenhuma dependência de outras tasks — mudança isolada de navegação client-side.
- Produces: nenhuma interface nova.

- [ ] **Step 1: Trocar destino e texto do botão de sucesso**

Localizar (linhas 99-104):
```js
        <button
          onClick={() => navigate('/', { replace: true })}
          className="px-6 py-3 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 transition-colors"
        >
          Ver feed
        </button>
```

Substituir por:
```js
        <button
          onClick={() => navigate('/embaixador', { replace: true })}
          className="px-6 py-3 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 transition-colors"
        >
          Ir para o Painel
        </button>
```

- [ ] **Step 2: Rodar o build**

Run: `npm run build`
Expected: build finaliza sem erros.

- [ ] **Step 3: Testar manualmente no navegador**

Run: `npm run dev`. Gerar um convite de teste (via `/admin/embaixadores`), abrir o link `/convite/<token>` logado com uma conta que ainda não é embaixador daquela cidade.
Expected: após "Bem-vindo, embaixador!", o botão mostra "Ir para o Painel" e ao clicar navega para `/embaixador` (não mais para `/`).

- [ ] **Step 4: Commit**

```bash
git add src/pages/AcceptInvitePage.jsx
git commit -m "feat(embaixador): CTA de aceite de convite leva direto ao painel"
```

---

### Task 3: `AmbassadorPage.jsx` — banner de boas-vindas dismissable

**Files:**
- Modify: `src/pages/AmbassadorPage.jsx:1-15` (imports e estado), `src/pages/AmbassadorPage.jsx:170-185` (render, entre o header e as `Tabs`)

**Interfaces:**
- Consumes: `user.has_seen_ambassador_onboarding` (Task 1, chega via `useAuth()` já existente na linha 15); `supabase` (já importado na linha 11).
- Produces: nenhuma interface nova exposta a outros arquivos.

- [ ] **Step 1: Adicionar import do ícone `X` e estado local do banner**

Localizar (linha 4):
```js
import { Check, X, MapPin, FileText, Megaphone, Loader2, Users, ShieldCheck, Copy, Link2, Search } from 'lucide-react';
```

`X` já está importado — nenhuma mudança de import necessária.

Localizar (linhas 14-16):
```js
const AmbassadorPage = () => {
  const { user } = useAuth();
  const { toast } = useToast();
```

Substituir por:
```js
const AmbassadorPage = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [showOnboardingBanner, setShowOnboardingBanner] = useState(
    user ? user.has_seen_ambassador_onboarding === false : false
  );
```

- [ ] **Step 2: Escrever o handler de fechar o banner**

Localizar (logo após a função `getCityNameById`, linhas 156-161):
```js
  const getCityNameById = (cityId) => {
    const found = myCities.find(c => c.city_id === cityId);
    if (!found) return '';
    const city = found.cities;
    return city ? `${city.name} - ${city.states?.uf || ''}` : '';
  };
```

Adicionar logo abaixo:
```js

  const handleDismissOnboarding = async () => {
    setShowOnboardingBanner(false);
    await supabase
      .from('profiles')
      .update({ has_seen_ambassador_onboarding: true })
      .eq('id', user.id);
  };
```

- [ ] **Step 3: Renderizar o banner entre o header e as `Tabs`**

Localizar (linhas 176-185):
```js
          <div className="flex items-center gap-3 mb-2">
            <ShieldCheck className="w-8 h-8 text-tc-red" />
            <h1 className="text-3xl md:text-4xl font-bold text-tc-red">Painel do Embaixador</h1>
          </div>
          <p className="text-muted-foreground text-base">
            Modere o conteúdo da sua cidade e mantenha a plataforma de qualidade.
          </p>
        </motion.div>

        <Tabs defaultValue="cities" className="w-full">
```

Substituir por:
```js
          <div className="flex items-center gap-3 mb-2">
            <ShieldCheck className="w-8 h-8 text-tc-red" />
            <h1 className="text-3xl md:text-4xl font-bold text-tc-red">Painel do Embaixador</h1>
          </div>
          <p className="text-muted-foreground text-base">
            Modere o conteúdo da sua cidade e mantenha a plataforma de qualidade.
          </p>
        </motion.div>

        {showOnboardingBanner && (
          <Card className="mb-6 border-tc-red/30 bg-tc-red/5">
            <CardContent className="p-4 flex items-start gap-3">
              <ShieldCheck className="w-5 h-5 text-tc-red shrink-0 mt-0.5" />
              <p className="flex-1 text-sm text-foreground">
                Bem-vindo ao seu painel! Em <strong>Minhas Cidades</strong> você vê onde atua;
                em <strong>Broncas Pendentes</strong> e <strong>Atualizações Pendentes</strong> você
                aprova ou rejeita o que chega da sua cidade.
              </p>
              <button
                type="button"
                onClick={handleDismissOnboarding}
                className="text-muted-foreground hover:text-foreground shrink-0"
                aria-label="Fechar aviso"
              >
                <X className="w-4 h-4" />
              </button>
            </CardContent>
          </Card>
        )}

        <Tabs defaultValue="cities" className="w-full">
```

- [ ] **Step 4: Rodar o build**

Run: `npm run build`
Expected: build finaliza sem erros.

- [ ] **Step 5: Testar manualmente no navegador**

Run: `npm run dev`, logar com uma conta embaixadora que tenha `has_seen_ambassador_onboarding = false` (ou setar manualmente via SQL editor: `update profiles set has_seen_ambassador_onboarding = false where id = '<seu-user-id>';`), acessar `/embaixador`.
Expected:
- Banner aparece acima das abas, com o texto explicando as 3 abas.
- Clicar no X: banner some imediatamente.
- Recarregar a página (F5): banner não aparece mais (flag persistido no banco).
- Verificar no SQL editor: `select has_seen_ambassador_onboarding from profiles where id = '<seu-user-id>';` retorna `true`.

- [ ] **Step 6: Commit**

```bash
git add src/pages/AmbassadorPage.jsx
git commit -m "feat(embaixador): banner de boas-vindas dismissable no painel"
```

---

## Self-Review

**Spec coverage:**
- Coluna `has_seen_ambassador_onboarding` em `profiles`, por usuário → Task 1.
- CTA de sucesso leva a `/embaixador` com texto "Ir para o Painel" → Task 2.
- Banner explicando as 3 abas, dismissable, persistido no banco → Task 3.
- Nenhuma mudança na Edge Function → confirmado, nenhuma task toca em `supabase/functions/`.

**Placeholder scan:** nenhum "TBD"/"implementar depois" — todo código é completo.

**Type consistency:** `user.has_seen_ambassador_onboarding` tratado como booleano em toda parte (Task 1 define o default `false`, Task 3 lê e escreve `true`/`false` de forma consistente). `handleDismissOnboarding` não recebe parâmetros e usa `user.id` do escopo do componente, coerente com o padrão de outros handlers no mesmo arquivo (ex: `handleReportAction`, que também usa `user`/estado local do componente).

**Gaps identificados:** nenhum.

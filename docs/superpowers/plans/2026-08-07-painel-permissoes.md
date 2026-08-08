# Painel de Permissões — Plano de Implementação

**Spec:** `docs/superpowers/specs/2026-08-07-painel-permissoes-design.md`

**Goal:** Master pode revogar acesso de escrita a módulos de gestão, por cargo
ou por usuário específico.

**Arquitetura:** Tabela `permission_rules` + função `can_write()` no banco,
aplicada de forma aditiva nas policies de escrita existentes. No frontend, um
hook `usePermissions()` alimenta guardas de rota e a visibilidade de botões.

**Tech Stack:** Supabase (Postgres/RLS), React 18, Vite, Tailwind.

## Global Constraints

- Todas as migrações vão **apenas** para o banco de dev (`xxdletrjyjajtrmhwzev`).
- **Nada é commitado** até o usuário testar e aprovar.
- A mudança é aditiva: com `permission_rules` vazia, o comportamento atual se
  mantém idêntico para todos os usuários.
- Master nunca é bloqueado, em nenhuma camada.
- Módulos: `works`, `rentals`, `pavement`, `services`, `moderation`.
- Cargos: `ambassador`, `admin`.

---

### Task 1: Tabela `permission_rules` e função `can_write`

**Files:**
- Create: `supabase/migrations/164_permission_rules.sql`

- [ ] **Step 1: Criar a migração**

```sql
-- 164_permission_rules.sql
-- Painel de permissões: master revoga escrita por cargo ou por usuário.
-- Modelo de bloqueio sobre padrão liberado — com a tabela vazia, ninguém é
-- afetado. Resolução: master → regra de usuário → regra de cargo → liberado.

create table if not exists public.permission_rules (
  id          bigint generated always as identity primary key,
  scope       text not null check (scope in ('role','user')),
  role_name   text check (role_name in ('ambassador','admin')),
  user_id     uuid references auth.users(id) on delete cascade,
  module      text not null check (module in
                ('works','rentals','pavement','services','moderation')),
  allowed     boolean not null,
  created_at  timestamptz not null default now(),
  constraint permission_rules_scope_fields check (
    (scope = 'role' and role_name is not null and user_id is null) or
    (scope = 'user' and user_id  is not null and role_name is null)
  )
);

create unique index if not exists uq_permission_rules_role
  on public.permission_rules (role_name, module) where scope = 'role';
create unique index if not exists uq_permission_rules_user
  on public.permission_rules (user_id, module) where scope = 'user';

alter table public.permission_rules enable row level security;

-- Leitura liberada para autenticados: o frontend precisa saber as próprias
-- permissões para esconder botões e proteger rotas.
drop policy if exists permission_rules_select on public.permission_rules;
create policy permission_rules_select on public.permission_rules
  for select to authenticated using (true);

-- Só master administra as regras.
drop policy if exists permission_rules_write on public.permission_rules;
create policy permission_rules_write on public.permission_rules
  for all to authenticated
  using (public.is_master(auth.uid()))
  with check (public.is_master(auth.uid()));

-- Resolve a permissão de escrita de um usuário num módulo.
create or replace function public.can_write(p_user uuid, p_module text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    -- Master nunca é bloqueado.
    when public.is_master(p_user) then true
    else coalesce(
      -- 1) Regra específica do usuário vence qualquer coisa.
      (select allowed from public.permission_rules
        where scope = 'user' and user_id = p_user and module = p_module
        limit 1),
      -- 2) Regra do cargo do usuário.
      (select pr.allowed from public.permission_rules pr
        join public.profiles p on p.id = p_user
        where pr.scope = 'role'
          and pr.module = p_module
          and ((pr.role_name = 'admin'      and p.is_admin)
            or (pr.role_name = 'ambassador' and p.is_ambassador))
        -- admin é mais forte que ambassador quando o usuário acumula os dois
        order by case pr.role_name when 'admin' then 0 else 1 end
        limit 1),
      -- 3) Padrão: liberado.
      true
    )
  end;
$$;

grant execute on function public.can_write(uuid, text) to authenticated;

notify pgrst, 'reload schema';
```

- [ ] **Step 2: Aplicar no dev**

Run: `npx supabase db push --linked`
Expected: `Applying migration 164_permission_rules.sql...`

- [ ] **Step 3: Verificar o padrão liberado (tabela vazia)**

Run:
```bash
npx supabase db query "select public.can_write((select id from public.profiles where is_ambassador limit 1), 'works') as deve_ser_true;" --linked
```
Expected: `true` — sem regras cadastradas, ninguém perde acesso.

- [ ] **Step 4: Verificar bloqueio por cargo e exceção por usuário**

Run:
```bash
npx supabase db query "
  insert into public.permission_rules (scope, role_name, module, allowed)
    values ('role','ambassador','works', false);
  select public.can_write((select id from public.profiles where is_ambassador and not is_master limit 1), 'works') as deve_ser_false;
  insert into public.permission_rules (scope, user_id, module, allowed)
    select 'user', id, 'works', true from public.profiles where is_ambassador and not is_master limit 1;
  select public.can_write((select id from public.profiles where is_ambassador and not is_master limit 1), 'works') as deve_ser_true;
  select public.can_write((select id from public.profiles where is_master limit 1), 'works') as master_sempre_true;
  delete from public.permission_rules;
" --linked
```
Expected: `false`, depois `true` (exceção do usuário vence o cargo), e `true`
para master. A limpeza no fim deixa o banco no estado original.

---

### Task 2: Aplicar `can_write` nas policies de escrita

**Files:**
- Create: `supabase/migrations/165_permission_rules_policies.sql`

**Interfaces:**
- Consumes: `public.can_write(uuid, text)` da Task 1.

- [ ] **Step 1: Criar a migração**

Cada policy de gestor/moderador ganha `and public.can_write(auth.uid(), '<módulo>')`.
As expressões abaixo reproduzem as atuais (extraídas de `pg_policies`) com a
condição extra. Policies de cidadão comum não são tocadas.

```sql
-- 165_permission_rules_policies.sql
-- Aplica can_write() nas policies de ESCRITA de gestor/moderador.
-- Não altera policies de cidadão comum: um embaixador sem permissão de
-- moderação continua podendo criar/editar as próprias broncas.

-- helper local: expressão de gestor usada nas tabelas nacionalizadas
-- (coalesce(is_admin or is_master) or is_ambassador_of(uid, city_id))

-- ── works: public_works ──
drop policy if exists works_gestor_insert on public.public_works;
create policy works_gestor_insert on public.public_works for insert
  with check (
    (coalesce((select (p.is_admin or p.is_master) from public.profiles p where p.id = auth.uid()), false)
      or public.is_ambassador_of(auth.uid(), city_id))
    and public.can_write(auth.uid(), 'works')
  );

drop policy if exists works_gestor_update on public.public_works;
create policy works_gestor_update on public.public_works for update
  using (
    (coalesce((select (p.is_admin or p.is_master) from public.profiles p where p.id = auth.uid()), false)
      or public.is_ambassador_of(auth.uid(), city_id))
    and public.can_write(auth.uid(), 'works')
  );

drop policy if exists works_gestor_delete on public.public_works;
create policy works_gestor_delete on public.public_works for delete
  using (
    (coalesce((select (p.is_admin or p.is_master) from public.profiles p where p.id = auth.uid()), false)
      or public.is_ambassador_of(auth.uid(), city_id))
    and public.can_write(auth.uid(), 'works')
  );

-- A policy ALL de admin também precisa da checagem, senão um admin bloqueado
-- continuaria passando por ela.
drop policy if exists "Admins can perform any action on public_works" on public.public_works;
create policy "Admins can perform any action on public_works" on public.public_works
  for all
  using (public.is_admin(auth.uid()) and public.can_write(auth.uid(), 'works'))
  with check (public.is_admin(auth.uid()) and public.can_write(auth.uid(), 'works'));

-- ── rentals: rental_properties ──
drop policy if exists rental_properties_gestor_insert on public.rental_properties;
create policy rental_properties_gestor_insert on public.rental_properties for insert
  with check (
    (coalesce((select (p.is_admin or p.is_master) from public.profiles p where p.id = auth.uid()), false)
      or public.is_ambassador_of(auth.uid(), city_id))
    and public.can_write(auth.uid(), 'rentals')
  );

drop policy if exists rental_properties_gestor_update on public.rental_properties;
create policy rental_properties_gestor_update on public.rental_properties for update
  using (
    (coalesce((select (p.is_admin or p.is_master) from public.profiles p where p.id = auth.uid()), false)
      or public.is_ambassador_of(auth.uid(), city_id))
    and public.can_write(auth.uid(), 'rentals')
  );

drop policy if exists rental_properties_gestor_delete on public.rental_properties;
create policy rental_properties_gestor_delete on public.rental_properties for delete
  using (
    (coalesce((select (p.is_admin or p.is_master) from public.profiles p where p.id = auth.uid()), false)
      or public.is_ambassador_of(auth.uid(), city_id))
    and public.can_write(auth.uid(), 'rentals')
  );

-- ── pavement: pavement_streets ──
drop policy if exists pavement_streets_gestor_insert on public.pavement_streets;
create policy pavement_streets_gestor_insert on public.pavement_streets for insert
  with check (
    (coalesce((select (p.is_admin or p.is_master) from public.profiles p where p.id = auth.uid()), false)
      or public.is_ambassador_of(auth.uid(), city_id))
    and public.can_write(auth.uid(), 'pavement')
  );

drop policy if exists pavement_streets_gestor_update on public.pavement_streets;
create policy pavement_streets_gestor_update on public.pavement_streets for update
  using (
    (coalesce((select (p.is_admin or p.is_master) from public.profiles p where p.id = auth.uid()), false)
      or public.is_ambassador_of(auth.uid(), city_id))
    and public.can_write(auth.uid(), 'pavement')
  )
  with check (
    (coalesce((select (p.is_admin or p.is_master) from public.profiles p where p.id = auth.uid()), false)
      or public.is_ambassador_of(auth.uid(), city_id))
    and public.can_write(auth.uid(), 'pavement')
  );

drop policy if exists pavement_streets_gestor_delete on public.pavement_streets;
create policy pavement_streets_gestor_delete on public.pavement_streets for delete
  using (
    (coalesce((select (p.is_admin or p.is_master) from public.profiles p where p.id = auth.uid()), false)
      or public.is_ambassador_of(auth.uid(), city_id))
    and public.can_write(auth.uid(), 'pavement')
  );

-- ── services: transport, tourist_spots, directory ──
drop policy if exists transport_gestor_insert on public.transport;
create policy transport_gestor_insert on public.transport for insert
  with check (
    (coalesce((select (p.is_admin or p.is_master) from public.profiles p where p.id = auth.uid()), false)
      or public.is_ambassador_of(auth.uid(), city_id))
    and public.can_write(auth.uid(), 'services')
  );

drop policy if exists transport_gestor_update on public.transport;
create policy transport_gestor_update on public.transport for update
  using (
    (coalesce((select (p.is_admin or p.is_master) from public.profiles p where p.id = auth.uid()), false)
      or public.is_ambassador_of(auth.uid(), city_id))
    and public.can_write(auth.uid(), 'services')
  );

drop policy if exists transport_gestor_delete on public.transport;
create policy transport_gestor_delete on public.transport for delete
  using (
    (coalesce((select (p.is_admin or p.is_master) from public.profiles p where p.id = auth.uid()), false)
      or public.is_ambassador_of(auth.uid(), city_id))
    and public.can_write(auth.uid(), 'services')
  );

drop policy if exists tourist_spots_gestor_insert on public.tourist_spots;
create policy tourist_spots_gestor_insert on public.tourist_spots for insert
  with check (
    (coalesce((select (p.is_admin or p.is_master) from public.profiles p where p.id = auth.uid()), false)
      or public.is_ambassador_of(auth.uid(), city_id))
    and public.can_write(auth.uid(), 'services')
  );

drop policy if exists tourist_spots_gestor_update on public.tourist_spots;
create policy tourist_spots_gestor_update on public.tourist_spots for update
  using (
    (coalesce((select (p.is_admin or p.is_master) from public.profiles p where p.id = auth.uid()), false)
      or public.is_ambassador_of(auth.uid(), city_id))
    and public.can_write(auth.uid(), 'services')
  );

drop policy if exists tourist_spots_gestor_delete on public.tourist_spots;
create policy tourist_spots_gestor_delete on public.tourist_spots for delete
  using (
    (coalesce((select (p.is_admin or p.is_master) from public.profiles p where p.id = auth.uid()), false)
      or public.is_ambassador_of(auth.uid(), city_id))
    and public.can_write(auth.uid(), 'services')
  );

drop policy if exists directory_gestor_insert on public.directory;
create policy directory_gestor_insert on public.directory for insert
  with check (
    (coalesce((select (p.is_admin or p.is_master) from public.profiles p where p.id = auth.uid()), false)
      or public.is_ambassador_of(auth.uid(), city_id))
    and public.can_write(auth.uid(), 'services')
  );

drop policy if exists directory_gestor_update on public.directory;
create policy directory_gestor_update on public.directory for update
  using (
    (coalesce((select (p.is_admin or p.is_master) from public.profiles p where p.id = auth.uid()), false)
      or public.is_ambassador_of(auth.uid(), city_id))
    and public.can_write(auth.uid(), 'services')
  );

drop policy if exists directory_gestor_delete on public.directory;
create policy directory_gestor_delete on public.directory for delete
  using (
    (coalesce((select (p.is_admin or p.is_master) from public.profiles p where p.id = auth.uid()), false)
      or public.is_ambassador_of(auth.uid(), city_id))
    and public.can_write(auth.uid(), 'services')
  );

-- ── moderation: reports, report_updates ──
drop policy if exists ambassadors_can_update_reports on public.reports;
create policy ambassadors_can_update_reports on public.reports for update
  using (public.is_ambassador_of(auth.uid(), city_id)
         and public.can_write(auth.uid(), 'moderation'));

drop policy if exists ambassadors_can_delete_reports on public.reports;
create policy ambassadors_can_delete_reports on public.reports for delete
  using (public.is_ambassador_of(auth.uid(), city_id)
         and public.can_write(auth.uid(), 'moderation'));

drop policy if exists ambassadors_can_update_report_updates on public.report_updates;
create policy ambassadors_can_update_report_updates on public.report_updates for update
  using (exists (
    select 1 from public.reports r
     where r.id = report_updates.report_id
       and public.is_ambassador_of(auth.uid(), r.city_id)
  ) and public.can_write(auth.uid(), 'moderation'));

drop policy if exists ambassadors_can_delete_report_updates on public.report_updates;
create policy ambassadors_can_delete_report_updates on public.report_updates for delete
  using (exists (
    select 1 from public.reports r
     where r.id = report_updates.report_id
       and public.is_ambassador_of(auth.uid(), r.city_id)
  ) and public.can_write(auth.uid(), 'moderation'));

drop policy if exists "Admins can perform any action on reports" on public.reports;
create policy "Admins can perform any action on reports" on public.reports
  for all
  using (public.is_admin(auth.uid()) and public.can_write(auth.uid(), 'moderation'))
  with check (public.is_admin(auth.uid()) and public.can_write(auth.uid(), 'moderation'));

notify pgrst, 'reload schema';
```

- [ ] **Step 2: Aplicar no dev**

Run: `npx supabase db push --linked`
Expected: `Applying migration 165_permission_rules_policies.sql...`

- [ ] **Step 3: Confirmar que as policies de cidadão comum continuam intactas**

Run:
```bash
npx supabase db query "select policyname from pg_policies where schemaname='public' and policyname in ('Users can update their own reports.','Users can submit to directory.','Author can delete own pending updates','Users can insert their own reports');" --linked
```
Expected: as 4 policies listadas, sem alteração.

- [ ] **Step 4: Confirmar que can_write entrou nas policies de gestor**

Run:
```bash
npx supabase db query "select count(*) as policies_com_can_write from pg_policies where schemaname='public' and (qual like '%can_write%' or with_check like '%can_write%');" --linked
```
Expected: 21.

---

### Task 3: Hook `usePermissions`

**Files:**
- Create: `src/hooks/usePermissions.js`

**Interfaces:**
- Consumes: tabela `permission_rules` (leitura liberada para autenticados).
- Produces: `usePermissions()` → `{ canWrite(module), loading, MODULES }`.

- [ ] **Step 1: Criar o hook**

```js
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';

export const MODULES = {
  works: 'Obras',
  rentals: 'Imóveis Alugados',
  pavement: 'Pavimentação',
  services: 'Serviços',
  moderation: 'Moderação',
};

// Espelha public.can_write() do banco: master → regra de usuário → regra de
// cargo → liberado. Serve só para a UI; o banco continua sendo a autoridade.
export function usePermissions() {
  const { user } = useAuth();
  const [rules, setRules] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.id) { setRules([]); setLoading(false); return; }
    let cancelled = false;
    supabase
      .from('permission_rules')
      .select('scope, role_name, user_id, module, allowed')
      .then(({ data }) => {
        if (cancelled) return;
        setRules(data || []);
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, [user?.id]);

  const canWrite = useMemo(() => (module) => {
    if (!user) return false;
    if (user.is_master) return true;

    const userRule = rules.find(
      (r) => r.scope === 'user' && r.user_id === user.id && r.module === module
    );
    if (userRule) return userRule.allowed;

    // admin vence ambassador quando o usuário acumula os dois papéis
    const roleOrder = [user.is_admin && 'admin', user.is_ambassador && 'ambassador'].filter(Boolean);
    for (const role of roleOrder) {
      const roleRule = rules.find(
        (r) => r.scope === 'role' && r.role_name === role && r.module === module
      );
      if (roleRule) return roleRule.allowed;
    }
    return true;
  }, [rules, user]);

  return { canWrite, loading, MODULES };
}
```

- [ ] **Step 2: Verificar build**

Run: `npm run build`
Expected: build limpo.

---

### Task 4: Guarda de rota por módulo

**Files:**
- Modify: `src/App.jsx`

**Interfaces:**
- Consumes: `usePermissions()` da Task 3.

- [ ] **Step 1: Criar o componente de guarda em `App.jsx`**

Adicionar junto aos outros guards (`AdminRoute`, `AmbassadorOrAdminRoute`):

```jsx
// Bloqueia a rota quando o módulo está sem permissão de escrita para o
// usuário. Envolve o guard de papel já existente — o papel continua sendo
// pré-requisito; a permissão é uma camada a mais.
const ModuleRoute = ({ module, children, adminOnly = false }) => {
  const { canWrite, loading } = usePermissions();
  const Guard = adminOnly ? AdminRoute : AmbassadorOrAdminRoute;
  if (loading) return <div className="flex justify-center items-center h-screen">Carregando...</div>;
  if (!canWrite(module)) return <Navigate to="/" replace />;
  return <Guard>{children}</Guard>;
};
```

- [ ] **Step 2: Aplicar nas rotas**

Substituir os guards atuais pelas versões com módulo:

| Rota | Antes | Depois |
|---|---|---|
| `/obras/gerenciar` | `AmbassadorOrAdminRoute` | `<ModuleRoute module="works">` |
| `/admin/obras` | `AdminRoute` | `<ModuleRoute module="works" adminOnly>` |
| `/admin/obras/opcoes` | `AdminRoute` | `<ModuleRoute module="works" adminOnly>` |
| `/imoveis-alugados/gerenciar` | `AmbassadorOrAdminRoute` | `<ModuleRoute module="rentals">` |
| `/admin/imoveis-alugados` | `AdminRoute` | `<ModuleRoute module="rentals" adminOnly>` |
| `/pavimentacao/gerenciar` | `AmbassadorOrAdminRoute` | `<ModuleRoute module="pavement">` |
| `/admin/pavimentacao` | `AdminRoute` | `<ModuleRoute module="pavement" adminOnly>` |
| `/servicos/gerenciar` | `AmbassadorOrAdminRoute` | `<ModuleRoute module="services">` |
| `/admin/servicos` | `AdminRoute` | `<ModuleRoute module="services" adminOnly>` |
| `/admin/moderacao/:type` | `AdminRoute` | `<ModuleRoute module="moderation" adminOnly>` |
| `/admin/broncas` | `AdminRoute` | `<ModuleRoute module="moderation" adminOnly>` |

- [ ] **Step 3: Verificar build**

Run: `npm run build`
Expected: build limpo.

---

### Task 5: Esconder botões e cards sem permissão

**Files:**
- Modify: `src/pages/PublicWorksPage.jsx` (botão "Adicionar obra")
- Modify: `src/pages/RentalPropertiesPage.jsx` (botão "Adicionar imóvel")
- Modify: `src/pages/PavementMapPage.jsx` (botão "Adicionar rua")
- Modify: `src/pages/ServicesPage.jsx` (botão de gerenciar serviços)
- Modify: `src/pages/AmbassadorPage.jsx` (menu "Gerenciar")
- Modify: `src/pages/admin/AdminPage.jsx` (cards do painel)

**Interfaces:**
- Consumes: `usePermissions()` da Task 3.

- [ ] **Step 1: Páginas públicas**

Em cada página, combinar a permissão com a checagem de papel que já existe:

```js
const { canWrite } = usePermissions();
// exemplo em PublicWorksPage:
const canManageWorks = Boolean(
  (user?.is_admin || user?.is_master ||
    (isPureAmbassador && activeCityId && myActiveCityIds.some((id) => String(id) === String(activeCityId))))
  && canWrite('works')
);
```

Módulo por página: `works`, `rentals`, `pavement`, `services`.

- [ ] **Step 2: Painel do embaixador**

Em `AmbassadorPage.jsx`, filtrar os itens do menu "Gerenciar" por `canWrite`
do módulo correspondente. Se nenhum item sobrar, esconder o menu inteiro.

- [ ] **Step 3: Cards do painel admin**

Em `admin/AdminPage.jsx`, cada entrada de `adminLinks` que aponta para um
módulo controlado ganha o campo `module`; a lista é filtrada por `canWrite`
antes de renderizar. Entradas sem `module` (ex: Usuários, Notícias,
Configurações) aparecem sempre.

- [ ] **Step 4: Verificar build**

Run: `npm run build`
Expected: build limpo.

---

### Task 6: Painel `/admin/permissoes`

**Files:**
- Create: `src/pages/admin/ManagePermissionsPage.jsx`
- Modify: `src/App.jsx` (rota, só master)
- Modify: `src/pages/admin/AdminPage.jsx` (card de acesso, só master)

**Interfaces:**
- Consumes: tabela `permission_rules`, `MODULES` da Task 3.

- [ ] **Step 1: Criar a página com duas seções**

**Seção "Por cargo"** — matriz cargo × módulo (2 × 5 interruptores). Cada
interruptor grava/remove uma linha `scope='role'`. Interruptor ligado =
liberado (sem linha ou `allowed=true`); desligado grava `allowed=false`.

**Seção "Por usuário"** — busca de usuário (nome/e-mail, entre admins e
embaixadores) e, ao selecionar, uma matriz de 5 módulos mostrando:
- o valor efetivo,
- se vem do cargo ou é exceção individual,
- opção de limpar a exceção (voltar a seguir o cargo).

Grava linhas `scope='user'` com `upsert` nos índices únicos.

- [ ] **Step 2: Proteções**

- Rota acessível apenas a master (redireciona os demais).
- A busca de usuários **não lista masters** — impede bloquear a si mesmo ou
  outro master.
- Aviso na tela explicando a precedência: regra de usuário vence a de cargo.

- [ ] **Step 3: Registrar rota e card**

Rota `/admin/permissoes` protegida por master. Card em `/admin` visível apenas
para master.

- [ ] **Step 4: Verificar build**

Run: `npm run build`
Expected: build limpo.

---

### Task 7: Teste manual ponta a ponta

**Files:** nenhum (validação).

- [ ] **Step 1: Rodar local**

Run: `npm run preview`

- [ ] **Step 2: Roteiro**

1. Como master, abrir `/admin/permissoes`.
2. Bloquear `works` para o cargo Embaixador. Com um embaixador: o botão
   "Adicionar obra" some, `/obras/gerenciar` redireciona, e os demais módulos
   continuam funcionando.
3. Criar exceção liberando `works` para esse embaixador: o acesso volta.
4. Bloquear `works` só para o usuário (sem regra de cargo): só ele perde.
5. Confirmar que a página pública `/obras-publicas` segue igual em todos os
   casos, e que o embaixador ainda cria/edita as próprias broncas mesmo sem
   permissão de `moderation`.
6. Confirmar que o master nunca é afetado e não aparece na busca de usuários.

- [ ] **Step 3: Limpar as regras de teste**

Remover as regras criadas durante o teste antes de considerar concluído.

---

## Notas

- **Sem commits** até o usuário validar (restrição do pedido).
- Migrações só no dev; a subida para prod é feita pelo usuário no fluxo normal.
- O banco é a autoridade da permissão. O frontend apenas evita mostrar caminhos
  que a RLS bloquearia — mesmo que alguém contorne a UI, a gravação falha.

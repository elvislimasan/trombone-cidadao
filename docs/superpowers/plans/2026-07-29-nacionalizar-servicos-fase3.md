# Nacionalizar Serviços — Fase 3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tornar o Guia de Serviços (transporte, pontos turísticos, guia comercial) nacional por município: as 3 tabelas (`transport`, `tourist_spots`, `directory`) ganham `city_id`, o cadastro (`ManageServicesPage`) passa a ser gerenciável por embaixador (escopado à cidade, com dropdown de cidade sempre visível no formulário), e a exibição pública (`ServicesPage`) ganha filtro por cidade com o `CitySelector` compartilhado, aplicado também à aba "Ruas e CEPs" (que já usa `pavement_streets`, nacionalizada na Fase 2).

**Architecture:** Mesmo padrão já usado em obras públicas, imóveis alugados e pavimentação: `city_id bigint references cities(id)` em cada tabela, RLS "gestor" (`is_admin(uid) OR is_master(uid) OR is_ambassador_of(uid, city_id)`), nova rota `/servicos/gerenciar` com `AmbassadorOrAdminRoute` ao lado da `/admin/servicos` (`AdminRoute`) existente, `CitySelector`/`useCity()` na página pública. Diferente de pavimentação (cidade resolvida via bairro) e de obras/imóveis (cidade resolvida via pin do mapa), aqui a cidade é escolhida **diretamente por um dropdown de cidades** no formulário — estes itens (pontos turísticos, transporte, comércio) não têm bairro nem geolocalização no schema atual.

**Tech Stack:** React 18 + Vite, Supabase (Postgres/RLS), Tailwind + shadcn/ui (`Combobox`).

## Global Constraints

- Todas as migrations rodam **apenas** no projeto de dev `xxdletrjyjajtrmhwzev`. Nunca aplicar em prod nesta sessão.
- Gestor = `is_admin(auth.uid()) OR is_master(auth.uid()) OR is_ambassador_of(auth.uid(), city_id)` — usar as funções (`is_admin(uuid)`, `is_master(uuid)`), mesmo estilo já usado nas policies de `pavement_streets` (migrations 152/153) e nas policies antigas destas 3 tabelas (`is_admin(auth.uid())` já é o padrão herdado aqui — confirmado por introspecção: `"Admins can perform any action on directory"` etc. usam `is_admin(auth.uid())`).
- As policies antigas por tabela (`"Admins can manage transport"`, `"Admins can manage tourist_spots"`, `"Admins can perform any action on directory"` — todas `cmd=ALL`, admin-only) devem ser **substituídas** (drop + create de policies granulares INSERT/UPDATE/DELETE), não deixadas lado a lado.
- `directory` tem uma policy adicional `"Users can submit to directory."` (INSERT, para sugestões de cidadão via `ServicesPage`/formulário público) que **não deve ser alterada** — ela permite que qualquer usuário autenticado submeta uma sugestão pendente (`status='pending'`), independente de ser gestor. A nova policy de gestor cobre INSERT/UPDATE/DELETE administrativos; a policy de submissão pública continua coexistindo (RLS é permissivo/OR — múltiplas policies do mesmo `cmd` se somam).
- SELECT público em `transport`, `tourist_spots`, `directory` já existe e **não deve ser alterado**.
- Backfill: todos os registros existentes em dev pertencem a Floresta-PE (`city_id = 64`), único município antes da nacionalização — `update ... set city_id = 64 where city_id is null` nas 3 tabelas, direto, sem geocoding.
- **Fora de escopo (decisão explícita do usuário):** a aba "Ruas e CEPs" dentro de `ManageServicesPage.jsx` (formulário legado com campos texto `name`/`bairro`/`cep`, sem mapa, sem `city_id`, sem RLS de embaixador) é um cadastro duplicado/obsoleto do `ManagePavementPage.jsx` real (já nacionalizado na Fase 2). **Não tocar nela nesta fase** — não remover, não nacionalizar, não adicionar filtro de cidade a essa aba específica. A gestão de ruas correta continua sendo via `/admin/pavimentacao` e `/pavimentacao/gerenciar`.
- Decisão de UX travada: o formulário de transporte/ponto turístico/diretório ganha um **dropdown de cidade sempre visível** (`Combobox` de `cities`) — não é auto-preenchido/oculto condicionalmente. Mesmo formulário para todos os perfis; a única diferença é a lista de opções (completa para admin/master, restrita às cidades ativas do embaixador).
- Reaproveitar sem duplicar: `CitySelector` (`src/components/CitySelector.jsx`), `useCity()` (`CityContext`), `AmbassadorOrAdminRoute`/`AdminRoute` (já existem em `src/App.jsx`), `Combobox` (`src/components/ui/combobox.jsx`, já usado em `ManagePavementPage.jsx`/`ManageWorksPage.jsx`).
- A aba "Ruas e CEPs" dentro da página pública `ServicesPage.jsx` (diferente da aba homônima em `ManageServicesPage.jsx`, que é a legada fora de escopo) já busca de `pavement_streets` e **deve** ganhar o filtro por `activeCityId`, já que essa tabela já tem `city_id` desde a Fase 2 — isso está dentro do escopo desta fase, conforme o spec (seção 6.3).

---

### Task 1: Schema — `city_id` em `transport`/`tourist_spots`/`directory` + backfill + RLS

**Files:**
- Create: `supabase/migrations/154_services_city_id.sql`
- Create: `supabase/migrations/155_services_ambassador_rls.sql`

**Interfaces:**
- Produces: coluna `city_id` (bigint, com índice) nas 3 tabelas, backfillada para Floresta-PE (id 64). Policies de gestor (INSERT/UPDATE/DELETE) substituindo as antigas admin-only. Todas as tarefas seguintes dependem deste schema.

- [ ] **Step 1: Escrever a migration de schema + backfill**

`supabase/migrations/154_services_city_id.sql`:
```sql
-- 154_services_city_id.sql
-- Nacionaliza o Guia de Serviços: transport, tourist_spots e directory
-- ganham city_id próprio, seguindo o padrão de public_works/rental_properties/
-- pavement_streets. Backfill: todos os registros existentes em dev são de
-- Floresta-PE (id 64), único município antes da nacionalização.

alter table public.transport
  add column if not exists city_id bigint references public.cities(id);
alter table public.tourist_spots
  add column if not exists city_id bigint references public.cities(id);
alter table public.directory
  add column if not exists city_id bigint references public.cities(id);

update public.transport set city_id = 64 where city_id is null;
update public.tourist_spots set city_id = 64 where city_id is null;
update public.directory set city_id = 64 where city_id is null;

create index if not exists idx_transport_city_id on public.transport (city_id);
create index if not exists idx_tourist_spots_city_id on public.tourist_spots (city_id);
create index if not exists idx_directory_city_id on public.directory (city_id);

notify pgrst, 'reload schema';
```

- [ ] **Step 2: Aplicar migration 154 e verificar backfill**

Run: `npx supabase db push --linked` (a partir da raiz do projeto).

Verificar:
```bash
npx supabase db query --linked "select 'transport' as t, count(*) total, count(city_id) com_city_id from public.transport union all select 'tourist_spots', count(*), count(city_id) from public.tourist_spots union all select 'directory', count(*), count(city_id) from public.directory;"
```
Expected: `total = com_city_id` nas 3 linhas (100% backfillado).

- [ ] **Step 3: Escrever a migration de RLS**

`supabase/migrations/155_services_ambassador_rls.sql`:
```sql
-- 155_services_ambassador_rls.sql
-- Substitui as policies antigas (ALL, admin-only) de transport/tourist_spots/
-- directory por policies de gestor granulares (INSERT/UPDATE/DELETE),
-- escopadas por cidade. Não altera SELECT público nem a policy de
-- submissão pública de directory ("Users can submit to directory.").

-- transport
drop policy if exists "Admins can manage transport" on public.transport;

drop policy if exists "transport_gestor_insert" on public.transport;
create policy "transport_gestor_insert"
  on public.transport for insert
  with check (
    is_admin(auth.uid()) or is_master(auth.uid()) or public.is_ambassador_of(auth.uid(), city_id)
  );

drop policy if exists "transport_gestor_update" on public.transport;
create policy "transport_gestor_update"
  on public.transport for update
  using (
    is_admin(auth.uid()) or is_master(auth.uid()) or public.is_ambassador_of(auth.uid(), city_id)
  )
  with check (
    is_admin(auth.uid()) or is_master(auth.uid()) or public.is_ambassador_of(auth.uid(), city_id)
  );

drop policy if exists "transport_gestor_delete" on public.transport;
create policy "transport_gestor_delete"
  on public.transport for delete
  using (
    is_admin(auth.uid()) or is_master(auth.uid()) or public.is_ambassador_of(auth.uid(), city_id)
  );

-- tourist_spots
drop policy if exists "Admins can manage tourist_spots" on public.tourist_spots;

drop policy if exists "tourist_spots_gestor_insert" on public.tourist_spots;
create policy "tourist_spots_gestor_insert"
  on public.tourist_spots for insert
  with check (
    is_admin(auth.uid()) or is_master(auth.uid()) or public.is_ambassador_of(auth.uid(), city_id)
  );

drop policy if exists "tourist_spots_gestor_update" on public.tourist_spots;
create policy "tourist_spots_gestor_update"
  on public.tourist_spots for update
  using (
    is_admin(auth.uid()) or is_master(auth.uid()) or public.is_ambassador_of(auth.uid(), city_id)
  )
  with check (
    is_admin(auth.uid()) or is_master(auth.uid()) or public.is_ambassador_of(auth.uid(), city_id)
  );

drop policy if exists "tourist_spots_gestor_delete" on public.tourist_spots;
create policy "tourist_spots_gestor_delete"
  on public.tourist_spots for delete
  using (
    is_admin(auth.uid()) or is_master(auth.uid()) or public.is_ambassador_of(auth.uid(), city_id)
  );

-- directory (mantém "Users can submit to directory." intacta — coexiste)
drop policy if exists "Admins can perform any action on directory" on public.directory;

drop policy if exists "directory_gestor_insert" on public.directory;
create policy "directory_gestor_insert"
  on public.directory for insert
  with check (
    is_admin(auth.uid()) or is_master(auth.uid()) or public.is_ambassador_of(auth.uid(), city_id)
  );

drop policy if exists "directory_gestor_update" on public.directory;
create policy "directory_gestor_update"
  on public.directory for update
  using (
    is_admin(auth.uid()) or is_master(auth.uid()) or public.is_ambassador_of(auth.uid(), city_id)
  )
  with check (
    is_admin(auth.uid()) or is_master(auth.uid()) or public.is_ambassador_of(auth.uid(), city_id)
  );

drop policy if exists "directory_gestor_delete" on public.directory;
create policy "directory_gestor_delete"
  on public.directory for delete
  using (
    is_admin(auth.uid()) or is_master(auth.uid()) or public.is_ambassador_of(auth.uid(), city_id)
  );

notify pgrst, 'reload schema';
```

Nota: cada policy `for update` já inclui `with check` desde a criação (não como um fix pós-review desta vez — lição aplicada diretamente a partir do que foi corrigido na Fase 2/migration 153).

- [ ] **Step 4: Aplicar migration 155 e verificar**

Run: `npx supabase db push --linked`

Verificar:
```bash
npx supabase db query --linked "select tablename, policyname, cmd from pg_policies where tablename in ('transport','tourist_spots','directory') order by tablename, policyname;"
```
Expected por tabela:
- `transport`: `transport_gestor_insert` (INSERT), `transport_gestor_update` (UPDATE), `transport_gestor_delete` (DELETE), `"Public transport are viewable by everyone."` (SELECT). A policy antiga `"Admins can manage transport"` NÃO deve aparecer.
- `tourist_spots`: mesma estrutura com prefixo `tourist_spots_`.
- `directory`: mesma estrutura com prefixo `directory_`, MAIS `"Users can submit to directory."` (INSERT, preservada). A policy antiga `"Admins can perform any action on directory"` NÃO deve aparecer.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/154_services_city_id.sql supabase/migrations/155_services_ambassador_rls.sql
git commit -m "feat(servicos): city_id + backfill + RLS de gestor em transport/tourist_spots/directory"
```

---

### Task 2: Cadastro escopado (`ManageServicesPage.jsx`) + nova rota

**Files:**
- Modify: `src/pages/admin/ManageServicesPage.jsx`
- Modify: `src/App.jsx`

**Interfaces:**
- Consumes: `useAuth()` → `user.{is_admin,is_master,is_ambassador}`, tabela `ambassador_cities` (`city_id`, `status='active'`), tabela `cities` (para o dropdown), `Combobox` (`src/components/ui/combobox.jsx`), schema da Task 1 (`city_id` nas 3 tabelas), `AmbassadorOrAdminRoute` (já existe em `src/App.jsx`).
- Produces: `/servicos/gerenciar` (nova rota, embaixador+admin+master) ao lado de `/admin/servicos` (inalterada, admin-only). `ManageServicesPage` funciona nas duas rotas. **Não altera a aba "Ruas e CEPs" desta página** (fora de escopo, ver Global Constraints).

- [ ] **Step 1: Adicionar estado de escopo de embaixador e lista de cidades**

Em `src/pages/admin/ManageServicesPage.jsx`, adicionar o import:
```jsx
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { Combobox } from '@/components/ui/combobox';
```
(Verificar se `Combobox` já não está importado — não duplicar.)

Dentro do componente `ManageServicesPage`, adicionar logo após `const { toast } = useToast();`:
```jsx
  const { user } = useAuth();
  const [myActiveCityIds, setMyActiveCityIds] = useState([]);
  const [cityOptions, setCityOptions] = useState([]);
  const isScopedAmbassador = !!user && !user.is_admin && !user.is_master && !!user.is_ambassador;

  useEffect(() => {
    if (!isScopedAmbassador || !user?.id) {
      // admin/master: todas as cidades disponíveis no dropdown
      if (user?.is_admin || user?.is_master) {
        supabase.from('cities').select('id, name, states(uf)').then(({ data }) => {
          setCityOptions((data || []).map((c) => ({ value: c.id, label: `${c.name}${c.states?.uf ? ` - ${c.states.uf}` : ''}` })));
        });
      }
      return;
    }
    supabase
      .from('ambassador_cities')
      .select('city_id, cities(id, name, states(uf))')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .then(({ data }) => {
        const rows = data || [];
        setMyActiveCityIds(rows.map((r) => r.city_id));
        setCityOptions(rows.map((r) => ({
          value: r.city_id,
          label: `${r.cities?.name || ''}${r.cities?.states?.uf ? ` - ${r.cities.states.uf}` : ''}`,
        })).filter((c) => c.label.trim()));
      });
  }, [isScopedAmbassador, user?.id, user?.is_admin, user?.is_master]);
```

- [ ] **Step 2: Filtrar `fetchData` por cidade quando escopado (transport/tourist_spots/directory apenas — NÃO pavement_streets)**

Modificar `fetchData` (já existente). A tabela `pavement_streets` (aba legada, fora de escopo) continua buscando tudo sem filtro; as outras 3 ganham filtro fail-closed:
```jsx
  const fetchData = useCallback(async () => {
    if (isScopedAmbassador && myActiveCityIds.length === 0) {
      setTransport([]);
      setTouristSpots([]);
      setDirectoryData({ public: [], commerce: [] });
      setPendingEntries([]);
      // pavement_streets (legado, fora de escopo desta fase) continua sem filtro:
      const { data: streetsData, error: streetsError } = await supabase.from('pavement_streets').select('*');
      if (streetsError) toast({ title: "Erro ao buscar pavement_streets", description: streetsError.message, variant: "destructive" });
      else setStreets(streetsData);
      return;
    }

    const scopedTables = ['transport', 'tourist_spots', 'directory'];
    const setters = {
      transport: setTransport,
      tourist_spots: setTouristSpots,
      directory: (data) => setDirectoryData({
        public: data.filter(d => d.type === 'public' && d.status === 'approved'),
        commerce: data.filter(d => d.type === 'commerce' && d.status === 'approved'),
      }),
    };

    for (const table of scopedTables) {
      let query = supabase.from(table).select('*');
      if (isScopedAmbassador) query = query.in('city_id', myActiveCityIds);
      const { data, error } = await query;
      if (error) {
        toast({ title: `Erro ao buscar ${table}`, description: error.message, variant: "destructive" });
      } else {
        setters[table](data);
      }
    }

    // pavement_streets: aba legada, fora de escopo — sempre busca tudo, sem filtro de cidade.
    const { data: streetsData, error: streetsError } = await supabase.from('pavement_streets').select('*');
    if (streetsError) toast({ title: "Erro ao buscar pavement_streets", description: streetsError.message, variant: "destructive" });
    else setStreets(streetsData);

    let pendingQuery = supabase.from('directory').select('*').eq('status', 'pending');
    if (isScopedAmbassador) pendingQuery = pendingQuery.in('city_id', myActiveCityIds);
    const { data: pending, error: pendingError } = await pendingQuery;
    if (pendingError) {
      toast({ title: "Erro ao buscar sugestões pendentes", description: pendingError.message, variant: "destructive" });
    } else {
      setPendingEntries(pending);
    }
  }, [toast, isScopedAmbassador, myActiveCityIds]);
```

- [ ] **Step 3: Incluir `city_id` no payload de novos itens e bloquear fora do escopo**

Modificar `handleSave` (já existente) para incluir `city_id` (vindo do `dbData.city_id`, já preenchido pelo formulário via o novo campo do modal — ver Step 4) e bloquear embaixador fora do escopo. A tabela alvo já é resolvida por `tableName` — a checagem de escopo só se aplica quando `tableName` é `transport`/`tourist_spots`/`directory` (não `pavement_streets`, fora de escopo):
```jsx
  const handleSave = async (itemToSave, type) => {
    const { image_file, ...dbData } = itemToSave;
    let tableName = type;
    if (type.startsWith('directory')) tableName = 'directory';

    const isScopedTable = tableName === 'transport' || tableName === 'tourist_spots' || tableName === 'directory';
    if (isScopedTable) {
      if (!dbData.city_id) {
        toast({ title: "Selecione uma cidade", variant: "destructive" });
        return;
      }
      if (isScopedAmbassador && !myActiveCityIds.includes(dbData.city_id)) {
        toast({ title: "Fora da sua área", description: "Você só pode gerenciar itens nas suas cidades.", variant: "destructive" });
        return;
      }
    }

    if (image_file) {
      const filePath = `${tableName}/${Date.now()}-${image_file.name}`;
      const { error: uploadError } = await supabase.storage.from('work-media').upload(filePath, image_file);
      if (uploadError) {
        toast({ title: "Erro no upload da imagem", description: uploadError.message, variant: "destructive" });
        return;
      }
      const { data: { publicUrl } } = supabase.storage.from('work-media').getPublicUrl(filePath);
      dbData.image_url = publicUrl;
    }

    if (dbData.id) {
      const { error } = await supabase.from(tableName).update(dbData).eq('id', dbData.id);
      if (error) toast({ title: "Erro ao atualizar", description: error.message, variant: "destructive" });
      else toast({ title: "Item atualizado!" });
    } else {
      const { error } = await supabase.from(tableName).insert(dbData);
      if (error) toast({ title: "Erro ao adicionar", description: error.message, variant: "destructive" });
      else toast({ title: "Item adicionado!" });
    }

    fetchData();
    setEditingItem(null);
  };
```

- [ ] **Step 4: Adicionar o dropdown de cidade no `EditModal` (transport/tourist_spots/directory apenas)**

O `EditModal` (componente separado no topo do arquivo, recebe `item`, `type`, `onSave`, `onClose`) precisa receber `cityOptions` como prop e renderizar o `Combobox` de cidade dentro de `renderFields()`, apenas nos cases `'transport'`, `'tourist_spots'` e `'directory'` (NÃO no case `'pavement_streets'`, fora de escopo).

Modificar a assinatura do `EditModal`:
```jsx
const EditModal = ({ item, type, onSave, onClose, cityOptions }) => {
```

Dentro de `renderFields()`, adicionar o bloco de cidade ao FINAL de cada um dos 3 cases (`'transport'`, `'tourist_spots'`, `'directory'`), antes do fechamento de cada `</>`. Exemplo para o case `'transport'` (aplicar o mesmo bloco, idêntico, aos outros 2 cases):
```jsx
            <div className="grid gap-2">
              <Label htmlFor="city_id">Cidade</Label>
              <Combobox
                options={cityOptions}
                value={formData.city_id}
                onChange={(value) => setFormData((prev) => ({ ...prev, city_id: value }))}
                placeholder="Selecione a cidade"
                searchPlaceholder="Buscar cidade..."
                notFoundText="Nenhuma cidade encontrada."
              />
            </div>
```
(`setFormData` já existe no `EditModal` — reusar a função de state já declarada lá, não criar uma nova.)

- [ ] **Step 5: Passar `cityOptions` para o `EditModal` e inicializar `city_id` em itens novos**

Modificar a renderização do `EditModal` no JSX de retorno de `ManageServicesPage` (já existente: `{editingItem && <EditModal item={editingItem.item} type={editingItem.type} onSave={handleSave} onClose={() => setEditingItem(null)} />}`):
```jsx
      {editingItem && <EditModal item={editingItem.item} type={editingItem.type} onSave={handleSave} onClose={() => setEditingItem(null)} cityOptions={cityOptions} />}
```

Modificar `handleAddNew` (já existente) para inicializar `city_id: null` nos 3 tipos escopados (deixar de fora do `pavement_streets`, que é o legado):
```jsx
      case 'transport': newItem = { name: '', destination: '', phone: '', instagram: '', schedule: '', details: '', image_url: '', city_id: isScopedAmbassador && myActiveCityIds.length === 1 ? myActiveCityIds[0] : null }; type = 'transport'; break;
      case 'tourist_spots': newItem = { name: '', short_description: '', long_description: '', address: '', phone: '', image_url: '', city_id: isScopedAmbassador && myActiveCityIds.length === 1 ? myActiveCityIds[0] : null }; type = 'tourist_spots'; break;
      case 'directory_public': newItem = { name: '', address: '', phone: '', image_url: '', type: 'public', status: 'approved', city_id: isScopedAmbassador && myActiveCityIds.length === 1 ? myActiveCityIds[0] : null }; type = 'directory'; break;
      case 'directory_commerce': newItem = { name: '', address: '', phone: '', image_url: '', type: 'commerce', status: 'approved', city_id: isScopedAmbassador && myActiveCityIds.length === 1 ? myActiveCityIds[0] : null }; type = 'directory'; break;
      case 'pavement_streets': newItem = { name: '', bairro: '', cep: '' }; type = 'pavement_streets'; break;
```
(Pré-selecionar a cidade quando o embaixador só tem uma é uma conveniência menor, compatível com a decisão de "dropdown sempre visível" — o campo aparece preenchido mas editável, não oculto.)

- [ ] **Step 6: Adicionar a rota `/servicos/gerenciar` em `src/App.jsx`**

Encontrar a rota existente `<Route path="/admin/servicos" element={<AdminRoute><ManageServicesPage /></AdminRoute>} />` (linha ~649) e adicionar logo abaixo:
```jsx
<Route path="/servicos/gerenciar" element={<AmbassadorOrAdminRoute><ManageServicesPage /></AmbassadorOrAdminRoute>} />
```

- [ ] **Step 7: Adicionar link de navegação no painel do embaixador**

Em `src/pages/AmbassadorPage.jsx`, os links "Gerenciar obras" e "Gerenciar pavimentação" já existem lado a lado (confirmado):
```jsx
            <Button asChild variant="outline" className="gap-2">
              <Link to="/obras/gerenciar">
                <ImageIcon className="w-4 h-4" /> Gerenciar obras
              </Link>
            </Button>
            <Button asChild variant="outline" className="gap-2">
              <Link to="/pavimentacao/gerenciar">
                <Route className="w-4 h-4" /> Gerenciar pavimentação
              </Link>
            </Button>
```
Adicionar um terceiro botão idêntico, logo após o de pavimentação:
```jsx
            <Button asChild variant="outline" className="gap-2">
              <Link to="/servicos/gerenciar">
                <Briefcase className="w-4 h-4" /> Gerenciar serviços
              </Link>
            </Button>
```
Adicionar `Briefcase` ao import de `lucide-react` já existente no topo do arquivo (verificar se `ImageIcon`/`Route` são importados de lá — adicionar `Briefcase` à mesma linha de import, sem duplicar).

- [ ] **Step 8: Verificar que compila**

Run: `npm run build`

Expected: build sem erros.

- [ ] **Step 9: Teste manual (dev, banco `xxdletrjyjajtrmhwzev`)**

Como admin, acessar `/admin/servicos`, criar um novo ponto turístico escolhendo "Floresta - PE" no dropdown de cidade → verificar:
```bash
npx supabase db query --linked "select id, name, city_id from public.tourist_spots order by created_at desc limit 1;" 2>&1 || npx supabase db query --linked "select id, name, city_id from public.tourist_spots limit 1;"
```
Expected: `city_id = 64`. (Se a tabela não tiver `created_at`, ajustar a query para pegar o registro mais recente por `id` ou confirmar via contagem antes/depois.)

- [ ] **Step 10: Commit**

```bash
git add src/pages/admin/ManageServicesPage.jsx src/App.jsx src/pages/AmbassadorPage.jsx
git commit -m "feat(servicos): cadastro escopado por embaixador + dropdown de cidade + rota /servicos/gerenciar"
```

---

### Task 3: Exibição pública filtrada (`ServicesPage.jsx`)

**Files:**
- Modify: `src/pages/ServicesPage.jsx`

**Interfaces:**
- Consumes: `CitySelector` (`src/components/CitySelector.jsx`), `useCity()` (`CityContext` → `activeCityId`), schema da Task 1 (`city_id` em `transport`/`tourist_spots`/`directory`) e da Fase 2 (`city_id` em `pavement_streets`, já existente).
- Produces: `/servicos` filtra as 4 abas (Pontos Turísticos, Transportes, Guia Comercial, Ruas e CEPs) pela cidade ativa via um único `CitySelector` no topo, fora das `Tabs`.

- [ ] **Step 1: Adicionar `CitySelector` e filtro por `activeCityId` em todas as 4 queries**

Em `src/pages/ServicesPage.jsx`, adicionar os imports:
```jsx
import { useCity } from '@/contexts/CityContext';
import CitySelector from '@/components/CitySelector';
```

Dentro do componente `ServicesPage`, adicionar logo após `const { toast } = useToast();`:
```jsx
  const { activeCityId } = useCity();
```

Modificar `fetchData` (já existente) para filtrar as 4 queries por `activeCityId` quando setado:
```jsx
  const fetchData = useCallback(async () => {
    let transportQuery = supabase.from('transport').select('*');
    if (activeCityId) transportQuery = transportQuery.eq('city_id', activeCityId);
    const { data: transportData, error: transportError } = await transportQuery;
    if (transportError) toast({ title: "Erro ao buscar transportes", description: transportError.message, variant: "destructive" });
    else setTransportOptions(transportData);

    let spotsQuery = supabase.from('tourist_spots').select('*');
    if (activeCityId) spotsQuery = spotsQuery.eq('city_id', activeCityId);
    const { data: spotsData, error: spotsError } = await spotsQuery;
    if (spotsError) toast({ title: "Erro ao buscar pontos turísticos", description: spotsError.message, variant: "destructive" });
    else setTouristSpots(spotsData);

    let directoryQuery = supabase.from('directory').select('*').eq('status', 'approved');
    if (activeCityId) directoryQuery = directoryQuery.eq('city_id', activeCityId);
    const { data: directoryData, error: directoryError } = await directoryQuery;
    if (directoryError) toast({ title: "Erro ao buscar guia comercial", description: directoryError.message, variant: "destructive" });
    else {
      setDirectory({
        public: directoryData.filter(d => d.type === 'public'),
        commerce: directoryData.filter(d => d.type === 'commerce'),
      });
    }

    let streetsQuery = supabase.from('pavement_streets').select('*');
    if (activeCityId) streetsQuery = streetsQuery.eq('city_id', activeCityId);
    const { data: streets, error: streetsError } = await streetsQuery;
    if (streetsError) toast({ title: "Erro ao buscar ruas", description: streetsError.message, variant: "destructive" });
    else setStreetsData(streets);

  }, [toast, activeCityId]);
```

(A dependência `activeCityId` no `useCallback` já faz o `useEffect` existente — `useEffect(() => { fetchData(); }, [fetchData]);` — reexecutar automaticamente quando a cidade muda, sem precisar editar esse `useEffect`.)

- [ ] **Step 2: Adicionar o `CitySelector` no cabeçalho da página, fora das `Tabs`**

No JSX de retorno, localizar o bloco de header (`<div className="text-center mb-12">...<h1>...</h1>...<p>...</p></div>`) e adicionar o `CitySelector` logo após o parágrafo descritivo, ANTES do componente `<Tabs>`:
```jsx
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold tracking-tight text-foreground sm:text-5xl gradient-text">
            Guia de Serviços de Floresta
          </h1>
          <p className="mt-3 text-lg text-muted-foreground">
            Tudo o que você precisa saber sobre a cidade em um só lugar.
          </p>
          <div className="mt-4 flex justify-center">
            <CitySelector />
          </div>
        </div>
```

Nota: o `<h1>` diz "Guia de Serviços de Floresta" (hardcoded) — este plano NÃO exige tornar esse texto dinâmico por cidade (fora de escopo, YAGNI; o `CitySelector` abaixo já comunica a cidade ativa visualmente).

- [ ] **Step 3: Verificar que compila e testar visualmente**

Run: `npm run build`

Expected: build sem erros. Depois, `npm run dev`, abrir `/servicos`, trocar a cidade no `CitySelector` e confirmar que as 4 abas atualizam (comparar com uma consulta direta, ex.: `npx supabase db query --linked "select count(*) from public.tourist_spots where city_id = 64;"`).

- [ ] **Step 4: Commit**

```bash
git add src/pages/ServicesPage.jsx
git commit -m "feat(servicos): filtro por cidade na exibicao publica (4 abas)"
```

---

## Verificação final da Fase 3 (dev `xxdletrjyjajtrmhwzev` apenas)

- Backfill: transporte/pontos turísticos/diretório existentes ganham `city_id = 64` (Floresta).
- RLS: policies antigas admin-only substituídas por 3 policies de gestor (insert/update/delete) por tabela; SELECT público e a policy de submissão pública de `directory` inalterados.
- Admin/master continuam gerenciando qualquer cidade em `/admin/servicos`, com dropdown de cidade completo.
- Embaixador em `/servicos/gerenciar` só vê/edita itens das próprias cidades; dropdown de cidade restrito às cidades dele; tentativa de salvar fora do escopo é bloqueada.
- Link "Gerenciar serviços" visível no painel do embaixador.
- `/servicos` com `CitySelector` filtra as 4 abas (transporte, pontos turísticos, guia comercial, ruas) pela cidade ativa; "Todas as cidades" mantém comportamento nacional.
- Aba "Ruas e CEPs" **dentro de `ManageServicesPage.jsx`** permanece intocada (fora de escopo, confirmado).

## Fora de escopo (YAGNI + decisões explícitas)

- Nacionalizar ou remover a aba legada "Ruas e CEPs" de `ManageServicesPage.jsx` (decisão explícita do usuário: deixar como está).
- Tornar o `<h1>` de `ServicesPage.jsx` dinâmico com o nome da cidade.
- Auto-preencher/ocultar o campo de cidade condicionalmente (decisão travada: dropdown sempre visível).
- Views/analytics de quantidade de itens por cidade.

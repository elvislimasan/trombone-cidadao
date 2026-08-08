# Gestão de Convites de Embaixador Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dar ao master controle total sobre convites de embaixador pendentes (revogar, reenviar/estender validade) e evitar convites duplicados para a mesma cidade, sem tocar na Edge Function nem no schema.

**Architecture:** Nova aba "Convites Pendentes" em `ManageMastersPage.jsx`, seguindo o mesmo padrão de fetch/estado/ação já usado em `ActiveAmbassadorsSection`. `CreateInviteSection` ganha uma checagem de duplicidade antes de permitir gerar um novo convite.

**Tech Stack:** React, Supabase JS client (`.from('ambassador_invites')`), componentes `Card`/`Tabs`/`Button` já existentes em `@/components/ui/*`.

## Global Constraints

- Nenhuma migration nova — `ambassador_invites` já tem `status`, `expires_at`, `city_id`, `invited_email`, `created_at` (migration `124_ambassador_invites.sql`).
- Nenhuma mudança em `supabase/functions/accept-ambassador-invite/index.ts` — o filtro `.eq('status', 'pending').gt('expires_at', now())` já rejeita convites revogados/expirados automaticamente.
- Revogar convite = `update({ status: 'revoked' })` (mantém a linha, não deleta).
- Reenviar convite = `update({ expires_at: <now + 7 dias> })` no mesmo `token` (não gera novo token).
- Seguir o padrão visual/estrutural de `ActiveAmbassadorsSection` (`src/pages/admin/ManageMastersPage.jsx:217-320`): `Card` por linha, botão de ação com estado de loading individual por id, `Card` tracejado como empty state, toast de sucesso/erro via `useToast`.

---

## File Structure

- **Modify:** `src/pages/admin/ManageMastersPage.jsx` — adiciona o componente `PendingInvitesSection`, uma 4ª aba na `Tabs`/`TabsList`, e a checagem de duplicidade dentro de `CreateInviteSection`. Único arquivo tocado — a feature inteira vive nesse componente, como as 3 seções existentes.

---

### Task 1: Componente `PendingInvitesSection` — listar, revogar e reenviar convites pendentes

**Files:**
- Modify: `src/pages/admin/ManageMastersPage.jsx` (novo componente inserido entre `CreateInviteSection` e `ActiveAmbassadorsSection`, i.e. após a linha 212)

**Interfaces:**
- Consumes: `supabase` client (já importado no topo do arquivo, linha 16), `useToast` (linha 13), ícones `Clock`, `RotateCw` de `lucide-react` (precisam ser adicionados ao import existente).
- Produces: componente `PendingInvitesSection` (sem props), montado na Task 3 como conteúdo da nova `TabsContent value="pending-invites"`.

- [ ] **Step 1: Adicionar os ícones que faltam ao import de `lucide-react`**

Localizar (linha 5-8):
```js
import {
  ArrowLeft, Copy, Check, X, Search, UserCheck, ShieldCheck,
  MapPin, Loader2, Link2, Users, PlusCircle, AlertCircle
} from 'lucide-react';
```

Substituir por:
```js
import {
  ArrowLeft, Copy, Check, X, Search, UserCheck, ShieldCheck,
  MapPin, Loader2, Link2, Users, PlusCircle, AlertCircle, Clock, RotateCw
} from 'lucide-react';
```

- [ ] **Step 2: Escrever o componente `PendingInvitesSection`**

Inserir logo após o fechamento de `CreateInviteSection` (após a linha `};` que fecha o componente, linha 212, antes do comentário `// Sub-component: Embaixadores ativos` na linha 214):

```js
// ────────────────────────────────────────────────────────────────────────────────
// Sub-component: Convites pendentes
// ────────────────────────────────────────────────────────────────────────────────
const PendingInvitesSection = () => {
  const { toast } = useToast();
  const [invites, setInvites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [revokingId, setRevokingId] = useState(null);
  const [resendingId, setResendingId] = useState(null);

  const fetchInvites = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('ambassador_invites')
      .select('id, city_id, invited_email, created_at, expires_at, cities(name, states(uf))')
      .eq('status', 'pending')
      .order('created_at', { ascending: false });

    if (error) {
      toast({ title: 'Erro ao buscar convites', description: error.message, variant: 'destructive' });
    } else {
      setInvites(data || []);
    }
    setLoading(false);
  }, [toast]);

  useEffect(() => {
    fetchInvites();
  }, [fetchInvites]);

  const handleRevoke = async (inviteId) => {
    setRevokingId(inviteId);
    const { error } = await supabase
      .from('ambassador_invites')
      .update({ status: 'revoked' })
      .eq('id', inviteId);

    if (error) {
      toast({ title: 'Erro ao revogar convite', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Convite revogado.' });
      fetchInvites();
    }
    setRevokingId(null);
  };

  const handleResend = async (inviteId) => {
    setResendingId(inviteId);
    const newExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const { error } = await supabase
      .from('ambassador_invites')
      .update({ expires_at: newExpiresAt })
      .eq('id', inviteId);

    if (error) {
      toast({ title: 'Erro ao reenviar convite', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Validade do convite estendida por mais 7 dias.' });
      fetchInvites();
    }
    setResendingId(null);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 gap-3">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        <span className="text-muted-foreground">Carregando convites...</span>
      </div>
    );
  }

  if (invites.length === 0) {
    return (
      <Card className="border-dashed border-2 py-12 text-center bg-muted/20">
        <CardContent className="flex flex-col items-center gap-3">
          <Clock className="w-10 h-10 text-muted-foreground" />
          <p className="text-lg font-semibold text-muted-foreground">Nenhum convite pendente</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {invites.map((inv) => (
        <motion.div
          key={inv.id}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <Card className="border-border">
            <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm md:text-base truncate">
                  {inv.cities?.name || '—'} {inv.cities?.states?.uf ? `(${inv.cities.states.uf})` : ''}
                </p>
                <div className="flex flex-wrap gap-3 mt-1 text-xs text-muted-foreground">
                  <span>{inv.invited_email || 'Sem e-mail informado'}</span>
                  <span>Criado em: {new Date(inv.created_at).toLocaleDateString('pt-BR')}</span>
                  <span>Expira em: {new Date(inv.expires_at).toLocaleDateString('pt-BR')}</span>
                </div>
              </div>
              <div className="flex gap-2 shrink-0">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 px-3 text-xs"
                  disabled={resendingId === inv.id}
                  onClick={() => handleResend(inv.id)}
                >
                  {resendingId === inv.id ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <><RotateCw className="w-3 h-3 mr-1" /> Reenviar</>
                  )}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 px-3 text-xs text-red-600 border-red-300 hover:bg-red-50"
                  disabled={revokingId === inv.id}
                  onClick={() => handleRevoke(inv.id)}
                >
                  {revokingId === inv.id ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <><X className="w-3 h-3 mr-1" /> Revogar</>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      ))}
    </div>
  );
};

```

- [ ] **Step 3: Rodar o build para confirmar que o novo componente não quebra a compilação**

Run: `npm run build`
Expected: build finaliza sem erros (o componente ainda não é usado em nenhuma `TabsContent` até a Task 3, mas deve compilar sozinho sem erro de sintaxe/import).

- [ ] **Step 4: Commit**

```bash
git add src/pages/admin/ManageMastersPage.jsx
git commit -m "feat(embaixador): componente PendingInvitesSection para gerenciar convites pendentes"
```

---

### Task 2: Bloqueio de duplicidade em `CreateInviteSection`

**Files:**
- Modify: `src/pages/admin/ManageMastersPage.jsx:25-212` (componente `CreateInviteSection`)

**Interfaces:**
- Consumes: mesma tabela `ambassador_invites` da Task 1.
- Produces: nenhuma interface nova exposta a outros componentes — mudança interna de `CreateInviteSection`.

- [ ] **Step 1: Adicionar estado para o convite pendente existente e para o processo de revogar-e-criar**

Localizar (linhas 28-35):
```js
  const [selectedCityId, setSelectedCityId] = useState('');
  const [selectedCityLabel, setSelectedCityLabel] = useState('');
  const [citySearch, setCitySearch] = useState('');
  const [cityDropOpen, setCityDropOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [generatedLink, setGeneratedLink] = useState(null);
  const [copied, setCopied] = useState(false);
```

Substituir por:
```js
  const [selectedCityId, setSelectedCityId] = useState('');
  const [selectedCityLabel, setSelectedCityLabel] = useState('');
  const [citySearch, setCitySearch] = useState('');
  const [cityDropOpen, setCityDropOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [generatedLink, setGeneratedLink] = useState(null);
  const [copied, setCopied] = useState(false);
  const [existingPendingInvite, setExistingPendingInvite] = useState(null);
  const [checkingDuplicate, setCheckingDuplicate] = useState(false);
```

- [ ] **Step 2: Verificar duplicidade ao selecionar uma cidade**

Localizar (linhas 45-50):
```js
  const handleSelectCity = (city) => {
    setSelectedCityId(String(city.id));
    setSelectedCityLabel(`${city.name}${city.states?.uf ? ` (${city.states.uf})` : ''}`);
    setCitySearch('');
    setCityDropOpen(false);
  };
```

Substituir por:
```js
  const handleSelectCity = async (city) => {
    setSelectedCityId(String(city.id));
    setSelectedCityLabel(`${city.name}${city.states?.uf ? ` (${city.states.uf})` : ''}`);
    setCitySearch('');
    setCityDropOpen(false);
    setExistingPendingInvite(null);

    setCheckingDuplicate(true);
    const { data, error } = await supabase
      .from('ambassador_invites')
      .select('id, created_at')
      .eq('city_id', city.id)
      .eq('status', 'pending')
      .limit(1)
      .maybeSingle();
    setCheckingDuplicate(false);

    if (!error && data) {
      setExistingPendingInvite(data);
    }
  };
```

- [ ] **Step 3: Adicionar handler para "Revogar e criar novo" e "Cancelar"**

Localizar (linhas 52-88, função `handleGenerateInvite` completa):
```js
  const handleGenerateInvite = async () => {
    if (!selectedCityId) {
      toast({ title: 'Selecione uma cidade', variant: 'destructive' });
      return;
    }
    setSubmitting(true);

    // Generate a random token
    const token = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2) + Date.now().toString(36);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(); // 7 days

    const insertData = {
      token,
      city_id: Number(selectedCityId),
      invited_by: user.id,
      status: 'pending',
      expires_at: expiresAt,
    };
    if (inviteEmail.trim()) {
      insertData.invited_email = inviteEmail.trim();
    }

    const { error } = await supabase
      .from('ambassador_invites')
      .insert(insertData);

    if (error) {
      toast({ title: 'Erro ao gerar convite', description: error.message, variant: 'destructive' });
    } else {
      const link = `${window.location.origin}/convite/${token}`;
      setGeneratedLink(link);
      setSelectedCityId('');
      setInviteEmail('');
      toast({ title: 'Convite gerado com sucesso!' });
    }
    setSubmitting(false);
  };
```

Substituir por (adiciona os dois novos handlers logo abaixo, e reseta `existingPendingInvite`/`selectedCityLabel` ao final da criação):
```js
  const handleGenerateInvite = async () => {
    if (!selectedCityId) {
      toast({ title: 'Selecione uma cidade', variant: 'destructive' });
      return;
    }
    setSubmitting(true);

    // Generate a random token
    const token = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2) + Date.now().toString(36);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(); // 7 days

    const insertData = {
      token,
      city_id: Number(selectedCityId),
      invited_by: user.id,
      status: 'pending',
      expires_at: expiresAt,
    };
    if (inviteEmail.trim()) {
      insertData.invited_email = inviteEmail.trim();
    }

    const { error } = await supabase
      .from('ambassador_invites')
      .insert(insertData);

    if (error) {
      toast({ title: 'Erro ao gerar convite', description: error.message, variant: 'destructive' });
    } else {
      const link = `${window.location.origin}/convite/${token}`;
      setGeneratedLink(link);
      setSelectedCityId('');
      setSelectedCityLabel('');
      setInviteEmail('');
      setExistingPendingInvite(null);
      toast({ title: 'Convite gerado com sucesso!' });
    }
    setSubmitting(false);
  };

  const handleRevokeAndCreate = async () => {
    if (!existingPendingInvite) return;
    setSubmitting(true);
    const { error } = await supabase
      .from('ambassador_invites')
      .update({ status: 'revoked' })
      .eq('id', existingPendingInvite.id);

    if (error) {
      toast({ title: 'Erro ao revogar convite existente', description: error.message, variant: 'destructive' });
      setSubmitting(false);
      return;
    }
    setExistingPendingInvite(null);
    await handleGenerateInvite();
  };

  const handleCancelDuplicate = () => {
    setSelectedCityId('');
    setSelectedCityLabel('');
    setExistingPendingInvite(null);
  };
```

- [ ] **Step 4: Renderizar o aviso de duplicidade no lugar do botão "Gerar Convite" quando houver conflito**

Localizar (linhas 172-182):
```js
        <Button
          onClick={handleGenerateInvite}
          disabled={submitting || !selectedCityId}
          className="w-full sm:w-auto"
        >
          {submitting ? (
            <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Gerando...</>
          ) : (
            <><PlusCircle className="w-4 h-4 mr-2" /> Gerar Convite</>
          )}
        </Button>
```

Substituir por:
```js
        {existingPendingInvite ? (
          <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl space-y-3">
            <p className="text-sm font-semibold text-amber-800 flex items-center gap-2">
              <AlertCircle className="w-4 h-4" />
              Já existe um convite pendente para {selectedCityLabel}, criado em{' '}
              {new Date(existingPendingInvite.created_at).toLocaleDateString('pt-BR')}.
            </p>
            <div className="flex flex-col sm:flex-row gap-2">
              <Button
                onClick={handleRevokeAndCreate}
                disabled={submitting}
                variant="outline"
                className="border-amber-300 hover:bg-amber-100"
              >
                {submitting ? (
                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Processando...</>
                ) : (
                  'Revogar e criar novo'
                )}
              </Button>
              <Button onClick={handleCancelDuplicate} variant="ghost">
                Cancelar
              </Button>
            </div>
          </div>
        ) : (
          <Button
            onClick={handleGenerateInvite}
            disabled={submitting || !selectedCityId || checkingDuplicate}
            className="w-full sm:w-auto"
          >
            {submitting ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Gerando...</>
            ) : checkingDuplicate ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Verificando...</>
            ) : (
              <><PlusCircle className="w-4 h-4 mr-2" /> Gerar Convite</>
            )}
          </Button>
        )}
```

- [ ] **Step 5: Rodar o build**

Run: `npm run build`
Expected: build finaliza sem erros de sintaxe/import.

- [ ] **Step 6: Testar manualmente no navegador**

Run: `npm run dev`, acessar `/admin/embaixadores` como master, aba "Criar Convite".
Expected:
- Selecionar uma cidade sem convite pendente: botão "Gerar Convite" aparece normalmente, fluxo idêntico ao anterior.
- Selecionar uma cidade que já tem convite pendente (criar um primeiro para testar): aparece o aviso âmbar em vez do botão, com "Revogar e criar novo" e "Cancelar".
- Clicar "Cancelar": aviso some, seleção de cidade limpa.
- Clicar "Revogar e criar novo": convite antigo vira `revoked`, novo convite é criado e o link aparece normalmente.

- [ ] **Step 7: Commit**

```bash
git add src/pages/admin/ManageMastersPage.jsx
git commit -m "feat(embaixador): bloquear criação de convite duplicado para a mesma cidade"
```

---

### Task 3: Adicionar a 4ª aba "Convites Pendentes" na página principal

**Files:**
- Modify: `src/pages/admin/ManageMastersPage.jsx:520-537` (componente `ManageMastersPage`, `Tabs`/`TabsList`/`TabsContent`)

**Interfaces:**
- Consumes: `PendingInvitesSection` (Task 1).
- Produces: nenhuma — última task, monta a UI final.

- [ ] **Step 1: Atualizar `TabsList` de 3 para 4 colunas e inserir o novo `TabsTrigger`**

Localizar (linhas 520-537):
```js
        <Tabs defaultValue="invite" className="w-full">
          <TabsList className="grid w-full grid-cols-3 h-auto sm:h-10 bg-muted/50 rounded-lg mb-6">
            <TabsTrigger value="invite" className="gap-2 text-xs sm:text-sm">
              <Link2 className="w-4 h-4" />
              <span className="hidden sm:inline">Criar Convite</span>
              <span className="sm:hidden">Convite</span>
            </TabsTrigger>
            <TabsTrigger value="ambassadors" className="gap-2 text-xs sm:text-sm">
              <Users className="w-4 h-4" />
              <span className="hidden sm:inline">Embaixadores Ativos</span>
              <span className="sm:hidden">Ativos</span>
            </TabsTrigger>
            <TabsTrigger value="promote" className="gap-2 text-xs sm:text-sm">
              <ShieldCheck className="w-4 h-4" />
              <span className="hidden sm:inline">Promover Master</span>
              <span className="sm:hidden">Masters</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="invite">
            <CreateInviteSection user={user} />
          </TabsContent>

          <TabsContent value="ambassadors">
            <ActiveAmbassadorsSection />
          </TabsContent>

          <TabsContent value="promote">
            <PromoteToMasterSection currentUser={user} />
          </TabsContent>
        </Tabs>
```

Substituir por:
```js
        <Tabs defaultValue="invite" className="w-full">
          <TabsList className="grid w-full grid-cols-4 h-auto sm:h-10 bg-muted/50 rounded-lg mb-6">
            <TabsTrigger value="invite" className="gap-2 text-xs sm:text-sm">
              <Link2 className="w-4 h-4" />
              <span className="hidden sm:inline">Criar Convite</span>
              <span className="sm:hidden">Convite</span>
            </TabsTrigger>
            <TabsTrigger value="pending-invites" className="gap-2 text-xs sm:text-sm">
              <Clock className="w-4 h-4" />
              <span className="hidden sm:inline">Convites Pendentes</span>
              <span className="sm:hidden">Pendentes</span>
            </TabsTrigger>
            <TabsTrigger value="ambassadors" className="gap-2 text-xs sm:text-sm">
              <Users className="w-4 h-4" />
              <span className="hidden sm:inline">Embaixadores Ativos</span>
              <span className="sm:hidden">Ativos</span>
            </TabsTrigger>
            <TabsTrigger value="promote" className="gap-2 text-xs sm:text-sm">
              <ShieldCheck className="w-4 h-4" />
              <span className="hidden sm:inline">Promover Master</span>
              <span className="sm:hidden">Masters</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="invite">
            <CreateInviteSection user={user} />
          </TabsContent>

          <TabsContent value="pending-invites">
            <PendingInvitesSection />
          </TabsContent>

          <TabsContent value="ambassadors">
            <ActiveAmbassadorsSection />
          </TabsContent>

          <TabsContent value="promote">
            <PromoteToMasterSection currentUser={user} />
          </TabsContent>
        </Tabs>
```

- [ ] **Step 2: Rodar o build**

Run: `npm run build`
Expected: build finaliza sem erros.

- [ ] **Step 3: Testar manualmente no navegador — fluxo completo**

Run: `npm run dev`, acessar `/admin/embaixadores` como master.
Expected:
- 4 abas visíveis: Criar Convite, Convites Pendentes, Embaixadores Ativos, Promover Master.
- Criar um convite na 1ª aba, ir para "Convites Pendentes": convite aparece na lista com cidade, e-mail (ou "Sem e-mail informado"), datas de criação e expiração.
- Clicar "Reenviar": toast de sucesso, data de expiração atualizada na lista (refetch automático).
- Clicar "Revogar": toast de sucesso, convite some da lista (refetch automático).
- Com a lista vazia: aparece o empty state "Nenhum convite pendente".

- [ ] **Step 4: Commit**

```bash
git add src/pages/admin/ManageMastersPage.jsx
git commit -m "feat(embaixador): adicionar aba Convites Pendentes à gestão de embaixadores"
```

---

## Self-Review

**Spec coverage:**
- Nova aba "Convites Pendentes" listando pendentes → Task 1 (componente) + Task 3 (aba montada).
- Revogar convite (`status='revoked'`, sem deletar) → Task 1, `handleRevoke`.
- Reenviar (estende `expires_at`, mesmo token) → Task 1, `handleResend`.
- Bloqueio de duplicidade com aviso + "Revogar e criar novo" / "Cancelar" → Task 2.
- Nenhuma mudança na Edge Function nem migration → confirmado, nenhuma task toca nesses arquivos.

**Placeholder scan:** nenhum "TBD"/"implementar depois" — todo código é completo e copiável, incluindo os dois novos handlers e o JSX condicional.

**Type consistency:** `ambassador_invites.id` tratado como valor opaco (não tipado explicitamente, consistente com o padrão existente em `ActiveAmbassadorsSection` que usa `ac.id` da mesma forma). Nome do componente `PendingInvitesSection` consistente entre Task 1 (cria) e Task 3 (consome). Estados `existingPendingInvite`/`checkingDuplicate` só usados dentro de `CreateInviteSection` (Task 2), sem vazamento para outros componentes.

**Gaps identificados:** nenhum — o design não previa nenhuma mudança de backend, e o plano confirma que nenhuma é necessária.

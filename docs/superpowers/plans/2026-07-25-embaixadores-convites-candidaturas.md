# Embaixadores: convites + candidaturas — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir virar embaixador por convite (link amarrado a e-mail que expira) ou por candidatura pública com aprovação do master, notificando os envolvidos.

**Architecture:** Banco primeiro (tabela `ambassador_applications`, RPC de aprovação, triggers de notificação), depois a Edge Function de convite (validação de e-mail + expiração), depois o frontend (página pública `/seja-embaixador`, aba "Candidaturas" no master, refino do gerar-convite e da AcceptInvitePage).

**Tech Stack:** React 18 + Vite + Tailwind, Supabase (Postgres + RLS + Edge Functions Deno), react-router.

## Global Constraints

- **Banco/Edge Functions: aplicar/deploy SOMENTE no projeto de dev `xxdletrjyjajtrmhwzev`.** Prod é feito depois pelo usuário. O projeto linkado (`supabase/.temp/project-ref`) já é o dev.
- `match_city` retorna `bigint` → PostgREST serializa como **string**; qualquer parse de id deve aceitar number|string (não usar `typeof === 'number'`).
- `is_master` e `is_admin` são flags **independentes** em `public.profiles`. "Pode moderar / é gestor" = `is_admin OR is_master`.
- Funções que leem tabelas com RLS restritiva rodam `SECURITY DEFINER set search_path = public` (padrão de `is_ambassador_of`, `is_master`).
- Colunas de `public.notifications` usadas: `user_id, type, title, message, report_id, link, is_read, created_at` (nem todas obrigatórias; espelhar o insert dos triggers existentes).
- Migrations nunca editam arquivos já aplicados; sempre criar migration nova com `create or replace` / `drop policy if exists`.
- Numeração de migrations continua a partir de **132**.
- Commits pequenos e frequentes, mensagens em pt-BR, terminando com a linha `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

## File Structure

- `supabase/migrations/132_ambassador_applications.sql` — tabela + índices + RLS + trigger de notificação (candidatura → masters/admins).
- `supabase/migrations/133_approve_ambassador_application.sql` — RPC `approve_ambassador_application`.
- `supabase/migrations/134_notify_ambassadors_moderation.sql` — reescreve `notify_admins_new_report` e `notify_new_report_update` para incluir embaixadores da cidade.
- `supabase/migrations/135_get_invite_preview_email_expire.sql` — reescreve `get_invite_preview` (e-mail mascarado + marca `expired`).
- `supabase/functions/accept-ambassador-invite/index.ts` — validação de e-mail + expiração.
- `src/pages/BecomeAmbassadorPage.jsx` — página pública (novo).
- `src/App.jsx` — rota `/seja-embaixador`.
- `src/pages/admin/ManageMastersPage.jsx` — aba "Candidaturas" + e-mail obrigatório no gerar-convite.
- `src/pages/AcceptInvitePage.jsx` — trata `invite_email_mismatch`.

---

### Task 1: Migration — tabela `ambassador_applications` + RLS + notificação de candidatura

**Files:**
- Create: `supabase/migrations/132_ambassador_applications.sql`

**Interfaces:**
- Produces: tabela `public.ambassador_applications` (colunas: `id bigint`, `user_id uuid`, `city_id bigint`, `applicant_name text`, `applicant_email text`, `motivation text`, `status text`, `reviewed_by uuid`, `reviewed_at timestamptz`, `rejection_reason text`, `created_at timestamptz`); trigger `notify_admins_new_application`.

- [ ] **Step 1: Escrever a migration**

```sql
-- 132_ambassador_applications.sql
-- Candidaturas a embaixador (fluxo público de auto-cadastro com aprovação).

create table if not exists public.ambassador_applications (
  id               bigint generated always as identity primary key,
  user_id          uuid not null references auth.users(id) on delete cascade,
  city_id          bigint not null references public.cities(id) on delete cascade,
  applicant_name   text,
  applicant_email  text,
  motivation       text,
  status           text not null default 'pending',  -- pending | approved | rejected
  reviewed_by      uuid references auth.users(id),
  reviewed_at      timestamptz,
  rejection_reason text,
  created_at       timestamptz not null default now()
);

create index if not exists idx_ambassador_applications_status_created
  on public.ambassador_applications (status, created_at desc);

alter table public.ambassador_applications enable row level security;

-- SELECT: própria candidatura OU gestor (master/admin)
drop policy if exists "ambassador_applications_select" on public.ambassador_applications;
create policy "ambassador_applications_select"
  on public.ambassador_applications for select
  using (
    user_id = auth.uid()
    or public.is_master(auth.uid())
    or coalesce((select is_admin from public.profiles where id = auth.uid() limit 1), false)
  );

-- INSERT: candidato cria a própria
drop policy if exists "ambassador_applications_insert" on public.ambassador_applications;
create policy "ambassador_applications_insert"
  on public.ambassador_applications for insert
  with check (user_id = auth.uid());

-- UPDATE: só gestor (master/admin) revisa
drop policy if exists "ambassador_applications_update" on public.ambassador_applications;
create policy "ambassador_applications_update"
  on public.ambassador_applications for update
  using (
    public.is_master(auth.uid())
    or coalesce((select is_admin from public.profiles where id = auth.uid() limit 1), false)
  );

-- Notificação: nova candidatura → masters e admins (sem duplicar quem é ambos)
create or replace function public.notify_admins_new_application()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_city text;
begin
  select name into v_city from public.cities where id = new.city_id;
  insert into public.notifications (user_id, type, title, message, link, is_read, created_at)
  select
    p.id,
    'ambassador_application',
    'Nova candidatura a embaixador',
    'Nova candidatura a embaixador de ' || coalesce(v_city, 'cidade') ||
      ' (' || coalesce(new.applicant_name, 'candidato') || ') aguarda avaliação.',
    '/admin/masters',
    false,
    now()
  from public.profiles p
  where p.is_master = true or p.is_admin = true;
  return new;
end;
$$;

drop trigger if exists on_application_insert_notify on public.ambassador_applications;
create trigger on_application_insert_notify
  after insert on public.ambassador_applications
  for each row execute function public.notify_admins_new_application();

notify pgrst, 'reload schema';
```

- [ ] **Step 2: Aplicar no dev**

Run: `supabase db push`
Expected: aplica a migration 132 sem erro (ou "Applying migration 132..."). Se disser "up to date", verificar no Step 3 se a tabela existe de fato.

- [ ] **Step 3: Verificar a tabela e policies no dev (SQL editor)**

```sql
select column_name, data_type from information_schema.columns
where table_schema='public' and table_name='ambassador_applications' order by ordinal_position;

select policyname, cmd from pg_policies
where schemaname='public' and tablename='ambassador_applications';
```
Expected: 11 colunas listadas; 3 policies (select/insert/update).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/132_ambassador_applications.sql
git commit -m "feat(embaixador): tabela ambassador_applications + RLS + notifica gestores"
```

---

### Task 2: Migration — RPC `approve_ambassador_application`

**Files:**
- Create: `supabase/migrations/133_approve_ambassador_application.sql`

**Interfaces:**
- Consumes: `public.ambassador_applications` (Task 1), `public.ambassador_cities`, `public.is_master`.
- Produces: função `public.approve_ambassador_application(p_app_id bigint) returns void`.

- [ ] **Step 1: Escrever a migration**

```sql
-- 133_approve_ambassador_application.sql
-- Aprova uma candidatura: ativa o embaixador, marca approved e notifica o candidato.

create or replace function public.approve_ambassador_application(p_app_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_app   public.ambassador_applications%rowtype;
  v_city  text;
begin
  -- Só gestor (master/admin) pode aprovar
  if not (
    public.is_master(auth.uid())
    or coalesce((select is_admin from public.profiles where id = auth.uid() limit 1), false)
  ) then
    raise exception 'not_authorized';
  end if;

  select * into v_app from public.ambassador_applications
  where id = p_app_id and status = 'pending';
  if not found then
    raise exception 'application_not_found_or_not_pending';
  end if;

  -- Ativa o embaixador (idempotente por user_id+city_id)
  insert into public.ambassador_cities (user_id, city_id, status)
  values (v_app.user_id, v_app.city_id, 'active')
  on conflict (user_id, city_id) do update set status = 'active';

  update public.ambassador_applications
  set status = 'approved', reviewed_by = auth.uid(), reviewed_at = now()
  where id = p_app_id;

  select name into v_city from public.cities where id = v_app.city_id;
  insert into public.notifications (user_id, type, title, message, link, is_read, created_at)
  values (
    v_app.user_id,
    'ambassador_application',
    'Você é embaixador! 🎉',
    'Sua candidatura para embaixador de ' || coalesce(v_city, 'sua cidade') || ' foi aprovada.',
    '/embaixador',
    false,
    now()
  );
end;
$$;

grant execute on function public.approve_ambassador_application(bigint) to authenticated;

notify pgrst, 'reload schema';
```

- [ ] **Step 2: Aplicar no dev**

Run: `supabase db push`
Expected: migration 133 aplicada.

- [ ] **Step 3: Verificar a função existe**

```sql
select proname, pg_get_function_identity_arguments(oid)
from pg_proc where proname = 'approve_ambassador_application';
```
Expected: uma linha, args `p_app_id bigint`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/133_approve_ambassador_application.sql
git commit -m "feat(embaixador): RPC approve_ambassador_application (ativa + notifica)"
```

---

### Task 3: Migration — notificar embaixadores da cidade (bronca nova + atualização)

**Files:**
- Create: `supabase/migrations/134_notify_ambassadors_moderation.sql`

**Interfaces:**
- Consumes: `public.ambassador_cities`, `public.moderation_admins`, `public.reports`.
- Produces: `notify_admins_new_report` e `notify_new_report_update` reescritas (mesmos nomes/triggers), agora incluindo embaixadores ativos da cidade.

- [ ] **Step 1: Escrever a migration**

```sql
-- 134_notify_ambassadors_moderation.sql
-- Estende os triggers de moderação para também notificar os embaixadores
-- ATIVOS da cidade da bronca (além dos admins, que continuam recebendo).

-- ── Bronca nova → admins + embaixadores da cidade ──
create or replace function public.notify_admins_new_report()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.moderation_status = 'pending_approval' then
    -- admins (comportamento existente)
    insert into public.notifications (user_id, type, title, message, report_id, is_read, created_at)
    select
      ma.user_id, 'moderation_required', 'Moderação de bronca',
      'Uma nova bronca foi cadastrada e aguarda moderação: "' || coalesce(new.title, 'Sem título') || '"',
      new.id, false, now()
    from public.moderation_admins ma;

    -- embaixadores ativos da cidade (novo)
    if new.city_id is not null then
      insert into public.notifications (user_id, type, title, message, report_id, is_read, created_at)
      select
        ac.user_id, 'moderation_required', 'Moderação de bronca',
        'Uma nova bronca foi cadastrada e aguarda moderação: "' || coalesce(new.title, 'Sem título') || '"',
        new.id, false, now()
      from public.ambassador_cities ac
      where ac.status = 'active'
        and ac.city_id = new.city_id
        and ac.user_id is distinct from new.author_id;
    end if;
  end if;
  return new;
end;
$$;

-- ── Atualização nova → autor + admins + embaixadores da cidade ──
create or replace function public.notify_new_report_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_author_id uuid;
  v_title text;
  v_city_id bigint;
  v_label text;
begin
  select author_id, title, city_id into v_author_id, v_title, v_city_id
  from public.reports where id = new.report_id;

  v_label := case new.update_type
    when 'still_here'   then 'O problema ainda está aqui'
    when 'being_solved' then 'O problema está sendo resolvido'
    when 'solved'       then 'O problema foi resolvido'
    else 'Nova atualização'
  end;

  -- autor da bronca (se não for quem enviou)
  if v_author_id is not null and v_author_id != new.author_id then
    insert into public.notifications (user_id, type, message, report_id, is_read, created_at)
    values (v_author_id, 'status_update', v_label || ' — "' || coalesce(v_title, 'Bronca') || '"', new.report_id, false, now());
  end if;

  -- admins (exceto quem enviou)
  insert into public.notifications (user_id, type, message, report_id, is_read, created_at)
  select ma.user_id, 'status_update', v_label || ' — "' || coalesce(v_title, 'Bronca') || '"', new.report_id, false, now()
  from public.moderation_admins ma
  where ma.user_id != new.author_id;

  -- embaixadores ativos da cidade (novo; exceto quem enviou e exceto o autor já notificado)
  if v_city_id is not null then
    insert into public.notifications (user_id, type, message, report_id, is_read, created_at)
    select ac.user_id, 'status_update', v_label || ' — "' || coalesce(v_title, 'Bronca') || '"', new.report_id, false, now()
    from public.ambassador_cities ac
    where ac.status = 'active'
      and ac.city_id = v_city_id
      and ac.user_id is distinct from new.author_id
      and ac.user_id is distinct from v_author_id;
  end if;

  return new;
end;
$$;

notify pgrst, 'reload schema';
```

- [ ] **Step 2: Aplicar no dev**

Run: `supabase db push`
Expected: migration 134 aplicada.

- [ ] **Step 3: Verificar (SQL editor) — simular contagem de destinatários**

```sql
-- Deve retornar > 0 se houver embaixador ativo de alguma cidade com broncas
select ac.city_id, count(*) as embaixadores_ativos
from public.ambassador_cities ac
where ac.status = 'active'
group by ac.city_id;
```
Expected: retorna as cidades com embaixadores ativos (ex.: 159 Serra Talhada). A verificação funcional real é no Step 4.

- [ ] **Step 4: Verificação funcional (UI, dev)**

Com uma conta comum, cadastre uma bronca numa cidade que tenha embaixador ativo (ex.: Serra Talhada 159). Logue como o embaixador daquela cidade e confira que chegou notificação "Moderação de bronca". Repita enviando uma atualização na bronca por outra conta e confira a notificação de atualização no embaixador.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/134_notify_ambassadors_moderation.sql
git commit -m "feat(embaixador): notifica embaixadores da cidade em bronca nova e atualização"
```

---

### Task 4: Migration — `get_invite_preview` com e-mail mascarado + marca `expired`

**Files:**
- Create: `supabase/migrations/135_get_invite_preview_email_expire.sql`

**Interfaces:**
- Consumes: `public.ambassador_invites`, `public.cities`, `public.states`, `public.profiles`.
- Produces: `get_invite_preview(p_token text)` retornando colunas `city_name, city_uf, invited_by_name, invited_email_masked, expires_at`.

- [ ] **Step 1: Escrever a migration**

```sql
-- 135_get_invite_preview_email_expire.sql
-- get_invite_preview: adiciona e-mail mascarado ao retorno e marca convites
-- vencidos como 'expired' ao serem lidos. Vira VOLATILE por causa do UPDATE.

drop function if exists public.get_invite_preview(text);

create or replace function public.get_invite_preview(p_token text)
returns table (
  city_name            text,
  city_uf              text,
  invited_by_name      text,
  invited_email_masked text,
  expires_at           timestamptz
)
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  -- Marca como expirado se venceu e ainda está pending
  update public.ambassador_invites
  set status = 'expired'
  where token = p_token and status = 'pending' and expires_at <= now();

  return query
  select
    c.name,
    coalesce(st.uf, ''),
    coalesce(p.name, 'um master'),
    case
      when ai.invited_email is null or position('@' in ai.invited_email) = 0 then null
      else
        left(split_part(ai.invited_email, '@', 1), 1) || '••@' ||
        left(split_part(ai.invited_email, '@', 2), 1) || '••.' ||
        reverse(split_part(reverse(ai.invited_email), '.', 1))
    end,
    ai.expires_at
  from public.ambassador_invites ai
  join public.cities c on c.id = ai.city_id
  left join public.states st on st.id = c.state_id
  left join public.profiles p on p.id = ai.invited_by
  where ai.token = p_token
    and ai.status = 'pending'
    and ai.expires_at > now()
  limit 1;
end;
$$;

grant execute on function public.get_invite_preview(text) to anon, authenticated;

notify pgrst, 'reload schema';
```

- [ ] **Step 2: Aplicar no dev**

Run: `supabase db push`
Expected: migration 135 aplicada.

- [ ] **Step 3: Verificar mascaramento e expiração (SQL editor)**

```sql
-- pega um token pending existente (se houver) e testa o preview
select * from public.get_invite_preview(
  (select token from public.ambassador_invites where status='pending' limit 1)
);
```
Expected: retorna a linha com `invited_email_masked` no formato `j••@e••.com` (ou null se o convite não tem e-mail).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/135_get_invite_preview_email_expire.sql
git commit -m "feat(embaixador): preview de convite com e-mail mascarado e marca expired"
```

---

### Task 5: Edge Function — aceite amarrado ao e-mail + expiração

**Files:**
- Modify: `supabase/functions/accept-ambassador-invite/index.ts`

**Interfaces:**
- Consumes: `ambassador_invites` (com `invited_email`).
- Produces: respostas de erro `403 { error: "invite_email_mismatch" }` e `410 { error: "invite_expired" }`.

- [ ] **Step 1: Adicionar validação de e-mail e expiração**

No bloco após validar o convite (`if (inviteError || !invite)`), a query já filtra `status='pending'` e `expires_at > now()`. Adicionar:
1. selecionar `invited_email` na query do convite (adicionar à lista `select`);
2. depois de obter `invite`, validar e-mail. Substituir o bloco entre a validação do convite e o upsert por:

```ts
    // 5.1 Validar e-mail amarrado (se o convite tiver e-mail)
    const inviteEmail: string | null = (invite as any).invited_email ?? null;
    if (inviteEmail && user.email &&
        inviteEmail.toLowerCase() !== user.email.toLowerCase()) {
      return new Response(JSON.stringify({ error: "invite_email_mismatch" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
```

E adicionar `invited_email` ao select da query do convite (linha do `.select(...)`):

```ts
      .select("id, city_id, status, expires_at, invited_email, cities(name)")
```

- [ ] **Step 2: Marcar expirado quando vencido**

A query atual já exclui vencidos (`gt("expires_at", now)`), então um convite vencido cai no erro 404 genérico. Para marcá-lo `expired`, trocar a query única por: buscar por token (sem filtro de expiração), e então decidir. Substituir o bloco da query (`const { data: invite ... } = await ... .single();`) por:

```ts
    const { data: invite, error: inviteError } = await supabaseAdmin
      .from("ambassador_invites")
      .select("id, city_id, status, expires_at, invited_email, cities(name)")
      .eq("token", token)
      .single();

    if (inviteError || !invite) {
      return new Response(JSON.stringify({ error: "Convite inválido ou já utilizado" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Expirado → marca e retorna
    if (invite.status === "pending" && new Date(invite.expires_at).getTime() <= Date.now()) {
      await supabaseAdmin.from("ambassador_invites")
        .update({ status: "expired" }).eq("id", invite.id);
      return new Response(JSON.stringify({ error: "invite_expired" }), {
        status: 410,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Não-pending → inválido
    if (invite.status !== "pending") {
      return new Response(JSON.stringify({ error: "Convite inválido ou já utilizado" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
```

- [ ] **Step 3: Validar sintaxe (esbuild)**

Run: `node -e "const fs=require('fs'),eb=require('esbuild'); eb.transformSync(fs.readFileSync('supabase/functions/accept-ambassador-invite/index.ts','utf8'),{loader:'ts'}); console.log('OK')"`
Expected: `OK`

- [ ] **Step 4: Deploy no dev**

Run: `supabase functions deploy accept-ambassador-invite`
Expected: `Deployed Functions on project xxdletrjyjajtrmhwzev: accept-ambassador-invite`

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/accept-ambassador-invite/index.ts
git commit -m "feat(embaixador): aceite valida e-mail do convite e marca expirados"
```

---

### Task 6: Refino do gerar-convite — e-mail obrigatório + dedup por e-mail

**Files:**
- Modify: `src/pages/admin/ManageMastersPage.jsx` (componente `CreateInviteSection`)

**Interfaces:**
- Consumes: nada novo.
- Produces: convites sempre com `invited_email`.

- [ ] **Step 1: Tornar e-mail obrigatório e validar formato**

No `CreateInviteSection`, adicionar helper de validação perto do topo do componente:

```jsx
  const isValidEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((e || '').trim());
```

No `handleGenerateInvite`, no início (após o guard de cidade), adicionar:

```jsx
    if (!isValidEmail(inviteEmail)) {
      toast({ title: 'Informe um e-mail válido para o convite', variant: 'destructive' });
      return;
    }
```

E tornar o `invited_email` sempre presente no insert (trocar o bloco condicional):

```jsx
    const insertData = {
      token,
      city_id: Number(selectedCityId),
      invited_by: user.id,
      status: 'pending',
      expires_at: expiresAt,
      invited_email: inviteEmail.trim(),
    };
```

- [ ] **Step 2: Marcar o campo como obrigatório na UI e desabilitar o botão**

Trocar o label do e-mail (de "(opcional)") para obrigatório:

```jsx
          <label className="block text-sm font-medium mb-1.5">E-mail do convidado <span className="text-red-500">*</span></label>
```

No botão "Gerar Convite", adicionar `|| !isValidEmail(inviteEmail)` à condição `disabled`:

```jsx
            disabled={submitting || !selectedCityId || checkingDuplicate || !isValidEmail(inviteEmail)}
```

- [ ] **Step 3: Dedup por cidade + e-mail**

No `handleSelectCity`, a checagem de duplicado hoje é só por `city_id`. Como o e-mail é digitado depois da cidade, mover a checagem para o momento do submit. No `handleGenerateInvite`, antes de gerar o token, adicionar:

```jsx
    const { data: dup } = await supabase
      .from('ambassador_invites')
      .select('id')
      .eq('city_id', Number(selectedCityId))
      .eq('invited_email', inviteEmail.trim())
      .eq('status', 'pending')
      .limit(1)
      .maybeSingle();
    if (dup) {
      toast({ title: 'Já existe um convite pendente para este e-mail nesta cidade', variant: 'destructive' });
      setSubmitting(false);
      return;
    }
```

(Manter o fluxo `existingPendingInvite` de "revogar e criar novo" como está — ele cobre o caso por cidade e continua útil.)

- [ ] **Step 4: Validar sintaxe (esbuild)**

Run: `node -e "const fs=require('fs'),eb=require('esbuild'); eb.transformSync(fs.readFileSync('src/pages/admin/ManageMastersPage.jsx','utf8'),{loader:'jsx'}); console.log('OK')"`
Expected: `OK`

- [ ] **Step 5: Verificação (UI dev)**

Como master, abrir Gestão de Embaixadores → Criar Convite: o botão fica desabilitado sem e-mail; com e-mail válido gera o link; tentar gerar de novo mesmo e-mail+cidade → bloqueado.

- [ ] **Step 6: Commit**

```bash
git add src/pages/admin/ManageMastersPage.jsx
git commit -m "feat(embaixador): e-mail obrigatório e dedup por e-mail ao gerar convite"
```

---

### Task 7: AcceptInvitePage — tratar `invite_email_mismatch` e `invite_expired`

**Files:**
- Modify: `src/pages/AcceptInvitePage.jsx`

**Interfaces:**
- Consumes: respostas de erro da Edge Function (Task 5); `invited_email_masked` do preview (Task 4).

- [ ] **Step 1: Mensagens de erro específicas no aceite**

No bloco `if (!response.ok)` do `accept()`, trocar por tratamento por código:

```jsx
        if (!response.ok) {
          const code = json?.error;
          const msg =
            code === 'invite_email_mismatch'
              ? 'Este convite é para outro e-mail. Entre com a conta do e-mail convidado.'
              : code === 'invite_expired'
              ? 'Este convite expirou. Peça um novo ao administrador.'
              : (json?.error ?? 'Erro ao aceitar o convite.');
          setErrorMessage(msg);
          setPhase('error');
          return;
        }
```

- [ ] **Step 2: Mostrar e-mail mascarado no preview (opcional, se presente)**

No card de preview, abaixo do "Convidado por", adicionar (usa o novo campo do preview):

```jsx
              {preview?.invited_email_masked && (
                <p className="text-white/70 text-xs mt-1">
                  Convite para {preview.invited_email_masked}
                </p>
              )}
```

E incluir o campo ao setar o preview (no `fetchPreview`, dentro do `setPreview({...})`):

```jsx
          invited_email_masked: row.invited_email_masked,
```

- [ ] **Step 3: Validar sintaxe (esbuild)**

Run: `node -e "const fs=require('fs'),eb=require('esbuild'); eb.transformSync(fs.readFileSync('src/pages/AcceptInvitePage.jsx','utf8'),{loader:'jsx'}); console.log('OK')"`
Expected: `OK`

- [ ] **Step 4: Commit**

```bash
git add src/pages/AcceptInvitePage.jsx
git commit -m "feat(embaixador): AcceptInvitePage trata e-mail incorreto/expirado e mostra e-mail mascarado"
```

---

### Task 8: Página pública `/seja-embaixador` — estrutura + rota

**Files:**
- Create: `src/pages/BecomeAmbassadorPage.jsx`
- Modify: `src/App.jsx`

**Interfaces:**
- Consumes: `useAuth` (`user`, `signUp`, `signIn`, `refreshUserProfile`), `useCity` (`cities`), `supabase`.
- Produces: rota `/seja-embaixador`; insere em `ambassador_applications`.

- [ ] **Step 1: Criar a página (hero + cards + form logado/não-logado)**

Create `src/pages/BecomeAmbassadorPage.jsx`:

```jsx
import { useState, useMemo } from 'react';
import { Helmet } from 'react-helmet';
import { useNavigate } from 'react-router-dom';
import { ShieldCheck, MapPin, CheckCircle2, Loader2, Search, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/use-toast';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useCity } from '@/contexts/CityContext';
import { supabase } from '@/lib/customSupabaseClient';

const normStr = (s) => (s || '').toLowerCase().normalize('NFD').replace(/\p{Mn}/gu, '');
const isValidEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((e || '').trim());

const BecomeAmbassadorPage = () => {
  const { user, signUp, signIn, refreshUserProfile } = useAuth();
  const { cities, loadingCities } = useCity();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [motivation, setMotivation] = useState('');
  const [selectedCityId, setSelectedCityId] = useState('');
  const [selectedCityLabel, setSelectedCityLabel] = useState('');
  const [citySearch, setCitySearch] = useState('');
  const [cityDropOpen, setCityDropOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const filteredCities = useMemo(() => {
    const term = normStr(citySearch.trim());
    if (!term) return cities.slice(0, 50);
    return cities
      .filter((c) => normStr(c.name).includes(term) || normStr(c.state?.uf || '').includes(term))
      .slice(0, 50);
  }, [cities, citySearch]);

  const selectCity = (city) => {
    setSelectedCityId(String(city.id));
    setSelectedCityLabel(`${city.name}${city.state?.uf ? ` (${city.state.uf})` : ''}`);
    setCitySearch('');
    setCityDropOpen(false);
  };

  const insertApplication = async (uid, applicantName, applicantEmail) => {
    // Guard: já é embaixador ativo desta cidade?
    const { data: active } = await supabase
      .from('ambassador_cities')
      .select('id')
      .eq('user_id', uid)
      .eq('city_id', Number(selectedCityId))
      .eq('status', 'active')
      .maybeSingle();
    if (active) {
      toast({ title: 'Você já é embaixador ativo desta cidade.', variant: 'destructive' });
      return false;
    }
    // Guard: candidatura pendente duplicada?
    const { data: pend } = await supabase
      .from('ambassador_applications')
      .select('id')
      .eq('user_id', uid)
      .eq('city_id', Number(selectedCityId))
      .eq('status', 'pending')
      .maybeSingle();
    if (pend) {
      toast({ title: 'Você já tem uma candidatura em análise para esta cidade.', variant: 'destructive' });
      return false;
    }
    const { error } = await supabase.from('ambassador_applications').insert({
      user_id: uid,
      city_id: Number(selectedCityId),
      applicant_name: applicantName,
      applicant_email: applicantEmail,
      motivation: motivation.trim() || null,
      status: 'pending',
    });
    if (error) {
      toast({ title: 'Erro ao enviar candidatura', description: error.message, variant: 'destructive' });
      return false;
    }
    return true;
  };

  const handleSubmit = async () => {
    if (!selectedCityId) {
      toast({ title: 'Selecione sua cidade', variant: 'destructive' });
      return;
    }
    setSubmitting(true);
    try {
      if (user) {
        const ok = await insertApplication(user.id, user.name || null, user.email || null);
        if (ok) setDone(true);
      } else {
        // valida campos de cadastro
        if (!name.trim() || !isValidEmail(email) || password.length < 6) {
          toast({ title: 'Preencha nome, e-mail válido e senha (mín. 6).', variant: 'destructive' });
          setSubmitting(false);
          return;
        }
        const { error } = await signUp(email.trim(), password, {
          data: { name: name.trim(), avatar_type: 'generated', avatar_url: null },
        });
        if (error) {
          toast({ title: 'Erro ao criar conta', description: error.message, variant: 'destructive' });
          setSubmitting(false);
          return;
        }
        // Tenta autenticar na hora (mesmo padrão do RegisterPage). Se a confirmação
        // de e-mail estiver ativa, pode não haver sessão — tratamos abaixo.
        await signIn(email.trim(), password);
        const { data: sessionData } = await supabase.auth.getSession();
        const uid = sessionData?.session?.user?.id;
        if (!uid) {
          toast({
            title: 'Confirme seu e-mail para concluir',
            description: 'Criamos sua conta. Confirme o e-mail, faça login e candidate-se novamente nesta página.',
          });
          setSubmitting(false);
          return;
        }
        if (refreshUserProfile) await refreshUserProfile();
        const ok = await insertApplication(uid, name.trim(), email.trim());
        if (ok) setDone(true);
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (done) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background px-4 text-center">
        <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center mb-6">
          <CheckCircle2 className="w-10 h-10 text-green-600" />
        </div>
        <h1 className="text-2xl font-bold mb-2">Recebemos sua candidatura!</h1>
        <p className="text-muted-foreground max-w-sm mb-8">
          Nosso time vai avaliar e você será notificado. Obrigado por querer ajudar sua cidade.
        </p>
        <Button onClick={() => navigate('/')}>Voltar ao início</Button>
      </div>
    );
  }

  return (
    <>
      <Helmet><title>Seja um Embaixador - Trombone Cidadão</title></Helmet>

      {/* HERO / BANNER */}
      <div
        className="relative text-white"
        style={{
          background:
            'linear-gradient(135deg, rgba(182,23,34,0.92), rgba(182,23,34,0.75)), url(/images/embaixador-hero.jpg) center/cover',
        }}
      >
        <div className="max-w-4xl mx-auto px-6 py-16 md:py-24 text-center">
          <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/15 text-sm font-semibold mb-5">
            <ShieldCheck className="w-4 h-4" /> Programa de Embaixadores
          </span>
          <h1 className="text-3xl md:text-5xl font-extrabold mb-4">Seja um Embaixador do Trombone Cidadão</h1>
          <p className="text-white/90 text-base md:text-lg max-w-2xl mx-auto mb-8">
            Ajude a manter sua cidade com informação de qualidade: modere broncas, valide atualizações e faça a diferença perto de você.
          </p>
          <Button
            size="lg"
            className="bg-white text-tc-red hover:bg-white/90"
            onClick={() => document.getElementById('form-candidatura')?.scrollIntoView({ behavior: 'smooth' })}
          >
            Quero participar <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        </div>
      </div>

      {/* BENEFÍCIOS */}
      <div className="max-w-4xl mx-auto px-6 py-12 grid gap-4 sm:grid-cols-3">
        {[
          ['Aprove broncas', 'Você revisa e aprova as broncas da sua cidade.'],
          ['Modere atualizações', 'Garante que as atualizações dos moradores sejam confiáveis.'],
          ['Fortaleça sua cidade', 'Mais qualidade e engajamento onde você vive.'],
        ].map(([t, d]) => (
          <div key={t} className="rounded-2xl border border-border p-5 bg-card">
            <CheckCircle2 className="w-6 h-6 text-tc-red mb-2" />
            <p className="font-bold mb-1">{t}</p>
            <p className="text-sm text-muted-foreground">{d}</p>
          </div>
        ))}
      </div>

      {/* FORM */}
      <div id="form-candidatura" className="max-w-xl mx-auto px-6 pb-20">
        <div className="rounded-2xl border border-border bg-card p-6 shadow-sm space-y-4">
          <h2 className="text-xl font-bold">Candidate-se</h2>

          {!user && (
            <>
              <div>
                <label className="block text-sm font-medium mb-1.5">Nome <span className="text-red-500">*</span></label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Seu nome" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5">E-mail <span className="text-red-500">*</span></label>
                <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="voce@email.com" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5">Senha <span className="text-red-500">*</span></label>
                <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="mín. 6 caracteres" />
              </div>
              <p className="text-xs text-muted-foreground">
                Já tem conta?{' '}
                <button type="button" className="text-tc-red font-semibold" onClick={() => navigate('/login')}>Entrar</button>
              </p>
            </>
          )}

          {user && (
            <p className="text-sm text-muted-foreground">
              Candidatando-se como <span className="font-semibold text-foreground">{user.name || user.email}</span>.
            </p>
          )}

          {/* Cidade */}
          <div>
            <label className="block text-sm font-medium mb-1.5">Cidade <span className="text-red-500">*</span></label>
            {loadingCities ? (
              <div className="flex items-center gap-2 text-muted-foreground text-sm">
                <Loader2 className="w-4 h-4 animate-spin" /> Carregando cidades...
              </div>
            ) : (
              <div className="relative">
                <div className="flex items-center gap-2 border border-input rounded-md px-3 py-2 bg-background">
                  <Search className="w-4 h-4 text-muted-foreground shrink-0" />
                  <input
                    type="text"
                    className="flex-1 bg-transparent outline-none text-sm"
                    placeholder={selectedCityLabel || 'Buscar cidade...'}
                    value={citySearch}
                    onChange={(e) => { setCitySearch(e.target.value); setCityDropOpen(true); }}
                    onFocus={() => setCityDropOpen(true)}
                    onBlur={() => setTimeout(() => setCityDropOpen(false), 150)}
                  />
                </div>
                {cityDropOpen && (
                  <div className="absolute z-50 w-full mt-1 bg-popover border border-border rounded-md shadow-lg max-h-60 overflow-y-auto">
                    {filteredCities.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-4">Nenhuma cidade encontrada.</p>
                    ) : (
                      filteredCities.map((city) => (
                        <button
                          key={city.id}
                          type="button"
                          onMouseDown={() => selectCity(city)}
                          className="w-full text-left px-3 py-2 text-sm hover:bg-accent flex items-center gap-2"
                        >
                          <MapPin className="w-3.5 h-3.5 text-muted-foreground" />
                          {city.name}{city.state?.uf ? ` (${city.state.uf})` : ''}
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Motivo */}
          <div>
            <label className="block text-sm font-medium mb-1.5">Por que quer ser embaixador?</label>
            <textarea
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm min-h-[100px]"
              value={motivation}
              onChange={(e) => setMotivation(e.target.value)}
              placeholder="Conte por que você quer ajudar sua cidade..."
            />
          </div>

          <Button className="w-full" disabled={submitting} onClick={handleSubmit}>
            {submitting ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Enviando...</> : 'Enviar candidatura'}
          </Button>
        </div>
      </div>
    </>
  );
};

export default BecomeAmbassadorPage;
```

- [ ] **Step 2: Registrar a rota pública**

Em `src/App.jsx`, adicionar o import perto dos outros imports de página:

```jsx
import BecomeAmbassadorPage from '@/pages/BecomeAmbassadorPage';
```

E adicionar a rota junto às rotas públicas (perto de `/cadastro`, linha ~587):

```jsx
              <Route path="/seja-embaixador" element={<BecomeAmbassadorPage />} />
```

- [ ] **Step 3: Validar sintaxe (esbuild)**

Run: `node -e "const fs=require('fs'),eb=require('esbuild'); for (const f of ['src/pages/BecomeAmbassadorPage.jsx','src/App.jsx']) { eb.transformSync(fs.readFileSync(f,'utf8'),{loader:'jsx'}); console.log('OK',f); }"`
Expected: `OK` para os dois.

- [ ] **Step 4: Verificação (UI dev)**

Abrir `/seja-embaixador` deslogado: hero aparece (gradiente mesmo sem a imagem), form pede nome/email/senha/cidade/motivo. Logado: mostra "Candidatando-se como …" e só cidade/motivo. Enviar → tela "Recebemos sua candidatura!". Conferir no SQL: `select * from ambassador_applications order by created_at desc limit 1;`

- [ ] **Step 5: Commit**

```bash
git add src/pages/BecomeAmbassadorPage.jsx src/App.jsx
git commit -m "feat(embaixador): página pública /seja-embaixador (candidatura logado e novo cadastro)"
```

---

### Task 9: Aba "Candidaturas" no master (aprovar/rejeitar)

**Files:**
- Modify: `src/pages/admin/ManageMastersPage.jsx`

**Interfaces:**
- Consumes: `ambassador_applications`, RPC `approve_ambassador_application` (Task 2).
- Produces: 4ª aba com fila e ações.

- [ ] **Step 1: Criar o componente da seção de candidaturas**

Em `ManageMastersPage.jsx`, adicionar antes do componente `ManageMastersPage` principal:

```jsx
const ApplicationsSection = () => {
  const { toast } = useToast();
  const [apps, setApps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState(null);
  const [expandedId, setExpandedId] = useState(null);

  const fetchApps = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('ambassador_applications')
      .select('id, user_id, city_id, applicant_name, applicant_email, motivation, created_at, cities(name, states(uf))')
      .eq('status', 'pending')
      .order('created_at', { ascending: true });
    if (error) toast({ title: 'Erro ao buscar candidaturas', description: error.message, variant: 'destructive' });
    else setApps(data || []);
    setLoading(false);
  }, [toast]);

  useEffect(() => { fetchApps(); }, [fetchApps]);

  const handleApprove = async (app) => {
    setActionId(`${app.id}-approve`);
    const { error } = await supabase.rpc('approve_ambassador_application', { p_app_id: app.id });
    if (error) toast({ title: 'Erro ao aprovar', description: error.message, variant: 'destructive' });
    else { toast({ title: 'Embaixador aprovado!' }); fetchApps(); }
    setActionId(null);
  };

  const handleReject = async (app) => {
    const reason = window.prompt('Motivo da rejeição (opcional):') || null;
    setActionId(`${app.id}-reject`);
    const { error } = await supabase
      .from('ambassador_applications')
      .update({ status: 'rejected', rejection_reason: reason, reviewed_at: new Date().toISOString() })
      .eq('id', app.id);
    if (error) { toast({ title: 'Erro ao rejeitar', description: error.message, variant: 'destructive' }); setActionId(null); return; }
    await supabase.from('notifications').insert({
      user_id: app.user_id,
      type: 'ambassador_application',
      title: 'Candidatura não aprovada',
      message: 'Sua candidatura a embaixador não foi aprovada' + (reason ? `: ${reason}` : '.'),
      is_read: false,
    });
    toast({ title: 'Candidatura rejeitada.' });
    fetchApps();
    setActionId(null);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 gap-3">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        <span className="text-muted-foreground">Carregando candidaturas...</span>
      </div>
    );
  }
  if (apps.length === 0) {
    return (
      <Card className="border-dashed border-2 py-12 text-center bg-muted/20">
        <CardContent className="flex flex-col items-center gap-3">
          <Users className="w-10 h-10 text-muted-foreground" />
          <p className="text-lg font-semibold text-muted-foreground">Nenhuma candidatura pendente</p>
        </CardContent>
      </Card>
    );
  }
  return (
    <div className="space-y-3">
      {apps.map((app) => (
        <motion.div key={app.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
          <Card className="border-border">
            <CardContent className="p-4 space-y-2">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm md:text-base truncate">
                    {app.applicant_name || 'Candidato'}
                    <span className="text-muted-foreground font-normal"> · {app.cities?.name || '—'} {app.cities?.states?.uf ? `(${app.cities.states.uf})` : ''}</span>
                  </p>
                  <div className="flex flex-wrap gap-3 mt-1 text-xs text-muted-foreground">
                    <span>{app.applicant_email || 'Sem e-mail'}</span>
                    <span>{new Date(app.created_at).toLocaleDateString('pt-BR')}</span>
                  </div>
                </div>
                <div className="flex gap-2 shrink-0">
                  <Button size="sm" variant="outline" className="h-8 px-3 text-xs text-red-600 border-red-300 hover:bg-red-50"
                    disabled={!!actionId} onClick={() => handleReject(app)}>
                    {actionId === `${app.id}-reject` ? <Loader2 className="w-3 h-3 animate-spin" /> : <><X className="w-3 h-3 mr-1" /> Rejeitar</>}
                  </Button>
                  <Button size="sm" className="h-8 px-3 text-xs bg-green-600 hover:bg-green-700 text-white"
                    disabled={!!actionId} onClick={() => handleApprove(app)}>
                    {actionId === `${app.id}-approve` ? <Loader2 className="w-3 h-3 animate-spin" /> : <><Check className="w-3 h-3 mr-1" /> Aprovar</>}
                  </Button>
                </div>
              </div>
              {app.motivation && (
                <button type="button" className="text-left text-sm text-muted-foreground italic"
                  onClick={() => setExpandedId(expandedId === app.id ? null : app.id)}>
                  <span className={expandedId === app.id ? '' : 'line-clamp-2'}>"{app.motivation}"</span>
                </button>
              )}
            </CardContent>
          </Card>
        </motion.div>
      ))}
    </div>
  );
};
```

- [ ] **Step 2: Adicionar a aba na TabsList e o TabsContent**

Trocar `grid-cols-3` por `grid-cols-4` na `TabsList`:

```jsx
          <TabsList className="grid w-full grid-cols-4 h-auto sm:h-10 bg-muted/50 rounded-lg mb-6">
```

Adicionar o gatilho da aba (após o de `pending-invites`):

```jsx
            <TabsTrigger value="applications" className="gap-2 text-xs sm:text-sm">
              <Users className="w-4 h-4" />
              <span className="hidden sm:inline">Candidaturas</span>
              <span className="sm:hidden">Cand.</span>
            </TabsTrigger>
```

Adicionar o conteúdo (após o `TabsContent` de `pending-invites`):

```jsx
          <TabsContent value="applications">
            <ApplicationsSection />
          </TabsContent>
```

- [ ] **Step 3: Validar sintaxe (esbuild)**

Run: `node -e "const fs=require('fs'),eb=require('esbuild'); eb.transformSync(fs.readFileSync('src/pages/admin/ManageMastersPage.jsx','utf8'),{loader:'jsx'}); console.log('OK')"`
Expected: `OK`

- [ ] **Step 4: Verificação end-to-end (UI dev)**

Como master: abrir Gestão de Embaixadores → aba Candidaturas → ver a candidatura criada na Task 8 → Aprovar. Confirmar no SQL que virou embaixador:
```sql
select * from ambassador_cities where status='active' order by created_at desc limit 3;
select status from ambassador_applications order by created_at desc limit 1;  -- approved
```
Logar como o candidato → acessar `/embaixador` (deve entrar) e conferir a notificação "Você é embaixador!".

- [ ] **Step 5: Commit**

```bash
git add src/pages/admin/ManageMastersPage.jsx
git commit -m "feat(embaixador): aba Candidaturas no master (aprovar via RPC / rejeitar)"
```

---

## Verificação final (integração, dev `xxdletrjyjajtrmhwzev`)

- [ ] Candidatura deslogado (cria conta) → aparece na aba + notifica masters/admins.
- [ ] Candidatura logado → aparece na aba + notifica masters/admins.
- [ ] Aprovar → `ambassador_cities` active + candidato notificado + acessa `/embaixador`.
- [ ] Rejeitar → status rejected + candidato notificado.
- [ ] Convite: e-mail obrigatório; aceite com e-mail diferente bloqueado; convite vencido vira `expired`.
- [ ] Bronca nova em cidade com embaixador ativo → embaixador notificado (admin também).
- [ ] Atualização em bronca de cidade com embaixador ativo → embaixador notificado.
- [ ] Candidatura duplicada pending mesma cidade → bloqueada.

## Deploy para prod (feito pelo usuário depois)

- `supabase db push` (migrations 132–135) linkado ao prod.
- `supabase functions deploy accept-ambassador-invite` linkado ao prod.
- Frontend segue o pipeline de build normal.

# Embaixadores: convites por link + candidaturas com aprovação

**Data:** 2026-07-25
**Status:** Aprovado para planejamento
**Escopo de banco:** todas as operações de banco/Edge Functions são validadas **apenas** no projeto de dev `xxdletrjyjajtrmhwzev`. Prod é atualizado depois pelo fluxo normal (`supabase db push` / `functions deploy` linkado ao prod).

---

## 1. Objetivo

Permitir que uma pessoa se torne embaixador de uma cidade por **dois caminhos**, ambos convergindo para a mesma ativação (`ambassador_cities.status = 'active'`):

1. **Convite por link** (refinar o fluxo existente) — master gera um link amarrado a 1 e-mail, que expira.
2. **Candidatura com aprovação** (novo) — pessoa se candidata numa página pública; o master aprova ou rejeita.

```
CONVITE (refinar)                    CANDIDATURA (novo)
master gera link amarrado            pessoa acessa /seja-embaixador
a 1 email + expira em 7 dias         preenche dados + motivo
    │                                     │
pessoa (aquele email) aceita         entra na fila do master
    │                                     │ master aprova
    └──────────► ambassador_cities (status='active') ◄──────────┘
                 + notificação ao novo embaixador
```

## 2. Decisões travadas (do brainstorming)

| Decisão | Escolha |
|---|---|
| Modelo | Os dois: convite **e** candidatura |
| "Link único por usuário" | Amarrado a **1 e-mail** (só aquele e-mail aceita) |
| Expiração do convite | Marcar `status='expired'` no **aceite/leitura** (sem cron) |
| Entrada da candidatura | Página **pública** `/seja-embaixador`; usuários logados também podem |
| Cadastro na candidatura | Quem não tem conta **cria a conta ali** (reusa `signUp`), depois registra a candidatura |
| Aprovação | **Ativa na hora** (cria `ambassador_cities` active imediatamente) |

## 3. Estado atual (o que já existe — não recriar)

- `ambassador_invites` (migration 124): token, city_id, invited_by, `invited_email` (opcional hoje), status, `expires_at` (default now()+7d), accepted_by/at. RLS: master total; leitura por token via `current_setting('app.invite_token')`.
- `get_invite_preview(p_token)` (migration 129): SECURITY DEFINER, retorna cidade+quem convidou+expires_at para preview anônimo; filtra `status='pending' and expires_at > now()`.
- Edge Function `accept-ambassador-invite`: valida JWT + token, upsert `ambassador_cities` (onConflict user_id,city_id), marca convite `accepted`.
- `AcceptInvitePage.jsx` (rota `/convite/:token`): preview → login/cadastro → aceite automático.
- `ManageMastersPage.jsx`: abas Criar Convite / Convites Pendentes / Embaixadores Ativos. Master gera token no client, checa duplicado **por cidade**.
- `is_ambassador_of(user, city_id)`, `is_master(user)`: helpers SECURITY DEFINER.
- Padrão de card/loading/`actionLoadingId` reutilizável nas seções da página.

## 4. Mudanças de dados

### 4.1 `ambassador_invites` — refino (sem recriar)
- `invited_email` continua nullable no schema (compatibilidade com convites antigos), mas a **UI passa a exigir** e-mail em novos convites.
- Nenhuma alteração estrutural obrigatória. (Opcional futuro: constraint — fora de escopo.)

### 4.2 Nova tabela `ambassador_applications`
```sql
create table public.ambassador_applications (
  id             bigint generated always as identity primary key,
  user_id        uuid not null references auth.users(id) on delete cascade,
  city_id        bigint not null references public.cities(id) on delete cascade,
  applicant_name text,
  applicant_email text,
  motivation     text,
  status         text not null default 'pending',  -- pending | approved | rejected
  reviewed_by    uuid references auth.users(id),
  reviewed_at    timestamptz,
  rejection_reason text,
  created_at     timestamptz not null default now()
);
```
- `user_id` é **NOT NULL**: a candidatura só é registrada depois que há conta (a página cria a conta antes, se necessário). Isso garante que a aprovação sempre tenha um `user_id` válido para inserir em `ambassador_cities`.
- Índice em `(status, created_at)` para a fila.

**RLS:**
- SELECT: `user_id = auth.uid()` (própria) OR `is_master(auth.uid())`.
- INSERT: `with check (user_id = auth.uid())` (candidato cria a própria).
- UPDATE: `is_master(auth.uid())` (só master revisa).

### 4.3 RPC `approve_ambassador_application(p_app_id bigint)`
`SECURITY DEFINER`, `search_path = public`. Passos atômicos:
1. `if not is_master(auth.uid()) then raise exception` (guarda de autorização).
2. Lê a candidatura `pending`; se não existir, exceção.
3. `upsert ambassador_cities (user_id, city_id, status='active')` onConflict `(user_id, city_id)` — mesmo padrão da Edge Function de convite.
4. `update ambassador_applications set status='approved', reviewed_by=auth.uid(), reviewed_at=now()`.
5. `insert notifications` para o candidato: "Você foi aprovado como embaixador de {cidade}!" com link `/embaixador`.

Rejeição **não** precisa de RPC: é um `UPDATE` simples coberto pela policy de UPDATE (master), + insert de notificação. Fica no client, como as outras ações de moderação da página.

### 4.4 Notificação: nova candidatura → masters **e** admins
Trigger `notify_admins_new_application` (SECURITY DEFINER) `after insert on ambassador_applications`:
- Insere uma notificação `type='ambassador_application'` para **cada master ou admin** — `select id from profiles where is_master = true or is_admin = true` (a condição OR evita duplicar quem é ambos). Mensagem: `Nova candidatura a embaixador de {cidade} ({nome}) aguarda avaliação.`, link `/admin/masters` (rota da aba Candidaturas).
- Espelha o padrão de `notify_admins_new_report` (migration 100), mirando masters+admins.

## 5. Página pública `/seja-embaixador` (`BecomeAmbassadorPage.jsx`)

Rota pública nova em `App.jsx`. Mobile-first, responsiva, divulgável.

**Seções:**
1. **Hero/banner** — imagem de fundo configurável (`/images/embaixador-hero.jpg`) com **fallback gradiente tc-red** caso a imagem não exista; título "Seja um Embaixador do Trombone Cidadão", subtítulo, CTA que rola até o form.
2. **O que faz um embaixador** — 3 cards (aprova broncas, modera atualizações, mantém qualidade) reusando ícones já usados no `AcceptInvitePage`.
3. **Formulário de candidatura:**
   - **Logado:** nome/email do `user` (readonly) + cidade (busca, mesmo componente do `ManageMastersPage`) + motivo (textarea) → INSERT em `ambassador_applications` com `user_id`.
   - **Não logado:** nome, email, senha + cidade + motivo → `signUp(email, password, {name,...})` (reusa lógica de `RegisterPage`); ao obter sessão, INSERT da candidatura com `user_id`. Link alternativo "já tenho conta → /login".
4. **Rodapé** curto.

**Guardas:**
- Bloqueia candidatura `pending` duplicada da mesma pessoa+cidade (mensagem "você já tem uma candidatura em análise para esta cidade").
- Se já é embaixador ativo da cidade → aviso e sem envio.
- Sucesso → tela "Recebemos sua candidatura! O time vai avaliar e você será notificado."

**Isolamento:** componente novo, sem tocar em `RegisterPage`; só consome `signUp`/`refreshUserProfile` do `SupabaseAuthContext`.

## 6. Fila de aprovação do master (`ManageMastersPage.jsx`)

Nova 4ª aba **"Candidaturas"** (badge com contagem de pendentes), ao lado de Criar Convite / Convites Pendentes / Embaixadores Ativos.

**Card por candidatura:** nome, e-mail, cidade·UF, motivo (line-clamp + expandir), data. Ações:
- **Aprovar** → `supabase.rpc('approve_ambassador_application', { p_app_id })` → refetch. Toast "Embaixador aprovado!".
- **Rejeitar** → modal opcional de motivo → `update status='rejected', rejection_reason, reviewed_by/at` + insert notificação → refetch.

Reusa o padrão `actionLoadingId`, cards `motion.div`, `fetchX` das seções existentes.

## 7. Refino dos convites

### 7.1 E-mail obrigatório ao gerar (`CreateInviteSection`)
- Campo e-mail: opcional → **obrigatório**, com validação de formato; botão "Gerar" desabilitado sem e-mail válido.
- Checagem de duplicado: por cidade → **por cidade + e-mail** (`.eq('city_id').eq('invited_email').eq('status','pending')`). Como todo convite novo passa a ter e-mail, o dedup cobre o caso real; convites antigos sem e-mail não colidem por e-mail (comportamento aceitável).

### 7.2 Aceite amarrado ao e-mail (`accept-ambassador-invite`)
- Após validar convite + usuário, se `invite.invited_email` existe e `!== user.email` (case-insensitive) → `403 { error: "invite_email_mismatch" }`.
- `AcceptInvitePage` trata: "Este convite é para outro e-mail (mascarado). Entre com a conta correta."
- `get_invite_preview` retorna e-mail **mascarado** (`j••@e••.com`) para exibir "convite para j••@…" sem vazar a anônimos.
- Compatibilidade: convites antigos sem `invited_email` seguem sem validação de e-mail.

### 7.3 Expiração marca `status='expired'` (sem cron)
- `get_invite_preview`: se achou por token mas `expires_at < now()` e `status='pending'` → `UPDATE status='expired'` e retorna vazio. Função vira `volatile` (faz write).
- Edge Function de aceite: se achou por token porém vencido → marca `expired`, retorna "convite expirado".
- Não-abertos seguem `pending` até tocados (aceitável; a fila de pendentes filtra `expires_at > now()`).

## 7.4 Notificar embaixadores da cidade (moderação)

Hoje os triggers só notificam `moderation_admins`. Adicionamos, **nos mesmos triggers**, um bloco que notifica os **embaixadores ativos da cidade** — para que recebam alerta de moderação igual aos admins.

Alvo em ambos os casos:
```sql
from public.ambassador_cities ac
where ac.status = 'active'
  and ac.city_id = <city da bronca>
  and ac.user_id <> <autor>          -- não notificar quem gerou o item
```

### 7.4.1 Nova bronca → embaixadores (`notify_admins_new_report`, migration 100)
Estende o trigger: quando `new.moderation_status = 'pending_approval'`, além dos admins, insere `type='moderation_required'` para cada embaixador ativo de `new.city_id` (exceto `new.author_id`). Guardar `new.city_id is not null`.

### 7.4.2 Nova atualização → embaixadores (`notify_new_report_update`, migration 104)
Estende o trigger: após notificar autor + admins, busca a `city_id` da bronca-pai (`select city_id from reports where id = new.report_id`) e insere `type='status_update'` para cada embaixador ativo daquela cidade (exceto `new.author_id`).

Ambos preservam o comportamento atual (admins continuam recebendo); só **adicionam** os embaixadores. Reescritos numa nova migration para não editar migrations já aplicadas.

## 8. Arquivos afetados

| # | Entrega | Arquivos |
|---|---|---|
| 1 | Página `/seja-embaixador` | `src/pages/BecomeAmbassadorPage.jsx` (novo), `src/App.jsx` |
| 2 | Tabela `ambassador_applications` + RLS | nova migration (ex. `132_ambassador_applications.sql`) |
| 3 | RPC `approve_ambassador_application` | nova migration (ex. `133_approve_ambassador_application.sql`) |
| 4 | Aba "Candidaturas" (aprovar/rejeitar) | `src/pages/admin/ManageMastersPage.jsx` |
| 5 | E-mail obrigatório + duplicado por email | `src/pages/admin/ManageMastersPage.jsx` |
| 6 | Aceite amarrado ao e-mail + preview mascarado | `supabase/functions/accept-ambassador-invite/index.ts`, `get_invite_preview` (nova migration), `src/pages/AcceptInvitePage.jsx` |
| 7 | Expiração marca `expired` | mesma migration do `get_invite_preview`, `accept-ambassador-invite` |
| 8 | Notificação: candidatura → masters **e** admins | trigger em nova migration (`ambassador_applications`) |
| 9 | Notificação: nova bronca → embaixadores da cidade | nova migration reescrevendo `notify_admins_new_report` |
| 10 | Notificação: nova atualização → embaixadores da cidade | mesma migration, reescrevendo `notify_new_report_update` |

## 9. Verificação (dev `xxdletrjyjajtrmhwzev` apenas)

- Candidatura **logado**: envia → aparece na aba do master **+ masters e admins recebem notificação**.
- Candidatura **não logado**: cria conta → envia → aparece na aba + masters e admins notificados.
- **Aprovar** candidatura → vira embaixador ativo (`ambassador_cities.active`), candidato notificado, acessa `/embaixador`.
- **Rejeitar** → status rejected + notificação.
- Convite gerado com e-mail; aceite com **e-mail diferente** → bloqueado (`invite_email_mismatch`).
- Convite **vencido** aberto → `status='expired'`, mensagem de expirado.
- Candidatura **duplicada pending** mesma cidade → bloqueada.
- **Nova bronca** `pending_approval` numa cidade com embaixador ativo → o embaixador recebe notificação (e o admin continua recebendo).
- **Nova atualização** numa bronca de cidade com embaixador ativo → embaixador recebe notificação (autor e admins seguem recebendo).

## 10. Fora de escopo (YAGNI)

- Job/cron de expiração em massa (escolhido: marcar no acesso).
- Envio de e-mail transacional do convite/candidatura (só notificação in-app por ora).
- Constraint de banco tornando `invited_email` NOT NULL (só UI exige; evita quebrar convites antigos).
- Candidatura para múltiplas cidades num só envio (uma cidade por candidatura).

# Gestão de convites de embaixador

## Problema

`ManageMastersPage.jsx` tem hoje só a aba "Criar Convite" (`CreateInviteSection`, linhas 25-212): gera um `token` via `crypto.randomUUID()` no client, insere em `ambassador_invites` com `expires_at = +7 dias`, mostra o link para copiar. Não há forma de:

- Ver quais convites estão pendentes (nem quantos existem).
- Revogar um convite gerado por engano ou que não deve mais valer.
- Estender a validade de um convite perto de expirar, sem gerar um link novo.
- Saber, ao tentar convidar de novo para a mesma cidade, que já existe um convite pendente.

Um convite errado fica "preso" por 7 dias sem que o master possa fazer nada além de esperar expirar.

## Contexto confirmado no código

- Tabela `ambassador_invites` (migration `124_ambassador_invites.sql`) já tem as colunas necessárias: `token`, `city_id`, `invited_by`, `invited_email`, `status` (`pending`/`accepted`/`expired`/`revoked`), `expires_at`, `accepted_by`, `accepted_at`. **Nenhuma migration nova é necessária** — o design usa só `update`/`select` sobre colunas existentes.
- A Edge Function `supabase/functions/accept-ambassador-invite/index.ts:56-62` já filtra o convite por `.eq('status', 'pending').gt('expires_at', new Date().toISOString())`. Logo:
  - Revogar (`status = 'revoked'`) já é suficiente para invalidar o link — a função rejeita automaticamente com "Convite inválido, expirado ou já utilizado". Nenhuma mudança na Edge Function.
  - Estender `expires_at` também é suficiente para "reenviar" — o mesmo link volta a passar no filtro `gt('expires_at', now())`. Nenhuma mudança na Edge Function.
- Padrão de UI já estabelecido em `ActiveAmbassadorsSection` (linhas 217-320): fetch em `useEffect`, `useState` para loading/lista, um botão de ação por linha com estado de "processando" individual (`suspendingId`), `Card`/`CardContent`, toast de sucesso/erro, empty state com `Card` tracejado + ícone + texto.
- Estrutura de abas em `ManageMastersPage.jsx:520-537`: `Tabs` com `TabsList` em grid de 3 colunas (`grid-cols-3`), cada `TabsTrigger` com ícone + label completo (desktop) / abreviado (mobile).

## Design

### 1. Nova aba "Convites Pendentes"

- `TabsList` passa de `grid-cols-3` para `grid-cols-4`; novo `TabsTrigger value="pending-invites"` com ícone `Clock` (lucide-react), label "Convites Pendentes" / abreviado "Pendentes", posicionado logo após "Criar Convite" (antes de "Embaixadores Ativos").
- Novo componente `PendingInvitesSection`, seguindo o mesmo padrão de `ActiveAmbassadorsSection`:
  - Fetch: `ambassador_invites` com `status = 'pending'`, join com `cities(name, states(uf))`, ordenado por `created_at desc`.
  - Cada linha mostra: nome da cidade + UF, e-mail do convidado (ou "—" se não informado), "Criado em [data]", "Expira em [data]" (calculado a partir de `expires_at`).
  - Dois botões por linha: **Revogar** (`update({status: 'revoked'})` — mesmo padrão de confirmação/estado de loading que `handleSuspend`) e **Reenviar** (`update({expires_at: novaData})`, novaData = `now() + 7 dias`), ambos disparando refetch da lista e toast de sucesso.
  - Empty state: mesmo padrão visual de `ActiveAmbassadorsSection` — `Card` tracejado, ícone `Clock`, texto "Nenhum convite pendente".

### 2. Bloqueio de duplicidade em "Criar Convite"

- Em `CreateInviteSection`, ao chamar `handleSelectCity` (linha 45), disparar uma verificação: `select id, created_at from ambassador_invites where city_id = <id> and status = 'pending' limit 1`.
- Se encontrar um convite pendente: esconde o botão "Gerar Convite" e mostra um bloco de aviso no lugar — "Já existe um convite pendente para [Cidade], criado em [data]" com dois botões:
  - **Revogar e criar novo**: revoga o convite existente (`update status='revoked'`) e, em seguida, prossegue com o fluxo normal de criação (reaproveitando `handleGenerateInvite`).
  - **Cancelar**: limpa a seleção de cidade (`setSelectedCityId(''); setSelectedCityLabel('')`), sem tocar no convite existente.
- Se não encontrar: o formulário funciona exatamente como hoje, sem mudança visível.

### Fora de escopo

- Nenhuma mudança na Edge Function `accept-ambassador-invite` (o filtro existente já cobre revogação e extensão de validade).
- Nenhuma migration nova (schema já suporta tudo).
- Reenvio automático por e-mail/WhatsApp — "Reenviar" só estende `expires_at` do link já copiado manualmente pelo master; o envio do link em si continua manual, fora do app.
- Transição automática para `status = 'expired'` via cron/trigger — o filtro da Edge Function já trata convites vencidos como inválidos independente do valor de `status`; não é necessário um job para marcar isso explicitamente.

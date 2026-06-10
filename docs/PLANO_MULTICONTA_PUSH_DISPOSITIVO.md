# Plano: Multi-conta por dispositivo + revalidação admin no envio (Push)

> Status: **PLANEJAMENTO** (nada implementado ainda).
> Decisão de produto: device pode ter N contas vinculadas e recebe push de todas;
> notificações `moderation_required` (admin) são **revalidadas no envio** — se a conta
> alvo deixar de ser admin, o device para de recebê-las automaticamente.
> Relacionado: [INCIDENTE_NOTIFICACOES_BRONCA_MOBILE.md](./INCIDENTE_NOTIFICACOES_BRONCA_MOBILE.md)

---

## 1. Contexto / por que isto existe

O token FCM é **por dispositivo/instalação**, não por usuário. Hoje, ao trocar de
conta no mesmo aparelho, o app registra o mesmo token para o novo `user_id` via
`saveFCMToken` ([NotificationContext.jsx:502](../src/contexts/NotificationContext.jsx#L502)),
mas **nunca remove o vínculo das contas anteriores**. Resultado atual (verificado em
produção): há tokens compartilhados por até 3 contas — acúmulo **acidental**.

Consequência: uma notificação destinada à conta admin é entregue ao token do device,
e portanto **aparece mesmo com a conta cidadã ativa**. O `FCMService.java` é "burro":
renderiza qualquer push do token, sem noção de qual conta — a única vinculação
token→conta existe na tabela `push_subscriptions`.

A decisão foi **tornar isso intencional e gerenciado** (multi-conta com desvínculo
explícito), em vez de eliminar (1 token = 1 conta), porém com uma trava de segurança:
revalidar `is_admin` no momento do envio para tipos admin.

---

## 2. Modelo de dados

### 2.1 Tabela atual `push_subscriptions`
Colunas reais: `id, user_id, subscription_details (jsonb), created_at, updated_at`.
Constraint relevante: **`UNIQUE(user_id)`** (`push_subscriptions_user_id_key`).

⚠️ **Problema com o modelo atual para multi-conta:** o `UNIQUE(user_id)` permite só
uma linha por usuário, mas **não impede** o mesmo token em vários usuários — que é
justamente o que queremos controlar. O `subscription_details` guarda `{type:'fcm', token}`.

### 2.2 Mudança proposta — vínculo explícito device↔conta

Opção A (recomendada, mínima): **continuar usando `push_subscriptions`**, tratando cada
linha como "vínculo conta→token". Adicionar:
- Coluna `device_id text` (id estável da instalação, gerado uma vez e guardado em
  `Preferences`/localStorage) — para distinguir devices e permitir desvínculo seletivo.
- Constraint nova: `UNIQUE(user_id, device_id)` no lugar de `UNIQUE(user_id)`, para que
  um usuário possa ter o app em vários devices, e um device tenha várias contas.
- Campo opcional em `subscription_details`: `linked_at`, `last_active_account boolean`.

Opção B (mais robusta, maior esforço): tabela nova `device_accounts(device_id, user_id,
token, linked_at, unlinked_at)` separando "device" de "subscription". Melhor a longo
prazo, porém exige migração de dados e reescrita maior. **Não recomendada agora.**

> Decisão sugerida: **Opção A**. Menor risco, aproveita a tabela existente.

### 2.3 Migração de constraint
```sql
-- Remover unique antigo e criar o novo (idempotente / com guarda)
ALTER TABLE public.push_subscriptions
  DROP CONSTRAINT IF EXISTS push_subscriptions_user_id_key;
ALTER TABLE public.push_subscriptions
  ADD COLUMN IF NOT EXISTS device_id text;
-- Backfill device_id para linhas existentes (usar token como device_id provisório)
UPDATE public.push_subscriptions
  SET device_id = COALESCE(device_id, subscription_details->>'token')
  WHERE device_id IS NULL;
ALTER TABLE public.push_subscriptions
  ADD CONSTRAINT push_subscriptions_user_device_key UNIQUE (user_id, device_id);
```
> ⚠️ Validar RLS após mudar constraint (o app precisa continuar conseguindo
> upsert/delete das próprias linhas).

---

## 3. Mudanças no frontend (`NotificationContext.jsx`)

### 3.1 Gerar e persistir um `device_id` estável
- Na inicialização nativa, ler `device_id` de `@capacitor/preferences`; se não existir,
  gerar `crypto.randomUUID()` e salvar. Web pode usar localStorage.
- Esse `device_id` entra no upsert do token.

### 3.2 `saveFCMToken` — vincular sem apagar outras contas
Hoje faz check-then-update/insert por `user_id`. Passa a:
- Upsert por `(user_id, device_id)` gravando `{type:'fcm', token}` + `device_id`.
- **NÃO** remover o token de outros `user_id` (esse era o fix "1 token = 1 conta";
  aqui é intencionalmente multi-conta).
- Opcional: atualizar o token de **todas** as linhas com o mesmo `device_id` quando o
  FCM rotacionar o token (`onNewToken`), para nenhum vínculo ficar com token velho.

### 3.3 Desvínculo explícito (logout / "remover conta deste dispositivo")
- No logout (`SIGNED_OUT`) **não** apagar automaticamente — a proposta é que a conta
  continue vinculada mesmo deslogada, até desvínculo explícito. (Confirmar este ponto:
  ver §6, risco 2.) Alternativa: apagar só se o usuário marcar "esquecer neste device".
- Botão "desvincular": `DELETE FROM push_subscriptions WHERE user_id = :u AND device_id = :d`.
- `deletePushSubscription` atual deleta por `user_id` (todas as linhas do usuário) —
  precisa virar delete por `(user_id, device_id)` para não afetar outros devices.

### 3.4 Roteamento ao tocar a notificação
- `pushNotificationActionPerformed` ([NotificationContext.jsx:1607](../src/contexts/NotificationContext.jsx#L1607))
  hoje navega direto pela `url`. Para push admin recebido com conta cidadã ativa,
  tocar abriria `/admin/...` sem permissão. Adicionar: se a notificação for admin e a
  conta ativa não tiver `is_admin`, exibir aviso "troque para a conta X" em vez de
  navegar para tela de erro.

---

## 4. Mudanças no backend (Edge Function `send-push-notification`)

### 4.1 Revalidação `is_admin` no envio (trava principal)
A função já tem o gancho para `moderation_required` em
[index.ts:583-625](../supabase/functions/send-push-notification/index.ts#L583):
checa allowlist (`MODERATION_REQUIRED_ADMIN_USER_IDS`) ou `profiles.is_admin` do `userId`.

Reforçar / garantir:
- Para **todo** tipo admin (`moderation_required`, e revisar `resolution_submission`),
  **sempre** revalidar `profiles.is_admin = true` do `userId` no momento do envio.
- Se `is_admin` for false → **não enviar** e (opcional) **limpar vínculos admin órfãos**:
  como o `userId` deixou de ser admin, suas subscriptions não deveriam mais receber
  push admin. O bloqueio no envio já resolve o vazamento; a limpeza é higiene.

> Resultado: se um admin perde o cargo (`is_admin → false`), o device para de receber
> moderação **automaticamente**, sem depender de desvínculo no app. ✅ (foi a escolha feita)

### 4.2 Sem broadcast
Confirmado: a função sempre envia para um `userId` específico (`.eq("user_id", userId)`).
Nenhuma mudança envia para "todos". Manter assim.

---

## 5. Limpeza única dos dados atuais (one-off)

Antes de tudo, remover as duplicatas **acidentais** atuais (3 tokens em múltiplas contas),
mantendo o vínculo mais recente de cada token — para começar de um estado limpo.
```sql
-- Pré-visualizar antes de deletar
WITH ranked AS (
  SELECT id, user_id, subscription_details->>'token' AS token, updated_at,
         ROW_NUMBER() OVER (PARTITION BY subscription_details->>'token'
                            ORDER BY updated_at DESC) AS rn
  FROM public.push_subscriptions
  WHERE subscription_details->>'token' IS NOT NULL
)
SELECT * FROM ranked WHERE rn > 1;  -- linhas que seriam removidas
-- DELETE correspondente após revisão
```
> ⚠️ Com a decisão multi-conta, **talvez não se queira apagar** vínculos legítimos.
> A limpeza só faz sentido para duplicatas que são claramente acúmulo acidental
> (mesmo token, contas distintas, sem `device_id`). Reavaliar após introduzir `device_id`.

---

## 6. Pontos positivos × riscos (resumo da análise)

### Positivos
1. UX real para quem usa 2 contas no mesmo aparelho (admin + pessoal).
2. Não perde notificação ao alternar de contexto.
3. Desvínculo explícito = previsível, sem "sumiu sozinho".
4. Reaproveita a tabela existente (Opção A) — esforço moderado.
5. Revalidação no envio fecha o buraco de "ex-admin continua recebendo".

### Riscos
1. **🔴 Privacidade (tela de bloqueio).** Conteúdo de moderação aparece na barra/lockscreen
   mesmo com conta cidadã ativa. Mitigação possível: para push admin, usar payload
   "data-only" + render local que checa a conta ativa, ou texto genérico ("Nova
   pendência de moderação") sem dados sensíveis. **Avaliar LGPD / sigilo de denúncia.**
2. **🟠 Logout não desvincula (por design).** Se a conta continua recebendo mesmo
   deslogada, um device emprestado/vendido pode seguir recebendo até desvínculo manual.
   Mitigação: oferecer "remover deste dispositivo" claro + desvincular no
   "delete account" (a função `delete-user` já apaga push_subscriptions do user).
3. **🟠 Tap abre conta errada** (tratado em §3.4).
4. **🟠 Token reciclado pelo FCM** vai para outro device → vínculo antigo vaza. Mitigação:
   a Edge Function já remove tokens `UNREGISTERED`/inválidos; manter e reforçar.
5. **🟡 Complexidade** (device_id, constraint nova, UI de desvínculo, revalidação).

---

## 7. Ordem de execução sugerida (quando sair do planejamento)

1. **Backend primeiro (sem release):** garantir revalidação `is_admin` no envio (§4.1).
   Isso por si só já elimina o pior vazamento (ex-admin) e não exige build novo.
2. **Migração de schema** (`device_id` + constraint nova) (§2.3) com validação de RLS.
3. **Frontend:** `device_id`, `saveFCMToken` multi-conta, delete por `(user_id, device_id)`,
   roteamento seguro no tap (§3). → **exige novo build/release nas lojas.**
4. **UI** "contas vinculadas a este dispositivo" + desvincular. → release.
5. **Limpeza de dados** reavaliada após `device_id` existir (§5).

> Itens 1 e 2 não precisam de release (são backend/DB). Itens 3 e 4 precisam subir
> nas lojas (bundle local — ver capacitor.config.json sem `server.url`).

---

## 8. Decisões em aberto (confirmar antes de implementar)

- [ ] Logout **mantém** o vínculo (proposta) ou oferece "esquecer neste device"?
- [ ] Push admin na lockscreen: conteúdo completo ou texto genérico (mitigação LGPD)?
- [ ] `resolution_submission` também é admin-only? (revisar se precisa da mesma trava)
- [ ] Opção A (push_subscriptions + device_id) confirmada vs. Opção B (tabela nova)?

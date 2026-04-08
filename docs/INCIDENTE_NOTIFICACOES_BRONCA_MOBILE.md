# Incidente: notificações mobile (broncas / moderação) + toggle “desmarca sozinho”

## Sintomas reportados

- Notificações mobile não chegam quando alguém cria uma bronca que deveria gerar alerta (especialmente “para moderação”).
- Na tela de configurações de notificações, ao marcar a opção para receber notificações (push), o controle “desmarca sozinho”.

## Resumo executivo (causas mais prováveis)

1) **UI/UX do push no app nativo está implementada de um jeito que faz o switch voltar para “off” imediatamente.**  
No fluxo Capacitor (Android/iOS), o toggle de push não atualiza o estado `pushEnabled` ao marcar “on”; ele apenas abre as configurações do sistema e espera sincronizar depois. Como o Switch é controlado, ele “desmarca sozinho” na hora.

2) **Não existe (no banco) um gatilho equivalente ao de “mídia de obra pendente” para “bronca pendente de moderação”.**  
Ou seja: mesmo que o admin habilite preferências, **não há geração de registro em `public.notifications`** quando uma bronca nasce e precisa de moderação. Sem registro em `notifications`, não há evento para enviar push.

3) **Mesmo quando existe `notifications`, push mobile depende de infraestrutura/integração externa ao app (token salvo + webhook/configuração + credenciais FCM).**  
O app (Capacitor) registra token FCM e salva em `push_subscriptions`, mas o envio do push “de verdade” fica no backend (Edge Function). Se `push_enabled` estiver false, se não houver token, se o webhook do banco não estiver configurado, ou se `FIREBASE_PROJECT_ID`/service account estiver divergente, o push não chega.

## Como o sistema está desenhado hoje (visão técnica)

### Frontend (site + app Capacitor)

- Estado e fluxo de notificações ficam em [NotificationContext.jsx](file:///c:/Users/lairt/Downloads/horizons-export-eff1a4c5-4884-43cf-92e9-e90f584b8f04/src/contexts/NotificationContext.jsx).
- A tela de preferências usa Switch controlado pelo estado `pushEnabled` e chama `togglePushNotifications`: [NotificationPreferences.jsx](file:///c:/Users/lairt/Downloads/horizons-export-eff1a4c5-4884-43cf-92e9-e90f584b8f04/src/pages/NotificationPreferences.jsx).
- “Notificação in-app” é via Realtime (Supabase) em `public.notifications` e pode disparar “local notification” no browser enquanto o app/site está aberto: [NotificationContext.jsx](file:///c:/Users/lairt/Downloads/horizons-export-eff1a4c5-4884-43cf-92e9-e90f584b8f04/src/contexts/NotificationContext.jsx#L150-L220).

### Backend (push efetivo)

- Push efetivo (FCM e Web Push) está em [send-push-notification/index.ts](file:///c:/Users/lairt/Downloads/horizons-export-eff1a4c5-4884-43cf-92e9-e90f584b8f04/supabase/functions/send-push-notification/index.ts).
- A função bloqueia envio se:
  - `user_preferences.notifications_enabled` estiver false.
  - `user_preferences.push_enabled` estiver false.
  - `user_preferences.notification_preferences[tipo]` estiver explicitamente `false`.
  - Não existir subscription/token em `push_subscriptions`.

### Banco (geração do evento de notificação)

- O “evento” que o sistema trata é a linha em `public.notifications`.  
Exemplo existente: ao rejeitar uma bronca, um trigger insere em `notifications`: [074_notify_report_moderation.sql](file:///c:/Users/lairt/Downloads/horizons-export-eff1a4c5-4884-43cf-92e9-e90f584b8f04/supabase/migrations/074_notify_report_moderation.sql).
- Existe trigger para “mídia de obra pendente” gerar `moderation_required` para admins: [052_moderate_work_media_notify.sql](file:///c:/Users/lairt/Downloads/horizons-export-eff1a4c5-4884-43cf-92e9-e90f584b8f04/supabase/migrations/052_moderate_work_media_notify.sql).
- **Não foi encontrado trigger/migration equivalente para “nova bronca pendente” notificar admins (moderation_required).**

## Evidência do toggle “desmarca sozinho” (causa raiz 1)

Na implementação de `togglePushNotifications(enabled)`:

- Para web, quando `enabled === true`, ele faz subscribe e seta `setPushEnabled(true)` imediatamente.
- Para app nativo (Capacitor), quando `enabled === true`, ele chama `openAppSettings()` e **não atualiza o estado**:
  - [NotificationContext.jsx: togglePushNotifications](file:///c:/Users/lairt/Downloads/horizons-export-eff1a4c5-4884-43cf-92e9-e90f584b8f04/src/contexts/NotificationContext.jsx#L1173-L1246)

Como `NotificationPreferences` usa `checked={pushEnabled}`, o Switch volta para off imediatamente:

- [NotificationPreferences.jsx: Switch Push](file:///c:/Users/lairt/Downloads/horizons-export-eff1a4c5-4884-43cf-92e9-e90f584b8f04/src/pages/NotificationPreferences.jsx#L315-L365)

## Por que o push “não chega” para broncas de moderação (causa raiz 2)

Hoje o sistema só envia push se existir um registro em `public.notifications` para um usuário alvo.

O que já existe:

- “Moderação necessária” para admins quando entra mídia de obra em `pending`: [052_moderate_work_media_notify.sql](file:///c:/Users/lairt/Downloads/horizons-export-eff1a4c5-4884-43cf-92e9-e90f584b8f04/supabase/migrations/052_moderate_work_media_notify.sql)
- “Bronca rejeitada” (notify autor) quando `reports.moderation_status` muda para `rejected`: [074_notify_report_moderation.sql](file:///c:/Users/lairt/Downloads/horizons-export-eff1a4c5-4884-43cf-92e9-e90f584b8f04/supabase/migrations/074_notify_report_moderation.sql)

O que está faltando para o caso descrito:

- Um gatilho “AFTER INSERT ON public.reports” (ou equivalente) que insira `notifications` do tipo `moderation_required` para admins quando uma bronca entra para moderação.

Sem isso, o admin pode habilitar preferências, mas **não há evento para disparar push**.

## Check-list de validação (rápido e objetivo)

### 1) Permissão no dispositivo (Android)

- Verificar se a permissão de notificação está concedida para o app no sistema.
- Observação: o app tem `android.permission.POST_NOTIFICATIONS` no manifest, mas a permissão continua sendo runtime (Android 13+): [AndroidManifest.xml](file:///c:/Users/lairt/Downloads/horizons-export-eff1a4c5-4884-43cf-92e9-e90f584b8f04/android/app/src/main/AndroidManifest.xml#L152-L174).

### 2) Preferências no banco (alvo do push)

No registro de `public.user_preferences` do usuário que deveria receber push:

- `notifications_enabled = true`
- `push_enabled = true`
- `notification_preferences.moderation_required = true` (para admins)

Se `push_enabled` estiver false, a Edge Function retorna “Push desabilitado pelo usuário” e não envia:  
[send-push-notification/index.ts](file:///c:/Users/lairt/Downloads/horizons-export-eff1a4c5-4884-43cf-92e9-e90f584b8f04/supabase/functions/send-push-notification/index.ts#L544-L559)

### 3) Token FCM salvo

Em `public.push_subscriptions`, precisa existir `subscription_details = { type: "fcm", token: "..." }` para o usuário.

O app tenta salvar token em:  
[NotificationContext.jsx: saveFCMToken](file:///c:/Users/lairt/Downloads/horizons-export-eff1a4c5-4884-43cf-92e9-e90f584b8f04/src/contexts/NotificationContext.jsx#L536-L592)

### 4) Backend (env vars e projeto FCM)

No ambiente da Edge Function:

- `FIREBASE_PROJECT_ID` deve bater com o projeto do `google-services.json` que gerou o token.
- Service account deve ter permissões no projeto indicado por `FIREBASE_PROJECT_ID`.

O próprio código alerta sobre divergência:  
[send-push-notification/index.ts](file:///c:/Users/lairt/Downloads/horizons-export-eff1a4c5-4884-43cf-92e9-e90f584b8f04/supabase/functions/send-push-notification/index.ts#L13-L19)

### 5) Geração do evento e disparo do push

- Confirmar se, ao criar uma bronca, existe `INSERT` correspondente em `public.notifications` para os admins (ou para o usuário alvo).
- Confirmar se existe **Database Webhook** (configurado no painel Supabase) para chamar a Edge Function quando houver `INSERT` em `public.notifications`.  
Sem webhook, o push só aparece via realtime/local quando o app estiver aberto; não há “push no background”.

## Recomendações de correção (propostas)

### A) Corrigir a UX do toggle de push no app nativo

Opção mais limpa:

- No modo nativo, substituir o Switch por:
  - Um status “Ativo/Inativo” baseado em `PushNotifications.checkPermissions()`
  - Um botão “Abrir configurações do sistema”

Opção mínima (mantendo Switch):

- Ao marcar “on”, trocar para um estado intermediário (“Ativando…”) e somente confirmar `pushEnabled=true` depois que `syncPushPermission()` verificar permissão concedida ao voltar para o app.

Motivo: hoje o Switch é controlado e o código não atualiza estado no ato, gerando a percepção de bug.

### B) Criar o evento de notificação para “bronca pendente de moderação”

Criar trigger no Postgres semelhante ao de `public_work_media`, mas para `public.reports`:

- Ao inserir uma nova bronca (ou ao setar `moderation_status = 'pending'`), inserir `public.notifications` do tipo `moderation_required` para todos `profiles.is_admin = true`, com `report_id` e link para a área de moderação.

### C) Garantir o caminho completo do push (background)

- Garantir webhook de `notifications INSERT` → Edge Function `send-push-notification`.
- Garantir que o app está salvando token em `push_subscriptions` (e que políticas RLS permitem isso).
- Garantir que `push_enabled` é coerente com permissão real do sistema (evitar “estado no banco diz sim, sistema diz não”).

## Reflexões e sugestões (manutenção/robustez)

O design atual mistura “estado de preferência” (no banco) com “estado real do sistema” (permissão do OS). Isso tende a gerar inconsistência e UX ruim se o controle de UI for estritamente “controlado” e o estado real só puder ser alterado fora do app (settings do sistema). Uma boa evolução é separar: (1) status real (somente leitura), (2) ação para abrir settings e (3) preferência por tipo (somente após push estar realmente ativo).

Para reduzir incidentes futuros, vale adicionar telemetria simples (sem dados sensíveis) em pontos-chave: salvamento de token, resultado do webhook e retorno da Edge Function. Isso encurta muito o diagnóstico quando o problema for “token não existe”, “push desabilitado no banco” ou “FCM project_id divergente”.


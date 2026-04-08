# Correção de Notificações Push (Broncas/Moderação) Spec

## Why
Usuários/admins não estão recebendo notificações push no mobile para eventos de bronca/moderação e o toggle de push no app nativo aparenta “bugado” ao desmarcar sozinho, gerando perda de confiança e falhas operacionais de moderação.

## What Changes
- Ajustar o comportamento/UX do controle de “Notificações Push” no app nativo (Capacitor) para não “desmarcar sozinho” e refletir o estado real da permissão do sistema.
- Criar mecanismo no banco para gerar notificações de moderação quando uma bronca precisar de moderação (inserção em `public.notifications` para admins).
- Garantir o caminho de push em background: `notifications INSERT` → Edge Function `send-push-notification` via webhook/configuração do Supabase (ação operacional).
- Padronizar e validar as condições de envio na Edge Function (preferências + token/subscription) e definir um checklist de validação ponta a ponta.

## Impact
- Affected specs: push nativo (Capacitor/FCM), preferências de notificação, geração de evento de moderação, entrega em background.
- Affected code:
  - [NotificationContext.jsx](file:///c:/Users/lairt/Downloads/horizons-export-eff1a4c5-4884-43cf-92e9-e90f584b8f04/src/contexts/NotificationContext.jsx)
  - [NotificationPreferences.jsx](file:///c:/Users/lairt/Downloads/horizons-export-eff1a4c5-4884-43cf-92e9-e90f584b8f04/src/pages/NotificationPreferences.jsx)
  - [send-push-notification/index.ts](file:///c:/Users/lairt/Downloads/horizons-export-eff1a4c5-4884-43cf-92e9-e90f584b8f04/supabase/functions/send-push-notification/index.ts)
  - Migrations Supabase (nova migration de trigger em `reports`)

## ADDED Requirements

### Requirement: Notificação de Moderação para Nova Bronca
O sistema SHALL criar registros em `public.notifications` para todos os usuários admin quando uma bronca passar a exigir moderação, para possibilitar push em background e alertas in-app.

#### Scenario: Bronca criada e requer moderação
- **WHEN** uma linha for inserida em `public.reports` com estado que represente “aguardando moderação” (ex.: `moderation_status = 'pending'` ou estado equivalente)
- **THEN** o sistema insere, para cada `profiles.is_admin = true`, um registro em `public.notifications` com:
  - `type = 'moderation_required'`
  - `report_id = NEW.id`
  - `message` descritiva
  - `is_read = false`
  - `created_at = now()`

#### Scenario: Bronca criada mas não requer moderação
- **WHEN** a bronca for criada em um estado que não exija moderação
- **THEN** nenhum `notifications` para admins é criado.

### Requirement: Entrega Push em Background
O sistema SHALL disparar a Edge Function `send-push-notification` em eventos de `INSERT` em `public.notifications` (via Database Webhook do Supabase) para entregar push quando o app estiver fechado.

#### Scenario: Notification insert com push habilitado
- **WHEN** houver `INSERT` em `public.notifications` para um usuário com `user_preferences.notifications_enabled = true` e `push_enabled = true`, e com token/subscription em `push_subscriptions`
- **THEN** a Edge Function envia push (FCM/WebPush) e retorna `sent > 0`.

## MODIFIED Requirements

### Requirement: UX do Toggle de Push no App Nativo
O sistema SHALL exibir e controlar o estado de push no app nativo de forma consistente com a permissão real do sistema, sem “voltar sozinho” para off de forma enganosa.

#### Scenario: Usuário tenta ativar push no nativo
- **WHEN** o usuário tocar para ativar “Notificações Push” no app nativo
- **THEN** a UI não deve alternar para “on” e voltar imediatamente para “off” por falta de atualização de estado.
- **AND** a UI deve orientar a ação correta: abrir configurações do sistema e, ao retornar ao app, sincronizar e refletir o estado real (concedido/negado).

#### Scenario: Estado exibido sempre reflete permissão real
- **WHEN** o app retorna do background para foreground
- **THEN** o estado exibido deve ser sincronizado com `PushNotifications.checkPermissions()`.

## REMOVED Requirements
N/A


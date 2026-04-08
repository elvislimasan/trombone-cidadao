# Tasks

- [ ] Task 1: Corrigir UX do push no app nativo (toggle “desmarca sozinho”)
  - [ ] Ajustar `togglePushNotifications`/UI para não alternar estado de forma enganosa no Capacitor (exibir estado real + ação “Abrir configurações” ou estado intermediário “Ativando…”)
  - [ ] Garantir sincronização ao voltar ao foreground (usar `syncPushPermission`) e que o valor exibido sempre reflita `checkPermissions`
  - [ ] Validar manualmente no Android 13+ (permissão runtime) e Android 12- (comportamento legado)

- [ ] Task 2: Criar trigger/migration para notificar admins quando uma bronca exigir moderação
  - [ ] Implementar função/trigger `AFTER INSERT` (e/ou transição de status, se necessário) em `public.reports` para inserir `public.notifications` do tipo `moderation_required` para `profiles.is_admin = true`
  - [ ] Definir `report_id`, `message` e `created_at` de forma consistente com o restante do sistema
  - [ ] Validar que não gera duplicidade indevida

- [ ] Task 3: Garantir entrega push em background (integração Supabase Webhook → Edge Function)
  - [ ] Conferir/ajustar configuração do Database Webhook no Supabase para `public.notifications` (event: INSERT) apontando para `send-push-notification`
  - [ ] Conferir variáveis de ambiente da Edge Function (FCM e VAPID) e consistência do `FIREBASE_PROJECT_ID` com o projeto que emite o token
  - [ ] Validar logs da Edge Function para um `notifications INSERT` real (retorno `sent > 0` quando elegível)

- [ ] Task 4: Verificação ponta a ponta e regressão
  - [ ] Garantir que preferências (`notifications_enabled`, `push_enabled`, `notification_preferences`) continuam funcionando
  - [ ] Testar cenário: bronca criada → admins recebem notification record → push chega no mobile com app fechado

# Task Dependencies
- Task 4 depende de Task 1, Task 2 e Task 3


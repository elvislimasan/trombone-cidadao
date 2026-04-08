- [ ] O controle de “Notificações Push” no app nativo não “desmarca sozinho” e representa o estado real da permissão do sistema.
- [ ] Ao retornar do background, o app sincroniza e reflete corretamente `PushNotifications.checkPermissions()` (sem inconsistências visuais).
- [ ] Existe migration/trigger para “bronca exigindo moderação” que insere `public.notifications` do tipo `moderation_required` para admins, com `report_id` preenchido.
- [ ] Não há duplicidade indevida de `notifications` para o mesmo evento (pelo menos no fluxo padrão de criação).
- [ ] O Database Webhook do Supabase para `public.notifications` (INSERT) está configurado e aciona `send-push-notification`.
- [ ] A Edge Function `send-push-notification` envia push quando `notifications_enabled/push_enabled` estão true e há token/subscription; falha de elegibilidade retorna `sent: 0` com mensagem coerente.
- [ ] Teste ponta a ponta: criar bronca que requer moderação → admins recebem push com o app fechado.


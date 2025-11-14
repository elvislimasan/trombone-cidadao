-- =====================================================
-- REMOVER FUNÇÕES create_notification_on_report_* 
-- =====================================================
-- Estas funções não existem em dev e estão causando problemas em prod
-- Em dev, outras funções fazem o trabalho de criar notificações

-- 1. Verificar se as funções existem antes de dropar
SELECT 
    proname as function_name,
    prosecdef as is_security_definer
FROM pg_proc
WHERE proname IN (
    'create_notification_on_report_created',
    'create_notification_on_report_updated'
)
ORDER BY proname;

-- 2. Dropar triggers PRIMEIRO (antes de dropar as funções)
-- 🔥 IMPORTANTE: Dropar triggers primeiro para liberar as dependências
-- Usar CASCADE para garantir que todas as dependências sejam removidas
DROP TRIGGER IF EXISTS trigger_create_notification_on_report_created ON reports CASCADE;
DROP TRIGGER IF EXISTS trigger_create_notification_on_report_updated ON reports CASCADE;

-- 3. Verificar se os triggers foram removidos antes de dropar as funções
SELECT 
    trigger_name,
    event_manipulation,
    event_object_table
FROM information_schema.triggers
WHERE event_object_schema = 'public'
  AND event_object_table = 'reports'
  AND trigger_name IN (
    'trigger_create_notification_on_report_created',
    'trigger_create_notification_on_report_updated'
  );

-- 4. Agora dropar as funções (sem CASCADE, pois os triggers já foram removidos)
-- Se ainda houver dependências, usar CASCADE
DROP FUNCTION IF EXISTS create_notification_on_report_created() CASCADE;
DROP FUNCTION IF EXISTS create_notification_on_report_updated() CASCADE;

-- 4. Verificar se as funções foram removidas
SELECT 
    proname as function_name
FROM pg_proc
WHERE proname IN (
    'create_notification_on_report_created',
    'create_notification_on_report_updated'
);

-- 5. Verificar se os triggers foram removidos
SELECT 
    trigger_name,
    event_manipulation,
    event_object_table
FROM information_schema.triggers
WHERE event_object_schema = 'public'
  AND event_object_table = 'reports'
  AND trigger_name IN (
    'trigger_create_notification_on_report_created',
    'trigger_create_notification_on_report_updated'
  );

-- 6. Verificar quais funções ainda existem que criam notificações
SELECT 
    proname as function_name,
    prosecdef as is_security_definer
FROM pg_proc
WHERE proname LIKE '%notification%'
   OR proname LIKE '%notify%'
ORDER BY proname;


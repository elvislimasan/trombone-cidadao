-- =====================================================
-- REMOVER FUNÇÕES create_notification_on_report_* COMPLETO
-- =====================================================
-- Este script remove os triggers primeiro e depois as funções
-- Resolve o erro: "cannot drop function because other objects depend on it"

-- 1. Verificar se as funções e triggers existem antes de dropar
SELECT 
    'FUNÇÕES' as tipo,
    proname as nome,
    prosecdef as is_security_definer
FROM pg_proc
WHERE proname IN (
    'create_notification_on_report_created',
    'create_notification_on_report_updated'
)
UNION ALL
SELECT 
    'TRIGGERS' as tipo,
    trigger_name as nome,
    NULL as is_security_definer
FROM information_schema.triggers
WHERE event_object_schema = 'public'
  AND event_object_table = 'reports'
  AND trigger_name IN (
    'trigger_create_notification_on_report_created',
    'trigger_create_notification_on_report_updated'
  )
ORDER BY tipo, nome;

-- 2. Dropar triggers PRIMEIRO (antes de dropar as funções)
-- 🔥 IMPORTANTE: Dropar triggers primeiro para liberar as dependências
DROP TRIGGER IF EXISTS trigger_create_notification_on_report_created ON reports CASCADE;
DROP TRIGGER IF EXISTS trigger_create_notification_on_report_updated ON reports CASCADE;

-- 3. Verificar se os triggers foram removidos
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
DROP FUNCTION IF EXISTS create_notification_on_report_created();
DROP FUNCTION IF EXISTS create_notification_on_report_updated();

-- 5. Se ainda houver problemas, tentar com CASCADE
-- DROP FUNCTION IF EXISTS create_notification_on_report_created() CASCADE;
-- DROP FUNCTION IF EXISTS create_notification_on_report_updated() CASCADE;

-- 6. Verificar se as funções foram removidas
SELECT 
    proname as function_name
FROM pg_proc
WHERE proname IN (
    'create_notification_on_report_created',
    'create_notification_on_report_updated'
);

-- 7. Verificar quais funções ainda existem que criam notificações
SELECT 
    proname as function_name,
    prosecdef as is_security_definer,
    pg_get_functiondef(oid) as function_definition
FROM pg_proc
WHERE proname LIKE '%notification%'
   OR proname LIKE '%notify%'
ORDER BY proname;



-- =====================================================
-- TABELAS NECESSÁRIAS PARA PUSH NOTIFICATIONS
-- =====================================================
-- Este arquivo contém todas as tabelas necessárias para
-- o sistema de push notifications funcionar em produção
-- =====================================================

-- Habilitar extensões necessárias
-- PostGIS: Necessário para dados geográficos (location, geometry)
-- Nota: A tabela spatial_ref_sys é criada automaticamente quando PostGIS é habilitado
CREATE EXTENSION IF NOT EXISTS "postgis";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================================================
-- 1. TABELA: user_preferences
-- =====================================================
-- Armazena as preferências de notificação de cada usuário
-- Inclui: notificações gerais, push notifications, e preferências por tipo
CREATE TABLE IF NOT EXISTS public.user_preferences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
    
    -- Preferências gerais
    notifications_enabled BOOLEAN DEFAULT true,
    push_enabled BOOLEAN DEFAULT false,
    
    -- Preferências granulares por tipo de notificação
    -- Exemplo: {"reports": true, "comments": false, "works": true, "system": true, "moderation_required": true}
    notification_preferences JSONB DEFAULT '{
        "reports": true,
        "comments": true,
        "works": true,
        "system": true,
        "moderation_required": false,
        "status_update": true,
        "moderation_update": true,
        "resolution_submission": true,
        "work_update": true
    }'::jsonb,
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_user_preferences_user_id ON public.user_preferences(user_id);
CREATE INDEX IF NOT EXISTS idx_user_preferences_push_enabled ON public.user_preferences(push_enabled);

-- Trigger para atualizar updated_at
CREATE OR REPLACE FUNCTION update_user_preferences_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Dropar trigger se existir antes de criar
DROP TRIGGER IF EXISTS trigger_update_user_preferences_updated_at ON public.user_preferences;
CREATE TRIGGER trigger_update_user_preferences_updated_at
    BEFORE UPDATE ON public.user_preferences
    FOR EACH ROW
    EXECUTE FUNCTION update_user_preferences_updated_at();

-- RLS (Row Level Security)
ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;

-- Dropar políticas se existirem antes de criar
DROP POLICY IF EXISTS "Users can view their own preferences" ON public.user_preferences;
DROP POLICY IF EXISTS "Users can update their own preferences" ON public.user_preferences;
DROP POLICY IF EXISTS "Users can insert their own preferences" ON public.user_preferences;

-- Política: Usuários podem ler e atualizar suas próprias preferências
CREATE POLICY "Users can view their own preferences"
    ON public.user_preferences
    FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own preferences"
    ON public.user_preferences
    FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own preferences"
    ON public.user_preferences
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- =====================================================
-- 2. TABELA: push_subscriptions
-- =====================================================
-- Armazena as subscrições de push notifications
-- Suporta tanto Web Push (VAPID) quanto FCM (Firebase Cloud Messaging)
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
    
    -- Detalhes da subscription em formato JSONB
    -- Para Web Push: {"endpoint": "...", "keys": {"p256dh": "...", "auth": "..."}, "type": "web"}
    -- Para FCM: {"token": "...", "type": "fcm"}
    subscription_details JSONB NOT NULL,
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user_id ON public.push_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_updated_at ON public.push_subscriptions(updated_at);

-- Índice GIN para buscar por token FCM e tipo dentro do JSONB
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_details 
    ON public.push_subscriptions USING GIN (subscription_details);

-- Trigger para atualizar updated_at
CREATE OR REPLACE FUNCTION update_push_subscriptions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Dropar trigger se existir antes de criar
DROP TRIGGER IF EXISTS trigger_update_push_subscriptions_updated_at ON public.push_subscriptions;
CREATE TRIGGER trigger_update_push_subscriptions_updated_at
    BEFORE UPDATE ON public.push_subscriptions
    FOR EACH ROW
    EXECUTE FUNCTION update_push_subscriptions_updated_at();

-- RLS (Row Level Security)
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

-- Dropar políticas se existirem antes de criar
DROP POLICY IF EXISTS "Users can view their own subscriptions" ON public.push_subscriptions;
DROP POLICY IF EXISTS "Users can insert their own subscriptions" ON public.push_subscriptions;
DROP POLICY IF EXISTS "Users can update their own subscriptions" ON public.push_subscriptions;
DROP POLICY IF EXISTS "Users can delete their own subscriptions" ON public.push_subscriptions;

-- Política: Usuários podem gerenciar suas próprias subscriptions
CREATE POLICY "Users can view their own subscriptions"
    ON public.push_subscriptions
    FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own subscriptions"
    ON public.push_subscriptions
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own subscriptions"
    ON public.push_subscriptions
    FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own subscriptions"
    ON public.push_subscriptions
    FOR DELETE
    USING (auth.uid() = user_id);

-- =====================================================
-- 3. TABELA: notifications
-- =====================================================
-- Armazena as notificações do sistema
-- Esta tabela é populada por triggers quando eventos ocorrem (ex: novo report, comentário, etc.)
CREATE TABLE IF NOT EXISTS public.notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    
    -- Tipo de notificação
    -- Valores possíveis: 'reports', 'comments', 'works', 'system', 
    --                    'moderation_update', 'status_update', 'moderation_required',
    --                    'resolution_submission', 'work_update'
    type TEXT NOT NULL,
    
    -- Mensagem da notificação
    message TEXT NOT NULL,
    
    -- IDs relacionados (opcionais)
    report_id UUID REFERENCES public.reports(id) ON DELETE CASCADE,
    work_id UUID REFERENCES public.public_works(id) ON DELETE CASCADE,
    comment_id UUID REFERENCES public.comments(id) ON DELETE CASCADE,
    
    -- Se a notificação foi lida
    is_read BOOLEAN DEFAULT false,
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON public.notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_type ON public.notifications(type);
CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON public.notifications(is_read);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON public.notifications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_report_id ON public.notifications(report_id);
CREATE INDEX IF NOT EXISTS idx_notifications_work_id ON public.notifications(work_id);

-- Índice composto para buscar notificações não lidas de um usuário
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread 
    ON public.notifications(user_id, is_read) 
    WHERE is_read = false;

-- RLS (Row Level Security)
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Dropar política se existir antes de criar
DROP POLICY IF EXISTS "Users can view their own notifications" ON public.notifications;

-- Política: Usuários podem ver apenas suas próprias notificações
CREATE POLICY "Users can view their own notifications"
    ON public.notifications
    FOR SELECT
    USING (auth.uid() = user_id);

-- Política: Sistema pode criar notificações (via service role)
-- Nota: Esta política requer que a criação seja feita com service role
-- Para criação via triggers, os triggers devem usar SECURITY DEFINER

-- =====================================================
-- 4. TABELA: app_config (OPCIONAL)
-- =====================================================
-- Armazena configurações globais do app
-- Usada pelo trigger send_push_notification para obter Supabase URL e keys
-- Alternativamente, você pode usar ALTER DATABASE SET para configurar
CREATE TABLE IF NOT EXISTS public.app_config (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key TEXT NOT NULL UNIQUE,
    value TEXT NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índice
CREATE INDEX IF NOT EXISTS idx_app_config_key ON public.app_config(key);

-- Trigger para atualizar updated_at
CREATE OR REPLACE FUNCTION update_app_config_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Dropar trigger se existir antes de criar
DROP TRIGGER IF EXISTS trigger_update_app_config_updated_at ON public.app_config;
CREATE TRIGGER trigger_update_app_config_updated_at
    BEFORE UPDATE ON public.app_config
    FOR EACH ROW
    EXECUTE FUNCTION update_app_config_updated_at();

-- RLS (Row Level Security)
ALTER TABLE public.app_config ENABLE ROW LEVEL SECURITY;

-- Dropar políticas se existirem antes de criar
DROP POLICY IF EXISTS "Admins can view app config" ON public.app_config;
DROP POLICY IF EXISTS "Admins can update app config" ON public.app_config;
DROP POLICY IF EXISTS "Admins can insert app config" ON public.app_config;

-- Política: Apenas administradores podem ver e editar configurações
-- Nota: Requer que a tabela profiles tenha campo is_admin
CREATE POLICY "Admins can view app config"
    ON public.app_config
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid()
            AND profiles.is_admin = true
        )
    );

CREATE POLICY "Admins can update app config"
    ON public.app_config
    FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid()
            AND profiles.is_admin = true
        )
    );

CREATE POLICY "Admins can insert app config"
    ON public.app_config
    FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid()
            AND profiles.is_admin = true
        )
    );

-- =====================================================
-- COMENTÁRIOS DE DOCUMENTAÇÃO
-- =====================================================
COMMENT ON TABLE public.user_preferences IS 
    'Armazena as preferências de notificação de cada usuário, incluindo preferências gerais e por tipo de notificação';

COMMENT ON TABLE public.push_subscriptions IS 
    'Armazena as subscrições de push notifications (Web Push e FCM). Um usuário pode ter apenas uma subscription (constraint UNIQUE em user_id)';

COMMENT ON TABLE public.notifications IS 
    'Armazena as notificações do sistema. Populada por triggers quando eventos ocorrem (novo report, comentário, etc.)';

COMMENT ON TABLE public.app_config IS 
    'Armazena configurações globais do app, como Supabase URL e keys. Opcional - pode ser substituído por ALTER DATABASE SET';

COMMENT ON COLUMN public.user_preferences.notification_preferences IS 
    'JSONB com preferências por tipo de notificação. Exemplo: {"reports": true, "comments": false, "system": true}';

COMMENT ON COLUMN public.push_subscriptions.subscription_details IS 
    'JSONB com detalhes da subscription. Para Web Push: {"endpoint": "...", "keys": {"p256dh": "...", "auth": "..."}, "type": "web"}. Para FCM: {"token": "...", "type": "fcm"}. O tipo é armazenado dentro do JSONB, não como campo separado.';

COMMENT ON COLUMN public.notifications.type IS 
    'Tipo de notificação: reports, comments, works, system, moderation_update, status_update, moderation_required, resolution_submission, work_update';

-- =====================================================
-- NOTAS IMPORTANTES
-- =====================================================
-- 1. Certifique-se de que a tabela 'profiles' existe e tem o campo 'is_admin'
-- 2. Certifique-se de que as tabelas 'reports', 'works', 'comments' existem
-- 3. As políticas RLS requerem que o usuário esteja autenticado (auth.uid() não é null)
-- 4. Para criar notificações via triggers, os triggers devem usar SECURITY DEFINER
-- 5. A tabela app_config é opcional - você pode usar ALTER DATABASE SET em vez disso
-- 6. Após criar estas tabelas, execute as migrações:
--    - 001_send_push_notification_trigger.sql (função e trigger para enviar push)
--    - 002_create_notifications_on_reports.sql (triggers para criar notificações)
--    - 003_force_fcm_token_regeneration.sql (funções para gerenciar tokens FCM)
--    - 004_get_user_emails_function.sql (função RPC para admins verem emails)






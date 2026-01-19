-- =====================================================
-- CORREÇÃO FINAL: RLS da tabela notifications
-- =====================================================
-- Este script corrige o problema de "column user_id does not exist"
-- A solução é garantir que a política INSERT não tente acessar user_id

-- 1. Verificar se a coluna user_id existe na tabela
SELECT 
    column_name,
    data_type,
    is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'notifications'
  AND column_name = 'user_id';

-- 2. Dropar TODAS as políticas existentes
DROP POLICY IF EXISTS "Users can view their own notifications" ON public.notifications;
DROP POLICY IF EXISTS "Users can manage their own notifications" ON public.notifications;
DROP POLICY IF EXISTS "Users can update their own notifications" ON public.notifications;
DROP POLICY IF EXISTS "Users can delete their own notifications" ON public.notifications;
DROP POLICY IF EXISTS "System can insert notifications" ON public.notifications;
DROP POLICY IF EXISTS "System can create notifications" ON public.notifications;

-- 3. Recriar política para SELECT (visualizar)
CREATE POLICY "Users can view their own notifications"
    ON public.notifications
    AS PERMISSIVE
    FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id);

-- 4. Recriar política para UPDATE (atualizar)
CREATE POLICY "Users can update their own notifications"
    ON public.notifications
    AS PERMISSIVE
    FOR UPDATE
    TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- 5. Recriar política para DELETE (deletar)
CREATE POLICY "Users can delete their own notifications"
    ON public.notifications
    AS PERMISSIVE
    FOR DELETE
    TO authenticated
    USING (auth.uid() = user_id);

-- 6. Criar política para INSERT (inserir via funções SECURITY DEFINER)
-- 🔥 IMPORTANTE: Usar AS PERMISSIVE e WITH CHECK (true) sem referência a user_id
-- Isso permite que funções SECURITY DEFINER insiram notificações
-- A política não deve tentar acessar user_id no contexto do INSERT
CREATE POLICY "System can create notifications"
    ON public.notifications
    AS PERMISSIVE
    FOR INSERT
    TO public
    WITH CHECK (true);

-- 7. Garantir que as funções têm SECURITY DEFINER e SET search_path
CREATE OR REPLACE FUNCTION create_notification_on_report_created()
RETURNS TRIGGER 
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  notification_user_id UUID;
  notification_message TEXT;
BEGIN
  -- Criar notificação para administradores quando um novo report é criado
  -- Isso permite que admins sejam notificados sobre novas broncas
  
  -- Opção 1: Se você tiver uma tabela profiles com campo is_admin
  BEGIN
    FOR notification_user_id IN 
      SELECT user_id FROM profiles WHERE is_admin = true
    LOOP
      notification_message := 'Nova bronca criada: ' || COALESCE(NEW.title, 'Sem título');
      
      INSERT INTO public.notifications (user_id, type, message, report_id)
      VALUES (notification_user_id, 'reports', notification_message, NEW.id);
    END LOOP;
  EXCEPTION
    WHEN undefined_table THEN
      -- Tabela profiles não existe ou não tem campo is_admin, continuar
      NULL;
  END;
  
  -- Opção 2: Se você usar raw_user_meta_data para identificar admins
  BEGIN
    FOR notification_user_id IN 
      SELECT id FROM auth.users 
      WHERE raw_user_meta_data->>'role' = 'admin'
         OR raw_user_meta_data->>'is_admin' = 'true'
    LOOP
      notification_message := 'Nova bronca criada: ' || COALESCE(NEW.title, 'Sem título');
      
      INSERT INTO public.notifications (user_id, type, message, report_id)
      VALUES (notification_user_id, 'reports', notification_message, NEW.id);
    END LOOP;
  EXCEPTION
    WHEN OTHERS THEN
      -- Se houver erro, continuar
      NULL;
  END;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION create_notification_on_report_updated()
RETURNS TRIGGER 
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  notification_message TEXT;
  notification_type TEXT;
BEGIN
  -- Verificar se houve mudanças relevantes que justifiquem uma notificação
  
  -- 1. Se o status mudou
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    notification_type := 'status_update';
    notification_message := 'O status da sua bronca "' || NEW.title || '" foi atualizado para: ' || NEW.status;
    
    -- Criar notificação para o autor do report
    INSERT INTO public.notifications (user_id, type, message, report_id)
    VALUES (NEW.author_id, notification_type, notification_message, NEW.id);
  END IF;
  
  -- 2. Se uma resolução foi submetida (campo resolution_submission)
  IF OLD.resolution_submission IS DISTINCT FROM NEW.resolution_submission AND NEW.resolution_submission IS NOT NULL THEN
    notification_type := 'resolution_submission';
    notification_message := 'Uma resolução foi submetida para sua bronca "' || NEW.title || '"';
    
    -- Criar notificação para o autor do report
    INSERT INTO public.notifications (user_id, type, message, report_id)
    VALUES (NEW.author_id, notification_type, notification_message, NEW.id);
  END IF;
  
  -- 3. Se o moderation_status mudou (aprovado/rejeitado)
  IF OLD.moderation_status IS DISTINCT FROM NEW.moderation_status THEN
    notification_type := 'moderation_update';
    
    IF NEW.moderation_status = 'approved' THEN
      notification_message := 'Sua bronca "' || NEW.title || '" foi aprovada!';
    ELSIF NEW.moderation_status = 'rejected' THEN
      notification_message := 'Sua bronca "' || NEW.title || '" foi rejeitada.';
    ELSE
      notification_message := 'O status de moderação da sua bronca "' || NEW.title || '" foi atualizado.';
    END IF;
    
    -- Criar notificação para o autor do report
    INSERT INTO public.notifications (user_id, type, message, report_id)
    VALUES (NEW.author_id, notification_type, notification_message, NEW.id);
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 8. Criar triggers (se não existirem)
DROP TRIGGER IF EXISTS trigger_create_notification_on_report_created ON reports;
CREATE TRIGGER trigger_create_notification_on_report_created
  AFTER INSERT ON reports
  FOR EACH ROW
  EXECUTE FUNCTION create_notification_on_report_created();

DROP TRIGGER IF EXISTS trigger_create_notification_on_report_updated ON reports;
CREATE TRIGGER trigger_create_notification_on_report_updated
  AFTER UPDATE ON reports
  FOR EACH ROW
  EXECUTE FUNCTION create_notification_on_report_updated();

-- 9. Verificar se as políticas foram criadas corretamente
SELECT 
    policyname,
    cmd,
    roles,
    qual,
    with_check,
    permissive
FROM pg_policies
WHERE tablename = 'notifications'
ORDER BY policyname;

-- 10. Verificar se as funções têm SECURITY DEFINER
SELECT 
    proname as function_name,
    prosecdef as is_security_definer,
    proconfig as search_path_config
FROM pg_proc
WHERE proname IN (
    'create_notification_on_report_created',
    'create_notification_on_report_updated'
)
ORDER BY proname;

-- 11. Verificar se os triggers existem
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
  )
ORDER BY trigger_name;





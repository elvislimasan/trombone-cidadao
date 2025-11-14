-- Correção: Adicionar SECURITY DEFINER às funções que criam notificações
-- Isso permite que as funções contornem RLS ao inserir notificações

-- Função para criar notificação quando um report é criado
-- 🔥 IMPORTANTE: SECURITY DEFINER permite que a função contorne RLS
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
      
      INSERT INTO notifications (user_id, type, message, report_id)
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
      
      INSERT INTO notifications (user_id, type, message, report_id)
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

-- Função para criar notificação quando um report é atualizado
-- 🔥 IMPORTANTE: SECURITY DEFINER permite que a função contorne RLS
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
    INSERT INTO notifications (user_id, type, message, report_id)
    VALUES (NEW.author_id, notification_type, notification_message, NEW.id);
  END IF;
  
  -- 2. Se uma resolução foi submetida (campo resolution_submission)
  IF OLD.resolution_submission IS DISTINCT FROM NEW.resolution_submission AND NEW.resolution_submission IS NOT NULL THEN
    notification_type := 'resolution_submission';
    notification_message := 'Uma resolução foi submetida para sua bronca "' || NEW.title || '"';
    
    -- Criar notificação para o autor do report
    INSERT INTO notifications (user_id, type, message, report_id)
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
    INSERT INTO notifications (user_id, type, message, report_id)
    VALUES (NEW.author_id, notification_type, notification_message, NEW.id);
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 🔥 IMPORTANTE: Criar política RLS para permitir INSERT via funções SECURITY DEFINER
-- Esta política permite que funções com SECURITY DEFINER insiram notificações
-- Nota: Funções SECURITY DEFINER executam com privilégios do dono da função,
-- então esta política permite que elas insiram notificações mesmo com RLS habilitado
DROP POLICY IF EXISTS "System can insert notifications" ON public.notifications;
CREATE POLICY "System can insert notifications"
    ON public.notifications
    FOR INSERT
    TO authenticated, anon, service_role
    WITH CHECK (true);  -- Permite qualquer inserção (funções SECURITY DEFINER podem inserir)

-- Comentários para documentação
COMMENT ON FUNCTION create_notification_on_report_created() IS 
  'Função que cria notificações quando um report é criado. Usa SECURITY DEFINER para contornar RLS.';
COMMENT ON FUNCTION create_notification_on_report_updated() IS 
  'Função que cria notificações quando um report é atualizado. Usa SECURITY DEFINER para contornar RLS.';
COMMENT ON POLICY "System can insert notifications" ON public.notifications IS 
  'Política RLS que permite inserção de notificações via funções SECURITY DEFINER';


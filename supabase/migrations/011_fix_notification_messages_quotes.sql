-- =====================================================
-- CORRIGIR ASPAS NAS MENSAGENS DE NOTIFICAÇÃO
-- =====================================================
-- O problema: mensagens aparecem com \" em vez de aspas normais
-- Exemplo: Sua bronca /"teste/" foi aprovada
-- Solução: remover barras invertidas e usar aspas simples corretamente

-- 1. Corrigir função create_timeline_and_notify
CREATE OR REPLACE FUNCTION create_timeline_and_notify()
RETURNS TRIGGER 
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  report_title TEXT;
  report_author_id UUID;
  status_friendly_name TEXT;
  moderation_status_changed BOOLEAN;
  resolution_submitted BOOLEAN;
  notification_message TEXT;
  admin_users RECORD;
BEGIN
  -- Obter informações do report
  report_title := COALESCE(NEW.title, 'Sem título');
  report_author_id := NEW.author_id;
  
  -- Determinar nome amigável do status
  status_friendly_name := CASE NEW.status
    WHEN 'pending' THEN 'pendente'
    WHEN 'in-progress' THEN 'em andamento'
    WHEN 'resolved' THEN 'resolvida'
    WHEN 'rejected' THEN 'rejeitada'
    ELSE NEW.status
  END;
  
  -- Verificar se o status de moderação mudou
  moderation_status_changed := (OLD.moderation_status IS DISTINCT FROM NEW.moderation_status);
  
  -- Verificar se uma resolução foi submetida
  resolution_submitted := (OLD.resolution_submission IS DISTINCT FROM NEW.resolution_submission) 
                          AND NEW.resolution_submission IS NOT NULL;
  
  -- Handle resolution submission notifications
  IF resolution_submitted THEN
    -- 🔥 CORRIGIDO: Remover barras invertidas, usar aspas simples dentro da string
    notification_message := 'Uma prova de resolução foi enviada para a bronca: "' || report_title || '".';
    FOR admin_users IN SELECT id FROM public.profiles WHERE is_admin = true LOOP
      INSERT INTO public.notifications (user_id, report_id, type, message)
      VALUES (admin_users.id, NEW.id, 'resolution_submission', notification_message);
    END LOOP;
  END IF;
  
  -- Handle moderation notifications
  IF moderation_status_changed AND report_author_id IS NOT NULL THEN
    -- 🔥 CORRIGIDO: Remover barras invertidas, usar aspas simples dentro da string
    notification_message := 'Sua bronca "' || report_title || '" foi ' || status_friendly_name || '.';
    INSERT INTO public.notifications (user_id, report_id, type, message)
    VALUES (report_author_id, NEW.id, 'moderation_update', notification_message);
  END IF;
  
  -- Handle status update notifications for favorited reports
  IF OLD.status IS DISTINCT FROM NEW.status AND NOT moderation_status_changed THEN
    -- 🔥 CORRIGIDO: Remover barras invertidas, usar aspas simples dentro da string
    notification_message := 'O status da bronca "' || report_title || '" foi atualizado para: ' || status_friendly_name;
    
    -- Notify users who favorited the report
    INSERT INTO public.notifications (user_id, report_id, type, message)
    SELECT user_id, NEW.id, 'status_update', notification_message
    FROM public.favorite_reports
    WHERE report_id = NEW.id;
    
    -- Notify the author of the report, if they haven't favorited it
    IF report_author_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.favorite_reports WHERE report_id = NEW.id AND user_id = report_author_id) THEN
      INSERT INTO public.notifications (user_id, report_id, type, message)
      VALUES (report_author_id, NEW.id, 'status_update', notification_message);
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 2. Corrigir função notify_admins_on_report_change
CREATE OR REPLACE FUNCTION notify_admins_on_report_change()
RETURNS TRIGGER 
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  admin_users RECORD;
  notification_message TEXT;
  is_author_admin BOOLEAN;
BEGIN
  -- Check if the author is an admin
  SELECT is_admin INTO is_author_admin FROM public.profiles WHERE id = NEW.author_id;
  
  -- Only send notification if the author is NOT an admin
  IF is_author_admin = false THEN
    IF (TG_OP = 'INSERT') THEN
      -- 🔥 CORRIGIDO: Remover barras invertidas, usar aspas simples dentro da string
      notification_message := 'Uma nova bronca foi cadastrada e aguarda moderação: "' || NEW.title || '".';
    ELSIF (TG_OP = 'UPDATE' AND NEW.moderation_status = 'pending_approval' AND OLD.moderation_status <> 'pending_approval') THEN
      -- 🔥 CORRIGIDO: Remover barras invertidas, usar aspas simples dentro da string
      notification_message := 'A bronca "' || NEW.title || '" foi atualizada e aguarda moderação.';
    ELSE
      -- Do not send notification for other updates
      RETURN NEW;
    END IF;
    
    FOR admin_users IN SELECT id FROM public.profiles WHERE is_admin = true LOOP
      INSERT INTO public.notifications (user_id, report_id, type, message)
      VALUES (admin_users.id, NEW.id, 'moderation_required', notification_message);
    END LOOP;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 3. Verificar se as funções foram atualizadas
SELECT 
    proname as function_name,
    prosecdef as is_security_definer
FROM pg_proc
WHERE proname IN (
    'create_timeline_and_notify',
    'notify_admins_on_report_change'
)
ORDER BY proname;


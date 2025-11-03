-- Função para enviar push notification via Edge Function usando pg_net
-- NOTA: Requer extensão pg_net habilitada no Supabase
CREATE OR REPLACE FUNCTION send_push_notification()
RETURNS TRIGGER AS $$
DECLARE
  notification_data JSONB;
  user_preferences JSONB;
  push_enabled BOOLEAN;
  notification_type_enabled BOOLEAN;
  supabase_url TEXT;
  supabase_anon_key TEXT;
  request_body JSONB;
BEGIN
  -- Obter configurações do Supabase (você pode precisar ajustar isso)
  -- Alternativa: usar variáveis de ambiente ou configurações do banco
  supabase_url := current_setting('app.supabase_url', true);
  supabase_anon_key := current_setting('app.supabase_anon_key', true);
  
  -- Se não estiver configurado, tentar buscar da tabela de configurações
  -- ou usar valores hardcoded (não recomendado para produção)
  IF supabase_url IS NULL OR supabase_anon_key IS NULL THEN
    -- Você precisará configurar essas variáveis no Supabase
    -- Ou usar outra abordagem para obter a URL e chave
    RAISE WARNING 'Supabase URL ou chave não configurados. Configure as variáveis app.supabase_url e app.supabase_anon_key';
    RETURN NEW;
  END IF;

  -- Buscar preferências do usuário
  SELECT 
    notification_preferences,
    push_enabled
  INTO user_preferences, push_enabled
  FROM user_preferences
  WHERE user_id = NEW.user_id;

  -- Se push não estiver habilitado, não enviar
  IF push_enabled IS FALSE THEN
    RETURN NEW;
  END IF;

  -- Verificar se o tipo de notificação está habilitado
  IF user_preferences IS NOT NULL THEN
    notification_type_enabled := COALESCE(
      (user_preferences->>COALESCE(NEW.type, 'system'))::boolean,
      true
    );
    
    IF notification_type_enabled IS FALSE THEN
      RETURN NEW;
    END IF;
  END IF;

  -- Preparar dados da notificação
  notification_data := jsonb_build_object(
    'id', NEW.id,
    'title', CASE
      WHEN NEW.type = 'reports' THEN 'Nova Denúncia'
      WHEN NEW.type = 'works' THEN 'Nova Obra'
      WHEN NEW.type = 'comments' THEN 'Novo Comentário'
      WHEN NEW.type = 'moderation_update' THEN 'Atualização de Moderação'
      WHEN NEW.type = 'status_update' THEN 'Atualização de Status'
      WHEN NEW.type = 'moderation_required' THEN 'Moderação Necessária'
      WHEN NEW.type = 'resolution_submission' THEN 'Nova Resolução'
      WHEN NEW.type = 'work_update' THEN 'Atualização de Obra'
      ELSE 'Trombone Cidadão'
    END,
    'body', NEW.message,
    'message', NEW.message,
    'type', NEW.type,
    'url', CASE
      WHEN NEW.type = 'reports' AND NEW.related_id IS NOT NULL THEN '/reports/' || NEW.related_id
      WHEN NEW.type = 'works' AND NEW.related_id IS NOT NULL THEN '/works/' || NEW.related_id
      ELSE '/notifications'
    END
  );

  -- Preparar corpo da requisição
  request_body := jsonb_build_object(
    'notification', notification_data,
    'userId', NEW.user_id
  );

  -- Chamar Edge Function via pg_net (requer extensão pg_net)
  -- Alternativa: usar pg_net.http_post se disponível
  PERFORM net.http_post(
    url := supabase_url || '/functions/v1/send-push-notification',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || supabase_anon_key
    ),
    body := request_body
  );

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Log do erro mas não falhar a inserção da notificação
    RAISE WARNING 'Erro ao enviar push notification: %', SQLERRM;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger para chamar a função quando uma notificação é criada
DROP TRIGGER IF EXISTS trigger_send_push_notification ON notifications;
CREATE TRIGGER trigger_send_push_notification
  AFTER INSERT ON notifications
  FOR EACH ROW
  EXECUTE FUNCTION send_push_notification();

-- Comentários para documentação
COMMENT ON FUNCTION send_push_notification() IS 
  'Função que envia push notifications via Edge Function quando uma notificação é criada';
COMMENT ON TRIGGER trigger_send_push_notification ON notifications IS
  'Trigger que dispara o envio de push notification após inserção de notificação';


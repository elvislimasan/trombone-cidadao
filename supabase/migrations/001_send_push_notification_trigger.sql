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
  edge_function_url TEXT;
  http_response_id BIGINT;
BEGIN
  -- Obter configurações do Supabase
  -- Primeiro, tentar buscar da tabela app_config (se existir)
  BEGIN
    SELECT value INTO supabase_url
    FROM app_config
    WHERE key = 'supabase_url'
    LIMIT 1;
    
    SELECT value INTO supabase_anon_key
    FROM app_config
    WHERE key = 'supabase_anon_key'
    LIMIT 1;
  EXCEPTION
    WHEN OTHERS THEN
      -- Tabela app_config não existe, continuar
      NULL;
  END;
  
  -- Se não encontrou na tabela, tentar usar current_setting
  IF supabase_url IS NULL THEN
    supabase_url := current_setting('app.supabase_url', true);
  END IF;
  
  IF supabase_anon_key IS NULL THEN
    supabase_anon_key := current_setting('app.supabase_anon_key', true);
  END IF;
  
  -- Se ainda não estiver configurado, retornar sem enviar
  IF supabase_url IS NULL OR supabase_anon_key IS NULL THEN
    RAISE WARNING '[PUSH] Supabase URL ou chave não configurados. URL=% AnonKey=%', supabase_url, CASE WHEN supabase_anon_key IS NULL THEN 'NULL' ELSE 'SET' END;
    RAISE WARNING '[PUSH] Configure na tabela app_config ou use ALTER DATABASE SET app.supabase_url e app.supabase_anon_key';
    RETURN NEW;
  END IF;

  RAISE NOTICE '[PUSH] Iniciando processamento de push notification: user_id=%, type=%, id=%', NEW.user_id, NEW.type, NEW.id;

  -- Buscar preferências do usuário
  -- Usar COALESCE para lidar com valores NULL
  SELECT 
    COALESCE(notification_preferences, '{}'::jsonb),
    COALESCE(push_enabled, false)
  INTO user_preferences, push_enabled
  FROM user_preferences
  WHERE user_id = NEW.user_id;
  
  -- Log das preferências encontradas
  RAISE NOTICE '[PUSH] Preferências do usuário: push_enabled=%, user_preferences=%', push_enabled, user_preferences;

  -- Se não encontrar registro ou push não estiver habilitado, não enviar
  IF push_enabled IS FALSE OR push_enabled IS NULL THEN
    RAISE NOTICE '[PUSH] Push desabilitado para user_id=%: push_enabled=%', NEW.user_id, push_enabled;
    RETURN NEW;
  END IF;

  -- Verificar se o tipo de notificação está habilitado
  IF user_preferences IS NOT NULL AND jsonb_typeof(user_preferences) = 'object' THEN
    -- Log detalhado das preferências
    RAISE NOTICE '[PUSH] Verificando preferências para type=%: user_preferences=%', NEW.type, user_preferences;
    
    notification_type_enabled := COALESCE(
      (user_preferences->>COALESCE(NEW.type, 'system'))::boolean,
      true
    );
    
    RAISE NOTICE '[PUSH] Tipo de notificação % está % para user_id=%', NEW.type, 
      CASE WHEN notification_type_enabled THEN 'habilitado' ELSE 'desabilitado' END, 
      NEW.user_id;
    
    IF notification_type_enabled IS FALSE THEN
      RAISE NOTICE '[PUSH] Tipo de notificação desabilitado para user_id=%: type=%', NEW.user_id, NEW.type;
      RETURN NEW;
    END IF;
  ELSE
    RAISE NOTICE '[PUSH] user_preferences é NULL ou não é objeto para user_id=%', NEW.user_id;
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
      WHEN NEW.type = 'reports' AND NEW.report_id IS NOT NULL THEN '/bronca/' || NEW.report_id
      WHEN NEW.type = 'works' AND NEW.work_id IS NOT NULL THEN '/obras-publicas/' || NEW.work_id
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
  -- Construir URL da Edge Function
  edge_function_url := supabase_url || '/functions/v1/send-push-notification';
  
  RAISE NOTICE '[PUSH] Enviando push notification para user_id=%: type=%, url=%', NEW.user_id, NEW.type, edge_function_url;
  
  -- Chamar Edge Function via pg_net
  -- IMPORTANTE: net.http_post retorna um request_id (BIGINT), não espera resposta
  BEGIN
    -- Fazer requisição HTTP (assíncrona)
    http_response_id := net.http_post(
      url := edge_function_url,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || supabase_anon_key
      ),
      body := request_body
    );
    
    RAISE NOTICE '[PUSH] Requisição HTTP enviada: http_response_id=%, url=%', http_response_id, edge_function_url;
    RAISE NOTICE '[PUSH] Body da requisição: %', request_body;
  EXCEPTION
    WHEN OTHERS THEN
      RAISE WARNING '[PUSH] Erro ao chamar net.http_post: %', SQLERRM;
      RAISE WARNING '[PUSH] Detalhes do erro: %', SQLSTATE;
      RAISE WARNING '[PUSH] URL: %', edge_function_url;
      RAISE WARNING '[PUSH] Supabase URL: %', supabase_url;
      RAISE WARNING '[PUSH] Anon Key presente: %', CASE WHEN supabase_anon_key IS NOT NULL THEN 'SIM' ELSE 'NÃO' END;
  END;

  RAISE NOTICE '[PUSH] Push notification enviada para user_id=%', NEW.user_id;
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


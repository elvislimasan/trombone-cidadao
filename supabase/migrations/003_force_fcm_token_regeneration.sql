-- Função para marcar usuários que precisam regenerar token FCM
-- Esta função pode ser chamada periodicamente ou quando um token é removido por ser inválido

CREATE OR REPLACE FUNCTION mark_users_for_token_regeneration()
RETURNS TABLE(user_id uuid, has_token boolean, token_age_days integer) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    up.user_id,
    CASE 
      WHEN ps.subscription_details->>'token' IS NOT NULL 
        AND ps.subscription_details->>'token' != '' 
      THEN true 
      ELSE false 
    END as has_token,
    CASE 
      WHEN ps.updated_at IS NOT NULL 
      THEN EXTRACT(DAY FROM NOW() - ps.updated_at)::integer
      WHEN ps.created_at IS NOT NULL 
      THEN EXTRACT(DAY FROM NOW() - ps.created_at)::integer
      ELSE NULL
    END as token_age_days
  FROM user_preferences up
  LEFT JOIN push_subscriptions ps ON ps.user_id = up.user_id
  WHERE up.push_enabled = true
    AND (
      -- Usuário sem token
      ps.id IS NULL 
      OR 
      -- Token inválido ou vazio
      ps.subscription_details->>'token' IS NULL 
      OR 
      ps.subscription_details->>'token' = ''
      OR
      -- Token muito antigo (mais de 30 dias sem atualização)
      (ps.updated_at IS NOT NULL AND ps.updated_at < NOW() - INTERVAL '30 days')
      OR
      (ps.updated_at IS NULL AND ps.created_at IS NOT NULL AND ps.created_at < NOW() - INTERVAL '30 days')
    );
END;
$$;

-- Função para limpar tokens antigos/inválidos
-- Esta função remove tokens que não têm valor válido

CREATE OR REPLACE FUNCTION cleanup_invalid_tokens()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  deleted_count integer;
BEGIN
  DELETE FROM push_subscriptions
  WHERE 
    subscription_details->>'token' IS NULL
    OR subscription_details->>'token' = ''
    OR (
      subscription_details->>'type' = 'fcm' 
      AND subscription_details->>'token' IS NULL
    );
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  
  RETURN deleted_count;
END;
$$;

-- Função para verificar se um usuário precisa regenerar token
-- Esta função pode ser chamada pelo app quando abre

CREATE OR REPLACE FUNCTION user_needs_token_regeneration(p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  has_valid_token boolean := false;
BEGIN
  SELECT 
    CASE 
      WHEN ps.subscription_details->>'token' IS NOT NULL 
        AND ps.subscription_details->>'token' != '' 
      THEN true 
      ELSE false 
    END INTO has_valid_token
  FROM push_subscriptions ps
  WHERE ps.user_id = p_user_id
    AND ps.subscription_details->>'type' = 'fcm'
  LIMIT 1;
  
  -- Retorna true se NÃO tem token válido (ou seja, precisa regenerar)
  RETURN NOT COALESCE(has_valid_token, false);
END;
$$;

-- Grant permissões
GRANT EXECUTE ON FUNCTION mark_users_for_token_regeneration() TO authenticated;
GRANT EXECUTE ON FUNCTION cleanup_invalid_tokens() TO authenticated;
GRANT EXECUTE ON FUNCTION user_needs_token_regeneration(uuid) TO authenticated;

-- Comentários
COMMENT ON FUNCTION mark_users_for_token_regeneration() IS 
'Retorna lista de usuários que precisam regenerar token FCM (sem token ou com token antigo)';

COMMENT ON FUNCTION cleanup_invalid_tokens() IS 
'Remove tokens inválidos/vazios da tabela push_subscriptions';

COMMENT ON FUNCTION user_needs_token_regeneration(uuid) IS 
'Verifica se um usuário específico precisa regenerar token FCM';








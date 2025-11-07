-- Função RPC para buscar e-mails dos usuários
-- Esta função permite que administradores vejam os e-mails dos usuários cadastrados
-- sem precisar acessar diretamente a tabela auth.users

-- Remover função existente se houver (para evitar conflito de assinatura)
DROP FUNCTION IF EXISTS public.get_user_emails(UUID[]);

-- Criar função com a assinatura correta
CREATE FUNCTION get_user_emails(user_ids UUID[])
RETURNS TABLE (user_id UUID, email TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  -- Verificar se o usuário atual é administrador
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE profiles.id = (SELECT auth.uid()) AND profiles.is_admin = true
  ) THEN
    RAISE EXCEPTION 'Acesso negado. Apenas administradores podem ver e-mails de usuários.';
  END IF;

  -- Retornar e-mails dos usuários solicitados
  RETURN QUERY
  SELECT 
    au.id AS user_id,
    au.email::TEXT AS email
  FROM auth.users au
  WHERE au.id = ANY(user_ids)
  AND au.email IS NOT NULL;
END;
$$;

-- Garantir que apenas administradores possam executar esta função
GRANT EXECUTE ON FUNCTION get_user_emails(UUID[]) TO authenticated;

-- Comentário explicativo
COMMENT ON FUNCTION get_user_emails IS 'Retorna os e-mails dos usuários para administradores. Requer que o usuário atual seja administrador.';

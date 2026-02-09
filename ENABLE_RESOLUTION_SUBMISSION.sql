-- Função para permitir que qualquer usuário autenticado envie uma resolução
-- Execute este script no SQL Editor do Supabase

CREATE OR REPLACE FUNCTION submit_resolution(
  p_report_id UUID,
  p_resolution_data JSONB,
  p_status TEXT,
  p_resolved_at TIMESTAMPTZ DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER -- Permite ignorar RLS para executar esta função
SET search_path = public -- Prática de segurança
AS $$
DECLARE
  v_result JSONB;
BEGIN
  -- Verificar se o status é válido para esta operação
  IF p_status NOT IN ('pending_resolution', 'resolved') THEN
    RAISE EXCEPTION 'Status inválido para submissão de resolução';
  END IF;

  UPDATE reports
  SET 
    status = p_status,
    resolution_submission = p_resolution_data,
    resolved_at = p_resolved_at,
    updated_at = NOW()
  WHERE id = p_report_id
  RETURNING to_jsonb(reports.*) INTO v_result;

  RETURN v_result;
END;
$$;

-- Permissões para a função
GRANT EXECUTE ON FUNCTION submit_resolution TO authenticated;
GRANT EXECUTE ON FUNCTION submit_resolution TO service_role;

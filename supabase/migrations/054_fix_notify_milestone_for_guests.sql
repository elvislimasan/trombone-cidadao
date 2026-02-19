-- Recria função de metas, ignorando assinaturas sem user_id (convidados)
CREATE OR REPLACE FUNCTION notify_milestone_reached()
RETURNS TRIGGER AS $$
DECLARE
  signature_count INT;
  r_title TEXT;
BEGIN
  -- Conta todas as assinaturas (inclui convidados) para atingir a meta
  SELECT count(*) INTO signature_count
  FROM signatures
  WHERE report_id = NEW.report_id;

  -- Dispara apenas em marcos específicos
  IF signature_count IN (10, 50, 100, 500, 1000, 5000, 10000, 50000, 100000) THEN
    -- Título da bronca / abaixo-assinado relacionado ao report
    SELECT title INTO r_title
    FROM reports
    WHERE id = NEW.report_id;

    -- Notifica apenas usuários logados (user_id não nulo)
    INSERT INTO notifications (user_id, type, title, message, link, is_read, created_at)
    SELECT DISTINCT
      s.user_id,
      'milestone',
      'Meta Atingida! 🎉',
      'O abaixo-assinado "' || r_title || '" atingiu ' || signature_count || ' assinaturas!',
      '/report/' || NEW.report_id,
      false,
      NOW()
    FROM signatures s
    WHERE s.report_id = NEW.report_id
      AND s.user_id IS NOT NULL; -- evita erro para convidados
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Garante que o trigger existe e usa a função atualizada
DROP TRIGGER IF EXISTS on_signature_milestone ON signatures;

CREATE TRIGGER on_signature_milestone
AFTER INSERT ON signatures
FOR EACH ROW
EXECUTE FUNCTION notify_milestone_reached();


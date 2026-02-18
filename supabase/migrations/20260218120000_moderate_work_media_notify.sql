CREATE OR REPLACE FUNCTION notify_admins_new_work_media()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'pending' THEN
    INSERT INTO notifications (user_id, type, message, work_id, is_read, created_at)
    SELECT
      p.id,
      'moderation_required',
      'Nova mídia enviada para a obra "' || COALESCE(w.title, 'Obra') || '" precisa de moderação.',
      NEW.work_id,
      false,
      NOW()
    FROM profiles p
    JOIN public_works w ON w.id = NEW.work_id
    WHERE p.is_admin = true;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS on_work_media_insert_notify_admins ON public_work_media;

CREATE TRIGGER on_work_media_insert_notify_admins
AFTER INSERT ON public_work_media
FOR EACH ROW
EXECUTE FUNCTION notify_admins_new_work_media();

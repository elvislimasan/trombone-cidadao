CREATE OR REPLACE FUNCTION public.notify_report_moderation_update()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.moderation_status IS DISTINCT FROM OLD.moderation_status THEN
    IF NEW.moderation_status = 'rejected' THEN
      INSERT INTO public.notifications (user_id, type, title, message, link, is_read, created_at)
      VALUES (
        NEW.author_id,
        'moderation_update',
        'Bronca rejeitada',
        'Sua bronca foi rejeitada. Confira o motivo.',
        '/painel-usuario?tab=reports&report=' || NEW.id,
        false,
        NOW()
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS on_report_moderation_update_notify ON public.reports;

CREATE TRIGGER on_report_moderation_update_notify
AFTER UPDATE ON public.reports
FOR EACH ROW
EXECUTE FUNCTION public.notify_report_moderation_update();


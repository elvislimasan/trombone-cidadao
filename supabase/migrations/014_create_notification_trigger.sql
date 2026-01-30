-- Function to notify all supporters when a milestone is reached
CREATE OR REPLACE FUNCTION notify_milestone_reached()
RETURNS TRIGGER AS $$
DECLARE
    signature_count INT;
    r_title TEXT;
BEGIN
    -- Get current count for this report
    SELECT count(*) INTO signature_count FROM signatures WHERE report_id = NEW.report_id;
    
    -- Check milestones (10, 50, 100, 500, 1000, etc.)
    -- Using specific numbers to avoid spam on every signature
    IF signature_count IN (10, 50, 100, 500, 1000, 5000, 10000, 50000, 100000) THEN
        -- Get report title
        SELECT title INTO r_title FROM reports WHERE id = NEW.report_id;
        
        -- Insert notifications for all supporters of this report
        -- We select distinct user_ids to avoid duplicates if someone managed to sign twice (though PK prevents it)
        INSERT INTO notifications (user_id, type, title, message, link, is_read, created_at)
        SELECT DISTINCT user_id, 'milestone', 'Meta Atingida! 🎉', 'O abaixo-assinado "' || r_title || '" atingiu ' || signature_count || ' assinaturas!', '/report/' || NEW.report_id, false, NOW()
        FROM signatures
        WHERE report_id = NEW.report_id;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop trigger if exists to avoid duplication
DROP TRIGGER IF EXISTS on_signature_milestone ON signatures;

-- Create trigger
CREATE TRIGGER on_signature_milestone
AFTER INSERT ON signatures
FOR EACH ROW
EXECUTE FUNCTION notify_milestone_reached();

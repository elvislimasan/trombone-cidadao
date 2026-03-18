-- Drop the 073 tables
DROP TABLE IF EXISTS public.public_work_payments CASCADE;
DROP TABLE IF EXISTS public.public_work_biddings CASCADE;

-- Create Payments Table linked to Measurements (Fases/Histórico)
CREATE TABLE IF NOT EXISTS public.public_work_payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    measurement_id UUID NOT NULL REFERENCES public.public_work_measurements(id) ON DELETE CASCADE,
    payment_date DATE NOT NULL,
    commitment_number TEXT,
    payment_description TEXT,
    installment TEXT,
    creditor_name TEXT,
    banking_order TEXT,
    value NUMERIC NOT NULL,
    portal_link TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.public_work_payments ENABLE ROW LEVEL SECURITY;

-- Create Policies
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'public_work_payments'
      AND policyname = 'Allow public read access for payments'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "Allow public read access for payments" ON public.public_work_payments
        FOR SELECT USING (true)
    $policy$;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'public_work_payments'
      AND policyname = 'Allow admins to manage payments'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "Allow admins to manage payments" ON public.public_work_payments
        FOR ALL USING (
          EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid() AND is_admin = true
          )
        )
    $policy$;
  END IF;
END
$$;

-- Add comment
COMMENT ON TABLE public.public_work_payments IS 'Pagamentos vinculados a uma fase/medição (measurement) de obra pública';

-- Function to update amount_spent in measurements when payments change
CREATE OR REPLACE FUNCTION public.update_measurement_amount_spent()
RETURNS TRIGGER AS $$
BEGIN
    IF (TG_OP = 'DELETE') THEN
        UPDATE public.public_work_measurements
        SET amount_spent = (
            SELECT COALESCE(SUM(value), 0)
            FROM public.public_work_payments
            WHERE measurement_id = OLD.measurement_id
        )
        WHERE id = OLD.measurement_id;
        RETURN OLD;
    ELSE
        UPDATE public.public_work_measurements
        SET amount_spent = (
            SELECT COALESCE(SUM(value), 0)
            FROM public.public_work_payments
            WHERE measurement_id = NEW.measurement_id
        )
        WHERE id = NEW.measurement_id;
        RETURN NEW;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger for payments
DROP TRIGGER IF EXISTS trigger_update_measurement_amount_spent ON public.public_work_payments;
CREATE TRIGGER trigger_update_measurement_amount_spent
AFTER INSERT OR UPDATE OR DELETE ON public.public_work_payments
FOR EACH ROW EXECUTE FUNCTION public.update_measurement_amount_spent();

-- Function to update work's amount_spent when measurement changes
CREATE OR REPLACE FUNCTION public.update_work_amount_spent()
RETURNS TRIGGER AS $$
BEGIN
    IF (TG_OP = 'DELETE') THEN
        UPDATE public.public_works
        SET amount_spent = (
            SELECT COALESCE(SUM(amount_spent), 0)
            FROM public.public_work_measurements
            WHERE work_id = OLD.work_id
        )
        WHERE id = OLD.work_id;
        RETURN OLD;
    ELSE
        UPDATE public.public_works
        SET amount_spent = (
            SELECT COALESCE(SUM(amount_spent), 0)
            FROM public.public_work_measurements
            WHERE work_id = NEW.work_id
        )
        WHERE id = NEW.work_id;
        RETURN NEW;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger for measurements
DROP TRIGGER IF EXISTS trigger_update_work_amount_spent ON public.public_work_measurements;
CREATE TRIGGER trigger_update_work_amount_spent
AFTER INSERT OR UPDATE OF amount_spent OR DELETE ON public.public_work_measurements
FOR EACH ROW EXECUTE FUNCTION public.update_work_amount_spent();

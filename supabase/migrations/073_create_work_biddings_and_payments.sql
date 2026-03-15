-- Create tables for Biddings and Payments related to Public Works
-- Run in Supabase SQL Editor or via Supabase CLI migrations

-- 1. Create Biddings Table
CREATE TABLE IF NOT EXISTS public.public_work_biddings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    work_id UUID NOT NULL REFERENCES public.public_works(id) ON DELETE CASCADE,
    number TEXT NOT NULL,
    description TEXT,
    total_value NUMERIC,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Create Payments Table
CREATE TABLE IF NOT EXISTS public.public_work_payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bidding_id UUID NOT NULL REFERENCES public.public_work_biddings(id) ON DELETE CASCADE,
    payment_date DATE NOT NULL,
    banking_order TEXT,
    value NUMERIC NOT NULL,
    portal_link TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Enable RLS
ALTER TABLE public.public_work_biddings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.public_work_payments ENABLE ROW LEVEL SECURITY;

-- 4. Create Policies (assuming same pattern as public_works)
-- Public view
CREATE POLICY "Allow public read access for biddings" ON public.public_work_biddings
    FOR SELECT USING (true);

CREATE POLICY "Allow public read access for payments" ON public.public_work_payments
    FOR SELECT USING (true);

-- Admin manage (using is_admin from profiles)
CREATE POLICY "Allow admins to manage biddings" ON public.public_work_biddings
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid() AND is_admin = true
        )
    );

CREATE POLICY "Allow admins to manage payments" ON public.public_work_payments
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid() AND is_admin = true
        )
    );

-- Add comments for documentation
COMMENT ON TABLE public.public_work_biddings IS 'Licitações vinculadas a uma obra pública';
COMMENT ON TABLE public.public_work_payments IS 'Pagamentos vinculados a uma licitação de obra pública';

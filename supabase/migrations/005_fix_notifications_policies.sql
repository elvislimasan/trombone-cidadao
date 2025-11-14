-- Correção: Recriar políticas RLS da tabela notifications
-- Garantir que todas as políticas usam o nome correto da coluna

-- 1. Dropar TODAS as políticas existentes (incluindo as que podem ter nomes diferentes)
DROP POLICY IF EXISTS "Users can view their own notifications" ON public.notifications;
DROP POLICY IF EXISTS "Users can manage their own notifications" ON public.notifications;
DROP POLICY IF EXISTS "Users can update their own notifications" ON public.notifications;
DROP POLICY IF EXISTS "Users can delete their own notifications" ON public.notifications;
DROP POLICY IF EXISTS "System can insert notifications" ON public.notifications;
DROP POLICY IF EXISTS "System can create notifications" ON public.notifications;

-- 2. Recriar política para SELECT (visualizar)
-- 🔥 IMPORTANTE: Em políticas RLS, usar apenas o nome da coluna (sem prefixo)
CREATE POLICY "Users can view their own notifications"
    ON public.notifications
    FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id);

-- 3. Recriar política para UPDATE (atualizar)
-- 🔥 IMPORTANTE: Em políticas RLS, usar apenas o nome da coluna (sem prefixo)
CREATE POLICY "Users can update their own notifications"
    ON public.notifications
    FOR UPDATE
    TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- 4. Recriar política para DELETE (deletar)
-- 🔥 IMPORTANTE: Em políticas RLS, usar apenas o nome da coluna (sem prefixo)
CREATE POLICY "Users can delete their own notifications"
    ON public.notifications
    FOR DELETE
    TO authenticated
    USING (auth.uid() = user_id);

-- 5. Criar política para INSERT (inserir via funções SECURITY DEFINER)
-- 🔥 IMPORTANTE: Usar {public} como em dev para garantir compatibilidade
DROP POLICY IF EXISTS "System can insert notifications" ON public.notifications;
DROP POLICY IF EXISTS "System can create notifications" ON public.notifications;
CREATE POLICY "System can create notifications"
    ON public.notifications
    FOR INSERT
    TO public
    WITH CHECK (true);  -- Permite qualquer inserção (funções SECURITY DEFINER podem inserir)

-- 6. Verificar se as políticas foram criadas corretamente
SELECT 
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd,
    qual,
    with_check
FROM pg_policies
WHERE tablename = 'notifications'
ORDER BY policyname;

-- 7. Verificar se a coluna user_id existe na tabela
SELECT 
    column_name,
    data_type,
    is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'notifications'
  AND column_name = 'user_id';


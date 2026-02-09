-- Erro: duplicate key value violates unique constraint "hooks_pkey"
-- Este erro ocorre quando a sequência da tabela interna 'hooks' do Supabase está dessincronizada.
-- Isso geralmente acontece após backups/restores ou falhas em inserções de webhooks.

-- Execute o comando abaixo no SQL Editor do Supabase Dashboard para corrigir:

SELECT setval('supabase_functions.hooks_id_seq', (SELECT MAX(id) FROM supabase_functions.hooks));

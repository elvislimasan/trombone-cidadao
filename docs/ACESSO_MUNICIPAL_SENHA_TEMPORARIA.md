# Acesso municipal com senha temporária

Administradores da plataforma criam acessos em **Prefeituras e acessos → Criar acesso de administrador**. Administradores municipais criam funcionários em **Equipe e acessos → Criar acesso de funcionário**, escolhendo secretaria e cargos.

O sistema cria a conta sem enviar convite e mostra e-mail e senha aleatória uma única vez, com botão para copiar. O prazo de 24 horas começa na geração, não no primeiro login. No primeiro acesso são obrigatórios nome completo, telefone com DDD e aceite dos termos; cidade, prefeitura e cargos vêm da administração. Depois de 24 horas, o usuário precisa definir uma senha pessoal para continuar, inclusive se já estiver conectado. Pode trocar antes pelo fluxo normal de alteração de senha. A troca é confirmada pelo Auth no servidor; metadados enviados pelo cliente não liberam o acesso.

E-mails existentes não têm a senha alterada. Para funcionários que já possuem conta Órgão Público da cidade, use **Vincular conta existente**. Convites antigos continuam disponíveis para compatibilidade; os novos acessos usam senha temporária.

## Ativação no ambiente

1. Aplique `supabase/migrations/391_municipal_temporary_access.sql` depois das migrações anteriores.
2. Publique a função: `supabase functions deploy create-municipal-account --project-ref <projeto>`.
3. Publique o frontend atualizado.

A função utiliza `SUPABASE_URL`, `SUPABASE_ANON_KEY` e `SUPABASE_SERVICE_ROLE_KEY` do ambiente das Edge Functions. A chave administrativa permanece no servidor. Não exige configuração de SMTP para criar o acesso.

A migração registra `public.check_municipal_account` em `pgrst.db_pre_request` do papel `authenticator`, bloqueando consultas e RPCs de contas provisionadas com cadastro pendente ou senha vencida. A leitura necessária à inicialização da sessão e os RPCs de cadastro/status continuam disponíveis. Se o ambiente possuir um hook próprio de PostgREST fora deste repositório, componha os dois hooks antes de aplicar a migração. Contas anteriores sem registro em `municipal_account_setup` mantêm o fluxo existente.

## Validação local

`powershell -File tools/validate-arborization-db.ps1 -TestFile supabase/tests/municipal_temporary_access.sql`

Esse teste usa PostgreSQL local descartável, sem conexão ou alteração em produção. Verifica autorização por prefeitura/cidade, preservação de contas existentes, cadastro inicial, bloqueio no limite das 24 horas e liberação somente após alteração efetiva da senha. O teste invoca o hook diretamente; a configuração automática do hook e a criação pelo Supabase Auth devem também ser verificadas em homologação após a publicação.

`node tools/validate-municipal-responsibilities-ui.mjs --temporary-access` verifica criação, erros e credenciais em 390, 1440 e 1920 px. `node tools/validate-tree-inventory-ui.mjs --species-filter` verifica seleção de espécie, limpeza e largura do inventário nesses tamanhos. Ambos usam componentes reais e dados fictícios.

# Configuração de Push Notifications - Site Fechado

Este guia explica como configurar push notifications que funcionam mesmo quando o site está fechado ou em segundo plano.

## 📋 Visão Geral

Para que as push notifications funcionem com o site fechado, precisamos:

1. **Edge Function do Supabase**: Envia push notifications reais usando Web Push Protocol
2. **Database Trigger**: Dispara automaticamente quando uma notificação é criada
3. **VAPID Keys**: Configuradas no Supabase para autenticação

---

## 🔑 Passo 1: Gerar VAPID Keys

As VAPID keys são necessárias para autenticar o servidor com o serviço de push do navegador.

### Opção A: Usando Node.js (Recomendado)

```bash
npm install -g web-push
web-push generate-vapid-keys
```

Isso gerará duas chaves:
- **Public Key**: Use no frontend (`VITE_VAPID_PUBLIC_KEY`) **E** no backend (`VAPID_PUBLIC_KEY`)
- **Private Key**: Use **APENAS** na Edge Function (`VAPID_PRIVATE_KEY`) - **NUNCA no frontend!**

**⚠️ IMPORTANTE sobre as VAPID Keys:**

1. **VAPID_PUBLIC_KEY deve ser a MESMA**:
   - ✅ Frontend: `VITE_VAPID_PUBLIC_KEY` (arquivo `.env`)
   - ✅ Backend: `VAPID_PUBLIC_KEY` (Supabase Edge Functions)
   - **Ambas devem ser EXATAMENTE a mesma chave!**

2. **VAPID_PRIVATE_KEY é SECRETA**:
   - ✅ Backend: `VAPID_PRIVATE_KEY` (Supabase Edge Functions)
   - ❌ **NUNCA** no frontend (arquivo `.env`) - é segredo!
   - ❌ **NUNCA** no código do cliente - é segredo!

3. **VAPID_EMAIL:**
- O email que você usar ao gerar as chaves **DEVE ser o mesmo** usado na variável `VAPID_EMAIL`
- Formato: `mailto:seu-email@exemplo.com` (com `mailto:` na frente)
- Pode ser qualquer email válido, mas recomendado usar um email do seu domínio/organização
- Este email identifica quem está enviando as notificações push

### Opção B: Usando Site Online

1. Acesse: https://web-push-codelab.glitch.me/
2. Clique em "Generate Keys"
3. Copie as chaves geradas

### Exemplo de Output:

```
Public Key:
BK8xV...suas_chaves_aqui

Private Key:
xyzABC...suas_chaves_aqui
```

---

## 🚀 Passo 2: Configurar Variáveis de Ambiente no Supabase

1. Acesse o **Dashboard do Supabase**: https://app.supabase.com
2. Selecione seu projeto
3. Vá em **Settings** → **Edge Functions**
4. Configure as seguintes variáveis de ambiente:

   - **VAPID_PUBLIC_KEY**: Cole a Public Key gerada (deve ser a MESMA do frontend)
   - **VAPID_PRIVATE_KEY**: Cole a Private Key gerada (NUNCA no frontend - é segredo!)
   - **VAPID_EMAIL**: Email usado ao gerar as VAPID keys (formato: `mailto:seu-email@exemplo.com`)
     - **⚠️ IMPORTANTE**: Deve ser o MESMO email usado ao gerar as chaves!
     - Pode ser qualquer email válido (ex: `mailto:contato@seudominio.com`)
     - Recomendado usar um email do seu domínio/organização
   - **SUPABASE_URL**: Sua URL do Supabase (geralmente já configurada)
   - **SUPABASE_SERVICE_ROLE_KEY**: Sua Service Role Key (geralmente já configurada)

5. Clique em **Save**

---

## 📦 Passo 3: Criar e Deploy da Edge Function

### 3.1 Usar Supabase CLI via npx (Recomendado - Mais Simples)

**⚠️ IMPORTANTE:** Você NÃO precisa instalar nada! Use `npx` diretamente.

O `npx` já vem com o Node.js e permite executar o Supabase CLI sem instalação:

```bash
# Verificar se funciona
npx supabase --version
```

**Pronto!** Você pode usar `npx supabase` em todos os comandos abaixo.

---

**Alternativas (opcional - apenas se preferir instalar):**

**Opção A: Instalar via Scoop (Windows)**

Primeiro instale o Scoop:

```powershell
# Executar no PowerShell como Administrador
Set-ExecutionPolicy RemoteSigned -Scope CurrentUser
irm get.scoop.sh | iex

# Depois instalar Supabase CLI
scoop bucket add supabase https://github.com/supabase/scoop-bucket.git
scoop install supabase
```

**Opção B: Instalar via Chocolatey (Windows)**

```bash
choco install supabase
```

**Opção C: Download Manual**

1. Acesse: https://github.com/supabase/cli/releases
2. Baixe o executável para Windows
3. Adicione ao PATH do sistema

### 3.2 Login no Supabase

Se usou `npx`, use:

```bash
npx supabase login
```

Se instalou via outro método:

```bash
supabase login
```

### 3.3 Linkar o Projeto

**Com npx:**

```bash
npx supabase link --project-ref seu-project-ref
```

**Instalado:**

```bash
supabase link --project-ref seu-project-ref
```

> **Nota:** O `project-ref` pode ser encontrado na URL do seu projeto no Supabase:
> `https://app.supabase.com/project/[PROJECT-REF]`

### 3.4 Deploy da Edge Function

**Com npx:**

```bash
npx supabase functions deploy send-push-notification
```

**Instalado:**

```bash
supabase functions deploy send-push-notification
```

### 3.5 Verificar se o Deploy Funcionou

1. No Dashboard do Supabase, vá em **Edge Functions**
2. Você deve ver `send-push-notification` na lista
3. Clique para ver os logs

---

## 🗄️ Passo 4: Configurar Database Trigger

### 4.1 Habilitar Extensão pg_net (se necessário)

No **SQL Editor** do Supabase, execute:

```sql
-- Habilitar extensão pg_net para fazer requisições HTTP
CREATE EXTENSION IF NOT EXISTS pg_net;
```

### 4.2 Configurar Variáveis do Banco

Você precisa configurar as variáveis `app.supabase_url` e `app.supabase_anon_key` no banco.

No **SQL Editor**, execute (substitua pelos seus valores):

```sql
-- Configurar variáveis do Supabase
ALTER DATABASE postgres SET app.supabase_url = 'https://seu-projeto.supabase.co';
ALTER DATABASE postgres SET app.supabase_anon_key = 'sua-anon-key-aqui';
```

**OU** execute o SQL do arquivo `supabase/migrations/001_send_push_notification_trigger.sql` manualmente no SQL Editor.

### 4.3 Verificar se o Trigger foi Criado

No **SQL Editor**, execute:

```sql
-- Verificar triggers na tabela notifications
SELECT 
  trigger_name,
  event_manipulation,
  event_object_table,
  action_statement
FROM information_schema.triggers
WHERE event_object_table = 'notifications';
```

Você deve ver `trigger_send_push_notification` na lista.

---

## 🔧 Passo 5: Atualizar Código Frontend

### 5.1 Adicionar VAPID Public Key no `.env`

No arquivo `.env` do seu projeto, adicione:

```env
VITE_VAPID_PUBLIC_KEY=sua-public-key-aqui
```

**⚠️ IMPORTANTE:**
- Use a **MESMA** Public Key que configurou no Supabase (`VAPID_PUBLIC_KEY`)
- **NÃO** adicione a Private Key no `.env` - ela é segredo e só vai no Supabase!

### 5.2 Verificar se o Service Worker está Configurado

O Service Worker (`public/sw.js`) já deve estar configurado para receber push notifications. Verifique se existe o handler:

```javascript
self.addEventListener('push', function(event) {
  // ... código do handler
});
```

---

## ✅ Passo 6: Testar

### 6.1 Testar Manualmente

1. Abra o site no navegador
2. Ative as notificações push
3. **Feche completamente o site** (ou deixe em segundo plano)
4. Crie uma notificação no banco de dados (via SQL ou interface)
5. A push notification deve aparecer mesmo com o site fechado

### 6.2 Testar via SQL

No **SQL Editor**, execute:

```sql
-- Criar uma notificação de teste
INSERT INTO notifications (user_id, type, message, related_id)
VALUES (
  'seu-user-id-aqui',  -- Substitua pelo ID do seu usuário
  'system',
  'Teste de push notification com site fechado',
  NULL
);
```

### 6.3 Verificar Logs

1. No Dashboard do Supabase, vá em **Edge Functions** → `send-push-notification`
2. Clique em **Logs** para ver se há erros
3. Verifique os logs do Service Worker no navegador (DevTools → Application → Service Workers)

---

## 🐛 Troubleshooting

### Erro: "VAPID keys não configuradas"

**Solução**: Verifique se as variáveis de ambiente estão configuradas corretamente no Supabase:
- Vá em **Settings** → **Edge Functions**
- Confirme que `VAPID_PUBLIC_KEY` e `VAPID_PRIVATE_KEY` estão preenchidas

### Erro: "Subscription inválida"

**Solução**: 
- O usuário precisa se inscrever novamente nas notificações push
- Verifique se a subscription está salva corretamente na tabela `push_subscriptions`

### Erro: "pg_net não encontrado"

**Solução**: 
- Execute `CREATE EXTENSION IF NOT EXISTS pg_net;` no SQL Editor
- Se não funcionar, você pode usar uma abordagem alternativa (ver abaixo)

### Push notifications não chegam

**Verificações**:
1. ✅ VAPID keys configuradas corretamente?
2. ✅ Edge Function deployada?
3. ✅ Trigger criado no banco?
4. ✅ Usuário tem push habilitado nas preferências?
5. ✅ Subscription existe na tabela `push_subscriptions`?
6. ✅ Service Worker está ativo?
7. ✅ Permissão de notificações concedida no navegador?

### Alternativa: Usar Database Webhooks

Se o `pg_net` não funcionar, você pode usar **Database Webhooks** do Supabase:

1. No Dashboard, vá em **Database** → **Webhooks**
2. Crie um novo webhook:
   - **Table**: `notifications`
   - **Events**: `INSERT`
   - **URL**: `https://seu-projeto.supabase.co/functions/v1/send-push-notification`
   - **HTTP Method**: `POST`
   - **HTTP Headers**: 
     ```
     Authorization: Bearer sua-anon-key
     Content-Type: application/json
     ```
   - **Request Body Template**:
     ```json
     {
       "notification": {
         "id": "{{$body.id}}",
         "title": "{{$body.type}}",
         "body": "{{$body.message}}",
         "type": "{{$body.type}}",
         "url": "/notifications"
       },
       "userId": "{{$body.user_id}}"
     }
     ```

---

## 📚 Recursos Adicionais

- [Documentação Web Push Protocol](https://web.dev/push-notifications-overview/)
- [Supabase Edge Functions](https://supabase.com/docs/guides/functions)
- [Supabase Database Webhooks](https://supabase.com/docs/guides/database/webhooks)

---

## 🎯 Próximos Passos

Após configurar tudo:

1. ✅ Teste com o site fechado
2. ✅ Monitore os logs da Edge Function
3. ✅ Configure alertas para erros
4. ✅ Considere implementar retry logic para falhas temporárias
5. ✅ Adicione métricas de entrega de notificações

---

## ⚠️ Notas Importantes

- **VAPID Keys**: As chaves privadas devem ser mantidas em segredo e nunca expostas no frontend
- **Rate Limiting**: Considere implementar rate limiting para evitar spam de notificações
- **Subscription Expiration**: As subscriptions podem expirar; implemente lógica para renová-las
- **Compatibilidade**: Alguns navegadores podem não suportar push notifications (especialmente Safari no iOS)

---

**Pronto!** Agora suas push notifications devem funcionar mesmo com o site fechado. 🎉


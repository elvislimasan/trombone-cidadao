# Configuração de Notificações no Supabase - GUIA COMPLETO

## ⚠️ IMPORTANTE: Você PRECISA configurar o Realtime no Supabase!

O Supabase **não habilita o Realtime automaticamente**. Você precisa habilitar manualmente para que as notificações funcionem em tempo real.

---

## 📋 Passo a Passo: Habilitar Realtime no Supabase

### 1️⃣ Acessar o Dashboard do Supabase

1. Acesse [https://app.supabase.com](https://app.supabase.com)
2. Faça login na sua conta
3. Selecione o projeto correto

### 2️⃣ Habilitar Realtime na Tabela `notifications`

**Opção A: Via Interface (Recomendado)**

1. No menu lateral esquerdo, clique em **"Database"**
2. Clique em **"Replication"** (ou **"Realtime"** dependendo da versão)
3. Você verá uma lista de todas as tabelas do seu banco
4. **Procure pela tabela `notifications`**
5. Se a tabela estiver na lista mas com o toggle **desativado**:
   - Clique no toggle ao lado de `notifications` para **ATIVAR** (deve ficar verde/azul)
6. Se a tabela **NÃO estiver na lista**:
   - Clique em **"Enable Realtime"** ou **"Add Table"**
   - Selecione a tabela `notifications`
   - Clique em **"Save"** ou **"Enable"**

**Opção B: Via SQL Editor**

1. No menu lateral, clique em **"SQL Editor"**
2. Crie uma nova query
3. Execute o seguinte SQL:

```sql
-- Habilitar Realtime na tabela notifications
ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
```

4. Clique em **"Run"** ou pressione `Ctrl+Enter`

### 3️⃣ Verificar se o Realtime está Habilitado

Após habilitar, verifique:

1. Volte para **Database** → **Replication**
2. A tabela `notifications` deve aparecer na lista
3. O toggle deve estar **ATIVADO** (verde/azul)
4. Se aparecer um ícone de check ✅, está tudo certo!

---

## 🔐 Políticas RLS (Row Level Security)

As políticas RLS são necessárias para que os usuários vejam apenas suas próprias notificações:

### Criar as Políticas RLS

1. No menu lateral, clique em **"SQL Editor"**
2. Execute o seguinte SQL:

```sql
-- Política para SELECT: Usuários podem ver apenas suas próprias notificações
CREATE POLICY "Users can view their own notifications"
ON notifications
FOR SELECT
USING (auth.uid() = user_id);

-- Política para INSERT: Sistema pode criar notificações
-- (Esta política permite que o sistema crie notificações para qualquer usuário)
CREATE POLICY "System can create notifications"
ON notifications
FOR INSERT
WITH CHECK (true);

-- Política para UPDATE: Usuários podem marcar como lidas apenas suas próprias notificações
CREATE POLICY "Users can update their own notifications"
ON notifications
FOR UPDATE
USING (auth.uid() = user_id);
```

3. Clique em **"Run"**

### Verificar se as Políticas estão Criadas

1. No menu lateral, clique em **"Authentication"** → **"Policies"**
2. Ou vá em **"Database"** → **"Tables"** → `notifications` → **"Policies"**
3. Você deve ver as 3 políticas listadas:
   - `Users can view their own notifications` (SELECT)
   - `System can create notifications` (INSERT)
   - `Users can update their own notifications` (UPDATE)

---

## 📊 Estrutura da Tabela `notifications`

Certifique-se de que a tabela tem a seguinte estrutura:

```sql
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  message TEXT NOT NULL,
  report_id UUID REFERENCES reports(id) ON DELETE CASCADE,
  work_id UUID REFERENCES public_works(id) ON DELETE CASCADE,
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON notifications(is_read) WHERE is_read = false;
```

#### 3. Estrutura da Tabela `notifications`

A tabela deve ter a seguinte estrutura:

```sql
CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  message TEXT NOT NULL,
  report_id UUID REFERENCES reports(id) ON DELETE CASCADE,
  work_id UUID REFERENCES public_works(id) ON DELETE CASCADE,
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índices para performance
CREATE INDEX idx_notifications_user_id ON notifications(user_id);
CREATE INDEX idx_notifications_created_at ON notifications(created_at DESC);
CREATE INDEX idx_notifications_is_read ON notifications(is_read) WHERE is_read = false;
```

---

## 🧪 Testar a Conexão Real-time

### Passo 1: Obter o ID do Usuário Logado

1. No seu aplicativo, faça login
2. Abra o console do navegador (F12)
3. Execute no console:
```javascript
// Obter o ID do usuário logado
const { data: { user } } = await supabase.auth.getUser();
console.log('User ID:', user.id);
```

### Passo 2: Criar uma Notificação de Teste

1. No Supabase Dashboard, vá em **"SQL Editor"**
2. Execute o seguinte SQL (substitua `SEU_USER_ID` pelo ID obtido acima):

```sql
-- Criar notificação de teste
INSERT INTO notifications (user_id, type, message)
VALUES ('SEU_USER_ID', 'system', 'Teste de notificação real-time - ' || NOW()::text);
```

3. Clique em **"Run"**

### Passo 3: Verificar se Funcionou

**Se tudo estiver configurado corretamente:**

1. **No console do navegador**, você deve ver:
   - `🔔🎉 NOVA NOTIFICAÇÃO RECEBIDA NO COMPONENTE (via real-time)!`
   - `🔔🎉 NOTIFICAÇÃO RECEBIDA VIA REAL-TIME DO CONTEXTO!`
   - `🔔📢 Evento customizado "new-notification" disparado`

2. **No componente de notificações:**
   - O contador de não lidas deve aumentar automaticamente
   - A notificação deve aparecer na lista sem precisar clicar no ícone

**Se não funcionar:**
- Verifique os logs do console para erros
- Verifique se o Realtime está habilitado (passo 2 acima)
- Verifique se as políticas RLS estão criadas (passo 3 acima)

---

## 📝 Logs para Debug

### ✅ Logs Esperados (Quando Tudo Funciona)

**1. Quando o componente monta:**
```
🔔📥 Buscando notificações para usuário: [ID]
🔔✅ Notificações carregadas: [NÚMERO]
🔔🔄 Configurando subscription real-time no componente Notifications para: [ID]
🔔🔄 CONFIGURANDO REAL-TIME NO CONTEXTO para usuário: [ID]
🔔✅ Componente Notifications conectado ao real-time com sucesso!
🔔✅ CONTEXTO CONECTADO ao real-time com sucesso!
```

**2. Quando uma nova notificação chega:**
```
🔔🎉 NOVA NOTIFICAÇÃO RECEBIDA NO COMPONENTE (via real-time)!
🔔🎉 NOTIFICAÇÃO RECEBIDA VIA REAL-TIME DO CONTEXTO!
🔔📢 Evento customizado "new-notification" disparado
🔔📢 Evento customizado "new-notification" recebido no componente:
🔔✅ Notificação é para o usuário atual, adicionando...
🔔📊 Contador de não lidas atualizado: [NÚMERO]
```

### ❌ Logs de Erro (Quando Algo Está Errado)

**Se o Realtime NÃO estiver habilitado:**
```
🔔❌ ERRO no canal real-time do componente Notifications
🔔❌ ERRO no canal real-time do Context
🔔❌ Timeout no canal real-time do componente Notifications
```

**Se as políticas RLS estiverem incorretas:**
```
Error fetching notifications: permission denied
🔔❌ Erro ao buscar notificações: [ERRO]
```

---

## 🔧 Troubleshooting (Solução de Problemas)

### ❌ Problema: Notificações não aparecem automaticamente

**Sintomas:**
- O contador não atualiza automaticamente
- Precisa clicar no ícone para ver novas notificações
- Logs mostram `🔔❌ ERRO no canal real-time`

**Soluções (em ordem de prioridade):**

1. **Verificar se o Realtime está habilitado:**
   - Vá em **Database** → **Replication**
   - Verifique se `notifications` está na lista com toggle **ATIVADO**
   - Se não estiver, habilite conforme o **Passo 2** acima

2. **Verificar políticas RLS:**
   - Execute o SQL do **Passo 3** acima
   - Verifique se as 3 políticas foram criadas

3. **Verificar logs do console:**
   - Abra o console do navegador (F12)
   - Procure por erros relacionados a `realtime` ou `notifications`
   - Verifique se há erros de rede

4. **Verificar autenticação:**
   - Certifique-se de que o usuário está logado
   - Execute no console: `await supabase.auth.getUser()`
   - Deve retornar um objeto `user` com `id`

### ❌ Problema: Erro "permission denied"

**Sintomas:**
- Erro no console: `permission denied for table notifications`
- Não consegue buscar notificações

**Solução:**
1. Execute o SQL do **Passo 3** (Políticas RLS) novamente
2. Verifique se a política de SELECT está ativa:
   ```sql
   SELECT * FROM pg_policies WHERE tablename = 'notifications';
   ```
3. Se não aparecer, crie manualmente:
   ```sql
   DROP POLICY IF EXISTS "Users can view their own notifications" ON notifications;
   CREATE POLICY "Users can view their own notifications"
   ON notifications FOR SELECT
   USING (auth.uid() = user_id);
   ```

### ❌ Problema: Subscription não conecta

**Sintomas:**
- Logs mostram `🔔❌ Timeout no canal real-time`
- Status do canal é `TIMED_OUT` ou `CHANNEL_ERROR`

**Soluções:**

1. **Verificar se o Realtime está habilitado:**
   - **Database** → **Replication** → Tabela `notifications` deve estar ativa

2. **Verificar conexão de rede:**
   - Verifique se não há bloqueadores de rede
   - Teste em outra rede/WiFi

3. **Verificar autenticação:**
   - Certifique-se de que o usuário está logado
   - Recarregue a página

4. **Limpar e reconectar:**
   - Feche todas as abas do aplicativo
   - Limpe o cache do navegador
   - Abra novamente e faça login

### ❌ Problema: Realtime habilitado mas ainda não funciona

**Soluções:**

1. **Verificar publicação do Supabase:**
   ```sql
   -- Verificar se a tabela está na publicação
   SELECT * FROM pg_publication_tables WHERE tablename = 'notifications';
   
   -- Se não aparecer, adicione manualmente:
   ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
   ```

2. **Verificar se o schema está correto:**
   - Certifique-se de que a tabela está no schema `public`
   - Verifique: `SELECT schemaname, tablename FROM pg_tables WHERE tablename = 'notifications';`

3. **Reiniciar o Realtime:**
   - No Supabase Dashboard, vá em **Settings** → **API**
   - Procure por opções relacionadas a Realtime
   - Ou entre em contato com o suporte do Supabase

---

## ✅ Checklist Final

Antes de considerar tudo configurado, verifique:

- [ ] Realtime habilitado na tabela `notifications` (Database → Replication)
- [ ] Políticas RLS criadas (3 políticas: SELECT, INSERT, UPDATE)
- [ ] Tabela `notifications` existe e tem a estrutura correta
- [ ] Índices criados para performance
- [ ] Teste de notificação manual funcionou
- [ ] Logs do console mostram conexão bem-sucedida
- [ ] Contador de notificações atualiza automaticamente

---

## 📞 Ainda com Problemas?

Se após seguir todos os passos ainda não funcionar:

1. **Verifique os logs completos do console**
2. **Tire screenshots dos erros**
3. **Verifique a documentação oficial do Supabase Realtime:**
   - [https://supabase.com/docs/guides/realtime](https://supabase.com/docs/guides/realtime)
4. **Entre em contato com o suporte do Supabase** se necessário


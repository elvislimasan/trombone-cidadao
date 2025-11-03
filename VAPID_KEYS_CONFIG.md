# Configuração de VAPID Keys - Guia Completo

## 🔑 Como Funcionam as VAPID Keys

As VAPID keys são um **par de chaves** (pública e privada) geradas juntas:

```bash
web-push generate-vapid-keys
```

Isso gera:
- **Public Key** (pode ser exposta publicamente)
- **Private Key** (deve ser mantida em segredo)

---

## 📍 Onde Configurar Cada Chave

### ✅ **VAPID_PUBLIC_KEY** (MESMA chave em dois lugares)

#### 1. Frontend (`.env`):
```env
VITE_VAPID_PUBLIC_KEY=BL...sua-public-key-aqui
```

#### 2. Backend (Supabase Edge Functions):
```
VAPID_PUBLIC_KEY=BL...sua-public-key-aqui
```

**⚠️ IMPORTANTE:** Deve ser a **MESMA** chave em ambos os lugares!

---

### 🔒 **VAPID_PRIVATE_KEY** (APENAS no backend)

#### ✅ Backend (Supabase Edge Functions):
```
VAPID_PRIVATE_KEY=xyz...sua-private-key-aqui
```

#### ❌ **NUNCA** no frontend:
- ❌ Não adicione no arquivo `.env`
- ❌ Não adicione no código do cliente
- ❌ Não commite no GitHub

**Razão:** A Private Key é **segredo** e permite enviar push notifications. Se exposta, qualquer um pode enviar notificações em seu nome!

---

## 📋 Checklist de Configuração

### Frontend (`.env`):
- [ ] `VITE_VAPID_PUBLIC_KEY` configurada
- [ ] É a **MESMA** Public Key do backend
- [ ] Private Key **NÃO** está no `.env`

### Backend (Supabase Edge Functions):
- [ ] `VAPID_PUBLIC_KEY` configurada
- [ ] `VAPID_PRIVATE_KEY` configurada
- [ ] `VAPID_EMAIL` configurado
- [ ] `VAPID_PUBLIC_KEY` é a **MESMA** do frontend

---

## 🔍 Verificação Rápida

### Como verificar se estão corretas:

1. **Frontend**: Verifique se `VITE_VAPID_PUBLIC_KEY` está no `.env`
2. **Backend**: Verifique no Supabase Edge Functions se `VAPID_PUBLIC_KEY` está configurada
3. **Compare**: As duas Public Keys devem ser **EXATAMENTE** iguais
4. **Backend**: Verifique se `VAPID_PRIVATE_KEY` está configurada (só no Supabase)

---

## ❌ Erros Comuns

### ❌ Erro 1: Public Keys diferentes
```
Frontend: VITE_VAPID_PUBLIC_KEY=BL...key1
Backend:  VAPID_PUBLIC_KEY=BL...key2  # ❌ DIFERENTE!
```
**Problema:** Push notifications não funcionarão!
**Solução:** Use a mesma Public Key em ambos os lugares.

### ❌ Erro 2: Private Key no frontend
```env
# ❌ ERRADO!
VITE_VAPID_PUBLIC_KEY=BL...public-key
VITE_VAPID_PRIVATE_KEY=xyz...private-key  # ❌ NUNCA FAÇA ISSO!
```
**Problema:** Risco de segurança! Qualquer um que acessar o código pode enviar notificações.
**Solução:** Remova a Private Key do frontend imediatamente.

### ❌ Erro 3: Keys de pares diferentes
```
# Gerou um par de chaves
Public Key:  BL...key1
Private Key: xyz...key1-private

# Mas configurou com outro par
VAPID_PUBLIC_KEY=BL...key2  # ❌ De outro par!
VAPID_PRIVATE_KEY=xyz...key1-private  # ❌ De outro par!
```
**Problema:** Keys não correspondem, push notifications não funcionarão!
**Solução:** Use o par completo (Public e Private) gerado juntos.

---

## ✅ Exemplo Correto Completo

### 1. Gerar as chaves:
```bash
web-push generate-vapid-keys
```

**Output:**
```
Public Key:
BLxVyz1234567890abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890abcdefghijklmnop=

Private Key:
xyzABC1234567890abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890abcdefghijklmnop=
```

### 2. Configurar Frontend (`.env`):
```env
VITE_VAPID_PUBLIC_KEY=BLxVyz1234567890abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890abcdefghijklmnop=
```

### 3. Configurar Backend (Supabase Edge Functions):
```
VAPID_PUBLIC_KEY=BLxVyz1234567890abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890abcdefghijklmnop=
VAPID_PRIVATE_KEY=xyzABC1234567890abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890abcdefghijklmnop=
VAPID_EMAIL=mailto:contato@trombonecidadao.com
```

### 4. Verificar:
- ✅ Public Key é **IGUAL** no frontend e backend
- ✅ Private Key está **APENAS** no backend
- ✅ Email está configurado

---

## 🎯 Resumo

| Chave | Frontend | Backend | Mesma? |
|-------|----------|---------|--------|
| **Public Key** | ✅ Sim (`VITE_VAPID_PUBLIC_KEY`) | ✅ Sim (`VAPID_PUBLIC_KEY`) | ✅ **SIM, deve ser igual!** |
| **Private Key** | ❌ Nunca | ✅ Sim (`VAPID_PRIVATE_KEY`) | ❌ Não |

---

## 🔐 Segurança

1. **Public Key**: Pode ser exposta publicamente (frontend, GitHub, etc.)
2. **Private Key**: 
   - ⚠️ **NUNCA** no frontend
   - ⚠️ **NUNCA** no GitHub
   - ✅ **APENAS** no Supabase (variáveis de ambiente seguras)
   - ✅ Mantida em segredo

---

## 💡 Dica

Se você precisar regenerar as chaves:
1. Gere um novo par completo
2. Atualize **AMBAS** as Public Keys (frontend e backend)
3. Atualize a Private Key (apenas backend)
4. Atualize o VAPID_EMAIL (se mudou)
5. Os usuários precisarão se inscrever novamente nas notificações


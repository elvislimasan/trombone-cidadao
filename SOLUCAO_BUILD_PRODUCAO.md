# 🔧 Solução: Problemas no Build de Produção

## ⚠️ **Problema Identificado**

O código usa variáveis de ambiente (`import.meta.env.VITE_*`) que são injetadas durante o build do Vite.

**No debug (`yarn android:live`)**: Funciona porque o Vite está rodando e injetando as variáveis de `.env.local` ou `.env`.

**No build de produção**: Se não houver um `.env.production` configurado, as variáveis podem estar `undefined` ou incorretas.

## ✅ **Solução**

### 1. **Criar arquivo `.env.production`**

Crie um arquivo `.env.production` na raiz do projeto com as variáveis de produção:

```env
# SUPABASE - Configuração do Banco de Dados
VITE_SUPABASE_URL=https://seu-projeto.supabase.co
VITE_SUPABASE_ANON_KEY=sua-chave-anon-do-supabase-aqui

# PUSH NOTIFICATIONS - VAPID Keys
VITE_VAPID_PUBLIC_KEY=sua-vapid-public-key-aqui

# APP - Configuração do Aplicativo
VITE_APP_URL=https://seu-site.vercel.app
VITE_APP_NAME=Trombone Cidadão
```

### 2. **Build com variáveis de produção**

O Vite automaticamente usa `.env.production` quando você faz `npm run build` em modo produção.

**Importante**: As variáveis são injetadas no build, então você precisa rebuildar sempre que mudar as variáveis.

### 3. **Não precisa fazer deploy na Vercel antes**

O build do app Android é **standalone** (funciona offline). Você não precisa fazer deploy na Vercel antes de buildar.

**MAS**: Se você quiser testar a versão web antes, pode fazer deploy na Vercel para garantir que tudo está funcionando.

## 🚀 **Processo Correto de Build**

### Opção 1: Build direto (sem deploy na Vercel)

```bash
# 1. Configurar .env.production com as variáveis corretas
# 2. Buildar o app
npm run build:prod
```

### Opção 2: Testar na Vercel primeiro (recomendado)

```bash
# 1. Configurar .env.production com as variáveis corretas
# 2. Buildar e fazer deploy na Vercel
npm run build
# Deploy na Vercel (verificar se está funcionando)
# 3. Se estiver OK na Vercel, buildar o app Android
npm run build:prod
```

## 📝 **Variáveis de Ambiente Necessárias**

### Obrigatórias:

1. **VITE_SUPABASE_URL** - URL do seu projeto Supabase
2. **VITE_SUPABASE_ANON_KEY** - Chave anon do Supabase

### Opcionais (mas recomendadas):

3. **VITE_VAPID_PUBLIC_KEY** - Para push notifications web
4. **VITE_APP_URL** - URL da sua aplicação (para SEO)
5. **VITE_APP_NAME** - Nome da aplicação

## 🔍 **Verificar se as Variáveis Estão Sendo Usadas**

### No código:

```javascript
// src/lib/customSupabaseClient.js
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
```

### Como verificar:

1. **Buildar o app**:
   ```bash
   npm run build
   ```

2. **Verificar o arquivo gerado**:
   ```bash
   # Verificar se as variáveis foram injetadas
   grep -r "VITE_SUPABASE_URL" dist/
   ```

3. **Se aparecer `undefined` ou não aparecer**, significa que as variáveis não foram definidas corretamente.

## ⚠️ **Importante**

1. **`.env.production` não deve ser commitado** (já está no `.gitignore`)
2. **Sempre rebuildar** quando mudar as variáveis de ambiente
3. **Testar o build localmente** antes de publicar
4. **Verificar os logs** do app para ver se há erros de variáveis `undefined`

## 🎯 **Checklist Antes de Buildar**

1. ✅ Criar/verificar `.env.production` com as variáveis corretas
2. ✅ Testar build local: `npm run build`
3. ✅ Verificar se o build gerou corretamente em `dist/`
4. ✅ (Opcional) Fazer deploy na Vercel para testar
5. ✅ Buildar o app Android: `npm run build:prod`
6. ✅ Testar o APK gerado no dispositivo

## 🔧 **Troubleshooting**

### Problema: Variáveis `undefined` no app

**Solução**: 
1. Verificar se `.env.production` existe
2. Verificar se as variáveis estão no formato correto (`VITE_*`)
3. Rebuildar o app: `npm run build:prod`

### Problema: App funciona em debug mas não em release

**Solução**:
1. Verificar se `.env.production` tem as mesmas variáveis que `.env.local`
2. Verificar se as URLs estão corretas (não usar `localhost`)
3. Rebuildar completamente: `npm run build && npx cap sync`

### Problema: Push notifications não funcionam

**Solução**:
1. Verificar se `VITE_VAPID_PUBLIC_KEY` está configurado
2. Verificar se as variáveis do Supabase estão corretas
3. Rebuildar o app

# 📱 Trombone Cidadão - Guia de Produção

## ⚠️ **IMPORTANTE: Variáveis de Ambiente**

Antes de buildar o app de produção, você **DEVE** criar um arquivo `.env.production` com as variáveis corretas.

### Criar `.env.production`

1. **Copiar o template**:
   ```bash
   cp env.production.template .env.production
   ```

2. **Preencher com os valores reais**:
   - `VITE_SUPABASE_URL` - URL do seu projeto Supabase
   - `VITE_SUPABASE_ANON_KEY` - Chave anon do Supabase
   - `VITE_VAPID_PUBLIC_KEY` - Chave pública VAPID (para push notifications)
   - `VITE_APP_URL` - URL da sua aplicação (opcional)
   - `VITE_APP_NAME` - Nome da aplicação (opcional)

3. **Não commitar** o `.env.production` (já está no `.gitignore`)

### Por que isso é importante?

- **No debug (`yarn android:live`)**: Funciona porque o Vite está rodando e lê `.env.local`
- **No build de produção**: Precisa de `.env.production` para injetar as variáveis no código

**Sem `.env.production`**, as variáveis ficam `undefined` e o app não funciona corretamente.

## 🔔 Push Notifications

### Configuração do Firebase Service Account

1. **Obter o Service Account JSON** do Firebase Console
2. **Copiar o JSON completo** (minificado ou formatado)
3. **Configurar no Supabase**:
   - Settings → Edge Functions → Environment Variables
   - Variável: `FIREBASE_SERVICE_ACCOUNT`
   - Valor: Cole o JSON completo como string

### Configuração do VAPID (Web Push)

1. **Gerar VAPID keys** (se necessário):
   ```bash
   npm install -g web-push
   web-push generate-vapid-keys
   ```

2. **Configurar no Supabase**:
   - Variável: `VAPID_PUBLIC_KEY`
   - Variável: `VAPID_PRIVATE_KEY`
   - Variável: `VAPID_EMAIL` (deve começar com `mailto:`)

## 🗄️ Banco de Dados - Produção

### Migrations Essenciais

As migrations estão em `supabase/migrations/`:

1. **001_send_push_notification_trigger.sql** - Trigger para enviar push notifications
2. **002_create_notifications_on_reports.sql** - Cria notificações quando reports são criados/atualizados
3. **003_force_fcm_token_regeneration.sql** - Funções para regenerar tokens FCM

### Scripts SQL Úteis

#### Verificar Configuração do Firebase
```sql
-- Verificar variáveis do Firebase
SELECT * FROM app_config WHERE key IN ('firebase_project_id', 'firebase_service_account');
```

#### Verificar Push Notifications de um Usuário
```sql
-- Verificar configuração de push de um usuário
SELECT 
  up.user_id,
  up.push_enabled,
  up.notification_preferences,
  ps.token,
  ps.created_at
FROM user_preferences up
LEFT JOIN push_subscriptions ps ON ps.user_id = up.user_id
WHERE up.user_id = 'USER_ID_AQUI';
```

#### Habilitar Push para Usuários
```sql
-- Habilitar push para um usuário específico
UPDATE user_preferences 
SET push_enabled = true,
    notification_preferences = jsonb_build_object(
      'reports', true,
      'works', true,
      'comments', true,
      'system', true,
      'moderation_update', true,
      'status_update', true,
      'moderation_required', true,
      'resolution_submission', true,
      'work_update', true
    )
WHERE user_id = 'USER_ID_AQUI';
```

#### Verificar Trigger de Push Notifications
```sql
-- Verificar se o trigger está ativo
SELECT 
  trigger_name,
  event_manipulation,
  action_timing,
  action_statement
FROM information_schema.triggers
WHERE trigger_name = 'trigger_send_push_notification';
```

#### Limpar Tokens Inválidos
```sql
-- Remover tokens FCM inválidos
DELETE FROM push_subscriptions 
WHERE token IS NULL 
   OR token = '' 
   OR (expires_at IS NOT NULL AND expires_at < NOW());
```

## 🚀 Build de Produção

### ⚠️ **ANTES DE BUILDAR**

1. **Criar `.env.production`** com as variáveis corretas (ver seção acima)
2. **Verificar se as variáveis estão corretas**
3. **Testar build local**: `npm run build` (verificar se não há erros)

### Build APK Release
```bash
npm run build:prod
```

### Build AAB (Android App Bundle)
```bash
npm run build:prod:aab
```

### Localização dos Arquivos Gerados

- **APK**: `android/app/build/outputs/apk/release/app-release.apk`
- **AAB**: `android/app/build/outputs/bundle/release/app-release.aab`

### ⚠️ **Precisa fazer deploy na Vercel antes?**

**NÃO**, você não precisa fazer deploy na Vercel antes de buildar o app.

O app Android é **standalone** (funciona offline). Mas se quiser testar a versão web primeiro, pode fazer deploy na Vercel para garantir que está tudo funcionando.

## ⚙️ Configurações Importantes

### AndroidManifest.xml
- Permissões: `INTERNET`, `POST_NOTIFICATIONS`, `VIBRATE`
- Firebase Cloud Messaging Service configurado

### MainActivity.java
- Safe areas configuradas
- JavaScript Interface para abrir configurações do app
- WebView configurado corretamente

### Capacitor Config
- `appId`: `com.trombonecidadao.app`
- `appName`: `Trombone Cidadão`
- `webDir`: `dist`
- `androidScheme`: `https`

## 🔍 Troubleshooting

### Push Notifications Não Chegam
1. Verificar se o Service Account está configurado no Supabase
2. Verificar se o token FCM está salvo no banco
3. Verificar logs da Edge Function no Supabase
4. Verificar se o trigger está ativo

### Safe Areas Não Funcionam
1. Verificar se o MainActivity está sendo executado
2. Verificar logs do Android
3. Verificar se o CSS está aplicando as variáveis `--safe-area-top` e `--safe-area-bottom`

### Preferências Não Aparecem
1. Verificar se o WebView está configurado corretamente
2. Verificar logs do JavaScript no Chrome DevTools
3. Verificar se o contexto está carregando corretamente

## 📝 Notas

- **Keystore**: Certifique-se de ter o `android/keystore.properties` configurado para assinar o APK/AAB
- **Google Services**: Certifique-se de ter o `android/app/google-services.json` para push notifications funcionarem
- **WebView Debug**: Desabilitado em produção (apenas em DEBUG builds)


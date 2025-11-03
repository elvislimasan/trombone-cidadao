# Push Notifications - Quando NÃO Funcionam e Como Forçar

## 📱 Push Notifications em Mobile (Celular)

### ✅ **SIM, deveria chegar mesmo fechando o app!**

Se você:
1. ✅ Logou no site
2. ✅ Ativou push notifications
3. ✅ Permissão foi concedida
4. ✅ Edge Function está configurada (para push real)
5. ✅ Fechou o site/app
6. ✅ Limpou apps em segundo plano

**As notificações DEVEM chegar** porque:

- **Service Worker continua ativo**: Mesmo com o app fechado, o Service Worker fica ativo no sistema operacional
- **Web Push Protocol funciona**: O sistema operacional (Android/iOS) mantém a conexão com o serviço de push do navegador
- **Limpar apps não afeta**: Limpar apps em segundo plano não remove o Service Worker nem a subscription de push

### ⚠️ **Quando NÃO funciona em Mobile:**

1. **Navegador fechado completamente** (não apenas a aba)
   - **Android**: Chrome/Firefox mantêm Service Worker mesmo fechado ✅
   - **iOS Safari**: Pode parar Service Worker se fechar completamente ❌
   - **Solução**: Instalar como PWA (Progressive Web App)

2. **PWA não instalado** (usando apenas navegador)
   - Alguns navegadores mobile podem ser mais restritivos
   - **Solução**: Instalar o site como PWA para melhor funcionamento

3. **Bateria otimizada** (Android)
   - Sistema pode matar o Service Worker para economizar bateria
   - **Solução**: Desabilitar otimização de bateria para o navegador/PWA

4. **Permissão de notificações negada**
   - Sistema operacional bloqueia notificações
   - **Solução**: Verificar configurações do sistema

5. **Modo de economia de dados**
   - Pode limitar conexões em segundo plano
   - **Solução**: Desabilitar modo de economia de dados

### 🔧 **Configurações Recomendadas para Mobile:**

#### Android:

1. **Desabilitar otimização de bateria**:
   - Configurações → Apps → [Seu Navegador] → Bateria → Não otimizar

2. **Permitir em segundo plano**:
   - Configurações → Apps → [Seu Navegador] → Dados móveis → Permitir em segundo plano

3. **Instalar como PWA**:
   - Abrir site no Chrome
   - Menu → "Adicionar à tela inicial"
   - Isso cria um app separado que funciona melhor

#### iOS (Safari):

1. **Instalar como PWA**:
   - Abrir site no Safari
   - Compartilhar → "Adicionar à Tela de Início"
   - PWAs no iOS funcionam melhor com push notifications

2. **Permitir notificações**:
   - Configurações → Safari → Notificações → Permitir

### 📊 **Diferença: Navegador vs PWA Instalado**

| Situação | Navegador Mobile | PWA Instalado |
|----------|------------------|---------------|
| App fechado | ✅ Pode funcionar | ✅ Funciona melhor |
| App limpo | ✅ Deve funcionar | ✅ Funciona melhor |
| Bateria otimizada | ⚠️ Pode parar | ✅ Mais estável |
| iOS | ❌ Limitado | ✅ Funciona melhor |
| Android | ✅ Funciona | ✅ Funciona melhor |

### 🧪 **Como Testar em Mobile:**

1. **Abrir site no celular**
2. **Ativar push notifications**
3. **Fechar completamente o site/app**
4. **Limpar apps em segundo plano** (se quiser)
5. **Criar notificação no banco** (via SQL ou interface)
6. **Notificação deve aparecer** mesmo com app fechado

### 💡 **Dica Importante:**

Para melhor funcionamento em mobile, **instale o site como PWA**:
- Android: Chrome → Menu → "Adicionar à tela inicial"
- iOS: Safari → Compartilhar → "Adicionar à Tela de Início"

PWAs têm melhor suporte a push notifications e funcionam mais como apps nativos.

---

## 🚫 Situações onde Push Notifications NÃO Funcionam

### 1. **Permissão Negada**
- **Sintoma**: Nenhuma notificação aparece
- **Causa**: Usuário negou permissão no navegador
- **Solução**: Pedir permissão novamente via configurações do navegador
  - Chrome: `chrome://settings/content/notifications`
  - Firefox: `about:preferences#privacy`
  - Edge: `edge://settings/content/notifications`

### 2. **Site Fechado SEM Sistema de Push Real**
- **Sintoma**: Notificações só aparecem com site aberto
- **Causa**: Usando `postMessage` ao invés de Web Push Protocol real
- **Solução**: Configurar Edge Function do Supabase (ver `PUSH_NOTIFICATIONS_SETUP.md`)

### 3. **Service Worker Não Registrado**
- **Sintoma**: Erro no console sobre Service Worker
- **Causa**: Service Worker não foi registrado ou está com erro
- **Solução**: 
  - Verificar se `sw.js` existe na pasta `public/`
  - Verificar console do navegador para erros
  - Forçar recarregamento: `Ctrl+Shift+R`

### 4. **Push Subscription Não Criada**
- **Sintoma**: Push habilitado mas notificações não chegam
- **Causa**: Subscription não foi criada ou expirou
- **Solução**: 
  - Verificar se subscription existe no banco (`push_subscriptions`)
  - Reativar push notifications nas configurações

### 5. **VAPID Keys Não Configuradas**
- **Sintoma**: Erro ao criar subscription
- **Causa**: Chaves VAPID não configuradas no Supabase
- **Solução**: Configurar `VAPID_PUBLIC_KEY` e `VAPID_PRIVATE_KEY` no Supabase

### 6. **Preferências Desabilitadas**
- **Sintoma**: Notificações não aparecem mesmo com tudo configurado
- **Causa**: Tipo de notificação desabilitado nas preferências do usuário
- **Solução**: Verificar preferências em `/notificacoes`

### 7. **Navegador Não Suporta**
- **Sintoma**: `pushSupported` é `false`
- **Causa**: Navegador antigo ou sem suporte a Service Workers
- **Solução**: Usar navegador moderno (Chrome, Firefox, Edge, Safari 16.4+)

### 8. **Modo Privado/Incógnito**
- **Sintoma**: Service Worker não funciona
- **Causa**: Alguns navegadores bloqueiam Service Workers em modo privado
- **Solução**: Usar modo normal (não privado)

### 9. **HTTPS Não Configurado (Localhost OK)**
- **Sintoma**: Service Worker não registra em produção
- **Causa**: Service Workers requerem HTTPS (exceto localhost)
- **Solução**: Usar HTTPS em produção

### 10. **Subscription Expirada**
- **Sintoma**: Notificações param de funcionar após tempo
- **Causa**: Subscriptions podem expirar
- **Solução**: Sistema deve detectar e pedir nova subscription

---

## 🧪 Como Forçar/Testar Push Notifications

### Método 1: Via Console do Navegador

Abra o Console (F12) e execute:

```javascript
// Testar notificação local (site aberto)
if ('Notification' in window && Notification.permission === 'granted') {
  new Notification('Teste Forçado', {
    body: 'Esta é uma notificação de teste forçada',
    icon: '/icons/icon-192x192.png',
    badge: '/icons/badge-72x72.png',
    vibrate: [100, 50, 100],
    data: { url: '/', test: true }
  });
}

// Testar via Service Worker (funciona mesmo com site fechado)
if (navigator.serviceWorker.controller) {
  navigator.serviceWorker.controller.postMessage({
    type: 'SHOW_PUSH_NOTIFICATION',
    notification: {
      title: 'Teste Forçado via Service Worker',
      body: 'Esta notificação foi forçada diretamente',
      icon: '/icons/icon-192x192.png',
      badge: '/icons/badge-72x72.png',
      data: { url: '/', test: true },
      tag: 'test-forced-' + Date.now(),
      vibrate: [100, 50, 100]
    }
  });
}
```

### Método 2: Criar Notificação no Banco de Dados

Execute no SQL Editor do Supabase:

```sql
-- Substitua 'seu-user-id-aqui' pelo ID do seu usuário
INSERT INTO notifications (user_id, type, message, related_id)
VALUES (
  'seu-user-id-aqui',
  'system',
  'Notificação de teste forçada do banco de dados',
  NULL
);
```

### Método 3: Via Edge Function (Push Real)

Se a Edge Function estiver configurada, você pode chamá-la diretamente:

```javascript
// No console do navegador
fetch('https://seu-projeto.supabase.co/functions/v1/send-push-notification', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer sua-anon-key'
  },
  body: JSON.stringify({
    notification: {
      id: 'test-' + Date.now(),
      title: 'Teste Forçado',
      body: 'Esta é uma notificação de teste forçada via Edge Function',
      message: 'Esta é uma notificação de teste forçada via Edge Function',
      type: 'system',
      url: '/'
    },
    userId: 'seu-user-id-aqui'
  })
})
.then(r => r.json())
.then(console.log)
.catch(console.error);
```

### Método 4: Via Interface do Site

1. Acesse `/notificacoes` (ou página de preferências)
2. Clique em "Testar Notificação"
3. Isso dispara uma notificação de teste

---

## 🔍 Verificações de Diagnóstico

Execute no console do navegador para diagnosticar:

```javascript
// Verificar suporte
console.log('Service Worker:', 'serviceWorker' in navigator);
console.log('Push Manager:', 'PushManager' in window);
console.log('Notification:', 'Notification' in window);

// Verificar permissão
console.log('Permissão:', Notification.permission);

// Verificar Service Worker registrado
navigator.serviceWorker.getRegistration().then(reg => {
  console.log('Service Worker registrado:', !!reg);
  if (reg) {
    reg.pushManager.getSubscription().then(sub => {
      console.log('Subscription:', sub ? 'Existe' : 'Não existe');
      if (sub) {
        console.log('Subscription details:', {
          endpoint: sub.endpoint.substring(0, 50) + '...',
          keys: Object.keys(sub.keys || {})
        });
      }
    });
  }
});
```

---

## ✅ Checklist de Verificação

Use este checklist para diagnosticar problemas:

- [ ] Permissão de notificações está "granted"?
- [ ] Service Worker está registrado e ativo?
- [ ] Push subscription existe no banco (`push_subscriptions`)?
- [ ] VAPID keys estão configuradas no Supabase?
- [ ] Edge Function está deployada (para push real)?
- [ ] Trigger está criado no banco de dados?
- [ ] Preferências do usuário estão habilitadas?
- [ ] Navegador suporta Service Workers?
- [ ] Site está em HTTPS (ou localhost)?
- [ ] Não está em modo privado/incógnito?

---

## 🛠️ Soluções Rápidas

### Forçar Nova Subscription

```javascript
// No console do navegador
navigator.serviceWorker.getRegistration().then(reg => {
  if (reg) {
    reg.pushManager.getSubscription().then(sub => {
      if (sub) {
        sub.unsubscribe().then(() => {
          console.log('Subscription removida. Recarregue a página para criar nova.');
          window.location.reload();
        });
      }
    });
  }
});
```

### Forçar Recarregamento do Service Worker

```javascript
// No console do navegador
navigator.serviceWorker.getRegistrations().then(regs => {
  regs.forEach(reg => reg.update());
  console.log('Service Workers atualizados');
});
```

### Limpar Cache e Recarregar

```javascript
// No console do navegador
caches.keys().then(names => {
  names.forEach(name => caches.delete(name));
  console.log('Cache limpo');
  window.location.reload();
});
```

---

## 📝 Notas Importantes

1. **Push Notifications Reais** (com site fechado) só funcionam se:
   - Edge Function estiver configurada
   - Trigger estiver criado no banco
   - VAPID keys estiverem configuradas

2. **Notificações Locais** (com site aberto) funcionam sempre que:
   - Permissão foi concedida
   - Service Worker está registrado
   - Código JavaScript está correto

3. **Testes** devem ser feitos em:
   - Ambiente de produção (HTTPS)
   - Ou localhost para desenvolvimento


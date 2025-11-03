# Personalização de Push Notifications

## 🎨 O que pode ser personalizado?

### ✅ Elementos Personalizáveis:

1. **Título** (`title`)
2. **Corpo/Mensagem** (`body`)
3. **Ícone** (`icon`)
4. **Badge** (`badge`)
5. **Imagem** (`image`)
6. **Ações** (`actions`) - Botões na notificação
7. **Vibração** (`vibrate`)
8. **Som** (`sound`)
9. **Tag** (`tag`) - Para agrupar notificações
10. **Require Interaction** (`requireInteraction`) - Manter notificação até interação
11. **Direção** (`dir`) - Texto da esquerda para direita ou RTL
12. **Dados customizados** (`data`) - Para uso no click handler

---

## 📍 Onde Personalizar

### 1. Edge Function (Backend)
Arquivo: `supabase/functions/send-push-notification/index.ts`

### 2. Service Worker (Frontend)
Arquivo: `public/sw.js`

### 3. NotificationContext (Frontend)
Arquivo: `src/contexts/NotificationContext.jsx`

---

## 🛠️ Implementação

### Opção 1: Personalizar por Tipo de Notificação

Atualize a função `getNotificationTitle` no `NotificationContext.jsx`:

```javascript
const getNotificationTitle = (type) => {
  const titles = {
    'moderation_update': '📋 Status da Bronca',
    'status_update': '🔄 Atualização de Status',
    'moderation_required': '👮 Moderação Necessária',
    'resolution_submission': '📸 Resolução Enviada',
    'work_update': '🏗️ Atualização de Obra',
    'reports': '🚨 Nova Denúncia',
    'comments': '💬 Novo Comentário',
    'system': '🔔 Trombone Cidadão'
  };
  return titles[type] || '🔔 Trombone Cidadão';
};

// Adicione também ícones personalizados por tipo
const getNotificationIcon = (type) => {
  const icons = {
    'moderation_update': '/icons/status-icon.png',
    'status_update': '/icons/update-icon.png',
    'moderation_required': '/icons/moderation-icon.png',
    'resolution_submission': '/icons/resolution-icon.png',
    'work_update': '/icons/work-icon.png',
    'reports': '/icons/report-icon.png',
    'comments': '/icons/comment-icon.png',
    'system': '/icons/icon-192x192.png'
  };
  return icons[type] || '/icons/icon-192x192.png';
};
```

### Opção 2: Personalizar na Edge Function

Atualize `supabase/functions/send-push-notification/index.ts`:

```typescript
// Criar payload da notificação personalizado
const payload = JSON.stringify({
  title: notification.title || 'Trombone Cidadão',
  body: notification.body || notification.message || 'Nova notificação',
  icon: notification.icon || '/icons/icon-192x192.png',
  badge: notification.badge || '/icons/badge-72x72.png',
  image: notification.image, // Imagem grande (opcional)
  data: {
    url: notification.url || '/',
    notificationId: notification.notificationId,
    type: notification.type,
    // Dados customizados adicionais
    customData: notification.customData
  },
  tag: notification.notificationId || 'default',
  vibrate: notification.vibrate || [100, 50, 100],
  timestamp: Date.now(),
  // Personalização adicional
  requireInteraction: notification.requireInteraction || false,
  actions: notification.actions || [
    {
      action: 'open',
      title: 'Abrir',
      icon: '/icons/open-icon.png'
    },
    {
      action: 'close',
      title: 'Fechar',
      icon: '/icons/close-icon.png'
    }
  ],
  sound: notification.sound || '/sounds/notification.mp3', // Opcional
  dir: notification.dir || 'ltr' // 'ltr' ou 'rtl'
});
```

### Opção 3: Personalizar no Service Worker

Atualize `public/sw.js` no handler de push:

```javascript
self.addEventListener('push', function(event) {
  if (!event.data) {
    return;
  }

  let data;
  try {
    data = event.data.json();
  } catch (error) {
    data = {
      title: 'Trombone Cidadão',
      body: event.data.text() || 'Nova notificação',
      icon: '/icons/icon-192x192.png',
      badge: '/icons/badge-72x72.png'
    };
  }

  // Personalização baseada no tipo
  const typeConfig = {
    'moderation_update': {
      icon: '/icons/status-icon.png',
      badge: '/icons/badge-status.png',
      vibrate: [200, 100, 200],
      sound: '/sounds/status.mp3'
    },
    'status_update': {
      icon: '/icons/update-icon.png',
      badge: '/icons/badge-update.png',
      vibrate: [100, 50, 100],
      sound: '/sounds/update.mp3'
    },
    'moderation_required': {
      icon: '/icons/moderation-icon.png',
      badge: '/icons/badge-moderation.png',
      vibrate: [300, 100, 300, 100, 300], // Padrão "urgente"
      requireInteraction: true // Manter até interação
    },
    // Adicione mais tipos...
  };

  const config = typeConfig[data.type] || {};

  const options = {
    body: data.body || 'Nova notificação disponível',
    icon: data.icon || config.icon || '/icons/icon-192x192.png',
    badge: data.badge || config.badge || '/icons/badge-72x72.png',
    image: data.image, // Imagem grande
    data: {
      url: data.url || '/',
      notificationId: data.notificationId,
      type: data.type
    },
    actions: data.actions || config.actions || [
      {
        action: 'open',
        title: 'Abrir',
        icon: '/icons/open-icon.png'
      },
      {
        action: 'dismiss',
        title: 'Dispensar',
        icon: '/icons/dismiss-icon.png'
      }
    ],
    requireInteraction: data.requireInteraction !== undefined 
      ? data.requireInteraction 
      : config.requireInteraction || false,
    tag: data.tag || 'default',
    vibrate: data.vibrate || config.vibrate || [100, 50, 100],
    timestamp: data.timestamp || Date.now(),
    sound: data.sound || config.sound, // Opcional
    dir: data.dir || 'ltr', // 'ltr' ou 'rtl'
    silent: data.silent || false, // Sem som nem vibração
    renotify: data.renotify || false, // Notificar novamente mesmo com tag igual
    sticky: data.sticky || false // Manter notificação até interação
  };

  event.waitUntil(
    self.registration.showNotification(data.title || 'Trombone Cidadão', options)
      .catch(error => console.error('Service Worker: Error showing notification', error))
  );
});
```

---

## 🎯 Exemplos de Personalização

### Exemplo 1: Notificação com Imagem

```javascript
const payload = JSON.stringify({
  title: 'Nova Denúncia com Foto',
  body: 'Uma nova denúncia foi criada com foto',
  icon: '/icons/icon-192x192.png',
  badge: '/icons/badge-72x72.png',
  image: '/images/report-photo.jpg', // Imagem grande
  data: {
    url: '/bronca/123',
    notificationId: '123',
    type: 'reports'
  }
});
```

### Exemplo 2: Notificação Urgente (com interação obrigatória)

```javascript
const payload = JSON.stringify({
  title: '⚠️ Moderação Necessária',
  body: 'Uma denúncia requer moderação urgente',
  icon: '/icons/urgent-icon.png',
  badge: '/icons/badge-urgent.png',
  requireInteraction: true, // Não fecha automaticamente
  vibrate: [300, 100, 300, 100, 300], // Padrão "urgente"
  tag: 'urgent-moderation',
  data: {
    url: '/admin/moderation',
    notificationId: '123',
    type: 'moderation_required',
    priority: 'urgent'
  }
});
```

### Exemplo 3: Notificação com Ações Personalizadas

```javascript
const payload = JSON.stringify({
  title: 'Nova Resolução Enviada',
  body: 'Uma nova resolução foi enviada para sua denúncia',
  icon: '/icons/resolution-icon.png',
  actions: [
    {
      action: 'view',
      title: '👁️ Ver Resolução',
      icon: '/icons/view-icon.png'
    },
    {
      action: 'approve',
      title: '✅ Aprovar',
      icon: '/icons/approve-icon.png'
    },
    {
      action: 'reject',
      title: '❌ Rejeitar',
      icon: '/icons/reject-icon.png'
    }
  ],
  data: {
    url: '/bronca/123',
    notificationId: '123',
    type: 'resolution_submission',
    resolutionId: '456'
  }
});
```

### Exemplo 4: Notificação Silenciosa

```javascript
const payload = JSON.stringify({
  title: 'Atualização em Segundo Plano',
  body: 'Sua denúncia foi atualizada',
  icon: '/icons/icon-192x192.png',
  silent: true, // Sem som nem vibração
  tag: 'background-update',
  data: {
    url: '/bronca/123',
    notificationId: '123',
    type: 'status_update'
  }
});
```

---

## 🔔 Handler de Ações (Service Worker)

Quando o usuário clica em uma ação, adicione o handler:

```javascript
self.addEventListener('notificationclick', function(event) {
  event.notification.close();

  const action = event.action;
  const data = event.notification.data;

  if (action === 'open') {
    // Abrir URL
    event.waitUntil(
      clients.openWindow(data.url || '/')
    );
  } else if (action === 'view') {
    // Ver detalhes
    event.waitUntil(
      clients.openWindow(data.url || '/')
    );
  } else if (action === 'approve') {
    // Aprovar (ex: resolução)
    event.waitUntil(
      fetch('/api/approve-resolution', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resolutionId: data.resolutionId })
      }).then(() => {
        return clients.openWindow(data.url || '/');
      })
    );
  } else if (action === 'reject') {
    // Rejeitar
    event.waitUntil(
      fetch('/api/reject-resolution', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resolutionId: data.resolutionId })
      }).then(() => {
        return clients.openWindow(data.url || '/');
      })
    );
  } else if (action === 'dismiss') {
    // Apenas fechar
    event.notification.close();
  } else {
    // Ação padrão: abrir URL
    event.waitUntil(
      clients.openWindow(data.url || '/')
    );
  }
});
```

---

## 📱 Personalização por Dispositivo

### Android

```javascript
const options = {
  // ... outras opções
  android: {
    channelId: 'notifications-channel',
    priority: 'high', // 'high', 'normal', 'low'
    sound: 'default',
    vibrate: [200, 100, 200]
  }
};
```

### iOS

```javascript
const options = {
  // ... outras opções
  ios: {
    sound: 'default',
    badge: 1 // Número no badge do app
  }
};
```

---

## 🎨 Padrões de Vibração

```javascript
// Padrões pré-definidos
const vibrationPatterns = {
  default: [100, 50, 100],
  urgent: [300, 100, 300, 100, 300],
  gentle: [50, 30, 50],
  double: [100, 50, 100, 50, 100],
  long: [200, 100, 200, 100, 200, 100, 200]
};
```

---

## 📋 Checklist de Personalização

- [ ] Título personalizado por tipo
- [ ] Ícone personalizado por tipo
- [ ] Badge personalizado
- [ ] Imagem grande (quando aplicável)
- [ ] Ações personalizadas (botões)
- [ ] Vibração personalizada por tipo
- [ ] Som personalizado (opcional)
- [ ] Handler de ações no Service Worker
- [ ] Dados customizados para uso no click
- [ ] Tag para agrupar notificações

---

## 💡 Dicas

1. **Use tags para agrupar notificações similares**
   - Exemplo: Todas as notificações de uma denúncia têm a mesma tag
   - Assim, apenas a mais recente aparece

2. **Use requireInteraction para notificações importantes**
   - Mantém a notificação até o usuário interagir

3. **Personalize vibração para diferentes tipos**
   - Urgente: padrão longo
   - Normal: padrão curto
   - Silencioso: sem vibração

4. **Use imagens para notificações mais ricas**
   - Mostra preview da foto da denúncia
   - Melhora engajamento

5. **Ações personalizadas aumentam interação**
   - Permite ações rápidas sem abrir o app
   - Melhora UX


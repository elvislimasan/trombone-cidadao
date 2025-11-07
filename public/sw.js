/* eslint-disable no-restricted-globals */
const CACHE_NAME = 'trombone-cidadao-cache-v4';
const urlsToCache = [
  '/',
  '/index.html',
  '/manifest.json',
  '/logo.png',
];

// Install: Open cache and add static assets.
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        return cache.addAll(urlsToCache).catch(error => {
          console.error('Cache addAll error:', error);
        });
      })
      .then(() => {
        return self.skipWaiting();
      })
  );
});

// Activate: Clean up old caches.
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cache => {
          if (cache !== CACHE_NAME) {
            return caches.delete(cache);
          }
          return null;
        })
      );
    }).then(() => {
      return self.clients.claim();
    })
  );
});

// Fetch: Apply caching strategies.
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // 🔥 Não interceptar requests de extensões, chrome-extension, ou schemes não suportados
  if (url.protocol === 'chrome-extension:' || 
      url.protocol === 'chrome:' ||
      url.protocol === 'moz-extension:' ||
      url.protocol === 'safari-extension:' ||
      url.protocol === 'edge-extension:' ||
      !url.protocol.startsWith('http')) {
    // Deixa passar direto para a rede sem interceptação
    return;
  }

  // Não interceptar requests de API, Supabase, ou métodos não-GET
  if (url.origin.includes('supabase.co') || 
      url.origin.includes('openstreetmap.org') ||
      request.method !== 'GET' || 
      request.headers.get('accept')?.includes('application/json')) {
    // Deixa passar direto para a rede sem interceptação
    return;
  }

  // Strategy 1: Para navegações (páginas HTML)
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(response => {
          // 🔥 Verificar se o request pode ser cacheado
          const requestUrl = new URL(request.url);
          const canCache = requestUrl.protocol.startsWith('http') && 
                          !requestUrl.protocol.includes('extension') &&
                          response.status === 200 && 
                          response.type === 'basic';
          
          // Só cachear se a resposta for válida e clonável E se o request pode ser cacheado
          if (canCache) {
            try {
              // Clonar ANTES de usar a response
              const responseToCache = response.clone();
              caches.open(CACHE_NAME).then(cache => {
                cache.put(request, responseToCache).catch(err => {
                  // Silenciar erros de cache para recursos não suportados
                  if (!err.message.includes('unsupported') && !err.message.includes('chrome-extension')) {
                    console.error('Cache put error for navigation:', err);
                  }
                });
              });
            } catch (cloneError) {
              // Silenciar erros de clone para recursos não suportados
              if (!cloneError.message.includes('unsupported') && !cloneError.message.includes('chrome-extension')) {
                console.error('Cache clone error for navigation:', cloneError);
              }
            }
          }
          return response;
        })
        .catch(async () => {
          // Fallback para cache ou página offline
          const cached = await caches.match(request);
          return cached || caches.match('/index.html');
        })
    );
    return;
  }

  // Strategy 2: Para assets estáticos (CSS, JS, imagens)
  event.respondWith(
    caches.match(request)
      .then(cachedResponse => {
        // Se já tem no cache, retornar imediatamente
        if (cachedResponse) {
          return cachedResponse;
        }

        // Buscar da rede e cachear
        return fetch(request)
          .then(networkResponse => {
            // 🔥 Verificar se o request pode ser cacheado (não pode ser chrome-extension, etc)
            const requestUrl = new URL(request.url);
            const canCache = requestUrl.protocol.startsWith('http') && 
                            !requestUrl.protocol.includes('extension') &&
                            networkResponse.status === 200 && 
                            networkResponse.type === 'basic';
            
            // Só cachear se a resposta for válida e clonável E se o request pode ser cacheado
            if (canCache) {
              try {
                // Clonar ANTES de retornar a response
                const responseToCache = networkResponse.clone();
                caches.open(CACHE_NAME).then(cache => {
                  cache.put(request, responseToCache).catch(err => {
                    // Silenciar erros de cache para recursos não suportados (extensions, etc)
                    if (!err.message.includes('unsupported') && !err.message.includes('chrome-extension')) {
                      console.error('Cache put error for asset:', err);
                    }
                  });
                });
              } catch (cloneError) {
                // Silenciar erros de clone para recursos não suportados
                if (!cloneError.message.includes('unsupported') && !cloneError.message.includes('chrome-extension')) {
                  console.error('Cache clone error for asset:', cloneError);
                }
              }
            }
            return networkResponse;
          })
          .catch(() => {
            // Se falhar na rede e não tiver cache, retornar erro
            return cachedResponse || new Response('Network error', { status: 408 });
          });
      })
  );
});

// ========== PUSH NOTIFICATIONS ========== //

// Handle incoming push notifications
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
      icon: '/logo.png',
      badge: '/logo.png'
    };
  }

  const options = {
    body: data.body || 'Nova notificação disponível',
    icon: data.icon || '/logo.png',
    badge: data.badge || '/logo.png',
    image: data.image,
    data: {
      url: data.url || '/',
      notificationId: data.notificationId,
      type: data.type
    },
    actions: data.actions || [],
    requireInteraction: data.requireInteraction || false,
    tag: data.tag || 'default',
    vibrate: [100, 50, 100],
    timestamp: data.timestamp || Date.now(),
    // Cor de fundo/tema da notificação (rgb(74, 33, 33) em hexadecimal)
    color: data.color || '#4a2121'
  };

  event.waitUntil(
    self.registration.showNotification(data.title || 'Trombone Cidadão', options)
      .catch(error => console.error('Service Worker: Error showing notification', error))
  );
});

// Handle notification clicks e ações
self.addEventListener('notificationclick', function(event) {
  event.notification.close();

  const action = event.action;
  const data = event.notification.data || {};
  const urlToOpen = data.url || '/';
  const notificationId = data.notificationId;
  const type = data.type;

  // Handler de ações personalizadas
  if (action === 'approve' && data.resolutionId) {
    // Aprovar resolução
    event.waitUntil(
      fetch(`/api/resolutions/${data.resolutionId}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      }).then(() => {
        return clients.openWindow(urlToOpen);
      })
    );
  } else if (action === 'reject' && data.resolutionId) {
    // Rejeitar resolução
    event.waitUntil(
      fetch(`/api/resolutions/${data.resolutionId}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      }).then(() => {
        return clients.openWindow(urlToOpen);
      })
    );
  } else if (action === 'moderate') {
    // Abrir página de moderação
    event.waitUntil(
      clients.openWindow('/admin/moderation')
    );
  } else if (action === 'close' || action === 'dismiss') {
    // Apenas fechar notificação
    event.notification.close();
  } else {
    // Ação padrão: abrir URL (view, open, ou nenhuma ação)
  event.waitUntil(
    clients.matchAll({ 
      type: 'window',
      includeUncontrolled: true 
    }).then(windowClients => {
      // Check if there's already a window open with the target URL
      for (let client of windowClients) {
        const clientUrl = new URL(client.url);
        const targetUrl = new URL(urlToOpen, self.location.origin);
        
        if (clientUrl.pathname === targetUrl.pathname && 'focus' in client) {
          // Mark notification as read if we have an ID
          if (notificationId) {
            self.clients.get(client.id).then(activeClient => {
              activeClient.postMessage({
                type: 'MARK_NOTIFICATION_READ',
                notificationId: notificationId
              });
            });
          }
          
          return client.focus();
        }
      }
      
      // If no window found, open a new one
      if (clients.openWindow) {
        return clients.openWindow(urlToOpen).then(newClient => {
          if (notificationId && newClient) {
            setTimeout(() => {
              newClient.postMessage({
                type: 'MARK_NOTIFICATION_READ',
                notificationId: notificationId
              });
            }, 1000);
          }
        });
      }
    }).catch(error => {
      console.error('Service Worker: Error handling notification click', error);
    })
  );
  }
});

// Handle push subscription changes
self.addEventListener('pushsubscriptionchange', function(event) {
  event.waitUntil(
    self.registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: event.oldSubscription ? event.oldSubscription.options.applicationServerKey : undefined
    }).then(function(subscription) {
      // Send new subscription to server
      return fetch('/api/push/subscription', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'X-SW-Registration': 'true'
        },
        body: JSON.stringify({
          oldSubscription: event.oldSubscription,
          newSubscription: subscription,
          action: 'subscription-change'
        })
      }).then(response => {
        if (!response.ok) {
          throw new Error('Failed to update subscription on server');
        }
      });
    }).catch(error => {
      console.error('Service Worker: Error during push subscription change', error);
    })
  );
});

// Handle messages from the main thread
self.addEventListener('message', function(event) {
  const { type, notification, payload } = event.data;
  
  switch (type) {
    case 'SKIP_WAITING':
      self.skipWaiting();
      break;
      
    case 'GET_SUBSCRIPTION':
      self.registration.pushManager.getSubscription()
        .then(subscription => {
          if (event.ports && event.ports[0]) {
            event.ports[0].postMessage({
              type: 'SUBSCRIPTION_INFO',
              subscription: subscription
            });
          }
        });
      break;
      
    case 'TEST_NOTIFICATION':
      self.registration.showNotification('Teste do Trombone Cidadão', {
        body: 'Esta é uma notificação de teste do Service Worker',
        icon: '/logo.png',
        badge: '/logo.png',
        color: '#4a2121', // Cor de fundo rgb(74, 33, 33)
        vibrate: [100, 50, 100],
        data: {
          url: '/',
          test: true
        }
      });
      break;

    case 'CLEAR_CACHE':
      caches.delete(CACHE_NAME);
      break;

    case 'SHOW_PUSH_NOTIFICATION':
      if (notification) {
        self.registration.showNotification(
          notification.title,
          {
            body: notification.body,
            icon: notification.icon,
            badge: notification.badge,
            color: notification.color || '#4a2121', // Cor de fundo rgb(74, 33, 33)
            data: notification.data,
            vibrate: notification.vibrate,
            tag: notification.tag,
            requireInteraction: false,
            actions: [
              {
                action: 'open',
                title: 'Abrir'
              },
              {
                action: 'close',
                title: 'Fechar'
              }
            ]
          }
        ).catch(error => {
          console.error('Service Worker: Erro ao exibir notificação:', error);
        });
      }
      break;
  }
});

// Background sync for offline actions
self.addEventListener('sync', function(event) {
  if (event.tag === 'background-sync') {
    event.waitUntil(doBackgroundSync());
  }
});
async function doBackgroundSync() {
  try {
    // Implementar sincronização de dados offline aqui
  } catch (error) {
    console.error('Service Worker: Background sync failed', error);
  }
}
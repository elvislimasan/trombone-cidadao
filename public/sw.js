/* eslint-disable no-restricted-globals */
const CACHE_NAME = 'trombone-cidadao-cache-v4';
const urlsToCache = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png',
];

// Install: Open cache and add static assets.
self.addEventListener('install', event => {
  console.log('Service Worker: Installing...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Opened cache and caching static assets');
        return cache.addAll(urlsToCache).catch(error => {
          console.log('Cache addAll error:', error);
        });
      })
      .then(() => {
        console.log('Service Worker: Skip waiting');
        return self.skipWaiting();
      })
  );
});

// Activate: Clean up old caches.
self.addEventListener('activate', event => {
  console.log('Service Worker: Activating...');
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cache => {
          if (cache !== CACHE_NAME) {
            console.log('Service Worker: clearing old cache', cache);
            return caches.delete(cache);
          }
          return null;
        })
      );
    }).then(() => {
      console.log('Service Worker: Claiming clients');
      return self.clients.claim();
    })
  );
});

// Fetch: Apply caching strategies.
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Não cachear requests de dados ou API
  if (url.origin.includes('supabase.co') || 
      request.method !== 'GET' || 
      request.headers.get('accept')?.includes('json')) {
    return; // Deixa passar para a rede
  }

  // Strategy 1: Para navegações (páginas)
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(response => {
          // Só cachear se a resposta for válida
          if (response.status === 200) {
            const responseToCache = response.clone();
            caches.open(CACHE_NAME).then(cache => {
              cache.put(request, responseToCache).catch(err => {
                console.log('Cache put error for navigation:', err);
              });
            });
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
        // Sempre buscar da rede para atualizar o cache
        const fetchPromise = fetch(request)
          .then(networkResponse => {
            // Só cachear se a resposta for válida
            if (networkResponse.status === 200) {
              const responseToCache = networkResponse.clone();
              caches.open(CACHE_NAME).then(cache => {
                cache.put(request, responseToCache).catch(err => {
                  console.log('Cache put error for asset:', err);
                });
              });
            }
            return networkResponse;
          })
          .catch(error => {
            console.log('Network failed, using cache:', error);
            return cachedResponse;
          });

        // Retornar cache imediatamente se disponível, senão aguardar rede
        return cachedResponse || fetchPromise;
      })
  );
});

// ========== PUSH NOTIFICATIONS ========== //

// Handle incoming push notifications
self.addEventListener('push', function(event) {
  console.log('Service Worker: Push event received', event);
  
  if (!event.data) {
    console.log('Service Worker: Push event but no data');
    return;
  }

  let data;
  try {
    data = event.data.json();
    console.log('Service Worker: Push data parsed', data);
  } catch (error) {
    console.log('Service Worker: Push data is not JSON, using text');
    data = {
      title: 'Trombone Cidadão',
      body: event.data.text() || 'Nova notificação',
      icon: '/icons/icon-192x192.png',
      badge: '/icons/badge-72x72.png'
    };
  }

  const options = {
    body: data.body || 'Nova notificação disponível',
    icon: data.icon || '/icons/icon-192x192.png',
    badge: data.badge || '/icons/badge-72x72.png',
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
    timestamp: data.timestamp || Date.now()
  };

  console.log('Service Worker: Showing notification with options', options);

  event.waitUntil(
    self.registration.showNotification(data.title || 'Trombone Cidadão', options)
      .then(() => console.log('Service Worker: Notification shown successfully'))
      .catch(error => console.error('Service Worker: Error showing notification', error))
  );
});

// Handle notification clicks
self.addEventListener('notificationclick', function(event) {
  console.log('Service Worker: Notification click received', event.notification);
  
  event.notification.close();

  const urlToOpen = event.notification.data?.url || '/';
  const notificationId = event.notification.data?.notificationId;

  event.waitUntil(
    clients.matchAll({ 
      type: 'window',
      includeUncontrolled: true 
    }).then(windowClients => {
      console.log('Service Worker: Found window clients', windowClients.length);
      
      // Check if there's already a window open with the target URL
      for (let client of windowClients) {
        const clientUrl = new URL(client.url);
        const targetUrl = new URL(urlToOpen, self.location.origin);
        
        if (clientUrl.pathname === targetUrl.pathname && 'focus' in client) {
          console.log('Service Worker: Focusing existing window');
          
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
        console.log('Service Worker: Opening new window to', urlToOpen);
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
});

// Handle push subscription changes
self.addEventListener('pushsubscriptionchange', function(event) {
  console.log('Service Worker: Push subscription changed', event);
  
  event.waitUntil(
    self.registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: event.oldSubscription ? event.oldSubscription.options.applicationServerKey : undefined
    }).then(function(subscription) {
      console.log('Service Worker: New subscription obtained', subscription);
      
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
        console.log('Service Worker: Subscription updated on server');
      });
    }).catch(error => {
      console.error('Service Worker: Error during push subscription change', error);
    })
  );
});

// Handle messages from the main thread
self.addEventListener('message', function(event) {
  console.log('Service Worker: Message received', event.data);
  
  const { type, payload } = event.data;
  
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
        icon: '/icons/icon-192x192.png',
        badge: '/icons/badge-72x72.png',
        vibrate: [100, 50, 100],
        data: {
          url: '/',
          test: true
        }
      });
      break;

    case 'CLEAR_CACHE':
      caches.delete(CACHE_NAME).then(() => {
        console.log('Cache cleared');
      });
      break;
      
    default:
      console.log('Service Worker: Unknown message type', type);
  }
});

// Background sync for offline actions
self.addEventListener('sync', function(event) {
  console.log('Service Worker: Background sync event', event.tag);
  
  if (event.tag === 'background-sync') {
    event.waitUntil(doBackgroundSync());
  }
});

async function doBackgroundSync() {
  try {
    // Implementar sincronização de dados offline aqui
    console.log('Service Worker: Background sync completed');
  } catch (error) {
    console.error('Service Worker: Background sync failed', error);
  }
}
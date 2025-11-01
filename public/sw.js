/* eslint-disable no-restricted-globals */
const CACHE_NAME = 'trombone-cidadao-cache-v2'; // Incremented version to force update
const urlsToCache = [
  '/',
  '/index.html',
  // Other static assets can be added here
];

// Install: Open cache and add static assets.
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Opened cache and caching static assets');
        return cache.addAll(urlsToCache);
      })
      .then(() => self.skipWaiting()) // Force the waiting service worker to become the active service worker.
  );
});

// Activate: Clean up old caches.
self.addEventListener('activate', event => {
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
    }).then(() => self.clients.claim()) // Become the service worker for clients that are already open.
  );
});


// Fetch: Apply caching strategies.
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Strategy 1: For API calls (e.g., to Supabase), use Network First.
  // This ensures data is always fresh. If network fails, try cache.
  if (url.origin.includes('supabase.co')) {
    event.respondWith(
      fetch(request)
      .catch(() => {
        console.warn(`[SW] Network request for ${request.url} failed, trying cache.`);
        return caches.match(request);
      })
    );
    return;
  }

  // Strategy 2: For navigations (loading a page), use Network-First, fallback to cache, then to offline page if needed.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(response => {
           const responseToCache = response.clone();
           caches.open(CACHE_NAME).then(cache => cache.put(request, responseToCache));
           return response;
        })
        .catch(() => caches.match(request).then(response => response || caches.match('/index.html')))
    );
    return;
  }
  
  // Strategy 3: Stale-While-Revalidate for static assets (CSS, JS, fonts, etc.).
  // Serve from cache for speed, but update in the background.
  event.respondWith(
    caches.match(request)
      .then(cachedResponse => {
        const fetchPromise = fetch(request).then(networkResponse => {
          caches.open(CACHE_NAME).then(cache => {
            cache.put(request, networkResponse.clone());
          });
          return networkResponse;
        });
        
        // Return cached response immediately if available, otherwise wait for network
        return cachedResponse || fetchPromise;
      })
  );
});
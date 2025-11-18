import { useCallback } from 'react';

export const useCache = () => {
  const clearCache = useCallback(async () => {
    if ('caches' in window) {
      try {
        const cacheNames = await caches.keys();
        await Promise.all(
          cacheNames.map(cacheName => caches.delete(cacheName))
        );
        return true;
      } catch (error) {
        console.error('Error clearing cache:', error);
        return false;
      }
    }
    return false;
  }, []);

  const getCacheStatus = useCallback(async () => {
    if (!('caches' in window)) {
      return { supported: false };
    }

    try {
      const cacheNames = await caches.keys();
      const cacheDetails = await Promise.all(
        cacheNames.map(async (name) => {
          const cache = await caches.open(name);
          const requests = await cache.keys();
          return {
            name,
            size: requests.length,
            urls: requests.map(req => req.url)
          };
        })
      );

      return {
        supported: true,
        caches: cacheDetails
      };
    } catch (error) {
      console.error('Error getting cache status:', error);
      return { supported: true, error: error.message };
    }
  }, []);

  const sendMessageToSW = useCallback(async (message) => {
    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage(message);
      return true;
    }
    return false;
  }, []);

  return {
    clearCache,
    getCacheStatus,
    sendMessageToSW
  };
};
import { useEffect, useRef, useCallback } from 'react';

export function useInfiniteScroll(onLoadMore, { threshold = 0.1, enabled = true } = {}) {
  const sentinelRef = useRef(null);

  const handleIntersection = useCallback(
    (entries) => {
      const [entry] = entries;
      if (entry.isIntersecting && enabled) {
        onLoadMore();
      }
    },
    [onLoadMore, enabled]
  );

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(handleIntersection, { threshold });
    observer.observe(el);
    return () => observer.disconnect();
  }, [handleIntersection, threshold]);

  return sentinelRef;
}

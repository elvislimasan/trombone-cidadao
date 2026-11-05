import { useState, useEffect } from 'react';
import { getCachedVideoThumbnail, getVideoThumbnail } from '@/lib/videoThumbnail';

export function useVideoThumbnail(videoUrl, { enabled = true, attempt = 0 } = {}) {
  const [result, setResult] = useState(null);

  useEffect(() => {
    if (!enabled || !videoUrl) return;
    let canceled = false;
    setResult(null);
    getVideoThumbnail(videoUrl)
      .then(thumbnailUrl => { if (!canceled) setResult({ videoUrl, attempt, thumbnailUrl, failed: false }); })
      .catch(() => { if (!canceled) setResult({ videoUrl, attempt, thumbnailUrl: null, failed: true }); });
    return () => { canceled = true; };
  }, [videoUrl, enabled, attempt]);

  // Não reutilizar a imagem/erro do vídeo anterior durante troca de relato.
  const current = result?.videoUrl === videoUrl && result?.attempt === attempt ? result : null;
  return {
    thumbnailUrl: (videoUrl && getCachedVideoThumbnail(videoUrl)) || current?.thumbnailUrl || null,
    failed: Boolean(enabled && current?.failed),
  };
}

export default useVideoThumbnail;

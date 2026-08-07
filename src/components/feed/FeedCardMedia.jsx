import React, { useState, useEffect, useRef } from 'react';
import Icon, { categoryIconName } from '@/design-system/icons';
import SignalChip from '@/design-system/primitives/SignalChip';
import StatusBadge from '@/design-system/primitives/StatusBadge';
import { useVideoThumbnail } from '@/hooks/useVideoThumbnail';

const MAX_THUMBNAIL_RETRIES = 3;

const PlayBadge = () => (
  <div className="absolute bottom-2 right-2 w-9 h-9 rounded-full bg-black/50 border border-white/10 flex items-center justify-center">
    <svg viewBox="0 0 24 24" width="16" height="16" fill="white" aria-hidden="true">
      <path d="M8 5.5v13l11-6.5-11-6.5Z" />
    </svg>
  </div>
);

// square: miniatura quadrada do card horizontal. Nesse modo o status e o chip
// ficam fora da midia (ao lado do titulo), entao nao sao renderizados aqui.
const FeedCardMedia = ({ report, index = 0, isInView = false, status, chips = [], square = false, onClick }) => {
  const [imgSrc, setImgSrc] = useState(report.coverImage || null);
  const retryRef = useRef(0);
  const retryTimerRef = useRef(null);

  useEffect(() => {
    setImgSrc(report.coverImage || null);
    retryRef.current = 0;
    if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
  }, [report.coverImage]);

  useEffect(() => () => {
    if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
  }, []);

  const wantsThumbnail = !report.coverImage && !!report.coverVideo && isInView && index <= 12;

  // Retry com backoff para geracao de thumbnail de video: o hook useVideoThumbnail
  // (Task 12) nao faz retry por si so, e responsabilidade do consumidor.
  // Ate 3 tentativas com espera de 900ms * numero da tentativa antes de desistir
  // e cair no fallback de <video>. thumbnailRetry entra na chave que reativa o
  // hook (via videoUrl com sufixo) para forcar uma nova tentativa de enqueue.
  const [thumbnailRetry, setThumbnailRetry] = useState(0);

  useEffect(() => {
    setThumbnailRetry(0);
  }, [report.coverVideo]);

  const thumbnailRetryTimerRef = useRef(null);
  useEffect(() => () => {
    if (thumbnailRetryTimerRef.current) clearTimeout(thumbnailRetryTimerRef.current);
  }, []);

  // attempt reenfileira de fato o video a cada tentativa; sem isso o retry apenas
  // atrasaria o fallback sem nunca tentar de novo.
  const { thumbnailUrl, failed } = useVideoThumbnail(report.coverVideo, {
    enabled: wantsThumbnail,
    attempt: thumbnailRetry,
  });

  useEffect(() => {
    if (!wantsThumbnail || !failed || thumbnailRetry >= MAX_THUMBNAIL_RETRIES) return undefined;
    const delay = 900 * (thumbnailRetry + 1);
    thumbnailRetryTimerRef.current = setTimeout(() => {
      setThumbnailRetry((n) => n + 1);
    }, delay);
    return () => {
      if (thumbnailRetryTimerRef.current) clearTimeout(thumbnailRetryTimerRef.current);
    };
    // thumbnailRetry precisa estar nas deps para reagendar a cada nova tentativa
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [failed, wantsThumbnail, thumbnailRetry]);

  const src = imgSrc || thumbnailUrl;
  const exhaustedRetries = failed && thumbnailRetry >= MAX_THUMBNAIL_RETRIES;
  const showVideoElement = !src && exhaustedRetries && !!report.coverVideo;

  const chip = chips[0];

  return (
    <button
      onClick={onClick}
      className={`block text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-brand ${
        square ? 'h-full w-full' : 'w-full'
      }`}
      aria-label={`Ver detalhes: ${report.title}`}
    >
      {/* aspect-ratio fixo em todos os ramos: evita layout shift */}
      <div
        className={`relative w-full bg-surface-sunken overflow-hidden ${
          square ? 'h-full aspect-square rounded-xl' : 'aspect-[4/3]'
        }`}
      >
        {src ? (
          <img
            src={src}
            alt={report.title}
            className="w-full h-full object-cover"
            loading={index < 3 ? 'eager' : 'lazy'}
            fetchpriority={index === 0 ? 'high' : 'auto'}
            decoding="async"
            onError={() => {
              if (!imgSrc) return;
              if (imgSrc.startsWith('blob:')) return;
              if (retryRef.current >= 4) return;
              retryRef.current += 1;
              const delay = 650 * retryRef.current;
              if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
              retryTimerRef.current = setTimeout(() => {
                setImgSrc(`${imgSrc.split('?')[0]}?v=${Date.now()}`);
              }, delay);
            }}
          />
        ) : showVideoElement ? (
          <video
            src={report.coverVideo}
            muted
            playsInline
            preload="metadata"
            className="w-full h-full object-cover"
            onLoadedMetadata={(e) => {
              try { e.currentTarget.currentTime = 0.15; } catch {}
            }}
            onCanPlay={(e) => {
              try { e.currentTarget.pause(); } catch {}
            }}
          />
        ) : (
          <div className="w-full h-full bg-surface-sunken flex items-center justify-center text-content-tertiary">
            <Icon name={categoryIconName(report.category_id)} size={56} strokeWidth={1.25} />
          </div>
        )}

        {!report.coverImage && report.coverVideo && <PlayBadge />}

        {/* No modo quadrado o status e o sinal vivem ao lado do titulo. */}
        {!square && status && (
          <div className="absolute top-2 left-2">
            <StatusBadge status={status} />
          </div>
        )}

        {!square && chip && (
          <div className="absolute top-2 right-2">
            <SignalChip variant={chip.variant} label={chip.label} />
          </div>
        )}
      </div>
    </button>
  );
};

export default React.memo(FeedCardMedia);

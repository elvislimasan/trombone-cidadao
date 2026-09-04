import React, { useState, useEffect, useRef } from 'react';
import Icon, { categoryIconName } from '@/design-system/icons';
import SignalChip from '@/design-system/primitives/SignalChip';
import StatusBadge from '@/design-system/primitives/StatusBadge';
import { useVideoThumbnail } from '@/hooks/useVideoThumbnail';

const MAX_THUMBNAIL_RETRIES = 3;

// O som e preferencia do FEED inteiro, nao de cada card: ao ativar num video,
// os proximos ja vem com som. Vive fora do React para valer tambem nos cards
// montados depois.
const FEED_AUDIO_EVENT = 'feed-video-audio-pref';
let feedAudioEnabled = false;

// Proporcao do video limitada entre 4:5 (mais alto) e 1.91:1 (mais largo),
// como no feed do Instagram: respeita o formato real sem deixar o card virar
// tela cheia. Video vertical 9:16 num 4:3 fixo ficava muito cortado.
const MIN_VIDEO_ASPECT = 0.8;
const MAX_VIDEO_ASPECT = 1.91;
const DEFAULT_VIDEO_ASPECT = 4 / 5;

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

  // ── Autoplay do video (estilo Instagram) ──
  // So no card grande: na miniatura quadrada do feed horizontal o video fica
  // pequeno demais para tocar, e varios players simultaneos pesariam.
  const videoRef = useRef(null);
  const wantsAutoplay = !square && !!report.coverVideo;
  const [videoMuted, setVideoMuted] = useState(!feedAudioEnabled);
  const [videoAspect, setVideoAspect] = useState(DEFAULT_VIDEO_ASPECT);

  const handleVideoMetadata = (e) => {
    const v = e.currentTarget;
    if (!v?.videoWidth || !v?.videoHeight) return;
    const raw = v.videoWidth / v.videoHeight;
    setVideoAspect(Math.min(MAX_VIDEO_ASPECT, Math.max(MIN_VIDEO_ASPECT, raw)));
  };

  useEffect(() => {
    if (!wantsAutoplay) return undefined;
    const el = videoRef.current;
    if (!el) return undefined;
    const obs = new IntersectionObserver(
      ([entry]) => {
        // O mudo NAO e resetado aqui: o som e preferencia do feed.
        if (entry?.isIntersecting) {
          // Pausa os outros videos antes de tocar: em telas altas dois cards
          // passam do threshold juntos e tocariam dois audios ao mesmo tempo.
          document.querySelectorAll('video[data-feed-video]').forEach((other) => {
            if (other !== el) other.pause?.();
          });
          el.play?.().catch(() => {});
        } else {
          el.pause?.();
        }
      },
      { threshold: 0.6 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [wantsAutoplay, report.coverVideo]);

  // A preferencia de som mudou em algum card: todos acompanham.
  useEffect(() => {
    const onAudioPrefChange = (e) => setVideoMuted(!e.detail);
    window.addEventListener(FEED_AUDIO_EVENT, onAudioPrefChange);
    return () => window.removeEventListener(FEED_AUDIO_EVENT, onAudioPrefChange);
  }, []);

  const toggleAudio = (e) => {
    e.stopPropagation();
    const audioOn = videoMuted; // vai ligar o som?
    feedAudioEnabled = audioOn;
    setVideoMuted(!audioOn);
    window.dispatchEvent(new CustomEvent(FEED_AUDIO_EVENT, { detail: audioOn }));
    // O gesto do usuario libera o autoplay com audio.
    if (audioOn) videoRef.current?.play?.().catch(() => {});
  };

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

  // Video com autoplay: respeita a proporcao real. Nos demais casos o
  // aspect-ratio e fixo, o que evita layout shift.
  const mediaStyle = wantsAutoplay ? { aspectRatio: videoAspect } : undefined;
  const mediaAspectClass = wantsAutoplay
    ? ''
    : square
      ? 'h-full aspect-square rounded-xl'
      // 4:5 (retrato) em vez de 4:3: a maioria das fotos de bronca vem do
      // celular, na vertical, e o formato mais largo cortava demais.
      : 'aspect-[4/5]';

  return (
    // div + role=button (nao <button>) porque o controle de som e um <button>
    // aninhado, o que seria HTML invalido dentro de <button>.
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick?.();
        }
      }}
      className={`block text-left cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-brand rounded-xl ${
        square ? 'h-full w-full' : 'w-full'
      }`}
      aria-label={`Ver detalhes: ${report.title}`}
    >
      {/* NO DESKTOP A CAPA TEM TETO DE ALTURA
          4:5 é a proporção certa no celular, onde a coluna tem 360px e a foto
          sai vertical do bolso da pessoa. Na mesma regra, um cartão de 880px de
          largura produz uma capa de 1100px de altura: uma bronca por tela, e a
          página parece vazia justamente por causa da foto grande. 30rem é o
          bastante para reconhecer o problema — e a foto inteira, sem corte,
          continua a um clique, na tela da bronca. */}
      <div
        className={`relative w-full overflow-hidden ${
          wantsAutoplay ? 'bg-black' : 'bg-surface-sunken'
        } ${mediaAspectClass} ${square ? '' : 'lg:max-h-[30rem]'}`}
        style={mediaStyle}
      >
        {wantsAutoplay ? (
          <>
            <video
              ref={videoRef}
              data-feed-video=""
              src={report.coverVideo}
              // A thumbnail extraida (ou a capa) vira poster: evita o retangulo
              // cinza enquanto o video carrega.
              poster={src || undefined}
              muted={videoMuted}
              loop
              playsInline
              preload="metadata"
              onLoadedMetadata={handleVideoMetadata}
              className="w-full h-full object-cover"
            />
            <button
              type="button"
              aria-label={videoMuted ? 'Ativar som' : 'Desativar som'}
              onClick={toggleAudio}
              className="absolute bottom-2 right-2 w-9 h-9 rounded-full bg-black/50 border border-white/10 text-white flex items-center justify-center hover:bg-black/70 transition-colors"
            >
              <Icon name={videoMuted ? 'soundoff' : 'soundon'} size={16} />
            </button>
          </>
        ) : src ? (
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

        {/* Nao no video com autoplay: la o canto tem o controle de som. */}
        {!wantsAutoplay && !report.coverImage && report.coverVideo && <PlayBadge />}

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
    </div>
  );
};

export default React.memo(FeedCardMedia);

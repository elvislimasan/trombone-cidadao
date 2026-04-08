import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MapPin, Play, Repeat } from 'lucide-react';
import { motion } from 'framer-motion';
import { Capacitor } from '@capacitor/core';
import { Share } from '@capacitor/share';
import EngagementBar from '@/components/EngagementBar';
import TimeAgo from '@/components/TimeAgo';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useToast } from '@/components/ui/use-toast';

const videoThumbCache = new Map();
const videoThumbPending = new Map();

const trimVideoThumbCache = (max = 40) => {
  while (videoThumbCache.size > max) {
    const firstKey = videoThumbCache.keys().next().value;
    const url = videoThumbCache.get(firstKey);
    videoThumbCache.delete(firstKey);
    if (typeof url === 'string' && url.startsWith('blob:')) {
      try {
        URL.revokeObjectURL(url);
      } catch {}
    }
  }
};

const waitForEvent = (el, event, timeoutMs = 8000) =>
  new Promise((resolve, reject) => {
    const t = setTimeout(() => {
      cleanup();
      reject(new Error(`timeout:${event}`));
    }, timeoutMs);
    const onOk = () => {
      cleanup();
      resolve();
    };
    const onErr = () => {
      cleanup();
      reject(new Error(`error:${event}`));
    };
    const cleanup = () => {
      clearTimeout(t);
      el.removeEventListener(event, onOk);
      el.removeEventListener('error', onErr);
    };
    el.addEventListener(event, onOk, { once: true });
    el.addEventListener('error', onErr, { once: true });
  });

const getVideoThumbnailUrl = async (videoUrl) => {
  if (!videoUrl) return null;
  if (videoThumbCache.has(videoUrl)) return videoThumbCache.get(videoUrl);
  if (videoThumbPending.has(videoUrl)) return videoThumbPending.get(videoUrl);

  const p = (async () => {
    const video = document.createElement('video');
    const host = document.createElement('div');
    host.style.position = 'fixed';
    host.style.left = '-99999px';
    host.style.top = '0';
    host.style.width = '1px';
    host.style.height = '1px';
    host.style.overflow = 'hidden';
    host.appendChild(video);
    document.body.appendChild(host);

    try {
      video.crossOrigin = 'anonymous';
      video.muted = true;
      video.setAttribute('muted', '');
      video.playsInline = true;
      video.setAttribute('playsinline', '');
      video.preload = 'metadata';
      video.src = videoUrl;
      try {
        video.load?.();
      } catch {}

      await waitForEvent(video, 'loadedmetadata', 8000);
      try {
        await waitForEvent(video, 'loadeddata', 8000);
      } catch {}

      const seekTo = Math.min(
        0.2,
        Number.isFinite(video.duration) ? Math.max(0, video.duration - 0.05) : 0.2
      );
      try {
        video.currentTime = seekTo;
      } catch {}
      await Promise.race([waitForEvent(video, 'seeked', 8000), waitForEvent(video, 'timeupdate', 8000)]);

      const w = Math.max(1, video.videoWidth || 0);
      const h = Math.max(1, video.videoHeight || 0);
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      try {
        ctx.drawImage(video, 0, 0, w, h);
      } catch (e) {
        throw e;
      }

      const blobUrl = await new Promise((resolve, reject) => {
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(new Error('thumbnail:empty'));
              return;
            }
            resolve(URL.createObjectURL(blob));
          },
          'image/jpeg',
          0.82
        );
      });

      videoThumbCache.set(videoUrl, blobUrl);
      trimVideoThumbCache();
      return blobUrl;
    } finally {
      try {
        video.removeAttribute('src');
        video.load?.();
      } catch {}
      try {
        host.remove();
      } catch {}
    }
  })();

  videoThumbPending.set(videoUrl, p);
  try {
    return await p;
  } finally {
    videoThumbPending.delete(videoUrl);
  }
};

const STATUS_CONFIG = {
  pending: {
    label: 'Pendente',
    className: 'bg-orange-100 text-orange-700 border-orange-200',
  },
  'in-progress': {
    label: 'Em Andamento',
    className: 'bg-blue-100 text-blue-700 border-blue-200',
  },
  resolved: {
    label: 'Resolvido',
    className: 'bg-green-100 text-green-700 border-green-200',
  },
  duplicate: {
    label: 'Duplicada',
    className: 'bg-gray-100 text-gray-600 border-gray-200',
  },
};

const AuthorAvatar = ({ name, avatarUrl, sizeClassName = 'w-9 h-9', textClassName = 'text-sm' }) => {
  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt={name}
        className={`${sizeClassName} rounded-full object-cover flex-shrink-0 bg-muted`}
        loading="lazy"
      />
    );
  }
  const initial = (name || 'C')[0].toUpperCase();
  return (
    <div className={`${sizeClassName} rounded-full bg-primary/10 text-primary flex items-center justify-center ${textClassName} font-bold flex-shrink-0 select-none`}>
      {initial}
    </div>
  );
};

const FeedCard = ({ report, onToggleUpvote, isNew = false, index = 0 }) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const cardRef = useRef(null);
  const [isInView, setIsInView] = useState(false);

  const [imgSrc, setImgSrc] = useState(report.coverImage || null);
  const [useVideoCover, setUseVideoCover] = useState(false);
  const imgRetryRef = useRef(0);
  const imgRetryTimerRef = useRef(null);

  useEffect(() => {
    setImgSrc(report.coverImage || null);
    setUseVideoCover(false);
    imgRetryRef.current = 0;
    if (imgRetryTimerRef.current) clearTimeout(imgRetryTimerRef.current);
  }, [report.coverImage]);

  useEffect(() => {
    return () => {
      if (imgRetryTimerRef.current) clearTimeout(imgRetryTimerRef.current);
    };
  }, []);

  useEffect(() => {
    const el = cardRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (entry?.isIntersecting) {
          setIsInView(true);
          obs.disconnect();
        }
      },
      { threshold: 0.15 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    if (imgSrc) return;
    if (!isInView) return;
    if (index > 12) return;
    if (!report.coverVideo) return;
    if (report.coverImage) return;

    let canceled = false;
    let tries = 0;

    const run = async () => {
      try {
        const thumb = await getVideoThumbnailUrl(report.coverVideo);
        if (canceled) return;
        if (thumb) setImgSrc(thumb);
        else setUseVideoCover(true);
      } catch {
        if (canceled) return;
        tries += 1;
        if (tries <= 3) {
          setTimeout(run, 900 * tries);
        } else {
          setUseVideoCover(true);
        }
      }
    };

    run();
    return () => {
      canceled = true;
    };
  }, [imgSrc, index, isInView, report.coverImage, report.coverVideo]);

  const statusCfg = STATUS_CONFIG[report.status] || STATUS_CONFIG.pending;
  const emoji = report.categoryEmoji || '📍';
  const createdAt = useMemo(() => new Date(report.created_at), [report.created_at]);

  const ageDays = useMemo(() => {
    const ms = Date.now() - createdAt.getTime();
    return Math.max(0, Math.floor(ms / (1000 * 60 * 60 * 24)));
  }, [createdAt]);

  const ageHours = useMemo(() => {
    const ms = Date.now() - createdAt.getTime();
    return Math.max(0, Math.floor(ms / (1000 * 60 * 60)));
  }, [createdAt]);

  const signals = useMemo(() => {
    const isResolved = report.status === 'resolved';
    const support = Number(report.upvotes || 0);
    const comments = Number(report.comments_count || 0);
    const score = support * 2 + comments;
    const isFresh = ageHours <= 6;
    const isLighting = report.category_id === 'iluminacao';
    const isOld = ageDays >= 7;
    const isVeryOld = ageDays >= 14;

    const chips = [];

    if (!isResolved && (support >= 30 || score >= 70)) {
      chips.push({
        key: 'exploding',
        label: '🔥 Explodindo agora',
        className: 'bg-red-600 text-white border-red-700',
      });
    } else if (!isResolved && (support >= 12 || score >= 28)) {
      chips.push({
        key: 'rising',
        label: '📈 Subindo',
        className: 'bg-orange-500 text-white border-orange-600',
      });
    } else if (!isResolved && isFresh) {
      chips.push({
        key: 'fresh',
        label: '🟣 Agora',
        className: 'bg-violet-600 text-white border-violet-700',
      });
    }

    if (!isResolved && (report.is_recurrent || isVeryOld || support >= 20)) {
      chips.push({
        key: 'urgent',
        label: '⚠️ Urgente',
        className: 'bg-amber-100 text-amber-900 border-amber-200',
      });
    }

    if (isResolved && ageHours <= 24) {
      chips.push({
        key: 'resolvedToday',
        label: '🟢 Resolvido HOJE',
        className: 'bg-green-600 text-white border-green-700',
      });
    }

    let story = null;
    if (!isResolved && isOld) {
      story = isLighting
        ? `Essa rua está há ${ageDays} dias no escuro.`
        : `Esse problema está há ${ageDays} dias sem solução.`;
    } else if (!isResolved && support >= 30) {
      story = `Mais de ${support} pessoas já apoiaram.`;
    } else if (!isResolved && (support >= 10 || comments >= 5)) {
      story = `${support} apoios e ${comments} comentários — a comunidade está em cima.`;
    }

    let community = null;
    if (support > 0) {
      community = report.user_has_upvoted
        ? `Você e +${Math.max(0, support - 1)} pessoas apoiaram`
        : `${support} pessoas já apoiaram`;
    } else if (comments > 0) {
      community = `${comments} pessoas já comentaram`;
    }

    return { chips, story, community, score };
  }, [ageDays, ageHours, report]);

  const goToReport = useCallback(() => {
    navigate(`/bronca/${report.id}`);
  }, [navigate, report.id]);

  const goToComments = useCallback(() => {
    navigate(`/bronca/${report.id}`);
  }, [navigate, report.id]);

  const handleShare = useCallback(async () => {
    const url = `${window.location.origin}/bronca/${report.id}`;
    try {
      if (Capacitor.isNativePlatform()) {
        await Share.share({
          title: report.title,
          text: `Veja esta bronca: ${report.title}`,
          url,
        });
      } else if (navigator.share) {
        await navigator.share({ title: report.title, url });
      } else {
        await navigator.clipboard.writeText(url);
        toast({ title: 'Link copiado!', description: 'Cole onde quiser compartilhar.' });
      }
    } catch {
      // user cancelled or share not supported – silently ignore
    }
  }, [report.id, report.title, toast]);

  const handleBookmark = useCallback(async () => {
    if (!user) {
      navigate('/login');
      return;
    }
    try {
      if (report.is_favorited) {
        await supabase
          .from('favorite_reports')
          .delete()
          .eq('user_id', user.id)
          .eq('report_id', report.id);
      } else {
        await supabase
          .from('favorite_reports')
          .upsert(
            { user_id: user.id, report_id: report.id },
            { onConflict: 'user_id,report_id' }
          );
      }
      // Optimistic feedback via toast; parent can refresh to get new state
      toast({
        title: report.is_favorited ? 'Removido dos favoritos' : 'Salvo nos favoritos',
        duration: 1500,
      });
    } catch {
      toast({ title: 'Erro ao salvar', variant: 'destructive', duration: 2000 });
    }
  }, [user, report, navigate, toast]);

  return (
    <motion.div
      ref={cardRef}
      initial={{ opacity: 0, y: 12 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.25 }}
      transition={{ duration: 0.28, ease: 'easeOut' }}
      className={`bg-card rounded-xl border shadow-sm overflow-hidden ${
        signals.score >= 70 ? 'border-red-200' : 'border-border'
      } ${isNew ? 'ring-2 ring-primary/25' : ''}`}
    >
      {/* ── Card Header ── */}
      <div className="flex items-start gap-3 p-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-extrabold leading-snug line-clamp-2 text-foreground">
            {report.title}
          </p>
          <div className="flex items-center gap-1.5 mt-1">
            <span className="text-xs text-muted-foreground">
              {emoji} {report.categoryName || report.category_id}
            </span>
            {report.is_recurrent && (
              <>
                <span className="text-muted-foreground">·</span>
                <Repeat size={11} className="text-orange-500 flex-shrink-0" />
              </>
            )}
            <span className="text-muted-foreground">·</span>
            <TimeAgo date={report.created_at} className="text-xs text-muted-foreground" />
          </div>
        </div>

        {/* Status badge */}
        <span
          className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border flex-shrink-0 ${statusCfg.className}`}
        >
          {statusCfg.label}
        </span>
      </div>

      {/* ── Cover image / placeholder ── */}
      <button
        onClick={goToReport}
        className="w-full block text-left focus:outline-none"
        aria-label={`Ver detalhes: ${report.title}`}
      >
        {imgSrc ? (
          <div className="relative w-full aspect-[4/3] bg-muted overflow-hidden">
            <img
              src={imgSrc}
              alt={report.title}
              className="w-full h-full object-cover transition-transform duration-300 hover:scale-105"
              loading={index < 3 ? 'eager' : 'lazy'}
              fetchPriority={index === 0 ? 'high' : 'auto'}
              decoding="async"
              onError={() => {
                if (!imgSrc) return;
                if (imgSrc.startsWith('blob:')) return;
                if (imgRetryRef.current >= 4) return;
                imgRetryRef.current += 1;
                const delay = 650 * imgRetryRef.current;
                if (imgRetryTimerRef.current) clearTimeout(imgRetryTimerRef.current);
                imgRetryTimerRef.current = setTimeout(() => {
                  const base = imgSrc.split('?')[0];
                  setImgSrc(`${base}?v=${Date.now()}`);
                }, delay);
              }}
            />
            {!report.coverImage && report.coverVideo && (
              <div className="absolute bottom-2 right-2 w-9 h-9 rounded-full bg-black/45 border border-white/10 flex items-center justify-center">
                <Play className="w-4 h-4 text-white" />
              </div>
            )}
            {signals.chips.length > 0 && (
              <div className="absolute top-2 left-2 right-2 flex flex-wrap gap-1">
                {signals.chips.slice(0, 2).map((chip, idx) => (
                  <span
                    key={chip.key}
                    className={`text-[10px] font-extrabold tracking-tight px-2 py-1 rounded-full border shadow-sm ${
                      chip.className
                    } ${idx === 0 ? '-rotate-2' : 'rotate-1'}`}
                  >
                    {chip.label}
                  </span>
                ))}
              </div>
            )}
          </div>
        ) : useVideoCover && report.coverVideo ? (
          <div className="relative w-full aspect-[4/3] bg-muted overflow-hidden">
            <video
              src={report.coverVideo}
              muted
              playsInline
              preload="metadata"
              className="w-full h-full object-cover"
              onLoadedMetadata={(e) => {
                const v = e.currentTarget;
                try {
                  v.currentTime = 0.15;
                } catch {}
              }}
              onCanPlay={(e) => {
                const v = e.currentTarget;
                try {
                  v.pause();
                } catch {}
              }}
            />
            <div className="absolute bottom-2 right-2 w-9 h-9 rounded-full bg-black/45 border border-white/10 flex items-center justify-center">
              <Play className="w-4 h-4 text-white" />
            </div>
            {signals.chips.length > 0 && (
              <div className="absolute top-2 left-2 right-2 flex flex-wrap gap-1">
                {signals.chips.slice(0, 2).map((chip, idx) => (
                  <span
                    key={chip.key}
                    className={`text-[10px] font-extrabold tracking-tight px-2 py-1 rounded-full border shadow-sm ${
                      chip.className
                    } ${idx === 0 ? '-rotate-2' : 'rotate-1'}`}
                  >
                    {chip.label}
                  </span>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="relative w-full aspect-[4/3] bg-gradient-to-br from-muted to-muted/40 flex items-center justify-center">
            <span className="text-7xl select-none" aria-hidden="true">
              {emoji}
            </span>
            {signals.chips.length > 0 && (
              <div className="absolute top-2 left-2 right-2 flex flex-wrap gap-1">
                {signals.chips.slice(0, 2).map((chip, idx) => (
                  <span
                    key={chip.key}
                    className={`text-[10px] font-extrabold tracking-tight px-2 py-1 rounded-full border shadow-sm ${
                      chip.className
                    } ${idx === 0 ? '-rotate-2' : 'rotate-1'}`}
                  >
                    {chip.label}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
      </button>

      {/* ── Engagement bar ── */}
      <EngagementBar
        upvotes={report.upvotes}
        commentsCount={report.comments_count}
        isUpvoted={report.user_has_upvoted}
        isFavorited={report.is_favorited}
        onUpvote={() => onToggleUpvote?.(report.id)}
        onComment={goToComments}
        onShare={handleShare}
        onBookmark={handleBookmark}
      />

      {/* ── Text content ── */}
      <button
        onClick={goToReport}
        className="w-full text-left px-4 pb-4 pt-2 focus:outline-none"
      >
        {(report.authorName || report.authorAvatar) && (
          <div className="flex items-center gap-2 mb-2">
            <AuthorAvatar
              name={report.authorName}
              avatarUrl={report.authorAvatar}
              sizeClassName="w-5 h-5"
              textClassName="text-[10px]"
            />
            <p className="text-[11px] text-muted-foreground">
              por{' '}
              <span className="font-semibold text-foreground/80">
                {report.authorName || 'Cidadão'}
              </span>
            </p>
          </div>
        )}
        {signals.story && (
          <div className="mb-2">
            <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2 py-1 rounded-lg bg-muted/70 text-foreground border border-border/60">
              {signals.story}
            </span>
          </div>
        )}
        {signals.community && (
          <p className="text-[11px] text-muted-foreground mb-1">
            {signals.community}
          </p>
        )}
        {report.description && (
          <p className="text-xs text-muted-foreground line-clamp-2 mb-2">
            {report.description}
          </p>
        )}
        {report.address && (
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <MapPin size={11} className="flex-shrink-0" />
            <span className="truncate">{report.address}</span>
          </div>
        )}
      </button>
    </motion.div>
  );
};

export default FeedCard;

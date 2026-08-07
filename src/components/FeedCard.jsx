import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { Share } from '@capacitor/share';
import TimeAgo from '@/components/TimeAgo';
import FeedCardMedia from '@/components/feed/FeedCardMedia';
import { computeSignals } from '@/components/feed/FeedCardSignals';
import FeedCardSupport from '@/components/feed/FeedCardSupport';
import StatusBadge from '@/design-system/primitives/StatusBadge';
import SignalChip from '@/design-system/primitives/SignalChip';
import Icon, { categoryIconName } from '@/design-system/icons';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useToast } from '@/components/ui/use-toast';
import { getReportShareUrl } from '@/lib/shareUtils';

const AuthorAvatar = ({ name, avatarUrl, sizeClassName = 'w-5 h-5', textClassName = 'text-2xs' }) => {
  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt={name}
        className={`${sizeClassName} rounded-full object-cover flex-shrink-0 bg-surface-sunken`}
        loading="lazy"
      />
    );
  }
  const initial = (name || 'C')[0].toUpperCase();
  return (
    <div className={`${sizeClassName} rounded-full bg-brand-subtleBg text-brand-subtleFg flex items-center justify-center ${textClassName} font-bold flex-shrink-0 select-none`}>
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

  // Reintroduzido na Task 13: a Task 12 removeu este observer do FeedCard ao
  // extrair o efeito de thumbnail para FeedCardMedia. O card observa a propria
  // entrada em tela e repassa isInView para FeedCardMedia habilitar o hook
  // useVideoThumbnail. rootMargin de 200px para a midia comecar a carregar
  // antes do card entrar em tela.
  useEffect(() => {
    const el = cardRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setIsInView(true);
          obs.disconnect();
        }
      },
      { threshold: 0.15, rootMargin: '200px' }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const createdAt = useMemo(() => new Date(report.created_at), [report.created_at]);

  const { ageDays, ageHours } = useMemo(() => {
    const ms = Date.now() - createdAt.getTime();
    return {
      ageDays: Math.max(0, Math.floor(ms / 86400000)),
      ageHours: Math.max(0, Math.floor(ms / 3600000)),
    };
  }, [createdAt]);

  const signals = useMemo(
    () => computeSignals(report, { ageDays, ageHours }),
    [report, ageDays, ageHours]
  );

  const goToReport = useCallback(() => {
    navigate(`/bronca/${report.id}`);
  }, [navigate, report.id]);

  const handleShare = useCallback(async () => {
    const url = getReportShareUrl(report.id);
    try {
      if (Capacitor.isNativePlatform()) {
        await Share.share({ title: report.title, text: `Veja esta bronca: ${report.title}`, url });
      } else if (navigator.share) {
        await navigator.share({ title: report.title, url });
      } else {
        await navigator.clipboard.writeText(url);
        toast({ title: 'Link copiado!', description: 'Cole onde quiser compartilhar.' });
      }
    } catch {
      // usuario cancelou ou share nao suportado
    }
  }, [report.id, report.title, toast]);

  const handleBookmark = useCallback(async () => {
    if (!user) {
      navigate('/login');
      return;
    }
    try {
      if (report.is_favorited) {
        await supabase.from('favorite_reports').delete()
          .eq('user_id', user.id).eq('report_id', report.id);
      } else {
        await supabase.from('favorite_reports').upsert(
          { user_id: user.id, report_id: report.id },
          { onConflict: 'user_id,report_id' }
        );
      }
      toast({
        title: report.is_favorited ? 'Removido dos favoritos' : 'Salvo nos favoritos',
        duration: 1500,
      });
    } catch {
      toast({ title: 'Erro ao salvar', variant: 'destructive', duration: 2000 });
    }
  }, [user, report, navigate, toast]);

  const chip = signals.chips[0];

  const isActive = report.status !== 'resolved' && report.status !== 'duplicate';

  return (
    <article
      ref={cardRef}
      className={`tc-animate-in bg-surface-raised rounded-2xl border overflow-hidden shadow-elevation-1 ${
        isNew ? 'border-brand ring-2 ring-brand/25' : 'border-edge-subtle'
      }`}
      style={{ animationDelay: `${Math.min(index, 4) * 40}ms` }}
    >
      {/* Layout horizontal: miniatura quadrada a esquerda, conteudo a direita. */}
      <div className="flex gap-3 p-3">
        <div className="w-28 sm:w-32 flex-shrink-0">
          <FeedCardMedia
            report={report}
            index={index}
            isInView={isInView}
            square
            onClick={goToReport}
          />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <StatusBadge status={report.status} />
            <TimeAgo date={report.created_at} className="text-2xs text-content-tertiary" />
            {chip && <SignalChip variant={chip.variant} label={chip.label} />}
          </div>

          <div className="flex items-center gap-1.5 mt-1.5 text-2xs text-content-tertiary">
            <Icon name={categoryIconName(report.category_id)} size={12} className="flex-shrink-0" />
            <span className="truncate">{report.categoryName || report.category_id}</span>
          </div>

          <button
            onClick={goToReport}
            className="w-full text-left mt-1.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand rounded"
          >
            <h3 className="font-display text-base font-bold leading-snug line-clamp-2 text-content-primary">
              {report.title}
            </h3>

            {report.address && (
              <div className="flex items-start gap-1 text-2xs text-content-secondary mt-1.5">
                <Icon name="location" size={12} className="flex-shrink-0 mt-0.5 text-brand" />
                <span className="line-clamp-2">{report.address}</span>
              </div>
            )}

            {report.description && (
              <p className="text-2xs text-content-secondary line-clamp-2 mt-1.5">
                {report.description}
              </p>
            )}
          </button>

          <FeedCardSupport upvotes={report.upvotes} className="mt-2.5" />
        </div>
      </div>

      {/* Comentar e compartilhar em linha discreta: nao somem do card, mas nao
          competem com as duas acoes principais do rodape. */}
      <div className="flex items-center gap-1 px-3 pb-2">
        <button
          type="button"
          onClick={() => onToggleUpvote?.(report.id)}
          aria-label="Apoiar bronca"
          aria-pressed={report.user_has_upvoted}
          className={`flex items-center gap-1.5 px-2 py-1 rounded-lg text-2xs font-semibold transition-colors ${
            report.user_has_upvoted
              ? 'text-brand bg-brand/10'
              : 'text-content-tertiary hover:text-content-primary'
          }`}
        >
          <Icon name="support" size={15} />
          {report.upvotes > 0 && <span className="tabular-nums">{report.upvotes}</span>}
        </button>
        <button
          type="button"
          onClick={goToReport}
          aria-label="Ver comentários"
          className="flex items-center gap-1.5 px-2 py-1 rounded-lg text-2xs font-semibold text-content-tertiary hover:text-content-primary transition-colors"
        >
          <Icon name="comment" size={15} />
          {report.comments_count > 0 && (
            <span className="tabular-nums">{report.comments_count}</span>
          )}
        </button>
        <button
          type="button"
          onClick={handleShare}
          aria-label="Compartilhar"
          className="flex items-center px-2 py-1 rounded-lg text-content-tertiary hover:text-content-primary transition-colors"
        >
          <Icon name="share" size={15} />
        </button>
        {(report.authorName || report.authorAvatar) && (
          <div className="flex items-center gap-1.5 ml-auto min-w-0">
            <AuthorAvatar name={report.authorName} avatarUrl={report.authorAvatar} />
            <span className="text-2xs text-content-tertiary truncate">
              {report.authorName || 'Cidadão'}
            </span>
          </div>
        )}
      </div>

      {/* Rodape: acompanhar (favoritar) e ver detalhes. */}
      <div className="grid grid-cols-2 border-t border-edge-subtle">
        <button
          type="button"
          onClick={handleBookmark}
          aria-pressed={report.is_favorited}
          className={`flex items-center justify-center gap-2 py-3 text-xs font-semibold border-r border-edge-subtle transition-colors ${
            report.is_favorited
              ? 'text-brand bg-brand/10'
              : 'text-brand hover:bg-brand/5'
          }`}
        >
          <Icon name="save" size={14} />
          {report.is_favorited ? 'Acompanhando' : 'Acompanhar'}
        </button>
        <button
          type="button"
          onClick={goToReport}
          className="flex items-center justify-center gap-1.5 py-3 text-xs font-semibold text-content-primary hover:bg-surface-sunken transition-colors group"
        >
          Ver detalhes
          <span
            className="text-brand group-hover:translate-x-0.5 transition-transform"
            aria-hidden="true"
          >
            ›
          </span>
        </button>
      </div>

      {isActive && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            if (!user) {
              navigate('/login', { state: { from: `/bronca/${report.id}`, openUpdateModal: true } });
              return;
            }
            navigate(`/bronca/${report.id}`, { state: { openUpdateModal: true } });
          }}
          className="w-full flex items-center gap-2.5 px-4 py-2.5 bg-brand-subtleBg hover:brightness-110 border-t border-edge-subtle transition-all rounded-b-2xl group"
        >
          <div className="w-6 h-6 rounded-full bg-brand/10 flex items-center justify-center flex-shrink-0 text-brand">
            <Icon name="trombone" size={13} />
          </div>
          <div className="flex-1 text-left min-w-0">
            <span className="text-2xs font-semibold text-brand-subtleFg">Esteve no local?</span>
            <span className="text-2xs text-content-secondary"> Informe o que viu</span>
          </div>
          <span
            className="text-2xs font-bold text-brand-subtleFg group-hover:translate-x-0.5 transition-transform"
            aria-hidden="true"
          >
            →
          </span>
        </button>
      )}
    </article>
  );
};

// Re-renderiza somente quando os campos exibidos mudam.
export default React.memo(FeedCard, (prev, next) =>
  prev.report.id === next.report.id &&
  prev.report.status === next.report.status &&
  prev.report.upvotes === next.report.upvotes &&
  prev.report.comments_count === next.report.comments_count &&
  prev.report.user_has_upvoted === next.report.user_has_upvoted &&
  prev.report.is_favorited === next.report.is_favorited &&
  prev.report.coverImage === next.report.coverImage &&
  prev.isNew === next.isNew &&
  prev.index === next.index
);

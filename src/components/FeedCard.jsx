import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { Share } from '@capacitor/share';
import TimeAgo from '@/components/TimeAgo';
import FeedCardMedia from '@/components/feed/FeedCardMedia';
import { computeSignals } from '@/components/feed/FeedCardSignals';
import FeedCardSupport from '@/components/feed/FeedCardSupport';
import FeedCommentsSheet from '@/components/feed/FeedCommentsSheet';
import StatusBadge from '@/design-system/primitives/StatusBadge';
import Icon, { categoryIconName } from '@/design-system/icons';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useToast } from '@/components/ui/use-toast';
import { getReportShareUrl } from '@/lib/shareUtils';

// Distancia em linguagem de rua: abaixo de 1 km em metros arredondados a 50,
// porque "a 347 m" sugere uma precisao que o GPS do celular nao tem.
const formatDistance = (meters) => {
  if (!Number.isFinite(meters)) return null;
  if (meters < 1000) return `a ${Math.max(50, Math.round(meters / 50) * 50)} m`;
  const km = meters / 1000;
  return `a ${km.toFixed(km < 10 ? 1 : 0).replace('.', ',')} km`;
};

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
    <div className={`${sizeClassName} rounded-full bg-surface-sunken text-content-secondary flex items-center justify-center ${textClassName} font-bold flex-shrink-0 select-none`}>
      {initial}
    </div>
  );
};

const FeedCard = ({ report, onToggleUpvote, onRequestUpdate, isNew = false, index = 0 }) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const cardRef = useRef(null);
  const [isInView, setIsInView] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(false);
  // A contagem vem do feed, mas a folha traz o numero atualizado ao abrir —
  // moderacao pode ter aprovado comentarios desde que o feed carregou.
  const [commentsCount, setCommentsCount] = useState(report.comments_count);
  // Status local: o modal de atualizacao pode mudar o status da bronca, e o
  // card precisa refletir isso sem esperar um refresh do feed inteiro.
  const [localStatus, setLocalStatus] = useState(report.status);

  useEffect(() => {
    setLocalStatus(report.status);
  }, [report.status]);

  useEffect(() => {
    setCommentsCount(report.comments_count);
  }, [report.comments_count]);

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


  const isActive = localStatus !== 'resolved' && localStatus !== 'duplicate';

  return (
    <article
      ref={cardRef}
      className={`tc-animate-in bg-surface-raised rounded-2xl border overflow-hidden shadow-elevation-1 ${
        isNew ? 'border-brand ring-2 ring-brand/25' : 'border-edge-subtle'
      }`}
      style={{ animationDelay: `${Math.min(index, 4) * 40}ms` }}
    >
      {/* Cabecalho: titulo e status antes da midia. */}
      <div className="flex items-start gap-3 px-3.5 pt-3.5 pb-2.5">
        <button
          onClick={goToReport}
          className="flex-1 min-w-0 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-brand rounded"
        >
          <h3 className="font-display text-base font-bold leading-tight line-clamp-2 text-content-primary">
            {report.title}
          </h3>
          <span className="flex items-center gap-1 mt-1 text-2xs text-content-tertiary min-w-0">
            <Icon
              name={categoryIconName(report.category_id)}
              size={12}
              className="flex-shrink-0"
            />
            <span className="truncate">{report.categoryName || report.category_id}</span>
            <span aria-hidden="true">·</span>
            <TimeAgo date={report.created_at} className="text-2xs text-content-tertiary" />
          </span>
        </button>
        <StatusBadge status={localStatus} />
      </div>

      {/* Midia em largura cheia: a foto e a prova do problema. */}
      <FeedCardMedia
        report={report}
        index={index}
        isInView={isInView}
        chips={signals.chips}
        onClick={goToReport}
      />

      <div className="flex flex-col p-3">
        <div className="flex-1 min-w-0 flex flex-col">
          <button
            onClick={goToReport}
            className="w-full text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-brand rounded"
          >
            {(report.address || report.distanceMeters != null) && (
              <div className="flex items-start gap-1 text-2xs text-content-secondary">
                <Icon name="location" size={12} className="flex-shrink-0 mt-0.5 text-brand" />
                <span className="line-clamp-2">
                  {report.address}
                  {report.distanceMeters != null && (
                    <>
                      {report.address && ' · '}
                      <span className="font-semibold text-content-primary whitespace-nowrap">
                        {formatDistance(report.distanceMeters)}
                      </span>
                    </>
                  )}
                </span>
              </div>
            )}

            {report.description && (
              <p className="text-2xs text-content-secondary line-clamp-2 mt-2 leading-relaxed">
                {report.description}
              </p>
            )}

            {(report.authorName || report.authorAvatar) && (
              <div className="flex items-center gap-1.5 mt-2 min-w-0">
                <AuthorAvatar name={report.authorName} avatarUrl={report.authorAvatar} />
                <span className="text-2xs text-content-tertiary truncate">
                  por {report.authorName || 'Cidadão'}
                </span>
              </div>
            )}
          </button>

          {/* Confirmacoes a esquerda, acoes com rotulo a direita, separadas por
              uma divisoria — as acoes so com icone eram ambiguas. */}
          <div className="mt-auto pt-3 border-t border-edge-subtle flex items-center justify-between gap-3">
            <FeedCardSupport upvotes={report.upvotes} />

            <div className="flex items-stretch gap-0.5 sm:gap-1 flex-shrink-0">
              <button
                type="button"
                onClick={() => onToggleUpvote?.(report.id)}
                aria-label="Apoiar bronca"
                aria-pressed={report.user_has_upvoted}
                className={`flex flex-col items-center justify-center gap-0.5 px-2 sm:px-2.5 py-1 rounded-lg text-2xs font-semibold transition-colors ${
                  report.user_has_upvoted
                    ? 'text-brand'
                    : 'text-content-secondary hover:text-content-primary'
                }`}
              >
                <Icon name="support" size={17} />
                <span className="hidden xs:inline">Apoiar</span>
              </button>

              <span className="w-px bg-edge-subtle self-stretch my-1" aria-hidden="true" />

              {/* Abre a folha no proprio feed: ir para a pagina de detalhes so
                  para ler dois comentarios custava a posicao do scroll. */}
              <button
                type="button"
                onClick={() => setCommentsOpen(true)}
                aria-label="Ver comentários"
                className="flex flex-col items-center justify-center gap-0.5 px-2 sm:px-2.5 py-1 rounded-lg text-2xs font-semibold text-content-secondary hover:text-content-primary transition-colors"
              >
                <Icon name="comment" size={17} />
                <span className="tabular-nums">
                  {commentsCount > 0 ? commentsCount : <span className="hidden xs:inline">Comentar</span>}
                </span>
              </button>

              <span className="w-px bg-edge-subtle self-stretch my-1" aria-hidden="true" />

              <button
                type="button"
                onClick={handleShare}
                aria-label="Compartilhar"
                className="flex flex-col items-center justify-center gap-0.5 px-2 sm:px-2.5 py-1 rounded-lg text-2xs font-semibold text-content-secondary hover:text-content-primary transition-colors"
              >
                <Icon name="share" size={17} />
                <span className="hidden xs:inline">Compartilhar</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Dois botoes com fundo proprio, lado a lado. Acompanhando fica verde
          preenchido — e estado, nao acao, e o verde le como confirmacao. */}
      <div className="grid grid-cols-2 gap-2.5 px-3 pb-3">
        <button
          type="button"
          onClick={handleBookmark}
          aria-pressed={report.is_favorited}
          className={`flex items-center justify-center gap-2 py-3 rounded-xl text-xs font-bold transition-colors ${
            report.is_favorited
              ? 'bg-success-bg text-success-fg'
              : 'border border-edge-default text-content-secondary hover:bg-surface-subtle'
          }`}
        >
          <Icon name={report.is_favorited ? 'resolved' : 'flag'} size={15} />
          {report.is_favorited ? 'Acompanhando' : 'Acompanhar'}
        </button>
        <button
          type="button"
          onClick={goToReport}
          className="flex items-center justify-center gap-1.5 py-3 rounded-xl border border-edge-default text-xs font-bold text-brand hover:bg-surface-subtle transition-colors group"
        >
          Ver detalhes
          <Icon
            name="chevronright"
            size={13}
            className="group-hover:translate-x-0.5 transition-transform"
          />
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
            // Quem hospeda o modal e o FeedPage: um so modal para a lista
            // inteira, e fora da arvore do card (que tem transform e prenderia
            // o position:fixed do modal ao proprio card).
            onRequestUpdate?.(report);
          }}
          className="w-full flex items-center gap-3 mx-3 mb-3 px-3 py-3 rounded-xl bg-surface-subtle hover:bg-surface-subtleHover transition-colors group"
          style={{ width: 'calc(100% - 1.5rem)' }}
        >
          <div className="w-9 h-9 rounded-full bg-surface-sunken flex items-center justify-center flex-shrink-0 text-content-secondary">
            <Icon name="trombone" size={16} />
          </div>
          <div className="flex-1 text-left min-w-0">
            <p className="text-xs font-bold text-content-primary">Esteve no local?</p>
            <p className="text-2xs text-content-tertiary leading-snug">
              Ajude a comunidade compartilhando o que você viu.
            </p>
          </div>
          <Icon
            name="chevronright"
            size={14}
            className="flex-shrink-0 text-content-tertiary group-hover:translate-x-0.5 transition-transform"
          />
        </button>
      )}

      <FeedCommentsSheet
        open={commentsOpen}
        onOpenChange={setCommentsOpen}
        reportId={report.id}
        reportTitle={report.title}
        onCountChange={setCommentsCount}
      />
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
  // coverVideo decide entre o layout de video e o horizontal.
  prev.report.coverVideo === next.report.coverVideo &&
  prev.isNew === next.isNew &&
  prev.index === next.index
);

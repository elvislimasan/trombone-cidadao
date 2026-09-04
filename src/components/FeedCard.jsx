import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { Share } from '@capacitor/share';
import { Instagram } from 'lucide-react';
import TimeAgo from '@/components/TimeAgo';
import FeedCardMedia from '@/components/feed/FeedCardMedia';
import { computeSignals } from '@/components/feed/FeedCardSignals';
import FeedCommentsSheet from '@/components/feed/FeedCommentsSheet';
import StatusBadge from '@/design-system/primitives/StatusBadge';
import Icon, { categoryIconName } from '@/design-system/icons';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { getReportShareUrl } from '@/lib/shareUtils';
import {
  canShareToStory,
  shareVideoToInstagramStory,
} from '@/lib/instagramStory';
import { showAppError } from '@/lib/appError';
import { useIsDesktopViewport } from '@/hooks/useIsDesktopViewport';

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

const FeedCard = ({ report, onToggleUpvote, onRequestUpdate, onRequestStory, isNew = false, index = 0 }) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isDesktop = useIsDesktopViewport();
  const cardRef = useRef(null);
  const [isInView, setIsInView] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [commentFocusRequest, setCommentFocusRequest] = useState(0);
  // A contagem vem do feed, mas a folha traz o numero atualizado ao abrir —
  // moderacao pode ter aprovado comentarios desde que o feed carregou.
  const [commentsCount, setCommentsCount] = useState(report.comments_count);
  // Status local: o modal de atualizacao pode mudar o status da bronca, e o
  // card precisa refletir isso sem esperar um refresh do feed inteiro.
  const [localStatus, setLocalStatus] = useState(report.status);
  // Favorito local, pelo mesmo motivo do status: o feed pai nao e reconsultado
  // ao salvar, entao sem espelho o icone ficava no estado antigo e a unica
  // prova do toque era um toast.
  const [localFav, setLocalFav] = useState(report.is_favorited);
  // O download do video para o cache local pode levar alguns segundos em rede
  // movel; sem indicador o usuario acha que o toque nao registrou.
  const [sharingStory, setSharingStory] = useState(false);

  useEffect(() => {
    setLocalStatus(report.status);
  }, [report.status]);

  useEffect(() => {
    setLocalFav(report.is_favorited);
  }, [report.is_favorited]);

  useEffect(() => {
    setCommentsCount(report.comments_count);
  }, [report.comments_count]);

  useEffect(() => {
    if (isDesktop) setCommentsOpen(false);
  }, [isDesktop]);

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

  // Copiar link: acao direta, sem abrir a folha do sistema. Em contexto
  // inseguro (http) o clipboard nao existe, entao caimos no share nativo.
  const handleCopyLink = useCallback(async () => {
    const url = getReportShareUrl(report.id);
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
        return;
      }
      if (Capacitor.isNativePlatform()) {
        await Share.share({ title: report.title, url });
      }
    } catch {
      // usuario cancelou ou clipboard indisponivel
    }
  }, [report.id, report.title]);

  // Folha de compartilhamento do sistema (WhatsApp, Telegram, etc).
  const shareLink = useCallback(async () => {
    const url = getReportShareUrl(report.id);
    try {
      if (Capacitor.isNativePlatform()) {
        await Share.share({ title: report.title, text: `Veja esta bronca: ${report.title}`, url });
      } else if (navigator.share) {
        await navigator.share({ title: report.title, url });
      } else {
        await handleCopyLink();
      }
    } catch {
      // usuario cancelou ou share nao suportado
    }
  }, [report.id, report.title, handleCopyLink]);

  // Quem hospeda o modal do card e o FeedPage, pelo mesmo motivo do modal de
  // atualizacao: o card tem transform, e um position:fixed dentro dele fica
  // preso ao proprio card em vez de cobrir a tela.
  const openStoryCard = useCallback(() => {
    onRequestStory?.({ ...report, status: localStatus });
  }, [onRequestStory, report, localStatus]);

  const handleShareToStory = useCallback(async () => {
    // Sem video (ou sem suporte nativo): cai no card estatico do story,
    // que funciona com a foto de capa e leva o QR code do app.
    if (!report.coverVideo || !canShareToStory()) {
      openStoryCard();
      return;
    }

    setSharingStory(true);
    try {
      const { linkAttached } = await shareVideoToInstagramStory({
        videoUrl: report.coverVideo,
        reportId: report.id,
        shareUrl: getReportShareUrl(report.id),
      });

      if (linkAttached) {
        // Nao da para saber se o Instagram renderizou o sticker: a permissao
        // de link em story e da conta do usuario, invisivel para o app.
      }
    } catch (error) {
      const reason = String(error?.message || '');

      if (reason === 'INSTAGRAM_NOT_INSTALLED') {
        showAppError({
          title: 'Instagram não encontrado',
          description: 'Instale o Instagram para postar direto no story.',
          variant: 'destructive',
        });
        return;
      }

      // Video fora dos limites do story: o card estatico ainda resolve.
      if (reason === 'VIDEO_TOO_LONG' || reason === 'VIDEO_TOO_LARGE') {
        openStoryCard();
        return;
      }

      showAppError({
        title: 'Não foi possível compartilhar',
        description: 'Tente novamente ou compartilhe o link.',
        variant: 'destructive',
      });
      await shareLink();
    } finally {
      setSharingStory(false);
    }
  }, [report.id, report.coverVideo, shareLink, openStoryCard]);

  const handleBookmark = useCallback(async () => {
    if (!user) {
      navigate('/login');
      return;
    }
    // O icone vira antes da rede: e ele a confirmacao do toque, no lugar do
    // toast que existia so porque nada mudava na tela. Volta atras se falhar.
    const eraFavorito = localFav;
    setLocalFav(!eraFavorito);
    try {
      if (eraFavorito) {
        await supabase.from('favorite_reports').delete()
          .eq('user_id', user.id).eq('report_id', report.id);
      } else {
        await supabase.from('favorite_reports').upsert(
          { user_id: user.id, report_id: report.id },
          { onConflict: 'user_id,report_id' }
        );
      }
    } catch {
      setLocalFav(eraFavorito);
      showAppError({ title: 'Erro ao salvar', variant: 'destructive', duration: 2000 });
    }
  }, [user, report.id, localFav, navigate]);


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
          {report.description && (
            <button
              onClick={goToReport}
              className="w-full text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-brand rounded"
            >
              <p className="text-2xs text-content-secondary line-clamp-2 leading-relaxed">
                {report.description}
              </p>
            </button>
          )}

          {/* py-0.5 dá folga vertical ao avatar: sem isso ele encostava na
              linha de cima, que tem line-clamp e nao reserva descida. */}
          {(report.authorName || report.authorAvatar) && (
            <div className="flex items-center gap-2 mt-3 py-0.5 min-w-0">
              <AuthorAvatar
                name={report.authorName}
                avatarUrl={report.authorAvatar}
                sizeClassName="w-6 h-6"
              />
              <span className="text-2xs text-content-tertiary truncate">
                por {report.authorName || 'Cidadão'}
              </span>
            </div>
          )}

          {/* Barra de acoes so com icone: apoiar, comentar e compartilhar a
              esquerda; salvar isolado a direita, porque e a unica que age sobre
              a bronca do proprio usuario e nao sobre a conversa. */}
          <div className="mt-auto pt-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => onToggleUpvote?.(report.id)}
                aria-label="Apoiar bronca"
                aria-pressed={report.user_has_upvoted}
                className={`flex items-center gap-1.5 p-1.5 rounded-lg text-xs font-semibold transition-colors ${
                  report.user_has_upvoted
                    ? 'text-brand'
                    : 'text-content-secondary hover:text-content-primary'
                }`}
              >
                <Icon name="support" size={19} />
                {report.upvotes > 0 && <span className="tabular-nums">{report.upvotes}</span>}
              </button>

              {/* Abre a folha no proprio feed: ir para a pagina de detalhes so
                  para ler dois comentarios custava a posicao do scroll. */}
              <button
                type="button"
                onClick={() => {
                  if (!isDesktop) {
                    setCommentsOpen(true);
                    return;
                  }
                  if (!user) {
                    navigate('/login', { state: { from: { pathname: '/feed' } } });
                    return;
                  }
                  setCommentFocusRequest((request) => request + 1);
                }}
                aria-label={isDesktop ? 'Escrever comentário' : 'Ver comentários'}
                className="flex items-center gap-1.5 p-1.5 rounded-lg text-xs font-semibold text-content-secondary hover:text-content-primary transition-colors"
              >
                <Icon name="comment" size={19} />
                {commentsCount > 0 && <span className="tabular-nums">{commentsCount}</span>}
              </button>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    disabled={sharingStory}
                    aria-label="Compartilhar"
                    aria-busy={sharingStory}
                    className="p-1.5 rounded-lg text-content-secondary hover:text-content-primary transition-colors disabled:opacity-60"
                  >
                    {sharingStory ? (
                      <span className="block w-[19px] h-[19px] rounded-full border-2 border-current border-t-transparent animate-spin" />
                    ) : (
                      <Icon name="share" size={19} />
                    )}
                  </button>
                </DropdownMenuTrigger>

                <DropdownMenuContent align="start" className="w-56">
                  <DropdownMenuItem
                    className="gap-2 cursor-pointer"
                    onClick={handleCopyLink}
                  >
                    <Icon name="save" size={14} />
                    Copiar link da bronca
                  </DropdownMenuItem>

                  <DropdownMenuItem
                    className="gap-2 cursor-pointer"
                    onClick={handleShareToStory}
                  >
                    <Instagram size={14} />
                    {report.coverVideo && canShareToStory()
                      ? 'Enviar vídeo ao story'
                      : 'Gerar card para story'}
                  </DropdownMenuItem>

                  <DropdownMenuSeparator />

                  <DropdownMenuItem
                    className="gap-2 cursor-pointer"
                    onClick={shareLink}
                  >
                    <Icon name="share" size={14} />
                    Mais opções…
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            <button
              type="button"
              onClick={handleBookmark}
              aria-label={localFav ? 'Deixar de acompanhar' : 'Acompanhar bronca'}
              aria-pressed={localFav}
              className={`p-1.5 rounded-lg transition-colors ${
                localFav
                  ? 'text-brand'
                  : 'text-content-secondary hover:text-content-primary'
              }`}
            >
              <Icon name="save" size={19} />
            </button>
          </div>

          <FeedCommentsSheet
            open={commentsOpen}
            onOpenChange={setCommentsOpen}
            reportId={report.id}
            reportTitle={report.title}
            onCountChange={setCommentsCount}
            inlineOnDesktop
            focusRequest={commentFocusRequest}
          />

          {/* O sinal de comunidade ja era calculado em computeSignals mas o card
              nao mostrava — e ele que da a dimensao de quanta gente esta junto. */}
          {signals.community && (
            <p className="mt-3 text-2xs text-brand font-medium">{signals.community}</p>
          )}

          {(report.address || report.distanceMeters != null) && (
            <div className="flex items-start gap-1 mt-1.5 text-2xs text-content-secondary">
              <Icon name="location" size={12} className="flex-shrink-0 mt-0.5 text-content-tertiary" />
              <span className="line-clamp-1">
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
        </div>
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
          className="w-full flex items-center gap-2.5 mx-3 mb-3 px-3 py-2.5 rounded-xl bg-brand-subtleBg text-brand-subtleFg transition-opacity hover:opacity-90 group"
          style={{ width: 'calc(100% - 1.5rem)' }}
        >
          <Icon name="trombone" size={16} className="flex-shrink-0" />
          <p className="flex-1 text-left text-2xs leading-snug min-w-0">
            <span className="font-bold">Esteve no local?</span>{' '}
            <span className="opacity-80">Informe o que viu</span>
          </p>
          <Icon
            name="chevronright"
            size={14}
            className="flex-shrink-0 group-hover:translate-x-0.5 transition-transform"
          />
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
  // coverVideo decide entre o layout de video e o horizontal.
  prev.report.coverVideo === next.report.coverVideo &&
  prev.isNew === next.isNew &&
  prev.index === next.index
);

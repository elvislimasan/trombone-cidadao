import React, { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Send, Clock, Check, X, MoreVertical, Flag, Trash2 } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { TimeAgo } from '@/components/TimeAgo';
import TromboneSpinner from '@/design-system/feedback/TromboneSpinner';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useReportComments } from '@/hooks/useReportComments';
import { showAppError } from '@/lib/appError';

const Avatar = ({ name, url }) => {
  if (url) {
    return <img src={url} alt={name} className="w-8 h-8 rounded-full object-cover flex-shrink-0" loading="lazy" />;
  }
  return (
    <div className="w-8 h-8 rounded-full bg-brand-subtleBg text-brand-subtleFg flex items-center justify-center text-xs font-bold flex-shrink-0 select-none">
      {(name || '?').charAt(0).toUpperCase()}
    </div>
  );
};

/**
 * Comentarios de uma bronca sem sair do feed.
 *
 * Abre so quando `open` vira true — a consulta e disparada pelo `enabled` do
 * hook, entao um feed com 10 cards nao faz 10 requisicoes de comentarios.
 */
const FeedCommentsSheet = ({ open, onOpenChange, reportId, reportTitle, onCountChange }) => {
  const { user } = useAuth();
  const [text, setText] = useState('');
  const listEndRef = useRef(null);

  const { comments, loading, error, submit, submitting, publicCount, canModerate, moderate, moderatingId, denunciar, excluir } =
    useReportComments(reportId, { enabled: open });

  // Mantem o card do feed em sincronia quando a moderacao ja aprovou algo novo.
  useEffect(() => {
    if (open && !loading) onCountChange?.(publicCount);
  }, [open, loading, publicCount, onCountChange]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!text.trim() || submitting) return;

    const result = await submit(text);
    if (result.ok) {
      setText('');
      // Sem toast, nem para o mascaramento: o comentário aparece na lista com os
      // asteriscos à vista, e a rolagem abaixo leva o olho até ele. Um aviso
      // dizendo o que já está escrito na tela é ruído.
      requestAnimationFrame(() => {
        listEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
      });
    } else {
      showAppError({
        title: 'Erro ao enviar comentário',
        description: result.error,
        variant: 'destructive',
      });
    }
  };

  const handleModerate = async (commentId, status) => {
    const result = await moderate(commentId, status);
    if (result.ok) {
    } else {
      showAppError({
        title: 'Erro ao moderar',
        description: result.error,
        variant: 'destructive',
      });
    }
  };

  // Confirmação porque não há desfazer: o DELETE leva a linha embora. Em
  // diálogo do app, não em `window.confirm` — o nativo do browser abre com
  // "localhost:3002 diz" no topo e, dentro do app empacotado, é uma caixa de
  // sistema no meio de uma tela desenhada.
  const [aExcluir, setAExcluir] = useState(null);

  const confirmarExclusao = async () => {
    const commentId = aExcluir;
    setAExcluir(null);
    if (!commentId) return;

    const result = await excluir(commentId);
    if (!result.ok) {
      showAppError({
        title: 'Erro ao excluir',
        description: result.error,
        variant: 'destructive',
      });
    }
  };

  const handleDenunciar = async (commentId) => {
    const result = await denunciar(commentId);
    if (result.ok) {
      // Sem número de denúncias na tela: dizer "faltam 2" convida a juntar as
      // outras duas. O limiar é assunto do banco.
    } else {
      showAppError({
        title: 'Erro ao denunciar',
        description: result.error,
        variant: 'destructive',
      });
    }
  };

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[80vh]">
        <DrawerHeader className="border-b border-edge-subtle pb-3">
          <DrawerTitle className="text-base">
            Comentários
            {publicCount > 0 && (
              <span className="ml-2 text-sm font-normal text-content-secondary">{publicCount}</span>
            )}
          </DrawerTitle>
          {reportTitle && (
            <p className="text-xs text-content-secondary truncate">{reportTitle}</p>
          )}
        </DrawerHeader>

        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
          {loading ? (
            <div className="flex justify-center py-8">
              <TromboneSpinner size={22} className="text-content-secondary" />
            </div>
          ) : error ? (
            <p className="text-sm text-center text-content-secondary py-8">{error}</p>
          ) : comments.length === 0 ? (
            <p className="text-sm text-center text-content-secondary py-8">
              Ainda não há comentários. Seja o primeiro.
            </p>
          ) : (
            comments.map((c) => (
              <div key={c.id} className="flex items-start gap-2.5">
                <Avatar name={c.authorName} url={c.authorAvatar} />
                <div className="flex-1 min-w-0">
                  <div className="rounded-2xl bg-surface-sunken px-3 py-2">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-xs font-semibold text-content-primary truncate">
                        {c.isMine ? 'Você' : c.authorName}
                      </span>
                      <span className="text-2xs text-content-tertiary flex-shrink-0">
                        <TimeAgo date={c.created_at} />
                      </span>

                      {/* Todo comentário tem menu para quem está logado — o que
                          muda é o que há dentro. Denúncia mora aqui, e não num
                          botão fixo, porque o normal é ler e seguir em frente:
                          quem precisa dela sabe procurar. Deslogado não tem
                          menu: denúncia anônima é convite para derrubar
                          comentário alheio. */}
                      {user && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button
                              type="button"
                              aria-label="Opções do comentário"
                              disabled={moderatingId === c.id}
                              className="ml-auto -mr-1 flex-shrink-0 rounded-full p-1 text-content-tertiary hover:bg-surface-raised hover:text-content-primary disabled:opacity-40"
                            >
                              <MoreVertical size={13} />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="min-w-[190px]">
                            {!c.isMine && (
                              <DropdownMenuItem
                                onSelect={() => handleDenunciar(c.id)}
                                disabled={c.jaDenunciei}
                              >
                                <Flag size={14} className="mr-2" />
                                {c.jaDenunciei ? 'Você já denunciou' : 'Denunciar'}
                              </DropdownMenuItem>
                            )}

                            {/* Quem escreveu se apaga sozinho, sem passar por
                                moderação nenhuma — o texto é dele. */}
                            {c.isMine && (
                              <DropdownMenuItem
                                onSelect={() => setAExcluir(c.id)}
                                className="text-danger focus:text-danger"
                              >
                                <Trash2 size={14} className="mr-2" />
                                Excluir comentário
                              </DropdownMenuItem>
                            )}

                            {/* A moderação alcança qualquer comentário, não só
                                o que as denúncias já derrubaram: esperar as 3
                                para poder agir sobre algo que o admin está
                                lendo agora é esperar por nada. */}
                            {canModerate && !c.isMine && (
                              <>
                                {c.isPending && (
                                  <DropdownMenuItem onSelect={() => handleModerate(c.id, 'approved')}>
                                    <Check size={14} className="mr-2" />
                                    Restaurar comentário
                                  </DropdownMenuItem>
                                )}
                                <DropdownMenuItem
                                  onSelect={() => handleModerate(c.id, 'rejected')}
                                  className="text-danger focus:text-danger"
                                >
                                  <X size={14} className="mr-2" />
                                  Remover comentário
                                </DropdownMenuItem>
                              </>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </div>
                    <p className="text-sm text-content-primary break-words leading-relaxed">
                      {c.text}
                    </p>
                  </div>
                  {/* Denunciado, fora do ar. O autor precisa saber que ninguém
                      mais está lendo aquilo — senão segue a conversa achando
                      que falou com alguém. */}
                  {c.isPending && (
                    <p className="mt-1 ml-1 flex items-center gap-1 text-2xs text-content-tertiary">
                      <Clock size={11} />
                      {canModerate
                        ? 'Denunciado — em revisão'
                        : 'Denunciado — em revisão, visível só para você'}
                    </p>
                  )}
                </div>
              </div>
            ))
          )}
          <div ref={listEndRef} />
        </div>

        <div
          className="border-t border-edge-subtle p-3"
          style={{ paddingBottom: 'calc(0.75rem + var(--safe-area-bottom, 0px))' }}
        >
          {user ? (
            <form onSubmit={handleSubmit} className="flex items-center gap-2">
              <input
                type="text"
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Adicione seu comentário..."
                maxLength={1000}
                className="flex-1 rounded-full bg-surface-sunken px-4 py-2.5 text-sm text-content-primary placeholder:text-content-tertiary focus:outline-none focus:ring-2 focus:ring-brand"
              />
              <button
                type="submit"
                disabled={!text.trim() || submitting}
                aria-label="Enviar comentário"
                className="flex-shrink-0 w-10 h-10 rounded-full bg-brand text-content-onBrand flex items-center justify-center disabled:opacity-40 transition-opacity"
              >
                {submitting ? <TromboneSpinner size={16} /> : <Send size={16} />}
              </button>
            </form>
          ) : (
            <p className="text-center text-sm text-content-secondary py-2">
              <Link to="/login" className="font-semibold text-brand hover:underline">
                Entre na sua conta
              </Link>{' '}
              para comentar.
            </p>
          )}
        </div>
      </DrawerContent>

      {/* Sai por cima da folha: o Dialog é z-[10000] e o Drawer, z-[3001]. */}
      <Dialog open={Boolean(aExcluir)} onOpenChange={(aberto) => { if (!aberto) setAExcluir(null); }}>
        <DialogContent className="max-w-xs rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-lg">Excluir comentário?</DialogTitle>
            <DialogDescription>
              Ele some para todo mundo e não dá para desfazer.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-4 flex-row gap-2">
            <button
              type="button"
              onClick={() => setAExcluir(null)}
              className="flex-1 rounded-xl border border-edge-default px-4 py-2.5 text-sm font-semibold text-content-secondary"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={confirmarExclusao}
              className="flex-1 rounded-xl bg-danger px-4 py-2.5 text-sm font-bold text-white"
            >
              Excluir
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Drawer>
  );
};

export default FeedCommentsSheet;

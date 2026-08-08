import React, { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Send, Clock } from 'lucide-react';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';
import { TimeAgo } from '@/components/TimeAgo';
import TromboneSpinner from '@/design-system/feedback/TromboneSpinner';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useReportComments } from '@/hooks/useReportComments';
import { useToast } from '@/components/ui/use-toast';

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
  const { toast } = useToast();
  const [text, setText] = useState('');
  const listEndRef = useRef(null);

  const { comments, loading, error, submit, submitting, publicCount } =
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
      requestAnimationFrame(() => {
        listEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
      });
    } else {
      toast({
        title: 'Erro ao enviar comentário',
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
                    </div>
                    <p className="text-sm text-content-primary break-words leading-relaxed">
                      {c.text}
                    </p>
                  </div>
                  {/* Só o autor vê o próprio pendente — sem este aviso ele
                      acharia que já está publicado para todo mundo. */}
                  {c.isPending && (
                    <p className="mt-1 ml-1 flex items-center gap-1 text-2xs text-content-tertiary">
                      <Clock size={11} />
                      Em análise — visível só para você
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
    </Drawer>
  );
};

export default FeedCommentsSheet;

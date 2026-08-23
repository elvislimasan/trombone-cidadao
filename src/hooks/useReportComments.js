import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { useMissionProgress } from '@/contexts/MissionProgressContext';
import { useAuth } from '@/contexts/SupabaseAuthContext';

/**
 * Comentarios de uma bronca, para a folha do feed.
 *
 * Comentarios entram como `pending_approval` e so aparecem para todos depois da
 * moderacao. Aqui mostramos os aprovados MAIS os pendentes do proprio autor:
 * sem isso, enviar um comentario nao muda nada na tela e parece que falhou.
 * O pendente vai marcado (`isPending`) para a UI deixar claro que ainda nao
 * esta publico — nao e o mesmo que ja ter sido publicado.
 *
 * Moderador (admin/master) ve TODOS os pendentes e pode aprovar ali mesmo.
 * Duas razoes: a RLS ja entrega essas linhas para ele (entao o contador do card
 * as somava enquanto a folha as escondia — "1 pessoas ja comentaram" numa folha
 * vazia), e a fila de /admin/moderacao/comentarios exige sair do feed para
 * liberar uma frase de tres palavras.
 */
export function useReportComments(reportId, { enabled = true } = {}) {
  const { user } = useAuth();
  const canModerate = Boolean(user?.is_admin || user?.is_master);
  const { celebrar } = useMissionProgress();
  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [moderatingId, setModeratingId] = useState(null);
  const cancelRef = useRef(false);

  const fetch = useCallback(async () => {
    if (!reportId) return;
    setLoading(true);
    setError(null);
    try {
      const { data, error: err } = await supabase
        .from('comments')
        .select('id, text, created_at, author_id, moderation_status, author:profiles!comments_author_id_fkey(name, avatar_url)')
        .eq('report_id', reportId)
        .order('created_at', { ascending: true });
      if (err) throw err;
      if (cancelRef.current) return;

      const visible = (data || [])
        .filter(
          (c) =>
            c.moderation_status === 'approved' ||
            (user && c.author_id === user.id) ||
            // Rejeitado nao volta a aparecer nem para o moderador: a folha do
            // feed e para o que ainda esta em decisao.
            (canModerate && c.moderation_status === 'pending_approval')
        )
        .map((c) => ({
          id: c.id,
          text: c.text,
          created_at: c.created_at,
          authorName: c.author?.name || 'Anônimo',
          authorAvatar: c.author?.avatar_url || null,
          isPending: c.moderation_status !== 'approved',
          isMine: Boolean(user && c.author_id === user.id),
        }));

      setComments(visible);
    } catch (e) {
      if (!cancelRef.current) setError(e?.message || 'Não foi possível carregar os comentários.');
    } finally {
      if (!cancelRef.current) setLoading(false);
    }
  }, [reportId, user, canModerate]);

  useEffect(() => {
    cancelRef.current = false;
    if (enabled) fetch();
    return () => { cancelRef.current = true; };
  }, [enabled, fetch]);

  const submit = useCallback(
    async (text) => {
      const trimmed = (text || '').trim();
      if (!trimmed || !reportId || !user) return { ok: false };

      setSubmitting(true);
      try {
        const { data, error: err } = await supabase
          .from('comments')
          .insert({
            report_id: reportId,
            author_id: user.id,
            text: trimmed,
            moderation_status: 'pending_approval',
          })
          .select('id, text, created_at')
          .single();
        if (err) throw err;

        // Insere direto na lista em vez de refazer o fetch: o comentario ja
        // volta do insert e a folha esta aberta na frente do usuario.
        // Comentário conta para a missão da trilha Comunidade.
        celebrar();

        setComments((prev) => [
          ...prev,
          {
            id: data.id,
            text: data.text,
            created_at: data.created_at,
            authorName: user.name || 'Você',
            authorAvatar: user.avatar_url || null,
            isPending: true,
            isMine: true,
          },
        ]);
        return { ok: true };
      } catch (e) {
        return { ok: false, error: e?.message || 'Não foi possível enviar o comentário.' };
      } finally {
        setSubmitting(false);
      }
    },
    [reportId, user, celebrar]
  );

  /**
   * Aprova ou rejeita sem sair do feed. So o moderador chega aqui — a RLS de
   * `comments` recusa a troca de status de qualquer outra pessoa, entao o botao
   * escondido na UI nao e a unica tranca.
   */
  const moderate = useCallback(
    async (commentId, status) => {
      if (!canModerate || !commentId) return { ok: false };

      setModeratingId(commentId);
      try {
        const { error: err } = await supabase
          .from('comments')
          .update({ moderation_status: status })
          .eq('id', commentId);
        if (err) throw err;

        setComments((prev) =>
          status === 'approved'
            ? prev.map((c) => (c.id === commentId ? { ...c, isPending: false } : c))
            : prev.filter((c) => c.id !== commentId)
        );
        return { ok: true };
      } catch (e) {
        return { ok: false, error: e?.message || 'Não foi possível moderar o comentário.' };
      } finally {
        setModeratingId(null);
      }
    },
    [canModerate]
  );

  // Contagem publica: pendentes do proprio autor nao entram, senao o numero no
  // card divergiria do que as outras pessoas veem.
  const publicCount = comments.filter((c) => !c.isPending).length;

  return {
    comments,
    loading,
    error,
    submit,
    submitting,
    publicCount,
    refresh: fetch,
    canModerate,
    moderate,
    moderatingId,
  };
}

import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { useMissionProgress } from '@/contexts/MissionProgressContext';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { mascarar } from '@/lib/profanity';

/**
 * Comentarios de uma bronca, para a folha do feed.
 *
 * Comentario publica na hora (migracao 193). O que segura o conteudo ruim vem
 * depois da publicacao, em duas camadas:
 *   - baixo calao sai mascarado na escrita (src/lib/profanity.js);
 *   - 3 denuncias tiram o comentario do ar e o mandam para a moderacao.
 *
 * Por isso `isPending` aqui nao quer mais dizer "esperando aprovacao": quer
 * dizer "foi denunciado e esta em revisao". So o autor e a moderacao enxergam
 * um comentario nesse estado — a RLS cuida disso, o filtro abaixo so repete a
 * regra para o caso do proprio autor.
 */
export function useReportComments(reportId, { enabled = true } = {}) {
  const { user } = useAuth();
  const canModerate = Boolean(user?.is_admin || user?.is_master);
  const { celebrate } = useMissionProgress();
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
        .select(
          'id, text, created_at, author_id, moderation_status, ' +
          'author:profiles!comments_author_id_fkey(name, avatar_url), ' +
          // Só para saber se ESTA pessoa já denunciou: a RLS de comment_reports
          // entrega as próprias denúncias, e a moderação, todas.
          'denuncias:comment_reports(id, reporter_id, resolved_at)'
        )
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
        .map((c) => {
          const abertas = (c.denuncias || []).filter((d) => !d.resolved_at);
          return {
            id: c.id,
            text: c.text,
            created_at: c.created_at,
            authorName: c.author?.name || 'Anônimo',
            authorAvatar: c.author?.avatar_url || null,
            isPending: c.moderation_status !== 'approved',
            isMine: Boolean(user && c.author_id === user.id),
            jaDenunciei: Boolean(user && abertas.some((d) => d.reporter_id === user.id)),
          };
        });

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

      // Mascara ANTES de gravar: o texto que vai para o banco é o mesmo que
      // todo mundo lê, inclusive quem escreveu. Sem isso o autor veria a
      // própria frase inteira e ninguém mais.
      const { texto, mascarou } = mascarar(trimmed);

      setSubmitting(true);
      try {
        const { data, error: err } = await supabase
          .from('comments')
          .insert({
            report_id: reportId,
            author_id: user.id,
            text: texto,
            moderation_status: 'approved',
          })
          .select('id, text, created_at')
          .single();
        if (err) throw err;

        // Insere direto na lista em vez de refazer o fetch: o comentario ja
        // volta do insert e a folha esta aberta na frente do usuario.
        celebrate();
        setComments((prev) => [
          ...prev,
          {
            id: data.id,
            text: data.text,
            created_at: data.created_at,
            authorName: user.name || 'Você',
            authorAvatar: user.avatar_url || null,
            isPending: false,
            isMine: true,
            jaDenunciei: false,
          },
        ]);
        return { ok: true, mascarou };
      } catch (e) {
        return { ok: false, error: e?.message || 'Não foi possível enviar o comentário.' };
      } finally {
        setSubmitting(false);
      }
    },
    [reportId, user, celebrate]
  );

  /**
   * Denuncia. Na terceira denuncia aberta, um gatilho no banco tira o
   * comentario do ar — a conta nao passa pelo cliente, senao bastaria mentir
   * sobre ela.
   *
   * O UNIQUE (comment_id, reporter_id) e o que impede uma pessoa sozinha de
   * derrubar qualquer comentario clicando tres vezes; o 23505 que ele devolve
   * nao e erro para quem usa, e "voce ja denunciou".
   */
  const denunciar = useCallback(
    async (commentId, reason = null) => {
      if (!commentId || !user) return { ok: false };

      try {
        const { error: err } = await supabase
          .from('comment_reports')
          .insert({ comment_id: commentId, reporter_id: user.id, reason });

        if (err && err.code !== '23505') throw err;

        // Refaz a busca: se esta foi a terceira, o comentario ja saiu do ar e
        // some da lista sozinho.
        await fetch();
        return { ok: true, repetida: err?.code === '23505' };
      } catch (e) {
        return { ok: false, error: e?.message || 'Não foi possível registrar a denúncia.' };
      }
    },
    [user, fetch]
  );

  /**
   * Apaga o proprio comentario. Some de vez, para todo mundo — quem escreveu
   * pode se arrepender, e a RLS da 170 ja permitia isso sem que a tela
   * oferecesse.
   *
   * Aqui e DELETE mesmo, nao 'rejected': o autor apagando o proprio texto nao
   * e materia de moderacao, e nao ha o que arquivar.
   */
  const excluir = useCallback(
    async (commentId) => {
      if (!commentId || !user) return { ok: false };

      setModeratingId(commentId);
      try {
        const { error: err } = await supabase.from('comments').delete().eq('id', commentId);
        if (err) throw err;

        setComments((prev) => prev.filter((c) => c.id !== commentId));
        return { ok: true };
      } catch (e) {
        return { ok: false, error: e?.message || 'Não foi possível excluir o comentário.' };
      } finally {
        setModeratingId(null);
      }
    },
    [user]
  );

  /**
   * Decisao da moderacao sobre um comentario denunciado.
   *
   * Vai por RPC porque restaurar o comentario e zerar as denuncias precisam
   * acontecer juntos: um comentario restaurado com o placar cheio cairia de
   * novo na denuncia seguinte. A RPC tambem confere `is_admin` no servidor — o
   * item escondido no menu nao e a tranca.
   */
  const moderate = useCallback(
    async (commentId, status) => {
      if (!canModerate || !commentId) return { ok: false };

      setModeratingId(commentId);
      try {
        const { error: err } = await supabase.rpc('moderar_comentario', {
          p_comment_id: commentId,
          p_status: status,
        });
        if (err) throw err;

        setComments((prev) =>
          status === 'approved'
            ? prev.map((c) => (c.id === commentId ? { ...c, isPending: false, jaDenunciei: false } : c))
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

  // Contagem publica: o denunciado em revisao nao entra, senao o numero no card
  // divergiria do que as outras pessoas veem.
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
    denunciar,
    excluir,
  };
}

import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, MessageCircle, Send, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/customSupabaseClient';
import { communityTreePath } from '@/lib/communityTrees';
import { COMMUNITY_COMMENT_PAGE_SIZE, deleteCommunityComment, loadCommunityComments, publishCommunityComment } from '@/lib/communityTreeComments';
import { useCommunityAction } from './CommunityTreeForms';

const initials = name => (name || 'Cidadão').trim().split(/\s+/).slice(0, 2).map(word => word[0]).join('').toUpperCase();
const dateLabel = value => new Date(value).toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' });

export default function CommunityTreeComments({ tree, user }) {
  const [rows, setRows] = useState([]), [loading, setLoading] = useState(true), [failure, setFailure] = useState('');
  const [pages, setPages] = useState(1), [more, setMore] = useState(false), [revision, setRevision] = useState(0);
  const [body, setBody] = useState(''), [notice, setNotice] = useState(''), [deleting, setDeleting] = useState(null);
  const draftId = useRef(null), section = useRef(null);
  const action = useCommunityAction();
  useEffect(() => {
    let active = true; setLoading(true); setFailure('');
    (async () => {
      const entries = []; let hasMore = false;
      for (let page = 0; page < pages; page++) {
        const batch = await loadCommunityComments(supabase, tree.id, page);
        entries.push(...(batch || [])); hasMore = batch?.length === COMMUNITY_COMMENT_PAGE_SIZE;
        if (!hasMore) break;
      }
      if (active) { setRows(entries); setMore(hasMore); }
    })().catch(error => { if (active) setFailure(error.message); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [tree.id, pages, revision]);
  useEffect(() => {
    if (window.location.hash !== '#comentarios') return;
    const frame = requestAnimationFrame(() => section.current?.scrollIntoView({ block: 'start', behavior: 'instant' }));
    return () => cancelAnimationFrame(frame);
  }, []);
  const submit = event => {
    event.preventDefault(); if (!user || action.busy) return;
    draftId.current ||= crypto.randomUUID();
    action.run(async () => {
      await publishCommunityComment(supabase, { id: draftId.current, treeId: tree.id, body });
      draftId.current = null; setBody(''); setNotice('Comentário publicado.'); setRevision(value => value + 1);
    });
  };
  return <section ref={section} className="community-comments" id="comentarios" aria-labelledby="community-comments-title">
    <header><span><MessageCircle size={21} aria-hidden="true" /></span><div><h2 id="community-comments-title">Comentários</h2><p>Uma conversa que também faz crescer.</p></div></header>
    {user ? <form onSubmit={submit} className="community-comment-composer"><label htmlFor="tree-comment-body" className="sr-only">Seu comentário sobre {tree.name}</label><textarea id="tree-comment-body" rows={3} maxLength={1000} required value={body} disabled={action.busy} onChange={event => setBody(event.target.value)} placeholder="Deixe uma mensagem ou compartilhe uma dica…" /><div><small>Comentários públicos · {body.length}/1000</small><Button type="submit" disabled={action.busy || !body.trim()}>{action.busy ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}Publicar</Button></div></form> : <div className="community-comments-login"><p>Entre para participar da conversa.</p><Button asChild variant="outline"><Link to="/login" state={{ from: { pathname: communityTreePath(tree.id), hash: '#comentarios' } }}>Entrar e comentar</Link></Button></div>}
    {action.error && <p ref={action.errorRef} role="alert" tabIndex={-1} className="community-error">{action.error}</p>}
    {notice && <p role="status" className="community-comment-notice">{notice}</p>}
    {failure ? <div role="alert" className="community-comments-error"><p>{failure}</p><Button variant="outline" onClick={() => setRevision(value => value + 1)}>Tentar novamente</Button></div> : <>
      {loading && <p role="status" className="community-comment-loading"><Loader2 size={18} className="animate-spin" />Carregando comentários…</p>}
      {!loading && !rows.length && <p className="community-comments-empty">A conversa começa com você.</p>}
      <ol className="community-comments-list">{rows.map(comment => <li key={comment.id}><span className="community-comment-avatar" aria-hidden="true">{initials(comment.author_name)}</span><article><header><strong>{comment.author_name}{comment.is_author && <small>Você</small>}</strong><time dateTime={comment.created_at}>{dateLabel(comment.created_at)}</time></header><p>{comment.body}</p>{comment.can_delete && (deleting === comment.id ? <div className="community-comment-confirm"><span>Excluir comentário?</span><button type="button" disabled={action.busy} onClick={() => setDeleting(null)}>Cancelar</button><button type="button" disabled={action.busy} onClick={() => action.run(async () => { await deleteCommunityComment(supabase, comment.id); setDeleting(null); setNotice('Comentário excluído.'); setRevision(value => value + 1); })}>Excluir</button></div> : <button type="button" className="community-comment-delete" disabled={action.busy} onClick={() => setDeleting(comment.id)}><Trash2 size={13} aria-hidden="true" />Excluir</button>)}</article></li>)}</ol>
      {more && <Button variant="outline" disabled={loading} onClick={() => setPages(value => value + 1)}>Ver mais comentários</Button>}
    </>}
  </section>;
}

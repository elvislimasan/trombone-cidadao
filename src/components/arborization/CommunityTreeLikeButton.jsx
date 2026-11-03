import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Heart, Loader2 } from 'lucide-react';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import useCommunityTreeLike from '@/hooks/useCommunityTreeLike';
import './communityTreeSocial.css';

export default function CommunityTreeLikeButton({ tree, compact = false }) {
  const { user } = useAuth(), navigate = useNavigate(), location = useLocation();
  const like = useCommunityTreeLike(tree, user?.id);
  if (tree.status !== 'approved' || !tree.public_profile) return null;
  return <div className={`community-tree-like${like.error ? ' has-error' : ''}`}><button type="button" className={`community-like-button${like.liked ? ' is-liked' : ''}`} disabled={like.busy} aria-pressed={like.liked} aria-busy={like.busy} aria-label={`${like.liked ? 'Descurtir' : 'Curtir'} a árvore ${tree.name}${like.count != null ? `, ${like.count} ${like.count === 1 ? 'curtida' : 'curtidas'}` : ''}`} title={like.liked ? 'Desfazer curtida' : 'Curtir esta árvore'} onClick={() => {
    if (!user) { navigate('/login', { state: { from: { pathname: location.pathname, search: location.search, hash: location.hash } } }); return; }
    like.toggle();
  }}>{like.busy ? <Loader2 size={18} className="animate-spin" aria-hidden="true" /> : <Heart size={18} aria-hidden="true" />}{!compact && <span>{like.liked ? 'Curtiu' : 'Curtir'}</span>}{like.count != null && <strong>{like.count.toLocaleString('pt-BR')}</strong>}</button>{like.error && <p role="alert">{like.error}</p>}</div>;
}

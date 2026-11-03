import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import Avatar from 'react-nice-avatar';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import './communityTreeSocial.css';

const avatarKeys = ['sex', 'faceColor', 'earSize', 'eyeStyle', 'noseStyle', 'mouthStyle', 'shirtStyle', 'glassesStyle', 'hairColor', 'hairStyle', 'hatStyle', 'hatColor', 'eyeBrowStyle', 'shirtColor', 'bgColor'];
function avatarConfig(value) {
  try {
    const config = typeof value === 'string' ? JSON.parse(value) : value;
    if (!config || typeof config !== 'object' || Array.isArray(config)) return null;
    const safe = Object.fromEntries(avatarKeys.filter(key => typeof config[key] === 'string').map(key => [key, config[key]]));
    return Object.keys(safe).length ? safe : null;
  } catch { return null; }
}

export default function CommunityTreeAuthor({ tree }) {
  const { user } = useAuth();
  const author = tree.author || (tree.is_owner && user ? { name: user.name || user.user_metadata?.full_name || 'Você', avatar_type: user.avatar_type, avatar_url: user.avatar_url, avatar_config: user.avatar_config } : null);
  const name = String(author?.name || 'Cidadão da comunidade').trim();
  const [failedUrl, setFailedUrl] = useState(null);
  const url = typeof author?.avatar_url === 'string' && /^(https?:\/\/|\/(?!\/))/.test(author.avatar_url) ? author.avatar_url : null;
  const config = author?.avatar_type === 'generated' ? avatarConfig(author.avatar_config) : null;
  const initials = name.split(/\s+/).slice(0, 2).map(word => Array.from(word)[0]).join('').toUpperCase();
  const content = <><span className="community-tree-author-avatar" aria-hidden="true">{url && url !== failedUrl ? <img src={url} alt="" loading="lazy" onError={() => setFailedUrl(url)} /> : config ? <Avatar {...config} className="w-full h-full" /> : <span>{initials || 'C'}</span>}</span><span className="community-tree-author-name"><small>Cadastrada por</small><strong>{name}</strong></span></>;
  return author?.username ? <Link className="community-tree-author" to={`/${encodeURIComponent(author.username)}`}>{content}</Link> : <div className="community-tree-author">{content}</div>;
}

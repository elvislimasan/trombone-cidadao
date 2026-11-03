import React, { useEffect, useState } from 'react';
import { ArrowUpRight, Camera, ClipboardList, Image, Leaf, MessageCircle, Smartphone, Sprout } from 'lucide-react';

export function CommunityTreeSectionNav({ publicTree }) {
  const [active, setActive] = useState(() => typeof window !== 'undefined' ? window.location.hash.slice(1) || 'tree-diary' : 'tree-diary');
  useEffect(() => {
    const update = () => setActive(window.location.hash.slice(1) || 'tree-diary');
    window.addEventListener('hashchange', update);
    return () => window.removeEventListener('hashchange', update);
  }, []);
  const sections = [
    ['tree-diary', 'Diário', ClipboardList], ['tree-photos', 'Fotos', Image], ['tree-about', 'Sobre', Leaf],
    ...(publicTree ? [['comentarios', 'Comentários', MessageCircle]] : []),
  ];
  return <nav className="tree-profile-sections" aria-label="Informações desta árvore">{sections.map(([id, label, Icon]) => <a href={`#${id}`} key={id} onClick={() => setActive(id)} aria-current={active === id ? 'location' : undefined}><Icon size={16} aria-hidden="true" />{label}</a>)}</nav>;
}

export function CommunityTreeInvitation({ tree, care = [], onCare, onPhoto, onShare }) {
  const publicPhotos = (tree.photo_url ? 1 : 0) + care.filter(entry => entry.photo_url && entry.is_public && !entry.is_hidden).length;
  if (tree.status === 'approved' && tree.public_profile && publicPhotos >= 2 && onShare) return <section className="tree-profile-invitation" aria-label="Compartilhar antes e depois"><span><Smartphone size={24} aria-hidden="true" /></span><div><h2>Veja o quanto essa história cresceu.</h2><p>Compartilhe o antes e depois em um story com as fotos da árvore.</p></div><button type="button" onClick={onShare}>Compartilhar story<ArrowUpRight size={17} /></button></section>;
  const first = !Number(tree.care_count), Icon = first ? Sprout : Camera;
  if (!tree.is_owner && !(tree.status === 'approved' && tree.public_profile)) return null;
  return <section className="tree-profile-invitation" aria-label="Participe desta história"><span><Icon size={24} aria-hidden="true" /></span><div><h2>{tree.is_owner ? first ? 'O primeiro cuidado começa com você.' : 'Uma nova foto conta o que mudou.' : 'Uma árvore, muitas histórias.'}</h2><p>{tree.is_owner ? first ? 'Registre uma rega, uma foto ou uma observação.' : 'Guarde o crescimento para comparar o antes e depois.' : 'Deixe uma mensagem para quem cuida dela.'}</p></div>{tree.is_owner ? <button type="button" onClick={first ? onCare : onPhoto}>{first ? 'Começar diário' : 'Adicionar foto'}<ArrowUpRight size={17} /></button> : <a href="#comentarios">Deixar comentário<ArrowUpRight size={17} /></a>}</section>;
}

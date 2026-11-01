import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, Camera, Droplets, MapPin, MessageCircle, Share2 } from 'lucide-react';
import { COMMUNITY_TREE_STATUS, communityTreePath } from '@/lib/communityTrees';
import { TreeOwnerActions } from './CommunityTreeOwnerActions';

function TreeCoverIllustration() {
  return <svg className="community-tree-illustration" viewBox="0 0 480 260" aria-hidden="true"><circle cx="375" cy="55" r="38" fill="#f4df9b" /><path d="M0 228Q110 185 240 225T480 215V260H0Z" fill="#c5d9b7" /><path d="M0 249Q130 214 270 246T480 233V260H0Z" fill="#a7c597" /><ellipse cx="240" cy="238" rx="90" ry="10" fill="#8cb07a" opacity=".3" /><path d="M236 235L238 98H251L255 235Z" fill="#806347" /><path d="M244 180L199 140M245 151L286 109M244 129L218 102" fill="none" stroke="#806347" strokeWidth="9" strokeLinecap="round" /><path d="M161 117C124 87 159 42 195 53C196 13 255 15 270 44C313 25 345 68 326 96C357 135 312 161 282 151C253 180 214 161 206 151C168 171 139 145 161 117Z" fill="#3e8050" /><path d="M172 106C156 79 189 55 214 68C222 36 266 49 270 75C302 62 321 95 298 117C275 143 239 131 225 116C205 138 176 132 172 106Z" fill="#64a16a" /><path d="M106 231Q96 211 108 200Q124 214 106 231M357 239Q340 210 355 200Q373 219 357 239" fill="#54884e" /><path d="M72 63l5-10m-15 9 10 4M405 168l5-10m-15 9 10 4" stroke="#71966a" strokeWidth="3" strokeLinecap="round" /></svg>;
}

export default function CommunityTreeCard({ tree, mine, onDelete, onShare }) {
  const profile = communityTreePath(tree.id);
  const publicTree = tree.status === 'approved' && tree.public_profile;
  return <article className="community-tree-card">
    <div className={`community-tree-card-media${!tree.photo_url ? ' is-illustrated' : ''}`}>
      <Link to={profile} className="community-tree-card-photo" aria-label={`Conhecer ${tree.name}`}>{tree.photo_url ? <img src={tree.photo_url} alt={`árvore ${tree.name}`} loading="lazy" /> : <TreeCoverIllustration />}</Link>
      {mine && <span className={`community-status is-${tree.status}`}>{COMMUNITY_TREE_STATUS[tree.status]}</span>}
      {!tree.photo_url && <span className="community-card-illustration-label">Ilustração</span>}
      {mine && <Link className="community-card-cover-button" to={`${profile}/editar`} aria-label={`${tree.photo_url ? 'Trocar' : 'Adicionar'} foto de ${tree.name}`} title={tree.photo_url ? 'Trocar foto de capa' : 'Adicionar foto de capa'}><Camera size={17} /></Link>}
    </div>
    <div className="community-tree-card-copy">
      <div className="community-card-title"><Link to={profile}><h3>{tree.name}</h3></Link><Link to={profile} aria-label={`Abrir perfil de ${tree.name}`}><ArrowUpRight size={20} /></Link></div>
      <p className="community-card-species">{tree.species_name || 'Espécie a identificar'}</p>
      <div className="community-card-meta"><span><MapPin size={14} aria-hidden="true" />{tree.city_name}</span><span><Droplets size={14} aria-hidden="true" />{Number(tree.care_count) || 0} {Number(tree.care_count) === 1 ? 'cuidado' : 'cuidados'}</span></div>
      <Link className="community-tree-card-cta" to={mine ? `${profile}?acao=cuidar` : profile}><Droplets size={17} aria-hidden="true" />{mine ? 'Registrar cuidado' : 'Conhecer esta árvore'}<ArrowUpRight size={16} aria-hidden="true" /></Link>
      <div className="community-card-social">{publicTree ? <Link to={`${profile}#comentarios`}><MessageCircle size={17} aria-hidden="true" />Comentar</Link> : <span title="Comentários disponíveis em perfis públicos aprovados"><MessageCircle size={17} aria-hidden="true" />{tree.public_profile ? 'Em análise' : 'Perfil privado'}</span>}<button type="button" disabled={!publicTree} onClick={() => onShare?.(tree)} title={publicTree ? 'Compartilhar esta árvore' : 'Disponível em perfis públicos aprovados'}><Share2 size={17} aria-hidden="true" />Compartilhar</button></div>
      {mine && <TreeOwnerActions tree={tree} onDelete={onDelete} />}
    </div>
  </article>;
}

import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Camera, Droplets, EyeOff, MapPin, MessageCircle, MoreHorizontal, Pencil, Share2, ShieldCheck, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { COMMUNITY_TREE_STATUS, communityTreePath } from '@/lib/communityTrees';
import TreeProgramPhoto from './TreeProgramPhoto';
import CommunityTreeAuthor from './CommunityTreeAuthor';
import CommunityTreeLikeButton from './CommunityTreeLikeButton';

const shortDate = value => value ? new Date(`${value.slice(0, 10)}T12:00:00`).toLocaleDateString('pt-BR') : '';

export default function CommunityTreeProfileHero({ tree, care = [], onCare, onPhoto, onPrivacy, onReview, onShare, onDelete }) {
  const profile = communityTreePath(tree.id), publicTree = tree.status === 'approved' && tree.public_profile;
  const [coverFailed, setCoverFailed] = useState(false);
  useEffect(() => { setCoverFailed(false); }, [tree.id, tree.photo_url]);
  const latestCare = care.map(entry => entry.performed_on).filter(Boolean).sort().at(-1);
  return <>
    <div className="community-profile-topbar"><Link to={`/arvores-da-comunidade?${tree.is_owner ? 'aba=minhas&' : ''}cidade=${tree.city_id}`}><ArrowLeft size={18} />{tree.is_owner ? 'Minhas árvores' : 'Comunidade'}</Link>
      <DropdownMenu><DropdownMenuTrigger asChild><Button variant="outline" size="icon" aria-label={`Opções de ${tree.name}`}><MoreHorizontal size={21} /></Button></DropdownMenuTrigger><DropdownMenuContent align="end" className="community-profile-menu">
        {tree.is_owner && <><DropdownMenuItem asChild><Link to={`${profile}/editar`}><Pencil size={16} />Editar árvore</Link></DropdownMenuItem><DropdownMenuItem onSelect={onPhoto}><Camera size={16} />Adicionar fotos</DropdownMenuItem><DropdownMenuItem onSelect={onPrivacy}><EyeOff size={16} />Privacidade</DropdownMenuItem><DropdownMenuSeparator /></>}
        {publicTree && <><DropdownMenuItem onSelect={onShare}><Share2 size={16} />Compartilhar / criar story</DropdownMenuItem><DropdownMenuItem asChild><a href="#comentarios"><MessageCircle size={16} />Comentários</a></DropdownMenuItem></>}
        {tree.can_review && <DropdownMenuItem onSelect={onReview}><ShieldCheck size={16} />Revisar cadastro</DropdownMenuItem>}
        {tree.is_owner && <><DropdownMenuSeparator /><DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={onDelete}><Trash2 size={16} />Excluir árvore</DropdownMenuItem></>}
        {!tree.is_owner && !publicTree && !tree.can_review && <DropdownMenuItem asChild><Link to="/arvores-da-comunidade">Ver comunidade</Link></DropdownMenuItem>}
      </DropdownMenuContent></DropdownMenu>
    </div>
    <header className="tree-profile-summary"><a className="tree-profile-cover" href="#tree-photos" aria-label={`Ver fotos de ${tree.name}`}>
      {tree.photo_url && !coverFailed ? <img src={tree.photo_url} alt={`Árvore ${tree.name}`} onError={() => setCoverFailed(true)} /> : <TreeProgramPhoto name="tree" alt="Árvores em uma praça. Capa ilustrativa do programa de arborização." loading="eager" sizes="(max-width: 767px) 100vw, 50vw" />}
      <span className={`community-status is-${tree.status}`}>{tree.public_profile ? COMMUNITY_TREE_STATUS[tree.status] : 'Perfil privado'}</span><span className="tree-profile-cover-link"><Camera size={15} aria-hidden="true" />Ver fotos</span>
    </a><div className="tree-profile-introduction"><div className="community-tree-heading"><h1>{tree.name}</h1><p className="community-tree-identity"><span>{tree.species_name || 'Espécie a identificar'}</span><span><MapPin size={13} aria-hidden="true" />{tree.city_name}</span></p></div>
      <div className="tree-profile-people"><CommunityTreeAuthor tree={tree} /><CommunityTreeLikeButton tree={tree} compact /></div>
      <dl className="tree-profile-highlights"><div><dt>Cuidados</dt><dd>{Number(tree.care_count) || 0}</dd></div><div><dt>Último cuidado</dt><dd>{latestCare ? <time dateTime={latestCare}>{shortDate(latestCare)}</time> : 'Ainda sem registro'}</dd></div><div><dt>{tree.planted_on ? 'Plantada em' : 'Cadastrada em'}</dt><dd><time dateTime={tree.planted_on || tree.created_at}>{shortDate(tree.planted_on || tree.created_at)}</time></dd></div></dl>
      {tree.is_owner ? <Button className="tree-profile-primary" onClick={onCare}><Droplets size={18} />Registrar cuidado</Button> : publicTree && <a className="tree-profile-public-cta" href="#comentarios"><MessageCircle size={17} />Deixar um comentário</a>}
    </div></header>
  </>;
}

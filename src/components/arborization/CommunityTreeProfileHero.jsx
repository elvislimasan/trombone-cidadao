import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Camera, Droplets, EyeOff, MapPin, MessageCircle, MoreHorizontal, Pencil, Share2, ShieldCheck, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { COMMUNITY_TREE_STATUS, communityTreePath } from '@/lib/communityTrees';
import TreeProgramPhoto from './TreeProgramPhoto';

export default function CommunityTreeProfileHero({ tree, onCare, onPhoto, onPrivacy, onReview, onShare, onDelete }) {
  const profile = communityTreePath(tree.id), publicTree = tree.status === 'approved' && tree.public_profile;
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
    <header className="community-profile-hero"><div className="community-profile-hero-image">
      {tree.photo_url ? <img src={tree.photo_url} alt={`Árvore ${tree.name}`} /> : <TreeProgramPhoto name="tree" alt="Árvores em uma praça. Capa ilustrativa do programa de arborização." loading="eager" sizes="100vw" />}
      <div className="community-profile-hero-copy"><span className={`community-status is-${tree.status}`}>{tree.public_profile ? COMMUNITY_TREE_STATUS[tree.status] : 'Perfil privado'}</span><h1>{tree.name}</h1><p>{tree.species_name || 'Espécie a identificar'}<span><MapPin size={13} />{tree.city_name}</span></p></div>
    </div><div className="community-profile-hero-footer"><span><Droplets size={18} /><strong>{Number(tree.care_count) || 0}</strong>{Number(tree.care_count) === 1 ? 'cuidado registrado' : 'cuidados registrados'}</span>{tree.is_owner && <Button onClick={onCare}><Droplets size={17} />Registrar cuidado</Button>}</div></header>
  </>;
}

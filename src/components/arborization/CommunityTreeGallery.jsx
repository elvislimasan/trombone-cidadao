import React, { useState } from 'react';
import { Camera, ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { communityPhotoGallery } from '@/lib/communityTrees';

export default function CommunityTreeGallery({ tree, care, onAddPhoto }) {
  const [active, setActive] = useState(null);
  const photos = communityPhotoGallery(tree, care);
  const index = active == null ? null : Math.min(active, photos.length - 1);
  const photo = index == null ? null : photos[index];
  return <section className="community-gallery" aria-label="Fotos da árvore"><header><div><h2>Fotos da árvore</h2><p>{photos.length ? `${photos.length} ${photos.length === 1 ? 'foto no histórico carregado' : 'fotos no histórico carregado'}` : 'Registre o crescimento com novas fotos.'}</p></div>{tree.is_owner && <Button type="button" variant="outline" size="sm" onClick={onAddPhoto}><Plus size={16} />Adicionar foto</Button>}</header>
    {photos.length ? <div className="community-gallery-grid">{photos.map((item, number) => <button type="button" key={item.id} onClick={() => setActive(number)} aria-label={`Ampliar ${item.label.toLowerCase()} de ${tree.name}`}><img src={item.url} alt={`${item.label} de ${tree.name}`} loading="lazy" /><span>{item.label}</span></button>)}</div> : <div className="community-gallery-empty"><Camera size={25} /><span>As fotos de capa e dos cuidados aparecerão aqui.</span></div>}
    {photo && <Dialog open onOpenChange={open => { if (!open) setActive(null); }}><DialogContent className="community-gallery-dialog sm:max-w-3xl"><DialogTitle>{tree.name} · {photo.label}</DialogTitle><DialogDescription>{index + 1} de {photos.length} · A visibilidade segue a privacidade de cada registro.</DialogDescription><img className="community-gallery-full" src={photo.url} alt={`${photo.label} de ${tree.name}`} /><div className="community-gallery-controls"><Button variant="outline" disabled={index === 0} onClick={() => setActive(index - 1)}><ChevronLeft size={17} />Anterior</Button><Button variant="outline" disabled={index === photos.length - 1} onClick={() => setActive(index + 1)}>Próxima<ChevronRight size={17} /></Button></div></DialogContent></Dialog>}
  </section>;
}

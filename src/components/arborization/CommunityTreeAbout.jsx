import React, { lazy, Suspense, useEffect, useState } from 'react';
import { CalendarDays, ChevronDown, EyeOff, Info, Leaf, Loader2, MapPin, Sprout } from 'lucide-react';

const LocationPickerMap = lazy(() => import('@/components/LocationPickerMap'));
const dateLabel = value => value ? new Date(value.length === 10 ? `${value}T12:00:00` : value).toLocaleDateString('pt-BR') : 'Não informado';

export default function CommunityTreeAbout({ tree }) {
  const [open, setOpen] = useState(() => window.matchMedia('(min-width: 900px)').matches);
  useEffect(() => {
    const media = window.matchMedia('(min-width: 900px)');
    const resize = event => setOpen(event.matches);
    media.addEventListener('change', resize);
    return () => media.removeEventListener('change', resize);
  }, []);
  const facts = [
    [Leaf, 'Espécie', tree.species_name || 'A identificar'],
    [MapPin, 'Localização pública', tree.location_visibility === 'exact' ? tree.address || tree.city_name : tree.city_name],
    [CalendarDays, 'Primeiro registro', dateLabel(tree.created_at)],
    ...(tree.planted_on ? [[CalendarDays, 'Data do plantio', dateLabel(tree.planted_on)]] : []),
    [Sprout, 'Cuidados registrados', Number(tree.care_count) || 0],
  ];
  return <details id="tree-about" className="tree-profile-about" open={open} onToggle={event => setOpen(event.currentTarget.open)}>
    <summary><Info size={18} aria-hidden="true" /><h2>Sobre esta árvore</h2><ChevronDown size={17} aria-hidden="true" /></summary>
    <div className="tree-profile-about-content"><dl>{facts.map(([Icon, label, value]) => <div key={label}><Icon size={16} aria-hidden="true" /><div><dt>{label}</dt><dd>{value}</dd></div></div>)}</dl>
      {open && tree.location_visibility === 'exact' && tree.latitude != null && tree.longitude != null && <div className="community-profile-map"><Suspense fallback={<Loader2 className="animate-spin" />}><LocationPickerMap initialPosition={{ lat: tree.latitude, lng: tree.longitude }} initialZoom={16} readOnly /></Suspense></div>}
      {tree.is_owner && !(tree.status === 'approved' && tree.public_profile) && <p className="community-muted"><EyeOff size={16} />Compartilhamento disponível após aprovação do perfil público.</p>}
    </div>
  </details>;
}

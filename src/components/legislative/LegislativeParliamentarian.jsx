import React from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { MoreHorizontal } from 'lucide-react';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import LegislativeProfileContent from './LegislativeProfileContent';

export default function LegislativeParliamentarian({ data, cityId, filters, presentation }) {
  const { user } = useAuth();const person = data.parliamentarian;
  return <>
    <section className="legislative-panel legislative-person-header">
      <div className="legislative-person-identity">
        {person.data.photo_url ? <img className="legislative-profile-avatar" width={80} height={80} alt="" src={person.data.photo_url} /> : <span className="legislative-person-avatar legislative-profile-avatar" aria-hidden="true">{person.data.name.charAt(0)}</span>}
        <div><h2>{person.data.parliamentary_name || person.data.name}</h2>{person.data.parliamentary_name && person.data.parliamentary_name !== person.data.name && <p>{person.data.name}</p>}</div>
      </div>
      <div className="legislative-detail-actions">
        <Button asChild variant="outline"><a href={person.source_url} target="_blank" rel="noreferrer">Ficha oficial da Câmara</a></Button>
        {person.councilor && <Button asChild variant="outline"><Link to={`/vereadores/${cityId}/${person.councilor.slug}`}>Perfil no Trombone</Link></Button>}
        {(user?.is_admin || user?.is_master) && <DropdownMenu><DropdownMenuTrigger asChild><Button variant="outline" size="icon" aria-label="Ações do perfil"><MoreHorizontal size={18} /></Button></DropdownMenuTrigger><DropdownMenuContent align="end" className="legislative-display-menu"><DropdownMenuItem asChild><Link to={`/admin/legislativo?cidade=${cityId}&parlamentar=${person.id}`}>{person.councilor ? 'Gerir vínculo do perfil' : 'Criar ou vincular perfil'}</Link></DropdownMenuItem></DropdownMenuContent></DropdownMenu>}
      </div>
    </section>
    <LegislativeProfileContent key={person.id} data={data} cityId={cityId} parliamentarianId={person.id} filters={filters} showSource={false} presentation={presentation} />
  </>;
}

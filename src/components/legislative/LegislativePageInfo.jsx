import React, { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Info, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, FormDialogContent, DialogTitle } from '@/components/ui/dialog';
import { LegislativeMethodology, LegislativeSource } from './LegislativeComponents';
import LegislativeVerification from './LegislativeVerification';

export default function LegislativePageInfo({ cityId, source, correction }) {
  const [open, setOpen] = useState(false), [section, setSection] = useState('general');
  const origin = useRef(null), content = useRef(null);const { pathname } = useLocation();
  const show = target => { origin.current = document.activeElement;setSection(target);setOpen(true); };
  useEffect(() => { const handler = event => show(event.detail || 'general');window.addEventListener('legislative:data-info', handler);return () => window.removeEventListener('legislative:data-info', handler); }, []);
  useEffect(() => { setOpen(false); }, [pathname]);
  return <footer className="legislative-page-info">
    <div>{source?.collected_at && <span>Atualizado em {new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'America/Fortaleza' }).format(new Date(source.collected_at))}</span>}{source?.stale && <span className="legislative-stale" role="status">Atualização pendente · último acervo conferido</span>}</div>
    <Dialog open={open} onOpenChange={setOpen}>
      <div className="legislative-info-actions">{correction && <Button variant="ghost" size="sm" onClick={() => show('correction')}>Informar erro</Button>}<Button variant="ghost" size="sm" onClick={() => show('general')}><Info size={16} />Sobre os dados</Button></div>
      <FormDialogContent ref={content} className="legislative-info-dialog" hideClose aria-describedby={undefined} onCloseAutoFocus={event => { event.preventDefault();if (origin.current?.isConnected) origin.current.focus({ preventScroll: true }); }} onOpenAutoFocus={event => { const element = section === 'method' ? content.current?.querySelector('#metodo-legislativo') : section === 'correction' ? content.current?.querySelector('[data-legislative-correction]') : null;if (element) { element.open = true;event.preventDefault();element.querySelector('summary')?.focus(); } }}>
        <header className="legislative-floating-heading"><DialogTitle>Sobre os dados</DialogTitle><button type="button" className="legislative-icon-button" aria-label="Fechar informações" onClick={() => setOpen(false)}><X size={20} /></button></header>
        <LegislativeSource source={source} /><LegislativeVerification cityId={cityId} source={source} /><LegislativeMethodology />{correction}
      </FormDialogContent>
    </Dialog>
  </footer>;
}

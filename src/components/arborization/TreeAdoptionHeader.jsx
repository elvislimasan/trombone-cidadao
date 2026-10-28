import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Check, ClipboardList, HeartHandshake, Leaf, Loader2, Plus, Share2, Sprout, Sun, X } from 'lucide-react';
import CitySelector from '@/components/CitySelector';

export default function TreeAdoptionHeader({ cityId, city, tab, onTabChange }) {
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [manualLink, setManualLink] = useState('');
  const operation = useRef(0);
  useEffect(() => {
    operation.current++; setBusy(false); setFeedback(''); setManualLink('');
    return () => { operation.current++; };
  }, [cityId]);
  const share = async () => {
    if (busy) return;
    const token = ++operation.current;
    const url = new URL('/adote-uma-arvore', window.location.origin);
    if (cityId) url.searchParams.set('cidade', cityId);
    const invitation = { title: 'Adote uma árvore', text: `Vamos deixar ${city?.name || 'nossa cidade'} mais verde? Solicite uma muda ou plantio e acompanhe a avaliação da equipe.`, url: url.href };
    setBusy(true); setFeedback(''); setManualLink('');
    try {
      if (navigator.share) {
        try {
          await navigator.share(invitation);
          if (token === operation.current) setFeedback('Convite compartilhado');
          return;
        } catch (error) { if (error.name === 'AbortError') return; }
      }
      await navigator.clipboard.writeText(url.href);
      if (token === operation.current) setFeedback('Link copiado');
    } catch {
      if (token === operation.current) setManualLink(url.href);
    } finally { if (token === operation.current) setBusy(false); }
  };
  return <header className="adoption-page-header">
    <div className="adoption-heading"><Link to="/mapa-arborizacao" className="adoption-back-link" aria-label="Voltar ao mapa de arborização" title="Mapa de arborização"><ArrowLeft className="h-4 w-4" /></Link><span className="adoption-heading-mark" aria-hidden="true"><Sprout size={22} /></span><div className="min-w-0"><h1 className="adoption-page-title">Adote uma árvore</h1><p className="adoption-heading-invitation" title={city?.name ? `Mais sombra e vida para ${city.name}.` : undefined}>{city?.name ? `Mais sombra e vida para ${city.name}.` : 'Uma cidade mais verde começa com você.'}</p></div></div>
    <div className="adoption-header-engagement" aria-label="Por uma cidade mais verde"><span><Sun size={15} />Mais sombra</span><span><Leaf size={15} />Mais vida</span><span className="adoption-header-care"><HeartHandshake size={15} />Cuidado coletivo</span></div>
    <nav className="adoption-page-tabs" aria-label="Adote uma árvore"><button type="button" aria-current={tab === 'solicitar' ? 'page' : undefined} onClick={() => onTabChange('solicitar')}><Plus className="h-4 w-4" />Nova solicitação</button><button type="button" aria-current={tab === 'minhas' ? 'page' : undefined} onClick={() => onTabChange('minhas')}><ClipboardList className="h-4 w-4" />Minhas solicitações</button></nav>
    <div className="adoption-header-actions"><div className="adoption-header-share"><button type="button" className="adoption-invite-button" onClick={share} disabled={busy} aria-label="Convidar alguém para adotar uma árvore" title="Compartilhar o programa nesta cidade">{busy ? <Loader2 size={15} className="animate-spin" /> : feedback ? <Check size={15} /> : <Share2 size={15} />}<span>{feedback || 'Convide alguém'}</span></button><span className="sr-only" role="status">{feedback}</span>{manualLink && <div className="adoption-share-fallback"><div><p role="status">Copie o link e convide alguém:</p><button type="button" aria-label="Fechar link de convite" onClick={() => setManualLink('')}><X size={15} /></button></div><input aria-label="Link para convidar alguém" readOnly value={manualLink} onFocus={event => event.target.select()} /></div>}</div><div className="adoption-city-selector"><span className="sr-only">Cidade do plantio</span><CitySelector /></div></div>
  </header>;
}

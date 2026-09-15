import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, MapPin, Megaphone, ShieldCheck, Target } from 'lucide-react';
import { useAuth } from '@/contexts/SupabaseAuthContext';

const FeedWelcomeCard = ({ onCreateReport, cityName, cityImage }) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const displayCity = cityName || 'Todas as cidades';

  return (
    <div className="space-y-3 px-3 pb-3 pt-2">
      <button type="button" onClick={() => navigate('/mapa')} className="relative block h-[4.25rem] w-full overflow-hidden rounded-2xl text-left shadow-sm">
        {cityImage ? <img src={cityImage} alt={`Paisagem de ${displayCity}`} className="absolute inset-0 h-full w-full object-cover" /> : <div className="absolute inset-0 bg-brand" />}
        <span className="absolute inset-0 bg-gradient-to-r from-black/65 via-black/25 to-black/10" />
        <span className="relative flex h-full items-center justify-between px-3.5 text-white">
          <span className="min-w-0"><span className="flex items-center gap-1.5 text-sm font-extrabold"><MapPin className="h-4 w-4 shrink-0" aria-hidden="true" /><span className="truncate">{displayCity}</span></span><span className="mt-0.5 block pl-5 text-[9px] font-bold uppercase tracking-[0.12em] text-white/80">Ver mapa da cidade</span></span>
          <ArrowRight className="h-4 w-4 shrink-0" aria-hidden="true" />
        </span>
      </button>

      <div className="flex items-end justify-between gap-3 px-1">
        <div><h1 className="text-xl font-black tracking-tight text-content-primary">Olá, {user?.name?.split(' ')[0] || 'cidadão'}!</h1><p className="text-xs text-content-secondary">O que vamos fazer hoje?</p></div>
        <button type="button" onClick={() => navigate(user ? '/missoes' : '/login')} className="flex h-11 shrink-0 items-center gap-2 rounded-xl border border-edge-subtle bg-surface-raised px-3 text-left shadow-sm"><span className="flex items-end gap-0.5 text-brand"><span className="h-3 w-1 rounded-full bg-current" /><span className="h-5 w-1 rounded-full bg-current" /><span className="h-7 w-1 rounded-full bg-current" /></span><span><strong className="block text-xs font-extrabold text-content-primary">Nível 12</strong><small className="block text-[9px] text-content-secondary">Patrulheiro</small></span><ArrowRight className="h-3.5 w-3.5 text-content-tertiary" aria-hidden="true" /></button>
      </div>

      <div className="grid grid-cols-3 gap-2.5">
        <button type="button" onClick={onCreateReport} className="flex min-h-[5.75rem] min-w-0 flex-col items-center justify-center rounded-xl border border-brand/30 bg-surface-raised px-1.5 py-2 text-center text-brand shadow-sm transition hover:border-brand/50 hover:bg-brand-subtleBg"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-subtleBg"><Megaphone className="h-4 w-4" aria-hidden="true" /></span><strong className="mt-1.5 block text-[10px] leading-tight text-content-primary">Cadastrar<br />sua bronca</strong></button>
        <button type="button" onClick={() => navigate(user?.is_ambassador ? '/embaixador' : '/seja-embaixador')} className="flex min-h-[5.75rem] min-w-0 flex-col items-center justify-center rounded-xl border border-edge-subtle bg-surface-raised px-1.5 py-2 text-center shadow-sm"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-subtleBg text-brand"><ShieldCheck className="h-4 w-4" aria-hidden="true" /></span><strong className="mt-1.5 block text-[10px] leading-tight text-content-primary">Painel do<br />Embaixador</strong><small className="mt-0.5 text-[8px] leading-tight text-content-secondary">Acompanhe e gerencie</small></button>
        <button type="button" onClick={() => navigate(user ? '/missoes' : '/login')} className="flex min-h-[5.75rem] min-w-0 flex-col items-center justify-center rounded-xl border border-edge-subtle bg-surface-raised px-1.5 py-2 text-center shadow-sm"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-subtleBg text-brand"><Target className="h-4 w-4" aria-hidden="true" /></span><strong className="mt-1.5 block text-[10px] leading-tight text-content-primary">Missões</strong><small className="mt-0.5 text-[8px] leading-tight text-content-secondary">3 disponíveis</small><span className="mt-1 block h-1 w-full max-w-12 rounded-full bg-surface-sunken"><span className="block h-1 w-1/4 rounded-full bg-brand" /></span></button>
      </div>

    </div>
  );
};

export default FeedWelcomeCard;

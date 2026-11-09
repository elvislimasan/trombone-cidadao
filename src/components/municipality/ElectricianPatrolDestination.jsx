import React from 'react';
import { Navigation, Navigation2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { poleDisplayLabel } from '@/lib/poleDisplay';
import { formatarDistancia } from '@/lib/patrolAlvo';
import { NAV_ALERTA } from '@/lib/navGeo';

export default function ElectricianPatrolDestination({ target, route, loading, order, direction, paused, alertVisible, following, onNavigate, onSkip, onUpdate }) {
  const { pole, distance } = target;
  const mapped = route.tracado !== 'reta';
  const arrived = !paused && distance <= NAV_ALERTA.distanciaAlertaM;
  return <section aria-label="Caminho até o próximo poste" className="pointer-events-auto rounded-2xl border border-edge-subtle bg-surface-overlay/95 p-3 shadow-lg backdrop-blur-sm">
    <div className="flex items-center gap-3">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand text-content-onBrand">
        {Number.isFinite(direction) && !paused
          ? <Navigation2 aria-hidden="true" size={22} style={{ transform: `rotate(${direction}deg)` }} />
          : <Navigation aria-hidden="true" size={22} />}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-bold uppercase tracking-wider text-brand">Próximo poste · {order === 'oldest' ? 'Mais antigos' : 'Mais próximos'}</p>
        <h2 className="truncate text-sm font-extrabold">{poleDisplayLabel(pole)}</h2>
        {pole.address && <p className="truncate text-xs text-content-secondary">{pole.address}</p>}
      </div>
      <strong className="shrink-0 text-sm tabular-nums">{formatarDistancia(mapped ? route.metros : distance)}</strong>
    </div>
    <p role="status" className="mt-2 text-xs text-content-secondary">{paused ? 'GPS impreciso · orientação pausada' : loading ? 'Carregando caminho…' : mapped ? 'Traçado de referência pelas ruas mapeadas' : 'Sem caminho mapeado · distância em linha reta'}</p>
    <div className="mt-3 flex flex-wrap gap-2">
      <Button type="button" size="sm" className="min-h-11 flex-1" disabled={paused || loading || !mapped || arrived} onClick={onNavigate} aria-pressed={Boolean(following)}><Navigation className="mr-1.5 h-4 w-4" />{arrived ? 'Você chegou' : following ? 'Ver rota' : 'Navegar'}</Button>
      <Button type="button" size="sm" variant="outline" className="min-h-11 flex-1" onClick={onSkip}>Pular poste</Button>
      {!paused && !alertVisible && distance <= NAV_ALERTA.distanciaAlertaM && <Button type="button" size="sm" className="min-h-11 w-full" onClick={() => onUpdate(pole)}>Atualizar poste</Button>}
    </div>
  </section>;
}

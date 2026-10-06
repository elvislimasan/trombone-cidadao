import React, { useEffect, useState } from 'react';
import { Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { poleDisplayLabel } from '@/lib/poleDisplay';
import { ELECTRICIAN_PATROL_ALERT_MS } from '@/lib/electricianPatrol';

export default function ElectricianPatrolAlert({ alert, onUpdate, onDismiss }) {
  const [progress, setProgress] = useState(100);
  useEffect(() => {
    const update = () => setProgress(Math.max(0, (alert.expiresAt - Date.now()) / ELECTRICIAN_PATROL_ALERT_MS * 100));
    update();
    const timer = setInterval(update, 100);
    return () => clearInterval(timer);
  }, [alert.expiresAt]);
  return <section role="alert" aria-label="Poste com problema próximo" className="absolute inset-x-3 bottom-[calc(env(safe-area-inset-bottom,0px)+5rem)] z-[1250] overflow-hidden rounded-2xl border border-edge-default bg-surface-raised shadow-elevation-3 sm:left-1/2 sm:right-auto sm:w-[min(26rem,calc(100%_-_1.5rem))] sm:-translate-x-1/2">
    <div className="h-1 bg-surface-subtle"><div className="h-full bg-brand transition-[width] duration-100" style={{ width: `${progress}%` }} /></div>
    <div className="p-4">
      <div className="flex items-start gap-3"><Zap className="mt-1 h-5 w-5 shrink-0 text-brand" /><div className="min-w-0"><h2 className="text-base font-extrabold">Poste com problema a {Math.round(alert.distance)} m</h2><p className="mt-1 break-words text-sm font-semibold">{poleDisplayLabel(alert.pole)}</p>{alert.pole.address && <p className="mt-1 line-clamp-2 text-xs text-content-secondary">{alert.pole.address}</p>}</div></div>
      <p className="mt-3 text-sm text-content-secondary">Confira a situação e registre a atualização deste poste.</p>
      <div className="mt-4 grid grid-cols-2 gap-2"><Button type="button" variant="outline" className="min-h-11" onClick={onDismiss}>Depois</Button><Button type="button" className="min-h-11" onClick={() => onUpdate(alert.pole)}>Atualizar poste</Button></div>
    </div>
  </section>;
}

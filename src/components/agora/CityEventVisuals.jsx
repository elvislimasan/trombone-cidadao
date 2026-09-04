import {
  AlertTriangle,
  Bus,
  Calendar,
  Car,
  CloudRain,
  Construction,
  Droplets,
  HeartPulse,
  MapPin,
  Megaphone,
  TrafficCone,
  Zap,
} from 'lucide-react';

import { statusDe, tipoDe } from '@/lib/cityEvents';

// A parte visual do catálogo de acontecimentos.
//
// POR QUE NÃO ESTÁ EM `src/lib/cityEvents.js`
//
// Aquele arquivo é testado com `node --test`, sem bundler e sem React. Um
// `import { Droplets } from 'lucide-react'` lá dentro quebraria os 41 testes
// que hoje rodam em 175 ms — e o emoji do catálogo continuaria existindo para
// quem só precisa de um caractere (o texto do push, por exemplo).
//
// Então: o catálogo diz QUAL é o tipo; este arquivo diz com que ícone e em que
// cor ele aparece.

const ICONES = {
  water_outage: Droplets,
  power_outage: Zap,
  road_block: TrafficCone,
  traffic: Car,
  public_transport: Bus,
  weather: CloudRain,
  health: HeartPulse,
  construction: Construction,
  event: Calendar,
  public_notice: Megaphone,
  other: MapPin,
};

export const iconeDoTipo = (type) => ICONES[type] || AlertTriangle;

/**
 * A cor do quadradinho do ícone.
 *
 * Segue a GRAVIDADE quando ela é crítica, e o TIPO no resto. Um alerta
 * climático crítico e uma feira não podem sair no mesmo tom só porque os dois
 * são "acontecimentos" — mas pintar tudo de vermelho pela severidade faria a
 * lista inteira gritar e nada se destacar.
 */
export const tonsDoTipo = (type, severity) => {
  if (severity === 'critical') return 'bg-danger-subtleBg text-danger-subtleFg';

  const porTipo = {
    water_outage: 'bg-sky-500/10 text-sky-600 dark:text-sky-400',
    power_outage: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
    road_block: 'bg-orange-500/10 text-orange-600 dark:text-orange-400',
    traffic: 'bg-orange-500/10 text-orange-600 dark:text-orange-400',
    public_transport: 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400',
    weather: 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400',
    health: 'bg-rose-500/10 text-rose-600 dark:text-rose-400',
    construction: 'bg-yellow-500/10 text-yellow-700 dark:text-yellow-400',
    event: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
    public_notice: 'bg-violet-500/10 text-violet-600 dark:text-violet-400',
  };
  return porTipo[type] || 'bg-brand-subtleBg text-brand-subtleFg';
};

const TONS_STATUS = {
  alerta:  'bg-status-pendingBg text-status-pendingFg border-status-pendingBorder',
  atencao: 'bg-danger-subtleBg text-danger-subtleFg border-danger/30',
  ok:      'bg-status-resolvedBg text-status-resolvedFg border-status-resolvedBorder',
  info:    'bg-status-progressBg text-status-progressFg border-status-progressBorder',
  neutro:  'bg-surface-subtle text-content-tertiary border-edge-subtle',
};

/** O selo de estado — "EM ANDAMENTO", "NORMALIZADO", "VERIFICAR". */
export const SeloDeStatus = ({ status, className = '' }) => {
  const s = statusDe(status);
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full border px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wider ${TONS_STATUS[s.tom] || TONS_STATUS.neutro} ${className}`}
    >
      {s.curto}
    </span>
  );
};

/** O quadrado do ícone, do tamanho pedido. */
export const IconeDoAcontecimento = ({ type, severity, tamanho = 'md', className = '' }) => {
  const Icone = iconeDoTipo(type);
  const medidas = {
    sm: 'h-9 w-9 rounded-xl',
    md: 'h-11 w-11 rounded-2xl',
    lg: 'h-14 w-14 rounded-2xl',
  }[tamanho] || 'h-11 w-11 rounded-2xl';
  const icone = { sm: 'h-4 w-4', md: 'h-5 w-5', lg: 'h-6 w-6' }[tamanho] || 'h-5 w-5';

  return (
    <span className={`flex shrink-0 items-center justify-center ${medidas} ${tonsDoTipo(type, severity)} ${className}`}>
      <Icone className={icone} aria-hidden="true" />
    </span>
  );
};

export const rotuloDoTipo = (type) => tipoDe(type).rotulo;

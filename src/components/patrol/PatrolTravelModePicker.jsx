import { Check, CarFront, Footprints, User } from 'lucide-react';

import PatrolAvatar from './PatrolAvatar';
import { getPatrolPickStep } from '@/lib/patrolPickFlow';
import {
  getPatrolTravelMode,
  normalizePatrolTravelMode,
  PATROL_TRAVEL_MODES,
} from '@/lib/patrolTravelMode';

// Segundo passo: como a pessoa vai se deslocar.
//
// A escolha vem DEPOIS do foco porque é consequência dele — e o cartão de cima
// já mostra, andando, o mesmo boneco que vai aparecer no mapa. Ver o
// `PatrolAvatar`: é literalmente o mesmo desenho, para a escolha aqui não
// prometer uma coisa e a patrulha entregar outra.

const ICONS = {
  driving: CarFront,
  walking: Footprints,
};

export function PatrolTravelModeIcon({ mode, size = 24, className = '', strokeWidth = 2 }) {
  const id = normalizePatrolTravelMode(mode);
  const Icon = ICONS[id];
  return <Icon size={size} strokeWidth={strokeWidth} className={className} aria-hidden="true" />;
}

export default function PatrolTravelModePicker({
  value,
  onChange,
  foco = null,
  avatar,
  onEscolherBoneco,
}) {
  const selecionado = getPatrolTravelMode(value);
  const passo = getPatrolPickStep('ritmo');
  const ehCarro = selecionado.id === 'driving';

  return (
    <section aria-labelledby="patrol-travel-mode-title">
      <div className="relative overflow-hidden rounded-[28px] bg-gradient-to-br from-brand to-brand-hover text-content-onBrand shadow-elevation-2">
        {/* A cidade simulada por baixo. Ela substitui o antigo padrão de pontos:
            um mapa que anda diz o que a tela está prestes a fazer, e um padrão
            decorativo não dizia nada. Ver `.patrol-mode-map` no index.css. */}
        <div className={`patrol-mode-map patrol-mode-map--${selecionado.id}`} aria-hidden="true">
          <div className="patrol-mode-map__grade" />
          <div className="patrol-mode-map__rota" />
          <div className="patrol-mode-map__luz" />
        </div>

        <div className="relative px-5 pt-5 pb-6">
          <div className="flex items-start justify-between gap-3">
            <div className="max-w-[74%]">
              <h2 id="patrol-travel-mode-title" className="font-display text-2xl font-extrabold leading-tight tracking-tight">
                {passo.titulo}
              </h2>
              <p className="mt-1.5 text-sm leading-relaxed text-content-onBrand/85">
                {selecionado.description}
              </p>
            </div>

            {/* O foco já escolhido continua à vista: é ele que dá sentido à
                pergunta desta tela. */}
            {foco && (
              <span className="shrink-0 inline-flex items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-1.5 text-[11px] font-bold ring-1 ring-white/25">
                <span aria-hidden="true">{foco.icon}</span>
                <span className="max-w-[86px] truncate">{foco.name}</span>
              </span>
            )}
          </div>

          {/* O boneco fica PLANTADO no centro e caminha no lugar; quem anda é a
              cidade atrás dele. É a mesma câmera traseira do mapa, e o mesmo
              desenho — a escolha aqui não pode prometer uma coisa e a patrulha
              entregar outra.

              A 96px o rosto e o passo aparecem de verdade. A 52px, que era o
              tamanho anterior, ele era um detalhe do fundo. */}
          <div className="relative mt-4 h-[150px]">
            <div
              key={selecionado.id}
              className="patrol-mode-journey patrol-mode-journey--palco"
              aria-hidden="true"
            >
              <PatrolAvatar
                modo={selecionado.id}
                avatar={avatar}
                camera="costas"
                emMovimento
                sobreMarca
                tamanho={96}
                className="patrol-avatar-planted"
              />
            </div>
          </div>

          {/* O BOTÃO NOMEIA O QUE ESTÁ EM CENA
              De carro quem aparece é o veículo — o boneco vai dentro dele e não
              se vê. Oferecer "escolher boneco" ali mandaria a pessoa mexer numa
              coisa que a tela não mostra. */}
          {onEscolherBoneco && (
            <button
              type="button"
              onClick={onEscolherBoneco}
              className="mt-2 inline-flex items-center gap-2 rounded-full bg-white/15 px-3.5 py-2 text-xs font-bold ring-1 ring-white/25 transition-[background-color,transform] active:scale-[0.98] active:bg-white/25"
            >
              {ehCarro ? <CarFront size={14} strokeWidth={2.6} /> : <User size={14} strokeWidth={2.6} />}
              {ehCarro ? 'Escolher carro' : 'Escolher boneco'}
            </button>
          )}
        </div>
      </div>

      <div
        role="radiogroup"
        aria-label="Forma de deslocamento"
        className="relative z-10 -mt-3 mx-3 grid grid-cols-2 gap-2 rounded-2xl bg-surface-raised p-2 shadow-elevation-2 ring-1 ring-edge-subtle/70"
      >
        {PATROL_TRAVEL_MODES.map((modo) => {
          const ativo = modo.id === selecionado.id;
          return (
            <button
              key={modo.id}
              type="button"
              role="radio"
              aria-checked={ativo}
              onClick={() => onChange(modo.id)}
              className={`relative min-h-[88px] rounded-xl px-3 py-3 text-left transition-[background-color,box-shadow,transform] duration-200 active:scale-[0.98] ${
                ativo
                  ? 'bg-brand-subtleBg text-brand shadow-elevation-1 ring-2 ring-brand'
                  : 'bg-surface-subtle text-content-secondary hover:bg-surface-subtleHover ring-1 ring-transparent'
              }`}
            >
              <span className="flex items-start justify-between gap-2">
                <span className={`patrol-mode-option-icon patrol-mode-option-icon--${modo.id} ${ativo ? 'is-active' : ''}`}>
                  <PatrolTravelModeIcon mode={modo.id} size={23} strokeWidth={2.3} />
                </span>
                {ativo && (
                  <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-brand text-content-onBrand">
                    <Check size={13} strokeWidth={3} />
                  </span>
                )}
              </span>
              <span className="mt-2 block text-sm font-extrabold leading-none text-content-primary">
                {modo.label}
              </span>
              <span className="mt-1 block text-[11px] font-medium leading-tight text-content-tertiary">
                {modo.shortLabel}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

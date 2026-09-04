import { Check, X } from 'lucide-react';

import PatrolAvatar from './PatrolAvatar';
import {
  PATROL_AVATAR_SEXOS,
  PATROL_AVATAR_VEHICLES,
  getPatrolAvatarSexo,
  getPatrolAvatarVehicle,
  toPatrolUrbanAvatar,
} from '@/lib/patrolAvatarConfig';

// Escolha curta do que aparece na patrulha.
//
// A personalização por peças está pausada. A folha continua existindo porque
// já é o ponto de entrada conhecido nas telas de preparação, mas agora ela
// responde a uma pergunta só. O traje urbano é fixo e as preferências antigas
// permanecem guardadas para uma possível retomada.
//
// QUAL PERGUNTA, PORÉM, DEPENDE DO MODO
//
// A pé quem aparece no mapa é a pessoa, e a pergunta é feminino ou masculino.
// De carro a pessoa vai DENTRO do veículo e não se vê: perguntar o sexo ali
// seria pedir uma escolha sem efeito, e o botão que abre esta folha promete
// "escolher carro". Uma folha, duas perguntas, decididas pelo modo.

export default function PatrolAvatarStudio({ avatar, modo = 'walking', onChange, onFechar }) {
  const ehCarro = modo === 'driving';
  const sexoAtual = getPatrolAvatarSexo(avatar?.sexo);
  const veiculoAtual = getPatrolAvatarVehicle(avatar?.veiculo);

  const avatarUrbano = (troca = {}) => toPatrolUrbanAvatar({ ...avatar, ...troca });

  const opcoes = ehCarro ? PATROL_AVATAR_VEHICLES : PATROL_AVATAR_SEXOS;
  const atual = ehCarro ? veiculoAtual : sexoAtual;
  const trocaDe = (id) => (ehCarro ? { veiculo: id } : { sexo: id });

  const escolher = (id) => {
    if (id === atual.id) return;
    onChange(avatarUrbano(trocaDe(id)));
  };

  return (
    <div className="fixed inset-0 z-[1010] flex items-end justify-center bg-black/60 sm:items-center">
      <button
        type="button"
        aria-label="Fechar escolha do boneco"
        onClick={onFechar}
        className="absolute inset-0 cursor-default"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="patrol-avatar-choice-title"
        className="relative flex w-full flex-col overflow-hidden rounded-t-3xl bg-surface-base shadow-2xl duration-200 animate-in slide-in-from-bottom sm:max-w-md sm:rounded-3xl"
      >
        <div className="relative shrink-0 overflow-hidden bg-gradient-to-br from-brand to-brand-hover px-5 pb-5 pt-4 text-content-onBrand">
          <div className="patrol-mode-grid absolute inset-0 opacity-30" aria-hidden="true" />

          <div className="relative flex items-start justify-between gap-3">
            <div>
              <h2
                id="patrol-avatar-choice-title"
                className="font-display text-xl font-extrabold leading-tight tracking-tight"
              >
                {ehCarro ? 'Escolha seu carro' : 'Escolha seu boneco'}
              </h2>
              <p className="mt-1 text-xs leading-relaxed text-content-onBrand/85">
                {ehCarro
                  ? 'O modelo que vai aparecer no mapa durante a patrulha.'
                  : 'Feminino ou masculino, sempre com o estilo urbano padrão.'}
              </p>
            </div>
            <button
              type="button"
              onClick={onFechar}
              aria-label="Fechar"
              className="-mr-1 -mt-1 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-content-onBrand/80 transition-colors active:bg-white/15"
            >
              <X size={22} />
            </button>
          </div>

          <div className="relative mt-3 flex h-[124px] items-start justify-center" aria-hidden="true">
            <PatrolAvatar
              modo={ehCarro ? 'driving' : 'walking'}
              avatar={avatarUrbano()}
              camera="frente"
              emMovimento={false}
              sobreMarca
              tamanho={92}
            />
          </div>
        </div>

        <div
          role="radiogroup"
          aria-label={ehCarro ? 'Escolha do carro' : 'Escolha do boneco'}
          className="grid grid-cols-2 gap-3 px-4 py-5"
        >
          {opcoes.map((opcao) => {
            const ativo = opcao.id === atual.id;

            return (
              <button
                key={opcao.id}
                type="button"
                role="radio"
                aria-checked={ativo}
                onClick={() => escolher(opcao.id)}
                className={`relative flex min-h-[154px] flex-col items-center justify-end gap-2 rounded-2xl px-3 pb-3 pt-4 transition-[background-color,box-shadow,transform] duration-200 active:scale-[0.98] ${
                  ativo
                    ? 'bg-brand-subtleBg text-brand shadow-elevation-1 ring-2 ring-brand'
                    : 'bg-surface-subtle text-content-secondary ring-1 ring-edge-subtle hover:bg-surface-subtleHover'
                }`}
              >
                {ativo && (
                  <span className="absolute right-2.5 top-2.5 inline-flex h-6 w-6 items-center justify-center rounded-full bg-brand text-content-onBrand">
                    <Check size={15} strokeWidth={3} aria-hidden="true" />
                  </span>
                )}

                <PatrolAvatar
                  modo={ehCarro ? 'driving' : 'walking'}
                  avatar={avatarUrbano(trocaDe(opcao.id))}
                  camera="frente"
                  emMovimento={false}
                  tamanho={82}
                  className="patrol-avatar-chip"
                />
                <span className="text-sm font-extrabold">{opcao.label}</span>
                <span className="text-[10px] font-semibold text-content-tertiary">
                  {ehCarro ? 'De carro' : 'Urbano'}
                </span>
              </button>
            );
          })}
        </div>

        <div
          className="shrink-0 border-t border-edge-subtle bg-surface-overlay px-4 pt-3"
          style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 12px)' }}
        >
          <button
            type="button"
            onClick={onFechar}
            className="flex w-full items-center justify-center rounded-xl bg-brand py-3.5 text-sm font-extrabold text-content-onBrand transition-[background-color,transform] active:scale-[0.99] active:bg-brand-hover"
          >
            Usar {atual.label.toLowerCase()}
          </button>
        </div>
      </div>
    </div>
  );
}

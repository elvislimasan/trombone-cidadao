import { useState } from 'react';
import { Check, X } from 'lucide-react';

import PatrolAvatar from './PatrolAvatar';
import {
  PATROL_AVATAR_ACCESSORIES,
  PATROL_AVATAR_COLORS,
  PATROL_AVATAR_STYLES,
  PATROL_AVATAR_VEHICLES,
  getPatrolAvatarColor,
} from '@/lib/patrolAvatarConfig';

// Onde a pessoa monta o próprio boneco.
//
// POR QUE UMA FOLHA, E NÃO UM QUARTO PASSO
//
// A preparação tem três passos, e cada um responde a uma pergunta necessária
// para sair. Aparência não é necessária — ninguém deixa de patrulhar por não
// ter escolhido a mochila. Como passo, ela atrasaria toda saída; como folha
// aberta a partir do avatar que já está na tela, ela aparece exatamente para
// quem reparou nele e quis mexer.
//
// O BONECO GRANDE FICA FIXO NO TOPO
//
// Cada toque muda o desenho ali, ao vivo. É a diferença entre escolher "tático"
// numa lista e VER o colete aparecer — sem isso os nomes seriam adivinhação.

const Secao = ({ titulo, children }) => (
  <section className="mt-5 first:mt-0">
    <h3 className="mb-2.5 text-[11px] font-bold uppercase tracking-[0.14em] text-content-tertiary">
      {titulo}
    </h3>
    {children}
  </section>
);

const Opcao = ({ ativo, onClick, rotulo, descricao, children }) => (
  <button
    type="button"
    role="radio"
    aria-checked={ativo}
    onClick={onClick}
    className={`relative flex flex-col items-center gap-1.5 rounded-2xl px-2 py-2.5 transition-[background-color,box-shadow,transform] duration-200 active:scale-[0.97] ${
      ativo
        ? 'bg-brand-subtleBg shadow-elevation-1 ring-2 ring-brand'
        : 'bg-surface-subtle ring-1 ring-transparent hover:bg-surface-subtleHover'
    }`}
  >
    {children}
    <span className={`block max-w-full truncate text-[11px] font-bold leading-none ${
      ativo ? 'text-brand' : 'text-content-secondary'
    }`}>
      {rotulo}
    </span>
    {descricao && (
      <span className="sr-only">{descricao}</span>
    )}
  </button>
);

export default function PatrolAvatarStudio({ modo, avatar, onChange, onFechar }) {
  // A prévia da folha caminha mesmo com a patrulha parada: é um mostruário,
  // não um relato do GPS.
  const [aba, setAba] = useState(modo === 'driving' ? 'veiculo' : 'boneco');
  const trocar = (peca, valor) => onChange({ ...avatar, [peca]: valor });

  return (
    <div className="fixed inset-0 z-[1010] flex items-end justify-center bg-black/60 sm:items-center">
      <button
        type="button"
        aria-label="Fechar personalização"
        onClick={onFechar}
        className="absolute inset-0 cursor-default"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label="Personalizar avatar da patrulha"
        className="relative flex max-h-[88vh] w-full flex-col overflow-hidden rounded-t-3xl bg-surface-base shadow-2xl duration-200 animate-in slide-in-from-bottom sm:max-w-lg sm:rounded-3xl"
      >
        <div className="relative shrink-0 overflow-hidden bg-gradient-to-br from-brand to-brand-hover px-5 pb-5 pt-4 text-content-onBrand">
          <div className="patrol-mode-grid absolute inset-0 opacity-30" aria-hidden="true" />

          <div className="relative flex items-start justify-between gap-3">
            <div>
              <h2 className="font-display text-xl font-extrabold leading-tight tracking-tight">
                Seu boneco na rua
              </h2>
              <p className="mt-1 text-xs leading-relaxed text-content-onBrand/85">
                É ele que vai aparecer no mapa durante a patrulha.
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

          <div className="relative mt-3 flex h-[132px] items-start justify-center" aria-hidden="true">
            <PatrolAvatar
              modo={modo}
              avatar={avatar}
              emMovimento
              sobreMarca
              tamanho={92}
            />
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5">
          <Secao titulo="Cor">
            <div role="radiogroup" aria-label="Cor do avatar" className="flex flex-wrap gap-2.5">
              {PATROL_AVATAR_COLORS.map((cor) => {
                const ativo = cor.id === avatar.cor;
                return (
                  <button
                    key={cor.id}
                    type="button"
                    role="radio"
                    aria-checked={ativo}
                    aria-label={cor.label}
                    onClick={() => trocar('cor', cor.id)}
                    className={`relative h-11 w-11 rounded-full transition-transform duration-200 active:scale-[0.94] ${
                      ativo ? 'ring-2 ring-brand ring-offset-2 ring-offset-surface-base' : 'ring-1 ring-edge-subtle'
                    }`}
                    style={{ backgroundColor: cor.base }}
                  >
                    {ativo && (
                      <Check
                        size={17}
                        strokeWidth={3.4}
                        className="absolute inset-0 m-auto"
                        style={{ color: cor.id === 'branco' ? '#334155' : '#ffffff' }}
                      />
                    )}
                  </button>
                );
              })}
            </div>
          </Secao>

          {/* De carro nada do boneco aparece no mapa — mostrar mochila e boné ali
              seria oferecer uma escolha sem efeito. As duas listas ficam
              disponíveis pelas abas, porque o modo pode mudar depois. */}
          <div className="mt-6 flex gap-1.5 rounded-xl bg-surface-subtle p-1">
            {[
              { id: 'boneco', label: 'A pé' },
              { id: 'veiculo', label: 'De carro' },
            ].map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setAba(item.id)}
                aria-pressed={aba === item.id}
                className={`flex-1 rounded-lg px-3 py-2 text-[13px] font-bold transition-colors ${
                  aba === item.id
                    ? 'bg-surface-raised text-brand shadow-elevation-1'
                    : 'text-content-secondary'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>

          {aba === 'boneco' ? (
            <>
              <Secao titulo="Estilo">
                <div role="radiogroup" aria-label="Estilo do boneco" className="grid grid-cols-3 gap-2">
                  {PATROL_AVATAR_STYLES.map((estilo) => (
                    <Opcao
                      key={estilo.id}
                      ativo={estilo.id === avatar.estilo}
                      onClick={() => trocar('estilo', estilo.id)}
                      rotulo={estilo.label}
                      descricao={estilo.descricao}
                    >
                      <PatrolAvatar
                        modo="walking"
                        avatar={{ ...avatar, estilo: estilo.id }}
                        emMovimento={false}
                        tamanho={54}
                        className="patrol-avatar-chip"
                      />
                    </Opcao>
                  ))}
                </div>
              </Secao>

              <Secao titulo="Acessório">
                <div role="radiogroup" aria-label="Acessório do boneco" className="grid grid-cols-3 gap-2">
                  {PATROL_AVATAR_ACCESSORIES.map((acessorio) => (
                    <Opcao
                      key={acessorio.id}
                      ativo={acessorio.id === avatar.acessorio}
                      onClick={() => trocar('acessorio', acessorio.id)}
                      rotulo={acessorio.label}
                    >
                      <PatrolAvatar
                        modo="walking"
                        avatar={{ ...avatar, acessorio: acessorio.id }}
                        emMovimento={false}
                        tamanho={54}
                        className="patrol-avatar-chip"
                      />
                    </Opcao>
                  ))}
                </div>
              </Secao>
            </>
          ) : (
            <Secao titulo="Carro">
              <div role="radiogroup" aria-label="Modelo do carro" className="grid grid-cols-3 gap-2">
                {PATROL_AVATAR_VEHICLES.map((veiculo) => (
                  <Opcao
                    key={veiculo.id}
                    ativo={veiculo.id === avatar.veiculo}
                    onClick={() => trocar('veiculo', veiculo.id)}
                    rotulo={veiculo.label}
                  >
                    <PatrolAvatar
                      modo="driving"
                      avatar={{ ...avatar, veiculo: veiculo.id }}
                      emMovimento={false}
                      tamanho={54}
                      className="patrol-avatar-chip"
                    />
                  </Opcao>
                ))}
              </div>
            </Secao>
          )}
        </div>

        <div
          className="shrink-0 border-t border-edge-subtle bg-surface-overlay px-4 pt-3"
          style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 12px)' }}
        >
          <button
            type="button"
            onClick={onFechar}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand py-3.5 text-sm font-extrabold text-content-onBrand transition-[background-color,transform] active:scale-[0.99] active:bg-brand-hover"
          >
            <span
              className="inline-block h-3.5 w-3.5 rounded-full ring-2 ring-white/70"
              style={{ backgroundColor: getPatrolAvatarColor(avatar.cor).base }}
              aria-hidden="true"
            />
            Pronto
          </button>
        </div>
      </div>
    </div>
  );
}

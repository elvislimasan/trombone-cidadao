import { useState } from 'react';
import { Check, Lock, X } from 'lucide-react';

import PatrolAvatar from './PatrolAvatar';
import {
  PATROL_AVATAR_ACCESSORIES,
  PATROL_AVATAR_COLORS,
  PATROL_AVATAR_SEXOS,
  PATROL_AVATAR_STYLES,
  PATROL_AVATAR_TONS_PELE,
  PATROL_AVATAR_VEHICLES,
  getPatrolAvatarColor,
  isPatrolAvatarStyleUnlocked,
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

const Opcao = ({ ativo, onClick, rotulo, descricao, children, bloqueado = false, nivelMinimo = null }) => (
  <button
    type="button"
    role="radio"
    aria-checked={ativo}
    aria-disabled={bloqueado}
    disabled={bloqueado}
    onClick={onClick}
    className={`relative flex flex-col items-center gap-1.5 rounded-2xl px-2 py-2.5 transition-[background-color,box-shadow,transform,opacity] duration-200 active:scale-[0.97] disabled:cursor-not-allowed ${
      ativo
        ? 'bg-brand-subtleBg shadow-elevation-1 ring-2 ring-brand'
        : 'bg-surface-subtle ring-1 ring-transparent hover:bg-surface-subtleHover'
    }`}
  >
    {bloqueado && (
      <span className="absolute right-1.5 top-1.5 z-10 inline-flex items-center gap-0.5 rounded-full bg-surface-overlay/95 px-1.5 py-1 text-[9px] font-extrabold leading-none text-content-secondary shadow-elevation-1 ring-1 ring-edge-subtle">
        <Lock size={9} strokeWidth={2.8} aria-hidden="true" />
        N{nivelMinimo}
      </span>
    )}
    <span className={bloqueado ? 'opacity-45 grayscale' : ''}>{children}</span>
    <span className={`block max-w-full truncate text-[11px] font-bold leading-none ${
      ativo ? 'text-brand' : bloqueado ? 'text-content-tertiary' : 'text-content-secondary'
    }`}>
      {rotulo}
    </span>
    {bloqueado && (
      <span className="text-[9px] font-semibold leading-none text-content-tertiary">
        Libera no nível {nivelMinimo}
      </span>
    )}
    {descricao && (
      <span className="sr-only">{descricao}</span>
    )}
  </button>
);

export default function PatrolAvatarStudio({
  modo,
  avatar,
  nivel = 1,
  nivelCarregando = false,
  onChange,
  onFechar,
}) {
  // A prévia da folha caminha mesmo com a patrulha parada: é um mostruário,
  // não um relato do GPS.
  const [aba, setAba] = useState(modo === 'driving' ? 'veiculo' : 'boneco');
  const [camera, setCamera] = useState('frente');
  const nivelAtual = Math.max(1, Number(nivel) || 1);
  const modoPreview = aba === 'veiculo' ? 'driving' : 'walking';
  const estilosLiberados = PATROL_AVATAR_STYLES.filter(
    (estilo) => isPatrolAvatarStyleUnlocked(estilo.id, nivelAtual) || estilo.id === avatar.estilo
  ).length;

  const trocar = (peca, valor) => {
    if (
      peca === 'estilo' &&
      valor !== avatar.estilo &&
      (nivelCarregando || !isPatrolAvatarStyleUnlocked(valor, nivelAtual))
    ) return;

    onChange({ ...avatar, [peca]: valor });
  };

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
                Personalizar seu avatar
              </h2>
              <p className="mt-1 text-xs leading-relaxed text-content-onBrand/85">
                Veja de frente e de costas como ele aparece na patrulha.
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

          <div
            role="group"
            aria-label="Lado do avatar na prévia"
            className="relative mx-auto mt-3 flex w-fit gap-1 rounded-full bg-black/15 p-1 ring-1 ring-white/15"
          >
            {[
              { id: 'frente', label: 'Frente' },
              { id: 'costas', label: 'Costas' },
            ].map((lado) => (
              <button
                key={lado.id}
                type="button"
                aria-pressed={camera === lado.id}
                onClick={() => setCamera(lado.id)}
                className={`rounded-full px-3 py-1 text-[10px] font-extrabold transition-colors ${
                  camera === lado.id
                    ? 'bg-white text-brand shadow-sm'
                    : 'text-content-onBrand/80 active:bg-white/10'
                }`}
              >
                {lado.label}
              </button>
            ))}
          </div>

          <div className="relative mt-1 flex h-[124px] items-start justify-center" aria-hidden="true">
            <PatrolAvatar
              modo={modoPreview}
              avatar={avatar}
              camera={camera}
              emMovimento
              sobreMarca
              tamanho={92}
            />
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5">
          <Secao titulo={aba === 'veiculo' ? 'Cor do carro' : 'Cor da roupa'}>
            <div
              role="radiogroup"
              aria-label={aba === 'veiculo' ? 'Cor do carro' : 'Cor da roupa'}
              className="flex flex-wrap gap-2.5"
            >
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

          {/* De carro nada do boneco aparece no mapa — mostrar roupa e mochila ali
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
              <Secao titulo="Sexo">
                <div role="radiogroup" aria-label="Sexo do avatar" className="grid grid-cols-2 gap-2">
                  {PATROL_AVATAR_SEXOS.map((sexo) => (
                    <Opcao
                      key={sexo.id}
                      ativo={sexo.id === avatar.sexo}
                      onClick={() => trocar('sexo', sexo.id)}
                      rotulo={sexo.label}
                    >
                      <PatrolAvatar
                        modo="walking"
                        avatar={{ ...avatar, sexo: sexo.id }}
                        camera={camera}
                        emMovimento={false}
                        tamanho={50}
                        className="patrol-avatar-chip"
                      />
                    </Opcao>
                  ))}
                </div>
              </Secao>

              <Secao titulo="Tom de pele">
                <div role="radiogroup" aria-label="Tom de pele" className="flex flex-wrap gap-2.5">
                  {PATROL_AVATAR_TONS_PELE.map((tom) => {
                    const ativo = tom.id === avatar.tomPele;
                    const checkEscuro = tom.id === 'muito-claro' || tom.id === 'claro';
                    return (
                      <button
                        key={tom.id}
                        type="button"
                        role="radio"
                        aria-checked={ativo}
                        aria-label={tom.label}
                        onClick={() => trocar('tomPele', tom.id)}
                        className={`relative h-11 w-11 rounded-full shadow-inner transition-transform duration-200 active:scale-[0.94] ${
                          ativo
                            ? 'ring-2 ring-brand ring-offset-2 ring-offset-surface-base'
                            : 'ring-1 ring-edge-strong'
                        }`}
                        style={{ backgroundColor: tom.base }}
                      >
                        {ativo && (
                          <Check
                            size={17}
                            strokeWidth={3.4}
                            className="absolute inset-0 m-auto"
                            style={{ color: checkEscuro ? '#334155' : '#ffffff' }}
                          />
                        )}
                      </button>
                    );
                  })}
                </div>
              </Secao>

              <Secao titulo="Estilo">
                <div className="mb-3 flex items-center justify-between gap-3 rounded-xl bg-brand-subtleBg px-3 py-2 ring-1 ring-brand/15">
                  <span className="text-[11px] font-extrabold text-brand">
                    {nivelCarregando ? 'Carregando nível…' : `Nível ${nivelAtual}`}
                  </span>
                  <span className="text-right text-[10px] font-semibold leading-tight text-content-secondary">
                    {estilosLiberados} de {PATROL_AVATAR_STYLES.length} estilos liberados
                  </span>
                </div>
                <div role="radiogroup" aria-label="Estilo do boneco" className="grid grid-cols-3 gap-2">
                  {PATROL_AVATAR_STYLES.map((estilo) => {
                    const ativo = estilo.id === avatar.estilo;
                    const bloqueado = !ativo && (
                      nivelCarregando
                        ? estilo.nivelMinimo > 1
                        : !isPatrolAvatarStyleUnlocked(estilo.id, nivelAtual)
                    );

                    return (
                      <Opcao
                        key={estilo.id}
                        ativo={ativo}
                        bloqueado={bloqueado}
                        nivelMinimo={estilo.nivelMinimo}
                        onClick={() => trocar('estilo', estilo.id)}
                        rotulo={estilo.label}
                        descricao={estilo.descricao}
                      >
                        <PatrolAvatar
                          modo="walking"
                          avatar={{ ...avatar, estilo: estilo.id }}
                          camera={camera}
                          emMovimento={false}
                          tamanho={54}
                          className="patrol-avatar-chip"
                        />
                      </Opcao>
                    );
                  })}
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
                        camera={camera}
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
                      camera={camera}
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

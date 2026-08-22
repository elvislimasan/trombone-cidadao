import { Target, Camera, Ban } from 'lucide-react';

// Missão ao alcance da mão.
//
// Aparece quando o usuário chega a menos de 15 m de um sinal aberto — em cima
// do problema, não a um quarteirão dele (RAIO_CARD_MISSAO_M). Não tem
// contagem regressiva, diferente do card de alerta: o alerta é sobre uma bronca
// que fica para trás em segundos, e a missão é sobre um lugar onde a pessoa já
// está. Fechar sozinho seria perder a única chance de agir.
//
// Os dois botões têm pesos deliberadamente diferentes. Completar é o ato que o
// modo existe para provocar; "nada aqui" encerra o sinal de outra pessoa e
// apaga os pontos dela — merece ser possível, não convidativo.

const formatarDistancia = (m) => {
  const v = Math.max(0, Math.round(m || 0));
  return v < 1000 ? `${v} m` : `${(v / 1000).toFixed(1).replace('.', ',')} km`;
};

export default function PatrolMissionCard({ missao, enviando, onCumprir, onDescartar, onAdiar }) {
  if (!missao) return null;

  return (
    <div className="absolute inset-x-0 bottom-[calc(env(safe-area-inset-bottom,0px)+1rem)] z-[1002] px-3">
      <div className="rounded-2xl bg-surface-overlay border border-brand/40 shadow-2xl overflow-hidden">
        <div className="flex items-center gap-2 bg-brand/10 px-4 py-2">
          <Target size={16} className="text-brand shrink-0" />
          <span className="text-xs font-bold uppercase tracking-wider text-brand">
            Missão a {formatarDistancia(missao.distancia)}
          </span>
        </div>

        <div className="px-4 pt-3 pb-4">
          <p className="text-lg font-extrabold text-content-primary leading-tight">
            {missao.categoryName}
          </p>
          <p className="text-sm text-content-secondary mt-0.5">
            {missao.minha
              ? 'Você sinalizou este ponto'
              : `Sinalizado por ${missao.autorNome || 'outro cidadão'}`}
          </p>

          {/* O botão da direita era só um ícone de proibido, sem rótulo.
              Ele encerra o sinal de OUTRA pessoa e apaga os pontos dela — é a
              ação mais consequente deste card, e era a única sem nome. Quem
              não adivinhava o símbolo não tinha como usá-la; quem adivinhava
              errado podia tocá-la achando que era "fechar".

              Continua discreto, porque não é o que se quer provocar. Mas
              discreto e anônimo são coisas diferentes. */}
          <div className="flex flex-col gap-2 mt-3.5">
            <button
              type="button"
              disabled={enviando}
              onClick={() => onCumprir(missao)}
              className="w-full h-12 inline-flex items-center justify-center gap-2 rounded-xl bg-brand text-content-onBrand font-bold active:scale-[0.98] transition-transform disabled:opacity-50"
            >
              <Camera size={18} />
              Registrar bronca
            </button>
            <button
              type="button"
              disabled={enviando}
              onClick={() => onDescartar(missao)}
              className="w-full h-11 inline-flex items-center justify-center gap-2 rounded-xl border border-edge-default text-sm font-semibold text-content-secondary active:bg-surface-subtleHover transition-colors disabled:opacity-50"
            >
              <Ban size={16} />
              Não há nada aqui
            </button>
          </div>

          <button
            type="button"
            onClick={() => onAdiar(missao)}
            className="w-full mt-2 h-9 text-sm font-semibold text-content-tertiary active:text-content-secondary"
          >
            Agora não
          </button>
        </div>
      </div>
    </div>
  );
}

import { Navigation, X, Camera } from 'lucide-react';
import { RAIO_PRESENCA_M } from '@/hooks/usePatrolSignals';

// A missão que a pessoa escolheu no mapa, e a distância até ela.
//
// POR QUE ISTO EXISTE
//
// O card de missão só aparece a 15 m — em cima do problema, que é quando faz
// sentido perguntar. Mas as missões continuam no mapa desde longe, e antes não
// havia nada a fazer com elas: os pinos eram enfeite até a pessoa esbarrar num
// por acaso.
//
// Agora tocar num pino traça o caminho e abre esta barra. Ela é a ponte entre
// "vi que tem uma ali" e "estou lá".
//
// O TRACEJADO NÃO É ROTA DE NAVEGAÇÃO
//
// É uma reta. Não conhece rua, não sabe de mão única, não recalcula. Ela diz a
// direção e a distância — o resto quem sabe é quem está dirigindo. Prometer
// rota de verdade exigiria um serviço de roteamento e, com ele, a obrigação de
// estar certo numa tela que a pessoa olha em movimento.

const formatarDistancia = (m) => {
  const v = Math.max(0, Math.round(m || 0));
  return v < 1000 ? `${v} m` : `${(v / 1000).toFixed(1).replace('.', ',')} km`;
};

export default function PatrolRouteBar({ missao, distancia, onRegistrar, onCancelar }) {
  if (!missao) return null;

  // O servidor recusa registrar de longe (RAIO_PRESENCA_M, migração 173).
  // Mostrar o botão assim mesmo mandaria a pessoa até a rede para ouvir não.
  const perto = distancia != null && distancia <= RAIO_PRESENCA_M;

  return (
    <div className="absolute inset-x-0 bottom-[calc(env(safe-area-inset-bottom,0px)+1rem)] z-[1002] px-3">
      <div className="flex items-center gap-3 rounded-2xl bg-surface-overlay/95 backdrop-blur-sm border border-brand/40 shadow-2xl px-4 py-3">
        <Navigation size={20} className="text-brand shrink-0" />

        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-content-primary truncate leading-tight">
            {missao.categoryName}
          </p>
          <p className="text-xs text-content-secondary tabular-nums">
            {distancia != null ? `a ${formatarDistancia(distancia)} daqui` : 'no mapa'}
            {missao.bairro ? ` · ${missao.bairro}` : ''}
          </p>
        </div>

        {perto && (
          <button
            type="button"
            onClick={() => onRegistrar(missao)}
            className="shrink-0 h-10 px-3.5 inline-flex items-center gap-1.5 rounded-xl bg-brand text-content-onBrand text-sm font-bold active:scale-[0.98] transition-transform"
          >
            <Camera size={16} />
            Registrar
          </button>
        )}

        <button
          type="button"
          onClick={onCancelar}
          aria-label="Cancelar rota"
          className="shrink-0 w-10 h-10 inline-flex items-center justify-center rounded-xl border border-edge-default text-content-secondary active:bg-surface-subtleHover"
        >
          <X size={18} />
        </button>
      </div>
    </div>
  );
}

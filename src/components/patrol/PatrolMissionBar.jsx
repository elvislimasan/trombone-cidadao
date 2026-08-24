import { Navigation, X, Camera } from 'lucide-react';
import { RAIO_REGISTRO_M } from '@/hooks/usePatrolSignals';

// A missão que a pessoa escolheu no mapa, e a distância até ela.
//
// POR QUE ISTO EXISTE
//
// O card de missão só aparece a 15 m — em cima do problema, que é quando faz
// sentido perguntar. Mas as missões continuam no mapa desde longe, e antes não
// havia nada a fazer com elas: os pinos eram enfeite até a pessoa esbarrar num
// por acaso.
//
// Tocar num pino abre esta barra. Ela é a ponte entre "vi que tem uma ali" e
// "estou lá": diz qual é a missão e quanto falta.
//
// NÃO HÁ LINHA DESENHADA ATÉ ELA
//
// Houve, por pouco tempo: um tracejado reto da posição até o pino. Saiu. Uma
// reta não conhece rua nem mão única, e sobre um mapa ela é lida como caminho
// — o desenho promete uma navegação que o app não faz. O número em metros diz
// a mesma coisa sem fingir ser rota.

const formatarDistancia = (m) => {
  const v = Math.max(0, Math.round(m || 0));
  return v < 1000 ? `${v} m` : `${(v / 1000).toFixed(1).replace('.', ',')} km`;
};

export default function PatrolMissionBar({ missao, distancia, onRegistrar, onCancelar }) {
  if (!missao) return null;

  // Registrar só de perto. Ver RAIO_REGISTRO_M para os três raios e o porquê
  // de este ser mais apertado que o do servidor.
  const perto = distancia != null && distancia <= RAIO_REGISTRO_M;

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
            {/* Longe, a barra tem que dizer o que falta para o botão aparecer —
                senão ela é um card sem ação, e a pessoa fica esperando algo
                que não vem. */}
            {!perto && distancia != null && ' · aproxime-se para registrar'}
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

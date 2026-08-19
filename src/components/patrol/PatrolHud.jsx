import { X, Navigation2, SatelliteDish, WifiOff } from 'lucide-react';

// Painel do modo patrulha: velocidade, rua e saída.
//
// Tudo aqui é dimensionado para leitura de relance — a velocidade em 40px, a
// rua em uma linha só, e o botão de sair com área de toque de 48px. Quem está
// dirigindo não procura elementos pequenos.

const AVISOS = {
  sinalFraco: {
    Icon: SatelliteDish,
    texto: 'Sinal fraco — alertas pausados',
  },
  semRede: {
    Icon: WifiOff,
    texto: 'Sem conexão — usando dados já carregados',
  },
};

export default function PatrolHud({
  velocidadeKmh,
  rua,
  sinalFraco,
  semRede,
  totalNaFila,
  alertaVisivel,
  onSair,
}) {
  const aviso = sinalFraco ? AVISOS.sinalFraco : semRede ? AVISOS.semRede : null;

  return (
    <>
      {/* Faixa superior: rua atual */}
      <div className="absolute inset-x-0 top-0 z-[1001] pointer-events-none pt-[env(safe-area-inset-top,0px)]">
        <div className="mx-3 mt-2 flex items-center gap-3 rounded-2xl bg-surface-overlay/95 backdrop-blur-sm border border-edge-subtle shadow-xl px-4 py-3 pointer-events-auto">
          <Navigation2 size={22} className="text-brand shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-content-tertiary leading-none mb-1">
              Você está em
            </p>
            <p className="text-lg font-bold text-content-primary truncate leading-tight">
              {rua || 'Localizando…'}
            </p>
          </div>
          <button
            type="button"
            onClick={onSair}
            aria-label="Encerrar patrulha"
            className="shrink-0 w-12 h-12 -mr-1 inline-flex items-center justify-center rounded-full text-content-secondary hover:bg-surface-subtle active:bg-surface-subtleHover transition-colors"
          >
            <X size={24} />
          </button>
        </div>

        {aviso && (
          <div className="mx-3 mt-2 flex items-center gap-2 rounded-xl bg-status-pendingBg border border-status-pendingBorder px-3 py-2 pointer-events-auto">
            <aviso.Icon size={15} className="text-status-pendingFg shrink-0" />
            <span className="text-xs font-semibold text-status-pendingFg">
              {aviso.texto}
            </span>
          </div>
        )}
      </div>

      {/* Velocímetro: canto inferior esquerdo. Sai de cena enquanto o card de
          alerta está na tela — o card ocupa a mesma faixa, e nesses 15 segundos
          a atenção pertence à pergunta, não ao número. */}
      <div
        className={`absolute left-4 bottom-[calc(env(safe-area-inset-bottom,0px)+1rem)] z-[1001] pointer-events-none transition-opacity duration-200 ${
          alertaVisivel ? 'opacity-0' : 'opacity-100'
        }`}
      >
        <div className="w-20 h-20 rounded-full bg-surface-overlay/95 backdrop-blur-sm border border-edge-default shadow-xl flex flex-col items-center justify-center">
          <span className="text-[26px] font-extrabold leading-none text-content-primary tabular-nums">
            {velocidadeKmh}
          </span>
          <span className="text-[10px] font-semibold text-content-tertiary mt-0.5">
            km/h
          </span>
        </div>
      </div>

      {totalNaFila > 0 && !alertaVisivel && (
        <div className="absolute right-4 bottom-[calc(env(safe-area-inset-bottom,0px)+1rem)] z-[1001] pointer-events-none">
          <div className="rounded-full bg-brand text-content-onBrand shadow-xl px-3.5 py-2 text-xs font-bold">
            {totalNaFila} para confirmar
          </div>
        </div>
      )}
    </>
  );
}

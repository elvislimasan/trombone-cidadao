import { X, Navigation2, SatelliteDish, WifiOff, ListChecks, Square, Volume2, VolumeX } from 'lucide-react';

// Painel do modo patrulha: velocidade, rua, avisos e a ação da vez.
//
// Tudo aqui é dimensionado para leitura de relance — a velocidade em 26px, a
// rua em uma linha só, e o botão de sair com área de toque de 48px. Quem está
// dirigindo não procura elementos pequenos.
//
// A FAIXA DE BAIXO É UM FLEX, NÃO TRÊS ELEMENTOS ABSOLUTOS
//
// Antes o velocímetro ficava ancorado à esquerda, a fila à direita e o botão de
// sinalizar centralizado — três posições independentes que só não colidiam por
// coincidência de largura. Em tela de 320px o botão central alcançava o
// velocímetro, e num aparelho mais estreito ainda alcançaria a fila.
//
// Agora velocímetro e ação dividem uma linha só: `flex` não permite
// sobreposição, seja qual for a largura. E a fila subiu para o topo, junto dos
// outros avisos — ela informa, não age, e o rodapé pertence a quem age.

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
  cardVisivel,
  acao,
  onSair,
  mudo = false,
  onAlternarSom,
  somSuportado = true,
}) {
  const aviso = sinalFraco ? AVISOS.sinalFraco : semRede ? AVISOS.semRede : null;

  return (
    <>
      {/* Faixa superior: rua atual, avisos e a contagem da fila */}
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

        <div className="mx-3 mt-2 flex flex-wrap items-center gap-2">
          {aviso && (
            <div className="flex items-center gap-2 rounded-xl bg-status-pendingBg border border-status-pendingBorder px-3 py-2 pointer-events-auto">
              <aviso.Icon size={15} className="text-status-pendingFg shrink-0" />
              <span className="text-xs font-semibold text-status-pendingFg">
                {aviso.texto}
              </span>
            </div>
          )}

          {totalNaFila > 0 && (
            <div className="flex items-center gap-1.5 rounded-xl bg-brand/15 border border-brand/30 px-3 py-2 pointer-events-auto">
              <ListChecks size={15} className="text-brand shrink-0" />
              <span className="text-xs font-bold text-brand">
                {totalNaFila} para confirmar
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Faixa inferior: velocímetro + ação.
          O velocímetro sai de cena enquanto um card ocupa a faixa — nesses
          segundos a atenção pertence à pergunta, não ao número —, mas continua
          ocupando o espaço (opacidade, não remoção) para o botão não pular de
          lugar quando o card sai. */}
      <div className="absolute inset-x-0 bottom-[calc(env(safe-area-inset-bottom,0px)+1rem)] z-[1001] px-4 flex items-center gap-3 pointer-events-none">
        <div
          className={`shrink-0 transition-opacity duration-200 ${
            cardVisivel ? 'opacity-0' : 'opacity-100'
          }`}
        >
          <div className="w-[68px] h-[68px] rounded-full bg-surface-overlay/95 backdrop-blur-sm border border-edge-default shadow-xl flex flex-col items-center justify-center">
            <span className="text-[24px] font-extrabold leading-none text-content-primary tabular-nums">
              {velocidadeKmh}
            </span>
            <span className="text-[10px] font-semibold text-content-tertiary mt-0.5">
              km/h
            </span>
          </div>
        </div>

        {/* Sem ação, a fatia não intercepta toque: um div vazio por cima do
            card de missão roubaria o clique do botão dele. */}
        <div className={`flex-1 min-w-0 flex flex-col items-center gap-2 ${acao ? 'pointer-events-auto' : 'pointer-events-none'}`}>
          {acao}

          {/* ENCERRAR, POR EXTENSO.
              Havia um X no canto superior direito, do tamanho de um ícone, ao
              lado do nome da rua — e era a única saída. Num modo que se usa em
              movimento, a ação de terminar não pode depender de a pessoa
              reconhecer um símbolo pequeno no alto da tela enquanto dirige.
              Aqui embaixo, junto do polegar e do botão de sinalizar, ela tem
              nome. O X continua lá para quem já o conhece. */}
          {!cardVisivel && (
            <button
              type="button"
              onClick={onSair}
              className="pointer-events-auto h-10 px-4 inline-flex items-center gap-1.5 rounded-full bg-surface-overlay/95 backdrop-blur-sm border border-edge-default shadow-lg text-sm font-bold text-content-secondary active:bg-surface-subtleHover transition-colors"
            >
              <Square size={13} className="fill-current" />
              Encerrar patrulha
            </button>
          )}
        </div>

        {/* SOM: ligado ou mudo.
            Fica na faixa de baixo, à direita, espelhando o velocímetro à
            esquerda — as duas coisas que se consulta de relance, nos cantos, e
            o que se decide no meio.

            Existe porque o alerta falava e não havia como calar: quem patrulha
            ouvindo rádio, ou com passageiro no carro, só tinha a opção de
            baixar o volume do aparelho inteiro — e aí perdia a chamada também.

            Não some junto com o velocímetro quando um card sobe: calar o app é
            justamente o que se quer poder fazer NO instante em que ele fala. */}
        {somSuportado && (
          <button
            type="button"
            onClick={onAlternarSom}
            aria-label={mudo ? 'Ligar alertas por voz' : 'Silenciar alertas por voz'}
            aria-pressed={!mudo}
            className={`pointer-events-auto shrink-0 w-[52px] h-[52px] rounded-full backdrop-blur-sm border shadow-xl flex items-center justify-center transition-colors ${
              mudo
                ? 'bg-surface-overlay/95 border-edge-default text-content-tertiary'
                : 'bg-brand border-brand text-content-onBrand'
            }`}
          >
            {mudo ? <VolumeX size={22} /> : <Volume2 size={22} />}
          </button>
        )}
      </div>
    </>
  );
}

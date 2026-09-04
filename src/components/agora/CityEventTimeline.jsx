import { linhaDoTempo } from '@/lib/cityEvents';

// A linha do tempo do acontecimento.
//
// O TRAÇO ENTRE AS BOLINHAS É O QUE FAZ DISTO UMA LINHA
//
// Sem ele, os itens viram uma lista de horários — e a leitura "isto continua"
// se perde. O traço vai de cada bolinha até a seguinte, e o último item não
// tem traço nenhum: é o fim visual da história, mesmo quando é uma parada que
// ainda não aconteceu.

const TONS = {
  inicio:    'border-danger bg-danger',
  andamento: 'border-brand bg-brand',
  ok:        'border-status-resolvedFg bg-status-resolvedFg',
  alerta:    'border-danger bg-danger',
  neutro:    'border-edge-strong bg-edge-strong',
  // A parada pendente é OCA de propósito: cheia, ela pareceria algo que já
  // aconteceu, e é exatamente o oposto do que quer dizer.
  pendente:  'border-edge-strong bg-transparent',
};

const CityEventTimeline = ({ evento, agora = new Date() }) => {
  const itens = linhaDoTempo(evento, agora);
  if (itens.length === 0) return null;

  return (
    <ol className="space-y-0">
      {itens.map((item, indice) => {
        const ultimo = indice === itens.length - 1;

        return (
          <li key={item.id} className="flex gap-3">
            <div className="flex w-14 shrink-0 justify-end pt-0.5">
              <span
                className={`text-xs font-bold tabular-nums ${item.pendente ? 'text-content-tertiary' : 'text-content-secondary'}`}
              >
                {item.hora}
              </span>
            </div>

            <div className="flex flex-col items-center">
              <span
                className={`mt-1.5 h-3 w-3 shrink-0 rounded-full border-2 ${TONS[item.tom] || TONS.neutro}`}
                aria-hidden="true"
              />
              {!ultimo && <span className="w-px flex-1 bg-edge-subtle" aria-hidden="true" />}
            </div>

            <div className={`min-w-0 flex-1 ${ultimo ? 'pb-0' : 'pb-5'}`}>
              <p className={`text-sm font-bold ${item.pendente ? 'text-content-tertiary' : 'text-content-primary'}`}>
                {item.titulo}
              </p>
              {item.detalhe && (
                <p className="mt-0.5 text-xs text-content-tertiary">{item.detalhe}</p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
};

export default CityEventTimeline;

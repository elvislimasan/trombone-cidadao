import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import L from 'leaflet';
import { AlertTriangle, ChevronDown, HelpCircle, History, Map, Route, UserPlus } from 'lucide-react';
import { MapContainer, Polyline, useMap } from 'react-leaflet';
import { MapBaseLayer } from '@/components/map/MapDisplayControls';

// O mapa e a lista das ruas que ainda faltam.
//
// A LEGENDA SAIU DE CIMA DO MAPA
//
// Eram quatro pílulas flutuando no rodapé do mapa — e num mapa de 224px de
// altura elas tapavam justamente as ruas que a tela existe para mostrar. Quem
// explica as cores agora é a faixa de números da página: `ESTADOS_FALTANDO` é
// uma definição só, usada pela linha do mapa E pelo quadrado do cartão, então
// "12 ruas ainda sem verificação" e a linha vermelha se reconhecem sem ninguém
// explicar — a mesma regra que `CartoesDeMapa` já aplica no mapa de ruas.
//
// E O CARTÃO RECORTA
//
// `estadoAtivo` chega de lá. Tocar em "Precisa de mais uma pessoa" deixa no
// mapa e na lista só essas ruas, e o mapa se reenquadra nelas — o que
// transforma um número numa tarefa que cabe num sábado.
//
// O MAPA GANHOU ALTURA PORQUE ELE É O ASSUNTO
//
// 224px fixos era altura de mapa de cortesia. No desktop a coluna tem 60rem de
// largura; 28rem de altura é o que faz o traçado de um bairro inteiro caber sem
// a pessoa precisar arrastar.

/**
 * Os estados de quem ainda falta, na ordem de necessidade.
 *
 * `cor` é o hex que o Leaflet desenha e `classe` é a MESMA cor em token do
 * Tailwind (red-600 é #dc2626, amber-600 é #d97706, blue-600 é #2563eb,
 * violet-600 é #7c3aed) — o cartão não recebe hex, e a linha não recebe classe.
 */
export const ESTADOS_FALTANDO = [
  { id: 'sem_dado', cor: '#dc2626', classe: 'bg-red-600', texto: 'Ainda sem verificação', Icone: HelpCircle },
  { id: 'vencido', cor: '#d97706', classe: 'bg-amber-600', texto: 'Verificação vencida', Icone: History },
  { id: 'uma_observacao', cor: '#2563eb', classe: 'bg-blue-600', texto: 'Precisa de mais uma pessoa', Icone: UserPlus },
  { id: 'conflito', cor: '#7c3aed', classe: 'bg-violet-600', texto: 'Precisa confirmar divergência', Icone: AlertTriangle },
];

const VISUAL = Object.fromEntries(ESTADOS_FALTANDO.map((estado) => [estado.id, estado]));

// `coberturaDaArea` devolve `estado` como OBJETO (`{ estado, rotulo, … }`), e a
// tela lia como se fosse a string do id — `VISUAL[objeto]` nunca batia, toda rua
// saía vermelha e toda linha da lista dizia "Ainda sem verificação", inclusive
// as que só precisavam de uma segunda pessoa.
const idDoEstado = (estado) =>
  (typeof estado === 'string' ? estado : estado?.estado) || 'sem_dado';

const linhasDaRua = (rua) =>
  Array.isArray(rua?.path?.coordinates)
    ? rua.path.coordinates
        .filter((linha) => Array.isArray(linha) && linha.length >= 2)
        .map((linha) => linha.map(([lng, lat]) => [Number(lat), Number(lng)]))
    : [];

function Enquadrar({ linhas }) {
  const map = useMap();
  useEffect(() => {
    const pontos = linhas.flatMap((item) => item.linhas);
    if (!pontos.length) return;
    map.fitBounds(L.latLngBounds(pontos), { padding: [26, 26], maxZoom: 17, animate: false });
  }, [linhas, map]);
  return null;
}

export default function MetaRuasMapa({ faltando = [], estadoAtivo = null, limiteInicial = 8 }) {
  const [mostrarTodas, setMostrarTodas] = useState(false);

  const ruas = useMemo(
    () =>
      faltando.map(({ rua, estado }) => {
        const id = idDoEstado(estado);
        return {
          rua,
          estadoId: id,
          linhas: linhasDaRua(rua),
          visual: VISUAL[id] || VISUAL.sem_dado,
        };
      }),
    [faltando]
  );

  const filtradas = useMemo(
    () => (estadoAtivo ? ruas.filter((item) => item.estadoId === estadoAtivo) : ruas),
    [ruas, estadoAtivo]
  );

  // Trocar o recorte reabre a lista no começo: "ver todas as 25" continuava
  // ligado ao entrar num recorte de 3 ruas, e o botão dizia uma coisa enquanto
  // a lista mostrava outra.
  useEffect(() => setMostrarTodas(false), [estadoAtivo]);

  const desenhaveis = filtradas.filter((item) => item.linhas.length > 0);
  const visiveis = mostrarTodas ? filtradas : filtradas.slice(0, limiteInicial);

  if (!ruas.length) return null;

  return (
    <section className="overflow-hidden rounded-3xl border border-edge-subtle bg-surface-raised shadow-elevation-1">
      <div className="flex flex-wrap items-start justify-between gap-3 px-4 pb-3 pt-4 sm:px-5 sm:pt-5">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-base font-bold text-content-primary">
            <Map className="h-4 w-4 shrink-0 text-brand" />
            Ruas que precisam ser verificadas
          </h2>
          <p className="mt-1 max-w-prose text-xs leading-relaxed text-content-tertiary sm:text-sm">
            As cores são as mesmas dos números acima. Toque numa rua para abrir os
            detalhes e colaborar.
          </p>
        </div>

        <span className="shrink-0 rounded-full bg-brand/10 px-2.5 py-1 text-xs font-bold tabular-nums text-brand">
          {estadoAtivo
            ? `${filtradas.length} de ${ruas.length} ruas`
            : `${ruas.length} ${ruas.length === 1 ? 'rua' : 'ruas'}`}
        </span>
      </div>

      {estadoAtivo && filtradas.length === 0 ? (
        <div className="mx-4 rounded-2xl bg-surface-subtle px-4 py-3 text-xs leading-relaxed text-content-tertiary sm:mx-5 sm:text-sm">
          Nenhuma rua neste recorte. Toque no cartão de novo para ver todas.
        </div>
      ) : desenhaveis.length > 0 ? (
        <div className="relative h-64 border-y border-edge-subtle bg-surface-subtle sm:h-80 lg:h-[28rem]">
          <MapContainer
            center={desenhaveis[0].linhas[0][0]}
            zoom={15}
            scrollWheelZoom={false}
            dragging
            className="h-full w-full"
          >
            <MapBaseLayer />
            <Enquadrar linhas={desenhaveis} />
            {desenhaveis.flatMap((item) =>
              item.linhas.map((linha, index) => (
                <Polyline
                  key={`${item.rua.id}-${index}`}
                  positions={linha}
                  pathOptions={{
                    color: item.visual.cor,
                    weight: 4,
                    opacity: 0.82,
                    lineCap: 'round',
                    lineJoin: 'round',
                  }}
                />
              ))
            )}
          </MapContainer>
        </div>
      ) : (
        <div className="mx-4 rounded-2xl bg-surface-subtle px-4 py-3 text-xs leading-relaxed text-content-tertiary sm:mx-5 sm:text-sm">
          Estas ruas ainda não possuem traçado no mapa. A lista abaixo continua
          disponível para colaboração.
        </div>
      )}

      {/* DUAS COLUNAS SÓ QUANDO CABEM DUAS
          Uma lista de 25 ruas em coluna única é meia tela de rolagem com 80% de
          espaço vazio à direita de cada linha. Mas o que decide não é a largura
          da JANELA: é a da coluna onde este cartão mora. Entre 1100px e 1400px a
          página abre a lateral de 22rem e sobram ~660px aqui — em duas colunas o
          nome da rua truncaria no meio. Daí o vai-e-volta: duas em 900px, uma de
          volta em 1100px (quando a lateral nasce), duas de novo em 1400px. */}
      <ul className="grid px-4 pt-1 sm:px-5 min-[900px]:grid-cols-2 min-[900px]:gap-x-8 min-[1100px]:grid-cols-1 min-[1400px]:grid-cols-2">
        {visiveis.map(({ rua, visual }) => (
          <li key={rua.id} className="border-b border-edge-subtle last:border-b-0">
            <Link
              to={`/mapa-pavimentacao/rua/${rua.id}`}
              className="-mx-2 flex min-h-14 items-center gap-3 rounded-xl px-2 py-2.5 transition-colors hover:bg-surface-subtle"
            >
              <span className="h-9 w-1.5 flex-none rounded-full" style={{ background: visual.cor }} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-content-primary">
                  {rua.name || 'Rua sem nome'}
                </span>
                <span className="block truncate text-xs text-content-tertiary">
                  {rua.bairro?.name ? `${rua.bairro.name} · ` : ''}
                  {visual.texto}
                </span>
              </span>
              <Route className="h-4 w-4 flex-none text-content-tertiary" />
            </Link>
          </li>
        ))}
      </ul>

      {filtradas.length > limiteInicial && (
        <button
          type="button"
          onClick={() => setMostrarTodas((valor) => !valor)}
          className="mt-1 flex w-full items-center justify-center gap-1.5 border-t border-edge-subtle px-4 py-3.5 text-xs font-bold text-content-secondary transition-colors hover:bg-surface-subtle sm:text-sm"
        >
          {mostrarTodas ? 'Mostrar menos' : `Ver todas as ${filtradas.length} ruas`}
          <ChevronDown className={`h-4 w-4 transition-transform ${mostrarTodas ? 'rotate-180' : ''}`} />
        </button>
      )}
    </section>
  );
}

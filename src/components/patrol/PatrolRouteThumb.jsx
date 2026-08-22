import { useMemo } from 'react';
import { enquadrarRastro, rastroDoBanco } from '@/lib/navGeo';

// A forma do trajeto, do tamanho de um selo.
//
// POR QUE SVG E NÃO UM MAPA
//
// A tentação é montar um Leaflet por linha da lista. Vinte MapContainers numa
// tela que rola custa memória, tiles e uma espera de rede para desenhar uma
// figura de 112 pixels — onde as ruas do fundo, nesse tamanho, viram borrão.
//
// O que identifica uma saída não é o mapa: é o desenho dela. Quem patrulhou
// reconhece o próprio quarteirão pela forma, do mesmo jeito que reconhece uma
// corrida no Strava sem ler o nome da rua. Um `<polyline>` faz isso na hora,
// sem rede, e acompanha o tema.
//
// OS PONTOS SÃO O ASSUNTO
//
// O traço diz por onde; os pontos dizem o que aconteceu. Numa patrulha, o
// segundo importa mais — e é por isso que eles são desenhados por cima da
// linha, com contorno da cor do fundo para não sumirem quando caem sobre ela.

const LARGURA = 112;
const ALTURA = 72;

/** Cor de cada tipo de ação. Espelha o vocabulário da migração 189. */
const COR_DA_ACAO = {
  bronca: 'rgb(var(--brand))',
  missao: 'rgb(var(--success-fg))',
  sinal: 'rgb(var(--status-pending-fg))',
  confirmacao: 'rgb(var(--status-progress-fg))',
};

export default function PatrolRouteThumb({ path, actions, className = '' }) {
  const desenho = useMemo(() => {
    const trilha = rastroDoBanco(path);
    const acoes = (actions || [])
      .filter((a) => a && Number.isFinite(a.lat) && Number.isFinite(a.lng))
      .map((a) => ({ lat: a.lat, lng: a.lng, t: a.t }));

    // O enquadramento considera traço E ações. Enquadrando só pelo traço, uma
    // bronca registrada fora dele — a pessoa desceu do carro e andou até o
    // poste — cairia do lado de fora da caixa.
    const tudo = [...trilha, ...acoes];
    if (tudo.length === 0) return null;

    const { projetar } = enquadrarRastro(tudo, LARGURA, ALTURA, 8);

    return {
      linha: trilha.map(projetar).filter(Boolean),
      pontos: acoes
        .map((a) => ({ ...projetar(a), t: a.t }))
        .filter((p) => Number.isFinite(p.x)),
    };
  }, [path, actions]);

  if (!desenho) return null;

  return (
    <svg
      viewBox={`0 0 ${LARGURA} ${ALTURA}`}
      width={LARGURA}
      height={ALTURA}
      className={`shrink-0 rounded-xl bg-surface-sunken ${className}`}
      aria-hidden="true"
    >
      {desenho.linha.length > 1 && (
        <polyline
          points={desenho.linha.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')}
          fill="none"
          stroke="rgb(var(--text-tertiary))"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity="0.75"
        />
      )}

      {desenho.pontos.map((p, i) => (
        <circle
          key={i}
          cx={p.x}
          cy={p.y}
          r="3.5"
          fill={COR_DA_ACAO[p.t] || 'rgb(var(--brand))'}
          stroke="rgb(var(--surface-sunken))"
          strokeWidth="1.5"
        />
      ))}
    </svg>
  );
}

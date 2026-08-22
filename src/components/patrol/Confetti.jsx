import { useMemo } from 'react';

// Confete.
//
// SEM BIBLIOTECA, E SEM CANVAS
//
// As bibliotecas de confete desenham num `<canvas>` com um laço de animação em
// JavaScript — cinquenta partículas recalculadas a cada quadro, na mesma thread
// que acabou de gravar a patrulha e ainda vai montar o resumo. Aqui são
// trinta `<span>` animados por CSS: a composição acontece fora da thread
// principal, e o custo em JS é gerar trinta números uma vez.
//
// Também não entra dependência nova no bundle por causa de dois segundos de
// tela.
//
// RESPEITA QUEM PEDIU PARA NÃO ANIMAR
//
// `prefers-reduced-motion` não é preferência estética: para parte das pessoas,
// movimento na tela provoca enjoo ou desencadeia enxaqueca. Com ele ligado, o
// componente não renderiza nada — a comemoração continua existindo no texto e
// no ícone, que é onde ela de fato está.

const CORES = [
  'rgb(var(--brand))',
  'rgb(var(--success-fg))',
  'rgb(var(--status-pending-fg))',
  'rgb(var(--status-progress-fg))',
];

const QUANTIDADE = 30;

export default function Confetti({ ativo = true }) {
  // Gerado uma vez: recalcular a cada render faria as partículas saltarem de
  // posição no meio da queda.
  const pecas = useMemo(
    () =>
      Array.from({ length: QUANTIDADE }, (_, i) => ({
        id: i,
        esquerda: Math.random() * 100,
        // O atraso espalha a chuva no tempo. Sem ele, todas caem juntas e o
        // efeito vira um piscar só.
        atraso: Math.random() * 0.6,
        duracao: 1.6 + Math.random() * 1.2,
        cor: CORES[i % CORES.length],
        largura: 5 + Math.random() * 4,
        altura: 8 + Math.random() * 6,
        giro: Math.random() * 360,
        // Metade redonda, metade retangular: papel picado de verdade não tem
        // uma forma só, e a variação é o que impede a leitura de "bolinhas".
        redondo: i % 3 === 0,
      })),
    []
  );

  if (!ativo) return null;

  return (
    <div
      className="pointer-events-none absolute inset-0 overflow-hidden motion-reduce:hidden"
      aria-hidden="true"
    >
      <style>{`
        @keyframes confete-cai {
          0%   { transform: translate3d(0, -20%, 0) rotate(0deg); opacity: 1; }
          100% { transform: translate3d(0, 420%, 0) rotate(540deg); opacity: 0; }
        }
      `}</style>

      {pecas.map((p) => (
        <span
          key={p.id}
          style={{
            position: 'absolute',
            top: 0,
            left: `${p.esquerda}%`,
            width: `${p.largura}px`,
            height: `${p.redondo ? p.largura : p.altura}px`,
            backgroundColor: p.cor,
            borderRadius: p.redondo ? '50%' : '1px',
            transform: `rotate(${p.giro}deg)`,
            animation: `confete-cai ${p.duracao}s cubic-bezier(0.25, 0.6, 0.4, 1) ${p.atraso}s forwards`,
          }}
        />
      ))}
    </div>
  );
}

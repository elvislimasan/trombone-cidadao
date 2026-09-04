import { useEffect, useRef, useState } from 'react';

// As animações da home, tiradas do protótipo visual original.
//
// POR QUE ISTO NÃO É UMA BIBLIOTECA
//
// São três comportamentos — revelar ao rolar, contar até o número e encher a
// barra — e todos cabem em IntersectionObserver, que é API do navegador. Trazer
// uma dependência de animação para isto somaria peso ao bundle que já passa de
// 4,6 MB.
//
// TUDO RESPEITA `prefers-reduced-motion`
//
// Quem pediu menos movimento ao sistema operacional não pediu menos conteúdo:
// o texto aparece na hora, o número já nasce no valor final e a barra já nasce
// cheia. A regra do CSS cuida do reveal; os dois hooks daqui checam a media
// query direto, porque animação em JavaScript não é alcançada por CSS.

const querMenosMovimento = () =>
  typeof window !== 'undefined'
  && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/**
 * Revela os elementos `.reveal` de dentro do contêiner conforme entram na tela.
 *
 * Devolve a ref do contêiner. O observador é refeito quando `deps` muda porque
 * os cartões desta página chegam depois — as broncas e as petições vêm do banco,
 * e um observador montado só uma vez ignoraria todos eles.
 *
 * `unobserve` após revelar: a animação é de entrada, não de ida e volta. Sem
 * isso, rolar para cima e para baixo faria a página piscar.
 */
export function useRevelarAoRolar(deps = []) {
  const containerRef = useRef(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;

    const alvos = container.querySelectorAll('.reveal:not(.visible)');
    if (!alvos.length) return undefined;

    if (querMenosMovimento()) {
      alvos.forEach((el) => el.classList.add('visible'));
      return undefined;
    }

    const observador = new IntersectionObserver((entradas) => {
      entradas.forEach((entrada) => {
        if (!entrada.isIntersecting) return;
        entrada.target.classList.add('visible');
        observador.unobserve(entrada.target);
      });
    }, { threshold: 0.15, rootMargin: '0px 0px -40px 0px' });

    alvos.forEach((el) => observador.observe(el));
    return () => observador.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return containerRef;
}

/**
 * Um número que conta de zero até o valor quando entra na tela.
 *
 * DURAÇÃO E CURVA SÃO AS DO PROTÓTIPO: 1600ms com `1 - (1-t)^4`, que começa
 * rápido e freia no fim — é o que faz o número parecer "chegar" em vez de
 * simplesmente parar.
 *
 * O valor chega DEPOIS da montagem (vem de uma contagem no banco), então a
 * animação espera as duas coisas: o elemento estar visível e o número existir.
 * Sem essa espera, o contador correria até `0` no primeiro quadro e ficaria lá.
 */
export function Contador({ valor, sufixo = '', className = '' }) {
  const ref = useRef(null);
  const jaAnimou = useRef(false);
  const [visivel, setVisivel] = useState(false);
  const [mostrado, setMostrado] = useState(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;

    const observador = new IntersectionObserver((entradas) => {
      if (entradas.some((e) => e.isIntersecting)) {
        setVisivel(true);
        observador.disconnect();
      }
    }, { threshold: 0.3 });

    observador.observe(el);
    return () => observador.disconnect();
  }, []);

  useEffect(() => {
    if (!visivel || valor == null || jaAnimou.current) return undefined;
    jaAnimou.current = true;

    if (querMenosMovimento()) {
      setMostrado(valor);
      return undefined;
    }

    const duracao = 1600;
    const inicio = performance.now();
    let quadro;

    const passo = (agora) => {
      const decorrido = agora - inicio;
      const progresso = Math.min(decorrido / duracao, 1);
      const suavizado = 1 - (1 - progresso) ** 4;
      setMostrado(Math.round(valor * suavizado));
      if (progresso < 1) quadro = requestAnimationFrame(passo);
    };

    quadro = requestAnimationFrame(passo);
    return () => cancelAnimationFrame(quadro);
  }, [visivel, valor]);

  // Antes de ter valor, um traço — e não "0". Zero é uma afirmação sobre a
  // cidade; o traço diz que o número ainda não chegou.
  const texto = mostrado == null
    ? (valor == null ? '—' : '0')
    : mostrado.toLocaleString('pt-BR');

  return <span ref={ref} className={className}>{texto}{mostrado == null && valor == null ? '' : sufixo}</span>;
}

/**
 * Uma barra de progresso que enche ao entrar na tela.
 *
 * A largura sai de `style` e não de uma classe do Tailwind porque é um valor
 * calculado — `w-[63%]` não existe até alguém escrever, e a varredura do
 * Tailwind não enxerga string montada em tempo de execução.
 */
export function BarraQueEnche({ parte, className = '' }) {
  const ref = useRef(null);
  const [cheia, setCheia] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;

    if (querMenosMovimento()) {
      setCheia(true);
      return undefined;
    }

    const observador = new IntersectionObserver((entradas) => {
      if (entradas.some((e) => e.isIntersecting)) {
        setCheia(true);
        observador.disconnect();
      }
    }, { threshold: 0.5 });

    observador.observe(el);
    return () => observador.disconnect();
  }, []);

  return (
    <div ref={ref} className={`h-1.5 w-full overflow-hidden rounded-full bg-surface-subtle ${className}`}>
      <div
        className="h-full rounded-full bg-brand transition-[width] duration-1000 ease-[cubic-bezier(0.22,1,0.36,1)]"
        style={{ width: cheia ? `${parte}%` : '0%' }}
      />
    </div>
  );
}

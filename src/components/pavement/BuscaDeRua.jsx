import { useEffect, useMemo, useRef, useState } from 'react';
import { Search, MapPin } from 'lucide-react';

import { Input } from '@/components/ui/input';

// A busca de rua do mapa de pavimentação.
//
// POR QUE ISTO EXISTE EM VEZ DE UM `<datalist>`
//
// Era um `<datalist>` nativo com as ~400 ruas da cidade dentro. No WebView do
// Android ele não é um dropdown: é uma folha que ocupa a tela inteira, com a
// lista crua por cima do mapa e do teclado. Foi o relato de "busca bugada" e o
// de "nomes de rua sobrepostos" — os dois são a mesma coisa.
//
// E `datalist` não aceita CSS. Não havia como consertar a aparência: só
// trocando o componente.
//
// O QUE O DROPDOWN PRÓPRIO PERMITE, E O NATIVO NÃO
//
// Mostrar o BAIRRO ao lado do nome. Numa base com sete "Rua Projetada 20", o
// nome sozinho não identifica coisa nenhuma — o bairro é o que diz qual delas
// é. Era informação que o cadastro já tinha e a busca não mostrava.

/** Quantas sugestões cabem sem virar a mesma lista infinita de antes. */
const MAXIMO = 8;

const dobrar = (valor) => String(valor || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .trim();

export default function BuscaDeRua({ streets, valor, onValorChange, onEscolher }) {
  const [aberto, setAberto] = useState(false);
  const [ativo, setAtivo] = useState(0);
  const containerRef = useRef(null);

  const sugestoes = useMemo(() => {
    const termo = dobrar(valor);
    if (!termo) return [];
    return (streets || [])
      .filter((rua) => dobrar(rua.name).includes(termo) || dobrar(rua.bairro?.name).includes(termo))
      .slice(0, MAXIMO);
  }, [streets, valor]);

  // Fecha ao tocar fora. No celular a lista some junto com o teclado, e sem
  // isto ela ficaria pendurada sobre o mapa depois de o foco sair.
  useEffect(() => {
    if (!aberto) return undefined;
    const aoTocarFora = (evento) => {
      if (!containerRef.current?.contains(evento.target)) setAberto(false);
    };
    document.addEventListener('pointerdown', aoTocarFora);
    return () => document.removeEventListener('pointerdown', aoTocarFora);
  }, [aberto]);

  useEffect(() => { setAtivo(0); }, [valor]);

  const escolher = (rua) => {
    onValorChange(rua.name);
    setAberto(false);
    onEscolher?.(rua);
  };

  const aoTeclar = (evento) => {
    if (!aberto || sugestoes.length === 0) return;
    if (evento.key === 'ArrowDown') {
      evento.preventDefault();
      setAtivo((i) => (i + 1) % sugestoes.length);
    } else if (evento.key === 'ArrowUp') {
      evento.preventDefault();
      setAtivo((i) => (i - 1 + sugestoes.length) % sugestoes.length);
    } else if (evento.key === 'Enter') {
      evento.preventDefault();
      escolher(sugestoes[ativo]);
    } else if (evento.key === 'Escape') {
      setAberto(false);
    }
  };

  const mostrando = aberto && sugestoes.length > 0;

  return (
    <div ref={containerRef} className="relative">
      <Search className="pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-content-tertiary" />
      <Input
        type="text"
        placeholder="Buscar por rua ou bairro..."
        className="h-9 border-edge-subtle bg-surface-raised pl-9 text-xs md:text-sm"
        value={valor}
        onChange={(e) => { onValorChange(e.target.value); setAberto(true); }}
        onFocus={() => setAberto(true)}
        onKeyDown={aoTeclar}
        role="combobox"
        aria-expanded={mostrando}
        aria-autocomplete="list"
        aria-controls="sugestoes-de-rua"
      />

      {/* z acima dos controles do mapa, que ficam em z-[800]. */}
      {mostrando && (
        <ul
          id="sugestoes-de-rua"
          role="listbox"
          className="absolute inset-x-0 top-full z-[900] mt-1 max-h-72 overflow-y-auto rounded-xl border border-edge-subtle bg-surface-raised py-1 shadow-elevation-2"
        >
          {sugestoes.map((rua, indice) => (
            <li key={rua.id}>
              <button
                type="button"
                role="option"
                aria-selected={indice === ativo}
                onMouseEnter={() => setAtivo(indice)}
                onClick={() => escolher(rua)}
                className={`flex w-full items-center gap-2 px-3 py-2 text-left transition-colors ${
                  indice === ativo ? 'bg-surface-subtle' : ''
                }`}
              >
                <MapPin className="h-3.5 w-3.5 shrink-0 text-content-tertiary" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-semibold text-content-primary">
                    {rua.name}
                  </span>
                  {rua.bairro?.name && (
                    <span className="block truncate text-[11px] text-content-tertiary">
                      {rua.bairro.name}
                    </span>
                  )}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

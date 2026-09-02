import { useState } from 'react';
import { SlidersHorizontal, ChevronDown, ArrowLeft, X } from 'lucide-react';

import BuscaDeRua from '@/components/pavement/BuscaDeRua';
import { Drawer, DrawerClose, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { useIsMobile } from '@/hooks/useIsMobile';
import { SITUACOES } from '@/lib/pavementLength';

// O painel de controle do mapa de pavimentação.
//
// UM CARTÃO SÓ, E NÃO TRÊS
//
// Busca e filtros já foram cartões separados, cada um com moldura e recheio dos
// dois lados. A coluna ficava mais alta sem oferecer mais informação.
//
// Num cartão único com divisórias, o recheio é pago uma vez. O conteúdo é o
// mesmo e cabe sem rolar.
//
// NO CELULAR ELE NÃO FLUTUA
//
// Sobre 360 px de mapa, um painel por cima é o mapa inteiro coberto. Lá os
// filtros abrem em drawer, e o botão carrega a contagem de quantos estão
// ligados — a única informação que precisa atravessar o painel fechado.

const SELETORES = [
  { id: 'bairro', rotulo: 'Bairro', vazio: 'Todos os bairros' },
  { id: 'situacao', rotulo: 'Situação', vazio: 'Todas', opcoes: SITUACOES.map((s) => [s.id, s.rotulo]) },
  { id: 'tipo', rotulo: 'Tipo de pavimento', vazio: 'Todos', opcoes: [['asphalt', 'Asfáltica'], ['granite', 'Paralelepípedo'], ['interlocking', 'Intertravado']] },
  { id: 'cep', rotulo: 'CEP', vazio: 'Todas', opcoes: [['com', 'Com CEP'], ['sem', 'Sem CEP']] },
  { id: 'lei', rotulo: 'Lei municipal', vazio: 'Todas', opcoes: [['com', 'Com anexo da lei'], ['sem', 'Sem anexo da lei']] },
  // Separado da lei de propósito: são dois documentos, e a rua que tem um e não
  // o outro é justamente a que interessa cobrar da Câmara.
  { id: 'projeto', rotulo: 'Projeto de lei', vazio: 'Todos', opcoes: [['com', 'Com projeto de lei'], ['sem', 'Sem projeto de lei']] },
  // A rua sem nome oficial é a pergunta de quem monta projeto de lei de
  // denominação. O contador do cabeçalho já dizia QUANTAS são, mas só abria uma
  // lista solta. Como filtro, ela cruza com bairro, situação e CEP — e "as ruas
  // sem nome do Parque das Acácias que ainda não têm pavimentação" passa a ser
  // uma consulta, em vez de uma conferência manual.
  { id: 'nome', rotulo: 'Nome oficial', vazio: 'Todas', opcoes: [['com', 'Com nome oficial'], ['sem', 'Sem nome oficial']] },
];

const Titulo = ({ children, acao = null }) => (
  <div className="mb-2 flex items-center justify-between gap-2">
    <h2 className="text-[10px] font-bold uppercase tracking-wider text-content-tertiary">{children}</h2>
    {acao}
  </div>
);

/* --- Os dois painéis, escritos uma vez e usados nos dois tamanhos --- */

const Filtros = ({ filtros, onFiltroChange, bairros }) => (
  <div className="grid gap-2 sm:grid-cols-2 min-[1100px]:grid-cols-1">
    {SELETORES.map(({ id, rotulo, vazio, opcoes }) => (
      <label key={id} className="grid gap-0.5">
        <span className="text-[10px] font-medium text-content-tertiary">{rotulo}</span>
        <select
          value={filtros[id]}
          onChange={(e) => onFiltroChange(id, e.target.value)}
          className="h-8 w-full rounded-lg border border-edge-default bg-surface-raised px-2 text-[11px] font-semibold text-content-primary"
        >
          <option value="all">{vazio}</option>
          {(id === 'bairro' ? bairros : opcoes).map(([valor, nome]) => (
            <option key={valor} value={valor}>{nome}</option>
          ))}
        </select>
      </label>
    ))}
  </div>
);

const BotaoDePainel = ({ Icone, rotulo, contagem = 0, aberto, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    aria-expanded={aberto}
    className={`flex flex-1 items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-xs font-bold transition-colors ${
      aberto ? 'border-brand bg-brand-subtleBg text-brand' : 'border-edge-subtle bg-surface-raised text-content-secondary'
    }`}
  >
    <Icone className="h-4 w-4" />
    {rotulo}
    {contagem > 0 && (
      <span className="rounded-full bg-brand px-1.5 text-[10px] font-extrabold text-content-onBrand tabular-nums">
        {contagem}
      </span>
    )}
    <ChevronDown className={`h-3.5 w-3.5 transition-transform ${aberto ? 'rotate-180' : ''}`} />
  </button>
);

export default function PavementSidebar({
  streets,
  busca,
  onBuscaChange,
  onEscolherRua,
  filtros,
  onFiltroChange,
  onLimpar,
  bairros,
  // O TOPO DO PAINEL É O CABEÇALHO DA TELA.
  //
  // Seletor de cidade, contagem de ruas e as ações vinham numa barra sobre o
  // mapa. Ali eles custavam uma faixa de altura na largura inteira para dizer
  // duas coisas curtas — e a coluna, que já existe, tem esse espaço de graça.
  // O mapa fica sem moldura nenhuma em cima, que é o que ele quer.
  cabecalho = null,
  onOcultar = null,
  // Ações do painel — hoje só "Adicionar rua". Ficam no RODAPÉ, junto de
  // "Ocultar filtros": cabeçalho responde "o que estou vendo", rodapé responde
  // "o que posso fazer". Misturar os dois foi o que deixou o topo irregular.
  acoes = null,
}) {
  const [painel, setPainel] = useState(null);
  const isMobile = useIsMobile();
  const ligados = Object.values(filtros).filter((v) => v !== 'all').length;

  const abrir = (qual) => setPainel(qual);
  const limparBotao = ligados > 0 ? (
    <button type="button" onClick={onLimpar} className="text-[10px] font-bold text-brand">
      Limpar
    </button>
  ) : null;

  const buscaEl = (
    <BuscaDeRua streets={streets} valor={busca} onValorChange={onBuscaChange} onEscolher={onEscolherRua} />
  );

  return (
    <>
      {/* DESKTOP: coluna própria, ao lado do mapa.
          Ele já flutuou por cima. Sobreposto, cobria a parte do mapa que fica
          logo abaixo dele — e num mapa a região central importa. Como coluna, o
          mapa inteiro fica visível e o painel para de disputar espaço com o que
          ele serve para filtrar. */}
      <div className="hidden h-full flex-col overflow-hidden rounded-2xl border border-edge-subtle bg-surface-raised shadow-sm min-[1100px]:flex">
        {cabecalho && <div className="border-b border-edge-subtle p-3">{cabecalho}</div>}

        <div className="min-h-0 flex-1 overflow-y-auto scrollbar-none">
          <div className="p-3">{buscaEl}</div>

        <div className="border-t border-edge-subtle p-3">
          <Titulo acao={limparBotao}>Filtros</Titulo>
          <Filtros filtros={filtros} onFiltroChange={onFiltroChange} bairros={bairros} />
        </div>

        </div>

        {/* Fora da área rolável: são ações da coluna inteira, e ficariam
            escondidas se rolassem junto com o conteúdo dela. */}
        {acoes && <div className="shrink-0 border-t border-edge-subtle p-2.5">{acoes}</div>}
        {onOcultar && (
          <button
            type="button"
            onClick={onOcultar}
            className="flex shrink-0 items-center gap-1.5 border-t border-edge-subtle px-3 py-2.5 text-[11px] font-bold text-content-secondary transition-colors hover:bg-surface-subtle"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Ocultar filtros
          </button>
        )}
      </div>

      {/* Tablet e celular: a busca fica à mão; controles densos abrem em drawer
          e deixam de empurrar o mapa para baixo. */}
      <div className="grid grid-cols-[minmax(0,1fr)_6.75rem] gap-2 min-[900px]:grid-cols-[12.5rem_minmax(0,1fr)_7.5rem_8.5rem] min-[900px]:items-center min-[1100px]:hidden">
        {cabecalho && (
          <div className="col-span-2 min-w-0 min-[900px]:col-span-1">
            {cabecalho}
          </div>
        )}
        <div className="min-w-0">{buscaEl}</div>

        <div className="flex">
          <BotaoDePainel
            Icone={SlidersHorizontal}
            rotulo="Filtros"
            contagem={ligados}
            aberto={painel === 'filtros'}
            onClick={() => abrir('filtros')}
          />
        </div>

        {acoes && (
          <div className="col-span-2 min-w-0 min-[900px]:col-span-1">
            {acoes}
          </div>
        )}
      </div>

      <Drawer
        open={painel !== null}
        onOpenChange={(open) => !open && setPainel(null)}
        direction={isMobile ? 'bottom' : 'left'}
      >
        <DrawerContent className="max-h-[88dvh] rounded-t-2xl md:h-full md:max-h-none md:w-[22rem] md:rounded-none">
          <DrawerHeader className="flex-row items-start justify-between gap-3 border-b border-edge-subtle text-left">
            <div className="min-w-0">
              <DrawerTitle className="flex items-center gap-2 text-base">
                <SlidersHorizontal className="h-4 w-4 text-brand" /> Filtros
              </DrawerTitle>
              <DrawerDescription className="mt-1 text-xs">
                Refine as ruas exibidas no mapa.
              </DrawerDescription>
            </div>
            <DrawerClose asChild>
              <button
                type="button"
                aria-label="Fechar painel"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-content-secondary transition-colors hover:bg-surface-subtle"
              >
                <X className="h-4 w-4" />
              </button>
            </DrawerClose>
          </DrawerHeader>

          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            <Titulo acao={limparBotao}>Filtros disponíveis</Titulo>
            <Filtros filtros={filtros} onFiltroChange={onFiltroChange} bairros={bairros} />
          </div>
        </DrawerContent>
      </Drawer>
    </>
  );
}

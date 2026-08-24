import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet';
import { Moon, ChevronRight } from 'lucide-react';

import PageHeader from '@/components/PageHeader';
import { CATEGORIAS_SINAL } from '@/lib/reportCategories';
import { NAV_ALERTA, ehNoite } from '@/lib/navGeo';
import { usePosicaoAproximada } from '@/hooks/usePosicaoAproximada';

// Escolher o que procurar, antes de sair.
//
// POR QUE ISTO VIROU TELA
//
// A lista de categorias morava no fim da central de missões, como uma seção com
// âncora — e os botões "Sair em patrulha" apontavam para `#patrulhas`, rolando
// a tela até ela.
//
// A central foi reorganizada para caber num fluxo só: nível, o que continuar,
// patrulha em andamento, as missões. A lista de categorias não é nada disso —
// ela é o passo seguinte de UMA decisão já tomada ("vou patrulhar"), e ocupava
// meia tela de quem só queria ver o progresso.
//
// Como rota ela ganha o que faltava: `/patrulhar` deixa de redirecionar para a
// central e passa a ser um destino de verdade. Todo botão de patrulha aponta
// para cá, e o voltar funciona sozinho.
//
// NÃO EXISTE "PATRULHA COMPLETA"
//
// Uma patrulha de tudo entregava alertas de categorias misturadas, e quem sai à
// noite para conferir postes não quer parar num buraco. Com uma categoria por
// vez, o corredor traz só o que interessa e o card sabe o que dizer.

const CartaoPatrulha = ({ icone, titulo, descricao, aviso, desabilitado, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={desabilitado}
    className={`w-full flex items-center gap-4 rounded-2xl border px-4 py-4 text-left transition-colors ${
      desabilitado
        ? 'border-edge-subtle bg-surface-subtle opacity-60 cursor-not-allowed'
        : 'border-edge-subtle bg-surface-raised shadow-elevation-1 hover:bg-surface-subtle active:scale-[0.99]'
    }`}
  >
    <span className="shrink-0 w-12 h-12 rounded-xl bg-brand-subtleBg ring-1 ring-edge-subtle flex items-center justify-center text-2xl">
      {icone}
    </span>

    <span className="min-w-0 flex-1">
      <span className="block text-[15px] font-bold text-content-primary leading-tight">
        {titulo}
      </span>
      <span className="block text-xs text-content-secondary mt-0.5 leading-snug">
        {descricao}
      </span>
      {aviso && (
        <span className="mt-1.5 inline-flex items-center gap-1.5 rounded-lg bg-status-pendingBg px-2 py-1 text-[11px] font-semibold text-status-pendingFg">
          <Moon size={12} />
          {aviso}
        </span>
      )}
    </span>

    {!desabilitado && (
      <ChevronRight size={20} className="shrink-0 text-content-tertiary" />
    )}
  </button>
);

export default function PatrolPickPage() {
  const navigate = useNavigate();
  const posicao = usePosicaoAproximada();

  const noite = useMemo(
    () => (posicao ? ehNoite(Date.now(), posicao.lat, posicao.lng) : null),
    [posicao]
  );

  return (
    <div className="container max-w-2xl mx-auto w-full px-4 py-6 pb-24">
      <Helmet>
        <title>Sair em patrulha | Trombone Cidadão</title>
        <meta name="robots" content="noindex" />
      </Helmet>

      <PageHeader
        titulo="Sair em patrulha"
        subtitulo="Escolha o que você vai procurar hoje"
        paraOnde="/missoes"
      />

      <div className="flex flex-col gap-2.5">
        {/* CATEGORIAS_SINAL é a lista sem "outros" — a mesma que a folha de
            sinalização usa, e pela mesma razão: uma patrulha de "outros" não
            conseguiria dizer o que procurar. */}
        {CATEGORIAS_SINAL.map((categoria) => {
          const soANoite = NAV_ALERTA.categoriasNoturnas.includes(categoria.id);
          // Só desabilita quando SABEMOS que é dia. Sem posição, entra com o
          // aviso — a regra é do alerta, e ele explica de novo lá dentro.
          const bloqueada = soANoite && noite === false;

          return (
            <CartaoPatrulha
              key={categoria.id}
              icone={categoria.icon}
              titulo={`Patrulha de ${categoria.name.toLowerCase()}`}
              descricao={
                soANoite
                  ? 'Confira se os postes da sua rua estão acesos'
                  : `Só as broncas de ${categoria.name.toLowerCase()}`
              }
              aviso={
                soANoite
                  ? bloqueada
                    ? 'Disponível quando escurecer por aqui'
                    : 'Só alerta depois que escurece'
                  : null
              }
              desabilitado={bloqueada}
              onClick={() => navigate(`/patrulhar/${categoria.id}`)}
            />
          );
        })}
      </div>
    </div>
  );
}

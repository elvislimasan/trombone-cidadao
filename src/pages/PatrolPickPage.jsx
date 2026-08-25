import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet';
import { ArrowLeft, ArrowRight, Flag } from 'lucide-react';

import PageHeader from '@/components/PageHeader';
import PatrolAvatarStudio from '@/components/patrol/PatrolAvatarStudio';
import PatrolFocusStep from '@/components/patrol/PatrolFocusStep';
import PatrolReadyStep from '@/components/patrol/PatrolReadyStep';
import PatrolStepper from '@/components/patrol/PatrolStepper';
import PatrolTravelModePicker, {
  PatrolTravelModeIcon,
} from '@/components/patrol/PatrolTravelModePicker';
import { CATEGORIAS_SINAL, categoriaPorId } from '@/lib/reportCategories';
import { NAV_ALERTA, ehNoite } from '@/lib/navGeo';
import {
  buildPatrolPickStepPath,
  getPatrolPickStep,
  patrolPickStepFromSearch,
  patrolPickStepIds,
  patrolPickStepSibling,
  resolvePatrolPickStep,
} from '@/lib/patrolPickFlow';
import {
  buildPatrolRunPath,
  getPatrolTravelMode,
  resolvePatrolTravelMode,
  storePatrolTravelMode,
} from '@/lib/patrolTravelMode';
import { readStoredPatrolAvatar, storePatrolAvatar } from '@/lib/patrolAvatarConfig';
import { usePosicaoAproximada } from '@/hooks/usePosicaoAproximada';

// Preparar a saída, antes de ligar o GPS.
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
// E POR QUE VIROU TRÊS TELAS
//
// Ela nasceu com as duas decisões empilhadas numa rolagem só. As regras da
// trilha — a ordem, o que a missão pula, como o passo viaja na URL — moram em
// `patrolPickFlow.js`, com o porquê de cada uma. Aqui fica só a orquestração: o
// estado das escolhas, o rodapé de ação e o caminho de volta.

const obterStorage = () => {
  try { return window.localStorage; } catch { return null; }
};

const categoriaDaBusca = (search) => {
  try {
    const id = new URLSearchParams(search).get('categoria');
    return CATEGORIAS_SINAL.some((categoria) => categoria.id === id) ? id : null;
  } catch {
    return null;
  }
};

export default function PatrolPickPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const posicao = usePosicaoAproximada();

  // A aparência do boneco vive só no aparelho: é preferência de uso, não dado
  // de conta. Ela não entra na URL como as outras escolhas — não faria sentido
  // um link mandar alguém patrulhar de mochila tática.
  const [avatar, setAvatar] = useState(() => readStoredPatrolAvatar(obterStorage()));
  const [personalizando, setPersonalizando] = useState(false);

  const [modoDeslocamento, setModoDeslocamento] = useState(() =>
    resolvePatrolTravelMode(location.search, obterStorage())
  );
  const [categoriaSelecionada, setCategoriaSelecionada] = useState(() =>
    categoriaDaBusca(location.search)
  );

  // Só a PRIMEIRA URL decide se o passo do foco existe nesta visita. Depois
  // disso a própria tela escreve `?categoria=` ao avançar, e reavaliar a cada
  // navegação faria o passo desaparecer no meio do caminho.
  const [pularFoco, setPularFoco] = useState(
    () => Boolean(categoriaDaBusca(location.search)) && !patrolPickStepFromSearch(location.search)
  );

  const passos = useMemo(() => patrolPickStepIds(pularFoco), [pularFoco]);
  const passoAtual = useMemo(
    () => resolvePatrolPickStep(location.search, passos),
    [location.search, passos]
  );

  // Quantas entradas de histórico esta tela empilhou. Sem essa conta, "voltar"
  // no primeiro passo depois de uma recarga levaria para fora do app — e um
  // `replace` sempre deixaria o botão do aparelho abandonando a preparação
  // inteira em vez de andar um passo.
  const empilhados = useRef(0);

  const noite = useMemo(
    () => (posicao ? ehNoite(Date.now(), posicao.lat, posicao.lng) : null),
    [posicao]
  );

  const irParaPasso = useCallback(
    (passo, { substituir = false } = {}) => {
      const destino = buildPatrolPickStepPath({
        categoria: categoriaSelecionada,
        modo: modoDeslocamento,
        passo,
      });
      if (substituir) {
        navigate(destino, { replace: true });
        return;
      }
      empilhados.current += 1;
      navigate(destino);
    },
    [categoriaSelecionada, modoDeslocamento, navigate]
  );

  // A categoria noturna trazida por uma missão deixa de valer quando ainda é
  // dia por aqui. Limpar basta: quem devolve a pessoa ao passo do foco é a
  // guarda logo abaixo.
  useEffect(() => {
    if (noite !== false || !categoriaSelecionada) return;
    if (NAV_ALERTA.categoriasNoturnas.includes(categoriaSelecionada)) {
      setCategoriaSelecionada(null);
    }
  }, [categoriaSelecionada, noite]);

  // Sem foco não existem os passos seguintes: eles temperam ou confirmam uma
  // escolha que não foi feita. Acontece com URL montada à mão e, sobretudo,
  // quando a categoria da missão acaba de ser invalidada acima — e aí o passo
  // do foco, que a missão tinha pulado, precisa voltar a existir, senão sobra
  // uma tela sem saída.
  useEffect(() => {
    if (categoriaSelecionada || passoAtual === 'foco') return;
    setPularFoco(false);
    navigate(buildPatrolPickStepPath({ modo: modoDeslocamento, passo: 'foco' }), {
      replace: true,
    });
  }, [categoriaSelecionada, modoDeslocamento, navigate, passoAtual]);

  const escolherAvatar = useCallback((proximo) => {
    setAvatar(storePatrolAvatar(obterStorage(), proximo));
  }, []);

  const escolherModo = useCallback((modo) => {
    const salvo = storePatrolTravelMode(obterStorage(), modo);
    setModoDeslocamento(salvo);
  }, []);

  const modo = getPatrolTravelMode(modoDeslocamento);
  const categoriaAtiva = categoriaPorId(categoriaSelecionada);
  const passo = getPatrolPickStep(passoAtual);
  const proximo = patrolPickStepSibling(passos, passoAtual, 1);
  const anterior = patrolPickStepSibling(passos, passoAtual, -1);

  // No passo do foco, sem foco, não há para onde ir. Nos outros a escolha já
  // existe — o ritmo sempre tem um valor, nem que seja o padrão.
  const podeAvancar = passoAtual !== 'foco' || Boolean(categoriaSelecionada);

  const avancar = useCallback(() => {
    if (!podeAvancar) return;
    if (proximo) {
      irParaPasso(proximo);
      return;
    }
    if (!categoriaSelecionada) return;
    navigate(buildPatrolRunPath(categoriaSelecionada, modoDeslocamento));
  }, [categoriaSelecionada, irParaPasso, modoDeslocamento, navigate, podeAvancar, proximo]);

  const voltar = useCallback(() => {
    if (!anterior) return;
    if (empilhados.current > 0) {
      empilhados.current -= 1;
      navigate(-1);
      return;
    }
    irParaPasso(anterior, { substituir: true });
  }, [anterior, irParaPasso, navigate]);

  const ultimoPasso = !proximo;

  return (
    <div className="container max-w-2xl mx-auto w-full px-4 py-6 pb-40">
      <Helmet>
        <title>Sair em patrulha | Trombone Cidadão</title>
        <meta name="robots" content="noindex" />
      </Helmet>

      <PageHeader
        titulo="Sair em patrulha"
        subtitulo="Prepare sua saída e acompanhe a cidade em tempo real"
        paraOnde="/missoes"
      />

      <PatrolStepper passos={passos} atual={passoAtual} />

      {/* A personalização é folha, não passo — ver o comentário em
          `PatrolAvatarStudio`. Ela salva a cada toque: não há "cancelar" porque
          não há nada a confirmar, e sair da folha é o próprio "pronto". */}
      {personalizando && (
        <PatrolAvatarStudio
          modo={modoDeslocamento}
          avatar={avatar}
          onChange={escolherAvatar}
          onFechar={() => setPersonalizando(false)}
        />
      )}

      {passoAtual === 'foco' && (
        <PatrolFocusStep
          noite={noite}
          selecionada={categoriaSelecionada}
          onSelecionar={setCategoriaSelecionada}
        />
      )}

      {passoAtual === 'ritmo' && (
        <PatrolTravelModePicker
          value={modoDeslocamento}
          onChange={escolherModo}
          foco={categoriaAtiva}
          avatar={avatar}
          onPersonalizar={() => setPersonalizando(true)}
        />
      )}

      {passoAtual === 'pronto' && categoriaAtiva && (
        <PatrolReadyStep
          categoria={categoriaAtiva}
          modo={modo}
          avatar={avatar}
          onPersonalizar={() => setPersonalizando(true)}
          onEditarFoco={pularFoco ? null : () => irParaPasso('foco')}
          onEditarRitmo={() => irParaPasso('ritmo')}
        />
      )}

      {/* Barra própria do pré-voo: fica sempre ao alcance do polegar, mesmo com
          a lista longa. O padding da página acima reserva o espaço dela para o
          último cartão nunca ficar escondido atrás do vidro.

          Ela é a ÚNICA superfície de ação dos três passos — nenhum passo tem
          botão próprio de avançar. Assim o polegar aprende um lugar só, e o
          rótulo ("Continuar", "Iniciar") é o que muda. */}
      <div
        className="pointer-events-none fixed inset-x-0 bottom-0 z-[1000] px-3 pt-3"
        style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 12px)' }}
      >
        <div className="pointer-events-auto mx-auto flex max-w-2xl items-center gap-2.5 rounded-2xl bg-surface-overlay/95 p-2.5 shadow-elevation-3 ring-1 ring-edge-subtle/70 backdrop-blur-xl">
          {anterior ? (
            <button
              type="button"
              onClick={voltar}
              aria-label={`Voltar para ${getPatrolPickStep(anterior).label.toLowerCase()}`}
              className="shrink-0 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-surface-subtle text-content-secondary transition-[background-color,transform] active:scale-[0.98] active:bg-surface-subtleHover"
            >
              <ArrowLeft size={20} strokeWidth={2.6} />
            </button>
          ) : (
            <span className={`patrol-mode-option-icon patrol-mode-option-icon--${modo.id} is-active shrink-0`}>
              <PatrolTravelModeIcon mode={modo.id} size={22} strokeWidth={2.5} />
            </span>
          )}

          <div className="min-w-0 flex-1" aria-live="polite">
            <p className="truncate text-[10px] font-bold uppercase tracking-wider text-brand">
              {modo.label}
            </p>
            <p className="truncate text-sm font-extrabold leading-tight text-content-primary">
              {categoriaAtiva?.name || 'Escolha um foco'}
            </p>
          </div>

          <button
            type="button"
            onClick={avancar}
            disabled={!podeAvancar}
            aria-label={
              !podeAvancar
                ? 'Escolha o foco da patrulha antes de continuar'
                : proximo
                ? `Continuar para ${getPatrolPickStep(proximo).label.toLowerCase()}`
                : `Iniciar ${modo.activeLabel.toLowerCase()} de ${categoriaAtiva?.name.toLowerCase() || 'patrulha'}`
            }
            className="inline-flex h-12 min-w-[124px] shrink-0 items-center justify-center gap-2 rounded-xl bg-brand px-4 text-sm font-extrabold text-content-onBrand shadow-elevation-1 transition-[background-color,transform,opacity] active:scale-[0.98] active:bg-brand-hover disabled:cursor-not-allowed disabled:bg-surface-subtle disabled:text-content-tertiary disabled:shadow-none"
          >
            {ultimoPasso && <Flag size={17} strokeWidth={2.6} />}
            {passo.avancar}
            {!ultimoPasso && <ArrowRight size={18} strokeWidth={2.6} />}
          </button>
        </div>
      </div>
    </div>
  );
}

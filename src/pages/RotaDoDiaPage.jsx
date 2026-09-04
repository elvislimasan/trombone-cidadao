import { Suspense, lazy, useCallback, useEffect, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import { Helmet } from "react-helmet";
import { Link, useSearchParams } from "react-router-dom";
import { Footprints, List, Loader2, LocateFixed, Map as MapIcon, X } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import ParadaCard from "@/components/rota/ParadaCard";
import { useAuth } from "@/contexts/SupabaseAuthContext";
import { useCity } from "@/contexts/CityContext";
import { useUserLocation } from "@/hooks/useUserLocation";
import { useNavigationGps } from "@/hooks/useNavigationGps";
import { usePatrolAvatar } from "@/hooks/usePatrolAvatar";
import { useRotaDoDia } from "@/hooks/useRotaDoDia";
import { useRuasDaCidade } from "@/hooks/useRuasDaCidade";
import { enviarAtualizacaoDeBronca } from "@/hooks/useReportUpdate";
import { estaPertoDaParada, minutosEstimados, PILOTO } from "@/lib/rotaDoDia";
import { rotuloDoTracado, tracarRota } from "@/lib/rotaTracada";
import { showAppError } from "@/lib/appError";
import { categoriaPorId } from "@/lib/reportCategories";

const RotaMapa = lazy(() => import("@/components/rota/RotaMapa"));

// A Rota do Dia — piloto a pé.
//
// É a resposta para "o que eu faço agora?", que era a pergunta que o app não
// respondia: as missões permanentes são de longo prazo, as diárias dizem quanto
// e não onde, e sair em patrulha exige decidir o trajeto sozinho.
//
// A TELA NÃO É O MODO PATRULHA — MESMO COM MAPA
//
// A vista de mapa (`?vista=mapa`) mostra o percurso numerado e segue a posição,
// e é tela cheia como a patrulha. O que ela NÃO herda é o resto: sem alerta por
// voz, sem pontuação por deslocamento, sem carro. O modo patrulha continua
// existindo para quem quer sair sem destino — e continua aceitando carro, que é
// justamente o que esta rota não faz.
//
// A LISTA CONTINUA SENDO A TELA PRINCIPAL, E ISSO É DELIBERADO
//
// Quem caminha responde olhando a rua, não o aparelho. O mapa responde "para
// que lado?", que a lista não respondia; a partir daí a pessoa guarda o celular
// e anda. Por isso as duas vistas são a MESMA rota, com o mesmo progresso: o
// mapa é um jeito de olhar, não uma sessão separada que zera o que já foi feito.
//
// POR QUE `?vista=mapa` EM VEZ DE OUTRA ROTA
//
// Rota nova remontaria o componente, e com ele o percurso e o progresso — quem
// abrisse o mapa depois de responder duas paradas voltaria para uma rota
// diferente. Query string mantém o estado e ainda dá o botão voltar do aparelho
// de graça: sair do mapa cai na lista, não fora da rota.
//
// POR QUE A ROTA É MONTADA NA ÂNCORA, E NÃO NA POSIÇÃO AO VIVO
//
// No mapa o GPS é contínuo. Se `useRotaDoDia` recebesse cada leitura, a rota
// seria remontada a cada segundo — outras paradas, outra ordem, outros números
// nos pinos, enquanto a pessoa anda. A âncora é a leitura que montou a rota; a
// posição ao vivo serve para desenhar onde a pessoa está e para saber se ela
// parou (princípio 8).
//
// POR QUE A RECUSA É SEMPRE EXPLICADA
//
// À noite, sem GPS, ou sem pontos que valham a caminhada, a tela diz o motivo em
// vez de sumir com o botão. Um botão que desaparece ensina que o app é
// instável; um aviso ensina como ele funciona — e "hoje não há o que percorrer
// por aqui" é uma boa notícia sobre o bairro, não uma falha.

const RotaDoDiaPage = () => {
  const { user } = useAuth();
  const { activeCityId } = useCity();
  const [searchParams, setSearchParams] = useSearchParams();
  const vistaMapa = searchParams.get("vista") === "mapa";
  const categoriaDaCampanha = categoriaPorId(searchParams.get("categoria"));
  const categoriaId = categoriaDaCampanha?.id || null;
  const avatar = usePatrolAvatar();

  const { coords, status, request } = useUserLocation();

  useEffect(() => {
    if (status === "idle") request();
  }, [status, request]);

  // A leitura que monta a rota. Ela não muda enquanto a pessoa caminha — ver o
  // cabeçalho.
  const ancora = useMemo(
    () => (coords ? { lat: coords.lat, lng: coords.lng, speed: coords.speed } : null),
    // `coords` só ganha identidade nova quando chega uma leitura nova — o hook
    // é de disparo único e reaproveita o fix recente.
    [coords]
  );

  // GPS contínuo só na vista de mapa: ele mantém a tela acesa e consome
  // bateria, e a lista não tem o que fazer com uma leitura por segundo.
  const { posicao: aoVivo } = useNavigationGps({ ativo: vistaMapa });
  const posicao = vistaMapa && aoVivo ? aoVivo : ancora;

  const {
    permissao,
    carregando,
    erro,
    rota,
    estado,
    enviando,
    concluidas,
    puladas,
    registrarContribuicao,
    pular,
  } = useRotaDoDia(ancora, { categoriaId });

  // As ruas só são buscadas quando há mapa para desenhar. Fora dele, `null`
  // desliga o hook — a lista não paga por alguns milhares de coordenadas.
  const { linhas } = useRuasDaCidade(vistaMapa ? activeCityId : null);

  const percurso = useMemo(
    () => tracarRota({ posicao: ancora, paradas: rota.paradas, linhas }),
    [ancora, rota.paradas, linhas]
  );

  // O mapa não persegue a posição sozinho: quem arrasta para olhar a esquina
  // seguinte perderia o enquadramento no segundo seguinte, e o recentrar
  // automático é a queixa clássica de todo mapa de navegação a pé. O botão
  // devolve o controle sem tirá-lo.
  const mapaRef = useRef(null);

  const recentrar = useCallback(() => {
    if (mapaRef.current && posicao) {
      mapaRef.current.setView([posicao.lat, posicao.lng], Math.max(mapaRef.current.getZoom(), 17));
    }
  }, [posicao]);

  const abrirMapa = useCallback(() => {
    const proximo = new URLSearchParams(searchParams);
    proximo.set("vista", "mapa");
    setSearchParams(proximo);
  }, [searchParams, setSearchParams]);

  const fecharMapa = useCallback(() => {
    const proximo = new URLSearchParams(searchParams);
    proximo.delete("vista");
    setSearchParams(proximo);
  }, [searchParams, setSearchParams]);

  // A vista ocupa o viewport de verdade. Além de evitar a rolagem da página
  // que está por baixo, isso impede que o gesto de zoom revele header, banners
  // ou conteúdo da lista nas bordas do mapa.
  useEffect(() => {
    if (!vistaMapa) return undefined;

    const overflowHtml = document.documentElement.style.overflow;
    const overflowBody = document.body.style.overflow;
    const overscrollBody = document.body.style.overscrollBehavior;
    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    document.body.style.overscrollBehavior = "none";

    return () => {
      document.documentElement.style.overflow = overflowHtml;
      document.body.style.overflow = overflowBody;
      document.body.style.overscrollBehavior = overscrollBody;
    };
  }, [vistaMapa]);

  const responder = async ({ parada, updateType }) => {
    if (!estaPertoDaParada(posicao, parada)) {
      showAppError({
        title: "Aproxime-se da parada",
        description: `As respostas são liberadas a até ${PILOTO.RAIO_RESPOSTA_M} m do ponto.`,
      });
      return false;
    }

    const r = await enviarAtualizacaoDeBronca({
      report: parada.report ?? parada,
      updateType,
      user,
    });

    if (!r.ok) {
      showAppError({
        title: r.isRateLimit
          ? "Você já respondeu esta bronca esta semana"
          : "Não foi possível registrar",
        description: r.isRateLimit
          ? "Pule a parada ou responda outra coisa sobre ela."
          : r.error?.message,
        variant: "destructive",
      });
      return false;
    }

    registrarContribuicao(parada.id);
    return true;
  };

  const cartaoDaParada = (parada, { perguntaAberta = false } = {}) => (
    <ParadaCard
      key={parada.id}
      parada={parada}
      ativa={estado.proxima?.id === parada.id}
      concluida={concluidas.includes(String(parada.id))}
      pulada={puladas.includes(String(parada.id))}
      posicao={posicao}
      pulosRestantes={estado.pulosRestantes}
      podePular={estado.podePular}
      enviando={enviando}
      onResponder={responder}
      onPular={pular}
      perguntaAberta={perguntaAberta}
    />
  );

  const montando = status === "prompting" || (carregando && permissao.ok);

  const conteudo = () => {
    if (montando) {
      return (
        <div className="flex items-center gap-2 text-xs text-content-tertiary py-8 justify-center text-center">
          <Loader2 className="w-4 h-4 animate-spin shrink-0" />
          <span className="min-w-0">Montando o percurso a partir de onde você está…</span>
        </div>
      );
    }

    if (!permissao.ok) {
      return (
        <div className="bg-surface-raised border border-edge-subtle rounded-2xl px-4 py-5">
          <p className="text-xs text-content-secondary leading-relaxed">
            {permissao.texto}
          </p>
          {permissao.motivo === "sem_posicao" && status !== "denied" && (
            <button
              type="button"
              onClick={request}
              className="mt-3 text-2xs font-bold text-content-onBrand bg-brand px-3 py-1.5 rounded-full"
            >
              Permitir localização
            </button>
          )}
        </div>
      );
    }

    if (erro) {
      return (
        <p className="text-xs text-content-tertiary py-8 text-center">
          Não conseguimos carregar os pontos por perto agora. Tente de novo em
          instantes.
        </p>
      );
    }

    if (!rota.suficiente) {
      return (
        <div className="bg-surface-raised border border-edge-subtle rounded-2xl px-4 py-5">
          <p className="text-[13px] font-bold text-content-primary">
            Hoje não há o que percorrer por aqui.
          </p>
          <p className="text-xs text-content-secondary mt-1 leading-relaxed">
            Não achamos pelo menos {PILOTO.PARADAS_MIN} pontos a pé
            {categoriaDaCampanha ? ` de ${categoriaDaCampanha.name.toLowerCase()}` : ""} que precisem de notícia nova.
            Isso é uma boa notícia sobre o seu bairro — o que está por perto já foi conferido recentemente.
          </p>
          <Link
            to="/missoes"
            className="inline-block mt-3 text-2xs font-bold text-brand underline underline-offset-2"
          >
            Ver outras formas de contribuir
          </Link>
        </div>
      );
    }

    return (
      <>
        <div className="bg-surface-raised border border-edge-subtle rounded-2xl px-4 py-3">
          {/* `flex-wrap` + `min-w-0`: com a fonte do sistema ampliada, os dois
              blocos não cabem na mesma linha em tela de 360 px, e sem quebra
              eles empurravam o cartão para fora da largura da tela. */}
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
            <div className="flex items-center gap-2 min-w-0">
              <Footprints className="w-4 h-4 text-brand shrink-0" />
              <span className="text-xs font-bold text-content-primary break-words min-w-0">
                {rota.paradas.length} paradas ·{" "}
                {(rota.metros / 1000).toFixed(1).replace(".", ",")} km
              </span>
            </div>
            <span className="text-2xs text-content-tertiary shrink-0">
              ~{minutosEstimados({ metros: rota.metros, paradas: rota.paradas.length })} min
            </span>
          </div>
          <p className="text-2xs text-content-tertiary mt-1.5 leading-relaxed">
            A ordem sai do que produz mais informação por caminhada — não do
            ponto mais perto. Uma parada só fecha com resposta sua.
          </p>

          <button
            type="button"
            onClick={abrirMapa}
            className="mt-3 w-full flex items-center justify-center gap-2 text-xs font-bold text-content-onBrand bg-brand px-4 py-2.5 rounded-full"
          >
            <MapIcon className="w-4 h-4 shrink-0" />
            Ver o percurso no mapa
          </button>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-1">
          <span className="text-2xs font-bold text-content-secondary min-w-0">
            {estado.rotulo} respondidas
          </span>
          <span className="text-2xs text-content-tertiary min-w-0">
            {estado.pulosRestantes} de {PILOTO.PULOS_MAX} pulos restantes
          </span>
        </div>

        <ul className="grid grid-cols-1 gap-2 lg:grid-cols-2">{rota.paradas.map(cartaoDaParada)}</ul>

        {estado.concluida && (
          <div className="bg-status-resolvedBg rounded-2xl px-4 py-4">
            <p className="text-[13px] font-bold text-status-resolvedFg">
              Rota concluída.
            </p>
            <p className="text-xs text-status-resolvedFg/90 mt-1 leading-relaxed">
              {estado.feitas} {estado.feitas === 1 ? "ponto recebeu" : "pontos receberam"}{" "}
              notícia nova por sua causa. Isso é o que mantém o mapa parecido com
              a rua.
            </p>
          </div>
        )}
      </>
    );
  };

  // ── A vista de mapa ──────────────────────────────────────────────────────
  //
  // Só existe com rota montada. Sem paradas não há percurso para desenhar, e um
  // mapa vazio em tela cheia seria pior que a lista, que ao menos explica o
  // motivo — por isso a vista se desfaz sozinha quando a rota não existe.
  //
  // A desistência espera o carregamento terminar: enquanto o GPS responde e os
  // pontos chegam, `rota.suficiente` é falso por ainda não saber, e devolver a
  // pessoa para a lista nesse instante seria fechar o mapa que ela acabou de
  // abrir.
  useEffect(() => {
    if (vistaMapa && !montando && !rota.suficiente) fecharMapa();
  }, [vistaMapa, montando, rota.suficiente, fecharMapa]);

  if (vistaMapa && montando) {
    return createPortal(
      <div className="fixed inset-0 z-[1100] h-[100dvh] w-screen bg-surface-base flex flex-col items-center justify-center gap-3 px-6 text-center">
        <Loader2 className="w-5 h-5 animate-spin text-content-tertiary" />
        <p className="text-xs text-content-tertiary">
          Montando o percurso a partir de onde você está…
        </p>
      </div>,
      document.body
    );
  }

  if (vistaMapa && rota.suficiente) {
    const ativa = estado.proxima;
    const pertoDaAtiva = Boolean(ativa && estaPertoDaParada(posicao, ativa));

    return createPortal(
      <>
        <Helmet>
          <title>Rota do Dia no mapa — Trombone Cidadão</title>
          <meta name="robots" content="noindex" />
        </Helmet>

        <div className="fixed inset-0 z-[1100] isolate h-[100dvh] w-screen bg-surface-base flex flex-col overflow-hidden overscroll-none">
          <div className="absolute inset-0 z-0 overflow-hidden bg-surface-sunken">
            <Suspense
              fallback={
                <div className="w-full h-full flex items-center justify-center">
                  <Loader2 className="w-5 h-5 animate-spin text-content-tertiary" />
                </div>
              }
            >
              <RotaMapa
                trechos={percurso.trechos}
                paradas={rota.paradas}
                posicao={posicao}
                ativaId={ativa?.id}
                concluidas={concluidas}
                puladas={puladas}
                avatar={avatar}
                mapaRef={mapaRef}
              />
            </Suspense>
          </div>

          {/* Cabeçalho flutuante. `pointer-events-none` no invólucro para o mapa
              continuar arrastável sob as bordas dele; só os controles pegam o
              toque. */}
          <div
            className="relative z-20 px-3 pointer-events-none"
            style={{ paddingTop: "calc(0.75rem + env(safe-area-inset-top, 0px))" }}
          >
            <div className="flex items-start gap-2">
              <button
                type="button"
                onClick={fecharMapa}
                className="pointer-events-auto shrink-0 flex items-center gap-1.5 bg-surface-raised/95 backdrop-blur border border-edge-subtle rounded-full pl-2.5 pr-3 py-2 shadow-sm"
              >
                <X className="w-4 h-4 text-content-secondary shrink-0" />
                <span className="text-2xs font-bold text-content-primary">Lista</span>
              </button>

              <div className="pointer-events-auto min-w-0 flex-1 bg-surface-raised/95 backdrop-blur border border-edge-subtle rounded-2xl px-3 py-2 shadow-sm">
                <p className="text-2xs font-bold text-content-primary break-words">
                  {estado.rotulo} respondidas ·{" "}
                  {(percurso.metros / 1000).toFixed(1).replace(".", ",")} km
                </p>
                <p className="text-2xs text-content-tertiary leading-snug break-words">
                  {categoriaDaCampanha
                    ? `Campanha: ${categoriaDaCampanha.name}`
                    : rotuloDoTracado(percurso.tracado)}
                </p>
              </div>
            </div>
          </div>

          <div
            className="pointer-events-none absolute right-3 z-20"
            style={{ top: "calc(5rem + env(safe-area-inset-top, 0px))" }}
          >
            {posicao && (
              <button
                type="button"
                onClick={recentrar}
                aria-label="Centralizar em mim"
                className="pointer-events-auto w-11 h-11 rounded-full bg-surface-raised/95 backdrop-blur border border-edge-subtle shadow-sm flex items-center justify-center"
              >
                <LocateFixed className="w-5 h-5 text-content-secondary" />
              </button>
            )}
          </div>

          {/* Longe da parada, só um cartão flutuante compacto. A folha com as
              respostas nasce apenas dentro do raio de observação. */}
          <div
            className={`absolute z-20 overflow-y-auto overscroll-contain ${
              pertoDaAtiva || estado.concluida
                ? "inset-x-0 bottom-0 max-h-[38dvh] border-t border-edge-subtle bg-surface-base px-3 pt-2 shadow-[0_-12px_28px_rgba(0,0,0,0.16)]"
                : "bottom-3 left-3 right-3 rounded-2xl bg-transparent"
            }`}
            style={pertoDaAtiva || estado.concluida
              ? { paddingBottom: "calc(0.5rem + env(safe-area-inset-bottom, 0px))" }
              : { bottom: "calc(0.75rem + env(safe-area-inset-bottom, 0px))" }}
          >
            {estado.concluida ? (
              <div className="bg-status-resolvedBg rounded-2xl px-4 py-3">
                <p className="text-[13px] font-bold text-status-resolvedFg">
                  Rota concluída.
                </p>
                <button
                  type="button"
                  onClick={fecharMapa}
                  className="mt-2 text-2xs font-bold text-brand underline underline-offset-2"
                >
                  Voltar para a lista
                </button>
              </div>
            ) : ativa ? (
              <ul>{cartaoDaParada(ativa, { perguntaAberta: true })}</ul>
            ) : (
              <p className="text-2xs text-content-tertiary py-3 text-center">
                Nenhuma parada pendente.
              </p>
            )}

            {(pertoDaAtiva || estado.concluida) && (
              <button
                type="button"
                onClick={fecharMapa}
                className="mt-1 flex w-full items-center justify-center gap-2 py-1.5 text-2xs font-semibold text-content-tertiary"
              >
                <List className="w-3.5 h-3.5 shrink-0" />
                Ver todas as {rota.paradas.length} paradas
              </button>
            )}
          </div>
        </div>
      </>,
      document.body
    );
  }

  return (
    <>
      <Helmet>
        <title>Rota do Dia — Trombone Cidadão</title>
        <meta
          name="description"
          content="Um percurso curto a pé pelos pontos da sua região que precisam de notícia nova."
        />
      </Helmet>

      <div className="mx-auto w-full max-w-2xl overflow-x-hidden px-4 pt-4 pb-24 lg:max-w-6xl lg:px-8 lg:pt-8 lg:pb-12">
        <PageHeader
          titulo={categoriaDaCampanha ? `Rota: ${categoriaDaCampanha.name}` : "Rota do Dia"}
          subtitulo={categoriaDaCampanha
            ? `Campanha focada somente em ocorrências de ${categoriaDaCampanha.name.toLowerCase()}`
            : "Um percurso curto a pé pelo que precisa de notícia nova"}
          paraOnde="/missoes"
        />
        <div className="space-y-3">{conteudo()}</div>
      </div>
    </>
  );
};

export default RotaDoDiaPage;

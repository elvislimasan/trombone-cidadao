import { useEffect } from "react";
import { Helmet } from "react-helmet";
import { Link } from "react-router-dom";
import { Footprints, Loader2 } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import ParadaCard from "@/components/rota/ParadaCard";
import { useAuth } from "@/contexts/SupabaseAuthContext";
import { useUserLocation } from "@/hooks/useUserLocation";
import { useRotaDoDia } from "@/hooks/useRotaDoDia";
import { enviarAtualizacaoDeBronca } from "@/hooks/useReportUpdate";
import { minutosEstimados, PILOTO } from "@/lib/rotaDoDia";
import { showAppError } from "@/lib/appError";

// A Rota do Dia — piloto a pé.
//
// É a resposta para "o que eu faço agora?", que era a pergunta que o app não
// respondia: as missões permanentes são de longo prazo, as diárias dizem quanto
// e não onde, e sair em patrulha exige decidir o trajeto sozinho.
//
// A TELA NÃO É O MODO PATRULHA
//
// Nada de tela cheia, GPS contínuo e alerta por voz. Esta é uma tela de
// PERCURSO: lista o que fazer, na ordem, e a pessoa caminha olhando a rua. O
// modo patrulha continua existindo para quem quer sair sem destino — e continua
// aceitando carro, que é justamente o que esta rota não faz.
//
// POR QUE A RECUSA É SEMPRE EXPLICADA
//
// À noite, sem GPS, ou sem pontos que valham a caminhada, a tela diz o motivo em
// vez de sumir com o botão. Um botão que desaparece ensina que o app é
// instável; um aviso ensina como ele funciona — e "hoje não há o que percorrer
// por aqui" é uma boa notícia sobre o bairro, não uma falha.

const RotaDoDiaPage = () => {
  const { user } = useAuth();
  const { coords, status, request } = useUserLocation();

  useEffect(() => {
    if (status === "idle") request();
  }, [status, request]);

  const posicao = coords ? { lat: coords.lat, lng: coords.lng, speed: coords.speed } : null;
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
  } = useRotaDoDia(posicao);

  const responder = async ({ parada, updateType }) => {
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

  const conteudo = () => {
    if (status === "prompting" || (carregando && permissao.ok)) {
      return (
        <div className="flex items-center gap-2 text-xs text-content-tertiary py-8 justify-center">
          <Loader2 className="w-4 h-4 animate-spin" />
          Montando o percurso a partir de onde você está…
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
            Não achamos pelo menos {PILOTO.PARADAS_MIN} pontos a pé que precisem
            de notícia nova. Isso é uma boa notícia sobre o seu bairro — o que
            está por perto já foi conferido recentemente.
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
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Footprints className="w-4 h-4 text-brand" />
              <span className="text-xs font-bold text-content-primary">
                {rota.paradas.length} paradas · {(rota.metros / 1000).toFixed(1).replace(".", ",")} km
              </span>
            </div>
            <span className="text-2xs text-content-tertiary">
              ~{minutosEstimados({ metros: rota.metros, paradas: rota.paradas.length })} min
            </span>
          </div>
          <p className="text-2xs text-content-tertiary mt-1.5 leading-relaxed">
            A ordem sai do que produz mais informação por caminhada — não do
            ponto mais perto. Uma parada só fecha com resposta sua.
          </p>
        </div>

        <div className="flex items-center justify-between gap-3 px-1">
          <span className="text-2xs font-bold text-content-secondary">
            {estado.rotulo} respondidas
          </span>
          <span className="text-2xs text-content-tertiary">
            {estado.pulosRestantes} de {PILOTO.PULOS_MAX} pulos restantes
          </span>
        </div>

        <ul className="space-y-2">
          {rota.paradas.map((parada) => (
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
            />
          ))}
        </ul>

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

  return (
    <>
      <Helmet>
        <title>Rota do Dia — Trombone Cidadão</title>
        <meta
          name="description"
          content="Um percurso curto a pé pelos pontos da sua região que precisam de notícia nova."
        />
      </Helmet>

      <div className="max-w-2xl mx-auto px-4 pt-4 pb-24">
        <PageHeader
          titulo="Rota do Dia"
          subtitulo="Um percurso curto a pé pelo que precisa de notícia nova"
          paraOnde="/missoes"
        />
        <div className="space-y-3">{conteudo()}</div>
      </div>
    </>
  );
};

export default RotaDoDiaPage;

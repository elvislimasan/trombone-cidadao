import { useMemo, useState } from 'react';
import { Helmet } from 'react-helmet';
import { CheckCircle2, Loader2, MapPin, Plus, Radio, Share2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import CitySelector from '@/components/CitySelector';
import { CityViewProvider, useCityView } from '@/contexts/CityContext';
import CityEventCard, { CityEventHighlightCard, CityEventUpcomingCard } from '@/components/agora/CityEventCard';
import CityEventForm from '@/components/agora/CityEventForm';
import FollowAreaButton from '@/components/agora/FollowAreaButton';
import {
  useCanManageCityEvents,
  useCityEventActions,
  useCityEvents,
  useSweepCityEvents,
} from '@/hooks/useCityEvents';
import { FILTROS } from '@/lib/cityEvents';
import { compartilharLink } from '@/lib/shareLink';
import { getBaseAppUrl } from '@/lib/shareUtils';

// Trombone Agora — a central de acontecimentos da cidade.
//
// AS DUAS LISTAS RESPONDEM PERGUNTAS DIFERENTES
//
// "Acontecendo agora" responde "o que me atrapalha hoje". "Resolvidos
// recentemente" responde "isto aqui funciona" — e é a única parte do Agora que
// pertence ao Trombone Impacto: uma cidade que só mostra problema abertos
// parece uma cidade que não conserta nada.
//
// Os eventos PROGRAMADOS saem numa terceira seção, e não junto dos ativos. Uma
// feira que começa às 19h no meio de uma lista de faltas d'água em andamento
// faria a lista deixar de responder "o que está acontecendo agora".

const Secao = ({ titulo, acao, children }) => (
  <section className="mt-6">
    <div className="mb-2 flex items-center justify-between gap-2 px-1">
      <h2 className="text-base font-extrabold text-content-primary">{titulo}</h2>
      {acao}
    </div>
    <div className="overflow-hidden rounded-3xl border border-edge-subtle bg-surface-raised shadow-elevation-1 divide-y divide-edge-subtle">
      {children}
    </div>
  </section>
);

function AgoraPage() {
  const { cityId, cityName, loadingCities } = useCityView();
  const [filtro, setFiltro] = useState('todos');
  const [criando, setCriando] = useState(false);

  const { podeGerir, papel, bairrosDesignados, restritoABairros } = useCanManageCityEvents(cityId);

  const abertos = useCityEvents(cityId, { filtro, escopo: 'abertos' });
  const resolvidos = useCityEvents(cityId, { filtro, escopo: 'resolvidos', limite: 8 });

  // A varredura da previsão só é disparada por quem pode agir sobre ela. Um
  // visitante rodando a varredura acordaria gestores sem ter como ajudar.
  useSweepCityEvents(podeGerir && Boolean(cityId));

  const acoes = useCityEventActions({
    aoConcluir: async () => {
      setCriando(false);
      await Promise.all([abertos.recarregar(), resolvidos.recarregar()]);
    },
  });

  const { emAndamento, programados } = useMemo(() => {
    const lista = abertos.eventos || [];
    return {
      emAndamento: lista.filter((e) => e.status !== 'scheduled'),
      programados: lista.filter((e) => e.status === 'scheduled'),
    };
  }, [abertos.eventos]);

  const agora = new Date();

  if (criando) {
    return (
      <div className="min-h-screen bg-surface-base pb-16">
        <Helmet><title>Nova ocorrência | Trombone Cidadão</title></Helmet>
        <div className="mx-auto max-w-2xl px-4 py-6">
          <CityEventForm
            cityId={cityId}
            cityName={cityName}
            papel={papel}
            bairrosDesignados={bairrosDesignados}
            restritoABairros={restritoABairros}
            salvando={acoes.salvando}
            aoSalvar={(dados) => acoes.criar(dados)}
            aoCancelar={() => setCriando(false)}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface-base pb-16">
      <Helmet>
        <title>Radar da cidade | Trombone Cidadão</title>
        <meta name="description" content={`Acompanhe o que está acontecendo agora em ${cityName || 'sua cidade'}: falta d'água, energia, interdições, obras e eventos.`} />
      </Helmet>

      <div className="mx-auto max-w-2xl px-4 py-5">
        <header className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-2xl font-extrabold text-content-primary sm:text-3xl">Radar da cidade</h1>
            <p className="mt-0.5 text-sm text-content-secondary">Acompanhe o que está acontecendo</p>
          </div>

          <div className="flex shrink-0 items-center gap-1">
            <CitySelector />
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 rounded-full"
              aria-label="Compartilhar"
              onClick={() => compartilharLink({
                title: `Radar da cidade em ${cityName || 'nossa cidade'}`,
                text: 'Veja o que está acontecendo agora na cidade.',
                url: `${getBaseAppUrl()}/agora`,
              })}
            >
              <Share2 className="h-4 w-4" />
            </Button>
          </div>
        </header>

        {/* Acompanhar a cidade inteira mora aqui e não na página da rua: é a
            assinatura mais ampla, e quem chega ao Agora está justamente
            perguntando "o que acontece por aqui". */}
        {cityId && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <FollowAreaButton areaType="city" cityId={cityId} nome={cityName} tamanho="sm" />
            {podeGerir && (
              <Button size="sm" className="gap-1.5 rounded-full" onClick={() => setCriando(true)}>
                <Plus className="h-4 w-4" /> Nova ocorrência
              </Button>
            )}
          </div>
        )}

        {/* SEM CIDADE ESCOLHIDA, A TELA PRECISA DIZER ISSO
            "Todas as cidades" é uma escolha válida no resto do app (o feed
            mostra broncas de todo lugar), mas um acontecimento SEMPRE pertence
            a uma cidade: não existe "falta d'água no Brasil". Sem este bloco a
            página mostrava "Nada acontecendo agora" — que é uma afirmação
            falsa — e escondia o botão de publicar, porque ele depende de saber
            em qual cidade a ocorrência entraria. */}
        {!cityId && !loadingCities && (
          <div className="mt-8 rounded-3xl border border-dashed border-edge-default px-6 py-10 text-center">
            <MapPin className="mx-auto h-8 w-8 text-content-tertiary" aria-hidden="true" />
            <p className="mt-2 text-base font-bold text-content-primary">Escolha uma cidade</p>
            <p className="mx-auto mt-1 max-w-sm text-sm text-content-tertiary">
              O Radar da cidade mostra o que está acontecendo em uma cidade por vez. Use o seletor acima
              para escolher qual.
            </p>
          </div>
        )}

        {/* Filtro sem lista para filtrar é um controle que não faz nada. */}
        {cityId && (
          <div className="mt-4 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {FILTROS.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setFiltro(f.id)}
                className={`shrink-0 rounded-full border px-4 py-1.5 text-sm font-bold transition-colors ${
                  filtro === f.id
                    ? 'border-brand bg-brand text-content-onBrand'
                    : 'border-edge-subtle bg-surface-raised text-content-secondary hover:bg-surface-subtle'
                }`}
              >
                {f.rotulo}
              </button>
            ))}
          </div>
        )}

        {cityId && abertos.indisponivel && (
          <p className="mt-6 rounded-2xl border border-edge-subtle bg-surface-subtle px-4 py-6 text-center text-sm text-content-tertiary">
            O Radar da cidade ainda não está ativo nesta instalação.
          </p>
        )}

        {cityId && !abertos.indisponivel && (
          <>
            {/* O primeiro alerta sai em destaque e os outros na lista compacta.
                Com um só, a seção "outros" não existe — e "Alerta em destaque"
                continua sendo a legenda certa para ele. */}
            {abertos.carregando ? (
              <Secao titulo="Acontecendo agora">
                <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-brand" /></div>
              </Secao>
            ) : emAndamento.length === 0 ? (
              <Secao titulo="Acontecendo agora">
                <div className="px-5 py-10 text-center">
                  <Radio className="mx-auto h-8 w-8 text-content-tertiary" aria-hidden="true" />
                  <p className="mt-2 text-sm font-bold text-content-primary">Nada acontecendo agora</p>
                  <p className="mt-0.5 text-sm text-content-tertiary">
                    Sem alertas ativos {cityName ? `em ${cityName}` : 'na sua cidade'}.
                  </p>
                </div>
              </Secao>
            ) : (
              <>
                <section className="mt-6">
                  <h2 className="mb-2 px-1 text-xs font-extrabold uppercase tracking-widest text-danger">
                    Alerta em destaque
                  </h2>
                  <CityEventHighlightCard evento={emAndamento[0]} agora={agora} />
                </section>

                {emAndamento.length > 1 && (
                  <Secao titulo="Outros alertas ativos">
                    {emAndamento.slice(1).map((e) => (
                      <CityEventCard key={e.id} evento={e} agora={agora} />
                    ))}
                  </Secao>
                )}
              </>
            )}

            {programados.length > 0 && (
              <Secao titulo="Eventos próximos">
                {programados.map((e) => <CityEventUpcomingCard key={e.id} evento={e} agora={agora} />)}
              </Secao>
            )}

            {resolvidos.eventos.length > 0 && (
              <Secao
                titulo="Resolvidos recentemente"
                acao={
                  <span className="inline-flex items-center gap-1 text-xs font-bold text-status-resolvedFg">
                    <CheckCircle2 className="h-3.5 w-3.5" /> {resolvidos.eventos.length}
                  </span>
                }
              >
                {resolvidos.eventos.map((e) => (
                  <CityEventCard key={e.id} evento={e} agora={agora} resolvido />
                ))}
              </Secao>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// O filtro de cidade desta tela é local: explorar o Agora de outra cidade não
// muda o feed nem a cidade do cabeçalho, e não persiste ao sair. Mesma escolha
// de PublicWorksPage e PavementMapPage.
export default function AgoraPageWithCityView() {
  return (
    <CityViewProvider>
      <AgoraPage />
    </CityViewProvider>
  );
}

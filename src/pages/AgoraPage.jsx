import { useMemo, useState } from 'react';
import { Helmet } from 'react-helmet';
import { CalendarDays, CheckCircle2, Loader2, MapPin, Plus, Radio, Share2 } from 'lucide-react';

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
import { useRevelarAoRolar } from '@/components/home/animacoes';

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

const Secao = ({ titulo, descricao, acao, children, className = '' }) => (
  <section className={`mt-6 ${className}`}>
    <div className="mb-3 flex items-end justify-between gap-3 px-1">
      <div className="min-w-0">
        <h2 className="text-base font-extrabold text-content-primary lg:text-lg">{titulo}</h2>
        {descricao && <p className="mt-0.5 text-sm text-content-secondary">{descricao}</p>}
      </div>
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
  const resumo = [
    { valor: abertos.carregando ? '—' : emAndamento.length, rotulo: 'Alertas ativos', curto: 'Ativos', tom: 'text-danger' },
    { valor: abertos.carregando ? '—' : programados.length, rotulo: 'Programados', curto: 'Programados', tom: 'text-status-progressFg' },
    { valor: resolvidos.carregando ? '—' : resolvidos.eventos.length, rotulo: 'Resolvidos recentes', curto: 'Resolvidos', tom: 'text-status-resolvedFg' },
  ];
  const areaRevelada = useRevelarAoRolar([
    abertos.carregando,
    emAndamento.length,
    programados.length,
    resolvidos.eventos.length,
  ]);

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

      {/* A mesma régua da HomeDesktop: a página usa o monitor inteiro, enquanto
          os textos mantêm uma medida confortável dentro de cada coluna. */}
      <div ref={areaRevelada} className="mx-auto w-full max-w-[100rem] px-4 py-5 sm:px-5 lg:px-12 lg:py-7 2xl:py-10">
        <header className="reveal overflow-hidden rounded-3xl border border-edge-subtle bg-surface-raised shadow-sm">
          <div className="grid gap-5 p-5 sm:p-7 lg:grid-cols-[minmax(0,1fr)_minmax(24rem,auto)] lg:items-center lg:px-6 lg:py-5 2xl:grid-cols-[minmax(0,1fr)_auto] 2xl:gap-6 2xl:px-8 2xl:py-7">
            <div className="min-w-0">
              <span className="inline-flex items-center gap-2 rounded-full border border-brand/25 bg-brand-subtleBg px-3 py-1.5 text-xs font-bold text-brand-subtleFg">
                <span className="anim-pulsar h-2 w-2 rounded-full bg-brand" aria-hidden="true" />
                Atualizações da cidade
              </span>
              <h1 className="mt-3 text-2xl font-extrabold leading-tight text-content-primary sm:text-3xl 2xl:mt-4 2xl:text-4xl">
                Radar da cidade
              </h1>
              <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-content-secondary 2xl:mt-2 2xl:text-base">
                Alertas, interrupções e eventos para você saber o que está acontecendo agora
                {cityName ? ` em ${cityName}` : ' na cidade'}.
              </p>
            </div>

            <div className="min-w-0 lg:justify-self-end">
              <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                <CitySelector />
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9 gap-2 rounded-full px-3"
                  aria-label="Compartilhar Radar da cidade"
                  onClick={() => compartilharLink({
                    title: `Radar da cidade em ${cityName || 'nossa cidade'}`,
                    text: 'Veja o que está acontecendo agora na cidade.',
                    url: `${getBaseAppUrl()}/agora`,
                  })}
                >
                  <Share2 className="h-4 w-4" />
                  <span className="hidden sm:inline">Compartilhar</span>
                </Button>
                {podeGerir && cityId && (
                  <Button size="sm" className="h-9 gap-1.5 rounded-full px-4" onClick={() => setCriando(true)}>
                    <Plus className="h-4 w-4" /> Nova ocorrência
                  </Button>
                )}
              </div>

              {/* No notebook, os números ocupam o espaço já reservado às ações
                  e evitam uma segunda faixa de quase 75px sob a apresentação. */}
              {cityId && (
                <div className="mt-3 hidden grid-cols-3 gap-2 lg:grid 2xl:hidden">
                  {resumo.map(({ valor, curto, tom }) => (
                    <div key={curto} className="rounded-xl bg-surface-subtle px-3 py-2 text-center">
                      <p className={`text-lg font-extrabold leading-none tabular-nums ${tom}`}>{valor}</p>
                      <p className="mt-1 text-[10px] font-semibold text-content-tertiary">{curto}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {cityId && (
            <div className="grid grid-cols-3 border-t border-edge-subtle bg-surface-subtle/50 lg:hidden 2xl:grid">
              {resumo.map(({ valor, rotulo, tom }, index) => (
                <div key={rotulo} className={`px-3 py-4 text-center sm:px-6 ${index ? 'border-l border-edge-subtle' : ''}`}>
                  <p className={`text-xl font-extrabold leading-none tabular-nums lg:text-2xl ${tom}`}>{valor}</p>
                  <p className="mt-1.5 text-[10px] font-semibold text-content-tertiary sm:text-xs">{rotulo}</p>
                </div>
              ))}
            </div>
          )}
        </header>

        {/* Acompanhar a cidade inteira mora aqui e não na página da rua: é a
            assinatura mais ampla, e quem chega ao Agora está justamente
            perguntando "o que acontece por aqui". */}
        {cityId && (
          <div className="reveal mt-4 flex flex-wrap items-center gap-2 lg:mt-6">
            <FollowAreaButton areaType="city" cityId={cityId} nome={cityName} tamanho="sm" />
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
          <div className="reveal mt-8 rounded-3xl border border-dashed border-edge-default bg-surface-raised px-6 py-12 text-center shadow-sm">
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
          <div className="reveal mt-4 flex gap-2 overflow-x-auto rounded-2xl border border-edge-subtle bg-surface-raised p-2 shadow-sm [scrollbar-width:none] [&::-webkit-scrollbar]:hidden lg:mt-6 lg:w-fit">
            {FILTROS.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setFiltro(f.id)}
                className={`shrink-0 rounded-xl border px-4 py-2 text-sm font-bold transition-colors ${
                  filtro === f.id
                    ? 'border-brand bg-brand text-content-onBrand'
                    : 'border-transparent bg-transparent text-content-secondary hover:bg-surface-subtle'
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
          /* O DESTAQUE FICA NUMA COLUNA, E TUDO O MAIS NA OUTRA
             Ele é o que a página existe para mostrar, e no `xl` ganha uma coluna
             inteira, grudada ao rolar: quem desce a lista de outros alertas
             continua vendo qual é o mais grave.

             A grade envolve os DOIS casos — com e sem alerta ativo. "Eventos
             próximos" e "Resolvidos recentemente" existem independentemente de
             haver alerta agora, e prendê-los ao ramo do destaque os faria sumir
             justamente no dia tranquilo, que é quando sobra espaço para eles. */
          <div className="lg:grid lg:grid-cols-[minmax(0,1.15fr)_minmax(22rem,0.85fr)] lg:items-start lg:gap-8">
            <div className="min-w-0 lg:sticky lg:top-24">
              {/* O primeiro alerta sai em destaque e os outros na lista compacta.
                  Com um só, a seção "outros" não existe — e "Alerta em destaque"
                  continua sendo a legenda certa para ele. */}
              {abertos.carregando ? (
                <Secao titulo="Acontecendo agora" descricao="Informações que pedem atenção neste momento." className="reveal">
                  <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-brand" /></div>
                </Secao>
              ) : emAndamento.length === 0 ? (
                <Secao titulo="Acontecendo agora" descricao="Informações que pedem atenção neste momento." className="reveal">
                  <div className="px-5 py-10 text-center">
                    <Radio className="mx-auto h-8 w-8 text-content-tertiary" aria-hidden="true" />
                    <p className="mt-2 text-sm font-bold text-content-primary">Nada acontecendo agora</p>
                    <p className="mt-0.5 text-sm text-content-tertiary">
                      Sem alertas ativos {cityName ? `em ${cityName}` : 'na sua cidade'}.
                    </p>
                  </div>
                </Secao>
              ) : (
                <section className="reveal mt-6">
                  <div className="mb-3 flex items-center justify-between gap-3 px-1">
                    <div>
                      <h2 className="text-lg font-extrabold text-content-primary">Acontecendo agora</h2>
                      <p className="mt-0.5 text-sm text-content-secondary">O alerta mais relevante neste momento.</p>
                    </div>
                    <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-danger-subtleBg px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wider text-danger-subtleFg">
                      <span className="anim-pulsar h-1.5 w-1.5 rounded-full bg-danger" /> Ao vivo
                    </span>
                  </div>
                  <CityEventHighlightCard evento={emAndamento[0]} agora={agora} />
                </section>
              )}
            </div>

            <div className="min-w-0">
              {emAndamento.length > 1 && (
                <Secao titulo="Outros alertas ativos" descricao="Mais ocorrências que continuam em andamento." className="reveal">
                  {emAndamento.slice(1).map((e) => (
                    <CityEventCard key={e.id} evento={e} agora={agora} />
                  ))}
                </Secao>
              )}

              {programados.length > 0 && (
                <Secao titulo="Eventos próximos" descricao="Programe-se para o que vem a seguir." className="reveal">
                  {programados.map((e) => <CityEventUpcomingCard key={e.id} evento={e} agora={agora} />)}
                </Secao>
              )}

              {resolvidos.eventos.length > 0 && (
                <Secao
                  titulo="Resolvidos recentemente"
                  descricao="Ocorrências que já foram normalizadas."
                  className="reveal"
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

              {!abertos.carregando && emAndamento.length <= 1 && programados.length === 0 && resolvidos.eventos.length === 0 && (
                <div className="reveal mt-6 rounded-3xl border border-edge-subtle bg-surface-raised px-6 py-10 text-center shadow-sm">
                  <CalendarDays className="mx-auto h-7 w-7 text-content-tertiary" aria-hidden="true" />
                  <p className="mt-2 text-sm font-bold text-content-primary">Sem outras atualizações</p>
                  <p className="mt-1 text-sm text-content-tertiary">Novos eventos e normalizações aparecerão aqui.</p>
                </div>
              )}
            </div>
          </div>
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

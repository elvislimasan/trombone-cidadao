import { useMemo, useState } from 'react';
import { Helmet } from 'react-helmet';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  GaugeCircle,
  Construction,
  Droplets,
  HeartPulse,
  Loader2,
  Map as MapIcon,
  MapPin,
  Megaphone,
  Plus,
  Radio,
  Search,
  Share2,
  ShieldCheck,
  SlidersHorizontal,
  TrafficCone,
  Users,
  Zap,
} from 'lucide-react';

import CitySelector from '@/components/CitySelector';
import CityEventForm from '@/components/agora/CityEventForm';
import CityEventsMap from '@/components/agora/CityEventsMap';
import FollowAreaButton from '@/components/agora/FollowAreaButton';
import {
  IconeDoAcontecimento,
  SeloDeStatus,
  rotuloDoTipo,
} from '@/components/agora/CityEventVisuals';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CityViewProvider, useCityView } from '@/contexts/CityContext';
import {
  useCanManageCityEvents,
  useCityEventActions,
  useCityEvents,
  useSweepCityEvents,
} from '@/hooks/useCityEvents';
import {
  estadoDaPrevisao,
  horaCurta,
  previsaoLegivel,
  rotuloDasAreas,
} from '@/lib/cityEvents';
import { compartilharLink } from '@/lib/shareLink';
import { getBaseAppUrl } from '@/lib/shareUtils';

const FILTROS_RADAR = [
  { id: 'todos', rotulo: 'Todos', tipos: null, Icone: GaugeCircle },
  { id: 'agua', rotulo: "Falta d'água", tipos: ['water_outage'], Icone: Droplets },
  { id: 'energia', rotulo: 'Energia', tipos: ['power_outage'], Icone: Zap },
  { id: 'obras', rotulo: 'Obras', tipos: ['construction'], Icone: Construction },
  { id: 'transito', rotulo: 'Trânsito', tipos: ['road_block', 'traffic', 'public_transport'], Icone: TrafficCone },
  { id: 'saude', rotulo: 'Saúde', tipos: ['health'], Icone: HeartPulse },
  { id: 'eventos', rotulo: 'Eventos', tipos: ['event'], Icone: CalendarClock },
  { id: 'outros', rotulo: 'Outros', tipos: ['weather', 'public_notice', 'other'], Icone: SlidersHorizontal },
];

const normalizar = (valor) => String(valor || '')
  .normalize('NFD')
  .replace(/\p{Mn}/gu, '')
  .toLowerCase();

const CardResumo = ({ Icone, valor, rotulo, detalhe, tom }) => (
  <article className="group flex min-w-0 items-center gap-3 rounded-2xl border border-edge-subtle bg-surface-raised px-4 py-4 shadow-elevation-1 transition-colors hover:border-edge-default">
    <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${tom}`}>
      <Icone className="h-5 w-5" aria-hidden="true" />
    </span>
    <div className="min-w-0 flex-1">
      <p className="font-display text-2xl font-extrabold leading-none tabular-nums text-content-primary">{valor}</p>
      <p className="mt-1 truncate text-xs font-bold text-content-primary">{rotulo}</p>
      <p className="truncate text-[10px] text-content-tertiary">{detalhe}</p>
    </div>
    <ChevronRight className="h-4 w-4 shrink-0 text-content-tertiary transition-transform group-hover:translate-x-0.5" />
  </article>
);

const CabecalhoPainel = ({ Icone, titulo, descricao, acao }) => (
  <div className="flex items-start justify-between gap-3 border-b border-edge-subtle px-4 py-3.5">
    <div className="flex min-w-0 items-start gap-2.5">
      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-brand/15 text-brand">
        <Icone className="h-3.5 w-3.5" aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <h2 className="text-sm font-extrabold text-content-primary">{titulo}</h2>
        {descricao && <p className="mt-0.5 text-[10px] text-content-tertiary">{descricao}</p>}
      </div>
    </div>
    {acao}
  </div>
);

const EventoLateral = ({ evento, agora, programado = false }) => {
  const previsao = estadoDaPrevisao(evento, agora);
  const onde = evento.location_label || rotuloDasAreas(evento.areas, { maximo: 1 });
  const horario = programado
    ? previsaoLegivel(evento.started_at, agora)
    : previsao.tem ? previsao.texto : evento.started_at ? `Há ${horaCurta(evento.started_at)}` : '';

  return (
    <Link
      to={`/agora/${evento.id}`}
      className="group flex items-center gap-2.5 px-3.5 py-3 transition-colors hover:bg-surface-subtle"
    >
      <IconeDoAcontecimento
        type={evento.type}
        iconKey={evento.icon_key}
        severity={evento.severity}
        tamanho="sm"
        className="!h-8 !w-8 !rounded-lg"
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <p className="min-w-0 flex-1 truncate text-[11px] font-extrabold text-content-primary">
            {evento.title || rotuloDoTipo(evento.type)}
          </p>
          {!programado && <SeloDeStatus status={evento.status} className="!px-1.5 !py-0.5 !text-[7px]" />}
        </div>
        <p className="mt-0.5 truncate text-[9px] text-content-tertiary">{onde || 'Toda a cidade'}</p>
        {horario && (
          <p className={`mt-0.5 truncate text-[9px] font-semibold ${previsao.vencida ? 'text-brand' : 'text-amber-400/80'}`}>
            {programado ? horario : previsao.tem ? `Até ${horario}` : horario}
          </p>
        )}
      </div>
      <ChevronRight className="h-3.5 w-3.5 shrink-0 text-content-tertiary transition-transform group-hover:translate-x-0.5" />
    </Link>
  );
};

const ListaLateral = ({ titulo, Icone, eventos, agora, programado, carregando, vazio }) => (
  <section className="overflow-hidden rounded-2xl border border-edge-subtle bg-surface-raised shadow-elevation-1">
    <CabecalhoPainel
      Icone={Icone}
      titulo={titulo}
      acao={eventos.length > 4 ? (
        <span className="text-[9px] font-bold text-brand">Ver todos</span>
      ) : null}
    />
    {carregando ? (
      <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-brand" /></div>
    ) : eventos.length ? (
      <div className="divide-y divide-edge-subtle">
        {eventos.slice(0, 5).map((evento) => (
          <EventoLateral key={evento.id} evento={evento} agora={agora} programado={programado} />
        ))}
      </div>
    ) : (
      <p className="px-4 py-8 text-center text-xs text-content-tertiary">{vazio}</p>
    )}
  </section>
);

const ChamadaParaOcorrencia = ({ podeGerir, nomeDaCidade, aoCriar }) => (
  <section className="relative mt-5 overflow-hidden rounded-2xl border border-brand/25 bg-surface-subtle px-5 py-5 shadow-elevation-1 sm:px-7">
    <div className="absolute inset-y-0 right-0 w-1/2 opacity-30 [background-image:linear-gradient(120deg,transparent_35%,rgba(255,255,255,.08)_35%,rgba(255,255,255,.08)_36%,transparent_36%)]" />
    <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand/15 text-brand">
          <Megaphone className="h-5 w-5" />
        </span>
        <div>
          <h2 className="font-display text-base font-extrabold">Informe um problema na sua cidade</h2>
          <p className="mt-0.5 text-[10px] text-content-tertiary">Ajude a melhorar a sua rua, bairro e toda {nomeDaCidade}.</p>
        </div>
      </div>
      {podeGerir ? (
        <Button size="sm" className="relative rounded-full" onClick={aoCriar}>
          Nova ocorrência <Plus className="ml-1.5 h-4 w-4" />
        </Button>
      ) : (
        <Button asChild size="sm" className="relative rounded-full">
          <Link to="/mapa?criar_bronca=1">Registrar ocorrência <ArrowRight className="ml-1.5 h-4 w-4" /></Link>
        </Button>
      )}
    </div>
  </section>
);

function AgoraPage() {
  const { cityId, cityName, city, loadingCities } = useCityView();
  const [filtro, setFiltro] = useState('todos');
  const [busca, setBusca] = useState('');
  const [mostrarBusca, setMostrarBusca] = useState(false);
  const [criando, setCriando] = useState(false);
  const { podeGerir, papel, bairrosDesignados, restritoABairros } = useCanManageCityEvents(cityId);

  const abertos = useCityEvents(cityId, { filtro: 'todos', escopo: 'abertos' });
  const resolvidos = useCityEvents(cityId, { filtro: 'todos', escopo: 'resolvidos', limite: 24 });
  useSweepCityEvents(podeGerir && Boolean(cityId));

  const acoes = useCityEventActions({
    aoConcluir: async () => {
      setCriando(false);
      await Promise.all([abertos.recarregar(), resolvidos.recarregar()]);
    },
  });

  const filtroAtual = FILTROS_RADAR.find((item) => item.id === filtro) || FILTROS_RADAR[0];
  const eventosVisiveis = useMemo(() => {
    const termo = normalizar(busca.trim());
    return (abertos.eventos || []).filter((evento) => {
      if (filtroAtual.tipos && !filtroAtual.tipos.includes(evento.type)) return false;
      if (!termo) return true;
      const areas = (evento.areas || []).map((area) => area?.label).join(' ');
      return normalizar([
        evento.title,
        evento.description,
        evento.location_label,
        rotuloDoTipo(evento.type),
        areas,
      ].join(' ')).includes(termo);
    });
  }, [abertos.eventos, busca, filtroAtual]);

  const todosAbertos = useMemo(() => abertos.eventos || [], [abertos.eventos]);
  const emAndamento = eventosVisiveis.filter((evento) => evento.status !== 'scheduled');
  const programados = eventosVisiveis.filter((evento) => evento.status === 'scheduled');
  const todosEmAndamento = todosAbertos.filter((evento) => evento.status !== 'scheduled');
  const todosProgramados = todosAbertos.filter((evento) => evento.status === 'scheduled');
  const agora = new Date();

  const resumoDasAreas = useMemo(() => {
    const areas = new Map();
    todosAbertos.forEach((evento) => {
      (evento.areas || []).forEach((area) => {
        if (!area?.label || area.area_type === 'city') return;
        const chave = `${area.area_type || 'area'}:${area.area_id || area.label}`;
        const atual = areas.get(chave) || { ...area, ocorrencias: 0 };
        atual.ocorrencias += 1;
        areas.set(chave, atual);
      });
    });
    return [...areas.values()].sort((a, b) => b.ocorrencias - a.ocorrencias);
  }, [todosAbertos]);

  const areasEmFoco = resumoDasAreas.slice(0, 5);
  const imagemHero = city?.cover_url || city?.image_url || todosAbertos.find((evento) => evento.image_url)?.image_url;
  const nomeDaCidade = city?.name || String(cityName || '').split(' · ')[0] || 'sua cidade';
  const ufDaCidade = city?.state?.uf;

  if (criando) {
    return (
      <div className="min-h-screen bg-surface-base pb-16 text-content-primary">
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
    <div className="min-h-screen bg-surface-base pb-14 text-content-primary">
      <Helmet>
        <title>Radar da cidade | Trombone Cidadão</title>
        <meta name="description" content={`Acompanhe alertas, interrupções e eventos em ${nomeDaCidade}.`} />
      </Helmet>

      <main className="mx-auto w-full max-w-[100rem] px-4 py-5 sm:px-6 lg:px-10 lg:py-8 2xl:px-12">
        <section className="relative overflow-hidden rounded-[1.75rem] border border-edge-subtle bg-surface-raised shadow-elevation-2">
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-surface-raised via-surface-raised/90 to-surface-raised/55" />
          <div className="relative grid min-h-[16rem] gap-8 p-6 md:p-8 lg:grid-cols-[minmax(0,1.22fr)_minmax(26rem,.78fr)] lg:items-center lg:p-10">
            <div className="min-w-0">
              <p className="text-[10px] font-extrabold uppercase tracking-[0.24em] text-content-tertiary">
                Acompanhe os acontecimentos da sua cidade
              </p>
              <h1 className="mt-3 font-display text-4xl font-black leading-[.92] tracking-[-0.045em] text-brand sm:text-5xl lg:text-6xl">
                Radar da cidade
              </h1>
              <p className="mt-4 max-w-2xl text-sm leading-relaxed text-content-secondary lg:text-base">
                Alertas, interrupções e eventos para você saber o que está acontecendo agora em {nomeDaCidade}.
              </p>

              <div className="mt-6 grid max-w-2xl grid-cols-2 gap-x-5 gap-y-3 sm:grid-cols-4">
                {[
                  [Radio, 'Mais informação', 'para o cidadão'],
                  [ShieldCheck, 'Mais transparência', 'na gestão pública'],
                  [Users, 'Mais participação', 'da comunidade'],
                  [CheckCircle2, 'Uma cidade melhor', 'para todos'],
                ].map(([Icone, titulo, texto]) => (
                  <div key={titulo} className="flex items-start gap-2">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-brand/15 text-brand">
                      <Icone className="h-3.5 w-3.5" />
                    </span>
                    <span className="text-[9px] leading-tight text-content-tertiary">
                      <strong className="block text-[10px] text-content-primary">{titulo}</strong>{texto}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="relative hidden min-h-[13rem] lg:block">
              <div className="absolute inset-y-0 left-0 right-24 overflow-hidden rounded-2xl border border-edge-subtle bg-surface-sunken">
                {imagemHero ? (
                  <img src={imagemHero} alt="" className="h-full w-full object-cover opacity-75" />
                ) : (
                  <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_25%,rgba(255,126,75,.28),transparent_24%),linear-gradient(145deg,#1b2d37,#10161d_55%,#33141a)]" />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/10 to-transparent" />
                <div className="absolute inset-x-4 bottom-4 flex items-end justify-between gap-3">
                  <div>
                    <p className="flex items-center gap-1.5 text-xs font-bold text-white">
                      <MapPin className="h-3.5 w-3.5 text-brand" /> {nomeDaCidade}{ufDaCidade ? ` - ${ufDaCidade}` : ''}
                    </p>
                    <p className="mt-1 text-[9px] text-white/70">Nossa cidade, nosso papel.</p>
                  </div>
                  <CitySelector />
                </div>
              </div>

            </div>

            <div className="flex flex-wrap gap-2 lg:hidden">
                <CitySelector />
              <Button
                variant="outline"
                size="sm"
                className="rounded-full border-edge-default bg-surface-subtle text-content-primary hover:bg-surface-sunken hover:text-content-primary"
                onClick={() => compartilharLink({
                  title: `Radar da cidade em ${nomeDaCidade}`,
                  text: 'Veja o que está acontecendo agora na cidade.',
                  url: `${getBaseAppUrl()}/agora`,
                })}
              >
                <Share2 className="mr-1.5 h-4 w-4" /> Compartilhar
              </Button>
            </div>
          </div>
        </section>

        {cityId && (
          <>
            <ChamadaParaOcorrencia
              podeGerir={podeGerir}
              nomeDaCidade={nomeDaCidade}
              aoCriar={() => setCriando(true)}
            />
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3 px-1">
              <FollowAreaButton areaType="city" cityId={cityId} nome={nomeDaCidade} tamanho="sm" />
              <button
                type="button"
                className="inline-flex items-center gap-1.5 text-xs font-bold text-content-tertiary hover:text-content-primary"
                onClick={() => compartilharLink({
                  title: `Radar da cidade em ${nomeDaCidade}`,
                  text: 'Veja o que está acontecendo agora na cidade.',
                  url: `${getBaseAppUrl()}/agora`,
                })}
              >
                <Share2 className="h-3.5 w-3.5" /> Compartilhar Radar
              </button>
            </div>
          </>
        )}

        {!cityId && !loadingCities ? (
          <section className="mt-5 rounded-2xl border border-dashed border-edge-default bg-surface-subtle px-6 py-14 text-center">
            <MapPin className="mx-auto h-8 w-8 text-content-tertiary" />
            <h2 className="mt-3 font-display text-lg font-extrabold">Escolha uma cidade</h2>
            <p className="mx-auto mt-1 max-w-md text-sm text-content-tertiary">
              O Radar mostra os acontecimentos de uma cidade por vez. Use o seletor acima para começar.
            </p>
          </section>
        ) : cityId ? (
          <>
            <section className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
              <CardResumo Icone={Megaphone} valor={abertos.carregando ? '—' : todosEmAndamento.length} rotulo="Alertas ativos" detalhe="Acontecendo agora" tom="bg-brand/15 text-brand" />
              <CardResumo Icone={CalendarClock} valor={abertos.carregando ? '—' : todosProgramados.length} rotulo="Eventos programados" detalhe="Próximos na agenda" tom="bg-sky-500/15 text-sky-400" />
              <CardResumo Icone={CheckCircle2} valor={resolvidos.carregando ? '—' : resolvidos.eventos.length} rotulo="Resolvidos este mês" detalhe="Situações normalizadas" tom="bg-emerald-500/15 text-emerald-400" />
              <CardResumo Icone={Users} valor={abertos.carregando ? '—' : resumoDasAreas.length} rotulo="Áreas monitoradas" detalhe="Com ocorrências" tom="bg-fuchsia-500/15 text-fuchsia-400" />
            </section>

            <section className="mt-4 flex items-center gap-2 overflow-x-auto rounded-2xl border border-edge-subtle bg-surface-raised p-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {FILTROS_RADAR.map(({ id, rotulo, Icone }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setFiltro(id)}
                  className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-[10px] font-extrabold transition-colors ${
                    filtro === id ? 'bg-brand text-content-onBrand' : 'text-content-secondary hover:bg-surface-subtle hover:text-content-primary'
                  }`}
                >
                  <Icone className="h-3.5 w-3.5" /> {rotulo}
                </button>
              ))}
              <div className="ml-auto hidden w-56 shrink-0 xl:block">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-content-tertiary" />
                  <Input
                    value={busca}
                    onChange={(event) => setBusca(event.target.value)}
                    placeholder="Buscar bairro, rua ou evento..."
                    className="h-8 rounded-lg border-edge-subtle bg-surface-sunken pl-8 text-[10px] text-content-primary placeholder:text-content-tertiary"
                  />
                </div>
              </div>
              <button
                type="button"
                aria-label="Buscar acontecimentos"
                aria-expanded={mostrarBusca}
                onClick={() => setMostrarBusca((valor) => !valor)}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-edge-subtle text-content-tertiary hover:bg-surface-subtle xl:hidden"
              >
                <Search className="h-3.5 w-3.5" />
              </button>
            </section>

            {mostrarBusca && (
              <div className="relative mt-2 xl:hidden">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-content-tertiary" />
                <Input
                  autoFocus
                  value={busca}
                  onChange={(event) => setBusca(event.target.value)}
                  placeholder="Buscar bairro, rua ou evento..."
                  className="rounded-xl border-edge-subtle bg-surface-raised pl-9 text-content-primary placeholder:text-content-tertiary"
                />
              </div>
            )}

            {abertos.indisponivel ? (
              <p className="mt-5 rounded-2xl border border-edge-subtle bg-surface-raised px-5 py-10 text-center text-sm text-content-tertiary">
                O Radar da cidade ainda não está ativo nesta instalação.
              </p>
            ) : (
              <section className="mt-4 grid items-start gap-4 xl:grid-cols-[minmax(0,1.85fr)_minmax(18rem,.7fr)]">
                <div className="overflow-hidden rounded-2xl border border-edge-subtle bg-surface-raised shadow-elevation-1">
                  <CabecalhoPainel
                    Icone={MapIcon}
                    titulo="Mapa da cidade"
                    descricao="Veja onde estão os alertas e eventos com localização marcada."
                    acao={<span className="rounded-md bg-surface-subtle px-2 py-1 text-[8px] font-bold text-content-secondary">Ver lista</span>}
                  />
                  <CityEventsMap
                    eventos={eventosVisiveis}
                    cityName={nomeDaCidade}
                    cityUf={ufDaCidade}
                    embedded
                    showLegend
                  />
                </div>

                <div id="acontecendo-agora" className="grid min-w-0 gap-4">
                  <ListaLateral
                    titulo="Acontecendo agora"
                    Icone={Radio}
                    eventos={emAndamento}
                    agora={agora}
                    carregando={abertos.carregando}
                    vazio="Nenhum alerta ativo neste filtro."
                  />
                  <ListaLateral
                    titulo="Próximos eventos"
                    Icone={CalendarClock}
                    eventos={programados}
                    agora={agora}
                    programado
                    carregando={abertos.carregando}
                    vazio="Nenhum evento programado neste filtro."
                  />
                </div>
              </section>
            )}

            <section className="mt-4 overflow-hidden rounded-2xl border border-edge-subtle bg-surface-raised">
              <CabecalhoPainel
                Icone={Users}
                titulo="Áreas mais afetadas"
                acao={<span className="text-[9px] font-bold text-content-tertiary">Ver todas</span>}
              />
              {areasEmFoco.length ? (
                <div className="grid gap-2 p-3 sm:grid-cols-2 lg:grid-cols-5">
                  {areasEmFoco.map((area, index) => (
                    <article key={`${area.area_type}-${area.area_id || area.label}`} className="flex items-center gap-2.5 rounded-xl border border-edge-subtle bg-surface-subtle p-3">
                      <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${index === 0 ? 'bg-brand/15 text-brand' : 'bg-amber-500/10 text-amber-400'}`}>
                        <MapPin className="h-4 w-4" />
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-[10px] font-extrabold text-content-primary">{area.label}</p>
                        <p className="text-[9px] text-content-tertiary">{area.ocorrencias} {area.ocorrencias === 1 ? 'ocorrência' : 'ocorrências'}</p>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <p className="px-4 py-7 text-center text-xs text-content-tertiary">As áreas com ocorrências aparecerão aqui.</p>
              )}
            </section>

          </>
        ) : null}
      </main>
    </div>
  );
}

export default function AgoraPageWithCityView() {
  return (
    <CityViewProvider>
      <AgoraPage />
    </CityViewProvider>
  );
}

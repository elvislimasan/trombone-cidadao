import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Helmet } from 'react-helmet';
import { Link } from 'react-router-dom';
import {
  ArrowRight, BarChart2, Bell, Briefcase, Building, CheckCircle2, Construction,
  ChevronLeft, ChevronRight, Download, FileSignature, Globe2, Loader2, MapPin,
  Megaphone, Radio, Route as RouteIcon, ShieldCheck, Smartphone, UserPlus, Users,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import CitySelector from '@/components/CitySelector';
import { CityViewProvider, useCityView } from '@/contexts/CityContext';
import CityEventCard from '@/components/agora/CityEventCard';
import { useCityEvents } from '@/hooks/useCityEvents';
import { FILTROS } from '@/lib/cityEvents';
import { supabase } from '@/lib/customSupabaseClient';
import { MapContainer, Marker } from 'react-leaflet';
import { MapBaseLayer } from '@/components/map/MapDisplayControls';
import { createPinIcon } from '@/components/map/pinIcon';
import { BarraQueEnche, Contador, useRevelarAoRolar } from '@/components/home/animacoes';

// A home do desktop.
//
// O QUE ELA É, E O QUE ELA NÃO É
//
// Uma visão geral da cidade, e não o feed. O feed inteiro — com busca, filtros,
// ordenação e mapa expansível — continua existindo em `/broncas`, e é para lá
// que os "Ver todas" apontam. Esta página responde "o que está acontecendo e
// por onde eu começo"; a outra responde "quero vasculhar tudo".
//
// A versão anterior desta tela (HomePage-improved) continua inteira em
// `/home-legado`. Trocar a home é o tipo de mudança que se quer poder desfazer
// olhando, e não só no git.
//
// NENHUM NÚMERO DESTA PÁGINA É ESTIMADO
//
// Todo valor aqui sai de uma contagem no banco. Onde o dado não existe, o
// espaço fica vazio em vez de receber um número plausível — uma página que abre
// afirmando "2.847 cidadãos ativos" sem saber quem está ativo mente logo na
// primeira linha, e é a linha que decide se a pessoa acredita no resto.

const MODULOS = [
  { nome: 'Radar das cidades', path: '/agora', Icone: Radio, descricao: 'Alertas locais de cidades participantes.', tom: 'bg-brand-subtleBg text-brand-subtleFg', destaque: 'border-brand/25 bg-gradient-to-b from-brand-subtleBg/70 to-surface-raised' },
  { nome: 'Obras Públicas', path: '/obras-publicas', Icone: Construction, descricao: 'Acompanhe obras em qualquer município.', tom: 'bg-status-pendingBg text-status-pendingFg', destaque: 'border-status-pendingBorder bg-gradient-to-b from-status-pendingBg/65 to-surface-raised' },
  { nome: 'Ruas', path: '/mapa-pavimentacao', Icone: RouteIcon, descricao: 'Consulte ruas e pavimentação.', tom: 'bg-status-progressBg text-status-progressFg', destaque: 'border-status-progressBorder bg-gradient-to-b from-status-progressBg/55 to-surface-raised' },
  { nome: 'Imóveis Alugados', path: '/imoveis-alugados', Icone: Building, descricao: 'Transparência no uso de imóveis públicos.', tom: 'bg-brand-subtleBg text-brand-subtleFg' },
  { nome: 'Serviços', path: '/servicos', Icone: Briefcase, descricao: 'Serviços públicos perto de você.', tom: 'bg-success-bg text-success-fg' },
  { nome: 'Estatísticas', path: '/estatisticas', Icone: BarChart2, descricao: 'Indicadores de participação cidadã.', tom: 'bg-status-resolvedBg text-status-resolvedFg' },
];

const BRASIL_COORDS = [-14.235, -51.9253];

const SELO_DE_STATUS = {
  pending: 'bg-status-pendingBg text-status-pendingFg',
  'in-progress': 'bg-status-progressBg text-status-progressFg',
  resolved: 'bg-status-resolvedBg text-status-resolvedFg',
};

const ROTULO_DE_STATUS = {
  pending: 'Pendente',
  'in-progress': 'Em andamento',
  resolved: 'Resolvida',
};

const inicioDoMes = (deslocamento = 0) => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth() + deslocamento, 1).toISOString();
};

/**
 * A variação percentual contra o mês passado.
 *
 * Devolve `null` quando o mês anterior foi zero: "+∞%" não é informação, e
 * "+100%" sobre uma base de uma bronca dá a impressão de um salto que não
 * houve. Sem base de comparação, a tela simplesmente não mostra a variação.
 */
const variacao = (agora, antes) => {
  if (!antes) return null;
  return Math.round(((agora - antes) / antes) * 100);
};

/** A primeira foto da bronca. `featured_image_url` tem precedência quando existe
 *  porque é a escolha explícita de quem destacou. */
const fotoDaBronca = (bronca) =>
  bronca?.featured_image_url || bronca?.report_media?.[0]?.url || null;

/** Em um resultado, a prova de resolucao conta a historia melhor do que a
 * foto de abertura. Se ela nao existir, preservamos a capa original. */
const fotoDoResultado = (bronca) =>
  bronca?.report_media?.find((midia) => midia.type === 'photo' && midia.is_resolution_proof)?.url
  || bronca?.featured_image_url
  || bronca?.report_media?.find((midia) => midia.type === 'photo')?.url
  || null;

const CapaDaBronca = ({ bronca }) => {
  const foto = fotoDaBronca(bronca);
  if (foto) {
    return (
      <img
        src={foto}
        alt=""
        loading="lazy"
        className="h-full w-full object-cover saturate-[0.88] contrast-[0.96] transition-transform group-hover:scale-105"
      />
    );
  }

  return (
    <div className="flex h-full w-full flex-col items-center justify-center bg-gradient-to-br from-brand-subtleBg to-status-pendingBg px-4 text-center">
      <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-surface-raised/85 text-brand shadow-sm">
        <Megaphone className="h-5 w-5" aria-hidden="true" />
      </span>
      <span className="mt-2 line-clamp-1 text-[10px] font-bold uppercase tracking-wider text-content-secondary">
        {bronca.categories?.name || 'Ocorrência cidadã'}
      </span>
      <span className="mt-0.5 line-clamp-1 text-[10px] text-content-tertiary">
        {bronca.address || 'Local informado no mapa'}
      </span>
    </div>
  );
};

/** O ponto da bronca, de `POINT(lng lat)` ou do GeoJSON, para o mapa da prévia. */
const pontoDaBronca = (location) => {
  if (!location) return null;
  if (Array.isArray(location.coordinates)) {
    return [Number(location.coordinates[1]), Number(location.coordinates[0])];
  }
  const m = String(location).match(/POINT\(([-\d.]+) ([-\d.]+)\)/i);
  return m ? [Number(m[2]), Number(m[1])] : null;
};

const Secao = ({ titulo, descricao, acao, children, className = '' }) => (
  <section className={`reveal mt-10 ${className}`}>
    <div className="mb-4 flex items-end justify-between gap-4">
      <div className="min-w-0">
        <h2 className="text-xl font-extrabold text-content-primary">{titulo}</h2>
        {descricao && <p className="mt-0.5 text-sm text-content-secondary">{descricao}</p>}
      </div>
      {acao}
    </div>
    {children}
  </section>
);

const VerTodos = ({ para, children }) => (
  <Link to={para} className="inline-flex shrink-0 items-center gap-1 text-sm font-bold text-brand hover:underline">
    {children} <ArrowRight className="h-4 w-4" />
  </Link>
);

function HomeDesktop() {
  const { cityId, cityName } = useCityView();
  const [filtro, setFiltro] = useState('todos');
  const [numeros, setNumeros] = useState(null);
  const [broncas, setBroncas] = useState([]);
  const [peticoes, setPeticoes] = useState([]);
  const [casoResolvido, setCasoResolvido] = useState(null);
  const [carregando, setCarregando] = useState(true);

  const alertas = useCityEvents(cityId, { filtro, escopo: 'abertos' });
  const emAndamento = alertas.eventos || [];
  const agora = useMemo(() => new Date(), []);
  const trilhoDeBroncas = useRef(null);
  const trilhoDePeticoes = useRef(null);
  // O observador e refeito quando broncas/peticoes chegam: elas so existem
  // depois da consulta, e um observador montado uma vez so as ignoraria.
  const areaRevelada = useRevelarAoRolar([broncas, peticoes, emAndamento.length]);

  // O passo sai da largura REAL de um cartao, e nao de uma constante: qualquer
  // ajuste no tamanho faria a constante mentir e a seta pararia no meio de um.
  //
  // A funcao recebe o trilho porque agora sao dois — broncas e peticoes. Duas
  // copias desta conta divergiriam no dia em que um dos dois cartoes mudasse de
  // largura, e a seta do outro passaria a parar no lugar errado.
  const rolar = (ref, direcao) => {
    const trilho = ref.current;
    const cartao = trilho?.children?.[0];
    if (!trilho || !cartao) return;
    trilho.scrollBy({ left: direcao * (cartao.offsetWidth + 12), behavior: 'smooth' });
  };

  const carregar = useCallback(async () => {
    setCarregando(true);
    const porCidade = (q) => (cityId ? q.eq('city_id', cityId) : q);
    const esteMes = inicioDoMes(0);
    const mesPassado = inicioDoMes(-1);

    const [
      cidadaos, totalBroncas, resolvidas, broncasEsteMes, broncasMesPassado,
      resolvidasEsteMes, resolvidasMesPassado, ultimas, ativas, ultimoCasoResolvido,
    ] = await Promise.all([
      porCidade(supabase.from('profiles').select('id', { count: 'exact', head: true })),
      porCidade(supabase.from('reports').select('id', { count: 'exact', head: true })),
      porCidade(supabase.from('reports').select('id', { count: 'exact', head: true }).eq('status', 'resolved')),
      porCidade(supabase.from('reports').select('id', { count: 'exact', head: true }).gte('created_at', esteMes)),
      porCidade(supabase.from('reports').select('id', { count: 'exact', head: true }).gte('created_at', mesPassado).lt('created_at', esteMes)),
      porCidade(supabase.from('reports').select('id', { count: 'exact', head: true }).eq('status', 'resolved').gte('resolved_at', esteMes)),
      porCidade(supabase.from('reports').select('id', { count: 'exact', head: true }).eq('status', 'resolved').gte('resolved_at', mesPassado).lt('resolved_at', esteMes)),
      // A FOTO NÃO VEM DE `featured_image_url`
      //
      // Essa coluna está preenchida em 89 dos 593 registros — quem lê só ela
      // monta uma vitrine de retângulos cinzas. A mídia de verdade mora em
      // `report_media`, uma linha por arquivo. (Mesmo tropeço da página da rua,
      // corrigido na migração 225.)
      //
      // `!inner` porque esta seção é uma VITRINE: bronca sem foto continua no
      // feed e no mapa, mas aqui ela seria um buraco no meio da grade. E
      // `is_resolution_proof` fica de fora — a prova mostra o problema já
      // consertado, e ilustrar "bronca em destaque" com ela seria mentir.
      porCidade(
        supabase.from('reports')
          .select('id, title, address, status, category_id, location, created_at, categories(name), report_media!inner(url, type, is_resolution_proof)')
          .eq('report_media.type', 'photo')
          .eq('report_media.is_resolution_proof', false)
          .order('created_at', { ascending: false })
          .limit(6),
      ),
      // 'open' é o valor real da coluna — a página de abaixo-assinados filtra
      // pelo mesmo. Os outros no banco são 'draft', 'pending_moderation',
      // 'rejected' e 'victory', e nenhum deles é petição em campanha.
      // `image_url` entra porque a seção virou vitrine: três blocos de texto
      // empilhados eram a metade menos lida desta página, ao lado de uma faixa
      // de broncas com foto. E o limite sobe de 3 para 8 — num carrossel, o que
      // não cabe na primeira tela continua existindo; numa pilha, não.
      supabase.from('petitions')
        .select('id, title, goal, status, image_url, signatures(count)')
        .eq('status', 'open')
        .order('created_at', { ascending: false })
        .limit(8),
      // Um caso real para a faixa de impacto. Ele e consultado separadamente
      // porque a vitrine acima prioriza ocorrencias recentes com foto e pode
      // nao conter nenhuma das que ja foram resolvidas.
      porCidade(
        supabase.from('reports')
          .select('id, title, address, status, featured_image_url, resolved_at, categories(name), report_media(url, type, is_resolution_proof)')
          .eq('status', 'resolved')
          .order('resolved_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
      ),
    ]);

    const total = totalBroncas.count || 0;
    const feitas = resolvidas.count || 0;

    setNumeros({
      cidadaos: cidadaos.count || 0,
      broncas: total,
      resolvidas: feitas,
      // A taxa é sobre o total registrado, e não sobre "total menos as que
      // ainda nem foram moderadas": qualquer recorte mais favorável seria uma
      // escolha nossa para o número ficar maior.
      taxa: total ? ((feitas / total) * 100).toFixed(1) : null,
      deltaBroncas: variacao(broncasEsteMes.count || 0, broncasMesPassado.count || 0),
      deltaResolvidas: variacao(resolvidasEsteMes.count || 0, resolvidasMesPassado.count || 0),
    });
    setBroncas(ultimas.data || []);
    setPeticoes(ativas.data || []);
    setCasoResolvido(ultimoCasoResolvido.data || null);
    setCarregando(false);
  }, [cityId]);

  useEffect(() => { carregar(); }, [carregar]);

  const temCidadeSelecionada = Boolean(cityId);
  const nomeDoRecorte = cityName || 'Brasil';

  // O CENTRO DA PRÉVIA SAI DAS PRÓPRIAS BRONCAS
  //
  // Centralizar numa constante deixaria o mapa apontando para Floresta em
  // qualquer cidade selecionada. A média dos pontos carregados cai no meio de
  // onde as ocorrências estão — e sem nenhum ponto, a constante volta a ser a
  // resposta menos errada.
  const broncasNoMapa = useMemo(
    () => broncas
      .map((bronca) => ({ bronca, ponto: pontoDaBronca(bronca.location) }))
      .filter((b) => b.ponto),
    [broncas],
  );
  const centroDaPrevia = useMemo(() => {
    if (!temCidadeSelecionada || !broncasNoMapa.length) return BRASIL_COORDS;
    const soma = broncasNoMapa.reduce((a, { ponto }) => [a[0] + ponto[0], a[1] + ponto[1]], [0, 0]);
    return [soma[0] / broncasNoMapa.length, soma[1] / broncasNoMapa.length];
  }, [broncasNoMapa, temCidadeSelecionada]);

  return (
    <>
      <Helmet>
        <title>Trombone Cidadão — cidadania em todo o Brasil</title>
        <meta name="description" content="Uma plataforma cidadã nacional para acompanhar cidades, registrar problemas, apoiar causas e transformar o Brasil." />
      </Helmet>

      {/* A MESMA LARGURA DO MAPA DE PAVIMENTAÇÃO
          `max-w-6xl` (72rem) deixava quase 400px de fundo vazio de cada lado num
          1920. Aqui vale a régua que aquela tela já usa: 112rem com o respiro
          crescendo por breakpoint — a página ocupa o monitor sem os blocos
          encostarem na borda.

          As colunas de texto continuam presas em `max-w-md`/`max-w-sm` dentro
          das seções: largura de container é uma coisa, comprimento de linha
          legível é outra, e esticar parágrafo até 1792px tornaria a leitura
          pior, não melhor. */}
      <div ref={areaRevelada} className="mx-auto w-full max-w-[100rem] px-5 py-10 md:px-8 lg:px-12">

        {/* ── Abertura ──────────────────────────────────────────────────── */}
        <section className="grid items-center gap-10 lg:grid-cols-2">
          <div>
            {/* A marca nacional vem antes do recorte municipal. A cidade escolhida
                filtra os dados, mas não redefine a identidade do aplicativo. */}
            <span className="reveal inline-flex items-center gap-1.5 rounded-full border border-brand/25 bg-brand-subtleBg px-3 py-1.5 text-xs font-bold text-brand-subtleFg">
              <Globe2 className="h-3.5 w-3.5" /> Plataforma cidadã nacional
            </span>

            <h1 className="reveal reveal-delay-1 mt-4 text-4xl font-extrabold leading-[1.1] text-content-primary xl:text-5xl">
              Sua voz transforma o Brasil,<br />
              <span className="text-brand">cidade por cidade</span>
            </h1>
            <p className="reveal reveal-delay-2 mt-4 max-w-lg text-sm leading-relaxed text-content-secondary">
              O Trombone Cidadão conecta pessoas de todo o país para acompanhar o poder público,
              registrar problemas e construir cidades melhores.
            </p>

            <div className="reveal reveal-delay-2 mt-5 flex flex-wrap items-center gap-3">
              <CitySelector align="left" />
              <span className="text-xs text-content-tertiary">
                {temCidadeSelecionada ? `Exibindo dados de ${nomeDoRecorte}` : 'Exibindo o panorama nacional'}
              </span>
            </div>

            {/* NÚMEROS SOLTOS, SEM CARTÃO NEM ÍCONE
                É o desenho do protótipo: três números grandes lado a lado, com
                o rótulo abaixo. Os cartões tingidos que estavam aqui competiam
                com os seis cartões de módulo logo em seguida — duas grades de
                caixinhas seguidas, e a abertura perdia a hierarquia. */}
            <div className="reveal reveal-delay-3 mt-8 flex flex-wrap gap-10">
              {[
                // "Cadastrados", e não "ativos": `profiles` não guarda último
                // acesso, então "ativos" seria um critério que a base não
                // confirma.
                { valor: numeros?.cidadaos, rotulo: 'Cidadãos cadastrados' },
                { valor: numeros?.broncas, rotulo: 'Broncas registradas' },
                { valor: numeros?.resolvidas, rotulo: 'Problemas resolvidos' },
              ].map(({ valor, rotulo }) => (
                <div key={rotulo}>
                  <p className="text-3xl font-extrabold leading-none text-brand tabular-nums">
                    <Contador valor={valor} />
                  </p>
                  <p className="mt-1.5 text-xs text-content-secondary">{rotulo}</p>
                </div>
              ))}
            </div>

            <div className="reveal reveal-delay-3 mt-7 flex flex-wrap gap-3">
              <Button asChild size="lg" className="gap-2 rounded-xl">
                <Link to="/mapa?criar_bronca=1"><Megaphone className="h-4 w-4" /> Registrar uma bronca</Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="gap-2 rounded-xl">
                <Link to="/agora"><Radio className="h-4 w-4" /> Explorar o Radar</Link>
              </Button>
            </div>
          </div>

          {/* A fotografia explica o produto antes do texto terminar: uma pessoa
              usando o celular no espaço público, com sinais reais da cidade. */}
          <div className="relative">
            <div className="relative aspect-[16/10] overflow-hidden rounded-3xl bg-[#7F1220] text-white shadow-elevation-3">
              <img
                src="/hero-img.webp"
                alt="Cidadã usando o Trombone Cidadão em uma rua brasileira"
                fetchPriority="high"
                className="absolute inset-0 h-full w-full object-cover object-center saturate-[0.9]"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-brand/10" />

              <div className="absolute left-4 top-4 rounded-xl border border-white/25 bg-black/45 px-3 py-2 shadow-lg backdrop-blur-md sm:left-6 sm:top-6">
                <p className="text-[10px] font-bold uppercase tracking-wider text-amber-300">Ocorrência registrada</p>
                <p className="mt-0.5 text-xs font-bold">A comunidade já pode acompanhar</p>
              </div>

              <div className="absolute bottom-5 left-5 right-5 flex items-end justify-end gap-3 sm:bottom-7 sm:left-7 sm:right-7">
                <span className="hidden shrink-0 items-center gap-1.5 rounded-full border border-white/20 bg-white/15 px-3 py-2 text-xs font-bold backdrop-blur-md sm:inline-flex">
                  <CheckCircle2 className="h-4 w-4 text-emerald-300" /> Problemas acompanhados
                </span>
              </div>
            </div>

            {/* O cartão flutuante do protótipo: ícone de confirmação, título e
                uma linha só. Ele invade a foto pela esquerda-baixo. */}
            <div className="anim-flutuar absolute -bottom-3 left-6 flex items-center gap-3.5 rounded-2xl border border-edge-subtle bg-surface-raised px-5 py-4 shadow-elevation-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-success-bg text-success-fg">
                <CheckCircle2 className="h-5 w-5" />
              </span>
              <div>
                <p className="text-sm font-bold text-content-primary">Impacto real</p>
                <p className="mt-0.5 text-xs text-content-secondary">
                  {numeros?.taxa
                    ? `${numeros.taxa}% das broncas resolvidas`
                    : 'Cada participação fortalece o país'}
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ── Módulos ───────────────────────────────────────────────────── */}
        <Secao titulo="Explore os módulos" descricao="Ferramentas para agir localmente e acompanhar o Brasil.">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            {MODULOS.map(({ nome, path, Icone, descricao, tom, destaque }, i) => (
              <Link
                key={path}
                to={path}
                className={`reveal ${i ? `reveal-delay-${Math.min(i, 5)}` : ''} group relative overflow-hidden rounded-2xl border p-4 text-center transition-[colors,transform,box-shadow] hover:-translate-y-1 hover:border-brand/40 ${
                  destaque
                    ? `${destaque} shadow-elevation-1 hover:shadow-elevation-2`
                    : 'border-edge-subtle bg-surface-raised/80 shadow-sm hover:bg-surface-subtle'
                }`}
              >
                {destaque && <span className="absolute inset-x-0 top-0 h-0.5 bg-brand/45" aria-hidden="true" />}
                <span className={`mx-auto flex items-center justify-center ${destaque ? 'h-12 w-12 rounded-2xl shadow-sm' : 'h-10 w-10 rounded-xl opacity-85'} ${tom}`}>
                  <Icone className={destaque ? 'h-5 w-5' : 'h-4 w-4'} />
                </span>
                <p className="mt-3 text-sm font-bold text-content-primary">{nome}</p>
                <p className="mt-1 text-xs leading-snug text-content-tertiary">{descricao}</p>
              </Link>
            ))}
          </div>
        </Secao>

        {/* O programa merece uma entrada própria: os embaixadores são quem leva
            a plataforma nacional para a rotina de cada município. */}
        <section className="reveal relative mt-10 min-h-[20rem] overflow-hidden rounded-3xl border border-brand/20 bg-[#390b12] text-white shadow-elevation-2">
          <img
            src="/embaixador-desktop.webp"
            alt="Grupo de embaixadores do Trombone Cidadão"
            loading="lazy"
            className="absolute inset-0 h-full w-full object-cover object-[68%_center] saturate-[0.88]"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-[#27070d]/95 via-[#4b0b15]/85 to-black/25" />
          <div className="relative flex min-h-[20rem] max-w-2xl flex-col justify-center p-8 lg:p-10">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/15 bg-white/10 backdrop-blur-sm">
                <ShieldCheck className="h-6 w-6 text-amber-300" aria-hidden="true" />
              </span>
              <p className="mt-5 text-xs font-extrabold uppercase tracking-[0.18em] text-amber-300">Programa nacional de embaixadores</p>
              <h2 className="mt-2 text-2xl font-extrabold">Leve o Trombone Cidadão para sua cidade</h2>
              <p className="mt-2 max-w-xl text-sm leading-relaxed text-white/75">
                Embaixadores aproximam moradores, acompanham demandas e ajudam informações locais confiáveis a ganhar força em todo o país.
              </p>
              <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-xs font-bold text-white/85">
                <span className="inline-flex items-center gap-1.5"><Users className="h-4 w-4 text-amber-300" /> Mobilize sua comunidade</span>
                <span className="inline-flex items-center gap-1.5"><MapPin className="h-4 w-4 text-amber-300" /> Represente seu município</span>
                <span className="inline-flex items-center gap-1.5"><Megaphone className="h-4 w-4 text-amber-300" /> Dê voz às demandas locais</span>
              </div>
            <div className="mt-6 flex flex-wrap gap-3">
              <Button asChild size="lg" className="rounded-xl bg-amber-400 text-[#3b0a12] hover:bg-amber-300">
                <Link to="/seja-embaixador">Quero ser embaixador</Link>
              </Button>
              <Button asChild variant="outline" className="rounded-xl border-white/25 bg-white/10 text-white hover:bg-white/20 hover:text-white">
                <Link to="/embaixador">Acessar meu painel</Link>
              </Button>
            </div>
          </div>
        </section>

        {/* ── Radar ─────────────────────────────────────────────────────── */}
        <Secao
          titulo={temCidadeSelecionada ? `Radar de ${nomeDoRecorte}` : 'Radar das cidades'}
          descricao={temCidadeSelecionada ? 'Os principais alertas e ocorrências em tempo real.' : 'Escolha uma cidade para acompanhar alertas locais em tempo real.'}
          acao={<VerTodos para="/agora">Ver todos os alertas</VerTodos>}
        >
          {temCidadeSelecionada && (
            <div className="mb-4 flex flex-wrap gap-2">
              {FILTROS.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setFiltro(f.id)}
                  className={`rounded-full border px-4 py-1.5 text-sm font-bold transition-colors ${
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

          {!temCidadeSelecionada ? (
            <div className="rounded-3xl border border-dashed border-brand/30 bg-brand-subtleBg px-6 py-10 text-center">
              <Globe2 className="mx-auto h-9 w-9 text-brand" aria-hidden="true" />
              <p className="mt-3 text-base font-extrabold text-content-primary">Alertas são locais. A plataforma é nacional.</p>
              <p className="mx-auto mt-1 max-w-lg text-sm text-content-secondary">Selecione um município para ver o que está acontecendo agora.</p>
              <div className="mt-5 flex justify-center"><CitySelector /></div>
            </div>
          ) : alertas.carregando ? (
            <div className="flex justify-center rounded-3xl border border-edge-subtle bg-surface-raised py-14">
              <Loader2 className="h-6 w-6 animate-spin text-brand" />
            </div>
          ) : emAndamento.length === 0 ? (
            <div className="rounded-3xl border border-edge-subtle bg-surface-raised py-14 text-center">
              <Radio className="mx-auto h-8 w-8 text-content-tertiary" aria-hidden="true" />
              <p className="mt-2 text-sm font-bold text-content-primary">Nada acontecendo agora</p>
              <p className="mt-0.5 text-sm text-content-tertiary">Sem alertas ativos em {nomeDoRecorte}.</p>
            </div>
          ) : (
            /* UMA LISTA SÓ, SEM O CARTÃO DE DESTAQUE
               É o desenho do protótipo. O destaque em coluna própria faz sentido
               no Radar, onde a página inteira é sobre o alerta mais grave; na
               home ele criava uma terceira coluna de leitura entre a grade de
               módulos e a faixa vermelha, e a seção deixava de ser uma prévia
               para virar uma tela dentro da tela. A página do Radar continua
               com o destaque. */
            <div className="divide-y divide-edge-subtle overflow-hidden rounded-2xl border border-edge-subtle bg-surface-raised shadow-sm">
              {emAndamento.slice(0, 4).map((e, i) => (
                <div key={e.id} className={`reveal ${i ? `reveal-delay-${Math.min(i, 5)}` : ''}`}>
                  <CityEventCard evento={e} agora={agora} compact />
                </div>
              ))}
            </div>
          )}

        </Secao>

        {/* ── A faixa de impacto ────────────────────────────────────────── */}
        <section className="reveal mt-10 overflow-hidden rounded-2xl bg-gradient-to-r from-[#74111e] to-[#9E1526] p-5 text-white sm:p-6">
          {casoResolvido ? (
            <div className="grid items-center gap-5 sm:grid-cols-[9rem_minmax(0,1fr)_auto]">
              <div className="h-28 overflow-hidden rounded-2xl border border-white/15 bg-white/10 sm:h-24">
                {fotoDoResultado(casoResolvido) ? (
                  <img
                    src={fotoDoResultado(casoResolvido)}
                    alt="Registro da ocorrência resolvida"
                    loading="lazy"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <span className="flex h-full items-center justify-center">
                    <CheckCircle2 className="h-10 w-10 text-emerald-300" aria-hidden="true" />
                  </span>
                )}
              </div>
              <div className="min-w-0">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-400/15 px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wider text-emerald-200">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Problema resolvido
                </span>
                <h2 className="mt-2 line-clamp-1 text-xl font-extrabold">{casoResolvido.title}</h2>
                <p className="mt-1 line-clamp-1 text-xs text-white/70">
                  {casoResolvido.address || (temCidadeSelecionada ? nomeDoRecorte : 'Local informado no mapa')}
                </p>
                <p className="mt-2 text-sm text-white/85">
                  Esta ocorrência foi marcada como resolvida e continua disponível para consulta pública.
                </p>
              </div>
              <Button asChild size="lg" className="w-full rounded-xl bg-amber-400 font-extrabold text-[#5d0d18] hover:bg-amber-300 sm:w-auto">
                <Link to={`/bronca/${casoResolvido.id}`}>Ver resultado <ArrowRight className="ml-1 h-4 w-4" /></Link>
              </Button>
            </div>
          ) : (
            <div className="flex flex-col items-start justify-between gap-5 sm:flex-row sm:items-center">
              <div>
                <p className="text-xl font-extrabold">Acompanhe resultados reais</p>
                <p className="mt-1 max-w-2xl text-sm text-white/75">
                  As ocorrências ficam públicas para que moradores acompanhem cada atualização até a resolução.
                </p>
              </div>
              <Button asChild size="lg" className="w-full rounded-xl bg-amber-400 font-extrabold text-[#5d0d18] hover:bg-amber-300 sm:w-auto">
                <Link to="/mapa">Explorar broncas</Link>
              </Button>
            </div>
          )}
        </section>

        {/* ── Broncas e petições ────────────────────────────────────────── */}
        {/* As duas seções viram CARTÕES, como no desenho: cada uma é uma lista
            de coisas diferentes, e a moldura é o que impede a leitura de
            escorregar de uma para a outra no meio da linha. */}
        <div className="mt-10 grid min-w-0 gap-6 lg:grid-cols-2">
          <section className="reveal min-w-0 rounded-3xl border border-edge-subtle bg-surface-raised p-4 shadow-sm sm:p-6">
            <div className="mb-4 flex items-end justify-between gap-4">
              <div>
                <h2 className="text-xl font-extrabold text-content-primary">Broncas em destaque</h2>
                <p className="mt-0.5 text-sm text-content-secondary">
                  {temCidadeSelecionada ? `As ocorrências mais recentes de ${nomeDoRecorte}.` : 'Ocorrências recentes registradas em cidades do Brasil.'}
                </p>
              </div>
              <VerTodos para="/mapa">Ver todas</VerTodos>
            </div>

            {carregando ? (
              <div className="flex justify-center rounded-3xl border border-edge-subtle bg-surface-raised py-14">
                <Loader2 className="h-6 w-6 animate-spin text-brand" />
              </div>
            ) : broncas.length === 0 ? (
              <p className="rounded-3xl border border-edge-subtle bg-surface-raised px-5 py-14 text-center text-sm text-content-tertiary">
                {temCidadeSelecionada ? `Nenhuma bronca registrada em ${nomeDoRecorte} ainda.` : 'Nenhuma bronca registrada no momento.'}
              </p>
            ) : (
              /* CARROSSEL, E NÃO GRADE FIXA
                 São seis broncas num espaço de duas. Numa grade, metade ficaria
                 escondida por corte; rolando na horizontal, as seis existem e as
                 setas dizem que há mais. `snap-start` faz cada parada cair no
                 começo de um cartão em vez de no meio de um. */
              <div className="relative">
                <div
                  ref={trilhoDeBroncas}
                  className="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                >
                {broncas.slice(0, 6).map((b) => (
                  <Link
                    key={b.id}
                    to={`/bronca/${b.id}`}
                    className="group w-full min-w-0 shrink-0 snap-start overflow-hidden rounded-2xl border border-edge-subtle bg-surface-raised shadow-sm transition-colors hover:border-brand/40 sm:w-[calc((100%_-_0.75rem)/2)] sm:min-w-[13rem]"
                  >
                    <div className="relative aspect-[16/10] w-full overflow-hidden border-b border-edge-subtle bg-surface-subtle">
                      <CapaDaBronca bronca={b} />
                      <span className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/15 via-transparent to-transparent" aria-hidden="true" />
                      {/* O selo de status sobre a foto, como no desenho. As
                          cores são os tokens do sistema — as mesmas do pino do
                          mapa e do cartão da bronca. */}
                      <span className={`absolute left-2 top-2 z-10 rounded-full border border-white/30 px-2 py-0.5 text-[10px] font-bold shadow-sm ${SELO_DE_STATUS[b.status] || SELO_DE_STATUS.pending}`}>
                        {ROTULO_DE_STATUS[b.status] || 'Pendente'}
                      </span>
                    </div>
                    <div className="p-3">
                      <p className="line-clamp-1 text-[11px] text-content-tertiary">{b.address || 'Endereço não informado'}</p>
                      <p className="mt-0.5 line-clamp-2 text-sm font-bold leading-snug text-content-primary">{b.title}</p>
                      {b.categories?.name && (
                        <span className="mt-2 inline-block rounded-full bg-surface-subtle px-2 py-0.5 text-[10px] font-semibold text-content-secondary">
                          {b.categories.name}
                        </span>
                      )}
                    </div>
                  </Link>
                ))}
                </div>

                {/* As setas só aparecem quando há mais do que cabe. Seta que não
                    rola nada ensina que o carrossel acabou quando ele nem
                    começou. */}
                {broncas.length > 2 && (
                  <>
                    <button
                      type="button"
                      aria-label="Broncas anteriores"
                      onClick={() => rolar(trilhoDeBroncas, -1)}
                      className="absolute -left-3 top-1/2 z-10 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-edge-subtle bg-surface-raised text-content-secondary shadow-lg hover:text-brand"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      aria-label="Próximas broncas"
                      onClick={() => rolar(trilhoDeBroncas, 1)}
                      className="absolute -right-3 top-1/2 z-10 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-edge-subtle bg-surface-raised text-content-secondary shadow-lg hover:text-brand"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </>
                )}
              </div>
            )}
          </section>

          <section className="reveal min-w-0 rounded-3xl border border-edge-subtle bg-surface-raised p-4 shadow-sm sm:p-6">
            <div className="mb-4 flex items-end justify-between gap-4">
              <div>
                <h2 className="text-xl font-extrabold text-content-primary">Petições ativas</h2>
                <p className="mt-0.5 text-sm text-content-secondary">Apoie causas cidadãs de diferentes lugares do país.</p>
              </div>
              <VerTodos para="/abaixo-assinados">Ver todas</VerTodos>
            </div>

            {peticoes.length === 0 ? (
              <p className="rounded-3xl border border-edge-subtle bg-surface-raised px-5 py-14 text-center text-sm text-content-tertiary">
                Nenhuma petição ativa no momento.
              </p>
            ) : (
              /* MESMO CARROSSEL DAS BRONCAS, E ISSO É DE PROPÓSITO
                 As duas seções ficam lado a lado. Uma pilha de três cartões de
                 texto ao lado de uma faixa de fotos que rola não lê como duas
                 listas do mesmo lugar: lê como uma lista e um rodapé. Com a
                 mesma forma, o olho aprende a mecânica uma vez e reconhece as
                 duas — e as petições recentes, que antes paravam na terceira,
                 passam a caber. */
              <div className="relative">
                <div
                  ref={trilhoDePeticoes}
                  className="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                >
                {peticoes.map((p) => {
                  const assinaturas = p.signatures?.[0]?.count || 0;
                  const meta = p.goal || 0;
                  const parte = meta ? Math.min(100, Math.round((assinaturas / meta) * 100)) : 0;
                  return (
                    <Link
                      key={p.id}
                      to={`/abaixo-assinado/${p.id}`}
                      className="group flex w-full min-w-0 shrink-0 snap-start flex-col overflow-hidden rounded-2xl border border-edge-subtle bg-surface-raised shadow-sm transition-colors hover:border-brand/40 sm:w-[calc((100%_-_0.75rem)/2)] sm:min-w-[13rem]"
                    >
                      <div className="relative aspect-[16/10] w-full overflow-hidden border-b border-edge-subtle bg-surface-subtle">
                        {/* SEM FOTO, UM BLOCO DA MARCA — E NÃO UM <img> QUEBRADO
                            Petição não exige imagem no cadastro, e `src` vazio
                            rende o ícone de arquivo corrompido do navegador: a
                            vitrine passaria a anunciar defeito. */}
                        {p.image_url ? (
                          <img
                            src={p.image_url}
                            alt=""
                            loading="lazy"
                            className="h-full w-full object-cover saturate-[0.88] contrast-[0.96] transition-transform group-hover:scale-105"
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center bg-brand-subtleBg">
                            <FileSignature className="h-8 w-8 text-brand-subtleFg" />
                          </div>
                        )}
                        <span className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/15 via-transparent to-transparent" aria-hidden="true" />
                        <span className="absolute left-2 top-2 z-10 inline-flex items-center gap-1.5 rounded-full border border-white/30 bg-brand px-2 py-0.5 text-[10px] font-bold text-content-onBrand shadow-sm">
                          <FileSignature className="h-3 w-3" /> Petição ativa
                        </span>
                      </div>

                      <div className="flex flex-1 flex-col p-3">
                        <p className="line-clamp-2 text-sm font-bold leading-snug text-content-primary">{p.title}</p>

                        <div className="mt-auto pt-3">
                          <BarraQueEnche parte={parte} />
                          <span className="mt-1 block text-[10px] font-bold text-content-secondary tabular-nums">
                            {assinaturas}{meta > 0 ? ` / ${meta} assinaturas` : ' assinaturas'}
                          </span>
                        </div>
                      </div>
                    </Link>
                  );
                })}
                </div>

                {peticoes.length > 2 && (
                  <>
                    <button
                      type="button"
                      aria-label="Petições anteriores"
                      onClick={() => rolar(trilhoDePeticoes, -1)}
                      className="absolute -left-3 top-1/2 z-10 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-edge-subtle bg-surface-raised text-content-secondary shadow-lg hover:text-brand"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      aria-label="Próximas petições"
                      onClick={() => rolar(trilhoDePeticoes, 1)}
                      className="absolute -right-3 top-1/2 z-10 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-edge-subtle bg-surface-raised text-content-secondary shadow-lg hover:text-brand"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </>
                )}
              </div>
            )}
          </section>
        </div>

        {/* ── Mapa ──────────────────────────────────────────────────────── */}
        <section className="reveal mt-10 grid items-center gap-7 rounded-3xl border border-edge-subtle bg-surface-raised p-6 shadow-sm lg:grid-cols-[minmax(15rem,0.7fr)_minmax(0,1.3fr)] lg:p-8">
          <div>
            <h2 className="text-xl font-extrabold text-content-primary">
              {temCidadeSelecionada ? `Explore ${nomeDoRecorte}` : 'Explore o Brasil pelas cidades'}
            </h2>
            <p className="mt-2 max-w-sm text-sm leading-relaxed text-content-secondary">
              {temCidadeSelecionada
                ? `Navegue pelo mapa e descubra ocorrências e informações em cada região de ${nomeDoRecorte}.`
                : 'Navegue pelo mapa e descubra ocorrências registradas por cidadãos em diferentes municípios.'}
            </p>
            <Button asChild size="lg" className="mt-5 gap-2 rounded-xl">
              <Link to="/mapa"><MapPin className="h-4 w-4" /> Abrir mapa interativo</Link>
            </Button>
          </div>
          {/* UM MAPA DE VERDADE, E NÃO UM PRINT
              Um <img> estático envelheceria sozinho — mostraria as broncas do
              dia em que a imagem foi gerada. Aqui é o mesmo Leaflet do resto do
              app, com os pontos das broncas recém-carregadas.

              Todos os gestos estão desligados: a prévia é para OLHAR e clicar,
              e um mapa que dá zoom no meio da rolagem da página sequestra a
              rolagem. O `<Link>` por cima é o que a torna clicável inteira. */}
          <div className="relative h-[22rem] overflow-hidden rounded-2xl border border-edge-subtle">
            <MapContainer
              key={`${cityId ?? 'brasil'}-${broncasNoMapa.length}`}
              center={centroDaPrevia}
              zoom={temCidadeSelecionada && broncasNoMapa.length ? 14 : 4}
              className="h-full w-full"
              zoomControl={false}
              dragging={false}
              scrollWheelZoom={false}
              doubleClickZoom={false}
              touchZoom={false}
              keyboard={false}
              attributionControl={false}
            >
              <MapBaseLayer />
              {/* Os pinos são os MESMOS do mapa de verdade: `createPinIcon` dá
                  a cor pelo status (laranja pendente, azul em andamento, verde
                  resolvida) e o emoji pela categoria. Um ponto vermelho genérico
                  aqui ensinaria uma legenda que o mapa real não usa. */}
              {broncasNoMapa.map(({ bronca, ponto }) => (
                <Marker key={bronca.id} position={ponto} icon={createPinIcon({ report: bronca })} />
              ))}
            </MapContainer>

            <Link
              to="/mapa"
              aria-label="Abrir o mapa interativo"
              className="absolute inset-0 z-[500] transition-colors hover:bg-brand/10"
            />
          </div>
        </section>

        {/* Aquisição em duas etapas complementares: instalar reduz o atrito para
            voltar; cadastrar cria o vínculo que guarda contribuições e alertas. */}
        <section className="reveal relative mt-10 min-h-[20rem] overflow-hidden rounded-3xl bg-[#171717] text-white shadow-elevation-2">
          <img
            src="/banner-aplicativo.webp"
            alt="Aplicativo Trombone Cidadão exibido em um celular"
            loading="lazy"
            className="absolute inset-0 h-full w-full object-cover object-[70%_center]"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-[#171717] via-[#171717]/90 to-[#171717]/10" />
          <div className="relative grid min-h-[20rem] items-center gap-8 px-8 py-8 lg:grid-cols-[minmax(0,0.58fr)_minmax(18rem,0.42fr)] lg:px-12">
            <div className="flex items-start gap-5">
              <span className="hidden h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-brand text-content-onBrand sm:flex">
                <Smartphone className="h-8 w-8" aria-hidden="true" />
              </span>
              <div>
                <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-amber-300">Trombone Cidadão no seu celular</p>
                <h2 className="mt-2 text-2xl font-extrabold sm:text-3xl">Baixe o app e transforme participação em hábito</h2>
                <p className="mt-3 max-w-2xl text-sm leading-relaxed text-white/70">
                  Crie sua conta para registrar broncas, acompanhar respostas e receber alertas importantes da sua cidade onde estiver.
                </p>
                <div className="mt-5 flex flex-wrap gap-x-6 gap-y-2 text-xs font-bold text-white/80">
                  <span className="inline-flex items-center gap-1.5"><Bell className="h-4 w-4 text-amber-300" /> Alertas em tempo real</span>
                  <span className="inline-flex items-center gap-1.5"><CheckCircle2 className="h-4 w-4 text-amber-300" /> Acompanhamento das contribuições</span>
                  <span className="inline-flex items-center gap-1.5"><Globe2 className="h-4 w-4 text-amber-300" /> Presença em cidades do Brasil</span>
                </div>
                <div className="mt-6 flex flex-wrap gap-3">
                  <Button asChild size="lg" className="gap-2 rounded-xl bg-amber-400 font-extrabold text-[#171717] hover:bg-amber-300">
                    <Link to="/app"><Download className="h-4 w-4" /> Baixar o app</Link>
                  </Button>
                  <Button asChild size="lg" variant="outline" className="gap-2 rounded-xl border-white/25 bg-white/5 text-white hover:bg-white/10 hover:text-white">
                    <Link to="/cadastro"><UserPlus className="h-4 w-4" /> Criar conta grátis</Link>
                  </Button>
                </div>
              </div>
            </div>
            <div aria-hidden="true" />
          </div>
        </section>

      </div>
    </>
  );
}

export default function HomeDesktopWithCityView() {
  return (
    <CityViewProvider>
      <HomeDesktop />
    </CityViewProvider>
  );
}

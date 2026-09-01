import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Helmet } from 'react-helmet';
import { Link } from 'react-router-dom';
import {
  ArrowRight, BarChart2, Briefcase, Building, CheckCircle2, Construction,
  ChevronLeft, ChevronRight, FileSignature, Loader2, MapPin, Megaphone, Radio, Route as RouteIcon, Trophy,
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
import { FLORESTA_COORDS } from '@/config/mapConfig';
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
  { nome: 'Radar da cidade', path: '/agora', Icone: Radio, descricao: 'Alertas, eventos e tudo que acontece.', tom: 'bg-brand-subtleBg text-brand-subtleFg' },
  { nome: 'Obras Públicas', path: '/obras-publicas', Icone: Construction, descricao: 'Obras em andamento e concluídas.', tom: 'bg-status-pendingBg text-status-pendingFg' },
  { nome: 'Pavimentação', path: '/mapa-pavimentacao', Icone: RouteIcon, descricao: 'Mapa das ruas e sua situação.', tom: 'bg-status-progressBg text-status-progressFg' },
  { nome: 'Imóveis Alugados', path: '/imoveis-alugados', Icone: Building, descricao: 'Transparência nos imóveis alugados.', tom: 'bg-brand-subtleBg text-brand-subtleFg' },
  { nome: 'Serviços', path: '/servicos', Icone: Briefcase, descricao: 'Informações e serviços ao cidadão.', tom: 'bg-success-bg text-success-fg' },
  { nome: 'Estatísticas', path: '/estatisticas', Icone: BarChart2, descricao: 'Dados e indicadores da cidade.', tom: 'bg-status-resolvedBg text-status-resolvedFg' },
];

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
  <section className={`reveal mt-12 ${className}`}>
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
  const [carregando, setCarregando] = useState(true);

  const alertas = useCityEvents(cityId, { filtro, escopo: 'abertos' });
  const emAndamento = alertas.eventos || [];
  const agora = useMemo(() => new Date(), []);
  const trilhoDeBroncas = useRef(null);
  // O observador e refeito quando broncas/peticoes chegam: elas so existem
  // depois da consulta, e um observador montado uma vez so as ignoraria.
  const areaRevelada = useRevelarAoRolar([broncas, peticoes, emAndamento.length]);

  // O passo sai da largura REAL de um cartao, e nao de uma constante: qualquer
  // ajuste no tamanho faria a constante mentir e a seta pararia no meio de um.
  const rolarBroncas = (direcao) => {
    const trilho = trilhoDeBroncas.current;
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
      resolvidasEsteMes, resolvidasMesPassado, ultimas, ativas,
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
      supabase.from('petitions')
        .select('id, title, goal, status, signatures(count)')
        .eq('status', 'open')
        .order('created_at', { ascending: false })
        .limit(3),
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
    setCarregando(false);
  }, [cityId]);

  useEffect(() => { carregar(); }, [carregar]);

  const ondeEstou = cityName || 'sua cidade';

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
    if (!broncasNoMapa.length) return FLORESTA_COORDS;
    const soma = broncasNoMapa.reduce((a, { ponto }) => [a[0] + ponto[0], a[1] + ponto[1]], [0, 0]);
    return [soma[0] / broncasNoMapa.length, soma[1] / broncasNoMapa.length];
  }, [broncasNoMapa]);

  return (
    <>
      <Helmet>
        <title>Trombone Cidadão — juntos por uma cidade melhor</title>
        <meta name="description" content={`Participe, acompanhe e transforme ${ondeEstou}. Alertas, obras, pavimentação e serviços num lugar só.`} />
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
            {/* O selo da cidade vem ANTES do título, como no protótipo. Antes
                ele ficava sobre a foto, onde some para quem lê da esquerda. */}
            <span className="reveal inline-flex items-center gap-1.5 rounded-full border border-brand/25 bg-brand-subtleBg px-3 py-1.5 text-xs font-bold text-brand-subtleFg">
              <MapPin className="h-3.5 w-3.5" /> {ondeEstou}
            </span>

            <h1 className="reveal reveal-delay-1 mt-4 text-4xl font-extrabold leading-[1.1] text-content-primary xl:text-5xl">
              Juntos por uma<br />
              <span className="text-brand">cidade melhor</span>
            </h1>
            <p className="reveal reveal-delay-2 mt-4 max-w-lg text-sm leading-relaxed text-content-secondary">
              Participe, acompanhe e transforme {ondeEstou}. Cada denúncia e sugestão aproxima
              a cidade que temos da cidade que queremos.
            </p>

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
                <Link to="/agora"><Radio className="h-4 w-4" /> Radar da cidade</Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="gap-2 rounded-xl">
                <Link to="/broncas"><Megaphone className="h-4 w-4" /> Fazer uma denúncia</Link>
              </Button>
            </div>
          </div>

          {/* A FOTO É DE UMA CIDADE SÓ, E ISSO PRECISA SER DITO
              `public/floresta-pe.jpg` é uma foto de Floresta. Com o seletor em
              outra cidade, ela ilustraria o município errado — por isso o
              `onError` some com a imagem e o fundo em degradê assume, em vez de
              deixar um retângulo quebrado. Quando houver foto por cidade, é
              trocar a origem por uma coluna de `cities`. */}
          <div className="relative">
            <div className="overflow-hidden rounded-3xl bg-gradient-to-br from-[#7F1220] via-[#B3182B] to-[#E63946] shadow-elevation-3">
              <img
                src="/floresta-pe.jpg"
                alt={`Vista de ${ondeEstou}`}
                className="aspect-[16/10] w-full object-cover"
                onError={(e) => { e.currentTarget.style.display = 'none'; }}
              />
            </div>

            {/* O cartão flutuante do protótipo: ícone de confirmação, título e
                uma linha só. Ele invade a foto pela esquerda-baixo. */}
            <div className="anim-flutuar absolute -bottom-6 left-6 flex items-center gap-3.5 rounded-2xl border border-edge-subtle bg-surface-raised px-5 py-4 shadow-elevation-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-success-bg text-success-fg">
                <CheckCircle2 className="h-5 w-5" />
              </span>
              <div>
                <p className="text-sm font-bold text-content-primary">Impacto real</p>
                <p className="mt-0.5 text-xs text-content-secondary">
                  {numeros?.taxa
                    ? `${numeros.taxa}% das broncas resolvidas`
                    : 'Cada denúncia gera mudança na cidade'}
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ── Módulos ───────────────────────────────────────────────────── */}
        <Secao titulo="Explore os módulos" descricao="Tudo para acompanhar e melhorar nossa cidade.">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            {MODULOS.map(({ nome, path, Icone, descricao, tom }, i) => (
              <Link
                key={path}
                to={path}
                className={`reveal ${i ? `reveal-delay-${Math.min(i, 5)}` : ''} group rounded-2xl border border-edge-subtle bg-surface-raised p-4 text-center shadow-sm transition-[colors,transform] hover:-translate-y-1 hover:border-brand/40 hover:bg-surface-subtle`}
              >
                <span className={`mx-auto flex h-11 w-11 items-center justify-center rounded-2xl ${tom}`}>
                  <Icone className="h-5 w-5" />
                </span>
                <p className="mt-3 text-sm font-bold text-content-primary">{nome}</p>
                <p className="mt-1 text-xs leading-snug text-content-tertiary">{descricao}</p>
              </Link>
            ))}
          </div>
        </Secao>

        {/* ── Radar ─────────────────────────────────────────────────────── */}
        <Secao
          titulo="Radar da cidade"
          descricao="Os principais alertas e ocorrências em tempo real."
          acao={<VerTodos para="/agora">Ver todos os alertas</VerTodos>}
        >
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

          {alertas.carregando ? (
            <div className="flex justify-center rounded-3xl border border-edge-subtle bg-surface-raised py-14">
              <Loader2 className="h-6 w-6 animate-spin text-brand" />
            </div>
          ) : emAndamento.length === 0 ? (
            <div className="rounded-3xl border border-edge-subtle bg-surface-raised py-14 text-center">
              <Radio className="mx-auto h-8 w-8 text-content-tertiary" aria-hidden="true" />
              <p className="mt-2 text-sm font-bold text-content-primary">Nada acontecendo agora</p>
              <p className="mt-0.5 text-sm text-content-tertiary">Sem alertas ativos em {ondeEstou}.</p>
            </div>
          ) : (
            /* UMA LISTA SÓ, SEM O CARTÃO DE DESTAQUE
               É o desenho do protótipo. O destaque em coluna própria faz sentido
               no Radar, onde a página inteira é sobre o alerta mais grave; na
               home ele criava uma terceira coluna de leitura entre a grade de
               módulos e a faixa vermelha, e a seção deixava de ser uma prévia
               para virar uma tela dentro da tela. A página do Radar continua
               com o destaque. */
            <div className="overflow-hidden rounded-3xl border border-edge-subtle bg-surface-raised shadow-elevation-1 divide-y divide-edge-subtle">
              {emAndamento.slice(0, 4).map((e, i) => (
                <div key={e.id} className={`reveal ${i ? `reveal-delay-${Math.min(i, 5)}` : ''}`}>
                  <CityEventCard evento={e} agora={agora} />
                </div>
              ))}
            </div>
          )}

          {emAndamento.length > 0 && (
            <div className="reveal mt-5 text-center">
              <VerTodos para="/agora">Ver todos os alertas</VerTodos>
            </div>
          )}
        </Secao>

        {/* ── A faixa de impacto ────────────────────────────────────────── */}
        <section className="reveal mt-12 overflow-hidden rounded-3xl bg-gradient-to-r from-[#7F1220] to-[#9E1526] px-8 py-8 text-white">
          <div className="grid items-center gap-8 lg:grid-cols-[minmax(0,1fr)_auto]">
            <div className="grid items-center gap-8 sm:grid-cols-[minmax(0,15rem)_minmax(0,1fr)]">
              <div>
                <p className="text-2xl font-extrabold leading-snug">Sua voz faz<br />a diferença!</p>
                <p className="mt-2 text-xs leading-relaxed text-white/75">
                  Cada denúncia, sugestão e participação ajuda a construir uma cidade mais
                  justa e transparente.
                </p>
              </div>
              <div className="grid grid-cols-3 gap-6">
                <div>
                  <p className="text-3xl font-extrabold leading-none tabular-nums"><Contador valor={numeros?.broncas} /></p>
                  <p className="mt-1 text-[11px] text-white/70">Broncas registradas</p>
                </div>
                <div>
                  <p className="text-3xl font-extrabold leading-none tabular-nums"><Contador valor={numeros?.resolvidas} /></p>
                  <p className="mt-1 text-[11px] text-white/70">Resolvidas</p>
                </div>
                <div>
                  <p className="text-3xl font-extrabold leading-none tabular-nums">{numeros?.taxa ? `${numeros.taxa}%` : '—'}</p>
                  <p className="mt-1 text-[11px] text-white/70">Taxa de resolução</p>
                </div>
              </div>
            </div>
            {/* Amarelo, e não branco: sobre o vermelho escuro é a única cor do
                sistema que ainda avança em vez de recuar. */}
            <Button asChild size="lg" className="rounded-xl bg-amber-400 font-extrabold text-[#7F1220] hover:bg-amber-300">
              <Link to="/broncas">Quero ajudar</Link>
            </Button>
          </div>
        </section>

        {/* ── Broncas e petições ────────────────────────────────────────── */}
        {/* As duas seções viram CARTÕES, como no desenho: cada uma é uma lista
            de coisas diferentes, e a moldura é o que impede a leitura de
            escorregar de uma para a outra no meio da linha. */}
        <div className="mt-12 grid gap-6 lg:grid-cols-2">
          <section className="reveal rounded-3xl border border-edge-subtle bg-surface-raised p-6 shadow-sm">
            <div className="mb-4 flex items-end justify-between gap-4">
              <div>
                <h2 className="text-xl font-extrabold text-content-primary">Broncas em destaque</h2>
                <p className="mt-0.5 text-sm text-content-secondary">As ocorrências mais recentes da cidade.</p>
              </div>
              <VerTodos para="/broncas">Ver todas</VerTodos>
            </div>

            {carregando ? (
              <div className="flex justify-center rounded-3xl border border-edge-subtle bg-surface-raised py-14">
                <Loader2 className="h-6 w-6 animate-spin text-brand" />
              </div>
            ) : broncas.length === 0 ? (
              <p className="rounded-3xl border border-edge-subtle bg-surface-raised px-5 py-14 text-center text-sm text-content-tertiary">
                Nenhuma bronca registrada em {ondeEstou} ainda.
              </p>
            ) : (
              /* CARROSSEL, E NÃO GRADE FIXA
                 São seis broncas num espaço de três. Numa grade, metade ficaria
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
                    className="group w-[calc((100%-1.5rem)/3)] min-w-[9.5rem] shrink-0 snap-start overflow-hidden rounded-2xl border border-edge-subtle bg-surface-raised shadow-sm transition-colors hover:border-brand/40"
                  >
                    <div className="relative aspect-[4/3] w-full overflow-hidden bg-surface-subtle">
                      <img
                        src={fotoDaBronca(b)}
                        alt=""
                        loading="lazy"
                        className="h-full w-full object-cover transition-transform group-hover:scale-105"
                      />
                      {/* O selo de status sobre a foto, como no desenho. As
                          cores são os tokens do sistema — as mesmas do pino do
                          mapa e do cartão da bronca. */}
                      <span className={`absolute left-2 top-2 rounded-full px-2 py-0.5 text-[10px] font-bold ${SELO_DE_STATUS[b.status] || SELO_DE_STATUS.pending}`}>
                        {ROTULO_DE_STATUS[b.status] || 'Pendente'}
                      </span>
                    </div>
                    <div className="p-3">
                      <p className="line-clamp-1 text-[11px] text-content-tertiary">{b.address || 'Endereço não informado'}</p>
                      <p className="mt-0.5 line-clamp-2 text-xs font-bold leading-snug text-content-primary">{b.title}</p>
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
                {broncas.length > 3 && (
                  <>
                    <button
                      type="button"
                      aria-label="Broncas anteriores"
                      onClick={() => rolarBroncas(-1)}
                      className="absolute -left-3 top-1/2 z-10 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-edge-subtle bg-surface-raised text-content-secondary shadow-lg hover:text-brand"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      aria-label="Próximas broncas"
                      onClick={() => rolarBroncas(1)}
                      className="absolute -right-3 top-1/2 z-10 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-edge-subtle bg-surface-raised text-content-secondary shadow-lg hover:text-brand"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </>
                )}
              </div>
            )}
          </section>

          <section className="reveal rounded-3xl border border-edge-subtle bg-surface-raised p-6 shadow-sm">
            <div className="mb-4 flex items-end justify-between gap-4">
              <div>
                <h2 className="text-xl font-extrabold text-content-primary">Petições ativas</h2>
                <p className="mt-0.5 text-sm text-content-secondary">Apoie causas importantes da cidade.</p>
              </div>
              <VerTodos para="/abaixo-assinados">Ver todas</VerTodos>
            </div>

            {peticoes.length === 0 ? (
              <p className="rounded-3xl border border-edge-subtle bg-surface-raised px-5 py-14 text-center text-sm text-content-tertiary">
                Nenhuma petição ativa no momento.
              </p>
            ) : (
              <div className="grid gap-3">
                {peticoes.map((p) => {
                  const assinaturas = p.signatures?.[0]?.count || 0;
                  const meta = p.goal || 0;
                  const parte = meta ? Math.min(100, Math.round((assinaturas / meta) * 100)) : 0;
                  return (
                    /* O cartão do protótipo: selo, título, a barra com a contagem
                       "29 / 100" ao lado, e o botão em largura total abaixo. */
                    <div key={p.id} className="reveal reveal-delay-1 rounded-2xl border border-edge-subtle bg-surface-raised p-4 shadow-sm">
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-subtleBg px-2 py-0.5 text-[11px] font-bold text-brand-subtleFg">
                        <FileSignature className="h-3.5 w-3.5" /> Petição ativa
                      </span>
                      <p className="mt-2 line-clamp-2 text-sm font-bold leading-snug text-content-primary">{p.title}</p>

                      <div className="mt-3 flex items-center gap-3">
                        <BarraQueEnche parte={parte} className="flex-1" />
                        <span className="shrink-0 text-[11px] font-bold text-content-secondary tabular-nums">
                          {assinaturas}{meta > 0 ? ` / ${meta}` : ''}
                        </span>
                      </div>

                      <Button asChild size="sm" className="mt-3 w-full rounded-lg">
                        <Link to={`/abaixo-assinado/${p.id}`}>Apoiar agora</Link>
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>

        {/* ── Mapa ──────────────────────────────────────────────────────── */}
        <section className="reveal mt-12 grid items-center gap-8 rounded-3xl border border-edge-subtle bg-surface-raised p-8 shadow-sm lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
          <div>
            <h2 className="text-xl font-extrabold text-content-primary">Explore sua cidade</h2>
            <p className="mt-2 max-w-sm text-sm leading-relaxed text-content-secondary">
              Navegue pelo mapa e descubra ocorrências e informações em cada região de {ondeEstou}.
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
          <div className="relative aspect-[16/9] overflow-hidden rounded-2xl border border-edge-subtle">
            <MapContainer
              center={centroDaPrevia}
              zoom={14}
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

        {/* ── Chamada final ─────────────────────────────────────────────── */}
        {/* CENTRALIZADA, COMO NO PROTÓTIPO
            Título, uma linha e o botão, empilhados no meio. A faixa horizontal
            que estava aqui repetia a forma da faixa vermelha de impacto, e as
            duas seguidas liam como a mesma seção duas vezes. */}
        <section className="reveal mt-12 rounded-3xl border border-status-pendingBorder bg-status-pendingBg px-8 py-12 text-center">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-surface-raised/70 text-status-pendingFg">
            <Trophy className="h-6 w-6" />
          </span>
          <h2 className="mt-4 text-2xl font-extrabold text-content-primary">Juntos somos mais fortes</h2>
          <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-content-secondary">
            Participe da transformação de {ondeEstou}. Sua contribuição é o que nos move.
          </p>
          <Button asChild size="lg" className="mt-6 rounded-xl">
            <Link to="/broncas">Começar agora</Link>
          </Button>
        </section>

        <div className="mt-10 flex justify-center">
          <CitySelector />
        </div>
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

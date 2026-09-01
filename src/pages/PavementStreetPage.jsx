import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Helmet } from 'react-helmet';
import { Link, useParams } from 'react-router-dom';
import { compartilharLink } from '@/lib/shareLink';
import { getStreetShareUrl } from '@/lib/shareUtils';
import { CircleMarker, MapContainer } from 'react-leaflet';
import {
  BookOpen,
  Calendar,
  ChevronDown,
  ChevronRight,
  Download,
  FileText,
  HardHat,
  HelpCircle,
  Image as ImageIcon,
  Loader2,
  MapPin,
  Navigation,
  Pencil,
  Sparkles,
  Share2,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import BackButton from '@/components/BackButton';
import MediaViewer from '@/components/MediaViewer';
import PavementEditModal from '@/components/pavement/PavementEditModal';
import { supabase } from '@/lib/customSupabaseClient';
import { savePavementStreet } from '@/lib/savePavementStreet';
import { useCanManagePavement } from '@/hooks/useCanManagePavement';
import { MapBaseLayer } from '@/components/map/MapDisplayControls';
import { cepsDaRua, rotuloDoPavimento } from '@/lib/pavementReport';
import { showAppError } from '@/lib/appError';
import StreetEventBanner from '@/components/agora/StreetEventBanner';
import FollowAreaButton from '@/components/agora/FollowAreaButton';
import StreetSummary from '@/components/pavement/StreetSummary';
import SugerirClassificacao from '@/components/pavement/SugerirClassificacao';
import { useStreetCityEvents } from '@/hooks/useCityEvents';
import {
  capaDaRua,
  formatarDataBr,
  fotosDaRuaOrdenadas,
  nomeRedundante,
  normalizarDocumentos,
  normalizarFotos,
  textoLimpo,
} from '@/lib/pavementStreetHistory';

// A página da história de uma rua.
//
// O TOPO É UMA CAPA, E O RESTO SÃO CARTÕES IGUAIS ENTRE SI
//
// Cada bloco — homenageado, curiosidades, imagens, documentos, localização —
// tem a mesma moldura: um ícone num quadrado tingido, o título ao lado, e uma
// ação opcional à direita. Repetir a moldura é o que deixa a página ser lida
// numa rolada só: quem entendeu um cartão entendeu todos, e o conteúdo de cada
// um fica livre para ser diferente sem parecer outra tela.
//
// O QUE APARECE DEPENDE DO QUE FOI CADASTRADO
//
// Nenhum bloco tem estado vazio. Uma rua sem documentos não mostra "nenhum
// documento": mostra as seções que ela tem. A página é montada a partir do que
// existe, porque um cartão vazio é pior do que um cartão a menos — ele promete
// conteúdo que nunca vai chegar ali.

const parseLocation = (location) => {
  if (!location) return null;
  if (Array.isArray(location.coordinates)) {
    return { lat: Number(location.coordinates[1]), lng: Number(location.coordinates[0]) };
  }
  const match = String(location).match(/POINT\(([-\d.]+) ([-\d.]+)\)/i);
  return match ? { lat: Number(match[2]), lng: Number(match[1]) } : null;
};

const statusLabel = (street) => {
  if (street?.status === 'paved') {
    // O vocabulário mora em `pavementReport`, e não numa terceira cópia aqui:
    // era essa duplicação que fazia 'interlocking' aparecer só nos relatórios.
    const pavementType = street.pavement_type ? rotuloDoPavimento(street.pavement_type) : '';
    return `Pavimentada${pavementType && pavementType !== 'Não informado' ? ` · ${pavementType}` : ''}`;
  }
  if (street?.status === 'partially_paved') return 'Parcialmente pavimentada';
  if (street?.status === 'unpaved') return 'Sem pavimentação';
  return '';
};

/* --- A moldura comum --- */

const Cartao = ({ icone: Icone, titulo, acao = null, children, className = '' }) => (
  <section className={`overflow-hidden rounded-3xl border border-edge-subtle bg-surface-raised shadow-elevation-1 ${className}`}>
    <div className="flex items-center gap-3 p-4 sm:p-5">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-subtleBg text-brand-subtleFg">
        <Icone className="h-5 w-5" />
      </span>
      <h2 className="min-w-0 flex-1 text-lg font-bold text-content-primary">{titulo}</h2>
      {acao}
    </div>
    {children}
  </section>
);

const BotaoVerTodas = ({ aberto, onClick, rotulo = 'Ver todas' }) => (
  <button
    type="button"
    onClick={onClick}
    className="inline-flex shrink-0 items-center gap-1 rounded-full border border-edge-subtle px-3 py-1.5 text-xs font-bold text-brand transition-colors hover:bg-surface-subtle"
  >
    {aberto ? 'Ver menos' : rotulo}
    {aberto ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
  </button>
);

/**
 * Texto longo com "Ver mais".
 *
 * O corte é por LINHAS (line-clamp), não por número de caracteres: cortar em
 * "350 caracteres" produz uma altura diferente em cada aparelho e deixa meia
 * linha órfã. E o botão só aparece quando o texto realmente transbordou —
 * medido no elemento, não estimado — senão ruas com biografia de duas linhas
 * ganhavam um "Ver mais" que não revelava nada.
 */
// As classes ficam escritas por extenso porque `line-clamp-${n}` não sobrevive
// à varredura do Tailwind nem deixa claro quais valores existem de fato — o
// index.css só define de 1 a 4.
const CORTE = {
  2: 'line-clamp-2',
  3: 'line-clamp-3',
  4: 'line-clamp-4',
};

const TextoExpansivel = ({ texto, linhas = 4 }) => {
  const [aberto, setAberto] = useState(false);
  const [transbordou, setTransbordou] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const elemento = ref.current;
    if (!elemento) return undefined;

    const medir = () => setTransbordou(elemento.scrollHeight > elemento.clientHeight + 1);
    medir();

    const observador = typeof ResizeObserver === 'function' ? new ResizeObserver(medir) : null;
    observador?.observe(elemento);
    return () => observador?.disconnect();
  }, [texto, linhas]);

  return (
    <div>
      <p
        ref={ref}
        className={`whitespace-pre-line text-[0.95rem] leading-relaxed text-content-secondary ${aberto ? '' : (CORTE[linhas] || CORTE[4])}`}
      >
        {texto}
      </p>
      {(transbordou || aberto) && (
        <button
          type="button"
          onClick={() => setAberto((valor) => !valor)}
          className="mt-2 inline-flex items-center gap-1 text-sm font-bold text-brand"
        >
          {aberto ? 'Ver menos' : 'Ver mais'}
          <ChevronDown className={`h-4 w-4 transition-transform ${aberto ? 'rotate-180' : ''}`} />
        </button>
      )}
    </div>
  );
};

/* --- Imagens --- */

const LegendaFoto = ({ foto }) => {
  const data = formatarDataBr(foto.date);
  if (!foto.caption && !data) return null;
  return (
    <div className="px-1 pt-2">
      {foto.caption && <p className="text-sm font-semibold leading-snug text-content-primary">{foto.caption}</p>}
      {data && <p className="mt-0.5 text-xs text-content-tertiary">{data}</p>}
    </div>
  );
};

const CarrosselFotos = ({ fotos, nomeDaRua, onAbrir }) => {
  const trilhoRef = useRef(null);
  const [ativo, setAtivo] = useState(0);

  // O passo sai da distância REAL entre dois cartões, e não de uma constante
  // com a largura mais o espaçamento: qualquer ajuste no Tailwind faria a
  // constante mentir, e os pontinhos passariam a marcar a foto errada.
  const passoDoTrilho = () => {
    const trilho = trilhoRef.current;
    const primeiro = trilho?.children?.[0];
    if (!primeiro) return 0;
    const segundo = trilho.children[1];
    return segundo ? segundo.offsetLeft - primeiro.offsetLeft : primeiro.offsetWidth;
  };

  const aoRolar = () => {
    const trilho = trilhoRef.current;
    const passo = passoDoTrilho();
    if (!trilho || !passo) return;
    const indice = Math.round(trilho.scrollLeft / passo);
    setAtivo(Math.max(0, Math.min(fotos.length - 1, indice)));
  };

  const irPara = (indice) => {
    const trilho = trilhoRef.current;
    const passo = passoDoTrilho();
    if (!trilho || !passo) return;
    trilho.scrollTo({ left: passo * indice, behavior: 'smooth' });
  };

  return (
    <>
      <div
        ref={trilhoRef}
        onScroll={aoRolar}
        className="flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-1 scrollbar-none sm:px-5"
      >
        {fotos.map((foto, indice) => (
          <figure key={`${foto.url}-${indice}`} className="w-[46%] min-w-[9.5rem] shrink-0 snap-start sm:w-[30%]">
            <button
              type="button"
              onClick={() => onAbrir(indice)}
              className="block w-full overflow-hidden rounded-2xl bg-surface-subtle"
              aria-label={`Abrir ${foto.caption || nomeDaRua} em tela cheia`}
            >
              <img
                src={foto.url}
                alt={foto.caption || nomeDaRua}
                className="aspect-[4/3] w-full object-cover"
                loading="lazy"
              />
            </button>
            <figcaption><LegendaFoto foto={foto} /></figcaption>
          </figure>
        ))}
      </div>

      {fotos.length > 1 && (
        <div className="flex items-center justify-center gap-1.5 py-4">
          {fotos.map((foto, indice) => (
            <button
              key={`ponto-${foto.url}-${indice}`}
              type="button"
              onClick={() => irPara(indice)}
              aria-label={`Ir para a imagem ${indice + 1}`}
              className={`h-1.5 rounded-full transition-all ${indice === ativo ? 'w-5 bg-brand' : 'w-1.5 bg-edge-subtle'}`}
            />
          ))}
        </div>
      )}
    </>
  );
};

const GradeFotos = ({ fotos, nomeDaRua, onAbrir }) => (
  <div className="grid gap-4 px-4 pb-5 sm:grid-cols-2 sm:px-5 lg:grid-cols-3">
    {fotos.map((foto, indice) => (
      <figure key={`${foto.url}-${indice}`}>
        <button
          type="button"
          onClick={() => onAbrir(indice)}
          className="block w-full overflow-hidden rounded-2xl bg-surface-subtle"
          aria-label={`Abrir ${foto.caption || nomeDaRua} em tela cheia`}
        >
          <img src={foto.url} alt={foto.caption || nomeDaRua} className="aspect-[4/3] w-full object-cover" loading="lazy" />
        </button>
        <figcaption><LegendaFoto foto={foto} /></figcaption>
      </figure>
    ))}
  </div>
);

/* --- Documentos --- */

const LinhaDocumento = ({ documento }) => {
  const selo = [documento.type, documento.size].filter(Boolean).join(' • ');

  return (
    <a
      href={documento.url}
      target="_blank"
      rel="noreferrer"
      className="flex items-center gap-3 rounded-2xl border border-edge-subtle bg-surface-sunken p-3 transition-colors hover:border-brand"
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-subtleBg text-brand-subtleFg">
        <FileText className="h-5 w-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-bold text-content-primary">
          {documento.title || 'Documento'}
        </span>
        {documento.description && (
          <span className="mt-0.5 block truncate text-xs text-content-tertiary">{documento.description}</span>
        )}
      </span>
      {selo && <span className="hidden shrink-0 text-xs font-semibold text-content-tertiary sm:block">{selo}</span>}
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-edge-subtle text-content-secondary">
        <Download className="h-4 w-4" />
      </span>
    </a>
  );
};

const DOCUMENTOS_VISIVEIS = 3;

/** As fotos no formato que o MediaViewer lê. */
const paraOVisor = (fotos) => fotos.map((foto) => ({
  type: 'photo',
  url: foto.url,
  description: foto.caption,
  name: formatarDataBr(foto.date),
}));

/* --- A página --- */

export default function PavementStreetPage() {
  const { streetId } = useParams();
  const [street, setStreet] = useState(null);
  const [localidade, setLocalidade] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [todasAsFotos, setTodasAsFotos] = useState(false);
  const [todosOsDocumentos, setTodosOsDocumentos] = useState(false);
  // `null` = fechado. Guarda a lista E o índice porque o retrato do homenageado
  // abre sozinho, fora da galeria da rua.
  const [visor, setVisor] = useState(null);
  const [editando, setEditando] = useState(false);
  const [bairros, setBairros] = useState([]);
  // Nome do bairro de cada CEP, por id. Consulta propria porque o `select` da
  // rua so traz o bairro DELA, e um CEP pode apontar para outro.
  const [bairroDoCep, setBairroDoCep] = useState({});

  const { canManage, isPureAmbassador, myActiveCityIds } = useCanManagePavement(street?.city_id);
  // Minha Rua: o que esta acontecendo na regiao agora. A rua nunca guarda
  // copia do acontecimento — ela PERGUNTA (regra 3 do plano).
  const { eventos: acontecimentos, carregando: carregandoAcontecimentos } = useStreetCityEvents(street?.id);

  const carregarRua = useCallback(async () => {
    setLoading(true);
    // A ROTA ACEITA SLUG E ID
    //
    // O endereço novo é `/rua/rua-pastor-domicio-afonso-dos-santos`, mas o id
    // continua valendo: há link de uuid em conversa de WhatsApp, em ofício e em
    // print de tela, e nenhum deles pode virar 404 porque a URL ficou bonita.
    //
    // O formato decide qual coluna consultar — um uuid nunca é um slug válido
    // (slug não tem hífen em posição fixa nem 36 caracteres de hexadecimal), e
    // um slug nunca passa por `eq('id', ...)` sem o Postgres reclamar de tipo.
    const ehUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(streetId || '');

    const { data, error } = await supabase
      .from('pavement_streets')
      .select('*, bairro:bairros!pavement_streets_bairro_id_fkey(name)')
      .eq(ehUuid ? 'id' : 'slug', streetId)
      .maybeSingle();

    setLoading(false);
    if (error) {
      showAppError({ title: 'Erro ao carregar a rua', description: error.message });
      setNotFound(true);
      return;
    }
    if (!data) {
      setNotFound(true);
      return;
    }
    setStreet({ ...data, location: parseLocation(data.location) });

    // A cidade vem numa consulta À PARTE, e de propósito.
    //
    // Ela só alimenta o "PE" do chip do topo. Pendurá-la no `select` acima
    // faria uma falha de relacionamento derrubar a página inteira por causa
    // de duas letras — aqui, se não vier, o chip mostra só o bairro.
    if (!data.city_id) return;
    const { data: cidade } = await supabase
      .from('cities')
      .select('name, states(uf)')
      .eq('id', data.city_id)
      .maybeSingle();
    if (cidade) setLocalidade({ nome: cidade.name, uf: cidade.states?.uf || '' });
  }, [streetId]);

  useEffect(() => { carregarRua(); }, [carregarRua]);

  // Os bairros que os CEPs apontam. Uma rua comprida tem um CEP por trecho, e
  // cada trecho pode ser de um bairro diferente do bairro principal da rua —
  // que é o único que o `select` da rua traz.
  useEffect(() => {
    const ids = [...new Set(cepsDaRua(street).map((c) => c.bairroId).filter(Boolean))];
    if (ids.length === 0) { setBairroDoCep({}); return; }
    let cancelado = false;
    supabase.from('bairros').select('id, name').in('id', ids).then(({ data }) => {
      if (cancelado) return;
      setBairroDoCep(Object.fromEntries((data || []).map((b) => [b.id, b.name])));
    });
    return () => { cancelado = true; };
  }, [street]);

  // Só quem pode editar paga a busca de bairros — visitante não usa a lista.
  useEffect(() => {
    if (!canManage) { setBairros([]); return; }
    let cancelled = false;
    supabase.from('bairros').select('*').order('name').then(({ data }) => {
      if (!cancelled) setBairros(data || []);
    });
    return () => { cancelled = true; };
  }, [canManage]);

  const fotos = useMemo(() => normalizarFotos(street), [street]);
  const documentos = useMemo(() => normalizarDocumentos(street), [street]);

  const capa = capaDaRua(fotos);
  const fotoDoHomenageado = fotos.find((foto) => foto.subject === 'honoree');
  // Mesma função que decide a capa e o popup do mapa: a destacada primeiro, e
  // só fotos com subject 'street' — sem isso a galeria divergia das outras
  // duas telas tanto na ordem quanto em qual foto conta como "da rua".
  const fotosDaRua = fotosDaRuaOrdenadas(fotos);

  const honoreeName = textoLimpo(street?.honoree_name);
  const biography = textoLimpo(street?.biography);
  const curiosities = textoLimpo(street?.curiosities);
  const bairroName = textoLimpo(street?.bairro?.name);
  // A rua pode ter um CEP por trecho — mostrar so o primeiro esconderia
  // exatamente a informacao que quem procura o endereco veio buscar.
  const ceps = cepsDaRua(street);
  const nomeDoHomenageadoRepete = nomeRedundante(street?.name, honoreeName);
  const pavementStatus = statusLabel(street);
  const atualizadoEm = formatarDataBr(street?.updated_at);

  // O BAIRRO APARECE UMA VEZ SÓ
  //
  // O chip do topo mostrava o bairro, e logo abaixo cada chip de CEP mostra o
  // bairro do seu trecho — em rua de um CEP só, a mesma palavra saía duas vezes
  // com dois ícones diferentes, parecendo dois dados distintos.
  //
  // Quando algum CEP já carrega o bairro, o chip do topo passa a mostrar a
  // CIDADE, que é a informação que faltava ali (a página não dizia em que
  // município a rua fica). Sem CEP cadastrado, ele continua mostrando o bairro:
  // some a repetição, não a informação.
  const bairroJaApareceNosCeps =
    Boolean(bairroName) && ceps.some((c) => textoLimpo(bairroDoCep[c.bairroId]) === bairroName);
  const local = [
    bairroJaApareceNosCeps ? localidade?.nome : (bairroName || localidade?.nome),
    localidade?.uf,
  ].filter(Boolean).join(', ');
  const routeUrl = street?.location
    ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${street.location.lat},${street.location.lng}`)}&travelmode=driving`
    : null;

  const documentosVisiveis = todosOsDocumentos ? documentos : documentos.slice(0, DOCUMENTOS_VISIVEIS);

  if (loading) {
    return <div className="min-h-[55vh] flex items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-brand" /></div>;
  }

  if (notFound || !street) {
    return (
      <div className="container max-w-3xl mx-auto px-4 py-16 text-center">
        <h1 className="text-2xl font-bold text-content-primary">Rua não encontrada</h1>
        <Button asChild variant="outline" className="mt-5"><Link to="/mapa-pavimentacao">Voltar ao mapa</Link></Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface-base pb-12">
      <Helmet>
        <title>{street.name} — História da rua | Trombone Cidadão</title>
        <meta name="description" content={biography || `Conheça a história e a localização de ${street.name}.`} />
      </Helmet>

      {/* A CAPA
          A foto da rua entra desbotada atrás do título, com um gradiente que
          termina na cor de fundo da página: sem esse degradê a imagem corta
          numa linha reta e o topo vira um banner colado, não uma capa. */}
      <header className="relative overflow-hidden">
        {capa && (
          <img
            src={capa.url}
            alt=""
            aria-hidden="true"
            className="absolute inset-0 h-full w-full object-cover opacity-20"
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-b from-surface-base/50 via-surface-base/80 to-surface-base" />

        <div className="relative mx-auto max-w-3xl px-4 pb-8 pt-4">
          <div className="flex items-center justify-between gap-2">
            <BackButton paraOnde="/mapa-pavimentacao" className="-ml-3" />
            <div className="flex items-center gap-2">
              <FollowAreaButton
                areaType="street"
                areaId={street.id}
                cityId={street.city_id}
                nome={street.name}
                tamanho="sm"
              />
              {/* A história da rua é o conteúdo mais compartilhável do app:
                  quem descobre quem foi o homenageado manda para o grupo da
                  família e para o bairro. Sem botão, o caminho era copiar da
                  barra de endereço — que no app nativo nem aparece. */}
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 shrink-0 rounded-full"
                aria-label="Compartilhar esta rua"
                title="Compartilhar"
                onClick={() => compartilharLink({
                  title: street.name,
                  text: honoreeName
                    ? `${street.name} — a história de ${honoreeName}, no Trombone Cidadão.`
                    : `${street.name}${local ? ` — ${local}` : ''}, no Trombone Cidadão.`,
                  url: getStreetShareUrl(street),
                })}
              >
                <Share2 className="h-4 w-4" />
              </Button>
            {canManage && (
              <Button
                size="sm"
                variant="outline"
                className="shrink-0 gap-1.5 rounded-full"
                onClick={() => setEditando(true)}
              >
                <Pencil className="h-3.5 w-3.5" /> Editar
              </Button>
            )}
            </div>
          </div>

          {/* O RETRATO DO HOMENAGEADO FICA AO LADO DO NOME
              A rua leva o nome de alguém, e até aqui esse alguém só aparecia
              lá embaixo, dentro do cartão de biografia — depois do mapa, das
              broncas e do status de pavimentação. Quem abre "Rua Pastor Domício
              Afonso dos Santos" quer ver o Pastor Domício.
              A foto da RUA continua sendo a capa ao fundo: são coisas
              diferentes, e por isso `capaDaRua` só considera `subject: 'street'`. */}
          <div className="mt-2 flex items-start gap-4">
            {fotoDoHomenageado?.url && (
              <img
                src={fotoDoHomenageado.url}
                alt={honoreeName ? `Retrato de ${honoreeName}` : 'Retrato do homenageado'}
                loading="lazy"
                className="h-20 w-20 shrink-0 rounded-full object-cover ring-2 ring-surface-raised shadow-lg sm:h-24 sm:w-24"
              />
            )}
            <div className="min-w-0">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand">Minha rua</p>
              <h1 className="mt-1 text-3xl font-extrabold leading-tight text-content-primary sm:text-4xl">{street.name}</h1>
              {fotoDoHomenageado?.url && honoreeName && !nomeDoHomenageadoRepete && (
                <p className="mt-1 text-sm text-content-secondary">{honoreeName}</p>
              )}
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2 text-sm">
            {local && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-raised/80 px-3 py-1.5 font-semibold text-content-secondary ring-1 ring-edge-subtle">
                <MapPin className="h-4 w-4 text-brand" /> {local}
              </span>
            )}
            {atualizadoEm && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-raised/80 px-3 py-1.5 font-semibold text-content-secondary ring-1 ring-edge-subtle">
                <Calendar className="h-4 w-4 text-brand" /> Atualizado em {atualizadoEm}
              </span>
            )}
            {pavementStatus && (
              <span className="inline-flex items-center rounded-full bg-surface-raised/80 px-3 py-1.5 font-semibold text-content-secondary ring-1 ring-edge-subtle">
                {pavementStatus}
              </span>
            )}
            {street.paving_date && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-raised/80 px-3 py-1.5 font-semibold text-content-secondary ring-1 ring-edge-subtle">
                <Calendar className="h-4 w-4 text-brand" /> Pavimentada em {formatarDataBr(street.paving_date)}
              </span>
            )}
            {street.work_id && (
              <Link
                to={`/obras-publicas/${street.work_id}`}
                className="inline-flex items-center gap-1.5 rounded-full bg-surface-raised/80 px-3 py-1.5 font-semibold text-brand ring-1 ring-edge-subtle transition-colors hover:bg-surface-subtle"
              >
                <HardHat className="h-4 w-4" /> Ver obra vinculada
              </Link>
            )}
            {street.is_unnamed && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50/90 px-3 py-1.5 font-semibold text-amber-800 ring-1 ring-amber-300">
                <HelpCircle className="h-4 w-4" /> Sem nome oficial
              </span>
            )}
            {/* CADA CEP DIZ A QUE TRECHO PERTENCE.
                Uma rua comprida atravessa bairro, e o cadastro já guarda o
                bairro de cada faixa — a tela é que mostrava só o número. Numa
                rua com dois CEPs em dois bairros, o chip sem o nome do bairro
                fazia parecer que a rua tinha dois CEPs pelo mesmo trecho. */}
            {ceps.map((c) => (
              <span
                key={c.cep}
                className="inline-flex items-center gap-1.5 rounded-full bg-surface-raised/80 px-3 py-1.5 font-semibold text-content-secondary ring-1 ring-edge-subtle"
              >
                CEP {c.cep}
                {bairroDoCep[c.bairroId] && (
                  <span className="font-medium text-content-tertiary">· {bairroDoCep[c.bairroId]}</span>
                )}
              </span>
            ))}
          </div>
        </div>
      </header>

      {/* MINHA RUA COMECA PELA SITUACAO, NAO PELA HISTORIA
          Quem abre esta pagina hoje quase sempre veio do push de um alerta ou
          da busca por "esta faltando agua na minha rua?". A biografia do
          homenageado continua abaixo, inteira — mas depois da resposta.
          A faixa some sozinha quando o acontecimento e resolvido: ela e uma
          consulta ao evento regional, nao uma copia dele. */}
      <div className="mx-auto mb-4 max-w-3xl space-y-3 px-4">
        <StreetEventBanner eventos={acontecimentos} carregando={carregandoAcontecimentos} />
        <StreetSummary
          streetId={street.id}
          cityId={street.city_id}
          aoVerFotos={() => setTodasAsFotos(true)}
        />
      </div>

      <main className="mx-auto max-w-3xl space-y-4 px-4">
        {/* Pavimentação cidadã (fase 3, §36.7). Fica no topo do conteúdo
            porque é a única coisa desta página que só quem está NA RUA pode
            fazer — e ela some sozinha para quem não está. */}
        <SugerirClassificacao rua={street} onEnviada={carregarRua} />

        {(honoreeName || biography || fotoDoHomenageado) && (
          <Cartao icone={BookOpen} titulo="Quem dá nome à rua">
            <div className={`px-4 pb-5 sm:px-5 ${fotoDoHomenageado ? 'flex gap-4' : ''}`}>
              {fotoDoHomenageado && (
                <button
                  type="button"
                  onClick={() => setVisor({ fotos: [fotoDoHomenageado], indice: 0 })}
                  className={`shrink-0 overflow-hidden rounded-2xl bg-surface-subtle ${
                    nomeDoHomenageadoRepete ? 'w-32 sm:w-40' : 'w-24 sm:w-32'
                  }`}
                  aria-label="Abrir a foto do homenageado em tela cheia"
                >
                  <img
                    src={fotoDoHomenageado.url}
                    alt={fotoDoHomenageado.caption || honoreeName || 'Foto do homenageado'}
                    className="aspect-[4/5] w-full object-cover"
                  />
                </button>
              )}
              <div className="min-w-0 flex-1">
                {/* O NOME SÓ APARECE QUANDO ACRESCENTA ALGUMA COISA.
                    "Rua Maria Elianete dos Santos Lima" logo acima e "Maria
                    Elianete dos Santos Lima" aqui gastam duas linhas para dizer
                    o mesmo. Quando o título já carrega o nome, o cartão fica
                    com o que só ele tem: a foto — que cresce — e a biografia. */}
                {honoreeName && !nomeDoHomenageadoRepete && (
                  <p className="mb-2 text-xl font-bold text-content-primary">{honoreeName}</p>
                )}
                {biography && <TextoExpansivel texto={biography} />}
              </div>
            </div>
          </Cartao>
        )}

        {curiosities && (
          <Cartao icone={Sparkles} titulo="Curiosidades">
            <div className="px-4 pb-5 sm:px-5">
              <TextoExpansivel texto={curiosities} />
            </div>
          </Cartao>
        )}

        {fotosDaRua.length > 0 && (
          <Cartao
            icone={ImageIcon}
            titulo="Imagens da rua"
            acao={fotosDaRua.length > 1 && (
              <BotaoVerTodas aberto={todasAsFotos} onClick={() => setTodasAsFotos((valor) => !valor)} />
            )}
          >
            {todasAsFotos
              ? <GradeFotos fotos={fotosDaRua} nomeDaRua={street.name} onAbrir={(i) => setVisor({ fotos: fotosDaRua, indice: i })} />
              : <CarrosselFotos fotos={fotosDaRua} nomeDaRua={street.name} onAbrir={(i) => setVisor({ fotos: fotosDaRua, indice: i })} />}
          </Cartao>
        )}

        {documentos.length > 0 && (
          <Cartao
            icone={FileText}
            titulo="Documentos"
            acao={documentos.length > DOCUMENTOS_VISIVEIS && (
              <BotaoVerTodas aberto={todosOsDocumentos} onClick={() => setTodosOsDocumentos((valor) => !valor)} />
            )}
          >
            <div className="grid gap-2 px-4 pb-5 sm:px-5">
              {documentosVisiveis.map((documento, indice) => (
                <LinhaDocumento key={`${documento.url}-${indice}`} documento={documento} />
              ))}
            </div>
          </Cartao>
        )}

        {/* ONDE FICA
            "Traçar rota" continua sendo o mesmo link de direções do Google
            Maps de antes — só mudou de lugar: virou a ação do cartão, na mesma
            posição que "Ver todas" ocupa nos outros. Ele parte da coordenada
            cadastrada, e é por isso que funciona para rua que mapa comercial
            ainda não conhece. */}
        {street.location && (
          <Cartao
            icone={Navigation}
            titulo="Onde fica"
            acao={routeUrl && (
              <Button asChild size="sm" className="h-8 shrink-0 gap-1.5 rounded-full px-3 text-xs font-bold">
                <a href={routeUrl} target="_blank" rel="noreferrer">
                  <Navigation className="h-3.5 w-3.5" /> Traçar rota
                </a>
              </Button>
            )}
          >
            <p className="px-4 pb-4 text-sm text-content-tertiary sm:px-5">
              A rota usa a coordenada cadastrada, mesmo que a rua ainda não conste nos mapas comerciais.
            </p>
            <div className="h-64 w-full">
              <MapContainer
                center={[street.location.lat, street.location.lng]}
                zoom={17}
                scrollWheelZoom={false}
                className="h-full w-full"
              >
                <MapBaseLayer />
                <CircleMarker
                  center={[street.location.lat, street.location.lng]}
                  radius={9}
                  pathOptions={{ color: '#fff', weight: 3, fillColor: '#dc2626', fillOpacity: 1 }}
                />
              </MapContainer>
            </div>
          </Cartao>
        )}
      </main>

      <PavementEditModal
        street={editando ? street : null}
        onSave={async (streetToSave) => {
          const ok = await savePavementStreet({
            supabase,
            streetToSave,
            bairros,
            isScopedAmbassador: isPureAmbassador,
            myActiveCityIds,
          });
          if (ok) {
            setEditando(false);
            await carregarRua();
          }
          return ok;
        }}
        onClose={() => setEditando(false)}
        bairros={bairros}
        existingStreets={[]}
        defaultCityId={street?.city_id || null}
        fallbackCityCenter={localidade ? { name: localidade.nome, uf: localidade.uf } : null}
        onBairroCreated={(novo) => setBairros((prev) => [...prev, novo])}
      />

      {visor && (
        <MediaViewer
          media={paraOVisor(visor.fotos)}
          startIndex={visor.indice}
          onClose={() => setVisor(null)}
        />
      )}
    </div>
  );
}

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Helmet } from 'react-helmet';
import { Link, useParams } from 'react-router-dom';
import { compartilharLink } from '@/lib/shareLink';
import { getStreetShareUrl } from '@/lib/shareUtils';
import { baixarPlacaDaRua } from '@/lib/streetSignPdf';
import { linhasDoTracado } from '@/lib/streetGeometry';
import { CircleMarker, MapContainer } from 'react-leaflet';
import {
  BookOpen,
  ChevronDown,
  ChevronRight,
  Download,
  FileText,
  HardHat,
  HelpCircle,
  Image as ImageIcon,
  Info,
  Loader2,
  MapPin,
  Megaphone,
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
//
// E É POR ISSO QUE A PÁGINA TEM UMA COLUNA DE LEITURA, E NÃO UMA GRADE
//
// A versão anterior espalhava os cartões em três arranjos diferentes: uma grade
// de duas colunas para biografia e mapa, uma faixa `auto-fit` para os quatro
// cartões auxiliares, e a atividade em largura inteira. Com o cadastro completo
// aquilo se fechava; com o cadastro real, não. O mapa tinha 34rem de altura ao
// lado de uma biografia de 12rem e deixava meia tela em branco; a faixa
// `auto-fit` punha lado a lado um cartão de duas coordenadas e uma galeria de
// fotos, cada um terminando numa altura diferente.
//
// A regra agora é uma só: TUDO O QUE SE LÊ DESCE NUMA COLUNA, na ordem de
// importância, e a lateral guarda a FICHA — os dados de consulta (CEP, situação,
// obra, coordenadas, atualização) que antes disputavam o topo como pastilhas
// soltas. A coluna de leitura tem sempre um piso ("Broncas e obras" existe para
// qualquer rua), então ela nunca é mais curta que a lateral. E cada bloco
// opcional é filho DIRETO da grade, sem `div` de embrulho: assim o `gap` some
// junto com o bloco, em vez de virar buraco.

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
 * O texto longo da rua — biografia e curiosidades.
 *
 * SEM CORTE E SEM "VER MAIS"
 *
 * Ele já foi cortado em quatro linhas, com um botão que media o transbordo do
 * elemento a cada redimensionamento para decidir se aparecia. Duas coisas
 * estavam erradas nisso. A primeira é de conteúdo: a biografia do homenageado é
 * o motivo pelo qual esta página existe — escondê-la atrás de um clique é
 * esconder justamente o que a pessoa veio ler, para poupar uma rolagem que ela
 * faria de qualquer jeito. A segunda é de layout: um bloco que muda de altura
 * ao ser aberto empurra tudo o que vem abaixo, e numa página montada por
 * blocos opcionais isso significa a tela inteira dançando a cada toque.
 *
 * `whitespace-pre-line` preserva os parágrafos que quem cadastrou escreveu; a
 * largura de leitura é limitada por quem chama, e não aqui.
 */
const TextoDaRua = ({ texto }) => (
  <p className="whitespace-pre-line text-[0.95rem] leading-relaxed text-content-secondary">
    {texto}
  </p>
);

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

// O TÍTULO DO DOCUMENTO COSTUMA SER UM NOME DE ARQUIVO
//
// O formulário preenche o título com o nome do arquivo escolhido, e nome de
// arquivo não tem espaço: "prancha_projeto_11125_rev_28_unifilar" é UMA palavra
// de 37 caracteres para o navegador. Numa linha de `flex`, essa palavra empurra
// o resto — o selo do formato e o botão de baixar saíam para fora do cartão e
// eram cortados pela borda.
//
// `break-words` quebra a palavra só quando ela não cabe (título normal continua
// quebrando por espaço), e `line-clamp-2` põe teto de duas linhas para um nome
// gigante não empurrar a lista toda. O selo do formato desceu para a segunda
// linha, junto do subtítulo: como item fixo na linha principal, ele disputava
// largura com o nome e ainda sumia abaixo de 640px (`hidden sm:block`).
const LinhaDocumento = ({ documento }) => {
  const selo = [documento.type, documento.size].filter(Boolean).join(' • ');
  const segundaLinha = [documento.description, selo].filter(Boolean).join(' · ');

  return (
    <a
      href={documento.url}
      target="_blank"
      rel="noreferrer"
      className="flex w-full min-w-0 items-center gap-3 rounded-2xl border border-edge-subtle bg-surface-sunken p-3 transition-colors hover:border-brand"
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-subtleBg text-brand-subtleFg">
        <FileText className="h-5 w-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="line-clamp-2 break-words text-sm font-bold text-content-primary">
          {documento.title || 'Documento'}
        </span>
        {segundaLinha && (
          <span className="mt-0.5 block truncate text-xs text-content-tertiary">{segundaLinha}</span>
        )}
      </span>
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

/* --- A ficha --- */

// UMA LINHA DA FICHA: RÓTULO À ESQUERDA, VALOR À DIREITA
//
// Estes dados estavam todos como pastilhas no topo — cidade, pavimento, data,
// obra, CEP, coordenadas —, e ali eles competiam com o nome da rua e entre si:
// oito pastilhas do mesmo tamanho não têm hierarquia nenhuma, e as duas que
// carregavam AÇÃO ("Baixar placa") pareciam iguais às seis que só informavam.
// Como ficha, cada dado ganha rótulo, o valor fica alinhado numa coluna só, e a
// ação vira botão de verdade.
const LinhaDaFicha = ({ rotulo, children }) => (
  <div className="flex items-baseline justify-between gap-4 py-2.5">
    <dt className="shrink-0 text-xs font-semibold text-content-tertiary">{rotulo}</dt>
    <dd className="min-w-0 text-right text-sm font-semibold text-content-primary">{children}</dd>
  </div>
);

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
  const [baixandoPlaca, setBaixandoPlaca] = useState(null);

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
  const extremos = useMemo(() => {
    const linhas = linhasDoTracado(street);
    const pontos = linhas.flat();
    if (pontos.length >= 2) {
      const [inicioLng, inicioLat] = pontos[0];
      const [fimLng, fimLat] = pontos[pontos.length - 1];
      return { inicio: { lat: inicioLat, lng: inicioLng }, fim: { lat: fimLat, lng: fimLng } };
    }
    return street?.location ? { inicio: street.location, fim: street.location } : null;
  }, [street]);

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

  const baixarPlaca = async (cep) => {
    setBaixandoPlaca(cep);
    try {
      await baixarPlacaDaRua({
        nome: street.name,
        cep,
        bairro: bairroDoCep[ceps.find((item) => item.cep === cep)?.bairroId] || bairroName,
        cidade: [localidade?.nome, localidade?.uf].filter(Boolean).join(' - '),
        url: getStreetShareUrl(street),
      });
    } catch (error) {
      showAppError({ title: 'Não foi possível gerar a placa', description: error.message });
    } finally {
      setBaixandoPlaca(null);
    }
  };

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

  // O QUE CADA COLUNA TEM PARA MOSTRAR
  //
  // A coluna estreita é de CONSULTA: onde a rua fica e a ficha dela. A larga é
  // de LEITURA: o que alguém escreveu ou fotografou sobre a rua, mais a
  // atividade. Nenhuma das duas tem estado vazio — quando não há o que pôr numa
  // delas, ela simplesmente não existe.
  const temReferenciaGeografica = Boolean(street.is_unnamed && extremos);
  const temFicha = Boolean(
    local || pavementStatus || street.paving_date || street.work_id ||
    ceps.length > 0 || temReferenciaGeografica || atualizadoEm
  );
  const temHistoria = Boolean(honoreeName || biography || fotoDoHomenageado);
  const temConsulta = Boolean(street.location) || temFicha;

  // DUAS COLUNAS SÓ QUANDO A LARGA TEM CORPO PARA SUSTENTÁ-LAS
  //
  // "Broncas e obras" sozinho tem uns 350px; o mapa mais a ficha passam de 700.
  // Numa rua sem biografia, sem foto e sem documento — que é a maioria — abrir
  // duas colunas produziria o mesmo buraco de antes, só que espelhado: meia tela
  // em branco à ESQUERDA. Sem esse corpo, tudo desce numa coluna só, e aí não
  // existe coluna curta ao lado de coluna comprida.
  const emDuasColunas = temConsulta && (temHistoria || fotosDaRua.length > 0 || documentos.length > 0);

  // ── A COLUNA DE CONSULTA ──
  const consulta = (
    <>
      {/* ONDE FICA
          O mapa é pequeno e fica na lateral, junto da ficha: ele responde "é
          esta rua mesmo?" e "por onde eu chego?" — duas perguntas de relance.
          Ele já ocupou 34rem de altura numa coluna própria, e o preço era a
          página inteira ser tão alta quanto ele.
          "Traçar rota" parte da coordenada cadastrada, e é por isso que funciona
          para rua que mapa comercial ainda não conhece. */}
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
          <div className="h-56 w-full sm:h-64">
            <MapContainer
              center={[street.location.lat, street.location.lng]}
              zoom={16}
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

          {/* A ressalva vem DEPOIS do mapa: antes dele, ela era a primeira coisa
              lida num cartão cujo assunto é a imagem. */}
          <p className="px-4 py-3 text-xs leading-relaxed text-content-tertiary sm:px-5">
            A rota usa a coordenada cadastrada, mesmo que a rua ainda não conste
            nos mapas comerciais.
          </p>
        </Cartao>
      )}

      {temFicha && (
        <Cartao icone={Info} titulo="Ficha da rua">
          <dl className="divide-y divide-edge-subtle px-4 pb-4 sm:px-5">
            {local && <LinhaDaFicha rotulo="Onde fica">{local}</LinhaDaFicha>}

            {pavementStatus && (
              <LinhaDaFicha rotulo="Pavimentação">{pavementStatus}</LinhaDaFicha>
            )}

            {street.paving_date && (
              <LinhaDaFicha rotulo="Pavimentada em">{formatarDataBr(street.paving_date)}</LinhaDaFicha>
            )}

            {street.work_id && (
              <LinhaDaFicha rotulo="Obra">
                <Link
                  to={`/obras-publicas/${street.work_id}`}
                  className="inline-flex items-center gap-1.5 font-bold text-brand hover:underline"
                >
                  <HardHat className="h-3.5 w-3.5" /> Ver obra vinculada
                </Link>
              </LinhaDaFicha>
            )}

            {/* CADA CEP DIZ A QUE TRECHO PERTENCE.
                Uma rua comprida atravessa bairro, e o cadastro já guarda o
                bairro de cada faixa — a tela é que mostrava só o número. Numa
                rua com dois CEPs em dois bairros, o chip sem o nome do bairro
                fazia parecer que a rua tinha dois CEPs pelo mesmo trecho. */}
            {ceps.map((c) => (
              <div key={c.cep} className="py-2.5">
                <div className="flex items-baseline justify-between gap-4">
                  <dt className="shrink-0 text-xs font-semibold text-content-tertiary">CEP</dt>
                  <dd className="min-w-0 text-right">
                    <span className="block text-sm font-semibold tabular-nums text-content-primary">
                      {c.cep}
                    </span>
                    {bairroDoCep[c.bairroId] && (
                      <span className="block text-xs text-content-tertiary">
                        {bairroDoCep[c.bairroId]}
                      </span>
                    )}
                  </dd>
                </div>

                <button
                  type="button"
                  onClick={() => baixarPlaca(c.cep)}
                  disabled={baixandoPlaca === c.cep}
                  className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-xl border border-edge-subtle px-3 py-2 text-xs font-bold text-brand transition-colors hover:bg-surface-subtle disabled:opacity-60"
                  title="Baixar placa da rua em PDF"
                >
                  {baixandoPlaca === c.cep
                    ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    : <Download className="h-3.5 w-3.5" />}
                  Baixar placa da rua
                </button>
              </div>
            ))}

            {/* A REFERÊNCIA GEOGRÁFICA SÓ EXISTE PARA RUA SEM NOME
                Ela era um cartão inteiro, do tamanho dos outros, para duas
                coordenadas — e ficava ao lado de "Curiosidades" com o dobro da
                altura dele. Como duas linhas da ficha, o dado continua inteiro e
                some a moldura que ele não precisava. */}
            {temReferenciaGeografica && (
              <div className="py-2.5">
                <dt className="text-xs font-semibold text-content-tertiary">
                  Referência para denominação
                </dt>
                <dd className="mt-1.5 grid gap-1.5">
                  {[
                    { rotulo: 'Início', ponto: extremos.inicio },
                    { rotulo: 'Fim', ponto: extremos.fim },
                  ].map(({ rotulo, ponto }) => (
                    <span
                      key={rotulo}
                      className="flex items-baseline justify-between gap-2 rounded-xl bg-surface-sunken px-2.5 py-1.5"
                    >
                      <span className="text-xs text-content-tertiary">{rotulo}</span>
                      <span className="font-mono text-xs font-semibold text-content-primary">
                        {ponto.lat.toFixed(6)}, {ponto.lng.toFixed(6)}
                      </span>
                    </span>
                  ))}
                </dd>
              </div>
            )}

            {atualizadoEm && (
              <LinhaDaFicha rotulo="Atualizada em">{atualizadoEm}</LinhaDaFicha>
            )}
          </dl>
        </Cartao>
      )}
    </>
  );

  // ── A COLUNA DE LEITURA ──
  const leitura = (
    <>
      <SugerirClassificacao rua={street} onEnviada={carregarRua} />

      {temHistoria && (
        <Cartao icone={BookOpen} titulo="Quem dá nome à rua">
          {/* NO CELULAR O RETRATO FICA EM CIMA, E O TEXTO ABAIXO
              Lado a lado num telefone, a foto come 112px de uma coluna de 320 e
              a biografia desce em tiras de vinte caracteres — nome próprio
              quebrando no meio a cada duas linhas. Empilhado, o retrato fica
              maior (o rosto do homenageado é o assunto) e o texto usa a largura
              inteira. A partir de `sm` a coluna comporta os dois lado a lado, e
              aí a foto volta para o lado — e cresce junto com a coluna, até
              18rem, porque numa coluna de 1000px um retrato de 11rem parecia
              miniatura de cadastro, e não o retrato de quem dá nome à rua.

              `items-start`: sem isso o retrato é um item de flex esticado, e a
              caixa dele acompanharia a altura do texto ao lado. */}
          <div className={`px-4 pb-5 sm:px-5 ${fotoDoHomenageado ? 'sm:flex sm:items-start sm:gap-5' : ''}`}>
            {fotoDoHomenageado && (
              <button
                type="button"
                onClick={() => setVisor({ fotos: [fotoDoHomenageado], indice: 0 })}
                className="mb-4 block w-40 shrink-0 overflow-hidden rounded-2xl bg-surface-subtle sm:mb-0 sm:w-44 lg:w-64 xl:w-72"
                aria-label="Abrir a foto do homenageado em tela cheia"
              >
                <img
                  src={fotoDoHomenageado.url}
                  alt={fotoDoHomenageado.caption || honoreeName || 'Foto do homenageado'}
                  className="aspect-[4/5] w-full object-cover"
                />
              </button>
            )}

            {/* A LINHA DE LEITURA TEM TETO
                A coluna passa de 1000px num monitor grande, e uma biografia com
                1000px de linha cansa antes do segundo parágrafo. */}
            <div className="min-w-0 flex-1 lg:max-w-[70ch]">
              {/* O NOME SÓ APARECE QUANDO ACRESCENTA ALGUMA COISA.
                  "Rua Maria Elianete dos Santos Lima" logo acima e "Maria
                  Elianete dos Santos Lima" aqui gastam duas linhas para dizer o
                  mesmo. */}
              {honoreeName && !nomeDoHomenageadoRepete && (
                <p className="mb-2 text-xl font-bold text-content-primary">{honoreeName}</p>
              )}
              {biography && <TextoDaRua texto={biography} />}
            </div>
          </div>
        </Cartao>
      )}

      {curiosities && (
        <Cartao icone={Sparkles} titulo="Curiosidades">
          <div className="px-4 pb-5 sm:px-5 lg:max-w-[70ch]">
            <TextoDaRua texto={curiosities} />
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

      {/* A atividade fecha a página: é o único cartão que existe para qualquer
          rua, então ele também é o piso da coluna. */}
      <Cartao icone={Megaphone} titulo="Broncas e obras nesta rua">
        <div className="px-4 pb-5 sm:px-5">
          <StreetSummary streetId={street.id} />
        </div>
      </Cartao>
    </>
  );

  return (
    <div className="min-h-screen bg-surface-base pb-12">
      <Helmet>
        <title>{street.name} — História da rua | Trombone Cidadão</title>
        <meta name="description" content={biography || `Conheça a história e a localização de ${street.name}.`} />
      </Helmet>

      {/* ── A CAPA ──
          A foto da rua entra desbotada atrás do título, com um gradiente que
          termina na cor de fundo da página: sem esse degradê a imagem corta numa
          linha reta e o topo vira um banner colado, não uma capa.

          SEM FOTO, O TOPO NÃO QUEBRA: sobra o degradê sobre a cor da página, que
          é exatamente o fundo que ele já teria. */}
      <header className="relative overflow-hidden">
        {capa && (
          <img
            src={capa.url}
            alt=""
            aria-hidden="true"
            className="absolute inset-0 h-full w-full object-cover opacity-60"
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-b from-surface-base/40 via-surface-base/70 to-surface-base" />

        <div className="relative mx-auto w-full max-w-[100rem] px-4 pb-7 pt-4 sm:px-5 lg:px-8 2xl:px-10">
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

          {/* A capa identifica o lugar; o retrato fica junto da biografia para
              não repetir a mesma imagem em dois pontos próximos. */}
          <div className="mt-2 min-w-0">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand">Minha rua</p>
            <h1 className="mt-1 text-3xl font-extrabold leading-tight text-content-primary sm:text-4xl">{street.name}</h1>
          </div>

          {/* NO TOPO FICA SÓ A IDENTIDADE
              Onde a rua fica, em que estado está o pavimento, e o aviso de que
              ela não tem nome oficial. CEP, data de pavimentação, obra vinculada
              e coordenadas desceram para a ficha: são consulta, não
              identificação — e como pastilhas do mesmo tamanho disputavam
              atenção com o nome da rua logo acima. */}
          {(local || pavementStatus || street.is_unnamed) && (
            <div className="mt-4 flex flex-wrap gap-2 text-sm">
              {local && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-raised/80 px-3 py-1.5 font-semibold text-content-secondary ring-1 ring-edge-subtle">
                  <MapPin className="h-4 w-4 text-brand" /> {local}
                </span>
              )}
              {pavementStatus && (
                <span className="inline-flex items-center rounded-full bg-surface-raised/80 px-3 py-1.5 font-semibold text-content-secondary ring-1 ring-edge-subtle">
                  {pavementStatus}
                </span>
              )}
              {street.is_unnamed && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-status-pendingBg px-3 py-1.5 font-semibold text-status-pendingFg ring-1 ring-status-pendingBorder">
                  <HelpCircle className="h-4 w-4" /> Sem nome oficial
                </span>
              )}
            </div>
          )}
        </div>
      </header>

      {/* ── O CORPO ──
          TUDO O QUE É OPCIONAL É FILHO DIRETO DE UMA GRADE
          Blocos que podem não existir entram sem `div` de embrulho, e é isso que
          faz o `gap` sumir junto com o bloco: um invólucro vazio continuaria
          ocupando célula e abriria o buraco que a página tinha. */}
      <main className="mx-auto grid w-full max-w-[100rem] gap-4 px-4 pt-2 sm:px-5 lg:px-8 2xl:px-10">
        {/* MINHA RUA COMEÇA PELA SITUAÇÃO, NÃO PELA HISTÓRIA
            Quem abre esta página hoje quase sempre veio do push de um alerta ou
            da busca por "está faltando água na minha rua?". A biografia continua
            abaixo, inteira — mas depois da resposta. */}
        <StreetEventBanner eventos={acontecimentos} carregando={carregandoAcontecimentos} />

        {emDuasColunas ? (
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_23rem] lg:items-start">
            {/* NO CELULAR A HISTÓRIA VEM ANTES DE ONDE FICA
                Esta é a página da HISTÓRIA da rua: quem abre quer saber quem foi
                o homenageado. Mapa, CEP e coordenadas são consulta — importam
                quando alguém já decidiu ir até lá, e por isso fecham a página no
                telefone. No desktop a questão não existe: as duas colunas
                aparecem juntas, e a de consulta é a da direita simplesmente por
                vir depois no HTML.

                Sem `sticky`: a lateral com mapa e ficha passa de 700px, e uma
                coluna grudada mais alta que a janela deixa o próprio fim fora de
                alcance. Rolando junto com a página, tudo continua acessível e
                não aparece barra de rolagem nenhuma. */}
            <div className="grid min-w-0 gap-4">{leitura}</div>
            <aside className="grid min-w-0 gap-4">{consulta}</aside>
          </div>
        ) : (
          <>
            {consulta}
            {leitura}
          </>
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

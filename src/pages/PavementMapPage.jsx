
import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Helmet } from 'react-helmet';
import { BarChart3, HelpCircle, List, Loader2, Map as MapaIcone, PlusCircle, Route, SlidersHorizontal, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import PavementMapView from '@/components/PavementMapView';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Drawer, DrawerClose, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { supabase } from '@/lib/customSupabaseClient';
import jsPDF from 'jspdf';
import { cepsDaRua, montarRelatorio, relatorioParaCsv } from '@/lib/pavementReport';
import { temLeiMunicipal, temProjetoDeLei } from '@/lib/pavementStreetHistory';
import { resumoDeExtensao } from '@/lib/pavementLength';
import PavementStats from '@/components/pavement/PavementStats';
import PavementSidebar, { FiltrosDePavimentacao } from '@/components/pavement/PavementSidebar';
import PavementMapLegend from '@/components/pavement/PavementMapLegend';
import PavementReportsPanel from '@/components/pavement/PavementReportsPanel';
import PavementStreetList from '@/components/pavement/PavementStreetList';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import BuscaDeRua from '@/components/pavement/BuscaDeRua';
import 'jspdf-autotable';
import { Capacitor } from '@capacitor/core';
import { salvarDocumento, pdfParaBase64 } from '@/lib/nativeDownload';
import { useCityView, CityViewProvider } from '@/contexts/CityContext';
import CitySelector from '@/components/CitySelector';
import { showAppError } from '@/lib/appError';
import PavementEditModal from '@/components/pavement/PavementEditModal';
import { savePavementStreet } from '@/lib/savePavementStreet';
import { useCanManagePavement } from '@/hooks/useCanManagePavement';
import { useIsMobile } from '@/hooks/useIsMobile';
import {
  MAP_CANVAS_CLASS,
  MAP_GRID_CLASS,
  MAP_PAGE_VIEWPORT_CLASS,
} from '@/components/map/mapLayout';

const PavementMapPage = () => {
  const [streetData, setStreetData] = useState([]);
  const [lastUpdate, setLastUpdate] = useState(null);
  // TODOS OS FILTROS NUM OBJETO SÓ.
  //
  // Eram quatro `useState` independentes, e cada filtro novo custava mais um —
  // além de mais uma linha em "limpar tudo" e mais uma condição no `some` que
  // decide se o botão de limpar aparece. Ambos eram esquecíveis, e esquecer não
  // dá erro: dá um filtro que não limpa.
  const FILTROS_VAZIOS = { bairro: 'all', situacao: 'all', tipo: 'all', cep: 'all', lei: 'all', projeto: 'all', nome: 'all' };
  const [filtros, setFiltros] = useState(FILTROS_VAZIOS);
  const [painelAberto, setPainelAberto] = useState(true);
  // MAPA OU LISTA — A MESMA SELEÇÃO, DUAS PERGUNTAS
  //
  // O mapa responde "onde"; a lista responde "quais são". Quem confere o
  // cadastro contra a planilha da prefeitura precisa da segunda, e até aqui
  // tinha de abrir uma lista por status pelo cartão do topo — uma lista que não
  // obedecia a nenhum dos filtros.
  //
  // O modo não entra em `filtros`: ele não recorta nada. Os dois modos leem
  // exatamente `filteredStreets`, e é isso que impede o número do painel de
  // significar uma coisa no mapa e outra na lista.
  const [modo, setModo] = useState('mapa');
  const setFiltro = (id, valor) => setFiltros((atual) => ({ ...atual, [id]: valor }));
  const [searchTerm, setSearchTerm] = useState('');
  const mapViewRef = useRef();
  const { cityId: activeCityId, cityName: activeCityName, city: activeCity } = useCityView();
  const [downloading, setDownloading] = useState(false);
  // Qual PERGUNTA o relatório responde, e em que formato sai. Duas escolhas
  // separadas de propósito: o tipo é sobre conteúdo, o formato é sobre o que se
  // vai fazer com ele — anexar num ofício (PDF) ou trabalhar numa planilha (CSV).
  const [tipoRelatorio, setTipoRelatorio] = useState('panorama');
  const [relatoriosAbertos, setRelatoriosAbertos] = useState(false);
  const isMobile = useIsMobile();

  // OS LINKS DE REFERÊNCIA DA CIDADE
  //
  // Vivem em duas colunas de `cities` (migração 204). A consulta é própria e
  // não entra no `select` das ruas: são dados da CIDADE, e recarregá-los junto
  // com as ruas os buscaria de novo a cada salvamento de rua sem necessidade.
  const [linksDaCidade, setLinksDaCidade] = useState({});
  const [editandoLinks, setEditandoLinks] = useState(null);
  const [salvandoLinks, setSalvandoLinks] = useState(false);

  const carregarLinks = useCallback(async () => {
    if (!activeCityId) { setLinksDaCidade({}); return; }
    const { data } = await supabase
      .from('cities')
      .select('pavement_street_map_url, pavement_cep_list_url')
      .eq('id', activeCityId)
      .maybeSingle();
    setLinksDaCidade(data || {});
  }, [activeCityId]);

  useEffect(() => { carregarLinks(); }, [carregarLinks]);

  const abrirEdicaoDeLinks = () => setEditandoLinks({
    pavement_street_map_url: linksDaCidade.pavement_street_map_url || '',
    pavement_cep_list_url: linksDaCidade.pavement_cep_list_url || '',
  });

  const salvarLinks = async () => {
    setSalvandoLinks(true);
    // Campo vazio grava NULL, e não string vazia: "sem link cadastrado" e "link
    // cadastrado como nada" precisam ser o mesmo estado para a tela.
    const limpar = (valor) => {
      const texto = String(valor || '').trim();
      return texto || null;
    };
    const { error } = await supabase
      .from('cities')
      .update({
        pavement_street_map_url: limpar(editandoLinks.pavement_street_map_url),
        pavement_cep_list_url: limpar(editandoLinks.pavement_cep_list_url),
      })
      .eq('id', activeCityId);
    setSalvandoLinks(false);

    if (error) {
      // A permissão de escrita em `cities` vive no painel do Supabase, fora do
      // git. Se ela não cobrir quem está tentando, é aqui que se descobre — e a
      // mensagem precisa dizer isso, não um "erro" genérico.
      showAppError({
        title: 'Não foi possível salvar os links',
        description: `${error.message}. Se a mensagem fala em permissão, a policy de UPDATE de cities precisa liberar seu perfil.`,
        variant: 'destructive',
      });
      return;
    }
    setEditandoLinks(null);
    await carregarLinks();
  };


  const { canManage: canManageStreets, isPureAmbassador, myActiveCityIds } =
    useCanManagePavement(activeCityId);

  const [editingStreet, setEditingStreet] = useState(null);
  const [bairros, setBairros] = useState([]);

  const abrirCadastroDeRua = () => setEditingStreet({
    id: null,
    name: '',
    is_unnamed: false,
    cep: '',
    status: 'unpaved',
    pavement_type: 'asphalt',
    bairro_id: null,
    city_id: activeCityId || null,
    location: null,
    paving_date: '',
    honoree_name: '',
    biography: '',
    curiosities: '',
    historical_documents: [],
    historical_photos: [],
  });

  // Os bairros só interessam ao modal, então só quem pode editar paga a busca.
  useEffect(() => {
    if (!canManageStreets) { setBairros([]); return; }
    let cancelled = false;
    supabase.from('bairros').select('*').order('name').then(({ data }) => {
      if (!cancelled) setBairros(data || []);
    });
    return () => { cancelled = true; };
  }, [canManageStreets]);

  const fetchStreets = useCallback(async () => {
    let query = supabase
      .from('pavement_streets')
      .select('*, bairro:bairros!pavement_streets_bairro_id_fkey(name)');
    if (activeCityId) query = query.eq('city_id', activeCityId);
    const { data, error } = await query;
    if (error) {
      showAppError({ title: "Erro ao buscar ruas", description: error.message, variant: "destructive" });
    } else {
      const formattedData = data.map(s => ({
        ...s,
        location: s.location ? { lat: s.location.coordinates[1], lng: s.location.coordinates[0] } : null,
        // O PostGIS/PostgREST devolve [lng,lat]; o Leaflet quer [lat,lng]. A
        // inversão acontece aqui, num lugar só, e nunca no componente.
        linhas: Array.isArray(s.path?.coordinates)
          ? s.path.coordinates.map((linha) => linha.map(([lng, lat]) => [lat, lng]))
          : [],
      }));
      setStreetData(formattedData);
      if (data.length > 0) {
        const mostRecent = data.reduce((latest, street) => {
            const streetDate = new Date(street.updated_at || 0);
            return streetDate > latest ? streetDate : latest;
        }, new Date(0));
        if (mostRecent.getTime() > 0) setLastUpdate(mostRecent.toISOString());
      }
    }
  }, [activeCityId]);

  useEffect(() => {
    fetchStreets();
  }, [fetchStreets]);

  // "VER NO MAPA", VINDO DA LISTA
  //
  // No modo lista o Leaflet não está montado — a lista é a página inteira, e
  // manter um mapa invisível atrás dela seria pagar tiles por nada. Então o
  // destino fica guardado e é aplicado depois que o mapa monta.
  //
  // A espera existe por causa do `fitBounds` de abertura (`FitToStreets`): ele
  // roda no mesmo instante da montagem e enquadraria a cidade inteira por cima
  // do `flyTo` que este botão acabou de pedir. Meio segundo é depois dele e
  // antes de a pessoa reparar.
  const alvoNoMapa = useRef(null);

  const irParaOMapa = (location) => {
    if (!location) return;
    if (modo === 'mapa') { mapViewRef.current?.goToLocation(location); return; }
    alvoNoMapa.current = location;
    setModo('mapa');
  };

  useEffect(() => {
    if (modo !== 'mapa' || !alvoNoMapa.current) return undefined;
    const alvo = alvoNoMapa.current;
    alvoNoMapa.current = null;
    const tempo = setTimeout(() => mapViewRef.current?.goToLocation(alvo), 500);
    return () => clearTimeout(tempo);
  }, [modo]);

  // OS FILTROS QUE RESPONDEM "O QUE AINDA FALTA CONFERIR"
  //
  // Status já existia. Os três novos servem a quem está batendo o cadastro
  // contra a prefeitura: por bairro (é assim que a lista da prefeitura vem),
  // por CEP e pela lei municipal. Cada um responde uma pendência diferente, e
  // ligados juntos mostram a interseção — as ruas mais atrasadas de todas.
  // `ignorarSituacao` existe para a faixa de números: ver o comentário de
  // `resumoDosCartoes`, mais abaixo.
  const passaNosFiltros = (street, { ignorarSituacao = false } = {}) => {
    const termo = searchTerm.trim().toLowerCase();
    const searchMatch = termo === ''
      || street.name.toLowerCase().includes(termo)
      || (street.bairro?.name || '').toLowerCase().includes(termo);
    if (!searchMatch) return false;

    if (!ignorarSituacao && filtros.situacao !== 'all' && street.status !== filtros.situacao) return false;
    if (filtros.bairro !== 'all' && String(street.bairro_id || '') !== filtros.bairro) return false;
    if (filtros.tipo !== 'all' && street.pavement_type !== filtros.tipo) return false;

    if (filtros.cep !== 'all') {
      const temCep = cepsDaRua(street).length > 0;
      if (filtros.cep === 'com' && !temCep) return false;
      if (filtros.cep === 'sem' && temCep) return false;
    }

    if (filtros.lei !== 'all') {
      const temLei = temLeiMunicipal(street);
      if (filtros.lei === 'com' && !temLei) return false;
      if (filtros.lei === 'sem' && temLei) return false;
    }

    if (filtros.projeto !== 'all') {
      const temProjeto = temProjetoDeLei(street);
      if (filtros.projeto === 'com' && !temProjeto) return false;
      if (filtros.projeto === 'sem' && temProjeto) return false;
    }

    // `is_unnamed` é a coluna da migração 201 — a rua tem um nome de trabalho
    // ("Rua Projetada 20"), e a marca diz que ele não é oficial. Por isso o
    // filtro é sobre a MARCA, e não sobre `name` estar vazio.
    if (filtros.nome !== 'all') {
      const semNome = Boolean(street.is_unnamed);
      if (filtros.nome === 'sem' && !semNome) return false;
      if (filtros.nome === 'com' && semNome) return false;
    }

    return true;
  };

  // MEMOIZADO PORQUE A LISTA DEPENDE DA IDENTIDADE DO ARRAY.
  //
  // `PavementStreetList` volta para a primeira página sempre que o recorte
  // muda, e "mudou" ele descobre pela identidade do array. Recalculado a cada
  // render, o filtro devolveria um array novo toda vez e a paginação nunca
  // sairia da página 1.
  const filteredStreets = useMemo(
    () => streetData.filter((rua) => passaNosFiltros(rua)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [streetData, searchTerm, filtros],
  );

  // O MESMO RECORTE, MENOS A SITUAÇÃO. É a base da faixa de números — ver
  // `resumoDosCartoes`, logo abaixo.
  const ruasSemFiltroDeSituacao = useMemo(
    () => (filtros.situacao === 'all'
      ? filteredStreets
      : streetData.filter((rua) => passaNosFiltros(rua, { ignorarSituacao: true }))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [streetData, filteredStreets, searchTerm, filtros],
  );

  // Os bairros saem das PRÓPRIAS RUAS, e não de uma consulta à tabela.
  // Filtrar por um bairro que não tem rua nenhuma no mapa é uma opção que só
  // pode dar lista vazia — e a consulta extra seria paga por todo visitante.
  const bairrosComRua = [...new Map(
    streetData
      .filter((s) => s.bairro_id && s.bairro?.name)
      .map((s) => [String(s.bairro_id), s.bairro.name])
  ).entries()].sort((a, b) => a[1].localeCompare(b[1], 'pt-BR'));

  // OS NÚMEROS DO PAINEL SAEM DAS RUAS FILTRADAS, NÃO DA CIDADE INTEIRA.
  //
  // Filtrar por "Centro" e continuar vendo os 68 km da cidade toda no topo
  // desliga o painel do que está na tela: a pessoa lê um número que não tem
  // relação nenhuma com o mapa à frente. Com o recorte, os cartões respondem
  // "quanto tem AQUI", que é a pergunta de quem acabou de filtrar.
  const resumo = useMemo(() => resumoDeExtensao(filteredStreets), [filteredStreets]);

  // A FAIXA DE NÚMEROS NÃO PODE CONTAR O PRÓPRIO FILTRO DELA
  //
  // Os cartões contam E filtram. Contando sobre `resumo`, que já obedece a
  // `filtros.situacao`, o contador se destruía ao ser usado: clicar em "Sem
  // pavimentação" zerava "Pavimentada" e "Parcialmente pavimentada", e a tela
  // passava a afirmar que a cidade não tem rua asfaltada nenhuma — com as
  // porcentagens virando 100% para a situação escolhida.
  //
  // Bairro, CEP, lei, projeto e busca continuam valendo: o número segue sendo
  // "quanto tem AQUI". Só a situação sai, porque é o que o cartão liga.
  const resumoDosCartoes = useMemo(
    () => (filtros.situacao === 'all' ? resumo : resumoDeExtensao(ruasSemFiltroDeSituacao)),
    [filtros.situacao, resumo, ruasSemFiltroDeSituacao],
  );

  // O painel de controle e renderizado DUAS vezes: no fluxo da pagina no
  // celular, e flutuando sobre o mapa no desktop. As props saem de um objeto so
  // para as duas copias nao divergirem — divergir aqui daria um filtro que
  // funciona num tamanho de tela e nao no outro, que e o tipo de defeito que
  // so aparece no aparelho de outra pessoa.
  const filtrosLigados = Object.values(filtros).filter((v) => v !== 'all').length;

  const propsDoPainel = {
    streets: streetData,
    busca: searchTerm,
    onBuscaChange: setSearchTerm,
    onEscolherRua: (rua) => rua.location && mapViewRef.current?.goToLocation(rua.location),
    filtros,
    onFiltroChange: setFiltro,
    onLimpar: () => setFiltros(FILTROS_VAZIOS),
    bairros: bairrosComRua,
  };

  const stats = {
    total: streetData.length,
    paved: streetData.filter(s => s.status === 'paved').length,
    partially_paved: streetData.filter(s => s.status === 'partially_paved').length,
    unpaved: streetData.filter(s => s.status === 'unpaved').length,
    unnamed: streetData.filter(s => s.is_unnamed).length,
  };







  // O PDF virou RENDERIZADOR, e nao mais o dono do relatorio.
  //
  // Antes esta funcao decidia o que entra no documento E desenhava as caixas na
  // folha, com um `if` no meio para os dois formatos que existiam. Agora quem
  // decide e `lib/pavementReport.js` — e por isso os tipos ganharam teste, que
  // e o que uma conta destinada a prefeitura precisa ter.
  //
  // Aqui so sobrou papel: cabecalho, o grafico de barras do panorama e as
  // tabelas que vierem, sejam quais forem.
  const gerarPdf = (relatorio) => {
    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text(relatorio.titulo, 14, 18);

    doc.setFontSize(11);
    doc.text(relatorio.subtitulo, 14, 26);

    doc.setFontSize(10);
    let y = 34;
    if (relatorio.atualizadoEm) {
      doc.text(`Atualizado em: ${relatorio.atualizadoEm}`, 14, y);
      y += 6;
    }
    if (relatorio.recorte) {
      doc.text(`Bairros: ${relatorio.recorte}`, 14, y);
      y += 6;
    }

    // O resumo acompanha todo tipo: a lista so significa alguma coisa ao lado
    // do total da cidade.
    y += 2;
    for (const item of relatorio.resumo) {
      doc.text(`${item.rotulo}: ${item.valor}${item.parte ? ` (${item.parte})` : ''}`, 14, y);
      y += 6;
    }

    // O grafico entra so no panorama: nos relatorios de lista ele empurraria a
    // tabela para a segunda pagina sem acrescentar nada.
    if (relatorio.tipo === 'panorama') {
      y += 4;
      doc.setFontSize(12);
      doc.text('Distribuição por status', 14, y);
      doc.setFontSize(10);
      y += 8;

      const series = [
        { label: 'Pavimentadas', value: relatorio.contagem.paved, color: [55, 65, 81] },
        { label: 'Parcialmente', value: relatorio.contagem.partially_paved, color: [107, 114, 128] },
        { label: 'Sem pavimentação', value: relatorio.contagem.unpaved, color: [217, 119, 6] },
      ];
      const maior = Math.max(...series.map((s) => s.value), 1);
      const larguraMax = 80;

      for (const item of series) {
        const percent = relatorio.contagem.total
          ? ((item.value / relatorio.contagem.total) * 100).toFixed(1)
          : '0.0';
        doc.setFillColor(item.color[0], item.color[1], item.color[2]);
        doc.rect(14, y - 3, (item.value / maior) * larguraMax, 4, 'F');
        doc.setTextColor(0, 0, 0);
        doc.text(`${item.label}: ${item.value} (${percent}%)`, 14 + larguraMax + 6, y);
        y += 8;
      }
    }

    for (const secao of relatorio.secoes) {
      y += 4;
      doc.setFontSize(12);
      doc.text(secao.titulo, 14, y);
      doc.autoTable({
        head: [secao.colunas],
        body: secao.linhas,
        startY: y + 4,
        styles: { fontSize: 9 },
      });
      y = doc.lastAutoTable.finalY + 6;
      doc.setFontSize(10);
    }

    return doc;
  };

  const relatorioAtual = () => montarRelatorio(tipoRelatorio, streetData, {
    cidade: activeCityName,
    atualizadoEm: lastUpdate ? new Date(lastUpdate).toLocaleString('pt-BR') : null,
  });

  // O CSV É PARA TRABALHAR, O PDF É PARA ANEXAR
  //
  // Quem recebe "ruas sem pavimentação" na prefeitura vai ordenar, somar e
  // cruzar com a planilha de orçamento. No PDF isso vira digitação manual — e
  // digitação manual de uma lista de trezentas ruas é onde o número oficial
  // ganha erro.
  const handleDownloadCsv = async () => {
    setDownloading(true);
    try {
      const relatorio = relatorioAtual();
      const csv = relatorioParaCsv(relatorio);
      const fileName = `pavimentacao_${relatorio.tipo}_${new Date().toISOString().split('T')[0]}.csv`;

      if (Capacitor.isNativePlatform()) {
        // O BOM do CSV é um caractere multibyte: `btoa` sozinho o corromperia,
        // e o Excel abriria o arquivo com os acentos quebrados.
        const bytes = new TextEncoder().encode(csv);
        let binario = '';
        for (const b of bytes) binario += String.fromCharCode(b);
        await salvarDocumento({
          base64: btoa(binario),
          fileName,
          contentType: 'text/csv',
          tituloShare: fileName,
        });
      } else {
        const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
        const link = document.createElement('a');
        link.href = url;
        link.download = fileName;
        link.click();
        URL.revokeObjectURL(url);
      }
    } catch (error) {
      showAppError({ title: 'Erro ao gerar planilha', description: error.message || 'Não foi possível gerar o arquivo.', variant: 'destructive' });
    } finally {
      setTimeout(() => setDownloading(false), 800);
    }
  };

  const handleDownloadPdf = async () => {
    setDownloading(true);
    try {
      const relatorio = relatorioAtual();
      const doc = gerarPdf(relatorio);
      const fileName = `pavimentacao_${relatorio.tipo}_${new Date().toISOString().split('T')[0]}.pdf`;
      const isNative = Capacitor.isNativePlatform();
      if (isNative) {
        try {
          // Ver lib/nativeDownload: `Download/` sob Directory.Documents também
          // caía em escrita fora da área do app, e a notificação nascia sem
          // `extra.filePath` — tocar nela não abria nada.
          await salvarDocumento({
            base64: pdfParaBase64(doc),
            fileName,
            contentType: 'application/pdf',
            tituloShare: fileName,
          });
        } catch (error) {
          showAppError({ title: 'Erro ao baixar relatório', description: 'Não foi possível salvar o relatório. Tente novamente.', variant: 'destructive' });
        }
      } else {
        doc.save(fileName);
      }
    } catch (error) {
      showAppError({ title: 'Erro ao gerar relatório', description: error.message || 'Não foi possível gerar o relatório.', variant: 'destructive' });
    } finally {
      setTimeout(() => setDownloading(false), 800);
    }
  };

  const propsDoRelatorio = {
    linksDaCidade,
    podeGerenciar: canManageStreets,
    cidadeId: activeCityId,
    onEditarLinks: () => {
      setRelatoriosAbertos(false);
      abrirEdicaoDeLinks();
    },
    tipoRelatorio,
    onTipoRelatorioChange: setTipoRelatorio,
    downloading,
    onDownloadCsv: handleDownloadCsv,
    onDownloadPdf: handleDownloadPdf,
  };

  return (
    <>
      <Helmet>
        <title>Mapa de Pavimentação - Trombone Cidadão</title>
        <meta name="description" content="Acompanhe o status da pavimentação das ruas de Floresta-PE e veja os relatórios." />
      </Helmet>
      <div className="flex flex-col bg-surface-base md:px-6">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          /* ESTA PÁGINA É MAIS LARGA QUE O RESTO DO SITE, E DE PROPÓSITO.

             O site usa 88rem com sobra nas laterais — largura de leitura, que é
             o certo para texto: linha longa demais cansa. Mapa não se lê, se
             examina, e cada rem que sobra na lateral é rua que não aparece.

             112rem ainda deixa margem numa tela de 1920 (uns 80px de cada lado),
             então a página continua parecendo do mesmo site — só não paga o
             preço de uma regra feita para outro tipo de conteúdo. */
          /* Coluna flex a partir de 1100px — o título e os indicadores ocupam o
             espaço natural deles, e o painel fica com o restante da janela.
             O cálculo acompanha as mesmas variáveis usadas pelo layout global:
             header, banner opcional e reserva inferior. */
          className={`mx-auto flex w-full max-w-[112rem] flex-col gap-2 px-3 pb-6 pt-3 sm:gap-3 md:px-6 lg:px-8 ${
            modo === 'mapa'
              ? MAP_PAGE_VIEWPORT_CLASS
              : ''
          }`}
        >
          {/* O TÍTULO SAIU DA TELA, MAS NÃO DO DOCUMENTO.
              "INFRAESTRUTURA / Mapa de Pavimentação / Visualize o status..."
              custava uns 120 px antes de qualquer coisa útil aparecer, para
              repetir o que a aba do navegador e o menu já dizem — quem chegou
              aqui sabe onde está. Numa tela cujo assunto É o mapa, isso é
              rolagem paga por nada.
              O `h1` fica, invisível: leitor de tela e busca continuam
              precisando da estrutura do documento, e removê-lo de vez trocaria
              120 px por um problema de acessibilidade. */}
          {/* O MESMO CABEÇALHO DAS OUTRAS TRÊS TELAS DE MAPA
              Ele já foi `sr-only` aqui, para poupar os ~120px que o bloco
              custa. O que se poupou custou caro: a página perdia o nome
              justamente para quem chega por link, e as quatro telas de mapa
              passavam a parecer quatro produtos diferentes.
              O selo carrega o total, e os cartões abaixo a repartição — o total
              repetido nos dois seria o mesmo número dito duas vezes. O chip de
              ruas sem nome fica junto porque é um NÚMERO sobre o mesmo conjunto,
              e porque ligar o filtro por ele é o caminho de quem monta projeto
              de lei de denominação. */}
          <div className="text-center">
            <h1 className="text-2xl font-bold text-tc-red sm:text-3xl md:text-4xl">Mapa de Ruas e Pavimentação</h1>
            <p className="mt-2 text-sm text-content-secondary sm:text-base">
              Quais ruas têm pavimento, quais não têm, e o que já foi prometido
            </p>

            <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
              <span className="inline-flex items-center gap-2 rounded-full bg-green-100 px-3 py-1.5 text-sm font-bold text-green-700">
                <Route className="h-4 w-4" />
                {filteredStreets.length === stats.total
                  ? `${stats.total} ${stats.total === 1 ? 'rua mapeada' : 'ruas mapeadas'}`
                  : `${filteredStreets.length} de ${stats.total} ruas`}
              </span>

              {stats.unnamed > 0 && (
                <button
                  type="button"
                  aria-pressed={filtros.nome === 'sem'}
                  onClick={() => setFiltro('nome', filtros.nome === 'sem' ? 'all' : 'sem')}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-bold transition-colors ${
                    filtros.nome === 'sem'
                      ? 'border-brand bg-brand text-content-onBrand'
                      : 'border-status-pendingBorder bg-status-pendingBg text-status-pendingFg'
                  }`}
                >
                  <HelpCircle className="h-4 w-4" /> {stats.unnamed} sem nome
                </button>
              )}
            </div>
          </div>
        {/* A FAIXA DE NÚMEROS É A PRIMEIRA COISA DA TELA.
            Eram quatro botões grandes num cartão próprio, com uns cem pixels de
            altura antes de o mapa começar. Como cartões compactos eles dizem o
            mesmo e continuam clicáveis: cada um ainda abre a lista das ruas
            daquela situação. */}
        <PavementStats
          resumo={resumoDosCartoes}
          situacaoAtiva={filtros.situacao}
          onSituacao={(id) => setFiltro('situacao', filtros.situacao === id ? 'all' : id)}
        />

        {/* O MODO LISTA É UMA PÁGINA, E NÃO UMA CAIXA DENTRO DO MAPA
            Ele nasceu ocupando o lugar do mapa: mesma moldura, mesma altura de
            janela, rolagem própria por dentro. O resultado era o único modo
            lista do app que se comporta diferente dos outros dois — em obras e
            em imóveis a lista larga a moldura do mapa e vira a página inteira,
            com a paginação no fim e o rodapé do site logo abaixo.
            Aqui os filtros continuam existindo porque são sete, e sete
            seletores não cabem numa faixa como os quatro de obras: eles viram
            uma grade de quatro colunas acima da lista. */}
        {modo === 'lista' ? (
        <div className="grid gap-3">
          <div className="rounded-2xl border border-edge-subtle bg-surface-raised p-3 shadow-sm sm:p-4">
            <div className="grid gap-3 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] lg:items-start">
              <div className="grid gap-2">
                <CitySelector />
                <BuscaDeRua
                  streets={streetData}
                  valor={searchTerm}
                  onValorChange={setSearchTerm}
                  onEscolher={(rua) => rua.location && irParaOMapa(rua.location)}
                />
              </div>

              <FiltrosDePavimentacao
                filtros={filtros}
                onFiltroChange={setFiltro}
                bairros={bairrosComRua}
                colunas="grid-cols-2 md:grid-cols-3 xl:grid-cols-4"
              />
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-edge-subtle pt-3">
              <ToggleGroup
                type="single"
                value={modo}
                onValueChange={(valor) => valor && setModo(valor)}
                className="rounded-md border"
              >
                <ToggleGroupItem value="mapa" aria-label="Ver mapa" className="px-4">
                  <MapaIcone className="h-4 w-4" />
                </ToggleGroupItem>
                <ToggleGroupItem value="lista" aria-label="Ver lista" className="px-4">
                  <List className="h-4 w-4" />
                </ToggleGroupItem>
              </ToggleGroup>

              {filtrosLigados > 0 && (
                <Button type="button" size="sm" variant="ghost" className="text-xs" onClick={() => setFiltros(FILTROS_VAZIOS)}>
                  Limpar filtros ({filtrosLigados})
                </Button>
              )}

              <div className="ml-auto flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="gap-1.5 text-xs"
                  onClick={() => setRelatoriosAbertos(true)}
                >
                  <BarChart3 className="h-3.5 w-3.5 text-brand" /> Relatórios
                </Button>

                {canManageStreets && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="gap-1.5 border-tc-red/30 text-xs text-tc-red hover:bg-tc-red/5"
                    onClick={abrirCadastroDeRua}
                  >
                    <PlusCircle className="h-3.5 w-3.5" /> Adicionar rua
                  </Button>
                )}
              </div>
            </div>
          </div>

          <PavementStreetList
            emPagina
            streets={filteredStreets}
            canManage={canManageStreets}
            onEditStreet={setEditingStreet}
            onIrParaOMapa={irParaOMapa}
          />
        </div>
        ) : (
        <>
        {/* TUDO NUMA TELA SÓ, NO DESKTOP.

            Referências e relatório viviam abaixo do mapa —
            e em notebook isso é meia tela de rolagem depois do mapa, que é o
            mesmo que não existir: ninguém rola uma página de mapa.

            Na coluna da direita eles ficam à vista o tempo todo, e a largura
            que sobra numa tela de desktop passa a ter uso. O mapa perde uns
            21rem de largura e ganha ALTURA em troca: ele passa a ocupar a
            janela inteira em vez dos 42rem fixos de antes.

            Abaixo de `lg` a coluna volta a ser o empilhamento de sempre —
            duas colunas em 360 px não são duas colunas. */}
        {/* TRÊS COLUNAS: CONTROLE, MAPA, RESUMO.

            O painel já flutuou sobre o mapa. Sobreposto ele cobria a parte que
            fica logo abaixo dele — e num mapa a região central é a que importa.
            Como coluna, o mapa inteiro fica visível e o painel para de disputar
            espaço com aquilo que ele serve para filtrar.

            O mapa também perdeu a barra de topo: cidade, contagem e ações
            subiram para o cabeçalho do painel, onde não custam altura na
            largura inteira. O mapa fica sem moldura nenhuma em cima.

            Entre 1100 e 1439 px, o painel de relatórios sai da grade e vira um
            drawer. Abaixo de 1100 px, os filtros também deixam de ocupar uma
            coluna: o mapa passa a ser o único bloco largo. */}
        <div
          className={`${MAP_GRID_CLASS} ${
            painelAberto
              ? 'min-[1100px]:grid-cols-[13.5rem_minmax(0,1fr)] min-[1440px]:grid-cols-[16rem_minmax(0,1fr)_21rem]'
              : 'min-[1100px]:grid-cols-[minmax(0,1fr)] min-[1440px]:grid-cols-[minmax(0,1fr)_21rem]'
          }`}
        >
          {/* No celular ele renderiza como pilha de botões; no desktop, como a
              coluna. Os dois casos vivem dentro do próprio componente. */}
          <div className={painelAberto
            ? 'min-[1100px]:h-full min-[1100px]:min-h-0 min-[1100px]:overflow-hidden'
            : 'min-[1100px]:hidden'}>
            <PavementSidebar
              {...propsDoPainel}
              onOcultar={() => setPainelAberto(false)}
              acoes={(
                <div className="grid gap-2">
                  {/* MAPA | LISTA MORA NO PAINEL, COMO NO MAPA DE OBRAS
                      Ele já ficou numa faixa própria acima do mapa, e ali
                      custava altura na largura inteira para dizer duas
                      palavras. No rodapé do painel ele fica ao lado das outras
                      ações da tela — e as duas telas de mapa passam a trocar de
                      modo no mesmo lugar, que é o que faz aprender uma valer
                      para a outra. */}
                  <ToggleGroup
                    type="single"
                    value={modo}
                    onValueChange={(valor) => valor && setModo(valor)}
                    className="justify-center rounded-md border"
                  >
                    <ToggleGroupItem value="mapa" aria-label="Ver mapa" className="flex-1">
                      <MapaIcone className="h-4 w-4" />
                    </ToggleGroupItem>
                    <ToggleGroupItem value="lista" aria-label="Ver lista" className="flex-1">
                      <List className="h-4 w-4" />
                    </ToggleGroupItem>
                  </ToggleGroup>

                  {canManageStreets ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-8 w-full gap-1.5 border-tc-red/30 text-[11px] text-tc-red hover:bg-tc-red/5"
                      onClick={abrirCadastroDeRua}
                    >
                      <PlusCircle className="h-3.5 w-3.5" /> Adicionar rua
                    </Button>
                  ) : null}

                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="hidden h-8 w-full gap-1.5 border-edge-subtle text-[11px] font-bold text-content-primary hover:bg-surface-subtle lg:flex min-[1440px]:hidden"
                    onClick={() => setRelatoriosAbertos(true)}
                  >
                    <BarChart3 className="h-3.5 w-3.5 text-brand" /> Relatórios
                  </Button>
                </div>
              )}
              cabecalho={
                /* SÓ A CIDADE.

                   Estavam quatro coisas empilhadas aqui — seletor, botão de
                   adicionar, contagem e o aviso de ruas sem nome. A contagem e o
                   aviso subiram para o cabeçalho da página, onde viraram o selo
                   e o chip; "Adicionar rua" desceu para o rodapé do painel,
                   junto de "Ocultar filtros", porque é ação e ação não é
                   cabeçalho.

                   Sobrou o que o painel de fato responde: ONDE estou vendo. */
                <div className="flex min-w-0 items-center justify-between gap-2 rounded-xl border border-edge-subtle bg-surface-raised px-3 py-2 shadow-sm min-[900px]:flex-col min-[900px]:items-stretch min-[900px]:gap-1.5 min-[900px]:rounded-none min-[900px]:border-0 min-[900px]:bg-transparent min-[900px]:p-0 min-[900px]:shadow-none">
                  <CitySelector mobileBare />

                </div>
              }
            />
          </div>

          <div className={MAP_CANVAS_CLASS}>
            <div className="absolute inset-0">
              <PavementMapView
                ref={mapViewRef}
                streets={filteredStreets}
                canManage={canManageStreets}
                onEditStreet={setEditingStreet}
              />

              <div className="hidden lg:block">
                <PavementMapLegend
                  resumo={resumo}
                  atualizadoEm={lastUpdate ? new Date(lastUpdate).toLocaleString('pt-BR') : null}
                  onRecarregar={fetchStreets}
                />
              </div>
            </div>

            {/* Recolhido, o painel vira este botão. O contador diz quantos
                filtros continuam ligados: sem ele, alguém esconde a coluna,
                esquece o recorte, e lê o mapa filtrado achando que é a cidade. */}
            {!painelAberto && (
              <button
                type="button"
                onClick={() => setPainelAberto(true)}
                className="absolute left-3 top-3 z-[700] hidden items-center gap-2 rounded-full border border-edge-subtle bg-surface-overlay/95 px-3 py-2 text-xs font-bold text-content-secondary shadow-lg backdrop-blur-sm min-[1100px]:inline-flex"
              >
                <SlidersHorizontal className="h-4 w-4" />
                Filtros
                {filtrosLigados > 0 && (
                  <span className="rounded-full bg-brand px-1.5 text-[10px] font-extrabold text-content-onBrand tabular-nums">
                    {filtrosLigados}
                  </span>
                )}
              </button>
            )}

          </div>

          <section className="grid gap-3 lg:hidden" aria-label="Informações e relatórios do mapa">
            <PavementMapLegend
              embedded
              resumo={resumo}
              atualizadoEm={lastUpdate ? new Date(lastUpdate).toLocaleString('pt-BR') : null}
              onRecarregar={fetchStreets}
            />
            <PavementReportsPanel {...propsDoRelatorio} selectId="tipo-relatorio-mobile" />
          </section>


          {/* Só a coluna do desktop recebe `detalhado`: é a única das três
              montagens deste painel que tem altura sobrando para o anel e o
              rodapé de atualização. */}
          <aside className="hidden min-[1440px]:block min-[1440px]:h-full min-[1440px]:min-h-0 min-[1440px]:overflow-y-auto min-[1440px]:overflow-x-hidden">
            <PavementReportsPanel
              {...propsDoRelatorio}
              selectId="tipo-relatorio-desktop"
              detalhado
              resumo={resumo}
              atualizadoEm={lastUpdate ? new Date(lastUpdate).toLocaleString('pt-BR') : null}
            />
          </aside>
        </div>
        </>
        )}
        </motion.div>
      </div>

      <Drawer
        open={relatoriosAbertos}
        onOpenChange={setRelatoriosAbertos}
        direction={isMobile ? 'bottom' : 'right'}
      >
        <DrawerContent className="max-h-[88dvh] rounded-t-2xl md:h-full md:max-h-none md:w-[22rem] md:rounded-none">
          <DrawerHeader className="flex-row items-start justify-between gap-3 border-b border-edge-subtle text-left">
            <div className="min-w-0">
              <DrawerTitle className="flex items-center gap-2 text-base">
                <BarChart3 className="h-4 w-4 text-brand" /> Relatórios
              </DrawerTitle>
              <DrawerDescription className="mt-1 text-xs">
                Referências oficiais e exportações do mapa.
              </DrawerDescription>
            </div>
            <DrawerClose asChild>
              <button
                type="button"
                aria-label="Fechar relatórios"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-content-secondary transition-colors hover:bg-surface-subtle"
              >
                <X className="h-4 w-4" />
              </button>
            </DrawerClose>
          </DrawerHeader>
          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            {/* A GAVETA É O QUE O NOTEBOOK VÊ
                A coluna lateral só aparece a partir de 1440px; entre 1024 e
                1439 — que é a tela da maioria dos notebooks — o painel só existe
                aqui dentro. Ela tem a mesma largura confortável da coluna, então
                recebe a mesma versão: seria estranho o gráfico existir no monitor
                grande e sumir no notebook, sendo que o espaço é o mesmo. */}
            <PavementReportsPanel
              {...propsDoRelatorio}
              selectId="tipo-relatorio-drawer"
              detalhado
              resumo={resumo}
              atualizadoEm={lastUpdate ? new Date(lastUpdate).toLocaleString('pt-BR') : null}
            />
          </div>
        </DrawerContent>
      </Drawer>


      <PavementEditModal
        street={editingStreet}
        onSave={async (streetToSave) => {
          const ok = await savePavementStreet({
            supabase,
            streetToSave,
            bairros,
            isScopedAmbassador: isPureAmbassador,
            myActiveCityIds,
          });
          if (ok) {
            await fetchStreets();
            setEditingStreet(null);
          }
          return ok;
        }}
        onClose={() => setEditingStreet(null)}
        bairros={bairros}
        existingStreets={streetData}
        defaultCityId={activeCityId || null}
        // `activeCityName` já vem formatado "Cidade · UF" para exibição — mandar
        // esse texto inteiro ao Nominatim como `city=` não casa nada. O objeto
        // `city` do contexto tem nome e UF separados, que é o que o geocoder pede.
        fallbackCityCenter={activeCity ? { name: activeCity.name, uf: activeCity.state?.uf || '' } : null}
        onBairroCreated={(novo) => setBairros((prev) => [...prev, novo])}
      />

      <Dialog open={!!editandoLinks} onOpenChange={(open) => !open && !salvandoLinks && setEditandoLinks(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-tc-red">Referências da prefeitura</DialogTitle>
            <DialogDescription>
              Os documentos oficiais de {activeCityName || 'a cidade'}, para conferir o que está cadastrado aqui
              contra o que a prefeitura publicou. Deixe em branco para remover.
            </DialogDescription>
          </DialogHeader>
          {editandoLinks && (
            <div className="grid gap-4 py-2">
              <label className="grid gap-1.5">
                <span className="text-xs font-semibold text-content-secondary">Mapa de ruas oficial</span>
                <Input
                  type="url"
                  inputMode="url"
                  placeholder="https://..."
                  value={editandoLinks.pavement_street_map_url}
                  onChange={(e) => setEditandoLinks((atual) => ({ ...atual, pavement_street_map_url: e.target.value }))}
                />
              </label>
              <label className="grid gap-1.5">
                <span className="text-xs font-semibold text-content-secondary">Lista de ruas com CEP (PDF)</span>
                <Input
                  type="url"
                  inputMode="url"
                  placeholder="https://..."
                  value={editandoLinks.pavement_cep_list_url}
                  onChange={(e) => setEditandoLinks((atual) => ({ ...atual, pavement_cep_list_url: e.target.value }))}
                />
              </label>
            </div>
          )}
          <DialogFooter className="gap-2 sm:justify-end">
            <Button type="button" variant="outline" disabled={salvandoLinks} onClick={() => setEditandoLinks(null)}>
              Cancelar
            </Button>
            <Button type="button" disabled={salvandoLinks} onClick={salvarLinks}>
              {salvandoLinks ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Salvando...</> : 'Salvar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

// Filtro de cidade local a esta tela — nao altera o feed nem persiste.
export default function PavementMapPageWithCityView() {
  return (
    <CityViewProvider>
      <PavementMapPage />
    </CityViewProvider>
  );
}

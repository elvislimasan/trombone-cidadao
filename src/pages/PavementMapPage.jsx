
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Helmet } from 'react-helmet';
import { Link } from 'react-router-dom';
import { ThumbsDown, Filter, Search, List, LocateFixed, RefreshCw, HardHat, Construction, Download, Loader2, PlusCircle, HelpCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import PavementMapView from '@/components/PavementMapView';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { BarChart, Bar, XAxis, YAxis, Tooltip as RechartsTooltip, ResponsiveContainer, Cell } from 'recharts';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import WorksMapView from '@/components/WorksMapView';
import { supabase } from '@/lib/customSupabaseClient';
import jsPDF from 'jspdf';
import { TIPOS_DE_RELATORIO, montarRelatorio, relatorioParaCsv } from '@/lib/pavementReport';
import 'jspdf-autotable';
import { Capacitor } from '@capacitor/core';
import { salvarDocumento, pdfParaBase64 } from '@/lib/nativeDownload';
import { useCityView, CityViewProvider } from '@/contexts/CityContext';
import CitySelector from '@/components/CitySelector';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { usePermissions } from '@/hooks/usePermissions';
import { showAppError } from '@/lib/appError';

const PavementMapPage = () => {
  const [streetData, setStreetData] = useState([]);
  const [allWorks, setAllWorks] = useState([]);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [statusFilter, setStatusFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedWorkId, setSelectedWorkId] = useState(null);
  const [resolvedWork, setResolvedWork] = useState(null);
  const [streetListModal, setStreetListModal] = useState({ isOpen: false, title: '', streets: [] });
  const mapViewRef = useRef();
  const { cityId: activeCityId, cityName: activeCityName } = useCityView();
  const { user } = useAuth();
  const { canWrite } = usePermissions();
  const [downloading, setDownloading] = useState(false);
  // Qual PERGUNTA o relatório responde, e em que formato sai. Duas escolhas
  // separadas de propósito: o tipo é sobre conteúdo, o formato é sobre o que se
  // vai fazer com ele — anexar num ofício (PDF) ou trabalhar numa planilha (CSV).
  const [tipoRelatorio, setTipoRelatorio] = useState('panorama');

  // Mesma regra de imóveis alugados: admin/master gerenciam qualquer cidade;
  // embaixador puro só faz sentido clicar "Adicionar" com uma cidade sua
  // selecionada (senão não saberíamos em qual das suas cidades cadastrar).
  const isPureAmbassador = Boolean(user?.is_ambassador && !user?.is_admin && !user?.is_master);
  const [myActiveCityIds, setMyActiveCityIds] = useState([]);
  const canManageStreets = Boolean(
    (user?.is_admin || user?.is_master ||
      (isPureAmbassador && activeCityId && myActiveCityIds.some((id) => String(id) === String(activeCityId))))
    && canWrite('pavement')
  );

  useEffect(() => {
    if (!isPureAmbassador || !user?.id) { setMyActiveCityIds([]); return; }
    supabase
      .from('ambassador_cities')
      .select('city_id')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .then(({ data }) => setMyActiveCityIds((data || []).map((r) => r.city_id)));
  }, [isPureAmbassador, user?.id]);

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

  const fetchWorks = useCallback(async () => {
    let query = supabase.from('public_works').select('id, title, description, status, location, city_id');
    if (activeCityId) query = query.eq('city_id', activeCityId);
    const { data, error } = await query;
    if (error) showAppError({ title: "Erro ao buscar obras", description: error.message, variant: "destructive" });
    else {
        const formattedWorks = data.map(w => ({
            ...w,
            location: w.location ? { lat: w.location.coordinates[1], lng: w.location.coordinates[0] } : null,
        }));
        setAllWorks(formattedWorks);
    }
  }, [activeCityId]);

  useEffect(() => {
    fetchStreets();
    fetchWorks();
  }, [fetchStreets, fetchWorks]);

  const handleWorkClick = (workId) => {
    setSelectedWorkId(workId);
  };

  // Resolve a obra selecionada mesmo quando ela não está na lista `allWorks`
  // (que é filtrada pela cidade ativa). Isso evita que o modal "ver obra"
  // fique vazio quando a rua aponta para uma obra de outra cidade (ou sem
  // cidade), já que work_id não é necessariamente coberto pelo filtro atual.
  useEffect(() => {
    if (!selectedWorkId) {
      setResolvedWork(null);
      return;
    }
    const fromList = allWorks.find(w => w.id === selectedWorkId);
    if (fromList) {
      setResolvedWork(fromList);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from('public_works')
        .select('id, title, description, status, location, city_id')
        .eq('id', selectedWorkId)
        .single();
      if (cancelled) return;
      if (error) {
        showAppError({ title: "Erro ao buscar obra", description: error.message, variant: "destructive" });
        setResolvedWork(null);
        return;
      }
      const formatted = {
        ...data,
        location: data.location ? { lat: data.location.coordinates[1], lng: data.location.coordinates[0] } : null,
      };
      setResolvedWork(formatted);
    })();
    return () => { cancelled = true; };
  }, [selectedWorkId, allWorks]);

  const handleStreetListClick = (statusType, title) => {
    const streets = streetData.filter(s => s.status === statusType);
    setStreetListModal({ isOpen: true, title, streets });
  };

  const handleUnnamedStreetListClick = () => {
    const streets = streetData.filter((street) => street.is_unnamed);
    setStreetListModal({ isOpen: true, title: 'Ruas sem nome oficial', streets });
  };

  const handleGoToStreet = (location) => {
    if (mapViewRef.current && location) {
      mapViewRef.current.goToLocation(location);
    }
    setStreetListModal({ isOpen: false, title: '', streets: [] });
  };

  const filteredStreets = streetData.filter(street => {
    const searchMatch = searchTerm === '' || street.name.toLowerCase().includes(searchTerm.toLowerCase()) || (street.bairro && street.bairro.name.toLowerCase().includes(searchTerm.toLowerCase()));
    
    if (statusFilter === 'all') return searchMatch;
    return searchMatch && street.status === statusFilter;
  });

  const stats = {
    total: streetData.length,
    paved: streetData.filter(s => s.status === 'paved').length,
    partially_paved: streetData.filter(s => s.status === 'partially_paved').length,
    unpaved: streetData.filter(s => s.status === 'unpaved').length,
    unnamed: streetData.filter(s => s.is_unnamed).length,
  };

  const statusData = [
    { name: 'Pavimentadas', value: stats.paved, fill: '#374151' },
    { name: 'Parcialmente', value: stats.partially_paved, fill: '#6b7280' },
    { name: 'Não Pavimentada', value: stats.unpaved, fill: '#d97706' },
  ];

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: { staggerChildren: 0.1 } }
  };

  const itemVariants = {
    hidden: { y: 20, opacity: 0 },
    visible: { y: 0, opacity: 1 }
  };

  const selectedWork = resolvedWork;

  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-popover text-popover-foreground p-2 border border-border rounded-md shadow-lg">
          <p className="label font-bold">{`${label}`}</p>
          <p className="intro text-sm">{`Total: ${payload[0].value} ruas`}</p>
        </div>
      );
    }
    return null;
  };

  const getFilterLabel = () => {
    switch (statusFilter) {
      case 'paved': return 'Ruas Pavimentadas';
      case 'unpaved': return 'Ruas Sem Pavimentação';
      case 'partially_paved': return 'Ruas Parcialmente Pavimentadas';
      default: return 'Todos';
    }
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
          className="px-4 md:px-6 lg:px-10 xl:px-14 pt-4 pb-8 space-y-8 max-w-[88rem] mx-auto w-full"
        >
          <div className="space-y-3">
            <p className="text-[11px] font-semibold tracking-[0.18em] text-content-tertiary uppercase flex items-center gap-2">
              <span className="inline-block w-1 h-3 rounded-full bg-tc-red" />
              Infraestrutura
            </p>
            <div>
              <h1 className="text-xl md:text-2xl lg:text-3xl font-bold text-content-primary">Mapa de Pavimentação</h1>
              <p className="text-xs lg:text-sm text-content-secondary max-w-2xl">
                Visualize o status da pavimentação e acesse relatórios detalhados.
              </p>
              {lastUpdate && (
                <p className="text-[11px] text-content-secondary mt-1 flex items-center gap-2">
                  <RefreshCw className="w-3.5 h-3.5" />
                  Última atualização: {new Date(lastUpdate).toLocaleString('pt-BR')}
                </p>
              )}
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                <CitySelector />
                {canManageStreets && (
                  <Link to="/pavimentacao/gerenciar">
                    <Button size="sm" variant="outline" className="gap-1.5 text-xs border-tc-red/30 text-tc-red hover:bg-tc-red/5">
                      <PlusCircle className="w-3.5 h-3.5" /> Adicionar rua
                    </Button>
                  </Link>
                )}
              </div>
            </div>
          </div>

        <motion.div
          className="bg-surface-raised border border-edge-subtle rounded-2xl p-3 shadow-sm"
          variants={containerVariants}
          initial="hidden"
          animate="visible"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <motion.button
              type="button"
              variants={itemVariants}
              onClick={() => handleStreetListClick('paved', 'Ruas Pavimentadas')}
              className="flex items-center justify-between rounded-xl px-3 py-3 text-left transition cursor-pointer border border-transparent hover:border-status-resolvedBorder/40 hover:shadow-md"
            >
              <div>
                <div className="text-[11px] md:text-xs text-status-resolvedFg">Pavimentadas</div>
                <div className="text-xl md:text-2xl font-extrabold text-status-resolvedFg leading-tight">
                  {stats.paved}
                </div>
              </div>
              <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-status-resolvedFg text-white">
                <HardHat className="w-4 h-4" />
              </div>
            </motion.button>

            <motion.button
              type="button"
              variants={itemVariants}
              onClick={() => handleStreetListClick('partially_paved', 'Ruas Parcialmente Pavimentadas')}
              className="flex items-center justify-between rounded-xl px-3 py-3 text-left transition cursor-pointer border border-transparent hover:border-status-pendingBorder/40 hover:shadow-md"
            >
              <div>
                <div className="text-[11px] md:text-xs text-status-pendingFg">Parcialmente Pavimentadas</div>
                <div className="text-xl md:text-2xl font-extrabold text-status-pendingFg leading-tight">
                  {stats.partially_paved}
                </div>
              </div>
              <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-status-pendingFg text-white">
                <Construction className="w-4 h-4" />
              </div>
            </motion.button>

            <motion.button
              type="button"
              variants={itemVariants}
              onClick={() => handleStreetListClick('unpaved', 'Ruas Sem Pavimentação')}
              className="flex items-center justify-between rounded-xl px-3 py-3 text-left transition cursor-pointer border border-transparent hover:border-brand/40 hover:shadow-md"
            >
              <div>
                <div className="text-[11px] md:text-xs text-brand">Sem Pavimentação</div>
                <div className="text-xl md:text-2xl font-extrabold text-brand leading-tight">
                  {stats.unpaved}
                </div>
              </div>
              <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-brand text-white">
                <ThumbsDown className="w-4 h-4" />
              </div>
            </motion.button>

            <motion.button
              type="button"
              variants={itemVariants}
              onClick={handleUnnamedStreetListClick}
              className="flex items-center justify-between rounded-xl px-3 py-3 text-left transition cursor-pointer border border-transparent hover:border-amber-400/50 hover:shadow-md"
            >
              <div>
                <div className="text-[11px] md:text-xs text-amber-700">Sem nome oficial</div>
                <div className="text-xl md:text-2xl font-extrabold text-amber-700 leading-tight">
                  {stats.unnamed}
                </div>
              </div>
              <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-amber-600 text-white">
                <HelpCircle className="w-4 h-4" />
              </div>
            </motion.button>
          </div>
        </motion.div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
          <motion.div variants={itemVariants} className="lg:col-span-2 bg-surface-raised rounded-2xl shadow-sm border border-edge-subtle overflow-hidden">
            <div className="px-3 pt-3 pb-2 border-b border-edge-subtle space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-[11px] text-content-secondary">Explorar ruas</p>
                  <p className="text-xs font-medium text-content-primary">
                    {stats.total} ruas mapeadas em Floresta
                  </p>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 px-3 rounded-full text-[11px] border-edge-subtle text-content-secondary bg-surface-raised"
                    >
                      <span>{getFilterLabel()}</span>
                      <Filter className="w-3.5 h-3.5 ml-1 text-content-secondary" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent className="w-56 bg-surface-raised text-foreground border border-edge-subtle">
                    <DropdownMenuLabel className="text-tc-red">Status</DropdownMenuLabel>
                    <DropdownMenuSeparator className="bg-surface-sunken" />
                    <DropdownMenuRadioGroup value={statusFilter} onValueChange={setStatusFilter}>
                      <DropdownMenuRadioItem value="all">Todos</DropdownMenuRadioItem>
                      <DropdownMenuRadioItem value="paved">Pavimentadas</DropdownMenuRadioItem>
                      <DropdownMenuRadioItem value="partially_paved">Parcialmente Pavimentadas</DropdownMenuRadioItem>
                      <DropdownMenuRadioItem value="unpaved">Sem Pavimentação</DropdownMenuRadioItem>
                    </DropdownMenuRadioGroup>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-content-tertiary" />
                <Input
                  id="search"
                  type="text"
                  placeholder="Buscar por rua ou bairro..."
                  className="pl-9 h-9 text-xs md:text-sm bg-surface-raised border-edge-subtle"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  list="street-list"
                />
                <datalist id="street-list">
                  {streetData.map(street => <option key={street.id} value={street.name} />)}
                </datalist>
              </div>
            </div>
            <div className="w-full h-[20rem] md:h-[24rem] lg:h-[26rem]">
              <PavementMapView ref={mapViewRef} streets={filteredStreets} onWorkClick={handleWorkClick} />
            </div>
            <div className="border-t border-edge-subtle px-3 py-2 bg-surface-base flex flex-wrap items-center gap-3 text-[11px] text-content-secondary">
              <span className="font-semibold">Legenda</span>
              <span className="inline-flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full bg-status-resolvedFg" />
                Pavimentada
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full bg-status-pendingFg" />
                Parcialmente
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full bg-[#6B7280]" />
                Sem pavimentação
              </span>
            </div>
          </motion.div>
          <motion.div variants={itemVariants} className="bg-surface-raised border border-edge-subtle rounded-2xl p-6 flex flex-col shadow-sm">
            <h3 className="font-semibold mb-4 text-center text-foreground text-lg">Relatório de Pavimentação</h3>
            <div className="flex-grow h-[260px] md:h-[320px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={statusData}
                  layout="horizontal"
                  margin={{ top: 10, right: 16, left: 16, bottom: 24 }}
                >
                  <XAxis
                    dataKey="name"
                    type="category"
                    stroke="hsl(var(--muted-foreground))"
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    type="number"
                    allowDecimals={false}
                    stroke="hsl(var(--muted-foreground))"
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                  />
                  <RechartsTooltip
                    cursor={{ fill: 'hsl(var(--accent))' }}
                    content={<CustomTooltip />}
                  />
                  <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                    {statusData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <p className="text-xs text-center text-muted-foreground mt-4">
              Total de ruas mapeadas: {stats.total}
            </p>
          </motion.div>
        </div>

        {/* OS RELATÓRIOS FICAM NO FIM, DEPOIS DOS NÚMEROS
            Estavam no topo, entre o título e o mapa: a primeira decisão
            oferecida a quem abre a página era escolher um formato de arquivo.
            Mas baixar relatório é o que se faz DEPOIS de olhar o mapa e os
            gráficos — e quem chegou até aqui já sabe o que quer perguntar. */}
        <div className="flex flex-col gap-3 rounded-2xl border border-edge-subtle bg-surface-raised p-4 shadow-sm md:flex-row md:items-center md:justify-between">
          {/* O RELATÓRIO PASSOU A SER UMA PERGUNTA, NÃO UM FORMATO
              Eram dois chips — "todas as ruas" e "resumo por bairro" —, que
              descreviam o conteúdo do arquivo. Quem baixa não quer escolher
              seções: quer saber quantas ruas faltam pavimentar, quais estão
              sem nome, o que falta preencher. Cada opção aqui responde uma
              dessas, e a descrição diz qual. */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="tipo-relatorio" className="text-[10px] font-semibold uppercase tracking-wider text-content-tertiary">
              Relatório
            </label>
            <select
              id="tipo-relatorio"
              value={tipoRelatorio}
              onChange={(e) => setTipoRelatorio(e.target.value)}
              className="h-9 min-w-[15rem] rounded-lg border border-edge-default bg-surface-raised px-2.5 text-xs font-semibold text-content-primary"
            >
              {TIPOS_DE_RELATORIO.map((tipo) => (
                <option key={tipo.id} value={tipo.id}>{tipo.label}</option>
              ))}
            </select>
            <p className="max-w-xs text-[10px] leading-snug text-content-secondary">
              {TIPOS_DE_RELATORIO.find((t) => t.id === tipoRelatorio)?.descricao}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              onClick={handleDownloadCsv}
              disabled={downloading}
              variant="outline"
              className="w-full md:w-auto"
              title="Planilha para abrir no Excel"
            >
              <Download className="mr-2 h-4 w-4" />
              Planilha (CSV)
            </Button>
            <Button onClick={handleDownloadPdf} disabled={downloading} className="w-full md:w-auto">
              {downloading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Baixando...
                </>
              ) : (
                <>
                  <Download className="mr-2 h-4 w-4" />
                  Relatório (PDF)
                </>
              )}
            </Button>
          </div>
        </div>
        </motion.div>
      </div>

      <Dialog open={!!selectedWorkId} onOpenChange={(open) => !open && setSelectedWorkId(null)}>
        <DialogContent className="max-w-4xl h-[90vh] flex flex-col p-0">
          {selectedWork && (
            <>
              <DialogHeader className="p-4 border-b">
                <DialogTitle className="text-tc-red">{selectedWork.title}</DialogTitle>
                <DialogDescription>Detalhes da obra vinculada.</DialogDescription>
              </DialogHeader>
              <div className="flex-grow overflow-hidden">
                <WorksMapView works={[selectedWork]} />
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={streetListModal.isOpen} onOpenChange={(open) => !open && setStreetListModal({ isOpen: false, title: '', streets: [] })}>
        <DialogContent className="max-w-lg max-h-[95vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-tc-red">
              <List className="w-6 h-6" />
              {streetListModal.title}
            </DialogTitle>
            <DialogDescription>
              Lista de ruas para a categoria selecionada. Clique em uma rua para localizá-la no mapa.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-y-auto pr-2">
            <ul className="space-y-2">
              {streetListModal.streets.map(street => (
                <li key={street.id}>
                  <button 
                    onClick={() => handleGoToStreet(street.location)}
                    className="w-full text-left p-3 rounded-md hover:bg-muted transition-colors flex justify-between items-center"
                  >
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p>{street.name}</p>
                        {street.is_unnamed && (
                          <span className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-800">
                            <HelpCircle className="h-3 w-3" /> Sem nome oficial
                          </span>
                        )}
                      </div>
                      {street.bairro && <p className="text-xs text-muted-foreground">{street.bairro.name}</p>}
                    </div>
                    <LocateFixed className="w-4 h-4 text-muted-foreground" />
                  </button>
                </li>
              ))}
            </ul>
          </div>
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

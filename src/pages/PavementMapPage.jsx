
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Helmet } from 'react-helmet';
import { Route as Road, ThumbsDown, Filter, Search, X, Mail, Circle, Square, Map, List, LocateFixed, RefreshCw, HardHat, Construction, Download, Loader2 } from 'lucide-react';
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
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/customSupabaseClient';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { LocalNotifications } from '@capacitor/local-notifications';

const PavementMapPage = () => {
  const [streetData, setStreetData] = useState([]);
  const [allWorks, setAllWorks] = useState([]);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [statusFilter, setStatusFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedWorkId, setSelectedWorkId] = useState(null);
  const [streetListModal, setStreetListModal] = useState({ isOpen: false, title: '', streets: [] });
  const mapViewRef = useRef();
  const { toast } = useToast();
  const [downloading, setDownloading] = useState(false);
  const [reportScope, setReportScope] = useState('streets');

  const fetchStreets = useCallback(async () => {
    const { data, error } = await supabase
      .from('pavement_streets')
      .select('*, bairro:bairros!pavement_streets_bairro_id_fkey(name)');
    if (error) {
      toast({ title: "Erro ao buscar ruas", description: error.message, variant: "destructive" });
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
  }, [toast]);

  const fetchWorks = useCallback(async () => {
    const { data, error } = await supabase.from('public_works').select('id, title, description, status, location');
    if (error) toast({ title: "Erro ao buscar obras", description: error.message, variant: "destructive" });
    else {
        const formattedWorks = data.map(w => ({
            ...w,
            location: w.location ? { lat: w.location.coordinates[1], lng: w.location.coordinates[0] } : null,
        }));
        setAllWorks(formattedWorks);
    }
  }, [toast]);

  useEffect(() => {
    fetchStreets();
    fetchWorks();
  }, [fetchStreets, fetchWorks]);

  const handleWorkClick = (workId) => {
    setSelectedWorkId(workId);
  };

  const handleStreetListClick = (statusType, title) => {
    const streets = streetData.filter(s => s.status === statusType);
    setStreetListModal({ isOpen: true, title, streets });
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

  const selectedWork = allWorks.find(w => w.id === selectedWorkId);

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

  const generatePdf = (scope) => {
    const doc = new jsPDF();
    const title = 'Relatório de Pavimentação';
    doc.setFontSize(16);
    doc.text(title, 14, 18);
    if (lastUpdate) {
      doc.setFontSize(10);
      doc.text(`Atualizado em: ${new Date(lastUpdate).toLocaleString('pt-BR')}`, 14, 26);
    }
    doc.setFontSize(12);
    doc.text(`Total: ${stats.total} | Pavimentadas: ${stats.paved} | Parcialmente: ${stats.partially_paved} | Sem pavimentação: ${stats.unpaved}`, 14, 34);

    const chartStartY = 44;
    doc.text('Distribuição por status', 14, chartStartY);
    const series = [
      { label: 'Pavimentadas', value: stats.paved, color: [55, 65, 81] },
      { label: 'Parcialmente', value: stats.partially_paved, color: [107, 114, 128] },
      { label: 'Sem pavimentação', value: stats.unpaved, color: [217, 119, 6] },
    ];
    const maxValue = Math.max(...series.map(s => s.value), 1);
    const barMaxWidth = 80;
    let currentY = chartStartY + 6;
    doc.setFontSize(10);
    series.forEach((item) => {
      const barWidth = (item.value / maxValue) * barMaxWidth;
      const percent = stats.total ? ((item.value / stats.total) * 100).toFixed(1) : '0.0';
      doc.setFillColor(item.color[0], item.color[1], item.color[2]);
      doc.rect(14, currentY - 3, barWidth, 4, 'F');
      doc.setTextColor(0, 0, 0);
      doc.text(`${item.label}: ${item.value} (${percent}%)`, 14 + barMaxWidth + 6, currentY);
      currentY += 8;
    });

    let startY = currentY + 6;

    if (scope === 'neighborhoods') {
      const neighborhoodMap = {};
      streetData.forEach((s) => {
        const neighborhoodName = s.bairro?.name || 'Sem bairro';
        if (!neighborhoodMap[neighborhoodName]) {
          neighborhoodMap[neighborhoodName] = { paved: 0, partially_paved: 0, unpaved: 0 };
        }
        if (s.status === 'paved') neighborhoodMap[neighborhoodName].paved += 1;
        if (s.status === 'partially_paved') neighborhoodMap[neighborhoodName].partially_paved += 1;
        if (s.status === 'unpaved') neighborhoodMap[neighborhoodName].unpaved += 1;
      });

      const neighborhoodRows = Object.entries(neighborhoodMap).map(([name, counts]) => {
        const total = counts.paved + counts.partially_paved + counts.unpaved;
        return [name, counts.paved, counts.partially_paved, counts.unpaved, total];
      });

      if (neighborhoodRows.length) {
        doc.setFontSize(12);
        doc.text('Resumo por bairro', 14, startY);
        doc.autoTable({
          head: [['Bairro', 'Pavimentadas', 'Parcialmente', 'Sem pavimentação', 'Total']],
          body: neighborhoodRows,
          startY: startY + 4,
          styles: { fontSize: 9 },
        });
      }
    } else {
      const compareRows = (a, b) => {
        const bairroA = (a[1] || '').toLowerCase();
        const bairroB = (b[1] || '').toLowerCase();
        if (bairroA < bairroB) return -1;
        if (bairroA > bairroB) return 1;
        const nameA = (a[0] || '').toLowerCase();
        const nameB = (b[0] || '').toLowerCase();
        if (nameA < nameB) return -1;
        if (nameA > nameB) return 1;
        return 0;
      };

      const pavedRows = streetData
        .filter(s => s.status === 'paved')
        .map(s => [s.name, s.bairro?.name || '-', 'Pavimentada'])
        .sort(compareRows);

      const partialRows = streetData
        .filter(s => s.status === 'partially_paved')
        .map(s => [s.name, s.bairro?.name || '-', 'Parcialmente'])
        .sort(compareRows);

      const unpavedRows = streetData
        .filter(s => s.status === 'unpaved')
        .map(s => [s.name, s.bairro?.name || '-', 'Sem pavimentação'])
        .sort(compareRows);

      if (pavedRows.length) {
        doc.setFontSize(12);
        doc.text('Ruas Pavimentadas', 14, startY);
        doc.autoTable({ head: [['Rua', 'Bairro', 'Status']], body: pavedRows, startY: startY + 4, styles: { fontSize: 9 } });
        startY = doc.lastAutoTable.finalY + 6;
      }
      if (partialRows.length) {
        doc.text('Ruas Parcialmente Pavimentadas', 14, startY);
        doc.autoTable({ head: [['Rua', 'Bairro', 'Status']], body: partialRows, startY: startY + 4, styles: { fontSize: 9 } });
        startY = doc.lastAutoTable.finalY + 6;
      }
      if (unpavedRows.length) {
        doc.text('Ruas Sem Pavimentação', 14, startY);
        doc.autoTable({ head: [['Rua', 'Bairro', 'Status']], body: unpavedRows, startY: startY + 4, styles: { fontSize: 9 } });
      }
    }
    return doc;
  };

  const pdfToBase64 = async (doc) => {
    return new Promise((resolve, reject) => {
      try {
        const pdfBlob = doc.output('blob');
        const reader = new FileReader();
        reader.onloadend = () => {
          const base64String = reader.result.split(',')[1];
          resolve(base64String);
        };
        reader.onerror = reject;
        reader.readAsDataURL(pdfBlob);
      } catch (e) {
        reject(e);
      }
    });
  };

  const handleDownloadPdf = async () => {
    setDownloading(true);
    try {
      const doc = generatePdf(reportScope);
      const fileName = `relatorio_pavimentacao_${new Date().toISOString().split('T')[0]}.pdf`;
      const isNative = Capacitor.isNativePlatform();
      if (isNative) {
        try {
          const permissionStatus = await LocalNotifications.checkPermissions();
          if (permissionStatus.display !== 'granted') {
            await LocalNotifications.requestPermissions();
          }
          const base64Data = await pdfToBase64(doc);
          const platform = Capacitor.getPlatform();
          let downloadPath = fileName;
          let directory = Directory.Documents;
          if (platform === 'android') {
            directory = Directory.Documents;
            downloadPath = `Download/${fileName}`;
          } else if (platform === 'ios') {
            directory = Directory.Documents;
            downloadPath = fileName;
          }
          await Filesystem.writeFile({ path: downloadPath, data: base64Data, directory, recursive: true });
          const notificationId = Math.floor(Date.now() % 2147483647);
          await LocalNotifications.schedule({
            notifications: [
              { title: 'Download Concluído', body: 'Relatório salvo com sucesso. Toque para abrir.', id: notificationId, schedule: { at: new Date(Date.now() + 100) } },
            ],
          });
          toast({ title: 'Download concluído!' });
        } catch (error) {
          toast({ title: 'Erro ao baixar relatório', description: 'Não foi possível salvar o relatório. Tente novamente.', variant: 'destructive' });
        }
      } else {
        doc.save(fileName);
        toast({ title: 'Download concluído!', description: 'O download do seu PDF foi iniciado.' });
      }
    } catch (error) {
      toast({ title: 'Erro ao gerar relatório', description: error.message || 'Não foi possível gerar o relatório.', variant: 'destructive' });
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
      <div className="flex flex-col bg-[#F9FAFB] md:px-6">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="px-4 md:px-6 lg:px-10 xl:px-14 pt-4 pb-8 space-y-8 max-w-[88rem] mx-auto w-full"
        >
          <div className="space-y-3">
            <p className="text-[11px] font-semibold tracking-[0.18em] text-[#9CA3AF] uppercase flex items-center gap-2">
              <span className="inline-block w-1 h-3 rounded-full bg-tc-red" />
              Infraestrutura
            </p>
            <div>
              <h1 className="text-xl md:text-2xl lg:text-3xl font-bold text-[#111827]">Mapa de Pavimentação</h1>
              <p className="text-xs lg:text-sm text-[#6B7280] max-w-2xl">
                Visualize o status da pavimentação e acesse relatórios detalhados.
              </p>
              {lastUpdate && (
                <p className="text-[11px] text-[#6B7280] mt-1 flex items-center gap-2">
                  <RefreshCw className="w-3.5 h-3.5" />
                  Última atualização: {new Date(lastUpdate).toLocaleString('pt-BR')}
                </p>
              )}
            </div>
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 md:gap-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[10px] text-[#6B7280]">Conteúdo do PDF:</span>
                <button
                  type="button"
                  onClick={() => setReportScope('streets')}
                  className={`px-2 py-0.5 rounded-full border text-[10px] ${
                    reportScope === 'streets'
                      ? 'bg-[#111827] text-white border-[#111827]'
                      : 'bg-white text-[#4B5563] border-[#E5E7EB]'
                  }`}
                >
                  Todas as ruas
                </button>
                <button
                  type="button"
                  onClick={() => setReportScope('neighborhoods')}
                  className={`px-2 py-0.5 rounded-full border text-[10px] ${
                    reportScope === 'neighborhoods'
                      ? 'bg-[#111827] text-white border-[#111827]'
                      : 'bg-white text-[#4B5563] border-[#E5E7EB]'
                  }`}
                >
                  Resumo por bairro
                </button>
              </div>
              <div>
                <Button onClick={handleDownloadPdf} disabled={downloading} className="w-full md:w-auto">
                  {downloading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Baixando...
                    </>
                  ) : (
                    <>
                      <Download className="mr-2 h-4 w-4" />
                      Baixar Relatório
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>

        <motion.div
          className="bg-white border border-[#E5E7EB] rounded-2xl p-3 shadow-sm"
          variants={containerVariants}
          initial="hidden"
          animate="visible"
        >
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <motion.button
              type="button"
              variants={itemVariants}
              onClick={() => handleStreetListClick('paved', 'Ruas Pavimentadas')}
              className="flex items-center justify-between rounded-xl px-3 py-3 text-left transition cursor-pointer border border-transparent hover:border-[#16A34A]/40 hover:shadow-md"
            >
              <div>
                <div className="text-[11px] md:text-xs text-[#15803D]">Pavimentadas</div>
                <div className="text-xl md:text-2xl font-extrabold text-[#15803D] leading-tight">
                  {stats.paved}
                </div>
              </div>
              <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-[#16A34A] text-white">
                <HardHat className="w-4 h-4" />
              </div>
            </motion.button>

            <motion.button
              type="button"
              variants={itemVariants}
              onClick={() => handleStreetListClick('partially_paved', 'Ruas Parcialmente Pavimentadas')}
              className="flex items-center justify-between rounded-xl px-3 py-3 text-left transition cursor-pointer border border-transparent hover:border-[#D97706]/40 hover:shadow-md"
            >
              <div>
                <div className="text-[11px] md:text-xs text-[#B45309]">Parcialmente Pavimentadas</div>
                <div className="text-xl md:text-2xl font-extrabold text-[#B45309] leading-tight">
                  {stats.partially_paved}
                </div>
              </div>
              <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-[#D97706] text-white">
                <Construction className="w-4 h-4" />
              </div>
            </motion.button>

            <motion.button
              type="button"
              variants={itemVariants}
              onClick={() => handleStreetListClick('unpaved', 'Ruas Sem Pavimentação')}
              className="flex items-center justify-between rounded-xl px-3 py-3 text-left transition cursor-pointer border border-transparent hover:border-[#DC2626]/40 hover:shadow-md"
            >
              <div>
                <div className="text-[11px] md:text-xs text-[#B91C1C]">Sem Pavimentação</div>
                <div className="text-xl md:text-2xl font-extrabold text-[#B91C1C] leading-tight">
                  {stats.unpaved}
                </div>
              </div>
              <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-[#DC2626] text-white">
                <ThumbsDown className="w-4 h-4" />
              </div>
            </motion.button>
          </div>
        </motion.div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
          <motion.div variants={itemVariants} className="lg:col-span-2 bg-white rounded-2xl shadow-sm border border-[#E5E7EB] overflow-hidden">
            <div className="px-3 pt-3 pb-2 border-b border-[#E5E7EB] space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-[11px] text-[#6B7280]">Explorar ruas</p>
                  <p className="text-xs font-medium text-[#111827]">
                    {stats.total} ruas mapeadas em Floresta
                  </p>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 px-3 rounded-full text-[11px] border-[#E5E7EB] text-[#374151] bg-white"
                    >
                      <span>{getFilterLabel()}</span>
                      <Filter className="w-3.5 h-3.5 ml-1 text-[#6B7280]" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent className="w-56 bg-white text-foreground border border-[#E5E7EB]">
                    <DropdownMenuLabel className="text-tc-red">Status</DropdownMenuLabel>
                    <DropdownMenuSeparator className="bg-[#E5E7EB]" />
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
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#9CA3AF]" />
                <Input
                  id="search"
                  type="text"
                  placeholder="Buscar por rua ou bairro..."
                  className="pl-9 h-9 text-xs md:text-sm bg-white border-[#E5E7EB]"
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
            <div className="border-t border-[#E5E7EB] px-3 py-2 bg-[#F9FAFB] flex flex-wrap items-center gap-3 text-[11px] text-[#4B5563]">
              <span className="font-semibold">Legenda</span>
              <span className="inline-flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full bg-[#16A34A]" />
                Pavimentada
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full bg-[#D97706]" />
                Parcialmente
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full bg-[#6B7280]" />
                Sem pavimentação
              </span>
            </div>
          </motion.div>
          <motion.div variants={itemVariants} className="bg-white border border-[#E5E7EB] rounded-2xl p-6 flex flex-col shadow-sm">
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
                      <p>{street.name}</p>
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

export default PavementMapPage;

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Helmet } from 'react-helmet';
import { motion } from 'framer-motion';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, RadialBarChart, RadialBar, Cell, PieChart, Pie, LabelList, Label } from 'recharts';
import { toPng } from 'html-to-image';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/customSupabaseClient';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertTriangle, Clock, CheckCircle, BarChart3, Download, HardHat, Wrench, Loader2, LineChart as LineChartIcon, Layers, RefreshCw, ChevronLeft, ChevronRight, PlusCircle } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Combobox } from '@/components/ui/combobox';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import WorksStatsReports from '@/components/WorksStatsReports';
import { useCityView, CityViewProvider } from '@/contexts/CityContext';
import { MapPin, Check, Globe, Search } from 'lucide-react';
import CitySelector from '@/components/CitySelector';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { LocalNotifications } from '@capacitor/local-notifications';
import { FileOpener } from '@capacitor-community/file-opener';
import { useTheme } from '@/design-system/theme/ThemeProvider';

// Le o valor computado de um token de design em runtime. O Recharts recebe
// cor por prop JS (nao por classe CSS), entao os tokens de grafico (canal
// RGB, ex: "217 119 6") precisam ser lidos do DOM e embrulhados em rgb().
// So funciona no cliente (getComputedStyle) - chamado dentro de useMemo no
// corpo do componente, entao roda apos a primeira montagem/commit do React.
const readColorToken = (name) => {
  if (typeof window === 'undefined' || typeof document === 'undefined') return undefined;
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value ? `rgb(${value})` : undefined;
};

const CustomTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    return (
      <div className="max-w-[180px] bg-background/90 backdrop-blur-sm p-3 border border-border rounded-lg shadow-lg">
        <p className="label font-bold text-foreground">{label}</p>
        {payload.map((p, i) => (
          <p key={i} style={{ color: p.color }} className="text-sm">
            {`${p.name}: ${p.value}`}
          </p>
        ))}
      </div>
    );
  }
  return null;
};

// Recebe a lista de status com cor ja resolvida (depende do tema, entao vem
// de ReportsStats via useMemo em vez de ler uma constante de modulo).
const TimelineLegend = ({ statuses }) => (
  <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-2 pt-2 text-[11px] sm:justify-start sm:text-xs">
    {statuses.map((status) => (
      <div key={status.key} className="inline-flex items-center gap-1.5 text-content-secondary">
        <span
          className="h-2.5 w-2.5 rounded-sm"
          style={{ backgroundColor: status.color }}
          aria-hidden="true"
        />
        <span className="font-medium">{status.label}</span>
      </div>
    ))}
  </div>
);

const TimelineFloatingTooltip = ({ tooltip }) => {
  if (!tooltip) return null;

  return (
    <div
      className="absolute z-20 w-[180px] rounded-lg border border-border bg-background/95 p-3 shadow-lg backdrop-blur-sm pointer-events-none"
      style={{ left: tooltip.left, top: tooltip.top }}
    >
      <p className="font-bold text-foreground">{tooltip.label}</p>
      {tooltip.payload.map((item) => (
        <p key={item.key} className="text-sm" style={{ color: item.color }}>
          {`${item.label}: ${item.value}`}
        </p>
      ))}
    </div>
  );
};

// Status das broncas exibidos no grafico temporal. So key/label aqui - a cor
// depende do tema e e resolvida dentro do componente (ver chartColors).
const TIMELINE_STATUS_META = [
  { key: 'pending', label: 'Pendentes' },
  { key: 'in-progress', label: 'Em Andamento' },
  { key: 'resolved', label: 'Resolvidas' },
];

const MONTH_LABELS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

// Anos distintos presentes nos dados (ordenados do mais antigo ao mais recente).
const getAvailableYears = (reports) => {
  const years = new Set();
  reports.forEach((report) => {
    if (!report.created_at) return;
    const date = new Date(report.created_at);
    if (Number.isNaN(date.getTime())) return;
    years.add(date.getFullYear());
  });
  return Array.from(years).sort((a, b) => a - b);
};

const buildTimelineData = (reports, view, selectedYear) => {
  // Visão mensal: sempre exibir os 12 meses (Jan–Dez) do ano selecionado,
  // preenchendo com zero os meses sem registros. O ano fica no seletor do card.
  if (view === 'monthly') {
    const months = MONTH_LABELS.map((label, monthIndex) => {
      const entry = { key: `${selectedYear}-${monthIndex}`, label, sortValue: monthIndex };
      TIMELINE_STATUS_META.forEach((s) => { entry[s.key] = 0; });
      return entry;
    });

    reports.forEach((report) => {
      if (!report.created_at) return;
      const date = new Date(report.created_at);
      if (Number.isNaN(date.getTime())) return;
      if (date.getFullYear() !== selectedYear) return;
      const entry = months[date.getMonth()];
      if (Object.prototype.hasOwnProperty.call(entry, report.status)) {
        entry[report.status] += 1;
      }
    });

    return months;
  }

  // Visão anual: uma barra por ano com dados.
  const buckets = new Map();
  reports.forEach((report) => {
    if (!report.created_at) return;
    const date = new Date(report.created_at);
    if (Number.isNaN(date.getTime())) return;

    const year = date.getFullYear();
    const key = `${year}`;
    if (!buckets.has(key)) {
      const entry = { key, label: `${year}`, sortValue: year };
      TIMELINE_STATUS_META.forEach((s) => { entry[s.key] = 0; });
      buckets.set(key, entry);
    }
    const entry = buckets.get(key);
    if (Object.prototype.hasOwnProperty.call(entry, report.status)) {
      entry[report.status] += 1;
    }
  });

  return Array.from(buckets.values()).sort((a, b) => a.sortValue - b.sortValue);
};

const ReportsStats = () => {
  const { cityId: activeCityId } = useCityView();
  const [stats, setStats] = useState({
    total: 0,
    pending: 0,
    inProgress: 0,
    resolved: 0,
    reports: [],
    compesa: {
      totalBuracos: 0,
      buracosCompesa: 0,
      percentualCompesa: 0,
    },
  });
  const [categoryData, setCategoryData] = useState([]);
  const [statusData, setStatusData] = useState([]);
  const [categoryFilter, setCategoryFilter] = useState('all'); // all | buracos
  const [timelineView, setTimelineView] = useState('monthly'); // monthly | annual
  const [chartType, setChartType] = useState('grouped'); // grouped | stacked | line
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [chartDownloading, setChartDownloading] = useState(false);
  const [timelineTooltip, setTimelineTooltip] = useState(null);
  const { toast } = useToast();
  const timelineChartRef = useRef(null);
  const timelineTooltipLayerRef = useRef(null);
  const { resolved: resolvedTheme } = useTheme();

  // Cores dos graficos lidas dos tokens CSS em runtime. Recalcula sempre que
  // o tema resolvido muda, para o Recharts (que so aceita cor via prop JS)
  // acompanhar a troca claro/escuro.
  const chartColors = useMemo(() => ({
    pending: readColorToken('--chart-pending'),
    progress: readColorToken('--chart-progress'),
    resolved: readColorToken('--chart-resolved'),
    categories: [1, 2, 3, 4, 5, 6, 7].map((n) => readColorToken(`--chart-cat-${n}`)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [resolvedTheme]);

  // Paleta categorica (broncas por categoria, origem dos buracos etc).
  const COLORS = chartColors.categories;

  // TIMELINE_STATUS_META + cor resolvida do tema, para legenda e series do grafico.
  const timelineStatus = useMemo(() => ([
    { ...TIMELINE_STATUS_META[0], color: chartColors.pending },
    { ...TIMELINE_STATUS_META[1], color: chartColors.progress },
    { ...TIMELINE_STATUS_META[2], color: chartColors.resolved },
  ]), [chartColors]);

  const fetchStats = useCallback(async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('reports')
        .select('*, category:categories(id, name)')
        .eq('moderation_status', 'approved')
        .neq('status', 'duplicate');
      if (activeCityId) query = query.eq('city_id', activeCityId);
      const { data: reports, error } = await query.order('created_at', { ascending: false });

      if (error) throw error;

      const total = reports.length;
      const pending = reports.filter(r => r.status === 'pending').length;
      const inProgress = reports.filter(r => r.status === 'in-progress').length;
      const resolved = reports.filter(r => r.status === 'resolved').length;

      const buracos = reports.filter(r => r.category?.id === 'buracos');
      const buracosFromWaterUtility = buracos.filter(r => r.is_from_water_utility).length;
      const totalBuracos = buracos.length;
      const percentualFromWaterUtility = totalBuracos > 0 ? (buracosFromWaterUtility / totalBuracos) * 100 : 0;

      setStats({ 
        total, 
        pending, 
        inProgress, 
        resolved, 
        reports,
        waterUtility: {
          totalBuracos,
          buracosFromWaterUtility,
          percentualFromWaterUtility,
        },
      });

      // Distribuições serão recalculadas abaixo conforme filtro
      const recompute = () => {
        const filtered = categoryFilter === 'buracos'
          ? reports.filter(r => r.category?.id === 'buracos')
          : reports;

        const statusDistribution = [
          { name: 'Pendentes', value: filtered.filter(r => r.status === 'pending').length, fill: chartColors.pending },
          { name: 'Em Andamento', value: filtered.filter(r => r.status === 'in-progress').length, fill: chartColors.progress },
          { name: 'Resolvidas', value: filtered.filter(r => r.status === 'resolved').length, fill: chartColors.resolved },
        ];
        setStatusData(statusDistribution);

        if (categoryFilter === 'all') {
          const categoryCounts = filtered.reduce((acc, report) => {
            const categoryName = report.category?.name || 'Outros';
            acc[categoryName] = (acc[categoryName] || 0) + 1;
            return acc;
          }, {});

          const categoryDistribution = Object.entries(categoryCounts)
            .map(([name, value], index) => ({ name, value, fill: COLORS[index % COLORS.length] }))
            .sort((a, b) => b.value - a.value);
          setCategoryData(categoryDistribution);
        } else {
          // Para filtro "buracos", mantemos categoryData vazio e usamos gráfico específico
          setCategoryData([]);
        }
      };
      recompute();

    } catch (error) {
      toast({
        title: "Erro ao buscar estatísticas",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
    // COLORS e so um apelido para chartColors.categories (mesma referencia
    // a cada memo), entao chartColors ja cobre a dependencia.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toast, categoryFilter, activeCityId, chartColors]);

  // Recalcular distribuições quando mudar o filtro sem reconsultar o backend
  useEffect(() => {
    if (!stats.reports || stats.reports.length === 0) return;
    const filtered = categoryFilter === 'buracos'
      ? stats.reports.filter(r => r.category?.id === 'buracos')
      : stats.reports;
    const statusDistribution = [
      { name: 'Pendentes', value: filtered.filter(r => r.status === 'pending').length, fill: chartColors.pending },
      { name: 'Em Andamento', value: filtered.filter(r => r.status === 'in-progress').length, fill: chartColors.progress },
      { name: 'Resolvidas', value: filtered.filter(r => r.status === 'resolved').length, fill: chartColors.resolved },
    ];
    setStatusData(statusDistribution);
    if (categoryFilter === 'all') {
      const categoryCounts = filtered.reduce((acc, report) => {
        const categoryName = report.category?.name || 'Outros';
        acc[categoryName] = (acc[categoryName] || 0) + 1;
        return acc;
      }, {});
      const categoryDistribution = Object.entries(categoryCounts)
        .map(([name, value], index) => ({ name, value, fill: COLORS[index % COLORS.length] }))
        .sort((a, b) => b.value - a.value);
      setCategoryData(categoryDistribution);
    } else {
      setCategoryData([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categoryFilter, stats.reports, chartColors]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  // Listener para abrir o arquivo quando clicar na notificação
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    if (window.__tcNotifListenerInstalled) return;

    let notificationListener = null;

    const setupListener = async () => {
      notificationListener = await LocalNotifications.addListener('localNotificationActionPerformed', async (notification) => {
        const filePath = notification.notification.extra?.filePath;
        const contentType = notification.notification.extra?.contentType;
        
        if (filePath) {
          try {
            await FileOpener.open({
              filePath: filePath,
              contentType: contentType || 'application/pdf'
            });
          } catch (error) {
            console.error('Erro ao abrir arquivo:', error);
            toast({
              title: "Erro ao abrir arquivo",
              description: "Não foi possível abrir o relatório.",
              variant: "destructive",
            });
          }
        }
      });
    };

    setupListener();

    return () => {
      if (notificationListener) {
        notificationListener.remove();
      }
    };
  }, [toast]);

  // Função auxiliar para gerar o PDF
  const generatePdf = () => {
    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text("Relatório de Broncas - Trombone Cidadão", 14, 22);
    doc.setFontSize(11);
    doc.setTextColor(100);
    doc.text(`Gerado em: ${new Date().toLocaleDateString('pt-BR')} ${new Date().toLocaleTimeString('pt-BR')}`, 14, 28);
    
    let yPosition = 40;

    // Seções listadas por status (apenas pendentes e em andamento)

    const reportsToInclude = stats.reports
      .filter(report => report.status === 'pending' || report.status === 'in-progress');

    const groupedByStatus = reportsToInclude.reduce((acc, report) => {
      const status = report.status;
      if (!acc[status]) {
        acc[status] = [];
      }
      acc[status].push(report);
      return acc;
    }, {});

    ['pending', 'in-progress'].forEach(status => {
      if (!groupedByStatus[status]) return;
      
      const statusTitle = status === 'pending' ? 'Broncas Pendentes' : 'Broncas em Andamento';
      doc.setFontSize(14);
      doc.setFont(undefined, 'bold');
      doc.text(statusTitle, 14, yPosition);
      yPosition += 8;
      doc.setFont(undefined, 'normal');

      const groupedByCategory = groupedByStatus[status].reduce((acc, report) => {
        const categoryName = report.category?.name || 'Sem Categoria';
        if (!acc[categoryName]) {
          acc[categoryName] = [];
        }
        acc[categoryName].push(report);
        return acc;
      }, {});
      
      Object.keys(groupedByCategory).forEach(categoryName => {
        doc.setFontSize(12);
        doc.setFont(undefined, 'bold');
        doc.text(`${categoryName} (${groupedByCategory[categoryName].length} ${groupedByCategory[categoryName].length > 1 ? 'broncas' : 'bronca'})`, 14, yPosition);
        doc.setFont(undefined, 'normal');
        yPosition += 6;

        const isBuracos = /buraco/i.test(categoryName || '');
        const isIluminacao = /ilumina/i.test(categoryName || '');
        const tableColumn = isBuracos
          ? ["#", "Protocolo", "Título", "Origem", "Endereço", "Data"]
          : isIluminacao
            ? ["#", "Protocolo", "Poste", "Título", "Endereço", "Data"]
            : ["#", "Protocolo", "Título", "Endereço", "Data"];
        const tableRows = [];
        
        groupedByCategory[categoryName].forEach((report, index) => {
          const common = [
            index + 1,
            report.protocol,
          ];
          const end = [
            doc.splitTextToSize(report.address || 'N/A', 50),
            new Date(report.created_at).toLocaleDateString('pt-BR'),
          ];
          if (isBuracos) {
            const title = doc.splitTextToSize(report.title, 60);
            const origem = report.is_from_water_utility ? 'Abastecimento' : 'Outros';
            tableRows.push([...common, title, origem, ...end]);
          } else if (isIluminacao) {
            const poste = String(report.pole_number || report.reported_plate || report.reported_post_identifier || '').trim() || '—';
            const title = doc.splitTextToSize(report.title, 50);
            tableRows.push([...common, poste, title, ...end]);
          } else {
            const title = doc.splitTextToSize(report.title, 60);
            tableRows.push([...common, title, ...end]);
          }
        });
        
        doc.autoTable({
          head: [tableColumn],
          body: tableRows,
          startY: yPosition,
          theme: 'grid',
          headStyles: { fillColor: [239, 68, 68] }, // Red color for header
          didDrawPage: (data) => {
            yPosition = data.cursor.y + 10;
          }
        });
        yPosition = doc.previousAutoTable.finalY + 10;
      });
    });

    if (yPosition === 40) { // No reports were added
      doc.text("Não há broncas pendentes ou em andamento para relatar.", 14, yPosition);
    }
    
    return doc;
  };

  // Função para converter PDF para base64
  const pdfToBase64 = async (doc) => {
    return new Promise((resolve, reject) => {
      try {
        const pdfBlob = doc.output('blob');
        const reader = new FileReader();
        
        reader.onloadend = () => {
          const base64Data = reader.result.split(',')[1];
          resolve(base64Data);
        };
        
        reader.onerror = () => {
          reject(new Error('Erro ao converter PDF para base64'));
        };
        
        reader.readAsDataURL(pdfBlob);
      } catch (error) {
        reject(error);
      }
    });
  };

  const savePdfDocument = useCallback(async ({ doc, fileName, successTitle, successDescription }) => {
    const isNative = Capacitor.isNativePlatform();

    if (isNative) {
      const permissionStatus = await LocalNotifications.checkPermissions();
      if (permissionStatus.display !== 'granted') {
        await LocalNotifications.requestPermissions();
      }

      const base64Data = await pdfToBase64(doc);
      const platform = Capacitor.getPlatform();

      let downloadPath = fileName;
      let directory = Directory.Documents;

      if (platform === 'android') {
        try { await Filesystem.requestPermissions(); } catch {}
        directory = Directory.ExternalStorage;
        downloadPath = `Download/${fileName}`;
      } else if (platform === 'ios') {
        directory = Directory.Documents;
        downloadPath = fileName;
      }

      await Filesystem.writeFile({
        path: downloadPath,
        data: base64Data,
        directory,
        recursive: true,
      });

      const uriResult = await Filesystem.getUri({
        directory,
        path: downloadPath,
      });

      await LocalNotifications.schedule({
        notifications: [
          {
            title: 'Download Concluído',
            body: `${fileName} salvo com sucesso. Toque para abrir.`,
            id: Math.floor(Date.now() % 2147483647),
            schedule: { at: new Date(Date.now() + 100) },
            extra: {
              filePath: uriResult.uri,
              contentType: 'application/pdf',
            },
          },
        ],
      });

      toast({
        title: successTitle,
        description: successDescription,
      });
      return;
    }

    doc.save(fileName);
    toast({
      title: successTitle,
      description: successDescription,
    });
  }, [toast]);

  const handleDownloadPdf = async () => {
    setDownloading(true);
    try {
      const doc = generatePdf();
      const fileName = `relatorio_broncas_${new Date().toISOString().split('T')[0]}.pdf`;
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
            try { await Filesystem.requestPermissions(); } catch {}
            directory = Directory.ExternalStorage;
            downloadPath = `Download/${fileName}`;
          } else if (platform === 'ios') {
            directory = Directory.Documents;
            downloadPath = fileName;
          }

          await Filesystem.writeFile({
            path: downloadPath,
            data: base64Data,
            directory,
            recursive: true,
          });

          const uriResult = await Filesystem.getUri({
            directory,
            path: downloadPath,
          });
          const fileUri = uriResult.uri;

          const notificationId = Math.floor(Date.now() % 2147483647);

          await LocalNotifications.schedule({
            notifications: [
              {
                title: 'Download Concluído',
                body: 'Relatório salvo com sucesso. Toque para abrir.',
                id: notificationId,
                schedule: { at: new Date(Date.now() + 100) },
                extra: {
                  filePath: fileUri,
                  contentType: 'application/pdf',
                },
              },
            ],
          });

          toast({
            title: 'Download concluído!',
          });
        } catch (error) {
          console.error('Erro ao salvar PDF:', error);
          toast({
            title: 'Erro ao baixar relatório',
            description: 'Não foi possível salvar o relatório. Tente novamente.',
            variant: 'destructive',
          });
        }
      } else {
        doc.save(fileName);

        toast({
          title: 'Download concluído!',
          description: 'O download do seu PDF foi iniciado.',
        });
      }
    } catch (error) {
      console.error('Erro ao gerar PDF:', error);
      toast({
        title: 'Erro ao gerar relatório',
        description: error.message || 'Não foi possível gerar o relatório. Tente novamente.',
        variant: 'destructive',
      });
    } finally {
      setTimeout(() => setDownloading(false), 1000);
    }
  };

  const availableYears = useMemo(
    () => getAvailableYears(stats.reports || []),
    [stats.reports]
  );

  // Se o ano selecionado não tiver dados, cair para o ano mais recente disponível.
  useEffect(() => {
    if (availableYears.length === 0) return;
    if (!availableYears.includes(selectedYear)) {
      setSelectedYear(availableYears[availableYears.length - 1]);
    }
  }, [availableYears, selectedYear]);

  useEffect(() => {
    const handlePointerOutsideChart = (event) => {
      const chartElement = timelineChartRef.current;
      if (!chartElement) return;
      if (chartElement.contains(event.target)) return;
      // Apenas esconder o tooltip flutuante. NÃO remontar o gráfico aqui:
      // alterar a key do chart a cada clique causava flicker e re-subscrições.
      setTimelineTooltip((current) => (current ? null : current));
    };

    document.addEventListener('pointerdown', handlePointerOutsideChart);
    return () => {
      document.removeEventListener('pointerdown', handlePointerOutsideChart);
    };
  }, []);

  const timelineData = useMemo(
    () => buildTimelineData(stats.reports || [], timelineView, selectedYear),
    [stats.reports, timelineView, selectedYear]
  );

  const clearTimelineTooltip = useCallback(() => {
    setTimelineTooltip(null);
  }, []);

  const updateTimelineTooltip = useCallback((chartState) => {
    if (!timelineChartRef.current || !timelineTooltipLayerRef.current) return;

    if (!chartState?.activeCoordinate || !chartState?.activePayload?.length) {
      setTimelineTooltip(null);
      return;
    }

    const chartRect = timelineChartRef.current.getBoundingClientRect();
    const layerRect = timelineTooltipLayerRef.current.getBoundingClientRect();
    const tooltipWidth = 180;
    const tooltipHeight = 96;
    const pointX = chartRect.left - layerRect.left + chartState.activeCoordinate.x;
    const pointY = chartRect.top - layerRect.top + chartState.activeCoordinate.y;
    const left = Math.min(
      Math.max(pointX - (tooltipWidth / 2), 8),
      Math.max(8, layerRect.width - tooltipWidth - 8)
    );
    const top = Math.max(
      8,
      pointY > 110
        ? pointY - tooltipHeight - 110
        : pointY - 82
    );

    setTimelineTooltip({
      left,
      top,
      label: chartState.activeLabel,
      payload: chartState.activePayload.map((item) => ({
        key: item.dataKey,
        label: item.name,
        value: item.value,
        color: item.color,
      })),
    });
  }, []);

  // Exporta o gráfico atual como PDF com gráfico e tabela dos valores exatos.
  const handleDownloadChartImage = async () => {
    if (!timelineChartRef.current) return;
    setChartDownloading(true);
    try {
      await new Promise((resolve) => {
        requestAnimationFrame(() => {
          requestAnimationFrame(resolve);
        });
      });

      // Fundo da captura acompanha o tema atual (nao fixo em branco): no tema
      // escuro, texto/traços claros sobre um PNG branco forcado ficariam
      // ilegiveis. O PDF passa a refletir exatamente o que o usuario ve na tela.
      const dataUrl = await toPng(timelineChartRef.current, {
        backgroundColor: readColorToken('--surface-raised'),
        pixelRatio: 2,
        cacheBust: true,
      });

      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.getWidth();
      const margin = 14;
      const chartWidth = pageWidth - (margin * 2);
      const chartHeight = 84;
      const viewLabel = timelineView === 'monthly' ? 'Mensal' : 'Anual';
      const chartTypeLabel = chartType === 'grouped'
        ? 'Barras agrupadas'
        : chartType === 'stacked'
          ? 'Barras empilhadas'
          : 'Linha';
      const totals = timelineData.reduce((acc, entry) => {
        TIMELINE_STATUS_META.forEach((status) => {
          acc[status.key] += Number(entry[status.key] || 0);
        });
        return acc;
      }, { pending: 0, 'in-progress': 0, resolved: 0 });

      doc.setFontSize(16);
      doc.text('Painel do gráfico de broncas', margin, 18);
      doc.setFontSize(11);
      doc.setTextColor(100);
      doc.text(`Gerado em: ${new Date().toLocaleDateString('pt-BR')} ${new Date().toLocaleTimeString('pt-BR')}`, margin, 26);
      doc.text(`Visão: ${viewLabel}`, margin, 34);
      doc.text(`Ano: ${timelineView === 'monthly' ? selectedYear : 'Todos os anos disponíveis'}`, margin, 40);
      doc.text(`Tipo de gráfico: ${chartTypeLabel}`, margin, 46);
      doc.text(
        `Totais - Pendentes: ${totals.pending} | Em andamento: ${totals['in-progress']} | Resolvidas: ${totals.resolved}`,
        margin,
        52
      );

      doc.addImage(dataUrl, 'PNG', margin, 58, chartWidth, chartHeight);

      const tableRows = timelineData.map((entry) => {
        const total = TIMELINE_STATUS_META.reduce((sum, status) => sum + Number(entry[status.key] || 0), 0);
        return [
          entry.label,
          Number(entry.pending || 0),
          Number(entry['in-progress'] || 0),
          Number(entry.resolved || 0),
          total,
        ];
      });

      doc.autoTable({
        head: [['Período', 'Pendentes', 'Em andamento', 'Resolvidas', 'Total']],
        body: tableRows,
        startY: 150,
        theme: 'grid',
        headStyles: { fillColor: [239, 68, 68] },
      });

      const fileName = `grafico_broncas_${timelineView === 'monthly' ? selectedYear : 'anual'}_${new Date().toISOString().split('T')[0]}.pdf`;
      await savePdfDocument({
        doc,
        fileName,
        successTitle: 'Documento do gráfico baixado!',
        successDescription: 'O PDF foi gerado com gráfico e tabela detalhada.',
      });
    } catch (error) {
      console.error('Erro ao exportar gráfico:', error);
      toast({
        title: 'Erro ao baixar documento',
        description: 'Não foi possível exportar o gráfico com os dados. Tente novamente.',
        variant: 'destructive',
      });
    } finally {
      setChartDownloading(false);
    }
  };

  if (loading) {
    return <div className="flex justify-center items-center h-96">Carregando estatísticas...</div>;
  }

  // Navegação de ano (seletor no canto do gráfico, só na visão mensal).
  const yearIndex = availableYears.indexOf(selectedYear);
  const hasPrevYear = yearIndex > 0;
  const hasNextYear = yearIndex >= 0 && yearIndex < availableYears.length - 1;
  const goToPrevYear = () => { if (hasPrevYear) setSelectedYear(availableYears[yearIndex - 1]); };
  const goToNextYear = () => { if (hasNextYear) setSelectedYear(availableYears[yearIndex + 1]); };

  const showBuracosInsight = categoryFilter === 'buracos' && stats.waterUtility.totalBuracos > 0;
  const buracosPercentValue = stats.waterUtility.percentualFromWaterUtility || 0;
  const buracosPercentLabel = buracosPercentValue.toLocaleString('pt-BR', {
    minimumFractionDigits: buracosPercentValue > 0 && buracosPercentValue < 1 ? 1 : 0,
    maximumFractionDigits: buracosPercentValue > 0 && buracosPercentValue < 1 ? 1 : 0,
  });

  return (
    <div className="space-y-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5, duration: 0.5 }}
      >
        <Card className="border border-edge-subtle bg-surface-raised rounded-2xl shadow-elevation-1">
          <CardHeader>
            <div className="flex flex-col gap-3">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="flex items-center justify-between gap-3">
                  <CardTitle className="text-sm md:text-base text-content-primary">
                    Estatísticas das broncas
                  </CardTitle>
                  {/* O relatorio sai dos dados deste card, entao o botao mora
                      aqui dentro em vez de flutuar solto acima dele. */}
                  <Button onClick={handleDownloadPdf} disabled={downloading} size="sm" className="shrink-0">
                    {downloading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Baixando...
                      </>
                    ) : (
                      <>
                        <Download className="mr-2 h-4 w-4" />
                        <span className="hidden xs:inline">Baixar Relatório</span>
                        <span className="xs:hidden">Relatório</span>
                      </>
                    )}
                  </Button>
                </div>
                <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                  {/* Seletor de ano (canto superior direito) — só na visão mensal */}
                  {timelineView === 'monthly' && (
                    <div className="flex items-center gap-1 rounded-md border border-input px-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0"
                        onClick={goToPrevYear}
                        disabled={!hasPrevYear}
                        aria-label="Ano anterior"
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </Button>
                      <span className="min-w-[3rem] text-center text-sm font-semibold tabular-nums text-content-primary">
                        {selectedYear}
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0"
                        onClick={goToNextYear}
                        disabled={!hasNextYear}
                        aria-label="Próximo ano"
                      >
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                  <ToggleGroup
                    type="single"
                    value={timelineView}
                    onValueChange={(value) => value && setTimelineView(value)}
                    variant="outline"
                    size="sm"
                    className="justify-start sm:justify-end"
                  >
                    <ToggleGroupItem value="monthly" aria-label="Visão mensal">Mensal</ToggleGroupItem>
                    <ToggleGroupItem value="annual" aria-label="Visão anual">Anual</ToggleGroupItem>
                  </ToggleGroup>
                </div>
              </div>

              {/* Toolbar do gráfico: tipo (barras / empilhado / linha), atualizar e baixar imagem */}
              <div className="flex flex-wrap items-center justify-start gap-1 border-t border-edge-subtle pt-2 sm:justify-end">
                <ToggleGroup
                  type="single"
                  value={chartType}
                  onValueChange={(value) => value && setChartType(value)}
                  variant="outline"
                  size="sm"
                  className="gap-1"
                >
                  <ToggleGroupItem value="grouped" aria-label="Gráfico de barras" className="h-8 w-8 p-0">
                    <BarChart3 className="h-4 w-4" />
                  </ToggleGroupItem>
                  <ToggleGroupItem value="stacked" aria-label="Barras empilhadas" className="h-8 w-8 p-0">
                    <Layers className="h-4 w-4" />
                  </ToggleGroupItem>
                  <ToggleGroupItem value="line" aria-label="Gráfico de linha" className="h-8 w-8 p-0">
                    <LineChartIcon className="h-4 w-4" />
                  </ToggleGroupItem>
                </ToggleGroup>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 w-8 p-0"
                  onClick={fetchStats}
                  aria-label="Atualizar dados"
                >
                  <RefreshCw className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 w-8 p-0"
                  onClick={handleDownloadChartImage}
                  aria-label="Baixar documento do gráfico"
                  disabled={chartDownloading}
                >
                  {chartDownloading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Download className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent ref={timelineTooltipLayerRef} className="relative space-y-3">
            {!chartDownloading && <TimelineFloatingTooltip tooltip={timelineTooltip} />}
            <div className="-mx-2 overflow-x-auto overflow-y-visible px-2 sm:mx-0 sm:overflow-visible sm:px-0">
              <div
                ref={timelineChartRef}
                className={`h-72 bg-surface-raised sm:h-80 ${timelineView === 'monthly' ? 'min-w-[560px] sm:min-w-0' : 'min-w-full'}`}
              >
              {timelineData.length === 0 ? (
                <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                  Sem dados para exibir no período.
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  {chartType === 'line' ? (
                    <LineChart
                      key={`line-${timelineView}-${selectedYear}`}
                      data={timelineData}
                      margin={{ top: 8, right: 12, left: 0, bottom: 5 }}
                      onMouseMove={updateTimelineTooltip}
                      onClick={updateTimelineTooltip}
                      onMouseLeave={clearTimelineTooltip}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                      <XAxis dataKey="label" stroke="hsl(var(--muted-foreground))" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} interval={0} tickMargin={8} height={32} />
                      <YAxis stroke="hsl(var(--muted-foreground))" tick={{ fontSize: 12 }} tickLine={false} axisLine={false} allowDecimals={false} width={36} />
                      {timelineStatus.map((s) => (
                        <Line key={s.key} type="monotone" dataKey={s.key} name={s.label} stroke={s.color} strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
                      ))}
                    </LineChart>
                  ) : (
                    <BarChart
                      key={`bar-${timelineView}-${selectedYear}-${chartType}`}
                      data={timelineData}
                      margin={{ top: 8, right: 12, left: 0, bottom: 5 }}
                      onMouseMove={updateTimelineTooltip}
                      onClick={updateTimelineTooltip}
                      onMouseLeave={clearTimelineTooltip}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                      <XAxis dataKey="label" stroke="hsl(var(--muted-foreground))" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} interval={0} tickMargin={8} height={32} />
                      <YAxis stroke="hsl(var(--muted-foreground))" tick={{ fontSize: 12 }} tickLine={false} axisLine={false} allowDecimals={false} width={36} />
                      {timelineStatus.map((s, i) => (
                        <Bar
                          key={s.key}
                          dataKey={s.key}
                          name={s.label}
                          fill={s.color}
                          stackId={chartType === 'stacked' ? 'status' : undefined}
                          radius={chartType === 'stacked' ? (i === timelineStatus.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]) : [4, 4, 0, 0]}
                          maxBarSize={chartType === 'stacked' ? 40 : 28}
                        />
                      ))}
                    </BarChart>
                  )}
                </ResponsiveContainer>
              )}
              </div>
            </div>
            <TimelineLegend statuses={timelineStatus} />
          </CardContent>
        </Card>
      </motion.div>

      <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">
        <motion.div
          className="xl:col-span-3"
          initial={{ opacity: 0, x: -40 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.4, duration: 0.5 }}
        >
          <Card className="h-full border border-edge-subtle bg-surface-raised rounded-2xl shadow-elevation-1">
            <CardHeader>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <CardTitle className="text-sm md:text-base text-content-primary">
                    {categoryFilter === 'buracos' ? 'Buracos — origem do problema' : 'Broncas por categoria'}
                  </CardTitle>
                  {categoryFilter === 'buracos' && (
                    <p className="mt-1 text-xs text-content-secondary">
                      Total de buracos: <span className="font-semibold">{stats.waterUtility.totalBuracos}</span>
                    </p>
                  )}
                </div>
                <div>
                  <Combobox
                    value={categoryFilter}
                    onChange={setCategoryFilter}
                    options={[
                      { value: "all", label: "Todas as categorias" },
                      { value: "buracos", label: "Buracos" }
                    ]}
                    placeholder="Categoria"
                    searchPlaceholder="Buscar categoria..."
                    className="h-8 w-[150px] bg-surface-subtle/70 border-muted text-xs"
                  />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="h-96">
                {categoryFilter === 'buracos' ? (
                  <>
                    <ResponsiveContainer width="100%" height="80%">
                      <PieChart>
                        <Tooltip content={<CustomTooltip />} />
                        <Legend />
                        <Pie
                          data={[
                            { name: 'Companhia de abastecimento', value: stats.waterUtility.buracosFromWaterUtility, fill: chartColors.categories[2] },
                            { name: 'Outras Causas', value: Math.max(stats.waterUtility.totalBuracos - stats.waterUtility.buracosFromWaterUtility, 0), fill: chartColors.categories[6] },
                          ]}
                          dataKey="value"
                          nameKey="name"
                          cx="50%"
                          cy="50%"
                          innerRadius="55%"
                          outerRadius="80%"
                          paddingAngle={2}
                          stroke="hsl(var(--border))"
                        >
                          <Label
                            position="center"
                            value={`${buracosPercentLabel}%`}
                            style={{ fill: 'hsl(var(--foreground))', fontSize: 22, fontWeight: 700 }}
                          />
                        </Pie>
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="mt-3 text-xs text-muted-foreground">
                      Em Floresta, <span className="font-semibold">{stats.waterUtility.buracosFromWaterUtility} de {stats.waterUtility.totalBuracos}</span> broncas de
                      <span className="font-semibold"> buracos na via</span> foram marcadas como abertas pela
                      <span className="font-semibold"> companhia de abastecimento de água/esgoto</span>
                      {" "}(<span className="font-semibold">{buracosPercentLabel}%</span>).
                    </div>
                  </>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={categoryData} layout="vertical" margin={{ top: 8, right: 24, left: 12, bottom: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                      <XAxis type="number" stroke="hsl(var(--muted-foreground))" tick={{ fontSize: 12 }} />
                      <YAxis dataKey="name" type="category" width={110} tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }} />
                      <Tooltip content={<CustomTooltip />} />
                      <Bar dataKey="value" name="Quantidade" radius={[0, 8, 8, 0]} barSize={18}>
                        <LabelList dataKey="value" position="right" style={{ fill: 'hsl(var(--foreground))', fontSize: 12 }} />
                        {categoryData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.fill} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div
          className="xl:col-span-2"
          initial={{ opacity: 0, x: 40 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.6, duration: 0.5 }}
        >
          <Card className="h-full border border-edge-subtle bg-surface-raised rounded-2xl shadow-elevation-1">
            <CardHeader>
              <CardTitle className="text-sm md:text-base text-content-primary">
                Distribuição por status
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-96">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Tooltip content={<CustomTooltip />} />
                    <Legend iconSize={10} layout="vertical" verticalAlign="middle" align="right" wrapperStyle={{ color: 'hsl(var(--foreground))' }} />
                    <Pie
                      data={statusData}
                      dataKey="value"
                      nameKey="name"
                      cx="45%"
                      cy="50%"
                      innerRadius="50%"
                      outerRadius="75%"
                      paddingAngle={2}
                      stroke="hsl(var(--border))"
                    >
                      {statusData.map((entry, index) => (
                        <Cell key={`slice-${index}`} fill={entry.fill} />
                      ))}
                      <LabelList dataKey="value" position="inside" style={{ fill: 'white', fontSize: 12, fontWeight: 600 }} />
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </div>
  );
};

const PublicWorksStats = () => {
  const [works, setWorks] = useState([]);
  const [loading, setLoading] = useState(true);
  const { cityId: activeCityId } = useCityView();
  const { toast } = useToast();
  const { user } = useAuth();

  // Admin/master gerenciam qualquer cidade. Embaixador puro só pode cadastrar
  // a primeira obra da(s) própria(s) cidade(s) ativa(s).
  const isPureAmbassador = Boolean(user?.is_ambassador && !user?.is_admin && !user?.is_master);
  const [myActiveCityIds, setMyActiveCityIds] = useState([]);
  const canManageWorks = Boolean(
    user?.is_admin || user?.is_master ||
    (isPureAmbassador && activeCityId && myActiveCityIds.some((id) => String(id) === String(activeCityId)))
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

  const fetchWorks = useCallback(async () => {
    setLoading(true);
    try {
      let query = supabase.from('public_works').select('*, work_category:work_categories(name)');
      if (activeCityId) query = query.eq('city_id', activeCityId);
      const { data, error } = await query;
      if (error) throw error;
      setWorks(data);
    } catch (error) {
      toast({ title: "Erro ao buscar dados das obras", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [activeCityId, toast]);

  useEffect(() => {
    fetchWorks();
  }, [fetchWorks]);

  if (loading) {
    return <div className="flex justify-center items-center h-96">Carregando estatísticas das obras...</div>;
  }

  if (works.length === 0) {
    return (
      <Card className="p-10 text-center border-dashed">
        <HardHat className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
        <p className="text-lg font-semibold text-foreground mb-1">Nenhuma obra cadastrada</p>
        <p className="text-sm text-muted-foreground mb-4">
          Ainda não há obras públicas cadastradas {activeCityId ? 'para esta cidade' : ''}.
        </p>
        {canManageWorks && (
          <Link to="/obras/gerenciar">
            <Button className="gap-2">
              <PlusCircle className="w-4 h-4" /> Cadastrar primeira obra
            </Button>
          </Link>
        )}
      </Card>
    );
  }

  return <WorksStatsReports works={works} />;
};

const StatsPage = () => {
  const { cityId: activeCityId } = useCityView();
  const [summary, setSummary] = useState({
    total: 0,
    pending: 0,
    inProgress: 0,
    resolved: 0,
  });
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('reports');

  useEffect(() => {
    const fetchSummary = async () => {
      setSummaryLoading(true);
      try {
        let query = supabase
          .from('reports')
          .select('status')
          .eq('moderation_status', 'approved')
          .neq('status', 'duplicate');
        if (activeCityId) query = query.eq('city_id', activeCityId);
        const { data, error } = await query;

        if (error) throw error;

        const total = data.length;
        const pending = data.filter(r => r.status === 'pending').length;
        const inProgress = data.filter(r => r.status === 'in-progress').length;
        const resolved = data.filter(r => r.status === 'resolved').length;

        setSummary({ total, pending, inProgress, resolved });
      } catch (error) {
        console.error('Erro ao buscar resumo de estatísticas:', error);
      } finally {
        setSummaryLoading(false);
      }
    };

    fetchSummary();
  }, [activeCityId]);

  // Cores por token semantico: total usa a marca (fundo cheio + texto
  // on-brand), os tres status usam o par bg-*Bg (pastel) / text-*Fg (mesma
  // familia dos badges de bronca em toda a app) - esse par ja e garantido
  // legivel nos dois temas, ao contrario de um icone branco fixo sobre cor
  // cheia (que so funciona no claro).
  const summaryCards = [
    {
      title: 'Total de Broncas',
      value: summary.total,
      iconBg: 'bg-brand',
      iconFg: 'text-content-onBrand',
      valueColor: 'text-brand',
    },
    {
      title: 'Pendentes',
      value: summary.pending,
      iconBg: 'bg-status-pendingBg',
      iconFg: 'text-status-pendingFg',
      valueColor: 'text-status-pendingFg',
    },
    {
      title: 'Em Andamento',
      value: summary.inProgress,
      iconBg: 'bg-status-progressBg',
      iconFg: 'text-status-progressFg',
      valueColor: 'text-status-progressFg',
    },
    {
      title: 'Resolvidas',
      value: summary.resolved,
      iconBg: 'bg-status-resolvedBg',
      iconFg: 'text-status-resolvedFg',
      valueColor: 'text-status-resolvedFg',
    },
  ];


  return (
    <>
      <Helmet>
        <title>Estatísticas - Trombone Cidadão</title>
        <meta name="description" content="Veja as estatísticas detalhadas das solicitações e obras na plataforma Trombone Cidadão." />
      </Helmet>
      <div className="flex flex-col bg-surface-base md:px-6">
        <div className="px-4 md:px-6 lg:px-10 xl:px-14 pt-4 pb-8 space-y-8 max-w-[88rem] mx-auto w-full">
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            {/* So o seletor de cidade: o titulo e o texto de apoio sairam a
                pedido — a aba ja diz onde o usuario esta e o espaco vertical
                vale mais para os numeros. */}
            <div className="flex items-center justify-end">
              <CitySelector />
            </div>
          </motion.div>
          {/* O seletor Broncas/Obras vem logo apos o cabecalho: os cards de
              resumo sao especificos de Broncas e passaram para dentro da aba,
              em vez de empurrarem o seletor para baixo da dobra. */}
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full max-w-md grid-cols-2 bg-surface-raised/80 border border-edge-subtle rounded-xl">
              <TabsTrigger value="reports" className="gap-2 text-xs md:text-sm">
                <Wrench className="w-4 h-4" />
                Broncas
              </TabsTrigger>
              <TabsTrigger value="works" className="gap-2 text-xs md:text-sm">
                <HardHat className="w-4 h-4" />
                Obras Públicas
              </TabsTrigger>
            </TabsList>
            <TabsContent value="reports" className="mt-6 space-y-8">
              <motion.div
                className="grid grid-cols-2 sm:grid-cols-4 gap-2"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.15, duration: 0.4 }}
              >
                {summaryCards.map((card, index) => (
                  <Card
                    key={index}
                    className="border border-edge-subtle bg-surface-raised shadow-elevation-1 hover:shadow-elevation-2 transition-shadow duration-300 rounded-xl"
                  >
                    <div className="flex items-center justify-between px-3 py-3 lg:px-6 lg:py-6">
                      <div>
                        <div className={`text-[11px] md:text-xs ${card.valueColor}`}>
                          {card.title}
                        </div>
                        <div
                          className={`text-xl md:text-2xl font-extrabold leading-tight ${card.valueColor}`}
                        >
                          {summaryLoading ? '–' : card.value}
                        </div>
                      </div>
                      <div
                        className={`flex items-center justify-center w-8 h-8 md:w-9 md:h-9 rounded-xl ${card.iconBg} ${card.iconFg}`}
                      >
                        {index === 0 && <BarChart3 className="w-4 h-4" />}
                        {index === 1 && <AlertTriangle className="w-4 h-4" />}
                        {index === 2 && <Clock className="w-4 h-4" />}
                        {index === 3 && <CheckCircle className="w-4 h-4" />}
                      </div>
                    </div>
                  </Card>
                ))}
              </motion.div>
              <ReportsStats key={activeCityId ?? 'all'} />
            </TabsContent>
            <TabsContent value="works" className="mt-6">
              <PublicWorksStats key={activeCityId ?? 'all'} />
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </>
  );
};

// Provider unico para a tela: ReportsStats, PublicWorksStats e o StatsPage
// leem a mesma cidade, entao o filtro precisa ser compartilhado entre eles.
export default function StatsPageWithCityView() {
  return (
    <CityViewProvider>
      <StatsPage />
    </CityViewProvider>
  );
}

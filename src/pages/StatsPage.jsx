import React, { useState, useEffect, useCallback } from 'react';
import { Helmet } from 'react-helmet';
import { motion } from 'framer-motion';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, RadialBarChart, RadialBar, Cell, PieChart, Pie, LabelList, Label } from 'recharts';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/customSupabaseClient';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertTriangle, Clock, CheckCircle, BarChart3, Download, HardHat, Wrench, Loader2 } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import WorksStatsReports from '@/components/WorksStatsReports';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { LocalNotifications } from '@capacitor/local-notifications';
import { FileOpener } from '@capacitor-community/file-opener';

const CustomTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-background/80 backdrop-blur-sm p-3 border border-border rounded-lg shadow-lg">
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

const ReportsStats = () => {
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
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const { toast } = useToast();

  const COLORS = ['#ef4444', '#f97316', '#3b82f6', '#8b5cf6', '#ec4899', '#facc15'];

  const fetchStats = useCallback(async () => {
    setLoading(true);
    try {
      const { data: reports, error } = await supabase
        .from('reports')
        .select('*, category:categories(id, name)')
        .eq('moderation_status', 'approved')
        .neq('status', 'duplicate')
        .order('created_at', { ascending: false });

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
          { name: 'Pendentes', value: filtered.filter(r => r.status === 'pending').length, fill: '#f97316' },
          { name: 'Em Andamento', value: filtered.filter(r => r.status === 'in-progress').length, fill: '#3b82f6' },
          { name: 'Resolvidas', value: filtered.filter(r => r.status === 'resolved').length, fill: '#22c55e' },
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
  }, [toast, categoryFilter]);

  // Recalcular distribuições quando mudar o filtro sem reconsultar o backend
  useEffect(() => {
    if (!stats.reports || stats.reports.length === 0) return;
    const filtered = categoryFilter === 'buracos'
      ? stats.reports.filter(r => r.category?.id === 'buracos')
      : stats.reports;
    const statusDistribution = [
      { name: 'Pendentes', value: filtered.filter(r => r.status === 'pending').length, fill: '#f97316' },
      { name: 'Em Andamento', value: filtered.filter(r => r.status === 'in-progress').length, fill: '#3b82f6' },
      { name: 'Resolvidas', value: filtered.filter(r => r.status === 'resolved').length, fill: '#22c55e' },
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
  }, [categoryFilter, stats.reports]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  // Listener para abrir o arquivo quando clicar na notificação
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

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
        const tableColumn = isBuracos
          ? ["#", "Protocolo", "Título", "Origem", "Endereço", "Data"]
          : ["#", "Protocolo", "Título", "Endereço", "Data"];
        const tableRows = [];
        
        groupedByCategory[categoryName].forEach((report, index) => {
          const common = [
            index + 1,
            report.protocol,
            doc.splitTextToSize(report.title, 60),
          ];
          const end = [
            doc.splitTextToSize(report.address || 'N/A', 50),
            new Date(report.created_at).toLocaleDateString('pt-BR'),
          ];
          if (isBuracos) {
            const origem = report.is_from_water_utility ? 'Abastecimento' : 'Outros';
            tableRows.push([...common, origem, ...end]);
          } else {
            tableRows.push([...common, ...end]);
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
            directory = Directory.Documents;
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

  if (loading) {
    return <div className="flex justify-center items-center h-96">Carregando estatísticas...</div>;
  }

  const showBuracosInsight = categoryFilter === 'buracos' && stats.waterUtility.totalBuracos > 0;
  const buracosPercentValue = stats.waterUtility.percentualFromWaterUtility || 0;
  const buracosPercentLabel = buracosPercentValue.toLocaleString('pt-BR', {
    minimumFractionDigits: buracosPercentValue > 0 && buracosPercentValue < 1 ? 1 : 0,
    maximumFractionDigits: buracosPercentValue > 0 && buracosPercentValue < 1 ? 1 : 0,
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        
        <div className="flex w-full justify-end mt-2 md:mt-0">
          <Button onClick={handleDownloadPdf} disabled={downloading}>
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

      <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">
        <motion.div
          className="xl:col-span-3"
          initial={{ opacity: 0, x: -40 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.4, duration: 0.5 }}
        >
          <Card className="h-full border border-[#E5E7EB] bg-white rounded-2xl shadow-sm">
            <CardHeader>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <CardTitle className="text-sm md:text-base text-[#111827]">
                    {categoryFilter === 'buracos' ? 'Buracos — origem do problema' : 'Broncas por categoria'}
                  </CardTitle>
                  {categoryFilter === 'buracos' && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Total de buracos: <span className="font-semibold">{stats.waterUtility.totalBuracos}</span>
                    </p>
                  )}
                </div>
                <div>
                  <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                    <SelectTrigger className="h-8 w-[150px] bg-white/70 border-muted text-xs">
                      <SelectValue placeholder="Categoria" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todas as categorias</SelectItem>
                      <SelectItem value="buracos">Buracos</SelectItem>
                    </SelectContent>
                  </Select>
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
                            { name: 'Companhia de abastecimento', value: stats.waterUtility.buracosFromWaterUtility, fill: '#0ea5e9' },
                            { name: 'Outras Causas', value: Math.max(stats.waterUtility.totalBuracos - stats.waterUtility.buracosFromWaterUtility, 0), fill: '#94a3b8' },
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
          <Card className="h-full border border-[#E5E7EB] bg-white rounded-2xl shadow-sm">
            <CardHeader>
              <CardTitle className="text-sm md:text-base text-[#111827]">
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
  const { toast } = useToast();

  const fetchWorks = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.from('public_works').select('*, work_category:work_categories(name)');
      if (error) throw error;
      setWorks(data);
    } catch (error) {
      toast({ title: "Erro ao buscar dados das obras", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchWorks();
  }, [fetchWorks]);

  if (loading) {
    return <div className="flex justify-center items-center h-96">Carregando estatísticas das obras...</div>;
  }

  return <WorksStatsReports works={works} />;
};

const StatsPage = () => {
  const [summary, setSummary] = useState({
    total: 0,
    pending: 0,
    inProgress: 0,
    resolved: 0,
  });
  const [summaryLoading, setSummaryLoading] = useState(true);

  useEffect(() => {
    const fetchSummary = async () => {
      try {
        const { data, error } = await supabase
          .from('reports')
          .select('status')
          .eq('moderation_status', 'approved')
          .neq('status', 'duplicate');

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
  }, []);

  const summaryCards = [
    {
      title: 'Total de Broncas',
      value: summary.total,
      accentBg: 'bg-[#2563EB]',
      valueColor: 'text-[#1D4ED8]',
    },
    {
      title: 'Pendentes',
      value: summary.pending,
      accentBg: 'bg-[#DC2626]',
      valueColor: 'text-[#B91C1C]',
    },
    {
      title: 'Em Andamento',
      value: summary.inProgress,
      accentBg: 'bg-[#D97706]',
      valueColor: 'text-[#B45309]',
    },
    {
      title: 'Resolvidas',
      value: summary.resolved,
      accentBg: 'bg-[#16A34A]',
      valueColor: 'text-[#166534]',
    },
  ];

  return (
    <>
      <Helmet>
        <title>Estatísticas - Trombone Cidadão</title>
        <meta name="description" content="Veja as estatísticas detalhadas das solicitações e obras na plataforma Trombone Cidadão." />
      </Helmet>
      <div className="flex flex-col bg-[#F9FAFB] md:px-6">
        <div className="px-4 md:px-6 lg:px-10 xl:px-14 pt-4 pb-8 space-y-8 max-w-[88rem] mx-auto w-full">
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="space-y-2"
          >
            <p className="text-[11px] font-semibold tracking-[0.18em] text-[#9CA3AF] uppercase flex items-center gap-2">
              <span className="inline-block w-1 h-3 rounded-full bg-tc-red" />
              Panorama
            </p>
            <h1 className="text-xl md:text-2xl lg:text-3xl font-bold text-[#111827]">
              Estatísticas da Cidade
            </h1>
            <p className="text-xs lg:text-sm text-[#6B7280] max-w-2xl">
              Acompanhe em tempo real o andamento das solicitações e obras e veja os dados que movem a cidade.
            </p>
          </motion.div>

          <motion.div
            className="grid grid-cols-2 sm:grid-cols-4 gap-2"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.15, duration: 0.4 }}
          >
            {summaryCards.map((card, index) => (
              <Card
                key={index}
                className="border border-[#E5E7EB] bg-white shadow-sm hover:shadow-md transition-shadow duration-300 rounded-xl"
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
                    className={`flex items-center justify-center w-8 h-8 md:w-9 md:h-9 rounded-xl ${card.accentBg} text-white`}
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

          <Tabs defaultValue="reports" className="w-full">
            <TabsList className="grid w-full max-w-md grid-cols-2 bg-white/80 border border-[#E5E7EB] rounded-xl">
              <TabsTrigger value="reports" className="gap-2 text-xs md:text-sm">
                <Wrench className="w-4 h-4" />
                Broncas
              </TabsTrigger>
              <TabsTrigger value="works" className="gap-2 text-xs md:text-sm">
                <HardHat className="w-4 h-4" />
                Obras Públicas
              </TabsTrigger>
            </TabsList>
            <TabsContent value="reports" className="mt-6">
              <ReportsStats />
            </TabsContent>
            <TabsContent value="works" className="mt-6">
              <PublicWorksStats />
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </>
  );
};

export default StatsPage;

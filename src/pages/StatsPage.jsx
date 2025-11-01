import React, { useState, useEffect, useCallback } from 'react';
import { Helmet } from 'react-helmet';
import { motion } from 'framer-motion';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, RadialBarChart, RadialBar, Cell } from 'recharts';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/customSupabaseClient';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertTriangle, Clock, CheckCircle, BarChart3, Download, HardHat, Wrench } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import WorksStatsReports from '@/components/WorksStatsReports';
import jsPDF from 'jspdf';
import 'jspdf-autotable';

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
  const [stats, setStats] = useState({ total: 0, pending: 0, inProgress: 0, resolved: 0, reports: [] });
  const [categoryData, setCategoryData] = useState([]);
  const [statusData, setStatusData] = useState([]);
  const [loading, setLoading] = useState(true);
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

      setStats({ total, pending, inProgress, resolved, reports });

      const statusDistribution = [
        { name: 'Pendentes', value: pending, fill: '#f97316' },
        { name: 'Em Andamento', value: inProgress, fill: '#3b82f6' },
        { name: 'Resolvidas', value: resolved, fill: '#22c55e' },
      ];
      setStatusData(statusDistribution);

      const categoryCounts = reports.reduce((acc, report) => {
        const categoryName = report.category?.name || 'Outros';
        acc[categoryName] = (acc[categoryName] || 0) + 1;
        return acc;
      }, {});

      const categoryDistribution = Object.entries(categoryCounts)
        .map(([name, value], index) => ({ name, value, fill: COLORS[index % COLORS.length] }))
        .sort((a, b) => b.value - a.value);
      setCategoryData(categoryDistribution);

    } catch (error) {
      toast({
        title: "Erro ao buscar estatísticas",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  const handleDownloadPdf = () => {
    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text("Relatório de Broncas - Trombone Cidadão", 14, 22);
    doc.setFontSize(11);
    doc.setTextColor(100);
    doc.text(`Gerado em: ${new Date().toLocaleDateString('pt-BR')} ${new Date().toLocaleTimeString('pt-BR')}`, 14, 28);
    
    let yPosition = 40;

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

        const tableColumn = ["#", "Protocolo", "Título", "Endereço", "Data"];
        const tableRows = [];
        
        groupedByCategory[categoryName].forEach((report, index) => {
          tableRows.push([
            index + 1,
            report.protocol,
            doc.splitTextToSize(report.title, 60),
            doc.splitTextToSize(report.address || 'N/A', 50),
            new Date(report.created_at).toLocaleDateString('pt-BR'),
          ]);
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
    
    doc.save(`relatorio_broncas_${new Date().toISOString().split('T')[0]}.pdf`);
    
    toast({
      title: "Relatório gerado!",
      description: "O download do seu PDF foi iniciado.",
    });
  };

  const statCards = [
    { title: 'Total de Broncas', value: stats.total, icon: BarChart3, color: 'text-blue-500' },
    { title: 'Pendentes', value: stats.pending, icon: AlertTriangle, color: 'text-orange-500' },
    { title: 'Em Andamento', value: stats.inProgress, icon: Clock, color: 'text-yellow-500' },
    { title: 'Resolvidas', value: stats.resolved, icon: CheckCircle, color: 'text-green-500' },
  ];

  if (loading) {
    return <div className="flex justify-center items-center h-96">Carregando estatísticas...</div>;
  }

  return (
    <div className="space-y-8">
      <div className="flex justify-end">
        <Button onClick={handleDownloadPdf}>
          <Download className="mr-2 h-4 w-4" />
          Baixar Relatório
        </Button>
      </div>
      <motion.div
        className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.2, duration: 0.5 }}
      >
        {statCards.map((card, index) => (
          <Card key={index} className="shadow-lg hover:shadow-primary/20 transition-shadow duration-300 bg-card/50 backdrop-blur-sm">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{card.title}</CardTitle>
              <card.icon className={`h-5 w-5 ${card.color}`} />
            </CardHeader>
            <CardContent>
              <div className="text-4xl font-bold">{card.value}</div>
            </CardContent>
          </Card>
        ))}
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
        <motion.div className="lg:col-span-3" initial={{ opacity: 0, x: -50 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.4, duration: 0.5 }}>
          <Card className="shadow-lg h-full bg-card/50 backdrop-blur-sm">
            <CardHeader><CardTitle>Broncas por Categoria</CardTitle></CardHeader>
            <CardContent>
              <div className="h-96">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={categoryData} layout="vertical" margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis type="number" stroke="hsl(var(--muted-foreground))" />
                    <YAxis dataKey="name" type="category" width={100} tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }} />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar dataKey="value" name="Quantidade" radius={[0, 8, 8, 0]}>
                      {categoryData.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.fill} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div className="lg:col-span-2" initial={{ opacity: 0, x: 50 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.6, duration: 0.5 }}>
          <Card className="shadow-lg h-full bg-card/50 backdrop-blur-sm">
            <CardHeader><CardTitle>Distribuição por Status</CardTitle></CardHeader>
            <CardContent>
              <div className="h-96">
                <ResponsiveContainer width="100%" height="100%">
                  <RadialBarChart cx="50%" cy="50%" innerRadius="20%" outerRadius="80%" barSize={20} data={statusData} startAngle={90} endAngle={-270}>
                    <RadialBar minAngle={15} background clockWise dataKey="value" />
                    <Legend iconSize={10} layout="vertical" verticalAlign="middle" align="right" wrapperStyle={{color: 'hsl(var(--foreground))'}} />
                    <Tooltip content={<CustomTooltip />} />
                  </RadialBarChart>
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
  return (
    <>
      <Helmet>
        <title>Estatísticas - Trombone Cidadão</title>
        <meta name="description" content="Veja as estatísticas detalhadas das solicitações e obras na plataforma Trombone Cidadão." />
      </Helmet>
      <div className="container mx-auto px-4 py-12">
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
          <h1 className="text-4xl font-bold text-center mb-4 text-tc-red">Estatísticas da Cidade</h1>
          <p className="text-center text-muted-foreground mb-12 max-w-2xl mx-auto">
            Acompanhe em tempo real o andamento das solicitações e obras, e veja os dados que movem a nossa cidade para frente.
          </p>
        </motion.div>

        <Tabs defaultValue="reports" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="reports" className="gap-2"><Wrench className="w-4 h-4" /> Broncas</TabsTrigger>
            <TabsTrigger value="works" className="gap-2"><HardHat className="w-4 h-4" /> Obras Públicas</TabsTrigger>
          </TabsList>
          <TabsContent value="reports" className="mt-6">
            <ReportsStats />
          </TabsContent>
          <TabsContent value="works" className="mt-6">
            <PublicWorksStats />
          </TabsContent>
        </Tabs>
      </div>
    </>
  );
};

export default StatsPage;
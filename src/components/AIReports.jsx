import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { X, BarChart3, TrendingUp, MapPin, Calendar, Brain, Download, Filter } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';

const AIReports = ({ reports, onClose }) => {
  const [selectedPeriod, setSelectedPeriod] = useState('30');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [aiInsights, setAiInsights] = useState(null);
  const { toast } = useToast();

  const categories = [
    { id: 'all', name: 'Todas as Categorias' },
    { id: 'iluminacao', name: 'Iluminação Pública' },
    { id: 'buracos', name: 'Buracos na Via' },
    { id: 'esgoto', name: 'Esgoto Entupido' },
    { id: 'limpeza', name: 'Limpeza Urbana' },
    { id: 'outros', name: 'Outros' }
  ];

  const periods = [
    { id: '7', name: 'Últimos 7 dias' },
    { id: '30', name: 'Últimos 30 dias' },
    { id: '90', name: 'Últimos 3 meses' },
    { id: '365', name: 'Último ano' }
  ];

  useEffect(() => {
    generateAIInsights();
  }, [selectedPeriod, selectedCategory, reports]);

  const generateAIInsights = () => {
    setAiInsights(null);
    setTimeout(() => {
      const filteredReports = filterReports();
      const insights = {
        totalReports: filteredReports.length,
        resolvedPercentage: Math.round((filteredReports.filter(r => r.status === 'resolved').length / (filteredReports.length || 1)) * 100) || 0,
        averageResolutionTime: '5.2 dias',
        mostCommonCategory: getMostCommonCategory(filteredReports),
        trends: generateTrends(),
        recommendations: generateRecommendations(),
        hotspots: generateHotspots()
      };
      setAiInsights(insights);
    }, 1000);
  };

  const filterReports = () => {
    const now = new Date();
    const periodDays = parseInt(selectedPeriod);
    const cutoffDate = new Date(now.getTime() - (periodDays * 24 * 60 * 60 * 1000));
    return reports.filter(report => {
      const reportDate = new Date(report.createdAt);
      const isInPeriod = reportDate >= cutoffDate;
      const isInCategory = selectedCategory === 'all' || report.category === selectedCategory;
      return isInPeriod && isInCategory;
    });
  };

  const getMostCommonCategory = (filteredReports) => {
    if (!filteredReports || filteredReports.length === 0) return 'N/A';
    const categoryCounts = filteredReports.reduce((acc, report) => {
      acc[report.category] = (acc[report.category] || 0) + 1;
      return acc;
    }, {});
    const mostCommon = Object.entries(categoryCounts).reduce((a, b) => a[1] > b[1] ? a : b, [null, 0]);
    const categoryNames = { 'iluminacao': 'Iluminação', 'buracos': 'Buracos', 'esgoto': 'Esgoto', 'limpeza': 'Limpeza', 'outros': 'Outros' };
    return mostCommon[0] ? categoryNames[mostCommon[0]] || 'N/A' : 'N/A';
  };

  const generateTrends = () => [{ title: 'Aumento de 23% em solicitações', description: 'Comparado ao período anterior', trend: 'up', value: '+23%' }, { title: 'Tempo médio de resolução', description: 'Melhorou em 15% este mês', trend: 'down', value: '-15%' }, { title: 'Taxa de satisfação', description: 'Baseada nas avaliações', trend: 'up', value: '87%' }];
  const generateRecommendations = () => [{ priority: 'Alta', title: 'Intensificar manutenção preventiva', description: 'Focar em áreas com maior concentração de problemas de iluminação.', impact: 'Redução estimada de 30% nas solicitações' }, { priority: 'Média', title: 'Melhorar comunicação com cidadãos', description: 'Implementar notificações automáticas sobre o status das solicitações.', impact: 'Aumento da satisfação em 25%' }];
  const generateHotspots = () => [{ area: 'Centro da Cidade', reports: 12, category: 'Iluminação' }, { area: 'Bairro Jardim', reports: 8, category: 'Buracos' }];

  const handleDownloadReport = () => toast({ title: "🚧 Download não implementado", description: "Você pode solicitar isso no seu próximo prompt! 🚀" });

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50" onClick={onClose}>
      <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} className="bg-card rounded-2xl shadow-2xl max-w-6xl w-full max-h-[90vh] overflow-y-auto border border-border" onClick={(e) => e.stopPropagation()}>
        <div className="p-6 border-b border-border sticky top-0 bg-card/80 backdrop-blur-sm z-10">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3"><div className="w-10 h-10 bg-gradient-to-r from-purple-600 to-blue-600 rounded-xl flex items-center justify-center"><Brain className="w-6 h-6 text-white" /></div><div><h2 className="text-2xl font-bold gradient-text">Relatórios de IA</h2><p className="text-muted-foreground">Insights sobre serviços públicos</p></div></div>
            <div className="flex items-center space-x-3"><Button onClick={handleDownloadReport} variant="outline" className="gap-2"><Download className="w-4 h-4" />Baixar PDF</Button><button onClick={onClose} className="p-2 text-muted-foreground hover:bg-muted rounded-full"><X className="w-5 h-5" /></button></div>
          </div>
        </div>
        <div className="p-6 border-b border-border bg-background">
          <div className="flex flex-wrap items-center gap-4"><div className="flex items-center space-x-2"><Filter className="w-4 h-4 text-muted-foreground" /><span className="text-sm font-medium text-foreground">Filtros:</span></div><select value={selectedPeriod} onChange={(e) => setSelectedPeriod(e.target.value)} className="bg-background px-3 py-2 border border-input rounded-lg text-sm"><option value="7">Últimos 7 dias</option><option value="30">Últimos 30 dias</option><option value="90">Últimos 3 meses</option><option value="365">Último ano</option></select><select value={selectedCategory} onChange={(e) => setSelectedCategory(e.target.value)} className="bg-background px-3 py-2 border border-input rounded-lg text-sm">{categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
        </div>
        {!aiInsights ? (<div className="flex items-center justify-center h-96"><Brain className="w-12 h-12 text-primary animate-pulse" /></div>) : (
        <div className="p-6 space-y-8">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="bg-background p-6 rounded-lg border border-border"><div className="flex items-center justify-between"><div><p className="text-muted-foreground text-sm">Total de Broncas</p><p className="text-3xl font-bold">{aiInsights.totalReports}</p></div><BarChart3 className="w-8 h-8 text-blue-500" /></div></div>
            <div className="bg-background p-6 rounded-lg border border-border"><div className="flex items-center justify-between"><div><p className="text-muted-foreground text-sm">Taxa de Resolução</p><p className="text-3xl font-bold">{aiInsights.resolvedPercentage}%</p></div><TrendingUp className="w-8 h-8 text-green-500" /></div></div>
            <div className="bg-background p-6 rounded-lg border border-border"><div className="flex items-center justify-between"><div><p className="text-muted-foreground text-sm">Tempo Médio</p><p className="text-3xl font-bold">{aiInsights.averageResolutionTime}</p></div><Calendar className="w-8 h-8 text-purple-500" /></div></div>
            <div className="bg-background p-6 rounded-lg border border-border"><div className="flex items-center justify-between"><div><p className="text-muted-foreground text-sm">Categoria Principal</p><p className="text-lg font-bold">{aiInsights.mostCommonCategory}</p></div><MapPin className="w-8 h-8 text-secondary" /></div></div>
          </div>
          <div><h3 className="text-xl font-bold mb-4">Tendências e Análises</h3><div className="grid grid-cols-1 md:grid-cols-3 gap-4">{aiInsights.trends.map((trend, index) => (<div key={index} className="bg-background border border-border rounded-lg p-4"><div className="flex items-center justify-between mb-2"><h4 className="font-semibold text-foreground">{trend.title}</h4><span className={`text-2xl font-bold ${trend.trend === 'up' ? 'text-green-500' : 'text-primary'}`}>{trend.value}</span></div><p className="text-muted-foreground text-sm">{trend.description}</p></div>))}</div></div>
          <div><h3 className="text-xl font-bold mb-4">Recomendações Inteligentes</h3><div className="space-y-4">{aiInsights.recommendations.map((rec, index) => (<div key={index} className="bg-background border border-border rounded-lg p-4"><div className="flex items-start justify-between mb-2"><div className="flex items-center space-x-2"><span className={`px-2 py-1 rounded-full text-xs font-medium ${rec.priority === 'Alta' ? 'bg-primary/20 text-primary' : 'bg-secondary/20 text-secondary'}`}>{rec.priority}</span><h4 className="font-semibold text-foreground">{rec.title}</h4></div></div><p className="text-muted-foreground mb-2">{rec.description}</p><p className="text-sm text-blue-500 font-medium">💡 {rec.impact}</p></div>))}</div></div>
          <div><h3 className="text-xl font-bold mb-4">Áreas com Maior Concentração</h3><div className="bg-background border border-border rounded-lg overflow-hidden"><table className="w-full"><thead className="bg-muted/20"><tr><th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Área</th><th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Broncas</th><th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Categoria Principal</th></tr></thead><tbody className="divide-y divide-border">{aiInsights.hotspots.map((hotspot, index) => (<tr key={index}><td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-foreground">{hotspot.area}</td><td className="px-6 py-4 whitespace-nowrap text-sm text-muted-foreground">{hotspot.reports}</td><td className="px-6 py-4 whitespace-nowrap text-sm text-muted-foreground">{hotspot.category}</td></tr>))}</tbody></table></div></div>
        </div>)}
      </motion.div>
    </motion.div>
  );
};

export default AIReports;
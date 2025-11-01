import React, { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { BarChart, Bar, XAxis, YAxis, Tooltip as RechartsTooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';
import { DollarSign, Landmark, TrendingUp, AlertCircle, HardHat, CheckCircle, PauseCircle, ChevronUp, ChevronDown, Wrench } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const StatCard = ({ icon: Icon, title, value, color, tooltipText }) => (
  <TooltipProvider>
    <Tooltip>
      <TooltipTrigger asChild>
        <Card className="shadow-sm hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
            <Icon className={`w-5 h-5 ${color || 'text-muted-foreground'}`} />
          </CardHeader>
          <CardContent>
            <p className={`text-2xl font-bold ${color || 'text-foreground'}`}>{value}</p>
          </CardContent>
        </Card>
      </TooltipTrigger>
      {tooltipText && (
        <TooltipContent>
          <p>{tooltipText}</p>
        </TooltipContent>
      )}
    </Tooltip>
  </TooltipProvider>
);

const CustomTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    const value = payload[0].payload.isCurrency ? formatCurrency(payload[0].value) : payload[0].value;
    return (
      <div className="bg-popover text-popover-foreground p-2 border border-border rounded-md shadow-lg">
        <p className="label font-bold">{`${label}`}</p>
        <p className="intro text-sm">{`${payload[0].name}: ${value}`}</p>
      </div>
    );
  }
  return null;
};

const useSortableData = (items, config = null) => {
  const [sortConfig, setSortConfig] = useState(config);

  const sortedItems = useMemo(() => {
    let sortableItems = [...items];
    if (sortConfig !== null) {
      sortableItems.sort((a, b) => {
        if (a[sortConfig.key] < b[sortConfig.key]) {
          return sortConfig.direction === 'ascending' ? -1 : 1;
        }
        if (a[sortConfig.key] > b[sortConfig.key]) {
          return sortConfig.direction === 'ascending' ? 1 : -1;
        }
        return 0;
      });
    }
    return sortableItems;
  }, [items, sortConfig]);

  const requestSort = (key) => {
    let direction = 'ascending';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'ascending') {
      direction = 'descending';
    }
    setSortConfig({ key, direction });
  };

  return { items: sortedItems, requestSort, sortConfig };
};


const WorksStatsReports = ({ works }) => {
  const totalInvestment = works.reduce((acc, work) => acc + (work.total_value || 0), 0);
  const totalStalledValue = works.filter(w => w.status === 'stalled' || w.status === 'unfinished').reduce((acc, work) => acc + (work.total_value || 0), 0);
  
  const statusCounts = works.reduce((acc, work) => {
    acc[work.status] = (acc[work.status] || 0) + 1;
    return acc;
  }, { 'in-progress': 0, 'completed': 0, 'stalled': 0, 'planned': 0, 'tendered': 0, 'unfinished': 0 });

  const fundingData = works.reduce((acc, work) => {
    const sources = Array.isArray(work.funding_source) && work.funding_source.length > 0 ? work.funding_source : ['unknown'];
    sources.forEach(source => {
      const sourceName = source.charAt(0).toUpperCase() + source.slice(1);
      if (!acc[sourceName]) {
        acc[sourceName] = { name: sourceName, value: 0, isCurrency: true };
      }
      acc[sourceName].value += (work.total_value || 0) / sources.length;
    });
    return acc;
  }, {});

  const categoryData = works.reduce((acc, work) => {
    const categoryName = work.work_category?.name || 'Sem Categoria';
    if (!acc[categoryName]) {
      acc[categoryName] = { name: categoryName, value: 0, isCurrency: false };
    }
    acc[categoryName].value += 1;
    return acc;
  }, {});

  const pieData = Object.values(fundingData);
  const categoryBarData = Object.values(categoryData).sort((a, b) => b.value - a.value);
  const COLORS = { Municipal: '#3b82f6', State: '#f97316', Federal: '#10b981', Unknown: '#6b7280' };

  const { items: sortedWorks, requestSort, sortConfig } = useSortableData(works);

  const getSortIcon = (key) => {
    if (!sortConfig || sortConfig.key !== key) {
      return <ChevronDown className="h-4 w-4 text-muted-foreground/50" />;
    }
    return sortConfig.direction === 'ascending' ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />;
  };

  const containerVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.5, staggerChildren: 0.1 } }
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0 }
  };

  const getStatusBadge = (status) => {
    const statusMap = {
      'in-progress': 'bg-blue-100 text-blue-800',
      'completed': 'bg-green-100 text-green-800',
      'stalled': 'bg-yellow-100 text-yellow-800',
      'planned': 'bg-purple-100 text-purple-800',
      'tendered': 'bg-orange-100 text-orange-800',
      'unfinished': 'bg-red-100 text-red-800',
    };
    const statusText = {
      'in-progress': 'Em Andamento',
      'completed': 'Concluída',
      'stalled': 'Paralisada',
      'planned': 'Prevista',
      'tendered': 'Licitada',
      'unfinished': 'Inacabada',
    };
    return <span className={`px-2 py-1 text-xs font-medium rounded-full ${statusMap[status] || 'bg-gray-100 text-gray-800'}`}>{statusText[status] || 'N/D'}</span>;
  };

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="space-y-8"
    >
      <motion.div variants={itemVariants} className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <StatCard icon={DollarSign} title="Investimento Total" value={formatCurrency(totalInvestment)} tooltipText="Valor total orçado para todas as obras." />
        <StatCard icon={AlertCircle} title="Investimento Parado" value={formatCurrency(totalStalledValue)} color="text-amber-500" tooltipText="Valor total de obras atualmente paralisadas ou inacabadas." />
        <StatCard icon={HardHat} title="Obras em Andamento" value={statusCounts['in-progress']} color="text-blue-500" />
        <StatCard icon={PauseCircle} title="Obras Paralisadas" value={statusCounts.stalled} color="text-amber-500" />
        <StatCard icon={Wrench} title="Obras Inacabadas" value={statusCounts.unfinished} color="text-red-500" />
        <StatCard icon={CheckCircle} title="Obras Concluídas" value={statusCounts.completed} color="text-green-500" />
      </motion.div>

      <motion.div variants={itemVariants} className="grid grid-cols-1 lg:grid-cols-5 gap-8">
        <Card className="lg:col-span-3">
          <CardHeader><CardTitle>Obras por Categoria</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={categoryBarData} layout="vertical" margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                <XAxis type="number" stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} allowDecimals={false} />
                <YAxis dataKey="name" type="category" width={100} tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }} stroke="hsl(var(--muted-foreground))" />
                <RechartsTooltip cursor={{ fill: 'hsl(var(--accent))' }} content={<CustomTooltip />} />
                <Bar dataKey="value" name="Quantidade" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Fontes de Recurso</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie data={pieData} cx="50%" cy="50%" labelLine={false} outerRadius={80} fill="#8884d8" dataKey="value" nameKey="name">
                  {pieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[entry.name]} />
                  ))}
                </Pie>
                <RechartsTooltip content={<CustomTooltip />} />
                <Legend wrapperStyle={{ color: 'hsl(var(--foreground))', fontSize: '12px' }} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </motion.div>

      <motion.div variants={itemVariants}>
        <Card>
          <CardHeader><CardTitle>Tabela de Obras</CardTitle></CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead onClick={() => requestSort('title')} className="cursor-pointer hover:bg-muted">
                      <div className="flex items-center gap-2">Título {getSortIcon('title')}</div>
                    </TableHead>
                    <TableHead onClick={() => requestSort('status')} className="cursor-pointer hover:bg-muted">
                      <div className="flex items-center gap-2">Status {getSortIcon('status')}</div>
                    </TableHead>
                    <TableHead onClick={() => requestSort('total_value')} className="cursor-pointer hover:bg-muted text-right">
                      <div className="flex items-center justify-end gap-2">Valor {getSortIcon('total_value')}</div>
                    </TableHead>
                    <TableHead onClick={() => requestSort('execution_percentage')} className="cursor-pointer hover:bg-muted text-right">
                      <div className="flex items-center justify-end gap-2">% Concluído {getSortIcon('execution_percentage')}</div>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedWorks.map((work) => (
                    <TableRow key={work.id}>
                      <TableCell className="font-medium">{work.title}</TableCell>
                      <TableCell>{getStatusBadge(work.status)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(work.total_value || 0)}</TableCell>
                      <TableCell className="text-right">{work.execution_percentage || 0}%</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </motion.div>
  );
};

export default WorksStatsReports;
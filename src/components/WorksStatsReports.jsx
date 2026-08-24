import React, { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { BarChart, Bar, XAxis, YAxis, Tooltip as RechartsTooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';
import { DollarSign, Landmark, TrendingUp, AlertCircle, HardHat, CheckCircle, PauseCircle, ChevronUp, ChevronDown, Wrench } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useTheme } from '@/design-system/theme/ThemeProvider';

// Le o valor computado de um token de design em runtime. O Recharts recebe
// cor por prop JS (nao por classe CSS), entao os tokens de grafico (canal
// RGB) precisam ser lidos do DOM e embrulhados em rgb().
const readColorToken = (name) => {
  if (typeof window === 'undefined' || typeof document === 'undefined') return undefined;
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value ? `rgb(${value})` : undefined;
};

const StatCard = ({ icon: Icon, title, value, color, tooltipText, stacked }) => {
  const tooltipTitle =
    typeof value === 'string' ? value : `${value?.top || ''}${value?.bottom ? ` • ${value.bottom}` : ''}`;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Card className="shadow-sm hover:shadow-md transition-shadow overflow-hidden">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 p-3 sm:p-4">
              <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground truncate flex-1 min-w-0 pr-2">
                {title}
              </CardTitle>
              <Icon className={`w-4 h-4 sm:w-5 sm:h-5 flex-shrink-0 ${color || 'text-muted-foreground'}`} />
            </CardHeader>
            <CardContent className="p-3 sm:p-4 pt-0">
              {stacked && typeof value === 'object' ? (
                <div className="flex flex-col gap-1">
                  <span
                    className={`text-[11px] sm:text-xs font-semibold ${color || 'text-foreground'} leading-tight break-words`}
                    title={value.top}
                  >
                    {value.top}
                  </span>
                  <div className="h-px w-full bg-muted" />
                  <span
                    className={`text-xs sm:text-sm md:text-base font-bold ${color || 'text-foreground'} leading-tight break-words`}
                    title={value.bottom}
                  >
                    {value.bottom}
                  </span>
                </div>
              ) : (
                <p
                  className={`text-xs sm:text-sm md:text-base font-bold ${color || 'text-foreground'} leading-tight break-words`}
                  title={tooltipTitle}
                >
                  {value}
                </p>
              )}
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
};

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
  const { resolved: resolvedTheme } = useTheme();

  // Cores dos graficos lidas dos tokens CSS em runtime, recalculadas quando o
  // tema muda (Recharts so aceita cor via prop JS, nao via classe).
  const chartColors = useMemo(() => ({
    categories: [1, 2, 3, 4, 5, 6, 7].map((n) => readColorToken(`--chart-cat-${n}`)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [resolvedTheme]);

  const totalInvestment = works.reduce((acc, work) => acc + (work.total_value || 0), 0);
  const totalStalledValue = works
    .filter(w => w.status === 'stalled' || w.status === 'unfinished')
    .reduce((acc, work) => acc + (work.total_value || 0), 0);

  const statusCounts = works.reduce(
    (acc, work) => {
      acc[work.status] = (acc[work.status] || 0) + 1;
      return acc;
    },
    { 'in-progress': 0, completed: 0, stalled: 0, planned: 0, tendered: 0, unfinished: 0 }
  );

  const statusValues = works.reduce((acc, work) => {
    acc[work.status] = (acc[work.status] || 0) + (work.total_value || 0);
    return acc;
  }, {});

  // Função para traduzir e normalizar fontes de recurso
  const getFundingSourceName = (source) => {
    const sourceMap = { 
      federal: 'Federal', 
      state: 'Estadual', 
      estadual: 'Estadual',
      municipal: 'Municipal',
      unknown: null
    };
    const normalized = sourceMap[source?.toLowerCase()];
    return normalized || (source ? source.charAt(0).toUpperCase() + source.slice(1) : null);
  };

  const fundingData = works.reduce((acc, work) => {
    const sources = Array.isArray(work.funding_source) && work.funding_source.length > 0 ? work.funding_source : ['unknown'];
    sources.forEach(source => {
      const sourceName = getFundingSourceName(source);
      if (!sourceName) return; // Ignorar 'unknown' e valores nulos
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
  // Mesma paleta categorica usada em StatsPage (tokens --chart-cat-*), para as
  // fontes de recurso falarem a mesma lingua visual do resto do app.
  const COLORS = {
    Municipal: chartColors.categories[0],
    State: chartColors.categories[1],
    Federal: chartColors.categories[2],
    Unknown: chartColors.categories[3],
  };

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
    return <span className={`px-2 py-1 text-xs font-medium rounded-full ${statusMap[status] || 'bg-surface-subtle text-content-secondary'}`}>{statusText[status] || 'N/D'}</span>;
  };

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="space-y-8"
    >
      <motion.div variants={itemVariants} className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
        <StatCard
          icon={DollarSign}
          title="Investimento Total"
          value={formatCurrency(totalInvestment)}
          tooltipText="Valor total orçado para todas as obras."
        />
        <StatCard
          icon={AlertCircle}
          title="Investimento Parado"
          value={formatCurrency(totalStalledValue)}
          color="text-amber-500"
          tooltipText="Valor total de obras atualmente paralisadas ou inacabadas."
        />
        <StatCard
          icon={Landmark}
          title="Obras Previstas"
          value={{
            top: `${statusCounts.planned} obras`,
            bottom: formatCurrency(statusValues.planned || 0),
          }}
          color="text-purple-500"
          stacked
          tooltipText="Quantidade e valor total de obras previstas."
        />
        <StatCard
          icon={HardHat}
          title="Obras em Andamento"
          value={{
            top: `${statusCounts['in-progress']} obras`,
            bottom: formatCurrency(statusValues['in-progress'] || 0),
          }}
          color="text-blue-500"
          stacked
          tooltipText="Quantidade e valor total de obras em andamento."
        />
        <StatCard
          icon={PauseCircle}
          title="Obras Paralisadas"
          value={{
            top: `${statusCounts.stalled} obras`,
            bottom: formatCurrency(statusValues.stalled || 0),
          }}
          color="text-amber-500"
          stacked
          tooltipText="Quantidade e valor total de obras paralisadas."
        />
        <StatCard
          icon={Wrench}
          title="Obras Inacabadas"
          value={{
            top: `${statusCounts.unfinished} obras`,
            bottom: formatCurrency(statusValues.unfinished || 0),
          }}
          color="text-red-500"
          stacked
          tooltipText="Quantidade e valor total de obras inacabadas."
        />
        <StatCard
          icon={CheckCircle}
          title="Obras Concluídas"
          value={statusCounts.completed}
          color="text-green-500"
        />
      </motion.div>

      <motion.div variants={itemVariants} className="grid grid-cols-1 lg:grid-cols-5 gap-4 sm:gap-6 lg:gap-8">
        <Card className="lg:col-span-3 overflow-hidden">
          <CardHeader className="p-4 sm:p-6"><CardTitle className="text-base sm:text-lg">Obras por Categoria</CardTitle></CardHeader>
          <CardContent className="p-2 sm:p-4 sm:pb-6">
            <div className="w-full h-[250px] sm:h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={categoryBarData} layout="vertical" margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                  <XAxis type="number" stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
                  <YAxis dataKey="name" type="category" width={80} tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} stroke="hsl(var(--muted-foreground))" />
                <RechartsTooltip cursor={{ fill: 'hsl(var(--accent))' }} content={<CustomTooltip />} />
                <Bar dataKey="value" name="Quantidade" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
        <Card className="lg:col-span-2 overflow-hidden">
          <CardHeader className="p-4 sm:p-6"><CardTitle className="text-base sm:text-lg">Fontes de Recurso</CardTitle></CardHeader>
          <CardContent className="p-2 sm:p-4 sm:pb-6">
            <div className="w-full h-[250px] sm:h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                  <Pie data={pieData} cx="50%" cy="50%" labelLine={false} outerRadius={70} fill={chartColors.categories[4]} dataKey="value" nameKey="name">
                  {pieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[entry.name]} />
                  ))}
                </Pie>
                <RechartsTooltip content={<CustomTooltip />} />
                  <Legend wrapperStyle={{ color: 'hsl(var(--foreground))', fontSize: '11px' }} />
              </PieChart>
            </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      <motion.div variants={itemVariants}>
        <Card>
          <CardHeader><CardTitle>Tabela de Obras</CardTitle></CardHeader>
          <CardContent>
            <div className="overflow-x-auto -mx-4 sm:mx-0">
              <div className="inline-block min-w-full align-middle px-4 sm:px-0">
              <Table>
                <TableHeader>
                  <TableRow>
                      <TableHead onClick={() => requestSort('title')} className="cursor-pointer hover:bg-muted min-w-[150px]">
                      <div className="flex items-center gap-2">Título {getSortIcon('title')}</div>
                    </TableHead>
                    <TableHead onClick={() => requestSort('status')} className="cursor-pointer hover:bg-muted">
                      <div className="flex items-center gap-2">Status {getSortIcon('status')}</div>
                    </TableHead>
                    <TableHead onClick={() => requestSort('total_value')} className="cursor-pointer hover:bg-muted text-right">
                      <div className="flex items-center justify-end gap-2">Valor {getSortIcon('total_value')}</div>
                    </TableHead>
                    <TableHead onClick={() => requestSort('execution_percentage')} className="cursor-pointer hover:bg-muted text-right">
                        <div className="flex items-center justify-end gap-2 whitespace-nowrap">% Concluído {getSortIcon('execution_percentage')}</div>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedWorks.map((work) => (
                    <TableRow key={work.id}>
                        <TableCell className="font-medium min-w-[150px] max-w-[300px]">
                          <p className="truncate" title={work.title}>{work.title}</p>
                        </TableCell>
                        <TableCell className="whitespace-nowrap">{getStatusBadge(work.status)}</TableCell>
                        <TableCell className="text-right whitespace-nowrap text-sm sm:text-base">{formatCurrency(work.total_value || 0)}</TableCell>
                        <TableCell className="text-right whitespace-nowrap">{work.execution_percentage || 0}%</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </motion.div>
  );
};

export default WorksStatsReports;

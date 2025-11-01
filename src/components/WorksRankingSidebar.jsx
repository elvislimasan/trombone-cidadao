import React from 'react';
import { motion } from 'framer-motion';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { TrendingUp, TrendingDown, Clock } from 'lucide-react';
import { formatTimeAgo } from '@/lib/utils';

const WorksRankingSidebar = ({ works, onWorkClick }) => {
  const sortedByOldest = [...works]
    .filter(work => work.start_date && work.status !== 'completed')
    .sort((a, b) => new Date(a.start_date) - new Date(b.start_date))
    .slice(0, 5);

  const sortedByProgress = [...works]
    .filter(work => work.status === 'in-progress')
    .sort((a, b) => (b.execution_percentage || 0) - (a.execution_percentage || 0))
    .slice(0, 5);

  const sortedByStalled = [...works]
    .filter(work => work.status === 'stalled' && work.stalled_date)
    .sort((a, b) => new Date(a.stalled_date) - new Date(b.stalled_date))
    .slice(0, 5);

  const getStatusInfo = (status) => {
    switch (status) {
      case 'in-progress': return { text: 'Em Andamento', color: 'text-blue-500' };
      case 'stalled': return { text: 'Paralisada', color: 'text-red-500' };
      case 'planned': return { text: 'Prevista', color: 'text-purple-500' };
      case 'tendered': return { text: 'Licitada', color: 'text-orange-500' };
      default: return { text: 'Não iniciada', color: 'text-gray-500' };
    }
  };

  const RankingList = ({ title, icon: Icon, items, renderDetail }) => (
    <div className="mb-6">
      <h3 className="font-semibold text-lg mb-3 flex items-center gap-2">
        <Icon className="w-5 h-5 text-primary" />
        {title}
      </h3>
      <div className="space-y-3">
        {items.length > 0 ? items.map(work => {
          const statusInfo = getStatusInfo(work.status);
          return (
            <motion.div
              key={work.id}
              whileHover={{ scale: 1.03 }}
              className="bg-background p-3 rounded-lg border cursor-pointer"
              onClick={() => onWorkClick(work)}
            >
              <p className="font-medium text-sm truncate">{work.title}</p>
              <div className="flex justify-between items-center text-xs text-muted-foreground mt-1">
                <span>{renderDetail(work)}</span>
                <span className={`font-semibold ${statusInfo.color}`}>{statusInfo.text}</span>
              </div>
            </motion.div>
          )
        }) : <p className="text-sm text-muted-foreground text-center py-4">Nenhuma obra encontrada.</p>}
      </div>
    </div>
  );

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>Rankings das Obras</CardTitle>
      </CardHeader>
      <CardContent>
        <RankingList
          title="Obras Mais Antigas"
          icon={Clock}
          items={sortedByOldest}
          renderDetail={(work) => `Iniciada ${formatTimeAgo(work.start_date)}`}
        />
        <RankingList
          title="Mais Avançadas"
          icon={TrendingUp}
          items={sortedByProgress}
          renderDetail={(work) => `${work.execution_percentage || 0}% concluído`}
        />
        <RankingList
          title="Paralisadas Há Mais Tempo"
          icon={TrendingDown}
          items={sortedByStalled}
          renderDetail={(work) => `Parada ${formatTimeAgo(work.stalled_date)}`}
        />
      </CardContent>
    </Card>
  );
};

export default WorksRankingSidebar;
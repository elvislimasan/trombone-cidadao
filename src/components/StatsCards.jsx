import React from 'react';
import { motion } from 'framer-motion';
import { AlertTriangle, Clock, CheckCircle, BarChart3, CheckCheck } from 'lucide-react';

const StatsCards = ({ stats, onCardClick, user }) => {
  const cardsData = [
    { title: 'Ativas', value: stats.total, icon: BarChart3, color: 'from-blue-500 to-blue-600', textColor: 'text-blue-100', status: 'active' },
    { title: 'Pendentes', value: stats.pending, icon: AlertTriangle, color: 'from-primary to-red-700', textColor: 'text-red-100', status: 'pending' },
    { title: 'Em Andamento', value: stats.inProgress, icon: Clock, color: 'from-secondary to-yellow-600', textColor: 'text-yellow-100', status: 'in-progress' },
    { title: 'Resolvidas', value: stats.totalResolved, icon: CheckCheck, color: 'from-emerald-500 to-emerald-600', textColor: 'text-emerald-100', status: 'resolved' },
    { title: 'Minhas Resolvidas', value: stats.resolved, icon: CheckCircle, color: 'from-green-500 to-green-600', textColor: 'text-green-100', status: 'my-resolved', requiresUser: true }
  ];

  const cards = cardsData.filter(card => !card.requiresUser || (card.requiresUser && user));

  return (
    <div className={`grid grid-cols-2 md:grid-cols-3 ${user ? 'lg:grid-cols-5' : 'lg:grid-cols-4'} gap-4`}>
      {cards.map((card, index) => {
        const Icon = card.icon;
        return (
          <motion.div
            key={card.title}
            initial={{ y: 50, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: index * 0.1 }}
            className={`bg-card border border-border rounded-xl p-4 shadow-md hover:shadow-primary/20 hover:-translate-y-1 transition-all cursor-pointer`}
            onClick={() => onCardClick(card.status)}
          >
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className={`text-muted-foreground text-sm font-medium truncate`}>{card.title}</p>
                <p className="text-2xl font-bold mt-1 text-foreground">{card.value}</p>
              </div>
              <div className={`w-10 h-10 rounded-lg bg-gradient-to-r ${card.color} flex items-center justify-center flex-shrink-0`}>
                <Icon className={`w-5 h-5 text-white`} />
              </div>
            </div>
          </motion.div>
        );
      })}
    </div>
  );
};

export default StatsCards;
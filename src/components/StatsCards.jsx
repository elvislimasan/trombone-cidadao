import React from 'react';
import { motion } from 'framer-motion';
import { AlertTriangle, Clock, CheckCircle, BarChart3, CheckCheck } from 'lucide-react';

const StatsCards = ({ stats, onCardClick, user, compact = false }) => {
  const cardsData = [
    { title: 'Ativas', value: stats.total, icon: BarChart3, bg: 'bg-blue-500', status: 'active' },
    { title: 'Pendentes', value: stats.pending, icon: AlertTriangle, bg: 'bg-red-500', status: 'pending' },
    { title: 'Em Andamento', value: stats.inProgress, icon: Clock, bg: 'bg-amber-500', status: 'in-progress' },
    { title: 'Resolvidas', value: stats.totalResolved, icon: CheckCheck, bg: 'bg-emerald-500', status: 'resolved' },
    { title: 'Minhas Resolvidas', value: stats.resolved, icon: CheckCircle, bg: 'bg-teal-500', status: 'my-resolved', requiresUser: true }
  ];

  const cards = cardsData.filter(card => !card.requiresUser || (card.requiresUser && user));

  if (compact) {
    return (
      <div className="grid grid-cols-2 gap-2">
        {cards.map((card, index) => {
          const Icon = card.icon;
          return (
            <motion.button
              key={card.title}
              type="button"
              initial={{ y: 30, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: index * 0.06 }}
              className="flex items-center justify-between rounded-md bg-black/70 text-white px-2.5 py-2 text-left text-xs"
              onClick={() => onCardClick(card.status)}
            >
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-semibold uppercase tracking-wide opacity-80 truncate">
                  {card.title}
                </p>
                <p className="text-sm font-bold mt-0.5">
                  {card.value}
                </p>
              </div>
              <div className="w-7 h-7 rounded-lg bg-white/10 flex items-center justify-center flex-shrink-0">
                <Icon className="w-3.5 h-3.5 text-white" />
              </div>
            </motion.button>
          );
        })}
      </div>
    );
  }

  return (
    <div className={`grid grid-cols-2 sm:grid-cols-3 ${user ? 'lg:grid-cols-5' : 'lg:grid-cols-4'} gap-2.5 sm:gap-3 md:gap-4`}>
      {cards.map((card, index) => {
        const Icon = card.icon;
        return (
          <motion.div
            key={card.title}
            initial={{ y: 50, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: index * 0.1 }}
            className="bg-card border border-border rounded-lg p-3 md:p-4 shadow-none md:shadow-md hover:bg-card/80 md:hover:shadow-lg transition-colors md:transition-all cursor-pointer"
            onClick={() => onCardClick(card.status)}
          >
            <div className="flex items-center justify-between gap-1.5 md:gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-[10px] md:text-xs font-semibold tracking-wide text-muted-foreground uppercase truncate">
                  {card.title}
                </p>
                <p className="text-base md:text-2xl font-extrabold mt-0.5 md:mt-1 text-foreground">
                  {card.value}
                </p>
              </div>
              <div className={`w-8 h-8 md:w-10 md:h-10 rounded-xl ${card.bg} flex items-center justify-center flex-shrink-0`}>
                <Icon className="w-4 h-4 md:w-5 md:h-5 text-white" />
              </div>
            </div>
          </motion.div>
        );
      })}
    </div>
  );
};

export default StatsCards;

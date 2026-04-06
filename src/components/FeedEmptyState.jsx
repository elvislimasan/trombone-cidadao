import React from 'react';
import { Megaphone, MapPin, TrendingUp, CheckCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { motion } from 'framer-motion';

const TAB_CONFIG = {
  recent: {
    icon: Megaphone,
    title: 'Nenhuma bronca por aqui!',
    subtitle: 'Seja o primeiro a reportar um problema na sua cidade.',
    cta: 'Reportar uma bronca',
  },
  trending: {
    icon: TrendingUp,
    title: 'Nada bombando no momento',
    subtitle: 'Ainda não há broncas com muitos apoios nos últimos 7 dias.',
    cta: 'Ver broncas recentes',
  },
  resolved: {
    icon: CheckCircle,
    title: 'Nenhuma bronca resolvida ainda',
    subtitle: 'Quando um problema for solucionado, aparecerá aqui como case de sucesso.',
    cta: null,
  },
};

const FeedEmptyState = ({ tab = 'recent', onCreateReport, onChangeTab }) => {
  const config = TAB_CONFIG[tab] || TAB_CONFIG.recent;
  const Icon = config.icon;

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col items-center justify-center py-16 px-6 text-center"
    >
      <div className="w-20 h-20 rounded-full bg-muted flex items-center justify-center mb-4">
        <Icon size={36} className="text-muted-foreground" />
      </div>

      <h3 className="font-bold text-lg text-foreground mb-2">{config.title}</h3>
      <p className="text-sm text-muted-foreground max-w-xs mb-6">{config.subtitle}</p>

      <div className="flex flex-col gap-2 w-full max-w-xs">
        {tab !== 'resolved' && onCreateReport && (
          <Button onClick={onCreateReport} className="w-full gap-2">
            <Megaphone size={16} />
            Reportar uma bronca
          </Button>
        )}
        {tab === 'trending' && onChangeTab && (
          <Button variant="outline" onClick={() => onChangeTab('recent')} className="w-full">
            Ver broncas recentes
          </Button>
        )}
      </div>
    </motion.div>
  );
};

export default FeedEmptyState;

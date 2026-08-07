import React from 'react';
import EmptyState from '@/design-system/primitives/EmptyState';
import Icon from '@/design-system/icons';
import { Button } from '@/components/ui/button';

const TAB_CONFIG = {
  recent: {
    icon: 'trombone',
    title: 'Nenhuma bronca por aqui!',
    subtitle: 'Seja o primeiro a reportar um problema na sua cidade.',
  },
  trending: {
    icon: 'stats',
    title: 'Nada bombando no momento',
    subtitle: 'Ainda não há broncas com muitos apoios nos últimos 7 dias.',
  },
  resolved: {
    icon: 'resolved',
    title: 'Nenhuma bronca resolvida ainda',
    subtitle: 'Quando um problema for solucionado, aparecerá aqui como case de sucesso.',
  },
};

const FeedEmptyState = ({ tab = 'recent', onCreateReport, onChangeTab }) => {
  const config = TAB_CONFIG[tab] || TAB_CONFIG.recent;

  return (
    <EmptyState
      icon={config.icon}
      title={config.title}
      description={config.subtitle}
      action={
        <div className="flex flex-col gap-2 w-full max-w-xs">
          {tab !== 'resolved' && onCreateReport && (
            <Button onClick={onCreateReport} className="w-full gap-2">
              <Icon name="trombone" size={16} />
              Reportar uma bronca
            </Button>
          )}
          {tab === 'trending' && onChangeTab && (
            <Button variant="outline" onClick={() => onChangeTab('recent')} className="w-full">
              Ver broncas recentes
            </Button>
          )}
        </div>
      }
    />
  );
};

export default FeedEmptyState;

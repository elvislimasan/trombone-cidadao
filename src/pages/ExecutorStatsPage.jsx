import React, { useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { supabase } from '@/lib/customSupabaseClient';
import ExecutorStatisticsView from '@/components/municipality/ExecutorStatisticsView';

export default function ExecutorStatsPage() {
  const context = useOutletContext(), activity = context.executionActivity;
  const [response, setResponse] = useState(null), [revision, setRevision] = useState(0);
  const key = `${context.userId}:${context.municipality.id}:${context.activeChannelId}:${activity.id}`;
  useEffect(() => {
    let active = true; setResponse(null);
    supabase.rpc('estatisticas_executor', { p_prefeitura: context.municipality.id, p_especialidade: activity.id, p_canal: context.activeChannelId || null })
      .then(({ data, error }) => { if (active) setResponse({ key, data, error: ['42883', 'PGRST202'].includes(error?.code) ? 'As estatísticas dos executores precisam da migração 381 no banco. Depois de aplicá-la, atualize esta página.' : error?.message }); })
      .catch(error => { if (active) setResponse({ key, error: error.message }); });
    return () => { active = false; };
  }, [key, context.municipality.id, context.activeChannelId, activity.id, revision]);
  const current = response?.key === key ? response : null;
  const data = current?.data;
  const stats = { completed: Number(data?.completed || 0), assets: Number(data?.assets || 0), thisMonth: Number(data?.this_month || 0), neighborhoods: Number(data?.neighborhoods || 0),
    services: (data?.services || []).map(item => ({ key: item.service, label: activity.services.find(([key]) => key === item.service)?.[1] || item.service, count: Number(item.total) })), topNeighborhoods: data?.top_neighborhoods || [], recent: data?.recent || [] };
  return <ExecutorStatisticsView context={context} title={activity.title} workLabel={'Seu trabalho em ' + activity.label.toLocaleLowerCase('pt-BR')} assetLabel={activity.id === 'arborizacao' ? 'Árvores atendidas' : activity.id === 'ruas' ? 'Ruas atendidas' : 'Locais atendidos'} assetDetail="Ativos ou locais diferentes atendidos" panelPath={activity.path} stats={stats} ranking={data?.ranking || []} rankingLabel="Minha produção" rankingDescription="Atendimentos registrados por você nesta atividade." titleForItem={value => value} loading={!current} error={current?.error} refresh={() => setRevision(value => value + 1)} />;
}

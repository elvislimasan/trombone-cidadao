import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/customSupabaseClient';
import { DEMAND_PRIORITIES, DEMAND_STATUSES, OPEN_DEMAND_STATUSES } from '@/lib/municipalDemand';

const priorityRank = { urgente: 0, alta: 1, normal: 2, baixa: 3 };
const labelFor = (values, value) => values.find(([key]) => key === value)?.[1] || value;
const formatDate = (value) => value ? new Date(value).toLocaleDateString('pt-BR') : '';

export default function LightingPendingPanel({ municipalityId, cityId, revision, showHeading = true }) {
  const [state, setState] = useState({ rows: [], count: 0, unassigned: [], unassignedCount: 0, loading: true, error: '' });
  useEffect(() => {
    if (!municipalityId || !cityId) return undefined;
    let active = true;
    setState((current) => ({ ...current, loading: true, error: '' }));
    const orders = supabase.from('demandas_municipais')
      .select('id,protocolo,titulo,status,prioridade,prazo_em,created_at,pole_id,pole:poles(identifier,plate,address),responsavel:profiles!demandas_municipais_atribuido_a_fkey(name)', { count: 'exact' })
      .eq('prefeitura_id', municipalityId).eq('category_id', 'iluminacao')
      .not('pole_id', 'is', null).in('status', OPEN_DEMAND_STATUSES)
      .order('created_at', { ascending: false }).limit(50);
    Promise.all([orders, supabase.rpc('postes_iluminacao_sem_ordem', { p_city_id: cityId })])
      .then(([orderResult, unassignedResult]) => {
        if (active) setState({
          rows: orderResult.data || [], count: orderResult.count || 0,
          unassigned: unassignedResult.data || [], unassignedCount: Number(unassignedResult.data?.[0]?.total || 0),
          loading: false, error: [orderResult.error?.message, unassignedResult.error?.message].filter(Boolean).join(' · '),
        });
      });
    return () => { active = false; };
  }, [municipalityId, cityId, revision]);

  const rows = useMemo(() => {
    const now = Date.now();
    return [...state.rows].sort((a, b) => {
      const overdueA = a.prazo_em && Date.parse(a.prazo_em) < now ? 0 : 1;
      const overdueB = b.prazo_em && Date.parse(b.prazo_em) < now ? 0 : 1;
      return overdueA - overdueB || (priorityRank[a.prioridade] ?? 2) - (priorityRank[b.prioridade] ?? 2)
        || Date.parse(a.prazo_em || '9999-12-31') - Date.parse(b.prazo_em || '9999-12-31')
        || Date.parse(a.created_at) - Date.parse(b.created_at);
    });
  }, [state.rows]);

  return <div className="space-y-5">
    {showHeading && <div><h2 className="text-sm font-semibold">Pendências de iluminação</h2><p className="mt-1 text-xs leading-5 text-content-secondary">Dados da cidade inteira. Priorize postes sem ordem, prazos vencidos e urgências.</p></div>}
    {!showHeading && <p className="text-sm text-content-secondary">Priorize postes sem ordem, prazos vencidos e urgências.</p>}
    {state.loading ? <p role="status" className="flex items-center gap-2 text-xs text-content-secondary"><Loader2 className="h-4 w-4 animate-spin" />Carregando pendências…</p>
      : <>
        {state.error && <p role="alert" className="text-xs text-danger">Alguns dados não foram carregados: {state.error}</p>}
        <section className="space-y-2"><h3 className="text-xs font-semibold">Problemas sem ordem · {state.unassignedCount.toLocaleString('pt-BR')}</h3>
          {state.unassigned.length ? <div className="grid gap-2 sm:grid-cols-2">{state.unassigned.map((pole) => <Link key={pole.id} to={`/prefeitura/demandas/nova?poste=${pole.id}`} className="block rounded-lg border border-danger-subtleFg/20 bg-danger-subtleBg/40 p-3 text-xs hover:bg-danger-subtleBg"><strong>Poste {pole.identifier || pole.plate || pole.id}</strong><span className="mt-1 block text-content-secondary">{pole.address || 'Endereço não informado'} · Criar ordem</span></Link>)}</div> : !state.error && <p className="text-xs text-content-secondary">Nenhum poste com problema sem ordem ativa.</p>}
          {state.unassignedCount > state.unassigned.length && <p className="text-[11px] text-content-secondary">Exibindo os primeiros 50 postes. Use o filtro “Apagados / com problema” no mapa para ver todos.</p>}
        </section>
        <section className="space-y-2 border-t border-edge-subtle pt-3"><h3 className="text-xs font-semibold">Ordens abertas · {state.count.toLocaleString('pt-BR')}</h3>
        {rows.length ? <div className="space-y-2">{rows.map((row) => {
          const overdue = row.prazo_em && Date.parse(row.prazo_em) < Date.now();
          return <Link key={row.id} to={`/prefeitura/demandas/${row.id}`} className="block rounded-xl border border-edge-subtle p-3 hover:bg-surface-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand">
            <span className="flex items-start justify-between gap-2"><strong className="min-w-0 break-words text-xs">{row.protocolo} · Poste {row.pole?.identifier || row.pole?.plate || row.pole_id}</strong><ArrowRight className="h-3.5 w-3.5 shrink-0 text-content-secondary" /></span>
            <span className="mt-1 block break-words text-xs text-content-secondary">{row.titulo}</span>
            <span className="mt-2 flex flex-wrap gap-1 text-[11px]"><span className="rounded bg-surface-subtle px-1.5 py-0.5">{labelFor(DEMAND_STATUSES, row.status)}</span><span className="rounded bg-surface-subtle px-1.5 py-0.5">{labelFor(DEMAND_PRIORITIES, row.prioridade)}</span>{overdue && <span className="rounded bg-danger-subtleBg px-1.5 py-0.5 font-semibold text-danger-subtleFg">Prazo vencido</span>}</span>
            <span className="mt-2 block text-[11px] text-content-secondary">{row.prazo_em ? `Prazo: ${formatDate(row.prazo_em)}` : 'Sem prazo definido'} · {row.responsavel?.name || 'Sem responsável'}</span>
          </Link>;
        })}</div> : <p className="rounded-lg border border-dashed border-edge-subtle p-3 text-xs text-content-secondary">Nenhuma ordem aberta vinculada a poste.</p>}
    {state.count > rows.length && <p className="text-[11px] text-content-secondary">Exibindo as 50 ordens mais recentes. A lista completa está em Ordens de serviço.</p>}
    <Link to="/prefeitura/demandas" className="inline-flex items-center gap-1 text-xs font-semibold text-brand hover:underline">Ver todas as ordens <ArrowRight className="h-3.5 w-3.5" /></Link>
        </section>
      </>}
  </div>;
}

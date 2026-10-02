import React, { useEffect, useMemo, useState } from 'react';
import { Helmet } from 'react-helmet';
import { Loader2, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/customSupabaseClient';
import { normalizeLampType } from '@/lib/lightingCatalog';
import { rotuloDoTipoDeProblemaIluminacao } from '@/lib/reportCategoryFields';
import useMunicipalityWorkspace from '@/hooks/useMunicipalityWorkspace';

const BATCH = 1000;
const completed = (order) => order.status === 'concluida';
const hoursToComplete = (order) => {
  const start = Date.parse(order.created_at);
  const end = Date.parse(order.concluida_em || order.executada_em);
  return Number.isFinite(start) && Number.isFinite(end) && end >= start ? (end - start) / 3600000 : null;
};
const duration = (hours) => hours == null ? 'Sem dados' : hours < 48
  ? `${hours.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} h`
  : `${(hours / 24).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} dias`;
const average = (values) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;

async function loadAll(table, fields, apply) {
  const rows = [];
  for (let start = 0; ; start += BATCH) {
    const { data, error } = await apply(supabase.from(table).select(fields)).range(start, start + BATCH - 1);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < BATCH) return rows;
  }
}

function Stat({ label, value, detail }) {
  return <div className="min-w-0 rounded-xl border border-edge-subtle bg-surface-raised p-5 shadow-sm"><p className="text-xs font-semibold text-content-secondary">{label}</p><strong className="mt-2 block text-2xl font-bold tabular-nums">{value}</strong><p className="mt-1 text-xs text-content-secondary">{detail}</p></div>;
}

export default function MunicipalLightingStatsPage() {
  const context = useMunicipalityWorkspace();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const cityId = context.municipality?.city_id;
  const municipalityId = context.municipality?.id;

  useEffect(() => {
    if (!cityId || !municipalityId) return undefined;
    let active = true;
    setLoading(true); setError(''); setData(null);
    Promise.all([
      loadAll('poles', 'id,lamp_type,lamp_power_w,lighting_status,is_broken', (query) => query.eq('city_id', cityId).neq('lighting_status', 'removido').order('id')),
      loadAll('demandas_municipais', 'id,protocolo,titulo,issue_type,service_type,status,created_at,executada_em,concluida_em', (query) => query.eq('prefeitura_id', municipalityId).eq('category_id', 'iluminacao').order('id')),
    ]).then(([poles, orders]) => { if (active) setData({ poles, orders }); })
      .catch((cause) => { if (active) setError(cause.message || 'Não foi possível carregar os dados.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [cityId, municipalityId, revision]);

  const stats = useMemo(() => {
    if (!data) return null;
    const lampCounts = new Map();
    let problems = 0;
    for (const pole of data.poles) {
      const name = normalizeLampType(pole.lamp_type) || 'Não informado';
      lampCounts.set(name, (lampCounts.get(name) || 0) + 1);
      if (pole.is_broken || ['apagado', 'manutencao'].includes(pole.lighting_status)) problems++;
    }
    const resolved = data.orders.filter(completed);
    const durations = resolved.map(hoursToComplete).filter((value) => value != null);
    const forService = (service) => resolved.filter((order) => order.service_type === service).map(hoursToComplete).filter((value) => value != null);
    const categories = new Map();
    for (const order of data.orders) {
      const key = order.issue_type || 'Não informado';
      const row = categories.get(key) || { issue: key, total: 0, complete: 0, hours: [] };
      row.total++;
      if (completed(order)) { row.complete++; const hours = hoursToComplete(order); if (hours != null) row.hours.push(hours); }
      categories.set(key, row);
    }
    return {
      lampCounts: [...lampCounts].sort((a, b) => b[1] - a[1]), problems,
      completed: resolved.length, open: data.orders.length - resolved.length,
      overall: average(durations), lamp: average(forService('lamp_replacement')),
      arm: average(forService('arm_installation')),
      categories: [...categories.values()].sort((a, b) => b.total - a.total),
      measured: durations.length,
    };
  }, [data]);

  if (context.loading) return <div className="page-shell-fluid py-10"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  if (!context.municipality) return <div className="page-shell-fluid py-10">Acesso institucional necessário.</div>;
  if (!context.enabledCategoryIds?.includes('iluminacao')) return <div className="page-shell-fluid py-10">Iluminação indisponível para esta prefeitura.</div>;
  const maxLamp = stats?.lampCounts[0]?.[1] || 1;
  return <div className="page-shell-fluid min-w-0 pb-10 pt-6 text-content-primary">
    <Helmet><title>Estatísticas de iluminação | Prefeitura</title><meta name="robots" content="noindex" /></Helmet>
    <header className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-brand">Iluminação pública</p><h1 className="mt-1 font-display text-2xl font-bold sm:text-3xl">Estatísticas de manutenção</h1><p className="mt-2 text-sm text-content-secondary">Inventário dos postes e ordens de serviço de iluminação da cidade.</p></div><Button variant="outline" onClick={() => setRevision((value) => value + 1)} disabled={loading}><RotateCcw className="mr-2 h-4 w-4" />Atualizar</Button></header>
    {loading && <p role="status" className="mt-8 flex items-center gap-2 text-sm"><Loader2 className="h-4 w-4 animate-spin" />Carregando estatísticas…</p>}
    {error && <p role="alert" className="mt-8 rounded-xl border border-danger-subtleFg/20 bg-danger-subtleBg p-4 text-sm text-danger-subtleFg">{error}</p>}
    {stats && !loading && <>
      <section aria-label="Indicadores de manutenção" className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Postes ativos" value={data.poles.length.toLocaleString('pt-BR')} detail={`${stats.problems.toLocaleString('pt-BR')} apagados ou com problema`} />
        <Stat label="Ordens em aberto" value={stats.open.toLocaleString('pt-BR')} detail="Demandas de iluminação ainda não concluídas" />
        <Stat label="Ordens concluídas" value={stats.completed.toLocaleString('pt-BR')} detail={`${stats.measured} com tempo de atendimento calculável`} />
        <Stat label="Tempo médio geral" value={duration(stats.overall)} detail="Da abertura à execução ou conclusão" />
      </section>
      <section aria-label="Tempo médio por serviço" className="mt-5 grid gap-3 md:grid-cols-2">
        <Stat label="Tempo médio para troca de lâmpada" value={duration(stats.lamp)} detail="Ordens concluídas registradas como troca de lâmpada" />
        <Stat label="Tempo médio para instalar braço de luz" value={duration(stats.arm)} detail="Ordens concluídas registradas como instalação de braço" />
      </section>
      <div className="mt-5 grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <section className="min-w-0 rounded-xl border border-edge-subtle bg-surface-raised p-5 shadow-sm"><h2 className="text-lg font-bold">Tipos de lâmpada</h2><p className="mt-1 text-xs text-content-secondary">Quantidade de postes ativos por tecnologia cadastrada.</p><div className="mt-5 space-y-4">{stats.lampCounts.map(([name, count]) => <div key={name}><div className="mb-1 flex justify-between gap-3 text-sm"><span className="min-w-0 break-words">{name}</span><strong className="tabular-nums">{count.toLocaleString('pt-BR')}</strong></div><div className="h-3 overflow-hidden rounded-full bg-surface-subtle"><div className="h-full rounded-full bg-brand" style={{ width: `${count / maxLamp * 100}%` }} /></div></div>)}{!stats.lampCounts.length && <p className="text-sm text-content-secondary">Nenhum poste cadastrado.</p>}</div></section>
        <section className="min-w-0 rounded-xl border border-edge-subtle bg-surface-raised p-5 shadow-sm"><h2 className="text-lg font-bold">Serviços por problema</h2><p className="mt-1 text-xs text-content-secondary">Ordens de iluminação registradas pela prefeitura.</p><div className="mt-4 overflow-x-auto"><table className="w-full min-w-[28rem] text-left text-sm"><thead className="border-b border-edge-subtle text-xs text-content-secondary"><tr><th className="py-2 pr-3">Problema</th><th className="py-2 pr-3 text-right">Total</th><th className="py-2 pr-3 text-right">Concluídas</th><th className="py-2 text-right">Tempo médio</th></tr></thead><tbody className="divide-y divide-edge-subtle">{stats.categories.map((row) => <tr key={row.issue}><td className="py-3 pr-3">{row.issue === 'Não informado' ? row.issue : rotuloDoTipoDeProblemaIluminacao(row.issue)}</td><td className="py-3 pr-3 text-right tabular-nums">{row.total}</td><td className="py-3 pr-3 text-right tabular-nums">{row.complete}</td><td className="py-3 text-right tabular-nums">{duration(average(row.hours))}</td></tr>)}</tbody></table>{!stats.categories.length && <p className="py-4 text-sm text-content-secondary">Nenhuma ordem de iluminação registrada.</p>}</div></section>
      </div>
      <p className="mt-4 text-xs text-content-secondary">Os tempos são calculados apenas para ordens concluídas com data de abertura e data de execução ou conclusão. Médias por serviço usam o campo “Serviço executado” informado na ordem.</p>
    </>}
  </div>;
}

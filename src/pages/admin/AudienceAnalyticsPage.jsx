import { useCallback, useEffect, useMemo, useState } from 'react';
import { Helmet } from 'react-helmet';
import { BarChart3, Eye, Loader2, MonitorSmartphone, Users, Waypoints } from 'lucide-react';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import AdminModuleHero from '@/components/admin/AdminModuleHero';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/customSupabaseClient';
import { showAppError } from '@/lib/appError';

const PERIODS = [7, 30, 90];
const PLATFORM_LABELS = { web: 'Site', android: 'Android', ios: 'iOS' };
const number = new Intl.NumberFormat('pt-BR');

const shortDate = (value) => new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  timeZone: 'UTC',
}).format(new Date(`${value}T12:00:00Z`));

export default function AudienceAnalyticsPage() {
  const [days, setDays] = useState(7);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data: result, error } = await supabase.rpc('audience_dashboard', { p_days: days });
    setLoading(false);
    if (error) {
      showAppError({ title: 'Não foi possível carregar a audiência', description: error.message, variant: 'destructive' });
      return;
    }
    setData(result);
  }, [days]);

  useEffect(() => { load(); }, [load]);

  const daily = useMemo(() => (data?.daily || []).map((item) => ({
    ...item,
    label: shortDate(item.date),
  })), [data]);
  const totals = data?.totals || {};
  const noData = !loading && Number(totals.page_views || 0) === 0;

  return (
    <>
      <Helmet><title>Audiência — Painel Administrativo</title></Helmet>
      <div className="mx-auto w-full max-w-[100rem] px-4 py-6 sm:px-6 lg:px-8">
        <AdminModuleHero
          eyebrow="Audiência do Trombone"
          title="Site, Android e iOS em um só painel"
          description="Acessos anônimos medidos pelo próprio Trombone. Os dados começam a ser contabilizados após a publicação desta versão."
          icon={BarChart3}
          stats={[
            { label: 'visualizações', value: number.format(totals.page_views || 0) },
            { label: 'usuários', value: number.format(totals.users || 0) },
            { label: 'sessões', value: number.format(totals.sessions || 0) },
          ]}
        />

        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-extrabold text-content-primary">Visão geral</h2>
            <p className="text-xs text-content-secondary">Visitantes são identificados apenas por um código aleatório no aparelho.</p>
          </div>
          <div className="flex rounded-xl border border-edge-subtle bg-surface-raised p-1" aria-label="Período da audiência">
            {PERIODS.map((period) => (
              <Button
                key={period}
                type="button"
                size="sm"
                variant={days === period ? 'default' : 'ghost'}
                className="h-8 px-3 text-xs"
                onClick={() => setDays(period)}
              >
                {period} dias
              </Button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="flex min-h-72 items-center justify-center gap-2 text-sm text-content-secondary">
            <Loader2 className="h-5 w-5 animate-spin" /> Carregando audiência…
          </div>
        ) : (
          <div className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {[
                { label: 'Visualizações de páginas', value: totals.page_views, icon: Eye },
                { label: 'Usuários', value: totals.users, icon: Users },
                { label: 'Novos usuários', value: totals.new_users, icon: MonitorSmartphone },
                { label: 'Sessões', value: totals.sessions, icon: Waypoints },
              ].map(({ label, value, icon: Icon }) => (
                <div key={label} className="rounded-2xl border border-edge-subtle bg-surface-raised p-4 shadow-sm">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs font-bold text-content-secondary">{label}</p>
                    <span className="rounded-xl bg-brand-subtleBg p-2 text-brand"><Icon className="h-4 w-4" /></span>
                  </div>
                  <strong className="mt-3 block text-3xl font-extrabold tabular-nums text-content-primary">{number.format(value || 0)}</strong>
                </div>
              ))}
            </div>

            {noData ? (
              <div className="rounded-2xl border border-dashed border-edge-default bg-surface-raised px-5 py-14 text-center">
                <BarChart3 className="mx-auto h-8 w-8 text-content-tertiary" />
                <p className="mt-3 font-bold text-content-primary">A medição começou agora</p>
                <p className="mt-1 text-sm text-content-secondary">Os gráficos serão preenchidos conforme o site e os aplicativos receberem acessos.</p>
              </div>
            ) : (
              <div className="rounded-2xl border border-edge-subtle bg-surface-raised p-4 shadow-sm sm:p-5">
                <h3 className="font-bold text-content-primary">Usuários e novos usuários</h3>
                <p className="text-xs text-content-secondary">Últimos {days} dias</p>
                <div className="mt-4 h-72 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={daily} margin={{ top: 8, right: 12, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="label" tick={{ fontSize: 11 }} minTickGap={20} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Legend />
                      <Line type="monotone" dataKey="users" name="Usuários" stroke="#b45309" strokeWidth={3} dot={false} />
                      <Line type="monotone" dataKey="new_users" name="Novos usuários" stroke="#7f1220" strokeWidth={3} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            <div className="grid gap-5 lg:grid-cols-2">
              <section className="rounded-2xl border border-edge-subtle bg-surface-raised p-4 shadow-sm sm:p-5">
                <h3 className="font-bold text-content-primary">Por plataforma</h3>
                <div className="mt-3 divide-y divide-edge-subtle">
                  {(data?.platforms || []).map((item) => (
                    <div key={item.platform} className="grid grid-cols-[1fr_auto_auto] items-center gap-4 py-3 text-sm">
                      <span className="font-bold text-content-primary">{PLATFORM_LABELS[item.platform] || item.platform}</span>
                      <span className="text-right text-content-secondary"><strong className="block tabular-nums text-content-primary">{number.format(item.users)}</strong><small>usuários</small></span>
                      <span className="text-right text-content-secondary"><strong className="block tabular-nums text-content-primary">{number.format(item.page_views)}</strong><small>acessos</small></span>
                    </div>
                  ))}
                </div>
              </section>

              <section className="rounded-2xl border border-edge-subtle bg-surface-raised p-4 shadow-sm sm:p-5">
                <h3 className="font-bold text-content-primary">Páginas mais acessadas</h3>
                <div className="mt-3 divide-y divide-edge-subtle">
                  {(data?.top_pages || []).map((item, index) => (
                    <div key={item.path} className="flex items-center gap-3 py-2.5 text-sm">
                      <span className="w-5 shrink-0 text-xs font-bold tabular-nums text-content-tertiary">{index + 1}</span>
                      <span className="min-w-0 flex-1 truncate font-medium text-content-primary" title={item.path}>{item.path}</span>
                      <span className="shrink-0 text-xs tabular-nums text-content-secondary">{number.format(item.page_views)} acessos</span>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          </div>
        )}
      </div>
    </>
  );
}


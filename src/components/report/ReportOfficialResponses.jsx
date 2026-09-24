import { useEffect, useState } from 'react';
import { Building2, Loader2, ShieldCheck } from 'lucide-react';
import { supabase } from '@/lib/customSupabaseClient';

const formatDate = (value) => value
  ? new Date(value).toLocaleString('pt-BR', { dateStyle: 'long', timeStyle: 'short' })
  : '';

export default function ReportOfficialResponses({ reportId }) {
  const [responses, setResponses] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    supabase.from('orgao_respostas')
      .select('id, orgao_nome, mensagem, created_at, autor:profiles!orgao_respostas_autor_id_fkey(name)')
      .eq('report_id', reportId)
      .eq('visibilidade', 'publica')
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        if (!cancelled) {
          setResponses(data || []);
          setLoading(false);
        }
      });
    return () => { cancelled = true; };
  }, [reportId]);

  if (loading) return <div className="flex items-center gap-2 rounded-2xl border border-edge-subtle bg-surface-raised px-4 py-3 text-xs text-content-tertiary"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Consultando respostas oficiais...</div>;
  if (responses.length === 0) return null;

  return <section className="overflow-hidden rounded-2xl border border-brand/25 bg-surface-raised shadow-sm" aria-labelledby="official-responses-title">
    <div className="flex items-center gap-3 border-b border-brand/15 bg-brand-subtleBg px-4 py-3">
      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand text-content-onBrand"><Building2 className="h-4 w-4" /></span>
      <div><h2 id="official-responses-title" className="flex items-center gap-1.5 text-sm font-black">Respostas oficiais <ShieldCheck className="h-4 w-4 text-brand" /></h2><p className="text-xs text-content-secondary">Publicadas pelo órgão responsável</p></div>
    </div>
    <div className="divide-y divide-edge-subtle">
      {responses.map((response) => <article key={response.id} className="px-4 py-4">
        <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-xs font-extrabold text-brand">{response.orgao_nome || 'Órgão público'}</p><time className="text-[11px] text-content-tertiary">{formatDate(response.created_at)}</time></div>
        <p className="mt-2 whitespace-pre-line text-sm leading-6 text-content-secondary">{response.mensagem}</p>
        <p className="mt-2 text-[11px] text-content-tertiary">Registrada por {response.autor?.name || 'equipe responsável'}</p>
      </article>)}
    </div>
  </section>;
}

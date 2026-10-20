import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Trees } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/customSupabaseClient';

// A seleção acontece exclusivamente nos ícones do mapa; aqui fica a confirmação.
export default function ReportTreePicker({ value, onChange, nearby }) {
  const [reports, setReports] = useState([]), [reportsError, setReportsError] = useState('');
  useEffect(() => {
    let cancelled = false;
    setReports([]); setReportsError('');
    if (!value.tree_id) return;
    supabase.from('reports').select('id,title').eq('tree_id', value.tree_id).in('status', ['pending', 'in-progress', 'pending_resolution']).limit(5)
      .then(({ data, error }) => {
        if (!cancelled) {
          if (error) setReportsError('Não foi possível consultar as solicitações desta árvore.');
          else setReports(data || []);
        }
      }).catch(() => { if (!cancelled) setReportsError('Não foi possível consultar as solicitações desta árvore.'); });
    return () => { cancelled = true; };
  }, [value.tree_id]);
  return <div className="mt-3 min-w-0 space-y-2" aria-label="Seleção da árvore">
    {value.tree_id ? <div className="flex flex-wrap items-center gap-2 rounded-lg bg-surface-subtle px-3 py-2 text-sm">
      <Trees className="h-4 w-4 shrink-0 text-amber-600" aria-hidden="true" /><span className="min-w-0 flex-1 break-words">Árvore selecionada: <strong>{value.tree_label || 'Cadastro existente'}</strong></span>
      <Button variant="ghost" type="button" size="sm" onClick={() => onChange({ tree_id: null, tree_label: '' })}>Desvincular</Button>
    </div> : <p className="text-xs text-muted-foreground">{nearby.loading ? 'Carregando árvores do mapa…' : 'Toque em uma árvore no mapa para vinculá-la à bronca.'}</p>}
    {nearby.error && <p role="alert" className="text-xs text-destructive">{nearby.error} <button type="button" className="underline" onClick={nearby.retry}>Tentar novamente</button></p>}
    {reportsError && <p role="alert" className="text-xs text-destructive">{reportsError}</p>}
    {reports.length > 0 && <div className="space-y-1 text-xs text-muted-foreground"><p>Já existem solicitações abertas nesta árvore:</p>{reports.map(report => <Link className="block break-words underline" key={report.id} to={`/bronca/${report.id}`} target="_blank" rel="noreferrer">{report.title}</Link>)}</div>}
  </div>;
}

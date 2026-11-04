import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, Loader2, MessageSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/customSupabaseClient';
import { isActiveTreeReport, loadActiveTreeReports } from '@/lib/treeInventory';
import './treeActiveReports.css';

const labels = { pending: 'Aberta', 'in-progress': 'Em andamento', pending_resolution: 'Aguardando confirmação' };

export default function TreeActiveReports({ treeId, cityId, reports }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(reports === undefined);
  const [error, setError] = useState(false);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    if (reports !== undefined) { setRows(reports.filter(isActiveTreeReport)); setLoading(false); setError(false); return; }
    let active = true;
    setRows([]); setLoading(true); setError(false);
    loadActiveTreeReports(supabase, treeId, cityId).then(data => { if (active) setRows(data.filter(isActiveTreeReport)); })
      .catch(() => { if (active) setError(true); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [treeId, cityId, reports, revision]);
  if (!loading && !error && !rows.length) return null;
  return <section className="tree-active-reports" aria-label="Broncas ativas vinculadas à árvore" data-testid="tree-active-reports">
    <header><MessageSquare size={18} /><h3>Broncas ativas</h3>{!loading && !error && <span>{rows.length}</span>}</header>
    {loading ? <p role="status"><Loader2 size={14} className="animate-spin" />Buscando solicitações…</p> : error ? <div role="alert"><p>Não foi possível carregar as broncas ativas.</p><Button type="button" variant="ghost" size="sm" onClick={() => setRevision(value => value + 1)}>Tentar novamente</Button></div> : <>
      <p>O destaque amarelo indica uma solicitação ativa vinculada a esta árvore.</p>
      <ul>{rows.map(report => <li key={report.id}><Link to={`/bronca/${report.id}`}><div><strong>{report.title || 'Solicitação de arborização'}</strong><small>{labels[report.status]}{report.protocol ? ` · ${report.protocol}` : ''}</small></div><ArrowUpRight size={17} aria-hidden="true" /></Link></li>)}</ul>
    </>}
  </section>;
}

import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ExternalLink, Flag, Loader2, ShieldCheck, Sprout } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/customSupabaseClient';
import { useCommunityTreeList } from '@/hooks/useCommunityTrees';
import { COMMUNITY_CARE_ACTIONS, COMMUNITY_TREE_STATUS, communityApiError, communityRpc, communityTreePath, hydrateCommunityPhotos } from '@/lib/communityTrees';
import { CommunityReportReviewDialog, CommunityReviewDialog } from './CommunityTreeDialogs';
import './communityTrees.css';

export default function CommunityTreeReview({ cityId }) {
  const [tab, setTab] = useState('trees'), [status, setStatus] = useState('pending'), [page, setPage] = useState(0), [reviewing, setReviewing] = useState(null), [report, setReport] = useState(null);
  const [reports, setReports] = useState({ rows: [], loading: false, error: '' }), [revision, setRevision] = useState(0);
  const list = useCommunityTreeList({ cityId, mode: 'review', status, page, enabled: tab === 'trees' });
  useEffect(() => { setPage(0); }, [tab, status, cityId]);
  useEffect(() => {
    let active = true;
    if (tab !== 'reports') return;
    setReports({ rows: [], loading: true, error: '' });
    communityRpc(supabase, 'list_community_care_reports', { p_city: cityId, p_limit: 24, p_offset: page * 24 }).then(rows => hydrateCommunityPhotos(supabase, rows || [])).then(rows => { if (active) setReports({ rows, loading: false, error: '' }); }).catch(error => { if (active) setReports({ rows: [], loading: false, error: communityApiError(error) }); });
    return () => { active = false; };
  }, [cityId, tab, page, revision]);
  const current = tab === 'trees' ? list : reports;
  return <section className="community-review-workspace">
    <header className="community-page-heading"><div><h1>Árvores da comunidade</h1><p>Revise os cadastros enviados pelos cidadãos e acompanhe denúncias de cuidados.</p></div></header>
    <div className="community-directory-toolbar"><nav className="community-tabs" aria-label="Revisão da comunidade"><button type="button" aria-current={tab === 'trees' ? 'page' : undefined} onClick={() => setTab('trees')}><Sprout size={16} />Cadastros</button><button type="button" aria-current={tab === 'reports' ? 'page' : undefined} onClick={() => setTab('reports')}><Flag size={16} />Denúncias de cuidados</button></nav>{tab === 'trees' && <label className="community-status-filter"><span className="sr-only">Situação dos cadastros</span><select value={status} onChange={event => setStatus(event.target.value)}>{Object.entries(COMMUNITY_TREE_STATUS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>}</div>
    {current.loading ? <p role="status" className="community-loading"><Loader2 className="animate-spin" />Carregando revisão…</p> : current.error ? <div role="alert" className="community-empty"><p>{current.error}</p><Button variant="outline" onClick={() => { list.refresh(); setRevision(value => value + 1); }}>Tentar novamente</Button></div> : !current.rows.length ? <div className="community-empty"><ShieldCheck size={34} /><h2>{tab === 'trees' ? 'Nenhum cadastro neste filtro' : 'Nenhuma denúncia pendente'}</h2><p>As novas participações da cidade aparecerão aqui.</p></div> : tab === 'trees' ? <div className="community-tree-grid">{list.rows.map(tree => <article key={tree.id} className="community-tree-card"><div className="community-tree-card-photo">{tree.photo_url ? <img src={tree.photo_url} alt={`Árvore ${tree.name}`} /> : <Sprout size={45} />}<span className={`community-status is-${tree.status}`}>{COMMUNITY_TREE_STATUS[tree.status]}</span></div><div className="community-tree-card-copy"><h2>{tree.name}</h2><p>{tree.species_name || 'Espécie a identificar'} · {tree.city_name}</p><p>{tree.public_profile ? 'Perfil público após aprovação' : 'Acompanhamento privado'}</p><footer><Button onClick={() => setReviewing(tree)}><ShieldCheck size={16} />Revisar cadastro</Button><Button asChild variant="ghost" size="icon"><Link to={communityTreePath(tree.id)} aria-label={`Abrir perfil de ${tree.name}`}><ExternalLink size={17} /></Link></Button></footer></div></article>)}</div> : <div className="community-report-list">{reports.rows.map(row => <article key={row.id} className="community-report-card">{row.photo_url && <img src={row.photo_url} alt="Foto do cuidado denunciado" />}<div><h2>{row.tree_name}</h2><p className="community-muted">{COMMUNITY_CARE_ACTIONS[row.action]}</p><p>{row.reason}</p></div><Button variant="outline" onClick={() => setReport(row)}>Revisar denúncia</Button></article>)}</div>}
    {(page > 0 || current.rows.length === 24) && <nav className="community-pagination" aria-label="Páginas da revisão"><Button variant="outline" disabled={page === 0 || current.loading} onClick={() => setPage(value => value - 1)}>Anterior</Button><span>Página {page + 1}</span><Button variant="outline" disabled={current.rows.length < 24 || current.loading} onClick={() => setPage(value => value + 1)}>Próxima</Button></nav>}
    {reviewing && <CommunityReviewDialog tree={reviewing} onClose={() => setReviewing(null)} onSaved={list.refresh} />}
    {report && <CommunityReportReviewDialog report={report} onClose={() => setReport(null)} onSaved={() => setRevision(value => value + 1)} />}
  </section>;
}

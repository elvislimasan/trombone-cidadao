import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import TreeFormDialog from '@/components/arborization/TreeFormDialog';
import { supabase } from '@/lib/customSupabaseClient';
import { TREE_SERVICES } from '@/lib/arborization';
import { nearbyTrees } from '@/lib/treeInventory';

export function useNearbyReportTrees(category, location, cityId) {
  const [state, setState] = useState({ trees: [], loading: false, error: '' });
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let cancelled = false;
    setState({ trees: [], loading: category === 'poda' && !!location, error: '' });
    if (category !== 'poda' || !location) return;
    const timer = setTimeout(async () => {
      try {
        const { data, error } = await supabase.rpc('nearby_report_trees', { p_lat: location.lat, p_lng: location.lng, p_city_id: cityId || null });
        if (error) throw error;
        if (!cancelled) setState({ trees: nearbyTrees(data || [], location), loading: false, error: '' });
      } catch { if (!cancelled) setState({ trees: [], loading: false, error: 'Não foi possível buscar árvores próximas.' }); }
    }, 350);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [category, location?.lat, location?.lng, cityId, revision]);
  return { ...state, retry: () => setRevision(value => value + 1) };
}

export default function ReportTreePicker({ value, onChange, nearby, onSelect, resolveCity, authenticated }) {
  const [registration, setRegistration] = useState(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [reports, setReports] = useState([]), [reportsError, setReportsError] = useState('');
  useEffect(() => {
    let cancelled = false;
    setReports([]); setReportsError('');
    if (!value.tree_id) return;
    supabase.from('reports').select('id,title').eq('tree_id', value.tree_id).in('status', ['pending', 'in-progress', 'pending_resolution']).limit(5)
      .then(({ data, error: fetchError }) => { if (!cancelled) { if (fetchError) setReportsError('Não foi possível consultar as solicitações abertas desta árvore.'); else setReports(data || []); } })
      .catch(() => { if (!cancelled) setReportsError('Não foi possível consultar as solicitações abertas desta árvore.'); });
    return () => { cancelled = true; };
  }, [value.tree_id]);
  const register = async () => {
    setBusy(true); setError('');
    try {
      const cityId = await resolveCity(value.location);
      if (!cityId) throw new Error('Não foi possível identificar a cidade. Confira o ponto marcado.');
      const { data: city, error: cityError } = await supabase.from('cities').select('id,name').eq('id', cityId).single();
      if (cityError) throw cityError;
      setRegistration({ city, tree: { ...(value.tree_registration || {}), latitude: value.location.lat, longitude: value.location.lng, address: value.address || '' } });
    } catch (err) { setError(err.message || 'Não foi possível abrir o cadastro da árvore.'); }
    finally { setBusy(false); }
  };
  return <section className="mt-4 min-w-0 space-y-3 rounded-xl border border-emerald-700/30 bg-emerald-700/5 p-3" aria-label="Vincular árvore à bronca">
    <h3 className="text-sm font-semibold">Árvore e serviço solicitado</h3>
    <label className="grid gap-1 text-sm">Tipo de serviço<select className="h-10 w-full min-w-0 rounded-lg border border-input bg-background px-3" value={value.tree_service || 'poda'} onChange={event => onChange({ tree_service: event.target.value })}>{Object.entries(TREE_SERVICES).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
    {nearby.loading ? <p role="status" className="text-xs">Buscando árvores a até 80 metros…</p> : nearby.error ? <p role="alert" className="text-xs text-destructive">{nearby.error} <button type="button" className="underline" onClick={nearby.retry}>Tentar novamente</button></p> : <>
      <p className="text-xs text-muted-foreground">Selecione uma árvore no mapa ou na lista. Se ela ainda não estiver cadastrada, inclua seu cadastro abaixo.</p>
      {nearby.trees.length ? <ul className="max-h-48 space-y-2 overflow-y-auto">{nearby.trees.map(tree => <li key={tree.id}><button type="button" aria-pressed={value.tree_id === tree.id} className={`w-full rounded-lg border p-3 text-left text-sm ${value.tree_id === tree.id ? 'border-emerald-700 bg-emerald-700/10' : 'bg-background'}`} onClick={() => onSelect(tree)}><strong>{tree.common_name}</strong><span className="ml-2 text-xs">{tree.distance_m} m{tree.neighborhood ? ` · ${tree.neighborhood}` : ''}</span>{tree.scientific_name && <span className="block text-xs italic text-muted-foreground">{tree.scientific_name}</span>}</button></li>)}</ul> : <p className="text-xs text-muted-foreground">Nenhuma árvore cadastrada perto deste ponto.</p>}
    </>}
    {value.tree_id && <div className="space-y-2"><p className="text-sm font-medium">Árvore selecionada: {value.tree_label || 'Cadastro existente'}</p><Link className="text-sm underline" to={`/arborizacao/arvore/${value.tree_id}`} target="_blank" rel="noreferrer">Ver página da árvore</Link><Button variant="ghost" type="button" size="sm" onClick={() => onChange({ tree_id: null, tree_label: '' })}>Desvincular</Button></div>}
    {value.tree_registration && <p role="status" className="text-sm">Nova árvore: {value.tree_registration.common_name}. O cadastro será salvo ao enviar a bronca.{value.tree_photo_file ? ' Foto adicionada.' : ''}</p>}
    {reportsError && <p role="alert" className="text-xs text-destructive">{reportsError}</p>}
    {reports.length > 0 && <div className="space-y-2 text-sm"><p>Já existem solicitações abertas nesta árvore. Confira antes de registrar outra:</p>{reports.map(report => <Link className="block break-words underline" key={report.id} to={`/bronca/${report.id}`} target="_blank" rel="noreferrer">{report.title}</Link>)}</div>}
    <Button type="button" variant="outline" className="w-full" disabled={busy || !value.location || !!value.tree_id || nearby.loading || !!nearby.error || !authenticated} onClick={register}>{busy ? 'Identificando cidade…' : value.tree_registration ? 'Revisar cadastro da nova árvore' : 'Cadastrar árvore e vincular à bronca'}</Button>
    {!authenticated && <p className="text-xs text-muted-foreground">Entre na plataforma para cadastrar uma nova árvore junto com a bronca.</p>}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {registration && <TreeFormDialog reportMode initialPhoto={value.tree_photo_file || null} tree={registration.tree} city={registration.city} cityId={registration.city.id} onClose={() => setRegistration(null)} onSave={async (payload, _id, photo) => {
      onChange({ tree_id: null, tree_label: '', tree_registration: payload, tree_photo_file: photo, location: { lat: payload.latitude, lng: payload.longitude }, address: payload.address || value.address, city_id: registration.city.id });
    }} />}
  </section>;
}

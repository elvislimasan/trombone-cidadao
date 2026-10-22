import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/lib/customSupabaseClient';
import { Button } from '@/components/ui/button';

export default function TreeResponsibilitiesFields({ userId, userType, cities, assignments, onChange, onStatus }) {
  const [channels, setChannels] = useState([]);
  const [revision, setRevision] = useState(0);
  const [error, setError] = useState('');
  useEffect(() => {
    let cancelled = false;
    onStatus({ loading: true, error: false }); setError('');
    supabase.rpc('tree_management_channels', { p_user_id: userId }).then(({ data, error: failure }) => {
      if (cancelled) return;
      if (failure) throw failure;
      setChannels(data || []); onStatus({ loading: false, error: false });
    }).catch(() => {
      if (cancelled) return;
      setError('Não foi possível consultar os vínculos institucionais.');
      onStatus({ loading: false, error: true });
    });
    return () => { cancelled = true; };
  }, [userId, revision, onStatus]);
  const cityName = id => cities.find(city => String(city.id) === String(id))?.name || `Cidade ${id}`;
  return <fieldset className="space-y-3 rounded-xl border border-edge-subtle p-4">
    <legend className="px-1 text-sm font-semibold">Gestão de arborização</legend>
    <p className="text-xs text-content-secondary">Selecione as cidades e a secretaria responsável. O funcionário precisa de vínculo ativo com a prefeitura e a secretaria, além da liberação do módulo em Permissões.</p>
    {error && <div role="alert" className="space-y-2 text-sm text-destructive"><p>{error}</p><Button type="button" size="sm" variant="outline" onClick={() => setRevision(value => value + 1)}>Tentar novamente</Button></div>}
    {assignments.map(row => <div key={row.city_id} className="space-y-2 rounded-lg border border-edge-subtle p-3">
      <div className="flex items-center justify-between gap-2"><span className="break-words text-sm font-semibold">{cityName(row.city_id)}</span><Button type="button" variant="ghost" size="sm" aria-label={`Remover arborização de ${cityName(row.city_id)}`} onClick={() => onChange(assignments.filter(item => String(item.city_id) !== String(row.city_id)))}>Remover</Button></div>
      <label className="grid gap-1 text-xs">Secretaria<select aria-label={`Secretaria de arborização em ${cityName(row.city_id)}`} className="h-10 w-full min-w-0 rounded-md border border-input bg-background px-2 text-sm" value={row.canal_id} disabled={userType !== 'public_official'} onChange={event => onChange(assignments.map(item => item === row ? { ...item, canal_id: event.target.value } : item))}>
        {!channels.some(channel => channel.canal_id === row.canal_id && String(channel.city_id) === String(row.city_id)) && <option value={row.canal_id}>Vínculo indisponível — regularize ou remova</option>}
        {channels.filter(channel => String(channel.city_id) === String(row.city_id)).map(channel => <option key={channel.canal_id} value={channel.canal_id}>{channel.nome}</option>)}
      </select></label>
    </div>)}
    <label className="grid gap-1 text-xs font-medium">Adicionar responsabilidade<select aria-label="Adicionar cidade e secretaria de arborização" value="" disabled={userType !== 'public_official' || Boolean(error)} className="h-10 w-full min-w-0 rounded-md border border-input bg-background px-2 text-sm" onChange={event => {
      const channel = channels.find(item => item.canal_id === event.target.value);
      if (channel) onChange([...assignments, { city_id: channel.city_id, canal_id: channel.canal_id }]);
    }}><option value="">Escolha cidade e secretaria</option>{channels.filter(channel => !assignments.some(row => String(row.city_id) === String(channel.city_id))).map(channel => <option key={channel.canal_id} value={channel.canal_id}>{cityName(channel.city_id)} · {channel.nome}</option>)}</select></label>
    {!channels.length && !error && <p className="text-xs text-content-secondary">Nenhuma secretaria elegível encontrada. Cadastre ou regularize o vínculo em <Link className="underline" to="/admin/prefeituras">Prefeituras e acessos</Link>.</p>}
    {userType !== 'public_official' && <p className="text-xs text-content-secondary">Selecione o tipo Órgão Público para atribuir a gestão. Remova concessões antes de mudar para Cidadão.</p>}
  </fieldset>;
}

import React, { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { supabase } from '@/lib/customSupabaseClient';
import useTreeAdoptionCatalog from '@/hooks/useTreeAdoptionCatalog';
import TreeNurseryManager from './TreeNurseryManager';
import './treeAdoptionManagement.css';

function NurseryWorkspace({ cityId, city }) {
  const catalog = useTreeAdoptionCatalog(cityId);
  useEffect(() => {
    window.addEventListener('focus', catalog.refresh);
    return () => window.removeEventListener('focus', catalog.refresh);
  }, [catalog.refresh]);
  return <section className="tree-adoption-management-content" data-section="disponibilidade" aria-label="Gestão de viveiros e mudas">
    <TreeNurseryManager catalog={catalog} cityId={cityId} city={city} />
  </section>;
}

export default function TreeNurseriesManagement({ cityId, city }) {
  const { user } = useAuth();
  const [access, setAccess] = useState({ loading: true, allowed: false, error: '' });
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    setAccess({ loading: true, allowed: false, error: '' });
    if (!user?.id || !cityId) { setAccess({ loading: false, allowed: false, error: '' }); return; }
    supabase.rpc('can_manage_tree_adoption', { p_city: cityId }).then(({ data, error }) => {
      if (active) setAccess({ loading: false, allowed: !error && data === true, error: error ? 'Não foi possível verificar seu acesso aos viveiros.' : '' });
    }).catch(() => {
      if (active) setAccess({ loading: false, allowed: false, error: 'Não foi possível verificar seu acesso aos viveiros.' });
    });
    return () => { active = false; };
  }, [user?.id, cityId, revision]);
  if (access.loading) return <p role="status" className="py-6 text-sm">Verificando acesso aos viveiros…</p>;
  if (access.error) return <div role="alert" className="space-y-3 py-6 text-sm"><p>{access.error}</p><Button variant="outline" onClick={() => setRevision(value => value + 1)}>Tentar novamente</Button></div>;
  if (!access.allowed) return <p role="alert" className="py-6 text-sm">Sem acesso à gestão de viveiros desta cidade.</p>;
  return <NurseryWorkspace cityId={cityId} city={city} />;
}

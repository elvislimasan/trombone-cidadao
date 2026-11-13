import React, { useId, useRef, useState } from 'react';
import { Settings2, Sprout, Trees } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { supabase } from '@/lib/customSupabaseClient';
import { saveTreeAdoptionSettings } from '@/lib/treeAdoptionSettings';
import useTreeAdoptionSettings from '@/hooks/useTreeAdoptionSettings';
import './treeAdoptionSettings.css';

const OPTIONS = [
  { key: 'plantingEnabled', title: 'Plantio pela equipe', icon: Trees },
  { key: 'seedlingsEnabled', title: 'Solicitação de mudas', icon: Sprout },
];

export default function TreeAdoptionSettings({ cityId, canEdit }) {
  const id = useId();
  const settings = useTreeAdoptionSettings(cityId);
  const [saving, setSaving] = useState(false);
  const busy = useRef(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const toggle = async (option, enabled) => {
    if (busy.current) return;
    busy.current = true; setSaving(true); setError(''); setNotice('');
    try {
      await saveTreeAdoptionSettings(supabase, cityId, { [option.key]: enabled });
      setNotice(`${option.title}: ${enabled ? 'ativado' : 'desativado'}.`);
      window.dispatchEvent(new Event('tree-adoption-settings-updated'));
    } catch (err) { setError(err.message || 'Não foi possível salvar. Tente novamente.'); }
    finally { busy.current = false; setSaving(false); }
  };
  return <section className="tree-adoption-settings" aria-labelledby={`${id}-heading`} aria-busy={settings.loading || saving}>
    <header className="tree-adoption-settings-heading"><Settings2 size={18} aria-hidden="true" /><h2 id={`${id}-heading`}>Configurações</h2></header>
    <div className="tree-adoption-settings-options">
      {OPTIONS.map(option => <div key={option.key} className="tree-adoption-settings-option" data-state={!settings.loading && !settings.error && settings[option.key] ? 'checked' : 'unchecked'}>
        <span className="tree-adoption-settings-icon"><option.icon size={21} aria-hidden="true" /></span>
        <div className="tree-adoption-settings-label"><label htmlFor={`${id}-${option.key}`}>{option.title}</label><span id={`${id}-${option.key}-state`}>{settings.loading ? 'Carregando…' : settings.error ? 'Indisponível' : settings[option.key] ? 'Ativo' : 'Desativado'}</span></div>
        <Switch id={`${id}-${option.key}`} data-setting={option.key} className="tree-adoption-settings-switch" checked={settings[option.key]} onCheckedChange={enabled => toggle(option, enabled)} disabled={!canEdit || settings.loading || !!settings.error || saving} aria-describedby={`${id}-${option.key}-state ${id}-help`} />
      </div>)}
    </div>
    <p id={`${id}-help`} className="tree-adoption-settings-help">Ao desativar, novos pedidos dessa modalidade ficam indisponíveis. Pedidos recebidos continuam no atendimento.</p>
    {settings.error && <div role="alert" className="mt-3 flex flex-wrap items-center gap-3 text-sm"><p>{settings.error}</p><Button size="sm" variant="outline" onClick={settings.refresh}>Tentar novamente</Button></div>}
    {error && <p role="alert" className="mt-2 text-sm text-destructive">{error}</p>}
    <p role="status" className={saving ? 'mt-2 text-sm text-content-secondary' : 'sr-only'}>{saving ? 'Salvando…' : notice}</p>
  </section>;
}

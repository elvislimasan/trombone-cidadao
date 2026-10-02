import { useEffect, useState } from 'react';
import { Helmet } from 'react-helmet';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { MunicipalPageHeader } from '@/components/municipality/MunicipalPageUi';
import useMunicipalityWorkspace, { WORKSPACE_EVENT } from '@/hooks/useMunicipalityWorkspace';
import { DEMAND_PRIORITIES, suggestDemandAssignment } from '@/lib/municipalDemand';
import { supabase } from '@/lib/customSupabaseClient';
import { showAppError, showAppNotice } from '@/lib/appError';

const selectClass = 'mt-1 h-10 w-full min-w-0 rounded-lg border border-input bg-background px-3 text-sm';
const newRule = () => ({ key: crypto.randomUUID(), category_id: '', canal_id: '', atendimento_horas: '', primeira_resposta_horas: '', prioridade: 'normal' });
export default function MunicipalServiceSettingsPage() {
  const context = useMunicipalityWorkspace();
  const [rules, setRules] = useState([]);
  const [saving, setSaving] = useState(false);
  useEffect(() => { setRules(context.serviceRules.filter((rule) => context.enabledCategoryIds?.includes(rule.category_id)).map((rule) => ({ ...rule, key: rule.category_id, canal_id: rule.canal_id || '', atendimento_horas: rule.atendimento_horas ?? '', primeira_resposta_horas: rule.primeira_resposta_horas ?? '' }))); }, [context.serviceRules, context.enabledCategoryIds]);
  const update = (key, values) => setRules((current) => current.map((rule) => rule.key === key ? { ...rule, ...values } : rule));
  const save = async (event) => {
    event.preventDefault();
    if (!context.isAdministrator || saving) return;
    if (rules.some((rule) => !rule.category_id)) { showAppError({ title: 'Selecione a categoria de cada regra' }); return; }
    setSaving(true);
    try {
      const { error } = await supabase.rpc('salvar_configuracao_atendimento', {
        p_prefeitura: context.municipality.id,
        p_regras: [...context.serviceRules.filter((rule) => !context.enabledCategoryIds?.includes(rule.category_id)), ...rules].map((rule) => ({ category_id: rule.category_id, canal_id: rule.canal_id || null, prioridade: rule.prioridade,
          atendimento_horas: rule.atendimento_horas === '' ? null : Number(rule.atendimento_horas),
          primeira_resposta_horas: rule.primeira_resposta_horas === '' ? null : Number(rule.primeira_resposta_horas) })),
      });
      if (error) throw error;
      showAppNotice({ title: 'Regras de preenchimento salvas', description: 'Os valores serão sugeridos nas próximas ordens de serviço.' });
      window.dispatchEvent(new CustomEvent(WORKSPACE_EVENT));
    } catch (error) { showAppError({ title: 'Não foi possível salvar as regras', description: error.message }); }
    finally { setSaving(false); }
  };
  if (context.loading) return <div className="flex min-h-96 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  if (!context.isAdministrator) return <div className="page-shell-fluid py-10"><h1 className="text-2xl font-bold">Configuração do atendimento</h1><p className="mt-3 text-sm text-content-secondary">{context.error || 'Somente o administrador municipal pode configurar as regras.'}</p></div>;
  return <form onSubmit={save} className="page-shell-fluid space-y-6 pb-10 pt-8">
    <Helmet><title>Regras de atendimento | Prefeitura</title><meta name="robots" content="noindex" /></Helmet>
    <MunicipalPageHeader eyebrow="Configuração municipal" title="Preenchimento das ordens de serviço" description="Defina sugestões de secretaria, prioridade e prazos por categoria. A prefeitura decide quando abrir cada ordem de serviço." action={<Button type="submit" disabled={saving}>{saving ? 'Salvando…' : 'Salvar regras'}</Button>} />
    <div className="rounded-xl border border-brand/20 bg-brand-subtleBg p-4 text-sm leading-6 text-content-secondary">Os prazos usam horas corridas a partir da criação da ordem. Deixe em branco quando não houver um prazo padrão. As sugestões podem ser ajustadas em cada atendimento.</div>
    {!rules.length && <p className="rounded-xl border border-dashed border-edge-subtle p-6 text-sm text-content-secondary">Nenhuma regra definida. Os prazos permanecerão em branco até serem informados pela equipe.</p>}
    <div className="grid gap-4 2xl:grid-cols-2">{rules.map((rule) => <section key={rule.key} className="min-w-0 rounded-2xl border border-edge-subtle bg-surface-raised p-5">
      <div className="mb-4 flex items-center justify-between gap-3"><h2 className="font-bold">{context.categories.find((category) => category.id === rule.category_id)?.name || 'Nova regra'}</h2><Button type="button" variant="ghost" size="icon" disabled={saving} aria-label="Remover regra" onClick={() => setRules((current) => current.filter((item) => item.key !== rule.key))}><Trash2 className="h-4 w-4" /></Button></div>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm font-semibold">Categoria<select className={selectClass} value={rule.category_id} disabled={saving} onChange={(event) => { const categoryId = event.target.value; update(rule.key, { category_id: categoryId, canal_id: suggestDemandAssignment(context, categoryId).canal_id }); }}><option value="">Selecione</option>{context.categories.filter((category) => category.id === rule.category_id || !rules.some((item) => item.category_id === category.id)).map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
        <label className="text-sm font-semibold">Secretaria sugerida<select className={selectClass} value={rule.canal_id} disabled={saving} onChange={(event) => update(rule.key,{canal_id:event.target.value})}><option value="">Usar vínculo da categoria</option>{context.channels.map((channel) => <option key={channel.id} value={channel.id}>{channel.nome}</option>)}</select></label>
        <label className="text-sm font-semibold">Primeira resposta (horas)<Input className="mt-1" type="number" min="1" max="8760" step="1" value={rule.primeira_resposta_horas} disabled={saving} onChange={(event) => update(rule.key,{primeira_resposta_horas:event.target.value})} placeholder="Sem prazo padrão" /></label>
        <label className="text-sm font-semibold">Atendimento (horas)<Input className="mt-1" type="number" min="1" max="8760" step="1" value={rule.atendimento_horas} disabled={saving} onChange={(event) => update(rule.key,{atendimento_horas:event.target.value})} placeholder="Sem prazo padrão" /></label>
        <label className="text-sm font-semibold">Prioridade sugerida<select className={selectClass} value={rule.prioridade} disabled={saving} onChange={(event) => update(rule.key,{prioridade:event.target.value})}>{DEMAND_PRIORITIES.map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      </div>
    </section>)}</div>
    <Button type="button" variant="outline" disabled={saving || rules.length >= context.categories.length} onClick={() => setRules((current) => [...current,newRule()])}><Plus className="mr-2 h-4 w-4" />Adicionar regra por categoria</Button>
  </form>;
}

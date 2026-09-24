import { useEffect, useMemo, useState } from 'react';
import { Helmet } from 'react-helmet';
import { Link } from 'react-router-dom';
import { Building2, CheckCircle2, Clock, Loader2, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Combobox } from '@/components/ui/combobox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useCity } from '@/contexts/CityContext';
import { supabase } from '@/lib/customSupabaseClient';
import { showAppError, showAppNotice } from '@/lib/appError';

export default function MunicipalityAccessPage() {
  const { user } = useAuth();
  const { cities } = useCity();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [membership, setMembership] = useState(null);
  const [request, setRequest] = useState(null);
  const [form, setForm] = useState({ cityId: '', name: '', role: '', email: '', phone: '', message: '' });

  const cityOptions = useMemo(() => (cities || []).map((city) => ({
    value: String(city.id),
    label: `${city.name}${city.state?.uf ? ` - ${city.state.uf}` : ''}`,
  })), [cities]);

  useEffect(() => {
    if (!user?.id) return;
    Promise.all([
      supabase.from('prefeitura_membros')
        .select('id, papel, prefeitura:prefeituras!prefeitura_membros_prefeitura_id_fkey(nome, status, cidade:cities(name, states(uf)))')
        .eq('user_id', user.id).eq('ativo', true).limit(1).maybeSingle(),
      supabase.from('prefeitura_solicitacoes')
        .select('id, status, motivo, created_at, prefeitura_nome, cidade:cities(name, states(uf))')
        .eq('user_id', user.id).order('created_at', { ascending: false }).limit(1).maybeSingle(),
    ]).then(([memberResult, requestResult]) => {
      setMembership(memberResult.data || null);
      setRequest(requestResult.data || null);
      setLoading(false);
    });
  }, [user?.id]);

  const submit = async (event) => {
    event.preventDefault();
    if (!form.cityId || !form.name.trim() || !form.role.trim() || !form.email.trim()) {
      showAppError({ title: 'Preencha cidade, prefeitura, cargo e e-mail institucional', variant: 'destructive' });
      return;
    }
    setSaving(true);
    const { data, error } = await supabase.from('prefeitura_solicitacoes').insert({
      user_id: user.id,
      city_id: Number(form.cityId),
      prefeitura_nome: form.name.trim(),
      cargo: form.role.trim(),
      email_institucional: form.email.trim().toLowerCase(),
      telefone: form.phone.trim() || null,
      mensagem: form.message.trim() || null,
    }).select('id, status, created_at, prefeitura_nome, cidade:cities(name, states(uf))').single();
    setSaving(false);
    if (error) {
      showAppError({ title: 'Não foi possível enviar a solicitação', description: error.message, variant: 'destructive' });
      return;
    }
    setRequest(data);
    showAppNotice({ title: 'Solicitação enviada', description: 'A equipe da plataforma vai validar os dados institucionais.' });
  };

  if (loading) return <div className="flex min-h-[60vh] items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-brand" /></div>;

  if (user?.is_admin || user?.is_master) return <div className="page-shell-fluid py-12"><div className="mx-auto max-w-xl rounded-3xl border border-edge-subtle bg-surface-raised p-8 text-center shadow-sm"><ShieldCheck className="mx-auto h-10 w-10 text-content-tertiary" /><h1 className="mt-4 text-2xl font-black">Gestão administrativa separada</h1><p className="mt-2 text-sm leading-6 text-content-secondary">Sua conta administra cadastros e usuários das prefeituras, sem acesso ao painel operacional.</p><Button asChild className="mt-5"><Link to="/admin/prefeituras">Gerenciar prefeituras</Link></Button></div></div>;

  return <div className="page-shell-fluid py-10">
    <Helmet><title>Acesso da Prefeitura | Trombone Cidadão</title><meta name="robots" content="noindex" /></Helmet>
    <div className="mx-auto max-w-2xl">
      {membership ? <section className="rounded-3xl border border-emerald-200 bg-emerald-50 p-8 text-center">
        <CheckCircle2 className="mx-auto h-11 w-11 text-emerald-600" />
        <h1 className="mt-4 text-2xl font-black">Seu acesso institucional está ativo</h1>
        <p className="mt-2 text-sm text-emerald-800">{membership.prefeitura?.nome} · {membership.prefeitura?.cidade?.name}{membership.prefeitura?.cidade?.states?.uf ? ` - ${membership.prefeitura.cidade.states.uf}` : ''}</p>
        <Button asChild className="mt-5"><Link to="/prefeitura/broncas">Abrir painel da prefeitura</Link></Button>
      </section> : request?.status === 'pendente' ? <section className="rounded-3xl border border-amber-200 bg-amber-50 p-8 text-center">
        <Clock className="mx-auto h-11 w-11 text-amber-600" />
        <h1 className="mt-4 text-2xl font-black">Cadastro em análise</h1>
        <p className="mt-2 text-sm leading-6 text-amber-900">A solicitação de {request.prefeitura_nome} foi recebida. Você será avisado quando a validação terminar.</p>
      </section> : <section className="rounded-3xl border border-edge-subtle bg-surface-raised p-6 shadow-sm sm:p-8">
        <div className="flex items-start gap-4"><span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-brand text-content-onBrand"><Building2 className="h-6 w-6" /></span><div><h1 className="text-2xl font-black">Solicitar painel da prefeitura</h1><p className="mt-1 text-sm leading-6 text-content-secondary">Este cadastro é destinado a servidores autorizados. A equipe valida a identidade antes de liberar o painel.</p></div></div>
        {request?.status === 'recusada' && <div className="mt-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"><strong>Solicitação anterior não aprovada.</strong>{request.motivo ? ` ${request.motivo}` : ' Revise os dados e envie novamente.'}</div>}
        <form onSubmit={submit} className="mt-7 grid gap-5">
          <div><Label>Cidade</Label><div className="mt-1"><Combobox options={cityOptions} value={form.cityId} onChange={(value) => setForm((current) => ({ ...current, cityId: value }))} placeholder="Selecione a cidade" searchPlaceholder="Buscar cidade..." notFoundText="Cidade não encontrada." /></div></div>
          <div><Label htmlFor="municipality-name">Nome da prefeitura</Label><Input id="municipality-name" value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} placeholder="Prefeitura Municipal de..." maxLength={160} /></div>
          <div className="grid gap-4 sm:grid-cols-2"><div><Label htmlFor="municipality-role">Seu cargo</Label><Input id="municipality-role" value={form.role} onChange={(event) => setForm((current) => ({ ...current, role: event.target.value }))} placeholder="Ex.: Ouvidor municipal" maxLength={120} /></div><div><Label htmlFor="municipality-email">E-mail institucional</Label><Input id="municipality-email" type="email" value={form.email} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} placeholder="nome@prefeitura.gov.br" /></div></div>
          <div><Label htmlFor="municipality-phone">Telefone institucional (opcional)</Label><Input id="municipality-phone" value={form.phone} onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))} /></div>
          <div><Label htmlFor="municipality-message">Observações (opcional)</Label><textarea id="municipality-message" rows={4} maxLength={1000} value={form.message} onChange={(event) => setForm((current) => ({ ...current, message: event.target.value }))} className="mt-1 w-full resize-none rounded-xl border border-input bg-background px-3 py-2 text-sm" placeholder="Informe como podemos confirmar sua vinculação." /></div>
          <div className="flex items-center justify-between gap-4"><p className="flex items-center gap-2 text-xs text-content-tertiary"><ShieldCheck className="h-4 w-4" /> A aprovação não concede permissões administrativas da plataforma.</p><Button type="submit" disabled={saving}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Enviar solicitação</Button></div>
        </form>
      </section>}
    </div>
  </div>;
}

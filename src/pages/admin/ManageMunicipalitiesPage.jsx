import { useCallback, useEffect, useMemo, useState } from 'react';
import { Helmet } from 'react-helmet';
import { Link } from 'react-router-dom';
import { ArrowLeft, Building2, Check, Copy, Loader2, Mail, Power, PowerOff, UserCheck, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Combobox } from '@/components/ui/combobox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useCity } from '@/contexts/CityContext';
import { supabase } from '@/lib/customSupabaseClient';
import { showAppError, showAppNotice } from '@/lib/appError';

const cityName = (city) => city ? `${city.name}${city.states?.uf ? ` - ${city.states.uf}` : ''}` : '—';

export default function ManageMunicipalitiesPage() {
  const { cities } = useCity();
  const [requests, setRequests] = useState([]);
  const [municipalities, setMunicipalities] = useState([]);
  const [invites, setInvites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(null);
  const [form, setForm] = useState({ cityId: '', name: '', email: '' });
  const [generatedLink, setGeneratedLink] = useState('');

  const cityOptions = useMemo(() => (cities || []).map((city) => ({
    value: String(city.id),
    label: `${city.name}${city.state?.uf ? ` - ${city.state.uf}` : ''}`,
  })), [cities]);

  const load = useCallback(async () => {
    setLoading(true);
    const [requestResult, municipalityResult, inviteResult] = await Promise.all([
      supabase.from('prefeitura_solicitacoes')
        .select('id, user_id, prefeitura_nome, cargo, email_institucional, telefone, mensagem, status, motivo, created_at, cidade:cities(name, states(uf)), perfil:profiles!prefeitura_solicitacoes_user_id_fkey(name)')
        .order('created_at', { ascending: false }),
      supabase.from('prefeituras')
        .select('id, city_id, nome, status, created_at, cidade:cities(name, states(uf)), membros:prefeitura_membros(id, papel, ativo, perfil:profiles!prefeitura_membros_user_id_fkey(id, name))')
        .order('created_at', { ascending: false }),
      supabase.from('prefeitura_convites')
        .select('id, email_convidado, status, token, expires_at, created_at, prefeitura:prefeituras(nome, cidade:cities(name, states(uf)))')
        .order('created_at', { ascending: false }).limit(100),
    ]);
    const error = requestResult.error || municipalityResult.error || inviteResult.error;
    if (error) showAppError({ title: 'Não foi possível carregar as prefeituras', description: error.message, variant: 'destructive' });
    setRequests(requestResult.data || []);
    setMunicipalities(municipalityResult.data || []);
    setInvites(inviteResult.data || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const review = async (request, approve) => {
    const reason = approve ? null : window.prompt('Informe o motivo da recusa:');
    if (!approve && reason === null) return;
    setWorking(request.id);
    const { error } = await supabase.rpc('revisar_solicitacao_prefeitura', {
      p_solicitacao: request.id,
      p_aprovar: approve,
      p_motivo: reason || null,
    });
    setWorking(null);
    if (error) {
      showAppError({ title: 'Não foi possível analisar o cadastro', description: error.message, variant: 'destructive' });
      return;
    }
    showAppNotice({ title: approve ? 'Prefeitura aprovada' : 'Solicitação recusada' });
    load();
  };

  const createInvite = async (event) => {
    event.preventDefault();
    if (!form.cityId || !form.name.trim() || !form.email.trim()) return;
    setWorking('invite');
    const { data, error } = await supabase.rpc('criar_convite_administrador_prefeitura', {
      p_city_id: Number(form.cityId),
      p_prefeitura_nome: form.name.trim(),
      p_email: form.email.trim().toLowerCase(),
    });
    setWorking(null);
    if (error) {
      showAppError({ title: 'Não foi possível gerar o convite', description: error.message, variant: 'destructive' });
      return;
    }
    const link = `${window.location.origin}/prefeitura/convite/${data.token}`;
    setGeneratedLink(link);
    setForm({ cityId: '', name: '', email: '' });
    load();
  };

  const copyLink = async (link) => {
    await navigator.clipboard.writeText(link);
    showAppNotice({ title: 'Link copiado' });
  };

  const toggleMunicipality = async (municipality) => {
    setWorking(municipality.id);
    const { error } = await supabase.from('prefeituras').update({
      status: municipality.status === 'ativa' ? 'suspensa' : 'ativa',
      updated_at: new Date().toISOString(),
    }).eq('id', municipality.id);
    setWorking(null);
    if (error) {
      showAppError({ title: 'Não foi possível alterar o cadastro', description: error.message, variant: 'destructive' });
      return;
    }
    load();
  };

  const toggleMember = async (member) => {
    setWorking(member.id);
    const { error } = await supabase.from('prefeitura_membros')
      .update({ ativo: !member.ativo, updated_at: new Date().toISOString() })
      .eq('id', member.id);
    setWorking(null);
    if (error) {
      showAppError({ title: 'Não foi possível alterar o usuário', description: error.message, variant: 'destructive' });
      return;
    }
    load();
  };

  return <div className="page-shell-fluid py-8">
    <Helmet><title>Prefeituras | Administração</title><meta name="robots" content="noindex" /></Helmet>
    <Link to="/admin" className="inline-flex items-center gap-2 text-sm text-content-secondary"><ArrowLeft className="h-4 w-4" /> Voltar ao painel administrativo</Link>
    <header className="mt-5"><p className="text-xs font-extrabold uppercase tracking-[0.16em] text-brand">Cadastros institucionais</p><h1 className="mt-1 text-3xl font-black">Prefeituras e acessos</h1><p className="mt-2 max-w-3xl text-sm text-content-secondary">Aprove solicitações, convide o primeiro administrador municipal e suspenda cadastros. A operação das broncas permanece com cada prefeitura.</p></header>

    <div className="mt-7 grid gap-6 xl:grid-cols-[minmax(360px,0.8fr)_minmax(0,1.2fr)]">
      <section className="self-start rounded-2xl border border-edge-subtle bg-surface-raised p-5 shadow-sm">
        <h2 className="flex items-center gap-2 text-lg font-black"><Mail className="h-5 w-5 text-brand" /> Convidar administrador municipal</h2>
        <form className="mt-5 grid gap-4" onSubmit={createInvite}>
          <div><Label>Cidade</Label><div className="mt-1"><Combobox options={cityOptions} value={form.cityId} onChange={(value) => setForm((current) => ({ ...current, cityId: value }))} placeholder="Selecione a cidade" searchPlaceholder="Buscar cidade..." notFoundText="Cidade não encontrada." /></div></div>
          <div><Label htmlFor="admin-municipality-name">Nome da prefeitura</Label><Input id="admin-municipality-name" value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} placeholder="Prefeitura Municipal de..." /></div>
          <div><Label htmlFor="admin-municipality-email">E-mail do administrador municipal</Label><Input id="admin-municipality-email" type="email" value={form.email} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} placeholder="servidor@prefeitura.gov.br" /></div>
          <Button type="submit" disabled={working === 'invite' || !form.cityId || !form.name.trim() || !form.email.trim()}>{working === 'invite' && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Gerar convite</Button>
        </form>
        {generatedLink && <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3"><p className="break-all text-xs text-emerald-900">{generatedLink}</p><Button type="button" size="sm" variant="outline" className="mt-2" onClick={() => copyLink(generatedLink)}><Copy className="mr-2 h-3.5 w-3.5" /> Copiar link</Button></div>}
      </section>

      <section className="overflow-hidden rounded-2xl border border-edge-subtle bg-surface-raised shadow-sm">
        <div className="border-b border-edge-subtle px-5 py-4"><h2 className="flex items-center gap-2 text-lg font-black"><UserCheck className="h-5 w-5 text-brand" /> Solicitações de cadastro</h2></div>
        <div className="divide-y divide-edge-subtle">{loading ? <p className="p-6 text-sm text-content-tertiary">Carregando...</p> : requests.filter((item) => item.status === 'pendente').length === 0 ? <p className="p-8 text-center text-sm text-content-tertiary">Nenhuma solicitação pendente.</p> : requests.filter((item) => item.status === 'pendente').map((request) => <article key={request.id} className="p-5"><div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div><h3 className="font-black">{request.prefeitura_nome}</h3><p className="mt-1 text-sm text-content-secondary">{cityName(request.cidade)} · {request.perfil?.name || 'Perfil sem nome'} · {request.cargo}</p><p className="mt-1 text-xs text-content-tertiary">{request.email_institucional}{request.telefone ? ` · ${request.telefone}` : ''}</p>{request.mensagem && <p className="mt-3 text-sm leading-6 text-content-secondary">{request.mensagem}</p>}</div><div className="flex shrink-0 gap-2"><Button size="sm" variant="outline" disabled={working === request.id} onClick={() => review(request, false)}><X className="mr-1.5 h-4 w-4" /> Recusar</Button><Button size="sm" disabled={working === request.id} onClick={() => review(request, true)}><Check className="mr-1.5 h-4 w-4" /> Aprovar</Button></div></div></article>)}</div>
      </section>
    </div>

    <section className="mt-6 overflow-hidden rounded-2xl border border-edge-subtle bg-surface-raised shadow-sm">
      <div className="border-b border-edge-subtle px-5 py-4"><h2 className="flex items-center gap-2 text-lg font-black"><Building2 className="h-5 w-5 text-brand" /> Prefeituras cadastradas</h2></div>
      <div className="grid gap-4 p-4 md:grid-cols-2 2xl:grid-cols-3">{municipalities.map((municipality) => <article key={municipality.id} className="rounded-xl border border-edge-subtle p-4"><div className="flex items-start justify-between gap-3"><div><h3 className="font-black">{municipality.nome}</h3><p className="mt-1 text-xs text-content-tertiary">{cityName(municipality.cidade)}</p></div><span className={`rounded-full px-2 py-1 text-[10px] font-black uppercase ${municipality.status === 'ativa' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>{municipality.status}</span></div><div className="mt-4 space-y-2">{(municipality.membros || []).map((member) => <div key={member.id} className="flex items-center justify-between gap-2 rounded-lg bg-surface-subtle px-2.5 py-2"><p className={`min-w-0 truncate text-xs ${member.ativo ? 'text-content-secondary' : 'text-content-tertiary line-through'}`}>{member.perfil?.name || 'Perfil sem nome'} · {member.papel}</p><Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-[10px]" disabled={working === member.id} onClick={() => toggleMember(member)}>{member.ativo ? 'Suspender' : 'Reativar'}</Button></div>)}</div><Button type="button" size="sm" variant="outline" className="mt-4" disabled={working === municipality.id} onClick={() => toggleMunicipality(municipality)}>{municipality.status === 'ativa' ? <PowerOff className="mr-2 h-3.5 w-3.5" /> : <Power className="mr-2 h-3.5 w-3.5" />}{municipality.status === 'ativa' ? 'Suspender cadastro' : 'Reativar cadastro'}</Button></article>)}</div>
    </section>

    {invites.some((invite) => invite.status === 'pendente') && <section className="mt-6 rounded-2xl border border-edge-subtle bg-surface-raised p-5 shadow-sm"><h2 className="font-black">Convites pendentes</h2><div className="mt-3 grid gap-2">{invites.filter((invite) => invite.status === 'pendente').map((invite) => { const link = `${window.location.origin}/prefeitura/convite/${invite.token}`; return <div key={invite.id} className="flex flex-col gap-2 rounded-xl border p-3 sm:flex-row sm:items-center"><div className="min-w-0 flex-1"><p className="truncate text-sm font-bold">{invite.email_convidado}</p><p className="text-xs text-content-tertiary">{invite.prefeitura?.nome} · expira em {new Date(invite.expires_at).toLocaleDateString('pt-BR')}</p></div><Button size="sm" variant="outline" onClick={() => copyLink(link)}><Copy className="mr-2 h-3.5 w-3.5" /> Copiar</Button></div>; })}</div></section>}
  </div>;
}

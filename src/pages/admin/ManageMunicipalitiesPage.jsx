import { useCallback, useEffect, useMemo, useState } from 'react';
import { promptApp } from '@/lib/appConfirm';
import { Helmet } from 'react-helmet';
import { Link } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Building2, Check, ChevronLeft, ChevronRight, Copy, Loader2, Mail, Power, PowerOff, Search, UserCheck, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Combobox } from '@/components/ui/combobox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, FormDialogContent } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useCity } from '@/contexts/CityContext';
import { supabase } from '@/lib/customSupabaseClient';
import { showAppError, showAppNotice } from '@/lib/appError';
import { enabledMunicipalCategories } from '@/lib/municipalCategories';
import { createMunicipalAccount } from '@/lib/municipalAccount';
import MunicipalCredentials from '@/components/municipality/MunicipalCredentials';

const cityName = (city) => city ? `${city.name}${city.states?.uf ? ` - ${city.states.uf}` : ''}` : '—';
const PAGE_SIZE = 8;
const normalize = (value) => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const matches = (query, ...values) => normalize(values.join(' ')).includes(normalize(query.trim()));

function StatusBadge({ active, children }) {
  return <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${active ? 'bg-emerald-100 text-emerald-800' : 'bg-surface-subtle text-content-secondary'}`}><span className={`h-1.5 w-1.5 rounded-full ${active ? 'bg-emerald-600' : 'bg-content-tertiary'}`} />{children}</span>;
}

function Pagination({ count, page, onChange }) {
  const pages = Math.max(1, Math.ceil(count / PAGE_SIZE));
  return <div className="flex flex-wrap items-center justify-between gap-3 border-t border-edge-subtle px-4 py-3 sm:px-6">
    <p className="text-xs text-content-secondary">{count ? `${(page - 1) * PAGE_SIZE + 1}–${Math.min(page * PAGE_SIZE, count)} de ${count}` : '0 registros'}</p>
    {pages > 1 && <nav aria-label="Paginação" className="flex items-center gap-2"><Button size="icon" variant="outline" className="h-8 w-8" aria-label="Página anterior" disabled={page === 1} onClick={() => onChange(page - 1)}><ChevronLeft className="h-4 w-4" /></Button><span className="text-xs text-content-secondary">{page} / {pages}</span><Button size="icon" variant="outline" className="h-8 w-8" aria-label="Próxima página" disabled={page >= pages} onClick={() => onChange(page + 1)}><ChevronRight className="h-4 w-4" /></Button></nav>}
  </div>;
}

function EmptyState({ icon: Icon, title, description }) {
  return <div className="px-5 py-12 text-center"><Icon aria-hidden="true" className="mx-auto h-8 w-8 text-content-tertiary" /><h3 className="mt-3 text-sm font-bold">{title}</h3><p className="mx-auto mt-1 max-w-md text-sm text-content-secondary">{description}</p></div>;
}

export default function ManageMunicipalitiesPage() {
  const { cities } = useCity();
  const [requests, setRequests] = useState([]);
  const [municipalities, setMunicipalities] = useState([]);
  const [categories, setCategories] = useState([]);
  const [invites, setInvites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(null);
  const [form, setForm] = useState({ cityId: '', name: '', email: '' });
  const [credentials, setCredentials] = useState(null);
  const [tab, setTab] = useState('municipalities');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('all');
  const [page, setPage] = useState(1);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [detailTab, setDetailTab] = useState('members');
  const [memberQuery, setMemberQuery] = useState('');
  const [memberPage, setMemberPage] = useState(1);
  const [loadError, setLoadError] = useState('');

  const pendingRequests = requests.filter((item) => item.status === 'pendente');
  const pendingInvites = invites.filter((item) => item.status === 'pendente');
  const selected = municipalities.find((item) => item.id === selectedId);
  const filtered = tab === 'municipalities'
    ? municipalities.filter((item) => (status === 'all' || item.status === status) && matches(query, item.nome, cityName(item.cidade)))
    : tab === 'requests'
      ? pendingRequests.filter((item) => matches(query, item.prefeitura_nome, cityName(item.cidade), item.perfil?.name, item.email_institucional))
      : pendingInvites.filter((item) => matches(query, item.email_convidado, item.prefeitura?.nome, cityName(item.prefeitura?.cidade)));
  const currentPage = Math.min(page, Math.max(1, Math.ceil(filtered.length / PAGE_SIZE)));
  const visible = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const members = (selected?.membros || []).filter((member) => matches(memberQuery, member.perfil?.name, member.papel));
  const currentMemberPage = Math.min(memberPage, Math.max(1, Math.ceil(members.length / PAGE_SIZE)));
  const visibleMembers = members.slice((currentMemberPage - 1) * PAGE_SIZE, currentMemberPage * PAGE_SIZE);

  const openMunicipality = (municipality) => {
    setSelectedId(municipality.id);
    setDetailTab('members');
    setMemberQuery('');
    setMemberPage(1);
  };

  const cityOptions = useMemo(() => (cities || []).map((city) => ({
    value: String(city.id),
    label: `${city.name}${city.state?.uf ? ` - ${city.state.uf}` : ''}`,
  })), [cities]);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    const [requestResult, municipalityResult, inviteResult, categoryResult] = await Promise.all([
      supabase.from('prefeitura_solicitacoes')
        .select('id, user_id, prefeitura_nome, cargo, email_institucional, telefone, mensagem, status, motivo, created_at, cidade:cities(name, states(uf)), perfil:profiles!prefeitura_solicitacoes_user_id_fkey(name)')
        .order('created_at', { ascending: false }),
      supabase.from('prefeituras')
        .select('id, city_id, nome, status, categorias_habilitadas, created_at, cidade:cities(name, states(uf)), membros:prefeitura_membros(id, papel, ativo, perfil:profiles!prefeitura_membros_user_id_fkey(id, name))')
        .order('created_at', { ascending: false }),
      supabase.from('prefeitura_convites')
        .select('id, email_convidado, status, token, expires_at, created_at, prefeitura:prefeituras(nome, cidade:cities(name, states(uf)))')
        .eq('status', 'pendente').order('created_at', { ascending: false }),
      supabase.from('categories').select('id,name').order('name'),
    ]);
    const error = requestResult.error || municipalityResult.error || inviteResult.error || categoryResult.error;
    if (error) {
      setLoadError(error.message);
      showAppError({ title: 'Não foi possível carregar as prefeituras', description: error.message, variant: 'destructive' });
    }
    setRequests(requestResult.data || []);
    setMunicipalities(municipalityResult.data || []);
    setInvites(inviteResult.data || []);
    setCategories(categoryResult.data || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const review = async (request, approve) => {
    const reason = approve ? null : await promptApp({ title: 'Recusar cadastro?', description: 'Informe o motivo da recusa.', required: true, confirmLabel: 'Recusar cadastro' });
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

  const createAccess = async (event) => {
    event.preventDefault();
    if (!form.cityId || !form.name.trim() || !form.email.trim() || working === 'invite' || credentials) return;
    setWorking('invite');
    try {
      const data = await createMunicipalAccount({
        kind: 'administrator', city_id: Number(form.cityId),
        name: form.name.trim(), email: form.email.trim().toLowerCase(),
      });
      setCredentials(data);
      load();
    } catch (error) {
      showAppError({ title: 'Não foi possível criar o acesso', description: error.message, variant: 'destructive' });
    } finally {
      setWorking(null);
    }
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

  const toggleCategory = async (municipality, categoryId) => {
    const current = enabledMunicipalCategories(municipality);
    const next = current.includes(categoryId) ? current.filter((id) => id !== categoryId) : [...current, categoryId];
    setWorking(`${municipality.id}:${categoryId}`);
    const { error } = await supabase.from('prefeituras')
      .update({ categorias_habilitadas: next, updated_at: new Date().toISOString() })
      .eq('id', municipality.id);
    setWorking(null);
    if (error) {
      showAppError({ title: 'Não foi possível alterar as categorias', description: error.message, variant: 'destructive' });
      return;
    }
    setMunicipalities((items) => items.map((item) => item.id === municipality.id ? { ...item, categorias_habilitadas: next } : item));
    showAppNotice({ title: 'Categorias da prefeitura atualizadas' });
  };

  return <div className="page-shell-fluid py-6 sm:py-8">
    <Helmet><title>Prefeituras | Administração</title><meta name="robots" content="noindex" /></Helmet>
    <Link to="/admin" className="inline-flex items-center gap-2 text-sm text-content-secondary hover:text-content-primary"><ArrowLeft className="h-4 w-4" /> Voltar ao painel administrativo</Link>
    <header className="mt-6 flex flex-col justify-between gap-5 sm:flex-row sm:items-center">
      <div className="min-w-0"><p className="text-xs font-extrabold uppercase tracking-[0.16em] text-brand">Cadastros institucionais</p><h1 className="mt-1 text-2xl font-black sm:text-3xl">Prefeituras e acessos</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-content-secondary">Gerencie os cadastros municipais, analise solicitações e acompanhe os convites de acesso.</p></div>
      <Button className="shrink-0 gap-2" onClick={() => { setCredentials(null); setForm({ cityId: '', name: '', email: '' }); setInviteOpen(true); }}><Mail className="h-4 w-4" /> Criar acesso de administrador</Button>
    </header>

    <Tabs value={tab} onValueChange={(value) => { setTab(value); setQuery(''); setStatus('all'); setPage(1); }} className="mt-7">
      <TabsList aria-label="Cadastros institucionais" className="h-auto w-full justify-start gap-1 rounded-none border-0 border-b border-edge-subtle bg-transparent p-0 pb-3 shadow-none sm:w-auto">
        {[['municipalities', 'Prefeituras', municipalities.length], ['requests', 'Solicitações', pendingRequests.length], ['invites', 'Convites', pendingInvites.length]].map(([value, label, count]) => <TabsTrigger key={value} value={value} className="flex-1 gap-1.5 px-2 py-2.5 text-xs sm:flex-none sm:gap-2 sm:px-4 sm:text-sm">{label}<span className="rounded-md bg-current/10 px-1.5 py-0.5 text-[11px] tabular-nums">{loading ? '…' : count}</span></TabsTrigger>)}
      </TabsList>

      <section className="mt-5 overflow-hidden rounded-2xl border border-edge-subtle bg-surface-raised shadow-sm" aria-busy={loading}>
        <div className="flex flex-col justify-between gap-4 border-b border-edge-subtle p-4 sm:flex-row sm:items-center sm:px-6 sm:py-5">
          <div><h2 className="font-black">{tab === 'municipalities' ? 'Prefeituras cadastradas' : tab === 'requests' ? 'Solicitações de cadastro' : 'Convites pendentes'}</h2><p className="mt-1 text-xs leading-5 text-content-secondary">{tab === 'municipalities' ? 'Abra uma prefeitura para gerenciar sua equipe e as categorias atendidas.' : tab === 'requests' ? 'Analise os dados enviados antes de aprovar um novo cadastro municipal.' : 'Acompanhe os convites enviados e copie o link para compartilhar.'}</p></div>
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
            <div className="relative min-w-0 sm:w-64 lg:w-80"><Search aria-hidden="true" className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-content-tertiary" /><Input aria-label={tab === 'municipalities' ? 'Buscar prefeitura ou cidade' : tab === 'requests' ? 'Buscar solicitação' : 'Buscar convite'} placeholder={tab === 'municipalities' ? 'Buscar prefeitura ou cidade...' : tab === 'requests' ? 'Buscar solicitação...' : 'Buscar e-mail ou prefeitura...'} className="h-10 pl-9" value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} /></div>
            {tab === 'municipalities' && <select aria-label="Filtrar situação" className="h-10 rounded-md border border-edge-subtle bg-surface-raised px-3 text-sm" value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}><option value="all">Todas as situações</option><option value="ativa">Ativas</option><option value="suspensa">Suspensas</option></select>}
          </div>
        </div>

        {loadError ? <div role="alert" className="p-6"><p className="font-bold">Não foi possível carregar os cadastros.</p><p className="mt-1 text-sm text-content-secondary">{loadError}</p><Button variant="outline" className="mt-4" onClick={load}>Tentar novamente</Button></div> : loading ? <div role="status" className="flex items-center justify-center gap-2 p-12 text-sm text-content-secondary"><Loader2 className="h-4 w-4 animate-spin" /> Carregando cadastros...</div> : <>
          <TabsContent value="municipalities" className="mt-0">
            {visible.length ? <table className="w-full table-fixed text-left text-sm">
              <caption className="sr-only">Prefeituras cadastradas e situação dos acessos</caption>
              <thead className="border-b border-edge-subtle bg-surface-subtle text-xs text-content-secondary"><tr><th scope="col" className="px-4 py-3 font-medium sm:w-[45%] sm:px-6">Prefeitura / cidade</th><th scope="col" className="hidden px-4 py-3 font-medium md:table-cell">Equipe ativa</th><th scope="col" className="hidden px-4 py-3 font-medium lg:table-cell">Categorias</th><th scope="col" className="hidden px-4 py-3 font-medium sm:table-cell">Situação</th><th scope="col" className="w-32 px-4 py-3 sm:w-36 sm:px-6"><span className="sr-only">Ações</span></th></tr></thead>
              <tbody className="divide-y divide-edge-subtle">{visible.map((municipality) => <tr key={municipality.id} className="transition-colors hover:bg-surface-subtle/60">
                <td className="px-4 py-5 sm:px-6"><div className="flex items-center gap-3"><div className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-edge-subtle bg-surface-subtle sm:flex"><Building2 className="h-5 w-5 text-content-secondary" /></div><div className="min-w-0"><p className="break-words font-bold">{municipality.nome}</p><p className="mt-1 text-xs text-content-secondary">{cityName(municipality.cidade)}</p><div className="mt-2 sm:hidden"><StatusBadge active={municipality.status === 'ativa'}>{municipality.status === 'ativa' ? 'Ativa' : 'Suspensa'}</StatusBadge></div></div></div></td>
                <td className="hidden px-4 py-5 text-content-secondary md:table-cell">{(municipality.membros || []).filter((member) => member.ativo).length} <span className="text-xs">de {(municipality.membros || []).length}</span></td>
                <td className="hidden px-4 py-5 text-content-secondary lg:table-cell">{enabledMunicipalCategories(municipality).length} habilitadas</td>
                <td className="hidden px-4 py-5 sm:table-cell"><StatusBadge active={municipality.status === 'ativa'}>{municipality.status === 'ativa' ? 'Ativa' : 'Suspensa'}</StatusBadge></td>
                <td className="px-4 py-5 text-right sm:px-6"><Button size="sm" variant="outline" className="gap-1.5 px-2 sm:px-3" onClick={() => openMunicipality(municipality)} aria-label={`Gerenciar ${municipality.nome}`}>Gerenciar<ArrowRight className="h-3.5 w-3.5" /></Button></td>
              </tr>)}</tbody>
            </table> : <EmptyState icon={Building2} title={query || status !== 'all' ? 'Nenhuma prefeitura encontrada' : 'Nenhuma prefeitura cadastrada'} description={query || status !== 'all' ? 'Tente outro nome, cidade ou situação.' : 'Convide um administrador municipal ou aprove uma solicitação para começar.'} />}
          </TabsContent>

          <TabsContent value="requests" className="mt-0">
            {visible.length ? <div className="divide-y divide-edge-subtle">{visible.map((request) => <article key={request.id} className="p-4 sm:p-6"><div className="flex flex-col justify-between gap-4 md:flex-row md:items-start"><div className="min-w-0"><h3 className="break-words font-bold">{request.prefeitura_nome}</h3><p className="mt-1 text-sm text-content-secondary">{cityName(request.cidade)} · {request.perfil?.name || 'Perfil sem nome'} · {request.cargo}</p><p className="mt-2 break-words text-xs text-content-secondary">{request.email_institucional}{request.telefone ? ` · ${request.telefone}` : ''}</p>{request.mensagem && <p className="mt-3 max-w-3xl whitespace-pre-wrap break-words text-sm leading-6 text-content-secondary">{request.mensagem}</p>}</div><div className="flex shrink-0 gap-2"><Button size="sm" variant="outline" disabled={Boolean(working) || loading} onClick={() => review(request, false)}><X className="mr-1.5 h-4 w-4" /> Recusar</Button><Button size="sm" disabled={Boolean(working) || loading} onClick={() => review(request, true)}><Check className="mr-1.5 h-4 w-4" /> Aprovar</Button></div></div></article>)}</div> : <EmptyState icon={UserCheck} title={query ? 'Nenhuma solicitação encontrada' : 'Tudo em dia por aqui'} description={query ? 'Tente buscar por outro nome, cidade ou e-mail.' : 'As novas solicitações de cadastro aparecerão aqui para análise.'} />}
          </TabsContent>

          <TabsContent value="invites" className="mt-0">
            {visible.length ? <div className="divide-y divide-edge-subtle">{visible.map((invite) => {
              const expired = new Date(invite.expires_at).getTime() <= Date.now();
              return <article key={invite.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:gap-5 sm:px-6"><div className="min-w-0 flex-1"><h3 className="break-all text-sm font-bold">{invite.email_convidado}</h3><p className="mt-1 break-words text-xs text-content-secondary">{invite.prefeitura?.nome} · {cityName(invite.prefeitura?.cidade)}</p></div><div className="flex flex-wrap items-center justify-between gap-3 sm:justify-end"><div className="text-xs"><span className={expired ? 'font-semibold text-amber-700' : 'text-content-secondary'}>{expired ? 'Expirado em ' : 'Expira em '}{new Date(invite.expires_at).toLocaleDateString('pt-BR')}</span></div><Button size="sm" variant="outline" disabled={expired} onClick={() => copyLink(`${window.location.origin}/prefeitura/convite/${invite.token}`)}><Copy className="mr-2 h-3.5 w-3.5" /> Copiar link</Button></div></article>;
            })}</div> : <EmptyState icon={Mail} title={query ? 'Nenhum convite encontrado' : 'Nenhum convite pendente'} description={query ? 'Tente outro e-mail, nome de prefeitura ou cidade.' : 'Use “Convidar administrador” para enviar um novo convite municipal.'} />}
          </TabsContent>
          <Pagination count={filtered.length} page={currentPage} onChange={setPage} />
        </>}
      </section>
    </Tabs>

    <p className="mt-4 flex items-start gap-2 text-xs leading-5 text-content-tertiary"><Building2 className="mt-0.5 h-3.5 w-3.5 shrink-0" /> A operação das solicitações e dos serviços continua no painel de cada prefeitura.</p>

    <Dialog open={inviteOpen} onOpenChange={(open) => { if (working !== 'invite') { setInviteOpen(open); if (!open) setCredentials(null); } }}>
      <FormDialogContent>
        <DialogHeader><DialogTitle>Criar acesso de administrador municipal</DialogTitle><DialogDescription>Gere uma senha temporária. O usuário completa o cadastro no primeiro acesso e deverá trocar a senha após 24 horas da geração.</DialogDescription></DialogHeader>
        {!credentials && <form className="grid gap-4" onSubmit={createAccess}>
          <fieldset disabled={working === 'invite' || Boolean(credentials)} className="grid min-w-0 gap-4">
          <div><Label id="admin-municipality-city-label">Cidade</Label><div className="mt-1" role="group" aria-labelledby="admin-municipality-city-label"><Combobox options={cityOptions} value={form.cityId} onChange={(value) => setForm((current) => ({ ...current, cityId: value }))} placeholder="Selecione a cidade" searchPlaceholder="Buscar cidade..." notFoundText="Cidade não encontrada." /></div></div>
          <div><Label htmlFor="admin-municipality-name">Nome da prefeitura</Label><Input id="admin-municipality-name" value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} placeholder="Prefeitura Municipal de..." /></div>
          <div><Label htmlFor="admin-municipality-email">E-mail do administrador municipal</Label><Input id="admin-municipality-email" type="email" value={form.email} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} placeholder="servidor@prefeitura.gov.br" /></div>
          <Button type="submit" disabled={working === 'invite' || Boolean(credentials) || !form.cityId || !form.name.trim() || !form.email.trim()}>{working === 'invite' && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Criar acesso e gerar senha</Button>
          </fieldset>
        </form>}
        <MunicipalCredentials credentials={credentials} />
      </FormDialogContent>
    </Dialog>

    <Dialog open={Boolean(selected)} onOpenChange={(open) => { if (!open) setSelectedId(null); }}>
      <DialogContent placement="right" className="max-w-3xl gap-0 overflow-hidden border-edge-subtle bg-surface-raised p-0">
        {selected && <>
          <DialogHeader className="shrink-0 border-b border-edge-subtle px-5 pb-5 pt-8 text-left sm:px-7"><div className="mb-3"><StatusBadge active={selected.status === 'ativa'}>{selected.status === 'ativa' ? 'Ativa' : 'Suspensa'}</StatusBadge></div><DialogTitle className="break-words pr-5 text-xl font-black leading-7">{selected.nome}</DialogTitle><DialogDescription>{cityName(selected.cidade)}</DialogDescription></DialogHeader>
          <Tabs value={detailTab} onValueChange={setDetailTab} className="min-h-0 flex-1 overflow-y-auto">
            <div className="px-5 pt-5 sm:px-7"><TabsList aria-label="Detalhes da prefeitura" className="justify-start"><TabsTrigger value="members" className="flex-1">Equipe ({(selected.membros || []).length})</TabsTrigger><TabsTrigger value="categories" className="flex-1">Categorias ({enabledMunicipalCategories(selected).length})</TabsTrigger></TabsList></div>
            <TabsContent value="members" className="mt-5">
              <div className="px-5 sm:px-7"><h3 className="font-bold">Acessos à prefeitura</h3><p className="mt-1 text-xs leading-5 text-content-secondary">Consulte os vínculos e suspenda ou reative o acesso de cada pessoa.</p><div className="relative mt-4"><Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-content-tertiary" /><Input aria-label="Buscar pessoa ou papel" placeholder="Buscar pessoa ou papel..." className="pl-9" value={memberQuery} onChange={(event) => { setMemberQuery(event.target.value); setMemberPage(1); }} /></div></div>
              <div className="mt-4 divide-y divide-edge-subtle">{visibleMembers.length ? visibleMembers.map((member) => <div key={member.id} className="flex items-center gap-3 px-5 py-4 sm:px-7"><div className="min-w-0 flex-1"><p className="break-words text-sm font-semibold">{member.perfil?.name || 'Perfil sem nome'}</p><p className="mt-1 text-xs text-content-secondary">{member.papel === 'administrador' ? 'Administrador municipal' : 'Colaborador'} · {member.ativo ? 'Acesso ativo' : 'Acesso suspenso'}</p></div><Button type="button" size="sm" variant="outline" disabled={Boolean(working) || loading} onClick={() => toggleMember(member)}>{working === member.id && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}{member.ativo ? 'Suspender' : 'Reativar'}</Button></div>) : <EmptyState icon={UserCheck} title={memberQuery ? 'Nenhuma pessoa encontrada' : 'Nenhum vínculo cadastrado'} description={memberQuery ? 'Tente outro nome ou papel.' : 'Os acessos aceitos aparecerão nesta lista.'} />}</div>
              <Pagination count={members.length} page={currentMemberPage} onChange={setMemberPage} />
            </TabsContent>
            <TabsContent value="categories" className="px-5 pb-6 pt-4 sm:px-7"><h3 className="font-bold">Categorias atendidas</h3><p className="mt-1 text-xs leading-5 text-content-secondary">Cada prefeitura começa atendendo somente iluminação. As alterações ficam disponíveis no painel municipal após atualizar a página.</p><div className="mt-5 grid gap-3 sm:grid-cols-2">{categories.map((category) => <label key={category.id} className="flex min-w-0 cursor-pointer items-center gap-3 rounded-xl border border-edge-subtle p-4 text-sm hover:bg-surface-subtle"><input type="checkbox" className="h-4 w-4 shrink-0 accent-brand" checked={enabledMunicipalCategories(selected).includes(category.id)} disabled={Boolean(working) || loading} onChange={() => toggleCategory(selected, category.id)} /><span className="break-words">{category.name}</span></label>)}</div></TabsContent>
          </Tabs>
          <div className="shrink-0 border-t border-edge-subtle bg-surface-subtle p-5 sm:px-7"><h3 className="text-sm font-bold">Situação do cadastro</h3><p className="mb-3 mt-1 text-xs leading-5 text-content-secondary">{selected.status === 'ativa' ? 'A suspensão bloqueia os acessos municipais desta prefeitura.' : 'Reative o cadastro para restabelecer os acessos municipais.'}</p><Button type="button" size="sm" variant="outline" disabled={Boolean(working) || loading} onClick={() => toggleMunicipality(selected)}>{working === selected.id ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : selected.status === 'ativa' ? <PowerOff className="mr-2 h-3.5 w-3.5" /> : <Power className="mr-2 h-3.5 w-3.5" />}{selected.status === 'ativa' ? 'Suspender cadastro' : 'Reativar cadastro'}</Button></div>
        </>}
      </DialogContent>
    </Dialog>
  </div>;
}

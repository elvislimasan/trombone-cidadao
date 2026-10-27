import MunicipalStaffResponsibilities from '@/components/municipality/MunicipalStaffResponsibilities';
import MunicipalCredentials from '@/components/municipality/MunicipalCredentials';
import { createMunicipalAccount } from '@/lib/municipalAccount';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Helmet } from 'react-helmet';
import { Link, useOutletContext } from 'react-router-dom';
import {
  Building2,
  CalendarDays,
  Copy,
  Loader2,
  Mail,
  Phone,
  ShieldCheck,
  UserPlus,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { supabase } from '@/lib/customSupabaseClient';
import { showAppError, showAppNotice } from '@/lib/appError';
import MunicipalDrawer from '@/components/municipality/MunicipalDrawer';
import MunicipalTable from '@/components/municipality/MunicipalTable';
import { MunicipalPageHeader } from '@/components/municipality/MunicipalPageUi';
import { loadMunicipalRows } from '@/lib/municipalTable';
import { MUNICIPAL_STAFF_ROLES } from '@/lib/municipalAccess';
import { notifyPermissionsChanged } from '@/lib/permissionUpdates';

const EMPTY_ACCESS = { cargos: [] };
const accessLabel = access => (access?.cargos || []).map(id => MUNICIPAL_STAFF_ROLES.find(role => role.id === id)?.label || id).join(' · ') || 'Sem cargo configurado';
const memberDate = (value) => value ? new Date(value).toLocaleDateString('pt-BR') : 'Não informada';

export default function MunicipalityTeamPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const workspace = useOutletContext();
  const municipality = workspace?.municipality;
  const isAdministrator = Boolean(workspace?.isAdministrator && !user?.is_admin && !user?.is_master);
  const scopeId = municipality?.id;
  const scopeKey = `${user?.id}:${scopeId}`;
  const scope = useRef(scopeKey);
  scope.current = scopeKey;
  const loadVersion = useRef(0);
  const [channels, setChannels] = useState([]);
  const [members, setMembers] = useState([]);
  const [publicOfficials, setPublicOfficials] = useState([]);
  const [emailLookupFailed, setEmailLookupFailed] = useState(false);
  const [invites, setInvites] = useState([]);
  const [channelId, setChannelId] = useState('all');
  const [inviteChannelId, setInviteChannelId] = useState('');
  const [inviteOpen, setInviteOpen] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [assignUserId, setAssignUserId] = useState('');
  const [assignChannelId, setAssignChannelId] = useState('');
  const [assignAccess, setAssignAccess] = useState(EMPTY_ACCESS);
  const [assignError, setAssignError] = useState('');
  const [selected, setSelected] = useState(null);
  const [editAccess, setEditAccess] = useState(EMPTY_ACCESS);
  const [editActive, setEditActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [statusFilter, setStatusFilter] = useState('all');
  const [roleFilter, setRoleFilter] = useState('all');
  const [email, setEmail] = useState('');
  const [inviteAccess, setInviteAccess] = useState(EMPTY_ACCESS);
  const [working, setWorking] = useState(false);
  const [credentials, setCredentials] = useState(null);
  const [inviteError, setInviteError] = useState('');

  const load = useCallback(async ({ quiet = false } = {}) => {
    if (!user?.id) return;
    if (!quiet) setLoading(true);
    setLoadError('');

    const version = ++loadVersion.current;
    const stillCurrent = () => version === loadVersion.current && scope.current === scopeKey;
    if (!isAdministrator || !municipality?.city_id) {
      setChannels([]); setMembers([]); setInvites([]); setPublicOfficials([]); setLoading(false);
      return;
    }
    const cityChannelIds = (workspace.channels || []).map(channel => channel.id);

    const [channelResult, memberResult, inviteResult, emailResult, accessResult, officialsResult] = await Promise.all([
      supabase
        .from('orgao_canais')
        .select('id, nome, city_id, ativo, municipal_modules, execution_specialties, categorias:orgao_categorias(category_id), cidade:cities(name, states(uf))')
        .eq('city_id', municipality.city_id)
        .eq('canal_triagem', false)
        .order('nome'),
      cityChannelIds.length ? loadMunicipalRows(() => supabase
        .from('orgao_membros')
        .select('id, canal_id, user_id, papel, ativo, created_at, perfil:profiles!orgao_membros_user_id_fkey(id, name, phone)')
        .in('canal_id', cityChannelIds)
        .order('created_at').order('id')) : Promise.resolve({ data: [], error: null }),
      supabase
        .from('prefeitura_convites')
        .select('id, canal_id, email_convidado, papel_orgao, token, status, expires_at, created_at, asset_modules, staff_access')
        .eq('prefeitura_id', scopeId)
        .eq('status', 'pendente')
        .order('created_at', { ascending: false }),
      loadMunicipalRows(() => supabase.rpc('listar_emails_equipe_prefeitura').order('membro_id')),
      supabase.rpc('municipal_team_access', { p_prefeitura: scopeId }),
      supabase.rpc('municipal_public_official_candidates', { p_prefeitura: scopeId }),
    ]);

    if (!stillCurrent()) return;
    const firstError = channelResult.error || memberResult.error || inviteResult.error || accessResult.error || officialsResult.error;
    if (firstError) {
      showAppError({ title: 'Não foi possível carregar a equipe', description: firstError.message, variant: 'destructive' });
      if (quiet) { setLoading(false); return; }
      setLoadError(firstError.message);
      setChannels([]); setMembers([]); setInvites([]); setPublicOfficials([]); setLoading(false);
      return;
    }

    const nextChannels = channelResult.data || [];
    setChannels(nextChannels);
    const memberAccess = new Map((accessResult.data || []).map(item => [item.membro_id, item]));
    const memberEmails = new Map((emailResult.data || []).map((item) => [item.membro_id, item.email]));
    setEmailLookupFailed(Boolean(emailResult.error));
    setMembers((memberResult.data || []).map((member) => ({ ...member, access: memberAccess.get(member.id)?.access || { ...EMPTY_ACCESS, versao: 0 }, asset_modules: memberAccess.get(member.id)?.asset_modules || [], email: memberEmails.get(member.id) || null })));
    setInvites(inviteResult.data || []);
    setPublicOfficials(officialsResult.data || []);
    setChannelId((current) => current === 'all' || nextChannels.some((channel) => channel.id === current) ? current : 'all');
    setInviteChannelId((current) => nextChannels.some((channel) => channel.id === current) ? current : '');
    setLoading(false);
  }, [user?.id, isAdministrator, municipality?.city_id, scopeId, scopeKey, workspace?.channels]);

  useEffect(() => { load(); return () => { loadVersion.current += 1; }; }, [load]);
  useEffect(() => {
    setInviteOpen(false); setAssignOpen(false); setSelected(null); setCredentials(null); setEmail('');
    setInviteChannelId(''); setInviteAccess(EMPTY_ACCESS); setInviteError(''); setChannelId('all');
    setAssignUserId(''); setAssignChannelId(''); setAssignAccess(EMPTY_ACCESS); setAssignError('');
    setWorking(false); setSaving(false);
  }, [scopeKey]);

  const channelName = (id) => channels.find((channel) => String(channel.id) === String(id))?.nome || 'Secretaria não informada';
  const channelMembers = useMemo(
    () => members.filter((member) => channelId === 'all' || String(member.canal_id) === String(channelId)),
    [members, channelId]
  );
  const pendingInvites = useMemo(
    () => invites.filter((invite) => !inviteChannelId || String(invite.canal_id) === String(inviteChannelId)),
    [invites, inviteChannelId]
  );
  const selectedInviteChannel = channels.find(channel => String(channel.id) === String(inviteChannelId));
  const inviteRoles = selectedInviteChannel && !(selectedInviteChannel.categorias || []).length
    ? MUNICIPAL_STAFF_ROLES.filter(role => role.id === 'inventario')
    : MUNICIPAL_STAFF_ROLES;
  const selectedAssignChannel = channels.find(channel => String(channel.id) === String(assignChannelId));
  const assignRoles = selectedAssignChannel && !(selectedAssignChannel.categorias || []).length
    ? MUNICIPAL_STAFF_ROLES.filter(role => role.id === 'inventario')
    : MUNICIPAL_STAFF_ROLES;
  const assignedToSelectedChannel = new Set(members.filter(member => String(member.canal_id) === String(assignChannelId)).map(member => String(member.user_id)));
  const assignableOfficials = publicOfficials.filter(candidate => !assignedToSelectedChannel.has(String(candidate.user_id)));

  const createAccess = async (event) => {
    event.preventDefault();
    if (!inviteChannelId || !email.trim() || !inviteAccess.cargos.length || working || credentials) return;
    setWorking(true); setInviteError(''); setCredentials(null);
    const invitedScope = scopeKey;
    try {
      const data = await createMunicipalAccount({
        kind: 'staff', prefeitura_id: scopeId, channel_id: inviteChannelId,
        email: email.trim().toLowerCase(), roles: inviteAccess.cargos,
      });
      if (scope.current !== invitedScope) return;
      setCredentials(data);
      await load({ quiet: true });
    } catch (failure) {
      if (scope.current !== invitedScope) return;
      setInviteError(failure.message || 'Não foi possível criar o acesso. Confira sua conexão e tente novamente.');
    } finally { if (scope.current === invitedScope) setWorking(false); }
  };

  const assignExistingOfficial = async (event) => {
    event.preventDefault();
    if (!assignUserId || !assignChannelId || !assignAccess.cargos.length || working) return;
    setWorking(true); setAssignError('');
    const assignedScope = scopeKey;
    try {
      const { error } = await supabase.rpc('municipal_assign_existing_public_official', {
        p_prefeitura: scopeId, p_canal: assignChannelId, p_user: assignUserId, p_cargos: assignAccess.cargos,
      });
      if (scope.current !== assignedScope) return;
      if (error) throw error;
      notifyPermissionsChanged(assignUserId);
      await load({ quiet: true });
      setAssignOpen(false); setAssignUserId(''); setAssignChannelId(''); setAssignAccess(EMPTY_ACCESS);
      showAppNotice({ title: 'Funcionário vinculado', description: 'A secretaria e os cargos foram atribuídos à conta existente.' });
    } catch (error) {
      if (scope.current !== assignedScope) return;
      setAssignError(error.message || 'Não foi possível vincular este funcionário.');
    } finally { if (scope.current === assignedScope) setWorking(false); }
  };

  const openMember = (member) => { setSelected(member); setEditAccess(member.access || EMPTY_ACCESS); setEditActive(member.ativo); };
  const updateMember = async () => {
    if (!selected || saving) return;
    const savedScope = scopeKey;
    setSaving(true);
    try {
      const { error } = await supabase.rpc('set_municipal_staff_roles', {
        p_member_id: selected.id, p_cargos: editAccess.cargos, p_active: editActive, p_version: selected.access?.versao ?? 0,
      });
      if (error) throw error;
      if (scope.current !== savedScope) return;
      notifyPermissionsChanged(selected.user_id);
      await load({ quiet: true });
      setSelected(null);
      showAppNotice({ title: 'Acesso atualizado' });
    } catch (error) {
      if (scope.current !== savedScope) return;
      showAppError({ title: 'Não foi possível atualizar o funcionário', description: error.message, variant: 'destructive' });
    } finally { if (scope.current === savedScope) setSaving(false); }
  };

  const copy = async (value) => {
    await navigator.clipboard.writeText(value);
    showAppNotice({ title: 'Link copiado' });
  };

  if (loading) {
    return <div className="flex min-h-[70vh] items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-brand" /></div>;
  }

  if (loadError) return <div className="page-shell-fluid space-y-4 py-8"><h1 className="text-2xl font-black">Equipe e acessos</h1><p role="alert">Não foi possível carregar a equipe: {loadError}</p><Button onClick={() => load()}>Tentar novamente</Button></div>;

  if (!isAdministrator) {
    return (
      <div className="page-shell-fluid py-12">
        <div className="mx-auto max-w-xl rounded-3xl border border-edge-subtle bg-surface-raised p-8 text-center shadow-sm">
          <ShieldCheck className="mx-auto h-10 w-10 text-content-tertiary" />
          <h1 className="mt-4 text-2xl font-black">Área do administrador municipal</h1>
          <p className="mt-2 text-sm leading-6 text-content-secondary">Somente o administrador aprovado da prefeitura pode cadastrar funcionários e definir seus acessos.</p>
          <Button asChild className="mt-5"><Link to="/prefeitura/broncas">Voltar às solicitações</Link></Button>
        </div>
      </div>
    );
  }

  return (
    <>
      <Helmet><title>Equipe | Painel da Prefeitura</title><meta name="robots" content="noindex" /></Helmet>
      <div className="page-shell-fluid py-6 sm:py-8">
        <MunicipalPageHeader eyebrow="Administração municipal" title="Equipe e acessos" description="Vincule contas Órgão Público existentes ou crie acessos com senha temporária e atribua as secretarias e os cargos." action={channels.length > 0 && <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row"><Button type="button" variant="outline" className="w-full sm:w-auto" onClick={() => { setAssignError(''); setAssignOpen(true); }}><UserPlus className="mr-2 h-4 w-4" />Vincular conta existente</Button><Button className="w-full sm:w-auto" onClick={() => { setInviteAccess(EMPTY_ACCESS); setInviteError(''); setCredentials(null); setEmail(''); setInviteOpen(true); }}><UserPlus className="mr-2 h-4 w-4" />Criar acesso de funcionário</Button></div>} />

        {channels.length === 0 ? (
          <section className="mt-6 rounded-2xl border border-dashed border-edge-strong bg-surface-raised p-10 text-center">
            <Building2 className="mx-auto h-10 w-10 text-content-tertiary" />
            <h2 className="mt-3 text-lg font-black">Cadastre primeiro uma secretaria</h2>
            <p className="mt-1 text-sm text-content-secondary">A equipe é vinculada a uma secretaria para receber apenas as solicitações sob sua responsabilidade.</p>
            <Button asChild className="mt-5"><Link to="/prefeitura/secretarias">Cadastrar secretaria</Link></Button>
          </section>
        ) : (
          <div className="mt-6 min-w-0 space-y-4">
            <MunicipalDrawer open={assignOpen} onClose={() => !working && setAssignOpen(false)} busy={working} title="Vincular conta existente" description={`Contas Órgão Público de ${municipality?.cidade?.name || municipality?.nome} que ainda não estão nesta secretaria.`}>
              <section className="self-start rounded-2xl border border-edge-subtle bg-surface-raised p-5 shadow-sm">
                <form onSubmit={assignExistingOfficial} className="grid gap-4">
                  <div><Label htmlFor="assign-channel">Secretaria</Label><select id="assign-channel" required disabled={working} value={assignChannelId} onChange={event => {
                    const nextId = event.target.value;
                    const nextChannel = channels.find(channel => String(channel.id) === String(nextId));
                    setAssignChannelId(nextId); setAssignUserId(''); setAssignError('');
                    setAssignAccess(nextChannel && !(nextChannel.categorias || []).length ? { cargos: ['inventario'] } : EMPTY_ACCESS);
                  }} className="mt-1 h-10 w-full rounded-md border border-edge-strong bg-surface-raised px-3 text-sm"><option value="">Selecione a secretaria</option>{channels.filter(channel => channel.ativo).map(channel => <option key={channel.id} value={channel.id}>{channel.nome}</option>)}</select></div>
                  <div><Label htmlFor="assign-user">Funcionário Órgão Público</Label><select id="assign-user" required disabled={working || !assignChannelId} value={assignUserId} onChange={event => setAssignUserId(event.target.value)} className="mt-1 h-10 w-full rounded-md border border-edge-strong bg-surface-raised px-3 text-sm"><option value="">Selecione um funcionário</option>{assignableOfficials.map(candidate => <option key={candidate.user_id} value={candidate.user_id}>{candidate.name || 'Perfil sem nome'}{candidate.phone ? ` · ${candidate.phone}` : ''}</option>)}</select>
                    {assignChannelId && assignableOfficials.length === 0 && <p className="mt-1 text-xs text-content-secondary">Não há contas Órgão Público disponíveis para esta secretaria. Crie um acesso com senha temporária para novos servidores.</p>}
                  </div>
                  <MunicipalStaffResponsibilities value={assignAccess} onChange={setAssignAccess} disabled={working} roles={assignRoles} />
                  {assignError && <p role="alert" className="rounded-xl border border-danger/25 bg-danger-subtleBg p-3 text-sm text-danger-subtleFg">{assignError}</p>}
                  <Button type="submit" disabled={working || !assignChannelId || !assignUserId || !assignAccess.cargos.length}>{working && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Vincular à secretaria</Button>
                </form>
              </section>
            </MunicipalDrawer>

            <MunicipalDrawer open={inviteOpen} onClose={() => { if (!working) { setInviteOpen(false); setCredentials(null); } }} busy={working} title="Criar acesso de funcionário" description={`Município: ${municipality?.cidade?.name || municipality?.nome}.`}>
            <section className="self-start rounded-2xl border border-edge-subtle bg-surface-raised p-5 shadow-sm">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-subtleBg text-brand"><Mail className="h-5 w-5" /></div>
                <div>
                  <h2 className="font-black">Acesso com senha temporária</h2>
                  <p className="mt-1 text-xs leading-5 text-content-tertiary">Selecione a secretaria à qual o funcionário será vinculado.</p>
                </div>
              </div>

              {!credentials && <form onSubmit={createAccess} className="mt-5 grid gap-4">
                <div className="rounded-xl bg-surface-subtle p-3 text-sm"><p className="font-semibold">{municipality?.cidade?.name || municipality?.nome}{municipality?.cidade?.states?.uf ? ` · ${municipality.cidade.states.uf}` : ''}</p><p className="mt-1 text-xs text-content-secondary">Conta Órgão Público vinculada à prefeitura ativa. Cadastro pessoal no primeiro acesso e troca obrigatória da senha após 24 horas da geração.</p></div>
                <div><Label htmlFor="invite-channel">Secretaria do funcionário</Label><select id="invite-channel" required disabled={working || Boolean(credentials)} value={inviteChannelId} onChange={(event) => { const nextId = event.target.value; const nextChannel = channels.find(channel => String(channel.id) === String(nextId)); setInviteChannelId(nextId); setInviteAccess(nextChannel && !(nextChannel.categorias || []).length ? { cargos: ['inventario'] } : EMPTY_ACCESS); }} className="mt-1 h-10 w-full min-w-0 rounded-md border border-edge-strong bg-surface-raised px-3 text-sm"><option value="">Selecione a secretaria</option>{channels.filter(channel => channel.ativo).map((channel) => <option key={channel.id} value={channel.id}>{channel.nome}</option>)}</select></div>
                <div><Label htmlFor="team-email">E-mail institucional</Label><Input id="team-email" type="email" required disabled={working || Boolean(credentials)} value={email} onChange={(event) => setEmail(event.target.value)} placeholder="servidor@prefeitura.gov.br" /></div>
                <MunicipalStaffResponsibilities value={inviteAccess} onChange={setInviteAccess} disabled={working || Boolean(credentials)} roles={inviteRoles} />

                {inviteError && <p role="alert" className="rounded-xl border border-danger/25 bg-danger-subtleBg p-3 text-sm text-danger-subtleFg">{inviteError}</p>}
                <Button type="submit" disabled={working || Boolean(credentials) || !inviteChannelId || !email.trim() || !inviteAccess.cargos.length}>{working && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Criar acesso e gerar senha</Button>
              </form>}

              <MunicipalCredentials credentials={credentials} />

              {pendingInvites.length > 0 && (
                <div className="mt-6 border-t border-edge-subtle pt-5">
                  <h3 className="text-sm font-black">Convites pendentes</h3>
                  <div className="mt-3 grid gap-2">
                    {pendingInvites.map((invite) => {
                      const link = `${window.location.origin}/prefeitura/convite/${invite.token}`;
                      return <div key={invite.id} className="rounded-xl border border-edge-subtle p-3"><p className="truncate text-xs font-bold">{invite.email_convidado}</p><p className="mt-1 text-[11px] text-content-tertiary">{channelName(invite.canal_id)} · {accessLabel(invite.staff_access)} · expira em {new Date(invite.expires_at).toLocaleDateString('pt-BR')}</p><Button type="button" variant="ghost" size="sm" className="mt-1 -ml-2 h-8" onClick={() => copy(link)}><Copy className="mr-2 h-3.5 w-3.5" /> Copiar</Button></div>;
                    })}
                  </div>
                </div>
              )}
            </section>
            </MunicipalDrawer>

            {emailLookupFailed && <p role="status" className="rounded-xl border border-edge-subtle p-3 text-xs text-content-secondary">Não foi possível consultar os e-mails da equipe.</p>}
            <MunicipalTable title="Equipe municipal" rows={channelMembers.filter((member) => (statusFilter === 'all' || member.ativo === (statusFilter === 'active')) && (roleFilter === 'all' || member.access?.cargos?.includes(roleFilter)))}
              filterKey={channelId + statusFilter + roleFilter} onOpen={openMember}
              searchPlaceholder="Nome, e-mail, telefone ou secretaria"
              searchText={(member) => [member.perfil?.name, member.email, member.perfil?.phone, channelName(member.canal_id)].join(' ')}
              filters={<>
                <label className="min-w-0 text-xs font-semibold text-content-secondary">Secretaria<select id="team-channel" value={channelId} onChange={(event) => setChannelId(event.target.value)} className="mt-1 block h-10 w-full max-w-xs rounded-md border border-edge-subtle bg-surface-raised px-3"><option value="all">Todas as secretarias</option>{channels.map((channel) => <option key={channel.id} value={channel.id}>{channel.nome}</option>)}</select></label>
                <label className="text-xs font-semibold text-content-secondary">Situação<select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="mt-1 block h-10 rounded-md border border-edge-subtle bg-surface-raised px-3"><option value="all">Todas</option><option value="active">Ativos</option><option value="inactive">Suspensos</option></select></label>
                <label className="text-xs font-semibold text-content-secondary">Nível de acesso<select value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)} className="mt-1 block h-10 rounded-md border border-edge-subtle bg-surface-raised px-3"><option value="all">Todos</option>{MUNICIPAL_STAFF_ROLES.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
              </>}
              columns={[
                { key: 'nome', label: 'Nome', width: '18%', value: (member) => member.perfil?.name || 'Servidor municipal', render: (member) => <span className="font-bold text-content-primary">{member.perfil?.name || 'Servidor municipal'}</span> },
                { key: 'email', label: 'E-mail', width: '21%', value: (member) => member.email, render: (member) => <span className="break-all">{member.email || 'Não informado'}</span> },
                { key: 'secretaria', label: 'Secretaria', width: '18%', value: (member) => channelName(member.canal_id) },
                { key: 'role', label: 'Acesso', value: (member) => accessLabel(member.access) },
                { key: 'status', label: 'Situação', value: (member) => member.ativo ? 'Ativo' : 'Suspenso', render: (member) => <span className={`rounded-full px-2 py-1 text-xs font-semibold ${member.ativo ? 'bg-success-bg text-success-fg' : 'bg-surface-subtle text-content-secondary'}`}>{member.ativo ? 'Ativo' : 'Suspenso'}</span> },
                { key: 'date', label: 'Na plataforma desde', value: (member) => member.created_at || '', render: (member) => memberDate(member.created_at) },
              ]} />
            <MunicipalDrawer open={Boolean(selected)} onClose={() => setSelected(null)} busy={saving} title={selected?.perfil?.name || 'Funcionário'} description={channelName(selected?.canal_id)}
              footer={<div className="flex justify-end gap-2"><Button variant="outline" disabled={saving} onClick={() => setSelected(null)}>Cancelar</Button><Button onClick={updateMember} disabled={saving || !editAccess.cargos?.length || (JSON.stringify(editAccess) === JSON.stringify(selected?.access) && editActive === selected?.ativo)}>{saving ? 'Salvando…' : 'Salvar alterações'}</Button></div>}>
              {selected && <div className="space-y-6">
                <dl className="space-y-4 text-sm">
                  <div><dt className="flex items-center gap-2 text-xs text-content-tertiary"><Mail className="h-4 w-4" />E-mail da conta</dt><dd className="mt-1 break-all">{selected.email ? <a href={`mailto:${selected.email}`} className="text-brand underline">{selected.email}</a> : 'Não informado'}</dd></div>
                  <div><dt className="flex items-center gap-2 text-xs text-content-tertiary"><Phone className="h-4 w-4" />Telefone</dt><dd className="mt-1">{selected.perfil?.phone ? <a href={`tel:${selected.perfil.phone.replace(/[^\d+]/g, '')}`}>{selected.perfil.phone}</a> : 'Não informado'}</dd></div>
                  <div><dt className="flex items-center gap-2 text-xs text-content-tertiary"><CalendarDays className="h-4 w-4" />Na plataforma desde</dt><dd className="mt-1">{memberDate(selected.created_at)}</dd></div>
                </dl>
                <p className="text-xs leading-5 text-content-secondary">Os dados pessoais são mantidos pelo próprio usuário no perfil. Aqui você gerencia o acesso à secretaria.</p>
                <MunicipalStaffResponsibilities value={editAccess} onChange={setEditAccess} disabled={saving} />

                <div><Label htmlFor="edit-member-status">Situação do acesso</Label><select id="edit-member-status" value={String(editActive)} disabled={saving} onChange={(event) => setEditActive(event.target.value === 'true')} className="mt-2 h-10 w-full rounded-md border border-edge-subtle bg-surface-raised px-3"><option value="true">Ativo</option><option value="false">Suspenso</option></select><p className="mt-2 text-xs text-content-secondary">Suspender remove o acesso a esta secretaria; o cadastro e o histórico permanecem.</p></div>
              </div>}
            </MunicipalDrawer>
          </div>
        )}
      </div>
    </>
  );
}

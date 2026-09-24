import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Helmet } from 'react-helmet';
import { Link } from 'react-router-dom';
import {
  Building2,
  CalendarDays,
  Copy,
  Loader2,
  Mail,
  Phone,
  ShieldCheck,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { supabase } from '@/lib/customSupabaseClient';
import { showAppError, showAppNotice } from '@/lib/appError';
import MunicipalDrawer from '@/components/municipality/MunicipalDrawer';
import MunicipalTable from '@/components/municipality/MunicipalTable';
import { loadMunicipalRows } from '@/lib/municipalTable';
import { AGENCY_MEMBER_ROLES } from '@/lib/agencyPanel';

const roleLabel = (role) => AGENCY_MEMBER_ROLES.find((item) => item.id === role)?.label || role;
const memberDate = (value) => value ? new Date(value).toLocaleDateString('pt-BR') : 'Não informada';

export default function MunicipalityTeamPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [isAdministrator, setIsAdministrator] = useState(false);
  const [channels, setChannels] = useState([]);
  const [members, setMembers] = useState([]);
  const [emailLookupFailed, setEmailLookupFailed] = useState(false);
  const [invites, setInvites] = useState([]);
  const [channelId, setChannelId] = useState('all');
  const [inviteChannelId, setInviteChannelId] = useState('');
  const [inviteOpen, setInviteOpen] = useState(false);
  const [selected, setSelected] = useState(null);
  const [editRole, setEditRole] = useState('operador');
  const [editActive, setEditActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [statusFilter, setStatusFilter] = useState('all');
  const [roleFilter, setRoleFilter] = useState('all');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('operador');
  const [working, setWorking] = useState(false);
  const [inviteLink, setInviteLink] = useState('');

  const load = useCallback(async ({ quiet = false } = {}) => {
    if (!user?.id) return;
    if (!quiet) setLoading(true);

    const { data: scope, error: scopeError } = await supabase
      .from('prefeitura_membros')
      .select('prefeitura:prefeituras!prefeitura_membros_prefeitura_id_fkey(city_id, status)')
      .eq('user_id', user.id)
      .eq('papel', 'administrador')
      .eq('ativo', true);

    if (scopeError) {
      showAppError({ title: 'Não foi possível verificar seu acesso', description: scopeError.message, variant: 'destructive' });
      setLoading(false);
      return;
    }

    const cityIds = (scope || [])
      .filter((item) => item.prefeitura?.status === 'ativa')
      .map((item) => item.prefeitura?.city_id)
      .filter(Boolean);
    const allowed = !user?.is_admin && !user?.is_master && cityIds.length > 0;
    setIsAdministrator(allowed);
    if (!allowed) {
      setChannels([]);
      setMembers([]);
      setInvites([]);
      setLoading(false);
      return;
    }

    const [channelResult, memberResult, inviteResult, emailResult] = await Promise.all([
      supabase
        .from('orgao_canais')
        .select('id, nome, city_id, ativo, cidade:cities(name, states(uf))')
        .in('city_id', cityIds)
        .order('nome'),
      loadMunicipalRows(() => supabase
        .from('orgao_membros')
        .select('id, canal_id, user_id, papel, ativo, created_at, perfil:profiles!orgao_membros_user_id_fkey(id, name, phone)')
        .order('created_at').order('id')),
      supabase
        .from('prefeitura_convites')
        .select('id, canal_id, email_convidado, papel_orgao, token, status, expires_at, created_at')
        .eq('status', 'pendente')
        .order('created_at', { ascending: false }),
      loadMunicipalRows(() => supabase.rpc('listar_emails_equipe_prefeitura').order('membro_id')),
    ]);

    const firstError = channelResult.error || memberResult.error || inviteResult.error;
    if (firstError) {
      showAppError({ title: 'Não foi possível carregar a equipe', description: firstError.message, variant: 'destructive' });
    }

    const nextChannels = channelResult.data || [];
    setChannels(nextChannels);
    const memberEmails = new Map((emailResult.data || []).map((item) => [item.membro_id, item.email]));
    setEmailLookupFailed(Boolean(emailResult.error));
    setMembers((memberResult.data || []).map((member) => ({ ...member, email: memberEmails.get(member.id) || null })));
    setInvites(inviteResult.data || []);
    setChannelId((current) => current === 'all' || nextChannels.some((channel) => channel.id === current) ? current : 'all');
    setInviteChannelId((current) => nextChannels.some((channel) => channel.id === current) ? current : '');
    setLoading(false);
  }, [user?.id, user?.is_admin, user?.is_master]);

  useEffect(() => { load(); }, [load]);

  const selectedChannel = channels.find((channel) => channel.id === inviteChannelId) || null;
  const channelName = (id) => channels.find((channel) => String(channel.id) === String(id))?.nome || 'Secretaria não informada';
  const channelMembers = useMemo(
    () => members.filter((member) => channelId === 'all' || String(member.canal_id) === String(channelId)),
    [members, channelId]
  );
  const pendingInvites = useMemo(
    () => invites.filter((invite) => !inviteChannelId || String(invite.canal_id) === String(inviteChannelId)),
    [invites, inviteChannelId]
  );

  const createInvite = async (event) => {
    event.preventDefault();
    if (!inviteChannelId || !email.trim() || working) return;
    setWorking(true);
    const { data, error } = await supabase.rpc('criar_convite_funcionario_prefeitura', {
      p_canal: inviteChannelId,
      p_email: email.trim().toLowerCase(),
      p_papel: role,
    });
    setWorking(false);
    if (error) {
      showAppError({ title: 'Não foi possível criar o convite', description: error.message, variant: 'destructive' });
      return;
    }
    const link = `${window.location.origin}/prefeitura/convite/${data.token}`;
    setInviteLink(link);
    setEmail('');
    showAppNotice({ title: 'Convite criado', description: 'Copie o link e envie ao funcionário pelo canal oficial da prefeitura.' });
    await load({ quiet: true });
  };

  const openMember = (member) => { setSelected(member); setEditRole(member.papel); setEditActive(member.ativo); };
  const updateMember = async () => {
    if (!selected || saving) return;
    setSaving(true);
    try {
      const changes = { papel: editRole, ativo: editActive };
      const { data, error } = await supabase.from('orgao_membros').update(changes).eq('id', selected.id).select('id').single();
      if (error || !data) throw error || new Error('O cadastro não pôde ser atualizado.');
      setMembers((items) => items.map((item) => item.id === selected.id ? { ...item, ...changes } : item));
      setSelected(null);
      showAppNotice({ title: 'Acesso atualizado' });
    } catch (error) {
      showAppError({ title: 'Não foi possível atualizar o funcionário', description: error.message, variant: 'destructive' });
    } finally { setSaving(false); }
  };

  const copy = async (value) => {
    await navigator.clipboard.writeText(value);
    showAppNotice({ title: 'Link copiado' });
  };

  if (loading) {
    return <div className="flex min-h-[70vh] items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-brand" /></div>;
  }

  if (!isAdministrator) {
    return (
      <div className="page-shell-fluid py-12">
        <div className="mx-auto max-w-xl rounded-3xl border border-edge-subtle bg-surface-raised p-8 text-center shadow-sm">
          <ShieldCheck className="mx-auto h-10 w-10 text-content-tertiary" />
          <h1 className="mt-4 text-2xl font-black">Área do administrador municipal</h1>
          <p className="mt-2 text-sm leading-6 text-content-secondary">Somente o administrador aprovado da prefeitura pode cadastrar funcionários e definir seus acessos.</p>
          <Button asChild className="mt-5"><Link to="/prefeitura/broncas">Voltar às broncas</Link></Button>
        </div>
      </div>
    );
  }

  return (
    <>
      <Helmet><title>Equipe | Painel da Prefeitura</title><meta name="robots" content="noindex" /></Helmet>
      <div className="page-shell-fluid py-6 sm:py-8">
        <header className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.16em] text-brand">Administração municipal</p>
            <h1 className="mt-1 text-3xl font-black tracking-tight">Equipe e acessos</h1>
            <p className="mt-2 max-w-3xl text-sm text-content-secondary">Convide servidores, associe cada pessoa à secretaria correta e controle quem pode responder oficialmente.</p>
          </div>
          {channels.length > 0 && (
            <Button onClick={() => setInviteOpen(true)}><Mail className="mr-2 h-4 w-4" />Convidar funcionário</Button>
          )}
        </header>

        {channels.length === 0 ? (
          <section className="mt-6 rounded-2xl border border-dashed border-edge-strong bg-surface-raised p-10 text-center">
            <Building2 className="mx-auto h-10 w-10 text-content-tertiary" />
            <h2 className="mt-3 text-lg font-black">Cadastre primeiro uma secretaria</h2>
            <p className="mt-1 text-sm text-content-secondary">A equipe é vinculada a uma secretaria para receber apenas as broncas sob sua responsabilidade.</p>
            <Button asChild className="mt-5"><Link to="/prefeitura/secretarias">Cadastrar secretaria</Link></Button>
          </section>
        ) : (
          <div className="mt-6 min-w-0 space-y-4">
            <MunicipalDrawer open={inviteOpen} onClose={() => setInviteOpen(false)} busy={working} title="Convidar funcionário" description={`Convites para ${selectedChannel?.nome || 'a secretaria'}.`}>
            <section className="self-start rounded-2xl border border-edge-subtle bg-surface-raised p-5 shadow-sm">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-subtleBg text-brand"><Mail className="h-5 w-5" /></div>
                <div>
                  <h2 className="font-black">Convidar funcionário</h2>
                  <p className="mt-1 text-xs leading-5 text-content-tertiary">Selecione a secretaria à qual o funcionário será vinculado.</p>
                </div>
              </div>

              <form onSubmit={createInvite} className="mt-5 grid gap-4">
                <div><Label htmlFor="invite-channel">Secretaria do funcionário</Label><select id="invite-channel" required disabled={working} value={inviteChannelId} onChange={(event) => { setInviteChannelId(event.target.value); setInviteLink(''); }} className="mt-1 h-10 w-full min-w-0 rounded-md border border-edge-strong bg-surface-raised px-3 text-sm"><option value="">Selecione a secretaria</option>{channels.map((channel) => <option key={channel.id} value={channel.id}>{channel.nome}</option>)}</select></div>
                <div><Label htmlFor="team-email">E-mail institucional</Label><Input id="team-email" type="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="servidor@prefeitura.gov.br" /></div>
                <div>
                  <Label htmlFor="team-role">Nível de acesso</Label>
                  <select id="team-role" value={role} onChange={(event) => setRole(event.target.value)} className="mt-1 h-10 w-full rounded-md border border-edge-strong bg-surface-raised px-3 text-sm">
                    {AGENCY_MEMBER_ROLES.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
                  </select>
                  <p className="mt-2 text-xs leading-5 text-content-tertiary">Gestor e operador podem atualizar demandas. Leitura apenas consulta a fila e o histórico.</p>
                </div>
                <Button type="submit" disabled={working || !inviteChannelId || !email.trim()}>{working && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Gerar convite</Button>
              </form>

              {inviteLink && (
                <div className="mt-4 rounded-xl border border-success-border bg-success-bg p-3">
                  <p className="text-xs font-bold text-success-fg">Convite pronto</p>
                  <p className="mt-1 break-all text-xs text-success-fg">{inviteLink}</p>
                  <Button type="button" size="sm" variant="outline" className="mt-3 bg-surface-raised" onClick={() => copy(inviteLink)}><Copy className="mr-2 h-3.5 w-3.5" /> Copiar link</Button>
                </div>
              )}

              {pendingInvites.length > 0 && (
                <div className="mt-6 border-t border-edge-subtle pt-5">
                  <h3 className="text-sm font-black">Convites pendentes</h3>
                  <div className="mt-3 grid gap-2">
                    {pendingInvites.map((invite) => {
                      const link = `${window.location.origin}/prefeitura/convite/${invite.token}`;
                      return <div key={invite.id} className="rounded-xl border border-edge-subtle p-3"><p className="truncate text-xs font-bold">{invite.email_convidado}</p><p className="mt-1 text-[11px] text-content-tertiary">{channelName(invite.canal_id)} · {roleLabel(invite.papel_orgao)} · expira em {new Date(invite.expires_at).toLocaleDateString('pt-BR')}</p><Button type="button" variant="ghost" size="sm" className="mt-1 -ml-2 h-8" onClick={() => copy(link)}><Copy className="mr-2 h-3.5 w-3.5" /> Copiar</Button></div>;
                    })}
                  </div>
                </div>
              )}
            </section>
            </MunicipalDrawer>

            {emailLookupFailed && <p role="status" className="rounded-xl border border-edge-subtle p-3 text-xs text-content-secondary">Não foi possível consultar os e-mails da equipe.</p>}
            <MunicipalTable title="Equipe municipal" rows={channelMembers.filter((member) => (statusFilter === 'all' || member.ativo === (statusFilter === 'active')) && (roleFilter === 'all' || member.papel === roleFilter))}
              filterKey={channelId + statusFilter + roleFilter} onOpen={openMember}
              searchPlaceholder="Nome, e-mail, telefone ou secretaria"
              searchText={(member) => [member.perfil?.name, member.email, member.perfil?.phone, channelName(member.canal_id)].join(' ')}
              filters={<>
                <label className="min-w-0 text-xs font-semibold text-content-secondary">Secretaria<select id="team-channel" value={channelId} onChange={(event) => setChannelId(event.target.value)} className="mt-1 block h-10 w-full max-w-xs rounded-md border border-edge-subtle bg-surface-raised px-3"><option value="all">Todas as secretarias</option>{channels.map((channel) => <option key={channel.id} value={channel.id}>{channel.nome}</option>)}</select></label>
                <label className="text-xs font-semibold text-content-secondary">Situação<select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="mt-1 block h-10 rounded-md border border-edge-subtle bg-surface-raised px-3"><option value="all">Todas</option><option value="active">Ativos</option><option value="inactive">Suspensos</option></select></label>
                <label className="text-xs font-semibold text-content-secondary">Nível de acesso<select value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)} className="mt-1 block h-10 rounded-md border border-edge-subtle bg-surface-raised px-3"><option value="all">Todos</option>{AGENCY_MEMBER_ROLES.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
              </>}
              columns={[
                { key: 'nome', label: 'Nome', width: '18%', value: (member) => member.perfil?.name || 'Servidor municipal', render: (member) => <span className="font-bold text-content-primary">{member.perfil?.name || 'Servidor municipal'}</span> },
                { key: 'email', label: 'E-mail', width: '21%', value: (member) => member.email, render: (member) => <span className="break-all">{member.email || 'Não informado'}</span> },
                { key: 'secretaria', label: 'Secretaria', width: '18%', value: (member) => channelName(member.canal_id) },
                { key: 'role', label: 'Acesso', value: (member) => roleLabel(member.papel) },
                { key: 'status', label: 'Situação', value: (member) => member.ativo ? 'Ativo' : 'Suspenso', render: (member) => <span className={`rounded-full px-2 py-1 text-xs font-semibold ${member.ativo ? 'bg-success-bg text-success-fg' : 'bg-surface-subtle text-content-secondary'}`}>{member.ativo ? 'Ativo' : 'Suspenso'}</span> },
                { key: 'date', label: 'Na secretaria desde', value: (member) => member.created_at || '', render: (member) => memberDate(member.created_at) },
              ]} />
            <MunicipalDrawer open={Boolean(selected)} onClose={() => setSelected(null)} busy={saving} title={selected?.perfil?.name || 'Funcionário'} description={channelName(selected?.canal_id)}
              footer={<div className="flex justify-end gap-2"><Button variant="outline" disabled={saving} onClick={() => setSelected(null)}>Cancelar</Button><Button onClick={updateMember} disabled={saving || (editRole === selected?.papel && editActive === selected?.ativo)}>{saving ? 'Salvando…' : 'Salvar alterações'}</Button></div>}>
              {selected && <div className="space-y-6">
                <dl className="space-y-4 text-sm">
                  <div><dt className="flex items-center gap-2 text-xs text-content-tertiary"><Mail className="h-4 w-4" />E-mail da conta</dt><dd className="mt-1 break-all">{selected.email ? <a href={`mailto:${selected.email}`} className="text-brand underline">{selected.email}</a> : 'Não informado'}</dd></div>
                  <div><dt className="flex items-center gap-2 text-xs text-content-tertiary"><Phone className="h-4 w-4" />Telefone</dt><dd className="mt-1">{selected.perfil?.phone ? <a href={`tel:${selected.perfil.phone.replace(/[^\d+]/g, '')}`}>{selected.perfil.phone}</a> : 'Não informado'}</dd></div>
                  <div><dt className="flex items-center gap-2 text-xs text-content-tertiary"><CalendarDays className="h-4 w-4" />Na secretaria desde</dt><dd className="mt-1">{memberDate(selected.created_at)}</dd></div>
                </dl>
                <p className="text-xs leading-5 text-content-secondary">Os dados pessoais são mantidos pelo próprio usuário no perfil. Aqui você gerencia o acesso à secretaria.</p>
                <div className="border-t border-edge-subtle pt-4"><Label htmlFor="edit-member-role">Nível de acesso</Label><select id="edit-member-role" value={editRole} disabled={saving} onChange={(event) => setEditRole(event.target.value)} className="mt-2 h-10 w-full rounded-md border border-edge-subtle bg-surface-raised px-3">{AGENCY_MEMBER_ROLES.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></div>
                <div><Label htmlFor="edit-member-status">Situação do acesso</Label><select id="edit-member-status" value={String(editActive)} disabled={saving} onChange={(event) => setEditActive(event.target.value === 'true')} className="mt-2 h-10 w-full rounded-md border border-edge-subtle bg-surface-raised px-3"><option value="true">Ativo</option><option value="false">Suspenso</option></select><p className="mt-2 text-xs text-content-secondary">Suspender remove o acesso a esta secretaria; o cadastro e o histórico permanecem.</p></div>
              </div>}
            </MunicipalDrawer>
          </div>
        )}
      </div>
    </>
  );
}

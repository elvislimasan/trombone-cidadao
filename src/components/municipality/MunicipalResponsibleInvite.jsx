import React, { useState } from 'react';
import { Check, Copy, Loader2, Mail, RefreshCw, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { supabase } from '@/lib/customSupabaseClient';

export default function MunicipalResponsibleInvite({ channel, onMembersLoaded, onBusyChange }) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('operador');
  const [invite, setInvite] = useState(null);
  const [working, setWorking] = useState('');
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState('');
  const [copied, setCopied] = useState(false);
  const inviteLink = invite ? `${window.location.origin}/prefeitura/convite/${invite.token}` : '';

  const createInvite = async () => {
    if (!channel?.id || working) return;
    const normalizedEmail = email.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(normalizedEmail)) { setError('Informe um e-mail válido para o responsável.'); return; }
    setWorking('invite'); onBusyChange(true); setError(''); setFeedback('');
    try {
      const { data, error: failure } = await supabase.rpc('criar_convite_funcionario_prefeitura', {
        p_canal: channel.id, p_email: normalizedEmail, p_papel: role,
      });
      if (failure) throw failure;
      if (!data?.token) throw new Error('Não foi possível gerar o link do convite. Tente novamente.');
      setInvite({ ...data, email: normalizedEmail }); setCopied(false);
    } catch (failure) { setError(failure.message); }
    finally { setWorking(''); onBusyChange(false); }
  };

  const refreshMembers = async () => {
    if (!channel?.id || working) return;
    setWorking('refresh'); onBusyChange(true); setError(''); setFeedback('');
    try {
      const { data, error: failure } = await supabase.from('orgao_membros')
        .select('canal_id,user_id,papel,ativo,perfil:profiles!orgao_membros_user_id_fkey(name)')
        .eq('canal_id', channel.id).eq('ativo', true);
      if (failure) throw failure;
      onMembersLoaded(data || []);
      setFeedback('Lista atualizada. Se o convite já foi aceito, selecione o responsável acima.');
    } catch (failure) { setError(failure.message); }
    finally { setWorking(''); onBusyChange(false); }
  };

  const copyInvite = async () => {
    try { await navigator.clipboard.writeText(inviteLink); setCopied(true); }
    catch { setError('Não foi possível copiar automaticamente. Selecione e copie o link abaixo.'); }
  };

  return <section aria-label="Cadastrar responsável" className="space-y-4 rounded-xl border border-edge-default bg-surface-subtle/50 p-4">
    <div className="flex items-start gap-3"><span className="rounded-lg bg-status-progressBg p-2 text-status-progressFg"><UserPlus className="h-4 w-4" /></span><h3 className="text-sm font-semibold">Convite para a plataforma (opcional)</h3></div>
    {!invite ? <div className="grid min-w-0 items-start gap-4 sm:grid-cols-2">
      <label className="block min-w-0 text-xs font-semibold" htmlFor="demand-responsible-email">E-mail do responsável<Input id="demand-responsible-email" className="mt-1.5 h-10" inputMode="email" autoComplete="email" value={email} onChange={(event) => { setEmail(event.target.value); setError(''); }} disabled={Boolean(working)} /></label>
      <label className="block min-w-0 text-xs font-semibold">Nível de acesso<select className="mt-1.5 h-10 w-full min-w-0 rounded-lg border border-input bg-background px-3 text-sm font-normal" value={role} onChange={(event) => setRole(event.target.value)} disabled={Boolean(working)}><option value="operador">Atendente / técnico</option><option value="gestor">Gestor da secretaria</option></select></label>
    </div> : <div className="space-y-3 rounded-lg border border-success-border bg-success-bg p-3">
      <p role="status" className="text-xs font-semibold text-success-fg">Convite pronto para {invite.email}</p>
      <Input aria-label="Link do convite do responsável" value={inviteLink} readOnly onFocus={(event) => event.target.select()} className="text-xs" />
      <div className="flex flex-wrap gap-2"><Button type="button" size="sm" variant="outline" onClick={copyInvite}>{copied ? <Check className="mr-2 h-3.5 w-3.5" /> : <Copy className="mr-2 h-3.5 w-3.5" />}{copied ? 'Link copiado' : 'Copiar link'}</Button><Button type="button" size="sm" variant="ghost" disabled={Boolean(working)} onClick={() => { setInvite(null); setEmail(''); setFeedback(''); setError(''); }}>Convidar outra pessoa</Button></div>
    </div>}
    <div className="flex flex-wrap gap-2">{!invite && <Button type="button" size="sm" disabled={Boolean(working) || !email.trim()} onClick={createInvite}>{working === 'invite' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Mail className="mr-2 h-4 w-4" />}Gerar convite</Button>}<Button type="button" size="sm" variant="outline" disabled={Boolean(working)} onClick={refreshMembers}>{working === 'refresh' ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-2 h-3.5 w-3.5" />}Atualizar responsáveis</Button></div>
    {error && <p role="alert" className="text-xs leading-5 text-danger">{error}</p>}
    {feedback && <p role="status" className="text-xs leading-5 text-content-secondary">{feedback}</p>}
  </section>;
}

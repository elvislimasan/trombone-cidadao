import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { supabase } from '@/lib/customSupabaseClient';
import { municipalSetupStep } from '@/lib/municipalAccount';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function MunicipalAccountGate({ children }) {
  const { user, loading, refreshUserProfile, signOut } = useAuth();
  const { pathname } = useLocation();
  const required = Boolean(user?.app_metadata?.municipal_provisioned);
  const userId = user?.id;
  const [checkedId, setCheckedId] = useState(null);
  const [status, setStatus] = useState(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: '', phone: '', terms: false, password: '', confirmation: '' });
  const currentUser = useRef(userId);
  const checkVersion = useRef(0);
  currentUser.current = userId;
  const check = useCallback(async () => {
    if (!userId || !required) return;
    const version = ++checkVersion.current;
    try {
      const { data, error: failure } = await supabase.rpc('municipal_account_status');
      if (failure) throw failure;
      if (!data) throw new Error('O acesso ainda não foi concluído pela administração.');
      if (currentUser.current !== userId || version !== checkVersion.current) return;
      setStatus(data); setCheckedId(userId); setError('');
    } catch (failure) {
      if (currentUser.current === userId && version === checkVersion.current) setError(failure.message || 'Não foi possível verificar seu acesso.');
    }
  }, [userId, required]);
  useEffect(() => {
    setCheckedId(null); setStatus(null); setError('');
    setForm({ name: '', phone: '', terms: false, password: '', confirmation: '' });
    check();
  }, [check]);
  const passwordExpiresAt = status?.password_expires_at;
  useEffect(() => {
    if (!required || passwordExpiresAt === null) return;
    const timer = window.setInterval(check, 60000);
    const visible = () => { if (document.visibilityState === 'visible') check(); };
    window.addEventListener('focus', check); document.addEventListener('visibilitychange', visible);
    return () => { window.clearInterval(timer); window.removeEventListener('focus', check); document.removeEventListener('visibilitychange', visible); };
  }, [check, required, passwordExpiresAt]);
  useEffect(() => {
    if (!status?.password_expires_at || status.password_required) return;
    const delay = Math.max(1000, new Date(status.password_expires_at).getTime() - Date.now());
    const timer = window.setTimeout(check, Math.min(delay, 2147483647));
    return () => window.clearTimeout(timer);
  }, [status, check]);

  const step = municipalSetupStep(status);
  if (!required || pathname === '/termos-de-uso' || (!loading && checkedId === userId && !step && !error)) return children;
  const update = event => setForm(current => ({ ...current, [event.target.name]: event.target.type === 'checkbox' ? event.target.checked : event.target.value }));
  const submit = async event => {
    event.preventDefault();
    if (saving) return;
    setError('');
    if (step === 'password' && (form.password.length < 8 || form.password !== form.confirmation)) { setError('Informe uma senha com pelo menos 8 caracteres e confirme a mesma senha.'); return; }
    setSaving(true);
    try {
      const { error: failure } = step === 'profile'
        ? await supabase.rpc('complete_municipal_account', { p_name: form.name, p_phone: form.phone, p_terms: form.terms })
        : await supabase.auth.updateUser({ password: form.password });
      if (failure) throw failure;
      setForm(current => ({ ...current, password: '', confirmation: '' }));
      await refreshUserProfile();
      await check();
    } catch (failure) { setError(failure.message || 'Não foi possível salvar. Tente novamente.'); }
    finally { setSaving(false); }
  };
  return <main className="page-shell-fluid flex min-h-screen items-center justify-center py-8">
    <section className="w-full max-w-lg rounded-2xl border border-edge-subtle bg-surface-raised p-6 shadow-sm">
      <h1 className="text-2xl font-black">{step === 'profile' ? 'Complete seu cadastro' : step === 'password' ? 'Troque sua senha temporária' : 'Verificando acesso'}</h1>
      {step ? <form onSubmit={submit} className="mt-5 grid gap-4">
        {step === 'profile' ? <>
          <p className="text-sm text-content-secondary">No primeiro acesso, informe seus dados pessoais. Sua prefeitura e seus cargos já foram definidos pela administração.</p>
          <div className="grid gap-2"><Label htmlFor="setup-name">Nome completo</Label><Input id="setup-name" name="name" autoComplete="name" required minLength={3} maxLength={160} value={form.name} onChange={update} disabled={saving} /></div>
          <div className="grid gap-2"><Label htmlFor="setup-phone">Telefone com DDD</Label><Input id="setup-phone" name="phone" type="tel" autoComplete="tel" required maxLength={25} value={form.phone} onChange={update} disabled={saving} /></div>
          <label className="flex items-start gap-2 text-sm"><input name="terms" type="checkbox" required checked={form.terms} onChange={update} disabled={saving} className="mt-1" /><span>Aceito os <Link className="underline" to="/termos-de-uso" target="_blank" rel="noopener noreferrer">termos de uso e a política de privacidade</Link>.</span></label>
        </> : <>
          <p className="text-sm text-content-secondary">Passaram-se 24 horas desde a criação do acesso. Escolha uma senha pessoal para continuar.</p>
          <div className="grid gap-2"><Label htmlFor="setup-password">Nova senha</Label><Input id="setup-password" name="password" type="password" autoComplete="new-password" required minLength={8} value={form.password} onChange={update} disabled={saving} /></div>
          <div className="grid gap-2"><Label htmlFor="setup-confirmation">Confirme a nova senha</Label><Input id="setup-confirmation" name="confirmation" type="password" autoComplete="new-password" required minLength={8} value={form.confirmation} onChange={update} disabled={saving} /></div>
        </>}
        <Button type="submit" disabled={saving}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{step === 'profile' ? 'Salvar e continuar' : 'Salvar nova senha'}</Button>
      </form> : !error && <Loader2 aria-label="Verificando acesso" className="mt-5 h-6 w-6 animate-spin" />}
      {error && <div role="alert" className="mt-4 space-y-3 text-sm"><p>{error}</p><Button type="button" variant="outline" disabled={saving} onClick={check}>Verificar novamente</Button></div>}
      <Button className="mt-4" type="button" variant="ghost" disabled={saving} onClick={signOut}>Sair da conta</Button>
    </section>
  </main>;
}

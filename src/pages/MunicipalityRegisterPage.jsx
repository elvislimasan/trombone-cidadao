import React, { useEffect, useState } from 'react';
import { Helmet } from 'react-helmet';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { Building2, Eye, EyeOff, Loader2, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { supabase } from '@/lib/customSupabaseClient';
import { showAppError, showAppNotice } from '@/lib/appError';

export default function MunicipalityRegisterPage() {
  const { token } = useParams();
  const navigate = useNavigate();
  const { user, loading: authLoading, signUp, signIn, refreshUserProfile } = useAuth();
  const [preview, setPreview] = useState(null);
  const [checking, setChecking] = useState(true);
  const [invalid, setInvalid] = useState(false);
  const [working, setWorking] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', password: '', confirmation: '', terms: false });

  useEffect(() => {
    if (!token) { setInvalid(true); setChecking(false); return; }
    supabase.rpc('preview_acesso_convite_prefeitura', { p_token: token }).then(({ data, error }) => {
      const row = Array.isArray(data) ? data[0] : data;
      setPreview(row || null);
      if (row?.email_convidado) setForm((current) => ({ ...current, email: row.email_convidado }));
      setInvalid(Boolean(error || !row));
      setChecking(false);
    });
  }, [token]);

  if (!authLoading && user) return <Navigate to={`/prefeitura/convite/${token}`} replace />;

  const submit = async (event) => {
    event.preventDefault();
    if (form.password.length < 6) {
      showAppError({ title: 'A senha precisa ter pelo menos 6 caracteres', variant: 'destructive' });
      return;
    }
    if (form.password !== form.confirmation) {
      showAppError({ title: 'As senhas não coincidem', variant: 'destructive' });
      return;
    }
    if (!form.terms) {
      showAppError({ title: 'Aceite os termos para continuar', variant: 'destructive' });
      return;
    }

    setWorking(true);
    const invitePath = `/prefeitura/convite/${token}`;
    const { error } = await signUp(preview.email_convidado, form.password, {
      data: {
        name: form.name.trim(),
        contexto_cadastro: 'prefeitura',
        terms_accepted_at: new Date().toISOString(),
      },
      emailRedirectTo: `${import.meta.env.VITE_APP_URL?.replace(/\/$/, '') || window.location.origin}${invitePath}`,
    });
    if (error) {
      setWorking(false);
      showAppError({ title: 'Não foi possível criar a conta institucional', description: error.message, variant: 'destructive' });
      return;
    }

    const { error: signInError } = await signIn(preview.email_convidado, form.password);
    if (!signInError) {
      await refreshUserProfile();
      navigate(`/prefeitura/convite/${token}`, { replace: true });
      return;
    }

    setWorking(false);
    showAppNotice({
      title: 'Confirme seu e-mail',
      description: 'Depois da confirmação, entre com a conta institucional. O acesso será ativado automaticamente.',
    });
    navigate('/login', { replace: true, state: { email: preview.email_convidado, from: { pathname: invitePath } } });
  };

  return (
    <div className="min-h-screen bg-surface-base px-4 py-8 text-content-primary sm:py-12">
      <Helmet><title>Criar conta institucional | Painel da Prefeitura</title><meta name="robots" content="noindex" /></Helmet>
      <div className="mx-auto w-full max-w-lg">
        <div className="mb-6 flex items-center justify-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand text-content-onBrand"><Building2 className="h-6 w-6" /></span>
          <div><p className="font-black">Painel da Prefeitura</p><p className="text-xs text-content-secondary">Acesso institucional</p></div>
        </div>

        <section className="rounded-3xl border border-edge-subtle bg-surface-raised p-5 shadow-sm sm:p-8">
          {checking || authLoading ? (
            <div className="py-12 text-center"><Loader2 className="mx-auto h-8 w-8 animate-spin text-brand" /><p className="mt-3 text-sm text-content-secondary">Verificando convite...</p></div>
          ) : invalid ? (
            <div className="py-8 text-center"><ShieldCheck className="mx-auto h-10 w-10 text-content-tertiary" /><h1 className="mt-4 text-xl font-black">Convite inválido ou expirado</h1><p className="mt-2 text-sm text-content-secondary">Solicite um novo convite ao administrador responsável.</p></div>
          ) : (
            <>
              <p className="text-xs font-black uppercase tracking-[0.16em] text-brand">Cadastro institucional</p>
              <h1 className="mt-2 text-2xl font-black">Criar acesso para {preview?.prefeitura_nome}</h1>
              <p className="mt-2 text-sm leading-6 text-content-secondary">Esta conta dará acesso ao painel municipal de {preview?.cidade_nome}{preview?.cidade_uf ? ` - ${preview.cidade_uf}` : ''}.</p>

              <form onSubmit={submit} className="mt-6 grid gap-4">
                <div><Label htmlFor="municipality-name">Nome completo</Label><Input id="municipality-name" required value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} /></div>
                <div><Label htmlFor="municipality-email">E-mail do convite</Label><Input id="municipality-email" type="email" required readOnly value={form.email} /><p className="mt-1 text-xs text-content-secondary">Endereço definido no convite.</p></div>
                <div>
                  <Label htmlFor="municipality-password">Senha</Label>
                  <div className="relative"><Input id="municipality-password" type={showPassword ? 'text' : 'password'} required minLength={6} value={form.password} onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))} className="pr-10" /><button type="button" onClick={() => setShowPassword((visible) => !visible)} className="absolute right-3 top-1/2 -translate-y-1/2 text-content-secondary focus-visible:ring-2 focus-visible:ring-brand" aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}>{showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button></div>
                </div>
                <div><Label htmlFor="municipality-confirmation">Confirmar senha</Label><Input id="municipality-confirmation" type={showPassword ? 'text' : 'password'} required minLength={6} value={form.confirmation} onChange={(event) => setForm((current) => ({ ...current, confirmation: event.target.value }))} /></div>
                <label className="flex items-start gap-3 rounded-xl border border-edge-subtle p-3 text-sm text-content-secondary"><Checkbox checked={form.terms} onCheckedChange={(checked) => setForm((current) => ({ ...current, terms: checked === true }))} /><span>Li e aceito os <Link to="/termos-de-uso" target="_blank" className="font-bold text-brand hover:underline">Termos de Uso</Link>.</span></label>
                <Button type="submit" disabled={working}>{working && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Criar conta institucional</Button>
              </form>

              <p className="mt-6 text-center text-sm text-content-secondary">Já possui uma conta com este e-mail? <Link to="/login" state={{ email: preview.email_convidado, from: { pathname: `/prefeitura/convite/${token}` } }} className="font-bold text-brand hover:underline">Entrar</Link></p>
            </>
          )}
        </section>
      </div>
    </div>
  );
}

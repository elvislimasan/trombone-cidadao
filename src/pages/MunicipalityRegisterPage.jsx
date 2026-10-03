import React, { useEffect, useState } from 'react';
import { Helmet } from 'react-helmet';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { Eye, EyeOff, Loader2, ShieldCheck } from 'lucide-react';
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
    <div className="min-h-screen bg-surface-base text-content-primary">
      <Helmet><title>Criar conta institucional | Painel da Prefeitura</title><meta name="robots" content="noindex" /></Helmet>
      <div className="
    page-shell-fluid
    grid
    min-h-screen
    grid-cols-1
    gap-8
    py-6
    lg:grid-cols-[0.9fr_1.1fr]
    lg:items-stretch
  ">
        <aside className="hidden h-full min-h-[36rem] flex-col justify-between rounded-2xl bg-brand-subtleBg p-8 lg:flex xl:p-12" aria-label="Informações do convite">
          <div>
            <img src="/logo.png" alt="" className="h-14 w-14 object-contain" />
            <p className="mt-9 text-xs font-black uppercase tracking-widest text-brand">Convite da prefeitura</p>
            <h2 className="mt-3 max-w-lg font-display text-3xl font-extrabold leading-tight xl:text-4xl">Seu trabalho começa com um acesso seguro.</h2>
            <p className="mt-4 max-w-lg text-sm leading-6 text-content-secondary">Crie sua conta para atender os serviços atribuídos pela equipe municipal.</p>
          </div>
          {preview && <div className="border-t border-brand/20 pt-5"><p className="font-bold">{preview.prefeitura_nome}</p><p className="mt-1 text-sm text-content-secondary">{preview.cidade_nome}{preview.cidade_uf ? ` · ${preview.cidade_uf}` : ''}</p></div>}
        </aside>
        <div className="w-full min-w-0 max-w-xl justify-self-center">
          <div className="mb-5 flex items-center gap-3 lg:hidden">
            <img src="/logo.png" alt="" className="h-10 w-10 object-contain" />
            <div><p className="font-display text-sm font-extrabold">Trombone Cidadão</p><p className="text-xs text-content-secondary">Acesso institucional</p></div>
          </div>
        </div>

        <section className="rounded-2xl border border-edge-subtle bg-surface-raised p-5 shadow-sm sm:p-8">
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

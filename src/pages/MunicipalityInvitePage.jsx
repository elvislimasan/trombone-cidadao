import { useEffect, useRef, useState } from 'react';
import { Helmet } from 'react-helmet';
import { useNavigate, useParams } from 'react-router-dom';
import { Building2, Loader2, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { supabase } from '@/lib/customSupabaseClient';

export default function MunicipalityInvitePage() {
  const { token } = useParams();
  const navigate = useNavigate();
  const { user, loading: authLoading, refreshUserProfile, signOut } = useAuth();
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const accepting = useRef(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setPreview(null);
    setError('');
    accepting.current = false;
    if (!token) {
      setLoading(false);
      return undefined;
    }
    supabase.rpc('preview_acesso_convite_prefeitura', { p_token: token }).then(({ data, error: previewError }) => {
      if (!active) return;
      const row = Array.isArray(data) ? data[0] : data;
      setPreview(previewError ? null : row || null);
      setLoading(false);
    });
    return () => { active = false; };
  }, [token]);

  useEffect(() => {
    if (loading || authLoading || !preview) return;
    if (!user) {
      const invitePath = `/prefeitura/convite/${token}`;
      if (preview.conta_existente) {
        navigate('/login', {
          replace: true,
          state: { email: preview.email_convidado, from: { pathname: invitePath } },
        });
      } else {
        navigate(`${invitePath}/cadastro`, { replace: true });
      }
      return;
    }
    if (user.email?.trim().toLowerCase() !== preview.email_convidado.toLowerCase()) return;
    if (accepting.current) return;
    accepting.current = true;
    supabase.rpc('aceitar_convite_prefeitura', { p_token: token }).then(async ({ error: acceptError }) => {
      if (acceptError) {
        setError(acceptError.message);
        return;
      }
      window.dispatchEvent(new Event('municipality-access-changed'));
      await refreshUserProfile();
      navigate('/prefeitura/visao-geral', { replace: true });
    });
  }, [attempt, authLoading, loading, navigate, preview, refreshUserProfile, token, user]);

  const switchAccount = async () => {
    setError('');
    const { error: signOutError } = await signOut();
    if (signOutError) setError(signOutError.message);
  };

  return <div className="page-shell-fluid flex min-h-[70vh] items-center justify-center py-8 sm:py-12">
    <Helmet><title>Acesso à Prefeitura | Trombone Cidadão</title><meta name="robots" content="noindex" /></Helmet>
    <section className="w-full max-w-xl rounded-3xl border border-edge-subtle bg-surface-raised p-5 text-center shadow-sm sm:p-8">
      {loading || authLoading ? <><Loader2 className="mx-auto h-10 w-10 animate-spin text-brand" /><p className="mt-3 text-sm text-content-secondary">Verificando convite...</p></> : !preview ? <><ShieldCheck className="mx-auto h-12 w-12 text-content-tertiary" /><h1 className="mt-4 text-2xl font-black">Convite inválido ou expirado</h1><p className="mt-2 text-sm text-content-secondary">Peça ao administrador responsável um novo convite.</p></> : <><span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-brand text-content-onBrand"><Building2 className="h-7 w-7" /></span><h1 className="mt-5 text-2xl font-black">{preview.prefeitura_nome}</h1><p className="mt-2 text-sm text-content-secondary">{preview.cidade_nome}{preview.cidade_uf ? ` - ${preview.cidade_uf}` : ''}</p>{user?.email?.trim().toLowerCase() !== preview.email_convidado.toLowerCase() ? <><p className="mt-5 text-sm text-content-secondary">Este acesso foi enviado para {preview.email_convidado}. Entre com essa conta para continuar.</p>{error && <p className="mt-3 text-sm text-destructive">{error}</p>}<Button className="mt-6" onClick={switchAccount}>Trocar de conta</Button></> : error ? <><p className="mt-5 text-sm text-destructive">{error}</p><Button className="mt-6" onClick={() => { accepting.current = false; setError(''); setAttempt((value) => value + 1); }}>Tentar novamente</Button></> : <><Loader2 className="mx-auto mt-6 h-7 w-7 animate-spin text-brand" /><p className="mt-2 text-sm text-content-secondary">Ativando seu acesso...</p></>}</>}
    </section>
  </div>;
}

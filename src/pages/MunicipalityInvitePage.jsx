import { useEffect, useState } from 'react';
import { Helmet } from 'react-helmet';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Building2, Loader2, Mail, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { supabase } from '@/lib/customSupabaseClient';
import { showAppError } from '@/lib/appError';

export default function MunicipalityInvitePage() {
  const { token } = useParams();
  const navigate = useNavigate();
  const { user, loading: authLoading, refreshUserProfile } = useAuth();
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);
  const [invalid, setInvalid] = useState(false);

  useEffect(() => {
    if (!token) { setInvalid(true); setLoading(false); return; }
    supabase.rpc('preview_convite_prefeitura', { p_token: token }).then(({ data, error }) => {
      const row = Array.isArray(data) ? data[0] : data;
      setPreview(row || null);
      setInvalid(Boolean(error || !row));
      setLoading(false);
    });
  }, [token]);

  const accept = async () => {
    setAccepting(true);
    const { error } = await supabase.rpc('aceitar_convite_prefeitura', { p_token: token });
    setAccepting(false);
    if (error) {
      showAppError({ title: 'Não foi possível aceitar o convite', description: error.message, variant: 'destructive' });
      return;
    }
    window.dispatchEvent(new Event('municipality-access-changed'));
    await refreshUserProfile();
    navigate('/prefeitura/broncas', { replace: true });
  };

  const returnTo = { pathname: `/prefeitura/convite/${token}` };

  return <div className="page-shell-fluid flex min-h-[70vh] items-center justify-center py-12">
    <Helmet><title>Convite da Prefeitura | Trombone Cidadão</title><meta name="robots" content="noindex" /></Helmet>
    <section className="w-full max-w-xl rounded-3xl border border-edge-subtle bg-surface-raised p-8 text-center shadow-sm">
      {loading || authLoading ? <><Loader2 className="mx-auto h-10 w-10 animate-spin text-brand" /><p className="mt-3 text-sm text-content-secondary">Verificando convite...</p></> : invalid ? <><ShieldCheck className="mx-auto h-12 w-12 text-content-tertiary" /><h1 className="mt-4 text-2xl font-black">Convite inválido ou expirado</h1><p className="mt-2 text-sm text-content-secondary">Peça ao administrador responsável um novo convite.</p></> : <><span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-brand text-content-onBrand"><Building2 className="h-7 w-7" /></span><p className="mt-5 text-xs font-extrabold uppercase tracking-[0.16em] text-brand">Convite institucional</p><h1 className="mt-2 text-2xl font-black">{preview.prefeitura_nome}</h1><p className="mt-2 text-sm text-content-secondary">{preview.cidade_nome}{preview.cidade_uf ? ` - ${preview.cidade_uf}` : ''}</p><p className="mt-5 flex items-center justify-center gap-2 text-sm text-content-tertiary"><Mail className="h-4 w-4" /> Convite destinado a {preview.email_mascarado}</p>{user ? <Button className="mt-7" onClick={accept} disabled={accepting}>{accepting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Aceitar e abrir o painel</Button> : <div className="mt-7 flex flex-wrap justify-center gap-2"><Button asChild><Link to="/login" state={{ from: returnTo }}>Entrar com conta institucional</Link></Button><Button asChild variant="outline"><Link to={`/prefeitura/convite/${token}/cadastro`}>Criar conta institucional</Link></Button></div>}</>}
    </section>
  </div>;
}

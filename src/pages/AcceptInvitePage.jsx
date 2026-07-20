import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { supabase } from '@/lib/customSupabaseClient';
import { Loader2, MapPin, ShieldCheck, AlertCircle, CheckCircle2, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

// ── Estados do fluxo ─────────────────────────────────────────────────────────
// 'loading_preview' → busca dados do convite sem autenticação
// 'preview'         → mostra cidade + quem convidou, botões de login/cadastro
// 'accepting'       → usuário logado, chamando a Edge Function
// 'success'         → convite aceito
// 'error'           → convite inválido / expirado / erro

const AcceptInvitePage = () => {
  const { token } = useParams();
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  const [phase, setPhase] = useState('loading_preview');
  const [preview, setPreview] = useState(null); // { city_name, city_uf, invited_by_name }
  const [errorMessage, setErrorMessage] = useState('');
  const [hasAccepted, setHasAccepted] = useState(false);

  // ── 1. Buscar preview do convite (sem autenticação) ──────────────────────
  useEffect(() => {
    if (!token) { setPhase('error'); setErrorMessage('Token inválido.'); return; }

    const fetchPreview = async () => {
      try {
        // Usa current_setting para a RLS de SELECT anônimo
        const { data, error } = await supabase
          .rpc('get_invite_preview', { p_token: token });

        if (error || !data || data.length === 0) {
          setPhase('error');
          setErrorMessage('Convite inválido, expirado ou já utilizado.');
          return;
        }

        const row = data[0];
        setPreview({
          city_name: row.city_name,
          city_uf: row.city_uf,
          invited_by_name: row.invited_by_name,
          expires_at: row.expires_at,
        });
        setPhase('preview');
      } catch (err) {
        setPhase('error');
        setErrorMessage('Erro ao verificar convite. Tente novamente.');
      }
    };

    fetchPreview();
  }, [token]);

  // ── 2. Quando usuário loga (redirect de volta) e convite está válido ──────
  useEffect(() => {
    if (authLoading || hasAccepted) return;
    if (phase !== 'preview' || !user) return;

    // Usuário acabou de logar — aceitar automaticamente
    setPhase('accepting');
    setHasAccepted(true);

    const accept = async () => {
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const accessToken = sessionData?.session?.access_token;
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;

        const response = await fetch(
          `${supabaseUrl}/functions/v1/accept-ambassador-invite`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${accessToken}`,
              'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
            },
            body: JSON.stringify({ token }),
          }
        );

        const json = await response.json();

        if (!response.ok) {
          setErrorMessage(json?.error ?? 'Erro ao aceitar o convite.');
          setPhase('error');
          return;
        }

        setPreview(prev => ({ ...prev, city_name: json.city_name || prev?.city_name }));
        setPhase('success');
      } catch (err) {
        setErrorMessage(err.message ?? 'Erro de conexão. Tente novamente.');
        setPhase('error');
      }
    };

    accept();
  }, [authLoading, user, phase, token, hasAccepted]);

  // ── Renders ───────────────────────────────────────────────────────────────

  if (phase === 'loading_preview') {
    return (
      <Screen>
        <Loader2 className="w-10 h-10 animate-spin text-tc-red mb-4" />
        <p className="text-muted-foreground text-sm">Verificando convite…</p>
      </Screen>
    );
  }

  if (phase === 'accepting') {
    return (
      <Screen>
        <Loader2 className="w-10 h-10 animate-spin text-tc-red mb-4" />
        <p className="text-muted-foreground text-sm">Ativando seu acesso como embaixador…</p>
      </Screen>
    );
  }

  if (phase === 'success') {
    return (
      <Screen>
        <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center mb-6">
          <CheckCircle2 className="w-10 h-10 text-green-600" />
        </div>
        <h1 className="text-2xl font-bold text-foreground mb-2">Bem-vindo, embaixador!</h1>
        <p className="text-muted-foreground mb-2 max-w-sm text-center">
          Você agora é embaixador
          {preview?.city_name ? ` de ${preview.city_name}${preview.city_uf ? ` · ${preview.city_uf}` : ''}` : ''}.
        </p>
        <p className="text-sm text-muted-foreground mb-8 max-w-sm text-center">
          A partir de agora você pode moderar broncas e atualizações da sua cidade no painel de embaixador.
        </p>
        <div className="flex flex-col sm:flex-row gap-3">
          <Button onClick={() => navigate('/embaixador', { replace: true })} className="gap-2">
            <ShieldCheck className="w-4 h-4" /> Ir para o painel
          </Button>
          <Button variant="outline" onClick={() => navigate('/', { replace: true })}>
            Ver feed
          </Button>
        </div>
      </Screen>
    );
  }

  if (phase === 'error') {
    return (
      <Screen>
        <div className="w-20 h-20 rounded-full bg-red-100 flex items-center justify-center mb-6">
          <AlertCircle className="w-10 h-10 text-red-600" />
        </div>
        <h1 className="text-2xl font-bold text-foreground mb-2">Convite inválido</h1>
        <p className="text-muted-foreground mb-8 max-w-sm text-center">
          {errorMessage || 'Este convite não é válido ou já foi utilizado.'}
        </p>
        <Button variant="outline" onClick={() => navigate(-1)}>Voltar</Button>
      </Screen>
    );
  }

  // ── PREVIEW — tela principal antes do login ───────────────────────────────
  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/30 flex flex-col">
      {/* Header mínimo */}
      <div className="border-b bg-background px-6 py-4 flex items-center gap-3">
        <img src="/logo.png" alt="Trombone Cidadão" className="h-8 w-auto" />
        <span className="font-bold text-base">Trombone Cidadão</span>
      </div>

      <div className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md">
          {/* Badge */}
          <div className="flex justify-center mb-6">
            <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-tc-red/10 text-tc-red text-sm font-semibold border border-tc-red/20">
              <ShieldCheck className="w-4 h-4" />
              Convite de Embaixador
            </span>
          </div>

          {/* Card principal */}
          <div className="bg-card border border-border rounded-2xl shadow-lg overflow-hidden">
            {/* Destaque da cidade */}
            <div className="bg-gradient-to-br from-tc-red to-tc-red/80 px-6 py-8 text-white text-center">
              <div className="w-16 h-16 rounded-full bg-white/20 flex items-center justify-center mx-auto mb-4">
                <MapPin className="w-8 h-8 text-white" />
              </div>
              <p className="text-white/80 text-sm font-medium mb-1">Você foi convidado para ser embaixador de</p>
              <h1 className="text-3xl font-extrabold">
                {preview?.city_name || '—'}
                {preview?.city_uf && <span className="text-xl font-semibold opacity-80 ml-2">· {preview.city_uf}</span>}
              </h1>
              {preview?.invited_by_name && (
                <p className="text-white/70 text-sm mt-3">
                  Convidado por <span className="font-semibold text-white">{preview.invited_by_name}</span>
                </p>
              )}
            </div>

            {/* O que significa */}
            <div className="px-6 py-5 border-b border-border bg-muted/30">
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3">Como embaixador você poderá:</p>
              <ul className="space-y-2 text-sm text-foreground">
                {[
                  'Aprovar ou rejeitar broncas da sua cidade',
                  'Moderar atualizações de moradores',
                  'Manter a plataforma com qualidade',
                ].map((item, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            {/* Ações */}
            <div className="px-6 py-5 space-y-3">
              {user ? (
                // Já logado — aceitar direto
                <Button
                  className="w-full gap-2"
                  onClick={() => setPhase('accepting')}
                >
                  <ShieldCheck className="w-4 h-4" />
                  Aceitar convite
                  <ArrowRight className="w-4 h-4" />
                </Button>
              ) : (
                <>
                  <Button
                    className="w-full gap-2"
                    onClick={() => navigate(`/login?redirect=/convite/${token}`)}
                  >
                    Entrar e aceitar convite
                    <ArrowRight className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="outline"
                    className="w-full gap-2"
                    onClick={() => navigate(`/cadastro?redirect=/convite/${token}`)}
                  >
                    Criar conta e aceitar
                  </Button>
                </>
              )}
              {preview?.expires_at && (
                <p className="text-xs text-muted-foreground text-center">
                  Convite válido até {new Date(preview.expires_at).toLocaleDateString('pt-BR')}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const Screen = ({ children }) => (
  <div className="min-h-screen flex flex-col items-center justify-center bg-background px-4 text-center">
    {children}
  </div>
);

export default AcceptInvitePage;
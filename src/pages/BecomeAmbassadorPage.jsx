import { useState, useMemo } from 'react';
import { Helmet } from 'react-helmet';
import { useNavigate } from 'react-router-dom';
import { ShieldCheck, MapPin, CheckCircle2, Loader2, Search, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/use-toast';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useCity } from '@/contexts/CityContext';
import { supabase } from '@/lib/customSupabaseClient';

const normStr = (s) => (s || '').toLowerCase().normalize('NFD').replace(/\p{Mn}/gu, '');
const isValidEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((e || '').trim());

const BecomeAmbassadorPage = () => {
  const { user, signUp, signIn, refreshUserProfile } = useAuth();
  const { cities, loadingCities } = useCity();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [motivation, setMotivation] = useState('');
  const [selectedCityId, setSelectedCityId] = useState('');
  const [selectedCityLabel, setSelectedCityLabel] = useState('');
  const [citySearch, setCitySearch] = useState('');
  const [cityDropOpen, setCityDropOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const filteredCities = useMemo(() => {
    const term = normStr(citySearch.trim());
    if (!term) return cities.slice(0, 50);
    return cities
      .filter((c) => normStr(c.name).includes(term) || normStr(c.state?.uf || '').includes(term))
      .slice(0, 50);
  }, [cities, citySearch]);

  const selectCity = (city) => {
    setSelectedCityId(String(city.id));
    setSelectedCityLabel(`${city.name}${city.state?.uf ? ` (${city.state.uf})` : ''}`);
    setCitySearch('');
    setCityDropOpen(false);
  };

  const insertApplication = async (uid, applicantName, applicantEmail) => {
    // Guard: já é embaixador ativo desta cidade?
    const { data: active } = await supabase
      .from('ambassador_cities')
      .select('id')
      .eq('user_id', uid)
      .eq('city_id', Number(selectedCityId))
      .eq('status', 'active')
      .maybeSingle();
    if (active) {
      toast({ title: 'Você já é embaixador ativo desta cidade.', variant: 'destructive' });
      return false;
    }
    // Guard: candidatura pendente duplicada?
    const { data: pend } = await supabase
      .from('ambassador_applications')
      .select('id')
      .eq('user_id', uid)
      .eq('city_id', Number(selectedCityId))
      .eq('status', 'pending')
      .maybeSingle();
    if (pend) {
      toast({ title: 'Você já tem uma candidatura em análise para esta cidade.', variant: 'destructive' });
      return false;
    }
    const { error } = await supabase.from('ambassador_applications').insert({
      user_id: uid,
      city_id: Number(selectedCityId),
      applicant_name: applicantName,
      applicant_email: applicantEmail,
      motivation: motivation.trim() || null,
      status: 'pending',
    });
    if (error) {
      toast({ title: 'Erro ao enviar candidatura', description: error.message, variant: 'destructive' });
      return false;
    }
    return true;
  };

  const handleSubmit = async () => {
    if (!selectedCityId) {
      toast({ title: 'Selecione sua cidade', variant: 'destructive' });
      return;
    }
    setSubmitting(true);
    try {
      if (user) {
        const ok = await insertApplication(user.id, user.name || null, user.email || null);
        if (ok) setDone(true);
      } else {
        // valida campos de cadastro
        if (!name.trim() || !isValidEmail(email) || password.length < 6) {
          toast({ title: 'Preencha nome, e-mail válido e senha (mín. 6).', variant: 'destructive' });
          setSubmitting(false);
          return;
        }
        const { error } = await signUp(email.trim(), password, {
          data: { name: name.trim(), avatar_type: 'generated', avatar_url: null },
        });
        if (error) {
          toast({ title: 'Erro ao criar conta', description: error.message, variant: 'destructive' });
          setSubmitting(false);
          return;
        }
        // Tenta autenticar na hora (mesmo padrão do RegisterPage). Se a confirmação
        // de e-mail estiver ativa, pode não haver sessão — tratamos abaixo.
        await signIn(email.trim(), password);
        const { data: sessionData } = await supabase.auth.getSession();
        const uid = sessionData?.session?.user?.id;
        if (!uid) {
          toast({
            title: 'Confirme seu e-mail para concluir',
            description: 'Criamos sua conta. Confirme o e-mail, faça login e candidate-se novamente nesta página.',
          });
          setSubmitting(false);
          return;
        }
        if (refreshUserProfile) await refreshUserProfile();
        const ok = await insertApplication(uid, name.trim(), email.trim());
        if (ok) setDone(true);
      }
    } finally {
      setSubmitting(false);
    }
  };

  // Embaixador já aprovado: não pode se candidatar novamente em outra cidade
  if (user?.is_ambassador) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background px-4 text-center">
        <div className="w-20 h-20 rounded-full bg-orange-100 flex items-center justify-center mb-6">
          <ShieldCheck className="w-10 h-10 text-orange-600" />
        </div>
        <h1 className="text-2xl font-bold mb-2">Você já é um Embaixador</h1>
        <p className="text-muted-foreground max-w-sm mb-8">
          Você já foi aprovado como embaixador do Trombone Cidadão. Acesse seu painel para moderar o conteúdo da sua cidade.
        </p>
        <div className="flex flex-col sm:flex-row gap-3">
          <Button onClick={() => navigate('/embaixador')}>Ir para o Painel do Embaixador</Button>
          <Button variant="outline" onClick={() => navigate('/')}>Voltar ao início</Button>
        </div>
      </div>
    );
  }

  if (done) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background px-4 text-center">
        <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center mb-6">
          <CheckCircle2 className="w-10 h-10 text-green-600" />
        </div>
        <h1 className="text-2xl font-bold mb-2">Recebemos sua candidatura!</h1>
        <p className="text-muted-foreground max-w-sm mb-8">
          Nosso time vai avaliar e você será notificado. Obrigado por querer ajudar sua cidade.
        </p>
        <Button onClick={() => navigate('/')}>Voltar ao início</Button>
      </div>
    );
  }

  return (
    <>
      <Helmet><title>Seja um Embaixador - Trombone Cidadão</title></Helmet>

      {/* HERO / BANNER */}
      <div className="relative text-white overflow-hidden">
        <picture>
          <source media="(min-width: 768px)" srcSet="/embaixador-desktop.png" />
          <img
            src="/embaixador-mobile.png"
            alt=""
            className="absolute inset-0 w-full h-full object-cover"
          />
        </picture>
        <div className="absolute inset-0 bg-gradient-to-br from-tc-red/90 via-tc-red/75 to-tc-red/60" />
        <div className="relative max-w-4xl mx-auto px-6 py-16 md:py-24 text-center">
          <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/15 text-sm font-semibold mb-5">
            <ShieldCheck className="w-4 h-4" /> Programa de Embaixadores
          </span>
          <h1 className="text-3xl md:text-5xl font-extrabold mb-4">Seja um Embaixador do Trombone Cidadão</h1>
          <p className="text-white/90 text-base md:text-lg max-w-2xl mx-auto mb-8">
            Ajude a manter sua cidade com informação de qualidade: modere broncas, valide atualizações e faça a diferença perto de você.
          </p>
          <Button
            size="lg"
            className="bg-white text-tc-red hover:bg-white/90"
            onClick={() => document.getElementById('form-candidatura')?.scrollIntoView({ behavior: 'smooth' })}
          >
            Quero participar <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        </div>
      </div>

      {/* BENEFÍCIOS */}
      <div className="max-w-4xl mx-auto px-6 py-12 grid gap-4 sm:grid-cols-3">
        {[
          ['Aprove broncas', 'Você revisa e aprova as broncas da sua cidade.'],
          ['Modere atualizações', 'Garante que as atualizações dos moradores sejam confiáveis.'],
          ['Fortaleça sua cidade', 'Mais qualidade e engajamento onde você vive.'],
        ].map(([t, d]) => (
          <div key={t} className="rounded-2xl border border-border p-5 bg-card">
            <CheckCircle2 className="w-6 h-6 text-tc-red mb-2" />
            <p className="font-bold mb-1">{t}</p>
            <p className="text-sm text-muted-foreground">{d}</p>
          </div>
        ))}
      </div>

      {/* FORM */}
      <div id="form-candidatura" className="max-w-xl mx-auto px-6 pb-20">
        <div className="rounded-2xl border border-border bg-card p-6 shadow-sm space-y-4">
          <h2 className="text-xl font-bold">Candidate-se</h2>

          {!user && (
            <>
              <div>
                <label className="block text-sm font-medium mb-1.5">Nome <span className="text-red-500">*</span></label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Seu nome" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5">E-mail <span className="text-red-500">*</span></label>
                <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="voce@email.com" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5">Senha <span className="text-red-500">*</span></label>
                <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="mín. 6 caracteres" />
              </div>
              <p className="text-xs text-muted-foreground">
                Já tem conta?{' '}
                <button type="button" className="text-tc-red font-semibold" onClick={() => navigate('/login')}>Entrar</button>
              </p>
            </>
          )}

          {user && (
            <p className="text-sm text-muted-foreground">
              Candidatando-se como <span className="font-semibold text-foreground">{user.name || user.email}</span>.
            </p>
          )}

          {/* Cidade */}
          <div>
            <label className="block text-sm font-medium mb-1.5">Cidade <span className="text-red-500">*</span></label>
            {loadingCities ? (
              <div className="flex items-center gap-2 text-muted-foreground text-sm">
                <Loader2 className="w-4 h-4 animate-spin" /> Carregando cidades...
              </div>
            ) : (
              <div className="relative">
                <div className="flex items-center gap-2 border border-input rounded-md px-3 py-2 bg-background">
                  <Search className="w-4 h-4 text-muted-foreground shrink-0" />
                  <input
                    type="text"
                    className="flex-1 bg-transparent outline-none text-sm"
                    placeholder={selectedCityLabel || 'Buscar cidade...'}
                    value={citySearch}
                    onChange={(e) => { setCitySearch(e.target.value); setCityDropOpen(true); }}
                    onFocus={() => setCityDropOpen(true)}
                    onBlur={() => setTimeout(() => setCityDropOpen(false), 150)}
                  />
                </div>
                {cityDropOpen && (
                  <div className="absolute z-50 w-full mt-1 bg-popover border border-border rounded-md shadow-lg max-h-60 overflow-y-auto">
                    {filteredCities.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-4">Nenhuma cidade encontrada.</p>
                    ) : (
                      filteredCities.map((city) => (
                        <button
                          key={city.id}
                          type="button"
                          onMouseDown={() => selectCity(city)}
                          className="w-full text-left px-3 py-2 text-sm hover:bg-accent flex items-center gap-2"
                        >
                          <MapPin className="w-3.5 h-3.5 text-muted-foreground" />
                          {city.name}{city.state?.uf ? ` (${city.state.uf})` : ''}
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Motivo */}
          <div>
            <label className="block text-sm font-medium mb-1.5">Por que quer ser embaixador?</label>
            <textarea
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm min-h-[100px]"
              value={motivation}
              onChange={(e) => setMotivation(e.target.value)}
              placeholder="Conte por que você quer ajudar sua cidade..."
            />
          </div>

          <Button className="w-full" disabled={submitting} onClick={handleSubmit}>
            {submitting ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Enviando...</> : 'Enviar candidatura'}
          </Button>
        </div>
      </div>
    </>
  );
};

export default BecomeAmbassadorPage;

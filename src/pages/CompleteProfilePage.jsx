import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useLocation, Navigate, Link } from 'react-router-dom';
import { Helmet } from 'react-helmet';
import { ShieldCheck, Loader2, Search, MapPin } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { supabase } from '@/lib/customSupabaseClient';
import { formatPhone } from '@/lib/utils';
import { showAppError } from '@/lib/appError';
import { Capacitor } from '@capacitor/core';
import { resolvePostAuthFallback } from '@/lib/homeEntry';

const postAuthFallback = resolvePostAuthFallback({ isNative: Capacitor.isNativePlatform() });

const norm = (s) => (s || '').toLowerCase().normalize('NFD').replace(/\p{Mn}/gu, '');

const CompleteProfilePage = () => {
  const { user, loading: authLoading, refreshUserProfile } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [stateId, setStateId] = useState('');
  const [cityId, setCityId] = useState('');
  const [cityLabel, setCityLabel] = useState('');
  const [citySearch, setCitySearch] = useState('');
  const [cityOpen, setCityOpen] = useState(false);
  const [terms, setTerms] = useState(false);

  const [states, setStates] = useState([]);
  const [cities, setCities] = useState([]);
  const [saving, setSaving] = useState(false);

  // Prefill com o que já existir (nome do Google, etc.)
  useEffect(() => {
    if (user?.name) setName(user.name);
    else if (user?.user_metadata?.name) setName(user.user_metadata.name);
  }, [user]);

  useEffect(() => {
    supabase.from('states').select('*').order('name').then(({ data }) => setStates(data || []));
  }, []);

  useEffect(() => {
    if (!stateId) { setCities([]); return; }
    supabase.from('cities').select('*').eq('state_id', stateId).order('name').then(({ data }) => setCities(data || []));
    // trocou de estado → limpa cidade
    setCityId('');
    setCityLabel('');
  }, [stateId]);

  const filteredCities = useMemo(() => {
    const term = norm(citySearch.trim());
    if (!term) return cities.slice(0, 50);
    return cities.filter((c) => norm(c.name).includes(term)).slice(0, 50);
  }, [cities, citySearch]);

  // Se o profile já está completo, não faz sentido estar aqui.
  const alreadyComplete = user && user.phone && user.city_id && user.terms_accepted_at;

  const handleSave = async () => {
    if (!name.trim()) { showAppError({ title: 'Informe seu nome', variant: 'destructive' }); return; }
    const phoneDigits = phone.replace(/\D/g, '');
    if (phoneDigits.length < 10) { showAppError({ title: 'Informe um telefone válido', variant: 'destructive' }); return; }
    if (!stateId || !cityId) { showAppError({ title: 'Selecione estado e cidade', variant: 'destructive' }); return; }
    if (!terms) { showAppError({ title: 'Aceite os termos de uso para continuar', variant: 'destructive' }); return; }

    setSaving(true);
    const selectedCity = cities.find((c) => String(c.id) === String(cityId));
    const { error } = await supabase
      .from('profiles')
      .update({
        name: name.trim(),
        phone: phoneDigits,
        state_id: Number(stateId),
        city_id: Number(cityId),
        city: selectedCity ? selectedCity.name : null,
        terms_accepted_at: new Date().toISOString(),
      })
      .eq('id', user.id);
    setSaving(false);

    if (error) {
      showAppError({ title: 'Erro ao salvar', description: error.message, variant: 'destructive' });
      return;
    }
    if (refreshUserProfile) await refreshUserProfile();
    // volta para onde o usuário queria ir, ou o painel
    const from = location.state?.from?.pathname;
    navigate(from && from !== '/completar-cadastro' ? from : postAuthFallback, { replace: true });
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  if (alreadyComplete) return <Navigate to={postAuthFallback} replace />;

  return (
    <>
      <Helmet><title>Completar cadastro - Trombone Cidadão</title></Helmet>
      <div className="min-h-screen bg-gradient-to-b from-background to-muted/30 flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-md">
          <div className="flex justify-center mb-6">
            <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-tc-red/10 text-tc-red text-sm font-semibold border border-tc-red/20">
              <ShieldCheck className="w-4 h-4" /> Complete seu cadastro
            </span>
          </div>

          <div className="bg-card border border-border rounded-2xl shadow-lg p-6 space-y-4">
            <p className="text-sm text-muted-foreground">
              Falta pouco! Precisamos de alguns dados para você usar o Trombone Cidadão.
            </p>

            <div>
              <Label>Nome <span className="text-red-500">*</span></Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Seu nome" className="mt-1" />
            </div>

            <div>
              <Label>Telefone <span className="text-red-500">*</span></Label>
              <Input
                value={formatPhone(phone)}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="(00) 00000-0000"
                inputMode="tel"
                className="mt-1"
              />
            </div>

            <div>
              <Label>Estado <span className="text-red-500">*</span></Label>
              <select
                value={stateId}
                onChange={(e) => setStateId(e.target.value)}
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="">Selecione o estado</option>
                {states.map((s) => (
                  <option key={s.id} value={s.id}>{s.name} ({s.uf})</option>
                ))}
              </select>
            </div>

            <div>
              <Label>Cidade <span className="text-red-500">*</span></Label>
              <div className="relative mt-1">
                <div className="flex items-center gap-2 border border-input rounded-md px-3 py-2 bg-background">
                  <Search className="w-4 h-4 text-muted-foreground shrink-0" />
                  <input
                    type="text"
                    disabled={!stateId}
                    className="flex-1 bg-transparent outline-none text-sm disabled:opacity-50"
                    placeholder={cityLabel || (stateId ? 'Buscar cidade...' : 'Escolha o estado primeiro')}
                    value={citySearch}
                    onChange={(e) => { setCitySearch(e.target.value); setCityOpen(true); }}
                    onFocus={() => setCityOpen(true)}
                    onBlur={() => setTimeout(() => setCityOpen(false), 150)}
                  />
                </div>
                {cityOpen && stateId && (
                  <div className="absolute z-50 w-full mt-1 bg-popover border border-border rounded-md shadow-lg max-h-56 overflow-y-auto">
                    {filteredCities.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-3">Nenhuma cidade encontrada.</p>
                    ) : (
                      filteredCities.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          onMouseDown={() => { setCityId(String(c.id)); setCityLabel(c.name); setCitySearch(''); setCityOpen(false); }}
                          className="w-full text-left px-3 py-2 text-sm hover:bg-accent flex items-center gap-2"
                        >
                          <MapPin className="w-3.5 h-3.5 text-muted-foreground" />
                          {c.name}
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
            </div>

            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" checked={terms} onChange={(e) => setTerms(e.target.checked)} className="mt-1" />
              <span className="text-muted-foreground">
                Li e aceito os{' '}
                <Link to="/termos-de-uso" target="_blank" className="text-tc-red font-semibold hover:underline">Termos de Uso</Link>.
              </span>
            </label>

            <Button className="w-full" disabled={saving} onClick={handleSave}>
              {saving ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Salvando...</> : 'Concluir cadastro'}
            </Button>
          </div>
        </div>
      </div>
    </>
  );
};

export default CompleteProfilePage;

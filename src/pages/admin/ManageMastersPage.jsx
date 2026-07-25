import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Helmet } from 'react-helmet';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import {
  ArrowLeft, Copy, Check, X, Search,
  MapPin, Loader2, Link2, Users, PlusCircle, AlertCircle, Clock, RotateCw, Eye
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/use-toast';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { supabase } from '@/lib/customSupabaseClient';
import { useCity } from '@/contexts/CityContext';
import { Navigate } from 'react-router-dom';

// ────────────────────────────────────────────────────────────────────────────────
// Sub-component: Criar convite de embaixador
// ────────────────────────────────────────────────────────────────────────────────
const normStr = (s) => (s || '').toLowerCase().normalize('NFD').replace(/\p{Mn}/gu, '');
const isValidEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((e || '').trim());

const CreateInviteSection = ({ user }) => {
  const { toast } = useToast();
  const { cities, loadingCities } = useCity();
  const [selectedCityId, setSelectedCityId] = useState('');
  const [selectedCityLabel, setSelectedCityLabel] = useState('');
  const [citySearch, setCitySearch] = useState('');
  const [cityDropOpen, setCityDropOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [generatedLink, setGeneratedLink] = useState(null);
  const [copied, setCopied] = useState(false);
  const [existingPendingInvite, setExistingPendingInvite] = useState(null);
  const [checkingDuplicate, setCheckingDuplicate] = useState(false);
  const latestCityIdRef = useRef(null);

  const filteredCities = useMemo(() => {
    const term = normStr(citySearch.trim());
    if (!term) return cities.slice(0, 50);
    return cities
      .filter(c => normStr(c.name).includes(term) || normStr(c.state?.uf || '').includes(term))
      .slice(0, 50);
  }, [cities, citySearch]);

  const handleSelectCity = async (city) => {
    const requestedCityId = String(city.id);
    latestCityIdRef.current = requestedCityId;

    setSelectedCityId(requestedCityId);
    setSelectedCityLabel(`${city.name}${city.state?.uf ? ` (${city.state.uf})` : ''}`);
    setCitySearch('');
    setCityDropOpen(false);
    setExistingPendingInvite(null);

    setCheckingDuplicate(true);
    const { data, error } = await supabase
      .from('ambassador_invites')
      .select('id, created_at')
      .eq('city_id', city.id)
      .eq('status', 'pending')
      .limit(1)
      .maybeSingle();

    // Guard against stale responses: only apply state updates if this request still matches the latest selection
    if (latestCityIdRef.current === requestedCityId) {
      setCheckingDuplicate(false);
      if (!error && data) {
        setExistingPendingInvite(data);
      }
    }
  };

  const handleGenerateInvite = async () => {
    if (!selectedCityId) {
      toast({ title: 'Selecione uma cidade', variant: 'destructive' });
      return;
    }
    if (!isValidEmail(inviteEmail)) {
      toast({ title: 'Informe um e-mail válido para o convite', variant: 'destructive' });
      return;
    }
    setSubmitting(true);

    const { data: dup } = await supabase
      .from('ambassador_invites')
      .select('id')
      .eq('city_id', Number(selectedCityId))
      .eq('invited_email', inviteEmail.trim())
      .eq('status', 'pending')
      .limit(1)
      .maybeSingle();
    if (dup) {
      toast({ title: 'Já existe um convite pendente para este e-mail nesta cidade', variant: 'destructive' });
      setSubmitting(false);
      return;
    }

    // Generate a random token
    const token = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2) + Date.now().toString(36);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(); // 7 days

    const insertData = {
      token,
      city_id: Number(selectedCityId),
      invited_by: user.id,
      status: 'pending',
      expires_at: expiresAt,
      invited_email: inviteEmail.trim(),
    };

    const { error } = await supabase
      .from('ambassador_invites')
      .insert(insertData);

    if (error) {
      toast({ title: 'Erro ao gerar convite', description: error.message, variant: 'destructive' });
    } else {
      const link = `${window.location.origin}/convite/${token}`;
      setGeneratedLink(link);
      setSelectedCityId('');
      setSelectedCityLabel('');
      setInviteEmail('');
      setExistingPendingInvite(null);
      toast({ title: 'Convite gerado com sucesso!' });
    }
    setSubmitting(false);
  };

  const handleRevokeAndCreate = async () => {
    if (!existingPendingInvite) return;
    setSubmitting(true);
    const { error } = await supabase
      .from('ambassador_invites')
      .update({ status: 'revoked' })
      .eq('id', existingPendingInvite.id);

    if (error) {
      toast({ title: 'Erro ao revogar convite existente', description: error.message, variant: 'destructive' });
      setSubmitting(false);
      return;
    }
    setExistingPendingInvite(null);
    await handleGenerateInvite();
  };

  const handleCancelDuplicate = () => {
    setSelectedCityId('');
    setSelectedCityLabel('');
    setExistingPendingInvite(null);
  };

  const handleCopy = async () => {
    if (!generatedLink) return;
    try {
      await navigator.clipboard.writeText(generatedLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast({ title: 'Link copiado!' });
    } catch {
      toast({ title: 'Erro ao copiar', variant: 'destructive' });
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base md:text-lg">
          <Link2 className="w-5 h-5 text-tc-red" />
          Criar Convite de Embaixador
        </CardTitle>
        <CardDescription>
          Gere um link de convite para um novo embaixador de uma cidade.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1.5">Cidade <span className="text-red-500">*</span></label>
          {loadingCities ? (
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <Loader2 className="w-4 h-4 animate-spin" /> Carregando cidades...
            </div>
          ) : (
            <div className="relative">
              <div className="flex items-center gap-2 border border-input rounded-md px-3 py-2 bg-background focus-within:ring-2 focus-within:ring-ring">
                <Search className="w-4 h-4 text-muted-foreground shrink-0" />
                <input
                  type="text"
                  className="flex-1 bg-transparent outline-none text-sm placeholder:text-muted-foreground"
                  placeholder={selectedCityLabel || 'Buscar cidade...'}
                  value={citySearch}
                  onChange={e => { setCitySearch(e.target.value); setCityDropOpen(true); }}
                  onFocus={() => setCityDropOpen(true)}
                  onBlur={() => setTimeout(() => setCityDropOpen(false), 150)}
                />
                {selectedCityId && !citySearch && (
                  <button type="button" onClick={() => { setSelectedCityId(''); setSelectedCityLabel(''); }} className="text-muted-foreground hover:text-foreground">
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              {cityDropOpen && (
                <div className="absolute z-50 w-full mt-1 bg-popover border border-border rounded-md shadow-lg max-h-60 overflow-y-auto">
                  {filteredCities.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">Nenhuma cidade encontrada.</p>
                  ) : (
                    filteredCities.map(city => (
                      <button
                        key={city.id}
                        type="button"
                        onMouseDown={() => handleSelectCity(city)}
                        className={`w-full text-left px-3 py-2 text-sm hover:bg-accent transition-colors flex items-center justify-between ${String(city.id) === selectedCityId ? 'font-semibold text-primary' : ''}`}
                      >
                        <span>{city.name}{city.state?.uf ? ` (${city.state.uf})` : ''}</span>
                        {String(city.id) === selectedCityId && <Check className="w-3.5 h-3.5 text-primary" />}
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium mb-1.5">E-mail do convidado <span className="text-red-500">*</span></label>
          <Input
            type="email"
            placeholder="email@exemplo.com"
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
          />
        </div>

        {existingPendingInvite ? (
          <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl space-y-3">
            <p className="text-sm font-semibold text-amber-800 flex items-center gap-2">
              <AlertCircle className="w-4 h-4" />
              Já existe um convite pendente para {selectedCityLabel}, criado em{' '}
              {new Date(existingPendingInvite.created_at).toLocaleDateString('pt-BR')}.
            </p>
            <div className="flex flex-col sm:flex-row gap-2">
              <Button
                onClick={handleRevokeAndCreate}
                disabled={submitting}
                variant="outline"
                className="border-amber-300 hover:bg-amber-100"
              >
                {submitting ? (
                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Processando...</>
                ) : (
                  'Revogar e criar novo'
                )}
              </Button>
              <Button onClick={handleCancelDuplicate} variant="ghost">
                Cancelar
              </Button>
            </div>
          </div>
        ) : (
          <Button
            onClick={handleGenerateInvite}
            disabled={submitting || !selectedCityId || checkingDuplicate || !isValidEmail(inviteEmail)}
            className="w-full sm:w-auto"
          >
            {submitting ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Gerando...</>
            ) : checkingDuplicate ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Verificando...</>
            ) : (
              <><PlusCircle className="w-4 h-4 mr-2" /> Gerar Convite</>
            )}
          </Button>
        )}

        {generatedLink && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-4 p-4 bg-green-50 border border-green-200 rounded-xl space-y-3"
          >
            <p className="text-sm font-semibold text-green-800 flex items-center gap-2">
              <Check className="w-4 h-4" /> Convite gerado!
            </p>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-xs bg-white border border-green-200 rounded-lg p-2 break-all text-green-900">
                {generatedLink}
              </code>
              <Button
                variant="outline"
                size="icon"
                onClick={handleCopy}
                className="shrink-0 border-green-300 hover:bg-green-100"
              >
                {copied ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
              </Button>
            </div>
            <p className="text-xs text-green-700">Este link expira em 7 dias.</p>
          </motion.div>
        )}
      </CardContent>
    </Card>
  );
};

// ────────────────────────────────────────────────────────────────────────────────
// Sub-component: Convites pendentes
// ────────────────────────────────────────────────────────────────────────────────
const PendingInvitesSection = () => {
  const { toast } = useToast();
  const [invites, setInvites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [revokingId, setRevokingId] = useState(null);
  const [resendingId, setResendingId] = useState(null);

  const fetchInvites = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('ambassador_invites')
      .select('id, city_id, invited_email, created_at, expires_at, cities(name, states(uf))')
      .eq('status', 'pending')
      .order('created_at', { ascending: false });

    if (error) {
      toast({ title: 'Erro ao buscar convites', description: error.message, variant: 'destructive' });
    } else {
      setInvites(data || []);
    }
    setLoading(false);
  }, [toast]);

  useEffect(() => {
    fetchInvites();
  }, [fetchInvites]);

  const handleRevoke = async (inviteId) => {
    setRevokingId(inviteId);
    const { error } = await supabase
      .from('ambassador_invites')
      .update({ status: 'revoked' })
      .eq('id', inviteId);

    if (error) {
      toast({ title: 'Erro ao revogar convite', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Convite revogado.' });
      fetchInvites();
    }
    setRevokingId(null);
  };

  const handleResend = async (inviteId) => {
    setResendingId(inviteId);
    const newExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const { error } = await supabase
      .from('ambassador_invites')
      .update({ expires_at: newExpiresAt })
      .eq('id', inviteId);

    if (error) {
      toast({ title: 'Erro ao reenviar convite', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Validade do convite estendida por mais 7 dias.' });
      fetchInvites();
    }
    setResendingId(null);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 gap-3">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        <span className="text-muted-foreground">Carregando convites...</span>
      </div>
    );
  }

  if (invites.length === 0) {
    return (
      <Card className="border-dashed border-2 py-12 text-center bg-muted/20">
        <CardContent className="flex flex-col items-center gap-3">
          <Clock className="w-10 h-10 text-muted-foreground" />
          <p className="text-lg font-semibold text-muted-foreground">Nenhum convite pendente</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {invites.map((inv) => (
        <motion.div
          key={inv.id}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <Card className="border-border">
            <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm md:text-base truncate">
                  {inv.cities?.name || '—'} {inv.cities?.states?.uf ? `(${inv.cities.states.uf})` : ''}
                </p>
                <div className="flex flex-wrap gap-3 mt-1 text-xs text-muted-foreground">
                  <span>{inv.invited_email || 'Sem e-mail informado'}</span>
                  <span>Criado em: {new Date(inv.created_at).toLocaleDateString('pt-BR')}</span>
                  <span>Expira em: {new Date(inv.expires_at).toLocaleDateString('pt-BR')}</span>
                </div>
              </div>
              <div className="flex gap-2 shrink-0">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 px-3 text-xs"
                  disabled={resendingId === inv.id}
                  onClick={() => handleResend(inv.id)}
                >
                  {resendingId === inv.id ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <><RotateCw className="w-3 h-3 mr-1" /> Reenviar</>
                  )}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 px-3 text-xs text-red-600 border-red-300 hover:bg-red-50"
                  disabled={revokingId === inv.id}
                  onClick={() => handleRevoke(inv.id)}
                >
                  {revokingId === inv.id ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <><X className="w-3 h-3 mr-1" /> Revogar</>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      ))}
    </div>
  );
};

// ────────────────────────────────────────────────────────────────────────────────
// Sub-component: Embaixadores ativos
// ────────────────────────────────────────────────────────────────────────────────
const ActiveAmbassadorsSection = () => {
  const { toast } = useToast();
  const [ambassadors, setAmbassadors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [suspendingId, setSuspendingId] = useState(null);

  const fetchAmbassadors = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('ambassador_cities')
      .select('id, user_id, city_id, status, created_at, cities(name, state_id, states(uf))')
      .eq('status', 'active')
      .order('created_at', { ascending: false });

    if (error) {
      toast({ title: 'Erro ao buscar embaixadores', description: error.message, variant: 'destructive' });
      setLoading(false);
      return;
    }

    const userIds = [...new Set((data || []).map(ac => ac.user_id))];
    let profilesById = {};
    if (userIds.length > 0) {
      const { data: profilesData, error: profilesError } = await supabase
        .from('profiles')
        .select('id, name')
        .in('id', userIds);
      if (profilesError) {
        toast({ title: 'Erro ao buscar perfis dos embaixadores', description: profilesError.message, variant: 'destructive' });
      } else {
        profilesById = Object.fromEntries((profilesData || []).map(p => [p.id, p]));
      }
    }

    setAmbassadors((data || []).map(ac => ({ ...ac, profiles: profilesById[ac.user_id] || null })));
    setLoading(false);
  }, [toast]);

  useEffect(() => {
    fetchAmbassadors();
  }, [fetchAmbassadors]);

  const handleSuspend = async (acId) => {
    setSuspendingId(acId);
    const { data, error } = await supabase
      .from('ambassador_cities')
      .update({ status: 'suspended' })
      .eq('id', acId)
      .select('id');

    if (error) {
      toast({ title: 'Erro ao suspender', description: error.message, variant: 'destructive' });
    } else if (!data || data.length === 0) {
      // UPDATE não afetou linhas — provavelmente RLS bloqueou (sem permissão)
      toast({
        title: 'Não foi possível suspender',
        description: 'Você não tem permissão para alterar este embaixador.',
        variant: 'destructive',
      });
    } else {
      toast({ title: 'Embaixador suspenso.' });
      fetchAmbassadors();
    }
    setSuspendingId(null);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 gap-3">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        <span className="text-muted-foreground">Carregando embaixadores...</span>
      </div>
    );
  }

  if (ambassadors.length === 0) {
    return (
      <Card className="border-dashed border-2 py-12 text-center bg-muted/20">
        <CardContent className="flex flex-col items-center gap-3">
          <Users className="w-10 h-10 text-muted-foreground" />
          <p className="text-lg font-semibold text-muted-foreground">Nenhum embaixador ativo</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {ambassadors.map((ac) => (
        <motion.div
          key={ac.id}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <Card className="border-border">
            <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm md:text-base truncate">
                  {ac.profiles?.name || 'Usuário desconhecido'}
                </p>
                <div className="flex flex-wrap gap-3 mt-1 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <MapPin className="w-3 h-3" />
                    {ac.cities?.name || '—'} {ac.cities?.states?.uf ? `(${ac.cities.states.uf})` : ac.cities?.state?.uf ? `(${ac.cities.state.uf})` : ''}
                  </span>
                  <span>Desde: {new Date(ac.created_at).toLocaleDateString('pt-BR')}</span>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Button asChild size="sm" variant="outline" className="h-8 px-3 text-xs">
                  <Link to={`/admin/embaixador/${ac.user_id}`}>
                    <Eye className="w-3 h-3 mr-1" /> Ver perfil
                  </Link>
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 px-3 text-xs text-orange-600 border-orange-300 hover:bg-orange-50"
                  disabled={suspendingId === ac.id}
                  onClick={() => handleSuspend(ac.id)}
                >
                  {suspendingId === ac.id ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <><X className="w-3 h-3 mr-1" /> Suspender</>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      ))}
    </div>
  );
};

// ────────────────────────────────────────────────────────────────────────────────
// Sub-component: Candidaturas de embaixador
// ────────────────────────────────────────────────────────────────────────────────
const ApplicationsSection = () => {
  const { toast } = useToast();
  const [apps, setApps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState(null);
  const [expandedId, setExpandedId] = useState(null);

  const fetchApps = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('ambassador_applications')
      .select('id, user_id, city_id, applicant_name, applicant_email, motivation, created_at, cities(name, states(uf))')
      .eq('status', 'pending')
      .order('created_at', { ascending: true });
    if (error) toast({ title: 'Erro ao buscar candidaturas', description: error.message, variant: 'destructive' });
    else setApps(data || []);
    setLoading(false);
  }, [toast]);

  useEffect(() => { fetchApps(); }, [fetchApps]);

  // Dispara o e-mail de status ao candidato (best-effort — não bloqueia a ação)
  const sendApplicationEmail = async (app, status, rejectionReason) => {
    try {
      await supabase.functions.invoke('send-ambassador-application-email', {
        body: {
          userId: app.user_id,
          status,
          cityName: app.cities?.name || null,
          applicantName: app.applicant_name || null,
          applicantEmail: app.applicant_email || null,
          rejectionReason: rejectionReason || null,
        },
      });
    } catch (e) {
      console.error('Falha ao enviar e-mail de candidatura:', e);
    }
  };

  const handleApprove = async (app) => {
    setActionId(`${app.id}-approve`);
    const { error } = await supabase.rpc('approve_ambassador_application', { p_app_id: app.id });
    if (error) toast({ title: 'Erro ao aprovar', description: error.message, variant: 'destructive' });
    else {
      toast({ title: 'Embaixador aprovado!' });
      sendApplicationEmail(app, 'approved');
      fetchApps();
    }
    setActionId(null);
  };

  const handleReject = async (app) => {
    const reason = window.prompt('Motivo da rejeição (opcional):') || null;
    setActionId(`${app.id}-reject`);
    const { error } = await supabase
      .from('ambassador_applications')
      .update({ status: 'rejected', rejection_reason: reason, reviewed_at: new Date().toISOString() })
      .eq('id', app.id);
    if (error) { toast({ title: 'Erro ao rejeitar', description: error.message, variant: 'destructive' }); setActionId(null); return; }
    await supabase.from('notifications').insert({
      user_id: app.user_id,
      type: 'ambassador_application',
      title: 'Candidatura não aprovada',
      message: 'Sua candidatura a embaixador não foi aprovada' + (reason ? `: ${reason}` : '.'),
      is_read: false,
    });
    sendApplicationEmail(app, 'rejected', reason);
    toast({ title: 'Candidatura rejeitada.' });
    fetchApps();
    setActionId(null);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 gap-3">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        <span className="text-muted-foreground">Carregando candidaturas...</span>
      </div>
    );
  }
  if (apps.length === 0) {
    return (
      <Card className="border-dashed border-2 py-12 text-center bg-muted/20">
        <CardContent className="flex flex-col items-center gap-3">
          <Users className="w-10 h-10 text-muted-foreground" />
          <p className="text-lg font-semibold text-muted-foreground">Nenhuma candidatura pendente</p>
        </CardContent>
      </Card>
    );
  }
  return (
    <div className="space-y-3">
      {apps.map((app) => (
        <motion.div key={app.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
          <Card className="border-border">
            <CardContent className="p-4 space-y-2">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm md:text-base truncate">
                    {app.applicant_name || 'Candidato'}
                    <span className="text-muted-foreground font-normal"> · {app.cities?.name || '—'} {app.cities?.states?.uf ? `(${app.cities.states.uf})` : ''}</span>
                  </p>
                  <div className="flex flex-wrap gap-3 mt-1 text-xs text-muted-foreground">
                    <span>{app.applicant_email || 'Sem e-mail'}</span>
                    <span>{new Date(app.created_at).toLocaleDateString('pt-BR')}</span>
                  </div>
                </div>
                <div className="flex gap-2 shrink-0">
                  <Button size="sm" variant="outline" className="h-8 px-3 text-xs text-red-600 border-red-300 hover:bg-red-50"
                    disabled={!!actionId} onClick={() => handleReject(app)}>
                    {actionId === `${app.id}-reject` ? <Loader2 className="w-3 h-3 animate-spin" /> : <><X className="w-3 h-3 mr-1" /> Rejeitar</>}
                  </Button>
                  <Button size="sm" className="h-8 px-3 text-xs bg-green-600 hover:bg-green-700 text-white"
                    disabled={!!actionId} onClick={() => handleApprove(app)}>
                    {actionId === `${app.id}-approve` ? <Loader2 className="w-3 h-3 animate-spin" /> : <><Check className="w-3 h-3 mr-1" /> Aprovar</>}
                  </Button>
                </div>
              </div>
              {app.motivation && (
                <button type="button" className="text-left text-sm text-muted-foreground italic"
                  onClick={() => setExpandedId(expandedId === app.id ? null : app.id)}>
                  <span className={expandedId === app.id ? '' : 'line-clamp-2'}>"{app.motivation}"</span>
                </button>
              )}
            </CardContent>
          </Card>
        </motion.div>
      ))}
    </div>
  );
};

// ────────────────────────────────────────────────────────────────────────────────
// Main page
// ────────────────────────────────────────────────────────────────────────────────
const ManageMastersPage = () => {
  const { user } = useAuth();

  const canAccess = user && (user.is_master || user.is_admin);
  if (!canAccess) {
    return <Navigate to="/" replace />;
  }

  return (
    <>
      <Helmet>
        <title>Gestão de Masters e Embaixadores - Admin</title>
        <meta name="description" content="Gerencie masters e embaixadores da plataforma." />
      </Helmet>

      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-4 mb-10"
        >
          <Link to="/admin">
            <Button variant="outline" size="icon">
              <ArrowLeft className="w-4 h-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-3xl md:text-4xl font-bold text-tc-red">Gestão de Embaixadores</h1>
            <p className="mt-1 text-muted-foreground">Convites e embaixadores ativos.</p>
          </div>
        </motion.div>

        <Tabs defaultValue="invite" className="w-full">
          <TabsList className="grid w-full grid-cols-4 h-auto sm:h-10 bg-muted/50 rounded-lg mb-6">
            <TabsTrigger value="invite" className="gap-2 text-xs sm:text-sm">
              <Link2 className="w-4 h-4" />
              <span className="hidden sm:inline">Criar Convite</span>
              <span className="sm:hidden">Convite</span>
            </TabsTrigger>
            <TabsTrigger value="pending-invites" className="gap-2 text-xs sm:text-sm">
              <Clock className="w-4 h-4" />
              <span className="hidden sm:inline">Convites Pendentes</span>
              <span className="sm:hidden">Pendentes</span>
            </TabsTrigger>
            <TabsTrigger value="applications" className="gap-2 text-xs sm:text-sm">
              <Users className="w-4 h-4" />
              <span className="hidden sm:inline">Candidaturas</span>
              <span className="sm:hidden">Cand.</span>
            </TabsTrigger>
            <TabsTrigger value="ambassadors" className="gap-2 text-xs sm:text-sm">
              <Users className="w-4 h-4" />
              <span className="hidden sm:inline">Embaixadores Ativos</span>
              <span className="sm:hidden">Ativos</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="invite">
            <CreateInviteSection user={user} />
          </TabsContent>

          <TabsContent value="pending-invites">
            <PendingInvitesSection />
          </TabsContent>

          <TabsContent value="applications">
            <ApplicationsSection />
          </TabsContent>

          <TabsContent value="ambassadors">
            <ActiveAmbassadorsSection />
          </TabsContent>
        </Tabs>
      </div>
    </>
  );
};

export default ManageMastersPage;

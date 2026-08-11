import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Helmet } from 'react-helmet';
import { motion } from 'framer-motion';
import {
  ArrowLeft, Mail, Phone, MapPin, Calendar, ShieldCheck, Loader2,
  CheckCircle2, FileText, User,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/components/ui/use-toast';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { supabase } from '@/lib/customSupabaseClient';
import { Navigate } from 'react-router-dom';

const STATUS_LABEL = {
  active: { text: 'Ativo', cls: 'text-green-700 bg-green-100' },
  suspended: { text: 'Suspenso', cls: 'text-orange-700 bg-orange-100' },
  revoked: { text: 'Revogado', cls: 'text-red-700 bg-red-100' },
};

const AmbassadorProfilePage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user } = useAuth();

  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState(null);

  const canAccess = user && (user.is_master || user.is_admin);

  const fetchProfile = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc('get_ambassador_profile', { p_user: id });
    if (error) {
      toast({ title: 'Erro ao carregar perfil', description: error.message, variant: 'destructive' });
      setProfile(null);
    } else {
      setProfile(data);
    }
    setLoading(false);
  }, [id, toast]);

  useEffect(() => {
    if (canAccess) fetchProfile();
  }, [fetchProfile, canAccess]);

  const setCityStatus = async (acId, status) => {
    setActionId(`${acId}-${status}`);
    const { data, error } = await supabase
      .from('ambassador_cities')
      .update({ status })
      .eq('id', acId)
      .select('id');
    if (error) {
      toast({ title: 'Erro ao atualizar', description: error.message, variant: 'destructive' });
    } else if (!data || data.length === 0) {
      toast({ title: 'Sem permissão para alterar este embaixador.', variant: 'destructive' });
    } else {
      toast({ title: status === 'active' ? 'Embaixador reativado.' : 'Embaixador suspenso.' });
      fetchProfile();
    }
    setActionId(null);
  };

  if (!canAccess) return <Navigate to="/" replace />;

  return (
    <>
      <Helmet><title>Perfil do Embaixador - Admin</title></Helmet>

      <div className="container mx-auto px-4 py-8 max-w-3xl">
        <div className="flex items-center gap-3 mb-8">
          <Button variant="outline" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <h1 className="text-2xl md:text-3xl font-bold text-tc-red">Perfil do Embaixador</h1>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20 gap-3">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            <span className="text-muted-foreground">Carregando perfil...</span>
          </div>
        ) : !profile ? (
          <Card className="border-dashed border-2 py-16 text-center bg-muted/20">
            <CardContent className="flex flex-col items-center gap-3">
              <User className="w-10 h-10 text-muted-foreground" />
              <p className="text-lg font-semibold text-muted-foreground">Perfil não encontrado</p>
              <Button asChild variant="outline">
                <Link to="/admin/embaixadores">Voltar</Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
            {/* Cabeçalho */}
            <Card>
              <CardContent className="p-6 flex items-center gap-4">
                <div className="w-16 h-16 rounded-full bg-tc-red/10 flex items-center justify-center overflow-hidden shrink-0">
                  {profile.avatar_url ? (
                    <img src={profile.avatar_url} alt={profile.name || ''} className="w-full h-full object-cover" />
                  ) : (
                    <ShieldCheck className="w-8 h-8 text-tc-red" />
                  )}
                </div>
                <div className="min-w-0">
                  <h2 className="text-xl font-bold truncate">{profile.name || 'Sem nome'}</h2>
                  <p className="text-sm text-muted-foreground">
                    Embaixador desde {profile.created_at ? new Date(profile.created_at).toLocaleDateString('pt-BR') : '—'}
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Contato */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Contato</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="flex items-center gap-3">
                  <Mail className="w-4 h-4 text-muted-foreground shrink-0" />
                  {profile.email ? (
                    <a href={`mailto:${profile.email}`} className="text-tc-red hover:underline break-all">{profile.email}</a>
                  ) : <span className="text-muted-foreground">Não informado</span>}
                </div>
                <div className="flex items-center gap-3">
                  <Phone className="w-4 h-4 text-muted-foreground shrink-0" />
                  {profile.phone ? (
                    <a href={`tel:${profile.phone}`} className="text-tc-red hover:underline">{profile.phone}</a>
                  ) : <span className="text-muted-foreground">Não informado</span>}
                </div>
                {profile.city && (
                  <div className="flex items-center gap-3">
                    <MapPin className="w-4 h-4 text-muted-foreground shrink-0" />
                    <span>{profile.city}</span>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Métricas */}
            <div className="grid grid-cols-2 gap-4">
              <Card>
                <CardContent className="p-4 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center">
                    <MapPin className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold leading-none">
                      {(profile.cities || []).filter(c => c.status === 'active').length}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">Cidades ativas</p>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-green-100 text-green-700 flex items-center justify-center">
                    <FileText className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold leading-none">{profile.reports_moderated ?? 0}</p>
                    <p className="text-xs text-muted-foreground mt-1">Broncas na(s) cidade(s)</p>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Cidades */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Cidades onde atua</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {(profile.cities || []).length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nenhuma cidade.</p>
                ) : (
                  (profile.cities || []).map((c) => {
                    const st = STATUS_LABEL[c.status] || { text: c.status, cls: 'text-content-secondary bg-surface-sunken' };
                    return (
                      <div key={c.ac_id} className="flex items-center justify-between gap-3 border border-border rounded-xl px-3 py-2">
                        <div className="min-w-0">
                          <p className="font-medium text-sm truncate">
                            {c.city} {c.uf ? `(${c.uf})` : ''}
                          </p>
                          <p className="text-xs text-muted-foreground flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            Desde {c.since ? new Date(c.since).toLocaleDateString('pt-BR') : '—'}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className={`text-xs font-semibold px-2 py-1 rounded-full ${st.cls}`}>{st.text}</span>
                          {c.status === 'active' ? (
                            <Button size="sm" variant="outline" className="h-8 px-3 text-xs text-orange-600 border-orange-300 hover:bg-orange-50"
                              disabled={!!actionId} onClick={() => setCityStatus(c.ac_id, 'suspended')}>
                              {actionId === `${c.ac_id}-suspended` ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Suspender'}
                            </Button>
                          ) : (
                            <Button size="sm" variant="outline" className="h-8 px-3 text-xs text-green-600 border-green-300 hover:bg-green-50"
                              disabled={!!actionId} onClick={() => setCityStatus(c.ac_id, 'active')}>
                              {actionId === `${c.ac_id}-active` ? <Loader2 className="w-3 h-3 animate-spin" /> : <><CheckCircle2 className="w-3 h-3 mr-1" /> Reativar</>}
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </CardContent>
            </Card>
          </motion.div>
        )}
      </div>
    </>
  );
};

export default AmbassadorProfilePage;

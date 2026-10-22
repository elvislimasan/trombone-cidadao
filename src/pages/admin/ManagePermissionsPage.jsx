import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Helmet } from 'react-helmet';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { ArrowLeft, ShieldCheck, Search, Loader2, RotateCcw, Info, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { supabase } from '@/lib/customSupabaseClient';
import { MODULES, MODULE_KEYS } from '@/hooks/usePermissions';
import { showAppError, showAppNotice } from '@/lib/appError';
import { canWriteModule } from '@/lib/modulePermissions';
import { notifyPermissionsChanged } from '@/lib/permissionUpdates';

const ROLES = [
  { key: 'ambassador', label: 'Embaixador' },
  { key: 'admin', label: 'Admin' },
  { key: 'urban_planner', label: 'Gestão de ruas', module: 'urban_planning' },
  { key: 'tree_manager', label: 'Gestão de arborização', module: 'arborization' },
];

const ManagePermissionsPage = () => {
  const [rules, setRules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [userSearch, setUserSearch] = useState('');
  const [candidates, setCandidates] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);
  const [treeMembership, setTreeMembership] = useState({ userId: null, cities: [], loading: false, error: false });
  const activeTreeCities = treeMembership.userId === selectedUser?.id ? treeMembership.cities : [];
  const activeStreetCities = treeMembership.userId === selectedUser?.id ? treeMembership.streetCities || [] : [];
  const municipalGrants = {
    urban_planning: (selectedUser?.urban_planner_cities || []).some(row => row.municipal_enabled && activeStreetCities.includes(row.city_id)),
    arborization: (selectedUser?.tree_manager_cities || []).some(row => row.municipal_enabled && activeTreeCities.includes(row.city_id)),
  };

  useEffect(() => {
    if (!selectedUser?.id) return;
    let cancelled = false;
    const userId = selectedUser.id;
    setTreeMembership({ userId, cities: [], loading: true, error: false });
    supabase.rpc('tree_management_channels', { p_user_id: userId }).then(({ data, error }) => {
      if (cancelled) return;
      const cities = error ? [] : (selectedUser.tree_manager_cities || [])
        .filter(row => (data || []).some(channel => channel.canal_id === row.canal_id && String(channel.city_id) === String(row.city_id)))
        .map(row => row.city_id);
      const streetCities = error ? [] : (selectedUser.urban_planner_cities || [])
        .filter(row => !row.municipal_enabled || (data || []).some(channel => channel.canal_id === row.municipal_canal_id && String(channel.city_id) === String(row.city_id)))
        .map(row => row.city_id);
      setTreeMembership({ userId, cities, streetCities, loading: false, error: Boolean(error) });
    }).catch(() => { if (!cancelled) setTreeMembership({ userId, cities: [], loading: false, error: true }); });
    return () => { cancelled = true; };
  }, [selectedUser]);

  const fetchRules = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('permission_rules')
      .select('id, scope, role_name, user_id, module, allowed');
    if (error) {
      showAppError({ title: 'Erro ao carregar permissões', description: error.message, variant: 'destructive' });
    } else {
      setRules(data || []);
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchRules(); }, [fetchRules]);

  // Masters têm acesso global; as demais contas podem receber concessões por cidade.
  useEffect(() => {
    const term = userSearch.trim();
    if (term.length < 2) { setCandidates([]); return; }
    let cancelled = false;
    // A busca acontece no servidor.
    //
    // Antes vinham as 200 primeiras linhas e o filtro rodava sobre elas: quem
    // estivesse na posição 201 era, na prática, inencontrável — e a ordem nem
    // era definida. Com a rede de embaixadores crescendo por todo o país isso
    // deixaria gente fora do painel sem nenhum aviso.
    //
    // profiles não tem e-mail; identificamos por nome ou telefone.
    const termoSeguro = term.replace(/[,()%\\]/g, ' ').trim();
    if (!termoSeguro) { setCandidates([]); return; }

    supabase
      .from('profiles')
      .select('id, name, phone, city, user_type, is_admin, is_ambassador, is_master, urban_planner_cities(city_id,municipal_enabled,municipal_canal_id), tree_manager_cities:tree_manager_cities!tree_manager_cities_user_id_fkey(city_id,canal_id,municipal_enabled)')
      .or(`name.ilike.%${termoSeguro}%,phone.ilike.%${termoSeguro}%`)
      .order('name')
      .limit(8)
      .then(({ data }) => {
        if (cancelled) return;
        setCandidates(data || []);
      });
    return () => { cancelled = true; };
  }, [userSearch]);

  const roleRule = (role, module) =>
    rules.find((r) => r.scope === 'role' && r.role_name === role && r.module === module);

  const userRule = (userId, module) =>
    rules.find((r) => r.scope === 'user' && r.user_id === userId && r.module === module);

  // Interruptor ligado = pode escrever. Só gravamos linha quando o valor difere
  // do padrão herdado; voltar ao padrão remove a linha.
  const setRoleAllowed = async (role, module, allowed) => {
    setSaving(true);
    const existing = roleRule(role, module);
    let error;
    const defaultAllowed = !['urban_planner', 'tree_manager'].includes(role);
    if (allowed === defaultAllowed) {
      // Voltar ao padrão do cargo remove a exceção.
      if (existing) ({ error } = await supabase.from('permission_rules').delete().eq('id', existing.id).select('id').single());
    } else if (existing) {
      ({ error } = await supabase.from('permission_rules').update({ allowed }).eq('id', existing.id).select('id').single());
    } else {
      ({ error } = await supabase.from('permission_rules')
        .insert({ scope: 'role', role_name: role, module, allowed }).select('id').single());
    }
    setSaving(false);
    if (error) {
      showAppError({ title: 'Erro ao salvar', description: [error.message, error.code && `Código: ${error.code}`, error.details, error.hint].filter(Boolean).join(' · '), variant: 'destructive' });
      return;
    }
    notifyPermissionsChanged();
    showAppNotice({ title: 'Permissão do cargo atualizada' });
    fetchRules();
  };

  const setUserAllowed = async (userId, module, allowed) => {
    setSaving(true);
    const existing = userRule(userId, module);
    let error;
    if (existing) {
      ({ error } = await supabase.from('permission_rules').update({ allowed }).eq('id', existing.id).select('id').single());
    } else {
      ({ error } = await supabase.from('permission_rules')
        .insert({ scope: 'user', user_id: userId, module, allowed }).select('id').single());
    }
    setSaving(false);
    if (error) {
      showAppError({ title: 'Erro ao salvar', description: [error.message, error.code && `Código: ${error.code}`, error.details, error.hint].filter(Boolean).join(' · '), variant: 'destructive' });
      return;
    }
    notifyPermissionsChanged(userId);
    showAppNotice({ title: 'Permissão do usuário atualizada' });
    fetchRules();
  };

  const clearUserRule = async (userId, module) => {
    const existing = userRule(userId, module);
    if (!existing) return;
    setSaving(true);
    const { error } = await supabase.from('permission_rules').delete().eq('id', existing.id).select('id').single();
    setSaving(false);
    if (error) {
      showAppError({ title: 'Erro ao remover exceção', description: error.message, variant: 'destructive' });
      return;
    }
    notifyPermissionsChanged(userId);
    showAppNotice({ title: 'Usuário seguindo a permissão do cargo' });
    fetchRules();
  };

  // Valor que o usuário herda do cargo (sem considerar exceção individual).
  const inheritedForUser = (user, module) => {
    return canWriteModule(user, rules.filter(rule => rule.scope === 'role'), module,
      activeStreetCities, activeTreeCities, municipalGrants);
  };

  const selectedUserRoleLabel = useMemo(() => {
    if (!selectedUser) return '';
    return [selectedUser.is_master ? 'Master' : selectedUser.is_admin ? 'Admin' : selectedUser.is_ambassador ? 'Embaixador' : null,
      selectedUser.urban_planner_cities?.length ? 'Ruas' : null, selectedUser.tree_manager_cities?.length ? 'Arborização' : null].filter(Boolean).join(' · ') || 'Cidadão';
  }, [selectedUser]);

  return (
    <>
      <Helmet>
        <title>Permissões - Admin</title>
        <meta name="description" content="Controle de acesso aos módulos de gestão por cargo e por usuário." />
      </Helmet>
      <div className="page-shell-fluid py-8">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-wrap items-center gap-4 mb-8"
        >
          <Link to="/admin"><Button variant="outline" size="icon"><ArrowLeft className="w-4 h-4" /></Button></Link>
          <div>
            <h1 className="text-3xl md:text-4xl font-bold text-tc-red flex items-center gap-2">
              <ShieldCheck className="w-7 h-7" /> Permissões
            </h1>
            <p className="mt-2 text-muted-foreground">
              Controle quem pode alterar cada módulo de gestão.
            </p>
          </div>
        </motion.div>

        <div className="flex items-start gap-2 rounded-xl border border-blue-200 bg-blue-50 p-3 mb-6 text-sm text-blue-900">
          <Info className="w-4 h-4 mt-0.5 shrink-0" />
          <div>
            <p>
              Desligar um módulo remove apenas o acesso de <strong>alteração</strong>
              {' '}(criar, editar e excluir) e a tela de gestão. As páginas públicas
              continuam iguais para todo mundo.
            </p>
            <p className="mt-1">
              A regra de um <strong>usuário específico</strong> sempre vence a do cargo.
              O mapa de ruas exige o tipo <strong>Órgão Público</strong>, o cargo <strong>Planejamento urbano</strong> na cidade e permissão, inclusive para admin. Contas <strong>master</strong> têm acesso a todos os módulos e cidades, independentemente dessas regras.
            </p>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16 gap-2 text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin" /> Carregando permissões...
          </div>
        ) : (
          <div className="space-y-8">
            {/* ── Por cargo ── */}
            <Card>
              <CardHeader>
                <CardTitle>Por cargo</CardTitle>
                <CardDescription>
                  Vale para todos os usuários do cargo, exceto quem tiver uma regra individual.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {ROLES.map((role) => (
                  <div key={role.key}>
                    <p className="text-sm font-bold mb-3">{role.label}</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      {MODULE_KEYS.filter(mod => role.module ? mod === role.module : !['urban_planning', 'arborization'].includes(mod)).map((mod) => {
                        const rule = roleRule(role.key, mod);
                        const allowed = rule ? rule.allowed : !role.module;
                        return (
                          <div
                            key={mod}
                            className="flex items-center justify-between gap-3 rounded-xl border p-3 bg-background"
                          >
                            <Label htmlFor={`role-${role.key}-${mod}`} className="text-sm">
                              {MODULES[mod]}
                            </Label>
                            <Switch
                              id={`role-${role.key}-${mod}`}
                              checked={allowed}
                              disabled={saving}
                              onCheckedChange={(v) => setRoleAllowed(role.key, mod, v)}
                            />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* ── Por usuário ── */}
            <Card>
              <CardHeader>
                <CardTitle>Por usuário</CardTitle>
                <CardDescription>
                  Exceção individual — sobrepõe a regra do cargo, para liberar ou bloquear.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="relative max-w-md">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    className="pl-9"
                    placeholder="Buscar usuário por nome ou telefone..."
                    value={userSearch}
                    onChange={(e) => setUserSearch(e.target.value)}
                  />
                  {candidates.length > 0 && (
                    <div className="absolute z-20 mt-1 w-full rounded-xl border bg-popover shadow-lg max-h-64 overflow-y-auto">
                      {candidates.map((u) => (
                        <button
                          key={u.id}
                          type="button"
                          onClick={() => { setSelectedUser(u); setUserSearch(''); setCandidates([]); }}
                          className="w-full text-left px-3 py-2 text-sm hover:bg-muted border-b last:border-b-0"
                        >
                          <span className="font-medium">{u.name || 'Sem nome'}</span>
                          <span className="text-muted-foreground ml-2 text-xs">{u.email}</span>
                          <span className="ml-2 text-[10px] uppercase tracking-wide text-tc-red">
                            {u.urban_planner_cities?.length ? 'Planejamento urbano' : u.is_master ? 'Master' : u.is_admin ? 'Admin' : u.is_ambassador ? 'Embaixador' : 'Cidadão'}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {selectedUser && (
                  <div className="rounded-xl border p-4 bg-muted/20 space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="font-semibold">{selectedUser.name || 'Sem nome'}</p>
                        <p className="text-xs text-muted-foreground">
                          {selectedUser.email} · cargo: {selectedUserRoleLabel}
                        </p>
                      </div>
                      <Button variant="ghost" size="icon" onClick={() => setSelectedUser(null)}>
                        <X className="w-4 h-4" />
                      </Button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      {MODULE_KEYS.filter(mod => ['urban_planning', 'arborization'].includes(mod) || selectedUser.is_admin || selectedUser.is_ambassador || selectedUser.is_master).map((mod) => {
                        const exception = userRule(selectedUser.id, mod);
                        const inherited = inheritedForUser(selectedUser, mod);
                        const hasPlanningRole = Boolean((mod === 'arborization' ? selectedUser.tree_manager_cities : selectedUser.urban_planner_cities)?.length);
                        const scoped = ['urban_planning', 'arborization'].includes(mod);
                        const effective = canWriteModule(selectedUser, rules, mod, activeStreetCities, activeTreeCities, municipalGrants);
                        return (
                          <div key={mod} className="rounded-xl border p-3 bg-background">
                            <div className="flex items-center justify-between gap-3">
                              <Label htmlFor={`user-${mod}`} className="text-sm">{MODULES[mod]}</Label>
                              <Switch
                                id={`user-${mod}`}
                                checked={effective}
                                disabled={saving || selectedUser.is_master || (scoped && (treeMembership.loading || treeMembership.error)) || (scoped && (!hasPlanningRole || selectedUser.user_type !== 'public_official'))}
                                onCheckedChange={(v) => setUserAllowed(selectedUser.id, mod, v)}
                              />
                            </div>
                            <div className="mt-2 flex items-center justify-between gap-2">
                              <span className="text-[11px] text-muted-foreground">
                                {selectedUser.is_master ? 'Master: acesso garantido' : scoped && treeMembership.error ? 'Erro ao consultar vínculo institucional; selecione o usuário novamente' : scoped && treeMembership.loading ? 'Verificando vínculo institucional…' : scoped && selectedUser.user_type !== 'public_official' ? 'Selecione Órgão Público em Gerenciar usuários' : scoped && !hasPlanningRole ? 'Atribua o cargo e as cidades em Gerenciar usuários' : mod === 'arborization' && activeTreeCities.length === 0 ? 'Regularize o vínculo ativo com prefeitura e secretaria' : exception
                                  ? `Exceção individual (cargo: ${inherited ? 'liberado' : 'bloqueado'})`
                                  : municipalGrants[mod] ? 'Concedido pela prefeitura' : 'Seguindo o cargo'}
                              </span>
                              {exception && (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 px-2 text-[11px] gap-1"
                                  disabled={saving}
                                  onClick={() => clearUserRule(selectedUser.id, mod)}
                                >
                                  <RotateCcw className="w-3 h-3" /> Seguir cargo
                                </Button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </>
  );
};

export default ManagePermissionsPage;

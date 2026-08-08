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
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/customSupabaseClient';
import { MODULES, MODULE_KEYS } from '@/hooks/usePermissions';

const ROLES = [
  { key: 'ambassador', label: 'Embaixador' },
  { key: 'admin', label: 'Admin' },
];

const norm = (s) => (s || '').toLowerCase().normalize('NFD').replace(/\p{Mn}/gu, '');

const ManagePermissionsPage = () => {
  const { toast } = useToast();
  const [rules, setRules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [userSearch, setUserSearch] = useState('');
  const [candidates, setCandidates] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);

  const fetchRules = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('permission_rules')
      .select('id, scope, role_name, user_id, module, allowed');
    if (error) {
      toast({ title: 'Erro ao carregar permissões', description: error.message, variant: 'destructive' });
    } else {
      setRules(data || []);
    }
    setLoading(false);
  }, [toast]);

  useEffect(() => { fetchRules(); }, [fetchRules]);

  // Busca de usuários: masters ficam de fora, para o master não conseguir
  // bloquear a si mesmo nem outro master.
  useEffect(() => {
    const term = userSearch.trim();
    if (term.length < 2) { setCandidates([]); return; }
    let cancelled = false;
    // profiles não tem e-mail; identificamos por nome, cidade e telefone.
    supabase
      .from('profiles')
      .select('id, name, phone, city, is_admin, is_ambassador, is_master')
      .or('is_admin.eq.true,is_ambassador.eq.true')
      .eq('is_master', false)
      .limit(200)
      .then(({ data }) => {
        if (cancelled) return;
        const t = norm(term);
        setCandidates((data || []).filter(
          (u) => norm(u.name).includes(t) || (u.phone || '').includes(term)
        ).slice(0, 8));
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
    if (allowed) {
      // Liberar = voltar ao padrão: remove a regra de bloqueio.
      if (existing) ({ error } = await supabase.from('permission_rules').delete().eq('id', existing.id));
    } else if (existing) {
      ({ error } = await supabase.from('permission_rules').update({ allowed: false }).eq('id', existing.id));
    } else {
      ({ error } = await supabase.from('permission_rules')
        .insert({ scope: 'role', role_name: role, module, allowed: false }));
    }
    setSaving(false);
    if (error) {
      toast({ title: 'Erro ao salvar', description: error.message, variant: 'destructive' });
      return;
    }
    fetchRules();
  };

  const setUserAllowed = async (userId, module, allowed) => {
    setSaving(true);
    const existing = userRule(userId, module);
    let error;
    if (existing) {
      ({ error } = await supabase.from('permission_rules').update({ allowed }).eq('id', existing.id));
    } else {
      ({ error } = await supabase.from('permission_rules')
        .insert({ scope: 'user', user_id: userId, module, allowed }));
    }
    setSaving(false);
    if (error) {
      toast({ title: 'Erro ao salvar', description: error.message, variant: 'destructive' });
      return;
    }
    fetchRules();
  };

  const clearUserRule = async (userId, module) => {
    const existing = userRule(userId, module);
    if (!existing) return;
    setSaving(true);
    const { error } = await supabase.from('permission_rules').delete().eq('id', existing.id);
    setSaving(false);
    if (error) {
      toast({ title: 'Erro ao remover exceção', description: error.message, variant: 'destructive' });
      return;
    }
    fetchRules();
  };

  // Valor que o usuário herda do cargo (sem considerar exceção individual).
  const inheritedForUser = (user, module) => {
    const strongest = user.is_admin ? 'admin' : (user.is_ambassador ? 'ambassador' : null);
    if (!strongest) return true;
    const r = roleRule(strongest, module);
    return r ? r.allowed : true;
  };

  const selectedUserRoleLabel = useMemo(() => {
    if (!selectedUser) return '';
    return selectedUser.is_admin ? 'Admin' : (selectedUser.is_ambassador ? 'Embaixador' : '—');
  }, [selectedUser]);

  return (
    <>
      <Helmet>
        <title>Permissões - Admin</title>
        <meta name="description" content="Controle de acesso aos módulos de gestão por cargo e por usuário." />
      </Helmet>
      <div className="container max-w-[88rem] mx-auto w-full px-4 py-12">
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
              Masters nunca são afetados.
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
                      {MODULE_KEYS.map((mod) => {
                        const rule = roleRule(role.key, mod);
                        const allowed = rule ? rule.allowed : true;
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
                    placeholder="Buscar admin ou embaixador por nome/e-mail..."
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
                            {u.is_admin ? 'admin' : 'embaixador'}
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
                      {MODULE_KEYS.map((mod) => {
                        const exception = userRule(selectedUser.id, mod);
                        const inherited = inheritedForUser(selectedUser, mod);
                        const effective = exception ? exception.allowed : inherited;
                        return (
                          <div key={mod} className="rounded-xl border p-3 bg-background">
                            <div className="flex items-center justify-between gap-3">
                              <Label htmlFor={`user-${mod}`} className="text-sm">{MODULES[mod]}</Label>
                              <Switch
                                id={`user-${mod}`}
                                checked={effective}
                                disabled={saving}
                                onCheckedChange={(v) => setUserAllowed(selectedUser.id, mod, v)}
                              />
                            </div>
                            <div className="mt-2 flex items-center justify-between gap-2">
                              <span className="text-[11px] text-muted-foreground">
                                {exception
                                  ? `Exceção individual (cargo: ${inherited ? 'liberado' : 'bloqueado'})`
                                  : 'Seguindo o cargo'}
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

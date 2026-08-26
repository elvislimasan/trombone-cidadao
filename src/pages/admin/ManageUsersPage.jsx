import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Helmet } from 'react-helmet';
import { Link } from 'react-router-dom';
import { ArrowLeft, Edit, Trash2, User, Briefcase, Shield, Mail, Phone, Search, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, FormDialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import ReportDetails from '@/components/ReportDetails';
import { supabase } from '@/lib/customSupabaseClient';
import { Combobox } from "@/components/ui/combobox";
import { Input } from '@/components/ui/input';
import { useListaPaginada } from '@/hooks/useListaPaginada';
import PaginacaoLista from '@/components/admin/PaginacaoLista';
import { showAppError, showAppInfo } from '@/lib/appError';

const UserEditModal = ({ user, onSave, onClose }) => {
  const [name, setName] = useState('');
  const [userType, setUserType] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    if (user) {
      setName(user.name);
      setUserType(user.user_type);
      setIsAdmin(user.is_admin);
    }
  }, [user]);

  const handleSave = () => {
    onSave({ ...user, name, user_type: userType, is_admin: isAdmin });
  };

  if (!user) return null;

  const userTypeOptions = [
    { value: "citizen", label: "Cidadão" },
    { value: "public_official", label: "Órgão Público" }
  ];

  return (
    <Dialog open={!!user} onOpenChange={(open) => !open && onClose()}>
      <FormDialogContent className="grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden p-0">
        <DialogHeader className="border-b border-edge-subtle px-5 py-4 pr-12 sm:px-6">
          <DialogTitle className="text-xl font-bold text-content-primary">Editar usuário</DialogTitle>
          <p className="truncate text-xs text-content-tertiary">{user.name}</p>
        </DialogHeader>
        <div className="min-h-0 space-y-4 overflow-y-auto px-5 py-5 sm:px-6">
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-content-secondary">Nome</label>
            <Input id="name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <label htmlFor="userType" className="block text-sm font-medium text-content-secondary">Tipo de Usuário</label>
            <Combobox
              value={userType}
              onChange={setUserType}
              options={userTypeOptions}
              placeholder="Selecione o tipo"
              searchPlaceholder="Buscar tipo..."
            />
          </div>
          <div className="flex items-center space-x-2">
            <input type="checkbox" id="isAdmin" checked={isAdmin} onChange={(e) => setIsAdmin(e.target.checked)} className="h-4 w-4 rounded" />
            <label htmlFor="isAdmin" className="text-sm font-medium">É Administrador?</label>
          </div>
        </div>
        <DialogFooter className="shrink-0 gap-2 border-t border-edge-subtle bg-surface-raised px-5 py-3 sm:px-6">
          <Button variant="outline" className="h-11 rounded-xl sm:min-w-28" onClick={onClose}>Cancelar</Button>
          <Button className="h-11 rounded-xl sm:min-w-28" onClick={handleSave}>Salvar</Button>
        </DialogFooter>
      </FormDialogContent>
    </Dialog>
  );
};

const ManageUsersPage = () => {
  const [users, setUsers] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [editingUser, setEditingUser] = useState(null);
  const [deletingUser, setDeletingUser] = useState(null);
  const [viewingUserReports, setViewingUserReports] = useState(null);
  // As broncas do usuário são buscadas quando alguém clica em "Ver Broncas".
  //
  // Antes esta tela carregava a tabela `reports` INTEIRA no mount — com
  // comentários, autores dos comentários e todas as mídias — só para poder
  // filtrar por `author_id` dentro de um modal que talvez nunca fosse aberto.
  // Era o download mais caro do painel, e acontecia sempre.
  const [userReports, setUserReports] = useState([]);
  const [loadingUserReports, setLoadingUserReports] = useState(false);
  const [selectedReport, setSelectedReport] = useState(null);

  const fetchUsers = useCallback(async () => {
    setLoadingUsers(true);
    // Colunas nomeadas em vez de `*`: o perfil tem campos de avatar, de
    // patrulha e de pontuação que esta lista nunca mostra.
    const { data: profilesData, error: profilesError } = await supabase
      .from('profiles')
      .select('id, name, avatar_url, user_type, is_admin, phone')
      .order('name');

    if (profilesError) {
      setLoadingUsers(false);
      showAppError({ title: "Erro ao buscar usuários", description: profilesError.message, variant: "destructive" });
      return;
    }

    // Buscar e-mails dos usuários via função RPC
    // Nota: É necessário criar uma função RPC no Supabase chamada 'get_user_emails'
    // que retorne os e-mails dos usuários. Veja instruções no final deste arquivo.
    let usersWithEmails = profilesData.map(profile => ({
      ...profile,
      email: null, // Será preenchido pela função RPC se existir
    }));

    try {
      // Tentar buscar e-mails usando função RPC
      const userIds = profilesData.map(p => p.id);
      
      const { data: emailsData, error: emailsError } = await supabase
        .rpc('get_user_emails', { user_ids: userIds });

      if (emailsError) {
        console.error('[ManageUsers] Erro ao buscar e-mails:', emailsError);
        // Não mostrar toast para não poluir a interface, apenas log
      } else if (emailsData && Array.isArray(emailsData)) {
        
        // Criar um mapa de user_id -> email (usando string para comparação de UUID)
        // A função retorna 'user_id' ao invés de 'id'
        const emailMap = {};
        emailsData.forEach(item => {
          // A função pode retornar 'id' ou 'user_id', tentar ambos
          const userId = item.user_id || item.id;
          if (item && userId) {
            // Normalizar IDs para string para comparação
            const userIdStr = String(userId);
            emailMap[userIdStr] = item.email || null;
          }
        });


        // Adicionar e-mails aos perfis
        usersWithEmails = profilesData.map(profile => {
          const profileIdStr = String(profile.id);
          const email = emailMap[profileIdStr] || null;
          return {
            ...profile,
            email: email,
          };
        });
        
      } else {
      }
    } catch (error) {
      // Se a função RPC não existir ou houver erro, apenas mostrar telefone
      console.error('[ManageUsers] Erro ao chamar função RPC get_user_emails:', error);
    }

    setUsers(usersWithEmails);
    setLoadingUsers(false);
  }, []);

  // Só as broncas de um autor, e só quando pedidas.
  const fetchUserReports = useCallback(async (userId) => {
    if (!userId) return;
    setLoadingUserReports(true);
    const { data, error } = await supabase
      .from('reports')
      .select('*, pole_number, author:author_id(name, avatar_url, avatar_config, avatar_type), category:category_id(name), comments:comments(*, author:author_id(name, avatar_url, avatar_config, avatar_type)), report_media(*)')
      .eq('author_id', userId)
      .order('created_at', { ascending: false });
    if (error) {
      showAppError({ title: "Erro ao buscar broncas", description: error.message, variant: "destructive" });
      setUserReports([]);
    } else {
      setUserReports((data || []).map(r => ({
        ...r,
        photos: (r.report_media || []).filter(m => m.type === 'photo'),
        videos: (r.report_media || []).filter(m => m.type === 'video'),
      })));
    }
    setLoadingUserReports(false);
  }, []);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  useEffect(() => {
    if (viewingUserReports?.id) fetchUserReports(viewingUserReports.id);
    else setUserReports([]);
  }, [viewingUserReports, fetchUserReports]);

  const handleSaveUser = async (userToSave) => {
    const { error } = await supabase
      .from('profiles')
      .update({ name: userToSave.name, user_type: userToSave.user_type, is_admin: userToSave.is_admin })
      .eq('id', userToSave.id);
    
    if (error) {
      showAppError({ title: "Erro ao atualizar usuário", description: error.message, variant: "destructive" });
    } else {
      fetchUsers();
    }
    setEditingUser(null);
  };

  const handleDeleteUser = async (userId) => {
    setDeletingUser(null);
    showAppInfo({
      title: 'Exclusão indisponível nesta tela',
      description: 'A remoção de usuários exige a função administrativa segura para preservar a integridade dos dados.',
    });
  };

  const handleUpdateReport = async (updatedReport) => {
    const { error } = await supabase.from('reports').update(updatedReport).eq('id', updatedReport.id);
    if (error) {
      showAppError({ title: "Erro ao atualizar bronca", description: error.message, variant: "destructive" });
    } else {
      fetchUserReports(viewingUserReports?.id);
      if (selectedReport) setSelectedReport(null);
    }
  };

  const userTypeDisplay = {
    citizen: { icon: User, text: 'Cidadão', color: 'text-blue-400' },
    public_official: { icon: Briefcase, text: 'Órgão Público', color: 'text-green-400' }
  };

  // Busca por nome, e-mail ou telefone: com a base nacional, rolar até achar
  // alguém deixou de ser possível.
  const filteredUsers = useMemo(() => {
    const termo = searchTerm.trim().toLowerCase();
    if (!termo) return users;
    return users.filter((u) =>
      (u.name || '').toLowerCase().includes(termo) ||
      (u.email || '').toLowerCase().includes(termo) ||
      (u.phone || '').toLowerCase().includes(termo)
    );
  }, [users, searchTerm]);

  const { visiveis: usuariosVisiveis, total, propsPaginacao } = useListaPaginada(filteredUsers, {
    porPagina: 20,
    chaveFiltro: searchTerm,
  });

  return (
    <>
      <Helmet>
        <title>Gerenciar Usuários - Admin</title>
        <meta name="description" content="Gerencie os usuários da plataforma." />
      </Helmet>
      <div className="container mx-auto px-4 py-12">
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="flex flex-wrap items-center justify-between gap-4 mb-12">
          <div className="flex items-center gap-4">
            <Link to="/admin"><Button variant="outline" size="icon"><ArrowLeft className="w-4 h-4" /></Button></Link>
            <div>
              <h1 className="text-3xl md:text-4xl font-bold text-tc-red">Gerenciar Usuários</h1>
              <p className="mt-2 text-lg text-muted-foreground">Edite, remova e visualize as atividades dos usuários.</p>
            </div>
          </div>
        </motion.div>

        <Card>
          <CardHeader>
            <CardTitle>Usuários Cadastrados</CardTitle>
            <CardDescription>
              {loadingUsers ? 'Carregando...' : `${total} usuário${total === 1 ? '' : 's'}.`}
            </CardDescription>
            <div className="relative mt-3">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por nome, e-mail ou telefone..."
                className="pl-10"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </CardHeader>
          <CardContent>
            {loadingUsers ? (
              <div className="space-y-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-[92px] w-full rounded-lg" />
                ))}
              </div>
            ) : usuariosVisiveis.length === 0 ? (
              <p className="text-center text-muted-foreground py-10">
                {searchTerm ? 'Nenhum usuário corresponde à busca.' : 'Nenhum usuário cadastrado.'}
              </p>
            ) : (
            <div className="space-y-3">
              {usuariosVisiveis.map(user => {
                const UserTypeIcon = userTypeDisplay[user.user_type]?.icon || User;
                return (
                  <div key={user.id} className="flex flex-col sm:flex-row justify-between items-start sm:items-center p-4 bg-background rounded-lg border gap-4">
                    <div className="flex items-center gap-4">
                      <img src={user.avatar_url || `https://api.dicebear.com/7.x/initials/svg?seed=${user.name}`} alt={user.name} className="w-12 h-12 rounded-full object-cover" />
                      <div className="flex-1">
                        <p className="font-semibold flex items-center gap-2">
                          {user.name}
                          {user.is_admin && <Shield className="w-4 h-4 text-tc-yellow" title="Administrador" />}
                        </p>
                        <p className={`text-sm flex items-center gap-1 ${userTypeDisplay[user.user_type]?.color}`}>
                          <UserTypeIcon className="w-3 h-3" />
                          {userTypeDisplay[user.user_type]?.text}
                        </p>
                        <div className="flex flex-wrap gap-3 mt-2 text-xs text-muted-foreground">
                          {user.email ? (
                            <div className="flex items-center gap-1">
                              <Mail className="w-3 h-3" />
                              <span title={user.email}>{user.email}</span>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1 text-muted-foreground/50">
                              <Mail className="w-3 h-3" />
                              <span>E-mail não disponível</span>
                            </div>
                          )}
                          {user.phone ? (
                            <div className="flex items-center gap-1">
                              <Phone className="w-3 h-3" />
                              <span>{user.phone}</span>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1 text-muted-foreground/50">
                              <Phone className="w-3 h-3" />
                              <span>Telefone não disponível</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex-shrink-0 flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => setViewingUserReports(user)}>Ver Broncas</Button>
                      <Button variant="ghost" size="icon" onClick={() => setEditingUser(user)}><Edit className="w-4 h-4" /></Button>
                      <Button variant="ghost" size="icon" className="text-red-500 hover:text-red-600" onClick={() => setDeletingUser(user)}><Trash2 className="w-4 h-4" /></Button>
                    </div>
                  </div>
                );
              })}
            </div>
            )}

            {!loadingUsers && <PaginacaoLista {...propsPaginacao} />}
          </CardContent>
        </Card>
      </div>

      <UserEditModal
        user={editingUser}
        onClose={() => setEditingUser(null)}
        onSave={handleSaveUser}
      />

      <Dialog open={!!deletingUser} onOpenChange={(open) => !open && setDeletingUser(null)}>
        <DialogContent className="sm:max-w-md bg-card border-border">
          <DialogHeader><DialogTitle className="text-xl font-bold text-foreground">Confirmar Exclusão</DialogTitle></DialogHeader>
          <p className="text-muted-foreground">Tem certeza que deseja remover o usuário "{deletingUser?.name}"? Esta ação não pode ser desfeita.</p>
          <DialogFooter className="sm:justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setDeletingUser(null)}>Cancelar</Button>
            <Button type="button" variant="destructive" onClick={() => handleDeleteUser(deletingUser.id)}>Remover</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!viewingUserReports} onOpenChange={(open) => !open && setViewingUserReports(null)}>
        <DialogContent className="max-w-2xl z-[1600]">
          <DialogHeader>
            <DialogTitle>Broncas de {viewingUserReports?.name}</DialogTitle>
            <DialogDescription>Lista de todas as solicitações enviadas por este usuário.</DialogDescription>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-y-auto space-y-3 p-1">
            {loadingUserReports ? (
              <p className="flex items-center justify-center gap-2 text-muted-foreground py-8">
                <Loader2 className="w-4 h-4 animate-spin" /> Carregando broncas...
              </p>
            ) : userReports.length > 0 ? userReports.map(report => (
              <div key={report.id} className="flex justify-between items-center p-3 bg-background rounded-md border gap-3">
                <p className="font-medium min-w-0 truncate">{report.title}</p>
                <Button variant="ghost" size="sm" className="shrink-0" onClick={() => setSelectedReport(report)}>Ver/Editar</Button>
              </div>
            )) : <p className="text-center text-muted-foreground py-8">Este usuário ainda não registrou nenhuma bronca.</p>}
          </div>
        </DialogContent>
      </Dialog>

      {selectedReport && (
        <ReportDetails
          report={selectedReport}
          onClose={() => setSelectedReport(null)}
          onUpdate={handleUpdateReport}
          onUpvote={() => {}}
          onLink={() => {}}
        />
      )}
    </>
  );
};

export default ManageUsersPage;

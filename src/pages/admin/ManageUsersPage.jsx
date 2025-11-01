import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Helmet } from 'react-helmet';
import { Link } from 'react-router-dom';
import { ArrowLeft, Edit, Trash2, User, Briefcase, Shield } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/components/ui/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import ReportDetails from '@/components/ReportDetails';
import { supabase } from '@/lib/customSupabaseClient';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from '@/components/ui/input';

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

    const handleUpvote = async (id) => {
    if (!user) {
      toast({ title: "Acesso restrito", description: "Você precisa fazer login para apoiar.", variant: "destructive" });
      navigate('/login');
      return;
    }
    const { error } = await supabase.rpc('increment_upvotes', { report_id_param: id });
    if (error) {
      toast({ title: "Erro ao apoiar", description: error.message, variant: "destructive" });
    } else {
      fetchReport();
      toast({ title: "Apoio registrado! 👍" });
    }
  };

  if (!user) return null;

  return (
    <Dialog open={!!user} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Editar Usuário: {user.name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-gray-700">Nome</label>
            <Input id="name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <label htmlFor="userType" className="block text-sm font-medium text-gray-700">Tipo de Usuário</label>
            <Select value={userType} onValueChange={setUserType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="citizen">Cidadão</SelectItem>
                <SelectItem value="public_official">Órgão Público</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center space-x-2">
            <input type="checkbox" id="isAdmin" checked={isAdmin} onChange={(e) => setIsAdmin(e.target.checked)} className="h-4 w-4 rounded" />
            <label htmlFor="isAdmin" className="text-sm font-medium">É Administrador?</label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleSave}>Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const ManageUsersPage = () => {
  const { toast } = useToast();
  const [users, setUsers] = useState([]);
  const [reports, setReports] = useState([]);
  const [editingUser, setEditingUser] = useState(null);
  const [deletingUser, setDeletingUser] = useState(null);
  const [viewingUserReports, setViewingUserReports] = useState(null);
  const [selectedReport, setSelectedReport] = useState(null);

  const fetchUsers = useCallback(async () => {
    const { data, error } = await supabase.from('profiles').select('*');
    if (error) toast({ title: "Erro ao buscar usuários", description: error.message, variant: "destructive" });
    else setUsers(data);
  }, [toast]);

  const fetchReports = useCallback(async () => {
    const { data, error } = await supabase.from('reports').select('*, author:author_id(name, avatar_url, avatar_config, avatar_type), category:category_id(name), comments:comments(*, author:author_id(name, avatar_url, avatar_config, avatar_type))');
    if (error) toast({ title: "Erro ao buscar broncas", description: error.message, variant: "destructive" });
    else setReports(data);
  }, [toast]);

  useEffect(() => {
    fetchUsers();
    fetchReports();
  }, [fetchUsers, fetchReports]);

  const handleSaveUser = async (userToSave) => {
    const { error } = await supabase
      .from('profiles')
      .update({ name: userToSave.name, user_type: userToSave.user_type, is_admin: userToSave.is_admin })
      .eq('id', userToSave.id);
    
    if (error) {
      toast({ title: "Erro ao atualizar usuário", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Usuário atualizado com sucesso! ✅" });
      fetchUsers();
    }
    setEditingUser(null);
  };

  const handleDeleteUser = async (userId) => {
    toast({ title: "Função de exclusão não implementada", description: "A exclusão de usuários deve ser feita por uma função de administrador segura para evitar problemas de integridade de dados." });
    setDeletingUser(null);
  };

  const handleUpdateReport = async (updatedReport) => {
    const { error } = await supabase.from('reports').update(updatedReport).eq('id', updatedReport.id);
    if (error) {
      toast({ title: "Erro ao atualizar bronca", description: error.message, variant: "destructive" });
    } else {
      fetchReports();
      if (selectedReport) setSelectedReport(null);
    }
  };

  const userReports = viewingUserReports ? reports.filter(r => r.author_id === viewingUserReports.id) : [];

  const userTypeDisplay = {
    citizen: { icon: User, text: 'Cidadão', color: 'text-blue-400' },
    public_official: { icon: Briefcase, text: 'Órgão Público', color: 'text-green-400' }
  };

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
          <CardHeader><CardTitle>Usuários Cadastrados</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-3">
              {users.map(user => {
                const UserTypeIcon = userTypeDisplay[user.user_type]?.icon || User;
                return (
                  <div key={user.id} className="flex flex-col sm:flex-row justify-between items-start sm:items-center p-4 bg-background rounded-lg border gap-4">
                    <div className="flex items-center gap-4">
                      <img src={user.avatar_url || `https://api.dicebear.com/7.x/initials/svg?seed=${user.name}`} alt={user.name} className="w-12 h-12 rounded-full object-cover" />
                      <div>
                        <p className="font-semibold flex items-center gap-2">
                          {user.name}
                          {user.is_admin && <Shield className="w-4 h-4 text-tc-yellow" title="Administrador" />}
                        </p>
                        <p className={`text-sm flex items-center gap-1 ${userTypeDisplay[user.user_type]?.color}`}>
                          <UserTypeIcon className="w-3 h-3" />
                          {userTypeDisplay[user.user_type]?.text}
                        </p>
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
            {userReports.length > 0 ? userReports.map(report => (
              <div key={report.id} className="flex justify-between items-center p-3 bg-background rounded-md border">
                <p className="font-medium">{report.title}</p>
                <Button variant="ghost" size="sm" onClick={() => setSelectedReport(report)}>Ver/Editar</Button>
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
          onUpvote={ handleUpvote}
          onLink={() => {}}
        />
      )}
    </>
  );
};

export default ManageUsersPage;
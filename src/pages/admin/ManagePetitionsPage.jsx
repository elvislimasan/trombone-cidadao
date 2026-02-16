import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Helmet } from 'react-helmet';
import { useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, Search, FileSignature, Plus, Eye, MoreHorizontal, Filter, Calendar, Users, CheckCircle2, XCircle, AlertCircle, Trophy, Trash2, FileDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useToast } from '@/components/ui/use-toast';
import { exportPetitionPDF } from '@/utils/pdfExport';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuLabel, 
  DropdownMenuSeparator, 
  DropdownMenuTrigger 
} from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { motion, AnimatePresence } from 'framer-motion';
import PetitionUpdateModal from '@/components/petition/PetitionUpdateModal';
import { Megaphone } from 'lucide-react';

const ManagePetitionsPage = () => {
  const { toast } = useToast();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [petitions, setPetitions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showUpdateModal, setShowUpdateModal] = useState(false);
  const [selectedPetitionId, setSelectedPetitionId] = useState(null);
  
  // Filtros
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sortBy, setSortBy] = useState('newest');

  const fetchPetitions = useCallback(async () => {
    setLoading(true);
    
    const { data, error } = await supabase
      .from('petitions')
      .select('*, author:profiles!author_id(name, avatar_url), signatures:signatures(count)')
      .order('created_at', { ascending: false });

    if (error) {
      toast({ title: "Erro ao buscar abaixo-assinados", description: error.message, variant: "destructive" });
    } else {
      const formattedData = data
        .filter(p => !['draft', 'pending_moderation', 'rejected'].includes(p.status))
        .map(p => ({
        ...p,
        authorName: p.author?.name || 'Anônimo',
        authorAvatar: p.author?.avatar_url,
        signatureCount: p.signatures?.[0]?.count || 0,
      }));
      setPetitions(formattedData);
    }
    setLoading(false);
  }, [toast]);

  const handleStatusChange = async (petitionId, newStatus) => {
    try {
      const { error } = await supabase
        .from('petitions')
        .update({ status: newStatus })
        .eq('id', petitionId);

      if (error) throw error;

      setPetitions(prev => prev.map(p => 
        p.id === petitionId ? { ...p, status: newStatus } : p
      ));

      toast({
        title: "Status atualizado",
        description: `Abaixo-assinado atualizado com sucesso.`,
      });
    } catch (error) {
      console.error('Error updating status:', error);
      toast({
        title: "Erro ao atualizar",
        description: "Não foi possível alterar o status.",
        variant: "destructive"
      });
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Tem certeza que deseja excluir permanentemente este abaixo-assinado?')) return;
    
    try {
      const { error } = await supabase.from('petitions').delete().eq('id', id);
      if (error) throw error;
      
      setPetitions(prev => prev.filter(p => p.id !== id));
      toast({ title: "Abaixo-assinado excluído" });
    } catch (error) {
      toast({ title: "Erro ao excluir", description: error.message, variant: "destructive" });
    }
  };

  useEffect(() => {
    fetchPetitions();
  }, [fetchPetitions]);

  const filteredAndSortedPetitions = useMemo(() => {
    let result = petitions.filter(p => {
      const title = p.title || '';
      const authorName = p.authorName || 'Anônimo';
      
      const matchesSearch = title.toLowerCase().includes(searchTerm.toLowerCase()) || 
                           authorName.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesStatus = statusFilter === 'all' || p.status === statusFilter;
      return matchesSearch && matchesStatus;
    });

    // Ordenação
    if (sortBy === 'newest') {
      result.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    } else if (sortBy === 'oldest') {
      result.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    } else if (sortBy === 'most_signed') {
      result.sort((a, b) => b.signatureCount - a.signatureCount);
    }

    return result;
  }, [petitions, searchTerm, statusFilter, sortBy]);

  const getStatusBadge = (status) => {
    switch (status) {
      case 'open':
        return <Badge className="bg-green-100 text-green-700 hover:bg-green-100 border-green-200 gap-1 text-[9px] md:text-xs py-0 h-5 md:h-6"><CheckCircle2 className="w-2.5 h-2.5 md:w-3 h-3" /> Publicada</Badge>;
      case 'victory':
        return <Badge className="bg-yellow-100 text-yellow-700 hover:bg-yellow-100 border-yellow-200 gap-1 text-[9px] md:text-xs py-0 h-5 md:h-6"><Trophy className="w-2.5 h-2.5 md:w-3 h-3" /> Vitória</Badge>;
      case 'closed':
        return <Badge className="bg-gray-100 text-gray-700 hover:bg-gray-100 border-gray-200 gap-1 text-[9px] md:text-xs py-0 h-5 md:h-6"><XCircle className="w-2.5 h-2.5 md:w-3 h-3" /> Encerrada</Badge>;
      case 'pending_moderation':
        return <Badge className="bg-blue-100 text-blue-700 hover:bg-blue-100 border-blue-200 gap-1 text-[9px] md:text-xs py-0 h-5 md:h-6"><AlertCircle className="w-2.5 h-2.5 md:w-3 h-3" /> Em Moderação</Badge>;
      case 'rejected':
        return <Badge className="bg-red-100 text-red-700 hover:bg-red-100 border-red-200 gap-1 text-[9px] md:text-xs py-0 h-5 md:h-6"><XCircle className="w-2.5 h-2.5 md:w-3 h-3" /> Rejeitada</Badge>;
      default:
        return <Badge variant="outline" className="text-[9px] md:text-xs py-0 h-5 md:h-6">{status}</Badge>;
    }
  };

  const handleCreatePetition = async () => {
    if (!user) return;
    try {
        const { data: newPetition, error } = await supabase
            .from('petitions')
            .insert({
                title: '',
                description: '',
                author_id: user.id,
                status: 'draft',
                goal: 100
            })
            .select()
            .single();

        if (error) throw error;
        navigate(`/abaixo-assinado/${newPetition.id}?edit=true`);
    } catch (error) {
        toast({ title: "Erro ao criar", variant: "destructive" });
    }
  };

  return (
    <>
      <Helmet>
        <title>Gerenciar Abaixo-Assinados - Admin</title>
      </Helmet>
      
      <div className="container mx-auto px-4 py-6 md:py-8 max-w-7xl">
        {/* Header Section */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-8 md:mb-10">
          <div className="space-y-2">
            <div className="flex items-center gap-2 md:gap-3">
              <Link to="/admin">
                <Button variant="ghost" size="icon" className="rounded-full hover:bg-muted shrink-0">
                  <ArrowLeft className="w-5 h-5" />
                </Button>
              </Link>
              <h1 className="text-2xl sm:text-3xl md:text-4xl font-extrabold tracking-tight text-foreground">
                Gerenciar <span className="text-tc-red">Abaixo-Assinados</span>
              </h1>
            </div>
            <p className="text-muted-foreground text-base md:text-lg max-w-2xl hidden sm:block">Controle total sobre as campanhas ativas.</p>
          </div>
          
          <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
            <Link to="/admin/moderacao/peticoes" className="w-full sm:w-auto">
              <Button variant="outline" className="w-full h-11 px-6 rounded-xl border-2 hover:bg-blue-50 hover:text-blue-600 hover:border-blue-200 transition-all gap-2 justify-center">
                <FileSignature className="w-5 h-5" />
                Moderar Pendentes
              </Button>
            </Link>
            <Button onClick={handleCreatePetition} className="w-full sm:w-auto h-11 px-6 rounded-xl bg-tc-red hover:bg-tc-red/90 shadow-lg shadow-tc-red/20 transition-all gap-2 justify-center">
              <Plus className="w-5 h-5" /> Criar Nova Petição
            </Button>
          </div>
        </div>

        {/* Filters Card */}
        <Card className="mb-8 border-none shadow-sm bg-muted/30">
          <CardContent className="p-4 md:p-6">
            <div className="flex flex-col gap-4">
              <div className="relative w-full">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4" />
                <Input
                  placeholder="Buscar por título ou autor..."
                  className="pl-10 h-11 bg-background border-none shadow-sm focus-visible:ring-tc-red w-full"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="flex items-center gap-2">
                  <Filter className="w-4 h-4 text-muted-foreground shrink-0" />
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="h-11 bg-background border-none shadow-sm w-full">
                      <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos os Status</SelectItem>
                      <SelectItem value="open">Publicadas</SelectItem>
                      <SelectItem value="victory">Vitórias</SelectItem>
                      <SelectItem value="closed">Encerradas</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-muted-foreground shrink-0" />
                  <Select value={sortBy} onValueChange={setSortBy}>
                    <SelectTrigger className="h-11 bg-background border-none shadow-sm w-full">
                      <SelectValue placeholder="Ordenar por" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="newest">Mais Recentes</SelectItem>
                      <SelectItem value="oldest">Mais Antigos</SelectItem>
                      <SelectItem value="most_signed">Mais Assinaturas</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* List Section */}
        <div className="space-y-4">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 gap-4">
              <div className="w-10 h-10 border-4 border-tc-red border-t-transparent rounded-full animate-spin"></div>
              <p className="text-muted-foreground animate-pulse font-medium">Carregando campanhas...</p>
            </div>
          ) : filteredAndSortedPetitions.length === 0 ? (
            <Card className="border-dashed border-2 py-20 flex flex-col items-center justify-center text-center">
              <div className="bg-muted p-4 rounded-full mb-4 text-muted-foreground">
                <Search className="w-8 h-8" />
              </div>
              <h3 className="text-xl font-bold mb-1">Nenhum resultado encontrado</h3>
              <p className="text-muted-foreground max-w-sm">Tente ajustar seus filtros ou termos de pesquisa para encontrar o que procura.</p>
              <Button variant="link" onClick={() => { setSearchTerm(''); setStatusFilter('all'); }} className="mt-2 text-tc-red">
                Limpar filtros
              </Button>
            </Card>
          ) : (
            <div className="grid gap-4">
              <AnimatePresence mode="popLayout">
                {filteredAndSortedPetitions.map((petition) => (
                  <motion.div
                    layout
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    key={petition.id}
                  >
                    <Card className="group hover:border-tc-red/30 transition-all duration-300 shadow-sm hover:shadow-md overflow-hidden">
                      <CardContent className="p-0">
                        <div className="flex flex-row items-stretch min-h-[110px] md:min-h-[140px]">
                          {/* Image Preview - Fixed size on mobile, larger on desktop */}
                          <div className="w-24 sm:w-32 md:w-48 bg-muted shrink-0 overflow-hidden relative">
                            {petition.image_url ? (
                              <img 
                                src={petition.image_url} 
                                alt={petition.title} 
                                className="absolute inset-0 w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                              />
                            ) : (
                              <div className="absolute inset-0 w-full h-full flex items-center justify-center text-muted-foreground/30">
                                <FileSignature className="w-5 h-5 md:w-8 md:h-8" />
                              </div>
                            )}
                          </div>

                          <div className="flex-1 p-2.5 md:p-5 flex flex-col md:flex-row justify-between items-start md:items-center gap-2 md:gap-6 min-w-0">
                            <div className="space-y-1 md:space-y-2 min-w-0 flex-1 w-full">
                              <div className="flex items-center gap-1.5 md:gap-3 flex-wrap">
                                {getStatusBadge(petition.status)}
                                <span className="text-[10px] md:text-xs text-muted-foreground flex items-center gap-1">
                                  <Calendar className="w-3 h-3 md:w-3.5 md:h-3.5" />
                                  {new Date(petition.created_at).toLocaleDateString('pt-BR')}
                                </span>
                              </div>
                              
                              <h3 className="font-bold text-sm md:text-lg leading-tight line-clamp-2 pr-1 group-hover:text-tc-red transition-colors">
                                {petition.title}
                              </h3>
                              
                              <div className="flex flex-col xs:flex-row xs:items-center gap-1.5 xs:gap-4 text-[10px] md:text-sm text-muted-foreground">
                                <div className="flex items-center gap-1.5">
                                  <div className="w-4 h-4 md:w-5 md:h-5 rounded-full bg-tc-red/10 flex items-center justify-center text-tc-red text-[8px] md:text-[10px] font-bold shrink-0">
                                    {petition.authorName.charAt(0).toUpperCase()}
                                  </div>
                                  <span className="font-medium truncate max-w-[80px] sm:max-w-[150px] md:max-w-none">{petition.authorName}</span>
                                </div>
                                <div className="flex items-center gap-1.5">
                                  <Users className="w-3.5 h-3.5 md:w-4 md:h-4" />
                                  <span className="font-semibold text-foreground">{petition.signatureCount}</span>
                                  <span className="opacity-70">/ {petition.goal}</span>
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center gap-1.5 md:gap-2 shrink-0 self-end md:self-center w-full sm:w-auto justify-end mt-1 md:mt-0 pt-1 border-t border-muted sm:border-0 sm:pt-0">
                              <Button 
                                variant="ghost" 
                                size="sm" 
                                className="h-8 md:h-10 px-2.5 md:px-4 text-muted-foreground hover:text-tc-red hover:bg-tc-red/5 rounded-lg flex-1 sm:flex-none text-[11px] md:text-sm"
                                onClick={() => navigate(`/abaixo-assinado/${petition.id}`)}
                              >
                                <Eye className="w-3.5 h-3.5 md:w-4 md:h-4 mr-1.5 md:mr-2" />
                                Ver
                              </Button>
                              
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="ghost" size="icon" className="h-8 w-8 md:h-10 md:w-10 rounded-lg hover:bg-muted shrink-0">
                                    <MoreHorizontal className="w-4 h-4 md:w-5 md:h-5" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-52 p-2 rounded-xl border-2">
                                  <DropdownMenuLabel>Ações de Status</DropdownMenuLabel>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem 
                                    className="rounded-lg gap-2 cursor-pointer"
                                    onClick={() => handleStatusChange(petition.id, 'open')}
                                  >
                                    <CheckCircle2 className="w-4 h-4 text-green-500" /> Publicar
                                  </DropdownMenuItem>
                                  <DropdownMenuItem 
                                    className="rounded-lg gap-2 cursor-pointer"
                                    onClick={() => handleStatusChange(petition.id, 'victory')}
                                  >
                                    <Trophy className="w-4 h-4 text-yellow-500" /> Marcar Vitória
                                  </DropdownMenuItem>
                                  <DropdownMenuItem 
                                    className="rounded-lg gap-2 cursor-pointer"
                                    onClick={() => handleStatusChange(petition.id, 'closed')}
                                  >
                                    <XCircle className="w-4 h-4 text-gray-500" /> Encerrar
                                  </DropdownMenuItem>
                                  <DropdownMenuItem 
                                    className="rounded-lg gap-2 cursor-pointer"
                                    onClick={() => {
                                      setSelectedPetitionId(petition.id);
                                      setShowUpdateModal(true);
                                    }}
                                  >
                                    <Megaphone className="w-4 h-4 text-blue-500" /> Enviar Novidade
                                  </DropdownMenuItem>
                                  <DropdownMenuItem 
                                    className="rounded-lg gap-2 cursor-pointer"
                                    onClick={() => exportPetitionPDF(petition, toast)}
                                  >
                                    <FileDown className="w-4 h-4 text-green-600" /> Baixar PDF Assinaturas
                                  </DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem 
                                    className="rounded-lg gap-2 cursor-pointer"
                                    onClick={() => navigate(`/abaixo-assinado/${petition.id}?edit=true`)}
                                  >
                                    <Plus className="w-4 h-4" /> Editar Conteúdo
                                  </DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem 
                                    className="rounded-lg gap-2 text-destructive focus:bg-destructive/10 focus:text-destructive cursor-pointer"
                                    onClick={() => handleDelete(petition.id)}
                                  >
                                    <Trash2 className="w-4 h-4" /> Excluir Permanentemente
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          )}
        </div>
      </div>

      {selectedPetitionId && (
        <PetitionUpdateModal 
          isOpen={showUpdateModal}
          onClose={() => {
            setShowUpdateModal(false);
            setSelectedPetitionId(null);
          }}
          petitionId={selectedPetitionId}
          onSave={() => fetchPetitions()}
        />
      )}
    </>
  );
};

export default ManagePetitionsPage;

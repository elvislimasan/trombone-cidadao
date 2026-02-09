import React, { useState, useEffect, useCallback } from 'react';
import { Helmet } from 'react-helmet';
import { useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, Search, FileSignature, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useToast } from '@/components/ui/use-toast';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';

const ManagePetitionsPage = () => {
  const { toast } = useToast();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [petitions, setPetitions] = useState([]);
  const [filteredPetitions, setFilteredPetitions] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);

  const fetchPetitions = useCallback(async () => {
    setLoading(true);
    
    // Agora busca da tabela 'petitions' em vez de 'reports'
    const { data, error } = await supabase
      .from('petitions')
      .select('*, author:profiles!petitions_author_id_fkey(name), signatures:signatures(count)')
      .order('created_at', { ascending: false });

    if (error) {
      toast({ title: "Erro ao buscar abaixo-assinados", description: error.message, variant: "destructive" });
    } else {
      const formattedData = data.map(p => ({
        ...p,
        authorName: p.author?.name || 'Anônimo',
        signatureCount: p.signatures[0]?.count || 0,
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

      setPetitions(petitions.map(p => 
        p.id === petitionId ? { ...p, status: newStatus } : p
      ));

      toast({
        title: "Status atualizado",
        description: `Petição marcada como ${
          newStatus === 'open' ? 'Publicada' : 
          newStatus === 'closed' ? 'Encerrada' : 
          newStatus === 'victory' ? 'Vitória' : 'Rascunho'
        }`,
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

  useEffect(() => {
    fetchPetitions();
  }, [fetchPetitions]);

  useEffect(() => {
    if (searchTerm) {
      setFilteredPetitions(petitions.filter(p => 
        p.title.toLowerCase().includes(searchTerm.toLowerCase())
      ));
    } else {
      setFilteredPetitions(petitions);
    }
  }, [searchTerm, petitions]);

  const handleCreatePetition = async () => {
    if (!user) return;
    
    try {
        const { data: newPetition, error } = await supabase
            .from('petitions')
            .insert({
                title: '',
                description: 'Descreva sua campanha aqui...',
                author_id: user.id,
                status: 'draft',
                goal: 100
            })
            .select()
            .single();

        if (error) throw error;

        toast({
            title: "Rascunho criado",
            description: "Redirecionando para o editor...",
        });

        navigate(`/abaixo-assinado/${newPetition.id}?edit=true`);
    } catch (error) {
        console.error('Error creating petition:', error);
        toast({
            title: "Erro ao criar",
            description: "Não foi possível iniciar uma nova campanha.",
            variant: "destructive"
        });
    }
  };

  return (
    <>
      <Helmet>
        <title>Gerenciar Petições - Trombone Cidadão</title>
      </Helmet>

      <div className="container mx-auto px-4 py-8 max-w-6xl">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <Link to="/admin">
              <Button variant="ghost" size="icon" className="rounded-full">
                <ArrowLeft className="w-6 h-6" />
              </Button>
            </Link>
            <div>
              <h1 className="text-3xl font-bold text-foreground">Gerenciar Petições</h1>
              <p className="text-muted-foreground">Acompanhe as campanhas de abaixo-assinado.</p>
            </div>
          </div>
          <Button onClick={handleCreatePetition} className="gap-2">
            <Plus className="w-4 h-4" /> Criar Nova Petição
          </Button>
        </div>

        <Card className="mb-8">
          <CardContent className="pt-6">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
              <Input
                placeholder="Buscar por título..."
                className="pl-10"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Campanhas Ativas</CardTitle>
            <CardDescription>{filteredPetitions.length} campanhas encontradas.</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p>Carregando...</p>
            ) : (
              <div className="space-y-4">
                {filteredPetitions.length === 0 ? (
                    <p className="text-center text-muted-foreground py-8">Nenhum abaixo-assinado encontrado.</p>
                ) : (
                    filteredPetitions.map(petition => (
                    <div key={petition.id} className="flex flex-col md:flex-row justify-between items-start md:items-center p-4 bg-background rounded-lg border gap-4">
                        <div className="flex-1">
                        <h3 className="font-semibold text-lg flex items-center gap-2">
                            {petition.title}
                            <span className={`text-xs px-2 py-0.5 rounded-full border ${
                              petition.status === 'open' ? 'bg-green-100 text-green-800 border-green-200' : 
                              petition.status === 'victory' ? 'bg-yellow-100 text-yellow-800 border-yellow-200' :
                              petition.status === 'closed' ? 'bg-red-100 text-red-800 border-red-200' :
                              'bg-gray-100 text-gray-800'
                            }`}>
                              {petition.status === 'open' ? 'Publicada' : 
                               petition.status === 'victory' ? 'Vitória' :
                               petition.status === 'closed' ? 'Encerrada' : 'Rascunho'}
                            </span>
                        </h3>
                        <p className="text-sm text-muted-foreground mt-1 line-clamp-1">
                            {petition.description}
                        </p>
                        <div className="flex items-center gap-4 mt-2">
                            <div className="flex items-center gap-1 text-primary font-medium">
                                <FileSignature className="w-4 h-4" />
                                {petition.signatureCount} / {petition.goal} assinaturas
                            </div>
                            <div className="text-sm text-muted-foreground">
                                Criado em: {new Date(petition.created_at).toLocaleDateString('pt-BR')}
                            </div>
                        </div>
                        </div>
                        <div className="flex gap-2 items-center">
                            <Select 
                                value={petition.status} 
                                onValueChange={(val) => handleStatusChange(petition.id, val)}
                            >
                                <SelectTrigger className="w-[140px] h-9 text-xs">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="draft">Rascunho</SelectItem>
                                    <SelectItem value="open">Publicada</SelectItem>
                                    <SelectItem value="closed">Encerrada</SelectItem>
                                    <SelectItem value="victory">Vitória</SelectItem>
                                </SelectContent>
                            </Select>
                            <Link to={`/abaixo-assinado/${petition.id}`}>
                                <Button variant="outline" size="sm">Ver Página</Button>
                            </Link>
                        </div>
                    </div>
                    ))
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
};

export default ManagePetitionsPage;

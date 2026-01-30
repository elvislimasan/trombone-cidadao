import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet';
import { Search, Filter, TrendingUp, Users, Heart } from 'lucide-react';
import { supabase } from '@/lib/customSupabaseClient';
import Header from '@/components/Header';
import PetitionCard from '@/components/PetitionCard';
import DonationModal from '@/components/DonationModal';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';

const PetitionsOverviewPage = () => {
  const navigate = useNavigate();
  const [petitions, setPetitions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filter, setFilter] = useState('recent'); // recent, popular, almost_there
  const [selectedPetition, setSelectedPetition] = useState(null);
  const [showDonationModal, setShowDonationModal] = useState(false);
  const [stats, setStats] = useState({ totalSignatures: 0, totalPetitions: 0 });

  useEffect(() => {
    fetchPetitions();
  }, [filter]);

  const fetchPetitions = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('petitions')
        .select('*, signatures(count)')
        .eq('status', 'open');

      const { data, error } = await query;

      if (error) throw error;

      // Client-side sorting/filtering due to complex relationships
      let sortedData = data.map(p => ({
        ...p,
        signatureCount: p.signatures?.[0]?.count || 0,
        progress: Math.min(((p.signatures?.[0]?.count || 0) / (p.goal || 100)) * 100, 100)
      }));

      if (filter === 'popular') {
        sortedData.sort((a, b) => b.signatureCount - a.signatureCount);
      } else if (filter === 'almost_there') {
        sortedData.sort((a, b) => b.progress - a.progress);
      } else {
        // recent
        sortedData.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      }

      setPetitions(sortedData);

      // Calculate stats
      const totalSigs = sortedData.reduce((acc, curr) => acc + curr.signatureCount, 0);
      setStats({
        totalPetitions: sortedData.length,
        totalSignatures: totalSigs
      });

    } catch (error) {
      console.error('Error fetching petitions:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredPetitions = petitions.filter(p => 
    p.title.toLowerCase().includes(searchTerm.toLowerCase()) || 
    p.description?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleDonate = (petition) => {
    setSelectedPetition(petition);
    setShowDonationModal(true);
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Helmet>
        <title>Abaixo-Assinados | Trombone Cidadão</title>
        <meta name="description" content="Participe das causas que importam. Assine, compartilhe e ajude a transformar a cidade." />
      </Helmet>

      <Header />

      <main className="flex-1 container mx-auto px-4 sm:px-6 lg:px-8 py-8 max-w-7xl">
        {/* Hero Section */}
        <section className="mb-12 text-center max-w-3xl mx-auto">
          <h1 className="text-4xl md:text-5xl font-bold mb-4 tracking-tight text-foreground">
            Sua Voz, Nossa Força
          </h1>
          <p className="text-xl text-muted-foreground mb-8">
            Junte-se a milhares de cidadãos que estão transformando a cidade através de petições e ações coletivas.
          </p>
          
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 max-w-2xl mx-auto">
            <div className="bg-card border rounded-lg p-4 shadow-sm">
              <div className="text-3xl font-bold text-primary mb-1">{stats.totalPetitions}</div>
              <div className="text-sm text-muted-foreground font-medium">Causas Ativas</div>
            </div>
            <div className="bg-card border rounded-lg p-4 shadow-sm">
              <div className="text-3xl font-bold text-primary mb-1">{stats.totalSignatures}</div>
              <div className="text-sm text-muted-foreground font-medium">Assinaturas</div>
            </div>
            <div className="col-span-2 md:col-span-1 bg-card border rounded-lg p-4 shadow-sm">
              <div className="text-3xl font-bold text-green-600 mb-1">100%</div>
              <div className="text-sm text-muted-foreground font-medium">Comprometimento</div>
            </div>
          </div>
        </section>



        {/* Filters & Search */}
        <div className="flex flex-col md:flex-row gap-4 mb-8 sticky top-20 z-10 bg-background/95 backdrop-blur-sm p-4 rounded-lg border shadow-sm">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input 
              id="petition-search"
              placeholder="Buscar por título ou descrição..." 
              className="pl-9"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-2 min-w-[200px]">
            <Filter className="w-4 h-4 text-muted-foreground" />
            <Select value={filter} onValueChange={setFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Ordenar por" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="recent">Mais Recentes</SelectItem>
                <SelectItem value="popular">Mais Populares</SelectItem>
                <SelectItem value="almost_there">Quase na Meta</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Petitions Grid */}
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3, 4, 5, 6].map(i => (
              <div key={i} className="h-[400px] rounded-xl border bg-card">
                <Skeleton className="h-48 w-full rounded-t-xl" />
                <div className="p-5 space-y-4">
                  <Skeleton className="h-6 w-3/4" />
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-2/3" />
                  <div className="pt-4">
                    <Skeleton className="h-2 w-full rounded-full" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : filteredPetitions.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredPetitions.map((petition) => (
              <PetitionCard 
                key={petition.id}
                petition={petition}
                onClick={() => navigate(`/abaixo-assinado/${petition.id}`)}
              />
            ))}
          </div>
        ) : (
          <div className="text-center py-20 bg-muted/20 rounded-2xl border border-dashed">
            <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
              <Search className="w-8 h-8 text-muted-foreground" />
            </div>
            <h3 className="text-xl font-bold mb-2">Nenhuma petição encontrada</h3>
            <p className="text-muted-foreground">Tente ajustar seus termos de busca ou filtros.</p>
            <Button 
              variant="link" 
              onClick={() => { setSearchTerm(''); setFilter('recent'); }}
              className="mt-2"
            >
              Limpar filtros
            </Button>
          </div>
        )}

        {/* Engagement Section */}
        <div className="mt-12 mb-8 bg-primary/5 p-8 rounded-2xl border border-primary/10 flex flex-col md:flex-row items-center justify-between gap-6 shadow-sm">
          <div className="space-y-2 text-center md:text-left">
            <h3 className="text-2xl font-bold text-primary flex items-center justify-center md:justify-start gap-2">
              <Heart className="w-6 h-6 fill-primary" />
              Venha Contribuir
            </h3>
            <p className="text-muted-foreground max-w-xl">
              Sua doação ajuda a ampliar o alcance das petições e a pressionar por soluções mais rápidas. Cada contribuição faz a diferença na luta por uma cidade melhor.
            </p>
          </div>
          <Button 
            size="lg" 
            className="bg-primary hover:bg-primary/90 text-primary-foreground font-bold shadow-lg shrink-0 w-full md:w-auto"
            onClick={() => {
               document.getElementById('petition-search')?.focus();
               window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
          >
            Encontrar uma Causa
          </Button>
        </div>
      </main>

      <DonationModal
        isOpen={showDonationModal}
        onClose={() => setShowDonationModal(false)}
        petitionId={selectedPetition?.id}
        reportTitle={selectedPetition?.title}
        initialAmount={20}
      />
    </div>
  );
};

export default PetitionsOverviewPage;

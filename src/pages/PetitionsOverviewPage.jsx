import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet';
import { Search, Filter, TrendingUp, Users, Heart, ArrowRight, CheckCircle2, Megaphone, FileSignature } from 'lucide-react';
import { motion } from 'framer-motion';
import { supabase } from '@/lib/customSupabaseClient';
import Header from '@/components/Header';
import PetitionCard from '@/components/PetitionCard';
import DonationModal from '@/components/DonationModal';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';

const PetitionsOverviewPage = () => {
  const navigate = useNavigate();
  const [petitions, setPetitions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filter, setFilter] = useState('recent'); // recent, popular, almost_there
  const [selectedPetition, setSelectedPetition] = useState(null);
  const [showDonationModal, setShowDonationModal] = useState(false);
  const [stats, setStats] = useState({ totalSignatures: 0, totalPetitions: 0, successfulPetitions: 0 });
  const [featuredPetition, setFeaturedPetition] = useState(null);

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

      // Client-side processing
      let processedData = data.map(p => ({
        ...p,
        signatureCount: p.signatures?.[0]?.count || 0,
        progress: Math.min(((p.signatures?.[0]?.count || 0) / (p.goal || 100)) * 100, 100)
      }));

      // Find featured petition (highest progress but not 100% yet, or just most popular)
      // Prefer one that is > 50% progress but < 100%
      const featured = processedData.find(p => p.progress > 50 && p.progress < 100) || processedData.sort((a, b) => b.signatureCount - a.signatureCount)[0];
      setFeaturedPetition(featured);

      // Sorting
      if (filter === 'popular') {
        processedData.sort((a, b) => b.signatureCount - a.signatureCount);
      } else if (filter === 'almost_there') {
        processedData.sort((a, b) => b.progress - a.progress);
      } else {
        // recent
        processedData.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      }

      setPetitions(processedData);

      // Calculate stats
      const totalSigs = processedData.reduce((acc, curr) => acc + curr.signatureCount, 0);
      setStats({
        totalPetitions: processedData.length,
        totalSignatures: totalSigs,
        successfulPetitions: 12 // Placeholder or fetch closed/won petitions if available
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

  const container = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1
      }
    }
  };

  const item = {
    hidden: { opacity: 0, y: 20 },
    show: { opacity: 1, y: 0 }
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Helmet>
        <title>Abaixo-Assinados | Trombone Cidadão</title>
        <meta name="description" content="Participe das causas que importam. Assine, compartilhe e ajude a transformar a cidade." />
      </Helmet>

      <Header />

      <main className="flex-1">
        {/* Hero Section */}
        <section className="relative bg-muted/30 border-b">
          <div className="absolute inset-0 bg-grid-black/[0.02] dark:bg-grid-white/[0.02]" />
          <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-16 md:py-24 max-w-7xl relative z-10">
            <div className="grid lg:grid-cols-2 gap-12 items-center">
              <motion.div 
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.5 }}
              >
                <Badge className="mb-6 bg-primary/70 text-primary text-sm px-4 py-1.5 border border-primary/20 hover:bg-primary/80 transition-colors shadow-sm">
                  Mobilização Cidadã
                </Badge>
                <h1 className="text-4xl md:text-5xl lg:text-6xl font-extrabold mb-6 tracking-tight text-foreground leading-tight">
                  Sua Voz, <span className="text-primary">Nossa Força.</span>
                </h1>
                <p className="text-xl text-muted-foreground mb-8 max-w-lg leading-relaxed">
                  Transforme indignação em ação. Crie, assine e compartilhe petições para cobrar soluções reais para nossa cidade.
                </p>
                <div className="flex flex-col sm:flex-row gap-4">
                  <Button size="lg" className="h-12 px-8 text-lg shadow-lg" onClick={() => document.getElementById('petitions-list').scrollIntoView({ behavior: 'smooth' })}>
                    Ver Causas
                  </Button>
                  <Button variant="outline" size="lg" className="h-12 px-8 text-lg" onClick={() => navigate('/')}>
                    Relatar Problema
                  </Button>
                </div>
                
                <div className="mt-12 grid grid-cols-3 gap-8 border-t pt-8">
                  <div>
                    <div className="text-3xl font-bold text-foreground mb-1">{stats.totalPetitions}+</div>
                    <div className="text-sm text-muted-foreground">Causas Ativas</div>
                  </div>
                  <div>
                    <div className="text-3xl font-bold text-foreground mb-1">{stats.totalSignatures}+</div>
                    <div className="text-sm text-muted-foreground">Assinaturas</div>
                  </div>
                  <div>
                    <div className="text-3xl font-bold text-foreground mb-1">{stats.successfulPetitions}+</div>
                    <div className="text-sm text-muted-foreground">Vitórias</div>
                  </div>
                </div>
              </motion.div>

              <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.5, delay: 0.2 }}
                className="relative hidden lg:block"
              >
                {/* Abstract Visual Representation */}
                <div className="relative z-10 bg-card rounded-2xl shadow-2xl border p-2">
                  {featuredPetition ? (
                     <div className="bg-background rounded-xl overflow-hidden">
                        <div className="h-48 bg-muted relative">
                          {featuredPetition.image_url ? (
                            <img src={featuredPetition.image_url} alt={featuredPetition.title} className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center bg-primary/5">
                              <Megaphone className="w-16 h-16 text-primary/20" />
                            </div>
                          )}
                          <div className="absolute top-4 right-4 bg-background/90 backdrop-blur-sm px-3 py-1 rounded-full text-xs font-bold shadow-sm">
                            Em Destaque
                          </div>
                        </div>
                        <div className="p-6">
                          <h3 className="text-2xl font-bold mb-2">{featuredPetition.title}</h3>
                          <p className="text-muted-foreground line-clamp-2 mb-4">{featuredPetition.description}</p>
                          <div className="space-y-2">
                             <div className="flex justify-between text-sm font-medium">
                                <span>{featuredPetition.signatureCount} assinaturas</span>
                                <span>Meta: {featuredPetition.goal}</span>
                             </div>
                             <Progress value={featuredPetition.progress} className="h-2" />
                          </div>
                          <Button className="w-full mt-6" onClick={() => navigate(`/abaixo-assinado/${featuredPetition.id}`)}>
                            Apoiar Agora <ArrowRight className="ml-2 w-4 h-4" />
                          </Button>
                        </div>
                     </div>
                  ) : (
                    <div className="aspect-[4/3] bg-muted animate-pulse rounded-xl" />
                  )}
                </div>
                <div className="absolute inset-0 bg-primary/20 blur-3xl -z-10 rounded-full transform translate-y-4" />
              </motion.div>
            </div>
          </div>
        </section>

        {/* How it Works Section */}
        <section className="py-16 bg-background">
           <div className="container mx-auto px-4 max-w-7xl">
              <div className="text-center mb-16">
                 <h2 className="text-3xl font-bold mb-4">Como funciona?</h2>
                 <p className="text-muted-foreground max-w-2xl mx-auto">
                   O Trombone Cidadão facilita o processo de mobilização. Veja como sua ação pode gerar mudanças reais.
                 </p>
              </div>

              <div className="grid md:grid-cols-3 gap-8 relative">
                 {/* Connecting Line (Desktop) */}
                 <div className="hidden md:block absolute top-12 left-0 w-full h-0.5 bg-border -z-10" />

                 <div className="bg-background p-6 rounded-xl border shadow-sm relative text-center group hover:-translate-y-1 transition-transform">
                    <div className="w-24 h-24 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-6 border-4 border-background group-hover:border-primary/20 transition-colors">
                       <Megaphone className="w-10 h-10 text-primary" />
                    </div>
                    <h3 className="text-xl font-bold mb-3">1. Crie ou Apoie</h3>
                    <p className="text-muted-foreground text-sm">
                       Identifique um problema ou apoie uma causa existente. Cada assinatura conta como um voto de confiança.
                    </p>
                 </div>

                 <div className="bg-background p-6 rounded-xl border shadow-sm relative text-center group hover:-translate-y-1 transition-transform">
                    <div className="w-24 h-24 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-6 border-4 border-background group-hover:border-primary/20 transition-colors">
                       <Users className="w-10 h-10 text-primary" />
                    </div>
                    <h3 className="text-xl font-bold mb-3">2. Mobilize</h3>
                    <p className="text-muted-foreground text-sm">
                       Compartilhe nas redes sociais e grupos. Quanto mais visibilidade, maior a pressão sobre as autoridades.
                    </p>
                 </div>

                 <div className="bg-background p-6 rounded-xl border shadow-sm relative text-center group hover:-translate-y-1 transition-transform">
                    <div className="w-24 h-24 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-6 border-4 border-background group-hover:border-primary/20 transition-colors">
                       <CheckCircle2 className="w-10 h-10 text-primary" />
                    </div>
                    <h3 className="text-xl font-bold mb-3">3. Conquiste</h3>
                    <p className="text-muted-foreground text-sm">
                       Com metas atingidas, entregamos as demandas oficialmente. Acompanhe o progresso até a solução.
                    </p>
                 </div>
              </div>
           </div>
        </section>

        {/* Main Content: Filters & Grid */}
        <section id="petitions-list" className="py-16 bg-muted/30">
          <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-7xl">
            <div className="flex flex-col md:flex-row justify-between items-end gap-4 mb-8">
               <div>
                  <h2 className="text-3xl font-bold mb-2">Causas em Aberto</h2>
                  <p className="text-muted-foreground">Explore as petições que precisam do seu apoio hoje.</p>
               </div>
               
               {/* Search & Filters Toolbar */}
               <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto bg-background p-1.5 rounded-lg border shadow-sm">
                  <div className="relative flex-1 min-w-[250px]">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input 
                      placeholder="Buscar petições..." 
                      className="pl-9 border-none focus-visible:ring-0 bg-transparent h-10"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                    />
                  </div>
                  <div className="h-auto w-px bg-border mx-1 hidden sm:block" />
                  <Select value={filter} onValueChange={setFilter}>
                    <SelectTrigger className="w-full sm:w-[180px] border-none focus:ring-0 h-10">
                       <div className="flex items-center gap-2 text-muted-foreground">
                          <Filter className="w-4 h-4" />
                          <span className="text-foreground"><SelectValue /></span>
                       </div>
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
                  <div key={i} className="h-[420px] rounded-xl border bg-card overflow-hidden flex flex-col">
                    <Skeleton className="h-48 w-full" />
                    <div className="p-5 space-y-4 flex-1">
                      <Skeleton className="h-6 w-3/4" />
                      <Skeleton className="h-4 w-full" />
                      <Skeleton className="h-4 w-2/3" />
                      <div className="mt-auto pt-4">
                        <Skeleton className="h-2 w-full rounded-full" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : filteredPetitions.length > 0 ? (
              <motion.div 
                variants={container}
                initial="hidden"
                animate="show"
                className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
              >
                {filteredPetitions.map((petition) => (
                  <motion.div key={petition.id} variants={item}>
                    <PetitionCard 
                      petition={petition}
                      onClick={() => navigate(`/abaixo-assinado/${petition.id}`)}
                    />
                  </motion.div>
                ))}
              </motion.div>
            ) : (
              <div className="text-center py-20 bg-background rounded-2xl border border-dashed">
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
          </div>
        </section>

        {/* CTA / Donation Section */}
        <section className="py-16 bg-background">
           <div className="container mx-auto px-4 max-w-5xl">
              <div className="bg-primary/5 rounded-3xl p-8 md:p-12 border border-primary/10 relative overflow-hidden">
                 <div className="absolute top-0 right-0 w-64 h-64 bg-primary/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/3" />
                 
                 <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-8">
                    <div className="space-y-4 text-center md:text-left max-w-xl">
                       <h2 className="text-3xl font-bold text-foreground">Fortaleça a Democracia Local</h2>
                       <p className="text-lg text-muted-foreground">
                          O Trombone Cidadão é mantido pela comunidade. Sua contribuição nos ajuda a manter a plataforma no ar e a ampliar o alcance das demandas populares.
                       </p>
                    </div>
                    <div className="flex flex-col gap-3 min-w-[200px]">
                       <Button size="lg" className="h-12 text-lg shadow-lg font-bold" onClick={() => setShowDonationModal(true)}>
                          <Heart className="w-5 h-5 mr-2 fill-current" />
                          Quero Apoiar
                       </Button>
                       <p className="text-xs text-center text-muted-foreground">Transparência total em todas as doações.</p>
                    </div>
                 </div>
              </div>
           </div>
        </section>
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

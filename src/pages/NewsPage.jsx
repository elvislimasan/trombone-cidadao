import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Helmet } from 'react-helmet';
import { ExternalLink } from 'lucide-react';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';

const NewsPage = () => {
  const [newsItems, setNewsItems] = useState([]);
  const { toast } = useToast();

  const fetchNews = useCallback(async () => {
    const { data, error } = await supabase
      .from('news')
      .select('*')
      .order('date', { ascending: false });
    
    if (error) {
      toast({ title: "Erro ao buscar notícias", description: error.message, variant: "destructive" });
    } else {
      setNewsItems(data);
    }
  }, [toast]);

  useEffect(() => {
    fetchNews();
  }, [fetchNews]);

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1
      }
    }
  };

  const itemVariants = {
    hidden: { y: 20, opacity: 0 },
    visible: {
      y: 0,
      opacity: 1
    }
  };

  return (
    <>
      <Helmet>
        <title>Notícias - Trombone Cidadão</title>
        <meta name="description" content="Fique por dentro de todas as novidades sobre a plataforma Trombone Cidadão e o impacto na nossa cidade." />
      </Helmet>
      <div className="container mx-auto px-4 py-12">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="text-center mb-12"
        >
          <h1 className="text-4xl md:text-5xl font-bold text-tc-red">
            Trombone na Mídia
          </h1>
          <p className="mt-4 text-lg text-muted-foreground max-w-2xl mx-auto">
            Veja o que estão falando sobre o Trombone Cidadão e fique por dentro das últimas novidades da plataforma.
          </p>
        </motion.div>

        <motion.div
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8"
          variants={containerVariants}
          initial="hidden"
          animate="visible"
        >
          {newsItems.map((item) => (
            <motion.div key={item.id} variants={itemVariants}>
              <Card className="h-full flex flex-col bg-card border-border rounded-2xl overflow-hidden shadow-lg hover:shadow-2xl transition-shadow duration-300">
                <CardHeader className="p-0">
                  <img src={item.image_url} alt={item.title} className="w-full h-48 object-cover" />
                </CardHeader>
                <CardContent className="flex-grow p-6">
                  <p className="text-sm font-semibold text-tc-red mb-2">{item.source}</p>
                  <CardTitle className="text-xl font-bold text-foreground mb-3">{item.title}</CardTitle>
                  <p className="text-muted-foreground text-sm">{item.description}</p>
                </CardContent>
                <CardFooter className="p-6 bg-muted/50 flex justify-between items-center">
                  <p className="text-xs text-muted-foreground">{new Date(item.date).toLocaleDateString('pt-BR', { timeZone: 'UTC' })}</p>
                  <Button asChild variant="ghost" size="sm" className="text-tc-red hover:bg-tc-red/10 hover:text-tc-red">
                    <Link to={`/noticias/${item.id}`}>
                      Ler mais <ExternalLink className="w-4 h-4 ml-2" />
                    </Link>
                  </Button>
                </CardFooter>
              </Card>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </>
  );
};

export default NewsPage;
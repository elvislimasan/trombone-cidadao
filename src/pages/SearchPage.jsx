import React, { useEffect, useState, useCallback } from 'react';
import { Helmet } from 'react-helmet';
import { Link, useSearchParams } from 'react-router-dom';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Search, MapPin, Megaphone, Building, ShoppingCart } from 'lucide-react';

const SearchPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialTerm = searchParams.get('q') || '';
  const [term, setTerm] = useState(initialTerm);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState({
    reports: [],
    works: [],
    petitions: [],
    services: []
  });
  const { toast } = useToast();

  const runSearch = useCallback(
    async (query) => {
      const q = (query || '').trim();
      if (!q) {
        setResults({ reports: [], works: [], petitions: [], services: [] });
        return;
      }

      setLoading(true);
      const like = `%${q}%`;

      try {
        const [reportsRes, worksRes, petitionsRes, directoryRes] = await Promise.all([
          supabase
            .from('reports')
            .select('id, title, description, address, protocol')
            .or(`title.ilike.${like},description.ilike.${like},protocol.ilike.${like}`)
            .limit(10),
          supabase
            .from('public_works')
            .select('id, title, description, status')
            .or(`title.ilike.${like},description.ilike.${like}`)
            .limit(10),
          supabase
            .from('petitions')
            .select('id, title, description, status')
            .or(`title.ilike.${like},description.ilike.${like}`)
            .limit(10),
          supabase
            .from('directory')
            .select('id, name, address, type')
            .eq('status', 'approved')
            .or(`name.ilike.${like},address.ilike.${like}`)
            .limit(10)
        ]);

        if (reportsRes.error || worksRes.error || petitionsRes.error || directoryRes.error) {
          toast({
            title: 'Erro na busca',
            description: 'Não foi possível buscar pelos termos informados.',
            variant: 'destructive'
          });
          console.error('Search errors', {
            reportsError: reportsRes.error,
            worksError: worksRes.error,
            petitionsError: petitionsRes.error,
            directoryError: directoryRes.error
          });
        }

        setResults({
          reports: reportsRes.data || [],
          works: worksRes.data || [],
          petitions: petitionsRes.data || [],
          services: directoryRes.data || []
        });
      } catch (error) {
        console.error('Search exception', error);
        toast({
          title: 'Erro na busca',
          description: 'Ocorreu um erro inesperado ao buscar.',
          variant: 'destructive'
        });
      } finally {
        setLoading(false);
      }
    },
    [toast]
  );

  useEffect(() => {
    const q = searchParams.get('q') || '';
    setTerm(q);
    if (q) runSearch(q);
  }, [searchParams, runSearch]);

  const handleSubmit = (e) => {
    e.preventDefault();
    const q = term.trim();
    setSearchParams(q ? { q } : {});
    if (q) runSearch(q);
    else setResults({ reports: [], works: [], petitions: [], services: [] });
  };

  const hasResults =
    results.reports.length > 0 ||
    results.works.length > 0 ||
    results.petitions.length > 0 ||
    results.services.length > 0;

  return (
    <>
      <Helmet>
        <title>Buscar – Trombone Cidadão</title>
      </Helmet>
      <div className="container mx-auto px-4 py-10">
        <div className="max-w-3xl mx-auto mb-8 text-center">
          <h1 className="text-3xl md:text-4xl font-bold text-tc-red mb-3">Buscar na plataforma</h1>
          <p className="text-muted-foreground">
            Encontre broncas, obras públicas, abaixo-assinados e serviços usando palavras-chave.
          </p>
          <form onSubmit={handleSubmit} className="mt-6 flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="text"
                placeholder="Digite uma palavra-chave..."
                value={term}
                onChange={(e) => setTerm(e.target.value)}
                className="pl-9 h-11"
              />
            </div>
            <Button type="submit" className="h-11 px-6" disabled={loading}>
              {loading ? 'Buscando...' : 'Buscar'}
            </Button>
          </form>
        </div>

        {!loading && !hasResults && term.trim() && (
          <p className="text-center text-muted-foreground">
            Nenhum resultado encontrado para <span className="font-semibold">"{term.trim()}"</span>.
          </p>
        )}

        {!loading && !term.trim() && (
          <p className="text-center text-muted-foreground">
            Digite um termo na busca acima para ver resultados.
          </p>
        )}

        {hasResults && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Megaphone className="w-4 h-4 text-tc-red" />
                  Broncas
                </CardTitle>
              </CardHeader>
              <CardContent>
                {results.reports.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nenhuma bronca encontrada.</p>
                ) : (
                  <ul className="space-y-3">
                    {results.reports.map((r) => (
                      <li key={r.id} className="border-b last:border-b-0 pb-2 last:pb-0">
                        <Link to={`/bronca/${r.id}`} className="font-semibold text-sm hover:underline">
                          {r.title}
                        </Link>
                        {r.protocol && (
                          <p className="text-xs text-muted-foreground">Protocolo: {r.protocol}</p>
                        )}
                        {r.address && (
                          <p className="text-xs text-muted-foreground">{r.address}</p>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-blue-600" />
                  Obras públicas
                </CardTitle>
              </CardHeader>
              <CardContent>
                {results.works.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nenhuma obra encontrada.</p>
                ) : (
                  <ul className="space-y-3">
                    {results.works.map((w) => (
                      <li key={w.id} className="border-b last:border-b-0 pb-2 last:pb-0">
                        <Link
                          to={`/obras-publicas/${w.id}`}
                          className="font-semibold text-sm hover:underline"
                        >
                          {w.title}
                        </Link>
                        {w.description && (
                          <p className="text-xs text-muted-foreground line-clamp-2">
                            {w.description}
                          </p>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Megaphone className="w-4 h-4 text-emerald-600" />
                  Abaixo-assinados
                </CardTitle>
              </CardHeader>
              <CardContent>
                {results.petitions.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nenhum abaixo-assinado encontrado.</p>
                ) : (
                  <ul className="space-y-3">
                    {results.petitions.map((p) => (
                      <li key={p.id} className="border-b last:border-b-0 pb-2 last:pb-0">
                        <Link
                          to={`/abaixo-assinado/${p.id}`}
                          className="font-semibold text-sm hover:underline"
                        >
                          {p.title}
                        </Link>
                        {p.description && (
                          <p className="text-xs text-muted-foreground line-clamp-2">
                            {p.description}
                          </p>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Building className="w-4 h-4 text-indigo-600" />
                  Serviços públicos e comércio
                </CardTitle>
              </CardHeader>
              <CardContent>
                {results.services.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nenhum serviço ou comércio encontrado.</p>
                ) : (
                  <ul className="space-y-3">
                    {results.services.map((s) => (
                      <li key={s.id} className="border-b last:border-b-0 pb-2 last:pb-0">
                        <div className="flex items-center justify-between gap-2">
                          <div>
                            <p className="font-semibold text-sm">{s.name}</p>
                            {s.address && (
                              <p className="text-xs text-muted-foreground">{s.address}</p>
                            )}
                          </div>
                          <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                            <ShoppingCart className="w-3 h-3" />
                            {s.type === 'public' ? 'Serviço público' : 'Comércio'}
                          </span>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </>
  );
};

export default SearchPage;


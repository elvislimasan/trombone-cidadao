import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { Helmet } from 'react-helmet';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MapPin, Phone, Bus, Landmark, Building, PlusCircle } from 'lucide-react';
import { supabase } from '@/lib/customSupabaseClient';
import { useCityView, CityViewProvider } from '@/contexts/CityContext';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { usePermissions } from '@/hooks/usePermissions';
import CitySelector from '@/components/CitySelector';
import { showAppError } from '@/lib/appError';

const GuideCategoryIcon = ({ label, ...props }) => {
  const normalized = String(label || '').toLocaleLowerCase('pt-BR');
  if (normalized.includes('transport')) return <Bus {...props} />;
  if (normalized.includes('turíst')) return <Landmark {...props} />;
  return <Building {...props} />;
};

const ServicesPage = () => {
  const [selectedDirectoryGroup, setSelectedDirectoryGroup] = useState(null);
  const { cityId: activeCityId, cityName: activeCityName } = useCityView();
  const { user } = useAuth();
  const { canWrite } = usePermissions();

  // Mesma regra de imóveis alugados/pavimentação: admin/master gerenciam
  // qualquer cidade; embaixador puro só com uma cidade sua selecionada.
  const isPureAmbassador = Boolean(user?.is_ambassador && !user?.is_admin && !user?.is_master);
  const [myActiveCityIds, setMyActiveCityIds] = useState([]);
  const canManageServices = Boolean(
    (user?.is_admin || user?.is_master ||
      (isPureAmbassador && activeCityId && myActiveCityIds.some((id) => String(id) === String(activeCityId))))
    && canWrite('services')
  );

  const [directory, setDirectory] = useState({ all: [] });
  const [directoryCategories, setDirectoryCategories] = useState([]);

  const fetchData = useCallback(async () => {
    let directoryQuery = supabase.from('directory').select('*').eq('status', 'approved');
    if (activeCityId) directoryQuery = directoryQuery.eq('city_id', activeCityId);
    const { data: directoryData, error: directoryError } = await directoryQuery;
    if (directoryError) showAppError({ title: "Erro ao buscar Guia da Cidade", description: directoryError.message, variant: "destructive" });
    else {
      setDirectory({ all: directoryData });
    }

    const { data: categoriesData } = await supabase.from('directory_categories').select('*').eq('active', true).order('sort_order').order('name');
    setDirectoryCategories(categoriesData || []);

  }, [activeCityId]);

  useEffect(() => {
    fetchData();
    setSelectedDirectoryGroup(null);
  }, [fetchData]);

  useEffect(() => {
    if (!isPureAmbassador || !user?.id) { setMyActiveCityIds([]); return; }
    supabase
      .from('ambassador_cities')
      .select('city_id')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .then(({ data }) => setMyActiveCityIds((data || []).map((r) => r.city_id)));
  }, [isPureAmbassador, user?.id]);

  const directoryGroups = useMemo(() => {
    const byId = new Map(directoryCategories.map((category) => [String(category.id), category]));
    const groups = new Map();
    for (const entry of directory.all || []) {
      const category = byId.get(String(entry.category_id || ''));
      const parent = category?.parent_id ? byId.get(String(category.parent_id)) : null;
      const key = category?.id || `legacy-${entry.type || 'other'}`;
      const label = category
        ? `${parent ? `${parent.name} · ` : ''}${category.name}`
        : entry.type === 'public' ? 'Serviços públicos' : 'Comércio e outros locais';
      if (!groups.has(key)) groups.set(key, { key, label, entries: [] });
      groups.get(key).entries.push(entry);
    }
    return [...groups.values()].sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'));
  }, [directory, directoryCategories]);

  const selectedGroup = directoryGroups.find((group) => group.key === selectedDirectoryGroup) || null;

  const DirectoryCard = ({ item }) => (
    <Link to={`/servicos/guia/${item.id}`} className="block">
    <Card className="overflow-hidden transition-shadow hover:shadow-md">
      <div className="flex">
        <div className="w-1/3 min-w-[80px]">
          <img src={item.image_url} alt={item.name} className="h-full w-full object-cover" />
        </div>
        <div className="w-2/3 p-3 md:p-4 flex flex-col justify-center min-w-0">
          <h3 className="font-semibold text-sm md:text-base text-foreground truncate">{item.name}</h3>
          {(item.guide_metadata?.destination || item.description) && (
            <p className="mt-1 truncate text-[10px] text-muted-foreground md:text-sm">{item.guide_metadata?.destination ? `Destino: ${item.guide_metadata.destination}` : item.description}</p>
          )}
          <p className="text-[10px] md:text-sm text-muted-foreground flex items-center gap-1.5 mt-1 truncate"><MapPin className="w-3 h-3 flex-shrink-0" /> {item.address}</p>
          <p className="text-[10px] md:text-sm text-muted-foreground flex items-center gap-1.5 mt-1"><Phone className="w-3 h-3 flex-shrink-0" /> {item.phone}</p>
        </div>
      </div>
    </Card>
    </Link>
  );

  return (
    <>
      <Helmet>
        <title>Guia da Cidade - Trombone Cidadão</title>
        <meta name="description" content={`Encontre informações úteis sobre ${activeCityName || 'sua cidade'}: pontos turísticos, transportes e Guia da Cidade.`} />
      </Helmet>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="mx-auto w-full max-w-[112rem] px-3 py-8 sm:px-5 lg:px-8"
      >
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold tracking-tight text-foreground sm:text-5xl gradient-text">
            Guia da Cidade{activeCityName ? ` de ${activeCityName}` : ''}
          </h1>
          <p className="mt-3 text-lg text-muted-foreground">
            Tudo o que você precisa saber sobre a cidade em um só lugar.
          </p>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
            <CitySelector />
            {canManageServices && (
              <Link to="/servicos/gerenciar">
                <Button size="sm" variant="outline" className="gap-1.5 text-xs border-tc-red/30 text-tc-red hover:bg-tc-red/5">
                  <PlusCircle className="w-3.5 h-3.5" /> Adicionar item
                </Button>
              </Link>
            )}
          </div>
        </div>

        <section className="mb-8">
          <div className="mb-4 flex items-end justify-between gap-3">
            <div>
              <h2 className="text-2xl font-bold text-foreground">Explore por categoria</h2>
              <p className="mt-1 text-sm text-muted-foreground">Comércio, serviços, turismo e transporte no mesmo guia.</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {directoryGroups.map((group) => (
              <button
                key={group.key}
                type="button"
                onClick={() => setSelectedDirectoryGroup((current) => current === group.key ? null : group.key)}
                className={`rounded-2xl border p-4 text-left transition-all hover:-translate-y-0.5 hover:shadow-md ${selectedDirectoryGroup === group.key ? 'border-primary bg-primary/10' : 'border-border bg-card'}`}
                aria-pressed={selectedDirectoryGroup === group.key}
              >
                <GuideCategoryIcon label={group.label} className="h-6 w-6 text-primary" />
                <span className="mt-3 block line-clamp-2 text-sm font-bold text-foreground">{group.label}</span>
                <span className="text-xs text-muted-foreground">{group.entries.length} locais</span>
              </button>
            ))}
          </div>
        </section>

        {selectedGroup && (
          <section className="mt-8 space-y-4">
            <h2 className="flex items-center gap-3 text-2xl font-bold">
              <GuideCategoryIcon label={selectedGroup.label} className="h-6 w-6 text-primary" />
              {selectedGroup.label}
            </h2>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {selectedGroup.entries.map((item) => <DirectoryCard key={item.id} item={item} />)}
            </div>
          </section>
        )}
        {!selectedGroup && directoryGroups.length > 0 && (
          <p className="mt-8 rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">Selecione uma categoria para ver os locais.</p>
        )}
        {directoryGroups.length === 0 && (
          <p className="mt-8 rounded-2xl border border-dashed p-10 text-center text-sm text-muted-foreground">Nenhum local cadastrado nesta cidade.</p>
        )}
      </motion.div>
    </>
  );
};

// Filtro de cidade local a esta tela — ver os servicos de outra cidade e uma
// consulta, nao uma mudanca de onde o usuario mora.
export default function ServicesPageWithCityView() {
  return (
    <CityViewProvider>
      <ServicesPage />
    </CityViewProvider>
  );
}

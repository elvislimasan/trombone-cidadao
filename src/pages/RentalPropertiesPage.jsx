import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Helmet } from 'react-helmet';
import { motion } from 'framer-motion';
import { Link, useNavigate } from 'react-router-dom';
import { Search, Building, DollarSign, TrendingUp, TrendingDown, Maximize2, Minimize2, Download, Loader2, User, PlusCircle } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Combobox } from '@/components/ui/combobox';
import RentalPropertiesMapView from '@/components/RentalPropertiesMapView';
import CitySelector from '@/components/CitySelector';
import { useCity } from '@/contexts/CityContext';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { formatCurrency } from '@/lib/utils';
import jsPDF from 'jspdf';
import 'jspdf-autotable';

const StatCard = ({ icon: Icon, label, value, color }) => (
  <Card className="border-border">
    <CardContent className="p-4 flex items-center gap-3">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${color}`}>
        <Icon className="w-5 h-5 text-white" />
      </div>
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-sm font-bold text-foreground">{value}</p>
      </div>
    </CardContent>
  </Card>
);

const RentalPropertiesPage = () => {
  const { activeCityId, activeCityName } = useCity();
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  // Admin/master gerenciam qualquer cidade. Embaixador puro só faz sentido
  // clicar "Adicionar" quando já tem uma cidade específica selecionada no
  // CitySelector (sem isso, não saberíamos em qual das suas cidades criar).
  const isPureAmbassador = Boolean(user?.is_ambassador && !user?.is_admin && !user?.is_master);
  const canManageProperties = Boolean(
    user?.is_admin || user?.is_master || (isPureAmbassador && activeCityId)
  );
  const [properties, setProperties] = useState([]);
  const [bairros, setBairros] = useState([]);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [searchOwner, setSearchOwner] = useState('');
  const [selectedBairro, setSelectedBairro] = useState('all');

  const fetchProperties = useCallback(async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('rental_properties')
        .select(`
          id, address, location, is_active, area_m2, bairro_id,
          bairro:bairro_id(id, name),
          contracts:rental_property_contracts(id, owner_name, monthly_value, is_current, start_date, end_date)
        `)
        .order('created_at', { ascending: false });
      if (activeCityId) query = query.eq('city_id', activeCityId);
      const { data, error } = await query;
      if (error) throw error;
      const formatted = (data || []).map((p) => {
        const currentContract = (p.contracts || []).find((c) => c.is_current) || null;
        return {
          ...p,
          location: p.location ? { lat: p.location.coordinates[1], lng: p.location.coordinates[0] } : null,
          currentContract,
          monthly_value: currentContract?.monthly_value ?? null,
          owner_name: currentContract?.owner_name ?? null,
        };
      });
      setProperties(formatted);
    } catch (error) {
      toast({ title: 'Erro ao buscar imóveis alugados', description: error.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [activeCityId, toast]);

  const fetchBairros = useCallback(async () => {
    let query = supabase.from('bairros').select('id, name');
    if (activeCityId) query = query.eq('city_id', activeCityId);
    const { data, error } = await query;
    if (!error) setBairros(data || []);
  }, [activeCityId]);

  useEffect(() => {
    fetchProperties();
    fetchBairros();
    setSelectedBairro('all');
  }, [fetchProperties, fetchBairros]);

  const filteredProperties = useMemo(() => {
    return properties.filter((p) => {
      const ownerMatch = !searchOwner.trim() || (p.owner_name || '').toLowerCase().includes(searchOwner.trim().toLowerCase());
      const bairroMatch = selectedBairro === 'all' || p.bairro_id === selectedBairro;
      return ownerMatch && bairroMatch;
    });
  }, [properties, searchOwner, selectedBairro]);

  const stats = useMemo(() => {
    const active = filteredProperties.filter((p) => p.is_active && p.monthly_value != null);
    const withArea = filteredProperties.filter((p) => Number.isFinite(Number(p.area_m2)));
    const mostExpensive = active.length ? active.reduce((a, b) => (Number(b.monthly_value) > Number(a.monthly_value) ? b : a)) : null;
    const cheapest = active.length ? active.reduce((a, b) => (Number(b.monthly_value) < Number(a.monthly_value) ? b : a)) : null;
    const largest = withArea.length ? withArea.reduce((a, b) => (Number(b.area_m2) > Number(a.area_m2) ? b : a)) : null;
    const smallest = withArea.length ? withArea.reduce((a, b) => (Number(b.area_m2) < Number(a.area_m2) ? b : a)) : null;
    const annualTotal = active.reduce((sum, p) => sum + Number(p.monthly_value || 0), 0) * 12;
    return { mostExpensive, cheapest, largest, smallest, annualTotal };
  }, [filteredProperties]);

  const handleDownloadReport = () => {
    setDownloading(true);
    try {
      const doc = new jsPDF();
      const title = `Relatório de Imóveis Alugados${activeCityName ? ` — ${activeCityName}` : ''}`;
      doc.setFontSize(16);
      doc.text(title, 14, 18);
      doc.setFontSize(10);
      doc.text(`Gerado em: ${new Date().toLocaleString('pt-BR')}`, 14, 26);
      doc.setFontSize(12);
      doc.text(`Gasto anual total (contratos ativos): ${formatCurrency(stats.annualTotal)}`, 14, 34);

      const rows = filteredProperties.map((p) => [
        p.address,
        p.bairro?.name || '-',
        p.owner_name || '-',
        p.monthly_value != null ? formatCurrency(p.monthly_value) : '-',
        p.is_active ? 'Ativo' : 'Encerrado',
      ]);
      doc.autoTable({
        head: [['Endereço', 'Bairro', 'Proprietário', 'Valor mensal', 'Status']],
        body: rows,
        startY: 42,
        styles: { fontSize: 9 },
      });
      doc.save(`relatorio_imoveis_alugados_${new Date().toISOString().split('T')[0]}.pdf`);
      toast({ title: 'Download concluído!' });
    } catch (error) {
      toast({ title: 'Erro ao gerar relatório', description: error.message, variant: 'destructive' });
    } finally {
      setTimeout(() => setDownloading(false), 500);
    }
  };

  return (
    <>
      <Helmet>
        <title>Imóveis Alugados - Trombone Cidadão</title>
        <meta name="description" content="Acompanhe os imóveis alugados pela prefeitura, valores e contratos." />
      </Helmet>
      <div className="container max-w-[88rem] mx-auto w-full px-4 py-8">
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="text-center mb-8">
          <h1 className="text-3xl md:text-4xl font-bold text-tc-red">Imóveis Alugados pela Prefeitura</h1>
          <p className="mt-2 text-muted-foreground">Acompanhe os gastos e o uso de cada imóvel alugado</p>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
            <CitySelector />
            {canManageProperties && (
              <Link to="/imoveis-alugados/gerenciar">
                <Button className="gap-2">
                  <PlusCircle className="w-4 h-4" /> Adicionar imóvel
                </Button>
              </Link>
            )}
          </div>
        </motion.div>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
          <StatCard icon={TrendingUp} label="Mais caro" value={stats.mostExpensive ? formatCurrency(stats.mostExpensive.monthly_value) : '—'} color="bg-red-500" />
          <StatCard icon={TrendingDown} label="Mais barato" value={stats.cheapest ? formatCurrency(stats.cheapest.monthly_value) : '—'} color="bg-green-500" />
          <StatCard icon={Maximize2} label="Maior imóvel" value={stats.largest ? `${stats.largest.area_m2}m²` : '—'} color="bg-blue-500" />
          <StatCard icon={Minimize2} label="Menor imóvel" value={stats.smallest ? `${stats.smallest.area_m2}m²` : '—'} color="bg-amber-500" />
          <StatCard icon={DollarSign} label="Gasto anual total" value={formatCurrency(stats.annualTotal)} color="bg-tc-red" />
        </div>

        <Card className="mb-6 p-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-center">
            <div className="relative md:col-span-2">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder="Buscar por nome do proprietário..." className="pl-9" value={searchOwner} onChange={(e) => setSearchOwner(e.target.value)} />
            </div>
            <Combobox
              value={selectedBairro}
              onChange={setSelectedBairro}
              options={[{ value: 'all', label: 'Todos os bairros' }, ...bairros.map((b) => ({ value: b.id, label: b.name }))]}
              placeholder="Filtrar por bairro"
              searchPlaceholder="Buscar bairro..."
            />
            <Button onClick={handleDownloadReport} disabled={downloading} variant="outline">
              {downloading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
              Baixar Relatório
            </Button>
          </div>
        </Card>

        {loading ? (
          <div className="text-center p-8">Carregando imóveis...</div>
        ) : (
          <>
            <div className="h-[50vh] w-full rounded-xl overflow-hidden shadow-lg border mb-6">
              <RentalPropertiesMapView properties={filteredProperties} onSelectProperty={(p) => navigate(`/imoveis-alugados/${p.id}`)} />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredProperties.length > 0 ? filteredProperties.map((property) => (
                <Card key={property.id} className="overflow-hidden hover:shadow-lg transition-shadow flex flex-col h-full">
                  <div className="relative h-32 w-full bg-muted">
                    {property.thumbnail_url ? (
                      <img src={property.thumbnail_url} alt={property.address} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-muted-foreground"><Building className="w-8 h-8" /></div>
                    )}
                  </div>
                  <CardContent className="p-4 flex flex-col flex-1">
                    <h3 className="font-bold mb-1 line-clamp-1">{property.address}</h3>
                    <p className="text-xs text-muted-foreground mb-2">{property.bairro?.name || 'Bairro não informado'}</p>
                    {property.owner_name && (
                      <p className="text-xs text-muted-foreground flex items-center gap-1 mb-1"><User className="w-3 h-3" /> {property.owner_name}</p>
                    )}
                    {property.monthly_value != null && (
                      <p className="text-sm font-semibold text-tc-red mt-auto">{formatCurrency(property.monthly_value)}/mês</p>
                    )}
                    <Link to={`/imoveis-alugados/${property.id}`} className="mt-3">
                      <Button className="w-full" size="sm">Ver Detalhes</Button>
                    </Link>
                  </CardContent>
                </Card>
              )) : (
                <div className="col-span-full text-center py-10">
                  <p className="text-muted-foreground">Nenhum imóvel encontrado com os filtros selecionados.</p>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </>
  );
};

export default RentalPropertiesPage;

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Helmet } from 'react-helmet';
import { motion } from 'framer-motion';
import { Link, useNavigate } from 'react-router-dom';
import { Search, DollarSign, TrendingUp, TrendingDown, Maximize2, Minimize2, Download, Loader2, PlusCircle, Map, List, Building2, MapPin } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Combobox } from '@/components/ui/combobox';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import RentalPropertiesMapView from '@/components/RentalPropertiesMapView';
import CitySelector from '@/components/CitySelector';
import { useCityView, CityViewProvider } from '@/contexts/CityContext';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { usePermissions } from '@/hooks/usePermissions';
import { supabase } from '@/lib/customSupabaseClient';
import { formatCurrency, formatAddressWithNumber } from '@/lib/utils';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import { showAppError } from '@/lib/appError';
import TelaDeMapa from '@/components/map/TelaDeMapa';
import CartoesDeMapa from '@/components/map/CartoesDeMapa';
import { useTelaLarga } from '@/hooks/useTelaLarga';

const RentalPropertiesPage = () => {
  const { cityId: activeCityId, cityName: activeCityName } = useCityView();
  const { user } = useAuth();
  const { canWrite } = usePermissions();
  const navigate = useNavigate();
  const telaLarga = useTelaLarga();
  // Admin/master gerenciam qualquer cidade. Embaixador puro só pode gerenciar
  // a(s) própria(s) cidade(s) — precisamos saber quais são, não basta checar
  // se ALGUMA cidade está selecionada (poderia ser a cidade de outro embaixador).
  const isPureAmbassador = Boolean(user?.is_ambassador && !user?.is_admin && !user?.is_master);
  const [myActiveCityIds, setMyActiveCityIds] = useState([]);
  const canManageProperties = Boolean(
    (user?.is_admin || user?.is_master ||
      (isPureAmbassador && activeCityId && myActiveCityIds.some((id) => String(id) === String(activeCityId))))
    && canWrite('rentals')
  );

  useEffect(() => {
    if (!isPureAmbassador || !user?.id) { setMyActiveCityIds([]); return; }
    supabase
      .from('ambassador_cities')
      .select('city_id')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .then(({ data }) => setMyActiveCityIds((data || []).map((r) => r.city_id)));
  }, [isPureAmbassador, user?.id]);

  const [properties, setProperties] = useState([]);
  const [bairros, setBairros] = useState([]);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [searchOwner, setSearchOwner] = useState('');
  const [selectedBairro, setSelectedBairro] = useState('all');
  const [view, setView] = useState('map');

  const fetchProperties = useCallback(async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('rental_properties')
        .select(`
          id, title, address, street_number, department, thumbnail_url, location, is_active, area_m2, bairro_id,
          bairro:bairro_id(id, name),
          contracts:rental_property_contracts(id, owner_name, monthly_value, is_current, start_date, end_date),
          media:rental_property_media(url)
        `)
        .order('created_at', { ascending: false });
      if (activeCityId) query = query.eq('city_id', activeCityId);
      const { data, error } = await query;
      if (error) throw error;
      const parseLocation = (loc) => {
        if (!loc) return null;
        if (typeof loc === 'object' && Array.isArray(loc.coordinates)) {
          return { lat: loc.coordinates[1], lng: loc.coordinates[0] };
        }
        if (typeof loc === 'string') {
          const match = loc.match(/POINT\(([-\d.]+) ([-\d.]+)\)/);
          if (match) return { lat: parseFloat(match[2]), lng: parseFloat(match[1]) };
        }
        return null;
      };
      const formatted = (data || []).map((p) => {
        const currentContract = (p.contracts || []).find((c) => c.is_current) || null;
        return {
          ...p,
          location: parseLocation(p.location),
          currentContract,
          monthly_value: currentContract?.monthly_value ?? null,
          owner_name: currentContract?.owner_name ?? null,
          // Nem todo imóvel tem thumbnail_url definido — cai para a primeira
          // foto da galeria (rental_property_media), mesmo padrão já usado na
          // página de detalhes (property.thumbnail_url || media[0]?.url).
          coverImage: p.thumbnail_url || p.media?.[0]?.url || null,
        };
      });
      setProperties(formatted);
    } catch (error) {
      showAppError({ title: 'Erro ao buscar imóveis alugados', description: error.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [activeCityId]);

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

  const LIST_PAGE_SIZE = 9;
  const [currentPage, setCurrentPage] = useState(1);
  // Volta para a página 1 sempre que o conjunto filtrado muda — evita ficar
  // numa página vazia depois de trocar cidade/bairro/busca.
  useEffect(() => { setCurrentPage(1); }, [filteredProperties]);
  const totalPages = Math.max(1, Math.ceil(filteredProperties.length / LIST_PAGE_SIZE));
  const paginatedProperties = useMemo(() => {
    const start = (currentPage - 1) * LIST_PAGE_SIZE;
    return filteredProperties.slice(start, start + LIST_PAGE_SIZE);
  }, [filteredProperties, currentPage]);

  const stats = useMemo(() => {
    const active = filteredProperties.filter((p) => p.is_active && p.monthly_value != null);
    const withArea = filteredProperties.filter((p) => p.area_m2 !== null && p.area_m2 !== '' && Number.isFinite(Number(p.area_m2)));
    const mostExpensive = active.length ? active.reduce((a, b) => (Number(b.monthly_value) > Number(a.monthly_value) ? b : a)) : null;
    const cheapest = active.length ? active.reduce((a, b) => (Number(b.monthly_value) < Number(a.monthly_value) ? b : a)) : null;
    const largest = withArea.length ? withArea.reduce((a, b) => (Number(b.area_m2) > Number(a.area_m2) ? b : a)) : null;
    const smallest = withArea.length ? withArea.reduce((a, b) => (Number(b.area_m2) < Number(a.area_m2) ? b : a)) : null;
    const annualTotal = active.reduce((sum, p) => sum + Number(p.monthly_value || 0), 0) * 12;
    // Contagem de ativos por is_active, sem exigir valor mensal: o numero
    // responde "quantos imoveis a prefeitura aluga hoje", e um contrato ainda
    // sem valor cadastrado continua sendo um imovel alugado. `active` acima e
    // outra coisa — a base do calculo de gasto, onde sem valor nao ha o que somar.
    const activeCount = filteredProperties.filter((p) => p.is_active).length;
    return { mostExpensive, cheapest, largest, smallest, annualTotal, activeCount };
  }, [filteredProperties]);

  // A MESMA LISTA DE CARTÕES NOS DOIS MODOS
  //
  // Este desenho — quadrado colorido, rótulo pequeno, valor em negrito — nasceu
  // aqui e agora é o de todas as telas de mapa (`CartoesDeMapa`). Escrever a
  // lista uma vez é o que garante que trocar de mapa para lista não pareça ter
  // trocado também o recorte.
  const cartoesDeImoveis = useMemo(() => [
    { id: 'caro', Icone: TrendingUp, cor: 'bg-red-500', rotulo: 'Mais caro', valor: stats.mostExpensive ? formatCurrency(stats.mostExpensive.monthly_value) : '—' },
    { id: 'barato', Icone: TrendingDown, cor: 'bg-green-500', rotulo: 'Mais barato', valor: stats.cheapest ? formatCurrency(stats.cheapest.monthly_value) : '—' },
    { id: 'maior', Icone: Maximize2, cor: 'bg-blue-500', rotulo: 'Maior imóvel', valor: stats.largest ? `${stats.largest.area_m2}m²` : '—' },
    { id: 'menor', Icone: Minimize2, cor: 'bg-amber-500', rotulo: 'Menor imóvel', valor: stats.smallest ? `${stats.smallest.area_m2}m²` : '—' },
    { id: 'anual', Icone: DollarSign, cor: 'bg-tc-red', rotulo: 'Gasto anual total', valor: formatCurrency(stats.annualTotal) },
  ], [stats]);

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
        p.title || '-',
        formatAddressWithNumber(p.address, p.street_number),
        p.bairro?.name || '-',
        p.department || '-',
        p.owner_name || '-',
        p.monthly_value != null ? formatCurrency(p.monthly_value) : '-',
        p.is_active ? 'Ativo' : 'Encerrado',
      ]);
      doc.autoTable({
        head: [['Título', 'Endereço', 'Bairro', 'Secretaria', 'Proprietário', 'Valor mensal', 'Status']],
        body: rows,
        startY: 42,
        styles: { fontSize: 9 },
      });
      doc.save(`relatorio_imoveis_alugados_${new Date().toISOString().split('T')[0]}.pdf`);
    } catch (error) {
      showAppError({ title: 'Erro ao gerar relatório', description: error.message, variant: 'destructive' });
    } finally {
      setTimeout(() => setDownloading(false), 500);
    }
  };

  // ── Colunas, a partir de 1100px ───────────────────────────────────────────
  //
  // Mesma moldura das outras telas de mapa. Só no modo MAPA — a lista tem
  // paginação e cartões em grade, e não é uma tela de mapa.
  if (telaLarga && view === 'map' && !loading) {
    return (
      <TelaDeMapa
        titulo="Imóveis Alugados pela Prefeitura"
        subtitulo="Onde ficam, de quem são e quanto custam por mês"
        tituloDaAba="Imóveis Alugados - Trombone Cidadão"
        descricaoSeo="Veja no mapa os imóveis alugados pela prefeitura, com valor mensal e proprietário."
        filtrosLigados={(searchOwner.trim() ? 1 : 0) + (selectedBairro !== 'all' ? 1 : 0)}
        /* OS MESMOS CINCO CARTÕES DA LISTA
           O modo mapa e o modo lista são a mesma tela em duas formas. Mostrar
           números diferentes em cada uma faria a pessoa achar que a troca de
           modo também trocou o recorte. */
        destaque={
          <span className="inline-flex items-center gap-2 rounded-full bg-green-100 px-3 py-1.5 text-sm font-bold text-green-700">
            <Building2 className="h-4 w-4" />
            {stats.activeCount} {stats.activeCount === 1 ? 'imóvel alugado' : 'imóveis alugados'} (ativos)
          </span>
        }
        estatisticas={
          <CartoesDeMapa
            cartoes={cartoesDeImoveis}
            rodape="Números sobre os imóveis filtrados. A projeção anual é a soma dos aluguéis vigentes vezes doze — não o que foi pago."
          />
        }
        filtros={
          <div className="flex h-full flex-col gap-3 overflow-y-auto rounded-2xl border border-edge-subtle bg-surface-raised p-3 shadow-sm">
            <CitySelector />

            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-content-tertiary" />
              <Input
                placeholder="Buscar proprietário"
                className="h-9 pl-8 text-sm"
                value={searchOwner}
                onChange={(e) => setSearchOwner(e.target.value)}
              />
            </div>

            <Combobox
              value={selectedBairro}
              onChange={setSelectedBairro}
              options={[{ value: 'all', label: 'Todos os bairros' }, ...bairros.map((b) => ({ value: b.id, label: b.name }))]}
              placeholder="Bairro"
              searchPlaceholder="Buscar bairro..."
            />

            <div className="mt-auto grid gap-2">
              <ToggleGroup
                type="single"
                value={view}
                onValueChange={(v) => v && setView(v)}
                className="justify-center rounded-md border"
              >
                <ToggleGroupItem value="map" aria-label="Ver mapa" className="flex-1"><Map className="h-4 w-4" /></ToggleGroupItem>
                <ToggleGroupItem value="list" aria-label="Ver lista" className="flex-1"><List className="h-4 w-4" /></ToggleGroupItem>
              </ToggleGroup>

              {canManageProperties && (
                <Link to="/imoveis-alugados/gerenciar" className="w-full">
                  <Button size="sm" variant="outline" className="w-full gap-1.5 text-xs">
                    <PlusCircle className="h-3.5 w-3.5" /> Adicionar imóvel
                  </Button>
                </Link>
              )}
            </div>
          </div>
        }
        mapa={
          <RentalPropertiesMapView
            properties={filteredProperties}
            onSelectProperty={(p) => navigate(`/imoveis-alugados/${p.id}`)}
          />
        }
        painel={
          <div className="grid gap-3">
            <section className="rounded-2xl border border-edge-subtle bg-surface-raised p-4 shadow-sm">
              <p className="flex items-center gap-2.5 text-sm font-bold text-content-primary">
                <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-brand-subtleBg text-brand-subtleFg">
                  <Building2 className="h-4 w-4" />
                </span>
                Imóveis no recorte
              </p>
              <p className="mt-3 text-3xl font-extrabold leading-none text-content-primary tabular-nums">
                {filteredProperties.length}
              </p>
              <p className="mt-1 text-xs text-content-secondary">
                {stats.activeCount} com contrato ativo.
              </p>
            </section>

            {/* O ANUAL É PROJEÇÃO, E O RÓTULO PRECISA DIZER ISSO
                É a soma dos aluguéis mensais vigentes multiplicada por doze — não
                o que a prefeitura de fato pagou no ano. Chamá-lo de "gasto anual"
                seco afirmaria um número de execução orçamentária que esta tela
                não tem como conferir. */}
            <section className="rounded-2xl border border-edge-subtle bg-surface-raised p-4 shadow-sm">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-content-tertiary">
                Nos imóveis filtrados
              </p>
              <p className="mt-2 text-lg font-extrabold leading-none text-content-primary tabular-nums">
                {formatCurrency(stats.annualTotal)}
              </p>
              <p className="mt-0.5 text-[11px] text-content-secondary">
                Projeção anual dos contratos vigentes
              </p>

              <Button
                onClick={handleDownloadReport}
                disabled={downloading}
                variant="outline"
                size="sm"
                className="mt-3 w-full gap-1.5 text-xs"
              >
                {downloading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                Baixar relatório
              </Button>
            </section>
          </div>
        }
      />
    );
  }


  return (
    <>
      <Helmet>
        <title>Imóveis Alugados - Trombone Cidadão</title>
        <meta name="description" content="Acompanhe os imóveis alugados pela prefeitura, valores e contratos." />
      </Helmet>
      <div className="container max-w-[88rem] mx-auto w-full px-4 py-8">
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="relative z-[900] text-center mb-8">
          <h1 className="text-3xl md:text-4xl font-bold text-tc-red">Imóveis Alugados pela Prefeitura</h1>
          <p className="mt-2 text-muted-foreground">Acompanhe os gastos e o uso de cada imóvel alugado</p>
          {!loading && (
            <div className="mt-3 flex justify-center">
              <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-green-100 text-green-700 text-sm font-bold">
                <Building2 className="w-4 h-4" />
                {stats.activeCount} {stats.activeCount === 1 ? 'imóvel alugado' : 'imóveis alugados'} (ativos)
              </span>
            </div>
          )}
          <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
            <CitySelector />
            {canManageProperties && (
              <Link to="/imoveis-alugados/gerenciar">
                <Button size="sm" variant="outline" className="gap-1.5 text-xs border-tc-red/30 text-tc-red hover:bg-tc-red/5">
                  <PlusCircle className="w-3.5 h-3.5" /> Adicionar imóvel
                </Button>
              </Link>
            )}
          </div>
        </motion.div>

        <div className="mb-6">
          <CartoesDeMapa cartoes={cartoesDeImoveis} />
        </div>

        <Card className="mb-6 p-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 items-center">
            <div className="relative md:col-span-2 lg:col-span-2">
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
            <ToggleGroup type="single" value={view} onValueChange={(v) => v && setView(v)} className="border rounded-md justify-center">
              <ToggleGroupItem value="map" aria-label="Ver mapa" className="flex-1"><Map className="h-4 w-4" /></ToggleGroupItem>
              <ToggleGroupItem value="list" aria-label="Ver lista" className="flex-1"><List className="h-4 w-4" /></ToggleGroupItem>
            </ToggleGroup>
          </div>
        </Card>

        {loading ? (
          <div className="text-center p-8">Carregando imóveis...</div>
        ) : filteredProperties.length > 0 ? (
          view === 'map' ? (
            <div className="h-[70vh] w-full rounded-xl overflow-hidden shadow-lg border">
              <RentalPropertiesMapView properties={filteredProperties} onSelectProperty={(p) => navigate(`/imoveis-alugados/${p.id}`)} />
            </div>
          ) : (
            <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {paginatedProperties.map((p) => (
                <Card
                  key={p.id}
                  className="overflow-hidden hover:shadow-lg transition-shadow cursor-pointer flex flex-col h-full"
                  onClick={() => navigate(`/imoveis-alugados/${p.id}`)}
                >
                  <div className="relative h-36 w-full bg-muted">
                    {p.coverImage ? (
                      <img src={p.coverImage} alt={p.title} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                        <Building2 className="w-8 h-8" />
                      </div>
                    )}
                    <span
                      className={`absolute top-2 right-2 px-2 py-1 rounded-full text-[10px] font-semibold ${
                        p.is_active ? 'bg-green-100 text-green-700' : 'bg-surface-sunken text-content-secondary'
                      }`}
                    >
                      {p.is_active ? 'Ativo' : 'Encerrado'}
                    </span>
                  </div>
                  <CardContent className="p-4 flex flex-col flex-1">
                    <h3 className="font-bold mb-1 line-clamp-2">{p.title}</h3>
                    <p className="text-xs text-muted-foreground mb-2 flex items-center gap-1">
                      <MapPin className="w-3 h-3 shrink-0" />
                      {formatAddressWithNumber(p.address, p.street_number)}
                    </p>
                    <div className="text-xs text-muted-foreground grid grid-cols-2 gap-2 mt-auto">
                      {p.owner_name && <p className="col-span-2"><strong>Proprietário:</strong> {p.owner_name}</p>}
                      {p.monthly_value != null && <p className="col-span-2"><strong>Valor mensal:</strong> {formatCurrency(p.monthly_value)}</p>}
                      {p.bairro?.name && <p className="col-span-2"><strong>Bairro:</strong> {p.bairro.name}</p>}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
            {totalPages > 1 && (
              <div className="mt-6 flex items-center justify-center gap-2">
                <Button variant="outline" size="sm" disabled={currentPage === 1} onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}>
                  Anterior
                </Button>
                <span className="text-sm text-muted-foreground px-2">Página {currentPage} de {totalPages}</span>
                <Button variant="outline" size="sm" disabled={currentPage === totalPages} onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}>
                  Próxima
                </Button>
              </div>
            )}
            </>
          )
        ) : (
          <div className="text-center py-10">
            <p className="text-muted-foreground">Nenhum imóvel encontrado com os filtros selecionados.</p>
          </div>
        )}
      </div>
    </>
  );
};

// Filtro de cidade local a esta tela — nao altera o feed nem persiste.
export default function RentalPropertiesPageWithCityView() {
  return (
    <CityViewProvider>
      <RentalPropertiesPage />
    </CityViewProvider>
  );
}

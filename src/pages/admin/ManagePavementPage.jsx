
import React, { useState, useEffect, lazy, Suspense, useCallback, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Helmet } from 'react-helmet';
import { Link } from 'react-router-dom';
import { ArrowLeft, PlusCircle, Edit, Trash2, Save, X, MapPin, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useListaPaginada } from '@/hooks/useListaPaginada';
import PaginacaoLista from '@/components/admin/PaginacaoLista';
import { useToast } from '@/components/ui/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Combobox } from '@/components/ui/combobox';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useCityIdFromLocation } from '@/hooks/useCityIdFromLocation';

const LocationPickerMap = lazy(() => import('@/components/LocationPickerMap'));

const PavementEditModal = ({ street, onSave, onClose, bairros, existingStreets, defaultCityId, fallbackCityCenter, onBairroCreated }) => {
  const { toast } = useToast();
  const { resolveCityIdFromLocation } = useCityIdFromLocation();
  const [formData, setFormData] = useState(null);
  const [bairroSearch, setBairroSearch] = useState('');
  const [creatingBairro, setCreatingBairro] = useState(false);
  const [fetchingMapBairro, setFetchingMapBairro] = useState(false);

  useEffect(() => {
    if (street) {
      const initialStatus = street.status || 'unpaved';
      const initialPavementType = street.pavement_type || 'asphalt';

      setFormData({
        ...street,
        location: street.location && street.location.coordinates ? { lat: street.location.coordinates[1], lng: street.location.coordinates[0] } : null,
        paving_date: street.paving_date ? new Date(street.paving_date).getUTCFullYear().toString() : '',
        status: initialStatus,
        pavement_type: initialPavementType,
      });
      setBairroSearch('');
    } else {
      setFormData(null);
    }
  }, [street]);

  // Resolve o city_id alvo para criar bairro: cidade padrão (embaixador) ou,
  // se não houver, a cidade do marcador atual (mesmo padrão de obras/imóveis).
  const resolveTargetCityId = async () => {
    if (defaultCityId) return defaultCityId;
    if (formData?.location) return await resolveCityIdFromLocation(formData.location);
    return null;
  };

  const handleCreateBairro = async (rawName) => {
    const name = (rawName || '').trim();
    if (!name) return;
    const cityId = await resolveTargetCityId();
    if (!cityId) {
      toast({ title: 'Defina a localização no mapa primeiro', description: 'Precisamos da cidade para criar o bairro.', variant: 'destructive' });
      return;
    }
    const existing = (bairros || []).find(
      (b) => (b.name || '').trim().toLowerCase() === name.toLowerCase()
    );
    if (existing) {
      handleSelectChange('bairro_id', existing.id);
      setBairroSearch('');
      return;
    }
    setCreatingBairro(true);
    const { data, error } = await supabase
      .from('bairros')
      .insert({ name, city_id: cityId })
      .select('id, name')
      .single();
    setCreatingBairro(false);
    if (error) {
      toast({ title: 'Erro ao criar bairro', description: error.message, variant: 'destructive' });
      return;
    }
    onBairroCreated?.(data);
    handleSelectChange('bairro_id', data.id);
    setBairroSearch('');
    toast({ title: `Bairro "${data.name}" criado.` });
  };

  const handleUseBairroFromMap = async () => {
    if (!formData?.location) {
      toast({ title: 'Marque a localização no mapa primeiro', variant: 'destructive' });
      return;
    }
    setFetchingMapBairro(true);
    try {
      const { data, error } = await supabase.functions.invoke('reverse-geocode', {
        body: { lat: formData.location.lat, lng: formData.location.lng, zoom: 18 },
      });
      const suburb = !error ? (data?.suburb || null) : null;
      if (!suburb) {
        toast({ title: 'Bairro não encontrado no mapa', description: 'Digite o nome do bairro manualmente.', variant: 'destructive' });
        return;
      }
      await handleCreateBairro(suburb);
    } finally {
      setFetchingMapBairro(false);
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSelectChange = (name, value) => {
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleLocationChange = (newLocation) => {
    setFormData(prev => ({ ...prev, location: newLocation }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const pavementFieldsEnabled = formData.status === 'paved' || formData.status === 'partially_paved';
    
    const dataToSave = {
      ...formData,
      paving_date: pavementFieldsEnabled && formData.paving_date ? `${formData.paving_date}-01-01` : null,
      pavement_type: pavementFieldsEnabled ? formData.pavement_type : null,
    };
    
    onSave(dataToSave);
  };

  if (!formData) return null;
  
  const pavementFieldsEnabled = formData.status === 'paved' || formData.status === 'partially_paved';

  const otherStreets = existingStreets
    .filter(s => s.id !== formData.id && s.location)
    .map(s => ({
      ...s,
      location: s.location.coordinates ? { lat: s.location.coordinates[1], lng: s.location.coordinates[0] } : null,
    }));

  const filteredBairros = (bairros || []).filter((b) => bairroSearch.trim() && (b.name || '').toLowerCase().includes(bairroSearch.toLowerCase()));
  const selectedBairroName = bairros.find((b) => b.id === formData.bairro_id)?.name || '';

  return (
    <Dialog open={!!street} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[600px] bg-card border-border">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold text-foreground">{formData.id ? 'Editar Rua' : 'Adicionar Nova Rua'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="grid gap-6 py-4 max-h-[70vh] overflow-y-auto px-2">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="name" className="text-right">Nome</Label>
            <Input id="name" name="name" value={formData.name || ''} onChange={handleChange} className="col-span-3" required />
          </div>

          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="cep" className="text-right">CEP</Label>
            <Input id="cep" name="cep" value={formData.cep || ''} onChange={handleChange} className="col-span-3" placeholder="Ex: 56400-000" />
          </div>

          <div className="grid grid-cols-4 items-start gap-4">
            <Label className="text-right pt-2">Bairro</Label>
            <div className="col-span-3 space-y-2">
              {selectedBairroName && (
                <p className="text-sm text-muted-foreground">Selecionado: <span className="font-medium text-foreground">{selectedBairroName}</span></p>
              )}
              <div className="flex gap-2">
                <Input
                  placeholder="Buscar ou criar bairro..."
                  value={bairroSearch}
                  onChange={(e) => setBairroSearch(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleCreateBairro(bairroSearch); } }}
                />
                <Button type="button" variant="outline" disabled={creatingBairro} onClick={() => handleCreateBairro(bairroSearch)}>
                  Criar
                </Button>
                <Button type="button" variant="outline" disabled={fetchingMapBairro} onClick={handleUseBairroFromMap}>
                  Usar bairro do mapa
                </Button>
              </div>
              {filteredBairros.length > 0 && (
                <div className="max-h-32 overflow-y-auto border rounded-md">
                  {filteredBairros.map((b) => (
                    <button
                      type="button"
                      key={b.id}
                      onClick={() => { handleSelectChange('bairro_id', b.id); setBairroSearch(''); }}
                      className={`w-full text-left px-3 py-2 text-sm hover:bg-muted ${formData.bairro_id === b.id ? 'bg-muted font-semibold' : ''}`}
                    >
                      {b.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="status" className="text-right">Status</Label>
            <div className="col-span-3">
              <Combobox
                options={[
                  { value: 'paved', label: 'Pavimentada' },
                  { value: 'unpaved', label: 'Sem Pavimentação' },
                  { value: 'partially_paved', label: 'Parcialmente Pavimentada' }
                ]}
                value={formData.status}
                onChange={(value) => handleSelectChange('status', value)}
                placeholder="Selecione o status"
                searchPlaceholder="Buscar status..."
                notFoundText="Status não encontrado"
              />
            </div>
          </div>

          <div className={`space-y-6 transition-opacity duration-300 ${pavementFieldsEnabled ? 'opacity-100' : 'opacity-50'}`}>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="pavement_type" className="text-right">Tipo</Label>
              <div className="col-span-3">
                <Combobox
                  options={[
                    { value: 'asphalt', label: 'Asfáltica' },
                    { value: 'granite', label: 'Granítica (Paralelepípedo)' }
                  ]}
                  value={formData.pavement_type}
                  onChange={(value) => handleSelectChange('pavement_type', value)}
                  placeholder="Selecione o tipo"
                  searchPlaceholder="Buscar tipo..."
                  notFoundText="Tipo não encontrado"
                  disabled={!pavementFieldsEnabled}
                />
              </div>
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="paving_date" className="text-right">Ano da Conclusão</Label>
              <Input 
                id="paving_date" 
                name="paving_date" 
                type="number"
                placeholder="Ex: 2024"
                value={formData.paving_date || ''} 
                onChange={handleChange} 
                className="col-span-3" 
                disabled={!pavementFieldsEnabled}
              />
            </div>
          </div>

          <div>
            <Label className="block text-sm font-medium text-foreground mb-2 flex items-center gap-2"><MapPin className="w-4 h-4" /> Localização</Label>
            <div className="h-64 w-full rounded-lg overflow-hidden border border-input">
              <Suspense fallback={<div className="w-full h-full bg-muted animate-pulse flex items-center justify-center">Carregando mapa...</div>}>
                <LocationPickerMap
                  onLocationChange={handleLocationChange}
                  initialPosition={formData.location}
                  existingMarkers={otherStreets}
                  fallbackCityCenter={fallbackCityCenter}
                />
              </Suspense>
            </div>
          </div>
          <DialogFooter>
            <DialogClose asChild><Button type="button" variant="outline">Cancelar</Button></DialogClose>
            <Button type="submit" className="gap-2"><Save className="w-4 h-4" /> Salvar</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

const ManagePavementPage = () => {
  const { toast } = useToast();
  const { user } = useAuth();
  const [myActiveCityIds, setMyActiveCityIds] = useState([]);
  const [myCities, setMyCities] = useState([]); // [{ id, name, uf }]
  const isScopedAmbassador = !!user && !user.is_admin && !user.is_master && !!user.is_ambassador;
  const [streets, setStreets] = useState([]);
  const [bairros, setBairros] = useState([]);
  const [buscaRua, setBuscaRua] = useState('');
  const [editingStreet, setEditingStreet] = useState(null);
  const [deletingStreet, setDeletingStreet] = useState(null);

  useEffect(() => {
    if (!isScopedAmbassador || !user?.id) return;
    supabase
      .from('ambassador_cities')
      .select('city_id, cities(id, name, states(uf))')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .then(({ data }) => {
        const rows = data || [];
        setMyActiveCityIds(rows.map((r) => r.city_id));
        setMyCities(rows.map((r) => ({
          id: r.city_id,
          name: r.cities?.name || null,
          uf: r.cities?.states?.uf || null,
        })).filter((c) => c.name));
      });
  }, [isScopedAmbassador, user?.id]);

  const fetchStreets = useCallback(async () => {
    if (isScopedAmbassador && myActiveCityIds.length === 0) {
      setStreets([]);
      return;
    }
    let query = supabase
      .from('pavement_streets')
      .select('*, bairro:bairros!pavement_streets_bairro_id_fkey(name)')
      .order('updated_at', { ascending: false });
    if (isScopedAmbassador) {
      query = query.in('city_id', myActiveCityIds);
    }
    const { data, error } = await query;
    if (error) toast({ title: "Erro ao buscar ruas", description: error.message, variant: "destructive" });
    else setStreets(data.map(s => ({...s, bairro_name: s.bairro?.name})));
  }, [toast, isScopedAmbassador, myActiveCityIds]);

  const fetchBairros = useCallback(async () => {
    let query = supabase.from('bairros').select('*').order('name');
    if (isScopedAmbassador && myActiveCityIds.length > 0) {
      query = query.in('city_id', myActiveCityIds);
    }
    const { data, error } = await query;
    if (error) toast({ title: "Erro ao buscar bairros", description: error.message, variant: "destructive" });
    else setBairros(data);
  }, [toast, isScopedAmbassador, myActiveCityIds]);

  useEffect(() => {
    fetchStreets();
    fetchBairros();
  }, [fetchStreets, fetchBairros]);

  const handleSaveStreet = async (streetToSave) => {
    const { id, name, location, bairro, bairro_name, cep, work_id, ...data } = streetToSave;

    if (!name || name.trim() === '') {
        toast({ title: "Erro ao salvar", description: "O nome da rua é obrigatório.", variant: "destructive" });
        return;
    }

    if (!data.bairro_id) {
      toast({ title: "Selecione um bairro", description: "A cidade da rua é definida pelo bairro selecionado.", variant: "destructive" });
      return;
    }

    const selectedBairro = bairros.find((b) => b.id === data.bairro_id);
    const resolvedCityId = selectedBairro?.city_id || null;
    if (!resolvedCityId) {
      toast({ title: "Bairro sem cidade definida", description: "Escolha outro bairro ou cadastre o bairro corretamente antes.", variant: "destructive" });
      return;
    }

    if (isScopedAmbassador && !myActiveCityIds.includes(resolvedCityId)) {
      toast({ title: "Fora da sua área", description: "Você só pode gerenciar ruas nas suas cidades.", variant: "destructive" });
      return;
    }

    const trimmedName = name.trim();
    // A checagem de nome repetido é POR CIDADE.
    //
    // Sem o recorte, ela olhava a tabela inteira: "Rua São João" cadastrada em
    // Palmares bloqueava o cadastro de "Rua São João" em qualquer outra cidade
    // do país. É o nome de rua mais comum do Brasil — e o embaixador da cidade
    // vizinha via "já existe no sistema" sem ter como descobrir onde.
    let query = supabase
        .from('pavement_streets')
        .select('id', { count: 'exact', head: true })
        .eq('city_id', resolvedCityId)
        .ilike('name', trimmedName);

    if (id) {
        query = query.neq('id', id);
    }

    const { error: checkError, count } = await query;

    if (checkError) {
        toast({ title: "Erro ao verificar duplicidade", description: checkError.message, variant: "destructive" });
        return;
    }

    if (count > 0) {
        toast({ title: "Rua já cadastrada", description: `A rua "${trimmedName}" já existe nesta cidade.`, variant: "destructive" });
        return;
    }

    const locationString = location ? `POINT(${location.lng} ${location.lat})` : null;
    
    const payload = {
      name: trimmedName,
      cep: cep || null,
      status: data.status,
      paving_date: data.paving_date,
      pavement_type: data.pavement_type,
      bairro_id: data.bairro_id,
      location: locationString,
      city_id: resolvedCityId,
    };

    let error;
    if (id) {
      ({ error } = await supabase.from('pavement_streets').update(payload).eq('id', id));
    } else {
      ({ error } = await supabase.from('pavement_streets').insert(payload));
    }

    if (error) {
      toast({ title: "Erro ao salvar rua", description: error.message, variant: "destructive" });
    } else {
      toast({ title: `Rua ${id ? 'atualizada' : 'adicionada'} com sucesso!` });
      fetchStreets();
      setEditingStreet(null);
    }
  };

  const handleAddNewStreet = () => {
    setEditingStreet({ id: null, name: '', cep: '', status: 'unpaved', pavement_type: 'asphalt', bairro_id: null, location: null, paving_date: '' });
  };

  const handleDeleteStreet = async (streetId) => {
    const { error } = await supabase.from('pavement_streets').delete().eq('id', streetId);
    if (error) {
      toast({ title: "Erro ao remover rua", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Rua removida com sucesso!", variant: "destructive" });
      fetchStreets();
    }
    setDeletingStreet(null);
  };

  const getStatusText = (status) => {
    switch (status) {
      case 'paved': return 'Pavimentada';
      case 'unpaved': return 'Sem Pavimentação';
      case 'partially_paved': return 'Parcialmente Pavimentada';
      default: return 'N/A';
    }
  };

  // `streets` continua inteiro: o modal precisa da lista completa para avisar
  // de nomes repetidos. O recorte é só do que vai para a tela.
  const ruasFiltradas = useMemo(() => {
    const termo = buscaRua.trim().toLowerCase();
    if (!termo) return streets;
    return streets.filter((s) =>
      (s.name || '').toLowerCase().includes(termo) ||
      (s.bairro_name || '').toLowerCase().includes(termo) ||
      (s.cep || '').toLowerCase().includes(termo)
    );
  }, [streets, buscaRua]);

  const { visiveis: ruasVisiveis, propsPaginacao: propsPaginacaoRuas } = useListaPaginada(
    ruasFiltradas,
    { porPagina: 20, chaveFiltro: buscaRua }
  );

  return (
    <>
      <Helmet>
        <title>Gerenciar Pavimentação - Admin</title>
        <meta name="description" content="Gerencie as ruas e o status de pavimentação." />
      </Helmet>
      <div className="container max-w-[88rem] mx-auto w-full px-4 py-12">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-wrap items-center justify-between gap-4 mb-12"
        >
          <div className="flex items-center gap-4">
            <Link to="/admin">
              <Button variant="outline" size="icon"><ArrowLeft className="w-4 h-4" /></Button>
            </Link>
            <div>
              <h1 className="text-3xl md:text-4xl font-bold text-tc-red">
                {isScopedAmbassador ? 'Pavimentação da minha cidade' : 'Gerenciar Pavimentação'}
              </h1>
              <p className="mt-2 text-lg text-muted-foreground">Adicione, edite ou remova ruas do mapa de pavimentação.</p>
            </div>
          </div>
          <Button onClick={handleAddNewStreet} className="gap-2">
            <PlusCircle className="w-4 h-4" /> Adicionar Rua
          </Button>
        </motion.div>

        <Card>
          <CardHeader>
            <CardTitle>Ruas Cadastradas</CardTitle>
            <CardDescription>{streets.length} rua{streets.length === 1 ? '' : 's'}.</CardDescription>
            {/* Sem busca, achar uma rua era rolar até topá-la. */}
            <div className="relative mt-3">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por rua, bairro ou CEP..."
                className="pl-10"
                value={buscaRua}
                onChange={(e) => setBuscaRua(e.target.value)}
              />
            </div>
          </CardHeader>
          <CardContent>
            {ruasVisiveis.length === 0 ? (
              <p className="text-center text-muted-foreground py-10">
                {buscaRua ? 'Nenhuma rua corresponde à busca.' : 'Nenhuma rua cadastrada ainda.'}
              </p>
            ) : (
            <div className="space-y-3">
              {ruasVisiveis.map(street => (
                <div key={street.id} className="flex flex-col sm:flex-row justify-between items-start sm:items-center p-4 bg-background rounded-lg border gap-4">
                  <div>
                    <p className="font-semibold">{street.name}</p>
                    <p className="text-sm text-muted-foreground">Status: {getStatusText(street.status)}</p>
                    {street.bairro_name && <p className="text-sm text-muted-foreground">Bairro: {street.bairro_name}</p>}
                    {street.cep && <p className="text-sm text-muted-foreground">CEP: {street.cep}</p>}
                    <p className="text-xs text-muted-foreground mt-1">Última atualização: {new Date(street.updated_at).toLocaleString('pt-BR')}</p>
                  </div>
                  <div className="flex-shrink-0 flex gap-2">
                    <Button variant="ghost" size="icon" onClick={() => setEditingStreet(street)}><Edit className="w-4 h-4" /></Button>
                    <Button variant="ghost" size="icon" className="text-red-500 hover:text-red-600" onClick={() => setDeletingStreet(street)}><Trash2 className="w-4 h-4" /></Button>
                  </div>
                </div>
              ))}
            </div>
            )}

            <PaginacaoLista {...propsPaginacaoRuas} />
          </CardContent>
        </Card>
      </div>

      <PavementEditModal
        street={editingStreet}
        onSave={handleSaveStreet}
        onClose={() => setEditingStreet(null)}
        bairros={bairros}
        existingStreets={streets}
        defaultCityId={isScopedAmbassador && myActiveCityIds.length === 1 ? myActiveCityIds[0] : null}
        fallbackCityCenter={isScopedAmbassador && myCities.length > 0 ? { name: myCities[0].name, uf: myCities[0].uf } : null}
        onBairroCreated={(newBairro) => setBairros((prev) => [...prev, newBairro])}
      />

      <Dialog open={!!deletingStreet} onOpenChange={(open) => !open && setDeletingStreet(null)}>
        <DialogContent className="sm:max-w-md bg-card border-border">
          <DialogHeader><DialogTitle className="text-xl font-bold text-foreground">Confirmar Exclusão</DialogTitle></DialogHeader>
          <p className="text-muted-foreground">Tem certeza que deseja remover a rua "{deletingStreet?.name}"? Esta ação não pode ser desfeita.</p>
          <DialogFooter className="sm:justify-end gap-2">
            <DialogClose asChild><Button type="button" variant="outline">Cancelar</Button></DialogClose>
            <Button type="button" variant="destructive" onClick={() => handleDeleteStreet(deletingStreet.id)}>
              <Trash2 className="w-4 h-4 mr-2" /> Remover
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default ManagePavementPage;

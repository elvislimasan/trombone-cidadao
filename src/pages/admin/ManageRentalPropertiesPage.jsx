import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Helmet } from 'react-helmet';
import { PlusCircle, Edit, Trash2, MapPin, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/components/ui/use-toast';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { supabase } from '@/lib/customSupabaseClient';
import LocationPickerMap from '@/components/LocationPickerMap';
import { useCityIdFromLocation } from '@/hooks/useCityIdFromLocation';

export const RentalPropertyEditModal = ({ property, onSave, onClose, bairros, defaultCityId, fallbackCityCenter, onBairroCreated }) => {
  const { toast } = useToast();
  const { resolveCityIdFromLocation } = useCityIdFromLocation();
  const [formData, setFormData] = useState(null);
  const [bairroSearch, setBairroSearch] = useState('');
  const [creatingBairro, setCreatingBairro] = useState(false);
  const [fetchingMapBairro, setFetchingMapBairro] = useState(false);
  const addressTouchedRef = useRef(false);

  useEffect(() => {
    if (property) {
      const parseLocation = (loc) => {
        if (!loc) return null;
        if (typeof loc === 'object' && loc.coordinates) return { lat: loc.coordinates[1], lng: loc.coordinates[0] };
        if (typeof loc === 'string') {
          const match = loc.match(/POINT\(([-\d.]+) ([-\d.]+)\)/);
          if (match) return { lat: parseFloat(match[2]), lng: parseFloat(match[1]) };
        }
        return null;
      };
      const initialData = property.id ? {
        ...property,
        location: parseLocation(property.location),
        bairro_id: property.bairro_id || '',
      } : {
        id: null,
        address: '',
        location: null,
        bairro_id: '',
        length_m: '',
        width_m: '',
        characteristics: '',
        department: '',
        is_active: true,
      };
      setFormData(initialData);
      addressTouchedRef.current = !!(initialData.address && initialData.address.trim());
    }
  }, [property]);

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
    const existing = (bairros || []).find((b) => (b.name || '').trim().toLowerCase() === name.toLowerCase());
    if (existing) {
      setFormData((prev) => ({ ...prev, bairro_id: existing.id }));
      setBairroSearch('');
      return;
    }
    setCreatingBairro(true);
    const { data, error } = await supabase.from('bairros').insert({ name, city_id: cityId }).select('id, name').single();
    setCreatingBairro(false);
    if (error) {
      toast({ title: 'Erro ao criar bairro', description: error.message, variant: 'destructive' });
      return;
    }
    onBairroCreated?.(data);
    setFormData((prev) => ({ ...prev, bairro_id: data.id }));
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

  const handleLocationChange = (newLocation) => {
    setFormData((prev) => ({ ...prev, location: newLocation }));
    if (!newLocation || addressTouchedRef.current) return;
    supabase.functions
      .invoke('reverse-geocode', { body: { lat: newLocation.lat, lng: newLocation.lng, zoom: 18 } })
      .then(({ data, error }) => {
        if (error) return;
        const addr = data?.address;
        if (typeof addr === 'string' && addr.trim()) {
          setFormData((prev) => (addressTouchedRef.current ? prev : { ...prev, address: addr }));
        }
      })
      .catch(() => {});
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave(formData);
  };

  if (!formData) return null;

  const filteredBairros = (bairros || []).filter((b) => (b.name || '').toLowerCase().includes(bairroSearch.toLowerCase()));

  return (
    <Dialog open={!!property} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{property?.id ? 'Editar Imóvel' : 'Novo Imóvel Alugado'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="h-64 rounded-xl overflow-hidden border">
            <LocationPickerMap onLocationChange={handleLocationChange} initialPosition={formData.location} fallbackCityCenter={fallbackCityCenter} />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="address">Endereço</Label>
            <Input id="address" name="address" value={formData.address} onChange={(e) => { addressTouchedRef.current = true; handleChange(e); }} required />
          </div>

          <div className="grid gap-2">
            <Label>Bairro</Label>
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
                    onClick={() => setFormData((prev) => ({ ...prev, bairro_id: b.id }))}
                    className={`w-full text-left px-3 py-2 text-sm hover:bg-muted ${formData.bairro_id === b.id ? 'bg-muted font-semibold' : ''}`}
                  >
                    {b.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="length_m">Comprimento (m)</Label>
              <Input id="length_m" name="length_m" type="number" step="0.01" value={formData.length_m || ''} onChange={handleChange} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="width_m">Largura (m)</Label>
              <Input id="width_m" name="width_m" type="number" step="0.01" value={formData.width_m || ''} onChange={handleChange} />
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="characteristics">Características e utilização</Label>
            <Input id="characteristics" name="characteristics" value={formData.characteristics || ''} onChange={handleChange} placeholder="Ex: prédio de 2 andares, usado como posto de saúde" />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="department">Secretaria Municipal responsável</Label>
            <Input id="department" name="department" value={formData.department || ''} onChange={handleChange} placeholder="Ex: Secretaria de Saúde" />
          </div>

          <div className="flex items-center gap-2">
            <Switch id="is_active" checked={formData.is_active} onCheckedChange={(checked) => setFormData((prev) => ({ ...prev, is_active: checked }))} />
            <Label htmlFor="is_active">Aluguel ativo</Label>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
            <Button type="submit">Salvar</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

const ManageRentalPropertiesPage = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [properties, setProperties] = useState([]);
  const [bairros, setBairros] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingProperty, setEditingProperty] = useState(null);
  const [deletingProperty, setDeletingProperty] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [myActiveCityIds, setMyActiveCityIds] = useState([]);
  const [myCities, setMyCities] = useState([]);

  const isScopedAmbassador = !!user && !user.is_admin && !user.is_master && !!user.is_ambassador;
  const { resolveCityIdFromLocation } = useCityIdFromLocation();

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
        setMyCities(rows.map((r) => ({ id: r.city_id, name: r.cities?.name || null, uf: r.cities?.states?.uf || null })).filter((c) => c.name));
      });
  }, [isScopedAmbassador, user?.id]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('rental_properties')
        .select('*, bairro:bairro_id(id, name), contracts:rental_property_contracts(owner_name, monthly_value, is_current)')
        .order('created_at', { ascending: false });
      if (isScopedAmbassador) {
        if (myActiveCityIds.length === 0) { setProperties([]); setLoading(false); return; }
        query = query.in('city_id', myActiveCityIds);
      }
      const { data, error } = await query;
      if (error) throw error;
      setProperties(data || []);
    } catch (error) {
      toast({ title: 'Erro ao buscar imóveis', description: error.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [isScopedAmbassador, myActiveCityIds, toast]);

  const fetchBairros = useCallback(async () => {
    let query = supabase.from('bairros').select('*');
    if (isScopedAmbassador && myActiveCityIds.length > 0) query = query.in('city_id', myActiveCityIds);
    const { data, error } = await query;
    if (!error) setBairros(data || []);
  }, [isScopedAmbassador, myActiveCityIds]);

  useEffect(() => { fetchData(); fetchBairros(); }, [fetchData, fetchBairros]);

  const handleSaveProperty = async (propertyToSave) => {
    const { id, location, bairro, contracts, ...data } = propertyToSave;

    let resolvedCityId = null;
    if (location) {
      resolvedCityId = await resolveCityIdFromLocation(location);
    }
    if (resolvedCityId == null) {
      toast({ title: 'Não foi possível identificar a cidade', description: 'Confira se o marcador no mapa está sobre a localização correta.', variant: 'destructive' });
      return;
    }
    if (isScopedAmbassador && !myActiveCityIds.includes(resolvedCityId)) {
      toast({ title: 'Fora da sua área', description: 'Você só pode gerenciar imóveis nas suas cidades.', variant: 'destructive' });
      return;
    }

    const locationString = location ? `POINT(${location.lng} ${location.lat})` : null;
    const payload = { ...data, location: locationString, city_id: resolvedCityId };
    if (payload.bairro_id === '') payload.bairro_id = null;
    ['length_m', 'width_m'].forEach((k) => { if (payload[k] === '') payload[k] = null; });

    let result;
    if (id) {
      result = await supabase.from('rental_properties').update(payload).eq('id', id).select().single();
    } else {
      result = await supabase.from('rental_properties').insert(payload).select().single();
    }

    if (result.error) {
      toast({ title: 'Erro ao salvar imóvel', description: result.error.message, variant: 'destructive' });
    } else {
      toast({ title: `Imóvel ${id ? 'atualizado' : 'criado'} com sucesso!` });
      await fetchData();
      setEditingProperty(null);
    }
  };

  const handleDeleteProperty = async (propertyId) => {
    const { error } = await supabase.from('rental_properties').delete().eq('id', propertyId);
    if (error) {
      toast({ title: 'Erro ao remover imóvel', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Imóvel removido com sucesso!', variant: 'destructive' });
      fetchData();
    }
    setDeletingProperty(null);
  };

  const filteredProperties = properties.filter((p) => !searchTerm || p.address.toLowerCase().includes(searchTerm.toLowerCase()));

  const fallbackCityCenter = isScopedAmbassador && myCities.length > 0 ? { name: myCities[0].name, uf: myCities[0].uf } : null;
  const defaultCityId = isScopedAmbassador && myActiveCityIds.length === 1 ? myActiveCityIds[0] : null;

  return (
    <>
      <Helmet><title>Gerenciar Imóveis Alugados - Trombone Cidadão</title></Helmet>
      <div className="container max-w-7xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl md:text-3xl font-bold text-tc-red">
            {isScopedAmbassador ? 'Imóveis alugados da minha cidade' : 'Gerenciar Imóveis Alugados'}
          </h1>
          <Button onClick={() => setEditingProperty({})}>
            <PlusCircle className="w-4 h-4 mr-2" /> Novo Imóvel
          </Button>
        </div>

        <div className="relative mb-6 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Buscar por endereço..." className="pl-9" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
        </div>

        {loading ? (
          <div className="text-center py-10">Carregando...</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredProperties.map((property) => {
              const currentContract = (property.contracts || []).find((c) => c.is_current);
              return (
                <Card key={property.id}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between mb-2">
                      <h3 className="font-bold line-clamp-1">{property.address}</h3>
                      <div className="flex gap-1">
                        <Button size="icon" variant="ghost" onClick={() => setEditingProperty(property)}><Edit className="w-4 h-4" /></Button>
                        <Button size="icon" variant="ghost" onClick={() => setDeletingProperty(property)}><Trash2 className="w-4 h-4 text-destructive" /></Button>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground flex items-center gap-1 mb-1"><MapPin className="w-3 h-3" /> {property.bairro?.name || 'Sem bairro'}</p>
                    {currentContract && <p className="text-sm font-semibold text-tc-red">{currentContract.owner_name}</p>}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {editingProperty && (
        <RentalPropertyEditModal
          property={editingProperty}
          onSave={handleSaveProperty}
          onClose={() => setEditingProperty(null)}
          bairros={bairros}
          defaultCityId={defaultCityId}
          fallbackCityCenter={fallbackCityCenter}
          onBairroCreated={(newBairro) => setBairros((prev) => [...prev, newBairro])}
        />
      )}

      <Dialog open={!!deletingProperty} onOpenChange={(open) => !open && setDeletingProperty(null)}>
        <DialogContent className="sm:max-w-md bg-card border-border">
          <DialogHeader><DialogTitle className="text-xl font-bold text-foreground">Remover imóvel?</DialogTitle></DialogHeader>
          <p className="text-muted-foreground">Esta ação não pode ser desfeita. Todos os contratos, fotos e documentos vinculados também serão removidos.</p>
          <DialogFooter className="sm:justify-end gap-2">
            <DialogClose asChild><Button type="button" variant="outline">Cancelar</Button></DialogClose>
            <Button type="button" variant="destructive" onClick={() => handleDeleteProperty(deletingProperty.id)}><Trash2 className="w-4 h-4 mr-2" /> Remover</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default ManageRentalPropertiesPage;

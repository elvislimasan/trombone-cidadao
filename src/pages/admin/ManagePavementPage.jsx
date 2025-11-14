
import React, { useState, useEffect, lazy, Suspense, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Helmet } from 'react-helmet';
import { Link } from 'react-router-dom';
import { ArrowLeft, PlusCircle, Edit, Trash2, Save, X, MapPin } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/components/ui/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Combobox } from '@/components/ui/combobox';
import { supabase } from '@/lib/customSupabaseClient';

const LocationPickerMap = lazy(() => import('@/components/LocationPickerMap'));

const PavementEditModal = ({ street, onSave, onClose, bairros, existingStreets }) => {
  const [formData, setFormData] = useState(null);

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
    } else {
      setFormData(null);
    }
  }, [street]);

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

  const bairroOptions = bairros.map(b => ({ value: b.id, label: b.name }));

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
            <Label htmlFor="bairro_id" className="text-right">Bairro</Label>
            <div className="col-span-3">
              <Combobox
                options={bairroOptions}
                value={formData.bairro_id}
                onChange={(value) => handleSelectChange('bairro_id', value)}
                placeholder="Selecione um bairro"
                searchPlaceholder="Buscar bairro..."
                notFoundText="Nenhum bairro encontrado."
              />
            </div>
          </div>

          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="status" className="text-right">Status</Label>
            <Select name="status" value={formData.status} onValueChange={(value) => handleSelectChange('status', value)}>
              <SelectTrigger className="col-span-3"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="paved">Pavimentada</SelectItem>
                <SelectItem value="unpaved">Sem Pavimentação</SelectItem>
                <SelectItem value="partially_paved">Parcialmente Pavimentada</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className={`space-y-6 transition-opacity duration-300 ${pavementFieldsEnabled ? 'opacity-100' : 'opacity-50'}`}>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="pavement_type" className="text-right">Tipo</Label>
              <Select name="pavement_type" value={formData.pavement_type} onValueChange={(value) => handleSelectChange('pavement_type', value)} disabled={!pavementFieldsEnabled}>
                <SelectTrigger className="col-span-3"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="asphalt">Asfáltica</SelectItem>
                  <SelectItem value="granite">Granítica (Paralelepípedo)</SelectItem>
                </SelectContent>
              </Select>
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
  const [streets, setStreets] = useState([]);
  const [bairros, setBairros] = useState([]);
  const [editingStreet, setEditingStreet] = useState(null);
  const [deletingStreet, setDeletingStreet] = useState(null);

  const fetchStreets = useCallback(async () => {
    const { data, error } = await supabase
      .from('pavement_streets')
      .select('*, bairro:bairros!pavement_streets_bairro_id_fkey(name)')
      .order('updated_at', { ascending: false });
    if (error) toast({ title: "Erro ao buscar ruas", description: error.message, variant: "destructive" });
    else setStreets(data.map(s => ({...s, bairro_name: s.bairro?.name})));
  }, [toast]);
  
  const fetchBairros = useCallback(async () => {
    const { data, error } = await supabase.from('bairros').select('*').order('name');
    if (error) toast({ title: "Erro ao buscar bairros", description: error.message, variant: "destructive" });
    else setBairros(data);
  }, [toast]);

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

    const trimmedName = name.trim();
    let query = supabase
        .from('pavement_streets')
        .select('id', { count: 'exact' })
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
        toast({ title: "Rua já cadastrada", description: `A rua "${trimmedName}" já existe no sistema.`, variant: "destructive" });
        return;
    }

    const locationString = location ? `POINT(${location.lng} ${location.lat})` : null;
    
    const payload = { 
      name: trimmedName,
      status: data.status,
      paving_date: data.paving_date,
      pavement_type: data.pavement_type,
      bairro_id: data.bairro_id,
      location: locationString,
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
    setEditingStreet({ id: null, name: '', status: 'unpaved', pavement_type: 'asphalt', bairro_id: null, location: null, paving_date: '' });
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

  return (
    <>
      <Helmet>
        <title>Gerenciar Pavimentação - Admin</title>
        <meta name="description" content="Gerencie as ruas e o status de pavimentação." />
      </Helmet>
      <div className="container mx-auto px-4 py-12">
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
              <h1 className="text-3xl md:text-4xl font-bold text-tc-red">Gerenciar Pavimentação</h1>
              <p className="mt-2 text-lg text-muted-foreground">Adicione, edite ou remova ruas do mapa de pavimentação.</p>
            </div>
          </div>
          <Button onClick={handleAddNewStreet} className="gap-2">
            <PlusCircle className="w-4 h-4" /> Adicionar Rua
          </Button>
        </motion.div>

        <Card>
          <CardHeader><CardTitle>Ruas Cadastradas</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-3">
              {streets.map(street => (
                <div key={street.id} className="flex flex-col sm:flex-row justify-between items-start sm:items-center p-4 bg-background rounded-lg border gap-4">
                  <div>
                    <p className="font-semibold">{street.name}</p>
                    <p className="text-sm text-muted-foreground">Status: {getStatusText(street.status)}</p>
                    {street.bairro_name && <p className="text-sm text-muted-foreground">Bairro: {street.bairro_name}</p>}
                    <p className="text-xs text-muted-foreground mt-1">Última atualização: {new Date(street.updated_at).toLocaleString('pt-BR')}</p>
                  </div>
                  <div className="flex-shrink-0 flex gap-2">
                    <Button variant="ghost" size="icon" onClick={() => setEditingStreet(street)}><Edit className="w-4 h-4" /></Button>
                    <Button variant="ghost" size="icon" className="text-red-500 hover:text-red-600" onClick={() => setDeletingStreet(street)}><Trash2 className="w-4 h-4" /></Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <PavementEditModal
        street={editingStreet}
        onSave={handleSaveStreet}
        onClose={() => setEditingStreet(null)}
        bairros={bairros}
        existingStreets={streets}
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

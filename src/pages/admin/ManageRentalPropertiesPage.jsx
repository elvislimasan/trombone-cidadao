import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Helmet } from 'react-helmet';
import { useSearchParams } from 'react-router-dom';
import { PlusCircle, Edit, Trash2, MapPin, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/components/ui/use-toast';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { supabase } from '@/lib/customSupabaseClient';
import LocationPickerMap from '@/components/LocationPickerMap';
import { useCityIdFromLocation } from '@/hooks/useCityIdFromLocation';
import { formatCurrency, formatDate } from '@/lib/utils';
import { useListaPaginada } from '@/hooks/useListaPaginada';
import PaginacaoLista from '@/components/admin/PaginacaoLista';

const emptyContractForm = {
  owner_name: '',
  monthly_value: '',
  start_date: '',
  expected_end_date: '',
  contract_number: '',
  contract_year: '',
  contract_url: '',
};

// Ano do contrato: aceita o que existe de fato. Contratos anteriores a 2000
// nao estao no portal de nenhuma prefeitura, e um ano no futuro distante e
// sempre erro de digitacao (2205 no lugar de 2025).
const CONTRACT_YEAR_MIN = 2000;
const contractYearMax = () => new Date().getFullYear() + 5;

const RentalContractsManager = ({ propertyId }) => {
  const { toast } = useToast();
  const [contracts, setContracts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newContract, setNewContract] = useState(emptyContractForm);
  const [saving, setSaving] = useState(false);
  const [editingContractId, setEditingContractId] = useState(null);
  const [editForm, setEditForm] = useState(emptyContractForm);
  const [deletingContract, setDeletingContract] = useState(null);

  const fetchContracts = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('rental_property_contracts')
      .select('*')
      .eq('property_id', propertyId)
      .order('start_date', { ascending: false });
    if (!error) setContracts(data || []);
    setLoading(false);
  }, [propertyId]);

  useEffect(() => { fetchContracts(); }, [fetchContracts]);

  // Valida o ano só quando preenchido — o campo é opcional, mas um ano
  // impossível vira lixo permanente no histórico.
  const validateContractYear = (value) => {
    if (!value) return true;
    const year = Number(value);
    if (!Number.isInteger(year) || year < CONTRACT_YEAR_MIN || year > contractYearMax()) {
      toast({ title: `Ano do contrato inválido`, description: `Informe um ano entre ${CONTRACT_YEAR_MIN} e ${contractYearMax()}.`, variant: 'destructive' });
      return false;
    }
    return true;
  };

  const handleCreateContract = async (e) => {
    e.preventDefault();
    // Só o valor mensal é obrigatório: é o único campo sem o qual o registro não
    // serve para nada (a tela existe para somar quanto a prefeitura gasta).
    // Proprietário e datas costumam chegar depois do valor — exigi-los fazia o
    // embaixador desistir do cadastro ou digitar "Não informado" no nome.
    if (!newContract.monthly_value) {
      toast({ title: 'Informe o valor mensal do contrato', variant: 'destructive' });
      return;
    }
    if (!validateContractYear(newContract.contract_year)) return;
    setSaving(true);
    const current = contracts.find((c) => c.is_current);
    let closedCurrent = false;
    try {
      if (current) {
        const { error: closeError } = await supabase
          .from('rental_property_contracts')
          // Sem data de início no novo contrato não dá para inferir o fim do
          // anterior — fica nulo ("em vigor até quando não se sabe") em vez de
          // receber uma data inventada.
          .update({ is_current: false, end_date: current.end_date || newContract.start_date || null })
          .eq('id', current.id);
        if (closeError) throw closeError;
        closedCurrent = true;
      }
      const { error: insertError } = await supabase.from('rental_property_contracts').insert({
        property_id: propertyId,
        owner_name: newContract.owner_name.trim() || null,
        monthly_value: Number(newContract.monthly_value),
        start_date: newContract.start_date || null,
        expected_end_date: newContract.expected_end_date || null,
        contract_number: newContract.contract_number.trim() || null,
        contract_year: newContract.contract_year ? Number(newContract.contract_year) : null,
        contract_url: newContract.contract_url.trim() || null,
        is_current: true,
      });
      if (insertError) throw insertError;
      toast({ title: 'Contrato criado. O contrato anterior foi encerrado automaticamente.' });
      setNewContract(emptyContractForm);
      await fetchContracts();
    } catch (error) {
      if (closedCurrent && current) {
        try {
          await supabase
            .from('rental_property_contracts')
            .update({ is_current: true, end_date: current.end_date })
            .eq('id', current.id);
        } catch (rollbackError) {
          console.error('Falha ao reverter encerramento do contrato anterior:', rollbackError);
        }
      }
      toast({ title: 'Erro ao criar contrato', description: error.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const startEditingContract = (contract) => {
    setEditingContractId(contract.id);
    setEditForm({
      owner_name: contract.owner_name || '',
      monthly_value: contract.monthly_value ?? '',
      start_date: contract.start_date || '',
      end_date: contract.end_date || '',
      expected_end_date: contract.expected_end_date || '',
      contract_number: contract.contract_number || '',
      contract_year: contract.contract_year ?? '',
      contract_url: contract.contract_url || '',
    });
  };

  const handleSaveEditContract = async (e) => {
    e.preventDefault();
    if (!editForm.monthly_value) {
      toast({ title: 'Informe o valor mensal do contrato', variant: 'destructive' });
      return;
    }
    if (!validateContractYear(editForm.contract_year)) return;
    setSaving(true);
    const { error } = await supabase
      .from('rental_property_contracts')
      .update({
        owner_name: editForm.owner_name.trim() || null,
        monthly_value: Number(editForm.monthly_value),
        start_date: editForm.start_date || null,
        end_date: editForm.end_date || null,
        expected_end_date: editForm.expected_end_date || null,
        contract_number: editForm.contract_number.trim() || null,
        contract_year: editForm.contract_year ? Number(editForm.contract_year) : null,
        contract_url: editForm.contract_url.trim() || null,
      })
      .eq('id', editingContractId);
    setSaving(false);
    if (error) {
      toast({ title: 'Erro ao salvar contrato', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: 'Contrato atualizado.' });
    setEditingContractId(null);
    await fetchContracts();
  };

  const handleDeleteContract = async () => {
    if (!deletingContract) return;
    const { error } = await supabase.from('rental_property_contracts').delete().eq('id', deletingContract.id);
    if (error) {
      toast({ title: 'Erro ao remover contrato', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Contrato removido.' });
      await fetchContracts();
    }
    setDeletingContract(null);
  };

  return (
    <div className="space-y-4">
      <form onSubmit={handleCreateContract} className="p-4 border rounded-xl bg-muted/20 space-y-3">
        <p className="text-sm font-semibold text-foreground">Novo contrato</p>
        <p className="text-xs text-muted-foreground">Só o valor mensal é obrigatório. Preencha o resto conforme for descobrindo.</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="grid gap-1.5">
            <Label className="text-xs text-muted-foreground">Nome do proprietário</Label>
            <Input value={newContract.owner_name} onChange={(e) => setNewContract((p) => ({ ...p, owner_name: e.target.value }))} placeholder="Opcional" />
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs text-muted-foreground">Valor mensal *</Label>
            <Input type="number" step="0.01" value={newContract.monthly_value} onChange={(e) => setNewContract((p) => ({ ...p, monthly_value: e.target.value }))} />
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs text-muted-foreground">Data de início</Label>
            <Input type="date" value={newContract.start_date} onChange={(e) => setNewContract((p) => ({ ...p, start_date: e.target.value }))} />
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs text-muted-foreground">Previsão de encerramento</Label>
            <Input type="date" value={newContract.expected_end_date} onChange={(e) => setNewContract((p) => ({ ...p, expected_end_date: e.target.value }))} />
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs text-muted-foreground">Nº do contrato</Label>
            <Input value={newContract.contract_number} onChange={(e) => setNewContract((p) => ({ ...p, contract_number: e.target.value }))} placeholder="Ex: 042/2025" />
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs text-muted-foreground">Ano do contrato</Label>
            <Input type="number" inputMode="numeric" min={CONTRACT_YEAR_MIN} max={contractYearMax()} value={newContract.contract_year} onChange={(e) => setNewContract((p) => ({ ...p, contract_year: e.target.value }))} placeholder="Ex: 2025" />
          </div>
          <div className="grid gap-1.5 sm:col-span-2">
            <Label className="text-xs text-muted-foreground">Link do contrato no site da prefeitura</Label>
            <Input type="url" value={newContract.contract_url} onChange={(e) => setNewContract((p) => ({ ...p, contract_url: e.target.value }))} placeholder="https://transparencia.prefeitura.../contrato-042-2025.pdf" />
          </div>
        </div>
        <div className="flex justify-end">
          <Button type="submit" disabled={saving} className="gap-2">
            <PlusCircle className="w-4 h-4" /> Novo Contrato
          </Button>
        </div>
      </form>

      {loading ? (
        <p className="text-sm text-muted-foreground">Carregando histórico...</p>
      ) : (
        <div className="space-y-2">
          {contracts.map((c) => (
            editingContractId === c.id ? (
              <form key={c.id} onSubmit={handleSaveEditContract} className="p-4 border rounded-xl bg-muted/20 space-y-3">
                <p className="text-sm font-semibold text-foreground">Editar contrato</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="grid gap-1.5">
                    <Label className="text-xs text-muted-foreground">Nome do proprietário</Label>
                    <Input value={editForm.owner_name} onChange={(e) => setEditForm((p) => ({ ...p, owner_name: e.target.value }))} placeholder="Opcional" />
                  </div>
                  <div className="grid gap-1.5">
                    <Label className="text-xs text-muted-foreground">Valor mensal *</Label>
                    <Input type="number" step="0.01" value={editForm.monthly_value} onChange={(e) => setEditForm((p) => ({ ...p, monthly_value: e.target.value }))} />
                  </div>
                  <div className="grid gap-1.5">
                    <Label className="text-xs text-muted-foreground">Início</Label>
                    <Input type="date" value={editForm.start_date} onChange={(e) => setEditForm((p) => ({ ...p, start_date: e.target.value }))} />
                  </div>
                  <div className="grid gap-1.5">
                    <Label className="text-xs text-muted-foreground">Previsão de encerramento</Label>
                    <Input type="date" value={editForm.expected_end_date} onChange={(e) => setEditForm((p) => ({ ...p, expected_end_date: e.target.value }))} />
                  </div>
                  <div className="grid gap-1.5 sm:col-span-2">
                    <Label className="text-xs text-muted-foreground">Fim real {c.is_current && '(deixe vazio se ainda em vigor)'}</Label>
                    <Input type="date" value={editForm.end_date} onChange={(e) => setEditForm((p) => ({ ...p, end_date: e.target.value }))} />
                  </div>
                  <div className="grid gap-1.5">
                    <Label className="text-xs text-muted-foreground">Nº do contrato</Label>
                    <Input value={editForm.contract_number} onChange={(e) => setEditForm((p) => ({ ...p, contract_number: e.target.value }))} placeholder="Ex: 042/2025" />
                  </div>
                  <div className="grid gap-1.5">
                    <Label className="text-xs text-muted-foreground">Ano do contrato</Label>
                    <Input type="number" inputMode="numeric" min={CONTRACT_YEAR_MIN} max={contractYearMax()} value={editForm.contract_year} onChange={(e) => setEditForm((p) => ({ ...p, contract_year: e.target.value }))} placeholder="Ex: 2025" />
                  </div>
                  <div className="grid gap-1.5 sm:col-span-2">
                    <Label className="text-xs text-muted-foreground">Link do contrato no site da prefeitura</Label>
                    <Input type="url" value={editForm.contract_url} onChange={(e) => setEditForm((p) => ({ ...p, contract_url: e.target.value }))} placeholder="https://transparencia.prefeitura.../contrato-042-2025.pdf" />
                  </div>
                </div>
                <div className="flex gap-2 justify-end">
                  <Button type="button" variant="outline" size="sm" onClick={() => setEditingContractId(null)}>Cancelar</Button>
                  <Button type="submit" size="sm" disabled={saving}>Salvar</Button>
                </div>
              </form>
            ) : (
              <div key={c.id} className="flex items-center justify-between p-3 border rounded-lg text-sm gap-3">
                <div className="min-w-0 flex-1">
                  <p className="font-medium truncate">{c.owner_name || 'Proprietário não informado'} {c.is_current && <span className="text-xs text-green-600">(atual)</span>}</p>
                  <p className="text-xs text-muted-foreground">{formatDate(c.start_date)} — {c.end_date ? formatDate(c.end_date) : 'em vigor'}</p>
                  {(c.contract_number || c.contract_year) && (
                    <p className="text-xs text-muted-foreground">
                      Contrato {c.contract_number || 's/nº'}{c.contract_year ? `/${c.contract_year}` : ''}
                      {c.contract_url && (
                        <>
                          {' · '}
                          <a href={c.contract_url} target="_blank" rel="noopener noreferrer" className="text-tc-red hover:underline">ver no site da prefeitura</a>
                        </>
                      )}
                    </p>
                  )}
                  {c.expected_end_date && (
                    <p className="text-xs text-amber-600">Previsão de encerramento: {formatDate(c.expected_end_date)}</p>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <p className="font-semibold">{formatCurrency(c.monthly_value)}</p>
                  <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => startEditingContract(c)}>
                    <Edit className="w-3.5 h-3.5" />
                  </Button>
                  <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-red-500 hover:text-red-600" onClick={() => setDeletingContract(c)}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            )
          ))}
          {contracts.length === 0 && <p className="text-sm text-muted-foreground">Nenhum contrato cadastrado ainda.</p>}
        </div>
      )}

      <Dialog open={!!deletingContract} onOpenChange={(open) => !open && setDeletingContract(null)}>
        <DialogContent className="sm:max-w-md bg-card border-border">
          <DialogHeader><DialogTitle className="text-xl font-bold text-foreground">Remover contrato</DialogTitle></DialogHeader>
          <p className="text-muted-foreground">
            Tem certeza que deseja remover o contrato de "{deletingContract?.owner_name || 'proprietário não informado'}"? Esta ação não pode ser desfeita.
          </p>
          <DialogFooter className="sm:justify-end gap-2">
            <DialogClose asChild><Button type="button" variant="outline">Cancelar</Button></DialogClose>
            <Button type="button" variant="destructive" onClick={handleDeleteContract}>
              <Trash2 className="w-4 h-4 mr-2" /> Remover
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

const RentalMediaManager = ({ propertyId }) => {
  const { toast } = useToast();
  const [photos, setPhotos] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [uploadingPhotos, setUploadingPhotos] = useState(false);
  const [uploadingDocs, setUploadingDocs] = useState(false);
  const [docType, setDocType] = useState('contrato');

  const fetchMedia = useCallback(async () => {
    const [photosRes, docsRes] = await Promise.all([
      supabase.from('rental_property_media').select('*').eq('property_id', propertyId).order('created_at'),
      supabase.from('rental_property_documents').select('*').eq('property_id', propertyId).order('created_at'),
    ]);
    setPhotos(photosRes.data || []);
    setDocuments(docsRes.data || []);
  }, [propertyId]);

  useEffect(() => { fetchMedia(); }, [fetchMedia]);

  const handleUploadPhotos = async (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    setUploadingPhotos(true);
    try {
      for (const file of files) {
        const ext = file.name.split('.').pop();
        const path = `properties/${propertyId}/photos/${Date.now()}-${Math.random().toString(36).substring(2, 10)}.${ext}`;
        const { error: uploadError } = await supabase.storage.from('rental-property-media').upload(path, file);
        if (uploadError) throw uploadError;
        const { data: { publicUrl } } = supabase.storage.from('rental-property-media').getPublicUrl(path);
        const { error: dbError } = await supabase.from('rental_property_media').insert({ property_id: propertyId, url: publicUrl });
        if (dbError) throw dbError;
      }
      // Sem toast: o fetchMedia abaixo põe as fotos na galeria da tela.
      await fetchMedia();
    } catch (error) {
      toast({ title: 'Erro ao enviar fotos', description: error.message, variant: 'destructive' });
    } finally {
      setUploadingPhotos(false);
    }
  };

  const handleUploadDocuments = async (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    setUploadingDocs(true);
    try {
      for (const file of files) {
        const ext = file.name.split('.').pop();
        const path = `properties/${propertyId}/documents/${Date.now()}-${Math.random().toString(36).substring(2, 10)}.${ext}`;
        const { error: uploadError } = await supabase.storage.from('rental-property-media').upload(path, file);
        if (uploadError) throw uploadError;
        const { data: { publicUrl } } = supabase.storage.from('rental-property-media').getPublicUrl(path);
        const { error: dbError } = await supabase.from('rental_property_documents').insert({ property_id: propertyId, type: docType, url: publicUrl, description: file.name });
        if (dbError) throw dbError;
      }
      // Sem toast: o fetchMedia abaixo põe os documentos na lista da tela.
      await fetchMedia();
    } catch (error) {
      toast({ title: 'Erro ao enviar documentos', description: error.message, variant: 'destructive' });
    } finally {
      setUploadingDocs(false);
    }
  };

  const handleRemovePhoto = async (photo) => {
    const { error } = await supabase.from('rental_property_media').delete().eq('id', photo.id);
    if (!error) {
      try {
        const filePath = new URL(photo.url).pathname.split('/rental-property-media/')[1];
        if (filePath) await supabase.storage.from('rental-property-media').remove([decodeURIComponent(filePath)]);
      } catch {}
      fetchMedia();
    }
  };

  const handleRemoveDocument = async (doc) => {
    const { error } = await supabase.from('rental_property_documents').delete().eq('id', doc.id);
    if (!error) {
      try {
        const filePath = new URL(doc.url).pathname.split('/rental-property-media/')[1];
        if (filePath) await supabase.storage.from('rental-property-media').remove([decodeURIComponent(filePath)]);
      } catch {}
      fetchMedia();
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <Label className="mb-2 block">Fotos do imóvel</Label>
        <Input type="file" accept="image/*" multiple onChange={handleUploadPhotos} disabled={uploadingPhotos} />
        <div className="grid grid-cols-3 gap-2 mt-3">
          {photos.map((p) => (
            <div key={p.id} className="relative group">
              <img src={p.url} alt="" className="w-full h-20 object-cover rounded-md" />
              <button type="button" onClick={() => handleRemovePhoto(p)} className="absolute top-1 right-1 bg-black/60 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      </div>

      <div>
        <Label className="mb-2 block">Documentos (contrato / aditivos)</Label>
        <div className="flex gap-2 mb-2">
          <select value={docType} onChange={(e) => setDocType(e.target.value)} className="border rounded-md px-2 text-sm">
            <option value="contrato">Contrato</option>
            <option value="aditivo">Aditivo</option>
          </select>
          <Input type="file" accept="application/pdf,image/*" multiple onChange={handleUploadDocuments} disabled={uploadingDocs} />
        </div>
        <div className="space-y-2">
          {documents.map((d) => (
            <div key={d.id} className="flex items-center justify-between p-2 border rounded-md text-sm">
              <a href={d.url} target="_blank" rel="noopener noreferrer" className="text-tc-red hover:underline truncate flex-1">
                {d.type === 'contrato' ? 'Contrato' : 'Aditivo'} — {d.description}
              </a>
              <Button size="icon" variant="ghost" onClick={() => handleRemoveDocument(d)}><Trash2 className="w-3 h-3 text-destructive" /></Button>
            </div>
          ))}
          {documents.length === 0 && <p className="text-sm text-muted-foreground">Nenhum documento enviado.</p>}
        </div>
      </div>
    </div>
  );
};

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
        title: '',
        address: '',
        street_number: '',
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

  const [saving, setSaving] = useState(false);
  // Fixo pela identidade original do imóvel ao abrir o modal — não muda depois
  // que "Salvar e continuar" atribui um id ao formData, para o footer de
  // Informações continuar mostrando "Salvar e continuar" durante toda a
  // sessão de cadastro (até o usuário clicar "Concluir" nas outras abas).
  const isNewProperty = !property?.id;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const saved = await onSave(formData);
      if (!saved) return; // erro já mostrado via toast pelo onSave
      if (isNewProperty) {
        // Continua no mesmo modal: libera as abas Contratos/Mídia sem fechar.
        setFormData((prev) => ({ ...prev, id: saved.id }));
      } else {
        onClose();
      }
    } finally {
      setSaving(false);
    }
  };

  if (!formData) return null;

  const filteredBairros = (bairros || []).filter((b) => (b.name || '').toLowerCase().includes(bairroSearch.toLowerCase()));

  return (
    <Dialog open={!!property} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{property?.id ? 'Editar Imóvel' : 'Novo Imóvel Alugado'}</DialogTitle>
        </DialogHeader>
        <Tabs defaultValue="info" className="w-full">
          <TabsList className={`grid w-full ${formData.id ? 'grid-cols-3' : 'grid-cols-1'} mb-4`}>
            <TabsTrigger value="info">Informações</TabsTrigger>
            {formData.id && <TabsTrigger value="contracts">Contratos</TabsTrigger>}
            {formData.id && <TabsTrigger value="media">Mídia</TabsTrigger>}
          </TabsList>
          <TabsContent value="info">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="h-64 rounded-xl overflow-hidden border">
                <LocationPickerMap onLocationChange={handleLocationChange} initialPosition={formData.location} fallbackCityCenter={fallbackCityCenter} />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="title">Título</Label>
                <Input id="title" name="title" value={formData.title || ''} onChange={handleChange} placeholder="Ex: Sede da Secretaria de Saúde" required />
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="grid gap-2 col-span-2">
                  <Label htmlFor="address">Endereço</Label>
                  <Input id="address" name="address" value={formData.address} onChange={(e) => { addressTouchedRef.current = true; handleChange(e); }} required />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="street_number">Número</Label>
                  <Input id="street_number" name="street_number" value={formData.street_number || ''} onChange={handleChange} placeholder="Ex: 123" />
                </div>
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
                {bairroSearch.trim() && filteredBairros.length > 0 && (
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
                <Button type="submit" disabled={saving}>
                  {isNewProperty ? 'Salvar e continuar' : 'Salvar'}
                </Button>
              </div>
            </form>
          </TabsContent>
          {formData.id && (
            <TabsContent value="contracts" className="space-y-4">
              <RentalContractsManager propertyId={formData.id} />
              {isNewProperty && (
                <div className="flex justify-end pt-2 border-t">
                  <Button type="button" onClick={onClose}>Concluir</Button>
                </div>
              )}
            </TabsContent>
          )}
          {formData.id && (
            <TabsContent value="media" className="space-y-4">
              <RentalMediaManager propertyId={formData.id} />
              {isNewProperty && (
                <div className="flex justify-end pt-2 border-t">
                  <Button type="button" onClick={onClose}>Concluir</Button>
                </div>
              )}
            </TabsContent>
          )}
        </Tabs>
      </DialogContent>
    </Dialog>
  );
};

const ManageRentalPropertiesPage = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
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

  // Abre o modal de edição automaticamente quando chega via ?edit=ID (link
  // "Editar imóvel" na página de detalhes) — some do URL depois de abrir para
  // não reabrir se o usuário atualizar a página com o modal já fechado.
  useEffect(() => {
    const editId = searchParams.get('edit');
    if (!editId || properties.length === 0) return;
    const target = properties.find((p) => String(p.id) === String(editId));
    if (target) {
      setEditingProperty(target);
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.delete('edit');
        return next;
      }, { replace: true });
    }
  }, [searchParams, properties, setSearchParams]);

  // Retorna o registro salvo (para o modal poder continuar editando, sem
  // fechar, no fluxo "Salvar e continuar" de um imóvel novo) ou null em erro.
  // Quem decide fechar o modal é o chamador (RentalPropertyEditModal).
  const handleSaveProperty = async (propertyToSave) => {
    // area_m2 é coluna gerada (length_m * width_m) — Postgres rejeita update
    // direto nela. created_at/updated_at também não devem ser reenviados.
    const { id, location, bairro, contracts, area_m2, created_at, updated_at, ...data } = propertyToSave;

    let resolvedCityId = null;
    if (location) {
      resolvedCityId = await resolveCityIdFromLocation(location);
    }
    if (resolvedCityId == null) {
      toast({ title: 'Não foi possível identificar a cidade', description: 'Confira se o marcador no mapa está sobre a localização correta.', variant: 'destructive' });
      return null;
    }
    if (isScopedAmbassador && !myActiveCityIds.includes(resolvedCityId)) {
      toast({ title: 'Fora da sua área', description: 'Você só pode gerenciar imóveis nas suas cidades.', variant: 'destructive' });
      return null;
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
      return null;
    }
    toast({ title: `Imóvel ${id ? 'atualizado' : 'criado'} com sucesso!` });
    await fetchData();
    return result.data;
  };

  const handleDeleteProperty = async (propertyId) => {
    try {
      const subfolders = ['photos', 'documents'];
      const filesToRemove = [];
      for (const subfolder of subfolders) {
        const prefix = `properties/${propertyId}/${subfolder}`;
        const { data: files, error: listError } = await supabase.storage
          .from('rental-property-media')
          .list(prefix, { limit: 1000 });
        if (!listError && files) {
          files.forEach((f) => filesToRemove.push(`${prefix}/${f.name}`));
        }
      }
      if (filesToRemove.length > 0) {
        await supabase.storage.from('rental-property-media').remove(filesToRemove);
      }
    } catch (storageError) {
      console.error('Falha ao remover arquivos de armazenamento do imóvel:', storageError);
    }

    const { error } = await supabase.from('rental_properties').delete().eq('id', propertyId);
    if (error) {
      toast({ title: 'Erro ao remover imóvel', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Imóvel removido com sucesso!', variant: 'destructive' });
      fetchData();
    }
    setDeletingProperty(null);
  };

  const filteredProperties = properties.filter((p) => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return p.address.toLowerCase().includes(term) || (p.title || '').toLowerCase().includes(term);
  });

  const { visiveis: imoveisVisiveis, propsPaginacao } = useListaPaginada(filteredProperties, {
    porPagina: 12,
    chaveFiltro: searchTerm,
  });

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
          <Input placeholder="Buscar por título ou endereço..." className="pl-9" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
        </div>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-[150px] w-full rounded-xl" />
            ))}
          </div>
        ) : filteredProperties.length === 0 ? (
          <p className="text-center text-muted-foreground py-10">
            {searchTerm ? 'Nenhum imóvel corresponde à busca.' : 'Nenhum imóvel cadastrado ainda.'}
          </p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {imoveisVisiveis.map((property) => {
              const currentContract = (property.contracts || []).find((c) => c.is_current);
              return (
                <Card key={property.id}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between mb-2">
                      <h3 className="font-bold line-clamp-1">{property.title || property.address}</h3>
                      <div className="flex gap-1">
                        <Button size="icon" variant="ghost" onClick={() => setEditingProperty(property)}><Edit className="w-4 h-4" /></Button>
                        <Button size="icon" variant="ghost" onClick={() => setDeletingProperty(property)}><Trash2 className="w-4 h-4 text-destructive" /></Button>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground line-clamp-1 mb-1">{property.address}</p>
                    <p className="text-xs text-muted-foreground flex items-center gap-1 mb-1"><MapPin className="w-3 h-3" /> {property.bairro?.name || 'Sem bairro'}</p>
                    {currentContract?.owner_name && <p className="text-sm font-semibold text-tc-red">{currentContract.owner_name}</p>}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {!loading && <PaginacaoLista {...propsPaginacao} />}
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

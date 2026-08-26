
import React, { useState, useEffect, lazy, Suspense, useCallback, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Helmet } from 'react-helmet';
import { Link } from 'react-router-dom';
import { ArrowLeft, PlusCircle, Edit, Trash2, Save, MapPin, Search, BookOpen, Image as ImageIcon, FileText, ChevronLeft, ChevronRight, UploadCloud, Loader2, HelpCircle } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { useListaPaginada } from '@/hooks/useListaPaginada';
import PaginacaoLista from '@/components/admin/PaginacaoLista';
import { Dialog, DialogContent, FormDialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Combobox } from '@/components/ui/combobox';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useCityIdFromLocation } from '@/hooks/useCityIdFromLocation';
import { showAppError, showAppNotice } from '@/lib/appError';
import { formatarTamanhoArquivo } from '@/lib/pavementStreetHistory';
import {
  PAVEMENT_DOCUMENT_ACCEPT,
  PAVEMENT_PHOTO_ACCEPT,
  pavementMediaStoragePath,
  removePavementMedia,
  uploadPavementMedia,
  validatePavementMediaFile,
} from '@/lib/pavementStreetMedia';

const LocationPickerMap = lazy(() => import('@/components/LocationPickerMap'));

const fileTypeLabel = (fileName) => {
  const extension = String(fileName || '').match(/\.([^.]+)$/)?.[1];
  return extension ? extension.toUpperCase() : '';
};

const fileTitle = (fileName) => String(fileName || '').replace(/\.[^.]+$/, '');

const storagePathsFromStreet = (street) => [
  ...(Array.isArray(street?.historical_documents) ? street.historical_documents : []),
  ...(Array.isArray(street?.historical_photos) ? street.historical_photos : []),
].map(pavementMediaStoragePath).filter(Boolean);

const PavementEditModal = ({ street, onSave, onClose, bairros, existingStreets, defaultCityId, fallbackCityCenter, onBairroCreated }) => {
  const { resolveCityIdFromLocation } = useCityIdFromLocation();
  const [formData, setFormData] = useState(null);
  const [bairroSearch, setBairroSearch] = useState('');
  const [creatingBairro, setCreatingBairro] = useState(false);
  const [fetchingMapBairro, setFetchingMapBairro] = useState(false);
  const [activeStep, setActiveStep] = useState(1);
  const [saving, setSaving] = useState(false);

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
        is_unnamed: Boolean(street.is_unnamed),
        historical_documents: Array.isArray(street.historical_documents) ? street.historical_documents : [],
        historical_photos: Array.isArray(street.historical_photos) ? street.historical_photos : [],
      });
      setBairroSearch('');
      setActiveStep(1);
      setSaving(false);
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
      showAppError({ title: 'Defina a localização no mapa primeiro', description: 'Precisamos da cidade para criar o bairro.', variant: 'destructive' });
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
      .select('id, name, city_id')
      .single();
    setCreatingBairro(false);
    if (error) {
      showAppError({ title: 'Erro ao criar bairro', description: error.message, variant: 'destructive' });
      return;
    }
    onBairroCreated?.(data);
    handleSelectChange('bairro_id', data.id);
    setBairroSearch('');
  };

  const handleUseBairroFromMap = async () => {
    if (!formData?.location) {
      showAppError({ title: 'Marque a localização no mapa primeiro', variant: 'destructive' });
      return;
    }
    setFetchingMapBairro(true);
    try {
      const { data, error } = await supabase.functions.invoke('reverse-geocode', {
        body: { lat: formData.location.lat, lng: formData.location.lng, zoom: 18 },
      });
      const suburb = !error ? (data?.suburb || null) : null;
      if (!suburb) {
        showAppError({ title: 'Bairro não encontrado no mapa', description: 'Digite o nome do bairro manualmente.', variant: 'destructive' });
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

  const updateArrayItem = (field, index, key, value) => {
    setFormData((prev) => ({
      ...prev,
      [field]: (prev[field] || []).map((item, itemIndex) =>
        itemIndex === index ? { ...item, [key]: value } : item
      ),
    }));
  };

  const addArrayItem = (field, item) => {
    setFormData((prev) => ({ ...prev, [field]: [...(prev[field] || []), item] }));
  };

  const removeArrayItem = (field, index) => {
    setFormData((prev) => ({
      ...prev,
      [field]: (prev[field] || []).filter((_, itemIndex) => itemIndex !== index),
    }));
  };

  const handleFileChange = (field, index, kind, file) => {
    if (!file) return;
    const validationError = validatePavementMediaFile(file, kind);
    if (validationError) {
      showAppError({ title: 'Arquivo não aceito', description: validationError, variant: 'destructive' });
      return;
    }

    setFormData((prev) => ({
      ...prev,
      [field]: (prev[field] || []).map((item, itemIndex) => {
        if (itemIndex !== index) return item;
        const nextItem = {
          ...item,
          file,
          original_name: file.name,
          size: file.size,
        };
        if (kind === 'document') {
          nextItem.type = fileTypeLabel(file.name);
          if (!String(nextItem.title || '').trim()) nextItem.title = fileTitle(file.name);
        }
        return nextItem;
      }),
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (activeStep === 1) {
      setActiveStep(2);
      return;
    }
    const attachmentWithoutFile = [
      ...(formData.historical_documents || []),
      ...(formData.historical_photos || []),
    ].find((item) => !item?.file && !String(item?.url || '').trim());
    if (attachmentWithoutFile) {
      showAppError({
        title: 'Selecione os arquivos',
        description: 'Todo item adicionado precisa ter um arquivo escolhido antes de salvar.',
        variant: 'destructive',
      });
      return;
    }
    const pavementFieldsEnabled = formData.status === 'paved' || formData.status === 'partially_paved';
    
    const dataToSave = {
      ...formData,
      paving_date: pavementFieldsEnabled && formData.paving_date ? `${formData.paving_date}-01-01` : null,
      pavement_type: pavementFieldsEnabled ? formData.pavement_type : null,
    };
    
    setSaving(true);
    const saved = await onSave(dataToSave);
    if (!saved) setSaving(false);
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
    <Dialog open={!!street} onOpenChange={(open) => !open && !saving && onClose()}>
      <FormDialogContent className="h-[94dvh] grid-rows-[auto_minmax(0,1fr)] gap-0 overflow-hidden border-border p-0 sm:h-[90vh] sm:max-w-[760px]">
        <DialogHeader className="border-b border-edge-subtle px-5 py-4 pr-12 sm:px-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <DialogTitle className="text-xl font-bold text-content-primary sm:text-2xl">{formData.id ? 'Editar Rua' : 'Adicionar Nova Rua'}</DialogTitle>
              <p className="mt-1 text-xs font-medium text-content-tertiary">
                Etapa {activeStep} de 2 · {activeStep === 1 ? 'Dados e localização' : 'História da rua'}
              </p>
            </div>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2" aria-hidden="true">
            <span className="h-1 rounded-full bg-brand" />
            <span className={`h-1 rounded-full transition-colors ${activeStep === 2 ? 'bg-brand' : 'bg-edge-subtle'}`} />
          </div>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="grid min-h-0 grid-rows-[minmax(0,1fr)_auto] overflow-hidden">
          <div className="flex-1 space-y-5 overflow-y-auto px-4 py-5 sm:px-6">
          {activeStep === 1 && <>
          <div className="grid gap-2 sm:grid-cols-[140px_minmax(0,1fr)] sm:items-center sm:gap-4">
            <Label htmlFor="name" className="sm:text-right">Identificação da via</Label>
            <div className="space-y-2">
              <Input
                id="name"
                name="name"
                value={formData.name || ''}
                onChange={handleChange}
                placeholder={formData.is_unnamed ? 'Ex.: Rua Projetada 01 (Bairro)' : 'Nome oficial da rua'}
                required
              />
              <p className="text-xs text-muted-foreground">
                {formData.is_unnamed
                  ? 'Use uma identificação provisória para distinguir esta via no mapa.'
                  : 'Informe o nome oficial da via.'}
              </p>
            </div>
          </div>

          <div className="grid gap-2 sm:grid-cols-[140px_minmax(0,1fr)] sm:items-start sm:gap-4">
            <span className="hidden sm:block" />
            <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-amber-950">
              <Checkbox
                id="is_unnamed"
                checked={Boolean(formData.is_unnamed)}
                onCheckedChange={(checked) => handleSelectChange('is_unnamed', checked === true)}
                className="mt-0.5 border-amber-700 data-[state=checked]:bg-amber-700"
              />
              <div className="space-y-0.5">
                <Label htmlFor="is_unnamed" className="cursor-pointer font-semibold">Rua sem nome oficial</Label>
                <p className="text-xs text-amber-800">Marque quando a via ainda é conhecida apenas por um nome provisório, como “Rua Projetada”.</p>
              </div>
            </div>
          </div>

          <div className="grid gap-2 sm:grid-cols-[140px_minmax(0,1fr)] sm:items-center sm:gap-4">
            <Label htmlFor="cep" className="sm:text-right">CEP</Label>
            <Input id="cep" name="cep" value={formData.cep || ''} onChange={handleChange} placeholder="Ex: 56400-000" />
          </div>

          <div className="grid gap-2 sm:grid-cols-[140px_minmax(0,1fr)] sm:items-start sm:gap-4">
            <Label className="sm:pt-2 sm:text-right">Bairro</Label>
            <div className="min-w-0 space-y-2">
              {selectedBairroName && (
                <p className="text-sm text-muted-foreground">Selecionado: <span className="font-medium text-foreground">{selectedBairroName}</span></p>
              )}
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
                <Input
                  className="col-span-2 sm:col-span-1"
                  placeholder="Buscar ou criar bairro..."
                  value={bairroSearch}
                  onChange={(e) => setBairroSearch(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleCreateBairro(bairroSearch); } }}
                />
                <Button type="button" variant="outline" disabled={creatingBairro} onClick={() => handleCreateBairro(bairroSearch)}>
                  Criar
                </Button>
                <Button type="button" variant="outline" className="whitespace-normal leading-tight" disabled={fetchingMapBairro} onClick={handleUseBairroFromMap}>
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

          <div className="grid gap-2 sm:grid-cols-[140px_minmax(0,1fr)] sm:items-center sm:gap-4">
            <Label htmlFor="status" className="sm:text-right">Status</Label>
            <div className="min-w-0">
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

          <div className={`space-y-5 transition-opacity duration-300 ${pavementFieldsEnabled ? 'opacity-100' : 'opacity-50'}`}>
            <div className="grid gap-2 sm:grid-cols-[140px_minmax(0,1fr)] sm:items-center sm:gap-4">
              <Label htmlFor="pavement_type" className="sm:text-right">Tipo</Label>
              <div className="min-w-0">
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
            <div className="grid gap-2 sm:grid-cols-[140px_minmax(0,1fr)] sm:items-center sm:gap-4">
              <Label htmlFor="paving_date" className="sm:text-right">Ano da Conclusão</Label>
              <Input 
                id="paving_date" 
                name="paving_date" 
                type="number"
                placeholder="Ex: 2024"
                value={formData.paving_date || ''} 
                onChange={handleChange} 
                disabled={!pavementFieldsEnabled}
              />
            </div>
          </div>

          </>}

          {activeStep === 2 && (
          <section className="overflow-hidden rounded-2xl border border-edge-subtle bg-surface-sunken">
            <div className="flex items-center gap-3 p-4">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-subtleBg text-brand-subtleFg">
                <BookOpen className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold">História da rua</p>
                <p className="text-xs text-content-tertiary">Etapa opcional. O botão público só aparece quando existir conteúdo.</p>
              </div>
            </div>

            <div className="space-y-5 border-t border-edge-subtle bg-surface-raised p-4 sm:p-5">

            <div className="space-y-2">
              <Label htmlFor="honoree_name">Nome do homenageado</Label>
              <Input id="honoree_name" name="honoree_name" value={formData.honoree_name || ''} onChange={handleChange} placeholder="Nome completo" />
            </div>

            <div className="space-y-2">
              <Label htmlFor="biography">Biografia</Label>
              <textarea id="biography" name="biography" value={formData.biography || ''} onChange={handleChange} rows={5} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" placeholder="Conte a trajetória e a contribuição do homenageado." />
            </div>

            <div className="space-y-2">
              <Label htmlFor="curiosities">Curiosidades</Label>
              <textarea id="curiosities" name="curiosities" value={formData.curiosities || ''} onChange={handleChange} rows={4} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" placeholder="Uma curiosidade por linha ou em pequenos parágrafos." />
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <Label className="inline-flex items-center gap-1.5"><FileText className="h-4 w-4" /> Documentos</Label>
                <Button type="button" size="sm" variant="outline" onClick={() => addArrayItem('historical_documents', { title: '', description: '', type: '', size: '' })}>
                  <UploadCloud className="mr-2 h-4 w-4" /> Adicionar documento
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">PDF, DOC, DOCX, ODT, XLS, XLSX ou TXT, com até 20 MB. O arquivo será enviado ao Supabase.</p>
              {(formData.historical_documents || []).map((document, index) => (
                <div key={index} className="flex items-start gap-2 rounded-lg border border-border bg-background p-3">
                  <div className="grid min-w-0 flex-1 gap-2">
                    {document.url && !document.file && (
                      <a href={document.url} target="_blank" rel="noopener noreferrer" className="truncate text-xs font-medium text-brand underline-offset-2 hover:underline">
                        Arquivo atual: {document.original_name || document.title || 'abrir documento'}
                      </a>
                    )}
                    <Input
                      type="file"
                      accept={PAVEMENT_DOCUMENT_ACCEPT}
                      onChange={(e) => handleFileChange('historical_documents', index, 'document', e.target.files?.[0])}
                      aria-label={document.url ? 'Substituir documento' : 'Selecionar documento'}
                    />
                    {document.file && (
                      <p className="truncate text-xs text-muted-foreground">
                        Selecionado: {document.file.name} · {formatarTamanhoArquivo(document.file.size)}
                      </p>
                    )}
                    <Input value={document.title || ''} onChange={(e) => updateArrayItem('historical_documents', index, 'title', e.target.value)} placeholder="Título — ex.: Lei de Criação da Rua" />
                    <Input value={document.description || ''} onChange={(e) => updateArrayItem('historical_documents', index, 'description', e.target.value)} placeholder="Subtítulo — ex.: Lei Municipal nº 1.234/2010" />
                  </div>
                  <Button type="button" variant="ghost" size="icon" className="shrink-0 text-red-500" onClick={() => removeArrayItem('historical_documents', index)} aria-label="Remover documento"><Trash2 className="h-4 w-4" /></Button>
                </div>
              ))}
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <Label className="inline-flex items-center gap-1.5"><ImageIcon className="h-4 w-4" /> Fotos históricas e atuais</Label>
                <Button type="button" size="sm" variant="outline" onClick={() => addArrayItem('historical_photos', { caption: '', date: '', subject: 'street' })}>
                  <UploadCloud className="mr-2 h-4 w-4" /> Adicionar foto
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">JPG, PNG, WebP, GIF ou AVIF, com até 10 MB. A imagem será enviada ao Supabase.</p>
              {/* A primeira foto marcada como "da rua" também vira a capa do
                  topo da página pública — não há campo separado para isso. */}
              {(formData.historical_photos || []).map((photo, index) => (
                <div key={index} className="grid gap-2 rounded-lg border border-border bg-background p-3">
                  {photo.url && !photo.file && (
                    <div className="flex items-center gap-3">
                      <img src={photo.url} alt="" className="h-14 w-20 rounded-md border border-border object-cover" />
                      <p className="min-w-0 truncate text-xs font-medium text-muted-foreground">Imagem atual salva no Supabase</p>
                    </div>
                  )}
                  <Input
                    type="file"
                    accept={PAVEMENT_PHOTO_ACCEPT}
                    onChange={(e) => handleFileChange('historical_photos', index, 'photo', e.target.files?.[0])}
                    aria-label={photo.url ? 'Substituir foto' : 'Selecionar foto'}
                  />
                  {photo.file && (
                    <p className="truncate text-xs text-muted-foreground">
                      Selecionada: {photo.file.name} · {formatarTamanhoArquivo(photo.file.size)}
                    </p>
                  )}
                  <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_11rem]">
                    <Input value={photo.caption || ''} onChange={(e) => updateArrayItem('historical_photos', index, 'caption', e.target.value)} placeholder="Legenda — ex.: Vista da entrada da rua" />
                    <Input type="date" value={photo.date || ''} onChange={(e) => updateArrayItem('historical_photos', index, 'date', e.target.value)} aria-label="Data da foto" />
                  </div>
                  <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
                    <select value={photo.subject || 'street'} onChange={(e) => updateArrayItem('historical_photos', index, 'subject', e.target.value)} className="h-10 rounded-md border border-input bg-background px-3 text-sm">
                      <option value="street">Foto da rua</option>
                      <option value="honoree">Foto do homenageado</option>
                    </select>
                    <Button type="button" variant="ghost" className="justify-self-end text-red-500" onClick={() => removeArrayItem('historical_photos', index)}><Trash2 className="mr-2 h-4 w-4" /> Remover</Button>
                  </div>
                </div>
              ))}
            </div>
            </div>
          </section>
          )}

          {activeStep === 1 && (
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
          )}
          </div>
          <DialogFooter className="shrink-0 gap-2 border-t border-edge-subtle bg-surface-raised px-4 py-3 sm:px-6">
            {activeStep === 1 ? (
              <>
                <DialogClose asChild><Button type="button" variant="outline" className="h-11 rounded-xl sm:min-w-28" disabled={saving}>Cancelar</Button></DialogClose>
                <Button type="submit" className="h-11 gap-2 rounded-xl sm:min-w-32" disabled={saving}>Próximo <ChevronRight className="h-4 w-4" /></Button>
              </>
            ) : (
              <>
                <Button type="button" variant="outline" className="h-11 gap-2 rounded-xl sm:min-w-28" onClick={() => setActiveStep(1)} disabled={saving}><ChevronLeft className="h-4 w-4" /> Voltar</Button>
                <Button type="submit" className="h-11 gap-2 rounded-xl sm:min-w-32" disabled={saving}>
                  {saving ? <><Loader2 className="h-4 w-4 animate-spin" /> Enviando...</> : <><Save className="w-4 h-4" /> Salvar</>}
                </Button>
              </>
            )}
          </DialogFooter>
        </form>
      </FormDialogContent>
    </Dialog>
  );
};

const ManagePavementPage = () => {
  const { user } = useAuth();
  const [myActiveCityIds, setMyActiveCityIds] = useState([]);
  const [myCities, setMyCities] = useState([]); // [{ id, name, uf }]
  const isScopedAmbassador = !!user && !user.is_admin && !user.is_master && !!user.is_ambassador;
  const [streets, setStreets] = useState([]);
  const [bairros, setBairros] = useState([]);
  const [buscaRua, setBuscaRua] = useState('');
  const [mostrarSoSemNome, setMostrarSoSemNome] = useState(false);
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
    if (error) showAppError({ title: "Erro ao buscar ruas", description: error.message, variant: "destructive" });
    else setStreets(data.map(s => ({...s, bairro_name: s.bairro?.name})));
  }, [isScopedAmbassador, myActiveCityIds]);

  const fetchBairros = useCallback(async () => {
    let query = supabase.from('bairros').select('*').order('name');
    if (isScopedAmbassador && myActiveCityIds.length > 0) {
      query = query.in('city_id', myActiveCityIds);
    }
    const { data, error } = await query;
    if (error) showAppError({ title: "Erro ao buscar bairros", description: error.message, variant: "destructive" });
    else setBairros(data);
  }, [isScopedAmbassador, myActiveCityIds]);

  useEffect(() => {
    fetchStreets();
    fetchBairros();
  }, [fetchStreets, fetchBairros]);

  const handleSaveStreet = async (streetToSave) => {
    const { id, name, location, bairro, bairro_name, cep, work_id, ...data } = streetToSave;

    if (!name || name.trim() === '') {
        showAppError({ title: "Erro ao salvar", description: "O nome da rua é obrigatório.", variant: "destructive" });
        return false;
    }

    if (!data.bairro_id) {
      showAppError({ title: "Selecione um bairro", description: "A cidade da rua é definida pelo bairro selecionado.", variant: "destructive" });
      return false;
    }

    const selectedBairro = bairros.find((b) => b.id === data.bairro_id);
    const resolvedCityId = selectedBairro?.city_id || null;
    if (!resolvedCityId) {
      showAppError({ title: "Bairro sem cidade definida", description: "Escolha outro bairro ou cadastre o bairro corretamente antes.", variant: "destructive" });
      return false;
    }

    if (isScopedAmbassador && !myActiveCityIds.includes(resolvedCityId)) {
      showAppError({ title: "Fora da sua área", description: "Você só pode gerenciar ruas nas suas cidades.", variant: "destructive" });
      return false;
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
        showAppError({ title: "Erro ao verificar duplicidade", description: checkError.message, variant: "destructive" });
        return false;
    }

    if (count > 0) {
        showAppError({ title: "Rua já cadastrada", description: `A rua "${trimmedName}" já existe nesta cidade.`, variant: "destructive" });
        return false;
    }

    const locationString = location ? `POINT(${location.lng} ${location.lat})` : null;
    const recordId = id || uuidv4();
    const uploadedPaths = [];

    let historicalDocuments;
    let historicalPhotos;
    try {
      historicalDocuments = [];
      for (const item of data.historical_documents || []) {
        if (!item?.file && !String(item?.url || '').trim()) continue;
        let stored = null;
        if (item.file) {
          stored = await uploadPavementMedia({
            supabase,
            file: item.file,
            cityId: resolvedCityId,
            streetId: recordId,
            kind: 'document',
          });
          uploadedPaths.push(stored.path);
        }
        historicalDocuments.push({
          title: item.title?.trim() || fileTitle(item.file?.name || item.original_name) || 'Documento',
          description: item.description?.trim() || '',
          type: item.file ? fileTypeLabel(item.file.name) : (item.type || ''),
          size: item.file ? item.file.size : (item.size || ''),
          original_name: item.file?.name || item.original_name || '',
          url: stored?.url || item.url,
          ...(stored?.path || item.path ? { path: stored?.path || item.path } : {}),
        });
      }

      historicalPhotos = [];
      for (const item of data.historical_photos || []) {
        if (!item?.file && !String(item?.url || '').trim()) continue;
        let stored = null;
        if (item.file) {
          stored = await uploadPavementMedia({
            supabase,
            file: item.file,
            cityId: resolvedCityId,
            streetId: recordId,
            kind: 'photo',
          });
          uploadedPaths.push(stored.path);
        }
        historicalPhotos.push({
          caption: item.caption?.trim() || '',
          date: item.date || '',
          subject: item.subject === 'honoree' ? 'honoree' : 'street',
          original_name: item.file?.name || item.original_name || '',
          url: stored?.url || item.url,
          ...(stored?.path || item.path ? { path: stored?.path || item.path } : {}),
        });
      }
    } catch (uploadError) {
      try { await removePavementMedia(supabase, uploadedPaths); } catch {}
      showAppError({
        title: 'Erro ao enviar anexos',
        description: uploadError.message || 'Não foi possível enviar os arquivos ao Supabase.',
        variant: 'destructive',
      });
      return false;
    }

    const payload = {
      name: trimmedName,
      is_unnamed: Boolean(data.is_unnamed),
      cep: cep || null,
      status: data.status,
      paving_date: data.paving_date,
      pavement_type: data.pavement_type,
      bairro_id: data.bairro_id,
      location: locationString,
      city_id: resolvedCityId,
      honoree_name: data.honoree_name?.trim() || null,
      biography: data.biography?.trim() || null,
      curiosities: data.curiosities?.trim() || null,
      historical_documents: historicalDocuments,
      historical_photos: historicalPhotos,
    };

    let error;
    if (id) {
      ({ error } = await supabase.from('pavement_streets').update(payload).eq('id', id));
    } else {
      ({ error } = await supabase.from('pavement_streets').insert({ id: recordId, ...payload }));
    }

    if (error) {
      try { await removePavementMedia(supabase, uploadedPaths); } catch {}
      showAppError({ title: "Erro ao salvar rua", description: error.message, variant: "destructive" });
      return false;
    } else {
      const previousStreet = streets.find((item) => item.id === id);
      const previousPaths = storagePathsFromStreet(previousStreet);
      const currentPaths = [
        ...historicalDocuments.map(pavementMediaStoragePath),
        ...historicalPhotos.map(pavementMediaStoragePath),
      ].filter(Boolean);
      const removedPaths = previousPaths.filter((path) => !currentPaths.includes(path));
      try {
        await removePavementMedia(supabase, removedPaths);
      } catch (storageError) {
        console.error('A rua foi salva, mas anexos substituídos não foram removidos:', storageError);
      }

      await fetchStreets();
      setEditingStreet(null);
      showAppNotice({
        title: id ? 'Rua atualizada' : 'Rua adicionada',
        description: uploadedPaths.length > 0 ? 'Os anexos foram enviados ao Supabase.' : '',
      });
      return true;
    }
  };

  const handleAddNewStreet = () => {
    setEditingStreet({ id: null, name: '', is_unnamed: false, cep: '', status: 'unpaved', pavement_type: 'asphalt', bairro_id: null, location: null, paving_date: '', honoree_name: '', biography: '', curiosities: '', historical_documents: [], historical_photos: [] });
  };

  const handleDeleteStreet = async (streetId) => {
    const { error } = await supabase.from('pavement_streets').delete().eq('id', streetId);
    if (error) {
      showAppError({ title: "Erro ao remover rua", description: error.message, variant: "destructive" });
    } else {
      try {
        await removePavementMedia(supabase, storagePathsFromStreet(deletingStreet));
      } catch (storageError) {
        console.error('A rua foi removida, mas seus anexos não foram removidos:', storageError);
      }
      await fetchStreets();
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
  const totalSemNome = useMemo(() => streets.filter((street) => street.is_unnamed).length, [streets]);

  const ruasFiltradas = useMemo(() => {
    const termo = buscaRua.trim().toLowerCase();
    return streets.filter((s) => {
      if (mostrarSoSemNome && !s.is_unnamed) return false;
      if (!termo) return true;
      return (s.name || '').toLowerCase().includes(termo)
        || (s.bairro_name || '').toLowerCase().includes(termo)
        || (s.cep || '').toLowerCase().includes(termo);
    });
  }, [streets, buscaRua, mostrarSoSemNome]);

  const { visiveis: ruasVisiveis, propsPaginacao: propsPaginacaoRuas } = useListaPaginada(
    ruasFiltradas,
    { porPagina: 20, chaveFiltro: `${buscaRua}|${mostrarSoSemNome}` }
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
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <CardTitle>Ruas Cadastradas</CardTitle>
                <CardDescription className="mt-1">{streets.length} rua{streets.length === 1 ? '' : 's'} no total.</CardDescription>
              </div>
              <Button
                type="button"
                variant={mostrarSoSemNome ? 'default' : 'outline'}
                size="sm"
                className="gap-2"
                onClick={() => setMostrarSoSemNome((current) => !current)}
              >
                <HelpCircle className="h-4 w-4" />
                {totalSemNome} sem nome oficial
              </Button>
            </div>
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
                {buscaRua || mostrarSoSemNome ? 'Nenhuma rua corresponde ao filtro.' : 'Nenhuma rua cadastrada ainda.'}
              </p>
            ) : (
            <div className="space-y-3">
              {ruasVisiveis.map(street => (
                <div key={street.id} className="flex flex-col sm:flex-row justify-between items-start sm:items-center p-4 bg-background rounded-lg border gap-4">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold">{street.name}</p>
                      {street.is_unnamed && (
                        <Badge variant="outline" className="gap-1 border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-50">
                          <HelpCircle className="h-3 w-3" /> Sem nome oficial
                        </Badge>
                      )}
                    </div>
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

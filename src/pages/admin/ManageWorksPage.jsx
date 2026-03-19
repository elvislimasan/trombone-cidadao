import React, { useState, useEffect, useCallback, lazy, Suspense, useRef } from 'react';
import { motion } from 'framer-motion';
import { Helmet } from 'react-helmet';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { PlusCircle, Edit, Trash2, ArrowLeft, Save, X, MapPin, Image as ImageIcon, Link2, Info, Search, SlidersHorizontal, Briefcase, Calculator } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useToast } from '@/components/ui/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/lib/customSupabaseClient';
import { Progress } from '@/components/ui/progress';
import { WorkMeasurementsTab } from '@/components/admin/WorkMeasurementsTab';
import { WorkFinancialTab } from '@/components/admin/WorkFinancialTab';
import { Combobox } from '@/components/ui/combobox';

const LocationPickerMap = lazy(() => import('@/components/LocationPickerMap'));


// Componente de Filtros com tratamento de erros
const FiltersSection = React.memo(({ filters, setFilters, workOptions, statusMap }) => {
  const [hasError, setHasError] = React.useState(false);

  React.useEffect(() => {
    setHasError(false);
  }, [filters, workOptions]);

  if (hasError) {
    return (
      <div className="pt-3 sm:pt-4 border-t">
        <p className="text-sm text-destructive">Erro ao carregar filtros. Tente recarregar a página.</p>
      </div>
    );
  }

  try {
    if (!workOptions || !statusMap) {
      return (
        <div className="pt-3 sm:pt-4 border-t">
          <p className="text-sm text-muted-foreground">Carregando filtros...</p>
        </div>
      );
    }

    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3 sm:gap-4 pt-3 sm:pt-4 border-t">
        <div className="grid gap-2">
          <Label>Status</Label>
          <Combobox
            value={filters.status || ''}
            onChange={(value) => {
              try {
                setFilters(prev => ({ ...prev, status: value }));
              } catch (error) {
                console.error('Erro ao alterar filtro de status:', error);
                setHasError(true);
              }
            }}
            options={Object.entries(statusMap).map(([value, label]) => ({ value, label }))}
            placeholder="Todos"
            searchPlaceholder="Buscar status..."
          />
        </div>

        <div className="grid gap-2">
          <Label>Categoria</Label>
          <Combobox
            value={filters.category || ''}
            onChange={(value) => {
              try {
                setFilters(prev => ({ ...prev, category: value }));
              } catch (error) {
                console.error('Erro ao alterar filtro de categoria:', error);
                setHasError(true);
              }
            }}
            options={(workOptions.categories || []).map(cat => ({ value: cat.id, label: cat.name }))}
            placeholder="Todas"
            searchPlaceholder="Buscar categoria..."
          />
        </div>

        <div className="grid gap-2">
          <Label>Bairro</Label>
          <Combobox
            value={filters.bairro || ''}
            onChange={(value) => {
              try {
                setFilters(prev => ({ ...prev, bairro: value }));
              } catch (error) {
                console.error('Erro ao alterar filtro de bairro:', error);
                setHasError(true);
              }
            }}
            options={(workOptions.bairros || []).map(b => ({ value: b.id, label: b.name }))}
            placeholder="Todos"
            searchPlaceholder="Buscar bairro..."
          />
        </div>

        <div className="grid gap-2">
          <Label>Área</Label>
          <Combobox
            value={filters.area || ''}
            onChange={(value) => {
              try {
                setFilters(prev => ({ ...prev, area: value }));
              } catch (error) {
                console.error('Erro ao alterar filtro de área:', error);
                setHasError(true);
              }
            }}
            options={(workOptions.areas || []).map(a => ({ value: a.id, label: a.name }))}
            placeholder="Todas"
            searchPlaceholder="Buscar área..."
          />
        </div>

        <div className="grid gap-2">
          <Label>Construtora</Label>
          <Combobox
            value={filters.contractor || ''}
            onChange={(value) => {
              try {
                setFilters(prev => ({ ...prev, contractor: value }));
              } catch (error) {
                console.error('Erro ao alterar filtro de construtora:', error);
                setHasError(true);
              }
            }}
            options={(workOptions.contractors || []).map(c => ({ value: c.id, label: c.name }))}
            placeholder="Todas"
            searchPlaceholder="Buscar construtora..."
          />
        </div>
      </div>
    );
  } catch (error) {
    console.error('Erro ao renderizar filtros:', error);
    setHasError(true);
    return (
      <div className="pt-3 sm:pt-4 border-t">
        <p className="text-sm text-destructive">Erro ao carregar filtros. Tente recarregar a página.</p>
      </div>
    );
  }
});
FiltersSection.displayName = 'FiltersSection';

export const WorkEditModal = ({ work, onSave, onClose, workOptions, initialTab = 'info', onWorkUpdated }) => {
  const { toast } = useToast();
  const [formData, setFormData] = useState(null);
  const [thumbnailFile, setThumbnailFile] = useState(null);
  const [thumbnailPreview, setThumbnailPreview] = useState(null);
  const fileInputRef = useRef(null);

  const [activeTab, setActiveTab] = useState('info');
  const [isMeasurementEditing, setIsMeasurementEditing] = useState(false);
  const [hasUnsavedMeasurementChanges, setHasUnsavedMeasurementChanges] = useState(false);

  // Auto-save logic
  useEffect(() => {
    if (formData && work) {
      const draftKey = work.id ? `work_draft_${work.id}` : `work_draft_new`;
      localStorage.setItem(draftKey, JSON.stringify(formData));
    }
  }, [formData, work]);

  const clearDraft = () => {
    if (work) {
      const draftKey = work.id ? `work_draft_${work.id}` : `work_draft_new`;
      localStorage.removeItem(draftKey);
    }
  };

  const EDIT_TABS = React.useMemo(() => {
    const tabs = [
      { id: 'info', label: 'Informações', icon: Info },
      { id: 'links', label: 'Links', icon: Link2 },
    ];

    if (formData?.id) {
      tabs.push({ id: 'history', label: 'Histórico/Fases', icon: Briefcase });
      if (formData?.is_complete) {
        tabs.push({ id: 'financial', label: 'Financeiro', icon: Calculator });
      }
    }

    return tabs;
  }, [formData?.id, formData?.is_complete]);

  const goToTab = (nextTabId) => {
    if ((activeTab === 'history' || activeTab === 'financial') && isMeasurementEditing) {
      if (!window.confirm("Você possui um cadastro em edição. Ao trocar de aba, as alterações não salvas serão perdidas. Deseja continuar?")) {
        return;
      }
    }
    setTimeout(() => setActiveTab(nextTabId), 0);
  };

  useEffect(() => {
    if (work) {
      // Reset navigation state when opening modal or switching modes
      setActiveTab(initialTab);

      setThumbnailFile(null);
      setThumbnailPreview(work.thumbnail_url || null);
      const parseLocation = (loc) => {
        if (!loc) return null;
        if (typeof loc === 'object' && loc.coordinates) {
          return { lat: loc.coordinates[1], lng: loc.coordinates[0] };
        }
        if (typeof loc === 'string') {
          const match = loc.match(/POINT\(([-\d.]+) ([-\d.]+)\)/);
          if (match) {
            return { lat: parseFloat(match[2]), lng: parseFloat(match[1]) };
          }
        }
        return null;
      };

      const initialData = work.id ? { 
        ...work,
        thumbnail_url: work.thumbnail_url || null,
        location: parseLocation(work.location),
        bairro_id: work.bairro?.id || work.bairro_id || '',
        work_category_id: work.work_category?.id || work.work_category_id || '',
        work_area_id: work.work_area?.id || work.work_area_id || '',
        contractor_id: work.contractor?.id || work.contractor_id || '',
      } : { 
        id: null,
        title: '',
        description: '',
        thumbnail_url: null,
        location: null, 
        status: 'planned',
        related_links: [],
        bairro_id: '', 
        work_category_id: '', 
        work_area_id: '', 
        execution_percentage: null,
        contractor_id: null,
        total_value: null,
        funding_source: [],
        other_details: '',
        long_description: '',
        address: '',
        parliamentary_amendment: { has: false, author: '' },
      };
      setFormData(initialData);

      // Restore draft if exists
      const draftKey = work.id ? `work_draft_${work.id}` : `work_draft_new`;
      const savedDraft = localStorage.getItem(draftKey);
      if (savedDraft) {
        try {
          const parsedDraft = JSON.parse(savedDraft);
          // Only restore if it matches the current work ID (or is new)
          if ((work.id && parsedDraft.id === work.id) || (!work.id && !parsedDraft.id)) {
            setFormData(prev => ({ ...prev, ...parsedDraft }));
            // toast({ title: "Rascunho restaurado", description: "Seus dados não salvos foram recuperados." });
          }
        } catch (e) {
          console.error("Erro ao restaurar rascunho:", e);
        }
      }
    } else {
      setFormData(null);
      setThumbnailFile(null);
      setThumbnailPreview(null);
    }
  }, [work, initialTab]);
  
  const handleChange = (e) => {
    const { name, value, type } = e.target;
    setFormData(prev => ({ ...prev, [name]: type === 'number' ? (value === '' ? null : Number(value)) : value }));
  };

  const handleSelectChange = (name, value) => {
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleLocationChange = (newLocation) => {
    setFormData(prev => ({ ...prev, location: newLocation }));
  };
  
  const handleLinkChange = (index, field, value) => {
    const newLinks = [...(formData.related_links || [])];
    newLinks[index][field] = value;
    setFormData(prev => ({ ...prev, related_links: newLinks }));
  };

  const addLink = () => {
    setFormData(prev => ({ ...prev, related_links: [...(prev.related_links || []), { title: '', url: '' }] }));
  };

  const removeLink = (index) => {
    const newLinks = [...(formData.related_links || [])];
    newLinks.splice(index, 1);
    setFormData(prev => ({ ...prev, related_links: newLinks }));
  };

  const handleThumbnailChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setThumbnailFile(file);
      const objectUrl = URL.createObjectURL(file);
      setThumbnailPreview(objectUrl);
    }
  };

  const handleRemoveThumbnail = () => {
    setThumbnailFile(null);
    setThumbnailPreview(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    setFormData(prev => ({ ...prev, thumbnail_url: null }));
  };

  const handleSubmit = async (e) => {
    if (e) e.preventDefault();
    
    if (!formData) return;
    if (!canProceed()) {
      const missing = getMissingRequiredFields();
      toast({
        title: "Preencha os campos obrigatórios",
        description: missing.length ? `Faltando: ${missing.join(', ')}` : "Verifique os dados obrigatórios.",
        variant: "destructive"
      });
      return;
    }

    if (isMeasurementEditing) {
      if (!window.confirm("Você possui uma medição em edição. Ao salvar a obra, as alterações não salvas na medição serão perdidas. Deseja continuar mesmo assim?")) {
        return;
      }
    }

    let currentThumbnailUrl = formData.thumbnail_url;

    if (thumbnailFile) {
      try {
        const fileExt = thumbnailFile.name.split('.').pop();
        const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
        const filePath = `thumbnails/${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from('work-media')
          .upload(filePath, thumbnailFile);

        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabase.storage
          .from('work-media')
          .getPublicUrl(filePath);

        currentThumbnailUrl = publicUrl;
      } catch (error) {
        console.error('Error uploading thumbnail:', error);
        // Continue saving without updating thumbnail if upload fails
      }
    }
    
    clearDraft();
    await onSave({ ...formData, thumbnail_url: currentThumbnailUrl });
  };

  const canProceed = () => {
    if (!formData) return false;
    if (!formData.title || !String(formData.title).trim()) return false;
    if (!formData.work_category_id) return false;
    if (!formData.bairro_id) return false;
    return true;
  };

  const getMissingRequiredFields = () => {
    const missing = [];
    if (!formData?.title || !String(formData.title).trim()) missing.push('Título da Obra');
    if (!formData?.work_category_id) missing.push('Categoria');
    if (!formData?.bairro_id) missing.push('Bairro');
    return missing;
  };

  if (!formData) return null;
  
  return (
    <Dialog open={!!work} onOpenChange={(open) => {
      if (!open) {
        if (isMeasurementEditing) {
          if (!window.confirm("Você possui uma medição em edição. Ao fechar, as alterações não salvas serão perdidas. Deseja continuar?")) {
            return;
          }
        }
        clearDraft();
        onClose();
      }
    }}>
      <DialogContent hideClose className="w-full h-full max-w-full sm:max-w-5xl sm:h-auto sm:max-h-[90vh] flex flex-col bg-card border-border p-0 sm:p-6 gap-0">
        <DialogHeader className="p-4 sm:p-0 border-b sm:border-none bg-background sm:bg-transparent sticky top-0 z-20 shrink-0">
          <div className="flex justify-between items-start">
            <div className="space-y-1">
              <DialogTitle className="text-xl sm:text-2xl font-bold text-foreground flex items-center gap-2">
                {formData.id ? 'Editar Obra' : 'Nova Obra'}
              </DialogTitle>
              <CardDescription className="hidden sm:block">{formData.id ? 'Altere os detalhes da obra e gerencie mídias e links.' : 'Preencha as informações básicas para criar a obra.'}</CardDescription>
            </div>
            <Button variant="ghost" size="icon" className="h-8 w-8 -mt-1 -mr-2 sm:hidden" onClick={onClose}>
              <X className="w-5 h-5" />
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8 hidden sm:flex absolute right-0 top-0" onClick={onClose}>
              <X className="w-4 h-4" />
            </Button>
          </div>
        </DialogHeader>
        
        <div className="flex-grow overflow-hidden grid grid-cols-1 md:grid-cols-4 gap-6 p-4 sm:p-0">
          <div className="hidden md:block md:col-span-1 overflow-y-auto pr-2">
            <nav className="flex flex-col gap-2">
              {EDIT_TABS.map(tab => (
                <Button 
                  key={tab.id}
                  type="button"
                  variant={activeTab === tab.id ? 'secondary' : 'ghost'} 
                  onClick={() => goToTab(tab.id)} 
                  className="justify-start gap-2"
                >
                  <tab.icon className="w-4 h-4" /> {tab.label}
                </Button>
              ))}
            </nav>
          </div>

          <div className="md:col-span-3 flex-grow overflow-y-auto pr-4 space-y-6">
            {/* Mobile Tab Indicator */}
            <div className="md:hidden mb-4 border-b pb-2">
              <div className="flex justify-between items-center text-sm text-muted-foreground mb-1">
                <span>Passo {EDIT_TABS.findIndex(t => t.id === activeTab) + 1} de {EDIT_TABS.length}</span>
                <span className="font-medium text-foreground">
                  {EDIT_TABS.find(t => t.id === activeTab)?.label}
                </span>
              </div>
              <Progress value={((EDIT_TABS.findIndex(t => t.id === activeTab) + 1) / EDIT_TABS.length) * 100} className="h-1.5" />
            </div>

            <div className={`space-y-6 ${activeTab === 'info' ? 'block' : 'hidden'}`}>
                <Card>
                  <CardHeader><CardTitle>Informações Básicas</CardTitle></CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid gap-2">
                      <Label>Imagem de Capa (Thumbnail)</Label>
                      <div className="flex items-center gap-4">
                        <div className="relative w-32 h-20 bg-slate-100 rounded overflow-hidden border">
                          {thumbnailPreview ? (
                            <img src={thumbnailPreview} alt="Thumbnail" className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-slate-400">
                              <ImageIcon className="w-8 h-8" />
                            </div>
                          )}
                        </div>
                        <div className="flex flex-col gap-2">
                          <Input
                            ref={fileInputRef}
                            type="file"
                            accept="image/*"
                            onChange={handleThumbnailChange}
                            className="w-full max-w-xs"
                          />
                          {thumbnailPreview && (
                            <Button type="button" variant="outline" size="sm" onClick={handleRemoveThumbnail} className="w-fit text-destructive hover:text-destructive">
                              <Trash2 className="w-4 h-4 mr-2" />
                              Remover imagem
                            </Button>
                          )}
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground">Esta imagem será usada na listagem de obras e ao compartilhar o link (Open Graph).</p>
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="title">Título da Obra</Label>
                      <Input id="title" name="title" value={formData.title || ''} onChange={handleChange} required />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="description">Subtítulo</Label>
                      <Textarea id="description" name="description" value={formData.description || ''} onChange={handleChange} rows={3} />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="long_description">Descrição Longa (Detalhada)</Label>
                      <Textarea id="long_description" name="long_description" value={formData.long_description || ''} onChange={handleChange} rows={6} />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="address">Endereço / Localização por extenso</Label>
                      <Input id="address" name="address" value={formData.address || ''} onChange={handleChange} placeholder="Ex: Rua Principal, Centro" />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="grid gap-2">
                        <Label htmlFor="work_category_id">Categoria</Label>
                        <Combobox
                          value={formData.work_category_id}
                          onChange={(v) => handleSelectChange('work_category_id', v)}
                          options={[{ value: '', label: 'Selecionar' }, ...workOptions.categories.map(c => ({ value: c.id, label: c.name }))]}
                          placeholder="Selecione a categoria..."
                          searchPlaceholder="Buscar categoria..."
                          modal
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="bairro_id">Bairro</Label>
                        <Combobox
                          value={formData.bairro_id}
                          onChange={(v) => handleSelectChange('bairro_id', v)}
                          options={[{ value: '', label: 'Selecionar' }, ...workOptions.bairros.map(b => ({ value: b.id, label: b.name }))]}
                          placeholder="Selecione o bairro..."
                          searchPlaceholder="Buscar bairro..."
                          modal
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="grid gap-2">
                        <Label htmlFor="work_area_id">Área de Implementação</Label>
                        <Combobox
                          value={formData.work_area_id}
                          onChange={(v) => handleSelectChange('work_area_id', v)}
                          options={[{ value: '', label: 'Selecionar' }, ...workOptions.areas.map(a => ({ value: a.id, label: a.name }))]}
                          placeholder="Selecione a área..."
                          searchPlaceholder="Buscar área..."
                          modal
                        />
                      </div>
                    </div>
                  </CardContent>
                </Card>
                
                <Card>
                  <CardHeader><CardTitle>Outras Informações</CardTitle></CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="grid gap-2">
                        <Label htmlFor="other_details">Detalhes Adicionais</Label>
                        <Textarea id="other_details" name="other_details" value={formData.other_details || ''} onChange={handleChange} placeholder="Observações gerais sobre a obra" />
                      </div>
                      <div className="grid gap-2">
                        <Label>Emenda Parlamentar</Label>
                        <div className="flex items-center space-x-2">
                          <Checkbox
                            id="parliamentary_has"
                            checked={!!formData.parliamentary_amendment?.has}
                            onCheckedChange={(checked) =>
                              setFormData(prev => ({ ...prev, parliamentary_amendment: { ...(prev.parliamentary_amendment || {}), has: !!checked } }))
                            }
                          />
                          <Label htmlFor="parliamentary_has">Possui emenda?</Label>
                        </div>
                        <div className="grid gap-2 mt-2">
                          <Label htmlFor="parliamentary_author">Autor (se houver)</Label>
                          <Input
                            id="parliamentary_author"
                            name="parliamentary_author"
                            value={formData.parliamentary_amendment?.author || ''}
                            onChange={(e) =>
                              setFormData(prev => ({ ...prev, parliamentary_amendment: { ...(prev.parliamentary_amendment || {}), author: e.target.value } }))
                            }
                            disabled={!formData.parliamentary_amendment?.has}
                          />
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                
                <Card>
                    <CardHeader><CardTitle className="flex items-center gap-2"><MapPin className="w-5 h-5" /> Localização no Mapa</CardTitle></CardHeader>
                    <CardContent>
                      <div className="h-64 w-full rounded-lg overflow-hidden border border-input">
                        <Suspense fallback={<div className="w-full h-full bg-muted animate-pulse flex items-center justify-center">Carregando mapa...</div>}>
                          <LocationPickerMap onLocationChange={handleLocationChange} initialPosition={formData.location} />
                        </Suspense>
                      </div>
                    </CardContent>
                </Card>
              </div>
        
            <div className={activeTab === 'links' ? 'block' : 'hidden'}>
              <div className="space-y-4">
                <Card>
                  <CardHeader><CardTitle>Links Relacionados</CardTitle></CardHeader>
                  <CardContent className="space-y-4">
                    {formData.related_links && formData.related_links.map((link, index) => (
                      <div key={index} className="flex flex-col gap-2 p-3 border rounded-lg bg-background">
                        <div className="grid gap-2 flex-grow">
                          <Label>Título</Label>
                          <Input value={link.title} onChange={(e) => handleLinkChange(index, 'title', e.target.value)} />
                        </div>
                        <div className="grid gap-2 flex-grow">
                          <Label>URL</Label>
                          <Input value={link.url} onChange={(e) => handleLinkChange(index, 'url', e.target.value)} />
                        <Button type="button" variant="destructive" size="icon" onClick={() => removeLink(index)}><Trash2 className="w-4 h-4" /></Button>
                        </div>
                      </div>
                    ))}
                    <Button type="button" variant="outline" onClick={addLink}><PlusCircle className="w-4 h-4 mr-2" />Adicionar Link</Button>
                  </CardContent>
                </Card>
              </div>
            </div>
            {activeTab === 'history' && (
              formData.id ? (
                <WorkMeasurementsTab 
                  workId={formData.id} 
                  contractors={workOptions?.contractors || []} 
                  onEditingChange={setIsMeasurementEditing}
                  onDirtyChange={(dirty) => setHasUnsavedMeasurementChanges(dirty)}
                  onWorkCompletionChange={(isComplete) => {
                    setFormData((prev) => (prev ? { ...prev, is_complete: isComplete } : prev));
                    if (onWorkUpdated) onWorkUpdated();
                  }}
                />
              ) : (
                <Card>
                  <CardContent className="flex flex-col items-center justify-center py-10 text-center">
                    <Briefcase className="w-12 h-12 text-muted-foreground mb-4" />
                    <h3 className="text-lg font-medium">Salve a obra primeiro</h3>
                    <p className="text-muted-foreground max-w-sm mt-2">
                      Para adicionar medições, fases e histórico de execução, é necessário salvar as informações básicas da obra primeiro.
                    </p>
                  </CardContent>
                </Card>
              )
            )}

            {activeTab === 'financial' && (
              formData.id ? (
                <WorkFinancialTab
                  workId={formData.id}
                  onEditingChange={setIsMeasurementEditing}
                />
              ) : (
                <Card>
                  <CardContent className="flex flex-col items-center justify-center py-10 text-center">
                    <Calculator className="w-12 h-12 text-muted-foreground mb-4" />
                    <h3 className="text-lg font-medium">Salve a obra primeiro</h3>
                    <p className="text-muted-foreground max-w-sm mt-2">
                      Para lançar pagamentos e acompanhar os valores, é necessário salvar as informações básicas da obra primeiro.
                    </p>
                  </CardContent>
                </Card>
              )
            )}
          </div>
        </div>

        {!((activeTab === 'history' || activeTab === 'financial') && isMeasurementEditing) && (
        <DialogFooter className="flex-shrink-0 p-4 sm:p-0 sm:pt-4 border-t sm:border-t-0 mt-auto sm:mt-4 bg-background sm:bg-transparent z-20 flex flex-col sm:flex-row gap-2">
          <div className="grid grid-cols-2 gap-2 w-full sm:hidden">
            <Button 
              type="button" 
              variant="outline" 
              disabled={EDIT_TABS.findIndex(t => t.id === activeTab) === 0}
              onClick={() => {
                if (activeTab === 'history' && hasUnsavedMeasurementChanges) {
                  if (!window.confirm("Você possui uma medição em edição. Ao trocar de aba, as alterações não salvas serão perdidas. Deseja continuar?")) {
                    return;
                  }
                }
                const idx = EDIT_TABS.findIndex(t => t.id === activeTab);
                if (idx > 0) setActiveTab(EDIT_TABS[idx - 1].id);
              }}
            >
              Anterior
            </Button>
            <Button 
              type="button" 
              disabled={
                (!formData?.id && !canProceed() && (activeTab === 'info' || EDIT_TABS.findIndex(t => t.id === activeTab) === EDIT_TABS.length - 1)) ||
                (activeTab === 'info' && !canProceed())
              }
              onClick={() => {
                const idx = EDIT_TABS.findIndex(t => t.id === activeTab);
                if ((activeTab === 'info' || (!formData?.id && idx === EDIT_TABS.length - 1)) && !canProceed()) {
                  const missing = getMissingRequiredFields();
                  toast({
                    title: "Preencha os campos obrigatórios",
                    description: missing.length ? `Faltando: ${missing.join(', ')}` : "Verifique os dados obrigatórios.",
                    variant: "destructive"
                  });
                  return;
                }
                if (idx < EDIT_TABS.length - 1) {
                  if (activeTab === 'history' && hasUnsavedMeasurementChanges) {
                    if (!window.confirm("Você possui uma medição em edição. Ao trocar de aba, as alterações não salvas serão perdidas. Deseja continuar?")) {
                      return;
                    }
                  }
                  setActiveTab(EDIT_TABS[idx + 1].id);
                }
                else handleSubmit();
              }}
            >
              {EDIT_TABS.findIndex(t => t.id === activeTab) === EDIT_TABS.length - 1 ? (formData.id ? 'Salvar' : 'Criar Obra') : 'Próximo'}
            </Button>
          </div>
          <div className="hidden sm:flex justify-end gap-2 w-full sm:border-t sm:pt-4">
            <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
            <Button type="button" onClick={handleSubmit} disabled={!canProceed()} className="gap-2">
              <Save className="w-4 h-4" /> {formData.id ? 'Salvar Alterações' : 'Criar Obra'}
            </Button>
          </div>
        </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
};

const ManageWorksPage = () => {
  const { toast } = useToast();
  const location = useLocation();
  const navigate = useNavigate();
  const [works, setWorks] = useState([]);
  const [workOptions, setWorkOptions] = useState({ categories: [], areas: [], bairros: [], contractors: [] });
  const [editingWork, setEditingWork] = useState(null);
  const [editingWorkInitialTab, setEditingWorkInitialTab] = useState('info');
  const [deletingWork, setDeletingWork] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filters, setFilters] = useState({
    status: '',
    category: '',
    bairro: '',
    area: '',
    contractor: ''
  });
  const [showFilters, setShowFilters] = useState(false);
  const [isLoadingFilters, setIsLoadingFilters] = useState(false);

  const fetchData = useCallback(async () => {
    const { data, error } = await supabase.from('public_works').select(`
      *,
      bairro:bairros(id, name),
      work_category:work_categories(id, name),
      work_area:work_areas(id, name),
      contractor:contractors(id, name)
    `).order('created_at', { ascending: false });
    if (error) {
      toast({ title: "Erro ao buscar obras", description: error.message, variant: "destructive" });
      console.error("Fetch Works Error:", error);
    } else {
      setWorks(data);
    }
  }, [toast]);
  
  const fetchOptions = useCallback(async () => {
    const [categories, areas, bairros, contractors] = await Promise.all([
      supabase.from('work_categories').select('*'),
      supabase.from('work_areas').select('*'),
      supabase.from('bairros').select('*'),
      supabase.from('contractors').select('*'),
    ]);
    setWorkOptions({
        categories: categories.data || [],
        areas: areas.data || [],
        bairros: bairros.data || [],
        contractors: contractors.data || [],
    });
  }, []);

  useEffect(() => {
    fetchData();
    fetchOptions();
  }, [fetchData, fetchOptions]);

  useEffect(() => {
    const editId = location.state && location.state.editWorkId;
    if (editId && works.length > 0 && !editingWork) {
      const found = works.find(w => w.id === editId);
      if (found) {
        setEditingWorkInitialTab('info');
        setEditingWork(found);
      }
    }
  }, [location.state, works, editingWork]);

  const handleSaveWork = async (workToSave) => {
    const { id, location, ...data } = workToSave;
    
    delete data.bairro;
    delete data.work_category;
    delete data.work_area;
    delete data.contractor;

    const locationString = location ? `POINT(${location.lng} ${location.lat})` : null;
    const payload = { ...data, location: locationString };
    
    ['bairro_id', 'work_category_id', 'work_area_id', 'contractor_id'].forEach(key => {
        if(payload[key] === '') payload[key] = null;
    });
    
    // Ensure funding source is always an array
    if (!Array.isArray(payload.funding_source)) {
        payload.funding_source = [];
    }

    let result;
    if (id) {
      result = await supabase.from('public_works').update(payload).eq('id', id).select().single();
    } else {
      payload.is_complete = false;
      result = await supabase.from('public_works').insert(payload).select().single();
    }

    if (result.error) {
      toast({ title: "Erro ao salvar obra", description: result.error.message, variant: "destructive" });
      console.error("Save error:", result.error);
    } else {
      const savedWorkId = result.data.id;
      console.log('Obra salva com ID:', savedWorkId);

      toast({ title: `Obra ${id ? 'atualizada' : 'criada'} com sucesso!` });
      await fetchData();
      
      setEditingWork(null);
    }
  };
  
  const handleAddNewWork = () => {
    setEditingWorkInitialTab('info');
    setEditingWork({});
  };
  
  const handleDeleteWork = async (workId) => {
    const { error } = await supabase.from('public_works').delete().eq('id', workId);
    if (error) {
      toast({ title: "Erro ao remover obra", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Obra removida com sucesso!", variant: "destructive" });
      fetchData();
    }
    setDeletingWork(null);
  };
  
  const statusMap = {
    'planned': 'Prevista',
    'tendered': 'Licitada',
    'in-progress': 'Em Andamento',
    'stalled': 'Paralisada',
    'unfinished': 'Inacabada',
    'completed': 'Concluída',
  };

  // Filtrar obras
  const filteredWorks = (works || []).filter(work => {
    if (!work) return false;
    
    try {
      // Busca por texto (título e descrição)
      const matchesSearch = !searchTerm || 
        (work.title && work.title.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (work.description && work.description.toLowerCase().includes(searchTerm.toLowerCase()));

      // Filtros
      const matchesStatus = !filters.status || work.status === filters.status;
      const matchesCategory = !filters.category || work.work_category_id === filters.category;
      const matchesBairro = !filters.bairro || work.bairro_id === filters.bairro;
      const matchesArea = !filters.area || work.work_area_id === filters.area;
      const matchesContractor = !filters.contractor || work.contractor_id === filters.contractor;

      return matchesSearch && matchesStatus && matchesCategory && matchesBairro && matchesArea && matchesContractor;
    } catch (error) {
      console.error('Erro ao filtrar obra:', error, work);
      return false;
    }
  });

  const clearFilters = () => {
    setSearchTerm('');
    setFilters({
      status: '',
      category: '',
      bairro: '',
      area: '',
      contractor: ''
    });
  };

  const hasActiveFilters = searchTerm || Object.values(filters).some(v => v !== '');

  // Error boundary para evitar tela branca
  if (!workOptions) {
    return (
      <div className="container mx-auto px-3 sm:px-4 py-4 sm:py-6 md:py-12">
        <div className="text-center py-12">
          <p className="text-muted-foreground">Carregando opções...</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <Helmet>
        <title>Gerenciar Obras Públicas - Admin</title>
        <meta name="description" content="Adicione, edite ou remova obras públicas." />
      </Helmet>
      <div className="container mx-auto px-3 sm:px-4 py-4 sm:py-6 md:py-12">
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="flex flex-wrap items-center justify-between gap-3 sm:gap-4 mb-6 sm:mb-8 md:mb-12">
          <div className="flex items-center gap-2 sm:gap-4 min-w-0 flex-1">
            <Link to="/admin"><Button variant="outline" size="icon" className="flex-shrink-0"><ArrowLeft className="w-4 h-4" /></Button></Link>
            <div className="min-w-0 flex-1">
              <h1 className="text-xl sm:text-2xl md:text-3xl lg:text-4xl font-bold text-tc-red truncate">Gerenciar Obras Públicas</h1>
              <p className="mt-1 sm:mt-2 text-sm sm:text-base md:text-lg text-muted-foreground">Adicione, edite ou remova obras do mapa.</p>
            </div>
          </div>
           <div className="flex flex-wrap gap-2 w-full sm:w-auto">
            <Link to="/admin/obras/opcoes"><Button variant="outline" size="sm" className="text-xs sm:text-sm">Gerenciar Opções</Button></Link>
            <Button onClick={handleAddNewWork} size="sm" className="gap-1 sm:gap-2 text-xs sm:text-sm"><PlusCircle className="w-3 h-3 sm:w-4 sm:h-4" /> <span className="hidden sm:inline">Adicionar Obra</span><span className="sm:hidden">Adicionar</span></Button>
          </div>
        </motion.div>
        
        <Card className="mb-4 sm:mb-6">
          <CardHeader className="p-4 sm:p-6">
            <div className="flex flex-col gap-3 sm:gap-4">
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="text-lg sm:text-xl">Buscar e Filtrar</CardTitle>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    try {
                      setIsLoadingFilters(true);
                      setShowFilters(!showFilters);
                      // Pequeno delay para garantir que o estado foi atualizado
                      setTimeout(() => setIsLoadingFilters(false), 100);
                    } catch (error) {
                      console.error('Erro ao alternar filtros:', error);
                      setIsLoadingFilters(false);
                    }
                  }}
                  disabled={isLoadingFilters}
                  className="gap-1 sm:gap-2 text-xs sm:text-sm flex-shrink-0"
                >
                  <SlidersHorizontal className="w-3 h-3 sm:w-4 sm:h-4" />
                  <span className="hidden sm:inline">{showFilters ? 'Ocultar' : 'Mostrar'} Filtros</span>
                  <span className="sm:hidden">{showFilters ? 'Ocultar' : 'Filtros'}</span>
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3 sm:space-y-4 p-4 sm:p-6">
            {/* Campo de busca */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por título ou descrição..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 text-sm sm:text-base"
              />
            </div>

            {/* Filtros */}
            {showFilters && workOptions && (
              <FiltersSection
                filters={filters}
                setFilters={setFilters}
                workOptions={workOptions}
                statusMap={statusMap}
              />
            )}

            {/* Botão limpar filtros */}
            {hasActiveFilters && (
              <div className="flex justify-end pt-2 sm:pt-3 border-t">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clearFilters}
                  className="gap-1 sm:gap-2 text-xs sm:text-sm"
                >
                  <X className="w-3 h-3 sm:w-4 sm:h-4" />
                  Limpar Filtros
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="overflow-hidden">
          <CardHeader className="p-4 sm:p-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <CardTitle className="text-lg sm:text-xl">
                Obras Cadastradas
                {filteredWorks.length !== works.length && (
                  <span className="text-xs sm:text-sm font-normal text-muted-foreground ml-1 sm:ml-2 block sm:inline">
                    ({filteredWorks.length} de {works.length})
                  </span>
                )}
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent className="p-4 sm:p-6 overflow-hidden">
            {filteredWorks.length === 0 ? (
              <div className="text-center py-8 sm:py-12">
                <p className="text-sm sm:text-base text-muted-foreground">
                  {hasActiveFilters 
                    ? 'Nenhuma obra encontrada com os filtros aplicados.' 
                    : 'Nenhuma obra cadastrada.'}
                </p>
                {hasActiveFilters && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={clearFilters}
                    className="mt-4 gap-1 sm:gap-2 text-xs sm:text-sm"
                  >
                    <X className="w-3 h-3 sm:w-4 sm:h-4" />
                    Limpar Filtros
                  </Button>
                )}
              </div>
            ) : (
              <div className="space-y-2 sm:space-y-3">
                {filteredWorks.map(work => (
                <div key={work.id} className="flex flex-col sm:flex-row justify-between items-start sm:items-center p-3 sm:p-4 bg-background rounded-lg border gap-3 sm:gap-4 overflow-hidden">
                  <div className="min-w-0 flex-1 overflow-hidden w-full sm:w-auto">
                    <p className="font-semibold text-sm sm:text-base break-words line-clamp-2">{work.title}</p>
                    <div className="flex flex-wrap items-center gap-2 mt-1">
                      <p className="text-xs sm:text-sm text-muted-foreground">Status: {statusMap[work.status] || work.status}</p>
                      {work.is_complete ? (
                        <Badge variant="secondary" className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">
                          Cadastro completo
                        </Badge>
                      ) : (
                        <Badge >
                          Cadastro incompleto
                        </Badge>
                      )}
                    </div>
                  </div>
                  <div className="flex-shrink-0 flex gap-2 w-full sm:w-auto justify-end sm:justify-start">
                    {!work.is_complete ? (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 sm:h-10 text-xs sm:text-sm"
                        onClick={() => {
                          setEditingWorkInitialTab('history');
                          setEditingWork(work);
                        }}
                      >
                        Completar cadastro
                      </Button>
                    ) : null}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 sm:h-10 sm:w-10 flex-shrink-0"
                      onClick={() => {
                        setEditingWorkInitialTab('info');
                        setEditingWork(work);
                      }}
                    >
                      <Edit className="w-3 h-3 sm:w-4 sm:h-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 sm:h-10 sm:w-10 text-red-500 hover:text-red-600 flex-shrink-0" onClick={() => setDeletingWork(work)}><Trash2 className="w-3 h-3 sm:w-4 sm:h-4" /></Button>
                  </div>
                </div>
              ))}
               </div>
             )}
          </CardContent>
        </Card>
      </div>

      <WorkEditModal
        work={editingWork}
        initialTab={editingWorkInitialTab}
        onSave={handleSaveWork}
        onClose={() => {
          setEditingWork(null);
          if (location.state && location.state.editWorkId) {
            navigate(location.pathname, { replace: true });
          }
        }}
        workOptions={workOptions}
        onWorkUpdated={fetchData}
      />

      <Dialog open={!!deletingWork} onOpenChange={(open) => !open && setDeletingWork(null)}>
        <DialogContent className="sm:max-w-md bg-card border-border">
          <DialogHeader><DialogTitle className="text-xl font-bold text-foreground">Confirmar Exclusão</DialogTitle></DialogHeader>
          <p className="text-muted-foreground">Tem certeza que deseja remover a obra "{deletingWork?.title}"? Esta ação não pode ser desfeita.</p>
          <DialogFooter className="sm:justify-end gap-2">
            <DialogClose asChild><Button type="button" variant="outline">Cancelar</Button></DialogClose>
            <Button type="button" variant="destructive" onClick={() => handleDeleteWork(deletingWork.id)}><Trash2 className="w-4 h-4 mr-2" /> Remover</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default ManageWorksPage;

import React, { useState, useEffect, useCallback, lazy, Suspense, useRef } from 'react';
import { motion } from 'framer-motion';
import { Helmet } from 'react-helmet';
import { Link } from 'react-router-dom';
import { PlusCircle, Edit, Trash2, ArrowLeft, Save, X, Upload, Paperclip, MapPin, Image as ImageIcon, Video, Link2, Info, Wrench } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useToast } from '@/components/ui/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { supabase } from '@/lib/customSupabaseClient';
import { parseCurrency, formatCurrency } from '@/lib/utils';

const LocationPickerMap = lazy(() => import('@/components/LocationPickerMap'));

const WorkEditModal = ({ work, onSave, onClose, workOptions }) => {
  const [formData, setFormData] = useState(null);
  const [activeTab, setActiveTab] = useState('info');

  useEffect(() => {
    if (work) {
      const initialData = work.id ? { 
        ...work,
        location: work.location ? { lat: work.location.coordinates[1], lng: work.location.coordinates[0] } : null,
        bairro_id: work.bairro?.id || work.bairro_id || '',
        work_category_id: work.work_category?.id || work.work_category_id || '',
        work_area_id: work.work_area?.id || work.work_area_id || '',
        contractor_id: work.contractor?.id || work.contractor_id || '',
      } : { 
        id: null,
        title: '',
        description: '',
        location: null, 
        status: 'planned',
        funding_source: [],
        related_links: [],
        bairro_id: '', 
        work_category_id: '', 
        work_area_id: '', 
        contractor_id: '',
        total_value: null,
        amount_spent: null,
        execution_percentage: null,
        execution_period_days: null,
        start_date: null,
        service_order_date: null,
        expected_end_date: null,
        inauguration_date: null,
      };
      setFormData(initialData);
    } else {
      setFormData(null);
    }
  }, [work]);
  
  const handleChange = (e) => {
    const { name, value, type } = e.target;
    setFormData(prev => ({ ...prev, [name]: type === 'number' ? (value === '' ? null : Number(value)) : value }));
  };

  const handleCurrencyChange = (e) => {
    const { name, value } = e.target;
    const numericValue = parseCurrency(value);
    setFormData(prev => ({ ...prev, [name]: numericValue }));
  };
  
  const handleDateChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value === '' ? null : value }));
  };

  const handleSelectChange = (name, value) => {
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleFundingSourceChange = (source) => {
    setFormData(prev => {
        const currentSources = prev.funding_source || [];
        const newSources = currentSources.includes(source)
            ? currentSources.filter(s => s !== source)
            : [...currentSources, source];
        return { ...prev, funding_source: newSources };
    });
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

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave(formData);
  };

  if (!formData) return null;
  
  return (
    <Dialog open={!!work} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-4xl max-h-[90vh] flex flex-col bg-card border-border">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold text-foreground">{formData.id ? 'Editar Obra' : 'Adicionar Nova Obra'}</DialogTitle>
          <CardDescription>{formData.id ? 'Altere os detalhes da obra e gerencie mídias e links.' : 'Preencha as informações básicas para criar a obra.'}</CardDescription>
        </DialogHeader>
        
        <div className="flex-grow overflow-hidden grid grid-cols-1 md:grid-cols-4 gap-6">
          <div className="md:col-span-1 overflow-y-auto pr-2">
            <nav className="flex flex-col gap-2">
              <Button variant={activeTab === 'info' ? 'secondary' : 'ghost'} onClick={() => setActiveTab('info')} className="justify-start gap-2"><Info className="w-4 h-4" /> Informações</Button>
              {formData.id && <Button variant={activeTab === 'media' ? 'secondary' : 'ghost'} onClick={() => setActiveTab('media')} className="justify-start gap-2"><ImageIcon className="w-4 h-4" /> Mídias</Button>}
              {formData.id && <Button variant={activeTab === 'links' ? 'secondary' : 'ghost'} onClick={() => setActiveTab('links')} className="justify-start gap-2"><Link2 className="w-4 h-4" /> Links</Button>}
            </nav>
          </div>

          <div className="md:col-span-3 flex-grow overflow-y-auto pr-4 space-y-6">
            {activeTab === 'info' && (
              <div className="space-y-6">
                <Card>
                  <CardHeader><CardTitle>Informações Básicas</CardTitle></CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid gap-2">
                      <Label htmlFor="title">Título da Obra</Label>
                      <Input id="title" name="title" value={formData.title || ''} onChange={handleChange} required />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="description">Descrição</Label>
                      <Textarea id="description" name="description" value={formData.description || ''} onChange={handleChange} rows={4} />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="grid gap-2">
                        <Label htmlFor="status">Status</Label>
                        <Select name="status" value={formData.status} onValueChange={(v) => handleSelectChange('status', v)} required>
                          <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="planned">Prevista</SelectItem>
                            <SelectItem value="tendered">Licitada</SelectItem>
                            <SelectItem value="in-progress">Em Andamento</SelectItem>
                            <SelectItem value="stalled">Paralisada</SelectItem>
                            <SelectItem value="unfinished">Inacabada</SelectItem>
                            <SelectItem value="completed">Concluída</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="execution_percentage">Percentual de Execução (%)</Label>
                        <Input id="execution_percentage" name="execution_percentage" type="number" min="0" max="100" value={formData.execution_percentage || ''} onChange={handleChange} />
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="grid gap-2">
                        <Label htmlFor="work_category_id">Categoria</Label>
                        <Select name="work_category_id" value={formData.work_category_id} onValueChange={(v) => handleSelectChange('work_category_id', v)}>
                          <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                          <SelectContent>
                            {workOptions.categories.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="bairro_id">Bairro</Label>
                        <Select name="bairro_id" value={formData.bairro_id} onValueChange={(v) => handleSelectChange('bairro_id', v)}>
                          <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                          <SelectContent>
                            {workOptions.bairros.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="grid gap-2">
                        <Label htmlFor="work_area_id">Área de Implementação</Label>
                        <Select name="work_area_id" value={formData.work_area_id} onValueChange={(v) => handleSelectChange('work_area_id', v)}>
                          <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                          <SelectContent>
                            {workOptions.areas.map(a => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="contractor_id">Construtora</Label>
                        <Select name="contractor_id" value={formData.contractor_id} onValueChange={(v) => handleSelectChange('contractor_id', v)}>
                          <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                          <SelectContent>
                            {workOptions.contractors.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader><CardTitle>Valores e Prazos</CardTitle></CardHeader>
                  <CardContent className="space-y-4">
                     <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="grid gap-2">
                            <Label htmlFor="total_value">Valor Previsto (R$)</Label>
                            <Input id="total_value" name="total_value" value={formatCurrency(formData.total_value, false)} onChange={handleCurrencyChange} />
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="amount_spent">Valor Gasto (R$)</Label>
                            <Input id="amount_spent" name="amount_spent" value={formatCurrency(formData.amount_spent, false)} onChange={handleCurrencyChange} />
                        </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="grid gap-2">
                            <Label htmlFor="execution_period_days">Prazo de Execução (dias)</Label>
                            <Input id="execution_period_days" name="execution_period_days" type="number" value={formData.execution_period_days || ''} onChange={handleChange} />
                        </div>
                        <div className="grid gap-2">
                          <Label>Fonte do Recurso</Label>
                          <div className="flex items-center space-x-4 pt-2">
                            {['Federal', 'Estadual', 'Municipal'].map(source => (
                              <div key={source} className="flex items-center space-x-2">
                                <Checkbox id={`funding_${source}`} checked={(formData.funding_source || []).includes(source.toLowerCase())} onCheckedChange={() => handleFundingSourceChange(source.toLowerCase())} />
                                <Label htmlFor={`funding_${source}`}>{source}</Label>
                              </div>
                            ))}
                          </div>
                        </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="grid gap-2">
                            <Label htmlFor="start_date">Data de Início</Label>
                            <Input id="start_date" name="start_date" type="date" value={formData.start_date || ''} onChange={handleDateChange} />
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="service_order_date">Data da Ordem de Serviço</Label>
                            <Input id="service_order_date" name="service_order_date" type="date" value={formData.service_order_date || ''} onChange={handleDateChange} />
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="expected_end_date">Previsão de Conclusão</Label>
                            <Input id="expected_end_date" name="expected_end_date" type="date" value={formData.expected_end_date || ''} onChange={handleDateChange} />
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="inauguration_date">Data de Inauguração</Label>
                            <Input id="inauguration_date" name="inauguration_date" type="date" value={formData.inauguration_date || ''} onChange={handleDateChange} />
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
            )}
            {activeTab === 'media' && <WorkMediaManager workId={formData.id} />}
            {activeTab === 'links' && (
              <div className="space-y-4">
                <Card>
                  <CardHeader><CardTitle>Links Relacionados</CardTitle></CardHeader>
                  <CardContent className="space-y-4">
                    {formData.related_links && formData.related_links.map((link, index) => (
                      <div key={index} className="flex items-end gap-2 p-3 border rounded-lg bg-background">
                        <div className="grid gap-2 flex-grow">
                          <Label>Título</Label>
                          <Input value={link.title} onChange={(e) => handleLinkChange(index, 'title', e.target.value)} />
                        </div>
                        <div className="grid gap-2 flex-grow">
                          <Label>URL</Label>
                          <Input value={link.url} onChange={(e) => handleLinkChange(index, 'url', e.target.value)} />
                        </div>
                        <Button type="button" variant="destructive" size="icon" onClick={() => removeLink(index)}><Trash2 className="w-4 h-4" /></Button>
                      </div>
                    ))}
                    <Button type="button" variant="outline" onClick={addLink}><PlusCircle className="w-4 h-4 mr-2" />Adicionar Link</Button>
                  </CardContent>
                </Card>
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="flex-shrink-0 pt-4 border-t mt-4">
          <DialogClose asChild><Button type="button" variant="outline">Cancelar</Button></DialogClose>
          <Button type="button" onClick={handleSubmit} className="gap-2"><Save className="w-4 h-4" /> Salvar Alterações</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const WorkMediaManager = ({ workId }) => {
  const [media, setMedia] = useState([]);
  const [uploading, setUploading] = useState(false);
  const { toast } = useToast();
  const fileInputRef = useRef(null);
  
  const fetchMedia = useCallback(async () => {
    if (!workId) return;
    const { data, error } = await supabase.from('public_work_media').select('*').eq('work_id', workId).order('created_at');
    if (error) toast({ title: "Erro ao buscar mídias", variant: "destructive" });
    else setMedia(data);
  }, [workId, toast]);

  useEffect(() => {
    fetchMedia();
  }, [fetchMedia]);

  const handleFileUpload = async (e) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setUploading(true);

    const uploadPromises = Array.from(files).map(async (file) => {
      const filePath = `works/${workId}/${Date.now()}-${file.name}`;
      const { error: uploadError } = await supabase.storage.from('work-media').upload(filePath, file);
      
      if (uploadError) {
        toast({ title: `Erro no upload de ${file.name}`, description: uploadError.message, variant: "destructive" });
        return;
      }
      
      const { data: { publicUrl } } = supabase.storage.from('work-media').getPublicUrl(filePath);
      
      let fileType = 'file';
      if (file.type.startsWith('image')) fileType = 'image';
      else if (file.type.startsWith('video')) fileType = 'video';
      else if (file.type === 'application/pdf') fileType = 'pdf';

      const { error: dbError } = await supabase.from('public_work_media').insert({
        work_id: workId,
        url: publicUrl,
        type: fileType,
        name: file.name
      });

      if (dbError) {
        toast({ title: `Erro ao salvar ${file.name}`, description: dbError.message, variant: "destructive" });
      }
    });

    await Promise.all(uploadPromises);
    setUploading(false);
    fetchMedia();
    toast({title: "Upload concluído!", description: "Os arquivos foram enviados."});
  };

  const deleteMedia = async (mediaId, mediaUrl) => {
    const { error: dbError } = await supabase.from('public_work_media').delete().eq('id', mediaId);
    if (dbError) {
      toast({ title: "Erro ao remover mídia do banco", variant: "destructive" });
      return;
    }
    
    try {
      const filePath = new URL(mediaUrl).pathname.split('/work-media/')[1];
      if (filePath) {
        await supabase.storage.from('work-media').remove([decodeURIComponent(filePath)]);
      }
    } catch (e) {
      console.warn("Could not parse or delete file from storage:", e.message);
    }

    toast({ title: "Mídia removida!" });
    fetchMedia();
  };
  
  const getFileIcon = (type) => {
    switch(type) {
      case 'image': return <ImageIcon className="w-10 h-10 text-gray-500" />;
      case 'video': return <Video className="w-10 h-10 text-gray-500" />;
      case 'pdf': return <Paperclip className="w-10 h-10 text-red-500" />;
      default: return <Paperclip className="w-10 h-10 text-gray-500" />;
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Mídias e Arquivos</CardTitle>
        <Button onClick={() => fileInputRef.current.click()} disabled={uploading}>
          <Upload className="w-4 h-4 mr-2" />{uploading ? 'Enviando...' : 'Adicionar'}
        </Button>
        <input type="file" multiple ref={fileInputRef} onChange={handleFileUpload} className="hidden" accept="image/*,video/*,application/pdf" />
      </CardHeader>
      <CardContent>
        {media.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">Nenhuma mídia adicionada a esta obra.</p>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {media.map(m => (
              <Card key={m.id} className="relative group overflow-hidden">
                <a href={m.url} target="_blank" rel="noopener noreferrer" className="block h-32 bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                  {m.type === 'image' ? <img src={m.url} alt={m.name} className="w-full h-full object-cover" /> : getFileIcon(m.type)}
                </a>
                <p className="text-xs p-2 truncate" title={m.name}>{m.name}</p>
                <Button variant="destructive" size="icon" className="absolute top-1 right-1 h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => deleteMedia(m.id, m.url)}><Trash2 className="w-4 h-4" /></Button>
              </Card>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

const ManageWorksPage = () => {
  const { toast } = useToast();
  const [works, setWorks] = useState([]);
  const [workOptions, setWorkOptions] = useState({ categories: [], areas: [], bairros: [], contractors: [] });
  const [editingWork, setEditingWork] = useState(null);
  const [deletingWork, setDeletingWork] = useState(null);

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
      result = await supabase.from('public_works').insert(payload).select().single();
    }

    if (result.error) {
      toast({ title: "Erro ao salvar obra", description: result.error.message, variant: "destructive" });
      console.error("Save error:", result.error);
    } else {
      toast({ title: `Obra ${id ? 'atualizada' : 'criada'} com sucesso!` });
      fetchData();
      
      if (!id && result.data) {
        // If it's a new work, we keep the modal open and switch to the new work's data
        const { data: newWorkWithRelations } = await supabase
          .from('public_works')
          .select('*, bairro:bairros(id, name), work_category:work_categories(id, name), work_area:work_areas(id, name), contractor:contractors(id, name)')
          .eq('id', result.data.id)
          .single();
        setEditingWork(newWorkWithRelations || null);
      } else {
        // If editing, we close the modal on save
        setEditingWork(null);
      }
    }
  };
  
  const handleAddNewWork = () => {
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

  return (
    <>
      <Helmet>
        <title>Gerenciar Obras Públicas - Admin</title>
        <meta name="description" content="Adicione, edite ou remova obras públicas." />
      </Helmet>
      <div className="container mx-auto px-4 py-12">
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="flex flex-wrap items-center justify-between gap-4 mb-12">
          <div className="flex items-center gap-4">
            <Link to="/admin"><Button variant="outline" size="icon"><ArrowLeft className="w-4 h-4" /></Button></Link>
            <div>
              <h1 className="text-3xl md:text-4xl font-bold text-tc-red">Gerenciar Obras Públicas</h1>
              <p className="mt-2 text-lg text-muted-foreground">Adicione, edite ou remova obras do mapa.</p>
            </div>
          </div>
           <div className="flex gap-2">
            <Link to="/admin/obras/opcoes"><Button variant="outline">Gerenciar Opções</Button></Link>
            <Button onClick={handleAddNewWork} className="gap-2"><PlusCircle className="w-4 h-4" /> Adicionar Obra</Button>
          </div>
        </motion.div>
        <Card>
          <CardHeader><CardTitle>Obras Cadastradas</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-3">
              {works.map(work => (
                <div key={work.id} className="flex flex-col sm:flex-row justify-between items-start sm:items-center p-4 bg-background rounded-lg border gap-4">
                  <div>
                    <p className="font-semibold">{work.title}</p>
                    <p className="text-sm text-muted-foreground">Status: {statusMap[work.status] || work.status}</p>
                  </div>
                  <div className="flex-shrink-0 flex gap-2">
                    <Button variant="ghost" size="icon" onClick={() => setEditingWork(work)}><Edit className="w-4 h-4" /></Button>
                    <Button variant="ghost" size="icon" className="text-red-500 hover:text-red-600" onClick={() => setDeletingWork(work)}><Trash2 className="w-4 h-4" /></Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <WorkEditModal
        work={editingWork}
        onSave={handleSaveWork}
        onClose={() => setEditingWork(null)}
        workOptions={workOptions}
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
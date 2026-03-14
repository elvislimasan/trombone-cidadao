import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Helmet } from 'react-helmet';
import { Link } from 'react-router-dom';
import { ArrowLeft, PlusCircle, Edit, Trash2, Save, X, Image as ImageIcon, Video, Check, XCircle, Loader2, ChevronsUpDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useToast } from '@/components/ui/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Combobox } from "@/components/ui/combobox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { supabase } from '@/lib/customSupabaseClient';
import RichTextEditor from '@/components/petition/RichTextEditor';

export const NewsEditModal = ({ newsItem, onSave, onClose }) => {
  const [formData, setFormData] = useState(null);
  const [galleryFiles, setGalleryFiles] = useState([]);
  const [existingGallery, setExistingGallery] = useState([]);
  const [removedGalleryIds, setRemovedGalleryIds] = useState([]);
  const [sendNotification, setSendNotification] = useState(false);
  const [reports, setReports] = useState([]);
  const [selectedReportIds, setSelectedReportIds] = useState([]);
  const [works, setWorks] = useState([]);
  const [selectedWorkIds, setSelectedWorkIds] = useState([]);
  const [petitions, setPetitions] = useState([]);
  const [selectedPetitionIds, setSelectedPetitionIds] = useState([]);
  const [allNews, setAllNews] = useState([]);
  const [selectedRelatedNewsIds, setSelectedRelatedNewsIds] = useState([]);
  const featuredImageInputRef = useRef(null);
  const galleryInputRef = useRef(null);
  const [relatedNewsOpen, setRelatedNewsOpen] = useState(false);
  const [worksOpen, setWorksOpen] = useState(false);
  const [petitionsOpen, setPetitionsOpen] = useState(false);
  const [reportsOpen, setReportsOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 640);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 640);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Fetch reports for selection
  useEffect(() => {
    const fetchReports = async () => {
        const { data } = await supabase
            .from('reports')
            .select('id, title, protocol')
            .order('created_at', { ascending: false });
        if (data) setReports(data);
    };
    fetchReports();
  }, []);

  // Fetch works for selection
  useEffect(() => {
    const fetchWorks = async () => {
      const { data } = await supabase
        .from('public_works')
        .select('id, title')
        .order('created_at', { ascending: false });
      if (data) setWorks(data);
    };
    fetchWorks();
  }, []);

  // Fetch petitions for selection
  useEffect(() => {
    const fetchPetitions = async () => {
      const { data } = await supabase
        .from('petitions')
        .select('id, title')
        .order('created_at', { ascending: false });
      if (data) setPetitions(data);
    };
    fetchPetitions();
  }, []);

  // Fetch all news for related selection
  useEffect(() => {
    const fetchAllNews = async () => {
      const { data } = await supabase
        .from('news')
        .select('id, title, date')
        .order('date', { ascending: false });
      if (data) setAllNews(data);
    };
    fetchAllNews();
  }, []);

  useEffect(() => {
    if (newsItem) {
      setFormData({
        ...newsItem
      });
      setGalleryFiles([]); // Resetar galeria ao abrir modal
      setRemovedGalleryIds([]);
      setSendNotification(!newsItem.id);
      setSelectedReportIds([]);
      setSelectedWorkIds([]);
      setSelectedPetitionIds([]);
      setSelectedRelatedNewsIds([]);
      
      // Buscar imagens existentes da galeria
      if (newsItem.id) {
        supabase
          .from('news_image')
          .select('*')
          .eq('news_id', newsItem.id)
          .order('created_at', { ascending: false })
          .then(({ data, error }) => {
            if (!error && data) {
              setExistingGallery(data);
            }
          });
        supabase
          .from('news_public_works')
          .select('work_id')
          .eq('news_id', newsItem.id)
          .then(({ data, error }) => {
            if (!error && data && data.length > 0) {
              const ids = data.map(r => r.work_id).filter(Boolean);
              setSelectedWorkIds(ids);
            } else {
              setSelectedWorkIds([]);
            }
          });
        supabase
          .from('news_petitions')
          .select('petition_id')
          .eq('news_id', newsItem.id)
          .then(({ data, error }) => {
            if (!error && data && data.length > 0) {
              const ids = data.map(r => r.petition_id).filter(Boolean);
              setSelectedPetitionIds(ids);
            } else {
              setSelectedPetitionIds([]);
            }
          });
        supabase
          .from('news_reports')
          .select('report_id')
          .eq('news_id', newsItem.id)
          .then(({ data, error }) => {
            if (!error && data && data.length > 0) {
              const ids = data.map(r => r.report_id).filter(Boolean);
              setSelectedReportIds(ids);
            } else {
              setSelectedReportIds([]);
            }
          });
        supabase
          .from('news_related')
          .select('related_news_id')
          .eq('news_id', newsItem.id)
          .then(({ data, error }) => {
            if (error) {
              console.error('Erro ao buscar notícias relacionadas vinculadas:', error);
            }
            if (!error && data && data.length > 0) {
              const ids = data.map(r => r.related_news_id).filter(Boolean);
              setSelectedRelatedNewsIds(ids);
            } else {
              setSelectedRelatedNewsIds([]);
            }
          });
      } else {
        setExistingGallery([]);
        setSelectedWorkIds([]);
        setSelectedPetitionIds([]);
        setSelectedReportIds([]);
        setSelectedRelatedNewsIds([]);
      }
    } else {
      setFormData(null);
      setGalleryFiles([]);
      setExistingGallery([]);
      setRemovedGalleryIds([]);
    }
  }, [newsItem]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleFileChange = (e, field) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setFormData(prev => ({ ...prev, [field]: reader.result }));
      };
      reader.readAsDataURL(file);
    }
  };

  const handleGalleryChange = (e) => {
    const files = Array.from(e.target.files);
    setGalleryFiles(prev => [...prev, ...files.map(file => ({
      file,
      preview: URL.createObjectURL(file),
      name: file.name
    }))]);
  };

  const removeGalleryImage = (index) => {
    setGalleryFiles(prev => {
      const removed = prev[index];
      if (removed?.preview) {
        URL.revokeObjectURL(removed.preview);
      }
      return prev.filter((_, i) => i !== index);
    });
  };

  const removeExistingImage = (imageId) => {
    setExistingGallery(prev => prev.filter(img => img.id !== imageId));
    setRemovedGalleryIds(prev => [...prev, imageId]);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave(formData, galleryFiles, removedGalleryIds, sendNotification, selectedReportIds, selectedWorkIds, selectedPetitionIds, selectedRelatedNewsIds);
  };

  if (!formData) return null;

  return (
    <Dialog open={!!newsItem} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="w-[95vw] max-w-[95vw] sm:max-w-[800px] p-0 overflow-hidden bg-card border-border">
        <DialogHeader className="p-4 sm:p-6 pb-0">
          <DialogTitle className="text-xl sm:text-2xl font-bold text-foreground truncate">{formData.id ? 'Editar Notícia' : 'Adicionar Nova Notícia'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col h-full max-h-[85vh] overflow-hidden">
          <div className="flex-1 overflow-y-auto overflow-x-hidden p-4 sm:p-6 space-y-6 scrollbar-thin scrollbar-thumb-gray-300">
            <div className="flex flex-col sm:grid sm:grid-cols-4 sm:items-start gap-2 sm:gap-4">
              <Label htmlFor="title" className="sm:text-right sm:pt-2 font-semibold">Título</Label>
              <Textarea id="title" name="title" value={formData.title} onChange={handleChange} className="sm:col-span-3 w-full min-h-[80px]" />
            </div>
            <div className="flex flex-col sm:grid sm:grid-cols-4 sm:items-start gap-2 sm:gap-4">
              <Label htmlFor="subtitle" className="sm:text-right sm:pt-2 font-semibold">Subtítulo</Label>
              <Textarea id="subtitle" name="subtitle" value={formData.subtitle || ''} onChange={handleChange} className="sm:col-span-3 w-full min-h-[60px]" />
            </div>
            <div className="flex flex-col sm:grid sm:grid-cols-4 sm:items-start gap-2 sm:gap-4">
              <Label htmlFor="source" className="sm:text-right sm:pt-2 font-semibold">Fonte</Label>
              <Textarea id="source" name="source" value={formData.source} onChange={handleChange} className="sm:col-span-3 w-full min-h-[40px]" />
            </div>
            <div className="flex flex-col sm:grid sm:grid-cols-4 sm:items-center gap-2 sm:gap-4">
              <Label htmlFor="date" className="sm:text-right font-semibold">Data</Label>
              <Input id="date" name="date" type="date" value={formData.date} onChange={handleChange} className="sm:col-span-3 w-full" />
            </div>
            <div className="flex flex-col sm:grid sm:grid-cols-4 sm:items-start gap-2 sm:gap-4">
              <Label htmlFor="description" className="sm:text-right sm:pt-2 font-semibold">Resumo</Label>
              <Textarea id="description" name="description" value={formData.description} onChange={handleChange} className="sm:col-span-3 h-24 w-full" />
            </div>
            <div className="flex flex-col sm:grid sm:grid-cols-4 sm:items-start gap-2 sm:gap-4">
              <Label htmlFor="body" className="sm:text-right sm:pt-2 font-semibold">Corpo da Notícia</Label>
              <div className="sm:col-span-3 w-full overflow-hidden">
                <RichTextEditor
                  value={formData.body || ''}
                  onChange={(html) => setFormData(prev => ({ ...prev, body: html }))}
                  placeholder="Escreva o conteúdo da notícia, use o botão de link para inserir URLs."
                  isMobile={isMobile}
                />
              </div>
            </div>
            <div className="flex flex-col sm:grid sm:grid-cols-4 sm:items-start gap-2 sm:gap-4">
              <Label htmlFor="video_url" className="sm:text-right sm:pt-2 font-semibold">URL do Vídeo</Label>
              <Textarea id="video_url" name="video_url" value={formData.video_url} onChange={handleChange} className="sm:col-span-3 w-full min-h-[40px]" placeholder="Link do YouTube ou Instagram" />
            </div>

            <div className="flex flex-col sm:grid sm:grid-cols-4 sm:items-center gap-2 sm:gap-4 border-t pt-6 mt-6">
              <Label htmlFor="relatedReport" className="sm:text-right">Vincular Broncas</Label>
              <div className="sm:col-span-3">
                <Popover open={reportsOpen} onOpenChange={setReportsOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      aria-expanded={reportsOpen}
                      className="w-full justify-between h-auto py-2 px-3 text-left"
                      type="button"
                    >
                      <span className="truncate">
                        {selectedReportIds.length > 0
                          ? `${selectedReportIds.length} selecionada(s)`
                          : "Selecionar broncas..."}
                      </span>
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                    <Command>
                      <CommandInput placeholder="Buscar bronca..." />
                      <CommandList className="max-h-[300px] overflow-y-auto">
                        <CommandEmpty>Nenhuma bronca encontrada.</CommandEmpty>
                        <CommandGroup heading="Broncas">
                          {reports.map((r) => {
                            const checked = selectedReportIds.includes(r.id);
                            return (
                              <CommandItem
                                key={r.id}
                                value={`${r.title} ${r.id}`}
                                onSelect={() => {
                                  setSelectedReportIds(prev => {
                                    if (prev.includes(r.id)) {
                                      return prev.filter(id => id !== r.id);
                                    }
                                    return [...prev, r.id];
                                  });
                                }}
                                className="flex items-center justify-between py-3 px-4 border-b last:border-b-0"
                              >
                                <div className="flex items-center gap-3 min-w-0 flex-1">
                                  <div className={`flex-shrink-0 h-4 w-4 rounded border border-primary flex items-center justify-center ${checked ? 'bg-primary text-primary-foreground' : 'bg-transparent'}`}>
                                    {checked && <Check className="h-3 w-3" />}
                                  </div>
                                  <span className="truncate font-medium">{r.title}</span>
                                </div>
                              </CommandItem>
                            );
                          })}
                        </CommandGroup>
                        {selectedReportIds.length > 0 && (
                          <CommandGroup heading="Ações">
                            <CommandItem onSelect={() => setSelectedReportIds([])} className="justify-center text-tc-red font-semibold py-3">
                              Limpar seleção
                            </CommandItem>
                          </CommandGroup>
                        )}
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
                {selectedReportIds.length > 0 && reports.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {selectedReportIds.map(id => {
                      const item = reports.find(r => r.id === id);
                      if (!item) return null;
                      return (
                        <span key={id} className="inline-flex items-center gap-2 px-2.5 py-1.5 rounded-full bg-primary/10 text-primary text-[11px] font-medium border border-primary/20 max-w-full">
                          <span className="truncate">{item.title}</span>
                          <button
                            type="button"
                            className="ml-1 p-0.5 hover:bg-primary/20 rounded-full transition-colors"
                            onClick={() => setSelectedReportIds(prev => prev.filter(x => x !== id))}
                            aria-label={`Remover ${item.title}`}
                          >
                            <XCircle className="w-3.5 h-3.5" />
                          </button>
                        </span>
                      );
                    })}
                  </div>
                )}
                <p className="text-xs text-muted-foreground mt-2 leading-relaxed">
                  Selecione uma ou mais broncas. Se selecionadas, enviará notificação também para os envolvidos.
                </p>
              </div>
            </div>
            
            <div className="flex flex-col sm:grid sm:grid-cols-4 sm:items-center gap-2 sm:gap-4">
              <Label htmlFor="relatedWork" className="sm:text-right">Vincular Obras</Label>
              <div className="sm:col-span-3">
                <Popover open={worksOpen} onOpenChange={setWorksOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      aria-expanded={worksOpen}
                      className="w-full justify-between h-auto py-2 px-3 text-left"
                      type="button"
                    >
                      <span className="truncate">
                        {selectedWorkIds.length > 0
                          ? `${selectedWorkIds.length} selecionada(s)`
                          : "Selecionar obras..."}
                      </span>
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                    <Command>
                      <CommandInput placeholder="Buscar obra..." />
                      <CommandList className="max-h-[300px] overflow-y-auto">
                        <CommandEmpty>Nenhuma obra encontrada.</CommandEmpty>
                        <CommandGroup heading="Obras">
                          {works.map((w) => {
                            const checked = selectedWorkIds.includes(w.id);
                            return (
                              <CommandItem
                                key={w.id}
                                value={`${w.title} ${w.id}`}
                                onSelect={() => {
                                  setSelectedWorkIds(prev => {
                                    if (prev.includes(w.id)) {
                                      return prev.filter(id => id !== w.id);
                                    }
                                    return [...prev, w.id];
                                  });
                                }}
                                className="flex items-center justify-between py-3 px-4 border-b last:border-b-0"
                              >
                                <div className="flex items-center gap-3 min-w-0 flex-1">
                                  <div className={`flex-shrink-0 h-4 w-4 rounded border border-primary flex items-center justify-center ${checked ? 'bg-primary text-primary-foreground' : 'bg-transparent'}`}>
                                    {checked && <Check className="h-3 w-3" />}
                                  </div>
                                  <span className="truncate font-medium">{w.title}</span>
                                </div>
                              </CommandItem>
                            );
                          })}
                        </CommandGroup>
                        {selectedWorkIds.length > 0 && (
                          <CommandGroup heading="Ações">
                            <CommandItem onSelect={() => setSelectedWorkIds([])} className="justify-center text-tc-red font-semibold py-3">
                              Limpar seleção
                            </CommandItem>
                          </CommandGroup>
                        )}
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
                {selectedWorkIds.length > 0 && works.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {selectedWorkIds.map(id => {
                      const item = works.find(w => w.id === id);
                      if (!item) return null;
                      return (
                        <span key={id} className="inline-flex items-center gap-2 px-2.5 py-1.5 rounded-full bg-primary/10 text-primary text-[11px] font-medium border border-primary/20 max-w-full">
                          <span className="truncate">{item.title}</span>
                          <button
                            type="button"
                            className="ml-1 p-0.5 hover:bg-primary/20 rounded-full transition-colors"
                            onClick={() => setSelectedWorkIds(prev => prev.filter(x => x !== id))}
                            aria-label={`Remover ${item.title}`}
                          >
                            <XCircle className="w-3.5 h-3.5" />
                          </button>
                        </span>
                      );
                    })}
                  </div>
                )}
                <p className="text-xs text-muted-foreground mt-2 leading-relaxed">
                  Selecione uma ou mais obras. Se vinculadas, esta notícia aparecerá como relacionada nas páginas das obras.
                </p>
              </div>
            </div>

            <div className="flex flex-col sm:grid sm:grid-cols-4 sm:items-center gap-2 sm:gap-4">
              <Label htmlFor="relatedPetition" className="sm:text-right">Vincular Petições</Label>
              <div className="sm:col-span-3">
                <Popover open={petitionsOpen} onOpenChange={setPetitionsOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      aria-expanded={petitionsOpen}
                      className="w-full justify-between h-auto py-2 px-3 text-left"
                      type="button"
                    >
                      <span className="truncate">
                        {selectedPetitionIds.length > 0
                          ? `${selectedPetitionIds.length} selecionada(s)`
                          : "Selecionar petições..."}
                      </span>
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                    <Command>
                      <CommandInput placeholder="Buscar petição..." />
                      <CommandList className="max-h-[300px] overflow-y-auto">
                        <CommandEmpty>Nenhuma petição encontrada.</CommandEmpty>
                        <CommandGroup heading="Petições">
                          {petitions.map((p) => {
                            const checked = selectedPetitionIds.includes(p.id);
                            return (
                              <CommandItem
                                key={p.id}
                                value={`${p.title} ${p.id}`}
                                onSelect={() => {
                                  setSelectedPetitionIds(prev => {
                                    if (prev.includes(p.id)) {
                                      return prev.filter(id => id !== p.id);
                                    }
                                    return [...prev, p.id];
                                  });
                                }}
                                className="flex items-center justify-between py-3 px-4 border-b last:border-b-0"
                              >
                                <div className="flex items-center gap-3 min-w-0 flex-1">
                                  <div className={`flex-shrink-0 h-4 w-4 rounded border border-primary flex items-center justify-center ${checked ? 'bg-primary text-primary-foreground' : 'bg-transparent'}`}>
                                    {checked && <Check className="h-3 w-3" />}
                                  </div>
                                  <span className="truncate font-medium">{p.title}</span>
                                </div>
                              </CommandItem>
                            );
                          })}
                        </CommandGroup>
                        {selectedPetitionIds.length > 0 && (
                          <CommandGroup heading="Ações">
                            <CommandItem onSelect={() => setSelectedPetitionIds([])} className="justify-center text-tc-red font-semibold py-3">
                              Limpar seleção
                            </CommandItem>
                          </CommandGroup>
                        )}
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
                {selectedPetitionIds.length > 0 && petitions.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {selectedPetitionIds.map(id => {
                      const item = petitions.find(p => p.id === id);
                      if (!item) return null;
                      return (
                        <span key={id} className="inline-flex items-center gap-2 px-2.5 py-1.5 rounded-full bg-primary/10 text-primary text-[11px] font-medium border border-primary/20 max-w-full">
                          <span className="truncate">{item.title}</span>
                          <button
                            type="button"
                            className="ml-1 p-0.5 hover:bg-primary/20 rounded-full transition-colors"
                            onClick={() => setSelectedPetitionIds(prev => prev.filter(x => x !== id))}
                            aria-label={`Remover ${item.title}`}
                          >
                            <XCircle className="w-3.5 h-3.5" />
                          </button>
                        </span>
                      );
                    })}
                  </div>
                )}
                <p className="text-xs text-muted-foreground mt-2 leading-relaxed">
                  Selecione uma ou mais petições. Se vinculadas, esta notícia aparecerá como relacionada nas páginas das petições.
                </p>
              </div>
            </div>

            <div className="flex flex-col sm:grid sm:grid-cols-4 sm:items-start gap-2 sm:gap-4">
              <Label htmlFor="relatedNews" className="sm:text-right sm:pt-2">Vincular Notícias</Label>
              <div className="sm:col-span-3">
                <Popover open={relatedNewsOpen} onOpenChange={setRelatedNewsOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      aria-expanded={relatedNewsOpen}
                      className="w-full justify-between h-auto py-2 px-3 text-left"
                      type="button"
                    >
                      <span className="truncate">
                        {selectedRelatedNewsIds.length > 0
                          ? `${selectedRelatedNewsIds.length} selecionada(s)`
                          : "Selecionar notícias..."}
                      </span>
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                    <Command>
                      <CommandInput placeholder="Buscar notícia..." />
                      <CommandList className="max-h-[300px] overflow-y-auto">
                        <CommandEmpty>Nenhuma notícia encontrada.</CommandEmpty>
                        <CommandGroup heading="Notícias">
                          {allNews
                            .filter(n => n.id !== newsItem?.id)
                            .map((n) => {
                              const checked = selectedRelatedNewsIds.includes(n.id);
                              return (
                                <CommandItem
                                  key={n.id}
                                  value={`${n.title} ${n.id}`}
                                  onSelect={() => {
                                    setSelectedRelatedNewsIds(prev => {
                                      if (prev.includes(n.id)) {
                                        return prev.filter(id => id !== n.id);
                                      }
                                      return [...prev, n.id];
                                    });
                                  }}
                                  className="flex items-center justify-between py-3 px-4 border-b last:border-b-0"
                                >
                                  <div className="flex items-center gap-3 min-w-0 flex-1">
                                    <div className={`flex-shrink-0 h-4 w-4 rounded border border-primary flex items-center justify-center ${checked ? 'bg-primary text-primary-foreground' : 'bg-transparent'}`}>
                                      {checked && <Check className="h-3 w-3" />}
                                    </div>
                                    <div className="flex flex-col min-w-0">
                                      <span className="truncate font-medium">{n.title}</span>
                                      {n.date && (
                                        <span className="text-[10px] text-muted-foreground">
                                          {new Date(n.date).toLocaleDateString('pt-BR', { timeZone: 'UTC' })}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                </CommandItem>
                              );
                            })}
                        </CommandGroup>
                        {selectedRelatedNewsIds.length > 0 && (
                          <CommandGroup heading="Ações">
                            <CommandItem onSelect={() => setSelectedRelatedNewsIds([])} className="justify-center text-tc-red font-semibold py-3">
                              Limpar seleção
                            </CommandItem>
                          </CommandGroup>
                        )}
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
                {selectedRelatedNewsIds.length > 0 && allNews.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {selectedRelatedNewsIds.map(id => {
                      const item = allNews.find(n => n.id === id);
                      if (!item) return null;
                      return (
                        <span key={id} className="inline-flex items-center gap-2 px-2.5 py-1.5 rounded-full bg-primary/10 text-primary text-[11px] font-medium border border-primary/20 max-w-full">
                          <span className="truncate">{item.title}</span>
                          <button
                            type="button"
                            className="ml-1 p-0.5 hover:bg-primary/20 rounded-full transition-colors"
                            onClick={() => setSelectedRelatedNewsIds(prev => prev.filter(x => x !== id))}
                            aria-label={`Remover ${item.title}`}
                          >
                            <XCircle className="w-3.5 h-3.5" />
                          </button>
                        </span>
                      );
                    })}
                  </div>
                )}
                <p className="text-xs text-muted-foreground mt-2 leading-relaxed">
                  Selecione uma ou mais notícias para exibir como relacionadas.
                </p>
              </div>
            </div>
            
            <div className="flex flex-col sm:grid sm:grid-cols-4 sm:items-center gap-2 sm:gap-4">
              <div className="sm:col-start-2 sm:col-span-3 flex items-center space-x-2">
                <Checkbox 
                  id="sendNotification" 
                  checked={sendNotification} 
                  onCheckedChange={setSendNotification} 
                />
                <Label htmlFor="sendNotification" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                  Enviar notificação por email para usuários inscritos
                </Label>
              </div>
            </div>

            <div className="flex flex-col sm:grid sm:grid-cols-4 sm:items-start gap-2 sm:gap-4 border-t pt-6 mt-6">
              <Label className="sm:text-right sm:pt-2 font-semibold text-sm">Imagem Destaque</Label>
              <div className="sm:col-span-3">
                <input type="file" accept="image/*" ref={featuredImageInputRef} onChange={(e) => handleFileChange(e, 'image_url')} className="hidden" />
                <Button type="button" variant="outline" onClick={() => featuredImageInputRef.current.click()} className="w-full sm:w-auto"><ImageIcon className="w-4 h-4 mr-2" /> Selecionar Imagem</Button>
                {formData.image_url && (
                  <div className="mt-3 relative inline-block group">
                    <img src={formData.image_url} alt="Preview" className="rounded-lg max-h-48 border border-border shadow-sm group-hover:opacity-90 transition-opacity" />
                    <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button type="button" variant="secondary" size="sm" onClick={() => featuredImageInputRef.current.click()}>Trocar Imagem</Button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="flex flex-col sm:grid sm:grid-cols-4 sm:items-start gap-2 sm:gap-4 border-t pt-6 mt-6">
              <Label className="sm:text-right sm:pt-2 font-semibold text-sm">Galeria de Imagens</Label>
              <div className="sm:col-span-3">
                <input 
                  type="file" 
                  accept="image/*" 
                  multiple 
                  ref={galleryInputRef} 
                  onChange={handleGalleryChange} 
                  className="hidden" 
                />
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={() => galleryInputRef.current.click()}
                  className="w-full sm:w-auto"
                >
                  <ImageIcon className="w-4 h-4 mr-2" /> Adicionar Imagens à Galeria
                </Button>
                
                {/* Imagens existentes */}
                {existingGallery.length > 0 && (
                  <div className="mt-6">
                    <p className="text-sm font-bold text-muted-foreground mb-3 flex items-center gap-2">
                      <Check className="w-4 h-4 text-green-500" />
                      Imagens já cadastradas:
                    </p>
                    <div className="grid grid-cols-2 xs:grid-cols-3 sm:grid-cols-4 gap-3">
                      {existingGallery.map((item) => (
                        <div key={item.id} className="relative aspect-square group">
                          <img 
                            src={item.url} 
                            alt={item.name || 'Imagem da galeria'} 
                            className="h-full w-full object-cover rounded-lg border border-border shadow-sm group-hover:opacity-90 transition-opacity" 
                          />
                          <Button 
                            type="button" 
                            variant="destructive" 
                            size="icon" 
                            className="absolute -top-2 -right-2 h-7 w-7 rounded-full shadow-lg opacity-0 group-hover:opacity-100 transition-opacity" 
                            onClick={() => removeExistingImage(item.id)}
                          >
                            <X className="w-4 h-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Novas imagens (preview) */}
                {galleryFiles.length > 0 && (
                  <div className="mt-6 border-t border-dashed pt-4">
                    <p className="text-sm font-bold text-primary mb-3 flex items-center gap-2">
                      <PlusCircle className="w-4 h-4" />
                      Novas imagens a adicionar:
                    </p>
                    <div className="grid grid-cols-2 xs:grid-cols-3 sm:grid-cols-4 gap-3">
                      {galleryFiles.map((item, index) => (
                        <div key={index} className="relative aspect-square group">
                          <img 
                            src={item.preview} 
                            alt={`Preview ${index}`} 
                            className="h-full w-full object-cover rounded-lg border border-primary/30 shadow-sm group-hover:opacity-90 transition-opacity" 
                          />
                          <Button 
                            type="button" 
                            variant="destructive" 
                            size="icon" 
                            className="absolute -top-2 -right-2 h-7 w-7 rounded-full shadow-lg" 
                            onClick={() => removeGalleryImage(index)}
                          >
                            <X className="w-4 h-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
          <DialogFooter className="p-6 pt-2 flex flex-col sm:flex-row gap-2 sm:gap-0">
            <DialogClose asChild><Button type="button" variant="outline" className="w-full sm:w-auto">Cancelar</Button></DialogClose>
            <Button type="submit" className="w-full sm:w-auto gap-2"><Save className="w-4 h-4" /> Salvar</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

const ManageNewsPage = () => {
  const { toast } = useToast();
  const [news, setNews] = useState([]);
  const [editingNews, setEditingNews] = useState(null);
  const [deletingNews, setDeletingNews] = useState(null);
  const [pendingComments, setPendingComments] = useState([]);
  const [isImporting, setIsImporting] = useState(false);

  const fetchNewsAndComments = useCallback(async () => {
    const { data: newsData, error: newsError } = await supabase.from('news').select('*').order('date', { ascending: false });
    if (newsError) toast({ title: "Erro ao buscar notícias", description: newsError.message, variant: "destructive" });
    else setNews(newsData);

    const { data: commentsData, error: commentsError } = await supabase.from('comments').select('*, news:news(title), author:profiles(name)').eq('moderation_status', 'pending_approval').not('news_id', 'is', null);
    if (commentsError) toast({ title: "Erro ao buscar comentários", description: commentsError.message, variant: "destructive" });
    else setPendingComments(commentsData);
  }, [toast]);

  useEffect(() => {
    fetchNewsAndComments();
  }, [fetchNewsAndComments]);

  const handleRunImporter = async () => {
    if (isImporting) return;
    setIsImporting(true);
    toast({ title: "Importando notícias...", description: "Buscando novas publicações do Blog do Elvis." });
    try {
      const { data, error } = await supabase.functions.invoke('import-news', { body: { limit: 100, pages: 0 } });
      if (error) {
        toast({ title: "Erro ao importar", description: error.message, variant: "destructive" });
      } else {
        const imported = data?.imported_count || 0;
        toast({ title: "Importação concluída", description: `${imported} notícia(s) nova(s) importada(s).` });
        fetchNewsAndComments();
      }
    } catch (e) {
      toast({ title: "Falha na função de importação", description: e.message, variant: "destructive" });
    } finally {
      setIsImporting(false);
    }
  };

  const handleSaveNews = async (newsToSave, galleryFiles = [], removedGalleryIds = [], sendNotification = false, relatedReportIds = [], relatedWorkIds = [], relatedPetitionIds = [], relatedNewsIds = []) => {
    const { id, comments, ...dataToSave } = newsToSave;
    
    // Remove campos que não existem na tabela news
    // Apenas campos válidos da tabela news serão salvos
    const validFields = ['title', 'source', 'date', 'description', 'subtitle', 'body', 'image_url', 'link', 'video_url'];
    const filteredData = Object.keys(dataToSave)
      .filter(key => validFields.includes(key))
      .reduce((obj, key) => {
        obj[key] = dataToSave[key];
        return obj;
      }, {});
    
    let error;
    let savedNewsId;

    if (id) {
      ({ error } = await supabase.from('news').update(filteredData).eq('id', id));
      savedNewsId = id;
    } else {
      const { data, error: insertError } = await supabase.from('news').insert(filteredData).select().single();
      error = insertError;
      savedNewsId = data?.id;
    }

    if (error) {
      toast({ title: "Erro ao salvar notícia", description: error.message, variant: "destructive" });
      return;
    }

    // Atualizar vínculo notícia-obra (múltiplas)
    if (savedNewsId) {
      await supabase.from('news_public_works').delete().eq('news_id', savedNewsId);
      if (Array.isArray(relatedWorkIds) && relatedWorkIds.length > 0) {
        const workRows = relatedWorkIds
          .filter(workId => !!workId)
          .map(workId => ({ news_id: savedNewsId, work_id: workId }));
        if (workRows.length > 0) {
          const { error: linkErr } = await supabase.from('news_public_works').insert(workRows);
          if (linkErr) {
            toast({ title: "Erro ao vincular obras", description: linkErr.message, variant: "destructive" });
          }
        }
      }
    }

    // Atualizar vínculo notícia-petição (múltiplas)
    if (savedNewsId) {
      await supabase.from('news_petitions').delete().eq('news_id', savedNewsId);
      if (Array.isArray(relatedPetitionIds) && relatedPetitionIds.length > 0) {
        const petitionRows = relatedPetitionIds
          .filter(petitionId => !!petitionId)
          .map(petitionId => ({ news_id: savedNewsId, petition_id: petitionId }));
        if (petitionRows.length > 0) {
          const { error: linkErr } = await supabase.from('news_petitions').insert(petitionRows);
          if (linkErr) {
            toast({ title: "Erro ao vincular petições", description: linkErr.message, variant: "destructive" });
          }
        }
      }
    }

    // Atualizar vínculo notícia-bronca (múltiplas)
    if (savedNewsId) {
      await supabase.from('news_reports').delete().eq('news_id', savedNewsId);
      if (Array.isArray(relatedReportIds) && relatedReportIds.length > 0) {
        const reportRows = relatedReportIds
          .filter(reportId => !!reportId)
          .map(reportId => ({ news_id: savedNewsId, report_id: reportId }));
        if (reportRows.length > 0) {
          const { error: linkErr } = await supabase.from('news_reports').insert(reportRows);
          if (linkErr) {
            toast({ title: "Erro ao vincular broncas", description: linkErr.message, variant: "destructive" });
          }
        }
      }
    }

    // Atualizar vínculo notícia-notícia
    if (savedNewsId) {
      await supabase.from('news_related').delete().eq('news_id', savedNewsId);
      if (Array.isArray(relatedNewsIds) && relatedNewsIds.length > 0) {
        const rows = relatedNewsIds
          .filter(newsId => !!newsId)
          .map(newsId => ({ news_id: savedNewsId, related_news_id: newsId }));
        if (rows.length > 0) {
          const { error: linkErr } = await supabase.from('news_related').insert(rows);
          if (linkErr) {
            toast({ title: "Erro ao vincular notícias relacionadas", description: linkErr.message, variant: "destructive" });
          }
        }
      }
    }

    // Remover imagens marcadas para exclusão
    if (removedGalleryIds.length > 0) {
      for (const imageId of removedGalleryIds) {
        // Buscar URL da imagem para remover do storage
        const { data: imageData } = await supabase
          .from('news_image')
          .select('url')
          .eq('id', imageId)
          .single();

        if (imageData) {
          try {
            const url = new URL(imageData.url);
            const filePath = url.pathname.split('/news-images/')[1];
            if (filePath) {
              await supabase.storage.from('news-images').remove([decodeURIComponent(filePath)]);
            }
          } catch (e) {
            // Erro ao remover arquivo do storage
          }
        }

        // Remover do banco
        await supabase.from('news_image').delete().eq('id', imageId);
      }
    }

    // Upload da galeria após salvar a notícia
    if (savedNewsId && galleryFiles.length > 0) {
      try {
        const uploadPromises = galleryFiles.map(async ({ file }) => {
          let uploadFile = file;
          if (file.type && file.type.startsWith('image')) {
            try {
              const dataUrl = await new Promise((resolve) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result);
                reader.readAsDataURL(file);
              });
              const img = await new Promise((resolve, reject) => {
                const image = new Image();
                image.onload = () => resolve(image);
                image.onerror = reject;
                image.src = dataUrl;
              });
              const canvas = document.createElement('canvas');
              canvas.width = img.width;
              canvas.height = img.height;
              const ctx = canvas.getContext('2d');
              ctx.drawImage(img, 0, 0);
              const blob = await canvas.convertToBlob({ type: 'image/webp', quality: 0.9 });
              uploadFile = new File([blob], file.name.replace(/\.(jpe?g|png)$/i, '.webp'), { type: 'image/webp' });
            } catch (_) {}
          }
          const filePath = `news/${savedNewsId}/${Date.now()}-${uploadFile.name}`;
          
          // Upload para storage
          const { error: uploadError } = await supabase.storage
            .from('news-images')
            .upload(filePath, uploadFile);

          if (uploadError) {
            throw new Error(`Erro no upload de ${file.name}: ${uploadError.message}`);
          }

          // Obter URL pública
          const { data: { publicUrl } } = supabase.storage
            .from('news-images')
            .getPublicUrl(filePath);

          // Salvar no banco
          const { error: dbError } = await supabase
            .from('news_image')
            .insert({
              news_id: savedNewsId,
              url: publicUrl,
              type: 'image',
              name: uploadFile.name
            });

          if (dbError) {
            throw new Error(`Erro ao salvar ${file.name}: ${dbError.message}`);
          }
        });

        await Promise.all(uploadPromises);
      } catch (uploadError) {
        toast({ 
          title: "Notícia salva, mas houve erro no upload da galeria", 
          description: uploadError.message, 
          variant: "destructive" 
        });
      }
    }

    if (savedNewsId && sendNotification) {
      toast({ title: "Enviando notificações...", description: "Isso pode levar alguns instantes." });
      supabase.functions.invoke('send-news-email', {
          body: { newsId: savedNewsId }
      }).then(({ data, error }) => {
          if (error) {
              console.error('Erro ao enviar emails:', error);
              toast({ title: "Erro no envio de emails", description: error.message, variant: "destructive" });
          } else {
              // Check for internal errors in batches or no recipients
              const failures = data.batches?.filter(b => !b.success);
              
              if (failures?.length > 0) {
                  console.error('Falhas no envio:', failures);
                  // Show the first error message to help debugging
                  const errorMsg = failures[0].error?.message || failures[0].error?.name || "Erro desconhecido";
                  toast({ 
                      title: "Erro no envio (Sender)", 
                      description: `Falha: ${errorMsg}. Verifique a chave de API e remetente.`, 
                      variant: "destructive" 
                  });
              } else if (data.message === 'No recipients found') {
                   toast({ 
                      title: "Nenhum destinatário", 
                      description: "Nenhum usuário habilitou notificações para receber este email.", 
                      variant: "warning" 
                  });
              } else {
                  toast({ title: "Emails enviados!", description: data?.message || "Processo concluído." });
              }
          }
      }).catch(err => {
           console.error('Erro ao invocar função:', err);
           toast({ title: "Erro ao iniciar envio", description: "Verifique o console para mais detalhes.", variant: "destructive" });
      });
    }

      toast({ title: `Notícia ${id ? 'atualizada' : 'adicionada'} com sucesso!` });
      fetchNewsAndComments();
    setEditingNews(null);
  };

  const handleAddNew = () => {
    setEditingNews({ id: null, title: '', source: '', date: new Date().toISOString().split('T')[0], image_url: '', link: '#', description: '', body: '', video_url: '' });
  };

  const handleDeleteNews = async (newsId) => {
    // Buscar URLs das imagens da galeria
    const { data: media } = await supabase
      .from('news_image')
      .select('url')
      .eq('news_id', newsId);

    // Remover do storage
    if (media && media.length > 0) {
      const paths = media.map(m => {
        try {
          const url = new URL(m.url);
          return url.pathname.split('/news-images/')[1];
        } catch {
          return null;
        }
      }).filter(Boolean);

      if (paths.length > 0) {
        await supabase.storage.from('news-images').remove(paths);
      }
    }

    // Deletar notícia (cascade deleta registros em news_image)
    const { error } = await supabase.from('news').delete().eq('id', newsId);
    if (error) {
      toast({ title: "Erro ao remover notícia", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Notícia removida com sucesso!", variant: "destructive" });
      fetchNewsAndComments();
    }
    setDeletingNews(null);
  };

  const handleCommentModeration = async (commentId, newStatus) => {
    const { error } = await supabase.from('comments').update({ moderation_status: newStatus }).eq('id', commentId);
    if (error) {
      toast({ title: "Erro ao moderar comentário", description: error.message, variant: "destructive" });
    } else {
      toast({ title: `Comentário ${newStatus === 'approved' ? 'aprovado' : 'rejeitado'}!` });
      fetchNewsAndComments();
    }
  };

  return (
    <>
      <Helmet>
        <title>Gerenciar Notícias - Admin</title>
        <meta name="description" content="Gerencie as notícias e comunicados da plataforma." />
      </Helmet>
      <div className="container mx-auto px-4 py-12">
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="flex flex-wrap items-center justify-between gap-4 mb-12">
          <div className="flex items-center gap-4">
            <Link to="/admin"><Button variant="outline" size="icon"><ArrowLeft className="w-4 h-4" /></Button></Link>
            <div>
              <h1 className="text-3xl md:text-4xl font-bold text-tc-red">Gerenciar Notícias</h1>
              <p className="mt-2 text-lg text-muted-foreground">Adicione, edite, remova notícias e modere comentários.</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button onClick={handleRunImporter} variant="outline" className="gap-2" disabled={isImporting}>
              {isImporting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" /> Importando...
                </>
              ) : (
                <>
                  <Video className="w-4 h-4" /> Importar do Blog do Elvis
                </>
              )}
            </Button>
            <Button onClick={handleAddNew} className="gap-2"><PlusCircle className="w-4 h-4" /> Adicionar Notícia</Button>
          </div>
        </motion.div>

        <Tabs defaultValue="news">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="news">Notícias Publicadas</TabsTrigger>
            <TabsTrigger value="comments">
              Moderar Comentários {pendingComments.length > 0 && <span className="ml-2 bg-primary text-primary-foreground rounded-full px-2 py-0.5 text-xs">{pendingComments.length}</span>}
            </TabsTrigger>
          </TabsList>
          <TabsContent value="news" className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle>Suas Notícias</CardTitle>
                <CardDescription>Gerencie todas as notícias publicadas na plataforma.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {news.map(item => (
                    <div key={item.id} className="flex flex-col sm:flex-row justify-between items-start sm:items-center p-4 bg-background rounded-lg border gap-4">
                      <div>
                        <p className="font-semibold">{item.title}</p>
                        <p className="text-sm text-muted-foreground">Fonte: {item.source} - Data: {new Date(item.date).toLocaleDateString('pt-BR', { timeZone: 'UTC' })}</p>
                      </div>
                      <div className="flex-shrink-0 flex gap-2">
                        <Button variant="ghost" size="icon" onClick={() => setEditingNews(item)}><Edit className="w-4 h-4" /></Button>
                        <Button variant="ghost" size="icon" className="text-red-500 hover:text-red-600" onClick={() => setDeletingNews(item)}><Trash2 className="w-4 h-4" /></Button>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="comments" className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle>Comentários Pendentes</CardTitle>
                <CardDescription>Aprove ou rejeite os comentários enviados pelos usuários.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {pendingComments.length > 0 ? pendingComments.map(comment => (
                    <div key={comment.id} className="p-4 bg-background rounded-lg border">
                      <p className="text-sm text-muted-foreground">Em <Link to={`/noticias/${comment.news_id}`} className="font-semibold text-primary hover:underline">{comment.news.title}</Link></p>
                      <p className="italic my-2">"{comment.text}"</p>
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium">{comment.author.name} <span className="text-muted-foreground">em {new Date(comment.created_at).toLocaleString('pt-BR')}</span></p>
                        <div className="flex gap-2">
                          <Button variant="ghost" size="icon" className="text-green-500 hover:text-green-600" onClick={() => handleCommentModeration(comment.id, 'approved')}><Check className="w-4 h-4" /></Button>
                          <Button variant="ghost" size="icon" className="text-red-500 hover:text-red-600" onClick={() => handleCommentModeration(comment.id, 'rejected')}><XCircle className="w-4 h-4" /></Button>
                        </div>
                      </div>
                    </div>
                  )) : <p className="text-center text-muted-foreground py-8">Nenhum comentário pendente.</p>}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      <NewsEditModal newsItem={editingNews} onSave={handleSaveNews} onClose={() => setEditingNews(null)} />

      <Dialog open={!!deletingNews} onOpenChange={(open) => !open && setDeletingNews(null)}>
        <DialogContent className="sm:max-w-md bg-card border-border">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold text-foreground">Confirmar Exclusão</DialogTitle>
          </DialogHeader>
          <p className="text-muted-foreground">Tem certeza que deseja remover a notícia "{deletingNews?.title}"? Esta ação não pode ser desfeita.</p>
          <DialogFooter className="sm:justify-end gap-2">
            <DialogClose asChild><Button type="button" variant="outline">Cancelar</Button></DialogClose>
            <Button type="button" variant="destructive" onClick={() => handleDeleteNews(deletingNews.id)}><Trash2 className="w-4 h-4 mr-2" /> Remover</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default ManageNewsPage;

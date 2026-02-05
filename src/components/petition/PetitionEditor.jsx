import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/customSupabaseClient';
import { Save, Eye, ArrowLeft, Image as ImageIcon, FileText, Settings, History, RotateCcw, Megaphone, MoreVertical, AlertTriangle, Send } from 'lucide-react';
import ImageUploader from './ImageUploader';
import GalleryEditor from './GalleryEditor';
import RichTextEditor from './RichTextEditor';
import PetitionUpdatesManager from './PetitionUpdatesManager';

const PetitionEditor = ({ petition, onSave, onCancel }) => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [versions, setVersions] = useState([]);
  
  // Initialize form data: prefer draft_data if it exists and we are editing a published petition
  const [formData, setFormData] = useState(() => {
    const hasDraft = petition.draft_data && petition.status === 'open';
    const baseData = hasDraft ? petition.draft_data : petition;
    
    return {
      title: baseData.title || '',
      description: baseData.description || '',
      content: baseData.content || baseData.description || '',
      gallery: baseData.gallery || (baseData.image_url ? [baseData.image_url] : []),
      goal: baseData.goal || 100,
      deadline: baseData.deadline ? new Date(baseData.deadline).toISOString().split('T')[0] : '',
      status: petition.status || 'draft', // This is the 'display' status in the editor
      layout: baseData.layout || [],
      donation_enabled: baseData.donation_enabled !== false, // Default to true if undefined
      donation_options: baseData.donation_options || [10, 20, 50, 100]
    };
  });

  // Local state for donation options input to allow free typing
  const [donationOptionsString, setDonationOptionsString] = useState(() => {
    return (formData.donation_options || [10, 20, 50, 100]).join(', ');
  });

  // Update donationOptionsString when formData.donation_options changes externally (e.g. restore/reset)
  useEffect(() => {
    setDonationOptionsString((formData.donation_options || []).join(', '));
  }, [formData.donation_options]);

  useEffect(() => {
    fetchVersions();
  }, [petition.id]);

  const fetchVersions = async () => {
    const { data } = await supabase
      .from('petition_versions')
      .select('*')
      .eq('petition_id', petition.id)
      .order('created_at', { ascending: false });
    setVersions(data || []);
  };

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSave = async (targetStatus) => {
    setLoading(true);
    try {
      const isPublished = petition.status === 'open';
      const isSavingDraft = targetStatus === 'draft';
      
      let updates = {};

      if (isSavingDraft && isPublished) {
         // Saving a draft for a published petition
         // We update ONLY the draft_data column, keeping the main petition 'open'
         updates = {
           draft_data: {
             ...formData,
             status: 'draft', // The draft itself is in draft mode
             updated_at: new Date().toISOString()
           },
           updated_at: new Date().toISOString()
         };
         // We do NOT update the main columns (title, description, etc) so the live version stays same
      } else {
         // Publishing (targetStatus === 'open') OR Saving a draft for a non-published petition
         // We update the main columns
         updates = {
           ...formData,
           status: targetStatus,
           draft_data: null, // Clear draft data if we are publishing or if this IS the main draft
           deadline: formData.deadline || null,
           updated_at: new Date().toISOString(),
           // Keep legacy fields in sync
           description: formData.content.replace(/<[^>]*>/g, '').substring(0, 200) + '...',
           image_url: formData.gallery.length > 0 ? formData.gallery[0] : null
         };
      }

      // 1. Update Petition
      const { error } = await supabase
        .from('petitions')
        .update(updates)
        .eq('id', petition.id);

      if (error) throw error;

      // 2. Create Version Snapshot (History)
      // We snapshot what the user sees in the form
      await supabase.from('petition_versions').insert({
        petition_id: petition.id,
        snapshot: { ...formData, status: targetStatus }
      });

      toast({
        title: "Salvo com sucesso!",
        description: targetStatus === 'open' ? "Petição publicada." : "Rascunho salvo."
      });

      // If we published, we should probably update the local petition state significantly
      if (onSave) {
        // We need to pass back the effective new state of the petition object
        // If we saved to draft_data, the petition object has a new draft_data
        // If we published, it has new main fields and null draft_data
        if (isSavingDraft && isPublished) {
            onSave({ ...petition, draft_data: updates.draft_data });
        } else {
            onSave({ ...petition, ...updates });
        }
      }
      fetchVersions(); // Refresh history
      
    } catch (error) {
      console.error('Save error:', error);
      toast({
        title: "Erro ao salvar",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDiscardDraft = async () => {
    if (!confirm("Tem certeza que deseja descartar o rascunho? Você perderá todas as alterações não publicadas e voltará para a versão ativa.")) return;
    
    setLoading(true);
    try {
      const { error } = await supabase
        .from('petitions')
        .update({ draft_data: null })
        .eq('id', petition.id);
        
      if (error) throw error;
      
      // Reset form data to published version
      setFormData({
        title: petition.title || '',
        description: petition.description || '',
        content: petition.content || petition.description || '',
        gallery: petition.gallery || (petition.image_url ? [petition.image_url] : []),
        goal: petition.goal || 100,
        deadline: petition.deadline ? new Date(petition.deadline).toISOString().split('T')[0] : '',
        status: petition.status, 
        layout: petition.layout || [],
        donation_enabled: petition.donation_enabled !== false,
        donation_options: petition.donation_options || [10, 20, 50, 100]
      });
      
      toast({ title: "Rascunho descartado", description: "Voltando para a versão publicada." });
      
      if (onSave) {
        onSave({ ...petition, draft_data: null });
      }
    } catch (error) {
      console.error('Discard error:', error);
      toast({ title: "Erro ao descartar", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleClosePetition = async () => {
    if (!confirm("Tem certeza que deseja encerrar esta petição? Ela não aceitará mais assinaturas ou doações.")) return;
    handleSave('closed');
  };

  return (
    <div className="min-h-screen bg-background pb-20">
      {/* Top Bar */}
      <div className="sticky top-0 z-10 bg-background/80 backdrop-blur-md border-b p-3 md:p-4 flex items-center justify-between gap-2 md:gap-4">
        <div className="flex items-center gap-2 md:gap-4 overflow-hidden">
          <Button variant="ghost" size="icon" onClick={onCancel} className="shrink-0">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="min-w-0">
            <h1 className="text-base md:text-lg font-bold truncate">Editar Abaixo-Assinado</h1>
            <div className="flex items-center gap-2">
              <p className="text-xs text-muted-foreground whitespace-nowrap">
                {formData.status === 'open' ? 'Publicado' : formData.status === 'closed' ? 'Encerrado' : 'Rascunho'}
              </p>
              {petition.status === 'open' && petition.draft_data && (
                <span className="text-xs bg-yellow-100 text-yellow-800 px-2 py-0.5 rounded-full whitespace-nowrap">
                  Rascunho
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {/* Desktop Buttons */}
          <div className="hidden md:flex gap-2">
             <Button variant="outline" onClick={() => handleSave('draft')} disabled={loading}>
                <Save className="w-4 h-4 mr-2" />
                Salvar Rascunho
            </Button>
            
            {formData.status !== 'closed' && (
                <Button onClick={() => handleSave('open')} disabled={loading}>
                    <Send className="w-4 h-4 mr-2" />
                    Publicar
                </Button>
            )}
          </div>

          {/* Mobile Icons (Visible only on small screens) */}
           <div className="flex md:hidden items-center gap-2">
             <Button variant="ghost" size="icon" onClick={() => handleSave('draft')} disabled={loading} title="Salvar Rascunho">
                <Save className="w-5 h-5" />
            </Button>
            
            {formData.status !== 'closed' && (
                <Button onClick={() => handleSave('open')} disabled={loading} size="sm" className="px-3 h-9 font-semibold">
                    <Send className="w-3.5 h-3.5 mr-1.5" />
                    Publicar
                </Button>
            )}
          </div>

          {/* Dropdown Menu for Secondary/Destructive Actions */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon">
                    <MoreVertical className="w-5 h-5" />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
                <DropdownMenuLabel>Ações</DropdownMenuLabel>
                
                {petition.status === 'open' && petition.draft_data && (
                    <DropdownMenuItem onClick={handleDiscardDraft} className="text-red-600 focus:text-red-600 cursor-pointer">
                        <RotateCcw className="w-4 h-4 mr-2" />
                        Descartar Rascunho
                    </DropdownMenuItem>
                )}

                {petition.status === 'open' && (
                     <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={handleClosePetition} className="text-red-600 focus:text-red-600 cursor-pointer">
                            <AlertTriangle className="w-4 h-4 mr-2" />
                            Encerrar Petição
                        </DropdownMenuItem>
                     </>
                )}
                
                {/* Fallback for cases where main buttons are hidden or user prefers menu? 
                    Actually, let's keep it clean. Only destructive/secondary here. */}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="container max-w-4xl mx-auto py-8 space-y-8">
        <div className="space-y-4">
          <Label htmlFor="title" className="text-lg">Título da Campanha</Label>
          <Input 
            id="title" 
            value={formData.title} 
            onChange={(e) => handleChange('title', e.target.value)}
            className="text-xl md:text-2xl font-bold h-12 md:h-14"
            placeholder="Digite um título impactante..."
          />
        </div>

        <Tabs defaultValue="content" className="w-full">
          <TabsList className="w-full justify-start overflow-x-auto flex-nowrap h-auto p-1 bg-muted/50">
            <TabsTrigger value="content" className="flex-shrink-0"><FileText className="w-4 h-4 mr-2" /> Detalhes</TabsTrigger>
            <TabsTrigger value="updates" className="flex-shrink-0"><Megaphone className="w-4 h-4 mr-2" /> Novidades</TabsTrigger>
            <TabsTrigger value="images" className="flex-shrink-0"><ImageIcon className="w-4 h-4 mr-2" /> Imagens</TabsTrigger>
            <TabsTrigger value="settings" className="flex-shrink-0"><Settings className="w-4 h-4 mr-2" /> Configurações</TabsTrigger>
            <TabsTrigger value="history" className="flex-shrink-0"><History className="w-4 h-4 mr-2" /> Histórico</TabsTrigger>
          </TabsList>

          <TabsContent value="content" className="mt-6 space-y-6">
            <Card>
              <CardHeader className="p-4 md:p-6">
                <CardTitle>História da Campanha</CardTitle>
              </CardHeader>
              <CardContent className="p-4 pt-0 md:p-6 md:pt-0">
                <RichTextEditor 
                  value={formData.content} 
                  onChange={(val) => handleChange('content', val)} 
                />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="updates" className="mt-6 space-y-6">
             <PetitionUpdatesManager petitionId={petition.id} />
          </TabsContent>

          <TabsContent value="images" className="mt-6 space-y-6">
            <Card>
              <CardHeader className="p-4 md:p-6">
                <CardTitle>Galeria de Imagens</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6 p-4 pt-0 md:p-6 md:pt-0">
                <ImageUploader 
                  onUploadComplete={(newUrls) => handleChange('gallery', [...formData.gallery, ...newUrls])} 
                />
                <GalleryEditor 
                  images={formData.gallery} 
                  onChange={(newGallery) => handleChange('gallery', newGallery)} 
                />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="settings" className="mt-6 space-y-6">
             <Card>
              <CardHeader className="p-4 md:p-6">
                <CardTitle>Metas e Prazos</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 p-4 pt-0 md:p-6 md:pt-0">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="goal">Meta de Assinaturas</Label>
                    <Input 
                      id="goal" 
                      type="number" 
                      value={formData.goal} 
                      onChange={(e) => handleChange('goal', e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="deadline">Data Limite</Label>
                    <Input 
                      id="deadline" 
                      type="date" 
                      value={formData.deadline} 
                      onChange={(e) => handleChange('deadline', e.target.value)}
                    />
                  </div>
                </div>

                <div className="space-y-4 pt-4 border-t">
                  <h3 className="text-lg font-medium">Configurações de Doação</h3>
                  <div className="flex items-center space-x-2">
                    <Switch 
                      id="donation-enabled"
                      checked={formData.donation_enabled}
                      onCheckedChange={(checked) => handleChange('donation_enabled', checked)}
                    />
                    <Label htmlFor="donation-enabled">Habilitar Doações</Label>
                  </div>
                  
                  {formData.donation_enabled && (
                    <div className="space-y-2">
                      <Label htmlFor="donation-options">Sugestões de Valores (separados por vírgula)</Label>
                      <Input 
                        id="donation-options" 
                        value={donationOptionsString} 
                        onChange={(e) => {
                           const val = e.target.value;
                           setDonationOptionsString(val); // Update input display immediately
                           
                           // Try to parse values
                           const values = val.split(',').map(v => {
                             const num = parseInt(v.trim());
                             return isNaN(num) ? null : num;
                           }).filter(v => v !== null);
                           
                           // Check if values are different from current formData to avoid unnecessary updates
                           // which might trigger useEffect and reset the input string (removing commas/partial input)
                           const currentValues = formData.donation_options || [];
                           const hasChanged = values.length !== currentValues.length || 
                                              values.some((v, i) => v !== currentValues[i]);
                           
                           if (hasChanged) {
                               handleChange('donation_options', values);
                           }
                        }}
                        onBlur={() => {
                          // On blur, format the input to look nice based on valid values
                          // But only if we have some values, otherwise keep what user typed if it's garbage?
                          // Better to sync with current formData state which has the valid numbers
                          if (formData.donation_options && formData.donation_options.length > 0) {
                              setDonationOptionsString(formData.donation_options.join(', '));
                          }
                        }}
                        placeholder="Ex: 10, 20, 50, 100"
                      />
                      <p className="text-xs text-muted-foreground">Estes valores aparecerão como sugestão para os apoiadores.</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="history" className="mt-6 space-y-6">
            <Card>
              <CardHeader className="p-4 md:p-6">
                <CardTitle>Histórico de Versões</CardTitle>
                <CardDescription>
                  Restaure versões anteriores se necessário.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-4 pt-0 md:p-6 md:pt-0">
                {versions.length === 0 ? (
                  <p className="text-muted-foreground text-center py-8">Nenhuma versão salva encontrada.</p>
                ) : (
                  <div className="space-y-4">
                    {versions.map((version) => (
                      <div key={version.id} className="flex items-center justify-between border-b pb-4 last:border-0">
                        <div>
                          <p className="font-medium">
                            {new Date(version.created_at).toLocaleString('pt-BR', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {version.snapshot.title}
                          </p>
                        </div>
                        <Button variant="ghost" size="sm" onClick={() => handleRestore(version.snapshot)}>
                          <RotateCcw className="w-4 h-4 mr-2" />
                          Restaurar
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default PetitionEditor;

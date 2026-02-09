import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
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
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { Progress } from '@/components/ui/progress';
import { motion, AnimatePresence } from 'framer-motion';
import { Save, Eye, ArrowLeft, Image as ImageIcon, FileText, Settings, History, RotateCcw, Megaphone, MoreVertical, AlertTriangle, Send, Users, Building2, CheckCircle2, Heart, Trash2, Plus, ArrowRight, ChevronLeft, ChevronRight, MessageSquare } from 'lucide-react';
import ImageUploader from './ImageUploader';
import GalleryEditor from './GalleryEditor';
import RichTextEditor from './RichTextEditor';

const ICON_MAP = {
  Users,
  Building2,
  Eye,
  CheckCircle2,
  AlertTriangle,
  Heart
};

const defaultImportanceItems = [
  { icon: "Users", text: "Mostra força coletiva para mudança" },
  { icon: "Building2", text: "Pressiona autoridades competentes" },
  { icon: "Eye", text: "Cria visibilidade para o problema" },
];

const STEPS = [
  { id: 'basic', label: 'Básico', icon: FileText, description: 'Informações principais' },
  { id: 'content', label: 'História', icon: MessageSquare, description: 'Conte sua causa' },
  { id: 'importance', label: 'Destaques', icon: CheckCircle2, description: 'Pontos chave' },
  { id: 'images', label: 'Visual', icon: ImageIcon, description: 'Fotos e vídeos' },
  { id: 'settings', label: 'Ajustes', icon: Settings, description: 'Metas e prazos' },
];

// Helper to check if we are on mobile (simple check)
const useIsMobile = () => {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);
  return isMobile;
};

const PetitionEditor = ({ petition, onSave, onCancel }) => {
  const { toast } = useToast();
  const { user } = useAuth();
  const isMobile = useIsMobile();
  const [loading, setLoading] = useState(false);
  const [versions, setVersions] = useState([]);
  
  const isAdmin = user?.is_admin;
  
  // State for Wizard/Tabs
  const [searchParams, setSearchParams] = useSearchParams();
  const activeStep = searchParams.get('step') || 'basic';
  
  const setActiveStep = (step) => {
    setSearchParams(prev => {
      const newParams = new URLSearchParams(prev);
      newParams.set('step', step);
      return newParams;
    }, { replace: true });
  };
  
  // Local state for adding new importance items
  const [newItemText, setNewItemText] = useState('');
  const [newItemIcon, setNewItemIcon] = useState('Users');

  // Initialize form data: prefer draft_data if it exists and we are editing a published petition
  const [formData, setFormData] = useState(() => {
    const hasDraft = petition.draft_data && petition.status === 'open';
    const baseData = hasDraft ? petition.draft_data : petition;
    
    return {
      title: baseData.title || '',
      target: baseData.target || '',
      description: baseData.description || '',
      content: baseData.content || baseData.description || '',
      gallery: baseData.gallery || (baseData.image_url ? [baseData.image_url] : []),
      goal: baseData.goal || 100,
      donation_goal: baseData.donation_goal || '',
      deadline: baseData.deadline ? new Date(baseData.deadline).toISOString().split('T')[0] : '',
      status: petition.status || 'draft', // This is the 'display' status in the editor
      layout: baseData.layout || [],
      donation_enabled: baseData.donation_enabled !== false, // Default to true if undefined
      donation_options: baseData.donation_options || [10, 20, 50, 100],
      importance_list: (baseData.importance_list && baseData.importance_list.length > 0) 
        ? baseData.importance_list 
        : defaultImportanceItems
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
      // If user is not admin and trying to publish, set to pending_moderation
      let actualStatus = targetStatus;
      if (targetStatus === 'open' && !isAdmin) {
        actualStatus = 'pending_moderation';
      }

      const isPublished = petition.status === 'open';
      const isSavingDraft = actualStatus === 'draft';
      
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
         // Publishing (actualStatus === 'open' or 'pending_moderation') OR Saving a draft for a non-published petition
         // We update the main columns
         updates = {
           ...formData,
           status: actualStatus,
           draft_data: null, // Clear draft data if we are publishing or if this IS the main draft
           deadline: formData.deadline || null,
           updated_at: new Date().toISOString(),
           // Keep legacy fields in sync
           description: formData.content.replace(/<[^>]*>/g, '').substring(0, 200) + '...',
           image_url: formData.gallery.length > 0 ? formData.gallery[0] : null
         };

         // Remove admin-only fields if not admin to prevent errors if columns are restricted/missing
         // and to ensure regular users don't set these values.
         if (!isAdmin) {
            delete updates.donation_goal;
            delete updates.donation_enabled;
            delete updates.donation_options;
            delete updates.deadline;
         }

         // Ensure we handle empty donation_goal correctly (set to null to clear it)
         if (!formData.donation_goal) {
            updates.donation_goal = null;
         }
      }

      // 1. Update Petition
      let { error } = await supabase
        .from('petitions')
        .update(updates)
        .eq('id', petition.id);

      // Handle specific error where donation_goal column might be missing in DB
      if (error && (error.message?.includes('donation_goal') || error.details?.includes('donation_goal'))) {
        console.warn('Donation goal column missing, retrying without it');
        delete updates.donation_goal;
        const retry = await supabase
          .from('petitions')
          .update(updates)
          .eq('id', petition.id);
        
        if (!retry.error) {
            error = null; // Clear error if retry succeeded
            toast({ 
                title: "Aviso", 
                description: "Meta de doação não pôde ser salva (campo indisponível), mas os outros dados foram atualizados.",
                variant: "warning" 
            });
        } else {
            error = retry.error;
        }
      }

      if (error) throw error;

      // 2. Create Version Snapshot (History)
      // We snapshot what the user sees in the form
      await supabase.from('petition_versions').insert({
        petition_id: petition.id,
        snapshot: { ...formData, status: actualStatus }
      });

      let toastMessage = "Rascunho salvo.";
      if (actualStatus === 'open') toastMessage = "Petição publicada.";
      if (actualStatus === 'pending_moderation') toastMessage = "Petição enviada para moderação.";

      toast({
        title: "Salvo com sucesso!",
        description: toastMessage
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
    if (!confirm("Tem certeza que deseja encerrar esta petição? Ela não poderá mais receber assinaturas, mas continuará visível.")) return;

    setLoading(true);
    try {
      const { error } = await supabase
        .from('petitions')
        .update({ status: 'closed', updated_at: new Date().toISOString() })
        .eq('id', petition.id);

      if (error) throw error;

      setFormData(prev => ({ ...prev, status: 'closed' }));
      
      toast({ 
        title: "Petição encerrada", 
        description: "A petição foi encerrada com sucesso." 
      });

      if (onSave) {
        onSave({ ...petition, status: 'closed' });
      }
    } catch (error) {
      console.error('Close error:', error);
      toast({ 
        title: "Erro ao encerrar", 
        description: error.message, 
        variant: "destructive" 
      });
    } finally {
      setLoading(false);
    }
  };

  const handleRestore = (snapshot) => {
    if (!confirm("Tem certeza que deseja restaurar esta versão? As alterações atuais serão perdidas.")) return;
    
    setFormData({
      ...snapshot,
      // Ensure arrays are initialized if missing in snapshot
      gallery: snapshot.gallery || [],
      donation_options: snapshot.donation_options || [10, 20, 50, 100],
      importance_list: (snapshot.importance_list && snapshot.importance_list.length > 0)
        ? snapshot.importance_list
        : defaultImportanceItems
    });
    
    toast({ title: "Versão restaurada", description: "Clique em Salvar para aplicar as alterações." });
  };

  const handleAddImportanceItem = () => {
    if (!newItemText.trim()) return;
    const newItem = { icon: newItemIcon, text: newItemText.trim() };
    handleChange('importance_list', [...(formData.importance_list || []), newItem]);
    setNewItemText('');
  };

  const handleRemoveImportanceItem = (index) => {
    const newList = [...(formData.importance_list || [])];
    newList.splice(index, 1);
    handleChange('importance_list', newList);
  };

  const availableSteps = [
    ...STEPS,
    ...(petition.status !== 'draft' ? [
      { id: 'history', label: 'Histórico', icon: History, description: 'Versões anteriores' }
    ] : [])
  ];

  const currentStepIndex = availableSteps.findIndex(s => s.id === activeStep);
  const progress = ((currentStepIndex + 1) / availableSteps.length) * 100;

  const nextStep = () => {
    if (currentStepIndex < availableSteps.length - 1) {
      setActiveStep(availableSteps[currentStepIndex + 1].id);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const prevStep = () => {
    if (currentStepIndex > 0) {
      setActiveStep(availableSteps[currentStepIndex - 1].id);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const renderStepContent = () => {
    const content = () => {
      switch (activeStep) {
        case 'basic':
          return (
            <div className="space-y-6">
              <Card className="border-muted/60 shadow-sm">
                <CardHeader>
                  <CardTitle className="text-xl flex items-center gap-2">
                    <span className="bg-primary/10 p-2 rounded-lg text-primary">
                      <FileText className="w-5 h-5" />
                    </span>
                    Informações Básicas
                  </CardTitle>
                  <CardDescription>
                    Defina o objetivo principal e o alcance da sua petição.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="space-y-2">
                    <Label htmlFor="title" className="text-base font-semibold text-foreground/80">
                      Título da Campanha
                    </Label>
                    <div className="relative">
                        <Input 
                          id="title" 
                          value={formData.title} 
                          onChange={(e) => handleChange('title', e.target.value)}
                          className="text-lg font-medium h-12 pl-4 border-muted-foreground/20 focus-visible:border-primary focus-visible:ring-1 focus-visible:ring-primary/20 transition-all shadow-sm"
                          placeholder="Ex: Salve o Parque Central..."
                        />
                    </div>
                    <p className="text-xs text-muted-foreground">Escolha um título curto e impactante.</p>
                  </div>

                  <div className="grid md:grid-cols-2 gap-6">
                      <div className="space-y-2">
                        <Label htmlFor="target" className="text-base font-semibold text-foreground/80">
                          Destinatário
                        </Label>
                        <div className="relative">
                            <Building2 className="absolute left-3 top-3 h-5 w-5 text-muted-foreground/50" />
                            <Input 
                              id="target" 
                              value={formData.target} 
                              onChange={(e) => handleChange('target', e.target.value)}
                              className="pl-10 h-11 border-muted-foreground/20 transition-all focus-visible:ring-primary/20"
                              placeholder="Ex: Prefeito, Secretário..."
                            />
                        </div>
                        <p className="text-xs text-muted-foreground">Quem tem o poder de resolver o problema?</p>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="goal" className="text-base font-semibold text-foreground/80">
                          Meta de Assinaturas
                        </Label>
                        <div className="relative">
                            <Users className="absolute left-3 top-3 h-5 w-5 text-muted-foreground/50" />
                            <Input 
                              id="goal" 
                              type="number" 
                              value={formData.goal} 
                              onChange={(e) => handleChange('goal', e.target.value)}
                              className="pl-10 h-11 border-muted-foreground/20 transition-all focus-visible:ring-primary/20"
                              placeholder="Ex: 1000"
                            />
                        </div>
                        <p className="text-xs text-muted-foreground">Defina um objetivo realista para começar.</p>
                      </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          );
        case 'content':
          return (
            <div className="space-y-6">
              <Card className="border-muted/60 shadow-sm">
                <CardHeader>
                  <CardTitle className="text-xl flex items-center gap-2">
                     <span className="bg-primary/10 p-2 rounded-lg text-primary">
                      <FileText className="w-5 h-5" />
                    </span>
                    História da Campanha
                  </CardTitle>
                  <CardDescription>Conte detalhadamente por que esta causa é importante.</CardDescription>
                </CardHeader>
                <CardContent>
                  <div>
                      <RichTextEditor 
                        value={formData.content} 
                        onChange={(val) => handleChange('content', val)}
                        isMobile={isMobile}
                      />
                  </div>
                </CardContent>
              </Card>
            </div>
          );
        case 'importance':
          return (
            <div className="space-y-6">
              <Card className="border-muted/60 shadow-sm">
                <CardHeader>
                  <CardTitle className="text-xl flex items-center gap-2">
                    <span className="bg-yellow-500/10 p-2 rounded-lg text-yellow-600">
                      <CheckCircle2 className="w-5 h-5" />
                    </span>
                    Por que isso importa?
                  </CardTitle>
                  <CardDescription>Adicione pontos chave para resumir a importância.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="grid gap-3">
                    {(formData.importance_list || []).map((item, index) => {
                      const Icon = ICON_MAP[item.icon] || Users;
                      return (
                        <div key={index} className="group flex items-center gap-4 p-4 border rounded-xl bg-card hover:bg-accent/5 transition-all hover:shadow-sm hover:border-primary/30">
                          <div className="p-3 bg-primary/10 rounded-full shrink-0 group-hover:bg-primary/20 transition-colors">
                             <Icon className="w-5 h-5 text-primary" />
                          </div>
                          <span className="flex-1 text-sm font-medium text-foreground/90">{item.text}</span>
                          <Button variant="ghost" size="icon" onClick={() => handleRemoveImportanceItem(index)} className="text-muted-foreground hover:text-destructive">
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      );
                    })}
                    
                    {(!formData.importance_list || formData.importance_list.length === 0) && (
                        <div className="text-center p-8 border-2 border-dashed rounded-xl text-muted-foreground/60 bg-muted/5">
                            <CheckCircle2 className="w-10 h-10 mx-auto mb-2 opacity-20" />
                            <p className="text-sm">Nenhum ponto de importância adicionado ainda.</p>
                        </div>
                    )}
                  </div>

                  <div className="flex flex-col md:flex-row gap-2 items-stretch md:items-center p-4 bg-muted/30 rounded-xl border border-muted/50">
                     <div className="flex items-center gap-2 flex-1 bg-background/50 rounded-lg border border-transparent focus-within:border-primary/30 transition-all p-1">
                       <DropdownMenu>
                         <DropdownMenuTrigger asChild>
                           <Button variant="outline" size="icon" className="shrink-0 h-10 w-10 rounded-full border-dashed border-2 hover:border-primary hover:text-primary transition-colors">
                             {newItemIcon ? React.createElement(ICON_MAP[newItemIcon], { className: "w-4 h-4" }) : <Plus className="w-4 h-4" />}
                           </Button>
                         </DropdownMenuTrigger>
                         <DropdownMenuContent align="start" className="w-64">
                           <DropdownMenuLabel>Escolha um ícone</DropdownMenuLabel>
                           <div className="grid grid-cols-5 gap-2 p-2">
                             {Object.keys(ICON_MAP).map(iconName => (
                               <Button 
                                  key={iconName} 
                                  variant="ghost" 
                                  size="icon" 
                                  onClick={() => setNewItemIcon(iconName)} 
                                  className={newItemIcon === iconName ? "bg-primary/10 text-primary" : "text-muted-foreground"}
                                >
                                 {React.createElement(ICON_MAP[iconName], { className: "w-4 h-4" })}
                               </Button>
                             ))}
                           </div>
                         </DropdownMenuContent>
                       </DropdownMenu>
                       
                       <div className="flex-1 relative">
                          <Input 
                              value={newItemText} 
                              onChange={(e) => setNewItemText(e.target.value)} 
                              placeholder="Digite um novo motivo..." 
                              className="border-0 bg-transparent shadow-none focus-visible:ring-0 px-2 h-10"
                              onKeyDown={(e) => {
                              if (e.key === 'Enter') handleAddImportanceItem();
                              }}
                          />
                       </div>
                     </div>
                     
                     <Button onClick={handleAddImportanceItem} disabled={!newItemText.trim()} size="sm" className="w-full md:w-auto rounded-full px-6">
                       Adicionar
                     </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          );
        case 'images':
          return (
            <div className="space-y-6">
              <Card className="border-muted/60 shadow-sm">
                <CardHeader>
                  <CardTitle className="text-xl flex items-center gap-2">
                     <span className="bg-primary/10 p-2 rounded-lg text-primary">
                      <ImageIcon className="w-5 h-5" />
                    </span>
                    Galeria de Imagens
                  </CardTitle>
                  <CardDescription>Adicione fotos para tornar sua petição mais visual e atraente.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="bg-muted/30 p-6 rounded-xl border border-dashed border-muted-foreground/20">
                      <ImageUploader 
                        onUploadComplete={(newUrls) => handleChange('gallery', [...formData.gallery, ...newUrls])} 
                      />
                  </div>
                  <GalleryEditor 
                    images={formData.gallery} 
                    onChange={(newGallery) => handleChange('gallery', newGallery)} 
                  />
                </CardContent>
              </Card>
            </div>
          );
        case 'settings':
          return (
            <div className="space-y-6">
               <Card className="border-muted/60 shadow-sm">
                <CardHeader>
                  <CardTitle className="text-xl flex items-center gap-2">
                     <span className="bg-primary/10 p-2 rounded-lg text-primary">
                      <Settings className="w-5 h-5" />
                    </span>
                    Configurações Avançadas
                  </CardTitle>
                  <CardDescription>Ajustes administrativos e metas financeiras.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-8">
                  {/* Goal moved to Basic, but Donation Goal stays here for Admin */}
                  {isAdmin ? (
                    <>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-2">
                          <Label htmlFor="donation_goal" className="font-semibold">Meta de Doação (R$) <span className="text-xs font-normal text-muted-foreground">(Opcional)</span></Label>
                          <div className="relative">
                              <span className="absolute left-3 top-3 text-muted-foreground font-semibold">R$</span>
                              <Input 
                                id="donation_goal" 
                                type="number"
                                step="0.01" 
                                min="0"
                                placeholder="0,00"
                                value={formData.donation_goal} 
                                onChange={(e) => handleChange('donation_goal', e.target.value)}
                                className="pl-9 h-11"
                              />
                          </div>
                          <p className="text-xs text-muted-foreground">Valor alvo para arrecadação.</p>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="deadline" className="font-semibold">Data Limite</Label>
                          <Input 
                            id="deadline" 
                            type="date" 
                            value={formData.deadline} 
                            onChange={(e) => handleChange('deadline', e.target.value)}
                            className="h-11"
                          />
                          <p className="text-xs text-muted-foreground">Prazo final para a campanha.</p>
                        </div>
                      </div>

                      <div className="space-y-6 pt-6 border-t">
                        <div className="flex items-center justify-between p-4 bg-muted/30 rounded-lg border">
                            <div className="space-y-0.5">
                                <Label htmlFor="donation-enabled" className="text-base font-semibold">Habilitar Doações</Label>
                                <p className="text-sm text-muted-foreground">Permitir que apoiadores contribuam financeiramente.</p>
                            </div>
                            <Switch 
                                id="donation-enabled"
                                checked={formData.donation_enabled}
                                onCheckedChange={(checked) => handleChange('donation_enabled', checked)}
                            />
                        </div>
                        
                        {formData.donation_enabled && (
                          <div className="space-y-3 p-4 border rounded-lg bg-card animate-in fade-in slide-in-from-top-2">
                            <Label htmlFor="donation-options" className="font-semibold">Sugestões de Valores</Label>
                            <Input 
                              id="donation-options" 
                              value={donationOptionsString} 
                              onChange={(e) => {
                                const val = e.target.value;
                                setDonationOptionsString(val);
                                const values = val.split(',').map(v => {
                                  const num = parseInt(v.trim());
                                  return isNaN(num) ? null : num;
                                }).filter(v => v !== null);
                                const currentValues = formData.donation_options || [];
                                const hasChanged = values.length !== currentValues.length || 
                                                    values.some((v, i) => v !== currentValues[i]);
                                if (hasChanged) {
                                    handleChange('donation_options', values);
                                }
                              }}
                              onBlur={() => {
                                if (formData.donation_options && formData.donation_options.length > 0) {
                                    setDonationOptionsString(formData.donation_options.join(', '));
                                }
                              }}
                              placeholder="Ex: 10, 20, 50, 100"
                              className="h-11"
                            />
                            <p className="text-xs text-muted-foreground">Separe os valores por vírgula. Ex: 10, 20, 50</p>
                          </div>
                        )}
                      </div>
                    </>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-12 text-muted-foreground bg-muted/20 rounded-xl border border-dashed">
                      <div className="bg-muted p-4 rounded-full mb-4">
                        <Settings className="w-8 h-8 opacity-50" />
                      </div>
                      <h3 className="text-lg font-medium mb-1">Acesso Restrito</h3>
                      <p>Apenas administradores podem alterar configurações avançadas.</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          );
        case 'updates':
          return <PetitionUpdatesManager petitionId={petition.id} />;
        case 'history':
          return (
            <Card>
              <CardHeader>
                <CardTitle>Histórico de Versões</CardTitle>
                <CardDescription>Restaure versões anteriores se necessário.</CardDescription>
              </CardHeader>
              <CardContent>
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
                          <p className="text-sm text-muted-foreground">{version.snapshot.title}</p>
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
          );
        default:
          return null;
      }
    };

    return (
      <AnimatePresence mode="wait">
        <motion.div
          key={activeStep}
          initial={{ opacity: 0, x: 10 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -10 }}
          transition={{ duration: 0.2 }}
        >
          {content()}
        </motion.div>
      </AnimatePresence>
    );
  };

  return (
    <div className="min-h-screen bg-background pb-10">
      {/* Top Bar */}
      <div className="sticky top-0 z-10 bg-background/80 backdrop-blur-md border-b p-4 flex items-center justify-between gap-4 shadow-sm">
        <div className="flex items-center gap-2 md:gap-4 overflow-hidden">
          <Button variant="ghost" size="icon" onClick={onCancel} className="shrink-0">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="min-w-0">
            <h1 className="text-lg font-bold truncate">Editar Abaixo-Assinado</h1>
            <div className="flex items-center gap-2">
              <p className="text-xs text-muted-foreground whitespace-nowrap">
                {formData.status === 'open' ? 'Publicado' : formData.status === 'closed' ? 'Encerrado' : formData.status === 'pending_moderation' ? 'Em Moderação' : 'Rascunho'}
              </p>
              {petition.status === 'open' && petition.draft_data && (
                <span className="text-xs bg-yellow-100 text-yellow-800 px-2 py-0.5 rounded-full whitespace-nowrap">Rascunho</span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
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

          <div className="flex md:hidden items-center gap-2">
             <Button variant="ghost" size="icon" onClick={() => handleSave('draft')} disabled={loading} title="Salvar Rascunho">
                <Save className="w-5 h-5" />
            </Button>
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon">
                    <MoreVertical className="w-5 h-5" />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
                <DropdownMenuLabel>Ações</DropdownMenuLabel>
                {petition.status === 'open' && petition.draft_data && (
                    <DropdownMenuItem onClick={handleDiscardDraft} className="text-red-600 cursor-pointer">
                        <RotateCcw className="w-4 h-4 mr-2" /> Descartar Rascunho
                    </DropdownMenuItem>
                )}
                {petition.status === 'open' && (
                     <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={handleClosePetition} className="text-red-600 cursor-pointer">
                            <AlertTriangle className="w-4 h-4 mr-2" /> Encerrar Petição
                        </DropdownMenuItem>
                     </>
                )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="container max-w-5xl mx-auto py-6 md:py-8 space-y-6 md:space-y-8">
        
        {/* Mobile Progress Bar */}
        <div className="md:hidden px-2">
          <div className="flex justify-between text-sm font-medium mb-2 text-muted-foreground">
            <span>Passo {currentStepIndex + 1} de {availableSteps.length}</span>
            <span>{Math.round(progress)}%</span>
          </div>
          <Progress value={progress} className="h-2" />
        </div>

        <div className="flex flex-col md:flex-row gap-8">
          
          {/* Desktop Sidebar Navigation */}
          <aside className="hidden md:block w-64 shrink-0 space-y-2">
            <nav className="sticky top-24 space-y-1">
              {availableSteps.map((step) => {
                const isActive = activeStep === step.id;
                const Icon = step.icon;
                return (
                  <button
                    key={step.id}
                    onClick={() => setActiveStep(step.id)}
                    className={`w-full flex items-center gap-3 px-4 py-3 text-left rounded-lg transition-colors ${
                      isActive 
                        ? 'bg-primary text-primary-foreground shadow-md' 
                        : 'hover:bg-muted text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    <Icon className="w-5 h-5" />
                    <div>
                      <div className="font-medium text-sm">{step.label}</div>
                      <div className={`text-xs ${isActive ? 'text-primary-foreground/80' : 'text-muted-foreground'}`}>
                        {step.description}
                      </div>
                    </div>
                  </button>
                );
              })}
            </nav>
          </aside>

          {/* Content Area */}
          <main className="flex-1 min-w-0">
             {renderStepContent()}

            {/* Navigation Buttons */}
            <div className="sticky bottom-0 z-20 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 py-4 border-t mt-8 flex items-center justify-between gap-4">
              <Button 
                variant="outline" 
                onClick={prevStep} 
                disabled={currentStepIndex === 0}
                className="flex-1 md:flex-none md:w-32"
              >
                <ChevronLeft className="w-4 h-4 mr-2" />
                Voltar
              </Button>
              
              {currentStepIndex === availableSteps.length - 1 ? (
                <Button 
                  className="flex-1 md:flex-none md:w-32" 
                  onClick={() => handleSave('open')}
                  disabled={loading}
                >
                  {petition.status === 'open' ? 'Salvar' : 'Publicar'} <Send className="w-4 h-4 ml-2" />
                </Button>
              ) : (
                <Button 
                  className="flex-1 md:flex-none md:w-32" 
                  onClick={nextStep}
                >
                  Próximo <ChevronRight className="w-4 h-4 ml-2" />
                </Button>
              )}
            </div>
          </main>
        </div>
      </div>
    </div>
  );
};

export default PetitionEditor;

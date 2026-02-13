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
import { PetitionTour } from './PetitionTour';

// Preview Components
import PetitionHero from '../petition-modern/PetitionHero';
import PetitionContent from '../petition-modern/PetitionContent';
import PetitionSignatureCard from '../petition-modern/PetitionSignatureCard';

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

const hasLongWords = (text) => {
  if (!text) return false;
  // Remove HTML tags for content validation and handle non-breaking spaces
  const plainText = text.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ');
  // Split by whitespace and check each word
  const words = plainText.split(/\s+/);
  // A word is considered a continuous string of characters without whitespace
  return words.some(word => word.length > 30);
};

const STEPS = [
  { id: 'basic', label: 'Básico', icon: FileText, description: 'Informações principais' },
  { id: 'content', label: 'História', icon: MessageSquare, description: 'Conte sua causa' },
  { id: 'importance', label: 'Destaques', icon: CheckCircle2, description: 'Pontos chave' },
  { id: 'images', label: 'Visual', icon: ImageIcon, description: 'Fotos e vídeos' },
  { id: 'settings', label: 'Ajustes', icon: Settings, description: 'Metas e prazos' },
  { id: 'preview', label: 'Resumo', icon: CheckCircle2, description: 'Finalizar envio' },
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
  const [submitted, setSubmitted] = useState(false);
  
  const isAdmin = user?.is_admin;
  const isAuthor = user?.id === petition.author_id;
  const hideDraftOption = isAdmin && !isAuthor;
  
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
  const [errors, setErrors] = useState({});
  const STORAGE_KEY = `petition_editor_draft_${petition.id}`;

  // Initialize form data: prefer local storage backup, then draft_data, then petition data
  const [formData, setFormData] = useState(() => {
    // 1. Try to load from local storage first (unsaved work recovery)
    try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
            const parsed = JSON.parse(saved);
            if (parsed && typeof parsed === 'object') {
                return parsed;
            }
        }
    } catch (e) {
        console.error("Failed to load draft from storage", e);
    }

    // 2. Fallback to database data
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

  // Track if form has unsaved changes
  const [isDirty, setIsDirty] = useState(() => {
      return !!localStorage.getItem(STORAGE_KEY);
  });

  // Save to local storage on change (debounce 1s)
  useEffect(() => {
    if (isDirty) {
        const handler = setTimeout(() => {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(formData));
        }, 1000);
        return () => clearTimeout(handler);
    }
  }, [formData, isDirty, STORAGE_KEY]);

  // Warning before unload if unsaved changes exist
  useEffect(() => {
    const handleBeforeUnload = (e) => {
      if (isDirty) {
        e.preventDefault();
        e.returnValue = ''; // Standard for Chrome
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isDirty]);

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
    setIsDirty(true);
    if (errors[field]) {
        setErrors(prev => ({ ...prev, [field]: null }));
    }
  };

  const handleSave = async (targetStatus) => {
    setLoading(true);
    
    // Validation for publishing
    if (targetStatus === 'open') {
        let stepErrors = {};
        if (!formData.title?.trim()) {
            stepErrors.title = "Por favor, adicione um título para sua petição.";
        } else if (hasLongWords(formData.title)) {
            stepErrors.title = "O título contém palavras muito longas (máximo 30 caracteres sem espaços).";
        }

        if (!formData.target?.trim()) {
            stepErrors.target = "Por favor, informe quem deve receber esta petição.";
        } else if (hasLongWords(formData.target)) {
            stepErrors.target = "O destinatário contém palavras muito longas (máximo 30 caracteres sem espaços).";
        }

        if (!formData.goal || formData.goal < 1) {
            stepErrors.goal = "Por favor, defina uma meta válida de assinaturas.";
        }

        if (Object.keys(stepErrors).length > 0) {
            setErrors(prev => ({ ...prev, ...stepErrors }));
            setActiveStep('basic');
            setLoading(false);
            return;
        }
        
        const content = formData.content || '';
        const plainTextContent = content.replace(/<[^>]*>/g, '').trim();
        if (!plainTextContent) {
             setErrors(prev => ({ ...prev, content: "Por favor, conte a história da sua causa." }));
             setActiveStep('content');
             setLoading(false);
             return;
        }

        if (hasLongWords(content)) {
            setErrors(prev => ({ ...prev, content: "A história contém palavras muito longas (máximo 30 caracteres sem espaços)." }));
            setActiveStep('content');
            setLoading(false);
            return;
        }

        if (plainTextContent.length < 500) {
            const errorMsg = `A descrição deve ter pelo menos 500 caracteres para ser publicada. Atual: ${plainTextContent.length}`;
            setErrors(prev => ({ ...prev, content: errorMsg }));
            setActiveStep('content');
            setLoading(false);
            return;
        }
    }

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
        } else {
            error = retry.error;
        }
      }

      if (error) throw error;

      // 1.1 Update Report flag if this petition is linked to a report
      if (petition.report_id) {
        await supabase
          .from('reports')
          .update({ is_petition: true })
          .eq('id', petition.report_id);
      }

      // 2. Create Version Snapshot (History)
      // We snapshot what the user sees in the form
      await supabase.from('petition_versions').insert({
        petition_id: petition.id,
        snapshot: { ...formData, status: actualStatus }
      });

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

      if (targetStatus === 'open') {
          setSubmitted(true);
          setIsDirty(false);
          localStorage.removeItem(STORAGE_KEY);
          // Redirecionar para a página da petição após publicar/enviar para moderação
          setTimeout(() => {
            navigate(`/abaixo-assinado/${petition.id}`);
          }, 1500);
      } else {
          toast({ title: "Alterações salvas", description: "O rascunho foi atualizado com sucesso." });
          setIsDirty(false);
          localStorage.removeItem(STORAGE_KEY);
          // Redirecionar para a página da petição após salvar rascunho
          setTimeout(() => {
            navigate(`/abaixo-assinado/${petition.id}`);
          }, 1500);
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
      
      localStorage.removeItem(STORAGE_KEY);
      setIsDirty(false);
      
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

  const handleDeletePetition = async () => {
    if (!confirm("Tem certeza que deseja excluir permanentemente esta petição? Esta ação não pode ser desfeita.")) return;

    setLoading(true);
    try {
      // 1. Se estiver vinculada a uma bronca, atualizar a flag is_petition
      if (petition.report_id) {
        await supabase
          .from('reports')
          .update({ is_petition: false })
          .eq('id', petition.report_id);
      }

      // 2. Excluir a petição (as versões e assinaturas devem ser excluídas via cascata no DB, 
      // mas se não forem, o Supabase cuidará das constraints)
      const { error } = await supabase
        .from('petitions')
        .delete()
        .eq('id', petition.id);

      if (error) throw error;

      localStorage.removeItem(STORAGE_KEY);
      toast({ 
        title: "Petição excluída", 
        description: "A petição foi removida permanentemente." 
      });

      if (onCancel) {
        onCancel(); // Voltar para a página anterior
      }
    } catch (error) {
      console.error('Delete error:', error);
      toast({ 
        title: "Erro ao excluir", 
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
    if (hasLongWords(newItemText)) {
      setErrors(prev => ({ ...prev, importance: "O texto contém palavras muito longas (máximo 30 caracteres sem espaços)." }));
      return;
    }
    const newItem = { icon: newItemIcon, text: newItemText.trim() };
    handleChange('importance_list', [...(formData.importance_list || []), newItem]);
    setNewItemText('');
    setErrors(prev => ({ ...prev, importance: null }));
  };

  const handleRemoveImportanceItem = (index) => {
    const newList = [...(formData.importance_list || [])];
    newList.splice(index, 1);
    handleChange('importance_list', newList);
  };

  const availableSteps = [
    ...STEPS.filter(step => step.id !== 'settings' || isAdmin),
    ...(petition.status !== 'draft' ? [
      { id: 'history', label: 'Histórico', icon: History, description: 'Versões anteriores' }
    ] : [])
  ];

  const currentStepIndex = availableSteps.findIndex(s => s.id === activeStep);
  const progress = ((currentStepIndex + 1) / availableSteps.length) * 100;

  // Redirecionar se o passo atual não estiver disponível para o usuário (ex: configurações para não-admin)
  useEffect(() => {
    if (activeStep && availableSteps.length > 0) {
      const stepExists = availableSteps.some(s => s.id === activeStep);
      if (!stepExists) {
        setActiveStep(availableSteps[0].id);
      }
    }
  }, [activeStep, availableSteps]);

  const nextStep = () => {
    if (currentStepIndex < availableSteps.length - 1) {
      // Validation Logic per step
      const currentStepId = availableSteps[currentStepIndex].id;

      if (currentStepId === 'basic') {
          let stepErrors = {};
          if (!formData.title?.trim()) {
              stepErrors.title = "Por favor, adicione um título para sua petição.";
          } else if (hasLongWords(formData.title)) {
              stepErrors.title = "O título contém palavras muito longas (máximo 30 caracteres sem espaços).";
          }

          if (!formData.target?.trim()) {
              stepErrors.target = "Por favor, informe quem deve receber esta petição.";
          } else if (hasLongWords(formData.target)) {
              stepErrors.target = "O destinatário contém palavras muito longas (máximo 30 caracteres sem espaços).";
          }

          if (!formData.goal || formData.goal < 1) {
              stepErrors.goal = "Por favor, defina uma meta válida de assinaturas.";
          }
          
          if (Object.keys(stepErrors).length > 0) {
              setErrors(prev => ({ ...prev, ...stepErrors }));
              return;
          }
      }

      if (currentStepId === 'content') {
          const content = formData.content || '';
          const plainTextContent = content.replace(/<[^>]*>/g, '').trim();
          if (!plainTextContent) {
               setErrors(prev => ({ ...prev, content: "Por favor, conte a história da sua causa." }));
               return;
          }

          if (hasLongWords(content)) {
              setErrors(prev => ({ ...prev, content: "A história contém palavras muito longas (máximo 30 caracteres sem espaços)." }));
              return;
          }

          if (plainTextContent.length < 500) {
              const errorMsg = `A descrição deve ter pelo menos 500 caracteres para continuar. Atual: ${plainTextContent.length}`;
              setErrors(prev => ({ ...prev, content: errorMsg }));
              return;
          }
      }

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
                          className={`text-lg font-medium h-12 pl-4 border-muted-foreground/20 focus-visible:border-primary focus-visible:ring-1 focus-visible:ring-primary/20 transition-all shadow-sm ${errors.title ? 'border-destructive ring-destructive/20' : ''}`}
                          placeholder="Ex: Salve o Parque Central..."
                        />
                        <div id="tour-validation-info">
                            {errors.title && <p className="text-sm text-destructive mt-1 font-medium">{errors.title}</p>}
                        </div>
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
                              className={`pl-10 h-11 border-muted-foreground/20 transition-all focus-visible:ring-primary/20 ${errors.target ? 'border-destructive ring-destructive/20' : ''}`}
                              placeholder="Ex: Prefeito, Secretário..."
                            />
                        </div>
                        {errors.target && <p className="text-sm text-destructive mt-1 font-medium">{errors.target}</p>}
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
                              className={`pl-10 h-11 border-muted-foreground/20 transition-all focus-visible:ring-primary/20 ${errors.goal ? 'border-destructive ring-destructive/20' : ''}`}
                              placeholder="Ex: 1000"
                            />
                        </div>
                        {errors.goal && <p className="text-sm text-destructive mt-1 font-medium">{errors.goal}</p>}
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
                      {errors.content && <p className="text-sm text-destructive mt-1 font-medium">{errors.content}</p>}
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
                  {errors.importance && <p className="text-sm text-destructive mt-2 font-medium">{errors.importance}</p>}
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
                  <CardDescription>
                    Adicione fotos para tornar sua petição mais visual e atraente. 
                    
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="bg-primary/5 p-4 rounded-lg border border-primary/20 flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                    <p className="text-sm text-foreground/80">
                      <strong>Dica:</strong> Você pode usar uma <strong>imagem real</strong> do local/problema ou uma <strong>imagem fictícia/ilustrativa</strong> que guie as pessoas a entenderem e se solidarizarem com sua petição.
                    </p>
                  </div>
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
                  ) : null}
                </CardContent>
              </Card>
            </div>
          );
        case 'preview':
          return (
            <div className="space-y-6">
              <Card className="border-muted/60 shadow-sm">
                <CardHeader>
                  <CardTitle className="text-xl flex items-center gap-2">
                    <CheckCircle2 className="w-5 h-5 text-primary" />
                    Resumo do Envio
                  </CardTitle>
                  <CardDescription>
                    Verifique os dados antes de finalizar sua petição.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-1">
                      <p className="text-sm font-semibold text-muted-foreground">Título</p>
                      <p className="text-base">{formData.title || <span className="text-destructive italic">Não preenchido</span>}</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-sm font-semibold text-muted-foreground">Destinatário</p>
                      <p className="text-base">{formData.target || <span className="text-destructive italic">Não preenchido</span>}</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-sm font-semibold text-muted-foreground">Meta de Assinaturas</p>
                      <p className="text-base">{formData.goal} assinaturas</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-sm font-semibold text-muted-foreground">Imagens</p>
                      <p className="text-base">{formData.gallery.length} foto(s) adicionada(s)</p>
                    </div>
                  </div>

                  <div className="space-y-2 border-t pt-4">
                    <p className="text-sm font-semibold text-muted-foreground">Descrição</p>
                    <div className="text-sm text-foreground/80 bg-muted/30 p-4 rounded-lg line-clamp-4 overflow-hidden italic">
                      {formData.content ? formData.content.replace(/<[^>]*>/g, '').substring(0, 300) + '...' : <span className="text-destructive">Não preenchida</span>}
                    </div>
                  </div>

                  <div className="space-y-2 border-t pt-4">
                    <p className="text-sm font-semibold text-muted-foreground">Destaques</p>
                    <ul className="grid gap-2 sm:grid-cols-2">
                      {formData.importance_list && formData.importance_list.length > 0 ? (
                        formData.importance_list.map((item, idx) => (
                          <li key={idx} className="flex items-center gap-2 text-sm text-foreground/70">
                            <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
                            {item.text}
                          </li>
                        ))
                      ) : (
                        <li className="text-sm text-muted-foreground italic">Nenhum destaque adicionado</li>
                      )}
                    </ul>
                  </div>
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

  const handleBack = () => {
    if (isDirty) {
      if (confirm("Você tem alterações não salvas. Deseja sair sem salvar?")) {
        onCancel();
      }
    } else {
      onCancel();
    }
  };

  if (submitted) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <motion.div 
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="max-w-md w-full text-center space-y-6 bg-card p-8 rounded-3xl shadow-2xl border border-primary/10"
        >
            <div className="w-20 h-20 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-6">
                <CheckCircle2 className="w-12 h-12" />
            </div>
            <h2 className="text-3xl font-bold">Petição Enviada!</h2>
            <p className="text-muted-foreground">
                {isAdmin 
                    ? "Sua petição foi publicada e já está disponível para assinaturas." 
                    : "Sua petição foi enviada para moderação. Você receberá um aviso assim que ela for aprovada."}
            </p>
            <div className="pt-4 space-y-3">
                <Button 
                    className="w-full h-12 rounded-full text-lg" 
                    onClick={() => navigate(`/abaixo-assinado/${petition.id}`)}
                >
                    Ver Petição
                </Button>
                <Button 
                    variant="ghost" 
                    className="w-full h-12 rounded-full" 
                    onClick={() => navigate('/minhas-peticoes')}
                >
                    Minhas Petições
                </Button>
            </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-10">
      {/* Top Bar */}
      <div className="sticky top-0 z-10 bg-background/80 backdrop-blur-md border-b p-4 flex items-center justify-between gap-4 shadow-sm">
        <div className="flex items-center gap-2 md:gap-4 overflow-hidden">
          <Button variant="ghost" size="icon" onClick={handleBack} className="shrink-0">
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
            {!hideDraftOption && (
              <Button variant="outline" onClick={() => handleSave('draft')} disabled={loading}>
                <Save className="w-4 h-4 mr-2" />
                Salvar Rascunho
              </Button>
            )}
            {formData.status !== 'closed' && (
                <Button onClick={() => handleSave('open')} disabled={loading} className="bg-red-500 hover:bg-red-600">
                    <Send className="w-4 h-4 mr-2" />
                    {hideDraftOption ? 'Publicar' : 'Enviar para Moderação'}
                </Button>
            )}
          </div>

          <div className="flex md:hidden items-center gap-1.5">
            {!hideDraftOption && (
              <Button variant="ghost" size="icon" onClick={() => handleSave('draft')} disabled={loading} title="Salvar Rascunho" className="h-9 w-9">
                <Save className="w-5 h-5" />
              </Button>
            )}
            {formData.status !== 'closed' && (
                <Button 
                  size="sm" 
                  onClick={() => handleSave('open')} 
                  disabled={loading} 
                  className="bg-red-500 hover:bg-red-600 text-[11px] px-3 h-9 font-bold"
                >
                    {hideDraftOption ? 'Publicar' : 'Enviar'}
                </Button>
            )}
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
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleDeletePetition} className="text-red-600 cursor-pointer font-semibold">
                    <Trash2 className="w-4 h-4 mr-2" /> Excluir Abaixo-Assinado
                </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="container max-w-5xl mx-auto py-6 md:py-8 space-y-6 md:space-y-8">
        
        {/* Mobile Progress Bar */}
        <div id="tour-step-indicator-mobile" className="md:hidden px-2">
          <div className="flex justify-between text-sm font-medium mb-2 text-muted-foreground">
            <span>Passo {currentStepIndex + 1} de {availableSteps.length}</span>
            <span>{Math.round(progress)}%</span>
          </div>
          <Progress value={progress} className="h-2" />
        </div>

        <div className="flex flex-col md:flex-row gap-8">
          
          {/* Desktop Sidebar Navigation */}
          <aside className="hidden md:block w-64 shrink-0 space-y-2">
            <nav id="tour-step-indicator" className="sticky top-24 space-y-1">
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
            <div className="sticky bottom-0 z-20 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 py-4 border-t mt-8 flex items-center justify-between gap-4 px-4 md:px-0">
              <Button 
                variant="outline" 
                onClick={prevStep} 
                disabled={currentStepIndex === 0}
                className="flex-1 md:flex-none md:w-32 h-12 md:h-10 text-sm md:text-base font-semibold"
              >
                <ChevronLeft className="w-4 h-4 mr-2" />
                Voltar
              </Button>
              
              {currentStepIndex === availableSteps.length - 1 ? (
                <Button 
                  className="flex-1 md:flex-none md:w-auto px-8 h-12 md:h-10 text-sm md:text-base font-bold bg-red-600 hover:bg-red-700 shadow-lg shadow-red-200" 
                  onClick={() => handleSave('open')}
                  disabled={loading}
                >
                  {petition.status === 'open' ? 'Salvar' : (hideDraftOption ? 'Publicar' : 'Enviar para Moderação')} <Send className="w-4 h-4 ml-2" />
                </Button>
              ) : (
                <Button 
                  id="tour-next-step"
                  className="flex-1 md:flex-none md:w-32 h-12 md:h-10 text-sm md:text-base font-semibold" 
                  onClick={nextStep}
                >
                  Próximo <ChevronRight className="w-4 h-4 ml-2" />
                </Button>
              )}
            </div>
          </main>
        </div>
      </div>
      <PetitionTour userId={user?.id} />
    </div>
  );
};

export default PetitionEditor;

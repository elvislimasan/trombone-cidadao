import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Helmet } from 'react-helmet';
import { motion, AnimatePresence } from 'framer-motion';
import { Capacitor } from '@capacitor/core';
import { Share } from '@capacitor/share';
import { 
  ArrowLeft, Share2, Calendar, Target, Users, AlertTriangle, 
  MapPin, Clock, MessageSquare, ThumbsUp, FileSignature, Edit, Download, ShieldCheck, Heart, Megaphone, FileText, Sparkles 
} from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import confetti from 'canvas-confetti';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Card, CardContent } from '@/components/ui/card';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import Header from '@/components/Header';
import DonationModal from '@/components/DonationModal';
import PetitionJourney from '@/components/PetitionJourney';
import PetitionGallery from '@/components/petition/PetitionGallery';
import PetitionEditor from '@/components/petition/PetitionEditor';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import BlockRenderer from '@/components/petition/builder/BlockRenderer';
import PetitionCard from '../components/PetitionCard';

const Counter = ({ value }) => {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let startTimestamp = null;
    const duration = 2000;

    const step = (timestamp) => {
      if (!startTimestamp) startTimestamp = timestamp;
      const progress = Math.min((timestamp - startTimestamp) / duration, 1);
      // Easing function: easeOutQuart
      const ease = 1 - Math.pow(1 - progress, 4);
      setCount(Math.floor(ease * value));
      if (progress < 1) {
        window.requestAnimationFrame(step);
      }
    };

    window.requestAnimationFrame(step);
  }, [value]);

  return <span>{count.toLocaleString('pt-BR')}</span>;
};

const PetitionPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();
  const { user } = useAuth();
  const [petition, setPetition] = useState(null);
  const [loading, setLoading] = useState(true);
  const [hasSigned, setHasSigned] = useState(false);
  const [showDonationModal, setShowDonationModal] = useState(false);
  const [showSignModal, setShowSignModal] = useState(false);
  const [showJourney, setShowJourney] = useState(false);
  const [isEditing, setIsEditing] = useState(searchParams.get('edit') === 'true');
  const [isGuestSign, setIsGuestSign] = useState(false);
  const [recentSignatures, setRecentSignatures] = useState([]);
  const [latestSigners, setLatestSigners] = useState([]);
  const [recentDonations, setRecentDonations] = useState([]);
  const [otherPetitions, setOtherPetitions] = useState([]);
  
  // Guest Sign State
  const [guestForm, setGuestForm] = useState({
    name: '',
    email: '',
    city: 'Floresta-PE',
    isPublic: true,
    allowNotifications: true,
    comment: ''
  });

  const [signForm, setSignForm] = useState({
    city: 'Floresta-PE',
    isPublic: true,
    allowNotifications: true,
    comment: ''
  });
  const [signing, setSigning] = useState(false);

  // --- SEO & Sharing Logic ---
  const getBaseUrl = useCallback(() => {
    let baseUrl;
    if (import.meta.env.VITE_APP_URL) {
      baseUrl = import.meta.env.VITE_APP_URL;
    } else if (Capacitor.isNativePlatform()) {
      baseUrl = 'https://trombonecidadao.com.br';
    } else if (typeof window !== 'undefined') {
      const origin = window.location.origin;
      if (origin.includes('localhost')) {
        baseUrl = origin;
      } else if (origin.includes('trombone-cidadao.vercel.app') || origin.includes('vercel.app')) {
        baseUrl = origin;
      } else if (origin.includes('trombonecidadao.com.br')) {
        baseUrl = 'https://trombonecidadao.com.br';
      } else {
        baseUrl = origin;
      }
    } else {
      baseUrl = 'https://trombonecidadao.com.br';
    }
    return baseUrl.replace(/\/$/, '');
  }, []);

  const baseUrl = useMemo(() => getBaseUrl(), [getBaseUrl]);

  const seoData = useMemo(() => {
    const defaultThumbnail = `${baseUrl}/images/thumbnail.jpg`;
    let petitionImage = defaultThumbnail;

    if (petition) {
      // Prioritize gallery images, then main image
      if (petition.gallery && petition.gallery.length > 0) {
        petitionImage = petition.gallery[0];
      } else if (petition.image_url) {
        petitionImage = petition.image_url;
      }

      // Ensure absolute URL
      if (petitionImage && !petitionImage.startsWith('http')) {
        petitionImage = `${baseUrl}${petitionImage.startsWith('/') ? '' : '/'}${petitionImage}`;
      }

      // Optimize image for OG (1200x630 approx) using wsrv.nl
      if (petitionImage && petitionImage !== defaultThumbnail) {
        try {
          const cleanUrl = petitionImage.split('?')[0];
          petitionImage = `https://wsrv.nl/?url=${encodeURIComponent(cleanUrl)}&w=1200&h=630&fit=cover&q=80&output=jpg`;
        } catch (e) {
          console.error("Error generating OG image URL", e);
        }
      }
    }

    if (!petitionImage || petitionImage.trim() === '') {
      petitionImage = defaultThumbnail;
    }

    return {
      title: petition?.title || 'Abaixo-Assinado - Trombone Cidadão',
      description: petition?.description ? (petition.description.length > 150 ? petition.description.substring(0, 150) + '...' : petition.description) : 'Assine esta petição e ajude a fazer a diferença!',
      image: petitionImage,
      url: `${baseUrl}/abaixo-assinado/${id}`,
    };
  }, [baseUrl, petition, id]);

  // Update meta tags manually for better compatibility
  useEffect(() => {
    const { title, description, image, url } = seoData;
    if (!image) return;

    const updateMetaTags = () => {
      // Remove existing tags to avoid duplicates
      const selectorsToRemove = [
        'meta[property="og:image"]',
        'meta[property="og:image:url"]',
        'meta[property="og:image:width"]',
        'meta[property="og:image:height"]',
        'meta[property="og:image:type"]',
        'meta[property="og:image:alt"]',
        'meta[property="og:title"]',
        'meta[property="og:description"]',
        'meta[property="og:url"]',
        'meta[name="twitter:card"]',
        'meta[name="twitter:title"]',
        'meta[name="twitter:description"]',
        'meta[name="twitter:image"]',
        'meta[name="twitter:image:alt"]',
        'meta[name="image"]',
        'link[rel="image_src"]',
      ];
      
      selectorsToRemove.forEach(selector => {
        document.querySelectorAll(selector).forEach(el => el.remove());
      });

      // Create new tags
      const metaTags = [
        { property: 'property', value: 'og:title', content: title },
        { property: 'property', value: 'og:description', content: description },
        { property: 'property', value: 'og:url', content: url },
        { property: 'property', value: 'og:image', content: image },
        { property: 'property', value: 'og:image:url', content: image },
        { property: 'property', value: 'og:image:width', content: '1200' },
        { property: 'property', value: 'og:image:height', content: '630' },
        { property: 'property', value: 'og:image:type', content: 'image/jpeg' },
        { property: 'property', value: 'og:image:alt', content: title },
        { property: 'name', value: 'twitter:card', content: 'summary_large_image' },
        { property: 'name', value: 'twitter:title', content: title },
        { property: 'name', value: 'twitter:description', content: description },
        { property: 'name', value: 'twitter:image', content: image },
        { property: 'name', value: 'image', content: image },
      ];

      metaTags.forEach(({ property, value, content }) => {
        const element = document.createElement('meta');
        if (property.name) {
            element.setAttribute('name', property.value);
        } else {
            element.setAttribute('property', property.value);
        }
        element.setAttribute('content', content);
        document.head.insertBefore(element, document.head.firstChild);
      });

      const imageSrcLink = document.createElement('link');
      imageSrcLink.setAttribute('rel', 'image_src');
      imageSrcLink.setAttribute('href', image);
      document.head.insertBefore(imageSrcLink, document.head.firstChild);
    };

    updateMetaTags();
    const timers = [
      setTimeout(updateMetaTags, 100),
      setTimeout(updateMetaTags, 500),
      setTimeout(updateMetaTags, 1000),
    ];
    return () => timers.forEach(clearTimeout);
  }, [seoData]);

  const fetchPetition = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true);
    const { data, error } = await supabase
      .from('petitions')
      .select('*, report:reports(*), signatures:signatures(count), updates:petition_updates(*)')
      .eq('id', id)
      .single();

    if (error) {
      toast({ title: "Erro ao carregar petição", description: error.message, variant: "destructive" });
      navigate('/');
    } else {
      setPetition({
        ...data,
        signatureCount: data.signatures[0]?.count || 0
      });

      // Fetch recent signatures with comments (Testimonials)
      const { data: sigs } = await supabase
        .from('signatures')
        .select('name, city, created_at, comment, is_public')
        .eq('petition_id', id)
        .neq('comment', '')
        .not('comment', 'is', null)
        .order('created_at', { ascending: false })
        .limit(10);
      
      setRecentSignatures(sigs || []);

      // Fetch latest signers (just list)
      const { data: lastSigners } = await supabase
        .from('signatures')
        .select('name, city, created_at, is_public')
        .eq('petition_id', id)
        .order('created_at', { ascending: false })
        .limit(10);
      setLatestSigners(lastSigners || []);

      // Fetch recent donations (Contributors)
      const { data: donations } = await supabase
        .from('donations')
        .select('amount, created_at, user_id, profiles(name)')
        .eq('petition_id', id)
        .eq('status', 'paid')
        .order('created_at', { ascending: false })
        .limit(5);
      setRecentDonations(donations || []);

      // Fetch other open petitions
      const { data: others } = await supabase
        .from('petitions')
        .select('id, title, image_url, goal, signatures(count)')
        .eq('status', 'open')
        .neq('id', id)
        .limit(3);
      setOtherPetitions(others || []);
      
      // Check if user has signed
      if (user) {
        const { data: signature } = await supabase
          .from('signatures')
          .select('id')
          .eq('petition_id', id)
          .eq('user_id', user.id)
          .maybeSingle();
        
        setHasSigned(!!signature);
      }
    }
    if (showLoading) setLoading(false);
  }, [id, user, navigate, toast]);

  useEffect(() => {
    fetchPetition();
    window.scrollTo(0, 0);
  }, [fetchPetition, id]);

  const handleUpdate = (updatedPetition) => {
    setPetition(prev => ({ ...prev, ...updatedPetition }));
    setIsEditing(false);
  };

  const handleSignClick = async () => {
    if (hasSigned) {
      toast({ title: "Já assinado", description: "Você já assinou esta petição." });
      return;
    }

    if (user) {
        try {
            setSigning(true);
            const userCity = user.user_metadata?.city || 'Floresta-PE';
            const userName = user.user_metadata?.name || 'Cidadão';
            
            const { error } = await supabase
                .from('signatures')
                .insert({
                    petition_id: id,
                    report_id: petition?.report_id,
                    user_id: user.id,
                    city: userCity,
                    is_public: true,
                    allow_notifications: true,
                    comment: '' // No comment for one-click for now, or could ask later
                });

            if (error) throw error;

            confetti({
              particleCount: 150,
              spread: 70,
              origin: { y: 0.6 },
              colors: ['#EF4444', '#F59E0B', '#10B981', '#3B82F6']
            });

            toast({ title: "Assinado com sucesso! 🎉", description: "Obrigado pelo seu apoio." });
            setHasSigned(true);
            setPetition(prev => ({ ...prev, signatureCount: prev.signatureCount + 1 }));
            setShowJourney(true);

            // Send confirmation email (fire and forget)
            if (user.email) {
              console.log('Enviando email de confirmação para:', user.email);
              supabase.functions.invoke('send-signature-confirmation', {
                body: {
                  email: user.email,
                  name: userName,
                  petitionTitle: petition.title,
                  petitionUrl: window.location.href
                }
              }).then(({ data, error }) => {
                if (error) console.error('Erro ao enviar email (Function):', error);
                else console.log('Email enviado com sucesso:', data);
              }).catch(err => console.error('Erro ao invocar função de email:', err));
            }

        } catch (error) {
            console.error("One click sign error:", error);
            toast({ title: "Erro ao assinar", description: error.message, variant: "destructive" });
        } finally {
            setSigning(false);
        }
    } else {
        setShowSignModal(true);
    }
  };

  const handleGuestSign = async () => {
      if (!guestForm.name || !guestForm.email || !guestForm.city) {
          toast({ title: "Campos obrigatórios", description: "Por favor preencha nome, email e cidade.", variant: "destructive" });
          return;
      }

      try {
          setSigning(true);
          
          // Direct insert for guest signature (requires migration 024)
          const { error: signError } = await supabase
              .from('signatures')
              .insert({
                  petition_id: id,
                  report_id: petition?.report_id,
                  user_id: null, // Guest
                  name: guestForm.name,
                  email: guestForm.email,
                  city: guestForm.city,
                  is_public: guestForm.isPublic,
                  allow_notifications: guestForm.allowNotifications,
                  comment: guestForm.comment
              });

          if (signError) {
             if (signError.code === '23505') { // Unique violation
                 throw new Error("Este email já assinou esta petição.");
             }
             throw signError;
          }

          confetti({
            particleCount: 150,
            spread: 70,
            origin: { y: 0.6 },
            colors: ['#EF4444', '#F59E0B', '#10B981', '#3B82F6']
          });

          toast({ title: "Assinado com sucesso! 🎉", description: "Obrigado pelo seu apoio." });
          setHasSigned(true);
          setPetition(prev => ({ ...prev, signatureCount: prev.signatureCount + 1 }));
          setShowSignModal(false);
          setIsGuestSign(true);
          setShowJourney(true);

          // Send confirmation email (fire and forget)
          console.log('Enviando email de confirmação (Guest) para:', guestForm.email);
          supabase.functions.invoke('send-signature-confirmation', {
            body: {
              email: guestForm.email,
              name: guestForm.name,
              petitionTitle: petition.title,
              petitionUrl: window.location.href
            }
          }).then(({ data, error }) => {
            if (error) console.error('Erro ao enviar email (Function Guest):', error);
            else console.log('Email enviado com sucesso (Guest):', data);
          }).catch(err => console.error('Erro ao invocar função de email (Guest):', err));

      } catch (error) {
          toast({ title: "Erro ao assinar", description: error.message, variant: "destructive" });
      } finally {
          setSigning(false);
      }
  };

  const handleConfirmSign = async () => {
     try {
       setSigning(true);
       const { error } = await supabase
         .from('signatures')
         .insert({
           petition_id: id,
           user_id: user.id,
           city: signForm.city,
           is_public: signForm.isPublic,
           allow_notifications: signForm.allowNotifications,
           comment: signForm.comment
         });
 
       if (error) throw error;
 
       confetti({
         particleCount: 150,
         spread: 70,
         origin: { y: 0.6 },
         colors: ['#EF4444', '#F59E0B', '#10B981', '#3B82F6']
       });

       toast({ title: "Assinado com sucesso! 🎉", description: "Obrigado pelo seu apoio." });
       setHasSigned(true);
       setPetition(prev => ({ ...prev, signatureCount: prev.signatureCount + 1 }));
       setShowSignModal(false);
       setShowJourney(true);

       // Send confirmation email (fire and forget)
       if (user.email) {
          console.log('Enviando email de confirmação (Logged) para:', user.email);
          const userName = user.user_metadata?.name || 'Cidadão';
          supabase.functions.invoke('send-signature-confirmation', {
            body: {
              email: user.email,
              name: userName,
              petitionTitle: petition.title,
              petitionUrl: window.location.href
            }
          }).then(({ data, error }) => {
            if (error) console.error('Erro ao enviar email (Function Logged):', error);
            else console.log('Email enviado com sucesso (Logged):', data);
          }).catch(err => console.error('Erro ao invocar função de email (Logged):', err));
       }

     } catch (error) {
       toast({ title: "Erro ao assinar", description: error.message, variant: "destructive" });
     } finally {
       setSigning(false);
     }
  };

  const handleExportPDF = async () => {
    try {
      toast({ title: "Gerando PDF...", description: "Aguarde enquanto preparamos o documento." });
      
      const doc = new jsPDF();
      
      // Title
      doc.setFontSize(20);
      doc.text(petition.title, 14, 22);
      
      // Target
      if (petition.target) {
        doc.setFontSize(12);
        doc.setTextColor(100);
        doc.text(`Para: ${petition.target}`, 14, 32);
      }
      
      // Stats
      doc.setFontSize(10);
      doc.setTextColor(0);
      doc.text(`Total de Assinaturas: ${petition.signatureCount}`, 14, 42);
      doc.text(`Gerado em: ${new Date().toLocaleDateString('pt-BR')}`, 14, 48);

      // Fetch signatures
      const { data: signatures, error } = await supabase
        .from('signatures')
        .select('name, city, created_at, comment')
        .eq('petition_id', id)
        .order('created_at', { ascending: false })
        .limit(1000);

      if (error) throw error;

      // Table
      autoTable(doc, {
        startY: 55,
        head: [['Nome', 'Cidade', 'Data', 'Comentário']],
        body: signatures.map(sig => [
          sig.name || 'Anônimo',
          sig.city || '-',
          new Date(sig.created_at).toLocaleDateString('pt-BR'),
          sig.comment || '-'
        ]),
      });

      doc.save(`abaixo-assinado-${id}.pdf`);
      toast({ title: "PDF baixado!", description: "O arquivo foi salvo no seu dispositivo." });

    } catch (error) {
      console.error('Error exporting PDF:', error);
      toast({ title: "Erro ao exportar", description: error.message, variant: "destructive" });
    }
  };

  const handleShare = async () => {
    // Determine base URL for sharing
    let shareBaseUrl = baseUrl;
    // Force correct URL for sharing based on environment to ensure links work
    if (shareBaseUrl.includes('localhost') || shareBaseUrl.includes('127.0.0.1')) {
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
        if (supabaseUrl.includes('xxdletrjyjajtrmhwzev')) {
             // Development Environment
             shareBaseUrl = 'https://trombone-cidadao.vercel.app';
        } else {
             // Production Environment (default fallback)
             shareBaseUrl = 'https://trombonecidadao.com.br';
        }
    }

    // Use the smart share URL that passes through Vercel Rewrite -> Edge Function
    // This ensures correct Open Graph tags are served for WhatsApp/Facebook
    const smartShareUrl = `${shareBaseUrl}/share/abaixo-assinado/${id}`;

    const shareData = {
      title: petition.title,
      // text: `Assine esta petição: ${petition.title}`, // Removido para garantir que o card apareça limpo no WhatsApp
      url: smartShareUrl,
      dialogTitle: 'Compartilhar Petição',
    };

    try {
      if (Capacitor.isNativePlatform()) {
        await Share.share(shareData);
      } else {
        if (navigator.share) {
          await navigator.share(shareData);
        } else {
          await navigator.clipboard.writeText(shareData.url);
          toast({ title: "Link copiado!", description: "Cole nas suas redes sociais." });
        }
      }
    } catch (error) {
      console.error('Error sharing:', error);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col">
        <Header />
        <div className="flex-1 flex items-center justify-center">
          <p>Carregando...</p>
        </div>
      </div>
    );
  }

  if (!petition) return null;

  // Check permissions and status
  const canEdit = user && (user.id === petition.author_id || user.is_admin);
  const isExpired = petition.deadline && new Date(petition.deadline) < new Date();
  const donationEnabled = petition.donation_enabled !== false && petition.status !== 'closed' && !isExpired;
  const donationOptions = petition.donation_options || [10, 20, 50, 100];

  // Access control for drafts
  if (petition.status === 'draft' && !canEdit) {
    return (
       <div className="min-h-screen flex flex-col bg-background">
         <Header />
         <div className="flex-1 flex flex-col items-center justify-center p-4 text-center">
           <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mb-4">
             <ShieldCheck className="w-8 h-8 text-muted-foreground" />
           </div>
           <h1 className="text-2xl font-bold mb-2">Página Indisponível</h1>
           <p className="text-muted-foreground mb-6 max-w-md">
             Esta campanha não existe ou está indisponível no momento.
           </p>
           
         </div>
       </div>
    );
  }

  if (isEditing) {
    return <PetitionEditor petition={petition} onSave={handleUpdate} onCancel={() => setIsEditing(false)} />;
  }

  const progress = Math.min((petition.signatureCount / petition.goal) * 100, 100);
  const progressColor = progress >= 80 ? "bg-red-500" : progress >= 50 ? "bg-yellow-500" : "bg-primary";

  // Prepare images for gallery
  const galleryImages = petition.gallery && petition.gallery.length > 0 
    ? petition.gallery 
    : (petition.image_url ? [petition.image_url] : []);

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Helmet>
        <title>{seoData.title}</title>
        <meta name="description" content={seoData.description} />
      </Helmet>

      <Header />

      {petition.status === 'closed' && (
        <div className="bg-muted text-muted-foreground p-4 text-center font-medium border-b flex items-center justify-center gap-2">
           <ShieldCheck className="w-5 h-5" />
           Esta campanha foi encerrada/concluída pelo autor.
        </div>
      )}

      {isExpired && petition.status !== 'closed' && (
        <div className="bg-amber-100 text-amber-800 p-4 text-center font-medium border-b flex items-center justify-center gap-2">
           <Clock className="w-5 h-5" />
           O prazo para assinaturas desta campanha encerrou.
        </div>
      )}

      <main className="flex-1 container mx-auto px-4 sm:px-6 lg:px-8 py-8 max-w-6xl xl:max-w-7xl pb-24 lg:pb-8">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 ">
          
          {canEdit && (
            <div className="flex gap-3 w-full sm:w-auto">
              <Button variant="outline" onClick={handleExportPDF} className="flex-1 sm:flex-none whitespace-nowrap shadow-sm bg-background">
                <Download className="w-4 h-4 mr-2" />
                Baixar PDF
              </Button>
              <Button onClick={() => setIsEditing(true)} className="flex-1 sm:flex-none whitespace-nowrap font-bold shadow-md">
                <Edit className="w-4 h-4 mr-2" />
                Editar Página
              </Button>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12">
          {/* Main Content */}
          <div className="lg:col-span-7 space-y-8">
            {petition.layout && petition.layout.length > 0 ? (
              <div className="space-y-4">
                 {petition.layout.map(block => (
                   <BlockRenderer 
                    key={block.id} 
                    block={block} 
                    onAction={(action) => {
                        if (action === 'sign') handleSignClick();
                    }}
                   />
                 ))}
                 
                 <Separator className="my-8" />
                 <div className="space-y-6">
                    <h3 className="text-xl font-bold flex items-center gap-2">
                      <MessageSquare className="w-5 h-5" />
                      Razões para assinar
                    </h3>
                    <div className="grid gap-4">
                      {recentSignatures.length > 0 ? (
                        recentSignatures.map((sig, i) => (
                          <div key={i} className="flex gap-4 p-4 rounded-lg bg-card border border-border/50 shadow-sm">
                            <Avatar className="w-10 h-10 border-2 border-background">
                              <AvatarFallback className="bg-primary/20 text-primary font-bold">
                                {sig.is_public ? (sig.name ? sig.name.substring(0, 2).toUpperCase() : 'AN') : 'AN'}
                              </AvatarFallback>
                            </Avatar>
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <span className="font-semibold text-sm">
                                  {sig.is_public ? (sig.name || 'Anônimo') : 'Apoiador Anônimo'}
                                </span>
                                <span className="text-xs text-muted-foreground">• {sig.city || 'Brasil'}</span>
                                <span className="text-xs text-muted-foreground">• {formatDistanceToNow(new Date(sig.created_at), { addSuffix: true, locale: ptBR })}</span>
                              </div>
                              {sig.comment && (
                                <p className="text-sm text-foreground/90 italic">"{sig.comment}"</p>
                              )}
                            </div>
                          </div>
                        ))
                      ) : (
                        <p className="text-muted-foreground italic">Seja o primeiro a deixar um comentário!</p>
                      )}
                    </div>
                  </div>
               </div>
            ) : (
              <>
                {/* Mobile Unified Card Layout */}
                <div className="lg:hidden bg-card border rounded-xl shadow-sm overflow-hidden mb-8">
                    <div className="p-5 pb-2">
                        <h1 className="text-2xl font-bold text-foreground leading-tight mb-2">
                            {petition.title}
                        </h1>
                    </div>

                    {galleryImages.length > 0 && (
                        <div className="w-full">
                             <PetitionGallery images={galleryImages} className="w-full" />
                        </div>
                    )}

                    <div className="p-5 space-y-6">
                        {/* Progress and Stats */}
                        <div>
                            <div className="flex items-end gap-2 mb-2">
                                <span className="text-4xl font-bold text-primary">{petition.signatureCount}</span>
                                <span className="text-muted-foreground pb-1">assinaturas</span>
                            </div>
                            <Progress value={progress} className="h-2 mb-2" indicatorClassName={progressColor} />
                            <div className="flex justify-between text-xs font-medium text-muted-foreground">
                                <span>{Math.round(progress)}% da meta</span>
                                <span>Meta: {petition.goal}</span>
                            </div>
                        </div>

                        {/* Action Buttons */}
                        <div className="space-y-3">
                             <Button size="lg" className="w-full text-lg font-bold shadow-md h-12" onClick={handleSignClick} disabled={hasSigned || petition.status !== 'open'}>
                                {hasSigned ? (
                                    <>
                                      <FileSignature className="w-5 h-5 mr-2" />
                                      Assinado!
                                    </>
                                ) : (
                                    <>
                                      <FileSignature className="w-5 h-5 mr-2" />
                                      Assinar Agora
                                    </>
                                )}
                             </Button>
                             <Button variant="outline" size="lg" className="w-full h-12" onClick={handleShare}>
                                <Share2 className="w-5 h-5 mr-2" />
                                Compartilhar
                             </Button>
                        </div>
                        
                         {/* Security Note */}
                         <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
                            <ShieldCheck className="w-4 h-4 text-green-600" />
                            <span>Assinatura segura e verificada</span>
                         </div>
                    </div>
                    
                </div>

                {/* Desktop Title & Gallery (Hidden on Mobile) */}
                <div className="hidden lg:block space-y-8">
                    <h1 className="text-4xl 2xl:text-5xl font-bold text-foreground leading-tight">
                      {petition.title}
                    </h1>
                  
                    {galleryImages.length > 0 && (
                      <PetitionGallery images={galleryImages} />
                    )}
                </div>

                {/* History Section */}
                <motion.section 
                  className="mt-10 space-y-8"
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-100px" }}
                  transition={{ duration: 0.6 }}
                >
                   <div className="flex items-center gap-3 border-b pb-4">
                      <div className="p-2 bg-primary/10 rounded-lg text-primary">
                         <FileText className="w-6 h-6" />
                      </div>
                      <h2 className="text-2xl md:text-3xl font-bold text-foreground">A História</h2>
                   </div>
                   
                   {petition.target && (
                      <div className="flex items-center text-sm text-muted-foreground bg-muted/50 p-3 rounded-lg border border-border/50 w-fit">
                        <Target className="w-4 h-4 mr-2 text-primary" />
                        <span className="font-medium mr-1">Destinatário:</span>
                        <span className="font-semibold text-foreground">{petition.target}</span>
                      </div>
                   )}

                   <div className="prose dark:prose-invert max-w-none prose-lg text-foreground/90 leading-relaxed">
                      {petition.content ? (
                        <div dangerouslySetInnerHTML={{ __html: petition.content }} />
                      ) : (
                        <p className="whitespace-pre-line">
                          {petition.description}
                        </p>
                      )}
                   </div>
                   
                   <Separator className="my-8" />
                    
                   <div className="space-y-6">
                      <h3 className="text-xl font-bold flex items-center gap-2">
                        <MessageSquare className="w-5 h-5 text-primary" />
                        Razões para assinar
                      </h3>
                      
                      <div className="grid gap-4">
                        {recentSignatures.length > 0 ? (
                          recentSignatures.map((sig, i) => (
                            <motion.div 
                              key={i} 
                              className="flex gap-4 p-4 rounded-xl bg-card border border-border/50 shadow-sm hover:shadow-md transition-shadow"
                              initial={{ opacity: 0, x: -20 }}
                              whileInView={{ opacity: 1, x: 0 }}
                              viewport={{ once: true }}
                              transition={{ delay: i * 0.1 }}
                            >
                              <Avatar className="w-10 h-10 border-2 border-background ring-2 ring-primary/10">
                                <AvatarFallback className="bg-primary/10 text-primary font-bold">
                                  {sig.is_public ? (sig.name ? sig.name.substring(0, 2).toUpperCase() : 'AN') : 'AN'}
                                </AvatarFallback>
                              </Avatar>
                              <div className="space-y-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="font-semibold text-sm text-foreground">
                                    {sig.is_public ? (sig.name || 'Anônimo') : 'Apoiador Anônimo'}
                                  </span>
                                  <span className="text-xs text-muted-foreground">• {sig.city || 'Brasil'}</span>
                                  <span className="text-xs text-muted-foreground">• {formatDistanceToNow(new Date(sig.created_at), { addSuffix: true, locale: ptBR })}</span>
                                </div>
                                {sig.comment && (
                                  <p className="text-sm text-foreground/80 italic">"{sig.comment}"</p>
                                )}
                              </div>
                            </motion.div>
                          ))
                        ) : (
                          <div className="text-center py-8 bg-muted/20 rounded-xl border border-dashed">
                             <MessageSquare className="w-8 h-8 mx-auto mb-2 text-muted-foreground/50" />
                             <p className="text-muted-foreground italic">Seja o primeiro a deixar um comentário!</p>
                          </div>
                        )}
                      </div>
                   </div>
                </motion.section>

                {/* Updates Section (Mobile Only) */}
                <motion.section 
                  className="mt-16 space-y-8 lg:hidden"
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-100px" }}
                  transition={{ duration: 0.6, delay: 0.2 }}
                >
                   <div className="flex items-center justify-between border-b pb-4">
                      <div className="flex items-center gap-3">
                         <div className="p-2 bg-primary/10 rounded-lg text-primary">
                            <Megaphone className="w-6 h-6" />
                         </div>
                         <h2 className="text-2xl md:text-3xl font-bold text-foreground">Novidades</h2>
                      </div>
                      {petition.updates && petition.updates.length > 0 && (
                         <span className="bg-primary/10 text-primary text-sm px-3 py-1 rounded-full font-bold">{petition.updates.length}</span>
                      )}
                   </div>

                   <div className="space-y-6">
                    {petition.updates && petition.updates.length > 0 ? (
                      petition.updates
                        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
                        .map((update) => (
                        <Card key={update.id} className="overflow-hidden border-border/50 hover:border-primary/30 transition-colors shadow-sm">
                          {update.image_url && (
                            <div className="w-full h-48 md:h-64 overflow-hidden relative group">
                              <img src={update.image_url} alt={update.title} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
                              <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                            </div>
                          )}
                          <CardContent className="p-6 md:p-8">
                            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-3">
                              <Calendar className="w-4 h-4" />
                              {formatDistanceToNow(new Date(update.created_at), { addSuffix: true, locale: ptBR })}
                            </div>
                            <h3 className="text-2xl font-bold mb-4 text-foreground">{update.title}</h3>
                            <div className="prose dark:prose-invert max-w-none text-muted-foreground">
                              <p className="whitespace-pre-line leading-relaxed">{update.content}</p>
                            </div>
                          </CardContent>
                        </Card>
                      ))
                    ) : (
                      <div className="text-center py-16 bg-muted/20 rounded-2xl border border-dashed">
                        <div className="w-16 h-16 bg-muted/50 rounded-full flex items-center justify-center mx-auto mb-4">
                           <Clock className="w-8 h-8 text-muted-foreground/50" />
                        </div>
                        <h3 className="font-semibold text-xl mb-2 text-foreground">Nenhuma novidade ainda</h3>
                        <p className="text-muted-foreground max-w-md mx-auto">O autor ainda não publicou atualizações sobre esta petição. Fique ligado!</p>
                      </div>
                    )}
                   </div>
                </motion.section>


              </>
            )}
          </div>

                {/* Sidebar */}
          <div className="hidden lg:block lg:col-span-5 space-y-6">
            <div className="sticky top-24 space-y-6">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
              >
                <Card className="shadow-xl border-primary/20 ring-1 ring-black/5 overflow-hidden relative">
                  {/* Decorative background element */}
                  <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-bl-full -z-0 pointer-events-none" />
                  
                  <CardContent className="pt-6 space-y-6 relative z-10">
                    <div>
                      <div className="flex items-end gap-2 mb-2">
                        <span className="text-5xl font-bold text-primary tracking-tight">
                          <Counter value={petition.signatureCount} />
                        </span>
                      </div>
                      <p className="text-muted-foreground font-medium mb-4">
                        pessoas já assinaram. Ajude a chegar em <span className="text-foreground font-bold">{petition.goal.toLocaleString('pt-BR')}</span>!
                      </p>
                      
                      <div className="relative">
                        <Progress value={progress} className="h-3 mb-2 bg-primary/20" indicatorClassName={progressColor} />
                        {/* Shimmer effect on progress bar */}
                        <motion.div 
                          className="absolute top-0 left-0 bottom-0 w-full h-full bg-gradient-to-r from-transparent via-white/30 to-transparent z-20 pointer-events-none"
                          initial={{ x: '-100%' }}
                          animate={{ x: '100%' }}
                          transition={{ repeat: Infinity, duration: 2, ease: "linear", repeatDelay: 1 }}
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                      
                      <div className="flex justify-between text-xs font-semibold text-muted-foreground">
                        <span>{Math.round(progress)}% da meta</span>
                        <span>{petition.goal.toLocaleString('pt-BR')} assinaturas</span>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                        <Button 
                          size="lg" 
                          className={`w-full text-lg font-bold shadow-md transition-all relative overflow-hidden group ${
                            !hasSigned && petition.status === 'open' && !isExpired ? 'animate-pulse-subtle' : ''
                          }`}
                          onClick={handleSignClick}
                          disabled={hasSigned || petition.status !== 'open' || isExpired}
                        >
                          <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300" />
                          <div className="relative flex items-center justify-center">
                            {hasSigned ? (
                              <>
                                <FileSignature className="w-5 h-5 mr-2" />
                                Assinado!
                              </>
                            ) : (
                              <>
                                <FileSignature className="w-5 h-5 mr-2" />
                                {isExpired ? 'Prazo Encerrado' : 'Assinar Agora'}
                              </>
                            )}
                          </div>
                        </Button>
                      </motion.div>
                      
                      <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                        <Button variant="outline" size="lg" className="w-full border-primary/20 hover:bg-primary/5 hover:text-primary transition-colors" onClick={handleShare}>
                          <Share2 className="w-4 h-4 mr-2" />
                          Compartilhar
                        </Button>
                      </motion.div>

                      <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground pt-2">
                        <ShieldCheck className="w-4 h-4 text-green-600" />
                        <span>Assinatura segura e verificada</span>
                      </div>
                    </div>
                    
                    <div className="pt-4 border-t border-border bg-muted/30 -mx-6 px-6 pb-6 -mb-6 mt-4">
                      <h4 className="font-semibold mb-3 flex items-center gap-2 text-sm pt-4">
                        <Sparkles className="w-4 h-4 text-primary" />
                        Por que isso importa?
                      </h4>
                      <ul className="space-y-3 text-sm text-muted-foreground">
                        <li className="flex items-start gap-3">
                          <div className="p-1 bg-primary/10 rounded-full shrink-0">
                            <Users className="w-3 h-3 text-primary" />
                          </div>
                          <span>Mostra força coletiva para mudança</span>
                        </li>
                        <li className="flex items-start gap-3">
                          <div className="p-1 bg-primary/10 rounded-full shrink-0">
                            <Target className="w-3 h-3 text-primary" />
                          </div>
                          <span>Pressiona autoridades competentes</span>
                        </li>
                        <li className="flex items-start gap-3">
                          <div className="p-1 bg-primary/10 rounded-full shrink-0">
                            <AlertTriangle className="w-3 h-3 text-primary" />
                          </div>
                          <span>Cria visibilidade para o problema</span>
                        </li>
                      </ul>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>

              {donationEnabled && (
                <motion.div
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.1, duration: 0.5 }}
                >
                  <Card className="shadow-lg border-red-200 bg-gradient-to-br from-red-50 to-white dark:from-red-950/20 dark:to-card overflow-hidden group">
                    <CardContent className="pt-6 space-y-4">
                      <div className="flex items-center gap-2 text-red-600 font-bold text-lg group-hover:scale-105 transition-transform origin-left">
                        <div className="p-2 bg-red-100 dark:bg-red-900/40 rounded-full">
                          <Heart className="w-5 h-5 fill-red-600" />
                        </div>
                        <span>Apoie esta causa</span>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        Sua contribuição ajuda a impulsionar este abaixo-assinado para mais pessoas.
                      </p>
                      <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                        <Button 
                          className="w-full bg-red-600 hover:bg-red-700 text-white font-bold shadow-md shadow-red-200 dark:shadow-none"
                          onClick={() => setShowDonationModal(true)}
                        >
                          Contribuir Financeiramente
                        </Button>
                      </motion.div>
                    </CardContent>
                  </Card>
                </motion.div>
              )}

              {/* Updates Widget (Desktop) */}
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.15, duration: 0.5 }}
              >
                 <Card className="shadow-sm border-border/50 overflow-hidden">
                    <div className="p-4 pb-2 border-b bg-muted/20 flex justify-between items-center">
                      <h3 className="font-bold flex items-center gap-2 text-foreground text-sm">
                         <Megaphone className="w-4 h-4 text-primary" />
                         Novidades
                      </h3>
                      {petition.updates && petition.updates.length > 0 && (
                         <span className="bg-primary/10 text-primary text-xs px-2 py-0.5 rounded-full font-bold">{petition.updates.length}</span>
                      )}
                    </div>
                    
                    <div className="max-h-[400px] overflow-y-auto custom-scrollbar">
                      {petition.updates && petition.updates.length > 0 ? (
                        <div className="divide-y divide-border/50">
                          {petition.updates
                            .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
                            .map((update) => (
                              <div key={update.id} className="p-4 hover:bg-muted/10 transition-colors">
                                <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
                                  <Calendar className="w-3 h-3" />
                                  {formatDistanceToNow(new Date(update.created_at), { addSuffix: true, locale: ptBR })}
                                </div>
                                <h4 className="font-bold text-base mb-2 text-foreground line-clamp-2">{update.title}</h4>
                                {update.image_url && (
                                  <div className="mb-3 rounded-md overflow-hidden h-32 w-full">
                                    <img src={update.image_url} alt={update.title} className="w-full h-full object-cover" />
                                  </div>
                                )}
                                <p className="text-sm text-muted-foreground line-clamp-4 whitespace-pre-line">{update.content}</p>
                              </div>
                            ))}
                        </div>
                      ) : (
                        <div className="p-6 text-center">
                           <div className="w-10 h-10 bg-muted/50 rounded-full flex items-center justify-center mx-auto mb-3">
                              <Clock className="w-5 h-5 text-muted-foreground/50" />
                           </div>
                           <p className="text-sm text-muted-foreground">Nenhuma novidade publicada ainda.</p>
                        </div>
                      )}
                    </div>
                 </Card>
              </motion.div>

              {recentDonations.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.2, duration: 0.5 }}
                >
                  <Card className="shadow-sm border-red-100 dark:border-red-900/30">
                    <div className="p-4 pb-2 border-b border-red-100 dark:border-red-900/30 bg-red-50/30 dark:bg-red-950/10">
                      <h3 className="font-bold flex items-center gap-2 text-foreground text-sm">
                         <Heart className="w-4 h-4 text-red-600 dark:text-red-400" />
                         Últimos Apoiadores
                      </h3>
                    </div>
                    <div className="p-4 space-y-4">
                      {recentDonations.slice(0, 5).map((donation, i) => (
                        <motion.div 
                          key={i} 
                          className="flex items-center gap-3"
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: 0.3 + (i * 0.1) }}
                        >
                           <div className="w-8 h-8 rounded-full bg-red-100 dark:bg-red-900/50 flex items-center justify-center shrink-0">
                              <Heart className="w-4 h-4 text-red-600 dark:text-red-400 fill-current" />
                           </div>
                           <div className="flex-1 min-w-0 overflow-hidden">
                             <p className="text-sm font-medium truncate text-foreground">
                               {donation.profiles?.name || 'Apoiador Anônimo'}
                             </p>
                             <p className="text-xs text-muted-foreground">
                               Contribuiu com a causa
                             </p>
                           </div>
                        </motion.div>
                      ))}
                    </div>
                  </Card>
                </motion.div>
              )}

              {latestSigners.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.3, duration: 0.5 }}
                >
                  <Card className="shadow-sm border-border/50">
                    <div className="p-4 pb-2 border-b bg-muted/20">
                      <h3 className="font-bold flex items-center gap-2 text-foreground text-sm">
                         <Users className="w-4 h-4 text-primary" />
                         Últimos Assinantes
                      </h3>
                    </div>
                    <div className="p-4 space-y-4">
                      {latestSigners.slice(0, 5).map((signer, i) => (
                        <motion.div 
                          key={i} 
                          className="flex items-center gap-3"
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: 0.4 + (i * 0.1) }}
                        >
                           <Avatar className="w-8 h-8 border border-border">
                             <AvatarFallback className="bg-primary/10 text-primary text-xs font-bold">
                               {signer.is_public ? (signer.name ? signer.name.substring(0, 2).toUpperCase() : 'AN') : 'AN'}
                             </AvatarFallback>
                           </Avatar>
                           <div className="flex-1 min-w-0 overflow-hidden">
                             <p className="text-sm font-medium truncate text-foreground">
                               {signer.is_public ? (signer.name || 'Anônimo') : 'Apoiador Anônimo'}
                             </p>
                             <p className="text-xs text-muted-foreground flex items-center gap-1">
                               <Clock className="w-3 h-3" />
                               {formatDistanceToNow(new Date(signer.created_at), { addSuffix: true, locale: ptBR })}
                             </p>
                           </div>
                        </motion.div>
                      ))}
                    </div>
                  </Card>
                </motion.div>
              )}
            </div>
          </div>
        </div>

        {/* Other Petitions Suggestions (Full Width) */}
        {otherPetitions.length > 0 && (
          <section className="mt-20 pt-10 border-t border-dashed">
            <h2 className="text-2xl font-bold mb-8 text-center">Outras causas que precisam do seu apoio</h2>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {otherPetitions.map((other) => (
                <div key={other.id} className="h-full">
                  <PetitionCard 
                    petition={other}
                    onClick={() => navigate(`/abaixo-assinado/${other.id}`)}
                    onDonate={(p) => {
                      setSelectedPetition(p); // Assuming setSelectedPetition exists or we need to manage it
                      setShowDonationModal(true);
                    }}
                  />
                </div>
              ))}
            </div>
          </section>
        )}

      </main>

      {/* Mobile Sticky Action Bar */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-background/80 backdrop-blur-md border-t shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)] z-50 lg:hidden flex gap-3 animate-in slide-in-from-bottom-full duration-500">
         <Button 
           size="lg" 
           className="flex-1 shadow-lg font-bold text-lg h-12" 
           onClick={handleSignClick}
           disabled={hasSigned || petition.status !== 'open'}
         >
           {hasSigned ? (
               <>
                 <FileSignature className="w-5 h-5 mr-2" />
                 Assinado!
               </>
           ) : (
               <>
                 <FileSignature className="w-5 h-5 mr-2" />
                 Assinar Agora
               </>
           )}
         </Button>
         <Button variant="outline" size="icon" className="h-12 w-12 shrink-0" onClick={handleShare}>
           <Share2 className="w-5 h-5" />
         </Button>
      </div>
      
      {/* Sign Modal */}
      <Dialog open={showSignModal} onOpenChange={setShowSignModal}>
        <DialogContent className="sm:max-w-md bg-card max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold">Assine este abaixo-assinado</DialogTitle>
            <DialogDescription>
               Sua voz é importante! Preencha os dados abaixo para confirmar seu apoio.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
             {/* User Info (ReadOnly) */}
             {user ? (
               <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                     <Label>Nome</Label>
                     <Input value={user.user_metadata?.name || 'Usuário'} disabled />
                  </div>
                  <div className="space-y-2">
                     <Label>Email</Label>
                     <Input value={user.email || ''} disabled />
                  </div>
               </div>
             ) : (
               // Guest Form
               <>
                 <div className="space-y-2">
                   <Label htmlFor="guestName">Nome Completo</Label>
                   <Input 
                     id="guestName" 
                     value={guestForm.name} 
                     onChange={(e) => setGuestForm(prev => ({ ...prev, name: e.target.value }))}
                     placeholder="Seu nome"
                   />
                 </div>
                 <div className="space-y-2">
                   <Label htmlFor="guestEmail">Email</Label>
                   <Input 
                     id="guestEmail" 
                     type="email"
                     value={guestForm.email} 
                     onChange={(e) => setGuestForm(prev => ({ ...prev, email: e.target.value }))}
                     placeholder="seu@email.com"
                   />
                 </div>
               </>
             )}

             {/* City */}
             <div className="space-y-2">
                <Label htmlFor="city">Cidade</Label>
                <Input 
                  id="city" 
                  value={user ? signForm.city : guestForm.city} 
                  onChange={(e) => user ? setSignForm(prev => ({ ...prev, city: e.target.value })) : setGuestForm(prev => ({ ...prev, city: e.target.value }))}
                  placeholder="Ex: Floresta-PE"
                />
             </div>

             <div className="space-y-2">
                <Label htmlFor="comment">Comentário (Opcional)</Label>
                <Textarea 
                  id="comment" 
                  value={user ? signForm.comment : guestForm.comment} 
                  onChange={(e) => user ? setSignForm(prev => ({ ...prev, comment: e.target.value })) : setGuestForm(prev => ({ ...prev, comment: e.target.value }))}
                  placeholder="Estou assinando porque..."
                  rows={3}
                />
             </div>

             {/* Options */}
             <div className="space-y-4 pt-2">
                <div className="flex items-start space-x-2">
                  <Checkbox 
                    id="notifications" 
                    checked={user ? signForm.allowNotifications : guestForm.allowNotifications}
                    onCheckedChange={(checked) => user ? setSignForm(prev => ({ ...prev, allowNotifications: checked })) : setGuestForm(prev => ({ ...prev, allowNotifications: checked }))}
                  />
                  <div className="grid gap-1.5 leading-none">
                    <label
                      htmlFor="notifications"
                      className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                    >
                      Quero receber novidades sobre esta petição
                    </label>
                  </div>
                </div>
                
                <div className="flex items-start space-x-2">
                  <Checkbox 
                    id="public" 
                    checked={user ? !signForm.isPublic : !guestForm.isPublic}
                    onCheckedChange={(checked) => user ? setSignForm(prev => ({ ...prev, isPublic: !checked })) : setGuestForm(prev => ({ ...prev, isPublic: !checked }))}
                  />
                  <div className="grid gap-1.5 leading-none">
                    <label
                      htmlFor="public"
                      className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                    >
                      Não exibir minha assinatura publicamente
                    </label>
                  </div>
                </div>
             </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSignModal(false)} disabled={signing}>
              Cancelar
            </Button>
            <Button 
              onClick={user ? handleConfirmSign : handleGuestSign} 
              className="bg-primary hover:bg-primary/90 text-primary-foreground font-bold"
              disabled={signing}
            >
              {signing ? 'Assinando...' : 'Confirmar Assinatura'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {showDonationModal && (
        <DonationModal 
          isOpen={showDonationModal} 
          onClose={() => setShowDonationModal(false)}
          onSuccess={() => fetchPetition(false)}
          petitionId={petition.id}
          reportTitle={petition.title}
          donationOptions={donationOptions}
        />
      )}

      {showJourney && (
        <PetitionJourney 
          isOpen={showJourney}
          onClose={() => setShowJourney(false)}
          petitionTitle={petition.title}
          petitionUrl={window.location.href}
          isGuest={isGuestSign}
          donationOptions={donationOptions}
          donationEnabled={donationEnabled}
          onDonate={() => {
            setShowJourney(false);
            setTimeout(() => setShowDonationModal(true), 300); // Wait for modal transition
          }}
        />
      )}


    </div>
  );
};

export default PetitionPage;

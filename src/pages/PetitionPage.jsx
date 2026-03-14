import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useParams, Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Helmet } from 'react-helmet';
import { motion, AnimatePresence } from 'framer-motion';
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Media } from '@capacitor-community/media';
import { Share } from '@capacitor/share';
import { LocalNotifications } from '@capacitor/local-notifications';
import { 
  ArrowLeft, Share2, Calendar, Target, Users, AlertTriangle, 
  MapPin, Clock, MessageSquare, ThumbsUp, FileSignature, Edit, Download, ShieldCheck, Heart, Megaphone, FileText, Sparkles, Instagram, 
  User2Icon
} from 'lucide-react';
import jsPDF from 'jspdf';
import confetti from 'canvas-confetti';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/customSupabaseClient';
import { getPetitionShareUrl } from '@/lib/shareUtils';
import { validateEmail, getNextSignatureGoal } from '@/lib/utils';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import DonationModal from '@/components/DonationModal';
import PetitionJourney from '@/components/PetitionJourney';
import PetitionEditor from '@/components/petition/PetitionEditor';
import PetitionUpdateModal from '@/components/petition/PetitionUpdateModal';
import PetitionUpdates from '@/components/petition-modern/PetitionUpdates';
import PetitionFlyerModal from '@/components/petition/PetitionFlyerModal';
import PetitionStoryModal from '@/components/petition/PetitionStoryModal';

import BlockRenderer from '@/components/petition/builder/BlockRenderer';

// Modern Components
import PetitionHero from '@/components/petition-modern/PetitionHero';
import PetitionContent from '@/components/petition-modern/PetitionContent';
import PetitionComments from '@/components/petition-modern/PetitionComments';
import PetitionSignatureCard from '@/components/petition-modern/PetitionSignatureCard';
import PetitionSupportCard from '@/components/petition-modern/PetitionSupportCard';
import PetitionRelatedCauses from '@/components/petition-modern/PetitionRelatedCauses';
import ReCAPTCHA from "react-google-recaptcha";
import { toPng } from 'html-to-image';

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
  const [showJourney, setShowJourney] = useState(false);
  const [showUpdateModal, setShowUpdateModal] = useState(false);
  const [showFlyerModal, setShowFlyerModal] = useState(false);
  const [showStoryModal, setShowStoryModal] = useState(false);
  const otherCausesRef = useRef(null);
  const triggerRef = useRef(null);
  const inlineFormRef = useRef(null);
  const storyCardRef = useRef(null);


  const [isEditing, setIsEditing] = useState(false);
  
  // Set initial editing state based on search params and permissions
  useEffect(() => {
    if (searchParams.get('edit') === 'true' && petition) {
      const isAdmin = user?.is_admin;
      const isPublic = ['open', 'victory', 'closed'].includes(petition.status);
      
      // Authors can only edit if NOT public. Admins can edit anything.
      if (isAdmin || !isPublic) {
        setIsEditing(true);
      } else {
        // If public and not admin, remove the edit param from URL and stay in view mode
        navigate(`/abaixo-assinado/${id}`, { replace: true });
        setIsEditing(false);
        toast({
          title: "Acesso negado",
          description: "Petições aprovadas só podem ser editadas por administradores.",
          variant: "destructive"
        });
      }
    }
  }, [searchParams, petition, user, navigate, id, toast]);
  const [isGuestSign, setIsGuestSign] = useState(false);
  const [recentSignatures, setRecentSignatures] = useState([]);
  const [latestSigners, setLatestSigners] = useState([]);
  const [recentDonations, setRecentDonations] = useState([]);
  const [totalDonations, setTotalDonations] = useState(0);
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
  const [signError, setSignError] = useState('');
  const [signing, setSigning] = useState(false);
  const [captchaValue, setCaptchaValue] = useState(null);
  const [verifyingCaptcha, setVerifyingCaptcha] = useState(false);
  const recaptchaRef = useRef(null);
  const [newComment, setNewComment] = useState('');
  const [commentSort, setCommentSort] = useState('newest');
  const [donationFromJourney, setDonationFromJourney] = useState(false);

  // Unified State Wrappers for Modern Components
  const currentCity = user ? signForm.city : guestForm.city;
  const setCity = (val) => {
    if (user) setSignForm(prev => ({ ...prev, city: val }));
    else setGuestForm(prev => ({ ...prev, city: val }));
  };
  
  const currentIsPublic = user ? signForm.isPublic : guestForm.isPublic;
  const setIsPublic = (val) => {
    if (user) setSignForm(prev => ({ ...prev, isPublic: val }));
    else setGuestForm(prev => ({ ...prev, isPublic: val }));
  };

  const currentAllowNotifications = user ? signForm.allowNotifications : guestForm.allowNotifications;
  const setAllowNotifications = (val) => {
    if (user) setSignForm(prev => ({ ...prev, allowNotifications: val }));
    else setGuestForm(prev => ({ ...prev, allowNotifications: val }));
  };

  const qrCodeUrl = useMemo(() => {
    const url = getPetitionShareUrl(id);
    return `https://api.qrserver.com/v1/create-qr-code/?size=380x380&data=${encodeURIComponent(url)}`;
  }, [id]);

  const storyGoal = useMemo(() => {
    const signatures = typeof petition?.signatureCount === 'number' ? petition.signatureCount : 0;
    const base = Number(petition?.goal);
    const baseValid = Number.isFinite(base) && base > 0 ? base : 100;
    return getNextSignatureGoal(signatures, baseValid);
  }, [petition?.signatureCount, petition?.goal]);

  // --- SEO & Sharing Logic ---
  const getBaseUrl = useCallback(() => {
    let baseUrl;
    // 1. Se estiver no app nativo, sempre usar produção
    if (Capacitor.isNativePlatform()) {
      baseUrl = 'https://trombonecidadao.com.br';
    } 
    // 2. Se estiver no navegador, detectar automaticamente o ambiente (prioridade sobre VITE_APP_URL)
    else if (typeof window !== 'undefined') {
      const origin = window.location.origin;
      if (origin.includes('localhost')) {
        baseUrl = origin;
      } else if (origin.includes('trombone-cidadao.vercel.app') || origin.includes('vercel.app')) {
        console.log("origin detected:", origin);
        baseUrl = origin;
      } else if (origin.includes('trombonecidadao.com.br')) {
        baseUrl = 'https://trombonecidadao.com.br';
      } else {
        baseUrl = origin;
      }
    } 
    // 3. Fallback para variável de ambiente
    else if (import.meta.env.VITE_APP_URL) {
      baseUrl = import.meta.env.VITE_APP_URL;
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

  // Scroll handler removed (replaced by sticky CSS)

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
      .select('*, report:reports(*), signatures:signatures(count), updates:petition_updates(*), author:profiles(is_admin)')
      .eq('id', id)
      .single();

    if (error) {
      toast({ title: "Erro ao carregar petição", description: error.message, variant: "destructive" });
      navigate('/');
    } else {
      // Access Control: Restrict visibility for non-approved petitions
      // Allowed: Public statuses (open, victory, closed), or Admin. 
      // Authors of drafts can see ONLY the editor.
      // Authors of pending petitions can see the page with a warning banner.
      const isPublicStatus = ['open', 'victory', 'closed'].includes(data.status);
      const isAuthor = user && user.id === data.author_id;
      const isAdmin = user?.is_admin;
      const isDraft = data.status === 'draft';
      const isPending = data.status === 'pending_moderation';

      if (!isPublicStatus && !isAdmin) {
          if (isAuthor) {
              if (isDraft && !searchParams.get('edit')) {
                  // If author tries to see public page of a draft, redirect to editor
                  navigate(`/abaixo-assinado/${id}?edit=true`);
                  return;
              }
              // If isPending, we allow viewing but will show a banner later
          } else {
              // Not author, not admin, not public
              toast({ 
                  title: "Acesso restrito", 
                  description: "Esta petição não está disponível publicamente.", 
                  variant: "secondary" 
              });
              navigate('/');
              return;
          }
      }

      let validSignatureCount = data.signatures?.[0]?.count || 0;
      const { count: filteredCount, error: countError } = await supabase
        .from('signatures')
        .select('id', { count: 'exact', head: true })
        .eq('petition_id', id)
        .not('email', 'is', null)
        .ilike('email', '%@%.%');
      if (!countError && typeof filteredCount === 'number') {
        validSignatureCount = filteredCount;
      }

      setPetition({
        ...data,
        signatureCount: validSignatureCount
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

      // Fetch total donations amount
      const { data: totalData } = await supabase
        .from('donations')
        .select('amount')
        .eq('petition_id', id)
        .eq('status', 'paid');
      
      const totalAmount = totalData ? totalData.reduce((sum, d) => sum + (Number(d.amount) || 0), 0) : 0;
      setTotalDonations(totalAmount);

      // Fetch other open petitions
      const { data: others } = await supabase
        .from('petitions')
        .select('id, title, description, image_url, goal, signatures(count)')
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
    // If user is not admin and petition is not open (i.e., draft or pending moderation),
    // redirect to My Petitions page as requested.
    const isAdmin = user?.is_admin;
    const isPublic = updatedPetition.status === 'open';

    if (!isAdmin && !isPublic) {
        toast({ 
            title: "Petição salva", 
            description: "Sua petição foi salva. Acompanhe o status em 'Minhas Petições'.",
        });
        navigate('/minhas-peticoes');
    } else {
        setPetition(prev => ({ ...prev, ...updatedPetition }));
        setIsEditing(false);
    }
  };

  const handleSignClick = async () => {
    setSignError('');
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
                    name: userName,
                    email: user.email,
                    city: userCity,
                    is_public: true,
                    allow_notifications: true,
                    comment: ''
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
            
            // Update latest signers list locally
            setLatestSigners(prev => [{
                name: userName,
                city: userCity,
                created_at: new Date().toISOString(),
                is_public: signForm.isPublic
            }, ...prev]);

            setShowJourney(true);

            // Send confirmation email (fire and forget)
            if (user.email) {
              console.log('Enviando email de confirmação para:', user.email);
              supabase.functions.invoke('send-signature-confirmation', {
                body: {
                  email: user.email,
                  name: userName,
                  petitionTitle: petition.title,
                  petitionUrl: getPetitionShareUrl(id),
                  petitionImage: petition.image_url
                }
              }).then(({ data, error }) => {
                if (error) console.error('Erro ao enviar email (Function):', error);
                else console.log('Email enviado com sucesso:', data);
              }).catch(err => console.error('Erro ao invocar função de email:', err));
            }

        } catch (error) {
            console.error("One click sign error:", error);
            setSignError(error.message || "Não foi possível registrar sua assinatura.");
        } finally {
            setSigning(false);
        }
    } else {
        if (inlineFormRef.current) {
          inlineFormRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
          setTimeout(() => {
            const el = document.getElementById('guest-name');
            if (el) el.focus();
          }, 450);
        }
    }
  };

  const verifyRecaptcha = useCallback(async () => {
      if (!captchaValue) {
          setSignError("Por favor, complete o reCAPTCHA abaixo.");
          return false;
      }

      try {
          const { data, error } = await supabase.functions.invoke('verify-recaptcha', {
              body: {
                  token: captchaValue,
                  siteKey: import.meta.env.VITE_RECAPTCHA_SITE_KEY
              }
          });

          if (error) {
              console.error('Erro ao verificar reCAPTCHA:', error);
              setSignError("Erro ao verificar o reCAPTCHA. Tente novamente.");
              return false;
          }

          if (!data?.success) {
              console.warn('reCAPTCHA inválido ou suspeito:', data);
              setSignError("Falha na verificação do reCAPTCHA. Atualize a página e tente novamente.");
              return false;
          }

          return true;
      } catch (err) {
          console.error('Exceção ao verificar reCAPTCHA:', err);
          setSignError("Não foi possível verificar o reCAPTCHA. Tente novamente em instantes.");
          return false;
      }
  }, [captchaValue, supabase, setSignError]);

  const handleGuestSign = async () => {
      setSignError('');
      if (!guestForm.name || !guestForm.email || !guestForm.city) {
          setSignError("Por favor preencha nome, email e cidade.");
          return;
      }
      if (!validateEmail(guestForm.email)) {
          setSignError("Informe um email válido para assinar.");
          return;
      }

      setVerifyingCaptcha(true);
      const captchaOk = await verifyRecaptcha();
      setVerifyingCaptcha(false);
      if (!captchaOk) {
          return;
      }

      await executeGuestSign();
  };

  const executeGuestSign = async () => {
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
             if (signError.code === '23505') {
                 setSignError("Este email já assinou esta petição.");
                 return;
             }
             setSignError(signError.message || "Não foi possível registrar sua assinatura.");
             return;
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
          
          // Update latest signers list locally
          setLatestSigners(prev => [{
              name: guestForm.name,
              city: guestForm.city,
              created_at: new Date().toISOString(),
              is_public: guestForm.isPublic
          }, ...prev]);

          setIsGuestSign(true);
          setShowJourney(true);
          
          // Reset captcha
          setCaptchaValue(null);
          if (recaptchaRef.current) recaptchaRef.current.reset();

          // Send confirmation email (fire and forget)
          console.log('Enviando email de confirmação (Guest) para:', guestForm.email);
          supabase.functions.invoke('send-signature-confirmation', {
            body: {
              email: guestForm.email,
              name: guestForm.name,
              petitionTitle: petition.title,
              petitionUrl: getPetitionShareUrl(id),
              petitionImage: petition.image_url
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

  const handleShare = async () => {
    const shareUrl = getPetitionShareUrl(id);
    try {
      if (Capacitor.isNativePlatform()) {
        await Share.share({
          url: shareUrl,
          dialogTitle: 'Compartilhar Abaixo-assinado',
        });
      } else if (navigator.share) {
        await navigator.share({
          url: shareUrl,
        });
      } else {
        await navigator.clipboard.writeText(shareUrl);
        toast({ title: "Link copiado!", description: "Compartilhe com seus amigos." });
      }
    } catch (err) {
      console.error('Error sharing:', err);
      navigator.clipboard.writeText(shareUrl);
      toast({ title: "Link copiado!", description: "Compartilhe com seus amigos." });
    }
  };

  const handleCopyShareLink = useCallback(async () => {
    const shareUrl = getPetitionShareUrl(id);
    try {
      await navigator.clipboard.writeText(shareUrl);
      toast({
        title: "Link copiado!",
        description: "Cole nos stories ou envie para seus amigos.",
      });
    } catch (err) {
      console.error('Error copying share link:', err);
      toast({
        title: "Não foi possível copiar automaticamente",
        description: "Selecione e copie o endereço da barra do navegador.",
        variant: "destructive",
      });
    }
  }, [id, toast]);

  

  /* 
  const handleDownloadStoryCard = useCallback(async () => {
    ...
  }, [petition, id, toast, signForm.city]);
  */

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
 
       if (error) {
         if (error.code === '23505') {
           setSignError("Você já assinou esta petição.");
           return;
         }
         setSignError(error.message || "Não foi possível registrar sua assinatura.");
         return;
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
              petitionUrl: getPetitionShareUrl(id),
              petitionImage: petition.image_url
            }
          }).then(({ data, error }) => {
            if (error) console.error('Erro ao enviar email (Function Logged):', error);
            else console.log('Email enviado com sucesso (Logged):', data);
          }).catch(err => console.error('Erro ao invocar função de email (Logged):', err));
        }

     } catch (error) {
       setSignError(error.message || "Não foi possível registrar sua assinatura.");
     } finally {
       setSigning(false);
     }
  };

  const handleCommentSubmit = async (comment) => {
    if (!user) return;
    try {
      const { data, error } = await supabase
        .from('signatures')
        .update({ comment })
        .eq('petition_id', id)
        .eq('user_id', user.id)
        .select();

      if (error) throw error;

      if (!data || data.length === 0) {
        toast({ title: "Assinatura necessária", description: "Você precisa assinar a petição antes de comentar.", variant: "destructive" });
        return;
      }
      
      // Update local state
      setRecentSignatures(prev => [
        { 
          name: user.user_metadata?.name || 'Usuário',
          city: signForm.city,
          created_at: new Date().toISOString(),
          comment,
          is_public: signForm.isPublic
        }, 
        ...prev
      ]);
      
      toast({ title: "Comentário publicado!", description: "Obrigado por compartilhar sua opinião." });
    } catch (error) {
      toast({ title: "Erro ao publicar", description: error.message, variant: "destructive" });
    }
  };

  const handleExportPDF = () => {
    const doc = new jsPDF();
    doc.setFontSize(18);
    doc.text("Relatório de Assinaturas - " + petition.title, 14, 22);
    
    // Only basic info for now as we don't have all signatures loaded
    doc.setFontSize(12);
    const signatures = typeof petition.signatureCount === 'number' ? petition.signatureCount : 0;
    const pdfGoal = storyGoal;
    doc.text(`Total de assinaturas: ${signatures}`, 14, 32);
    doc.text(`Meta: ${pdfGoal}`, 14, 38);
    doc.text(`Data: ${new Date().toLocaleDateString('pt-BR')}`, 14, 44);

    doc.save("relatorio_peticao.pdf");
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
          <p className="text-muted-foreground animate-pulse">Carregando petição...</p>
        </div>
      </div>
    );
  }

  if (!petition) {
    return (
        <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
            <h1 className="text-2xl font-bold mb-4">Petição não encontrada</h1>
            <Button onClick={() => navigate('/')}>Voltar para o início</Button>
        </div>
    );
  }

  if (isEditing) {
    return (
      <PetitionEditor 
        petition={petition} 
        onSave={handleUpdate} 
        onCancel={() => setIsEditing(false)} 
      />
    );
  }

  return (
    <>
    <div className="min-h-screen bg-background text-foreground flex flex-col font-sans petition-theme">
      <Helmet>
        <title>{petition.title} | Trombone Cidadão</title>
        <meta name="description" content={petition.description.substring(0, 160)} />
      </Helmet>

      <main className="mx-auto max-w-screen-2xl px-4 py-8 sm:px-6 lg:px-8">
        {petition.status === 'pending_moderation' && (
            <motion.div 
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                className="mb-8 p-4 bg-yellow-50 border border-yellow-200 rounded-xl flex items-center gap-4 text-yellow-800"
            >
                <div className="bg-yellow-100 p-2 rounded-full">
                    <AlertTriangle className="w-5 h-5" />
                </div>
                <div className="flex-1">
                    <h3 className="font-bold">Esta petição está em análise</h3>
                    <p className="text-sm opacity-90">Sua petição foi enviada para moderação. Enquanto isso, apenas você e administradores podem visualizá-la.</p>
                </div>
                <Button variant="outline" size="sm" onClick={() => setIsEditing(true)} className="border-yellow-300 hover:bg-yellow-100">
                    <Edit className="w-4 h-4 mr-2" />
                    Editar Novamente
                </Button>
            </motion.div>
        )}
        
        <div className="grid gap-8 lg:grid-cols-[1fr_400px]">
            {/* Left Column: Content */}
             <div className="flex flex-col gap-8 px-0 sm:px-4">
               {/* Mobile Actions (Signature & Donation) - Visual antigo com formulário inline */}
               <div className="flex flex-col gap-6 lg:hidden pb-24" ref={inlineFormRef}>
                  <PetitionSignatureCard 
                    signaturesCount={petition.signatureCount}
                    goal={petition.goal}
                    onSign={handleSignClick}
                    isSubmitting={signing}
                    hasSigned={hasSigned}
                    user={user}
                    city={currentCity}
                    setCity={setCity}
                    isPublic={currentIsPublic}
                    setIsPublic={setIsPublic}
                    allowNotifications={currentAllowNotifications}
                    setAllowNotifications={setAllowNotifications}
                    onShare={handleShare}
                    recentSignatures={latestSigners}
                    compact={true}
                    hero={
                      <PetitionHero 
                        title={petition.title} 
                        createdAt={petition.created_at} 
                        location={signForm.city} 
                        imageUrl={petition.image_url}
                        gallery={petition.gallery}
                        petition={petition}
                        user={user}
                        onEdit={() => setIsEditing(true)}
                      />
                    }
                    guestForm={guestForm}
                    setGuestForm={setGuestForm}
                    onGuestSign={handleGuestSign}
                    signing={signing}
                    verifying={verifyingCaptcha}
                    errorMessage={signError}
                    recaptchaRef={recaptchaRef}
                    onCaptchaChange={(value) => setCaptchaValue(value)}
                  />
                  
                  
                  
                  <PetitionSupportCard 
                    petitionId={petition.id}
                    petitionTitle={petition.title}
                    donationGoal={petition.donation_goal}
                    totalDonations={totalDonations}
                    onShare={handleShare}
                    onDonate={(amount) => {
                      setShowDonationModal(true);
                    }}
                    shareUrl={getPetitionShareUrl(id)}
                  />
               </div>

              <PetitionContent 
                  hero={
                    <PetitionHero 
                      title={petition.title} 
                      createdAt={petition.created_at} 
                      location={signForm.city} 
                      imageUrl={petition.image_url}
                      gallery={petition.gallery}
                      petition={petition}
                      user={user}
                      onEdit={() => setIsEditing(true)}
                    />
                  }
                  content={petition.content}
                  description={petition.description}
                  importanceList={petition.importance_list}
              >
                  {/* Dynamic Content via BlockRenderer if available, otherwise just description */}
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
                      </div>
                  ) : null}
              </PetitionContent>

              <PetitionUpdates 
                  updates={petition.updates} 
                  action={
                      (user?.is_admin || (user && user.id === petition.author_id)) && (
                          <Button 
                              onClick={() => setShowUpdateModal(true)} 
                              variant="outline" 
                              className="gap-2 bg-background/50 backdrop-blur-sm border-primary/20 hover:bg-primary hover:text-primary-foreground transition-all duration-300"
                          >
                              <Megaphone className="w-4 h-4" />
                              Enviar Novidade
                          </Button>
                      )
                  }
              />

              <section className="mt-6">
                <div className="relative overflow-hidden rounded-3xl border border-primary/15 bg-gradient-to-r from-primary/10 via-rose-50 to-amber-50 dark:from-primary/20 dark:via-slate-900 dark:to-amber-900/40 p-6 sm:p-8 flex flex-col lg:flex-row items-center gap-6">
                  <div className="absolute inset-0 pointer-events-none opacity-40">
                    <div className="absolute -top-10 -right-10 w-40 h-40 bg-primary/25 rounded-full blur-3xl" />
                    <div className="absolute -bottom-10 -left-10 w-52 h-52 bg-amber-300/40 rounded-full blur-3xl" />
                  </div>
                  <div className="relative flex-1 space-y-4">
                    <div className="inline-flex items-center gap-2 rounded-full bg-white/80 px-3 py-1 text-[11px] font-semibold text-primary shadow-sm">
                      <Sparkles className="w-3 h-3" />
                      <span>Compartilhe nos stories e grupos</span>
                    </div>
                    <h3 className="text-2xl sm:text-3xl font-bold leading-tight">
                      Leve esta causa para o Instagram e para seus amigos
                    </h3>
                    <p className="text-sm sm:text-base text-muted-foreground max-w-xl">
                      Use o QR Code ou o link da petição para convidar mais pessoas a assinar.
                      Quanto mais gente ver esta página, maior a pressão por mudança.
                    </p>
                    <div className="flex flex-col sm:flex-row sm:flex-wrap gap-2 sm:gap-3 pt-2">
                      <Button
                        size="sm"
                        onClick={handleCopyShareLink}
                        className="w-full sm:w-auto justify-center bg-primary text-primary-foreground hover:bg-primary/90"
                      >
                        <Share2 className="w-4 h-4 mr-2" />
                        Copiar link da petição
                      </Button>
                    
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setShowFlyerModal(true)}
                        className="w-full sm:w-auto justify-center border-primary/40 text-primary hover:bg-primary/5"
                      >
                        <FileText className="w-4 h-4 mr-2" />
                        Baixar  Qr Code
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setShowStoryModal(true)}
                        className="w-full sm:w-auto justify-center border-[#E53935]/60 text-[#E53935] hover:bg-[#E53935] hover:text-white hover:shadow-md transition-colors"
                      >
                        <Instagram className="w-4 h-4 mr-2" />
                        Baixar card de stories
                      </Button>
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      Dica: adicione o link nos stories e mostre o QR Code na tela para quem estiver por perto.
                    </p>
                  </div>
                  <div className="relative flex-shrink-0">
                    <div className="relative z-10 flex items-center justify-center rounded-2xl bg-white/90 shadow-xl p-3">
                      <img
                        src={qrCodeUrl}
                        alt="QR Code da petição"
                        className="w-32 h-32 sm:w-36 sm:h-36 rounded-xl"
                        loading="lazy"
                      />
                    </div>
                    <div className="absolute -bottom-3 -right-3 rounded-full bg-primary text-primary-foreground p-2 shadow-lg">
                      <Heart className="w-4 h-4" />
                    </div>
                  </div>
                </div>
              </section>

              <div id="comments-section">
                  <PetitionComments 
                      user={user}
                      comments={recentSignatures}
                      commentSort={commentSort}
                      setCommentSort={setCommentSort}
                      newComment={newComment}
                      setNewComment={setNewComment}
                      onPostComment={handleCommentSubmit}
                  />
              </div>
          </div>
 
          {/* Right Column: Sidebar - Visual antigo com formulário inline */}
          <aside className="hidden lg:flex lg:flex-col gap-6 lg:sticky lg:top-24 lg:self-start" ref={inlineFormRef}>
            <PetitionSignatureCard 
              signaturesCount={petition.signatureCount}
              goal={petition.goal}
              onSign={handleSignClick}
              isSubmitting={signing}
              hasSigned={hasSigned}
              user={user}
              city={currentCity}
              setCity={setCity}
              isPublic={currentIsPublic}
              setIsPublic={setIsPublic}
              allowNotifications={currentAllowNotifications}
              setAllowNotifications={setAllowNotifications}
              onShare={handleShare}
              recentSignatures={latestSigners}
              guestForm={guestForm}
              setGuestForm={setGuestForm}
              onGuestSign={handleGuestSign}
              signing={signing}
              verifying={verifyingCaptcha}
              errorMessage={signError}
              recaptchaRef={recaptchaRef}
              onCaptchaChange={(value) => setCaptchaValue(value)}
            />
            
            <PetitionSupportCard 
              petitionId={petition.id}
              petitionTitle={petition.title}
              donationGoal={petition.donation_goal}
              totalDonations={totalDonations}
              onShare={handleShare}
              onDonate={(amount) => {
                setShowDonationModal(true);
              }}
              shareUrl={getPetitionShareUrl(id)}
            />
          </aside>
        </div>

        <PetitionRelatedCauses causes={otherPetitions} />
      </main>

      

      <DonationModal 
        isOpen={showDonationModal} 
        onClose={() => {
          setShowDonationModal(false);
          if (donationFromJourney) {
            setDonationFromJourney(false);
            setShowJourney(true);
          }
        }} 
        petitionTitle={petition.title}
        petitionId={id}
        initialGuestName={guestForm.name}
        initialGuestEmail={guestForm.email}
      />

      <PetitionFlyerModal 
        isOpen={showFlyerModal}
        onClose={() => setShowFlyerModal(false)}
        petition={petition}
        qrCodeUrl={qrCodeUrl}
      />

      <PetitionStoryModal
        isOpen={showStoryModal}
        onClose={() => setShowStoryModal(false)}
        petition={petition}
        qrCodeUrl={qrCodeUrl}
        coverPhotoUrl={petition.image_url || (Array.isArray(petition.gallery) && petition.gallery[0])}
      />

      <PetitionJourney 
        isOpen={showJourney} 
        onClose={() => setShowJourney(false)} 
        petitionTitle={petition?.title}
        petitionUrl={getPetitionShareUrl(id)}
        onDonate={() => {
          setDonationFromJourney(true);
          setShowJourney(false);
          setTimeout(() => setShowDonationModal(true), 150);
        }}
        userName={user ? (user.user_metadata?.name || 'Cidadão') : guestForm.name}
        guestEmail={!user ? guestForm.email : null}
        donationEnabled={petition?.donation_enabled !== false}
        isGuest={!user}
      />


      <PetitionUpdateModal 
        isOpen={showUpdateModal}
        onClose={() => setShowUpdateModal(false)}
        petitionId={petition.id}
        onSave={() => fetchPetition(false)}
      />
    </div>
    {/* Antigo Story Card Legado Removido daqui, agora é gerado pelo PetitionStoryModal */}
    </>
  );
};



export default PetitionPage;

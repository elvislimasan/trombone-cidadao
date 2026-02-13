import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet';
import confetti from 'canvas-confetti';

// Hooks & Utils
import { usePetitionData } from '@/hooks/usePetitionData';
import { usePetitionSEO } from '@/hooks/usePetitionSEO';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';

// Layout & UI
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import DonationModal from '@/components/DonationModal';
import PetitionJourney from '@/components/PetitionJourney';
import { Skeleton } from '@/components/ui/skeleton';

// Modern Components (Replicated from water-supply-petition)
import PetitionHero from '@/components/petition-modern/PetitionHero';
import PetitionContent from '@/components/petition-modern/PetitionContent';
import PetitionComments from '@/components/petition-modern/PetitionComments';
import PetitionSignatureCard from '@/components/petition-modern/PetitionSignatureCard';
import PetitionSupportCard from '@/components/petition-modern/PetitionSupportCard';
import PetitionRelatedCauses from '@/components/petition-modern/PetitionRelatedCauses';
import GuestSignModal from '@/components/petition-modern/GuestSignModal';

const PetitionPageModern = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user } = useAuth();
  
  // Data Fetching Hook
  const {
    petition,
    signatures,
    loading,
    hasSigned,
    setHasSigned,
    updates,
    otherPetitions,
    recentDonations,
    setSignatures
  } = usePetitionData(id);

  // SEO Hook
  usePetitionSEO(petition, id);

  // Local State
  const [showDonationModal, setShowDonationModal] = useState(false);
  const [showJourney, setShowJourney] = useState(false);
  const [showSignModal, setShowSignModal] = useState(false);
  const [signing, setSigning] = useState(false);
  
  // Forms State
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

  const [newComment, setNewComment] = useState('');
  const [commentSort, setCommentSort] = useState('newest');

  // Unified State Handlers for SignatureCard
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

  // Handlers
  const handleSign = async () => {
    if (hasSigned) {
        toast({ title: "Já assinado", description: "Você já assinou esta petição." });
        return;
    }

    try {
        setSigning(true);
        const userCity = user.user_metadata?.city || signForm.city;
        const userName = user.user_metadata?.name || 'Cidadão';
        
        const { error } = await supabase
            .from('signatures')
            .insert({
                petition_id: id,
                report_id: petition?.report_id,
                user_id: user.id,
                city: userCity,
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
        setSignatures(prev => [{
            created_at: new Date().toISOString(),
            name: userName,
            city: userCity,
            comment: signForm.comment,
            is_public: signForm.isPublic
        }, ...prev]);
        
        setShowJourney(true);

        if (user.email) {
             supabase.functions.invoke('send-signature-confirmation', {
                body: {
                  email: user.email,
                  name: userName,
                  petitionTitle: petition.title,
                  petitionUrl: getShareUrl()
                }
             }).catch(err => console.error(err));
        }

    } catch (error) {
        console.error("Sign error:", error);
        toast({ title: "Erro ao assinar", description: error.message, variant: "destructive" });
    } finally {
        setSigning(false);
    }
  };

  const handleGuestSign = async () => {
    if (!guestForm.name || !guestForm.email || !guestForm.city) {
        toast({ title: "Campos obrigatórios", description: "Por favor preencha nome, email e cidade.", variant: "destructive" });
        return;
    }

    try {
        setSigning(true);
        const { error: signError } = await supabase
            .from('signatures')
            .insert({
                petition_id: id,
                report_id: petition?.report_id,
                user_id: null,
                name: guestForm.name,
                email: guestForm.email,
                city: guestForm.city,
                is_public: guestForm.isPublic,
                allow_notifications: guestForm.allowNotifications,
                comment: guestForm.comment
            });

        if (signError) {
             if (signError.code === '23505') throw new Error("Este email já assinou esta petição.");
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
        setShowSignModal(false);
        setSignatures(prev => [{
            created_at: new Date().toISOString(),
            name: guestForm.name,
            city: guestForm.city,
            comment: guestForm.comment,
            is_public: guestForm.isPublic
        }, ...prev]);
        
        setShowJourney(true);

         supabase.functions.invoke('send-signature-confirmation', {
            body: {
              email: guestForm.email,
              name: guestForm.name,
              petitionTitle: petition.title,
              petitionUrl: getShareUrl()
            }
         }).catch(err => console.error(err));

    } catch (error) {
        toast({ title: "Erro ao assinar", description: error.message, variant: "destructive" });
    } finally {
        setSigning(false);
    }
  };

  const handleCardSignSubmit = () => {
      if (user) {
          handleSign();
      } else {
          // If guest, open modal to get Name/Email, preserving City/Options
          setShowSignModal(true);
      }
  };

  const handlePostComment = async (comment) => {
      if (!user) {
          toast({ title: "Faça login", description: "Você precisa estar logado para comentar.", variant: "destructive" });
          return;
      }
      try {
          const { error } = await supabase
              .from('signatures')
              .update({ comment: comment })
              .eq('petition_id', id)
              .eq('user_id', user.id);

          if (error) throw error;
          
          setSignatures(prev => prev.map(s => s.user_id === user.id ? { ...s, comment } : s));
          setNewComment('');
          toast({ title: "Comentário publicado!", description: "Obrigado por compartilhar sua opinião." });
          
      } catch (error) {
          console.error("Error posting comment", error);
          toast({ title: "Erro", description: "Não foi possível postar o comentário." });
      }
  };

  const getShareUrl = () => {
    const origin = window.location.origin.includes('localhost') 
      ? 'https://trombone-cidadao.vercel.app' 
      : window.location.origin;
    return `${origin}/share/abaixo-assinado/${id}`;
  };

  if (loading) {
    return (
        <div className="min-h-screen bg-background">
            <Header />
            <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 space-y-8">
                <Skeleton className="h-12 w-3/4 max-w-2xl" />
                <div className="grid gap-8 lg:grid-cols-[1fr_400px]">
                    <div className="space-y-8">
                        <Skeleton className="aspect-video w-full rounded-2xl" />
                        <Skeleton className="h-40 w-full" />
                    </div>
                    <div className="lg:col-span-4">
                        <Skeleton className="h-[500px] w-full rounded-2xl" />
                    </div>
                </div>
            </main>
        </div>
    );
  }

  if (!petition) return null;

  return (
    <div className="min-h-screen bg-background font-sans text-foreground selection:bg-primary/20 petition-theme">
      <Helmet>
        <title>{petition.title} | Trombone Cidadão</title>
      </Helmet>
      
      <Header />
      
      <main className="mx-auto max-w-screen-2xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="grid gap-8 lg:grid-cols-[1fr_400px]">
           {/* Left Column: Content */}
           <div className="space-y-8">
              <PetitionHero 
                title={petition.title} 
                createdAt={petition.created_at} 
                imageUrl={petition.image_url}
                gallery={petition.gallery}
                location={petition.location || "Floresta, PE"}
              />
              
              <PetitionContent 
                content={petition.content} 
                description={petition.description} 
              />
              
              <PetitionComments 
                user={user}
                comments={signatures.filter(s => s.comment)} 
                commentSort={commentSort}
                setCommentSort={setCommentSort}
                newComment={newComment}
                setNewComment={setNewComment}
                onPostComment={handlePostComment}
              />
           </div>
           
           {/* Right Column: Sidebar */}
           <aside className="space-y-6 lg:sticky lg:top-24 lg:self-start">
              <PetitionSignatureCard 
                 signaturesCount={signatures.length}
                 goal={petition.goal || 100}
                 onSign={handleCardSignSubmit}
                 isSubmitting={signing}
                 hasSigned={hasSigned}
                 user={user}
                 city={currentCity}
                 setCity={setCity}
                 isPublic={currentIsPublic}
                 setIsPublic={setIsPublic}
                 allowNotifications={currentAllowNotifications}
                 setAllowNotifications={setAllowNotifications}
                 onShare={async () => {
                     const shareUrl = getShareUrl();
                     try {
                        await navigator.share({
                            title: petition.title,
                            text: `Assine este abaixo-assinado: ${petition.title}`,
                            url: shareUrl,
                        });
                     } catch (err) {
                        navigator.clipboard.writeText(shareUrl);
                        toast({ title: "Link copiado!", description: "Compartilhe com seus amigos." });
                     }
                 }}
                 recentSignatures={signatures}
              />
              
              <PetitionSupportCard 
                petitionId={petition.id}
                petitionTitle={petition.title}
                donationGoal={petition.donation_goal}
                totalDonations={0} // This should be fetched if available
                onDonate={() => setShowDonationModal(true)}
                onShare={async () => {
                  const shareUrl = getShareUrl();
                  try {
                    await navigator.share({
                      title: petition.title,
                      text: `Apoie esta causa: ${petition.title}`,
                      url: shareUrl,
                    });
                  } catch (err) {
                    navigator.clipboard.writeText(shareUrl);
                    toast({ title: "Link copiado!", description: "Compartilhe com seus amigos." });
                  }
                }}
              />
           </aside>
        </div>

        <PetitionRelatedCauses />
      </main>

      {/* Modals */}
      <DonationModal 
        isOpen={showDonationModal} 
        onClose={() => setShowDonationModal(false)} 
        petition={petition} 
      />
      
      <GuestSignModal 
        open={showSignModal} 
        onOpenChange={setShowSignModal}
        guestForm={guestForm}
        setGuestForm={setGuestForm}
        onGuestSign={handleGuestSign}
        signing={signing}
      />
      
      {showJourney && (
         <PetitionJourney 
            isOpen={showJourney} 
            onClose={() => setShowJourney(false)} 
            petitionTitle={petition?.title}
            petitionUrl={getShareUrl()}
            onDonate={() => setShowDonationModal(true)}
            userName={user ? (user.user_metadata?.name || 'Cidadão') : guestForm.name}
            guestEmail={!user ? guestForm.email : null}
            donationEnabled={petition?.donation_enabled !== false}
            isGuest={!user}
         />
      )}
    </div>
  );
};

export default PetitionPageModern;

import React, { useState, useEffect, useCallback } from 'react';
import { Helmet } from 'react-helmet';
import { motion } from 'framer-motion';
import { User, Briefcase, Edit, LogOut, LayoutGrid, Award, ThumbsUp, MessageSquare, FileText, KeyRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import EditProfileModal from '@/components/EditProfileModal';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useNavigate, Link } from 'react-router-dom';
import { supabase } from '@/lib/customSupabaseClient';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import Avatar from 'react-nice-avatar';

const ProfilePage = () => {
  const { toast } = useToast();
  const { user, signOut, refreshUserProfile } = useAuth();
  const navigate = useNavigate();
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [rankings, setRankings] = useState({ reports: [], upvotes: [], comments: [] });

  const fetchRankings = useCallback(async () => {
    const { data: reportsRank, error: reportsError } = await supabase.rpc('get_top_users_by_reports');
    if (reportsError) console.error("Ranking error (reports):", reportsError);

    const { data: upvotesRank, error: upvotesError } = await supabase.rpc('get_top_users_by_upvotes');
    if (upvotesError) console.error("Ranking error (upvotes):", upvotesError);

    const { data: commentsRank, error: commentsError } = await supabase.rpc('get_top_users_by_comments');
    if (commentsError) console.error("Ranking error (comments):", commentsError);

    setRankings({
      reports: reportsRank || [],
      upvotes: upvotesRank || [],
      comments: commentsRank || [],
    });
  }, []);

  useEffect(() => {
    if (!user) {
      navigate('/login');
    } else {
      fetchRankings();
    }
  }, [user, navigate, fetchRankings]);

  const handleProfileUpdate = async (updatedData) => {
    const { error } = await supabase
      .from('profiles')
      .update({ 
        name: updatedData.name, 
        avatar_type: updatedData.avatar_type,
        avatar_url: updatedData.avatar_url,
        avatar_config: updatedData.avatar_config
      })
      .eq('id', user.id);

    if (error) {
      toast({ title: "Erro ao atualizar perfil", description: error.message, variant: "destructive" });
    } else {
      await refreshUserProfile();
      toast({ title: "Perfil atualizado! ✨" });
    }
  };

  const handleLogout = async () => {
    await signOut();
    toast({ title: "Você saiu da sua conta.", description: "Até a próxima! 👋" });
    navigate('/login');
  };

  const userTypeDisplay = {
    citizen: { icon: User, text: 'Cidadão', color: 'text-blue-400' },
    public_official: { icon: Briefcase, text: 'Órgão Público', color: 'text-green-400' }
  };

  if (!user) {
    return <div className="flex justify-center items-center h-screen">Carregando...</div>; 
  }

  const UserTypeIcon = userTypeDisplay[user.user_type]?.icon || User;

  const getAvatarComponent = (profile) => {
    if (!profile) return <Avatar className="w-full h-full" />;

    if (profile.avatar_type === 'url' && profile.avatar_url) {
      return <img src={profile.avatar_url} alt="Avatar" className="w-full h-full object-cover" />;
    }
    
    if (profile.avatar_type === 'generated' && profile.avatar_config) {
      let config = profile.avatar_config;
      if (typeof config === 'string') {
        try {
          config = JSON.parse(config);
        } catch (e) {
          config = {};
        }
      }
      return <Avatar className="w-full h-full" {...config} />;
    }
    
    return <Avatar className="w-full h-full" />;
  };

  const RankingList = ({ items, icon: Icon, currentUserId }) => (
    <div className="space-y-2">
      {items.map((item, index) => {
        const isCurrentUser = item.id === currentUserId;
        const isTop3 = index < 3;

        const rankColor =
          index === 0
            ? 'bg-[#FACC15] text-[#78350F]'
            : index === 1
            ? 'bg-[#E5E7EB] text-[#111827]'
            : index === 2
            ? 'bg-[#FDBA74] text-[#78350F]'
            : 'bg-[#EEF2FF] text-[#4F46E5]';

        return (
          <div
            key={item.id}
            className={`flex items-center gap-3 p-2.5 rounded-xl border border-[#E5E7EB] bg-white hover:border-[#111827]/20 hover:shadow-sm transition ${
              isCurrentUser ? 'ring-2 ring-tc-red/30' : ''
            }`}
          >
            <span
              className={`flex items-center justify-center w-7 h-7 text-xs font-bold rounded-full ${rankColor}`}
            >
              {index + 1}
            </span>
            <div className="w-10 h-10 rounded-full overflow-hidden bg-[#F3F4F6] flex-shrink-0">
              {getAvatarComponent(item)}
            </div>
            <div className="flex flex-col flex-grow min-w-0">
              <span className="font-medium text-xs md:text-sm text-[#111827] truncate">
                {item.name}
              </span>
              <div className="flex items-center gap-2 text-[11px] text-[#6B7280]">
                {isCurrentUser && (
                  <span className="px-2 py-0.5 rounded-full bg-[#FEF2F2] text-[#B91C1C] text-[10px] font-semibold">
                    Você
                  </span>
                )}
                {isTop3 && !isCurrentUser && (
                  <span className="px-2 py-0.5 rounded-full bg-[#EFF6FF] text-[#1D4ED8] text-[10px] font-semibold">
                    Destaque
                  </span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-1 text-xs md:text-sm text-[#4B5563] flex-shrink-0">
              <Icon className="w-4 h-4" />
              <span className="font-semibold">{item.count}</span>
            </div>
          </div>
        );
      })}
    </div>
  );

  return (
    <>
      <Helmet>
        <title>Meu Perfil - Trombone Cidadão</title>
      </Helmet>
      <div className="flex flex-col bg-[#F9FAFB] md:px-6">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="px-4 md:px-6 lg:px-10 xl:px-14 pt-4 pb-8 space-y-8 max-w-[88rem] mx-auto w-full"
        >
          <div className="space-y-2">
            <p className="text-[11px] font-semibold tracking-[0.18em] text-[#9CA3AF] uppercase flex items-center gap-2">
              <span className="inline-block w-1 h-3 rounded-full bg-tc-red" />
              Conta
            </p>
            <h1 className="text-xl md:text-2xl lg:text-3xl font-bold text-[#111827]">
              Meu Perfil
            </h1>
            <p className="text-xs lg:text-sm text-[#6B7280] max-w-2xl">
              Gerencie seus dados, segurança da conta e acompanhe seu desempenho na comunidade.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <motion.div
              initial={{ x: -50, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              className="lg:col-span-1 bg-white p-6 rounded-2xl border border-[#E5E7EB] flex flex-col items-center text-center shadow-sm"
            >
              <div className="relative">
                <div className="w-32 h-32 rounded-full border-4 border-tc-red object-cover overflow-hidden">
                  {getAvatarComponent(user)}
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute bottom-0 right-0 bg-white rounded-full text-tc-red hover:bg-muted shadow-sm"
                  onClick={() => setIsEditModalOpen(true)}
                >
                  <Edit className="w-4 h-4" />
                </Button>
              </div>
              <h2 className="text-xl md:text-2xl font-bold mt-4 text-[#111827]">{user.name}</h2>
              <div className={`flex items-center gap-2 mt-1 font-semibold ${userTypeDisplay[user.user_type]?.color}`}>
                <UserTypeIcon className="w-4 h-4" />
                <span>{userTypeDisplay[user.user_type]?.text}</span>
              </div>
              
              <Link to="/painel-usuario" className="w-full">
                <Button variant="default" className="mt-6 w-full gap-2 bg-tc-red hover:bg-tc-red/90">
                  <LayoutGrid className="w-4 h-4" />
                  Acessar Meu Painel
                </Button>
              </Link>

              <div className="flex flex-col sm:flex-row gap-2 mt-8 w-full">
                <Link to="/alterar-senha" className="flex-1">
                  <Button variant="outline" className="w-full gap-2">
                    <KeyRound className="w-4 h-4" />
                    Alterar Senha
                  </Button>
                </Link>
                <Button variant="outline" onClick={handleLogout} className="flex-1 gap-2">
                  <LogOut className="w-4 h-4" />
                  Sair
                </Button>
              </div>
              <Link to="/excluir-conta" className="w-full mt-4">
                <Button variant="outline" className="w-full text-destructive hover:text-destructive hover:bg-destructive/10 border-destructive/20">
                  Excluir Conta
                </Button>
              </Link>
            </motion.div>

            <motion.div
              initial={{ y: 50, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.15 }}
              className="lg:col-span-2 space-y-8"
            >
              <Card className="bg-white p-6 rounded-2xl border border-[#E5E7EB] shadow-sm">
                <CardHeader className="p-0 mb-4">
                  <CardTitle className="text-lg md:text-2xl font-bold text-[#111827] flex items-center gap-2">
                    <Award className="w-6 h-6 text-tc-yellow" />
                    Gamificação e Ranking
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <Tabs defaultValue="reports" className="w-full">
                    <TabsList className="grid w-full grid-cols-3 bg-white/80 border border-[#E5E7EB] rounded-xl">
                      <TabsTrigger value="reports" className="gap-1 text-xs md:text-sm">
                        <FileText className="w-4 h-4" />
                        Mais Broncas
                      </TabsTrigger>
                      <TabsTrigger value="upvotes" className="gap-1 text-xs md:text-sm">
                        <ThumbsUp className="w-4 h-4" />
                        Mais Apoios
                      </TabsTrigger>
                      <TabsTrigger value="comments" className="gap-1 text-xs md:text-sm">
                        <MessageSquare className="w-4 h-4" />
                        Mais Comentários
                      </TabsTrigger>
                    </TabsList>
                    <TabsContent value="reports" className="mt-4">
                      <RankingList items={rankings.reports} icon={FileText} currentUserId={user.id} />
                    </TabsContent>
                    <TabsContent value="upvotes" className="mt-4">
                      <RankingList items={rankings.upvotes} icon={ThumbsUp} currentUserId={user.id} />
                    </TabsContent>
                    <TabsContent value="comments" className="mt-4">
                      <RankingList items={rankings.comments} icon={MessageSquare} currentUserId={user.id} />
                    </TabsContent>
                  </Tabs>
                </CardContent>
              </Card>
            </motion.div>
          </div>
        </motion.div>
      </div>
      {isEditModalOpen && (
        <EditProfileModal
          user={user}
          onClose={() => setIsEditModalOpen(false)}
          onSave={handleProfileUpdate}
        />
      )}
    </>
  );
};

export default ProfilePage;

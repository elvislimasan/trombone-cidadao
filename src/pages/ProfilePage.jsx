import React, { useState, useEffect, useCallback } from 'react';
import { Helmet } from 'react-helmet';
import { motion } from 'framer-motion';
import { User, Briefcase, Edit, LogOut, ThumbsUp, MessageSquare, FileText, KeyRound, Shield, Trash2, LayoutDashboard, Star, HardHat, ShieldCheck, Radar } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import EditProfileModal from '@/components/EditProfileModal';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useNavigate, Link } from 'react-router-dom';
import { supabase } from '@/lib/customSupabaseClient';
import { placar } from '@/lib/scoring';
import { calcularSequencia, avaliarConquistas } from '@/lib/patrolGame';
import AchievementGrid from '@/components/missions/AchievementGrid';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import Avatar from 'react-nice-avatar';
import { Capacitor } from '@capacitor/core';
import { useTheme } from '@/design-system/theme/ThemeProvider';
import { useNotifications } from '@/contexts/NotificationContext';
import { useCity } from '@/contexts/CityContext';
import Icon from '@/design-system/icons';
import { showAppError } from '@/lib/appError';

// Meses abreviados em portugues para "Membro desde".
const MONTHS_PT = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

function formatMemberSince(createdAt) {
  if (!createdAt) return null;
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) return null;
  return `${MONTHS_PT[date.getMonth()]}/${date.getFullYear()}`;
}

const ProfilePage = () => {
  const { user, signOut, refreshUserProfile } = useAuth();
  const { preference, setPreference } = useTheme();
  const { notificationsEnabled, toggleNotifications, loading: notificationsLoading } = useNotifications();
  const { setActiveCity } = useCity();
  const navigate = useNavigate();
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [rankings, setRankings] = useState({ reports: [], upvotes: [], comments: [] });
  const [userLevel, setUserLevel] = useState(null);
  const [conquistas, setConquistas] = useState([]);

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

  // O nivel vem do MESMO calculo da central de missoes (src/lib/scoring.js),
  // nao mais do `get_user_level`.
  //
  // A funcao do banco continua existindo e correta — ela so nao conhece o bonus
  // das etapas de missao, que sao um catalogo JavaScript. Enquanto o perfil a
  // usava, a mesma pessoa via um total aqui e outro maior na central, sem nada
  // na tela explicando a diferenca.
  //
  // A tela nao pode quebrar se a RPC falhar ou ainda nao existir no banco: sem
  // dado, o bloco de nivel simplesmente nao aparece.
  const fetchUserLevel = useCallback(async (userId) => {
    const { data, error } = await supabase.rpc('get_mission_counters', {
      target_user_id: userId,
    });
    if (error) {
      console.error("Erro ao buscar contadores do usuario:", error);
      setUserLevel(null);
      return;
    }
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) {
      setUserLevel(null);
      return;
    }

    const contadores = {
      ...row,
      confirmadasPorCategoria: row.confirmed_by_category ?? {},
      registradasPorCategoria: row.reported_by_category ?? {},
    };

    setUserLevel(placar(contadores));

    // A mesma consulta alimenta as medalhas: a sequência de dias é função pura
    // sobre as datas que a RPC já devolve.
    setConquistas(
      avaliarConquistas({
        ...contadores,
        sequencia: calcularSequencia(contadores.patrol_days || []),
      })
    );
  }, []);

  useEffect(() => {
    if (!user) {
      navigate('/login');
    } else {
      fetchRankings();
      fetchUserLevel(user.id);
    }
  }, [user, navigate, fetchRankings, fetchUserLevel]);

  const handleProfileUpdate = async (updatedData) => {
    // city_id/city vêm juntos: "city" é o nome desnormalizado que telas antigas
    // ainda leem. Gravar só o id deixaria as duas colunas discordando —
    // "Recife" no texto e o id de outra cidade.
    const cityChanged = String(updatedData.city_id ?? '') !== String(user.city_id ?? '');
    const { error } = await supabase
      .from('profiles')
      .update({
        name: updatedData.name,
        avatar_type: updatedData.avatar_type,
        avatar_url: updatedData.avatar_url,
        avatar_config: updatedData.avatar_config,
        city_id: updatedData.city_id ?? null,
        city: updatedData.city ?? null,
      })
      .eq('id', user.id);

    if (error) {
      showAppError({ title: "Erro ao atualizar perfil", description: error.message, variant: "destructive" });
    } else {
      await refreshUserProfile();
      // Trocar a cidade do perfil não move sozinha a cidade ATIVA: essa é uma
      // escolha separada, guardada no localStorage pelo CityContext, e que
      // pode estar propositalmente em outra cidade. Trocamos junto porque, no
      // fluxo "me mudei", manter o feed na cidade antiga é exatamente o bug
      // que essa tela veio consertar.
      if (cityChanged && updatedData.city_id) setActiveCity(updatedData.city_id);
    }
  };

  const handleLogout = async () => {
    await signOut();
    // Sem toast: quem tocou em "Sair" sabe que saiu, e a tela de login que
    // aparece em seguida é a confirmação. O toast só repetia o óbvio por cima.
    navigate('/login');
  };

  const userTypeDisplay = {
    citizen: { icon: User, text: 'Cidadão', color: 'text-status-progressFg' },
    public_official: { icon: Briefcase, text: 'Órgão Público', color: 'text-success-fg' }
  };

  if (!user) {
    return <div className="flex justify-center items-center h-screen">Carregando...</div>;
  }

  const UserTypeIcon = userTypeDisplay[user.user_type]?.icon || User;
  const memberSince = formatMemberSince(user.created_at);

  const getAvatarComponent = (profile) => {
    if (!profile) return <Avatar className="w-full h-full" />;

    if ((profile.avatar_type === 'url' || profile.avatar_type === 'upload') && profile.avatar_url) {
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

  // Item de lista com icone a esquerda, rotulo e chevron a direita.
  const SettingsRow = ({ icon, label, to, onClick, danger = false }) => {
    const content = (
      <div
        className={`flex items-center gap-3 w-full px-3 py-3 rounded-xl transition-colors hover:bg-surface-subtleHover ${
          danger ? 'text-danger' : 'text-content-primary'
        }`}
      >
        <span className={`flex items-center justify-center w-9 h-9 rounded-full flex-shrink-0 ${
          danger ? 'bg-danger-subtleBg text-danger' : 'bg-surface-subtle text-content-secondary'
        }`}>
          {icon}
        </span>
        <span className="flex-1 text-left text-sm font-medium">{label}</span>
        <Icon name="chevronright" size={18} className="text-content-tertiary flex-shrink-0" />
      </div>
    );

    if (onClick) {
      return (
        <button type="button" onClick={onClick} className="w-full text-left">
          {content}
        </button>
      );
    }

    return (
      <Link to={to} className="w-full block">
        {content}
      </Link>
    );
  };

  // Medalha de posicao no ranking: 1o/2o/3o ganham destaque, os demais ficam
  // neutros. Sem token proprio de ouro/prata/bronze no design system, usamos
  // accentHighlight para o 1o lugar e neutros/marca-sutil para os seguintes.
  const rankBadgeClass = (index) => {
    if (index === 0) return 'bg-accentHighlight text-content-primary';
    if (index === 1) return 'bg-surface-sunken text-content-secondary';
    if (index === 2) return 'bg-brand-subtleBg text-brand-subtleFg';
    return 'bg-surface-subtle text-content-tertiary';
  };

  const RankingList = ({ items, icon: Icon2, currentUserId }) => (
    <div className="space-y-2">
      {items.map((item, index) => {
        const isCurrentUser = item.id === currentUserId;
        const isTop3 = index < 3;

        return (
          <div
            key={item.id}
            className={`flex items-center gap-3 p-2.5 rounded-xl border border-edge-subtle bg-surface-raised hover:border-edge-default hover:shadow-elevation-1 transition ${
              isCurrentUser ? 'ring-2 ring-brand/30' : ''
            }`}
          >
            <span
              className={`flex items-center justify-center w-7 h-7 text-xs font-bold rounded-full flex-shrink-0 ${rankBadgeClass(index)}`}
            >
              {index + 1}
            </span>
            <div className="w-10 h-10 rounded-full overflow-hidden bg-surface-subtle flex-shrink-0">
              {getAvatarComponent(item)}
            </div>
            <div className="flex flex-col flex-grow min-w-0">
              <span className="font-medium text-xs md:text-sm text-content-primary truncate">
                {item.name}
              </span>
              <div className="flex items-center gap-2 text-2xs">
                {isCurrentUser && (
                  <span className="px-2 py-0.5 rounded-full bg-danger-subtleBg text-danger-subtleFg text-2xs font-semibold">
                    Você
                  </span>
                )}
                {isTop3 && !isCurrentUser && (
                  <span className="px-2 py-0.5 rounded-full bg-status-progressBg text-status-progressFg text-2xs font-semibold">
                    Destaque
                  </span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-1 text-xs md:text-sm text-content-secondary flex-shrink-0">
              <Icon2 className="w-4 h-4" />
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
      <div className="flex flex-col bg-surface-base md:px-6">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="px-4 md:px-6 lg:px-10 xl:px-14 pt-4 pb-8 space-y-4 max-w-[88rem] mx-auto w-full"
        >
          {/* Card do usuario */}
          <motion.div
            initial={{ y: -20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            className="bg-surface-raised p-6 rounded-2xl border border-edge-subtle shadow-elevation-1 relative"
          >
            {userLevel && (
              <div className="absolute top-4 right-4 md:top-6 md:right-6 text-right">
                <p className="font-display font-bold text-lg md:text-xl text-brand leading-none">
                  Nível {userLevel.level}
                </p>
                <p className="text-2xs text-content-tertiary mt-1">{userLevel.label}</p>
                {/* O total agora aparece: sem ele, subir de nivel parecia
                    acontecer sozinho, e o bonus das missoes ficava invisivel. */}
                <p className="text-2xs font-semibold text-content-tertiary mt-0.5 tabular-nums">
                  {userLevel.points} pts
                  {userLevel.pontosMissoes > 0 && (
                    <span className="text-brand"> · +{userLevel.pontosMissoes}</span>
                  )}
                </p>
              </div>
            )}

            <div className="flex items-center gap-4 pr-24 md:pr-32">
              <div className="relative flex-shrink-0">
                <div className="w-20 h-20 md:w-24 md:h-24 rounded-full border-4 border-brand object-cover overflow-hidden bg-surface-subtle">
                  {getAvatarComponent(user)}
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute -bottom-1 -right-1 w-8 h-8 bg-surface-raised rounded-full text-brand hover:bg-surface-subtleHover shadow-elevation-1 border border-edge-subtle"
                  onClick={() => setIsEditModalOpen(true)}
                  aria-label="Editar perfil"
                >
                  <Edit className="w-4 h-4" />
                </Button>
              </div>
              <div className="min-w-0">
                <h2 className="text-lg md:text-xl font-bold text-content-primary truncate">{user.name}</h2>
                <div className={`flex items-center gap-1.5 mt-1 text-sm font-semibold ${userTypeDisplay[user.user_type]?.color}`}>
                  <UserTypeIcon className="w-4 h-4" />
                  <span>{userTypeDisplay[user.user_type]?.text}</span>
                </div>
                {memberSince && (
                  <p className="text-2xs text-content-tertiary mt-1">
                    Membro desde {memberSince}
                  </p>
                )}
              </div>
            </div>

            <div className="w-full mt-5 space-y-2">
              {/* "Minhas Broncas" saiu daqui em ago/2026: apontava para
                  /painel-usuario?tab=reports, e a aba de broncas ja e a que o
                  painel abre por padrao — eram dois botoes para a mesma tela.
                  Ficou "Meu Painel", que e o nome da tela de verdade.

                  Os atalhos abaixo vieram do menu do avatar no header. O avatar
                  saiu de la no mobile (virou a aba Perfil da barra inferior),
                  entao eles se juntaram aos que ja existiam aqui.

                  O destaque em vermelho é dele, e não de "Minhas Petições":
                  petição é o que uma minoria das pessoas cria, o painel é para
                  onde todo mundo volta. */}
              <Link to="/painel-usuario" className="w-full block">
                <Button variant="default" className="w-full justify-between gap-2 bg-cta-bg text-cta-fg border border-cta-border hover:bg-brand-hover">
                  <span className="flex items-center gap-2">
                    <LayoutDashboard className="w-4 h-4" />
                    Meu Painel
                  </span>
                  <Icon name="chevronright" size={16} />
                </Button>
              </Link>
              {/* Veio do cartão de configurações, onde era uma linha chamada
                  "Admin" entre "Privacidade" e "Sair da conta" — o lugar de
                  quem mexe numa preferência uma vez por ano, não o de quem
                  entra no painel várias vezes por dia.

                  Logo abaixo do CTA porque, para quem é admin, esta é a tela
                  mais visitada da lista: ordem por frequência de uso, não por
                  hierarquia. Mesma condição do AdminRoute (`is_admin`), senão o
                  atalho levaria a um redirecionamento silencioso. */}
              {user?.is_admin && (
                <Link to="/admin" className="w-full block">
                  <Button variant="outline" className="w-full justify-between gap-2">
                    <span className="flex items-center gap-2">
                      <Shield className="w-4 h-4" />
                      Painel Administrativo
                    </span>
                    <Icon name="chevronright" size={16} />
                  </Button>
                </Link>
              )}
              <Link to="/minhas-peticoes" className="w-full block">
                <Button variant="outline" className="w-full justify-between gap-2">
                  <span className="flex items-center gap-2">
                    <FileText className="w-4 h-4" />
                    Minhas Petições
                  </span>
                  <Icon name="chevronright" size={16} />
                </Button>
              </Link>
              {/* Veio da tela de missões em ago/2026. Lá ele fazia a tela
                  terminar olhando para trás; aqui fica ao lado dos outros
                  "meus": painel, favoritas, petições. */}
              <Link to="/minhas-patrulhas" className="w-full block">
                <Button variant="outline" className="w-full justify-between gap-2">
                  <span className="flex items-center gap-2">
                    <Radar className="w-4 h-4" />
                    Minhas Patrulhas
                  </span>
                  <Icon name="chevronright" size={16} />
                </Button>
              </Link>
              <Link to="/favoritos" className="w-full block">
                <Button variant="outline" className="w-full justify-between gap-2">
                  <span className="flex items-center gap-2">
                    <Star className="w-4 h-4" />
                    Broncas Favoritas
                  </span>
                  <Icon name="chevronright" size={16} />
                </Button>
              </Link>
              <Link to="/obras-favoritas" className="w-full block">
                <Button variant="outline" className="w-full justify-between gap-2">
                  <span className="flex items-center gap-2">
                    <HardHat className="w-4 h-4" />
                    Obras Favoritas
                  </span>
                  <Icon name="chevronright" size={16} />
                </Button>
              </Link>
              {(user.is_ambassador || user.is_master) && (
                <Link to="/embaixador" className="w-full block">
                  <Button variant="outline" className="w-full justify-between gap-2">
                    <span className="flex items-center gap-2">
                      <ShieldCheck className="w-4 h-4" />
                      Painel Embaixador
                    </span>
                    <Icon name="chevronright" size={16} />
                  </Button>
                </Link>
              )}
            </div>
          </motion.div>

          {/* Card Aparencia + configuracoes */}
          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.05 }}
            className="bg-surface-raised p-6 rounded-2xl border border-edge-subtle shadow-elevation-1"
          >
            <div className="flex items-center gap-2 mb-1">
              <Icon name="soundon" size={20} className="text-content-primary" />
              <h3 className="font-display font-bold text-base text-content-primary">
                Aparência
              </h3>
            </div>
            <p className="text-xs text-content-secondary mb-3">
              Escolha como o app deve ser exibido
            </p>
            <div className="grid grid-cols-3 gap-2 mb-2">
              {[
                { key: 'light', label: 'Claro' },
                { key: 'dark', label: 'Escuro' },
                { key: 'system', label: 'Automático' },
              ].map((opt) => {
                const active = preference === opt.key;
                return (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => setPreference(opt.key)}
                    aria-pressed={active}
                    className={`rounded-xl border px-3 py-2.5 text-xs font-semibold transition-colors ${
                      active
                        ? 'border-brand bg-brand-subtleBg text-brand'
                        : 'border-edge-subtle bg-surface-base text-content-secondary hover:text-content-primary'
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>

            <div className="mt-4 pt-4 border-t border-edge-subtle space-y-1">
              <SettingsRow
                icon={<KeyRound className="w-4 h-4" />}
                label="Alterar senha"
                to="/alterar-senha"
              />
              <SettingsRow
                icon={<Icon name="bell" size={16} />}
                label="Notificações"
                to="/settings/notifications"
              />
              {/* Liga/desliga rapido, equivalente ao switch que ficava no menu
                  do avatar. As preferencias detalhadas seguem na linha acima. */}
              <div className="flex items-center gap-3 w-full px-3 py-3 rounded-xl">
                <span className="flex items-center justify-center w-9 h-9 rounded-full flex-shrink-0 bg-surface-subtle text-content-secondary">
                  <Icon name="bell" size={16} />
                </span>
                <div className="flex-1 flex flex-col text-left">
                  <span className="text-sm font-medium text-content-primary">Notificações do Site</span>
                  <span className="text-xs text-content-secondary">
                    {notificationsEnabled ? 'Ativadas' : 'Desativadas'}
                  </span>
                </div>
                <Switch
                  checked={notificationsEnabled}
                  onCheckedChange={() => { toggleNotifications().catch(() => {}); }}
                  disabled={notificationsLoading}
                  aria-label="Notificações do Site"
                />
              </div>
              <SettingsRow
                icon={<Shield className="w-4 h-4" />}
                label="Privacidade"
                to="/termos-de-uso"
              />
              {Capacitor.isNativePlatform() && (
                <SettingsRow
                  icon={<Briefcase className="w-4 h-4" />}
                  label="Preferências"
                  to="/perfil/preferencias"
                />
              )}
              {/* "Admin" ficava aqui; subiu para o cartão de atalhos. */}
              <SettingsRow
                icon={<LogOut className="w-4 h-4" />}
                label="Sair da conta"
                onClick={handleLogout}
              />
            </div>

            <Link to="/excluir-conta" className="w-full mt-4 block">
              <Button variant="outline" className="w-full gap-2 text-danger hover:text-danger hover:bg-danger-subtleBg border-danger/30">
                <Trash2 className="w-4 h-4" />
                Excluir conta
              </Button>
            </Link>
          </motion.div>

          {/* Conquistas.

              Vieram da central de missões, e não só por espaço: medalha e
              missão são de tempos diferentes. Missão é o que há para fazer
              agora — renova a meta e sai da lista quando acaba. Medalha é o que
              já foi feito, para sempre. O perfil é onde se olha para trás. */}
          {conquistas.length > 0 && (
            <motion.div
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.05 }}
              className="bg-surface-raised p-6 rounded-2xl border border-edge-subtle shadow-elevation-1"
            >
              <AchievementGrid conquistas={conquistas} />
            </motion.div>
          )}

          {/* Card Gamificacao e Ranking */}
          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.1 }}
            className="bg-surface-raised p-6 rounded-2xl border border-edge-subtle shadow-elevation-1"
          >
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Icon name="ambassador" size={22} className="text-brand" />
                <h3 className="font-display font-bold text-lg md:text-xl text-content-primary">
                  Gamificação e Ranking
                </h3>
              </div>
              <Link to="/estatisticas" className="text-xs md:text-sm font-semibold text-brand hover:underline flex-shrink-0">
                Ver ranking geral
              </Link>
            </div>

            <Tabs defaultValue="reports" className="w-full">
              <TabsList className="grid w-full grid-cols-3 bg-surface-subtle border border-edge-subtle rounded-xl">
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
          </motion.div>
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

import React, { useEffect } from 'react';
import { Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet';
import { Toaster } from '@/components/ui/toaster';
import {Toaster as SonnerToast} from 'sonner'
import { Capacitor } from '@capacitor/core';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import BottomNav from '@/components/BottomNav';
import AppDownloadBanner from '@/components/AppDownloadBanner';
import HomePage from '@/pages/HomePage';
import AboutPage from '@/pages/AboutPage';
import StatsPage from '@/pages/StatsPage';
import ProfilePage from '@/pages/ProfilePage';
import PublicWorksPage from '@/pages/PublicWorksPage';
import PavementMapPage from '@/pages/PavementMapPage';
import ServicesPage from '@/pages/ServicesPage';
import NewsPage from '@/pages/NewsPage';
import NewsDetailsPage from '@/pages/NewsDetailsPage';
import AdminPage from '@/pages/admin/AdminPage';
import UserDashboardPage from '@/pages/UserDashboardPage';
import TransportDetailsPage from '@/pages/TransportDetailsPage';
import TouristSpotDetailsPage from '@/pages/TouristSpotDetailsPage';
import ManageServicesPage from '@/pages/admin/ManageServicesPage';
import ManageNewsPage from '@/pages/admin/ManageNewsPage';
import ManageWorksPage from '@/pages/admin/ManageWorksPage';
import ManagePavementPage from '@/pages/admin/ManagePavementPage';
import SiteSettingsPage from '@/pages/admin/SiteSettingsPage';
import ManageUsersPage from '@/pages/admin/ManageUsersPage';
import ManageCategoriesPage from '@/pages/admin/ManageCategoriesPage';
import ManageWorkOptionsPage from '@/pages/admin/ManageWorkOptionsPage';
import ManageReportsPage from '@/pages/admin/ManageReportsPage';
import LoginPage from '@/pages/LoginPage';
import RegisterPage from '@/pages/RegisterPage';
import ForgotPasswordPage from '@/pages/ForgotPasswordPage';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import ReportPage from '@/pages/ReportPage';
import WorkDetailsPage from '@/pages/WorkDetailsPage';
import ModerationPage from '@/pages/admin/ModerationPage';
import ChangePasswordPage from '@/pages/ChangePasswordPage';
import TermsOfUsePage from '@/pages/TermsOfUsePage';
import FavoritesPage from '@/pages/FavoritesPage';
import FavoriteWorksPage from '@/pages/FavoriteWorksPage';
import ContactPage from '@/pages/ContactPage';
import TrashPage from '@/pages/admin/TrashPage';
import NotificationPreferences from './pages/NotificationPreferences';
import DeleteAccountPage from './pages/DeleteAccountPage';

const SEO = () => {
  const location = useLocation();
  const siteName = import.meta.env.VITE_APP_NAME || "Trombone Cidadão";
  const defaultDescription = "Plataforma colaborativa para solicitação de serviços públicos em Floresta-PE. Registre, acompanhe e resolva as broncas da sua cidade.";
  
  // Base URL automática - detecta automaticamente o ambiente
  const getBaseUrl = () => {
    // 1. Prioridade: Variável de ambiente (configurada no Vercel)
    if (import.meta.env.VITE_APP_URL) {
      return import.meta.env.VITE_APP_URL.replace(/\/$/, '');
    }
    
    // 2. Se estiver no navegador, detectar automaticamente
    if (typeof window !== 'undefined') {
      const origin = window.location.origin;
      
      // Se for localhost, usar localhost
      if (origin.includes('localhost')) {
        return origin;
      }
      // Se for Vercel (dev), usar Vercel
      if (origin.includes('trombone-cidadao.vercel.app') || origin.includes('vercel.app')) {
        return origin;
      }
      // Se for domínio de produção, usar produção
      if (origin.includes('trombonecidadao.com.br')) {
        return 'https://trombonecidadao.com.br';
      }
      // Fallback: usar a origem atual
      return origin;
    }
    
    // 3. Fallback final: produção
    return 'https://trombonecidadao.com.br';
  };
  
  const baseUrl = getBaseUrl();
  const defaultImage = `${baseUrl}/images/thumbnail.jpg`;
  
  let pageTitle = `${siteName} - Sua bronca tem voz!`;
  let pageDescription = defaultDescription;
  let pageImage = defaultImage;
  const canonicalUrl = `${baseUrl}${location.pathname}`;

  // IMPORTANTE: Se estiver em uma página de bronca, não definir og:image aqui
  // Deixa o DynamicSEO da página de bronca definir a imagem correta
  const isReportPage = location.pathname.startsWith('/bronca/');

  // Customize titles and descriptions per route
  switch (location.pathname) {
    case '/sobre':
      pageTitle = `Sobre o ${siteName}`;
      pageDescription = `Saiba mais sobre o projeto ${siteName}, nossa missão, visão e como você pode colaborar para uma cidade melhor.`;
      break;
    case '/estatisticas':
      pageTitle = `Estatísticas - ${siteName}`;
      pageDescription = "Acompanhe em tempo real as estatísticas de solicitações, resoluções e o engajamento cívico em Floresta-PE.";
      break;
    case '/obras-publicas':
      pageTitle = `Mapa de Obras Públicas - ${siteName}`;
      pageDescription = "Mapa interativo e informações sobre as obras públicas em Floresta-PE.";
      break;
    case '/mapa-pavimentacao':
      pageTitle = `Mapa de Pavimentação - ${siteName}`;
      pageDescription = "Consulte o status da pavimentação das ruas de Floresta-PE e acompanhe o progresso.";
      break;
    case '/noticias':
      pageTitle = `Notícias - ${siteName}`;
      pageDescription = "Fique por dentro das últimas notícias e atualizações relevantes para a cidade de Floresta-PE.";
      break;
    case '/favoritos':
      pageTitle = `Meus Favoritos - ${siteName}`;
      pageDescription = "Acompanhe as broncas que você marcou como favoritas.";
      break;
    case '/contato':
      pageTitle = `Contato - ${siteName}`;
      pageDescription = "Entre em contato com a equipe do Trombone Cidadão. Envie sua mensagem ou fale conosco pelo WhatsApp.";
      break;
    case '/admin':
      pageTitle = `Painel Administrativo - ${siteName}`;
      pageDescription = "Painel administrativo para gerenciamento da plataforma.";
      break;
  }

  return (
    <Helmet>
      {/* Meta Tags Básicas */}
      <title>{pageTitle}</title>
      <meta name="description" content={pageDescription} />
      <link rel="canonical" href={canonicalUrl} />
      
      {/* Open Graph Meta Tags */}
      <meta property="og:type" content="website" />
      <meta property="og:title" content={pageTitle} />
      <meta property="og:description" content={pageDescription} />
      <meta property="og:url" content={canonicalUrl} />
      <meta property="og:site_name" content={siteName} />
      {/* IMPORTANTE: Só definir og:image se NÃO for página de bronca
          Quando for página de bronca, o DynamicSEO define a imagem correta */}
      {!isReportPage && <meta property="og:image" content={pageImage} />}
      {!isReportPage && <meta property="og:image:width" content="1200" />}
      {!isReportPage && <meta property="og:image:height" content="600" />}
      {!isReportPage && <meta property="og:image:type" content="image/jpeg" />}
      {!isReportPage && <meta property="og:image:alt" content={`Imagem do ${siteName}`} />}
      <meta property="og:locale" content="pt_BR" />
      
      {/* Twitter Card Meta Tags */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={pageTitle} />
      <meta name="twitter:description" content={pageDescription} />
      {/* IMPORTANTE: NÃO definir twitter:image aqui se não for página de bronca */}
      {!isReportPage && <meta name="twitter:image" content={pageImage} />}
      {!isReportPage && <meta name="twitter:image:alt" content={`Imagem do ${siteName}`} />}
    </Helmet>
  );
};

const PrivateRoute = ({ children }) => {
  const { user, loading } = useAuth();
  if (loading) return <div className="flex justify-center items-center h-screen">Carregando...</div>;
  return user ? children : <Navigate to="/login" />;
};

const AdminRoute = ({ children }) => {
  const { user, loading } = useAuth();
  if (loading) return <div className="flex justify-center items-center h-screen">Carregando...</div>;
  return user && user.is_admin ? children : <Navigate to="/" />;
};

function App() {
  const navigate = useNavigate();
  const location = useLocation();

  // ✅ Handler para Deep Links (App Links)
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    let urlListener = null;

    const handleDeepLink = (url) => {
      try {
        // Extrair o ID da bronca da URL
        // Formatos suportados:
        // - trombonecidadao://bronca/[ID]
        // - https://trombone-cidadao.vercel.app/bronca/[ID]
        // - https://trombonecidadao.com.br/bronca/[ID]
        
        let reportId = null;
        
        // Verificar se é um deep link customizado
        if (url.includes('trombonecidadao://bronca/')) {
          reportId = url.split('trombonecidadao://bronca/')[1]?.split('?')[0]?.split('#')[0];
        }
        // Verificar se é um link HTTPS
        else if (url.includes('/bronca/')) {
          reportId = url.split('/bronca/')[1]?.split('?')[0]?.split('#')[0];
        }
        
        if (reportId) {
          // Navegar para a página da bronca
          if (location.pathname !== `/bronca/${reportId}`) {
            navigate(`/bronca/${reportId}`, { replace: true });
          }
        }
      } catch (error) {
        // Erro silencioso - deep link não funcionou
      }
    };

    const handleAppUrl = async () => {
      try {
        const { App } = await import('@capacitor/app');
        
        // Verificar URL quando o app abre (app foi aberto por um link)
        try {
          const appUrl = await App.getLaunchUrl();
          if (appUrl?.url) {
            // Delay pequeno para garantir que o router está pronto
            setTimeout(() => {
              handleDeepLink(appUrl.url);
            }, 500);
          }
        } catch (error) {
          // getLaunchUrl pode falhar se não houver URL, isso é normal
        }

        // Listener para quando o app recebe uma URL enquanto está aberto
        urlListener = App.addListener('appUrlOpen', (event) => {
          handleDeepLink(event.url);
        });
      } catch (error) {
        // Erro silencioso ao configurar deep links
      }
    };

    handleAppUrl();

    return () => {
      if (urlListener) {
        urlListener.remove();
      }
    };
  }, [navigate, location.pathname]);

  return (
    <>
      <SEO />
      <div className="min-h-screen bg-background text-foreground flex flex-col">
        <Header />
        <AppDownloadBanner />
        <main className="flex-grow pb-20 lg:pb-0" style={{ paddingTop: 'calc(4rem + var(--safe-area-top) + var(--app-banner-height, 0px))', paddingBottom: 'calc(4rem + var(--safe-area-bottom))' }}>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/cadastro" element={<RegisterPage />} />
            <Route path="/recuperar-senha" element={<ForgotPasswordPage />} />
            <Route path="/termos-de-uso" element={<TermsOfUsePage />} />
            
            <Route path="/" element={<HomePage />} />
            <Route path="/bronca/:reportId" element={<ReportPage />} />
            <Route path="/sobre" element={<AboutPage />} />
            <Route path="/estatisticas" element={<StatsPage />} />
            <Route path="/obras-publicas" element={<PublicWorksPage />} />
            <Route path="/obras-publicas/:workId" element={<WorkDetailsPage />} />
            <Route path="/mapa-pavimentacao" element={<PavementMapPage />} />
            <Route path="/servicos" element={<ServicesPage />} />
            <Route path="/servicos/transporte/:id" element={<TransportDetailsPage />} />
            <Route path="/servicos/ponto-turistico/:id" element={<TouristSpotDetailsPage />} />
            <Route path="/noticias" element={<NewsPage />} />
            <Route path="/noticias/:newsId" element={<NewsDetailsPage />} />
            <Route path="/contato" element={<ContactPage />} />

            <Route path="/perfil" element={<PrivateRoute><ProfilePage /></PrivateRoute>} />
            <Route path="/favoritos" element={<PrivateRoute><FavoritesPage /></PrivateRoute>} />
            <Route path="/obras-favoritas" element={<PrivateRoute><FavoriteWorksPage /></PrivateRoute>} />
            <Route path="/painel-usuario" element={<PrivateRoute><UserDashboardPage /></PrivateRoute>} />
            <Route path="/alterar-senha" element={<PrivateRoute><ChangePasswordPage /></PrivateRoute>} />
            <Route path="/excluir-conta" element={<PrivateRoute><DeleteAccountPage /></PrivateRoute>} />
            
            <Route path="/admin" element={<AdminRoute><AdminPage /></AdminRoute>} />
            <Route path="/admin/moderacao/:type" element={<AdminRoute><ModerationPage /></AdminRoute>} />
            <Route path="/admin/usuarios" element={<AdminRoute><ManageUsersPage /></AdminRoute>} />
            <Route path="/admin/servicos" element={<AdminRoute><ManageServicesPage /></AdminRoute>} />
            <Route path="/admin/noticias" element={<AdminRoute><ManageNewsPage /></AdminRoute>} />
            <Route path="/admin/obras" element={<AdminRoute><ManageWorksPage /></AdminRoute>} />
            <Route path="/admin/obras/opcoes" element={<AdminRoute><ManageWorkOptionsPage /></AdminRoute>} />
            <Route path="/admin/pavimentacao" element={<AdminRoute><ManagePavementPage /></AdminRoute>} />
            <Route path="/admin/configuracoes" element={<AdminRoute><SiteSettingsPage /></AdminRoute>} />
            <Route path="/admin/categorias" element={<AdminRoute><ManageCategoriesPage /></AdminRoute>} />
            <Route path="/admin/broncas" element={<AdminRoute><ManageReportsPage /></AdminRoute>} />
            <Route path="/admin/lixeira" element={<AdminRoute><TrashPage /></AdminRoute>} />
            <Route path="/settings/notifications" element={<NotificationPreferences />} />
          </Routes>
        </main>
        <Footer />
        <BottomNav />
        <Toaster />
        <SonnerToast position="top-right" richColors />
      </div>
    </>
  );
}

export default App;
import React from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { Helmet } from 'react-helmet';
import { Toaster } from '@/components/ui/toaster';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import BottomNav from '@/components/BottomNav';
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

const SEO = () => {
  const location = useLocation();
  const siteName = import.meta.env.VITE_APP_NAME || "Trombone Cidadão";
  const defaultDescription = "Plataforma colaborativa para solicitação de serviços públicos em Floresta-PE. Registre, acompanhe e resolva as broncas da sua cidade.";
  
  // Base URL automática - fallback robusto para Vercel
  const getBaseUrl = () => {
    if (import.meta.env.VITE_APP_URL) return import.meta.env.VITE_APP_URL;
    if (typeof window !== 'undefined') return window.location.origin;
    return 'https://trombone-cidadao-39i52984n-elvis-limas-projects.vercel.app/';
  };
  
  const baseUrl = getBaseUrl();
  const defaultImage = `${baseUrl}/images/thumbnail.jpg`;
  
  let pageTitle = `${siteName} - Sua bronca tem voz!`;
  let pageDescription = defaultDescription;
  let pageImage = defaultImage;
  const canonicalUrl = `${baseUrl}${location.pathname}`;

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
      <meta property="og:image" content={pageImage} />
      <meta property="og:image:width" content="1200" />
      <meta property="og:image:height" content="630" />
      <meta property="og:image:type" content="image/jpeg" />
      <meta property="og:locale" content="pt_BR" />
      
      {/* Twitter Card Meta Tags */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={pageTitle} />
      <meta name="twitter:description" content={pageDescription} />
      <meta name="twitter:image" content={pageImage} />
      
      {/* Meta Tags Adicionais para WhatsApp */}
      <meta name="twitter:image:alt" content={`Imagem do ${siteName}`} />
      <meta property="og:image:alt" content={`Imagem do ${siteName}`} />
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
  return (
    <>
      <SEO />
      <div className="min-h-screen bg-background text-foreground flex flex-col pt-safe">
        <Header />
        <main className="pt-16 flex-grow pb-20 lg:pb-0">
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
          </Routes>
        </main>
        <Footer />
        <BottomNav />
        <Toaster />
      </div>
    </>
  );
}

export default App;
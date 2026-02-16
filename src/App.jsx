import React, { useEffect } from 'react';
import { Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet';
import { Toaster } from '@/components/ui/toaster';
import {Toaster as SonnerToast} from 'sonner'
import { Capacitor } from '@capacitor/core';
import { App as CapacitorApp } from '@capacitor/app';
import { Preferences } from '@capacitor/preferences';
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
import ManagePetitionsPage from '@/pages/admin/ManagePetitionsPage';
import LoginPage from '@/pages/LoginPage';
import RegisterPage from '@/pages/RegisterPage';
import ForgotPasswordPage from '@/pages/ForgotPasswordPage';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useToast } from '@/components/ui/use-toast';
import ReportPage from '@/pages/ReportPage';
import PetitionPage from '@/pages/PetitionPage';
import PetitionPageModern from '@/pages/PetitionPageModern';
import PetitionsOverviewPage from '@/pages/PetitionsOverviewPage';
import WorkDetailsPage from '@/pages/WorkDetailsPage';
import ModerationPage from '@/pages/admin/ModerationPage';
import ChangePasswordPage from '@/pages/ChangePasswordPage';
import TermsOfUsePage from '@/pages/TermsOfUsePage';
import FavoritesPage from '@/pages/FavoritesPage';
import FavoriteWorksPage from '@/pages/FavoriteWorksPage';
import ContactPage from '@/pages/ContactPage';
import TrashPage from '@/pages/admin/TrashPage';
import MyPetitionsPage from '@/pages/MyPetitionsPage';
import NotificationPreferences from './pages/NotificationPreferences';
import DeleteAccountPage from './pages/DeleteAccountPage';
import { VideoProcessor } from '@/plugins/VideoProcessor';
import { UploadProvider } from '@/contexts/UploadContext';
import WebUploadIndicator from '@/components/WebUploadIndicator';
import UploadStatusBar from '@/components/UploadStatusBar';
import HomePageImproved from './pages/HomePage-improved';

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
      
      {/* Favicons (forçar presença em todas as rotas) */}
      <link rel="icon" href="/favicon.ico" />
      <link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png" />
      <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
      <link rel="manifest" href="/manifest.json" />
      <meta name="theme-color" content="#dc2626" />
      
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
  const { toast } = useToast();

  // ✅ Handler para Restauração de Estado (Android Activity Killed)
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    const setupListener = async () => {
      // 0. Tentar recuperar manualmente via SharedPreferences (caso appRestoredResult falhe)
      try {
        const recovered = await VideoProcessor.recoverLostPhoto();
        if (recovered && (recovered.filePath || recovered.nativePath)) {
         
           
           window.__PENDING_RESTORED_PHOTO__ = recovered;
           
           toast({
             title: "Foto recuperada!",
             description: "Sua foto foi restaurada após o reinício.",
             duration: 4000
           });

           // Se estivermos na home, dispara; senão navega
           setTimeout(() => {
              window.dispatchEvent(new CustomEvent('open-report-modal-with-photo'));
              if (window.location.pathname !== '/') {
                navigate('/', { replace: true });
              }
           }, 1000);
        }
      } catch (e) {
//          console.warn('Erro ao verificar fotos perdidas:', e);
      }

      // 1. Listener padrão do Capacitor para restauração de plugin
      await CapacitorApp.addListener('appRestoredResult', (data) => {
//         console.log('🔄 App restaurado com resultado (Global):', data);
        
        // Feedback visual imediato
        toast({
           title: "Restaurando aplicativo...",
           description: "Recuperando sua sessão após uso da câmera.",
           duration: 3000
        });
        
        // Verificar se é resultado de foto
        if ((data.pluginId === 'VideoProcessor' && data.methodName === 'capturePhoto') || 
            (data.pluginId === 'Camera' && (data.methodName === 'getPhoto' || data.methodName === 'pickImages'))) {
          
          if (data.success && data.data) {
//             console.log('📸 Foto recuperada após morte da Activity!');
            
            // Salvar dados globalmente para o Modal recuperar
            window.__PENDING_RESTORED_PHOTO__ = data.data;
            
            // Disparar evento para abrir o modal na Home
            setTimeout(() => {
              window.dispatchEvent(new CustomEvent('open-report-modal-with-photo'));
              if (window.location.pathname !== '/') {
                navigate('/', { replace: true });
              }
            }, 1000);
          } else {
//              console.warn('⚠️ App restaurado mas sem dados de sucesso:', data);
             // Se falhou o plugin, tenta abrir o modal para verificar rascunho
             setTimeout(() => {
                window.dispatchEvent(new CustomEvent('open-report-modal-with-photo'));
             }, 1000);
          }
        }
      });

      // 2. Verificação de Segurança: Checar se existe rascunho salvo (caso appRestoredResult falhe)
      try {
        const { value } = await Preferences.get({ key: 'report_draft' });
        if (value) {
//             console.log('📦 Rascunho encontrado na inicialização! Tentando restaurar...');
            // Se encontrou rascunho, significa que o app morreu durante o form
            // Vamos forçar a abertura do modal
            setTimeout(() => {
                 window.dispatchEvent(new CustomEvent('open-report-modal-with-photo'));
            }, 1500); // Delay um pouco maior para garantir carga
        }
      } catch (e) {
        console.error('Erro ao verificar rascunho:', e);
      }
    };
    
    setupListener();
  }, [navigate, toast]);

  // ✅ Handler para navegação via eventos customizados (sem recarregar)
  useEffect(() => {
    const handleNavigateTo = (event) => {
      try {
        // Verificar se navegação está bloqueada (durante processamento de foto/vídeo)
        if (window.__BLOCK_NAVIGATION__) {
//           console.log('Navegação bloqueada durante processamento de mídia');
          return;
        }
        
        const { url } = event.detail;
        if (url && window.location.pathname !== url) {
          // Usar React Router para navegar sem recarregar
          navigate(url, { replace: false });
        }
      } catch (error) {
        console.error('Erro ao navegar via evento:', error);
      }
    };

    window.addEventListener('navigate-to', handleNavigateTo);

    return () => {
      window.removeEventListener('navigate-to', handleNavigateTo);
    };
  }, [navigate]);

  // ✅ Guardas globais para evitar reload durante erros de mídia
  useEffect(() => {
    const handleGlobalError = (event) => {
      const msg = event.error?.message || event.error?.toString() || '';
      const isMediaRelated = msg.includes('Memory') || msg.includes('blob') || msg.includes('File');
      if (window.__BLOCK_MODAL_CLOSE__ || window.__BLOCK_NAVIGATION__ || isMediaRelated) {
        event.preventDefault?.();
        return false;
      }
      return undefined;
    };

    const handleGlobalRejection = (event) => {
      const msg = event.reason?.message || event.reason?.toString() || '';
      const isMediaRelated = msg.includes('Memory') || msg.includes('blob') || msg.includes('File');
      if (window.__BLOCK_MODAL_CLOSE__ || window.__BLOCK_NAVIGATION__ || isMediaRelated) {
        event.preventDefault?.();
        return false;
      }
      return undefined;
    };

    window.addEventListener('error', handleGlobalError, true);
    window.addEventListener('unhandledrejection', handleGlobalRejection);
    return () => {
      window.removeEventListener('error', handleGlobalError, true);
      window.removeEventListener('unhandledrejection', handleGlobalRejection);
    };
  }, []);

  const launchUrlProcessed = React.useRef(false);

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
          // Usar window.location.pathname para evitar dependência do hook location
          if (!window.location.pathname.includes(`/bronca/${reportId}`)) {
//             console.log(`🔗 Deep Link detectado: Navegando para bronca ${reportId}`);
            navigate(`/bronca/${reportId}`, { replace: true });
          }
        }
      } catch (error) {
        // Erro silencioso - deep link não funcionou
        console.error('Erro ao processar deep link:', error);
      }
    };

    const handleAppUrl = async () => {
      try {
        const { App } = await import('@capacitor/app');
        
        // Verificar URL quando o app abre (app foi aberto por um link)
        // Usar ref para garantir que só verificamos uma vez por sessão
        if (!launchUrlProcessed.current) {
          launchUrlProcessed.current = true;
          try {
            const appUrl = await App.getLaunchUrl();
            if (appUrl?.url) {
//               console.log('🚀 App iniciado via URL:', appUrl.url);
              // Delay pequeno para garantir que o router está pronto
              setTimeout(() => {
                handleDeepLink(appUrl.url);
              }, 500);
            }
          } catch (error) {
            // getLaunchUrl pode falhar se não houver URL, isso é normal
          }
        }

        // Listener para quando o app recebe uma URL enquanto está aberto
        urlListener = await App.addListener('appUrlOpen', (event) => {
//           console.log('🔗 App recebeu URL (appUrlOpen):', event.url);
          handleDeepLink(event.url);
        });
      } catch (error) {
        console.error('Erro ao configurar deep links:', error);
      }
    };

    handleAppUrl();

    return () => {
      if (urlListener) {
        Promise.resolve(urlListener).then(listener => listener && listener.remove && listener.remove());
      }
    };
  }, [navigate]); // Remover location.pathname para evitar loops

  return (
    <UploadProvider>
      <SEO />
      <div className="min-h-screen bg-[#FFF] text-foreground flex flex-col">
        <Header />
        <AppDownloadBanner />
        <main className="flex-grow pb-20 lg:pb-0" style={{ paddingTop: 'calc(4rem + var(--safe-area-top) + var(--app-banner-height, 0px))', paddingBottom: 'calc(4rem + var(--safe-area-bottom))' }}>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/cadastro" element={<RegisterPage />} />
            <Route path="/recuperar-senha" element={<ForgotPasswordPage />} />
            <Route path="/termos-de-uso" element={<TermsOfUsePage />} />
            
            <Route path="/" element={<HomePageImproved />} />
            <Route path="/broncas" element={<HomePage />} />
            <Route path="/bronca/:reportId" element={<ReportPage />} />
          <Route path="/abaixo-assinados" element={<PetitionsOverviewPage />} />
          <Route path="/abaixo-assinado/:id" element={<PetitionPage />} />
          <Route path="/abaixo-assinado-moderno/:id" element={<PetitionPageModern />} />
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
            <Route path="/minhas-peticoes" element={<PrivateRoute><MyPetitionsPage /></PrivateRoute>} />
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
            <Route path="/admin/reports" element={<AdminRoute><ManageReportsPage /></AdminRoute>} />
            <Route path="/admin/broncas" element={<AdminRoute><ManageReportsPage /></AdminRoute>} />
            <Route path="/admin/petitions" element={<AdminRoute><ManagePetitionsPage /></AdminRoute>} />
            <Route path="/admin/assinaturas" element={<AdminRoute><ManagePetitionsPage /></AdminRoute>} />
            <Route path="/admin/signatures" element={<Navigate to="/admin/petitions" replace />} />
            <Route path="/admin/trash" element={<AdminRoute><TrashPage /></AdminRoute>} />
            <Route path="/admin/lixeira" element={<AdminRoute><TrashPage /></AdminRoute>} />
            <Route path="/settings/notifications" element={<NotificationPreferences />} />
          </Routes>
        </main>
        <Footer />
        <BottomNav />
        <Toaster />
        <SonnerToast position="top-right" richColors />
        <WebUploadIndicator />
        <UploadStatusBar />
      </div>
    </UploadProvider>
  );
}

export default App;

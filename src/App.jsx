import React, { useEffect } from 'react';
import { Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet';
import { Toaster } from '@/components/ui/toaster';
import ErrorBoundary from '@/components/ErrorBoundary';
import {Toaster as SonnerToast} from 'sonner'
import { Capacitor } from '@capacitor/core';
import { App as CapacitorApp } from '@capacitor/app';
import { Preferences } from '@capacitor/preferences';
import { SplashScreen } from '@capacitor/splash-screen';
import { LocalNotifications } from '@capacitor/local-notifications';
import { FileOpener } from '@capacitor-community/file-opener';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import BottomNav from '@/components/BottomNav';
import AppDownloadBanner from '@/components/AppDownloadBanner';
import HomePage from '@/pages/HomePage';
import AboutPage from '@/pages/AboutPage';
import StatsPage from '@/pages/StatsPage';
import ProfilePage from '@/pages/ProfilePage';
import PublicWorksPage from '@/pages/PublicWorksPage';
import RentalPropertyDetailsPage from '@/pages/RentalPropertyDetailsPage';
import RentalPropertiesPage from '@/pages/RentalPropertiesPage';
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
import ManageRentalPropertiesPage from '@/pages/admin/ManageRentalPropertiesPage';
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
import WorkDetailsPageProject from '@/pages/WorkDetailsPageProject';
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
import MapPage from './pages/MapPage';
import HomeRouter from './pages/HomeRouter';
import NotFoundPage from '@/pages/NotFoundPage';
import SearchPage from '@/pages/SearchPage';
import AppLandingPage from '@/pages/AppLandingPage';
import MobileHeader from '@/components/MobileHeader';
import { MobileHeaderProvider } from '@/contexts/MobileHeaderContext';
import { NativeUIModeProvider, useNativeUIMode } from '@/contexts/NativeUIModeContext';
import NativePreferencesPage from '@/pages/NativePreferencesPage';
import AmbassadorPage from '@/pages/AmbassadorPage';
import ManageMastersPage from '@/pages/admin/ManageMastersPage';
import AmbassadorProfilePage from '@/pages/admin/AmbassadorProfilePage';
import CompleteProfilePage from '@/pages/CompleteProfilePage';
import AcceptInvitePage from '@/pages/AcceptInvitePage';
import BecomeAmbassadorPage from '@/pages/BecomeAmbassadorPage';
import PendingInviteBanner from '@/components/PendingInviteBanner';
import { usePermissions } from '@/hooks/usePermissions';
import ManagePermissionsPage from '@/pages/admin/ManagePermissionsPage';

const SEO = () => {
  const location = useLocation();
  const siteName = import.meta.env.VITE_APP_NAME || "Trombone Cidadão";
  const defaultDescription = "Plataforma colaborativa para solicitação de serviços públicos. Registre, acompanhe e resolva as broncas da sua cidade.";
  
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
      pageDescription = "Acompanhe em tempo real as estatísticas de solicitações, resoluções e o engajamento cívico na sua cidade.";
      break;
    case '/obras-publicas':
      pageTitle = `Mapa de Obras Públicas - ${siteName}`;
      pageDescription = "Mapa interativo e informações sobre as obras públicas na sua cidade.";
      break;
    case '/mapa-pavimentacao':
      pageTitle = `Mapa de Pavimentação - ${siteName}`;
      pageDescription = "Consulte o status da pavimentação das ruas da sua cidade e acompanhe o progresso.";
      break;
    case '/noticias':
      pageTitle = `Notícias - ${siteName}`;
      pageDescription = "Fique por dentro das últimas notícias e atualizações relevantes para a sua cidade.";
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

// Profile obrigatório: quem entrou (inclusive via Google) sem telefone, cidade
// ou sem aceitar os termos precisa completar o cadastro antes de usar o app.
const isProfileIncomplete = (user) =>
  !!user && (!user.phone || !user.city_id || !user.terms_accepted_at);

const PrivateRoute = ({ children }) => {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <div className="flex justify-center items-center h-screen">Carregando...</div>;
  if (!user) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }
  if (isProfileIncomplete(user) && location.pathname !== '/completar-cadastro') {
    return <Navigate to="/completar-cadastro" replace state={{ from: location }} />;
  }
  return children;
};

const AdminRoute = ({ children }) => {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <div className="flex justify-center items-center h-screen">Carregando...</div>;
  return user && user.is_admin
    ? children
    : (
      <Navigate
        to={user ? '/' : '/login'}
        replace
        state={!user ? { from: location } : undefined}
      />
    );
};

const AmbassadorOrAdminRoute = ({ children }) => {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <div className="flex justify-center items-center h-screen">Carregando...</div>;
  const allowed = user && (user.is_admin || user.is_master || user.is_ambassador);
  return allowed
    ? children
    : <Navigate to={user ? '/' : '/login'} replace state={!user ? { from: location } : undefined} />;
};

const MasterRoute = ({ children }) => {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <div className="flex justify-center items-center h-screen">Carregando...</div>;
  return user?.is_master
    ? children
    : <Navigate to={user ? '/' : '/login'} replace state={!user ? { from: location } : undefined} />;
};

// Camada de permissão por módulo sobre o guard de papel: o papel continua
// sendo pré-requisito, e a permissão (painel /admin/permissoes) pode revogar
// o acesso de escrita mesmo de quem tem o papel.
const ModuleRoute = ({ module, adminOnly = false, children }) => {
  const { canWrite, loading } = usePermissions();
  const Guard = adminOnly ? AdminRoute : AmbassadorOrAdminRoute;
  if (loading) return <div className="flex justify-center items-center h-screen">Carregando...</div>;
  if (!canWrite(module)) return <Navigate to="/" replace />;
  return <Guard>{children}</Guard>;
};

function AppShell() {
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  const { loading: authLoading } = useAuth();
  const { isNative, isInteractive } = useNativeUIMode();

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    if (window.__tcNotifListenerInstalled) return;
    window.__tcNotifListenerInstalled = true;

    let listener = null;
    const setup = async () => {
      try {
        listener = await LocalNotifications.addListener('localNotificationActionPerformed', async (notification) => {
          const filePath = notification.notification?.extra?.filePath;
          const contentType = notification.notification?.extra?.contentType;
          if (!filePath) return;
          try {
            await FileOpener.open({
              filePath,
              contentType: contentType || 'application/octet-stream',
            });
          } catch {
            toast({
              title: 'Não foi possível abrir',
              description: 'O arquivo pode não estar acessível no dispositivo.',
              variant: 'destructive',
            });
          }
        });
      } catch {}
    };
    setup();

    return () => {
      try {
        listener?.remove();
      } catch {}
    };
  }, [toast]);

  useEffect(() => {
    try {
      window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
    } catch {}
  }, [location.pathname]);

  // Safe area para browsers in-app (Instagram/Facebook)
  useEffect(() => {
    try {
      const ua = navigator.userAgent || '';
      const isInApp = /Instagram|FBAN|FBAV/i.test(ua);
      const isMobile = /Android|iPhone|iPad|iPod/i.test(ua);
      if (isInApp && isMobile) {
        const root = document.documentElement;
        // Ajustes conservadores para evitar sobreposição de barras
        root.style.setProperty('--safe-area-top', '8px', 'important');
        root.style.setProperty('--safe-area-bottom', '24px', 'important');
      }
    } catch {}
  }, []);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    if (authLoading) return;
    let raf1 = 0;
    let raf2 = 0;
    raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        try {
          if (Capacitor.isPluginAvailable('SplashScreen')) {
            SplashScreen.hide();
          }
        } catch {}
      });
    });
    return () => {
      try {
        cancelAnimationFrame(raf1);
        cancelAnimationFrame(raf2);
      } catch {}
    };
  }, [authLoading]);

  // ✅ Handler para Restauração de Estado (Android Activity Killed)
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    const setupListener = async () => {
      // 0. Tentar recuperar manualmente via SharedPreferences (caso appRestoredResult falhe)
      try {
        const recovered = await VideoProcessor.recoverLostPhoto();
        if (recovered && (recovered.filePath || recovered.nativePath)) {
          // Se câmera foi de outro contexto (ex: modal de atualização), não navega para /
          if (window.__NATIVE_CAMERA_CONTEXT__) {
            const rawPath = recovered.filePath || recovered.nativePath;
            window.__NATIVE_CAMERA_PENDING_PHOTO__ = {
              rawPath,
              filename: `photo_restored_${Date.now()}.jpg`,
            };
            window.__NATIVE_CAMERA_CONTEXT__ = null;
          } else {
            window.__PENDING_RESTORED_PHOTO__ = recovered;
            toast({
              title: "Foto recuperada!",
              description: "Sua foto foi restaurada após o reinício.",
              duration: 4000
            });
            setTimeout(() => {
              window.dispatchEvent(new CustomEvent('open-report-modal-with-photo'));
              if (window.location.pathname !== '/') {
                navigate('/', { replace: true });
              }
            }, 1000);
          }
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
            // Se a câmera foi aberta por useNativeCamera (ex: modal de atualização),
            // não navegar para / — o hook recuperará a foto via localStorage no remount.
            const nativeCameraCtx = (() => {
              try { return localStorage.getItem('__native_camera_context__'); } catch (_) { return null; }
            })();
            if (nativeCameraCtx === 'useNativeCamera') {
              try { localStorage.removeItem('__native_camera_context__'); } catch (_) {}
              const rawPath = data.data.filePath || data.data.path || data.data.webPath;
              if (rawPath) {
                try {
                  localStorage.setItem('__native_camera_pending_photo__', JSON.stringify({
                    rawPath, filename: `photo_restored_${Date.now()}.jpg`, ts: Date.now(),
                  }));
                } catch (_) {}
              }
              return; // não navega para /
            }

            // Fluxo padrão do ReportModal
            window.__PENDING_RESTORED_PHOTO__ = data.data;
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
      <MobileHeaderProvider>
        <div className="min-h-screen bg-[#F9FAFB] text-foreground flex flex-col">
          {(!isNative || !isInteractive) && <Header />}
          {isNative && isInteractive && <MobileHeader />}
          {!isNative && <AppDownloadBanner />}
          <main
            className="flex-grow pb-20 lg:pb-0 flex flex-col min-h-0"
            style={{
              paddingTop: (isNative && isInteractive)
                ? 'calc(4rem + var(--header-safe-top))'
                : 'calc(4rem + var(--header-safe-top) + var(--app-banner-height, 0px) + var(--desktop-extra-top, 0px))',
              paddingBottom: (isNative && isInteractive)
                ? 'calc(4.5rem + env(safe-area-inset-bottom, 0px))'
                : 'calc(5rem + env(safe-area-inset-bottom, 0px))',
            }}
          >
            <div className="flex-1 min-h-0 flex flex-col">
              <PendingInviteBanner />
              {/* key={pathname}: remonta o boundary a cada navegação, senão a tela
                  de erro persistiria mesmo depois de sair da rota que quebrou. */}
              <ErrorBoundary key={location.pathname}>
              <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route path="/cadastro" element={<RegisterPage />} />
              <Route path="/completar-cadastro" element={<CompleteProfilePage />} />
              <Route path="/seja-embaixador" element={<BecomeAmbassadorPage />} />
              <Route path="/recuperar-senha" element={<ForgotPasswordPage />} />
              <Route path="/termos-de-uso" element={<TermsOfUsePage />} />
              <Route path="/app" element={<AppLandingPage />} />
              <Route path="/convite/:token" element={<AcceptInvitePage />} />
              
              <Route path="/" element={<HomeRouter />} />
              <Route path="/mapa" element={<MapPage />} />
              <Route path="/home-legado" element={<HomePageImproved />} />
              <Route path="/buscar" element={<SearchPage />} />
              <Route path="/broncas" element={<HomePage />} />
              <Route path="/bronca/:reportId" element={<ReportPage />} />
            <Route path="/abaixo-assinados" element={<PetitionsOverviewPage />} />
            <Route path="/abaixo-assinado/:id" element={<PetitionPage />} />
            <Route path="/abaixo-assinado-moderno/:id" element={<PetitionPageModern />} />
              <Route path="/sobre" element={<AboutPage />} />
              <Route path="/estatisticas" element={<StatsPage />} />
              <Route path="/obras-publicas" element={<PublicWorksPage />} />
              <Route path="/obras-publicas/:workId" element={<WorkDetailsPageProject />} />
              <Route path="/imoveis-alugados" element={<RentalPropertiesPage />} />
              <Route path="/imoveis-alugados/:id" element={<RentalPropertyDetailsPage />} />
              <Route path="/mapa-pavimentacao" element={<PavementMapPage />} />
              <Route path="/servicos" element={<ServicesPage />} />
              <Route path="/servicos/transporte/:id" element={<TransportDetailsPage />} />
              <Route path="/servicos/ponto-turistico/:id" element={<TouristSpotDetailsPage />} />
              <Route path="/noticias" element={<NewsPage />} />
              <Route path="/noticias/:newsId" element={<NewsDetailsPage />} />
              <Route path="/contato" element={<ContactPage />} />
  
              <Route path="/perfil" element={<PrivateRoute><ProfilePage /></PrivateRoute>} />
              <Route path="/perfil/preferencias" element={<PrivateRoute><NativePreferencesPage /></PrivateRoute>} />
              <Route path="/minhas-peticoes" element={<PrivateRoute><MyPetitionsPage /></PrivateRoute>} />
              <Route path="/favoritos" element={<PrivateRoute><FavoritesPage /></PrivateRoute>} />
              <Route path="/obras-favoritas" element={<PrivateRoute><FavoriteWorksPage /></PrivateRoute>} />
              <Route path="/painel-usuario" element={<PrivateRoute><UserDashboardPage /></PrivateRoute>} />
              <Route path="/alterar-senha" element={<PrivateRoute><ChangePasswordPage /></PrivateRoute>} />
              <Route path="/excluir-conta" element={<PrivateRoute><DeleteAccountPage /></PrivateRoute>} />
              
              <Route path="/admin" element={<AdminRoute><AdminPage /></AdminRoute>} />
              <Route path="/admin/moderacao/:type" element={<ModuleRoute module="moderation" adminOnly><ModerationPage /></ModuleRoute>} />
              <Route path="/admin/usuarios" element={<AdminRoute><ManageUsersPage /></AdminRoute>} />
              <Route path="/admin/permissoes" element={<MasterRoute><ManagePermissionsPage /></MasterRoute>} />
              <Route path="/admin/servicos" element={<ModuleRoute module="services" adminOnly><ManageServicesPage /></ModuleRoute>} />
              <Route path="/servicos/gerenciar" element={<ModuleRoute module="services"><ManageServicesPage /></ModuleRoute>} />
              <Route path="/admin/noticias" element={<AdminRoute><ManageNewsPage /></AdminRoute>} />
              <Route path="/admin/obras" element={<ModuleRoute module="works" adminOnly><ManageWorksPage /></ModuleRoute>} />
              <Route path="/obras/gerenciar" element={<ModuleRoute module="works"><ManageWorksPage /></ModuleRoute>} />
              <Route path="/admin/imoveis-alugados" element={<ModuleRoute module="rentals" adminOnly><ManageRentalPropertiesPage /></ModuleRoute>} />
              <Route path="/imoveis-alugados/gerenciar" element={<ModuleRoute module="rentals"><ManageRentalPropertiesPage /></ModuleRoute>} />
              <Route path="/admin/obras/opcoes" element={<ModuleRoute module="works" adminOnly><ManageWorkOptionsPage /></ModuleRoute>} />
              <Route path="/admin/pavimentacao" element={<ModuleRoute module="pavement" adminOnly><ManagePavementPage /></ModuleRoute>} />
              <Route path="/pavimentacao/gerenciar" element={<ModuleRoute module="pavement"><ManagePavementPage /></ModuleRoute>} />
              <Route path="/admin/configuracoes" element={<AdminRoute><SiteSettingsPage /></AdminRoute>} />
              <Route path="/admin/categorias" element={<AdminRoute><ManageCategoriesPage /></AdminRoute>} />
              <Route path="/admin/reports" element={<ModuleRoute module="moderation" adminOnly><ManageReportsPage /></ModuleRoute>} />
              <Route path="/admin/broncas" element={<ModuleRoute module="moderation" adminOnly><ManageReportsPage /></ModuleRoute>} />
              <Route path="/admin/petitions" element={<AdminRoute><ManagePetitionsPage /></AdminRoute>} />
              <Route path="/admin/assinaturas" element={<AdminRoute><ManagePetitionsPage /></AdminRoute>} />
              <Route path="/admin/signatures" element={<Navigate to="/admin/petitions" replace />} />
              <Route path="/admin/trash" element={<AdminRoute><TrashPage /></AdminRoute>} />
              <Route path="/admin/lixeira" element={<AdminRoute><TrashPage /></AdminRoute>} />
              <Route path="/admin/embaixadores" element={<AdminRoute><ManageMastersPage /></AdminRoute>} />
              <Route path="/admin/embaixador/:id" element={<AdminRoute><AmbassadorProfilePage /></AdminRoute>} />
              <Route path="/embaixador" element={<PrivateRoute><AmbassadorPage /></PrivateRoute>} />
              <Route path="/settings/notifications" element={<NotificationPreferences />} />
              <Route path="*" element={<NotFoundPage />} />
            </Routes>
              </ErrorBoundary>
            </div>
          </main>
          {(!isNative || !isInteractive) && <Footer />}
          <BottomNav />
          <Toaster />
          <SonnerToast position="top-right" richColors />
          <WebUploadIndicator />
          <UploadStatusBar />
        </div>
      </MobileHeaderProvider>
    </UploadProvider>
  );
}

export default function App() {
  return (
    <NativeUIModeProvider>
      <AppShell />
    </NativeUIModeProvider>
  );
}

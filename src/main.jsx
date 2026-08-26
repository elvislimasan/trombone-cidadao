import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from '@/App';
import '@/index.css';
import 'leaflet/dist/leaflet.css';
import { AuthProvider } from '@/contexts/SupabaseAuthContext';
import { CityProvider } from '@/contexts/CityContext';
import { NotificationProvider } from './contexts/NotificationContext';
import { MapModeProvider } from './contexts/MapModeContext';
import { MissionProgressProvider } from './contexts/MissionProgressContext';
import { OfflineQueueProvider } from './contexts/OfflineQueueContext';
import { HelmetProvider } from 'react-helmet-async';
import { ThemeProvider } from '@/design-system/theme/ThemeProvider';
import { Capacitor } from '@capacitor/core';
import { StatusBar } from '@capacitor/status-bar';
import { SplashScreen } from '@capacitor/splash-screen';

// SOLUÇÃO ROBUSTA PARA SAFE AREAS EM PRODUÇÃO
// Aplicar safe areas no Capacitor usando múltiplos métodos para garantir compatibilidade
if (Capacitor.isNativePlatform()) {
  try {
    document.documentElement.classList.add('native-app');
    // Classe por plataforma para ajustes específicos de CSS (ex.: safe-area do header no iOS).
    document.documentElement.classList.add(`plt-${Capacitor.getPlatform()}`);
  } catch {}
  try {
    if (Capacitor.isPluginAvailable('SplashScreen')) {
      SplashScreen.show({ autoHide: false });
    }
  } catch {}
  const applySafeAreas = async () => {
    // iOS: confiar 100% no CSS env(safe-area-inset-*). Com viewport-fit=cover +
    // contentInset:'never', o env() é estável e correto. A medição via JS (StatusBar.getInfo
    // / intervalo de 5s) gerava valores inconsistentes — origem do "às vezes buga" no header.
    // Android mantém o cálculo atual (que já funciona).
    if (Capacitor.getPlatform() === 'ios') {
      return;
    }
    try {
      const root = document.documentElement;
      let safeAreaTop = '0px';
      let safeAreaBottom = '0px';
      
      // Método 1: Tentar obter do StatusBar plugin (mais confiável em produção)
      if (Capacitor.isPluginAvailable('StatusBar')) {
        try {
          const statusBarInfo = await StatusBar.getInfo();
          const statusBarHeight = statusBarInfo.overlays ? 0 : statusBarInfo.height || 0;
          
          if (statusBarHeight > 0) {
            safeAreaTop = `${statusBarHeight}px`;
          }
        } catch (e) {
          // Erro silencioso ao obter StatusBar
        }
      }
      
      // Método 2: Tentar obter do CSS env() (fallback)
      if (safeAreaTop === '0px') {
        try {
          // Criar elemento temporário para medir safe area
          const testDiv = document.createElement('div');
          testDiv.style.position = 'fixed';
          testDiv.style.top = 'env(safe-area-inset-top)';
          testDiv.style.visibility = 'hidden';
          testDiv.style.pointerEvents = 'none';
          testDiv.style.zIndex = '-9999';
          document.body.appendChild(testDiv);
          
          const computed = window.getComputedStyle(testDiv);
          const topValue = computed.top;
          document.body.removeChild(testDiv);
          
          if (topValue && topValue !== '0px' && topValue !== 'auto') {
            safeAreaTop = topValue;
          }
        } catch (e) {
          // Erro silencioso ao obter CSS env()
        }
      }
      
      // Método 3: Calcular manualmente usando window insets (fallback)
      if (safeAreaTop === '0px') {
        try {
          // Usar window.innerHeight vs screen.height para detectar status bar
          const screenHeight = window.screen.height;
          const windowHeight = window.innerHeight;
          const statusBarDiff = screenHeight - windowHeight;
          
          if (statusBarDiff > 0 && statusBarDiff < 100) {
            safeAreaTop = `${statusBarDiff}px`;
          } else {
            safeAreaTop = '0px';
          }
        } catch (e) {
          // Erro silencioso ao calcular manualmente
          safeAreaTop = '0px'; // Sem fallback
        }
      }
      
      // Detectar safe area bottom (barra de navegação)
      try {
        // Método 1: CSS env()
        const testDiv = document.createElement('div');
        testDiv.style.position = 'fixed';
        testDiv.style.bottom = 'env(safe-area-inset-bottom)';
        testDiv.style.visibility = 'hidden';
        testDiv.style.pointerEvents = 'none';
        testDiv.style.zIndex = '-9999';
        document.body.appendChild(testDiv);
        
        const computed = window.getComputedStyle(testDiv);
        const bottomValue = computed.bottom;
        document.body.removeChild(testDiv);
        
        if (bottomValue && bottomValue !== '0px' && bottomValue !== 'auto') {
          safeAreaBottom = bottomValue;
        }
      } catch (e) {
        // Ignorar
      }
      
      // Método 2: visualViewport (para detectar barra de navegação)
      if (safeAreaBottom === '0px' && window.visualViewport) {
        try {
          const viewportHeight = window.visualViewport.height;
          const windowHeight = window.innerHeight;
          const bottomInset = windowHeight - viewportHeight;
          
          if (bottomInset > 0 && bottomInset < 100) {
            safeAreaBottom = `${bottomInset}px`;
          }
        } catch (e) {
          // Ignorar
        }
      }
      
      // Não aplicar fallback - usar apenas valores detectados
      // Se safeAreaBottom for 0px, manter 0px (sem fallback)
      
      // Aplicar via CSS variables com !important para garantir
      root.style.setProperty('--safe-area-top', safeAreaTop, 'important');
      root.style.setProperty('--safe-area-bottom', safeAreaBottom, 'important');
      
      // NÃO aplicar padding diretamente no body - deixar os componentes gerenciarem
    } catch (error) {
      console.error('[Safe Areas] Erro ao aplicar:', error);
      // Sem fallback de emergência - usar 0px
      const root = document.documentElement;
      root.style.setProperty('--safe-area-top', '0px', 'important');
      root.style.setProperty('--safe-area-bottom', '0px', 'important');
      // NÃO aplicar padding no body
    }
  };
  
  // Aplicar imediatamente (não esperar DOMContentLoaded)
  const applyImmediately = () => {
    // Aplicar com múltiplos delays para garantir que funciona
    setTimeout(applySafeAreas, 0);
    setTimeout(applySafeAreas, 100);
    setTimeout(applySafeAreas, 500);
  };
  
  // Aplicar ao carregar
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', applyImmediately);
  } else {
    applyImmediately();
  }
  
  // Reaplicar em mudanças críticas
  window.addEventListener('resize', () => {
    setTimeout(applySafeAreas, 100);
  });
  
  window.addEventListener('orientationchange', () => {
    setTimeout(applySafeAreas, 200);
    setTimeout(applySafeAreas, 500);
  });
  
  // Observar mudanças no visualViewport
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', () => {
      setTimeout(applySafeAreas, 100);
    });
  }
  
  // Observar mudanças no StatusBar (se disponível)
  if (Capacitor.isPluginAvailable('StatusBar')) {
    // Reaplicar periodicamente para garantir (apenas em produção se necessário)
    setInterval(() => {
      if (document.readyState === 'complete') {
        applySafeAreas();
      }
    }, 5000); // A cada 5 segundos
  }
}

// Registrar service worker com atualização automática (apenas em produção)
if ('serviceWorker' in navigator) {
  const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  
  if (isLocalhost) {
    // No localhost, remove tambem os caches deixados por uma execucao antiga.
    // Apenas desinstalar o SW nao atualiza a aba que ainda esta usando o bundle
    // cacheado; isso fazia rotas recem-criadas cairem no 404 ate limpar os dados
    // do site manualmente.
    Promise.all([
      navigator.serviceWorker.getRegistrations().then((registrations) =>
        Promise.all(registrations.map((registration) => registration.unregister()))
      ),
      typeof caches !== 'undefined'
        ? caches.keys().then((cacheNames) =>
            Promise.all(cacheNames.map((cacheName) => caches.delete(cacheName)))
          )
        : Promise.resolve(),
    ]).then(() => {
      console.log('[SW] Service workers e caches removidos no desenvolvimento local');
    });
  } else {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js', {
        scope: '/',
        updateViaCache: 'none' // Sempre verificar atualizações
      })
        .then((registration) => {
          // Verificar atualizações periodicamente
          const updateInterval = setInterval(() => {
            registration.update();
          }, 60000); // A cada 1 minuto
          
          // Forçar atualização quando a página ganha foco
          const handleFocus = () => {
            registration.update();
          };
          window.addEventListener('focus', handleFocus);
          
          // Limpar listeners quando necessário (se a página for descarregada)
          window.addEventListener('beforeunload', () => {
            clearInterval(updateInterval);
            window.removeEventListener('focus', handleFocus);
          });
        })
        .catch((registrationError) => {
          console.error('SW registration failed: ', registrationError);
        });
    });
  }
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <>
    <BrowserRouter>
      <ThemeProvider>
        <AuthProvider>
          <CityProvider>
            <NotificationProvider>
              <MapModeProvider>
              <HelmetProvider>
                <MissionProgressProvider>
                  {/* O carteiro da fila offline. Uma instância só — ver o
                      cabeçalho do contexto. */}
                  <OfflineQueueProvider>
                    <App />
                  </OfflineQueueProvider>
                </MissionProgressProvider>
              </HelmetProvider>
              </MapModeProvider>
            </NotificationProvider>
          </CityProvider>
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  </>
);

// Fallback para garantir que a Splash esconda mesmo em cenários de cache limpo/lento
if (Capacitor.isNativePlatform()) {
  try {
    if (Capacitor.isPluginAvailable('SplashScreen')) {
      setTimeout(() => {
        try {
          SplashScreen.hide();
        } catch {}
      }, 1800);
    }
  } catch {}
}

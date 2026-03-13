import React, { createContext, useState, useEffect, useContext, useCallback, useRef } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { App } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import { Capacitor } from '@capacitor/core';

const getSiteUrl = () => {
  if (import.meta.env.VITE_APP_URL) {
    return import.meta.env.VITE_APP_URL.replace(/\/$/, '');
  }
  if (typeof window !== 'undefined') {
    return window.location.origin;
  }
  return '';
};

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const userRef = useRef(null);

  // Sincronizar userRef com o estado user
  useEffect(() => {
    userRef.current = user;
  }, [user]);

  const fetchUserProfile = useCallback(async (authUser) => {
    if (!authUser) {
      setUser(null);
      setLoading(false);
      return null;
    }

    try {
      // Adicionar timeout para a busca de perfil para evitar "travar" a inicialização
      const fetchPromise = supabase
        .from('profiles')
        .select('*')
        .eq('id', authUser.id)
        .single();
      
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Profile fetch timeout')), 5000)
      );

      const { data: profile, error } = await Promise.race([fetchPromise, timeoutPromise]);

      if (error) {
        console.error("Error fetching user profile:", error);
        setUser(authUser); // Fallback to auth user
      } else {
        const fullUser = { ...authUser, ...profile };
        setUser(fullUser);
      }
    } catch (err) {
      console.error("Profile fetch exception or timeout:", err);
      setUser(authUser); // Fallback to auth user em caso de timeout/erro
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshUserProfile = useCallback(async () => {
    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (authUser) {
      await fetchUserProfile(authUser);
    }
  }, [fetchUserProfile]);

  // Função interna para processar callback de autenticação (URL completa ou hash)
  const _handleAuthCallback = useCallback(async (urlOrHash, mounted = true) => {
    if (!urlOrHash) return false;

    console.log("Auth callback detected, attempting manual recovery...", urlOrHash);
    try {
      let code = null;
      let accessToken = null;
      let refreshToken = null;
      
      // Parse robusto usando URL API
      let urlObj;
      try {
        urlObj = new URL(urlOrHash);
      } catch (e) {
        // Se falhar (ex: path relativo), tenta montar uma URL completa
        if (urlOrHash.startsWith('/') || urlOrHash.startsWith('#') || urlOrHash.startsWith('?')) {
           urlObj = new URL(urlOrHash, getSiteUrl() || 'http://localhost');
        } else {
           // Se for apenas fragmentos ou inválido
           console.warn("Could not parse URL:", urlOrHash);
           return false;
        }
      }

      // 1. Verificar Search Params (PKCE - code)
      const searchParams = urlObj.searchParams;
      code = searchParams.get('code');
      
      // 2. Verificar Hash Params (Implicit - access_token)
      // urlObj.hash inclui o '#', removemos com substring(1)
      if (urlObj.hash) {
        const hashParams = new URLSearchParams(urlObj.hash.substring(1));
        accessToken = hashParams.get('access_token');
        refreshToken = hashParams.get('refresh_token');
        // Às vezes o code também vem no hash em certas implementações ou redirecionamentos mal formados
        if (!code) code = hashParams.get('code');
      }

      // Tratamento para PKCE (code exchange)
      if (code) {
        console.log("Found code in URL, attempting exchangeCodeForSession...");
        const { data, error } = await supabase.auth.exchangeCodeForSession(code);
        
        if (error) {
          console.error("Manual exchangeCodeForSession failed:", error);
        } else if (data?.session) {
          console.log("Session recovered from code. User:", data.session.user.email);
          if (mounted) {
            await fetchUserProfile(data.session.user);
            // Limpar URL para evitar reuso do code
            if (window.history.replaceState && !Capacitor.isNativePlatform()) {
               const cleanUrl = window.location.href.split('?')[0].split('#')[0];
               window.history.replaceState(null, '', cleanUrl);
            }
          }
          return true;
        }
      }

      // Tratamento para Implicit Flow (access_token)
      if (accessToken) {
        console.log("Found access_token in hash, attempting setSession...");
        
        const { data, error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken || '',
        });

        if (error) {
          console.error("Manual setSession failed:", error);
        } else if (data?.session) {
          console.log("Session recovered manually from hash. User:", data.session.user.email);
          if (mounted) {
             await fetchUserProfile(data.session.user);
             // Limpar o hash da URL após sucesso
             if (window.location.hash && !Capacitor.isNativePlatform()) {
                window.location.hash = ''; 
             }
          }
          return true; // Sucesso
        } else {
           console.warn("Manual setSession returned no error but no session data either.");
        }
      }
    } catch (e) {
      console.error("Error parsing auth url/hash:", e);
    }
    return false;
  }, [fetchUserProfile]);

  useEffect(() => {
    let mounted = true;
    let appListener = null;
    let resumeListener = null;

    const initAuth = async () => {
      try {
        console.log("Initializing auth...");
        // 1. Tentar recuperar sessão da URL atual
        let recovered = false;
        
        // Se for nativo, verifica o Launch URL primeiro (Deep Link de inicialização)
        if (Capacitor.isNativePlatform()) {
           try {
             const launchUrl = await App.getLaunchUrl();
             if (launchUrl?.url) {
                console.log("Checking Launch URL for auth:", launchUrl.url);
                recovered = await _handleAuthCallback(launchUrl.url, mounted);
             }
           } catch (e) {
             console.warn("Failed to get launch URL:", e);
           }
        }

        // Se não recuperou via Launch URL (ou é Web), tenta URL atual
        if (!recovered) {
           const currentUrl = window.location.href;
           recovered = await _handleAuthCallback(currentUrl, mounted);
        }
        
        if (recovered) return;

        // 2. Se não houve recuperação manual, verificar sessão existente
        console.log("Getting current session...");
        
        // Timeout para getSession()
        const sessionPromise = supabase.auth.getSession();
        const sessionTimeout = new Promise((_, reject) => 
           setTimeout(() => reject(new Error('getSession timeout')), 8000)
        );

        try {
          const { data: { session }, error } = await Promise.race([sessionPromise, sessionTimeout]);
          
          if (error) {
            console.error("Error getting session:", error.message);
            if (error.message.includes('Invalid Refresh Token') || error.message.includes('not found')) {
              await supabase.auth.signOut();
            }
            if (mounted) {
              setUser(null);
              setLoading(false);
            }
          } else if (session) {
            console.log("Session found for user:", session.user.email);
            if (mounted) await fetchUserProfile(session.user);
          } else {
            console.log("No session found.");
            if (mounted) {
              setUser(null);
              setLoading(false);
            }
          }
        } catch (sessionErr) {
          console.error("getSession failed or timed out:", sessionErr);
          if (mounted) {
            setUser(null);
            setLoading(false);
          }
        }
      } catch (err) {
        console.error("Unexpected auth error during initAuth:", err);
        if (mounted) setLoading(false);
      }
    };

    initAuth();

    // Listener para App Links (Capacitor/Nativo)
    if (Capacitor.isNativePlatform()) {
      App.addListener('appUrlOpen', async ({ url }) => {
        console.log('App URL Open detected:', url);
        // Pass full URL to handle both hash and search params
        const recovered = await _handleAuthCallback(url, mounted);
        if (recovered) {
          try {
            await Browser.close();
          } catch (e) {
            // Ignore if Browser.close fails or Browser not open
          }
        }
      }).then(listener => {
        appListener = listener;
      });

      // Listener para retorno do background (Resume)
      // 🔥 CRÍTICO: Quando o app volta de um longo período em background,
      // a sessão pode ter expirado ou o webview pode estar em estado inconsistente.
      App.addListener('appStateChange', async ({ isActive }) => {
        if (isActive) {
          console.log('App resumed. Verifying session...');
          try {
            const { data: { session }, error } = await supabase.auth.getSession();
            if (error) {
              console.error("Error verifying session on resume:", error);
              if (error.message.includes('Invalid Refresh Token')) {
                await supabase.auth.signOut();
                setUser(null);
              }
            } else if (session) {
              console.log("Session verified on resume.");
              // Opcional: atualizar perfil se necessário
            } else if (userRef.current) {
              // Se tínhamos um usuário mas agora não temos sessão, forçar logout
              console.warn("Session lost on resume. Clearing user state.");
              setUser(null);
            }
          } catch (e) {
            console.error("Unexpected error verifying session on resume:", e);
          }
        }
      }).then(listener => {
        resumeListener = listener;
      });
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log("Auth state change event:", event);
      if (!mounted) return;

      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        if (session) {
          console.log("User signed in or token refreshed. Fetching profile...");
          await fetchUserProfile(session.user);
        }
      } else if (event === 'SIGNED_OUT') {
        console.log("User signed out.");
        setUser(null);
        setLoading(false);
      } else if (event === 'INITIAL_SESSION') {
        if (session) {
          await fetchUserProfile(session.user);
        }
      } else if (event === 'USER_UPDATED') {
        if (session) await fetchUserProfile(session.user);
      }
    });

    // Safety timeout (reduzido para 12s para dar tempo aos timeouts internos)
    const timeoutId = setTimeout(() => {
      if (mounted) {
        setLoading(prev => {
          if (prev) {
            console.warn("Auth loading global timeout reached, forcing app render to prevent white screen");
            return false;
          }
          return prev;
        });
      }
    }, 12000);

    return () => {
      mounted = false;
      subscription?.unsubscribe();
      clearTimeout(timeoutId);
      if (appListener) {
        appListener.remove();
      }
      if (resumeListener) {
        resumeListener.remove();
      }
    };
  }, [fetchUserProfile, _handleAuthCallback]);

  const signUp = useCallback(async (email, password, meta) => {
    const redirectTo = `${getSiteUrl()}/painel-usuario`;
    const { data: { user: authUser }, error } = await supabase.auth.signUp({ 
      email, 
      password, 
      options: {
        data: meta.data,
        emailRedirectTo: redirectTo
      } 
    });
    if (error) {
      console.error("Erro no cadastro:", error.message);
    }
    return { authUser, error };
  }, []);

  const signIn = useCallback(async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      console.error("Erro no login:", error.message);
    }
    return { error };
  }, []);

  const signInWithGoogle = useCallback(async () => {
    let redirectTo = getSiteUrl();

    // Ajuste para redirecionamento em App Nativo (Capacitor)
    if (Capacitor.isNativePlatform()) {
      // Certifique-se de adicionar esta URL nas "Redirect URLs" no painel do Supabase
      // Usando 'painel-usuario' conforme preferência do usuário (basta adicionar no AndroidManifest)
      redirectTo = 'com.trombonecidadao.app://painel-usuario';
      console.log("Native platform detected. Setting redirectTo:", redirectTo);
    } else {
      console.log("Web platform detected. Setting redirectTo:", redirectTo);
    }

    // Em plataformas nativas, usamos Browser.open com skipBrowserRedirect para garantir retorno ao app via deep link
    let data, error;
    if (Capacitor.isNativePlatform()) {
      ({ data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo,
          queryParams: {
            access_type: 'offline',
            prompt: 'consent',
          },
          skipBrowserRedirect: true,
        },
      }));
      if (!error && data?.url) {
        await Browser.open({ url: data.url, presentationStyle: 'fullscreen' });
      }
    } else {
      ({ data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo,
          queryParams: {
            access_type: 'offline',
            prompt: 'consent',
          },
        },
      }));
    }
    if (error) {
      console.error("Erro no login com Google:", error.message);
    }
    return { data, error };
  }, []);

  const resetPassword = useCallback(async (email) => {
    const redirectTo = `${getSiteUrl()}/alterar-senha`;
    const { data, error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: redirectTo,
    });
    if (error) {
      console.error("Erro ao solicitar redefinição de senha:", error.message);
    }
    return { data, error };
  }, []);

  const signOut = useCallback(async () => {
    const { error } = await supabase.auth.signOut();
    if (error && error.message !== 'Session from session_id claim in JWT does not exist') {
      console.error("Erro ao sair:", error.message);
    }
    setUser(null); // Ensure user state is cleared regardless of this specific error
    return { error };
  }, []);

  const value = {
    signUp,
    signIn,
    signInWithGoogle,
    resetPassword,
    signOut,
    user,
    loading,
    refreshUserProfile,
  };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

import React, { createContext, useState, useEffect, useContext, useCallback } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { App } from '@capacitor/app';
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

  const fetchUserProfile = useCallback(async (authUser) => {
    if (!authUser) {
      setUser(null);
      setLoading(false);
      return null;
    }

    const { data: profile, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', authUser.id)
      .single();

    if (error) {
      console.error("Error fetching user profile:", error);
      setUser(authUser); // Fallback to auth user
    } else {
      const fullUser = { ...authUser, ...profile };
      setUser(fullUser);
    }
    setLoading(false);
    return profile;
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

    const initAuth = async () => {
      try {
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
        const { data: { session }, error } = await supabase.auth.getSession();
        
        if (error) {
          console.error("Error getting session:", error.message);
          if (error.message.includes('Invalid Refresh Token')) {
            await supabase.auth.signOut();
          }
          if (mounted) {
            setUser(null);
            setLoading(false);
          }
        } else if (session) {
          if (mounted) await fetchUserProfile(session.user);
        } else {
          if (mounted) {
            setUser(null);
            setLoading(false);
          }
        }
      } catch (err) {
        console.error("Unexpected auth error:", err);
        if (mounted) setLoading(false);
      }
    };

    initAuth();

    // Listener para App Links (Capacitor/Nativo)
    if (Capacitor.isNativePlatform()) {
      App.addListener('appUrlOpen', async ({ url }) => {
        console.log('App URL Open detected:', url);
        // Pass full URL to handle both hash and search params
        await _handleAuthCallback(url, mounted);
      }).then(listener => {
        appListener = listener;
      });
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log("Auth state change:", event);
      if (!mounted) return;

      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        if (session) await fetchUserProfile(session.user);
      } else if (event === 'SIGNED_OUT') {
        setUser(null);
        setLoading(false);
      } else if (event === 'INITIAL_SESSION') {
        if (session) {
          await fetchUserProfile(session.user);
        }
      }
    });

    // Safety timeout
    const timeoutId = setTimeout(() => {
      if (mounted) {
        setLoading(prev => {
          if (prev) {
            console.warn("Auth loading timeout reached, forcing app render");
            return false;
          }
          return prev;
        });
      }
    }, 10000);

    return () => {
      mounted = false;
      subscription?.unsubscribe();
      clearTimeout(timeoutId);
      if (appListener) {
        appListener.remove();
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

    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: redirectTo,
        queryParams: {
          access_type: 'offline',
          prompt: 'consent',
        },
      },
    });
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

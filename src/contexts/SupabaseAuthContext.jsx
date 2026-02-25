import React, { createContext, useState, useEffect, useContext, useCallback } from 'react';
import { supabase } from '@/lib/customSupabaseClient';

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

  useEffect(() => {
    let mounted = true;

    const initAuth = async () => {
      try {
        // 1. Tentar recuperar sessão do hash da URL (Prioridade Máxima para callbacks OAuth)
        const hash = window.location.hash;
        if (hash && (hash.includes('access_token') || hash.includes('type=recovery'))) {
          console.log("Auth hash detected, attempting manual recovery...");
          try {
            // Tenta limpar caracteres estranhos que as vezes aparecem no hash
            const cleanHash = hash.substring(1).replace(/^#/, '');
            const params = new URLSearchParams(cleanHash);
            const accessToken = params.get('access_token');
            const refreshToken = params.get('refresh_token');

            if (accessToken) {
              console.log("Found access_token in hash, attempting setSession...");
              
              // Tenta limpar o hash da URL para não processar duas vezes (opcional, mas bom pra UX)
              // history.replaceState(null, null, ' '); 

              const { data, error } = await supabase.auth.setSession({
                access_token: accessToken,
                refresh_token: refreshToken || '',
              });

              if (error) {
                console.error("Manual setSession failed:", error);
                // Se falhar, talvez o token seja inválido ou expirado.
                // Não damos return aqui para permitir que o getSession tente (embora provavel que falhe também)
              } else if (data?.session) {
                console.log("Session recovered manually from hash. User:", data.session.user.email);
                if (mounted) {
                   await fetchUserProfile(data.session.user);
                   // Importante: Limpar o hash da URL após sucesso para evitar reprocessamento em reload
                   window.location.hash = ''; 
                }
                return;
              } else {
                 console.warn("Manual setSession returned no error but no session data either.");
              }
            }
          } catch (e) {
            console.error("Error parsing auth hash:", e);
          }
        } else {
             console.log("No auth hash detected.");
        }

        // 2. Se não houve recuperação manual (ou falhou), verificar sessão existente
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
          // Sem sessão. Se não estamos num fluxo de auth (sem hash), finalizamos o loading.
          // Se estamos num fluxo de auth e falhou tudo acima, também finalizamos.
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

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log("Auth state change:", event);
      if (!mounted) return;

      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        if (session) await fetchUserProfile(session.user);
      } else if (event === 'SIGNED_OUT') {
        setUser(null);
        setLoading(false);
      } else if (event === 'INITIAL_SESSION') {
        // Apenas processa INITIAL_SESSION se tiver sessão, 
        // caso contrário deixa o initAuth decidir o destino (para evitar sobrescrever recuperação manual)
        if (session) {
          await fetchUserProfile(session.user);
        }
      }
    });

    // Safety timeout para garantir que o app não fique travado no loading
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
    }, 10000); // 10 segundos de timeout

    return () => {
      mounted = false;
      subscription?.unsubscribe();
      clearTimeout(timeoutId);
    };
  }, [fetchUserProfile]);

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
    const redirectTo = `${getSiteUrl()}/painel-usuario`;
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

import React, { createContext, useState, useEffect, useContext, useCallback } from 'react';
import { supabase } from '@/lib/customSupabaseClient';

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
    const getSessionAndProfile = async () => {
      const { data: { session }, error } = await supabase.auth.getSession();
      if (error) {
        console.error("Error getting session:", error.message);
        // If token is invalid, sign out to clear corrupted session
        if (error.message.includes('Invalid Refresh Token')) {
          await supabase.auth.signOut();
        }
        setUser(null);
        setLoading(false);
      } else {
        await fetchUserProfile(session?.user ?? null);
      }
    };

    getSessionAndProfile();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      fetchUserProfile(session?.user ?? null);
    });

    return () => {
      subscription?.unsubscribe();
    };
  }, [fetchUserProfile]);

  const signUp = useCallback(async (email, password, meta) => {
    const { data: { user: authUser }, error } = await supabase.auth.signUp({ 
      email, 
      password, 
      options: {
        data: meta.data
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
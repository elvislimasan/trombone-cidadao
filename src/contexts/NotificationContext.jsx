// contexts/NotificationContext.js
import React, { createContext, useContext, useState, useEffect } from 'react';
import { useAuth } from './SupabaseAuthContext';
import { supabase } from '@/lib/customSupabaseClient';

const NotificationContext = createContext();

export const useNotifications = () => {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotifications must be used within a NotificationProvider');
  }
  return context;
};

export const NotificationProvider = ({ children }) => {
  const { user } = useAuth();
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [loading, setLoading] = useState(true);

  // Carregar preferências do usuário do Supabase
  const loadUserPreferences = async () => {
    if (!user) {
      // Fallback para localStorage se não há usuário logado
      const preference = localStorage.getItem('notifications-enabled');
      if (preference !== null) {
        setNotificationsEnabled(JSON.parse(preference));
      }
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('user_preferences')
        .select('notifications_enabled')
        .eq('user_id', user.id)
        .single();

      if (error) {
        // Se não encontrou preferências, criar registro padrão com UPSERT
        if (error.code === 'PGRST116') {
          const { data: newData, error: upsertError } = await supabase
            .from('user_preferences')
            .upsert({ 
              user_id: user.id, 
              notifications_enabled: true 
            })
            .select()
            .single();

          if (upsertError) {
            console.error('Error creating user preferences:', upsertError);
            // Fallback para localStorage
            const preference = localStorage.getItem('notifications-enabled');
            if (preference !== null) {
              setNotificationsEnabled(JSON.parse(preference));
            }
          } else if (newData) {
            setNotificationsEnabled(newData.notifications_enabled);
          }
        } else {
          console.error('Error loading user preferences:', error);
          // Fallback para localStorage em caso de erro
          const preference = localStorage.getItem('notifications-enabled');
          if (preference !== null) {
            setNotificationsEnabled(JSON.parse(preference));
          }
        }
      } else if (data) {
        setNotificationsEnabled(data.notifications_enabled);
      }
    } catch (error) {
      console.error('Error in loadUserPreferences:', error);
      // Fallback para localStorage em caso de erro
      const preference = localStorage.getItem('notifications-enabled');
      if (preference !== null) {
        setNotificationsEnabled(JSON.parse(preference));
      }
    } finally {
      setLoading(false);
    }
  };

  // Atualizar preferências no Supabase
  const updateUserPreferences = async (enabled) => {
    if (!user) {
      // Se não há usuário, usar apenas localStorage
      localStorage.setItem('notifications-enabled', JSON.stringify(enabled));
      return;
    }

    try {
      const { error } = await supabase
        .from('user_preferences')
        .upsert({ 
          user_id: user.id, 
          notifications_enabled: enabled,
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'user_id' // Especificar a coluna de conflito
        });

      if (error) {
        console.error('Error updating user preferences:', error);
        // Fallback para localStorage em caso de erro
        localStorage.setItem('notifications-enabled', JSON.stringify(enabled));
      } else {
        // Limpar localStorage quando atualizar no Supabase com sucesso
        localStorage.removeItem('notifications-enabled');
      }
    } catch (error) {
      console.error('Error in updateUserPreferences:', error);
      localStorage.setItem('notifications-enabled', JSON.stringify(enabled));
    }
  };

  // Carregar preferências quando o usuário mudar
  useEffect(() => {
    setLoading(true);
    loadUserPreferences();
  }, [user]);

  const toggleNotifications = async (enabled) => {
    const newValue = typeof enabled === 'boolean' ? enabled : !notificationsEnabled;
    
    setNotificationsEnabled(newValue);
    await updateUserPreferences(newValue);
  };

  const value = {
    notificationsEnabled,
    toggleNotifications,
    loading
  };

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
};
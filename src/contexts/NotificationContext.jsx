import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
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

// Valores padrão para as preferências
const DEFAULT_PREFERENCES = {
  reports: true,
  works: true,
  comments: true,
  system: false
};

export const NotificationProvider = ({ children }) => {
  const { user } = useAuth();
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushSupported, setPushSupported] = useState(false);
  const [subscription, setSubscription] = useState(null);
  const [notificationPreferences, setNotificationPreferences] = useState(DEFAULT_PREFERENCES);
  const [loading, setLoading] = useState(true);

  // Verificar se o navegador suporta notificações push
  useEffect(() => {
    const checkSupport = () => {
      const supported = 'serviceWorker' in navigator && 'PushManager' in window;
      console.log('🔔 Push notifications supported:', supported);
      setPushSupported(supported);
      
      if (supported) {
        checkPushSubscription();
      }
    };

    checkSupport();
  }, []);

  // Carregar preferências do usuário
  const loadUserPreferences = async () => {
    console.log('🔔 Carregando preferências do usuário...');
    setLoading(true);
    
    try {
      if (!user) {
        console.log('🔔 Usuário não logado, usando localStorage');
        const preference = localStorage.getItem('notifications-enabled');
        const pushPreference = localStorage.getItem('push-enabled');
        const preferences = localStorage.getItem('notification-preferences');
        
        if (preference !== null) setNotificationsEnabled(JSON.parse(preference));
        if (pushPreference !== null) setPushEnabled(JSON.parse(pushPreference));
        if (preferences !== null) {
          setNotificationPreferences(JSON.parse(preferences));
        } else {
          setNotificationPreferences(DEFAULT_PREFERENCES);
        }
      } else {
        console.log('🔔 Buscando preferências do Supabase para usuário:', user.id);
        const { data, error } = await supabase
          .from('user_preferences')
          .select('*')
          .eq('user_id', user.id)
          .single();

        if (error && error.code === 'PGRST116') {
          // Criar preferências padrão
          console.log('🔔 Criando preferências padrão no Supabase');
          const defaultPreferences = {
            user_id: user.id,
            notifications_enabled: true,
            push_enabled: false,
            notification_preferences: DEFAULT_PREFERENCES
          };

          const { data: newData, error: upsertError } = await supabase
            .from('user_preferences')
            .upsert(defaultPreferences)
            .select()
            .single();

          if (!upsertError && newData) {
            setNotificationsEnabled(newData.notifications_enabled);
            setPushEnabled(newData.push_enabled);
            setNotificationPreferences(newData.notification_preferences || DEFAULT_PREFERENCES);
          }
        } else if (data) {
          console.log('🔔 Preferências carregadas do Supabase');
          setNotificationsEnabled(data.notifications_enabled);
          setPushEnabled(data.push_enabled);
          setNotificationPreferences(data.notification_preferences || DEFAULT_PREFERENCES);
        }
      }
    } catch (error) {
      console.error('Error loading user preferences:', error);
      // Fallback para localStorage em caso de erro
      const preference = localStorage.getItem('notifications-enabled');
      const pushPreference = localStorage.getItem('push-enabled');
      const preferences = localStorage.getItem('notification-preferences');
      
      if (preference !== null) setNotificationsEnabled(JSON.parse(preference));
      if (pushPreference !== null) setPushEnabled(JSON.parse(pushPreference));
      if (preferences !== null) setNotificationPreferences(JSON.parse(preferences));
    } finally {
      setLoading(false);
    }
  };

  // Verificar subscription push existente
  const checkPushSubscription = useCallback(async () => {
    if (!pushSupported) return;

    try {
      console.log('🔔 Verificando subscription push existente...');
      const registration = await navigator.serviceWorker.ready;
      const existingSubscription = await registration.pushManager.getSubscription();
      
      console.log('🔔 Subscription encontrada:', !!existingSubscription);
      setSubscription(existingSubscription);
      setPushEnabled(!!existingSubscription);
    } catch (error) {
      console.error('Error checking push subscription:', error);
    }
  }, [pushSupported]);

  // Solicitar permissão e subscrever para push
  const subscribeToPush = async () => {
    if (!pushSupported) {
      alert('Seu navegador não suporta notificações push.');
      return false;
    }

    try {
      console.log('🔔 Solicitando permissão para notificações...');
      // Solicitar permissão
      const permission = await Notification.requestPermission();
      console.log('🔔 Permissão concedida:', permission);
      
      if (permission !== 'granted') {
        alert('Permissão para notificações foi negada.');
        return false;
      }

      // Obter chave VAPID do ambiente VITE
      const vapidPublicKey = import.meta.env.VITE_VAPID_PUBLIC_KEY;
      console.log('🔔 VAPID Public Key:', vapidPublicKey ? 'Encontrada' : 'Não encontrada');
      
      if (!vapidPublicKey) {
        console.error('VAPID public key not found in environment variables');
        alert('Erro de configuração: chave VAPID não encontrada. Configure VITE_VAPID_PUBLIC_KEY no seu .env');
        return false;
      }

      // Registrar service worker (pode já estar registrado, mas é seguro chamar novamente)
      const registration = await navigator.serviceWorker.register('/sw.js');
      console.log('🔔 Service Worker registrado:', registration);
      
      // Subscrever para push
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey)
      });

      console.log('🔔 Subscription criada com sucesso');
      setSubscription(subscription);
      setPushEnabled(true);

      // Enviar subscription para o servidor
      await savePushSubscription(subscription);

      return true;
    } catch (error) {
      console.error('Error subscribing to push:', error);
      
      if (error.name === 'NotAllowedError') {
        alert('Permissão para notificações foi negada. Por favor, permita notificações nas configurações do seu navegador.');
      } else if (error.name === 'AbortError') {
        alert('A operação foi abortada. Tente novamente.');
      } else {
        alert('Erro ao ativar notificações push: ' + error.message);
      }
      
      return false;
    }
  };

  // Cancelar subscription push
  const unsubscribeFromPush = async () => {
    if (!subscription) {
      console.log('🔔 Nenhuma subscription para cancelar');
      return;
    }

    try {
      console.log('🔔 Cancelando subscription push...');
      await subscription.unsubscribe();
      setSubscription(null);
      setPushEnabled(false);

      // Remover subscription do servidor
      await deletePushSubscription();
      console.log('🔔 Subscription cancelada com sucesso');
    } catch (error) {
      console.error('Error unsubscribing from push:', error);
    }
  };

  // Salvar subscription no servidor
  const savePushSubscription = async (subscription) => {
    if (!user) {
      console.log('🔔 Usuário não logado, salvando subscription no localStorage');
      localStorage.setItem('push-subscription', JSON.stringify(subscription));
      return;
    }

    try {
      console.log('🔔 Salvando subscription no Supabase...');
      const { error } = await supabase
        .from('push_subscriptions')
        .upsert({
          user_id: user.id,
          subscription: subscription,
          created_at: new Date().toISOString()
        }, {
          onConflict: 'user_id'
        });

      if (error) {
        console.error('Error saving push subscription:', error);
        // Fallback para localStorage
        localStorage.setItem('push-subscription', JSON.stringify(subscription));
      } else {
        console.log('🔔 Subscription salva no Supabase com sucesso');
        localStorage.removeItem('push-subscription');
      }
    } catch (error) {
      console.error('Error in savePushSubscription:', error);
      localStorage.setItem('push-subscription', JSON.stringify(subscription));
    }
  };

  // Remover subscription do servidor
  const deletePushSubscription = async () => {
    if (!user) {
      console.log('🔔 Usuário não logado, removendo subscription do localStorage');
      localStorage.removeItem('push-subscription');
      return;
    }

    try {
      console.log('🔔 Removendo subscription do Supabase...');
      const { error } = await supabase
        .from('push_subscriptions')
        .delete()
        .eq('user_id', user.id);

      if (error) {
        console.error('Error deleting push subscription:', error);
      } else {
        console.log('🔔 Subscription removida do Supabase com sucesso');
      }
      localStorage.removeItem('push-subscription');
    } catch (error) {
      console.error('Error in deletePushSubscription:', error);
      localStorage.removeItem('push-subscription');
    }
  };

  // Atualizar preferências
  const updateUserPreferences = async (updates) => {
    console.log('🔔 Atualizando preferências:', updates);
    
    // Garantir que notificationPreferences nunca seja undefined
    const currentPreferences = notificationPreferences || DEFAULT_PREFERENCES;
    const newPreferences = { ...currentPreferences, ...updates };
    
    setNotificationPreferences(newPreferences);

    if (!user) {
      localStorage.setItem('notification-preferences', JSON.stringify(newPreferences));
      return;
    }

    try {
      const { error } = await supabase
        .from('user_preferences')
        .upsert({ 
          user_id: user.id, 
          notification_preferences: newPreferences,
          updated_at: new Date().toISOString()
        });

      if (error) {
        console.error('Error updating preferences:', error);
        // Fallback para localStorage
        localStorage.setItem('notification-preferences', JSON.stringify(newPreferences));
      } else {
        localStorage.removeItem('notification-preferences');
      }
    } catch (error) {
      console.error('Error in updateUserPreferences:', error);
      localStorage.setItem('notification-preferences', JSON.stringify(newPreferences));
    }
  };

  // Toggle notificações push
  const togglePushNotifications = async (enabled) => {
    console.log('🔔 Alternando notificações push para:', enabled);
    
    if (enabled) {
      await subscribeToPush();
    } else {
      await unsubscribeFromPush();
    }

    // Atualizar no banco de dados/localStorage
    if (user) {
      try {
        await supabase
          .from('user_preferences')
          .upsert({ 
            user_id: user.id, 
            push_enabled: enabled,
            updated_at: new Date().toISOString()
          });
      } catch (error) {
        console.error('Error updating push enabled:', error);
        localStorage.setItem('push-enabled', JSON.stringify(enabled));
      }
    } else {
      localStorage.setItem('push-enabled', JSON.stringify(enabled));
    }
  };

  // Toggle notificações gerais
  const toggleNotifications = async (enabled) => {
    const newValue = typeof enabled === 'boolean' ? enabled : !notificationsEnabled;
    console.log('🔔 Alternando notificações gerais para:', newValue);
    
    setNotificationsEnabled(newValue);

    if (!user) {
      localStorage.setItem('notifications-enabled', JSON.stringify(newValue));
      return;
    }

    try {
      const { error } = await supabase
        .from('user_preferences')
        .upsert({ 
          user_id: user.id, 
          notifications_enabled: newValue,
          updated_at: new Date().toISOString()
        });

      if (error) {
        console.error('Error updating notifications:', error);
        localStorage.setItem('notifications-enabled', JSON.stringify(newValue));
      } else {
        localStorage.removeItem('notifications-enabled');
      }
    } catch (error) {
      console.error('Error in toggleNotifications:', error);
      localStorage.setItem('notifications-enabled', JSON.stringify(newValue));
    }
  };

  // Testar notificações
  const testNotification = async () => {
    if (!pushSupported) {
      console.log('🔔 Push não suportado, não é possível testar');
      return false;
    }
    
    try {
      console.log('🔔 Enviando notificação de teste...');
      
      if (navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({
          type: 'TEST_NOTIFICATION'
        });
        console.log('🔔 Mensagem de teste enviada para o Service Worker');
        return true;
      } else {
        console.log('🔔 Service Worker não está controlado');
        return false;
      }
    } catch (error) {
      console.error('Error testing notification:', error);
      return false;
    }
  };

  // Carregar preferências quando o usuário mudar
  useEffect(() => {
    console.log('🔔 Usuário alterado, recarregando preferências');
    loadUserPreferences();
  }, [user]);

  // Carregar subscription do localStorage se não houver usuário
  useEffect(() => {
    if (!user && pushSupported) {
      const savedSubscription = localStorage.getItem('push-subscription');
      if (savedSubscription) {
        try {
          const subscription = JSON.parse(savedSubscription);
          setSubscription(subscription);
          setPushEnabled(true);
          console.log('🔔 Subscription carregada do localStorage');
        } catch (error) {
          console.error('Error loading subscription from localStorage:', error);
        }
      }
    }
  }, [user, pushSupported]);

  const value = {
    notificationsEnabled,
    pushEnabled,
    pushSupported,
    notificationPreferences: notificationPreferences || DEFAULT_PREFERENCES,
    toggleNotifications,
    togglePushNotifications,
    updatePreferences: updateUserPreferences,
    testNotification,
    loading
  };

  console.log('🔔 NotificationContext value:', value);

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
};

// Helper function para converter chave VAPID
function urlBase64ToUint8Array(base64String) {
  if (!base64String) {
    throw new Error('Base64 string is required');
  }

  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, '+')
    .replace(/_/g, '/');

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}
import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
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

const DEFAULT_PREFERENCES = {
  reports: true,
  works: true,
  comments: true,
  system: true,
  moderation_update: true,
  status_update: true,
  moderation_required: true,
  resolution_submission: true,
  work_update: true
};

export const NotificationProvider = ({ children }) => {
  const { user } = useAuth();
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushSupported, setPushSupported] = useState(false);
  const [subscription, setSubscription] = useState(null);
  const [notificationPreferences, setNotificationPreferences] = useState(DEFAULT_PREFERENCES);
  const [loading, setLoading] = useState(true);
  const [realtimeChannel, setRealtimeChannel] = useState(null); // 🔥 Canal real-time no contexto
  
  // 🔥 Usar refs para acessar valores atualizados dentro dos handlers
  const notificationsEnabledRef = useRef(notificationsEnabled);
  const pushEnabledRef = useRef(pushEnabled);
  const subscriptionRef = useRef(subscription);
  const notificationPreferencesRef = useRef(notificationPreferences);
  
  // Atualizar refs quando os valores mudarem
  useEffect(() => {
    notificationsEnabledRef.current = notificationsEnabled;
  }, [notificationsEnabled]);
  
  useEffect(() => {
    pushEnabledRef.current = pushEnabled;
  }, [pushEnabled]);
  
  useEffect(() => {
    subscriptionRef.current = subscription;
  }, [subscription]);
  
  useEffect(() => {
    notificationPreferencesRef.current = notificationPreferences;
  }, [notificationPreferences]);

  // Helper functions
  const getNotificationTitle = (type) => {
    const titles = {
      'moderation_update': '📋 Status da Bronca',
      'status_update': '🔄 Atualização de Status',
      'moderation_required': '👮 Moderação Necessária',
      'resolution_submission': '📸 Resolução Enviada',
      'work_update': '🏗️ Atualização de Obra',
      'system': '🔔 Trombone Cidadão'
    };
    return titles[type] || '🔔 Trombone Cidadão';
  };

  const getNotificationUrl = (notification) => {
    if (notification.report_id) {
      return `/bronca/${notification.report_id}`;
    }
    if (notification.work_id) {
      return `/obras-publicas/${notification.work_id}`;
    }
    return '/notificacoes';
  };

  // Mostrar notificação local
  const showLocalNotification = (notification) => {
    if (!('Notification' in window) || Notification.permission !== 'granted') {
      return;
    }

    try {
      const options = {
        body: notification.message,
        icon: '/icons/icon-192x192.png',
        badge: '/icons/badge-72x72.png',
        data: {
          url: getNotificationUrl(notification),
          notificationId: notification.id
        },
        vibrate: [100, 50, 100],
        tag: notification.id
      };

      new Notification(getNotificationTitle(notification.type), options);
    } catch (error) {
      console.error('Erro ao mostrar notificação local:', error);
    }
  };

  // Enviar notificação push
  const sendPushNotification = useCallback(async (notification) => {
    const currentSubscription = subscriptionRef.current;
    if (!currentSubscription) {
      return;
    }

    try {
      if (navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({
          type: 'SHOW_PUSH_NOTIFICATION',
          notification: {
            title: getNotificationTitle(notification.type),
            body: notification.message,
            icon: '/icons/icon-192x192.png',
            badge: '/icons/badge-72x72.png',
            data: {
              url: getNotificationUrl(notification),
              notificationId: notification.id,
              type: notification.type
            },
            vibrate: [100, 50, 100],
            tag: notification.id,
            timestamp: Date.now()
          }
        });
      }
    } catch (error) {
      console.error('Erro ao enviar notificação push:', error);
    }
  }, []);

  // 🔥 CONFIGURAR REAL-TIME NO CONTEXTO (SEMPRE ATIVO)
  const setupRealtimeNotifications = useCallback(() => {
    if (!user || !notificationsEnabledRef.current) {
      return;
    }

    // Remover canal existente
    if (realtimeChannel) {
      supabase.removeChannel(realtimeChannel);
      setRealtimeChannel(null);
    }

    // Criar novo canal real-time
    const channel = supabase
      .channel(`context-notifications:${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${user.id}`
        },
        async (payload) => {
          const notification = payload.new;
          
          // 🔥 Usar refs para acessar valores ATUALIZADOS
          const currentNotificationsEnabled = notificationsEnabledRef.current;
          const currentPushEnabled = pushEnabledRef.current;
          const currentSubscription = subscriptionRef.current;
          const currentPreferences = notificationPreferencesRef.current;

          // Verificar se notificações estão habilitadas
          if (!currentNotificationsEnabled) {
            return;
          }

          // Verificar preferências do tipo de notificação
          const notificationType = notification.type || 'system';
          const isTypeEnabled = currentPreferences[notificationType] !== undefined 
            ? currentPreferences[notificationType] 
            : true;
          
          if (!isTypeEnabled) {
            return;
          }

          // Se push está habilitado, enviar notificação push
          if (currentPushEnabled && currentSubscription) {
            await sendPushNotification(notification);
          }

          // Mostrar notificação no site (local)
          showLocalNotification(notification);
          
          // 🔥 Disparar evento customizado para atualizar componentes
          window.dispatchEvent(new CustomEvent('new-notification', {
            detail: notification
          }));
        }
      )
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR') {
          console.error('Erro no canal real-time do Context');
        } else if (status === 'TIMED_OUT') {
          console.error('Timeout no canal real-time do Context');
        }
      });

    setRealtimeChannel(channel);
    
    return channel;
  }, [user, sendPushNotification]);

  // Verificar suporte a push
  useEffect(() => {
    const checkSupport = () => {
      const supported = 'serviceWorker' in navigator && 'PushManager' in window;
      setPushSupported(supported);
    };
    checkSupport();
  }, []);

  // Migrar preferências antigas
  const migrateOldPreferences = (preferences) => {
    if (!preferences) return DEFAULT_PREFERENCES;
    
    if (preferences.system === undefined) {
      return {
        ...DEFAULT_PREFERENCES,
        ...preferences,
        system: true
      };
    }
    
    return preferences;
  };

  // Carregar preferências
  const loadUserPreferences = async () => {
    setLoading(true);
    
    try {
      if (!user) {
        const preference = localStorage.getItem('notifications-enabled');
        const pushPreference = localStorage.getItem('push-enabled');
        const preferences = localStorage.getItem('notification-preferences');
        
        if (preference !== null) setNotificationsEnabled(JSON.parse(preference));
        if (pushPreference !== null) setPushEnabled(JSON.parse(pushPreference));
        if (preferences !== null) {
          const migratedPreferences = migrateOldPreferences(JSON.parse(preferences));
          setNotificationPreferences(migratedPreferences);
        } else {
          setNotificationPreferences(DEFAULT_PREFERENCES);
        }
      } else {
        const { data, error } = await supabase
          .from('user_preferences')
          .select('*')
          .eq('user_id', user.id)
          .single();

        if (error && error.code === 'PGRST116') {
          // Criar preferências padrão
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
          setNotificationsEnabled(data.notifications_enabled);
          setPushEnabled(data.push_enabled);
          
          const migratedPreferences = migrateOldPreferences(data.notification_preferences);
          setNotificationPreferences(migratedPreferences || DEFAULT_PREFERENCES);
        }
      }
    } catch (error) {
      console.error('Error loading preferences:', error);
    } finally {
      setLoading(false);
    }
  };

  // Verificar subscription push existente
  const checkPushSubscription = useCallback(async () => {
    if (!pushSupported) {
      return;
    }

    try {
      const registration = await navigator.serviceWorker.ready;
      const existingSubscription = await registration.pushManager.getSubscription();
      
      setSubscription(existingSubscription);
      
      // Sincronizar estado
      if (existingSubscription && !pushEnabled) {
        setPushEnabled(true);
      } else if (!existingSubscription && pushEnabled) {
        setPushEnabled(false);
      }
    } catch (error) {
      console.error('Error checking push subscription:', error);
    }
  }, [pushSupported, pushEnabled]);

  // Subscrever para push
  const subscribeToPush = async () => {
    if (!pushSupported) {
      alert('Seu navegador não suporta notificações push.');
      return false;
    }

    try {
      const permission = await Notification.requestPermission();
      
      if (permission !== 'granted') {
        alert('Permissão para notificações foi negada.');
        return false;
      }

      const vapidPublicKey = import.meta.env.VITE_VAPID_PUBLIC_KEY;
      if (!vapidPublicKey) {
        alert('Erro de configuração: chave VAPID não encontrada.');
        return false;
      }

      const registration = await navigator.serviceWorker.ready;
      const newSubscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey)
      });

      setSubscription(newSubscription);
      setPushEnabled(true);

      // Salvar subscription
      await savePushSubscription(newSubscription);
      
      return true;
    } catch (error) {
      console.error('Error subscribing:', error);
      alert('Erro ao ativar notificações: ' + error.message);
      return false;
    }
  };

  // Cancelar subscription
  const unsubscribeFromPush = async () => {
    if (!subscription) {
      return;
    }

    try {
      await subscription.unsubscribe();
      setSubscription(null);
      setPushEnabled(false);
      await deletePushSubscription();
    } catch (error) {
      console.error('Error unsubscribing:', error);
    }
  };

  // Salvar subscription
  const savePushSubscription = async (subscription) => {
    if (!user) {
      localStorage.setItem('push-subscription', JSON.stringify(subscription));
      return;
    }

    try {
      await supabase
        .from('push_subscriptions')
        .upsert({
          user_id: user.id,
          subscription: subscription,
          created_at: new Date().toISOString()
        });
    } catch (error) {
      console.error('Error saving subscription:', error);
      localStorage.setItem('push-subscription', JSON.stringify(subscription));
    }
  };

  // Deletar subscription
  const deletePushSubscription = async () => {
    if (!user) {
      localStorage.removeItem('push-subscription');
      return;
    }

    try {
      await supabase
        .from('push_subscriptions')
        .delete()
        .eq('user_id', user.id);
    } catch (error) {
      console.error('Error deleting subscription:', error);
    }
    localStorage.removeItem('push-subscription');
  };

  // Atualizar preferências
  const updateUserPreferences = async (updates) => {
    const newPreferences = { 
      ...DEFAULT_PREFERENCES,
      ...notificationPreferences, 
      ...updates 
    };
    
    setNotificationPreferences(newPreferences);

    if (!user) {
      localStorage.setItem('notification-preferences', JSON.stringify(newPreferences));
      return;
    }

    try {
      await supabase
        .from('user_preferences')
        .upsert({ 
          user_id: user.id, 
          notification_preferences: newPreferences 
        });
    } catch (error) {
      console.error('Error updating preferences:', error);
      localStorage.setItem('notification-preferences', JSON.stringify(newPreferences));
    }
  };

  // Toggle push
  const togglePushNotifications = async (enabled) => {
    if (enabled) {
      const success = await subscribeToPush();
      if (success) {
        setPushEnabled(true);
      }
    } else {
      await unsubscribeFromPush();
      setPushEnabled(false);
    }

    // Atualizar estado no banco
    if (user) {
      await supabase
        .from('user_preferences')
        .upsert({ 
          user_id: user.id, 
          push_enabled: enabled 
        });
    } else {
      localStorage.setItem('push-enabled', JSON.stringify(enabled));
    }
  };

  // Toggle notificações gerais
  const toggleNotifications = async (enabled) => {
    const newValue = typeof enabled === 'boolean' ? enabled : !notificationsEnabled;
    
    setNotificationsEnabled(newValue);

    // 🔥 RECONFIGURAR REAL-TIME quando notificações são alternadas
    if (user && newValue) {
      setupRealtimeNotifications();
    } else if (realtimeChannel) {
      supabase.removeChannel(realtimeChannel);
      setRealtimeChannel(null);
    }

    if (!user) {
      localStorage.setItem('notifications-enabled', JSON.stringify(newValue));
      return;
    }

    try {
      await supabase
        .from('user_preferences')
        .upsert({ 
          user_id: user.id, 
          notifications_enabled: newValue 
        });
    } catch (error) {
      console.error('Error updating notifications:', error);
      localStorage.setItem('notifications-enabled', JSON.stringify(newValue));
    }
  };

  // Testar notificação
  const testNotification = async () => {
    if (!pushSupported) return false;
    
    try {
      if (navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({
          type: 'TEST_NOTIFICATION'
        });
        return true;
      }
      return false;
    } catch (error) {
      console.error('Error testing notification:', error);
      return false;
    }
  };

  // 🔥 EFEITO PRINCIPAL: Configurar real-time quando usuário loga ou quando notificações são ativadas
  useEffect(() => {
    if (user && notificationsEnabled) {
      setupRealtimeNotifications();
    } else {
      // Se notificações desativadas ou usuário saiu, limpar canal
      if (realtimeChannel) {
        supabase.removeChannel(realtimeChannel);
        setRealtimeChannel(null);
      }
    }

    return () => {
      // Cleanup do real-time
      if (realtimeChannel) {
        supabase.removeChannel(realtimeChannel);
        setRealtimeChannel(null);
      }
    };
  }, [user, notificationsEnabled, setupRealtimeNotifications]);

  // Efeitos secundários
  useEffect(() => {
    loadUserPreferences();
  }, [user]);

  useEffect(() => {
    if (pushSupported) {
      checkPushSubscription();
    }
  }, [pushSupported, checkPushSubscription]);

  // 🔥 Função para lidar com novas notificações (para uso externo)
  const handleNewNotification = useCallback((notification) => {
    // Verificar se notificações estão habilitadas
    if (!notificationsEnabledRef.current) {
      return;
    }

    // Verificar preferências do tipo de notificação
    const notificationType = notification.type || 'system';
    const currentPreferences = notificationPreferencesRef.current;
    const isTypeEnabled = currentPreferences[notificationType] !== undefined 
      ? currentPreferences[notificationType] 
      : true;
    
    if (!isTypeEnabled) {
      return;
    }

    // Se push está habilitado, enviar notificação push
    if (pushEnabledRef.current && subscriptionRef.current) {
      sendPushNotification(notification);
    }

    // Mostrar notificação no site (local)
    showLocalNotification(notification);
  }, [sendPushNotification]);

  const value = {
    notificationsEnabled,
    pushEnabled,
    pushSupported,
    notificationPreferences: notificationPreferences || DEFAULT_PREFERENCES,
    toggleNotifications,
    togglePushNotifications,
    updatePreferences: updateUserPreferences,
    testNotification,
    loading,
    handleNewNotification, // 🔥 Exportar função para uso externo
    isSubscribed: !!subscription, // 🔥 Adicionar propriedade que Header.jsx está tentando usar
    isLoading: loading // 🔥 Adicionar propriedade que Header.jsx está tentando usar
  };

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
};

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}
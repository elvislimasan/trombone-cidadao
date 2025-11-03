import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useAuth } from './SupabaseAuthContext';
import { supabase } from '@/lib/supabaseClient';

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
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushSupported, setPushSupported] = useState(false);
  const [subscription, setSubscription] = useState(null);
  const [notificationPreferences, setNotificationPreferences] = useState({
    reports: true,
    works: true,
    comments: true,
    system: false
  });
  const [loading, setLoading] = useState(true);

  // Verificar suporte a push notifications
  useEffect(() => {
    const checkPushSupport = () => {
      const supported = 'serviceWorker' in navigator && 'PushManager' in window;
      setPushSupported(supported);
      
      if (supported) {
        checkPushSubscription();
      }
    };

    checkPushSupport();
  }, []);

  // Carregar preferências do usuário
  const loadUserPreferences = async () => {
    if (!user) {
      const preference = localStorage.getItem('notifications-enabled');
      const pushPreference = localStorage.getItem('push-enabled');
      const preferences = localStorage.getItem('notification-preferences');
      
      if (preference !== null) setNotificationsEnabled(JSON.parse(preference));
      if (pushPreference !== null) setPushEnabled(JSON.parse(pushPreference));
      if (preferences !== null) setNotificationPreferences(JSON.parse(preferences));
      
      setLoading(false);
      return;
    }

    try {
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
          notification_preferences: {
            reports: true,
            works: true,
            comments: true,
            system: false
          }
        };

        const { data: newData, error: upsertError } = await supabase
          .from('user_preferences')
          .upsert(defaultPreferences)
          .select()
          .single();

        if (!upsertError && newData) {
          setNotificationsEnabled(newData.notifications_enabled);
          setPushEnabled(newData.push_enabled);
          setNotificationPreferences(newData.notification_preferences);
        }
      } else if (data) {
        setNotificationsEnabled(data.notifications_enabled);
        setPushEnabled(data.push_enabled);
        setNotificationPreferences(data.notification_preferences);
      }
    } catch (error) {
      console.error('Error loading user preferences:', error);
    } finally {
      setLoading(false);
    }
  };

  // Verificar subscription push existente
  const checkPushSubscription = useCallback(async () => {
    if (!pushSupported) return;

    try {
      const registration = await navigator.serviceWorker.ready;
      const existingSubscription = await registration.pushManager.getSubscription();
      
      setSubscription(existingSubscription);
      setPushEnabled(!!existingSubscription);
    } catch (error) {
      console.error('Error checking push subscription:', error);
    }
  }, [pushSupported]);

  // Converter chave VAPID para Uint8Array
  const urlBase64ToUint8Array = (base64String) => {
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
  };

  // Solicitar permissão e subscrever para push
  const subscribeToPush = async () => {
    if (!pushSupported) {
      alert('Seu navegador não suporta notificações push.');
      return false;
    }

    try {
      // Solicitar permissão
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        alert('Permissão para notificações foi negada.');
        return false;
      }

      // Obter chave VAPID do ambiente
      const vapidPublicKey = import.meta.env.VITE_VAPID_PUBLIC_KEY;
      if (!vapidPublicKey) {
        console.error('VAPID public key not found in environment variables');
        return false;
      }

      // Registrar service worker e subscrever
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey)
      });

      setSubscription(subscription);
      setPushEnabled(true);

      // Salvar subscription no servidor
      await savePushSubscription(subscription);

      return true;
    } catch (error) {
      console.error('Error subscribing to push:', error);
      return false;
    }
  };

  // Cancelar subscription push
  const unsubscribeFromPush = async () => {
    if (!subscription) return;

    try {
      await subscription.unsubscribe();
      setSubscription(null);
      setPushEnabled(false);

      // Remover subscription do servidor
      await deletePushSubscription();
    } catch (error) {
      console.error('Error unsubscribing from push:', error);
    }
  };

  // Salvar subscription no servidor
  const savePushSubscription = async (subscription) => {
    if (!user) return;

    try {
      const { error } = await supabase
        .from('push_subscriptions')
        .upsert({
          user_id: user.id,
          subscription: subscription,
          created_at: new Date().toISOString()
        }, {
          onConflict: 'user_id'
        });

      if (error) throw error;
      console.log('Push subscription saved to database');
    } catch (error) {
      console.error('Error saving push subscription:', error);
    }
  };

  // Remover subscription do servidor
  const deletePushSubscription = async () => {
    if (!user || !subscription) return;

    try {
      const { error } = await supabase
        .from('push_subscriptions')
        .delete()
        .eq('user_id', user.id);

      if (error) throw error;
      console.log('Push subscription removed from database');
    } catch (error) {
      console.error('Error deleting push subscription:', error);
    }
  };

  // Atualizar preferências
  const updateUserPreferences = async (updates) => {
    const newPreferences = { ...notificationPreferences, ...updates };
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
    }
  };

  // Toggle notificações push
  const togglePushNotifications = async (enabled) => {
    if (enabled) {
      await subscribeToPush();
    } else {
      await unsubscribeFromPush();
    }
  };

  // Toggle notificações gerais
  const toggleNotifications = async (enabled) => {
    const newValue = typeof enabled === 'boolean' ? enabled : !notificationsEnabled;
    setNotificationsEnabled(newValue);

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
    }
  };

  // Testar notificações
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

  // Obter informações da subscription
  const getSubscriptionInfo = async () => {
    return new Promise((resolve) => {
      if (!pushSupported || !navigator.serviceWorker.controller) {
        resolve(null);
        return;
      }

      const channel = new MessageChannel();
      channel.port1.onmessage = (event) => {
        resolve(event.data);
      };

      navigator.serviceWorker.controller.postMessage({
        type: 'GET_SUBSCRIPTION'
      }, [channel.port2]);
    });
  };

  useEffect(() => {
    loadUserPreferences();
  }, [user]);

  const value = {
    notificationsEnabled,
    pushEnabled,
    pushSupported,
    notificationPreferences,
    toggleNotifications,
    togglePushNotifications,
    updatePreferences: updateUserPreferences,
    testNotification,
    getSubscriptionInfo,
    loading
  };

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
};
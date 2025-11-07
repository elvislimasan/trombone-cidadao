import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from './SupabaseAuthContext';
import { supabase } from '@/lib/customSupabaseClient';
import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';

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
  
  // 🔥 Detectar se está no Capacitor (apenas se Capacitor estiver disponível)
  const isCapacitor = typeof Capacitor !== 'undefined' && Capacitor.isNativePlatform();
  
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
        icon: '/logo.png',
        badge: '/logo.png',
        color: '#4a2121', // Cor de fundo rgb(74, 33, 33)
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
            icon: '/logo.png',
            badge: '/logo.png',
            color: '#4a2121', // Cor de fundo rgb(74, 33, 33)
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
      // Verificar suporte web primeiro
      const webSupported = 'serviceWorker' in navigator && 'PushManager' in window;
      
      // 🔥 CAPACITOR: Verificar apenas se realmente estiver no app nativo
      let capacitorSupported = false;
      if (isCapacitor && typeof Capacitor !== 'undefined' && Capacitor.isNativePlatform()) {
        try {
          capacitorSupported = Capacitor.isPluginAvailable('PushNotifications');
        } catch (e) {
          console.warn('[FCM] Erro ao verificar Capacitor:', e);
        }
      }
      
      setPushSupported(capacitorSupported || webSupported);
    };
    checkSupport();
  }, [isCapacitor]);

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

        // 🔥 Se não existir registro (PGRST116) ou se houver qualquer erro, criar preferências padrão
        if (error && error.code === 'PGRST116') {
          // Criar preferências padrão
          const isAdmin = user?.is_admin === true;
          let initialPreferences = { ...DEFAULT_PREFERENCES };
          
          // 🔥 IMPORTANTE: Se não for admin, moderation_required deve ser false
          if (!isAdmin) {
            initialPreferences.moderation_required = false;
          }
          
          const defaultPreferences = {
            user_id: user.id,
            notifications_enabled: true,
            push_enabled: false,
            notification_preferences: initialPreferences
          };

          const { data: newData, error: upsertError } = await supabase
            .from('user_preferences')
            .upsert(defaultPreferences, {
              onConflict: 'user_id'
            })
            .select()
            .single();

          if (upsertError) {
            console.error('[PREF] Erro ao criar preferências padrão:', upsertError);
            // Mesmo com erro, definir preferências no estado para que o app funcione
            setNotificationsEnabled(true);
            setPushEnabled(false);
            setNotificationPreferences(initialPreferences);
          } else if (newData) {
            setNotificationsEnabled(newData.notifications_enabled);
            setPushEnabled(newData.push_enabled);
            
            let finalPreferences = newData.notification_preferences || DEFAULT_PREFERENCES;
            
            // 🔥 IMPORTANTE: Garantir que moderation_required seja false para não-admins
            if (!isAdmin) {
              finalPreferences = {
                ...finalPreferences,
                moderation_required: false
              };
            }
            
            setNotificationPreferences(finalPreferences);
          }
        } else if (error) {
          // 🔥 Outro tipo de erro - tentar criar mesmo assim
          console.warn('[PREF] Erro ao buscar preferências:', error);
          
          const isAdmin = user?.is_admin === true;
          let initialPreferences = { ...DEFAULT_PREFERENCES };
          
          if (!isAdmin) {
            initialPreferences.moderation_required = false;
          }
          
          const defaultPreferences = {
            user_id: user.id,
            notifications_enabled: true,
            push_enabled: false,
            notification_preferences: initialPreferences
          };

          const { data: newData, error: upsertError } = await supabase
            .from('user_preferences')
            .upsert(defaultPreferences, {
              onConflict: 'user_id'
            })
            .select()
            .single();

          if (!upsertError && newData) {
            setNotificationsEnabled(newData.notifications_enabled);
            setPushEnabled(newData.push_enabled);
            
            let finalPreferences = newData.notification_preferences || DEFAULT_PREFERENCES;
            
            if (!isAdmin) {
              finalPreferences = {
                ...finalPreferences,
                moderation_required: false
              };
            }
            
            setNotificationPreferences(finalPreferences);
          } else {
            // Se mesmo assim falhar, definir no estado local
            console.warn('[PREF] Não foi possível criar preferências no banco, usando estado local');
            setNotificationsEnabled(true);
            setPushEnabled(false);
            setNotificationPreferences(initialPreferences);
          }
        } else if (data) {
          setNotificationsEnabled(data.notifications_enabled);
          setPushEnabled(data.push_enabled);
          
          // 🔥 Verificar se notification_preferences está vazio ou é um objeto vazio
          let prefsFromDb = data.notification_preferences;
          
          // Parsear se for string JSON
          if (typeof prefsFromDb === 'string') {
            try {
              prefsFromDb = JSON.parse(prefsFromDb);
            } catch (e) {
              console.warn('⚠️ [PREF] Erro ao parsear notification_preferences:', e);
              prefsFromDb = {};
            }
          }
          
          // Verificar se está vazio ou tem apenas chaves sem valor válido
          const isEmpty = !prefsFromDb || 
                          Object.keys(prefsFromDb).length === 0 || 
                          (Object.keys(prefsFromDb).length === 1 && prefsFromDb.system === undefined);
          
          const isAdmin = user?.is_admin === true;
          
          if (isEmpty) {
            // 🔥 Se estiver vazio, criar preferências padrão (apenas uma vez)
            let initialPreferences = { ...DEFAULT_PREFERENCES };
            
            // 🔥 IMPORTANTE: Se não for admin, moderation_required deve ser false
            if (!isAdmin) {
              initialPreferences.moderation_required = false;
            }
            
            // 🔥 IMPORTANTE: Verificar se updated_at foi modificado recentemente (menos de 10 segundos)
            // Isso evita atualizações repetidas se o registro já foi atualizado nesta sessão
            const updatedAt = data.updated_at ? new Date(data.updated_at) : null;
            const now = new Date();
            const timeSinceUpdate = updatedAt ? (now - updatedAt) / 1000 : Infinity; // segundos
            
            // Se foi atualizado há menos de 10 segundos, não atualizar novamente (evitar loop)
            // Isso pode acontecer se o loadUserPreferences for chamado múltiplas vezes rapidamente
            if (timeSinceUpdate < 10) {
              setNotificationPreferences(initialPreferences);
            } else {
              // 🔥 IMPORTANTE: Atualizar no banco apenas se não foi atualizado recentemente
              const { data: updateData, error: updateError } = await supabase
                .from('user_preferences')
                .update({ 
                  notification_preferences: initialPreferences 
                })
                .eq('user_id', user.id)
                .select()
                .single();
              
              if (updateError) {
                console.error('[PREF] Erro ao atualizar preferências vazias:', updateError);
                // Mesmo com erro, usar as preferências padrão no estado
                setNotificationPreferences(initialPreferences);
              } else if (updateData) {
                // 🔥 Verificar se a atualização realmente preencheu as preferências
                const updatedPrefs = typeof updateData.notification_preferences === 'string' 
                  ? JSON.parse(updateData.notification_preferences) 
                  : updateData.notification_preferences;
                
                const wasUpdated = updatedPrefs && Object.keys(updatedPrefs).length > 0;
                
                if (wasUpdated) {
                  setNotificationPreferences(initialPreferences);
                } else {
                  // Tentar buscar novamente para ver o estado atual
                  const { data: freshData } = await supabase
                    .from('user_preferences')
                    .select('notification_preferences')
                    .eq('user_id', user.id)
                    .single();
                  
                  if (freshData) {
                    const freshPrefs = typeof freshData.notification_preferences === 'string'
                      ? JSON.parse(freshData.notification_preferences)
                      : freshData.notification_preferences;
                    
                    if (freshPrefs && Object.keys(freshPrefs).length > 0) {
                      const migratedPrefs = migrateOldPreferences(freshPrefs);
                      const finalPrefs = !isAdmin ? { ...migratedPrefs, moderation_required: false } : migratedPrefs;
                      setNotificationPreferences(finalPrefs);
                    } else {
                      setNotificationPreferences(initialPreferences);
                    }
                  } else {
                    setNotificationPreferences(initialPreferences);
                  }
                }
              } else {
                // Se não retornou dados mas também não teve erro, verificar novamente
                const { data: freshData } = await supabase
                  .from('user_preferences')
                  .select('notification_preferences')
                  .eq('user_id', user.id)
                  .single();
                
                if (freshData) {
                  const freshPrefs = typeof freshData.notification_preferences === 'string'
                    ? JSON.parse(freshData.notification_preferences)
                    : freshData.notification_preferences;
                  
                  if (freshPrefs && Object.keys(freshPrefs).length > 0) {
                    const migratedPrefs = migrateOldPreferences(freshPrefs);
                    const finalPrefs = !isAdmin ? { ...migratedPrefs, moderation_required: false } : migratedPrefs;
                    setNotificationPreferences(finalPrefs);
                  } else {
                    setNotificationPreferences(initialPreferences);
                  }
                } else {
                  setNotificationPreferences(initialPreferences);
                }
              }
            }
          } else {
            // Usar preferências do banco
            const migratedPreferences = migrateOldPreferences(prefsFromDb);
            let finalPreferences = migratedPreferences || DEFAULT_PREFERENCES;
            
            // 🔥 IMPORTANTE: Se não for admin, garantir que moderation_required seja false
            if (!isAdmin) {
              finalPreferences = {
                ...finalPreferences,
                moderation_required: false
              };
              
              // 🔥 IMPORTANTE: Se moderation_required estava true no banco, atualizar
              if (migratedPreferences?.moderation_required === true) {
                const { error: updateError } = await supabase
                  .from('user_preferences')
                  .update({ 
                    notification_preferences: finalPreferences 
                  })
                  .eq('user_id', user.id);
                
                if (updateError) {
                  console.error('[PREF] Erro ao atualizar moderation_required:', updateError);
                }
              }
            }
            
            setNotificationPreferences(finalPreferences);
          }
        }
      }
    } catch (error) {
      console.error('Error loading preferences:', error);
    } finally {
      setLoading(false);
    }
  };

  // 🔥 Salvar token FCM (para Capacitor)
  const saveFCMToken = useCallback(async (token) => {
    if (!user) {
      console.warn('[FCM] Usuário não logado, não é possível salvar token FCM');
      return;
    }

    if (!token) {
      console.warn('[FCM] Token FCM vazio, não é possível salvar');
      return;
    }

    try {
      // Verificar se já existe registro para este usuário
      const { data: existingData, error: checkError } = await supabase
        .from('push_subscriptions')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle();

      // Se já existe, fazer UPDATE; senão, fazer INSERT
      if (existingData) {
        const { error: updateError } = await supabase
          .from('push_subscriptions')
          .update({
            subscription_details: {
              type: 'fcm',
              token: token
            },
            updated_at: new Date().toISOString()
          })
          .eq('user_id', user.id);

        if (updateError) {
          console.error('[FCM] Erro ao atualizar token FCM:', updateError);
        }
      } else {
        const { error: insertError } = await supabase
          .from('push_subscriptions')
          .insert({
            user_id: user.id,
            subscription_details: {
              type: 'fcm',
              token: token
            },
            updated_at: new Date().toISOString()
          });

        if (insertError) {
          console.error('[FCM] Erro ao inserir token FCM:', insertError);
        }
      }
    } catch (error) {
      console.error('[FCM] Erro ao salvar token FCM:', error);
    }
  }, [user]);

  // Solicitar permissão automaticamente na inicialização (se ainda não foi concedida)
  const requestPermissionOnInit = useCallback(async () => {
    if (!pushSupported || !user || !isCapacitor) {
      return;
    }

    try {
      const registration = await PushNotifications.checkPermissions();
      
      // Se permissão ainda não foi concedida, solicitar automaticamente
      if (registration.receive === 'prompt') {
        const permission = await PushNotifications.requestPermissions();
        
        if (permission.receive === 'granted') {
          // Forçar registro para gerar token
          await PushNotifications.register();
          setPushEnabled(true);
          // Atualizar preferências no banco
          if (user) {
            const { error } = await supabase
              .from('user_preferences')
              .upsert({ 
                user_id: user.id, 
                push_enabled: true 
              }, {
                onConflict: 'user_id'
              })
              .select();
            
            if (error) {
              console.error('[FCM] Erro ao atualizar push_enabled no banco:', error);
            }
          }
        } else {
          setPushEnabled(false);
          // Atualizar preferências no banco
          if (user) {
            const { error } = await supabase
              .from('user_preferences')
              .upsert({ 
                user_id: user.id, 
                push_enabled: false 
              }, {
                onConflict: 'user_id'
              })
              .select();
            
            if (error) {
              console.error('[FCM] Erro ao atualizar push_enabled no banco:', error);
            }
          }
        }
      } else if (registration.receive === 'granted') {
        // Permissão já concedida, verificar token
        setPushEnabled(true);
        // Atualizar preferências no banco
        if (user) {
          const { error } = await supabase
            .from('user_preferences')
            .upsert({ 
              user_id: user.id, 
              push_enabled: true 
            }, {
              onConflict: 'user_id'
            })
            .select();
          
          if (error) {
            console.error('[FCM] Erro ao atualizar push_enabled no banco:', error);
          }
        }
      } else {
        // Permissão negada
        setPushEnabled(false);
        // Atualizar preferências no banco
        if (user) {
          const { error } = await supabase
            .from('user_preferences')
            .upsert({ 
              user_id: user.id, 
              push_enabled: false 
            }, {
              onConflict: 'user_id'
            })
            .select();
          
          if (error) {
            console.error('[FCM] Erro ao atualizar push_enabled no banco:', error);
          }
        }
      }
    } catch (error) {
      console.error('[FCM] Erro ao solicitar permissão:', error);
      setPushEnabled(false);
    }
  }, [pushSupported, user, isCapacitor]);

  // Verificar subscription push existente
  const checkPushSubscription = useCallback(async () => {
    if (!pushSupported || !user) {
      return;
    }

    try {
      // 🔥 CAPACITOR: Verificar FCM token e forçar registro se necessário
      if (isCapacitor) {
        const registration = await PushNotifications.checkPermissions();
        
        // Sincronizar estado do toggle com a permissão
        if (registration.receive === 'granted') {
          setPushEnabled(true);
          
          // Atualizar push_enabled no banco quando permissão já está concedida
          console.log('[FCM] Permissão já concedida, atualizando push_enabled no banco...');
          const { data: prefData, error: prefError } = await supabase
            .from('user_preferences')
            .upsert({ 
              user_id: user.id, 
              push_enabled: true 
            }, {
              onConflict: 'user_id'
            })
            .select();
          
          if (prefError) {
            console.error('[FCM] Erro ao atualizar push_enabled no banco:', prefError);
          }
          
          // Primeiro, tentar usar a função SQL para verificar se precisa regenerar
          // Se a função não existir, usar a verificação direta
          let needsRegeneration = false;
          try {
            const { data: sqlResult, error: sqlError } = await supabase
              .rpc('user_needs_token_regeneration', { p_user_id: user.id });
            
            if (!sqlError && sqlResult !== null) {
              needsRegeneration = sqlResult;
            }
          } catch (e) {
            // Se função não existe ou erro, usar verificação direta
          }
          
          // Se não usou a função SQL, fazer verificação direta
          if (!needsRegeneration) {
            const { data: subscriptionData } = await supabase
              .from('push_subscriptions')
              .select('subscription_details')
              .eq('user_id', user.id)
              .maybeSingle();
            
            needsRegeneration = !subscriptionData || !subscriptionData.subscription_details?.token;
          }
          
          // Se não há token na base OU token inválido, forçar registro
          if (needsRegeneration) {
            try {
              await PushNotifications.register();
            } catch (regError) {
              console.error('[FCM] Erro ao forçar registro:', regError);
            }
          }
        } else if (registration.receive === 'denied') {
          // Permissão negada, desabilitar toggle
          setPushEnabled(false);
          // Atualizar preferências no banco
          const { error } = await supabase
            .from('user_preferences')
            .upsert({ 
              user_id: user.id, 
              push_enabled: false 
            }, {
              onConflict: 'user_id'
            })
            .select();
          
          if (error) {
            console.error('[FCM] Erro ao atualizar push_enabled no banco:', error);
          }
        } else {
          // Permissão ainda não foi solicitada (prompt)
          setPushEnabled(false);
        }
        return;
      }

      // 🔥 WEB: Verificar Service Worker subscription
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
  }, [pushSupported, pushEnabled, isCapacitor, user]);


  // Subscrever para push
  const subscribeToPush = async () => {
    if (!pushSupported) {
      alert('Seu navegador não suporta notificações push.');
      return false;
    }

    try {
      // 🔥 CAPACITOR: Usar Push Notifications nativo
      if (isCapacitor) {
        const permission = await PushNotifications.requestPermissions();
        
        if (permission.receive !== 'granted') {
          alert('Permissão para notificações foi negada.');
          return false;
        }

        // Registrar para receber token FCM
        await PushNotifications.register();
        
        setPushEnabled(true);
        
        // Token será recebido via listener 'registration'
        return true;
      }

      // 🔥 WEB: Usar Service Worker + VAPID
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
    try {
      // 🔥 CAPACITOR: Desabilitar notificações e remover registros
      if (isCapacitor) {
        // Remover tokens da base de dados
        await deletePushSubscription();
        
        // Desabilitar estado
        setPushEnabled(false);
        
        return;
      }

      // 🔥 WEB: Unsubscribe do Service Worker
      if (!subscription) {
        return;
      }

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
    // Garantir que temos todas as preferências padrão
    const currentPrefs = notificationPreferences || DEFAULT_PREFERENCES;
    
    // Verificar se o usuário é admin
    const isAdmin = user?.is_admin === true;
    
    // Mesclar preferências atuais com atualizações
    const newPreferences = { 
      ...DEFAULT_PREFERENCES,
      ...currentPrefs, 
      ...updates 
    };
    
    // 🔥 IMPORTANTE: Se não for admin, moderation_required sempre deve ser false
    if (!isAdmin) {
      newPreferences.moderation_required = false;
    }
    
    // Validar que todas as chaves necessárias estão presentes
    const requiredKeys = Object.keys(DEFAULT_PREFERENCES);
    const missingKeys = requiredKeys.filter(key => !(key in newPreferences));
    if (missingKeys.length > 0) {
      console.warn('⚠️ [PREF] Chaves faltando nas preferências:', missingKeys);
      // Adicionar chaves faltando com valores padrão
      missingKeys.forEach(key => {
        newPreferences[key] = DEFAULT_PREFERENCES[key];
      });
    }
    setNotificationPreferences(newPreferences);
    // ✅ IMPORTANTE: Atualizar ref imediatamente para que o realtime use os valores atualizados
    notificationPreferencesRef.current = newPreferences;

    if (!user) {
      localStorage.setItem('notification-preferences', JSON.stringify(newPreferences));
      return;
    }

    try {
      const { data, error } = await supabase
        .from('user_preferences')
        .upsert({ 
          user_id: user.id, 
          notification_preferences: newPreferences 
        }, {
          onConflict: 'user_id'
        })
        .select();
      
      if (error) {
        console.error('[PREF] Erro ao salvar preferências no Supabase:', error);
        // Tentar salvar no localStorage como fallback
        localStorage.setItem('notification-preferences', JSON.stringify(newPreferences));
        throw error; // Propagar erro para que o componente possa tratar
      } else {
        // Verificar se os dados foram salvos corretamente
        if (data && data.length > 0) {
          const savedPreferences = data[0].notification_preferences;
          
          // Parsear se for string JSON
          let parsedPrefs = savedPreferences;
          if (typeof savedPreferences === 'string') {
            try {
              parsedPrefs = JSON.parse(savedPreferences);
            } catch (e) {
              console.warn('⚠️ [PREF] Erro ao parsear preferências salvas:', e);
              parsedPrefs = newPreferences;
            }
          }
          
          // 🔥 IMPORTANTE: Sincronizar estado local com o que foi salvo no banco
          // Isso garante que os toggles reflitam exatamente o que está no banco
          if (parsedPrefs && Object.keys(parsedPrefs).length > 0) {
            const migratedPrefs = migrateOldPreferences(parsedPrefs);
            const finalPrefs = !isAdmin ? { ...migratedPrefs, moderation_required: false } : migratedPrefs;
            setNotificationPreferences(finalPrefs);
            // Atualizar ref imediatamente
            notificationPreferencesRef.current = finalPrefs;
          } else {
            console.warn('⚠️ [PREF] Preferências salvas como objeto vazio! Tentando novamente...');
            // Tentar novamente com estrutura explícita
            const retryResult = await supabase
              .from('user_preferences')
              .update({ 
                notification_preferences: newPreferences 
              })
              .eq('user_id', user.id)
              .select();
            if (retryResult.error) {
              console.error('[PREF] Erro ao tentar novamente:', retryResult.error);
              // Mesmo com erro, manter estado local atualizado
              setNotificationPreferences(newPreferences);
              notificationPreferencesRef.current = newPreferences;
            } else if (retryResult.data && retryResult.data.length > 0) {
              let retryPrefs = retryResult.data[0].notification_preferences;
              if (typeof retryPrefs === 'string') {
                try {
                  retryPrefs = JSON.parse(retryPrefs);
                } catch (e) {
                  retryPrefs = newPreferences;
                }
              }
              const migratedRetryPrefs = migrateOldPreferences(retryPrefs || newPreferences);
              const finalRetryPrefs = !isAdmin ? { ...migratedRetryPrefs, moderation_required: false } : migratedRetryPrefs;
              setNotificationPreferences(finalRetryPrefs);
              notificationPreferencesRef.current = finalRetryPrefs;
            } else {
              // Fallback: usar estado local
              setNotificationPreferences(newPreferences);
              notificationPreferencesRef.current = newPreferences;
            }
          }
        } else {
          // Se não retornou dados, manter estado local atualizado
          console.warn('⚠️ [PREF] Nenhum dado retornado do banco, mantendo estado local');
          setNotificationPreferences(newPreferences);
          notificationPreferencesRef.current = newPreferences;
        }
      }
    } catch (error) {
      console.error('[PREF] Erro ao atualizar preferências:', error);
      // Salvar no localStorage como fallback
      localStorage.setItem('notification-preferences', JSON.stringify(newPreferences));
      throw error; // Propagar erro para que o componente possa tratar
    }
  };

  // Abrir configurações do app (Android/iOS) - APENAS APP NATIVO
  const openAppSettings = async () => {
    // Verificar se é app nativo ANTES de tentar abrir
    if (!isCapacitor || !Capacitor.isNativePlatform()) {
      return false;
    }

    try {
      const platform = Capacitor.getPlatform();
      
      // Método 1: Usar Capacitor App plugin
      const { App } = await import('@capacitor/app');
      
      if (App) {
        // Android: usar Intent URI para abrir configurações do app
        if (platform === 'android') {
          const appId = 'com.trombonecidadao.app';
          const intentUri = `android.settings.APPLICATION_DETAILS_SETTINGS`;
          const intentUrl = `intent://settings#Intent;scheme=${intentUri};data=package:${appId};end`;
          
          if (typeof App.openUrl === 'function') {
            try {
              await App.openUrl({ url: intentUrl });
              return true;
            } catch (intentError) {
              console.error('[FCM] Erro ao usar Intent URI:', intentError);
              // Tentar método alternativo
            }
          }
          
          // Método alternativo: usar ACTION_APPLICATION_DETAILS_SETTINGS
          try {
            const altIntentUrl = `intent://settings#Intent;action=android.settings.APPLICATION_DETAILS_SETTINGS;data=package:${appId};end`;
            await App.openUrl({ url: altIntentUrl });
            return true;
          } catch (altError) {
            console.error('[FCM] Erro ao usar Intent URI alternativo:', altError);
          }
        }
        // iOS: tentar openAppSettings se disponível
        else if (platform === 'ios') {
          if (typeof App.openAppSettings === 'function') {
            await App.openAppSettings();
            return true;
          } else if (typeof App.openUrl === 'function') {
            await App.openUrl({ url: 'app-settings:' });
            return true;
          }
        }
        // Fallback genérico: tentar app-settings:
        else if (typeof App.openUrl === 'function') {
          await App.openUrl({ url: 'app-settings:' });
          return true;
        }
        
      }
    } catch (e) {
      console.error('[FCM] Erro ao importar/usar Capacitor App plugin:', e);
      console.error('[FCM] Stack trace:', e.stack);
    }

    // Fallback: tentar abrir via Intent no Android (se disponível)
    try {
      if (window.Android && typeof window.Android.openAppSettings === 'function') {
        window.Android.openAppSettings();
        return true;
      }
    } catch (e) {
      console.error('[FCM] Erro ao usar window.Android:', e);
    }

    return false;
  };

  // 🔥 Verificar e sincronizar permissão de push quando necessário
  const syncPushPermission = useCallback(async () => {
    if (!isCapacitor || !Capacitor.isNativePlatform() || !user) {
      return;
    }

    try {
      const registration = await PushNotifications.checkPermissions();
      const permissionGranted = registration.receive === 'granted';
      const currentState = pushEnabledRef.current;
      
      // Sincronizar estado local com a permissão real
      if (permissionGranted !== currentState) {
        // Atualizar estado local
        setPushEnabled(permissionGranted);
        
        // Se permissão foi concedida, garantir que está registrado
        if (permissionGranted) {
          try {
            await PushNotifications.register();
          } catch (regError) {
            console.error('[FCM] Erro ao registrar push notifications:', regError);
          }
        } else {
          // Se permissão foi negada, remover tokens
          await deletePushSubscription();
        }
        
        // Atualizar banco de dados
        const { error } = await supabase
          .from('user_preferences')
          .upsert({ 
            user_id: user.id, 
            push_enabled: permissionGranted 
          }, {
            onConflict: 'user_id'
          })
          .select();
        
        if (error) {
          console.error('[FCM] Erro ao sincronizar push_enabled no banco:', error);
        }
      }
    } catch (error) {
      console.error('[FCM] Erro ao verificar permissão de push:', error);
    }
  }, [isCapacitor, user, deletePushSubscription]);

  // Toggle push
  const togglePushNotifications = async (enabled) => {
    if (!pushSupported) {
      alert('Seu navegador não suporta notificações push.');
      return;
    }

    // Só abrir configurações se for app nativo
    if (!isCapacitor || !Capacitor.isNativePlatform()) {
      // Para web, usar método padrão
      if (enabled) {
        const success = await subscribeToPush();
        if (success) {
          setPushEnabled(true);
          if (user) {
            const { error } = await supabase
              .from('user_preferences')
              .upsert({ 
                user_id: user.id, 
                push_enabled: true 
              }, {
                onConflict: 'user_id'
              })
              .select();
            
            if (error) {
              console.error('[FCM] Erro ao atualizar push_enabled no banco:', error);
            }
          }
        }
      } else {
        await unsubscribeFromPush();
        setPushEnabled(false);
        if (user) {
          const { error } = await supabase
            .from('user_preferences')
            .upsert({ 
              user_id: user.id, 
              push_enabled: false 
            }, {
              onConflict: 'user_id'
            })
            .select();
          
          if (error) {
            console.error('[FCM] Erro ao atualizar push_enabled no banco:', error);
          }
        }
      }
      return;
    }

    // APENAS APP NATIVO - Abrir configurações diretamente SEMPRE
    if (enabled) {
      // Ativar notificações push - SEMPRE abrir configurações
      // Abrir configurações diretamente para o usuário habilitar permissão
      await openAppSettings();
      
      // 🔥 IMPORTANTE: Não atualizar estado imediatamente - aguardar verificação quando app voltar
      // O estado será sincronizado quando o app voltar ao foreground
    } else {
      // Desabilitar push - abrir configurações diretamente (APENAS APP NATIVO)
      // Remover tokens e subscriptions (mas não atualizar estado ainda - aguardar sincronização)
      await deletePushSubscription();
      
      // Abrir configurações diretamente para o usuário remover permissão
      await openAppSettings();
      
      // 🔥 IMPORTANTE: O estado será sincronizado automaticamente quando o app voltar ao foreground
      // Verificar permissão após um delay para caso o usuário volte rapidamente
      setTimeout(async () => {
        await syncPushPermission();
      }, 2000);
    }
  };

  // Toggle notificações gerais
  const toggleNotifications = async (enabled) => {
    const newValue = typeof enabled === 'boolean' ? enabled : !notificationsEnabled;
    
    // Se desabilitando notificações gerais, também desabilitar push
    if (!newValue && pushEnabled) {
      await togglePushNotifications(false);
    }
    
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
      // Tentar via Service Worker primeiro (funciona mesmo com site fechado)
      if (navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({
          type: 'TEST_NOTIFICATION'
        });
        
        // Também enviar notificação local para garantir que aparece
        if ('Notification' in window && Notification.permission === 'granted') {
          new Notification('Teste do Trombone Cidadão', {
            body: 'Esta é uma notificação de teste do Service Worker',
            icon: '/logo.png',
            badge: '/logo.png',
            color: '#4a2121', // Cor de fundo rgb(74, 33, 33)
            vibrate: [100, 50, 100],
            data: {
              url: '/',
              test: true
            },
            tag: 'test-notification-' + Date.now()
          });
        }
        
        return true;
      }
      
      // Fallback: notificação local se Service Worker não disponível
      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification('Teste do Trombone Cidadão', {
          body: 'Esta é uma notificação de teste local',
          icon: '/logo.png',
          badge: '/logo.png',
          color: '#4a2121', // Cor de fundo rgb(74, 33, 33)
          vibrate: [100, 50, 100],
          data: {
            url: '/',
            test: true
          },
          tag: 'test-notification-local-' + Date.now()
        });
        return true;
      }
      
      return false;
    } catch (error) {
      console.error('Error testing notification:', error);
      return false;
    }
  };

  // Forçar notificação push (para testes)
  const forcePushNotification = async (title = 'Teste Forçado', body = 'Esta é uma notificação forçada para testes') => {
    try {
      // Via Service Worker (funciona mesmo com site fechado)
      if (navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({
          type: 'SHOW_PUSH_NOTIFICATION',
          notification: {
            title: title,
            body: body,
            icon: '/logo.png',
            badge: '/logo.png',
            data: {
              url: '/',
              test: true,
              forced: true
            },
            tag: 'forced-' + Date.now(),
            color: '#4a2121', // Cor de fundo rgb(74, 33, 33)
            vibrate: [100, 50, 100],
            timestamp: Date.now()
          }
        });
      }
      
      // Também enviar notificação local
      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification(title, {
          body: body,
          icon: '/logo.png',
          badge: '/logo.png',
          color: '#4a2121', // Cor de fundo rgb(74, 33, 33)
          vibrate: [100, 50, 100],
          data: {
            url: '/',
            test: true,
            forced: true
          },
          tag: 'forced-local-' + Date.now()
        });
      }
      
      return true;
    } catch (error) {
      console.error('Error forcing push notification:', error);
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
    if (pushSupported && user) {
      // Aguardar um pouco para garantir que tudo está inicializado
      const timer = setTimeout(() => {
        // Primeiro, solicitar permissão automaticamente (se necessário)
        requestPermissionOnInit().then(() => {
          // Depois, verificar subscription
          checkPushSubscription();
        });
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [pushSupported, user, requestPermissionOnInit, checkPushSubscription]);

  // 🔥 CAPACITOR: Configurar listeners de Push Notifications
  // IMPORTANTE: Registrar listeners ANTES de qualquer notificação chegar
  useEffect(() => {
    if (!isCapacitor || !Capacitor.isPluginAvailable('PushNotifications')) {
      return;
    }
    
    // Listener: Token FCM recebido
    const registrationListener = PushNotifications.addListener('registration', async (token) => {
      await saveFCMToken(token.value);
      setPushEnabled(true);
      
      // Atualizar preferências no banco com push_enabled = true
      if (user) {
        const { data, error } = await supabase
          .from('user_preferences')
          .upsert({ 
            user_id: user.id, 
            push_enabled: true 
          }, {
            onConflict: 'user_id'
          })
          .select();
        
        if (error) {
          console.error('[FCM] Erro ao atualizar push_enabled no banco:', error);
        } else {
        }
      }
    });

    // Listener: Erro ao registrar
    const registrationErrorListener = PushNotifications.addListener('registrationError', async (error) => {
      console.error('[FCM] Erro ao registrar push notifications:', error);
      setPushEnabled(false);
      
      // Atualizar preferências no banco quando houver erro
      if (user) {
        const { data, error: updateError } = await supabase
          .from('user_preferences')
          .upsert({ 
            user_id: user.id, 
            push_enabled: false 
          }, {
            onConflict: 'user_id'
          })
          .select();
        
        if (updateError) {
          console.error('[FCM] Erro ao atualizar push_enabled no banco:', updateError);
        } else {
        }
      }
    });

    // Handler para processar notificação recebida em foreground
    const handlePushNotificationReceived = (notification) => {
      try {
        // Validar se notification é válido
        if (!notification || typeof notification !== 'object') {
          console.error('[FCM] Notificação inválida:', notification);
          return;
        }
        
        // Extrair dados da notificação
        const notificationData = notification.data || {};
        const notificationId = notification.id || notificationData.notification_id || Date.now().toString();
        const notificationMessage = notification.body || notificationData.message || notificationData.body || 'Nova notificação';
        const notificationType = notificationData.type || 'system';
        const notificationTitle = getNotificationTitle(notificationType);
        
        // Mostrar notificação local usando Notification API
        if ('Notification' in window && Notification.permission === 'granted') {
          try {
            const localNotification = new Notification(notificationTitle, {
              body: notificationMessage,
              icon: '/logo.png',
              badge: '/logo.png',
              tag: notificationId,
              data: {
                url: notificationData.url || getNotificationUrl({ type: notificationType, report_id: notificationData.report_id, work_id: notificationData.work_id }),
                notificationId: notificationId,
                type: notificationType
              },
              vibrate: [100, 50, 100]
            });
            
            // Adicionar click handler
            localNotification.onclick = (event) => {
              try {
                event.preventDefault();
                const url = event.notification.data?.url || '/notificacoes';
                if (window.location.pathname !== url) {
                  window.location.href = url;
                }
                localNotification.close();
              } catch (error) {
                console.error('[FCM] Erro ao processar click na notificação:', error);
              }
            };
            
          } catch (error) {
            console.error('[FCM] Erro ao exibir notificação local:', error);
            // Fallback: usar showLocalNotification
            try {
              showLocalNotification({
                id: notificationId,
                message: notificationMessage,
                type: notificationType
              });
            } catch (fallbackError) {
              console.error('[FCM] Erro no fallback de notificação:', fallbackError);
            }
          }
        } else {
          // Fallback: usar showLocalNotification
          try {
            showLocalNotification({
              id: notificationId,
              message: notificationMessage,
              type: notificationType
            });
          } catch (error) {
            console.error('[FCM] Erro ao usar showLocalNotification:', error);
          }
        }
      
        // Disparar evento customizado para atualizar componentes
        window.dispatchEvent(new CustomEvent('new-notification', {
          detail: {
            id: notificationId,
            message: notificationMessage,
            type: notificationType,
            report_id: notificationData.report_id,
            work_id: notificationData.work_id
          }
        }));
      } catch (error) {
        console.error('[FCM] Erro ao processar notificação em foreground:', error);
        // Não propagar o erro para evitar crashes
      }
    };

    // Listener: Notificação recebida (app aberto - FOREGROUND)
    // IMPORTANTE: Registrar este listener ANTES de qualquer notificação chegar
    const pushNotificationReceivedListener = PushNotifications.addListener('pushNotificationReceived', handlePushNotificationReceived);
    
    // Listener adicional: Evento customizado enviado do FCMService (fallback)
    const customPushNotificationListener = (event) => {
      try {
        if (event && event.detail) {
          handlePushNotificationReceived(event.detail);
        }
      } catch (error) {
        console.error('[FCM] Erro ao processar evento customizado:', error);
      }
    };
    window.addEventListener('pushNotificationReceived', customPushNotificationListener);

    // Listener: Notificação clicada (app em BACKGROUND ou fechado)
    const pushNotificationActionPerformedListener = PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
      // Extrair dados da notificação
      const notificationData = action.notification.data || {};
      const url = notificationData.url || getNotificationUrl({
        type: notificationData.type || 'system',
        report_id: notificationData.report_id,
        work_id: notificationData.work_id
      }) || '/notificacoes';
      
      // Navegar para a URL da notificação
      if (window.location.pathname !== url) {
        window.location.href = url;
      }
    });

    // Cleanup listeners
    return () => {
      registrationListener.remove();
      registrationErrorListener.remove();
      pushNotificationReceivedListener.remove();
      pushNotificationActionPerformedListener.remove();
      window.removeEventListener('pushNotificationReceived', customPushNotificationListener);
    };
  }, [isCapacitor, user, saveFCMToken]);

  // 🔥 CAPACITOR: Listener para quando app volta ao foreground (para sincronizar permissões)
  useEffect(() => {
    if (!isCapacitor || !Capacitor.isNativePlatform() || !user) {
      return;
    }

    let appStateListener = null;

    const setupAppStateListener = async () => {
      try {
        const { App } = await import('@capacitor/app');
        
        appStateListener = await App.addListener('appStateChange', async ({ isActive }) => {
          // Quando app volta ao foreground, verificar permissão e sincronizar
          if (isActive) {
            // Aguardar um pouco para garantir que o sistema atualizou a permissão
            setTimeout(async () => {
              await syncPushPermission();
            }, 500);
          }
        });
      } catch (error) {
        console.error('[FCM] Erro ao configurar listener de app state:', error);
      }
    };

    setupAppStateListener();

    return () => {
      if (appStateListener) {
        appStateListener.remove();
      }
    };
  }, [isCapacitor, user, syncPushPermission]);

  // 🔥 WEB/CAPACITOR: Verificar permissão quando a página fica visível (para sincronizar após voltar das configurações)
  useEffect(() => {
    if (!user || !pushSupported) {
      return;
    }

    const handleVisibilityChange = async () => {
      if (document.visibilityState === 'visible') {
        // Aguardar um pouco para garantir que o sistema atualizou a permissão
        setTimeout(async () => {
          if (isCapacitor && Capacitor.isNativePlatform()) {
            await syncPushPermission();
          } else {
            // Para web, verificar permissão do navegador
            if ('Notification' in window) {
              const permission = Notification.permission;
              const hasSubscription = subscriptionRef.current !== null;
              const shouldBeEnabled = permission === 'granted' && hasSubscription;
              
              if (shouldBeEnabled !== pushEnabledRef.current) {
                setPushEnabled(shouldBeEnabled);
                
                if (user) {
                  const { error } = await supabase
                    .from('user_preferences')
                    .upsert({ 
                      user_id: user.id, 
                      push_enabled: shouldBeEnabled 
                    }, {
                      onConflict: 'user_id'
                    })
                    .select();
                  
                  if (error) {
                    console.error('[FCM] Erro ao sincronizar push_enabled no banco:', error);
                  }
                }
              }
            }
          }
        }, 500);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    // Verificar imediatamente quando a página carrega
    if (document.visibilityState === 'visible') {
      handleVisibilityChange();
    }

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [user, pushSupported, isCapacitor, syncPushPermission]);

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
    forcePushNotification, // 🔥 Nova função para forçar notificações
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
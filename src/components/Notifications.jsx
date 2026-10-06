import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Bell, BellOff, Circle, Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Switch } from '@/components/ui/switch';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { supabase } from '@/lib/customSupabaseClient';
import { formatTimeAgo, uniqueChannelTopic } from '@/lib/utils';
import { Link } from 'react-router-dom';
import { useNotifications } from '../contexts/NotificationContext';
import { ELECTRICIAN_NOTIFICATION_LINK_FILTER, isElectricianServiceNotification } from '@/lib/electricianNotifications';

const Notifications = ({ scope = 'all' }) => {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState([]);
  const unreadCount = notifications.filter((notification) => !notification.is_read).length;
  const acceptsNotification = useCallback((notification) => (
    (user?.is_admin || notification?.type !== 'moderation_required')
    && (scope !== 'electrician' || isElectricianServiceNotification(notification))
  ), [scope, user?.is_admin]);
  const [loading, setLoading] = useState(true);
  const {
    notificationsEnabled,
    toggleNotifications,
  } = useNotifications();
  
  const [showSettings, setShowSettings] = useState(false);
  const realtimeChannelRef = useRef(null); // 🔥 Usar ref para evitar loop infinito
  const popoverTriggerRef = useRef(null); // 🔥 Ref para o botão do popover

  // 🔥 Fechar popover quando ReportDetails for aberto
  useEffect(() => {
    const handleCloseNotifications = () => {
      // Fechar o popover programaticamente clicando no botão do popover
      if (popoverTriggerRef.current) {
        popoverTriggerRef.current.click();
      }
    };

    window.addEventListener('close-notifications-popover', handleCloseNotifications);
    
    return () => {
      window.removeEventListener('close-notifications-popover', handleCloseNotifications);
    };
  }, []);

  const fetchNotifications = useCallback(async () => {
    if (!user || !notificationsEnabled) {
      setNotifications([]);
      setLoading(false);
      return;
    }
  
  setLoading(true);
  
  let query = supabase
    .from('notifications')
    .select('*')
    .eq('user_id', user.id);

  if (!user.is_admin) {
    query = query.neq('type', 'moderation_required');
  }
  if (scope === 'electrician') {
    query = query.eq('type', 'agency_case').or(ELECTRICIAN_NOTIFICATION_LINK_FILTER);
  }

  const { data, error } = await query
    .order('created_at', { ascending: false })
    .limit(20);

  if (error) {
      console.error('Erro ao buscar notificações:', error);
      setLoading(false);
  } else {
      setNotifications((data || []).filter(acceptsNotification));
      setLoading(false);
  }
}, [user, notificationsEnabled, scope, acceptsNotification]);

  // 🔥 Buscar notificações quando componente monta ou quando usuário/notificações mudam
  useEffect(() => {
    if (user && notificationsEnabled) {
      fetchNotifications();
    } else {
      setNotifications([]);
      setLoading(false);
    }
  }, [user, notificationsEnabled, fetchNotifications]);

  // 🔥 Função para adicionar nova notificação ao estado
  const addNewNotification = useCallback((newNotification) => {
    if (!acceptsNotification(newNotification)) return;
    // Adicionar nova notificação no início da lista
    setNotifications(prev => {
      // Verificar se já existe (evitar duplicatas)
      if (prev.some(n => n.id === newNotification.id)) {
        return prev;
      }
      return [newNotification, ...prev].slice(0, 20);
    });
    
  }, [acceptsNotification]);

  // Escutar eventos de novas notificações disparados pelo NotificationContext
  // O contexto já tem seu próprio canal realtime (context-notifications:userId) que lida com
  // INSERT e dispara este evento. Ter um segundo canal para INSERT causaria contagem dupla.
  useEffect(() => {
    if (!user || !notificationsEnabled) return;

    const handleCustomNotification = (event) => {
      const notification = event.detail;
      if (notification.user_id === user.id) {
        addNewNotification(notification);
      }
    };

    window.addEventListener('new-notification', handleCustomNotification);
    return () => window.removeEventListener('new-notification', handleCustomNotification);
  }, [user, notificationsEnabled, addNewNotification]);

  // Canal realtime apenas para UPDATE (marcar como lida em outra sessão/dispositivo)
  useEffect(() => {
    if (!user || !notificationsEnabled) {
      if (realtimeChannelRef.current) {
        supabase.removeChannel(realtimeChannelRef.current);
        realtimeChannelRef.current = null;
      }
      return;
    }

    if (realtimeChannelRef.current) {
      supabase.removeChannel(realtimeChannelRef.current);
      realtimeChannelRef.current = null;
    }

    const channel = supabase
      .channel(uniqueChannelTopic(`notifications-component:${user.id}`))
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${user.id}`
        },
        (payload) => {
          if (!acceptsNotification(payload.new)) return;
          setNotifications(prev =>
            prev.map(n => n.id === payload.new.id ? payload.new : n)
          );
        }
      )
      .subscribe();

    realtimeChannelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
      realtimeChannelRef.current = null;
    };
  }, [user, notificationsEnabled, acceptsNotification]);


  const handleToggleWithTimestamp = async (enabled) => {
    if (enabled) {
      // AO ATIVAR: buscar notificações recentes
      localStorage.removeItem('notifications-last-disabled');
    } else {
      // AO DESATIVAR: salvar timestamp e limpar notificações
      localStorage.setItem('notifications-last-disabled', new Date().toISOString());
      setNotifications([]);
    }
    
    await toggleNotifications(enabled);
  };

  const handlePopoverOpen = () => {
    setShowSettings(false);
  };

  const handleMarkAsRead = async (notificationId) => {
    const { error } = await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('id', notificationId);

    if (!error) {
      setNotifications(prev =>
        prev.map(n => (n.id === notificationId ? { ...n, is_read: true } : n))
      );
    }
  };

  const handleMarkAllAsRead = async () => {
    const unreadIds = notifications.filter(n => !n.is_read).map(n => n.id);
    if (unreadIds.length === 0) return;

    const { error } = await supabase
      .from('notifications')
      .update({ is_read: true })
      .in('id', unreadIds);

    if (!error) {
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
    }
  };

  const getNotificationLink = (notification) => {
    if (notification.link) {
      return notification.link;
    }
    if (notification.report_id) {
      return `/bronca/${notification.report_id}`;
    }
    if (notification.work_id) {
      return `/obras-publicas/${notification.work_id}`;
    }
    return '#';
  };

  const NotificationIcon = notificationsEnabled ? Bell : BellOff;

  return (
    <Popover onOpenChange={(open) => {
      if (open) {
        handlePopoverOpen();
        // Recarregar notificações quando abrir o popover (para garantir dados atualizados)
        if (notificationsEnabled && user) {
          fetchNotifications();
        }
      }
    }}>
      <PopoverTrigger asChild>
        <Button 
          ref={popoverTriggerRef}
          variant="ghost" 
          size="icon" 
          className="relative"
          aria-label="Notificações"
          title={notificationsEnabled ? "Notificações ativas" : "Notificações desativadas"}
        >
          <NotificationIcon className="h-5 w-5" />
          {notificationsEnabled && unreadCount > 0 && (
            <span className="absolute top-1 right-1 flex h-4 w-4">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
              <span className="relative inline-flex rounded-full h-4 w-4 bg-primary text-primary-foreground text-xs items-center justify-center">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end">
        <div className="p-4 border-b flex justify-between items-center">
          <h4 className="font-medium text-sm">Notificações</h4>
          <div className="flex items-center gap-2">
            {unreadCount > 0 && notificationsEnabled && (
              <Button 
                variant="link" 
                size="sm" 
                className="h-auto p-0 text-xs" 
                onClick={handleMarkAllAsRead}
              >
                Marcar todas como lidas
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0"
              asChild
              title="Configurações de notificação"
            >
              <Link to="/settings/notifications">
                <Settings className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>

        {showSettings ? (
          <div className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Notificações do site</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {notificationsEnabled 
                    ? "Você está recebendo notificações" 
                    : "Notificações desativadas"
                  }
                </p>
              </div>
              <Switch
                checked={notificationsEnabled}
                onCheckedChange={handleToggleWithTimestamp}
                className="data-[state=checked]:bg-green-500"
              />
            </div>
            
            {!notificationsEnabled && (
              <p className="text-xs text-muted-foreground mt-3 p-2 bg-muted rounded">
                Quando desativadas, você não receberá novas notificações.
              </p>
            )}
          </div>
        ) : (
          <div className="max-h-80 overflow-y-auto">
            {!notificationsEnabled ? (
              <div className="p-6 text-center">
                <BellOff className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm text-muted-foreground mb-2">Notificações desativadas</p>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => handleToggleWithTimestamp(true)}
                >
                  Ativar Notificações
                </Button>
              </div>
            ) : loading ? (
              <p className="p-4 text-sm text-muted-foreground">Carregando...</p>
            ) : notifications.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground">Nenhuma notificação ainda.</p>
            ) : (
              notifications.map(notification => (
                <Link
                  to={getNotificationLink(notification)}
                  key={notification.id}
                  className="block p-3 hover:bg-accent border-b last:border-b-0"
                  onClick={() => !notification.is_read && handleMarkAsRead(notification.id)}
                >
                  <div className="flex items-start gap-3">
                    {!notification.is_read && (
                      <Circle className="h-2 w-2 mt-1.5 fill-primary text-primary flex-shrink-0" />
                    )}
                    <div className={`flex-grow ${notification.is_read ? 'ml-5' : ''}`}>
                      <p className="text-sm">{notification.message}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {formatTimeAgo(notification.created_at)}
                      </p>
                    </div>
                  </div>
                </Link>
              ))
            )}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
};

export default Notifications;

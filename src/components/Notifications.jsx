import React, { useState, useEffect, useCallback } from 'react';
import { Bell, BellOff, Circle, Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Switch } from '@/components/ui/switch';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { supabase } from '@/lib/customSupabaseClient';
import { formatTimeAgo } from '@/lib/utils';
import { Link } from 'react-router-dom';
import { useNotifications } from '../contexts/NotificationContext';

const Notifications = () => {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const { notificationsEnabled, toggleNotifications } = useNotifications();
  const [showSettings, setShowSettings] = useState(false);
  const [realtimeChannel, setRealtimeChannel] = useState(null);

  const fetchNotifications = useCallback(async () => {
    if (!user || !notificationsEnabled) return;
    
    setLoading(true);
    
    // Buscar todas as notificações não lidas + últimas 10
    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(20); // Buscar um pouco mais para garantir

    if (error) {
      console.error('Error fetching notifications:', error);
    } else {
      setNotifications(data);
      const unread = data.filter(n => !n.is_read).length;
      setUnreadCount(unread);
    }
    setLoading(false);
  }, [user, notificationsEnabled]);

  // Configurar/remover real-time subscriptions baseado no estado
  useEffect(() => {
    if (!user) return;

    let channel = null;

    if (notificationsEnabled) {
      console.log('🔔 Configurando real-time para notificações');
      
      // Buscar notificações atuais
      fetchNotifications();

      // Configurar real-time para TODAS as notificações futuras
      channel = supabase
        .channel(`notifications:${user.id}`)
        .on('postgres_changes', { 
          event: 'INSERT', 
          schema: 'public', 
          table: 'notifications', 
          filter: `user_id=eq.${user.id}` 
        }, (payload) => {
          console.log('📨 Nova notificação recebida:', payload.new);
          setNotifications(prev => [payload.new, ...prev.slice(0, 19)]);
          setUnreadCount(prev => prev + 1);
        })
        .subscribe((status) => {
          console.log('📡 Status do canal real-time:', status);
        });

      setRealtimeChannel(channel);
    } else {
      console.log('🔕 Removendo real-time - notificações desativadas');
      // DESATIVAR: remover real-time e limpar notificações
      if (realtimeChannel) {
        supabase.removeChannel(realtimeChannel);
        setRealtimeChannel(null);
      }
      setNotifications([]);
      setUnreadCount(0);
    }

    return () => {
      if (channel) {
        console.log('🧹 Limpando canal real-time');
        supabase.removeChannel(channel);
      }
    };
  }, [user, notificationsEnabled, fetchNotifications]);

  const handleToggleWithTimestamp = async (enabled) => {
    console.log('🔄 Alternando notificações para:', enabled);
    
    if (enabled) {
      // AO ATIVAR: buscar notificações recentes
      // Não usamos timestamp de ativação para não perder notificações existentes
      localStorage.removeItem('notifications-last-disabled');
    } else {
      // AO DESATIVAR: salvar timestamp e limpar notificações
      localStorage.setItem('notifications-last-disabled', new Date().toISOString());
      setNotifications([]);
      setUnreadCount(0);
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
      setUnreadCount(prev => Math.max(0, prev - 1));
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
      setUnreadCount(0);
    }
  };

  const getNotificationLink = (notification) => {
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
        // Recarregar notificações quando abrir o popover
        if (notificationsEnabled && user) {
          fetchNotifications();
        }
      }
    }}>
      <PopoverTrigger asChild>
        <Button 
          variant="ghost" 
          size="icon" 
          className="relative"
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
              <Button variant="link" size="sm" className="h-auto p-0 text-xs" onClick={handleMarkAllAsRead}>
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
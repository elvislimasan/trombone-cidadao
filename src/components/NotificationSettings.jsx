import React from 'react';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Bell, Smartphone, MessageSquare, Construction, AlertTriangle, Settings } from 'lucide-react';
import { useNotifications } from '@/contexts/NotificationContext';

const NotificationSettings = () => {
  const {
    notificationsEnabled,
    pushEnabled,
    pushSupported,
    notificationPreferences,
    toggleNotifications,
    togglePushNotifications,
    updatePreferences
  } = useNotifications();

  return (
    <Card className="w-full max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bell className="h-6 w-6" />
          Configurações de Notificação
        </CardTitle>
        <CardDescription>
          Controle como e quando você recebe notificações
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Notificações do Site */}
        <div className="flex items-center justify-between p-4 border rounded-lg">
          <div className="flex items-center gap-3">
            <Bell className="h-5 w-5 text-muted-foreground" />
            <div>
              <p className="font-medium">Notificações do Site</p>
              <p className="text-sm text-muted-foreground">
                Notificações enquanto você está no site
              </p>
            </div>
          </div>
          <Switch
            checked={notificationsEnabled}
            onCheckedChange={toggleNotifications}
          />
        </div>

        {/* Notificações Push */}
        <div className="flex items-center justify-between p-4 border rounded-lg">
          <div className="flex items-center gap-3">
            <Smartphone className="h-5 w-5 text-muted-foreground" />
            <div>
              <p className="font-medium">Notificações Push</p>
              <p className="text-sm text-muted-foreground">
                Receba notificações mesmo com o site fechado
              </p>
              {!pushSupported && (
                <p className="text-xs text-orange-600 mt-1">
                  Seu navegador não suporta notificações push
                </p>
              )}
            </div>
          </div>
          <Switch
            checked={pushEnabled}
            onCheckedChange={togglePushNotifications}
            disabled={!pushSupported || !notificationsEnabled}
          />
        </div>

        {/* Tipos de Notificação */}
        {notificationsEnabled && (
          <div className="space-y-4">
            <h4 className="font-medium flex items-center gap-2">
              <Settings className="h-4 w-4" />
              Tipos de Notificação
            </h4>
            
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 border rounded-lg">
                <div className="flex items-center gap-3">
                  <AlertTriangle className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="font-medium text-sm">Relatórios</p>
                    <p className="text-xs text-muted-foreground">
                      Novos relatórios na sua área
                    </p>
                  </div>
                </div>
                <Switch
                  checked={notificationPreferences.reports}
                  onCheckedChange={(checked) => 
                    updatePreferences({ reports: checked })
                  }
                  disabled={!notificationsEnabled}
                />
              </div>

              <div className="flex items-center justify-between p-3 border rounded-lg">
                <div className="flex items-center gap-3">
                  <Construction className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="font-medium text-sm">Obras Públicas</p>
                    <p className="text-xs text-muted-foreground">
                      Atualizações em obras
                    </p>
                  </div>
                </div>
                <Switch
                  checked={notificationPreferences.works}
                  onCheckedChange={(checked) => 
                    updatePreferences({ works: checked })
                  }
                  disabled={!notificationsEnabled}
                />
              </div>

              <div className="flex items-center justify-between p-3 border rounded-lg">
                <div className="flex items-center gap-3">
                  <MessageSquare className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="font-medium text-sm">Comentários</p>
                    <p className="text-xs text-muted-foreground">
                      Respostas aos seus comentários
                    </p>
                  </div>
                </div>
                <Switch
                  checked={notificationPreferences.comments}
                  onCheckedChange={(checked) => 
                    updatePreferences({ comments: checked })
                  }
                  disabled={!notificationsEnabled}
                />
              </div>
            </div>
          </div>
        )}

        {!notificationsEnabled && (
          <div className="p-4 bg-muted rounded-lg text-center">
            <p className="text-sm text-muted-foreground">
              Ative as notificações do site para configurar os tipos de notificação
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default NotificationSettings;
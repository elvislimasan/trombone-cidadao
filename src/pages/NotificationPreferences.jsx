import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useNotifications } from '@/contexts/NotificationContext';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useCache } from '@/hooks/useCache';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

import { Switch } from '../components/ui/switch';
import { 
  Bell, 
  BellOff, 
  Smartphone, 
  MessageSquare, 
  Construction, 
  AlertTriangle, 
  Settings, 
  ArrowLeft,
  CheckCircle2,
  XCircle,
  TestTube,
  Shield,
  Volume2,
  VolumeX,
  Trash2,
  Database,
  RefreshCw,
  FileText,
  RefreshCcw,
  UserCheck,
  Camera,
  Wrench
} from 'lucide-react';
import { toast } from 'sonner';
import { Separator } from '../components/ui/separator';
import { Badge } from '../components/ui/badge';
import { Capacitor } from '@capacitor/core';
import { useMobileHeader } from '@/contexts/MobileHeaderContext';
import { useNativeUIMode } from '@/contexts/NativeUIModeContext';

// Valores padrão para evitar undefined
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

const NotificationPreferences = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { setTitle, setActions, setShowBack, setOnBack, reset } = useMobileHeader();
  const { isInteractive } = useNativeUIMode();
  const {
    notificationsEnabled,
    pushEnabled,
    pushSupported,
    notificationPreferences = DEFAULT_PREFERENCES, // Valor padrão
    toggleNotifications,
    togglePushNotifications,
    updatePreferences,
    testNotification,
    loading
  } = useNotifications();
  
  // Verificar se o usuário é admin
  const isAdmin = user?.is_admin === true;

  const { clearCache, getCacheStatus } = useCache();
  const [testing, setTesting] = useState(false);
  const [clearingCache, setClearingCache] = useState(false);
  const [cacheInfo, setCacheInfo] = useState(null);

  // Usar preferências com fallback
  const safePreferences = notificationPreferences || DEFAULT_PREFERENCES;

  useEffect(() => {
    if (!isInteractive) return;
    setTitle('Notificações');
    setActions([]);
    setShowBack(true);
    setOnBack(() => () => {
      if (window.history.length > 1) navigate(-1);
      else navigate('/perfil', { replace: true });
    });
    return () => reset();
  }, [isInteractive, navigate, reset, setActions, setOnBack, setShowBack, setTitle]);

  useEffect(() => {
    if ('caches' in window) {
      getCacheStatus().then(setCacheInfo);
    }
  }, [getCacheStatus]);

  const handleTestNotification = async () => {
    setTesting(true);
    const success = await testNotification();
    
    if (success) {
      toast.success('Notificação de teste enviada!');
    } else {
      toast.error('Erro ao enviar notificação de teste');
    }
    setTesting(false);
  };

  const handleClearCache = async () => {
    setClearingCache(true);
    const success = await clearCache();
    
    if (success) {
      toast.success('Cache limpo com sucesso!');
      setCacheInfo(await getCacheStatus());
      setTimeout(() => {
        window.location.reload();
      }, 1000);
    } else {
      toast.error('Erro ao limpar cache');
    }
    setClearingCache(false);
  };

  const handleToggleAll = (enabled) => {
    toggleNotifications(enabled);
    if (!enabled && pushEnabled) {
      togglePushNotifications(false);
    }
  };

  // Filtrar tipos de notificação baseado em permissões
  // 🔥 IMPORTANTE: Usar useMemo para recalcular quando safePreferences mudar
  const allNotificationTypes = React.useMemo(() => [
    {
      id: 'reports',
      name: 'Broncas',
      description: 'Novas broncas e atualizações de denúncias na sua área',
      icon: AlertTriangle,
      adminOnly: false
    },
    {
      id: 'moderation_update',
      name: 'Status da Bronca',
      description: 'Atualizações no status de moderação das suas broncas',
      icon: FileText,
      adminOnly: false
    },
    {
      id: 'status_update',
      name: 'Atualização de Status',
      description: 'Mudanças no status das suas broncas (pendente, em análise, resolvida)',
      icon: RefreshCcw,
      adminOnly: false
    },
    {
      id: 'moderation_required',
      name: 'Moderação Necessária',
      description: 'Alertas quando uma bronca precisa de moderação urgente',
      icon: UserCheck,
      adminOnly: true // Apenas para admins
    },
    {
      id: 'resolution_submission',
      name: 'Resolução Enviada',
      description: 'Notificações quando uma resolução é enviada para suas broncas',
      icon: Camera,
      adminOnly: false
    },
    {
      id: 'works',
      name: 'Obras Públicas',
      description: 'Atualizações em obras que você segue',
      icon: Construction,
      adminOnly: false
    },
    {
      id: 'work_update',
      name: 'Atualização de Obra',
      description: 'Mudanças e progressos em obras públicas',
      icon: Wrench,
      adminOnly: false
    },
    {
      id: 'comments',
      name: 'Comentários',
      description: 'Respostas e menções nos seus comentários',
      icon: MessageSquare,
      adminOnly: false
    },
    {
      id: 'system',
      name: 'Sistema',
      description: 'Notificações importantes do sistema',
      icon: Shield,
      adminOnly: false
    }
  ].map(type => {
    // 🔥 IMPORTANTE: Buscar valor atualizado das preferências
    const hasPreference = safePreferences && Object.prototype.hasOwnProperty.call(safePreferences, type.id);
    const preferenceValue = hasPreference ? safePreferences[type.id] : DEFAULT_PREFERENCES[type.id];
    const isEnabled = preferenceValue === true || preferenceValue === 'true';
    
    return {
      ...type,
      enabled: isEnabled
    };
  }), [safePreferences]);
  
  // Filtrar apenas tipos visíveis para o usuário atual
  const notificationTypes = React.useMemo(() => allNotificationTypes.filter(type => {
    // Se for adminOnly, mostrar apenas para admins
    if (type.adminOnly && !isAdmin) {
      return false;
    }
    return true;
  }), [allNotificationTypes, isAdmin]);

  // Calcular tipos ativos de forma segura
  const activeTypesCount = Object.values(safePreferences).filter(Boolean).length;
  const totalTypesCount = Object.keys(safePreferences).length;


  if (loading) {
    return (
      <div className="container mx-auto py-8 max-w-4xl">
        <div className="flex items-center gap-4 mb-8">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold">Configurações</h1>
            <p className="text-muted-foreground">Carregando preferências...</p>
          </div>
        </div>
        <div className="animate-pulse space-y-4">
          <div className="h-32 bg-muted rounded-lg"></div>
          <div className="h-32 bg-muted rounded-lg"></div>
          <div className="h-48 bg-muted rounded-lg"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8 max-w-4xl">
      {/* Header */}
      {(!Capacitor.isNativePlatform() || !isInteractive) && (
      <div className="flex items-center gap-4 mb-8">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-3">
            <Settings className="h-8 w-8" />
            Configurações de Notificação
          </h1>
          <p className="text-muted-foreground mt-2">
            Controle como e quando você recebe notificações
          </p>
        </div>
      </div>
      )}

      <div className="space-y-6">

        {/* Configurações Principais */}
        <Card>
          <CardHeader>
            <CardTitle>Configurações Principais</CardTitle>
            <CardDescription>
              Configure como você deseja receber notificações
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Notificações do Site */}
            <div className="flex items-center justify-between p-4 border rounded-lg">
              <div className="flex items-start gap-4 flex-1">
                <div className={`p-2 rounded-full ${
                  notificationsEnabled 
                    ? 'bg-green-100 text-green-600 dark:bg-green-900/30' 
                    : 'bg-red-100 text-red-600 dark:bg-red-900/30'
                }`}>
                  {notificationsEnabled ? <Volume2 className="h-5 w-5" /> : <VolumeX className="h-5 w-5" />}
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <p className="font-semibold">Notificações do Site</p>
                    <Badge variant={notificationsEnabled ? "default" : "secondary"}>
                      {notificationsEnabled ? 'Ativo' : 'Inativo'}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Receba notificações enquanto você está usando o site
                  </p>
                  {!notificationsEnabled && (
                    <p className="text-xs text-amber-600 mt-2">
                      💡 Com as notificações desativadas, você não receberá nenhum tipo de alerta.
                    </p>
                  )}
                </div>
              </div>
              <Switch
                checked={notificationsEnabled}
                onCheckedChange={handleToggleAll}
                className="data-[state=checked]:bg-green-500"
              />
            </div>

            <Separator />

            {/* Notificações Push */}
            <div className="flex items-center justify-between p-4 border rounded-lg">
              <div className="flex items-start gap-4 flex-1">
                <div className={`p-2 rounded-full ${
                  pushEnabled 
                    ? 'bg-green-100 text-green-600 dark:bg-green-900/30' 
                    : 'bg-gray-100 text-gray-600 dark:bg-gray-900/30'
                }`}>
                  <Smartphone className="h-5 w-5" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <p className="font-semibold">Notificações Push</p>
                    <Badge variant={
                      !pushSupported ? "secondary" : 
                      pushEnabled ? "default" : "outline"
                    }>
                      {!pushSupported ? 'Não suportado' : 
                       pushEnabled ? 'Ativo' : 'Disponível'}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Receba notificações mesmo com o site fechado
                  </p>
                  
                  {!pushSupported && (
                    <p className="text-xs text-amber-600 mt-2">
                      ⚠️ Seu navegador não suporta notificações push.
                    </p>
                  )}
                  
                  {pushSupported && !pushEnabled && notificationsEnabled && (
                    <p className="text-xs text-blue-600 mt-2">
                      💡 Ative para receber alertas importantes mesmo fora do site.
                    </p>
                  )}

                  {pushEnabled && (
                    <p className="text-xs text-green-600 mt-2">
                      ✅ Você receberá notificações no seu dispositivo.
                    </p>
                  )}
                </div>
              </div>
              <Switch
                checked={pushEnabled}
                onCheckedChange={togglePushNotifications}
                disabled={!pushSupported || !notificationsEnabled || loading}
                className="data-[state=checked]:bg-green-500"
              />
            </div>

            {/* Botão de Teste */}
            {pushEnabled && (
              <div className="flex justify-end">
                <Button
                  onClick={handleTestNotification}
                  disabled={testing || !pushSupported}
                  variant="outline"
                  className="flex items-center gap-2"
                >
                  <TestTube className="h-4 w-4" />
                  {testing ? 'Enviando Teste...' : 'Testar Notificação'}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Tipos de Notificação */}
        <Card>
          <CardHeader>
            <CardTitle>Tipos de Notificação</CardTitle>
            <CardDescription>
              Escolha quais tipos de notificação você deseja receber
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {notificationTypes.map((type) => (
                <div
                  key={type.id}
                  className={`flex items-center justify-between p-4 border rounded-lg transition-all ${
                    !notificationsEnabled ? 'opacity-50' : 'hover:border-primary/50'
                  }`}
                >
                  <div className="flex items-start gap-4 flex-1">
                    <div className={`p-2 rounded-full ${
                      type.enabled && notificationsEnabled
                        ? 'bg-blue-100 text-blue-600 dark:bg-blue-900/30'
                        : 'bg-gray-100 text-gray-600 dark:bg-gray-900/30'
                    }`}>
                      <type.icon className="h-5 w-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-semibold">{type.name}</p>
                        {type.id === 'moderation_required' && isAdmin ? (
                          <Badge variant="secondary">Sempre ativo</Badge>
                        ) : null}
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">
                        {type.description}
                      </p>
                    </div>
                  </div>
                  <Switch
                    checked={(type.id === 'moderation_required' && isAdmin) ? true : (!!type.enabled && !!notificationsEnabled)}
                    onCheckedChange={async (checked) => {
                      try {
                        if (type.id === 'moderation_required' && isAdmin) return;
                        const update = { [type.id]: checked };
                        
                        await updatePreferences(update);
                        
                        
                        toast.success(
                          checked 
                            ? `${type.name} habilitado` 
                            : `${type.name} desabilitado`,
                          { duration: 2000 }
                        );
                      } catch (error) {
                        console.error(`❌ [PREF UI] Erro ao atualizar ${type.id}:`, error);
                        console.error('❌ [PREF UI] Stack trace:', error.stack);
                        toast.error(`Erro ao atualizar ${type.name}. Verifique o console.`, { duration: 4000 });
                      }
                    }}
                    disabled={!notificationsEnabled || loading || (type.id === 'moderation_required' && isAdmin)}
                    className="data-[state=checked]:bg-blue-500"
                  />
                </div>
              ))}
            </div>

            {!notificationsEnabled && (
              <div className="mt-4 p-4 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-lg">
                <div className="flex items-center gap-2 text-amber-800 dark:text-amber-200">
                  <BellOff className="h-4 w-4" />
                  <p className="text-sm font-medium">
                    Ative as notificações do site para configurar os tipos de notificação
                  </p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Gerenciamento de Cache */}
        {'caches' in window && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Database className="h-5 w-5" />
                Gerenciamento de Cache
              </CardTitle>
              <CardDescription>
                Controle o armazenamento local do aplicativo
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">Status do Cache</p>
                    <p className="text-sm text-muted-foreground">
                      {cacheInfo ? (
                        cacheInfo.caches?.length > 0 ? (
                          `${cacheInfo.caches.reduce((total, cache) => total + cache.size, 0)} recursos armazenados`
                        ) : 'Nenhum cache encontrado'
                      ) : 'Verificando...'}
                    </p>
                  </div>
                  <Button
                    onClick={handleClearCache}
                    disabled={clearingCache}
                    variant="outline"
                    className="flex items-center gap-2 text-red-600 hover:text-red-700"
                  >
                    {clearingCache ? (
                      <RefreshCw className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                    {clearingCache ? 'Limpando...' : 'Limpar Cache'}
                  </Button>
                </div>
                
                <div className="p-3 bg-blue-50 dark:bg-blue-950/20 rounded-lg">
                  <p className="text-sm text-blue-800 dark:text-blue-300">
                    💡 Limpar o cache pode resolver problemas de carregamento e garantir 
                    que você está usando a versão mais recente do aplicativo.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Informações Adicionais */}
        <Card className="bg-muted/50">
          <CardHeader>
            <CardTitle className="text-lg">💡 Como funcionam as notificações</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div className="space-y-2">
                <p className="font-medium">🔔 Notificações do Site</p>
                <p className="text-muted-foreground">
                  Alertas que aparecem enquanto você está usando o site. São ideais para 
                  acompanhar atividades em tempo real.
                </p>
              </div>
              
              <div className="space-y-2">
                <p className="font-medium">📱 Notificações Push</p>
                <p className="text-muted-foreground">
                  Alertas que chegam no seu celular ou computador, mesmo com o site fechado.
                  Requer permissão do navegador.
                </p>
              </div>
              
              <div className="space-y-2">
                <p className="font-medium">⏰ Frequência</p>
                <p className="text-muted-foreground">
                  As notificações são enviadas imediatamente quando ocorrem eventos 
                  relevantes baseados nas suas preferências.
                </p>
              </div>
              
              <div className="space-y-2">
                <p className="font-medium">🔐 Privacidade</p>
                <p className="text-muted-foreground">
                  Suas preferências são salvas de forma segura e você pode alterá-las 
                  a qualquer momento.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

      </div>
    </div>
  );
};

export default NotificationPreferences;

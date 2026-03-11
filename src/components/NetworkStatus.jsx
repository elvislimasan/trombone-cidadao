import React from 'react';
import { useNetworkStatus, useConnectionQuality } from '@/hooks/useNetworkStatus';
import { AlertCircle, Wifi, WifiOff, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

/**
 * Componente para mostrar o status da rede
 * @param {Object} props
 * @param {boolean} props.showAlways - Mostrar sempre ou apenas quando offline
 * @param {Function} props.onRetry - Função chamada quando clicar em "Tentar novamente"
 */
export const NetworkStatus = ({ showAlways = false, onRetry }) => {
  const { isOnline, isOffline } = useNetworkStatus();
  const { effectiveType } = useConnectionQuality();

  if (!showAlways && isOnline) {
    return null;
  }

  const handleRetry = () => {
    if (onRetry) {
      onRetry();
    } else {
      window.location.reload();
    }
  };

  return (
    <div className="fixed top-4 right-4 left-4 md:left-auto md:right-4 md:w-80 z-50">
      {isOffline ? (
        <Alert variant="destructive" className="shadow-lg">
          <WifiOff className="h-4 w-4" />
          <AlertTitle>Sem conexão</AlertTitle>
          <AlertDescription className="space-y-2">
            <p>O app está offline. Verifique sua conexão com a internet.</p>
            <Button
              size="sm"
              variant="outline"
              onClick={handleRetry}
              className="mt-2"
            >
              <RefreshCw className="h-3 w-3 mr-2" />
              Tentar novamente
            </Button>
          </AlertDescription>
        </Alert>
      ) : (
        <Alert variant="default" className="bg-blue-50 border-blue-200">
          <Wifi className="h-4 w-4 text-blue-600" />
          <AlertTitle className="text-blue-800">Conexão lenta</AlertTitle>
          <AlertDescription className="text-blue-700">
            <p>
              Sua conexão está {effectiveType === 'slow-2g' ? 'muito lenta' : 'lenta'}. 
              O carregamento pode demorar mais.
            </p>
            <Button
              size="sm"
              variant="outline"
              onClick={handleRetry}
              className="mt-2 border-blue-300 text-blue-700 hover:bg-blue-100"
            >
              <RefreshCw className="h-3 w-3 mr-2" />
              Recarregar
            </Button>
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
};

/**
 * Componente inline para mostrar status da rede
 */
export const InlineNetworkStatus = () => {
  const { isOnline } = useNetworkStatus();
  const { effectiveType } = useConnectionQuality();

  if (isOnline) {
    return (
      <div className="inline-flex items-center text-xs text-green-600">
        <Wifi className="h-3 w-3 mr-1" />
        <span className="capitalize">{effectiveType}</span>
      </div>
    );
  }

  return (
    <div className="inline-flex items-center text-xs text-red-600">
      <WifiOff className="h-3 w-3 mr-1" />
      Offline
    </div>
  );
};
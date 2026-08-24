import React from 'react';
import { Loader2, WifiOff, AlertTriangle } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';

// Banners exibidos acima da lista quando ja existem broncas carregadas.
export const FeedStates = ({ isOffline, isSlow, error, hasReports, onRetry }) => (
  <>
    {isOffline && hasReports && (
      <Alert variant="destructive" className="mb-4">
        <WifiOff className="h-4 w-4" />
        <div>
          <AlertTitle>Sem conexão</AlertTitle>
          <AlertDescription>Conecte-se à internet para carregar o feed.</AlertDescription>
          <div className="mt-3 flex gap-2">
            {/* preserve derivado de hasReports, nao literal: se a guarda de render
                acima mudar, o valor continua correto. */}
            <Button variant="outline" onClick={() => onRetry({ preserve: hasReports })}>
              Tentar novamente
            </Button>
          </div>
        </div>
      </Alert>
    )}

    {isSlow && !isOffline && (
      <Alert className="mb-4">
        <Loader2 className="h-4 w-4 animate-spin" />
        <div>
          <AlertTitle>Conexão lenta</AlertTitle>
          <AlertDescription>
            Estamos tentando carregar as broncas. Se demorar, tente novamente.
          </AlertDescription>
          <div className="mt-3 flex gap-2">
            <Button variant="outline" onClick={() => onRetry({ preserve: hasReports })}>
              Tentar novamente
            </Button>
          </div>
        </div>
      </Alert>
    )}

    {error && hasReports && !isOffline && (
      <Alert variant="destructive" className="mb-4">
        <AlertTriangle className="h-4 w-4" />
        <div>
          <AlertTitle>Falha ao atualizar o feed</AlertTitle>
          <AlertDescription>
            {error.message}
            <div className="mt-3 flex gap-2">
              <Button variant="outline" onClick={() => onRetry({ preserve: true })}>
                Tentar novamente
              </Button>
            </div>
          </AlertDescription>
        </div>
      </Alert>
    )}
  </>
);

// Estado de falha total, quando nao ha nenhuma bronca carregada.
export const FeedFatalState = ({ isOffline, error, onRetry }) => {
  if (!isOffline && !error) return null;
  return (
    <div className="py-10">
      <Alert variant="destructive">
        <WifiOff className="h-4 w-4" />
        <div>
          <AlertTitle>{isOffline ? 'Sem conexão' : 'Não foi possível carregar'}</AlertTitle>
          <AlertDescription>
            {isOffline ? 'Conecte-se à internet para carregar o feed.' : error?.message}
            <div className="mt-3 flex gap-2">
              <Button variant="outline" onClick={() => onRetry({ preserve: false })}>
                Tentar novamente
              </Button>
            </div>
          </AlertDescription>
        </div>
      </Alert>
    </div>
  );
};

export const FeedLoadMoreError = ({ error, onRetry }) => {
  if (!error) return null;
  return (
    <Alert variant="destructive">
      <AlertTriangle className="h-4 w-4" />
      <div>
        <AlertTitle>Falha ao carregar mais broncas</AlertTitle>
        <AlertDescription>
          {error.message}
          <div className="mt-3 flex gap-2">
            <Button variant="outline" onClick={onRetry}>
              Tentar novamente
            </Button>
          </div>
        </AlertDescription>
      </div>
    </Alert>
  );
};

export default FeedStates;

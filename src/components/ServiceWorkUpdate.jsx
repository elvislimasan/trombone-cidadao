import { useServiceWorker } from '@/hooks/useServiceWorker';
import { Button } from '@/components/ui/button';
import { RefreshCw } from 'lucide-react';

export const ServiceWorkerUpdate = () => {
  const { updateAvailable, updateServiceWorker } = useServiceWorker();

  if (!updateAvailable) return null;

  return (
    <div className="fixed bottom-4 right-4 bg-blue-600 text-white p-4 rounded-lg shadow-lg z-50">
      <div className="flex items-center gap-3">
        <RefreshCw className="h-5 w-5" />
        <div>
          <p className="font-medium">Nova versão disponível!</p>
          <p className="text-sm opacity-90">Atualize para a versão mais recente.</p>
        </div>
        <Button 
          onClick={updateServiceWorker}
          variant="secondary"
          size="sm"
        >
          Atualizar
        </Button>
      </div>
    </div>
  );
};
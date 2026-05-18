import React from 'react';
import { Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useNotifications } from '@/contexts/NotificationContext';

const NotificationPermissionModal = () => {
  const { showPermissionRationale, confirmPermissionRequest, dismissPermissionRationale } = useNotifications();

  return (
    <Dialog open={showPermissionRationale} onOpenChange={dismissPermissionRationale}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <div className="flex items-center justify-center w-14 h-14 rounded-full bg-primary/10 mx-auto mb-2">
            <Bell className="w-7 h-7 text-primary" />
          </div>
          <DialogTitle className="text-center">Ativar notificações?</DialogTitle>
          <DialogDescription className="text-center">
            Receba alertas quando o status da sua bronca for atualizado, quando obras próximas tiverem novidades e quando suas petições ganharem assinaturas.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="flex-col gap-2 sm:flex-col">
          <Button onClick={confirmPermissionRequest} className="w-full gap-2">
            <Bell className="w-4 h-4" />
            Ativar notificações
          </Button>
          <Button variant="ghost" onClick={dismissPermissionRationale} className="w-full text-muted-foreground">
            Agora não
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default NotificationPermissionModal;

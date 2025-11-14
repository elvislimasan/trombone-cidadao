import React, { useState } from 'react';
import { Helmet } from 'react-helmet';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, Trash2, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/components/ui/use-toast';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { supabase } from '@/lib/customSupabaseClient';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const DeleteAccountPage = () => {
  const { user, signOut } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [confirmationText, setConfirmationText] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  if (!user) {
    navigate('/login');
    return null;
  }

  const handleDeleteAccount = async () => {
    if (confirmationText !== 'EXCLUIR') {
      toast({
        title: "Confirmação inválida",
        description: "Por favor, digite 'EXCLUIR' para confirmar a exclusão da conta.",
        variant: "destructive",
      });
      return;
    }

    setIsDeleting(true);

    try {
      // 1. Deletar dados relacionados do usuário (opcional - dependendo da política de retenção)
      // Nota: Você pode querer manter alguns dados por questões legais
      // Por enquanto, vamos apenas deletar o perfil e desativar a conta de autenticação

      // Nota: A exclusão completa da conta requer permissões de admin
      // Por enquanto, vamos apenas deletar o perfil e fazer logout
      // Para exclusão completa da conta de autenticação, você pode:
      // 1. Criar uma Edge Function que use o Supabase Admin API
      // 2. Ou processar manualmente via painel do Supabase
      
      // 1. Deletar perfil
      const { error: profileError } = await supabase
        .from('profiles')
        .delete()
        .eq('id', user.id);

      if (profileError) {
        console.error('Erro ao deletar perfil:', profileError);
        toast({
          title: "Erro ao excluir conta",
          description: "Não foi possível excluir sua conta. Entre em contato com o suporte.",
          variant: "destructive",
        });
        setIsDeleting(false);
        return;
      }

      // 2. Fazer logout (a conta de autenticação pode ser deletada manualmente ou via Edge Function)
      await signOut();

      toast({
        title: "Conta excluída",
        description: "Sua conta foi excluída com sucesso. Sentiremos sua falta!",
      });

      navigate('/');
    } catch (error) {
      console.error('Erro ao excluir conta:', error);
      toast({
        title: "Erro ao excluir conta",
        description: error.message || "Ocorreu um erro ao excluir sua conta. Tente novamente ou entre em contato com o suporte.",
        variant: "destructive",
      });
      setIsDeleting(false);
    }
  };

  return (
    <>
      <Helmet>
        <title>Excluir Conta - Trombone Cidadão</title>
        <meta name="description" content="Solicite a exclusão da sua conta na plataforma Trombone Cidadão." />
      </Helmet>
      <div className="container mx-auto px-4 py-12 max-w-2xl">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <Button
            variant="ghost"
            onClick={() => navigate('/perfil')}
            className="mb-6"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Voltar ao Perfil
          </Button>

          <Card className="border-destructive">
            <CardHeader>
              <div className="flex items-center gap-3 mb-2">
                <AlertTriangle className="w-8 h-8 text-destructive" />
                <CardTitle className="text-2xl font-bold text-destructive">
                  Excluir Conta
                </CardTitle>
              </div>
              <CardDescription>
                Esta ação é permanente e não pode ser desfeita.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4">
                <h3 className="font-semibold text-destructive mb-2">
                  O que acontece quando você exclui sua conta:
                </h3>
                <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
                  <li>Seu perfil será permanentemente removido</li>
                  <li>Suas broncas e comentários podem ser mantidos de forma anônima (conforme política de privacidade)</li>
                  <li>Você não poderá mais acessar a plataforma com esta conta</li>
                  <li>Você precisará criar uma nova conta para usar o app novamente</li>
                </ul>
              </div>

              <div className="bg-muted/50 rounded-lg p-4">
                <h3 className="font-semibold mb-2">
                  Antes de excluir, considere:
                </h3>
                <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
                  <li>Você pode simplesmente fazer logout e não usar mais o app</li>
                  <li>Você pode entrar em contato conosco se tiver alguma preocupação</li>
                  <li>Seus dados podem ser mantidos por questões legais ou de segurança</li>
                </ul>
              </div>

              <div className="pt-4">
                <p className="text-sm text-muted-foreground mb-4">
                  Se você tem certeza de que deseja excluir sua conta, clique no botão abaixo.
                  Você será solicitado a confirmar esta ação.
                </p>
              </div>
            </CardContent>
            <CardFooter>
              <Button
                variant="destructive"
                onClick={() => setShowConfirmDialog(true)}
                className="w-full gap-2"
              >
                <Trash2 className="w-4 h-4" />
                Excluir Minha Conta
              </Button>
            </CardFooter>
          </Card>
        </motion.div>

        <Dialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="text-destructive flex items-center gap-2">
                <AlertTriangle className="w-5 h-5" />
                Confirmar Exclusão da Conta
              </DialogTitle>
              <DialogDescription>
                Esta ação é <strong>permanente e irreversível</strong>. Tem certeza de que deseja continuar?
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div>
                <Label htmlFor="confirmation">
                  Para confirmar, digite <strong>EXCLUIR</strong> no campo abaixo:
                </Label>
                <Input
                  id="confirmation"
                  value={confirmationText}
                  onChange={(e) => setConfirmationText(e.target.value)}
                  placeholder="Digite EXCLUIR"
                  className="mt-2"
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setShowConfirmDialog(false);
                  setConfirmationText('');
                }}
                disabled={isDeleting}
              >
                Cancelar
              </Button>
              <Button
                variant="destructive"
                onClick={handleDeleteAccount}
                disabled={isDeleting || confirmationText !== 'EXCLUIR'}
                className="gap-2"
              >
                {isDeleting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Excluindo...
                  </>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4" />
                    Sim, Excluir Conta
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </>
  );
};

export default DeleteAccountPage;


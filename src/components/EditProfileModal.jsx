import React, { useState, useMemo, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';
import Avatar, { genConfig } from 'react-nice-avatar';
import { RefreshCw, Link as LinkIcon } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const EditProfileModal = ({ user, onClose, onSave, isAdminEditing = false }) => {
  const { toast } = useToast();
  const [name, setName] = useState('');
  const [userType, setUserType] = useState('citizen');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [avatarType, setAvatarType] = useState('generated');

  const initialAvatarConfig = useMemo(() => {
    if (user && user.avatar_config) {
      if (typeof user.avatar_config === 'string') {
        try {
          return JSON.parse(user.avatar_config);
        } catch (e) {
          return genConfig();
        }
      }
      return user.avatar_config;
    }
    return genConfig();
  }, [user]);

  const [avatarConfig, setAvatarConfig] = useState(initialAvatarConfig);

  useEffect(() => {
    if (user) {
      setName(user.name);
      setUserType(user.user_type || 'citizen');
      setAvatarType(user.avatar_type || 'generated');
      setAvatarUrl(user.avatar_url || '');
      setAvatarConfig(initialAvatarConfig);
    }
  }, [user, initialAvatarConfig]);

  const handleRandomizeAvatar = () => {
    setAvatarConfig(genConfig());
  };

  const handleSave = () => {
    if (!name.trim()) {
      toast({
        title: "Nome inválido",
        description: "O nome não pode ficar em branco.",
        variant: "destructive",
      });
      return;
    }
    
    const dataToSave = {
      name,
      avatar_type: avatarType,
      avatar_url: avatarType === 'url' ? avatarUrl : null,
      avatar_config: avatarType === 'generated' ? avatarConfig : null,
    };

    if (isAdminEditing) {
      dataToSave.id = user.id;
      dataToSave.userType = userType;
    }
      
    onSave(dataToSave);
    onClose();
  };

  if (!user) return null;

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md bg-card border-border max-h-[95vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-foreground">Editar Perfil</DialogTitle>
          <DialogDescription>
            Atualize suas informações e personalize seu avatar.
          </DialogDescription>
        </DialogHeader>
        
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="name" className="text-right text-muted-foreground">
              Nome
            </Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="col-span-3 bg-background border-input"
            />
          </div>
          {isAdminEditing && (
            <div className="grid grid-cols-4 items-center gap-4">
              <Label className="text-right text-muted-foreground">
                Tipo
              </Label>
              <div className="col-span-3">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" className="w-full justify-start">
                      {userType === 'citizen' ? 'Cidadão' : 'Órgão Público'}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent className="w-56 bg-card text-foreground border border-border">
                    <DropdownMenuLabel>Tipo de Usuário</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuRadioGroup value={userType} onValueChange={setUserType}>
                      <DropdownMenuRadioItem value="citizen">Cidadão</DropdownMenuRadioItem>
                      <DropdownMenuRadioItem value="public_official">Órgão Público</DropdownMenuRadioItem>
                    </DropdownMenuRadioGroup>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          )}
        </div>

        <Tabs value={avatarType} onValueChange={setAvatarType} className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="generated">Avatar Gerado</TabsTrigger>
            <TabsTrigger value="url">URL Externa</TabsTrigger>
          </TabsList>
          <TabsContent value="generated">
            <div className="flex flex-col items-center gap-4 py-4">
              <div className="w-32 h-32 rounded-full overflow-hidden border-4 border-primary">
                  <Avatar className="w-full h-full" {...avatarConfig} />
              </div>
              <Button variant="outline" onClick={handleRandomizeAvatar} className="gap-2">
                <RefreshCw className="w-4 h-4" />
                Gerar Aleatório
              </Button>
            </div>
          </TabsContent>
          <TabsContent value="url">
            <div className="flex flex-col items-center gap-4 py-4">
              <div className="w-32 h-32 rounded-full overflow-hidden border-4 border-primary bg-muted flex items-center justify-center">
                {avatarUrl ? (
                  <img src={avatarUrl} alt="Avatar preview" className="w-full h-full object-cover" />
                ) : (
                  <LinkIcon className="w-12 h-12 text-muted-foreground" />
                )}
              </div>
              <div className="w-full space-y-2">
                <Label htmlFor="avatarUrl">URL da Imagem</Label>
                <Input 
                  id="avatarUrl" 
                  placeholder="https://exemplo.com/imagem.png"
                  value={avatarUrl}
                  onChange={(e) => setAvatarUrl(e.target.value)}
                />
              </div>
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleSave} className="bg-primary hover:bg-primary/90">Salvar Alterações</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default EditProfileModal;
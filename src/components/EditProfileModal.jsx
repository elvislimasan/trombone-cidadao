import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';
import ImageCropper from '@/components/ui/ImageCropper';
import Avatar, { genConfig } from 'react-nice-avatar';
import { RefreshCw, Link as LinkIcon } from 'lucide-react';
import { supabase } from '@/lib/customSupabaseClient';
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
  const [avatarFile, setAvatarFile] = useState(null);
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState('');
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [avatarCropOpen, setAvatarCropOpen] = useState(false);
  const [avatarCropSrc, setAvatarCropSrc] = useState('');

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
      setAvatarFile(null);
      setAvatarPreviewUrl('');
      setAvatarCropOpen(false);
      setAvatarCropSrc('');
    }
  }, [user, initialAvatarConfig]);

  useEffect(() => {
    if (!avatarFile) return;
    const next = URL.createObjectURL(avatarFile);
    setAvatarPreviewUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [avatarFile]);

  useEffect(() => {
    return () => {
      if (avatarCropSrc) {
        try {
          URL.revokeObjectURL(avatarCropSrc);
        } catch {}
      }
    };
  }, [avatarCropSrc]);

  const handleSelectAvatarFile = useCallback((file) => {
    if (!file) return;
    const isImage = (file.type || '').startsWith('image/');
    if (!isImage) {
      toast({
        title: 'Arquivo inválido',
        description: 'Escolha uma imagem.',
        variant: 'destructive',
      });
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast({
        title: 'Imagem muito grande',
        description: 'Escolha uma imagem de até 5MB.',
        variant: 'destructive',
      });
      return;
    }

    if (avatarCropSrc) {
      try {
        URL.revokeObjectURL(avatarCropSrc);
      } catch {}
    }

    const nextSrc = URL.createObjectURL(file);
    setAvatarCropSrc(nextSrc);
    setAvatarCropOpen(true);
  }, [avatarCropSrc, toast]);

  const handleRandomizeAvatar = () => {
    setAvatarConfig(genConfig());
  };

  const uploadAvatarToStorage = useCallback(async (file) => {
    const mime = file?.type || '';
    const ext =
      mime === 'image/jpeg'
        ? 'jpg'
        : mime === 'image/png'
        ? 'png'
        : mime === 'image/webp'
        ? 'webp'
        : 'jpg';

    const rnd =
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : String(Date.now());

    const filePath = `${user.id}/avatar-${rnd}.${ext}`;
    const { error: uploadError } = await supabase.storage
      .from('profile-avatars')
      .upload(filePath, file, {
        cacheControl: '31536000',
        upsert: true,
        contentType: file.type || undefined,
      });

    if (uploadError) throw uploadError;

    const { data } = supabase.storage.from('profile-avatars').getPublicUrl(filePath);
    return data?.publicUrl || '';
  }, [user?.id]);

  const handleSave = async () => {
    if (!name.trim()) {
      toast({
        title: "Nome inválido",
        description: "O nome não pode ficar em branco.",
        variant: "destructive",
      });
      return;
    }
    
    try {
      setUploadingAvatar(true);
      let nextAvatarUrl = avatarType === 'url' ? avatarUrl : null;
      let nextAvatarType = avatarType;

      if (avatarType === 'upload') {
        if (!avatarFile) {
          toast({
            title: 'Selecione uma imagem',
            description: 'Escolha um arquivo para usar como foto de perfil.',
            variant: 'destructive',
          });
          return;
        }
        if (avatarFile.size > 5 * 1024 * 1024) {
          toast({
            title: 'Imagem muito grande',
            description: 'Escolha uma imagem de até 5MB.',
            variant: 'destructive',
          });
          return;
        }
        nextAvatarUrl = await uploadAvatarToStorage(avatarFile);
        nextAvatarType = 'upload';
      }

      const dataToSave = {
        name,
        avatar_type: nextAvatarType,
        avatar_url: nextAvatarType === 'generated' ? null : (nextAvatarUrl || null),
        avatar_config: nextAvatarType === 'generated' ? avatarConfig : null,
      };

      if (isAdminEditing) {
        dataToSave.id = user.id;
        dataToSave.userType = userType;
      }

      await onSave(dataToSave);
      onClose();
    } catch (e) {
      toast({
        title: 'Erro ao enviar foto',
        description: e?.message || 'Não foi possível enviar sua foto de perfil.',
        variant: 'destructive',
      });
    } finally {
      setUploadingAvatar(false);
    }
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
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="generated">Avatar Gerado</TabsTrigger>
            <TabsTrigger value="upload">Upload</TabsTrigger>
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
          <TabsContent value="upload">
            <div className="flex flex-col items-center gap-4 py-4">
              <div className="w-32 h-32 rounded-full overflow-hidden border-4 border-primary bg-muted flex items-center justify-center">
                {avatarPreviewUrl || avatarUrl ? (
                  <img
                    src={avatarPreviewUrl || avatarUrl}
                    alt="Avatar preview"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="text-sm text-muted-foreground">Sem foto</div>
                )}
              </div>
              <div className="w-full space-y-2">
                <Label htmlFor="avatarFile">Escolher imagem</Label>
                <Input
                  id="avatarFile"
                  type="file"
                  accept="image/*"
                  onChange={(e) => handleSelectAvatarFile(e.target.files?.[0] || null)}
                />
                <p className="text-xs text-muted-foreground">
                  PNG, JPG ou WebP (até 5MB).
                </p>
                {avatarPreviewUrl && (
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    onClick={() => {
                      if (!avatarFile) return;
                      handleSelectAvatarFile(avatarFile);
                    }}
                  >
                    Ajustar imagem
                  </Button>
                )}
              </div>
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

        <ImageCropper
          open={avatarCropOpen}
          imageSrc={avatarCropSrc}
          aspect={1}
          onClose={() => {
            setAvatarCropOpen(false);
            if (avatarCropSrc) {
              try {
                URL.revokeObjectURL(avatarCropSrc);
              } catch {}
            }
            setAvatarCropSrc('');
          }}
          onCropComplete={(croppedBlob) => {
            const nextFile = new File([croppedBlob], `avatar-${Date.now()}.jpg`, {
              type: 'image/jpeg',
            });
            setAvatarFile(nextFile);
            setAvatarCropOpen(false);
            if (avatarCropSrc) {
              try {
                URL.revokeObjectURL(avatarCropSrc);
              } catch {}
            }
            setAvatarCropSrc('');
          }}
        />

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button disabled={uploadingAvatar} onClick={handleSave} className="bg-primary hover:bg-primary/90">
            {uploadingAvatar ? 'Enviando...' : 'Salvar Alterações'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default EditProfileModal;

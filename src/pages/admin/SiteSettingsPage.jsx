
import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Helmet } from 'react-helmet';
import { Link } from 'react-router-dom';
import * as LucideIcons from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useToast } from '@/components/ui/use-toast';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { defaultMenuSettings, defaultFooterSettings, availableIcons, socialPlatforms } from '@/config/menuConfig';
import { supabase } from '@/lib/customSupabaseClient';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Combobox } from "@/components/ui/combobox";

const IconPicker = ({ value, onChange, icons }) => {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full sm:w-[180px] justify-between"
        >
          <div className="flex items-center gap-2">
             {React.createElement(LucideIcons[value] || LucideIcons.HelpCircle, { className: "w-4 h-4" })}
             {value}
          </div>
          <LucideIcons.ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[200px] p-0">
        <Command>
          <CommandInput placeholder="Buscar ícone..." />
          <CommandList>
            <CommandEmpty>Ícone não encontrado.</CommandEmpty>
            <CommandGroup className="max-h-[200px] overflow-auto">
              {icons.map((iconName) => (
                <CommandItem
                  key={iconName}
                  value={iconName}
                  onSelect={() => {
                    onChange(iconName);
                    setOpen(false);
                  }}
                >
                  <LucideIcons.Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      value === iconName ? "opacity-100" : "opacity-0"
                    )}
                  />
                  <div className="flex items-center gap-2">
                     {React.createElement(LucideIcons[iconName] || LucideIcons.HelpCircle, { className: "w-4 h-4" })}
                     {iconName}
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
};

const defaultPromoModalSettings = {
  petitions_modal: {
    enabled: false,
    title: '',
    description: '',
    badge_text: '',
    image_url: '',
    primary_button_text: '',
    primary_button_url: '',
    secondary_button_text: '',
    secondary_button_url: '',
    dismiss_text: 'Fechar',
  },
};

const SiteSettingsPage = () => {
  const { toast } = useToast();
  const [siteName, setSiteName] = useState('');
  const [logoUrl, setLogoUrl] = useState('');
  const [menuSettings, setMenuSettings] = useState(defaultMenuSettings);
  const [footerSettings, setFooterSettings] = useState(defaultFooterSettings);
  const [contactSettings, setContactSettings] = useState({
    whatsapp: '5587999488360',
    email: '',
    phone: '(87) 99948-8360',
  });
  const [promoModalSettings, setPromoModalSettings] = useState(defaultPromoModalSettings);
  const [appUpdateSettings, setAppUpdateSettings] = useState({
    enabled: true,
    latest_android_version_code: null,
    min_android_version_code: null,
    android_application_id: 'com.trombonecidadao.app',
    play_store_url: '',
  });
  const [loading, setLoading] = useState(true);
  const [uploadingImage, setUploadingImage] = useState(false);
  const promoImageInputRef = React.useRef(null);

  const handlePromoImageUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (!allowedTypes.includes(file.type)) {
      toast({ title: "Tipo de arquivo inválido", description: "Use JPG, PNG, WebP ou GIF.", variant: "destructive" });
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast({ title: "Arquivo muito grande", description: "O tamanho máximo é 5MB.", variant: "destructive" });
      return;
    }

    setUploadingImage(true);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `promo-modal-${Date.now()}.${fileExt}`;
      const filePath = `modal/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('promo-images')
        .upload(filePath, file, { upsert: true });

      if (uploadError) {
        throw uploadError;
      }

      const { data: { publicUrl } } = supabase.storage
        .from('promo-images')
        .getPublicUrl(filePath);

      setPromoModalSettings(prev => ({
        ...prev,
        petitions_modal: { ...prev.petitions_modal, image_url: publicUrl }
      }));

      toast({ title: "Imagem enviada!", description: "A imagem foi salva com sucesso." });
    } catch (error) {
      console.error('Erro no upload:', error);
      toast({ title: "Erro no upload", description: error.message, variant: "destructive" });
    } finally {
      setUploadingImage(false);
      if (promoImageInputRef.current) {
        promoImageInputRef.current.value = '';
      }
    }
  };

  const handleRemovePromoImage = async () => {
    const currentUrl = promoModalSettings.petitions_modal.image_url;
    if (currentUrl && currentUrl.includes('promo-images')) {
      try {
        const pathMatch = currentUrl.match(/promo-images\/(.+)$/);
        if (pathMatch) {
          await supabase.storage.from('promo-images').remove([pathMatch[1]]);
        }
      } catch (error) {
        console.warn('Erro ao remover imagem antiga:', error);
      }
    }
    setPromoModalSettings(prev => ({
      ...prev,
      petitions_modal: { ...prev.petitions_modal, image_url: '' }
    }));
  };

  const fetchSettings = useCallback(async () => {
    setLoading(true);
    // Buscar apenas as colunas que existem, excluindo contact_settings inicialmente
    const { data, error } = await supabase
      .from('site_config')
      .select('site_name, logo_url, menu_settings, footer_settings')
      .eq('id', 1)
      .single();

    if (error && error.code !== 'PGRST116') {
      toast({ title: "Erro ao carregar configurações", description: error.message, variant: "destructive" });
    } else if (data) {
      setSiteName(data.site_name || 'Trombone Cidadão');
      setLogoUrl(data.logo_url || '');
      
      if (data.menu_settings) {
        // Fallback temporário: Mesclar configurações salvas com as padrão caso o banco ainda não tenha sido atualizado
        const mergedItems = defaultMenuSettings.items.map(defaultItem => {
          const savedItem = data.menu_settings.items?.find(item => item.path === defaultItem.path);
          // Se o item existir no salvo, usa as preferências salvas (visibilidade, ícone), senão usa o padrão
          return savedItem ? { ...defaultItem, ...savedItem } : defaultItem;
        });
        
        setMenuSettings({
          ...defaultMenuSettings, // Começa com defaults para garantir estrutura
          ...data.menu_settings,  // Sobrescreve com o que foi salvo (cores, etc)
          items: mergedItems      // Usa a lista de itens mesclada
        });
      } else {
        setMenuSettings(defaultMenuSettings);
      }
      
      setFooterSettings(data.footer_settings || defaultFooterSettings);
    }

    // Tentar buscar contact_settings separadamente (pode não existir)
    const { data: contactData, error: contactError } = await supabase
      .from('site_config')
      .select('contact_settings')
      .eq('id', 1)
      .single();

    if (!contactError && contactData?.contact_settings) {
      setContactSettings(contactData.contact_settings);
    } else {
      // Usar valores padrão se a coluna não existir
      setContactSettings({
        whatsapp: '5587999488360',
        email: '',
        phone: '(87) 99948-8360',
      });
    }

    // Tentar buscar promo_modal_settings separadamente (pode não existir)
    const { data: promoData, error: promoError } = await supabase
      .from('site_config')
      .select('promo_modal_settings')
      .eq('id', 1)
      .single();

    if (!promoError && promoData?.promo_modal_settings) {
      setPromoModalSettings(prev => ({
        ...prev,
        ...promoData.promo_modal_settings,
        petitions_modal: {
          ...defaultPromoModalSettings.petitions_modal,
          ...promoData.promo_modal_settings?.petitions_modal,
        },
      }));
    }

    const { data: appData, error: appError } = await supabase
      .from('site_config')
      .select('app_update_settings')
      .eq('id', 1)
      .single();

    if (!appError && appData?.app_update_settings) {
      setAppUpdateSettings((prev) => ({
        ...prev,
        ...appData.app_update_settings,
      }));
    }

    setLoading(false);
  }, [toast]);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const handleSaveSettings = async () => {
    // Preparar dados para salvar, excluindo contact_settings se a coluna não existir
    const dataToSave = { 
      id: 1, 
      site_name: siteName,
      logo_url: logoUrl, 
      menu_settings: menuSettings,
      footer_settings: footerSettings,
      updated_at: new Date().toISOString()
    };

    // Verificar se menuSettings tem os dados corretos
    const noticiasItem = menuSettings.items.find(item => item.path === '/noticias');
    if (noticiasItem) {
      console.log('Notícias isVisible antes de salvar:', noticiasItem.isVisible);
    }

    // Salvar configurações principais (sem contact_settings)
    const { data: savedData, error } = await supabase
      .from('site_config')
      .upsert(dataToSave, { onConflict: 'id' })
      .select()
      .single();

    if (error) {
      toast({ title: "Erro ao salvar configurações", description: error.message, variant: "destructive" });
      return;
    }

    // Verificar se foi salvo corretamente
    if (savedData?.menu_settings) {
      const savedNoticiasItem = savedData.menu_settings.items?.find(item => item.path === '/noticias');
      if (savedNoticiasItem) {
        console.log('Notícias isVisible após salvar:', savedNoticiasItem.isVisible);
      }
    }

    // Tentar salvar contact_settings separadamente (pode falhar se a coluna não existir)
    const { error: contactError } = await supabase
      .from('site_config')
      .update({ contact_settings: contactSettings })
      .eq('id', 1);

    // Ignorar erro se a coluna não existir (PGRST204 ou 42703)
    if (contactError && contactError.code !== 'PGRST204' && contactError.code !== '42703') {
      console.warn('Aviso: Não foi possível salvar contact_settings:', contactError.message);
    }

    // Tentar salvar promo_modal_settings separadamente (pode falhar se a coluna não existir)
    const { error: promoError } = await supabase
      .from('site_config')
      .update({ promo_modal_settings: promoModalSettings })
      .eq('id', 1);

    if (promoError && promoError.code !== 'PGRST204' && promoError.code !== '42703') {
      console.warn('Aviso: Não foi possível salvar promo_modal_settings:', promoError.message);
    }

    const { error: appError } = await supabase
      .from('site_config')
      .update({ app_update_settings: appUpdateSettings })
      .eq('id', 1);

    if (appError && appError.code !== 'PGRST204' && appError.code !== '42703') {
      console.warn('Aviso: Não foi possível salvar app_update_settings:', appError.message);
    }

    toast({
      title: "Configurações Salvas! ✨",
      description: "As personalizações do site foram aplicadas globalmente.",
    });
    
    // Disparar evento para atualizar componentes que usam essas configurações
    window.dispatchEvent(new CustomEvent('site-settings-updated'));
    
    // Recarregar as configurações para garantir sincronização
    await fetchSettings();
  };

  const handleColorChange = (section, colorType, value) => {
    if (section === 'menu') {
      setMenuSettings(prev => ({ ...prev, colors: { ...prev.colors, [colorType]: value } }));
    } else if (section === 'footer') {
      setFooterSettings(prev => ({ ...prev, colors: { ...prev.colors, [colorType]: value } }));
    }
  };

  const handleFooterChange = (key, value) => {
    setFooterSettings(prev => ({ ...prev, [key]: value }));
  };

  const handleFooterContactChange = (key, value) => {
    setFooterSettings(prev => ({ ...prev, contact: { ...prev.contact, [key]: value } }));
  };

  const handleFooterSocialChange = (index, key, value) => {
    const newSocials = [...footerSettings.socialMedia];
    newSocials[index] = { ...newSocials[index], [key]: value };
    setFooterSettings(prev => ({ ...prev, socialMedia: newSocials }));
  };

  const handleFooterLinkColumnChange = (colIndex, key, value) => {
    const newColumns = [...footerSettings.linkColumns];
    newColumns[colIndex] = { ...newColumns[colIndex], [key]: value };
    setFooterSettings(prev => ({ ...prev, linkColumns: newColumns }));
  };

  const handleFooterLinkChange = (colIndex, linkIndex, key, value) => {
    const newColumns = [...footerSettings.linkColumns];
    newColumns[colIndex].links[linkIndex] = { ...newColumns[colIndex].links[linkIndex], [key]: value };
    setFooterSettings(prev => ({ ...prev, linkColumns: newColumns }));
  };

  if (loading) {
    return <div className="container max-w-[88rem] mx-auto w-full px-4 py-12 text-center">Carregando configurações...</div>;
  }

  return (
    <>
      <Helmet>
        <title>Configurações do Site - Admin</title>
        <meta name="description" content="Personalize a aparência do seu site." />
      </Helmet>
      <div className="container max-w-[88rem] mx-auto w-full px-4 py-12">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-wrap items-center justify-between gap-4 mb-12"
        >
          <div className="flex items-center gap-4">
            <Link to="/admin">
              <Button variant="outline" size="icon">
                <LucideIcons.ArrowLeft className="w-4 h-4" />
              </Button>
            </Link>
            <div>
              <h1 className="text-3xl md:text-4xl font-bold text-tc-red">
                Configurações do Site
              </h1>
              <p className="mt-2 text-lg text-muted-foreground">
                Personalize a aparência e informações gerais da plataforma.
              </p>
            </div>
          </div>
          <Button onClick={handleSaveSettings} className="gap-2">
            <LucideIcons.Save className="w-4 h-4" /> Salvar Alterações
          </Button>
        </motion.div>

        <Tabs defaultValue="geral" className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="geral">Geral</TabsTrigger>
            <TabsTrigger value="menu">Menu</TabsTrigger>
            <TabsTrigger value="footer">Rodapé</TabsTrigger>
            <TabsTrigger value="modais">Modais</TabsTrigger>
          </TabsList>
          
          <TabsContent value="geral" className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><LucideIcons.Image /> Identidade Visual</CardTitle>
                <CardDescription>Insira o nome e a URL da logo para o cabeçalho.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="siteName">Nome do Site</Label>
                  <Input id="siteName" placeholder="Nome do seu site" value={siteName} onChange={(e) => setSiteName(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="logoUrl">URL da Logo</Label>
                  <Input id="logoUrl" placeholder="https://exemplo.com/logo.png" value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)} />
                </div>
                {(logoUrl || siteName) && (
                  <div className="mt-4">
                    <p className="text-sm font-medium mb-2">Pré-visualização:</p>
                    <div className="p-4 bg-muted rounded-lg flex items-center justify-center gap-3">
                      {logoUrl && <img src={logoUrl} alt="Pré-visualização da logo" className="h-10 w-auto" />}
                      {siteName && <span className="font-bold text-lg">{siteName}</span>}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="mt-6">
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><LucideIcons.Smartphone /> Atualização do App</CardTitle>
                <CardDescription>Exibe um aviso no app nativo quando houver uma versão mais recente na Play Store.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center space-x-2">
                  <Switch
                    id="app-update-enabled"
                    checked={appUpdateSettings.enabled !== false}
                    onCheckedChange={(v) => setAppUpdateSettings((prev) => ({ ...prev, enabled: Boolean(v) }))}
                  />
                  <Label htmlFor="app-update-enabled">Ativar aviso de atualização</Label>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="latest-android-version-code">Última versão (Android versionCode)</Label>
                    <Input
                      id="latest-android-version-code"
                      inputMode="numeric"
                      value={appUpdateSettings.latest_android_version_code ?? ''}
                      onChange={(e) => {
                        const raw = e.target.value.trim();
                        const n = raw === '' ? null : Number(raw);
                        setAppUpdateSettings((prev) => ({
                          ...prev,
                          latest_android_version_code: Number.isFinite(n) ? n : prev.latest_android_version_code,
                        }));
                        if (raw === '') {
                          setAppUpdateSettings((prev) => ({ ...prev, latest_android_version_code: null }));
                        }
                      }}
                      placeholder="Ex: 11"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="min-android-version-code">Versão mínima (forçar update)</Label>
                    <Input
                      id="min-android-version-code"
                      inputMode="numeric"
                      value={appUpdateSettings.min_android_version_code ?? ''}
                      onChange={(e) => {
                        const raw = e.target.value.trim();
                        const n = raw === '' ? null : Number(raw);
                        setAppUpdateSettings((prev) => ({
                          ...prev,
                          min_android_version_code: Number.isFinite(n) ? n : prev.min_android_version_code,
                        }));
                        if (raw === '') {
                          setAppUpdateSettings((prev) => ({ ...prev, min_android_version_code: null }));
                        }
                      }}
                      placeholder="Ex: 10"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="android-application-id">Android applicationId</Label>
                    <Input
                      id="android-application-id"
                      value={appUpdateSettings.android_application_id || ''}
                      onChange={(e) => setAppUpdateSettings((prev) => ({ ...prev, android_application_id: e.target.value }))}
                      placeholder="com.trombonecidadao.app"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="play-store-url">URL da Play Store (opcional)</Label>
                    <Input
                      id="play-store-url"
                      value={appUpdateSettings.play_store_url || ''}
                      onChange={(e) => setAppUpdateSettings((prev) => ({ ...prev, play_store_url: e.target.value }))}
                      placeholder="https://play.google.com/store/apps/details?id=..."
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="menu" className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><LucideIcons.Menu /> Personalização do Menu</CardTitle>
                <CardDescription>Controle as cores e itens do menu principal.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div>
                  <h4 className="font-semibold mb-4">Cores do Cabeçalho</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="menuBgColor">Cor de Fundo</Label>
                      <div className="flex items-center gap-2"><Input id="menuBgColor" type="color" value={menuSettings.colors.background} onChange={(e) => handleColorChange('menu', 'background', e.target.value)} className="p-1 h-10 w-14" /><Input value={menuSettings.colors.background} onChange={(e) => handleColorChange('menu', 'background', e.target.value)} /></div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="menuTextColor">Cor do Texto</Label>
                      <div className="flex items-center gap-2"><Input id="menuTextColor" type="color" value={menuSettings.colors.text} onChange={(e) => handleColorChange('menu', 'text', e.target.value)} className="p-1 h-10 w-14" /><Input value={menuSettings.colors.text} onChange={(e) => handleColorChange('menu', 'text', e.target.value)} /></div>
                    </div>
                  </div>
                </div>
                <div>
                  <h4 className="font-semibold mb-4">Itens do Menu</h4>
                  <div className="space-y-4">
                    {menuSettings.items.map(item => {
                      const Icon = LucideIcons[item.icon] || LucideIcons.HelpCircle;
                      return (
                        <div key={item.path} className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-3 border rounded-lg gap-4">
                          <div className="flex items-center gap-3 flex-grow"><Switch id={`switch-${item.path}`} checked={item.isVisible} onCheckedChange={() => setMenuSettings(prev => ({ ...prev, items: prev.items.map(i => i.path === item.path ? { ...i, isVisible: !i.isVisible } : i) }))} /><Label htmlFor={`switch-${item.path}`} className="text-base">{item.name}</Label></div>
                          <div className="flex items-center gap-2 w-full sm:w-auto">
                            <IconPicker 
                              value={item.icon} 
                              onChange={(newIcon) => setMenuSettings(prev => ({ ...prev, items: prev.items.map(i => i.path === item.path ? { ...i, icon: newIcon } : i) }))}
                              icons={availableIcons}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="footer" className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle>Personalização do Rodapé</CardTitle>
              </CardHeader>
              <CardContent className="space-y-8">
                <div className="space-y-2"><Label>Descrição Curta</Label><Textarea value={footerSettings.description} onChange={(e) => handleFooterChange('description', e.target.value)} /></div>
                <div className="space-y-2"><Label>Texto de Copyright</Label><Input value={footerSettings.copyrightText} onChange={(e) => handleFooterChange('copyrightText', e.target.value)} /></div>
                
                <Card><CardHeader><CardTitle>Contato (Rodapé)</CardTitle></CardHeader><CardContent className="space-y-4">
                  <div className="flex items-center space-x-2"><Switch id="contact-visible" checked={footerSettings.contact.isVisible} onCheckedChange={(c) => handleFooterContactChange('isVisible', c)} /><Label htmlFor="contact-visible">Exibir Seção de Contato</Label></div>
                  <div className="space-y-2"><Label>Título</Label><Input value={footerSettings.contact.title} onChange={(e) => handleFooterContactChange('title', e.target.value)} /></div>
                  <div className="space-y-2"><Label>Email</Label><Input type="email" value={footerSettings.contact.email} onChange={(e) => handleFooterContactChange('email', e.target.value)} /></div>
                  <div className="space-y-2"><Label>Telefone</Label><Input value={footerSettings.contact.phone} onChange={(e) => handleFooterContactChange('phone', e.target.value)} /></div>
                  <div className="space-y-2"><Label>Endereço</Label><Input value={footerSettings.contact.address} onChange={(e) => handleFooterContactChange('address', e.target.value)} /></div>
                </CardContent></Card>
                
                <Card><CardHeader><CardTitle>Página de Contato</CardTitle></CardHeader><CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label>WhatsApp (apenas números, ex: 5587999488360)</Label>
                    <Input 
                      value={contactSettings.whatsapp} 
                      onChange={(e) => setContactSettings(prev => ({ ...prev, whatsapp: e.target.value }))} 
                      placeholder="5587999488360"
                    />
                    <p className="text-xs text-muted-foreground">Número do WhatsApp para contato direto (formato internacional sem +)</p>
                  </div>
                  <div className="space-y-2">
                    <Label>E-mail de Contato</Label>
                    <Input 
                      type="email" 
                      value={contactSettings.email} 
                      onChange={(e) => setContactSettings(prev => ({ ...prev, email: e.target.value }))} 
                      placeholder="trombonecidadao@gmail.com"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Telefone (formato exibido)</Label>
                    <Input 
                      value={contactSettings.phone} 
                      onChange={(e) => setContactSettings(prev => ({ ...prev, phone: e.target.value }))} 
                      placeholder="(87) 99948-8360"
                    />
                    <p className="text-xs text-muted-foreground">Formato de exibição do telefone na página</p>
                  </div>
                </CardContent></Card>

                <Card><CardHeader><CardTitle>Redes Sociais</CardTitle></CardHeader><CardContent className="space-y-4">
                  {footerSettings.socialMedia.map((social, index) => (
                    <div key={index} className="p-3 border rounded-lg space-y-3">
                      <div className="flex items-center justify-between"><div className="flex items-center gap-2"><Switch id={`social-visible-${index}`} checked={social.isVisible} onCheckedChange={(c) => handleFooterSocialChange(index, 'isVisible', c)} /><Label htmlFor={`social-visible-${index}`}>Exibir {social.platform}</Label></div></div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>Plataforma</Label>
                          <Combobox
                            value={social.platform}
                            onChange={(p) => handleFooterSocialChange(index, 'platform', p)}
                            options={socialPlatforms.map(p => ({ label: p, value: p }))}
                          />
                        </div>
                        <div className="space-y-2"><Label>URL</Label><Input value={social.url} onChange={(e) => handleFooterSocialChange(index, 'url', e.target.value)} /></div>
                      </div>
                    </div>
                  ))}
                </CardContent></Card>

                {footerSettings.linkColumns.map((column, colIndex) => (
                  <Card key={colIndex}><CardHeader><CardTitle>Coluna de Links: {column.title}</CardTitle></CardHeader><CardContent className="space-y-4">
                    <div className="flex items-center space-x-2"><Switch id={`col-visible-${colIndex}`} checked={column.isVisible} onCheckedChange={(c) => handleFooterLinkColumnChange(colIndex, 'isVisible', c)} /><Label htmlFor={`col-visible-${colIndex}`}>Exibir Coluna</Label></div>
                    <div className="space-y-2"><Label>Título da Coluna</Label><Input value={column.title} onChange={(e) => handleFooterLinkColumnChange(colIndex, 'title', e.target.value)} /></div>
                    {column.links.map((link, linkIndex) => (
                      <div key={linkIndex} className="p-3 border rounded-lg space-y-3">
                        <div className="flex items-center justify-between"><div className="flex items-center gap-2"><Switch id={`link-visible-${colIndex}-${linkIndex}`} checked={link.isVisible} onCheckedChange={(c) => handleFooterLinkChange(colIndex, linkIndex, 'isVisible', c)} /><Label htmlFor={`link-visible-${colIndex}-${linkIndex}`}>Exibir Link</Label></div></div>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2"><Label>Nome</Label><Input value={link.name} onChange={(e) => handleFooterLinkChange(colIndex, linkIndex, 'name', e.target.value)} /></div>
                          <div className="space-y-2"><Label>Caminho (ex: /sobre)</Label><Input value={link.path} onChange={(e) => handleFooterLinkChange(colIndex, linkIndex, 'path', e.target.value)} /></div>
                        </div>
                      </div>
                    ))}
                  </CardContent></Card>
                ))}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="modais" className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><LucideIcons.MessageSquare /> Modais Promocionais</CardTitle>
                <CardDescription>Configure os modais que aparecem para os usuários na página inicial.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-lg">Modal Promocional</CardTitle>
                      <div className="flex items-center gap-2">
                        <Switch
                          id="petitions-modal-enabled"
                          checked={promoModalSettings.petitions_modal.enabled}
                          onCheckedChange={(checked) => setPromoModalSettings(prev => ({
                            ...prev,
                            petitions_modal: { ...prev.petitions_modal, enabled: checked }
                          }))}
                        />
                        <Label htmlFor="petitions-modal-enabled" className="font-medium">
                          {promoModalSettings.petitions_modal.enabled ? 'Ativo' : 'Desativado'}
                        </Label>
                      </div>
                    </div>
                    <CardDescription>Este modal aparece uma vez para novos visitantes na página inicial.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="modal-badge">Texto do Badge</Label>
                      <Input
                        id="modal-badge"
                        value={promoModalSettings.petitions_modal.badge_text}
                        onChange={(e) => setPromoModalSettings(prev => ({
                          ...prev,
                          petitions_modal: { ...prev.petitions_modal, badge_text: e.target.value }
                        }))}
                        placeholder="Novidade na plataforma"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="modal-title">Título</Label>
                      <Input
                        id="modal-title"
                        value={promoModalSettings.petitions_modal.title}
                        onChange={(e) => setPromoModalSettings(prev => ({
                          ...prev,
                          petitions_modal: { ...prev.petitions_modal, title: e.target.value }
                        }))}
                        placeholder="Título da promoção"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="modal-description">Descrição</Label>
                      <Textarea
                        id="modal-description"
                        value={promoModalSettings.petitions_modal.description}
                        onChange={(e) => setPromoModalSettings(prev => ({
                          ...prev,
                          petitions_modal: { ...prev.petitions_modal, description: e.target.value }
                        }))}
                        placeholder="Descrição da promoção"
                        rows={3}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Imagem do Modal</Label>
                      <div className="flex flex-col gap-3">
                        <input
                          ref={promoImageInputRef}
                          type="file"
                          accept="image/jpeg,image/png,image/webp,image/gif"
                          onChange={handlePromoImageUpload}
                          className="hidden"
                          id="promo-image-upload"
                        />
                        <div className="flex items-center gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => promoImageInputRef.current?.click()}
                            disabled={uploadingImage}
                            className="gap-2"
                          >
                            {uploadingImage ? (
                              <><LucideIcons.Loader2 className="w-4 h-4 animate-spin" /> Enviando...</>
                            ) : (
                              <><LucideIcons.Upload className="w-4 h-4" /> Enviar Imagem</>
                            )}
                          </Button>
                          {promoModalSettings.petitions_modal.image_url && (
                            <Button
                              type="button"
                              variant="destructive"
                              size="icon"
                              onClick={handleRemovePromoImage}
                              title="Remover imagem"
                            >
                              <LucideIcons.Trash2 className="w-4 h-4" />
                            </Button>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">Formatos aceitos: JPG, PNG, WebP, GIF. Tamanho máximo: 5MB</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="modal-primary-btn">Texto do Botão Principal</Label>
                        <Input
                          id="modal-primary-btn"
                          value={promoModalSettings.petitions_modal.primary_button_text}
                          onChange={(e) => setPromoModalSettings(prev => ({
                            ...prev,
                            petitions_modal: { ...prev.petitions_modal, primary_button_text: e.target.value }
                          }))}
                          placeholder="Texto do botão principal"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="modal-primary-url">URL do Botão Principal</Label>
                        <Input
                          id="modal-primary-url"
                          value={promoModalSettings.petitions_modal.primary_button_url}
                          onChange={(e) => setPromoModalSettings(prev => ({
                            ...prev,
                            petitions_modal: { ...prev.petitions_modal, primary_button_url: e.target.value }
                          }))}
                          placeholder="/pagina-destino"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="modal-secondary-btn">Texto do Botão Secundário</Label>
                        <Input
                          id="modal-secondary-btn"
                          value={promoModalSettings.petitions_modal.secondary_button_text}
                          onChange={(e) => setPromoModalSettings(prev => ({
                            ...prev,
                            petitions_modal: { ...prev.petitions_modal, secondary_button_text: e.target.value }
                          }))}
                          placeholder="Texto do botão secundário"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="modal-secondary-url">URL do Botão Secundário</Label>
                        <Input
                          id="modal-secondary-url"
                          value={promoModalSettings.petitions_modal.secondary_button_url}
                          onChange={(e) => setPromoModalSettings(prev => ({
                            ...prev,
                            petitions_modal: { ...prev.petitions_modal, secondary_button_url: e.target.value }
                          }))}
                          placeholder="/outra-pagina"
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="modal-dismiss">Texto de Dispensar</Label>
                      <Input
                        id="modal-dismiss"
                        value={promoModalSettings.petitions_modal.dismiss_text}
                        onChange={(e) => setPromoModalSettings(prev => ({
                          ...prev,
                          petitions_modal: { ...prev.petitions_modal, dismiss_text: e.target.value }
                        }))}
                        placeholder="Talvez depois"
                      />
                    </div>
                    <div className="mt-6 pt-6 border-t">
                      <p className="text-sm font-medium mb-4">Pré-visualização do Modal:</p>
                      <div className="bg-black/5 p-4 rounded-xl">
                        <div className="max-w-[520px] mx-auto bg-white rounded-xl overflow-hidden shadow-lg border relative">
                          <div className="flex flex-col md:flex-row">
                            {promoModalSettings.petitions_modal.image_url && (
                              <div className="w-full md:w-1/2 bg-[#FEF2F2] overflow-hidden h-36 md:h-auto">
                                <img
                                  src={promoModalSettings.petitions_modal.image_url}
                                  alt="Pré-visualização"
                                  className="w-full h-full object-cover"
                                  onError={(e) => { e.target.style.display = 'none'; }}
                                />
                              </div>
                            )}
                            <div className={`w-full ${promoModalSettings.petitions_modal.image_url ? 'md:w-1/2' : ''} p-5 flex flex-col gap-3`}>
                              <div className="absolute top-2 right-2 h-6 w-6 rounded-full bg-white shadow flex items-center justify-center">
                                <LucideIcons.X className="h-3 w-3 text-gray-500" />
                              </div>
                              {promoModalSettings.petitions_modal.badge_text && (
                                <div className="flex items-center gap-2 text-xs font-semibold text-[#F97316] uppercase tracking-[0.18em]">
                                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-[#F97316]" />
                                  {promoModalSettings.petitions_modal.badge_text}
                                </div>
                              )}
                              <div className="space-y-2">
                                {promoModalSettings.petitions_modal.title ? (
                                  <h2 className="text-lg font-bold text-[#111827]">
                                    {promoModalSettings.petitions_modal.title}
                                  </h2>
                                ) : (
                                  <h2 className="text-lg font-bold text-gray-300 italic">Título do modal</h2>
                                )}
                                {promoModalSettings.petitions_modal.description ? (
                                  <p className="text-sm text-[#4B5563] leading-relaxed">
                                    {promoModalSettings.petitions_modal.description}
                                  </p>
                                ) : (
                                  <p className="text-sm text-gray-300 italic">Descrição do modal</p>
                                )}
                              </div>
                              <div className="flex flex-col gap-2 mt-2">
                                {promoModalSettings.petitions_modal.primary_button_text ? (
                                  <div className="w-full h-9 text-sm font-semibold rounded-full bg-tc-red text-white flex items-center justify-center">
                                    {promoModalSettings.petitions_modal.primary_button_text}
                                  </div>
                                ) : (
                                  <div className="w-full h-9 text-sm font-semibold rounded-full bg-gray-200 text-gray-400 flex items-center justify-center italic">
                                    Botão principal
                                  </div>
                                )}
                                {promoModalSettings.petitions_modal.secondary_button_text ? (
                                  <div className="w-full h-9 text-sm font-semibold rounded-full border border-[#F97316] text-[#F97316] flex items-center justify-center">
                                    {promoModalSettings.petitions_modal.secondary_button_text}
                                  </div>
                                ) : (
                                  <div className="w-full h-9 text-sm font-semibold rounded-full border border-gray-200 text-gray-400 flex items-center justify-center italic">
                                    Botão secundário
                                  </div>
                                )}
                                <div className="mt-1 text-xs text-[#6B7280] self-center">
                                  {promoModalSettings.petitions_modal.dismiss_text || "Fechar"}
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </>
  );
};

export default SiteSettingsPage;

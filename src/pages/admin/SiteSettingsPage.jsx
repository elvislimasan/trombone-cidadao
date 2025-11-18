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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { defaultMenuSettings, defaultFooterSettings, availableIcons, socialPlatforms } from '@/config/menuConfig';
import { supabase } from '@/lib/customSupabaseClient';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const SiteSettingsPage = () => {
  const { toast } = useToast();
  const [siteName, setSiteName] = useState('Trombone Cidadão');
  const [logoUrl, setLogoUrl] = useState('');
  const [menuSettings, setMenuSettings] = useState(defaultMenuSettings);
  const [footerSettings, setFooterSettings] = useState(defaultFooterSettings);
  const [contactSettings, setContactSettings] = useState({
    whatsapp: '5587999488360',
    email: 'contato@trombonecidadao.com.br',
    phone: '(87) 99948-8360',
  });
  const [loading, setLoading] = useState(true);

  const fetchSettings = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('site_config')
      .select('*')
      .eq('id', 1)
      .single();

    if (error && error.code !== 'PGRST116') {
      toast({ title: "Erro ao carregar configurações", description: error.message, variant: "destructive" });
    } else if (data) {
      setSiteName(data.site_name || 'Trombone Cidadão');
      setLogoUrl(data.logo_url || '');
      setMenuSettings(data.menu_settings || defaultMenuSettings);
      setFooterSettings(data.footer_settings || defaultFooterSettings);
      setContactSettings(data.contact_settings || {
        whatsapp: '5587999488360',
        email: 'contato@trombonecidadao.com.br',
        phone: '(87) 99948-8360',
      });
    }
    setLoading(false);
  }, [toast]);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const handleSaveSettings = async () => {
    const { error } = await supabase
      .from('site_config')
      .upsert({ 
        id: 1, 
        site_name: siteName,
        logo_url: logoUrl, 
        menu_settings: menuSettings,
        footer_settings: footerSettings,
        contact_settings: contactSettings,
        updated_at: new Date().toISOString()
      }, { onConflict: 'id' });

    if (error) {
      toast({ title: "Erro ao salvar configurações", description: error.message, variant: "destructive" });
    } else {
      toast({
        title: "Configurações Salvas! ✨",
        description: "As personalizações do site foram aplicadas globalmente.",
      });
      window.dispatchEvent(new CustomEvent('site-settings-updated'));
    }
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
    return <div className="container mx-auto px-4 py-12 text-center">Carregando configurações...</div>;
  }

  return (
    <>
      <Helmet>
        <title>Configurações do Site - Admin</title>
        <meta name="description" content="Personalize a aparência do seu site." />
      </Helmet>
      <div className="container mx-auto px-4 py-12">
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
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="geral">Geral</TabsTrigger>
            <TabsTrigger value="menu">Menu</TabsTrigger>
            <TabsTrigger value="footer">Rodapé</TabsTrigger>
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
                          <div className="flex items-center gap-2 w-full sm:w-auto"><Icon className="w-5 h-5 text-muted-foreground" /><Select value={item.icon} onValueChange={(newIcon) => setMenuSettings(prev => ({ ...prev, items: prev.items.map(i => i.path === item.path ? { ...i, icon: newIcon } : i) }))}><SelectTrigger className="w-full sm:w-[180px]"><SelectValue placeholder="Selecionar ícone" /></SelectTrigger><SelectContent>{availableIcons.map(iconName => (<SelectItem key={iconName} value={iconName}><div className="flex items-center gap-2">{React.createElement(LucideIcons[iconName] || LucideIcons.HelpCircle, { className: "w-4 h-4" })} {iconName}</div></SelectItem>))}</SelectContent></Select></div>
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
              <CardHeader><CardTitle>Personalização do Rodapé</CardTitle></CardHeader>
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
                      placeholder="contato@trombonecidadao.com.br"
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
                        <div className="space-y-2"><Label>Plataforma</Label><Select value={social.platform} onValueChange={(p) => handleFooterSocialChange(index, 'platform', p)}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{socialPlatforms.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent></Select></div>
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
        </Tabs>
      </div>
    </>
  );
};

export default SiteSettingsPage;
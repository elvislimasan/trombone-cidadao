import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Helmet } from 'react-helmet';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft, PlusCircle, Edit, Trash2, Bus, Landmark, Phone, Save, X, Upload, Instagram, Clock, MapPin, Info, Building, ShoppingCart, Check, Hourglass } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from '@/components/ui/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { Combobox } from '@/components/ui/combobox';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';

const EditModal = ({ item, type, onSave, onClose, cityOptions }) => {
  const [formData, setFormData] = useState(null);
  const fileInputRef = useRef(null);
  const { toast } = useToast();

  useEffect(() => {
    if (item) {
      setFormData({ ...item });
    } else {
      setFormData(null);
    }
  }, [item]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setFormData(prev => ({ ...prev, image_url: reader.result, image_file: file }));
        toast({ title: "Imagem carregada!", description: "A nova imagem será salva ao confirmar." });
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave(formData, type);
  };

  if (!formData) return null;

  const renderFields = () => {
    switch (type) {
      case 'transport':
        return (
          <>
            <div className="grid gap-2">
              <Label htmlFor="name">Nome</Label>
              <Input id="name" name="name" value={formData.name} onChange={handleChange} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="destination">Destino</Label>
              <Input id="destination" name="destination" value={formData.destination} onChange={handleChange} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="phone">Telefone</Label>
              <Input id="phone" name="phone" value={formData.phone} onChange={handleChange} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="instagram">Instagram (URL completa)</Label>
              <Input id="instagram" name="instagram" value={formData.instagram} onChange={handleChange} placeholder="https://instagram.com/usuario" />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="schedule">Horários</Label>
              <Textarea id="schedule" name="schedule" value={formData.schedule} onChange={handleChange} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="details">Ponto de Partida / Detalhes</Label>
              <Textarea id="details" name="details" value={formData.details} onChange={handleChange} />
            </div>
            <div className="grid gap-2">
              <Label>Imagem Principal</Label>
              <div className="flex items-center gap-4">
                <img src={formData.image_url} alt={formData.name} className="w-20 h-20 object-cover rounded-md border" />
                <Button type="button" variant="outline" onClick={() => fileInputRef.current.click()}><Upload className="w-4 h-4 mr-2" />Trocar Imagem</Button>
                <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" accept="image/*" />
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="city_id">Cidade</Label>
              <Combobox
                options={cityOptions}
                value={formData.city_id}
                onChange={(value) => setFormData((prev) => ({ ...prev, city_id: value }))}
                placeholder="Selecione a cidade"
                searchPlaceholder="Buscar cidade..."
                notFoundText="Nenhuma cidade encontrada."
              />
            </div>
          </>
        );
      case 'tourist_spots':
        return (
          <>
            <div className="grid gap-2">
              <Label htmlFor="name">Nome</Label>
              <Input id="name" name="name" value={formData.name} onChange={handleChange} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="short_description">Descrição Curta</Label>
              <Textarea id="short_description" name="short_description" value={formData.short_description} onChange={handleChange} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="long_description">Descrição Longa</Label>
              <Textarea id="long_description" name="long_description" value={formData.long_description} onChange={handleChange} rows={5} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="address">Endereço</Label>
              <Input id="address" name="address" value={formData.address} onChange={handleChange} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="phone">Telefone</Label>
              <Input id="phone" name="phone" value={formData.phone} onChange={handleChange} />
            </div>
            <div className="grid gap-2">
              <Label>Imagem Principal</Label>
              <div className="flex items-center gap-4">
                <img src={formData.image_url} alt={formData.name} className="w-20 h-20 object-cover rounded-md border" />
                <Button type="button" variant="outline" onClick={() => fileInputRef.current.click()}><Upload className="w-4 h-4 mr-2" />Trocar Imagem</Button>
                <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" accept="image/*" />
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="city_id">Cidade</Label>
              <Combobox
                options={cityOptions}
                value={formData.city_id}
                onChange={(value) => setFormData((prev) => ({ ...prev, city_id: value }))}
                placeholder="Selecione a cidade"
                searchPlaceholder="Buscar cidade..."
                notFoundText="Nenhuma cidade encontrada."
              />
            </div>
          </>
        );
      case 'directory':
        return (
          <>
            <div className="grid gap-2">
              <Label htmlFor="name">Nome do Local</Label>
              <Input id="name" name="name" value={formData.name} onChange={handleChange} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="address">Endereço</Label>
              <Input id="address" name="address" value={formData.address} onChange={handleChange} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="phone">Telefone</Label>
              <Input id="phone" name="phone" value={formData.phone} onChange={handleChange} />
            </div>
            <div className="grid gap-2">
              <Label>Imagem</Label>
              <div className="flex items-center gap-4">
                <img src={formData.image_url} alt={formData.name} className="w-20 h-20 object-cover rounded-md border" />
                <Button type="button" variant="outline" onClick={() => fileInputRef.current.click()}><Upload className="w-4 h-4 mr-2" />Trocar Imagem</Button>
                <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" accept="image/*" />
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="city_id">Cidade</Label>
              <Combobox
                options={cityOptions}
                value={formData.city_id}
                onChange={(value) => setFormData((prev) => ({ ...prev, city_id: value }))}
                placeholder="Selecione a cidade"
                searchPlaceholder="Buscar cidade..."
                notFoundText="Nenhuma cidade encontrada."
              />
            </div>
          </>
        );
      default:
        return null;
    }
  };

  return (
    <Dialog open={!!item} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] flex flex-col bg-card border-border">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold text-foreground">{formData.id ? 'Editar Item' : 'Adicionar Novo Item'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex-grow overflow-y-auto pr-6 pl-1 grid gap-4">
          {renderFields()}
        </form>
        <DialogFooter className="flex-shrink-0 pt-4 border-t">
          <DialogClose asChild><Button type="button" variant="outline">Cancelar</Button></DialogClose>
          <Button type="submit" onClick={handleSubmit} className="gap-2"><Save className="w-4 h-4" /> Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const ManageServicesPage = () => {
  const { toast } = useToast();
  const { user } = useAuth();
  const [myActiveCityIds, setMyActiveCityIds] = useState([]);
  const [cityOptions, setCityOptions] = useState([]);
  const isScopedAmbassador = !!user && !user.is_admin && !user.is_master && !!user.is_ambassador;
  const [transport, setTransport] = useState([]);
  const [touristSpots, setTouristSpots] = useState([]);
  const [directoryData, setDirectoryData] = useState({ public: [], commerce: [] });
  const [pendingEntries, setPendingEntries] = useState([]);
  const [editingItem, setEditingItem] = useState(null);
  const [deletingItem, setDeletingItem] = useState(null);
  const [activeTab, setActiveTab] = useState('moderation');
  const [searchParams, setSearchParams] = useSearchParams();

  useEffect(() => {
    if (!isScopedAmbassador || !user?.id) {
      // admin/master: todas as cidades disponíveis no dropdown
      if (user?.is_admin || user?.is_master) {
        supabase.from('cities').select('id, name, states(uf)').then(({ data }) => {
          setCityOptions((data || []).map((c) => ({ value: c.id, label: `${c.name}${c.states?.uf ? ` - ${c.states.uf}` : ''}` })));
        });
      }
      return;
    }
    supabase
      .from('ambassador_cities')
      .select('city_id, cities(id, name, states(uf))')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .then(({ data }) => {
        const rows = data || [];
        setMyActiveCityIds(rows.map((r) => r.city_id));
        setCityOptions(rows.map((r) => ({
          value: r.city_id,
          label: `${r.cities?.name || ''}${r.cities?.states?.uf ? ` - ${r.cities.states.uf}` : ''}`,
        })).filter((c) => c.label.trim()));
      });
  }, [isScopedAmbassador, user?.id, user?.is_admin, user?.is_master]);

  const fetchData = useCallback(async () => {
    if (isScopedAmbassador && myActiveCityIds.length === 0) {
      setTransport([]);
      setTouristSpots([]);
      setDirectoryData({ public: [], commerce: [] });
      setPendingEntries([]);
      return;
    }

    const scopedTables = ['transport', 'tourist_spots', 'directory'];
    const setters = {
      transport: setTransport,
      tourist_spots: setTouristSpots,
      directory: (data) => setDirectoryData({
        public: data.filter(d => d.type === 'public' && d.status === 'approved'),
        commerce: data.filter(d => d.type === 'commerce' && d.status === 'approved'),
      }),
    };

    for (const table of scopedTables) {
      let query = supabase.from(table).select('*');
      if (isScopedAmbassador) query = query.in('city_id', myActiveCityIds);
      const { data, error } = await query;
      if (error) {
        toast({ title: `Erro ao buscar ${table}`, description: error.message, variant: "destructive" });
      } else {
        setters[table](data);
      }
    }

    let pendingQuery = supabase.from('directory').select('*').eq('status', 'pending');
    if (isScopedAmbassador) pendingQuery = pendingQuery.in('city_id', myActiveCityIds);
    const { data: pending, error: pendingError } = await pendingQuery;
    if (pendingError) {
      toast({ title: "Erro ao buscar sugestões pendentes", description: pendingError.message, variant: "destructive" });
    } else {
      setPendingEntries(pending);
    }
  }, [toast, isScopedAmbassador, myActiveCityIds]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Abre a edição automaticamente quando chega via ?edit=ID&type=transport
  // (botão "Editar" nas páginas de detalhes de serviço). Limpa os params
  // depois para não reabrir o modal ao atualizar a página.
  useEffect(() => {
    const editId = searchParams.get('edit');
    const editType = searchParams.get('type');
    if (!editId || !editType) return;

    const source = editType === 'transport' ? transport
      : editType === 'tourist_spots' ? touristSpots
      : null;
    if (!source || source.length === 0) return;

    const target = source.find((i) => String(i.id) === String(editId));
    if (target) {
      setActiveTab(editType);
      setEditingItem({ item: target, type: editType });
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.delete('edit');
        next.delete('type');
        return next;
      }, { replace: true });
    }
  }, [searchParams, transport, touristSpots, setSearchParams]);

  const handleSave = async (itemToSave, type) => {
    const { image_file, ...dbData } = itemToSave;
    let tableName = type;
    if (type.startsWith('directory')) tableName = 'directory';

    const isScopedTable = tableName === 'transport' || tableName === 'tourist_spots' || tableName === 'directory';
    if (isScopedTable) {
      if (!dbData.city_id) {
        toast({ title: "Selecione uma cidade", variant: "destructive" });
        return;
      }
      if (isScopedAmbassador && !myActiveCityIds.includes(dbData.city_id)) {
        toast({ title: "Fora da sua área", description: "Você só pode gerenciar itens nas suas cidades.", variant: "destructive" });
        return;
      }
    }

    if (image_file) {
      const filePath = `${tableName}/${Date.now()}-${image_file.name}`;
      const { error: uploadError } = await supabase.storage.from('work-media').upload(filePath, image_file);
      if (uploadError) {
        toast({ title: "Erro no upload da imagem", description: uploadError.message, variant: "destructive" });
        return;
      }
      const { data: { publicUrl } } = supabase.storage.from('work-media').getPublicUrl(filePath);
      dbData.image_url = publicUrl;
    }

    if (dbData.id) {
      const { error } = await supabase.from(tableName).update(dbData).eq('id', dbData.id);
      if (error) toast({ title: "Erro ao atualizar", description: error.message, variant: "destructive" });
      else toast({ title: "Item atualizado!" });
    } else {
      const { error } = await supabase.from(tableName).insert(dbData);
      if (error) toast({ title: "Erro ao adicionar", description: error.message, variant: "destructive" });
      else toast({ title: "Item adicionado!" });
    }

    fetchData();
    setEditingItem(null);
  };

  const handleDelete = async () => {
    if (!deletingItem) return;
    const { item, type } = deletingItem;
    let tableName = type;
    if (type.startsWith('directory')) tableName = 'directory';

    const { error } = await supabase.from(tableName).delete().eq('id', item.id);
    if (error) {
      toast({ title: "Erro ao remover", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Item removido!", variant: "destructive" });
      fetchData();
    }
    setDeletingItem(null);
  };

  // Aceita um tipo explícito (usado pelo menu "Adicionar Novo" quando a aba
  // ativa é "Moderação", que não tem um tipo de conteúdo próprio) ou usa a
  // aba ativa quando ela já é um tipo de conteúdo (transport, tourist_spots, etc).
  const handleAddNew = (explicitTab) => {
    const targetTab = explicitTab || activeTab;
    let newItem, type;
    switch (targetTab) {
      case 'transport': newItem = { name: '', destination: '', phone: '', instagram: '', schedule: '', details: '', image_url: '', city_id: isScopedAmbassador && myActiveCityIds.length === 1 ? myActiveCityIds[0] : null }; type = 'transport'; break;
      case 'tourist_spots': newItem = { name: '', short_description: '', long_description: '', address: '', phone: '', image_url: '', city_id: isScopedAmbassador && myActiveCityIds.length === 1 ? myActiveCityIds[0] : null }; type = 'tourist_spots'; break;
      case 'directory_public': newItem = { name: '', address: '', phone: '', image_url: '', type: 'public', status: 'approved', city_id: isScopedAmbassador && myActiveCityIds.length === 1 ? myActiveCityIds[0] : null }; type = 'directory'; break;
      case 'directory_commerce': newItem = { name: '', address: '', phone: '', image_url: '', type: 'commerce', status: 'approved', city_id: isScopedAmbassador && myActiveCityIds.length === 1 ? myActiveCityIds[0] : null }; type = 'directory'; break;
      default: return;
    }
    if (explicitTab) setActiveTab(explicitTab);
    setEditingItem({ item: newItem, type });
  };

  const handleModeration = async (entry, status) => {
    const { data, error } = await supabase.from('directory').update({ status }).eq('id', entry.id).select();
    if (error) {
      toast({ title: "Erro na moderação", description: error.message, variant: "destructive" });
    } else if (!data || data.length === 0) {
      toast({ title: "Fora da sua área", description: "Esta sugestão pertence a uma cidade fora do seu escopo de gestão.", variant: "destructive" });
    } else {
      toast({ title: `Sugestão ${status === 'approved' ? 'aprovada' : 'rejeitada'}!` });
      fetchData();
    }
  };

  const renderList = (data, type) => (
    <div className="space-y-2">
      {data.map(item => (
        <div key={item.id} className="flex flex-col sm:flex-row justify-between items-start sm:items-center p-3 bg-background rounded-lg border gap-2">
          <span className="font-medium">{item.name} {item.destination && `- ${item.destination}`} {item.bairro && `- ${item.bairro}`}</span>
          <div className="flex-shrink-0 flex gap-2">
            <Button variant="ghost" size="icon" onClick={() => setEditingItem({ item, type })}><Edit className="w-4 h-4" /></Button>
            <Button variant="ghost" size="icon" className="text-red-500 hover:text-red-600" onClick={() => setDeletingItem({ item, type })}><Trash2 className="w-4 h-4" /></Button>
          </div>
        </div>
      ))}
    </div>
  );

  return (
    <>
      <Helmet>
        <title>Gerenciar Guia de Serviços - Admin</title>
        <meta name="description" content="Gerencie o conteúdo do Guia de Serviços e modere sugestões." />
      </Helmet>
      <div className="container max-w-[88rem] mx-auto w-full px-4 py-12">
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="flex flex-wrap items-center justify-between gap-4 mb-12">
          <div className="flex items-center gap-4">
            <Link to="/admin"><Button variant="outline" size="icon"><ArrowLeft className="w-4 h-4" /></Button></Link>
            <div>
              <h1 className="text-3xl md:text-4xl font-bold text-tc-red">Gerenciar Guia de Serviços</h1>
              <p className="mt-2 text-lg text-muted-foreground">Adicione, edite ou remova itens e modere as colaborações.</p>
            </div>
          </div>
          {activeTab === 'moderation' ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button className="gap-2">
                  <PlusCircle className="w-4 h-4" /> Adicionar Novo
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuItem className="gap-2 cursor-pointer" onClick={() => handleAddNew('transport')}>
                  <Bus className="w-4 h-4" /> Transporte
                </DropdownMenuItem>
                <DropdownMenuItem className="gap-2 cursor-pointer" onClick={() => handleAddNew('tourist_spots')}>
                  <Landmark className="w-4 h-4" /> Ponto Turístico
                </DropdownMenuItem>
                <DropdownMenuItem className="gap-2 cursor-pointer" onClick={() => handleAddNew('directory_public')}>
                  <Building className="w-4 h-4" /> Serviço Público
                </DropdownMenuItem>
                <DropdownMenuItem className="gap-2 cursor-pointer" onClick={() => handleAddNew('directory_commerce')}>
                  <ShoppingCart className="w-4 h-4" /> Comércio Local
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <Button onClick={() => handleAddNew()} className="gap-2">
              <PlusCircle className="w-4 h-4" /> Adicionar Novo
            </Button>
          )}
        </motion.div>

        <Tabs value={activeTab} className="w-full" onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-2 md:grid-cols-4 bg-muted/50 rounded-lg h-auto">
            <TabsTrigger value="moderation" className="gap-2 py-2"><Hourglass className="w-4 h-4" /> Moderação ({pendingEntries.length})</TabsTrigger>
            <TabsTrigger value="transport" className="gap-2 py-2"><Bus className="w-4 h-4" /> Transportes</TabsTrigger>
            <TabsTrigger value="tourist_spots" className="gap-2 py-2"><Landmark className="w-4 h-4" /> Pontos Turísticos</TabsTrigger>
            <TabsTrigger value="directory" className="gap-2 py-2"><Phone className="w-4 h-4" /> Guia Comercial</TabsTrigger>
          </TabsList>

          <TabsContent value="moderation" className="mt-8">
            <Card>
              <CardHeader><CardTitle>Moderar Sugestões do Guia Comercial</CardTitle></CardHeader>
              <CardContent>
                {pendingEntries.length > 0 ? (
                  <div className="space-y-4">
                    {pendingEntries.map(entry => (
                      <Card key={entry.id} className="flex flex-col md:flex-row items-start gap-4 p-4">
                        <img src={entry.image_url} alt={entry.name} className="w-full md:w-32 h-32 object-cover rounded-md border" />
                        <div className="flex-grow">
                          <h3 className="font-bold">{entry.name}</h3>
                          <p className="text-sm text-muted-foreground">{entry.address}</p>
                          <p className="text-sm text-muted-foreground">{entry.phone}</p>
                          <p className="text-xs text-muted-foreground mt-2">Sugerido por ID: {entry.submitted_by}</p>
                        </div>
                        <div className="flex-shrink-0 flex md:flex-col gap-2">
                          <Button size="sm" variant="outline" className="text-red-500 border-red-500 hover:bg-red-500/10 gap-2" onClick={() => handleModeration(entry, 'rejected')}><X className="w-4 h-4" />Rejeitar</Button>
                          <Button size="sm" className="bg-green-600 hover:bg-green-700 gap-2" onClick={() => handleModeration(entry, 'approved')}><Check className="w-4 h-4" />Aprovar</Button>
                        </div>
                      </Card>
                    ))}
                  </div>
                ) : (
                  <p className="text-muted-foreground text-center py-8">Nenhuma sugestão pendente de moderação.</p>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="transport" className="mt-8">
            <Card><CardHeader><CardTitle>Gerenciar Transportes</CardTitle></CardHeader><CardContent>{renderList(transport, 'transport')}</CardContent></Card>
          </TabsContent>
          
          <TabsContent value="tourist_spots" className="mt-8">
            <Card><CardHeader><CardTitle>Gerenciar Pontos Turísticos</CardTitle></CardHeader><CardContent>{renderList(touristSpots, 'tourist_spots')}</CardContent></Card>
          </TabsContent>

          <TabsContent value="directory" className="mt-8 grid md:grid-cols-2 gap-8">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Building className="w-5 h-5 text-primary" /> Serviços Públicos</CardTitle>
                <CardDescription>
                  <Button size="sm" variant="outline" className="mt-2 gap-2" onClick={() => handleAddNew('directory_public')}>
                    <PlusCircle className="w-4 h-4" /> Adicionar
                  </Button>
                </CardDescription>
              </CardHeader>
              <CardContent>{renderList(directoryData.public, 'directory')}</CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><ShoppingCart className="w-5 h-5 text-secondary" /> Comércio Local</CardTitle>
                <CardDescription>
                  <Button size="sm" variant="outline" className="mt-2 gap-2" onClick={() => handleAddNew('directory_commerce')}>
                    <PlusCircle className="w-4 h-4" /> Adicionar
                  </Button>
                </CardDescription>
              </CardHeader>
              <CardContent>{renderList(directoryData.commerce, 'directory')}</CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {editingItem && <EditModal item={editingItem.item} type={editingItem.type} onSave={handleSave} onClose={() => setEditingItem(null)} cityOptions={cityOptions} />}

      <Dialog open={!!deletingItem} onOpenChange={(open) => !open && setDeletingItem(null)}>
        <DialogContent className="sm:max-w-md bg-card border-border">
          <DialogHeader><DialogTitle className="text-xl font-bold text-foreground">Confirmar Exclusão</DialogTitle></DialogHeader>
          <p className="text-muted-foreground">Tem certeza que deseja remover "{deletingItem?.item.name}"? Esta ação não pode ser desfeita.</p>
          <DialogFooter className="sm:justify-end gap-2">
            <DialogClose asChild><Button type="button" variant="outline">Cancelar</Button></DialogClose>
            <Button type="button" variant="destructive" onClick={handleDelete}><Trash2 className="w-4 h-4 mr-2" /> Remover</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default ManageServicesPage;
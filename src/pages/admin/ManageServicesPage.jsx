import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Helmet } from 'react-helmet';
import { Link } from 'react-router-dom';
import { ArrowLeft, PlusCircle, Edit, Trash2, Bus, Landmark, Phone, Mail, Save, X, Upload, Instagram, Clock, MapPin, Info, Building, ShoppingCart, Check, Hourglass } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from '@/components/ui/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/lib/customSupabaseClient';

const EditModal = ({ item, type, onSave, onClose }) => {
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
          </>
        );
      case 'pavement_streets':
        return (
          <>
            <div className="grid gap-2">
              <Label htmlFor="name">Nome da Rua</Label>
              <Input id="name" name="name" value={formData.name} onChange={handleChange} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="bairro">Bairro</Label>
              <Input id="bairro" name="bairro" value={formData.bairro} onChange={handleChange} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="cep">CEP</Label>
              <Input id="cep" name="cep" value={formData.cep} onChange={handleChange} />
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
  const [transport, setTransport] = useState([]);
  const [touristSpots, setTouristSpots] = useState([]);
  const [directoryData, setDirectoryData] = useState({ public: [], commerce: [] });
  const [streets, setStreets] = useState([]);
  const [pendingEntries, setPendingEntries] = useState([]);
  const [editingItem, setEditingItem] = useState(null);
  const [deletingItem, setDeletingItem] = useState(null);
  const [activeTab, setActiveTab] = useState('moderation');

  const fetchData = useCallback(async () => {
    const tables = ['transport', 'tourist_spots', 'directory', 'pavement_streets'];
    const setters = {
      transport: setTransport,
      tourist_spots: setTouristSpots,
      directory: (data) => setDirectoryData({
        public: data.filter(d => d.type === 'public' && d.status === 'approved'),
        commerce: data.filter(d => d.type === 'commerce' && d.status === 'approved'),
      }),
      pavement_streets: setStreets,
    };

    for (const table of tables) {
      const { data, error } = await supabase.from(table).select('*');
      if (error) {
        toast({ title: `Erro ao buscar ${table}`, description: error.message, variant: "destructive" });
      } else {
        setters[table](data);
      }
    }

    const { data: pending, error: pendingError } = await supabase.from('directory').select('*').eq('status', 'pending');
    if (pendingError) {
      toast({ title: "Erro ao buscar sugestões pendentes", description: pendingError.message, variant: "destructive" });
    } else {
      setPendingEntries(pending);
    }
  }, [toast]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleSave = async (itemToSave, type) => {
    const { image_file, ...dbData } = itemToSave;
    let tableName = type;
    if (type.startsWith('directory')) tableName = 'directory';

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

  const handleAddNew = () => {
    let newItem, type;
    switch (activeTab) {
      case 'transport': newItem = { name: '', destination: '', phone: '', instagram: '', schedule: '', details: '', image_url: '' }; type = 'transport'; break;
      case 'tourist_spots': newItem = { name: '', short_description: '', long_description: '', address: '', phone: '', image_url: '' }; type = 'tourist_spots'; break;
      case 'directory_public': newItem = { name: '', address: '', phone: '', image_url: '', type: 'public', status: 'approved' }; type = 'directory'; break;
      case 'directory_commerce': newItem = { name: '', address: '', phone: '', image_url: '', type: 'commerce', status: 'approved' }; type = 'directory'; break;
      case 'pavement_streets': newItem = { name: '', bairro: '', cep: '' }; type = 'pavement_streets'; break;
      default: return;
    }
    setEditingItem({ item: newItem, type });
  };

  const handleModeration = async (entry, status) => {
    const { error } = await supabase.from('directory').update({ status }).eq('id', entry.id);
    if (error) {
      toast({ title: "Erro na moderação", description: error.message, variant: "destructive" });
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
      <div className="container mx-auto px-4 py-12">
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="flex flex-wrap items-center justify-between gap-4 mb-12">
          <div className="flex items-center gap-4">
            <Link to="/admin"><Button variant="outline" size="icon"><ArrowLeft className="w-4 h-4" /></Button></Link>
            <div>
              <h1 className="text-3xl md:text-4xl font-bold text-tc-red">Gerenciar Guia de Serviços</h1>
              <p className="mt-2 text-lg text-muted-foreground">Adicione, edite ou remova itens e modere as colaborações.</p>
            </div>
          </div>
          <Button onClick={handleAddNew} className="gap-2">
            <PlusCircle className="w-4 h-4" /> Adicionar Novo
          </Button>
        </motion.div>

        <Tabs defaultValue="moderation" className="w-full" onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-2 md:grid-cols-5 bg-muted/50 rounded-lg h-auto">
            <TabsTrigger value="moderation" className="gap-2 py-2"><Hourglass className="w-4 h-4" /> Moderação ({pendingEntries.length})</TabsTrigger>
            <TabsTrigger value="transport" className="gap-2 py-2"><Bus className="w-4 h-4" /> Transportes</TabsTrigger>
            <TabsTrigger value="tourist_spots" className="gap-2 py-2"><Landmark className="w-4 h-4" /> Pontos Turísticos</TabsTrigger>
            <TabsTrigger value="directory" className="gap-2 py-2"><Phone className="w-4 h-4" /> Guia Comercial</TabsTrigger>
            <TabsTrigger value="pavement_streets" className="gap-2 py-2"><Mail className="w-4 h-4" /> Ruas e CEPs</TabsTrigger>
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
                  <Button size="sm" variant="outline" className="mt-2 gap-2" onClick={() => { setActiveTab('directory_public'); handleAddNew(); }}>
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
                  <Button size="sm" variant="outline" className="mt-2 gap-2" onClick={() => { setActiveTab('directory_commerce'); handleAddNew(); }}>
                    <PlusCircle className="w-4 h-4" /> Adicionar
                  </Button>
                </CardDescription>
              </CardHeader>
              <CardContent>{renderList(directoryData.commerce, 'directory')}</CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="pavement_streets" className="mt-8">
            <Card><CardHeader><CardTitle>Gerenciar Ruas e CEPs</CardTitle></CardHeader><CardContent>{renderList(streets, 'pavement_streets')}</CardContent></Card>
          </TabsContent>
        </Tabs>
      </div>

      {editingItem && <EditModal item={editingItem.item} type={editingItem.type} onSave={handleSave} onClose={() => setEditingItem(null)} />}

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
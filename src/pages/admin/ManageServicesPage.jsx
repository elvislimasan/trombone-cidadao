import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Helmet } from 'react-helmet';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft, PlusCircle, Edit, Trash2, Bus, Landmark, Save, X, Upload, Check, Hourglass, Tags, Church } from 'lucide-react';
import { Button } from '@/components/ui/button';
import CityCombobox from '@/components/CityCombobox';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, FormDialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { Combobox } from '@/components/ui/combobox';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { TIPOS_TRANSPORTE } from '@/lib/transportTypes';
import { useListaPaginada } from '@/hooks/useListaPaginada';
import PaginacaoLista from '@/components/admin/PaginacaoLista';
import { showAppError } from '@/lib/appError';
import { optimizeImageFile } from '@/lib/optimizeImage';

// Uma aba do guia: transportes, pontos turísticos, órgãos públicos, comércios.
// As quatro têm a mesma linha e o mesmo par de botões — e agora o mesmo
// recorte, que no celular rola e no desktop pagina.
const ListaServicos = ({ data, type, onEdit, onDelete }) => {
  const { visiveis, propsPaginacao } = useListaPaginada(data || [], { porPagina: 20 });

  if (!data || data.length === 0) {
    return <p className="text-center text-muted-foreground py-8">Nenhum item cadastrado nesta seção.</p>;
  }

  return (
    <>
      <div className="space-y-2">
        {visiveis.map(item => (
          <div key={item.id} className="flex flex-col sm:flex-row justify-between items-start sm:items-center p-3 bg-background rounded-lg border gap-2">
            <span className="font-medium">{item.name} {item.destination && `- ${item.destination}`} {item.bairro && `- ${item.bairro}`}</span>
            <div className="flex-shrink-0 flex gap-2">
              <Button variant="ghost" size="icon" title="Editar" onClick={() => onEdit(item)}><Edit className="w-4 h-4" /></Button>
              <Button variant="ghost" size="icon" title="Remover" className="text-red-500 hover:text-red-600" onClick={() => onDelete(item)}><Trash2 className="w-4 h-4" /></Button>
            </div>
          </div>
        ))}
      </div>
      <PaginacaoLista {...propsPaginacao} />
    </>
  );
};

const EditModal = ({ item, type, onSave, onClose, allowedCityIds, directoryCategories }) => {
  const [formData, setFormData] = useState(null);
  const fileInputRef = useRef(null);

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
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave(formData, type);
  };

  if (!formData) return null;

  const categoryById = new Map((directoryCategories || []).map((category) => [String(category.id), category]));
  const directoryCategoryOptions = [...(directoryCategories || [])]
    .sort((a, b) => (a.parent_id ? 1 : 0) - (b.parent_id ? 1 : 0) || a.name.localeCompare(b.name, 'pt-BR'))
    .map((category) => ({
      value: category.id,
      label: `${category.parent_id ? `${categoryById.get(String(category.parent_id))?.name || 'Categoria'} · ` : ''}${category.name}`,
    }));

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
              <Label htmlFor="vehicle_type">Tipo de transporte</Label>
              <Combobox
                options={TIPOS_TRANSPORTE.map((t) => ({ value: t.id, label: t.name }))}
                value={formData.vehicle_type || ''}
                onChange={(value) => setFormData((prev) => ({ ...prev, vehicle_type: value }))}
                placeholder="Selecione o tipo (moto, tuk tuk, carro...)"
                searchPlaceholder="Buscar tipo..."
                notFoundText="Nenhum tipo encontrado."
                modal
              />
              <p className="text-xs text-muted-foreground">
                Define o ícone e a imagem ilustrativa do serviço, e alimenta o filtro por tipo no guia.
              </p>
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
              <CityCombobox
                value={formData.city_id}
                onChange={(value) => setFormData((prev) => ({ ...prev, city_id: value }))}
                allowedCityIds={allowedCityIds}
                modal
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
              <CityCombobox
                value={formData.city_id}
                onChange={(value) => setFormData((prev) => ({ ...prev, city_id: value }))}
                allowedCityIds={allowedCityIds}
                modal
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
              <Label>Categoria ou subcategoria</Label>
              <Combobox
                options={directoryCategoryOptions}
                value={formData.category_id || ''}
                onChange={(value) => setFormData((prev) => ({ ...prev, category_id: value || null }))}
                placeholder="Selecione a categoria"
                searchPlaceholder="Buscar categoria..."
                notFoundText="Crie a categoria na aba Guia da Cidade."
                modal
              />
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
              <CityCombobox
                value={formData.city_id}
                onChange={(value) => setFormData((prev) => ({ ...prev, city_id: value }))}
                allowedCityIds={allowedCityIds}
                modal
              />
            </div>
          </>
        );
      default:
        return null;
    }
  };

  const itemTypeLabel = {
    transport: 'transporte',
    tourist_spots: 'ponto turístico',
    directory: 'local do Guia',
  }[type] || 'item';

  return (
    <Dialog open={!!item} onOpenChange={(open) => !open && onClose()}>
      <FormDialogContent className="h-[94dvh] grid-rows-[auto_minmax(0,1fr)] gap-0 overflow-hidden p-0 sm:h-[90vh] sm:max-w-2xl">
        <DialogHeader className="border-b border-edge-subtle px-5 py-4 pr-12 sm:px-6">
          <DialogTitle className="text-xl font-bold text-content-primary">
            {formData.id ? `Editar ${itemTypeLabel}` : `Adicionar ${itemTypeLabel}`}
          </DialogTitle>
          <p className="text-sm text-content-tertiary">Preencha as informações exibidas no Guia da Cidade.</p>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="grid min-h-0 grid-rows-[minmax(0,1fr)_auto] overflow-hidden">
          <div className="grid min-h-0 content-start gap-4 overflow-y-auto px-5 py-5 sm:px-6">
            {renderFields()}
          </div>
          <DialogFooter className="shrink-0 gap-2 border-t border-edge-subtle bg-surface-raised px-5 py-4 sm:px-6">
            <DialogClose asChild>
              <Button type="button" variant="outline" className="h-11 rounded-xl sm:min-w-28">Cancelar</Button>
            </DialogClose>
            <Button type="submit" className="h-11 gap-2 rounded-xl sm:min-w-32">
              <Save className="h-4 w-4" /> Salvar
            </Button>
          </DialogFooter>
        </form>
      </FormDialogContent>
    </Dialog>
  );
};

const ManageServicesPage = () => {
  const { user } = useAuth();
  const [myActiveCityIds, setMyActiveCityIds] = useState([]);
  const isScopedAmbassador = !!user && !user.is_admin && !user.is_master && !!user.is_ambassador;
  const [transport, setTransport] = useState([]);
  const [touristSpots, setTouristSpots] = useState([]);
  const [directoryData, setDirectoryData] = useState({ public: [], commerce: [], all: [] });
  const [directoryCategories, setDirectoryCategories] = useState([]);
  const [newCategory, setNewCategory] = useState({ name: '', city_id: null, parent_id: null });
  const [savingCategory, setSavingCategory] = useState(false);
  const [pendingEntries, setPendingEntries] = useState([]);
  const [editingItem, setEditingItem] = useState(null);
  const [deletingItem, setDeletingItem] = useState(null);
  const [activeTab, setActiveTab] = useState('moderation');
  const [searchParams, setSearchParams] = useSearchParams();

  useEffect(() => {
    if (!isScopedAmbassador || !user?.id) {
      setMyActiveCityIds([]);
      return;
    }
    supabase
      .from('ambassador_cities')
      .select('city_id')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .then(({ data }) => {
        const rows = data || [];
        setMyActiveCityIds(rows.map((r) => r.city_id));
      });
  }, [isScopedAmbassador, user?.id, user?.is_admin, user?.is_master]);

  const fetchData = useCallback(async () => {
    if (isScopedAmbassador && myActiveCityIds.length === 0) {
      setTransport([]);
      setTouristSpots([]);
      setDirectoryData({ public: [], commerce: [], all: [] });
      setDirectoryCategories([]);
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
        all: data.filter(d => d.status === 'approved'),
      }),
    };

    for (const table of scopedTables) {
      let query = supabase.from(table).select('*');
      if (isScopedAmbassador) query = query.in('city_id', myActiveCityIds);
      const { data, error } = await query;
      if (error) {
        showAppError({ title: `Erro ao buscar ${table}`, description: error.message, variant: "destructive" });
      } else {
        setters[table](data);
      }
    }

    const { data: categories, error: categoriesError } = await supabase.from('directory_categories').select('*').order('sort_order').order('name');
    if (!categoriesError) setDirectoryCategories(categories || []);

    let pendingQuery = supabase.from('directory').select('*').eq('status', 'pending');
    if (isScopedAmbassador) pendingQuery = pendingQuery.in('city_id', myActiveCityIds);
    const { data: pending, error: pendingError } = await pendingQuery;
    if (pendingError) {
      showAppError({ title: "Erro ao buscar sugestões pendentes", description: pendingError.message, variant: "destructive" });
    } else {
      setPendingEntries(pending);
    }
  }, [isScopedAmbassador, myActiveCityIds]);

  useEffect(() => {
    if (!newCategory.city_id && myActiveCityIds.length === 1) {
      setNewCategory((current) => ({ ...current, city_id: myActiveCityIds[0] }));
    }
  }, [myActiveCityIds, newCategory.city_id]);

  const handleCreateCategory = async () => {
    if (!newCategory.name.trim()) {
      showAppError({ title: 'Informe o nome da categoria', variant: 'destructive' });
      return;
    }
    setSavingCategory(true);
    const { error } = await supabase.from('directory_categories').insert({
      name: newCategory.name.trim(),
      city_id: isScopedAmbassador ? (newCategory.city_id || myActiveCityIds[0] || null) : null,
      parent_id: newCategory.parent_id || null,
    });
    setSavingCategory(false);
    if (error) {
      showAppError({ title: 'Não foi possível criar a categoria', description: error.message, variant: 'destructive' });
      return;
    }
    setNewCategory((current) => ({ ...current, name: '', parent_id: null }));
    await fetchData();
  };

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
      : editType === 'directory' ? directoryData.all
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
  }, [searchParams, transport, touristSpots, directoryData.all, setSearchParams]);

  const handleSave = async (itemToSave, type) => {
    const { image_file, ...dbData } = itemToSave;
    let tableName = type;
    if (type.startsWith('directory')) tableName = 'directory';

    // O Combobox devolve '' quando nada foi escolhido, e '' nao e "sem tipo":
    // o filtro do guia compara por id e a coluna e nullable de proposito.
    if (tableName === 'transport' && !dbData.vehicle_type) dbData.vehicle_type = null;

    const isScopedTable = tableName === 'transport' || tableName === 'tourist_spots' || tableName === 'directory';
    if (isScopedTable) {
      if (!dbData.city_id) {
        showAppError({ title: "Selecione uma cidade", variant: "destructive" });
        return;
      }
      if (isScopedAmbassador && !myActiveCityIds.includes(dbData.city_id)) {
        showAppError({ title: "Fora da sua área", description: "Você só pode gerenciar itens nas suas cidades.", variant: "destructive" });
        return;
      }
    }

    if (image_file) {
      const uploadFile = await optimizeImageFile(image_file);
      const filePath = `${tableName}/${Date.now()}-${uploadFile.name}`;
      const { error: uploadError } = await supabase.storage.from('work-media').upload(filePath, uploadFile);
      if (uploadError) {
        showAppError({ title: "Erro no upload da imagem", description: uploadError.message, variant: "destructive" });
        return;
      }
      const { data: { publicUrl } } = supabase.storage.from('work-media').getPublicUrl(filePath);
      dbData.image_url = publicUrl;
    }

    if (dbData.id) {
      const { error } = await supabase.from(tableName).update(dbData).eq('id', dbData.id);
      if (error) showAppError({ title: "Erro ao atualizar", description: error.message, variant: "destructive" });
    } else {
      const { error } = await supabase.from(tableName).insert(dbData);
      if (error) showAppError({ title: "Erro ao adicionar", description: error.message, variant: "destructive" });
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
      showAppError({ title: "Erro ao remover", description: error.message, variant: "destructive" });
    } else {
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
      case 'transport': newItem = { name: '', destination: '', vehicle_type: '', phone: '', instagram: '', schedule: '', details: '', image_url: '', city_id: isScopedAmbassador && myActiveCityIds.length === 1 ? myActiveCityIds[0] : null }; type = 'transport'; break;
      case 'tourist_spots': newItem = { name: '', short_description: '', long_description: '', address: '', phone: '', image_url: '', city_id: isScopedAmbassador && myActiveCityIds.length === 1 ? myActiveCityIds[0] : null }; type = 'tourist_spots'; break;
      case 'directory':
      case 'directory_public':
      case 'directory_commerce': newItem = { name: '', address: '', phone: '', image_url: '', type: targetTab === 'directory_public' ? 'public' : 'commerce', status: 'approved', category_id: null, city_id: isScopedAmbassador && myActiveCityIds.length === 1 ? myActiveCityIds[0] : null }; type = 'directory'; break;
      default: return;
    }
    if (explicitTab) setActiveTab(explicitTab);
    setEditingItem({ item: newItem, type });
  };

  const handleModeration = async (entry, status) => {
    const { data, error } = await supabase.from('directory').update({ status }).eq('id', entry.id).select();
    if (error) {
      showAppError({ title: "Erro na moderação", description: error.message, variant: "destructive" });
    } else if (!data || data.length === 0) {
      showAppError({ title: "Fora da sua área", description: "Esta sugestão pertence a uma cidade fora do seu escopo de gestão.", variant: "destructive" });
    } else {
      fetchData();
    }
  };

  // `renderList` virou componente porque a paginação é um hook, e hook não
  // pode morar numa função chamada de dentro do JSX — cada aba tem a sua
  // lista, e a ordem das chamadas mudaria ao trocar de aba.
  const renderList = (data, type) => (
    <ListaServicos
      data={data}
      type={type}
      onEdit={(item) => setEditingItem({ item, type })}
      onDelete={(item) => setDeletingItem({ item, type })}
    />
  );

  return (
    <>
      <Helmet>
        <title>Gerenciar Guia da Cidade - Admin</title>
        <meta name="description" content="Gerencie o Guia da Cidade, suas categorias e sugestões." />
      </Helmet>
      <div className="mx-auto w-full max-w-[112rem] px-3 py-8 sm:px-5 lg:px-8">
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="flex flex-wrap items-center justify-between gap-4 mb-12">
          <div className="flex items-center gap-4">
            <Link to="/admin"><Button variant="outline" size="icon"><ArrowLeft className="w-4 h-4" /></Button></Link>
            <div>
              <h1 className="text-3xl md:text-4xl font-bold text-tc-red">Gerenciar Guia da Cidade</h1>
              <p className="mt-2 text-lg text-muted-foreground">Cadastre comércios, igrejas, órgãos e outros locais da cidade.</p>
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
                <DropdownMenuItem className="gap-2 cursor-pointer" onClick={() => handleAddNew('directory')}>
                  <Church className="w-4 h-4" /> Local do Guia da Cidade
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
            <TabsTrigger value="directory" className="gap-2 py-2"><Church className="w-4 h-4" /> Guia da Cidade</TabsTrigger>
          </TabsList>

          <TabsContent value="moderation" className="mt-8">
            <Card>
              <CardHeader><CardTitle>Moderar sugestões do Guia da Cidade</CardTitle></CardHeader>
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

          <TabsContent value="directory" className="mt-8 grid gap-8 lg:grid-cols-[22rem_minmax(0,1fr)]">
            <Card className="h-fit">
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Tags className="h-5 w-5 text-primary" /> Categorias</CardTitle>
                <CardDescription>Crie categorias reutilizáveis em todas as cidades, como “Igrejas · Católicas”.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3">
                {isScopedAmbassador && (
                  <CityCombobox
                    value={newCategory.city_id || ''}
                    onChange={(value) => setNewCategory((current) => ({ ...current, city_id: value, parent_id: null }))}
                    allowedCityIds={myActiveCityIds}
                    placeholder="Cidade da categoria"
                  />
                )}
                <Input placeholder="Nome da categoria" value={newCategory.name} onChange={(event) => setNewCategory((current) => ({ ...current, name: event.target.value }))} />
                <Combobox
                  options={directoryCategories
                    .filter((category) => !category.parent_id)
                    .map((category) => ({ value: category.id, label: `Subcategoria de ${category.name}` }))}
                  value={newCategory.parent_id || ''}
                  onChange={(value) => setNewCategory((current) => ({ ...current, parent_id: value || null }))}
                  placeholder="Categoria principal (opcional)"
                  searchPlaceholder="Buscar categoria principal..."
                />
                <Button onClick={handleCreateCategory} disabled={savingCategory} className="gap-2"><PlusCircle className="h-4 w-4" /> {savingCategory ? 'Criando...' : 'Criar categoria'}</Button>
                <div className="mt-2 grid gap-1.5 border-t pt-3">
                  {directoryCategories.map((category) => {
                      const parent = directoryCategories.find((item) => String(item.id) === String(category.parent_id));
                      return <div key={category.id} className="rounded-lg bg-muted/50 px-3 py-2 text-xs"><span className="font-semibold">{parent ? `${parent.name} · ` : ''}{category.name}</span></div>;
                    })}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex-row items-center justify-between gap-3">
                <div><CardTitle>Locais cadastrados</CardTitle><CardDescription>Comércios, igrejas, órgãos e serviços.</CardDescription></div>
                <Button size="sm" variant="outline" className="gap-2" onClick={() => handleAddNew('directory')}><PlusCircle className="h-4 w-4" /> Adicionar local</Button>
              </CardHeader>
              <CardContent>{renderList(directoryData.all, 'directory')}</CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {editingItem && <EditModal item={editingItem.item} type={editingItem.type} onSave={handleSave} onClose={() => setEditingItem(null)} allowedCityIds={isScopedAmbassador ? myActiveCityIds : undefined} directoryCategories={directoryCategories} />}

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

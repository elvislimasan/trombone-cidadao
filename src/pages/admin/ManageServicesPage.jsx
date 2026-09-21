import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Helmet } from 'react-helmet';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft, PlusCircle, Edit, Trash2, Save, X, Upload, Check, Hourglass, Tags, Church, Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
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
import { useListaPaginada } from '@/hooks/useListaPaginada';
import PaginacaoLista from '@/components/admin/PaginacaoLista';
import { showAppError, showAppNotice } from '@/lib/appError';
import { optimizeImageFile } from '@/lib/optimizeImage';
import LocationPickerMap from '@/components/LocationPickerMap';
import { useCity } from '@/contexts/CityContext';
import { normalizarInstagram } from '@/lib/externalLinks';
import { guideLocation } from '@/lib/guideLocation';

import GuideCategorySelect from '@/components/GuideCategorySelect';
import GuideTransportFields from '@/components/GuideTransportFields';
import { guideCategoryIds, isGuideTransport } from '@/lib/guideCategories';
// Lista unificada do Guia, com o mesmo recorte no celular e no desktop.
const ListaServicos = ({ data, onEdit, onDelete }) => {
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

const EditModal = ({ item, onSave, onClose, allowedCityIds, directoryCategories }) => {
  const { cities } = useCity();
  const [formData, setFormData] = useState(null);
  const [mapLocation, setMapLocation] = useState(null);
  const [mapRevision, setMapRevision] = useState(0);
  const fileInputRef = useRef(null);
  const secondaryFileInputRef = useRef(null);

  useEffect(() => {
    if (item) {
      setFormData({ ...item, category_ids: guideCategoryIds(item) });
      setMapLocation(guideLocation(item.address) || guideLocation(item.location));
      setMapRevision((revision) => revision + 1);
    } else {
      setFormData(null);
      setMapLocation(null);
    }
  }, [item]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    if (name === 'address') {
      const linkedPosition = guideLocation(value);
      if (linkedPosition) {
        setMapLocation(linkedPosition);
        setMapRevision((revision) => revision + 1);
      }
    }
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

  const handleSecondaryFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => setFormData((prev) => ({
      ...prev,
      secondary_image_file: file,
      guide_metadata: { ...prev.guide_metadata, secondary_image_url: reader.result },
    }));
    reader.readAsDataURL(file);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave({
      ...formData,
      instagram_url: normalizarInstagram(formData.instagram_url) || null,
      location: mapLocation ? `POINT(${mapLocation.lng} ${mapLocation.lat})` : null,
    });
  };

  if (!formData) return null;

  const categoryById = new Map((directoryCategories || []).map((category) => [String(category.id), category]));
  const directoryCategoryOptions = [...(directoryCategories || [])]
    .sort((a, b) => (a.parent_id ? 1 : 0) - (b.parent_id ? 1 : 0) || a.name.localeCompare(b.name, 'pt-BR'))
    .map((category) => ({
      value: category.id,
      label: `${category.parent_id ? `${categoryById.get(String(category.parent_id))?.name || 'Categoria'} · ` : ''}${category.name}`,
    }));
  const selectedCity = (cities || []).find((city) => String(city.id) === String(formData.city_id));
  const fallbackCityCenter = selectedCity
    ? { name: selectedCity.name, uf: selectedCity.state?.uf }
    : null;

  const renderFields = () => (
          <>
            <div className="grid gap-2">
              <Label htmlFor="name">Nome do Local</Label>
              <Input id="name" name="name" value={formData.name} onChange={handleChange} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="description">Descrição</Label>
              <Textarea id="description" name="description" value={formData.description || ''} onChange={handleChange} rows={4} />
            </div>
            <div className="grid gap-2">
              <Label>Categorias e subcategorias</Label>
              <GuideCategorySelect options={directoryCategoryOptions} value={formData.category_ids || []} onChange={(value) => setFormData((prev) => ({ ...prev, category_ids: value, category_id: value[0] || null }))} />
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
            {isGuideTransport(formData, directoryCategories || []) && <GuideTransportFields value={formData.guide_metadata || {}} onChange={(value) => setFormData((prev) => ({ ...prev, guide_metadata: value }))} />}
            <div className="grid gap-2">
              <Label htmlFor="address">Endereço</Label>
              <Input id="address" name="address" value={formData.address} onChange={handleChange} />
            </div>
            <div className="grid gap-2">
              <Label>Localização no mapa</Label>
              <div className="h-64 overflow-hidden rounded-xl border border-input">
                <LocationPickerMap
                  key={`${formData.city_id || 'no-city'}-${mapRevision}`}
                  initialPosition={mapLocation}
                  onLocationChange={setMapLocation}
                  fallbackCityCenter={fallbackCityCenter}
                  showLocateButton
                  showMarker={Boolean(mapLocation)}
                  initialZoom={16}
                />
              </div>
              <p className="text-xs text-muted-foreground">Toque no mapa ou use sua localização para marcar o ponto exato.</p>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="phone">Telefone</Label>
              <Input id="phone" name="phone" value={formData.phone} onChange={handleChange} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="instagram_url">Instagram da empresa</Label>
              <Input
                id="instagram_url"
                name="instagram_url"
                value={formData.instagram_url || ''}
                onChange={handleChange}
                placeholder="@empresa ou https://instagram.com/empresa"
                inputMode="url"
                autoCapitalize="none"
              />
            </div>
            <div className="grid gap-2">
              <Label>Imagem em destaque</Label>
              <div className="flex items-center gap-4">
                {formData.image_url && <img src={formData.image_url} alt={formData.name} className="w-20 h-20 object-contain rounded-md border" />}
                <Button type="button" variant="outline" onClick={() => fileInputRef.current.click()}><Upload className="w-4 h-4 mr-2" />Escolher imagem</Button>
                <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" accept="image/*" />
              </div>
            </div>
            <div className="grid gap-2">
              <Label>Imagem secundária (informações adicionais)</Label>
              <div className="flex flex-wrap items-center gap-4">
                {formData.guide_metadata?.secondary_image_url && <img src={formData.guide_metadata.secondary_image_url} alt="Prévia da imagem secundária" className="h-20 w-20 rounded-md border object-contain" />}
                <Button type="button" variant="outline" onClick={() => secondaryFileInputRef.current.click()}><Upload className="mr-2 h-4 w-4" />Escolher imagem</Button>
                {formData.guide_metadata?.secondary_image_url && <Button type="button" variant="ghost" onClick={() => setFormData((prev) => ({ ...prev, secondary_image_file: null, guide_metadata: { ...prev.guide_metadata, secondary_image_url: null } }))}>Remover</Button>}
                <input type="file" ref={secondaryFileInputRef} onChange={handleSecondaryFileChange} className="hidden" accept="image/*" />
              </div>
            </div>
          </>
  );

  return (
    <Dialog open={!!item} onOpenChange={(open) => !open && onClose()}>
      <FormDialogContent className="h-[94dvh] grid-rows-[auto_minmax(0,1fr)] gap-0 overflow-hidden p-0 sm:h-[90vh] sm:max-w-2xl">
        <DialogHeader className="border-b border-edge-subtle px-5 py-4 pr-12 sm:px-6">
          <DialogTitle className="text-xl font-bold text-content-primary">
            {formData.id ? 'Editar local do Guia' : 'Adicionar local ao Guia'}
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
  const [directoryData, setDirectoryData] = useState({ public: [], commerce: [], all: [] });
  const [directoryCategories, setDirectoryCategories] = useState([]);
  const [newCategory, setNewCategory] = useState({ name: '', parent_id: null });
  const [savingCategory, setSavingCategory] = useState(false);
  const [editingCategory, setEditingCategory] = useState(null);
  const [deletingCategory, setDeletingCategory] = useState(null);
  const [deletingCategoryBusy, setDeletingCategoryBusy] = useState(false);
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
      setDirectoryData({ public: [], commerce: [], all: [] });
      setDirectoryCategories([]);
      setPendingEntries([]);
      return;
    }

    let directoryQuery = supabase.from('directory').select('*');
    if (isScopedAmbassador) directoryQuery = directoryQuery.in('city_id', myActiveCityIds);
    const { data: guideEntries, error: directoryError } = await directoryQuery;
    if (directoryError) {
      showAppError({ title: 'Erro ao buscar o Guia da Cidade', description: directoryError.message, variant: 'destructive' });
    } else {
      setDirectoryData({
        public: guideEntries.filter(d => d.type === 'public' && d.status === 'approved'),
        commerce: guideEntries.filter(d => d.type === 'commerce' && d.status === 'approved'),
        all: guideEntries.filter(d => d.status === 'approved'),
      });
    }

    const { data: categories, error: categoriesError } = await supabase.from('directory_categories').select('*').order('sort_order').order('name');
    if (!categoriesError) setDirectoryCategories(categories || []);

    let pendingQuery = supabase.from('directory').select('*').eq('status', 'pending');
    if (isScopedAmbassador) pendingQuery = pendingQuery.in('city_id', myActiveCityIds);
    const { data: pending, error: pendingError } = await pendingQuery;
    if (pendingError) {
      showAppError({ title: "Erro ao buscar sugestões pendentes", description: pendingError.message, variant: "destructive" });
    } else {
      const entries = pending || [];
      const authorIds = [...new Set(entries.map((entry) => entry.submitted_by).filter(Boolean))];
      let authors = new Map();
      if (authorIds.length > 0) {
        const { data: profiles, error: profilesError } = await supabase
          .from('profiles')
          .select('id, name, avatar_url')
          .in('id', authorIds);
        if (profilesError) {
          showAppError({ title: 'Erro ao carregar autores das sugestões', description: profilesError.message, variant: 'destructive' });
        } else {
          authors = new Map((profiles || []).map((profile) => [profile.id, profile]));
        }
      }
      setPendingEntries(entries.map((entry) => ({ ...entry, author: authors.get(entry.submitted_by) })));
    }
  }, [isScopedAmbassador, myActiveCityIds]);

  const handleCreateCategory = async () => {
    if (!newCategory.name.trim()) {
      showAppError({ title: 'Informe o nome da categoria', variant: 'destructive' });
      return;
    }
    setSavingCategory(true);
    const { error } = await supabase.from('directory_categories').insert({
      name: newCategory.name.trim(),
      city_id: null,
      parent_id: newCategory.parent_id || null,
    });
    setSavingCategory(false);
    if (error) {
      showAppError({
        title: 'Não foi possível criar a categoria',
        description: error.code === '23505' ? 'Já existe uma categoria com esse nome.' : error.message,
        variant: 'destructive',
      });
      return;
    }
    setNewCategory({ name: '', parent_id: null });
    await fetchData();
  };

  const canChangeCategory = (category) => Boolean(
    user?.is_admin || user?.is_master ||
    (category.city_id != null && isScopedAmbassador && myActiveCityIds.some((id) => String(id) === String(category.city_id)))
  );

  const handleUpdateCategory = async (event) => {
    event.preventDefault();
    if (!editingCategory || !canChangeCategory(editingCategory)) return;
    const name = editingCategory.name.trim();
    if (!name) {
      showAppError({ title: 'Informe o nome da categoria', variant: 'destructive' });
      return;
    }
    const hasChildren = directoryCategories.some((category) => String(category.parent_id) === String(editingCategory.id));
    if (hasChildren && editingCategory.parent_id) {
      showAppError({ title: 'Esta categoria possui subcategorias', description: 'Remova ou mova as subcategorias antes de alterar o nível.', variant: 'destructive' });
      return;
    }
    setSavingCategory(true);
    const { error } = await supabase.from('directory_categories')
      .update({ name, parent_id: editingCategory.parent_id || null })
      .eq('id', editingCategory.id);
    setSavingCategory(false);
    if (error) {
      showAppError({ title: 'Não foi possível editar a categoria', description: error.code === '23505' ? 'Já existe uma categoria com esse nome.' : error.message, variant: 'destructive' });
      return;
    }
    setEditingCategory(null);
    await fetchData();
  };

  const handleDeleteCategory = async () => {
    if (!deletingCategory || !canChangeCategory(deletingCategory)) return;
    setDeletingCategoryBusy(true);
    const [children, places] = await Promise.all([
      supabase.from('directory_categories').select('id', { count: 'exact', head: true }).eq('parent_id', deletingCategory.id),
      supabase.from('directory').select('id', { count: 'exact', head: true }).or(`category_id.eq.${deletingCategory.id},category_ids.cs.{${deletingCategory.id}}`),
    ]);
    if (children.error || places.error) {
      showAppError({ title: 'Não foi possível verificar a categoria', description: children.error?.message || places.error?.message, variant: 'destructive' });
    } else if (children.count || places.count) {
      showAppError({ title: 'Categoria em uso', description: `Mova ou remova ${children.count || 0} subcategoria(s) e ${places.count || 0} local(is) antes de excluir.`, variant: 'destructive' });
    } else {
      const { error } = await supabase.from('directory_categories').delete().eq('id', deletingCategory.id);
      if (error) showAppError({ title: 'Não foi possível remover a categoria', description: error.message, variant: 'destructive' });
      else {
        setDeletingCategory(null);
        await fetchData();
      }
    }
    setDeletingCategoryBusy(false);
  };

  const copyCategoryLink = async (category) => {
    try {
      const city = category.city_id || 'todas';
      await navigator.clipboard.writeText(`https://trombonecidadao.com.br/share/guia/categoria/${encodeURIComponent(category.id)}?cidade=${city}`);
      showAppNotice({ title: 'Link da categoria copiado' });
    } catch {
      showAppError({ title: 'Não foi possível copiar o link', variant: 'destructive' });
    }
  };

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Links antigos de transporte e ponto turistico encontram a copia migrada no
  // Guia; novos cadastros e edicoes acontecem somente em directory.
  useEffect(() => {
    const editId = searchParams.get('edit');
    const editType = searchParams.get('type');
    if (!editId || !editType) return;

    const legacySource = editType === 'transport' ? 'transport'
      : editType === 'tourist_spots' ? 'tourist_spots'
      : null;
    const target = editType === 'directory'
      ? directoryData.all.find((item) => String(item.id) === String(editId))
      : directoryData.all.find((item) => item.legacy_source === legacySource && String(item.legacy_source_id) === String(editId));
    if (target) {
      setActiveTab('directory');
      setEditingItem({ item: target, type: 'directory' });
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.delete('edit');
        next.delete('type');
        return next;
      }, { replace: true });
    }
  }, [searchParams, directoryData.all, setSearchParams]);

  const handleSave = async (itemToSave) => {
    const { image_file, secondary_image_file, ...dbData } = itemToSave;
    const tableName = 'directory';

    if (!dbData.city_id) {
      showAppError({ title: "Selecione uma cidade", variant: "destructive" });
      return;
    }
    if (!dbData.category_id) {
      showAppError({ title: 'Selecione uma categoria', description: 'Todo local do Guia precisa pertencer a uma categoria.', variant: 'destructive' });
      return;
    }
    if (isScopedAmbassador && !myActiveCityIds.some((id) => String(id) === String(dbData.city_id))) {
      showAppError({ title: "Fora da sua área", description: "Você só pode gerenciar itens nas suas cidades.", variant: "destructive" });
      return;
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

    if (secondary_image_file) {
      const uploadFile = await optimizeImageFile(secondary_image_file);
      const filePath = `${tableName}/secondary-${Date.now()}-${uploadFile.name}`;
      const { error: uploadError } = await supabase.storage.from('work-media').upload(filePath, uploadFile);
      if (uploadError) {
        showAppError({ title: 'Erro no upload da imagem secundária', description: uploadError.message, variant: 'destructive' });
        return;
      }
      const { data: { publicUrl } } = supabase.storage.from('work-media').getPublicUrl(filePath);
      dbData.guide_metadata = { ...dbData.guide_metadata, secondary_image_url: publicUrl };
    }

    if (dbData.id) {
      const { error } = await supabase.from(tableName).update(dbData).eq('id', dbData.id);
      if (error) { showAppError({ title: "Erro ao atualizar", description: error.message, variant: "destructive" }); return; }
    } else {
      const { error } = await supabase.from(tableName).insert(dbData);
      if (error) { showAppError({ title: "Erro ao adicionar", description: error.message, variant: "destructive" }); return; }
    }

    fetchData();
    setEditingItem(null);
  };

  const handleDelete = async () => {
    if (!deletingItem) return;
    const { item } = deletingItem;

    const { error } = await supabase.from('directory').delete().eq('id', item.id);
    if (error) {
      showAppError({ title: "Erro ao remover", description: error.message, variant: "destructive" });
    } else {
      fetchData();
    }
    setDeletingItem(null);
  };

  const handleAddNew = () => {
    setActiveTab('directory');
    setEditingItem({
      type: 'directory',
      item: {
        name: '', description: '', address: '', phone: '', instagram_url: '', location: null,
        image_url: '', type: 'commerce', status: 'approved', category_id: null, category_ids: [],
        city_id: isScopedAmbassador && myActiveCityIds.length === 1 ? myActiveCityIds[0] : null,
      },
    });
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
          <Button onClick={handleAddNew} className="gap-2">
            <PlusCircle className="w-4 h-4" /> Adicionar local
          </Button>
        </motion.div>

        <Tabs value={activeTab} className="w-full" onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-2 bg-muted/50 rounded-lg h-auto">
            <TabsTrigger value="moderation" className="gap-2 py-2"><Hourglass className="w-4 h-4" /> Moderação ({pendingEntries.length})</TabsTrigger>
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
                          <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                            <Avatar className="h-8 w-8">
                              <AvatarImage src={entry.author?.avatar_url || undefined} alt={entry.author?.name || 'Foto do usuário'} className="object-cover" />
                              <AvatarFallback>{entry.author?.name?.trim().slice(0, 1).toUpperCase() || '?'}</AvatarFallback>
                            </Avatar>
                            <span>Sugerido por <span className="font-medium text-foreground">{entry.author?.name?.trim() || 'Usuário não disponível'}</span></span>
                          </div>
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

          <TabsContent value="directory" className="mt-8 grid gap-8 lg:grid-cols-[22rem_minmax(0,1fr)]">
            <Card className="h-fit">
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Tags className="h-5 w-5 text-primary" /> Categorias</CardTitle>
                <CardDescription>Crie categorias reutilizáveis em todas as cidades, como “Igrejas · Católicas”.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3">
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
                      return <div key={category.id} className="flex items-center justify-between gap-2 rounded-lg bg-muted/50 px-3 py-2 text-xs">
                        <span className="min-w-0 font-semibold">{parent ? `${parent.name} · ` : ''}{category.name}</span>
                        <div className="flex shrink-0 items-center gap-1">
                          <Button type="button" size="icon" variant="ghost" title="Copiar link" aria-label={`Copiar link de ${category.name}`} onClick={() => copyCategoryLink(category)}><Copy className="h-3.5 w-3.5" /></Button>
                          {canChangeCategory(category) && <>
                            <Button type="button" size="icon" variant="ghost" title="Editar categoria" aria-label={`Editar ${category.name}`} onClick={() => setEditingCategory({ ...category })}><Edit className="h-3.5 w-3.5" /></Button>
                            <Button type="button" size="icon" variant="ghost" className="text-red-500 hover:text-red-600" title="Remover categoria" aria-label={`Remover ${category.name}`} onClick={() => setDeletingCategory(category)}><Trash2 className="h-3.5 w-3.5" /></Button>
                          </>}
                        </div>
                      </div>;
                    })}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex-row items-center justify-between gap-3">
                <div><CardTitle>Locais cadastrados</CardTitle><CardDescription>Comércios, igrejas, órgãos e serviços.</CardDescription></div>
                <Button size="sm" variant="outline" className="gap-2" onClick={handleAddNew}><PlusCircle className="h-4 w-4" /> Adicionar local</Button>
              </CardHeader>
              <CardContent>{renderList(directoryData.all, 'directory')}</CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {editingItem && <EditModal item={editingItem.item} onSave={handleSave} onClose={() => setEditingItem(null)} allowedCityIds={isScopedAmbassador ? myActiveCityIds : undefined} directoryCategories={directoryCategories} />}

      <Dialog open={!!editingCategory} onOpenChange={(open) => !open && setEditingCategory(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Editar categoria</DialogTitle></DialogHeader>
          {editingCategory && <form onSubmit={handleUpdateCategory} className="grid gap-4">
            <div className="grid gap-2"><Label htmlFor="edit-category-name">Nome</Label><Input id="edit-category-name" value={editingCategory.name} onChange={(event) => setEditingCategory((current) => ({ ...current, name: event.target.value }))} required /></div>
            <div className="grid gap-2"><Label>Categoria principal</Label><Combobox options={directoryCategories.filter((category) => !category.parent_id && String(category.id) !== String(editingCategory.id)).map((category) => ({ value: category.id, label: category.name }))} value={editingCategory.parent_id || ''} onChange={(value) => setEditingCategory((current) => ({ ...current, parent_id: value || null }))} placeholder="Nenhuma (categoria principal)" searchPlaceholder="Buscar categoria principal..." modal /></div>
            <DialogFooter><Button type="button" variant="outline" onClick={() => setEditingCategory(null)}>Cancelar</Button><Button type="submit" disabled={savingCategory}><Save className="mr-2 h-4 w-4" />Salvar</Button></DialogFooter>
          </form>}
        </DialogContent>
      </Dialog>

      <Dialog open={!!deletingCategory} onOpenChange={(open) => !open && !deletingCategoryBusy && setDeletingCategory(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Remover categoria</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Remover “{deletingCategory?.name}”? Categorias com subcategorias ou locais cadastrados precisam ser esvaziadas antes.</p>
          <DialogFooter><Button type="button" variant="outline" disabled={deletingCategoryBusy} onClick={() => setDeletingCategory(null)}>Cancelar</Button><Button type="button" variant="destructive" disabled={deletingCategoryBusy} onClick={handleDeleteCategory}><Trash2 className="mr-2 h-4 w-4" />Remover</Button></DialogFooter>
        </DialogContent>
      </Dialog>

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

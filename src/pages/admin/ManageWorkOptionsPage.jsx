import React, { useState, useEffect, useCallback } from 'react';
import { Helmet } from 'react-helmet';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { ArrowLeft, PlusCircle, Edit, Trash2, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/components/ui/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/lib/customSupabaseClient';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatCnpj } from '@/lib/utils';

const GenericOptionEditModal = ({ option, onSave, onClose, typeLabel }) => {
  const [name, setName] = useState('');

  useEffect(() => {
    if (option) setName(option.name || '');
  }, [option]);

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave({ ...option, name });
  };

  if (!option) return null;

  return (
    <Dialog open={!!option} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md bg-card border-border">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold text-foreground">{option.id ? 'Editar' : 'Adicionar'} {typeLabel}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            <Label htmlFor="name">Nome</Label>
            <Input id="name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <DialogFooter>
            <DialogClose asChild><Button type="button" variant="outline">Cancelar</Button></DialogClose>
            <Button type="submit"><Save className="w-4 h-4 mr-2" /> Salvar</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

const ContractorEditModal = ({ option, onSave, onClose }) => {
  const [formData, setFormData] = useState({ name: '', cnpj: '' });

  useEffect(() => {
    if (option) {
      setFormData({ name: option.name || '', cnpj: option.cnpj || '' });
    }
  }, [option]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    if (name === 'cnpj') {
      setFormData(prev => ({ ...prev, [name]: formatCnpj(value) }));
    } else {
      setFormData(prev => ({ ...prev, [name]: value }));
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave({ ...option, ...formData, cnpj: formData.cnpj.replace(/\D/g, '') });
  };

  if (!option) return null;

  return (
    <Dialog open={!!option} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md bg-card border-border">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold text-foreground">{option.id ? 'Editar' : 'Adicionar'} Construtora</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="name">Nome</Label>
              <Input id="name" name="name" value={formData.name} onChange={handleChange} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="cnpj">CNPJ</Label>
              <Input id="cnpj" name="cnpj" value={formData.cnpj} onChange={handleChange} placeholder="00.000.000/0000-00" />
            </div>
          </div>
          <DialogFooter>
            <DialogClose asChild><Button type="button" variant="outline">Cancelar</Button></DialogClose>
            <Button type="submit"><Save className="w-4 h-4 mr-2" /> Salvar</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};


const ManageWorkOptionsPage = () => {
  const { toast } = useToast();
  const [categories, setCategories] = useState([]);
  const [areas, setAreas] = useState([]);
  const [bairros, setBairros] = useState([]);
  const [contractors, setContractors] = useState([]);

  const [editingOption, setEditingOption] = useState(null);
  const [deletingOption, setDeletingOption] = useState(null);
  const [activeTab, setActiveTab] = useState('work_categories');

  const fetchData = useCallback(async (tableName, setter) => {
    const { data, error } = await supabase.from(tableName).select('*').order('name');
    if (error) toast({ title: `Erro ao buscar ${tableName}`, description: error.message, variant: "destructive" });
    else setter(data);
  }, [toast]);

  useEffect(() => {
    fetchData('work_categories', setCategories);
    fetchData('work_areas', setAreas);
    fetchData('bairros', setBairros);
    fetchData('contractors', setContractors);
  }, [fetchData]);

  const handleSave = async (option, type) => {
    const { id, ...dataToSave } = option;
    
    let error;
    if (id) {
      ({ error } = await supabase.from(type).update(dataToSave).eq('id', id));
    } else {
      ({ error } = await supabase.from(type).insert(dataToSave));
    }

    if (error) {
      toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Salvo com sucesso!" });
      const setterMap = {
        'work_categories': setCategories,
        'work_areas': setAreas,
        'bairros': setBairros,
        'contractors': setContractors,
      };
      fetchData(type, setterMap[type]);
    }
    setEditingOption(null);
  };

  const handleDelete = async () => {
    if (!deletingOption) return;
    const { option, type } = deletingOption;
    const { error } = await supabase.from(type).delete().eq('id', option.id);
    if (error) {
      toast({ title: "Erro ao remover", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Removido com sucesso!", variant: "destructive" });
      const setterMap = {
        'work_categories': setCategories,
        'work_areas': setAreas,
        'bairros': setBairros,
        'contractors': setContractors,
      };
      fetchData(type, setterMap[type]);
    }
    setDeletingOption(null);
  };

  const openEditModal = (option) => {
    setEditingOption(option);
  };

  const handleAddNew = () => {
    const emptyOption = { id: null, name: '' };
    if (activeTab === 'contractors') {
      emptyOption.cnpj = '';
    }
    openEditModal({ option: emptyOption, type: activeTab });
  };
  
  const renderList = (data, type, typeLabel) => (
    <div className="space-y-2">
      {data.map(item => (
        <div key={item.id} className="flex justify-between items-center p-3 bg-background rounded-lg border">
          <div>
            <span className="font-medium">{item.name}</span>
            {item.cnpj && <p className="text-sm text-muted-foreground">{formatCnpj(item.cnpj)}</p>}
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" size="icon" onClick={() => openEditModal({ option: item, type, typeLabel })}><Edit className="w-4 h-4" /></Button>
            <Button variant="ghost" size="icon" className="text-red-500 hover:text-red-600" onClick={() => setDeletingOption({ option: item, type })}><Trash2 className="w-4 h-4" /></Button>
          </div>
        </div>
      ))}
    </div>
  );

  return (
    <>
      <Helmet>
        <title>Opções de Obras - Admin</title>
        <meta name="description" content="Gerencie categorias, áreas, bairros e construtoras para as obras públicas." />
      </Helmet>
      <div className="container mx-auto px-4 py-12">
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="flex flex-wrap items-center justify-between gap-4 mb-12">
          <div className="flex items-center gap-4">
            <Link to="/admin/obras"><Button variant="outline" size="icon"><ArrowLeft className="w-4 h-4" /></Button></Link>
            <div>
              <h1 className="text-3xl md:text-4xl font-bold text-tc-red">Opções de Obras</h1>
              <p className="mt-2 text-lg text-muted-foreground">Gerencie categorias, áreas, bairros e construtoras.</p>
            </div>
          </div>
          <Button onClick={handleAddNew} className="gap-2">
            <PlusCircle className="w-4 h-4" /> Adicionar Novo
          </Button>
        </motion.div>

        <Tabs defaultValue="work_categories" className="w-full" onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="work_categories">Categorias</TabsTrigger>
            <TabsTrigger value="work_areas">Áreas</TabsTrigger>
            <TabsTrigger value="bairros">Bairros</TabsTrigger>
            <TabsTrigger value="contractors">Construtoras</TabsTrigger>
          </TabsList>
          <TabsContent value="work_categories" className="mt-6">
            <Card><CardHeader><CardTitle>Categorias de Obras</CardTitle></CardHeader><CardContent>{renderList(categories, 'work_categories', 'Categoria')}</CardContent></Card>
          </TabsContent>
          <TabsContent value="work_areas" className="mt-6">
            <Card><CardHeader><CardTitle>Áreas de Implementação</CardTitle></CardHeader><CardContent>{renderList(areas, 'work_areas', 'Área')}</CardContent></Card>
          </TabsContent>
          <TabsContent value="bairros" className="mt-6">
            <Card><CardHeader><CardTitle>Bairros</CardTitle></CardHeader><CardContent>{renderList(bairros, 'bairros', 'Bairro')}</CardContent></Card>
          </TabsContent>
          <TabsContent value="contractors" className="mt-6">
            <Card><CardHeader><CardTitle>Construtoras</CardTitle></CardHeader><CardContent>{renderList(contractors, 'contractors', 'Construtora')}</CardContent></Card>
          </TabsContent>
        </Tabs>
      </div>
      
      {editingOption && editingOption.type === 'contractors' ? (
        <ContractorEditModal 
          option={editingOption.option}
          onSave={(option) => handleSave(option, 'contractors')}
          onClose={() => setEditingOption(null)}
        />
      ) : editingOption ? (
        <GenericOptionEditModal 
          option={editingOption.option}
          typeLabel={editingOption.typeLabel}
          onSave={(option) => handleSave(option, editingOption.type)}
          onClose={() => setEditingOption(null)}
        />
      ) : null}

      <Dialog open={!!deletingOption} onOpenChange={(open) => !open && setDeletingOption(null)}>
        <DialogContent className="sm:max-w-md bg-card border-border">
          <DialogHeader><DialogTitle className="text-xl font-bold text-foreground">Confirmar Exclusão</DialogTitle></DialogHeader>
          <p className="text-muted-foreground">Tem certeza que deseja remover "{deletingOption?.option.name}"? Esta ação não pode ser desfeita.</p>
          <DialogFooter className="sm:justify-end gap-2">
            <DialogClose asChild><Button type="button" variant="outline">Cancelar</Button></DialogClose>
            <Button type="button" variant="destructive" onClick={handleDelete}><Trash2 className="w-4 h-4 mr-2" /> Remover</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default ManageWorkOptionsPage;
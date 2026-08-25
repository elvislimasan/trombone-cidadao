import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Helmet } from 'react-helmet';
import { Link } from 'react-router-dom';
import { ArrowLeft, PlusCircle, Edit, Trash2, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { showAppError } from '@/lib/appError';

const initialCategories = [
  { id: 'iluminacao', name: 'Iluminação', icon: '💡' },
  { id: 'buracos', name: 'Buracos', icon: '🕳️' },
  { id: 'esgoto', name: 'Esgoto', icon: '🚰' },
  { id: 'limpeza', name: 'Limpeza', icon: '🧹' },
  { id: 'poda', name: 'Poda de Árvore', icon: '🌳' },
  { id: 'vazamento', name: 'Vazamento de Água', icon: '💧' },
  { id: 'outros', name: 'Outros', icon: '📍' }
];

const CategoryEditModal = ({ category, onSave, onClose }) => {
  const [formData, setFormData] = useState(null);

  useEffect(() => {
    if (category) {
      setFormData({ ...category });
    } else {
      setFormData(null);
    }
  }, [category]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!formData.name || !formData.icon) {
      showAppError({ title: "Campos obrigatórios", description: "Nome e ícone são necessários.", variant: "destructive" });
      return;
    }
    onSave(formData);
  };

  if (!formData) return null;

  return (
    <Dialog open={!!category} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md bg-card border-border">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold text-foreground">{formData.id ? 'Editar Categoria' : 'Adicionar Nova Categoria'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="grid gap-6 py-4">
          <div className="grid gap-2">
            <Label htmlFor="name">Nome da Categoria</Label>
            <Input id="name" name="name" value={formData.name} onChange={handleChange} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="icon">Ícone (Emoji)</Label>
            <Input id="icon" name="icon" value={formData.icon} onChange={handleChange} />
          </div>
          <DialogFooter>
            <DialogClose asChild><Button type="button" variant="outline">Cancelar</Button></DialogClose>
            <Button type="submit" className="gap-2"><Save className="w-4 h-4" /> Salvar</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

const ManageCategoriesPage = () => {
  const [categories, setCategories] = useState([]);
  const [editingCategory, setEditingCategory] = useState(null);
  const [deletingCategory, setDeletingCategory] = useState(null);

  useEffect(() => {
    const savedCategories = localStorage.getItem('report-categories');
    if (savedCategories) {
      setCategories(JSON.parse(savedCategories));
    } else {
      setCategories(initialCategories);
      localStorage.setItem('report-categories', JSON.stringify(initialCategories));
    }
  }, []);

  const updateCategoriesData = (newCategories) => {
    setCategories(newCategories);
    localStorage.setItem('report-categories', JSON.stringify(newCategories));
  };

  const handleSaveCategory = (categoryToSave) => {
    let updatedCategories;
    if (categoryToSave.id) {
      updatedCategories = categories.map(c => c.id === categoryToSave.id ? categoryToSave : c);
    } else {
      const newCategory = { ...categoryToSave, id: categoryToSave.name.toLowerCase().replace(/\s+/g, '-') };
      updatedCategories = [...categories, newCategory];
    }
    updateCategoriesData(updatedCategories);
    setEditingCategory(null);
  };

  const handleAddNewCategory = () => {
    setEditingCategory({ id: null, name: '', icon: '' });
  };

  const handleDeleteCategory = (categoryId) => {
    const updatedCategories = categories.filter(c => c.id !== categoryId);
    updateCategoriesData(updatedCategories);
    setDeletingCategory(null);
  };

  return (
    <>
      <Helmet>
        <title>Gerenciar Categorias - Admin</title>
        <meta name="description" content="Gerencie as categorias de broncas da plataforma." />
      </Helmet>
      <div className="container mx-auto px-4 py-12">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-wrap items-center justify-between gap-4 mb-12"
        >
          <div className="flex items-center gap-4">
            <Link to="/admin">
              <Button variant="outline" size="icon"><ArrowLeft className="w-4 h-4" /></Button>
            </Link>
            <div>
              <h1 className="text-3xl md:text-4xl font-bold text-tc-red">Gerenciar Categorias</h1>
              <p className="mt-2 text-lg text-muted-foreground">Adicione, edite ou remova categorias de broncas.</p>
            </div>
          </div>
          <Button onClick={handleAddNewCategory} className="gap-2">
            <PlusCircle className="w-4 h-4" /> Adicionar Categoria
          </Button>
        </motion.div>

        <Card>
          <CardHeader><CardTitle>Categorias Cadastradas</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-3">
              {categories.map(category => (
                <div key={category.id} className="flex flex-col sm:flex-row justify-between items-start sm:items-center p-4 bg-background rounded-lg border gap-4">
                  <div className="flex items-center gap-4">
                    <span className="text-2xl">{category.icon}</span>
                    <p className="font-semibold">{category.name}</p>
                  </div>
                  <div className="flex-shrink-0 flex gap-2">
                    <Button variant="ghost" size="icon" onClick={() => setEditingCategory(category)}><Edit className="w-4 h-4" /></Button>
                    <Button variant="ghost" size="icon" className="text-red-500 hover:text-red-600" onClick={() => setDeletingCategory(category)}><Trash2 className="w-4 h-4" /></Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <CategoryEditModal
        category={editingCategory}
        onSave={handleSaveCategory}
        onClose={() => setEditingCategory(null)}
      />

      <Dialog open={!!deletingCategory} onOpenChange={(open) => !open && setDeletingCategory(null)}>
        <DialogContent className="sm:max-w-md bg-card border-border">
          <DialogHeader><DialogTitle className="text-xl font-bold text-foreground">Confirmar Exclusão</DialogTitle></DialogHeader>
          <p className="text-muted-foreground">Tem certeza que deseja remover a categoria "{deletingCategory?.name}"? Esta ação não pode ser desfeita.</p>
          <DialogFooter className="sm:justify-end gap-2">
            <DialogClose asChild><Button type="button" variant="outline">Cancelar</Button></DialogClose>
            <Button type="button" variant="destructive" onClick={() => handleDeleteCategory(deletingCategory.id)}>
              <Trash2 className="w-4 h-4 mr-2" /> Remover
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default ManageCategoriesPage;

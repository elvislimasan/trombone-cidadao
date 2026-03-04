import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { useToast } from '@/components/ui/use-toast';
import { PlusCircle, Edit, Trash2, Calendar, FileText, Briefcase, DollarSign, Percent, ArrowLeft, Save } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';

export function WorkMeasurementsTab({ workId, contractors = [] }) {
  const [measurements, setMeasurements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [currentMeasurement, setCurrentMeasurement] = useState(null);
  const { toast } = useToast();

  const [formData, setFormData] = useState({
    title: '',
    description: '',
    contractor_id: '',
    contract_date: '',
    start_date: '',
    end_date: '',
    value: '',
    execution_percentage: '',
    status: 'planned'
  });

  useEffect(() => {
    if (workId) {
      fetchMeasurements();
    }
  }, [workId]);

  const fetchMeasurements = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('public_work_measurements')
        .select(`
          *,
          contractor:contractors(id, name)
        `)
        .eq('work_id', workId)
        .order('created_at', { ascending: true });

      if (error) throw error;
      setMeasurements(data || []);
    } catch (error) {
      console.error('Error fetching measurements:', error);
      toast({
        title: "Erro ao carregar medições",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (measurement = null) => {
    if (measurement) {
      setCurrentMeasurement(measurement);
      setFormData({
        title: measurement.title,
        description: measurement.description || '',
        contractor_id: measurement.contractor_id || '',
        contract_date: measurement.contract_date || '',
        start_date: measurement.start_date || '',
        end_date: measurement.end_date || '',
        value: measurement.value || '',
        execution_percentage: measurement.execution_percentage || '',
        status: measurement.status || 'planned'
      });
    } else {
      setCurrentMeasurement(null);
      setFormData({
        title: '',
        description: '',
        contractor_id: '',
        contract_date: '',
        start_date: '',
        end_date: '',
        value: '',
        execution_percentage: '',
        status: 'planned'
      });
    }
    setIsEditing(true);
  };

  const handleCancel = () => {
    setIsEditing(false);
    setCurrentMeasurement(null);
  };

  const handleSave = async () => {
    try {
      if (!formData.title) {
        toast({
          title: "Erro de validação",
          description: "O título é obrigatório.",
          variant: "destructive"
        });
        return;
      }

      const payload = {
        work_id: workId,
        title: formData.title,
        description: formData.description || null,
        contractor_id: formData.contractor_id || null,
        contract_date: formData.contract_date || null,
        start_date: formData.start_date || null,
        end_date: formData.end_date || null,
        value: formData.value ? Number(formData.value) : null,
        execution_percentage: formData.execution_percentage ? Number(formData.execution_percentage) : null,
        status: formData.status
      };

      let error;
      if (currentMeasurement) {
        const { error: updateError } = await supabase
          .from('public_work_measurements')
          .update(payload)
          .eq('id', currentMeasurement.id);
        error = updateError;
      } else {
        const { error: insertError } = await supabase
          .from('public_work_measurements')
          .insert([payload]);
        error = insertError;
      }

      if (error) throw error;

      toast({
        title: "Sucesso",
        description: `Medição ${currentMeasurement ? 'atualizada' : 'criada'} com sucesso.`
      });
      setIsEditing(false);
      fetchMeasurements();
    } catch (error) {
      console.error('Error saving measurement:', error);
      toast({
        title: "Erro ao salvar",
        description: error.message,
        variant: "destructive"
      });
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Tem certeza que deseja excluir esta medição?')) return;

    try {
      const { error } = await supabase
        .from('public_work_measurements')
        .delete()
        .eq('id', id);

      if (error) throw error;

      toast({
        title: "Sucesso",
        description: "Medição excluída com sucesso."
      });
      fetchMeasurements();
    } catch (error) {
      console.error('Error deleting measurement:', error);
      toast({
        title: "Erro ao excluir",
        description: error.message,
        variant: "destructive"
      });
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSelectChange = (name, value) => {
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const getStatusLabel = (status) => {
    const map = {
      'planned': 'Planejada',
      'tendered': 'Licitada',
      'in-progress': 'Em Andamento',
      'stalled': 'Paralisada',
      'unfinished': 'Inacabada',
      'completed': 'Concluída'
    };
    return map[status] || status;
  };

  if (isEditing) {
    return (
      <Card className="border-l-4 border-l-primary shadow-sm">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>{currentMeasurement ? 'Editar Medição/Fase' : 'Nova Medição/Fase'}</CardTitle>
              <CardDescription>
                {currentMeasurement ? 'Atualize as informações desta fase.' : 'Adicione uma nova fase ou contrato para esta obra.'}
              </CardDescription>
            </div>
            <Button variant="ghost" size="sm" onClick={handleCancel}>
              <ArrowLeft className="w-4 h-4 mr-2" /> Voltar
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="title">Título da Fase/Contrato *</Label>
              <Input 
                id="title" 
                name="title" 
                value={formData.title} 
                onChange={handleChange} 
                placeholder="Ex: 1ª Licitação, Retomada 2024, Medição Final" 
              />
            </div>
            
            <div className="grid gap-2">
              <Label htmlFor="description">Descrição</Label>
              <Textarea 
                id="description" 
                name="description" 
                value={formData.description} 
                onChange={handleChange} 
                placeholder="Detalhes sobre o que foi realizado nesta fase..." 
                rows={3}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="contractor_id">Construtora Responsável</Label>
                <Select 
                  name="contractor_id" 
                  value={formData.contractor_id} 
                  onValueChange={(v) => handleSelectChange('contractor_id', v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione..." />
                  </SelectTrigger>
                  <SelectContent>
                    {contractors.map(c => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="status">Status da Fase</Label>
                <Select 
                  name="status" 
                  value={formData.status} 
                  onValueChange={(v) => handleSelectChange('status', v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="planned">Planejada</SelectItem>
                    <SelectItem value="tendered">Licitada</SelectItem>
                    <SelectItem value="in-progress">Em Andamento</SelectItem>
                    <SelectItem value="stalled">Paralisada</SelectItem>
                    <SelectItem value="unfinished">Inacabada</SelectItem>
                    <SelectItem value="completed">Concluída</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="value">Valor (R$)</Label>
                <Input 
                  id="value" 
                  name="value" 
                  type="number" 
                  value={formData.value} 
                  onChange={handleChange} 
                  placeholder="0.00"
                />
              </div>
              
              <div className="grid gap-2">
                <Label htmlFor="execution_percentage">Execução Realizada (%)</Label>
                <Input 
                  id="execution_percentage" 
                  name="execution_percentage" 
                  type="number" 
                  min="0" 
                  max="100" 
                  value={formData.execution_percentage} 
                  onChange={handleChange} 
                  placeholder="0-100"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="contract_date">Data Contrato</Label>
                <Input 
                  id="contract_date" 
                  name="contract_date" 
                  type="date" 
                  value={formData.contract_date} 
                  onChange={handleChange} 
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="start_date">Data Início</Label>
                <Input 
                  id="start_date" 
                  name="start_date" 
                  type="date" 
                  value={formData.start_date} 
                  onChange={handleChange} 
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="end_date">Data Fim</Label>
                <Input 
                  id="end_date" 
                  name="end_date" 
                  type="date" 
                  value={formData.end_date} 
                  onChange={handleChange} 
                />
              </div>
            </div>
          </div>
        </CardContent>
        <CardFooter className="flex justify-end gap-2 border-t pt-4">
          <Button variant="outline" onClick={handleCancel}>Cancelar</Button>
          <Button onClick={handleSave} className="gap-2">
            <Save className="w-4 h-4" />
            Salvar Fase
          </Button>
        </CardFooter>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-medium">Histórico de Medições e Contratos</h3>
        <Button onClick={() => handleEdit()} className="gap-2">
          <PlusCircle className="w-4 h-4" />
          Adicionar Fase/Contrato
        </Button>
      </div>

      {loading ? (
        <div className="text-center py-4">Carregando medições...</div>
      ) : measurements.length === 0 ? (
        <Card className="bg-muted/50 border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-8 text-center text-muted-foreground">
            <Briefcase className="w-10 h-10 mb-2 opacity-50" />
            <p>Nenhuma medição ou contrato registrado para esta obra.</p>
            <Button variant="link" onClick={() => handleEdit()}>
              Adicionar o primeiro registro
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {measurements.map((measurement) => (
            <Card key={measurement.id} className="overflow-hidden hover:border-primary/50 transition-colors">
              <div className="bg-muted/30 p-4 flex flex-col sm:flex-row justify-between gap-4 border-b">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <h4 className="font-semibold text-base">{measurement.title}</h4>
                    <span className={`text-xs px-2 py-0.5 rounded-full border ${
                      measurement.status === 'completed' ? 'bg-green-100 text-green-700 border-green-200' :
                      measurement.status === 'in-progress' ? 'bg-blue-100 text-blue-700 border-blue-200' :
                      measurement.status === 'stalled' ? 'bg-red-100 text-red-700 border-red-200' :
                      'bg-gray-100 text-gray-700 border-gray-200'
                    }`}>
                      {getStatusLabel(measurement.status)}
                    </span>
                  </div>
                  {measurement.contractor && (
                    <div className="flex items-center gap-1 text-sm text-muted-foreground">
                      <Briefcase className="w-3 h-3" />
                      {measurement.contractor.name}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="ghost" size="sm" onClick={() => handleEdit(measurement)}>
                    <Edit className="w-4 h-4 mr-1" /> Editar
                  </Button>
                  <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => handleDelete(measurement.id)}>
                    <Trash2 className="w-4 h-4 mr-1" /> Excluir
                  </Button>
                </div>
              </div>
              <CardContent className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground block mb-1">Valor do Contrato</span>
                  <span className="font-medium flex items-center gap-1">
                    <DollarSign className="w-3 h-3 text-muted-foreground" />
                    {measurement.value ? formatCurrency(measurement.value) : '-'}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground block mb-1">Execução</span>
                  <span className="font-medium flex items-center gap-1">
                    <Percent className="w-3 h-3 text-muted-foreground" />
                    {measurement.execution_percentage !== null ? `${measurement.execution_percentage}%` : '-'}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground block mb-1">Data Contrato</span>
                  <span className="font-medium flex items-center gap-1">
                    <Calendar className="w-3 h-3 text-muted-foreground" />
                    {measurement.contract_date ? new Date(measurement.contract_date).toLocaleDateString('pt-BR') : '-'}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground block mb-1">Período</span>
                  <span className="font-medium block">
                    {measurement.start_date ? new Date(measurement.start_date).toLocaleDateString('pt-BR') : '?'} 
                    {' até '} 
                    {measurement.end_date ? new Date(measurement.end_date).toLocaleDateString('pt-BR') : '?'}
                  </span>
                </div>
                {measurement.description && (
                  <div className="col-span-full mt-2 pt-2 border-t">
                    <span className="text-muted-foreground block mb-1">Descrição</span>
                    <p className="text-muted-foreground/80">{measurement.description}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

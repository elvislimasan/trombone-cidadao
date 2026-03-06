import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Combobox } from '@/components/ui/combobox';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { useToast } from '@/components/ui/use-toast';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { PlusCircle, Edit, Trash2, Calendar, FileText, Briefcase, DollarSign, Percent, ArrowLeft, Save } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';

export function WorkMeasurementsTab({ workId, contractors = [], onEditingChange }) {
  const [measurements, setMeasurements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [currentMeasurement, setCurrentMeasurement] = useState(null);
  const [errors, setErrors] = useState({});
  const { toast } = useToast();
  const { user } = useAuth();

  const [formData, setFormData] = useState({
    title: '',
    description: '',
    contractor_id: '',
    contract_date: '',
    start_date: '',
    end_date: '',
    value: '',
    execution_percentage: '',
    status: 'planned',
    predicted_start_date: '',
    service_order_date: '',
    contract_signature_date: '',
    expected_end_date: '',
    inauguration_date: '',
    stalled_date: ''
  });

  // Auto-save & Restore Draft Logic
  useEffect(() => {
    // Restore draft on mount
    const savedDraft = localStorage.getItem(`measurement_draft_${workId}`);
    if (savedDraft && !isEditing) {
      try {
        const draft = JSON.parse(savedDraft);
        if (draft.workId === workId) {
          setFormData(draft.formData);
          if (draft.measurementId) {
            // Reconstruct minimal currentMeasurement object needed for logic
            setCurrentMeasurement({ id: draft.measurementId, ...draft.formData });
          } else {
            setCurrentMeasurement(null);
          }
          setIsEditing(true);
          // toast({ title: "Rascunho restaurado", description: "Continuando edição da medição." });
        }
      } catch (e) {
        console.error("Erro ao restaurar rascunho de medição", e);
      }
    }
  }, [workId]); // Run once when workId changes/mounts

  useEffect(() => {
    // Save draft while editing
    if (isEditing && formData) {
      const draft = {
        workId,
        measurementId: currentMeasurement?.id || null,
        formData
      };
      localStorage.setItem(`measurement_draft_${workId}`, JSON.stringify(draft));
    }
  }, [isEditing, formData, currentMeasurement, workId]);

  const clearDraft = () => {
    localStorage.removeItem(`measurement_draft_${workId}`);
  };

  useEffect(() => {
    if (onEditingChange) {
      onEditingChange(isEditing);
    }
  }, [isEditing, onEditingChange]);

  const [measurementMedia, setMeasurementMedia] = useState([]);
  const [isUploading, setIsUploading] = useState(false);
  const [customGalleryName, setCustomGalleryName] = useState('');

  const [selectedFiles, setSelectedFiles] = useState([]);

  useEffect(() => {
    if (workId) {
      fetchMeasurements();
    }
  }, [workId]);

  useEffect(() => {
    if (currentMeasurement) {
      setCustomGalleryName('');
      fetchMeasurementMedia(currentMeasurement.id);
      setSelectedFiles([]);
    } else {
      setMeasurementMedia([]);
      setCustomGalleryName('');
      setSelectedFiles([]);
    }
  }, [currentMeasurement]);

  const validateDates = (data) => {
    const newErrors = {};
    
    const start = data.start_date;
    const end = data.end_date;
    const predictedStart = data.predicted_start_date;
    const expectedEnd = data.expected_end_date;

    if (start && end && start > end) {
      newErrors.start_date = "Início posterior ao término.";
      newErrors.end_date = "Término anterior ao início.";
    }

    if (predictedStart && expectedEnd && predictedStart > expectedEnd) {
      newErrors.predicted_start_date = "Início posterior à conclusão.";
      newErrors.expected_end_date = "Conclusão anterior ao início.";
    }

    return newErrors;
  };

  const fetchMeasurementMedia = async (measurementId) => {
    try {
      const { data, error } = await supabase
        .from('public_work_media')
        .select('*')
        .eq('measurement_id', measurementId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setMeasurementMedia(data || []);
    } catch (error) {
      console.error('Error fetching measurement media:', error);
      toast({
        title: "Erro ao carregar mídias",
        description: error.message,
        variant: "destructive"
      });
    }
  };

  const uploadFilesToSupabase = async (files, measurementId) => {
    if (!files || files.length === 0) return;

    setIsUploading(true);
    try {
      for (const file of files) {
        const fileExt = file.name.split('.').pop();
        const fileName = `${Date.now()}-${Math.random().toString(36).substring(2, 15)}.${fileExt}`;
        const filePath = `measurements/${measurementId}/${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from('work-media')
          .upload(filePath, file);

        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabase.storage
          .from('work-media')
          .getPublicUrl(filePath);

        let type = 'file';
        if (file.type.startsWith('image')) type = 'photo';
        else if (file.type.startsWith('video')) type = 'video';
        else if (file.type === 'application/pdf') type = 'pdf';

        const { error: dbError } = await supabase
          .from('public_work_media')
          .insert({
            work_id: workId,
            measurement_id: measurementId,
            url: publicUrl,
            type: type,
            name: file.name,
            status: 'approved', // Admin upload is auto-approved
            gallery_name: customGalleryName || (currentMeasurement ? currentMeasurement.title : formData.title) || 'Geral',
            contributor_id: user?.id
          });

        if (dbError) throw dbError;
      }

      toast({
        title: "Sucesso",
        description: "Mídias enviadas com sucesso!"
      });
      
      if (currentMeasurement && currentMeasurement.id === measurementId) {
        fetchMeasurementMedia(measurementId);
      }
    } catch (error) {
      console.error('Error uploading media:', error);
      toast({
        title: "Erro no upload",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setIsUploading(false);
    }
  };

  const handleFileSelect = async (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    if (currentMeasurement) {
      await uploadFilesToSupabase(files, currentMeasurement.id);
      // Reset input
      e.target.value = '';
    } else {
      // Local selection for new measurement
      setSelectedFiles(prev => [...prev, ...files]);
      // Reset input to allow selecting the same file again if needed (though tricky with state)
      e.target.value = '';
    }
  };

  const removeSelectedFile = (index) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleDeleteMedia = async (mediaId, path) => {
    if (!confirm('Tem certeza que deseja excluir esta mídia?')) return;

    try {
      const { error } = await supabase
        .from('public_work_media')
        .delete()
        .eq('id', mediaId);

      if (error) throw error;

      // Note: We're not deleting from storage here to keep it simple/safe, 
      // but ideally we should delete the file from storage too if it's not used elsewhere.

      toast({
        title: "Sucesso",
        description: "Mídia removida com sucesso."
      });
      
      if (currentMeasurement) {
        fetchMeasurementMedia(currentMeasurement.id);
      }
    } catch (error) {
      console.error('Error deleting media:', error);
      toast({
        title: "Erro ao excluir",
        description: error.message,
        variant: "destructive"
      });
    }
  };

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
        status: measurement.status || 'planned',
        predicted_start_date: measurement.predicted_start_date || '',
        service_order_date: measurement.service_order_date || '',
        contract_signature_date: measurement.contract_signature_date || '',
        expected_end_date: measurement.expected_end_date || '',
        inauguration_date: measurement.inauguration_date || '',
        stalled_date: measurement.stalled_date || ''
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
        status: 'planned',
        predicted_start_date: '',
        service_order_date: '',
        contract_signature_date: '',
        expected_end_date: '',
        inauguration_date: '',
        stalled_date: ''
      });
    }
    setIsEditing(true);
    setErrors({});
  };

  const handleCancel = () => {
    setIsEditing(false);
    setCurrentMeasurement(null);
    setMeasurementMedia([]);
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

      const dateErrors = validateDates(formData);
      if (Object.keys(dateErrors).length > 0) {
        setErrors(dateErrors);
        toast({
          title: "Erro de validação",
          description: "Verifique as datas inseridas.",
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
        status: formData.status,
        predicted_start_date: formData.predicted_start_date || null,
        service_order_date: formData.service_order_date || null,
        contract_signature_date: formData.contract_signature_date || null,
        expected_end_date: formData.expected_end_date || null,
        inauguration_date: formData.inauguration_date || null,
        stalled_date: formData.stalled_date || null
      };

      let error;
      let savedData;

      if (currentMeasurement) {
        const { data, error: updateError } = await supabase
          .from('public_work_measurements')
          .update(payload)
          .eq('id', currentMeasurement.id)
          .select()
          .single();
        error = updateError;
        savedData = data;
      } else {
        const { data: newMeasurement, error: insertError } = await supabase
          .from('public_work_measurements')
          .insert([payload])
          .select()
          .single();
        error = insertError;
        savedData = newMeasurement;
      }

      if (error) throw error;

      // Upload pending files if any
      if (selectedFiles.length > 0) {
        toast({
          title: "Enviando mídias...",
          description: "Aguarde enquanto as fotos e documentos são enviados.",
        });
        await uploadFilesToSupabase(selectedFiles, savedData.id);
      }

      toast({
        title: "Sucesso",
        description: `Medição ${currentMeasurement ? 'atualizada' : 'criada'} com sucesso.`
      });
      
      await fetchMeasurements();

      // Close modal and reset
      clearDraft();
      setIsEditing(false);
      setCurrentMeasurement(null);
      setMeasurementMedia([]);
      setSelectedFiles([]);
      
    } catch (error) {
      console.error('Error saving measurement:', error);
      toast({
        title: "Erro ao salvar",
        description: error.message || "Ocorreu um erro desconhecido ao salvar.",
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
    setFormData(prev => {
      const newData = { ...prev, [name]: value };
      if (errors[name]) {
        setErrors(prevErrors => ({ ...prevErrors, [name]: null }));
      }
      return newData;
    });
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
                <Combobox 
                  value={formData.contractor_id} 
                  onChange={(v) => handleSelectChange('contractor_id', v)}
                  options={contractors.map(c => ({ value: c.id, label: c.name }))}
                  placeholder="Selecione..."
                  searchPlaceholder="Buscar construtora..."
                  modal
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="status">Status da Fase</Label>
                <Combobox 
                  value={formData.status} 
                  onChange={(v) => handleSelectChange('status', v)}
                  options={[
                    { value: 'planned', label: 'Planejada' },
                    { value: 'tendered', label: 'Licitada' },
                    { value: 'in-progress', label: 'Em Andamento' },
                    { value: 'stalled', label: 'Paralisada' },
                    { value: 'unfinished', label: 'Inacabada' },
                    { value: 'completed', label: 'Concluída' }
                  ]}
                  placeholder="Selecione..."
                  searchPlaceholder="Buscar status..."
                  modal
                />
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

            <div className="border-t pt-4 mt-4">
              <Label className="mb-4 block text-base font-semibold text-slate-700">
                Datas e Prazos ({getStatusLabel(formData.status)})
              </Label>
              
              <div className="space-y-4">
                {/* Grupo 1: Marcos Contratuais */}
                <div>
                  <h5 className="text-sm font-medium text-slate-500 mb-2 border-b pb-1">Marcos Contratuais</h5>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    <div className="grid gap-2">
                      <Label htmlFor="contract_date">Data Publicação</Label>
                      <Input 
                        id="contract_date" 
                        name="contract_date" 
                        type="date" 
                        value={formData.contract_date} 
                        onChange={handleChange} 
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="contract_signature_date">Assinatura Contrato</Label>
                      <Input 
                        id="contract_signature_date" 
                        name="contract_signature_date" 
                        type="date" 
                        value={formData.contract_signature_date} 
                        onChange={handleChange} 
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="service_order_date">Ordem de Serviço</Label>
                      <Input 
                        id="service_order_date" 
                        name="service_order_date" 
                        type="date" 
                        value={formData.service_order_date} 
                        onChange={handleChange} 
                      />
                    </div>
                  </div>
                </div>

                {/* Grupo 2: Previsões e Prazos */}
                <div>
                  <h5 className="text-sm font-medium text-slate-500 mb-2 border-b pb-1">Previsões e Prazos</h5>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    <div className="grid gap-2">
                      <Label htmlFor="predicted_start_date">Previsão Início</Label>
                      <Input 
                        id="predicted_start_date" 
                        name="predicted_start_date" 
                        type="date" 
                        value={formData.predicted_start_date} 
                        onChange={handleChange} 
                        className={errors.predicted_start_date ? "border-red-500" : ""}
                      />
                      {errors.predicted_start_date && <p className="text-xs text-red-500">{errors.predicted_start_date}</p>}
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="expected_end_date">Previsão Conclusão</Label>
                      <Input 
                        id="expected_end_date" 
                        name="expected_end_date" 
                        type="date" 
                        value={formData.expected_end_date} 
                        onChange={handleChange} 
                        className={errors.expected_end_date ? "border-red-500" : ""}
                      />
                      {errors.expected_end_date && <p className="text-xs text-red-500">{errors.expected_end_date}</p>}
                    </div>
                  </div>
                </div>

                {/* Grupo 3: Execução Real */}
                <div>
                  <h5 className="text-sm font-medium text-slate-500 mb-2 border-b pb-1">Execução Real</h5>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    <div className="grid gap-2">
                      <Label htmlFor="start_date">Data Início Real</Label>
                      <Input 
                        id="start_date" 
                        name="start_date" 
                        type="date" 
                        value={formData.start_date} 
                        onChange={handleChange} 
                        className={errors.start_date ? "border-red-500" : ""}
                      />
                      {errors.start_date && <p className="text-xs text-red-500">{errors.start_date}</p>}
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="end_date">Data Término/Encerramento</Label>
                      <Input 
                        id="end_date" 
                        name="end_date" 
                        type="date" 
                        value={formData.end_date} 
                        onChange={handleChange} 
                        className={errors.end_date ? "border-red-500" : ""}
                      />
                      {errors.end_date && <p className="text-xs text-red-500">{errors.end_date}</p>}
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="inauguration_date">Data Inauguração</Label>
                      <Input 
                        id="inauguration_date" 
                        name="inauguration_date" 
                        type="date" 
                        value={formData.inauguration_date} 
                        onChange={handleChange} 
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="stalled_date">Data Paralisação</Label>
                      <Input 
                        id="stalled_date" 
                        name="stalled_date" 
                        type="date" 
                        value={formData.stalled_date} 
                        onChange={handleChange} 
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="pt-6 border-t mt-4">
              <h4 className="font-medium mb-4 flex items-center gap-2">
                <FileText className="w-4 h-4" /> 
                Galeria de Fotos e Documentos da Fase
              </h4>

              <div className="mb-4">
                <Label htmlFor="gallery_name" className="mb-2 block">Nome da Galeria (Opcional)</Label>
                <Input 
                  id="gallery_name"
                  placeholder={`Ex: "Visita Técnica", "Medição 01" (Padrão: ${formData.title || 'Geral'})`}
                  value={customGalleryName}
                  onChange={(e) => setCustomGalleryName(e.target.value)}
                  className="mb-4"
                />

                <Label htmlFor="media-upload" className="cursor-pointer">
                  <div className="border-2 border-dashed rounded-lg p-6 flex flex-col items-center justify-center gap-2 hover:bg-muted/50 transition-colors">
                    <PlusCircle className="w-8 h-8 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">Clique para adicionar fotos ou documentos</span>
                  </div>
                  <Input 
                    id="media-upload" 
                    type="file" 
                    multiple 
                    className="hidden" 
                    onChange={handleFileSelect}
                    disabled={isUploading}
                  />
                </Label>
                {isUploading && <p className="text-xs text-muted-foreground mt-2 animate-pulse">Enviando arquivos...</p>}
              </div>

              {/* Display Pending Files (Create Mode) */}
              {!currentMeasurement && selectedFiles.length > 0 && (
                <div className="space-y-4 mb-6">
                  <h5 className="font-semibold text-sm text-slate-700 mb-2 border-l-4 border-yellow-500 pl-2">
                    Arquivos Selecionados (Serão enviados ao salvar)
                  </h5>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    {selectedFiles.map((file, index) => (
                      <div key={index} className="relative group border rounded-md overflow-hidden aspect-square bg-white shadow-sm">
                        {file.type.startsWith('image/') ? (
                          <img src={URL.createObjectURL(file)} alt={file.name} className="w-full h-full object-cover" />
                        ) : (
                          <div className="flex flex-col items-center justify-center h-full p-2 text-center">
                            <FileText className="w-8 h-8 mb-2 opacity-50" />
                            <span className="text-xs truncate w-full">{file.name}</span>
                          </div>
                        )}
                        <Button
                          variant="destructive"
                          size="icon"
                          type="button"
                          className="absolute top-1 right-1 w-6 h-6 opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={() => removeSelectedFile(index)}
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                        <div className="absolute bottom-0 left-0 right-0 bg-black/50 text-white text-[10px] p-1 truncate opacity-0 group-hover:opacity-100 transition-opacity">
                          {file.name}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Display Uploaded Media (Edit/View Mode) */}
              {currentMeasurement && (
                measurementMedia.length > 0 ? (
                  <div className="space-y-6">
                    {(() => {
                      const groups = {};
                      measurementMedia.forEach(media => {
                        const name = media.gallery_name || 'Geral';
                        if (!groups[name]) groups[name] = [];
                        groups[name].push(media);
                      });

                      const sortedGroups = Object.entries(groups).sort((a, b) => {
                         if (a[0] === currentMeasurement.title) return -1;
                         if (a[0] === 'Geral') return -1;
                         return a[0].localeCompare(b[0]);
                      });

                      return sortedGroups.map(([groupName, items]) => (
                        <div key={groupName} className="border rounded-lg p-3 bg-slate-50/50">
                          <h5 className="font-semibold text-sm text-slate-700 mb-3 border-l-4 border-primary pl-2 flex items-center justify-between">
                            {groupName}
                            <span className="text-xs font-normal text-muted-foreground bg-white px-2 py-0.5 rounded border">
                              {items.length} arquivo(s)
                            </span>
                          </h5>
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                            {items.map((media) => (
                              <div key={media.id} className="relative group border rounded-md overflow-hidden aspect-square bg-white shadow-sm">
                                {media.type === 'photo' || media.type === 'image' ? (
                                  <img src={media.url} alt={media.name} className="w-full h-full object-cover" />
                                ) : (
                                  <div className="flex flex-col items-center justify-center h-full p-2 text-center">
                                    <FileText className="w-8 h-8 mb-2 opacity-50" />
                                    <span className="text-xs truncate w-full">{media.name}</span>
                                  </div>
                                )}
                                <Button
                                  variant="destructive"
                                  size="icon"
                                  className="absolute top-1 right-1 w-6 h-6 opacity-0 group-hover:opacity-100 transition-opacity"
                                  onClick={() => handleDeleteMedia(media.id)}
                                >
                                  <Trash2 className="w-3 h-3" />
                                </Button>
                                <div className="absolute bottom-0 left-0 right-0 bg-black/50 text-white text-[10px] p-1 truncate opacity-0 group-hover:opacity-100 transition-opacity">
                                  {media.name}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ));
                    })()}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground italic text-center py-4">
                    Nenhuma mídia adicionada a esta fase.
                  </p>
                )
              )}
            </div>
          </div>
        </CardContent>
        <CardFooter className="flex justify-end gap-2 border-t pt-4">
          <Button variant="outline" type="button" onClick={handleCancel}>Cancelar</Button>
          <Button type="button" onClick={handleSave} className="gap-2">
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
        <Button type="button" onClick={() => handleEdit()} className="gap-2">
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
            <Button type="button" variant="link" onClick={() => handleEdit()}>
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

import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Combobox } from '@/components/ui/combobox';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/use-toast';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { PlusCircle, Edit, Trash2, Calendar, FileText, Briefcase, ArrowLeft, Save } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';

export function WorkMeasurementsTab({ workId, contractors = [], onEditingChange, onDirtyChange, onWorkCompletionChange }) {
  const [measurements, setMeasurements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [currentMeasurement, setCurrentMeasurement] = useState(null);
  const [errors, setErrors] = useState({});
  const { toast } = useToast();
  const { user } = useAuth();
  const [localContractors, setLocalContractors] = useState(contractors);
  const [showNewContractorDialog, setShowNewContractorDialog] = useState(false);
  const [isSavingContractor, setIsSavingContractor] = useState(false);
  const [newContractorForm, setNewContractorForm] = useState({ name: '', cnpj: '' });

  useEffect(() => {
    setLocalContractors(contractors);
  }, [contractors]);

  const parsePtBrNumber = (value) => {
    if (value == null) return null;
    const raw = String(value).trim();
    if (!raw) return null;
    const cleaned = raw
      .replace(/\s/g, '')
      .replace(/^R\$\s?/, '')
      .replace(/\./g, '')
      .replace(',', '.');
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : null;
  };

  const formatPtBrMoney = (value) => {
    const n = typeof value === 'number' ? value : parsePtBrNumber(value);
    if (n == null) return '';
    return new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
  };

  const sanitizeMoneyInput = (value) => String(value || '').replace(/[^\d.,]/g, '');

  const maskMoneyWhileTyping = (value) => {
    const digits = String(value || '').replace(/\D/g, '');
    if (!digits) return '';
    const n = Number(digits) / 100;
    return formatPtBrMoney(n);
  };

  const formatCnpjMask = (value) => {
    const digits = String(value || '').replace(/\D/g, '').slice(0, 14);
    if (digits.length <= 2) return digits;
    if (digits.length <= 5) return `${digits.slice(0, 2)}.${digits.slice(2)}`;
    if (digits.length <= 8) return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5)}`;
    if (digits.length <= 12) return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8)}`;
    return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12)}`;
  };

  const isValidCnpj = (value) => {
    const digits = String(value || '').replace(/\D/g, '');
    if (digits.length !== 14) return false;
    if (/^(\d)\1+$/.test(digits)) return false;

    const calc = (base, weights) => {
      let sum = 0;
      for (let i = 0; i < weights.length; i++) sum += Number(base[i]) * weights[i];
      const mod = sum % 11;
      return mod < 2 ? 0 : 11 - mod;
    };

    const w1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const w2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const d1 = calc(digits, w1);
    const d2 = calc(`${digits.slice(0, 12)}${d1}`, w2);
    return digits.endsWith(`${d1}${d2}`);
  };

  const [formData, setFormData] = useState({
    title: '',
    description: '',
    contractor_id: '',
    contract_number: '',
    bidding_process_number: '',
    contract_portal_link: '',
    bidding_process_portal_link: '',
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
    stalled_date: '',
    expected_value: '',
    execution_period_days: '',
    funding_source: [],
    funding_amount_federal: '',
    funding_amount_state: '',
    funding_amount_municipal: ''
  });

  // Auto-save Logic (sem restauração automática na abertura do modal)
  // Rascunho é salvo apenas enquanto em edição; ao abrir modal novamente, inicia fechado.

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
  const [isDirty, setIsDirty] = useState(false);
  const baselineRef = React.useRef(null);
  const editContainerRef = React.useRef(null);

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
    if (!window.confirm('Tem certeza que deseja excluir esta mídia?')) return;

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
        .order('created_at', { ascending: false });

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

  const syncWorkFromLatestMeasurement = async () => {
    try {
      const { data: latest, error: latestError } = await supabase
        .from('public_work_measurements')
        .select('status, execution_percentage, contractor_id, funding_source, execution_period_days, expected_value, predicted_start_date, start_date, end_date, expected_end_date, service_order_date, contract_signature_date, inauguration_date, stalled_date')
        .eq('work_id', workId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (latestError) throw latestError;
      if (!latest) return;

      const workPayload = {
        status: latest.status,
        execution_percentage: latest.execution_percentage,
        contractor_id: latest.contractor_id,
        funding_source: Array.isArray(latest.funding_source) ? latest.funding_source : [],
        execution_period_days: latest.execution_period_days,
        total_value: latest.expected_value,
        predicted_start_date: latest.predicted_start_date,
        start_date: latest.start_date,
        end_date: latest.end_date,
        expected_end_date: latest.expected_end_date,
        service_order_date: latest.service_order_date,
        contract_signature_date: latest.contract_signature_date,
        inauguration_date: latest.inauguration_date,
        stalled_date: latest.stalled_date
      };

      const { error: workUpdateError } = await supabase.from('public_works').update(workPayload).eq('id', workId);
      if (workUpdateError) throw workUpdateError;
    } catch (error) {
      console.error('Error syncing work from latest measurement:', error);
    }
  };

  const handleEdit = (measurement = null) => {
    if (measurement) {
      const normalizedFundingSource = Array.isArray(measurement.funding_source)
        ? measurement.funding_source.map((src) => (src === 'state' ? 'estadual' : src))
        : [];
      setCurrentMeasurement(measurement);
      setFormData({
        title: measurement.title,
        description: measurement.description || '',
        contractor_id: measurement.contractor_id || '',
        contract_number: measurement.contract_number || '',
        bidding_process_number: measurement.bidding_process_number || '',
        contract_portal_link: measurement.contract_portal_link || measurement.portal_link || '',
        bidding_process_portal_link: measurement.bidding_process_portal_link || measurement.portal_link || '',
        contract_date: measurement.contract_date || '',
        start_date: measurement.start_date || '',
        end_date: measurement.end_date || '',
        value: measurement.value != null ? formatPtBrMoney(measurement.value) : '',
        execution_percentage: measurement.execution_percentage || '',
        status: measurement.status || 'planned',
        predicted_start_date: measurement.predicted_start_date || '',
        service_order_date: measurement.service_order_date || '',
        contract_signature_date: measurement.contract_signature_date || '',
        expected_end_date: measurement.expected_end_date || '',
        inauguration_date: measurement.inauguration_date || '',
        stalled_date: measurement.stalled_date || '',
        expected_value: measurement.expected_value != null ? formatPtBrMoney(measurement.expected_value) : '',
        // amount_spent: measurement.amount_spent != null ? formatPtBrMoney(measurement.amount_spent) : '',
        execution_period_days: measurement.execution_period_days || '',
        funding_source: normalizedFundingSource,
        funding_amount_federal: measurement.funding_amount_federal != null ? formatPtBrMoney(measurement.funding_amount_federal) : '',
        funding_amount_state: measurement.funding_amount_state != null ? formatPtBrMoney(measurement.funding_amount_state) : '',
        funding_amount_municipal: measurement.funding_amount_municipal != null ? formatPtBrMoney(measurement.funding_amount_municipal) : ''
      });
      baselineRef.current = {
        title: measurement.title,
        description: measurement.description || '',
        contractor_id: measurement.contractor_id || '',
        contract_number: measurement.contract_number || '',
        bidding_process_number: measurement.bidding_process_number || '',
        contract_portal_link: measurement.contract_portal_link || measurement.portal_link || '',
        bidding_process_portal_link: measurement.bidding_process_portal_link || measurement.portal_link || '',
        contract_date: measurement.contract_date || '',
        start_date: measurement.start_date || '',
        end_date: measurement.end_date || '',
        value: measurement.value != null ? formatPtBrMoney(measurement.value) : '',
        execution_percentage: measurement.execution_percentage || '',
        status: measurement.status || 'planned',
        predicted_start_date: measurement.predicted_start_date || '',
        service_order_date: measurement.service_order_date || '',
        contract_signature_date: measurement.contract_signature_date || '',
        expected_end_date: measurement.expected_end_date || '',
        inauguration_date: measurement.inauguration_date || '',
        stalled_date: measurement.stalled_date || '',
        expected_value: measurement.expected_value != null ? formatPtBrMoney(measurement.expected_value) : '',
        // amount_spent: measurement.amount_spent != null ? formatPtBrMoney(measurement.amount_spent) : '',
        execution_period_days: measurement.execution_period_days || '',
        funding_source: normalizedFundingSource,
        funding_amount_federal: measurement.funding_amount_federal != null ? formatPtBrMoney(measurement.funding_amount_federal) : '',
        funding_amount_state: measurement.funding_amount_state != null ? formatPtBrMoney(measurement.funding_amount_state) : '',
        funding_amount_municipal: measurement.funding_amount_municipal != null ? formatPtBrMoney(measurement.funding_amount_municipal) : ''
      };
    } else {
      setCurrentMeasurement(null);
      setFormData({
        title: '',
        description: '',
        contractor_id: '',
        contract_number: '',
        bidding_process_number: '',
        contract_portal_link: '',
        bidding_process_portal_link: '',
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
        stalled_date: '',
        expected_value: '',
        // amount_spent: '',
        execution_period_days: '',
        funding_source: [],
        funding_amount_federal: '',
        funding_amount_state: '',
        funding_amount_municipal: ''
      });
      baselineRef.current = {
        title: '',
        description: '',
        contractor_id: '',
        contract_number: '',
        bidding_process_number: '',
        contract_portal_link: '',
        bidding_process_portal_link: '',
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
        stalled_date: '',
        expected_value: '',
        // amount_spent: '',
        execution_period_days: '',
        funding_source: [],
        funding_amount_federal: '',
        funding_amount_state: '',
        funding_amount_municipal: ''
      };
    }
    setIsEditing(true);
    setErrors({});
    setIsDirty(false);
    if (onDirtyChange) onDirtyChange(false);
  };

  const handleCancel = () => {
    setIsEditing(false);
    setCurrentMeasurement(null);
    setMeasurementMedia([]);
    setSelectedFiles([]);
    setIsDirty(false);
    baselineRef.current = null;
    if (onDirtyChange) onDirtyChange(false);
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
        contract_number: formData.contract_number || null,
        bidding_process_number: formData.bidding_process_number || null,
        contract_portal_link: formData.contract_portal_link || null,
        bidding_process_portal_link: formData.bidding_process_portal_link || null,
        portal_link: formData.contract_portal_link || formData.bidding_process_portal_link || null,
        contract_date: formData.contract_date || null,
        start_date: formData.start_date || null,
        end_date: formData.end_date || null,
        value: formData.value ? parsePtBrNumber(formData.value) : null,
        execution_percentage: formData.execution_percentage ? Number(formData.execution_percentage) : null,
        status: formData.status,
        predicted_start_date: formData.predicted_start_date || null,
        service_order_date: formData.service_order_date || null,
        contract_signature_date: formData.contract_signature_date || null,
        expected_end_date: formData.expected_end_date || null,
        inauguration_date: formData.inauguration_date || null,
        stalled_date: formData.stalled_date || null,
        expected_value: formData.expected_value ? parsePtBrNumber(formData.expected_value) : null,
        // amount_spent: formData.amount_spent ? parsePtBrNumber(formData.amount_spent) : null,
        execution_period_days: formData.execution_period_days ? Number(formData.execution_period_days) : null,
        funding_source: Array.isArray(formData.funding_source)
          ? formData.funding_source.map((src) => (src === 'state' ? 'estadual' : src))
          : [],
        funding_amount_federal: formData.funding_amount_federal ? parsePtBrNumber(formData.funding_amount_federal) : null,
        funding_amount_state: formData.funding_amount_state ? parsePtBrNumber(formData.funding_amount_state) : null,
        funding_amount_municipal: formData.funding_amount_municipal ? parsePtBrNumber(formData.funding_amount_municipal) : null
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
      await syncWorkFromLatestMeasurement();
      const { error: completionError } = await supabase.from('public_works').update({ is_complete: true }).eq('id', workId);
      if (completionError) {
        toast({
          title: "Fase salva, mas cadastro não foi completado",
          description: completionError.message,
          variant: "destructive"
        });
      } else if (onWorkCompletionChange) {
        onWorkCompletionChange(true);
      }

      // Close modal and reset
      clearDraft();
      setIsEditing(false);
      setCurrentMeasurement(null);
      setMeasurementMedia([]);
      setSelectedFiles([]);
      setIsDirty(false);
      baselineRef.current = null;
      if (onDirtyChange) onDirtyChange(false);
      
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
    if (!window.confirm('Tem certeza que deseja excluir esta medição?')) return;

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
      await fetchMeasurements();
      await syncWorkFromLatestMeasurement();
      const { count, error: countError } = await supabase
        .from('public_work_measurements')
        .select('id', { count: 'exact', head: true })
        .eq('work_id', workId);
      if (countError) throw countError;
      const nextIsComplete = (count || 0) > 0;
      const { error: completionError } = await supabase.from('public_works').update({ is_complete: nextIsComplete }).eq('id', workId);
      if (completionError) throw completionError;
      if (onWorkCompletionChange) onWorkCompletionChange(nextIsComplete);
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

  const handleCreateContractor = async () => {
    if (!user?.is_admin) return;
    const name = String(newContractorForm.name || '').trim();
    if (!name) {
      toast({ title: "Nome obrigatório", description: "Informe o nome da construtora.", variant: "destructive" });
      return;
    }
    const cnpjDigits = String(newContractorForm.cnpj || '').replace(/\D/g, '');
    if (cnpjDigits && !isValidCnpj(cnpjDigits)) {
      toast({ title: "CNPJ inválido", description: "Informe um CNPJ válido (14 dígitos).", variant: "destructive" });
      return;
    }
    if (isSavingContractor) return;

    setIsSavingContractor(true);
    try {
      const payload = {
        name,
        cnpj: cnpjDigits || null
      };
      const { data, error } = await supabase.from('contractors').insert(payload).select('*').single();
      if (error) throw error;

      setLocalContractors(prev => {
        const list = Array.isArray(prev) ? [...prev] : [];
        list.push(data);
        list.sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'pt-BR'));
        return list;
      });
      setFormData(prev => ({ ...prev, contractor_id: data.id }));
      setShowNewContractorDialog(false);
      setNewContractorForm({ name: '', cnpj: '' });
      toast({ title: "Construtora criada", description: "A construtora foi adicionada e selecionada nesta fase." });
    } catch (error) {
      toast({ title: "Erro ao criar construtora", description: error.message, variant: "destructive" });
    } finally {
      setIsSavingContractor(false);
    }
  };

  // Track dirty state precisely (only when editing)
  useEffect(() => {
    const normalize = (obj) => {
      const out = {};
      Object.keys(formData).forEach(k => {
        if (k === 'funding_source') {
          const arr = Array.isArray(obj?.funding_source) ? [...obj.funding_source].sort() : [];
          out.funding_source = arr;
        } else {
          out[k] = obj && obj[k] !== undefined ? obj[k] : '';
        }
      });
      return out;
    };
    if (isEditing) {
      const base = normalize(baselineRef.current || {});
      const curr = normalize(formData || {});
      const hasFiles = selectedFiles.length > 0;
      const dirty = JSON.stringify(base) !== JSON.stringify(curr) || hasFiles;
      if (dirty !== isDirty) {
        setIsDirty(dirty);
        if (onDirtyChange) onDirtyChange(dirty);
      }
    } else if (isDirty) {
      setIsDirty(false);
      if (onDirtyChange) onDirtyChange(false);
    }
  }, [isEditing, formData, selectedFiles, isDirty, onDirtyChange]);

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

  const getStatusBadgeClass = (status) => {
    const map = {
      'completed': 'bg-emerald-100 text-emerald-700 border-emerald-200',
      'in-progress': 'bg-blue-100 text-blue-700 border-blue-200',
      'stalled': 'bg-amber-100 text-amber-700 border-amber-200',
      'tendered': 'bg-purple-100 text-purple-700 border-purple-200',
      'planned': 'bg-slate-100 text-slate-700 border-slate-200',
      'unfinished': 'bg-rose-100 text-rose-700 border-rose-200'
    };
    return map[status] || 'bg-gray-100 text-gray-700 border-gray-200';
  };

  if (isEditing) {
    return (
      <Card className="border-l-4 border-l-primary shadow-sm" ref={editContainerRef}>
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
                <Label htmlFor="expected_value">Valor Previsto (R$)</Label>
                <Input 
                  id="expected_value" 
                  name="expected_value" 
                  value={formData.expected_value} 
                  inputMode="decimal"
                  onChange={(e) => setFormData(prev => ({ ...prev, expected_value: maskMoneyWhileTyping(e.target.value) }))}
                  placeholder="0,00"
                />
              </div>
              {/* <div className="grid gap-2">
                <Label htmlFor="amount_spent">Valor Pago (R$)</Label>
                <Input 
                  id="amount_spent" 
                  name="amount_spent" 
                  value={formData.amount_spent} 
                  inputMode="decimal"
                  onChange={(e) => setFormData(prev => ({ ...prev, amount_spent: maskMoneyWhileTyping(e.target.value) }))}
                  placeholder="0,00"
                />
              </div> */}
              <div className="grid gap-2">
                <Label htmlFor="execution_period_days">Prazo de Execução (dias)</Label>
                <Input 
                  id="execution_period_days" 
                  name="execution_period_days" 
                  type="number" 
                  value={formData.execution_period_days} 
                  onChange={handleChange} 
                  placeholder="0"
                />
              </div>
              <div className="grid gap-2">
                <Label>Fontes do Recurso</Label>
                <div className="flex items-center gap-4 pt-2">
                  {['federal','estadual','municipal'].map(src => (
                    <label key={src} className="inline-flex items-center gap-2 text-sm">
                      <input 
                        type="checkbox" 
                        checked={(formData.funding_source || []).includes(src)} 
                        onChange={() => {
                          const current = formData.funding_source || [];
                          const next = current.includes(src) ? current.filter(s => s !== src) : [...current, src];
                          setFormData(prev => ({ ...prev, funding_source: next }));
                        }} 
                      />
                      <span className="capitalize">{src}</span>
                    </label>
                  ))}
                </div>
                {Array.isArray(formData.funding_source) && formData.funding_source.length > 0 ? (
                  <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {(formData.funding_source || []).includes('federal') ? (
                      <div className="grid gap-2">
                        <Label htmlFor="funding_amount_federal">Federal (R$)</Label>
                        <Input
                          id="funding_amount_federal"
                          name="funding_amount_federal"
                          value={formData.funding_amount_federal}
                          inputMode="decimal"
                          onChange={(e) => setFormData((prev) => ({ ...prev, funding_amount_federal: maskMoneyWhileTyping(e.target.value) }))}
                          placeholder="0,00"
                        />
                      </div>
                    ) : null}
                    {(formData.funding_source || []).includes('estadual') ? (
                      <div className="grid gap-2">
                        <Label htmlFor="funding_amount_state">Estadual (R$)</Label>
                        <Input
                          id="funding_amount_state"
                          name="funding_amount_state"
                          value={formData.funding_amount_state}
                          inputMode="decimal"
                          onChange={(e) => setFormData((prev) => ({ ...prev, funding_amount_state: maskMoneyWhileTyping(e.target.value) }))}
                          placeholder="0,00"
                        />
                      </div>
                    ) : null}
                    {(formData.funding_source || []).includes('municipal') ? (
                      <div className="grid gap-2">
                        <Label htmlFor="funding_amount_municipal">Municipal (R$)</Label>
                        <Input
                          id="funding_amount_municipal"
                          name="funding_amount_municipal"
                          value={formData.funding_amount_municipal}
                          inputMode="decimal"
                          onChange={(e) => setFormData((prev) => ({ ...prev, funding_amount_municipal: maskMoneyWhileTyping(e.target.value) }))}
                          placeholder="0,00"
                        />
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="grid gap-2">
                <div className="flex items-center justify-between gap-2">
                  <Label htmlFor="contractor_id">Construtora Responsável</Label>
                  {user?.is_admin ? (
                    <Button type="button" size="sm" onClick={() => setShowNewContractorDialog(true)}>
                      Nova
                    </Button>
                  ) : null}
                </div>
                <Combobox 
                  value={formData.contractor_id} 
                  onChange={(v) => handleSelectChange('contractor_id', v)}
                  options={[{ value: '', label: 'Selecionar' }, ...(localContractors || []).map(c => ({ value: c.id, label: c.name }))]}
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
                <Label htmlFor="contract_number">Número do contrato</Label>
                <Input
                  id="contract_number"
                  name="contract_number"
                  value={formData.contract_number}
                  onChange={handleChange}
                  placeholder="Ex: 005/2022"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="bidding_process_number">Processo licitatório</Label>
                <Input
                  id="bidding_process_number"
                  name="bidding_process_number"
                  value={formData.bidding_process_number}
                  onChange={handleChange}
                  placeholder="Ex: 002/2026"
                />
              </div>
              <div className="grid gap-2 sm:col-span-1">
                <Label htmlFor="contract_portal_link">Portal do contrato (link)</Label>
                <Input
                  id="contract_portal_link"
                  name="contract_portal_link"
                  value={formData.contract_portal_link}
                  onChange={handleChange}
                  placeholder="https://..."
                />
              </div>
              <div className="grid gap-2 sm:col-span-1">
                <Label htmlFor="bidding_process_portal_link">Portal do processo (link)</Label>
                <Input
                  id="bidding_process_portal_link"
                  name="bidding_process_portal_link"
                  value={formData.bidding_process_portal_link}
                  onChange={handleChange}
                  placeholder="https://..."
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="value">Valor Contratado(R$)</Label>
                <Input 
                  id="value" 
                  name="value" 
                  value={formData.value} 
                  inputMode="decimal"
                  onChange={(e) => setFormData(prev => ({ ...prev, value: maskMoneyWhileTyping(e.target.value) }))}
                  placeholder="0,00"
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
                      <Label htmlFor="contract_date">Data do contrato</Label>
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

        <Dialog open={showNewContractorDialog} onOpenChange={setShowNewContractorDialog}>
          <DialogContent className="sm:max-w-[520px]">
            <DialogHeader>
              <DialogTitle>Nova construtora</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4">
              <div className="grid gap-2">
                <Label>Nome</Label>
                <Input value={newContractorForm.name} onChange={(e) => setNewContractorForm((p) => ({ ...p, name: e.target.value }))} />
              </div>
              <div className="grid gap-2">
                <Label>CNPJ (opcional)</Label>
                <Input
                  inputMode="numeric"
                  placeholder="00.000.000/0000-00"
                  value={newContractorForm.cnpj}
                  onChange={(e) => setNewContractorForm((p) => ({ ...p, cnpj: formatCnpjMask(e.target.value) }))}
                />
              </div>
            </div>
            <DialogFooter className="gap-2">
              <DialogClose asChild>
                <Button type="button" variant="outline" disabled={isSavingContractor}>
                  Cancelar
                </Button>
              </DialogClose>
              <Button type="button" onClick={handleCreateContractor} disabled={isSavingContractor}>
                {isSavingContractor ? 'Salvando...' : 'Criar'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <CardFooter className="flex justify-end gap-2 border-t pt-4 sticky bottom-0 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/75 z-10">
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
      <div className="flex justify-between items-center bg-slate-50 p-4 rounded-xl border border-slate-100">
        <div>
          <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
            <Briefcase className="w-5 h-5 text-primary" />
            Histórico de Fases e Licitações
          </h3>
          <p className="text-sm text-muted-foreground">Gerencie o ciclo de vida da obra: licitações, contratos e medições.</p>
        </div>
        <Button type="button" onClick={() => handleEdit()} className="gap-2 shadow-sm">
          <PlusCircle className="w-4 h-4" />
          Nova Fase/Contrato
        </Button>
      </div>

      {loading ? (
        <div className="text-center py-12">
          <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full mx-auto mb-4"></div>
          <p className="text-muted-foreground">Carregando medições...</p>
        </div>
      ) : measurements.length === 0 ? (
        <Card className="bg-muted/30 border-dashed border-2">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
            <div className="bg-white p-4 rounded-full shadow-sm mb-4">
              <Briefcase className="w-10 h-10 opacity-20 text-primary" />
            </div>
            <h4 className="font-semibold text-slate-700 mb-1">Nenhuma fase registrada</h4>
            <p className="max-w-xs mb-6">Comece cadastrando a primeira licitação ou contrato para acompanhar o progresso.</p>
            <Button type="button" variant="outline" onClick={() => handleEdit()} className="gap-2">
              <PlusCircle className="w-4 h-4" /> Adicionar Fase
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {measurements.map((measurement) => (
            <Card key={measurement.id} className="overflow-hidden border-slate-200 hover:shadow-md transition-all group">
              <div className="bg-white p-4 flex flex-col sm:flex-row justify-between gap-4 border-b group-hover:bg-slate-50/50 transition-colors">
                <div className="space-y-1.5">
                  <div className="flex items-center gap-3">
                    <h4 className="font-bold text-lg text-slate-800">{measurement.title}</h4>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border uppercase tracking-wider ${getStatusBadgeClass(measurement.status)}`}>
                      {getStatusLabel(measurement.status)}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    {measurement.contractor && (
                      <div className="flex items-center gap-1.5">
                        <Briefcase className="w-3.5 h-3.5 text-slate-400" />
                        <span className="font-medium text-slate-600">{measurement.contractor.name}</span>
                      </div>
                    )}
                    <div className="flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5 text-slate-400" />
                      <span>Início: {measurement.start_date ? new Date(measurement.start_date).toLocaleDateString('pt-BR') : 'Não definido'}</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Button variant="outline" size="sm" onClick={() => handleEdit(measurement)} className="h-9 px-3 border-slate-200 hover:bg-white hover:text-primary hover:border-primary shadow-sm">
                    <Edit className="w-4 h-4 mr-2" /> Editar
                  </Button>
                  <Button variant="ghost" size="icon" className="h-9 w-9 text-slate-400 hover:text-destructive hover:bg-destructive/5" onClick={() => handleDelete(measurement.id)}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
              <CardContent className="p-0">
                <div className="grid grid-cols-2 lg:grid-cols-4 divide-x divide-slate-100">
                  <div className="p-4 space-y-1">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tight">Valor do Contrato</span>
                    <p className="font-bold text-slate-700 text-sm">
                      {measurement.value ? formatCurrency(measurement.value) : 'R$ 0,00'}
                    </p>
                  </div>
                  {/* <div className="p-4 space-y-1">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tight">Valor Pago</span>
                    <p className="font-bold text-blue-600 text-sm">
                      {measurement.amount_spent ? formatCurrency(measurement.amount_spent) : 'R$ 0,00'}
                    </p>
                  </div> */}
                  <div className="p-4 space-y-1">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tight">Execução</span>
                    <div className="flex items-center gap-2">
                      <div className="flex-grow bg-slate-100 h-1.5 rounded-full overflow-hidden max-w-[60px]">
                        <div 
                          className="bg-emerald-500 h-full rounded-full" 
                          style={{ width: `${measurement.execution_percentage || 0}%` }}
                        ></div>
                      </div>
                      <span className="font-bold text-emerald-600 text-sm">
                        {measurement.execution_percentage !== null ? `${measurement.execution_percentage}%` : '0%'}
                      </span>
                    </div>
                  </div>
                  <div className="p-4 space-y-1">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tight">Status Atual</span>
                    <p className="font-semibold text-slate-600 text-xs truncate">
                      {measurement.status === 'completed' ? 'Concluída ✅' : 
                       measurement.status === 'in-progress' ? 'Em execução...' :
                       measurement.status === 'stalled' ? 'Paralisada ⚠️' : 
                       getStatusLabel(measurement.status)}
                    </p>
                  </div>
                </div>
                {measurement.description && (
                  <div className="px-4 pb-4">
                    <div className="bg-slate-50/80 p-3 rounded-lg border border-slate-100">
                      <p className="text-xs text-slate-500 leading-relaxed italic line-clamp-2">
                        "{measurement.description}"
                      </p>
                    </div>
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

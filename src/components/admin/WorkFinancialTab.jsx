import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { useToast } from '@/components/ui/use-toast';
import { 
  PlusCircle, Edit, Trash2, Calendar, FileText, DollarSign,
  ArrowLeft, Save, Link2, Calculator
} from 'lucide-react';
import { formatCurrency, formatDate } from '@/lib/utils';

export function WorkFinancialTab({ workId, onEditingChange, onDirtyChange }) {
  const [measurements, setMeasurements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedMeasurementId, setSelectedMeasurementId] = useState(null);
  const [isEditingPayment, setIsEditingPayment] = useState(false);
  const [currentMeasurement, setCurrentMeasurement] = useState(null);
  const [currentPayment, setCurrentPayment] = useState(null);
  const { toast } = useToast();

  const [paymentForm, setPaymentForm] = useState({
    payment_date: '',
    banking_order: '',
    value: '',
    portal_link: ''
  });

  const fetchFinancialData = useCallback(async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('public_work_measurements')
        .select(`
          *,
          payments:public_work_payments(*)
        `)
        .eq('work_id', workId)
        .order('created_at', { ascending: true });

      if (error) throw error;
      setMeasurements(data || []);
    } catch (error) {
      console.error('Error fetching financial data:', error);
      toast({
        title: "Erro ao carregar dados financeiros",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  }, [workId, toast]);

  useEffect(() => {
    if (workId) fetchFinancialData();
  }, [workId, fetchFinancialData]);

  const selectedMeasurement = selectedMeasurementId
    ? measurements.find(m => m.id === selectedMeasurementId)
    : null;
  const selectedPayments = selectedMeasurement
    ? [...(selectedMeasurement.payments || [])].sort((a, b) => new Date(b.payment_date) - new Date(a.payment_date))
    : [];
  const selectedTotalPaid = selectedPayments.reduce((acc, p) => acc + (Number(p.value) || 0), 0);

  const parseMoneyInput = (raw) => {
    if (!raw || typeof raw !== 'string') return 0;
    const normalized = raw
      .trim()
      .replace(/\s/g, '')
      .replace(/\./g, '')
      .replace(',', '.');
    const n = Number(normalized);
    return Number.isFinite(n) ? n : 0;
  };

  // Payment Handlers
  const handleEditPayment = (measurementId, payment = null) => {
    setSelectedMeasurementId(measurementId);
    setCurrentMeasurement({ id: measurementId });
    if (payment) {
      setCurrentPayment(payment);
      setPaymentForm({
        payment_date: payment.payment_date,
        banking_order: payment.banking_order || '',
        value: payment.value != null ? String(payment.value) : '',
        portal_link: payment.portal_link || ''
      });
    } else {
      setCurrentPayment(null);
      setPaymentForm({
        payment_date: new Date().toISOString().split('T')[0],
        banking_order: '',
        value: '',
        portal_link: ''
      });
    }
    setIsEditingPayment(true);
    if (onEditingChange) onEditingChange(true);
  };

  const handleSavePayment = async () => {
    try {
      const valueNumber = parseMoneyInput(paymentForm.value);
      if (!paymentForm.payment_date) {
        toast({ title: "Erro", description: "A data do pagamento é obrigatória.", variant: "destructive" });
        return;
      }
      if (!valueNumber || valueNumber <= 0) {
        toast({ title: "Erro", description: "O valor do pagamento deve ser maior que zero.", variant: "destructive" });
        return;
      }
      if (paymentForm.portal_link?.trim()) {
        try {
          const u = new URL(paymentForm.portal_link.trim());
          if (!['http:', 'https:'].includes(u.protocol)) throw new Error('invalid protocol');
        } catch {
          toast({ title: "Erro", description: "O link do portal deve ser uma URL válida (http/https).", variant: "destructive" });
          return;
        }
      }

      if (!currentMeasurement?.id) {
        toast({ title: "Erro", description: "Selecione uma etapa para salvar o pagamento.", variant: "destructive" });
        return;
      }

      const payload = {
        measurement_id: currentMeasurement.id,
        payment_date: paymentForm.payment_date,
        banking_order: paymentForm.banking_order || null,
        value: valueNumber,
        portal_link: paymentForm.portal_link?.trim() || null
      };

      let error;
      if (currentPayment) {
        ({ error } = await supabase.from('public_work_payments').update(payload).eq('id', currentPayment.id));
      } else {
        ({ error } = await supabase.from('public_work_payments').insert([payload]));
      }

      if (error) throw error;
      toast({ title: "Sucesso", description: "Pagamento registrado!" });
      setIsEditingPayment(false);
      if (onEditingChange) onEditingChange(false);
      setCurrentPayment(null);
      fetchFinancialData();
    } catch (error) {
      toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
    }
  };

  const handleDeletePayment = async (id) => {
    if (!window.confirm('Excluir este pagamento?')) return;
    try {
      const { error } = await supabase.from('public_work_payments').delete().eq('id', id);
      if (error) throw error;
      toast({ title: "Sucesso", description: "Pagamento excluído." });
      fetchFinancialData();
    } catch (error) {
      toast({ title: "Erro ao excluir", description: error.message, variant: "destructive" });
    }
  };

  if (isEditingPayment) {
    const measurementTitle = measurements.find(m => m.id === currentMeasurement?.id)?.title;
    return (
      <Card className="overflow-hidden">
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2">
                <DollarSign className="w-5 h-5 text-emerald-600" />
                {currentPayment ? 'Editar Pagamento' : 'Novo Pagamento'}
              </CardTitle>
              <CardDescription className="mt-1">
                Etapa: <strong className="break-words whitespace-normal">{measurementTitle || '—'}</strong>
              </CardDescription>
            </div>
            <Button
              type="button"
              variant="outline"
              className="border-slate-200 bg-white"
              onClick={() => { setIsEditingPayment(false); setCurrentPayment(null); if (onEditingChange) onEditingChange(false); }}
            >
              <ArrowLeft className="w-4 h-4 mr-2" /> Voltar
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label>Data do Pagamento</Label>
              <Input 
                type="date" 
                value={paymentForm.payment_date} 
                onChange={(e) => setPaymentForm({...paymentForm, payment_date: e.target.value})} 
              />
            </div>
            <div className="grid gap-2">
              <Label>Valor (R$)</Label>
              <Input 
                inputMode="decimal"
                placeholder="Ex: 1.000,00"
                value={paymentForm.value}
                onChange={(e) => setPaymentForm({...paymentForm, value: e.target.value})}
              />
            
            </div>
          </div>
          <div className="grid gap-2">
            <Label>Ordem Bancária / Empenho</Label>
            <Input 
              value={paymentForm.banking_order} 
              onChange={(e) => setPaymentForm({...paymentForm, banking_order: e.target.value})} 
            />
          </div>
          <div className="grid gap-2">
            <Label>Link do Portal da Transparência</Label>
            <Input 
              placeholder="https://..."
              value={paymentForm.portal_link} 
              onChange={(e) => setPaymentForm({...paymentForm, portal_link: e.target.value})} 
            />
          </div>
        </CardContent>
        <CardFooter className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => { setIsEditingPayment(false); setCurrentPayment(null); if(onEditingChange) onEditingChange(false); }}>Cancelar</Button>
          <Button onClick={handleSavePayment} className="gap-2"><Save className="w-4 h-4" /> Salvar Pagamento</Button>
        </CardFooter>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-medium flex items-center gap-2">
          <Calculator className="w-5 h-5 text-emerald-600" /> 
          Controle Financeiro por Fases
        </h3>
      </div>

      <div className="bg-blue-50 border-l-4 border-blue-400 p-4 rounded-r-lg mb-4">
        <div className="flex">
          <div className="flex-shrink-0">
            <FileText className="h-5 w-5 text-blue-400" />
          </div>
          <div className="ml-3">
            <p className="text-sm text-blue-700">
              As fases e licitações são gerenciadas na aba <strong>Histórico/Fases</strong>. Aqui você pode registrar os pagamentos vinculados a cada uma delas.
            </p>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-10">Carregando dados financeiros...</div>
      ) : measurements.length === 0 ? (
        <Card className="bg-muted/30 border-dashed">
          <CardContent className="py-10 text-center text-muted-foreground">
            Nenhuma fase ou licitação cadastrada para esta obra. <br />
            Cadastre uma fase na aba <strong>Histórico/Fases</strong> para começar a lançar pagamentos.
          </CardContent>
        </Card>
      ) : selectedMeasurement ? (
        <div className="space-y-4">
          <div className="flex items-start justify-between gap-3">
            <Button
              type="button"
              variant="outline"
              className="border-slate-200 bg-white"
              onClick={() => setSelectedMeasurementId(null)}
            >
              <ArrowLeft className="w-4 h-4 mr-2" /> Voltar ao panorama
            </Button>
            <Button
              type="button"
              className="bg-red-600 hover:bg-red-700 text-white"
              onClick={() => handleEditPayment(selectedMeasurement.id)}
            >
              <PlusCircle className="w-4 h-4 mr-2" /> Adicionar pagamento
            </Button>
          </div>

          <Card className="overflow-hidden border border-slate-200 shadow-sm">
            <CardHeader className="bg-slate-50/60 border-b border-slate-100 py-4">
              <CardTitle className="text-base flex items-center gap-2">
                <FileText className="w-4 h-4 text-slate-500" />
                Pagamentos — <span className="break-words whitespace-normal">{selectedMeasurement.title}</span>
              </CardTitle>
            </CardHeader>

            <CardContent className="p-0">
              {selectedPayments.length === 0 ? (
                <div className="py-14 text-center">
                  <DollarSign className="w-9 h-9 text-slate-200 mx-auto mb-3" />
                  <p className="text-slate-500 text-sm font-medium">Nenhum pagamento registrado nesta etapa.</p>
                  <Button
                    type="button"
                    className="mt-4 bg-red-600 hover:bg-red-700 text-white"
                    onClick={() => handleEditPayment(selectedMeasurement.id)}
                  >
                    <PlusCircle className="w-4 h-4 mr-2" /> Adicionar primeiro pagamento
                  </Button>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-left border-b bg-slate-50/60 text-slate-400 text-[10px] uppercase">
                      <tr>
                        <th className="px-5 py-3 font-bold">Data</th>
                        <th className="px-5 py-3 font-bold">OB/Empenho</th>
                        <th className="px-5 py-3 font-bold">Valor</th>
                        <th className="px-5 py-3 font-bold">Portal</th>
                        <th className="px-5 py-3 font-bold text-right">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {selectedPayments.map(payment => (
                        <tr key={payment.id} className="hover:bg-slate-50/50 transition-colors">
                          <td className="px-5 py-3 whitespace-nowrap">
                            <div className="flex items-center gap-2">
                              <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 flex-shrink-0" />
                              <span className="font-semibold text-slate-700">{formatDate(payment.payment_date)}</span>
                            </div>
                          </td>
                          <td className="px-5 py-3 text-slate-600 break-words whitespace-normal">{payment.banking_order || '—'}</td>
                          <td className="px-5 py-3 font-black text-blue-700 whitespace-nowrap">{formatCurrency(payment.value)}</td>
                          <td className="px-5 py-3">
                            {payment.portal_link ? (
                              <a href={payment.portal_link} target="_blank" rel="noreferrer" className="text-emerald-700 hover:text-emerald-800 underline break-words whitespace-normal inline-flex items-center gap-2">
                                <Link2 className="w-4 h-4 flex-shrink-0" />
                                <span>{payment.portal_link}</span>
                              </a>
                            ) : (
                              <span className="text-slate-300">—</span>
                            )}
                          </td>
                          <td className="px-5 py-3 text-right">
                            <div className="flex justify-end gap-1">
                              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleEditPayment(selectedMeasurement.id, payment)}>
                                <Edit className="w-4 h-4" />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:bg-destructive/10" onClick={() => handleDeletePayment(payment.id)}>
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="bg-slate-50/60 border-t border-slate-200">
                        <td colSpan={2} className="px-5 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                          Subtotal — {selectedPayments.length} pagamento(s)
                        </td>
                        <td className="px-5 py-3">
                          <span className="text-sm font-black text-emerald-700">{formatCurrency(selectedTotalPaid)}</span>
                        </td>
                        <td colSpan={2} />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {measurements.map(measurement => {
            const totalPaid = (measurement.payments || []).reduce((acc, p) => acc + (Number(p.value) || 0), 0);
            return (
              <Card key={measurement.id} className="overflow-hidden border border-slate-200 shadow-sm">
                <CardHeader className="bg-slate-50/60 border-b border-slate-100">
                  <CardTitle className="text-base flex items-center gap-2">
                    <FileText className="w-4 h-4 text-slate-500" />
                    <span className="break-words whitespace-normal">{measurement.title}</span>
                  </CardTitle>
                  {measurement.description && (
                    <CardDescription className="break-words whitespace-normal">{measurement.description}</CardDescription>
                  )}
                </CardHeader>
                <CardContent className="p-5 space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-xl border border-slate-200 bg-white p-3">
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Contrato</p>
                      <p className="text-sm font-black text-slate-800 mt-1 break-words whitespace-normal">{measurement.value ? formatCurrency(measurement.value) : '—'}</p>
                    </div>
                    <div className="rounded-xl border border-emerald-100 bg-emerald-50/60 p-3">
                      <p className="text-[10px] font-bold text-emerald-700/70 uppercase tracking-widest">Pago</p>
                      <p className="text-sm font-black text-emerald-800 mt-1 break-words whitespace-normal">{totalPaid > 0 ? formatCurrency(totalPaid) : 'R$ 0,00'}</p>
                    </div>
                  </div>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <Button
                      type="button"
                      className="bg-red-600 hover:bg-red-700 text-white"
                      onClick={() => setSelectedMeasurementId(measurement.id)}
                    >
                      <Calculator className="w-4 h-4 mr-2" /> Gerenciar pagamentos
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="border-slate-200 bg-white"
                      onClick={() => handleEditPayment(measurement.id)}
                    >
                      <PlusCircle className="w-4 h-4 mr-2" /> Adicionar pagamento
                    </Button>
                  </div>
                  <p className="text-xs text-slate-500">
                    {measurement.payments?.length || 0} pagamento(s) cadastrado(s)
                  </p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

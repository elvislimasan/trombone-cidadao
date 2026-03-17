import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { useToast } from '@/components/ui/use-toast';
import { 
  PlusCircle, Edit, Trash2, FileText,
  ArrowLeft, Save, Link2, Calculator
} from 'lucide-react';
import { formatCurrency, parseCurrency, formatDate } from '@/lib/utils';

export function WorkFinancialTab({ workId, onEditingChange }) {
  const [measurements, setMeasurements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isEditingPayment, setIsEditingPayment] = useState(false);
  const [currentMeasurement, setCurrentMeasurement] = useState(null);
  const [currentPayment, setCurrentPayment] = useState(null);
  const { toast } = useToast();

  const [paymentForm, setPaymentForm] = useState({
    payment_date: '',
    commitment_number: '',
    payment_description: '',
    installment: '',
    creditor_name: '',
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
          contractor:contractors(id, name),
          payments:public_work_payments(*)
        `)
        .eq('work_id', workId)
        .order('created_at', { ascending: false });

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

  // Payment Handlers
  const handleEditPayment = (measurementId, payment = null) => {
    setCurrentMeasurement({ id: measurementId }); // Store which measurement we're adding to
    if (payment) {
      setCurrentPayment(payment);
      setPaymentForm({
        payment_date: payment.payment_date,
        commitment_number: payment.commitment_number || payment.banking_order || '',
        payment_description: payment.payment_description || '',
        installment: payment.installment || '',
        creditor_name: payment.creditor_name || '',
        value: payment.value || '',
        portal_link: payment.portal_link || ''
      });
    } else {
      const measurement = measurements.find(m => m.id === measurementId) || null;
      setCurrentPayment(null);
      setPaymentForm({
        payment_date: new Date().toISOString().split('T')[0],
        commitment_number: '',
        payment_description: '',
        installment: '',
        creditor_name: measurement?.contractor?.name || '',
        value: '',
        portal_link: ''
      });
    }
    setIsEditingPayment(true);
    if (onEditingChange) onEditingChange(true);
  };

  const handleSavePayment = async () => {
    try {
      if (!paymentForm.payment_date || !paymentForm.value) {
        toast({ title: "Erro", description: "Data e valor são obrigatórios.", variant: "destructive" });
        return;
      }

      const payload = {
        measurement_id: currentMeasurement.id,
        payment_date: paymentForm.payment_date,
        commitment_number: paymentForm.commitment_number || null,
        payment_description: paymentForm.payment_description || null,
        installment: paymentForm.installment || null,
        creditor_name: paymentForm.creditor_name || null,
        banking_order: paymentForm.commitment_number || null,
        value: parseCurrency(String(paymentForm.value)),
        portal_link: paymentForm.portal_link || null
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
    return (
      <Card>
        <CardHeader>
          <CardTitle>{currentPayment ? 'Editar Pagamento' : 'Novo Pagamento'}</CardTitle>
          <CardDescription>
            Registrando pagamento para: <strong>{measurements.find(m => m.id === currentMeasurement.id)?.title}</strong>
          </CardDescription>
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
                value={formatCurrency(paymentForm.value, false)} 
                onChange={(e) => setPaymentForm({...paymentForm, value: parseCurrency(e.target.value)})} 
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label>Número de empenho</Label>
              <Input
                value={paymentForm.commitment_number}
                onChange={(e) => setPaymentForm({ ...paymentForm, commitment_number: e.target.value })}
              />
            </div>
            <div className="grid gap-2">
              <Label>Parcela</Label>
              <Input
                placeholder="Ex.: 1/3"
                value={paymentForm.installment}
                onChange={(e) => setPaymentForm({ ...paymentForm, installment: e.target.value })}
              />
            </div>
          </div>

          <div className="grid gap-2">
            <Label>Credor</Label>
            <Input
              value={paymentForm.creditor_name}
              onChange={(e) => setPaymentForm({ ...paymentForm, creditor_name: e.target.value })}
            />
          </div>

          <div className="grid gap-2">
            <Label>Descrição do pagamento</Label>
            <Textarea
              value={paymentForm.payment_description}
              onChange={(e) => setPaymentForm({ ...paymentForm, payment_description: e.target.value })}
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
          <Button variant="outline" onClick={() => { setIsEditingPayment(false); if(onEditingChange) onEditingChange(false); }}>Cancelar</Button>
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
      ) : (
        <div className="space-y-4">
          {measurements.map(measurement => {
            const totalPaid = (measurement.payments || []).reduce((acc, p) => acc + (Number(p.value) || 0), 0);
            return (
              <Card key={measurement.id} className="overflow-hidden border-l-4 border-l-emerald-500">
                <CardHeader className="bg-emerald-50/50 pb-4">
                  <div className="flex justify-between items-start">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-emerald-600 uppercase tracking-wider">Fase / Licitação</span>
                        <h4 className="font-bold text-lg">{measurement.title}</h4>
                      </div>
                      <p className="text-sm text-muted-foreground line-clamp-2">{measurement.description}</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4 mt-4">
                    <div className="bg-white p-2 rounded border shadow-sm">
                      <p className="text-[10px] font-bold text-muted-foreground uppercase">Valor do Contrato</p>
                      <p className="font-bold text-emerald-700">{formatCurrency(measurement.value)}</p>
                    </div>
                    <div className="bg-white p-2 rounded border shadow-sm">
                      <p className="text-[10px] font-bold text-muted-foreground uppercase">Total Pago</p>
                      <p className="font-bold text-blue-700">{formatCurrency(totalPaid)}</p>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="p-4 bg-slate-50/30">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-3">
                    <div className="flex items-center gap-2 text-xs font-bold uppercase text-slate-500 tracking-wider">
                      <Calculator className="w-3.5 h-3.5" />
                      Pagamentos ({measurement.payments?.length || 0})
                    </div>
                    <Button size="sm" variant="outline" className="h-8 text-[10px] uppercase font-bold bg-white" onClick={() => handleEditPayment(measurement.id)}>
                      <PlusCircle className="w-3 h-3 mr-1" /> Adicionar pagamento
                    </Button>
                  </div>

                  {measurement.payments && measurement.payments.length > 0 ? (
                    <div className="overflow-x-auto border rounded-lg bg-white">
                      <table className="w-full text-sm">
                        <thead className="text-left border-b bg-slate-50/50 text-slate-400 text-[10px] uppercase">
                          <tr>
                            <th className="px-3 py-2 font-bold">Data</th>
                            <th className="px-3 py-2 font-bold">Nº Empenho</th>
                            <th className="px-3 py-2 font-bold">Descrição</th>
                            <th className="px-3 py-2 font-bold">Parcela</th>
                            <th className="px-3 py-2 font-bold">Credor</th>
                            <th className="px-3 py-2 font-bold text-right">Valor</th>
                            <th className="px-3 py-2 font-bold">Portal</th>
                            <th className="px-3 py-2 font-bold text-right">Ações</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y text-xs">
                          {measurement.payments
                            .sort((a, b) => new Date(b.payment_date) - new Date(a.payment_date))
                            .map((payment) => (
                              <tr key={payment.id} className="hover:bg-slate-50/50">
                                <td className="px-3 py-2 whitespace-nowrap font-medium text-slate-700">{formatDate(payment.payment_date)}</td>
                                <td className="px-3 py-2 text-slate-600">{payment.commitment_number || payment.banking_order || '-'}</td>
                                <td className="px-3 py-2 text-slate-600 max-w-[280px]"><span className="line-clamp-2">{payment.payment_description || '-'}</span></td>
                                <td className="px-3 py-2 text-slate-600">{payment.installment || '-'}</td>
                                <td className="px-3 py-2 text-slate-600">{payment.creditor_name || '-'}</td>
                                <td className="px-3 py-2 font-bold text-blue-600 text-right whitespace-nowrap">{formatCurrency(payment.value)}</td>
                                <td className="px-3 py-2">
                                  {payment.portal_link ? (
                                    <a href={payment.portal_link} target="_blank" rel="noreferrer" className="text-emerald-600 hover:text-emerald-700">
                                      <Link2 className="w-4 h-4" />
                                    </a>
                                  ) : (
                                    <span className="text-slate-300">-</span>
                                  )}
                                </td>
                                <td className="px-3 py-2 text-right">
                                  <div className="flex justify-end gap-1">
                                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleEditPayment(measurement.id, payment)}><Edit className="w-3 h-3" /></Button>
                                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleDeletePayment(payment.id)}><Trash2 className="w-3 h-3" /></Button>
                                  </div>
                                </td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="text-center py-6 bg-white rounded-lg border border-dashed border-slate-200">
                      <p className="text-xs italic text-muted-foreground">Nenhum pagamento registrado.</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

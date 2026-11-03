import React, { useEffect, useRef, useState } from 'react';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { supabase } from '@/lib/customSupabaseClient';
import { confirmAdoptionReceipt } from '@/lib/treeAdoptionReceipt';
import { adoptionProtocol } from '@/lib/treeAdoption';

export default function TreeAdoptionReceiptButton({ request, onReceived }) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const pending = useRef(false), operation = useRef(0);
  useEffect(() => {
    operation.current++; pending.current = false; setOpen(false); setBusy(false); setError('');
    return () => { operation.current++; };
  }, [request.id, user?.id]);
  if (!user || request.author_id !== user.id || request.request_type !== 'muda' || request.status !== 'pronta_retirada') return null;
  const confirm = async () => {
    if (pending.current) return;
    const token = ++operation.current;
    pending.current = true; setBusy(true); setError('');
    try {
      const receipt = await confirmAdoptionReceipt(supabase, request, user.id);
      if (token !== operation.current) return;
      setOpen(false); onReceived?.(receipt);
      window.dispatchEvent(new Event('tree-adoption-updated'));
    } catch (failure) { if (token === operation.current) setError(failure.message); }
    finally { if (token === operation.current) { pending.current = false; setBusy(false); } }
  };
  return <><Button type="button" className="adoption-confirm-receipt" onClick={() => { setError(''); setOpen(true); }}><CheckCircle2 size={17} aria-hidden="true" />Confirmar recebimento</Button>
    <Dialog open={open} onOpenChange={value => { if (!pending.current) setOpen(value); }}><DialogContent role="alertdialog" className="adoption-receipt-dialog sm:max-w-md" onEscapeKeyDown={event => { if (busy) event.preventDefault(); }} onInteractOutside={event => { if (busy) event.preventDefault(); }}><DialogHeader><DialogTitle>Você já recebeu as mudas?</DialogTitle><DialogDescription>Confirme apenas depois de receber todas as mudas do pedido {adoptionProtocol(request)}. O atendimento será encerrado e o recebimento ficará registrado no histórico.</DialogDescription></DialogHeader>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <div className="adoption-receipt-dialog-actions"><Button type="button" variant="outline" disabled={busy} onClick={() => setOpen(false)}>Voltar</Button><Button type="button" disabled={busy} onClick={confirm}>{busy ? <Loader2 size={17} className="animate-spin" /> : <CheckCircle2 size={17} />}Sim, recebi as mudas</Button></div>
    </DialogContent></Dialog>
  </>;
}

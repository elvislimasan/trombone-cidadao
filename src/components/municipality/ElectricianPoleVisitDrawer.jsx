import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { X } from 'lucide-react';
import { lightingStatus } from '@/components/municipality/MunicipalLightingMap';
import { Drawer, BottomSheetContent, DrawerHeader, DrawerTitle, DrawerDescription, DrawerClose } from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { supabase } from '@/lib/customSupabaseClient';
import { poleDisplayLabel, poleReferenceText } from '@/lib/poleDisplay';
import { LAMP_TYPES } from '@/lib/lightingCatalog';
import { showAppNotice } from '@/lib/appError';

const POLE_FIELDS = 'id,identifier,plate,address,latitude,longitude,lighting_status,is_broken,updated_at,lamp_type,lamp_power_w';
const STATUS_LABEL = { aceso: 'Aceso / funcionando', apagado: 'Apagado ou com problema' };
const SERVICE_OPTIONS = [['lamp_replacement', 'Troca de lâmpada'], ['arm_installation', 'Instalação de braço de luz'], ['relay_replacement', 'Troca de relé'], ['other', 'Outro serviço']];
const formatDate = (value) => value ? new Date(value).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : 'Não informado';

export default function ElectricianPoleVisitDrawer({ pole, municipality, onClose, onSaved, onBusyChange }) {
  const cityId = municipality?.city_id;
  const [selected, setSelected] = useState(null);
  const selectionId = useRef(0);
  const [history, setHistory] = useState([]);
  const [activeReports, setActiveReports] = useState([]);
  const [reportId, setReportId] = useState(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [status, setStatus] = useState('apagado');
  const [description, setDescription] = useState('');
  const [lampType, setLampType] = useState('');
  const [power, setPower] = useState('');
  const [serviceDone, setServiceDone] = useState(false);
  const [services, setServices] = useState([]);
  const [visitId, setVisitId] = useState(() => crypto.randomUUID());
  const [saving, setSaving] = useState(false);
  const [detailError, setDetailError] = useState('');
  useEffect(() => { onBusyChange?.(saving); }, [saving, onBusyChange]);

  const openPole = useCallback(async (pole) => {
    const token = ++selectionId.current;
    setSelected(pole); setStatus(lightingStatus(pole));
    setDescription(''); setLampType(pole.lamp_type || ''); setPower(pole.lamp_power_w ?? '');
    setServiceDone(false); setServices([]); setVisitId(crypto.randomUUID());
    setDetailError(''); setHistory([]); setActiveReports([]); setReportId(null); setHistoryLoading(true);
    const [current, changes, reports] = await Promise.all([
      supabase.from('poles').select(POLE_FIELDS).eq('id', pole.id).eq('city_id', cityId).single(),
      supabase.from('pole_lighting_changes')
        .select('id,changed_at,old_status,new_status,descricao_servico')
        .eq('city_id', cityId).eq('pole_id', pole.id)
        .order('changed_at', { ascending: false }).limit(20),
      supabase.rpc('solicitacoes_ativas_poste_eletricista', { p_prefeitura: municipality.id, p_poste_id: pole.id }),
    ]);
    if (token !== selectionId.current) return;
    if (current.error) setDetailError(current.error.message);
    else { setSelected((value) => value?.id === pole.id ? current.data : value); setLampType(current.data.lamp_type || ''); setPower(current.data.lamp_power_w ?? ''); }
    if (changes.error) setDetailError(changes.error.message);
    else setHistory(changes.data || []);
    if (reports.error) setDetailError(reports.error.message);
    else {
      setActiveReports(reports.data || []);
      const eligible = (reports.data || []).filter((report) => !report.ordem_id || report.atribuida_a_mim);
      setReportId(eligible[0]?.report_id || null);
    }
    setStatus(reports.data?.length ? 'apagado' : lightingStatus(current.data || pole));
    setHistoryLoading(false);
  }, [cityId, municipality.id]);

  const save = async (event) => {
    event.preventDefault();
    if (!selected || saving || ((serviceDone || (reportId && status === 'aceso')) && !services.length)
      || (status === 'aceso' && activeReports.length > 0 && !reportId)) return;
    setSaving(true); setDetailError('');
    const { data, error: failure } = await Promise.resolve(supabase.rpc('registrar_visita_poste_eletricista_v2', {
      p_prefeitura: municipality.id, p_poste_id: selected.id,
      p_poste_atualizado_em: selected.updated_at,
      p_status: status, p_lamp_type: lampType || null,
      p_power_w: power === '' ? null : Number(power),
      p_servicos: serviceDone || (reportId && status === 'aceso') ? services : [], p_descricao: description.trim(), p_visita_id: visitId,
      p_report: status === 'aceso' ? reportId : null,
    })).catch(() => ({ error: { message: 'Não foi possível confirmar o atendimento. Confira sua conexão e o histórico antes de tentar novamente.' } }));
    setSaving(false);
    if (failure) { setDetailError(failure.message); return; }
    if (data?.report_id) showAppNotice({ title: 'Solicitação resolvida',
      description: activeReports.length > 1
        ? `${activeReports.length - 1} solicitação(ões) ainda aberta(s) neste poste.`
        : data.restantes > 0 ? `${data.restantes} solicitação(ões) ainda pendente(s) nesta ordem.` : 'O mapa foi atualizado.' });
    selectionId.current++;
    setSelected(null);
    onSaved?.({ pole: selected, status, reportId: data?.report_id || null });
    onClose();
  };


  useEffect(() => {
    let active = true;
    if (pole) openPole(pole).catch(() => { if (active) { setDetailError('Não foi possível carregar o poste. Confira sua conexão.'); setHistoryLoading(false); } });
    else setSelected(null);
    const generation = selectionId;
    return () => { active = false; generation.current++; };
  }, [pole, openPole]);
  const currentStatus = selected && (activeReports.length > 0 ? 'apagado' : lightingStatus(selected));
  return (
    <Drawer open={Boolean(selected)} onOpenChange={(open) => { if (!open && !saving) { selectionId.current++; onClose(); } }} dismissible={!saving}>
      <BottomSheetContent>
        <DrawerHeader className="shrink-0 flex-row items-start justify-between gap-3 border-b border-edge-subtle px-4 pb-3 text-left">
          <div className="min-w-0"><DrawerTitle className="break-words font-display text-lg font-extrabold">{poleDisplayLabel(selected)}</DrawerTitle><DrawerDescription className="mt-1 break-words text-xs text-content-secondary">{selected?.address || 'Endereço não informado'}</DrawerDescription></div>
          <DrawerClose asChild><button type="button" disabled={saving} aria-label="Fechar poste" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-content-secondary hover:bg-surface-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-50"><X className="h-5 w-5" /></button></DrawerClose>
        </DrawerHeader>
      {selected && <div className="min-h-0 min-w-0 flex-1 space-y-5 overflow-y-auto overscroll-contain px-4 py-4">
        <p className="text-sm text-content-secondary">Situação atual no mapa: <strong className="text-content-primary">{STATUS_LABEL[currentStatus] || 'Sem problema registrado'}</strong></p>
        <form id="electrician-pole-update" onSubmit={save} className="space-y-4">
          <label className="block text-sm font-semibold">Situação após a visita<select value={status} onChange={(event) => setStatus(event.target.value)} disabled={saving || historyLoading} className="mt-2 h-11 w-full rounded-lg border border-input bg-background px-3 text-sm">{Object.entries(STATUS_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          {activeReports.length > 0 && <fieldset className="space-y-2 rounded-xl border border-edge-subtle p-3"><legend className="px-1 text-sm font-bold">Solicitações em aberto</legend><p className="text-xs text-content-secondary">{status === 'aceso' ? 'Ao salvar, a solicitação selecionada será resolvida. Outras solicitações abertas manterão o poste entre os apagados.' : 'A solicitação selecionada só será resolvida se você confirmar que o poste está aceso / funcionando.'}</p>{activeReports.map((report) => <label key={report.report_id} className="flex items-start gap-2 rounded-lg border border-edge-subtle p-2 text-xs"><input type="radio" name="active-report" checked={reportId === report.report_id} onChange={() => setReportId(report.report_id)} disabled={saving || (report.ordem_id && !report.atribuida_a_mim)} className="mt-0.5 accent-brand" /><span className="min-w-0"><strong className="block break-words">{poleReferenceText(report.title || 'Solicitação de iluminação')}</strong>{report.ordem_id && <span className="mt-0.5 block text-content-secondary">{report.atribuida_a_mim ? `Ordem ${report.ordem_protocolo || ''} em execução` : 'Ordem atribuída a outro eletricista ou ainda não aceita'}</span>}{report.ordem_id && report.atribuida_a_mim && <Link to={`/prefeitura/eletricista/ordem/${report.ordem_id}`} className="mt-1 inline-block font-semibold text-brand underline">Abrir ordem</Link>}</span></label>)}</fieldset>}
          <label className="block text-sm font-semibold">Tipo de lâmpada instalado <span className="font-normal text-content-secondary">(opcional)</span><select value={lampType} onChange={(event) => setLampType(event.target.value)} disabled={saving} className="mt-2 h-11 w-full rounded-lg border border-input bg-background px-3 text-sm"><option value="">Não informado</option>{lampType && !LAMP_TYPES.includes(lampType) && <option value={lampType}>{lampType} (cadastro anterior)</option>}{LAMP_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}</select></label>
          <label className="block text-sm font-semibold">Potência (W) <span className="font-normal text-content-secondary">(opcional)</span><Input type="number" min="0.01" step="0.01" value={power} onChange={(event) => setPower(event.target.value)} disabled={saving} className="mt-2" /></label>
          <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={serviceDone} onChange={(event) => setServiceDone(event.target.checked)} disabled={saving} className="h-4 w-4 accent-brand" />Realizei um serviço neste poste</label>
          {(serviceDone || (reportId && status === 'aceso')) && <fieldset className="space-y-2"><legend className="text-sm font-semibold">Serviços realizados *</legend><p className="text-xs text-content-secondary">Para resolver uma solicitação, selecione o serviço executado. Use Outro serviço para uma vistoria que confirmou o funcionamento.</p>{SERVICE_OPTIONS.map(([key, label]) => <label key={key} className="flex min-h-9 items-center gap-2 rounded-lg border border-edge-subtle px-3 text-sm"><input type="checkbox" checked={services.includes(key)} onChange={(event) => setServices((current) => event.target.checked ? [...current, key] : current.filter((value) => value !== key))} disabled={saving} className="h-4 w-4 accent-brand" />{label}</label>)}</fieldset>}
          <label className="block text-sm font-semibold">{serviceDone ? 'O que foi feito (opcional)' : 'Observação (opcional)'}<textarea value={description} onChange={(event) => setDescription(event.target.value)} maxLength={1000} disabled={saving} placeholder="Descreva a vistoria, o reparo ou o problema encontrado" className="mt-2 min-h-24 w-full rounded-lg border border-input bg-background p-3 text-sm" /></label>
        </form>
        {detailError && <p role="alert" className="text-sm text-danger">{detailError}</p>}
        <section className="border-t border-edge-subtle pt-4"><h2 className="text-sm font-bold">Histórico do poste</h2>{historyLoading ? <p className="mt-2 text-xs text-content-secondary">Carregando histórico…</p> : history.length ? <ol className="mt-3 space-y-3">{history.map((entry) => <li key={entry.id} className="border-l-2 border-brand/40 pl-3"><span className="text-[11px] text-content-secondary">{formatDate(entry.changed_at)}</span><p className="text-xs font-semibold">{STATUS_LABEL[entry.new_status] || entry.new_status}</p>{entry.descricao_servico && <p className="mt-1 whitespace-pre-line text-xs text-content-secondary">{entry.descricao_servico}</p>}</li>)}</ol> : <p className="mt-2 text-xs text-content-secondary">Nenhuma atualização registrada.</p>}</section>
      </div>}
        <footer className="shrink-0 border-t border-edge-subtle bg-surface-raised px-4 pt-3 pb-[max(1rem,var(--safe-area-bottom,0px))]"><Button type="submit" form="electrician-pole-update" disabled={saving || ((serviceDone || (reportId && status === 'aceso')) && !services.length) || (status === 'aceso' && activeReports.length > 0 && !reportId) || Boolean(detailError) || historyLoading} className="min-h-12 w-full">{saving ? 'Salvando…' : reportId && status === 'aceso' ? 'Salvar e resolver solicitação' : activeReports.length > 0 ? 'Salvar sem resolver solicitação' : serviceDone ? 'Registrar serviço atendido' : 'Salvar dados do poste'}</Button></footer>
      </BottomSheetContent>
    </Drawer>
  );
}

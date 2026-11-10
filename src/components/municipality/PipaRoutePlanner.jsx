import React, { useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, Check, CheckCircle2, MapPin, Plus, Route, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import WizardProgress from '@/components/ui/wizard-progress';
import MunicipalDrawer from './MunicipalDrawer';
import PipaMap from './PipaMap';
import PipaWaterStatus from './PipaWaterStatus';
import { pipaWaterPriority } from '@/lib/pipaWaterLevel';
import { PipaField } from './PipaForm';
import { pipaDay, pipaNumber, PIPA_PROVIDERS } from '@/lib/pipa';
import { pipaRpc } from '@/lib/pipaApi';

const STEPS = ['Dados', 'Adicionar caixas', 'Revisar rota'];
export default function PipaRoutePlanner({ data, channels, driver, city, onClose, onSaved, levels }) {
  const drivers = driver ? [driver] : data.drivers.filter(d => d.active && channels.some(c => c.id === d.channel_id && c.manage));
  const [driverId, setDriverId] = useState(driver?.id || drivers[0]?.id || '');
  const [name, setName] = useState('Rota de abastecimento'), [date, setDate] = useState(pipaDay());
  const [ids, setIds] = useState([]), [text, setText] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [step, setStep] = useState(0), [previewId, setPreviewId] = useState(''), [feedback, setFeedback] = useState('');
  const id = useRef(crypto.randomUUID()), saving = useRef(false), previewRef = useRef(null);
  const selectedDriver = drivers.find(d => d.id === driverId);
  const tanks = data.tanks.filter(t => t.active !== false && (!t.channel_id || t.channel_id === selectedDriver?.channel_id)).sort((a,b) => levels ? pipaWaterPriority(a,b,levels) : 0);
  const chosen = ids.map(id => tanks.find(t => t.id === id)).filter(Boolean);
  const preview = tanks.find(t => t.id === previewId);
  useEffect(() => { previewRef.current?.scrollIntoView({ block: 'nearest', behavior: 'auto' }); }, [previewId]);
  const add = tank => {
    if (ids.includes(tank.id)) return;
    if (ids.length >= 100) { setError('A rota pode ter até 100 caixas.'); return; }
    setIds(current => current.includes(tank.id) || current.length >= 100 ? current : [...current, tank.id]); setFeedback(`${tank.name} adicionada à rota.`); setError('');
  };
  const remove = tank => { setIds(current => current.filter(id => id !== tank.id)); setFeedback(`${tank.name} removida da rota.`); };
  const move = (index, change) => setIds(current => { const next = [...current]; [next[index], next[index + change]] = [next[index + change], next[index]]; return next; });
  const goTo = next => { setStep(next); setError(''); setFeedback(''); };
  const submit = async event => {
    event.preventDefault(); if (saving.current) return;
    if (step === 0) { goTo(1); return; }
    if (!ids.length) { setError('Adicione pelo menos uma caixa à rota.'); return; }
    if (step === 1) { goTo(2); return; }
    saving.current = true; setBusy(true); setError('');
    try { const routeId = await pipaRpc('pipa_plan_route', { p_data: { id: id.current, driver_id: driverId, name, scheduled_date: date, tank_ids: ids } }); await onSaved(routeId); }
    catch (failure) { setError(failure.message); }
    finally { saving.current = false; setBusy(false); }
  };
  const stopList = <ol className="pipa-route-stop-list">{chosen.map((tank, index) => <li key={tank.id}>
    <span className="pipa-route-order">{index + 1}</span><span className="pipa-route-stop-name"><strong>{tank.name}</strong><small>{tank.locality}</small></span>
    <div className="pipa-route-order-actions"><button type="button" disabled={busy || index === 0} aria-label={`Subir ${tank.name}`} onClick={() => move(index, -1)}><ArrowUp size={16} /></button><button type="button" disabled={busy || index === ids.length - 1} aria-label={`Descer ${tank.name}`} onClick={() => move(index, 1)}><ArrowDown size={16} /></button><button type="button" disabled={busy} aria-label={`Remover ${tank.name}`} onClick={() => remove(tank)}><X size={16} /></button></div>
  </li>)}</ol>;
  return <MunicipalDrawer open title="Planejar rota" placement="center" busy={busy} onClose={onClose} activeSection={step} description="Adicione as caixas e revise as paradas antes de salvar." navigation={<WizardProgress steps={STEPS} current={step} onSelect={goTo} busy={busy} label="Planejamento da rota" className="pipa-route-progress" />} footer={<div className="pipa-planner-footer">
    <Button variant="outline" disabled={busy} onClick={() => step ? goTo(step - 1) : onClose()}>{step ? 'Voltar' : 'Cancelar'}</Button>
    {step > 0 && <span aria-live="polite" className="pipa-planner-count"><Route size={15} />{ids.length} {ids.length === 1 ? 'caixa' : 'caixas'}</span>}
    <Button type="submit" form="pipa-route-form" disabled={busy || !driverId || step > 0 && !ids.length}>{busy ? 'Salvando…' : step === 2 ? 'Salvar rota' : step === 1 ? 'Revisar rota' : 'Adicionar caixas'}</Button>
  </div>}>
    <form id="pipa-route-form" onSubmit={submit} className="pipa-route-planner" data-planner-step={step}>
      {error && <p className="pipa-error" role="alert">{error}</p>}
      <p className="sr-only" role="status">{feedback}</p>
      <fieldset disabled={busy} className="contents">
        {step === 0 && <div className="pipa-form">
          <PipaField label="Nome da rota" wide><input name="route_name" className="pipa-input" required minLength={2} maxLength={100} placeholder="Ex.: Comunidades da Serra" value={name} onChange={e => setName(e.target.value)} /></PipaField>
          {!driver && <PipaField label="Pipeiro"><select className="pipa-input" required value={driverId} onChange={e => { setDriverId(e.target.value); setIds([]); setPreviewId(''); }}><option value="">Selecione</option>{drivers.map(d => <option key={d.id} value={d.id}>{d.name} · {d.plate}</option>)}</select></PipaField>}
          <PipaField label="Data da rota"><input name="route_date" className="pipa-input" type="date" required min={pipaDay()} value={date} onChange={e => setDate(e.target.value)} /></PipaField>
        </div>}
        {step === 1 && <>
          <div className="pipa-planner-selection-heading"><h3>Adicionar caixas à rota</h3><span>{ids.length}/100</span></div>
          <p className="pipa-note">Toque em uma caixa para conferir o local e use Adicionar à rota.</p>
          <PipaMap tanks={tanks} routeStops={chosen} selectedIds={ids} onSelect={tank => !busy && setPreviewId(tank.id)} city={city} levels={levels} showLegend={false} showPopups={false} />
          {preview && <section ref={previewRef} className="pipa-planner-preview" aria-label="Prévia da caixa">
            <div className="pipa-planner-preview-heading"><span className="pipa-badge">{ids.includes(preview.id) ? <><Check size={13} />Na rota · parada {ids.indexOf(preview.id) + 1}</> : 'Conferir caixa'}</span><button type="button" aria-label="Fechar prévia da caixa" onClick={() => setPreviewId('')}><X size={17} /></button></div>
            <h3>{preview.name}</h3><p className="pipa-driver-locality"><MapPin size={15} />{preview.locality}</p>{preview.address && <p className="pipa-note">{preview.address}</p>}
            {levels && <PipaWaterStatus level={levels.get(preview.id)} compact />}
            <div className="pipa-planner-preview-meta"><span>{PIPA_PROVIDERS[preview.provider]}</span>{preview.capacity_liters && <span>{pipaNumber(preview.capacity_liters)} L</span>}</div>
            {ids.includes(preview.id) ? <Button type="button" variant="outline" onClick={() => remove(preview)}><X size={16} className="mr-2" />Remover da rota</Button> : <Button type="button" onClick={() => add(preview)}><Plus size={16} className="mr-2" />Adicionar à rota</Button>}
          </section>}
          <section><PipaField label="Buscar caixa"><input className="pipa-input" placeholder="Nome ou localidade" value={text} onChange={e => setText(e.target.value)} /></PipaField>
            <div className="pipa-route-options">{tanks.filter(t => `${t.name} ${t.locality}`.toLocaleLowerCase('pt-BR').includes(text.toLocaleLowerCase('pt-BR'))).map(tank => <div key={tank.id} className="pipa-planner-option" data-added={ids.includes(tank.id)}>
              <button type="button" className="pipa-planner-option-details" aria-label={`Ver detalhes de ${tank.name}`} onClick={() => setPreviewId(tank.id)}><span><strong>{tank.name}</strong><small>{tank.locality}</small></span>{levels && <PipaWaterStatus level={levels.get(tank.id)} compact />}</button>
              {ids.includes(tank.id) ? <span className="pipa-planner-added"><CheckCircle2 size={17} />Na rota</span> : <Button type="button" variant="outline" size="sm" aria-label={`Adicionar ${tank.name} à rota`} onClick={() => add(tank)}><Plus size={15} className="mr-1" />Adicionar</Button>}
            </div>)}{!tanks.length && <p className="pipa-note">Nenhuma caixa ativa disponível.</p>}</div>
          </section>
        </>}
        {step === 2 && <>
          <section className="pipa-planner-review"><span className="pipa-driver-eyebrow"><Route size={16} />Revisão da rota</span><h3>{name}</h3><div className="pipa-note">{date.split('-').reverse().join('/')} · {selectedDriver?.name} · {ids.length} {ids.length === 1 ? 'caixa' : 'caixas'}</div></section>
          <PipaMap tanks={chosen} routeStops={chosen} selectedIds={ids} showLegend={false} showPopups={false} />
          <div className="pipa-planner-selection-heading"><h3>Ordem das paradas</h3><Button type="button" variant="ghost" size="sm" onClick={() => goTo(1)}>Adicionar mais</Button></div>
          {stopList}
        </>}
      </fieldset>
    </form>
  </MunicipalDrawer>;
}

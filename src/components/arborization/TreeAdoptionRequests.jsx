import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ClipboardList, Clock3, Leaf, Loader2, Sprout } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { supabase } from '@/lib/customSupabaseClient';
import useTreeAdoptionCatalog from '@/hooks/useTreeAdoptionCatalog';
import { loadAdoptionRequest } from '@/lib/treeAdoptionClient';
import TreeAdoptionRequestCard, { AdoptionStatus } from './TreeAdoptionRequestCard';
import './treeAdoptionManagement.css';
import { adoptionItems, adoptionQuantity, ADOPTION_TYPES, ADOPTION_ZONES, ADOPTION_PLACES, ADOPTION_PURPOSES, ADOPTION_WIRING, adoptionProviderLabel, ADOPTION_STATUSES, ADOPTION_TERMINAL, adoptionNextStatuses, adoptionProtocol, availableAdoptionSpecies, availableAdoptionProviders } from '@/lib/treeAdoption';

const selectClass = 'min-h-[44px] w-full min-w-0 rounded-md border bg-background px-3 text-sm';
const formatDate = value => value ? new Date(value).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—';
const localDate = (value = new Date()) => new Date(value).toLocaleDateString('en-CA', { timeZone: 'America/Fortaleza' });

export function AdoptionSelect({ label, value, onChange, options, placeholder = 'Selecione…', disabled, required = false }) {
  return <label className="grid min-w-0 gap-1.5 text-sm font-medium">{label}<select required={required} className={selectClass} value={value} disabled={disabled} onChange={event => onChange(event.target.value)}>{placeholder && <option value="">{placeholder}</option>}{Object.entries(options).map(([key, text]) => <option key={key} value={key}>{text}</option>)}</select></label>;
}

function RequestDetails({ request, manager, dispatcher, catalog, onClose, onUpdated }) {
  const { user } = useAuth();
  const [events, setEvents] = useState([]);
  const [eventsError, setEventsError] = useState('');
  const [eventsLoading, setEventsLoading] = useState(true);
  const [status, setStatus] = useState(manager ? request.status : '');
  const [message, setMessage] = useState('');
  const [speciesId, setSpeciesId] = useState(request.approved_species_id || request.species_id);
  const [provider, setProvider] = useState(request.confirmed_provider || request.provider);
  const [scheduledAt, setScheduledAt] = useState('');
  const [fulfilledOn, setFulfilledOn] = useState(localDate);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const terminal = ADOPTION_TERMINAL.includes(request.status);
  const items = adoptionItems(request);
  const requestedSpecies = request.species?.common_name || catalog.species.find(item => item.id === request.species_id)?.common_name || 'Espécie cadastrada';
  const confirmedSpecies = catalog.species.find(item => item.id === request.approved_species_id)?.common_name;
  const approvalSpecies = availableAdoptionSpecies(catalog.species, catalog.availability);
  const approvalProviders = availableAdoptionProviders(catalog.availability, speciesId);
  const needsConfirmation = status !== request.status && (status === 'aprovada'
    || (!request.approved_species_id && ['agendada', 'pronta_retirada', 'concluida'].includes(status)));
  useEffect(() => {
    let active = true;
    setEventsLoading(true);
    supabase.from('tree_adoption_events').select('*').eq('request_id', request.id).order('created_at').then(({ data, error: failure }) => {
      if (active) { setEvents(data || []); setEventsError(failure ? 'Não foi possível carregar o histórico.' : ''); setEventsLoading(false); }
    });
    return () => { active = false; };
  }, [request.id, revision]);
  const submit = async event => {
    event.preventDefault();
    if (busyRef.current) return;
    if (needsConfirmation && items.length === 1 && !approvalProviders.some(item => item.provider === provider)) {
      setError('Cadastre a disponibilidade da espécie no fornecedor antes de aprovar.'); return;
    }
    busyRef.current = true; setBusy(true); setError('');
    try {
      const { error: failure } = await supabase.rpc('update_tree_adoption', { p_id: request.id, p_expected_status: request.status,
        p_status: status, p_message: message.trim(), p_details: { species_id: speciesId, provider,
          scheduled_at: scheduledAt ? new Date(scheduledAt).toISOString() : null, fulfilled_on: fulfilledOn || null } });
      if (failure) throw failure;
      window.dispatchEvent(new Event('tree-adoption-updated'));
      onUpdated(); onClose();
    } catch (err) { setError(err.message || 'Não foi possível atualizar. Seus dados foram mantidos.'); }
    finally { busyRef.current = false; setBusy(false); }
  };
  const options = manager ? [request.status, ...adoptionNextStatuses(request).filter(key => dispatcher || ['solicitada', 'em_analise', 'aguardando_informacao', 'aguardando_disponibilidade'].includes(key) || (key === 'cancelada' && request.author_id === user?.id))]
    : [...(request.status === 'aguardando_informacao' ? [request.status] : []), 'cancelada'];
  return <Dialog open onOpenChange={open => { if (!open && !busyRef.current) onClose(); }}>
    <DialogContent className="adoption-request-dialog max-h-[92dvh] w-[calc(100%-1.5rem)] max-w-5xl overflow-y-auto" onInteractOutside={event => { if (busy) event.preventDefault(); }} onEscapeKeyDown={event => { if (busy) event.preventDefault(); }}>
      <DialogHeader className="adoption-detail-header"><div className="adoption-detail-title"><span className="adoption-request-icon"><Sprout size={25} /></span><div><p className="adoption-detail-eyebrow">Adote uma árvore</p><DialogTitle>{adoptionProtocol(request)}</DialogTitle><DialogDescription>{ADOPTION_TYPES[request.request_type]}</DialogDescription></div></div><AdoptionStatus status={request.status} /></DialogHeader>
      <div className="adoption-detail-layout"><div className="adoption-detail-context"><section className="adoption-detail-summary"><h3><Leaf size={16} />Resumo do pedido</h3><dl className="grid min-w-0 gap-4 text-sm sm:grid-cols-2">
        {[["Solicitante", request.requester_name || 'Não informado no pedido antigo'], ['Telefone / WhatsApp', request.requester_phone], ['E-mail', request.requester_email], ['Quantidade total', adoptionQuantity(request)], ["Espécie solicitada", requestedSpecies], ['Fornecedor solicitado', adoptionProviderLabel(request.provider, catalog)], ['Local', `${ADOPTION_ZONES[request.zone]} · ${ADOPTION_PLACES[request.planting_place]}`], ['Finalidade', ADOPTION_PURPOSES[request.purpose]], ['Fiação acima do plantio', ADOPTION_WIRING[request.overhead_wiring]], ['Endereço / referência', [request.address, request.neighborhood].filter(Boolean).join(' · ')], ['Espécie confirmada', confirmedSpecies], ['Fornecedor confirmado', adoptionProviderLabel(request.confirmed_provider, catalog)], ['Plantio agendado', request.scheduled_at && formatDate(request.scheduled_at)], ['Data do atendimento', request.fulfilled_on && request.fulfilled_on.split('-').reverse().join('/')]].filter(([, value]) => value).map(([label, value]) => <div key={label} className="min-w-0"><dt className="text-xs text-content-secondary">{label}</dt><dd className="mt-1 break-words font-medium">{value}</dd></div>)}
      </dl>
      <ul className="space-y-2 text-sm" aria-label="Espécies e quantidades solicitadas">{items.map(item => <li key={item.species_id}>{item.quantity} × {catalog.species.find(row => row.id === item.species_id)?.common_name || (item.species_id === request.species_id ? requestedSpecies : 'Espécie cadastrada')} · {adoptionProviderLabel(item.provider, catalog)}</li>)}</ul>
      {request.notes && <div className="adoption-detail-notes"><p>Observações do solicitante</p><p>{request.notes}</p></div>}
      <a className="text-sm font-semibold text-primary underline" href={`https://www.google.com/maps/search/?api=1&query=${request.latitude},${request.longitude}`} target="_blank" rel="noreferrer">Ver local do plantio no mapa</a>
      {request.tree_id && <Link className="text-sm font-semibold text-primary underline" to={`/arborizacao/arvore/${request.tree_id}`}>Ver árvore plantada no inventário</Link>}
      </section><section className="adoption-detail-history"><h3><Clock3 size={16} />Histórico e orientações da equipe</h3>
        {eventsError ? <div role="alert"><p>{eventsError}</p><Button variant="outline" size="sm" onClick={() => setRevision(value => value + 1)}>Tentar novamente</Button></div> : eventsLoading ? <p role="status" className="flex items-center gap-2 text-xs text-content-secondary"><Loader2 className="h-4 w-4 animate-spin" />Carregando histórico…</p> : !events.length ? <p className="text-xs text-content-secondary">Nenhuma atualização registrada.</p> : <ol className="adoption-timeline">{events.map(item => <li key={item.id}><span className="adoption-timeline-dot" aria-hidden="true" /><AdoptionStatus status={item.status} /><p>{item.message}</p><time dateTime={item.created_at}>{formatDate(item.created_at)}</time></li>)}</ol>}
      </section></div>
      {!terminal ? <form onSubmit={submit} className="adoption-detail-action">
        <h3 className="font-semibold">{manager ? 'Atender solicitação' : 'Falar com a equipe'}</h3>
        <fieldset disabled={busy} className="min-w-0">
          {!dispatcher && manager && <p className="text-sm text-content-secondary">Você pode receber, orientar e registrar pendências. O gestor aprova, agenda e confirma a conclusão.</p>}
          <AdoptionSelect required label={manager ? 'Status da solicitação' : 'Próxima ação'} value={status} onChange={setStatus} options={Object.fromEntries(options.map(key => [key, key === request.status ? (manager ? `${ADOPTION_STATUSES[key]} (atual)` : 'Responder à informação solicitada') : ADOPTION_STATUSES[key]]))} />
          {manager && <p className="text-xs text-content-secondary">Escolha o status desejado diretamente. Para enviar apenas uma orientação, mantenha o status atual.</p>}
          {needsConfirmation && <><p className="text-sm text-content-secondary">Confirme a disponibilidade e a adequação de todas as espécies e quantidades do pedido ao espaço e à fiação. O atendimento confirma o pedido completo.</p>{items.length === 1 ? <><AdoptionSelect required label="Espécie aprovada" value={speciesId} onChange={value => { setSpeciesId(value); setProvider(''); }} options={Object.fromEntries(approvalSpecies.map(item => [item.id, item.common_name]))} /><AdoptionSelect required label="Fornecedor confirmado" value={provider} onChange={setProvider} options={Object.fromEntries(approvalProviders.map(item => [item.provider, adoptionProviderLabel(item.provider, catalog)]))} /></> : <p className="text-sm text-content-secondary">As espécies, os viveiros e as quantidades listados no resumo serão confirmados em conjunto.</p>}</>}
          {status === 'agendada' && status !== request.status && <label className="grid gap-1.5 text-sm font-medium">Data e hora do plantio<Input required type="datetime-local" value={scheduledAt} onChange={event => setScheduledAt(event.target.value)} /></label>}
          {status === 'pronta_retirada' && status !== request.status && <p className="text-sm text-content-secondary">Informe abaixo o endereço, os horários e as orientações para retirar a muda no fornecedor confirmado.</p>}
          {status === 'concluida' && <><label className="grid gap-1.5 text-sm font-medium">{request.request_type === 'muda' ? 'Data da entrega da muda' : 'Data do plantio realizado'}<Input required type="date" min={localDate(request.created_at)} max={localDate()} value={fulfilledOn} onChange={event => setFulfilledOn(event.target.value)} /></label><p className="text-sm text-content-secondary">{request.request_type === 'plantio' ? 'Confirme somente após a execução no ponto solicitado. A árvore será cadastrada no inventário com a espécie aprovada.' : 'Confirme somente após a entrega. A retirada de uma muda não comprova que ela foi plantada.'}</p></>}
          <label className="grid gap-1.5 text-sm font-medium">{manager ? 'Mensagem e orientações para o cidadão' : 'Mensagem para a equipe'}<textarea required minLength={5} maxLength={3000} rows={4} className="w-full rounded-md border bg-background p-3 font-normal" value={message} onChange={event => setMessage(event.target.value)} /></label>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <Button type="submit" disabled={!status || message.trim().length < 5}>{busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Registrar atualização</Button>
        </fieldset>
      </form> : <aside className="adoption-detail-action"><span className="adoption-request-icon"><ClipboardList size={24} /></span><h3>Atendimento encerrado</h3><p className="text-sm text-content-secondary">O resultado e as orientações ficam registrados no histórico deste pedido.</p></aside>}</div>
    </DialogContent>
  </Dialog>;
}

export default function TreeAdoptionRequests({ cityId, city, management = false, headingLevel = 2, requestId = null, onRequestClose, revision: externalRevision = 0 }) {
  const Heading = headingLevel === 1 ? 'h1' : 'h2';
  const { user } = useAuth();
  const catalog = useTreeAdoptionCatalog(cityId);
  const [authorized, setAuthorized] = useState(false);
  const [dispatcher, setDispatcher] = useState(false);
  const [permissionLoading, setPermissionLoading] = useState(management);
  const [permissionError, setPermissionError] = useState('');
  const [items, setItems] = useState([]);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState(management ? 'ativas' : 'todas');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState(null);
  const [openingRequest, setOpeningRequest] = useState(false);
  const [requestError, setRequestError] = useState('');
  const [requestAttempt, setRequestAttempt] = useState(0);
  const [revision, setRevision] = useState(0);
  const refresh = useCallback(() => setRevision(value => value + 1), []);
  useEffect(() => {
    let active = true;
    setSelected(null); setRequestError(''); setOpeningRequest(false);
    if (!requestId || !user?.id || !cityId || management) return;
    setOpeningRequest(true);
    loadAdoptionRequest(supabase, { requestId, cityId, userId: user.id }).then(row => {
      if (active) setSelected(row);
    }).catch(error => {
      if (active) setRequestError(error.message);
    }).finally(() => { if (active) setOpeningRequest(false); });
    return () => { active = false; };
  }, [requestId, cityId, user?.id, management, requestAttempt]);
  useEffect(() => {
    let active = true;
    setPermissionError(''); setPermissionLoading(management);
    if (management && user?.id && cityId) Promise.all([supabase.rpc('can_manage_tree_adoption', { p_city: cityId }), supabase.rpc('can_dispatch_tree_adoption', { p_city: cityId })]).then(([access, dispatch]) => {
      if (active) { setAuthorized(!access.error && access.data === true); setDispatcher(!dispatch.error && dispatch.data === true); setPermissionError(access.error || dispatch.error ? 'Não foi possível verificar o acesso aos pedidos de arborização.' : ''); setPermissionLoading(false); }
    });
    else setPermissionLoading(false);
    return () => { active = false; };
  }, [management, user?.id, cityId, revision]);
  useEffect(() => {
    window.addEventListener('tree-adoption-updated', refresh);
    window.addEventListener('focus', refresh);
    return () => { window.removeEventListener('tree-adoption-updated', refresh); window.removeEventListener('focus', refresh); };
  }, [refresh]);
  useEffect(() => {
    let active = true;
    if (!user?.id || !cityId || (management && !authorized)) return;
    setLoading(true); setError('');
    let query = supabase.from('tree_adoption_requests').select('*,species:city_tree_species!species_id(common_name)', { count: 'exact' }).eq('city_id', cityId);
    if (!management) query = query.eq('author_id', user.id);
    if (filter === 'ativas') query = query.not('status', 'in', `(${ADOPTION_TERMINAL.join(',')})`);
    else if (filter !== 'todas') query = query.eq('status', filter);
    query.order('created_at', { ascending: false }).order('id').range((page - 1) * 10, page * 10 - 1).then(({ data, count: total, error: failure }) => {
      if (active) {
        setItems(data || []); setCount(total || 0); setError(failure ? 'Não foi possível carregar os pedidos. Confira sua conexão e tente novamente.' : ''); setLoading(false);
        if (!failure && page > Math.max(1, Math.ceil((total || 0) / 10))) setPage(Math.max(1, Math.ceil((total || 0) / 10)));
      }
    });
    return () => { active = false; };
  }, [user?.id, cityId, management, authorized, filter, page, revision, externalRevision]);
  if (!user) return <div className="space-y-3 text-sm text-content-secondary"><p>Entre na sua conta para acompanhar suas solicitações.</p>{requestId && <Button asChild><Link to="/login" state={{ from: { pathname: '/adote-uma-arvore', search: `?${new URLSearchParams({ cidade: String(cityId), aba: 'minhas', pedido: requestId })}` } }}>Entrar para ver o pedido</Link></Button>}</div>;
  if (management && permissionLoading && !authorized) return <p role="status" className="text-sm">Verificando acesso à arborização…</p>;
  if (management && permissionError) return <div role="alert" className="text-sm"><p>{permissionError}</p><Button variant="outline" onClick={refresh}>Tentar novamente</Button></div>;
  if (management && !authorized) return <p className="text-sm text-content-secondary">Pedidos disponíveis para gestores e atendentes com responsabilidade de Arborização nesta cidade.</p>;
  return <section className={management ? 'tree-adoption-management-content' : 'adoption-citizen-requests'} data-section="pedidos" aria-label={management ? 'Atendimento Adote uma árvore' : 'Minhas solicitações de árvores'}>
    {catalog.error && <p role="alert" className="text-sm text-destructive">{catalog.error} <button className="underline" onClick={catalog.refresh}>Tentar novamente</button></p>}
    {openingRequest && <p role="status" className="flex items-center gap-2 text-sm"><Loader2 className="h-4 w-4 animate-spin" />Abrindo pedido da notificação…</p>}
    {requestError && <div role="alert" className="flex flex-wrap items-center gap-3 text-sm"><p>{requestError}</p><Button variant="outline" size="sm" onClick={() => setRequestAttempt(value => value + 1)}>Tentar novamente</Button></div>}
      <div className="adoption-queue-toolbar"><div>{management ? <Heading className="text-xl font-bold tracking-tight">Solicitações</Heading> : <h3>Seus pedidos de árvores</h3>}<p>{loading ? 'Atualizando pedidos…' : error ? 'Consulta indisponível' : `${count} ${count === 1 ? 'solicitação neste filtro' : 'solicitações neste filtro'}`}</p></div><AdoptionSelect label="Filtrar solicitações" value={filter} placeholder={null} onChange={value => { setFilter(value); setPage(1); }} options={{ ativas: 'Em atendimento', todas: 'Todas as solicitações', ...ADOPTION_STATUSES }} /></div>
      {loading ? <div role="status" className="adoption-queue-empty"><Loader2 className="h-6 w-6 animate-spin" /><p>Carregando solicitações…</p></div> : error ? <div role="alert" className="adoption-queue-empty"><p>{error}</p><Button variant="outline" onClick={refresh}>Tentar novamente</Button></div> : !items.length ? <div className="adoption-queue-empty"><span className="adoption-request-icon"><Sprout size={28} /></span><h3>Nenhuma solicitação neste filtro e nesta cidade.</h3><p>{management ? 'Os pedidos de mudas e plantio aparecerão aqui quando forem enviados pelos cidadãos.' : 'Depois de enviar um pedido, você poderá consultar o histórico e as orientações da equipe aqui.'}</p></div> : <div className="adoption-request-list">{items.map(item => <TreeAdoptionRequestCard key={item.id} item={item} catalog={catalog} onOpen={() => setSelected(item)} />)}</div>}
      {count > 10 && <div className="flex flex-wrap items-center justify-end gap-3 text-sm"><Button variant="outline" disabled={loading || page === 1} onClick={() => setPage(value => value - 1)}>Anterior</Button><span>Página {page} de {Math.ceil(count / 10)}</span><Button variant="outline" disabled={loading || page * 10 >= count} onClick={() => setPage(value => value + 1)}>Próxima</Button></div>}
    {selected && <RequestDetails key={selected.id} request={selected} manager={management && authorized} dispatcher={dispatcher} catalog={catalog} onClose={() => { setSelected(null); onRequestClose?.(); }} onUpdated={refresh} />}
  </section>;
}

import React, { useEffect, useRef, useState } from 'react';
import { Helmet } from 'react-helmet';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, CheckCircle2, Flower2, Leaf, Loader2, Plus, ShieldCheck, Sprout, Sun, Trees } from 'lucide-react';
import { Button } from '@/components/ui/button';
import TreeCollectionIntro, { TreeCollectionToolbar } from '@/components/arborization/TreeCollectionIntro';
import TreeAdoptionHeader from '@/components/arborization/TreeAdoptionHeader';
import TreeAdoptionIntroduction from '@/components/arborization/TreeAdoptionIntroduction';
import TreeAdoptionWelcome from '@/components/arborization/TreeAdoptionWelcome';
import TreeAdoptionRequests from '@/components/arborization/TreeAdoptionRequests';
import TreeAdoptionLocation from '@/components/arborization/TreeAdoptionLocation';
import TreeAdoptionSpecies from '@/components/arborization/TreeAdoptionSpecies';
import { TreeJourneyNav, TreePlantingNextStep } from '@/components/arborization/TreeJourney';
import { TreeFormHeading, TreeFormProgress } from '@/components/arborization/TreeFormLayout';
import { AdoptionChoiceGroup } from '@/components/arborization/TreeAdoptionFields';
import { CityViewProvider, useCityView } from '@/contexts/CityContext';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { supabase } from '@/lib/customSupabaseClient';
import { cityStateUf } from '@/lib/cityLocation';
import { readAdoptionDraft, storeAdoptionDraft, submitAdoptionRequest } from '@/lib/treeAdoptionClient';
import useTreeAdoptionCatalog from '@/hooks/useTreeAdoptionCatalog';
import { ADOPTION_CITY_ID, ADOPTION_CITY_NOTICE, adoptionItems, adoptionQuantity, ADOPTION_TYPES, ADOPTION_ZONES, ADOPTION_PLACES, ADOPTION_PURPOSES, ADOPTION_WIRING, adoptionProviderLabel, EMPTY_ADOPTION, adoptionProtocol, validateAdoption, adoptionPayload } from '@/lib/treeAdoption';
import '@/components/arborization/treeAdoption.css';
import '@/components/arborization/treeAdoptionFlow.css';

const draftStorage = () => { try { return window.sessionStorage; } catch { return null; } };
const STEPS = [
  { label: 'Pedido', title: 'Seu pedido', description: 'Escolha o atendimento e informe seu contato.' },
  { label: 'Local', title: 'Onde plantar?', description: 'Marque no mapa e confira o endereço.' },
  { label: 'Mudas', title: 'Escolha suas mudas', description: 'Defina a quantidade e o viveiro.' },
  { label: 'Revisão', title: 'Confira e envie', description: 'Revise os dados do pedido.' },
];

function ReviewSection({ title, onEdit, children }) {
  return <section className="adoption-review-section"><div className="adoption-review-heading"><h3 className="font-semibold">{title}</h3><button type="button" aria-label={`Alterar ${title.toLowerCase()}`} className="rounded text-xs font-semibold text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={onEdit}>Alterar</button></div>{children}</section>;
}

function ReviewFields({ items }) {
  return <dl className="adoption-review-fields">{items.map(([label, value]) => <div className="min-w-0" key={label}><dt className="text-xs text-content-secondary">{label}</dt><dd className="mt-1 break-words text-sm font-medium">{value || 'Não informado'}</dd></div>)}</dl>;
}

function AdoptionCommitment({ checked, onChange, disabled }) {
  return <label className="adoption-commitment adoption-footer-commitment"><input type="checkbox" disabled={disabled} checked={checked} onChange={event => onChange(event.target.checked)} /><span>Comprometo-me a cuidar das mudas e seguir as orientações da equipe.<small>Sujeito à avaliação e disponibilidade. Em área pública, aguarde autorização.</small></span></label>;
}

function AdoptionForm({ cityId, city, cityLabel, onSubmitted, onShowRequests }) {
  const { user } = useAuth();
  const catalog = useTreeAdoptionCatalog(cityId, true);
  const [draft] = useState(() => readAdoptionDraft(draftStorage(), cityId, user?.id));
  const initialForm = () => ({ ...EMPTY_ADOPTION, requester_name: user?.name || user?.user_metadata?.full_name || '', requester_phone: user?.phone || '', requester_email: user?.email || '' });
  const [form, setForm] = useState(() => ({ ...initialForm(), ...draft?.form }));
  const [step, setStep] = useState(draft?.step || 0);
  const [error, setError] = useState('');
  const [needsLogin, setNeedsLogin] = useState(false);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const requestId = useRef(draft?.requestId || crypto.randomUUID());
  const [locating, setLocating] = useState(false);
  const [success, setSuccess] = useState(null);
  useEffect(() => {
    storeAdoptionDraft(draftStorage(), cityId, user?.id, success ? null : { form, step, requestId: requestId.current });
  }, [form, step, success, cityId, user?.id]);
  const headingRef = useRef(null);
  const errorRef = useRef(null);
  useEffect(() => { if (error) errorRef.current?.focus(); }, [error]);
  const items = adoptionItems(form);
  const change = values => { setError(''); setForm(current => ({ ...current, ...values })); };
  const move = next => {
    setStep(next); setError('');
    requestAnimationFrame(() => {
      headingRef.current?.focus({ preventScroll: true });
      headingRef.current?.scrollIntoView({ block: 'nearest', behavior: 'instant' });
    });
  };
  const submit = async event => {
    event.preventDefault();
    if (busyRef.current) return;
    const message = validateAdoption(form, cityId, catalog.species, step < 3 ? step : null, catalog.availability);
    if (message) { setError(message); return; }
    if (step < 3) { move(step + 1); return; }
    busyRef.current = true; setBusy(true); setError(''); setNeedsLogin(false);
    try {
      const data = await submitAdoptionRequest(supabase, adoptionPayload(form, cityId, requestId.current), user.id);
      setSuccess(data); onSubmitted(); window.dispatchEvent(new Event('tree-adoption-updated'));
    } catch (err) { setError(err.message || 'Não foi possível enviar. Seus dados foram mantidos para tentar novamente.'); setNeedsLogin(Boolean(err.needsLogin)); if (err.code === '23514') catalog.refresh(); }
    finally { busyRef.current = false; setBusy(false); }
  };
  const loginState = { from: { pathname: '/adoteumaarvore', search: `?cidade=${cityId}&aba=solicitar` } };
  if (!user) return <section className="adoption-auth-panel"><span className="adoption-auth-icon"><Sprout className="h-8 w-8" /></span><h2 className="text-2xl font-bold">O primeiro passo para uma cidade mais verde</h2><p className="max-w-xl text-sm leading-relaxed text-content-secondary">Entre na sua conta para solicitar uma muda ou plantio, escolher uma espécie e acompanhar as orientações da equipe.</p><Button asChild><Link to="/login" state={loginState}>Entrar para solicitar</Link></Button></section>;
  if (success) return <section className="adoption-auth-panel adoption-success-panel" role="status"><CheckCircle2 className="h-10 w-10 text-primary" /><h2 className="text-2xl font-bold">Sua solicitação foi enviada</h2><div className="adoption-receipt"><span>Protocolo do pedido</span><strong>{adoptionProtocol(success)}</strong></div><p className="max-w-xl text-sm leading-relaxed text-content-secondary">A equipe de arborização de {cityLabel} avaliará o local e a espécie. Aguarde a confirmação antes de ir ao fornecedor.</p><ol className="adoption-success-steps" aria-label="Próximos passos"><li><span>1</span>Veja o andamento e responda às orientações em Meus pedidos.</li><li><span>2</span>Aguarde a confirmação para retirar as mudas ou acompanhar o plantio.</li><li><span>3</span>Depois de plantar, cadastre sua árvore e comece o diário de cuidados.</li></ol><div className="flex flex-wrap justify-center gap-3"><Button onClick={onShowRequests}>Acompanhar solicitação</Button><Button variant="outline" onClick={() => { setSuccess(null); setForm(initialForm()); requestId.current = crypto.randomUUID(); move(0); }}>Fazer outra solicitação</Button></div></section>;
  const intro = <TreeFormHeading className="adoption-form-intro" headingRef={headingRef} step={step} total={STEPS.length} title={STEPS[step].title} description={STEPS[step].description} />;
  return <div className="adoption-form-layout tree-form-theme">
    <TreeAdoptionWelcome cityName={city?.name} step={step} quantity={adoptionQuantity(form)} requestType={form.request_type} />
    <form onSubmit={submit} noValidate className="adoption-form" data-step={step} aria-label="Solicitar muda ou plantio">
    <TreeFormProgress steps={STEPS} current={step} onSelect={move} busy={busy} label="Etapas da solicitação" />
    <div className="adoption-form-body">
      {step > 1 && intro}
      <fieldset disabled={busy} className="adoption-step-content">
        {step === 0 && <div className="adoption-request-layout">
          <div className="adoption-request-form">
          {intro}
          <AdoptionChoiceGroup legend="O que você precisa?" value={form.request_type} onChange={request_type => change({ request_type })} options={[
            { value: 'muda', label: 'Receber mudas', description: 'Você retira e planta.', icon: Sprout },
            { value: 'plantio', label: 'Pedir plantio', description: 'A equipe avalia e realiza o plantio.', icon: Trees },
          ]} />
          <AdoptionChoiceGroup className="adoption-purpose-choices" legend="Finalidade" value={form.purpose} onChange={purpose => change({ purpose })} options={[
            { value: 'sombra', label: 'Sombra', icon: Sun },
            { value: 'ornamentacao', label: 'Ornamental', icon: Flower2 },
            { value: 'frutifera', label: 'Frutífera', icon: Leaf },
          ]} />
          <section className="adoption-contact-fields" aria-label="Dados do solicitante">
            <div className="tree-form-section-label"><h3>Contato</h3></div>
            <label className="adoption-field">Nome completo<input autoComplete="name" required maxLength={160} value={form.requester_name} onChange={event => change({ requester_name: event.target.value })} /></label>
            <label className="adoption-field">Telefone / WhatsApp com DDD<input type="tel" autoComplete="tel" required maxLength={30} placeholder="(87) 99999-9999" value={form.requester_phone} onChange={event => change({ requester_phone: event.target.value })} /></label>
            <label className="adoption-field">E-mail (opcional)<input type="email" autoComplete="email" maxLength={254} value={form.requester_email} onChange={event => change({ requester_email: event.target.value })} /></label>
          </section>
          </div>
        </div>}
        {step === 1 && <TreeAdoptionLocation intro={intro} form={form} city={city} cityLabel={cityLabel} onChange={change} busy={busy} onLocatingChange={setLocating} />}
        {step === 2 && <TreeAdoptionSpecies catalog={catalog} form={form} onChange={change} cityId={cityId} />}
        {step === 3 && <div className="tree-review-summary">
          <ReviewSection title="Atendimento" onEdit={() => move(0)}><ReviewFields items={[["Pedido", ADOPTION_TYPES[form.request_type]], ['Finalidade', ADOPTION_PURPOSES[form.purpose]], ['Quantidade', adoptionQuantity(form)]]} /></ReviewSection>
          <ReviewSection title="Mudas" onEdit={() => move(2)}><ul className="tree-review-items">{items.map(item => <li key={item.species_id}><span className="tree-review-quantity">{item.quantity}×</span><span><strong>{catalog.species.find(row => row.id === item.species_id)?.common_name || 'Espécie cadastrada'}</strong><small>{adoptionProviderLabel(item.provider, catalog)}</small></span></li>)}</ul></ReviewSection>
          <ReviewSection title="Local de plantio" onEdit={() => move(1)}><p className="tree-review-address">{[form.address, form.neighborhood].filter(Boolean).join(' · ')}</p><ReviewFields items={[["Cidade", cityLabel], ['Espaço', `${ADOPTION_ZONES[form.zone]} · ${ADOPTION_PLACES[form.planting_place]}`], ['Fiação', ADOPTION_WIRING[form.overhead_wiring]]]} /></ReviewSection>
          <ReviewSection title="Contato" onEdit={() => move(0)}><div className="tree-review-contact"><strong>{form.requester_name}</strong><span>{form.requester_phone}</span>{form.requester_email && <span>{form.requester_email}</span>}</div></ReviewSection>
          <details className="tree-review-note"><summary>Adicionar observação (opcional)</summary><label className="adoption-field"><span className="sr-only">Observação para a equipe</span><textarea maxLength={3000} rows={3} placeholder="Algo que a equipe precisa saber?" value={form.notes} onChange={event => change({ notes: event.target.value })} /></label></details>
          <p className="tree-review-privacy"><ShieldCheck size={16} aria-hidden="true" /><span>Pedido visível para você e a equipe.{form.request_type === 'plantio' ? ' O plantio concluído aparecerá no inventário público.' : ''}</span></p>
        </div>}
      </fieldset>
      {step === 3 && <AdoptionCommitment disabled={busy} checked={form.commitment} onChange={commitment => change({ commitment })} />}
      {error && <div ref={errorRef} tabIndex={-1} role="alert" className="adoption-form-error"><p>{error}</p>{needsLogin && <Button asChild variant="outline" size="sm" className="mt-2"><Link to="/login" state={loginState}>Entrar novamente</Link></Button>}</div>}
    </div>
    <footer className="adoption-form-footer"><div>{step > 0 ? <Button type="button" variant="outline" disabled={busy} onClick={() => move(step - 1)}><ArrowLeft className="mr-2 h-4 w-4" />Voltar</Button> : <span className="adoption-draft-note"><ShieldCheck size={14} aria-hidden="true" />Seu progresso é salvo nesta sessão</span>}</div><Button type="submit" className="gap-2" disabled={busy || locating || (step === 2 && (catalog.loading || !!catalog.error || !catalog.species.length))}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : step === 3 ? <Sprout className="h-4 w-4" /> : null}{busy ? 'Enviando…' : step === 3 ? 'Enviar solicitação' : step === 2 ? 'Revisar pedido' : 'Continuar'}{step < 3 && <ArrowRight className="h-4 w-4" />}</Button></footer>
    </form>
  </div>;
}

export function AdoptTreeContent() {
  const { cityId, city } = useCityView();
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const tab = ['solicitar', 'minhas'].includes(params.get('aba')) ? params.get('aba') : 'programa';
  const [formStarted, setFormStarted] = useState(tab === 'solicitar');
  const closeRequest = () => setParams(current => {
    const next = new URLSearchParams(current);
    next.delete('pedido');
    return next;
  }, { replace: true });
  const setTab = nextTab => {
    if (nextTab === 'solicitar') setFormStarted(true);
    setParams(current => {
      const next = new URLSearchParams(current);
      if (nextTab !== 'minhas') next.delete('pedido');
      if (nextTab === 'programa') next.delete('aba'); else next.set('aba', nextTab);
      return next;
    });
    window.scrollTo({ top: 0, behavior: 'instant' });
  };
  const [revision, setRevision] = useState(0);
  const cityLabel = city ? [city.name, cityStateUf(city)].filter(Boolean).join(' · ') : '';
  const supportedCity = String(cityId) === String(ADOPTION_CITY_ID);
  const contextKey = `${cityId}:${user?.id || 'visitor'}`;
  return <main className={`tree-adoption-page page-shell-fluid${tab === 'programa' ? ' tree-adoption-overview-page' : tab === 'minhas' ? ' tree-collection-page tree-collection-scope' : ''}`}>
    <Helmet><title>{tab === 'minhas' ? 'Meus pedidos | Adote uma árvore' : 'Adote uma árvore'}</title><meta name="description" content="Solicite uma muda ou plantio, escolha uma espécie e acompanhe o atendimento da equipe de arborização da sua cidade." /></Helmet>
    {tab === 'minhas' ? <><TreeCollectionToolbar /><TreeCollectionIntro title="Meus pedidos" description="Da primeira muda ao seu novo jardim."><Button onClick={() => setTab('solicitar')}><Plus size={17} />Solicitar muda</Button></TreeCollectionIntro><TreeJourneyNav cityId={cityId} active="requests" /></> : <TreeAdoptionHeader cityId={cityId} city={city} tab={tab} onTabChange={setTab} />}
    {tab === 'programa' && <TreeAdoptionIntroduction city={city} onStart={() => setTab('solicitar')} />}
    {tab !== 'programa' && (!cityId || !city) && <p className="rounded-xl border border-dashed p-6 text-sm text-content-secondary">Selecione a cidade do plantio para começar.</p>}
    {tab === 'solicitar' && cityId && city && !supportedCity && <div role="alert" className="rounded-xl border bg-surface-raised p-6 text-sm leading-relaxed"><h2 className="mb-2 text-lg font-semibold">Programa ainda não disponível em {city.name}</h2><p>{ADOPTION_CITY_NOTICE}</p></div>}
    {cityId && city && <>
      {supportedCity && (formStarted || tab === 'solicitar') && <div className="adoption-form-slot" hidden={tab !== 'solicitar'}><AdoptionForm key={contextKey} cityId={cityId} city={city} cityLabel={cityLabel} onSubmitted={() => setRevision(value => value + 1)} onShowRequests={() => setTab('minhas')} /></div>}
      {tab === 'minhas' && <div className="adoption-requests-panel"><TreeAdoptionRequests key={contextKey} cityId={cityId} requestId={params.get('pedido')} onRequestClose={closeRequest} revision={revision} /><TreePlantingNextStep cityId={cityId} /></div>}
    </>}
  </main>;
}

function AdoptTreeRoute() {
  const context = useCityView();
  const [params, setParams] = useSearchParams();
  const requestedCity = params.get('cidade');
  if (!requestedCity) return <AdoptTreeContent />;
  const city = context.cities.find(item => String(item.id) === requestedCity);
  const value = { ...context, cityId: city?.id || null, city: city || null, cityName: city?.name || '', setCityId: id => {
    const next = new URLSearchParams(params);
    if (id) next.set('cidade', String(id));
    else { next.delete('cidade'); context.setCityId(null); }
    setParams(next);
  } };
  return <CityViewProvider value={value}><AdoptTreeContent /></CityViewProvider>;
}

export default function AdoptTreePage() { return <CityViewProvider><AdoptTreeRoute /></CityViewProvider>; }

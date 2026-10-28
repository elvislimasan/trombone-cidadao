import React, { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { Helmet } from 'react-helmet';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Check, CheckCircle2, Flower2, Leaf, Loader2, MapPin, ShieldCheck, Sprout, Sun, Trees } from 'lucide-react';
import { Button } from '@/components/ui/button';
import TreeAdoptionHeader from '@/components/arborization/TreeAdoptionHeader';
import TreeAdoptionRequests from '@/components/arborization/TreeAdoptionRequests';
import TreeAdoptionLocation from '@/components/arborization/TreeAdoptionLocation';
import TreeAdoptionSpecies from '@/components/arborization/TreeAdoptionSpecies';
import { AdoptionChoiceGroup } from '@/components/arborization/TreeAdoptionFields';
import { CityViewProvider, useCityView } from '@/contexts/CityContext';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { supabase } from '@/lib/customSupabaseClient';
import { cityStateUf } from '@/lib/cityLocation';
import { readAdoptionDraft, storeAdoptionDraft, submitAdoptionRequest } from '@/lib/treeAdoptionClient';
import useTreeAdoptionCatalog from '@/hooks/useTreeAdoptionCatalog';
import { ADOPTION_TYPES, ADOPTION_ZONES, ADOPTION_PLACES, ADOPTION_PURPOSES, ADOPTION_WIRING, ADOPTION_PROVIDERS, EMPTY_ADOPTION, adoptionProtocol, validateAdoption, adoptionPayload } from '@/lib/treeAdoption';
import '@/components/arborization/treeAdoption.css';

const LocationPickerMap = lazy(() => import('@/components/LocationPickerMap'));
const draftStorage = () => { try { return window.sessionStorage; } catch { return null; } };
const STEPS = [
  { label: 'Seu pedido', title: 'Como você quer participar?', description: 'Escolha o tipo de atendimento e o que espera da sua árvore.' },
  { label: 'Local de plantio', title: 'Onde a árvore vai crescer?', description: 'Marque o ponto no mapa e conte um pouco sobre o espaço disponível.' },
  { label: 'Árvore e fornecedor', title: 'Escolha sua árvore', description: 'Escolha entre as espécies com disponibilidade informada pela equipe.' },
  { label: 'Revisão', title: 'Tudo certo para enviar?', description: 'Confira suas escolhas. A equipe avaliará o local e confirmará o atendimento.' },
];

function ReviewSection({ title, onEdit, children }) {
  return <section className="adoption-review-section"><div className="adoption-review-heading"><h3 className="font-semibold">{title}</h3><button type="button" aria-label={`Alterar ${title.toLowerCase()}`} className="rounded text-xs font-semibold text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={onEdit}>Alterar</button></div>{children}</section>;
}

function ReviewFields({ items }) {
  return <dl className="adoption-review-fields">{items.map(([label, value]) => <div className="min-w-0" key={label}><dt className="text-xs text-content-secondary">{label}</dt><dd className="mt-1 break-words text-sm font-medium">{value || 'Não informado'}</dd></div>)}</dl>;
}

function AdoptionForm({ cityId, city, cityLabel, onSubmitted, onShowRequests }) {
  const { user } = useAuth();
  const catalog = useTreeAdoptionCatalog(cityId, true);
  const [draft] = useState(() => readAdoptionDraft(draftStorage(), cityId, user?.id));
  const [form, setForm] = useState(draft?.form || { ...EMPTY_ADOPTION });
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
  const species = catalog.species.find(item => item.id === form.species_id);
  const change = values => { setError(''); setForm(current => ({ ...current, ...values })); };
  const move = next => {
    setStep(next); setError('');
    requestAnimationFrame(() => headingRef.current?.focus({ preventScroll: true }));
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
  const loginState = { from: { pathname: '/adote-uma-arvore', search: `?cidade=${cityId}` } };
  if (!user) return <section className="adoption-auth-panel"><span className="adoption-auth-icon"><Sprout className="h-8 w-8" /></span><h2 className="text-2xl font-bold">O primeiro passo para uma cidade mais verde</h2><p className="max-w-xl text-sm leading-relaxed text-content-secondary">Entre na sua conta para solicitar uma muda ou plantio, escolher uma espécie e acompanhar as orientações da equipe.</p><Button asChild><Link to="/login" state={loginState}>Entrar para solicitar</Link></Button></section>;
  if (success) return <section className="adoption-auth-panel adoption-success-panel" role="status"><CheckCircle2 className="h-10 w-10 text-primary" /><h2 className="text-2xl font-bold">Sua solicitação foi enviada</h2><div className="adoption-receipt"><span>Protocolo do pedido</span><strong>{adoptionProtocol(success)}</strong></div><p className="max-w-xl text-sm leading-relaxed text-content-secondary">A equipe de arborização de {cityLabel} avaliará o local e a espécie. Aguarde a confirmação antes de ir ao fornecedor.</p><div className="flex flex-wrap justify-center gap-3"><Button onClick={onShowRequests}>Acompanhar solicitação</Button><Button variant="outline" onClick={() => { setSuccess(null); setForm({ ...EMPTY_ADOPTION }); requestId.current = crypto.randomUUID(); move(0); }}>Fazer outra solicitação</Button></div></section>;
  const intro = <div className="adoption-form-intro"><span className="adoption-intro-step">Etapa {step + 1} de {STEPS.length}</span><h2 ref={headingRef} tabIndex={-1} className="font-bold outline-none">{STEPS[step].title}</h2><p className="text-content-secondary">{STEPS[step].description}</p></div>;
  return <form onSubmit={submit} noValidate className="adoption-form" data-step={step} aria-label="Solicitar muda ou plantio">
    <nav className="adoption-stepper" aria-label="Etapas da solicitação">{STEPS.map(({ label }, index) => <button type="button" key={label} disabled={busy || index > step} aria-current={step === index ? 'step' : undefined} onClick={() => move(index)} className={`adoption-step ${step === index ? 'is-current' : ''} ${step > index ? 'is-complete' : ''}`}><span className="adoption-step-number">{step > index ? <Check className="h-4 w-4" /> : index + 1}</span><span className="adoption-step-label">{label}</span><span className="sr-only">{index === step ? ', etapa atual' : ''}</span></button>)}</nav>
    <div className="adoption-form-body">
      {step !== 1 && intro}
      <fieldset disabled={busy} className="adoption-step-content">
        {step === 0 && <div className="adoption-request-layout">
          <AdoptionChoiceGroup legend="O que você precisa?" value={form.request_type} onChange={request_type => change({ request_type })} options={[
            { value: 'muda', label: 'Quero uma muda', description: 'Você retira a muda no fornecedor e fica responsável pelo plantio.', icon: Sprout },
            { value: 'plantio', label: 'Quero solicitar o plantio', description: 'A equipe avalia o local e agenda o plantio, se aprovado.', icon: Trees },
          ]} />
          <AdoptionChoiceGroup legend="Qual a finalidade principal?" value={form.purpose} onChange={purpose => change({ purpose })} options={[
            { value: 'sombra', label: 'Sombra', description: 'Mais conforto e proteção contra o sol.', icon: Sun },
            { value: 'ornamentacao', label: 'Ornamentação', description: 'Flores e beleza para o espaço.', icon: Flower2 },
            { value: 'frutifera', label: 'Frutífera', description: 'Uma árvore para produzir frutos.', icon: Leaf },
          ]} />
          <div className="adoption-start-guide"><div><span>01</span><h3>Escolha e solicite</h3><p>Informe o local e escolha entre as mudas disponíveis na sua cidade.</p></div><div><span>02</span><h3>A equipe avalia</h3><p>O espaço e a espécie são conferidos antes da confirmação.</p></div><div><span>03</span><h3>Acompanhe por aqui</h3><p>Consulte as orientações e o andamento em Minhas solicitações.</p></div></div>
        </div>}
        {step === 1 && <TreeAdoptionLocation intro={intro} form={form} city={city} cityLabel={cityLabel} onChange={change} busy={busy} onLocatingChange={setLocating} />}
        {step === 2 && <TreeAdoptionSpecies catalog={catalog} form={form} onChange={change} cityId={cityId} />}
        {step === 3 && <div className="adoption-review-layout">
          <div className="adoption-review-column">
            <ReviewSection title="Seu pedido" onEdit={() => move(0)}><ReviewFields items={[["Tipo de atendimento", ADOPTION_TYPES[form.request_type]], ['Finalidade', ADOPTION_PURPOSES[form.purpose]]]} /></ReviewSection>
            <ReviewSection title="Árvore e fornecimento" onEdit={() => move(2)}><div className="adoption-review-species"><span className="adoption-choice-icon"><Sprout className="h-5 w-5" /></span><div><p className="font-semibold">{species?.common_name}</p>{species?.scientific_name && <p className="text-xs italic text-content-secondary">{species.scientific_name}</p>}</div></div><ReviewFields items={[["Fornecedor desejado", ADOPTION_PROVIDERS[form.provider]]]} /><p className="adoption-review-hint">{form.request_type === 'muda' ? 'Aguarde a confirmação da equipe antes de ir retirar a muda.' : 'A equipe confirmará a espécie e o agendamento do plantio.'}</p></ReviewSection>
            <ReviewSection title="Local de plantio" onEdit={() => move(1)}><ReviewFields items={[["Cidade", cityLabel], ['Espaço', `${ADOPTION_ZONES[form.zone]} · ${ADOPTION_PLACES[form.planting_place]}`], ['Endereço / referência', form.address], ['Bairro ou localidade', form.neighborhood], ['Fiação aérea', ADOPTION_WIRING[form.overhead_wiring]]]} /></ReviewSection>
          </div>
          <div className="adoption-review-column">
            <section className="adoption-review-map" aria-label="Ponto de plantio"><div className="adoption-review-map-heading"><h3><MapPin className="h-4 w-4 text-primary" />Ponto de plantio · {cityLabel}</h3><button type="button" onClick={() => move(1)}>Ajustar local</button></div><div className="adoption-review-map-canvas"><Suspense fallback={<div className="flex h-full items-center justify-center"><Loader2 className="h-5 w-5 animate-spin" /></div>}><LocationPickerMap initialPosition={{ lat: Number(form.latitude), lng: Number(form.longitude) }} initialZoom={16} readOnly /></Suspense></div></section>
            <label className="adoption-field">Observações para a equipe <span className="text-xs font-normal text-content-secondary">Opcional</span><textarea maxLength={3000} rows={3} placeholder="Conte sobre o espaço, o acesso ou algum cuidado necessário" value={form.notes} onChange={event => change({ notes: event.target.value })} /></label>
            <label className="adoption-commitment"><input type="checkbox" checked={form.commitment} onChange={event => change({ commitment: event.target.checked })} className="mt-1 shrink-0 accent-primary" /><span>Comprometo-me a cuidar da muda e seguir as orientações. Entendo que o atendimento depende da avaliação do local, da espécie e da disponibilidade. Em área pública, é necessária a autorização da equipe.</span></label>
            <p className="flex items-start gap-2 text-xs leading-relaxed text-content-secondary"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" /><span>O pedido e o histórico ficam disponíveis para você e a equipe.{form.request_type === 'plantio' ? ' Após a confirmação do plantio, a árvore e sua localização serão exibidas no inventário público.' : ''}</span></p>
          </div>
        </div>}
      </fieldset>
      {error && <div role="alert" className="adoption-form-error"><p>{error}</p>{needsLogin && <Button asChild variant="outline" size="sm" className="mt-2"><Link to="/login" state={loginState}>Entrar novamente</Link></Button>}</div>}
    </div>
    <footer className="adoption-form-footer"><div>{step > 0 ? <Button type="button" variant="outline" disabled={busy} onClick={() => move(step - 1)}><ArrowLeft className="mr-2 h-4 w-4" />Voltar</Button> : <p className="text-xs text-content-secondary">Você confere tudo antes de enviar.</p>}</div><Button type="submit" className="gap-2" disabled={busy || locating || (step === 2 && (catalog.loading || !!catalog.error || !catalog.species.length))}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : step === 3 ? <Sprout className="h-4 w-4" /> : null}{busy ? 'Enviando…' : step === 3 ? 'Enviar solicitação' : 'Continuar'}{step < 3 && <ArrowRight className="h-4 w-4" />}</Button></footer>
  </form>;
}

export function AdoptTreeContent() {
  const { cityId, city } = useCityView();
  const { user } = useAuth();
  const [tab, setTab] = useState('solicitar');
  const [revision, setRevision] = useState(0);
  const cityLabel = city ? [city.name, cityStateUf(city)].filter(Boolean).join(' · ') : '';
  const contextKey = `${cityId}:${user?.id || 'visitor'}`;
  return <main className="tree-adoption-page page-shell-fluid">
    <Helmet><title>Adote uma árvore</title><meta name="description" content="Solicite uma muda ou plantio, escolha uma espécie e acompanhe o atendimento da equipe de arborização da sua cidade." /></Helmet>
    <TreeAdoptionHeader cityId={cityId} city={city} tab={tab} onTabChange={setTab} />
    {!cityId || !city ? <p className="rounded-xl border border-dashed p-6 text-sm text-content-secondary">Selecione a cidade do plantio para começar.</p> : <>
      <div className="adoption-form-slot" hidden={tab !== 'solicitar'}><AdoptionForm key={contextKey} cityId={cityId} city={city} cityLabel={cityLabel} onSubmitted={() => setRevision(value => value + 1)} onShowRequests={() => setTab('minhas')} /></div>
      {tab === 'minhas' && <div className="adoption-requests-panel"><TreeAdoptionRequests key={contextKey} cityId={cityId} revision={revision} /></div>}
    </>}
    <p className="adoption-page-note"><ShieldCheck className="h-4 w-4 shrink-0" />A equipe avalia cada pedido para garantir uma espécie adequada ao local e um plantio seguro.</p>
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

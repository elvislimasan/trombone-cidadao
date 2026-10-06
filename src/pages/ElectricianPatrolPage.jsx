import React, { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Helmet } from 'react-helmet';
import { Link, Navigate, useLocation, useNavigate, useOutletContext } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, Loader2, Radar, Route, Timer, Zap } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { Haptics, NotificationType } from '@capacitor/haptics';
import { Button } from '@/components/ui/button';
import PatrolTravelModePicker from '@/components/patrol/PatrolTravelModePicker';
import PatrolAvatarStudio from '@/components/patrol/PatrolAvatarStudio';
import PatrolDisclaimer from '@/components/patrol/PatrolDisclaimer';
import PatrolHud from '@/components/patrol/PatrolHud';
import PatrolExitSheet from '@/components/patrol/PatrolExitSheet';
import ElectricianPatrolAlert from '@/components/municipality/ElectricianPatrolAlert';
import ElectricianPoleVisitDrawer from '@/components/municipality/ElectricianPoleVisitDrawer';
import { useNavigationGps } from '@/hooks/useNavigationGps';
import { useElectricianPatrol } from '@/hooks/useElectricianPatrol';
import { usePatrolRecorder } from '@/hooks/usePatrolRecorder';
import { usePatrolAvatar } from '@/hooks/usePatrolAvatar';
import { usePatrolExitGuard } from '@/hooks/usePatrolExitGuard';
import { useNavVoice } from '@/hooks/useNavVoice';
import { poleDisplayLabel } from '@/lib/poleDisplay';
import { patrolTravelModeFromSearch, readStoredPatrolTravelMode, storePatrolTravelMode } from '@/lib/patrolTravelMode';
import { storePatrolAvatar, toElectricianPatrolAvatar } from '@/lib/patrolAvatarConfig';

const MapView = lazy(() => import('@/components/MapView'));
const ROOT = '/prefeitura/eletricista';
const noop = () => {};

export default function ElectricianPatrolPage({ running = false }) {
  const { municipality } = useOutletContext();
  const { search } = useLocation();
  const mode = patrolTravelModeFromSearch(search);
  if (running && !mode) return <Navigate to={`${ROOT}/patrulha`} replace />;
  return running ? <PatrolSession key={municipality.id} municipality={municipality} mode={mode} /> : <Preparation />;
}

function Preparation() {
  const avatarProfile = usePatrolAvatar();
  const [avatar, setAvatar] = useState(null);
  const professionalAvatar = toElectricianPatrolAvatar(avatar || avatarProfile);
  const [studio, setStudio] = useState(false);
  const [mode, setMode] = useState(() => { try { return readStoredPatrolTravelMode(localStorage); } catch { return 'driving'; } });
  return <div className="h-[100dvh] overflow-y-auto bg-surface-base text-content-primary">
    <Helmet><title>Preparar patrulha | Eletricista</title><meta name="robots" content="noindex" /></Helmet>
    <div className="page-shell-fluid pt-[max(1.5rem,env(safe-area-inset-top))] pb-28">
      <Link to={`${ROOT}/perfil`} className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold"><ArrowLeft size={18} />Voltar ao perfil</Link>
      <h1 className="mt-4 font-display text-3xl font-extrabold">Patrulha de iluminação</h1>
      <div className="mt-6 min-w-0">
        <PatrolTravelModePicker value={mode} onChange={(next) => { setMode(next); try { storePatrolTravelMode(localStorage, next); } catch {} }} avatar={professionalAvatar} onEscolherBoneco={() => setStudio(true)} />
      </div>
    </div>
    <footer className="fixed inset-x-0 bottom-0 z-[1000] border-t border-edge-subtle bg-surface-raised pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
      <div className="page-shell-fluid flex items-center justify-between gap-3"><span className="min-w-0 text-sm font-bold">Iluminação pública</span><Button asChild className="min-h-12 shrink-0"><Link to={`${ROOT}/patrulha/ativa?modo=${mode}`}><Radar className="mr-2 h-5 w-5" />Iniciar patrulha</Link></Button></div>
    </footer>
    {studio && <PatrolAvatarStudio electrician avatar={avatar || avatarProfile} modo={mode} onFechar={() => setStudio(false)} onChange={(next) => { setAvatar(next); try { storePatrolAvatar(localStorage, next); } catch {} }} />}
  </div>;
}

function PatrolSession({ municipality, mode }) {
  const navigate = useNavigate();
  const profileAvatar = usePatrolAvatar();
  const avatar = useMemo(() => toElectricianPatrolAvatar(profileAvatar), [profileAvatar]);
  const [accepted, setAccepted] = useState(false);
  const [phase, setPhase] = useState('running');
  const [selected, setSelected] = useState(null);
  const [visitSaving, setVisitSaving] = useState(false);
  const [revision, setRevision] = useState(0);
  const [restart, setRestart] = useState(0);
  const [saveError, setSaveError] = useState('');
  const [result, setResult] = useState(null);
  const [mapPosition, setMapPosition] = useState(null);
  const ending = useRef(false);
  const { posicao, erro, sinalFraco, velocidadeKmh } = useNavigationGps({ ativo: accepted && phase === 'running' && !selected, restart });
  const recorder = usePatrolRecorder(phase === 'running' && !erro && !sinalFraco ? posicao : null, { cityId: municipality.city_id, travelMode: mode, lighting: true });
  const { registrarPostePassado, registrarPosteAtualizado } = recorder;
  const { alert, dismiss, poles } = useElectricianPatrol({ enabled: accepted && phase !== 'summary', cityId: municipality.city_id, position: posicao, paused: phase !== 'running' || Boolean(selected) || Boolean(erro), revision });
  const { anunciar, preparar, mudo, alternarMudo, suportada } = useNavVoice();
  const announced = useRef(null);
  useEffect(() => { if (posicao && !selected && phase === 'running') setMapPosition(posicao); }, [posicao, selected, phase]);
  useEffect(() => {
    if (!alert) return;
    registrarPostePassado(alert.pole.id);
    const key = `${alert.pole.id}:${alert.expiresAt}`;
    if (announced.current === key) return;
    announced.current = key;
    anunciar(`Poste com problema a ${Math.round(alert.distance)} metros. Pare em um local seguro para atualizar.`);
    if (Capacitor.isNativePlatform()) Haptics.notification({ type: NotificationType.Warning }).catch(noop);
    else navigator.vibrate?.([100, 60, 100]);
  }, [alert, anunciar, registrarPostePassado]);
  const clusters = useMemo(() => poles.map((pole) => ({ isCluster: false, lat: pole.latitude, lng: pole.longitude, count: 1, ids: [`pole:${pole.id}`], report: { id: `pole:${pole.id}`, pole, title: poleDisplayLabel(pole), category: 'iluminacao', status: 'pending', location: { lat: pole.latitude, lng: pole.longitude } } })), [poles]);
  const returnToProfile = useCallback(() => navigate(`${ROOT}/perfil`, { replace: true }), [navigate]);
  const back = () => {
    if (ending.current) return;
    if (phase === 'summary') { leave(); return; }
    if (!accepted) { leave(); return; }
    if (selected) { if (!visitSaving) setSelected(null); return; }
    setPhase((current) => current === 'exit' ? 'running' : 'exit');
  };
  const leave = usePatrolExitGuard({ onBack: back, onLeave: returnToProfile, saved: phase === 'summary' });
  const finish = async () => {
    if (ending.current) return;
    ending.current = true; setSaveError(''); setPhase('saving');
    const duration = recorder.duracaoAgora();
    const saved = await recorder.finalizar();
    ending.current = false;
    if (!saved.ok) { setSaveError('Não foi possível salvar a patrulha. Confira sua conexão e tente novamente.'); setPhase('exit'); return; }
    setResult({ duration, distance: recorder.distanciaM, ...recorder.poleCounts, offline: saved.offline });
    setPhase('summary');
  };
  return <div className="fixed inset-0 isolate overflow-hidden bg-surface-base text-content-primary">
    <Helmet><title>Patrulha de iluminação | Eletricista</title><meta name="robots" content="noindex" /></Helmet>
    {mapPosition && <Suspense fallback={null}><MapView clusters={clusters} initialCenter={mapPosition} navMode navPosition={mapPosition} navTravelMode={mode} navAvatar={avatar} navGpsAtivo={!sinalFraco && !erro} navTrail={recorder.rastro} showLegend={false} showModeToggle={false} interactive={false} onReportClick={(item) => { if (phase === 'running' && item.pole) { dismiss(); setSelected(item.pole); } }} onUpvote={noop} onUpdateClick={noop} onBoundsChange={noop} onRecenter={noop} /></Suspense>}
    {accepted && phase === 'running' && !selected && <>
      <PatrolHud categoriaNome="Iluminação · Eletricista" modoDeslocamento={mode} velocidadeKmh={velocidadeKmh} rua={municipality.cidade?.name || 'Patrulha de iluminação'} sinalFraco={sinalFraco || Boolean(erro)} totalNaFila={0} cardVisivel={Boolean(alert)} mudo={mudo} onAlternarSom={alternarMudo} somSuportado={suportada} emMovimento={posicao?.emMovimento} onSair={() => setPhase('exit')} />
      {!posicao && !erro && <p role="status" className="absolute inset-x-4 top-32 z-[1100] rounded-2xl bg-surface-raised p-4 text-center"><Loader2 className="mx-auto mb-2 animate-spin" />Obtendo sua localização…</p>}
      {erro && <div role="alert" className="absolute inset-x-4 top-32 z-[1100] rounded-2xl bg-surface-raised p-4 text-center"><p>{erro === 'negado' ? 'Permita o acesso à localização para patrulhar.' : 'Não foi possível obter sua localização.'}</p><Button className="mt-3" onClick={() => setRestart((value) => value + 1)}>Tentar GPS novamente</Button></div>}
      {alert && <ElectricianPatrolAlert alert={alert} onDismiss={dismiss} onUpdate={(pole) => { dismiss(); setSelected(pole); }} />}
    </>}
    {!accepted && <PatrolDisclaimer modoDeslocamento={mode} onCancelar={leave} onAceitar={() => { preparar(); anunciar('Patrulha de iluminação iniciada'); setAccepted(true); }} />}
    <ElectricianPoleVisitDrawer pole={selected} municipality={municipality} onBusyChange={setVisitSaving} onClose={() => setSelected(null)} onSaved={({ pole }) => { registrarPosteAtualizado(pole.id); setRevision((value) => value + 1); }} />
    {(phase === 'exit' || phase === 'saving') && <>
      <PatrolExitSheet contagens={{ confirmadas: recorder.poleCounts.updated }} duracaoS={recorder.duracaoAgora()} distanciaM={recorder.distanciaM} professional salvando={phase === 'saving'} onContinuar={() => { setSaveError(''); setPhase('running'); }} onEncerrar={finish} onDescartar={leave} />
      {saveError && <p role="alert" className="fixed inset-x-4 top-[max(1rem,env(safe-area-inset-top))] z-[1300] rounded-xl bg-surface-raised p-4 text-danger shadow-lg">{saveError}</p>}
    </>}
    {phase === 'summary' && <div className="absolute inset-0 z-[1300] overflow-y-auto bg-surface-base">
      <div className="page-shell-fluid py-[max(2rem,env(safe-area-inset-top))]">
        <CheckCircle2 className="h-12 w-12 text-success-fg" /><h1 className="mt-4 text-3xl font-extrabold">Patrulha concluída</h1>
        <p role="status" className="mt-2 text-content-secondary">{result.offline ? 'Patrulha guardada neste aparelho. Será sincronizada quando a conexão voltar.' : 'Sua patrulha e os atendimentos realizados foram salvos.'}</p>
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{[[Timer, `${Math.floor(result.duration / 60)} min ${result.duration % 60}s`, 'Tempo'], [Route, `${Math.round(result.distance)} m`, 'Percorrido'], [Radar, result.passed, 'Postes próximos'], [Zap, result.updated, 'Postes atualizados']].map(([Icon, value, label]) => <div key={label} className="rounded-2xl border border-edge-subtle bg-surface-raised p-5"><Icon className="h-5 w-5 text-brand" /><strong className="mt-3 block text-2xl">{value}</strong><span className="text-sm text-content-secondary">{label}</span></div>)}</div>
        <Button className="mt-6 min-h-12" onClick={leave}>Voltar ao perfil</Button>
      </div>
    </div>}
  </div>;
}

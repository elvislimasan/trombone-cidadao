import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Helmet } from 'react-helmet';
import { Link } from 'react-router-dom';
import { ArrowLeft, BookOpen, Check, Copy, Loader2, RefreshCw, Save, Send, Sparkles, X } from 'lucide-react';
import { useCity } from '@/contexts/CityContext';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { Button } from '@/components/ui/button';
import {
  EDITORIAL_FORMATS, EDITORIAL_STATES, EDITORIAL_MODULES, editorialSourceHref, editorialLastAnalysis,
  loadEditorial, loadEditorialContents, analyzeEditorial,
  editorialAction, saveEditorial, approveEditorial, publishEditorial, setEditorialDaily,
  generateEditorial, editorialPlainText, exportEditorial,
  EDITORIAL_TONES, EDITORIAL_NEWS_STYLES, EDITORIAL_VIDEO_STYLES, EDITORIAL_SPEAKERS,
  DEFAULT_EDITORIAL_BRIEF, normalizeEditorialBrief, editorialBriefKey, editorialSpeakerOptions, estimatedSpeechSeconds,
} from '@/lib/editorial';
import './editorial.css';

const dateTime = value => value ? new Date(value).toLocaleString('pt-BR', { timeZone: 'America/Fortaleza' }) : 'Ainda não realizada';

function FactPicker({ value, facts, onChange, disabled, label }) {
  return <fieldset className="editorial-fact-picker" disabled={disabled}>
    <legend>{label}</legend>
    {facts.map(fact => <label key={fact.id} title={fact.text}>
      <input type="checkbox" checked={value.includes(fact.id)} onChange={event => onChange(event.target.checked
        ? [...value, fact.id] : value.filter(id => id !== fact.id))} />{fact.id}
    </label>)}
  </fieldset>;
}

function BriefControls({ format, value, onChange, disabled }) {
  return <fieldset className="editorial-brief" disabled={disabled}>
    <legend>Estilo</legend>
    <div className="editorial-brief-grid">
      <label>Tom<select aria-label="Tom editorial" value={value.tone} onChange={event => onChange({ ...value, tone: event.target.value })}>
        {Object.entries(EDITORIAL_TONES).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
      </select></label>
      {format === 'news' ? <label>Abordagem<select aria-label="Abordagem da notícia" value={value.news_style} onChange={event => onChange({ ...value, news_style: event.target.value })}>
        {Object.entries(EDITORIAL_NEWS_STYLES).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
      </select></label> : <label>Condução do vídeo<select aria-label="Condução do vídeo" value={value.video_style} onChange={event => onChange({ ...value, video_style: event.target.value })}>
        {Object.entries(EDITORIAL_VIDEO_STYLES).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
      </select></label>}
    </div>
    <details><summary>Orientação livre</summary><label>Como você quer o conteúdo?<textarea aria-label="Orientação de estilo" value={value.guidance} maxLength={1000}
      placeholder="Ex.: abertura que prenda a atenção, linguagem próxima e uma tirada leve" onChange={event => onChange({ ...value, guidance: event.target.value })} /></label></details>
  </fieldset>;
}

export default function EditorialPage() {
  const { cities, activeCityId, loadingCities } = useCity();
  const { user } = useAuth();
  const [cityId, setCityId] = useState('');
  const [history, setHistory] = useState(false);
  const [module, setModule] = useState('all');
  const [data, setData] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [versions, setVersions] = useState([]);
  const [format, setFormat] = useState('news');
  const [draft, setDraft] = useState(null);
  const [instruction, setInstruction] = useState('');
  const [brief, setBrief] = useState({ ...DEFAULT_EDITORIAL_BRIEF });
  const [verified, setVerified] = useState(false);
  const [publishConfirm, setPublishConfirm] = useState(false);
  const [discardReason, setDiscardReason] = useState('');
  const [discardOpen, setDiscardOpen] = useState(false);
  const [busy, setBusy] = useState('');
  const [loading, setLoading] = useState(false);
  const [contentsLoading, setContentsLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const loadSequence = useRef(0);
  const contentSequence = useRef(0);

  useEffect(() => { if (!cityId && activeCityId) setCityId(String(activeCityId)); }, [activeCityId, cityId]);
  const refresh = useCallback(async () => {
    const sequence = ++loadSequence.current;
    setError(''); setLoading(true);
    try {
      const result = await loadEditorial(Number(cityId), history, module);
      if (sequence === loadSequence.current) {
        setData(result);
        setSelectedId(previous => result.candidates.some(item => item.id === previous) ? previous : result.candidates[0]?.id || null);
      }
    } catch (failure) { if (sequence === loadSequence.current) { setData(null); setError(failure.message); } }
    finally { if (sequence === loadSequence.current) setLoading(false); }
  }, [cityId, history, module, user?.id]);
  useEffect(() => {
    setData(null); setSelectedId(null); setVersions([]); setDraft(null); setNotice('');
    if (cityId) refresh();
    return () => { loadSequence.current++; contentSequence.current++; };
  }, [refresh, cityId]);

  const currentData = data?.cityId === Number(cityId) && data.module === module ? data : null;
  const candidate = currentData?.candidates.find(item => item.id === selectedId);
  const refreshContents = useCallback(async () => {
    const sequence = ++contentSequence.current;
    if (!selectedId || !cityId) { setVersions([]); return; }
    setContentsLoading(true);
    try {
      const result = await loadEditorialContents(Number(cityId), selectedId);
      if (sequence === contentSequence.current) setVersions(result || []);
    } catch (failure) { if (sequence === contentSequence.current) { setVersions([]); setError(failure.message); } }
    finally { if (sequence === contentSequence.current) setContentsLoading(false); }
  }, [cityId, selectedId]);
  useEffect(() => {
    setVersions([]); setDraft(null); setInstruction(''); setBrief({ ...DEFAULT_EDITORIAL_BRIEF }); setVerified(false); setPublishConfirm(false); setDiscardOpen(false); setDiscardReason('');
    refreshContents();
    return () => { contentSequence.current++; };
  }, [refreshContents]);
  const version = useMemo(() => versions.filter(item => item.format === format).sort((a, b) => b.revision - a.revision)[0], [versions, format]);
  useEffect(() => {
    setDraft(version ? structuredClone(version.content) : null);
    if (version) setBrief(normalizeEditorialBrief(version.brief || {}));
    setVerified(false); setPublishConfirm(false);
  }, [version]);
  const dirty = Boolean(version && JSON.stringify(draft) !== JSON.stringify(version.content));
  const styleChanged = Boolean(version && editorialBriefKey(brief, format) !== editorialBriefKey(normalizeEditorialBrief(version.brief || {}), format));
  const needsScriptUpgrade = Boolean(version && format !== 'news' && version.brief?.schema_version !== 1);
  const structuredScript = Boolean(version && format !== 'news' && version.brief?.schema_version === 1);
  const outdated = Boolean(version && candidate && version.facts_hash !== candidate.facts_hash);
  const facts = candidate?.snapshot?.facts || [];
  const permissions = currentData?.permissions || {};
  const assignedElsewhere = candidate?.assigned_to && candidate.assigned_to !== user?.id;
  const active = candidate && ['proposed', 'writing', 'approved', 'published'].includes(candidate.status);
  const canEdit = active && permissions.write && !assignedElsewhere && !version?.news_id
    && (!version || candidate.assigned_to === user?.id);

  async function run(name, operation) {
    setBusy(name); setError(''); setNotice('');
    try { await operation(); }
    catch (failure) { setError(failure.message || 'Não foi possível concluir a ação.'); }
    finally { setBusy(''); }
  }
  function editContent(patch) { setDraft(previous => ({ ...previous, ...patch })); setVerified(false); setPublishConfirm(false); }
  async function generate() {
    await generateEditorial({ candidateId: candidate.id, format, revision: version?.revision || 0, instruction, brief });
    await refreshContents(); await refresh(); setInstruction(''); setNotice('Conteúdo gerado. Confira os fatos e as fontes.');
  }

  return <>
    <Helmet><title>Editorial — Trombone Cidadão</title></Helmet>
    <main className="page-shell-fluid editorial-page" data-testid="editorial-page" aria-busy={Boolean(busy || loading)}>
      <header className="editorial-header">
        <div className="editorial-heading"><Link to="/admin" aria-label="Voltar ao painel"><ArrowLeft size={20} /></Link><h1>Editorial</h1>{module !== 'all' && <span className="editorial-chip">{EDITORIAL_MODULES[module]}</span>}</div>
        <div className="editorial-toolbar">
          <label>Cidade<select aria-label="Cidade editorial" value={cityId} disabled={Boolean(busy) || loadingCities || dirty} onChange={event => setCityId(event.target.value)}>
            <option value="">Selecione uma cidade</option>
            {cities.map(city => <option key={city.id} value={city.id}>{city.name}{city.state?.uf ? ` · ${city.state.uf}` : ''}</option>)}
          </select></label>
          <label>Assunto<select aria-label="Assunto editorial" value={module} disabled={Boolean(busy) || dirty} onChange={event => setModule(event.target.value)}>
            {Object.entries(EDITORIAL_MODULES).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </select></label>
          <Button disabled={!permissions.write || loading || Boolean(busy) || dirty} onClick={() => run('analyze', async () => {
            const result = await analyzeEditorial(Number(cityId), module); await refresh();
            setNotice(result.created ? `${result.created} nova(s) pauta(s).` : 'Sem novas pautas. Os fatos já conhecidos foram preservados.');
          })}>{busy === 'analyze' ? <Loader2 className="animate-spin" size={16} /> : <Sparkles size={16} />} Analisar dados</Button>
          <Button variant="outline" aria-label="Atualizar editorial" disabled={!cityId || Boolean(busy) || loading || dirty} onClick={() => run('refresh', async () => { await refresh(); await refreshContents(); })}><RefreshCw size={16} /></Button>
        </div>
      </header>
      {error && <div role="alert" className="editorial-message editorial-error">{error}</div>}
      {notice && <div role="status" className="editorial-message">{notice}</div>}
      {!cityId && !loadingCities && <div className="editorial-empty">Selecione a cidade para abrir o editorial.</div>}
      {loading && <div className="editorial-loading" role="status"><Loader2 className="animate-spin" size={18} /> Carregando editorial…</div>}
      {currentData && !permissions.read && <div className="editorial-empty">Você não possui acesso editorial a esta cidade. O master pode liberar a equipe.</div>}
      {currentData && permissions.read && <>
        <div className="editorial-status-bar">
          <div className="editorial-tabs" aria-label="Fila editorial">
            <button type="button" aria-pressed={!history} disabled={Boolean(busy) || dirty} onClick={() => setHistory(false)}>Pautas</button>
            <button type="button" aria-pressed={history} disabled={Boolean(busy) || dirty} onClick={() => setHistory(true)}>Histórico</button>
          </div>
          <span>Última análise: {dateTime(editorialLastAnalysis(currentData.settings, module))}</span>
          {permissions.configure ? <label className="editorial-check"><input type="checkbox" checked={Boolean(currentData.settings?.daily_enabled)} disabled={Boolean(busy) || dirty} onChange={event => {
            const enabled = event.target.checked;
            run('daily', async () => { await setEditorialDaily(Number(cityId), enabled); await refresh(); setNotice(enabled ? 'Análise diária de todos os assuntos ativada para 06h (Fortaleza).' : 'Análise diária desativada.'); });
          }} />Diária · todos · 06h</label> : <span>Diária · todos: {currentData.settings?.daily_enabled ? 'ativa' : 'desativada'}</span>}
        </div>
        {currentData.settings?.last_error && <div role="alert" className="editorial-message editorial-error">{currentData.settings.last_error}</div>}
        <div className="editorial-workspace">
          <aside className="editorial-panel editorial-queue" aria-label="Lista de pautas">
            <h2>{history ? 'Histórico' : 'Pautas'} <span>{currentData.candidates.length}</span></h2>
            {!currentData.candidates.length && <p className="editorial-empty">{history ? 'Nenhuma pauta no histórico.' : 'Nenhuma pauta. Analise os dados deste assunto.'}</p>}
            {currentData.candidates.map(item => <button type="button" key={item.id} className={`editorial-candidate ${item.id === selectedId ? 'is-selected' : ''}`}
              aria-pressed={item.id === selectedId} disabled={Boolean(busy) || dirty} onClick={() => setSelectedId(item.id)}>
              <span className="editorial-candidate-state">{EDITORIAL_MODULES[item.module || 'works']} · {EDITORIAL_STATES[item.status]} · {item.priority >= 75 ? 'Alta' : 'Avaliar'}</span>
              <strong>{item.title}</strong><span>{dateTime(item.created_at)}</span>
            </button>)}
            {currentData.candidates.length === 60 && <p className="editorial-note">Exibindo as 60 pautas mais recentes deste recorte.</p>}
          </aside>

          <section className="editorial-panel editorial-editor" aria-label="Produção de conteúdo">
            {!candidate ? <div className="editorial-empty"><BookOpen size={28} />Escolha uma pauta.</div> : <>
              <div className="editorial-section-heading"><h2>{candidate.title}</h2><span className="editorial-chip">{EDITORIAL_STATES[candidate.status]}</span></div>
              <details className="editorial-analysis"><summary>Ver análise</summary><p>{candidate.reason}</p><p>{candidate.decision_reason}</p><small>Prioridade definida por regras do piloto. O número ordena pautas e não comprova veracidade.</small></details>
              {candidate.news_id && <Link className="editorial-public-link" to={`/noticias/${candidate.news_id}`}>Ver notícia publicada</Link>}
              {assignedElsewhere && <p className="editorial-note">Esta pauta está com outro editor. Você pode consultar as versões e fontes.</p>}
              {candidate.assigned_to && ['writing', 'approved'].includes(candidate.status) && (!assignedElsewhere || permissions.configure) && <div className="editorial-actions">
                <Button variant="outline" disabled={Boolean(busy) || dirty} onClick={() => run('release', async () => { await editorialAction(candidate.id, 'release'); await refresh(); setNotice('Pauta liberada para outro editor. As versões foram preservadas.'); })}>Liberar responsável</Button>
              </div>}
              {active && !assignedElsewhere && candidate.status !== 'published' && <div className="editorial-actions">
                {!candidate.assigned_to && <Button variant="outline" disabled={Boolean(busy)} onClick={() => run('claim', async () => { await editorialAction(candidate.id, 'claim'); await refresh(); })}>Assumir pauta</Button>}
                {['proposed', 'writing'].includes(candidate.status) && <Button variant="ghost" disabled={Boolean(busy)} onClick={() => setDiscardOpen(value => !value)}><X size={15} />Descartar</Button>}
              </div>}
              {discardOpen && <div className="editorial-discard"><label>Motivo do descarte<textarea value={discardReason} maxLength={1000} onChange={event => setDiscardReason(event.target.value)} /></label>
                <Button variant="outline" disabled={Boolean(busy) || discardReason.trim().length < 3} onClick={() => run('dismiss', async () => {
                  await editorialAction(candidate.id, 'dismiss', discardReason); setDiscardOpen(false); await refresh(); setNotice('Pauta descartada. Os mesmos fatos não gerarão outra proposta.');
                })}>Confirmar descarte</Button></div>}
              <div className="editorial-production-controls">
                <label>Formato<select aria-label="Formato do conteúdo" value={format} disabled={Boolean(busy) || dirty} onChange={event => { setFormat(event.target.value); setInstruction(''); }}>
                  {Object.entries(EDITORIAL_FORMATS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                </select></label>
                <Button disabled={!canEdit || Boolean(busy) || contentsLoading || dirty || (Boolean(version) && !styleChanged && !needsScriptUpgrade && !outdated) || (candidate.status === 'published' && format === 'news')} onClick={() => run('generate', generate)}>
                  {busy === 'generate' ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}{version ? 'Aplicar estilo em nova versão' : 'Gerar conteúdo'}
                </Button>
              </div>
              <BriefControls format={format} value={brief} disabled={!canEdit || Boolean(busy) || dirty} onChange={value => { setBrief(value); setVerified(false); setPublishConfirm(false); }} />
              {styleChanged && <div className="editorial-style-pending" role="status"><p>O texto abaixo ainda usa o estilo anterior. Gere uma nova versão para aplicar a escolha.</p>
                <Button variant="ghost" size="sm" disabled={Boolean(busy)} onClick={() => setBrief(normalizeEditorialBrief(version.brief || {}))}>Restaurar estilo</Button></div>}
              {contentsLoading && <p role="status">Carregando versões…</p>}
              {!version && !contentsLoading && <p className="editorial-note">Rascunhos são privados. A geração usa a cota diária de IA da cidade.</p>}
              {draft && version && <>
                <div className="editorial-version">Versão {version.revision} · {version.origin === 'ai' ? 'IA' : 'Edição humana'} · {version.approved_at && !outdated ? 'Aprovada' : 'Rascunho privado'}
                  {version.brief?.schema_version === 1 && <> · {EDITORIAL_TONES[version.brief.tone]}</>}</div>
                {outdated && <div role="alert" className="editorial-message editorial-error">A base da pauta mudou. Atualize o texto e confira as novas fontes antes de aprovar.</div>}
                <label>Título<input aria-label="Título do conteúdo" value={draft.title} maxLength={200} disabled={!canEdit || Boolean(busy) || styleChanged} onChange={event => editContent({ title: event.target.value })} /></label>
                <FactPicker label="Fontes do título" value={draft.title_fact_ids} facts={facts} disabled={!canEdit || Boolean(busy) || styleChanged} onChange={value => editContent({ title_fact_ids: value })} />
                <div className="editorial-blocks">{draft.blocks.map((block, index) => <div key={index} className="editorial-block">
                  {structuredScript && <div className="editorial-scene-heading"><strong>Cena {index + 1}</strong><label>Quem fala<select aria-label={`Quem fala na cena ${index + 1}`} value={block.speaker}
                    disabled={!canEdit || Boolean(busy) || styleChanged} onChange={event => editContent({ blocks: draft.blocks.map((entry, offset) => offset === index ? { ...entry, speaker: event.target.value } : entry) })}>
                    {editorialSpeakerOptions(version.brief).map(key => <option key={key} value={key}>{EDITORIAL_SPEAKERS[key]}</option>)}
                  </select></label></div>}
                  <label>{format === 'news' ? 'Parágrafo' : structuredScript ? 'Fala' : 'Locução'} {index + 1}<textarea aria-label={`${format === 'news' ? 'Parágrafo' : structuredScript ? 'Fala' : 'Locução'} ${index + 1}`} rows={4} maxLength={3000} value={block.text} disabled={!canEdit || Boolean(busy) || styleChanged} onChange={event => editContent({
                    blocks: draft.blocks.map((value, offset) => offset === index ? { ...value, text: event.target.value } : value),
                  })} /></label>
                  {structuredScript && <div className="editorial-scene-fields">{[['scene', 'Cena sugerida', 600], ['screen_text', 'Texto na tela', 240]].map(([field, label, limit]) =>
                    <label key={field}>{label}<textarea aria-label={`${label} ${index + 1}`} rows={2} maxLength={limit} value={block[field] || ''} disabled={!canEdit || Boolean(busy) || styleChanged}
                      onChange={event => editContent({ blocks: draft.blocks.map((entry, offset) => offset === index ? { ...entry, [field]: event.target.value } : entry) })} /></label>)}</div>}
                  <FactPicker label={`Fontes do trecho ${index + 1}`} value={block.fact_ids} facts={facts} disabled={!canEdit || Boolean(busy) || styleChanged} onChange={value => editContent({ blocks: draft.blocks.map((entry, offset) => offset === index ? { ...entry, fact_ids: value } : entry) })} />
                </div>)}</div>
                {format !== 'news' && <p className="editorial-note">Locução estimada: {estimatedSpeechSeconds(draft.blocks)} s. Confira em leitura e confirme as imagens antes de gravar.</p>}
                <div className="editorial-actions"><Button variant="outline" disabled={!canEdit || (!dirty && !outdated) || Boolean(busy) || styleChanged} onClick={() => run('save', async () => { await saveEditorial(version.id, draft); await refreshContents(); await refresh(); setNotice('Nova versão salva. A aprovação anterior não se aplica às alterações.'); })}><Save size={16} />Salvar versão</Button>
                  {dirty && <Button variant="ghost" disabled={Boolean(busy)} onClick={() => { setDraft(structuredClone(version.content)); setVerified(false); setPublishConfirm(false); }}>Desfazer edição</Button>}
                </div>
                {dirty && <p className="editorial-note">Salve ou desfaça a edição antes de trocar de pauta, cidade ou formato.</p>}
                {canEdit && <details className="editorial-adjustment"><summary>Ajustar com IA</summary>
                  <label>Pedido de ajuste<textarea value={instruction} maxLength={1000} placeholder="Ex.: deixar mais objetivo" disabled={Boolean(busy)} onChange={event => setInstruction(event.target.value)} /></label>
                  <Button variant="outline" disabled={Boolean(busy) || dirty || !instruction.trim()} onClick={() => run('generate', generate)}>Gerar nova versão</Button>
                  {dirty && <p className="editorial-note">Salve a edição antes de solicitar uma nova versão.</p>}
                </details>}
                {!version.news_id && permissions.approve && active && <div className="editorial-approval">
                  <label className="editorial-check"><input type="checkbox" checked={verified} disabled={Boolean(busy) || dirty || outdated || styleChanged} onChange={event => setVerified(event.target.checked)} />Conferi os fatos, as fontes e o contexto desta versão.</label>
                  <Button variant="outline" disabled={Boolean(busy) || !verified || dirty || outdated || styleChanged || Boolean(version.approved_at)} onClick={() => run('approve', async () => { await approveEditorial(version.id); await refreshContents(); await refresh(); setNotice('Versão aprovada. A publicação é uma ação separada.'); })}><Check size={16} />Aprovar versão</Button>
                </div>}
                {version.approved_at && !dirty && !outdated && !styleChanged && <div className="editorial-actions"><Button variant="outline" disabled={Boolean(busy)} onClick={() => run('copy', async () => {
                  const approved = await exportEditorial(version.id);
                  await navigator.clipboard.writeText(editorialPlainText(approved)); setNotice('Conteúdo aprovado copiado. Nenhum canal externo recebeu o texto.');
                })}><Copy size={16} />Copiar aprovado</Button></div>}
                {format === 'news' && permissions.publish && version.approved_at && !version.news_id && <div className="editorial-publication">
                  <label className="editorial-check"><input type="checkbox" checked={publishConfirm} disabled={Boolean(busy) || dirty || outdated || styleChanged} onChange={event => setPublishConfirm(event.target.checked)} />Publicar esta versão na área pública de notícias.</label>
                  <Button disabled={Boolean(busy) || !publishConfirm || dirty || outdated || styleChanged} onClick={() => run('publish', async () => { await publishEditorial(version.id); setHistory(true); setNotice('Notícia publicada. Nenhuma notificação foi enviada.'); await refreshContents(); })}><Send size={16} />Publicar notícia</Button>
                </div>}
                <details className="editorial-history"><summary>Histórico de versões</summary>{versions.filter(item => item.format === format).slice(0, 12).map(item => <div key={item.id}><strong>Versão {item.revision}</strong>
                  {item.brief?.schema_version === 1 && <> · {EDITORIAL_TONES[item.brief.tone]} · {format === 'news' ? EDITORIAL_NEWS_STYLES[item.brief.news_style] : EDITORIAL_VIDEO_STYLES[item.brief.video_style]}</>}
                  {' · '}{dateTime(item.created_at)}<p>{item.content.title}</p><details><summary>Ver texto</summary>{item.content.blocks.map((block, index) => <div key={index}>
                    <p>{block.speaker && <strong>{EDITORIAL_SPEAKERS[block.speaker]}: </strong>}{block.text}</p>
                    {block.scene && <p>Cena sugerida: {block.scene}</p>}{block.screen_text && <p>Na tela: {block.screen_text}</p>}
                  </div>)}</details></div>)}</details>
              </>}
            </>}
          </section>

          <aside className="editorial-panel editorial-sources" aria-label="Fontes da pauta">
            <h2>Fontes</h2>
            {!candidate ? <p className="editorial-empty">Selecione uma pauta.</p> : <>
              <span className="editorial-source-date">Base: {dateTime(candidate.snapshot.captured_at)}</span>
              {facts.map(fact => <div className="editorial-fact" key={fact.id}><strong>{fact.id}</strong><p>{fact.text}</p></div>)}
              <details><summary>Limites do levantamento</summary>{candidate.snapshot.limitations.map((text, index) => <p key={index}>{text}</p>)}</details>
              <details><summary>Registros consultados ({candidate.snapshot.sources.length})</summary><ul>{candidate.snapshot.sources.map(source => {
                const href = editorialSourceHref(source, candidate.module);
                return <li key={`${source.source_type || 'work'}:${source.id}`}>{href ? <Link to={href} target="_blank" rel="noreferrer">{source.title}</Link> : source.title}</li>;
              })}</ul></details>
            </>}
          </aside>
        </div>
      </>}
    </main>
  </>;
}

import React, { useEffect, useState } from 'react';
import { Check, Copy, Download, Eye, Flag, Loader2, Share2, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { supabase } from '@/lib/customSupabaseClient';
import { communityRpc } from '@/lib/communityTrees';
import { CommunityPrivacyFields, useCommunityAction } from './CommunityTreeForms';

function Frame({ open, onClose, title, description, busy, children, wide = false }) {
  return <Dialog open={open} onOpenChange={next => { if (!next && !busy) onClose(); }}><DialogContent className={`community-dialog ${wide ? 'sm:max-w-2xl' : 'sm:max-w-lg'}`} onEscapeKeyDown={event => { if (busy) event.preventDefault(); }} onInteractOutside={event => { if (busy) event.preventDefault(); }}><DialogHeader><DialogTitle>{title}</DialogTitle><DialogDescription>{description}</DialogDescription></DialogHeader>{children}</DialogContent></Dialog>;
}

export function CommunityPrivacyDialog({ tree, onClose, onSaved }) {
  const [value, setValue] = useState({ public_profile: tree.public_profile, location_visibility: tree.location_visibility });
  const action = useCommunityAction(async () => { onClose(); onSaved(); });
  return <Frame open onClose={onClose} title="Privacidade da árvore" description="Você controla a publicação do perfil e da localização." busy={action.busy}><form className="community-small-form" onSubmit={event => { event.preventDefault(); action.run(() => communityRpc(supabase, 'set_community_tree_privacy', { p_id: tree.id, p_public: value.public_profile, p_location: value.location_visibility })); }}><fieldset disabled={action.busy}><CommunityPrivacyFields value={value} onChange={patch => setValue(current => ({ ...current, ...patch }))} /></fieldset>{action.error && <p role="alert" className="community-error">{action.error}</p>}<div className="community-form-footer"><Button type="button" variant="ghost" disabled={action.busy} onClick={onClose}>Cancelar</Button><Button type="submit" disabled={action.busy}>{action.busy && <Loader2 size={17} className="animate-spin" />}Salvar privacidade</Button></div></form></Frame>;
}

export function CommunityCareReportDialog({ care, onClose, onSaved }) {
  const [reason, setReason] = useState(''); const action = useCommunityAction(async () => { onClose(); onSaved?.(); });
  return <Frame open onClose={onClose} title="Denunciar registro" description="A equipe municipal analisará sua denúncia. Sua identidade não será exibida no perfil da árvore." busy={action.busy}><form className="community-small-form" onSubmit={event => { event.preventDefault(); action.run(() => communityRpc(supabase, 'report_community_tree_care', { p_care: care.id, p_reason: reason.trim() })); }}><fieldset disabled={action.busy} className="community-field-stack"><label>O que precisa ser revisado?<textarea required minLength={5} maxLength={1000} rows={4} value={reason} onChange={event => setReason(event.target.value)} placeholder="Descreva o motivo da denúncia" /></label></fieldset>{action.error && <p role="alert" className="community-error">{action.error}</p>}<div className="community-form-footer"><Button type="button" variant="ghost" disabled={action.busy} onClick={onClose}>Cancelar</Button><Button type="submit" disabled={action.busy || reason.trim().length < 5}><Flag size={17} />Enviar denúncia</Button></div></form></Frame>;
}

export function CommunityReviewDialog({ tree, onClose, onSaved }) {
  const [approve, setApprove] = useState(tree.status !== 'approved'), [note, setNote] = useState('');
  const action = useCommunityAction(async () => { onClose(); onSaved(); });
  return <Frame open wide onClose={onClose} title="Revisar cadastro da árvore" description="Confira a foto, a localização e a identificação informadas pelo cidadão." busy={action.busy}>
    <form className="community-small-form" onSubmit={event => { event.preventDefault(); action.run(() => communityRpc(supabase, 'review_community_tree', { p_id: tree.id, p_expected_status: tree.status, p_approve: approve, p_note: note.trim() })); }}>
      <div className="community-review-summary">{tree.photo_url && <img src={tree.photo_url} alt={`Cadastro de ${tree.name}`} />}<div><h3>{tree.name}</h3><p>{tree.species_name || 'Espécie a identificar'} · {tree.city_name}</p><p>{tree.address || 'Sem endereço complementar'}</p>{tree.latitude != null && <a href={`https://www.google.com/maps/search/?api=1&query=${tree.latitude},${tree.longitude}`} target="_blank" rel="noreferrer">Conferir ponto no mapa</a>}<p className="community-muted">{tree.public_profile ? 'Perfil público após aprovação' : 'Acompanhamento privado'} · {tree.location_visibility === 'exact' ? 'Ponto público no mapa' : 'Somente a cidade no perfil'}</p></div></div>
      <fieldset disabled={action.busy} className="community-field-stack"><div className="community-review-choices"><label className={approve ? 'is-selected' : ''}><input type="radio" name="tree-review" checked={approve} onChange={() => setApprove(true)} /><Check size={18} />Aprovar cadastro</label><label className={!approve ? 'is-selected' : ''}><input type="radio" name="tree-review" checked={!approve} onChange={() => setApprove(false)} /><Eye size={18} />{tree.status === 'approved' ? 'Retirar publicação' : 'Solicitar ajustes'}</label></div><label>Orientação ao cidadão <small>{approve ? 'Opcional' : 'Obrigatória'}</small><textarea required={!approve} minLength={approve ? undefined : 5} maxLength={1000} rows={3} value={note} onChange={event => setNote(event.target.value)} placeholder="Explique os ajustes necessários ou deixe uma orientação" /></label></fieldset>
      {action.error && <p role="alert" className="community-error">{action.error}</p>}<div className="community-form-footer"><Button type="button" variant="ghost" disabled={action.busy} onClick={onClose}>Cancelar</Button><Button type="submit" disabled={action.busy || (!approve && note.trim().length < 5)}>{action.busy ? <Loader2 size={17} className="animate-spin" /> : <ShieldCheck size={17} />}Confirmar revisão</Button></div>
    </form>
  </Frame>;
}

export function CommunityReportReviewDialog({ report, onClose, onSaved }) {
  const [resolution, setResolution] = useState(''); const action = useCommunityAction(async () => { onClose(); onSaved(); });
  const decide = hide => action.run(() => communityRpc(supabase, 'review_community_tree_care_report', { p_report: report.id, p_hide: hide, p_resolution: resolution.trim() }));
  return <Frame open onClose={onClose} title="Revisar denúncia" description={`Registro de cuidado · ${report.tree_name}`} busy={action.busy}><div className="community-small-form"><div className="community-review-summary">{report.photo_url && <img src={report.photo_url} alt="Foto do cuidado denunciado" />}<div><p><strong>Motivo da denúncia</strong></p><p>{report.reason}</p><p><strong>Observação do cuidado</strong></p><p>{report.notes || 'Sem observação'}</p></div></div><label className="community-field-stack">Justificativa da decisão<textarea minLength={5} maxLength={1000} rows={3} disabled={action.busy} value={resolution} onChange={event => setResolution(event.target.value)} /></label>{action.error && <p role="alert" className="community-error">{action.error}</p>}<div className="community-form-footer"><Button variant="outline" disabled={action.busy || resolution.trim().length < 5} onClick={() => decide(false)}>Manter registro</Button><Button disabled={action.busy || resolution.trim().length < 5} onClick={() => decide(true)}>Ocultar registro</Button></div></div></Frame>;
}

export function CommunityShareDialog({ tree, care, onClose }) {
  const [card, setCard] = useState(null), [loading, setLoading] = useState(true), [failure, setFailure] = useState(''), [revision, setRevision] = useState(0), [notice, setNotice] = useState('');
  const action = useCommunityAction();
  useEffect(() => {
    let active = true; setLoading(true); setFailure('');
    import('@/lib/communityTreeShare').then(({ generateCommunityTreeCard }) => generateCommunityTreeCard(supabase, tree, care)).then(result => { if (active) setCard(result); }).catch(error => { if (active) setFailure(error.message); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [tree.id, revision]);
  const download = async () => {
    const { Capacitor } = await import('@capacitor/core');
    if (Capacitor.isNativePlatform()) { const { salvarImagemNaGaleria } = await import('@/lib/nativeDownload'); await salvarImagemNaGaleria({ base64: card.dataUrl.split(',')[1], fileName: card.fileName }); }
    else { const anchor = document.createElement('a'); anchor.href = card.dataUrl; anchor.download = card.fileName; document.body.appendChild(anchor); anchor.click(); anchor.remove(); }
    setNotice('Imagem pronta para compartilhar.');
  };
  const share = () => action.run(async () => {
    const { compartilharImagem } = await import('@/lib/nativeDownload');
    try { const shared = await compartilharImagem({ dataUrl: card.dataUrl, base64: card.dataUrl.split(',')[1], fileName: card.fileName, texto: `Acompanhe os cuidados com ${tree.name} no Trombone Cidadão.`, url: card.url }); if (!shared) await download(); }
    catch (error) { if (!/cancel|abort/i.test(`${error.name} ${error.message}`)) throw error; }
  });
  return <Frame open wide onClose={onClose} title="Compartilhar evolução" description="O cartão usa apenas informações e fotos públicas. Endereço e dados pessoais não são incluídos." busy={action.busy}>
    {loading ? <p role="status" className="community-loading"><Loader2 size={24} className="animate-spin" />Preparando seu cartão…</p> : failure ? <div role="alert" className="community-field-stack"><p>{failure}</p><Button variant="outline" onClick={() => setRevision(current => current + 1)}>Tentar novamente</Button></div> : card && <><img className="community-share-preview" src={card.dataUrl} alt={`Cartão com a evolução de ${tree.name}`} /><div className="community-share-actions"><Button disabled={action.busy} onClick={share}><Share2 size={17} />Compartilhar imagem</Button><Button variant="outline" disabled={action.busy} onClick={() => action.run(download)}><Download size={17} />Baixar PNG</Button><Button variant="ghost" disabled={action.busy} onClick={() => action.run(async () => { await navigator.clipboard.writeText(card.url); setNotice('Link copiado.'); })}><Copy size={17} />Copiar link</Button></div><input aria-label="Link público da árvore" className="community-link-input" readOnly value={card.url} onFocus={event => event.target.select()} /></>}
    {(notice || action.error) && <p role={action.error ? 'alert' : 'status'} className={action.error ? 'community-error' : 'community-muted'}>{action.error || notice}</p>}
  </Frame>;
}

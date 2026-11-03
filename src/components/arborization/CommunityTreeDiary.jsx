import React, { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { BookOpen, Camera, ChevronLeft, ChevronRight, Droplets, Eye, EyeOff, Flag, MessageSquare, MoreHorizontal, Pencil, Share2, Sprout } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { COMMUNITY_CARE_ACTIONS, communityTreePath } from '@/lib/communityTrees';
import { CareOwnerActions } from './CommunityTreeOwnerActions';
import './communityTreeDiary.css';

const icons = { watering: Droplets, growth: Sprout, observation: MessageSquare };
const date = value => new Date(`${value.slice(0, 10)}T12:00:00`);
const fullDate = value => date(value).toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' });
const shortDate = value => date(value).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
const pageMotion = {
  enter: direction => ({ opacity: 0, x: direction * 22, rotateY: direction * -7 }),
  visible: { opacity: 1, x: 0, rotateY: 0 },
  leave: direction => ({ opacity: 0, x: direction * -18, rotateY: direction * 6 }),
};

function DiaryIllustration({ action = 'growth' }) {
  return <svg viewBox="0 0 360 280" aria-hidden="true" className="tree-diary-illustration"><circle cx="182" cy="137" r="103" fill="currentColor" opacity=".06" /><circle cx="271" cy="67" r="24" fill="#e7c976" opacity=".7" /><ellipse cx="180" cy="237" rx="96" ry="11" fill="currentColor" opacity=".1" /><path d="M172 230Q180 177 179 101M178 177L141 149M179 148L212 117" stroke="currentColor" strokeWidth="5" strokeLinecap="round" fill="none" /><path d="M176 153C140 158 112 125 120 101C154 99 179 125 176 153ZM183 130C182 96 211 76 238 82C237 112 213 132 183 130ZM178 111C153 96 152 69 168 54C190 68 196 91 178 111Z" fill="currentColor" opacity=".65" /><path d="M134 232q-6-22 8-36q13 15 1 36M218 232q-5-19 8-31q12 13 1 31" fill="currentColor" opacity=".3" />{action === 'watering' ? <g fill="#79a7b0"><path d="M87 70q-17 23 0 23q17 0 0-23M111 45q-12 17 0 17q12 0 0-17M76 117q-12 17 0 17q12 0 0-17" /></g> : <g stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity=".45"><path d="M88 126v14m-7-7h14M267 161v12m-6-6h12M116 52v10m-5-5h10" /></g>}<path d="M96 244Q181 224 267 244" stroke="currentColor" strokeWidth="2" fill="none" opacity=".3" /></svg>;
}

export default function CommunityTreeDiary({ tree, entries, user, filter, onFilterChange, selectedId, onSelect, onRecord, onEdit, onDelete, onPrivacy, onReport, busy = false, more = false, onLoadMore, onRetryPhotos, onShare }) {
  const reducedMotion = useReducedMotion();
  const [direction, setDirection] = useState(1), [enlarged, setEnlarged] = useState(null), [failedPhoto, setFailedPhoto] = useState(null);
  const gesture = useRef(null), ignorePhotoClickUntil = useRef(0);
  const visible = entries.filter(entry => filter === 'all' || entry.action === filter);
  const index = Math.max(0, visible.findIndex(entry => entry.id === selectedId));
  const current = visible[index];
  const publicTree = tree.status === 'approved' && tree.public_profile;
  const Icon = icons[current?.action] || Sprout;

  const go = target => {
    if (target < 0 || target >= visible.length || target === index) return;
    setDirection(target > index ? 1 : -1); onSelect(visible[target].id);
  };


  const pointerDown = event => {
    if (event.pointerType === 'mouse') return;
    const interactive = event.target.closest('button,a,input,textarea,select,[role=menuitem]');
    if (interactive && !interactive.hasAttribute('data-diary-photo')) return;
    gesture.current = { id: event.pointerId, x: event.clientX, y: event.clientY, time: performance.now() };
  };
  const pointerUp = event => {
    const start = gesture.current; gesture.current = null;
    if (!start || start.id !== event.pointerId) return;
    const dx = event.clientX - start.x, dy = event.clientY - start.y;
    if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.5 || performance.now() - start.time > 1000) return;
    ignorePhotoClickUntil.current = performance.now() + 450;
    go(index + (dx < 0 ? 1 : -1));
  };

  return <section className="tree-diary" id="tree-diary" aria-labelledby="community-care-heading">
    <header className="tree-diary-heading"><div><BookOpen size={22} aria-hidden="true" /><h2 id="community-care-heading">Diário da árvore</h2></div>{entries.length > 0 && <DropdownMenu><DropdownMenuTrigger asChild><Button type="button" variant="ghost" size="icon" aria-label={`Filtrar diário: ${filter === 'all' ? 'Todos os cuidados' : COMMUNITY_CARE_ACTIONS[filter]}`}><MoreHorizontal size={20} /></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuLabel>Mostrar cuidados</DropdownMenuLabel><DropdownMenuRadioGroup value={filter} onValueChange={value => { setDirection(1); onFilterChange(value); onSelect(null); }}>{[['all', 'Todos os cuidados'], ...Object.entries(COMMUNITY_CARE_ACTIONS)].map(([key, label]) => <DropdownMenuRadioItem key={key} value={key}>{label}</DropdownMenuRadioItem>)}</DropdownMenuRadioGroup></DropdownMenuContent></DropdownMenu>}</header>
    {filter !== 'all' && <p className="tree-diary-active-filter">{COMMUNITY_CARE_ACTIONS[filter]}<button type="button" onClick={() => { onFilterChange('all'); onSelect(null); }}>Ver todos</button></p>}

    {current ? <>
      <div className="tree-diary-book" role="region" aria-roledescription="carrossel" aria-label={`Páginas do diário de ${tree.name}`} tabIndex={0} onKeyDown={event => {
        if (event.target !== event.currentTarget) return;
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault(); go(event.key === 'Home' ? 0 : event.key === 'End' ? visible.length - 1 : index + (event.key === 'ArrowRight' ? 1 : -1));
      }} onPointerDown={pointerDown} onPointerUp={pointerUp} onPointerCancel={() => { gesture.current = null; }}>
        <AnimatePresence initial={false} mode="wait" custom={direction}>
          <motion.article key={current.id} data-entry-id={current.id} className={`tree-diary-paper is-${current.action}`} custom={direction} variants={pageMotion} initial={reducedMotion ? false : 'enter'} animate="visible" exit={reducedMotion ? { opacity: 1 } : 'leave'} transition={{ duration: reducedMotion ? 0 : .22, ease: 'easeOut' }} aria-label={`${COMMUNITY_CARE_ACTIONS[current.action] || 'Cuidado'} em ${fullDate(current.performed_on)}`}>
            <div className="tree-diary-writing"><span className="tree-diary-corner" aria-hidden="true"><DiaryIllustration /></span><div className="tree-diary-page-top"><span className="tree-diary-chapter">Memórias de {tree.name}</span><span className="tree-diary-page-number">{String(index + 1).padStart(2, '0')}</span></div>
              <span className="tree-diary-action-icon"><Icon size={26} aria-hidden="true" /></span><h3>{COMMUNITY_CARE_ACTIONS[current.action] || 'Um novo cuidado'}</h3><time className="tree-diary-date" dateTime={current.performed_on}>{fullDate(current.performed_on)}</time>
              <div className="tree-diary-notes">{current.notes ? <p>{current.notes}</p> : <div className="tree-diary-unwritten"><Pencil size={21} aria-hidden="true" /><p>{tree.is_owner ? 'Que detalhe você gostaria de guardar deste dia?' : 'Mais um cuidado guardado nesta história.'}</p>{tree.is_owner && <button type="button" disabled={busy} onClick={() => onEdit(current)}>Adicionar uma anotação</button>}</div>}</div>
              {current.is_hidden && <p className="tree-diary-moderation">Ocultado pela equipe{current.hidden_reason ? `: ${current.hidden_reason}` : '.'}</p>}
              <div className="tree-diary-entry-footer">{tree.is_owner ? <><span className="tree-diary-visibility">{current.is_hidden ? <EyeOff size={14} /> : current.is_public ? <Eye size={14} /> : <EyeOff size={14} />}{current.is_hidden ? 'Ocultado' : current.is_public ? publicTree ? 'Público' : 'Público após aprovação' : 'Só para mim'}</span><CareOwnerActions care={current} disabled={busy} onEdit={onEdit} onDelete={onDelete} onPrivacy={onPrivacy} /></> : user ? <button type="button" className="tree-diary-report" onClick={() => onReport(current)}><Flag size={14} />Denunciar registro</button> : <Link className="tree-diary-report" to="/login" state={{ from: { pathname: communityTreePath(tree.id), hash: '#tree-diary' } }}><Flag size={14} />Denunciar registro</Link>}</div>
            </div>
            <div className="tree-diary-memory">{current.photo_url && failedPhoto !== current.photo_url ? <figure className="tree-diary-polaroid"><button type="button" data-diary-photo aria-label={`Ampliar foto de ${COMMUNITY_CARE_ACTIONS[current.action]?.toLowerCase() || 'cuidado'} em ${fullDate(current.performed_on)}`} onClick={() => { if (performance.now() >= ignorePhotoClickUntil.current) setEnlarged(current); }}><img src={current.photo_url} alt={`Foto de ${COMMUNITY_CARE_ACTIONS[current.action]?.toLowerCase() || 'cuidado'} da árvore ${tree.name}`} onError={() => setFailedPhoto(current.photo_url)} /><span><Camera size={16} />Ampliar foto</span></button><figcaption>{shortDate(current.performed_on)} · {tree.name}</figcaption></figure> : current.photo_path || current.photo_url ? <div className="tree-diary-photo-missing"><Camera size={31} aria-hidden="true" /><h4>A foto não carregou</h4><p>{tree.is_owner ? 'Se o arquivo não estiver mais disponível, você pode reenviar a imagem deste cuidado.' : 'A imagem deste registro está indisponível no momento.'}</p><div>{onRetryPhotos && <Button type="button" variant="outline" onClick={() => { setFailedPhoto(null); onRetryPhotos(); }}>Tentar novamente</Button>}{tree.is_owner && <Button type="button" variant="outline" onClick={() => onEdit(current)}><Camera size={16} />Reenviar foto</Button>}</div></div> : <div className="tree-diary-botanical"><DiaryIllustration action={current.action} /><p>Cada cuidado deixa sua marca.</p><span>Ilustração</span></div>}</div>
          </motion.article>
        </AnimatePresence>
      </div>
      <div className="tree-diary-bottom"><div className="tree-diary-navigation"><button type="button" aria-label="Página anterior do diário" disabled={index === 0} onClick={() => go(index - 1)}><ChevronLeft size={20} /><span>Anterior</span></button><div><strong>Página {index + 1} de {visible.length}</strong><span className="tree-diary-swipe-hint">Deslize para virar a página</span></div><button type="button" aria-label="Próxima página do diário" disabled={index === visible.length - 1} onClick={() => go(index + 1)}><span>Próxima</span><ChevronRight size={20} /></button></div>
      {publicTree && onShare && <button type="button" className="tree-diary-share" onClick={onShare}><Share2 size={15} aria-hidden="true" />Compartilhar história</button>}</div>
      <span className="sr-only" role="status" aria-live="polite" aria-atomic="true">Página {index + 1} de {visible.length}: {COMMUNITY_CARE_ACTIONS[current.action]}, {fullDate(current.performed_on)}.</span>
    </> : <div className="tree-diary-empty-book"><div><BookOpen size={34} /><span>{entries.length ? 'Uma pausa entre as páginas' : 'Seu primeiro capítulo'}</span><h3>{entries.length ? 'Nenhum registro deste tipo ainda.' : `O diário de ${tree.name}`}</h3><p>{entries.length ? 'Veja outros cuidados ou explore mais páginas do histórico.' : tree.is_owner ? 'Uma rega, uma foto, uma descoberta. Cada cuidado pode virar uma página.' : 'Os cuidados públicos vão contar esta história por aqui.'}</p>{entries.length ? <Button type="button" variant="outline" onClick={() => { onFilterChange('all'); onSelect(null); }}>Ver todos os cuidados</Button> : tree.is_owner && <Button type="button" onClick={onRecord}><Pencil size={17} />Escrever o primeiro cuidado</Button>}</div><DiaryIllustration /></div>}
    {more && <Button type="button" className="tree-diary-load-more" variant="outline" onClick={onLoadMore}>Carregar páginas anteriores<ChevronRight size={17} /></Button>}
    {enlarged && <Dialog open onOpenChange={open => { if (!open) setEnlarged(null); }}><DialogContent className="community-gallery-dialog sm:max-w-3xl"><DialogTitle>{COMMUNITY_CARE_ACTIONS[enlarged.action]} · {tree.name}</DialogTitle><DialogDescription>{fullDate(enlarged.performed_on)}</DialogDescription><img className="community-gallery-full" src={enlarged.photo_url} alt={`Foto do registro de ${fullDate(enlarged.performed_on)}`} /></DialogContent></Dialog>}
  </section>;
}

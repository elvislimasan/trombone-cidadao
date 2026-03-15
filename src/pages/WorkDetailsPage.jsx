import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { Share } from '@capacitor/share';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { getWorkShareUrl } from '@/lib/shareUtils';
import DynamicSEO from '@/components/DynamicSeo';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import {
  ArrowLeft, Calendar, DollarSign, PauseCircle, CheckCircle, MapPin,
  Video, Image as ImageIcon, FileText, Building, Award,
  BookOpen, Heart, Link2, Share2, Edit, UploadCloud, User, Activity,
  ArrowUpRight, AlertTriangle, HelpCircle, Newspaper, FolderOpen,
  ChevronRight, TrendingUp, Layers, CreditCard,
  Banknote, ExternalLink
} from 'lucide-react';
import { formatCurrency, formatCnpj, formatDate } from '@/lib/utils';
import MediaViewer from '@/components/MediaViewer';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { WorkEditModal } from './admin/ManageWorksPage';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { FLORESTA_COORDS } from '@/config/mapConfig';
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({ iconRetinaUrl: markerIcon2x, iconUrl: markerIcon, shadowUrl: markerShadow });

// ─── Map ─────────────────────────────────────────────────────────────────────
const WorkMap = ({ location, bairro }) => {
  const position = useMemo(() => {
    if (location) {
      if (typeof location === 'string') {
        const m = location.match(/POINT\(([-\d.]+) ([-\d.]+)\)/);
        if (m) return [parseFloat(m[2]), parseFloat(m[1])];
      } else if (typeof location === 'object' && location.coordinates) {
        return [location.coordinates[1], location.coordinates[0]];
      }
    }
    return FLORESTA_COORDS;
  }, [location]);
  return (
    <div className="h-full w-full relative z-0">
      <MapContainer center={position} zoom={15} style={{ height: '100%', width: '100%' }} scrollWheelZoom={false}>
        <TileLayer attribution='&copy; OpenStreetMap' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        <Marker position={position}><Popup>{bairro || 'Localização da Obra'}</Popup></Marker>
      </MapContainer>
    </div>
  );
};

// ─── Status ──────────────────────────────────────────────────────────────────
const STATUS = {
  'in-progress': { text: 'Em Andamento',  icon: Activity,      color: 'text-blue-700',    bg: 'bg-blue-100',    dot: 'bg-blue-500'    },
  'completed':   { text: 'Concluída',     icon: CheckCircle,   color: 'text-emerald-700', bg: 'bg-emerald-100', dot: 'bg-emerald-500' },
  'stalled':     { text: 'Paralisada',    icon: PauseCircle,   color: 'text-amber-700',   bg: 'bg-amber-100',   dot: 'bg-amber-500'   },
  'unfinished':  { text: 'Inacabada',     icon: AlertTriangle, color: 'text-rose-700',    bg: 'bg-rose-100',    dot: 'bg-rose-500'    },
  'planned':     { text: 'Planejamento',  icon: Calendar,      color: 'text-violet-700',  bg: 'bg-violet-100',  dot: 'bg-violet-500'  },
  'tendered':    { text: 'Em Licitação',  icon: FileText,      color: 'text-orange-700',  bg: 'bg-orange-100',  dot: 'bg-orange-500'  },
};
const getStatusInfo = (s) => STATUS[s] || { text: 'Não definido', icon: HelpCircle, color: 'text-slate-600', bg: 'bg-slate-100', dot: 'bg-slate-400' };

// ─── Atoms ───────────────────────────────────────────────────────────────────
const InfoRow = ({ icon: Icon, label, value, accent }) => (
  <div className="flex items-start gap-3 py-2.5 border-b border-slate-100 last:border-0">
    <div className="w-7 h-7 rounded-md bg-slate-50 border border-slate-100 flex items-center justify-center flex-shrink-0 mt-0.5">
      <Icon className="w-3.5 h-3.5 text-slate-400" />
    </div>
    <div className="flex-1 min-w-0">
      <p className="text-[11px] text-slate-400 font-medium uppercase tracking-wide">{label}</p>
      <p className={`text-sm font-semibold leading-snug mt-0.5 break-words ${accent ? 'text-red-600' : 'text-slate-800'}`}>{value || '—'}</p>
    </div>
  </div>
);

const PanelHeader = ({ icon: Icon, children }) => (
  <div className="px-5 py-3 bg-slate-50/80 border-b border-slate-100 flex items-center gap-2">
    <Icon className="w-3.5 h-3.5 text-slate-400" />
    <span className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">{children}</span>
  </div>
);

// ─── TAB: Visão Geral ─────────────────────────────────────────────────────────
const TabOverview = ({ work, totalSpentFromPayments, measurements }) => {
  const spentValue = totalSpentFromPayments || work.amount_spent || 0;
  const spentPct   = work.total_value ? Math.min((spentValue / work.total_value) * 100, 100) : 0;
  const startDate  = work.start_date ? new Date(work.start_date) : null;
  const endDate    = (work.end_date_forecast || work.expected_end_date) ? new Date(work.end_date_forecast || work.expected_end_date) : null;
  const today      = new Date();
  const daysElapsed   = startDate ? Math.floor((today - startDate) / 86400000) : null;
  const daysRemaining = endDate ? Math.max(0, Math.floor((endDate - today) / 86400000)) : null;
  const timePct       = (startDate && endDate && endDate > startDate) ? Math.min(((today - startDate) / (endDate - startDate)) * 100, 100) : 0;
  const BARS = ['bg-emerald-500','bg-blue-500','bg-amber-400','bg-violet-400','bg-rose-400','bg-slate-300'];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
      {/* Left 3/5 */}
      <div className="lg:col-span-3 space-y-4">
        {/* Detalhes */}
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
          <PanelHeader icon={FileText}>Detalhes da obra</PanelHeader>
          <div className="grid grid-cols-1 sm:grid-cols-2">
            <div className="px-5 py-3 sm:border-r border-slate-100">
              <InfoRow icon={FileText}   label="Categoria"      value={work.work_category?.name} />
              <InfoRow icon={Activity}   label="Status"         value={getStatusInfo(work.status).text} />
              <InfoRow icon={Calendar}   label="Início real"    value={work.start_date ? formatDate(work.start_date) : null} />
              <InfoRow icon={Calendar}   label="Previsão conclusão" value={work.end_date_forecast ? formatDate(work.end_date_forecast) : work.expected_end_date ? formatDate(work.expected_end_date) : null} />
            </div>
            <div className="px-5 py-3">
              <InfoRow icon={DollarSign} label="Valor previsto" value={work.total_value ? formatCurrency(work.total_value) : null} />
              <InfoRow icon={CreditCard} label="Total pago"     value={spentValue > 0 ? formatCurrency(spentValue) : null} accent />
              <InfoRow icon={MapPin}     label="Bairro"         value={work.bairro?.name} />
              <InfoRow icon={Building}   label="Construtora"    value={work.contractor?.name} />
            </div>
          </div>
        </div>

        {/* Andamento */}
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
          <PanelHeader icon={TrendingUp}>Andamento da Obra</PanelHeader>
          <div className="p-5">
            <div className="flex items-end justify-between mb-2">
              <div>
                <span className="text-3xl font-black text-slate-900">{work.execution_percentage || 0}%</span>
                <span className="text-sm text-slate-400 ml-2">concluído</span>
              </div>
              <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full ${getStatusInfo(work.status).bg} ${getStatusInfo(work.status).color}`}>
                {getStatusInfo(work.status).text}
              </span>
            </div>
            <div className="h-3 bg-slate-100 rounded-full overflow-hidden mb-4">
              <div className="h-full bg-red-500 rounded-full transition-all duration-700" style={{ width: `${work.execution_percentage || 0}%` }} />
            </div>
            {measurements.length > 0 && (
              <div className="space-y-2.5 pt-3 border-t border-slate-100">
                {measurements.slice(0, 6).map((m, i) => {
                  const pct = m.execution_percentage || 0;
                  const si  = getStatusInfo(m.status);
                  return (
                    <div key={m.id} className="flex items-center gap-3">
                      <div className={`w-2 h-2 rounded-full flex-shrink-0 ${BARS[i] || 'bg-slate-300'}`} />
                      <span className="text-xs text-slate-700 font-medium truncate flex-1">{m.title}</span>
                      <div className="w-24 h-1.5 bg-slate-100 rounded-full overflow-hidden flex-shrink-0">
                        <div className={`h-full rounded-full ${BARS[i] || 'bg-slate-300'}`} style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-[10px] text-slate-400 w-28 text-right flex-shrink-0 truncate">{si.text} — {pct}%</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Descrição */}
        {(work.long_description || work.description) && (
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
            <PanelHeader icon={BookOpen}>Descrição</PanelHeader>
            <div className="px-5 py-4">
              <p className="text-sm text-slate-600 leading-relaxed whitespace-pre-wrap">{work.long_description || work.description}</p>
            </div>
          </div>
        )}

        {/* Financeiro extra */}
        {work.total_value && (
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
            <PanelHeader icon={DollarSign}>Financeiro</PanelHeader>
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-[10px] text-slate-400 uppercase tracking-wide font-bold mb-1">Valor Previsto</p>
                  <p className="text-xl font-black text-slate-800">{formatCurrency(work.total_value)}</p>
                </div>
                {spentValue > 0 && (
                  <div>
                    <p className="text-[10px] text-slate-400 uppercase tracking-wide font-bold mb-1">Total Pago</p>
                    <p className="text-xl font-black text-emerald-600">{formatCurrency(spentValue)}</p>
                  </div>
                )}
              </div>
              {spentValue > 0 && (
                <div>
                  <div className="flex justify-between text-xs mb-1.5">
                    <span className="text-slate-400">Execução financeira</span>
                    <span className="font-bold text-slate-600">{spentPct.toFixed(1)}%</span>
                  </div>
                  <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${spentPct}%` }} />
                  </div>
                </div>
              )}
              {work.funding_source?.length > 0 && (
                <div>
                  <p className="text-[10px] text-slate-400 uppercase tracking-wide font-bold mb-2">Fonte de Recursos</p>
                  <div className="flex flex-wrap gap-2">
                    {work.funding_source.map(src => (
                      <span key={src} className="text-xs font-semibold px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 border border-blue-100 capitalize">{src}</span>
                    ))}
                  </div>
                </div>
              )}
              {work.parliamentary_amendment?.has && (
                <InfoRow icon={User} label="Emenda Parlamentar" value={work.parliamentary_amendment.author} />
              )}
              {work.contractor?.cnpj && (
                <InfoRow icon={FileText} label="CNPJ da Construtora" value={formatCnpj(work.contractor.cnpj)} />
              )}
            </div>
          </div>
        )}
      </div>

      {/* Right 2/5 */}
      <div className="lg:col-span-2 space-y-4">
        {/* Cronograma */}
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
          <PanelHeader icon={Calendar}>Cronograma</PanelHeader>
          <div className="p-5 space-y-3">
            {startDate && (
              <div className="flex justify-between items-center">
                <span className="text-xs text-slate-400">Início real</span>
                <span className="text-xs font-bold text-slate-700">{formatDate(work.start_date)}</span>
              </div>
            )}
            {(work.end_date_forecast || work.expected_end_date) && (
              <div className="flex justify-between items-center">
                <span className="text-xs text-slate-400">Previsão conclusão</span>
                <span className="text-xs font-bold text-amber-600">{formatDate(work.end_date_forecast || work.expected_end_date)}</span>
              </div>
            )}
            {work.contract_signature_date && (
              <div className="flex justify-between items-center">
                <span className="text-xs text-slate-400">Assinatura contrato</span>
                <span className="text-xs font-semibold text-slate-600">{formatDate(work.contract_signature_date)}</span>
              </div>
            )}
            {work.service_order_date && (
              <div className="flex justify-between items-center">
                <span className="text-xs text-slate-400">Ordem de serviço</span>
                <span className="text-xs font-semibold text-slate-600">{formatDate(work.service_order_date)}</span>
              </div>
            )}
            {work.inauguration_date && (
              <div className="flex justify-between items-center">
                <span className="text-xs text-slate-400">Inauguração</span>
                <span className="text-xs font-bold text-emerald-600">{formatDate(work.inauguration_date)}</span>
              </div>
            )}
            {work.stalled_date && (
              <div className="flex justify-between items-center">
                <span className="text-xs text-slate-400">Data paralisação</span>
                <span className="text-xs font-bold text-red-600">{formatDate(work.stalled_date)}</span>
              </div>
            )}
            {daysElapsed !== null && (
              <div className="pt-2 border-t border-slate-100">
                <div className="h-2 bg-slate-100 rounded-full overflow-hidden mb-1.5">
                  <div className="h-full bg-red-400 rounded-full" style={{ width: `${timePct}%` }} />
                </div>
                <div className="flex justify-between text-[11px]">
                  <span className="text-slate-400"><span className="font-bold text-slate-700">{daysElapsed}</span> dias decorridos</span>
                  {daysRemaining !== null && (
                    <span className="text-slate-400"><span className="font-bold text-emerald-600">{daysRemaining}</span> restantes</span>
                  )}
                </div>
              </div>
            )}
            {work.execution_period_days && (
              <div className="flex justify-between items-center pt-1">
                <span className="text-xs text-slate-400">Prazo contratual</span>
                <span className="text-xs font-bold text-slate-700">{work.execution_period_days} dias</span>
              </div>
            )}
          </div>
        </div>

        {/* Mapa */}
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
          <PanelHeader icon={MapPin}>Localização</PanelHeader>
          <div className="h-52">
            <WorkMap location={work.location} bairro={work.bairro?.name} />
          </div>
          {(work.address || work.bairro) && (
            <div className="px-4 py-3 bg-slate-50 border-t border-slate-100">
              {work.address && <p className="text-xs font-semibold text-slate-700">{work.address}</p>}
              {work.bairro && <p className="text-xs text-slate-400 mt-0.5">{work.bairro.name}</p>}
            </div>
          )}
        </div>

        {/* Links */}
        {Array.isArray(work.related_links) && work.related_links.length > 0 && (
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
            <PanelHeader icon={Link2}>Links Relacionados</PanelHeader>
            <div className="p-3 space-y-1">
              {work.related_links.map((link, idx) => (
                <a key={idx} href={link.url} target="_blank" rel="noopener noreferrer"
                  className="flex items-center justify-between p-2.5 rounded-xl hover:bg-slate-50 transition-colors group">
                  <span className="text-sm text-slate-700 truncate">{link.title}</span>
                  <ArrowUpRight className="w-3.5 h-3.5 text-slate-300 group-hover:text-red-500 ml-2 flex-shrink-0" />
                </a>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// ─── TAB: Etapas ─────────────────────────────────────────────────────────────
const TabPhases = ({ measurements, media, viewableMedia, openViewer }) => {
  if (measurements.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-dashed border-slate-200 py-20 text-center">
        <Layers className="w-10 h-10 text-slate-200 mx-auto mb-3" />
        <p className="text-slate-400 text-sm font-medium">Nenhuma etapa registrada.</p>
      </div>
    );
  }
  return (
    <div className="relative pl-6 space-y-4 before:absolute before:left-[11px] before:top-4 before:bottom-4 before:w-px before:bg-slate-200">
      {measurements.map((item) => {
        const si         = getStatusInfo(item.status);
        const phaseMedia = viewableMedia.filter(m => m.measurement_id === item.id);
        const phaseDocs  = media.filter(m => m.measurement_id === item.id && ['pdf','document','file'].includes(m.type));
        const totalPaid  = (item.payments || []).reduce((acc, p) => acc + (Number(p.value) || 0), 0);
        return (
          <div key={item.id} className="relative pl-6">
            <div className={`absolute left-0 top-4 w-3.5 h-3.5 rounded-full border-2 border-white shadow-sm ${si.dot}`} style={{ transform: 'translateX(-50%)' }} />
            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
              <div className="p-5 border-b border-slate-100">
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap mb-1.5">
                      <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full ${si.bg} ${si.color}`}>{si.text}</span>
                    </div>
                    <h4 className="font-bold text-base text-slate-900">{item.title}</h4>
                    {item.contractor && (
                      <p className="text-xs text-slate-400 mt-1 flex items-center gap-1.5">
                        <Building className="w-3 h-3" /> {item.contractor.name}
                      </p>
                    )}
                  </div>
                  {item.execution_percentage != null && (
                    <div className="text-right flex-shrink-0">
                      <p className="text-2xl font-black text-slate-900">{item.execution_percentage}%</p>
                      <p className="text-[10px] text-slate-400 uppercase tracking-wide">executado</p>
                    </div>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-y sm:divide-y-0 divide-slate-100 bg-slate-50/40">
                <div className="p-3.5"><p className="text-[9px] font-bold text-slate-400 uppercase tracking-wide mb-1">Valor Contrato</p><p className="text-sm font-bold text-slate-700">{item.value ? formatCurrency(item.value) : '—'}</p></div>
                <div className="p-3.5"><p className="text-[9px] font-bold text-slate-400 uppercase tracking-wide mb-1">Total Pago</p><p className="text-sm font-bold text-emerald-600">{totalPaid > 0 ? formatCurrency(totalPaid) : '—'}</p></div>
                <div className="p-3.5"><p className="text-[9px] font-bold text-slate-400 uppercase tracking-wide mb-1">Pagamentos</p><p className="text-sm font-bold text-blue-600">{(item.payments || []).length}</p></div>
                <div className="p-3.5"><p className="text-[9px] font-bold text-slate-400 uppercase tracking-wide mb-1">Mídias</p><p className="text-sm font-bold text-slate-600">{phaseMedia.length}</p></div>
              </div>
              {(item.description || item.start_date || item.end_date || item.expected_end_date || item.stalled_date || item.inauguration_date) && (
                <div className="p-5 space-y-2.5">
                  {item.description && <p className="text-sm text-slate-500 leading-relaxed">{item.description}</p>}
                  <div className="flex flex-wrap gap-x-5 gap-y-1.5 text-xs">
                    {item.start_date       && <span><span className="text-slate-400">Início: </span><span className="font-semibold text-slate-700">{formatDate(item.start_date)}</span></span>}
                    {item.end_date         && <span><span className="text-slate-400">Término: </span><span className="font-semibold text-slate-700">{formatDate(item.end_date)}</span></span>}
                    {item.expected_end_date && <span><span className="text-slate-400">Previsão: </span><span className="font-semibold text-amber-600">{formatDate(item.expected_end_date)}</span></span>}
                    {item.stalled_date     && <span><span className="text-slate-400">Paralisado: </span><span className="font-semibold text-red-600">{formatDate(item.stalled_date)}</span></span>}
                    {item.inauguration_date && <span><span className="text-slate-400">Inauguração: </span><span className="font-semibold text-emerald-600">{formatDate(item.inauguration_date)}</span></span>}
                  </div>
                </div>
              )}
              {phaseMedia.length > 0 && (
                <div className="px-5 pb-5 border-t border-slate-100 pt-4">
                  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-2.5">Galeria da fase</p>
                  <div className="flex gap-2 overflow-x-auto pb-1">
                    {phaseMedia.slice(0, 8).map((m, idx) => (
                      <button key={m.id} onClick={() => openViewer(phaseMedia, idx)}
                        className="flex-shrink-0 w-16 h-16 rounded-xl overflow-hidden border border-slate-200 hover:border-red-400 hover:shadow-sm transition-all bg-slate-100">
                        {['video','video_url'].includes(m.type)
                          ? <div className="w-full h-full flex items-center justify-center bg-slate-800"><Video className="w-5 h-5 text-white/60" /></div>
                          : <img src={m.url} alt="" className="w-full h-full object-cover" />}
                      </button>
                    ))}
                    {phaseMedia.length > 8 && (
                      <button onClick={() => openViewer(phaseMedia, 8)}
                        className="flex-shrink-0 w-16 h-16 rounded-xl bg-slate-50 border-2 border-dashed border-slate-300 flex flex-col items-center justify-center hover:bg-slate-100 transition-colors">
                        <span className="text-xs font-bold text-slate-500">+{phaseMedia.length - 8}</span>
                      </button>
                    )}
                  </div>
                </div>
              )}
              {phaseDocs.length > 0 && (
                <div className="px-5 pb-5 border-t border-slate-100 pt-4">
                  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-2.5">Documentos</p>
                  <div className="space-y-1.5">
                    {phaseDocs.map(doc => (
                      <a key={doc.id} href={doc.url} target="_blank" rel="noopener noreferrer"
                        className="flex items-center gap-2.5 p-2.5 rounded-xl bg-slate-50 hover:bg-red-50 border border-slate-100 hover:border-red-200 transition-all group text-sm">
                        <FileText className="w-4 h-4 text-slate-400 group-hover:text-red-500 flex-shrink-0" />
                        <span className="truncate font-medium text-slate-700 group-hover:text-red-700">{doc.name || 'Documento'}</span>
                        <ArrowUpRight className="w-3.5 h-3.5 text-slate-300 group-hover:text-red-400 ml-auto flex-shrink-0" />
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};

// ─── TAB: Pagamentos (accordion) ─────────────────────────────────────────────
const TabPayments = ({ biddings }) => {
  const totalGeral = biddings.reduce((acc, b) =>
    acc + (b.payments || []).reduce((pa, p) => pa + (Number(p.value) || 0), 0), 0);

  if (biddings.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-dashed border-slate-200 py-20 text-center">
        <CreditCard className="w-10 h-10 text-slate-200 mx-auto mb-3" />
        <p className="text-slate-400 text-sm font-medium">Nenhuma licitação cadastrada.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Resumo total */}
      {totalGeral > 0 && (
        <div className="bg-gradient-to-r from-emerald-50 to-green-50 border border-emerald-100 rounded-2xl p-5 flex items-center gap-4 shadow-sm">
          <div className="w-12 h-12 bg-white rounded-xl border border-emerald-100 flex items-center justify-center flex-shrink-0 shadow-sm">
            <Banknote className="w-6 h-6 text-emerald-600" />
          </div>
          <div>
            <p className="text-[10px] text-emerald-600 font-bold uppercase tracking-widest">Total pago — todas as fases</p>
            <p className="text-2xl font-black text-emerald-800 mt-0.5">{formatCurrency(totalGeral)}</p>
          </div>
          <div className="ml-auto text-right hidden sm:block">
            <p className="text-[10px] text-emerald-600 font-bold uppercase tracking-widest">{biddings.length} licitaç{biddings.length === 1 ? 'ão' : 'ões'}</p>
            <p className="text-sm font-semibold text-emerald-700 mt-0.5">{biddings.reduce((a, b) => a + (b.payments || []).length, 0)} pagamentos</p>
          </div>
        </div>
      )}

      {/* Accordion: uma licitação por item */}
      <Accordion type="multiple" className="space-y-3">
        {biddings.map((bidding, idx) => {
          const payments  = [...(bidding.payments || [])].sort((a, b) => new Date(b.payment_date) - new Date(a.payment_date));
          const totalPaid = payments.reduce((acc, p) => acc + (Number(p.value) || 0), 0);
          const paidPct   = bidding.value ? Math.min((totalPaid / bidding.value) * 100, 100) : 0;

          return (
            <AccordionItem key={bidding.id} value={bidding.id}
              className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm data-[state=open]:border-slate-300 transition-colors">
              {/* Trigger */}
              <AccordionTrigger className="px-5 py-4 hover:no-underline hover:bg-slate-50/60 data-[state=open]:bg-slate-50/60 transition-colors [&>svg]:hidden">
                <div className="flex items-center gap-4 w-full text-left">
                  {/* Number badge */}
                  <div className="w-8 h-8 rounded-lg bg-slate-100 text-slate-500 flex items-center justify-center flex-shrink-0 text-xs font-black">
                    {String(idx + 1).padStart(2, '0')}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest mb-0.5">Fase / Licitação</p>
                    <p className="font-bold text-slate-900 text-sm truncate">{bidding.title}</p>
                    {bidding.description && <p className="text-xs text-slate-400 truncate mt-0.5">{bidding.description}</p>}
                  </div>
                  {/* Summary right */}
                  <div className="text-right flex-shrink-0 mr-2">
                    <p className="text-[10px] text-slate-400 font-medium">Pago</p>
                    <p className="text-sm font-black text-emerald-600">{formatCurrency(totalPaid)}</p>
                    <p className="text-[10px] text-slate-400 mt-0.5">{payments.length} pgto{payments.length !== 1 ? 's' : ''}</p>
                  </div>
                  {/* Expand icon */}
                  <div className="w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center flex-shrink-0 group-data-[state=open]:rotate-180 transition-transform">
                    <ChevronRight className="w-3.5 h-3.5 text-slate-500 rotate-90" />
                  </div>
                </div>
              </AccordionTrigger>

              {/* Content */}
              <AccordionContent className="border-t border-slate-100">
                {/* Progress bar */}
                {bidding.value > 0 && (
                  <div className="px-5 pt-4 pb-3 bg-slate-50/60 border-b border-slate-100">
                    <div className="flex justify-between text-xs mb-1.5">
                      <span className="text-slate-400 font-medium">Execução financeira</span>
                      <span className="font-bold text-slate-700">{paidPct.toFixed(1)}%</span>
                    </div>
                    <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
                      <div className="h-full bg-emerald-500 rounded-full transition-all duration-500" style={{ width: `${paidPct}%` }} />
                    </div>
                    <div className="flex justify-between text-[11px] mt-1.5 text-slate-400">
                      <span>Pago: <span className="font-semibold text-emerald-600">{formatCurrency(totalPaid)}</span></span>
                      <span>Contrato: <span className="font-semibold text-slate-600">{formatCurrency(bidding.value)}</span></span>
                    </div>
                  </div>
                )}

                {/* Table */}
                {payments.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-100">
                          <th className="text-left px-5 py-2.5 font-bold text-slate-400 uppercase tracking-wide text-[9px]">Data</th>
                          <th className="text-left px-5 py-2.5 font-bold text-slate-400 uppercase tracking-wide text-[9px]">OB / Empenho</th>
                          <th className="text-right px-5 py-2.5 font-bold text-slate-400 uppercase tracking-wide text-[9px]">Valor</th>
                          <th className="text-center px-4 py-2.5 font-bold text-slate-400 uppercase tracking-wide text-[9px]">Portal</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {payments.map(p => (
                          <tr key={p.id} className="hover:bg-slate-50/60 transition-colors">
                            <td className="px-5 py-3">
                              <div className="flex items-center gap-2">
                                <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 flex-shrink-0" />
                                <span className="font-semibold text-slate-700">{formatDate(p.payment_date)}</span>
                              </div>
                            </td>
                            <td className="px-5 py-3 text-slate-500">{p.banking_order || '—'}</td>
                            <td className="px-5 py-3 text-right font-black text-blue-600">{formatCurrency(p.value)}</td>
                            <td className="px-4 py-3 text-center">
                              {p.portal_link
                                ? <a href={p.portal_link} target="_blank" rel="noopener noreferrer"
                                    className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-emerald-50 hover:bg-emerald-100 transition-colors">
                                    <ExternalLink className="w-3.5 h-3.5 text-emerald-600" />
                                  </a>
                                : <span className="text-slate-300">—</span>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="bg-slate-50 border-t border-slate-200">
                          <td colSpan={2} className="px-5 py-2.5 text-[9px] font-bold text-slate-400 uppercase tracking-wide">
                            Subtotal — {payments.length} pagamento(s)
                          </td>
                          <td className="px-5 py-2.5 text-right">
                            <span className="text-sm font-black text-emerald-700">{formatCurrency(totalPaid)}</span>
                          </td>
                          <td />
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                ) : (
                  <div className="px-5 py-8 text-center">
                    <CreditCard className="w-8 h-8 text-slate-200 mx-auto mb-2" />
                    <p className="text-sm text-slate-400 italic">Nenhum pagamento nesta fase.</p>
                  </div>
                )}
              </AccordionContent>
            </AccordionItem>
          );
        })}
      </Accordion>
    </div>
  );
};

// ─── TAB: Documentos ─────────────────────────────────────────────────────────
const TabDocuments = ({ galleryGroups, openViewer, documents, relatedNews }) => (
  <div className="space-y-6">
    {galleryGroups.length === 0 && documents.length === 0 && relatedNews.length === 0 && (
      <div className="bg-white rounded-2xl border border-dashed border-slate-200 py-20 text-center">
        <ImageIcon className="w-10 h-10 text-slate-200 mx-auto mb-3" />
        <p className="text-slate-400 text-sm font-medium">Nenhuma mídia disponível.</p>
      </div>
    )}
    {galleryGroups.map(({ name, items }) => {
      const hasMore = items.length > 9;
      const display = hasMore ? items.slice(0, 9) : items;
      return (
        <div key={name}>
          <div className="flex items-center gap-2 mb-3">
            {name === 'Geral' ? <ImageIcon className="w-4 h-4 text-slate-400" /> : <FolderOpen className="w-4 h-4 text-slate-400" />}
            <h4 className="text-sm font-bold text-slate-700">{name === 'Geral' ? 'Galeria Geral' : name}</h4>
            <span className="text-[11px] text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">{items.length}</span>
          </div>
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-2">
            {display.map((item, idx) => (
              <button key={item.id} onClick={() => openViewer(items, idx)}
                className="aspect-square rounded-xl overflow-hidden border border-slate-200 hover:border-red-400 hover:shadow-md transition-all group bg-slate-100">
                {['video','video_url'].includes(item.type)
                  ? <div className="w-full h-full flex items-center justify-center bg-slate-800 group-hover:bg-slate-700 transition-colors"><Video className="w-6 h-6 text-white/60" /></div>
                  : <img src={item.url} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />}
              </button>
            ))}
            {hasMore && (
              <button onClick={() => openViewer(items, 9)}
                className="aspect-square rounded-xl bg-slate-50 border-2 border-dashed border-slate-300 flex flex-col items-center justify-center hover:bg-slate-100 transition-colors">
                <FolderOpen className="w-5 h-5 text-slate-400 mb-1" />
                <span className="text-xs font-bold text-slate-500">+{items.length - 9}</span>
              </button>
            )}
          </div>
        </div>
      );
    })}
    {documents.length > 0 && (
      <div>
        <div className="flex items-center gap-2 mb-3">
          <FileText className="w-4 h-4 text-slate-400" />
          <h4 className="text-sm font-bold text-slate-700">Documentos</h4>
          <span className="text-[11px] text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">{documents.length}</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {documents.map(doc => (
            <a key={doc.id} href={doc.url} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-3 p-3.5 rounded-2xl bg-white border border-slate-200 hover:border-red-300 hover:bg-red-50/30 transition-all group">
              <div className="w-9 h-9 rounded-xl bg-red-50 flex items-center justify-center flex-shrink-0 group-hover:bg-red-100 transition-colors">
                <FileText className="w-4 h-4 text-red-500" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-slate-700 truncate group-hover:text-red-700">{doc.title || doc.name || 'Documento'}</p>
                <p className="text-xs text-slate-400 mt-0.5">{doc.created_at ? formatDate(doc.created_at) : ''}</p>
              </div>
              <ArrowUpRight className="w-4 h-4 text-slate-300 group-hover:text-red-400 flex-shrink-0" />
            </a>
          ))}
        </div>
      </div>
    )}
    {relatedNews.length > 0 && (
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Newspaper className="w-4 h-4 text-slate-400" />
          <h4 className="text-sm font-bold text-slate-700">Notícias relacionadas</h4>
        </div>
        <div className="space-y-2">
          {relatedNews.map(n => {
            const d = n.date ? new Date(n.date) : null;
            const valid = d && !isNaN(d.getTime());
            return (
              <Link key={n.id} to={`/noticias/${n.id}`}
                className="flex items-center gap-3 p-3.5 rounded-2xl bg-white border border-slate-200 hover:border-blue-200 hover:bg-blue-50/20 transition-all group">
                <div className="w-16 h-12 rounded-xl overflow-hidden bg-slate-100 flex-shrink-0">
                  {n.image_url ? <img src={n.image_url} alt={n.title} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center"><Newspaper className="w-5 h-5 text-slate-300" /></div>}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-700 leading-tight line-clamp-2">{n.title}</p>
                  {valid && <p className="text-xs text-slate-400 mt-0.5">{d.toLocaleDateString('pt-BR', { timeZone: 'UTC' })}</p>}
                </div>
                <ArrowUpRight className="w-4 h-4 text-slate-300 group-hover:text-blue-400 flex-shrink-0" />
              </Link>
            );
          })}
        </div>
      </div>
    )}
  </div>
);

// ─── MAIN ────────────────────────────────────────────────────────────────────
const WorkDetailsPage = () => {
  const { workId } = useParams();
  const { toast }  = useToast();
  const { user }   = useAuth();
  const navigate   = useNavigate();

  const [work, setWork]           = useState(null);
  const [media, setMedia]         = useState([]);
  const [isFavorited, setFav]     = useState(false);
  const [loading, setLoading]     = useState(true);
  const [activeTab, setTab]       = useState('overview');

  const [viewerState, setViewer]              = useState({ isOpen: false, startIndex: 0, items: [] });
  const [showContrib, setShowContrib]         = useState(false);
  const [contribDesc, setContribDesc]         = useState('');
  const [contribVideo, setContribVideo]       = useState('');
  const [contribFiles, setContribFiles]       = useState([]);
  const fileRef                               = useRef(null);
  const [showAdminEdit, setShowAdminEdit]     = useState(false);
  const [editOptions, setEditOptions]         = useState({ categories:[], areas:[], bairros:[], contractors:[] });
  const [submitting, setSubmitting]           = useState(false);
  const [showReport, setShowReport]           = useState(false);
  const [measurements, setMeasurements]       = useState([]);
  const [biddings, setBiddings]               = useState([]);
  const [relatedNews, setRelatedNews]         = useState([]);

  const totalSpent = useMemo(() =>
    biddings.reduce((a, b) => a + (b.payments || []).reduce((pa, p) => pa + (Number(p.value) || 0), 0), 0),
  [biddings]);

  const fetchWork = useCallback(async () => {
    setLoading(true);
    const { data: w, error } = await supabase
      .from('public_works')
      .select('*, work_category:work_categories(name), work_area:work_areas(name), bairro:bairros(name), contractor:contractor_id(id,name,cnpj)')
      .eq('id', workId).single();
    if (error) { toast({ title:'Erro', description:error.message, variant:'destructive' }); setLoading(false); return; }

    const [{ data: md }, { data: ms }] = await Promise.all([
      supabase.from('public_work_media').select('*').eq('work_id', workId)
        .order('media_date', { ascending:false, nullsFirst:false }).order('created_at', { ascending:false }),
      supabase.from('public_work_measurements')
        .select('*, contractor:contractor_id(name,cnpj), payments:public_work_payments(*)')
        .eq('work_id', workId).order('created_at', { ascending:false }),
    ]);

    let news = [];
    const { data: rel } = await supabase.from('news_public_works').select('news_id').eq('work_id', workId);
    if (rel?.length) {
      const ids = rel.map(r => r.news_id).filter(Boolean);
      if (ids.length) {
        const { data: nl } = await supabase.from('news').select('id,title,date,image_url').in('id', ids).order('date', { ascending:false });
        news = nl || [];
      }
    }
    setWork(w); setMedia(md || []); setMeasurements(ms || []); setBiddings(ms || []); setRelatedNews(news);
    setLoading(false);
  }, [workId, toast]);

  useEffect(() => { fetchWork(); }, [fetchWork]);
  useEffect(() => {
    if (!user) { setFav(false); return; }
    supabase.from('favorite_works').select('id').eq('user_id', user.id).eq('work_id', workId)
      .then(({ data }) => setFav((data || []).length > 0));
  }, [user, workId]);
  useEffect(() => { window.scrollTo(0, 0); }, []);
  useEffect(() => {
    if (!user?.is_admin) return;
    Promise.all([
      supabase.from('work_categories').select('*'),
      supabase.from('work_areas').select('*'),
      supabase.from('bairros').select('*'),
      supabase.from('contractors').select('*'),
    ]).then(([c,a,b,co]) => setEditOptions({ categories:c.data||[], areas:a.data||[], bairros:b.data||[], contractors:co.data||[] }));
  }, [user?.is_admin]);

  const toggleFav = async () => {
    if (!user) { toast({ title:'Faça login', variant:'destructive' }); navigate('/login'); return; }
    if (isFavorited) {
      await supabase.from('favorite_works').delete().match({ user_id:user.id, work_id:workId });
      toast({ title:'Removido dos favoritos 💔' }); setFav(false);
    } else {
      await supabase.from('favorite_works').insert({ user_id:user.id, work_id:workId });
      toast({ title:'Adicionado aos favoritos ⭐' }); setFav(true);
    }
  };

  const getBase = useCallback(() => {
    if (import.meta.env.VITE_APP_URL) return import.meta.env.VITE_APP_URL;
    if (Capacitor.isNativePlatform()) return 'https://trombonecidadao.com.br';
    return typeof window !== 'undefined' ? window.location.origin : 'https://trombonecidadao.com.br';
  }, []);

  const seoData = useMemo(() => {
    const base = getBase();
    let img = `${base}/images/thumbnail.jpg`;
    if (work?.thumbnail_url) { try { img = `https://wsrv.nl/?url=${encodeURIComponent(work.thumbnail_url.split('?')[0])}&w=1200&h=630&fit=cover&q=80&output=jpg`; } catch {} }
    return { title: work ? `Obra: ${work.title} - Trombone Cidadão` : 'Detalhes da Obra', description: work?.description || '', image: img, url: typeof window !== 'undefined' ? window.location.href : '' };
  }, [work, getBase]);

  const viewable    = useMemo(() => media.filter(m => ['image','photo','video','video_url'].includes(m.type)), [media]);
  const mainMedia   = useMemo(() => viewable.filter(m => !m.measurement_id), [viewable]);
  const groups      = useMemo(() => {
    const g = {};
    mainMedia.forEach(i => { const n = i.gallery_name || 'Geral'; if (!g[n]) g[n] = []; g[n].push(i); });
    return Object.entries(g).map(([name, items]) => ({ name, items }))
      .sort((a, b) => a.name === 'Geral' ? -1 : b.name === 'Geral' ? 1 : a.name.localeCompare(b.name));
  }, [mainMedia]);
  const allViewable = useMemo(() => groups.flatMap(g => g.items), [groups]);
  const heroMedia   = useMemo(() => work?.thumbnail_url ? { id:'hero', type:'photo', url:work.thumbnail_url } : allViewable[0] || null, [work?.thumbnail_url, allViewable]);
  const docs        = media.filter(m => ['pdf','document','file'].includes(m.type) && !m.measurement_id);

  const shareWork = async () => {
    if (!work) return;
    const url = getWorkShareUrl(work.id);
    try {
      if (Capacitor.isNativePlatform()) { await Share.share({ title:work.title, url, dialogTitle:'Compartilhar' }); return; }
      if (navigator.share) { await navigator.share({ title:work.title, url }); return; }
      await navigator.clipboard.writeText(url); toast({ title:'Link copiado!' });
    } catch (e) {
      if (e.name === 'AbortError') return;
      try { await navigator.clipboard.writeText(url); toast({ title:'Link copiado!' }); } catch { toast({ title:'Erro', variant:'destructive' }); }
    }
  };

  const submitContrib = async () => {
    if (!user || !work || submitting) return;
    setSubmitting(true);
    try {
      for (const f of contribFiles) {
        const path = `works/${work.id}/${Date.now()}-${f.name}`;
        const { error: ue } = await supabase.storage.from('work-media').upload(path, f);
        if (ue) throw ue;
        const { data: { publicUrl } } = supabase.storage.from('work-media').getPublicUrl(path);
        const type = f.type.startsWith('image') ? 'image' : f.type.startsWith('video') ? 'video' : f.type === 'application/pdf' ? 'pdf' : 'file';
        await supabase.from('public_work_media').insert({ work_id:work.id, url:publicUrl, type, name:f.name, description:contribDesc||null, status:'pending', contributor_id:user.id });
      }
      if (contribVideo?.trim()) await supabase.from('public_work_media').insert({ work_id:work.id, url:contribVideo.trim(), type:'video_url', name:'Vídeo do cidadão', description:contribDesc||null, status:'pending', contributor_id:user.id });
      toast({ title:'Contribuição enviada! ✅' });
      setShowContrib(false); setContribDesc(''); setContribVideo(''); setContribFiles([]);
      const { data: m } = await supabase.from('public_work_media').select('*').eq('work_id', work.id).order('created_at', { ascending:false });
      setMedia(m || []);
    } catch (e) { toast({ title:'Erro', description:e.message, variant:'destructive' }); }
    finally { setSubmitting(false); }
  };

  const openViewer = (items, startIndex) => {
    const vi = items.map(m => m.type==='image' ? {...m,type:'photo'} : m.type==='video_url' ? {...m,type:'video'} : m);
    setViewer({ isOpen:true, startIndex, items:vi });
  };

  // Loading
  if (loading) return (
    <div className="max-w-6xl mx-auto px-4 py-6 space-y-4">
      <Skeleton className="h-10 w-40 rounded-xl" />
      <Skeleton className="h-72 w-full rounded-2xl" />
      <Skeleton className="h-8 w-2/3 rounded-xl" />
      <div className="grid grid-cols-4 gap-3">{[...Array(4)].map((_,i) => <Skeleton key={i} className="h-20 rounded-2xl" />)}</div>
      <Skeleton className="h-12 w-full rounded-2xl" />
      <div className="grid grid-cols-3 gap-4"><Skeleton className="col-span-2 h-80 rounded-2xl" /><Skeleton className="h-80 rounded-2xl" /></div>
    </div>
  );

  if (!work) return (
    <div className="max-w-6xl mx-auto px-4 py-16 text-center">
      <p className="text-xl font-bold text-slate-700 mb-4">Obra não encontrada</p>
      <Button asChild><Link to="/obras-publicas">Voltar</Link></Button>
    </div>
  );

  const si         = getStatusInfo(work.status);
  const spentValue = totalSpent || work.amount_spent || 0;

  const TABS = [
    { id:'overview',  label:'Visão Geral',      icon:Activity   },
    { id:'phases',    label:'Etapas do Projeto', icon:Layers     },
    { id:'payments',  label:'Pagamentos',        icon:CreditCard },
    { id:'documents', label:'Documentos',        icon:FolderOpen },
  ];

  return (
    <div className="min-h-screen bg-[#F2F3F5] pb-20 md:pb-10">
      <DynamicSEO {...seoData} />

      {/* ── Top bar ── */}
      <div className="bg-white border-b border-slate-200 sticky top-0 z-30 shadow-sm">
        <div className="max-w-6xl mx-auto px-4 h-12 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <Button asChild size="icon" variant="ghost" className="h-8 w-8 rounded-lg hover:bg-slate-100 flex-shrink-0">
              <Link to="/obras-publicas"><ArrowLeft className="w-4 h-4 text-slate-600" /></Link>
            </Button>
            <span className="text-xs font-semibold text-slate-500 hidden sm:block">Voltar para o mapa de obras</span>
          </div>

          <div className="hidden lg:flex items-center gap-1 text-[11px] text-slate-400">
            <Link to="/" className="hover:text-red-500 transition-colors">Início</Link>
            <ChevronRight className="w-3 h-3" />
            <Link to="/obras-publicas" className="hover:text-red-500 transition-colors">Obras Públicas</Link>
            <ChevronRight className="w-3 h-3" />
            <span className="text-slate-600 font-medium truncate max-w-[220px]">{work.title}</span>
          </div>

          <div className="flex items-center gap-1.5 flex-shrink-0">
            {user?.is_admin && (
              <Button onClick={() => setShowAdminEdit(true)} size="sm" variant="outline" className="h-8 text-xs border-slate-200 text-slate-600 px-3">
                <Edit className="w-3.5 h-3.5 sm:mr-1.5" /><span className="hidden sm:inline">Gerenciar</span>
              </Button>
            )}
            <Button onClick={shareWork} size="sm" variant="outline" className="h-8 text-xs border-slate-200 text-slate-600 px-3">
              <Share2 className="w-3.5 h-3.5 sm:mr-1.5" /><span className="hidden sm:inline">Compartilhar</span>
            </Button>
            <Button onClick={toggleFav} size="icon" variant="outline"
              className={`h-8 w-8 ${isFavorited ? 'text-red-500 bg-red-50 border-red-200 hover:bg-red-100' : 'border-slate-200 text-slate-500 hover:text-red-500'}`}>
              <Heart className={`w-3.5 h-3.5 ${isFavorited ? 'fill-current' : ''}`} />
            </Button>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 pt-5 space-y-4">

        {/* ── Hero image FIRST ── */}
        {heroMedia && (
          <div
            className="relative w-full rounded-2xl overflow-hidden cursor-pointer bg-slate-900 shadow-md"
            style={{ height: '300px' }}
            onClick={() => allViewable.length > 0 && openViewer(allViewable, 0)}
          >
            {['video','video_url'].includes(heroMedia.type)
              ? <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-gray-800 to-gray-900"><Video className="w-14 h-14 text-white/30" /></div>
              : <img src={heroMedia.url} alt="Capa da obra" className="w-full h-full object-cover" />}
            <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/5 to-transparent" />
            {/* Badges bottom-left */}
            <div className="absolute bottom-4 left-4 flex flex-wrap gap-2">
              <span className={`inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-full bg-white/92 backdrop-blur-sm shadow-sm ${si.color}`}>
                <si.icon className="w-3.5 h-3.5" />{si.text}
              </span>
              {work.bairro && (
                <span className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-full bg-white/92 backdrop-blur-sm shadow-sm text-slate-700">
                  <MapPin className="w-3 h-3 text-slate-400" />{work.bairro.name}
                </span>
              )}
            </div>
            {allViewable.length > 1 && (
              <div className="absolute bottom-4 right-4 bg-black/50 backdrop-blur-sm text-white text-xs font-bold px-3 py-1.5 rounded-full flex items-center gap-1.5">
                <ImageIcon className="w-3.5 h-3.5" />{allViewable.length} fotos
              </div>
            )}
          </div>
        )}

        {/* ── Title block ── */}
        <div>
          <h1 className="text-2xl md:text-3xl font-black text-slate-900 leading-tight">{work.title}</h1>
          {work.description && !work.long_description && (
            <p className="text-sm text-slate-500 mt-1 leading-relaxed max-w-3xl">{work.description}</p>
          )}
        </div>

        {/* ── Metrics ── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { icon: DollarSign, label: 'Pago', value: spentValue > 0 ? formatCurrency(spentValue) : '—', bg: 'bg-emerald-100', iconColor: 'text-emerald-600' },
            { icon: TrendingUp, label: 'Concluído', value: `${work.execution_percentage || 0}%`, bg: 'bg-blue-100', iconColor: 'text-blue-600' },
            { icon: Building,   label: 'Construtora', value: work.contractor?.name || '—', bg: 'bg-amber-100', iconColor: 'text-amber-600' },
            { icon: MapPin,     label: 'Local', value: work.bairro?.name || work.address || '—', bg: 'bg-red-100', iconColor: 'text-red-500' },
          ].map(({ icon: Icon, label, value, bg, iconColor }) => (
            <div key={label} className="bg-white rounded-2xl border border-slate-200 px-4 py-3.5 flex items-center gap-3 shadow-sm">
              <div className={`w-9 h-9 rounded-xl ${bg} flex items-center justify-center flex-shrink-0`}>
                <Icon className={`w-4 h-4 ${iconColor}`} />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wide">{label}</p>
                <p className="text-sm font-black text-slate-800 truncate">{value}</p>
              </div>
            </div>
          ))}
        </div>

        {/* ── Tabs ── */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="flex overflow-x-auto scrollbar-none">
            {TABS.map(tab => (
              <button key={tab.id} onClick={() => setTab(tab.id)}
                className={`flex items-center gap-2 px-5 py-3.5 text-sm font-semibold whitespace-nowrap border-b-2 transition-all flex-shrink-0 ${
                  activeTab === tab.id ? 'border-red-500 text-red-600 bg-red-50/40' : 'border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50'
                }`}>
                <tab.icon className="w-4 h-4" />
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* ── Tab content ── */}
        <div>
          {activeTab === 'overview'  && <TabOverview  work={work} totalSpentFromPayments={totalSpent} measurements={measurements} />}
          {activeTab === 'phases'    && <TabPhases    measurements={measurements} media={media} viewableMedia={viewable} openViewer={openViewer} />}
          {activeTab === 'payments'  && <TabPayments  biddings={biddings} />}
          {activeTab === 'documents' && <TabDocuments galleryGroups={groups} openViewer={openViewer} documents={docs} relatedNews={relatedNews} />}
        </div>

        {/* ── CTA bar ── */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 flex flex-col sm:flex-row items-center gap-4 shadow-sm">
          <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center flex-shrink-0">
            <UploadCloud className="w-5 h-5 text-red-500" />
          </div>
          <div className="flex-1 text-center sm:text-left">
            <p className="text-sm font-bold text-slate-800">Tem informações sobre esta obra?</p>
            <p className="text-xs text-slate-400 mt-0.5">Envie fotos, vídeos ou relatórios para manter os dados atualizados.</p>
          </div>
          <div className="flex gap-2 flex-shrink-0">
            <Button onClick={() => { if (!user) { toast({ title:'Faça login', variant:'destructive' }); navigate('/login'); return; } setShowContrib(true); }}
              size="sm" className="bg-red-600 hover:bg-red-700 text-white shadow-sm">
              <UploadCloud className="w-3.5 h-3.5 mr-1.5" />Contribuir
            </Button>
            <Button onClick={() => setShowReport(true)} size="sm" variant="outline" className="border-slate-200 text-slate-500 text-xs">
              Reportar erro
            </Button>
          </div>
        </div>
      </div>

      {/* Viewer */}
      {viewerState.isOpen && (
        <MediaViewer onClose={() => setViewer({ isOpen:false, startIndex:0, items:[] })} media={viewerState.items} startIndex={viewerState.startIndex} />
      )}

      {/* Report dialog */}
      <Dialog open={showReport} onOpenChange={setShowReport}>
        <DialogContent className="sm:max-w-md bg-white">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base font-bold">
              <AlertTriangle className="w-5 h-5 text-amber-500" /> Informar Erro
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-slate-500">Identificou alguma inconsistência? Nos envie um e-mail.</p>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowReport(false)}>Cancelar</Button>
            <Button asChild className="bg-slate-900 text-white hover:bg-slate-800">
              <a href={`mailto:contato@trombonecidadao.com.br?subject=Erro na Obra: ${encodeURIComponent(work.title)}&body=Olá, gostaria de informar um erro na obra "${work.title}" (ID: ${work.id}).%0D%0A%0D%0ADetalhes:%0D%0A`}>
                Enviar E-mail
              </a>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Contrib dialog */}
      <Dialog open={showContrib} onOpenChange={setShowContrib}>
        <DialogContent className="sm:max-w-lg bg-white">
          <DialogHeader>
            <DialogTitle className="font-bold text-slate-800">Contribuir com esta obra</DialogTitle>
            <p className="text-sm text-slate-500">Envie fotos, vídeos ou informações atualizadas.</p>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid gap-2">
              <Label className="text-xs font-bold text-slate-600 uppercase tracking-wide">Descrição</Label>
              <Textarea value={contribDesc} onChange={e => setContribDesc(e.target.value)} placeholder="O que você observou?" rows={3} className="resize-none rounded-xl border-slate-200 text-sm" />
            </div>
            <div className="grid gap-2">
              <Label className="text-xs font-bold text-slate-600 uppercase tracking-wide">Fotos / Vídeos / PDFs</Label>
              <div className="border-2 border-dashed border-slate-200 rounded-xl p-6 text-center hover:bg-slate-50 cursor-pointer transition-colors" onClick={() => fileRef.current?.click()}>
                <UploadCloud className="w-7 h-7 text-slate-300 mx-auto mb-2" />
                <p className="text-sm text-slate-500">Clique para selecionar arquivos</p>
                <Input ref={fileRef} type="file" accept="image/*,video/*,application/pdf" multiple className="hidden" onChange={e => setContribFiles(Array.from(e.target.files || []))} />
              </div>
              {contribFiles.length > 0 && <p className="text-xs text-emerald-600 font-semibold">{contribFiles.length} arquivo(s) selecionado(s)</p>}
            </div>
            <div className="grid gap-2">
              <Label className="text-xs font-bold text-slate-600 uppercase tracking-wide">Link de Vídeo (Opcional)</Label>
              <Input placeholder="https://youtube.com/..." value={contribVideo} onChange={e => setContribVideo(e.target.value)} className="rounded-xl border-slate-200 text-sm" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowContrib(false)} disabled={submitting}>Cancelar</Button>
            <Button onClick={submitContrib} disabled={submitting} className="bg-red-600 hover:bg-red-700 text-white">
              {submitting ? 'Enviando...' : 'Enviar Contribuição'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Admin modal */}
      {user?.is_admin && (
        <WorkEditModal
          work={showAdminEdit ? work : null}
          onSave={async (ws) => {
            const { id, location, ...data } = ws;
            ['bairro','work_category','work_area','contractor'].forEach(k => delete data[k]);
            const payload = { ...data, location: location ? `POINT(${location.lng} ${location.lat})` : null };
            ['bairro_id','work_category_id','work_area_id','contractor_id'].forEach(k => { if (payload[k]==='') payload[k]=null; });
            if (!Array.isArray(payload.funding_source)) payload.funding_source = [];
            const { error } = await supabase.from('public_works').update(payload).eq('id', id);
            if (error) { toast({ title:'Erro', description:error.message, variant:'destructive' }); }
            else { toast({ title:'Obra atualizada!' }); setShowAdminEdit(false); fetchWork(); }
          }}
          onClose={() => setShowAdminEdit(false)}
          workOptions={editOptions}
        />
      )}
    </div>
  );
};

export default WorkDetailsPage;
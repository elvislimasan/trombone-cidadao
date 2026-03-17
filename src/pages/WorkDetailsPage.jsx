import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { Share } from '@capacitor/share';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { getWorkShareUrl } from '@/lib/shareUtils';
import DynamicSEO from '@/components/DynamicSeo';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import {
  ArrowLeft, Calendar, DollarSign, PauseCircle, CheckCircle, MapPin,
  Video, Image as ImageIcon, FileText, Building, Award,
  BookOpen, Heart, Link2, Share2, Edit, UploadCloud, User, Activity,
  ArrowUpRight, AlertTriangle, HelpCircle, Newspaper, FolderOpen, Info,
  ChevronRight, TrendingUp, Layers, CreditCard,
  Banknote
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

const getIconTone = (Icon) => {
  if (Icon === DollarSign || Icon === Banknote) return 'text-emerald-600';
  if (Icon === CreditCard) return 'text-blue-600';
  if (Icon === TrendingUp) return 'text-violet-600';
  if (Icon === FileText) return 'text-sky-600';
  if (Icon === Building) return 'text-indigo-600';
  if (Icon === MapPin) return 'text-rose-600';
  if (Icon === Calendar) return 'text-amber-600';
  if (Icon === Layers) return 'text-fuchsia-600';
  if (Icon === BookOpen) return 'text-orange-600';
  if (Icon === ImageIcon) return 'text-cyan-600';
  if (Icon === Link2) return 'text-slate-600';
  if (Icon === Activity) return 'text-blue-600';
  if (Icon === ArrowUpRight) return 'text-slate-600';
  if (Icon === Info) return 'text-slate-600';
  return 'text-slate-400';
};

// ─── Atoms ───────────────────────────────────────────────────────────────────
const InfoRow = ({ icon: Icon, label, value, accent }) => (
  <div className="flex items-start gap-3 py-2.5 border-b border-slate-100 last:border-0">
    <div className="w-7 h-7 rounded-md bg-slate-50 border border-slate-100 flex items-center justify-center flex-shrink-0 mt-0.5">
      <Icon className={`w-3.5 h-3.5 ${getIconTone(Icon)}`} />
    </div>
    <div className="flex-1 min-w-0">
      <p className="text-[11px] text-slate-400 font-medium uppercase tracking-wide">{label}</p>
      <p className={`text-sm font-semibold leading-snug mt-0.5 break-words ${accent ? 'text-red-600' : 'text-slate-800'}`}>{value || '—'}</p>
    </div>
  </div>
);

const PanelHeader = ({ icon: Icon, children }) => (
  <div className="px-5 py-3 bg-slate-50/80 border-b border-slate-100 flex items-center gap-2">
    <Icon className={`w-3.5 h-3.5 ${getIconTone(Icon)}`} />
    <span className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">{children}</span>
  </div>
);

// ─── TAB: Visão Geral ─────────────────────────────────────────────────────────
const TabOverview = ({ work, spentValue, spentPct, measurements = [], onOpenPhase }) => {
  const [showMore, setShowMore] = useState(false);

  const phasesSorted = useMemo(() => {
    const key = (m) => (m?.start_date || m?.predicted_start_date || m?.created_at || '');
    return [...(measurements || [])].sort((a, b) => key(a).localeCompare(key(b)));
  }, [measurements]);

  const segments = useMemo(() => {
    const COLORS = ['bg-blue-500', 'bg-amber-400', 'bg-violet-500', 'bg-emerald-500', 'bg-rose-500', 'bg-cyan-500'];
    let prev = 0;
    return phasesSorted
      .filter(m => m && m.execution_percentage !== null && m.execution_percentage !== undefined && m.execution_percentage !== '')
      .map((m, i) => {
        const end = Math.max(0, Math.min(100, Number(m.execution_percentage) || 0));
        const start = Math.max(0, Math.min(100, prev));
        const width = Math.max(0, end - start);
        prev = Math.max(prev, end);
        return {
          id: m.id,
          title: m.title,
          start,
          end,
          width,
          color: COLORS[i % COLORS.length],
          status: m.status,
          contractorName: m.contractor?.name || null,
        };
      })
      .filter(s => s.width > 0 || s.end === 100 || s.start === 0);
  }, [phasesSorted]);

  const computedExecutionPct = useMemo(() => {
    const fromPhases = phasesSorted.reduce((max, m) => {
      const n = Number(m.execution_percentage);
      return Number.isFinite(n) ? Math.max(max, n) : max;
    }, 0);
    const fromWork = Number(work.execution_percentage);
    return Math.max(fromPhases, Number.isFinite(fromWork) ? fromWork : 0);
  }, [phasesSorted, work.execution_percentage]);

  const schedule = useMemo(() => {
    const startDate = work.start_date ? new Date(work.start_date) : null;
    const endDate = (work.end_date_forecast || work.expected_end_date) ? new Date(work.end_date_forecast || work.expected_end_date) : null;
    const today = new Date();
    const daysElapsed = startDate ? Math.floor((today - startDate) / 86400000) : null;
    const daysRemaining = endDate ? Math.max(0, Math.floor((endDate - today) / 86400000)) : null;
    const timePct = (startDate && endDate && endDate > startDate) ? Math.min(((today - startDate) / (endDate - startDate)) * 100, 100) : 0;
    return { daysElapsed, daysRemaining, timePct };
  }, [work.start_date, work.end_date_forecast, work.expected_end_date]);

  const fundingLabel = (src) => {
    const map = { federal: 'Federal', estadual: 'Estadual', municipal: 'Municipal' };
    return map[src] || src;
  };

  return (
    <div className="mt-0 lg:space-y-8">
      <div className="lg:hidden space-y-3">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-4 py-3 bg-slate-50 border-b border-slate-100 flex items-center gap-2">
            <FileText className="w-4 h-4 text-slate-500" />
            <span className="text-[10px] font-black text-slate-600 uppercase tracking-widest">Detalhes da obra</span>
          </div>
          <div className="divide-y divide-slate-100">
            <div className="flex items-start gap-3 px-4 py-3">
              <div className="w-9 h-9 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-center flex-shrink-0">
                <Award className="w-4 h-4 text-indigo-600" />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Categoria</p>
                <p className="text-sm font-semibold text-slate-900 mt-0.5 break-words whitespace-normal">{work.work_category?.name || '—'}</p>
              </div>
            </div>
            <div className="flex items-start gap-3 px-4 py-3">
              <div className="w-9 h-9 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-center flex-shrink-0">
                <Activity className="w-4 h-4 text-blue-600" />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Status</p>
                <div className="mt-1">
                  <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-black ${getStatusInfo(work.status).bg} ${getStatusInfo(work.status).color}`}>
                    {getStatusInfo(work.status).text}
                  </span>
                </div>
              </div>
            </div>
            <div className="flex items-start gap-3 px-4 py-3">
              <div className="w-9 h-9 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-center flex-shrink-0">
                <MapPin className="w-4 h-4 text-rose-600" />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Endereço</p>
                <p className="text-sm font-semibold text-slate-900 mt-0.5 break-words whitespace-normal">
                  {work.address ? work.address: "-"}
                </p>
              </div>
                
            </div>

            <div className="flex items-start gap-3 px-4 py-3">
              <div className="w-9 h-9 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-center flex-shrink-0">
                <MapPin className="w-4 h-4 text-rose-600" />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Bairro</p>
                <p className="text-sm font-semibold text-slate-900 mt-0.5 break-words whitespace-normal">
                  {work.bairro?.name ? work.bairro?.name: "-"}
                </p>
              </div>
               
            </div>
            {showMore && (
              <>
                <div className="flex items-start gap-3 px-4 py-3">
                  <div className="w-9 h-9 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-center flex-shrink-0">
                    <Layers className="w-4 h-4 text-fuchsia-600" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Área</p>
                    <p className="text-sm font-semibold text-slate-900 mt-0.5 break-words whitespace-normal">{work.work_area?.name || '—'}</p>
                  </div>
                </div>
              </>
            )}
            <div className="flex items-start gap-3 px-4 py-3">
              <div className="w-9 h-9 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-center flex-shrink-0">
                <Building className="w-4 h-4 text-amber-600" />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Empresa</p>
                <p className="text-sm font-semibold text-slate-900 mt-0.5 break-words whitespace-normal">{work.contractor?.name || '—'}</p>
              </div>
            </div>
            <div className="flex items-start gap-3 px-4 py-3">
              <div className="w-9 h-9 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-center flex-shrink-0">
                <FileText className="w-4 h-4 text-sky-600" />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">CNPJ</p>
                <p className="text-sm font-semibold text-slate-900 mt-0.5 break-words whitespace-normal">{work.contractor?.cnpj ? formatCnpj(work.contractor.cnpj) : '—'}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-4 py-3 bg-slate-50 border-b border-slate-100 flex items-center gap-2">
            <DollarSign className="w-4 h-4 text-emerald-600" />
            <span className="text-[10px] font-black text-slate-600 uppercase tracking-widest">Financeiro</span>
          </div>
          <div className="divide-y divide-slate-100">
            <div className="flex items-start gap-3 px-4 py-3">
              <div className="w-9 h-9 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-center flex-shrink-0">
                <Calendar className="w-4 h-4 text-amber-600" />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Início</p>
                <p className="text-sm font-semibold text-slate-900 mt-0.5">{work.start_date ? formatDate(work.start_date) : '—'}</p>
              </div>
            </div>
            <div className="flex items-start gap-3 px-4 py-3">
              <div className="w-9 h-9 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-center flex-shrink-0">
                <Calendar className="w-4 h-4 text-amber-600" />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Previsão de término</p>
                <p className="text-sm font-semibold text-slate-900 mt-0.5">{work.end_date_forecast ? formatDate(work.end_date_forecast) : work.expected_end_date ? formatDate(work.expected_end_date) : '—'}</p>
              </div>
            </div>
            <div className="flex items-start gap-3 px-4 py-3">
              <div className="w-9 h-9 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-center flex-shrink-0">
                <DollarSign className="w-4 h-4 text-rose-600" />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Valor total</p>
                <p className="text-sm font-black text-rose-700 mt-0.5">{work.total_value ? formatCurrency(work.total_value) : '—'}</p>
              </div>
            </div>
            <div className="flex items-start gap-3 px-4 py-3">
              <div className="w-9 h-9 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-center flex-shrink-0">
                <CreditCard className="w-4 h-4 text-emerald-600" />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Total pago</p>
                <p className="text-sm font-black text-emerald-700 mt-0.5">{spentValue > 0 ? formatCurrency(spentValue) : 'R$ 0,00'}</p>
              </div>
            </div>
            <div className="flex items-start gap-3 px-4 py-3">
              <div className="w-9 h-9 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-center flex-shrink-0">
                <TrendingUp className="w-4 h-4 text-blue-600" />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Execução</p>
                <p className="text-sm font-semibold text-slate-900 mt-0.5">{work.total_value ? `${spentPct.toFixed(1)}%` : '—'}</p>
              </div>
            </div>
            {showMore && (
              <>
                {Array.isArray(work.funding_source) && work.funding_source.length > 0 && (
                  <div className="flex items-start gap-3 px-4 py-3">
                    <div className="w-9 h-9 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-center flex-shrink-0">
                      <FileText className="w-4 h-4 text-slate-600" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Fonte de recursos</p>
                      <p className="text-sm font-semibold text-slate-900 mt-0.5 break-words whitespace-normal">{work.funding_source.map(fundingLabel).join(', ')}</p>
                    </div>
                  </div>
                )}
                {work.parliamentary_amendment?.has && (
                  <div className="flex items-start gap-3 px-4 py-3">
                    <div className="w-9 h-9 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-center flex-shrink-0">
                      <User className="w-4 h-4 text-slate-600" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Emenda parlamentar</p>
                      <p className="text-sm font-semibold text-slate-900 mt-0.5 break-words whitespace-normal">{work.parliamentary_amendment.author || '—'}</p>
                    </div>
                  </div>
                )}
                <div className="flex items-start gap-3 px-4 py-3">
                  <div className="w-9 h-9 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-center flex-shrink-0">
                    <Calendar className="w-4 h-4 text-amber-600" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Prazo contratual (dias)</p>
                    <p className="text-sm font-semibold text-slate-900 mt-0.5">{work.execution_period_days ? String(work.execution_period_days) : '—'}</p>
                  </div>
                </div>
                <div className="flex items-start gap-3 px-4 py-3">
                  <div className="w-9 h-9 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-center flex-shrink-0">
                    <Calendar className="w-4 h-4 text-amber-600" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Assinatura do contrato</p>
                    <p className="text-sm font-semibold text-slate-900 mt-0.5">{work.contract_signature_date ? formatDate(work.contract_signature_date) : '—'}</p>
                  </div>
                </div>
                <div className="flex items-start gap-3 px-4 py-3">
                  <div className="w-9 h-9 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-center flex-shrink-0">
                    <Calendar className="w-4 h-4 text-amber-600" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Ordem de serviço</p>
                    <p className="text-sm font-semibold text-slate-900 mt-0.5">{work.service_order_date ? formatDate(work.service_order_date) : '—'}</p>
                  </div>
                </div>
                <div className="flex items-start gap-3 px-4 py-3">
                  <div className="w-9 h-9 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-center flex-shrink-0">
                    <AlertTriangle className="w-4 h-4 text-amber-700" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Data de paralisação</p>
                    <p className="text-sm font-semibold text-slate-900 mt-0.5">{work.stalled_date ? formatDate(work.stalled_date) : '—'}</p>
                  </div>
                </div>
                <div className="flex items-start gap-3 px-4 py-3">
                  <div className="w-9 h-9 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-center flex-shrink-0">
                    <CheckCircle className="w-4 h-4 text-emerald-600" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Data de inauguração</p>
                    <p className="text-sm font-semibold text-slate-900 mt-0.5">{work.inauguration_date ? formatDate(work.inauguration_date) : '—'}</p>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        <div className="flex">
          <Button type="button" variant="outline" className="w-full border-slate-200 bg-white h-10" onClick={() => setShowMore(v => !v)}>
            {showMore ? 'Mostrar menos detalhes' : 'Mostrar mais detalhes'}
          </Button>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-4 py-3 bg-slate-50 border-b border-slate-100 flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-orange-600" />
            <span className="text-[10px] font-black text-slate-600 uppercase tracking-widest">Descrição</span>
          </div>
          <div className="p-4">
            {work.long_description || work.description ? (
              <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap break-words">
                {work.long_description || work.description}
              </p>
            ) : (
              <p className="text-sm text-slate-400 italic">Nenhuma descrição disponível.</p>
            )}
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-4 py-3 bg-slate-50 border-b border-slate-100 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-blue-600" />
            <span className="text-[10px] font-black text-slate-600 uppercase tracking-widest">Andamento da obra</span>
          </div>
          <div className="p-4 space-y-4">
            <div>
              <div className="flex items-baseline justify-between gap-3">
                <p className="text-sm font-bold text-slate-800">{computedExecutionPct || 0}% Concluído</p>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Execução</p>
              </div>
              <div className="h-3 bg-slate-100 rounded-full overflow-hidden mt-3 flex">
                {segments.map(s => (
                  <div key={s.id} className={`${s.color} h-full`} style={{ width: `${s.width}%` }} />
                ))}
                {computedExecutionPct < 100 && (
                  <div className="bg-slate-200 h-full" style={{ width: `${100 - Math.max(0, Math.min(100, computedExecutionPct))}%` }} />
                )}
              </div>
              <div className="flex justify-between text-[10px] text-slate-400 mt-2 font-bold">
                <span>0%</span><span>25%</span><span>50%</span><span>75%</span><span>100%</span>
              </div>
            </div>

            {segments.length > 0 ? (
              <div className="space-y-2">
                {segments.slice(0, 4).map((s) => {
                  const si = getStatusInfo(s.status);
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => onOpenPhase && onOpenPhase(s.id)}
                      className="w-full text-left rounded-xl border border-slate-200 bg-white hover:bg-slate-50/50 transition-colors p-3"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <span className={`inline-flex items-center gap-2 text-[10px] font-bold px-2 py-0.5 rounded-full ${si.bg} ${si.color}`}>
                              <span className={`w-2 h-2 rounded-full ${s.color}`} /> {si.text}
                            </span>
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
                              {s.start}% → {s.end}%
                            </span>
                          </div>
                          <p className="text-sm font-semibold text-slate-800 break-words whitespace-normal">{s.title}</p>
                        </div>
                        <ChevronRight className="w-4 h-4 text-slate-400 flex-shrink-0 mt-1" />
                      </div>
                    </button>
                  );
                })}
                {segments.length > 4 && (
                  <p className="text-xs text-slate-400">Mostrando 4 de {segments.length} etapas.</p>
                )}
              </div>
            ) : (
              <p className="text-sm text-slate-400 italic">Nenhuma etapa registrada.</p>
            )}
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-4 py-3 bg-slate-50 border-b border-slate-100 flex items-center gap-2">
            <Calendar className="w-4 h-4 text-amber-600" />
            <span className="text-[10px] font-black text-slate-600 uppercase tracking-widest">Cronograma</span>
          </div>
          <div className="p-4 space-y-4">
            <div className="space-y-2">
              <div className="flex justify-between items-center text-sm gap-4">
                <span className="text-slate-500">Início:</span>
                <span className="font-bold text-slate-800">{work.start_date ? formatDate(work.start_date) : '—'}</span>
              </div>
              <div className="flex justify-between items-center text-sm gap-4">
                <span className="text-slate-500">Previsão:</span>
                <span className="font-bold text-slate-800">{work.end_date_forecast ? formatDate(work.end_date_forecast) : work.expected_end_date ? formatDate(work.expected_end_date) : '—'}</span>
              </div>
            </div>

            <div className="space-y-2">
              {schedule.daysElapsed !== null && (
                <div className="bg-amber-100/50 text-amber-800 px-4 py-2 rounded-lg flex items-center justify-between text-sm font-medium border border-amber-100">
                  <span>Decorrido</span>
                  <span className="font-bold">{schedule.daysElapsed} dias</span>
                </div>
              )}
              {schedule.daysRemaining !== null && (
                <div className="bg-blue-100/50 text-blue-800 px-4 py-2 rounded-lg flex items-center justify-between text-sm font-medium border border-blue-100">
                  <span>Restante</span>
                  <span className="font-bold">{schedule.daysRemaining} dias</span>
                </div>
              )}
            </div>

            <div className="pt-2 border-t border-slate-100">
              <div className="relative h-8 flex items-center">
                <div className="absolute left-0 right-0 top-1/2 h-0.5 bg-slate-200 -translate-y-1/2 rounded-full" />
                <div className="absolute left-0 top-1/2 -translate-y-1/2 w-3 h-3 bg-slate-400 rounded-full border-2 border-white shadow-sm" />
                <span className="absolute left-0 top-6 text-[10px] text-slate-400 -translate-x-1/2">Início</span>

                {schedule.timePct > 0 && schedule.timePct < 100 && (
                  <>
                    <div className="absolute top-1/2 -translate-y-1/2 w-4 h-4 bg-blue-500 rounded-full border-2 border-white shadow-md z-10" style={{ left: `${schedule.timePct}%` }} />
                    <span className="absolute top-[-20px] text-[10px] font-bold text-blue-600 -translate-x-1/2 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-100" style={{ left: `${schedule.timePct}%` }}>Hoje</span>
                  </>
                )}

                <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 bg-slate-400 rounded-full border-2 border-white shadow-sm" />
                <span className="absolute right-0 top-6 text-[10px] text-slate-400 translate-x-1/2">Fim</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="hidden lg:block space-y-8">
      {/* Seção 1: Informações da Obra */}
      <div>
        <h3 className="text-lg font-bold text-slate-800 mb-4">Informações da Obra</h3>
        <div className="grid grid-cols-1 md:grid-cols-1 gap-6">
          {/* Coluna Esquerda: Detalhes */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <PanelHeader icon={FileText}>Detalhes da obra</PanelHeader>
            <div className="p-0">
              <div className="px-5 py-4 space-y-4">
                <div className="space-y-2">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Identificação</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <InfoRow icon={FileText} label="Categoria" value={work.work_category?.name} />
                    <InfoRow icon={Activity} label="Status" value={getStatusInfo(work.status).text} />
                    {showMore && (
                      <>
                        <InfoRow icon={Award} label="Área" value={work.work_area?.name || '—'} />
                      </>
                    )}
                  </div>
                </div>

                <div className="border-t border-slate-100 pt-4 space-y-2">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Localização</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <InfoRow icon={MapPin} label="Bairro" value={work.bairro?.name} />
                    <InfoRow icon={MapPin} label="Endereço" value={work.address || '—'} />
                  </div>
                </div>

                <div className="border-t border-slate-100 pt-4 space-y-2">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Construtora</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <InfoRow icon={Building} label="Nome" value={work.contractor?.name || '—'} />
                    <InfoRow icon={Building} label="CNPJ" value={work.contractor?.cnpj ? formatCnpj(work.contractor.cnpj) : '—'} />
                  </div>
                </div>

                <div className="border-t border-slate-100 pt-4 space-y-2">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Prazos</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <InfoRow icon={Calendar} label="Início do início" value={work.start_date ? formatDate(work.start_date) : '—'} />
                    <InfoRow icon={Calendar} label="Data de entrega" value={work.end_date_forecast ? formatDate(work.end_date_forecast) : work.expected_end_date ? formatDate(work.expected_end_date) : '—'} />
                    {showMore && (
                      <>
                        <InfoRow icon={Calendar} label="Prazo contratual (dias)" value={work.execution_period_days ? String(work.execution_period_days) : '—'} />
                        <InfoRow icon={Calendar} label="Assinatura do contrato" value={work.contract_signature_date ? formatDate(work.contract_signature_date) : '—'} />
                        <InfoRow icon={Calendar} label="Ordem de serviço" value={work.service_order_date ? formatDate(work.service_order_date) : '—'} />
                        <InfoRow icon={AlertTriangle} label="Data de paralisação" value={work.stalled_date ? formatDate(work.stalled_date) : '—'} />
                        <InfoRow icon={CheckCircle} label="Data de inauguração" value={work.inauguration_date ? formatDate(work.inauguration_date) : '—'} />
                      </>
                    )}
                  </div>
                </div>

                <div className="border-t border-slate-100 pt-4 space-y-2">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Financeiro</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <InfoRow icon={DollarSign} label="Projeto Total" value={work.total_value ? formatCurrency(work.total_value) : '—'} />
                    <InfoRow icon={CreditCard} label="Total pago" value={spentValue > 0 ? formatCurrency(spentValue) : 'R$ 0,00'} accent />
                    <InfoRow icon={TrendingUp} label="Execução financeira" value={work.total_value ? `${spentPct.toFixed(1)}%` : '—'} />
                    {showMore && (
                      <>
                        {Array.isArray(work.funding_source) && work.funding_source.length > 0 && (
                          <InfoRow icon={FileText} label="Fonte de recursos" value={work.funding_source.map(fundingLabel).join(', ')} />
                        )}
                        {work.parliamentary_amendment?.has && (
                          <InfoRow icon={User} label="Emenda Parlamentar" value={work.parliamentary_amendment.author || '—'} />
                        )}
                      </>
                    )}
                  </div>
                </div>
              </div>
              <div className="px-5 pb-4">
                <Button type="button" variant="outline" className="border-slate-200 bg-white h-9" onClick={() => setShowMore(v => !v)}>
                  {showMore ? 'Mostrar menos' : 'Mostrar mais detalhes'}
                </Button>
              </div>
            </div>
          </div>

          {/* Coluna Direita: Descrição */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col h-full">
            <PanelHeader icon={BookOpen}>Descrição</PanelHeader>
            <div className="p-6 flex-grow">
              {work.long_description || work.description ? (
                <p className="text-sm text-slate-600 leading-relaxed whitespace-pre-wrap">
                  {work.long_description || work.description}
                </p>
              ) : (
                <p className="text-sm text-slate-400 italic">Nenhuma descrição disponível.</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Seção 2: Andamento da Obra */}
      <div>
        <h3 className="text-lg font-bold text-slate-800 mb-4">Andamento da Obra</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-5 border-b border-slate-100">
              <h4 className="font-bold text-slate-800">{computedExecutionPct || 0}% Concluído</h4>
              <div className="h-3 bg-slate-100 rounded-full overflow-hidden mt-3 flex">
                {segments.map(s => (
                  <div key={s.id} className={`${s.color} h-full`} style={{ width: `${s.width}%` }} />
                ))}
                {computedExecutionPct < 100 && (
                  <div className="bg-slate-200 h-full" style={{ width: `${100 - Math.max(0, Math.min(100, computedExecutionPct))}%` }} />
                )}
              </div>
              <div className="flex justify-between text-[10px] text-slate-400 mt-2 font-bold">
                <span>0%</span><span>25%</span><span>50%</span><span>75%</span><span>100%</span>
              </div>
            </div>

            <div className="p-5 space-y-4">
              {segments.length > 0 ? (
                <div className="space-y-3">
                  {segments.map((s) => {
                    const si = getStatusInfo(s.status);
                    return (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => onOpenPhase && onOpenPhase(s.id)}
                        className="w-full text-left rounded-xl border border-slate-200 bg-white hover:bg-slate-50/50 transition-colors p-3"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap mb-1">
                              <span className={`inline-flex items-center gap-2 text-[10px] font-bold px-2 py-0.5 rounded-full ${si.bg} ${si.color}`}>
                                <span className={`w-2 h-2 rounded-full ${s.color}`} /> {si.text}
                              </span>
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
                                {s.start}% → {s.end}%
                              </span>
                            </div>
                            <p className="text-sm font-semibold text-slate-800 break-words whitespace-normal">{s.title}</p>
                            {s.contractorName && <p className="text-xs text-slate-500 mt-0.5 break-words whitespace-normal">{s.contractorName}</p>}
                          </div>
                          <ChevronRight className="w-4 h-4 text-slate-400 flex-shrink-0 mt-1" />
                        </div>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <p className="text-sm text-slate-400 italic">Nenhuma etapa registrada.</p>
              )}
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden h-fit">
            <PanelHeader icon={Calendar}>Cronograma</PanelHeader>
            <div className="p-6 space-y-6">
              <div className="space-y-3">
                <div className="flex justify-between items-center text-sm gap-4">
                  <span className="text-slate-500">Início Inicial:</span>
                  <span className="font-bold text-slate-800">{work.start_date ? formatDate(work.start_date) : '—'}</span>
                </div>
                <div className="flex justify-between items-center text-sm gap-4">
                  <span className="text-slate-500">Previsão Estimada:</span>
                  <span className="font-bold text-slate-800">{work.end_date_forecast ? formatDate(work.end_date_forecast) : work.expected_end_date ? formatDate(work.expected_end_date) : '—'}</span>
                </div>
              </div>

              <div className="space-y-3 pt-2">
                {schedule.daysElapsed !== null && (
                  <div className="bg-amber-100/50 text-amber-800 px-4 py-2 rounded-lg flex items-center justify-between text-sm font-medium border border-amber-100">
                    <span>Tempo Decorrido</span>
                    <span className="font-bold">{schedule.daysElapsed} dias</span>
                  </div>
                )}
                {schedule.daysRemaining !== null && (
                  <div className="bg-blue-100/50 text-blue-800 px-4 py-2 rounded-lg flex items-center justify-between text-sm font-medium border border-blue-100">
                    <span>Tempo Restante</span>
                    <span className="font-bold">{schedule.daysRemaining} dias</span>
                  </div>
                )}
              </div>

              <div className="pt-4 mt-2 border-t border-slate-100">
                <div className="relative h-8 flex items-center">
                  <div className="absolute left-0 right-0 top-1/2 h-0.5 bg-slate-200 -translate-y-1/2 rounded-full" />
                  <div className="absolute left-0 top-1/2 -translate-y-1/2 w-3 h-3 bg-slate-400 rounded-full border-2 border-white shadow-sm" />
                  <span className="absolute left-0 top-6 text-[10px] text-slate-400 -translate-x-1/2">Início</span>

                  {schedule.timePct > 0 && schedule.timePct < 100 && (
                    <>
                      <div className="absolute top-1/2 -translate-y-1/2 w-4 h-4 bg-blue-500 rounded-full border-2 border-white shadow-md z-10" style={{ left: `${schedule.timePct}%` }} />
                      <div className="absolute top-0 bottom-4 w-px bg-blue-500/50" style={{ left: `${schedule.timePct}%`, height: '16px', top: '-8px' }} />
                      <span className="absolute top-[-20px] text-[10px] font-bold text-blue-600 -translate-x-1/2 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-100" style={{ left: `${schedule.timePct}%` }}>Hoje</span>
                    </>
                  )}

                  <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 bg-slate-400 rounded-full border-2 border-white shadow-sm" />
                  <span className="absolute right-0 top-6 text-[10px] text-slate-400 translate-x-1/2">Fim</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      </div>
    </div>
  );
};

// ─── TAB: Etapas ─────────────────────────────────────────────────────────────
const TabPhases = ({
  measurements,
  media,
  viewableMedia,
  openViewer,
  selectedPhaseId,
  onSelectPhase,
  onBack,
  onOpenPaymentsForPhase
}) => {
  const [statusFilter, setStatusFilter] = useState('Todas');

  const phasesSorted = useMemo(() => {
    const key = (m) => (m?.start_date || m?.predicted_start_date || m?.created_at || '');
    return [...(measurements || [])].sort((a, b) => key(a).localeCompare(key(b)));
  }, [measurements]);

  const statusOptions = useMemo(() => {
    const set = new Set();
    for (const m of measurements || []) {
      if (!m) continue;
      set.add(getStatusInfo(m.status).text);
    }
    return ['Todas', ...Array.from(set)];
  }, [measurements]);

  const filteredPhases = useMemo(() => {
    if (!Array.isArray(phasesSorted) || phasesSorted.length === 0) return [];
    if (!statusFilter || statusFilter === 'Todas') return phasesSorted;
    return phasesSorted.filter((m) => getStatusInfo(m.status).text === statusFilter);
  }, [phasesSorted, statusFilter]);

  const phaseIndexMap = useMemo(() => {
    const map = new Map();
    phasesSorted.forEach((m, idx) => map.set(m.id, idx));
    return map;
  }, [phasesSorted]);

  if (measurements.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-dashed border-slate-200 py-20 text-center">
        <Layers className="w-10 h-10 text-slate-200 mx-auto mb-3" />
        <p className="text-slate-400 text-sm font-medium">Nenhuma etapa registrada.</p>
      </div>
    );
  }
  const total = measurements.length;
  const completed = measurements.filter(m => m.status === 'completed').length;
  const inProgress = measurements.filter(m => m.status === 'in-progress').length;
  const stalled = measurements.filter(m => m.status === 'stalled').length;
  const totalPaidAll = measurements.reduce((acc, m) => acc + (m.payments || []).reduce((pa, p) => pa + (Number(p.value) || 0), 0), 0);
  const overallExecution = measurements.reduce((max, m) => {
    const n = Number(m.execution_percentage);
    return Number.isFinite(n) ? Math.max(max, n) : max;
  }, 0);
  const avgExecution = (() => {
    let sum = 0;
    let count = 0;
    for (const m of measurements) {
      const n = Number(m.execution_percentage);
      if (Number.isFinite(n)) {
        sum += n;
        count += 1;
      }
    }
    return count > 0 ? (sum / count) : 0;
  })();

  const phase = selectedPhaseId ? measurements.find(m => m.id === selectedPhaseId) : null;

  if (selectedPhaseId && phase) {
    const idx = measurements.findIndex(m => m.id === phase.id);
    const si = getStatusInfo(phase.status);
    const phaseMedia = viewableMedia.filter(m => m.measurement_id === phase.id);
    const phaseDocs = media.filter(m => m.measurement_id === phase.id && ['pdf','document','file'].includes(m.type));
    const payments = [...(phase.payments || [])].sort((a, b) => new Date(b.payment_date) - new Date(a.payment_date));
    const totalPaid = payments.reduce((acc, p) => acc + (Number(p.value) || 0), 0);
    const paidPct = phase.value ? Math.min((totalPaid / phase.value) * 100, 100) : 0;
    const lastPay = payments[0];
    const fundingLabel = (src) => {
      const map = { federal: 'Federal', estadual: 'Estadual', municipal: 'Municipal', state: 'Estadual' };
      return map[src] || src;
    };
    const getSortKey = (m) => (m?.start_date || m?.predicted_start_date || m?.created_at || '');
    const sorted = [...measurements].sort((a, b) => getSortKey(a).localeCompare(getSortKey(b)));
    const sortedIdx = sorted.findIndex(m => m.id === phase.id);
    const prevEnd = sortedIdx > 0
      ? sorted.slice(0, sortedIdx).reduce((max, m) => {
        const n = Number(m.execution_percentage);
        return Number.isFinite(n) ? Math.max(max, n) : max;
      }, 0)
      : 0;
    const phaseEnd = Number.isFinite(Number(phase.execution_percentage)) ? Math.max(0, Math.min(100, Number(phase.execution_percentage))) : null;
    const phaseStart = Number.isFinite(prevEnd) ? Math.max(0, Math.min(100, prevEnd)) : 0;
    const intervalText = phaseEnd !== null ? `${phaseStart}% → ${phaseEnd}%` : `${phaseStart}% → —`;

    return (
      <div className="space-y-4 pb-24 sm:pb-0">
        <div className="hidden sm:flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-3">
          <Button type="button" variant="outline" className="border-slate-200 bg-white w-full sm:w-auto" onClick={onBack}>
            <ArrowLeft className="w-4 h-4 mr-2" /> Voltar ao panorama
          </Button>
          <Button type="button" size="sm" className="bg-red-600 hover:bg-red-700 text-white w-full sm:w-auto" onClick={() => onOpenPaymentsForPhase && onOpenPaymentsForPhase(phase.id)}>
            <CreditCard className="w-4 h-4 mr-2" /> Ver pagamentos desta etapa
          </Button>
        </div>

        <div className="sm:hidden fixed inset-x-0 bottom-[calc(4rem+var(--safe-area-bottom,0px))] z-30 px-4 pointer-events-none">
          <div className="max-w-7xl mx-auto pointer-events-auto">
            <div className="bg-white/95 backdrop-blur rounded-2xl border border-slate-200 shadow-lg p-2 flex gap-2">
              <Button type="button" variant="outline" className="border-slate-200 bg-white flex-1" onClick={onBack}>
                <ArrowLeft className="w-4 h-4 mr-2" /> Voltar
              </Button>
              <Button type="button" className="bg-red-600 hover:bg-red-700 text-white flex-1" onClick={() => onOpenPaymentsForPhase && onOpenPaymentsForPhase(phase.id)}>
                <CreditCard className="w-4 h-4 mr-2" /> Pagamentos
              </Button>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
          <div className="p-4 sm:p-5 border-b border-slate-100">
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1.5">
                  <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full ${si.bg} ${si.color}`}>{si.text}</span>
                  <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">Fase {String(idx + 1).padStart(2, '0')}</span>
                  <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-100">Intervalo: {intervalText}</span>
                </div>
                <h4 className="font-bold text-lg text-slate-900 break-words whitespace-normal">{phase.title}</h4>
              </div>
              {phaseEnd !== null && (
                <div className="text-left sm:text-right flex-shrink-0">
                  <p className="text-2xl font-black text-slate-900">{phaseEnd}%</p>
                  <p className="text-[10px] text-slate-400 uppercase tracking-wide">executado</p>
                </div>
              )}
            </div>
          </div>

          <div className="p-4 sm:p-5 space-y-4">
            {phase.description && (
              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                <PanelHeader icon={BookOpen}>Descrição da Fase</PanelHeader>
                <div className="p-4">
                  <p className="text-sm text-slate-600 leading-relaxed break-words whitespace-normal whitespace-pre-wrap">{phase.description}</p>
                </div>
              </div>
            )}

            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <PanelHeader icon={FileText}>Dados do Contrato</PanelHeader>
              <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <InfoRow icon={Building} label="Empresa responsável" value={phase.contractor?.name || '—'} />
                  <InfoRow icon={Building} label="CNPJ" value={phase.contractor?.cnpj ? formatCnpj(phase.contractor.cnpj) : '—'} />
                  {Array.isArray(phase.funding_source) && phase.funding_source.length > 0 && (
                    <InfoRow icon={FileText} label="Fonte de recursos" value={phase.funding_source.map(fundingLabel).join(', ')} />
                  )}
                </div>
                <div className="space-y-2">
                  <InfoRow icon={DollarSign} label="Valor do contrato" value={phase.value != null ? formatCurrency(phase.value) : '—'} accent />
                  <InfoRow icon={DollarSign} label="Valor previsto" value={phase.expected_value != null ? formatCurrency(phase.expected_value) : '—'} />
                  <InfoRow icon={CreditCard} label="Valor pago (lançamentos)" value={formatCurrency(totalPaid) || 'R$ 0,00'} />
                  <InfoRow icon={CreditCard} label="Valor pago (informado)" value={phase.amount_spent != null ? formatCurrency(phase.amount_spent) : '—'} />
                </div>
              </div>
              {phase.value ? (
                <div className="px-4 pb-4">
                  <div className="bg-slate-50 rounded-xl border border-slate-200 p-4">
                    <div className="flex justify-between text-xs">
                      <span className="text-slate-500">Execução financeira</span>
                      <span className="font-bold text-slate-700">{paidPct.toFixed(1)}%</span>
                    </div>
                    <div className="h-2 bg-slate-200 rounded-full overflow-hidden mt-2">
                      <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${paidPct}%` }} />
                    </div>
                    <div className="flex flex-wrap gap-x-6 gap-y-1 text-[11px] text-slate-500 mt-2">
                      <span>Contrato: <span className="font-semibold text-slate-700">{formatCurrency(phase.value)}</span></span>
                      <span>Pago: <span className="font-semibold text-emerald-700">{formatCurrency(totalPaid) || 'R$ 0,00'}</span></span>
                      {lastPay?.payment_date && <span>Último pagamento: <span className="font-semibold text-slate-700">{formatDate(lastPay.payment_date)}</span></span>}
                    </div>
                  </div>
                </div>
              ) : null}
            </div>

            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <PanelHeader icon={TrendingUp}>Execução</PanelHeader>
              <div className="p-4 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Intervalo</p>
                    <p className="text-sm font-black text-slate-800 mt-1">{intervalText}</p>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Status</p>
                    <p className="text-sm font-black text-slate-800 mt-1">{si.text}</p>
                  </div>
                </div>
                {phaseEnd !== null && (
                  <div>
                    <div className="flex justify-between text-xs mb-2">
                      <span className="text-slate-500">Execução física</span>
                      <span className="font-bold text-slate-700">{phaseEnd}%</span>
                    </div>
                    <div className="h-3 bg-slate-100 rounded-full overflow-hidden flex">
                      <div className="bg-blue-500 h-full" style={{ width: `${Math.max(0, Math.min(100, phaseStart))}%` }} />
                      <div className="bg-amber-400 h-full" style={{ width: `${Math.max(0, Math.min(100, (phaseEnd ?? phaseStart) - phaseStart))}%` }} />
                      <div className="bg-slate-200 h-full flex-1" />
                    </div>
                    <div className="flex justify-between text-[10px] text-slate-400 mt-2 font-bold">
                      <span>0%</span><span>25%</span><span>50%</span><span>75%</span><span>100%</span>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <PanelHeader icon={Calendar}>Cronograma e Prazos</PanelHeader>
              <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <InfoRow icon={Calendar} label="Assinatura do contrato" value={phase.contract_signature_date ? formatDate(phase.contract_signature_date) : '—'} />
                  <InfoRow icon={Calendar} label="Ordem de serviço" value={phase.service_order_date ? formatDate(phase.service_order_date) : '—'} />
                  <InfoRow icon={Calendar} label="Previsão início" value={phase.predicted_start_date ? formatDate(phase.predicted_start_date) : '—'} />
                  <InfoRow icon={Calendar} label="Previsão conclusão" value={phase.expected_end_date ? formatDate(phase.expected_end_date) : '—'} />
                </div>
                <div className="space-y-2">
                  <InfoRow icon={Calendar} label="Início real" value={phase.start_date ? formatDate(phase.start_date) : '—'} />
                  <InfoRow icon={Calendar} label="Término/Encerramento" value={phase.end_date ? formatDate(phase.end_date) : '—'} />
                  <InfoRow icon={AlertTriangle} label="Data de paralisação" value={phase.stalled_date ? formatDate(phase.stalled_date) : '—'} />
                  <InfoRow icon={CheckCircle} label="Inauguração" value={phase.inauguration_date ? formatDate(phase.inauguration_date) : '—'} />
                  <InfoRow icon={Calendar} label="Prazo (dias)" value={phase.execution_period_days ? String(phase.execution_period_days) : '—'} />
                </div>
              </div>
            </div>
{/* 
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <PanelHeader icon={CreditCard}>Pagamentos</PanelHeader>
              <div className="p-4">
                {payments.length === 0 ? (
                  <p className="text-sm text-slate-500">Nenhum pagamento registrado nesta etapa.</p>
                ) : (
                  <div className="overflow-x-auto rounded-xl border border-slate-200">
                    <table className="min-w-full text-sm bg-white">
                      <thead className="bg-slate-100 border-b border-slate-200">
                        <tr>
                          <th className="text-left px-4 py-2.5 font-bold text-slate-400 uppercase tracking-wide text-[9px]">Data</th>
                          <th className="text-left px-4 py-2.5 font-bold text-slate-400 uppercase tracking-wide text-[9px]">OB/Empenho</th>
                          <th className="text-left px-4 py-2.5 font-bold text-slate-400 uppercase tracking-wide text-[9px]">Valor</th>
                          <th className="text-left px-4 py-2.5 font-bold text-slate-400 uppercase tracking-wide text-[9px]">Portal</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {payments.slice(0, 10).map((p) => (
                          <tr key={p.id} className="hover:bg-slate-50/50 transition-colors">
                            <td className="px-4 py-3 text-slate-600 break-words whitespace-normal">{p.payment_date ? formatDate(p.payment_date) : '—'}</td>
                            <td className="px-4 py-3 text-slate-600 break-words whitespace-normal">{p.banking_order || '—'}</td>
                            <td className="px-4 py-3 font-bold text-blue-700 break-words whitespace-normal">{formatCurrency(p.value)}</td>
                            <td className="px-4 py-3 text-slate-600 break-words whitespace-normal">
                              {p.portal_link ? (
                                <a href={p.portal_link} target="_blank" rel="noopener noreferrer" className="text-emerald-700 hover:text-emerald-800 underline break-words whitespace-normal inline-flex items-center gap-2">
                                  <Link2 className="w-4 h-4 flex-shrink-0" />
                                  <span>{p.portal_link}</span>
                                </a>
                              ) : (
                                <span className="text-slate-300">—</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="bg-slate-50 border-t border-slate-200">
                          <td colSpan={2} className="px-4 py-2.5 text-[9px] font-bold text-slate-400 uppercase tracking-wide">
                            Subtotal — {payments.length} pagamento(s)
                          </td>
                          <td className="px-4 py-2.5">
                            <span className="text-sm font-black text-emerald-700">{formatCurrency(totalPaid) || 'R$ 0,00'}</span>
                          </td>
                          <td />
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
                {payments.length > 10 && (
                  <p className="text-xs text-slate-500 mt-2">Mostrando 10 de {payments.length} pagamentos.</p>
                )}
              </div>
            </div> */}

            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <PanelHeader icon={ImageIcon}>Galeria de Fotos e Vídeos</PanelHeader>
              <div className="p-4">
                {phaseMedia.length === 0 ? (
                  <p className="text-sm text-slate-500">Nenhuma mídia registrada para esta fase.</p>
                ) : (
                  <div className="flex gap-2 overflow-x-auto pb-1">
                    {phaseMedia.map((m, mediaIdx) => (
                      <button key={m.id} onClick={() => openViewer(phaseMedia, mediaIdx)}
                        className="flex-shrink-0 w-20 h-20 rounded-xl overflow-hidden border border-slate-200 hover:border-red-400 hover:shadow-sm transition-all bg-slate-100">
                        {['video', 'video_url'].includes(m.type)
                          ? <div className="w-full h-full flex items-center justify-center bg-slate-800"><Video className="w-6 h-6 text-white/60" /></div>
                          : <img src={m.url} alt="" className="w-full h-full object-cover" />}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <PanelHeader icon={FileText}>Documentos Anexados</PanelHeader>
              <div className="p-4">
                {phaseDocs.length === 0 ? (
                  <p className="text-sm text-slate-500">Nenhum documento anexado.</p>
                ) : (
                  <div className="space-y-2">
                    {phaseDocs.map(doc => (
                      <a key={doc.id} href={doc.url} target="_blank" rel="noopener noreferrer"
                        className="flex items-start gap-2.5 p-3 rounded-xl bg-white hover:bg-red-50 border border-slate-200 hover:border-red-200 transition-all group text-sm">
                        <FileText className="w-4 h-4 text-sky-600 group-hover:text-red-500 flex-shrink-0 mt-0.5" />
                        <span className="break-words whitespace-normal font-medium text-slate-700 group-hover:text-red-700">{doc.name || 'Documento'}</span>
                        <ArrowUpRight className="w-3.5 h-3.5 text-slate-300 group-hover:text-red-400 ml-auto flex-shrink-0 mt-0.5" />
                      </a>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="lg:hidden space-y-3 ">
        {/* <div className="grid grid-cols-3 rounded-2xl border border-slate-200 px-2 bg-white">
          <div className=" bg-white p-3">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Etapas</p>
            <p className="text-[16px] font-black text-slate-900 mt-1">{total}</p>
          </div>
          <div className=" bg-white p-3">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Total pago</p>
            <p className="text-[16px] font-black text-emerald-700 mt-1 break-words whitespace-normal">{totalPaidAll > 0 ? formatCurrency(totalPaidAll) : 'R$ 0,00'}</p>
          </div>
          <div className=" bg-white p-3">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Execução</p>
            <p className="text-[16px] font-black text-blue-700 mt-1">{overallExecution.toFixed(0)}%</p>
          </div>
        </div> */}

        {/* <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/60 flex items-center justify-between gap-3">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Panorama</p>
            <p className="text-xs text-slate-500">{filteredPhases.length} etapa{filteredPhases.length === 1 ? '' : 's'}</p>
          </div>
          <div className="p-3">
            <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
              {statusOptions.map((opt) => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => setStatusFilter(opt)}
                  className={`whitespace-nowrap px-3 py-1.5 rounded-full text-xs font-bold border transition-colors ${
                    statusFilter === opt
                      ? 'bg-red-500 text-white border-red-500'
                      : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  {opt}
                </button>
              ))}
            </div>
          </div>
        </div> */}

        <div className="space-y-3">
          {filteredPhases.map((item, idx) => {
            const si = getStatusInfo(item.status);
            const payments = item.payments || [];
            const totalPaid = payments.reduce((acc, p) => acc + (Number(p.value) || 0), 0);
            const exec = Number.isFinite(Number(item.execution_percentage)) ? Math.max(0, Math.min(100, Number(item.execution_percentage))) : 0;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectPhase && onSelectPhase(item.id)}
                className="w-full text-left relative rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden"
              >
                <div className={`absolute left-0 top-0 bottom-0 w-1 ${si.dot}`} />
                <div className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full ${si.bg} ${si.color}`}>{si.text}</span>
                        <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
                          Fase {String(idx + 1).padStart(2, '0')}
                        </span>
                      </div>
                      <p className="text-base font-black text-slate-900 mt-2 break-words whitespace-normal">{item.title}</p>
                      {item.description && (
                        <p className="text-xs text-slate-500 mt-0.5 break-words whitespace-normal line-clamp-1">{item.description}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0 pt-1">
                      <span className="text-xs font-bold text-slate-500">Exec. {exec.toFixed(0)}%</span>
                      <ChevronRight className="w-5 h-5 text-slate-400" />
                    </div>
                  </div>

                  <div className="mt-3 flex items-center justify-between gap-3 text-xs">
                  <span className="text-slate-500">{payments.length} pagamento{payments.length === 1 ? '' : 's'} · {exec.toFixed(0)}% executado</span>
                    <span className={`${totalPaid > 0 ? 'font-black text-emerald-700' : 'font-semibold text-slate-500'}`}>
                      {totalPaid > 0 ? formatCurrency(totalPaid) : 'R$ 0,00'}
                    </span>
                  </div>

                  <div className="mt-2 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <div className={`h-full ${si.dot}`} style={{ width: `${exec}%` }} />
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <div className="hidden lg:block">
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Total de etapas</p>
            <p className="text-xl font-black text-slate-900 mt-1">{total}</p>
          </div>
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Total pago</p>
            <p className="text-xl font-black text-red-600 mt-1 break-words whitespace-normal">{totalPaidAll > 0 ? formatCurrency(totalPaidAll) : 'R$ 0,00'}</p>
          </div>
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Execução média</p>
            <p className="text-xl font-black text-emerald-700 mt-1">{avgExecution.toFixed(0)}%</p>
            <div className="h-2 bg-slate-100 rounded-full overflow-hidden mt-3">
              <div className="h-full bg-emerald-600 rounded-full" style={{ width: `${Math.max(0, Math.min(100, avgExecution))}%` }} />
            </div>
          </div>
        </div>

        <div className="mt-6 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-slate-500" />
              <p className="text-sm font-black text-slate-800">Panorama · {filteredPhases.length} etapa{filteredPhases.length === 1 ? '' : 's'}</p>
            </div>

            <div className="flex items-center gap-2">
              {statusOptions.map((opt) => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => setStatusFilter(opt)}
                  className={`whitespace-nowrap px-3 py-1.5 rounded-full text-xs font-bold border transition-colors ${
                    statusFilter === opt
                      ? 'bg-red-500 text-white border-red-500'
                      : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  {opt}
                </button>
              ))}
            </div>
          </div>

          <div>
            <table className="w-full table-fixed text-sm">
              <thead className="bg-slate-50 border-b border-slate-100">
                <tr className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">
                  <th className="text-left px-4 py-3 w-10">#</th>
                  <th className="text-left px-4 py-3 w-[22%]">Etapa</th>
                  
                  <th className="text-left px-4 py-3 w-40">Execução</th>
                  <th className="text-left px-4 py-3 w-28">Pago</th>
                  <th className="text-left px-4 py-3 w-36">Contrato</th>
                  <th className="text-left px-4 py-3 w-20">Pagamentos</th>
                  <th className="text-right px-4 py-3 w-28" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredPhases.map((item, idx) => {
                  const si = getStatusInfo(item.status);
                  const payments = item.payments || [];
                  const totalPaid = payments.reduce((acc, p) => acc + (Number(p.value) || 0), 0);
                  const contract = Number(item.value) || 0;
                  const exceeded = contract > 0 && totalPaid > contract;
                  const exec = Number.isFinite(Number(item.execution_percentage)) ? Math.max(0, Math.min(100, Number(item.execution_percentage))) : 0;

                  return (
                    <tr key={item.id} className={exceeded ? 'bg-red-50/30' : ''}>
                      <td className="px-4 py-4">
                        <div className={`w-2.5 h-2.5 rounded-full ${si.dot}`} />
                      </td>
                      <td className="px-4 py-4 align-top">
                        <p className="font-black text-slate-900 break-words whitespace-normal">{item.title}</p>
                        {item.description && <p className="text-xs text-slate-500 mt-1 break-words whitespace-normal">{item.description}</p>}
                        <div className="mt-2">
                          <span className={`inline-flex text-[10px] font-bold px-2.5 py-0.5 rounded-full ${si.bg} ${si.color}`}>{si.text}</span>
                        </div>
                      </td>
                      
                      <td className="px-4 py-4 align-top">
                        <div className="flex items-center gap-3">
                          <div className="w-28 h-2 bg-slate-100 rounded-full overflow-hidden flex-shrink-0">
                            <div className={`h-full ${si.dot}`} style={{ width: `${exec}%` }} />
                          </div>
                          <span className="text-xs font-bold text-slate-700">{exec.toFixed(0)}%</span>
                        </div>
                      </td>
                      <td className="px-4 py-4 align-top">
                        <span className={`font-black ${totalPaid > 0 ? 'text-red-600' : 'text-slate-500'}`}>{totalPaid > 0 ? formatCurrency(totalPaid) : 'R$ 0,00'}</span>
                      </td>
                      <td className="px-4 py-4 align-top">
                        <div className="space-y-2">
                          <span className="font-black text-slate-900">{contract > 0 ? formatCurrency(contract) : '—'}</span>
                          {exceeded && (
                            <div className="inline-flex items-center gap-2 text-[11px] font-bold px-2.5 py-1 rounded-full bg-amber-50 text-amber-800 border border-amber-100">
                              
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-4 align-top">
                        <span className="font-semibold text-slate-600">{payments.length}</span>
                        {payments.length > 0 && <span className="ml-1 text-red-600 font-black">✓</span>}
                      </td>
                      <td className="px-4 py-4 text-right align-top">
                        <Button type="button" variant="outline" className="h-9 px-3 border-slate-200 bg-white text-xs font-bold" onClick={() => onSelectPhase && onSelectPhase(item.id)}>
                          Detalhes <ChevronRight className="w-4 h-4 ml-2" />
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

// ─── TAB: Pagamentos ──────────────────────────────────────────────────────────
const TabPayments = ({ biddings, selectedBiddingId, onSelectBidding, onBack }) => {
  const [paymentFilter, setPaymentFilter] = useState('TODAS');

  const totalGeral = biddings.reduce((acc, b) => acc + (b.payments || []).reduce((pa, p) => pa + (Number(p.value) || 0), 0), 0);
  const totalContrato = biddings.reduce((acc, b) => acc + (Number(b.value) || 0), 0);
  const pctGeral = totalContrato > 0 ? Math.min((totalGeral / totalContrato) * 100, 100) : 0;

  const paymentFilterOptions = useMemo(() => {
    return [
      { id: 'TODAS', label: 'TODAS' },
      ...biddings.map((b, idx) => ({ id: b.id, label: `FASE ${String(idx + 1).padStart(2, '0')} — ${b.title}` })),
    ];
  }, [biddings]);

  const paymentsAll = useMemo(() => {
    const rows = [];
    biddings.forEach((b, idx) => {
      (b.payments || []).forEach((p) => {
        rows.push({
          ...p,
          biddingId: b.id,
          biddingTitle: b.title,
          biddingIndex: idx,
          biddingStatus: b.status,
        });
      });
    });
    rows.sort((a, b) => new Date(b.payment_date || 0) - new Date(a.payment_date || 0));
    return rows;
  }, [biddings]);

  const filteredPayments = useMemo(() => {
    if (paymentFilter === 'TODAS') return paymentsAll;
    return paymentsAll.filter((p) => p.biddingId === paymentFilter);
  }, [paymentsAll, paymentFilter]);

  const exceededBiddings = useMemo(() => {
    const list = [];
    biddings.forEach((b, idx) => {
      const paid = (b.payments || []).reduce((acc, p) => acc + (Number(p.value) || 0), 0);
      const contract = Number(b.value) || 0;
      if (contract > 0 && paid > contract) {
        list.push({
          biddingId: b.id,
          biddingTitle: b.title,
          biddingIndex: idx,
          paid,
          contract,
          exceeded: paid - contract,
        });
      }
    });
    return list;
  }, [biddings]);

  if (biddings.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-dashed border-slate-200 py-20 text-center">
        <CreditCard className="w-10 h-10 text-slate-200 mx-auto mb-3" />
        <p className="text-slate-400 text-sm font-medium">Nenhuma licitação cadastrada.</p>
      </div>
    );
  }

  const selected = selectedBiddingId ? biddings.find(b => b.id === selectedBiddingId) : null;

  if (selectedBiddingId && selected) {
    const payments = [...(selected.payments || [])].sort((a, b) => new Date(b.payment_date) - new Date(a.payment_date));
    const totalPaid = payments.reduce((acc, p) => acc + (Number(p.value) || 0), 0);
    const paidPct = selected.value ? Math.min((totalPaid / selected.value) * 100, 100) : 0;

    return (
      <div className="space-y-4  sm:pb-0">
        <div className="hidden sm:flex items-center justify-between gap-3">
          <Button type="button" variant="outline" className="border-slate-200 bg-white w-full sm:w-auto" onClick={onBack}>
            <ArrowLeft className="w-4 h-4 mr-2" /> Voltar ao panorama
          </Button>
        </div>

        <div className="sm:hidden fixed inset-x-0 bottom-[calc(4rem+var(--safe-area-bottom,0px))] z-30 px-4 pointer-events-none">
          <div className="max-w-7xl mx-auto pointer-events-auto">
            <div className="bg-white/95 backdrop-blur rounded-2xl border border-slate-200 shadow-lg p-2">
              <Button type="button" variant="outline" className="border-slate-200 bg-white w-full" onClick={onBack}>
                <ArrowLeft className="w-4 h-4 mr-2" /> Voltar ao panorama
              </Button>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-4 sm:px-5 py-4 border-b border-slate-100">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Pagamentos por etapa</p>
            <p className="text-base font-bold text-slate-900 mt-1 break-words whitespace-normal">{selected.title}</p>
            <div className="mt-2 flex items-center gap-2 flex-wrap">
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
                FASE {String((biddings.findIndex(b => b.id === selected.id) + 1) || 0).padStart(2, '0')}
              </span>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-50 text-red-700 border border-red-100">
                Licitação vinculada
              </span>
            </div>
            {selected.description && <p className="text-sm text-slate-500 mt-1 break-words whitespace-normal">{selected.description}</p>}
          </div>

          {(selected.value > 0 || totalPaid > 0) && (
            <div className="p-3 sm:p-5 border-b border-slate-100 bg-gradient-to-br from-slate-50 to-white">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-4">
                <div className="rounded-xl border border-slate-200 bg-gradient-to-br from-white to-slate-50/70 p-3 sm:p-4">
                  <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
                    <FileText className="w-3.5 h-3.5 text-slate-400" /> Contrato
                  </p>
                  <p className="text-sm sm:text-lg font-black text-slate-800 mt-1 break-words whitespace-normal">{selected.value ? formatCurrency(selected.value) : '—'}</p>
                </div>
                <div className="rounded-xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-white p-3 sm:p-4">
                  <p className="text-[9px] font-bold text-emerald-700/80 uppercase tracking-widest flex items-center gap-1.5">
                    <Banknote className="w-3.5 h-3.5 text-emerald-600" /> Total pago
                  </p>
                  <p className="text-sm sm:text-lg font-black text-emerald-800 mt-1 break-words whitespace-normal">{totalPaid > 0 ? formatCurrency(totalPaid) : 'R$ 0,00'}</p>
                </div>
                <div className="col-span-2 sm:col-span-1 rounded-xl border border-red-200 bg-gradient-to-br from-red-50 to-white p-3 sm:p-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-[9px] font-bold text-red-700/80 uppercase tracking-widest flex items-center gap-1.5">
                      <TrendingUp className="w-3.5 h-3.5 text-red-600" /> Execução
                    </p>
                    <p className="text-sm sm:text-lg font-black text-red-700">{selected.value ? `${paidPct.toFixed(1)}%` : '—'}</p>
                  </div>
                  {selected.value > 0 && (
                    <div className="h-2 bg-red-100 rounded-full overflow-hidden mt-2">
                      <div className="h-full bg-red-500 rounded-full" style={{ width: `${paidPct}%` }} />
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          <div className="p-4 sm:p-5">
            {payments.length === 0 ? (
              <div className="bg-white rounded-2xl border border-dashed border-slate-200 py-14 text-center">
                <Banknote className="w-9 h-9 text-slate-200 mx-auto mb-3" />
                <p className="text-slate-400 text-sm font-medium">Nenhum pagamento registrado nesta etapa.</p>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 gap-2 md:hidden">
                  {payments.map((p) => (
                    <div key={p.id} className="rounded-2xl border border-slate-200 bg-white p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Data</p>
                          <p className="text-[13px] font-semibold text-slate-700 mt-0.5 break-words whitespace-normal">
                            {p.payment_date ? formatDate(p.payment_date) : '—'}
                          </p>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Valor</p>
                          <p className="text-[13px] font-black text-red-600 mt-0.5">{formatCurrency(p.value)}</p>
                        </div>
                      </div>
                      <div className="mt-3 space-y-2">
                        <div>
                          <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">OB / Empenho</p>
                          <p className="text-[13px] text-slate-700 mt-0.5 break-words whitespace-normal">{p.banking_order || '—'}</p>
                        </div>
                        <div>
                          <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Portal</p>
                          {p.portal_link ? (
                            <a
                              href={p.portal_link}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[13px] text-emerald-700 hover:text-emerald-800 underline break-words whitespace-normal inline-flex items-center gap-2 mt-0.5"
                            >
                              <Link2 className="w-4 h-4 flex-shrink-0" />
                              <span>{p.portal_link}</span>
                            </a>
                          ) : (
                            <p className="text-[13px] text-slate-400 mt-0.5">—</p>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="hidden md:block overflow-x-auto rounded-2xl border border-slate-200 bg-white">
                  <table className="min-w-full text-sm">
                    <thead className="bg-slate-100 border-b border-slate-200">
                      <tr>
                        <th className="text-left px-4 py-2.5 font-bold text-slate-400 uppercase tracking-wide text-[9px]">Data</th>
                        <th className="text-left px-4 py-2.5 font-bold text-slate-400 uppercase tracking-wide text-[9px]">Ordem bancária / Empenho</th>
                        <th className="text-left px-4 py-2.5 font-bold text-slate-400 uppercase tracking-wide text-[9px]">Valor</th>
                        <th className="text-left px-4 py-2.5 font-bold text-slate-400 uppercase tracking-wide text-[9px]">Portal</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {payments.map((p) => (
                        <tr key={p.id} className="hover:bg-slate-50/50 transition-colors">
                          <td className="px-4 py-3 text-slate-600 break-words whitespace-normal">{p.payment_date ? formatDate(p.payment_date) : '—'}</td>
                          <td className="px-4 py-3 text-slate-600 break-words whitespace-normal">{p.banking_order || '—'}</td>
                          <td className="px-4 py-3 font-bold text-red-600 break-words whitespace-normal">{formatCurrency(p.value)}</td>
                          <td className="px-4 py-3 text-slate-600 break-words whitespace-normal">
                            {p.portal_link ? (
                              <a href={p.portal_link} target="_blank" rel="noopener noreferrer" className="text-emerald-700 hover:text-emerald-800 underline break-words whitespace-normal inline-flex items-center gap-2">
                                <Link2 className="w-4 h-4 flex-shrink-0" />
                                <span>{p.portal_link}</span>
                              </a>
                            ) : (
                              <span className="text-slate-300">—</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="lg:hidden space-y-3">
        <div>
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Panorama geral</p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Contrato total</p>
            <p className="text-base font-black text-slate-900 mt-1 break-words whitespace-normal">{totalContrato > 0 ? formatCurrency(totalContrato) : '—'}</p>
          </div>
          <div className="rounded-2xl border border-red-200 bg-red-50/40 p-4">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Total pago</p>
            <p className="text-base font-black text-red-600 mt-1 break-words whitespace-normal">{totalGeral > 0 ? formatCurrency(totalGeral) : 'R$ 0,00'}</p>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="flex items-center justify-between gap-3 text-xs">
            <span className="text-slate-500">Execução global</span>
            <span className="font-bold text-slate-700">{pctGeral.toFixed(1)}%</span>
          </div>
          <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden mt-2">
            <div className="h-full bg-red-500 rounded-full" style={{ width: `${pctGeral}%` }} />
          </div>
          <div className="grid grid-cols-2 gap-2 mt-3">
            <div className="rounded-xl bg-emerald-50 border border-emerald-100 text-emerald-800 text-xs font-black py-2 text-center">
              {biddings.length} etapa{biddings.length === 1 ? '' : 's'}
            </div>
            <div className="rounded-xl bg-blue-50 border border-blue-100 text-blue-800 text-xs font-black py-2 text-center">
              {biddings.reduce((a, b) => a + (b.payments || []).length, 0)} pagamento{biddings.reduce((a, b) => a + (b.payments || []).length, 0) === 1 ? '' : 's'}
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/60 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-slate-500" />
              <p className="text-xs font-black text-slate-700">{filteredPayments.length} pagamento{filteredPayments.length === 1 ? '' : 's'}</p>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button type="button" variant="outline" className="h-8 px-3 border-slate-200 bg-white text-xs font-bold text-slate-700">
                  {paymentFilter === 'TODAS'
                    ? 'TODAS'
                    : `FASE ${String((biddings.findIndex(b => b.id === paymentFilter) + 1) || 0).padStart(2, '0')}`}
                  <ChevronRight className="w-4 h-4 ml-2 rotate-90 text-slate-400" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-72">
                {paymentFilterOptions.map((opt) => (
                  <DropdownMenuItem
                    key={opt.id}
                    onSelect={(e) => {
                      e.preventDefault();
                      setPaymentFilter(opt.id);
                    }}
                    className="text-sm"
                  >
                    {opt.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <div className="p-3">
            {filteredPayments.length === 0 ? (
              <p className="text-sm text-slate-400 italic">Nenhum pagamento para este filtro.</p>
            ) : (
              <div className="grid grid-cols-1 gap-2">
                {filteredPayments.map((p) => (
                  <div key={p.id} className="rounded-2xl border border-slate-200 bg-white p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Data</p>
                        <p className="text-[13px] font-semibold text-slate-700 mt-0.5 break-words whitespace-normal">
                          {p.payment_date ? formatDate(p.payment_date) : '—'}
                        </p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Valor</p>
                        <p className="text-[13px] font-black text-red-600 mt-0.5">{formatCurrency(p.value)}</p>
                      </div>
                    </div>

                    <div className="mt-3 space-y-2 grid grid-cols-2">
                      <div>
                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Licitação</p>
                        <p className="text-[13px] font-semibold text-slate-800 mt-0.5 break-words whitespace-normal">{p.biddingTitle}</p>
                        <span className="inline-flex mt-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
                          FASE {String(p.biddingIndex + 1).padStart(2, '0')}
                        </span>
                      </div>
                      <div className="flex flex-col items-end">
                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">OB / Empenho</p>
                        <p className="text-[13px] text-slate-700 mt-0.5 break-words whitespace-normal">{p.banking_order || '—'}</p>
                      </div>
                      <div>
                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Portal</p>
                        {p.portal_link ? (
                          <a
                            href={p.portal_link}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[13px] text-emerald-700 hover:text-emerald-800 underline break-words whitespace-normal inline-flex items-center gap-2 mt-0.5"
                          >
                            <Link2 className="w-4 h-4 flex-shrink-0" />
                            <span>{p.portal_link}</span>
                          </a>
                        ) : (
                          <p className="text-[13px] text-slate-400 mt-0.5">—</p>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="hidden lg:block">
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Contrato total</p>
            <p className="text-2xl font-black text-slate-900 mt-1 break-words whitespace-normal">{totalContrato > 0 ? formatCurrency(totalContrato) : '—'}</p>
          </div>
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Total pago</p>
            <p className="text-2xl font-black text-red-600 mt-1 break-words whitespace-normal">{totalGeral > 0 ? formatCurrency(totalGeral) : 'R$ 0,00'}</p>
            {exceededBiddings.length > 0 && (
              <p className="text-xs text-amber-700 mt-1 font-semibold">⚠ Fase {String(exceededBiddings[0].biddingIndex + 1).padStart(2, '0')} excedeu contrato</p>
            )}
          </div>
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Execução financeira</p>
            <p className="text-2xl font-black text-emerald-700 mt-1">{pctGeral.toFixed(1)}%</p>
            <div className="h-2 bg-slate-100 rounded-full overflow-hidden mt-3">
              <div className="h-full bg-emerald-600 rounded-full" style={{ width: `${pctGeral}%` }} />
            </div>
          </div>
        </div>

        {exceededBiddings.length > 0 && (
          <div className="mt-4 bg-amber-50 border border-amber-100 rounded-2xl p-4 text-sm text-amber-900 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-700 flex-shrink-0 mt-0.5" />
            <p className="leading-relaxed">
              Na etapa <span className="font-bold">{exceededBiddings[0].biddingTitle}</span> (Fase {String(exceededBiddings[0].biddingIndex + 1).padStart(2, '0')}), o total pago ({formatCurrency(exceededBiddings[0].paid)}) excede o valor do contrato ({formatCurrency(exceededBiddings[0].contract)}) em <span className="font-black">{formatCurrency(exceededBiddings[0].exceeded)}</span>.
            </p>
          </div>
        )}

        <div className="mt-6 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-slate-500" />
              <p className="text-sm font-black text-slate-800">{filteredPayments.length} pagamento{filteredPayments.length === 1 ? '' : 's'} registrado{filteredPayments.length === 1 ? '' : 's'}</p>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500">Filtrar por etapa:</span>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button type="button" variant="outline" className="h-8 px-3 border-slate-200 bg-white text-xs font-bold text-slate-700">
                    {paymentFilter === 'TODAS' ? 'TODAS' : `FASE ${String((biddings.findIndex(b => b.id === paymentFilter) + 1) || 0).padStart(2, '0')}`} <ChevronRight className="w-4 h-4 ml-2 rotate-90 text-slate-400" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-72">
                  {paymentFilterOptions.map((opt) => (
                    <DropdownMenuItem
                      key={opt.id}
                      onSelect={(e) => {
                        e.preventDefault();
                        setPaymentFilter(opt.id);
                      }}
                      className="text-sm"
                    >
                      {opt.label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          <div>
            <table className="w-full table-fixed text-sm">
              <thead className="bg-slate-50 border-b border-slate-100">
                <tr className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">
                  <th className="text-left px-4 py-3 w-32">Data</th>
                  <th className="text-left px-4 py-3 w-[28%]">Etapa</th>
                  <th className="text-left px-4 py-3 w-[28%]">Empenho</th>
                  <th className="text-left px-4 py-3 w-40">Portal</th>
                  <th className="text-right px-4 py-3 w-32">Valor</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredPayments.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50/50">
                    <td className="px-4 py-4 align-top">
                      <p className="font-semibold text-slate-900">{p.payment_date ? formatDate(p.payment_date) : '—'}</p>
                      <p className="text-xs text-slate-400">{p.payment_date ? new Date(p.payment_date).toLocaleDateString('pt-BR', { weekday: 'short' }) : ''}</p>
                    </td>
                    <td className="px-4 py-4 align-top">
                      <p className="font-bold text-slate-900 break-words whitespace-normal">{p.biddingTitle}</p>
                      <div className="mt-1 flex items-center gap-2">
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">FASE {String(p.biddingIndex + 1).padStart(2, '0')}</span>
                      </div>
                    </td>
                    <td className="px-4 py-4 align-top">
                      <p className="text-xs text-slate-400 font-bold uppercase tracking-widest">Ordem bancária / Empenho</p>
                      <p className="font-semibold text-slate-800 mt-0.5 break-words whitespace-normal">{p.banking_order || '—'}</p>
                    </td>
                    <td className="px-4 py-4 align-top">
                      {p.portal_link ? (
                        <a href={p.portal_link} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-sky-700 hover:text-sky-800 font-semibold">
                          <Link2 className="w-4 h-4" />
                          <span className="break-words whitespace-normal">
                            {(() => { try { return new URL(p.portal_link).hostname; } catch { return p.portal_link; } })()}
                          </span>
                        </a>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                    <td className="px-4 py-4 text-right align-top">
                      <span className="text-base font-black text-red-600">{formatCurrency(p.value)}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-slate-100">
                  <td colSpan={4} className="px-4 py-4 text-right text-sm text-slate-500 font-semibold">Total:</td>
                  <td className="px-4 py-4 text-right text-sm font-black text-red-600">{filteredPayments.length > 0 ? formatCurrency(filteredPayments.reduce((acc, p) => acc + (Number(p.value) || 0), 0)) : 'R$ 0,00'}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      </div>
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
        <div key={name} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2">
            {name === 'Geral' ? <ImageIcon className="w-4 h-4 text-slate-400" /> : <FolderOpen className="w-4 h-4 text-slate-400" />}
            <h4 className="text-sm font-bold text-slate-700 break-words whitespace-normal">{name === 'Geral' ? 'Galeria Geral' : name}</h4>
            <span className="text-[11px] text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full border border-slate-200">{items.length}</span>
          </div>
          <div className="p-5">
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
        </div>
      );
    })}
    {documents.length > 0 && (
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2">
          <FileText className="w-4 h-4 text-slate-400" />
          <h4 className="text-sm font-bold text-slate-700">Documentos</h4>
          <span className="text-[11px] text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full border border-slate-200">{documents.length}</span>
        </div>
        <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-2">
          {documents.map(doc => (
            <a key={doc.id} href={doc.url} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-3 p-3.5 rounded-2xl bg-white border border-slate-200 hover:border-red-300 hover:bg-red-50/30 transition-all group">
              <div className="w-9 h-9 rounded-xl bg-red-50 flex items-center justify-center flex-shrink-0 group-hover:bg-red-100 transition-colors">
                <FileText className="w-4 h-4 text-red-500" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-slate-700 break-words whitespace-normal group-hover:text-red-700">{doc.title || doc.name || 'Documento'}</p>
                <p className="text-xs text-slate-400 mt-0.5">{doc.created_at ? formatDate(doc.created_at) : ''}</p>
              </div>
              <ArrowUpRight className="w-4 h-4 text-slate-300 group-hover:text-red-400 flex-shrink-0" />
            </a>
          ))}
        </div>
      </div>
    )}
    {relatedNews.length > 0 && (
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2">
          <Newspaper className="w-4 h-4 text-slate-400" />
          <h4 className="text-sm font-bold text-slate-700">Notícias relacionadas</h4>
          <span className="text-[11px] text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full border border-slate-200">{relatedNews.length}</span>
        </div>
        <div className="p-5 space-y-2">
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
                  <p className="text-sm font-semibold text-slate-700 leading-tight break-words whitespace-normal">{n.title}</p>
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
  const [selectedPhaseId, setSelectedPhaseId] = useState(null);
  const [selectedPaymentBiddingId, setSelectedPaymentBiddingId] = useState(null);

  const [viewerState, setViewer]              = useState({ isOpen: false, startIndex: 0, items: [] });
  const [showContrib, setShowContrib]         = useState(false);
  const [contribDesc, setContribDesc]         = useState('');
  const [contribVideo, setContribVideo]       = useState('');
  const [contribFiles, setContribFiles]       = useState([]);
  const fileRef                               = useRef(null);
  const [showAdminEdit, setShowAdminEdit]     = useState(false);
  const [adminInitialTab, setAdminInitialTab] = useState('info');
  const [editOptions, setEditOptions]         = useState({ categories:[], areas:[], bairros:[], contractors:[] });
  const [submitting, setSubmitting]           = useState(false);
  const [showReport, setShowReport]           = useState(false);
  const [measurements, setMeasurements]       = useState([]);
  const [biddings, setBiddings]               = useState([]);
  const [relatedNews, setRelatedNews]         = useState([]);

  const totalSpent = useMemo(() =>
    biddings.reduce((a, b) => a + (b.payments || []).reduce((pa, p) => pa + (Number(p.value) || 0), 0), 0),
  [biddings]);

  const changeTab = (tabId) => {
    setTab(tabId);
    setSelectedPhaseId(null);
    setSelectedPaymentBiddingId(null);
  };

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
  const heroMedia   = useMemo(() => work?.thumbnail_url ? { id:'hero', type:'photo', url:work.thumbnail_url } : null, [work?.thumbnail_url]);
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

  const si         = getStatusInfo(work?.status);
  const spentValue = totalSpent || work?.amount_spent || 0;
  const spentPct   = work?.total_value ? Math.min((spentValue / work.total_value) * 100, 100) : 0;

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

  const TABS = [
    { id:'overview',  label:'Visão Geral',      icon:Activity   },
    { id:'phases',    label:'Etapas do Projeto', icon:Layers     },
    { id:'payments',  label:'Pagamentos',        icon:CreditCard },
    { id:'documents', label:'Documentos',        icon:FolderOpen },
  ];

  return (
    <div className="min-h-screen bg-[#F2F3F5] pb-6 md:pb-10">
      <DynamicSEO {...seoData} />

      <div className="lg:hidden sticky top-0 z-30">
        <div className=" pt-[calc(var(--safe-area-top,0px)+12px)] pb-3">
          <div className="px-4 flex items-center justify-between gap-3">
            <div className="px-4  flex items-center gap-2 text-[11px] ">
            <Link to="/obras-publicas" className="inline-flex items-center gap-2">
              <ArrowLeft className="w-4 h-4" />
              <span className="font-semibold">Voltar para o mapa de obras</span>
            </Link>
          </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {user?.is_admin && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button size="icon" variant="ghost" className="h-9 w-9 rounded-xl bg-white/10  hover:bg-white/15">
                      <Edit className="w-[18px] h-[18px]" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56">
                    <DropdownMenuItem
                      onSelect={(e) => {
                        e.preventDefault();
                        setAdminInitialTab('info');
                        setShowAdminEdit(true);
                      }}
                      className="gap-2"
                    >
                      <Info className="w-4 h-4 text-slate-500" /> Informações
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onSelect={(e) => {
                        e.preventDefault();
                        setAdminInitialTab('media');
                        setShowAdminEdit(true);
                      }}
                      className="gap-2"
                    >
                      <ImageIcon className="w-4 h-4 text-slate-500" /> Mídias
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onSelect={(e) => {
                        e.preventDefault();
                        setAdminInitialTab('links');
                        setShowAdminEdit(true);
                      }}
                      className="gap-2"
                    >
                      <Link2 className="w-4 h-4 text-slate-500" /> Links
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onSelect={(e) => {
                        e.preventDefault();
                        setAdminInitialTab('history');
                        setShowAdminEdit(true);
                      }}
                      className="gap-2"
                    >
                      <Layers className="w-4 h-4 text-slate-500" /> Histórico / Fases
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onSelect={(e) => {
                        e.preventDefault();
                        setAdminInitialTab('payments');
                        setShowAdminEdit(true);
                      }}
                      className="gap-2"
                    >
                      <CreditCard className="w-4 h-4 text-slate-500" /> Pagamentos
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}

              <Button onClick={shareWork} size="icon" variant="ghost" className="h-9 w-9 rounded-xl bg-white/10 hover:bg-white/15">
                <Share2 className="w-[18px] h-[18px]" />
              </Button>

              <Button onClick={toggleFav} size="icon" variant="ghost" className="h-9 w-9 rounded-xl bg-white/10  hover:bg-white/15">
                <Heart className={`w-[18px] h-[18px] ${isFavorited ? 'fill-current' : ''}`} />
              </Button>
            </div>
          </div>

         
        </div>

        <div className="relative h-40 bg-slate-800 overflow-hidden">
          {heroMedia ? (
            <img src={heroMedia.url} alt="Capa da obra" className="absolute inset-0 w-full h-full object-cover" />
          ) : (
            <div className="absolute inset-0 bg-gradient-to-br from-[#5a8fa0] via-[#2d6070] to-[#1a3f4e]" />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent" />
          <div className="absolute top-3 right-3 bg-black/30 backdrop-blur px-3 py-1 rounded-full text-[10px] font-bold text-white tracking-wide">
            Obra Pública
          </div>
          <div className="absolute bottom-3 left-3 right-3">
            <p className="text-white font-black leading-tight text-base drop-shadow-sm line-clamp-2">{work.title}</p>
          </div>
        </div>

        <div className="bg-white border-b border-slate-200 px-3 py-2">
          <div className="flex gap-2 overflow-x-auto no-scrollbar">
            {TABS.map(tab => (
              <button
                key={tab.id}
                onClick={() => changeTab(tab.id)}
                className={`whitespace-nowrap px-3 py-2 rounded-full text-xs font-bold transition-colors ${
                  activeTab === tab.id ? 'bg-red-500 text-white' : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="hidden lg:block bg-white border-b border-slate-200 sticky top-0 z-30 shadow-sm">
        <div className="max-w-7xl 2xl:max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 h-12 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <Button asChild size="icon" variant="ghost" className="h-8 w-8 rounded-lg hover:bg-slate-100 flex-shrink-0">
              <Link to="/obras-publicas"><ArrowLeft className="w-4 h-4 text-slate-600" /></Link>
            </Button>
            <span className="text-xs font-semibold text-slate-600 truncate max-w-[220px] sm:max-w-none">Voltar para o mapa de obras</span>
          </div>

          <div className="hidden lg:flex items-center gap-1 text-[11px] text-slate-400">
            <Link to="/" className="hover:text-red-500 transition-colors">Início</Link>
            <ChevronRight className="w-3 h-3" />
            <Link to="/obras-publicas" className="hover:text-red-500 transition-colors">Obras Públicas</Link>
            <ChevronRight className="w-3 h-3" />
            <span className="text-slate-600 font-medium">Detalhes</span>
          </div>

          <div className="flex items-center gap-1.5 flex-shrink-0">
            {user?.is_admin && (
              <div className="md:hidden">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button size="icon" variant="outline" className="h-8 w-8 border-slate-200 bg-white text-slate-600 hover:bg-slate-50">
                      <Edit className="w-4 h-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56">
                    <DropdownMenuItem
                      onSelect={(e) => {
                        e.preventDefault();
                        setAdminInitialTab('info');
                        setShowAdminEdit(true);
                      }}
                      className="gap-2"
                    >
                      <Info className="w-4 h-4 text-slate-500" /> Informações
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onSelect={(e) => {
                        e.preventDefault();
                        setAdminInitialTab('media');
                        setShowAdminEdit(true);
                      }}
                      className="gap-2"
                    >
                      <ImageIcon className="w-4 h-4 text-slate-500" /> Mídias
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onSelect={(e) => {
                        e.preventDefault();
                        setAdminInitialTab('links');
                        setShowAdminEdit(true);
                      }}
                      className="gap-2"
                    >
                      <Link2 className="w-4 h-4 text-slate-500" /> Links
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onSelect={(e) => {
                        e.preventDefault();
                        setAdminInitialTab('history');
                        setShowAdminEdit(true);
                      }}
                      className="gap-2"
                    >
                      <Layers className="w-4 h-4 text-slate-500" /> Histórico / Fases
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onSelect={(e) => {
                        e.preventDefault();
                        setAdminInitialTab('payments');
                        setShowAdminEdit(true);
                      }}
                      className="gap-2"
                    >
                      <CreditCard className="w-4 h-4 text-slate-500" /> Pagamentos
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            )}

            <Button
              onClick={shareWork}
              size="icon"
              variant="outline"
              className="h-8 w-8 border-slate-200 bg-white text-slate-600 hover:bg-slate-50 md:hidden"
            >
              <Share2 className="w-4 h-4" />
            </Button>

            <Button onClick={toggleFav} size="icon" variant="outline"
              className={`h-8 w-8 ${isFavorited ? 'text-red-500 bg-red-50 border-red-200 hover:bg-red-100' : 'border-slate-200 text-slate-500 hover:text-red-500'}`}>
              <Heart className={`w-3.5 h-3.5 ${isFavorited ? 'fill-current' : ''}`} />
            </Button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl 2xl:max-w-[1600px] mx-auto sm:px-6 lg:px-8 lg:pt-4 pb-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <div className="lg:col-span-9">
            <div className="bg-transparent lg:bg-white lg:rounded-3xl lg:border border-slate-200 shadow-none lg:shadow-sm overflow-visible lg:overflow-hidden">
              <div className="p-3 sm:p-6 space-y-4 sm:space-y-6">

                {/* ── Header: Title & Actions ── */}
                <div className="hidden lg:flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <h1 className="text-2xl md:text-3xl font-black text-slate-900 leading-tight">{work.title}</h1>
                  
                  <div className="hidden md:flex items-center gap-2 flex-shrink-0">
                    {user?.is_admin && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button size="sm" variant="outline" className="h-9 text-xs border-slate-200 text-slate-600 px-3 bg-white shadow-sm hover:bg-slate-50">
                            <Edit className="w-3.5 h-3.5 sm:mr-1.5" /><span className="hidden sm:inline">Gerenciar Opções</span>
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-56">
                          <DropdownMenuItem
                            onSelect={(e) => {
                              e.preventDefault();
                              setAdminInitialTab('info');
                              setShowAdminEdit(true);
                            }}
                            className="gap-2"
                          >
                            <Info className="w-4 h-4 text-slate-500" /> Informações
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onSelect={(e) => {
                              e.preventDefault();
                              setAdminInitialTab('media');
                              setShowAdminEdit(true);
                            }}
                            className="gap-2"
                          >
                            <ImageIcon className="w-4 h-4 text-slate-500" /> Mídias
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onSelect={(e) => {
                              e.preventDefault();
                              setAdminInitialTab('links');
                              setShowAdminEdit(true);
                            }}
                            className="gap-2"
                          >
                            <Link2 className="w-4 h-4 text-slate-500" /> Links
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onSelect={(e) => {
                              e.preventDefault();
                              setAdminInitialTab('history');
                              setShowAdminEdit(true);
                            }}
                            className="gap-2"
                          >
                            <Layers className="w-4 h-4 text-slate-500" /> Histórico / Fases
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onSelect={(e) => {
                              e.preventDefault();
                              setAdminInitialTab('payments');
                              setShowAdminEdit(true);
                            }}
                            className="gap-2"
                          >
                            <CreditCard className="w-4 h-4 text-slate-500" /> Pagamentos
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                    <Button onClick={shareWork} size="sm" variant="outline" className="h-9 text-xs border-slate-200 text-slate-600 px-3 bg-white shadow-sm hover:bg-slate-50">
                      <Share2 className="w-3.5 h-3.5 sm:mr-1.5" /><span className="hidden sm:inline">Compartilhar</span>
                    </Button>
                  </div>
                </div>

                {/* ── Hero image ── */}
                {heroMedia && (
                  <div className="hidden lg:block relative w-full rounded-2xl overflow-hidden bg-slate-900 shadow-md h-56 sm:h-72 md:h-[350px]">
                    {['video','video_url'].includes(heroMedia.type)
                      ? <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-gray-800 to-gray-900"><Video className="w-14 h-14 text-white/30" /></div>
                      : <img src={heroMedia.url} alt="Capa da obra" className="w-full h-full object-cover" />}
                  </div>
                )}

        <div className="hidden lg:block bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="grid grid-cols-2 sm:grid-cols-4">
            {TABS.map(tab => (
              <button key={tab.id} onClick={() => changeTab(tab.id)}
                className={`flex items-center justify-center gap-2 px-4 py-3 text-[13px] font-semibold border-b-2 transition-all ${
                  activeTab === tab.id ? 'border-red-500 text-red-600 bg-red-50/40' : 'border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50'
                }`}>
                <tab.icon className="w-4 h-4" />
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* ── Tab content ── */}
   
          {activeTab === 'overview'  && (
            <TabOverview
              work={work}
              spentValue={spentValue}
              spentPct={spentPct}
              measurements={measurements}
              onOpenPhase={(phaseId) => {
                setSelectedPaymentBiddingId(null);
                setSelectedPhaseId(phaseId);
                setTab('phases');
              }}
            />
          )}
          {activeTab === 'phases'    && (
            <TabPhases
              measurements={measurements}
              media={media}
              viewableMedia={viewable}
              openViewer={openViewer}
              selectedPhaseId={selectedPhaseId}
              onSelectPhase={setSelectedPhaseId}
              onBack={() => setSelectedPhaseId(null)}
              onOpenPaymentsForPhase={(phaseId) => {
                setSelectedPhaseId(null);
                setSelectedPaymentBiddingId(phaseId);
                setTab('payments');
              }}
            />
          )}
          {activeTab === 'payments'  && (
            <TabPayments
              biddings={biddings}
              selectedBiddingId={selectedPaymentBiddingId}
              onSelectBidding={setSelectedPaymentBiddingId}
              onBack={() => setSelectedPaymentBiddingId(null)}
            />
          )}
          {activeTab === 'documents' && <TabDocuments galleryGroups={groups} openViewer={openViewer} documents={docs} relatedNews={relatedNews} />}
  

        {activeTab === 'overview' && (
          <div className="lg:hidden space-y-6">
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
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

            {Array.isArray(work.related_links) && work.related_links.length > 0 && (
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <PanelHeader icon={Link2}>Links Relacionados</PanelHeader>
                <div className="p-3 space-y-1">
                  {work.related_links.map((link, idx) => (
                    <a key={idx} href={link.url} target="_blank" rel="noopener noreferrer"
                      className="flex items-start justify-between gap-3 p-2.5 rounded-lg hover:bg-slate-50 transition-colors group">
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold text-slate-700 break-words whitespace-normal">{link.title}</span>
                        <span className="block text-xs text-slate-400 break-words whitespace-normal mt-0.5">{link.url}</span>
                      </span>
                      <ArrowUpRight className="w-3.5 h-3.5 text-slate-300 group-hover:text-red-500 ml-2 flex-shrink-0" />
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

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
            </div>
          </div>

          <div className="hidden lg:block lg:col-span-3 space-y-6">
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <PanelHeader icon={MapPin}>Localização</PanelHeader>
              <div className="h-60 2xl:h-72">
                <WorkMap location={work.location} bairro={work.bairro?.name} />
              </div>
              {(work.address || work.bairro) && (
                <div className="px-4 py-3 bg-slate-50 border-t border-slate-100">
                  {work.address && <p className="text-xs font-semibold text-slate-700">{work.address}</p>}
                  {work.bairro && <p className="text-xs text-slate-400 mt-0.5">{work.bairro.name}</p>}
                </div>
              )}
            </div>

            {Array.isArray(work.related_links) && work.related_links.length > 0 && (
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden h-fit">
                <PanelHeader icon={Link2}>Links Relacionados</PanelHeader>
                <div className="p-3 space-y-1">
                  {work.related_links.map((link, idx) => (
                    <a key={idx} href={link.url} target="_blank" rel="noopener noreferrer"
                      className="flex items-start justify-between gap-3 p-2.5 rounded-lg hover:bg-slate-50 transition-colors group">
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold text-slate-700 break-words whitespace-normal">{link.title}</span>
                        <span className="block text-xs text-slate-400 break-words whitespace-normal mt-0.5">{link.url}</span>
                      </span>
                      <ArrowUpRight className="w-3.5 h-3.5 text-slate-300 group-hover:text-red-500 ml-2 flex-shrink-0" />
                    </a>
                  ))}
                </div>
              </div>
            )}
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
          initialTab={adminInitialTab}
          visibleTabs={[adminInitialTab]}
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

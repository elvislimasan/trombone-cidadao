import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { Share } from '@capacitor/share';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { getWorkShareUrl } from '@/lib/shareUtils';
import DynamicSEO from '@/components/DynamicSeo';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { 
  ArrowLeft, Calendar, DollarSign, HardHat, PauseCircle, CheckCircle, MapPin, 
  Video, Image as ImageIcon, FileText, Clock, Building, Landmark, Award, 
  BookOpen, Heart, Dumbbell, Link2, Download, Star, Home, Wrench, 
  Share2, Edit, UploadCloud, User, Activity, ArrowUpRight, Info, AlertTriangle, Eye, Briefcase, HelpCircle, Newspaper,
  FolderOpen, Calculator, Minus, Plus, Search
} from 'lucide-react';
import { formatCurrency, formatCnpj, formatDate } from '@/lib/utils';
import MediaViewer from '@/components/MediaViewer';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { WorkEditModal } from './admin/ManageWorksPage';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { FLORESTA_COORDS } from '@/config/mapConfig';

// Fix for Leaflet default icon
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

const WorkMap = ({ location, bairro }) => {
  // Parse POINT(lng lat) if available, otherwise use default
  const position = useMemo(() => {
    if (location) {
      // Handle WKT string format: POINT(lng lat)
      if (typeof location === 'string') {
        const match = location.match(/POINT\(([-\d.]+) ([-\d.]+)\)/);
        if (match) {
          return [parseFloat(match[2]), parseFloat(match[1])]; // Leaflet uses [lat, lng]
        }
      } 
      // Handle GeoJSON object format: { type: 'Point', coordinates: [lng, lat] }
      else if (typeof location === 'object' && location.coordinates && Array.isArray(location.coordinates)) {
        return [location.coordinates[1], location.coordinates[0]]; // Leaflet uses [lat, lng]
      }
    }
    return FLORESTA_COORDS;
  }, [location]);

  return (
    <div className="h-64 w-full rounded-lg overflow-hidden relative z-0">
      <MapContainer 
        center={position} 
        zoom={15} 
        style={{ height: '100%', width: '100%' }}
        scrollWheelZoom={false}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <Marker position={position}>
          <Popup>
            {bairro || 'Localização da Obra'}
          </Popup>
        </Marker>
      </MapContainer>
    </div>
  );
};

const getStatusInfo = (status) => {
  switch (status) {
    case 'in-progress': return { text: 'Em Andamento', icon: Activity, color: 'text-blue-800', bg: 'bg-gradient-to-r from-blue-50 to-blue-100', border: 'border-blue-200' };
    case 'completed': return { text: 'Concluída', icon: CheckCircle, color: 'text-emerald-800', bg: 'bg-gradient-to-r from-emerald-50 to-emerald-100', border: 'border-emerald-200' };
    case 'stalled': return { text: 'Paralisada', icon: PauseCircle, color: 'text-amber-800', bg: 'bg-gradient-to-r from-amber-50 to-amber-100', border: 'border-amber-200' };
    case 'unfinished': return { text: 'Inacabada', icon: AlertTriangle, color: 'text-rose-800', bg: 'bg-gradient-to-r from-rose-50 to-rose-100', border: 'border-rose-200' };
    case 'planned': return { text: 'Planejamento', icon: Calendar, color: 'text-violet-800', bg: 'bg-gradient-to-r from-violet-50 to-violet-100', border: 'border-violet-200' };
    case 'tendered': return { text: 'Em Licitação', icon: FileText, color: 'text-orange-800', bg: 'bg-gradient-to-r from-orange-50 to-orange-100', border: 'border-orange-200' };
    default: return { text: 'Não definido', icon: HelpCircle, color: 'text-slate-700', bg: 'bg-slate-100', border: 'border-slate-200' };
  }
};

const WorkDetailsPage = () => {
  const { workId } = useParams();
  const { toast } = useToast();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [work, setWork] = useState(null);
  const [media, setMedia] = useState([]);
  const [isFavorited, setIsFavorited] = useState(false);
  const [loading, setLoading] = useState(true);
  const [selectedMeasurement, setSelectedMeasurement] = useState(null);
  const previousMeasurementRef = useRef(null);
  const [viewerState, setViewerState] = useState({ isOpen: false, startIndex: 0, items: [] });
  const [showContribDialog, setShowContribDialog] = useState(false);
  const [contribDescription, setContribDescription] = useState('');
  const [contribVideoUrl, setContribVideoUrl] = useState('');
  const [contribFiles, setContribFiles] = useState([]);
  const fileInputRef = useRef(null);
  const [showAdminEditModal, setShowAdminEditModal] = useState(false);
  const [workEditOptions, setWorkEditOptions] = useState({ categories: [], areas: [], bairros: [], contractors: [] });
  const [isSubmittingContribution, setIsSubmittingContribution] = useState(false);
  const [showReportDialog, setShowReportDialog] = useState(false);
  const [measurements, setMeasurements] = useState([]);
  const [biddings, setBiddings] = useState([]);
  const [relatedNews, setRelatedNews] = useState([]);

  const currentMeasurement = useMemo(() => {
    if (!Array.isArray(measurements) || measurements.length === 0) return null;
    return [...measurements].sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];
  }, [measurements]);

  const lastUpdatedAt = useMemo(() => {
    const candidates = [];
    if (work?.updated_at) candidates.push(new Date(work.updated_at));
    if (work?.created_at) candidates.push(new Date(work.created_at));
    (measurements || []).forEach((m) => {
      if (m?.updated_at) candidates.push(new Date(m.updated_at));
      if (m?.created_at) candidates.push(new Date(m.created_at));
      (m?.payments || []).forEach((p) => {
        if (p?.updated_at) candidates.push(new Date(p.updated_at));
        if (p?.created_at) candidates.push(new Date(p.created_at));
      });
    });
    (media || []).forEach((m) => {
      if (m?.updated_at) candidates.push(new Date(m.updated_at));
      if (m?.created_at) candidates.push(new Date(m.created_at));
    });
    const valid = candidates.filter((d) => d instanceof Date && !Number.isNaN(d.getTime()));
    if (valid.length === 0) return null;
    return new Date(Math.max(...valid.map((d) => d.getTime())));
  }, [media, measurements, work?.created_at, work?.updated_at]);

  const [showPaymentDialog, setShowPaymentDialog] = useState(false);
  const [isSavingPayment, setIsSavingPayment] = useState(false);
  const commitmentTypeOptions = useMemo(() => ['Estimativo', 'Extra Orçamentário', 'Global', 'Ordinário'], []);
  const [paymentForm, setPaymentForm] = useState({
    measurement_id: '',
    payment_date: new Date().toISOString().split('T')[0],
    commitment_number: '',
    commitment_type: '',
    payment_description: '',
    installment: '',
    creditor_name: '',
    value: '',
    portal_link: ''
  });

  const allPayments = useMemo(() => {
    return (biddings || []).flatMap((measurement) => {
      const payments = Array.isArray(measurement.payments) ? measurement.payments : [];
      return payments.map((payment) => ({
        ...payment,
        measurement_id: measurement.id,
        measurement_title: measurement.title
      }));
    });
  }, [biddings]);

  const totalSpentFromPayments = useMemo(() => {
    return allPayments.reduce((acc, p) => acc + (Number(p.value) || 0), 0);
  }, [allPayments]);

  const currentPhasePayments = useMemo(() => {
    if (!currentMeasurement?.id) return [];
    return allPayments.filter((p) => p.measurement_id === currentMeasurement.id);
  }, [allPayments, currentMeasurement?.id]);

  const currentPhaseSpentFromPayments = useMemo(() => {
    return currentPhasePayments.reduce((acc, p) => acc + (Number(p.value) || 0), 0);
  }, [currentPhasePayments]);

  const PAYMENTS_PAGE_SIZE = 8;
  const [paymentsSortKey, setPaymentsSortKey] = useState('payment_date');
  const [paymentsSortDir, setPaymentsSortDir] = useState('asc');
  const [paymentsPage, setPaymentsPage] = useState(1);
  const [paymentsQuery, setPaymentsQuery] = useState('');
  const [paymentsYearFilter, setPaymentsYearFilter] = useState('all');
  const [paymentsCommitmentFilter, setPaymentsCommitmentFilter] = useState('all');
  const [openPaymentGroupKeys, setOpenPaymentGroupKeys] = useState(() => new Set());

  const paymentsBase = useMemo(() => {
    return currentMeasurement?.id ? currentPhasePayments : allPayments;
  }, [allPayments, currentMeasurement?.id, currentPhasePayments]);

  const paymentsYearOptions = useMemo(() => {
    const years = new Set();
    (paymentsBase || []).forEach((p) => {
      const d = new Date(p?.payment_date);
      if (!Number.isNaN(d.getTime())) years.add(String(d.getUTCFullYear()));
    });
    return [...years].sort((a, b) => Number(b) - Number(a));
  }, [paymentsBase]);

  const paymentsCommitmentOptions = useMemo(() => {
    const keys = new Set();
    (paymentsBase || []).forEach((p) => {
      const key = String(p?.commitment_number || p?.banking_order || '').trim() || 'SEM_EMPENHO';
      keys.add(key);
    });
    return [...keys].sort((a, b) => a.localeCompare(b));
  }, [paymentsBase]);

  const filteredPayments = useMemo(() => {
    let list = Array.isArray(paymentsBase) ? paymentsBase : [];

    if (paymentsYearFilter !== 'all') {
      list = list.filter((p) => {
        const d = new Date(p?.payment_date);
        if (Number.isNaN(d.getTime())) return false;
        return String(d.getUTCFullYear()) === String(paymentsYearFilter);
      });
    }

    if (paymentsCommitmentFilter !== 'all') {
      list = list.filter((p) => {
        const key = String(p?.commitment_number || p?.banking_order || '').trim() || 'SEM_EMPENHO';
        return key === paymentsCommitmentFilter;
      });
    }

    const q = String(paymentsQuery || '').trim().toLowerCase();
    if (q) {
      list = list.filter((p) => {
        const hay = [
          p?.payment_description,
          p?.creditor_name,
          p?.commitment_number,
          p?.banking_order,
          p?.installment,
          p?.measurement_title,
          p?.payment_date,
          p?.value,
        ]
          .filter(Boolean)
          .map((x) => String(x).toLowerCase())
          .join(' ');
        return hay.includes(q);
      });
    }

    return list;
  }, [paymentsBase, paymentsCommitmentFilter, paymentsQuery, paymentsYearFilter]);

  const paymentsTotalFiltered = useMemo(() => {
    return (filteredPayments || []).reduce((sum, p) => sum + (Number(p?.value) || 0), 0);
  }, [filteredPayments]);

  const paymentGroups = useMemo(() => {
    const getDate = (value) => {
      const d = new Date(value);
      return Number.isNaN(d.getTime()) ? null : d;
    };

    const map = new Map();
    (filteredPayments || []).forEach((p) => {
      const key = String(p?.commitment_number || p?.banking_order || '').trim() || 'SEM_EMPENHO';
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(p);
    });

    const groups = [];
    map.forEach((items, key) => {
      const sorted = [...items].sort((a, b) => (getDate(a?.payment_date)?.getTime() ?? 0) - (getDate(b?.payment_date)?.getTime() ?? 0));
      const total = sorted.reduce((acc, p) => acc + (Number(p?.value) || 0), 0);
      const creditorSet = new Set(sorted.map((p) => String(p?.creditor_name || '').trim()).filter(Boolean));
      const phaseSet = new Set(sorted.map((p) => String(p?.measurement_title || '').trim()).filter(Boolean));
      const firstDate = getDate(sorted[0]?.payment_date) || null;
      const hasPortal = sorted.some((p) => Boolean(p?.portal_link));

      groups.push({
        key,
        commitment_number: key === 'SEM_EMPENHO' ? '' : key,
        items: sorted,
        total,
        creditorLabel: creditorSet.size === 1 ? [...creditorSet][0] : creditorSet.size > 1 ? 'Vários' : '-',
        phaseLabel: phaseSet.size === 1 ? [...phaseSet][0] : phaseSet.size > 1 ? 'Várias' : '-',
        firstDate,
        count: sorted.length,
        hasPortal,
      });
    });

    return groups;
  }, [filteredPayments]);

  const sortedPaymentGroups = useMemo(() => {
    const dir = paymentsSortDir === 'desc' ? -1 : 1;
    const getStr = (value) => String(value || '').toLowerCase();
    const getNum = (value) => {
      const n = Number(value);
      return Number.isFinite(n) ? n : 0;
    };

    const list = (paymentGroups || []).map((g, idx) => ({ g, idx }));
    const key = paymentsSortKey;

    list.sort((a, b) => {
      const ga = a.g;
      const gb = b.g;
      let cmp = 0;

      if (key === 'payment_date') {
        cmp = (ga.firstDate?.getTime() ?? 0) - (gb.firstDate?.getTime() ?? 0);
      } else if (key === 'value') {
        cmp = getNum(ga.total) - getNum(gb.total);
      } else if (key === 'creditor_name') {
        cmp = getStr(ga.creditorLabel).localeCompare(getStr(gb.creditorLabel));
      } else if (key === 'commitment_number') {
        cmp = getStr(ga.commitment_number).localeCompare(getStr(gb.commitment_number));
      } else if (key === 'measurement_title') {
        cmp = getStr(ga.phaseLabel).localeCompare(getStr(gb.phaseLabel));
      } else if (key === 'portal_link') {
        cmp = Number(Boolean(ga.hasPortal)) - Number(Boolean(gb.hasPortal));
      }

      if (cmp === 0) cmp = a.idx - b.idx;
      return cmp * dir;
    });

    return list.map((x) => x.g);
  }, [paymentGroups, paymentsSortDir, paymentsSortKey]);

  const paymentsTotalPages = useMemo(() => {
    const total = sortedPaymentGroups.length;
    return Math.max(1, Math.ceil(total / PAYMENTS_PAGE_SIZE));
  }, [sortedPaymentGroups.length]);

  const paymentsPageSafe = useMemo(() => {
    const p = Number(paymentsPage) || 1;
    return Math.max(1, Math.min(paymentsTotalPages, p));
  }, [paymentsPage, paymentsTotalPages]);

  useEffect(() => {
    setPaymentsPage(1);
  }, [paymentsCommitmentFilter, paymentsQuery, paymentsSortKey, paymentsSortDir, paymentsYearFilter]);

  const pagedPaymentGroups = useMemo(() => {
    const start = (paymentsPageSafe - 1) * PAYMENTS_PAGE_SIZE;
    return sortedPaymentGroups.slice(start, start + PAYMENTS_PAGE_SIZE);
  }, [paymentsPageSafe, sortedPaymentGroups]);

  const paymentsPageNumbers = useMemo(() => {
    const total = paymentsTotalPages;
    const current = paymentsPageSafe;
    const to = Math.min(total, Math.max(1, current - 2) + 4);
    const from = Math.max(1, to - 4);
    const pages = [];
    for (let i = from; i <= to; i += 1) pages.push(i);
    return pages;
  }, [paymentsPageSafe, paymentsTotalPages]);

  const togglePaymentGroupOpen = useCallback((key) => {
    setOpenPaymentGroupKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const toggleSort = useCallback(
    (nextKey) => {
      setPaymentsSortKey((prevKey) => {
        if (prevKey === nextKey) {
          setPaymentsSortDir((prevDir) => (prevDir === 'asc' ? 'desc' : 'asc'));
          return prevKey;
        }
        setPaymentsSortDir(nextKey === 'payment_date' ? 'asc' : 'asc');
        return nextKey;
      });
    },
    []
  );

  const sortIndicator = useCallback(
    (key) => {
      if (paymentsSortKey !== key) return '↕';
      return paymentsSortDir === 'asc' ? '▲' : '▼';
    },
    [paymentsSortDir, paymentsSortKey]
  );

  useEffect(() => {
    console.log('relatedNews_state', relatedNews);
  }, [relatedNews]);

  const fetchWorkDetails = useCallback(async () => {
    setLoading(true);
    const { data: workData, error: workError } = await supabase
      .from('public_works')
      .select('*, work_category:work_categories(name), work_area:work_areas(name), bairro:bairros(name), contractor:contractor_id(id, name, cnpj)')
      .eq('id', workId)
      .single();

    if (workError) {
      toast({ title: "Erro ao buscar detalhes da obra", description: workError.message, variant: "destructive" });
      setLoading(false);
      return;
    }

    const { data: mediaData, error: mediaError } = await supabase
      .from('public_work_media')
      .select('*')
      .eq('work_id', workId)
      .order('media_date', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false });

    if (mediaError) {
      toast({ title: "Erro ao buscar mídias da obra", description: mediaError.message, variant: "destructive" });
    }

    const { data: measurementsData, error: measurementsError } = await supabase
      .from('public_work_measurements')
      .select('*, contractor:contractor_id(name, cnpj), payments:public_work_payments(*)')
      .eq('work_id', workId)
      .order('created_at', { ascending: false });

    if (measurementsError) {
      console.error('Error fetching measurements:', measurementsError);
    }

    let related = [];
    const { data: relRaw, error: relErr } = await supabase
      .from('news_public_works')
      .select('news_id')
      .eq('work_id', workId);
    if (!relErr && relRaw && relRaw.length > 0) {
      const ids = relRaw.map(r => r.news_id).filter(Boolean);
      if (ids.length > 0) {
        const { data: newsList } = await supabase
          .from('news')
          .select('id, title, date, image_url')
          .in('id', ids)
          .order('date', { ascending: false });
        related = newsList || [];
      }
    }
    console.log(related)
    setRelatedNews(related);

    setWork(workData);
    setMedia(mediaData || []);
    setMeasurements(measurementsData || []);
    setBiddings(measurementsData || []); // Use measurements as biddings for compatibility with the UI
    setLoading(false);
  }, [workId, toast]);

  const openNewPaymentDialog = useCallback(() => {
    const defaultMeasurement = currentMeasurement || measurements?.[0] || null;
    const defaultMeasurementId = defaultMeasurement?.id || '';
    const defaultCreditorName = defaultMeasurement?.contractor?.name || '';
    setPaymentForm({
      measurement_id: defaultMeasurementId,
      payment_date: new Date().toISOString().split('T')[0],
      commitment_number: '',
      commitment_type: '',
      payment_description: '',
      installment: '',
      creditor_name: defaultCreditorName,
      value: '',
      portal_link: ''
    });
    setShowPaymentDialog(true);
  }, [measurements, currentMeasurement]);

  const handleSavePayment = useCallback(async () => {
    try {
      if (!user?.is_admin) {
        toast({ title: 'Acesso restrito', description: 'Apenas administradores podem cadastrar pagamentos.', variant: 'destructive' });
        return;
      }

      if (!paymentForm.measurement_id || !paymentForm.payment_date || !paymentForm.value) {
        toast({ title: 'Campos obrigatórios', description: 'Fase, data e valor são obrigatórios.', variant: 'destructive' });
        return;
      }

      setIsSavingPayment(true);

      const payload = {
        measurement_id: paymentForm.measurement_id,
        payment_date: paymentForm.payment_date,
        commitment_number: paymentForm.commitment_number || null,
        commitment_type: paymentForm.commitment_type || null,
        payment_description: paymentForm.payment_description || null,
        installment: paymentForm.installment || null,
        creditor_name: paymentForm.creditor_name || null,
        value: Number(paymentForm.value),
        portal_link: paymentForm.portal_link || null
      };

      const { error } = await supabase.from('public_work_payments').insert([payload]);
      if (error) throw error;

      toast({ title: 'Pagamento registrado', description: 'O pagamento foi adicionado com sucesso.' });
      setShowPaymentDialog(false);
      fetchWorkDetails();
    } catch (error) {
      toast({ title: 'Erro ao salvar pagamento', description: error.message, variant: 'destructive' });
    } finally {
      setIsSavingPayment(false);
    }
  }, [user?.is_admin, paymentForm, toast, fetchWorkDetails]);

  useEffect(() => {
    fetchWorkDetails();
  }, [fetchWorkDetails]);

  useEffect(() => {
    const checkFavorite = async () => {
      if (!user) {
        setIsFavorited(false);
        return;
      }
      const { data: favoriteData, error: favoriteError } = await supabase
        .from('favorite_works')
        .select('work_id')
        .eq('user_id', user.id)
        .eq('work_id', workId);
      if (!favoriteError) {
        setIsFavorited((favoriteData || []).length > 0);
      }
    };
    checkFavorite();
  }, [user, workId]);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  useEffect(() => {
    const fetchEditOptions = async () => {
      if (!user?.is_admin) return;
      const [categories, areas, bairros, contractors] = await Promise.all([
        supabase.from('work_categories').select('*'),
        supabase.from('work_areas').select('*'),
        supabase.from('bairros').select('*'),
        supabase.from('contractors').select('*'),
      ]);
      setWorkEditOptions({
        categories: categories.data || [],
        areas: areas.data || [],
        bairros: bairros.data || [],
        contractors: contractors.data || [],
      });
    };
    fetchEditOptions();
  }, [user?.is_admin]);

  const handleFavoriteToggle = async () => {
    if (!user) {
      toast({ title: "Acesso restrito", description: "Você precisa fazer login para favoritar uma obra.", variant: "destructive" });
      navigate('/login');
      return;
    }

    if (isFavorited) {
      const { error } = await supabase.from('favorite_works').delete().match({ user_id: user.id, work_id: workId });
      if (error) {
        toast({ title: "Erro ao desfavoritar", description: error.message, variant: "destructive" });
      } else {
        toast({ title: "Obra removida dos favoritos! 💔" });
        setIsFavorited(false);
      }
    } else {
      const { error } = await supabase.from('favorite_works').insert({ user_id: user.id, work_id: workId });
      if (error) {
        toast({ title: "Erro ao favoritar", description: error.message, variant: "destructive" });
      } else {
        toast({ title: "Obra adicionada aos favoritos! ⭐" });
        setIsFavorited(true);
      }
    }
  };

  // Função para obter URL base correta (não localhost no app)
  const getBaseUrl = useCallback(() => {
    let baseUrl;
    
    // 1. Prioridade: Variável de ambiente (configurada no Vercel)
    if (import.meta.env.VITE_APP_URL) {
      baseUrl = import.meta.env.VITE_APP_URL;
    }
    // 2. Se estiver no app nativo, sempre usar produção
    else if (Capacitor.isNativePlatform()) {
      baseUrl = 'https://trombonecidadao.com.br';
    }
    // 3. Se estiver no navegador, detectar automaticamente o ambiente
    else if (typeof window !== 'undefined') {
      const origin = window.location.origin;
      
      // Se for localhost, usar localhost
      if (origin.includes('localhost')) {
        baseUrl = origin;
      }
      // Se for Vercel (dev), usar Vercel
      else if (origin.includes('trombone-cidadao.vercel.app') || origin.includes('vercel.app')) {
        baseUrl = origin;
      }
      // Se for domínio de produção, usar produção
      else if (origin.includes('trombonecidadao.com.br')) {
        baseUrl = 'https://trombonecidadao.com.br';
      }
      // Fallback: usar a origem atual
      else {
        baseUrl = origin;
      }
    }
    // 4. Fallback final: produção
    else {
      baseUrl = 'https://trombonecidadao.com.br';
    }
    
    // Remover barra final se existir para evitar barras duplas
    return baseUrl.replace(/\/$/, '');
  }, []);

  const baseUrl = useMemo(() => getBaseUrl(), [getBaseUrl]);

  const seoData = useMemo(() => {
    const defaultThumbnail = `${baseUrl}/images/thumbnail.jpg`;
    
    let workImage = defaultThumbnail;
    let imageUrl = null;
    
    if (work && work.thumbnail_url) {
      imageUrl = work.thumbnail_url;
    } else if (media && media.length > 0) {
      const firstImage = media.find(m => m.type === 'image' || m.type === 'photo');
      const firstVideo = media.find(m => m.type === 'video' || m.type === 'video_url');
      const mediaItem = firstImage || firstVideo;
      
      if (mediaItem && mediaItem.url) {
        imageUrl = mediaItem.url;
      }
    }

    if (imageUrl) {
      // Garante que a URL seja absoluta e acessível
      let absoluteUrl = imageUrl;
      if (!imageUrl.startsWith('http')) {
        absoluteUrl = `${baseUrl}${imageUrl.startsWith('/') ? '' : '/'}${imageUrl}`;
      }

      try {
        const cleanUrl = absoluteUrl.split('?')[0];
        workImage = `https://wsrv.nl/?url=${encodeURIComponent(cleanUrl)}&w=1200&h=630&fit=cover&q=80&output=jpg`;
      } catch (e) {
        console.error(e);
        workImage = absoluteUrl;
      }
    }

    const currentUrl = typeof window !== 'undefined' ? window.location.href : '';

    return {
      title: work ? `Obra: ${work.title} - Trombone Cidadão` : 'Detalhes da Obra - Trombone Cidadão',
      description: work?.description || 'Acompanhe esta obra pública no Trombone Cidadão.',
      image: workImage,
      url: currentUrl
    };
  }, [work, media, baseUrl]);

  const viewableMedia = useMemo(() => {
    const items = media.filter(m => ['image', 'photo', 'video', 'video_url'].includes(m.type));
    return items;
  }, [media, work]);

  const currentPhaseMedia = useMemo(() => {
    if (!currentMeasurement?.id) return [];
    return viewableMedia.filter((m) => m.measurement_id === currentMeasurement.id);
  }, [viewableMedia, currentMeasurement?.id]);

  const currentPhaseDocuments = useMemo(() => {
    if (!currentMeasurement?.id) return [];
    return media.filter(
      (m) =>
        (m.type === 'pdf' || m.type === 'document' || m.type === 'file') &&
        m.measurement_id === currentMeasurement.id
    );
  }, [media, currentMeasurement?.id]);

  const handleShareWork = async () => {
    if (typeof window === 'undefined' || !work) return;

    const url = getWorkShareUrl(work.id);
    const title = work.title;
    // const text = work.description || 'Confira os detalhes desta obra pública no Trombone Cidadão.'; // Removido para evitar que o texto apareça no corpo da mensagem

    try {
      if (Capacitor.isNativePlatform()) {
        await Share.share({
          title,
          // text, // Removido
          url,
          dialogTitle: 'Compartilhar Obra',
        });
        return;
      }

      if (navigator.share) {
        await navigator.share({
          title,
          // text, // Removido
          url,
        });
        return;
      }

      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(url);
        toast({ title: "Link copiado!", description: "Cole nas suas redes sociais." });
        return;
      }
    } catch (error) {
      if (error.name === 'AbortError') return;
      // Fallback para clipboard
      try {
        await navigator.clipboard.writeText(url);
        toast({ title: "Link copiado!", description: "Cole nas suas redes sociais." });
      } catch (e) {
        toast({ title: "Erro ao compartilhar", variant: "destructive" });
      }
    }
  };

  const handleOpenContrib = () => {
    if (!user) {
      toast({ title: "Faça login para contribuir", description: "Você precisa entrar para enviar fotos ou dados.", variant: "destructive" });
      navigate('/login');
      return;
    }
    setShowContribDialog(true);
  };

  const handleContribFilesChange = (e) => {
    const files = Array.from(e.target.files || []);
    setContribFiles(files);
  };

  const handleSubmitContribution = async () => {
    if (!user || !work || isSubmittingContribution) return;
    if (!currentMeasurement?.id) {
      toast({ title: "Fase não encontrada", description: "Cadastre uma fase para enviar contribuições.", variant: "destructive" });
      return;
    }
    setIsSubmittingContribution(true);
    try {
      if (contribFiles.length > 0) {
        for (const file of contribFiles) {
          const path = `measurements/${currentMeasurement.id}/${Date.now()}-${file.name}`;
          const { error: uploadError } = await supabase.storage.from('work-media').upload(path, file);
          if (uploadError) throw uploadError;
          const { data: { publicUrl } } = supabase.storage.from('work-media').getPublicUrl(path);
          let type = 'file';
          if (file.type.startsWith('image')) type = 'image';
          else if (file.type.startsWith('video')) type = 'video';
          else if (file.type === 'application/pdf') type = 'pdf';
          const { error: dbError } = await supabase.from('public_work_media').insert({
            work_id: work.id,
            measurement_id: currentMeasurement.id,
            url: publicUrl,
            type,
            name: file.name,
            description: contribDescription || null,
            status: 'pending',
            gallery_name: currentMeasurement.title || 'Contribuições',
            contributor_id: user.id
          });
          if (dbError) throw dbError;
        }
      }
      if (contribVideoUrl && contribVideoUrl.trim().length > 0) {
        const { error: linkErr } = await supabase.from('public_work_media').insert({
          work_id: work.id,
          measurement_id: currentMeasurement.id,
          url: contribVideoUrl.trim(),
          type: 'video_url',
          name: 'Vídeo do cidadão',
          description: contribDescription || null,
          status: 'pending',
          gallery_name: currentMeasurement.title || 'Contribuições',
          contributor_id: user.id
        });
        if (linkErr) throw linkErr;
      }
      toast({ title: "Contribuição enviada! ✅", description: "Obrigado por colaborar com transparência." });
      setShowContribDialog(false);
      setContribDescription('');
      setContribVideoUrl('');
      setContribFiles([]);
      const { data: mediaData } = await supabase.from('public_work_media').select('*').eq('work_id', work.id).order('media_date', { ascending: false, nullsFirst: false }).order('created_at', { ascending: false });
      setMedia(mediaData || []);
    } catch (error) {
      toast({ title: "Erro ao enviar contribuição", description: error.message, variant: "destructive" });
    } finally {
      setIsSubmittingContribution(false);
    }
  };

  const openViewer = (items, startIndex) => {
    if (selectedMeasurement) {
      previousMeasurementRef.current = selectedMeasurement;
      setSelectedMeasurement(null);
    }
    const viewerItems = items.map(m => {
      if (m.type === 'image') return { ...m, type: 'photo' };
      if (m.type === 'video_url') return { ...m, type: 'video' };
      return m;
    });
    setViewerState({ isOpen: true, startIndex, items: viewerItems });
  };

  const closeViewer = () => {
    setViewerState({ isOpen: false, startIndex: 0, items: [] });
    if (previousMeasurementRef.current) {
      setSelectedMeasurement(previousMeasurementRef.current);
      previousMeasurementRef.current = null;
    }
  };



  if (loading) {
    return (
      <div className="max-w-5xl lg:max-w-6xl mx-auto px-4 py-8 space-y-8">
        <Skeleton className="h-[400px] w-full rounded-xl" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-4">
            <Skeleton className="h-8 w-1/3" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-64 w-full rounded-lg" />
          </div>
          <div className="space-y-4">
            <Skeleton className="h-48 w-full rounded-lg" />
            <Skeleton className="h-32 w-full rounded-lg" />
          </div>
        </div>


      </div>
    );
  }

  if (!work) {
    return (
      <div className="max-w-5xl lg:max-w-6xl mx-auto px-4 py-12 text-center">
        <h1 className="text-2xl font-bold text-slate-800">Obra não encontrada</h1>
        <Button asChild className="mt-4" variant="default">
          <Link to="/obras-publicas">Voltar para Obras</Link>
        </Button>
      </div>
    );
  }

  const statusInfo = getStatusInfo(currentMeasurement?.status || work.status);
  const executionPct = currentMeasurement?.execution_percentage ?? work.execution_percentage ?? 0;
  const displayContractor = currentMeasurement?.contractor || work.contractor || null;
  const displayFundingSource = currentMeasurement?.funding_source || work.funding_source || [];
  const displayExecutionPeriodDays = currentMeasurement?.execution_period_days ?? work.execution_period_days;
  const displayContractSignatureDate = currentMeasurement?.contract_signature_date || work.contract_signature_date;
  const displayServiceOrderDate = currentMeasurement?.service_order_date || work.service_order_date;
  const displayPredictedStartDate = currentMeasurement?.predicted_start_date || work.start_date_forecast || work.predicted_start_date;
  const displayStartDate = currentMeasurement?.start_date || work.start_date;
  const displayExpectedEndDate = currentMeasurement?.expected_end_date || work.end_date_forecast || work.expected_end_date;
  const displayEndDate = currentMeasurement?.end_date || work.end_date;
  const displayInaugurationDate = currentMeasurement?.inauguration_date || work.inauguration_date;
  const displayStalledDate = currentMeasurement?.stalled_date || work.stalled_date;
  const currentPhaseExpectedValue = currentMeasurement?.expected_value ?? currentMeasurement?.value ?? work.total_value;
  const paymentsToShow = paymentsBase;
  
  return (
    <div className="min-h-screen bg-background pb-20 md:pb-12">
      <DynamicSEO {...seoData} />
      
      {/* Sticky Header with Back Button */}
      <div className="bg-primary text-primary-foreground sticky top-0 z-30 shadow-sm">
        <div className="max-w-5xl lg:max-w-6xl 2xl:max-w-[100rem] mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button
              asChild
              size="icon"
              variant="ghost"
              className="h-10 w-10 rounded-xl hover:bg-primary-foreground/10"
            >
              <Link to="/obras-publicas">
                <ArrowLeft className="w-5 h-5" />
              </Link>
            </Button>
          <span className="text-xs sm:text-sm font-bold tracking-wider max-w-[140px] sm:max-w-none block text-primary-foreground/80">
  Voltar para mapa de obras
</span>
          </div>

          
          <div className="flex items-center gap-2">
             {user?.is_admin && (
              <Button 
                onClick={() => setShowAdminEditModal(true)}
                variant="secondary"
                size="sm"
                className="ml-2 flex"
              >
                <Edit className="w-4 h-4 mr-2" />
                <span  className="hidden sm:inline" >Gerenciar</span> 
              </Button>
            )}
            <Button 
              onClick={handleShareWork}
              variant="ghost" 
              className="rounded-full h-12 w-12 sm:h-10 sm:w-auto sm:px-4"
              title="Compartilhar"
            >
              <Share2 className="w-5 h-5 sm:mr-2" />
              <span className="hidden sm:inline font-medium">Compartilhar</span> 
            </Button>
            
            <Button
              onClick={handleFavoriteToggle}
              variant="ghost"
              className={`rounded-full h-12 w-12 sm:h-10 sm:w-auto sm:px-4 ${isFavorited ? 'text-primary-foreground bg-primary-foreground/10' : 'text-primary-foreground'}`}
              title={isFavorited ? 'Remover dos favoritos' : 'Favoritar'}
            >
              <Heart className={`w-5 h-5 sm:mr-2 ${isFavorited ? 'fill-current' : ''}`} />
              <span className="hidden sm:inline font-medium">Favoritar</span>
            </Button>

           
          </div>
        </div>
        <div className="hidden lg:block bg-card text-foreground border-b border-border">
          <div className="max-w-5xl lg:max-w-6xl 2xl:max-w-[100rem] mx-auto px-4 py-2 text-[11px] text-muted-foreground flex items-center gap-1">
            <Link to="/" className="hover:text-primary transition-colors">
              Início
            </Link>
            <span className="opacity-50">›</span>
            <Link to="/obras-publicas" className="hover:text-primary transition-colors">
              Obras Públicas
            </Link>
            <span className="opacity-50">›</span>
            <span className="text-foreground truncate max-w-[300px]">{work.title}</span>
          </div>
        </div>
      </div>

      <div className="max-w-5xl lg:max-w-7xl 2xl:max-w-[100rem] mx-auto px-4 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-8">
          
          {/* Main Content Column */}
          <div className="lg:col-span-2">
            <div className="mb-4">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className={`${statusInfo.bg} ${statusInfo.color} border-current/20 hover:bg-opacity-80 px-3 py-1 text-sm font-medium shadow-sm`}>
                    <statusInfo.icon className="w-4 h-4 mr-1.5" />
                    {statusInfo.text}
                  </Badge>
                  {work.bairro && (
                    <Badge variant="outline" className="text-muted-foreground border-border bg-muted/40">
                      <MapPin className="w-3 h-3 mr-1" />
                      {work.bairro.name}
                    </Badge>
                  )}
                </div>
                {lastUpdatedAt ? (
                  <div className="hidden lg:block text-sm font-semibold text-muted-foreground whitespace-nowrap">
                    Última atualização: {formatDate(lastUpdatedAt)}
                  </div>
                ) : null}
              </div>
              <h1 className="text-2xl md:text-3xl font-bold text-foreground leading-tight">{work.title}</h1>
              {work.description && (
                <p className="mt-2 text-sm md:text-base text-muted-foreground font-medium leading-relaxed">
                  {work.description}
                </p>
              )}
            </div>
            
            <div className="space-y-6">
              
            {work.thumbnail_url && (
              <div className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden">
                <div className="w-full h-56 sm:h-64 bg-slate-900 relative overflow-hidden">
                  <img
                    src={work.thumbnail_url}
                    alt="Capa da obra"
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/50 via-black/30 to-transparent" />
                </div>
              </div>
            )}
              
            {/* Title & Progress Hero Card */}
            <div className="p-5 md:p-8 lg:p-10">
              <div className="flex flex-col lg:flex-row lg:items-start gap-8">
                <div className="flex-1">
                  {/* Integrated Progress Section */}
                  <div className="bg-muted/40 rounded-xl p-5 border border-border mb-8">
                    <div className="flex justify-between items-end mb-2">
                      <div className="flex items-center gap-2">
                        <Activity className="w-5 h-5 text-slate-400" />
                        <span className="text-sm font-bold text-slate-700 uppercase tracking-wide">Progresso da Obra</span>
                      </div>
                      <span className="text-2xl font-bold text-slate-900">{executionPct}%</span>
                    </div>
                    
                    <Progress 
                      value={executionPct} 
                      className="h-4 bg-slate-200 rounded-full" 
                      indicatorClassName="bg-red-600 rounded-full" 
                    />
                  </div>

                 {work.long_description  && <div className="py-6 md:py-8">
                    <h3 className="text-lg font-bold text-foreground mb-4 flex items-center">
                      <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-50 to-violet-50 text-indigo-600 mr-3 shadow-sm border border-indigo-100/50">
                        <BookOpen className="w-4 h-4" />
                      </div>
                      Sobre a Obra
                    </h3>
                    <div className="prose prose-slate max-w-none text-muted-foreground leading-relaxed pl-1">
                      <p className="whitespace-pre-wrap">{work.long_description || work.description}</p>
                    </div>
                  </div>}
                </div>

                
              </div>

              {/* Details Sections */}
              <div className="space-y-8 mb-8">
                
                {/* 1. Execução e Responsáveis */}
                <div>
                   <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wide mb-3 flex items-center gap-2">
                     <Building className="w-4 h-4" /> Execução e Responsáveis
                   </h3>
                   <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 gap-4 lg:gap-6">
                     {displayContractor?.name && (
                      <div className="flex items-start gap-4 p-4 rounded-xl bg-card border border-border shadow-sm hover:shadow-md transition-shadow">
                          <div className="bg-red-50 text-red-500 w-10 h-10 rounded-lg flex items-center justify-center shrink-0">
                             <Building className="w-5 h-5" />
                          </div>
                          <div className="min-w-0">
                             <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Construtora</p>
                             <p className="text-sm font-bold text-slate-900 leading-tight break-words">{displayContractor.name}</p>
                          </div>
                       </div>
                     )}

                     {displayContractor?.cnpj && (
                      <div className="flex items-start gap-4 p-4 rounded-xl bg-card border border-border shadow-sm hover:shadow-md transition-shadow">
                          <div className="bg-red-50 text-red-500 w-10 h-10 rounded-lg flex items-center justify-center shrink-0">
                             <FileText className="w-5 h-5" />
                          </div>
                          <div className="min-w-0">
                             <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">CNPJ</p>
                             <p className="text-sm font-bold text-slate-900 leading-tight break-words">{formatCnpj(displayContractor.cnpj)}</p>
                          </div>
                       </div>
                     )}

                     {work.work_category?.name && (
                      <div className="flex items-start gap-4 p-4 rounded-xl bg-card border border-border shadow-sm hover:shadow-md transition-shadow">
                          <div className="bg-red-50 text-red-500 w-10 h-10 rounded-lg flex items-center justify-center shrink-0">
                             <Briefcase className="w-5 h-5" />
                          </div>
                          <div className="min-w-0">
                             <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Categoria</p>
                             <p className="text-sm font-bold text-slate-900 leading-tight break-words">{work.work_category.name}</p>
                          </div>
                       </div>
                     )}
                   </div>
                </div>

                {/* 3. Financeiro */}
                <div>
                   <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wide mb-3 flex items-center gap-2">
                     <DollarSign className="w-4 h-4" /> Financeiro
                   </h3>
                   <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 gap-4 lg:gap-6">
                     {Array.isArray(displayFundingSource) && displayFundingSource.length > 0 && (
                       <div className="flex items-start gap-4 p-4 rounded-xl bg-white border border-slate-100 shadow-sm hover:shadow-md transition-shadow">
                          <div className="bg-red-50 text-red-500 w-10 h-10 rounded-lg flex items-center justify-center shrink-0">
                             <Landmark className="w-5 h-5" />
                          </div>
                          <div className="min-w-0">
                             <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Fonte de Recurso</p>
                             <p className="text-sm font-bold text-slate-900 leading-tight break-words">
                               {displayFundingSource.map(source => source).join(', ')}
                             </p>
                          </div>
                       </div>
                     )}

                     {work.parliamentary_amendment?.has && (
                       <div className="flex items-start gap-4 p-4 rounded-xl bg-white border border-slate-100 shadow-sm hover:shadow-md transition-shadow">
                          <div className="bg-red-50 text-red-500 w-10 h-10 rounded-lg flex items-center justify-center shrink-0">
                             <User className="w-5 h-5" />
                          </div>
                          <div className="min-w-0">
                             <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Emenda Parlamentar</p>
                             <p className="text-sm font-bold text-slate-900 leading-tight break-words">{work.parliamentary_amendment.author}</p>
                          </div>
                       </div>
                     )}

                     {currentPhaseExpectedValue != null && (
                     <div className="flex items-start gap-4 p-4 rounded-xl bg-white border border-slate-100 shadow-sm hover:shadow-md transition-shadow">
                        <div className="bg-red-50 text-red-500 w-10 h-10 rounded-lg flex items-center justify-center shrink-0">
                           <DollarSign className="w-5 h-5" />
                        </div>
                        <div className="min-w-0">
                           <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Valor Previsto (Fase Atual)</p>
                           <p className="text-sm font-bold text-slate-900 leading-tight break-words">{formatCurrency(currentPhaseExpectedValue)}</p>
                        </div>
                     </div>
                     )}

                     {(currentPhaseSpentFromPayments > 0 || totalSpentFromPayments > 0) && (
                     <div className="flex items-start gap-4 p-4 rounded-xl bg-white border border-slate-100 shadow-sm hover:shadow-md transition-shadow sm:col-span-2 xl:col-span-1">
                        <div className="bg-emerald-50 text-emerald-500 w-10 h-10 rounded-lg flex items-center justify-center shrink-0">
                           <DollarSign className="w-5 h-5" />
                        </div>
                        <div className="w-full min-w-0">
                           <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Pago na Fase Atual</p>
                           <p className="text-sm font-bold text-slate-900 leading-tight mb-1 break-words">{formatCurrency(currentPhaseSpentFromPayments)}</p>
                           <Progress 
                             value={currentPhaseExpectedValue ? Math.min(((currentPhaseSpentFromPayments || 0) / (Number(currentPhaseExpectedValue) || 0)) * 100, 100) : 0} 
                             className="h-1.5 bg-slate-100 w-full" 
                             indicatorClassName="bg-emerald-500" 
                           />
                        </div>
                     </div>
                     )}

                     {totalSpentFromPayments > 0 && (
                     <div className="flex items-start gap-4 p-4 rounded-xl bg-white border border-slate-100 shadow-sm hover:shadow-md transition-shadow sm:col-span-2 xl:col-span-1">
                        <div className="bg-blue-50 text-blue-600 w-10 h-10 rounded-lg flex items-center justify-center shrink-0">
                           <DollarSign className="w-5 h-5" />
                        </div>
                        <div className="w-full min-w-0">
                           <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Total Pago (Todas as Fases)</p>
                           <p className="text-sm font-bold text-slate-900 leading-tight mb-1 break-words">{formatCurrency(totalSpentFromPayments)}</p>
                        </div>
                     </div>
                     )}
                   </div>
                </div>

                {/* 4. Prazos e Cronograma */}
                <div>
                   <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wide mb-3 flex items-center gap-2">
                     <Calendar className="w-4 h-4" /> Prazos e Cronograma
                   </h3>
                   <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 gap-4 lg:gap-6">
                     {displayExecutionPeriodDays && (
                       <div className="flex items-start gap-4 p-4 rounded-xl bg-white border border-slate-100 shadow-sm hover:shadow-md transition-shadow">
                          <div className="bg-red-50 text-red-500 w-10 h-10 rounded-lg flex items-center justify-center shrink-0">
                             <Clock className="w-5 h-5" />
                          </div>
                          <div className="min-w-0">
                             <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Prazo de Execução</p>
                             <p className="text-sm font-bold text-slate-900 leading-tight break-words">{displayExecutionPeriodDays} dias</p>
                          </div>
                       </div>
                     )}

                     {displayContractSignatureDate && (
                       <div className="flex items-start gap-4 p-4 rounded-xl bg-white border border-slate-100 shadow-sm hover:shadow-md transition-shadow">
                          <div className="bg-red-50 text-red-500 w-10 h-10 rounded-lg flex items-center justify-center shrink-0">
                             <Calendar className="w-5 h-5" />
                          </div>
                          <div className="min-w-0">
                             <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Assinatura</p>
                             <p className="text-sm font-bold text-slate-900 leading-tight break-words">{formatDate(displayContractSignatureDate)}</p>
                          </div>
                       </div>
                     )}

                     {displayServiceOrderDate && (
                       <div className="flex items-start gap-4 p-4 rounded-xl bg-white border border-slate-100 shadow-sm hover:shadow-md transition-shadow">
                          <div className="bg-red-50 text-red-500 w-10 h-10 rounded-lg flex items-center justify-center shrink-0">
                             <FileText className="w-5 h-5" />
                          </div>
                          <div className="min-w-0">
                             <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Ordem de Serviço</p>
                             <p className="text-sm font-bold text-slate-900 leading-tight break-words">{formatDate(displayServiceOrderDate)}</p>
                          </div>
                       </div>
                     )}
                     
                     {displayPredictedStartDate && (
                       <div className="flex items-start gap-4 p-4 rounded-xl bg-white border border-slate-100 shadow-sm hover:shadow-md transition-shadow">
                          <div className="bg-red-50 text-red-500 w-10 h-10 rounded-lg flex items-center justify-center shrink-0">
                             <Calendar className="w-5 h-5" />
                          </div>
                          <div className="min-w-0">
                             <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Previsão Início</p>
                             <p className="text-sm font-bold text-slate-900 leading-tight break-words">{formatDate(displayPredictedStartDate)}</p>
                          </div>
                       </div>
                     )}

                     {displayStartDate && (
                       <div className="flex items-start gap-4 p-4 rounded-xl bg-white border border-slate-100 shadow-sm hover:shadow-md transition-shadow">
                          <div className="bg-red-50 text-red-500 w-10 h-10 rounded-lg flex items-center justify-center shrink-0">
                             <CheckCircle className="w-5 h-5" />
                          </div>
                          <div className="min-w-0">
                             <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Início Real</p>
                             <p className="text-sm font-bold text-slate-900 leading-tight break-words">{formatDate(displayStartDate)}</p>
                          </div>
                       </div>
                     )}

                     {displayExpectedEndDate && (
                       <div className="flex items-start gap-4 p-4 rounded-xl bg-white border border-slate-100 shadow-sm hover:shadow-md transition-shadow">
                          <div className="bg-red-50 text-red-500 w-10 h-10 rounded-lg flex items-center justify-center shrink-0">
                             <Calendar className="w-5 h-5" />
                          </div>
                          <div className="min-w-0">
                             <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Previsão de Conclusão</p>
                             <p className="text-sm font-bold text-slate-900 leading-tight break-words">{formatDate(displayExpectedEndDate)}</p>
                          </div>
                       </div>
                     )}

                     {displayEndDate && (
                       <div className="flex items-start gap-4 p-4 rounded-xl bg-white border border-slate-100 shadow-sm hover:shadow-md transition-shadow">
                          <div className="bg-red-50 text-red-500 w-10 h-10 rounded-lg flex items-center justify-center shrink-0">
                             <CheckCircle className="w-5 h-5" />
                          </div>
                          <div className="min-w-0">
                             <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Término Real</p>
                             <p className="text-sm font-bold text-slate-900 leading-tight break-words">{formatDate(displayEndDate)}</p>
                          </div>
                       </div>
                     )}

                     {displayInaugurationDate && (
                       <div className="flex items-start gap-4 p-4 rounded-xl bg-white border border-slate-100 shadow-sm hover:shadow-md transition-shadow">
                          <div className="bg-red-50 text-red-500 w-10 h-10 rounded-lg flex items-center justify-center shrink-0">
                             <Award className="w-5 h-5" />
                          </div>
                          <div className="min-w-0">
                             <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Data de Inauguração</p>
                             <p className="text-sm font-bold text-slate-900 leading-tight break-words">{formatDate(displayInaugurationDate)}</p>
                          </div>
                       </div>
                     )}

                     {displayStalledDate && (
                       <div className="flex items-start gap-4 p-4 rounded-xl bg-white border border-slate-100 shadow-sm hover:shadow-md transition-shadow">
                          <div className="bg-red-50 text-red-500 w-10 h-10 rounded-lg flex items-center justify-center shrink-0">
                             <AlertTriangle className="w-5 h-5" />
                          </div>
                          <div className="min-w-0">
                             <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Data de Paralisação</p>
                             <p className="text-sm font-bold text-slate-900 leading-tight break-words">{formatDate(displayStalledDate)}</p>
                          </div>
                       </div>
                     )}

                   </div>
                </div>

              </div>



            </div>

            <Separator className="my-0" />

            {paymentsToShow.length > 0 && (
              <div className="p-6 md:p-8 bg-card border-t border-border">
                <div className="flex items-center justify-between gap-3 mb-4">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="h-3 w-1 rounded-full bg-blue-600" />
                    <div className="min-w-0 text-[14px] font-semibold uppercase tracking-wider text-slate-500 truncate">
                      Pagamentos{currentMeasurement?.title ? ` — ${currentMeasurement.title}` : ''}
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="hidden sm:block text-sm font-semibold text-slate-700 whitespace-nowrap">
                      Total: {formatCurrency(paymentsTotalFiltered || 0)}
                    </div>
                    {user?.is_admin ? (
                      <Button
                        variant="outline"
                        className="border-red-200 text-red-700 hover:bg-blue-50 w-full sm:w-auto"
                        onClick={openNewPaymentDialog}
                      >
                        <Plus className="w-4 h-4 mr-2" />
                        Adicionar pagamento
                      </Button>
                    ) : null}
                  </div>
                </div>

                <div className="mb-5 grid grid-cols-1 lg:grid-cols-12 gap-3 items-center">
                  <div className="lg:col-span-6">
                    <div className="relative">
                      <Search className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                      <Input
                        value={paymentsQuery}
                        onChange={(e) => setPaymentsQuery(e.target.value)}
                        placeholder="Buscar por descrição, empenho ou credor..."
                        className="bg-white pl-9"
                      />
                    </div>
                  </div>
                  <div className="lg:col-span-2">
                    <select
                      className="h-10 w-full rounded-md border border-input bg-white px-3 py-2 text-sm ring-offset-background"
                      value={paymentsYearFilter}
                      onChange={(e) => setPaymentsYearFilter(e.target.value)}
                    >
                      <option value="all">Todos os anos</option>
                      {paymentsYearOptions.map((y) => (
                        <option key={y} value={y}>
                          {y}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="lg:col-span-2">
                    <select
                      className="h-10 w-full rounded-md border border-input bg-white px-3 py-2 text-sm ring-offset-background"
                      value={paymentsCommitmentFilter}
                      onChange={(e) => setPaymentsCommitmentFilter(e.target.value)}
                    >
                      <option value="all">Todos os empenhos</option>
                      {paymentsCommitmentOptions.map((k) => (
                        <option key={k} value={k}>
                          {k === 'SEM_EMPENHO' ? 'Sem empenho' : k}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="lg:col-span-2 flex items-center gap-3 justify-between">
                    <div className="text-xs text-slate-500 whitespace-nowrap">{sortedPaymentGroups.length} registros</div>
                    {(paymentsQuery || paymentsYearFilter !== 'all' || paymentsCommitmentFilter !== 'all') ? (
                      <Button
                        type="button"
                        variant="ghost"
                        className="text-slate-500"
                        onClick={() => {
                          setPaymentsQuery('');
                          setPaymentsYearFilter('all');
                          setPaymentsCommitmentFilter('all');
                        }}
                      >
                        Limpar
                      </Button>
                    ) : null}
                  </div>
                </div>

                {sortedPaymentGroups.length > 0 ? (
                  <>
                    <div className="sm:hidden space-y-3">
                      {pagedPaymentGroups.map((group) => {
                        const isOpen = openPaymentGroupKeys.has(group.key);
                        const firstDateLabel = group.firstDate ? group.firstDate.toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : '-';
                        return (
                          <div key={group.key} className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
                            <button type="button" className="w-full text-left p-4" onClick={() => togglePaymentGroupOpen(group.key)}>
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <div className="flex items-center gap-2">
                                    <span className="inline-flex h-6 w-6 items-center justify-center text-slate-400 shrink-0">
                                      {isOpen ? <Minus className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
                                    </span>
                                    <div className="text-sm font-semibold text-slate-800 whitespace-normal break-words">
                                      {group.commitment_number || '-'}
                                    </div>
                                  </div>
                                  <div className="mt-1 text-xs text-slate-500">Data: {firstDateLabel}</div>
                                  <div className="mt-1 text-xs text-slate-500">Credor: {group.creditorLabel}</div>
                                  {!currentMeasurement?.id ? <div className="mt-1 text-xs text-slate-500">Fase: {group.phaseLabel}</div> : null}
                                </div>
                                <div className="text-right">
                                  <div className="text-xs text-slate-500">Total</div>
                                  <div className="text-sm font-extrabold text-slate-900 whitespace-nowrap">{formatCurrency(group.total)}</div>
                                  <div className="mt-1 text-xs text-slate-500">{group.count} pagamento{group.count === 1 ? '' : 's'}</div>
                                </div>
                              </div>
                            </button>
                            {isOpen ? (
                              <div className="border-t bg-slate-50/40 p-4 space-y-3">
                                {group.items.map((p) => (
                                  <div key={p.id} className="bg-white border border-slate-100 rounded-lg p-3">
                                    <div className="flex items-start justify-between gap-3">
                                      <div className="min-w-0">
                                        <div className="text-sm font-semibold text-blue-700 whitespace-normal break-words">
                                          {group.commitment_number || '-'} • {formatDate(p.payment_date)}
                                        </div>
                                        <div className="mt-1 text-sm text-slate-700 whitespace-normal break-words">{p.payment_description || '-'}</div>
                                        {p.installment ? (
                                          <div className="mt-2">
                                            <span className="px-2 py-1 rounded-md bg-slate-100 text-slate-600 text-[11px]">Parcela {p.installment}</span>
                                          </div>
                                        ) : null}
                                      </div>
                                      <div className="text-right shrink-0">
                                        <div className="text-sm font-extrabold text-slate-900 whitespace-nowrap">{formatCurrency(p.value)}</div>
                                        {p.portal_link ? (
                                          <a href={p.portal_link} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-700 underline underline-offset-2">
                                            Ver
                                          </a>
                                        ) : null}
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>

                    <div className="sm:hidden mt-4 flex flex-col gap-3">
                      <div className="text-xs text-slate-500">
                        Exibindo {(paymentsPageSafe - 1) * PAYMENTS_PAGE_SIZE + 1}–{Math.min(sortedPaymentGroups.length, paymentsPageSafe * PAYMENTS_PAGE_SIZE)} de {sortedPaymentGroups.length} registros
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <Button type="button" size="sm" variant="outline" disabled={paymentsPageSafe <= 1} onClick={() => setPaymentsPage((p) => Math.max(1, (Number(p) || 1) - 1))}>
                          ‹
                        </Button>
                        <div className="flex items-center gap-1">
                          {paymentsPageNumbers.map((n) => (
                            <Button
                              key={n}
                              type="button"
                              size="sm"
                              variant={n === paymentsPageSafe ? "default" : "outline"}
                              className={n === paymentsPageSafe ? "bg-blue-600 hover:bg-blue-600" : ""}
                              onClick={() => setPaymentsPage(n)}
                            >
                              {n}
                            </Button>
                          ))}
                        </div>
                        <Button type="button" size="sm" variant="outline" disabled={paymentsPageSafe >= paymentsTotalPages} onClick={() => setPaymentsPage((p) => Math.min(paymentsTotalPages, (Number(p) || 1) + 1))}>
                          ›
                        </Button>
                      </div>
                    </div>

                    <div className="hidden sm:block overflow-x-auto -mx-4 sm:mx-0">
                      <div className="inline-block min-w-full align-middle px-4 sm:px-0">
                        <div className="border rounded-xl bg-white">
                          <table className="w-full text-sm table-auto">
                            <thead className="text-center border-b bg-slate-50/50 text-slate-400 text-[10px] uppercase">
                              <tr>
                                <th className="hidden sm:table-cell px-3 py-2 font-bold text-left">
                                  <button type="button" className="inline-flex items-center gap-1" onClick={() => toggleSort('commitment_number')}>
                                    Nº Empenho <span>{sortIndicator('commitment_number')}</span>
                                  </button>
                                </th>
                                <th className="px-3 py-2 font-bold text-left">
                                  <button type="button" className="inline-flex items-center gap-1" onClick={() => toggleSort('payment_date')}>
                                    Data <span>{sortIndicator('payment_date')}</span>
                                  </button>
                                </th>
                                <th className="hidden md:table-cell text-left px-3 py-2 font-bold">
                                  Descrição
                                </th>
                                <th className="hidden md:table-cell text-left px-3 py-2 font-bold">Parcela</th>
                                <th className="hidden xl:table-cell px-3 py-2 font-bold text-left">
                                  <button type="button" className="inline-flex items-center gap-1" onClick={() => toggleSort('creditor_name')}>
                                    Credor <span>{sortIndicator('creditor_name')}</span>
                                  </button>
                                </th>
                                <th className="px-3 py-2 font-bold text-right">
                                  <button type="button" className="inline-flex items-center gap-1" onClick={() => toggleSort('value')}>
                                    Valor <span>{sortIndicator('value')}</span>
                                  </button>
                                </th>
                                <th className="px-3 py-2 font-bold text-center">
                                  <button type="button" className="inline-flex items-center gap-1" onClick={() => toggleSort('portal_link')}>
                                    Fonte <span>{sortIndicator('portal_link')}</span>
                                  </button>
                                </th>
                              </tr>
                            </thead>
                            <tbody className="divide-y text-xs">
                              {pagedPaymentGroups.map((group) => {
                                const isOpen = openPaymentGroupKeys.has(group.key);
                                return (
                                  <React.Fragment key={group.key}>
                                    <tr className="hover:bg-slate-50/50 transition-colors cursor-pointer" onClick={() => togglePaymentGroupOpen(group.key)}>
                                      <td className="hidden sm:table-cell px-3 py-2 text-slate-600">
                                        <div className="flex items-center gap-2">
                                          <span className="inline-flex h-6 w-6 items-center justify-center text-slate-400">
                                            {isOpen ? <Minus className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
                                          </span>
                                          <span className="font-semibold text-slate-800">{group.commitment_number || 'Não informado'}</span>
                                        </div>
                                      </td>
                                      <td className="px-3 py-2 align-center">
                                        <div className="whitespace-nowrap font-medium text-slate-700">
                                          {group.firstDate ? group.firstDate.toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : '-'}
                                        </div>
                                      </td>
                                      <td className="hidden md:table-cell px-3 py-2 text-slate-600 whitespace-normal break-words">
                                        <div className="whitespace-normal break-words">
                                          {group.items?.[0]?.payment_description || '-'}
                                          {group.count > 1 ? <span className="text-slate-400"> (+{group.count - 1})</span> : null}
                                        </div>
                                      </td>
                                      <td className="hidden md:table-cell px-3 py-2 text-slate-600 whitespace-nowrap">
                                        {group.count === 1 ? (group.items?.[0]?.installment || '-') : '-'}
                                      </td>
                                      <td className="hidden xl:table-cell px-3 py-2 text-slate-600 whitespace-normal break-words">{group.creditorLabel}</td>
                                      <td className="px-3 py-2 align-center font-bold text-slate-900 text-right whitespace-nowrap">{formatCurrency(group.total)}</td>
                                      <td className="px-3 py-2 align-top text-center">
                                        {group.count === 1 && group.items?.[0]?.portal_link ? (
                                          <Button asChild size="sm" variant="ghost" className="text-blue-700 hover:bg-blue-50">
                                            <a href={group.items[0].portal_link} target="_blank" rel="noopener noreferrer">
                                              Ver
                                            </a>
                                          </Button>
                                        ) : (
                                          <span className="text-slate-300">-</span>
                                        )}
                                      </td>
                                    </tr>
                                    {isOpen ? (
                                      <tr>
                                        <td colSpan={7} className="px-3 py-3 bg-slate-50/40">
                                          <div className="text-xs text-slate-500 mb-2">
                                            {group.count} pagamento{group.count === 1 ? '' : 's'} neste empenho
                                          </div>
                                          <div className="overflow-x-auto border rounded-lg bg-white">
                                            <table className="w-full text-xs">
                                              <thead className="bg-slate-50 text-slate-500">
                                                <tr>
                                                  <th className="text-left px-3 py-2">Nº Empenho</th>
                                                  <th className="text-left px-3 py-2">Data</th>
                                                  <th className="text-left px-3 py-2">Descrição</th>
                                                  <th className="text-left px-3 py-2">Parcela</th>
                                                  <th className="text-left px-3 py-2">Credor</th>
                                                  <th className="text-right px-3 py-2">Valor</th>
                                                  <th className="text-center px-3 py-2">Portal</th>
                                                </tr>
                                              </thead>
                                              <tbody className="divide-y">
                                                {group.items.map((p) => (
                                                  <tr key={p.id} className="hover:bg-slate-50/60">
                                                    <td className="px-3 py-2 whitespace-nowrap">{p.commitment_number || p.banking_order || '-'}</td>
                                                    <td className="px-3 py-2 whitespace-nowrap">{formatDate(p.payment_date)}</td>
                                                    <td className="px-3 py-2 whitespace-normal break-words">{p.payment_description || '-'}</td>
                                                    <td className="px-3 py-2 whitespace-nowrap">{p.installment || '-'}</td>
                                                    <td className="px-3 py-2 whitespace-normal break-words">{p.creditor_name || '-'}</td>
                                                    <td className="px-3 py-2 text-right font-semibold text-slate-900 whitespace-nowrap">{formatCurrency(p.value)}</td>
                                                    <td className="px-3 py-2 text-center">
                                                      {p.portal_link ? (
                                                        <Button asChild size="sm" variant="ghost" className="text-blue-700 hover:bg-blue-50">
                                                          <a href={p.portal_link} target="_blank" rel="noopener noreferrer">
                                                            Ver
                                                          </a>
                                                        </Button>
                                                      ) : (
                                                        <span className="text-slate-300">-</span>
                                                      )}
                                                    </td>
                                                  </tr>
                                                ))}
                                              </tbody>
                                            </table>
                                          </div>
                                        </td>
                                      </tr>
                                    ) : null}
                                  </React.Fragment>
                                );
                              })}
                            </tbody>
                            <tfoot className="border-t bg-slate-50/50">
                              <tr>
                                <td className="px-3 py-2 font-bold text-slate-600" colSpan={6}>
                                  Somatório
                                </td>
                                <td className="px-3 py-2 font-extrabold text-slate-900 text-right whitespace-nowrap">{formatCurrency(paymentsTotalFiltered || 0)}</td>
                              </tr>
                            </tfoot>
                          </table>
                        </div>
                      </div>
                    </div>

                    <div className="hidden sm:flex items-center justify-between gap-3 mt-4">
                      <div className="text-xs text-slate-500">
                        Exibindo {(paymentsPageSafe - 1) * PAYMENTS_PAGE_SIZE + 1}–{Math.min(sortedPaymentGroups.length, paymentsPageSafe * PAYMENTS_PAGE_SIZE)} de {sortedPaymentGroups.length} registros
                      </div>
                      <div className="flex items-center gap-2">
                        <Button type="button" size="sm" variant="outline" disabled={paymentsPageSafe <= 1} onClick={() => setPaymentsPage((p) => Math.max(1, (Number(p) || 1) - 1))}>
                          ‹
                        </Button>
                        <div className="flex items-center gap-1">
                          {paymentsPageNumbers.map((n) => (
                            <Button
                              key={n}
                              type="button"
                              size="sm"
                              variant={n === paymentsPageSafe ? "default" : "outline"}
                              className={n === paymentsPageSafe ? "bg-blue-600 hover:bg-blue-600" : ""}
                              onClick={() => setPaymentsPage(n)}
                            >
                              {n}
                            </Button>
                          ))}
                        </div>
                        <Button type="button" size="sm" variant="outline" disabled={paymentsPageSafe >= paymentsTotalPages} onClick={() => setPaymentsPage((p) => Math.min(paymentsTotalPages, (Number(p) || 1) + 1))}>
                          ›
                        </Button>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="text-center py-10 bg-white rounded-xl border border-dashed border-slate-200">
                    <p className="text-sm text-slate-400">Nenhum pagamento encontrado.</p>
                    {user?.is_admin && (
                      <div className="mt-4">
                        <Button variant="outline" className="bg-white" onClick={openNewPaymentDialog}>
                          <DollarSign className="w-4 h-4 mr-2" />
                          Adicionar primeiro pagamento
                        </Button>
                      </div>
                    )}
                  </div>
                )}

                <Dialog open={showPaymentDialog} onOpenChange={setShowPaymentDialog}>
                  <DialogContent className="sm:max-w-[650px] max-h-[calc(100vh-2rem)] max-h-[calc(100dvh-2rem)] overflow-hidden flex flex-col">
                    <DialogHeader>
                      <DialogTitle>Novo pagamento</DialogTitle>
                    </DialogHeader>

                    <div className="flex-1 overflow-y-auto pr-1">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="grid gap-2">
                          <Label>Fase</Label>
                          <select
                            className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background"
                            value={paymentForm.measurement_id}
                            onChange={(e) => {
                              const nextMeasurementId = e.target.value;
                              const nextMeasurement = measurements.find((m) => m.id === nextMeasurementId) || null;
                              setPaymentForm((prev) => ({
                                ...prev,
                                measurement_id: nextMeasurementId,
                                creditor_name: prev.creditor_name ? prev.creditor_name : (nextMeasurement?.contractor?.name || '')
                              }));
                            }}
                          >
                            {measurements.map((m) => (
                              <option key={m.id} value={m.id}>{m.title}</option>
                            ))}
                          </select>
                        </div>

                        <div className="grid gap-2">
                          <Label>Data</Label>
                          <Input
                            type="date"
                            value={paymentForm.payment_date}
                            onChange={(e) => setPaymentForm((prev) => ({ ...prev, payment_date: e.target.value }))}
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
                        <div className="grid gap-2">
                          <Label>Número de empenho</Label>
                          <Input
                            value={paymentForm.commitment_number}
                            onChange={(e) => setPaymentForm((prev) => ({ ...prev, commitment_number: e.target.value }))}
                          />
                        </div>
                        <div className="grid gap-2">
                          <Label>Tipo de empenho</Label>
                          <select
                            className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background"
                            value={paymentForm.commitment_type}
                            onChange={(e) => setPaymentForm((prev) => ({ ...prev, commitment_type: e.target.value }))}
                          >
                            <option value="">Selecione</option>
                            {commitmentTypeOptions.map((opt) => (
                              <option key={opt} value={opt}>
                                {opt}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
                        <div className="grid gap-2">
                          <Label>Parcela</Label>
                          <Input
                            placeholder="Ex.: 1/3"
                            value={paymentForm.installment}
                            onChange={(e) => setPaymentForm((prev) => ({ ...prev, installment: e.target.value }))}
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
                        <div className="grid gap-2">
                          <Label>Credor</Label>
                          <Input
                            value={paymentForm.creditor_name}
                            onChange={(e) => setPaymentForm((prev) => ({ ...prev, creditor_name: e.target.value }))}
                          />
                        </div>
                        <div className="grid gap-2">
                          <Label>Valor (R$)</Label>
                          <Input
                            type="number"
                            step="0.01"
                            placeholder="0,00"
                            value={paymentForm.value}
                            onChange={(e) => setPaymentForm((prev) => ({ ...prev, value: e.target.value }))}
                          />
                        </div>
                      </div>

                      <div className="grid gap-2 mt-4">
                        <Label>Descrição do pagamento</Label>
                        <Textarea
                          value={paymentForm.payment_description}
                          onChange={(e) => setPaymentForm((prev) => ({ ...prev, payment_description: e.target.value }))}
                        />
                      </div>

                      <div className="grid gap-2 mt-4">
                        <Label>Link do portal (opcional)</Label>
                        <Input
                          placeholder="https://..."
                          value={paymentForm.portal_link}
                          onChange={(e) => setPaymentForm((prev) => ({ ...prev, portal_link: e.target.value }))}
                        />
                      </div>
                    </div>

                    <DialogFooter className="mt-4 shrink-0 pt-4 border-t bg-background">
                      <DialogClose asChild>
                        <Button variant="outline" disabled={isSavingPayment}>Cancelar</Button>
                      </DialogClose>
                      <Button onClick={handleSavePayment} disabled={isSavingPayment}>
                        Salvar pagamento
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
            )}

            <Separator className="my-0" />

            {/* Galeria e Documentos */}
            <div className="p-6 md:p-8">
              <h3 className="text-lg font-bold text-foreground mb-6 flex items-center gap-2">
                 <ImageIcon className="w-5 h-5 text-red-500" />
                 Galeria e Documentos
              </h3>
              
              {/* Grouped Galleries */}
              {(() => {
                const groups = {};
                // Group media by gallery_name
                currentPhaseMedia.forEach(item => {
                  if (!['image', 'photo', 'video', 'video_url'].includes(item.type)) return;
                  const name = item.gallery_name || currentMeasurement?.title || 'Galeria';
                  if (!groups[name]) groups[name] = [];
                  groups[name].push(item);
                });

                const sortedNames = Object.keys(groups).sort((a, b) => a.localeCompare(b));

                if (sortedNames.length === 0 && (!currentPhaseDocuments || currentPhaseDocuments.length === 0)) {
                  return (
                    <div className="py-12 text-center border-2 border-dashed border-border rounded-xl bg-muted/30">
                       <div className="w-12 h-12 bg-muted rounded-full flex items-center justify-center mx-auto mb-3">
                          <ImageIcon className="w-6 h-6 text-slate-300" />
                       </div>
                       <p className="text-sm text-slate-500 font-medium">Nenhuma mídia disponível</p>
                       <p className="text-xs text-slate-400 mt-1">As fotos e vídeos desta obra aparecerão aqui.</p>
                    </div>
                  );
                }

                return sortedNames.map(name => {
                  const items = groups[name];
                  const hasMore = items.length > 4;
                  const displayItems = hasMore ? items.slice(0, 4) : items;

                  return (
                    <div key={name} className="mb-10">
                      <h4 className="text-sm font-bold text-blue-950 mb-4 flex items-center gap-2 uppercase tracking-wide">
                        <FolderOpen className="w-4 h-4 text-blue-900" />
                        {name}
                      </h4>
                      
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                        {displayItems.map((item, idx) => (
                          <div 
                            key={item.id} 
                            className="group cursor-pointer"
                            onClick={() => openViewer(items, idx)}
                          >
                            <div className="aspect-[4/3] rounded-xl overflow-hidden mb-2 relative bg-muted shadow-sm border border-border">
                              {['video', 'video_url'].includes(item.type) ? (
                                 <div className="w-full h-full flex items-center justify-center bg-slate-900">
                                    <Video className="w-10 h-10 text-white/80 group-hover:scale-110 transition-transform" />
                                 </div>
                              ) : (
                                <img 
                                  src={item.url} 
                                  alt={item.description || 'Foto da obra'} 
                                  className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                                  loading="lazy"
                                />
                              )}
                              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors" />
                            </div>
                            <p className="text-xs text-blue-600 font-semibold pl-1">
                              {item.created_at ? formatDate(item.created_at) : 'Data não informada'}
                            </p>
                          </div>
                        ))}
                        
                        {/* Folder Idea for "Many Images" */}
                        {hasMore && (
                          <div 
                            className="aspect-[4/3] rounded-xl bg-blue-50 border-2 border-dashed border-blue-200 flex flex-col items-center justify-center cursor-pointer hover:bg-blue-100 transition-colors group"
                            onClick={() => openViewer(items, 4)}
                          >
                             <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center mb-2 group-hover:bg-blue-200 transition-colors">
                                <FolderOpen className="w-5 h-5 text-blue-600" />
                             </div>
                             <span className="text-sm font-bold text-blue-700">Ver todas</span>
                             <span className="text-xs text-blue-500 font-medium">+{items.length - 4} fotos</span>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                });
              })()}

               {/* Documentos */}
               {currentPhaseDocuments && currentPhaseDocuments.length > 0 && (
                <div>
                  <h4 className="text-base font-semibold text-foreground mb-4 flex items-center gap-2 uppercase tracking-wide text-xs">
                    <FileText className="w-4 h-4 text-muted-foreground" /> Documentos
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {currentPhaseDocuments.map((doc) => (
                      <a 
                        key={doc.id}
                        href={doc.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center p-3 rounded-xl border border-border hover:border-red-200 hover:bg-red-50/30 transition-all group"
                      >
                        <div className="w-10 h-10 rounded-lg bg-red-50 flex items-center justify-center text-red-500 mr-3 shrink-0 group-hover:bg-red-100 transition-colors">
                          <FileText className="w-5 h-5" />
                        </div>
                        <div className="overflow-hidden">
                          <p className="text-sm font-medium text-foreground truncate group-hover:text-red-700 transition-colors">
                            {doc.title || doc.name || 'Documento sem título'}
                          </p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {doc.created_at ? formatDate(doc.created_at) : 'Data não informada'}
                          </p>
                        </div>
                        <ArrowUpRight className="w-4 h-4 text-muted-foreground/60 ml-auto group-hover:text-red-400 transition-colors" />
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <Separator className="my-0" />

            <div className="p-6 md:p-8">
              <h3 className="text-lg font-bold text-foreground mb-6 flex items-center">
                <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-gradient-to-br from-blue-50 to-cyan-50 text-blue-600 mr-3 shadow-sm border border-blue-100/50">
                  <Activity className="w-4 h-4" />
                </div>
                Histórico de Licitações
              </h3>

              <div className="relative pl-4 sm:pl-6 space-y-8 before:absolute before:left-4 sm:before:left-6 before:h-full before:w-[2px] before:bg-slate-100">
                {measurements.length > 0 ? (
                  measurements.map((item) => {
                    const phaseMedia = viewableMedia.filter(m => m.measurement_id === item.id);
                    const phaseDocs = media.filter(m => m.measurement_id === item.id && (m.type === 'pdf' || m.type === 'document' || m.type === 'file'));
                    return (
                      <div key={item.id} className="relative pl-8">
                        <div className={`absolute -left-[7px] top-1.5 w-4 h-4 rounded-full border-2 border-white shadow-sm ${getStatusInfo(item.status).bg.replace('bg-', 'bg-')}`} />
                        <div className="bg-muted/30 p-5 rounded-xl border transition-colors border-border hover:border-slate-300">
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
                            <div className="flex items-center gap-2">
                              <h4 className="font-bold text-base text-slate-800">
                                {item.title}
                              </h4>
                            </div>
                          </div>
                          
                          {item.description && (
                            <p className="text-slate-600 mb-4 text-sm leading-relaxed">{item.description}</p>
                          )}
                          
                          {item.contractor && (
                            <div className="flex items-center gap-2 mb-4 text-sm text-slate-700 bg-white/60 p-2.5 rounded-lg border border-slate-200/60">
                              <Briefcase className="w-4 h-4 text-slate-400 flex-shrink-0" />
                              <span className="font-semibold text-xs uppercase tracking-wider text-slate-500 whitespace-nowrap">Construtora:</span>
                              <span className="font-medium truncate">{item.contractor.name}</span>
                            </div>
                          )}
                          
                          <div className="grid grid-cols-2 gap-4 mb-4">
                            <div className="col-span-2 sm:col-span-1">
                              <span className="text-xs text-slate-400 block mb-1">Status</span>
                              <Badge variant="outline" className={`${getStatusInfo(item.status).color} ${getStatusInfo(item.status).bg} border-none`}>
                                {getStatusInfo(item.status).text}
                              </Badge>
                            </div>

                            {item.execution_percentage != null && (
                              <div className="col-span-2 sm:col-span-1">
                                <span className="text-xs text-slate-400 block mb-1">Execução</span>
                                <span className="text-sm font-semibold text-slate-700">
                                  {`${item.execution_percentage}%`}
                                </span>
                              </div>
                            )}
                          </div>

                          <div className="mb-4 pt-3 border-t border-slate-200/60 text-xs space-y-3">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                              {item.start_date && (
                                <div>
                                  <span className="text-slate-400 font-medium mb-1 block">Início</span>
                                  <span className="text-slate-700 font-medium text-sm">{formatDate(item.start_date)}</span>
                                </div>
                              )}
                              {item.end_date && (
                                <div>
                                  <span className="text-slate-400 font-medium mb-1 block">Término</span>
                                  <span className="text-slate-700 font-medium text-sm">{formatDate(item.end_date)}</span>
                                </div>
                              )}
                              {item.predicted_start_date && (
                                <div>
                                  <span className="text-slate-400 font-medium mb-1 block">Previsão Início</span>
                                  <span className="text-slate-700 font-medium text-sm">{formatDate(item.predicted_start_date)}</span>
                                </div>
                              )}
                              {item.expected_end_date && (
                                <div>
                                  <span className="text-slate-400 font-medium mb-1 block">Previsão Conclusão</span>
                                  <span className="text-slate-700 font-medium text-sm">{formatDate(item.expected_end_date)}</span>
                                </div>
                              )}
                            </div>
                          </div>

                          <Button 
                            variant="outline" 
                            size="sm" 
                            className="w-full bg-white hover:bg-slate-50 hover:text-red-800 text-red-600 border-slate-200 h-auto py-2 whitespace-normal text-left justify-center sm:justify-start"
                            onClick={() => setSelectedMeasurement({...item, media: phaseMedia, docs: phaseDocs})}
                          >
                            <Eye className="w-4 h-4 mr-2 flex-shrink-0" />
                            Ver Detalhes e Arquivos
                          </Button>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <p className="text-slate-500 text-center py-8">Nenhuma atividade registrada.</p>
                )}
              </div>
            </div>

            <Separator className="my-0" />

            {/* Contribution CTA */}
            <div className="hidden lg:block p-6 md:p-8 bg-muted/30 border-t border-border">
              <div className="text-center max-w-2xl mx-auto">
                <div className="w-12 h-12 bg-card rounded-full flex items-center justify-center mx-auto mb-4 shadow-sm border border-border">
                  <UploadCloud className="w-6 h-6 text-red-600" />
                </div>
                <h2 className="text-xl font-bold text-foreground mb-2">Tem informações sobre esta obra?</h2>
                <p className="text-muted-foreground mb-6 text-sm">
                  Ajude-nos a manter os dados atualizados enviando fotos, vídeos ou relatórios.
                </p>
                <Button onClick={handleOpenContrib} className="bg-red-600 hover:bg-red-700 text-white px-8 font-medium shadow-md shadow-red-100">
                  <UploadCloud className="w-4 h-4 mr-2" />
                  Enviar Contribuição
                </Button>
      
            </div>
              <div className="hidden lg:block text-center max-w-2xl mx-auto mb-12 mt-6">
           <p className="text-xs text-muted-foreground leading-relaxed">
             Os dados são provenientes de portais de transparência e verificados pela equipe. 
             Podem haver divergências temporais.
             <button onClick={() => setShowReportDialog(true)} className="ml-1 text-muted-foreground underline hover:text-foreground">
               Reportar erro
             </button>
           </p>
        </div>
                    </div>
               {/* Disclaimer */}
      
            </div>

          </div>

          {/* Sidebar Column (LG+) */}
          <div className="hidden lg:block lg:col-span-1 space-y-6">
            <div className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden">
              <div className="p-4 border-b border-border">
                <h3 className="font-bold text-foreground flex items-center">
                  <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-gradient-to-br from-red-50 to-orange-50 text-red-600 mr-3 shadow-sm border border-red-100/50">
                    <MapPin className="w-4 h-4" />
                  </div>
                  Localização
                </h3>
              </div>
              <div className="h-64">
                <WorkMap location={work.location} bairro={work.bairro?.name} />
              </div>
              
              <div className="px-4 py-4 bg-muted/30 space-y-3">
                 <div className="flex items-start gap-3">
                    <MapPin className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
                    <div>
                       <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">Endereço</span>
                       <p className="text-sm font-medium text-foreground leading-tight">{work.address || 'Não informado'}</p>
                    </div>
                 </div>
                 
                 {work.bairro && (
                   <div className="flex items-start gap-3 pt-3 border-t border-border">
                      <Home className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
                      <div>
                         <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">Bairro</span>
                         <p className="text-sm font-medium text-foreground leading-tight">{work.bairro.name}</p>
                      </div>
                   </div>
                 )}
              </div>
            </div>

            {Array.isArray(work.related_links) && work.related_links.length > 0 && (
              <div className="bg-card rounded-2xl border border-border shadow-sm p-6">
                <h3 className="font-bold text-foreground mb-4 flex items-center">
                  <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-gradient-to-br from-sky-50 to-blue-50 text-sky-600 mr-3 shadow-sm border border-sky-100/50">
                    <Link2 className="w-4 h-4" />
                  </div>
                  Links Relacionados
                </h3>
                <div className="space-y-2">
                  {work.related_links.map((link, idx) => (
                    <a 
                      key={idx} 
                      href={link.url} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="flex items-start justify-between p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors group"
                    >
                      <span className="text-sm font-medium text-foreground break-words leading-snug">{link.title}</span>
                      <ArrowUpRight className="w-4 h-4 text-muted-foreground group-hover:text-primary" />
                    </a>
                  ))}
                </div>
              </div>
            )}

            

            </div>
          {/* Sidebar Column (Mobile/Tablet Only) */}
          <div className="lg:hidden space-y-6">
            
            
            {/* Map Card */}
            <div className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden">
              <div className="p-4 border-b border-border">
                <h3 className="font-bold text-foreground flex items-center">
                  <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-gradient-to-br from-red-50 to-orange-50 text-red-600 mr-3 shadow-sm border border-red-100/50">
                    <MapPin className="w-4 h-4" />
                  </div>
                  Localização
                </h3>
              </div>
              <div className="h-64">
                <WorkMap location={work.location} bairro={work.bairro?.name} />
              </div>
              
              <div className="px-4 py-4 bg-muted/30 space-y-3">
                 <div className="flex items-start gap-3">
                    <MapPin className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
                    <div>
                       <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">Endereço</span>
                       <p className="text-sm font-medium text-foreground leading-tight">{work.address || 'Não informado'}</p>
                    </div>
                 </div>
                 
                 {work.bairro && (
                   <div className="flex items-start gap-3 pt-3 border-t border-border">
                      <Home className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
                      <div>
                         <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">Bairro</span>
                         <p className="text-sm font-medium text-foreground leading-tight">{work.bairro.name}</p>
                      </div>
                   </div>
                 )}
              </div>
             </div>

            {/* Technical Details Card (Redundant info removed) */}
            {/* Kept minimal or removed if all info is now in main grid */}
            
            {/* Links */}
            {Array.isArray(work.related_links) && work.related_links.length > 0 && (
              <div className="bg-card rounded-2xl border border-border shadow-sm p-6">
                <h3 className="font-bold text-foreground mb-4 flex items-center">
                  <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-gradient-to-br from-sky-50 to-blue-50 text-sky-600 mr-3 shadow-sm border border-sky-100/50">
                    <Link2 className="w-4 h-4" />
                  </div>
                  Links Relacionados
                </h3>
                <div className="space-y-2">
                  {work.related_links.map((link, idx) => (
                    <a 
                      key={idx} 
                      href={link.url} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="flex items-start justify-between p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors group"
                    >
                      <span className="text-sm font-medium text-foreground break-words leading-snug">{link.title}</span>
                      <ArrowUpRight className="w-4 h-4 text-muted-foreground group-hover:text-primary" />
                    </a>
                  ))}
                </div>
              </div>
            )}

            

            {/* Mobile Contribution CTA & Disclaimer */}
            <div className="lg:hidden space-y-6 pt-4">
              <div className="bg-card rounded-2xl border border-border shadow-sm p-6 text-center">
                <div className="w-12 h-12 bg-muted/30 rounded-full flex items-center justify-center mx-auto mb-4 border border-border">
                  <UploadCloud className="w-6 h-6 text-red-600" />
                </div>
                <h2 className="text-lg font-bold text-foreground mb-2">Tem informações?</h2>
                <p className="text-muted-foreground mb-6 text-sm">
                  Ajude a manter os dados atualizados enviando fotos ou relatórios.
                </p>
                <Button onClick={handleOpenContrib} className="w-full bg-red-600 hover:bg-red-700 text-white font-medium shadow-md shadow-red-100">
                  <UploadCloud className="w-4 h-4 mr-2" />
                  Contribuir
                </Button>
              </div>

              <div className="text-center px-4 pb-8">
                 <p className="text-xs text-muted-foreground leading-relaxed">
                   Os dados são verificados pela equipe. Podem haver divergências.
                   <button onClick={() => setShowReportDialog(true)} className="ml-1 text-muted-foreground underline hover:text-foreground">
                     Reportar erro
                   </button>
                 </p>
                 {lastUpdatedAt ? (
                   <div className="mt-4 text-sm font-semibold text-muted-foreground lg:hidden">
                     Última atualização: {formatDate(lastUpdatedAt)}
                   </div>
                 ) : null}
              </div>
            </div>

          </div>
        </div>
        
       

      </div>

      {viewerState.isOpen && (
        <MediaViewer 
          onClose={closeViewer} 
          media={viewerState.items} 
          startIndex={viewerState.startIndex} 
        />
      )}

      {/* Report Error Dialog */}
      <Dialog open={showReportDialog} onOpenChange={setShowReportDialog}>
        <DialogContent className="sm:max-w-md bg-white">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold text-neutral-800 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-500" />
              Informar Erro ou Inconsistência
            </DialogTitle>
            <p className="text-sm text-neutral-500">
              Ajude-nos a manter os dados corretos. Se você identificou algum erro nesta obra, por favor nos avise.
            </p>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <div className="bg-amber-50 p-4 rounded-lg border border-amber-100 text-amber-800 text-sm">
              <p>Ao clicar no botão abaixo, seu gerenciador de e-mail será aberto com as informações da obra já preenchidas.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowReportDialog(false)}>Cancelar</Button>
            <Button asChild className="bg-neutral-900 text-white hover:bg-neutral-800">
              <a 
                href={`mailto:contato@trombonecidadao.com.br?subject=Erro na Obra: ${encodeURIComponent(work.title)}&body=Olá, gostaria de informar um erro na obra "${work.title}" (ID: ${work.id}).%0D%0A%0D%0ADetalhes do erro:%0D%0A`}
              >
                Enviar E-mail
              </a>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showContribDialog} onOpenChange={setShowContribDialog}>
        <DialogContent className="sm:max-w-lg bg-white">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold text-slate-800">Contribuir com esta obra</DialogTitle>
            <p className="text-sm text-slate-500">Ajude a monitorar o progresso enviando fotos ou informações.</p>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="contrib_description">Descrição</Label>
              <Textarea 
                id="contrib_description" 
                value={contribDescription} 
                onChange={(e) => setContribDescription(e.target.value)} 
                placeholder="O que você observou? (ex: 'Fundações concluídas')" 
                rows={3} 
                className="resize-none"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="contrib_files">Fotos/Vídeos</Label>
              <div className="border-2 border-dashed border-slate-200 rounded-lg p-6 text-center hover:bg-slate-50 transition-colors cursor-pointer" onClick={() => fileInputRef.current?.click()}>
                <UploadCloud className="w-8 h-8 text-slate-400 mx-auto mb-2" />
                <p className="text-sm text-slate-600">Clique para selecionar arquivos</p>
                <Input 
                  id="contrib_files" 
                  ref={fileInputRef} 
                  type="file" 
                  accept="image/*,video/*,application/pdf" 
                  multiple 
                  className="hidden" 
                  onChange={handleContribFilesChange} 
                />
              </div>
              {contribFiles.length > 0 && (
                <p className="text-xs font-medium text-green-600">{contribFiles.length} arquivo(s) selecionado(s)</p>
              )}
            </div>
            <div className="grid gap-2">
              <Label htmlFor="contrib_video">Link de Vídeo (Opcional)</Label>
              <Input 
                id="contrib_video" 
                placeholder="https://youtube.com/..." 
                value={contribVideoUrl} 
                onChange={(e) => setContribVideoUrl(e.target.value)} 
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button type="button" variant="ghost" onClick={() => setShowContribDialog(false)} disabled={isSubmittingContribution}>Cancelar</Button>
            <Button type="button" onClick={handleSubmitContribution} disabled={isSubmittingContribution} className="bg-primary text-white hover:bg-primary/90">
              {isSubmittingContribution ? 'Enviando...' : 'Enviar Contribuição'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Measurement Details Dialog */}
      <Dialog open={!!selectedMeasurement && !viewerState.isOpen} onOpenChange={(open) => !open && setSelectedMeasurement(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto bg-white">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold text-slate-800 flex items-center gap-2">
              <Briefcase className="w-5 h-5 text-primary" />
              {selectedMeasurement?.title}
              {selectedMeasurement?.contractor?.name ? ` — Empresa responsável: ${selectedMeasurement.contractor.name}` : ''}
            </DialogTitle>
            <div className="flex flex-wrap gap-2 mt-2">
              <Badge variant="outline" className={`${selectedMeasurement ? getStatusInfo(selectedMeasurement.status).color : ''} ${selectedMeasurement ? getStatusInfo(selectedMeasurement.status).bg : ''} border-none`}>
                {selectedMeasurement ? getStatusInfo(selectedMeasurement.status).text : ''}
              </Badge>
            
             
            </div>
          </DialogHeader>
          
          <div className="space-y-6 py-4">
            {/* Description */}
            {selectedMeasurement?.description && (
              <div className="bg-slate-50 p-4 rounded-lg border border-slate-100">
                <h4 className="text-sm font-semibold text-slate-700 mb-2">Descrição da Fase</h4>
                <p className="text-slate-600 text-sm leading-relaxed">
                  {selectedMeasurement.description}
                </p>
              </div>
            )}

            {/* Info Cards */}
            <div className="space-y-4">
              {/* Main Contract Info */}
              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                <div className="bg-slate-50/80 px-4 py-3 border-b border-slate-100 flex items-center gap-2">
                  <Briefcase className="w-4 h-4 text-slate-500" />
                  <h4 className="font-semibold text-slate-700 text-sm">Dados do Contrato</h4>
                </div>
                <div className="p-5">
                  {(selectedMeasurement?.contractor?.name || selectedMeasurement?.execution_percentage != null) ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {selectedMeasurement?.contractor?.name && (
                        <div className="space-y-1">
                          <span className="text-xs font-medium text-slate-400 uppercase tracking-wider block">Empresa Responsável</span>
                          <p className="font-semibold text-slate-800 text-sm md:text-base leading-tight">
                            {selectedMeasurement.contractor.name}
                          </p>
                          {selectedMeasurement?.contractor?.cnpj && (
                            <p className="text-xs text-slate-500">CNPJ: {selectedMeasurement.contractor.cnpj}</p>
                          )}
                        </div>
                      )}
                      
                      {selectedMeasurement?.execution_percentage != null && (
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-1">
                            <span className="text-xs font-medium text-slate-400 uppercase tracking-wider block">Execução</span>
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-slate-800 text-sm md:text-base">
                                {`${selectedMeasurement.execution_percentage}%`}
                              </span>
                              <Progress value={selectedMeasurement.execution_percentage} className="h-2 w-full" />
                            </div>
                          </div>
                        </div>
                      )}

                      {(selectedMeasurement?.expected_value != null || selectedMeasurement?.amount_spent != null) && (
                        <div className="grid grid-cols-2 gap-4 md:col-span-2">
                          {selectedMeasurement?.expected_value != null && (
                            <div className="space-y-1">
                              <span className="text-xs font-medium text-slate-400 uppercase tracking-wider block">Valor Previsto</span>
                              <p className="font-semibold text-slate-800 text-sm md:text-base">
                                {formatCurrency(selectedMeasurement.expected_value)}
                              </p>
                            </div>
                          )}
                          {selectedMeasurement?.amount_spent != null && Number(selectedMeasurement.amount_spent) > 0 && (
                            <div className="space-y-1">
                              <span className="text-xs font-medium text-slate-400 uppercase tracking-wider block">Valor Pago</span>
                              <p className="font-semibold text-slate-800 text-sm md:text-base">
                                {formatCurrency(selectedMeasurement.amount_spent)}
                              </p>
                            </div>
                          )}
                        </div>
                      )}

                      {Array.isArray(selectedMeasurement?.funding_source) && selectedMeasurement.funding_source.length > 0 && (
                        <div className="md:col-span-2 space-y-2">
                          <span className="text-xs font-medium text-slate-400 uppercase tracking-wider block">Fontes do Recurso</span>
                          <div className="flex flex-wrap gap-2">
                            {selectedMeasurement.funding_source.map((src) => {
                              const label = src === 'federal' ? 'Federal' : src === 'estadual' ? 'Estadual' : src === 'municipal' ? 'Municipal' : src;
                              const styles = src === 'federal' ? 'bg-blue-50 text-blue-700' :
                                             src === 'estadual' ? 'bg-orange-50 text-orange-700' :
                                             src === 'municipal' ? 'bg-emerald-50 text-emerald-700' :
                                             'bg-slate-100 text-slate-700';
                              return (
                                <span key={src} className={`text-xs font-semibold px-2 py-1 rounded-full border ${styles}`}>
                                  {label}
                                </span>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="text-sm text-slate-500 italic">Sem informações nesta seção.</p>
                  )}
                </div>
              </div>

              {/* Timeline Card */}
              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                <div className="bg-slate-50/80 px-4 py-3 border-b border-slate-100 flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-slate-500" />
                  <h4 className="font-semibold text-slate-700 text-sm">Cronograma e Prazos</h4>
                </div>
                <div className="p-5">
                  {(selectedMeasurement?.contract_signature_date || selectedMeasurement?.service_order_date || selectedMeasurement?.predicted_start_date || selectedMeasurement?.start_date || selectedMeasurement?.expected_end_date || selectedMeasurement?.end_date || selectedMeasurement?.inauguration_date || selectedMeasurement?.stalled_date) ? (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-y-6 gap-x-4">
                       {selectedMeasurement?.contract_signature_date && (
                         <div>
                           <span className="text-xs text-slate-400 block mb-1">Assinatura do contrato</span>
                           <span className="font-medium text-slate-700 text-sm block">{formatDate(selectedMeasurement.contract_signature_date)}</span>
                         </div>
                       )}
                       {selectedMeasurement?.service_order_date && (
                         <div>
                           <span className="text-xs text-slate-400 block mb-1">Ordem de Serviço</span>
                           <span className="font-medium text-slate-700 text-sm block">{formatDate(selectedMeasurement.service_order_date)}</span>
                         </div>
                       )}
                       {selectedMeasurement?.predicted_start_date && (
                         <div>
                           <span className="text-xs text-slate-400 block mb-1">Previsão Início</span>
                           <span className="font-medium text-slate-700 text-sm block">{formatDate(selectedMeasurement.predicted_start_date)}</span>
                         </div>
                       )}
                       {selectedMeasurement?.start_date && (
                         <div>
                           <span className="text-xs text-slate-400 block mb-1">Início Real</span>
                           <span className="font-medium text-slate-700 text-sm block">{formatDate(selectedMeasurement.start_date)}</span>
                         </div>
                       )}
                       {selectedMeasurement?.expected_end_date && (
                         <div>
                           <span className="text-xs text-slate-400 block mb-1">Previsão Conclusão</span>
                           <span className="font-medium text-slate-700 text-sm block">{formatDate(selectedMeasurement.expected_end_date)}</span>
                         </div>
                       )}
                       {selectedMeasurement?.end_date && (
                         <div>
                           <span className={`text-xs block mb-1 ${selectedMeasurement.status === 'unfinished' ? 'text-orange-600' : 'text-slate-400'}`}>
                             {selectedMeasurement.status === 'unfinished' ? 'Encerramento/Rescisão' : 'Conclusão Real'}
                           </span>
                           <span className={`font-bold text-sm block ${selectedMeasurement.status === 'unfinished' ? 'text-orange-700' : 'text-emerald-700'}`}>
                              {formatDate(selectedMeasurement.end_date)}
                           </span>
                         </div>
                       )}
                       {selectedMeasurement?.inauguration_date && (
                         <div>
                           <span className="text-xs text-emerald-600 block mb-1">Inauguração</span>
                           <span className="font-bold text-emerald-700 text-sm block">{formatDate(selectedMeasurement.inauguration_date)}</span>
                         </div>
                       )}
                       {selectedMeasurement?.stalled_date && (
                         <div className="col-span-2 sm:col-span-1">
                           <span className="text-xs text-red-600 block mb-1">Data Paralisação</span>
                           <span className="font-bold text-red-700 text-sm block">{formatDate(selectedMeasurement.stalled_date)}</span>
                         </div>
                       )}
                    </div>
                  ) : (
                    <p className="text-sm text-slate-500 italic">Sem informações nesta seção.</p>
                  )}
                  {selectedMeasurement?.execution_period_days != null && (
                    <div className="mt-4">
                      <span className="text-xs text-slate-400 block mb-1">Prazo de Execução</span>
                      <span className="font-semibold text-slate-700 text-sm">{selectedMeasurement.execution_period_days} dias</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Media Gallery */}
            <div>
              <h4 className="font-bold text-slate-800 mb-3 flex items-center gap-2">
                <ImageIcon className="w-5 h-5 text-primary" />
                Galeria de Fotos e Vídeos
              </h4>
              {selectedMeasurement?.media && selectedMeasurement.media.length > 0 ? (
                <div className="space-y-6">
                  {(() => {
                    const groups = {};
                    selectedMeasurement.media.forEach(item => {
                      const name = item.gallery_name || 'Geral';
                      if (!groups[name]) groups[name] = [];
                      groups[name].push(item);
                    });
                    
                    const sortedGroups = Object.entries(groups).map(([name, items]) => ({ name, items })).sort((a, b) => {
                      if (a.name === selectedMeasurement.title) return -1; // Default gallery first
                      if (a.name === 'Geral') return -1;
                      if (b.name === selectedMeasurement.title) return 1;
                      if (b.name === 'Geral') return 1;
                      return a.name.localeCompare(b.name);
                    });

                    return sortedGroups.map((group) => (
                      <div key={group.name} className="space-y-3">
                        {(sortedGroups.length > 1 || (group.name !== 'Geral' && group.name !== selectedMeasurement.title)) && (
                          <h5 className="text-sm font-semibold text-slate-700 border-l-4 border-primary pl-3 bg-slate-50 py-1 rounded-r-lg">
                            {group.name}
                          </h5>
                        )}
                        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
                          {group.items.map((mediaItem) => {
                            // Find original index in the full list for correct lightbox navigation
                            const originalIndex = selectedMeasurement.media.findIndex(m => m.id === mediaItem.id);
                            return (
                              <div 
                                key={mediaItem.id}
                                className="aspect-square rounded-lg overflow-hidden cursor-pointer bg-slate-200 relative group shadow-sm hover:shadow-md transition-all"
                                onClick={() => openViewer(selectedMeasurement.media, originalIndex)}
                              >
                                {['video', 'video_url'].includes(mediaItem.type) ? (
                                  <div className="w-full h-full flex items-center justify-center bg-slate-800">
                                    <Video className="w-10 h-10 text-white/70" />
                                  </div>
                                ) : (
                                  <img 
                                    src={mediaItem.url} 
                                    alt={mediaItem.description} 
                                    className="w-full h-full object-cover hover:scale-105 transition-transform duration-300"
                                  />
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ));
                  })()}
                </div>
              ) : (
                <p className="text-slate-500 italic">Nenhuma mídia registrada para esta fase.</p>
              )}
            </div>

            {/* Documents */}
            <div>
              <h4 className="font-bold text-slate-800 mb-3 flex items-center gap-2">
                <FileText className="w-5 h-5 text-primary" />
                Documentos Anexados
              </h4>
              {selectedMeasurement?.docs && selectedMeasurement.docs.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {selectedMeasurement.docs.map(doc => (
                     <a 
                        key={doc.id}
                        href={doc.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-3 p-3 rounded-lg bg-white border border-slate-200 hover:border-primary/50 hover:bg-slate-50 transition-all group"
                      >
                        <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
                          <FileText className="w-5 h-5" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-slate-700 truncate group-hover:text-primary transition-colors">{doc.name}</p>
                          {doc.description && <p className="text-xs text-slate-500 truncate">{doc.description}</p>}
                        </div>
                        <Download className="w-4 h-4 text-slate-400 group-hover:text-primary transition-colors" />
                      </a>
                  ))}
                </div>
              ) : (
                <p className="text-slate-500 italic">Nenhum documento anexado.</p>
              )}
            </div>

          </div>

          <DialogFooter>
            <Button onClick={() => setSelectedMeasurement(null)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {user?.is_admin && (
        <WorkEditModal
          work={showAdminEditModal ? work : null}
          onSave={async (workToSave) => {
            const { id, location, ...data } = workToSave;
            delete data.bairro;
            delete data.work_category;
            delete data.work_area;
            delete data.contractor;
            const locationString = location ? `POINT(${location.lng} ${location.lat})` : null;
            const payload = { ...data, location: locationString };
            ['bairro_id', 'work_category_id', 'work_area_id', 'contractor_id'].forEach(key => {
              if (payload[key] === '') payload[key] = null;
            });
            if (!Array.isArray(payload.funding_source)) {
              payload.funding_source = [];
            }
            const result = await supabase.from('public_works').update(payload).eq('id', id).select().single();
            if (result.error) {
              toast({ title: "Erro ao salvar obra", description: result.error.message, variant: "destructive" });
            } else {
              toast({ title: "Obra atualizada com sucesso!" });
              setShowAdminEditModal(false);
              fetchWorkDetails();
            }
          }}
          onClose={() => setShowAdminEditModal(false)}
          workOptions={workEditOptions}
        />
      )}
    </div>
  );
};

export default WorkDetailsPage;

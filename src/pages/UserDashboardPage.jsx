import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Helmet } from 'react-helmet';
import {
  Activity, Building, CheckCircle, ChevronLeft,
  ChevronRight, Clock, Edit, Eye, FileText, Heart, MapPin, MessageSquare,
  PlusCircle, Search, Send, SlidersHorizontal, Trash2, Upload, XCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import ReportDetails from '@/components/ReportDetails';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useCity } from '@/contexts/CityContext';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Combobox } from '@/components/ui/combobox';
import { supabase } from '@/lib/customSupabaseClient';
import ReportModal from '@/components/ReportModal';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useUpvote } from '../hooks/useUpvotes';
import { showAppError } from '@/lib/appError';

const throwIfAborted = (signal) => {
  if (!signal?.aborted) return;
  const error = new Error('Envio cancelado.');
  error.name = 'AbortError';
  throw error;
};

const BRONCAS_POR_PAGINA = 6;

const normalizarBusca = (value) => String(value || '')
  .normalize('NFD')
  .replace(/\p{Mn}/gu, '')
  .toLowerCase();

const UserDashboardPage = ({ embedded = false, impactFirst = false, navigationAfterImpact = null }) => {
  const { user } = useAuth();
  const { activeCityId } = useCity();
  const location = useLocation();
  const [reports, setReports] = useState([]);
  const [comments, setComments] = useState([]);
  const [selectedReport, setSelectedReport] = useState(null);
  const [reportToDelete, setReportToDelete] = useState(null);
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [newEntry, setNewEntry] = useState({ name: '', address: '', phone: '', type: 'commerce', photo: null, photoPreview: null });
  const photoInputRef = useRef(null);
  const suppressReportAutoOpenRef = useRef(false);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('reports');
  const [buscaBronca, setBuscaBronca] = useState('');
  const [filtroSituacao, setFiltroSituacao] = useState('all');
  const [filtroModeracao, setFiltroModeracao] = useState('all');
  const [ordemBroncas, setOrdemBroncas] = useState('recentes');
  const [paginaBroncas, setPaginaBroncas] = useState(1);
  const navigate = useNavigate();

  const reportParam = useMemo(() => {
    try {
      return new URLSearchParams(location.search).get('report');
    } catch {
      return null;
    }
  }, [location.search]);

  const tabParam = useMemo(() => {
    try {
      return new URLSearchParams(location.search).get('tab');
    } catch {
      return null;
    }
  }, [location.search]);
  const { handleUpvote: handleUpvoteHook } = useUpvote();

  const fetchUserContributions = useCallback(async () => {
    if (!user) return;
    setLoading(true);

    const { data: reportsData, error: reportsError } = await supabase
      .from('reports')
      .select('*, pole_number, category:categories(name, icon), author:profiles!reports_author_id_fkey(name, avatar_type, avatar_url, avatar_config), comments!left(*, author:profiles!comments_author_id_fkey(name, avatar_type, avatar_url, avatar_config)), report_media(*), upvotes:upvotes(count), timeline:report_timeline(*)')
      .eq('author_id', user.id)
      .order('created_at', { ascending: false });
    
    if (reportsError) {
      showAppError({ title: "Erro ao buscar suas broncas", description: reportsError.message, variant: "destructive" });
    } else {
      const formattedReports = reportsData.map(r => ({
        ...r,
        location: r.location ? { lat: r.location.coordinates[1], lng: r.location.coordinates[0] } : null,
        category: r.category_id,
        categoryName: r.category?.name,
        categoryIcon: r.category?.icon,
        authorName: r.author?.name || 'Anônimo',
        upvotes: r.upvotes[0]?.count || 0,
        comments: (r.comments || []).filter(c => c.moderation_status === 'approved'),
        photos: (r.report_media || []).filter(m => m.type === 'photo'),
        videos: (r.report_media || []).filter(m => m.type === 'video'),
      }));
      setReports(formattedReports);
    }

    const { data: commentsData, error: commentsError } = await supabase
      .from('comments')
      .select('*, report:reports(title)')
      .eq('author_id', user.id)
      .order('created_at', { ascending: false });

    if (commentsError) showAppError({ title: "Erro ao buscar seus comentários", description: commentsError.message, variant: "destructive" });
    else setComments(commentsData.map(c => ({...c, reportTitle: c.report?.title})));

    setLoading(false);
  }, [user]);

  useEffect(() => {
    fetchUserContributions();
  }, [fetchUserContributions]);

  useEffect(() => {
    if (tabParam) {
      setActiveTab(tabParam);
    } else if (reportParam) {
      setActiveTab('reports');
    }
  }, [tabParam, reportParam]);

  useEffect(() => {
    if (!reportParam) {
      suppressReportAutoOpenRef.current = false;
    }
  }, [reportParam]);

  useEffect(() => {
    if (suppressReportAutoOpenRef.current) return;
    if (!reportParam || reports.length === 0) return;
    const found = reports.find(r => String(r.id) === String(reportParam));
    if (!found) return;
    if (selectedReport?.id === found.id) return;
    
    // 🔥 Fechar menu de notificações quando ReportDetails for aberto
    window.dispatchEvent(new CustomEvent('close-notifications-popover'));
    
    setSelectedReport(found);
  }, [reportParam, reports, selectedReport?.id]);

  const handleCloseReportDetails = useCallback(() => {
    suppressReportAutoOpenRef.current = true;
    setSelectedReport(null);

    const params = new URLSearchParams(location.search);
    params.delete('report');
    const nextSearch = params.toString();
    navigate(`${location.pathname}${nextSearch ? `?${nextSearch}` : ''}`, { replace: true });
  }, [location.pathname, location.search, navigate]);

  const handleUpdateReport = async (editData) => {
    const {
      id,
      title,
      description,
      address,
      location,
      category_id,
      pole_number,
      pole_id,
      reported_post_identifier,
      reported_plate,
      reported_pole_distance_m,
      status,
      is_recurrent,
      evaluation,
      resolution_submission,
      moderation_status,
      rejection_title,
      rejection_description,
      rejected_at
    } = editData;

    const reportUpdates = {};
    if (typeof title !== 'undefined') reportUpdates.title = title;
    if (typeof description !== 'undefined') reportUpdates.description = description;
    if (typeof address !== 'undefined') reportUpdates.address = address;
    if (typeof category_id !== 'undefined') reportUpdates.category_id = category_id;
    if (typeof status !== 'undefined') reportUpdates.status = status;
    if (typeof is_recurrent !== 'undefined') reportUpdates.is_recurrent = is_recurrent;
    if (typeof evaluation !== 'undefined') reportUpdates.evaluation = evaluation;
    if (typeof resolution_submission !== 'undefined') reportUpdates.resolution_submission = resolution_submission;
    if (typeof moderation_status !== 'undefined') reportUpdates.moderation_status = moderation_status;
    if (typeof rejection_title !== 'undefined') reportUpdates.rejection_title = rejection_title;
    if (typeof rejection_description !== 'undefined') reportUpdates.rejection_description = rejection_description;
    if (typeof rejected_at !== 'undefined') reportUpdates.rejected_at = rejected_at;
    if (typeof category_id !== 'undefined') {
      if (category_id === 'iluminacao') {
        if (typeof pole_number !== 'undefined') {
          reportUpdates.pole_number = pole_number ? String(pole_number).trim() : null;
        }
        if (typeof pole_id !== 'undefined') reportUpdates.pole_id = pole_id || null;
        if (typeof reported_post_identifier !== 'undefined') reportUpdates.reported_post_identifier = reported_post_identifier ? String(reported_post_identifier).trim() : null;
        if (typeof reported_plate !== 'undefined') reportUpdates.reported_plate = reported_plate ? String(reported_plate).trim() : null;
        if (typeof reported_pole_distance_m !== 'undefined') {
          if (reported_pole_distance_m == null) reportUpdates.reported_pole_distance_m = null;
          else {
            const n = Number(reported_pole_distance_m);
            reportUpdates.reported_pole_distance_m = Number.isFinite(n) ? n : null;
          }
        }
      } else {
        reportUpdates.pole_number = null;
        reportUpdates.pole_id = null;
        reportUpdates.reported_post_identifier = null;
        reportUpdates.reported_plate = null;
        reportUpdates.reported_pole_distance_m = null;
      }
    } else if (typeof pole_number !== 'undefined') {
      reportUpdates.pole_number = pole_number ? String(pole_number).trim() : null;
      if (typeof pole_id !== 'undefined') reportUpdates.pole_id = pole_id || null;
      if (typeof reported_post_identifier !== 'undefined') reportUpdates.reported_post_identifier = reported_post_identifier ? String(reported_post_identifier).trim() : null;
      if (typeof reported_plate !== 'undefined') reportUpdates.reported_plate = reported_plate ? String(reported_plate).trim() : null;
      if (typeof reported_pole_distance_m !== 'undefined') {
        if (reported_pole_distance_m == null) reportUpdates.reported_pole_distance_m = null;
        else {
          const n = Number(reported_pole_distance_m);
          reportUpdates.reported_pole_distance_m = Number.isFinite(n) ? n : null;
        }
      }
    }
    if (location) reportUpdates.location = `POINT(${location.lng} ${location.lat})`;

    const shouldRetryWithoutRejectionFields = (err) => {
      const msg = String(err?.message || '');
      if (err?.code === 'PGRST204') return true;
      if (msg.includes('schema cache') && msg.includes('reports')) return true;
      if (msg.includes("Could not find the 'rejection_")) return true;
      if (msg.includes("Could not find the 'rejected_at'")) return true;
      return false;
    };

    const stripRejectionFields = (obj) => {
      const { rejection_title, rejection_description, rejected_at, ...rest } = obj || {};
      return rest;
    };

    const tryUpdate = async (payload) => {
      const res = await supabase.from('reports').update(payload).eq('id', id);
      return res?.error || null;
    };

    let updateError = await tryUpdate(reportUpdates);
    if (updateError && shouldRetryWithoutRejectionFields(updateError)) {
      updateError = await tryUpdate(stripRejectionFields(reportUpdates));
    }

    if (updateError) {
      showAppError({ title: "Erro ao atualizar dados", description: updateError.message, variant: "destructive" });
      return;
    }
    
    fetchUserContributions();
    if (reportParam) handleCloseReportDetails();
    else if (selectedReport) setSelectedReport(null);
  };

  const handleDeleteReport = async () => {
    if (!reportToDelete) return;
    
    const { error } = await supabase
      .from('reports')
      .delete()
      .eq('id', reportToDelete.id);

    if (error) {
      showAppError({ title: "Erro ao remover bronca", description: error.message, variant: "destructive" });
    } else {
      fetchUserContributions();
    }
    setReportToDelete(null);
  };

  const openDeleteConfirmation = (report) => {
    setReportToDelete(report);
  };

  const handleNewEntryChange = (e) => {
    const { name, value } = e.target;
    setNewEntry(prev => ({ ...prev, [name]: value }));
  };

  const handlePhotoChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setNewEntry(prev => ({ ...prev, photo: file, photoPreview: reader.result }));
      };
      reader.readAsDataURL(file);
    }
  };

  const handleNewEntrySubmit = async (e) => {
    e.preventDefault();
    if (!newEntry.name || !newEntry.address || !newEntry.phone) {
      showAppError({ title: "Campos obrigatórios", description: "Por favor, preencha nome, endereço e telefone.", variant: "destructive" });
      return;
    }
    if (!activeCityId) {
      showAppError({ title: "Selecione uma cidade", description: "Escolha a cidade no topo da página antes de enviar sua sugestão.", variant: "destructive" });
      return;
    }

    const { error } = await supabase
      .from('directory')
      .insert({
        name: newEntry.name,
        address: newEntry.address,
        phone: newEntry.phone,
        type: newEntry.type,
        city_id: activeCityId,
        submitted_by: user.id,
        status: 'pending'
      });

    if (error) {
      showAppError({ title: "Erro ao enviar colaboração", description: error.message, variant: "destructive" });
    } else {
      setNewEntry({ name: '', address: '', phone: '', type: 'commerce', photo: null, photoPreview: null });
    }
  };

    const handleUpvote = async (id) => {
    if (!user) {
      showAppError({ title: "Acesso restrito", description: "Você precisa fazer login para apoiar.", variant: "destructive" });
      navigate('/login');
      return;
    }
    
    const result = await handleUpvoteHook(id);

    if (result.success) {
      fetchUserContributions();
    } else {
      showAppError({ title: "Erro ao apoiar", description: result.error, variant: "destructive" });
    }
  };

  const getStatusInfo = (status) => {
    switch (status) {
      case 'pending_approval': return { text: 'Aguardando Moderação', icon: <Clock className="w-4 h-4 text-yellow-500" />, color: 'text-yellow-500' };
      case 'approved': return { text: 'Aprovado', icon: <CheckCircle className="w-4 h-4 text-green-500" />, color: 'text-green-500' };
      case 'rejected': return { text: 'Rejeitado', icon: <XCircle className="w-4 h-4 text-red-500" />, color: 'text-red-500' };
      default: return { text: 'Pendente', icon: <Clock className="w-4 h-4 text-content-tertiary" />, color: 'text-content-tertiary' };
    }
  };

  const getReportStatusInfo = (status) => {
    switch (status) {
      case 'resolved': return { text: 'Resolvida', className: 'border-success-border bg-success-bg text-success-fg' };
      case 'in-progress': return { text: 'Em andamento', className: 'border-status-progressBorder bg-status-progressBg text-status-progressFg' };
      default: return { text: 'Pendente', className: 'border-status-pendingBorder bg-status-pendingBg text-status-pendingFg' };
    }
  };

  const handleCreateReport = async (newReportData, uploadMediaCallback, { signal } = {}) => {
    throwIfAborted(signal);
    if (!user) throw new Error('Sua sessão expirou. Entre novamente para enviar a bronca.');

    const { title, description, category, address, location, pole_number, pole_id, reported_pole_distance_m, issue_type, reported_post_identifier, reported_plate, is_from_water_utility, city_id: geocodedCityId } = newReportData;
    const normalizePoleLabel = (raw) => String(raw || '').trim().replace(/^\s*\d+\s*[-–—]\s*/u, '').trim();
    const normalizedPole = normalizePoleLabel(pole_number);
    const savedReportedPostIdentifier = reported_post_identifier ? normalizePoleLabel(reported_post_identifier) : (normalizedPole || null);
    const savedReportedPlate = reported_plate ? normalizePoleLabel(reported_plate) : (normalizedPole || null);

    let insertQuery = supabase
      .from('reports')
      .insert({
        title,
        description,
        category_id: category,
        address,
        location: `POINT(${location.lng} ${location.lat})`,
        author_id: user.id,
        protocol: `TROMB-${Date.now()}`,
        pole_number: category === 'iluminacao' ? pole_number : null,
        pole_id: category === 'iluminacao' ? pole_id : null,
        reported_post_identifier: category === 'iluminacao' ? savedReportedPostIdentifier : null,
        reported_plate: category === 'iluminacao' ? savedReportedPlate : null,
        reported_pole_distance_m: category === 'iluminacao' ? reported_pole_distance_m : null,
        issue_type: category === 'iluminacao' ? (issue_type?.trim() || null) : null,
        is_from_water_utility: category === 'buracos' ? !!is_from_water_utility : null,
        city_id: geocodedCityId ?? null,
        status: 'pending',
        moderation_status: user?.is_admin || user?.is_master ? 'approved' : 'pending_approval',
      })
      .select('id, title')
      .single();

    if (signal && typeof insertQuery.abortSignal === 'function') {
      insertQuery = insertQuery.abortSignal(signal);
    }

    const { data, error } = await insertQuery;

    if (error) {
      throw error;
    }

    try {
      throwIfAborted(signal);
      if (uploadMediaCallback) {
        await uploadMediaCallback(data.id, { signal });
        throwIfAborted(signal);
      }
    } catch (submitError) {
      await supabase.from('reports').delete().eq('id', data.id);
      throw submitError;
    }

    setIsReportModalOpen(false);

    // Atualiza a lista de broncas do usuário
    setTimeout(() => {
      fetchUserContributions();
    }, 1000);
  };

  const containerVariants = { hidden: { opacity: 0 }, visible: { opacity: 1, transition: { staggerChildren: 0.05 } } };
  const itemVariants = { hidden: { y: 20, opacity: 0 }, visible: { y: 0, opacity: 1 } };

  const broncasFiltradas = useMemo(() => {
    const termo = normalizarBusca(buscaBronca.trim());
    const resultado = reports.filter((report) => {
      const combinaBusca = !termo || normalizarBusca([
        report.title,
        report.description,
        report.address,
        report.categoryName,
      ].join(' ')).includes(termo);
      const combinaSituacao = filtroSituacao === 'all' || report.status === filtroSituacao;
      const combinaModeracao = filtroModeracao === 'all' || report.moderation_status === filtroModeracao;
      return combinaBusca && combinaSituacao && combinaModeracao;
    });

    return resultado.sort((a, b) => {
      if (ordemBroncas === 'antigas') return new Date(a.created_at) - new Date(b.created_at);
      if (ordemBroncas === 'apoios') return Number(b.upvotes || 0) - Number(a.upvotes || 0);
      if (ordemBroncas === 'visualizacoes') return Number(b.views || 0) - Number(a.views || 0);
      return new Date(b.created_at) - new Date(a.created_at);
    });
  }, [reports, buscaBronca, filtroSituacao, filtroModeracao, ordemBroncas]);

  useEffect(() => {
    setPaginaBroncas(1);
  }, [buscaBronca, filtroSituacao, filtroModeracao, ordemBroncas]);

  const totalPaginasBroncas = Math.max(1, Math.ceil(broncasFiltradas.length / BRONCAS_POR_PAGINA));
  const paginaAtualBroncas = Math.min(paginaBroncas, totalPaginasBroncas);
  const inicioDaPagina = (paginaAtualBroncas - 1) * BRONCAS_POR_PAGINA;
  const broncasDaPagina = broncasFiltradas.slice(inicioDaPagina, inicioDaPagina + BRONCAS_POR_PAGINA);

  const primeiroNome = String(user?.name || 'Cidadão').trim().split(/\s+/)[0];
  const totalDeApoios = reports.reduce((total, report) => total + Number(report.upvotes || 0), 0);
  const totalDeVisualizacoes = reports.reduce((total, report) => total + Number(report.views || 0), 0);
  const resolvidas = reports.filter((report) => report.status === 'resolved').length;
  const emAndamento = reports.filter((report) => report.status === 'in-progress').length;
  const pendentes = reports.filter((report) => !['resolved', 'in-progress'].includes(report.status)).length;
  const taxaResolvida = reports.length ? Math.round((resolvidas / reports.length) * 100) : 0;

  const metricas = [
    { rotulo: 'Broncas', valor: reports.length, detalhe: `${pendentes} pendentes`, Icone: FileText, tom: 'bg-brand-subtleBg text-brand' },
    { rotulo: 'Comentários', valor: comments.length, detalhe: 'participações', Icone: MessageSquare, tom: 'bg-status-progressBg text-status-progressFg' },
    { rotulo: 'Apoios recebidos', valor: totalDeApoios, detalhe: 'nas suas broncas', Icone: Heart, tom: 'bg-status-pendingBg text-status-pendingFg' },
    { rotulo: 'Visualizações', valor: totalDeVisualizacoes, detalhe: 'alcance total', Icone: Eye, tom: 'bg-success-bg text-success-fg' },
  ];

  const impactBanner = (
    <section className="mb-8 overflow-hidden rounded-3xl bg-gradient-to-r from-[#230609] via-[#4f0d15] to-[#7f1220] p-6 text-white shadow-elevation-2 md:p-8 lg:flex lg:h-56 lg:items-center">
      <div className="grid w-full items-center gap-7 lg:grid-cols-[minmax(0,1fr)_auto]">
        <div>
          <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-amber-300">Meu impacto cidadão</p>
          <h2 className="mt-2 text-2xl font-extrabold">Sua participação já movimenta a cidade</h2>
          <p className="mt-2 max-w-2xl text-sm text-white/70">Cada bronca acompanhada, apoio e comentário ajuda problemas públicos a ganharem visibilidade.</p>
          <div className="mt-6 grid grid-cols-2 gap-5 sm:grid-cols-4">
            {[
              ['Broncas registradas', reports.length],
              ['Resolvidas', resolvidas],
              ['Em andamento', emAndamento],
              ['Interações', totalDeApoios + comments.length],
            ].map(([rotulo, valor]) => (
              <div key={rotulo}>
                <p className="text-2xl font-extrabold tabular-nums">{loading ? '—' : valor}</p>
                <p className="mt-1 text-[11px] text-white/60">{rotulo}</p>
              </div>
            ))}
          </div>
        </div>
        <div className="min-w-[13rem] rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur-sm">
          <div className="flex items-center gap-3">
            <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-400 text-[#4f0d15]"><Activity className="h-6 w-6" /></span>
            <div><p className="font-extrabold">Participação ativa</p><p className="text-xs text-white/60">Impacto acompanhado</p></div>
          </div>
          <div className="mt-5 h-2 overflow-hidden rounded-full bg-white/10">
            <div className="h-full rounded-full bg-amber-400 transition-[width]" style={{ width: `${taxaResolvida}%` }} />
          </div>
          <p className="mt-2 text-xs text-white/70">{taxaResolvida}% das suas broncas foram resolvidas</p>
        </div>
      </div>
    </section>
  );

  return (
    <>
      {!embedded && (
        <Helmet>
          <title>Meu Painel - Trombone Cidadão</title>
          <meta name="description" content="Gerencie suas broncas e comentários." />
        </Helmet>
      )}
      <div className={embedded
        ? 'w-full py-2'
        : 'mx-auto w-full max-w-[112rem] px-3 py-8 sm:px-5 lg:px-8'}>
        {impactFirst && impactBanner}
        {impactFirst && navigationAfterImpact && <div className="mb-6">{navigationAfterImpact}</div>}

        <motion.header initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="mb-7 flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-2xl font-extrabold text-content-primary md:text-3xl">Olá, {primeiroNome}! <span aria-hidden="true">👋</span></h1>
            <p className="mt-1 text-sm text-content-secondary">Acompanhe suas contribuições e o impacto da sua participação.</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button
              className="h-10 gap-2 rounded-xl px-4 font-semibold"
              onClick={() => setIsReportModalOpen(true)}
            >
              <PlusCircle className="h-4 w-4" /> {reports.length ? 'Nova bronca' : 'Cadastrar primeira bronca'}
            </Button>
            <Button
              asChild
              variant="outline"
              className="h-10 gap-2 rounded-xl px-4 font-semibold"
            >
              <Link to="/minhas-peticoes"><FileText className="h-4 w-4" /> Criar abaixo-assinado</Link>
            </Button>
          </div>
        </motion.header>

        <section aria-labelledby="resumo-painel" className="mb-6">
          <h2 id="resumo-painel" className="sr-only">Resumo da sua participação</h2>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {metricas.map(({ rotulo, valor, detalhe, Icone, tom }) => (
              <div key={rotulo} className="rounded-2xl border border-edge-subtle bg-surface-raised p-4 shadow-sm">
                <div className="flex items-center gap-3">
                  <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${tom}`}><Icone className="h-5 w-5" /></span>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-content-secondary">{rotulo}</p>
                    <p className="mt-0.5 text-xl font-extrabold text-content-primary tabular-nums">{loading ? '—' : valor}</p>
                    <p className="text-[11px] text-content-tertiary">{detalhe}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {!impactFirst && impactBanner}

        <div className="mb-4 flex items-end justify-between gap-4">
          <div><h2 className="text-xl font-extrabold text-content-primary">Minhas contribuições</h2><p className="text-sm text-content-secondary">Gerencie o que você publicou na plataforma.</p></div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full max-w-xl grid-cols-3 bg-muted/50 rounded-lg p-1 gap-1 h-auto">
            <TabsTrigger 
              value="reports" 
              className="gap-1 sm:gap-2 px-1.5 sm:px-3 py-2 text-xs sm:text-sm flex items-center justify-center min-w-0 w-full"
            >
              <FileText className="w-3 h-3 sm:w-4 sm:h-4 flex-shrink-0" /> 
              <span className="truncate ml-0.5 sm:ml-0">Broncas</span>
            </TabsTrigger>
            <TabsTrigger 
              value="comments" 
              className="gap-1 sm:gap-2 px-1.5 sm:px-3 py-2 text-xs sm:text-sm flex items-center justify-center min-w-0 w-full"
            >
              <MessageSquare className="w-3 h-3 sm:w-4 sm:h-4 flex-shrink-0" /> 
              <span className="truncate ml-0.5 sm:ml-0">Comentários</span>
            </TabsTrigger>
            <TabsTrigger 
              value="guide" 
              className="gap-1 sm:gap-2 px-1.5 sm:px-3 py-2 text-xs sm:text-sm flex items-center justify-center min-w-0 w-full"
            >
              <PlusCircle className="w-3 h-3 sm:w-4 sm:h-4 flex-shrink-0" /> 
              <span className="truncate ml-0.5 sm:ml-0">Guias</span>
            </TabsTrigger>
          </TabsList>
          
          <TabsContent value="reports" className="mt-6 relative min-h-[300px]">
            <div className="mb-5 rounded-2xl border border-edge-subtle bg-surface-raised p-3 shadow-sm">
              <div className="grid gap-2 md:grid-cols-[minmax(14rem,1fr)_repeat(3,minmax(9rem,auto))]">
                <label className="relative min-w-0">
                  <span className="sr-only">Buscar nas minhas broncas</span>
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-content-tertiary" />
                  <Input
                    value={buscaBronca}
                    onChange={(event) => setBuscaBronca(event.target.value)}
                    placeholder="Buscar por título, local ou categoria"
                    className="h-10 pl-9"
                  />
                </label>

                <label className="relative">
                  <span className="sr-only">Filtrar por situação</span>
                  <select value={filtroSituacao} onChange={(event) => setFiltroSituacao(event.target.value)} className="h-10 w-full rounded-md border border-input bg-surface-raised px-3 pr-8 text-xs font-semibold text-content-primary">
                    <option value="all">Todas as situações</option>
                    <option value="pending">Pendentes</option>
                    <option value="in-progress">Em andamento</option>
                    <option value="resolved">Resolvidas</option>
                  </select>
                </label>

                <label>
                  <span className="sr-only">Filtrar por moderação</span>
                  <select value={filtroModeracao} onChange={(event) => setFiltroModeracao(event.target.value)} className="h-10 w-full rounded-md border border-input bg-surface-raised px-3 pr-8 text-xs font-semibold text-content-primary">
                    <option value="all">Toda moderação</option>
                    <option value="pending_approval">Aguardando análise</option>
                    <option value="approved">Aprovadas</option>
                    <option value="rejected">Rejeitadas</option>
                  </select>
                </label>

                <label>
                  <span className="sr-only">Ordenar broncas</span>
                  <select value={ordemBroncas} onChange={(event) => setOrdemBroncas(event.target.value)} className="h-10 w-full rounded-md border border-input bg-surface-raised px-3 pr-8 text-xs font-semibold text-content-primary">
                    <option value="recentes">Mais recentes</option>
                    <option value="antigas">Mais antigas</option>
                    <option value="apoios">Mais apoiadas</option>
                    <option value="visualizacoes">Mais visualizadas</option>
                  </select>
                </label>
              </div>

              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-edge-subtle pt-3 text-xs text-content-tertiary">
                <span className="inline-flex items-center gap-1.5"><SlidersHorizontal className="h-3.5 w-3.5" /> {broncasFiltradas.length} {broncasFiltradas.length === 1 ? 'bronca encontrada' : 'broncas encontradas'}</span>
                {(buscaBronca || filtroSituacao !== 'all' || filtroModeracao !== 'all' || ordemBroncas !== 'recentes') && (
                  <button type="button" className="font-bold text-brand hover:underline" onClick={() => {
                    setBuscaBronca('');
                    setFiltroSituacao('all');
                    setFiltroModeracao('all');
                    setOrdemBroncas('recentes');
                  }}>Limpar filtros</button>
                )}
              </div>
            </div>

            <AnimatePresence mode="wait">
              {loading ? (
                <motion.div key="loader" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 flex items-center justify-center">
                  <div className="text-center">
                    <p className="text-lg font-semibold">Carregando suas broncas...</p>
                  </div>
                </motion.div>
              ) : broncasDaPagina.length > 0 ? (
                <motion.div key={`reports-list-${paginaAtualBroncas}`} className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3" variants={containerVariants} initial="hidden" animate="visible" exit={{ opacity: 0 }}>
                  {broncasDaPagina.map((report) => {
                    const statusDaBronca = getReportStatusInfo(report.status);
                    const moderacao = getStatusInfo(report.moderation_status);
                    return (
                    <motion.div key={report.id} variants={itemVariants}>
                      <div
                        className="group flex h-full cursor-pointer flex-col overflow-hidden rounded-2xl border border-edge-subtle bg-surface-raised shadow-sm transition-[border-color,box-shadow,transform] hover:-translate-y-0.5 hover:border-brand/30 hover:shadow-elevation-2"
                        onClick={() => setSelectedReport(report)}
                      >
                        <div className="relative aspect-[16/9] w-full overflow-hidden bg-surface-sunken">
                          {report.photos && report.photos.length > 0 ? (
                            <img
                              src={report.photos[0].url}
                              alt={report.title}
                              className="w-full h-full object-cover transform transition-transform duration-300 group-hover:scale-105"
                            />
                          ) : (
                            <div className="w-full h-full bg-gradient-to-br from-[#1D4ED8] via-[#2563EB] to-[#0EA5E9] flex items-center justify-center">
                              <span className="text-4xl">{report.categoryIcon || '📍'}</span>
                            </div>
                          )}
                          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent" />
                          
                          <div className="absolute left-2.5 top-2.5 flex flex-wrap gap-1.5">
                            <span className={`flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-bold shadow-sm ${
                              report.moderation_status === 'approved' ? 'bg-green-100 text-green-700' :
                              report.moderation_status === 'rejected' ? 'bg-red-100 text-red-700' :
                              'bg-yellow-100 text-yellow-700'
                            }`}>
                              {moderacao.icon} {moderacao.text}
                            </span>
                            <span className={`rounded-full border px-2 py-1 text-[10px] font-bold shadow-sm ${statusDaBronca.className}`}>
                              {statusDaBronca.text}
                            </span>
                          </div>

                          <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between gap-2">
                             <div className="flex items-center gap-2">
                                <span className="text-[11px] text-white/90 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-black/30 backdrop-blur">
                                  <Eye className="w-3.5 h-3.5" />
                                  {report.views || 0}
                                </span>
                                <span className="text-[11px] text-white/90 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-black/30 backdrop-blur">
                                  <Heart className="w-3.5 h-3.5" />
                                  {report.upvotes || 0}
                                </span>
                             </div>
                             
                            <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                                 <Button
                                  size="icon" 
                                  variant="secondary" 
                                  className="h-7 w-7 rounded-full bg-white/95 text-content-secondary hover:bg-surface-raised hover:text-blue-600" 
                                  onClick={(e) => {
                                      e.stopPropagation();
                                      setSelectedReport(report);
                                  }}
                                   disabled={report.moderation_status !== 'pending_approval'}
                                   aria-label={`Editar ${report.title}`}
                                   title="Editar bronca"
                                >
                                  <Edit className="w-3.5 h-3.5" />
                                </Button>
                                <Button 
                                  size="icon" 
                                  variant="secondary"
                                  className="h-7 w-7 rounded-full bg-white/95 text-content-secondary hover:bg-red-50 hover:text-red-600"
                                   onClick={(e) => {
                                      e.stopPropagation();
                                      openDeleteConfirmation(report);
                                   }}
                                   aria-label={`Excluir ${report.title}`}
                                   title="Excluir bronca"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </Button>
                            </div>
                          </div>
                        </div>

                        <div className="flex flex-grow flex-col p-4">
                          <div className="flex items-center justify-between gap-3 text-[11px] text-content-tertiary">
                             <div className="flex min-w-0 items-center gap-1">
                                <MapPin className="w-3 h-3" />
                                <span className="truncate">{report.address || 'Endereço não informado'}</span>
                             </div>
                             <time className="shrink-0" dateTime={report.created_at}>{new Date(report.created_at).toLocaleDateString('pt-BR')}</time>
                          </div>

                          <h3 className="mt-2 line-clamp-2 text-base font-extrabold leading-snug text-content-primary">
                            {report.title}
                          </h3>
                          
                          <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">
                            {report.description}
                          </p>

                          <div className="mt-4 flex items-center justify-between gap-2 border-t border-edge-subtle pt-3">
                             <div className="flex items-center gap-1.5">
                                <span className="text-lg">{report.categoryIcon}</span>
                                <span className="text-xs font-medium text-content-secondary">{report.categoryName}</span>
                             </div>
                             {report.is_featured && (
                                <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 font-medium border border-blue-100">
                                  Destaque
                                </span>
                             )}
                          </div>
                        </div>
                      </div>
                    </motion.div>
                    );
                  })}
                </motion.div>
              ) : (
                <motion.div key="no-reports" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-center py-16 bg-card rounded-lg border border-border">
                  <p className="text-xl font-bold text-muted-foreground">{reports.length ? 'Nenhuma bronca corresponde aos filtros.' : 'Nenhuma bronca registrada.'}</p>
                  <p className="text-muted-foreground mt-2">{reports.length ? 'Tente remover algum filtro ou buscar outro termo.' : 'Que tal começar agora e fazer a diferença na sua cidade?'}</p>
                </motion.div>
              )}
            </AnimatePresence>

            {!loading && broncasFiltradas.length > 0 && (
              <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-edge-subtle bg-surface-raised px-4 py-3">
                <span className="text-xs text-content-tertiary tabular-nums">
                  {inicioDaPagina + 1}–{Math.min(inicioDaPagina + BRONCAS_POR_PAGINA, broncasFiltradas.length)} de {broncasFiltradas.length}
                </span>
                <div className="flex items-center gap-2">
                  <Button type="button" size="icon" variant="outline" className="h-9 w-9" disabled={paginaAtualBroncas <= 1} onClick={() => setPaginaBroncas((pagina) => Math.max(1, pagina - 1))} aria-label="Página anterior">
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span className="min-w-14 text-center text-xs font-extrabold text-content-secondary tabular-nums">{paginaAtualBroncas} / {totalPaginasBroncas}</span>
                  <Button type="button" size="icon" variant="outline" className="h-9 w-9" disabled={paginaAtualBroncas >= totalPaginasBroncas} onClick={() => setPaginaBroncas((pagina) => Math.min(totalPaginasBroncas, pagina + 1))} aria-label="Próxima página">
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </TabsContent>

          <TabsContent value="comments" className="mt-8">
            {comments.length > 0 ? (
              <motion.div className="space-y-4" variants={containerVariants} initial="hidden" animate="visible">
                {comments.map((comment) => (
                  <motion.div key={comment.id} variants={itemVariants}>
                    <Card className="bg-card border-border rounded-2xl overflow-hidden shadow-lg">
                      <CardContent className="p-4 md:p-6">
                        <p className="text-muted-foreground text-xs md:text-sm italic">"{comment.text}"</p>
                        <p className="text-[10px] md:text-xs text-muted-foreground mt-2">Em {new Date(comment.created_at).toLocaleDateString('pt-BR')} na bronca: <span className="font-semibold text-foreground">{comment.reportTitle || 'Bronca removida'}</span></p>
                      </CardContent>
                      <CardFooter className="p-3 md:p-4 bg-muted/50 flex justify-end items-center gap-2">
                        <div className="flex items-center gap-2 text-[10px] md:text-sm">
                          {getStatusInfo(comment.moderation_status).icon}
                          <span className={getStatusInfo(comment.moderation_status).color}>{getStatusInfo(comment.moderation_status).text}</span>
                        </div>
                      </CardFooter>
                    </Card>
                  </motion.div>
                ))}
              </motion.div>
            ) : (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center py-16 bg-card rounded-lg border border-border">
                <p className="text-2xl font-bold text-muted-foreground">Você ainda não comentou.</p>
                <p className="text-muted-foreground mt-2">Sua opinião é importante! Participe das discussões.</p>
              </motion.div>
            )}
          </TabsContent>

          <TabsContent value="guide" className="mt-8">
            <Card className="max-w-2xl mx-auto">
              <CardHeader>
                <CardTitle>Adicionar ao Guia Comercial</CardTitle>
                <CardDescription>Ajude a mapear os serviços e comércios da nossa cidade. Sua colaboração é muito importante!</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleNewEntrySubmit} className="space-y-4">
                  <div className="grid gap-2">
                    <Label htmlFor="name">Nome do Estabelecimento</Label>
                    <Input id="name" name="name" value={newEntry.name} onChange={handleNewEntryChange} placeholder="Ex: Supermercado Central" />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="address">Endereço</Label>
                    <Input id="address" name="address" value={newEntry.address} onChange={handleNewEntryChange} placeholder="Ex: Rua Principal, 123" />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="phone">Telefone</Label>
                    <Input id="phone" name="phone" value={newEntry.phone} onChange={handleNewEntryChange} placeholder="(87) 99999-8888" />
                  </div>
                  <div className="grid gap-2">
                    <Label>Tipo</Label>
                    <Combobox
                      options={[
                        { value: 'commerce', label: 'Comércio Local' },
                        { value: 'public', label: 'Serviço Público' }
                      ]}
                      value={newEntry.type}
                      onChange={(value) => setNewEntry(prev => ({ ...prev, type: value }))}
                      placeholder="Selecione o tipo"
                      searchPlaceholder="Buscar tipo..."
                      notFoundText="Tipo não encontrado"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label>Foto do Local (Opcional)</Label>
                    <div className="flex items-center gap-4">
                      {newEntry.photoPreview ? (
                        <img src={newEntry.photoPreview} alt="Pré-visualização" className="w-24 h-24 object-cover rounded-md border" />
                      ) : (
                        <div className="w-24 h-24 bg-muted rounded-md flex items-center justify-center text-muted-foreground">
                          <Building className="w-8 h-8" />
                        </div>
                      )}
                      <Button type="button" variant="outline" onClick={() => photoInputRef.current.click()}><Upload className="w-4 h-4 mr-2" />Enviar Foto</Button>
                      <input type="file" ref={photoInputRef} onChange={handlePhotoChange} className="hidden" accept="image/*" />
                    </div>
                  </div>
                  <Button type="submit" className="w-full gap-2"><Send className="w-4 h-4" /> Enviar para Moderação</Button>
                </form>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

      </div>
      {selectedReport && <ReportDetails report={selectedReport} onClose={handleCloseReportDetails} onUpdate={handleUpdateReport} onUpvote={handleUpvote} onLink={() => {}} />}
      
      <Dialog open={!!reportToDelete} onOpenChange={(open) => !open && setReportToDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar Exclusão</DialogTitle>
            <DialogDescription>
              Tem certeza que deseja remover a bronca "{reportToDelete?.title}"? Esta ação não pode ser desfeita.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReportToDelete(null)}>Cancelar</Button>
            <Button variant="destructive" onClick={handleDeleteReport}>Excluir</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {isReportModalOpen && (
        <ReportModal
          onClose={() => setIsReportModalOpen(false)}
          onSubmit={handleCreateReport}
        />
      )}
    </>
  );
};

export default UserDashboardPage;

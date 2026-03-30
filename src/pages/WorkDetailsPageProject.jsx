import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Capacitor } from "@capacitor/core";
import { Share } from "@capacitor/share";
import { supabase } from "@/lib/customSupabaseClient";
import { useAuth } from "@/contexts/SupabaseAuthContext";
import { toast } from "sonner";
import { getWorkShareUrl } from "@/lib/shareUtils";
import { formatCurrency, formatDate } from "@/lib/utils";
import { ObraHeader } from "@/components/project/obra/ObraHeader";
import { ObraCurrentPhase } from "@/components/project/obra/ObraCurrentPhase";
import { ObraProgress } from "@/components/project/obra/ObraProgress";
import { ObraTimeline } from "@/components/project/obra/ObraTimeline";
import { ObraFinancial } from "@/components/project/obra/ObraFinancial";
import { ObraPayments, ObraPaymentsSummary } from "@/components/project/obra/ObraPayments";
import { ObraGallery } from "@/components/project/obra/ObraGallery";
import { ObraPhases } from "@/components/project/obra/ObraPhases";
import { ObraContribution } from "@/components/project/obra/ObraContribution";
import { ObraLocation } from "@/components/project/obra/ObraLocation";
import { ObraRelatedLinks } from "@/components/project/obra/ObraRelatedLinks";
import { ObraHero } from "@/components/project/obra/ObraHero";
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
 
import { AlertTriangle, Briefcase, Calendar, Check, DollarSign, Download, FileText, Image as ImageIcon, Pencil, Trash2, Upload, Video, X, Heart, Share2 } from "lucide-react";
import MediaViewer from "@/components/MediaViewer";
import { WorkEditModal } from "@/pages/admin/ManageWorksPage";
import { useMobileHeader } from "@/contexts/MobileHeaderContext";
import { useNativeUIMode } from "@/contexts/NativeUIModeContext";

function formatDateDisplay(dateString) {
  if (!dateString) return "-";
  const d = new Date(dateString);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleDateString("pt-BR", { timeZone: "UTC" });
}

function getYouTubeVideoId(url) {
  const raw = String(url || "").trim();
  if (!raw) return null;
  try {
    const u = new URL(raw);
    const host = (u.hostname || "").replace(/^www\./, "");
    if (host === "youtu.be") {
      const id = u.pathname.replace("/", "").trim();
      return id || null;
    }
    if (host.endsWith("youtube.com")) {
      if (u.pathname === "/watch") {
        const id = u.searchParams.get("v");
        return id || null;
      }
      const parts = u.pathname.split("/").filter(Boolean);
      const idx = parts.findIndex((p) => ["embed", "shorts"].includes(p));
      if (idx >= 0 && parts[idx + 1]) return parts[idx + 1];
    }
  } catch {
    const m = raw.match(/(?:v=|\/embed\/|\/shorts\/|youtu\.be\/)([A-Za-z0-9_-]{6,})/);
    return m?.[1] || null;
  }
  return null;
}

function MeasurementMediaThumb({ item }) {
  const [errored, setErrored] = useState(false);
  const isVideoFile = item?.type === "video";
  const isVideoUrl = item?.type === "video_url";

  if (isVideoUrl) {
    const ytId = getYouTubeVideoId(item?.url);
    const thumbUrl = ytId ? `https://img.youtube.com/vi/${ytId}/hqdefault.jpg` : null;
    return (
      <div className="relative w-full h-full overflow-hidden">
        {thumbUrl && !errored ? (
          <img
            src={thumbUrl}
            alt={item?.description || item?.name || "Vídeo"}
            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
            loading="lazy"
            onError={() => setErrored(true)}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-slate-900 to-slate-700">
            <Video className="w-10 h-10 text-white/80" />
          </div>
        )}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="h-10 w-10 rounded-full bg-black/55 backdrop-blur border border-white/10 flex items-center justify-center shadow-sm">
            <Video className="h-5 w-5 text-white" />
          </div>
        </div>
      </div>
    );
  }

  if (isVideoFile) {
    return (
      <div className="relative w-full h-full overflow-hidden">
        {!errored && item?.url ? (
          <video
            src={item.url}
            preload="metadata"
            muted
            playsInline
            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
            onError={() => setErrored(true)}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-slate-900 to-slate-700">
            <Video className="w-10 h-10 text-white/80" />
          </div>
        )}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="h-10 w-10 rounded-full bg-black/55 backdrop-blur border border-white/10 flex items-center justify-center shadow-sm">
            <Video className="h-5 w-5 text-white" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <img
      src={item?.url}
      alt={item?.description || "Mídia"}
      className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
      loading="lazy"
      onError={(e) => {
        const el = e.currentTarget;
        el.style.display = "none";
      }}
    />
  );
}

function normalizeStatus(status) {
  const s = status || "planned";
  if (["planned", "tendered", "in-progress", "completed", "stalled", "unfinished"].includes(s)) return s;
  return "planned";
}

function parsePtBrNumber(value) {
  if (value == null) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  const cleaned = raw
    .replace(/\s/g, "")
    .replace(/^R\$\s?/, "")
    .replace(/\./g, "")
    .replace(",", ".");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function formatPtBrMoney(value) {
  const n = typeof value === "number" ? value : parsePtBrNumber(value);
  if (n == null) return "";
  return new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}

function maskMoneyWhileTyping(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (!digits) return "";
  const n = Number(digits) / 100;
  return formatPtBrMoney(n);
}

function getStatusInfo(status) {
  switch (normalizeStatus(status)) {
    case "in-progress":
      return { text: "Em Andamento", color: "text-blue-800", bg: "bg-gradient-to-r from-blue-50 to-blue-100" };
    case "completed":
      return { text: "Concluída", color: "text-emerald-800", bg: "bg-gradient-to-r from-emerald-50 to-emerald-100" };
    case "stalled":
      return { text: "Paralisada", color: "text-amber-800", bg: "bg-gradient-to-r from-amber-50 to-amber-100" };
    case "unfinished":
      return { text: "Inacabada", color: "text-rose-800", bg: "bg-gradient-to-r from-rose-50 to-rose-100" };
    case "planned":
      return { text: "Planejamento", color: "text-violet-800", bg: "bg-gradient-to-r from-violet-50 to-violet-100" };
    case "tendered":
      return { text: "Em Licitação", color: "text-orange-800", bg: "bg-gradient-to-r from-orange-50 to-orange-100" };
    default:
      return { text: "Não definido", color: "text-slate-700", bg: "bg-slate-100" };
  }
}

function formatCnpj(cnpj) {
  if (!cnpj) return "";
  const digits = String(cnpj).replace(/\D/g, "").padStart(14, "0").slice(-14);
  return digits.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
}

export default function WorkDetailsPageProject() {
  const { workId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { setTitle, setActions, setShowBack, setOnBack, reset } = useMobileHeader();
  const { isInteractive } = useNativeUIMode();

  const commitmentTypeOptions = useMemo(
    () => ["Estimativo", "Extra Orçamentário", "Global", "Ordinário"],
    []
  );

  const [loading, setLoading] = useState(true);
  const [work, setWork] = useState(null);
  const [measurements, setMeasurements] = useState([]);
  const [media, setMedia] = useState([]);
  const [isFavorited, setIsFavorited] = useState(false);
  const [selectedMeasurement, setSelectedMeasurement] = useState(null);
  const [mediaViewer, setMediaViewer] = useState({ isOpen: false, items: [], startIndex: 0 });
  const [showReportDialog, setShowReportDialog] = useState(false);
  const [showPaymentDialog, setShowPaymentDialog] = useState(false);
  const [isSavingPayment, setIsSavingPayment] = useState(false);
  const [editingPaymentId, setEditingPaymentId] = useState(null);
  const [isEditingCommitmentDate, setIsEditingCommitmentDate] = useState(false);
  const [isEditingCommitmentType, setIsEditingCommitmentType] = useState(false);
  const [currentPhaseView, setCurrentPhaseView] = useState("general");
  const [paymentTabMeasurementId, setPaymentTabMeasurementId] = useState("");
  const currentPhaseTopRef = useRef(null);
  const [paymentForm, setPaymentForm] = useState({
    measurement_id: "",
    commitment_date: "",
    payment_date: new Date().toISOString().split("T")[0],
    value: "",
    commitment_number: "",
    commitment_type: "",
    banking_order: "",
    installment: "",
    creditor_name: "",
    payment_description: "",
    portal_link: "",
  });
  const [showAdminEditModal, setShowAdminEditModal] = useState(false);
  const [workOptions, setWorkOptions] = useState({ categories: [], areas: [], bairros: [], contractors: [] });
  const [showCurrentPhaseEditDialog, setShowCurrentPhaseEditDialog] = useState(false);
  const [editingMeasurementId, setEditingMeasurementId] = useState(null);
  const [isSavingCurrentPhase, setIsSavingCurrentPhase] = useState(false);
  const [currentPhaseContractors, setCurrentPhaseContractors] = useState([]);
  const [showContribDialog, setShowContribDialog] = useState(false);
  const [contribDescription, setContribDescription] = useState("");
  const [contribVideoUrl, setContribVideoUrl] = useState("");
  const [contribFiles, setContribFiles] = useState([]);
  const [isSubmittingContribution, setIsSubmittingContribution] = useState(false);
  const contribFileInputRef = useRef(null);
  const documentFileInputRef = useRef(null);
  const [pendingDeleteDocument, setPendingDeleteDocument] = useState(null);
  const [isUploadingDocuments, setIsUploadingDocuments] = useState(false);
  const [renamingDocumentId, setRenamingDocumentId] = useState(null);
  const [renamingDocumentValue, setRenamingDocumentValue] = useState("");
  const [pageUpdatedAt, setPageUpdatedAt] = useState(null);
  const [currentPhaseForm, setCurrentPhaseForm] = useState({
    title: "",
    description: "",
    status: "planned",
    contractor_id: "",
    contract_number: "",
    bidding_process_number: "",
    contract_portal_link: "",
    bidding_process_portal_link: "",
    execution_percentage: "",
    value: "",
    expected_value: "",
    // amount_spent: "",
    execution_period_days: "",
    funding_source: [],
    funding_amount_federal: "",
    funding_amount_state: "",
    funding_amount_municipal: "",
    contract_signature_date: "",
    service_order_date: "",
    predicted_start_date: "",
    expected_end_date: "",
    start_date: "",
    end_date: "",
    stalled_date: "",
    inauguration_date: "",
  });

  const currentMeasurement = useMemo(() => {
    if (!Array.isArray(measurements) || measurements.length === 0) return null;
    return [...measurements].sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];
  }, [measurements]);


  useEffect(() => {
    setCurrentPhaseView("general");
  }, [currentMeasurement?.id]);

  useEffect(() => {
    if (currentPhaseView !== "payments") return;
    const el = currentPhaseTopRef.current;
    if (!el) return;
    requestAnimationFrame(() => {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, [currentPhaseView]);

  const openPaymentsView = useCallback(() => {
    if (currentMeasurement?.id) {
      setPaymentTabMeasurementId(currentMeasurement.id);
    } else if (measurements.length > 0) {
      setPaymentTabMeasurementId(measurements[0].id);
    }
    setCurrentPhaseView("payments");
  }, [currentMeasurement?.id, measurements]);

  const openGeneralView = useCallback(() => {
    setCurrentPhaseView("general");
    const el = currentPhaseTopRef.current;
    if (!el) return;
    requestAnimationFrame(() => {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, []);

  const touchPageUpdatedAt = useCallback(() => {
    setPageUpdatedAt(new Date().toISOString());
  }, []);

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

    if (pageUpdatedAt) candidates.push(new Date(pageUpdatedAt));

    const valid = candidates.filter((d) => d instanceof Date && !Number.isNaN(d.getTime()));
    if (valid.length === 0) return null;
    return new Date(Math.max(...valid.map((d) => d.getTime())));
  }, [media, measurements, pageUpdatedAt, work?.created_at, work?.updated_at]);

  const currentPhaseId = currentMeasurement?.id || "";

  const allPayments = useMemo(() => {
    return (measurements || []).flatMap((m) => (m.payments || []).map((p) => ({ ...p, measurement: m })));
  }, [measurements]);

  const totalPaidAllPhases = useMemo(() => {
    return allPayments.reduce((sum, p) => sum + (Number(p.value) || 0), 0);
  }, [allPayments]);

  const totalExpectedAllPhases = useMemo(() => {
    return (measurements || []).reduce((sum, m) => sum + (Number(m.expected_value) || 0), 0);
  }, [measurements]);

  const currentPhasePayments = useMemo(() => {
    if (!currentMeasurement?.id) return [];
    return allPayments.filter((p) => p.measurement_id === currentMeasurement.id);
  }, [allPayments, currentMeasurement?.id]);

  const currentPhaseTotalPaid = useMemo(() => {
    return currentPhasePayments.reduce((sum, p) => sum + (Number(p.value) || 0), 0);
  }, [currentPhasePayments]);

  const overallProgress = useMemo(() => {
    const pct = currentMeasurement?.execution_percentage ?? work?.execution_percentage ?? 0;
    return Math.max(0, Math.min(100, Number(pct) || 0));
  }, [currentMeasurement?.execution_percentage, work?.execution_percentage]);

  const phase = useMemo(() => {
    if (!currentMeasurement) return null;
    return {
      id: currentMeasurement.id,
      name: currentMeasurement.title || "Fase",
      description: currentMeasurement.description || "",
      contractor: {
        name: currentMeasurement.contractor?.name || "",
        cnpj: currentMeasurement.contractor?.cnpj ? formatCnpj(currentMeasurement.contractor.cnpj) : "",
      },
      contractNumber: currentMeasurement.contract_number || "",
      biddingProcessNumber: currentMeasurement.bidding_process_number || "",
      contractPortalLink: currentMeasurement.contract_portal_link || currentMeasurement.portal_link || "",
      biddingProcessPortalLink: currentMeasurement.bidding_process_portal_link || currentMeasurement.portal_link || "",
      status: normalizeStatus(currentMeasurement.status),
      executionPercentage: currentMeasurement.execution_percentage ?? 0,
      expectedValue: currentMeasurement.expected_value ?? 0,
      executionDays: currentMeasurement.execution_period_days ?? 0,
      contractSignatureDate: currentMeasurement.contract_signature_date || null,
      serviceOrderDate: currentMeasurement.service_order_date || null,
      predictedStartDate: currentMeasurement.predicted_start_date || null,
      expectedEndDate: currentMeasurement.expected_end_date || null,
      stalledDate: currentMeasurement.stalled_date || null,
      inaugurationDate: currentMeasurement.inauguration_date || null,
      endDate: currentMeasurement.end_date || null,
    };
  }, [currentMeasurement]);

  const phases = useMemo(() => {
    return (measurements || []).map((m) => ({
      id: m.id,
      name: m.title || "Fase",
      description: m.description || "",
      status: normalizeStatus(m.status),
      contractor: { name: m.contractor?.name || "", cnpj: m.contractor?.cnpj ? formatCnpj(m.contractor.cnpj) : "" },
      contractNumber: m.contract_number || "",
      biddingProcessNumber: m.bidding_process_number || "",
      contractPortalLink: m.contract_portal_link || m.portal_link || "",
      biddingProcessPortalLink: m.bidding_process_portal_link || m.portal_link || "",
      executionPercentage: m.execution_percentage ?? 0,
      predictedStartDate: m.predicted_start_date || null,
      startDate: m.start_date || null,
      expectedEndDate: m.expected_end_date || null,
      endDate: m.end_date || null,
      createdAt: m.created_at || null,
    }));
  }, [measurements]);

  const currentGalleries = useMemo(() => {
    if (!currentMeasurement?.id) return [];
    const viewable = (media || []).filter((m) => ["image", "photo", "video", "video_url"].includes(m.type) && m.measurement_id === currentMeasurement.id);
    const byName = new Map();
    viewable.forEach((item) => {
      const name = item.gallery_name || currentMeasurement.title || "Galeria";
      if (!byName.has(name)) byName.set(name, []);
      byName.get(name).push(item);
    });
    return [...byName.entries()].map(([name, items]) => ({ name, items }));
  }, [media, currentMeasurement?.id, currentMeasurement?.title]);

  const currentDocuments = useMemo(() => {
    if (!currentMeasurement?.id) return [];
    return (media || [])
      .filter((m) => (m.type === "pdf" || m.type === "document" || m.type === "file") && m.measurement_id === currentMeasurement.id)
      .map((d) => ({
        id: d.id,
        name: d.title || d.name || "Documento",
        url: d.url,
        date: d.created_at ? formatDateDisplay(d.created_at) : "",
      }));
  }, [media, currentMeasurement?.id]);

  const paymentsForComponent = useMemo(() => {
    const targetMeasurementId = paymentTabMeasurementId || currentMeasurement?.id;
    if (!targetMeasurementId) return [];

    const filteredPayments = allPayments.filter((p) => p.measurement_id === targetMeasurementId);
    const targetMeasurement = measurements.find((m) => m.id === targetMeasurementId);

    return filteredPayments.map((p) => ({
      id: p.id,
      commitment_date: p.commitment_date || "",
      payment_date: p.payment_date,
      created_at: p.created_at,
      date: formatDateDisplay(p.payment_date),
      orderNumber: p.commitment_number || p.banking_order || "",
      commitmentType: p.commitment_type || "",
      description: p.payment_description || "",
      installment: p.installment || "",
      contractor: p.creditor_name || targetMeasurement?.contractor?.name || "",
      value: Number(p.value) || 0,
      url: p.portal_link || "",
    }));
  }, [allPayments, currentMeasurement?.id, paymentTabMeasurementId, measurements]);

  const handleShareWork = useCallback(async () => {
    if (typeof window === "undefined" || !work) return;

    const url = getWorkShareUrl(work.id);
    const title = work.title;

    try {
      if (Capacitor.isNativePlatform()) {
        await Share.share({
          title,
          url,
          dialogTitle: "Compartilhar Obra",
        });
        return;
      }

      if (navigator.share) {
        await navigator.share({
          title,
          url,
        });
        return;
      }

      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(url);
        toast("Link copiado!", { description: "Cole nas suas redes sociais." });
        return;
      }
    } catch (error) {
      if (error?.name === "AbortError") return;
      try {
        await navigator.clipboard.writeText(url);
        toast("Link copiado!", { description: "Cole nas suas redes sociais." });
      } catch (e) {
        toast("Erro ao compartilhar", { variant: "destructive" });
      }
    }
  }, [work, workId]);

  const openViewer = useCallback((items, startIndex = 0) => {
    setMediaViewer({ isOpen: true, items: items || [], startIndex: startIndex || 0 });
  }, []);

  const closeViewer = useCallback(() => {
    setMediaViewer({ isOpen: false, items: [], startIndex: 0 });
  }, []);

  const fetchFavoriteStatus = useCallback(async () => {
    if (!user?.id || !workId) return;
    const { data } = await supabase
      .from("favorite_works")
      .select("work_id")
      .eq("user_id", user.id)
      .eq("work_id", workId)
      .maybeSingle();
    setIsFavorited(Boolean(data?.work_id));
  }, [user?.id, workId]);

  const loadData = useCallback(async () => {
    if (!workId) return;
    setLoading(true);
    try {
      const { data: workData, error: workError } = await supabase
        .from("public_works")
        .select("*, work_category:work_categories(name), bairro:bairros(name)")
        .eq("id", workId)
        .single();
      if (workError) throw workError;

      const { data: measurementsData, error: measurementsError } = await supabase
        .from("public_work_measurements")
        .select("*, contractor:contractor_id(id, name, cnpj), payments:public_work_payments(*)")
        .eq("work_id", workId)
        .order("created_at", { ascending: false });
      if (measurementsError) throw measurementsError;

      const { data: mediaData, error: mediaError } = await supabase
        .from("public_work_media")
        .select("*")
        .eq("work_id", workId)
        .order("created_at", { ascending: false });
      if (mediaError) throw mediaError;

      setWork(workData);
      setMeasurements(measurementsData || []);
      setMedia(mediaData || []);
    } catch (e) {
      toast("Erro ao carregar obra", { description: e?.message || "Tente novamente.", variant: "destructive" });
      navigate("/obras-publicas");
    } finally {
      setLoading(false);
    }
  }, [navigate, workId]);

  const handleFavoriteToggle = useCallback(async () => {
    if (!user?.id) {
      toast("Faça login para favoritar");
      return;
    }
    if (!workId) return;

    if (isFavorited) {
      await supabase.from("favorite_works").delete().eq("user_id", user.id).eq("work_id", workId);
      setIsFavorited(false);
      toast("Removido dos favoritos");
      return;
    }

    await supabase.from("favorite_works").insert({ user_id: user.id, work_id: workId });
    setIsFavorited(true);
    toast("Adicionado aos favoritos");
  }, [user?.id, workId, isFavorited]);

  useEffect(() => {
    if (!isInteractive) return;

    setShowBack(true);
    setOnBack(() => () => navigate("/obras-publicas", { replace: true }));
    setTitle(work?.title ? work.title : "Detalhes da Obra");

    if (!work) {
      setActions([]);
      return () => reset();
    }

    const headerActions = [];
    if (user?.is_admin) {
      headerActions.push({
        key: "manage",
        icon: Pencil,
        onPress: () => setShowAdminEditModal(true),
        ariaLabel: "Gerenciar",
      });
    }

    headerActions.push(
      {
        key: "share",
        icon: Share2,
        onPress: handleShareWork,
        ariaLabel: "Compartilhar",
      },
      {
        key: "favorite",
        icon: Heart,
        onPress: handleFavoriteToggle,
        isActive: !!isFavorited,
        ariaLabel: isFavorited ? "Remover dos favoritos" : "Favoritar",
        iconClassName: isFavorited ? "text-yellow-300 fill-current" : "",
      }
    );

    setActions(headerActions);
    return () => reset();
  }, [handleFavoriteToggle, handleShareWork, isFavorited, isInteractive, navigate, reset, setActions, setOnBack, setShowBack, setTitle, user?.is_admin, work]);

  const handleOpenContrib = useCallback(() => {
    if (!user) {
      toast("Faça login para contribuir", { description: "Você precisa entrar para enviar fotos ou dados.", variant: "destructive" });
      navigate("/login");
      return;
    }
    setShowContribDialog(true);
  }, [navigate, user]);

  const handleContribFilesChange = useCallback((e) => {
    const files = Array.from(e.target.files || []);
    setContribFiles(files);
  }, []);

  const handleSubmitContribution = useCallback(async () => {
    if (!user || !work || isSubmittingContribution) return;
    if (!currentMeasurement?.id) {
      toast("Fase não encontrada", { description: "Cadastre uma fase para enviar contribuições.", variant: "destructive" });
      return;
    }

    setIsSubmittingContribution(true);
    try {
      if (contribFiles.length > 0) {
        for (const file of contribFiles) {
          const path = `measurements/${currentMeasurement.id}/${Date.now()}-${file.name}`;
          const { error: uploadError } = await supabase.storage.from("work-media").upload(path, file);
          if (uploadError) throw uploadError;

          const {
            data: { publicUrl },
          } = supabase.storage.from("work-media").getPublicUrl(path);

          let type = "file";
          if (file.type.startsWith("image")) type = "image";
          else if (file.type.startsWith("video")) type = "video";
          else if (file.type === "application/pdf") type = "pdf";

          const { error: dbError } = await supabase.from("public_work_media").insert({
            work_id: work.id,
            measurement_id: currentMeasurement.id,
            url: publicUrl,
            type,
            name: file.name,
            description: contribDescription || null,
            status: "pending",
            gallery_name: currentMeasurement.title || "Contribuições",
            contributor_id: user.id,
          });
          if (dbError) throw dbError;
        }
      }

      if (contribVideoUrl && String(contribVideoUrl).trim().length > 0) {
        const { error: linkErr } = await supabase.from("public_work_media").insert({
          work_id: work.id,
          measurement_id: currentMeasurement.id,
          url: String(contribVideoUrl).trim(),
          type: "video_url",
          name: "Vídeo do cidadão",
          description: contribDescription || null,
          status: "pending",
          gallery_name: currentMeasurement.title || "Contribuições",
          contributor_id: user.id,
        });
        if (linkErr) throw linkErr;
      }

      toast("Contribuição enviada!", { description: "Obrigado por colaborar com transparência." });
      touchPageUpdatedAt();
      setShowContribDialog(false);
      setContribDescription("");
      setContribVideoUrl("");
      setContribFiles([]);
      if (contribFileInputRef.current) contribFileInputRef.current.value = "";
      await loadData();
    } catch (error) {
      toast("Erro ao enviar contribuição", { description: error?.message || "Tente novamente.", variant: "destructive" });
    } finally {
      setIsSubmittingContribution(false);
    }
  }, [contribDescription, contribFiles, contribVideoUrl, currentMeasurement?.id, currentMeasurement?.title, isSubmittingContribution, loadData, touchPageUpdatedAt, user, work]);

  const handleRenameGallery = useCallback(
    async (oldName, newName) => {
      if (!user?.is_admin) return;
      if (!work?.id || !currentMeasurement?.id) return;
      const fromName = String(oldName || "").trim();
      const toName = String(newName || "").trim();
      if (!fromName || !toName || fromName === toName) return;

      const { error } = await supabase
        .from("public_work_media")
        .update({ gallery_name: toName })
        .eq("work_id", work.id)
        .eq("measurement_id", currentMeasurement.id)
        .eq("gallery_name", fromName);

      if (error) {
        toast("Erro ao renomear galeria", { description: error.message, variant: "destructive" });
        return;
      }
      toast("Galeria atualizada");
      touchPageUpdatedAt();
      await loadData();
    },
    [currentMeasurement?.id, loadData, touchPageUpdatedAt, user?.is_admin, work?.id]
  );

  const handleUpdateMediaItem = useCallback(
    async (mediaId, patch) => {
      if (!user?.is_admin) return;
      const id = String(mediaId || "").trim();
      if (!id) return;

      const { error } = await supabase.from("public_work_media").update(patch || {}).eq("id", id);
      if (error) {
        toast("Erro ao atualizar mídia", { description: error.message, variant: "destructive" });
        return;
      }
      toast("Mídia atualizada");
      touchPageUpdatedAt();
      setMedia((prev) => (Array.isArray(prev) ? prev.map((m) => (m?.id === id ? { ...m, ...(patch || {}) } : m)) : prev));
    },
    [toast, touchPageUpdatedAt, user?.is_admin]
  );

  const handleDeleteMediaItem = useCallback(
    async (mediaId, mediaUrl) => {
      if (!user?.is_admin) return;
      const id = String(mediaId || "").trim();
      if (!id) return;

      const { error } = await supabase.from("public_work_media").delete().eq("id", id);
      if (error) {
        toast("Erro ao remover mídia", { description: error.message, variant: "destructive" });
        return;
      }

      try {
        const filePath = new URL(mediaUrl).pathname.split("/work-media/")[1];
        if (filePath) {
          await supabase.storage.from("work-media").remove([decodeURIComponent(filePath)]);
        }
      } catch (e) {
      }

      toast("Mídia removida");
      touchPageUpdatedAt();
      setMedia((prev) => (Array.isArray(prev) ? prev.filter((m) => m?.id !== id) : prev));
    },
    [toast, touchPageUpdatedAt, user?.is_admin]
  );

  const handleBulkUpdateMediaItems = useCallback(
    async (mediaIds, patch) => {
      if (!user?.is_admin) return;
      const ids = Array.isArray(mediaIds) ? mediaIds.map((x) => String(x).trim()).filter(Boolean) : [];
      if (ids.length === 0) return;

      const { error } = await supabase.from("public_work_media").update(patch || {}).in("id", ids);
      if (error) {
        toast("Erro ao atualizar mídias", { description: error.message, variant: "destructive" });
        return;
      }
      toast("Mídias atualizadas");
      touchPageUpdatedAt();
      const setIds = new Set(ids);
      setMedia((prev) => (Array.isArray(prev) ? prev.map((m) => (setIds.has(m?.id) ? { ...m, ...(patch || {}) } : m)) : prev));
    },
    [toast, touchPageUpdatedAt, user?.is_admin]
  );

  const handleBulkDeleteMediaItems = useCallback(
    async (items) => {
      if (!user?.is_admin) return;
      const list = Array.isArray(items) ? items : [];
      const ids = list.map((i) => i?.id).filter(Boolean);
      if (ids.length === 0) return;

      const { error } = await supabase.from("public_work_media").delete().in("id", ids);
      if (error) {
        toast("Erro ao remover mídias", { description: error.message, variant: "destructive" });
        return;
      }

      const paths = list
        .map((i) => i?.url)
        .filter(Boolean)
        .map((url) => {
          try {
            const filePath = new URL(url).pathname.split("/work-media/")[1];
            return filePath ? decodeURIComponent(filePath) : null;
          } catch (e) {
            return null;
          }
        })
        .filter(Boolean);

      if (paths.length > 0) {
        try {
          await supabase.storage.from("work-media").remove(paths);
        } catch (e) {
        }
      }

      toast("Mídias removidas");
      touchPageUpdatedAt();
      const setIds = new Set(ids);
      setMedia((prev) => (Array.isArray(prev) ? prev.filter((m) => !setIds.has(m?.id)) : prev));
    },
    [toast, touchPageUpdatedAt, user?.is_admin]
  );

  const handleDeleteGallery = useCallback(
    async (galleryName, items) => {
      if (!user?.is_admin) return;
      const name = String(galleryName || "").trim();
      if (!name) return;
      const list = Array.isArray(items) ? items : [];
      const ids = list.map((i) => i?.id).filter(Boolean);

      if (ids.length === 0) return;

      const { error } = await supabase.from("public_work_media").delete().in("id", ids);
      if (error) {
        toast("Erro ao excluir galeria", { description: error.message, variant: "destructive" });
        return;
      }

      const paths = list
        .map((i) => i?.url)
        .filter(Boolean)
        .map((url) => {
          try {
            const filePath = new URL(url).pathname.split("/work-media/")[1];
            return filePath ? decodeURIComponent(filePath) : null;
          } catch (e) {
            return null;
          }
        })
        .filter(Boolean);

      if (paths.length > 0) {
        try {
          await supabase.storage.from("work-media").remove(paths);
        } catch (e) {
        }
      }

      toast("Galeria excluída");
      touchPageUpdatedAt();
      setMedia((prev) => (Array.isArray(prev) ? prev.filter((m) => !ids.includes(m?.id)) : prev));
    },
    [toast, touchPageUpdatedAt, user?.is_admin]
  );

  const handleUploadGalleryFiles = useCallback(
    async (galleryName, files) => {
      if (!user?.is_admin) return;
      if (!work?.id || !currentMeasurement?.id) return;
      const list = Array.isArray(files) ? files : [];
      const images = list.filter((f) => f?.type?.startsWith("image/"));
      if (images.length === 0) {
        toast("Nenhuma imagem selecionada", { variant: "destructive" });
        return;
      }

      const targetGalleryName = String(galleryName || "").trim() || currentMeasurement.title || "Geral";

      try {
        for (const file of images) {
          const fileExt = file.name.split(".").pop();
          const fileName = `${Date.now()}-${Math.random().toString(36).substring(2, 10)}.${fileExt}`;
          const path = `measurements/${currentMeasurement.id}/${fileName}`;

          const { error: uploadError } = await supabase.storage.from("work-media").upload(path, file);
          if (uploadError) throw uploadError;

          const {
            data: { publicUrl },
          } = supabase.storage.from("work-media").getPublicUrl(path);

          const type = "photo";

          const { data: inserted, error: dbError } = await supabase
            .from("public_work_media")
            .insert({
              work_id: work.id,
              measurement_id: currentMeasurement.id,
              url: publicUrl,
              type,
              name: file.name,
              status: "approved",
              gallery_name: targetGalleryName,
              contributor_id: user.id,
            })
            .select("*")
            .single();
          if (dbError) throw dbError;
          if (inserted) {
            setMedia((prev) => (Array.isArray(prev) ? [inserted, ...prev] : prev));
          }
        }

        toast("Imagens adicionadas", { description: "Os arquivos foram enviados para a galeria." });
        touchPageUpdatedAt();
      } catch (e) {
        toast("Erro ao enviar arquivos", { description: e?.message || "Tente novamente.", variant: "destructive" });
      }
    },
    [currentMeasurement?.id, currentMeasurement?.title, toast, touchPageUpdatedAt, user?.id, user?.is_admin, work?.id]
  );

  const handleUploadDocuments = useCallback(
    async (files) => {
      if (!user?.is_admin) return;
      if (!work?.id || !currentMeasurement?.id) return;
      const list = Array.isArray(files) ? files : [];
      if (list.length === 0) return;

      setIsUploadingDocuments(true);
      try {
        for (const file of list) {
          const fileExt = file.name.split(".").pop();
          const fileName = `${Date.now()}-${Math.random().toString(36).substring(2, 10)}.${fileExt}`;
          const path = `measurements/${currentMeasurement.id}/documents/${fileName}`;

          const { error: uploadError } = await supabase.storage.from("work-media").upload(path, file);
          if (uploadError) throw uploadError;

          const {
            data: { publicUrl },
          } = supabase.storage.from("work-media").getPublicUrl(path);

          const type = file.type === "application/pdf" ? "pdf" : "file";

          const { data: inserted, error: dbError } = await supabase
            .from("public_work_media")
            .insert({
              work_id: work.id,
              measurement_id: currentMeasurement.id,
              url: publicUrl,
              type,
              name: file.name,
              status: "approved",
              gallery_name: null,
              contributor_id: user.id,
            })
            .select("*")
            .single();
          if (dbError) throw dbError;
          if (inserted) {
            setMedia((prev) => (Array.isArray(prev) ? [inserted, ...prev] : prev));
          }
        }

        toast("Documento(s) adicionado(s)");
        touchPageUpdatedAt();
      } catch (e) {
        toast("Erro ao enviar documentos", { description: e?.message || "Tente novamente.", variant: "destructive" });
      } finally {
        setIsUploadingDocuments(false);
      }
    },
    [currentMeasurement?.id, toast, touchPageUpdatedAt, user?.id, user?.is_admin, work?.id]
  );

  const validateCurrentPhaseDates = useCallback((data) => {
    const errors = {};
    const start = data.start_date;
    const end = data.end_date;
    const predictedStart = data.predicted_start_date;
    const expectedEnd = data.expected_end_date;

    if (start && end && start > end) {
      errors.start_date = "Início posterior ao término.";
      errors.end_date = "Término anterior ao início.";
    }

    if (predictedStart && expectedEnd && predictedStart > expectedEnd) {
      errors.predicted_start_date = "Início posterior à conclusão.";
      errors.expected_end_date = "Conclusão anterior ao início.";
    }

    return errors;
  }, []);

  const syncWorkFromLatestMeasurement = useCallback(async () => {
    if (!workId) return;
    try {
      const { data: latest, error: latestError } = await supabase
        .from("public_work_measurements")
        .select(
          "status, execution_percentage, contractor_id, funding_source, execution_period_days, expected_value, predicted_start_date, start_date, end_date, expected_end_date, service_order_date, contract_signature_date, inauguration_date, stalled_date"
        )
        .eq("work_id", workId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (latestError) throw latestError;
      if (!latest) return;

      const workPayload = {
        status: latest.status,
        execution_percentage: latest.execution_percentage,
        contractor_id: latest.contractor_id,
        funding_source: Array.isArray(latest.funding_source) ? latest.funding_source : [],
        execution_period_days: latest.execution_period_days,
        total_value: latest.expected_value,
        predicted_start_date: latest.predicted_start_date,
        start_date: latest.start_date,
        end_date: latest.end_date,
        expected_end_date: latest.expected_end_date,
        service_order_date: latest.service_order_date,
        contract_signature_date: latest.contract_signature_date,
        inauguration_date: latest.inauguration_date,
        stalled_date: latest.stalled_date,
      };

      const { error: workUpdateError } = await supabase.from("public_works").update(workPayload).eq("id", workId);
      if (workUpdateError) throw workUpdateError;
    } catch (error) {
      console.error("Error syncing work from latest measurement:", error);
    }
  }, [workId]);

  

  const ensureContractorsLoaded = useCallback(async () => {
    if (currentPhaseContractors.length > 0) return;
    const { data, error } = await supabase.from("contractors").select("*").order("name");
    if (error) throw error;
    setCurrentPhaseContractors(data || []);
  }, [currentPhaseContractors.length]);

  const loadWorkOptions = useCallback(async () => {
    const [categoriesRes, areasRes, bairrosRes, contractorsRes] = await Promise.all([
      supabase.from("work_categories").select("*").order("name"),
      supabase.from("work_areas").select("*").order("name"),
      supabase.from("bairros").select("*").order("name"),
      supabase.from("contractors").select("*").order("name"),
    ]);

    if (categoriesRes.error) throw categoriesRes.error;
    if (areasRes.error) throw areasRes.error;
    if (bairrosRes.error) throw bairrosRes.error;
    if (contractorsRes.error) throw contractorsRes.error;

    setWorkOptions({
      categories: categoriesRes.data || [],
      areas: areasRes.data || [],
      bairros: bairrosRes.data || [],
      contractors: contractorsRes.data || [],
    });
  }, []);

  const openPhaseEditDialog = useCallback(
    async (measurementId) => {
      if (!user?.is_admin) return;
      const m = measurements.find((x) => x.id === measurementId) || null;
      if (!m) {
        toast("Fase não encontrada", { variant: "destructive" });
        return;
      }

      try {
        await ensureContractorsLoaded();
        setEditingMeasurementId(measurementId);
        setCurrentPhaseForm({
          title: m.title || "",
          description: m.description || "",
          status: normalizeStatus(m.status),
          contractor_id: m.contractor_id || "",
          contract_number: m.contract_number || "",
          bidding_process_number: m.bidding_process_number || "",
          contract_portal_link: m.contract_portal_link || m.portal_link || "",
          bidding_process_portal_link: m.bidding_process_portal_link || m.portal_link || "",
          execution_percentage: m.execution_percentage ?? "",
          value: m.value != null ? formatPtBrMoney(m.value) : "",
          expected_value: m.expected_value != null ? formatPtBrMoney(m.expected_value) : "",
          execution_period_days: m.execution_period_days ?? "",
          funding_source: Array.isArray(m.funding_source) ? m.funding_source.map((src) => (src === "state" ? "estadual" : src)) : [],
          funding_amount_federal: m.funding_amount_federal != null ? formatPtBrMoney(m.funding_amount_federal) : "",
          funding_amount_state: m.funding_amount_state != null ? formatPtBrMoney(m.funding_amount_state) : "",
          funding_amount_municipal: m.funding_amount_municipal != null ? formatPtBrMoney(m.funding_amount_municipal) : "",
          contract_signature_date: m.contract_signature_date || "",
          service_order_date: m.service_order_date || "",
          predicted_start_date: m.predicted_start_date || "",
          expected_end_date: m.expected_end_date || "",
          start_date: m.start_date || "",
          end_date: m.end_date || "",
          stalled_date: m.stalled_date || "",
          inauguration_date: m.inauguration_date || "",
        });
        setShowCurrentPhaseEditDialog(true);
      } catch (e) {
        toast("Erro ao abrir edição", { description: e?.message || "Tente novamente.", variant: "destructive" });
      }
    },
    [ensureContractorsLoaded, measurements, toast, user?.is_admin]
  );

  const openCurrentPhaseEditDialog = useCallback(() => {
    if (!user?.is_admin) return;
    if (!currentMeasurement?.id) return;
    openPhaseEditDialog(currentMeasurement.id);
  }, [currentMeasurement?.id, openPhaseEditDialog, user?.is_admin]);

  const handleSaveCurrentPhase = useCallback(async () => {
    if (!user?.is_admin) return;
    const targetMeasurementId = editingMeasurementId || currentMeasurement?.id;
    if (!targetMeasurementId) return;

    const title = String(currentPhaseForm.title || "").trim();
    if (!title) {
      toast("Título obrigatório", { description: "Informe o nome da fase.", variant: "destructive" });
      return;
    }

    const dateErrors = validateCurrentPhaseDates(currentPhaseForm);
    const hasDateErrors = Object.keys(dateErrors).length > 0;
    if (hasDateErrors) {
      toast("Datas inválidas", { description: Object.values(dateErrors)[0], variant: "destructive" });
      return;
    }

    const toNumberOrNull = (v) => parsePtBrNumber(v);

    const toIntOrNull = (v) => {
      const n = toNumberOrNull(v);
      if (n == null) return null;
      return Math.trunc(n);
    };

    const pct = parsePtBrNumber(currentPhaseForm.execution_percentage);
    const pctClamped = pct == null ? null : Math.max(0, Math.min(100, pct));

    setIsSavingCurrentPhase(true);
    try {
      const payload = {
        title,
        description: currentPhaseForm.description ? String(currentPhaseForm.description) : null,
        status: normalizeStatus(currentPhaseForm.status),
        contractor_id: currentPhaseForm.contractor_id || null,
        contract_number: currentPhaseForm.contract_number || null,
        bidding_process_number: currentPhaseForm.bidding_process_number || null,
        contract_portal_link: currentPhaseForm.contract_portal_link || null,
        bidding_process_portal_link: currentPhaseForm.bidding_process_portal_link || null,
        portal_link: currentPhaseForm.contract_portal_link || currentPhaseForm.bidding_process_portal_link || null,
        execution_percentage: pctClamped,
        value: toNumberOrNull(currentPhaseForm.value),
        expected_value: toNumberOrNull(currentPhaseForm.expected_value),
        // amount_spent: toNumberOrNull(currentPhaseForm.amount_spent),
        execution_period_days: toIntOrNull(currentPhaseForm.execution_period_days),
        funding_source: Array.isArray(currentPhaseForm.funding_source)
          ? currentPhaseForm.funding_source.map((src) => (src === "state" ? "estadual" : src))
          : [],
        funding_amount_federal: toNumberOrNull(currentPhaseForm.funding_amount_federal),
        funding_amount_state: toNumberOrNull(currentPhaseForm.funding_amount_state),
        funding_amount_municipal: toNumberOrNull(currentPhaseForm.funding_amount_municipal),
        contract_signature_date: currentPhaseForm.contract_signature_date || null,
        service_order_date: currentPhaseForm.service_order_date || null,
        predicted_start_date: currentPhaseForm.predicted_start_date || null,
        expected_end_date: currentPhaseForm.expected_end_date || null,
        start_date: currentPhaseForm.start_date || null,
        end_date: currentPhaseForm.end_date || null,
        stalled_date: currentPhaseForm.stalled_date || null,
        inauguration_date: currentPhaseForm.inauguration_date || null,
      };

      const { error } = await supabase.from("public_work_measurements").update(payload).eq("id", targetMeasurementId);
      if (error) throw error;

      await syncWorkFromLatestMeasurement();
      toast("Fase atualizada", { description: "As informações foram salvas com sucesso." });
      touchPageUpdatedAt();
      setShowCurrentPhaseEditDialog(false);
      setEditingMeasurementId(null);
      await loadData();
    } catch (e) {
      toast("Erro ao salvar fase", { description: e?.message || "Tente novamente.", variant: "destructive" });
    } finally {
      setIsSavingCurrentPhase(false);
    }
  }, [
    currentMeasurement?.id,
    currentPhaseForm,
    editingMeasurementId,
    loadData,
    syncWorkFromLatestMeasurement,
    touchPageUpdatedAt,
    user?.is_admin,
    validateCurrentPhaseDates,
  ]);

  const handleAdminSaveWork = useCallback(
    async (workToSave) => {
      try {
        const { id, location, ...payload } = workToSave;

        const locationString =
          location && typeof location === "object" && location.lat != null && location.lng != null
            ? `POINT(${location.lng} ${location.lat})`
            : null;

        const cleanedPayload = { ...payload, location: locationString };
        delete cleanedPayload.bairro;
        delete cleanedPayload.work_category;
        delete cleanedPayload.work_area;
        delete cleanedPayload.contractor;

        const { error } = await supabase.from("public_works").update(cleanedPayload).eq("id", id);
        if (error) throw error;

        toast("Obra atualizada com sucesso!");
        touchPageUpdatedAt();
        setShowAdminEditModal(false);
        await loadData();
      } catch (e) {
        toast("Erro ao salvar obra", { description: e?.message || "Tente novamente.", variant: "destructive" });
      }
    },
    [loadData, touchPageUpdatedAt]
  );

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (!showAdminEditModal) return;
    loadWorkOptions().catch((e) => {
      toast("Erro ao carregar opções", { description: e?.message || "Tente novamente.", variant: "destructive" });
    });
  }, [loadWorkOptions, showAdminEditModal]);

  useEffect(() => {
    fetchFavoriteStatus();
  }, [fetchFavoriteStatus]);

  const openNewPaymentDialog = useCallback(() => {
    const defaultMeasurement = currentMeasurement || measurements?.[0] || null;
    const defaultMeasurementId = defaultMeasurement?.id || "";
    const defaultCreditorName = defaultMeasurement?.contractor?.name || "";
    setEditingPaymentId(null);
    setIsEditingCommitmentDate(false);
    setIsEditingCommitmentType(false);
    setPaymentForm({
      measurement_id: defaultMeasurementId,
      commitment_date: "",
      payment_date: new Date().toISOString().split("T")[0],
      value: "",
      commitment_number: "",
      commitment_type: "",
      banking_order: "",
      installment: "",
      creditor_name: defaultCreditorName,
      payment_description: "",
      portal_link: "",
    });
    setShowPaymentDialog(true);
  }, [currentMeasurement, measurements]);

  const openEditPaymentDialog = useCallback(
    (payment) => {
      if (!user?.is_admin) return;
      const id = payment?.id || null;
      if (!id) return;
      const raw = currentPhasePayments.find((p) => p.id === id) || null;
      const measurementId = raw?.measurement_id || currentMeasurement?.id || "";
      const numericValue = Number(raw?.value ?? payment?.value ?? 0);
      setEditingPaymentId(id);
      setIsEditingCommitmentDate(false);
      setIsEditingCommitmentType(false);
      setPaymentForm({
        measurement_id: measurementId,
        commitment_date: raw?.commitment_date || payment?.commitment_date || "",
        payment_date: raw?.payment_date || payment?.payment_date || new Date().toISOString().split("T")[0],
        value: formatPtBrMoney(numericValue),
        commitment_number: raw?.commitment_number || payment?.orderNumber || "",
        commitment_type: raw?.commitment_type || payment?.commitmentType || "",
        banking_order: raw?.banking_order || "",
        installment: raw?.installment || payment?.installment || "",
        creditor_name: raw?.creditor_name || payment?.contractor || phase?.contractor?.name || "",
        payment_description: raw?.payment_description || payment?.description || "",
        portal_link: raw?.portal_link || payment?.url || "",
      });
      setShowPaymentDialog(true);
    },
    [currentMeasurement?.id, currentPhasePayments, phase?.contractor?.name, user?.is_admin]
  );

  useEffect(() => {
    const commitmentNumber = String(paymentForm.commitment_number || "").trim();
    if (!commitmentNumber) {
      if (!editingPaymentId) {
        setPaymentForm((prev) => ({ ...prev, commitment_date: "", commitment_type: "" }));
      }
      return;
    }

    const commitmentType = String(paymentForm.commitment_type || "").trim();
    const candidates = allPayments.filter(
      (p) => String(p.commitment_number || "").trim() === commitmentNumber && (p.commitment_date || p.commitment_type)
    );

    const filteredByType = commitmentType
      ? candidates.filter((p) => String(p.commitment_type || "").trim() === commitmentType)
      : candidates;

    const typeSet = new Set(candidates.map((p) => String(p.commitment_type || "").trim()).filter(Boolean));
    const dateSet = new Set(filteredByType.map((p) => String(p.commitment_date || "").trim()).filter(Boolean));
    const existingPayment =
      filteredByType.length > 0
        ? dateSet.size <= 1
          ? filteredByType[0]
          : null
        : !commitmentType && typeSet.size === 1
          ? candidates[0]
          : null;

    if (existingPayment) {
      setPaymentForm((prev) => ({
        ...prev,
        commitment_date: !isEditingCommitmentDate ? existingPayment.commitment_date || prev.commitment_date : prev.commitment_date,
        commitment_type: !isEditingCommitmentType ? existingPayment.commitment_type || prev.commitment_type : prev.commitment_type,
      }));
    } else if (!editingPaymentId) {
      setPaymentForm((prev) => ({
        ...prev,
        commitment_date: !isEditingCommitmentDate ? "" : prev.commitment_date,
      }));
    }
  }, [paymentForm.commitment_number, paymentForm.commitment_type, allPayments, editingPaymentId, isEditingCommitmentDate, isEditingCommitmentType]);

  const handleSavePayment = useCallback(async () => {
    if (!user?.is_admin) return;
    if (!paymentForm.measurement_id) {
      toast("Selecione uma fase", { variant: "destructive" });
      return;
    }

    const numericValue = parsePtBrNumber(paymentForm.value);
    if (!numericValue || numericValue <= 0) {
      toast("Valor inválido", { description: "Informe um valor maior que zero.", variant: "destructive" });
      return;
    }

    setIsSavingPayment(true);
    try {
      const previousPayment = editingPaymentId ? allPayments.find((p) => p.id === editingPaymentId) || null : null;
      const payload = {
        measurement_id: paymentForm.measurement_id,
        commitment_date: paymentForm.commitment_date || null,
        payment_date: paymentForm.payment_date,
        value: numericValue,
        commitment_number: paymentForm.commitment_number || null,
        commitment_type: paymentForm.commitment_type || null,
        banking_order: paymentForm.banking_order || null,
        installment: paymentForm.installment || null,
        creditor_name: paymentForm.creditor_name || null,
        payment_description: paymentForm.payment_description || null,
        portal_link: paymentForm.portal_link || null,
      };

      if (editingPaymentId) {
        const { error } = await supabase.from("public_work_payments").update(payload).eq("id", editingPaymentId);
        if (error) throw error;

        const prevNumber = previousPayment?.commitment_number || null;
        const prevType = previousPayment?.commitment_type || null;
        const prevDate = previousPayment?.commitment_date || null;
        const updateObj = {};
        if (payload.commitment_date) updateObj.commitment_date = payload.commitment_date;
        if (payload.commitment_type) updateObj.commitment_type = payload.commitment_type;

        if (prevNumber && prevType && prevDate && Object.keys(updateObj).length > 0) {
          const { error: batchError } = await supabase
            .from("public_work_payments")
            .update(updateObj)
            .eq("commitment_number", prevNumber)
            .eq("commitment_type", prevType)
            .eq("commitment_date", prevDate);
          if (batchError) console.error("Erro ao atualizar empenho em lote:", batchError);
        }
      } else {
        const { error } = await supabase.from("public_work_payments").insert(payload);
        if (error) throw error;

        const updateObj = {};
        if (payload.commitment_date) updateObj.commitment_date = payload.commitment_date;
        if (payload.commitment_type) updateObj.commitment_type = payload.commitment_type;

        if (payload.commitment_number && payload.commitment_type && payload.commitment_date && Object.keys(updateObj).length > 0) {
          const { error: batchError } = await supabase
            .from("public_work_payments")
            .update(updateObj)
            .eq("commitment_number", payload.commitment_number)
            .eq("commitment_type", payload.commitment_type)
            .is("commitment_date", null);
          if (batchError) console.error("Erro ao atualizar empenho em lote:", batchError);
        }
      }

      toast("Pagamento salvo", { description: "O pagamento foi salvo com sucesso." });
      touchPageUpdatedAt();
      setShowPaymentDialog(false);
      setEditingPaymentId(null);
      await loadData();
    } catch (e) {
      toast("Erro ao salvar pagamento", { description: e?.message || "Tente novamente.", variant: "destructive" });
    } finally {
      setIsSavingPayment(false);
    }
  }, [editingPaymentId, loadData, paymentForm, touchPageUpdatedAt, user?.is_admin, workId, allPayments]);

  const handleDeletePayment = useCallback(
    async (payment) => {
      if (!user?.is_admin) return;
      const id = payment?.id || null;
      if (!id) return;
      if (!window.confirm("Excluir este pagamento?")) return;

      try {
        const { error } = await supabase.from("public_work_payments").delete().eq("id", id);
        if (error) throw error;
        toast("Pagamento excluído", { description: "O pagamento foi removido com sucesso." });
        touchPageUpdatedAt();
        await loadData();
      } catch (e) {
        toast("Erro ao excluir pagamento", { description: e?.message || "Tente novamente.", variant: "destructive" });
      }
    },
    [loadData, touchPageUpdatedAt, user?.is_admin]
  );

  const openMeasurementDetails = useCallback(
    (measurementId) => {
      const m = measurements.find((x) => x.id === measurementId) || null;
      if (!m) return;
      const phaseMedia = (media || []).filter((x) => x.measurement_id === m.id && ["image", "photo", "video", "video_url"].includes(x.type));
      const phaseDocs = (media || []).filter(
        (x) => x.measurement_id === m.id && (x.type === "pdf" || x.type === "document" || x.type === "file")
      );
      setSelectedMeasurement({ ...m, media: phaseMedia, docs: phaseDocs, payments: Array.isArray(m.payments) ? m.payments : [] });
    },
    [measurements, media]
  );

  const heroImageUrl = useMemo(() => {
    if (!work) return null;
    if (work.thumbnail_url) return work.thumbnail_url;

    const list = Array.isArray(media) ? media : [];
    const normalized = (value) => String(value || "").trim().toLowerCase();

    const candidates = list.filter((m) => {
      if (!m?.url) return false;
      if (m.status && m.status !== "approved") return false;
      if (!["photo", "image"].includes(m.type)) return false;
      const name = normalized(m.gallery_name);
      return name === "galeria geral" || name === "geral" || name === "";
    });

    candidates.sort((a, b) => {
      const an = normalized(a.gallery_name);
      const bn = normalized(b.gallery_name);
      const score = (n) => (n === "galeria geral" ? 0 : n === "geral" ? 1 : 2);
      return score(an) - score(bn);
    });

    return candidates[0]?.url || null;
  }, [media, work]);

  const existingCommitmentData = useMemo(() => {
    const commitmentNumber = String(paymentForm.commitment_number || "").trim();
    if (!commitmentNumber) return { date: null, type: null };
    const commitmentType = String(paymentForm.commitment_type || "").trim();
    const candidates = allPayments.filter(
      (p) => String(p.commitment_number || "").trim() === commitmentNumber && (p.commitment_date || p.commitment_type)
    );
    const filteredByType = commitmentType
      ? candidates.filter((p) => String(p.commitment_type || "").trim() === commitmentType)
      : candidates;
    const typeSet = new Set(candidates.map((p) => String(p.commitment_type || "").trim()).filter(Boolean));
    const found =
      filteredByType.length > 0
        ? filteredByType[0]
        : !commitmentType && typeSet.size === 1
          ? candidates[0]
          : null;
    return {
      date: found?.commitment_date || null,
      type: found?.commitment_type || null,
    };
  }, [paymentForm.commitment_number, paymentForm.commitment_type, allPayments]);

  if (loading && !work) {
    return (
      <div className="min-h-screen bg-background">
        <div className="container mx-auto px-4 py-10 text-muted-foreground">Carregando…</div>
      </div>
    );
  }

  if (!work) {
    return (
      <div className="min-h-screen bg-background">
        <div className="container mx-auto px-4 py-10 text-muted-foreground">Obra não encontrada.</div>
      </div>
    );
  }

  const fundingSourceText = Array.isArray(currentMeasurement?.funding_source)
    ? currentMeasurement.funding_source
        .map((src) => (src === "state" ? "estadual" : src))
        .map((src) => (src === "federal" ? "Federal" : src === "estadual" ? "Estadual" : src === "municipal" ? "Municipal" : src))
        .join(", ")
    : "";
  const fundingAmounts = {
    federal: Number(currentMeasurement?.funding_amount_federal) || 0,
    estadual: Number(currentMeasurement?.funding_amount_state) || 0,
    municipal: Number(currentMeasurement?.funding_amount_municipal) || 0,
  };
  const parliamentaryText = work.parliamentary_amendment?.has ? work.parliamentary_amendment?.author : "";
  const simplifyText = (value) =>
    String(value || "")
      .trim()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
  const isEmptyDisplayText = (value) => {
    const t = simplifyText(value);
    return !t || t === "-" || t === "n/a" || t === "nao informado" || t === "nao informada";
  };
  const showFinancialSection =
    !isEmptyDisplayText(fundingSourceText) ||
    Object.values(fundingAmounts).some((v) => Number(v) > 0) ||
    !isEmptyDisplayText(parliamentaryText) ||
    Number(currentMeasurement?.value || 0) > 0 ||
    Number(currentMeasurement?.expected_value || 0) > 0;

  const timelineItems = [
    { label: "Assinatura do contrato", value: formatDateDisplay(phase?.contractSignatureDate) },
    { label: "Ordem de Serviço", value: formatDateDisplay(phase?.serviceOrderDate) },
    { label: "Previsão Início", value: formatDateDisplay(phase?.predictedStartDate) },
    { label: "Término Prev.", value: formatDateDisplay(phase?.expectedEndDate) },
    { label: "Início Real", value: formatDateDisplay(currentMeasurement?.start_date) },
    { label: "Término Real", value: formatDateDisplay(currentMeasurement?.end_date) },
    { label: "Paralisação", value: formatDateDisplay(currentMeasurement?.stalled_date) },
    { label: "Inauguração", value: formatDateDisplay(currentMeasurement?.inauguration_date) },
  ];

 
  return (
    <div className="min-h-screen bg-[#f9fafb]">
      {(Capacitor.isNativePlatform() && isInteractive) ? null : (
        <ObraHeader
          title={work.title}
          subtitle={work.work_category?.name || ""}
          status={normalizeStatus(currentMeasurement?.status || work.status)}
          category={work.work_category?.name || ""}
          isAdmin={Boolean(user?.is_admin)}
          onManage={() => setShowAdminEditModal(true)}
          onShare={handleShareWork}
          isFavorited={isFavorited}
          onFavoriteToggle={handleFavoriteToggle}
        />
      )}

      <main className="container max-w-full 4xl:max-w-[1680px] 3xl:max-w-[1500px] 2xl:max-w-[1380px] xl:max-w-[1120px] mx-auto px-2 sm:px-4 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-12 2xl:col-span-9 3xl:col-span-9  space-y-6">
            <section className="bg-card rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              {heroImageUrl ? <ObraHero imageUrl={heroImageUrl} title={work.title} /> : null}

              <div className="p-6">
                <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge
                      variant="outline"
                      className={`${getStatusInfo(normalizeStatus(currentMeasurement?.status || work.status)).bg} ${getStatusInfo(normalizeStatus(currentMeasurement?.status || work.status)).color} border-none`}
                    >
                      {getStatusInfo(normalizeStatus(currentMeasurement?.status || work.status)).text}
                    </Badge>
                    {work.work_category?.name ? (
                      <Badge variant="outline" className="text-muted-foreground border-border bg-muted/40">
                        {work.work_category.name}
                      </Badge>
                    ) : null}
                  </div>

                  {lastUpdatedAt ? (
                    <div className="hidden lg:block text-sm font-semibold text-muted-foreground whitespace-nowrap">
                      Última atualização: {formatDate(lastUpdatedAt)}
                    </div>
                  ) : null}
                </div>

                <h1 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold text-foreground leading-tight tracking-tight">
                  {work.title}
                </h1>
              </div>

              <div className="px-6 pb-6">
                <ObraProgress percentage={overallProgress} />

                 {work.long_description || work.description ? (
                  <div className="mt-6 text-base text-muted-foreground leading-relaxed whitespace-pre-line">
                    {work.long_description || work.description}
                  </div>
                ) : null}
              </div>

              <div ref={currentPhaseTopRef} className="border-t pt-6 px-6 mb-6 scroll-mt-24">
                <h2 className="text-xl xl:text-2xl font-bold text-foreground mb-3">
                  Acompanhe tudo sobre a fase atual
                </h2>
                <p className="text-muted-foreground text-sm xl:text-base leading-relaxed">
                  Confira responsáveis, prazos e cronograma, pagamentos e todas as informações importantes sobre a execução desta fase da obra.
                </p>
              </div>
              <div className="mx-0 lg:mx-6 border-r-2 shadow-md rounded-xl bg-[#f9fafb] mb-0 lg:mb-8 overflow-hidden min-h-[400px]">
				{currentPhaseView === "general" ? (
				  <>
            <ObraCurrentPhase
              phase={phase}
              category={work.work_category?.name || ""}
              onEdit={openCurrentPhaseEditDialog}
              isAdmin={Boolean(user?.is_admin)}
              embedded
              showBody={false}
            />
					<div className="bg-background">
					  <ObraCurrentPhase
						phase={phase}
						category={work.work_category?.name || ""}
						onEdit={openCurrentPhaseEditDialog}
						isAdmin={Boolean(user?.is_admin)}
						embedded
						showHeader={false}
					  />
					</div>

					<div className="h-4 bg-[#f9fafb]" />

					<div className="bg-background">
					  <ObraTimeline executionDays={phase?.executionDays || 0} items={timelineItems} embedded />
					</div>

					{showFinancialSection ? (
					  <>
						<div className="h-4 bg-[#f9fafb]" />
						<div className="bg-background">
						<ObraFinancial
						  fundingSource={fundingSourceText}
						  fundingAmounts={fundingAmounts}
						  parliamentaryAmendment={parliamentaryText}
						  contractValue={currentMeasurement?.value || 0}
						  expectedValue={currentMeasurement?.expected_value || 0}
						  embedded
						/>
						</div>
					  </>
					) : null}

					<div className="h-4 bg-[#f9fafb]" />
					<div className="bg-background">
					  <ObraPaymentsSummary
						phaseName={currentMeasurement?.title || ""}
						totalPaid={currentPhaseTotalPaid}
						expectedValue={currentMeasurement?.expected_value || 0}
						totalPaidAllPhases={totalPaidAllPhases}
						totalExpectedAllPhases={totalExpectedAllPhases}
						onConsult={openPaymentsView}
					  />
					</div>

					<div className="h-4 bg-[#f9fafb]" />
					<div className="bg-background">
					  <ObraGallery
						galleries={currentGalleries}
						emptyMessage={`Nenhuma mídia registrada para ${currentMeasurement?.title || "esta fase"}`}
						overviewVariant="folders"
						embedded
						onOpenViewer={(items, index) => openViewer(items, index)}
						canEdit={Boolean(user?.is_admin)}
						onRenameGallery={handleRenameGallery}
						onDeleteGallery={handleDeleteGallery}
						onUpdateMediaItem={handleUpdateMediaItem}
						onDeleteMediaItem={handleDeleteMediaItem}
						onUploadFiles={handleUploadGalleryFiles}
						onBulkUpdateMediaItems={handleBulkUpdateMediaItems}
						onBulkDeleteMediaItems={handleBulkDeleteMediaItems}
					  />
					</div>

					<div className="h-4 bg-[#f9fafb]" />
					<div className="bg-background px-4 sm:px-6 py-6 sm:py-8">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center justify-center h-9 w-9 rounded-xl bg-muted/40 border border-border">
                      <FileText className="w-4 h-4 text-muted-foreground" />
                    </span>
                    <div>
                      <div className="text-sm font-semibold text-foreground">Documentos</div>
                      <div className="text-xs text-muted-foreground">{currentDocuments.length} arquivo{currentDocuments.length === 1 ? "" : "s"}</div>
                    </div>
                  </div>

                  {user?.is_admin ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => documentFileInputRef.current?.click()}
                      disabled={isUploadingDocuments}
                      className="w-full sm:w-auto"
                    >
                      <Upload className="w-4 h-4 mr-2" />
                      Adicionar documento
                    </Button>
                  ) : null}
                </div>

                {currentDocuments.length > 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {currentDocuments.map((doc) => (
                      <div
                        key={doc.id}
                        className="flex items-center gap-2 p-3 rounded-2xl border border-border hover:border-muted-foreground/30 hover:bg-muted/20 transition-all"
                      >
                        <a href={doc.url} target="_blank" rel="noopener noreferrer" className="flex items-center min-w-0 flex-1">
                          <div className="w-10 h-10 rounded-xl bg-muted/30 border border-border flex items-center justify-center text-muted-foreground mr-3 shrink-0">
                            <FileText className="w-5 h-5" />
                          </div>
                          <div className="min-w-0">
                            {renamingDocumentId === doc.id ? (
                              <div className="flex items-center gap-2">
                                <Input
                                  value={renamingDocumentValue}
                                  onChange={(e) => setRenamingDocumentValue(e.target.value)}
                                  className="h-9"
                                  onClick={(e) => e.preventDefault()}
                                />
                                <Button
                                  type="button"
                                  size="icon"
                                  variant="outline"
                                  className="h-9 w-9"
                                  onClick={(e) => {
                                    e.preventDefault();
                                    setRenamingDocumentId(null);
                                    setRenamingDocumentValue("");
                                  }}
                                >
                                  <X className="w-4 h-4" />
                                </Button>
                                <Button
                                  type="button"
                                  size="icon"
                                  variant="default"
                                  className="h-9 w-9"
                                  disabled={!String(renamingDocumentValue || "").trim()}
                                  onClick={async (e) => {
                                    e.preventDefault();
                                    const nextName = String(renamingDocumentValue || "").trim();
                                    if (!nextName) return;
                                    await handleUpdateMediaItem(doc.id, { name: nextName });
                                    setRenamingDocumentId(null);
                                    setRenamingDocumentValue("");
                                  }}
                                >
                                  <Check className="w-4 h-4" />
                                </Button>
                              </div>
                            ) : (
                              <p className="text-sm font-medium text-foreground truncate">{doc.name}</p>
                            )}
                          </div>
                        </a>

                        {user?.is_admin ? (
                          <div className="flex items-center gap-2 shrink-0">
                            <Button
                              type="button"
                              size="icon"
                              variant="outline"
                              className="h-9 w-9"
                              onClick={(e) => {
                                e.preventDefault();
                                setRenamingDocumentId(doc.id);
                                setRenamingDocumentValue(String(doc.name || "").trim());
                              }}
                            >
                              <Pencil className="w-4 h-4" />
                            </Button>
                            <Button
                              type="button"
                              size="icon"
                              variant="destructive"
                              className="h-9 w-9"
                              onClick={(e) => {
                                e.preventDefault();
                                setPendingDeleteDocument(doc);
                              }}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-sm text-muted-foreground py-6 text-center border border-dashed border-border rounded-2xl bg-muted/10">
                    Nenhum documento anexado.
                  </div>
                )}

                <input
                  ref={documentFileInputRef}
                  type="file"
                  className="hidden"
                  multiple
                  accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx"
                  onChange={(e) => {
                    const files = Array.from(e.target.files || []);
                    e.target.value = "";
                    handleUploadDocuments(files);
                  }}
                />

                <Dialog open={!!pendingDeleteDocument} onOpenChange={(open) => !open && setPendingDeleteDocument(null)}>
                  <DialogContent className="sm:max-w-md bg-card">
                    <DialogHeader>
                      <DialogTitle className="text-lg font-bold text-foreground">Excluir documento?</DialogTitle>
                    </DialogHeader>
                    <p className="text-sm text-muted-foreground">
                      O documento <span className="font-semibold text-foreground">"{pendingDeleteDocument?.name}"</span> será removido permanentemente.
                    </p>
                    <DialogFooter className="gap-2">
                      <DialogClose asChild>
                        <Button type="button" variant="outline" disabled={isUploadingDocuments}>
                          Cancelar
                        </Button>
                      </DialogClose>
                      <Button
                        type="button"
                        variant="destructive"
                        disabled={isUploadingDocuments}
                        onClick={async () => {
                          const doc = pendingDeleteDocument;
                          setPendingDeleteDocument(null);
                          if (!doc) return;
                          await handleDeleteMediaItem(doc.id, doc.url);
                        }}
                      >
                        Excluir
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
				  </>
				) : (
				  <div className="bg-background min-h-[600px] flex flex-col">
            <div className="p-4 sm:p-6 bg-gradient-to-br from-slate-900 via-slate-900 to-slate-800 border-b border-white/10 shadow-md">
              <div className="flex flex-col gap-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-bold text-white">Consulta de Pagamentos</h3>
                  <Button variant="outline" size="sm" onClick={openGeneralView} className="border-white/20 bg-white/5 text-white hover:bg-white/10 hover:text-white">
                    <X className="h-4 w-4 mr-2" />
                    Fechar consulta
                  </Button>
                </div>
                <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-hide">
                  {measurements.map((m) => (
                    <button
                      key={m.id}
                      onClick={() => setPaymentTabMeasurementId(m.id)}
                      className={`px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider whitespace-nowrap transition-all border ${
                        paymentTabMeasurementId === m.id
                          ? "bg-red-500 text-white border-red-600 shadow-sm"
                          : "bg-white/5 text-white/70 border-white/10 hover:border-white/30 hover:bg-white/10"
                      }`}
                    >
                      {m.title || "Fase"}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex-1">
              <ObraPayments
                payments={paymentsForComponent}
                phaseName={measurements.find(m => m.id === paymentTabMeasurementId)?.title || ""}
                embedded
                measurementId={paymentTabMeasurementId || currentMeasurement?.id || null}
                defaultCreditorName={(measurements.find(m => m.id === (paymentTabMeasurementId || currentMeasurement?.id))?.contractor?.name) || ""}
                canAdd={Boolean(user?.is_admin)}
                onAddPayment={openNewPaymentDialog}
                onEditPayment={openEditPaymentDialog}
                onDeletePayment={handleDeletePayment}
                onRefresh={loadData}
                onBack={null} // We already have the close button in the header
              />
            </div>
				  </div>
				)}
            </div>


            </section>
            
              <ObraPhases
                phases={phases}
                currentPhaseId={currentPhaseId}
                onOpenDetails={openMeasurementDetails}
                isAdmin={Boolean(user?.is_admin)}
                onEdit={(measurementId) => openPhaseEditDialog(measurementId)}
              />
            

         
          </div>

          <aside className="space-y-6 lg:col-span-12 2xl:col-span-3 3xl:col-span-3">
            <ObraLocation
              address={work.address}
              neighborhood={work.bairro?.name || ""}
              city={work.city || ""}
              state={work.state || ""}
              coordinates={null}
              location={work.location}
            />
            <ObraRelatedLinks links={work.related_links || []} />
          </aside>
          
          <div className="order-last lg:order-none lg:col-span-12 2xl:col-span-9">
            <ObraContribution onContribute={handleOpenContrib} />
             <div className="lg:col-span-12 2xl:col-span-9  3xl:col-span-9 text-center max-w-2xl mx-auto pb-6">
            <p className="text-xs text-muted-foreground leading-relaxed mt-4">
              Os dados são provenientes de portais de transparência e verificados pela equipe. Podem haver divergências temporais.
              <button
                type="button"
                onClick={() => setShowReportDialog(true)}
                className="ml-1 text-muted-foreground underline hover:text-foreground"
              >
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
      </main>

      {mediaViewer.isOpen ? <MediaViewer media={mediaViewer.items} startIndex={mediaViewer.startIndex} onClose={closeViewer} /> : null}

      <Dialog
        open={showPaymentDialog}
        onOpenChange={(open) => {
          setShowPaymentDialog(open);
          if (!open) setEditingPaymentId(null);
        }}
      >
        <DialogContent className="sm:max-w-[650px] max-h-[calc(100vh-2rem)] max-h-[calc(100dvh-2rem)] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>{editingPaymentId ? "Editar pagamento" : "Novo pagamento"}</DialogTitle>
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
                      creditor_name: prev.creditor_name ? prev.creditor_name : nextMeasurement?.contractor?.name || "",
                    }));
                  }}
                >
                  {measurements.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.title}
                    </option>
                  ))}
                </select>
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
              <div className={`grid gap-2 transition-all duration-300 ${paymentForm.commitment_number ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-2 pointer-events-none"}`}>
                <div className="flex items-center justify-between">
                  <Label>Data do empenho</Label>
                  {existingCommitmentData.date && !isEditingCommitmentDate && (
                    <button
                      type="button"
                      onClick={() => setIsEditingCommitmentDate(true)}
                      className="text-[10px] font-bold text-red-600 hover:text-red-700 uppercase tracking-tighter"
                    >
                      Editar data
                    </button>
                  )}
                </div>
                <Input
                  type="date"
                  value={paymentForm.commitment_date}
                  disabled={Boolean(existingCommitmentData.date) && !isEditingCommitmentDate && Boolean(editingPaymentId)}
                  onChange={(e) => setPaymentForm((prev) => ({ ...prev, commitment_date: e.target.value }))}
                  className={existingCommitmentData.date && !isEditingCommitmentDate && editingPaymentId ? "bg-muted cursor-not-allowed opacity-70" : ""}
                />
              </div>
              <div className={`grid gap-2 transition-all duration-300 ${paymentForm.commitment_number ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-2 pointer-events-none"}`}>
                <div className="flex items-center justify-between">
                  <Label>Tipo de empenho</Label>
                  {existingCommitmentData.type && !isEditingCommitmentType && (
                    <button
                      type="button"
                      onClick={() => setIsEditingCommitmentType(true)}
                      className="text-[10px] font-bold text-red-600 hover:text-red-700 uppercase tracking-tighter"
                    >
                      Editar tipo
                    </button>
                  )}
                </div>
                <select
                  className={`h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background ${existingCommitmentData.type && !isEditingCommitmentType && editingPaymentId ? "bg-muted cursor-not-allowed opacity-70" : ""}`}
                  value={paymentForm.commitment_type}
                  disabled={Boolean(existingCommitmentData.type) && !isEditingCommitmentType && Boolean(editingPaymentId)}
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
              <div className="grid gap-2">
                <Label>Data do pagamento</Label>
                <Input
                  type="date"
                  value={paymentForm.payment_date}
                  onChange={(e) => setPaymentForm((prev) => ({ ...prev, payment_date: e.target.value }))}
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
                  inputMode="decimal"
                  placeholder="0,00"
                  value={paymentForm.value}
                  onChange={(e) => {
                    setPaymentForm((prev) => ({ ...prev, value: maskMoneyWhileTyping(e.target.value) }));
                  }}
                  onBlur={() => {
                    const n = parsePtBrNumber(paymentForm.value);
                    if (n == null) return;
                    setPaymentForm((prev) => ({ ...prev, value: formatPtBrMoney(n) }));
                  }}
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
              <Button variant="outline" disabled={isSavingPayment}>
                Cancelar
              </Button>
            </DialogClose>
            <Button onClick={handleSavePayment} disabled={isSavingPayment}>
              Salvar pagamento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!selectedMeasurement} onOpenChange={(open) => !open && setSelectedMeasurement(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto bg-white">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold text-slate-800 flex items-center gap-2">
              <Briefcase className="w-5 h-5 text-primary" />
              {selectedMeasurement?.title || "Detalhes da Fase"}
            </DialogTitle>
            <div className="flex flex-wrap gap-2 mt-2">
              <Badge variant="outline" className={`${getStatusInfo(selectedMeasurement?.status).color} ${getStatusInfo(selectedMeasurement?.status).bg} border-none`}>
                {getStatusInfo(selectedMeasurement?.status).text}
              </Badge>
            </div>
          </DialogHeader>

          {selectedMeasurement ? (
            <div className="space-y-6 py-4">
              {selectedMeasurement.description ? (
                <div className="bg-slate-50 p-4 rounded-lg border border-slate-100">
                  <h4 className="text-sm font-semibold text-slate-700 mb-2">Descrição da Fase</h4>
                  <p className="text-slate-600 text-sm leading-relaxed whitespace-pre-wrap">{selectedMeasurement.description}</p>
                </div>
              ) : null}

              <div className="space-y-4">
                <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                  <div className="bg-slate-50/80 px-4 py-3 border-b border-slate-100 flex items-center gap-2">
                    <Briefcase className="w-4 h-4 text-slate-500" />
                    <h4 className="font-semibold text-slate-700 text-sm">Dados do Contrato</h4>
                  </div>
                  <div className="p-5">
                    {selectedMeasurement?.contractor?.name || selectedMeasurement?.execution_percentage != null ? (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {selectedMeasurement?.contractor?.name ? (
                          <div className="space-y-1">
                            <span className="text-xs font-medium text-slate-400 uppercase tracking-wider block">Empresa Responsável</span>
                            <p className="font-semibold text-slate-800 text-sm md:text-base leading-tight">{selectedMeasurement.contractor.name}</p>
                            {selectedMeasurement?.contractor?.cnpj ? (
                              <p className="text-xs text-slate-500">CNPJ: {formatCnpj(selectedMeasurement.contractor.cnpj)}</p>
                            ) : null}
                          </div>
                        ) : null}

                        {selectedMeasurement?.contract_number ? (
                          <div className="space-y-1">
                            <span className="text-xs font-medium text-slate-400 uppercase tracking-wider block">Número do contrato</span>
                            {selectedMeasurement?.contract_portal_link || selectedMeasurement?.portal_link ? (
                              <a
                                href={selectedMeasurement.contract_portal_link || selectedMeasurement.portal_link}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="font-semibold text-primary underline underline-offset-2 text-sm md:text-base leading-tight"
                              >
                                {selectedMeasurement.contract_number}
                              </a>
                            ) : (
                              <p className="font-semibold text-slate-800 text-sm md:text-base leading-tight">{selectedMeasurement.contract_number}</p>
                            )}
                          </div>
                        ) : null}

                        {selectedMeasurement?.bidding_process_number ? (
                          <div className="space-y-1">
                            <span className="text-xs font-medium text-slate-400 uppercase tracking-wider block">Processo licitatório</span>
                            {selectedMeasurement?.bidding_process_portal_link || selectedMeasurement?.portal_link ? (
                              <a
                                href={selectedMeasurement.bidding_process_portal_link || selectedMeasurement.portal_link}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="font-semibold text-primary underline underline-offset-2 text-sm md:text-base leading-tight"
                              >
                                {selectedMeasurement.bidding_process_number}
                              </a>
                            ) : (
                              <p className="font-semibold text-slate-800 text-sm md:text-base leading-tight">{selectedMeasurement.bidding_process_number}</p>
                            )}
                          </div>
                        ) : null}

                        {(() => {
                          const contractLink = selectedMeasurement?.contract_portal_link || selectedMeasurement?.portal_link || "";
                          const processLink = selectedMeasurement?.bidding_process_portal_link || selectedMeasurement?.portal_link || "";
                          const showContract = Boolean(contractLink) && !selectedMeasurement?.contract_number;
                          const showProcess = Boolean(processLink) && !selectedMeasurement?.bidding_process_number;
                          const same = Boolean(contractLink) && Boolean(processLink) && contractLink === processLink;

                          if (!showContract && !showProcess) return null;

                          if (same) {
                            return (
                              <div className="space-y-1 md:col-span-2">
                                <span className="text-xs font-medium text-slate-400 uppercase tracking-wider block">Portal da Transparência</span>
                                <a
                                  href={contractLink}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-sm font-semibold text-primary underline underline-offset-2"
                                >
                                  Abrir link
                                </a>
                              </div>
                            );
                          }

                          return (
                            <div className="space-y-3 md:col-span-2">
                              {showContract ? (
                                <div className="space-y-1">
                                  <span className="text-xs font-medium text-slate-400 uppercase tracking-wider block">Portal do contrato</span>
                                  <a
                                    href={contractLink}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-sm font-semibold text-primary underline underline-offset-2"
                                  >
                                    Abrir link
                                  </a>
                                </div>
                              ) : null}
                              {showProcess ? (
                                <div className="space-y-1">
                                  <span className="text-xs font-medium text-slate-400 uppercase tracking-wider block">Portal do processo</span>
                                  <a
                                    href={processLink}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-sm font-semibold text-primary underline underline-offset-2"
                                  >
                                    Abrir link
                                  </a>
                                </div>
                              ) : null}
                            </div>
                          );
                        })()}

                        {selectedMeasurement?.execution_percentage != null ? (
                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1">
                              <span className="text-xs font-medium text-slate-400 uppercase tracking-wider block">Execução</span>
                              <div className="flex items-center gap-2">
                                <span className="font-semibold text-slate-800 text-sm md:text-base">{`${selectedMeasurement.execution_percentage}%`}</span>
                                <Progress value={Number(selectedMeasurement.execution_percentage) || 0} className="h-2 w-full" />
                              </div>
                            </div>
                          </div>
                        ) : null}

                        {selectedMeasurement?.expected_value != null  ? (
                          <div className="grid grid-cols-2 gap-4 md:col-span-2">
                            {selectedMeasurement?.expected_value != null ? (
                              <div className="space-y-1">
                                <span className="text-xs font-medium text-slate-400 uppercase tracking-wider block">Valor Previsto</span>
                                <p className="font-semibold text-slate-800 text-sm md:text-base">{formatCurrency(selectedMeasurement.expected_value)}</p>
                              </div>
                            ) : null}
                            {/* {selectedMeasurement?.amount_spent != null && Number(selectedMeasurement.amount_spent) > 0 ? (
                              <div className="space-y-1">
                                <span className="text-xs font-medium text-slate-400 uppercase tracking-wider block">Valor Pago</span>
                                <p className="font-semibold text-slate-800 text-sm md:text-base">{formatCurrency(selectedMeasurement.amount_spent)}</p>
                              </div>
                            ) : null} */}
                          </div>
                        ) : null}

                        {Array.isArray(selectedMeasurement?.funding_source) && selectedMeasurement.funding_source.length > 0 ? (
                          <div className="md:col-span-2 space-y-2">
                            <span className="text-xs font-medium text-slate-400 uppercase tracking-wider block">Fontes do Recurso</span>
                            <div className="flex flex-wrap gap-2">
                              {selectedMeasurement.funding_source.map((rawSrc, idx) => {
                                const src = rawSrc === "state" ? "estadual" : rawSrc;
                                const label =
                                  src === "federal" ? "Federal" : src === "estadual" ? "Estadual" : src === "municipal" ? "Municipal" : src;
                                const styles =
                                  src === "federal"
                                    ? "bg-blue-50 text-blue-700"
                                    : src === "estadual"
                                    ? "bg-orange-50 text-orange-700"
                                    : src === "municipal"
                                    ? "bg-emerald-50 text-emerald-700"
                                    : "bg-slate-100 text-slate-700";
                                const amount =
                                  src === "federal"
                                    ? Number(selectedMeasurement.funding_amount_federal) || 0
                                    : src === "estadual"
                                    ? Number(selectedMeasurement.funding_amount_state) || 0
                                    : src === "municipal"
                                    ? Number(selectedMeasurement.funding_amount_municipal) || 0
                                    : 0;
                                return (
                                  <span key={`${rawSrc}-${idx}`} className={`text-xs font-semibold px-2 py-1 rounded-full border ${styles}`}>
                                    {label}
                                    {amount > 0 ? ` • ${formatCurrency(amount)}` : ""}
                                  </span>
                                );
                              })}
                            </div>
                          </div>
                        ) : null}
                      </div>
                    ) : (
                      <p className="text-sm text-slate-500 italic">Sem informações nesta seção.</p>
                    )}
                  </div>
                </div>

                <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                  <div className="bg-slate-50/80 px-4 py-3 border-b border-slate-100 flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-slate-500" />
                    <h4 className="font-semibold text-slate-700 text-sm">Cronograma e Prazos</h4>
                  </div>
                  <div className="p-5">
                    {selectedMeasurement?.contract_signature_date ||
                    selectedMeasurement?.service_order_date ||
                    selectedMeasurement?.predicted_start_date ||
                    selectedMeasurement?.start_date ||
                    selectedMeasurement?.expected_end_date ||
                    selectedMeasurement?.end_date ||
                    selectedMeasurement?.inauguration_date ||
                    selectedMeasurement?.stalled_date ? (
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-y-6 gap-x-4">
                        {selectedMeasurement?.contract_signature_date ? (
                          <div>
                            <span className="text-xs text-slate-400 block mb-1">Assinatura do contrato</span>
                            <span className="font-medium text-slate-700 text-sm block">{formatDate(selectedMeasurement.contract_signature_date)}</span>
                          </div>
                        ) : null}
                        {selectedMeasurement?.service_order_date ? (
                          <div>
                            <span className="text-xs text-slate-400 block mb-1">Ordem de Serviço</span>
                            <span className="font-medium text-slate-700 text-sm block">{formatDate(selectedMeasurement.service_order_date)}</span>
                          </div>
                        ) : null}
                        {selectedMeasurement?.predicted_start_date ? (
                          <div>
                            <span className="text-xs text-slate-400 block mb-1">Previsão Início</span>
                            <span className="font-medium text-slate-700 text-sm block">{formatDate(selectedMeasurement.predicted_start_date)}</span>
                          </div>
                        ) : null}
                        {selectedMeasurement?.start_date ? (
                          <div>
                            <span className="text-xs text-slate-400 block mb-1">Início Real</span>
                            <span className="font-medium text-slate-700 text-sm block">{formatDate(selectedMeasurement.start_date)}</span>
                          </div>
                        ) : null}
                        {selectedMeasurement?.expected_end_date ? (
                          <div>
                            <span className="text-xs text-slate-400 block mb-1">Previsão Conclusão</span>
                            <span className="font-medium text-slate-700 text-sm block">{formatDate(selectedMeasurement.expected_end_date)}</span>
                          </div>
                        ) : null}
                        {selectedMeasurement?.end_date ? (
                          <div>
                            <span className={`text-xs block mb-1 ${selectedMeasurement.status === "unfinished" ? "text-orange-600" : "text-slate-400"}`}>
                              {selectedMeasurement.status === "unfinished" ? "Encerramento/Rescisão" : "Conclusão Real"}
                            </span>
                            <span className={`font-bold text-sm block ${selectedMeasurement.status === "unfinished" ? "text-orange-700" : "text-emerald-700"}`}>
                              {formatDate(selectedMeasurement.end_date)}
                            </span>
                          </div>
                        ) : null}
                        {selectedMeasurement?.inauguration_date ? (
                          <div>
                            <span className="text-xs text-emerald-600 block mb-1">Inauguração</span>
                            <span className="font-bold text-emerald-700 text-sm block">{formatDate(selectedMeasurement.inauguration_date)}</span>
                          </div>
                        ) : null}
                        {selectedMeasurement?.stalled_date ? (
                          <div className="col-span-2 sm:col-span-1">
                            <span className="text-xs text-red-600 block mb-1">Data Paralisação</span>
                            <span className="font-bold text-red-700 text-sm block">{formatDate(selectedMeasurement.stalled_date)}</span>
                          </div>
                        ) : null}
                      </div>
                    ) : (
                      <p className="text-sm text-slate-500 italic">Sem informações nesta seção.</p>
                    )}

                    {selectedMeasurement?.execution_period_days != null ? (
                      <div className="mt-4">
                        <span className="text-xs text-slate-400 block mb-1">Prazo de Execução</span>
                        <span className="font-semibold text-slate-700 text-sm">{selectedMeasurement.execution_period_days} dias</span>
                      </div>
                    ) : null}
                  </div>
                </div>

                <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                  <div className="bg-slate-50/80 px-4 py-3 border-b border-slate-100 flex items-center gap-2">
                    <DollarSign className="w-4 h-4 text-slate-500" />
                    <h4 className="font-semibold text-slate-700 text-sm">Pagamentos</h4>
                  </div>
                  <div className="p-5">
                    {Array.isArray(selectedMeasurement?.payments) && selectedMeasurement.payments.length > 0 ? (
                      <div className="space-y-3">
                        <div className="flex items-center justify-between gap-3">
                          <div className="text-sm text-slate-600">
                            Total pago: <span className="font-semibold text-slate-800">{formatCurrency(selectedMeasurement.payments.reduce((s, p) => s + (Number(p.value) || 0), 0))}</span>
                          </div>
                        </div>

                        <div className="overflow-x-auto rounded-lg border border-slate-200">
                          <table className="w-full text-sm">
                            <thead className="bg-slate-50">
                              <tr className="text-left text-slate-600">
                                <th className="p-3 font-semibold">Data do pagamento</th>
                                <th className="p-3 font-semibold">Data do empenho</th>
                                <th className="p-3 font-semibold">Valor</th>
                                <th className="p-3 font-semibold">Empenho/Ordem</th>
                                <th className="p-3 font-semibold">Parcela</th>
                                <th className="p-3 font-semibold">Credor</th>
                                <th className="p-3 font-semibold">Portal</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y">
                              {selectedMeasurement.payments.map((p) => (
                                <tr key={p.id} className="text-slate-700">
                                  <td className="p-3 whitespace-nowrap">{p.payment_date ? formatDateDisplay(p.payment_date) : "-"}</td>
                                  <td className="p-3 whitespace-nowrap">{p.commitment_date ? formatDateDisplay(p.commitment_date) : "-"}</td>
                                  <td className="p-3 whitespace-nowrap font-semibold">{formatCurrency(p.value || 0)}</td>
                                  <td className="p-3">{p.commitment_number || p.banking_order || "-"}</td>
                                  <td className="p-3 whitespace-nowrap">{p.installment || "-"}</td>
                                  <td className="p-3">{p.creditor_name || "-"}</td>
                                  <td className="p-3">
                                    {p.portal_link ? (
                                      <a href={p.portal_link} target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-2">
                                        Abrir
                                      </a>
                                    ) : (
                                      "-"
                                    )}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    ) : (
                      <p className="text-sm text-slate-500 italic">Nenhum pagamento registrado para esta fase.</p>
                    )}
                  </div>
                </div>
              </div>

              <div>
                <h4 className="font-bold text-slate-800 mb-3 flex items-center gap-2">
                  <ImageIcon className="w-5 h-5 text-primary" />
                  Galeria de Fotos e Vídeos
                </h4>

                {Array.isArray(selectedMeasurement?.media) && selectedMeasurement.media.length > 0 ? (
                  <div className="space-y-6">
                    {(() => {
                      const groups = {};
                      selectedMeasurement.media.forEach((item) => {
                        const name = item.gallery_name || "Geral";
                        if (!groups[name]) groups[name] = [];
                        groups[name].push(item);
                      });

                      const sortedGroups = Object.entries(groups)
                        .map(([name, items]) => ({ name, items }))
                        .sort((a, b) => {
                          if (a.name === selectedMeasurement.title) return -1;
                          if (a.name === "Geral") return -1;
                          if (b.name === selectedMeasurement.title) return 1;
                          if (b.name === "Geral") return 1;
                          return a.name.localeCompare(b.name);
                        });

                      return sortedGroups.map((group) => (
                        <div key={group.name} className="space-y-3">
                          {sortedGroups.length > 1 || (group.name !== "Geral" && group.name !== selectedMeasurement.title) ? (
                            <h5 className="text-sm font-semibold text-slate-700 border-l-4 border-primary pl-3 bg-slate-50 py-1 rounded-r-lg">
                              {group.name}
                            </h5>
                          ) : null}
                          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
                            {group.items.map((mediaItem) => {
                              const originalIndex = selectedMeasurement.media.findIndex((m) => m.id === mediaItem.id);
                              return (
                                <div
                                  key={mediaItem.id}
                                  className="aspect-square rounded-lg overflow-hidden cursor-pointer bg-slate-200 relative group shadow-sm hover:shadow-md transition-all"
                                  onClick={() => openViewer(selectedMeasurement.media, originalIndex)}
                                >
                                  <MeasurementMediaThumb item={mediaItem} />
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

              <div>
                <h4 className="font-bold text-slate-800 mb-3 flex items-center gap-2">
                  <FileText className="w-5 h-5 text-primary" />
                  Documentos Anexados
                </h4>
                {Array.isArray(selectedMeasurement?.docs) && selectedMeasurement.docs.length > 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {selectedMeasurement.docs.map((doc) => (
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
                          <p className="font-medium text-slate-700 truncate group-hover:text-primary transition-colors">{doc.title || doc.name}</p>
                          {doc.description ? <p className="text-xs text-slate-500 truncate">{doc.description}</p> : null}
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
          ) : null}

          <DialogFooter>
            <Button onClick={() => setSelectedMeasurement(null)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
            <Button variant="ghost" onClick={() => setShowReportDialog(false)}>
              Cancelar
            </Button>
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

      {showAdminEditModal ? (
        <WorkEditModal work={work} onSave={handleAdminSaveWork} onClose={() => setShowAdminEditModal(false)} workOptions={workOptions} />
      ) : null}

      <Dialog
        open={showCurrentPhaseEditDialog}
        onOpenChange={(open) => {
          setShowCurrentPhaseEditDialog(open);
          if (!open) setEditingMeasurementId(null);
        }}
      >
        <DialogContent className="sm:max-w-[900px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar fase atual</DialogTitle>
          </DialogHeader>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="grid gap-2 sm:col-span-2">
              <Label>Título</Label>
              <Input value={currentPhaseForm.title} onChange={(e) => setCurrentPhaseForm((p) => ({ ...p, title: e.target.value }))} />
            </div>

            <div className="grid gap-2 sm:col-span-2">
              <Label>Descrição</Label>
              <Textarea
                value={currentPhaseForm.description}
                onChange={(e) => setCurrentPhaseForm((p) => ({ ...p, description: e.target.value }))}
              />
            </div>

            <div className="grid gap-2">
              <Label>Status</Label>
              <select
                className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background"
                value={currentPhaseForm.status}
                onChange={(e) => setCurrentPhaseForm((p) => ({ ...p, status: e.target.value }))}
              >
                <option value="planned">Planejamento</option>
                <option value="tendered">Em Licitação</option>
                <option value="in-progress">Em Execução</option>
                <option value="stalled">Paralisada</option>
                <option value="unfinished">Inacabada</option>
                <option value="completed">Concluída</option>
              </select>
            </div>

            <div className="grid gap-2">
              <Label>Construtora</Label>
              <select
                className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background"
                value={currentPhaseForm.contractor_id || ""}
                onChange={(e) => setCurrentPhaseForm((p) => ({ ...p, contractor_id: e.target.value }))}
              >
                <option value="">Não informado</option>
                {(currentPhaseContractors || []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid gap-2">
              <Label>Número do contrato</Label>
              <Input
                placeholder="Ex: 005/2022"
                value={currentPhaseForm.contract_number}
                onChange={(e) => setCurrentPhaseForm((p) => ({ ...p, contract_number: e.target.value }))}
              />
            </div>

            <div className="grid gap-2">
              <Label>Processo licitatório</Label>
              <Input
                placeholder="Ex: 002/2026"
                value={currentPhaseForm.bidding_process_number}
                onChange={(e) => setCurrentPhaseForm((p) => ({ ...p, bidding_process_number: e.target.value }))}
              />
            </div>

            <div className="grid gap-2 sm:col-span-1">
              <Label>Portal do contrato (link)</Label>
              <Input
                placeholder="https://..."
                value={currentPhaseForm.contract_portal_link}
                onChange={(e) => setCurrentPhaseForm((p) => ({ ...p, contract_portal_link: e.target.value }))}
              />
            </div>

            <div className="grid gap-2 sm:col-span-1">
              <Label>Portal do processo (link)</Label>
              <Input
                placeholder="https://..."
                value={currentPhaseForm.bidding_process_portal_link}
                onChange={(e) => setCurrentPhaseForm((p) => ({ ...p, bidding_process_portal_link: e.target.value }))}
              />
            </div>

            <div className="grid gap-2">
              <Label>Execução (%)</Label>
              <Input
                type="number"
                min="0"
                max="100"
                step="1"
                value={currentPhaseForm.execution_percentage}
                onChange={(e) => setCurrentPhaseForm((p) => ({ ...p, execution_percentage: e.target.value }))}
              />
            </div>

            <div className="grid gap-2">
              <Label>Prazo (dias)</Label>
              <Input
                type="number"
                step="1"
                value={currentPhaseForm.execution_period_days}
                onChange={(e) => setCurrentPhaseForm((p) => ({ ...p, execution_period_days: e.target.value }))}
              />
            </div>

            <div className="grid gap-2">
              <Label>Valor contratado (R$)</Label>
              <Input
                inputMode="decimal"
                value={currentPhaseForm.value}
                onChange={(e) => {
                  const next = String(e.target.value || "").replace(/[^\d.,]/g, "");
                  setCurrentPhaseForm((p) => ({ ...p, value: next }));
                }}
                onBlur={() => {
                  const n = parsePtBrNumber(currentPhaseForm.value);
                  if (n == null) return;
                  setCurrentPhaseForm((p) => ({ ...p, value: formatPtBrMoney(n) }));
                }}
              />
            </div>

            <div className="grid gap-2">
              <Label>Valor previsto (R$)</Label>
              <Input
                inputMode="decimal"
                value={currentPhaseForm.expected_value}
                onChange={(e) => {
                  const next = String(e.target.value || "").replace(/[^\d.,]/g, "");
                  setCurrentPhaseForm((p) => ({ ...p, expected_value: next }));
                }}
                onBlur={() => {
                  const n = parsePtBrNumber(currentPhaseForm.expected_value);
                  if (n == null) return;
                  setCurrentPhaseForm((p) => ({ ...p, expected_value: formatPtBrMoney(n) }));
                }}
              />
            </div>

            {/* <div className="grid gap-2 sm:col-span-2">
              <Label>Valor gasto (R$)</Label>
              <Input
                inputMode="decimal"
                value={currentPhaseForm.amount_spent}
                onChange={(e) => {
                  const next = String(e.target.value || "").replace(/[^\d.,]/g, "");
                  setCurrentPhaseForm((p) => ({ ...p, amount_spent: next }));
                }}
                onBlur={() => {
                  const n = parsePtBrNumber(currentPhaseForm.amount_spent);
                  if (n == null) return;
                  setCurrentPhaseForm((p) => ({ ...p, amount_spent: formatPtBrMoney(n) }));
                }}
              />
            </div> */}

            <div className="grid gap-2 sm:col-span-2">
              <Label>Fonte de recurso</Label>
              <div className="flex flex-wrap gap-4">
                {["federal", "estadual", "municipal"].map((name) => {
                  const checked = (currentPhaseForm.funding_source || []).includes(name);
                  return (
                    <label key={name} className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={checked}
                        onCheckedChange={(next) => {
                          setCurrentPhaseForm((p) => {
                            const current = Array.isArray(p.funding_source) ? p.funding_source : [];
                            const exists = current.includes(name);
                            const shouldInclude = Boolean(next);
                            const updated = exists
                              ? shouldInclude
                                ? current
                                : current.filter((x) => x !== name)
                              : shouldInclude
                              ? [...current, name]
                              : current;
                            return { ...p, funding_source: updated };
                          });
                        }}
                      />
                      <span className="capitalize">{name}</span>
                    </label>
                  );
                })}
              </div>
              {Array.isArray(currentPhaseForm.funding_source) && currentPhaseForm.funding_source.length > 0 ? (
                <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {(currentPhaseForm.funding_source || []).includes("federal") ? (
                    <div className="grid gap-2">
                      <Label>Federal (R$)</Label>
                      <Input
                        inputMode="decimal"
                        value={currentPhaseForm.funding_amount_federal}
                        onChange={(e) => {
                          const next = String(e.target.value || "").replace(/[^\d.,]/g, "");
                          setCurrentPhaseForm((p) => ({ ...p, funding_amount_federal: next }));
                        }}
                        onBlur={() => {
                          const n = parsePtBrNumber(currentPhaseForm.funding_amount_federal);
                          if (n == null) return;
                          setCurrentPhaseForm((p) => ({ ...p, funding_amount_federal: formatPtBrMoney(n) }));
                        }}
                      />
                    </div>
                  ) : null}
                  {(currentPhaseForm.funding_source || []).includes("estadual") ? (
                    <div className="grid gap-2">
                      <Label>Estadual (R$)</Label>
                      <Input
                        inputMode="decimal"
                        value={currentPhaseForm.funding_amount_state}
                        onChange={(e) => {
                          const next = String(e.target.value || "").replace(/[^\d.,]/g, "");
                          setCurrentPhaseForm((p) => ({ ...p, funding_amount_state: next }));
                        }}
                        onBlur={() => {
                          const n = parsePtBrNumber(currentPhaseForm.funding_amount_state);
                          if (n == null) return;
                          setCurrentPhaseForm((p) => ({ ...p, funding_amount_state: formatPtBrMoney(n) }));
                        }}
                      />
                    </div>
                  ) : null}
                  {(currentPhaseForm.funding_source || []).includes("municipal") ? (
                    <div className="grid gap-2">
                      <Label>Municipal (R$)</Label>
                      <Input
                        inputMode="decimal"
                        value={currentPhaseForm.funding_amount_municipal}
                        onChange={(e) => {
                          const next = String(e.target.value || "").replace(/[^\d.,]/g, "");
                          setCurrentPhaseForm((p) => ({ ...p, funding_amount_municipal: next }));
                        }}
                        onBlur={() => {
                          const n = parsePtBrNumber(currentPhaseForm.funding_amount_municipal);
                          if (n == null) return;
                          setCurrentPhaseForm((p) => ({ ...p, funding_amount_municipal: formatPtBrMoney(n) }));
                        }}
                      />
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>

          <div className="mt-6">
            <div className="text-sm font-semibold mb-3">Datas</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Assinatura do contrato</Label>
                <Input
                  type="date"
                  value={currentPhaseForm.contract_signature_date || ""}
                  onChange={(e) => setCurrentPhaseForm((p) => ({ ...p, contract_signature_date: e.target.value }))}
                />
              </div>
              <div className="grid gap-2">
                <Label>Ordem de serviço</Label>
                <Input
                  type="date"
                  value={currentPhaseForm.service_order_date || ""}
                  onChange={(e) => setCurrentPhaseForm((p) => ({ ...p, service_order_date: e.target.value }))}
                />
              </div>
              <div className="grid gap-2">
                <Label>Previsão de início</Label>
                <Input
                  type="date"
                  value={currentPhaseForm.predicted_start_date || ""}
                  onChange={(e) => setCurrentPhaseForm((p) => ({ ...p, predicted_start_date: e.target.value }))}
                />
              </div>
              <div className="grid gap-2">
                <Label>Previsão de Conclusão</Label>
                <Input
                  type="date"
                  value={currentPhaseForm.expected_end_date || ""}
                  onChange={(e) => setCurrentPhaseForm((p) => ({ ...p, expected_end_date: e.target.value }))}
                />
              </div>
              <div className="grid gap-2">
                <Label>Início real</Label>
                <Input
                  type="date"
                  value={currentPhaseForm.start_date || ""}
                  onChange={(e) => setCurrentPhaseForm((p) => ({ ...p, start_date: e.target.value }))}
                />
              </div>
              <div className="grid gap-2">
                <Label>Término real</Label>
                <Input
                  type="date"
                  value={currentPhaseForm.end_date || ""}
                  onChange={(e) => setCurrentPhaseForm((p) => ({ ...p, end_date: e.target.value }))}
                />
              </div>
              <div className="grid gap-2">
                <Label>Paralisação</Label>
                <Input
                  type="date"
                  value={currentPhaseForm.stalled_date || ""}
                  onChange={(e) => setCurrentPhaseForm((p) => ({ ...p, stalled_date: e.target.value }))}
                />
              </div>
              <div className="grid gap-2">
                <Label>Inauguração</Label>
                <Input
                  type="date"
                  value={currentPhaseForm.inauguration_date || ""}
                  onChange={(e) => setCurrentPhaseForm((p) => ({ ...p, inauguration_date: e.target.value }))}
                />
              </div>
            </div>
          </div>

          <DialogFooter className="mt-6">
            <DialogClose asChild>
              <Button variant="outline" disabled={isSavingCurrentPhase}>
                Cancelar
              </Button>
            </DialogClose>
            <Button onClick={handleSaveCurrentPhase} disabled={isSavingCurrentPhase}>
              Salvar alterações
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showContribDialog} onOpenChange={setShowContribDialog}>
        <DialogContent className="sm:max-w-[650px]">
          <DialogHeader>
            <DialogTitle>Contribuir com esta obra</DialogTitle>
          </DialogHeader>

          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="contrib_description">Descrição</Label>
              <Textarea
                id="contrib_description"
                placeholder="Descreva o que você está enviando..."
                value={contribDescription}
                onChange={(e) => setContribDescription(e.target.value)}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="contrib_files">Fotos/Vídeos</Label>
              <div className="flex items-center gap-3">
                <Button type="button" variant="outline" onClick={() => contribFileInputRef.current?.click()}>
                  Selecionar arquivos
                </Button>
                <Input
                  id="contrib_files"
                  ref={contribFileInputRef}
                  type="file"
                  accept="image/*,video/*,application/pdf"
                  multiple
                  className="hidden"
                  onChange={handleContribFilesChange}
                />
                {contribFiles.length > 0 ? (
                  <span className="text-xs text-muted-foreground">{contribFiles.length} arquivo(s) selecionado(s)</span>
                ) : null}
              </div>
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
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={isSubmittingContribution}>
                Cancelar
              </Button>
            </DialogClose>
            <Button type="button" onClick={handleSubmitContribution} disabled={isSubmittingContribution}>
              {isSubmittingContribution ? "Enviando..." : "Enviar Contribuição"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

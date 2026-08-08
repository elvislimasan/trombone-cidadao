import React, {
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
} from "react";
import { useParams, useNavigate, useLocation, Link } from "react-router-dom";
import { Capacitor } from "@capacitor/core";
import { useToast } from "@/components/ui/use-toast";
import { Button } from "@/components/ui/button";
import LinkReportModal from "@/components/LinkReportModal";
import ReportDetails from "@/components/ReportDetails";
import { useAuth } from "@/contexts/SupabaseAuthContext";
import { useReportPermissions } from "@/hooks/useReportPermissions";
import { supabase } from "@/lib/customSupabaseClient";
import { getReportShareUrl } from "@/lib/shareUtils";
import { useUpvote } from "../hooks/useUpvotes";
import DynamicSEO from "../components/DynamicSeo";
import DonationModal from "@/components/DonationModal";
import MarkResolvedModal from "@/components/MarkResolvedModal";
import MediaViewer from "@/components/MediaViewer";
import {
  ThumbsUp,
  Star,
  Share2,
  FileSignature,
  CheckCircle,
  Image,
  Instagram,
  FileText,
  Download,
  User2Icon,
  Megaphone,
  Clock,
} from "lucide-react";
import { Share } from "@capacitor/share";
import { toPng } from "html-to-image";
import ReportFlyerModal from "@/components/report/ReportFlyerModal";
import ReportStoryModal from "@/components/report/ReportStoryModal";
import ReportUpdateModal from "@/components/report/ReportUpdateModal";
import ReportHeader from "@/components/report/ReportHeader";
import ReportLocation from "@/components/report/ReportLocation";
import {
  ReportProblemDescription,
  ReportProblemDetails,
} from "@/components/report/ReportProblem";
import ReportSummary from "@/components/report/ReportSummary";
import ReportProgress from "@/components/report/ReportProgress";
import ReportUpdates from "@/components/report/ReportUpdates";
import { ReportMediaHero, ReportMediaGallery } from "@/components/report/ReportMedia";
import {
  ReportManagementPanel,
  ReportModerationBar,
} from "@/components/report/ReportActionsMenu";
import ReportComments from "@/components/report/ReportComments";
import ReportCommentBar from "@/components/report/ReportCommentBar";
import Icon from "@/design-system/icons";
import { useNativeCamera } from "@/hooks/useNativeCamera";
import {
  AlertCircle,
  Layout as LayoutIcon,
  Grid as GridIcon,
  Home,
} from "lucide-react";
import { useMobileHeader } from "@/contexts/MobileHeaderContext";
import { useNativeUIMode } from "@/contexts/NativeUIModeContext";

// ─────────────────────────────────────────────
// Main ReportPage
// ─────────────────────────────────────────────
const ReportPage = () => {
  const { reportId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  const { user } = useAuth();
  const { setTitle, setActions, setShowBack, setOnBack, reset } =
    useMobileHeader();
  const { isInteractive } = useNativeUIMode();
  const [report, setReport] = useState(null);
  const [allReports, setAllReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [showDonationModal, setShowDonationModal] = useState(false);
  const [showMarkResolvedModal, setShowMarkResolvedModal] = useState(false);
  const [showFlyerModal, setShowFlyerModal] = useState(false);
  const [showStoryModal, setShowStoryModal] = useState(false);
  const [reportToLink, setReportToLink] = useState(null);
  const [newComment, setNewComment] = useState("");
  const [mediaViewerState, setMediaViewerState] = useState({
    isOpen: false,
    startIndex: 0,
  });
  const [showEditDetails, setShowEditDetails] = useState(false);
  const [showUpdateModal, setShowUpdateModal] = useState(false);
  const [submittingUpdate, setSubmittingUpdate] = useState(false);
  const [reportUpdates, setReportUpdates] = useState([]);
  const [showAllUpdates, setShowAllUpdates] = useState(false);
  const [confirmingUpdateId, setConfirmingUpdateId] = useState(null);
  const [deletingUpdateId, setDeletingUpdateId] = useState(null);
  const [updateMediaViewer, setUpdateMediaViewer] = useState({ isOpen: false, media: [], startIndex: 0 });
  const { handleUpvote } = useUpvote();
  // Estado da câmera, tipo e mensagem vivem em ReportPage — sobrevivem a qualquer remount do modal
  const updateCam = useNativeCamera({ maxPhotos: 5 });
  const [updateType, setUpdateType] = useState(null);
  const [updateMessage, setUpdateMessage] = useState('');

  const [moderating, setModerating] = useState(false);
  const {
    isAdmin,
    isPublicOfficial,
    isAuthorOrAdmin,
    canModerate,
    canEditCategory,
    canEditWaterUtility,
    canMarkResolved,
    canConfirmUpdate,
    canDeleteUpdate,
  } = useReportPermissions(report);

  const UPDATES_VISIBLE_COUNT = 3;
  const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

  // Rate limit por tipo: mapeia tipo → Date de liberação (se bloqueado)
  const disabledUpdateTypes = useMemo(() => {
    if (!user) return {};
    const cutoff = new Date(Date.now() - SEVEN_DAYS_MS);
    const result = {};
    reportUpdates.forEach((u) => {
      if (u.author_id === user.id && new Date(u.created_at) > cutoff) {
        const unlockDate = new Date(new Date(u.created_at).getTime() + SEVEN_DAYS_MS);
        if (!result[u.update_type] || unlockDate > result[u.update_type]) {
          result[u.update_type] = unlockDate;
        }
      }
    });
    return result;
  }, [reportUpdates, user]);

  const canSendAnyUpdate = useMemo(() => {
    if (!user) return false;
    return ['still_here', 'being_solved', 'solved'].some((t) => !disabledUpdateTypes[t]);
  }, [user, disabledUpdateTypes]);

  const visibleUpdates = useMemo(() => {
    return reportUpdates.filter((upd) => {
      // Rejeitadas e excluídas não aparecem para ninguém na ReportPage
      if (upd.status === 'rejected') return false;
      // Pendentes de moderação: só admin, autor da bronca e autor da atualização
      if (upd.status === 'pending_moderation') {
        return user?.is_admin || user?.id === report?.author_id || user?.id === upd.author_id;
      }
      return true;
    });
  }, [reportUpdates, user, report?.author_id]);

  const qrCodeUrl = useMemo(() => {
    if (!reportId) return "";
    const url = getReportShareUrl(reportId);
    return `https://api.qrserver.com/v1/create-qr-code/?size=380x380&data=${encodeURIComponent(
      url
    )}`;
  }, [reportId]);

  const handleNavigateToReport = useCallback(() => {
    if (!report?.location?.lat || !report?.location?.lng) {
      toast({
        title: "Localização não disponível",
        description: "Esta bronca não possui coordenadas cadastradas.",
        variant: "destructive",
      });
      return;
    }
    const { lat, lng } = report.location;
    const label = encodeURIComponent(
      report.address || report.title || "Bronca"
    );

    if (Capacitor.isNativePlatform()) {
      const platform = Capacitor.getPlatform();
      if (platform === "ios") {
        window.open(`maps://?daddr=${lat},${lng}&dirflg=d`, "_system");
      } else {
        // Android: geo URI abre seletor de apps de navegação
        window.open(`geo:${lat},${lng}?q=${lat},${lng}(${label})`, "_system");
      }
    } else {
      window.open(
        `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`,
        "_blank",
        "noopener,noreferrer"
      );
    }
  }, [report, toast]);

  const getBaseUrl = useCallback(() => {
    let baseUrl;
    if (import.meta.env.VITE_APP_URL) {
      baseUrl = import.meta.env.VITE_APP_URL;
    } else if (Capacitor.isNativePlatform()) {
      baseUrl = "https://trombonecidadao.com.br";
    } else if (typeof window !== "undefined") {
      const origin = window.location.origin;
      if (origin.includes("localhost")) baseUrl = origin;
      else if (
        origin.includes("trombone-cidadao.vercel.app") ||
        origin.includes("vercel.app")
      )
        baseUrl = origin;
      else if (origin.includes("trombonecidadao.com.br"))
        baseUrl = "https://trombonecidadao.com.br";
      else baseUrl = origin;
    } else {
      baseUrl = "https://trombonecidadao.com.br";
    }
    return baseUrl.replace(/\/$/, "");
  }, []);

  const baseUrl = useMemo(() => getBaseUrl(), [getBaseUrl]);

  const reportPhotos = useMemo(() => {
    if (!report || !report.photos) return [];
    return Array.isArray(report.photos) ? report.photos : [];
  }, [report?.photos]);

  const seoData = useMemo(() => {
    const defaultThumbnail = `${baseUrl}/images/thumbnail.jpg`;
    let reportImage = defaultThumbnail;
    if (reportPhotos && reportPhotos.length > 0) {
      const firstPhoto = reportPhotos[0];
      if (firstPhoto) {
        const imageUrl =
          firstPhoto.url ||
          firstPhoto.publicUrl ||
          firstPhoto.photo_url ||
          firstPhoto.image_url;
        if (imageUrl) {
          if (imageUrl.startsWith("http")) reportImage = imageUrl;
          else
            reportImage = `${baseUrl}${
              imageUrl.startsWith("/") ? "" : "/"
            }${imageUrl}`;
          try {
            const cleanUrl = reportImage.split("?")[0];
            reportImage = `https://wsrv.nl/?url=${encodeURIComponent(
              cleanUrl
            )}&w=600&h=315&fit=cover&q=60&output=jpg`;
          } catch (e) {
            console.error(e);
          }
        }
      }
    }
    if (!reportImage || reportImage.trim() === "")
      reportImage = defaultThumbnail;
    const reportTitle = report?.title || "";
    const reportDescription = report?.description || "";
    const reportProtocol = report?.protocol || "";
    const currentReportId = report?.id || reportId || "";
    return {
      title: reportTitle
        ? `Bronca: ${reportTitle} - Trombone Cidadão`
        : "Trombone Cidadão",
      description:
        reportDescription ||
        `*Trombone Cidadão*\n\n*${
          reportTitle || "Bronca"
        }*\n\nVeja em: ${baseUrl}/bronca/${currentReportId}`,
      image: reportImage,
      url: `${baseUrl}/bronca/${currentReportId}`,
    };
  }, [
    baseUrl,
    report?.title,
    report?.description,
    report?.protocol,
    report?.id,
    reportId,
    reportPhotos,
  ]);

  const seoTitle = seoData.title;
  const seoDescription = seoData.description;
  const seoImage = seoData.image;
  const seoUrl = seoData.url;

  const categories = {
    iluminacao: "Iluminação Pública",
    buracos: "Buracos na Via",
    esgoto: "Esgoto Entupido",
    limpeza: "Limpeza Urbana",
    poda: "Poda de Árvore",
    "vazamento-de-agua": "Vazamento de Água",
    outros: "Outros",
  };

  const getCategoryName = (category) => categories[category] || "Outros";

  const formatPoleLabel = (raw) => {
    const s = String(raw || "").trim();
    if (!s) return "";
    return s.replace(/^\s*\d+\s*[-–—]\s*/u, "").trim();
  };

  const getLightingIssueTypeLabel = (issueType) => {
    const key = String(issueType || "").trim();
    if (!key) return "";
    const map = {
      lamp_off: "lâmpada apagada",
      lamp_blinking: "piscando",
      lamp_on_daytime: "acesa durante o dia",
      no_lighting: "poste sem iluminação",
      arm_damaged: "braço/luminária danificado",
      exposed_wiring: "fiação exposta",
      pole_leaning: "poste inclinado",
      pole_broken: "poste quebrado",
      no_identifier: "sem identificação",
      other: "outro",
    };
    return map[key] || key;
  };

  const getStatusInfo = (status) => {
    const info = {
      pending: {
        text: "Pendente",
        colorClasses: "bg-amber-50 text-amber-700",
      },
      "in-progress": {
        text: "Em Andamento",
        colorClasses: "bg-blue-50 text-blue-700",
      },
      resolved: {
        text: "Resolvido",
        colorClasses: "bg-emerald-50 text-emerald-700",
      },
      duplicate: {
        text: "Duplicada",
        colorClasses: "bg-gray-100 text-gray-500",
      },
      pending_resolution: {
        text: "Verificando Resolução",
        colorClasses: "bg-blue-50 text-blue-700",
      },
      pending_approval: {
        text: "Aguardando Aprovação",
        colorClasses: "bg-amber-50 text-amber-700",
      },
    };
    return info[status] || info.pending;
  };

  const formatDateTime = (dateString) => {
    if (!dateString) return "";
    try {
      return new Date(dateString).toLocaleString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return "";
    }
  };

  const comments = useMemo(
    () => (Array.isArray(report?.comments) ? report.comments : []),
    [report?.comments]
  );

  const mediaItems = useMemo(() => {
    if (!report) return [];
    const photos = Array.isArray(report.photos) ? report.photos : [];
    const videos = Array.isArray(report.videos) ? report.videos : [];
    return [...photos, ...videos];
  }, [report?.photos, report?.videos]);

  const viewerMedia = useMemo(
    () =>
      mediaItems
        .map((item, index) => {
          const url =
            item.url ||
            item.publicUrl ||
            item.photo_url ||
            item.image_url ||
            item.video_url;
          if (!url) return null;
          const type =
            item.type === "video" || item.type === "video_url"
              ? "video"
              : "image";
          return { ...item, url, type, _index: index };
        })
        .filter(Boolean),
    [mediaItems]
  );

  const waterUtilityName = useMemo(() => {
    if (!report || !report.is_from_water_utility) return null;
    const address = (report.address || "").toLowerCase();
    const locationText = (report.categoryName || "").toLowerCase();
    const hasPernambucoText =
      address.includes("pernambuco") ||
      address.includes("-pe") ||
      address.endsWith(" pe") ||
      locationText.includes("pernambuco");
    let isPernambucoByCoordinates = false;
    if (
      report.location &&
      typeof report.location.lat === "number" &&
      typeof report.location.lng === "number"
    ) {
      const { lat, lng } = report.location;
      isPernambucoByCoordinates =
        lat >= -9.8 && lat <= -7.2 && lng >= -41.5 && lng <= -34.8;
    }
    return hasPernambucoText || isPernambucoByCoordinates
      ? "COMPESA"
      : "companhia de abastecimento de água/esgoto";
  }, [report]);

  const isFromWaterUtility = !!report?.is_from_water_utility;

  const handleSubmitComment = async (e) => {
    e.preventDefault();
    if (!user) {
      toast({
        title: "Acesso restrito",
        description: "Você precisa fazer login para comentar.",
        variant: "destructive",
      });
      navigate("/login");
      return;
    }
    if (!newComment.trim() || !report) return;
    const { error } = await supabase
      .from("comments")
      .insert({
        report_id: report.id,
        author_id: user.id,
        text: newComment,
        moderation_status: "pending_approval",
      });
    if (error)
      toast({
        title: "Erro ao enviar comentário",
        description: error.message,
        variant: "destructive",
      });
    else {
      setNewComment("");
      toast({
        title: "Comentário enviado! 💬",
        description:
          "Seu comentário foi enviado para moderação e será publicado em breve.",
      });
      fetchReport();
    }
  };

  const handleReportError = () =>
    toast({
      title: "Reportar erro",
      description: "Obrigado por avisar. Vamos analisar esta bronca.",
    });

  const handleWhatsAppShare = () => {
    if (!report) return;
    const shareUrl = getReportShareUrl(report.id);
    const shareText = `*Trombone Cidadão*\n\n*${
      report.title || "Bronca"
    }*\n\nVeja em:\n${shareUrl}`;
    const whatsappUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(
      shareText
    )}`;
    window.open(whatsappUrl, "_blank");
  };

  const handleShare = async () => {
    if (!report) return;
    const shareUrl = getReportShareUrl(report.id);
    const title = "Trombone Cidadão";
    const shareText = `*Trombone Cidadão*\n\n*${
      report.title || "Bronca"
    }*\n\nVeja em:\n${shareUrl}`;
    try {
      if (
        Capacitor.isNativePlatform() &&
        Capacitor.isPluginAvailable("Share")
      ) {
        await Share.share({ title, text: shareText });
        toast({ title: "Compartilhado com sucesso! 📣" });
        return;
      }
      if (navigator.share) {
        await navigator.share({ title, text: shareText });
        toast({ title: "Compartilhado com sucesso! 📣" });
        return;
      }
      await navigator.clipboard.writeText(shareText);
      toast({
        title: "Texto copiado!",
        description: "Cole nas suas redes sociais.",
      });
    } catch (error) {
      if (error?.name === "AbortError") return;
      try {
        await navigator.clipboard.writeText(shareText);
        toast({ title: "Texto copiado!" });
      } catch {
        toast({ title: "Erro ao compartilhar", variant: "destructive" });
      }
    }
  };

  const handleCopyShareLink = () => {
    if (!report) return;
    const shareUrl = seoUrl || `${baseUrl}/bronca/${report.id}`;
    navigator.clipboard
      .writeText(shareUrl)
      .then(() =>
        toast({
          title: "Link copiado!",
          description: "Cole nas suas redes sociais.",
        })
      )
      .catch(() =>
        toast({ title: "Erro ao copiar link", variant: "destructive" })
      );
  };

  // ── STORY CARD – all inline styles, zero Tailwind ──
  const handleDownloadStoryCard = async () => {
    // This function is now handled by ReportStoryModal component
    setShowStoryModal(true);
  };

  const handleAdminStatusChange = async (newStatus) => {
    if (!report || !canMarkResolved) return;
    const { error } = await supabase
      .from("reports")
      .update({ status: newStatus })
      .eq("id", report.id);
    if (error) {
      toast({
        title: "Erro ao atualizar status",
        description: error.message,
        variant: "destructive",
      });
      return;
    }
    setReport((prev) => (prev ? { ...prev, status: newStatus } : prev));
    toast({
      title: "Status atualizado",
      description: `A bronca agora está como "${
        getStatusInfo(newStatus).text
      }".`,
    });
  };

  const handleAdminCategoryChange = async (newCategory) => {
    if (!report || !canEditCategory) return;
    const updates = { category_id: newCategory };
    if (newCategory !== "buracos") updates.is_from_water_utility = null;
    const { error } = await supabase
      .from("reports")
      .update(updates)
      .eq("id", report.id);
    if (error) {
      toast({
        title: "Erro ao atualizar categoria",
        description: error.message,
        variant: "destructive",
      });
      return;
    }
    setReport((prev) =>
      prev
        ? {
            ...prev,
            category: newCategory,
            is_from_water_utility:
              newCategory === "buracos" ? prev.is_from_water_utility : null,
          }
        : prev
    );
    toast({ title: "Categoria atualizada" });
  };

  const handleAdminWaterUtilityChange = async (value) => {
    if (!report || !canEditWaterUtility) return;
    const isYes = value === "yes";
    const { error } = await supabase
      .from("reports")
      .update({ is_from_water_utility: isYes })
      .eq("id", report.id);
    if (error) {
      toast({
        title: "Erro ao atualizar informação",
        description: error.message,
        variant: "destructive",
      });
      return;
    }
    setReport((prev) =>
      prev ? { ...prev, is_from_water_utility: isYes } : prev
    );
    toast({ title: "Informação atualizada" });
  };

  const handleUpvoteClick = async () => {
    if (!report) return;
    const result = await handleUpvote(
      report.id,
      report.upvotes,
      report.user_has_upvoted
    );
    if (result.success)
      setReport((prev) =>
        prev
          ? {
              ...prev,
              upvotes: result.newUpvotes,
              user_has_upvoted: result.newUserHasUpvoted,
            }
          : prev
      );
  };

  const handleEditClick = () => {
    if (!report) return;
    if (!user) {
      toast({
        title: "Acesso restrito",
        description: "Você precisa fazer login para editar broncas.",
        variant: "destructive",
      });
      navigate("/login");
      return;
    }
    if (!canMarkResolved) {
      toast({
        title: "Acesso restrito",
        description: "Somente gestores podem editar esta bronca.",
        variant: "destructive",
      });
      return;
    }
    setShowEditDetails(true);
  };

  const handleMarkResolvedClick = () => {
    if (!report) return;
    if (!user) {
      toast({ title: "Acesso restrito", variant: "destructive" });
      navigate("/login");
      return;
    }
    if (!canMarkResolved) {
      toast({ title: "Acesso restrito", variant: "destructive" });
      return;
    }
    setShowMarkResolvedModal(true);
  };

  const handleConfirmResolution = async (resolutionData) => {
    if (!report || !user) return;
    const { photoFile } = resolutionData;
    let publicURLData = { publicUrl: null };
    if (photoFile) {
      let uploadFile = photoFile;
      try {
        const dataUrl = await new Promise((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result);
          reader.readAsDataURL(photoFile);
        });
        const img = await new Promise((resolve, reject) => {
          const image = new Image();
          image.onload = () => resolve(image);
          image.onerror = reject;
          image.src = dataUrl;
        });
        const canvas = document.createElement("canvas");
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0);
        const blob = await canvas.convertToBlob({
          type: "image/webp",
          quality: 0.9,
        });
        uploadFile = new File(
          [blob],
          (photoFile.name || "resolution").replace(/\.(jpe?g|png)$/i, ".webp"),
          { type: "image/webp" }
        );
      } catch (_) {}
      const filePath = `${user.id}/${report.id}/resolution-${Date.now()}`;
      const { error: uploadError } = await supabase.storage
        .from("reports-media")
        .upload(filePath, uploadFile);
      if (uploadError) {
        toast({
          title: "Erro no upload da foto",
          description: uploadError.message,
          variant: "destructive",
        });
        return;
      }
      const { data } = supabase.storage
        .from("reports-media")
        .getPublicUrl(filePath);
      publicURLData = data;
    }
    const updatedReport = {
      status: isAdmin ? "resolved" : "pending_resolution",
      resolution_submission: {
        photoUrl: publicURLData.publicUrl,
        userId: user.id,
        userName: user.name,
        submittedAt: new Date().toISOString(),
      },
      ...(isAdmin && { resolved_at: new Date().toISOString() }),
    };
    const { error } = await supabase
      .from("reports")
      .update(updatedReport)
      .eq("id", report.id);
    if (error) {
      toast({
        title: "Erro ao atualizar bronca",
        description: error.message,
        variant: "destructive",
      });
      return;
    }
    setReport((prev) => (prev ? { ...prev, ...updatedReport } : prev));
    setShowMarkResolvedModal(false);
    toast({
      title: "Bronca atualizada",
      description: isAdmin
        ? "Bronca marcada como resolvida."
        : "Resolução enviada para revisão.",
    });
  };

  const formatRelativeDate = (dateString) => {
    if (!dateString) return "";
    const diffMs = Date.now() - new Date(dateString).getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    if (diffDays === 0) return "hoje";
    if (diffDays === 1) return "ontem";
    if (diffDays < 7) return `há ${diffDays} dias`;
    return formatDateTime(dateString).split(",")[0];
  };

  const formatNextAvailable = (date) => {
    if (!date) return "";
    const diffDays = Math.ceil((date.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    if (diffDays <= 1) return "amanhã";
    return `em ${diffDays} dias`;
  };

  // Retorna "disponível em X dias" para o tipo mais cedo que libera
  const nextAvailableLabel = useMemo(() => {
    const dates = Object.values(disabledUpdateTypes);
    if (dates.length === 0) return null;
    const soonest = new Date(Math.min(...dates.map((d) => d.getTime())));
    return formatNextAvailable(soonest);
  }, [disabledUpdateTypes]);

  const getUpdateTypeInfo = (updateType) => {
    const map = {
      still_here: {
        label: "O problema ainda está aqui",
        color: "text-red-600",
        bgColor: "bg-red-50",
        cardBg: "bg-red-50/70",
        cardBorder: "border-red-100",
        iconBg: "bg-red-100",
        dotColor: "bg-red-500",
        Icon: AlertCircle,
        reportStatus: "pending",
      },
      being_solved: {
        label: "O problema está sendo resolvido",
        color: "text-amber-600",
        bgColor: "bg-amber-50",
        cardBg: "bg-amber-50/70",
        cardBorder: "border-amber-100",
        iconBg: "bg-amber-100",
        dotColor: "bg-amber-500",
        Icon: Clock,
        reportStatus: "in-progress",
      },
      solved: {
        label: "O problema foi resolvido",
        color: "text-emerald-600",
        bgColor: "bg-emerald-50",
        cardBg: "bg-emerald-50/70",
        cardBorder: "border-emerald-100",
        iconBg: "bg-emerald-100",
        dotColor: "bg-emerald-500",
        Icon: CheckCircle,
        reportStatus: "pending_resolution",
      },
    };
    return map[updateType] || map.still_here;
  };

  const handleSubmitUpdate = async () => {
    if (!user || !report || !updateType) return;
    const photos = await updateCam.resolveForUpload();
    const message = updateMessage;
    setSubmittingUpdate(true);
    try {
      const { data: newUpdate, error: insertError } = await supabase
        .from("report_updates")
        .insert({
          report_id: report.id,
          author_id: user.id,
          update_type: updateType,
          message: message || null,
          // Autor e admin auto-confirmam; outros entram em moderação
          status: isAuthorOrAdmin ? 'pending' : 'pending_moderation',
        })
        .select()
        .single();

      if (insertError) throw insertError;

      if (photos && photos.length > 0) {
        try {
          const mediaRecords = await Promise.all(
            photos.map(async (photo) => {
              const filePath = `${user.id}/${report.id}/updates/${newUpdate.id}/${Date.now()}-${photo.name}`;
              const { error: uploadError } = await supabase.storage
                .from("reports-media")
                .upload(filePath, photo);
              if (uploadError) throw uploadError;
              const {
                data: { publicUrl },
              } = supabase.storage.from("reports-media").getPublicUrl(filePath);
              return { report_update_id: newUpdate.id, url: publicUrl, type: "photo" };
            })
          );
          await supabase.from("report_update_media").insert(mediaRecords);
        } catch (uploadErr) {
          // Rollback: exclui o update para não deixar registro órfão
          await supabase.from("report_updates").delete().eq("id", newUpdate.id);
          throw new Error(
            "Falha no upload das fotos. A atualização não foi enviada. Tente novamente ou envie sem fotos."
          );
        }
      }

      // Atualização otimista
      const optimisticStatus = isAuthorOrAdmin ? 'pending' : 'pending_moderation';
      setReportUpdates((prev) => [
        {
          id: newUpdate.id,
          report_id: report.id,
          author_id: user.id,
          update_type: updateType,
          message: message || null,
          status: optimisticStatus,
          created_at: new Date().toISOString(),
          media: [],
          author: { name: user.name || "Você" },
        },
        ...prev,
      ]);

      // Autor da bronca ou admin: auto-confirma e já muda o status
      if (isAuthorOrAdmin) {
        const typeInfo = getUpdateTypeInfo(updateType);
        const newStatus =
          updateType === "solved" && isAdmin
            ? "resolved"
            : typeInfo.reportStatus;

        await supabase
          .from("report_updates")
          .update({
            status: "confirmed",
            confirmed_by: user.id,
            confirmed_at: new Date().toISOString(),
          })
          .eq("id", newUpdate.id);

        await supabase
          .from("reports")
          .update({ status: newStatus })
          .eq("id", report.id);

        setShowUpdateModal(false);
        updateCam.clearPhotos();
        setUpdateType(null);
        setUpdateMessage('');
        toast({
          title: "Atualização confirmada! ✅",
          description: `Status da bronca atualizado para "${getStatusInfo(newStatus).text}".`,
        });
      } else {
        setShowUpdateModal(false);
        updateCam.clearPhotos();
        setUpdateType(null);
        setUpdateMessage('');
        toast({
          title: "Atualização enviada! 📢",
          description: "Sua atualização será revisada antes de aparecer para todos.",
        });
      }

      fetchReport();
    } catch (err) {
      const isRlsError =
        err.message?.includes("row-level security") ||
        err.code === "42501";
      toast({
        title: isRlsError
          ? "Limite semanal atingido"
          : "Erro ao enviar atualização",
        description: isRlsError
          ? "Você já enviou este tipo de atualização esta semana. Tente outro tipo ou aguarde."
          : err.message,
        variant: "destructive",
      });
    } finally {
      setSubmittingUpdate(false);
    }
  };

  const handleConfirmUpdate = async (update) => {
    if (!user || !report) return;
    const typeInfo = getUpdateTypeInfo(update.update_type);
    const newReportStatus =
      update.update_type === "solved" && isAdmin
        ? "resolved"
        : typeInfo.reportStatus;

    const { error: updateError } = await supabase
      .from("report_updates")
      .update({
        status: "confirmed",
        confirmed_by: user.id,
        confirmed_at: new Date().toISOString(),
      })
      .eq("id", update.id);

    if (updateError) {
      toast({
        title: "Erro ao confirmar",
        description: updateError.message,
        variant: "destructive",
      });
      return;
    }

    await supabase
      .from("reports")
      .update({ status: newReportStatus })
      .eq("id", report.id);

    toast({
      title: "Atualização confirmada!",
      description: `Status da bronca atualizado para "${getStatusInfo(newReportStatus).text}".`,
    });
    fetchReport();
  };

  const handleDeleteUpdate = async (upd) => {
    if (!user) return;
    // Usa RPC security definer — evita RLS silencioso que retorna error:null sem deletar
    const { error } = await supabase.rpc('delete_report_update', { p_update_id: upd.id });
    if (error) {
      toast({ title: 'Erro ao excluir', description: error.message, variant: 'destructive' });
      return;
    }
    setReportUpdates((prev) => prev.filter((u) => u.id !== upd.id));
    toast({ title: 'Atualização excluída.' });
  };

  const handleModerate = async (approve) => {
    if (!report) return;
    setModerating(true);
    const newStatus = approve ? 'approved' : 'rejected';
    const updateData = { moderation_status: newStatus };
    if (approve) updateData.status = 'pending';
    const { error } = await supabase
      .from('reports')
      .update(updateData)
      .eq('id', report.id);
    setModerating(false);
    if (error) {
      toast({
        title: 'Erro ao moderar bronca',
        description: error.message,
        variant: 'destructive',
      });
      return;
    }
    toast({ title: approve ? 'Bronca aprovada! ✅' : 'Bronca rejeitada.' });
    navigate(-1);
  };

  const showManagementPanel =
    canMarkResolved && report?.moderation_status === "approved";
  const managementPanel = showManagementPanel ? (
    <ReportManagementPanel
      canMarkResolved={canMarkResolved}
      moderationStatus={report?.moderation_status}
      reportStatus={report?.status}
      reportCategory={report?.category}
      isFromWaterUtility={isFromWaterUtility}
      isUserAdmin={!!user?.is_admin}
      canEditCategory={canEditCategory}
      canEditWaterUtility={canEditWaterUtility}
      categories={categories}
      handleAdminStatusChange={handleAdminStatusChange}
      handleAdminCategoryChange={handleAdminCategoryChange}
      handleAdminWaterUtilityChange={handleAdminWaterUtilityChange}
    />
  ) : null;

  useEffect(() => {
    const imageToUse = seoImage || `${baseUrl}/images/thumbnail.jpg`;
    if (!imageToUse) return;
    const updateMetaTags = () => {
      [
        'meta[property="og:image"]',
        'meta[property="og:image:url"]',
        'meta[property="og:image:width"]',
        'meta[property="og:image:height"]',
        'meta[property="og:image:type"]',
        'meta[property="og:image:alt"]',
        'meta[name="twitter:image"]',
        'meta[name="twitter:image:alt"]',
        'meta[name="image"]',
        'link[rel="image_src"]',
      ].forEach((sel) =>
        document.querySelectorAll(sel).forEach((el) => el.remove())
      );
      [
        { k: "property", v: "og:image", c: imageToUse },
        { k: "property", v: "og:image:url", c: imageToUse },
        { k: "property", v: "og:image:width", c: "1200" },
        { k: "property", v: "og:image:height", c: "630" },
        { k: "property", v: "og:image:type", c: "image/jpeg" },
        { k: "property", v: "og:image:alt", c: seoTitle || "Trombone Cidadão" },
        { k: "name", v: "twitter:image", c: imageToUse },
        {
          k: "name",
          v: "twitter:image:alt",
          c: seoTitle || "Trombone Cidadão",
        },
        { k: "name", v: "image", c: imageToUse },
      ].forEach(({ k, v, c }) => {
        const el = document.createElement("meta");
        el.setAttribute(k, v);
        el.setAttribute("content", c);
        document.head.insertBefore(el, document.head.firstChild);
      });
      const link = document.createElement("link");
      link.setAttribute("rel", "image_src");
      link.setAttribute("href", imageToUse);
      document.head.insertBefore(link, document.head.firstChild);
    };
    updateMetaTags();
    const timers = [
      setTimeout(updateMetaTags, 100),
      setTimeout(updateMetaTags, 500),
      setTimeout(updateMetaTags, 1000),
    ];
    return () => timers.forEach(clearTimeout);
  }, [report?.id, reportPhotos, seoImage, seoTitle, baseUrl]);

  const fetchReport = useCallback(async () => {
    setLoading(true);
    try {
      if (reportId)
        await supabase.rpc("increment_views", {
          table_name: "reports",
          item_id: reportId,
        });
    } catch (e) {
      console.error(e);
    }
    const { data, error } = await supabase
      .from("reports")
      .select(
        "*, pole_number, pole:poles(id, identifier, plate, address), category:categories(name, icon), author:profiles!reports_author_id_fkey(name, avatar_type, avatar_url, avatar_config), comments!left(*, author:profiles!comments_author_id_fkey(name, avatar_type, avatar_url, avatar_config)), timeline:report_timeline(*), report_media(*), upvotes:signatures(count), favorite_reports(user_id), petitions(id, status)"
      )
      .eq("id", reportId)
      .single();
    if (error || !data) {
      setLoading(false);
      toast({
        title: "Bronca não encontrada",
        description:
          "A solicitação que você está procurando não existe ou foi removida.",
        variant: "destructive",
      });
      setTimeout(() => navigate("/"), 0);
      return;
    }
    let userHasSigned = false;
    if (user) {
      const { data: sig } = await supabase
        .from("signatures")
        .select("id")
        .eq("report_id", reportId)
        .eq("user_id", user.id)
        .maybeSingle();
      userHasSigned = !!sig;
    }
    setReport({
      ...data,
      location: data.location
        ? {
            lat: data.location.coordinates[1],
            lng: data.location.coordinates[0],
          }
        : null,
      category: data.category_id,
      categoryName: data.category?.name,
      categoryIcon: data.category?.icon,
      pole: data.pole || null,
      authorName: data.author?.name || "Anônimo",
      authorAvatar: data.author?.avatar_url,
      photos: (data.report_media || [])
        .filter((m) => m.type === "photo")
        .sort(
          (a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0)
        ),
      videos: (data.report_media || []).filter((m) => m.type === "video"),
      comments: (data.comments || [])
        .filter((c) => c.moderation_status === "approved")
        .map((c) => ({ ...c, authorName: c.author?.name || "Anônimo" })),
      upvotes: data.upvotes[0]?.count || 0,
      user_has_upvoted: userHasSigned,
      is_favorited: user
        ? data.favorite_reports.some((fav) => fav.user_id === user.id)
        : false,
      petitionId: data.petitions?.[0]?.id || null,
      petitionStatus: data.petitions?.[0]?.status || null,
      is_from_water_utility: data.is_from_water_utility,
    });

    const { data: updatesData } = await supabase
      .from("report_updates")
      .select(
        "id, report_id, author_id, update_type, message, status, confirmed_by, confirmed_at, created_at, author:profiles!report_updates_author_id_fkey(name, avatar_type, avatar_url, avatar_config), media:report_update_media(*)"
      )
      .eq("report_id", reportId)
      .order("created_at", { ascending: false });
    setReportUpdates(updatesData || []);

    setLoading(false);
  }, [reportId, navigate, toast, user]);

  useEffect(() => {
    fetchReport();
  }, [fetchReport]);

  // Auto-open update modal when navigated from FeedCard prompt
  useEffect(() => {
    if (location.state?.openUpdateModal && user && !loading) {
      setShowUpdateModal(true);
      // Clear state so modal doesn't re-open on refresh
      navigate(location.pathname, { replace: true, state: {} });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state?.openUpdateModal, user, loading]);

  useEffect(() => {
    if (Capacitor.isNativePlatform() || !reportId) return;
    const ua = navigator.userAgent || navigator.vendor || window.opera;
    const isMobile =
      /android/i.test(ua) || (/iPad|iPhone|iPod/.test(ua) && !window.MSStream);
    if (isMobile) {
      if (sessionStorage.getItem(`tried_open_app_${reportId}`)) return;
      sessionStorage.setItem(`tried_open_app_${reportId}`, "true");
      const iframe = document.createElement("iframe");
      Object.assign(iframe.style, {
        border: "none",
        width: "1px",
        height: "1px",
        display: "none",
      });
      document.body.appendChild(iframe);
      iframe.src = `trombonecidadao://bronca/${reportId}`;
      setTimeout(() => {
        if (document.body.contains(iframe)) document.body.removeChild(iframe);
      }, 3000);
    }
  }, [reportId]);

  const handleUpdateReport = async (editData) => {
    const {
      id,
      title,
      description,
      address,
      location,
      category_id,
      newPhotos,
      newVideos,
      removedMedia,
      status,
      is_recurrent,
      evaluation,
      resolution_submission,
      moderation_status,
      is_from_water_utility,
      pole_number,
      pole_id,
      reported_post_identifier,
      reported_plate,
      reported_pole_distance_m,
    } = editData;
    const reportUpdates = {
      title,
      description,
      address,
      category_id,
      status,
      is_recurrent,
      evaluation,
      resolution_submission,
      moderation_status,
    };
    if (typeof is_from_water_utility !== "undefined")
      reportUpdates.is_from_water_utility =
        category_id === "buracos" ? !!is_from_water_utility : null;
    if (typeof category_id !== "undefined") {
      if (category_id === "iluminacao") {
        if (typeof pole_number !== "undefined") {
          reportUpdates.pole_number = pole_number
            ? String(pole_number).trim()
            : null;
        }
        if (typeof pole_id !== "undefined") {
          reportUpdates.pole_id = pole_id || null;
        }
        if (typeof reported_post_identifier !== "undefined") {
          reportUpdates.reported_post_identifier = reported_post_identifier
            ? String(reported_post_identifier).trim()
            : null;
        }
        if (typeof reported_plate !== "undefined") {
          reportUpdates.reported_plate = reported_plate
            ? String(reported_plate).trim()
            : null;
        }
        if (typeof reported_pole_distance_m !== "undefined") {
          if (reported_pole_distance_m == null) {
            reportUpdates.reported_pole_distance_m = null;
          } else {
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
    } else if (typeof pole_number !== "undefined") {
      reportUpdates.pole_number = pole_number ? String(pole_number).trim() : null;
      if (typeof pole_id !== "undefined") {
        reportUpdates.pole_id = pole_id || null;
      }
      if (typeof reported_post_identifier !== "undefined") {
        reportUpdates.reported_post_identifier = reported_post_identifier
          ? String(reported_post_identifier).trim()
          : null;
      }
      if (typeof reported_plate !== "undefined") {
        reportUpdates.reported_plate = reported_plate
          ? String(reported_plate).trim()
          : null;
      }
      if (typeof reported_pole_distance_m !== "undefined") {
        if (reported_pole_distance_m == null) {
          reportUpdates.reported_pole_distance_m = null;
        } else {
          const n = Number(reported_pole_distance_m);
          reportUpdates.reported_pole_distance_m = Number.isFinite(n) ? n : null;
        }
      }
    }
    if (location)
      reportUpdates.location = `POINT(${location.lng} ${location.lat})`;
    const { error: updateError } = await supabase
      .from("reports")
      .update(reportUpdates)
      .eq("id", id);
    if (updateError) {
      toast({
        title: "Erro ao atualizar dados",
        description: updateError.message,
        variant: "destructive",
      });
      return;
    }
    if (removedMedia?.length) {
      await supabase.from("report_media").delete().in("id", removedMedia);
    }
    const mediaToUpload = [
      ...(newPhotos || []).map((p) => ({ ...p, type: "photo" })),
      ...(newVideos || []).map((v) => ({ ...v, type: "video" })),
    ];
    if (mediaToUpload.length > 0) {
      try {
        const uploaded = await Promise.all(
          mediaToUpload.map(async (media) => {
            const filePath = `${user.id}/${id}/${Date.now()}-${media.name}`;
            const { error: ue } = await supabase.storage
              .from("reports-media")
              .upload(filePath, media.file);
            if (ue) throw new Error(ue.message);
            const {
              data: { publicUrl },
            } = supabase.storage.from("reports-media").getPublicUrl(filePath);
            return {
              report_id: id,
              url: publicUrl,
              type: media.type,
              name: media.name,
            };
          })
        );
        await supabase.from("report_media").insert(uploaded);
      } catch (err) {
        toast({
          title: "Erro no upload de nova mídia",
          description: err.message,
          variant: "destructive",
        });
      }
    }
    toast({ title: "Bronca atualizada com sucesso! ✨" });
    fetchReport();
  };

  const handleFavoriteToggle = async (rId, isFav) => {
    if (!user) {
      toast({ title: "Acesso restrito", variant: "destructive" });
      navigate("/login");
      return;
    }
    if (isFav) {
      const { error } = await supabase
        .from("favorite_reports")
        .delete()
        .match({ user_id: user.id, report_id: rId });
      if (error)
        toast({
          title: "Erro ao desfavoritar",
          description: error.message,
          variant: "destructive",
        });
      else {
        toast({ title: "Removido dos favoritos! 💔" });
        setReport((prev) => ({ ...prev, is_favorited: false }));
      }
    } else {
      const { error } = await supabase
        .from("favorite_reports")
        .insert({ user_id: user.id, report_id: rId });
      if (error)
        toast({
          title: "Erro ao favoritar",
          description: error.message,
          variant: "destructive",
        });
      else {
        toast({ title: "Adicionado aos favoritos! ⭐" });
        setReport((prev) => ({ ...prev, is_favorited: true }));
      }
    }
  };

  const handleUpvoteFromDetails = async (id, upvotes, userHasUpvoted) => {
    const result = await handleUpvote(id, upvotes, userHasUpvoted);
    if (result.success)
      setReport((prev) =>
        prev && prev.id === id
          ? {
              ...prev,
              upvotes: result.newUpvotes,
              user_has_upvoted: result.newUserHasUpvoted,
            }
          : prev
      );
  };

  const handleOpenLinkModal = (sourceReport) => {
    setReportToLink(sourceReport);
    setShowLinkModal(true);
  };
  const handleLinkReport = async (sourceReportId, targetReportId) => {
    const { error } = await supabase
      .from("reports")
      .update({ status: "duplicate", linked_to: targetReportId })
      .eq("id", sourceReportId);
    if (error)
      toast({
        title: "Erro ao vincular bronca",
        description: error.message,
        variant: "destructive",
      });
    else {
      toast({ title: "Bronca vinculada! 🔗" });
      fetchReport();
    }
    setShowLinkModal(false);
    setReportToLink(null);
  };

  useEffect(() => {
    if (!isInteractive) return;

    setShowBack(true);
    setOnBack(() => () => {
      if (window.history.length > 1) {
        navigate(-1);
      } else {
        navigate("/", { replace: true });
      }
    });
    setTitle(report?.title ? report.title : "Detalhes da Bronca");

    if (!report) {
      setActions([]);
      return () => reset();
    }

    setActions([
      {
        key: "favorite",
        icon: Star,
        onPress: () => handleFavoriteToggle(report.id, report.is_favorited),
        isActive: !!report.is_favorited,
        ariaLabel: report.is_favorited ? "Remover dos favoritos" : "Favoritar",
      },
      {
        key: "share",
        icon: Share2,
        onPress: handleShare,
        ariaLabel: "Compartilhar",
      },
    ]);

    return () => reset();
  }, [
    handleShare,
    isInteractive,
    navigate,
    report,
    reset,
    setActions,
    setOnBack,
    setShowBack,
    setTitle,
  ]);

  // First photo URL for story card cover
  const coverPhotoUrl = useMemo(() => {
    if (!reportPhotos.length) return null;
    const p = reportPhotos[0];
    return p.url || p.publicUrl || p.photo_url || p.image_url || null;
  }, [reportPhotos]);

  return (
    <>
      <DynamicSEO
        key={`report-page-${report?.id || "loading"}`}
        title={seoTitle}
        description={seoDescription}
        image={seoImage || `${baseUrl}/images/thumbnail.jpg`}
        url={seoUrl || `${baseUrl}/bronca/${reportId}`}
        type="article"
      />

      {loading && (
        <div className="fixed inset-0 bg-background/80 flex items-center justify-center z-50">
          <p>Carregando...</p>
        </div>
      )}

      {!loading && !report && (
        <div className="container mx-auto px-4 py-12 text-center">
          <h1 className="text-2xl font-bold">Bronca não encontrada</h1>
          <Button asChild className="mt-4">
            <Link to="/">Voltar para Home</Link>
          </Button>
        </div>
      )}

      {!loading && report && (
        <>
          {/* ── TOP NAV ── */}
          {!isInteractive && (
            <>
              <ReportHeader
                onBack={() => navigate(-1)}
                protocol={report.protocol}
                showAdminActions={isAdmin || isPublicOfficial}
                handleOpenLinkModal={() => handleOpenLinkModal(report)}
                handleEditClick={handleEditClick}
                handleReportError={handleReportError}
                handleWhatsAppShare={handleWhatsAppShare}
                handleCopyShareLink={handleCopyShareLink}
                handleShare={handleShare}
              />
              <div className="hidden lg:block bg-surface-subtle">
                <div className="max-w-5xl lg:max-w-6xl 2xl:max-w-[100rem] mx-auto px-4 py-2 text-2xs text-content-tertiary flex items-center gap-1">
                  <Link to="/" className="hover:text-brand transition-colors">
                    Início
                  </Link>
                  <span className="opacity-50">›</span>
                  <span>Broncas</span>
                  <span className="opacity-50">›</span>
                  <span className="text-content-primary truncate">{report.title}</span>
                </div>
              </div>
            </>
          )}

          {/* ── PAGE ── */}
          <div className="bg-surface-sunken min-h-screen overflow-x-hidden">
            <div className="max-w-5xl lg:max-w-6xl 2xl:max-w-[100rem] mx-auto px-4 py-4 lg:py-8 grid gap-6 grid-cols-1 lg:grid-cols-3">
              <div className="lg:col-span-2">
                {managementPanel && (
                  <div className="mb-4 lg:hidden">{managementPanel}</div>
                )}
                <div className="space-y-4">
                  <div className="bg-surface-raised shadow-elevation-1 rounded-2xl overflow-hidden">
                    <ReportMediaHero
                      viewerMedia={viewerMedia}
                      getCategoryName={getCategoryName}
                      category={report.category}
                      status={report.status}
                      mediaViewerState={mediaViewerState}
                      setMediaViewerState={setMediaViewerState}
                    />
                  </div>

                  {/* summary */}
                  <div className="bg-surface-raised border border-edge-subtle rounded-2xl px-4 py-4">
                    <ReportSummary
                      title={report.title}
                      address={report.address}
                      createdAt={report.created_at}
                      protocol={report.protocol}
                      isAnonymous={report.is_anonymous}
                      authorName={report.authorName}
                      authorAvatar={report.authorAvatar}
                    />
                  </div>

                  {/* gallery */}
                  {viewerMedia.length > 1 && (
                    <div className="bg-surface-raised border border-edge-subtle rounded-2xl px-4 py-4">
                      <ReportMediaGallery
                        viewerMedia={viewerMedia}
                        setMediaViewerState={setMediaViewerState}
                      />
                    </div>
                  )}

                  {/* description */}
                  <ReportProblemDescription description={report.description} />

                  {/* details */}
                  <ReportProblemDetails
                    category={report.category}
                    createdAt={report.created_at}
                    waterUtilityName={waterUtilityName}
                    isFromWaterUtility={isFromWaterUtility}
                    issueType={report.issue_type}
                    pole={report.pole}
                    poleNumber={report.pole_number}
                    reportedPlate={report.reported_plate}
                    reportedPostIdentifier={report.reported_post_identifier}
                    formatDateTime={formatDateTime}
                    getLightingIssueTypeLabel={getLightingIssueTypeLabel}
                    formatPoleLabel={formatPoleLabel}
                  />

                  {/* timeline */}
                  <ReportProgress
                    status={report.status}
                    timeline={report.timeline}
                    formatDateTime={formatDateTime}
                  />

                  {/* mobile upvote */}
                  <div className="bg-surface-subtle rounded-2xl px-4 py-4 lg:hidden">
                    <div className="text-2xs font-bold uppercase tracking-[0.15em] text-content-tertiary mb-1 text-center">
                      Apoios da comunidade
                    </div>
                    <div className="text-3xl font-extrabold text-content-primary tracking-[-0.02em] text-center">
                      {report.upvotes || 0}
                    </div>
                    <div className="text-xs text-content-tertiary mt-1 mb-4 text-center">
                      pessoas já apoiaram
                    </div>
                    <Button
                      className="w-full justify-center gap-2 text-sm font-semibold rounded-full bg-brand hover:bg-brand/90 text-content-onBrand shadow-elevation-2"
                      onClick={handleUpvoteClick}
                    >
                      <ThumbsUp
                        className={`w-4 h-4 ${report.user_has_upvoted ? "fill-content-onBrand" : ""}`}
                        strokeWidth={1.5}
                      />
                      {report.user_has_upvoted ? "Apoiada" : "Apoiar"}
                    </Button>
                    <Button
                      className="mt-2 w-full justify-center gap-2 text-sm font-semibold rounded-full bg-surface-raised hover:bg-surface-subtleHover text-content-primary shadow-elevation-1"
                      onClick={handleShare}
                    >
                      <Share2 className="w-4 h-4" strokeWidth={1.5} />
                      Compartilhar
                    </Button>
                    {user && canSendAnyUpdate && (
                      <Button
                        className="mt-2 w-full justify-center gap-2 text-sm font-semibold rounded-full bg-surface-raised hover:bg-surface-subtleHover text-brand shadow-elevation-1"
                        onClick={() => setShowUpdateModal(true)}
                      >
                        <Megaphone className="w-4 h-4" strokeWidth={1.5} />
                        Enviar Atualização
                      </Button>
                    )}
                    <Button
                      className="w-full mt-2 justify-center gap-2 text-sm text-content-primary rounded-full bg-surface-raised hover:bg-surface-subtleHover shadow-elevation-1"
                      onClick={() =>
                        handleFavoriteToggle(report.id, report.is_favorited)
                      }
                    >
                      <Star
                        className={`w-4 h-4 ${
                          report.is_favorited
                            ? "fill-amber-400 text-amber-400"
                            : ""
                        }`}
                        strokeWidth={1.5}
                      />
                      {report.is_favorited ? "Favoritada" : "Favoritar"}
                    </Button>
                    {report.petitionId && (
                      <Button
                        asChild
                        className="w-full mt-2 justify-center gap-2 text-sm bg-surface-raised text-content-primary"
                      >
                        <Link to={`/abaixo-assinado/${report.petitionId}`}>
                          <FileSignature className="w-4 h-4" />
                          Ver abaixo-assinado ligado
                        </Link>
                      </Button>
                    )}
                  </div>

                  {/* ── COMMUNITY UPDATES ── */}
                  <ReportUpdates
                    user={user}
                    isAdmin={isAdmin}
                    visibleUpdates={visibleUpdates}
                    showAllUpdates={showAllUpdates}
                    setShowAllUpdates={setShowAllUpdates}
                    canSendAnyUpdate={canSendAnyUpdate}
                    nextAvailableLabel={nextAvailableLabel}
                    setShowUpdateModal={setShowUpdateModal}
                    UPDATES_VISIBLE_COUNT={UPDATES_VISIBLE_COUNT}
                    confirmingUpdateId={confirmingUpdateId}
                    setConfirmingUpdateId={setConfirmingUpdateId}
                    deletingUpdateId={deletingUpdateId}
                    setDeletingUpdateId={setDeletingUpdateId}
                    canConfirmUpdate={canConfirmUpdate}
                    canDeleteUpdate={canDeleteUpdate}
                    handleConfirmUpdate={handleConfirmUpdate}
                    handleDeleteUpdate={handleDeleteUpdate}
                    getUpdateTypeInfo={getUpdateTypeInfo}
                    getStatusInfo={getStatusInfo}
                    formatRelativeDate={formatRelativeDate}
                    formatDateTime={formatDateTime}
                    setUpdateMediaViewer={setUpdateMediaViewer}
                  />

                  {/* Map Section (Mobile Only) */}
                  <ReportLocation
                    location={report.location}
                    address={report.address}
                    onNavigate={handleNavigateToReport}
                    variant="mobile"
                  />

                  {/* comments */}
                  <ReportComments
                    comments={comments}
                    user={user}
                    newComment={newComment}
                    setNewComment={setNewComment}
                    handleSubmitComment={handleSubmitComment}
                    formatDateTime={formatDateTime}
                  />

                  {/* ── REPUBLICAR ── */}
                  <section className="bg-surface-subtle rounded-2xl px-4 py-4 sm:px-6 sm:py-6 flex flex-col sm:flex-row items-center gap-4 sm:gap-6">
                    <div className="flex-1 space-y-2 text-center sm:text-left">
                      <h3 className="text-sm font-bold text-content-primary">
                        Republicar esta denúncia
                      </h3>
                      <p className="text-xs text-content-secondary max-w-xl">
                        Use o QR Code ou o link da bronca para convidar mais
                        pessoas a apoiar. Quanto mais gente ver esta página,
                        maior a pressão por mudança.
                      </p>
                      <div className="flex flex-col sm:flex-row sm:flex-wrap gap-2 pt-1 justify-center sm:justify-start">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={handleCopyShareLink}
                          className="w-full sm:w-auto justify-center gap-2 rounded-full border-cta-border text-cta-fg bg-transparent hover:bg-surface-subtleHover"
                        >
                          <Icon name="share" size={14} />
                          Copiar link da bronca
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setShowFlyerModal(true)}
                          className="w-full sm:w-auto justify-center gap-2 rounded-full border-cta-border text-cta-fg bg-transparent hover:bg-surface-subtleHover"
                        >
                          <FileText className="w-4 h-4" />
                          Baixar QR Code / Panfleto
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setShowStoryModal(true)}
                          className="w-full sm:w-auto justify-center gap-2 rounded-full border-cta-border text-cta-fg bg-transparent hover:bg-surface-subtleHover"
                        >
                          <Instagram className="w-4 h-4" />
                          Baixar card de stories
                        </Button>
                      </div>
                    </div>
                    <div className="flex-shrink-0 flex items-center justify-center rounded-2xl bg-surface-raised border border-edge-subtle p-3">
                      {qrCodeUrl ? (
                        <img
                          src={qrCodeUrl}
                          alt="QR Code da bronca"
                          className="w-28 h-28 sm:w-32 sm:h-32 rounded-xl"
                          loading="lazy"
                        />
                      ) : (
                        <div className="w-28 h-28 sm:w-32 sm:h-32 rounded-xl bg-surface-subtle flex items-center justify-center">
                          <span className="text-2xs text-content-tertiary">
                            QR Code
                          </span>
                        </div>
                      )}
                    </div>
                  </section>
                </div>
              </div>

              {/* ── SIDEBAR ── */}
              <aside className="space-y-4">
                <div className="bg-surface-raised border border-edge-subtle rounded-2xl shadow-elevation-1 px-5 py-6 text-center hidden lg:block">
                  <div className="text-2xs font-bold uppercase tracking-[0.2em] text-content-tertiary mb-1">
                    Apoios
                  </div>
                  <div className="text-4xl font-extrabold text-content-primary tracking-[-0.02em]">
                    {report.upvotes || 0}
                  </div>
                  <div className="text-xs text-content-tertiary mt-1 mb-4">
                    pessoas apoiaram essa bronca
                  </div>
                  <Button
                    className="w-full justify-center gap-2 text-sm font-semibold rounded-full bg-brand hover:bg-brand/90 text-content-onBrand shadow-elevation-2"
                    onClick={handleUpvoteClick}
                  >
                    <ThumbsUp
                      className={`w-4 h-4 ${report.user_has_upvoted ? "fill-content-onBrand" : ""}`}
                      strokeWidth={1.5}
                    />
                    {report.user_has_upvoted ? "Apoiada" : "Apoiar essa bronca"}
                  </Button>
                  <Button
                    className="mt-2 w-full justify-center gap-2 text-sm font-semibold rounded-full bg-surface-subtle hover:bg-surface-subtleHover text-content-primary"
                    onClick={handleShare}
                  >
                    <Share2 className="w-4 h-4" strokeWidth={1.5} />
                    Compartilhar bronca
                  </Button>
                  {user && (
                    <Button
                      className="mt-2 w-full justify-center gap-2 text-sm font-semibold rounded-full bg-surface-subtle hover:bg-surface-subtleHover text-brand"
                      onClick={() => setShowUpdateModal(true)}
                    >
                      <Megaphone className="w-4 h-4" strokeWidth={1.5} />
                      Enviar Atualização
                    </Button>
                  )}
                  <Button
                    className="w-full mt-2 justify-center gap-2 text-sm text-content-primary rounded-full bg-surface-subtle hover:bg-surface-subtleHover"
                    onClick={() =>
                      handleFavoriteToggle(report.id, report.is_favorited)
                    }
                  >
                    <Star
                      className={`w-4 h-4 ${
                        report.is_favorited
                          ? "fill-amber-400 text-amber-400"
                          : ""
                      }`}
                      strokeWidth={1.5}
                    />
                    {report.is_favorited ? "Favoritada" : "Favoritar"}
                  </Button>
                  {report.petitionId && (
                    <Button
                      asChild
                      className="w-full mt-2 justify-center gap-2 text-sm rounded-full bg-surface-subtle text-content-primary"
                    >
                      <Link to={`/abaixo-assinado/${report.petitionId}`}>
                        <FileSignature className="w-4 h-4" strokeWidth={1.5} />
                        Ver abaixo-assinado ligado
                      </Link>
                    </Button>
                  )}
                </div>

                {/* Map Card (Desktop Only) */}
                <ReportLocation
                  location={report.location}
                  address={report.address}
                  onNavigate={handleNavigateToReport}
                  variant="desktop"
                />

                {managementPanel && (
                  <div className="hidden lg:block">{managementPanel}</div>
                )}
              </aside>
            </div>
          </div>

          {/* ── MODALS ── */}
          {showDonationModal && (
            <DonationModal
              report={report}
              isOpen={showDonationModal}
              onClose={() => setShowDonationModal(false)}
            />
          )}
          {showEditDetails && report && (
            <ReportDetails
              report={report}
              onClose={() => setShowEditDetails(false)}
              onUpdate={handleUpdateReport}
              onUpvote={handleUpvoteFromDetails}
              onLink={handleOpenLinkModal}
              onFavoriteToggle={handleFavoriteToggle}
              onDonate={() => setShowDonationModal(true)}
              startInEdit={true}
            />
          )}
          {showMarkResolvedModal && (
            <MarkResolvedModal
              onClose={() => setShowMarkResolvedModal(false)}
              onSubmit={handleConfirmResolution}
            />
          )}
          {showLinkModal && reportToLink && (
            <LinkReportModal
              sourceReport={reportToLink}
              allReports={allReports}
              onClose={() => setShowLinkModal(false)}
              onLink={handleLinkReport}
            />
          )}

          {showUpdateModal && (
            <ReportUpdateModal
              onClose={() => { setShowUpdateModal(false); updateCam.clearPhotos(); setUpdateType(null); setUpdateMessage(''); }}
              onSubmit={handleSubmitUpdate}
              submitting={submittingUpdate}
              disabledTypes={disabledUpdateTypes}
              cam={updateCam}
              selectedType={updateType}
              onSelectType={setUpdateType}
              message={updateMessage}
              onMessageChange={setUpdateMessage}
            />
          )}

          {updateMediaViewer.isOpen && updateMediaViewer.media.length > 0 && (
            <MediaViewer
              media={updateMediaViewer.media}
              startIndex={updateMediaViewer.startIndex}
              onClose={() => setUpdateMediaViewer({ isOpen: false, media: [], startIndex: 0 })}
            />
          )}

          {/* flyer modal */}
          <ReportFlyerModal
            isOpen={showFlyerModal}
            onClose={() => setShowFlyerModal(false)}
            report={report}
            qrCodeUrl={qrCodeUrl}
            reportId={reportId}
            baseUrl={baseUrl}
            toast={toast}
          />

          <ReportStoryModal
            isOpen={showStoryModal}
            onClose={() => setShowStoryModal(false)}
            report={report}
            qrCodeUrl={qrCodeUrl}
            coverPhotoUrl={coverPhotoUrl}
          />

          {/* Barra fixa "Adicionar comentário" (mobile). Escondida quando a
              barra de moderação do embaixador está visível, pra não empilhar
              duas barras fixas no rodapé. */}
          {!canModerate && report && (
            <ReportCommentBar
              user={user}
              newComment={newComment}
              setNewComment={setNewComment}
              handleSubmitComment={handleSubmitComment}
            />
          )}

          {/* Barra de moderação do embaixador (aprovar/rejeitar) */}
          <ReportModerationBar
            canModerate={canModerate}
            moderating={moderating}
            handleModerate={handleModerate}
          />
        </>
      )}
    </>
  );
};

export default ReportPage;

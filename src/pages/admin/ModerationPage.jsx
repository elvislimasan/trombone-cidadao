import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '@/lib/customSupabaseClient';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import {
  ArrowLeft, Check, X, Eye, ChevronLeft, ChevronRight, Search,
  AlertCircle, FileText, CheckCircle2, Info,
  User, Clock, Image as ImageIcon, Trash2,
  ZoomIn, ExternalLink, Loader2, MapPin, Flag
} from 'lucide-react';
import ReportDetails from '@/components/ReportDetails';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useCity } from '@/contexts/CityContext';
import { nomeDaCategoria } from '@/lib/reportCategories';
import { useIsMobile } from '@/hooks/useIsMobile';
import { useInfiniteScroll } from '@/hooks/useInfiniteScroll';
import { showAppError } from '@/lib/appError';
import { MOTIVOS_DE_REJEICAO } from '@/lib/reportRejection';

// Normaliza para busca: sem acento, sem caixa. "Sao Vicente" acha "São Vicente".
const normalizar = (s) =>
  (s || '').toLowerCase().normalize('NFD').replace(/\p{Mn}/gu, '');

/**
 * Há quanto tempo o item espera.
 *
 * Numa fila de moderação a idade importa mais que a data: "há 3 dias" é uma
 * cobrança, "12 de ago" é uma informação. A data exata continua acessível no
 * `title` do elemento, para quando alguém precisar dela.
 */
const esperaHa = (iso) => {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '';
  const min = Math.max(0, Math.round((Date.now() - t) / 60000));
  if (min < 60) return `há ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `há ${h}h`;
  const d = Math.round(h / 24);
  if (d < 30) return `há ${d} ${d === 1 ? 'dia' : 'dias'}`;
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
};

/** A primeira foto de uma lista de mídia. */
const primeiraFoto = (midias) =>
  (midias || []).find((m) => m?.type === 'photo' && m?.url)?.url || null;

// Fora do componente: são constantes, e recriá-las a cada render fazia o
// `useMemo` da busca recalcular sempre — além do aviso do eslint.
const UPDATE_TYPE_LABELS = {
  still_here: 'O problema ainda está aqui',
  being_solved: 'O problema está sendo resolvido',
  solved: 'O problema foi resolvido',
};
const UPDATE_TYPE_COLORS = {
  still_here: 'bg-danger-subtleBg text-danger-subtleFg border-danger/25',
  being_solved: 'bg-status-progressBg text-status-progressFg border-status-progressBorder',
  solved: 'bg-status-resolvedBg text-status-resolvedFg border-status-resolvedBorder',
};

const ModerationPage = () => {
  const { type } = useParams();
  const { user } = useAuth();
  const { cities, loadingCities } = useCity();
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedReport, setSelectedReport] = useState(null);
  const [selectedWorkMedia, setSelectedWorkMedia] = useState(null);

  // Pagination, Search, Filter states
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 8;
  
  // Modal states
  const [isRejectModalOpen, setIsRejectModalOpen] = useState(false);
  const [itemToReject, setItemToReject] = useState(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [rejectionCode, setRejectionCode] = useState('');
  const [rejectionTitle, setRejectionTitle] = useState('');
  const [rejectionDescription, setRejectionDescription] = useState('');

  const [isApproveModalOpen, setIsApproveModalOpen] = useState(false);
  const [itemToApprove, setItemToApprove] = useState(null);

  // ── Cidade atribuída na aprovação ──
  //
  // Bronca sem `city_id` existe: o modo patrulha grava a partir do GPS, e o
  // reverse-geocode pode não ter respondido a tempo do primeiro registro. Sem
  // cidade a bronca sai de todo escopo do app — placar, clusters do mapa e,
  // principalmente, o painel do embaixador, cuja RLS é
  // `is_ambassador_of(uid, city_id)`. Aprovar assim publica uma bronca que
  // ninguém da cidade dela consegue administrar depois.
  //
  // Por isso é o moderador quem fecha o buraco, no momento em que já está
  // olhando a bronca no mapa da revisão. Não há como o servidor adivinhar:
  // `cities` não tem polígono, e `match_city` casa por nome.
  const [approveCityId, setApproveCityId] = useState('');
  const [approveCitySearch, setApproveCitySearch] = useState('');

  const [lightboxImage, setLightboxImage] = useState(null);

  // Per-item action loading state
  const [actionLoadingId, setActionLoadingId] = useState(null);

  const isReportModeration = type === 'broncas';
  const isResolutionModeration = type === 'resolucoes';
  const isPetitionModeration = type === 'peticoes';
  const isWorkMediaModeration = type === 'obras-midias';
  const isUpdateModeration = type === 'atualizacoes';
  // Comentário é o caso padrão desta página: qualquer `type` que não seja um
  // dos acima cai aqui (é assim que /admin/moderacao/comentarios funciona).
  const isCommentModeration =
    !isReportModeration &&
    !isResolutionModeration &&
    !isPetitionModeration &&
    !isWorkMediaModeration &&
    !isUpdateModeration;

  const pageTitle = isUpdateModeration ? 'Moderação de Atualizações' :
                   isWorkMediaModeration ? 'Moderação de Mídias de Obras' :
                   isResolutionModeration ? 'Moderação de Resoluções' :
                   isReportModeration ? 'Moderação de Broncas' :
                   isPetitionModeration ? 'Moderação de Abaixo-Assinados' :
                   'Comentários Denunciados';

  const fetchItems = useCallback(async () => {
    setLoading(true);

    try {
      if (isUpdateModeration) {
        const { data, error } = await supabase
          .from('report_updates')
          .select(
            'id, report_id, author_id, update_type, message, status, created_at, ' +
            'author:profiles!report_updates_author_id_fkey(name), ' +
            // Endereco e foto da bronca vem junto: sem eles o moderador tinha
            // que abrir a bronca em outra aba para saber DE ONDE se fala, e
            // julgar "o problema ainda esta aqui" sem ver o lugar e julgar no
            // escuro. Uma linha a mais na consulta poupa uma navegacao por item.
            'report:reports!report_updates_report_id_fkey(id, title, address, report_media(url, type)), ' +
            'media:report_update_media(*)'
          )
          .eq('status', 'pending_moderation')
          .order('created_at', { ascending: true });
        if (error) throw error;
        setItems(data || []);
      } else if (isWorkMediaModeration) {
        const { data, error } = await supabase
          .from('public_work_media')
          .select('*, work:public_works(title), contributor:profiles!contributor_id(name)')
          .eq('status', 'pending')
          .order('created_at', { ascending: true });
        if (error) throw error;
        setItems(data || []);
      } else if (isResolutionModeration) {
        const { data, error } = await supabase
          .from('reports')
          .select('*, author:profiles!author_id(name)')
          .eq('status', 'pending_resolution')
          .not('resolution_submission', 'is', null)
          .order('created_at', { ascending: true });
        if (error) throw error;
        setItems(data || []);
      } else if (isPetitionModeration) {
        const { data, error } = await supabase
          .from('petitions')
          .select('*, author:profiles!author_id(name)')
          .eq('status', 'pending_moderation')
          .order('created_at', { ascending: true });
        if (error) throw error;
        setItems(data || []);
      } else if (isCommentModeration) {
        // O que entra nesta fila é DENÚNCIA ABERTA, não status.
        //
        // O corte de 3 é quando o comentário some do feed sozinho — não é
        // quando a moderação fica sabendo. Amarrar a fila ao status deixava o
        // admin cego justamente na janela em que dá para agir cedo: a primeira
        // denúncia chegava e a tela dizia "tudo limpo por aqui".
        //
        // `!inner` é o que faz o filtro da denúncia recortar o comentário: sem
        // ele, viria todo comentário do banco com a lista de denúncias vazia.
        const { data, error } = await supabase
          .from('comments')
          .select(
            '*, author:profiles!author_id(name), report:reports(id, title), ' +
            'denuncias:comment_reports!inner(id, reason, created_at, resolved_at)'
          )
          .is('denuncias.resolved_at', null)
          // Comentário de notícia tem fila própria dentro de "Gerenciar
          // Notícias"; aqui ele viria sem contexto nenhum.
          .not('report_id', 'is', null)
          .order('created_at', { ascending: true });
        if (error) throw error;
        setItems(data || []);
      } else {
        const tableToFetch = isReportModeration ? 'reports' : 'comments';
        const statusField = 'moderation_status';
        let query = supabase
          .from(tableToFetch)
          // A foto vem junto SÓ para broncas — `comments` não tem essa relação,
          // e pedi-la ali derrubaria a consulta inteira.
          //
          // Sem ela o moderador decidia no escuro: o cartão trazia título,
          // autor e protocolo, e a única coisa que diz se a bronca é real —
          // a foto — exigia abrir o modal de revisão, um por um. A fila de
          // moderação existe para ser percorrida rápido.
          .select(
            isReportModeration
              ? '*, author:profiles!author_id(name), report_media(url, type)'
              : '*, author:profiles!author_id(name), report:reports(id, title)'
          )
          .eq(statusField, 'pending_approval');

        // Sinal aberto TAMBÉM é 'pending_approval' — é o que o mantém fora do
        // feed e do mapa público. Mas não é matéria de moderação: não tem foto
        // nem descrição para julgar, é uma missão esperando alguém ir ao local.
        // Sem este filtro, a fila do moderador encheria de linhas que ele não
        // teria como aprovar nem rejeitar.
        if (isReportModeration) {
          query = query.or('signal_status.is.null,signal_status.in.(done,empty)');
        }

        const { data, error } = await query.order('created_at', { ascending: true });
        if (error) throw error;
        setItems(data || []);
      }
    } catch (error) {
      showAppError({ title: `Erro ao buscar itens`, description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [isReportModeration, isResolutionModeration, isPetitionModeration, isWorkMediaModeration, isUpdateModeration, isCommentModeration]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  const handleDeleteUpdate = async (item) => {
    setActionLoadingId(`${item.id}-deleted`);
    try {
      const { error } = await supabase.rpc('delete_report_update', { p_update_id: item.id });
      if (error) throw error;
      fetchItems();
    } catch (err) {
      showAppError({ title: 'Erro ao excluir', description: err.message, variant: 'destructive' });
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleAction = async (item, newStatus) => {
    if (newStatus === 'deleted' && isUpdateModeration) {
      if (window.confirm('Excluir esta atualização definitivamente? Esta ação não pode ser desfeita.')) {
        await handleDeleteUpdate(item);
      }
      return;
    }
    if (newStatus === 'rejected') {
      setItemToReject(item);
      setRejectionReason('');
      setRejectionCode('');
      setRejectionTitle('');
      setRejectionDescription('');
      setIsRejectModalOpen(true);
    } else if (newStatus === 'approved') {
      setItemToApprove(item);
      setApproveCityId(item?.city_id ? String(item.city_id) : '');
      setApproveCitySearch('');
      setIsApproveModalOpen(true);
    }
  };

  const processAction = async (item, newStatus) => {
    setActionLoadingId(`${item.id}-${newStatus}`);
    try {
      if (isUpdateModeration) {
        if (newStatus === 'approved') {
          const { error } = await supabase
            .from('report_updates')
            .update({ status: 'pending' })
            .eq('id', item.id);
          if (error) throw error;
        } else {
          // A notificação NÃO é escrita aqui desde a 207: quem avisa é o gatilho
          // `on_report_update_rejeitada`, e com o motivo dentro. Enquanto morava
          // nesta tela, qualquer outro lugar que rejeitasse uma atualização
          // deixava a pessoa sem aviso — e nada acusava.
          const { error } = await supabase
            .from('report_updates')
            .update({
              status: 'rejected',
              rejection_reason: rejectionCode || 'outro',
              rejection_note: rejectionReason.trim() || null,
              rejected_at: new Date().toISOString(),
              rejected_by: user?.id || null,
            })
            .eq('id', item.id);
          if (error) throw error;
        }
        fetchItems();
        return;
      }

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

      if (isResolutionModeration) {
        let updateData = newStatus === 'approved' 
          ? { status: 'resolved', resolved_at: new Date().toISOString() }
          : { status: 'pending', resolution_submission: null };

        const { error } = await supabase.from('reports').update(updateData).eq('id', item.id);
        if (error) throw error;
      } else if (isPetitionModeration) {
        let updateData = newStatus === 'approved' 
          ? { status: 'open' }
          : { status: 'rejected', rejection_reason: rejectionReason };

        const { error } = await supabase.from('petitions').update(updateData).eq('id', item.id);
        if (error) throw error;

        // Criar notificação para o autor
        const notificationData = {
          user_id: item.author_id,
          type: 'moderation_update',
          message: newStatus === 'approved' 
            ? `Seu abaixo-assinado "${item.title}" foi aprovado e já está disponível para assinaturas.`
            : `Infelizmente seu abaixo-assinado "${item.title}" não foi aprovado. Motivo: ${rejectionReason}`,
          link: `/abaixo-assinado/${item.id}`,
          is_read: false
        };

        await supabase.from('notifications').insert(notificationData);

        // Enviar e-mail de notificação
        try {
          await supabase.functions.invoke('send-petition-status-email', {
            body: {
              petitionId: item.id,
              authorId: item.author_id,
              status: newStatus,
              rejectionReason: newStatus === 'rejected' ? rejectionReason : null,
              petitionTitle: item.title,
              petitionUrl: `${window.location.origin}/abaixo-assinado/${item.id}`
            }
          });
        } catch (emailError) {
          console.error('Erro ao enviar e-mail de notificação:', emailError);
          // Não falhar o processo se o e-mail falhar, mas avisar no log
        }
      } else if (isWorkMediaModeration) {
        if (newStatus === 'approved') {
          const { error } = await supabase.from('public_work_media')
            .update({ status: 'approved', reviewed_by: user.id, reviewed_at: new Date().toISOString(), review_comment: null })
            .eq('id', item.id);
          if (error) throw error;
        } else {
          const notificationData = {
            user_id: item.contributor_id,
            type: 'work_media_rejected',
            message: `A mídia enviada para a obra "${item.work?.title || 'desconhecida'}" não foi aprovada. Motivo: ${rejectionReason}`,
            work_id: item.work_id,
            is_read: false
          };

          if (item.contributor_id) {
            await supabase.from('notifications').insert(notificationData);
          }

          const { error: dbError } = await supabase.from('public_work_media').delete().eq('id', item.id);
          if (dbError) throw dbError;
          try {
            const url = new URL(item.url);
            const parts = url.pathname.split('/work-media/');
            const storagePath = parts[1];
            if (storagePath) {
              await supabase.storage.from('work-media').remove([decodeURIComponent(storagePath)]);
            }
          } catch (_) {}
        }
      } else if (isCommentModeration) {
        // RPC, e não um update direto, porque restaurar o comentário e zerar as
        // denúncias precisam acontecer juntos: um comentário restaurado com o
        // placar cheio voltaria a cair na denúncia seguinte.
        const { error } = await supabase.rpc('moderar_comentario', {
          p_comment_id: item.id,
          p_status: newStatus,
        });
        if (error) throw error;

        // O modal promete ao moderador que "o autor receberá esta
        // justificativa" — sem isto o motivo digitado morre na tela.
        if (newStatus === 'rejected' && item.author_id) {
          await supabase.from('notifications').insert({
            user_id: item.author_id,
            type: 'moderation_update',
            title: 'Comentário removido',
            message: `Seu comentário em "${item.report?.title || 'uma bronca'}" foi removido após denúncias. Motivo: ${rejectionReason}`,
            link: item.report_id ? `/bronca/${item.report_id}` : null,
            report_id: item.report_id || null,
            is_read: false,
          });
        }
      } else {
        const tableToUpdate = isReportModeration ? 'reports' : 'comments';
        let updateData = { moderation_status: newStatus };
        if (isReportModeration && newStatus === 'approved') {
          updateData.status = 'pending';
          // Só grava quando a linha está sem cidade. O moderador não reescreve
          // uma cidade que o GPS já resolveu no local — ele preenche o que
          // faltou. Mesma regra do servidor na migração 176.
          if (!item.city_id) {
            const escolhida = Number(approveCityId);
            if (!Number.isFinite(escolhida) || escolhida <= 0) {
              throw new Error('Selecione a cidade desta bronca antes de aprovar.');
            }
            updateData.city_id = escolhida;
          }
        }
        if (isReportModeration && newStatus === 'rejected') {
          updateData.rejection_title = rejectionTitle.trim();
          updateData.rejection_description = rejectionDescription.trim();
          updateData.rejected_at = new Date().toISOString();
        }

        let { error } = await supabase.from(tableToUpdate).update(updateData).eq('id', item.id);
        if (error && tableToUpdate === 'reports' && shouldRetryWithoutRejectionFields(error)) {
          ({ error } = await supabase.from(tableToUpdate).update(stripRejectionFields(updateData)).eq('id', item.id));
        }
        if (error) throw error;

        if (isReportModeration && newStatus === 'rejected' && item.author_id) {
          try {
            await supabase.functions.invoke('send-report-status-email', {
              body: {
                reportId: item.id,
                authorId: item.author_id,
                status: 'rejected',
                rejectionTitle: rejectionTitle.trim(),
                rejectionDescription: rejectionDescription.trim(),
                reportTitle: item.title,
                reportUrl: `${window.location.origin}/painel-usuario?tab=reports&report=${item.id}`
              }
            });
          } catch (emailError) {
            console.error('Erro ao enviar e-mail de notificação:', emailError);
          }
        }
      }

      fetchItems();
    } catch (error) {
      showAppError({ title: "Erro ao processar", description: error.message, variant: "destructive" });
    } finally {
      setActionLoadingId(null);
    }
  };

  const confirmRejection = async () => {
    if (!itemToReject) return;
    await processAction(itemToReject, 'rejected');
    setIsRejectModalOpen(false);
    setItemToReject(null);
    setRejectionReason('');
    setRejectionTitle('');
    setRejectionDescription('');
  };

  const confirmApproval = async () => {
    if (!itemToApprove) return;
    await processAction(itemToApprove, 'approved');
    setIsApproveModalOpen(false);
    setItemToApprove(null);
    setApproveCityId('');
    setApproveCitySearch('');
  };

  // Filter and Pagination Logic
  const filteredItems = useMemo(() => {
    return items.filter(item => {
      const searchLower = searchTerm.toLowerCase();
      // Num comentário procura-se pelas duas pontas: o que foi dito e em que
      // bronca. Por isso os dois entram, e não o primeiro que existir.
      const title = [
        item.title,
        item.text,
        item.work?.title,
        item.report?.title,
        UPDATE_TYPE_LABELS[item.update_type],
      ].filter(Boolean).join(' ');
      const authorName = item.author?.name || item.resolution_submission?.userName || item.contributor?.name || '';
      return title.toLowerCase().includes(searchLower) || authorName.toLowerCase().includes(searchLower);
    });
  }, [items, searchTerm]);

  // A bronca em aprovação precisa que o moderador informe a cidade?
  const precisaCidade = Boolean(
    isReportModeration && itemToApprove && !itemToApprove.city_id
  );

  // Lista do seletor. Sem busca, mostra só as 50 primeiras: são ~5.570 cidades
  // e renderizar todas trava o modal em aparelho fraco.
  const cidadesFiltradas = useMemo(() => {
    const termo = normalizar(approveCitySearch.trim());
    if (!termo) return cities.slice(0, 50);
    return cities
      .filter(
        (c) =>
          normalizar(c.name).includes(termo) ||
          (c.state?.uf || '').toLowerCase() === termo
      )
      .slice(0, 80);
  }, [cities, approveCitySearch]);

  const totalPages = Math.ceil(filteredItems.length / itemsPerPage);

  // Celular rola, desktop pagina.
  //
  // A fila de moderação se percorre de cima a baixo: o moderador julga um item,
  // ele some da lista, e o seguinte sobe. Interromper isso a cada 8 itens com
  // um par de botões no rodapé — que no celular ficam empilhados, um em cima do
  // outro — troca um gesto contínuo por uma mira. Rolando, a página só cresce.
  //
  // No desktop os botões ficam: com mouse eles são confortáveis, e dizem de
  // relance quantos itens ainda faltam.
  const isMobile = useIsMobile();
  const currentItems = isMobile
    ? filteredItems.slice(0, currentPage * itemsPerPage)
    : filteredItems.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);
  const temMais = isMobile && currentItems.length < filteredItems.length;

  const handlePageChange = (newPage) => {
    if (newPage >= 1 && newPage <= totalPages) setCurrentPage(newPage);
  };

  const carregarMais = useCallback(() => {
    setCurrentPage((p) => p + 1);
  }, []);

  const sentinelaRef = useInfiniteScroll(carregarMais, { enabled: temMais });

  const handleViewReport = async (reportId) => {
    const { data, error } = await supabase
      .from('reports')
      // `comments(*)` traz a linha da tabela e mais nada — `author` fica
      // indefinido e o modal carimba "Anônimo" em TODO comentário, inclusive
      // no que o moderador está julgando. O perfil vem embutido, como em todos
      // os outros lugares que montam este mesmo componente.
      .select('*, author:profiles!reports_author_id_fkey(name, avatar_url), comments(*, author:profiles!comments_author_id_fkey(name, avatar_url)), report_media(*), timeline:report_timeline(*), upvotes:upvotes(count)')
      .eq('id', reportId)
      .single();

    if (error) {
      showAppError({ title: "Erro ao buscar detalhes", description: error.message, variant: "destructive" });
    } else {
      const formattedData = {
        ...data,
        location: data.location ? { lat: data.location.coordinates[1], lng: data.location.coordinates[0] } : null,
        photos: (data.report_media || []).filter(m => m.type === 'photo'),
        videos: (data.report_media || []).filter(m => m.type === 'video'),
        upvotes: data.upvotes[0]?.count || 0,
      };
      setSelectedReport(formattedData);
    }
  };

  return (
    <>
      <Helmet>
        <title>{pageTitle} - Admin</title>
      </Helmet>
      
      <div className="container mx-auto px-4 py-6 md:py-8 max-w-6xl">
        {/* Header Section */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8 md:mb-10">
          <div className="space-y-1">
            <div className="flex items-center gap-2 md:gap-3">
              <Link to="/admin">
                <Button variant="ghost" size="icon" className="rounded-full shrink-0">
                  <ArrowLeft className="w-5 h-5" />
                </Button>
              </Link>
              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground">{pageTitle}</h1>
              {/* Quantos faltam. Numa fila, é o número que decide se dá para
                  fechar hoje — e ele não aparecia em lugar nenhum. */}
              {!loading && filteredItems.length > 0 && (
                <span className="shrink-0 inline-flex items-center justify-center min-w-7 h-7 px-2 rounded-full bg-brand text-content-onBrand text-sm font-extrabold tabular-nums">
                  {filteredItems.length}
                </span>
              )}
            </div>
            <p className="text-muted-foreground ml-10 md:ml-12 text-sm md:text-base">
              {isUpdateModeration ? 'Revise atualizações enviadas antes de ficarem visíveis ao público' : isWorkMediaModeration ? 'Aprove ou rejeite fotos e vídeos enviados pelos cidadãos' : isResolutionModeration ? 'Valide as resoluções enviadas' : isCommentModeration ? 'Comentários com denúncia aberta. Na terceira, saem do ar sozinhos' : 'Garanta a qualidade do conteúdo da plataforma'}
            </p>
          </div>
          
          <div className="relative w-full md:w-80">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Pesquisar..."
              value={searchTerm}
              onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
              className="pl-10 h-11 bg-muted/50 border-none shadow-sm w-full"
            />
          </div>
        </div>

        {/* Content List */}
        <div className="grid gap-4">
          {loading ? (
            <div className="py-20 flex flex-col items-center gap-4">
              <div className="w-8 h-8 border-4 border-tc-red border-t-transparent rounded-full animate-spin"></div>
              <p className="text-muted-foreground animate-pulse">Carregando itens para moderação...</p>
            </div>
          ) : filteredItems.length === 0 ? (
            <Card className="border-dashed border-2 border-edge-default py-20 flex flex-col items-center justify-center text-center bg-surface-subtle">
              <div className="bg-success-bg p-4 rounded-full mb-4 text-success-fg">
                <CheckCircle2 className="w-10 h-10" />
              </div>
              <h3 className="text-xl font-bold mb-1">Tudo limpo por aqui!</h3>
              <p className="text-muted-foreground max-w-sm">Não há nenhum item pendente de moderação nesta categoria.</p>
            </Card>
          ) : (
            <AnimatePresence mode="popLayout">
              {currentItems.map((item) => {
                // As tres derivadas do cartao, calculadas uma vez.
                //
                // Antes cada uma vivia como ternario de cinco galhos dentro do
                // JSX, repetido em tres lugares. O selo errado da bronca
                // ("Comentario") era exatamente o galho de fallback de um
                // deles — o tipo de erro que so aparece na tela, porque no
                // codigo a linha e longa demais para alguem ler ate o fim.
                const miniatura = isUpdateModeration
                  ? primeiraFoto(item.report?.report_media)
                  : isReportModeration
                    ? primeiraFoto(item.report_media)
                    : isWorkMediaModeration
                      ? (item.type === 'photo' ? item.url : null)
                      : null;

                const endereco = isUpdateModeration
                  ? item.report?.address
                  : isReportModeration
                    ? item.address
                    : null;

                const chip = isUpdateModeration
                  ? (item.update_type
                      ? {
                          texto: UPDATE_TYPE_LABELS[item.update_type] || item.update_type,
                          classe: UPDATE_TYPE_COLORS[item.update_type] || 'bg-surface-subtle text-content-secondary border-edge-subtle',
                        }
                      : null)
                  : isReportModeration
                    ? {
                        texto: nomeDaCategoria(item.category_id),
                        classe: 'bg-brand-subtleBg text-brand border-brand/20',
                      }
                    : isCommentModeration
                      // Denunciado ainda no ar e denunciado já fora do ar
                      // pedem decisões diferentes, e a fila agora mistura os
                      // dois. Sem este selo, são cartões idênticos.
                      ? (item.moderation_status === 'approved'
                          ? {
                              texto: 'No ar',
                              classe: 'bg-status-pendingBg text-status-pendingFg border-status-pendingBorder',
                            }
                          : {
                              texto: 'Fora do ar',
                              classe: 'bg-danger-subtleBg text-danger-subtleFg border-danger/25',
                            })
                      : null;

                return (
                <motion.div
                  layout
                  initial={{ opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.98 }}
                  key={item.id}
                >
                  <Card className="overflow-hidden border-muted-foreground/10 transition-all shadow-sm hover:shadow-md hover:border-brand/20">
                    <CardContent className="p-0">
                      <div className="flex flex-row items-stretch min-h-[110px] md:min-h-[130px]">
                        {/* Faixa do tipo. Cor semântica, não da paleta: esta
                            página inteira usava orange-500/blue-500 crus e some
                            no tema escuro. */}
                        <div className={`w-1.5 shrink-0 ${isUpdateModeration ? 'bg-status-progressFg' : isWorkMediaModeration ? 'bg-status-duplicateFg' : isPetitionModeration ? 'bg-brand' : isResolutionModeration ? 'bg-success-fg' : 'bg-status-pendingFg'}`} />

                        <div className="flex-1 min-w-0 p-3 md:p-4">
                          <div className="flex gap-3">
                            {/* A miniatura, quando existe.

                                Numa bronca é a foto do problema; numa
                                atualização, a foto do cadastro original — a
                                referência contra a qual se julga "o problema
                                ainda está aqui". */}
                            {miniatura && (
                              <button
                                type="button"
                                onClick={() => setLightboxImage(miniatura)}
                                className="shrink-0 relative group/thumb rounded-xl overflow-hidden"
                                title="Ampliar"
                              >
                                <img
                                  src={miniatura}
                                  alt=""
                                  loading="lazy"
                                  className="w-16 h-16 md:w-[72px] md:h-[72px] object-cover bg-surface-sunken"
                                />
                                <span className="absolute inset-0 bg-black/45 opacity-0 group-hover/thumb:opacity-100 transition-opacity flex items-center justify-center">
                                  <ZoomIn className="w-4 h-4 text-white" />
                                </span>
                              </button>
                            )}

                            <div className="min-w-0 flex-1">
                              {/* Primeira linha: só o que VARIA entre itens.

                                  Aqui havia um selo dizendo o tipo — "Bronca",
                                  "Atualização", "Comentário". Ele repetia o
                                  título da página em cada cartão, e no caso das
                                  broncas repetia errado: como era o galho de
                                  fallback dos ternários, toda bronca aparecia
                                  rotulada "Comentário".

                                  O que ficou é o que muda de item para item: a
                                  categoria da bronca, o tipo da atualização. */}
                              <div className="flex items-center gap-2 flex-wrap">
                                {chip && (
                                  <span className={`text-[10px] md:text-[11px] font-bold px-2 py-0.5 rounded-full border ${chip.classe}`}>
                                    {chip.texto}
                                  </span>
                                )}
                                <span
                                  className="text-[11px] text-content-tertiary inline-flex items-center gap-1"
                                  title={new Date(item.created_at).toLocaleString('pt-BR')}
                                >
                                  <Clock className="w-3 h-3" />
                                  {esperaHa(item.created_at)}
                                </span>
                              </div>

                              <h3 className="font-bold text-sm md:text-base leading-snug line-clamp-2 mt-1 text-content-primary">
                                {isUpdateModeration
                                  ? (item.report?.title || 'Bronca sem título')
                                  : isWorkMediaModeration
                                    ? (item.work?.title || 'Obra desconhecida')
                                    : isCommentModeration
                                      ? (item.report?.title || 'Bronca sem título')
                                      : (item.title || 'Sem título')}
                              </h3>

                              {endereco && (
                                <p className="mt-1 flex items-start gap-1.5 text-xs text-content-secondary leading-snug">
                                  <MapPin className="w-3.5 h-3.5 shrink-0 mt-px text-content-tertiary" />
                                  <span className="min-w-0 line-clamp-1">{endereco}</span>
                                </p>
                              )}

                              {/* Mensagem e fotos da atualização, inteiras.

                                  Antes o cartão trazia duas prévias — a mensagem
                                  cortada em duas linhas e três miniaturas de
                                  36 px — e o resto só abrindo um accordion. Mas
                                  a mensagem e essas fotos SÃO a atualização: é
                                  sobre elas que o moderador decide, e elas não
                                  estão na página da bronca (vivem em
                                  `report_update_media`). Esconder atrás de um
                                  clique o único conteúdo a ser julgado obrigava
                                  a abrir todos os itens da fila, um a um.

                                  A prévia foi para o lixo junto com o accordion:
                                  o cartão mostra o que há, e pronto. */}
                              {isUpdateModeration && item.message && (
                                <p className="text-xs md:text-sm text-content-secondary mt-2 italic whitespace-pre-wrap leading-relaxed">
                                  &ldquo;{item.message}&rdquo;
                                </p>
                              )}

                              {/* O comentário inteiro, sem corte.
                                  Ele era o título do cartão, limitado a duas
                                  linhas — o moderador aprovava ou rejeitava
                                  lendo metade do que estava julgando. Como na
                                  atualização, o texto é a matéria da decisão:
                                  fica no corpo, inteiro. */}
                              {isCommentModeration && item.text && (
                                <p className="text-xs md:text-sm text-content-secondary mt-2 italic whitespace-pre-wrap break-words leading-relaxed">
                                  &ldquo;{item.text}&rdquo;
                                </p>
                              )}

                              {/* Por que este comentário está aqui.
                                  Sem os motivos, o moderador lê uma frase que
                                  pode ser inofensiva e não tem como saber o que
                                  três pessoas viram nela — e a denúncia
                                  coordenada contra desafeto fica indistinguível
                                  da denúncia legítima. */}
                              {isCommentModeration && (() => {
                                const abertas = (item.denuncias || []).filter((d) => !d.resolved_at);
                                if (abertas.length === 0) return null;
                                const motivos = abertas.map((d) => (d.reason || '').trim()).filter(Boolean);
                                return (
                                  <div className="mt-2 rounded-xl border border-danger/25 bg-danger-subtleBg px-3 py-2">
                                    <p className="flex items-center gap-1.5 text-[11px] font-bold text-danger-subtleFg">
                                      <Flag className="w-3.5 h-3.5" />
                                      {abertas.length} {abertas.length === 1 ? 'denúncia' : 'denúncias'}
                                    </p>
                                    {motivos.length > 0 && (
                                      <ul className="mt-1 space-y-0.5">
                                        {motivos.map((motivo, i) => (
                                          <li key={i} className="text-[11px] text-content-secondary break-words">
                                            — {motivo}
                                          </li>
                                        ))}
                                      </ul>
                                    )}
                                  </div>
                                );
                              })()}

                              {isUpdateModeration && item.media && item.media.length > 0 && (
                                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2 mt-3">
                                  {item.media.map((m) => (
                                    <button
                                      key={m.id}
                                      type="button"
                                      onClick={() => setLightboxImage(m.url)}
                                      title="Ampliar"
                                      className="relative aspect-square rounded-xl overflow-hidden border border-edge-subtle bg-surface-sunken group/foto focus:outline-none focus:ring-2 focus:ring-brand"
                                    >
                                      <img
                                        src={m.url}
                                        alt=""
                                        loading="lazy"
                                        className="w-full h-full object-cover transition-transform duration-200 group-hover/foto:scale-105"
                                      />
                                      <span className="absolute inset-0 bg-black/0 group-hover/foto:bg-black/30 transition-colors flex items-center justify-center">
                                        <ZoomIn className="w-5 h-5 text-white opacity-0 group-hover/foto:opacity-100 transition-opacity" />
                                      </span>
                                    </button>
                                  ))}
                                </div>
                              )}

                              <div className="flex items-center gap-x-3 gap-y-1 flex-wrap mt-2 text-[11px] md:text-xs text-content-tertiary">
                                <span className="flex items-center gap-1.5 min-w-0">
                                  <User className="w-3.5 h-3.5 shrink-0" />
                                  <span className="font-medium text-content-secondary truncate max-w-[140px]">
                                    {isWorkMediaModeration ? (item.contributor?.name || 'Cidadão') : (item.author?.name || item.resolution_submission?.userName || 'Anônimo')}
                                  </span>
                                </span>
                                {item.protocol && (
                                  <span className="flex items-center gap-1.5">
                                    <Info className="w-3.5 h-3.5" />
                                    <span className="font-mono text-[10px] md:text-[11px]">{item.protocol}</span>
                                  </span>
                                )}
                                {/* Avisa antes de abrir: aprovar sem cidade pede um passo a mais. */}
                                {isReportModeration && !item.city_id && (
                                  <span className="flex items-center gap-1.5 font-bold text-status-pendingFg">
                                    <MapPin className="w-3.5 h-3.5" />
                                    Sem cidade
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* Barra de ações, largura inteira do cartão.

                              Antes era uma coluna apertada à direita, com
                              aprovar e rejeitar como dois ícones de 32 px
                              encostados um no outro — no celular, dois alvos
                              vizinhos de consequência oposta.

                              Agora "Revisar" fica na esquerda e as decisões na
                              direita, com rótulo onde cabe. Excluir, que é
                              irreversível, fica separado por uma linha. */}
                          <div className="flex items-center gap-2 mt-3 pt-3 border-t border-edge-subtle">
                            {/* Numa atualização não há o que "revisar" aqui: o
                                cartão já mostra tudo o que a atualização tem. O
                                que ainda falta é o histórico da bronca, e esse
                                fica na página dela — então o lugar do botão é
                                de quem leva até lá. */}
                            {isUpdateModeration ? (
                              <a
                                href={`/bronca/${item.report_id}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center h-9 px-3 rounded-md text-xs md:text-sm font-semibold text-content-secondary hover:bg-surface-subtle hover:text-brand transition-colors"
                              >
                                <ExternalLink className="w-4 h-4 mr-1.5" />
                                Abrir bronca
                              </a>
                            ) : (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-9 px-3 text-xs md:text-sm font-semibold text-content-secondary"
                                onClick={() => {
                                  if (isPetitionModeration) {
                                    navigate(`/abaixo-assinado/${item.id}`);
                                  } else if (isWorkMediaModeration) {
                                    setSelectedWorkMedia(item);
                                  } else if (isCommentModeration) {
                                    // `item.id` aqui é o id do COMENTÁRIO — abrir
                                    // a revisão com ele buscava uma bronca que não
                                    // existe e o botão só devolvia erro.
                                    handleViewReport(item.report_id);
                                  } else {
                                    handleViewReport(item.id);
                                  }
                                }}
                              >
                                <Eye className="w-4 h-4 mr-1.5" />
                                Revisar
                              </Button>
                            )}

                            <div className="flex-1" />

                            <Button
                              size="sm"
                              className="h-9 px-3 md:px-4 bg-success-bg text-success-fg border border-success-border hover:bg-success-fg hover:text-white text-xs md:text-sm font-bold disabled:opacity-50"
                              onClick={() => handleAction(item, 'approved')}
                              title={
                                isCommentModeration
                                  // Mesma ação, dois significados, conforme as
                                  // denúncias já tenham derrubado o comentário
                                  // ou não. Em ambos, zera o placar.
                                  ? (item.moderation_status === 'approved'
                                      ? 'Manter no ar (descarta as denúncias)'
                                      : 'Restaurar (descarta as denúncias)')
                                  : 'Aprovar'
                              }
                              disabled={!!actionLoadingId}
                            >
                              {actionLoadingId === `${item.id}-approved` ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <Check className="w-4 h-4 md:mr-1.5" />
                              )}
                              <span className="hidden md:inline">
                                {isCommentModeration
                                  ? (item.moderation_status === 'approved' ? 'Manter' : 'Restaurar')
                                  : 'Aprovar'}
                              </span>
                            </Button>

                            <Button
                              size="sm"
                              className="h-9 px-3 md:px-4 bg-danger-subtleBg text-danger-subtleFg border border-danger/30 hover:bg-danger hover:text-white text-xs md:text-sm font-bold disabled:opacity-50"
                              onClick={() => handleAction(item, 'rejected')}
                              title={isCommentModeration ? 'Remover de vez' : 'Rejeitar (mantém registro)'}
                              disabled={!!actionLoadingId}
                            >
                              {actionLoadingId === `${item.id}-rejected` ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <X className="w-4 h-4 md:mr-1.5" />
                              )}
                              <span className="hidden md:inline">{isCommentModeration ? 'Remover' : 'Rejeitar'}</span>
                            </Button>

                            {isUpdateModeration && (
                              <>
                                <div className="w-px h-6 bg-edge-default mx-0.5" />
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-9 w-9 text-content-tertiary hover:text-white hover:bg-danger rounded-lg disabled:opacity-50"
                                  onClick={() => handleAction(item, 'deleted')}
                                  title="Excluir definitivamente"
                                  disabled={!!actionLoadingId}
                                >
                                  {actionLoadingId === `${item.id}-deleted` ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                  ) : (
                                    <Trash2 className="w-4 h-4" />
                                  )}
                                </Button>
                              </>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Aqui havia um painel expandível (accordion) com a
                          mensagem inteira e a galeria de fotos da atualização.

                          Eram exatamente as duas coisas sobre as quais o
                          moderador decide — escondidas atrás de um clique, uma
                          fila inteira de itens para abrir e fechar antes de
                          conseguir julgar qualquer um. Agora ficam no próprio
                          cartão, e o link para a bronca assumiu o lugar do
                          botão que abria isto aqui. */}
                    </CardContent>
                  </Card>
                </motion.div>
                );
              })}
            </AnimatePresence>
          )}
        </div>

        {/* Celular: a lista cresce sozinha ao chegar no fim. */}
        {isMobile && temMais && (
          <div ref={sentinelaRef} className="flex justify-center mt-8">
            {/* Rede de segurança para quando o IntersectionObserver não
                dispara (WebView antiga) — este app roda dentro de uma. */}
            <Button variant="outline" className="rounded-xl h-10" onClick={carregarMais}>
              Carregar mais
            </Button>
          </div>
        )}

        {/* Desktop: paginação por botões. */}
        {!isMobile && filteredItems.length > itemsPerPage && (
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 sm:gap-6 mt-10">
            <Button
              variant="outline"
              className="rounded-xl h-10 gap-2 w-full sm:w-auto"
              onClick={() => handlePageChange(currentPage - 1)}
              disabled={currentPage === 1}
            >
              <ChevronLeft className="h-4 w-4" /> Anterior
            </Button>
            <div className="text-sm font-medium bg-muted px-4 py-2 rounded-lg w-full sm:w-auto text-center">
              Página <span className="text-tc-red">{currentPage}</span> de {totalPages}
            </div>
            <Button
              variant="outline"
              className="rounded-xl h-10 gap-2 w-full sm:w-auto"
              onClick={() => handlePageChange(currentPage + 1)}
              disabled={currentPage === totalPages}
            >
              Próxima <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>

      {/* Details View for Reports */}
      {selectedReport && (
        <ReportDetails
          report={selectedReport}
          onClose={() => setSelectedReport(null)}
          onUpdate={async (data) => {
            const { error } = await supabase.from('reports').update(data).eq('id', data.id);
            if (error) showAppError({ title: "Erro ao atualizar", variant: "destructive" });
            // Sem toast: `fetchItems` recarrega a fila e o modal fecha.
            else { fetchItems(); setSelectedReport(null); }
          }}
          onUpvote={() => {}}
          onLink={() => {}}
          onFavoriteToggle={() => {}}
          isModerationView={true}
        />
      )}

      {/* Details View for Work Media */}
      <Dialog open={isWorkMediaModeration && !!selectedWorkMedia} onOpenChange={(open) => { if (!open) setSelectedWorkMedia(null); }}>
        <DialogContent className="max-w-lg rounded-2xl">
          {selectedWorkMedia && (
            <>
              <DialogHeader>
                <DialogTitle className="text-xl font-bold flex items-center gap-2">
                  <ImageIcon className="w-5 h-5" />
                  Mídia enviada
                </DialogTitle>
                <DialogDescription className="pt-2 space-y-1">
                  <p className="font-medium text-foreground">
                    {selectedWorkMedia.work?.title || 'Obra desconhecida'}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Por {selectedWorkMedia.contributor?.name || 'Cidadão'} em {new Date(selectedWorkMedia.created_at).toLocaleString('pt-BR')}
                  </p>
                </DialogDescription>
              </DialogHeader>
              <div className="mt-4 space-y-4">
                {selectedWorkMedia.type === 'image' && (
                  <div className="rounded-xl overflow-hidden border bg-muted/20 flex items-center justify-center">
                    <img
                      src={selectedWorkMedia.url}
                      alt={selectedWorkMedia.name}
                      className="max-h-[360px] w-full object-contain bg-black/5"
                    />
                  </div>
                )}
                {selectedWorkMedia.type === 'video' && (
                  <div className="rounded-xl overflow-hidden border bg-black">
                    <video
                      src={selectedWorkMedia.url}
                      controls
                      className="w-full max-h-[360px]"
                    />
                  </div>
                )}
                {selectedWorkMedia.type === 'video_url' && (
                  <div className="rounded-xl border bg-muted/30 p-4 space-y-2">
                    <p className="text-sm text-muted-foreground">
                      Vídeo externo enviado pelo cidadão.
                    </p>
                    <a
                      href={selectedWorkMedia.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-primary underline break-all"
                    >
                      {selectedWorkMedia.url}
                    </a>
                  </div>
                )}
                {selectedWorkMedia.type === 'pdf' && (
                  <div className="rounded-xl border bg-muted/30 p-4 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <FileText className="w-6 h-6 text-primary" />
                      <div>
                        <p className="text-sm font-medium break-words">{selectedWorkMedia.name}</p>
                        <p className="text-xs text-muted-foreground">Documento PDF enviado para esta obra.</p>
                      </div>
                    </div>
                    <Button asChild size="sm" variant="outline">
                      <a href={selectedWorkMedia.url} target="_blank" rel="noopener noreferrer">
                        Abrir
                      </a>
                    </Button>
                  </div>
                )}
                {selectedWorkMedia.gallery_name && (
                  <div className="rounded-xl border bg-muted/20 p-3">
                    <p className="text-xs font-semibold text-muted-foreground mb-1">Galeria</p>
                    <p className="text-sm font-medium">
                      {selectedWorkMedia.gallery_name}
                    </p>
                  </div>
                )}
                {selectedWorkMedia.description && (
                  <div className="rounded-xl border bg-muted/20 p-3">
                    <p className="text-xs font-semibold text-muted-foreground mb-1">Descrição do cidadão</p>
                    <p className="text-sm whitespace-pre-wrap break-words">
                      {selectedWorkMedia.description}
                    </p>
                  </div>
                )}
              </div>
              <DialogFooter className="mt-6">
                <Button variant="outline" className="rounded-xl w-full" onClick={() => setSelectedWorkMedia(null)}>
                  Fechar
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Approve/Reject Dialogs (Simplified for better UX) */}
      <Dialog open={isApproveModalOpen} onOpenChange={(open) => { if (!actionLoadingId) setIsApproveModalOpen(open); }}>
        <DialogContent className="max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold flex items-center gap-2">
              <CheckCircle2 className="w-6 h-6 text-green-500" /> Confirmar Aprovação
            </DialogTitle>
            <DialogDescription className="text-base pt-2">
              Ao aprovar, este conteúdo ficará visível para todos os usuários da plataforma. Deseja continuar?
            </DialogDescription>
          </DialogHeader>

          {precisaCidade && (
            <div className="mt-4 space-y-3">
              <div className="flex items-start gap-2 rounded-xl border-2 border-status-pendingBorder bg-status-pendingBg p-3">
                <AlertCircle className="w-5 h-5 shrink-0 text-status-pendingFg mt-0.5" />
                <p className="text-sm text-status-pendingFg">
                  Esta bronca chegou <strong>sem cidade</strong>. Informe qual é antes de
                  aprovar — sem ela a bronca fica fora dos placares, do agrupamento do mapa
                  e do painel do embaixador da cidade.
                </p>
              </div>

              <div className="space-y-2">
                <Label className="flex items-center gap-1.5">
                  <MapPin className="w-4 h-4" /> Cidade da bronca
                </Label>
                <Input
                  value={approveCitySearch}
                  onChange={(e) => setApproveCitySearch(e.target.value)}
                  placeholder="Buscar cidade ou UF..."
                  className="rounded-xl border-2 bg-muted/30"
                  disabled={!!actionLoadingId || loadingCities}
                />
                <div className="max-h-56 overflow-y-auto rounded-xl border-2 border-muted divide-y divide-muted">
                  {loadingCities ? (
                    <div className="flex items-center gap-2 p-3 text-sm text-muted-foreground">
                      <Loader2 className="w-4 h-4 animate-spin" /> Carregando cidades...
                    </div>
                  ) : cidadesFiltradas.length === 0 ? (
                    <p className="p-3 text-sm text-muted-foreground">
                      Nenhuma cidade encontrada para "{approveCitySearch}".
                    </p>
                  ) : (
                    cidadesFiltradas.map((c) => {
                      const ativa = String(approveCityId) === String(c.id);
                      return (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => setApproveCityId(String(c.id))}
                          disabled={!!actionLoadingId}
                          className={`flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left text-sm transition-colors ${
                            ativa ? 'bg-green-50 font-semibold text-green-800' : 'hover:bg-muted/50'
                          }`}
                        >
                          <span className="truncate">
                            {c.name}
                            {c.state?.uf ? ` · ${c.state.uf}` : ''}
                          </span>
                          {ativa && <Check className="w-4 h-4 shrink-0 text-success-fg" />}
                        </button>
                      );
                    })
                  )}
                </div>
                {!approveCitySearch.trim() && !loadingCities && (
                  <p className="text-xs text-muted-foreground">
                    Mostrando as 50 primeiras — use a busca para encontrar a cidade.
                  </p>
                )}
              </div>
            </div>
          )}

          <DialogFooter className="mt-6 gap-3">
            <Button variant="ghost" onClick={() => setIsApproveModalOpen(false)} className="rounded-xl h-12 flex-1" disabled={!!actionLoadingId}>Cancelar</Button>
            <Button
              onClick={confirmApproval}
              className="bg-success-fg hover:brightness-110 text-white rounded-xl h-12 flex-1 shadow-lg"
              disabled={!!actionLoadingId || (precisaCidade && !approveCityId)}
            >
              {actionLoadingId ? (
                <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Aprovando...</>
              ) : 'Aprovar Agora'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isRejectModalOpen} onOpenChange={(open) => { if (!actionLoadingId) setIsRejectModalOpen(open); }}>
        <DialogContent className="max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold flex items-center gap-2">
              <AlertCircle className="w-6 h-6 text-danger" /> {isReportModeration ? 'Mensagem de Recusa' : 'Motivo da Rejeição'}
            </DialogTitle>
            <DialogDescription className="text-base pt-2">
              {isReportModeration ? 'Envie uma mensagem clara ao autor explicando por que a bronca foi recusada.' : isCommentModeration ? 'Explique por que o comentário foi removido. O autor receberá esta justificativa.' : 'Explique por que este conteúdo não foi aprovado. O autor receberá esta justificativa.'}
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            {isReportModeration ? (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Título</Label>
                  <Input
                    value={rejectionTitle}
                    onChange={(e) => setRejectionTitle(e.target.value)}
                    placeholder="Ex: Falta de informações essenciais"
                    className="rounded-xl border-2 focus-visible:ring-danger bg-muted/30"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Descrição</Label>
                  <Textarea
                    value={rejectionDescription}
                    onChange={(e) => setRejectionDescription(e.target.value)}
                    placeholder="Explique o que precisa ser ajustado para reenviar a bronca."
                    className="min-h-[120px] rounded-xl border-2 focus-visible:ring-danger bg-muted/30"
                  />
                </div>
              </div>
            ) : isUpdateModeration ? (
              // Motivo estruturado + nota, e os dois são obrigatórios.
              //
              // O código existe para a rejeição virar dado de qualidade: sem
              // ele, ninguém consegue perguntar "quantas recusas são de foto
              // ilegível?" — e sem essa resposta ninguém conserta o formulário
              // que produz foto ilegível.
              //
              // A nota existe porque é ela que a pessoa vai ler. O catálogo
              // classifica; a nota ensina.
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Motivo</Label>
                  <div className="flex flex-wrap gap-2">
                    {MOTIVOS_DE_REJEICAO.map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => setRejectionCode(m.id)}
                        className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors ${
                          rejectionCode === m.id
                            ? 'bg-danger text-white border-danger'
                            : 'bg-muted/30 text-content-secondary border-edge-subtle'
                        }`}
                      >
                        {m.rotulo}
                      </button>
                    ))}
                  </div>
                  {rejectionCode && (
                    <p className="text-xs text-content-tertiary">
                      {MOTIVOS_DE_REJEICAO.find((m) => m.id === rejectionCode)?.explicacao}
                    </p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label>O que dizer a quem enviou</Label>
                  <Textarea
                    value={rejectionReason}
                    onChange={(e) => setRejectionReason(e.target.value)}
                    placeholder="Ex: A foto está escura demais para ver a calçada. Vale voltar de dia."
                    className="min-h-[100px] rounded-xl border-2 focus-visible:ring-danger bg-muted/30"
                  />
                </div>
              </div>
            ) : (
              <Textarea
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                placeholder="Ex: Conteúdo duplicado, informações incompletas..."
                className="min-h-[120px] rounded-xl border-2 focus-visible:ring-danger bg-muted/30"
              />
            )}
          </div>
          <DialogFooter className="gap-3">
            <Button variant="ghost" onClick={() => setIsRejectModalOpen(false)} className="rounded-xl h-12 flex-1" disabled={!!actionLoadingId}>Cancelar</Button>
            <Button
              variant="destructive"
              onClick={confirmRejection}
              // Atualização exige os dois: o código classifica, a nota ensina.
              // Deixar a nota opcional levaria de volta ao aviso genérico que a
              // 207 existe para acabar.
              disabled={
                !!actionLoadingId ||
                (isReportModeration
                  ? !rejectionTitle.trim() || !rejectionDescription.trim()
                  : isUpdateModeration
                  ? !rejectionCode || !rejectionReason.trim()
                  : !rejectionReason.trim())
              }
              className="rounded-xl h-12 flex-1 shadow-lg"
            >
              {actionLoadingId ? (
                <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Rejeitando...</>
              ) : 'Confirmar Rejeição'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Lightbox */}
      <AnimatePresence>
        {lightboxImage && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
            onClick={() => setLightboxImage(null)}
          >
            <motion.img
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ duration: 0.18 }}
              src={lightboxImage}
              alt=""
              className="max-h-[90vh] max-w-full rounded-xl shadow-2xl object-contain"
              onClick={(e) => e.stopPropagation()}
            />
            <button
              className="absolute top-4 right-4 text-white/80 hover:text-white bg-black/40 hover:bg-black/60 rounded-full p-2 transition-colors"
              onClick={() => setLightboxImage(null)}
            >
              <X className="w-5 h-5" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

export default ModerationPage;

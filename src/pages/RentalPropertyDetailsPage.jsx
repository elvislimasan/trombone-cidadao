import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Helmet } from 'react-helmet';
import { ArrowLeft, MapPin, Ruler, User, Building2, FileText, Calendar, CheckCircle2, XCircle, Image as ImageIcon, DollarSign, History, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { formatCurrency, formatDate, formatAddressWithNumber } from '@/lib/utils';
import MediaViewer from '@/components/MediaViewer';

const SectionBlock = ({ icon: Icon, title, children }) => (
  <div className="bg-[#f2f4f7] rounded-2xl px-4 py-4">
    <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.15em] text-[#92400e] mb-3">
      <span className="inline-block w-1 h-3.5 rounded bg-[#b45309]" />
      {Icon && <Icon className="w-3.5 h-3.5" strokeWidth={1.5} />}
      {title}
    </div>
    {children}
  </div>
);

const InfoRow = ({ icon: Icon, label, value }) => (
  <div className="flex items-center gap-3 bg-surface-raised px-3 py-2.5 rounded-xl shadow-[0_2px_8px_-2px_rgba(25,28,30,0.06)]">
    <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-surface-raised text-[#b45309] shrink-0">
      <Icon className="w-4 h-4" strokeWidth={1.5} />
    </div>
    <div className="min-w-0">
      <div className="text-[11px] font-semibold text-content-secondary leading-tight">{label}</div>
      <div className="text-xs text-content-primary break-words leading-tight">{value}</div>
    </div>
  </div>
);

const RentalPropertyDetailsPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user } = useAuth();
  const [property, setProperty] = useState(null);
  const [contracts, setContracts] = useState([]);
  const [media, setMedia] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [myActiveCityIds, setMyActiveCityIds] = useState([]);
  const [mediaViewerIndex, setMediaViewerIndex] = useState(null);

  // Admin/master editam qualquer imóvel. Embaixador puro só edita imóveis da
  // cidade do PRÓPRIO imóvel (não da cidade ativa selecionada no seletor).
  const isPureAmbassador = Boolean(user?.is_ambassador && !user?.is_admin && !user?.is_master);
  const canEditProperty = Boolean(
    user?.is_admin || user?.is_master ||
    (isPureAmbassador && property?.city_id && myActiveCityIds.some((cid) => String(cid) === String(property.city_id)))
  );

  useEffect(() => {
    if (!isPureAmbassador || !user?.id) { setMyActiveCityIds([]); return; }
    supabase
      .from('ambassador_cities')
      .select('city_id')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .then(({ data }) => setMyActiveCityIds((data || []).map((r) => r.city_id)));
  }, [isPureAmbassador, user?.id]);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [propRes, contractsRes, mediaRes, docsRes] = await Promise.all([
        supabase.from('rental_properties').select('*, bairro:bairro_id(id, name)').eq('id', id).maybeSingle(),
        supabase.from('rental_property_contracts').select('*').eq('property_id', id).order('start_date', { ascending: false }),
        supabase.from('rental_property_media').select('*').eq('property_id', id).order('created_at'),
        supabase.from('rental_property_documents').select('*').eq('property_id', id).order('created_at'),
      ]);
      if (propRes.error) throw propRes.error;
      setProperty(propRes.data);
      setContracts(contractsRes.data || []);
      setMedia(mediaRes.data || []);
      setDocuments(docsRes.data || []);
    } catch (error) {
      toast({ title: 'Erro ao buscar imóvel', description: error.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [id, toast]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  if (loading) {
    return (
      <div className="bg-[#f7f9fc] min-h-screen flex items-center justify-center">
        <p className="text-sm text-content-secondary">Carregando imóvel...</p>
      </div>
    );
  }

  if (!property) {
    return (
      <div className="bg-[#f7f9fc] min-h-screen flex flex-col items-center justify-center gap-4">
        <p className="text-content-secondary">Imóvel não encontrado.</p>
        <Link to="/imoveis-alugados"><Button>Voltar</Button></Link>
      </div>
    );
  }

  const currentContract = contracts.find((c) => c.is_current) || contracts[0] || null;
  const title = property.title || property.department || formatAddressWithNumber(property.address, property.street_number);
  const coverImage = property.thumbnail_url || media[0]?.url || null;

  return (
    <>
      <Helmet>
        <title>{title} - Imóveis Alugados - Trombone Cidadão</title>
      </Helmet>

      {/* ── TOP NAV ── */}
      <div className="bg-white/90 backdrop-blur-sm sticky top-0 z-30 shadow-[0_1px_0_0_rgba(25,28,30,0.06)]">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center gap-2">
          <Button
            size="icon"
            variant="ghost"
            className="h-9 w-9 rounded-xl bg-[#f2f4f7] hover:bg-[#e8eaed]"
            onClick={() => navigate(-1)}
          >
            <ArrowLeft className="w-4 h-4 text-content-primary" strokeWidth={1.5} />
          </Button>
          <span className="text-sm font-bold tracking-tight text-content-primary flex-1">Voltar para Imóveis Alugados</span>
          {canEditProperty && (
            <Link to={`/imoveis-alugados/gerenciar?edit=${property.id}`}>
              <Button size="sm" variant="outline" className="gap-1.5 text-xs border-tc-red/30 text-tc-red hover:bg-tc-red/5">
                <Pencil className="w-3.5 h-3.5" /> Editar imóvel
              </Button>
            </Link>
          )}
        </div>
        <div className="hidden lg:block bg-[#f7f9fc]">
          <div className="max-w-5xl mx-auto px-4 py-2 text-[11px] text-content-secondary flex items-center gap-1">
            <Link to="/" className="hover:text-[#b45309] transition-colors">Início</Link>
            <span className="opacity-50">›</span>
            <Link to="/imoveis-alugados" className="hover:text-[#b45309] transition-colors">Imóveis Alugados</Link>
            <span className="opacity-50">›</span>
            <span className="text-content-primary truncate">{title}</span>
          </div>
        </div>
      </div>

      {/* ── PAGE ── */}
      <div className="bg-[#f7f9fc] min-h-screen overflow-x-hidden">
        <div className="max-w-5xl mx-auto px-4 py-4 lg:py-8">
          <div className="bg-surface-raised shadow-[0_12px_32px_-4px_rgba(25,28,30,0.08)] rounded-2xl overflow-hidden">
            <div className="relative overflow-hidden">
              <div className="w-full h-48 sm:h-64 lg:h-72 bg-gradient-to-br from-[#78350f] via-[#92400e] to-[#b45309] relative overflow-hidden">
                <div className="absolute inset-0 opacity-10 bg-[repeating-linear-gradient(135deg,#fff_0,#fff_1px,transparent_1px,transparent_12px)]" />
                {coverImage ? (
                  <img src={coverImage} alt={title} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <Building2 className="w-16 h-16 text-white/25" strokeWidth={1} />
                  </div>
                )}
              </div>
            </div>

            <div className="relative -mt-5 px-3 pb-4 lg:-mt-10 lg:px-4">
              <div className="bg-surface-raised rounded-2xl p-4 space-y-6 shadow-[0_4px_16px_-4px_rgba(25,28,30,0.08)] lg:rounded-[2rem] lg:p-8 lg:space-y-8 lg:shadow-[0_12px_32px_-4px_rgba(25,28,30,0.10)]">

                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <h1 className="text-2xl sm:text-3xl font-extrabold tracking-[-0.02em] text-content-primary leading-tight">
                      {title}
                    </h1>
                    <span
                      className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold flex-shrink-0 ${
                        property.is_active ? 'bg-green-100 text-green-700' : 'bg-surface-sunken text-content-secondary'
                      }`}
                    >
                      {property.is_active ? <CheckCircle2 className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
                      {property.is_active ? 'Aluguel ativo' : 'Aluguel encerrado'}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-3 text-xs text-content-secondary">
                    <div className="flex items-center gap-2">
                      <MapPin className="w-3.5 h-3.5" strokeWidth={1.5} />
                      <span>{formatAddressWithNumber(property.address, property.street_number)}</span>
                    </div>
                    <span className="bg-[#e0e3e6] px-3 py-1 rounded-full font-semibold text-[10px] text-content-primary">
                      {property.bairro?.name || 'Bairro não informado'}
                    </span>
                  </div>
                </div>

                {media.length > 1 && (
                  <div>
                    <div className="flex items-center gap-1.5 text-xs font-bold text-content-primary mb-2">
                      <ImageIcon className="w-3.5 h-3.5 text-[#92400e]" strokeWidth={1.5} />
                      Fotos ({media.length})
                    </div>
                    <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                      {media.map((m, index) => (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => setMediaViewerIndex(index)}
                          className="relative aspect-square rounded-xl overflow-hidden bg-[#f2f4f7] hover:opacity-90 transition-opacity"
                        >
                          <img src={m.url} alt={title} className="w-full h-full object-cover" loading="lazy" />
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <SectionBlock icon={DollarSign} title="Contrato atual">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <InfoRow icon={User} label="Proprietário" value={currentContract?.owner_name || 'Não informado'} />
                    <InfoRow
                      icon={DollarSign}
                      label="Valor mensal"
                      value={currentContract ? `${formatCurrency(currentContract.monthly_value)}/mês` : '—'}
                    />
                    <InfoRow icon={Calendar} label="Início do contrato" value={currentContract ? formatDate(currentContract.start_date) : '—'} />
                    <InfoRow
                      icon={Calendar}
                      label="Fim do contrato"
                      value={currentContract?.end_date ? formatDate(currentContract.end_date) : 'Em vigor'}
                    />
                    {currentContract?.expected_end_date && (
                      <InfoRow
                        icon={Calendar}
                        label="Previsão de encerramento"
                        value={formatDate(currentContract.expected_end_date)}
                      />
                    )}
                  </div>
                </SectionBlock>

                <SectionBlock icon={Ruler} title="Características e utilização">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-3">
                    <InfoRow
                      icon={Ruler}
                      label="Tamanho"
                      value={property.length_m && property.width_m ? `${property.length_m}m x ${property.width_m}m (${property.area_m2}m²)` : 'Não informado'}
                    />
                    <InfoRow icon={Building2} label="Secretaria responsável" value={property.department || 'Não informada'} />
                  </div>
                  {property.characteristics && (
                    <p className="text-sm leading-relaxed text-content-primary whitespace-pre-line break-words">
                      {property.characteristics}
                    </p>
                  )}
                </SectionBlock>

                <SectionBlock icon={History} title="Histórico de valores">
                  {contracts.length > 0 ? (
                    <div className="space-y-2">
                      {contracts.map((c) => (
                        <div key={c.id} className="flex items-center justify-between gap-3 bg-surface-raised px-3 py-2.5 rounded-xl shadow-[0_2px_8px_-2px_rgba(25,28,30,0.06)]">
                          <div className="min-w-0">
                            <p className="text-xs font-semibold text-content-primary truncate">{c.owner_name}</p>
                            <p className="text-[11px] text-content-secondary">
                              {formatDate(c.start_date)} — {c.end_date ? formatDate(c.end_date) : (c.is_current ? 'atual' : '—')}
                            </p>
                          </div>
                          <p className="text-sm font-bold text-content-primary flex-shrink-0">{formatCurrency(c.monthly_value)}</p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-content-secondary">Nenhum contrato cadastrado.</p>
                  )}
                </SectionBlock>

                <SectionBlock icon={FileText} title="Documentos">
                  {documents.length > 0 ? (
                    <div className="space-y-2">
                      {documents.map((d) => (
                        <a
                          key={d.id}
                          href={d.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-3 bg-surface-raised px-3 py-2.5 rounded-xl shadow-[0_2px_8px_-2px_rgba(25,28,30,0.06)] hover:shadow-[0_4px_12px_-2px_rgba(25,28,30,0.1)] transition-shadow"
                        >
                          <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-surface-raised text-[#b45309] shrink-0">
                            <FileText className="w-4 h-4" strokeWidth={1.5} />
                          </div>
                          <span className="text-xs font-semibold text-content-primary flex-1 truncate">
                            {d.type === 'contrato' ? 'Contrato' : 'Aditivo'}{d.description ? ` — ${d.description}` : ''}
                          </span>
                        </a>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-content-secondary">Nenhum documento disponível.</p>
                  )}
                </SectionBlock>

              </div>
            </div>
          </div>
        </div>
      </div>

      {mediaViewerIndex !== null && (
        <MediaViewer
          media={media.map((m) => ({ url: m.url, type: 'photo' }))}
          startIndex={mediaViewerIndex}
          onClose={() => setMediaViewerIndex(null)}
        />
      )}
    </>
  );
};

export default RentalPropertyDetailsPage;

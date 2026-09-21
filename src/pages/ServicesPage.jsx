import { guideCategoryIds, guideCategoryCounts } from '@/lib/guideCategories';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Helmet } from 'react-helmet';
import { motion } from 'framer-motion';
import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  ArrowRight, Bed, Bike, Building, Bus, Car, ChevronLeft, ChevronRight,
  Church, Compass, FileDown, Grid2X2, Hammer, Heart, HeartPulse, Landmark,
  Laptop, List, MapPin, PawPrint, Phone, PlusCircle, Search, Share2,
  Shirt, Sparkles, Sprout, Store, Utensils,
} from 'lucide-react';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';

import { Button } from '@/components/ui/button';
import CitySelector from '@/components/CitySelector';
import GuideEntryDialog from '@/components/GuideEntryDialog';
import { useCityView, CityViewProvider } from '@/contexts/CityContext';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { usePermissions } from '@/hooks/usePermissions';
import { supabase } from '@/lib/customSupabaseClient';
import { showAppError } from '@/lib/appError';
import { compartilharLink } from '@/lib/shareLink';

const PAGE_SIZE = 8;
const normalizeText = (value) => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

const categoryAppearance = (name) => {
  const value = normalizeText(name);
  if (/^cidade$/.test(value)) return { Icon: MapPin, tone: 'bg-red-50 text-red-600 dark:bg-red-950/40 dark:text-red-400' };
  if (/^apoie$/.test(value)) return { Icon: Heart, tone: 'bg-red-50 text-red-600 dark:bg-red-950/40 dark:text-red-400' };
  if (/agro|rural|fazenda/.test(value)) return { Icon: Sprout, tone: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400' };
  if (/beleza|estetica|salao/.test(value)) return { Icon: Sparkles, tone: 'bg-pink-50 text-pink-600 dark:bg-pink-950/40 dark:text-pink-400' };
  if (/construcao|reforma|material/.test(value)) return { Icon: Hammer, tone: 'bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400' };
  if (/diversao|lazer|entretenimento/.test(value)) return { Icon: Heart, tone: 'bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-400' };
  if (/igreja|religiao|templo/.test(value)) return { Icon: Church, tone: 'bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400' };
  if (/comer|restaurante|alimento|cafe/.test(value)) return { Icon: Utensils, tone: 'bg-orange-50 text-orange-600 dark:bg-orange-950/40 dark:text-orange-400' };
  if (/ficar|hotel|pousada|hosped/.test(value)) return { Icon: Bed, tone: 'bg-sky-50 text-sky-600 dark:bg-sky-950/40 dark:text-sky-400' };
  if (/orgao|publico|prefeitura/.test(value)) return { Icon: Landmark, tone: 'bg-red-50 text-red-600 dark:bg-red-950/40 dark:text-red-400' };
  if (/carro|automov|oficina/.test(value)) return { Icon: Car, tone: 'bg-red-50 text-red-600 dark:bg-red-950/40 dark:text-red-400' };
  if (/pet|animal|veterin/.test(value)) return { Icon: PawPrint, tone: 'bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-400' };
  if (/moto|bicicleta/.test(value)) return { Icon: Bike, tone: 'bg-purple-50 text-purple-600 dark:bg-purple-950/40 dark:text-purple-400' };
  if (/saude|medic|farmacia/.test(value)) return { Icon: HeartPulse, tone: 'bg-red-50 text-red-600 dark:bg-red-950/40 dark:text-red-400' };
  if (/tecnolog|informat/.test(value)) return { Icon: Laptop, tone: 'bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400' };
  if (/vestuario|roupa|moda/.test(value)) return { Icon: Shirt, tone: 'bg-pink-50 text-pink-600 dark:bg-pink-950/40 dark:text-pink-400' };
  if (/transport|lotacao|onibus/.test(value)) return { Icon: Bus, tone: 'bg-red-50 text-red-600 dark:bg-red-950/40 dark:text-red-400' };
  if (/turist|passeio/.test(value)) return { Icon: Compass, tone: 'bg-orange-50 text-orange-600 dark:bg-orange-950/40 dark:text-orange-400' };
  return { Icon: Building, tone: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300' };
};

const GuideCategoryIcon = ({ label, className = 'h-5 w-5' }) => {
  const { Icon, tone } = categoryAppearance(label);
  return <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${tone}`}><Icon className={className} aria-hidden="true" /></span>;
};

const CategoryRail = ({ categories, activeId, categoryLink, allLink }) => {
  const railRef = useRef(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const updateScrollControls = useCallback(() => {
    const rail = railRef.current;
    if (!rail) return;
    setCanScrollLeft(rail.scrollLeft > 2);
    setCanScrollRight(rail.scrollLeft + rail.clientWidth < rail.scrollWidth - 2);
  }, []);

  useEffect(() => {
    const rail = railRef.current;
    if (!rail) return undefined;

    const active = rail.querySelector('[aria-current="page"]');
    if (active) {
      const railBounds = rail.getBoundingClientRect();
      const activeBounds = active.getBoundingClientRect();
      rail.scrollLeft += activeBounds.left - railBounds.left - (rail.clientWidth - activeBounds.width) / 2;
    }
    updateScrollControls();
    const resizeObserver = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(updateScrollControls) : null;
    resizeObserver?.observe(rail);
    window.addEventListener('resize', updateScrollControls);
    rail.addEventListener('scroll', updateScrollControls, { passive: true });
    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener('resize', updateScrollControls);
      rail.removeEventListener('scroll', updateScrollControls);
    };
  }, [activeId, categories, updateScrollControls]);

  const move = (direction) => {
    const rail = railRef.current;
    rail?.scrollBy({ left: direction * Math.max(220, rail.clientWidth * 0.7), behavior: 'smooth' });
  };

  return <div className="flex min-w-0 items-center gap-2">
    <button type="button" onClick={() => move(-1)} disabled={!canScrollLeft} aria-label="Ver categorias anteriores" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-edge-subtle bg-surface-raised text-content-primary shadow-sm transition-colors hover:border-brand/40 hover:text-brand disabled:cursor-not-allowed disabled:opacity-35"><ChevronLeft className="h-4 w-4" /></button>
    <nav ref={railRef} className="flex min-w-0 flex-1 snap-x snap-mandatory gap-2 overflow-x-auto overscroll-x-contain scroll-smooth py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" aria-label="Categorias principais">
      <Link to={allLink} className="shrink-0 snap-start whitespace-nowrap rounded-full border border-edge-subtle bg-surface-raised px-3 py-1.5 text-xs font-semibold text-content-secondary transition-colors hover:border-brand/30 hover:text-brand">Todas</Link>
      {categories.map((category) => {
        const isActive = String(category.id) === String(activeId);
        return <Link key={category.id} to={categoryLink(category.id)} aria-current={isActive ? 'page' : undefined} className={`shrink-0 snap-start whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${isActive ? 'border-brand bg-brand-subtleBg text-brand' : 'border-edge-subtle bg-surface-raised text-content-secondary hover:border-brand/30 hover:text-brand'}`}>{category.name}</Link>;
      })}
    </nav>
    <button type="button" onClick={() => move(1)} disabled={!canScrollRight} aria-label="Ver mais categorias" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-edge-subtle bg-surface-raised text-content-primary shadow-sm transition-colors hover:border-brand/40 hover:text-brand disabled:cursor-not-allowed disabled:opacity-35"><ChevronRight className="h-4 w-4" /></button>
  </div>;
};

const PlaceCard = ({ item, viewMode }) => (
  <Link
    to={`/guia-da-cidade/guia/${item.id}`}
    className={`group flex min-w-0 overflow-hidden rounded-2xl border border-edge-subtle bg-surface-raised shadow-sm transition-all hover:-translate-y-0.5 hover:border-brand/30 hover:shadow-elevation-2 ${viewMode === 'grade' ? 'flex-col' : 'items-center gap-3 p-3 sm:gap-4 sm:p-4'}`}
  >
    <span className={`flex shrink-0 items-center justify-center overflow-hidden rounded-xl bg-surface-subtle ${viewMode === 'grade' ? 'h-36 w-full rounded-none' : 'h-14 w-14 sm:h-16 sm:w-16'}`}>
      {item.image_url ? <img src={item.image_url} alt="" className="h-full w-full object-cover" loading="lazy" /> : <Building className="h-6 w-6 text-content-tertiary" aria-hidden="true" />}
    </span>
    <span className={`min-w-0 flex-1 ${viewMode === 'grade' ? 'p-4' : ''}`}>
      <span className="block truncate text-sm font-extrabold text-content-primary sm:text-base">{item.name}</span>
      {(item.guide_metadata?.destination || item.description) && <span className="mt-0.5 block line-clamp-2 text-xs text-content-secondary">{item.guide_metadata?.destination ? `Destino: ${item.guide_metadata.destination}` : item.description}</span>}
      {item.address && <span className="mt-2 flex items-center gap-1.5 truncate text-xs text-content-tertiary"><MapPin className="h-3.5 w-3.5 shrink-0 text-brand" aria-hidden="true" />{item.address}</span>}
      {item.phone && <span className="mt-1 flex items-center gap-1.5 truncate text-xs text-content-tertiary"><Phone className="h-3.5 w-3.5 shrink-0 text-brand" aria-hidden="true" />{item.phone}</span>}
    </span>
    <span className={`inline-flex shrink-0 items-center gap-1 rounded-lg bg-brand-subtleBg px-3 py-2 text-xs font-bold text-brand transition-colors group-hover:bg-brand group-hover:text-content-onBrand ${viewMode === 'grade' ? 'mb-4 ml-4 self-start' : 'hidden sm:inline-flex'}`}>Ver mais <ArrowRight className="h-3.5 w-3.5" /></span>
  </Link>
);

const GuideListing = ({ title, description, entries, sortBy, setSortBy, viewMode, setViewMode, page, setPage, className = 'mt-8' }) => {
  const sortedEntries = useMemo(() => [...entries].sort((first, second) => {
    if (sortBy === 'nome') return first.name.localeCompare(second.name, 'pt-BR');
    if (sortBy === 'populares') return Number(second.views || 0) - Number(first.views || 0);
    return new Date(second.created_at || 0) - new Date(first.created_at || 0);
  }), [entries, sortBy]);
  const pageCount = Math.max(1, Math.ceil(sortedEntries.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const pagedEntries = sortedEntries.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  return <section className={className} aria-labelledby="guide-list-title">
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 id="guide-list-title" className="text-xl font-extrabold text-content-primary sm:text-2xl">{title} <span className="ml-1 align-middle text-xs font-semibold text-content-tertiary">{sortedEntries.length} {sortedEntries.length === 1 ? 'resultado' : 'resultados'}</span></h2>
        <p className="mt-1 text-sm text-content-secondary">{description}</p>
      </div>
      {sortedEntries.length > 0 && <div className="flex items-center gap-2">
        <label htmlFor="guide-sort" className="sr-only">Ordenar locais</label>
        <select id="guide-sort" value={sortBy} onChange={(event) => setSortBy(event.target.value)} className="h-9 rounded-lg border border-edge-subtle bg-surface-raised px-3 text-xs font-semibold text-content-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand">
          <option value="recentes">Mais recentes</option>
          <option value="nome">Nome de A a Z</option>
          <option value="populares">Mais populares</option>
        </select>
        <div className="flex rounded-lg border border-edge-subtle bg-surface-raised p-1" role="group" aria-label="Visualização dos locais">
          <button type="button" aria-label="Ver em lista" aria-pressed={viewMode === 'lista'} onClick={() => setViewMode('lista')} className={`rounded-md p-1.5 ${viewMode === 'lista' ? 'bg-brand text-content-onBrand' : 'text-content-tertiary hover:text-content-primary'}`}><List className="h-4 w-4" /></button>
          <button type="button" aria-label="Ver em grade" aria-pressed={viewMode === 'grade'} onClick={() => setViewMode('grade')} className={`rounded-md p-1.5 ${viewMode === 'grade' ? 'bg-brand text-content-onBrand' : 'text-content-tertiary hover:text-content-primary'}`}><Grid2X2 className="h-4 w-4" /></button>
        </div>
      </div>}
    </div>
    {sortedEntries.length > 0 ? <>
      <div className={viewMode === 'grade' ? 'grid grid-cols-[repeat(auto-fit,minmax(min(100%,14rem),1fr))] gap-3' : 'space-y-3'}>{pagedEntries.map((item) => <PlaceCard key={item.id} item={item} viewMode={viewMode} />)}</div>
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 text-xs text-content-tertiary">
        <span>Mostrando {(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, sortedEntries.length)} de {sortedEntries.length} {sortedEntries.length === 1 ? 'local' : 'locais'}</span>
        {pageCount > 1 && <nav className="flex items-center gap-1" aria-label="Paginação dos locais">
          <button type="button" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)} aria-label="Página anterior" className="rounded-lg border border-edge-subtle bg-surface-raised p-2 disabled:opacity-40"><ChevronLeft className="h-4 w-4" /></button>
          <span className="px-2 font-semibold text-content-primary">{currentPage} de {pageCount}</span>
          <button type="button" disabled={currentPage === pageCount} onClick={() => setPage(currentPage + 1)} aria-label="Próxima página" className="rounded-lg border border-edge-subtle bg-surface-raised p-2 disabled:opacity-40"><ChevronRight className="h-4 w-4" /></button>
        </nav>}
      </div>
    </> : <p className="rounded-2xl border border-dashed border-edge-default bg-surface-raised px-5 py-10 text-center text-sm text-content-secondary">Nenhum local encontrado. Tente outra categoria ou cidade.</p>}
  </section>;
};

const ServicesPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { categoryId } = useParams();
  const legacyCategoryId = searchParams.get('categoria');
  const searchTerm = searchParams.get('busca')?.trim() || '';
  const selectedCategoryId = categoryId || legacyCategoryId;
  const isCategoryPage = Boolean(selectedCategoryId);
  const linkedCityId = searchParams.get('cidade');
  const { cityId: activeCityId, cityName: activeCityName, city: activeCity, setCityId, cities } = useCityView();
  const { user } = useAuth();
  const { canWrite } = usePermissions();
  const isPureAmbassador = Boolean(user?.is_ambassador && !user?.is_admin && !user?.is_master);
  const [myActiveCityIds, setMyActiveCityIds] = useState([]);
  const canManageServices = Boolean(
    (user?.is_admin || user?.is_master ||
      (isPureAmbassador && activeCityId && myActiveCityIds.some((id) => String(id) === String(activeCityId))))
    && canWrite('services')
  );
  const [directory, setDirectory] = useState([]);
  const [directoryCategories, setDirectoryCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchInput, setSearchInput] = useState(searchTerm);
  const [sortBy, setSortBy] = useState('recentes');
  const [viewMode, setViewMode] = useState('lista');
  const [page, setPage] = useState(1);
  const [guideDialogOpen, setGuideDialogOpen] = useState(false);

  useEffect(() => setSearchInput(searchTerm), [searchTerm]);
  useEffect(() => setPage(1), [selectedCategoryId, activeCityId, sortBy, searchTerm]);

  useEffect(() => {
    if (searchParams.get('adicionar') !== '1' || !user) return;
    setGuideDialogOpen(true);
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.delete('adicionar');
      return next;
    }, { replace: true });
  }, [searchParams, setSearchParams, user]);

  useEffect(() => {
    if (linkedCityId === 'todas') setCityId(null);
    else if (/^\d+$/.test(linkedCityId || '') && cities.some((city) => String(city.id) === linkedCityId)) setCityId(linkedCityId);
  }, [linkedCityId, cities, setCityId]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    let directoryQuery = supabase.from('directory').select('*').eq('status', 'approved');
    if (activeCityId) directoryQuery = directoryQuery.eq('city_id', activeCityId);
    const [{ data: entries, error: directoryError }, { data: categories, error: categoriesError }] = await Promise.all([
      directoryQuery,
      supabase.from('directory_categories').select('*').eq('active', true).order('sort_order').order('name'),
    ]);
    if (directoryError) showAppError({ title: 'Erro ao buscar Guia da Cidade', description: directoryError.message, variant: 'destructive' });
    if (categoriesError) showAppError({ title: 'Erro ao buscar categorias do Guia', description: categoriesError.message, variant: 'destructive' });
    setDirectory(entries || []);
    setDirectoryCategories(categories || []);
    setLoading(false);
  }, [activeCityId]);

  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => {
    if (!isPureAmbassador || !user?.id) { setMyActiveCityIds([]); return; }
    supabase.from('ambassador_cities').select('city_id').eq('user_id', user.id).eq('status', 'active')
      .then(({ data }) => setMyActiveCityIds((data || []).map((row) => row.city_id)));
  }, [isPureAmbassador, user?.id]);

  const visibleCategories = useMemo(() => directoryCategories.filter((category) =>
    category.city_id == null || !activeCityId || String(category.city_id) === String(activeCityId)
  ), [directoryCategories, activeCityId]);
  const categoryById = useMemo(() => new Map(visibleCategories.map((category) => [String(category.id), category])), [visibleCategories]);
  const rootCategories = useMemo(() => visibleCategories.filter((category) => !category.parent_id), [visibleCategories]);
  const childrenByParent = useMemo(() => {
    const groups = new Map();
    visibleCategories.forEach((category) => {
      if (!category.parent_id) return;
      const parentId = String(category.parent_id);
      groups.set(parentId, [...(groups.get(parentId) || []), category]);
    });
    return groups;
  }, [visibleCategories]);
  const categoryCounts = useMemo(() => {
    return guideCategoryCounts(directory, categoryById);
  }, [directory, categoryById]);
  const categoryCount = (category) => categoryCounts.get(String(category.id)) || 0;
  const selectedCategory = selectedCategoryId ? categoryById.get(String(selectedCategoryId)) : null;
  const selectedParent = selectedCategory?.parent_id ? categoryById.get(String(selectedCategory.parent_id)) : null;
  const childCategories = selectedCategory && !selectedCategory.parent_id ? childrenByParent.get(String(selectedCategory.id)) || [] : [];
  const subcategoryParent = selectedParent || selectedCategory;
  const subcategories = selectedParent ? childrenByParent.get(String(selectedParent.id)) || [] : childCategories;
  const uncategorizedEntries = directory.filter((entry) => !guideCategoryIds(entry).some((id) => categoryById.has(id)));
  const selectedEntries = selectedCategoryId === 'sem-categoria'
    ? uncategorizedEntries
    : directory.filter((entry) => guideCategoryIds(entry).some((id) => id === String(selectedCategory?.id) || childCategories.some((child) => String(child.id) === id)));
  const transportRoot = rootCategories.find((category) => /transport|lotac/.test(normalizeText(category.name)));
  const transportCategoryIds = new Set(transportRoot
    ? [transportRoot.id, ...(childrenByParent.get(String(transportRoot.id)) || []).map((category) => category.id)].map(String)
    : []);
  const isTransportCategory = transportCategoryIds.has(String(selectedCategory?.id));
  const transportEntries = directory.filter((entry) => guideCategoryIds(entry).some((id) => transportCategoryIds.has(id)));
  const categoryLink = (id) => `/guia-da-cidade/categoria/${encodeURIComponent(id)}?cidade=${activeCityId ?? 'todas'}`;
  const guideHomeLink = `/guia-da-cidade?cidade=${activeCityId ?? 'todas'}`;
  const openAddItem = () => {
    if (canManageServices) {
      navigate('/servicos/gerenciar');
      return;
    }
    if (!user) {
      try {
        const returnPath = `${window.location.pathname}${window.location.search}`;
        const separator = returnPath.includes('?') ? '&' : '?';
        sessionStorage.setItem('tc_post_login_redirect', `${returnPath}${separator}adicionar=1`);
      } catch { /* Login still works without a saved return path. */ }
      navigate('/login');
      return;
    }
    setGuideDialogOpen(true);
  };
  const publicOrigin = /^https?:$/.test(window.location.protocol) ? window.location.origin : 'https://trombonecidadao.com.br';
  const shareUrl = `${publicOrigin}/share/guia${selectedCategoryId ? `/categoria/${encodeURIComponent(selectedCategoryId)}` : ''}?cidade=${activeCityId ?? 'todas'}`;
  const shareTitle = selectedCategory ? `${selectedCategory.name} - Guia da Cidade` : selectedCategoryId === 'sem-categoria' ? 'Outros locais - Guia da Cidade' : 'Guia da Cidade';
  const entryImage = (entry) => entry?.image_url || entry?.guide_metadata?.secondary_image_url;
  const shareEntries = selectedCategoryId === 'sem-categoria' ? uncategorizedEntries : isCategoryPage ? selectedEntries : directory;
  const shareImage = entryImage(shareEntries.find((entry) => entryImage(entry)))
    || `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/site-media/shared/thumbnail.jpg`;
  const heroImage = activeCity?.civic_thumbnail_url
    || `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/site-media/home-image/hero-img.webp`;

  const searchMatches = searchTerm ? directory.filter((entry) => {
    const category = categoryById.get(String(entry.category_id));
    const parent = category?.parent_id ? categoryById.get(String(category.parent_id)) : null;
    return normalizeText([entry.name, entry.description, entry.address, entry.guide_metadata?.destination, category?.name, parent?.name, ...guideCategoryIds(entry).map((id) => categoryById.get(id)?.name)].join(' ')).includes(normalizeText(searchTerm));
  }) : [];
  const matchingCategories = searchTerm ? visibleCategories.filter((category) => normalizeText(category.name).includes(normalizeText(searchTerm))) : [];

  const handleCityChange = (cityId) => {
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.set('cidade', cityId == null ? 'todas' : String(cityId));
      return next;
    }, { replace: true });
  };
  const handleSearch = (event) => {
    event.preventDefault();
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      if (searchInput.trim()) next.set('busca', searchInput.trim());
      else next.delete('busca');
      return next;
    });
  };
  const clearSearch = () => {
    setSearchInput('');
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.delete('busca');
      return next;
    });
  };
  const handleShare = () => compartilharLink({ title: shareTitle, text: `Explore ${shareTitle}${activeCityName ? ` em ${activeCityName}` : ''}`, url: shareUrl });

  const downloadTransportPdf = async () => {
    try {
      const doc = new jsPDF();
      const printable = (value) => String(value || '—').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      doc.setFontSize(16);
      doc.text('Lista de lotacoes - Guia da Cidade', 14, 18);
      doc.setFontSize(10);
      doc.text(`Cidade: ${printable(activeCityName || 'Todas')} | ${new Date().toLocaleDateString('pt-BR')}`, 14, 26);
      doc.autoTable({
        startY: 33,
        head: [['Nome', 'Destino / informacoes', 'Telefone', 'Endereco']],
        body: transportEntries.map((entry) => [
          printable(entry.name), printable(entry.guide_metadata?.destination || entry.description),
          printable(entry.phone), printable(entry.address),
        ]),
        styles: { fontSize: 8, cellPadding: 2, overflow: 'linebreak' },
        headStyles: { fillColor: [185, 28, 28] },
      });
      doc.save(`lotacoes-${(activeCityName || 'todas').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-')}.pdf`);
    } catch (error) {
      showAppError({ title: 'Não foi possível baixar o PDF', description: error?.message, variant: 'destructive' });
    }
  };

  if (!categoryId && legacyCategoryId) {
    const city = linkedCityId === 'todas' || /^\d+$/.test(linkedCityId || '') ? linkedCityId : activeCityId ?? 'todas';
    return <Navigate to={`/guia-da-cidade/categoria/${encodeURIComponent(legacyCategoryId)}?cidade=${city}`} replace />;
  }

  const listingProps = { sortBy, setSortBy, viewMode, setViewMode, page, setPage };

  return <>
    <Helmet>
      <title>{selectedCategory ? `${selectedCategory.name} - Guia da Cidade` : 'Guia da Cidade - Trombone Cidadão'}</title>
      <meta name="description" content={`Encontre informações úteis sobre ${activeCityName || 'sua cidade'}: pontos turísticos, transportes e Guia da Cidade.`} />
      <link rel="canonical" href={`https://trombonecidadao.com.br${selectedCategoryId ? categoryLink(selectedCategoryId) : '/guia-da-cidade'}`} />
      <meta property="og:url" content={`https://trombonecidadao.com.br${selectedCategoryId ? categoryLink(selectedCategoryId) : '/guia-da-cidade'}`} />
      <meta property="og:title" content={shareTitle} />
      <meta property="og:description" content={`Encontre locais e informações úteis sobre ${activeCityName || 'sua cidade'} no Guia da Cidade.`} />
      <meta property="og:image" content={shareImage} />
      <meta property="og:image:alt" content={shareTitle} />
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={shareTitle} />
      <meta name="twitter:description" content={`Encontre locais e informações úteis sobre ${activeCityName || 'sua cidade'} no Guia da Cidade.`} />
      <meta name="twitter:image" content={shareImage} />
    </Helmet>

    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }} className="page-shell-fluid pb-14 pt-5">
      {!isCategoryPage && <section aria-label="Guia da Cidade">
        <header className="relative overflow-hidden rounded-3xl border border-edge-subtle bg-surface-raised shadow-elevation-1">
          <div className="pointer-events-none absolute inset-y-0 right-0 hidden w-1/2 sm:block" aria-hidden="true">
            <img src={heroImage} alt="" className="h-full w-full object-cover object-center opacity-70" />
            <div className="absolute inset-0 bg-gradient-to-r from-surface-raised via-surface-raised/75 to-transparent" />
          </div>

          <div className="relative z-10 px-5 pb-6 pt-6 sm:px-8 sm:pt-8">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="inline-flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-[0.14em] text-brand"><MapPin className="h-3.5 w-3.5" /> Guia local</span>
              <div className="flex flex-wrap items-center gap-2">
                <CitySelector onCityChange={handleCityChange} />
                <button
                  type="button"
                  onClick={handleShare}
                  className="inline-flex items-center gap-1.5 rounded-full border border-edge-default bg-surface-raised px-3.5 py-1.5 text-xs font-bold text-content-primary shadow-elevation-1 transition-colors hover:border-brand/30 hover:text-brand hover:bg-surface-subtleHover"
                >
                  <Share2 className="h-3.5 w-3.5 text-content-secondary" />
                  <span>Compartilhar</span>
                </button>
              </div>
            </div>

            <div className="mt-2 max-w-xl lg:max-w-2xl">
              <h1 className="text-3xl font-black tracking-tight text-content-primary sm:text-4xl">Guia da Cidade{activeCityName ? ` de ${activeCityName}` : ''}</h1>
              <p className="mt-2 text-sm leading-relaxed text-content-secondary sm:text-base">Encontre serviços, comércio, turismo e transporte em um só lugar.<br className="hidden sm:inline" /> Explore por categorias e descubra o que a cidade oferece.</p>
            </div>

            <form onSubmit={handleSearch} role="search" className="mt-6 flex max-w-2xl items-center gap-2 rounded-2xl border border-edge-subtle bg-surface-raised p-2 shadow-elevation-1">
              <Search className="ml-2 h-4 w-4 shrink-0 text-brand" aria-hidden="true" />
              <label htmlFor="guide-search" className="sr-only">Buscar no Guia da Cidade</label>
              <input id="guide-search" value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder="O que você está procurando?" className="h-9 min-w-0 flex-1 bg-transparent px-1 text-sm text-content-primary outline-none placeholder:text-content-tertiary" />
              <Button type="submit" size="sm" className="h-9 shrink-0 gap-1.5 rounded-xl bg-brand px-4 text-content-onBrand hover:bg-brand/90"><Search className="h-3.5 w-3.5" /> Buscar</Button>
            </form>
            <p className="mt-2 text-xs text-content-tertiary">Ex.: farmácia, restaurante, hotel, mecânico...</p>
          </div>

          {/* Faixa inferior integrada: Seu negócio ainda não está no guia? */}
          <div className="relative z-10 border-t border-edge-subtle bg-surface-subtle/50 px-5 py-4 sm:px-8">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3.5 min-w-0">
                <span className="flex h-11 w-11 sm:h-12 sm:w-12 shrink-0 items-center justify-center rounded-2xl border border-edge-subtle bg-surface-raised text-brand shadow-xs">
                  <Store className="h-6 w-6" />
                </span>
                <div className="min-w-0 flex-1">
                  <h2 className="text-sm sm:text-base font-extrabold text-content-primary">
                    Seu negócio ainda não está no guia?
                  </h2>
                  <p className="mt-0.5 text-xs sm:text-sm text-content-secondary">
                    Cadastre um estabelecimento e ajude outras pessoas a encontrar o que a cidade oferece.
                  </p>
                </div>
              </div>
              <Button
                type="button"
                onClick={openAddItem}
                className="shrink-0 gap-2 rounded-xl sm:rounded-2xl bg-brand px-5 py-2.5 text-xs sm:text-sm font-bold text-content-onBrand shadow-sm transition-all hover:bg-brand/90 hover:shadow-elevation-1"
              >
                <PlusCircle className="h-4 w-4" />
                <span>Adicionar meu negócio</span>
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </header>

        {searchTerm ? <>
          <div className="mt-8 flex flex-wrap items-center justify-between gap-2"><h2 className="text-lg font-extrabold text-content-primary">Resultados para “{searchTerm}”</h2><button type="button" onClick={clearSearch} className="text-xs font-bold text-brand hover:underline">Limpar busca</button></div>
          {!loading && matchingCategories.length > 0 && <div className="mt-3 flex flex-wrap gap-2">{matchingCategories.map((category) => <Link key={category.id} to={categoryLink(category.id)} className="rounded-full border border-brand/20 bg-brand-subtleBg px-3 py-1.5 text-xs font-semibold text-brand hover:border-brand/50">{category.name} <ArrowRight className="ml-1 inline h-3 w-3" /></Link>)}</div>}
          {!loading && <GuideListing title="Locais encontrados" description="Resultados entre os locais cadastrados no guia." entries={searchMatches} {...listingProps} />}
        </> : <>
          <div className="mb-4 mt-8 flex items-end justify-between gap-3"><div><h2 className="text-xl font-extrabold text-content-primary sm:text-2xl">Explore por categoria</h2><p className="mt-1 text-sm text-content-secondary">Escolha uma categoria e encontre o que precisa{activeCityName ? ` em ${activeCityName}` : ''}.</p></div><span className="shrink-0 text-xs font-bold text-brand">{rootCategories.length} categorias</span></div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {loading && Array.from({ length: 8 }, (_, index) => <div key={index} className="h-20 animate-pulse rounded-2xl border border-edge-subtle bg-surface-raised" aria-hidden="true" />)}
            {!loading && rootCategories.map((category) => {
              const children = childrenByParent.get(String(category.id)) || [];
              return <article key={category.id} className="min-w-0 rounded-2xl border border-edge-subtle bg-surface-raised p-3.5 shadow-sm transition-shadow hover:shadow-elevation-2">
                <Link to={categoryLink(category.id)} className="group flex min-w-0 items-center gap-3 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"><GuideCategoryIcon label={category.name} /><span className="min-w-0 flex-1"><span className="block truncate text-sm font-extrabold text-content-primary">{category.name}</span><span className="text-xs text-content-tertiary">{categoryCount(category)} {categoryCount(category) === 1 ? 'local' : 'locais'}</span></span><ChevronRight className="h-4 w-4 shrink-0 text-content-tertiary transition-transform group-hover:translate-x-0.5" /></Link>
                {children.length > 0 && <div className="mt-3 flex flex-wrap gap-1.5 border-t border-edge-subtle pt-2.5">{children.slice(0, 2).map((child) => <Link key={child.id} to={categoryLink(child.id)} className="max-w-full truncate rounded-full bg-surface-subtle px-2 py-1 text-[10px] font-semibold text-content-secondary hover:bg-brand-subtleBg hover:text-brand">{child.name}</Link>)}{children.length > 2 && <Link to={categoryLink(category.id)} className="rounded-full bg-brand-subtleBg px-2 py-1 text-[10px] font-bold text-brand">+{children.length - 2}</Link>}</div>}
              </article>;
            })}
            {!loading && uncategorizedEntries.length > 0 && <Link to={categoryLink('sem-categoria')} className="flex items-center gap-3 rounded-2xl border border-edge-subtle bg-surface-raised p-3.5 shadow-sm hover:border-brand/30"><GuideCategoryIcon label="outros" /><span className="min-w-0 flex-1"><span className="block text-sm font-extrabold text-content-primary">Outros locais</span><span className="text-xs text-content-tertiary">{uncategorizedEntries.length} locais</span></span><ChevronRight className="h-4 w-4 text-content-tertiary" /></Link>}
          </div>
          {!loading && rootCategories.length === 0 && uncategorizedEntries.length === 0 && <p className="mt-6 rounded-2xl border border-dashed border-edge-default px-5 py-10 text-center text-sm text-content-secondary">Nenhum local cadastrado nesta cidade.</p>}
        </>}
      </section>}

      {loading && isCategoryPage && <div className="space-y-4" role="status" aria-label="Carregando categoria"><div className="h-4 w-48 animate-pulse rounded bg-surface-subtle" /><div className="h-28 animate-pulse rounded-2xl bg-surface-raised" /><div className="h-12 animate-pulse rounded-2xl bg-surface-raised" /></div>}
      {!loading && isCategoryPage && (selectedCategory || selectedCategoryId === 'sem-categoria') && <section className="min-w-0" aria-label="Categoria do Guia da Cidade">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><nav className="flex flex-wrap items-center gap-1.5 text-xs text-content-tertiary" aria-label="Caminho da categoria"><Link to={guideHomeLink} className="hover:text-brand">Guia da Cidade</Link><ChevronRight className="h-3.5 w-3.5" />{selectedParent && <><Link to={categoryLink(selectedParent.id)} className="hover:text-brand">{selectedParent.name}</Link><ChevronRight className="h-3.5 w-3.5" /></>}<span aria-current="page" className="font-bold text-content-primary">{selectedCategory?.name || 'Outros locais'}</span></nav><Link to={guideHomeLink} className="inline-flex items-center gap-1 text-xs font-bold text-content-secondary hover:text-brand lg:hidden"><ChevronLeft className="h-3.5 w-3.5" /> Voltar</Link></div>
        <header className="relative overflow-hidden rounded-2xl border border-brand/15 bg-gradient-to-r from-brand-subtleBg via-surface-raised to-surface-raised p-4 shadow-elevation-1 sm:p-5 lg:min-h-44 lg:px-7 lg:py-6">
          <div className="pointer-events-none absolute inset-y-0 right-0 hidden w-2/5 lg:block" aria-hidden="true"><img src={heroImage} alt="" className="h-full w-full object-cover opacity-55" /><div className="absolute inset-0 bg-gradient-to-r from-surface-raised via-surface-raised/70 to-transparent" /></div>
          <div className="relative flex flex-wrap items-center gap-3 sm:gap-4">
            <GuideCategoryIcon label={selectedCategory?.name || 'outros'} className="h-6 w-6" />
            <div className="min-w-0 flex-1 basis-44">
              <p className="mb-0.5 text-[10px] font-extrabold uppercase tracking-[0.13em] text-brand">Guia da Cidade</p>
              <h1 className="text-xl font-black tracking-tight text-content-primary sm:text-2xl">{selectedCategory?.name || 'Outros locais'}</h1>
              <p className="mt-1 text-xs leading-relaxed text-content-secondary">{selectedEntries.length} {selectedEntries.length === 1 ? 'local disponível' : 'locais disponíveis'} nesta categoria. Explore e encontre o que precisa.</p>
            </div>
            <Button type="button" variant="outline" size="sm" className="gap-1.5 rounded-lg bg-surface-raised text-xs" onClick={handleShare}><Share2 className="h-3.5 w-3.5" /> Compartilhar</Button>
          </div>
          <div className="relative mt-4 flex flex-wrap items-center gap-2 lg:ml-14"><CitySelector onCityChange={handleCityChange} /></div>
        </header>
        <div className={`mt-3 hidden gap-3 lg:grid ${isTransportCategory && transportEntries.length > 0 ? 'md:grid-cols-2' : ''}`}>
          {isTransportCategory && transportEntries.length > 0 && <div className="flex min-w-0 flex-col gap-3 rounded-2xl border border-edge-subtle bg-surface-raised p-4 shadow-sm sm:flex-row sm:items-center"><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-surface-subtle text-content-secondary"><FileDown className="h-5 w-5" /></span><div className="min-w-0 flex-1"><h2 className="text-sm font-extrabold text-content-primary">Precisa da lista completa?</h2><p className="mt-1 text-xs text-content-secondary">Baixe o PDF com os transportes cadastrados nesta cidade.</p></div><Button type="button" variant="outline" size="sm" className="shrink-0 gap-1.5 rounded-lg text-xs" onClick={downloadTransportPdf}><FileDown className="h-3.5 w-3.5" /> Baixar lista em PDF</Button></div>}
          <div className="flex min-w-0 flex-col gap-3 rounded-2xl border border-brand/15 bg-gradient-to-r from-brand-subtleBg to-surface-raised p-4 shadow-sm sm:flex-row sm:items-center"><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-surface-raised text-brand shadow-sm"><Store className="h-6 w-6" /></span><div className="min-w-0 flex-1"><h2 className="text-sm font-extrabold text-content-primary">Tem um local para indicar?</h2><p className="mt-1 text-xs text-content-secondary">Ajude a tornar o Guia da Cidade ainda mais completo para todos.</p></div><Button type="button" onClick={openAddItem} size="sm" className="shrink-0 gap-1.5 rounded-lg bg-brand text-xs text-content-onBrand hover:bg-brand/90"><PlusCircle className="h-3.5 w-3.5" /> Adicionar item</Button></div>
        </div>
        <div className="mt-4 grid min-w-0 gap-4 lg:grid-cols-[220px_minmax(0,1fr)] 2xl:grid-cols-[250px_minmax(0,1fr)]">
          <aside className="hidden self-start rounded-2xl border border-edge-subtle bg-surface-raised p-3 shadow-sm lg:block" aria-label="Navegação das categorias">
            <h2 className="mb-2 px-2 text-sm font-extrabold text-content-primary">Categorias</h2>
            <nav className="space-y-0.5" aria-label="Categorias principais">
              <Link to={guideHomeLink} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs font-semibold text-content-secondary transition-colors hover:bg-surface-subtle hover:text-brand"><Grid2X2 className="h-3.5 w-3.5" /> Todas <ChevronRight className="ml-auto h-3 w-3" /></Link>
              {rootCategories.map((category) => {
                const { Icon } = categoryAppearance(category.name);
                const isActive = String(category.id) === String(selectedParent?.id || selectedCategory?.id);
                const children = childrenByParent.get(String(category.id)) || [];
                return <div key={category.id}>
                  <Link to={categoryLink(category.id)} aria-current={isActive && !selectedParent ? 'page' : undefined} aria-expanded={children.length > 0 ? isActive : undefined} className={`flex min-w-0 items-center gap-2 rounded-lg px-2 py-1.5 text-[11px] font-semibold transition-colors ${isActive ? 'bg-brand-subtleBg text-brand' : 'text-content-secondary hover:bg-surface-subtle hover:text-brand'}`}><Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /><span className="min-w-0 flex-1 truncate">{category.name}</span>{children.length > 0 && <span className="text-[10px] font-medium opacity-70">{categoryCount(category)}</span>}<ChevronRight className={`h-3 w-3 shrink-0 opacity-60 ${isActive && children.length > 0 ? 'rotate-90' : ''}`} aria-hidden="true" /></Link>
                  {isActive && children.length > 0 && <div role="group" className="my-1 ml-4 space-y-0.5 border-l border-edge-subtle pl-2" aria-label={`Subcategorias de ${category.name}`}>
                    {children.map((child) => <Link key={child.id} to={categoryLink(child.id)} aria-current={String(child.id) === String(selectedCategory?.id) ? 'page' : undefined} className={`flex min-w-0 items-center justify-between gap-2 rounded-md px-2 py-1.5 text-[11px] ${String(child.id) === String(selectedCategory?.id) ? 'bg-brand-subtleBg font-bold text-brand' : 'text-content-secondary hover:bg-surface-subtle hover:text-brand'}`}><span className="min-w-0 truncate">{child.name}</span><span className="text-[10px] opacity-70">{categoryCount(child)}</span></Link>)}
                  </div>}
                </div>;
              })}
              {uncategorizedEntries.length > 0 && <Link to={categoryLink('sem-categoria')} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-[11px] font-semibold text-content-secondary hover:bg-surface-subtle hover:text-brand"><Building className="h-3.5 w-3.5" /> Outros locais <ChevronRight className="ml-auto h-3 w-3" /></Link>}
            </nav>
          </aside>
          <div className="min-w-0">
        <GuideListing title="Locais" description="Confira os estabelecimentos cadastrados nesta categoria." entries={selectedEntries} className="mt-1" {...listingProps} />
        <div className="mt-6 lg:hidden">
          {subcategories.length > 0 && <nav className="mb-3 flex flex-wrap gap-2" aria-label={`Subcategorias de ${subcategoryParent.name}`}>
            {subcategories.map((child) => <Link key={child.id} to={categoryLink(child.id)} aria-current={String(child.id) === String(selectedCategory?.id) ? 'page' : undefined} className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${String(child.id) === String(selectedCategory?.id) ? 'border-brand bg-brand-subtleBg text-brand' : 'border-edge-subtle bg-surface-raised text-content-secondary'}`}>{child.name}</Link>)}
          </nav>}
          <div className="rounded-2xl border border-edge-subtle bg-surface-raised p-4 shadow-sm">
            <div className="mb-3 flex flex-wrap items-end justify-between gap-2"><div><h2 className="text-sm font-extrabold text-content-primary">Explore outras categorias</h2><p className="mt-0.5 text-xs text-content-tertiary">Deslize para ver todas.</p></div><span className="text-xs font-semibold text-content-tertiary">{rootCategories.length} categorias</span></div>
            <CategoryRail categories={rootCategories} activeId={selectedParent?.id || selectedCategory?.id} categoryLink={categoryLink} allLink={guideHomeLink} />
          </div>
          <div className="mt-3 grid gap-3">
            {isTransportCategory && transportEntries.length > 0 && <div className="flex min-w-0 flex-col gap-3 rounded-2xl border border-edge-subtle bg-surface-raised p-4 shadow-sm sm:flex-row sm:items-center"><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-surface-subtle text-content-secondary"><FileDown className="h-5 w-5" /></span><div className="min-w-0 flex-1"><h2 className="text-sm font-extrabold text-content-primary">Precisa da lista completa?</h2><p className="mt-1 text-xs text-content-secondary">Baixe o PDF com os transportes cadastrados nesta cidade.</p></div><Button type="button" variant="outline" size="sm" className="shrink-0 gap-1.5 rounded-lg text-xs" onClick={downloadTransportPdf}><FileDown className="h-3.5 w-3.5" /> Baixar lista em PDF</Button></div>}
            <div className="flex min-w-0 flex-col gap-3 rounded-2xl border border-brand/15 bg-gradient-to-r from-brand-subtleBg to-surface-raised p-4 shadow-sm sm:flex-row sm:items-center"><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-surface-raised text-brand shadow-sm"><Store className="h-6 w-6" /></span><div className="min-w-0 flex-1"><h2 className="text-sm font-extrabold text-content-primary">Tem um local para indicar?</h2><p className="mt-1 text-xs text-content-secondary">Ajude a tornar o Guia da Cidade ainda mais completo para todos.</p></div><Button type="button" onClick={openAddItem} size="sm" className="shrink-0 gap-1.5 rounded-lg bg-brand text-xs text-content-onBrand hover:bg-brand/90"><PlusCircle className="h-3.5 w-3.5" /> Adicionar item</Button></div>
          </div>
        </div>
          </div>
        </div>
      </section>}

      {loading && !isCategoryPage && <p className="mt-6 text-center text-sm text-content-tertiary">Carregando categorias...</p>}
      {!loading && isCategoryPage && !selectedCategory && selectedCategoryId !== 'sem-categoria' && <p className="mt-8 rounded-2xl border border-dashed border-edge-default p-8 text-center text-sm text-content-secondary">Categoria não encontrada. <Link to="/guia-da-cidade" className="font-bold text-brand underline">Voltar ao Guia da Cidade</Link></p>}
    </motion.div>
    <GuideEntryDialog open={guideDialogOpen} onOpenChange={setGuideDialogOpen} userId={user?.id} cityId={activeCityId} cities={cities} categories={directoryCategories} initialCategoryId={selectedCategory?.id || null} onSubmitted={fetchData} />
  </>;
};

// O filtro de cidade desta tela é local; explorar outra cidade não altera a cidade do usuário.
export default function ServicesPageWithCityView() {
  return <CityViewProvider><ServicesPage /></CityViewProvider>;
}

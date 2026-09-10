import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';

import TimeAgo from '@/components/TimeAgo';
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from '@/components/ui/carousel';
import StatusBadge from '@/design-system/primitives/StatusBadge';
import Icon, { categoryIconName } from '@/design-system/icons';
import { supabase } from '@/lib/customSupabaseClient';

const MAX_CARDS = 8;

// A vitrine visual no fim da pagina da rua. Os ids vêm da mesma funcao que
// alimenta os contadores e o filtro do mapa; assim, "nesta rua" tem exatamente
// o mesmo significado nos tres lugares.
export default function RecentReportsCarousel({ streetId, streetName }) {
  const [reports, setReports] = useState([]);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setReports([]);

      const { data: focus, error: focusError } = await supabase
        .rpc('get_street_focus', { p_street_id: streetId });
      if (cancelled || focusError) return;

      const reportIds = Array.isArray(focus?.report_ids) ? focus.report_ids : [];
      if (reportIds.length === 0) return;

      const { data, error } = await supabase
        .from('reports')
        .select(`
          id, title, status, created_at, category_id, featured_image_url,
          category:categories(name),
          report_media(url, type, is_resolution_proof, created_at)
        `)
        .in('id', reportIds)
        .order('created_at', { ascending: false })
        .limit(30);
      if (cancelled || error) return;

      const withImages = (data || []).flatMap((report) => {
        const firstOriginalPhoto = [...(report.report_media || [])]
          .filter((media) => media.type === 'photo' && !media.is_resolution_proof)
          .sort((a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0))[0]?.url;
        const coverImage = report.featured_image_url || firstOriginalPhoto;
        return coverImage ? [{ ...report, coverImage }] : [];
      });
      setReports(withImages.slice(0, MAX_CARDS));
    };

    if (streetId) void load();
    return () => { cancelled = true; };
  }, [streetId]);

  if (reports.length === 0) return null;

  return (
    <section className="min-w-0 pt-2" aria-labelledby="recent-street-reports-title">
      <div className="mb-3 flex items-end justify-between gap-4">
        <div>
          <h2 id="recent-street-reports-title" className="text-xl font-extrabold text-content-primary">
            Broncas recentes nesta rua
          </h2>
          <p className="mt-0.5 text-xs text-content-secondary">
            Registros com fotos {streetName ? `próximos de ${streetName}` : 'próximos desta rua'}.
          </p>
        </div>
        <Link to={`/mapa?rua=${streetId}`} className="inline-flex shrink-0 items-center gap-1 text-xs font-bold text-brand hover:underline">
          Ver todas <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      <Carousel opts={{ align: 'start', loop: reports.length > 3 }} className="w-full">
        <CarouselContent className="-ml-3 pb-1">
          {reports.map((report) => (
            <CarouselItem key={report.id} className="basis-[82%] pl-3 sm:basis-1/2 lg:basis-1/3 xl:basis-1/4">
              <Link
                to={`/bronca/${report.id}`}
                className="group block h-full overflow-hidden rounded-2xl border border-edge-subtle bg-surface-raised shadow-elevation-1 transition hover:-translate-y-0.5 hover:border-brand/30 hover:shadow-elevation-2"
              >
                <div className="relative aspect-[16/10] overflow-hidden bg-surface-sunken">
                  {report.coverImage ? (
                    <img
                      src={report.coverImage}
                      alt={report.title}
                      loading="lazy"
                      decoding="async"
                      className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                    />
                  ) : null}
                  <div className="absolute left-2 top-2"><StatusBadge status={report.status} /></div>
                </div>
                <div className="p-3.5">
                  <h3 className="line-clamp-2 min-h-[2.5rem] text-sm font-bold leading-5 text-content-primary group-hover:text-brand">
                    {report.title}
                  </h3>
                  <p className="mt-2 flex min-w-0 items-center gap-1 text-[11px] text-content-tertiary">
                    <Icon name={categoryIconName(report.category_id)} size={12} className="shrink-0" />
                    <span className="truncate">{report.category?.name || report.category_id}</span>
                    <span aria-hidden="true">·</span>
                    <TimeAgo date={report.created_at} className="shrink-0 text-[11px] text-content-tertiary" />
                  </p>
                </div>
              </Link>
            </CarouselItem>
          ))}
        </CarouselContent>
        {reports.length > 1 && (
          <>
            <CarouselPrevious className="-left-3 hidden sm:inline-flex" />
            <CarouselNext className="-right-3 hidden sm:inline-flex" />
          </>
        )}
      </Carousel>
    </section>
  );
}

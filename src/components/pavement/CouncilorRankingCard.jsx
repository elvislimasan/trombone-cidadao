import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Award, ChevronRight } from 'lucide-react';

import { supabase } from '@/lib/customSupabaseClient';
import { cidadeDoAutor, rankingDeAutores, rotaDoVereador } from '@/lib/pavementStreetHistory';

const Avatar = ({ profile, name }) => profile?.photo_url ? (
  <img src={profile.photo_url} alt="" className="h-10 w-10 rounded-full object-cover ring-2 ring-white" />
) : (
  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-subtleBg text-sm font-extrabold text-brand">
    {name.split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase()}
  </span>
);

export default function CouncilorRankingCard({ streets, cityId, cityName, compact = false }) {
  const ranking = useMemo(() => rankingDeAutores(streets), [streets]);
  const [profiles, setProfiles] = useState(new Map());
  const [expanded, setExpanded] = useState(false);
  const visibleRanking = expanded ? ranking : ranking.slice(0, compact ? 3 : 5);

  useEffect(() => {
    let cancelled = false;
    if (!cityId || ranking.length === 0) { setProfiles(new Map()); return undefined; }
    supabase
      .from('councilors')
      .select('name, nickname, normalized_name, slug, photo_url, party')
      .eq('city_id', cityId)
      .in('normalized_name', ranking.map((item) => item.key))
      .then(({ data }) => {
        if (!cancelled) setProfiles(new Map((data || []).map((item) => [item.normalized_name, item])));
      });
    return () => { cancelled = true; };
  }, [cityId, ranking]);

  if (ranking.length === 0) return compact ? <section className="pavement-dashboard-ranking-empty"><Award className="h-5 w-5 text-status-pendingFg" /><div><h2 className="text-xs font-bold">Quem mais nomeou ruas</h2><p className="mt-1 text-xs text-content-secondary">Nenhum autor de projeto vinculado às ruas deste recorte.</p></div></section> : null;

  return (
    <section className={`overflow-hidden rounded-2xl border border-edge-subtle bg-surface-raised shadow-sm ${compact ? 'pavement-dashboard-ranking' : ''}`} aria-labelledby="councilor-ranking-title">
      <div className="flex items-center gap-3 border-b border-edge-subtle px-4 py-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-status-pendingBg text-status-pendingFg">
          <Award className="h-[18px] w-[18px]" />
        </span>
        <div className="min-w-0">
          <h2 id="councilor-ranking-title" className="text-sm font-extrabold text-content-primary">Quem mais nomeou ruas</h2>
          <p className="text-xs text-content-secondary">Projetos de lei cadastrados{cityName ? ` em ${cityName}` : ''}</p>
        </div>
        {ranking.length > (compact ? 3 : 5) && <button type="button" className="ml-auto shrink-0 rounded-lg px-2.5 py-1.5 text-xs font-bold text-brand transition-colors hover:bg-brand-subtleBg" aria-expanded={expanded} onClick={() => setExpanded((value) => !value)}>{expanded ? 'Mostrar menos' : 'Ver todos'}</button>}
      </div>
      <div className={compact ? "pavement-dashboard-ranking-grid" : "grid divide-y divide-edge-subtle sm:grid-cols-2 sm:divide-x sm:divide-y-0 xl:grid-cols-5"}>
        {visibleRanking.map((item, index) => {
          const profile = profiles.get(item.key);
          const path = rotaDoVereador(cityId || cidadeDoAutor(streets, item.name), profile?.slug || item.name);
          const Entry = path ? Link : 'div';
          return (
            <Entry
              key={item.key}
              {...(path ? { to: path } : {})}
              className="flex min-w-0 items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-subtle"
            >
              <span className="w-5 shrink-0 text-center text-xs font-extrabold text-content-tertiary">{index + 1}</span>
              <Avatar profile={profile} name={item.name} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-bold text-content-primary">{profile?.nickname || profile?.name || item.name}</span>
                <span className="block text-[11px] text-content-secondary">{item.streets} {item.streets === 1 ? 'rua' : 'ruas'}{profile?.party ? ` · ${profile.party}` : ''}</span>
              </span>
              {path && <ChevronRight className="h-3.5 w-3.5 shrink-0 text-content-tertiary" />}
            </Entry>
          );
        })}
      </div>
    </section>
  );
}

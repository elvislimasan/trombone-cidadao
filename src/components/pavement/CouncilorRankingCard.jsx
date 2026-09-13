import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Award, ChevronRight } from 'lucide-react';

import { supabase } from '@/lib/customSupabaseClient';
import { rankingDeAutores, rotaDoVereador } from '@/lib/pavementStreetHistory';

const Avatar = ({ profile, name }) => profile?.photo_url ? (
  <img src={profile.photo_url} alt="" className="h-10 w-10 rounded-full object-cover ring-2 ring-white" />
) : (
  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-subtleBg text-sm font-extrabold text-brand">
    {name.split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase()}
  </span>
);

export default function CouncilorRankingCard({ streets, cityId, cityName }) {
  const ranking = useMemo(() => rankingDeAutores(streets).slice(0, 5), [streets]);
  const [profiles, setProfiles] = useState(new Map());

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

  if (ranking.length === 0) return null;

  return (
    <section className="overflow-hidden rounded-2xl border border-edge-subtle bg-surface-raised shadow-sm" aria-labelledby="councilor-ranking-title">
      <div className="flex items-center gap-3 border-b border-edge-subtle px-4 py-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-status-pendingBg text-status-pendingFg">
          <Award className="h-[18px] w-[18px]" />
        </span>
        <div className="min-w-0">
          <h2 id="councilor-ranking-title" className="text-sm font-extrabold text-content-primary">Quem mais nomeou ruas</h2>
          <p className="text-xs text-content-secondary">Projetos de lei cadastrados{cityName ? ` em ${cityName}` : ''}</p>
        </div>
      </div>
      <div className="grid divide-y divide-edge-subtle sm:grid-cols-2 sm:divide-x sm:divide-y-0 xl:grid-cols-5">
        {ranking.map((item, index) => {
          const profile = profiles.get(item.key);
          return (
            <Link
              key={item.key}
              to={rotaDoVereador(cityId, profile?.slug || item.name)}
              className="flex min-w-0 items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-subtle"
            >
              <span className="w-5 shrink-0 text-center text-xs font-extrabold text-content-tertiary">{index + 1}</span>
              <Avatar profile={profile} name={item.name} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-bold text-content-primary">{profile?.nickname || profile?.name || item.name}</span>
                <span className="block text-[11px] text-content-secondary">{item.streets} {item.streets === 1 ? 'rua' : 'ruas'}{profile?.party ? ` · ${profile.party}` : ''}</span>
              </span>
              <ChevronRight className="h-3.5 w-3.5 shrink-0 text-content-tertiary" />
            </Link>
          );
        })}
      </div>
    </section>
  );
}

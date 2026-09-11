import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, Landmark, User } from 'lucide-react';

import { supabase } from '@/lib/customSupabaseClient';
import { autoresDaRua, chaveDeAutor, rotaDoVereador } from '@/lib/pavementStreetHistory';

export default function CouncilorAttributionCard({ street }) {
  const authors = autoresDaRua(street);
  const [profiles, setProfiles] = useState(new Map());

  useEffect(() => {
    let cancelled = false;
    if (!street?.city_id || authors.length === 0) { setProfiles(new Map()); return undefined; }
    supabase
      .from('councilors')
      .select('name, normalized_name, slug, photo_url, party, biography')
      .eq('city_id', street.city_id)
      .in('normalized_name', authors.map(chaveDeAutor))
      .then(({ data }) => {
        if (!cancelled) setProfiles(new Map((data || []).map((item) => [item.normalized_name, item])));
      });
    return () => { cancelled = true; };
  }, [street?.city_id, street?.historical_documents]); // eslint-disable-line react-hooks/exhaustive-deps

  if (authors.length === 0) return null;

  return (
    <section className="overflow-hidden rounded-3xl border border-brand/20 bg-gradient-to-br from-brand-subtleBg to-surface-raised shadow-elevation-1">
      <div className="flex items-center gap-2 px-4 pt-4 text-[11px] font-extrabold uppercase tracking-wider text-brand sm:px-5 sm:pt-5">
        <Landmark className="h-4 w-4" /> Projeto de denominação da rua
      </div>
      <div className="grid gap-3 p-4 sm:p-5">
        {authors.map((author) => {
          const profile = profiles.get(chaveDeAutor(author));
          return (
            <Link
              key={chaveDeAutor(author)}
              to={rotaDoVereador(street.city_id, profile?.slug || author)}
              className="group flex items-center gap-3 rounded-2xl border border-edge-subtle bg-surface-raised p-3 transition-all hover:border-brand/30 hover:shadow-sm"
            >
              {profile?.photo_url ? (
                <img src={profile.photo_url} alt="" className="h-16 w-16 shrink-0 rounded-2xl object-cover" />
              ) : (
                <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-surface-subtle text-content-tertiary">
                  <User className="h-7 w-7" />
                </span>
              )}
              <span className="min-w-0 flex-1">
                <span className="block text-base font-extrabold text-content-primary">{profile?.name || author}</span>
                {profile?.party && <span className="mt-0.5 block text-xs font-bold text-brand">{profile.party}</span>}
                <span className="mt-1 block text-xs leading-snug text-content-secondary line-clamp-2">
                  {profile?.biography || `Vereador autor de projeto de lei relacionado a ${street.name}.`}
                </span>
              </span>
              <ChevronRight className="h-5 w-5 shrink-0 text-content-tertiary transition-transform group-hover:translate-x-0.5" />
            </Link>
          );
        })}
      </div>
    </section>
  );
}

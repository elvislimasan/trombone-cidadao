import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import useLegislativeData from '@/hooks/useLegislativeData';
import { legislativeFilters, legislativePath } from '@/lib/legislative';
import { LegislativeState } from '@/components/legislative/LegislativeComponents';
import '@/components/legislative/legislative.css';
import LegislativeProfileContent from '@/components/legislative/LegislativeProfileContent';
import useLegislativeView from '@/hooks/useLegislativeView';
import LegislativeViewMenu from '@/components/legislative/LegislativeViewMenu';

export default function CouncilorLegislativeOverview({ cityId, councilorId }) {
  const [revision, setRevision] = useState(0);const period = legislativeFilters(new URLSearchParams());
  const query = useLegislativeData(councilorId ? cityId : null, 'councilor', { start: period.start, end: period.end, councilor_id: councilorId }, revision);
  const data = query.data;const presentation = useLegislativeView();
  return <section className="legislative-profile legislative-panel"><div className="legislative-section-heading"><h2>Atuação na Câmara</h2><div className="flex items-center gap-3"><Link to={legislativePath(cityId)}>Radar legislativo</Link><LegislativeViewMenu presentation={presentation} summary /></div></div>{data?.state === 'ready' ? <LegislativeProfileContent data={data} cityId={cityId} councilorId={councilorId} filters={period} presentation={presentation} /> : data?.state === 'unlinked' || !councilorId ? <p className="text-sm text-content-secondary">A correspondência com o cadastro oficial da Câmara está em conferência. <Link className="text-brand" to={legislativePath(cityId, '/vereadores')}>Consultar fichas oficiais</Link></p> : <LegislativeState query={query} onRetry={() => setRevision(value => value + 1)} />}</section>;
}

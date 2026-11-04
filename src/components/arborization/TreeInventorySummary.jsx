import React, { useState } from 'react';
import { ChevronDown, Leaf, MapPin, Sprout, Trees } from 'lucide-react';
import { useIsMobile } from '@/hooks/useIsMobile';

export default function TreeInventorySummary({ stats, loading, plannedCount, alwaysVisible = false }) {
  const mobile = useIsMobile();
  const [expanded, setExpanded] = useState(false);
  return <section className="arborization-summary" aria-label="Indicadores do inventário filtrado">{!alwaysVisible && <button type="button" className="arborization-summary-toggle" aria-expanded={expanded} aria-controls="arborization-summary-cards" onClick={() => setExpanded(current => !current)}><span><Trees size={17} /><strong>{loading ? '—' : stats.total.toLocaleString('pt-BR')}</strong> registros no inventário</span><span>Indicadores<ChevronDown size={15} className={expanded ? 'rotate-180' : ''} /></span></button>}<div id="arborization-summary-cards" hidden={!alwaysVisible && mobile && !expanded} className="arborization-stats">{[
    [Trees, 'Árvores no inventário', stats.total, 'green', plannedCount ? `${plannedCount.toLocaleString('pt-BR')} com plantio planejado` : 'Registros da cidade'],
    [Leaf, 'Espécie mais plantada', stats.mostPlanted?.name || 'Não identificada', 'green', stats.mostPlanted ? `${stats.mostPlanted.count.toLocaleString('pt-BR')} ${stats.mostPlanted.count === 1 ? 'árvore viva' : 'árvores vivas'}` : 'Sem espécie identificada', stats.mostPlanted?.count],
    [MapPin, 'Bairro menos arborizado', stats.leastWooded?.name || 'Não identificado', 'orange', stats.leastWooded ? `${stats.leastWooded.count.toLocaleString('pt-BR')} árvores vivas cadastradas` : 'Sem bairro identificado'],
    [Sprout, `Plantadas em ${new Date().getFullYear()}`, stats.plantedThisYear, 'green', 'Plantios realizados neste ano'],
  ].map(([Icon, label, value, tone, description, count]) => <div key={label} className="arborization-stat"><div className="arborization-stat-top"><p className="arborization-stat-label">{label}</p><span className={`arborization-stat-icon arborization-tone-${tone}`}><Icon size={18} aria-hidden="true" /></span></div><p className={`arborization-stat-value ${typeof value === 'string' ? 'is-text' : ''}`}>{loading || value == null ? '—' : value.toLocaleString('pt-BR')}</p><p className="arborization-stat-description" data-testid={count != null ? 'most-planted-count' : undefined}>{loading ? 'Carregando…' : description}</p></div>)}</div></section>;
}

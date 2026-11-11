import React from 'react';
import { HelpCircle } from 'lucide-react';

export default function PipaManagementSummary({ tanks, levels, levelFilter, onFilter }) {
  const active=tanks.filter(t=>t.active);
  const options=[['','Todas',tanks.length],['attention','Atenção',active.filter(t=>levels.get(t.id)?.needsAttention).length],['empty','Baixas / vazias',active.filter(t=>levels.get(t.id)?.state==='empty').length],['moderate','Moderadas',active.filter(t=>levels.get(t.id)?.state==='moderate').length],['full','Cheias',active.filter(t=>levels.get(t.id)?.state==='full').length],['unknown','Sem estimativa',active.filter(t=>levels.get(t.id)?.state==='unknown').length],...tanks.length>active.length?[['inactive','Desativadas',tanks.length-active.length]]:[]];
  const optionButton=([id,label,count])=><button type="button" key={id} data-level={id} aria-label={id==='attention'?'Ver prioridades':undefined} aria-pressed={levelFilter===id} onClick={event=>{onFilter(levelFilter===id?'':id);event.currentTarget.closest('.pipa-level-mobile details')?.removeAttribute('open')}}>{id&&<i aria-hidden="true"/>}{label}<span>{count}</span></button>;
  return <div className="pipa-level-filterbar" aria-label="Filtrar caixas por nível">
    <div className="pipa-level-options">{options.map(optionButton)}</div>
    <div className="pipa-level-mobile"><div>{options.slice(0,2).map(optionButton)}</div><details><summary>Níveis{levelFilter && levelFilter!=='attention' ? `: ${options.find(([id])=>id===levelFilter)?.[1]}` : ''}</summary><div>{options.slice(2).map(optionButton)}</div></details></div>
    <details className="pipa-level-help"><summary aria-label="Como o nível é estimado"><HelpCircle size={16}/></summary><p>Estimativa pelo nível informado após a entrega e pelo consumo médio. Sem nível informado, usa os volumes registrados. Cheia: 60% ou mais; moderada: 21% a 59%; baixa: até 20%. Não é medição por sensor.</p></details>
  </div>;
}

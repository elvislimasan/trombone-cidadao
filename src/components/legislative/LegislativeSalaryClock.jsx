import React, { useEffect, useId, useState } from 'react';
import { ArrowUpRight, Pause, Play, Wallet } from 'lucide-react';
import { legislativeDate } from '@/lib/legislative';
import { legislativeAccruedSalary, legislativeCurrentRemuneration } from '@/lib/legislativeRemuneration';
import './legislative-salary-clock.css';

const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

export default function LegislativeSalaryClock({ cityId }) {
  const heading = useId();
  const [now, setNow] = useState(Date.now), [paused, setPaused] = useState(false);
  const policy = legislativeCurrentRemuneration(cityId, now);
  useEffect(() => {
    if (paused || !policy) return;
    const tick = () => { if (!document.hidden) setNow(Date.now()); };
    const timer = window.setInterval(tick, 1000);
    document.addEventListener('visibilitychange', tick);
    return () => { window.clearInterval(timer);document.removeEventListener('visibilitychange', tick); };
  }, [paused, policy]);
  if (!policy) return null;
  const cents = legislativeAccruedSalary(policy, now);
  const parts = money.formatToParts(cents / 100);
  const whole = parts.filter(part => ['integer', 'group'].includes(part.type)).map(part => part.value).join('');
  const fraction = parts.find(part => part.type === 'fraction')?.value;
  return <section className="legislative-salary-clock" aria-labelledby={heading}>
    <header className="legislative-salary-clock-heading"><span className="legislative-salary-clock-icon" aria-hidden="true"><Wallet size={21} /></span><div><h2 id={heading}>Salário pago aos {policy.seats} vereadores desde a posse</h2><span>{policy.term} · desde {legislativeDate(policy.start)}</span></div></header>
    <div className="legislative-salary-clock-main">
      <div className="legislative-salary-clock-context"><span>Estimativa acumulada</span><button type="button" aria-label={paused ? 'Retomar contador de salários' : 'Pausar contador de salários'} aria-pressed={paused} onClick={() => { if (paused) setNow(Date.now());setPaused(value => !value); }}>{paused ? <Play size={14} aria-hidden="true" /> : <Pause size={14} aria-hidden="true" />}{paused ? 'Retomar' : 'Pausar'}</button></div>
      <div className="legislative-salary-clock-value" role="timer" aria-live="off" aria-label={`Salário pago acumulado, estimativa: ${money.format(cents / 100)}`} data-cents={cents}><span className="legislative-salary-clock-currency">R$</span><span>{whole}<span className="legislative-salary-clock-cents">,{fraction}</span></span></div>
      <p className="legislative-salary-clock-note">{paused ? 'Pausado' : 'Atualização a cada segundo'} · pagamentos não confirmados.</p>
    </div>
    <div className="legislative-salary-clock-basis">
      <p>{policy.seats} vereadores × {money.format(policy.monthlyCents / 100)} por mês</p>
      <span>Salário-base de 2025</span>
      <details><summary>Como calculamos e fontes</summary><div>
        <p>Multiplicamos o salário mensal de referência pelos {policy.seats} cargos da Câmara e pelo tempo desde {legislativeDate(policy.start)}. Somamos os meses completos e a fração do mês atual, pelos segundos decorridos no horário de Fortaleza. O contador acompanha o mandato inteiro, independentemente dos filtros de propostas.</p>
        <p>Estimativa de salários brutos, sem confirmação dos pagamentos. Não inclui 13º, adicional de férias, encargos, verbas extras, descontos, revisões anuais ou ajustes por vagas e afastamentos. A movimentação do relógio não representa transferências de dinheiro em tempo real.</p>
        <a href={policy.salarySource} target="_blank" rel="noreferrer">Resolução 8/2023 · salário-base<ArrowUpRight size={14} aria-hidden="true" /></a>
        <a href={policy.termSource} target="_blank" rel="noreferrer">Ata de posse · composição e mandato<ArrowUpRight size={14} aria-hidden="true" /></a>
      </div></details>
    </div>
  </section>;
}

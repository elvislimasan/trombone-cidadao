import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Camera, CheckCircle2, ChevronDown, ClipboardList, Droplets, HeartHandshake, MessageSquare, Sprout } from 'lucide-react';
import { Button } from '@/components/ui/button';
import TreeProgramPhoto from './TreeProgramPhoto';
import './treeJourney.css';

export function TreeJourneyNav({ cityId, active }) {
  const city = cityId ? `cidade=${encodeURIComponent(cityId)}` : '';
  const links = [
    { key: 'adopt', label: 'Adotar uma árvore', description: 'Conheça e solicite', Icon: Sprout, to: `/adote-uma-arvore${city ? `?${city}` : ''}` },
    { key: 'requests', label: 'Meus pedidos', description: 'Acompanhe a equipe', Icon: ClipboardList, to: `/adote-uma-arvore?aba=minhas${city ? `&${city}` : ''}` },
    { key: 'care', label: 'Minhas árvores', description: 'Cuide e veja crescer', Icon: HeartHandshake, to: `/arvores-da-comunidade?aba=minhas${city ? `&${city}` : ''}` },
  ];
  return <nav className="tree-journey-nav" aria-label="Adotar e cuidar de árvores">{links.map(({ key, label, Icon, to }) => <Link key={key} to={to} aria-current={active === key ? 'page' : undefined}><Icon size={17} aria-hidden="true" /><span>{label}</span></Link>)}</nav>;
}

const careOptions = [
  { action: 'watering', Icon: Droplets, title: 'Registre uma rega', text: 'Guarde a data e conte como estava o solo.', detail: 'Observe a umidade do solo e siga a orientação da equipe para a espécie e o clima da sua cidade. Registre aqui a rega que você já realizou.', cta: 'Registrar rega' },
  { action: 'growth', Icon: Camera, title: 'Veja o que mudou', text: 'Uma nova foto ajuda a contar essa história.', detail: 'Fotografe a árvore de um ângulo parecido com o registro anterior. Conte se percebeu novas folhas, flores ou outras mudanças.', cta: 'Registrar crescimento' },
  { action: 'observation', Icon: MessageSquare, title: 'Observe com atenção', text: 'Folhas, tronco e entorno também contam.', detail: 'Anote o que chamou sua atenção. O diário registra suas observações; para solicitar atendimento, use os canais da equipe municipal.', cta: 'Registrar observação' },
];

export function TreeCareGuide({ onRecord, compact = false }) {
  if (compact) return <section className="tree-care-guide is-compact" aria-label="Registrar um cuidado"><h3>Adicionar ao diário</h3><div className="tree-care-quick-actions">{careOptions.map(({ action, Icon, cta }) => <Button type="button" variant="outline" key={action} onClick={() => onRecord?.(action)}><Icon size={17} aria-hidden="true" />{cta.replace('Registrar ', '')}</Button>)}</div></section>;
  return <section className="tree-care-guide" aria-label="Cuidados com sua árvore"><div className="tree-care-guide-overview"><div className="tree-section-heading"><div><h2>Cuidados com sua árvore</h2></div><p>Registre o que foi realizado e acompanhe o crescimento no diário.</p></div><TreeProgramPhoto name="rega" alt="Pessoa regando uma muda junto à base da planta." className="tree-care-guide-photo" sizes="(max-width: 767px) 112px, 176px" /></div><div className="tree-care-guide-grid">{careOptions.map(({ action, Icon, title, text, detail, cta }) => <article key={action}><span className={`tree-care-guide-icon is-${action}`}><Icon size={21} aria-hidden="true" /></span><h3>{title}</h3><p>{text}</p><details><summary>Como acompanhar<ChevronDown size={15} aria-hidden="true" /></summary><p>{detail}</p></details>{onRecord && <Button type="button" variant="outline" onClick={() => onRecord(action)}>{cta}<ArrowRight size={15} aria-hidden="true" /></Button>}</article>)}</div><p className="tree-care-guide-note">Siga as orientações da equipe para a espécie e o local de plantio.</p></section>;
}

export function TreeCareSummary({ tree, care }) {
  const latest = care.filter(row => !row.is_hidden).reduce((date, row) => row.performed_on > date ? row.performed_on : date, '');
  const total = Number(tree.care_count) || 0;
  return <section className="tree-care-summary" aria-label="Resumo do acompanhamento"><div><span className="tree-care-summary-icon"><Sprout size={20} aria-hidden="true" /></span><span><strong>{total}</strong><small>{total === 1 ? 'cuidado registrado' : 'cuidados registrados'}</small></span></div><div><CheckCircle2 size={20} aria-hidden="true" /><span><strong>{latest ? new Date(`${latest}T12:00:00`).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }) : 'Sem registros'}</strong><small>{latest ? 'último cuidado no histórico carregado' : 'adicione o primeiro cuidado ao diário'}</small></span></div><p>{total ? 'Abra o diário para consultar fotos e observações dos cuidados.' : 'Adicione uma rega, uma foto do crescimento ou uma observação.'}</p></section>;
}

export function TreePlantingNextStep({ cityId }) {
  return <section className="tree-planting-next"><span className="tree-care-summary-icon"><Sprout size={24} aria-hidden="true" /></span><div><h3>Já plantou? Comece o diário da sua árvore.</h3><p>Cadastre uma foto e o local para acompanhar o crescimento e guardar os cuidados.</p></div><Button asChild variant="outline"><Link to={`/arvores-da-comunidade/nova${cityId ? `?cidade=${cityId}` : ''}`}>Cadastrar árvore<ArrowRight size={16} aria-hidden="true" /></Link></Button></section>;
}

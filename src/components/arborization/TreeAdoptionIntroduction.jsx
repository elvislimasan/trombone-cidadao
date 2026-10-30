import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, ChevronDown, MapPin, ShieldCheck, Sprout } from 'lucide-react';
import { Button } from '@/components/ui/button';
import './treeAdoptionIntroduction.css';

export function GrowingTree() {
  return <svg className="adoption-growing-tree" viewBox="0 0 640 400" fill="none" role="img" aria-label="Uma árvore dando sombra a um banco e a pequenas plantas na cidade">
    <circle cx="455" cy="105" r="54" fill="rgb(var(--brand) / .09)" />
    <path d="M70 295h70v-76h61v76h27V183h75v112h35V231h80v64h29V196h66v99h43" stroke="rgb(var(--text-secondary) / .13)" strokeWidth="3" strokeLinejoin="round" />
    <ellipse cx="320" cy="340" rx="258" ry="28" fill="rgb(var(--success-fg) / .08)" />
    <path d="M291 330V162m0 91-65-55m65 23 65-62" stroke="rgb(var(--text-secondary))" strokeWidth="12" strokeLinecap="round" />
    <path d="M179 192c-47-8-51-73-10-91-5-48 50-78 87-52 29-45 99-33 111 16 52-7 88 45 60 87 30 52-23 96-71 74-42 35-84 14-99-10-30 18-62 6-78-24Z" fill="rgb(var(--success-bg))" />
    <path d="M179 192c-47-8-51-73-10-91-5-48 50-78 87-52 29-45 99-33 111 16 52-7 88 45 60 87 30 52-23 96-71 74-42 35-84 14-99-10-30 18-62 6-78-24Z" fill="rgb(var(--success-fg) / .17)" stroke="rgb(var(--success-fg) / .45)" strokeWidth="2" />
    <path d="M291 217v-79m0 46-39-35m39 15 45-42" stroke="rgb(var(--success-fg) / .65)" strokeWidth="5" strokeLinecap="round" />
    <g stroke="rgb(var(--text-secondary))" strokeWidth="5" strokeLinecap="round"><path d="M385 292h111m-105-17h100m-100-15h100m-96 32v34m92-34v34" /></g>
    <path d="M132 334v-35m0 15c-27 1-33-15-32-27 20-1 32 8 32 27Zm1-12c0-21 16-29 32-27 0 19-11 29-32 27Z" fill="rgb(var(--success-fg) / .3)" stroke="rgb(var(--success-fg))" strokeWidth="2" strokeLinejoin="round" />
    <path d="M528 335v-23m0 9c-18 0-24-10-23-20 15 0 23 6 23 20Zm1-8c0-14 11-20 23-18-1 13-9 20-23 18Z" fill="rgb(var(--success-fg) / .25)" stroke="rgb(var(--success-fg))" strokeWidth="2" strokeLinejoin="round" />
    <path d="m450 165 9-6 9 6m-357-7 8-5 8 5" stroke="rgb(var(--text-secondary) / .4)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M252 337h86m-43-8-8 9m21-9 8 9" stroke="rgb(var(--text-secondary) / .4)" strokeWidth="3" strokeLinecap="round" />
  </svg>;
}

export function TreeAdoptionHomeSection({ cityId }) {
  const url = new URLSearchParams();
  if (cityId) url.set('cidade', String(cityId));
  const overviewTo = '/adote-uma-arvore' + (url.size ? `?${url}` : '');
  url.set('aba', 'solicitar');
  return <section className="adoption-home-section" aria-label="Programa Adote uma árvore">
    <div className="adoption-home-copy"><p className="adoption-program-eyebrow"><Sprout size={16} aria-hidden="true" />Adote uma árvore</p><h2>Uma muda hoje.<br />Mais vida para a cidade.</h2><p>Mais sombra, espaços acolhedores e um cuidado que cresce com você. Conheça o programa e solicite uma muda ou apoio no plantio na sua cidade.</p><div className="adoption-program-actions"><Button asChild><Link to={overviewTo}>Conhecer o programa<ArrowRight size={16} aria-hidden="true" /></Link></Button><Button asChild variant="outline"><Link to={`/adote-uma-arvore?${url}`}>Fazer uma solicitação</Link></Button></div><span className="adoption-program-note">Você pode conhecer o programa sem entrar na sua conta.</span></div>
    <div className="adoption-home-art"><GrowingTree /></div>
  </section>;
}

export default function TreeAdoptionIntroduction({ city, onStart }) {
  return <div className="adoption-program" data-testid="adoption-program">
    <section className="adoption-program-hero" aria-labelledby="adoption-program-title">
      <div className="adoption-program-hero-copy">
        <h2 id="adoption-program-title">Uma muda hoje.<br /><span>Mais vida amanhã.</span></h2>
        <p>Solicite uma muda ou apoio para plantar em {city?.name || 'sua cidade'}.</p>
        <div className="adoption-program-actions">
          <Button onClick={onStart}>Começar solicitação<ArrowRight size={17} aria-hidden="true" /></Button>
          <a className="adoption-how-link" href="#como-adotar-uma-arvore">Como funciona<ChevronDown size={16} aria-hidden="true" /></a>
        </div>
        <p className="adoption-program-note"><ShieldCheck size={15} aria-hidden="true" />Retirada e plantio após confirmação da equipe.</p>
      </div>
      <div className="adoption-program-hero-art" aria-hidden="true"><GrowingTree /></div>
    </section>

    <section className="adoption-program-participate" id="como-adotar-uma-arvore" aria-labelledby="adoption-participate-title">
      <h2 id="adoption-participate-title">Como funciona</h2>
      <ol className="adoption-program-steps">{[
        { Icon: MapPin, title: 'Faça seu pedido', text: 'Indique o local e escolha as espécies.' },
        { Icon: ShieldCheck, title: 'Aguarde a confirmação', text: 'A equipe avalia o pedido e orienta você.' },
        { Icon: Sprout, title: 'Plante e cuide', text: 'Retire a muda ou acompanhe o plantio agendado.' },
      ].map(({ Icon, title, text }, index) => <li key={title}>
        <div className="adoption-program-step-mark"><span className="adoption-program-step-icon"><Icon size={25} aria-hidden="true" /></span><span className="adoption-program-step-number">0{index + 1}</span></div>
        <h3>{title}</h3><p>{text}</p>
      </li>)}</ol>
    </section>

    <section className="adoption-program-faq" aria-labelledby="adoption-faq-title">
      <h2 id="adoption-faq-title">Dúvidas rápidas</h2>
      <div>{[
        ['Quem pode participar?', 'Entre na sua conta para solicitar e acompanhar o pedido. O atendimento depende da disponibilidade na cidade selecionada.'],
        ['Quando posso retirar ou plantar?', 'Aguarde a confirmação da equipe. Em calçadas, praças e outros espaços públicos, o plantio precisa de autorização.'],
        ['E depois do plantio?', 'Você se compromete a cuidar da muda e seguir as orientações de rega e manutenção.'],
      ].map(([question, answer]) => <details key={question}><summary>{question}<ChevronDown size={17} aria-hidden="true" /></summary><p>{answer}</p></details>)}</div>
    </section>
  </div>;
}

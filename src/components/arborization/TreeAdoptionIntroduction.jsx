import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Bird, Droplets, HeartHandshake, Leaf, MapPin, ShieldCheck, Sprout, Sun, Trees } from 'lucide-react';
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

const benefits = [
  { Icon: Sun, title: 'Mais sombra e conforto', text: 'Árvores tornam os caminhos e os espaços de convivência mais acolhedores nos dias de sol.' },
  { Icon: Bird, title: 'Mais vida no bairro', text: 'Flores, frutos e copas oferecem abrigo e alimento para aves e outros pequenos animais.' },
  { Icon: HeartHandshake, title: 'Um cuidado compartilhado', text: 'Cuidar de uma muda aproxima as pessoas e ajuda a valorizar os espaços onde a comunidade vive.' },
];

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
      <div className="adoption-program-hero-copy"><p className="adoption-program-eyebrow"><Leaf size={16} aria-hidden="true" />Um convite para cuidar do lugar onde você vive</p><h2 id="adoption-program-title">Uma muda hoje.<br /><span>Mais vida amanhã.</span></h2><p>Uma árvore faz parte da história de uma rua, de um quintal, de uma comunidade. Dê o primeiro passo para deixar {city?.name || 'a sua cidade'} mais verde: solicite uma muda ou apoio para o plantio.</p><div className="adoption-program-actions"><Button onClick={onStart}>Quero participar<ArrowRight size={17} aria-hidden="true" /></Button><Button asChild variant="outline"><a href="#como-adotar-uma-arvore">Como funciona</a></Button></div><p className="adoption-program-note"><ShieldCheck size={15} aria-hidden="true" />A equipe avalia o local e confirma a espécie e a disponibilidade.</p></div>
      <div className="adoption-program-hero-art"><GrowingTree /><span className="adoption-program-art-caption"><Sprout size={18} aria-hidden="true" />Um cuidado que cria raízes.</span></div>
    </section>

    <section className="adoption-program-benefits" aria-label="Por que adotar uma árvore?">{benefits.map(({ Icon, title, text }) => <article key={title}><span className="adoption-program-icon"><Icon size={22} aria-hidden="true" /></span><h3>{title}</h3><p>{text}</p></article>)}</section>

    <section className="adoption-program-participate" id="como-adotar-uma-arvore" aria-labelledby="adoption-participate-title"><div className="adoption-program-section-heading"><p className="adoption-program-eyebrow">Como participar</p><h2 id="adoption-participate-title">Escolha como você quer fazer parte.</h2><p>O pedido começa com você. A equipe ajuda a definir os próximos passos.</p></div><div className="adoption-program-options">
      <article><span className="adoption-program-icon"><Sprout size={25} aria-hidden="true" /></span><h3>Uma muda para você plantar</h3><p>Escolha entre as espécies disponíveis e informe onde pretende plantar. Após a confirmação, você recebe as orientações de retirada e fica responsável pelo plantio e pelos cuidados.</p><Button variant="outline" onClick={onStart}>Solicitar uma muda<ArrowRight size={16} aria-hidden="true" /></Button></article>
      <article><span className="adoption-program-icon"><Trees size={25} aria-hidden="true" /></span><h3>Plantio com apoio da equipe</h3><p>Indique o local desejado. A equipe avalia o espaço, a espécie e as condições para o plantio. Se o pedido for aprovado, o atendimento segue para confirmação e agendamento.</p><Button variant="outline" onClick={onStart}>Solicitar plantio<ArrowRight size={16} aria-hidden="true" /></Button></article>
    </div><ol className="adoption-program-steps">{[
      ['01', 'Mostre o local', 'Informe o espaço e marque o ponto no mapa.'],
      ['02', 'Escolha a espécie', 'Consulte as opções e os fornecedores disponíveis.'],
      ['03', 'Aguarde a avaliação', 'A equipe confere o pedido e orienta você.'],
      ['04', 'Cuide e acompanhe', 'Veja o andamento em Minhas solicitações.'],
    ].map(([number, title, text]) => <li key={number}><span>{number}</span><div><h3>{title}</h3><p>{text}</p></div></li>)}</ol></section>

    <section className="adoption-program-care" aria-labelledby="adoption-care-title"><div><p className="adoption-program-eyebrow"><HeartHandshake size={16} aria-hidden="true" />Depois do plantio</p><h2 id="adoption-care-title">Adotar é acompanhar o crescimento.</h2><p>A muda precisa de atenção para crescer bem. Siga as orientações da equipe e escolha um espaço que possa acolher a árvore ao longo dos anos.</p></div><ul><li><Droplets size={20} aria-hidden="true" /><span>Rega e acompanhamento conforme as orientações recebidas.</span></li><li><MapPin size={20} aria-hidden="true" /><span>Espaço adequado para as raízes e para o crescimento da copa.</span></li><li><ShieldCheck size={20} aria-hidden="true" /><span>Avaliação da fiação aérea, das calçadas e do acesso ao local.</span></li></ul></section>

    <section className="adoption-program-faq" aria-labelledby="adoption-faq-title"><div className="adoption-program-section-heading"><p className="adoption-program-eyebrow">Antes de começar</p><h2 id="adoption-faq-title">Algumas dúvidas, respondidas.</h2></div><div>{[
      ['Preciso ter uma conta?', 'A apresentação é aberta a todos. Para preencher, enviar e acompanhar sua solicitação, entre na sua conta.'],
      ['Posso retirar a muda assim que enviar?', 'Aguarde a confirmação da equipe. A solicitação depende da avaliação do local, da espécie e da disponibilidade do fornecedor. As orientações de retirada aparecem no acompanhamento do pedido.'],
      ['Posso indicar uma calçada ou uma praça?', 'Sim, você pode indicar um espaço público para avaliação. O plantio nesses locais depende da autorização da equipe responsável. Informe também se há fiação aérea sobre o local.'],
      ['E se não houver mudas disponíveis?', 'Consulte a disponibilidade no formulário. Quando não houver opções na cidade, você poderá solicitar um aviso e acompanhar as próximas ofertas.'],
    ].map(([question, answer]) => <details key={question}><summary>{question}</summary><p>{answer}</p></details>)}</div></section>

    <section className="adoption-program-final"><span className="adoption-program-icon"><Sprout size={28} aria-hidden="true" /></span><div><h2>O próximo lugar com mais sombra pode começar com você.</h2><p>Conte onde você quer plantar. A equipe acompanha os próximos passos.</p></div><Button onClick={onStart}>Começar minha solicitação<ArrowRight size={17} aria-hidden="true" /></Button></section>
  </div>;
}

import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Camera, ChevronDown, ChevronRight, ClipboardList, Droplets, MessageCircle, ShieldCheck, Sprout } from 'lucide-react';
import { Button } from '@/components/ui/button';
import TreeProgramPhoto from './TreeProgramPhoto';

export function BotanicalAccent({ className = '' }) {
  return <svg className={`adoption-botanical ${className}`} viewBox="0 0 180 300" fill="none" aria-hidden="true" focusable="false">
    <path d="M24 298C73 229 60 156 119 78c14-20 23-45 28-72" stroke="currentColor" strokeWidth="2" />
    <g fill="currentColor"><path d="M52 244C9 237 3 207 3 187c34 2 53 22 49 57Z" /><path d="M62 208c-3-36 20-63 58-66-2 35-25 59-58 66Z" /><path d="M76 166C40 163 26 140 23 110c35 4 57 22 53 56Z" /><path d="M97 123c0-33 25-54 59-57-6 30-27 51-59 57Z" /><path d="M126 65C96 60 86 37 88 12c30 8 44 25 38 53Z" /><path d="M140 38c6-27 19-36 39-38-3 25-16 39-39 38Z" /></g>
    <g stroke="currentColor" strokeWidth="1"><path d="m51 243-34-40m46 4 43-32m-30-10-39-42m61-1 41-39m-13-19-27-37" /></g>
  </svg>;
}

export function AdoptionProgramSteps() {
  const steps = [
    { Icon: ClipboardList, title: 'Solicite', text: 'Informe o local, escolha as mudas e confirme seus contatos.' },
    { Icon: ShieldCheck, title: 'Aguarde a análise', text: 'Confira o pedido e aguarde a autorização para retirar a muda ou plantar.' },
    { Icon: Sprout, title: 'Plante e acompanhe', text: 'Depois do plantio, registre os cuidados e acompanhe a evolução no diário.' },
  ];
  return <section className="adoption-program-participate" id="como-adotar-uma-arvore" aria-labelledby="adoption-participate-title">
    <div className="adoption-steps-intro"><h2 id="adoption-participate-title">Como funciona</h2><p>Do pedido ao plantio, um processo simples e transparente.</p></div>
    <ol className="adoption-program-steps">{steps.map(({ Icon, title, text }, index) => <li key={title}>
      <span className="adoption-program-step-icon"><Icon size={23} aria-hidden="true" /></span>
      <div><span className="adoption-program-step-number">0{index + 1}</span><h3>{title}</h3><p>{text}</p></div>
    </li>)}</ol>
  </section>;
}

export function AdoptionExistingTree({ cityId }) {
  const city = cityId ? `?cidade=${encodeURIComponent(cityId)}` : '';
  return <section className="adoption-existing-tree" aria-labelledby="adoption-existing-title">
    <TreeProgramPhoto name="rega" alt="Uma pessoa cuidando de uma muda recém-plantada." className="adoption-registration-photo" sizes="(max-width: 599px) 140px, (max-width: 979px) 240px, 320px" />
    <div className="adoption-existing-copy"><span className="adoption-existing-icon"><Sprout size={21} aria-hidden="true" /></span><h2 id="adoption-existing-title">Já tem uma árvore?</h2><p>Cadastre a árvore que você plantou ou já cuida para registrar fotos, regas e acompanhar seu crescimento.</p>
      <Button asChild><Link to={`/arvores-da-comunidade/nova${city}`}>Cadastrar minha árvore<ArrowRight size={17} aria-hidden="true" /></Link></Button>
      <Link className="adoption-community-link" to={`/arvores-da-comunidade${city}`}>Explorar árvores da comunidade<ArrowRight size={15} aria-hidden="true" /></Link>
    </div><BotanicalAccent />
  </section>;
}

export function AdoptionCareActions({ cityId }) {
  const path = `/arvores-da-comunidade?aba=minhas${cityId ? `&cidade=${encodeURIComponent(cityId)}` : ''}`;
  return <section className="adoption-care-actions" aria-labelledby="adoption-care-title"><BotanicalAccent />
    <header><h2 id="adoption-care-title">Cuide da sua árvore</h2><p>Escolha uma árvore para registrar os cuidados e acompanhar seu crescimento.</p></header>
    <ul>{[
      { Icon: Droplets, title: 'Registrar uma rega', text: 'Guarde a data e conte como estava o solo.' },
      { Icon: Camera, title: 'Adicionar foto', text: 'Uma nova foto ajuda a contar essa história.' },
      { Icon: ClipboardList, title: 'Diário de cuidados', text: 'Consulte as fotos e observações da sua árvore.' },
    ].map(({ Icon, title, text }) => <li key={title}><Link to={path}><span className="adoption-care-action-icon"><Icon size={22} aria-hidden="true" /></span><span><strong>{title}</strong><small>{text}</small></span><ChevronRight size={18} aria-hidden="true" /></Link></li>)}</ul>
  </section>;
}

export function AdoptionProgramFaq({ cityName }) {
  return <section className="adoption-program-faq" aria-labelledby="adoption-faq-title">
    <div className="adoption-faq-intro"><span><MessageCircle size={29} aria-hidden="true" /></span><div><h2 id="adoption-faq-title">Dúvidas frequentes</h2><p>Veja as respostas para as principais perguntas sobre o programa de arborização{cityName ? ` em ${cityName}` : ''}.</p></div></div>
    <div className="adoption-faq-questions">{[
      ['Quem pode participar?', 'Entre na sua conta para solicitar e acompanhar o pedido. O atendimento depende da disponibilidade na cidade selecionada.'],
      ['Quando posso retirar ou plantar?', 'Aguarde a confirmação da equipe. Em calçadas, praças e outros espaços públicos, o plantio precisa de autorização.'],
      ['Já tenho uma árvore. Posso participar?', 'Sim. Cadastre uma foto e a localização em “Cadastrar minha árvore”. Você pode começar o diário de cuidados enquanto a equipe analisa o cadastro.'],
      ['E depois do plantio?', 'Cadastre sua árvore em “Minhas árvores” e registre regas, fotos do crescimento e observações. Siga as orientações da equipe para cuidar da espécie. Você escolhe quais registros compartilhar.'],
    ].map(([question, answer]) => <details key={question}><summary>{question}<ChevronDown size={16} aria-hidden="true" /></summary><p>{answer}</p></details>)}</div>
    <BotanicalAccent />
  </section>;
}

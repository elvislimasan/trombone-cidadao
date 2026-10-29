import React from 'react';
import { Bird, HeartHandshake, Leaf, ShieldCheck, Sun } from 'lucide-react';
import { GrowingTree } from './TreeAdoptionIntroduction';

const guidance = [
  ['Comece do seu jeito', 'Receba mudas para plantar ou solicite apoio da equipe. Você pode pedir mais de uma árvore.'],
  ['O lugar faz a diferença', 'Marque o ponto exato e informe o espaço e a fiação. A equipe avalia as condições para o plantio.'],
  ['Uma escolha que cria raízes', 'Compare as espécies, informe as quantidades e escolha o fornecedor. A equipe confirma a disponibilidade.'],
  ['Tudo pronto para crescer', 'Confira os dados e confirme seu compromisso de cuidado. Depois, acompanhe as orientações em Minhas solicitações.'],
];

export default function TreeAdoptionWelcome({ cityName, step = 0 }) {
  const [title, description] = guidance[step] || guidance[0];
  return <aside className="adoption-welcome" aria-label="Um cuidado que cria raízes">
    <div className="adoption-welcome-heading">
      <p className="adoption-welcome-eyebrow"><Leaf size={15} aria-hidden="true" />Um cuidado que cria raízes</p>
      <h2>Uma muda hoje.<br /><span>Mais vida amanhã.</span></h2>
      <p>Mais sombra, mais vida e novos caminhos para {cityName || 'a sua cidade'}.</p>
    </div>
    <div className="adoption-welcome-art" aria-hidden="true"><GrowingTree /></div>
    <div className="adoption-welcome-guidance"><span>Etapa {step + 1} de 4</span><h3>{title}</h3><p>{description}</p></div>
    <div className="adoption-welcome-benefits" aria-label="Benefícios da arborização"><span><Sun size={18} aria-hidden="true" />Mais sombra</span><span><Bird size={18} aria-hidden="true" />Mais vida</span><span><HeartHandshake size={18} aria-hidden="true" />Mais cuidado</span></div>
    <p className="adoption-welcome-note"><ShieldCheck size={16} aria-hidden="true" />Cada pedido recebe avaliação da equipe de arborização.</p>
  </aside>;
}

import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import TreeProgramPhoto from './TreeProgramPhoto';

export default function TreeRegistrationHeader({ editing, treeId, cityId }) {
  const back = editing ? `/arvores-da-comunidade/${encodeURIComponent(treeId)}` : `/arvores-da-comunidade?aba=minhas${cityId ? `&cidade=${encodeURIComponent(cityId)}` : ''}`;
  return <header className="tree-registration-header"><div><Link to={back}><ArrowLeft size={16} aria-hidden="true" />{editing ? 'Voltar à árvore' : 'Minhas árvores'}</Link><h1>{editing ? 'Editar árvore' : 'Cadastrar árvore'}</h1><p>Uma foto. Um lugar. Uma história para cuidar.</p></div><TreeProgramPhoto name="rega" alt="Cuidado com uma muda em crescimento. Imagem do programa de arborização." className="tree-registration-header-photo" sizes="(max-width: 767px) 120px, 400px" loading="eager" /></header>;
}

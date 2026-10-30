import React from 'react';
import { Link } from 'react-router-dom';
import { ClipboardList, Sprout } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { TREE_ADOPTION_MANAGEMENT_PATH } from '@/lib/treeAdoption';
import './treeAdoptionCard.css';

export default function TreeAdoptionCard({ canManage, managementTo = TREE_ADOPTION_MANAGEMENT_PATH }) {
  return <nav className="tree-adoption-card" aria-label="Programa Adote uma árvore">
    <Button asChild variant="outline" className="tree-adoption-card-primary"><Link to="/adote-uma-arvore" title="Solicite uma muda ou plantio e acompanhe a avaliação da equipe"><Sprout aria-hidden="true" />Adote uma árvore</Link></Button>
    <Button asChild variant="outline"><Link to="/arvores-da-comunidade"><Sprout aria-hidden="true" />Árvores da comunidade</Link></Button>
  </nav>;
}

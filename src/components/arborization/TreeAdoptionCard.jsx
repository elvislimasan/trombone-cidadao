import React from 'react';
import { Link } from 'react-router-dom';
import { Sprout } from 'lucide-react';
import { Button } from '@/components/ui/button';
import './treeAdoptionCard.css';

export default function TreeAdoptionCard({ cityId }) {
  const citySearch = cityId ? `?cidade=${encodeURIComponent(cityId)}` : '';
  return <nav className="tree-adoption-card" aria-label="Programa Adote uma árvore">
    <Button asChild variant="outline" className="tree-adoption-card-primary"><Link to={`/adoteumaarvore${citySearch}`} title="Solicite uma muda ou plantio e acompanhe a avaliação da equipe"><Sprout aria-hidden="true" />Adote uma árvore</Link></Button>
    <Button asChild variant="outline"><Link to={`/arvores-da-comunidade${citySearch}`}><Sprout aria-hidden="true" />Árvores da comunidade</Link></Button>
  </nav>;
}

import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Leaf } from 'lucide-react';
import CitySelector from '@/components/CitySelector';
import TreeProgramPhoto from './TreeProgramPhoto';
import './treeCollections.css';

export function TreeCollectionToolbar() {
  return <div className="tree-collection-toolbar"><Link to="/mapa-arborizacao"><ArrowLeft size={18} aria-hidden="true" /><span>Arborização</span></Link><CitySelector /></div>;
}

export default function TreeCollectionIntro({ title, description, photo = 'tree', children }) {
  return <header className={`tree-collection-intro is-${photo}`}>
    <TreeProgramPhoto name={photo} alt={photo === 'tree' ? 'Árvores em uma praça, iluminadas pelo sol.' : 'Uma muda recebendo cuidados e água.'} className="tree-collection-intro-photo" sizes="100vw" loading="eager" />
    <div className="tree-collection-intro-copy"><p><Leaf size={15} aria-hidden="true" />Adote uma árvore</p><h1>{title}</h1>{description && <span>{description}</span>}{children && <div className="tree-collection-intro-action">{children}</div>}</div>
  </header>;
}

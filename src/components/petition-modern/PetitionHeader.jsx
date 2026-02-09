import React from 'react';
import { Calendar } from 'lucide-react';
import PropTypes from 'prop-types';

/**
 * Header component for the petition page.
 * Displays the petition title, category tag, and creation date.
 *
 * @component
 * @param {Object} props - Component props
 * @param {string} props.title - The title of the petition
 * @param {string} props.createdAt - The ISO date string of when the petition was created
 * @param {string} [props.className] - Optional CSS classes to apply to the container
 * @returns {JSX.Element} The rendered header component
 * 
 * @example
 * <PetitionHeader 
 *   title="Salvem as Baleias" 
 *   createdAt="2023-01-01T12:00:00Z" 
 * />
 */
const PetitionHeader = ({ title, createdAt, className = "" }) => {
  return (
    <div className={`space-y-4 ${className}`} data-testid="petition-header">
      <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
        <span className="px-3 py-1 rounded-full bg-primary/10 text-primary border border-primary/20 text-xs font-bold uppercase tracking-wider">
          Petição
        </span>
        <span>•</span>
        <span className="flex items-center gap-1">
          <Calendar className="w-3.5 h-3.5" /> 
          {new Date(createdAt).toLocaleDateString('pt-BR', { 
            day: 'numeric', 
            month: 'long', 
            year: 'numeric' 
          })}
        </span>
      </div>
      
      <h1 className="text-3xl md:text-4xl xl:text-5xl/tight font-extrabold tracking-tight text-foreground max-w-4xl">
        {title}
      </h1>
    </div>
  );
};

PetitionHeader.propTypes = {
  title: PropTypes.string.isRequired,
  createdAt: PropTypes.string.isRequired,
  className: PropTypes.string,
};

export default PetitionHeader;

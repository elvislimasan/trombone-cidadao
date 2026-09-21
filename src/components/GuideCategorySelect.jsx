import React from 'react';
import { Combobox } from '@/components/ui/combobox';
import { Button } from '@/components/ui/button';

export default function GuideCategorySelect({ options, value = [], onChange }) {
  const ids = value.map(String);
  return <div className="space-y-2">
    <Combobox modal options={options.filter((option) => !ids.includes(String(option.value)))} value="" onChange={(id) => onChange([...value, id])} placeholder="Adicionar categoria" searchPlaceholder="Buscar categoria..." notFoundText="Nenhuma categoria disponível" />
    <div className="flex flex-wrap gap-2">{value.map((id) => <Button key={id} type="button" variant="secondary" size="sm" onClick={() => onChange(value.filter((current) => String(current) !== String(id)))} aria-label={`Remover ${options.find((option) => String(option.value) === String(id))?.label || 'categoria'}`}>
      {options.find((option) => String(option.value) === String(id))?.label || 'Categoria'} ×
    </Button>)}</div>
  </div>;
}

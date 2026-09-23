import React from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { formatPhone } from '@/lib/utils';

export default function GuidePhoneFields({ phones = [''], onChange, required = false }) {
  const values = phones.length > 0 ? phones : [''];
  const update = (index, value) => onChange(values.map((phone, itemIndex) => (
    itemIndex === index ? formatPhone(value) : phone
  )));
  const remove = (index) => onChange(values.filter((_, itemIndex) => itemIndex !== index));
  return <fieldset className="grid gap-2">
    <legend className="text-sm font-medium">Telefones</legend>
    {values.map((phone, index) => <div key={index} className="flex items-center gap-2">
      <div className="min-w-0 flex-1">
        <Label htmlFor={`guide-phone-${index}`} className="sr-only">Telefone {index + 1}</Label>
        <Input id={`guide-phone-${index}`} type="tel" inputMode="numeric" value={formatPhone(phone)} onChange={(event) => update(index, event.target.value)} placeholder={index === 0 ? '(87) 99999-8888' : '(87) 3333-4444'} maxLength={15} required={required && index === 0} />
      </div>
      {values.length > 1 && <Button type="button" variant="ghost" size="icon" className="shrink-0 text-destructive" aria-label={`Remover telefone ${index + 1}`} onClick={() => remove(index)}><Trash2 className="h-4 w-4" /></Button>}
    </div>)}
    <Button type="button" variant="outline" size="sm" className="w-fit gap-2" onClick={() => onChange([...values, ''])}><Plus className="h-4 w-4" /> Adicionar telefone</Button>
  </fieldset>;
}

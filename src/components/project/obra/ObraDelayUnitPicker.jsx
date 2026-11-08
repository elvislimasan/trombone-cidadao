import React, { useId } from 'react';
import { getAvailableWorkDelayUnits, resolveWorkDelayUnit, WORK_DELAY_UNITS } from '@/lib/workDelayMetric';

export default function ObraDelayUnitPicker({ value, onChange, computed, disabled = false }) {
  const name = useId();
  const available = getAvailableWorkDelayUnits(computed);
  const selectedUnit = resolveWorkDelayUnit(computed, value);
  return <fieldset disabled={disabled}>
    <legend className="mb-2 text-sm font-semibold">Unidade</legend>
    <div className="grid grid-cols-3 gap-2">
      {WORK_DELAY_UNITS.map(unit => <label key={unit.id} title={available.includes(unit.id) ? undefined : unit.id === 'months' ? 'Disponível para períodos de pelo menos um mês completo.' : 'Disponível para períodos de pelo menos um ano completo.'} className={`flex min-h-11 items-center justify-center gap-2 rounded-xl border px-2 py-2 text-sm font-semibold focus-within:ring-2 focus-within:ring-brand ${available.includes(unit.id) ? 'cursor-pointer' : 'cursor-not-allowed opacity-40'} ${selectedUnit === unit.id ? 'border-brand bg-brand/5' : 'border-edge-default'}`}>
        <input type="radio" name={name} data-delay-unit={unit.id} value={unit.id} disabled={!available.includes(unit.id)} checked={selectedUnit === unit.id} onChange={() => onChange(unit.id)} className="accent-brand" />{unit.label}
      </label>)}
    </div>
  </fieldset>;
}

import React, { useState } from 'react';

export default function PipaDeliveryLevel({ value, onChange, disabled = false }) {
  const [mode, setMode] = useState(value === '' || value == null ? 'unknown' : Number(value) === 100 ? 'full' : 'custom');
  return <div className="pipa-delivery-level pipa-wide">
    <label className="pipa-field"><span>Como a caixa ficou após a entrega?</span><select className="pipa-input" disabled={disabled} value={mode} onChange={event => { const next=event.target.value; setMode(next); onChange(next==='full' ? 100 : ''); }}><option value="unknown">Não sei informar</option><option value="full">Ficou cheia (100%)</option><option value="custom">Informar nível aproximado</option></select></label>
    {mode==='custom' && <label className="pipa-field"><span>Nível após a entrega (%)</span><input name="level_after_percent" className="pipa-input" type="number" inputMode="numeric" min={0} max={100} step={1} required placeholder="Ex.: 75" disabled={disabled} value={value ?? ''} onChange={event => onChange(event.target.value)} /></label>}
    <p className="pipa-note">{mode==='full' ? 'A estimativa de consumo partirá de uma caixa cheia, mesmo se a carrada apenas completou o nível.' : mode==='custom' ? 'Informe o nível observado depois de abastecer.' : 'Sem essa informação, a estimativa usa apenas os volumes registrados.'}</p>
  </div>;
}

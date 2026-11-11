import React, { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import WizardProgress from '@/components/ui/wizard-progress';
import MunicipalDrawer from './MunicipalDrawer';
import PipaLocationFields from './PipaLocationFields';
import PipaDeliveryLevel from './PipaDeliveryLevel';
import { pipaCoordinates, pipaDay, pipaMaskCpf, pipaMonth, pipaPhoneDigits, pipaValidCpf, pipaValidPhone, PIPA_PROVIDERS, PIPA_KINDS } from '@/lib/pipa';
import { formatPhone } from '@/lib/utils';
import { createPipaLogin, pipaRpc } from '@/lib/pipaApi';

export function PipaField({ label, children, wide = false }) {
  return <label className={`pipa-field${wide ? ' pipa-wide' : ''}`}><span>{label}</span>{children}</label>;
}
export function PipaSelect({ label, value, onChange, children, required = true, disabled = false }) {
  return <PipaField label={label}><select className="pipa-input" required={required} value={value || ''} onChange={e => onChange(e.target.value)} disabled={disabled}>{children}</select></PipaField>;
}
const titles = { tank: 'Caixa d’água', driver: 'Pipeiro', request: 'Solicitar abastecimento', manual: 'Lançar abastecimento', quota: 'Cota mensal', login: 'Criar login', dispatch: 'Direcionar entrega' };
const TANK_STEPS = ['Caixa', 'Localização', 'Responsável'];
const FIELD_PLACEHOLDERS = {
  locality: 'Ex.: Sítio Serra Negra',
  responsible_name: 'Ex.: Maria da Silva',
  responsible_document: '000.000.000-00',
  responsible_phone: 'Ex.: (87) 99999-9999',
  responsible_address: 'Ex.: Sítio Serra Negra, casa 12',
  requester_name: 'Ex.: João da Silva',
  requester_phone: 'Ex.: (87) 99999-9999',
  email: 'Ex.: pipeiro@exemplo.com',
  loads: 'Ex.: 1',
  liters: 'Ex.: 10000',
  quota: 'Ex.: 20',
};
export default function PipaForm({ mode, value = {}, data, channels, city, onClose, onSaved }) {
  const now = new Date();
  const [form, setForm] = useState({ channel_id: value.channel_id || channels.find(c => mode === 'request' ? c.request : c.manage)?.id || '', name: '', official_code: '', locality: '', address: '', latitude: '', longitude: '', capacity_liters: '', provider: 'prefeitura',
    responsible_name: '', responsible_document: '', responsible_phone: '', responsible_address: '', notes: '', active: true, emptying_days: '',
    tank_id: '', driver_id: '', kind: 'urgent', requester_name: '', requester_phone: '', loads: 1, liters: '', level_after_percent: '',
    delivered_at: `${pipaDay(now)}T${now.toLocaleTimeString('en-GB', { timeZone: 'America/Fortaleza', hour: '2-digit', minute: '2-digit' })}`,
    month: pipaMonth(now).slice(0, 7), quota: 0, email: '', ...value });
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [credentials, setCredentials] = useState(null);
  const [passwordCopied, setPasswordCopied] = useState(false);
  const [tankStep, setTankStep] = useState(0), [fieldErrors, setFieldErrors] = useState({});
  const [locatingAddress, setLocatingAddress] = useState(false);
  const formRef = useRef(null);
  const id = useRef(crypto.randomUUID());
  const contactError = (key, val) => {
    if (key === 'responsible_document' && !pipaValidCpf(val)) return 'Informe um CPF válido para o responsável.';
    if ((key === 'responsible_phone' || (key === 'requester_phone' && val)) && !pipaValidPhone(val)) return 'Informe um telefone com DDD e 10 ou 11 dígitos.';
    return '';
  };
  const update = (key, val) => {
    const nextValue = key === 'responsible_document' ? val.replace(/\D/g, '').slice(0, 11)
      : ['responsible_phone', 'requester_phone'].includes(key) ? pipaPhoneDigits(val).slice(0, 11) : val;
    setForm(f => ({ ...f, [key]: nextValue }));
    setFieldErrors(current => {
      const next = { ...current }, message = current[key] ? contactError(key, nextValue) : '';
      if (message) next[key] = message; else delete next[key];
      return next;
    });
  };
  const validateContact = key => {
    const message = contactError(key, form[key]);
    setFieldErrors(current => { const next = { ...current }; if (message) next[key] = message; else delete next[key]; return next; });
  };
  const goToStep = step => { setError(''); setFieldErrors({}); setTankStep(step); };
  useEffect(() => {
    if (mode === 'tank') formRef.current?.querySelector('input:not(:disabled), select:not(:disabled), textarea:not(:disabled)')?.focus({ preventScroll: true });
  }, [mode, tankStep]);
  const scope = channels.filter(c => ['request'].includes(mode) ? c.request : c.manage);
  const tanks = data.tanks.filter(t => t.channel_id === form.channel_id && (t.active || t.id === form.tank_id));
  const drivers = data.drivers.filter(d => d.channel_id === form.channel_id && (d.active || mode === 'manual'));
  const pickTank = val => { const t = data.tanks.find(t => t.id === val); setForm(f => ({ ...f, tank_id: val, ...(t ? { requester_name: t.responsible_name, requester_phone: t.responsible_phone } : {}) })); };
  const field = (key, label, type = 'text', props = {}) => {
    const masked = ['responsible_document', 'responsible_phone', 'requester_phone'].includes(key);
    const inputValue = key === 'responsible_document' ? pipaMaskCpf(form[key]) : masked ? formatPhone(form[key] || '') : form[key] ?? '';
    return <PipaField key={key} label={label} wide={props.wide}>
      <input name={key} className="pipa-input" type={type} required value={inputValue} onChange={e => update(key, e.target.value)} onBlur={masked ? () => validateContact(key) : undefined} placeholder={key === 'name' ? (mode === 'tank' ? 'Ex.: Caixa da associação' : 'Ex.: João da Silva') : key === 'capacity_liters' ? (mode === 'tank' ? 'Ex.: 16000' : 'Ex.: 10000') : FIELD_PLACEHOLDERS[key]} maxLength={type === 'text' ? 160 : undefined} aria-invalid={Boolean(fieldErrors[key]) || undefined} aria-describedby={fieldErrors[key] ? `pipa-${key}-error` : undefined} {...Object.fromEntries(Object.entries(props).filter(([k]) => k !== 'wide'))} />
      {fieldErrors[key] && <span id={`pipa-${key}-error`} role="alert" className="text-xs font-normal text-danger">{fieldErrors[key]}</span>}
    </PipaField>;
  };
  const provider = <PipaSelect label={mode === 'tank' ? 'Abastecimento habitual' : 'Vínculo do pipeiro'} value={form.provider} onChange={v => update('provider', v)}>{Object.entries(PIPA_PROVIDERS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</PipaSelect>;
  const tankSelect = <PipaSelect label="Caixa d’água" required={form.kind !== 'one_off' || mode === 'manual'} value={form.tank_id} onChange={pickTank}><option value="">{form.kind === 'one_off' ? 'Localidade sem caixa cadastrada' : 'Selecione uma caixa'}</option>{tanks.map(t => <option key={t.id} value={t.id}>{t.system_code && `${t.system_code} · `}{t.name} · {t.locality} · {PIPA_PROVIDERS[t.provider]}</option>)}</PipaSelect>;
  const driverSelect = <PipaSelect label="Pipeiro" value={form.driver_id} onChange={v => { const d = data.drivers.find(d => d.id === v); setForm(f => ({ ...f, driver_id: v, liters: Number(f.loads || 1) * (d?.capacity_liters || 0) })); }}><option value="">Selecione um pipeiro</option>{drivers.map(d => <option key={d.id} value={d.id}>{d.name} · {d.plate}{!d.active ? ' · inativo' : ''}</option>)}</PipaSelect>;
  const location = <PipaLocationFields form={form} setForm={setForm} city={city} disabled={busy} onPendingChange={setLocatingAddress} />;
  const submit = async event => {
    event.preventDefault(); if (busy || locatingAddress) return;
    const invalid = (key, message) => { setFieldErrors(current => ({ ...current, [key]: message })); formRef.current?.elements.namedItem(key)?.focus(); };
    if (mode === 'tank') {
      if (tankStep === 0) {
        if (form.name.trim().length < 2) { invalid('name', 'Informe o nome da caixa.'); return; }
        if (form.locality.trim().length < 2) { invalid('locality', 'Informe a localidade.'); return; }
      } else if (tankStep === 1) {
        if (!pipaCoordinates(form.latitude, form.longitude)) { invalid('latitude', 'Marque a localização da caixa.'); return; }
      } else {
        if (form.responsible_name.trim().length < 3) { invalid('responsible_name', 'Informe o nome completo do responsável.'); return; }
        if (!pipaValidCpf(form.responsible_document)) { invalid('responsible_document', 'Informe um CPF válido para o responsável.'); return; }
        if (!pipaValidPhone(form.responsible_phone)) { invalid('responsible_phone', 'Informe um telefone com DDD e 10 ou 11 dígitos.'); return; }
        if (form.responsible_address.trim().length < 3) { invalid('responsible_address', 'Informe o endereço do responsável.'); return; }
      }
      if (tankStep < TANK_STEPS.length - 1) { goToStep(tankStep + 1); return; }
    }
    if (mode === 'request' && form.requester_phone && !pipaValidPhone(form.requester_phone)) { invalid('requester_phone', 'Informe um telefone com DDD e 10 ou 11 dígitos.'); return; }
    setError(''); setBusy(true);
    try {
      if (mode === 'tank') {
        await pipaRpc('pipa_save_tank', { p_data: { ...form, emptying_days: form.emptying_days === '' || form.emptying_days == null ? null : Number(form.emptying_days), responsible_document: form.responsible_document.replace(/\D/g, ''), responsible_phone: pipaPhoneDigits(form.responsible_phone) } });
      } else if (mode === 'driver') await pipaRpc('pipa_save_driver', { p_data: form });
      else if (mode === 'request') {
        if (!form.tank_id && !pipaCoordinates(form.latitude, form.longitude)) throw new Error('Marque o local da entrega avulsa.');
        await pipaRpc('pipa_create_request', { p_data: { ...form, tank_id: form.tank_id || null, requester_phone: pipaPhoneDigits(form.requester_phone) } });
      } else if (mode === 'manual') {
        await pipaRpc('pipa_record_delivery', { p_data: { ...form, id: id.current, source: 'manual', delivered_at: new Date(form.delivered_at + ':00-03:00').toISOString(), request_id: form.request_id || null, level_after_percent: form.level_after_percent === '' ? null : Number(form.level_after_percent) } });
      } else if (mode === 'quota') await pipaRpc('pipa_set_quota', { p_driver: value.id, p_month: form.month + '-01', p_loads: Number(form.quota) });
      else if (mode === 'dispatch') await pipaRpc('pipa_dispatch', { p_request: value.id, p_driver: form.driver_id });
      else if (mode === 'login') { setCredentials(await createPipaLogin(value.id, form.email)); onSaved(false); return; }
      await onSaved();
    } catch (failure) { setError(failure.message || 'Não foi possível salvar.'); }
    finally { setBusy(false); }
  };
  return <MunicipalDrawer open onClose={onClose} title={titles[mode]} description={titles[mode]} placement="center" busy={busy} activeSection={mode === 'tank' ? tankStep : undefined}
    navigation={mode === 'tank' && <WizardProgress steps={TANK_STEPS} current={tankStep} busy={busy} onSelect={goToStep} labelPrefix="pipa-tank-step" className="pipa-tank-progress" />}
    footer={!credentials && <div className={`pipa-actions ${mode === 'tank' ? 'justify-between' : 'justify-end'}`}><div className="pipa-actions"><Button type="button" variant="outline" onClick={onClose} disabled={busy}>Cancelar</Button>{mode === 'tank' && tankStep > 0 && <Button type="button" variant="ghost" onClick={() => goToStep(tankStep - 1)} disabled={busy}>Voltar</Button>}</div><Button form="pipa-form" type="submit" disabled={busy || locatingAddress}>{busy ? 'Salvando…' : mode === 'tank' && tankStep < TANK_STEPS.length - 1 ? 'Continuar' : mode === 'login' ? 'Criar acesso' : 'Salvar'}</Button></div>}>
    {credentials ? <div className="space-y-4" role="status"><h2 className="font-bold">Login criado</h2><dl className="space-y-3 break-all"><div><dt>E-mail</dt><dd className="font-semibold">{credentials.email}</dd></div><div><dt>Senha temporária</dt><dd className="select-all font-mono">{credentials.temporary_password}</dd></div></dl><p className="pipa-note">Acesso: {window.location.origin}/operacao-pipa/pipeiro. O pipeiro completa seu cadastro no primeiro acesso. A troca da senha será obrigatória em 24 horas. Copie agora; a senha é exibida somente nesta criação.</p><Button onClick={async () => { try { await navigator.clipboard.writeText(credentials.temporary_password); setPasswordCopied(true); setError(''); } catch { setError('Não foi possível copiar. Selecione a senha acima e copie manualmente.'); } }}>{passwordCopied ? 'Senha copiada' : 'Copiar senha'}</Button><Button variant="outline" onClick={onClose}>Concluir</Button></div> : <form ref={formRef} id="pipa-form" className="pipa-form" onSubmit={submit} aria-labelledby={mode === 'tank' ? `pipa-tank-step-${tankStep}` : undefined}>
      <fieldset disabled={busy}>
        {((mode === 'tank' && tankStep === 0) || ['driver', 'request', 'manual'].includes(mode)) && <PipaSelect label="Secretaria" value={form.channel_id} disabled={Boolean(value.id || value.request_id)} onChange={v => setForm(f => ({ ...f, channel_id: v, tank_id: '', driver_id: '' }))}><option value="">Selecione</option>{scope.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</PipaSelect>}
        {mode === 'tank' && tankStep === 0 && <>{field('name', 'Nome da caixa', 'text', { minLength: 2 })}{field('locality', 'Localidade', 'text', { minLength: 2, placeholder: 'Ex.: Sítio Serra Negra' })}<PipaField label="Código do sistema"><output className="pipa-input pipa-code-output">{form.system_code || 'Gerado ao salvar'}</output></PipaField>{field('official_code', 'Código do órgão (opcional)', 'text', { required: false, maxLength: 80, placeholder: 'Ex.: código do governo' })}{field('capacity_liters', 'Capacidade da caixa (litros)', 'number', { min: 1, max: 2147483647, step: 1 })}{field('emptying_days', 'Tempo médio para esvaziar (dias)', 'number', { required: false, min: 1, max: 365, step: 1, placeholder: 'Ex.: 10', title: 'Tempo para consumir uma caixa cheia. Deixe em branco se não souber.' })}{provider}<PipaField label="Situação"><select className="pipa-input" value={String(form.active)} onChange={e => update('active', e.target.value === 'true')}><option value="true">Ativa</option><option value="false">Desativada</option></select></PipaField></>}
        {mode === 'tank' && tankStep === 1 && location}
        {mode === 'tank' && tankStep === 2 && <><p className="pipa-wide pipa-note">Dados pessoais visíveis somente à equipe autorizada da secretaria.</p>{field('responsible_name', 'Nome completo', 'text', { minLength: 3 })}{field('responsible_document', 'CPF', 'text', { inputMode: 'numeric', maxLength: 14 })}{field('responsible_phone', 'Telefone com DDD', 'tel', { minLength: 10, maxLength: 20 })}{field('responsible_address', 'Endereço do responsável', 'text', { wide: true, minLength: 3 })}</>}
        {mode === 'driver' && <>{field('name', 'Nome completo')}{field('plate', 'Placa do veículo', 'text', { maxLength: 8, pattern: '[A-Za-z]{3}-?[0-9][A-Za-z0-9][0-9]{2}', placeholder: 'ABC1D23' })}{field('capacity_liters', 'Capacidade do tanque (litros)', 'number', { min: 1, max: 2147483647, step: 1 })}{provider}<PipaField label="Situação"><select className="pipa-input" value={String(form.active)} onChange={e => update('active', e.target.value === 'true')}><option value="true">Ativo</option><option value="false">Desativado</option></select></PipaField>{!form.active && <p className="pipa-wide pipa-note">O pipeiro desativado perde o acesso a destinos e ao registro de entregas.</p>}</>}
        {mode === 'request' && <><PipaSelect label="Tipo de solicitação" value={form.kind} onChange={v => update('kind', v)}>{Object.entries(PIPA_KINDS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</PipaSelect>{tankSelect}{field('requester_name', 'Nome do solicitante')}{field('requester_phone', 'Telefone do solicitante', 'tel', { required: false })}{form.kind === 'one_off' && !form.tank_id && <>{field('locality', 'Localidade', 'text', { placeholder: 'Ex.: Sítio Serra Negra' })}{location}</>}{form.tank_id && data.tanks.find(t => t.id === form.tank_id)?.provider === 'exercito' && <p className="pipa-wide pipa-note">A entrega da prefeitura será registrada sem alterar o vínculo habitual da caixa com o Exército.</p>}</>}
        {mode === 'manual' && <>{!value.request_id && tankSelect}{value.request_id && <p className="pipa-note">Destino: {value.destination_label}</p>}{driverSelect}{field('delivered_at', 'Data e hora (Fortaleza)', 'datetime-local')}{field('loads', 'Quantidade de carradas', 'number', { min: 1, max: value.request_id ? 1 : 1000, step: 1 })}{field('liters', 'Volume entregue (litros)', 'number', { min: 1, max: 2147483647, step: 1 })}<p className="pipa-wide pipa-note">O vínculo do pipeiro identifica quem realizou a entrega. O lançamento guarda seu usuário e a data do registro.</p></>}
        {mode === 'manual' && form.tank_id && <PipaDeliveryLevel value={form.level_after_percent} onChange={v => update('level_after_percent', v)} disabled={busy} />}
        {mode === 'dispatch' && <><p className="pipa-wide font-semibold">{value.locality} · {PIPA_KINDS[value.kind]}</p>{driverSelect}</>}
        {mode === 'quota' && <><p className="pipa-wide font-semibold">{value.name}</p>{field('month', 'Mês da cota', 'month')}{field('quota', 'Cota de carradas no mês', 'number', { min: 0, step: 1 })}<p className="pipa-wide pipa-note">A cota é uma referência de acompanhamento; entregas acima dela continuam registradas.</p></>}
        {mode === 'login' && <><p className="pipa-wide font-semibold">{value.name}</p>{field('email', 'E-mail para acesso', 'email', { wide: true })}</>}
        {((mode === 'tank' && tankStep === 2) || ['request', 'manual'].includes(mode)) && <PipaField wide label={mode === 'manual' ? 'Motivo do lançamento manual' : 'Observações'}><textarea name="notes" className="pipa-input" rows={3} placeholder={mode === 'manual' ? 'Ex.: Entrega realizada sem sinal de internet.' : mode === 'request' ? 'Ex.: Caixa seca desde ontem.' : 'Ex.: Acesso pela estrada ao lado da escola.'} maxLength={2000} value={form.notes} required={mode === 'manual'} minLength={mode === 'manual' ? 5 : undefined} onChange={e => update('notes', e.target.value)} /></PipaField>}
      </fieldset>
    </form>}
    {error && <p role="alert" className="pipa-error mt-4">{error}</p>}
  </MunicipalDrawer>;
}

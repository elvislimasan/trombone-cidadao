import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, CalendarDays, History, LampDesk, Lightbulb, MapPin, Plus, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { lightingStatus } from '@/components/municipality/MunicipalLightingMap';
import { normalizeLampType } from '@/lib/lightingCatalog';
import { poleCode, poleDisplayLabel, poleReferenceText } from '@/lib/poleDisplay';

const STATUS = { aceso: 'Sem problema registrado', apagado: 'Apagado ou com problema', manutencao: 'Em manutenção', removido: 'Removido' };
const STATUS_COLOR = { aceso: 'bg-success-bg text-success-fg', apagado: 'bg-danger-subtleBg text-danger-subtleFg', manutencao: 'bg-status-pendingBg text-status-pendingFg', removido: 'bg-surface-subtle text-content-secondary' };
const STATUS_DOT = { aceso: 'bg-green-600', apagado: 'bg-red-600', manutencao: 'bg-yellow-500', removido: 'bg-slate-500' };
const formatPower = (value) => value == null ? '—' : `${Number(value).toLocaleString('pt-BR')} W`;
const formatDate = (value) => value ? new Date(value).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : 'Não informada';
const coordinateChange = (entry) => {
  const values = [entry.old_latitude, entry.old_longitude, entry.new_latitude, entry.new_longitude];
  if (!values.every(Number.isFinite) || (entry.old_latitude === entry.new_latitude && entry.old_longitude === entry.new_longitude)) return null;
  return `Localização: ${entry.old_latitude.toFixed(6)}, ${entry.old_longitude.toFixed(6)} → ${entry.new_latitude.toFixed(6)}, ${entry.new_longitude.toFixed(6)}`;
};

function DetailsGrid({ entries }) {
  return <dl className="grid grid-cols-1 gap-x-4 gap-y-3 min-[420px]:grid-cols-2">{entries.filter(([, value]) => value != null && value !== '').map(([label, value]) => <div key={label} className={'min-w-0 ' + (['Qualidade', 'Observações'].includes(label) ? 'min-[420px]:col-span-2' : '')}><dt className="text-[11px] leading-4 text-content-secondary">{label}</dt><dd className="mt-0.5 break-words text-sm font-medium leading-5">{value}</dd></div>)}</dl>;
}

export default function PoleDetailsDialog({ open, onOpenChange, pole, city, related, canEdit, canEditLighting, editingLoading, onEdit }) {
  const [historyOpen, setHistoryOpen] = useState(false);
  if (!pole) return null;

  const technical = pole.raw_properties?.kmz || pole.raw_properties?.municipal
    ? { ...pole.raw_properties?.kmz, ...pole.raw_properties?.municipal } : null;
  const plate = technical?.source_plate || pole.plate;
  const fields = [
    ['Código', technical?.source_code && poleCode(technical.source_code)], ['Pontos de luz', technical?.lamp_count],
    ['Alimentador', technical?.feeder], ['Transformador', technical?.transformer_code],
    ['Tipo de ponto', technical?.point_type], ['Tipo de rede', technical?.network_type],
    ['Chave', technical?.switch_code === plate ? null : technical?.switch_code],
    ['Número da companhia', technical?.company_number === plate ? null : technical?.company_number],
    ['Característica', technical?.characteristic], ['Qualidade', technical?.quality],
    ['Observações', technical?.observations],
  ];
  const hasTechnical = fields.some(([, value]) => value != null && value !== '') || Boolean(technical?.luminaires?.length || technical?.source_address);
  const status = lightingStatus(pole);

  return <Dialog open={open} onOpenChange={(value) => { if (!value) setHistoryOpen(false); onOpenChange(value); }}>
    <DialogContent aria-label="Poste selecionado" className="max-h-[90dvh] w-[calc(100%-2rem)] max-w-lg gap-0 overflow-x-hidden overflow-y-auto rounded-2xl border-edge-subtle bg-surface-raised p-0">
      <div className="p-5 sm:p-6">
        <div className="border-b border-edge-subtle pb-4">
          <DialogTitle className="flex items-center gap-2 text-sm font-semibold"><MapPin className="h-4 w-4 text-brand" />Poste selecionado</DialogTitle>
          <DialogDescription className="sr-only">Dados, histórico e serviços do poste selecionado.</DialogDescription>
        </div>

        <div className="mt-4 flex min-w-0 items-start gap-3">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl border border-status-pendingBorder bg-gradient-to-br from-status-pendingBg to-surface-raised"><LampDesk className="h-7 w-7 text-status-pendingFg" /></div>
          <div className="min-w-0 flex-1">
            <h3 className="break-words text-base font-bold leading-6">{poleDisplayLabel(pole)}</h3>
            <span className={'mt-1 inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-[11px] font-semibold ' + (STATUS_COLOR[status] || STATUS_COLOR.removido)}><span className={'h-2 w-2 shrink-0 rounded-full ' + (STATUS_DOT[status] || STATUS_DOT.removido)} />{STATUS[status] || status}</span>
            {pole.is_broken && pole.lighting_status !== 'apagado' && pole.lighting_status !== 'manutencao' && pole.lighting_status !== 'removido' && <p className="mt-1 text-xs text-danger-subtleFg">Há relato de problema ativo. A situação cadastrada pode ser diferente da exibida no mapa.</p>}
            <p className="mt-2 break-words text-sm leading-5 text-content-secondary">{pole.address || 'Endereço não informado'}</p>
            {city?.name && <p className="mt-0.5 text-xs text-content-secondary">{city.name}{city.states?.uf && ` · ${city.states.uf}`}</p>}
          </div>
        </div>

        <dl className="mt-5 grid grid-cols-1 gap-x-4 gap-y-3 border-t border-edge-subtle pt-4 min-[420px]:grid-cols-2">{[
          ['Última atualização', CalendarDays, formatDate(related.history[0]?.changed_at || pole.updated_at)],
          ['Potência da lâmpada', Zap, formatPower(pole.lamp_power_w)],
          ['Tipo de lâmpada', Lightbulb, normalizeLampType(pole.lamp_type) || 'Não informado'],
          ['Coordenadas', MapPin, Number.isFinite(pole.latitude) && Number.isFinite(pole.longitude) ? `${pole.latitude.toFixed(4)}, ${pole.longitude.toFixed(4)}` : 'Não informadas'],
        ].map(([label, Icon, value]) => <div key={label} className="flex min-w-0 items-start gap-2"><Icon className="mt-0.5 h-4 w-4 shrink-0 text-content-secondary" /><div className="min-w-0"><dt className="text-[11px] leading-4 text-content-secondary">{label}</dt><dd className="mt-0.5 break-words text-sm font-medium leading-5">{value}</dd></div></div>)}</dl>

        {hasTechnical && <details className="mt-5 rounded-xl border border-edge-subtle bg-surface-subtle p-4"><summary className="cursor-pointer text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand">Dados do cadastro do poste</summary><div className="mt-3"><DetailsGrid entries={fields} />
          {technical?.luminaires?.length > 0 && <div className="mt-4 border-t border-edge-subtle pt-3"><p className="text-[11px] text-content-secondary">Luminárias cadastradas</p><ul className="mt-1 space-y-1">{technical.luminaires.map((item, index) => <li key={index} className="break-words text-sm leading-5">{item.quantity ? `${item.quantity} × ` : ''}{item.description}</li>)}</ul></div>}
          {technical?.source_address && <div className="mt-3 border-t border-edge-subtle pt-3"><p className="text-[11px] text-content-secondary">Referência do cadastro</p><p className="mt-0.5 break-words text-sm leading-5">{technical.source_address}</p></div>}
        </div></details>}

        <div className={'mt-5 grid gap-2 border-t border-edge-subtle pt-4 ' + (canEditLighting ? 'grid-cols-2' : 'grid-cols-1')}>
          {canEditLighting && <Button variant="outline" size="sm" disabled={editingLoading} onClick={() => onEdit(0)} className="text-xs">{editingLoading ? 'Abrindo…' : 'Editar poste'}<ArrowRight className="ml-1 h-3.5 w-3.5" /></Button>}
          <Button variant="outline" size="sm" aria-expanded={historyOpen} onClick={() => setHistoryOpen((value) => !value)} className="text-xs"><History className="mr-1 h-3.5 w-3.5" />Histórico</Button>
        </div>
        {canEditLighting && <Button variant="ghost" size="sm" disabled={editingLoading} onClick={() => onEdit(1)} className="mt-2 w-full text-xs">Corrigir localização e identificador no mapa</Button>}
        {canEdit && pole.lighting_status !== 'removido' && <Button asChild size="sm" className="mt-2 w-full"><Link to={`/prefeitura/demandas/nova?poste=${pole.id}`}><Plus className="mr-2 h-3.5 w-3.5" />Gerar ordem de serviço</Link></Button>}

        {historyOpen && <section className="mt-4 space-y-3 border-t border-edge-subtle pt-3"><h3 className="text-xs font-semibold">Últimas alterações</h3>{related.loading ? <p className="text-xs text-content-secondary">Carregando histórico…</p> : related.error ? <p role="alert" className="text-xs text-danger">{related.error}</p> : related.history.length ? related.history.map((entry) => <div key={entry.id} className="border-l-2 border-status-progressBorder pl-3"><p className="text-[11px] text-content-secondary">{formatDate(entry.changed_at)}</p><p className="mt-1 text-xs font-medium">{STATUS[entry.new_status] || entry.new_status} · {formatPower(entry.new_power_w)}{entry.new_lamp_type && ' · ' + entry.new_lamp_type}</p>{coordinateChange(entry) && <p className="mt-1 break-words text-xs text-content-secondary">{coordinateChange(entry)}</p>}{entry.descricao_servico && <p className="mt-1 whitespace-pre-line text-xs text-content-secondary">{entry.descricao_servico}</p>}</div>) : <p className="text-xs text-content-secondary">Nenhuma alteração registrada para este poste.</p>}</section>}

        {(related.loading || related.error || related.orders.length > 0 || related.reports.length > 0) && <section className="mt-4 space-y-2 border-t border-edge-subtle pt-3"><h3 className="text-xs font-semibold">Serviços e relatos deste poste</h3>{related.loading && <p className="text-xs text-content-secondary">Consultando vínculos…</p>}{related.error && <p role="alert" className="text-xs text-danger">{related.error}</p>}{related.orders.map((order) => <Link key={order.id} to={`/prefeitura/demandas/${order.id}`} className="block rounded-lg border border-edge-subtle p-3 text-xs text-brand hover:bg-surface-subtle">{order.protocolo} · {poleReferenceText(order.titulo)}<span className="mt-1 block text-content-secondary">{order.status === 'concluida' ? 'Concluída' : order.status === 'cancelada' ? 'Cancelada' : order.status === 'recusada' ? 'Recusada' : 'Em aberto'}{order.prazo_em ? ` · Prazo ${new Date(order.prazo_em).toLocaleDateString('pt-BR')}` : ''}</span></Link>)}{related.reports.map((report) => <Link key={report.id} to={`/prefeitura/broncas/${report.id}`} className="block rounded-lg border border-edge-subtle p-3 text-xs text-brand hover:bg-surface-subtle">Solicitação: {poleReferenceText(report.title)}</Link>)}</section>}
      </div>
    </DialogContent>
  </Dialog>;
}

import React from 'react';
import { ArrowUpRight, CalendarDays, MapPin, Sprout, Trees, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { adoptionItems, adoptionQuantity, ADOPTION_PROVIDERS, ADOPTION_STATUSES, ADOPTION_TYPES, ADOPTION_WIRING, adoptionProtocol } from '@/lib/treeAdoption';

const nextSteps = {
  solicitada: 'Aguardando avaliação da equipe', em_analise: 'Local em avaliação técnica',
  aguardando_informacao: 'O solicitante precisa responder à equipe', aguardando_disponibilidade: 'Aguardando mudas no fornecedor',
  aprovada: 'Aguardando organização do atendimento', agendada: 'Confira a data combinada com a equipe',
  pronta_retirada: 'Confira as orientações para retirar sua muda', concluida: 'Atendimento concluído',
  recusada: 'Consulte o parecer da equipe', cancelada: 'Pedido cancelado',
};

export function AdoptionStatus({ status }) {
  const tone = status === 'concluida' ? 'success' : ['cancelada', 'recusada'].includes(status) ? 'muted'
    : ['solicitada', 'aguardando_informacao', 'aguardando_disponibilidade'].includes(status) ? 'pending' : 'progress';
  return <span className={`adoption-status adoption-status-${tone}`}><span aria-hidden="true" />{ADOPTION_STATUSES[status] || status}</span>;
}

export default function TreeAdoptionRequestCard({ item, onOpen }) {
  const Icon = item.request_type === 'muda' ? Sprout : Trees;
  return <article className="adoption-request-card">
    <div className="adoption-request-identity"><span className="adoption-request-icon"><Icon size={23} /></span><div className="min-w-0"><p className="adoption-request-protocol">{adoptionProtocol(item)}</p><h3>{item.species?.common_name || 'Espécie cadastrada'}{adoptionItems(item).length > 1 ? ` + ${adoptionItems(item).length - 1} espécie(s)` : ''}</h3><p className="adoption-request-type">{ADOPTION_TYPES[item.request_type]} · {adoptionQuantity(item)} unidade(s)</p><p className="mt-1 break-words text-xs">{item.requester_name || 'Solicitante não informado no pedido antigo'}</p>{item.requester_phone && <a className="text-xs text-primary underline" href={`tel:${item.requester_phone.replace(/[^+\d]/g, '')}`}>{item.requester_phone}</a>}</div></div>
    <div className="adoption-request-location"><p><MapPin size={14} /><span>{item.address}</span></p>{item.neighborhood && !item.address.toLocaleLowerCase('pt-BR').includes(item.neighborhood.toLocaleLowerCase('pt-BR')) && <span className="adoption-request-neighborhood">{item.neighborhood}</span>}<p className="adoption-request-provider">{ADOPTION_PROVIDERS[item.confirmed_provider || item.provider]}</p>{item.overhead_wiring !== 'nao' && <p className="adoption-request-caution"><Zap size={13} /><span>{ADOPTION_WIRING[item.overhead_wiring]} · Avaliação necessária</span></p>}</div>
    <div className="adoption-request-state"><AdoptionStatus status={item.status} /><p>{nextSteps[item.status]}</p><time dateTime={item.created_at}><CalendarDays size={13} />{new Date(item.created_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</time></div>
    <div className="adoption-request-actions"><Button variant="outline" className="adoption-request-open" onClick={onOpen}>Ver pedido e histórico<ArrowUpRight className="ml-1.5 h-3.5 w-3.5" /></Button></div>
  </article>;
}

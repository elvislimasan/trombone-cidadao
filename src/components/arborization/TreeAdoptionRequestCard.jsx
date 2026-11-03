import React from 'react';
import { ArrowRight, ArrowUpRight, CalendarDays, Check, MapPin, MessageCircle, Sprout, Trees, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import TreeAdoptionPickup from './TreeAdoptionPickup';
import TreeAdoptionReceiptButton from './TreeAdoptionReceiptButton';
import { adoptionItems, adoptionQuantity, adoptionProviderLabel, ADOPTION_STATUSES, ADOPTION_TYPES, ADOPTION_WIRING, adoptionProtocol } from '@/lib/treeAdoption';

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

export default function TreeAdoptionRequestCard({ item, catalog, onOpen, citizen = false, city }) {
  const Icon = item.request_type === 'muda' ? Sprout : Trees;
  const quantity = adoptionQuantity(item);
  if (citizen) {
    const requested = adoptionItems(item);
    const title = item.species?.common_name || catalog.species?.find(row => row.id === requested[0]?.species_id)?.common_name || 'Espécies solicitadas';
    const needsReply = item.status === 'aguardando_informacao';
    const closed = ['recusada', 'cancelada'].includes(item.status);
    const stage = ['aprovada', 'agendada', 'pronta_retirada', 'concluida'].includes(item.status) ? 2 : item.status === 'solicitada' ? 0 : 1;
    const citizenNext = {
      solicitada: 'A equipe recebeu seu pedido. Aguarde a avaliação.',
      em_analise: 'Seu local está em avaliação técnica.',
      aguardando_informacao: 'A equipe precisa de uma resposta sua.',
      aguardando_disponibilidade: 'Aguarde a confirmação de mudas no viveiro.',
      aprovada: 'Aguarde as orientações da equipe para o atendimento.',
      agendada: 'Confira a data e as orientações combinadas com a equipe.',
      pronta_retirada: 'Veja onde e quando retirar sua muda.',
      concluida: 'Atendimento finalizado. Consulte o histórico.',
      recusada: 'Consulte o parecer informado pela equipe.',
      cancelada: 'Este pedido foi cancelado.',
    };
    return <article className={`adoption-request-card is-citizen${needsReply ? ' needs-reply' : ''}`} data-status={item.status}>
      <header className="adoption-citizen-card-top"><p className="adoption-request-protocol">{adoptionProtocol(item)}</p><AdoptionStatus status={item.status} /></header>
      <div className="adoption-citizen-card-identity"><span className="adoption-citizen-icon"><Icon size={27} aria-hidden="true" /></span><div><h3 className="adoption-citizen-title">{title}</h3>{requested.length > 1 && <p className="adoption-citizen-extra-species">e mais {requested.length - 1} {requested.length === 2 ? 'espécie' : 'espécies'}</p>}<p className="adoption-citizen-card-type">{quantity} {item.request_type === 'plantio' ? `${quantity === 1 ? 'árvore' : 'árvores'} · Plantio pela equipe` : `${quantity === 1 ? 'muda' : 'mudas'} · Retirada no viveiro`}</p></div></div>
      {!closed && <ol className="adoption-citizen-progress" aria-label="Etapas do pedido">{['Enviado', 'Análise', 'Atendimento'].map((label, index) => {
        const complete = index < stage || item.status === 'concluida';
        return <li key={label} className={complete ? 'is-complete' : index === stage ? 'is-current' : ''} aria-current={!complete && index === stage ? 'step' : undefined}><span aria-hidden="true">{complete ? <Check size={12} /> : index + 1}</span><span>{label}</span></li>;
      })}</ol>}
      <div className="adoption-citizen-location"><MapPin size={17} aria-hidden="true" /><p>{item.status === 'pronta_retirada' && <span className="adoption-planting-location-label">Local de plantio</span>}{[item.address, item.neighborhood].filter(Boolean).join(' · ') || 'Local informado no pedido'}</p></div>
      <div className="adoption-citizen-next">{needsReply && <MessageCircle size={19} aria-hidden="true" />}<div><strong>{needsReply ? 'Sua resposta faz o pedido avançar' : (item.status === 'concluida' || closed) ? 'Atendimento encerrado' : 'Próximo passo'}</strong><p>{citizenNext[item.status] || nextSteps[item.status]}</p><TreeAdoptionPickup request={item} catalog={catalog} city={city} /><TreeAdoptionReceiptButton request={item} /></div></div>
      <footer><time dateTime={item.created_at}><CalendarDays size={15} aria-hidden="true" />{new Date(item.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })}</time><Button variant={needsReply ? 'default' : 'outline'} onClick={onOpen} aria-label={`${needsReply ? 'Responder à equipe sobre' : 'Ver detalhes de'} ${adoptionProtocol(item)}`}>{needsReply ? 'Responder à equipe' : 'Ver detalhes'}<ArrowRight size={17} aria-hidden="true" /></Button></footer>
    </article>;
  }
  return <article className="adoption-request-card">
    <div className="adoption-request-identity"><span className="adoption-request-icon"><Icon size={23} /></span><div className="min-w-0"><p className="adoption-request-protocol">{adoptionProtocol(item)}</p><h3>{item.species?.common_name || 'Espécie cadastrada'}{adoptionItems(item).length > 1 ? ` + ${adoptionItems(item).length - 1} espécie(s)` : ''}</h3><p className="adoption-request-type">{ADOPTION_TYPES[item.request_type]} · {adoptionQuantity(item)} unidade(s)</p><p className="mt-1 break-words text-xs">{item.requester_name || 'Solicitante não informado no pedido antigo'}</p>{item.requester_phone && <a className="text-xs text-primary underline" href={`tel:${item.requester_phone.replace(/[^+\d]/g, '')}`}>{item.requester_phone}</a>}</div></div>
    <div className="adoption-request-location"><p><MapPin size={14} /><span>{item.address}</span></p>{item.neighborhood && !item.address.toLocaleLowerCase('pt-BR').includes(item.neighborhood.toLocaleLowerCase('pt-BR')) && <span className="adoption-request-neighborhood">{item.neighborhood}</span>}<p className="adoption-request-provider">{adoptionProviderLabel(item.confirmed_provider || item.provider, catalog)}</p>{item.overhead_wiring !== 'nao' && <p className="adoption-request-caution"><Zap size={13} /><span>{ADOPTION_WIRING[item.overhead_wiring]} · Avaliação necessária</span></p>}</div>
    <div className="adoption-request-state"><AdoptionStatus status={item.status} /><p>{nextSteps[item.status]}</p><time dateTime={item.created_at}><CalendarDays size={13} />{new Date(item.created_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</time></div>
    <div className="adoption-request-actions"><Button variant="outline" className="adoption-request-open" onClick={onOpen}>Ver pedido e histórico<ArrowUpRight className="ml-1.5 h-3.5 w-3.5" /></Button></div>
  </article>;
}

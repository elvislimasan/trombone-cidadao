import React from 'react';
import { CheckCircle2, MapPin, ShieldCheck, Sprout } from 'lucide-react';

export default function TreeAdoptionWelcome({ cityName, quantity = 0, requestType }) {
  return <aside className="adoption-welcome" aria-label="Resumo da solicitação">
    <div className="adoption-welcome-heading">
      <h2>Sua solicitação</h2>
      {cityName && <p>{cityName}</p>}
    </div>
    <div className="adoption-welcome-summary"><h3><Sprout size={16} aria-hidden="true" />Seu pedido até aqui</h3><p><MapPin size={15} aria-hidden="true" />{cityName || 'Cidade do plantio'}</p><p><CheckCircle2 size={15} aria-hidden="true" />{requestType === 'plantio' ? 'Apoio para o plantio' : requestType === 'muda' ? 'Retirada de mudas' : 'Escolha o tipo de atendimento'}</p><p>{quantity ? `${quantity} ${quantity === 1 ? 'muda selecionada' : 'mudas selecionadas'}` : 'Escolha as mudas na etapa 3'}</p></div>
    <p className="adoption-welcome-note"><ShieldCheck size={16} aria-hidden="true" />Retire ou plante somente após a confirmação da equipe.</p>
  </aside>;
}

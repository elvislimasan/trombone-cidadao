import React from 'react';
import { Store, Truck } from 'lucide-react';
import { AdoptionChoiceGroup } from './TreeAdoptionFields';
import { ADOPTION_CITY_ID, MUNICIPAL_NURSERY_LOCATION } from '@/lib/treeAdoption';

export default function TreeAdoptionFulfillment({ form, cityId, onChange, deliveryEnabled = true }) {
  if (form.request_type !== 'muda') return null;
  return <section className="grid min-w-0 gap-3" aria-label="Recebimento das mudas">
    <AdoptionChoiceGroup legend="Como quer receber as mudas?" value={form.fulfillment_method} onChange={fulfillment_method => onChange({ fulfillment_method })} options={[
      { value: 'retirada', label: 'Retirar no viveiro', description: 'Você busca as mudas após a confirmação.', icon: Store },
      ...(deliveryEnabled ? [{ value: 'entrega', label: 'Receber em casa', description: 'Entrega no endereço informado no pedido.', icon: Truck }] : []),
    ]} />
    {!deliveryEnabled && form.fulfillment_method === 'entrega' && <p role="status" className="text-sm text-content-secondary">As entregas estão desativadas. Selecione a retirada no viveiro para continuar.</p>}
    <p className="text-sm text-content-secondary">{form.fulfillment_method === 'entrega' && deliveryEnabled
      ? 'Confira o endereço de entrega na etapa Local. Aguarde a equipe confirmar a disponibilidade e combinar a entrega.'
      : `${String(cityId) === String(ADOPTION_CITY_ID) ? `Viveiro municipal: ${MUNICIPAL_NURSERY_LOCATION}. ` : ''}Escolha o viveiro na etapa Mudas e aguarde a confirmação antes de ir retirar.`}</p>
  </section>;
}

const DAY = 86400000;
export const PIPA_LEVELS = {
  empty: { label: 'Provavelmente vazia', short: 'Precisam de água', color: '#dc2626' },
  moderate: { label: 'Nível moderado', short: 'Moderadas', color: '#b77912' },
  full: { label: 'Provavelmente cheia', short: 'Cheias', color: '#0284c7' },
  unknown: { label: 'Sem estimativa', short: 'Sem estimativa', color: '#64748b' },
  inactive: { label: 'Desativada', short: 'Desativadas', color: '#94a3b8' },
};

// Consumo linear da capacidade cheia durante a média cadastrada. O saldo inicial
// desconhecido é zero. Um nível observado após a descarga substitui esse saldo;
// sem observação, somamos os volumes registrados, limitados à capacidade.
export function pipaWaterLevels(tanks, deliveries, requests, now = Date.now()) {
  const time = new Date(now).getTime(), events = new Map(), openUrgent = new Set();
  const add = (id, event) => { if (!events.has(id)) events.set(id, []); events.get(id).push(event); };
  for (const delivery of deliveries) {
    const at = Date.parse(delivery.delivered_at), liters = Number(delivery.liters);
    const observed = delivery.level_after_percent == null || delivery.level_after_percent === '' ? null : Number(delivery.level_after_percent);
    if (delivery.tank_id && Number.isFinite(at) && at <= time && liters > 0 && Number.isFinite(liters)) add(delivery.tank_id, { at, liters, after: Number.isInteger(observed) && observed >= 0 && observed <= 100 ? observed : null });
  }
  for (const request of requests) {
    if (!request.tank_id || request.kind !== 'urgent' || request.status === 'cancelled') continue;
    if (['pending', 'assigned', 'in_transit'].includes(request.status)) openUrgent.add(request.tank_id);
    const at = Date.parse(request.created_at);
    if (Number.isFinite(at) && at <= time) add(request.tank_id, { at, dry: true });
  }
  return new Map(tanks.map(tank => {
    const urgent = openUrgent.has(tank.id), days = Number(tank.emptying_days), capacity = Number(tank.capacity_liters);
    const history = (events.get(tank.id) || []).sort((a, b) => a.at - b.at || Number(b.dry || false) - Number(a.dry || false));
    const lastDelivery = history.filter(e => !e.dry).at(-1)?.at;
    const reportedDry = history.at(-1)?.dry === true;
    const result = { state: 'unknown', percent: null, emptyAt: null, lastDelivery: lastDelivery ? new Date(lastDelivery).toISOString() : null, urgent, reportedDry, needsAttention: urgent, reason: !(capacity > 0) ? 'Informe a capacidade para estimar o nível.' : !days ? 'Cadastre o tempo médio para esvaziar.' : 'Registre um abastecimento para iniciar a estimativa.' };
    if (tank.active === false) return [tank.id, { ...result, state: 'inactive', urgent: false, needsAttention: false, priority: 5 }];
    if (reportedDry) Object.assign(result, { state: 'empty', percent: 0, emptyAt: new Date(history.at(-1).at).toISOString(), reason: 'Caixa seca informada em uma solicitação.' });
    else if (Number.isInteger(days) && days >= 1 && days <= 365 && capacity > 0 && history.length) {
      let volume = 0, previous = history[0].at;
      for (const event of history) {
        volume = Math.max(0, volume - (event.at - previous) / DAY * capacity / days);
        volume = event.dry ? 0 : event.after != null ? capacity * event.after / 100 : Math.min(capacity, volume + event.liters);
        previous = event.at;
      }
      const emptyAt = previous + volume / capacity * days * DAY;
      volume = Math.max(0, volume - (time - previous) / DAY * capacity / days);
      const percent = Math.max(0, Math.min(100, Math.round(volume / capacity * 100)));
      Object.assign(result, { percent, emptyAt: new Date(emptyAt).toISOString(), state: percent <= 20 ? 'empty' : percent < 60 ? 'moderate' : 'full', reason: 'Estimativa pelo consumo médio e pelo nível informado após a entrega. Sem nível informado, considera os volumes registrados. Não é medição por sensor.' });
    }
    result.needsAttention = urgent || result.state === 'empty';
    result.priority = urgent || reportedDry ? 0 : ({ empty: 1, moderate: 2, unknown: 3, full: 4 })[result.state];
    return [tank.id, result];
  }));
}
export function pipaWaterPriority(a, b, levels) {
  const left = levels.get(a.id), right = levels.get(b.id);
  return (left?.priority ?? 3) - (right?.priority ?? 3) || (left?.percent ?? 100) - (right?.percent ?? 100) || a.name.localeCompare(b.name, 'pt-BR');
}

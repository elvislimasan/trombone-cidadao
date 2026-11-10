import test from 'node:test';
import assert from 'node:assert/strict';
import { pipaDefaultRoute, pipaRouteStops, pipaRouteTanks, pipaRoutePending } from '../lib/pipaRoutes.js';

const stops = [{ request_id:'r2',tank_id:'b',position:2,status:'assigned' },{ request_id:'r1',tank_id:'a',position:1,status:'completed' }];
test('mapa da rota mostra somente caixas pendentes e preserva todas fora do filtro', () => {
  const route={id:'route',stops}; const tanks=[{id:'a'},{id:'b'},{id:'c'}];
  assert.deepEqual(pipaRouteStops(route).map(s=>s.request_id),['r1','r2']);
  assert.deepEqual(pipaRouteTanks(tanks,route),[{id:'b'}]);
  assert.deepEqual(pipaRouteTanks(tanks,null),tanks);
  assert.equal(pipaRoutePending(route),true);
  assert.equal(pipaRoutePending({...route,cancelled:true}),false);
});
test('abertura prioriza rota municipal disponível hoje sem selecionar encerradas ou futuras', () => {
  const base={stops,scheduled_date:'2026-11-10',source:'driver'};
  const routes=[{...base,id:'mine'},{...base,id:'future',source:'municipality',scheduled_date:'2026-11-11'},{...base,id:'cancelled',cancelled:true},{...base,id:'city',source:'municipality'},{...base,id:'done',stops:[]}];
  assert.equal(pipaDefaultRoute(routes,[],'2026-11-10').id,'city');
  assert.equal(pipaDefaultRoute(routes,[],'2026-11-09'),undefined);
});
test('gestão e pipeiro usam a mesma ordem e situação de paradas', () => {
  const requests=stops.map(s=>({id:s.request_id,tank_id:s.tank_id,status:s.status,route_position:s.position,route_id:'route'}));
  assert.deepEqual(pipaRouteStops({id:'route'},requests),pipaRouteStops({id:'route',stops}));
});

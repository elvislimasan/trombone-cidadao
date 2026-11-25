import test from 'node:test';
import assert from 'node:assert/strict';
import { legislativePlaceSummary, legislativeRecentMonths } from '../lib/legislativeVisuals.js';

test('place indicators deduplicate matters across locations and per service', () => {
  const result=legislativePlaceSummary([{location_key:'a',service:'poda',reviewed:true,matters:[{id:1},{id:2}]},{location_key:'a',service:'limpeza',matters:[{id:1},{id:2}]},{location_key:'b',service:'poda',matters:[{id:2},{id:3}]}]);
  assert.equal(result.places,2);assert.equal(result.matters,3);assert.equal(result.reviewed,1);
  assert.equal(result.services.find(row=>row.key==='poda').value,3);
});
test('monthly chart keeps years distinct and clamps drill-down dates to the selected period', () => {
  const months=legislativeRecentMonths([{month:'2025-12',total:2},{month:'2026-02',total:1}],{start:'2025-12-15',end:'2026-02-10'});
  assert.deepEqual(months.map(row=>row.key),['2025-12','2026-01','2026-02']);
  assert.equal(months[0].start,'2025-12-15');assert.equal(months[2].end,'2026-02-10');assert.equal(months[1].value,0);
  assert.equal(legislativeRecentMonths([],{start:'2025-01-01',end:'2026-11-21'}).length,6);
});

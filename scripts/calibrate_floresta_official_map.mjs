// Calcula a transformação afim entre latitude/longitude e a planta AutoCAD.
// Consulta somente leitura; não altera nenhuma tabela do Supabase.
import fs from 'node:fs';

import officialMap from '../src/data/maps/florestaPeOfficialMap.js';
import { normalizarNomeDeRua } from '../src/lib/streetGeometry.js';

const env = {};
for (const line of fs.readFileSync('.env', 'utf8').split(/\r?\n/)) {
  const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (match) env[match[1]] = match[2];
}
const baseUrl = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY;
if (!baseUrl || !key) throw new Error('Credenciais do Supabase ausentes no .env');
const response = await fetch(`${baseUrl}/rest/v1/pavement_streets?${new URLSearchParams({
  select: 'name,bairro_id,path,bairro:bairros!pavement_streets_bairro_id_fkey(name)',
  city_id: 'eq.64',
  limit: '1000',
})}`, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
if (!response.ok) throw new Error(`${response.status} ${await response.text()}`);
const rows = await response.json();

const normalize = (value) => String(value || '').normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '').toUpperCase().trim();
const aliases = new Map([
  ['NE MANICOBA - AABB', 'AABB'],
  ['BELA FLORESTA - LOTEAMENTO ROCHA', 'BELA FLORESTA'],
]);
const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};

const groups = new Map();
for (const row of rows) {
  const name = aliases.get(normalize(row.bairro?.name)) || normalize(row.bairro?.name);
  const points = (row.path?.coordinates || []).flat();
  if (!name || points.length === 0) continue;
  groups.set(name, [...(groups.get(name) || []), ...points]);
}
const labelByName = new Map(officialMap.labels.map(([name, x, y]) => [normalize(name), [x, y]]));
const neighborhoodControls = [...groups].flatMap(([name, points]) => {
  const target = labelByName.get(name);
  if (!target) return [];
  return [{ name, lng: median(points.map(([lng]) => lng)), lat: median(points.map(([, lat]) => lat)), target }];
});

const streetsByName = new Map();
for (const row of rows) {
  const name = normalizarNomeDeRua(row.name);
  const lines = (row.path?.coordinates || []).filter((line) => line.length > 1);
  if (!name || lines.length === 0) continue;
  streetsByName.set(name, [...(streetsByName.get(name) || []), ...lines]);
}
const streetLabels = officialMap.streetLabels.flatMap(([name, x, y]) => {
  const lines = streetsByName.get(normalizarNomeDeRua(name));
  return lines?.length ? [{ name, target: [x, y], lines }] : [];
});

const solve3 = (matrix, vector) => {
  const rows3 = matrix.map((row, index) => [...row, vector[index]]);
  for (let column = 0; column < 3; column += 1) {
    let pivot = column;
    for (let row = column + 1; row < 3; row += 1) {
      if (Math.abs(rows3[row][column]) > Math.abs(rows3[pivot][column])) pivot = row;
    }
    [rows3[column], rows3[pivot]] = [rows3[pivot], rows3[column]];
    const divisor = rows3[column][column];
    for (let j = column; j < 4; j += 1) rows3[column][j] /= divisor;
    for (let row = 0; row < 3; row += 1) {
      if (row === column) continue;
      const factor = rows3[row][column];
      for (let j = column; j < 4; j += 1) rows3[row][j] -= factor * rows3[column][j];
    }
  }
  return rows3.map((row) => row[3]);
};
const ORIGIN = [-38.58, -8.60];
const fit = (controls, key) => {
  const normal = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  const target = [0, 0, 0];
  for (const control of controls) {
    const row = [control.lng - ORIGIN[0], control.lat - ORIGIN[1], 1];
    for (let i = 0; i < 3; i += 1) {
      target[i] += row[i] * control.target[key];
      for (let j = 0; j < 3; j += 1) normal[i][j] += row[i] * row[j];
    }
  }
  return solve3(normal, target);
};

const fitTransform = (controls) => ({
  origin: ORIGIN,
  x: fit(controls, 0),
  y: fit(controls, 1),
});
const project = ([lng, lat], transform) => [
  transform.x[0] * (lng - transform.origin[0]) + transform.x[1] * (lat - transform.origin[1]) + transform.x[2],
  transform.y[0] * (lng - transform.origin[0]) + transform.y[1] * (lat - transform.origin[1]) + transform.y[2],
];
const nearestControl = (label, transform) => {
  let nearest = null;
  for (const line of label.lines) {
    for (let index = 1; index < line.length; index += 1) {
      const geoA = line[index - 1];
      const geoB = line[index];
      const a = project(geoA, transform);
      const b = project(geoB, transform);
      const dx = b[0] - a[0];
      const dy = b[1] - a[1];
      const length2 = dx ** 2 + dy ** 2;
      const t = length2 > 0 ? Math.max(0, Math.min(1, (
        (label.target[0] - a[0]) * dx + (label.target[1] - a[1]) * dy
      ) / length2)) : 0;
      const point = [a[0] + dx * t, a[1] + dy * t];
      const error = Math.hypot(point[0] - label.target[0], point[1] - label.target[1]);
      if (!nearest || error < nearest.error) {
        nearest = {
          name: label.name,
          lng: geoA[0] + (geoB[0] - geoA[0]) * t,
          lat: geoA[1] + (geoB[1] - geoA[1]) * t,
          target: label.target,
          error,
        };
      }
    }
  }
  return nearest;
};

let transform = fitTransform(neighborhoodControls);
let controls = [];
for (let iteration = 0; iteration < 8; iteration += 1) {
  const candidates = streetLabels.map((label) => nearestControl(label, transform)).filter(Boolean);
  const errors = candidates.map((control) => control.error).sort((a, b) => a - b);
  const medianError = errors[Math.floor(errors.length / 2)];
  const threshold = Math.max(18, medianError * 2.5);
  controls = candidates.filter((control) => control.error <= threshold);
  transform = fitTransform([...controls, ...neighborhoodControls]);
}
const residuals = streetLabels.map((label) => nearestControl(label, transform));
const accepted = residuals.filter((item) => item.error <= 18);
console.log(JSON.stringify({
  neighborhoodControls: neighborhoodControls.length,
  matchedStreetLabels: streetLabels.length,
  acceptedStreetLabels: accepted.length,
  transform,
  rmsPageUnits: Math.sqrt(accepted.reduce((sum, item) => sum + item.error ** 2, 0) / accepted.length),
  residuals: residuals.sort((a, b) => b.error - a.error).slice(0, 30),
}, null, 2));

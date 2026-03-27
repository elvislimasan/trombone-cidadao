import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import JSZip from 'jszip';
import { XMLParser } from 'fast-xml-parser';
import { createClient } from '@supabase/supabase-js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

const asArray = (v) => (Array.isArray(v) ? v : v ? [v] : []);

const readEnvFile = async (p) => {
  try {
    const content = await fs.readFile(p, 'utf8');
    return content;
  } catch {
    return null;
  }
};

const loadDotenv = async () => {
  const candidates = [
    path.join(repoRoot, '.env'),
    path.join(repoRoot, '.env.local'),
    path.join(repoRoot, '.env.development'),
    path.join(repoRoot, '.env.development.local'),
  ];

  for (const p of candidates) {
    const content = await readEnvFile(p);
    if (!content) continue;

    for (const rawLine of content.split('\n')) {
      const line = rawLine.trim();
      if (!line) continue;
      if (line.startsWith('#')) continue;
      const eq = line.indexOf('=');
      if (eq === -1) continue;
      const key = line.slice(0, eq).trim();
      let value = line.slice(eq + 1).trim();
      if (!key) continue;
      if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
      if (value.startsWith("'") && value.endsWith("'")) value = value.slice(1, -1);
      if (!(key in process.env)) process.env[key] = value;
    }
  }
};

const normalizeKey = (k) =>
  String(k || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/\s+/g, '_');

const pickFromProps = (props, candidates) => {
  const norm = new Map(Object.entries(props || {}).map(([k, v]) => [normalizeKey(k), v]));
  for (const c of candidates) {
    const v = norm.get(normalizeKey(c));
    if (v !== undefined && v !== null && String(v).trim() !== '') return String(v).trim();
  }
  return null;
};

const parseExtendedData = (placemark) => {
  const props = {};
  const ext = placemark?.ExtendedData;
  if (!ext) return props;

  for (const d of asArray(ext.Data)) {
    const name = d?.['@_name'] ?? d?.name;
    const value = d?.value ?? d?.Value;
    if (name && value !== undefined) props[String(name)] = typeof value === 'object' && value?.['#text'] ? value['#text'] : value;
  }

  for (const sd of asArray(ext.SchemaData)) {
    for (const s of asArray(sd?.SimpleData)) {
      const name = s?.['@_name'] ?? s?.name;
      const value = typeof s === 'object' && s?.['#text'] !== undefined ? s['#text'] : s;
      if (name && value !== undefined) props[String(name)] = value;
    }
  }

  return props;
};

const getPlacemarkPoint = (placemark) => {
  const point = placemark?.Point;
  if (!point) return null;
  const coordsRaw = typeof point?.coordinates === 'string' ? point.coordinates : point?.coordinates?.['#text'];
  if (!coordsRaw) return null;
  const first = String(coordsRaw).trim().split(/\s+/)[0];
  const [lngStr, latStr] = first.split(',');
  const lng = Number(lngStr);
  const lat = Number(latStr);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
};

const walkKml = (node, ctx, out) => {
  if (!node || typeof node !== 'object') return;

  const folders = asArray(node.Folder);
  for (const f of folders) {
    const name = typeof f?.name === 'string' ? f.name.trim() : null;
    const next = { ...ctx, layer: name || ctx.layer };
    walkKml(f, next, out);
  }

  const documents = asArray(node.Document);
  for (const d of documents) walkKml(d, ctx, out);

  const placemarks = asArray(node.Placemark);
  for (const pm of placemarks) {
    const point = getPlacemarkPoint(pm);
    if (!point) continue;

    const raw = parseExtendedData(pm);
    const name = typeof pm?.name === 'string' ? pm.name.trim() : null;
    const identifier =
      pickFromProps(raw, ['identifier', 'id', 'codigo', 'código', 'poste', 'numero', 'número', 'num_poste', 'n_poste', 'n']) ||
      name;
    const plate = pickFromProps(raw, ['plaqueta', 'placa', 'plate', 'etiqueta']);
    const address = pickFromProps(raw, ['endereco', 'endereço', 'logradouro', 'rua', 'avenida', 'bairro']);

    const featureId = pm?.['@_id'] ? String(pm['@_id']) : null;
    const layer = ctx.layer || null;
    const sourceKey = [
      layer || '',
      featureId || '',
      identifier || '',
      plate || '',
      point.lng.toFixed(6),
      point.lat.toFixed(6),
    ].join('|');

    out.push({
      ...point,
      identifier: identifier || null,
      plate: plate || null,
      address: address || null,
      source_layer: layer,
      source_feature_id: featureId,
      source_key: sourceKey,
      raw_properties: raw,
    });
  }

  for (const [k, v] of Object.entries(node)) {
    if (k === 'Folder' || k === 'Document' || k === 'Placemark') continue;
    if (typeof v === 'object') walkKml(v, ctx, out);
  }
};

const findKmlText = async (kmzBuffer) => {
  const zip = await JSZip.loadAsync(kmzBuffer);
  const all = Object.keys(zip.files).filter((f) => f.toLowerCase().endsWith('.kml'));
  if (!all.length) throw new Error('Nenhum .kml encontrado dentro do KMZ');
  const preferred = all.find((f) => f.toLowerCase().endsWith('doc.kml')) || all[0];
  return zip.files[preferred].async('text');
};

const chunk = (arr, size) => {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
};

export const main = async () => {
  await loadDotenv();

  const kmzPath = process.argv[2] || path.join(repoRoot, '.trae', 'documents', 'FLORESTA.kmz');
  const datasetName = process.argv[3] || `FLORESTA ${new Date().toISOString().slice(0, 10)}`;
  const source = process.argv[4] || 'KMZ';

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  const authEmail = process.env.SUPABASE_EMAIL;
  const authPassword = process.env.SUPABASE_PASSWORD;

  if (!supabaseUrl) throw new Error('Defina SUPABASE_URL (ou VITE_SUPABASE_URL) no ambiente');
  if (!serviceRoleKey && !(anonKey && authEmail && authPassword)) {
    throw new Error('Defina SUPABASE_SERVICE_ROLE_KEY ou (SUPABASE_ANON_KEY + SUPABASE_EMAIL + SUPABASE_PASSWORD)');
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey || anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  if (!serviceRoleKey) {
    const { error } = await supabase.auth.signInWithPassword({ email: authEmail, password: authPassword });
    if (error) throw error;

    const { data: authData, error: authErr } = await supabase.auth.getUser();
    if (authErr) throw authErr;

    const { data: profile, error: profileErr } = await supabase
      .from('profiles')
      .select('id, is_admin')
      .eq('id', authData.user.id)
      .maybeSingle();
    if (profileErr) throw profileErr;

    if (!profile?.is_admin) {
      throw new Error('Usuário autenticado não é admin (profiles.is_admin != true). Use um admin ou SUPABASE_SERVICE_ROLE_KEY.');
    }
  }

  const kmzBuffer = await fs.readFile(kmzPath);
  const contentHash = crypto.createHash('sha256').update(kmzBuffer).digest('hex');

  const kmlText = await findKmlText(kmzBuffer);
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_', textNodeName: '#text' });
  const parsed = parser.parse(kmlText);

  const root = parsed?.kml || parsed;
  const collected = [];
  walkKml(root, { layer: null }, collected);

  if (!collected.length) throw new Error('Nenhum Placemark com Point encontrado no KML');

  const { data: datasetRow, error: datasetErr } = await supabase
    .from('pole_datasets')
    .insert({ name: datasetName, source, content_hash: contentHash })
    .select('id')
    .single();
  if (datasetErr) throw datasetErr;

  const datasetId = datasetRow.id;
  const rows = collected.map((p) => ({
    dataset_id: datasetId,
    source_layer: p.source_layer,
    source_feature_id: p.source_feature_id,
    source_key: p.source_key,
    identifier: p.identifier,
    plate: p.plate,
    address: p.address,
    geom: `SRID=4326;POINT(${p.lng} ${p.lat})`,
    latitude: p.lat,
    longitude: p.lng,
    raw_properties: p.raw_properties,
  }));

  console.log(`Dataset criado: ${datasetId}`);
  console.log(`Postes detectados no KML: ${rows.length}`);

  let inserted = 0;
  for (const batch of chunk(rows, 500)) {
    const { error } = await supabase.from('poles').upsert(batch, { onConflict: 'dataset_id,source_key' });
    if (error) throw error;
    inserted += batch.length;
    console.log(`Upsert: ${inserted}/${rows.length}`);
  }

  console.log('Importação finalizada');
};

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch((err) => {
    console.error(err?.message || err);
    process.exitCode = 1;
  });
}

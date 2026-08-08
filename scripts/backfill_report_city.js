#!/usr/bin/env node
// Backfill Fase 0: preenche city_id em reports e profiles.
//
// Uso:
//   DEV_DB_PASSWORD=xxx node scripts/backfill_report_city.js [--dry-run]
//   PROD_DB_PASSWORD=xxx DB_USER=postgres.<proj-id> node scripts/backfill_report_city.js [--dry-run]
//
// Idempotente: só processa linhas com city_id NULL.
// Rate-limit Nominatim: ~1 req/s (NOMINATIM_DELAY_MS = 1100ms).
// Commit em lotes de BATCH_SIZE após cada atualização.

// ESM: o package.json tem "type": "module", entao `require` nao existe aqui.
import pg from 'pg';
import https from 'node:https';

const { Pool } = pg;

const DRY_RUN = process.argv.includes('--dry-run');
const BATCH_SIZE = 50;
const NOMINATIM_DELAY_MS = 1100;
const MAX_RETRIES = 3;

// Mapa nome-do-estado → UF (fallback quando ISO3166-2 não vem do Nominatim)
const STATE_NAME_TO_UF = {
  'Acre': 'AC', 'Alagoas': 'AL', 'Amapá': 'AP', 'Amazonas': 'AM',
  'Bahia': 'BA', 'Ceará': 'CE', 'Distrito Federal': 'DF',
  'Espírito Santo': 'ES', 'Goiás': 'GO', 'Maranhão': 'MA',
  'Mato Grosso': 'MT', 'Mato Grosso do Sul': 'MS', 'Minas Gerais': 'MG',
  'Pará': 'PA', 'Paraíba': 'PB', 'Paraná': 'PR', 'Pernambuco': 'PE',
  'Piauí': 'PI', 'Rio de Janeiro': 'RJ', 'Rio Grande do Norte': 'RN',
  'Rio Grande do Sul': 'RS', 'Rondônia': 'RO', 'Roraima': 'RR',
  'Santa Catarina': 'SC', 'São Paulo': 'SP', 'Sergipe': 'SE',
  'Tocantins': 'TO',
};

const password = process.env.DEV_DB_PASSWORD || process.env.PROD_DB_PASSWORD;
const dbUser = process.env.DB_USER || 'postgres.xxdletrjyjajtrmhwzev';
const DEFAULT_CITY_UF = process.env.DEFAULT_CITY_UF || 'Floresta,PE';

// O host do pooler inclui a regiao do projeto -- usar a regiao errada da
// "tenant/user not found". dev (xxdletrjyjajtrmhwzev) = us-east-1;
// prod (mrejgpcxaevooofyenzq) = sa-east-1. Deduzido do ref em DB_USER,
// com DB_REGION disponivel para sobrescrever.
const PROJECT_REGIONS = {
  'postgres.xxdletrjyjajtrmhwzev': 'us-east-1',
  'postgres.mrejgpcxaevooofyenzq': 'sa-east-1',
};
const dbRegion = process.env.DB_REGION || PROJECT_REGIONS[dbUser] || 'us-east-1';
const dbHost = `aws-1-${dbRegion}.pooler.supabase.com`;

if (!password) {
  console.error('Defina DEV_DB_PASSWORD ou PROD_DB_PASSWORD');
  process.exit(1);
}

const pool = new Pool({
  host: dbHost,
  port: 5432,
  database: 'postgres',
  user: dbUser,
  password,
  ssl: { rejectUnauthorized: false },
  max: 3,
});

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// Extrai cidade e UF do JSON bruto do Nominatim
function extractCityUF(raw) {
  if (!raw || !raw.address) return null;
  const addr = raw.address;
  const city = addr.city || addr.town || addr.village || addr.municipality;
  let uf = null;
  if (addr['ISO3166-2-lvl4']) {
    const parts = addr['ISO3166-2-lvl4'].split('-');
    if (parts.length === 2) uf = parts[1];
  }
  if (!uf && addr.state) {
    uf = STATE_NAME_TO_UF[addr.state] || null;
  }
  if (!city || !uf) return null;
  return { city, uf };
}

// Chama Nominatim com retry e backoff exponencial
async function reverseGeocode(lat, lng, attempt = 1) {
  return new Promise((resolve) => {
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&addressdetails=1&accept-language=pt-BR`;
    const req = https.get(url, {
      headers: { 'User-Agent': 'TromboneCidadao-backfill/1.0 (lairtondasilva07@gmail.com)' }
    }, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch { resolve(null); }
      });
    });
    req.on('error', () => resolve(null));
    req.setTimeout(10000, () => { req.destroy(); resolve(null); });
  });
}

async function matchCity(client, city, uf) {
  const res = await client.query(
    'select public.match_city($1, $2) as city_id',
    [city, uf]
  );
  return res.rows[0]?.city_id || null;
}

async function backfillReports(pool) {
  const client = await pool.connect();
  try {
    // reports com city_id NULL que têm coordenada (location geometry PostGIS)
    const { rows: reports } = await client.query(`
      select
        r.id,
        st_y(r.location::geometry) as lat,
        st_x(r.location::geometry) as lng,
        r.author_id,
        p.city_id as author_city_id
      from public.reports r
      left join public.profiles p on p.id = r.author_id
      where r.city_id is null
        and r.location is not null
      order by r.created_at
    `);

    console.log(`\n=== BACKFILL REPORTS (${DRY_RUN ? 'DRY-RUN' : 'REAL'}) ===`);
    console.log(`Reports sem city_id: ${reports.length}`);

    let geocodeCount = 0, authorCount = 0, unresolvedCount = 0;
    let batchUpdates = [];

    for (let i = 0; i < reports.length; i++) {
      const r = reports[i];
      let cityId = null;
      let origin = 'unresolved';

      // 1. Reverse-geocode via Nominatim (rate-limited)
      if (r.lat && r.lng) {
        await sleep(NOMINATIM_DELAY_MS);
        let raw = null;
        for (let attempt = 1; attempt <= MAX_RETRIES && !raw; attempt++) {
          raw = await reverseGeocode(r.lat, r.lng);
          if (!raw && attempt < MAX_RETRIES) await sleep(attempt * 2000);
        }
        if (raw) {
          const extracted = extractCityUF(raw);
          if (extracted) {
            cityId = await matchCity(client, extracted.city, extracted.uf);
            if (cityId) origin = 'geocode';
          }
        }
      }

      // 2. Fallback: city_id do autor do report
      if (!cityId && r.author_city_id) {
        cityId = r.author_city_id;
        origin = 'author';
      }

      if (cityId) {
        if (origin === 'geocode') geocodeCount++;
        else authorCount++;
        batchUpdates.push({ id: r.id, city_id: cityId });
      } else {
        unresolvedCount++;
        console.log(`  UNRESOLVED: report ${r.id} (lat=${r.lat}, lng=${r.lng})`);
      }

      // Gravar lote
      if (!DRY_RUN && batchUpdates.length >= BATCH_SIZE) {
        for (const b of batchUpdates) {
          await client.query('update public.reports set city_id=$1 where id=$2', [b.city_id, b.id]);
        }
        console.log(`  [${i + 1}/${reports.length}] lote de ${batchUpdates.length} gravado`);
        batchUpdates = [];
      } else if ((i + 1) % 10 === 0) {
        process.stdout.write(`  progresso: ${i + 1}/${reports.length}\r`);
      }
    }

    // Último lote
    if (!DRY_RUN && batchUpdates.length > 0) {
      for (const b of batchUpdates) {
        await client.query('update public.reports set city_id=$1 where id=$2', [b.city_id, b.id]);
      }
    }

    const total = reports.length;
    console.log(`\n--- Relatório Reports ---`);
    console.log(`Total:        ${total}`);
    console.log(`geocode:      ${geocodeCount} (${pct(geocodeCount, total)}%)`);
    console.log(`author:       ${authorCount} (${pct(authorCount, total)}%)`);
    console.log(`unresolved:   ${unresolvedCount} (${pct(unresolvedCount, total)}%)`);
    if (DRY_RUN) console.log(`[dry-run: nenhuma linha gravada]`);
  } finally {
    client.release();
  }
}

async function backfillProfiles(pool) {
  const client = await pool.connect();
  try {
    const { rows: profiles } = await client.query(`
      select id, city
      from public.profiles
      where city_id is null and city is not null and city <> ''
      order by id
    `);

    console.log(`\n=== BACKFILL PROFILES (${DRY_RUN ? 'DRY-RUN' : 'REAL'}) ===`);
    console.log(`Profiles sem city_id com city texto: ${profiles.length}`);

    let resolved = 0, unresolved = 0;

    for (const p of profiles) {
      const cityText = (p.city || '').trim();
      let cityId = null;

      // Parsear "Floresta-PE", "Floresta - PE", "Floresta/PE", "Floresta (PE)" etc.
      const matchUF = cityText.match(/^(.+?)[\s\-\/]+\(?([A-Z]{2})\)?$/i);
      if (matchUF) {
        const name = matchUF[1].trim();
        const uf = matchUF[2].toUpperCase();
        cityId = await matchCity(client, name, uf);
      } else {
        // city sem UF: resolve se exatamente 1 no Brasil
        const res = await client.query(
          `select id from public.cities
           where unaccent(lower(trim(name))) = unaccent(lower(trim($1)))`,
          [cityText]
        );
        if (res.rowCount === 1) {
          cityId = res.rows[0].id;
        } else if (res.rowCount > 1 && DEFAULT_CITY_UF) {
          // ambíguo — usa fallback se o nome bater com a cidade padrão
          const [defName, defUF] = DEFAULT_CITY_UF.split(',');
          const norm = (s) => s.toLowerCase().trim().normalize('NFD').replace(/[̀-ͯ]/g, '');
          if (norm(cityText) === norm(defName)) {
            cityId = await matchCity(client, defName, defUF);
          }
        }
      }

      if (cityId) {
        resolved++;
        if (!DRY_RUN) {
          await client.query('update public.profiles set city_id=$1 where id=$2', [cityId, p.id]);
        }
      } else {
        unresolved++;
        console.log(`  UNRESOLVED profile ${p.id}: "${cityText}"`);
      }
    }

    const total = profiles.length;
    console.log(`\n--- Relatório Profiles ---`);
    console.log(`Total com city texto:  ${total}`);
    console.log(`Resolvidos:            ${resolved} (${pct(resolved, total)}%)`);
    console.log(`Unresolved:            ${unresolved} (${pct(unresolved, total)}%)`);
    if (DRY_RUN) console.log(`[dry-run: nenhuma linha gravada]`);
  } finally {
    client.release();
  }
}

function pct(n, total) {
  return total === 0 ? '0.0' : ((n / total) * 100).toFixed(1);
}

async function main() {
  console.log(`Modo: ${DRY_RUN ? 'DRY-RUN' : 'REAL'}`);
  console.log(`DB user: ${dbUser}`);
  console.log(`DB host: ${dbHost}`);
  try {
    await backfillReports(pool);
    await backfillProfiles(pool);
  } finally {
    await pool.end();
  }
}

main().catch(err => { console.error(err); process.exit(1); });

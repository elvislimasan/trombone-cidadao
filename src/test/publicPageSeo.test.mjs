import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { XMLParser } from 'fast-xml-parser';
import { guidePageSeo, publicDetailSeo, seoText } from '../lib/publicPageSeo.js';

const category = { id: 'comer', name: 'Onde comer' };
const base = { categoryId: category.id, category, cityId: null, loading: false, dataReady: true };

test('categoria vazia só recebe noindex depois de uma consulta bem sucedida', () => {
  assert.equal(guidePageSeo({ ...base, entries: [] }).robots, 'noindex');
  assert.equal(guidePageSeo({ ...base, loading: true }).robots, undefined);
  assert.equal(guidePageSeo({ ...base, dataReady: false }).robots, undefined);
  assert.equal(guidePageSeo({ ...base, entries: [{ name: 'Restaurante da Praça' }] }).robots, undefined);
  assert.equal(guidePageSeo({ ...base, category: null }).robots, 'noindex');
  assert.equal(guidePageSeo({ ...base, categoryId: undefined, category: null }).robots, undefined);
});

test('metadados do guia descrevem a categoria e os locais realmente cadastrados', () => {
  const seo = guidePageSeo({ ...base, entries: [{ name: 'Restaurante da Praça' }] });
  assert.match(seo.title, /Onde comer/);
  assert.match(seo.description, /1 local cadastrado/);
  assert.match(seo.description, /Restaurante da Praça/);
  assert.equal(seo.url, 'https://trombonecidadao.com.br/guia-da-cidade/categoria/comer?cidade=todas');
});

test('canônica preserva cidade específica e consolida a entrada geral do guia', () => {
  const seo = guidePageSeo({ ...base, cityId: 64, cityName: 'Floresta', entries: [{ name: 'Restaurante' }] });
  assert.match(seo.title, /em Floresta/);
  assert.match(seo.description, /em Floresta/);
  assert.equal(seo.url, 'https://trombonecidadao.com.br/guia-da-cidade/categoria/comer?cidade=64');
  assert.equal(guidePageSeo({ cityId: 64, cityName: 'Floresta' }).url, 'https://trombonecidadao.com.br/guia-da-cidade?cidade=64');
  assert.equal(guidePageSeo({ cityId: null }).url, 'https://trombonecidadao.com.br/guia-da-cidade');
});

test('metadados de conteúdo público removem HTML e mantêm a URL de cada registro', () => {
  const news = publicDetailSeo({ path: 'noticias', id: 'abc', title: 'Notícia', description: '<p>Texto &amp; contexto</p>' });
  assert.equal(news.description, 'Texto & contexto');
  assert.equal(news.url, 'https://trombonecidadao.com.br/noticias/abc');
  const work = publicDetailSeo({ path: 'obras-publicas', id: 'obra', title: 'Ampliação da ETA', description: 'x'.repeat(300) });
  assert.equal(work.description.length, 160);
  assert.equal(work.url, 'https://trombonecidadao.com.br/obras-publicas/obra');
  assert.equal(seoText(null), '');
});

test('sitemap inclui conteúdo público auditado e exclui categorias vazias e cópias', () => {
  const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
  const audit = JSON.parse(read('docs/auditoria-rastreadas-nao-indexadas-2026-10-07.json'));
  const urls = new Set(new XMLParser().parse(read('public/sitemap.xml')).urlset.url.map(({ loc }) => loc));
  for (const row of audit.urls) {
    if (!row.public_record_found || row.lookup_error) continue;
    const canonical = row.url.replace('https://www.', 'https://');
    const excluded = row.status === 'duplicate' || (row.group === 'categories' && (!row.active || !row.approved_entries));
    assert.equal(urls.has(canonical), !excluded, canonical);
  }
  const redirects = JSON.parse(read('docs/auditoria-paginas-redirecionamento-2026-10-07.json'));
  for (const [path, result] of Object.entries(redirects.public_records)) {
    assert.equal(result.status, 200);
    for (const record of result.data) {
      const destination = `https://trombonecidadao.com.br/${path}/${record.id}`;
      assert.ok(urls.has(destination), destination);
    }
  }
  const migrated = redirects.query_checks.migrated_spot.data[0];
  assert.equal(migrated.status, 'approved');
  assert.ok(urls.has(`https://trombonecidadao.com.br/guia-da-cidade/guia/${migrated.id}`));
  assert.ok(!urls.has(`https://trombonecidadao.com.br/guia-da-cidade/ponto-turistico/${migrated.legacy_source_id}`));
});

test('sitemap cobre páginas públicas da lista de 12 de outubro sem incluir categorias vazias', () => {
  const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
  const audit = JSON.parse(read('docs/auditoria-rastreadas-nao-indexadas-2026-10-12.json'));
  const locations = new XMLParser().parse(read('public/sitemap.xml')).urlset.url.map(({ loc }) => loc);
  const urls = new Set(locations);
  assert.equal(locations.length, urls.size, 'Sitemap não deve repetir URLs');
  for (const row of audit.urls) {
    if (!row.public_record_found || row.lookup_error) continue;
    const excluded = (row.group === 'categories' && (!row.active || !row.approved_entries))
      || (row.group === 'reports' && (row.status === 'duplicate' || row.moderation_status !== 'approved'))
      || (row.group === 'petitions' && !['open', 'closed', 'victory'].includes(row.status))
      || (row.group === 'profiles' && !row.public_profile_enabled);
    assert.equal(urls.has(row.canonical), !excluded, row.canonical);
  }
});

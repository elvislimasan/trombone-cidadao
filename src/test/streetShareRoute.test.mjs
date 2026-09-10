import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const ler = (caminho) => readFile(new URL(`../../${caminho}`, import.meta.url), 'utf8');

test('o Apache encaminha links compartilhados de rua para o preview social de producao', async () => {
  const htaccess = await ler('public/.htaccess');

  assert.match(
    htaccess,
    /RewriteRule \^share\/rua\/\(\.\*\)\$ https:\/\/mrejgpcxaevooofyenzq\.supabase\.co\/functions\/v1\/share-street\?id=\$1 \[R=302,L\]/
  );
});

test('o SPA abre a rua se o proxy da hospedagem nao interceptar o link', async () => {
  const app = await ler('src/App.jsx');

  assert.match(
    app,
    /<Route path="\/share\/rua\/:streetId" element=\{<PavementStreetPage \/>\} \/>/
  );
});

test('o clique abre o detalhe antes de depender da consulta da previa social', async () => {
  const edgeFunction = await ler('supabase/functions/share-street/index.ts');
  const redirectHumano = edgeFunction.indexOf('if (!isBot)');
  const consultaDaPrevia = edgeFunction.indexOf(".from('pavement_streets')");

  assert.ok(redirectHumano >= 0, 'a funcao deve distinguir o clique humano');
  assert.ok(consultaDaPrevia >= 0, 'a funcao deve consultar os dados da previa');
  assert.ok(
    redirectHumano < consultaDaPrevia,
    'o clique humano nao pode depender da consulta de metadados'
  );
  assert.doesNotMatch(
    edgeFunction,
    /Location: `\$\{appUrl\}\/mapa-pavimentacao`/,
    'falhas de previa nao podem mandar o visitante ao mapa geral'
  );
});

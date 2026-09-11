import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

test('página sem titular oferece solicitação e preserva o retorno após cadastro', async () => {
  const page = await read('src/pages/CouncilorProfilePage.jsx');

  assert.match(page, /Solicitar vínculo/);
  assert.match(page, /navigate\('\/cadastro'/);
  assert.match(page, /tc_post_login_redirect/);
  assert.match(page, /\.rpc\('request_councilor_link'/);
});

test('solicitação não concede acesso sem aprovação administrativa', async () => {
  const migration = await read('supabase/migrations/247_councilor_link_requests.sql');

  assert.match(migration, /status text not null default 'pending'/);
  assert.match(migration, /Somente administradores podem analisar solicitacoes/);
  assert.match(migration, /create or replace function public\.review_councilor_link_request/);
  assert.match(migration, /claim_status = 'linked'/);
  assert.doesNotMatch(migration, /claim_status = 'verified'/);
});

test('admin visualiza, aprova e recusa solicitações pendentes', async () => {
  const [page, adminPage] = await Promise.all([
    read('src/pages/admin/ManageCouncilorsPage.jsx'),
    read('src/pages/admin/AdminPage.jsx'),
  ]);

  assert.match(page, /Solicitações de vínculo/);
  assert.match(page, /\.from\('councilor_link_requests'\)/);
  assert.match(page, /\.rpc\('review_councilor_link_request'/);
  assert.match(page, /Aprovar<\/Button>/);
  assert.match(page, /Recusar<\/Button>/);
  assert.match(adminPage, /to: '\/admin\/vereadores'/);
  assert.match(adminPage, /Vereadores e vínculos/);
  assert.match(adminPage, /solicitações de vínculo/);
  assert.match(adminPage, /'\/admin\/vereadores': \(\) => supabase/);
});

test('uma conta vinculada não consegue solicitar nem receber uma segunda página', async () => {
  const [migration, publicPage, managePage] = await Promise.all([
    read('supabase/migrations/248_single_councilor_page_per_account.sql'),
    read('src/pages/CouncilorProfilePage.jsx'),
    read('src/pages/admin/ManageCouncilorsPage.jsx'),
  ]);

  assert.match(migration, /create unique index if not exists councilors_one_page_per_account_idx/);
  assert.match(migration, /if exists \(select 1 from public\.councilors where user_id = auth\.uid\(\)\)/);
  assert.match(migration, /Esta conta ja possui uma pagina legislativa vinculada/);
  assert.match(migration, /requester_id = v_request\.requester_id/);
  assert.match(publicPage, /const \[managedPage, setManagedPage\]/);
  assert.match(publicPage, /requestStatus === 'pending' \|\| managedPage/);
  assert.match(publicPage, /Você já gerencia uma página/);
  assert.match(publicPage, /!isAdmin && !managedPage/);
  assert.match(managePage, /const linkableProfiles = useMemo/);
  assert.match(managePage, /\.filter\(\(item\) => item\.id !== editing\?\.id && item\.user_id\)/);
});

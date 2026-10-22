import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

export async function validateMunicipalReportInsert({ db, ids, asUser, check }) {
  await db.query("reset role; select set_config('request.jwt.claim.sub','',false)");
  await db.query(`
    alter table reports add column if not exists is_anonymous boolean default false;
    alter table reports enable row level security;
    grant select,insert on reports to authenticated;
    grant select on reports to anon;
    -- No banco real os helpers de perfil usam SECURITY DEFINER; o fixture
    -- original os criou como invoker e nunca consultava reports como anon.
    alter function public.is_admin(uuid) security definer;
    alter function public.is_master(uuid) security definer;
    create policy report_insert_fixture_select on reports for select
      using(is_public or author_id=auth.uid() or public.pode_acessar_prefeitura(auth.uid(),city_id));
    create policy report_insert_fixture_author on reports for insert to authenticated
      with check(author_id=auth.uid());
    create policy reports_hide_internal_municipal on reports as restrictive for select
      using(is_public or author_id=auth.uid() or public.is_admin(auth.uid()) or public.is_master(auth.uid())
        or (created_by_municipality is not null and public.pode_acessar_prefeitura(auth.uid(),city_id)));
  `);
  const source = await fs.readFile('supabase/migrations/307_solicitacoes_municipais_visibilidade.sql', 'utf8');
  const start = source.indexOf('create or replace function public.validate_municipal_report_author()');
  await db.query(source.slice(start, source.indexOf('$$;', start) + 3));
  await db.query(`create trigger zzzz_validate_municipal_report_author before insert or update of created_by_municipality,is_public,moderation_status
    on reports for each row execute function public.validate_municipal_report_author()`);
  const staff = randomUUID(), outsider = randomUUID();
  await db.query("insert into profiles(id,name,user_type) values($1,'Atendente da iluminação','public_official'),($2,'Sem vínculo','citizen')", [staff, outsider]);
  await db.query("insert into prefeitura_membros(prefeitura_id,user_id,papel,ativo) values($1,$2,'colaborador',true)", [ids.pref, staff]);
  const member = (await db.query("insert into orgao_membros(canal_id,user_id,papel,ativo) values($1,$2,'operador',true) returning id", [ids.channel, staff])).rows[0].id;
  await asUser(ids.admin);
  await db.query("select set_municipal_staff_roles($1,array['atendente'],true,0)", [member]);
  const insert = (author, category = 'iluminacao', city = 1, municipality = ids.pref, isPublic = false) => db.query(`
    insert into reports(id,title,city_id,category_id,location,author_id,created_by_municipality,is_public,moderation_status)
    values($1,'Solicitação municipal via formulário',$2,$3,point(-8.6,-38.5),$4,$5,$6,'pending_approval')
    returning id,author_id,city_id,category_id,is_public,moderation_status,created_by_municipality`,
  [randomUUID(), city, category, author, municipality, isPublic]);
  await check('reproduz o 42501 da policy antiga no INSERT RETURNING de solicitação interna', async () => {
    await assert.rejects(insert(ids.admin), error => error.code === '42501' && /reports_responsibility_scope/.test(error.message));
  });
  await db.query('reset role');
  const migration = await fs.readFile('supabase/migrations/386_municipal_report_insert_returning_scope.sql', 'utf8');
  await db.query(migration);
  await db.query(migration);
  let lighting, pruning, staffReport;
  await check('administrador cadastra solicitações internas de Iluminação e Poda com RETURNING', async () => {
    await asUser(ids.admin);
    lighting = (await insert(ids.admin)).rows[0];
    pruning = (await insert(ids.admin, 'poda')).rows[0];
    for (const report of [lighting, pruning]) {
      assert.equal(report.is_public, false);
      assert.equal(report.moderation_status, 'internal');
      assert.equal(report.author_id, ids.admin);
      assert.equal(report.created_by_municipality, ids.pref);
    }
    assert.equal((await db.query('select municipal_report_access($1,$2) allowed', [ids.admin, pruning.id])).rows[0].allowed, true);
    assert.equal((await db.query('select municipal_report_access($1,$2) allowed', [ids.admin, randomUUID()])).rows[0].allowed, false);
  });
  await check('atendente cadastra e recebe a solicitação interna da própria secretaria', async () => {
    await asUser(staff);
    staffReport = (await insert(staff)).rows[0];
    assert.equal(staffReport.moderation_status, 'internal');
    assert.equal((await db.query('select id from reports where id=$1', [staffReport.id])).rowCount, 1);
  });
  await check('cadastro mantém bloqueios de secretaria, autoria e município', async () => {
    await asUser(staff);
    await assert.rejects(insert(staff, 'poda'), error => error.code === '42501');
    await assert.rejects(insert(ids.admin), /permissão|policy|autoria/);
    await assert.rejects(insert(staff, 'iluminacao', 2, ids.otherPref), /permissão|policy/);
    assert.equal((await db.query('select id from reports where id=$1', [pruning.id])).rowCount, 0);
    await asUser(outsider);
    assert.equal((await db.query('select id from reports where id=any($1::uuid[])', [[lighting.id, pruning.id, staffReport.id]])).rowCount, 0);
    await asUser(null, 'anon');
    assert.equal((await db.query('select id from reports where id=any($1::uuid[])', [[lighting.id, pruning.id, staffReport.id]])).rowCount, 0);
  });
  await check('solicitação pública conserva o retorno do formulário e a leitura pública', async () => {
    await asUser(ids.admin);
    const report = (await insert(ids.admin, 'poda', 1, ids.pref, true)).rows[0];
    assert.equal(report.moderation_status, 'approved');
    await asUser(null, 'anon');
    assert.equal((await db.query('select id from reports where id=$1', [report.id])).rowCount, 1);
  });
  await check('encaminhar um caso revoga a leitura da secretaria anterior, inclusive do autor', async () => {
    await db.query("reset role; select set_config('request.jwt.claim.sub','',false)");
    const agriculture = (await db.query("select canal_id from orgao_categorias where city_id=1 and category_id='poda'")).rows[0].canal_id;
    await db.query('insert into orgao_casos(report_id,canal_id) values($1,$2)', [staffReport.id, agriculture]);
    await asUser(staff);
    assert.equal((await db.query('select id from reports where id=$1', [staffReport.id])).rowCount, 0);
    await asUser(ids.admin);
    assert.equal((await db.query('select id from reports where id=$1', [staffReport.id])).rowCount, 1);
  });
}

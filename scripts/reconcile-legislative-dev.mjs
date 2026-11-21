// One-time DEV reconciliation. Production is never a writable target.
// Pass the Supabase management token through stdin or SUPABASE_ACCESS_TOKEN.
import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';

const project = 'xxdletrjyjajtrmhwzev';
const mode = process.argv[2] || '--plan';
assert.ok(['--plan', '--dry-run', '--apply'].includes(mode) && process.argv.length <= 3, 'Use --plan, --dry-run ou --apply.');
let credential = process.env.SUPABASE_ACCESS_TOKEN || '';
if (!credential) for await (const chunk of process.stdin) credential += chunk;
credential = credential.trim();
assert.match(credential, /^sbp_[A-Za-z0-9_]+$/, 'Configure a credencial de gerenciamento pelo ambiente ou stdin.');
const query = async sql => {
  const response = await fetch(`https://api.supabase.com/v1/projects/${project}/database/query`, {
    method: 'POST', headers: { Authorization: `Bearer ${credential}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }), signal: AbortSignal.timeout(120000),
  });
  const body = await response.json();
  if (!response.ok) throw Error(`DEV: consulta recusada (${response.status}): ${String(body.message || 'erro').slice(0,1500)}`);
  return body;
};
const literal = value => "'" + String(value).replaceAll("'", "''") + "'";
const hash = text => createHash('sha256').update(text).digest('hex');
const names = (await fs.readdir('supabase/migrations')).filter(name => /^\d+_.+\.sql$/.test(name)).sort();
const files = await Promise.all(names.filter(name => Number(name.split('_')[0]) >= 430).map(async name => ({
  version: name.split('_')[0], name: name.replace(/^\d+_|\.sql$/g,''), file: name,
  sql: await fs.readFile(`supabase/migrations/${name}`, 'utf8'),
})));
const legislative = files.filter(f => /^legislative_/.test(f.name));
assert.deepEqual(legislative.map(f => Number(f.version)), [439,440,441,442,443,444,445,446,447,448]);
const fixes = files.filter(f => Number(f.version) <= 438 || ['449','450'].includes(f.version));
assert.deepEqual(fixes.map(f => Number(f.version)), [430,431,432,433,434,435,436,437,438,449,450]);
const fingerprint = hash(files.map(f => `${f.file}:${hash(f.sql)}`).join('\n'));
const rows = await query("select version,name,md5(array_to_string(statements,chr(10))) as checksum from supabase_migrations.schema_migrations order by version");
const byVersion = new Map(rows.map(row => [row.version,row]));
const renumber = [];
for (const f of legislative) {
  const old = String(Number(f.version)-11);
  const original = byVersion.get(old), current = byVersion.get(f.version);
  if (current) {
    assert.equal(current.name, f.name, `A versão ${f.version} pertence a outra migração.`);
    assert.ok(original?.name !== f.name, `A migração ${f.name} está duplicada no histórico.`);
  } else {
    assert.equal(original?.name, f.name, `A versão original ${old} não corresponde ao painel esperado.`);
    renumber.push({ old, next: f.version, name: f.name, checksum: original.checksum });
  }
}
const pending = fixes.filter(f => {
  const old = byVersion.get(f.version);
  if (!old || renumber.some(r => r.old === f.version)) return true;
  assert.equal(old.name, f.name, `A versão ${f.version} pertence a outra migração.`);
  return false;
});
const plan = { project, fingerprint, renumber, apply: pending.map(f => ({ version:f.version,name:f.name,sha256:hash(f.sql) })) };
console.log(JSON.stringify({ mode, ...plan },null,2));
if (mode !== '--plan' && (renumber.length || pending.length)) {
await fs.mkdir('.tmp', { recursive:true });
const receiptFile = '.tmp/legislative-dev-reconciliation-dry-run.json';
if (mode === '--apply') {
  const rehearsal = JSON.parse(await fs.readFile(receiptFile,'utf8'));
  assert.equal(rehearsal.fingerprint,fingerprint,'Execute --dry-run novamente após mudar os arquivos.');
  assert.deepEqual(rehearsal.renumber,renumber,'O histórico mudou após o ensaio.');
  assert.deepEqual(rehearsal.apply,plan.apply,'As pendências mudaram após o ensaio.');
}
const guards = renumber.map(r => `if not exists(select 1 from supabase_migrations.schema_migrations where version=${literal(r.old)} and name=${literal(r.name)} and md5(array_to_string(statements,chr(10)))=${literal(r.checksum)})
  or exists(select 1 from supabase_migrations.schema_migrations where version=${literal(r.next)}) then raise exception 'Histórico mudou: ${r.old}'; end if;`).join('\n');
const move = renumber.map(r => `update supabase_migrations.schema_migrations set version=${literal(r.next)} where version=${literal(r.old)} and name=${literal(r.name)};`).join('\n');
const pendingGuards = pending.map(f => `if exists(select 1 from supabase_migrations.schema_migrations where version=${literal(f.version)}) then raise exception 'Migração concorrente: ${f.version}'; end if;`).join('\n');
const stripTransaction = sql => sql.replace(/\r\n/g,'\n').replace(/^\s*(?:begin|commit);[ \t]*$/gmi,'');
const changes = pending.map(f => `${stripTransaction(f.sql)}\ninsert into supabase_migrations.schema_migrations(version,name,statements) values(${literal(f.version)},${literal(f.name)},array[${literal(f.sql)}]);`).join('\n');
const sql = `begin;
set local lock_timeout='5s'; set local statement_timeout='90s'; set local standard_conforming_strings=on;
select pg_advisory_xact_lock(20261121,439);
do $guard$ begin ${guards} end $guard$;
${move}
do $guard$ begin ${pendingGuards} end $guard$;
${changes}
${mode === '--dry-run' ? 'rollback' : 'commit'};`;
await fs.writeFile('.tmp/legislative-dev-reconciliation.sql',sql);
try {
  await query(sql);
  await fs.writeFile(mode === '--dry-run' ? receiptFile : '.tmp/legislative-dev-reconciliation-applied.json', JSON.stringify({ ...plan, completed_at:new Date().toISOString(), mode },null,2));
  console.log(mode === '--dry-run' ? 'DEV: ensaio concluído com ROLLBACK; nenhuma alteração persistida.' : 'DEV: reconciliação e histórico confirmados na mesma transação.');
} catch (error) {
  console.error(error.message);
  process.exitCode=1;
}
}

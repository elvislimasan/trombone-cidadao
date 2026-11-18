import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

export async function validateStaffDepartmentTransfer({ db, ids, asUser, check }) {
  await db.query('reset role');
  await db.query(await fs.readFile('supabase/migrations/431_transfer_municipal_staff_department.sql', 'utf8'));
  const staff = randomUUID(), source = randomUUID(), target = randomUUID(), inactive = randomUUID();
  await db.query("insert into profiles(id,name,user_type,city_id) values($1,'Transferência de secretaria','public_official',1)", [staff]);
  await db.query('insert into auth.users(id) values($1)', [staff]);
  await db.query("insert into prefeitura_membros(prefeitura_id,user_id,papel,ativo) values($1,$2,'colaborador',true)", [ids.pref,staff]);
  await db.query(`insert into orgao_canais(id,city_id,nome,ativo,municipal_modules)
    values($1,1,'Origem',true,array['arborization']),($2,1,'Destino',true,array['water_supply']),($3,1,'Inativa',false,'{}')`, [source,target,inactive]);
  await db.query("insert into orgao_categorias(city_id,category_id,canal_id) values(1,'poda',$1)", [source]);
  await asUser(ids.admin);
  const member = (await db.query("select municipal_assign_public_official_modules($1,$2,$3,array['gestor'],array[]::text[]) result", [ids.pref,source,staff])).rows[0].result.member_id;
  const state = async () => (await db.query(`select m.id,m.canal_id,m.ativo,m.created_at,a.versao,a.cargos,a.disabled_modules,a.atendimento
    from orgao_membros m join orgao_membro_acessos a on a.membro_id=m.id where m.id=$1`, [member])).rows[0];
  const original = await state();
  const transfer = (channel, version = original.versao, roles = ['gestor'], active = true, modules = []) => db.query(
    'select transfer_municipal_staff_department($1,$2,$3,$4,$5,$6)', [member,channel,roles,active,version,modules]);

  await check('transferência exige administrador da prefeitura de origem e não aceita outra cidade, triagem ou destino inativo', async () => {
    await asUser(staff); await assert.rejects(transfer(target), /administrador/);
    await asUser(ids.other); await assert.rejects(transfer(target), /administrador/);
    await asUser(ids.admin);
    for (const channel of [ids.otherChannel, ids.triage, inactive, randomUUID()]) {
      await assert.rejects(transfer(channel), /Secretaria/);
      assert.deepEqual(await state(), original);
    }
  });
  await check('versão antiga e falhas de validação não deixam transferência parcial', async () => {
    await assert.rejects(transfer(target, original.versao - 1), /mudaram/);
    await assert.rejects(transfer(target, original.versao, ['executor']), /execução/);
    await assert.rejects(transfer(target, original.versao, ['gestor'], null), /inválido/);
    await assert.rejects(transfer(target, original.versao, ['gestor'], true, ['invalido']), /válidos/);
    assert.deepEqual(await state(), original);
  });
  await check('destino com vínculo existente, inclusive suspenso, bloqueia a transferência', async () => {
    await db.query("select municipal_assign_public_official_modules($1,$2,$3,array['gestor'],array[]::text[])", [ids.pref,target,staff]);
    await assert.rejects(transfer(target), /já está vinculado/);
    await db.query('reset role');
    await db.query('update orgao_membros set ativo=false where canal_id=$1 and user_id=$2', [target,staff]);
    await asUser(ids.admin); await assert.rejects(transfer(target), /já está vinculado/);
    assert.deepEqual(await state(), original);
    await db.query('reset role');
    await db.query('delete from orgao_membros where canal_id=$1 and user_id=$2', [target,staff]);
    await asUser(ids.admin);
  });
  await check('transferir mantém ID e data, recalcula o acesso e registra origem e destino na auditoria', async () => {
    await transfer(target);
    const next = await state();
    assert.equal(next.id, original.id); assert.deepEqual(next.created_at, original.created_at);
    assert.equal(next.canal_id, target); assert.equal(next.versao, original.versao + 1);
    const audit = (await db.query("select * from municipal_access_audit where membro_id=$1 and operation='staff_department_transfer'", [member])).rows[0];
    assert.equal(audit.previous_access.canal_id, source); assert.equal(audit.next_access.canal_id, target);
    await asUser(staff);
    assert.equal((await db.query("select municipal_channel_action($1,$2,'read') value", [staff,source])).rows[0].value, false);
    assert.equal((await db.query("select municipal_inventory_action($1,1,'arborization') value", [staff])).rows[0].value, false);
    assert.equal((await db.query("select pipa_can($1,'manage') value", [target])).rows[0].value, true);
  });
  await check('tela desatualizada não desfaz transferência nem restaura permissões anteriores', async () => {
    await asUser(ids.admin);
    const current = await state();
    await assert.rejects(transfer(source), /mudaram/);
    assert.deepEqual(await state(), current);
  });
  await check('módulos bloqueados e suspensão são salvos na mesma transação da transferência', async () => {
    await transfer(source, (await state()).versao, ['gestor'], false, ['arborization']);
    const next = await state(); assert.equal(next.ativo, false); assert.deepEqual(next.disabled_modules, ['arborization']);
    assert.equal(next.atendimento, 'nenhum');
    await asUser(staff);
    assert.equal((await db.query("select pipa_can($1,'read') value", [target])).rows[0].value, false);
    assert.equal((await db.query("select municipal_inventory_action($1,1,'arborization') value", [staff])).rows[0].value, false);
    await asUser(ids.admin);
  });
}

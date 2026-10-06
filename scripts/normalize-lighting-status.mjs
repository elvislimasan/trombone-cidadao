// Executa somente a conversão solicitada no projeto Supabase vinculado ao workspace.
// Sem --apply, apenas consulta os totais. Nunca aplica outras migrations pendentes.
import fs from 'node:fs/promises';
import path from 'node:path';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

async function main() {
  const args = process.argv.slice(2);
  if (args.some((arg) => arg !== '--apply')) throw new Error('Argumento inválido. Use somente --apply para atualizar.');
  const env = dotenv.parse(await fs.readFile('.env', 'utf8'));
  const url = env.VITE_SUPABASE_URL || env.SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('URL ou credencial administrativa ausente no .env.');
  const linked = (await fs.readFile('supabase/.temp/project-ref', 'utf8')).trim();
  const project = new URL(url).hostname.split('.')[0];
  if (project !== linked) throw new Error('O .env aponta para um projeto diferente do Supabase vinculado.');
  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const statuses = ['nao_informado', 'aceso', 'apagado', 'manutencao', 'removido'];
  const totals = async () => Object.fromEntries(await Promise.all(statuses.map(async (status) => {
    const { count, error } = await db.from('poles').select('id', { count: 'exact', head: true }).eq('lighting_status', status);
    if (error) throw new Error(error.message);
    return [status, count ?? 0];
  })));
  const before = await totals();
  console.log(JSON.stringify({ project, before }));
  if (!args.includes('--apply') || !before.nao_informado) return;

  const snapshot = [];
  for (let from = 0; ; from += 500) {
    const { data, error } = await db.from('poles').select('id,city_id,identifier,plate,address,lighting_status,updated_at,lamp_type,lamp_power_w')
      .eq('lighting_status', 'nao_informado').order('id').range(from, from + 499);
    if (error) throw new Error(error.message);
    snapshot.push(...data);
    if (data.length < 500) break;
  }
  if (snapshot.length !== before.nao_informado) throw new Error('O inventário mudou durante a consulta. Execute novamente.');
  const directory = path.resolve('.tmp');
  await fs.mkdir(directory, { recursive: true });
  const reportPath = path.join(directory, 'lighting-status-' + Date.now() + '.json');
  const report = { project, before, snapshot, updatedIds: [], historyIds: [], startedAt: new Date().toISOString() };
  const saveReport = () => fs.writeFile(reportPath, JSON.stringify(report, null, 2));
  await saveReport();
  for (let from = 0; from < snapshot.length; from += 500) {
    const ids = snapshot.slice(from, from + 500).map((pole) => pole.id);
    const { data, error } = await db.from('poles').update({ lighting_status: 'aceso', updated_at: new Date().toISOString() })
      .in('id', ids).eq('lighting_status', 'nao_informado').select('id,city_id,identifier,plate,address,lamp_type,lamp_power_w');
    if (error) throw new Error(error.message);
    report.updatedIds.push(...data.map((pole) => pole.id));
    await saveReport();
    const history = data.filter((pole) => pole.city_id != null).map((pole) => ({
      pole_id: pole.id, city_id: pole.city_id, pole_number: pole.identifier || pole.plate || String(pole.id), address: pole.address,
      old_power_w: pole.lamp_power_w, new_power_w: pole.lamp_power_w, old_lamp_type: pole.lamp_type, new_lamp_type: pole.lamp_type,
      old_status: 'nao_informado', new_status: 'aceso', action: 'updated', changed_by: null,
    }));
    if (history.length) {
      const { data: entries, error: historyError } = await db.from('pole_lighting_changes').insert(history).select('id');
      if (historyError) throw new Error('Status atualizado, mas houve falha no histórico: ' + historyError.message + '. Confira ' + reportPath);
      report.historyIds.push(...entries.map((entry) => entry.id));
      await saveReport();
    }
  }
  const after = await totals();
  report.after = after; report.finishedAt = new Date().toISOString();
  await saveReport();
  if (after.nao_informado !== 0 || after.aceso !== before.aceso + report.updatedIds.length
    || ['apagado', 'manutencao', 'removido'].some((status) => after[status] !== before[status])) {
    throw new Error('A verificação dos totais encontrou uma diferença. Confira ' + reportPath);
  }
  console.log(JSON.stringify({ project, updated: report.updatedIds.length, history: report.historyIds.length, after, reportPath }));
}

main().catch((cause) => { console.error(cause.message); process.exitCode = 1; });

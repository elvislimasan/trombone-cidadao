import { buildSaplPlan, fetchSaplPage, SAPL_VERSION } from './sapl.js';
const checked = result => { if (result.error) throw Error(result.error.message);return result.data; };
export async function startLegislativeRun(db, source, requestedBy = null) {
  if (source.adapter !== SAPL_VERSION || source.base_url !== 'https://sapl.floresta.pe.leg.br' || Number(source.city_id) !== 64) throw Error('Fonte sem adaptador validado.');
  return checked(await db.rpc('legislative_begin_run', { p_source: source.id, p_plan: buildSaplPlan(source.first_year), p_requested_by: requestedBy }));
}
export async function collectLegislativeSlice(db, runId = null, { maxPages = 8, maxMs = 40000, fetchImpl = fetch, requestDelayMs = 1000 } = {}) {
  const started = Date.now();let pages = 0;const errors = [];const runs = new Set(runId ? [runId] : []);
  while (pages < maxPages && Date.now() - started < maxMs) {
    const job = checked(await db.rpc('legislative_claim_job', { p_run: runId }));
    if (!job) break;
    runs.add(job.run_id);
    try {
      if (job.adapter !== SAPL_VERSION || job.base_url !== 'https://sapl.floresta.pe.leg.br') throw Error('Fonte não autorizada.');
      const page = await fetchSaplPage(job, job.next_page, { fetchImpl });
      checked(await db.rpc('legislative_store_page', { p_job: job.id, p_token: job.lease_token, p_page: page.page, p_total: page.total, p_next: page.next_page, p_rows: page.records }));
      pages++;
      if (requestDelayMs > 0 && pages < maxPages) await new Promise(resolve => setTimeout(resolve, Math.min(5000, requestDelayMs)));
    } catch (error) {
      const message = error.name === 'TimeoutError' ? 'Tempo limite ao consultar a fonte oficial.' : error.message;
      checked(await db.rpc('legislative_fail_job', { p_job: job.id, p_token: job.lease_token, p_error: message, p_retry_after: error.retryable || ['TimeoutError', 'TypeError'].includes(error.name) ? error.retryAfter || 60 : null }));
      errors.push(message);break;
    }
  }
  for (const id of runs) {
    try {
      const summary = checked(await db.rpc('legislative_finish_run', { p_run: id }));
      if (summary) {
        const run = checked(await db.from('legislative_runs').select('source_id').eq('id', id).single());
        const source = checked(await db.from('legislative_sources').select('auto_publish,published_run_id').eq('id', run.source_id).single());
        if (source.auto_publish && source.published_run_id && !(summary.quality?.blocked && !summary.quality?.reviewed)) checked(await db.rpc('legislative_publish_run', { p_run: id }));
      }
    } catch (error) {
      checked(await db.rpc('legislative_abort_run', { p_run: id, p_error: error.message }));errors.push(error.message);
    }
  }
  return { pages, errors, run_ids: [...runs] };
}

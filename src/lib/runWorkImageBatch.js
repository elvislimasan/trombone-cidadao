/** Percorre páginas estáveis de imagens, continuando após falhas individuais. */
export async function runWorkImageBatch({ sources, pageSize = 50, shouldStop = () => false, onSource = () => {}, onResult = () => {} }) {
  for (const source of sources) {
    if (shouldStop()) break;
    onSource(source.label);
    let offset = 0;
    while (!shouldStop()) {
      const rows = await source.loadPage(offset, pageSize);
      if (!rows.length) break;
      for (const row of rows) {
        if (shouldStop()) break;
        try {
          const result = await source.optimize(row);
          onResult({ status: result.changed ? 'changed' : 'skipped' });
        } catch (error) {
          onResult({ status: 'failed', error });
        }
      }
      offset += rows.length;
      if (rows.length < pageSize) break;
    }
  }
  return { stopped: shouldStop() };
}

const interruptedMessage = 'Envio interrompido. Reenvie ou troque o arquivo.';

export function newReportMediaId() {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function createReportUploadQueue({ store, prepareSource, api, upload, onComplete = () => {}, newId = newReportMediaId }) {
  let items = {}, reports = {}, storageError = false;
  const listeners = new Set(), running = new Map(), waiting = new Set();
  const snapshot = () => ({ items: { ...items }, reports: { ...reports }, storageError });
  const emit = () => listeners.forEach(listener => listener(snapshot()));
  const persist = async (method, value) => {
    try { await store[method](value); } catch { storageError = true; emit(); }
  };
  const update = (id, change) => {
    if (!items[id]) return null;
    items[id] = { ...items[id], ...change, lastUpdate: Date.now() };
    emit();
    return items[id];
  };
  const rememberReport = async report => {
    reports[report.reportId] = { ...reports[report.reportId], ...report, savedAt: Date.now() };
    emit();
    await persist('saveReport', reports[report.reportId]);
  };
  const run = async id => {
    if (!items[id] || running.has(id)) return;
    // Processa uma mídia por vez para limitar o pico de memória no iPhone.
    if (running.size) {
      waiting.add(id);
      update(id, { status: 'pending', error: null });
      return;
    }
    const controller = new AbortController();
    running.set(id, controller);
    update(id, { status: 'preparing', error: null, progress: 0 });
    try {
      let item = items[id];
      if (!item.media) {
        const prepared = await prepareSource(item.source, controller.signal);
        item = update(id, { source: prepared.source, media: { id, type: item.type, name: prepared.name, contentType: prepared.contentType } });
        await persist('saveUpload', item);
      }
      if (controller.signal.aborted) throw new Error('Envio cancelado.');
      const result = await api('prepare', item, controller.signal);
      if (!result.completed) {
        if (!result.uploaded) {
          update(id, { status: 'uploading' });
          await upload(item.source, result.signedUrl, item.media.contentType, controller.signal, progress => update(id, { progress, status: 'uploading' }));
        }
        if (controller.signal.aborted) throw new Error('Envio cancelado.');
        update(id, { status: 'finalizing', progress: 100 });
        await api('complete', item, controller.signal);
      }
      if (controller.signal.aborted) throw new Error('Envio cancelado.');
      update(id, { status: 'completed', progress: 100, source: null, error: null });
      await persist('removeUpload', id);
      onComplete(items[id]);
    } catch (error) {
      const item = update(id, { status: 'error', error: controller.signal.aborted ? interruptedMessage : error?.message || 'Não foi possível enviar este arquivo.', progress: 0 });
      if (item) await persist('saveUpload', item);
    } finally {
      running.delete(id);
      const next = waiting.values().next().value;
      if (next) { waiting.delete(next); void run(next); }
    }
  };
  return {
    snapshot,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    async restore() {
      try {
        const [savedItems, savedReports] = await store.load();
        for (const report of savedReports) if (!reports[report.reportId]) reports[report.reportId] = report;
        for (const item of savedItems) if (!items[item.id]) items[item.id] = { ...item, status: 'error', progress: 0, error: item.error || interruptedMessage };
        emit();
      } catch { storageError = true; emit(); }
    },
    rememberReport,
    async enqueue(source, report) {
      const id = newId();
      await rememberReport(report);
      items[id] = { ...report, id, source, name: source.name || source.file?.name || 'Arquivo', type: source.type || 'photo', status: 'pending', progress: 0, timestamp: Date.now() };
      emit();
      await persist('saveUpload', items[id]);
      void run(id);
      return id;
    },
    retry: run,
    async dismiss(id) {
      const controller = running.get(id);
      if (controller) { controller.abort(); return; }
      waiting.delete(id);
      delete items[id];
      emit();
      await persist('removeUpload', id);
    },
    async replace(id, source) {
      const item = items[id];
      if (!item || running.has(id)) return;
      const report = reports[item.reportId];
      const nextId = await this.enqueue(source, report);
      await this.dismiss(id);
      return nextId;
    },
  };
}

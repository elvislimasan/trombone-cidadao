const DB_NAME = 'tc_report_uploads_v1';

// Blobs e caminhos nativos ficam no aparelho, separados do rascunho do formulário.
export function createReportUploadStore() {
  const transact = async (storeName, mode, operation) => {
    if (typeof indexedDB === 'undefined') throw new Error('Armazenamento local indisponível.');
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        request.result.createObjectStore('uploads', { keyPath: 'id' });
        request.result.createObjectStore('reports', { keyPath: 'reportId' });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, mode);
        const request = operation(tx.objectStore(storeName));
        tx.oncomplete = () => resolve(request.result);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error || new Error('Armazenamento interrompido.'));
      });
    } finally { db.close(); }
  };
  return {
    load: () => Promise.all([transact('uploads', 'readonly', store => store.getAll()), transact('reports', 'readonly', store => store.getAll())]),
    saveUpload: upload => transact('uploads', 'readwrite', store => store.put(upload)),
    removeUpload: id => transact('uploads', 'readwrite', store => store.delete(id)),
    saveReport: report => transact('reports', 'readwrite', store => store.put(report)),
  };
}

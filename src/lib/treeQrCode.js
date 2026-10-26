import { Capacitor } from '@capacitor/core';
import { getBaseAppUrl } from './shareUtils';
import { pdfParaBase64, salvarDocumento } from './nativeDownload';
import { createTreeQrCodePdf } from './treeQrCodePdf';

export async function downloadTreeQrCode(tree, cityName) {
  const url = `${getBaseAppUrl().replace(/\/$/, '')}/arborizacao/arvore/${encodeURIComponent(tree.id)}`;
  const doc = await createTreeQrCodePdf(tree, cityName, url);
  const fileName = `arvore-${String(tree.public_code || tree.id).replace(/[^a-zA-Z0-9_-]/g, '-')}-qrcode.pdf`;
  const native = Capacitor.isNativePlatform();
  if (native) await salvarDocumento({ base64: pdfParaBase64(doc), fileName, contentType: 'application/pdf', tituloShare: 'Identificação da árvore' });
  else doc.save(fileName);
  return { fileName, native };
}

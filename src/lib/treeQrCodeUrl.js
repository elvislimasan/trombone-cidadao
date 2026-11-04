import { getBaseAppUrl } from './shareUtils';

export const treeQrCodeUrl = tree => `${getBaseAppUrl().replace(/\/$/, '')}/arborizacao/arvore/${encodeURIComponent(tree.id)}`;

const encoder = new TextEncoder();
const duration = 7 * 24 * 60 * 60 * 1000;
const keyFor = secret => crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
const message = (reportId, expires) => encoder.encode(`report-media:v1:${reportId}:${expires}`);

export async function issueReportMediaAccess(reportId, secret, now = Date.now()) {
  const expires = now + duration;
  const signature = await crypto.subtle.sign('HMAC', await keyFor(secret), message(reportId, expires));
  return `${expires}.${Array.from(new Uint8Array(signature), byte => byte.toString(16).padStart(2, '0')).join('')}`;
}

export async function verifyReportMediaAccess(reportId, token, secret, now = Date.now()) {
  const [rawExpires, signature, extra] = String(token || '').split('.');
  const expires = Number(rawExpires);
  if (extra || !Number.isSafeInteger(expires) || expires <= now || expires > now + duration || !/^[a-f0-9]{64}$/.test(signature || '')) return false;
  const bytes = Uint8Array.from(signature.match(/../g), hex => parseInt(hex, 16));
  return crypto.subtle.verify('HMAC', await keyFor(secret), bytes, message(reportId, expires));
}

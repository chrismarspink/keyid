/**
 * Cloudflare R2 sharing: upload identity card for OG image sharing.
 * The Worker endpoint handles R2 put and returns a shareable URL.
 */

export interface SharePayload {
  /** PNG data URL of the ID card canvas */
  imageDataUrl: string;
  commonName: string;
  fingerprint: string;
  /** Optional expiry in seconds (default: 7 days) */
  ttl?: number;
}

export interface ShareResult {
  url: string;
  /** Direct image URL for og:image */
  imageUrl: string;
  expiresAt: string;
}

/** Upload identity card image to R2 via the Cloudflare Worker. */
export async function shareIdentityCard(
  payload: SharePayload,
  workerUrl = '/api/share'
): Promise<ShareResult> {
  // Convert data URL to Blob
  const parts = payload.imageDataUrl.split(',');
  const mimeMatch = parts[0].match(/data:([^;]+)/);
  const mime = mimeMatch?.[1] ?? 'image/png';
  const binary = atob(parts[1]);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const blob = new Blob([bytes], { type: mime });

  const fd = new FormData();
  fd.append('image', blob, 'keyid-card.png');
  fd.append('name', payload.commonName);
  fd.append('fingerprint', payload.fingerprint);
  fd.append('ttl', String(payload.ttl ?? 7 * 24 * 3600));

  const res = await fetch(workerUrl, { method: 'POST', body: fd });
  if (!res.ok) throw new Error(`Share failed: ${res.status} ${await res.text()}`);
  return res.json();
}

/** Build a web+keyid:// URI for sharing a certificate. */
export function buildKeyIdUri(certDer: ArrayBuffer): string {
  const b64 = btoa(Array.from(new Uint8Array(certDer), (b) => String.fromCharCode(b)).join(''))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
  return `web+keyid://cert/${b64}`;
}

/** Parse a web+keyid:// URI back to certificate bytes. */
export function parseKeyIdUri(uri: string): ArrayBuffer | null {
  const match = uri.match(/^web\+keyid:\/\/cert\/(.+)$/);
  if (!match) return null;
  const b64 = match[1].replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

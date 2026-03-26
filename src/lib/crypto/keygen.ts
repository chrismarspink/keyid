/**
 * ECDSA P-256 key pair generation and import/export utilities.
 */

function subtle() {
  const s = (typeof window !== 'undefined' ? window.crypto : globalThis.crypto)?.subtle;
  if (!s) throw new Error('Web Crypto API를 사용할 수 없습니다. HTTPS 또는 localhost에서 접속하세요.');
  return s;
}

export async function generateKeyPair(): Promise<CryptoKeyPair> {
  return subtle().generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    true, // extractable — required for sealing
    ['sign', 'verify']
  );
}

export async function exportPublicKeySpki(publicKey: CryptoKey): Promise<ArrayBuffer> {
  return subtle().exportKey('spki', publicKey);
}

export async function exportPrivateKeyPkcs8(privateKey: CryptoKey): Promise<ArrayBuffer> {
  return subtle().exportKey('pkcs8', privateKey);
}

export async function importPrivateKeyPkcs8(pkcs8: ArrayBuffer): Promise<CryptoKey> {
  return subtle().importKey(
    'pkcs8',
    pkcs8,
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign']
  );
}

/** Import P-256 private key for ECDH key agreement (used in CMS EnvelopedData decrypt). */
export async function importPrivateKeyEcdh(pkcs8: ArrayBuffer): Promise<CryptoKey> {
  return subtle().importKey(
    'pkcs8',
    pkcs8,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    ['deriveKey', 'deriveBits']
  );
}

export async function importPublicKeySpki(spki: ArrayBuffer): Promise<CryptoKey> {
  return subtle().importKey(
    'spki',
    spki,
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['verify']
  );
}

/** Sign arbitrary data with ECDSA P-256 / SHA-256. Returns DER-encoded signature. */
export async function signData(privateKey: CryptoKey, data: ArrayBuffer): Promise<ArrayBuffer> {
  return subtle().sign({ name: 'ECDSA', hash: 'SHA-256' }, privateKey, data);
}

/** Verify ECDSA P-256 / SHA-256 signature. */
export async function verifyData(
  publicKey: CryptoKey,
  signature: ArrayBuffer,
  data: ArrayBuffer
): Promise<boolean> {
  return subtle().verify({ name: 'ECDSA', hash: 'SHA-256' }, publicKey, signature, data);
}

/** Compute SHA-256 fingerprint of SPKI bytes, returned as hex string (colon-separated). */
export async function computeKeyFingerprint(spki: ArrayBuffer): Promise<string> {
  const hash = await subtle().digest('SHA-256', spki);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join(':');
}

/** Encode ArrayBuffer to base64url string. */
export function toBase64Url(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

/** Decode base64url string to ArrayBuffer. */
export function fromBase64Url(b64: string): ArrayBuffer {
  const padded = b64.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

/** Encode ArrayBuffer to standard base64 string. */
export function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/** Decode standard base64 string to ArrayBuffer. */
export function fromBase64(b64: string): ArrayBuffer {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

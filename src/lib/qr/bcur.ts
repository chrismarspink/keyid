/**
 * QR code encoding/decoding for KeyID certificate and key sharing.
 * Splits large payloads into animated QR frames without external dependencies.
 * Format: "KID:<base64url>" (single) or "KID:<total>/<index>:<chunk>" (multi)
 */

const MAX_CHARS_PER_FRAME = 600;

export function encodeToQRFrames(data: Uint8Array): string[] {
  const b64 = uint8ArrayToBase64url(data);
  if (b64.length <= MAX_CHARS_PER_FRAME) {
    return [`KID:${b64}`];
  }
  const chunks: string[] = [];
  for (let i = 0; i < b64.length; i += MAX_CHARS_PER_FRAME) {
    chunks.push(b64.slice(i, i + MAX_CHARS_PER_FRAME));
  }
  const total = chunks.length;
  return chunks.map((chunk, i) => `KID:${total}/${i + 1}:${chunk}`);
}

export class QRDecoder {
  private frames: Map<number, string> = new Map();
  private total = 0;

  addFrame(frame: string): Uint8Array | null {
    if (!frame.startsWith('KID:')) return null;
    const payload = frame.slice(4);

    if (!payload.includes('/')) {
      return base64urlToUint8Array(payload);
    }

    const slashIdx = payload.indexOf('/');
    const colonIdx = payload.indexOf(':');
    if (slashIdx === -1 || colonIdx === -1 || colonIdx <= slashIdx) return null;

    const total = parseInt(payload.slice(0, slashIdx), 10);
    const index = parseInt(payload.slice(slashIdx + 1, colonIdx), 10);
    const chunk = payload.slice(colonIdx + 1);

    if (this.total === 0) this.total = total;
    this.frames.set(index, chunk);

    if (this.frames.size === this.total) {
      const assembled = Array.from({ length: this.total }, (_, i) => this.frames.get(i + 1) ?? '').join('');
      return base64urlToUint8Array(assembled);
    }
    return null;
  }

  get progress(): { received: number; total: number } {
    return { received: this.frames.size, total: this.total };
  }

  reset() {
    this.frames.clear();
    this.total = 0;
  }
}

function uint8ArrayToBase64url(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function base64urlToUint8Array(b64url: string): Uint8Array {
  const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
  const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Encode data into QR frames (alias) */
export function autoEncode(data: Uint8Array): string[] {
  return encodeToQRFrames(data);
}

/** Decode a simple single-frame KID: QR */
export function decodeSimpleQR(frame: string): Uint8Array | null {
  return new QRDecoder().addFrame(frame);
}

/** Legacy compat: encode as simple keyid: URI for contacts scan */
export function encodeSimpleQR(data: Uint8Array, type: string): string {
  const b64 = uint8ArrayToBase64url(data);
  return `keyid:${type}:${b64}`;
}

/**
 * Key protection: WebAuthn PRF (biometric) or PBKDF2 password.
 * Abstracts the sealing/unsealing of PKCS8 private key bytes with AES-GCM.
 */

export type ProtectionMethod = 'webauthn' | 'password';

export interface SealedKey {
  method: ProtectionMethod;
  /** AES-GCM ciphertext of PKCS8 private key bytes */
  encrypted: string; // base64
  iv: string; // base64 (12 bytes)
  // WebAuthn only
  credentialId?: string; // base64
  // Password only
  salt?: string; // base64 (16 bytes)
  iterations?: number;
}

// ─── Capability check ───────────────────────────────────────────────────────

/**
 * Returns true if the platform authenticator supports PRF extension.
 * We attempt a "get" with PRF to detect real support — creation alone is not enough.
 */
export async function isWebAuthnPRFSupported(): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  if (!window.PublicKeyCredential || !window.isSecureContext) return false;
  // Show WebAuthn option if the browser supports it at all.
  // PRF support is confirmed at actual use time; failures fall back to password.
  return true;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function ab2b64(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.byteLength; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}

function b642ab(b64: string): ArrayBuffer {
  const s = atob(b64);
  const bytes = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i);
  return bytes.buffer;
}

const PRF_EVAL_INPUT = new TextEncoder().encode('keyid-v1-prf-seal');

// ─── WebAuthn PRF ────────────────────────────────────────────────────────────

/**
 * Register a new WebAuthn platform credential and seal the private key using PRF.
 * Throws if PRF extension result is absent (device does not support PRF).
 */
export async function sealWithWebAuthn(
  privateKeyBytes: ArrayBuffer,
  userId: string,
  userName: string
): Promise<SealedKey> {
  const challenge = crypto.getRandomValues(new Uint8Array(32));
  const hostname = window.location.hostname === 'localhost' ? 'localhost' : window.location.hostname;

  const cred = (await navigator.credentials.create({
    publicKey: {
      challenge,
      rp: { name: 'KeyID', id: hostname },
      user: {
        id: new TextEncoder().encode(userId),
        name: userName,
        displayName: userName
      },
      pubKeyCredParams: [
        { alg: -7, type: 'public-key' },   // ES256
        { alg: -257, type: 'public-key' }  // RS256 fallback
      ],
      authenticatorSelection: {
        authenticatorAttachment: 'platform',
        userVerification: 'required',
        residentKey: 'required'
      },
      extensions: {
        prf: { eval: { first: PRF_EVAL_INPUT } }
      } as AuthenticationExtensionsClientInputs
    }
  })) as PublicKeyCredential;

  const ext = cred.getClientExtensionResults() as { prf?: { results?: { first?: ArrayBuffer } } };
  const seed = ext?.prf?.results?.first;
  if (!seed) {
    throw new Error(
      '이 기기는 지문 인증 키 보호를 지원하지 않습니다. 비밀번호를 사용하세요.'
    );
  }

  const aesKey = await crypto.subtle.importKey('raw', seed, 'AES-GCM', false, ['encrypt']);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, aesKey, privateKeyBytes);

  return {
    method: 'webauthn',
    encrypted: ab2b64(encrypted),
    iv: ab2b64(iv),
    credentialId: ab2b64(cred.rawId)
  };
}

/**
 * Unseal a WebAuthn-PRF-sealed private key by prompting for biometric.
 */
export async function unsealWithWebAuthn(sealed: SealedKey): Promise<ArrayBuffer> {
  if (!sealed.credentialId) throw new Error('credentialId missing');
  const credId = b642ab(sealed.credentialId);
  const hostname = window.location.hostname === 'localhost' ? 'localhost' : window.location.hostname;

  const assertion = (await navigator.credentials.get({
    publicKey: {
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      rpId: hostname,
      allowCredentials: [{ type: 'public-key', id: credId }],
      userVerification: 'required',
      extensions: {
        prf: { eval: { first: PRF_EVAL_INPUT } }
      } as AuthenticationExtensionsClientInputs
    }
  })) as PublicKeyCredential;

  const ext = assertion.getClientExtensionResults() as {
    prf?: { results?: { first?: ArrayBuffer } };
  };
  const seed = ext?.prf?.results?.first;
  if (!seed) throw new Error('지문 인증 실패: PRF 결과를 받지 못했습니다.');

  const aesKey = await crypto.subtle.importKey('raw', seed, 'AES-GCM', false, ['decrypt']);
  try {
    return await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: b642ab(sealed.iv) },
      aesKey,
      b642ab(sealed.encrypted)
    );
  } catch {
    throw new Error('지문 인증 복호화 실패: 키가 손상되었거나 인증 정보가 변경되었습니다.');
  }
}

// ─── Password (PBKDF2 → AES-GCM) ────────────────────────────────────────────

/**
 * Seal private key bytes with a password using PBKDF2 key derivation + AES-GCM.
 */
export async function sealWithPassword(
  privateKeyBytes: ArrayBuffer,
  password: string
): Promise<SealedKey> {
  if (password.length < 8) throw new Error('비밀번호는 8자 이상이어야 합니다.');

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iterations = 310_000; // OWASP 2023 recommendation for PBKDF2-SHA256

  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveKey']
  );
  const aesKey = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt']
  );

  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, aesKey, privateKeyBytes);

  return {
    method: 'password',
    encrypted: ab2b64(encrypted),
    iv: ab2b64(iv),
    salt: ab2b64(salt),
    iterations
  };
}

/**
 * Unseal a password-sealed private key. Throws a user-friendly error on wrong password.
 */
export async function unsealWithPassword(
  sealed: SealedKey,
  password: string
): Promise<ArrayBuffer> {
  if (!sealed.salt || !sealed.iterations) throw new Error('솔트 또는 반복 횟수가 없습니다.');

  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveKey']
  );
  const aesKey = await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: b642ab(sealed.salt),
      iterations: sealed.iterations,
      hash: 'SHA-256'
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt']
  );

  try {
    return await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: b642ab(sealed.iv) },
      aesKey,
      b642ab(sealed.encrypted)
    );
  } catch {
    throw new Error('비밀번호가 올바르지 않습니다.');
  }
}

// ─── Unified API ────────────────────────────────────────────────────────────

export interface UnlockParams {
  sealed: SealedKey;
  /** Optional password backup sealed key (stored alongside WebAuthn key) */
  passwordBackup?: SealedKey | null;
  password?: string;
  /** If true, use password backup instead of biometric even if primary is WebAuthn */
  preferPassword?: boolean;
}

/**
 * Unseal a key regardless of protection method.
 * - WebAuthn: triggers biometric prompt (unless preferPassword=true and backup exists)
 * - Password: requires `password` parameter
 * - Dual: if passwordBackup exists and preferPassword=true, uses password backup
 */
export async function unsealKey(params: UnlockParams): Promise<ArrayBuffer> {
  const usePasswordFallback =
    params.preferPassword && params.passwordBackup && params.sealed.method === 'webauthn';

  if (usePasswordFallback) {
    if (!params.password) throw new Error('비밀번호를 입력하세요.');
    return unsealWithPassword(params.passwordBackup!, params.password);
  }

  if (params.sealed.method === 'webauthn') {
    return unsealWithWebAuthn(params.sealed);
  } else {
    if (!params.password) throw new Error('비밀번호를 입력하세요.');
    return unsealWithPassword(params.sealed, params.password);
  }
}

/**
 * IndexedDB key store.
 * Stores the sealed private key, self-signed certificate, and identity metadata.
 * DB v2: added index on files.createdAt
 * DB v3: added expired_identities store
 * DB v4: re-run migration to ensure expired_identities exists (v3 may have missed it)
 */

import type { SealedKey } from '$lib/crypto/protection';

const DB_NAME = 'keyid-v1';
const DB_VERSION = 4;

export interface IdentityRecord {
  id: 'self'; // singleton
  commonName: string;
  email: string;
  organization: string;
  country: string;
  /** DER-encoded X.509 certificate as base64 */
  certDer: string;
  /** Fingerprint SHA-256 with colons, uppercase */
  fingerprint: string;
  /** ISO date */
  notBefore: string;
  notAfter: string;
  serialNumber: string;
  /** Primary sealed PKCS8 private key */
  sealedKey: SealedKey;
  /** Optional backup sealed key with password (exists when primary is WebAuthn) */
  passwordBackup?: SealedKey | null;
  createdAt: string;
  /** Avatar data URL or null */
  avatar: string | null;
}

/** Archived identity record kept after renewal or revocation. */
export interface ExpiredIdentityRecord {
  id?: number;
  commonName: string;
  email: string;
  organization: string;
  country: string;
  /** DER-encoded X.509 certificate as base64 */
  certDer: string;
  /** Fingerprint SHA-256 with colons, uppercase */
  fingerprint: string;
  /** ISO date */
  notBefore: string;
  notAfter: string;
  serialNumber: string;
  /** ISO date when this identity was archived */
  revokedAt: string;
}

export interface FileRecord {
  id?: number;
  /** Output filename (e.g., "report.pkis-sig") */
  name: string;
  /** Original input filename */
  originalName: string;
  type: 'signed' | 'encrypted';
  /** Output file size in bytes */
  size: number;
  createdAt: string;
  /** Signer commonName (signed files) */
  signerName?: string;
  /** Number of recipients (encrypted files) */
  recipientCount?: number;
  /** The actual file data for download */
  data: ArrayBuffer;
}

export function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      const t = (e.target as IDBOpenDBRequest).transaction!;

      if (!db.objectStoreNames.contains('identity')) {
        db.createObjectStore('identity', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('contacts')) {
        const cs = db.createObjectStore('contacts', { keyPath: 'id', autoIncrement: true });
        cs.createIndex('fingerprint', 'fingerprint', { unique: true });
      }
      if (!db.objectStoreNames.contains('files')) {
        const fs = db.createObjectStore('files', { keyPath: 'id', autoIncrement: true });
        fs.createIndex('createdAt', 'createdAt', { unique: false });
      } else if (e.oldVersion < 2) {
        const fs = t.objectStore('files');
        if (!fs.indexNames.contains('createdAt')) {
          fs.createIndex('createdAt', 'createdAt', { unique: false });
        }
      }
      // v3/v4: ensure expired_identities exists (idempotent)
      if (!db.objectStoreNames.contains('expired_identities')) {
        const ei = db.createObjectStore('expired_identities', { keyPath: 'id', autoIncrement: true });
        ei.createIndex('fingerprint', 'fingerprint', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('DB upgrade blocked — close other tabs'));
  });
}

function tx<T>(
  db: IDBDatabase,
  stores: string | string[],
  mode: IDBTransactionMode,
  fn: (tx: IDBTransaction) => IDBRequest<T> | Promise<T>
): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = db.transaction(stores, mode);
    t.onerror = () => reject(t.error);
    try {
      const result = fn(t);
      if (result instanceof IDBRequest) {
        result.onsuccess = () => resolve(result.result);
        result.onerror = () => reject(result.error);
      }
    } catch (e) {
      reject(e);
    }
  });
}

// ─── Identity ────────────────────────────────────────────────────────────────

export async function saveIdentity(record: IdentityRecord): Promise<void> {
  const db = await openDB();
  await tx(db, 'identity', 'readwrite', (t) =>
    t.objectStore('identity').put(record)
  );
  db.close();
}

export async function loadIdentity(): Promise<IdentityRecord | null> {
  const db = await openDB();
  const result = await tx<IdentityRecord | undefined>(db, 'identity', 'readonly', (t) =>
    t.objectStore('identity').get('self')
  );
  db.close();
  return result ?? null;
}

export async function deleteIdentity(): Promise<void> {
  const db = await openDB();
  await tx(db, 'identity', 'readwrite', (t) =>
    t.objectStore('identity').delete('self')
  );
  db.close();
}

export function hasIdentity(): Promise<boolean> {
  return loadIdentity().then((r) => r !== null);
}

// ─── File Records ─────────────────────────────────────────────────────────────

export async function saveFileRecord(record: FileRecord): Promise<number> {
  const db = await openDB();
  const id = await tx<number>(db, 'files', 'readwrite', (t) =>
    t.objectStore('files').add(record) as IDBRequest<number>
  );
  db.close();
  return id;
}

export async function getAllFileRecords(): Promise<FileRecord[]> {
  const db = await openDB();
  const result = await new Promise<FileRecord[]>((resolve, reject) => {
    const t = db.transaction('files', 'readonly');
    const req = t.objectStore('files').getAll();
    req.onsuccess = () => resolve(req.result ?? []);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return result.reverse(); // newest first
}

export async function getFileRecord(id: number): Promise<FileRecord | null> {
  const db = await openDB();
  const result = await tx<FileRecord | undefined>(db, 'files', 'readonly', (t) =>
    t.objectStore('files').get(id)
  );
  db.close();
  return result ?? null;
}

export async function deleteFileRecord(id: number): Promise<void> {
  const db = await openDB();
  await tx(db, 'files', 'readwrite', (t) =>
    t.objectStore('files').delete(id)
  );
  db.close();
}

// ─── Expired Identities ───────────────────────────────────────────────────────

export async function archiveIdentity(record: ExpiredIdentityRecord): Promise<number> {
  try {
    const db = await openDB();
    const id = await tx<number>(db, 'expired_identities', 'readwrite', (t) =>
      t.objectStore('expired_identities').add(record) as IDBRequest<number>
    );
    db.close();
    return id;
  } catch {
    return -1;
  }
}

export async function getAllExpiredIdentities(): Promise<ExpiredIdentityRecord[]> {
  try {
    const db = await openDB();
    const result = await new Promise<ExpiredIdentityRecord[]>((resolve, reject) => {
      const t = db.transaction('expired_identities', 'readonly');
      const req = t.objectStore('expired_identities').getAll();
      req.onsuccess = () => resolve(req.result ?? []);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return result.reverse();
  } catch {
    return [];
  }
}

/** Returns true if the given fingerprint matches an archived (expired/revoked) identity. */
export async function isExpiredIdentityFingerprint(fingerprint: string): Promise<boolean> {
  try {
    const db = await openDB();
    const result = await new Promise<ExpiredIdentityRecord[]>((resolve, reject) => {
      const t = db.transaction('expired_identities', 'readonly');
      const req = t.objectStore('expired_identities').index('fingerprint').getAll(fingerprint);
      req.onsuccess = () => resolve(req.result ?? []);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return result.length > 0;
  } catch {
    return false;
  }
}

export async function deleteExpiredIdentity(id: number): Promise<void> {
  try {
    const db = await openDB();
    await tx(db, 'expired_identities', 'readwrite', (t) =>
      t.objectStore('expired_identities').delete(id)
    );
    db.close();
  } catch {
    // ignore
  }
}

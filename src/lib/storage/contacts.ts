/**
 * IndexedDB contacts storage.
 * Each contact has a name, their X.509 certificate, and a trust level.
 */

import { openDB } from './keystore';

export type TrustLevel = 'self' | 'known' | 'verified';

export interface Contact {
  id?: number;
  commonName: string;
  email: string;
  organization: string;
  country: string;
  /** DER-encoded X.509 certificate, base64 */
  certDer: string;
  fingerprint: string;
  notBefore: string;
  notAfter: string;
  serialNumber: string;
  trustLevel: TrustLevel;
  addedAt: string;
  /** Notes / memo */
  notes: string;
  /** Avatar data URL */
  avatar: string | null;
}

// ─── CRUD ─────────────────────────────────────────────────────────────────────

export async function addContact(contact: Omit<Contact, 'id'>): Promise<number> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const t = db.transaction('contacts', 'readwrite');
    const req = t.objectStore('contacts').add(contact);
    req.onsuccess = () => { resolve(req.result as number); db.close(); };
    req.onerror = () => { reject(req.error); db.close(); };
  });
}

export async function updateContact(contact: Contact): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const t = db.transaction('contacts', 'readwrite');
    const req = t.objectStore('contacts').put(contact);
    req.onsuccess = () => { resolve(); db.close(); };
    req.onerror = () => { reject(req.error); db.close(); };
  });
}

export async function deleteContact(id: number): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const t = db.transaction('contacts', 'readwrite');
    const req = t.objectStore('contacts').delete(id);
    req.onsuccess = () => { resolve(); db.close(); };
    req.onerror = () => { reject(req.error); db.close(); };
  });
}

export async function getContact(id: number): Promise<Contact | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const t = db.transaction('contacts', 'readonly');
    const req = t.objectStore('contacts').get(id);
    req.onsuccess = () => { resolve(req.result ?? null); db.close(); };
    req.onerror = () => { reject(req.error); db.close(); };
  });
}

export async function getContactByFingerprint(fp: string): Promise<Contact | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const t = db.transaction('contacts', 'readonly');
    const req = t.objectStore('contacts').index('fingerprint').get(fp);
    req.onsuccess = () => { resolve(req.result ?? null); db.close(); };
    req.onerror = () => { reject(req.error); db.close(); };
  });
}

export async function getAllContacts(): Promise<Contact[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const t = db.transaction('contacts', 'readonly');
    const req = t.objectStore('contacts').getAll();
    req.onsuccess = () => { resolve(req.result); db.close(); };
    req.onerror = () => { reject(req.error); db.close(); };
  });
}

export async function searchContacts(query: string): Promise<Contact[]> {
  const all = await getAllContacts();
  const q = query.toLowerCase();
  return all.filter(
    (c) =>
      c.commonName.toLowerCase().includes(q) ||
      c.email.toLowerCase().includes(q) ||
      c.organization.toLowerCase().includes(q)
  );
}

/**
 * Import a contact from a parsed certificate object.
 * Returns existing contact ID if already known (by fingerprint).
 */
export async function importContactFromCert(cert: {
  commonName: string;
  email: string;
  organization: string;
  country: string;
  certDer: string;
  fingerprint: string;
  notBefore: string;
  notAfter: string;
  serialNumber: string;
}): Promise<{ id: number; isNew: boolean }> {
  const existing = await getContactByFingerprint(cert.fingerprint);
  if (existing && existing.id !== undefined) {
    return { id: existing.id, isNew: false };
  }
  const id = await addContact({
    ...cert,
    trustLevel: 'known',
    addedAt: new Date().toISOString(),
    notes: '',
    avatar: null
  });
  return { id, isNew: true };
}

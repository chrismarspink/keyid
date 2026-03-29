/**
 * Approval-gated encryption (승인 후 복호화)
 *
 * Design (XOR key-split scheme):
 *   gate_key  = random 32-byte AES-256 key
 *   inner_cms = standard CMS EnvelopedData(content, recipientCerts)
 *   gated_blob= AES-256-GCM(inner_cms, gate_key)
 *   approval_cms = CMS EnvelopedData(gate_key_bytes, approverCert)
 *
 * Payload binary layout (used as PKIS container payload):
 *   [4 B BE]  gated_blob length
 *   [12 B]    AES-GCM IV
 *   [N B]     gated_blob  (AES-256-GCM ciphertext of inner_cms)
 *   [rest]    approval_cms DER
 *
 * Decryption flow:
 *   Recipient→Approver: share pkis-approval file (contains approval_cms + requestId + recipient cert)
 *   Approver: decrypt approval_cms → gate_key → re-encrypt gate_key for recipient → send via Supabase
 *   Recipient: decrypt gate_key envelope → AES-GCM decrypt gated_blob → inner_cms → CMS decrypt
 */

import { encryptForRecipients, decryptEnveloped } from './cms';

// ─── Packing helpers ─────────────────────────────────────────────────────────

export function packApprovalPayload(
  iv: Uint8Array,
  gatedBlob: ArrayBuffer,
  approvalCmsDer: ArrayBuffer
): ArrayBuffer {
  const gatedLen = gatedBlob.byteLength;
  const total = 4 + 12 + gatedLen + approvalCmsDer.byteLength;
  const out = new Uint8Array(total);
  new DataView(out.buffer).setUint32(0, gatedLen, false);
  out.set(iv, 4);
  out.set(new Uint8Array(gatedBlob), 16);
  out.set(new Uint8Array(approvalCmsDer), 16 + gatedLen);
  return out.buffer;
}

export function unpackApprovalPayload(payload: ArrayBuffer): {
  iv: Uint8Array;
  gatedBlob: ArrayBuffer;
  approvalCmsDer: ArrayBuffer;
} {
  const bytes = new Uint8Array(payload);
  const gatedLen = new DataView(payload).getUint32(0, false);
  return {
    iv: bytes.slice(4, 16),
    gatedBlob: payload.slice(16, 16 + gatedLen),
    approvalCmsDer: payload.slice(16 + gatedLen)
  };
}

// ─── Create ──────────────────────────────────────────────────────────────────

/**
 * Encrypt fileData for recipients, gated by approver's signature.
 * Returns raw payload bytes (use with packPkisFile type 'gated').
 */
export async function encryptApprovalGated(
  fileData: ArrayBuffer,
  recipientCerts: ArrayBuffer[],
  approverCert: ArrayBuffer
): Promise<ArrayBuffer> {
  // 1. Inner CMS for recipients
  const { der: innerCmsDer } = await encryptForRecipients(fileData, recipientCerts);

  // 2. Random gate_key
  const gateKeyBytes = window.crypto.getRandomValues(new Uint8Array(32));
  const gateKey = await window.crypto.subtle.importKey('raw', gateKeyBytes, 'AES-GCM', false, ['encrypt']);

  // 3. AES-256-GCM encrypt inner_cms
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const gatedBlob = await window.crypto.subtle.encrypt({ name: 'AES-GCM', iv }, gateKey, innerCmsDer);

  // 4. Wrap gate_key for approver using CMS EnvelopedData
  const { der: approvalCmsDer } = await encryptForRecipients(gateKeyBytes.buffer, [approverCert]);

  return packApprovalPayload(iv, gatedBlob, approvalCmsDer);
}

// ─── Approver side ───────────────────────────────────────────────────────────

/**
 * Approver: decrypt gate_key from approval_cms, re-encrypt for recipient.
 * Returns CMS EnvelopedData DER containing gate_key wrapped for recipientCert.
 */
export async function processApproval(
  approvalCmsDer: ArrayBuffer,
  approverPrivKeyPkcs8: ArrayBuffer,
  approverCertDer: ArrayBuffer,
  recipientCertDer: ArrayBuffer
): Promise<ArrayBuffer> {
  const { plaintext: gateKeyBytes } = await decryptEnveloped(
    approvalCmsDer, approverPrivKeyPkcs8, approverCertDer
  );
  const { der } = await encryptForRecipients(gateKeyBytes, [recipientCertDer]);
  return der;
}

// ─── Recipient side ──────────────────────────────────────────────────────────

/**
 * Recipient: given gate_key envelope from approver, decrypt gated payload.
 * Returns decrypted inner CMS DER (EnvelopedData for recipients).
 * Caller must then call decryptEnveloped(innerCmsDer, recipientKey, recipientCert).
 */
export async function unlockGatedPayload(
  payload: ArrayBuffer,
  gateKeyEnvDer: ArrayBuffer,
  recipientPrivKeyPkcs8: ArrayBuffer,
  recipientCertDer: ArrayBuffer
): Promise<ArrayBuffer> {
  const { iv, gatedBlob } = unpackApprovalPayload(payload);

  const { plaintext: gateKeyBytes } = await decryptEnveloped(
    gateKeyEnvDer, recipientPrivKeyPkcs8, recipientCertDer
  );

  const gateKey = await window.crypto.subtle.importKey('raw', gateKeyBytes, 'AES-GCM', false, ['decrypt']);
  return window.crypto.subtle.decrypt({ name: 'AES-GCM', iv }, gateKey, gatedBlob);
}

/**
 * CMS (Cryptographic Message Syntax) operations:
 *  - SignedData  (.pkis-sig)
 *  - EnvelopedData (.pkis)
 * Uses PKI.js + Web Crypto API.
 */

import * as pkijs from 'pkijs';
import * as asn1js from 'asn1js';

function initPkijs() {
  if (typeof window === 'undefined') return;
  pkijs.setEngine('webcrypto', new pkijs.CryptoEngine({ name: 'webcrypto', crypto: window.crypto }));
}

// OIDs
const OID_DATA = '1.2.840.113549.1.7.1';
const OID_SIGNED_DATA = '1.2.840.113549.1.7.2';
const OID_ENVELOPED_DATA = '1.2.840.113549.1.7.3';
const OID_SHA256 = '2.16.840.1.101.3.4.2.1';
const OID_ECDSA_WITH_SHA256 = '1.2.840.10045.4.3.2';
const OID_AES256_CBC = '2.16.840.1.101.3.4.1.42';
const OID_CONTENT_TYPE = '1.2.840.113549.1.9.3';
const OID_MESSAGE_DIGEST = '1.2.840.113549.1.9.4';
const OID_SIGNING_TIME = '1.2.840.113549.1.9.5';
const OID_SIGNING_CERT_V2 = '1.2.840.113549.1.9.16.2.47';

export interface SignResult {
  /** DER-encoded CMS SignedData wrapped in ContentInfo */
  der: ArrayBuffer;
  /** SHA-256 digest of the original content */
  contentDigest: string;
  signingTime: string;
}

export interface VerifyResult {
  valid: boolean;
  signerCommonName: string;
  signingTime?: string;
  contentDigest: string;
  /** SHA-256 fingerprint of the signer's certificate (colon-separated uppercase hex) */
  signerFingerprint?: string;
  error?: string;
}

// ─── Sign ──────────────────────────────────────────────────────────────────

/**
 * Create CMS SignedData for the given file data.
 * Signature is detached — the content digest is included but the original
 * file content is NOT embedded (keeps .pkis-sig files small).
 */
export async function signData(
  fileData: ArrayBuffer,
  privateKey: CryptoKey,
  certDer: ArrayBuffer
): Promise<SignResult> {
  initPkijs();
  const hashBuf = await crypto.subtle.digest('SHA-256', fileData);
  const digestHex = Array.from(new Uint8Array(hashBuf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  const schema = asn1js.fromBER(certDer);
  const cert = new pkijs.Certificate({ schema: schema.result });

  const cmsSignedSimpl = new pkijs.SignedData({
    version: 1,
    encapContentInfo: new pkijs.EncapsulatedContentInfo({
      eContentType: OID_DATA
      // No eContent — detached signature
    }),
    signerInfos: [
      new pkijs.SignerInfo({
        version: 1,
        sid: new pkijs.IssuerAndSerialNumber({
          issuer: cert.issuer,
          serialNumber: cert.serialNumber
        })
      })
    ],
    certificates: [cert]
  });

  const signerInfo = cmsSignedSimpl.signerInfos[0];
  signerInfo.digestAlgorithm = new pkijs.AlgorithmIdentifier({
    algorithmId: OID_SHA256
  });
  signerInfo.signatureAlgorithm = new pkijs.AlgorithmIdentifier({
    algorithmId: OID_ECDSA_WITH_SHA256
  });

  const signingTime = new Date();

  // Signed attributes
  signerInfo.signedAttrs = new pkijs.SignedAndUnsignedAttributes({
    type: 0,
    attributes: [
      // ContentType
      new pkijs.Attribute({
        type: OID_CONTENT_TYPE,
        values: [new asn1js.ObjectIdentifier({ value: OID_DATA })]
      }),
      // MessageDigest
      new pkijs.Attribute({
        type: OID_MESSAGE_DIGEST,
        values: [new asn1js.OctetString({ valueHex: hashBuf })]
      }),
      // SigningTime
      new pkijs.Attribute({
        type: OID_SIGNING_TIME,
        values: [new asn1js.UTCTime({ valueDate: signingTime })]
      })
    ]
  });

  // Sign the signedAttrs DER
  const signedAttrsDer = signerInfo.signedAttrs.toSchema().toBER(false);
  // Prepend SET OF tag for signing (0x31)
  const toSign = new Uint8Array(signedAttrsDer.byteLength);
  toSign.set(new Uint8Array(signedAttrsDer));
  toSign[0] = 0x31;

  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    privateKey,
    toSign
  );

  signerInfo.signature = new asn1js.OctetString({ valueHex: signature });

  // Wrap in ContentInfo
  const contentInfo = new pkijs.ContentInfo({
    contentType: OID_SIGNED_DATA,
    content: cmsSignedSimpl.toSchema(true)
  });

  return {
    der: contentInfo.toSchema().toBER(false),
    contentDigest: digestHex,
    signingTime: signingTime.toISOString()
  };
}

// ─── Verify ────────────────────────────────────────────────────────────────

/**
 * Verify a CMS SignedData. Checks signature and digest against the original file.
 */
export async function verifySignature(
  cmsSignedDer: ArrayBuffer,
  originalFile: ArrayBuffer
): Promise<VerifyResult> {
  initPkijs();
  try {
    const schema = asn1js.fromBER(cmsSignedDer);
    const contentInfo = new pkijs.ContentInfo({ schema: schema.result });
    const cmsSignedData = new pkijs.SignedData({ schema: contentInfo.content });

    // Get signer cert
    const certs = cmsSignedData.certificates as pkijs.Certificate[];
    if (!certs || certs.length === 0) {
      return { valid: false, signerCommonName: 'Unknown', contentDigest: '', error: '인증서 없음' };
    }
    const signerCert = certs[0];
    const cn =
      signerCert.subject.typesAndValues.find((r) => r.type === '2.5.4.3')?.value?.valueBlock
        ?.value ?? 'Unknown';

    // Compute fingerprint of signer cert
    const signerCertDer = signerCert.toSchema(true).toBER(false);
    const fpHash = await crypto.subtle.digest('SHA-256', signerCertDer);
    const signerFingerprint = Array.from(new Uint8Array(fpHash))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join(':')
      .toUpperCase();

    // Compute digest of original file
    const fileDigest = await crypto.subtle.digest('SHA-256', originalFile);
    const contentDigest = Array.from(new Uint8Array(fileDigest))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');

    // Verify using PKI.js built-in
    const verifyResult = await cmsSignedData.verify({
      signer: 0,
      data: originalFile,
      checkChain: false,
      extendedMode: true
    });

    const signerInfo = cmsSignedData.signerInfos[0];
    let signingTime: string | undefined;
    const timeAttr = signerInfo.signedAttrs?.attributes?.find((a) => a.type === OID_SIGNING_TIME);
    if (timeAttr?.values?.[0]) {
      try {
        const t = timeAttr.values[0];
        signingTime = (t as asn1js.UTCTime).toDate?.()?.toISOString();
      } catch {
        // ignore
      }
    }

    return {
      valid: (verifyResult as { signatureVerified?: boolean })?.signatureVerified ?? false,
      signerCommonName: cn,
      signingTime,
      contentDigest,
      signerFingerprint
    };
  } catch (e) {
    return {
      valid: false,
      signerCommonName: 'Unknown',
      contentDigest: '',
      error: String(e)
    };
  }
}

// ─── Encrypt ───────────────────────────────────────────────────────────────

export interface EncryptResult {
  der: ArrayBuffer;
}

/**
 * Encrypt file data for one or more recipients using CMS EnvelopedData.
 * Key transport: ECDH key agreement with the recipients' SPKI public keys.
 */
export async function encryptForRecipients(
  fileData: ArrayBuffer,
  recipientCerts: ArrayBuffer[]
): Promise<EncryptResult> {
  initPkijs();
  if (recipientCerts.length === 0) throw new Error('수신자를 한 명 이상 선택하세요.');

  const cmsEnveloped = new pkijs.EnvelopedData({ version: 0 });

  // Add each recipient
  for (const certDer of recipientCerts) {
    const schema = asn1js.fromBER(certDer);
    const cert = new pkijs.Certificate({ schema: schema.result });
    await cmsEnveloped.addRecipientByCertificate(cert, { oaepHashAlgorithm: 'SHA-256' });
  }

  // Encrypt with AES-256-CBC
  await cmsEnveloped.encrypt({ name: 'AES-CBC', length: 256 } as Algorithm, fileData);

  const contentInfo = new pkijs.ContentInfo({
    contentType: OID_ENVELOPED_DATA,
    content: cmsEnveloped.toSchema()
  });

  return { der: contentInfo.toSchema().toBER(false) };
}

// ─── Decrypt ───────────────────────────────────────────────────────────────

export interface DecryptResult {
  plaintext: ArrayBuffer;
}

/**
 * Decrypt a CMS EnvelopedData using the recipient's PKCS8 private key bytes and certificate.
 * Accepts raw PKCS8 bytes so the key can be imported as ECDH (required for P-256 key agreement).
 * Passing an ECDSA CryptoKey would cause "key.algorithm does not match the operation" error.
 */
export async function decryptEnveloped(
  cmsDer: ArrayBuffer,
  privateKeyPkcs8: ArrayBuffer,
  certDer: ArrayBuffer
): Promise<DecryptResult> {
  initPkijs();

  // Import as ECDH — required for CMS key agreement (EC key agreement, not ECDSA signing)
  const ecdhKey = await crypto.subtle.importKey(
    'pkcs8',
    privateKeyPkcs8,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    ['deriveKey', 'deriveBits']
  );

  const schema = asn1js.fromBER(cmsDer);
  const contentInfo = new pkijs.ContentInfo({ schema: schema.result });
  const cmsEnveloped = new pkijs.EnvelopedData({ schema: contentInfo.content });

  const recipSchema = asn1js.fromBER(certDer);
  const cert = new pkijs.Certificate({ schema: recipSchema.result });

  // Find matching recipient index
  const serial = cert.serialNumber;
  let recipientIndex = 0;
  for (let i = 0; i < cmsEnveloped.recipientInfos.length; i++) {
    const ri = cmsEnveloped.recipientInfos[i];
    if (ri.variant === 1) {
      const ktri = ri.value as pkijs.KeyTransRecipientInfo;
      if (ktri.rid instanceof pkijs.IssuerAndSerialNumber) {
        if (ktri.rid.serialNumber.isEqual(serial)) { recipientIndex = i; break; }
      }
    } else if (ri.variant === 2) {
      // KeyAgreeRecipientInfo (used for EC keys)
      recipientIndex = i;
      break;
    }
  }

  const plaintext = await cmsEnveloped.decrypt(recipientIndex, {
    recipientPrivateKey: ecdhKey
  });

  return { plaintext };
}

// ─── File format ───────────────────────────────────────────────────────────

export interface PkisFile {
  type: 'signed' | 'encrypted' | 'cert' | 'request' | 'key';
  payload: ArrayBuffer;
  /** Original filename if present */
  filename?: string;
  /** MIME type of enclosed content */
  mimeType?: string;
}

const MAGIC = new TextEncoder().encode('PKIS');

/** Wrap a CMS payload into a .pkis / .pkis-sig container. */
export function packPkisFile(type: PkisFile['type'], payload: ArrayBuffer, filename?: string, mimeType?: string): ArrayBuffer {
  const typeMap = { signed: 0x01, encrypted: 0x02, cert: 0x03, request: 0x04, key: 0x05 };
  const meta = JSON.stringify({ t: typeMap[type], f: filename ?? '', m: mimeType ?? '' });
  const metaBytes = new TextEncoder().encode(meta);
  const metaLen = new DataView(new ArrayBuffer(4));
  metaLen.setUint32(0, metaBytes.length, false);

  const total = MAGIC.length + 4 + metaBytes.length + payload.byteLength;
  const out = new Uint8Array(total);
  let pos = 0;
  out.set(MAGIC, pos); pos += MAGIC.length;
  out.set(new Uint8Array(metaLen.buffer), pos); pos += 4;
  out.set(metaBytes, pos); pos += metaBytes.length;
  out.set(new Uint8Array(payload), pos);
  return out.buffer;
}

/** Unpack a .pkis file container. Throws if magic bytes don't match. */
export function unpackPkisFile(raw: ArrayBuffer): PkisFile {
  const bytes = new Uint8Array(raw);
  for (let i = 0; i < MAGIC.length; i++) {
    if (bytes[i] !== MAGIC[i]) throw new Error('Invalid PKIS file');
  }
  let pos = MAGIC.length;
  const metaLen = new DataView(raw, pos, 4).getUint32(0, false);
  pos += 4;
  const meta = JSON.parse(new TextDecoder().decode(bytes.slice(pos, pos + metaLen)));
  pos += metaLen;
  const payload = raw.slice(pos);

  const typeRev: Record<number, PkisFile['type']> = {
    0x01: 'signed', 0x02: 'encrypted', 0x03: 'cert', 0x04: 'request', 0x05: 'key'
  };
  return {
    type: typeRev[meta.t] ?? 'signed',
    payload,
    filename: meta.f || undefined,
    mimeType: meta.m || undefined
  };
}

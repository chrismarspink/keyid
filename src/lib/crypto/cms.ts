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
const OID_CONTENT_HINT = '1.2.840.113549.1.9.16.2.4'; // id-smime-aa-contentHint

export interface SignResult {
  /** DER-encoded CMS SignedData wrapped in ContentInfo */
  der: ArrayBuffer;
  /** SHA-256 digest of the original content */
  contentDigest: string;
  signingTime: string;
  message?: string;
}

export interface VerifyResult {
  valid: boolean;
  signerCommonName: string;
  signingTime?: string;
  contentDigest: string;
  /** SHA-256 fingerprint of the signer's certificate (colon-separated uppercase hex) */
  signerFingerprint?: string;
  message?: string;
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
  certDer: ArrayBuffer,
  message?: string
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
  const signedAttributes: pkijs.Attribute[] = [
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
  ];

  if (message?.trim()) {
    // OID_CONTENT_HINT attribute
    // ContentHint ::= SEQUENCE { contentDescription UTF8String, contentType ContentType }
    const contentHintSeq = new asn1js.Sequence({
      value: [
        new asn1js.Utf8String({ value: message.slice(0, 256) }),
        new asn1js.ObjectIdentifier({ value: OID_DATA })
      ]
    });
    signedAttributes.push(new pkijs.Attribute({
      type: OID_CONTENT_HINT,
      values: [contentHintSeq]
    }));
  }

  signerInfo.signedAttrs = new pkijs.SignedAndUnsignedAttributes({
    type: 0,
    attributes: signedAttributes
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
    signingTime: signingTime.toISOString(),
    message: message?.trim() || undefined
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

    // Extract contentHint message
    let message: string | undefined;
    const hintAttr = signerInfo.signedAttrs?.attributes?.find((a) => a.type === OID_CONTENT_HINT);
    if (hintAttr?.values?.[0]) {
      try {
        const seq = hintAttr.values[0] as asn1js.Sequence;
        const first = (seq.valueBlock?.value as asn1js.BaseBlock[])?.[0];
        if (first instanceof asn1js.Utf8String) {
          message = (first as asn1js.Utf8String).valueBlock.value;
        }
      } catch { /* ignore */ }
    }

    return {
      valid: (verifyResult as { signatureVerified?: boolean })?.signatureVerified ?? false,
      signerCommonName: cn,
      signingTime,
      contentDigest,
      signerFingerprint,
      message
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

// ─── Sign-then-Encrypt ─────────────────────────────────────────────────────

/**
 * Sign file with embedded content, then encrypt for recipients.
 * Creates EnvelopedData containing SignedData (sign-then-encrypt).
 */
export async function signThenEncrypt(
  fileData: ArrayBuffer,
  privateKey: CryptoKey,
  signerCertDer: ArrayBuffer,
  recipientCertDers: ArrayBuffer[],
  message?: string
): Promise<{ der: ArrayBuffer; contentDigest: string; signingTime: string }> {
  initPkijs();
  if (recipientCertDers.length === 0) throw new Error('수신자를 한 명 이상 선택하세요.');

  const hashBuf = await crypto.subtle.digest('SHA-256', fileData);
  const digestHex = Array.from(new Uint8Array(hashBuf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  const schema = asn1js.fromBER(signerCertDer);
  const cert = new pkijs.Certificate({ schema: schema.result });
  const signingTime = new Date();

  // Build SignedData with EMBEDDED content
  const cmsSignedSimpl = new pkijs.SignedData({
    version: 1,
    encapContentInfo: new pkijs.EncapsulatedContentInfo({
      eContentType: OID_DATA,
      eContent: new asn1js.OctetString({ valueHex: fileData })
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
  signerInfo.digestAlgorithm = new pkijs.AlgorithmIdentifier({ algorithmId: OID_SHA256 });
  signerInfo.signatureAlgorithm = new pkijs.AlgorithmIdentifier({ algorithmId: OID_ECDSA_WITH_SHA256 });

  const attributes: pkijs.Attribute[] = [
    new pkijs.Attribute({
      type: OID_CONTENT_TYPE,
      values: [new asn1js.ObjectIdentifier({ value: OID_DATA })]
    }),
    new pkijs.Attribute({
      type: OID_MESSAGE_DIGEST,
      values: [new asn1js.OctetString({ valueHex: hashBuf })]
    }),
    new pkijs.Attribute({
      type: OID_SIGNING_TIME,
      values: [new asn1js.UTCTime({ valueDate: signingTime })]
    })
  ];

  if (message?.trim()) {
    attributes.push(new pkijs.Attribute({
      type: OID_CONTENT_HINT,
      values: [new asn1js.Sequence({
        value: [
          new asn1js.Utf8String({ value: message.slice(0, 256) }),
          new asn1js.ObjectIdentifier({ value: OID_DATA })
        ]
      })]
    }));
  }

  signerInfo.signedAttrs = new pkijs.SignedAndUnsignedAttributes({ type: 0, attributes });

  const signedAttrsDer = signerInfo.signedAttrs.toSchema().toBER(false);
  const toSign = new Uint8Array(signedAttrsDer.byteLength);
  toSign.set(new Uint8Array(signedAttrsDer));
  toSign[0] = 0x31;

  const signature = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, privateKey, toSign);
  signerInfo.signature = new asn1js.OctetString({ valueHex: signature });

  const signedContentInfo = new pkijs.ContentInfo({
    contentType: OID_SIGNED_DATA,
    content: cmsSignedSimpl.toSchema(true)
  });
  const signedDer = signedContentInfo.toSchema().toBER(false);

  // Now encrypt the SignedData DER with EnvelopedData
  const cmsEnveloped = new pkijs.EnvelopedData({ version: 0 });
  for (const certDer of recipientCertDers) {
    const recSchema = asn1js.fromBER(certDer);
    const recCert = new pkijs.Certificate({ schema: recSchema.result });
    await cmsEnveloped.addRecipientByCertificate(recCert, { oaepHashAlgorithm: 'SHA-256' });
  }
  await cmsEnveloped.encrypt({ name: 'AES-CBC', length: 256 } as Algorithm, signedDer);

  const contentInfo = new pkijs.ContentInfo({
    contentType: OID_ENVELOPED_DATA,
    content: cmsEnveloped.toSchema()
  });

  return {
    der: contentInfo.toSchema().toBER(false),
    contentDigest: digestHex,
    signingTime: signingTime.toISOString()
  };
}

// ─── Decrypt-and-Inspect ───────────────────────────────────────────────────

export interface DecryptInspectResult {
  plaintext: ArrayBuffer;
  isSigned: boolean;
  verifyResult?: VerifyResult;
}

/**
 * Decrypt EnvelopedData, then check if inner content is a SignedData.
 * If signed, also verify the inner signature and return signer info.
 */
export async function decryptAndInspect(
  cmsDer: ArrayBuffer,
  privateKeyPkcs8: ArrayBuffer,
  certDer: ArrayBuffer
): Promise<DecryptInspectResult> {
  const { plaintext } = await decryptEnveloped(cmsDer, privateKeyPkcs8, certDer);

  // Check if inner content is a ContentInfo containing SignedData
  try {
    const innerSchema = asn1js.fromBER(plaintext);
    if (innerSchema.offset !== -1) {
      const innerContentInfo = new pkijs.ContentInfo({ schema: innerSchema.result });
      if (innerContentInfo.contentType === OID_SIGNED_DATA) {
        const innerSignedData = new pkijs.SignedData({ schema: innerContentInfo.content });
        // Extract the actual file content from eContent
        const eContent = innerSignedData.encapContentInfo?.eContent;
        let fileContent: ArrayBuffer = plaintext; // fallback
        if (eContent) {
          // eContent is OctetString — get the bytes
          fileContent = (eContent as asn1js.OctetString).valueBlock.valueHexView?.buffer ??
                        (eContent as asn1js.OctetString).valueBlock.valueHex;
        }
        // Verify the inner signature
        const verifyResult = await verifySignature(plaintext, fileContent);
        return { plaintext: fileContent, isSigned: true, verifyResult };
      }
    }
  } catch {
    // Not signed content, return as-is
  }

  return { plaintext, isSigned: false };
}

// ─── File format ───────────────────────────────────────────────────────────

export interface PkisFile {
  type: 'signed' | 'encrypted' | 'cert' | 'request' | 'key' | 'signed-encrypted' | 'reqsign' | 'cosign';
  payload: ArrayBuffer;
  /** Original filename if present */
  filename?: string;
  /** MIME type of enclosed content */
  mimeType?: string;
  message?: string;
  /** For reqsign/cosign: unique request ID (UUID) used as Supabase channel name */
  requestId?: string;
  /** For reqsign/cosign: requester's certificate DER encoded as base64 */
  requesterCert?: string;
}

const MAGIC = new TextEncoder().encode('PKIS');

/** Wrap a CMS payload into a .pkis / .pkis-sig container. */
export function packPkisFile(
  type: PkisFile['type'],
  payload: ArrayBuffer,
  filename?: string,
  mimeType?: string,
  message?: string,
  extra?: { requestId?: string; requesterCert?: string }
): ArrayBuffer {
  const typeMap = { signed: 0x01, encrypted: 0x02, cert: 0x03, request: 0x04, key: 0x05, 'signed-encrypted': 0x06, reqsign: 0x07, cosign: 0x08 };
  const meta = JSON.stringify({
    t: typeMap[type],
    f: filename ?? '',
    m: mimeType ?? '',
    msg: message ?? '',
    rid: extra?.requestId ?? '',
    rc: extra?.requesterCert ?? ''
  });
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

// ─── Co-Signing ────────────────────────────────────────────────────────────

export interface CoSignerInfoResult {
  /** DER-encoded raw SignerInfo (not wrapped in ContentInfo) */
  signerInfoDer: ArrayBuffer;
  /** DER-encoded Certificate */
  certDer: ArrayBuffer;
}

/**
 * Create a standalone SignerInfo for co-signing.
 * Called by B to produce their SignerInfo, which A merges into the CMS.
 */
export async function createCoSignerInfo(
  fileData: ArrayBuffer,
  privateKey: CryptoKey,
  certDer: ArrayBuffer,
  message?: string
): Promise<CoSignerInfoResult> {
  initPkijs();
  const hashBuf = await crypto.subtle.digest('SHA-256', fileData);

  const schema = asn1js.fromBER(certDer);
  const cert = new pkijs.Certificate({ schema: schema.result });
  const signingTime = new Date();

  const signerInfo = new pkijs.SignerInfo({
    version: 1,
    sid: new pkijs.IssuerAndSerialNumber({
      issuer: cert.issuer,
      serialNumber: cert.serialNumber
    })
  });
  signerInfo.digestAlgorithm = new pkijs.AlgorithmIdentifier({ algorithmId: OID_SHA256 });
  signerInfo.signatureAlgorithm = new pkijs.AlgorithmIdentifier({ algorithmId: OID_ECDSA_WITH_SHA256 });

  const attributes: pkijs.Attribute[] = [
    new pkijs.Attribute({
      type: OID_CONTENT_TYPE,
      values: [new asn1js.ObjectIdentifier({ value: OID_DATA })]
    }),
    new pkijs.Attribute({
      type: OID_MESSAGE_DIGEST,
      values: [new asn1js.OctetString({ valueHex: hashBuf })]
    }),
    new pkijs.Attribute({
      type: OID_SIGNING_TIME,
      values: [new asn1js.UTCTime({ valueDate: signingTime })]
    })
  ];

  if (message?.trim()) {
    attributes.push(new pkijs.Attribute({
      type: OID_CONTENT_HINT,
      values: [new asn1js.Sequence({
        value: [
          new asn1js.Utf8String({ value: message.slice(0, 256) }),
          new asn1js.ObjectIdentifier({ value: OID_DATA })
        ]
      })]
    }));
  }

  signerInfo.signedAttrs = new pkijs.SignedAndUnsignedAttributes({ type: 0, attributes });

  const signedAttrsDer = signerInfo.signedAttrs.toSchema().toBER(false);
  const toSign = new Uint8Array(signedAttrsDer.byteLength);
  toSign.set(new Uint8Array(signedAttrsDer));
  toSign[0] = 0x31;

  const signature = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, privateKey, toSign);
  signerInfo.signature = new asn1js.OctetString({ valueHex: signature });

  return {
    signerInfoDer: signerInfo.toSchema().toBER(false),
    certDer: cert.toSchema(true).toBER(false)
  };
}

/**
 * Add a co-signer's SignerInfo to an existing CMS ContentInfo(SignedData).
 * Works for both detached and embedded-content SignedData.
 * Returns updated ContentInfo DER.
 */
export function addCoSignerInfo(
  cmsContentInfoDer: ArrayBuffer,
  signerInfoDer: ArrayBuffer,
  signerCertDer: ArrayBuffer
): ArrayBuffer {
  initPkijs();

  const schema = asn1js.fromBER(cmsContentInfoDer);
  const contentInfo = new pkijs.ContentInfo({ schema: schema.result });
  const signedData = new pkijs.SignedData({ schema: contentInfo.content });

  const siSchema = asn1js.fromBER(signerInfoDer);
  signedData.signerInfos.push(new pkijs.SignerInfo({ schema: siSchema.result }));

  const certSchema = asn1js.fromBER(signerCertDer);
  if (!signedData.certificates) signedData.certificates = [];
  (signedData.certificates as pkijs.Certificate[]).push(new pkijs.Certificate({ schema: certSchema.result }));

  const newContentInfo = new pkijs.ContentInfo({
    contentType: OID_SIGNED_DATA,
    content: signedData.toSchema(true)
  });
  return newContentInfo.toSchema().toBER(false);
}

/**
 * Create a CMS SignedData with embedded content (not encrypted).
 * Used as the first step in cosign + sign-then-encrypt flow.
 * The returned ContentInfo DER can be passed to addCoSignerInfo(), then encryptForRecipients().
 */
export async function signDataEmbedded(
  fileData: ArrayBuffer,
  privateKey: CryptoKey,
  certDer: ArrayBuffer,
  message?: string
): Promise<{ der: ArrayBuffer; contentDigest: string; signingTime: string }> {
  initPkijs();
  const hashBuf = await crypto.subtle.digest('SHA-256', fileData);
  const digestHex = Array.from(new Uint8Array(hashBuf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  const schema = asn1js.fromBER(certDer);
  const cert = new pkijs.Certificate({ schema: schema.result });
  const signingTime = new Date();

  const cmsSignedSimpl = new pkijs.SignedData({
    version: 1,
    encapContentInfo: new pkijs.EncapsulatedContentInfo({
      eContentType: OID_DATA,
      eContent: new asn1js.OctetString({ valueHex: fileData })
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
  signerInfo.digestAlgorithm = new pkijs.AlgorithmIdentifier({ algorithmId: OID_SHA256 });
  signerInfo.signatureAlgorithm = new pkijs.AlgorithmIdentifier({ algorithmId: OID_ECDSA_WITH_SHA256 });

  const attributes: pkijs.Attribute[] = [
    new pkijs.Attribute({
      type: OID_CONTENT_TYPE,
      values: [new asn1js.ObjectIdentifier({ value: OID_DATA })]
    }),
    new pkijs.Attribute({
      type: OID_MESSAGE_DIGEST,
      values: [new asn1js.OctetString({ valueHex: hashBuf })]
    }),
    new pkijs.Attribute({
      type: OID_SIGNING_TIME,
      values: [new asn1js.UTCTime({ valueDate: signingTime })]
    })
  ];

  if (message?.trim()) {
    attributes.push(new pkijs.Attribute({
      type: OID_CONTENT_HINT,
      values: [new asn1js.Sequence({
        value: [
          new asn1js.Utf8String({ value: message.slice(0, 256) }),
          new asn1js.ObjectIdentifier({ value: OID_DATA })
        ]
      })]
    }));
  }

  signerInfo.signedAttrs = new pkijs.SignedAndUnsignedAttributes({ type: 0, attributes });

  const signedAttrsDer = signerInfo.signedAttrs.toSchema().toBER(false);
  const toSign = new Uint8Array(signedAttrsDer.byteLength);
  toSign.set(new Uint8Array(signedAttrsDer));
  toSign[0] = 0x31;

  const signature = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, privateKey, toSign);
  signerInfo.signature = new asn1js.OctetString({ valueHex: signature });

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
    0x01: 'signed', 0x02: 'encrypted', 0x03: 'cert', 0x04: 'request', 0x05: 'key', 0x06: 'signed-encrypted', 0x07: 'reqsign', 0x08: 'cosign'
  };
  return {
    type: typeRev[meta.t] ?? 'signed',
    payload,
    filename: meta.f || undefined,
    mimeType: meta.m || undefined,
    message: meta.msg || undefined,
    requestId: meta.rid || undefined,
    requesterCert: meta.rc || undefined
  };
}

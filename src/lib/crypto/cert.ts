/**
 * X.509 self-signed certificate generation using PKI.js.
 * Produces a DER-encoded certificate for an ECDSA P-256 key pair.
 */

import * as pkijs from 'pkijs';
import * as asn1js from 'asn1js';

/** Initialize PKI.js Web Crypto engine (must be called before any PKI.js operation). */
function initPkijs() {
  if (typeof window === 'undefined') return;
  const engine = new pkijs.CryptoEngine({ name: 'webcrypto', crypto: window.crypto });
  pkijs.setEngine('webcrypto', engine);
}

// OIDs
const OID_ECDSA_WITH_SHA256 = '1.2.840.10045.4.3.2';
const OID_EC_PUBLIC_KEY = '1.2.840.10045.2.1';
const OID_P256 = '1.2.840.10045.3.1.7';
const OID_COMMON_NAME = '2.5.4.3';
const OID_ORGANIZATION = '2.5.4.10';
const OID_COUNTRY = '2.5.4.6';
const OID_EMAIL = '1.2.840.113549.1.9.1';
const OID_SUBJECT_ALT_NAME = '2.5.29.17';
const OID_BASIC_CONSTRAINTS = '2.5.29.19';
const OID_KEY_USAGE = '2.5.29.15';
const OID_EXTENDED_KEY_USAGE = '2.5.29.37';
const OID_SUBJECT_KEY_IDENTIFIER = '2.5.29.14';
const OID_CLIENT_AUTH = '1.3.6.1.5.5.7.3.2';
const OID_EMAIL_PROTECTION = '1.3.6.1.5.5.7.3.4';
const OID_DOCUMENT_SIGNING = '1.3.6.1.4.1.311.10.3.12';
const OID_LOGOTYPE = '1.3.6.1.5.5.7.1.12';
const OID_SHA256 = '2.16.840.1.101.3.4.2.1';

export interface CertSubject {
  commonName: string;
  organization?: string;
  country?: string;
  email?: string;
}

export interface GeneratedCert {
  certDer: ArrayBuffer;
  /** Fingerprint SHA-256 hex with colons */
  fingerprint: string;
  /** ISO date string */
  notBefore: string;
  notAfter: string;
  serialNumber: string;
}

/** Build an RDN attribute sequence. */
function buildRDN(oid: string, value: string): pkijs.RelativeDistinguishedNames {
  const rdn = new pkijs.RelativeDistinguishedNames();
  rdn.typesAndValues.push(
    new pkijs.AttributeTypeAndValue({
      type: oid,
      value: new asn1js.Utf8String({ value })
    })
  );
  return rdn;
}

/**
 * Build RFC 3709 logotype extension for a data: URI image.
 * Only for small avatars (identicons). Skips if > 100KB.
 */
async function buildLogotypeExtension(avatarDataUrl: string): Promise<pkijs.Extension | null> {
  try {
    const match = avatarDataUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (!match) return null;
    const mediaType = match[1];
    const b64 = match[2];
    if (b64.length > 131072) return null; // skip if > ~100KB

    // Decode to get raw bytes for hash
    const binaryStr = atob(b64);
    const rawBytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) rawBytes[i] = binaryStr.charCodeAt(i);
    const hashBuf = await window.crypto.subtle.digest('SHA-256', rawBytes.buffer);
    const hashBytes = new Uint8Array(hashBuf);

    // BIT STRING for hashValue: prepend 0x00 (unused bits count)
    const bitStringBytes = new Uint8Array(hashBytes.length + 1);
    bitStringBytes[0] = 0x00;
    bitStringBytes.set(hashBytes, 1);

    // Build LogotypeExtn structure using raw asn1js
    const logotypeExtn = new asn1js.Sequence({
      value: [
        // subjectLogo [2] EXPLICIT LogotypeInfo
        new asn1js.Constructed({
          idBlock: { tagClass: 3, tagNumber: 2 },
          value: [
            // direct [0] EXPLICIT LogotypeData
            new asn1js.Constructed({
              idBlock: { tagClass: 3, tagNumber: 0 },
              value: [
                new asn1js.Sequence({ // LogotypeData
                  value: [
                    // image [0] SEQUENCE OF LogotypeImage
                    new asn1js.Constructed({
                      idBlock: { tagClass: 3, tagNumber: 0 },
                      value: [
                        new asn1js.Sequence({ // LogotypeImage
                          value: [
                            new asn1js.Sequence({ // LogotypeDetails
                              value: [
                                new asn1js.IA5String({ value: mediaType }),
                                new asn1js.Sequence({ // SEQUENCE OF HashAlgAndValue
                                  value: [
                                    new asn1js.Sequence({ // HashAlgAndValue
                                      value: [
                                        new asn1js.Sequence({ // AlgorithmIdentifier
                                          value: [new asn1js.ObjectIdentifier({ value: OID_SHA256 })]
                                        }),
                                        new asn1js.BitString({ valueHex: bitStringBytes.buffer })
                                      ]
                                    })
                                  ]
                                }),
                                new asn1js.Sequence({ // SEQUENCE OF IA5String (URIs)
                                  value: [new asn1js.IA5String({ value: avatarDataUrl })]
                                })
                              ]
                            }),
                            // LogotypeImageInfo (fileSize, xSize, ySize)
                            new asn1js.Sequence({
                              value: [
                                new asn1js.Integer({ value: rawBytes.byteLength }),
                                new asn1js.Integer({ value: 256 }),
                                new asn1js.Integer({ value: 256 })
                              ]
                            })
                          ]
                        })
                      ]
                    })
                  ]
                })
              ]
            })
          ]
        })
      ]
    });

    return new pkijs.Extension({
      extnID: OID_LOGOTYPE,
      critical: false,
      extnValue: logotypeExtn.toBER(false)
    });
  } catch (e) {
    console.warn('Logotype extension build failed:', e);
    return null;
  }
}

/**
 * Generate a self-signed X.509 certificate for the given key pair and subject.
 * Validity defaults to 3 years.
 */
export async function generateSelfSignedCert(
  keyPair: CryptoKeyPair,
  subject: CertSubject,
  validityYears = 3,
  avatarDataUrl?: string | null
): Promise<GeneratedCert> {
  initPkijs();

  const cert = new pkijs.Certificate();

  // Serial number — random 16 bytes
  const serial = window.crypto.getRandomValues(new Uint8Array(16));
  cert.serialNumber = new asn1js.Integer({ valueHex: serial.buffer });

  // Version 3
  cert.version = 2;

  // Dates
  const notBefore = new Date();
  const notAfter = new Date(notBefore.getTime() + validityYears * 365.25 * 24 * 3600 * 1000);
  cert.notBefore.value = notBefore;
  cert.notAfter.value = notAfter;

  // Subject RDNs
  const rdns: pkijs.RelativeDistinguishedNames[] = [];
  if (subject.country) rdns.push(buildRDN(OID_COUNTRY, subject.country));
  if (subject.organization) rdns.push(buildRDN(OID_ORGANIZATION, subject.organization));
  rdns.push(buildRDN(OID_COMMON_NAME, subject.commonName));
  if (subject.email) rdns.push(buildRDN(OID_EMAIL, subject.email));

  cert.subject.typesAndValues = rdns.flatMap((r) => r.typesAndValues);
  cert.issuer.typesAndValues = cert.subject.typesAndValues; // self-signed

  // Public key
  await cert.subjectPublicKeyInfo.importKey(keyPair.publicKey);

  // Signature algorithm
  cert.signatureAlgorithm.algorithmId = OID_ECDSA_WITH_SHA256;

  // Extensions
  cert.extensions = [];

  // BasicConstraints: not a CA
  cert.extensions.push(
    new pkijs.Extension({
      extnID: OID_BASIC_CONSTRAINTS,
      critical: true,
      extnValue: new pkijs.BasicConstraints({ cA: false }).toSchema().toBER(false)
    })
  );

  // KeyUsage: digitalSignature + contentCommitment
  const keyUsageBits = new asn1js.BitString({ valueHex: new Uint8Array([0x03, 0xc0]).buffer });
  cert.extensions.push(
    new pkijs.Extension({
      extnID: OID_KEY_USAGE,
      critical: true,
      extnValue: keyUsageBits.toBER(false)
    })
  );

  // ExtendedKeyUsage
  const eku = new pkijs.ExtKeyUsage({
    keyPurposes: [OID_CLIENT_AUTH, OID_EMAIL_PROTECTION, OID_DOCUMENT_SIGNING]
  });
  cert.extensions.push(
    new pkijs.Extension({
      extnID: OID_EXTENDED_KEY_USAGE,
      critical: false,
      extnValue: eku.toSchema().toBER(false)
    })
  );

  // SubjectAltName (email if provided)
  if (subject.email) {
    const san = new pkijs.GeneralNames({
      names: [
        new pkijs.GeneralName({
          type: 1, // rfc822Name
          value: subject.email
        })
      ]
    });
    cert.extensions.push(
      new pkijs.Extension({
        extnID: OID_SUBJECT_ALT_NAME,
        critical: false,
        extnValue: san.toSchema().toBER(false)
      })
    );
  }

  // SubjectKeyIdentifier — SHA-1 of the public key SPKI
  const spkiDer = await window.crypto.subtle.exportKey('spki', keyPair.publicKey);
  const skiHash = await window.crypto.subtle.digest('SHA-1', spkiDer);
  cert.extensions.push(
    new pkijs.Extension({
      extnID: OID_SUBJECT_KEY_IDENTIFIER,
      critical: false,
      extnValue: new asn1js.OctetString({ valueHex: skiHash }).toBER(false)
    })
  );

  // Logotype (RFC 3709) — embed avatar if provided
  if (avatarDataUrl) {
    const logoExt = await buildLogotypeExtension(avatarDataUrl);
    if (logoExt) cert.extensions.push(logoExt);
  }

  // Sign the certificate
  await cert.sign(keyPair.privateKey, 'SHA-256');

  const certDer = cert.toSchema(true).toBER(false);

  // Compute SHA-256 fingerprint
  const fpHash = await window.crypto.subtle.digest('SHA-256', certDer);
  const fingerprint = Array.from(new Uint8Array(fpHash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join(':')
    .toUpperCase();

  const serialHex = Array.from(serial)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  return {
    certDer,
    fingerprint,
    notBefore: notBefore.toISOString(),
    notAfter: notAfter.toISOString(),
    serialNumber: serialHex
  };
}

/**
 * Parse a DER-encoded X.509 certificate and return display fields.
 */
export interface ParsedCert {
  commonName: string;
  organization: string;
  email: string;
  country: string;
  notBefore: string;
  notAfter: string;
  serialNumber: string;
  fingerprint: string;
  isExpired: boolean;
}

export async function parseCertificate(certDer: ArrayBuffer): Promise<ParsedCert> {
  const schema = asn1js.fromBER(certDer);
  if (schema.offset === -1) throw new Error('Invalid certificate DER');

  const cert = new pkijs.Certificate({ schema: schema.result });
  const fpHash = await window.crypto.subtle.digest('SHA-256', certDer);
  const fingerprint = Array.from(new Uint8Array(fpHash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join(':')
    .toUpperCase();

  function getRDNValue(rdns: pkijs.AttributeTypeAndValue[], oid: string): string {
    const match = rdns.find((r) => r.type === oid);
    return (match?.value as { valueBlock?: { value?: string } } | undefined)?.valueBlock?.value ?? '';
  }

  const rdns = cert.subject.typesAndValues;
  const notBefore = cert.notBefore.value;
  const notAfter = cert.notAfter.value;

  const serialHex = Array.from(new Uint8Array(cert.serialNumber.valueBlock.valueHex))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  return {
    commonName: getRDNValue(rdns, OID_COMMON_NAME),
    organization: getRDNValue(rdns, OID_ORGANIZATION),
    email: getRDNValue(rdns, OID_EMAIL),
    country: getRDNValue(rdns, OID_COUNTRY),
    notBefore: notBefore instanceof Date ? notBefore.toISOString() : String(notBefore),
    notAfter: notAfter instanceof Date ? notAfter.toISOString() : String(notAfter),
    serialNumber: serialHex,
    fingerprint,
    isExpired: (notAfter instanceof Date ? notAfter : new Date(notAfter)) < new Date()
  };
}

/**
 * Extract the SubjectPublicKeyInfo (SPKI) bytes from a DER-encoded certificate.
 * Used to reconstruct a CryptoKeyPair for key-preserving renewal.
 */
export function extractSpkiFromCert(certDer: ArrayBuffer): ArrayBuffer {
  const schema = asn1js.fromBER(certDer);
  if (schema.offset === -1) throw new Error('Invalid certificate DER');
  const cert = new pkijs.Certificate({ schema: schema.result });
  return cert.subjectPublicKeyInfo.toSchema().toBER(false);
}

/**
 * Generate a new self-signed certificate using the same key pair as the existing cert.
 * The caller must supply the original PKCS8 private key bytes and the current cert DER
 * (to extract the public key). New cert will have extended validity.
 */
export async function renewCertSameKey(
  pkcs8Bytes: ArrayBuffer,
  certDer: ArrayBuffer,
  subject: CertSubject,
  validityYears = 3,
  avatarDataUrl?: string | null
): Promise<GeneratedCert> {
  initPkijs();
  const spki = extractSpkiFromCert(certDer);
  const [privateKey, publicKey] = await Promise.all([
    window.crypto.subtle.importKey(
      'pkcs8', pkcs8Bytes,
      { name: 'ECDSA', namedCurve: 'P-256' },
      true,
      ['sign']
    ),
    window.crypto.subtle.importKey(
      'spki', spki,
      { name: 'ECDSA', namedCurve: 'P-256' },
      true,
      ['verify']
    )
  ]);
  return generateSelfSignedCert({ privateKey, publicKey }, subject, validityYears, avatarDataUrl);
}

/** Export cert to PEM format. */
export function certDerToPem(derBuf: ArrayBuffer): string {
  const b64 = btoa(
    Array.from(new Uint8Array(derBuf))
      .map((b) => String.fromCharCode(b))
      .join('')
  );
  const lines = b64.match(/.{1,64}/g)?.join('\n') ?? b64;
  return `-----BEGIN CERTIFICATE-----\n${lines}\n-----END CERTIFICATE-----`;
}

/** Import cert from PEM format. */
export function certPemToDer(pem: string): ArrayBuffer {
  const b64 = pem
    .replace(/-----BEGIN CERTIFICATE-----/g, '')
    .replace(/-----END CERTIFICATE-----/g, '')
    .replace(/\s/g, '');
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

/**
 * PKCS#10 Certificate Signing Request (CSR) generation using PKI.js.
 * Produces a DER-encoded CSR for an ECDSA P-256 key pair.
 */

import * as pkijs from 'pkijs';
import * as asn1js from 'asn1js';

function initPkijs() {
  if (typeof window === 'undefined') return;
  const engine = new pkijs.CryptoEngine({ name: 'webcrypto', crypto: window.crypto });
  pkijs.setEngine('webcrypto', engine);
}

const OID_ECDSA_WITH_SHA256 = '1.2.840.10045.4.3.2';
const OID_COMMON_NAME = '2.5.4.3';
const OID_ORGANIZATION = '2.5.4.10';
const OID_COUNTRY = '2.5.4.6';
const OID_EMAIL = '1.2.840.113549.1.9.1';

export interface CSRSubject {
  commonName: string;
  organization?: string;
  country?: string;
  email?: string;
}

export interface GeneratedCSR {
  /** DER-encoded CSR */
  csrDer: ArrayBuffer;
  /** PEM-encoded CSR string */
  csrPem: string;
}

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
 * Generate a PKCS#10 CSR for the given key pair and subject.
 * Returns DER and PEM encoded CSR.
 */
export async function generateCSR(
  keyPair: CryptoKeyPair,
  subject: CSRSubject
): Promise<GeneratedCSR> {
  initPkijs();

  const csr = new pkijs.CertificationRequest();

  // Version 0 (PKCS#10 default)
  csr.version = 0;

  // Subject RDNs
  const rdns: pkijs.RelativeDistinguishedNames[] = [];
  if (subject.country) rdns.push(buildRDN(OID_COUNTRY, subject.country));
  if (subject.organization) rdns.push(buildRDN(OID_ORGANIZATION, subject.organization));
  rdns.push(buildRDN(OID_COMMON_NAME, subject.commonName));
  if (subject.email) rdns.push(buildRDN(OID_EMAIL, subject.email));

  csr.subject.typesAndValues = rdns.flatMap((r) => r.typesAndValues);

  // Public key
  await csr.subjectPublicKeyInfo.importKey(keyPair.publicKey);

  // Sign
  await csr.sign(keyPair.privateKey, 'SHA-256');

  // DER encode
  const csrDer = csr.toSchema().toBER(false);

  // PEM encode
  const b64 = btoa(
    Array.from(new Uint8Array(csrDer), (b) => String.fromCharCode(b)).join('')
  );
  const lines = b64.match(/.{1,64}/g)?.join('\n') ?? b64;
  const csrPem = `-----BEGIN CERTIFICATE REQUEST-----\n${lines}\n-----END CERTIFICATE REQUEST-----\n`;

  return { csrDer, csrPem };
}

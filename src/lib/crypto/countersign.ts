/**
 * CMS Countersignature — allows a second party to co-sign a CMS SignedData.
 * The countersignature is placed as an unsigned attribute on the original signer's SignerInfo.
 */

import * as pkijs from 'pkijs';
import * as asn1js from 'asn1js';

function initPkijs() {
  if (typeof window === 'undefined') return;
  pkijs.setEngine('webcrypto', new pkijs.CryptoEngine({ name: 'webcrypto', crypto: window.crypto }));
}

const OID_COUNTERSIGNATURE = '1.2.840.113549.1.9.6';
const OID_DATA = '1.2.840.113549.1.7.1';
const OID_SHA256 = '2.16.840.1.101.3.4.2.1';
const OID_ECDSA_WITH_SHA256 = '1.2.840.10045.4.3.2';
const OID_CONTENT_TYPE = '1.2.840.113549.1.9.3';
const OID_MESSAGE_DIGEST = '1.2.840.113549.1.9.4';
const OID_SIGNING_TIME = '1.2.840.113549.1.9.5';

export interface CountersignResult {
  /** Updated CMS SignedData DER with countersignature applied */
  der: ArrayBuffer;
  countersignerName: string;
  signingTime: string;
}

/**
 * Add a countersignature to an existing CMS SignedData.
 *
 * The countersignature covers the *signature value* of the original signer,
 * not the original content (per RFC 5652 §11.4).
 */
export async function addCountersignature(
  originalSignedDataDer: ArrayBuffer,
  counterPrivateKey: CryptoKey,
  counterCertDer: ArrayBuffer
): Promise<CountersignResult> {
  initPkijs();
  const schema = asn1js.fromBER(originalSignedDataDer);
  const contentInfo = new pkijs.ContentInfo({ schema: schema.result });
  const signedData = new pkijs.SignedData({ schema: contentInfo.content });

  if (!signedData.signerInfos || signedData.signerInfos.length === 0) {
    throw new Error('원본 서명 정보가 없습니다.');
  }

  const originalSignerInfo = signedData.signerInfos[0];
  const originalSigValue = originalSignerInfo.signature.valueBlock.valueHex;

  // Load counter-signer certificate
  const ccSchema = asn1js.fromBER(counterCertDer);
  const counterCert = new pkijs.Certificate({ schema: ccSchema.result });
  const cn =
    counterCert.subject.typesAndValues.find((r) => r.type === '2.5.4.3')?.value?.valueBlock
      ?.value ?? 'Unknown';

  const signingTime = new Date();

  // Digest the original signature bytes
  const sigDigest = await crypto.subtle.digest('SHA-256', originalSigValue);

  // Build counter-signer SignerInfo
  const counterSignerInfo = new pkijs.SignerInfo({
    version: 1,
    sid: new pkijs.IssuerAndSerialNumber({
      issuer: counterCert.issuer,
      serialNumber: counterCert.serialNumber
    })
  });

  counterSignerInfo.digestAlgorithm = new pkijs.AlgorithmIdentifier({
    algorithmId: OID_SHA256
  });
  counterSignerInfo.signatureAlgorithm = new pkijs.AlgorithmIdentifier({
    algorithmId: OID_ECDSA_WITH_SHA256
  });

  // Signed attributes for countersignature
  counterSignerInfo.signedAttrs = new pkijs.SignedAndUnsignedAttributes({
    type: 0,
    attributes: [
      new pkijs.Attribute({
        type: OID_CONTENT_TYPE,
        values: [new asn1js.ObjectIdentifier({ value: OID_DATA })]
      }),
      new pkijs.Attribute({
        type: OID_MESSAGE_DIGEST,
        values: [new asn1js.OctetString({ valueHex: sigDigest })]
      }),
      new pkijs.Attribute({
        type: OID_SIGNING_TIME,
        values: [new asn1js.UTCTime({ valueDate: signingTime })]
      })
    ]
  });

  // Sign the signedAttrs
  const signedAttrsDer = counterSignerInfo.signedAttrs.toSchema().toBER(false);
  const toSign = new Uint8Array(signedAttrsDer.byteLength);
  toSign.set(new Uint8Array(signedAttrsDer));
  toSign[0] = 0x31; // SET OF

  const counterSig = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    counterPrivateKey,
    toSign
  );

  counterSignerInfo.signature = new asn1js.OctetString({ valueHex: counterSig });

  // Add counter-signer cert to certificates bag
  if (!signedData.certificates) signedData.certificates = [];
  (signedData.certificates as pkijs.Certificate[]).push(counterCert);

  // Add countersignature as unsigned attribute on original SignerInfo
  if (!originalSignerInfo.unsignedAttrs) {
    originalSignerInfo.unsignedAttrs = new pkijs.SignedAndUnsignedAttributes({ type: 1, attributes: [] });
  }

  originalSignerInfo.unsignedAttrs.attributes.push(
    new pkijs.Attribute({
      type: OID_COUNTERSIGNATURE,
      values: [counterSignerInfo.toSchema()]
    })
  );

  // Re-encode
  const updatedContentInfo = new pkijs.ContentInfo({
    contentType: '1.2.840.113549.1.7.2',
    content: signedData.toSchema(true)
  });

  return {
    der: updatedContentInfo.toSchema().toBER(false),
    countersignerName: cn,
    signingTime: signingTime.toISOString()
  };
}

/**
 * Extract countersignatures from a CMS SignedData.
 */
export interface CountersignInfo {
  signerName: string;
  signingTime?: string;
}

export function extractCountersignatures(cmsSignedDer: ArrayBuffer): CountersignInfo[] {
  try {
    const schema = asn1js.fromBER(cmsSignedDer);
    const contentInfo = new pkijs.ContentInfo({ schema: schema.result });
    const signedData = new pkijs.SignedData({ schema: contentInfo.content });

    const results: CountersignInfo[] = [];
    const certs = (signedData.certificates as pkijs.Certificate[]) ?? [];

    for (const si of signedData.signerInfos) {
      const unsignedAttrs = si.unsignedAttrs?.attributes ?? [];
      for (const attr of unsignedAttrs) {
        if (attr.type !== OID_COUNTERSIGNATURE) continue;
        for (const v of attr.values) {
          try {
            const csInfo = new pkijs.SignerInfo({ schema: v });
            let signerName = 'Unknown';

            // Try to find cert
            if (csInfo.sid instanceof pkijs.IssuerAndSerialNumber) {
              const csSerial = csInfo.sid.serialNumber;
              const matchCert = certs.find((c) => c.serialNumber.isEqual(csSerial));
              if (matchCert) {
                signerName =
                  matchCert.subject.typesAndValues.find((r) => r.type === '2.5.4.3')?.value
                    ?.valueBlock?.value ?? 'Unknown';
              }
            }

            let signingTime: string | undefined;
            const timeAttr = csInfo.signedAttrs?.attributes?.find(
              (a) => a.type === OID_SIGNING_TIME
            );
            if (timeAttr?.values?.[0]) {
              try {
                signingTime = (timeAttr.values[0] as asn1js.UTCTime).toDate?.()?.toISOString();
              } catch {
                // ignore
              }
            }

            results.push({ signerName, signingTime });
          } catch {
            // skip malformed
          }
        }
      }
    }
    return results;
  } catch {
    return [];
  }
}

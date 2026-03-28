# KeyID — Claude Code 지침

## 자동 커밋 & 배포

작업 완료 후 **항상** 아래 순서를 자동으로 수행한다:

1. 변경된 파일을 스테이징
2. 의미 있는 커밋 메시지로 커밋
3. `npm run deploy`로 GitHub Pages 배포

별도 확인 없이 진행한다.

## 프로젝트 개요

브라우저 기반 PKI 앱 (SvelteKit + PWA).
모든 암호화는 클라이언트(Web Crypto + PKI.js)에서 수행, 개인키는 IndexedDB에 sealed 저장.

## 기술 스택

- **Framework**: SvelteKit + Tailwind CSS
- **Crypto**: PKI.js + ASN1.js (CMS/X.509), Web Crypto API (ECDSA P-256)
- **Key Protection**: WebAuthn PRF (생체인증) + PBKDF2 (비밀번호)
- **Storage**: IndexedDB
- **Realtime**: Supabase Broadcast Channel
- **Deployment**: GitHub Pages (`npm run deploy`)

## 파일 형식 (.pkis 컨테이너)

| 타입 | 코드 | 확장자 |
|------|------|--------|
| signed | 0x01 | .pkis-sig |
| encrypted | 0x02 | .pkis |
| cert | 0x03 | .pkis-cert |
| request (legacy) | 0x04 | .pkis-req |
| key | 0x05 | — |
| signed-encrypted | 0x06 | .pkis |
| reqsign | 0x07 | .pkis-reqsign |
| cosign | 0x08 | .pkis-cosign |

## 핵심 함수 위치

- CMS 서명/암호화: `src/lib/crypto/cms.ts`
- 인증서 생성: `src/lib/crypto/cert.ts`
- 키 보호: `src/lib/crypto/protection.ts`
- IndexedDB: `src/lib/storage/keystore.ts`
- Supabase 클라이언트: `src/lib/supabase.ts`

## 배포

```bash
npm run deploy
```

GitHub Pages URL: https://chris.github.io/keyid (또는 프로젝트 실제 URL)

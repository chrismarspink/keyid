# KeyID — Claude Code 지침

## 자동 커밋 & 배포

작업 완료 후 **항상** 아래를 자동으로 수행한다 (별도 확인 없이):

1. 변경된 파일 스테이징 (`git add`)
2. 커밋 (`git commit`)
3. `npm run deploy` 로 GitHub Pages 배포

## 자격증명 & 접속 정보

민감한 자격증명은 로컬 메모리 파일에 저장됨:
`~/.claude/projects/-Users-chris-keyid/memory/credentials.md`

GitHub 인증은 `.git/config` remote URL에 토큰이 포함되어 있으므로
`npm run deploy` 실행 시 별도 로그인 불필요.

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

## 서버 & 서비스

- **GitHub 저장소**: https://github.com/chrismarspink/keyid
- **배포 URL**: https://chrismarspink.github.io/keyid
- **Supabase 프로젝트**: https://leseqdfucxuivrpufepc.supabase.co
- **Supabase Anon Key**: `sb_publishable__FfJg_yCmfKe0GF77yiL7g_sPmzRnAT`
  (publishable 키, 공개 노출 가능)

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

## 핵심 파일 위치

- CMS 서명/암호화: `src/lib/crypto/cms.ts`
- 인증서 생성: `src/lib/crypto/cert.ts`
- 키 보호: `src/lib/crypto/protection.ts`
- IndexedDB: `src/lib/storage/keystore.ts`
- Supabase 클라이언트: `src/lib/supabase.ts`
- QR 인코딩: `src/lib/qr/bcur.ts`

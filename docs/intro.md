# KeyID — 프로젝트 소개 (다른 AI를 위한 컨텍스트 문서)

## 한 줄 요약

KeyID는 **"중앙 서버 없는 PKI 도장"**이다.
브라우저만으로 X.509 인증서를 발급하고, CMS 표준으로 파일에 서명·암호화하며,
여러 사람이 순서대로 결재(서명)하는 전자결재 워크플로우를 구현한 PWA 앱이다.

---

## 왜 만들었나 — 핵심 철학

### 1. Zero-Server (서버 없는 암호화)
모든 암호화·서명 연산은 **사용자 기기의 브라우저(Web Crypto API)**에서만 수행한다.
개인키와 평문은 절대 서버로 전송되지 않는다.
Supabase는 단순한 "우체통"(실시간 메시지 릴레이)일 뿐이며, 서버는 내용을 알 수 없다.

### 2. Standards-based (독자 포맷 금지)
자체 암호화 포맷을 발명하지 않는다.
- 인증서: **X.509 v3 (RFC 5280)**, ECDSA P-256
- 서명/암호화: **CMS / PKCS#7 (RFC 5652)**
- 키 보호: WebAuthn PRF → AES-256-GCM / PBKDF2-SHA256 (310,000회) → AES-256-GCM
- 파일 교환: 시스템 기본 파일 공유 기능 활용 (AirDrop, 카카오톡, 이메일 등)

### 3. 적정기술 (Appropriate Technology)
복잡한 PKI 기술을 가장 단순한 방식으로 사용한다.
CA 없이 자가서명 인증서를 사용하고, 별도 서버나 앱 설치 없이 QR 코드와 파일 공유만으로 동작한다.

### 4. Mobile-First
갤럭시 기준 360px 이상에서 완전 동작. 안드로이드/iOS PWA 설치 지원.
하단 네비게이션 + 제스처 바 안전 영역 필수 적용.

---

## 핵심 기능

### 신원 (Identity)
- ECDSA P-256 키 쌍 + 자가서명 X.509 인증서 생성
- 인증서에는 이름·이메일·전화번호 필수 포함 (telephoneNumber OID 2.5.4.20)
- 사진 업로드 시 RFC 3709 Logotype 확장으로 인증서에 임베드; 없으면 identicon 자동 생성
- 개인키는 항상 sealed 상태로 IndexedDB 저장 (절대 평문 유출 없음)

### 연락처 (Contacts)
- 타인의 인증서(.pkis-cert 파일 또는 QR 스캔)를 가져와 관리
- 연락처 인증서의 logotype/identicon으로 시각적으로 식별

### 파일 서명 (Sign)
- CMS SignedData 생성, 서명 검증
- 서명 시 지문(WebAuthn), 비밀번호, 기타 기기 인증 방식 지원
- **공동서명**: 여러 서명자가 병렬로 서명 (순서 무관)
- **결제(순차서명)**: 지정된 순서대로 서명 (결제 라인 사전 설정 가능)

### 파일 암호화 (Encrypt)
- CMS EnvelopedData, 다중 수신자 지원 (단일 파일로 여러 명에게 전송)
- 처리 순서 엄수: **[압축 → 서명 → 암호화]**
  - 압축: CompressionStream (deflate-raw)
  - 서명: SignedData (서명자 신원 보호)
  - 암호화: EnvelopedData (수신자 인증서로 키 암호화)

### 결제 워크플로우 (Approval Chain)
- 결제 라인: 순서가 지정된 결재자 체인을 사전 등록
- 요청자가 QR 또는 .pkis-reqsign 파일 생성 → Supabase 채널로 실시간 서명 수신
- 각 결재자가 서명하면 즉시 다음 결재자에게 전달
- 최종적으로 모든 서명이 포함된 CMS 문서 완성

---

## 기술 스택

| 레이어 | 기술 |
|--------|------|
| UI | SvelteKit + Tailwind CSS |
| 암호화 | PKI.js + ASN1.js (CMS/X.509), Web Crypto API |
| 키 보호 | WebAuthn PRF (생체인증) + PBKDF2 (비밀번호) |
| 저장소 | IndexedDB (로컬, 서버 없음) |
| 실시간 릴레이 | Supabase Broadcast Channel (우체통 역할만) |
| 배포 | GitHub Pages PWA |

---

## 파일 형식 (.pkis 컨테이너)

KeyID는 표준 CMS를 `PKIS` 매직 바이트로 감싼 커스텀 컨테이너를 사용한다.
메타데이터(파일명, 타입, 메시지, requestId)를 JSON으로 헤더에 담고, payload에 CMS DER을 넣는다.

| 타입 | 확장자 | 설명 |
|------|--------|------|
| signed | .pkis-sig | CMS SignedData (분리 서명) |
| encrypted | .pkis | CMS EnvelopedData (다중 수신자) |
| cert | .pkis-cert | X.509 인증서 |
| reqsign | .pkis-reqsign | 서명 요청 (nonce + 요청자 인증서) |
| cosign | .pkis-cosign | 공동서명 요청 |

---

## 보안 원칙 (Claude가 반드시 지켜야 할 것)

1. **Sign-then-Encrypt**: `[압축 → 서명 → 암호화]` 순서를 절대 바꾸지 않는다.
   서명을 암호화 안에 넣어야 서명자 신원이 보호된다.

2. **Zero Trust Server**: Supabase로 보내는 데이터는 항상 암호화된 상태여야 한다.
   서버가 내용을 알 수 있는 평문이나 복호화 가능한 데이터를 전송하지 않는다.

3. **Key Never Leaves Device**: 개인키(PKCS8)는 unsealKey() 호출 시에만 메모리에 존재하고,
   함수 종료 즉시 GC 대상이 된다. 서버 전송은 절대 금지.

4. **Standards Only**: 독자 암호화 알고리즘·포맷 금지.
   기존 RFC 표준(CMS, X.509, ECDSA P-256)을 그대로 사용한다.

---

## 레이어 구조

```
[UI — SvelteKit Pages]
        ↓
[Crypto Layer — src/lib/crypto/]
   cms.ts        CMS SignedData / EnvelopedData / 압축
   cert.ts       X.509 자가서명 인증서 (전화번호 포함)
   protection.ts 개인키 봉인 (WebAuthn PRF / PBKDF2)
   keygen.ts     ECDSA P-256 키 쌍 생성·임포트
        ↓
[Storage — src/lib/storage/]
   keystore.ts   IndexedDB v6 (identity, contacts, files,
                              expired_identities, ca_certs,
                              settings, approval_chains)
   contacts.ts   연락처 인증서 관리
        ↓
[Transport — Supabase Broadcast (우체통)]
   reqsign-{uuid}: 서명 요청/응답
   cosign-{uuid}:  공동서명 SignerInfo 전달
   채널은 1회성, 전달 후 즉시 removeChannel()
```

---

## 배포 정보

- **배포 URL**: https://chrismarspink.github.io/keyid
- **GitHub**: https://github.com/chrismarspink/keyid
- **배포 명령**: `npm run deploy` (GitHub Pages)
- **Supabase**: https://leseqdfucxuivrpufepc.supabase.co (릴레이 전용, 내용 저장 없음)

# KeyID

디지털 신원 인증서 PWA — X.509 자체 서명 인증서, CMS 서명/암호화 지원

## 개요

KeyID는 브라우저에서 완전히 동작하는 PKI 기반 디지털 신원 앱입니다. IndexedDB에 암호화된 개인 키를 보관하며 서버가 필요 없습니다.

## 기능

- **신원 생성**: ECDSA P-256 키 쌍 + X.509 자체 서명 인증서
- **키 보호**: 지문 인증(WebAuthn PRF) 또는 비밀번호(PBKDF2 → AES-GCM)
- **파일 서명**: CMS SignedData (PKCS#7)
- **파일 암호화**: CMS EnvelopedData (수신자별 암호화)
- **연락처 관리**: 상대방 인증서 저장, 신뢰 수준 설정
- **서명 요청**: 반서명(countersignature) 처리
- **인증서 공유**: QR 코드, PNG 카드, PEM 다운로드

## 실행

```bash
npm install
npm run dev          # 로컬 개발 (localhost:5173)
npm run dev:mobile   # ngrok 병행 실행 (Android 테스트)
npm run build        # 정적 빌드
```

## 주요 변경사항

### 1. 이중 인증 방식 지원

Mac/Windows 지문 리더기 없는 환경을 위해 비밀번호 방식 추가:

- **WebAuthn PRF**: 생체 인증(지문/Face ID) — 지원 기기 자동 감지
- **비밀번호 (PBKDF2)**: 지문 인증 불가 시 폴백, 310,000회 반복으로 보안 강화

`src/lib/crypto/protection.ts`에 `sealWithPassword()` / `unsealWithPassword()` 구현

### 2. QR 코드 이미지 출력 (수정)

기존 텍스트 기반 표시를 `qrcode` 라이브러리를 사용한 실제 QR 이미지로 교체:

- `src/components/QRCode.svelte` 신규 생성 — canvas 렌더링
- 애니메이션 다중 파트 방식 제거 → 단일 안정적 QR 코드
- 인증서 DER을 `KID:<base64url>` 포맷으로 인코딩

### 3. Windows 파일 읽기 오류 수정

PWA `file_handlers`에서 `FileSystemFileHandle.getFile()` 실패 시 앱이 중단되는 문제 수정:

- `src/lib/fileHandler.ts`: `handle.getFile()` 주변에 try/catch 추가
- `vite.config.ts`: 개발 모드에서 서비스 워커 비활성화 (`devOptions.enabled: false`)
  - Windows에서 SW가 파일 핸들 접근을 간섭하는 문제 방지

### 4. PKI.js 엔진 초기화

PKI.js v3는 명시적 엔진 설정이 필요함:

```ts
pkijs.setEngine('webcrypto', new pkijs.CryptoEngine({ name: 'webcrypto', crypto: window.crypto }));
```

`cert.ts`, `cms.ts`, `countersign.ts` 각 진입점에 `initPkijs()` 호출 추가

### 5. bc-ur 대체

`bc-ur@0.1.6`이 `bitcoinjs-lib`에 의존하여 브라우저에서 동작 불가. 독자적인 KID: 포맷으로 교체:

- 단일 프레임: `KID:<base64url>`
- 다중 프레임: `KID:<total>/<index>:<chunk>`

`src/lib/qr/bcur.ts` 참조

### 6. Web Crypto API 보안 컨텍스트 오류 처리

`crypto.subtle`은 HTTPS 또는 localhost에서만 동작. `keygen.ts`에 `subtle()` 헬퍼 추가:

```ts
function subtle() {
  const s = (typeof window !== 'undefined' ? window.crypto : globalThis.crypto)?.subtle;
  if (!s) throw new Error('Web Crypto API를 사용할 수 없습니다. HTTPS 또는 localhost에서 접속하세요.');
  return s;
}
```

## 기술 스택

- SvelteKit 2 + TypeScript + Tailwind CSS
- PKI.js v3 + asn1js (X.509, CMS)
- Web Crypto API (ECDSA P-256, AES-GCM, PBKDF2)
- WebAuthn PRF extension
- IndexedDB (keystore, contacts)
- PWA (vite-plugin-pwa, Workbox)
- qrcode (QR 이미지 렌더링)
- jsQR (QR 스캔)

## 파일 형식

| 확장자 | 용도 |
|--------|------|
| `.pkis-cert` | X.509 DER 인증서 |
| `.pkis` | 서명 대상 파일 |
| `.pkis-sig` | CMS SignedData |
| `.pkis-req` | 서명 요청 |
| `.pkis-key` | 암호화된 키 백업 |

## 파일 목록 (v2)

Docker Desktop 스타일 테이블 UI (`/files`):
- 서명/암호화된 파일 기록 (IndexedDB 저장)
- 체크박스 다중 선택, 일괄 삭제
- 유형 필터 (전체/서명됨/암호화됨) + 검색
- 서명 파일 → 검증 페이지 바로가기
- 암호화 파일 → 복호화 탭 바로가기
- 다운로드, 개별 삭제

## 서명 검증 (`/file/verify`)

- 서명 파일 (.pkis-sig) + 원본 파일 드래그&드롭 또는 선택
- 서명자, 서명 시각, SHA-256 다이제스트 표시
- 파일 목록에서 서명됨 항목 클릭 시 자동 연결

## 이중 인증 방식 (v2)

키 접근 시 지문 OR 비밀번호 모두 사용 가능:
- 신원 생성 시 WebAuthn(지문) 선택 → 백업 비밀번호 선택적 입력
- `IdentityRecord.passwordBackup?: SealedKey` 필드에 저장
- 서명/복호화 페이지에 [지문 인증 | 비밀번호] 토글 표시
- 비밀번호 백업이 있을 때만 토글 활성화

## 복호화 오류 수정

**오류**: `key.algorithm does not match the of operation`

**원인**: ECDSA P-256 키 (`['sign']` 용도)로 CMS EnvelopedData ECDH 키 협의를 시도함

**수정**:
- `cms.ts`: `decryptEnveloped(cmsDer, pkcs8Bytes, certDer)` — PKCS8 바이트를 받아 내부에서 ECDH 키로 임포트
- `keygen.ts`: `importPrivateKeyEcdh(pkcs8)` 함수 추가 (ECDH용)
- 암호화 페이지: `importPrivateKeyPkcs8` 호출 제거 → PKCS8 bytes 직접 전달

## 드래그&드롭 수정

복호화 탭 파일 선택에 dragover/dragleave/drop 이벤트 핸들러 추가

## 배포

### GitHub Pages

```bash
npm run deploy
# NODE_ENV=production 빌드 → gh-pages 브랜치에 배포
```

URL: https://chrismarspink.github.io/keyid/

### 로컬 개발

```bash
npm run dev          # localhost:5173
npm run dev:mobile   # ngrok 병행 (Android 테스트)
```

---

## v0.1 주요 기능

### 신원 관리
- **신원 생성**: ECDSA P-256 키 쌍 + X.509 v3 자체 서명 인증서
- **사진/아이콘**: 사용자 사진 업로드 또는 자동 생성 Identicon (FNV-1a 해시 기반 5×5 SVG)
- **갱신**: 동일 키로 유효기간 연장 또는 새 키로 재발급 (1/2/3년 선택)
- **아카이브**: 갱신 시 기존 인증서는 `expired_identities` 에 보존 (서명에 재사용 가능)
- **QR/PNG 공유**: 인증서 QR 코드 + PNG ID 카드 다운로드

### 키 보호
- **WebAuthn PRF**: 생체 인증(지문/Face ID) — 지원 기기 자동 감지
- **비밀번호 (PBKDF2)**: PBKDF2 310,000회 반복 → AES-256-GCM
- **백업 비밀번호**: WebAuthn 선택 시 비밀번호 백업 선택적 등록

### 파일 서명 / 암호화
- **서명**: CMS SignedData (PKCS#7) — 현재 및 아카이브 신원으로 서명 가능
- **암호화**: CMS EnvelopedData — 연락처별 ECDH 키 협의
- **검증**: 서명 파일 + 원본 파일로 서명자 검증

### 연락처
- **인증서 가져오기**: .pkis-cert 파일 또는 QR 스캔
- **신뢰 수준**: known / verified
- **테스트 시드**: "테스트 친구 10명 추가" 버튼 (실제 자체 서명 인증서 생성)

### 설정 (`/settings`)
- **알고리즘**: ECDSA P-256 (기본값, RSA-2048 준비 중)
- **기본 유효기간**: 1/2/3/5년
- **기본 국가 코드**
- **CA 인증서 등록**: PEM/DER 업로드, IndexedDB 저장
- **CSR 생성**: 현재 키 또는 새 키로 PKCS#10 CSR 생성 및 다운로드

### 설치 (`/install`)
- 플랫폼별 PWA 설치 가이드 (Android, iOS, macOS, Windows)
- 원클릭 설치 버튼 (`beforeinstallprompt`)

---

## 기술 스택

| 항목 | 값 |
|---|---|
| 프레임워크 | SvelteKit 2 + TypeScript + Tailwind CSS |
| 암호화 | PKI.js v3 + asn1js, Web Crypto API |
| 키 알고리즘 | ECDSA P-256 / SHA-256 |
| 키 보호 | WebAuthn PRF + PBKDF2/AES-GCM |
| 저장소 | IndexedDB (keyid-v1, v5) |
| PWA | vite-plugin-pwa, Workbox |
| QR | qrcode (생성), jsQR (스캔) |
| 배포 | GitHub Pages (gh-pages 패키지) |

---

## IndexedDB 스토어 (v5)

| 스토어 | 용도 |
|---|---|
| `identity` | 단일 신원 레코드 (키+인증서) |
| `contacts` | 연락처 인증서 |
| `files` | 서명/암호화된 파일 기록 |
| `expired_identities` | 아카이브된 신원 (갱신/폐지) |
| `ca_certs` | 등록된 CA 인증서 |
| `settings` | 앱 설정 |

## 파일 형식

| 확장자 | 용도 |
|--------|------|
| `.pkis-cert` | X.509 DER 인증서 |
| `.pkis` | 서명 대상 파일 |
| `.pkis-sig` | CMS SignedData |
| `.pkis-req` | 서명 요청 |
| `.csr` | PKCS#10 인증서 신청서 |

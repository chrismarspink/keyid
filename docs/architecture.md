# KeyID 아키텍처 & 설계 원칙

## 핵심 철학

1. **Zero-server** — 모든 암호화/서명은 브라우저에서만 수행. 서버에 개인키/평문 전달 금지.
2. **Standards-based** — 독자 포맷 금지. CMS(RFC 5652), X.509(RFC 5280), ECDSA P-256 사용.
3. **Progressive Enhancement** — WebAuthn PRF 없으면 비밀번호로 graceful fallback.
4. **Mobile-first** — 갤럭시 기준 360px 이상에서 완전 동작. 하단 네비 + 안전 영역 필수.

---

## 레이어 구조

```
[UI — SvelteKit Pages]
        ↓
[Crypto Layer — src/lib/crypto/]
   cms.ts        CMS SignedData / EnvelopedData 생성·검증
   cert.ts       X.509 자가서명 인증서 생성
   protection.ts 개인키 봉인 (WebAuthn PRF / PBKDF2)
   keygen.ts     ECDSA P-256 키 쌍 생성·임포트
   countersign.ts 카운터서명 (RFC 5652 §11.4)
        ↓
[Storage — src/lib/storage/]
   keystore.ts   IndexedDB v5 스키마
   contacts.ts   연락처 인증서 관리
        ↓
[Transport — Supabase Broadcast]
   reqsign 채널: 서명 요청 실시간 전달
   cosign 채널:  공동서명 SignerInfo 전달
```

---

## 키 보호 (protection.ts)

| 방법 | 알고리즘 | 언제 사용 |
|------|----------|-----------|
| WebAuthn PRF | AES-256-GCM (PRF seed) | 생체인증 지원 기기 |
| PBKDF2 | PBKDF2-SHA256 310,000회 → AES-256-GCM | 비밀번호 폴백 |

- 개인키는 항상 sealed 상태로 IndexedDB 저장
- unsealKey() 호출 시에만 일시적으로 메모리에 존재
- WebAuthn + 비밀번호 백업 동시 저장 가능 (passwordBackup 필드)

---

## IndexedDB 스키마 (v5)

| Store | Key | 용도 |
|-------|-----|------|
| identity | 'self' | 현재 활성 신원 (싱글톤) |
| expired_identities | autoIncrement | 폐지된 신원 (역사적 서명용) |
| files | autoIncrement | 서명/암호화된 파일 기록 |
| contacts | autoIncrement | 연락처 인증서 |
| ca_certs | autoIncrement | CA 인증서 저장소 |
| settings | 'default' | 앱 설정 |

---

## Supabase 채널 네이밍

| 채널명 | 이벤트 | 용도 |
|--------|--------|------|
| `reqsign-{uuid}` | `signed` | A→B 서명 요청, B의 .pkis-sig 반환 |
| `cosign-{uuid}` | `cosigned` | A→B 공동서명 요청, B의 SignerInfo+cert 반환 |

- 채널은 1회성. 전달 후 즉시 `supabase.removeChannel()` 호출.
- payload는 base64 인코딩된 ArrayBuffer.

# keyid 구성요소

## 관계도

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              keyid SPA                                      │
│                          (SvelteKit + GitHub Pages)                         │
└───────────────────────────────┬─────────────────────────────────────────────┘
                                │
                        ┌───────▼────────┐
                        │  +layout.svelte │  ← 앱 껍데기 / 네비게이션
                        └───────┬────────┘
          ┌─────────────────────┼──────────────────────┐
          │                     │                      │
 ┌────────▼────────┐   ┌────────▼────────┐   ┌────────▼────────┐
 │  신원 (Identity) │   │   파일 (Files)   │   │  기타 페이지     │
 │                 │   │                 │   │                 │
 │ +page           │   │ sign/+page      │   │ contacts/+page  │
 │ identity/+page  │   │ encrypt/+page   │   │ contacts/[id]   │
 │ settings/+page  │   │ verify/+page    │   │ files/+page     │
 │ request/+page   │   │                 │   │ install/+page   │
 └────────┬────────┘   └────────┬────────┘   └────────┬────────┘
          │                     │                      │
          └─────────────────────┼──────────────────────┘
                                │
          ┌─────────────────────▼──────────────────────┐
          │              Components                     │
          │  IDCard  IDCardWide  KeyUnlock  QRCode      │
          │  TrustBadge  InstallBanner                  │
          └─────────────────────┬──────────────────────┘
                                │
          ┌─────────────────────▼──────────────────────┐
          │                 lib/crypto                  │
          │                                             │
          │  keygen ──→ cert ──→ csr                   │
          │                 ↘                           │
          │  protection     cms (sign/encrypt/verify)   │
          │  identicon      countersign                 │
          └─────────────────────┬──────────────────────┘
                                │
          ┌─────────────────────▼──────────────────────┐
          │              lib/storage                    │
          │                                             │
          │  keystore (IndexedDB v5)                    │
          │  ┌──────────┬──────────┬──────────────────┐│
          │  │ identity │ contacts │ files             ││
          │  │ settings │ ca_certs │ expired_identities││
          │  └──────────┴──────────┴──────────────────┘│
          │  contacts.ts  (연락처 CRUD 헬퍼)             │
          └────────────────────────────────────────────┘

          lib/qr      — BC-UR QR 인코딩/스캔
          lib/share   — ID카드 PNG 렌더링, OG 이미지
          lib/fileHandler — 파일 다운로드 유틸
          sw.ts       — PWA Service Worker
```

## 구성요소 요약

| 계층 | 구성요소 | 역할 |
|---|---|---|
| **Pages** | `+page` (홈) | 신원 최초 생성 |
| | `identity/+page` | 신원 조회·갱신·삭제 |
| | `settings/+page` | 알고리즘·CA인증서·CSR 설정 |
| | `file/sign` | 서명 / 서명+암호화 |
| | `file/encrypt` | 암호화 / 복호화 |
| | `file/verify` | 서명 검증 (그래피컬) |
| | `contacts/*` | 연락처 목록·상세 |
| | `files/+page` | 수신 파일 목록 |
| | `request/+page` | 인증서 요청(외부 수신) |
| **Components** | `IDCard / IDCardWide` | 신원카드 표시 (identicon 폴백) |
| | `KeyUnlock` | 개인키 잠금 해제 UI |
| | `QRCode / TrustBadge` | QR·신뢰 배지 |
| **crypto** | `keygen` → `cert` | 키 생성 → 자가서명 인증서 |
| | `cert` → `csr` | 인증서 → CSR 생성 |
| | `cms` | CMS SignedData / EnvelopedData |
| | `protection` | 개인키 봉인 (WebAuthn PRF / 암호) |
| | `identicon` | FNV-1a 해시 → SVG 아이콘 |
| **storage** | `keystore` | IndexedDB 전체 관리 |
| | `contacts` | 연락처 CRUD |

# KeyID 아키텍처 & 설계 원칙
- keyid는 "중앙 서버 없는 결재 도장"을 요청하고 메시지에 추가하는 역할을 합니다.
  

## 핵심 철학

1. **Zero-server** — 모든 암호화/서명은 브라우저에서만 수행. 서버에 개인키/평문 전달 금지.
2. **Standards-based** — 독자 포맷 금지. CMS(RFC 5652), X.509(RFC 5280), ECDSA P-256 사용.
3. **Progressive Enhancement** — WebAuthn PRF 없으면 비밀번호로 graceful fallback.
4. **Mobile-first** — 갤럭시 기준 360px 이상에서 완전 동작. 하단 네비 + 안전 영역 필수.
5. **적정기술과 사용의 용이성** - 복잡한 pki기술을 가장 단순한 방법으로 활용한다. 

## 구현해야 할 기능

1. 신원(인중서 + 개인키)
- 신원(인증서와 개인키) 생성 시 아미지를 불러들여 로고타입으로 추가해야 한다
- 로고타입이 없는 인증서는 identicon을 이용하여 화면에 출력한다
- 인증서는 반드시 사용자의 이름, 이메일과 전화번호를 포힘해야 한다.


2. CMS 파일 처리
- 본인 인증서, 개인키와 타인들 다수의 인증서를 이용하여 파일을 생성한다. 
- 파일은 CMS 포멧의 메시지를 생성하고 복호화하고, 정보를 보여주고, 타인에게 전달한다
- 적정기술 원칙에 따라 특별한 중계서버를 두지 않고, 시스템의 파일 공유 기능을 이용한다. 따라서 특별한 서버 구현 없이 CMS 파일의 교환이 가능하다
- CMS는 다중 암호화 가능으로 여러 사용자에게 단일 파일만으로 안전한 파일을 보냅니다, 파일은 특정 서버 없이 시스템의 파일 공유 기능을 최대한 활욯합니다

3. 암호화된 파일
- 암호화된 파일, encryptedData는 수신자, 또는 수신자들의 인증서로 다중 서명된 CMS를 생성한다.
- 암호화 수행 시 이 파일을 압축할 것안지 묻고, 압축을 먼저 수행한다. compressedData를 암호화하고, 암호화 키를 수신자(들)의 인증서로 각각 암호화한다

4. 서명된 파일
- 서명된 파일은 자신의 게인키로 서명한다
- 서명시 시스템에 따라 지문, 비밀번호, 얼굴인식, 패턴 등등 사용 가능한 모든 추가 인증 방식 사용이 가능해야 한다
- 추가적으로 본안의 서명 외 타인의 서명이 필요한 경우가 있으며 결제, 공동서명이 이에 해당한다. 
- 결제와 공동서명은 서명 순서의 차이가 있다. 결제는 결제자 순서대로 서명 가능해야 한다
- 결제인 경우, keyid사용자는 결제 라인을 미리 지정해 놓을 수 있다. 결제라인은 서명순서를 의미하며 각각의 사용자를 순서대로 배치(변경 가능)한다
- 공동 서명의 경우, 결제할 사용자의 신원(인증서)을 배치하는 것이다, 서명의 순서는 상관이 없이 서명 결과가 들어오는 대로 cms애 추가한다.   

5.   친구 추가
- keyid의 친구 추가는 사실 파일로 공유받은 인증서를 불러들여 keyid가 관리하는 친구 목록에 추가하는 것입니다
- 친구 목록을 보여줄 때는 인증서에 포함된 logotype을 보여주며, 없는 경우 identicon을 이용하여 이미지를 출력합니다

6.   결제 기능
- 파일 보안(CMS)과 다중 서명을 써서, 여러 사람이 승인해야 열리는 보안 문서를 만듭니다.
- 어떻게 연결되는가? (결재 프로세스)
- 요청자: "결재해 주세요"라는 QR이나 파일을 만듭니다. 이때 sessionId라는 고유 번호를 Supabase(우체통)에 등록하고, 누가 편지를 넣나 실시간으로 지켜봅니다.
- 서명자: QR을 스캔하면 앱이 뜨고, 지문이나 비번을 찍으면 즉시 서명값이 Supabase의 해당 번호 칸에 들어갑니다.
- 완료: 요청자 앱은 서명이 들어오자마자 그걸 낚아채서 최종 보안 문서(다중 암호화)를 완성합니다.

7.  결제 또는 CMS 생성 시 보안의 3대 원칙 (클로드가 꼭 지켜야 할 것)
- Sign-then-Encrypt: 무조건 [압축 → 서명 → 암호화] 순서로 작업합니다. (서명을 먼저 해야 누가 서명했는지 보호할 수 있습니다.)
- Zero Trust 서버: Supabase는 단순히 편지를 전달하는 '우체통'일 뿐입니다. 서버는 내용을 절대 알 수 없고, 모든 복호화와 검증은 사용자 기기(KeyID 앱)에서만 합니다.
- RLS(보안 규칙): 로그인 안 한 사람도 서명은 보낼 수 있어야 하지만, 아무 칸에나 넣으면 안 됩니다. 오직 요청자가 발행한 sessionId와 일치할 때만 딱 한 번 넣을 수 있게 DB 규칙을 잡습니다. 


8. keyid 배포
- keyid는 pwa앱으로 생성된다. 모든 플랫폼에서 동작해야 한다
- 플랫폼은 윈도우, 맥, 리눅스와, 안드로이드, 아이폰을 포함한다
9. 매시지 확장자
- 암호화, 서명, 서명암호화는 아래와 같은 cms(pkcs7) 표준을 준용한다.  
- .p7s(Signature):  디지털 서명 전용. 원본 파일은 밖에 있고 서명값만 따로 저장하거나, S/MIME 이메일에서 본문 뒤에 붙는 서명 파일로 쓰입니다.
- .p7m(MIME Message): 서명 및 암호화 본문. 데이터가 CMS 구조 안에 포함된(Encapsulated) 형태. SignedData나 EnvelopedData를 담을 때 씁니다.
- .p7b(Certificate Bundle): 인증서 묶음. 개인키는 포함하지 않고, 공개키 인증서 체인이나 CRL(폐기 목록)을 전달할 때 씁니다. (Windows에서 주로 사용)
- .p7c(Certs-only): .p7b와 유사하게 인증서만 들어있는 구조입니다.
- .p7r(Review/Response):  인증서 발급 요청(CSR)에 대한 응답 파일로, 서명된 인증서를 전달할 때 쓰입니다.
- .pkis-reqsign (커스텀): 용도: 서명 요청용 (Sign Request). 서명 대상인 nonce, 요청 메시지, 요청자의 식별 정보 등이 담긴 간단한 CMS 구조.
- .p7s 또는 .p7m: 용도: 결재자가 서명을 완료하여 Supabase로 던지는 결과물. 내용: SignedData (난수에 대한 서명값 포함).
- 최종 보안 파일 (.p7m): 용도: 결재 완료 후 수신자들에게 배포되는 최종 파일, 내용: CompressedData → SignedData → EnvelopedData가 중첩된 구조.


10. 승인 후 복호화 기능 추가
- 승인지의 서명이 있어야 파일(들)의 복호화가 가능하다
- 승인자는 승인 시간 등을 고려 1인으로 한정한다. 
- cms 생성 시 복호화에 필용한 키 일부를 불완전하게 만들고, 승인자의 승인 과정을 통해 이 복호화키가 완전해질 수 있게 설계한다. 설계 결과와 변경은 다시 이 문서에 "## 승인 후 복호화" 항목에 추가한다.
- keyid 사용자는 문서 생성 시, 수신자만 복호화 할지, 수신자들이 승인을 받은 후 복호화할지를 선택할 수 있다

11. 뷰어 기능의 추가
- 복호화된 파일/데이터가 반출되는것을 막거나, 오프라인 환경에서의 보안 용도
- pdf.js를 가반으로 하며, pdf만 볼 수 있다
- 추가적인 보안을 위한 기능이 있으면 적용하라, 화면에 워터마트를 뿌리거나, 화면 캡처 방지, 메모리 상에서만 파일 처리하고 파일 시스템에 저장하지 않음 등을 적용하고 적용된 기능은 이 문서의 "## 자체 문서 뷰어" 헝목에 추가하라
- 복호화된 파일은 여러 파일일 수 있으므로 어떤 파일을 볼 지, 사용자가 선택하게 하라. 복호화가 되어 있으므로 사용자의 신원을 확인하지는 않는다.

12. 파일 헤더 설계

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
| `approval-{uuid}` | `approved` | A→B 복호화 승인 요청, B의 gate_key 봉투 반환 |

- 채널은 1회성. 전달 후 즉시 `supabase.removeChannel()` 호출.
- payload는 base64 인코딩된 ArrayBuffer.

---

## 승인 후 복호화

### 설계 (AES-GCM 키 분리 방식)

```
gate_key     = random 32-byte AES-256 key
inner_cms    = CMS EnvelopedData(content, recipientCerts)        // 수신자 공개키로 암호화
gated_blob   = AES-256-GCM(inner_cms, gate_key)                 // gate_key로 이중 암호화
approval_cms = CMS EnvelopedData(gate_key_bytes, approverCert)  // 승인자 공개키로 gate_key 봉투
```

### 바이너리 페이로드 레이아웃 (PKIS type 0x09 = 'gated')

```
[4B BE]   gated_blob 길이
[12B]     AES-GCM IV
[N B]     gated_blob  (AES-256-GCM ciphertext of inner_cms)
[rest]    approval_cms DER
```

### 흐름

1. **암호화 (요청자)**: `encryptApprovalGated(fileData, recipientCerts, approverCert)` → PKIS 'gated' 파일
2. **승인 요청 (수신자)**: 'gated' 파일을 받으면 `approval_cms`를 추출해 `.pkis-req` (type 'approval-req') 파일 생성. Supabase `approval-{uuid}` 채널 구독 대기.
3. **승인 처리 (승인자)**: `.pkis-req` 열면 `processApproval(approval_cms, approverKey, approverCert, requesterCert)` → 수신자용 gate_key 봉투 → Supabase `approval-{uuid}` 채널로 전송.
4. **복호화 (수신자)**: Supabase에서 gate_key 봉투 수신 → `unlockGatedPayload(payload, gateKeyEnv, recipientKey, recipientCert)` → inner_cms → `decryptEnveloped` → 원본 파일

### 구현 파일

- `src/lib/crypto/approval.ts` — 핵심 암호화 함수
- `src/routes/file/encrypt/+page.svelte` — 암호화(승인 옵션) + 복호화(승인 요청/대기/복호화)
- `src/routes/request/+page.svelte` — 승인자 처리 (approveGated)

---

## 자체 문서 뷰어

### 보안 기능

| 기능 | 구현 |
|------|------|
| 메모리 전용 | `pendingViewerFiles` Svelte writable store. 파일시스템 저장 없음. 뷰어 종료 시 자동 삭제. |
| 워터마크 | 각 페이지 렌더링 후 캔버스에 "KeyID · {이름}" 대각선 반복 (파란색 10% 투명도) |
| 우클릭 차단 | `document.addEventListener('contextmenu', e => e.preventDefault())` |
| 인쇄 차단 | `@media print { body { display: none !important; } }` |
| 텍스트 선택 차단 | `user-select: none; -webkit-user-select: none` (CSS) |
| 다중 파일 선택 | 복호화 파일이 여러 개일 때 파일 목록에서 선택 |

### 구현

- 엔진: `pdfjs-dist` (동적 import, 번들 워커 사용)
- 경로: `src/routes/file/view/+page.svelte`
- 스토어: `src/lib/viewerStore.ts` (`ViewerFile { name, data: Uint8Array, mimeType? }`)
- 복호화 후 PDF 파일은 "보안 PDF 뷰어로 열기" 버튼 제공 (`encrypt/+page.svelte`)



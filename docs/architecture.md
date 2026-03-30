# KeyID 아키텍처 & 설계 원칙
- keyid는 PKI와 CMS 기술을 이용한다
- 암호화, 서명된 안전한 파일을 생성하고 교환하며, 안전하게 열람하는 기능을 제공한다, 
- 파일 뷰어를 내장하여, 전달된 파일이 복호화된 이후에도 유출을 최대한 방지하는 기능을 한다. 
- 단일소스로 PC, 모바일 앱을 모두 제공한다. 이를 위해 PWA로 개발한다. 

## 핵심 철학

1.  모든 암호화/서명은 브라우저에서만 수행. 서버에 개인키/평문 전달 금지.
2. Standards-based — 독자 포맷 금지. CMS(RFC 5652), X.509(RFC 5280), ECDSA P-256을 사용하고 대칭키는 양자내성 암호화를 사용.
3. Progressive Enhancement — WebAuthn PRF 없으면 비밀번호로 graceful fallback.
4. 적정기술과 사용의 용이성과 심미성  - 복잡한 pki기술을 단순하고 우아한 방식으로 활용한다. .

## GUI
- shadcn-svelte.com를 적용한다.
- GUI의 룩앤필은 Supabase Studio의 대시보드 레이아웃을 100% 벤치마킹한다. 
- 복잡한 커스텀 디자인하지 말고 Shadcn의 기본 sidebar-07 템플릿을 기반으로 시작한다

## 구현해야 할 기능

###  신원(인중서 + 개인키)
- 신원은 인증서와 개인키이다. 
- 개인키는 패스워드로 보호된다. 
- 인증서에는 이름, 이메일, 전화번호, 조직명, 국가명이 포함되어야 한다. 
- 전화번호는  전화번호를 subjectAltName의 otherName에 담는다
- 개인키를 사용할 때 시스템 특성에 맞게, 암호, 지문, 패턴, 안면인식 등 가용한 기능을 활용한다. 
### . 인증서의 교환 및 저장
- 신원 중 인증서는 교환이 가능해야 하며, 인증서 파일의 공유, 메일 전송 등 을 제공한다. 
- 인증서 타입은 pkcs7의 ,p7c, crt 확장자와 포멧을 이용한다. 인증서임을 명확하게 하기 위해서이다.  인증서는 상위 인증서(CA)를 포함할 수 있다
- 본인의 신원(인증서+개인키)은 pkcs12, pem으로  export/import가 가능하다. 각각 개인키, pkcs2 비밀번호를 입력해야 한다. 

###  신원 인증서의 출력
- 신원인증서는 이름을 가진다. 인증서의 CN과 인증서 시리얼번호, 이메일, 전화번호를 출력한다. 
- 본인 인증서 생성 시 x.509 표준 중 로고타입을 지원한다. 
- 인증서의 생성자는 본인 디바이스의 이미지를 불러 로고타입에 직접 추가할 수 있다
- keyid는 인증서에 포함된 로고타입을 출력한다. 
- 로고타입이 없는 경우 identicon을 이용한다. 
- 로고타입이 없는 인증서는 identicon을 이용하여 화면에 출력한다




## 설정
- 설정 페이지가 필요하다
- 서명에 필요한 공동서명자나 결제라인을 생성할 수 있다
- 개인신원 생성에 필요한 필드들, 알고리즘들, 인증서의 유효기간등을 생셩할 수 있다
- 인증서 발급기관(CA)리스트를 생성할 수 있다. 

## CMS

### CMS 파일의 생성 
- 본인 인증서, 개인키와 타인들 다수의 인증서를 이용하여 파일을 생성한다.
- 생성된 CMS 파일의 이력이 관리되어야 한다. 
- 서명은 다중 서명이 가능하다, 본인 서명 외 추가되는 서명은 (1) 결제 (2) 공동서명의 두가지 역할을 한다. 서명 시 선택할 수 있다
- 서명을 위해 서명자의 인증서가 반드시 필요하다
- 본인이 서명하는 경우 본인의 개인키로 서명한다. 
- 추가로 타인이 서명하는 경우, 서명 요청이 필요하다. 
- 결제나 공동 서명의 방식은 서명 시 (1) QR 코드를 생성하고 이를 화면에 출력하거나 (2) QR을 이메일로 서명자에게 전달하거나, (3) 서명 요청 파일을 생성하는 방식이 있다
- 서명 요청 파일은 파일로 저장되거나 메일로 전달된다. 메일 주소는 서명자의 인증서에 있는 메일 주소를 사용한다. 서명 요청 파일은 .pkis-reqsign이다
- 서명 요청 위한 QR,pkis-reqsign파일에는 nonce(서명자가 개인키로 서명할 대상)와 서명값을 받을 채널(supabase 주소 https://leseqdfucxuivrpufepc.supabase.co/,  암호: sb_publishable__FfJg_yCmfKe0GF77yiL7g_sPmzRnAT)를 이용한다. 
- 서명 요청하면,  keyid는 해당 절차를 중지하고 서명 값이 생성되기를 기다린다. 서명값 생성이 확인되면 이를 cms에 삽입하고 다음 절차를 기다린다. 이 과정은 백그라운드에서 수행되어야 하고, 사용자는 다른 작업을 수행할 수 있다
- CMS에 복수의 파일이  포함될 수 있어야 한다. EncapsulatedContentInfo는 하나뿐이므로 tar를 사용하여 복수 파일을 묶는다 라이브러리는 modern-tar나   tarballjs를 사용하라
### 결제 라인 또는 공동 서명자
- 설정으로 결재 라인 리스트 또는 공동 서명자 리스트를 만들어 놓고 서명 시 참조할 있다
- 예를들어 “결제라인1”, “결재라인2”를 생성하고 순서대로 서명자를 추가
- 또, 공동서명자3을 생성하고 무작위로 공동서명할 사용자의 인증서를 추가하고 설정에 저장
- CMS는 다중 암호화가 가능하다. 
- CMS 암호화는 단순 암호화, 서명 후 암호화 2가지가 있다
- 암호화 할 때 압축 여부를 지정할 수 있다, 압축이 선텍되면 먼저 CompressedData를 먼저 생성한다. 
- 다중 암호화 또는 암호화를 위해 keyid가 가진 인증서를 리스트를 출력하고 이를 선택한다

## CMS 복호화
- 암호화의 경우 (1) 단순암호화 (2) 복호화 과정에서 승인이 필요한 암호화 (3) 복호화된 데이터를 파일로 저장할 수 있는지 여부, 즉 “ keyid 전용 뷰어”에서만 열수 있는 파일인지를 설정할 수 있어야 한다. 
- 암호화된 CMS 파일(p7m)은 복호화가 가능해야 한다. 
- 복호화를 위해 수신자(RecipientInfo)에 포함된 인증서와 쌍이 되는 개인키가 필요하다
- 개인키의 사용은 모두 동일하며 개인키 암호를 입력하거나, 지문, 패턴, 안면 등 가용하고 설정된 방식으로 개인키 접근이 가능하다
### CMS 복호화에서 복호화 승인, 전용 뷰어의 사용
- cms에 속성으로 전용 뷰어 필요 여부, 승인자가 승인해야 복호화 가능한지 여부를 포함시킨다. unprotectedAttrs를 이용한다. EncryptedContentInfo밖에 위치하므로 여기에 전용 뷰어 필요여부를 넣느다. 이 속성이 설정되어 있는 경우 절대 파일로 저장해서는 안되고 반드시 전용 뷰어를 자동으로 띄워야 한다. 전용 뷰어 속성이 설정되어 있지 않는 경우만 복호화 파일을 파일 시스템에 저장한다. 저장 속성은
-- iewerRequired (OID: 1.3.6.1.4.1.xxxxx.1) : Boolean (True/False)
-- approvalRequired (OID: 1.3.6.1.4.1.xxxxx.2) : Boolean (True/False) 두가지를 사용한다. 
- 암호화 파일의 경우, 아래 두가지 원칙을 지킨다. 
- 가시성 우선: unprotectedAttrs를 사용하여 사용자가 파일을 "열기 전"에 미리 뷰어 필요 여부를 알 수 있게 하십시오. (UX 효율성)
- 데이터 바인딩: 만약 승인자가 승인해야 하는 로직이라면, approvalRequired 속성 안에 '승인 요청 ID'를 함께 넣어둔다 , PWA가 서버로 즉시 "이 요청 ID에 대한 승인 상태를 확인해줘"라고 쿼리를 날릴 수 있어 훨씬 지능적인 시스템을 구현한다. 

## 전용 뷰어
- KeyID는 전용 PDF 뷰어를 내장한다. 
- 복호화 후 파일이 외부로 유출(파일 저장)이 우려되는 경우 이 전용 뷰어를 이용한다. 
- 전용 뷰어는 pdf.js를 이용하여 구현한다. 
- 전용 뷰어는 기본적으로 문서를 읽는 사람의 정보를 워터마크로 표시한다. 워터마크 출력은 디폴트이다, 
- 뷰어로 파일을 보다 뷰어를 닫으면 메모리를 클리어하여 보안을 확보한다. 
- CMS는 복호화를 하지 않고도 이 파일이 어떤 파일인지 사용자에게 최대한 출력해준다
        (1) 파일 자체가 암호화된 파일인지 서명된 파일인지
        (2) 서명 파일이면 누가 이 파일에 서명했는지 서명자 리스트
        (3) 암호화 인 경우 암호화 알고리즘
        (4) 암호화 인 경우 지정된 수신자(누가 이 파일을 복호화 할 권한을 가지고 있는지)
        (5) 생성일
        (6) 상태 - 복호화를 위해 승인이 필요한지, 복호화 후 전용 뷰어로만 봐야 하는 파일인지

## 파일 관리
- CMS 이력관리를 위한 “파일 목록” 메뉴를 제공한다. 
- 파일 목록에 리스업된 파일들은 타입에 따라서 서명 검증하거나, 복호화/전용뷰어로 보기 등을 지능적으로 출려한다. 
- 예들들어 서명된 파일의 경우 복호화 버튼이 보여서는 안된다. 
- 암호화, 서명된 파일들은 타 사용자에게 전달이 가능하다.  keyid와 연결된 전송 이메일 기능이 활성화되어 있으면 기본으로 사용하고 없다면 카카오톡 등 시스템의 공유 기능을 이용한디

##  친구 관리
- 친구 관리는 타인 인증서를 가져와서 나의 데이터베이스에 저장하고 관리하고 사용하는 것을 의미한다. 
- keyid의 친구 추가는 사실 파일로 공유받은 인증서를 불러들여 keyid가 관리하는 친구 목록에 추가하는 것입니다
- 친구 목록을 보여줄 때는 인증서에 포함된 logotype을 보여주며, 없는 경우 identicon을 이용하여 이미지를 출력합니다
- 친구라는 명칭은 비지니스에는 적합하지 않으므로 적정한 이름으로 수정한다

##   결제 기능
- 파일 보안(CMS)과 다중 서명을 써서, 여러 사람이 승인해야 열리는 보안 문서를 만듭니다.
- 어떻게 연결되는가? (결재 프로세스)
- 요청자: "결재해 주세요"라는 QR이나 파일을 만듭니다. 이때 sessionId라는 고유 번호를 Supabase(우체통)에 등록하고, 누가 편지를 넣나 실시간으로 지켜봅니다.
- 서명자: 타인의  keyid 앱에 표시된 QR을 직접 스캔합니다. 스캔도 역시 서명자의  keyid앱에서 이루어집니다. 지문이나 비번을 찍으면 즉시 서명값이 Supabase의 해당 번호 칸에 들어갑니다.
- 이를 위해 서명 요청중인 파일들이 관리되어야 하고, 서명요청중인 경우 QR을 화면에 출력해 서명자에게 제시하거나 메일로 보내거나, 서명 요청 파일을 공유 기능을 써서 전달하는 기능이 구현되아야 한다. 
- 완료: 요청자 앱은 서명이 들어오자마자 그걸 낚아채서 최종 보안 문서(다중 암호화)를 완성합니다.

##   결제 또는 CMS 생성 시 보안의 3대 원칙 (클로드가 꼭 지켜야 할 것)
- Sign-then-Encrypt: 무조건 [압축 → 서명 → 암호화] 순서로 작업합니다. (서명을 먼저 해야 누가 서명했는지 보호할 수 있습니다.)
- Zero Trust 서버: Supabase는 단순히 편지를 전달하는 '우체통'일 뿐입니다. 서버는 내용을 절대 알 수 없고, 모든 복호화와 검증은 사용자 기기(KeyID 앱)에서만 합니다.
- RLS(보안 규칙): 로그인 안 한 사람도 서명은 보낼 수 있어야 하지만, 아무 칸에나 넣으면 안 됩니다. 오직 요청자가 발행한 sessionId와 일치할 때만 딱 한 번 넣을 수 있게 DB 규칙을 잡습니다.
##  keyid 배포
- keyid는 pwa앱으로 생성된다. 모든 플랫폼에서 동작해야 한다
- 플랫폼은 윈도우, 맥, 리눅스와, 안드로이드, 아이폰을 포함한다

## 메시지 확장자
- 암호화, 서명, 서명암호화는 아래와 같은 cms(pkcs7) 표준을 준용한다. 
- .p7s(Signature):  디지털 서명 전용. 원본 파일은 밖에 있고 서명값만 따로 저장하거나, S/MIME 이메일에서 본문 뒤에 붙는 서명 파일로 쓰입니다.
- .p7m(MIME Message): 서명 및 암호화 본문. 데이터가 CMS 구조 안에 포함된(Encapsulated) 형태. SignedData나 EnvelopedData를 담을 때 씁니다.
- .p7b(Certificate Bundle): 인증서 묶음. 개인키는 포함하지 않고, 공개키 인증서 체인이나 CRL(폐기 목록)을 전달할 때 씁니다. (Windows에서 주로 사용)
- p7c(Certs-only): .p7b와 유사하게 인증서만 들어있는 구조입니다.
- p7r(Review/Response):  인증서 발급 요청(CSR)에 대한 응답 파일로, 서명된 인증서를 전달할 때 쓰입니다.
- pkis-reqsign (커스텀): 용도: 서명 요청용 (Sign Request). 서명 대상인 nonce, 요청 메시지, 요청자의 식별 정보 등이 담긴 간단한 CMS 구조.
- p7s 또는 .p7m: 용도: 결재자가 서명을 완료하여 Supabase로 던지는 결과물. 내용: SignedData (난수에 대한 서명값 포함).
- 최종 보안 파일 (.p7m): 용도: 결재 완료 후 수신자들에게 배포되는 최종 파일, 내용: CompressedData → SignedData → EnvelopedData가 중첩된 구조.
- 복호화 승인 요청 파일 →   pkis.dereq,  CMS 파일의 복호화를 요청한다. 승인 결과를 받을 수 있는 supabase 주소가 포함되어 있다


## 승인 후 복호화 기능 추가
- 승인 후 복호화 가능 정책이 적용된 CMS로 확인되면 복호화 때 CMS에 포함된 승승인지의 승인이 있어야 파일(들)의 복호화가 가능하다
- 승인자는 승인 시간 등을 고려하며 한명(1인)으로 한정한다.
- 승인자 정보는 CMS에서 얻을 수 있어야 하며 수신자 정보에 추가하고, 해당 수신자의 ID나 이메일, 전화변호 등을 이용하여  QR을 보내거나 복호화 요청 파일을 보낼 수 있어야한다.
- 승인 자체는 특정 난수를 승인자에게 보내고, 개인키 서명을 되돌려 받는다 승인자 인증서로 검증되면 승인이 된 것으로 간주하며 반드시 이 프로세스를 감사로그에 저장해야 한다. 
- keyid 사용자는 문서 생성 시, 수신자만 복호화 할지, 수신자들이 승인을 받은 후 복호화할지를 선택할 수 있다

## 뷰어 기능 추가
- 복호화된 파일/데이터가 반출되는것을 막거나, 오프라인 환경에서의 보안을 위한 용도
- pdf.js를 가반으로 하며, pdf만 볼 수 있다
- 추가적인 보안을 위한 기능이 있으면 적용하라, 화면에 워터마트를 뿌리거나, 화면 캡처 방지, 메모리 상에서만 파일 처리하고 파일 시스템에 저장하지 않음 등을 적용한다
- 이 정책들은 문서 생성자의 keyid앱에서 정책으로 설정할 수 있어야 하며 CMS 속성에 기록된다. 속성은 복호화 하지 않고 읽을 수 있어야 한다. 
- 복수의 파일은 tar로 묶여있다. tar는 파일명, 크기, 권한, 수정시간등을 보존하므로, 복수의 파일인 경우 이를 먼저 출력해주고 사용자가 뷰어를 통해 볼 파일을 선택하도로 구현한다. 

##  서명
- 서명은 서명파일을 따로 생성(서명원본 + p7s), 같이 생성(p7m) 두 가지 옵션이있다. 
- 서명할 때, detached 서명 사용 여부를 선택하게 하라. 
- p7m은 서명원본이 필요없다. 
- 어떤 인증서로 서명헸는지 파일 보기에서 출력하라. 
ㅍ서명 검증은 p7s냐 p7m이냐에 따라 원본 파일 요청하거나 disabe처리한다


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



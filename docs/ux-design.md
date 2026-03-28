# KeyID UX / 디자인 원칙

## 레이아웃 시스템

- **모바일** (`< md`): 하단 탭 네비 + 전체 화면 스크롤
- **데스크톱** (`>= md`): 좌측 아이콘 레일 + 우측 콘텐츠 영역

### 안전 영역 필수 규칙
```css
/* 하단 네비: 항상 제스처 바 대응 */
padding-bottom: max(env(safe-area-inset-bottom), 8px);

/* 콘텐츠 영역: 하단 네비 높이 확보 */
padding-bottom: calc(64px + max(env(safe-area-inset-bottom), 8px));
```

---

## 컬러 시스템 (다크 전용)

| 변수 | 값 | 용도 |
|------|-----|------|
| `--navy` | #1d6ef5 | 주요 액션, 활성 상태 |
| `--bg` | #1e2433 | 페이지 배경 |
| `--bg-panel` | #262d3d | 카드/패널 배경 |
| `--bg-sidebar` | #0f1520 | 레일/하단 네비 배경 |
| `--text` | #e2e8f0 | 본문 텍스트 |
| `--text-muted` | #8892a4 | 보조 텍스트 |
| `--text-dim` | #4b5563 | 비활성/힌트 텍스트 |

---

## 컴포넌트 규칙

### 버튼
- `btn-primary`: 주요 액션 (파란색)
- `btn-secondary`: 보조 액션 (패널 배경)
- `btn-danger`: 삭제/위험 (빨간색)
- `btn-icon`: 아이콘만 (8×8, 둥근 모서리)

### 패널
- `.panel` = `rounded-xl p-5` + bg-panel 배경 + border
- 모든 카드/섹션은 panel 클래스 사용

### 토스트 알림
```svelte
let toast = { visible: false, msg: '', type: 'info' as 'success'|'error'|'info' };
function showToast(msg, type = 'info') {
  toast = { visible: true, msg, type };
  setTimeout(() => toast = { ...toast, visible: false }, 3200);
}
// 템플릿:
{#if toast.visible}
  <div class="toast toast-{toast.type}" role="alert">{toast.msg}</div>
{/if}
```

---

## IDCardWide 반응형 규칙

- `cardWidth >= 460px`: 3열 레이아웃 (band + avatar + info | metadata)
- `cardWidth < 460px`: 모바일 compact (band + avatar + 이름/날짜 | 지문 하단)
- `bind:clientWidth={cardWidth}`로 실제 렌더 너비 감지

---

## 페이지별 pb (padding-bottom) 규칙

모든 모바일 페이지 최상단 div:
```html
<div class="px-4 pt-6 pb-24 ...">
```
`pb-24` = 96px → 하단 네비(60px) + 여백 충분히 확보.

---

## 에러 처리 패턴

```svelte
let error = '';
// 오류: error = '메시지';
// 클리어: error = '';

{#if error}
  <div class="p-4 rounded-xl text-sm text-red-400 bg-red-500/10">{error}</div>
{/if}
```

---

## 로딩/진행 패턴

```svelte
let signing = false; // 또는 loading, processing 등

<button disabled={!canProceed || signing} on:click={doAction}>
  {#if signing}
    <div class="w-5 h-5 rounded-full border-2 border-white border-t-transparent animate-spin"></div>
    처리 중…
  {:else}
    액션 버튼
  {/if}
</button>
```

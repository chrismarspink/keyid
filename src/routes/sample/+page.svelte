<script lang="ts">
  import { base } from '$app/paths';
</script>

<svelte:head><title>디자인 미리보기 — KeyID</title></svelte:head>

<!-- Full-screen overlay (covers existing layout) -->
<div class="preview-shell">

  <div class="preview-header">
    <a href="{base}/" class="back-btn">
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/>
      </svg>
      앱으로 돌아가기
    </a>
    <h1>디자인 옵션 비교</h1>
    <p>실제 전환 전 시각적 검토용 샘플입니다</p>
  </div>

  <div class="cards">

    <!-- Option C -->
    <a href="{base}/sample/option-c" class="option-card option-c">
      <div class="option-badge">Option C</div>
      <div class="option-title">테마만 교체</div>
      <div class="option-sub">CSS variables → Supabase Studio 팔레트</div>

      <div class="option-preview c-preview">
        <!-- mini rail -->
        <div class="mp-rail">
          <div class="mp-rail-dot active"></div>
          <div class="mp-rail-dot"></div>
          <div class="mp-rail-dot"></div>
          <div class="mp-rail-dot"></div>
          <div class="mp-rail-dot"></div>
        </div>
        <!-- mini content -->
        <div class="mp-content">
          <div class="mp-topbar"></div>
          <div class="mp-row"></div>
          <div class="mp-row short"></div>
          <div class="mp-row"></div>
          <div class="mp-row short"></div>
        </div>
      </div>

      <ul class="option-list">
        <li class="pro">레이아웃 구조 변경 없음</li>
        <li class="pro">기존 코드 99% 유지</li>
        <li class="pro">app.css 색상 변수만 수정</li>
        <li class="con">네비게이션 UX는 그대로</li>
        <li class="con">shadcn 컴포넌트 사용 불가</li>
      </ul>

      <div class="option-effort">
        <span class="effort-label">작업량</span>
        <div class="effort-bar"><div class="effort-fill" style="width:8%"></div></div>
        <span class="effort-text">½일</span>
      </div>
    </a>

    <!-- Option B -->
    <a href="{base}/sample/option-b" class="option-card option-b">
      <div class="option-badge featured">Option B</div>
      <div class="option-title">shadcn-svelte + Supabase 테마</div>
      <div class="option-sub">sidebar-07 레이아웃 + CSS variables 교체</div>

      <div class="option-preview b-preview">
        <!-- mini sidebar -->
        <div class="mp-sidebar">
          <div class="mp-logo"></div>
          <div class="mp-nav-item active">
            <div class="mp-nav-icon"></div>
            <div class="mp-nav-label"></div>
          </div>
          <div class="mp-nav-item">
            <div class="mp-nav-icon"></div>
            <div class="mp-nav-label"></div>
          </div>
          <div class="mp-nav-item">
            <div class="mp-nav-icon"></div>
            <div class="mp-nav-label"></div>
          </div>
          <div class="mp-spacer"></div>
          <div class="mp-user"></div>
        </div>
        <!-- mini main -->
        <div class="mp-main">
          <div class="mp-header">
            <div class="mp-breadcrumb"></div>
            <div class="mp-actions"><div></div><div></div></div>
          </div>
          <div class="mp-body">
            <div class="mp-row"></div>
            <div class="mp-row short"></div>
            <div class="mp-row"></div>
            <div class="mp-row short"></div>
          </div>
        </div>
      </div>

      <ul class="option-list">
        <li class="pro">Supabase Studio 레이아웃 구현</li>
        <li class="pro">shadcn-svelte 컴포넌트 사용</li>
        <li class="pro">텍스트 레이블 있는 사이드바</li>
        <li class="pro">Breadcrumb + 상단 헤더 바</li>
        <li class="con">레이아웃 전면 재작성</li>
        <li class="con">기존 페이지 마이그레이션 필요</li>
      </ul>

      <div class="option-effort">
        <span class="effort-label">작업량</span>
        <div class="effort-bar"><div class="effort-fill" style="width:60%"></div></div>
        <span class="effort-text">3~5일</span>
      </div>
    </a>

  </div>
</div>

<style>
  .preview-shell {
    position: fixed;
    inset: 0;
    z-index: 9999;
    background: #111318;
    display: flex;
    flex-direction: column;
    align-items: center;
    overflow-y: auto;
    padding: 2.5rem 1.5rem 4rem;
    font-family: 'Inter', system-ui, sans-serif;
  }

  .preview-header {
    text-align: center;
    margin-bottom: 2.5rem;
  }

  .back-btn {
    display: inline-flex;
    align-items: center;
    gap: 0.375rem;
    font-size: 0.78rem;
    color: #666;
    text-decoration: none;
    margin-bottom: 1.25rem;
    transition: color 0.15s;
  }
  .back-btn:hover { color: #aaa; }
  .back-btn svg { width: 0.875rem; height: 0.875rem; }

  h1 {
    font-size: 1.5rem;
    font-weight: 700;
    color: #ededed;
    margin: 0 0 0.375rem;
  }
  p {
    font-size: 0.83rem;
    color: #666;
    margin: 0;
  }

  /* ── Cards grid ── */
  .cards {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
    gap: 1.25rem;
    width: 100%;
    max-width: 820px;
  }

  .option-card {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    padding: 1.5rem;
    border-radius: 0.875rem;
    border: 1px solid rgba(255,255,255,0.07);
    background: #1c1c1c;
    text-decoration: none;
    transition: border-color 0.15s, background 0.15s;
    cursor: pointer;
  }
  .option-card:hover {
    border-color: rgba(255,255,255,0.15);
    background: #222;
  }
  .option-b { border-color: rgba(62,207,142,0.25); }
  .option-b:hover { border-color: rgba(62,207,142,0.5); }

  .option-badge {
    display: inline-flex;
    align-items: center;
    padding: 0.2rem 0.6rem;
    border-radius: 9999px;
    font-size: 0.7rem;
    font-weight: 700;
    letter-spacing: 0.05em;
    background: rgba(255,255,255,0.06);
    color: #888;
    width: fit-content;
  }
  .option-badge.featured {
    background: rgba(62,207,142,0.12);
    color: #3ecf8e;
    border: 1px solid rgba(62,207,142,0.25);
  }

  .option-title {
    font-size: 1.05rem;
    font-weight: 700;
    color: #ededed;
    margin-top: -0.25rem;
  }

  .option-sub {
    font-size: 0.78rem;
    color: #777;
    margin-top: -0.5rem;
  }

  /* ── Mini preview thumbnails ── */
  .option-preview {
    border-radius: 0.5rem;
    overflow: hidden;
    border: 1px solid rgba(255,255,255,0.08);
    height: 140px;
    display: flex;
  }

  /* Option C preview — rail + content */
  .c-preview { background: #181818; }

  .mp-rail {
    width: 28px;
    background: #141414;
    border-right: 1px solid rgba(255,255,255,0.06);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    padding: 14px 0;
    flex-shrink: 0;
  }
  .mp-rail-dot {
    width: 14px;
    height: 14px;
    border-radius: 4px;
    background: rgba(255,255,255,0.08);
  }
  .mp-rail-dot.active { background: rgba(62,207,142,0.4); }

  .mp-content {
    flex: 1;
    padding: 10px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .mp-topbar {
    height: 18px;
    background: rgba(255,255,255,0.04);
    border-radius: 3px;
    margin-bottom: 4px;
  }
  .mp-row {
    height: 12px;
    background: rgba(255,255,255,0.06);
    border-radius: 3px;
  }
  .mp-row.short { width: 65%; }

  /* Option B preview — sidebar + main */
  .b-preview { background: #181818; }

  .mp-sidebar {
    width: 80px;
    background: #141414;
    border-right: 1px solid rgba(255,255,255,0.06);
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 10px 8px;
    flex-shrink: 0;
  }
  .mp-logo {
    height: 16px;
    background: rgba(62,207,142,0.25);
    border-radius: 3px;
    margin-bottom: 8px;
  }
  .mp-nav-item {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 4px 4px;
    border-radius: 3px;
  }
  .mp-nav-item.active { background: rgba(62,207,142,0.1); }
  .mp-nav-icon {
    width: 8px;
    height: 8px;
    border-radius: 2px;
    background: rgba(255,255,255,0.15);
    flex-shrink: 0;
  }
  .mp-nav-item.active .mp-nav-icon { background: rgba(62,207,142,0.6); }
  .mp-nav-label {
    height: 5px;
    flex: 1;
    background: rgba(255,255,255,0.08);
    border-radius: 2px;
  }
  .mp-nav-item.active .mp-nav-label { background: rgba(255,255,255,0.2); }
  .mp-spacer { flex: 1; }
  .mp-user {
    height: 14px;
    background: rgba(255,255,255,0.06);
    border-radius: 7px;
  }

  .mp-main {
    flex: 1;
    display: flex;
    flex-direction: column;
  }
  .mp-header {
    height: 28px;
    background: rgba(255,255,255,0.02);
    border-bottom: 1px solid rgba(255,255,255,0.05);
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 10px;
    flex-shrink: 0;
  }
  .mp-breadcrumb {
    height: 6px;
    width: 50px;
    background: rgba(255,255,255,0.1);
    border-radius: 2px;
  }
  .mp-actions { display: flex; gap: 4px; }
  .mp-actions div {
    height: 10px;
    width: 18px;
    background: rgba(255,255,255,0.08);
    border-radius: 2px;
  }
  .mp-body {
    flex: 1;
    padding: 10px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  /* ── Feature list ── */
  .option-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }
  .option-list li {
    font-size: 0.78rem;
    display: flex;
    align-items: center;
    gap: 0.4rem;
  }
  .option-list li::before {
    content: '';
    width: 14px;
    height: 14px;
    flex-shrink: 0;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 9px;
  }
  .option-list li.pro { color: #aaa; }
  .option-list li.con { color: #555; }
  .option-list li.pro::before {
    content: '✓';
    background: rgba(62,207,142,0.12);
    color: #3ecf8e;
    font-size: 8px;
    font-weight: 700;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .option-list li.con::before {
    content: '–';
    background: rgba(255,255,255,0.04);
    color: #555;
    font-size: 10px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  /* ── Effort meter ── */
  .option-effort {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-top: auto;
  }
  .effort-label {
    font-size: 0.7rem;
    color: #555;
    white-space: nowrap;
  }
  .effort-bar {
    flex: 1;
    height: 4px;
    background: rgba(255,255,255,0.06);
    border-radius: 9999px;
    overflow: hidden;
  }
  .effort-fill {
    height: 100%;
    background: #3ecf8e;
    border-radius: 9999px;
  }
  .effort-text {
    font-size: 0.7rem;
    color: #666;
    white-space: nowrap;
    min-width: 2rem;
    text-align: right;
  }
</style>

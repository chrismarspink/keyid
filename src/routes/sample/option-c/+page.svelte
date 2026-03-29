<!--
  Option C 미리보기: 현재 레이아웃 구조 유지 + Supabase Studio 팔레트만 교체
  변경 범위: app.css의 CSS variables 값만 수정 (구조 코드 0% 변경)
-->
<script lang="ts">
  import { base } from '$app/paths';

  // Mock data
  const files = [
    { name: 'Q4_재무보고서.pkis-sig', orig: 'Q4_재무보고서.pdf', type: 'signed', signer: '김철수', size: '284 KB', time: '2시간 전', embedded: false },
    { name: '계약서_v2.pkis', orig: '계약서_v2.docx', type: 'encrypted', recipients: 3, size: '1.2 MB', time: '어제' },
    { name: '제안서.pkis-sig', orig: '제안서.pptx', type: 'signed', signer: 'Alice Johnson', size: '8.4 MB', time: '3일 전', embedded: true },
    { name: '예산안.pkis', orig: '예산안.xlsx', type: 'gated', size: '540 KB', time: '1주 전' },
    { name: '내부공지.pkis-sig', orig: '내부공지.pdf', type: 'signed', signer: '박지영', size: '92 KB', time: '2주 전' },
  ];

  const navItems = [
    { label: '홈', active: false, icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6' },
    { label: '신원', active: false, icon: 'M10 6H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V8a2 2 0 00-2-2h-5m-4 0V5a2 2 0 114 0v1m-4 0a2 2 0 104 0m-5 8a2 2 0 100-4 2 2 0 000 4zm0 0c1.306 0 2.417.835 2.83 2M9 14a3.001 3.001 0 00-2.83 2' },
    { label: '연락처', active: false, icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z' },
    { label: '파일', active: true,  icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' },
    { label: '서명', active: false, icon: 'M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z' },
    { label: '암호화', active: false, icon: 'M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z' },
  ];

  let tooltipNav = '';
</script>

<svelte:head><title>Option C 미리보기 — KeyID</title></svelte:head>

<!-- Full-screen preview overlay -->
<div class="preview-root">

  <!-- ── Supabase Studio 팔레트 CSS variables ── -->
  <style>
    .preview-root {
      /* Supabase Studio 팔레트 */
      --bg:         #1c1c1c;
      --bg-sidebar: #181818;
      --bg-panel:   #242424;
      --bg-input:   #1a1a1a;
      --bg-hover:   rgba(255,255,255,0.04);

      --text:       #ededed;
      --text-muted: #9293a0;
      --text-dim:   #4a4a55;

      --border:     rgba(255,255,255,0.07);
      --border-mid: rgba(255,255,255,0.11);

      /* Supabase 브랜드 그린 (기존 --navy 대체) */
      --navy:       #3ecf8e;
      --navy-dark:  #2bb578;
      --navy-light: #3ecf8e;
      --gold:       #f59e0b;
    }
  </style>

  <!-- Back button (always visible) -->
  <a href="{base}/sample" class="back-link">
    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/>
    </svg>
    비교 페이지로
  </a>

  <!-- Label banner -->
  <div class="option-banner">
    <span class="option-tag">Option C</span>
    <span class="option-desc">CSS variables만 교체 · 구조 코드 변경 없음</span>
    <span class="diff-badge">app.css 23줄 수정</span>
  </div>

  <!-- ── 기존 앱 레이아웃 (구조 동일, 팔레트만 교체) ── -->
  <div class="app-shell">

    <!-- Rail sidebar (기존 구조 그대로) -->
    <aside class="rail">
      <div class="rail-logo">
        <div class="logo-mark">K</div>
      </div>
      <nav class="rail-nav">
        {#each navItems as item}
          <!-- svelte-ignore a11y-no-static-element-interactions -->
          <div
            class="rail-item"
            class:rail-active={item.active}
            on:mouseenter={() => tooltipNav = item.label}
            on:mouseleave={() => tooltipNav = ''}
          >
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d={item.icon}/>
            </svg>
            {#if tooltipNav === item.label}
              <div class="rail-tooltip">{item.label}</div>
            {/if}
          </div>
        {/each}
      </nav>
      <div class="rail-footer">
        <div class="rail-item">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8"
              d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/>
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
          </svg>
        </div>
      </div>
    </aside>

    <!-- Main content (기존 구조 그대로) -->
    <div class="main-area">

      <!-- Top bar -->
      <div class="topbar">
        <div class="flex items-center gap-2">
          <span class="topbar-title">파일 목록</span>
          <span class="count-badge">5</span>
        </div>
        <div class="flex gap-2">
          <button class="btn-outline">서명 검증</button>
          <button class="btn-outline">서명</button>
          <button class="btn-green">암호화</button>
        </div>
      </div>

      <!-- Stats + filter -->
      <div class="filter-bar">
        <div class="stats">
          <span class="stat signed">서명 3</span>
          <span class="sep">·</span>
          <span class="stat encrypted">암호화 1</span>
          <span class="sep">·</span>
          <span class="stat gated">승인필요 1</span>
        </div>
        <div class="filters">
          {#each ['전체','서명됨','암호화됨','승인필요'] as f, i}
            <button class="filter-btn" class:active={i === 0}>{f}</button>
          {/each}
        </div>
      </div>

      <!-- File list -->
      <div class="file-list">
        {#each files as f}
          <div class="file-row">
            <input type="checkbox" class="row-check" />
            <div class="row-info">
              <div class="row-name-line">
                <span class="row-name">{f.name}</span>
                {#if f.type === 'signed'}
                  <span class="badge-signed">서명</span>
                {:else if f.type === 'gated'}
                  <span class="badge-gated">승인필요</span>
                {:else}
                  <span class="badge-enc">암호화</span>
                {/if}
                {#if f.embedded}
                  <span class="badge-emb">내장서명</span>
                {/if}
              </div>
              <div class="row-meta">
                <span>{f.orig}</span>
                <span class="sep">·</span>
                <span>{f.time}</span>
                <span class="sep">·</span>
                <span class="mono">{f.size}</span>
                {#if f.signer}
                  <span class="sep">·</span>
                  <span class="signer">{f.signer}</span>
                {/if}
                {#if f.recipients}
                  <span class="sep">·</span>
                  <span>수신자 {f.recipients}명</span>
                {/if}
              </div>
            </div>
            <div class="row-actions">
              {#if f.type === 'signed'}
                <button class="action-btn verify">검증</button>
              {:else if f.type === 'gated'}
                <button class="action-btn gated">복호화</button>
              {:else}
                <button class="action-btn decrypt">복호화</button>
              {/if}
              <button class="action-btn dl">↓</button>
              <button class="action-btn del">✕</button>
            </div>
          </div>
        {/each}
      </div>

    </div>
  </div>
</div>

<style>
  .preview-root {
    position: fixed;
    inset: 0;
    z-index: 9999;
    display: flex;
    flex-direction: column;
    font-family: 'Inter', system-ui, sans-serif;
    background: var(--bg);
    color: var(--text);
  }

  /* Back link */
  .back-link {
    position: absolute;
    top: 10px;
    right: 14px;
    z-index: 10001;
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 0.72rem;
    color: var(--text-muted);
    text-decoration: none;
    padding: 4px 10px;
    border-radius: 6px;
    background: var(--bg-panel);
    border: 1px solid var(--border);
    transition: color 0.15s;
  }
  .back-link:hover { color: var(--text); }
  .back-link svg { width: 12px; height: 12px; }

  /* Label banner */
  .option-banner {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 6px 14px;
    background: rgba(62,207,142,0.06);
    border-bottom: 1px solid rgba(62,207,142,0.15);
    flex-shrink: 0;
  }
  .option-tag {
    font-size: 0.7rem;
    font-weight: 700;
    padding: 2px 8px;
    border-radius: 9999px;
    background: rgba(62,207,142,0.15);
    color: #3ecf8e;
    letter-spacing: 0.04em;
  }
  .option-desc { font-size: 0.75rem; color: var(--text-muted); }
  .diff-badge {
    margin-left: auto;
    font-size: 0.68rem;
    color: #3ecf8e;
    background: rgba(62,207,142,0.08);
    border: 1px solid rgba(62,207,142,0.2);
    padding: 2px 8px;
    border-radius: 4px;
    margin-right: 100px;
  }

  /* ── App shell ── */
  .app-shell {
    flex: 1;
    display: flex;
    overflow: hidden;
  }

  /* Rail (기존 레이아웃과 동일한 구조) */
  .rail {
    width: 56px;
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    background: var(--bg-sidebar);
    border-right: 1px solid var(--border);
  }
  .rail-logo {
    width: 100%;
    height: 52px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-bottom: 1px solid var(--border);
    margin-bottom: 6px;
  }
  .logo-mark {
    width: 28px;
    height: 28px;
    border-radius: 7px;
    background: var(--navy);
    color: #000;
    font-weight: 800;
    font-size: 0.9rem;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .rail-nav {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    padding: 4px 0;
  }
  .rail-footer {
    padding: 10px 0;
    border-top: 1px solid var(--border);
    width: 100%;
    display: flex;
    justify-content: center;
  }
  .rail-item {
    position: relative;
    width: 40px;
    height: 40px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 0 10px 10px 0;
    cursor: pointer;
    color: var(--text-muted);
    border-left: 3px solid transparent;
    transition: background 0.12s, color 0.12s;
    margin-right: 3px;
  }
  .rail-item:hover { background: rgba(255,255,255,0.05); color: var(--text); }
  .rail-active {
    background: rgba(62,207,142,0.1) !important;
    color: #3ecf8e !important;
    border-left-color: #3ecf8e !important;
  }
  .rail-tooltip {
    position: absolute;
    left: 46px;
    top: 50%;
    transform: translateY(-50%);
    background: #111;
    border: 1px solid var(--border-mid);
    color: var(--text);
    padding: 4px 9px;
    border-radius: 6px;
    font-size: 0.72rem;
    white-space: nowrap;
    z-index: 100;
    pointer-events: none;
  }

  /* Main */
  .main-area {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    background: var(--bg);
  }

  .topbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 20px;
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
  }
  .topbar-title { font-size: 1rem; font-weight: 700; color: var(--text); }
  .count-badge {
    font-size: 0.7rem;
    padding: 1px 6px;
    border-radius: 4px;
    background: rgba(255,255,255,0.06);
    color: var(--text-muted);
  }
  .btn-outline {
    padding: 5px 12px;
    border-radius: 6px;
    font-size: 0.75rem;
    font-weight: 500;
    background: transparent;
    border: 1px solid var(--border-mid);
    color: var(--text-muted);
    cursor: pointer;
    transition: all 0.12s;
  }
  .btn-outline:hover { color: var(--text); border-color: rgba(255,255,255,0.2); }
  .btn-green {
    padding: 5px 12px;
    border-radius: 6px;
    font-size: 0.75rem;
    font-weight: 600;
    background: var(--navy);
    border: none;
    color: #000;
    cursor: pointer;
  }

  /* Filter bar */
  .filter-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 20px;
    border-bottom: 1px solid var(--border);
    background: rgba(0,0,0,0.15);
    flex-shrink: 0;
    flex-wrap: wrap;
    gap: 8px;
  }
  .stats { display: flex; align-items: center; gap: 6px; font-size: 0.75rem; }
  .stat.signed { color: #93c5fd; }
  .stat.encrypted { color: #c084fc; }
  .stat.gated { color: #fbbf24; }
  .sep { color: var(--border-mid); }
  .filters { display: flex; gap: 4px; }
  .filter-btn {
    padding: 4px 10px;
    border-radius: 6px;
    font-size: 0.72rem;
    font-weight: 500;
    background: transparent;
    border: 1px solid transparent;
    color: var(--text-muted);
    cursor: pointer;
    transition: all 0.12s;
  }
  .filter-btn.active {
    background: rgba(62,207,142,0.12);
    color: #3ecf8e;
    border-color: rgba(62,207,142,0.3);
  }

  /* File list */
  .file-list { flex: 1; overflow-y: auto; }
  .file-row {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 20px;
    border-bottom: 1px solid var(--border);
    transition: background 0.1s;
  }
  .file-row:hover { background: var(--bg-hover); }
  .row-check { width: 13px; height: 13px; accent-color: #3ecf8e; flex-shrink: 0; }

  .row-info { flex: 1; min-width: 0; }
  .row-name-line { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
  .row-name { font-size: 0.85rem; font-weight: 500; color: var(--text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 280px; }
  .row-meta { font-size: 0.72rem; color: var(--text-muted); display: flex; align-items: center; gap: 5px; flex-wrap: wrap; margin-top: 2px; }
  .mono { font-variant-numeric: tabular-nums; }
  .signer { color: #93c5fd; }

  .badge-signed {
    font-size: 0.68rem; padding: 1px 6px; border-radius: 9999px; font-weight: 600;
    background: rgba(59,130,246,0.15); color: #60a5fa; border: 1px solid rgba(59,130,246,0.25);
  }
  .badge-enc {
    font-size: 0.68rem; padding: 1px 6px; border-radius: 9999px; font-weight: 600;
    background: rgba(168,85,247,0.15); color: #c084fc; border: 1px solid rgba(168,85,247,0.25);
  }
  .badge-gated {
    font-size: 0.68rem; padding: 1px 6px; border-radius: 9999px; font-weight: 600;
    background: rgba(245,158,11,0.15); color: #fbbf24; border: 1px solid rgba(245,158,11,0.25);
  }
  .badge-emb {
    font-size: 0.68rem; padding: 1px 6px; border-radius: 9999px; font-weight: 600;
    background: rgba(139,92,246,0.15); color: #a78bfa; border: 1px solid rgba(139,92,246,0.25);
  }

  .row-actions { display: flex; gap: 4px; flex-shrink: 0; }
  .action-btn {
    padding: 4px 10px; border-radius: 6px; font-size: 0.7rem; font-weight: 500;
    border: 1px solid var(--border-mid); background: transparent; color: var(--text-muted); cursor: pointer;
    transition: all 0.12s;
  }
  .action-btn.verify { background: rgba(59,130,246,0.1); color: #60a5fa; border-color: rgba(59,130,246,0.25); }
  .action-btn.decrypt { background: rgba(168,85,247,0.1); color: #c084fc; border-color: rgba(168,85,247,0.25); }
  .action-btn.gated { background: rgba(245,158,11,0.1); color: #fbbf24; border-color: rgba(245,158,11,0.25); }
  .action-btn:hover { border-color: rgba(255,255,255,0.2); }
</style>

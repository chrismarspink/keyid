<!--
  Option B 미리보기: shadcn sidebar-07 레이아웃 + Supabase Studio 팔레트
  - SidebarProvider / Sidebar / SidebarHeader / SidebarContent / SidebarFooter
  - SidebarMenu / SidebarMenuButton (icon + text)
  - SidebarInset: Header(Breadcrumb + actions) + main content
  - Collapsible sidebar (icon-only mode)
-->
<script lang="ts">
  import { base } from '$app/paths';

  // Sidebar open/collapsed state
  let sidebarOpen = true;

  const navMain = [
    { label: '홈',    icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6', active: false },
    { label: '신원',  icon: 'M10 6H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V8a2 2 0 00-2-2h-5m-4 0V5a2 2 0 114 0v1m-4 0a2 2 0 104 0m-5 8a2 2 0 100-4 2 2 0 000 4zm0 0c1.306 0 2.417.835 2.83 2M9 14a3.001 3.001 0 00-2.83 2', active: false },
    { label: '연락처',icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z', active: false },
    { label: '파일 목록', icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z', active: true },
  ];

  const navFiles = [
    { label: '서명',   icon: 'M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z', active: false },
    { label: '암호화', icon: 'M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z', active: false },
    { label: '검증',   icon: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z', active: false },
    { label: '서명 요청', icon: 'M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122', active: false },
  ];

  const files = [
    { name: 'Q4_재무보고서.pkis-sig', orig: 'Q4_재무보고서.pdf', type: 'signed', signer: '김철수', size: '284 KB', time: '2시간 전', embedded: false },
    { name: '계약서_v2.pkis', orig: '계약서_v2.docx', type: 'encrypted', recipients: 3, size: '1.2 MB', time: '어제' },
    { name: '제안서.pkis-sig', orig: '제안서.pptx', type: 'signed', signer: 'Alice Johnson', size: '8.4 MB', time: '3일 전', embedded: true },
    { name: '예산안.pkis', orig: '예산안.xlsx', type: 'gated', size: '540 KB', time: '1주 전' },
    { name: '내부공지.pkis-sig', orig: '내부공지.pdf', type: 'signed', signer: '박지영', size: '92 KB', time: '2주 전' },
  ];
</script>

<svelte:head><title>Option B 미리보기 — KeyID</title></svelte:head>

<div class="preview-root">

  <!-- Back + label -->
  <a href="{base}/sample" class="back-link">
    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/>
    </svg>
    비교 페이지로
  </a>

  <div class="option-banner">
    <span class="option-tag">Option B</span>
    <span class="option-desc">shadcn sidebar-07 · Supabase Studio 룩앤필</span>
    <button class="toggle-btn" on:click={() => sidebarOpen = !sidebarOpen}>
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
          d={sidebarOpen
            ? 'M4 6h16M4 12h8M4 18h16'
            : 'M4 6h16M4 12h16M4 18h16'}/>
      </svg>
      {sidebarOpen ? '사이드바 닫기' : '사이드바 열기'}
    </button>
  </div>

  <!-- ── SidebarProvider ── -->
  <div class="sidebar-provider">

    <!-- ── Sidebar ── -->
    <aside class="sidebar" class:collapsed={!sidebarOpen}>
      <!-- SidebarHeader -->
      <div class="sidebar-header">
        <div class="project-switcher">
          <div class="project-icon">K</div>
          {#if sidebarOpen}
            <div class="project-info">
              <span class="project-name">KeyID</span>
              <span class="project-sub">개인 PKI</span>
            </div>
            <svg class="chevron-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 9l4-4 4 4m0 6l-4 4-4-4"/>
            </svg>
          {/if}
        </div>
      </div>

      <!-- SidebarContent -->
      <div class="sidebar-content">
        <!-- SidebarGroup: 메인 -->
        <div class="sidebar-group">
          {#if sidebarOpen}
            <div class="sidebar-group-label">메뉴</div>
          {/if}
          <ul class="sidebar-menu">
            {#each navMain as item}
              <li>
                <button class="sidebar-menu-btn" class:active={item.active} title={!sidebarOpen ? item.label : ''}>
                  <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d={item.icon}/>
                  </svg>
                  {#if sidebarOpen}
                    <span>{item.label}</span>
                  {/if}
                </button>
              </li>
            {/each}
          </ul>
        </div>

        <!-- SidebarSeparator -->
        <div class="sidebar-separator"></div>

        <!-- SidebarGroup: 파일 작업 -->
        <div class="sidebar-group">
          {#if sidebarOpen}
            <div class="sidebar-group-label">파일 작업</div>
          {/if}
          <ul class="sidebar-menu">
            {#each navFiles as item}
              <li>
                <button class="sidebar-menu-btn" class:active={item.active} title={!sidebarOpen ? item.label : ''}>
                  <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d={item.icon}/>
                  </svg>
                  {#if sidebarOpen}
                    <span>{item.label}</span>
                  {/if}
                </button>
              </li>
            {/each}
          </ul>
        </div>
      </div>

      <!-- SidebarFooter -->
      <div class="sidebar-footer">
        <div class="sidebar-separator"></div>
        <button class="user-menu-btn" title={!sidebarOpen ? '계정 설정' : ''}>
          <div class="user-avatar">김</div>
          {#if sidebarOpen}
            <div class="user-info">
              <span class="user-name">김철수</span>
              <span class="user-email">cs.kim@keyid.dev</span>
            </div>
            <svg class="chevron-icon small" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 9l4-4 4 4"/>
            </svg>
          {/if}
        </button>
      </div>
    </aside>

    <!-- ── SidebarInset (main content) ── -->
    <div class="sidebar-inset">

      <!-- Header: Breadcrumb + actions -->
      <header class="inset-header">
        <div class="breadcrumb">
          <button class="sidebar-trigger" on:click={() => sidebarOpen = !sidebarOpen}>
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h8M4 18h16"/>
            </svg>
          </button>
          <div class="breadcrumb-sep"></div>
          <ol class="breadcrumb-list">
            <li class="breadcrumb-item muted">KeyID</li>
            <li class="breadcrumb-sep-char">/</li>
            <li class="breadcrumb-item current">파일 목록</li>
          </ol>
        </div>
        <div class="header-actions">
          <button class="hdr-btn outline">
            <svg class="btn-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
            </svg>
            서명 검증
          </button>
          <button class="hdr-btn green">
            <svg class="btn-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/>
            </svg>
            새 암호화
          </button>
        </div>
      </header>

      <!-- Page content -->
      <main class="inset-main">
        <!-- Stats row -->
        <div class="stats-row">
          <div class="stat-card">
            <span class="stat-value">3</span>
            <span class="stat-label">서명 파일</span>
          </div>
          <div class="stat-card">
            <span class="stat-value">1</span>
            <span class="stat-label">암호화 파일</span>
          </div>
          <div class="stat-card warn">
            <span class="stat-value">1</span>
            <span class="stat-label">승인 필요</span>
          </div>
        </div>

        <!-- Filter tabs -->
        <div class="tab-bar">
          {#each ['전체', '서명됨', '암호화됨', '승인필요'] as t, i}
            <button class="tab-btn" class:active={i === 0}>{t}</button>
          {/each}
          <div class="tab-spacer"></div>
          <!-- Search -->
          <div class="search-wrap">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0"/>
            </svg>
            <input placeholder="파일명 검색…" />
          </div>
        </div>

        <!-- Table header -->
        <div class="table-head">
          <div class="th-check"><input type="checkbox" /></div>
          <div class="th-name">파일명</div>
          <div class="th-type">유형</div>
          <div class="th-signer">서명자/수신자</div>
          <div class="th-size">크기</div>
          <div class="th-date">날짜</div>
          <div class="th-actions"></div>
        </div>

        <!-- Table rows -->
        <div class="table-body">
          {#each files as f}
            <div class="table-row">
              <div class="td-check"><input type="checkbox" /></div>
              <div class="td-name">
                <div class="file-name-stack">
                  <span class="file-name">{f.name}</span>
                  <span class="file-orig">{f.orig}</span>
                </div>
              </div>
              <div class="td-type">
                {#if f.type === 'signed'}
                  <span class="badge-signed">서명{#if f.embedded} · 내장{/if}</span>
                {:else if f.type === 'gated'}
                  <span class="badge-gated">승인필요</span>
                {:else}
                  <span class="badge-enc">암호화</span>
                {/if}
              </div>
              <div class="td-signer">
                {#if f.signer}
                  <span class="signer-name">{f.signer}</span>
                {:else if f.recipients}
                  <span class="recip-count">{f.recipients}명</span>
                {:else}
                  <span class="text-dim">—</span>
                {/if}
              </div>
              <div class="td-size">{f.size}</div>
              <div class="td-date">{f.time}</div>
              <div class="td-actions">
                {#if f.type === 'signed'}
                  <button class="act-btn verify">검증</button>
                {:else if f.type === 'gated'}
                  <button class="act-btn gated">승인 요청</button>
                {:else}
                  <button class="act-btn decrypt">복호화</button>
                {/if}
                <button class="act-icon">
                  <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z"/>
                  </svg>
                </button>
              </div>
            </div>
          {/each}
        </div>
      </main>
    </div>
  </div>
</div>

<style>
  /* ── CSS Variables: Supabase Studio 팔레트 ── */
  .preview-root {
    --sb-bg:          #1c1c1c;
    --sb-sidebar:     #181818;
    --sb-panel:       #242424;
    --sb-hover:       rgba(255,255,255,0.04);
    --sb-border:      rgba(255,255,255,0.07);
    --sb-border-mid:  rgba(255,255,255,0.11);
    --sb-text:        #ededed;
    --sb-muted:       #9293a0;
    --sb-dim:         #4a4a55;
    --sb-green:       #3ecf8e;
    --sb-green-dim:   rgba(62,207,142,0.1);
    --sb-green-b:     rgba(62,207,142,0.2);
    --sb-sidebar-w:   224px;
    --sb-sidebar-c:   52px;

    position: fixed;
    inset: 0;
    z-index: 9999;
    display: flex;
    flex-direction: column;
    font-family: 'Inter', system-ui, sans-serif;
    background: var(--sb-bg);
    color: var(--sb-text);
  }

  /* ── Back link ── */
  .back-link {
    position: absolute;
    top: 10px;
    right: 14px;
    z-index: 10001;
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 0.72rem;
    color: var(--sb-muted);
    text-decoration: none;
    padding: 4px 10px;
    border-radius: 6px;
    background: var(--sb-panel);
    border: 1px solid var(--sb-border);
    transition: color 0.15s;
  }
  .back-link:hover { color: var(--sb-text); }
  .back-link svg { width: 12px; height: 12px; }

  /* ── Banner ── */
  .option-banner {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 6px 14px;
    background: rgba(62,207,142,0.05);
    border-bottom: 1px solid var(--sb-green-b);
    flex-shrink: 0;
  }
  .option-tag {
    font-size: 0.7rem;
    font-weight: 700;
    padding: 2px 8px;
    border-radius: 9999px;
    background: var(--sb-green-dim);
    color: var(--sb-green);
    border: 1px solid var(--sb-green-b);
  }
  .option-desc { font-size: 0.75rem; color: var(--sb-muted); }
  .toggle-btn {
    margin-left: auto;
    display: flex;
    align-items: center;
    gap: 5px;
    font-size: 0.72rem;
    color: var(--sb-muted);
    background: var(--sb-panel);
    border: 1px solid var(--sb-border-mid);
    padding: 4px 10px;
    border-radius: 6px;
    cursor: pointer;
    margin-right: 110px;
    transition: color 0.12s;
  }
  .toggle-btn:hover { color: var(--sb-text); }
  .toggle-btn svg { width: 14px; height: 14px; }

  /* ── SidebarProvider ── */
  .sidebar-provider {
    flex: 1;
    display: flex;
    overflow: hidden;
  }

  /* ── Sidebar ── */
  .sidebar {
    width: var(--sb-sidebar-w);
    flex-shrink: 0;
    background: var(--sb-sidebar);
    border-right: 1px solid var(--sb-border);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    transition: width 0.2s cubic-bezier(0.4,0,0.2,1);
  }
  .sidebar.collapsed { width: var(--sb-sidebar-c); }

  /* SidebarHeader */
  .sidebar-header {
    padding: 12px 10px;
    border-bottom: 1px solid var(--sb-border);
    flex-shrink: 0;
  }
  .project-switcher {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 8px;
    border-radius: 8px;
    cursor: pointer;
    transition: background 0.12s;
  }
  .project-switcher:hover { background: var(--sb-hover); }
  .project-icon {
    width: 28px;
    height: 28px;
    border-radius: 7px;
    background: var(--sb-green);
    color: #000;
    font-weight: 800;
    font-size: 0.85rem;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }
  .project-info {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
  }
  .project-name { font-size: 0.85rem; font-weight: 600; color: var(--sb-text); }
  .project-sub { font-size: 0.68rem; color: var(--sb-muted); }
  .chevron-icon { width: 14px; height: 14px; color: var(--sb-dim); flex-shrink: 0; }
  .chevron-icon.small { width: 12px; height: 12px; }

  /* SidebarContent */
  .sidebar-content {
    flex: 1;
    overflow-y: auto;
    padding: 8px 0;
    scrollbar-width: none;
  }
  .sidebar-content::-webkit-scrollbar { display: none; }

  .sidebar-group { padding: 4px 0; }
  .sidebar-group-label {
    font-size: 0.65rem;
    font-weight: 600;
    letter-spacing: 0.07em;
    text-transform: uppercase;
    color: var(--sb-dim);
    padding: 0 16px 4px;
    margin-top: 4px;
  }

  .sidebar-menu { list-style: none; margin: 0; padding: 0 8px; display: flex; flex-direction: column; gap: 1px; }
  .sidebar-menu-btn {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 7px 8px;
    border-radius: 7px;
    border: none;
    background: transparent;
    color: var(--sb-muted);
    font-size: 0.83rem;
    cursor: pointer;
    transition: background 0.1s, color 0.1s;
    text-align: left;
    white-space: nowrap;
  }
  .sidebar-menu-btn svg { width: 16px; height: 16px; flex-shrink: 0; }
  .sidebar-menu-btn:hover { background: var(--sb-hover); color: var(--sb-text); }
  .sidebar-menu-btn.active {
    background: rgba(255,255,255,0.06);
    color: var(--sb-text);
    font-weight: 500;
  }
  .sidebar-menu-btn.active svg { color: var(--sb-green); }

  .sidebar-separator {
    height: 1px;
    background: var(--sb-border);
    margin: 6px 10px;
  }

  /* SidebarFooter */
  .sidebar-footer { padding: 8px; flex-shrink: 0; }
  .user-menu-btn {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 7px 8px;
    border-radius: 7px;
    border: none;
    background: transparent;
    cursor: pointer;
    transition: background 0.12s;
    text-align: left;
  }
  .user-menu-btn:hover { background: var(--sb-hover); }
  .user-avatar {
    width: 28px;
    height: 28px;
    border-radius: 9999px;
    background: rgba(62,207,142,0.2);
    color: var(--sb-green);
    font-size: 0.75rem;
    font-weight: 700;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }
  .user-info { flex: 1; min-width: 0; display: flex; flex-direction: column; }
  .user-name { font-size: 0.8rem; font-weight: 500; color: var(--sb-text); }
  .user-email { font-size: 0.68rem; color: var(--sb-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

  /* ── SidebarInset ── */
  .sidebar-inset {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    background: var(--sb-bg);
  }

  /* Header bar */
  .inset-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 16px;
    height: 48px;
    border-bottom: 1px solid var(--sb-border);
    flex-shrink: 0;
    background: var(--sb-sidebar);
  }

  .breadcrumb { display: flex; align-items: center; gap: 8px; }
  .sidebar-trigger {
    width: 28px;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 6px;
    border: none;
    background: transparent;
    color: var(--sb-muted);
    cursor: pointer;
    transition: background 0.12s, color 0.12s;
  }
  .sidebar-trigger:hover { background: var(--sb-hover); color: var(--sb-text); }
  .sidebar-trigger svg { width: 16px; height: 16px; }
  .breadcrumb-sep { width: 1px; height: 16px; background: var(--sb-border-mid); margin: 0 2px; }
  .breadcrumb-list { list-style: none; margin: 0; padding: 0; display: flex; align-items: center; gap: 6px; }
  .breadcrumb-item { font-size: 0.8rem; }
  .breadcrumb-item.muted { color: var(--sb-muted); }
  .breadcrumb-item.current { color: var(--sb-text); font-weight: 500; }
  .breadcrumb-sep-char { color: var(--sb-dim); font-size: 0.75rem; }

  .header-actions { display: flex; gap: 6px; }
  .hdr-btn {
    display: flex;
    align-items: center;
    gap: 5px;
    padding: 5px 12px;
    border-radius: 6px;
    font-size: 0.75rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.12s;
  }
  .hdr-btn.outline {
    background: transparent;
    border: 1px solid var(--sb-border-mid);
    color: var(--sb-muted);
  }
  .hdr-btn.outline:hover { border-color: rgba(255,255,255,0.2); color: var(--sb-text); }
  .hdr-btn.green {
    background: var(--sb-green);
    border: none;
    color: #000;
    font-weight: 600;
  }
  .hdr-btn.green:hover { background: #2bb578; }
  .btn-icon { width: 13px; height: 13px; flex-shrink: 0; }

  /* ── Main content ── */
  .inset-main {
    flex: 1;
    overflow-y: auto;
    padding: 20px;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  /* Stats row */
  .stats-row { display: flex; gap: 12px; }
  .stat-card {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 12px 16px;
    border-radius: 8px;
    background: var(--sb-panel);
    border: 1px solid var(--sb-border);
  }
  .stat-card.warn { border-color: rgba(245,158,11,0.2); }
  .stat-value { font-size: 1.5rem; font-weight: 700; color: var(--sb-text); line-height: 1; }
  .stat-card.warn .stat-value { color: #fbbf24; }
  .stat-label { font-size: 0.72rem; color: var(--sb-muted); }

  /* Tabs */
  .tab-bar {
    display: flex;
    align-items: center;
    gap: 2px;
    border-bottom: 1px solid var(--sb-border);
    padding-bottom: 0;
  }
  .tab-btn {
    padding: 6px 14px;
    font-size: 0.78rem;
    font-weight: 500;
    color: var(--sb-muted);
    background: transparent;
    border: none;
    border-bottom: 2px solid transparent;
    cursor: pointer;
    transition: color 0.12s;
    margin-bottom: -1px;
  }
  .tab-btn.active { color: var(--sb-text); border-bottom-color: var(--sb-green); }
  .tab-btn:hover:not(.active) { color: var(--sb-text); }
  .tab-spacer { flex: 1; }
  .search-wrap {
    display: flex;
    align-items: center;
    gap: 6px;
    background: var(--sb-panel);
    border: 1px solid var(--sb-border);
    border-radius: 6px;
    padding: 4px 10px;
    margin-bottom: 4px;
  }
  .search-wrap svg { width: 13px; height: 13px; color: var(--sb-dim); flex-shrink: 0; }
  .search-wrap input {
    background: none;
    border: none;
    outline: none;
    font-size: 0.75rem;
    color: var(--sb-text);
    width: 160px;
  }
  .search-wrap input::placeholder { color: var(--sb-dim); }

  /* Table */
  .table-head {
    display: grid;
    grid-template-columns: 24px 1fr 90px 100px 70px 80px 120px;
    gap: 12px;
    padding: 8px 12px;
    font-size: 0.68rem;
    font-weight: 600;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    color: var(--sb-dim);
    border-bottom: 1px solid var(--sb-border);
  }
  .table-body { display: flex; flex-direction: column; }
  .table-row {
    display: grid;
    grid-template-columns: 24px 1fr 90px 100px 70px 80px 120px;
    gap: 12px;
    align-items: center;
    padding: 10px 12px;
    border-bottom: 1px solid var(--sb-border);
    transition: background 0.1s;
  }
  .table-row:hover { background: var(--sb-hover); }
  .table-row input[type="checkbox"] { accent-color: var(--sb-green); }

  .file-name-stack { display: flex; flex-direction: column; min-width: 0; }
  .file-name { font-size: 0.82rem; font-weight: 500; color: var(--sb-text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .file-orig { font-size: 0.68rem; color: var(--sb-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

  .badge-signed {
    font-size: 0.65rem; padding: 2px 7px; border-radius: 9999px; font-weight: 600;
    background: rgba(59,130,246,0.12); color: #60a5fa; border: 1px solid rgba(59,130,246,0.22);
    white-space: nowrap;
  }
  .badge-enc {
    font-size: 0.65rem; padding: 2px 7px; border-radius: 9999px; font-weight: 600;
    background: rgba(168,85,247,0.12); color: #c084fc; border: 1px solid rgba(168,85,247,0.22);
  }
  .badge-gated {
    font-size: 0.65rem; padding: 2px 7px; border-radius: 9999px; font-weight: 600;
    background: rgba(245,158,11,0.12); color: #fbbf24; border: 1px solid rgba(245,158,11,0.22);
  }

  .td-type, .td-signer, .td-size, .td-date { font-size: 0.78rem; color: var(--sb-muted); }
  .signer-name { color: #93c5fd; font-size: 0.78rem; }
  .recip-count { font-size: 0.78rem; }
  .text-dim { color: var(--sb-dim); }

  .td-actions { display: flex; gap: 4px; align-items: center; }
  .act-btn {
    padding: 3px 9px;
    border-radius: 5px;
    font-size: 0.68rem;
    font-weight: 500;
    cursor: pointer;
    border: 1px solid transparent;
    transition: all 0.1s;
  }
  .act-btn.verify { background: rgba(59,130,246,0.1); color: #60a5fa; border-color: rgba(59,130,246,0.22); }
  .act-btn.decrypt { background: rgba(168,85,247,0.1); color: #c084fc; border-color: rgba(168,85,247,0.22); }
  .act-btn.gated { background: rgba(245,158,11,0.1); color: #fbbf24; border-color: rgba(245,158,11,0.22); }

  .act-icon {
    width: 24px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 5px;
    border: 1px solid var(--sb-border);
    background: transparent;
    color: var(--sb-muted);
    cursor: pointer;
    transition: all 0.1s;
  }
  .act-icon:hover { background: var(--sb-hover); color: var(--sb-text); }
  .act-icon svg { width: 13px; height: 13px; }
</style>

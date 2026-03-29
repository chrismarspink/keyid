<script lang="ts">
  import '../app.css';
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { base } from '$app/paths';
  import { onMount } from 'svelte';
  import { registerLaunchQueueHandler, storeLaunchedFile } from '$lib/fileHandler';
  import InstallBanner from '$components/InstallBanner.svelte';
  import SplashScreen from '$components/SplashScreen.svelte';

  let splashDone = false;
  let sidebarOpen = true;

  type NavItem = { label: string; href: string; icon: string };

  const navMain: NavItem[] = [
    { label: '홈',       href: '/',         icon: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"/>` },
    { label: '신원',     href: '/identity', icon: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M10 6H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V8a2 2 0 00-2-2h-5m-4 0V5a2 2 0 114 0v1m-4 0a2 2 0 104 0m-5 8a2 2 0 100-4 2 2 0 000 4zm0 0c1.306 0 2.417.835 2.83 2M9 14a3.001 3.001 0 00-2.83 2"/>` },
    { label: '연락처',   href: '/contacts', icon: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/>` },
    { label: '파일 목록', href: '/files',   icon: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>` },
  ];

  const navFiles: NavItem[] = [
    { label: '서명',      href: '/file/sign',    icon: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/>` },
    { label: '암호화',    href: '/file/encrypt', icon: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/>` },
    { label: '검증',      href: '/file/verify',  icon: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>` },
    { label: '서명 요청', href: '/request',      icon: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5"/>` },
  ];

  const navFooter: NavItem[] = [
    { label: '설치', href: '/install',  icon: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>` },
    { label: '설정', href: '/settings', icon: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>` },
  ];

  // Mobile bottom nav — 8 items matching original
  const navBottom: NavItem[] = [
    ...navMain,
    navFiles[0], // 서명
    navFiles[1], // 암호화
    ...navFooter,
  ];

  const routeLabels: Record<string, string> = {
    '/':             '홈',
    '/identity':     '신원',
    '/contacts':     '연락처',
    '/files':        '파일 목록',
    '/file/sign':    '서명',
    '/file/encrypt': '암호화',
    '/file/verify':  '검증',
    '/file/view':    '파일 보기',
    '/request':      '서명 요청',
    '/install':      '설치',
    '/settings':     '설정',
  };

  $: currentPath = $page.url.pathname;

  $: pageLabel = (() => {
    const path = base ? currentPath.slice(base.length) : currentPath;
    return routeLabels[path || '/'] ?? '페이지';
  })();

  function isActive(href: string): boolean {
    const fullHref = base + href;
    if (href === '/') return currentPath === base + '/' || currentPath === base;
    return currentPath === fullHref || currentPath.startsWith(fullHref + '/') || currentPath.startsWith(fullHref);
  }

  function toggleSidebar() {
    sidebarOpen = !sidebarOpen;
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('sb-open', sidebarOpen ? '1' : '0');
    }
  }

  onMount(() => {
    registerLaunchQueueHandler(async ({ file, route }) => {
      await storeLaunchedFile(file);
      goto(base + route);
    });
    const saved = localStorage.getItem('sb-open');
    if (saved !== null) sidebarOpen = saved === '1';
  });
</script>

<!-- WCO Titlebar drag region -->
<div class="wco-titlebar app-drag-region">
  <img src="{base}/icons/icon-192.png" alt="KeyID" class="wco-icon" />
  <span class="wco-title">KeyID</span>
</div>

<!-- ═══════════════════════════════════════════════════
     DESKTOP: Sidebar-07 layout
═══════════════════════════════════════════════════ -->
<div class="app-layout hidden md:flex">

  <!-- Sidebar -->
  <aside class="app-sidebar" class:collapsed={!sidebarOpen}>

    <!-- Header: project switcher -->
    <div class="sb-header">
      <div class="project-switcher">
        <div class="project-icon">K</div>
        {#if sidebarOpen}
          <div class="project-info">
            <span class="project-name">KeyID</span>
            <span class="project-sub">개인 PKI</span>
          </div>
        {/if}
      </div>
    </div>

    <!-- Content: nav groups -->
    <div class="sb-content">

      <div class="sb-group">
        {#if sidebarOpen}<div class="sb-group-label">메뉴</div>{/if}
        <ul class="sb-menu">
          {#each navMain as item}
            {@const active = isActive(item.href)}
            <li>
              <a href="{base}{item.href}" class="sb-btn" class:active title={!sidebarOpen ? item.label : ''}>
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">{@html item.icon}</svg>
                {#if sidebarOpen}<span>{item.label}</span>{/if}
              </a>
            </li>
          {/each}
        </ul>
      </div>

      <div class="sb-sep"></div>

      <div class="sb-group">
        {#if sidebarOpen}<div class="sb-group-label">파일 작업</div>{/if}
        <ul class="sb-menu">
          {#each navFiles as item}
            {@const active = isActive(item.href)}
            <li>
              <a href="{base}{item.href}" class="sb-btn" class:active title={!sidebarOpen ? item.label : ''}>
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">{@html item.icon}</svg>
                {#if sidebarOpen}<span>{item.label}</span>{/if}
              </a>
            </li>
          {/each}
        </ul>
      </div>

    </div>

    <!-- Footer: settings + install -->
    <div class="sb-footer">
      <div class="sb-sep"></div>
      {#each navFooter as item}
        {@const active = isActive(item.href)}
        <a href="{base}{item.href}" class="sb-btn" class:active title={!sidebarOpen ? item.label : ''}>
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">{@html item.icon}</svg>
          {#if sidebarOpen}<span>{item.label}</span>{/if}
        </a>
      {/each}
    </div>

  </aside>

  <!-- Inset: header + content -->
  <div class="app-inset">

    <!-- Header bar: sidebar toggle + breadcrumb -->
    <header class="app-header">
      <div class="header-left">
        <button class="sb-toggle" on:click={toggleSidebar} aria-label="사이드바 토글">
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d={sidebarOpen ? 'M4 6h16M4 12h8M4 18h16' : 'M4 6h16M4 12h16M4 18h16'}/>
          </svg>
        </button>
        <div class="header-div"></div>
        <ol class="breadcrumb-list">
          <li class="bc-root">KeyID</li>
          <li class="bc-sep">/</li>
          <li class="bc-current">{pageLabel}</li>
        </ol>
      </div>
    </header>

    <!-- Page content -->
    <main class="inset-main">
      <slot />
    </main>

  </div>
</div>

<!-- ═══════════════════════════════════════════════════
     MOBILE: Full screen + bottom tab bar
═══════════════════════════════════════════════════ -->
<div class="mobile-shell md:hidden">
  <main class="mobile-main">
    <slot />
  </main>

  <nav class="bottom-nav">
    {#each navBottom as item}
      {@const active = isActive(item.href)}
      <a href="{base}{item.href}" class="nav-item" class:active>
        {#if active}<span class="nav-pip"></span>{/if}
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"
          style={active ? 'stroke:#3ecf8e' : ''}>{@html item.icon}</svg>
        <span class="text-xs">{item.label}</span>
      </a>
    {/each}
  </nav>
</div>

<InstallBanner />
<SplashScreen on:done={() => (splashDone = true)} />

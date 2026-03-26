<script lang="ts">
  import '../app.css';
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { base } from '$app/paths';
  import { onMount } from 'svelte';
  import { registerLaunchQueueHandler, storeLaunchedFile } from '$lib/fileHandler';
  import InstallBanner from '$components/InstallBanner.svelte';

  type NavItem = { label: string; href: string; icon: string };

  const navItems: NavItem[] = [
    {
      label: '홈',
      href: '/',
      icon: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8"
        d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"/>`
    },
    {
      label: '신원',
      href: '/identity',
      icon: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8"
        d="M10 6H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V8a2 2 0 00-2-2h-5m-4 0V5a2 2 0 114 0v1m-4 0a2 2 0 104 0m-5 8a2 2 0 100-4 2 2 0 000 4zm0 0c1.306 0 2.417.835 2.83 2M9 14a3.001 3.001 0 00-2.83 2"/>`
    },
    {
      label: '연락처',
      href: '/contacts',
      icon: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8"
        d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/>`
    },
    {
      label: '파일',
      href: '/files',
      icon: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8"
        d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>`
    },
    {
      label: '서명',
      href: '/file/sign',
      icon: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8"
        d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/>`
    },
    {
      label: '암호화',
      href: '/file/encrypt',
      icon: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8"
        d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/>`
    },
    {
      label: '설치',
      href: '/install',
      icon: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8"
        d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>`
    },
    {
      label: '설정',
      href: '/settings',
      icon: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8"
        d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>`
    }
  ];

  $: currentPath = $page.url.pathname;

  function isActive(href: string) {
    const fullHref = base + href;
    if (href === '/') return currentPath === base + '/' || currentPath === base;
    return currentPath === fullHref || currentPath.startsWith(fullHref + '/') || currentPath.startsWith(fullHref);
  }

  onMount(() => {
    registerLaunchQueueHandler(async ({ file, route }) => {
      await storeLaunchedFile(file);
      goto(base + route);
    });
  });
</script>

<!-- ═══════════════════════════════════════════════════════════
     DESKTOP LAYOUT — Native app shell (hidden on mobile)
════════════════════════════════════════════════════════════ -->
<div class="app-shell hidden md:flex">

  <!-- WCO Titlebar drag region — fills OS title bar area -->
  <div class="wco-titlebar app-drag-region">
    <img src="/icons/icon-192.png" alt="KeyID" class="wco-icon" />
    <span class="wco-title">KeyID</span>
  </div>

  <!-- Icon rail sidebar -->
  <aside class="rail">
    <!-- Logo slot at top (aligns with WCO titlebar height) -->
    <div class="rail-logo">
      <img src="/icons/icon-192.png" alt="K" class="w-7 h-7 rounded-lg" />
    </div>

    <!-- Nav icons -->
    <nav class="rail-nav">
      {#each navItems as item}
        {@const active = isActive(item.href)}
        <a href="{base}{item.href}" class="rail-item" class:rail-active={active} aria-label={item.label}>
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            {@html item.icon}
          </svg>
          <!-- Tooltip -->
          <span class="rail-tooltip">{item.label}</span>
        </a>
      {/each}
    </nav>

    <!-- Footer status -->
    <div class="rail-footer">
      <div class="rail-item" title="v0.1.0" aria-label="버전 정보">
        <div class="w-2 h-2 rounded-full bg-green-500"></div>
        <span class="rail-tooltip">v0.1.0</span>
      </div>
    </div>
  </aside>

  <!-- Main content — scrollable, fills remaining space -->
  <main class="app-main">
    <slot />
  </main>
</div>

<!-- ═══════════════════════════════════════════════════════════
     MOBILE LAYOUT — Full screen with bottom tab bar
════════════════════════════════════════════════════════════ -->
<div class="mobile-shell md:hidden">
  <main class="mobile-main">
    <slot />
  </main>

  <nav class="bottom-nav">
    {#each navItems as item}
      {@const active = isActive(item.href)}
      <a href="{base}{item.href}" class="nav-item" class:active>
        {#if active}
          <span class="nav-pip"></span>
        {/if}
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"
          style={active ? 'stroke:#3b82f6' : ''}>
          {@html item.icon}
        </svg>
        <span class="text-xs">{item.label}</span>
      </a>
    {/each}
  </nav>
</div>

<InstallBanner />

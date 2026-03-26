<script lang="ts">
  import { onMount } from 'svelte';

  let deferredPrompt: BeforeInstallPromptEvent | null = null;
  let showBanner = false;
  let isIOS = false;
  let isStandalone = false;

  // BeforeInstallPromptEvent is not in standard TS lib
  interface BeforeInstallPromptEvent extends Event {
    prompt(): Promise<void>;
    userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
  }

  onMount(() => {
    // Already installed?
    isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true;

    if (isStandalone) return;

    isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);

    if (isIOS) {
      // iOS doesn't fire beforeinstallprompt — show manual guide
      const dismissed = sessionStorage.getItem('pwa-banner-dismissed');
      if (!dismissed) showBanner = true;
      return;
    }

    // Android / Desktop Chrome
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      deferredPrompt = e as BeforeInstallPromptEvent;
      const dismissed = sessionStorage.getItem('pwa-banner-dismissed');
      if (!dismissed) showBanner = true;
    });

    // Hide banner if app gets installed
    window.addEventListener('appinstalled', () => {
      showBanner = false;
      deferredPrompt = null;
    });
  });

  async function install() {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') showBanner = false;
    deferredPrompt = null;
  }

  function dismiss() {
    showBanner = false;
    sessionStorage.setItem('pwa-banner-dismissed', '1');
  }
</script>

{#if showBanner}
  <div class="fixed bottom-20 md:bottom-4 left-4 right-4 md:left-auto md:right-4 md:w-80 z-50
    rounded-2xl p-4 flex items-start gap-3 shadow-2xl"
    style="background:var(--bg-panel); border:1px solid var(--border-mid)">

    <img src="/icons/icon-192.png" alt="KeyID" class="w-12 h-12 rounded-xl flex-shrink-0" />

    <div class="flex-1 min-w-0">
      <div class="font-semibold text-sm mb-0.5" style="color:var(--text)">앱으로 설치</div>
      {#if isIOS}
        <p class="text-xs leading-relaxed" style="color:var(--text-muted)">
          Safari 하단 <strong style="color:var(--text)">공유 버튼</strong> →
          <strong style="color:var(--text)">홈 화면에 추가</strong>를 탭하면
          주소창 없이 앱처럼 실행됩니다.
        </p>
      {:else}
        <p class="text-xs" style="color:var(--text-muted)">
          홈 화면에 추가하면 주소창 없이 앱처럼 실행됩니다.
        </p>
        {#if deferredPrompt}
          <button class="btn-primary mt-2 text-xs py-1.5 px-3" on:click={install}>
            설치하기
          </button>
        {/if}
      {/if}
    </div>

    <button class="btn-icon w-6 h-6 flex-shrink-0 -mt-0.5" on:click={dismiss}>
      <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M6 18L18 6M6 6l12 12"/>
      </svg>
    </button>
  </div>
{/if}

<script lang="ts">
  import { onMount } from 'svelte';

  interface BeforeInstallPromptEvent extends Event {
    prompt(): Promise<void>;
    userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
  }

  let deferredPrompt: BeforeInstallPromptEvent | null = null;
  let platform: 'android' | 'ios' | 'mac' | 'windows' | 'other' = 'other';
  let isStandalone = false;
  let installDone = false;
  let activeTab: 'android' | 'ios' | 'mac' | 'windows' = 'android';

  onMount(() => {
    isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true;

    const ua = navigator.userAgent.toLowerCase();
    if (/iphone|ipad|ipod/.test(ua)) {
      platform = 'ios';
      activeTab = 'ios';
    } else if (/android/.test(ua)) {
      platform = 'android';
      activeTab = 'android';
    } else if (/mac/.test(ua)) {
      platform = 'mac';
      activeTab = 'mac';
    } else if (/win/.test(ua)) {
      platform = 'windows';
      activeTab = 'windows';
    }

    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      deferredPrompt = e as BeforeInstallPromptEvent;
    });

    window.addEventListener('appinstalled', () => {
      installDone = true;
      deferredPrompt = null;
    });
  });

  async function install() {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') installDone = true;
    deferredPrompt = null;
  }

  const tabs: { id: typeof activeTab; label: string; icon: string }[] = [
    { id: 'android', label: '안드로이드', icon: '🤖' },
    { id: 'ios', label: 'iPhone / iPad', icon: '🍎' },
    { id: 'mac', label: '맥 / PC', icon: '💻' },
    { id: 'windows', label: '윈도우', icon: '🪟' }
  ];
</script>

<svelte:head>
  <title>KeyID — 앱 설치</title>
</svelte:head>

<div class="px-4 pt-6 pb-8 max-w-xl mx-auto">
  <div class="mb-6">
    <h1 class="text-xl font-bold" style="color:var(--text)">앱 설치</h1>
    <p class="text-sm mt-1" style="color:var(--text-muted)">
      KeyID를 기기에 설치하면 주소창 없이 네이티브 앱처럼 사용할 수 있습니다.
    </p>
  </div>

  {#if isStandalone || installDone}
    <div class="panel text-center py-8">
      <div class="text-5xl mb-4">✅</div>
      <div class="text-lg font-bold mb-1" style="color:var(--text)">이미 설치되어 있습니다</div>
      <div class="text-sm" style="color:var(--text-muted)">KeyID가 앱으로 실행 중입니다.</div>
    </div>
  {:else}

    <!-- One-click install button (Android/Desktop Chrome/Edge) -->
    {#if deferredPrompt}
      <div class="panel mb-5 flex items-center gap-4">
        <img src="/icons/icon-192.png" alt="KeyID" class="w-14 h-14 rounded-2xl flex-shrink-0" />
        <div class="flex-1">
          <div class="font-semibold mb-0.5" style="color:var(--text)">이 기기에 설치</div>
          <div class="text-xs mb-3" style="color:var(--text-muted)">한 번의 탭으로 홈 화면에 추가됩니다.</div>
          <button class="btn-primary text-sm" on:click={install}>
            📲 지금 설치하기
          </button>
        </div>
      </div>
    {/if}

    <!-- Platform tabs -->
    <div class="panel">
      <div class="flex gap-1 mb-5 p-1 rounded-xl" style="background:var(--bg)">
        {#each tabs as tab}
          <button
            class="flex-1 flex flex-col items-center gap-1 py-2 rounded-lg text-xs font-medium transition"
            style={activeTab === tab.id
              ? 'background:var(--bg-panel); color:var(--text)'
              : 'color:var(--text-muted)'}
            on:click={() => (activeTab = tab.id)}
          >
            <span class="text-base">{tab.icon}</span>
            <span class="leading-tight text-center" style="font-size:10px">{tab.label}</span>
          </button>
        {/each}
      </div>

      <!-- Android -->
      {#if activeTab === 'android'}
        <div class="space-y-4">
          <div class="text-sm font-semibold mb-3" style="color:var(--text)">Chrome 브라우저로 설치</div>
          {#each [
            { n: 1, icon: '🌐', title: 'Chrome으로 접속', desc: 'Chrome 브라우저에서 keyid 주소를 열어주세요.' },
            { n: 2, icon: '⋮', title: '메뉴 열기', desc: '오른쪽 상단 점 3개 메뉴(⋮)를 탭합니다.' },
            { n: 3, icon: '📲', title: '앱 설치', desc: '"앱 설치" 또는 "홈 화면에 추가"를 탭합니다.' },
            { n: 4, icon: '✅', title: '설치 완료', desc: '홈 화면에 KeyID 아이콘이 추가됩니다.' }
          ] as step}
            <div class="flex items-start gap-3">
              <div class="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0"
                style="background:rgba(59,130,246,0.15); color:#60a5fa">{step.n}</div>
              <div>
                <div class="text-sm font-medium" style="color:var(--text)">{step.icon} {step.title}</div>
                <div class="text-xs mt-0.5" style="color:var(--text-muted)">{step.desc}</div>
              </div>
            </div>
          {/each}
        </div>

      <!-- iOS -->
      {:else if activeTab === 'ios'}
        <div class="space-y-4">
          <div class="text-sm font-semibold mb-3" style="color:var(--text)">Safari 브라우저로 설치</div>
          {#each [
            { n: 1, icon: '🧭', title: 'Safari로 접속', desc: 'iOS는 Safari 브라우저에서만 홈 화면 추가가 가능합니다.' },
            { n: 2, icon: '⬆️', title: '공유 버튼 탭', desc: '하단 중앙의 공유 버튼(사각형+화살표)을 탭합니다.' },
            { n: 3, icon: '➕', title: '홈 화면에 추가', desc: '스크롤하여 "홈 화면에 추가"를 탭합니다.' },
            { n: 4, icon: '✅', title: '설치 완료', desc: '"추가"를 탭하면 홈 화면에 아이콘이 생성됩니다.' }
          ] as step}
            <div class="flex items-start gap-3">
              <div class="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0"
                style="background:rgba(59,130,246,0.15); color:#60a5fa">{step.n}</div>
              <div>
                <div class="text-sm font-medium" style="color:var(--text)">{step.icon} {step.title}</div>
                <div class="text-xs mt-0.5" style="color:var(--text-muted)">{step.desc}</div>
              </div>
            </div>
          {/each}
          <div class="rounded-xl p-3 text-xs" style="background:rgba(245,158,11,0.1); color:#fbbf24">
            ⚠️ Chrome, Firefox 등 다른 브라우저에서는 홈 화면 추가 기능이 지원되지 않습니다.
          </div>
        </div>

      <!-- Mac -->
      {:else if activeTab === 'mac'}
        <div class="space-y-4">
          <div class="text-sm font-semibold mb-3" style="color:var(--text)">Chrome 또는 Edge로 설치</div>
          {#each [
            { n: 1, icon: '🌐', title: 'Chrome / Edge로 접속', desc: 'Safari는 macOS PWA를 지원하지 않습니다. Chrome 또는 Edge를 사용하세요.' },
            { n: 2, icon: '⋮', title: '메뉴 열기', desc: '주소창 오른쪽의 설치 아이콘(⊕) 또는 점 3개 메뉴를 클릭합니다.' },
            { n: 3, icon: '📲', title: '"KeyID 설치" 클릭', desc: '"KeyID 설치..." 메뉴를 클릭합니다.' },
            { n: 4, icon: '✅', title: '설치 완료', desc: 'Dock 또는 응용 프로그램 폴더에서 실행할 수 있습니다.' }
          ] as step}
            <div class="flex items-start gap-3">
              <div class="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0"
                style="background:rgba(59,130,246,0.15); color:#60a5fa">{step.n}</div>
              <div>
                <div class="text-sm font-medium" style="color:var(--text)">{step.icon} {step.title}</div>
                <div class="text-xs mt-0.5" style="color:var(--text-muted)">{step.desc}</div>
              </div>
            </div>
          {/each}
        </div>

      <!-- Windows -->
      {:else if activeTab === 'windows'}
        <div class="space-y-4">
          <div class="text-sm font-semibold mb-3" style="color:var(--text)">Edge 또는 Chrome으로 설치</div>
          {#each [
            { n: 1, icon: '🌐', title: 'Edge / Chrome으로 접속', desc: 'Microsoft Edge 또는 Chrome 브라우저를 사용하세요.' },
            { n: 2, icon: '⊕', title: '설치 아이콘 클릭', desc: '주소창 오른쪽 끝의 앱 설치 아이콘(⊕)을 클릭합니다.' },
            { n: 3, icon: '📲', title: '"설치" 클릭', desc: '"KeyID 설치" 대화상자에서 "설치"를 클릭합니다.' },
            { n: 4, icon: '✅', title: '설치 완료', desc: '바탕화면과 시작 메뉴에서 실행할 수 있습니다.' }
          ] as step}
            <div class="flex items-start gap-3">
              <div class="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0"
                style="background:rgba(59,130,246,0.15); color:#60a5fa">{step.n}</div>
              <div>
                <div class="text-sm font-medium" style="color:var(--text)">{step.icon} {step.title}</div>
                <div class="text-xs mt-0.5" style="color:var(--text-muted)">{step.desc}</div>
              </div>
            </div>
          {/each}
        </div>
      {/if}
    </div>

    <!-- App info -->
    <div class="mt-4 panel flex items-center gap-3">
      <img src="/icons/icon-192.png" alt="KeyID" class="w-10 h-10 rounded-xl flex-shrink-0" />
      <div>
        <div class="text-sm font-semibold" style="color:var(--text)">KeyID</div>
        <div class="text-xs" style="color:var(--text-muted)">디지털 서명 인증서 · PWA · 오프라인 지원</div>
      </div>
    </div>
  {/if}
</div>

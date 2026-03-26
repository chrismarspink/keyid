<script lang="ts">
  import { onMount } from 'svelte';
  import IDCard from '$components/IDCard.svelte';
  import TrustBadge from '$components/TrustBadge.svelte';
  import { getAllContacts, addContact, type Contact } from '$lib/storage/contacts';
  import { parseCertificate } from '$lib/crypto/cert';
  import { QRScanner } from '$lib/qr/scanner';
  import { decodeSimpleQR } from '$lib/qr/bcur';

  let contacts: Contact[] = [];
  let loading = true;
  let search = '';
  let showAdd = false;
  let showScan = false;
  let scanning = false;
  let videoEl: HTMLVideoElement | null = null;
  let scanner: QRScanner | null = null;
  let importError = '';

  // File import
  let fileInput: HTMLInputElement | null = null;

  let toast = { visible: false, msg: '', type: 'info' as 'success' | 'error' | 'info' };
  function showToast(msg: string, type: typeof toast.type = 'info') {
    toast = { visible: true, msg, type };
    setTimeout(() => (toast = { ...toast, visible: false }), 3200);
  }

  onMount(async () => {
    contacts = await getAllContacts();
    loading = false;
  });

  $: filtered = search
    ? contacts.filter(
        (c) =>
          c.commonName.toLowerCase().includes(search.toLowerCase()) ||
          c.email.toLowerCase().includes(search.toLowerCase()) ||
          c.organization.toLowerCase().includes(search.toLowerCase())
      )
    : contacts;

  async function importCertFile(file: File) {
    importError = '';
    try {
      const buf = await file.arrayBuffer();
      const parsed = await parseCertificate(buf);
      const certB64 = btoa(
        Array.from(new Uint8Array(buf), (b) => String.fromCharCode(b)).join('')
      );
      await addContact({
        commonName: parsed.commonName,
        email: parsed.email,
        organization: parsed.organization,
        country: parsed.country,
        certDer: certB64,
        fingerprint: parsed.fingerprint,
        notBefore: parsed.notBefore,
        notAfter: parsed.notAfter,
        serialNumber: parsed.serialNumber,
        trustLevel: 'known',
        addedAt: new Date().toISOString(),
        notes: '',
        avatar: null
      });
      contacts = await getAllContacts();
      showAdd = false;
      showToast('연락처를 추가했습니다.', 'success');
    } catch (e) {
      importError = '인증서를 읽을 수 없습니다: ' + String(e);
    }
  }

  async function handleFileInput(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (file) await importCertFile(file);
  }

  async function startScan() {
    showScan = true;
    scanning = true;
    scanner = new QRScanner();
    // Wait for DOM
    setTimeout(async () => {
      if (!videoEl) return;
      await scanner!.start(
        videoEl,
        async (result) => {
          const decoded = decodeSimpleQR(result.text);
          if (decoded) {
            scanner?.stop();
            scanning = false;
            showScan = false;
            try {
              const parsed = await parseCertificate(decoded.buffer as ArrayBuffer);
              const certB64 = btoa(
                Array.from(decoded, (b) => String.fromCharCode(b)).join('')
              );
              await addContact({
                commonName: parsed.commonName,
                email: parsed.email,
                organization: parsed.organization,
                country: parsed.country,
                certDer: certB64,
                fingerprint: parsed.fingerprint,
                notBefore: parsed.notBefore,
                notAfter: parsed.notAfter,
                serialNumber: parsed.serialNumber,
                trustLevel: 'known',
                addedAt: new Date().toISOString(),
                notes: '',
                avatar: null
              });
              contacts = await getAllContacts();
              showToast('QR 스캔으로 연락처를 추가했습니다.', 'success');
            } catch (e) {
              showToast('QR 파싱 실패: ' + String(e), 'error');
            }
          }
        },
        (err) => {
          showToast('카메라 오류: ' + err.message, 'error');
          showScan = false;
          scanning = false;
        }
      );
    }, 100);
  }

  function stopScan() {
    scanner?.stop();
    scanner = null;
    showScan = false;
    scanning = false;
  }
</script>

<svelte:head>
  <title>연락처 — KeyID</title>
</svelte:head>

<div class="px-4 pt-6 pb-4 max-w-2xl mx-auto">
  <!-- Header -->
  <div class="flex items-center justify-between mb-4">
    <div>
      <h1 class="text-xl font-bold text-slate-800">연락처</h1>
      <p class="text-sm text-gray-400">{contacts.length}명</p>
    </div>
    <button class="btn-primary text-sm py-2.5" on:click={() => (showAdd = true)}>
      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
      </svg>
      추가
    </button>
  </div>

  <!-- Search -->
  <div class="relative mb-4">
    <svg class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0"/>
    </svg>
    <input
      class="input pl-9"
      type="search"
      placeholder="이름, 이메일, 소속 검색…"
      bind:value={search}
    />
  </div>

  {#if loading}
    <div class="flex justify-center py-12">
      <div class="w-8 h-8 rounded-full border-2 border-navy-600 border-t-transparent animate-spin"></div>
    </div>
  {:else if filtered.length === 0}
    <div class="text-center py-16 text-gray-400">
      <svg class="w-12 h-12 mx-auto mb-3 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"
          d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/>
      </svg>
      {search ? '검색 결과가 없습니다.' : '연락처가 없습니다. 인증서를 가져오세요.'}
    </div>
  {:else}
    <div class="space-y-3">
      {#each filtered as contact}
        <a
          href="/contacts/{contact.id}"
          class="panel flex items-center gap-3 hover:shadow-md transition-shadow"
        >
          <!-- Avatar -->
          <div class="w-12 h-12 rounded-full flex-shrink-0 overflow-hidden bg-blue-100 flex items-center justify-center font-bold text-navy-600">
            {#if contact.avatar}
              <img src={contact.avatar} alt={contact.commonName} class="w-full h-full object-cover" />
            {:else}
              {contact.commonName.split(/\s+/).map(w => w[0] ?? '').slice(0, 2).join('').toUpperCase() || '?'}
            {/if}
          </div>
          <!-- Info -->
          <div class="flex-1 min-w-0">
            <div class="font-semibold text-slate-800 truncate">{contact.commonName}</div>
            {#if contact.email}
              <div class="text-xs text-gray-400 truncate">{contact.email}</div>
            {/if}
            {#if contact.organization}
              <div class="text-xs text-gray-400 truncate">{contact.organization}</div>
            {/if}
          </div>
          <!-- Trust + chevron -->
          <div class="flex flex-col items-end gap-1.5 flex-shrink-0">
            <TrustBadge level={contact.trustLevel} size="sm" />
            <svg class="w-4 h-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
            </svg>
          </div>
        </a>
      {/each}
    </div>
  {/if}
</div>

<!-- Add contact modal -->
{#if showAdd}
  <div class="fixed inset-0 z-50 bg-black/70 flex items-end sm:items-center justify-center p-4" role="dialog">
    <div class="bg-white rounded-3xl p-6 w-full max-w-sm">
      <h3 class="font-bold text-slate-800 mb-4">연락처 추가</h3>
      <div class="space-y-3">
        <button
          class="w-full flex items-center gap-3 p-4 rounded-xl border border-gray-200 hover:border-navy-400 hover:bg-navy-50 transition"
          on:click={() => { fileInput?.click(); }}
        >
          <svg class="w-5 h-5 text-navy-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
          </svg>
          <div class="text-left">
            <div class="font-medium text-sm text-slate-700">.pkis-cert 파일 가져오기</div>
            <div class="text-xs text-gray-400">인증서 파일 선택</div>
          </div>
        </button>
        <button
          class="w-full flex items-center gap-3 p-4 rounded-xl border border-gray-200 hover:border-navy-400 hover:bg-navy-50 transition"
          on:click={() => { showAdd = false; startScan(); }}
        >
          <svg class="w-5 h-5 text-navy-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z"/>
          </svg>
          <div class="text-left">
            <div class="font-medium text-sm text-slate-700">QR 코드 스캔</div>
            <div class="text-xs text-gray-400">카메라로 스캔</div>
          </div>
        </button>
      </div>
      {#if importError}
        <p class="mt-3 text-sm text-red-500">{importError}</p>
      {/if}
      <button class="btn-secondary w-full mt-4" on:click={() => { showAdd = false; importError = ''; }}>취소</button>
    </div>
  </div>
{/if}

<!-- Hidden file input -->
<input
  bind:this={fileInput}
  type="file"
  accept=".pkis-cert,.pem,.cer,.crt"
  class="hidden"
  on:change={handleFileInput}
/>

<!-- QR Scanner modal -->
{#if showScan}
  <div class="fixed inset-0 z-50 bg-black flex flex-col" role="dialog">
    <div class="flex items-center justify-between p-4 text-white">
      <h3 class="font-bold">QR 스캔</h3>
      <button class="btn-icon text-white hover:bg-white/20" on:click={stopScan}>
        <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
        </svg>
      </button>
    </div>
    <div class="flex-1 relative">
      <!-- svelte-ignore a11y-media-has-caption -->
      <video bind:this={videoEl} class="w-full h-full object-cover" playsinline></video>
      <!-- Scan overlay -->
      <div class="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div class="w-64 h-64 border-2 border-white/70 rounded-2xl relative">
          <div class="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-white rounded-tl-xl"></div>
          <div class="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-white rounded-tr-xl"></div>
          <div class="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-white rounded-bl-xl"></div>
          <div class="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-white rounded-br-xl"></div>
        </div>
      </div>
    </div>
    <div class="p-4 text-white/70 text-center text-sm">
      상대방의 KeyID QR 코드를 프레임 안에 놓으세요
    </div>
  </div>
{/if}

<!-- Toast -->
{#if toast.visible}
  <div class="toast toast-{toast.type}" role="alert">{toast.msg}</div>
{/if}

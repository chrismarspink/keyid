<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import IDCard from '$components/IDCard.svelte';
  import TrustBadge from '$components/TrustBadge.svelte';
  import {
    getContact,
    deleteContact,
    updateContact,
    type Contact,
    type TrustLevel
  } from '$lib/storage/contacts';
  import { certDerToPem } from '$lib/crypto/cert';
  import { downloadFile } from '$lib/fileHandler';

  const trustOptions: TrustLevel[] = ['known', 'verified'];

  let contact: Contact | null = null;
  let loading = true;
  let showDeleteConfirm = false;
  let toast = { visible: false, msg: '', type: 'info' as 'success' | 'error' | 'info' };

  function showToast(msg: string, type: typeof toast.type = 'info') {
    toast = { visible: true, msg, type };
    setTimeout(() => (toast = { ...toast, visible: false }), 3200);
  }

  onMount(async () => {
    const id = parseInt($page.params.id ?? '0', 10);
    contact = await getContact(id);
    loading = false;
  });

  function getCertDer(): ArrayBuffer | null {
    if (!contact) return null;
    const binary = atob(contact.certDer);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes.buffer;
  }

  async function downloadCert() {
    const der = getCertDer();
    if (!der || !contact) return;
    const name = contact.commonName.replace(/\s+/g, '_');
    downloadFile(der, `${name}.pkis-cert`, 'application/pkis-cert');
    showToast('인증서를 다운로드했습니다.', 'success');
  }

  async function downloadPem() {
    const der = getCertDer();
    if (!der || !contact) return;
    const pem = certDerToPem(der);
    const blob = new Blob([pem], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${contact.commonName.replace(/\s+/g, '_')}.pem`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('PEM을 다운로드했습니다.', 'success');
  }

  async function setTrust(level: TrustLevel) {
    if (!contact) return;
    contact = { ...contact, trustLevel: level };
    await updateContact(contact);
    showToast('신뢰 수준을 변경했습니다.', 'success');
  }

  async function confirmDelete() {
    if (!contact) return;
    await deleteContact(contact.id!);
    goto('/contacts');
  }

  $: expDate = contact?.notAfter
    ? new Date(contact.notAfter).toLocaleDateString('ko-KR', {
        year: 'numeric', month: 'long', day: 'numeric'
      })
    : '';

  $: isExpired = contact?.notAfter ? new Date(contact.notAfter) < new Date() : false;
</script>

<svelte:head>
  <title>{contact?.commonName ?? '연락처'} — KeyID</title>
</svelte:head>

{#if loading}
  <div class="flex items-center justify-center min-h-screen">
    <div class="w-8 h-8 rounded-full border-2 border-navy-600 border-t-transparent animate-spin"></div>
  </div>

{:else if !contact}
  <div class="flex flex-col items-center justify-center min-h-screen gap-4 px-4">
    <p class="text-gray-500">연락처를 찾을 수 없습니다.</p>
    <a href="/contacts" class="btn-secondary">연락처 목록으로</a>
  </div>

{:else}
  <div class="max-w-2xl mx-auto px-4 pt-6 pb-8">
    <!-- Header -->
    <div class="flex items-center gap-3 mb-6">
      <button on:click={() => goto('/contacts')} class="btn-icon">
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/>
        </svg>
      </button>
      <div>
        <h1 class="text-xl font-bold text-slate-800">{contact.commonName}</h1>
        <p class="text-sm text-gray-400">{contact.organization || '소속 없음'}</p>
      </div>
    </div>

    <!-- ID Card -->
    <div class="flex justify-center mb-6">
      <IDCard
        commonName={contact.commonName}
        email={contact.email}
        organization={contact.organization}
        country={contact.country}
        fingerprint={contact.fingerprint}
        notAfter={contact.notAfter}
        trustLevel={contact.trustLevel}
      />
    </div>

    <!-- Trust Level -->
    <div class="panel mb-4">
      <h2 class="text-sm font-semibold text-gray-700 mb-3">신뢰 수준</h2>
      <div class="flex gap-2 flex-wrap">
        <button
          class="flex items-center gap-2 px-4 py-2 rounded-xl border-2 text-sm font-medium transition"
          class:border-navy-600={contact.trustLevel === 'known'}
          class:bg-navy-50={contact.trustLevel === 'known'}
          class:border-gray-200={contact.trustLevel !== 'known'}
          on:click={() => setTrust('known')}
        >
          <TrustBadge level="known" size="sm" />
          알고 있음
        </button>
        <button
          class="flex items-center gap-2 px-4 py-2 rounded-xl border-2 text-sm font-medium transition"
          class:border-navy-600={contact.trustLevel === 'verified'}
          class:bg-navy-50={contact.trustLevel === 'verified'}
          class:border-gray-200={contact.trustLevel !== 'verified'}
          on:click={() => setTrust('verified')}
        >
          <TrustBadge level="verified" size="sm" />
          직접 확인됨
        </button>
      </div>
    </div>

    <!-- Certificate info -->
    <div class="panel mb-4 space-y-3">
      <h2 class="text-sm font-semibold text-gray-700">인증서 정보</h2>

      <div class="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
        <div>
          <div class="text-xs text-gray-400 mb-0.5">이름</div>
          <div class="font-medium text-slate-800">{contact.commonName}</div>
        </div>
        <div>
          <div class="text-xs text-gray-400 mb-0.5">이메일</div>
          <div class="font-medium text-slate-800">{contact.email || '—'}</div>
        </div>
        <div>
          <div class="text-xs text-gray-400 mb-0.5">소속</div>
          <div class="font-medium text-slate-800">{contact.organization || '—'}</div>
        </div>
        <div>
          <div class="text-xs text-gray-400 mb-0.5">국가</div>
          <div class="font-medium text-slate-800">{contact.country || '—'}</div>
        </div>
        <div class="col-span-2">
          <div class="text-xs text-gray-400 mb-0.5">유효기간</div>
          <div class="font-medium" class:text-red-500={isExpired} class:text-slate-800={!isExpired}>
            {isExpired ? '만료됨 — ' : ''}{expDate}
          </div>
        </div>
        <div class="col-span-2">
          <div class="text-xs text-gray-400 mb-0.5">지문 (SHA-256)</div>
          <div class="font-mono text-xs text-slate-600 break-all">{contact.fingerprint}</div>
        </div>
      </div>
    </div>

    <!-- Actions -->
    <div class="panel mb-4 space-y-2">
      <h2 class="text-sm font-semibold text-gray-700 mb-3">내보내기</h2>
      <button on:click={downloadCert} class="btn-secondary w-full justify-start gap-3">
        <svg class="w-5 h-5 text-navy-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
            d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
        </svg>
        인증서 파일 저장 (.pkis-cert)
      </button>
      <button on:click={downloadPem} class="btn-secondary w-full justify-start gap-3">
        <svg class="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
        </svg>
        PEM 형식으로 저장
      </button>
    </div>

    <!-- Danger zone -->
    <div class="panel border-red-100">
      <h2 class="text-sm font-semibold text-red-600 mb-3">삭제</h2>
      {#if !showDeleteConfirm}
        <button on:click={() => (showDeleteConfirm = true)} class="btn-danger w-full">
          연락처 삭제
        </button>
      {:else}
        <p class="text-sm text-gray-600 mb-3">정말로 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.</p>
        <div class="flex gap-3">
          <button on:click={() => (showDeleteConfirm = false)} class="btn-secondary flex-1">취소</button>
          <button on:click={confirmDelete} class="btn-danger flex-1">삭제 확인</button>
        </div>
      {/if}
    </div>
  </div>
{/if}

{#if toast.visible}
  <div class="toast toast-{toast.type}" role="alert">{toast.msg}</div>
{/if}

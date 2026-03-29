<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { base } from '$app/paths';
  import { getAllFileRecords, deleteFileRecord, type FileRecord } from '$lib/storage/keystore';
  import { storeLaunchedFile, downloadFile } from '$lib/fileHandler';

  let records: FileRecord[] = [];
  let loading = true;
  let filter: 'all' | 'signed' | 'encrypted' | 'gated' = 'all';
  let search = '';
  let selected = new Set<number>();

  let toast = { visible: false, msg: '', type: 'info' as 'success' | 'error' | 'info' };
  function showToast(msg: string, type: typeof toast.type = 'info') {
    toast = { visible: true, msg, type };
    setTimeout(() => (toast = { ...toast, visible: false }), 3200);
  }

  $: filtered = records.filter(r => {
    const matchType = filter === 'all' || r.type === filter;
    const q = search.toLowerCase();
    const matchSearch = !q || r.name.toLowerCase().includes(q) || r.originalName.toLowerCase().includes(q);
    return matchType && matchSearch;
  });

  $: allChecked = filtered.length > 0 && filtered.every(r => r.id !== undefined && selected.has(r.id));
  $: signedCount = records.filter(r => r.type === 'signed').length;
  $: encryptedCount = records.filter(r => r.type === 'encrypted').length;
  $: gatedCount = records.filter(r => r.type === 'gated').length;

  function setFilter(val: string) {
    filter = val as typeof filter;
  }

  onMount(async () => {
    records = await getAllFileRecords();
    loading = false;
  });

  function toggleAll() {
    if (allChecked) {
      filtered.forEach(r => { if (r.id !== undefined) selected.delete(r.id); });
    } else {
      filtered.forEach(r => { if (r.id !== undefined) selected.add(r.id); });
    }
    selected = new Set(selected);
  }

  function toggleOne(id: number | undefined) {
    if (id === undefined) return;
    if (selected.has(id)) selected.delete(id);
    else selected.add(id);
    selected = new Set(selected);
  }

  async function deleteRecord(id: number | undefined) {
    if (id === undefined) return;
    await deleteFileRecord(id);
    records = records.filter(r => r.id !== id);
    selected.delete(id); selected = new Set(selected);
    showToast('삭제되었습니다.', 'info');
  }

  async function deleteSelected() {
    const count = selected.size;
    for (const id of selected) await deleteFileRecord(id);
    records = records.filter(r => r.id === undefined || !selected.has(r.id));
    selected = new Set();
    showToast(`${count}개 항목이 삭제되었습니다.`, 'info');
  }

  function download(r: FileRecord) {
    const mime = r.type === 'signed' ? 'application/pkis-sig' : 'application/pkis';
    downloadFile(r.data, r.name, mime);
  }

  /** Open .pkis-sig in verify page via sessionStorage */
  function verifyFile(r: FileRecord) {
    const bytes = new Uint8Array(r.data);
    let bin = '';
    for (let i = 0; i < bytes.byteLength; i++) bin += String.fromCharCode(bytes[i]);
    sessionStorage.setItem('verify_sig_name', r.name);
    sessionStorage.setItem('verify_sig_data', btoa(bin));
    goto(base + '/file/verify');
  }

  /** Store file and navigate to encrypt page → decrypt tab auto-loaded */
  async function decryptFile(r: FileRecord) {
    const file = new File([r.data], r.name, { type: 'application/pkis' });
    await storeLaunchedFile(file);
    goto(base + '/file/encrypt');
  }

  function formatBytes(n: number): string {
    if (n < 1024) return `${n} B`;
    if (n < 1048576) return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / 1048576).toFixed(1)} MB`;
  }

  function relativeTime(iso: string): string {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    if (mins < 1) return '방금';
    if (mins < 60) return `${mins}분 전`;
    if (hours < 24) return `${hours}시간 전`;
    if (days < 30) return `${days}일 전`;
    return new Date(iso).toLocaleDateString('ko-KR');
  }
</script>

<svelte:head><title>파일 목록 — KeyID</title></svelte:head>

<div class="flex flex-col h-screen overflow-hidden">
  <!-- Top bar -->
  <div class="flex items-center justify-between px-6 py-4" style="border-bottom:1px solid var(--border)">
    <div class="flex items-center gap-3">
      <h1 class="text-xl font-bold" style="color:var(--text)">파일 목록</h1>
      <span class="text-xs px-2 py-0.5 rounded font-medium" style="background:rgba(255,255,255,0.08);color:var(--text-muted)">
        {records.length}개
      </span>
    </div>
    <div class="flex items-center gap-2">
      <a href="{base}/file/verify" class="btn-secondary text-xs py-1.5 px-3 gap-1.5">
        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
        </svg>
        서명 검증
      </a>
      <a href="{base}/file/sign" class="btn-secondary text-xs py-1.5 px-3 gap-1.5">
        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
            d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/>
        </svg>
        파일 서명
      </a>
      <a href="{base}/file/encrypt" class="btn-primary text-xs py-1.5 px-3 gap-1.5">
        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
            d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/>
        </svg>
        암호화
      </a>
    </div>
  </div>

  <!-- Usage bar -->
  <div class="flex items-center gap-4 px-6 py-2.5 text-xs" style="border-bottom:1px solid var(--border);background:rgba(0,0,0,0.15)">
    <div class="flex items-center gap-2">
      <div class="w-28 h-1.5 rounded-full overflow-hidden" style="background:rgba(255,255,255,0.1)">
        {#if records.length > 0}
          {@const sPct = (signedCount / records.length) * 100}
          {@const ePct = (encryptedCount / records.length) * 100}
          <div class="flex h-full">
            <div class="h-full" style="width:{sPct}%;background:#3b82f6"></div>
            <div class="h-full" style="width:{ePct}%;background:#a855f7"></div>
            <div class="h-full flex-1" style="background:#f59e0b"></div>
          </div>
        {:else}
          <div class="h-full w-full" style="background:rgba(255,255,255,0.1)"></div>
        {/if}
      </div>
      <span style="color:var(--text-muted)">
        <span style="color:#93c5fd">서명 {signedCount}</span>
        <span class="mx-1" style="color:var(--border-mid)">·</span>
        <span style="color:#c084fc">암호화 {encryptedCount}</span>
        {#if gatedCount > 0}
          <span class="mx-1" style="color:var(--border-mid)">·</span>
          <span style="color:#fbbf24">승인필요 {gatedCount}</span>
        {/if}
      </span>
    </div>
    <span class="ml-auto" style="color:var(--text-muted)">
      {records.length > 0 ? relativeTime(records[0]?.createdAt ?? '') : '—'}
    </span>
    <button class="btn-icon w-6 h-6" title="새로고침"
      on:click={async () => { loading = true; records = await getAllFileRecords(); loading = false; }}>
      <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
          d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
      </svg>
    </button>
  </div>

  <!-- Filter + search -->
  <div class="flex items-center gap-3 px-6 py-3 flex-wrap" style="border-bottom:1px solid var(--border)">
    <div class="relative">
      <svg class="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5" style="color:var(--text-muted)"
        fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0"/>
      </svg>
      <input
        class="pl-8 pr-3 py-1.5 rounded-lg text-xs w-52"
        style="background:rgba(255,255,255,0.06);border:1px solid var(--border);color:var(--text)"
        type="text" placeholder="파일명 검색…" bind:value={search}
      />
    </div>

    <div class="w-px h-5" style="background:var(--border)"></div>

    <div class="flex items-center gap-1">
      {#each [['all','전체'],['signed','서명됨'],['encrypted','암호화됨'],['gated','승인필요']] as [val, label]}
        <button
          class="px-2.5 py-1 rounded text-xs font-medium transition"
          style="
            background:{filter === val ? 'rgba(29,110,245,0.2)' : 'transparent'};
            color:{filter === val ? '#93c5fd' : 'var(--text-muted)'};
            border:1px solid {filter === val ? 'rgba(29,110,245,0.4)' : 'transparent'};
          "
          on:click={() => setFilter(val)}
        >{label}</button>
      {/each}
    </div>

    {#if selected.size > 0}
      <div class="ml-auto flex items-center gap-2">
        <span class="text-xs" style="color:var(--text-muted)">{selected.size}개 선택됨</span>
        <button class="text-xs px-2.5 py-1 rounded transition"
          style="background:rgba(220,38,38,0.15);color:#f87171;border:1px solid rgba(220,38,38,0.3)"
          on:click={deleteSelected}>
          삭제
        </button>
      </div>
    {/if}
  </div>

  <!-- Table -->
  <div class="flex-1 overflow-y-auto">
    {#if loading}
      <div class="flex items-center justify-center py-20">
        <div class="w-6 h-6 rounded-full border-2 border-t-transparent animate-spin"
          style="border-color:#1d6ef5;border-top-color:transparent"></div>
      </div>

    {:else if filtered.length === 0}
      <div class="flex flex-col items-center justify-center py-20 text-center">
        <svg class="w-14 h-14 mb-4" style="color:var(--text-dim)" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1"
            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
        </svg>
        <p class="text-sm" style="color:var(--text-muted)">
          {search || filter !== 'all' ? '검색 결과가 없습니다.' : '파일 기록이 없습니다.'}
        </p>
        {#if filter === 'all' && !search}
          <p class="text-xs mt-1" style="color:var(--text-dim)">파일을 서명하거나 암호화하면 여기에 표시됩니다.</p>
          <div class="flex gap-2 mt-4">
            <a href="{base}/file/sign" class="btn-secondary text-xs py-1.5 px-3">파일 서명</a>
            <a href="{base}/file/encrypt" class="btn-primary text-xs py-1.5 px-3">암호화</a>
          </div>
        {/if}
      </div>

    {:else}
      <!-- Column header -->
      <div class="grid gap-4 px-6 py-2.5 text-xs font-semibold uppercase tracking-widest select-none"
        style="grid-template-columns:2rem 1fr 9rem 10rem 8rem;color:var(--text-muted);border-bottom:1px solid var(--border);background:rgba(0,0,0,0.2)">
        <div>
          <input type="checkbox" class="w-3.5 h-3.5 rounded" checked={allChecked} on:change={toggleAll}
            style="accent-color:#1d6ef5" />
        </div>
        <div>이름</div>
        <div>유형</div>
        <div>생성일 · 크기</div>
        <div class="text-right">작업</div>
      </div>

      {#each filtered as record (record.id)}
        {@const isSelected = record.id !== undefined && selected.has(record.id)}
        <div
          class="grid gap-4 px-6 py-3 items-center cursor-default"
          style="
            grid-template-columns:2rem 1fr 9rem 10rem 8rem;
            border-bottom:1px solid var(--border);
            background:{isSelected ? 'rgba(29,110,245,0.08)' : 'transparent'};
            transition:background 0.1s;
          "
          class:dk-row-hover={!isSelected}
        >
          <!-- Checkbox -->
          <div>
            <input type="checkbox" class="w-3.5 h-3.5 rounded" checked={isSelected}
              on:change={() => toggleOne(record.id)} style="accent-color:#1d6ef5" />
          </div>

          <!-- Name + meta -->
          <div class="min-w-0">
            <div class="flex items-center gap-1.5">
              <span class="text-sm font-medium truncate" style="color:var(--text)">{record.name}</span>
              {#if record.viewerOnly}
                <span class="flex-shrink-0 text-xs px-1.5 py-0.5 rounded"
                  style="background:rgba(99,102,241,0.15);color:#818cf8;border:1px solid rgba(99,102,241,0.25)">
                  뷰어전용
                </span>
              {/if}
            </div>
            <div class="text-xs truncate mt-0.5" style="color:var(--text-muted)">
              {record.originalName}
              {#if record.signerName}
                &nbsp;·&nbsp;<span style="color:#60a5fa">{record.signerName}</span>
              {/if}
              {#if record.recipientCount}
                &nbsp;·&nbsp;수신자 {record.recipientCount}명
              {/if}
            </div>
          </div>

          <!-- Type badge -->
          <div>
            {#if record.type === 'signed'}
              <span class="badge-signed gap-1">
                <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                    d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/>
                </svg>
                서명됨
              </span>
            {:else if record.type === 'gated'}
              <span class="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium"
                style="background:rgba(245,158,11,0.15);color:#fbbf24;border:1px solid rgba(245,158,11,0.3)">
                <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                    d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/>
                </svg>
                승인필요
              </span>
            {:else}
              <span class="badge-encrypted gap-1">
                <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                    d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/>
                </svg>
                암호화됨
              </span>
            {/if}
          </div>

          <!-- Created + size -->
          <div>
            <div class="text-xs" style="color:var(--text)">{relativeTime(record.createdAt)}</div>
            <div class="text-xs font-mono mt-0.5" style="color:var(--text-muted)">{formatBytes(record.size)}</div>
          </div>

          <!-- Actions -->
          <div class="flex items-center justify-end gap-0.5">
            {#if record.type === 'signed'}
              <!-- Verify signature -->
              <button class="btn-icon w-7 h-7 rounded" title="서명 검증"
                style="color:#60a5fa" on:click={() => verifyFile(record)}>
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                    d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
                </svg>
              </button>

            {:else if record.type === 'gated'}
              <!-- Decrypt gated (approval-gated) -->
              <button class="btn-icon w-7 h-7 rounded" title="복호화 (승인 필요)"
                style="color:#fbbf24" on:click={() => decryptFile(record)}>
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                    d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/>
                </svg>
              </button>

            {:else if record.viewerOnly}
              <!-- Viewer-only: decrypt → auto-open viewer -->
              <button class="btn-icon w-7 h-7 rounded" title="보안 뷰어로 열기"
                style="color:#818cf8" on:click={() => decryptFile(record)}>
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                    d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                    d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/>
                </svg>
              </button>

            {:else}
              <!-- Normal decrypt -->
              <button class="btn-icon w-7 h-7 rounded" title="복호화"
                style="color:#c084fc" on:click={() => decryptFile(record)}>
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                    d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z"/>
                </svg>
              </button>
            {/if}

            <!-- Download (always available — this is the encrypted/signed PKIS file) -->
            <button class="btn-icon w-7 h-7 rounded" title="다운로드 (.pkis)" on:click={() => download(record)}>
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                  d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
              </svg>
            </button>

            <!-- Delete -->
            <button class="btn-icon delete-btn w-7 h-7 rounded" title="삭제"
              on:click={() => deleteRecord(record.id)}>
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
              </svg>
            </button>
          </div>
        </div>
      {/each}

      <div class="px-6 py-2 text-xs text-right" style="color:var(--text-muted)">
        {filtered.length}개 표시됨
      </div>
    {/if}
  </div>
</div>

{#if toast.visible}
  <div class="toast toast-{toast.type}" role="alert">{toast.msg}</div>
{/if}

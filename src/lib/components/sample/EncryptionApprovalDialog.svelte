<!--
  EncryptionApprovalDialog — shadcn/ui Dialog 패턴을 SvelteKit/Svelte 5로 구현한 샘플.

  shadcn 원칙 적용:
  • DialogOverlay(backdrop) + DialogContent 분리 구조
  • DialogHeader / DialogTitle / DialogDescription / DialogFooter 구성
  • Semantic color tokens (CSS variables) — raw Tailwind 컬러 미사용
  • Avatar + AvatarFallback 패턴
  • Badge 패턴 (recipients count)
  • 접근성: role="dialog", aria-labelledby, aria-describedby, focus trap, Escape
  • 애니메이션: backdrop fade + content fade+scale

  Props:
    open          boolean
    filename      string
    fileSize      number   (bytes)
    recipients    { name: string; avatarUrl: string }[]
    message?      string

  Events:
    approve
    cancel
-->

<script lang="ts">
  import { createEventDispatcher, onDestroy } from 'svelte';
  import { fade, scale } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';

  export let open = false;
  export let filename = '';
  export let fileSize = 0;
  export let recipients: { name: string; avatarUrl: string }[] = [];
  export let message: string | undefined = undefined;

  const dispatch = createEventDispatcher<{ approve: void; cancel: void }>();

  // ── Focus trap ─────────────────────────────────────────────────────────────
  let dialogEl: HTMLElement;
  let previousFocus: HTMLElement | null = null;

  $: if (open) {
    previousFocus = document.activeElement as HTMLElement;
    requestAnimationFrame(() => dialogEl?.focus());
  } else if (previousFocus) {
    requestAnimationFrame(() => previousFocus?.focus());
  }

  function trapFocus(e: KeyboardEvent) {
    if (!open || !dialogEl) return;
    if (e.key === 'Escape') { cancel(); return; }
    if (e.key !== 'Tab') return;

    const focusable = dialogEl.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault(); last?.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault(); first?.focus();
    }
  }

  onDestroy(() => { previousFocus?.focus(); });

  // ── Helpers ─────────────────────────────────────────────────────────────────
  function formatBytes(n: number): string {
    if (n < 1024) return `${n} B`;
    if (n < 1_048_576) return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / 1_048_576).toFixed(1)} MB`;
  }

  function initials(name: string): string {
    return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
  }

  // ── Actions ─────────────────────────────────────────────────────────────────
  function approve() { dispatch('approve'); open = false; }
  function cancel()  { dispatch('cancel');  open = false; }
</script>

<svelte:window on:keydown={trapFocus} />

{#if open}
  <!-- ── DialogOverlay (backdrop) ── -->
  <div
    role="presentation"
    class="dialog-overlay"
    transition:fade={{ duration: 180 }}
    on:click={cancel}
  ></div>

  <!-- ── DialogContent ── -->
  <div
    bind:this={dialogEl}
    role="dialog"
    aria-modal="true"
    aria-labelledby="dialog-title"
    aria-describedby="dialog-description"
    tabindex="-1"
    class="dialog-content"
    transition:scale={{ duration: 200, start: 0.95, easing: cubicOut }}
    on:click|stopPropagation
  >
    <!-- DialogHeader -->
    <div class="dialog-header">
      <!-- Lock icon -->
      <div class="dialog-icon">
        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
            d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/>
        </svg>
      </div>
      <div>
        <!-- DialogTitle -->
        <h2 id="dialog-title" class="dialog-title">파일 암호화 승인</h2>
        <!-- DialogDescription -->
        <p id="dialog-description" class="dialog-description">
          다음 파일을 선택한 수신자에게 암호화하여 전송합니다.
        </p>
      </div>
    </div>

    <!-- DialogBody -->
    <div class="dialog-body">

      <!-- File info card -->
      <div class="info-card">
        <div class="info-card-icon">
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"
              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
          </svg>
        </div>
        <div class="info-card-body">
          <span class="info-card-filename">{filename}</span>
          <span class="info-card-meta">{formatBytes(fileSize)}</span>
        </div>
      </div>

      <!-- Separator -->
      <div class="separator" role="separator" aria-hidden="true"></div>

      <!-- Recipients section -->
      <div class="section">
        <div class="section-header">
          <span class="section-label">수신자</span>
          <!-- Badge: recipient count -->
          <span class="badge">{recipients.length}명</span>
        </div>

        <ul class="recipients-list" aria-label="암호화 수신자 목록">
          {#each recipients as r (r.name)}
            <li class="recipient-item">
              <!-- Avatar + AvatarFallback 패턴 -->
              <div class="avatar" aria-hidden="true">
                {#if r.avatarUrl}
                  <img src={r.avatarUrl} alt="" class="avatar-img"
                    on:error={(e) => { if (e.target instanceof HTMLImageElement) e.target.style.display='none'; }} />
                {/if}
                <span class="avatar-fallback">{initials(r.name)}</span>
              </div>
              <span class="recipient-name">{r.name}</span>
              <!-- Lock icon indicating encrypted -->
              <svg class="recipient-lock" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-label="암호화됨">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                  d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/>
              </svg>
            </li>
          {/each}
        </ul>
      </div>

      <!-- Message (optional) -->
      {#if message}
        <div class="separator" role="separator" aria-hidden="true"></div>
        <div class="section">
          <span class="section-label">메시지</span>
          <!-- Alert-style callout -->
          <div class="callout" role="note">
            <svg class="callout-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"/>
            </svg>
            <p class="callout-text">"{message}"</p>
          </div>
        </div>
      {/if}

      <!-- Security notice -->
      <div class="notice" role="note">
        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
            d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/>
        </svg>
        <span>AES-256 + ECDH 키 교환. 수신자 인증서로만 복호화 가능합니다.</span>
      </div>
    </div>

    <!-- DialogFooter -->
    <div class="dialog-footer">
      <button type="button" class="btn-secondary" on:click={cancel}>
        취소
      </button>
      <button type="button" class="btn-primary" on:click={approve}>
        <svg class="btn-icon-inline" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
            d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/>
        </svg>
        암호화 승인
      </button>
    </div>
  </div>
{/if}

<style>
  /* ── Overlay ─────────────────────────────────────────────────────────────── */
  .dialog-overlay {
    position: fixed;
    inset: 0;
    z-index: 500;
    background: rgba(0, 0, 0, 0.65);
    backdrop-filter: blur(4px);
  }

  /* ── Content ─────────────────────────────────────────────────────────────── */
  .dialog-content {
    position: fixed;
    inset: 0;
    z-index: 501;
    margin: auto;
    width: min(420px, calc(100vw - 2rem));
    height: fit-content;
    max-height: calc(100vh - 4rem);
    overflow-y: auto;
    background: var(--bg-panel);
    border: 1px solid var(--border-mid);
    border-radius: 1rem;
    box-shadow:
      0 0 0 1px rgba(255,255,255,0.04) inset,
      0 24px 64px rgba(0,0,0,0.6);
    display: flex;
    flex-direction: column;
    outline: none;
  }

  /* ── DialogHeader ─────────────────────────────────────────────────────────── */
  .dialog-header {
    display: flex;
    align-items: flex-start;
    gap: 0.875rem;
    padding: 1.25rem 1.25rem 0;
  }

  .dialog-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 2.5rem;
    height: 2.5rem;
    flex-shrink: 0;
    border-radius: 0.625rem;
    background: rgba(29, 110, 245, 0.15);
    color: var(--navy-light);
  }

  .dialog-icon svg { width: 1.25rem; height: 1.25rem; }

  .dialog-title {
    font-size: 1rem;
    font-weight: 700;
    line-height: 1.4;
    color: var(--text);
    margin: 0;
  }

  .dialog-description {
    font-size: 0.8rem;
    color: var(--text-muted);
    margin: 0.2rem 0 0;
    line-height: 1.5;
  }

  /* ── DialogBody ───────────────────────────────────────────────────────────── */
  .dialog-body {
    padding: 1rem 1.25rem;
    display: flex;
    flex-direction: column;
    gap: 0;
    flex: 1;
    min-height: 0;
  }

  /* File info card */
  .info-card {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.75rem 0.875rem;
    border-radius: 0.625rem;
    background: rgba(255,255,255,0.04);
    border: 1px solid var(--border);
  }

  .info-card-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 2rem;
    height: 2rem;
    flex-shrink: 0;
    border-radius: 0.5rem;
    background: rgba(255,255,255,0.06);
    color: var(--text-muted);
  }
  .info-card-icon svg { width: 1.1rem; height: 1.1rem; }

  .info-card-body {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }

  .info-card-filename {
    font-size: 0.85rem;
    font-weight: 600;
    color: var(--text);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .info-card-meta {
    font-size: 0.72rem;
    color: var(--text-muted);
    font-variant-numeric: tabular-nums;
  }

  /* Separator */
  .separator {
    height: 1px;
    background: var(--border);
    margin: 0.875rem 0;
  }

  /* Section */
  .section {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .section-header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .section-label {
    font-size: 0.75rem;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--text-muted);
  }

  /* Badge */
  .badge {
    display: inline-flex;
    align-items: center;
    padding: 0.1rem 0.45rem;
    border-radius: 9999px;
    font-size: 0.7rem;
    font-weight: 600;
    background: rgba(29, 110, 245, 0.15);
    color: var(--navy-light);
    border: 1px solid rgba(29, 110, 245, 0.25);
  }

  /* Recipients list */
  .recipients-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
  }

  .recipient-item {
    display: flex;
    align-items: center;
    gap: 0.625rem;
    padding: 0.5rem 0.75rem;
    border-radius: 0.5rem;
    background: rgba(255,255,255,0.03);
    border: 1px solid var(--border);
  }

  /* Avatar + AvatarFallback */
  .avatar {
    position: relative;
    width: 1.75rem;
    height: 1.75rem;
    flex-shrink: 0;
    border-radius: 9999px;
    overflow: hidden;
    background: rgba(29, 110, 245, 0.2);
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .avatar-img {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
    border-radius: 9999px;
  }

  .avatar-fallback {
    font-size: 0.6rem;
    font-weight: 700;
    color: var(--navy-light);
    z-index: 1;
    pointer-events: none;
  }

  .recipient-name {
    flex: 1;
    font-size: 0.85rem;
    font-weight: 500;
    color: var(--text);
    min-width: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .recipient-lock {
    width: 0.875rem;
    height: 0.875rem;
    color: var(--text-dim);
    flex-shrink: 0;
  }

  /* Alert-style callout */
  .callout {
    display: flex;
    align-items: flex-start;
    gap: 0.5rem;
    padding: 0.625rem 0.75rem;
    border-radius: 0.5rem;
    background: rgba(59, 130, 246, 0.08);
    border: 1px solid rgba(59, 130, 246, 0.18);
  }

  .callout-icon {
    width: 1rem;
    height: 1rem;
    flex-shrink: 0;
    margin-top: 0.1rem;
    color: var(--navy-light);
  }

  .callout-text {
    font-size: 0.82rem;
    font-style: italic;
    color: var(--text-muted);
    margin: 0;
    line-height: 1.5;
  }

  /* Security notice */
  .notice {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 0.625rem;
    border-radius: 0.5rem;
    background: rgba(34, 197, 94, 0.06);
    border: 1px solid rgba(34, 197, 94, 0.15);
    margin-top: 0.875rem;
    font-size: 0.72rem;
    color: rgba(134, 239, 172, 0.85);
  }

  .notice svg {
    width: 0.9rem;
    height: 0.9rem;
    flex-shrink: 0;
    color: rgba(134, 239, 172, 0.7);
  }

  /* ── DialogFooter ─────────────────────────────────────────────────────────── */
  .dialog-footer {
    display: flex;
    justify-content: flex-end;
    gap: 0.625rem;
    padding: 0.875rem 1.25rem 1.25rem;
    border-top: 1px solid var(--border);
  }

  /* Inherit global btn classes, scoped overrides only for icon */
  .btn-icon-inline {
    width: 1rem;
    height: 1rem;
    flex-shrink: 0;
  }

  /* Scrollbar for dialog body */
  .dialog-content::-webkit-scrollbar {
    width: 4px;
  }
  .dialog-content::-webkit-scrollbar-track {
    background: transparent;
  }
  .dialog-content::-webkit-scrollbar-thumb {
    background: var(--border-mid);
    border-radius: 9999px;
  }
</style>

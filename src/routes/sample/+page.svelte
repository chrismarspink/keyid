<script lang="ts">
  import EncryptionApprovalDialog from '$lib/components/sample/EncryptionApprovalDialog.svelte';
  import { generateIdenticon } from '$lib/crypto/identicon';

  let open = false;

  const demoRecipients = [
    { name: '김철수', avatarUrl: generateIdenticon('김철수kimcs@example.com') },
    { name: 'Alice Johnson', avatarUrl: generateIdenticon('Alice Johnsonalice@corp.io') },
    { name: '박지영', avatarUrl: generateIdenticon('박지영jy.park@keyid.dev') },
  ];
</script>

<svelte:head><title>샘플 다이얼로그 — KeyID</title></svelte:head>

<div class="flex flex-col items-center justify-center min-h-screen gap-6 px-4">
  <div class="text-center">
    <div class="text-xl font-bold mb-1" style="color:var(--text)">파일 암호화 승인 다이얼로그</div>
    <div class="text-sm" style="color:var(--text-muted)">shadcn/ui Dialog 패턴 · SvelteKit 구현 샘플</div>
  </div>

  <div class="flex gap-3">
    <button class="btn-primary" on:click={() => (open = true)}>
      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
          d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/>
      </svg>
      다이얼로그 열기
    </button>
  </div>

  <div class="panel text-xs" style="max-width:380px;width:100%">
    <div class="font-semibold mb-2" style="color:var(--text)">shadcn/ui 패턴 체크리스트</div>
    <ul class="space-y-1.5" style="color:var(--text-muted)">
      {#each [
        'DialogOverlay + DialogContent 분리',
        'DialogHeader / Title / Description',
        'DialogFooter (actions 우측 정렬)',
        'Avatar + AvatarFallback 패턴',
        'Badge (수신자 수)',
        'Alert callout (메시지)',
        'Separator 컴포넌트',
        'Semantic color tokens (CSS variables)',
        'Focus trap + Escape 닫기',
        'fade + scale 트랜지션',
        'aria-modal, aria-labelledby, aria-describedby',
      ] as item}
        <li class="flex items-center gap-1.5">
          <svg class="w-3.5 h-3.5 flex-shrink-0" style="color:#4ade80" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/>
          </svg>
          {item}
        </li>
      {/each}
    </ul>
  </div>
</div>

<EncryptionApprovalDialog
  bind:open
  filename="Q4_재무보고서_최종.pdf"
  fileSize={2_847_392}
  recipients={demoRecipients}
  message="4분기 결산 자료입니다. 외부 유출 금지."
  on:approve={() => alert('✅ 암호화 승인됨')}
  on:cancel={() => console.log('취소됨')}
/>

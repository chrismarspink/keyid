<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import IDCard from '$components/IDCard.svelte';
  import { loadIdentity, saveIdentity, type IdentityRecord } from '$lib/storage/keystore';
  import { generateKeyPair, exportPrivateKeyPkcs8, exportPublicKeySpki } from '$lib/crypto/keygen';
  import { generateSelfSignedCert } from '$lib/crypto/cert';
  import {
    isWebAuthnPRFSupported,
    sealWithWebAuthn,
    sealWithPassword,
    type ProtectionMethod,
    type SealedKey
  } from '$lib/crypto/protection';

  let identity: IdentityRecord | null = null;
  let loading = true;
  let step: 'check' | 'form' | 'protect' | 'generating' | 'done' = 'check';

  // Form fields
  let form = {
    commonName: '',
    email: '',
    organization: '',
    country: 'KR'
  };

  // Protection
  let protectMethod: ProtectionMethod = 'password';
  let webAuthnAvailable = false;
  let password = '';
  let passwordConfirm = '';
  let backupPassword = '';
  let backupPasswordConfirm = '';
  let formError = '';

  // Toast
  let toastMsg = '';
  let toastType: 'success' | 'error' | 'info' = 'info';
  let toastVisible = false;

  function showToast(msg: string, type: 'success' | 'error' | 'info' = 'info') {
    toastMsg = msg;
    toastType = type;
    toastVisible = true;
    setTimeout(() => (toastVisible = false), 3200);
  }

  onMount(async () => {
    identity = await loadIdentity();
    if (identity) {
      step = 'done';
    } else {
      step = 'form';
    }
    webAuthnAvailable = await isWebAuthnPRFSupported();
    if (webAuthnAvailable) protectMethod = 'webauthn';
    loading = false;
  });

  function validateForm(): boolean {
    if (!form.commonName.trim()) {
      formError = '이름을 입력하세요.';
      return false;
    }
    if (protectMethod === 'password') {
      if (password.length < 8) {
        formError = '비밀번호는 8자 이상이어야 합니다.';
        return false;
      }
      if (password !== passwordConfirm) {
        formError = '비밀번호가 일치하지 않습니다.';
        return false;
      }
    }
    formError = '';
    return true;
  }

  async function createIdentity() {
    if (!validateForm()) return;
    step = 'generating';
    try {
      // 1. Generate key pair
      const keyPair = await generateKeyPair();

      // 2. Self-sign certificate
      const { certDer, fingerprint, notBefore, notAfter, serialNumber } =
        await generateSelfSignedCert(keyPair, {
          commonName: form.commonName.trim(),
          email: form.email.trim(),
          organization: form.organization.trim(),
          country: form.country.trim() || 'KR'
        });

      // 3. Export and seal private key
      const pkcs8 = await exportPrivateKeyPkcs8(keyPair.privateKey);
      let sealedKey: SealedKey;
      let passwordBackup: SealedKey | null = null;
      if (protectMethod === 'webauthn') {
        sealedKey = await sealWithWebAuthn(pkcs8, form.email || form.commonName, form.commonName);
        // Also create a password backup if provided
        if (backupPassword.length >= 8) {
          passwordBackup = await sealWithPassword(pkcs8, backupPassword);
        }
      } else {
        sealedKey = await sealWithPassword(pkcs8, password);
      }

      // 4. Encode cert as base64
      const certB64 = btoa(
        Array.from(new Uint8Array(certDer), (b) => String.fromCharCode(b)).join('')
      );

      // 5. Store identity
      const record: IdentityRecord = {
        id: 'self',
        commonName: form.commonName.trim(),
        email: form.email.trim(),
        organization: form.organization.trim(),
        country: form.country.trim() || 'KR',
        certDer: certB64,
        fingerprint,
        notBefore,
        notAfter,
        serialNumber,
        sealedKey,
        passwordBackup,
        createdAt: new Date().toISOString(),
        avatar: null
      };
      await saveIdentity(record);
      identity = record;
      step = 'done';
      showToast('신원이 생성되었습니다!', 'success');
    } catch (e) {
      console.error(e);
      const msg = e instanceof Error ? e.message : String(e);
      if (
        msg.includes('PRF') ||
        msg.includes('지문') ||
        protectMethod === 'webauthn'
      ) {
        // Fall back to password
        protectMethod = 'password';
        step = 'protect';
        formError = '지문 인증을 사용할 수 없습니다. 비밀번호를 사용하세요.';
      } else {
        formError = `생성 실패: ${msg}`;
        step = 'form';
      }
    }
  }
</script>

<svelte:head>
  <title>KeyID — 디지털 신원</title>
</svelte:head>

{#if loading}
  <div class="flex items-center justify-center min-h-screen">
    <div class="w-8 h-8 rounded-full border-2 border-navy-600 border-t-transparent animate-spin"></div>
  </div>

{:else if step === 'done' && identity}
  <!-- ── Home: show identity card + quick actions ─ -->
  <div class="px-4 pt-6 pb-4 max-w-3xl mx-auto">
    <div class="flex items-center justify-between mb-5">
      <div>
        <h1 class="text-xl font-bold" style="color:var(--text)">내 신원</h1>
        <p class="text-sm" style="color:var(--text-muted)">디지털 서명 인증서</p>
      </div>
      <button on:click={() => goto('/identity')} class="btn-secondary text-sm py-2 px-4">
        자세히 보기
      </button>
    </div>

    <!-- ID Card — full width -->
    <div class="panel flex items-center justify-center mb-4 overflow-hidden" style="padding:0">
      <IDCard
        commonName={identity.commonName}
        email={identity.email}
        organization={identity.organization}
        country={identity.country}
        fingerprint={identity.fingerprint}
        notAfter={identity.notAfter}
        avatar={identity.avatar}
        trustLevel="self"
      />
    </div>

    <!-- 4 action widgets — uniform 2-column grid -->
    <div class="grid grid-cols-2 gap-3">
      <a href="/file/sign" class="panel flex items-center gap-3 cursor-pointer transition-colors"
        style="border-color:transparent"
        onmouseenter="this.style.borderColor='#3b82f6'"
        onmouseleave="this.style.borderColor='transparent'">
        <div class="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
          style="background:rgba(29,110,245,0.15)">
          <svg class="w-5 h-5" style="color:#60a5fa" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/>
          </svg>
        </div>
        <div class="min-w-0">
          <div class="font-semibold text-sm truncate" style="color:var(--text)">파일 서명</div>
          <div class="text-xs mt-0.5 truncate" style="color:var(--text-muted)">디지털 서명 생성</div>
        </div>
      </a>

      <a href="/file/encrypt" class="panel flex items-center gap-3 cursor-pointer transition-colors"
        style="border-color:transparent"
        onmouseenter="this.style.borderColor='#a855f7'"
        onmouseleave="this.style.borderColor='transparent'">
        <div class="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
          style="background:rgba(168,85,247,0.15)">
          <svg class="w-5 h-5" style="color:#c084fc" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/>
          </svg>
        </div>
        <div class="min-w-0">
          <div class="font-semibold text-sm truncate" style="color:var(--text)">파일 암호화</div>
          <div class="text-xs mt-0.5 truncate" style="color:var(--text-muted)">수신자에게 암호화</div>
        </div>
      </a>

      <a href="/contacts" class="panel flex items-center gap-3 cursor-pointer transition-colors"
        style="border-color:transparent"
        onmouseenter="this.style.borderColor='#22c55e'"
        onmouseleave="this.style.borderColor='transparent'">
        <div class="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
          style="background:rgba(34,197,94,0.12)">
          <svg class="w-5 h-5" style="color:#4ade80" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/>
          </svg>
        </div>
        <div class="min-w-0">
          <div class="font-semibold text-sm truncate" style="color:var(--text)">연락처</div>
          <div class="text-xs mt-0.5 truncate" style="color:var(--text-muted)">인증서 관리</div>
        </div>
      </a>

      <a href="/request" class="panel flex items-center gap-3 cursor-pointer transition-colors"
        style="border-color:transparent"
        onmouseenter="this.style.borderColor='#f59e0b'"
        onmouseleave="this.style.borderColor='transparent'">
        <div class="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
          style="background:rgba(245,158,11,0.12)">
          <svg class="w-5 h-5" style="color:#fbbf24" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
          </svg>
        </div>
        <div class="min-w-0">
          <div class="font-semibold text-sm truncate" style="color:var(--text)">서명 요청</div>
          <div class="text-xs mt-0.5 truncate" style="color:var(--text-muted)">요청 처리</div>
        </div>
      </a>
    </div>
  </div>

{:else if step === 'form'}
  <!-- ── Setup Wizard: step 1 ──────────────────── -->
  <div class="flex items-center justify-center min-h-screen px-4 py-10">
    <div class="w-full max-w-md">
      <!-- Hero -->
      <div class="text-center mb-8">
        <div
          class="w-20 h-20 rounded-3xl flex items-center justify-center text-yellow-400 font-bold text-4xl mx-auto mb-4 shadow-card"
          style="background:linear-gradient(135deg,#1a3a6b,#102445)"
        >K</div>
        <h1 class="text-2xl font-bold text-slate-800">KeyID에 오신 것을 환영합니다</h1>
        <p class="text-gray-500 mt-2">나만의 디지털 신원 인증서를 만드세요.</p>
      </div>

      <div class="panel space-y-4">
        <div>
          <label class="label" for="cn">이름 <span class="text-red-400">*</span></label>
          <input
            id="cn"
            class="input"
            type="text"
            placeholder="홍길동"
            bind:value={form.commonName}
            maxlength="64"
          />
        </div>
        <div>
          <label class="label" for="email">이메일</label>
          <input
            id="email"
            class="input"
            type="email"
            placeholder="hong@example.com"
            bind:value={form.email}
          />
        </div>
        <div>
          <label class="label" for="org">소속 / 기관</label>
          <input
            id="org"
            class="input"
            type="text"
            placeholder="회사 또는 개인"
            bind:value={form.organization}
            maxlength="64"
          />
        </div>
        <div>
          <label class="label" for="country">국가 코드</label>
          <input
            id="country"
            class="input"
            type="text"
            placeholder="KR"
            bind:value={form.country}
            maxlength="2"
          />
        </div>

        {#if formError}
          <p class="text-sm text-red-500">{formError}</p>
        {/if}

        <button
          class="btn-primary w-full"
          on:click={() => {
            if (!form.commonName.trim()) { formError = '이름을 입력하세요.'; return; }
            formError = '';
            step = 'protect';
          }}
        >
          다음: 키 보호 방법 선택
        </button>
      </div>
    </div>
  </div>

{:else if step === 'protect'}
  <!-- ── Setup Wizard: step 2 ──────────────────── -->
  <div class="flex items-center justify-center min-h-screen px-4 py-10">
    <div class="w-full max-w-md">
      <div class="text-center mb-6">
        <h2 class="text-xl font-bold text-slate-800">개인 키 보호</h2>
        <p class="text-gray-500 text-sm mt-1">키를 안전하게 암호화합니다</p>
      </div>

      <div class="panel space-y-4">
        <!-- Method picker -->
        <div class="grid grid-cols-2 gap-3">
          {#if webAuthnAvailable}
            <button
              class="flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition text-center"
              class:border-navy-600={protectMethod === 'webauthn'}
              class:bg-navy-50={protectMethod === 'webauthn'}
              class:border-gray-200={protectMethod !== 'webauthn'}
              on:click={() => (protectMethod = 'webauthn')}
            >
              <span class="text-2xl">👆</span>
              <div class="text-sm font-semibold text-slate-700">지문 인증</div>
              <div class="text-xs text-gray-400">생체 인증 사용</div>
            </button>
          {/if}
          <button
            class="flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition text-center"
            class:border-navy-600={protectMethod === 'password'}
            class:bg-navy-50={protectMethod === 'password'}
            class:border-gray-200={protectMethod !== 'password'}
            class:col-span-2={!webAuthnAvailable}
            on:click={() => (protectMethod = 'password')}
          >
            <span class="text-2xl">🔑</span>
            <div class="text-sm font-semibold text-slate-700">비밀번호</div>
            <div class="text-xs text-gray-400">비밀번호로 보호</div>
          </button>
        </div>

        {#if protectMethod === 'password'}
          <div>
            <label class="label" for="pw">비밀번호 <span class="text-red-400">*</span></label>
            <input
              id="pw"
              class="input"
              type="password"
              placeholder="8자 이상"
              bind:value={password}
            />
          </div>
          <div>
            <label class="label" for="pw2">비밀번호 확인</label>
            <input
              id="pw2"
              class="input"
              type="password"
              placeholder="동일한 비밀번호 입력"
              bind:value={passwordConfirm}
            />
          </div>
        {:else}
          <div class="bg-blue-50 rounded-xl p-4 text-sm text-blue-700">
            <strong>지문 인증</strong>을 사용하면 기기의 생체 인식 센서로 개인 키를 보호합니다.
            다음 단계에서 지문 등록을 요청합니다.
          </div>
          <!-- Optional backup password -->
          <div class="border-t border-gray-100 pt-4">
            <p class="text-xs text-gray-500 mb-3">비밀번호 백업 (선택사항) — 지문을 사용할 수 없을 때 대안으로 사용</p>
            <div class="space-y-3">
              <input
                class="input text-sm"
                type="password"
                placeholder="백업 비밀번호 (8자 이상, 선택)"
                bind:value={backupPassword}
              />
              {#if backupPassword.length > 0}
                <input
                  class="input text-sm"
                  type="password"
                  placeholder="백업 비밀번호 확인"
                  bind:value={backupPasswordConfirm}
                />
              {/if}
            </div>
          </div>
        {/if}

        {#if formError}
          <p class="text-sm text-red-500">{formError}</p>
        {/if}

        <div class="flex gap-3">
          <button
            class="btn-secondary flex-1"
            on:click={() => { step = 'form'; formError = ''; }}
          >이전</button>
          <button
            class="btn-primary flex-1"
            on:click={createIdentity}
          >
            신원 생성
          </button>
        </div>
      </div>
    </div>
  </div>

{:else if step === 'generating'}
  <div class="flex flex-col items-center justify-center min-h-screen gap-4">
    <div class="w-12 h-12 rounded-full border-4 border-navy-600 border-t-transparent animate-spin"></div>
    <p class="text-gray-600 font-medium">인증서를 생성하는 중…</p>
    <p class="text-sm text-gray-400">
      {protectMethod === 'webauthn' ? '지문 인증을 완료해 주세요.' : '잠시 기다려 주세요.'}
    </p>
  </div>
{/if}

<!-- Toast -->
{#if toastVisible}
  <div class="toast toast-{toastType}" role="alert">{toastMsg}</div>
{/if}

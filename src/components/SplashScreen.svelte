<script lang="ts">
  import { onMount, createEventDispatcher } from 'svelte';

  const dispatch = createEventDispatcher<{ done: void }>();

  let visible = true;
  let fading = false;

  onMount(() => {
    // Hold for 1.8s then fade out over 0.5s
    const hold = setTimeout(() => {
      fading = true;
      const fade = setTimeout(() => {
        visible = false;
        dispatch('done');
      }, 500);
      return () => clearTimeout(fade);
    }, 1800);
    return () => clearTimeout(hold);
  });
</script>

{#if visible}
  <div
    class="splash"
    class:splash-fade={fading}
    aria-hidden="true"
  >
    <svg
      width="100%"
      viewBox="0 0 400 220"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      class="splash-svg"
    >
      <defs>
        <!-- Curved path for text -->
        <path
          id="keyidArc"
          d="M 60,150 C 110,60 290,60 340,150"
        />

        <!-- Glow filter -->
        <filter id="splashGlow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="3" result="blur"/>
          <feMerge>
            <feMergeNode in="blur"/>
            <feMergeNode in="SourceGraphic"/>
          </feMerge>
        </filter>

        <!-- Stronger glow for the arc line -->
        <filter id="lineGlow" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="5" result="blur"/>
          <feMerge>
            <feMergeNode in="blur"/>
            <feMergeNode in="SourceGraphic"/>
          </feMerge>
        </filter>

        <!-- Radial gradient for background K badge -->
        <radialGradient id="kGrad" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stop-color="#1d4ed8" stop-opacity="0.4"/>
          <stop offset="100%" stop-color="#1d6ef5" stop-opacity="0"/>
        </radialGradient>
      </defs>

      <!-- Background glow halo behind K -->
      <ellipse cx="200" cy="105" rx="55" ry="55" fill="url(#kGrad)" />

      <!-- Dashed arc line -->
      <path
        d="M 60,150 C 110,60 290,60 340,150"
        stroke="#1d6ef5"
        stroke-width="1"
        stroke-linecap="round"
        stroke-dasharray="4 6"
        opacity="0.5"
        filter="url(#lineGlow)"
      />

      <!-- Dot markers on arc ends -->
      <circle cx="60" cy="150" r="3" fill="#1d6ef5" opacity="0.6" filter="url(#splashGlow)"/>
      <circle cx="340" cy="150" r="3" fill="#1d6ef5" opacity="0.6" filter="url(#splashGlow)"/>

      <!-- K E Y I D text following arc -->
      <text
        font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
        font-size="36"
        font-weight="700"
        letter-spacing="16"
        filter="url(#splashGlow)"
      >
        <textPath
          href="#keyidArc"
          startOffset="50%"
          text-anchor="middle"
          fill="#e2e8f0"
        >KEY·ID</textPath>
      </text>

      <!-- Blue dot accent on the · -->
      <text
        font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
        font-size="36"
        font-weight="700"
        letter-spacing="16"
        filter="url(#splashGlow)"
      >
        <textPath
          href="#keyidArc"
          startOffset="50%"
          text-anchor="middle"
          fill="#1d6ef5"
        >···</textPath>
      </text>

      <!-- Tagline -->
      <text
        x="200"
        y="178"
        font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
        font-size="11"
        font-weight="400"
        letter-spacing="5"
        fill="#4b82c4"
        text-anchor="middle"
        opacity="0.9"
      >디지털 신원 인증</text>

      <!-- Bottom separator line -->
      <line x1="155" y1="188" x2="245" y2="188" stroke="#1d6ef5" stroke-width="0.5" opacity="0.3"/>

      <!-- Version / tagline bottom -->
      <text
        x="200"
        y="202"
        font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
        font-size="9"
        letter-spacing="2"
        fill="#4b5563"
        text-anchor="middle"
      >ZERO-SERVER PKI</text>
    </svg>

    <!-- Loading dots -->
    <div class="splash-dots">
      <span style="animation-delay:0s"></span>
      <span style="animation-delay:0.2s"></span>
      <span style="animation-delay:0.4s"></span>
    </div>
  </div>
{/if}

<style>
  .splash {
    position: fixed;
    inset: 0;
    z-index: 9999;
    background: #141926;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    opacity: 1;
    transition: opacity 0.5s ease-out;
  }

  .splash-fade {
    opacity: 0;
  }

  .splash-svg {
    width: min(380px, 90vw);
    animation: splashIn 0.6s cubic-bezier(0.16, 1, 0.3, 1) both;
  }

  .splash-dots {
    display: flex;
    gap: 6px;
    margin-top: 8px;
    animation: splashIn 0.6s 0.3s cubic-bezier(0.16, 1, 0.3, 1) both;
  }

  .splash-dots span {
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: #1d6ef5;
    animation: dotPulse 1.2s ease-in-out infinite;
    opacity: 0.4;
  }

  @keyframes splashIn {
    from { opacity: 0; transform: translateY(12px) scale(0.96); }
    to   { opacity: 1; transform: translateY(0)    scale(1);    }
  }

  @keyframes dotPulse {
    0%, 100% { opacity: 0.2; transform: scale(0.8); }
    50%       { opacity: 1;   transform: scale(1.2); }
  }
</style>

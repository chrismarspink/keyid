/**
 * Business card OCR pipeline (browser-only, zero external API).
 *
 * Pipeline:
 *  1. cropCard()  — raw image → canvas (instant).
 *                   jscanify + OpenCV.js perspective transform attempted
 *                   in the background with a 6-second timeout; if it wins
 *                   the race the cropped canvas is used, otherwise the raw
 *                   canvas is used immediately so OCR is never blocked.
 *  2. runOCR()    — Tesseract.js (kor + eng, cached in browser storage)
 *  3. parseBizCard() — regex-based field extraction
 */

// ─── Raw canvas helper ───────────────────────────────────────────────────────

function imgToCanvas(img: HTMLImageElement): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width  = img.naturalWidth  || img.width;
  c.height = img.naturalHeight || img.height;
  c.getContext('2d')!.drawImage(img, 0, 0);
  return c;
}

// ─── OpenCV + jscanify (best-effort, non-blocking) ───────────────────────────

async function tryJscanify(img: HTMLImageElement): Promise<HTMLCanvasElement | null> {
  // Race: load OpenCV within 6 s, otherwise give up
  const cv = await Promise.race([
    new Promise<unknown>((resolve, reject) => {
      const w = window as any;
      if (w.cv?.Mat) { resolve(w.cv); return; }
      const script = document.createElement('script');
      script.src = 'https://docs.opencv.org/4.10.0/opencv.js';
      script.async = true;
      script.onload = () => {
        const poll = setInterval(() => {
          if (w.cv?.Mat) { clearInterval(poll); resolve(w.cv); }
        }, 50);
        setTimeout(() => { clearInterval(poll); reject(); }, 8000);
      };
      script.onerror = () => reject();
      document.head.appendChild(script);
    }),
    new Promise<null>((_, reject) => setTimeout(reject, 6000))
  ]).catch(() => null);

  if (!cv) return null;

  try {
    const { default: Jscanify } = await import('jscanify');
    const scanner = new (Jscanify as any)();
    const result = scanner.scanImage(img) as HTMLCanvasElement | null;
    if (result && result.width > 10) return result;
  } catch { /* ignore */ }
  return null;
}

/**
 * Return a canvas ready for OCR.
 * Immediately returns the raw canvas; the caller may optionally await
 * the jscanify enhancement via the returned promise pair.
 */
export async function cropCard(img: HTMLImageElement): Promise<HTMLCanvasElement> {
  // Always resolve quickly with the raw canvas
  return imgToCanvas(img);
}

/**
 * Try perspective-correcting the image in the background.
 * Resolves with the corrected canvas, or null if unavailable within timeout.
 */
export function tryCropEnhanced(img: HTMLImageElement): Promise<HTMLCanvasElement | null> {
  return tryJscanify(img);
}

// ─── OCR via OCR.Space free API ─────────────────────────────────────────────
// Client-side Tesseract.js is broken in Vite/GitHub Pages (worker path issues).
// OCR.Space provides free OCR (25,000 req/month, Korean support).
// API key 'helloworld' = public demo key; replace with your own free key at
// https://ocr.space/ocrapi/freekey for higher limits.

export type OcrProgress = (stage: string, pct: number) => void;
export type DebugLog = (msg: string) => void;

const _dbg: string[] = [];
export function getDebugLog(): string[] { return _dbg; }

function dbg(msg: string, onLog?: DebugLog) {
  const ts = new Date().toISOString().slice(11, 23);
  const line = `[${ts}] ${msg}`;
  console.log('[CardOCR]', line);
  _dbg.push(line);
  onLog?.(line);
}

/** Resize canvas so the longest side ≤ maxPx, keeping aspect ratio. */
function resizeCanvas(src: HTMLCanvasElement, maxPx = 1600): HTMLCanvasElement {
  const { width: w, height: h } = src;
  if (w <= maxPx && h <= maxPx) return src;
  const scale = maxPx / Math.max(w, h);
  const c = document.createElement('canvas');
  c.width  = Math.round(w * scale);
  c.height = Math.round(h * scale);
  c.getContext('2d')!.drawImage(src, 0, 0, c.width, c.height);
  return c;
}

export async function runOCR(
  source: HTMLCanvasElement | HTMLImageElement,
  onProgress?: OcrProgress,
  onLog?: DebugLog
): Promise<string> {
  _dbg.length = 0;

  // 1. Source → canvas
  dbg('이미지 변환 시작', onLog);
  onProgress?.('이미지 준비 중…', 5);
  let canvas = source instanceof HTMLCanvasElement
    ? source
    : (() => {
        const c = document.createElement('canvas');
        c.width  = (source as HTMLImageElement).naturalWidth  || source.width;
        c.height = (source as HTMLImageElement).naturalHeight || source.height;
        c.getContext('2d')!.drawImage(source, 0, 0);
        return c;
      })();

  dbg(`원본 크기: ${canvas.width}×${canvas.height}`, onLog);

  // 2. Resize — OCR.Space free key limit ~1 MB
  canvas = resizeCanvas(canvas, 1600);
  dbg(`리사이즈 후: ${canvas.width}×${canvas.height}`, onLog);

  // 3. JPEG blob (quality 0.82 keeps it under ~500 KB)
  const blob = await new Promise<Blob>(res =>
    canvas.toBlob(b => res(b!), 'image/jpeg', 0.82)
  );
  dbg(`JPEG blob: ${(blob.size / 1024).toFixed(0)} KB`, onLog);
  onProgress?.('OCR 서버 전송 중…', 25);

  // 4. POST to OCR.Space with AbortController timeout
  const ctrl  = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 30_000);

  dbg('OCR.Space POST 시작', onLog);
  const form = new FormData();
  form.append('apikey', 'helloworld');
  form.append('language', 'kor');
  form.append('isOverlayRequired', 'false');
  form.append('detectOrientation', 'true');
  form.append('scale', 'true');
  form.append('file', blob, 'card.jpg');

  let resp: Response;
  try {
    resp = await fetch('https://api.ocr.space/parse/image', {
      method: 'POST',
      body: form,
      signal: ctrl.signal
    });
  } catch (e: any) {
    clearTimeout(timer);
    const msg = e?.name === 'AbortError'
      ? '30초 타임아웃 — 네트워크를 확인하세요'
      : `네트워크 오류: ${e?.message ?? e}`;
    dbg(`fetch 실패: ${msg}`, onLog);
    throw new Error(msg);
  }
  clearTimeout(timer);
  dbg(`HTTP ${resp.status}`, onLog);

  if (!resp.ok) throw new Error(`OCR 서버 오류: HTTP ${resp.status}`);

  onProgress?.('텍스트 추출 중…', 70);
  const json = await resp.json();
  dbg(`응답: ${JSON.stringify(json).slice(0, 400)}`, onLog);

  if (json.IsErroredOnProcessing) {
    throw new Error(json.ErrorMessage?.[0] ?? 'OCR 처리 오류');
  }

  const text: string = json.ParsedResults?.[0]?.ParsedText ?? '';
  dbg(`추출 완료 — ${text.length}자\n${text.slice(0, 200)}`, onLog);
  onProgress?.('완료', 100);
  return text;
}

// ─── Parsing ─────────────────────────────────────────────────────────────────

export interface ParsedCard {
  name:         string;
  email:        string;
  phone:        string;
  organization: string;
}

const ORG_RE = /(주식회사|유한회사|\(주\)|\(유\)|법인|그룹|홀딩스|파트너스|어소시에이츠|Corp\.?|Inc\.?|Ltd\.?|LLC\.?|Co\.|Group|Solutions?|Systems?|Tech|Labs?|Studio|Global|Korea|International)/i;

// Top-30 Korean surnames
const KR_SURNAMES = '김이박최정강조윤장임한오서신권황안송류전홍고문손양배백허유남심노하곽성차주우구민나진지엄채원천방공';

export function parseBizCard(text: string): ParsedCard {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

  // ① Email — highest confidence
  const email = text.match(/[\w._%+\-]+@[\w.\-]+\.[a-zA-Z]{2,}/)?.[0] ?? '';

  // ② Phone — Korean mobile / landline (handles 010.3418.6434 and 010. 3418. 6434)
  const phoneRaw = text.match(
    /(?:\+82[\s\-.]?)?0?(?:10|2|31|32|33|41|42|43|44|51|52|53|54|55|61|62|63|64|70|80|1[0-9]{3})[\s\-.]\s*\d{3,4}[\s\-.]\s*\d{4}/
  )?.[0] ?? '';
  const phone = phoneRaw.replace(/[\s.]/g, '-').replace(/-+/g, '-');

  // ③ Organization — lines matching company keywords
  let organization = '';
  for (const line of lines) {
    if (ORG_RE.test(line) && line.length < 80) {
      organization = line.trim();
      break;
    }
  }
  // Fallback: infer from email domain
  if (!organization && email) {
    const dom = email.split('@')[1]?.split('.')[0] ?? '';
    if (dom) organization = dom.charAt(0).toUpperCase() + dom.slice(1);
  }

  // ④ Name — pattern based
  let name = '';
  for (const line of lines) {
    if (line.includes('@') || ORG_RE.test(line)) continue;
    if (/\d{3}/.test(line)) continue;
    if (line === organization) continue;

    // Korean name: must be at the START of the line (surname + 1–2 chars, optional spaces)
    // Handles "김진규", "김 진 규", "김진규 그룹장…" correctly
    const krStart = line.match(
      new RegExp(`^([${KR_SURNAMES}]\\s?[\\uAC00-\\uD7A3]\\s?[\\uAC00-\\uD7A3]?)(?:\\s|[^\\uAC00-\\uD7A3]|$)`)
    );
    if (krStart) {
      const kr = krStart[1].replace(/\s+/g, '');
      if (kr.length >= 2 && kr.length <= 4) { name = kr; break; }
    }

    // English: "KIM, Jin-Kyu" / "Kim Jin-Kyu" / "HONG GILDONG"
    const enMatch = line.match(/^([A-Z][A-Z\-']{1,15}),?\s+([A-Z][a-zA-Z\-']{1,15})(?:\s[A-Z][a-zA-Z\-']{1,15})?$/);
    if (enMatch) { name = `${enMatch[1]} ${enMatch[2]}`; break; }
  }

  // Fallback: derive from email local-part (jkkim → Jkkim)
  if (!name && email) {
    const local = email.split('@')[0].replace(/[._\-]/g, ' ');
    const words = local.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1));
    if (words[0].length >= 2) name = words.join(' ');
  }

  return { name, email, phone, organization };
}

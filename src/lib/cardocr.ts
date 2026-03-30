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

// ─── OCR (Tesseract.js loaded from CDN to avoid Vite worker-path issues) ────

/** Load Tesseract.js v5 UMD bundle from CDN (sets window.Tesseract). */
let _tessReady: Promise<any> | null = null;

function loadTesseract(): Promise<any> {
  if (_tessReady) return _tessReady;
  _tessReady = new Promise((resolve, reject) => {
    const w = window as any;
    if (w.Tesseract?.createWorker) { resolve(w.Tesseract); return; }
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
    script.onload = () =>
      w.Tesseract?.createWorker
        ? resolve(w.Tesseract)
        : reject(new Error('Tesseract 초기화 실패'));
    script.onerror = () => reject(new Error('Tesseract CDN 로드 실패'));
    document.head.appendChild(script);
  });
  return _tessReady;
}

export type OcrProgress = (stage: string, pct: number) => void;
export type DebugLog = (msg: string) => void;

// ── 디버그 로그 (화면 + 콘솔 동시 출력) ─────────────────────────────────────
const _dbg: string[] = [];
export function getDebugLog(): string[] { return _dbg; }

function dbg(msg: string, onLog?: DebugLog) {
  const ts = new Date().toISOString().slice(11, 23); // HH:mm:ss.mmm
  const line = `[${ts}] ${msg}`;
  console.log('[CardOCR]', line);
  _dbg.push(line);
  onLog?.(line);
}

export async function runOCR(
  source: HTMLCanvasElement | HTMLImageElement,
  onProgress?: OcrProgress,
  onLog?: DebugLog
): Promise<string> {
  _dbg.length = 0; // reset

  dbg('loadTesseract() 시작', onLog);
  onProgress?.('OCR 엔진 로드 중…', 3);

  const Tesseract = await loadTesseract();
  dbg(`Tesseract 로드 완료 — version: ${Tesseract.version ?? '?'}`, onLog);
  dbg(`createWorker('eng', 1, ...) 호출`, onLog);
  onProgress?.('언어 팩 다운로드 중… (최초 1회 ~4MB)', 8);

  const workerPromise = Tesseract.createWorker('eng', 1, {
    logger: (m: any) => {
      const raw = JSON.stringify(m);
      dbg(`logger: ${raw}`, onLog);               // ← 모든 메시지 기록

      const p: number = m.progress ?? 0;
      const s: string = (m.status ?? '') as string;
      if (s.includes('load')) {
        onProgress?.(`언어 팩 다운로드 중… ${Math.round(p * 100)}%`, 8 + Math.round(p * 42));
      } else if (s.includes('init')) {
        onProgress?.(`엔진 초기화 중… ${Math.round(p * 100)}%`, 50 + Math.round(p * 10));
      } else if (s.includes('recogniz')) {
        onProgress?.('텍스트 인식 중…', 60 + Math.round(p * 35));
      }
    }
  });

  // 30-second timeout (reduced from 90 so we fail fast for debugging)
  const worker = await Promise.race([
    workerPromise.then((w: any) => { dbg('createWorker() 완료', onLog); return w; }),
    new Promise<never>((_, reject) =>
      setTimeout(() => {
        dbg('⚠ createWorker 30초 타임아웃', onLog);
        reject(new Error('시간 초과 (30s) — 아래 디버그 로그를 확인하세요'));
      }, 30_000)
    )
  ]);

  dbg(`worker.recognize() 시작 — source: ${source.width}×${(source as any).height}`, onLog);
  onProgress?.('텍스트 인식 중…', 60);
  const { data: { text } } = await worker.recognize(source);
  dbg(`recognize() 완료 — 텍스트 ${text.length}자`, onLog);
  await worker.terminate();
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

  // ② Phone — Korean mobile / landline / international
  const phoneRaw = text.match(
    /(?:\+82[\s\-]?)?0?(?:10|2|31|32|33|41|42|43|44|51|52|53|54|55|61|62|63|64|70|80|1[0-9]{3})[\s\-]?\d{3,4}[\s\-]?\d{4}/
  )?.[0] ?? '';
  const phone = phoneRaw.replace(/\s/g, '-');

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

  // ④ Name — position + pattern based
  let name = '';
  for (const line of lines) {
    if (line.includes('@') || ORG_RE.test(line)) continue;
    if (/\d{3}/.test(line)) continue;                          // skip digit-heavy lines
    if (line === organization) continue;

    // Korean: 2–5 chars starting with a known surname
    if (/^[\uAC00-\uD7A3]{2,5}$/.test(line) && KR_SURNAMES.includes(line[0])) {
      name = line; break;
    }
    const krInLine = line.match(new RegExp(`[${KR_SURNAMES}][\uAC00-\uD7A3]{1,4}`));
    if (krInLine?.[0] && krInLine[0].length <= 5) { name = krInLine[0]; break; }

    // English: 2–3 capitalized words
    const enMatch = line.match(/^[A-Z][a-zA-Z\-']{1,20}(?:\s[A-Z][a-zA-Z\-']{1,20}){1,2}$/);
    if (enMatch) { name = enMatch[0]; break; }
  }

  // Fallback: derive from email local-part (e.g. jkim → J Kim, gildong.hong → Gildong Hong)
  if (!name && email) {
    const local = email.split('@')[0].replace(/[._\-]/g, ' ');
    const words = local.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1));
    if (words.length >= 1 && words[0].length >= 2) name = words.join(' ');
  }

  return { name, email, phone, organization };
}
